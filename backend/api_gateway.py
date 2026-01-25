"""
API Gateway - Sprint 733

API gateway with routing and middleware.

Features:
- Route registration
- Middleware chain
- Request/response transformation
- Rate limiting
- Authentication
- Load balancing
"""

import asyncio
import time
import hashlib
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, Awaitable, TypeVar, Union
)
from enum import Enum
import threading
import re
from abc import ABC, abstractmethod


class HttpMethod(str, Enum):
    """HTTP methods."""
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
    HEAD = "HEAD"
    OPTIONS = "OPTIONS"


@dataclass
class Request:
    """Gateway request."""
    method: str
    path: str
    headers: Dict[str, str] = field(default_factory=dict)
    query: Dict[str, str] = field(default_factory=dict)
    body: Any = None
    client_ip: str = ""
    context: Dict[str, Any] = field(default_factory=dict)

    def header(self, name: str, default: str = "") -> str:
        """Get header value (case-insensitive)."""
        for key, value in self.headers.items():
            if key.lower() == name.lower():
                return value
        return default


@dataclass
class Response:
    """Gateway response."""
    status: int = 200
    body: Any = None
    headers: Dict[str, str] = field(default_factory=dict)

    @classmethod
    def ok(cls, body: Any = None, headers: Optional[Dict] = None) -> "Response":
        """Create 200 OK response."""
        return cls(status=200, body=body, headers=headers or {})

    @classmethod
    def created(cls, body: Any = None) -> "Response":
        """Create 201 Created response."""
        return cls(status=201, body=body)

    @classmethod
    def bad_request(cls, message: str = "Bad Request") -> "Response":
        """Create 400 response."""
        return cls(status=400, body={"error": message})

    @classmethod
    def unauthorized(cls, message: str = "Unauthorized") -> "Response":
        """Create 401 response."""
        return cls(status=401, body={"error": message})

    @classmethod
    def forbidden(cls, message: str = "Forbidden") -> "Response":
        """Create 403 response."""
        return cls(status=403, body={"error": message})

    @classmethod
    def not_found(cls, message: str = "Not Found") -> "Response":
        """Create 404 response."""
        return cls(status=404, body={"error": message})

    @classmethod
    def rate_limited(cls, retry_after: int = 60) -> "Response":
        """Create 429 response."""
        return cls(
            status=429,
            body={"error": "Too Many Requests"},
            headers={"Retry-After": str(retry_after)}
        )

    @classmethod
    def server_error(cls, message: str = "Internal Server Error") -> "Response":
        """Create 500 response."""
        return cls(status=500, body={"error": message})


# Handler type
Handler = Callable[[Request], Awaitable[Response]]


@dataclass
class Route:
    """Route definition."""
    method: str
    pattern: str
    handler: Handler
    name: str = ""
    middleware: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    _regex: Optional[re.Pattern] = field(default=None, repr=False)

    def __post_init__(self):
        """Compile pattern to regex."""
        # Convert path params like {id} to regex groups
        regex_pattern = re.sub(r"\{(\w+)\}", r"(?P<\1>[^/]+)", self.pattern)
        self._regex = re.compile(f"^{regex_pattern}$")

    def match(self, method: str, path: str) -> Optional[Dict[str, str]]:
        """Match request to route."""
        if method != self.method and self.method != "*":
            return None

        match = self._regex.match(path)
        if match:
            return match.groupdict()
        return None


class Middleware(ABC):
    """Base middleware class."""

    @abstractmethod
    async def process(
        self,
        request: Request,
        next_handler: Handler,
    ) -> Response:
        """Process request through middleware."""
        pass


class LoggingMiddleware(Middleware):
    """Request logging middleware."""

    def __init__(self, log_func: Optional[Callable] = None):
        """Initialize with optional log function."""
        self.log = log_func or print

    async def process(self, request: Request, next_handler: Handler) -> Response:
        """Log request and response."""
        start = time.time()
        self.log(f"→ {request.method} {request.path}")

        response = await next_handler(request)

        duration = (time.time() - start) * 1000
        self.log(f"← {response.status} ({duration:.1f}ms)")

        return response


class AuthMiddleware(Middleware):
    """Authentication middleware."""

    def __init__(
        self,
        validator: Callable[[str], Optional[Dict]],
        exclude_paths: Optional[List[str]] = None,
    ):
        """Initialize with token validator."""
        self.validator = validator
        self.exclude_paths = exclude_paths or []

    async def process(self, request: Request, next_handler: Handler) -> Response:
        """Validate authentication."""
        # Skip excluded paths
        for path in self.exclude_paths:
            if request.path.startswith(path):
                return await next_handler(request)

        # Get token
        auth_header = request.header("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return Response.unauthorized("Missing or invalid token")

        token = auth_header[7:]
        user_info = self.validator(token)

        if not user_info:
            return Response.unauthorized("Invalid token")

        # Add user to context
        request.context["user"] = user_info
        return await next_handler(request)


class RateLimitMiddleware(Middleware):
    """Rate limiting middleware."""

    def __init__(
        self,
        requests_per_minute: int = 60,
        by: str = "ip",  # ip or token
    ):
        """Initialize rate limiter."""
        self.limit = requests_per_minute
        self.by = by
        self._requests: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

    async def process(self, request: Request, next_handler: Handler) -> Response:
        """Check rate limit."""
        # Determine key
        if self.by == "token":
            auth = request.header("Authorization")
            key = hashlib.sha256(auth.encode()).hexdigest()[:16] if auth else request.client_ip
        else:
            key = request.client_ip

        # Check limit
        now = time.time()
        with self._lock:
            if key not in self._requests:
                self._requests[key] = []

            # Clean old entries
            self._requests[key] = [t for t in self._requests[key] if now - t < 60]

            if len(self._requests[key]) >= self.limit:
                return Response.rate_limited()

            self._requests[key].append(now)

        return await next_handler(request)


class CorsMiddleware(Middleware):
    """CORS middleware."""

    def __init__(
        self,
        allow_origins: List[str] = None,
        allow_methods: List[str] = None,
        allow_headers: List[str] = None,
        max_age: int = 86400,
    ):
        """Initialize CORS settings."""
        self.allow_origins = allow_origins or ["*"]
        self.allow_methods = allow_methods or ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
        self.allow_headers = allow_headers or ["*"]
        self.max_age = max_age

    async def process(self, request: Request, next_handler: Handler) -> Response:
        """Add CORS headers."""
        origin = request.header("Origin", "*")

        # Handle preflight
        if request.method == "OPTIONS":
            response = Response.ok()
        else:
            response = await next_handler(request)

        # Add CORS headers
        if "*" in self.allow_origins or origin in self.allow_origins:
            response.headers["Access-Control-Allow-Origin"] = origin

        response.headers["Access-Control-Allow-Methods"] = ", ".join(self.allow_methods)
        response.headers["Access-Control-Allow-Headers"] = ", ".join(self.allow_headers)
        response.headers["Access-Control-Max-Age"] = str(self.max_age)

        return response


class CompressionMiddleware(Middleware):
    """Response compression middleware."""

    def __init__(self, min_size: int = 1024):
        """Initialize with minimum size for compression."""
        self.min_size = min_size

    async def process(self, request: Request, next_handler: Handler) -> Response:
        """Compress response if applicable."""
        accept_encoding = request.header("Accept-Encoding", "")
        response = await next_handler(request)

        # Only compress large text responses
        if response.body and isinstance(response.body, (str, dict)):
            import json
            body_str = json.dumps(response.body) if isinstance(response.body, dict) else response.body

            if len(body_str) >= self.min_size and "gzip" in accept_encoding:
                import gzip
                compressed = gzip.compress(body_str.encode())
                response.body = compressed
                response.headers["Content-Encoding"] = "gzip"

        return response


class APIGateway:
    """API Gateway.

    Usage:
        gateway = APIGateway()

        # Add middleware
        gateway.use("logging", LoggingMiddleware())
        gateway.use("auth", AuthMiddleware(validate_token))
        gateway.use("rate_limit", RateLimitMiddleware(100))

        # Register routes
        @gateway.route("GET", "/users")
        async def get_users(request):
            return Response.ok({"users": []})

        @gateway.route("POST", "/users")
        async def create_user(request):
            return Response.created({"id": "new-user"})

        # Handle request
        response = await gateway.handle(request)
    """

    def __init__(self):
        """Initialize gateway."""
        self._routes: List[Route] = []
        self._middleware: Dict[str, Middleware] = {}
        self._middleware_order: List[str] = []
        self._global_middleware: List[str] = []
        self._not_found_handler: Optional[Handler] = None
        self._error_handler: Optional[Callable[[Exception], Response]] = None

    def use(self, name: str, middleware: Middleware, global_use: bool = True) -> "APIGateway":
        """Register middleware.

        Args:
            name: Middleware name
            middleware: Middleware instance
            global_use: Apply to all routes

        Returns:
            Self for chaining
        """
        self._middleware[name] = middleware
        self._middleware_order.append(name)

        if global_use:
            self._global_middleware.append(name)

        return self

    def route(
        self,
        method: str,
        path: str,
        name: str = "",
        middleware: Optional[List[str]] = None,
    ) -> Callable:
        """Route decorator.

        Args:
            method: HTTP method
            path: Route path
            name: Route name
            middleware: Route-specific middleware

        Returns:
            Decorator function
        """
        def decorator(handler: Handler) -> Handler:
            route = Route(
                method=method.upper(),
                pattern=path,
                handler=handler,
                name=name or handler.__name__,
                middleware=middleware or [],
            )
            self._routes.append(route)
            return handler
        return decorator

    def get(self, path: str, **kwargs) -> Callable:
        """GET route decorator."""
        return self.route("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> Callable:
        """POST route decorator."""
        return self.route("POST", path, **kwargs)

    def put(self, path: str, **kwargs) -> Callable:
        """PUT route decorator."""
        return self.route("PUT", path, **kwargs)

    def delete(self, path: str, **kwargs) -> Callable:
        """DELETE route decorator."""
        return self.route("DELETE", path, **kwargs)

    def on_not_found(self, handler: Handler) -> Handler:
        """Set not found handler."""
        self._not_found_handler = handler
        return handler

    def on_error(self, handler: Callable[[Exception], Response]) -> Callable:
        """Set error handler."""
        self._error_handler = handler
        return handler

    async def handle(self, request: Request) -> Response:
        """Handle incoming request.

        Args:
            request: Incoming request

        Returns:
            Response
        """
        try:
            # Find matching route
            route, params = self._match_route(request.method, request.path)

            if not route:
                if self._not_found_handler:
                    return await self._not_found_handler(request)
                return Response.not_found()

            # Add params to context
            request.context["params"] = params

            # Build middleware chain
            middleware_names = self._global_middleware + route.middleware
            handler = self._build_handler_chain(route.handler, middleware_names)

            return await handler(request)

        except Exception as e:
            if self._error_handler:
                return self._error_handler(e)
            return Response.server_error(str(e))

    def _match_route(
        self,
        method: str,
        path: str,
    ) -> tuple[Optional[Route], Dict[str, str]]:
        """Match request to route."""
        for route in self._routes:
            params = route.match(method, path)
            if params is not None:
                return route, params
        return None, {}

    def _build_handler_chain(
        self,
        final_handler: Handler,
        middleware_names: List[str],
    ) -> Handler:
        """Build middleware chain."""
        handler = final_handler

        # Build chain in reverse order
        for name in reversed(middleware_names):
            middleware = self._middleware.get(name)
            if middleware:
                current_handler = handler

                async def create_wrapper(mw: Middleware, h: Handler):
                    return await mw.process

                handler = self._create_middleware_wrapper(middleware, current_handler)

        return handler

    def _create_middleware_wrapper(
        self,
        middleware: Middleware,
        next_handler: Handler,
    ) -> Handler:
        """Create middleware wrapper."""
        async def wrapper(request: Request) -> Response:
            return await middleware.process(request, next_handler)
        return wrapper

    def get_routes(self) -> List[Dict]:
        """Get all registered routes."""
        return [
            {
                "method": r.method,
                "path": r.pattern,
                "name": r.name,
                "middleware": r.middleware,
            }
            for r in self._routes
        ]


class RouteGroup:
    """Route group for prefix-based routing.

    Usage:
        api = RouteGroup(gateway, "/api/v1")

        @api.get("/users")  # Becomes /api/v1/users
        async def get_users(request):
            return Response.ok()
    """

    def __init__(
        self,
        gateway: APIGateway,
        prefix: str,
        middleware: Optional[List[str]] = None,
    ):
        """Initialize route group."""
        self._gateway = gateway
        self._prefix = prefix.rstrip("/")
        self._middleware = middleware or []

    def route(self, method: str, path: str, **kwargs) -> Callable:
        """Route decorator with prefix."""
        full_path = f"{self._prefix}{path}"
        mw = self._middleware + kwargs.pop("middleware", [])
        return self._gateway.route(method, full_path, middleware=mw, **kwargs)

    def get(self, path: str, **kwargs) -> Callable:
        return self.route("GET", path, **kwargs)

    def post(self, path: str, **kwargs) -> Callable:
        return self.route("POST", path, **kwargs)

    def put(self, path: str, **kwargs) -> Callable:
        return self.route("PUT", path, **kwargs)

    def delete(self, path: str, **kwargs) -> Callable:
        return self.route("DELETE", path, **kwargs)


# Singleton instance
gateway = APIGateway()


# Convenience exports
def create_gateway() -> APIGateway:
    """Create a new gateway instance."""
    return APIGateway()


def create_route_group(gw: APIGateway, prefix: str) -> RouteGroup:
    """Create a route group."""
    return RouteGroup(gw, prefix)
