"""
Connection Pool - Sprint 769

Connection pooling system for resources.

Features:
- Async connection pool
- Connection lifecycle
- Health checks
- Size limits
- Timeout handling
- Statistics
"""

import asyncio
import time
import threading
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, AsyncGenerator, Set
)
from enum import Enum
from abc import ABC, abstractmethod
import logging

logger = logging.getLogger(__name__)


T = TypeVar("T")


class PoolError(Exception):
    """Pool error base class."""
    pass


class PoolExhaustedError(PoolError):
    """Pool has no available connections."""
    pass


class PoolClosedError(PoolError):
    """Pool is closed."""
    pass


class ConnectionTimeoutError(PoolError):
    """Connection acquisition timed out."""
    pass


class ConnectionState(str, Enum):
    """Connection state."""
    AVAILABLE = "available"
    IN_USE = "in_use"
    INVALID = "invalid"
    CLOSED = "closed"


@dataclass
class ConnectionInfo(Generic[T]):
    """Connection metadata."""
    connection: T
    id: str
    created_at: float
    last_used_at: float
    use_count: int
    state: ConnectionState


@dataclass
class PoolStats:
    """Pool statistics."""
    size: int
    available: int
    in_use: int
    total_acquisitions: int
    total_releases: int
    total_errors: int
    avg_wait_time_ms: float
    max_wait_time_ms: float
    connections_created: int
    connections_closed: int

    def to_dict(self) -> dict:
        return {
            "size": self.size,
            "available": self.available,
            "in_use": self.in_use,
            "total_acquisitions": self.total_acquisitions,
            "total_releases": self.total_releases,
            "total_errors": self.total_errors,
            "avg_wait_time_ms": round(self.avg_wait_time_ms, 2),
            "max_wait_time_ms": round(self.max_wait_time_ms, 2),
            "connections_created": self.connections_created,
            "connections_closed": self.connections_closed,
        }


class ConnectionFactory(ABC, Generic[T]):
    """Abstract connection factory."""

    @abstractmethod
    async def create(self) -> T:
        """Create a new connection."""
        pass

    @abstractmethod
    async def validate(self, connection: T) -> bool:
        """Validate connection is healthy."""
        pass

    @abstractmethod
    async def close(self, connection: T) -> None:
        """Close a connection."""
        pass


class SimpleConnectionFactory(ConnectionFactory[T]):
    """Simple connection factory using callables."""

    def __init__(
        self,
        create_func: Callable[[], Awaitable[T]],
        validate_func: Optional[Callable[[T], Awaitable[bool]]] = None,
        close_func: Optional[Callable[[T], Awaitable[None]]] = None,
    ):
        self._create_func = create_func
        self._validate_func = validate_func or (lambda c: asyncio.coroutine(lambda: True)())
        self._close_func = close_func

    async def create(self) -> T:
        return await self._create_func()

    async def validate(self, connection: T) -> bool:
        if self._validate_func:
            return await self._validate_func(connection)
        return True

    async def close(self, connection: T) -> None:
        if self._close_func:
            await self._close_func(connection)


class ConnectionPool(Generic[T]):
    """Async connection pool.

    Usage:
        factory = SimpleConnectionFactory(
            create_func=lambda: create_db_connection(),
            validate_func=lambda c: c.ping(),
            close_func=lambda c: c.close()
        )

        pool = ConnectionPool(
            factory=factory,
            min_size=2,
            max_size=10,
            max_idle_time=300
        )

        await pool.start()

        async with pool.acquire() as conn:
            result = await conn.execute("SELECT 1")

        await pool.close()
    """

    def __init__(
        self,
        factory: ConnectionFactory[T],
        min_size: int = 1,
        max_size: int = 10,
        max_idle_time: float = 300.0,
        acquire_timeout: float = 30.0,
        validation_interval: float = 60.0,
        max_lifetime: Optional[float] = None,
    ):
        self._factory = factory
        self._min_size = min_size
        self._max_size = max_size
        self._max_idle_time = max_idle_time
        self._acquire_timeout = acquire_timeout
        self._validation_interval = validation_interval
        self._max_lifetime = max_lifetime

        self._connections: Dict[str, ConnectionInfo[T]] = {}
        self._available: asyncio.Queue[str] = asyncio.Queue()
        self._lock = asyncio.Lock()
        self._closed = False
        self._started = False
        self._conn_counter = 0

        # Stats
        self._total_acquisitions = 0
        self._total_releases = 0
        self._total_errors = 0
        self._connections_created = 0
        self._connections_closed = 0
        self._wait_times: List[float] = []

        # Background tasks
        self._maintenance_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start the pool and create minimum connections."""
        if self._started:
            return

        async with self._lock:
            for _ in range(self._min_size):
                await self._create_connection()

            self._maintenance_task = asyncio.create_task(self._run_maintenance())
            self._started = True

        logger.info("Pool started with " + str(self._min_size) + " connections")

    async def _create_connection(self) -> str:
        """Create a new connection."""
        self._conn_counter += 1
        conn_id = "conn_" + str(self._conn_counter)

        try:
            connection = await self._factory.create()
            now = time.time()

            info = ConnectionInfo(
                connection=connection,
                id=conn_id,
                created_at=now,
                last_used_at=now,
                use_count=0,
                state=ConnectionState.AVAILABLE,
            )

            self._connections[conn_id] = info
            await self._available.put(conn_id)
            self._connections_created += 1

            logger.debug("Created connection " + conn_id)
            return conn_id

        except Exception as e:
            self._total_errors += 1
            logger.error("Failed to create connection: " + str(e))
            raise

    async def _close_connection(self, conn_id: str) -> None:
        """Close a connection."""
        info = self._connections.get(conn_id)
        if not info:
            return

        try:
            await self._factory.close(info.connection)
        except Exception as e:
            logger.error("Error closing connection " + conn_id + ": " + str(e))
        finally:
            info.state = ConnectionState.CLOSED
            del self._connections[conn_id]
            self._connections_closed += 1

        logger.debug("Closed connection " + conn_id)

    async def _validate_connection(self, conn_id: str) -> bool:
        """Validate a connection."""
        info = self._connections.get(conn_id)
        if not info:
            return False

        # Check max lifetime
        if self._max_lifetime:
            if time.time() - info.created_at > self._max_lifetime:
                return False

        try:
            return await self._factory.validate(info.connection)
        except Exception:
            return False

    @asynccontextmanager
    async def acquire(self) -> AsyncGenerator[T, None]:
        """Acquire a connection from the pool."""
        if self._closed:
            raise PoolClosedError("Pool is closed")

        start_time = time.time()
        conn_id = await self._acquire_connection()
        wait_time = (time.time() - start_time) * 1000
        self._wait_times.append(wait_time)

        info = self._connections[conn_id]
        try:
            yield info.connection
        finally:
            await self._release_connection(conn_id)

    async def _acquire_connection(self) -> str:
        """Internal: acquire a connection."""
        deadline = time.time() + self._acquire_timeout

        while True:
            # Try to get from available
            try:
                conn_id = self._available.get_nowait()

                # Validate before returning
                if await self._validate_connection(conn_id):
                    info = self._connections[conn_id]
                    info.state = ConnectionState.IN_USE
                    info.use_count += 1
                    info.last_used_at = time.time()
                    self._total_acquisitions += 1
                    return conn_id
                else:
                    # Invalid, close and retry
                    await self._close_connection(conn_id)
                    continue

            except asyncio.QueueEmpty:
                pass

            # Try to create new connection
            async with self._lock:
                if len(self._connections) < self._max_size:
                    conn_id = await self._create_connection()
                    # Get it back immediately
                    self._available.get_nowait()
                    info = self._connections[conn_id]
                    info.state = ConnectionState.IN_USE
                    info.use_count += 1
                    self._total_acquisitions += 1
                    return conn_id

            # Wait for available connection
            remaining = deadline - time.time()
            if remaining <= 0:
                self._total_errors += 1
                raise ConnectionTimeoutError(
                    "Timeout waiting for connection after " +
                    str(self._acquire_timeout) + "s"
                )

            try:
                conn_id = await asyncio.wait_for(
                    self._available.get(),
                    timeout=min(remaining, 1.0)
                )

                if await self._validate_connection(conn_id):
                    info = self._connections[conn_id]
                    info.state = ConnectionState.IN_USE
                    info.use_count += 1
                    info.last_used_at = time.time()
                    self._total_acquisitions += 1
                    return conn_id
                else:
                    await self._close_connection(conn_id)

            except asyncio.TimeoutError:
                continue

    async def _release_connection(self, conn_id: str) -> None:
        """Release a connection back to the pool."""
        info = self._connections.get(conn_id)
        if not info:
            return

        info.state = ConnectionState.AVAILABLE
        info.last_used_at = time.time()
        self._total_releases += 1

        await self._available.put(conn_id)

    async def _run_maintenance(self) -> None:
        """Background maintenance task."""
        while not self._closed:
            try:
                await asyncio.sleep(self._validation_interval)
                await self._perform_maintenance()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Maintenance error: " + str(e))

    async def _perform_maintenance(self) -> None:
        """Perform pool maintenance."""
        now = time.time()

        # Find idle connections to remove
        to_remove: List[str] = []

        for conn_id, info in list(self._connections.items()):
            if info.state != ConnectionState.AVAILABLE:
                continue

            # Check idle time
            idle_time = now - info.last_used_at
            if idle_time > self._max_idle_time:
                # Keep minimum connections
                if len(self._connections) > self._min_size:
                    to_remove.append(conn_id)

        # Remove idle connections
        for conn_id in to_remove:
            # Remove from available queue
            try:
                temp_queue: asyncio.Queue[str] = asyncio.Queue()
                while True:
                    try:
                        item = self._available.get_nowait()
                        if item != conn_id:
                            await temp_queue.put(item)
                    except asyncio.QueueEmpty:
                        break

                while True:
                    try:
                        item = temp_queue.get_nowait()
                        await self._available.put(item)
                    except asyncio.QueueEmpty:
                        break

                await self._close_connection(conn_id)

            except Exception as e:
                logger.error("Error removing connection: " + str(e))

        # Ensure minimum connections
        async with self._lock:
            while len(self._connections) < self._min_size:
                try:
                    await self._create_connection()
                except Exception as e:
                    logger.error("Failed to maintain min connections: " + str(e))
                    break

    def get_stats(self) -> PoolStats:
        """Get pool statistics."""
        available = 0
        in_use = 0

        for info in self._connections.values():
            if info.state == ConnectionState.AVAILABLE:
                available += 1
            elif info.state == ConnectionState.IN_USE:
                in_use += 1

        avg_wait = sum(self._wait_times) / len(self._wait_times) if self._wait_times else 0
        max_wait = max(self._wait_times) if self._wait_times else 0

        return PoolStats(
            size=len(self._connections),
            available=available,
            in_use=in_use,
            total_acquisitions=self._total_acquisitions,
            total_releases=self._total_releases,
            total_errors=self._total_errors,
            avg_wait_time_ms=avg_wait,
            max_wait_time_ms=max_wait,
            connections_created=self._connections_created,
            connections_closed=self._connections_closed,
        )

    @property
    def size(self) -> int:
        """Current pool size."""
        return len(self._connections)

    @property
    def available(self) -> int:
        """Available connections count."""
        return sum(
            1 for c in self._connections.values()
            if c.state == ConnectionState.AVAILABLE
        )

    @property
    def in_use(self) -> int:
        """In-use connections count."""
        return sum(
            1 for c in self._connections.values()
            if c.state == ConnectionState.IN_USE
        )

    async def close(self) -> None:
        """Close the pool and all connections."""
        if self._closed:
            return

        self._closed = True

        # Stop maintenance
        if self._maintenance_task:
            self._maintenance_task.cancel()
            try:
                await self._maintenance_task
            except asyncio.CancelledError:
                pass

        # Close all connections
        for conn_id in list(self._connections.keys()):
            try:
                await self._close_connection(conn_id)
            except Exception as e:
                logger.error("Error closing " + conn_id + ": " + str(e))

        logger.info("Pool closed")

    async def __aenter__(self) -> "ConnectionPool[T]":
        await self.start()
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()


class ResourcePool(Generic[T]):
    """Simple resource pool for non-connection resources.

    Usage:
        pool = ResourcePool(
            create=lambda: ExpensiveResource(),
            destroy=lambda r: r.cleanup(),
            max_size=5
        )

        with pool.get() as resource:
            resource.do_something()
    """

    def __init__(
        self,
        create: Callable[[], T],
        destroy: Optional[Callable[[T], None]] = None,
        max_size: int = 10,
        max_idle_time: float = 300.0,
    ):
        self._create = create
        self._destroy = destroy
        self._max_size = max_size
        self._max_idle_time = max_idle_time

        self._resources: List[Tuple[T, float]] = []
        self._in_use: Set[int] = set()
        self._lock = threading.Lock()
        self._closed = False

    def _get_or_create(self) -> T:
        """Get existing or create new resource."""
        with self._lock:
            if self._closed:
                raise PoolClosedError("Pool is closed")

            now = time.time()

            # Clean up old resources
            self._resources = [
                (r, t) for r, t in self._resources
                if now - t < self._max_idle_time
            ]

            # Try to get existing
            if self._resources:
                resource, _ = self._resources.pop()
                self._in_use.add(id(resource))
                return resource

            # Create new if under limit
            if len(self._in_use) < self._max_size:
                resource = self._create()
                self._in_use.add(id(resource))
                return resource

            raise PoolExhaustedError("Pool exhausted, max_size=" + str(self._max_size))

    def _release(self, resource: T) -> None:
        """Release resource back to pool."""
        with self._lock:
            self._in_use.discard(id(resource))
            if not self._closed:
                self._resources.append((resource, time.time()))

    @asynccontextmanager
    async def get(self) -> AsyncGenerator[T, None]:
        """Get a resource from the pool (async context)."""
        resource = self._get_or_create()
        try:
            yield resource
        finally:
            self._release(resource)

    def close(self) -> None:
        """Close the pool."""
        with self._lock:
            self._closed = True
            if self._destroy:
                for resource, _ in self._resources:
                    try:
                        self._destroy(resource)
                    except Exception:
                        pass
            self._resources.clear()


from typing import Tuple


# Type alias for resource pool tuple
Tuple = tuple  # type: ignore


def create_pool(
    create: Callable[[], Awaitable[T]],
    validate: Optional[Callable[[T], Awaitable[bool]]] = None,
    close: Optional[Callable[[T], Awaitable[None]]] = None,
    min_size: int = 1,
    max_size: int = 10,
) -> ConnectionPool[T]:
    """Create a connection pool with simple factory.

    Usage:
        pool = create_pool(
            create=create_connection,
            validate=lambda c: c.ping(),
            close=lambda c: c.close(),
            max_size=20
        )
    """
    factory = SimpleConnectionFactory(
        create_func=create,
        validate_func=validate,
        close_func=close,
    )
    return ConnectionPool(
        factory=factory,
        min_size=min_size,
        max_size=max_size,
    )
