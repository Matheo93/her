"""
Resource Manager - Sprint 815

Resource lifecycle management and pooling.

Features:
- Resource pools with limits
- Lifecycle hooks (acquire, release, dispose)
- Resource health monitoring
- Automatic cleanup
- Resource allocation strategies
- Timeout handling
"""

import asyncio
import threading
import time
import uuid
import weakref
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import (
    Any, Callable, Dict, Generic, List, Optional, Set, TypeVar, Union
)

T = TypeVar("T")


class ResourceState(str, Enum):
    """Resource lifecycle states."""
    IDLE = "idle"
    ACQUIRED = "acquired"
    DISPOSED = "disposed"
    UNHEALTHY = "unhealthy"


class AllocationStrategy(str, Enum):
    """Resource allocation strategies."""
    FIFO = "fifo"           # First in, first out
    LIFO = "lifo"           # Last in, first out (most recent)
    RANDOM = "random"       # Random selection
    ROUND_ROBIN = "round_robin"  # Rotating selection


@dataclass
class ResourceStats:
    """Statistics for a resource pool."""
    total: int = 0
    idle: int = 0
    acquired: int = 0
    disposed: int = 0
    unhealthy: int = 0
    total_acquisitions: int = 0
    total_releases: int = 0
    total_timeouts: int = 0
    avg_acquire_time_ms: float = 0.0
    avg_hold_time_ms: float = 0.0


@dataclass
class ResourceInfo(Generic[T]):
    """Information about a pooled resource."""
    id: str
    resource: T
    state: ResourceState
    created_at: datetime
    acquired_at: Optional[datetime] = None
    released_at: Optional[datetime] = None
    acquisition_count: int = 0
    last_health_check: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def age_seconds(self) -> float:
        """Age of resource in seconds."""
        return (datetime.now() - self.created_at).total_seconds()

    @property
    def idle_seconds(self) -> float:
        """Seconds since last release."""
        if self.released_at:
            return (datetime.now() - self.released_at).total_seconds()
        return 0.0


class ResourceFactory(ABC, Generic[T]):
    """Abstract factory for creating resources."""

    @abstractmethod
    def create(self) -> T:
        """Create a new resource."""
        pass

    @abstractmethod
    def destroy(self, resource: T) -> None:
        """Destroy a resource."""
        pass

    def validate(self, resource: T) -> bool:
        """Validate resource health. Default: always healthy."""
        return True

    def reset(self, resource: T) -> T:
        """Reset resource state for reuse. Default: return as-is."""
        return resource


class SimpleFactory(ResourceFactory[T]):
    """Simple factory using callables.

    Usage:
        factory = SimpleFactory(
            create_fn=lambda: Connection(),
            destroy_fn=lambda c: c.close(),
            validate_fn=lambda c: c.is_connected()
        )
    """

    def __init__(
        self,
        create_fn: Callable[[], T],
        destroy_fn: Optional[Callable[[T], None]] = None,
        validate_fn: Optional[Callable[[T], bool]] = None,
        reset_fn: Optional[Callable[[T], T]] = None,
    ):
        self._create_fn = create_fn
        self._destroy_fn = destroy_fn
        self._validate_fn = validate_fn
        self._reset_fn = reset_fn

    def create(self) -> T:
        return self._create_fn()

    def destroy(self, resource: T) -> None:
        if self._destroy_fn:
            self._destroy_fn(resource)

    def validate(self, resource: T) -> bool:
        if self._validate_fn:
            return self._validate_fn(resource)
        return True

    def reset(self, resource: T) -> T:
        if self._reset_fn:
            return self._reset_fn(resource)
        return resource


class ResourcePool(Generic[T]):
    """Thread-safe resource pool.

    Usage:
        pool = ResourcePool(
            factory=SimpleFactory(lambda: Connection()),
            min_size=2,
            max_size=10,
            max_idle_time=300,
        )

        with pool.acquire() as resource:
            resource.execute(query)
    """

    def __init__(
        self,
        factory: ResourceFactory[T],
        min_size: int = 0,
        max_size: int = 10,
        max_idle_time: float = 300.0,
        acquire_timeout: float = 30.0,
        validation_interval: float = 60.0,
        strategy: AllocationStrategy = AllocationStrategy.FIFO,
    ):
        self.factory = factory
        self.min_size = min_size
        self.max_size = max_size
        self.max_idle_time = max_idle_time
        self.acquire_timeout = acquire_timeout
        self.validation_interval = validation_interval
        self.strategy = strategy

        self._pool: Dict[str, ResourceInfo[T]] = {}
        self._idle: List[str] = []
        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._closed = False

        # Stats
        self._total_acquisitions = 0
        self._total_releases = 0
        self._total_timeouts = 0
        self._acquire_times: List[float] = []
        self._hold_times: List[float] = []

        # Initialize minimum resources
        self._initialize_pool()

    def _initialize_pool(self) -> None:
        """Initialize pool with minimum resources."""
        for _ in range(self.min_size):
            self._create_resource()

    def _create_resource(self) -> ResourceInfo[T]:
        """Create a new resource and add to pool."""
        resource = self.factory.create()
        info = ResourceInfo(
            id=str(uuid.uuid4()),
            resource=resource,
            state=ResourceState.IDLE,
            created_at=datetime.now(),
        )
        self._pool[info.id] = info
        self._idle.append(info.id)
        return info

    def _select_resource(self) -> Optional[str]:
        """Select resource based on allocation strategy."""
        if not self._idle:
            return None

        if self.strategy == AllocationStrategy.FIFO:
            return self._idle[0]
        elif self.strategy == AllocationStrategy.LIFO:
            return self._idle[-1]
        elif self.strategy == AllocationStrategy.RANDOM:
            import random
            return random.choice(self._idle)
        elif self.strategy == AllocationStrategy.ROUND_ROBIN:
            # Rotate to end after selection
            return self._idle[0]

        return self._idle[0]

    def _validate_resource(self, info: ResourceInfo[T]) -> bool:
        """Validate resource health."""
        try:
            is_valid = self.factory.validate(info.resource)
            info.last_health_check = datetime.now()
            if not is_valid:
                info.state = ResourceState.UNHEALTHY
            return is_valid
        except Exception:
            info.state = ResourceState.UNHEALTHY
            return False

    def acquire(self, timeout: Optional[float] = None) -> T:
        """Acquire a resource from the pool."""
        timeout = timeout or self.acquire_timeout
        start_time = time.time()

        with self._condition:
            while True:
                if self._closed:
                    raise RuntimeError("Pool is closed")

                # Try to get an idle resource
                resource_id = self._select_resource()

                if resource_id:
                    self._idle.remove(resource_id)
                    info = self._pool[resource_id]

                    # Validate before returning
                    if not self._validate_resource(info):
                        # Resource unhealthy, dispose and try again
                        self._dispose_resource(info.id)
                        continue

                    # Reset and mark as acquired
                    info.resource = self.factory.reset(info.resource)
                    info.state = ResourceState.ACQUIRED
                    info.acquired_at = datetime.now()
                    info.acquisition_count += 1
                    self._total_acquisitions += 1
                    self._acquire_times.append((time.time() - start_time) * 1000)

                    if self.strategy == AllocationStrategy.ROUND_ROBIN:
                        # Will be added to end of idle on release
                        pass

                    return info.resource

                # No idle resources - can we create more?
                if len(self._pool) < self.max_size:
                    info = self._create_resource()
                    self._idle.remove(info.id)
                    info.state = ResourceState.ACQUIRED
                    info.acquired_at = datetime.now()
                    info.acquisition_count += 1
                    self._total_acquisitions += 1
                    self._acquire_times.append((time.time() - start_time) * 1000)
                    return info.resource

                # Wait for a resource to be released
                remaining = timeout - (time.time() - start_time)
                if remaining <= 0:
                    self._total_timeouts += 1
                    raise TimeoutError("Timed out waiting for resource")

                self._condition.wait(timeout=remaining)

    def release(self, resource: T) -> None:
        """Release a resource back to the pool."""
        with self._condition:
            # Find the resource info
            info = None
            for rid, r_info in self._pool.items():
                if r_info.resource is resource:
                    info = r_info
                    break

            if not info:
                return  # Resource not from this pool

            if info.state != ResourceState.ACQUIRED:
                return  # Already released

            # Calculate hold time
            if info.acquired_at:
                hold_time = (datetime.now() - info.acquired_at).total_seconds() * 1000
                self._hold_times.append(hold_time)

            info.state = ResourceState.IDLE
            info.released_at = datetime.now()
            self._idle.append(info.id)
            self._total_releases += 1

            # Notify waiting threads
            self._condition.notify()

    def _dispose_resource(self, resource_id: str) -> None:
        """Dispose of a resource."""
        if resource_id not in self._pool:
            return

        info = self._pool[resource_id]
        info.state = ResourceState.DISPOSED

        try:
            self.factory.destroy(info.resource)
        except Exception:
            pass

        del self._pool[resource_id]
        if resource_id in self._idle:
            self._idle.remove(resource_id)

    @contextmanager
    def acquire_context(self, timeout: Optional[float] = None):
        """Context manager for acquiring resources.

        Usage:
            with pool.acquire_context() as resource:
                resource.do_something()
        """
        resource = self.acquire(timeout)
        try:
            yield resource
        finally:
            self.release(resource)

    def cleanup_idle(self) -> int:
        """Remove idle resources exceeding max_idle_time."""
        removed = 0
        with self._lock:
            now = datetime.now()
            to_remove = []

            for rid in self._idle:
                info = self._pool.get(rid)
                if info and info.idle_seconds > self.max_idle_time:
                    # Keep minimum pool size
                    if len(self._pool) - len(to_remove) > self.min_size:
                        to_remove.append(rid)

            for rid in to_remove:
                self._dispose_resource(rid)
                removed += 1

        return removed

    def validate_all(self) -> int:
        """Validate all idle resources, removing unhealthy ones."""
        removed = 0
        with self._lock:
            to_remove = []

            for rid in self._idle:
                info = self._pool.get(rid)
                if info and not self._validate_resource(info):
                    to_remove.append(rid)

            for rid in to_remove:
                self._dispose_resource(rid)
                removed += 1

        return removed

    def get_stats(self) -> ResourceStats:
        """Get pool statistics."""
        with self._lock:
            idle_count = len(self._idle)
            acquired_count = sum(
                1 for info in self._pool.values()
                if info.state == ResourceState.ACQUIRED
            )
            unhealthy_count = sum(
                1 for info in self._pool.values()
                if info.state == ResourceState.UNHEALTHY
            )

            avg_acquire = sum(self._acquire_times[-100:]) / len(self._acquire_times[-100:]) if self._acquire_times else 0
            avg_hold = sum(self._hold_times[-100:]) / len(self._hold_times[-100:]) if self._hold_times else 0

            return ResourceStats(
                total=len(self._pool),
                idle=idle_count,
                acquired=acquired_count,
                disposed=0,
                unhealthy=unhealthy_count,
                total_acquisitions=self._total_acquisitions,
                total_releases=self._total_releases,
                total_timeouts=self._total_timeouts,
                avg_acquire_time_ms=avg_acquire,
                avg_hold_time_ms=avg_hold,
            )

    def resize(self, new_min: int, new_max: int) -> None:
        """Resize pool limits."""
        with self._lock:
            self.min_size = new_min
            self.max_size = new_max

            # Create resources if below new minimum
            while len(self._pool) < self.min_size:
                self._create_resource()

            # Remove excess idle resources
            while len(self._pool) > self.max_size and self._idle:
                rid = self._idle[-1]
                self._dispose_resource(rid)

    def close(self) -> None:
        """Close the pool and dispose all resources."""
        with self._lock:
            self._closed = True

            for rid in list(self._pool.keys()):
                self._dispose_resource(rid)

            self._condition.notify_all()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


class AsyncResourcePool(Generic[T]):
    """Async resource pool.

    Usage:
        pool = AsyncResourcePool(factory, min_size=2, max_size=10)

        async with pool.acquire() as resource:
            await resource.execute(query)
    """

    def __init__(
        self,
        factory: ResourceFactory[T],
        min_size: int = 0,
        max_size: int = 10,
        max_idle_time: float = 300.0,
        acquire_timeout: float = 30.0,
        strategy: AllocationStrategy = AllocationStrategy.FIFO,
    ):
        self.factory = factory
        self.min_size = min_size
        self.max_size = max_size
        self.max_idle_time = max_idle_time
        self.acquire_timeout = acquire_timeout
        self.strategy = strategy

        self._pool: Dict[str, ResourceInfo[T]] = {}
        self._idle: List[str] = []
        self._lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(max_size)
        self._closed = False

    async def initialize(self) -> None:
        """Initialize pool with minimum resources."""
        for _ in range(self.min_size):
            await self._create_resource()

    async def _create_resource(self) -> ResourceInfo[T]:
        """Create a new resource."""
        resource = self.factory.create()
        info = ResourceInfo(
            id=str(uuid.uuid4()),
            resource=resource,
            state=ResourceState.IDLE,
            created_at=datetime.now(),
        )
        self._pool[info.id] = info
        self._idle.append(info.id)
        return info

    async def acquire(self, timeout: Optional[float] = None) -> T:
        """Acquire a resource from the pool."""
        timeout = timeout or self.acquire_timeout

        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=timeout)
        except asyncio.TimeoutError:
            raise TimeoutError("Timed out waiting for resource")

        async with self._lock:
            if self._closed:
                self._semaphore.release()
                raise RuntimeError("Pool is closed")

            # Get or create resource
            if self._idle:
                rid = self._idle.pop(0) if self.strategy == AllocationStrategy.FIFO else self._idle.pop()
                info = self._pool[rid]
            else:
                info = await self._create_resource()
                self._idle.remove(info.id)

            info.state = ResourceState.ACQUIRED
            info.acquired_at = datetime.now()
            info.acquisition_count += 1

            return info.resource

    async def release(self, resource: T) -> None:
        """Release a resource back to the pool."""
        async with self._lock:
            info = None
            for rid, r_info in self._pool.items():
                if r_info.resource is resource:
                    info = r_info
                    break

            if not info or info.state != ResourceState.ACQUIRED:
                return

            info.state = ResourceState.IDLE
            info.released_at = datetime.now()
            self._idle.append(info.id)

        self._semaphore.release()

    @asynccontextmanager
    async def acquire_context(self, timeout: Optional[float] = None):
        """Async context manager for acquiring resources."""
        resource = await self.acquire(timeout)
        try:
            yield resource
        finally:
            await self.release(resource)

    async def close(self) -> None:
        """Close the pool."""
        async with self._lock:
            self._closed = True
            for info in self._pool.values():
                self.factory.destroy(info.resource)
            self._pool.clear()
            self._idle.clear()


class ResourceManager:
    """Central manager for multiple resource pools.

    Usage:
        manager = ResourceManager()

        manager.register_pool("db", pool=db_pool)
        manager.register_pool(
            "cache",
            factory=SimpleFactory(lambda: Redis()),
            max_size=5
        )

        with manager.acquire("db") as conn:
            conn.execute(query)
    """

    def __init__(self):
        self._pools: Dict[str, ResourcePool] = {}
        self._lock = threading.Lock()

    def register_pool(
        self,
        name: str,
        pool: Optional[ResourcePool] = None,
        factory: Optional[ResourceFactory] = None,
        **kwargs
    ) -> None:
        """Register a resource pool."""
        with self._lock:
            if pool:
                self._pools[name] = pool
            elif factory:
                self._pools[name] = ResourcePool(factory, **kwargs)
            else:
                raise ValueError("Either pool or factory must be provided")

    def unregister_pool(self, name: str) -> None:
        """Unregister and close a pool."""
        with self._lock:
            if name in self._pools:
                self._pools[name].close()
                del self._pools[name]

    def get_pool(self, name: str) -> Optional[ResourcePool]:
        """Get a pool by name."""
        return self._pools.get(name)

    def acquire(self, pool_name: str, timeout: Optional[float] = None) -> Any:
        """Acquire a resource from a named pool."""
        pool = self._pools.get(pool_name)
        if not pool:
            raise KeyError("Pool not found: " + pool_name)
        return pool.acquire(timeout)

    def release(self, pool_name: str, resource: Any) -> None:
        """Release a resource to a named pool."""
        pool = self._pools.get(pool_name)
        if pool:
            pool.release(resource)

    @contextmanager
    def acquire_context(self, pool_name: str, timeout: Optional[float] = None):
        """Context manager for acquiring from named pool."""
        resource = self.acquire(pool_name, timeout)
        try:
            yield resource
        finally:
            self.release(pool_name, resource)

    def get_all_stats(self) -> Dict[str, ResourceStats]:
        """Get stats for all pools."""
        return {name: pool.get_stats() for name, pool in self._pools.items()}

    def cleanup_all(self) -> Dict[str, int]:
        """Cleanup idle resources in all pools."""
        return {name: pool.cleanup_idle() for name, pool in self._pools.items()}

    def close(self) -> None:
        """Close all pools."""
        with self._lock:
            for pool in self._pools.values():
                pool.close()
            self._pools.clear()


class LimitedResource(Generic[T]):
    """Resource with usage limits.

    Usage:
        limited = LimitedResource(
            resource=connection,
            max_uses=100,
            max_age=3600,
            on_exhausted=lambda r: r.close()
        )

        while limited.is_valid():
            limited.use()
            # ... use resource
    """

    def __init__(
        self,
        resource: T,
        max_uses: Optional[int] = None,
        max_age: Optional[float] = None,
        on_exhausted: Optional[Callable[[T], None]] = None,
    ):
        self.resource = resource
        self.max_uses = max_uses
        self.max_age = max_age
        self.on_exhausted = on_exhausted

        self._uses = 0
        self._created_at = time.time()
        self._exhausted = False

    @property
    def uses_remaining(self) -> Optional[int]:
        if self.max_uses is None:
            return None
        return max(0, self.max_uses - self._uses)

    @property
    def age_seconds(self) -> float:
        return time.time() - self._created_at

    @property
    def time_remaining(self) -> Optional[float]:
        if self.max_age is None:
            return None
        return max(0, self.max_age - self.age_seconds)

    def is_valid(self) -> bool:
        """Check if resource can still be used."""
        if self._exhausted:
            return False

        if self.max_uses is not None and self._uses >= self.max_uses:
            self._exhaust()
            return False

        if self.max_age is not None and self.age_seconds >= self.max_age:
            self._exhaust()
            return False

        return True

    def use(self) -> T:
        """Use the resource (increments counter)."""
        if not self.is_valid():
            raise RuntimeError("Resource is exhausted")
        self._uses += 1
        return self.resource

    def _exhaust(self) -> None:
        if not self._exhausted:
            self._exhausted = True
            if self.on_exhausted:
                self.on_exhausted(self.resource)


class ResourceLease(Generic[T]):
    """Resource with automatic expiration.

    Usage:
        lease = ResourceLease(resource, duration=60)

        if lease.is_active():
            lease.get()
            # ... use resource

        lease.renew(duration=60)  # Extend lease
    """

    def __init__(
        self,
        resource: T,
        duration: float,
        on_expire: Optional[Callable[[T], None]] = None,
    ):
        self.resource = resource
        self.duration = duration
        self.on_expire = on_expire

        self._leased_at = time.time()
        self._expires_at = self._leased_at + duration
        self._expired = False

    @property
    def expires_at(self) -> float:
        return self._expires_at

    @property
    def time_remaining(self) -> float:
        return max(0, self._expires_at - time.time())

    def is_active(self) -> bool:
        """Check if lease is still active."""
        if self._expired:
            return False

        if time.time() >= self._expires_at:
            self._expire()
            return False

        return True

    def get(self) -> T:
        """Get the leased resource."""
        if not self.is_active():
            raise RuntimeError("Lease has expired")
        return self.resource

    def renew(self, duration: Optional[float] = None) -> None:
        """Renew the lease."""
        if self._expired:
            raise RuntimeError("Cannot renew expired lease")
        self._expires_at = time.time() + (duration or self.duration)

    def _expire(self) -> None:
        if not self._expired:
            self._expired = True
            if self.on_expire:
                self.on_expire(self.resource)

    def release(self) -> None:
        """Explicitly release the lease."""
        self._expire()


class ResourceTracker:
    """Track resource usage across the application.

    Usage:
        tracker = ResourceTracker()

        tracker.track("db_connections", resource, owner="user_service")

        # Later
        resources = tracker.get_by_owner("user_service")
        tracker.release_by_owner("user_service")
    """

    def __init__(self):
        self._resources: Dict[str, Dict[int, Dict]] = {}
        self._lock = threading.Lock()

    def track(
        self,
        category: str,
        resource: Any,
        owner: Optional[str] = None,
        metadata: Optional[Dict] = None,
    ) -> str:
        """Track a resource."""
        with self._lock:
            if category not in self._resources:
                self._resources[category] = {}

            resource_id = id(resource)
            self._resources[category][resource_id] = {
                "resource": weakref.ref(resource),
                "owner": owner,
                "metadata": metadata or {},
                "tracked_at": datetime.now(),
            }

            return str(resource_id)

    def untrack(self, category: str, resource: Any) -> bool:
        """Stop tracking a resource."""
        with self._lock:
            if category in self._resources:
                resource_id = id(resource)
                if resource_id in self._resources[category]:
                    del self._resources[category][resource_id]
                    return True
            return False

    def get_by_category(self, category: str) -> List[Any]:
        """Get all resources in a category."""
        with self._lock:
            if category not in self._resources:
                return []

            result = []
            to_remove = []

            for rid, info in self._resources[category].items():
                ref = info["resource"]
                resource = ref()
                if resource is not None:
                    result.append(resource)
                else:
                    to_remove.append(rid)

            # Clean up dead references
            for rid in to_remove:
                del self._resources[category][rid]

            return result

    def get_by_owner(self, owner: str) -> Dict[str, List[Any]]:
        """Get all resources owned by a specific owner."""
        result: Dict[str, List[Any]] = {}

        with self._lock:
            for category, resources in self._resources.items():
                for rid, info in resources.items():
                    if info["owner"] == owner:
                        ref = info["resource"]
                        resource = ref()
                        if resource is not None:
                            if category not in result:
                                result[category] = []
                            result[category].append(resource)

        return result

    def release_by_owner(
        self,
        owner: str,
        release_fn: Optional[Callable[[Any], None]] = None,
    ) -> int:
        """Release all resources owned by an owner."""
        released = 0

        with self._lock:
            for category in self._resources:
                to_remove = []

                for rid, info in self._resources[category].items():
                    if info["owner"] == owner:
                        ref = info["resource"]
                        resource = ref()
                        if resource is not None and release_fn:
                            try:
                                release_fn(resource)
                            except Exception:
                                pass
                        to_remove.append(rid)
                        released += 1

                for rid in to_remove:
                    del self._resources[category][rid]

        return released

    def get_stats(self) -> Dict[str, Dict[str, int]]:
        """Get tracking statistics."""
        with self._lock:
            stats = {}
            for category, resources in self._resources.items():
                by_owner: Dict[str, int] = {}
                for info in resources.values():
                    owner = info["owner"] or "unknown"
                    by_owner[owner] = by_owner.get(owner, 0) + 1
                stats[category] = by_owner
            return stats


# Convenience functions
def create_pool(
    create_fn: Callable[[], T],
    destroy_fn: Optional[Callable[[T], None]] = None,
    min_size: int = 0,
    max_size: int = 10,
    **kwargs
) -> ResourcePool[T]:
    """Create a resource pool with a simple factory."""
    factory = SimpleFactory(create_fn, destroy_fn)
    return ResourcePool(factory, min_size=min_size, max_size=max_size, **kwargs)


async def create_async_pool(
    create_fn: Callable[[], T],
    destroy_fn: Optional[Callable[[T], None]] = None,
    min_size: int = 0,
    max_size: int = 10,
    **kwargs
) -> AsyncResourcePool[T]:
    """Create an async resource pool."""
    factory = SimpleFactory(create_fn, destroy_fn)
    pool = AsyncResourcePool(factory, min_size=min_size, max_size=max_size, **kwargs)
    await pool.initialize()
    return pool
