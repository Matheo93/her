"""
Query Bus - Sprint 687

CQRS query handling pattern.

Features:
- Query registration
- Handler resolution
- Caching support
- Async handlers
- Query validation
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import (
    Dict, Any, Optional, Callable, TypeVar, Type, Generic,
    List, Awaitable, Union
)
from abc import ABC, abstractmethod
import threading
from functools import wraps
import hashlib
import json


# Type variables
TQuery = TypeVar("TQuery", bound="Query")
TResult = TypeVar("TResult")


@dataclass
class Query(ABC):
    """Base query class.

    All queries should inherit from this.

    Usage:
        @dataclass
        class GetUserQuery(Query):
            user_id: str

        @dataclass
        class SearchUsersQuery(Query):
            query: str
            limit: int = 10
    """

    def cache_key(self) -> str:
        """Generate cache key from query data."""
        data = {k: v for k, v in self.__dict__.items() if not k.startswith("_")}
        return hashlib.md5(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()


@dataclass
class QueryResult(Generic[TResult]):
    """Query execution result."""
    success: bool
    data: Optional[TResult] = None
    error: Optional[str] = None
    execution_time: float = 0.0
    cached: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


class QueryHandler(ABC, Generic[TQuery, TResult]):
    """Base query handler.

    Usage:
        class GetUserHandler(QueryHandler[GetUserQuery, User]):
            async def handle(self, query: GetUserQuery) -> User:
                return await user_repository.find_by_id(query.user_id)
    """

    @abstractmethod
    async def handle(self, query: TQuery) -> TResult:
        """Handle the query."""
        pass


class QueryMiddleware(ABC):
    """Query middleware base class."""

    @abstractmethod
    async def execute(
        self,
        query: Query,
        next_handler: Callable[[Query], Awaitable[Any]],
    ) -> Any:
        """Execute middleware."""
        pass


class QueryBus:
    """Query bus for CQRS pattern.

    Usage:
        bus = QueryBus()

        # Register handler class
        bus.register(GetUserQuery, GetUserHandler)

        # Register handler function
        @bus.handler(SearchUsersQuery)
        async def search_users(query: SearchUsersQuery):
            return await user_service.search(query.query, query.limit)

        # Add middleware
        bus.use(CachingMiddleware(cache))
        bus.use(LoggingMiddleware())

        # Execute query
        result = await bus.query(GetUserQuery(user_id="123"))
    """

    def __init__(self):
        """Initialize query bus."""
        self._handlers: Dict[Type[Query], Callable] = {}
        self._middlewares: List[QueryMiddleware] = []
        self._lock = threading.Lock()
        self._stats = {
            "total_queries": 0,
            "successful": 0,
            "failed": 0,
            "cache_hits": 0,
        }

    def register(
        self,
        query_type: Type[TQuery],
        handler: Union[Type[QueryHandler], Callable],
    ) -> "QueryBus":
        """Register query handler.

        Args:
            query_type: Query class
            handler: Handler class or function

        Returns:
            Self for chaining
        """
        if isinstance(handler, type) and issubclass(handler, QueryHandler):
            handler_instance = handler()
            handler_func = handler_instance.handle
        else:
            handler_func = handler

        with self._lock:
            self._handlers[query_type] = handler_func

        return self

    def handler(
        self,
        query_type: Type[TQuery],
    ) -> Callable:
        """Decorator for registering handler function.

        Usage:
            @bus.handler(MyQuery)
            async def handle_my_query(query: MyQuery):
                return result
        """
        def decorator(func: Callable) -> Callable:
            self.register(query_type, func)
            return func
        return decorator

    def use(self, middleware: QueryMiddleware) -> "QueryBus":
        """Add middleware.

        Args:
            middleware: Middleware instance

        Returns:
            Self for chaining
        """
        self._middlewares.append(middleware)
        return self

    async def query(
        self,
        query: TQuery,
    ) -> QueryResult:
        """Execute query.

        Args:
            query: Query to execute

        Returns:
            Query result
        """
        start_time = time.time()
        self._stats["total_queries"] += 1

        query_type = type(query)
        handler = self._handlers.get(query_type)

        if not handler:
            self._stats["failed"] += 1
            return QueryResult(
                success=False,
                error=f"No handler registered for {query_type.__name__}",
                execution_time=time.time() - start_time,
            )

        try:
            # Build middleware chain
            async def final_handler(q: Query) -> Any:
                if asyncio.iscoroutinefunction(handler):
                    return await handler(q)
                return handler(q)

            chain = final_handler
            for middleware in reversed(self._middlewares):
                chain = self._wrap_middleware(middleware, chain)

            # Execute
            result = await chain(query)

            self._stats["successful"] += 1
            return QueryResult(
                success=True,
                data=result,
                execution_time=time.time() - start_time,
            )

        except Exception as e:
            self._stats["failed"] += 1
            return QueryResult(
                success=False,
                error=str(e),
                execution_time=time.time() - start_time,
            )

    def _wrap_middleware(
        self,
        middleware: QueryMiddleware,
        next_handler: Callable,
    ) -> Callable:
        """Wrap middleware around handler."""
        async def wrapper(query: Query) -> Any:
            return await middleware.execute(query, next_handler)
        return wrapper

    async def query_many(
        self,
        queries: List[Query],
    ) -> List[QueryResult]:
        """Execute multiple queries in parallel.

        Args:
            queries: List of queries

        Returns:
            List of results
        """
        tasks = [self.query(q) for q in queries]
        return await asyncio.gather(*tasks)

    def query_sync(self, query: TQuery) -> QueryResult:
        """Synchronous query."""
        return asyncio.run(self.query(query))

    def get_handler(self, query_type: Type[Query]) -> Optional[Callable]:
        """Get handler for query type."""
        return self._handlers.get(query_type)

    def has_handler(self, query_type: Type[Query]) -> bool:
        """Check if handler exists."""
        return query_type in self._handlers

    def record_cache_hit(self):
        """Record a cache hit."""
        self._stats["cache_hits"] += 1

    def get_stats(self) -> dict:
        """Get execution statistics."""
        total = self._stats["total_queries"]
        cache_hits = self._stats["cache_hits"]

        return {
            **self._stats,
            "registered_handlers": len(self._handlers),
            "middlewares": len(self._middlewares),
            "cache_hit_rate": (cache_hits / total * 100) if total > 0 else 0,
        }

    def list_queries(self) -> List[str]:
        """List registered query types."""
        return [q.__name__ for q in self._handlers.keys()]


class CachingMiddleware(QueryMiddleware):
    """Middleware for caching query results."""

    def __init__(
        self,
        cache: Optional[Dict[str, Any]] = None,
        ttl: int = 300,
        query_bus: Optional[QueryBus] = None,
    ):
        self._cache = cache if cache is not None else {}
        self._ttl = ttl
        self._query_bus = query_bus

    async def execute(
        self,
        query: Query,
        next_handler: Callable[[Query], Awaitable[Any]],
    ) -> Any:
        cache_key = f"query:{type(query).__name__}:{query.cache_key()}"

        # Check cache
        if cache_key in self._cache:
            entry = self._cache[cache_key]
            if time.time() - entry["time"] < self._ttl:
                if self._query_bus:
                    self._query_bus.record_cache_hit()
                return entry["data"]

        # Execute and cache
        result = await next_handler(query)
        self._cache[cache_key] = {"data": result, "time": time.time()}
        return result

    def invalidate(self, query_type: Optional[Type[Query]] = None):
        """Invalidate cache entries."""
        if query_type is None:
            self._cache.clear()
        else:
            prefix = f"query:{query_type.__name__}:"
            keys_to_delete = [k for k in self._cache.keys() if k.startswith(prefix)]
            for key in keys_to_delete:
                del self._cache[key]


class LoggingMiddleware(QueryMiddleware):
    """Middleware for logging queries."""

    def __init__(self, logger: Optional[Callable[[str], None]] = None):
        self.logger = logger or print

    async def execute(
        self,
        query: Query,
        next_handler: Callable[[Query], Awaitable[Any]],
    ) -> Any:
        query_name = type(query).__name__
        self.logger(f"[Query] Executing: {query_name}")
        start = time.time()

        try:
            result = await next_handler(query)
            duration = time.time() - start
            self.logger(f"[Query] Completed: {query_name} ({duration:.3f}s)")
            return result
        except Exception as e:
            duration = time.time() - start
            self.logger(f"[Query] Failed: {query_name} ({duration:.3f}s) - {e}")
            raise


class ValidationMiddleware(QueryMiddleware):
    """Middleware for query validation."""

    def __init__(self, validators: Optional[Dict[Type[Query], Callable]] = None):
        self.validators = validators or {}

    def add_validator(
        self,
        query_type: Type[Query],
        validator: Callable[[Query], Optional[str]],
    ):
        """Add validator for query type."""
        self.validators[query_type] = validator

    async def execute(
        self,
        query: Query,
        next_handler: Callable[[Query], Awaitable[Any]],
    ) -> Any:
        query_type = type(query)
        validator = self.validators.get(query_type)

        if validator:
            error = validator(query)
            if error:
                raise QueryValidationError(error)

        return await next_handler(query)


class TimeoutMiddleware(QueryMiddleware):
    """Middleware for query timeout."""

    def __init__(self, timeout: float = 10.0):
        self.timeout = timeout

    async def execute(
        self,
        query: Query,
        next_handler: Callable[[Query], Awaitable[Any]],
    ) -> Any:
        try:
            return await asyncio.wait_for(
                next_handler(query),
                timeout=self.timeout,
            )
        except asyncio.TimeoutError:
            raise QueryTimeoutError(
                f"Query {type(query).__name__} timed out after {self.timeout}s"
            )


class QueryValidationError(Exception):
    """Raised when query validation fails."""
    pass


class QueryTimeoutError(Exception):
    """Raised when query times out."""
    pass


# Singleton instance
query_bus = QueryBus()


# Convenience decorators
def query_handler(query_type: Type[TQuery]) -> Callable:
    """Decorator to register handler on global bus.

    Usage:
        @query_handler(GetUserQuery)
        async def get_user(query: GetUserQuery):
            return await user_repository.find(query.user_id)
    """
    return query_bus.handler(query_type)


# Helper function
async def query(q: Query) -> QueryResult:
    """Query global bus."""
    return await query_bus.query(q)
