"""
Middleware Manager - Sprint 679

Request/response middleware pipeline.

Features:
- Middleware registration
- Priority ordering
- Before/after hooks
- Error handling
- Async support
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Callable, Awaitable, TypeVar
from enum import Enum
import threading
from functools import wraps


class MiddlewarePhase(str, Enum):
    """Middleware execution phase."""
    BEFORE = "before"  # Before handler
    AFTER = "after"  # After handler
    ERROR = "error"  # On error


@dataclass
class MiddlewareContext:
    """Context passed through middleware chain."""
    request: Any
    response: Optional[Any] = None
    error: Optional[Exception] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    start_time: float = field(default_factory=time.time)
    completed: bool = False


@dataclass
class MiddlewareInfo:
    """Middleware registration info."""
    name: str
    handler: Callable
    phase: MiddlewarePhase
    priority: int = 100  # Lower = earlier
    enabled: bool = True
    async_handler: bool = False


class MiddlewareManager:
    """Request/response middleware pipeline.

    Usage:
        manager = MiddlewareManager()

        # Register before middleware
        @manager.before(priority=10)
        async def auth_middleware(ctx):
            ctx.metadata["user"] = await verify_token(ctx.request.token)

        # Register after middleware
        @manager.after()
        async def logging_middleware(ctx):
            duration = time.time() - ctx.start_time
            log.info(f"Request took {duration}s")

        # Register error handler
        @manager.error()
        async def error_middleware(ctx):
            log.error(f"Error: {ctx.error}")

        # Execute pipeline
        ctx = MiddlewareContext(request=request)
        ctx = await manager.execute(ctx, handler)

        # Or use as decorator
        @manager.wrap
        async def handle_request(request):
            return process(request)
    """

    def __init__(self):
        """Initialize middleware manager."""
        self._middlewares: List[MiddlewareInfo] = []
        self._lock = threading.Lock()
        self._stats = {
            "total_executions": 0,
            "successful": 0,
            "failed": 0,
        }

    def register(
        self,
        name: str,
        handler: Callable,
        phase: MiddlewarePhase = MiddlewarePhase.BEFORE,
        priority: int = 100,
    ) -> MiddlewareInfo:
        """Register middleware.

        Args:
            name: Middleware name
            handler: Middleware function
            phase: Execution phase
            priority: Execution priority (lower = earlier)

        Returns:
            Middleware info
        """
        is_async = asyncio.iscoroutinefunction(handler)

        info = MiddlewareInfo(
            name=name,
            handler=handler,
            phase=phase,
            priority=priority,
            async_handler=is_async,
        )

        with self._lock:
            self._middlewares.append(info)
            self._middlewares.sort(key=lambda m: (m.phase.value, m.priority))

        return info

    def before(
        self,
        name: Optional[str] = None,
        priority: int = 100,
    ) -> Callable:
        """Decorator for before-phase middleware."""
        def decorator(func: Callable) -> Callable:
            middleware_name = name or func.__name__
            self.register(middleware_name, func, MiddlewarePhase.BEFORE, priority)
            return func
        return decorator

    def after(
        self,
        name: Optional[str] = None,
        priority: int = 100,
    ) -> Callable:
        """Decorator for after-phase middleware."""
        def decorator(func: Callable) -> Callable:
            middleware_name = name or func.__name__
            self.register(middleware_name, func, MiddlewarePhase.AFTER, priority)
            return func
        return decorator

    def error(
        self,
        name: Optional[str] = None,
        priority: int = 100,
    ) -> Callable:
        """Decorator for error-phase middleware."""
        def decorator(func: Callable) -> Callable:
            middleware_name = name or func.__name__
            self.register(middleware_name, func, MiddlewarePhase.ERROR, priority)
            return func
        return decorator

    def unregister(self, name: str) -> bool:
        """Unregister middleware by name."""
        with self._lock:
            before_len = len(self._middlewares)
            self._middlewares = [m for m in self._middlewares if m.name != name]
            return len(self._middlewares) < before_len

    def enable(self, name: str) -> bool:
        """Enable middleware."""
        for m in self._middlewares:
            if m.name == name:
                m.enabled = True
                return True
        return False

    def disable(self, name: str) -> bool:
        """Disable middleware."""
        for m in self._middlewares:
            if m.name == name:
                m.enabled = False
                return True
        return False

    def get_middlewares(
        self,
        phase: Optional[MiddlewarePhase] = None,
    ) -> List[MiddlewareInfo]:
        """Get registered middlewares."""
        middlewares = self._middlewares
        if phase:
            middlewares = [m for m in middlewares if m.phase == phase]
        return middlewares

    async def execute(
        self,
        ctx: MiddlewareContext,
        handler: Optional[Callable] = None,
    ) -> MiddlewareContext:
        """Execute middleware pipeline.

        Args:
            ctx: Middleware context
            handler: Main request handler

        Returns:
            Updated context
        """
        self._stats["total_executions"] += 1

        try:
            # Before phase
            for middleware in self._get_phase(MiddlewarePhase.BEFORE):
                if not middleware.enabled:
                    continue
                try:
                    if middleware.async_handler:
                        result = await middleware.handler(ctx)
                    else:
                        result = middleware.handler(ctx)
                    if result is False:
                        # Middleware signaled to stop
                        return ctx
                except Exception as e:
                    ctx.error = e
                    return await self._handle_error(ctx)

            # Main handler
            if handler:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        ctx.response = await handler(ctx.request)
                    else:
                        ctx.response = handler(ctx.request)
                except Exception as e:
                    ctx.error = e
                    return await self._handle_error(ctx)

            # After phase
            for middleware in self._get_phase(MiddlewarePhase.AFTER):
                if not middleware.enabled:
                    continue
                try:
                    if middleware.async_handler:
                        await middleware.handler(ctx)
                    else:
                        middleware.handler(ctx)
                except Exception as e:
                    ctx.error = e
                    return await self._handle_error(ctx)

            ctx.completed = True
            self._stats["successful"] += 1
            return ctx

        except Exception as e:
            ctx.error = e
            self._stats["failed"] += 1
            return await self._handle_error(ctx)

    async def _handle_error(self, ctx: MiddlewareContext) -> MiddlewareContext:
        """Execute error phase."""
        self._stats["failed"] += 1

        for middleware in self._get_phase(MiddlewarePhase.ERROR):
            if not middleware.enabled:
                continue
            try:
                if middleware.async_handler:
                    await middleware.handler(ctx)
                else:
                    middleware.handler(ctx)
            except Exception:
                # Ignore errors in error handlers
                pass

        return ctx

    def _get_phase(self, phase: MiddlewarePhase) -> List[MiddlewareInfo]:
        """Get middlewares for phase, sorted by priority."""
        return [m for m in self._middlewares if m.phase == phase]

    def execute_sync(
        self,
        ctx: MiddlewareContext,
        handler: Optional[Callable] = None,
    ) -> MiddlewareContext:
        """Synchronous execute."""
        self._stats["total_executions"] += 1

        try:
            # Before phase
            for middleware in self._get_phase(MiddlewarePhase.BEFORE):
                if not middleware.enabled:
                    continue
                try:
                    result = middleware.handler(ctx)
                    if result is False:
                        return ctx
                except Exception as e:
                    ctx.error = e
                    return self._handle_error_sync(ctx)

            # Main handler
            if handler:
                try:
                    ctx.response = handler(ctx.request)
                except Exception as e:
                    ctx.error = e
                    return self._handle_error_sync(ctx)

            # After phase
            for middleware in self._get_phase(MiddlewarePhase.AFTER):
                if not middleware.enabled:
                    continue
                try:
                    middleware.handler(ctx)
                except Exception as e:
                    ctx.error = e
                    return self._handle_error_sync(ctx)

            ctx.completed = True
            self._stats["successful"] += 1
            return ctx

        except Exception as e:
            ctx.error = e
            return self._handle_error_sync(ctx)

    def _handle_error_sync(self, ctx: MiddlewareContext) -> MiddlewareContext:
        """Synchronous error handling."""
        self._stats["failed"] += 1

        for middleware in self._get_phase(MiddlewarePhase.ERROR):
            if not middleware.enabled:
                continue
            try:
                middleware.handler(ctx)
            except Exception:
                pass

        return ctx

    def wrap(self, func: Callable) -> Callable:
        """Decorator to wrap function with middleware."""
        if asyncio.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(request: Any) -> Any:
                ctx = MiddlewareContext(request=request)
                ctx = await self.execute(ctx, func)
                if ctx.error:
                    raise ctx.error
                return ctx.response
            return async_wrapper
        else:
            @wraps(func)
            def sync_wrapper(request: Any) -> Any:
                ctx = MiddlewareContext(request=request)
                ctx = self.execute_sync(ctx, func)
                if ctx.error:
                    raise ctx.error
                return ctx.response
            return sync_wrapper

    def get_stats(self) -> dict:
        """Get execution statistics."""
        return {
            **self._stats,
            "registered_middlewares": len(self._middlewares),
            "enabled_middlewares": sum(1 for m in self._middlewares if m.enabled),
        }

    def list_middlewares(self) -> List[dict]:
        """List all registered middlewares."""
        return [
            {
                "name": m.name,
                "phase": m.phase.value,
                "priority": m.priority,
                "enabled": m.enabled,
                "async": m.async_handler,
            }
            for m in self._middlewares
        ]


class MiddlewareBuilder:
    """Fluent builder for common middleware patterns.

    Usage:
        builder = MiddlewareBuilder(manager)

        # Add timing middleware
        builder.add_timing()

        # Add logging
        builder.add_logging(logger)

        # Add auth
        builder.add_auth(verify_func)

        # Chain multiple
        builder.add_timing().add_logging().add_auth()
    """

    def __init__(self, manager: MiddlewareManager):
        """Initialize builder."""
        self._manager = manager

    def add_timing(self, name: str = "timing") -> "MiddlewareBuilder":
        """Add request timing middleware."""
        @self._manager.before(name=f"{name}_start", priority=1)
        def start_timing(ctx: MiddlewareContext):
            ctx.metadata["timing_start"] = time.time()

        @self._manager.after(name=f"{name}_end", priority=999)
        def end_timing(ctx: MiddlewareContext):
            start = ctx.metadata.get("timing_start", ctx.start_time)
            ctx.metadata["duration"] = time.time() - start

        return self

    def add_request_id(self, name: str = "request_id") -> "MiddlewareBuilder":
        """Add request ID middleware."""
        import uuid

        @self._manager.before(name=name, priority=5)
        def add_request_id(ctx: MiddlewareContext):
            ctx.metadata["request_id"] = str(uuid.uuid4())

        return self

    def add_cors(
        self,
        allowed_origins: List[str] = ["*"],
        name: str = "cors",
    ) -> "MiddlewareBuilder":
        """Add CORS middleware."""
        @self._manager.after(name=name, priority=10)
        def cors(ctx: MiddlewareContext):
            ctx.metadata["cors"] = {
                "Access-Control-Allow-Origin": ", ".join(allowed_origins),
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
            }

        return self

    def add_rate_limit(
        self,
        limit: int = 100,
        window: int = 60,
        name: str = "rate_limit",
    ) -> "MiddlewareBuilder":
        """Add rate limiting middleware."""
        counters: Dict[str, List[float]] = {}

        @self._manager.before(name=name, priority=20)
        def rate_limit(ctx: MiddlewareContext):
            # Get client identifier
            client_id = ctx.metadata.get("client_id", "default")
            now = time.time()

            if client_id not in counters:
                counters[client_id] = []

            # Clean old entries
            counters[client_id] = [t for t in counters[client_id] if now - t < window]

            if len(counters[client_id]) >= limit:
                raise RateLimitError(f"Rate limit exceeded: {limit} requests per {window}s")

            counters[client_id].append(now)

        return self

    def add_validator(
        self,
        validate_func: Callable[[Any], bool],
        name: str = "validator",
    ) -> "MiddlewareBuilder":
        """Add request validation middleware."""
        @self._manager.before(name=name, priority=30)
        def validate(ctx: MiddlewareContext):
            if not validate_func(ctx.request):
                raise ValidationError("Request validation failed")

        return self


class RateLimitError(Exception):
    """Raised when rate limit exceeded."""
    pass


class ValidationError(Exception):
    """Raised when validation fails."""
    pass


# Singleton instance
middleware_manager = MiddlewareManager()
