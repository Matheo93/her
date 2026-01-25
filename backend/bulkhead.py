"""
Bulkhead Pattern - Sprint 677

Isolation pattern for preventing cascade failures.

Features:
- Concurrent call limiting
- Resource isolation
- Queue management
- Timeout handling
- Metrics tracking
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, Callable, TypeVar, Generic
from enum import Enum
import threading
from functools import wraps


class BulkheadState(str, Enum):
    """Bulkhead state."""
    ACCEPTING = "accepting"  # Normal operation
    SATURATED = "saturated"  # At capacity
    QUEUE_FULL = "queue_full"  # Queue is full


@dataclass
class BulkheadStats:
    """Bulkhead statistics."""
    total_calls: int = 0
    accepted_calls: int = 0
    rejected_calls: int = 0
    queued_calls: int = 0
    completed_calls: int = 0
    failed_calls: int = 0
    timeout_calls: int = 0
    current_concurrent: int = 0
    current_queued: int = 0
    max_concurrent_reached: int = 0
    avg_wait_time: float = 0.0


T = TypeVar("T")


class Bulkhead(Generic[T]):
    """Bulkhead pattern implementation.

    Usage:
        bulkhead = Bulkhead("api-pool", max_concurrent=10, max_queue=50)

        # Wrap async function
        @bulkhead
        async def call_api():
            return await external_api()

        # Or use execute
        result = await bulkhead.execute(call_api)

        # With timeout
        result = await bulkhead.execute(call_api, timeout=5.0)

        # Check status
        if bulkhead.is_accepting:
            print("Accepting calls")
    """

    def __init__(
        self,
        name: str,
        max_concurrent: int = 10,
        max_queue: int = 100,
        queue_timeout: float = 30.0,
        on_rejected: Optional[Callable[[str], None]] = None,
    ):
        """Initialize bulkhead.

        Args:
            name: Bulkhead name
            max_concurrent: Max concurrent executions
            max_queue: Max queued requests
            queue_timeout: Max time to wait in queue
            on_rejected: Callback when request rejected
        """
        self.name = name
        self.max_concurrent = max_concurrent
        self.max_queue = max_queue
        self.queue_timeout = queue_timeout
        self._on_rejected = on_rejected

        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._sync_semaphore = threading.Semaphore(max_concurrent)
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=max_queue)
        self._stats = BulkheadStats()
        self._lock = threading.Lock()
        self._concurrent_count = 0
        self._queue_count = 0
        self._total_wait_time = 0.0

    @property
    def state(self) -> BulkheadState:
        """Get current state."""
        if self._concurrent_count >= self.max_concurrent:
            if self._queue_count >= self.max_queue:
                return BulkheadState.QUEUE_FULL
            return BulkheadState.SATURATED
        return BulkheadState.ACCEPTING

    @property
    def is_accepting(self) -> bool:
        """Check if accepting new calls."""
        return self.state == BulkheadState.ACCEPTING

    @property
    def is_saturated(self) -> bool:
        """Check if at capacity."""
        return self.state != BulkheadState.ACCEPTING

    @property
    def available_slots(self) -> int:
        """Get available concurrent slots."""
        return max(0, self.max_concurrent - self._concurrent_count)

    @property
    def available_queue_slots(self) -> int:
        """Get available queue slots."""
        return max(0, self.max_queue - self._queue_count)

    @property
    def stats(self) -> BulkheadStats:
        """Get statistics."""
        self._stats.current_concurrent = self._concurrent_count
        self._stats.current_queued = self._queue_count
        if self._stats.queued_calls > 0:
            self._stats.avg_wait_time = self._total_wait_time / self._stats.queued_calls
        return self._stats

    def _enter(self) -> bool:
        """Try to enter the bulkhead."""
        with self._lock:
            if self._concurrent_count < self.max_concurrent:
                self._concurrent_count += 1
                self._stats.total_calls += 1
                self._stats.accepted_calls += 1
                if self._concurrent_count > self._stats.max_concurrent_reached:
                    self._stats.max_concurrent_reached = self._concurrent_count
                return True

            if self._queue_count < self.max_queue:
                self._queue_count += 1
                self._stats.queued_calls += 1
                return None  # Will wait in queue

            self._stats.total_calls += 1
            self._stats.rejected_calls += 1
            return False

    def _exit(self):
        """Exit the bulkhead."""
        with self._lock:
            self._concurrent_count -= 1
            self._stats.completed_calls += 1

    def _dequeue(self):
        """Dequeue waiting request."""
        with self._lock:
            self._queue_count -= 1

    async def execute(
        self,
        func: Callable[..., T],
        *args,
        timeout: Optional[float] = None,
        **kwargs,
    ) -> T:
        """Execute function with bulkhead protection.

        Args:
            func: Function to execute
            timeout: Execution timeout
            *args, **kwargs: Arguments for func

        Returns:
            Function result

        Raises:
            BulkheadFullError: If bulkhead is at capacity
            BulkheadTimeoutError: If execution times out
        """
        entry_result = self._enter()

        if entry_result is False:
            if self._on_rejected:
                self._on_rejected(self.name)
            raise BulkheadFullError(f"Bulkhead '{self.name}' is full")

        wait_start = time.time()

        if entry_result is None:
            # Need to wait in queue
            try:
                await asyncio.wait_for(
                    self._semaphore.acquire(),
                    timeout=self.queue_timeout,
                )
                self._dequeue()
                wait_time = time.time() - wait_start
                self._total_wait_time += wait_time

                with self._lock:
                    self._concurrent_count += 1
                    if self._concurrent_count > self._stats.max_concurrent_reached:
                        self._stats.max_concurrent_reached = self._concurrent_count

            except asyncio.TimeoutError:
                self._dequeue()
                self._stats.timeout_calls += 1
                raise BulkheadTimeoutError(f"Timeout waiting for bulkhead '{self.name}'")
        else:
            await self._semaphore.acquire()

        try:
            if timeout:
                if asyncio.iscoroutinefunction(func):
                    result = await asyncio.wait_for(func(*args, **kwargs), timeout=timeout)
                else:
                    result = await asyncio.wait_for(
                        asyncio.get_event_loop().run_in_executor(None, lambda: func(*args, **kwargs)),
                        timeout=timeout,
                    )
            else:
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)
            return result
        except asyncio.TimeoutError:
            self._stats.timeout_calls += 1
            raise BulkheadTimeoutError(f"Execution timeout in bulkhead '{self.name}'")
        except Exception:
            self._stats.failed_calls += 1
            raise
        finally:
            self._semaphore.release()
            self._exit()

    def execute_sync(
        self,
        func: Callable[..., T],
        *args,
        timeout: Optional[float] = None,
        **kwargs,
    ) -> T:
        """Synchronous execute."""
        acquired = self._sync_semaphore.acquire(timeout=self.queue_timeout if timeout is None else timeout)
        if not acquired:
            self._stats.rejected_calls += 1
            raise BulkheadFullError(f"Bulkhead '{self.name}' is full")

        with self._lock:
            self._concurrent_count += 1
            self._stats.total_calls += 1
            self._stats.accepted_calls += 1

        try:
            return func(*args, **kwargs)
        except Exception:
            self._stats.failed_calls += 1
            raise
        finally:
            self._sync_semaphore.release()
            self._exit()

    def __call__(self, func: Callable) -> Callable:
        """Decorator for wrapping functions."""
        if asyncio.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args, **kwargs):
                return await self.execute(func, *args, **kwargs)
            return async_wrapper
        else:
            @wraps(func)
            def sync_wrapper(*args, **kwargs):
                return self.execute_sync(func, *args, **kwargs)
            return sync_wrapper

    async def __aenter__(self):
        """Async context manager entry."""
        entry_result = self._enter()
        if entry_result is False:
            raise BulkheadFullError(f"Bulkhead '{self.name}' is full")

        if entry_result is None:
            try:
                await asyncio.wait_for(self._semaphore.acquire(), timeout=self.queue_timeout)
                self._dequeue()
                with self._lock:
                    self._concurrent_count += 1
            except asyncio.TimeoutError:
                self._dequeue()
                raise BulkheadTimeoutError(f"Timeout waiting for bulkhead '{self.name}'")
        else:
            await self._semaphore.acquire()

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if exc_type is not None:
            self._stats.failed_calls += 1
        self._semaphore.release()
        self._exit()
        return False

    def reset(self):
        """Reset bulkhead statistics."""
        self._stats = BulkheadStats()
        self._total_wait_time = 0.0

    def get_info(self) -> dict:
        """Get bulkhead information."""
        return {
            "name": self.name,
            "state": self.state.value,
            "max_concurrent": self.max_concurrent,
            "max_queue": self.max_queue,
            "current_concurrent": self._concurrent_count,
            "current_queued": self._queue_count,
            "available_slots": self.available_slots,
            "stats": {
                "total_calls": self._stats.total_calls,
                "accepted_calls": self._stats.accepted_calls,
                "rejected_calls": self._stats.rejected_calls,
                "completed_calls": self._stats.completed_calls,
                "failed_calls": self._stats.failed_calls,
                "timeout_calls": self._stats.timeout_calls,
                "max_concurrent_reached": self._stats.max_concurrent_reached,
            },
        }


class BulkheadFullError(Exception):
    """Raised when bulkhead is at capacity."""
    pass


class BulkheadTimeoutError(Exception):
    """Raised when waiting for bulkhead times out."""
    pass


class BulkheadRegistry:
    """Registry for managing multiple bulkheads.

    Usage:
        registry = BulkheadRegistry()

        # Get or create
        bh = registry.get_or_create("api-pool", max_concurrent=10)

        # List all
        for name, bh in registry.all():
            print(name, bh.state)
    """

    def __init__(self):
        """Initialize registry."""
        self._bulkheads: Dict[str, Bulkhead] = {}
        self._lock = threading.Lock()

    def get(self, name: str) -> Optional[Bulkhead]:
        """Get bulkhead by name."""
        return self._bulkheads.get(name)

    def get_or_create(
        self,
        name: str,
        max_concurrent: int = 10,
        max_queue: int = 100,
        queue_timeout: float = 30.0,
    ) -> Bulkhead:
        """Get existing or create new bulkhead."""
        with self._lock:
            if name not in self._bulkheads:
                self._bulkheads[name] = Bulkhead(
                    name=name,
                    max_concurrent=max_concurrent,
                    max_queue=max_queue,
                    queue_timeout=queue_timeout,
                )
            return self._bulkheads[name]

    def remove(self, name: str) -> bool:
        """Remove bulkhead."""
        with self._lock:
            return self._bulkheads.pop(name, None) is not None

    def all(self) -> list:
        """Get all bulkheads."""
        return list(self._bulkheads.items())

    def reset_all(self):
        """Reset all bulkheads."""
        for bh in self._bulkheads.values():
            bh.reset()

    def get_all_stats(self) -> Dict[str, dict]:
        """Get stats for all bulkheads."""
        return {name: bh.get_info() for name, bh in self._bulkheads.items()}

    def get_saturated(self) -> list:
        """Get names of saturated bulkheads."""
        return [name for name, bh in self._bulkheads.items() if bh.is_saturated]

    def get_health_summary(self) -> dict:
        """Get health summary."""
        total = len(self._bulkheads)
        accepting = sum(1 for bh in self._bulkheads.values() if bh.is_accepting)
        saturated = sum(1 for bh in self._bulkheads.values() if bh.state == BulkheadState.SATURATED)
        queue_full = sum(1 for bh in self._bulkheads.values() if bh.state == BulkheadState.QUEUE_FULL)

        return {
            "total": total,
            "accepting": accepting,
            "saturated": saturated,
            "queue_full": queue_full,
            "healthy": accepting == total,
        }


# Singleton instances
bulkhead_registry = BulkheadRegistry()


def bulkhead(
    name: str,
    max_concurrent: int = 10,
    max_queue: int = 100,
    queue_timeout: float = 30.0,
) -> Callable:
    """Decorator factory for bulkhead.

    Usage:
        @bulkhead("my-pool", max_concurrent=5)
        async def call_api():
            return await external_api()
    """
    bh = bulkhead_registry.get_or_create(
        name=name,
        max_concurrent=max_concurrent,
        max_queue=max_queue,
        queue_timeout=queue_timeout,
    )
    return bh
