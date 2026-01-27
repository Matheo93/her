"""
Request Context - Sprint 777

Request context management system.

Features:
- Request-scoped context
- Context propagation
- Async context support
- Middleware integration
- Context variables
- Cleanup handlers
"""

import asyncio
import contextvars
import time
import uuid
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Union, ContextManager
)
from contextlib import contextmanager, asynccontextmanager
from abc import ABC, abstractmethod
import logging

logger = logging.getLogger(__name__)


T = TypeVar("T")


@dataclass
class RequestInfo:
    """Request information."""
    id: str
    method: str
    path: str
    started_at: float
    client_ip: Optional[str] = None
    user_agent: Optional[str] = None
    headers: Dict[str, str] = field(default_factory=dict)
    query_params: Dict[str, Any] = field(default_factory=dict)

    @property
    def duration_ms(self) -> float:
        return (time.time() - self.started_at) * 1000


@dataclass
class UserInfo:
    """User information."""
    id: str
    username: Optional[str] = None
    email: Optional[str] = None
    roles: List[str] = field(default_factory=list)
    permissions: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def has_role(self, role: str) -> bool:
        return role in self.roles

    def has_permission(self, permission: str) -> bool:
        return permission in self.permissions

    def has_any_role(self, *roles: str) -> bool:
        return any(r in self.roles for r in roles)

    def has_all_permissions(self, *permissions: str) -> bool:
        return all(p in self.permissions for p in permissions)


class ContextVar(Generic[T]):
    """Typed context variable wrapper."""

    def __init__(self, name: str, default: Optional[T] = None):
        self._var: contextvars.ContextVar[Optional[T]] = contextvars.ContextVar(
            name, default=default
        )
        self._name = name

    def get(self, default: Optional[T] = None) -> Optional[T]:
        """Get current value."""
        value = self._var.get()
        if value is None and default is not None:
            return default
        return value

    def set(self, value: T) -> contextvars.Token:
        """Set value and return token for reset."""
        return self._var.set(value)

    def reset(self, token: contextvars.Token) -> None:
        """Reset to previous value."""
        self._var.reset(token)

    @contextmanager
    def scope(self, value: T):
        """Context manager for scoped value."""
        token = self.set(value)
        try:
            yield value
        finally:
            self.reset(token)


# Global context variables
_request_var: ContextVar[Optional[RequestInfo]] = ContextVar("request")
_user_var: ContextVar[Optional[UserInfo]] = ContextVar("user")
_trace_id_var: ContextVar[Optional[str]] = ContextVar("trace_id")
_span_id_var: ContextVar[Optional[str]] = ContextVar("span_id")
_extras_var: ContextVar[Dict[str, Any]] = ContextVar("extras", default={})


class RequestContext:
    """Request-scoped context manager.

    Usage:
        # In middleware
        async with RequestContext.create(request) as ctx:
            ctx.set_user(user)
            response = await handler(request)

        # Anywhere in request handling
        ctx = RequestContext.current()
        user = ctx.user
        request_id = ctx.request_id
    """

    def __init__(
        self,
        request: Optional[RequestInfo] = None,
        user: Optional[UserInfo] = None,
        trace_id: Optional[str] = None,
    ):
        self._request = request
        self._user = user
        self._trace_id = trace_id or str(uuid.uuid4())[:8]
        self._span_id = str(uuid.uuid4())[:8]
        self._extras: Dict[str, Any] = {}
        self._cleanup_handlers: List[Callable[[], Awaitable[None]]] = []
        self._tokens: List[contextvars.Token] = []

    @classmethod
    def create(
        cls,
        method: str = "GET",
        path: str = "/",
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        query_params: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
    ) -> "RequestContext":
        """Create a new request context."""
        request = RequestInfo(
            id=str(uuid.uuid4()),
            method=method.upper(),
            path=path,
            started_at=time.time(),
            client_ip=client_ip,
            user_agent=user_agent,
            headers=headers or {},
            query_params=query_params or {},
        )
        return cls(request=request, trace_id=trace_id)

    @classmethod
    def current(cls) -> "RequestContext":
        """Get current request context."""
        request = _request_var.get()
        user = _user_var.get()
        trace_id = _trace_id_var.get()

        ctx = cls(request=request, user=user, trace_id=trace_id)
        ctx._extras = _extras_var.get() or {}
        return ctx

    @property
    def request(self) -> Optional[RequestInfo]:
        return self._request

    @property
    def user(self) -> Optional[UserInfo]:
        return self._user

    @property
    def request_id(self) -> Optional[str]:
        return self._request.id if self._request else None

    @property
    def trace_id(self) -> str:
        return self._trace_id

    @property
    def span_id(self) -> str:
        return self._span_id

    @property
    def user_id(self) -> Optional[str]:
        return self._user.id if self._user else None

    @property
    def is_authenticated(self) -> bool:
        return self._user is not None

    def set_user(self, user: UserInfo) -> None:
        """Set current user."""
        self._user = user
        _user_var.set(user)

    def clear_user(self) -> None:
        """Clear current user."""
        self._user = None
        _user_var.set(None)

    def get(self, key: str, default: Any = None) -> Any:
        """Get extra context value."""
        return self._extras.get(key, default)

    def set(self, key: str, value: Any) -> None:
        """Set extra context value."""
        self._extras[key] = value
        _extras_var.set(self._extras)

    def update(self, values: Dict[str, Any]) -> None:
        """Update multiple extra values."""
        self._extras.update(values)
        _extras_var.set(self._extras)

    def add_cleanup(self, handler: Callable[[], Awaitable[None]]) -> None:
        """Add cleanup handler to run on context exit."""
        self._cleanup_handlers.append(handler)

    def to_dict(self) -> dict:
        """Export context as dict."""
        return {
            "request_id": self.request_id,
            "trace_id": self._trace_id,
            "span_id": self._span_id,
            "user_id": self.user_id,
            "method": self._request.method if self._request else None,
            "path": self._request.path if self._request else None,
            "duration_ms": self._request.duration_ms if self._request else None,
            "extras": self._extras,
        }

    def __enter__(self) -> "RequestContext":
        self._tokens.append(_request_var.set(self._request))
        self._tokens.append(_user_var.set(self._user))
        self._tokens.append(_trace_id_var.set(self._trace_id))
        self._tokens.append(_span_id_var.set(self._span_id))
        self._tokens.append(_extras_var.set(self._extras))
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        for token in reversed(self._tokens):
            try:
                token.var.reset(token)
            except Exception:
                pass
        self._tokens.clear()
        return False

    async def __aenter__(self) -> "RequestContext":
        return self.__enter__()

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        # Run cleanup handlers
        for handler in self._cleanup_handlers:
            try:
                await handler()
            except Exception as e:
                logger.error("Cleanup handler error: " + str(e))

        self.__exit__(exc_type, exc_val, exc_tb)
        return False


class ContextPropagator:
    """Propagate context across async boundaries."""

    @staticmethod
    def capture() -> Dict[str, Any]:
        """Capture current context for propagation."""
        return {
            "request": _request_var.get(),
            "user": _user_var.get(),
            "trace_id": _trace_id_var.get(),
            "span_id": _span_id_var.get(),
            "extras": (_extras_var.get() or {}).copy(),
        }

    @staticmethod
    @contextmanager
    def restore(captured: Dict[str, Any]):
        """Restore captured context."""
        tokens = []
        try:
            if captured.get("request"):
                tokens.append(_request_var.set(captured["request"]))
            if captured.get("user"):
                tokens.append(_user_var.set(captured["user"]))
            if captured.get("trace_id"):
                tokens.append(_trace_id_var.set(captured["trace_id"]))
            if captured.get("span_id"):
                tokens.append(_span_id_var.set(captured["span_id"]))
            if captured.get("extras"):
                tokens.append(_extras_var.set(captured["extras"]))
            yield
        finally:
            for token in reversed(tokens):
                try:
                    token.var.reset(token)
                except Exception:
                    pass

    @staticmethod
    def wrap_callback(callback: Callable[..., T]) -> Callable[..., T]:
        """Wrap callback to preserve context."""
        captured = ContextPropagator.capture()

        def wrapped(*args, **kwargs):
            with ContextPropagator.restore(captured):
                return callback(*args, **kwargs)

        return wrapped

    @staticmethod
    def wrap_async(coro_func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        """Wrap async function to preserve context."""
        captured = ContextPropagator.capture()

        async def wrapped(*args, **kwargs):
            with ContextPropagator.restore(captured):
                return await coro_func(*args, **kwargs)

        return wrapped


class Span:
    """Trace span for distributed tracing."""

    def __init__(
        self,
        name: str,
        parent_span_id: Optional[str] = None,
    ):
        self.name = name
        self.id = str(uuid.uuid4())[:8]
        self.parent_id = parent_span_id or _span_id_var.get()
        self.trace_id = _trace_id_var.get() or str(uuid.uuid4())[:8]
        self.started_at = time.time()
        self.finished_at: Optional[float] = None
        self.tags: Dict[str, str] = {}
        self.logs: List[Dict[str, Any]] = []
        self._token: Optional[contextvars.Token] = None

    @property
    def duration_ms(self) -> float:
        end = self.finished_at or time.time()
        return (end - self.started_at) * 1000

    def set_tag(self, key: str, value: str) -> "Span":
        self.tags[key] = value
        return self

    def log(self, event: str, **fields: Any) -> "Span":
        self.logs.append({
            "timestamp": time.time(),
            "event": event,
            **fields,
        })
        return self

    def finish(self) -> None:
        self.finished_at = time.time()
        if self._token:
            _span_id_var.reset(self._token)

    def __enter__(self) -> "Span":
        self._token = _span_id_var.set(self.id)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.set_tag("error", "true")
            self.log("error", error_type=str(exc_type), message=str(exc_val))
        self.finish()
        return False

    async def __aenter__(self) -> "Span":
        return self.__enter__()

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return self.__exit__(exc_type, exc_val, exc_tb)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "id": self.id,
            "trace_id": self.trace_id,
            "parent_id": self.parent_id,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "duration_ms": round(self.duration_ms, 2),
            "tags": self.tags,
            "logs": self.logs,
        }


class ContextMiddleware:
    """Base middleware for context management."""

    def __init__(
        self,
        extract_user: Optional[Callable[[Any], Awaitable[Optional[UserInfo]]]] = None,
        extract_trace_id: Optional[Callable[[Any], Optional[str]]] = None,
    ):
        self._extract_user = extract_user
        self._extract_trace_id = extract_trace_id

    async def __call__(self, request: Any, call_next: Callable) -> Any:
        """Process request with context."""
        # Extract trace ID from headers
        trace_id = None
        if self._extract_trace_id:
            trace_id = self._extract_trace_id(request)

        # Create context
        ctx = RequestContext.create(
            method=getattr(request, "method", "GET"),
            path=str(getattr(request, "url", {}).path if hasattr(request, "url") else "/"),
            client_ip=getattr(getattr(request, "client", None), "host", None),
            user_agent=request.headers.get("user-agent") if hasattr(request, "headers") else None,
            headers=dict(request.headers) if hasattr(request, "headers") else {},
            query_params=dict(request.query_params) if hasattr(request, "query_params") else {},
            trace_id=trace_id,
        )

        async with ctx:
            # Extract user if available
            if self._extract_user:
                try:
                    user = await self._extract_user(request)
                    if user:
                        ctx.set_user(user)
                except Exception as e:
                    logger.warning("Failed to extract user: " + str(e))

            response = await call_next(request)

            # Add trace headers to response
            if hasattr(response, "headers"):
                response.headers["X-Request-ID"] = ctx.request_id or ""
                response.headers["X-Trace-ID"] = ctx.trace_id

            return response


# Convenience functions
def get_request() -> Optional[RequestInfo]:
    """Get current request info."""
    return _request_var.get()


def get_user() -> Optional[UserInfo]:
    """Get current user info."""
    return _user_var.get()


def get_trace_id() -> Optional[str]:
    """Get current trace ID."""
    return _trace_id_var.get()


def get_request_id() -> Optional[str]:
    """Get current request ID."""
    request = _request_var.get()
    return request.id if request else None


def require_user() -> UserInfo:
    """Get current user or raise."""
    user = _user_var.get()
    if not user:
        raise ValueError("No authenticated user in context")
    return user


def require_permission(permission: str) -> UserInfo:
    """Require user has permission."""
    user = require_user()
    if not user.has_permission(permission):
        raise PermissionError("Missing permission: " + permission)
    return user


def require_role(role: str) -> UserInfo:
    """Require user has role."""
    user = require_user()
    if not user.has_role(role):
        raise PermissionError("Missing role: " + role)
    return user


@contextmanager
def span(name: str, **tags: str):
    """Create a trace span context."""
    s = Span(name)
    for key, value in tags.items():
        s.set_tag(key, value)
    with s:
        yield s


@asynccontextmanager
async def async_span(name: str, **tags: str):
    """Create an async trace span context."""
    s = Span(name)
    for key, value in tags.items():
        s.set_tag(key, value)
    async with s:
        yield s


# Thread-local storage for non-async contexts
class ThreadLocalContext:
    """Thread-local context for sync code."""

    _local = threading.local()

    @classmethod
    def get(cls) -> Optional[Dict[str, Any]]:
        return getattr(cls._local, "context", None)

    @classmethod
    def set(cls, context: Dict[str, Any]) -> None:
        cls._local.context = context

    @classmethod
    def clear(cls) -> None:
        cls._local.context = None

    @classmethod
    @contextmanager
    def scope(cls, context: Dict[str, Any]):
        previous = cls.get()
        cls.set(context)
        try:
            yield
        finally:
            if previous:
                cls.set(previous)
            else:
                cls.clear()
