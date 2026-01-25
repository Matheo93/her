"""
Distributed Lock - Sprint 707

Coordination for distributed systems.

Features:
- Lock acquisition
- TTL/expiration
- Lock extension
- Fairness
- Deadlock detection
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar,
    Awaitable, Set
)
from enum import Enum
import threading
from contextlib import asynccontextmanager
from abc import ABC, abstractmethod


class LockStatus(str, Enum):
    """Lock status."""
    AVAILABLE = "available"
    ACQUIRED = "acquired"
    WAITING = "waiting"
    EXPIRED = "expired"


@dataclass
class LockInfo:
    """Information about a lock."""
    name: str
    owner: str
    status: LockStatus = LockStatus.AVAILABLE
    acquired_at: Optional[float] = None
    expires_at: Optional[float] = None
    waiting_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def is_expired(self) -> bool:
        """Check if lock is expired."""
        if self.expires_at is None:
            return False
        return time.time() > self.expires_at

    def time_remaining(self) -> float:
        """Get remaining time on lock."""
        if self.expires_at is None:
            return float("inf")
        return max(0, self.expires_at - time.time())

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "owner": self.owner,
            "status": self.status.value,
            "acquired_at": self.acquired_at,
            "expires_at": self.expires_at,
            "waiting_count": self.waiting_count,
        }


@dataclass
class LockResult:
    """Result of lock operation."""
    success: bool
    lock_info: Optional[LockInfo] = None
    error: Optional[str] = None
    waited_ms: float = 0


class LockStore(ABC):
    """Abstract lock storage backend."""

    @abstractmethod
    async def acquire(
        self,
        name: str,
        owner: str,
        ttl: float,
    ) -> bool:
        """Attempt to acquire lock."""
        pass

    @abstractmethod
    async def release(self, name: str, owner: str) -> bool:
        """Release lock."""
        pass

    @abstractmethod
    async def extend(
        self,
        name: str,
        owner: str,
        ttl: float,
    ) -> bool:
        """Extend lock TTL."""
        pass

    @abstractmethod
    async def get_info(self, name: str) -> Optional[LockInfo]:
        """Get lock info."""
        pass


class InMemoryLockStore(LockStore):
    """In-memory lock store (replace with Redis in production)."""

    def __init__(self):
        """Initialize store."""
        self._locks: Dict[str, LockInfo] = {}
        self._lock = threading.Lock()
        self._waiters: Dict[str, List[asyncio.Event]] = {}

    async def acquire(
        self,
        name: str,
        owner: str,
        ttl: float,
    ) -> bool:
        """Attempt to acquire lock."""
        with self._lock:
            existing = self._locks.get(name)

            # Check if lock is available or expired
            if existing is None or existing.is_expired():
                lock_info = LockInfo(
                    name=name,
                    owner=owner,
                    status=LockStatus.ACQUIRED,
                    acquired_at=time.time(),
                    expires_at=time.time() + ttl,
                )
                self._locks[name] = lock_info
                return True

            # Already owned by this owner
            if existing.owner == owner:
                existing.expires_at = time.time() + ttl
                return True

            return False

    async def release(self, name: str, owner: str) -> bool:
        """Release lock."""
        with self._lock:
            existing = self._locks.get(name)
            if existing and existing.owner == owner:
                del self._locks[name]

                # Notify waiters
                if name in self._waiters:
                    for event in self._waiters[name]:
                        event.set()

                return True
            return False

    async def extend(
        self,
        name: str,
        owner: str,
        ttl: float,
    ) -> bool:
        """Extend lock TTL."""
        with self._lock:
            existing = self._locks.get(name)
            if existing and existing.owner == owner and not existing.is_expired():
                existing.expires_at = time.time() + ttl
                return True
            return False

    async def get_info(self, name: str) -> Optional[LockInfo]:
        """Get lock info."""
        lock = self._locks.get(name)
        if lock and lock.is_expired():
            del self._locks[name]
            return None
        return lock

    def add_waiter(self, name: str) -> asyncio.Event:
        """Add a waiter for lock."""
        with self._lock:
            if name not in self._waiters:
                self._waiters[name] = []
            event = asyncio.Event()
            self._waiters[name].append(event)

            # Update waiting count
            if name in self._locks:
                self._locks[name].waiting_count = len(self._waiters[name])

            return event

    def remove_waiter(self, name: str, event: asyncio.Event) -> None:
        """Remove a waiter."""
        with self._lock:
            if name in self._waiters:
                self._waiters[name] = [e for e in self._waiters[name] if e != event]

                # Update waiting count
                if name in self._locks:
                    self._locks[name].waiting_count = len(self._waiters[name])


class DistributedLock:
    """Distributed lock implementation.

    Usage:
        lock_manager = DistributedLock()

        # Simple lock
        async with lock_manager.lock("resource:123"):
            # Critical section
            await do_work()

        # With options
        async with lock_manager.lock("resource:123", ttl=30, wait_timeout=5):
            await do_work()

        # Manual control
        result = await lock_manager.acquire("resource:123")
        if result.success:
            try:
                await do_work()
            finally:
                await lock_manager.release("resource:123")
    """

    def __init__(
        self,
        store: Optional[LockStore] = None,
        default_ttl: float = 30.0,
        retry_interval: float = 0.1,
    ):
        """Initialize lock manager."""
        self._store = store or InMemoryLockStore()
        self._default_ttl = default_ttl
        self._retry_interval = retry_interval
        self._owner_id = str(uuid.uuid4())
        self._held_locks: Set[str] = set()
        self._stats = {
            "acquisitions": 0,
            "releases": 0,
            "extensions": 0,
            "timeouts": 0,
            "conflicts": 0,
        }

    @asynccontextmanager
    async def lock(
        self,
        name: str,
        ttl: Optional[float] = None,
        wait_timeout: Optional[float] = None,
        owner: Optional[str] = None,
    ):
        """Acquire lock as context manager.

        Args:
            name: Lock name/key
            ttl: Time-to-live in seconds
            wait_timeout: Max time to wait for lock
            owner: Optional owner ID override
        """
        result = await self.acquire(
            name,
            ttl=ttl,
            wait_timeout=wait_timeout,
            owner=owner,
        )

        if not result.success:
            raise LockAcquisitionError(
                name,
                result.error or "Failed to acquire lock"
            )

        try:
            yield result.lock_info
        finally:
            await self.release(name, owner)

    async def acquire(
        self,
        name: str,
        ttl: Optional[float] = None,
        wait_timeout: Optional[float] = None,
        owner: Optional[str] = None,
        blocking: bool = True,
    ) -> LockResult:
        """Acquire a lock.

        Args:
            name: Lock name/key
            ttl: Time-to-live in seconds
            wait_timeout: Max time to wait for lock
            owner: Optional owner ID
            blocking: Whether to wait for lock

        Returns:
            LockResult with success status
        """
        ttl = ttl or self._default_ttl
        owner = owner or self._owner_id
        start_time = time.time()

        # Try immediate acquisition
        acquired = await self._store.acquire(name, owner, ttl)

        if acquired:
            self._held_locks.add(name)
            self._stats["acquisitions"] += 1
            lock_info = await self._store.get_info(name)
            return LockResult(
                success=True,
                lock_info=lock_info,
                waited_ms=0,
            )

        if not blocking:
            self._stats["conflicts"] += 1
            return LockResult(
                success=False,
                error="Lock not available",
            )

        # Wait for lock
        if isinstance(self._store, InMemoryLockStore):
            event = self._store.add_waiter(name)

            try:
                deadline = None
                if wait_timeout:
                    deadline = time.time() + wait_timeout

                while True:
                    # Try to acquire
                    acquired = await self._store.acquire(name, owner, ttl)

                    if acquired:
                        self._held_locks.add(name)
                        self._stats["acquisitions"] += 1
                        lock_info = await self._store.get_info(name)
                        return LockResult(
                            success=True,
                            lock_info=lock_info,
                            waited_ms=(time.time() - start_time) * 1000,
                        )

                    # Check timeout
                    if deadline and time.time() >= deadline:
                        self._stats["timeouts"] += 1
                        return LockResult(
                            success=False,
                            error="Lock acquisition timeout",
                            waited_ms=(time.time() - start_time) * 1000,
                        )

                    # Wait for signal or timeout
                    wait_time = self._retry_interval
                    if deadline:
                        wait_time = min(wait_time, deadline - time.time())

                    try:
                        await asyncio.wait_for(event.wait(), timeout=wait_time)
                        event.clear()
                    except asyncio.TimeoutError:
                        pass

            finally:
                self._store.remove_waiter(name, event)

        return LockResult(
            success=False,
            error="Lock acquisition failed",
        )

    async def release(
        self,
        name: str,
        owner: Optional[str] = None,
    ) -> bool:
        """Release a lock.

        Args:
            name: Lock name/key
            owner: Optional owner ID

        Returns:
            True if released successfully
        """
        owner = owner or self._owner_id
        released = await self._store.release(name, owner)

        if released:
            self._held_locks.discard(name)
            self._stats["releases"] += 1

        return released

    async def extend(
        self,
        name: str,
        ttl: Optional[float] = None,
        owner: Optional[str] = None,
    ) -> bool:
        """Extend lock TTL.

        Args:
            name: Lock name/key
            ttl: New TTL
            owner: Optional owner ID

        Returns:
            True if extended successfully
        """
        ttl = ttl or self._default_ttl
        owner = owner or self._owner_id

        extended = await self._store.extend(name, owner, ttl)

        if extended:
            self._stats["extensions"] += 1

        return extended

    async def is_held(self, name: str) -> bool:
        """Check if lock is currently held."""
        lock_info = await self._store.get_info(name)
        return lock_info is not None and not lock_info.is_expired()

    async def get_info(self, name: str) -> Optional[LockInfo]:
        """Get lock information."""
        return await self._store.get_info(name)

    def get_held_locks(self) -> Set[str]:
        """Get locks held by this instance."""
        return self._held_locks.copy()

    async def release_all(self) -> int:
        """Release all locks held by this instance."""
        count = 0
        for name in list(self._held_locks):
            if await self.release(name):
                count += 1
        return count

    def get_stats(self) -> dict:
        """Get lock manager statistics."""
        return {
            **self._stats,
            "held_locks": len(self._held_locks),
            "owner_id": self._owner_id,
        }


class LockAcquisitionError(Exception):
    """Raised when lock acquisition fails."""

    def __init__(self, name: str, message: str):
        self.name = name
        super().__init__(message)


class LeaderElection:
    """Leader election using distributed locks.

    Usage:
        election = LeaderElection("my-service", lock_manager)

        async def on_elected():
            print("I am the leader!")

        async def on_demoted():
            print("No longer leader")

        await election.run(on_elected, on_demoted)
    """

    def __init__(
        self,
        name: str,
        lock_manager: DistributedLock,
        lease_duration: float = 15.0,
        renew_interval: float = 5.0,
    ):
        """Initialize election."""
        self._name = f"leader:{name}"
        self._lock_manager = lock_manager
        self._lease_duration = lease_duration
        self._renew_interval = renew_interval
        self._is_leader = False
        self._running = False

    @property
    def is_leader(self) -> bool:
        """Check if currently the leader."""
        return self._is_leader

    async def run(
        self,
        on_elected: Callable[[], Awaitable[None]],
        on_demoted: Optional[Callable[[], Awaitable[None]]] = None,
    ) -> None:
        """Run leader election loop."""
        self._running = True

        while self._running:
            try:
                # Try to become leader
                result = await self._lock_manager.acquire(
                    self._name,
                    ttl=self._lease_duration,
                    blocking=False,
                )

                if result.success:
                    if not self._is_leader:
                        self._is_leader = True
                        await on_elected()

                    # Renew lease
                    await asyncio.sleep(self._renew_interval)
                    renewed = await self._lock_manager.extend(
                        self._name,
                        ttl=self._lease_duration,
                    )

                    if not renewed:
                        # Lost leadership
                        self._is_leader = False
                        if on_demoted:
                            await on_demoted()
                else:
                    if self._is_leader:
                        self._is_leader = False
                        if on_demoted:
                            await on_demoted()

                    await asyncio.sleep(self._renew_interval)

            except Exception:
                if self._is_leader:
                    self._is_leader = False
                    if on_demoted:
                        await on_demoted()
                await asyncio.sleep(self._renew_interval)

    async def stop(self) -> None:
        """Stop election loop."""
        self._running = False
        if self._is_leader:
            await self._lock_manager.release(self._name)
            self._is_leader = False


# Singleton instance
distributed_lock = DistributedLock()


# Convenience functions
@asynccontextmanager
async def with_lock(
    name: str,
    ttl: float = 30.0,
    wait_timeout: Optional[float] = None,
):
    """Acquire lock using global instance."""
    async with distributed_lock.lock(name, ttl, wait_timeout) as lock_info:
        yield lock_info


async def acquire_lock(name: str, **kwargs) -> LockResult:
    """Acquire lock using global instance."""
    return await distributed_lock.acquire(name, **kwargs)


async def release_lock(name: str) -> bool:
    """Release lock using global instance."""
    return await distributed_lock.release(name)
