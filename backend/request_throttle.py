"""
Request Throttle - Sprint 781

Request throttling and concurrency control.

Features:
- Token bucket algorithm
- Sliding window rate limiting
- Concurrent request limiting
- Per-key throttling
- Backpressure support
- Adaptive throttling
"""

import asyncio
import time
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Awaitable, Set
)
from enum import Enum
from abc import ABC, abstractmethod
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


T = TypeVar("T")


class ThrottleResult(str, Enum):
    """Throttle check result."""
    ALLOWED = "allowed"
    THROTTLED = "throttled"
    REJECTED = "rejected"


@dataclass
class ThrottleState:
    """Current throttle state for a key."""
    key: str
    allowed: bool
    remaining: int
    reset_at: float
    retry_after: Optional[float] = None
    current_rate: float = 0.0
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "allowed": self.allowed,
            "remaining": self.remaining,
            "reset_at": self.reset_at,
            "retry_after": self.retry_after,
            "current_rate": round(self.current_rate, 2),
        }


class Throttle(ABC):
    """Abstract throttle interface."""

    @abstractmethod
    async def acquire(self, key: str = "default") -> ThrottleState:
        """Try to acquire a slot. Returns state with allowed/denied."""
        pass

    @abstractmethod
    async def release(self, key: str = "default") -> None:
        """Release a slot (for concurrency-based throttles)."""
        pass

    @abstractmethod
    def get_state(self, key: str = "default") -> ThrottleState:
        """Get current state without consuming."""
        pass


class TokenBucketThrottle(Throttle):
    """Token bucket rate limiter.

    Allows bursts up to bucket_size, refills at rate tokens/second.

    Usage:
        throttle = TokenBucketThrottle(rate=10, bucket_size=100)
        state = await throttle.acquire("user-123")
        if state.allowed:
            # Process request
            pass
    """

    def __init__(
        self,
        rate: float,
        bucket_size: int,
        initial_tokens: Optional[int] = None,
    ):
        self.rate = rate  # tokens per second
        self.bucket_size = bucket_size
        self._buckets: Dict[str, float] = {}
        self._last_update: Dict[str, float] = {}
        self._lock = threading.Lock()

        if initial_tokens is not None:
            self._default_tokens = min(initial_tokens, bucket_size)
        else:
            self._default_tokens = bucket_size

    def _refill(self, key: str) -> float:
        """Refill tokens based on elapsed time."""
        now = time.time()
        last = self._last_update.get(key, now)
        elapsed = now - last

        current = self._buckets.get(key, self._default_tokens)
        refilled = min(self.bucket_size, current + elapsed * self.rate)

        self._buckets[key] = refilled
        self._last_update[key] = now

        return refilled

    async def acquire(self, key: str = "default") -> ThrottleState:
        with self._lock:
            tokens = self._refill(key)

            if tokens >= 1:
                self._buckets[key] = tokens - 1
                return ThrottleState(
                    key=key,
                    allowed=True,
                    remaining=int(self._buckets[key]),
                    reset_at=time.time() + (self.bucket_size - self._buckets[key]) / self.rate,
                    current_rate=self.rate,
                )
            else:
                wait_time = (1 - tokens) / self.rate
                return ThrottleState(
                    key=key,
                    allowed=False,
                    remaining=0,
                    reset_at=time.time() + wait_time,
                    retry_after=wait_time,
                    current_rate=self.rate,
                    message="Rate limit exceeded",
                )

    async def release(self, key: str = "default") -> None:
        # Token bucket doesn't need explicit release
        pass

    def get_state(self, key: str = "default") -> ThrottleState:
        with self._lock:
            tokens = self._refill(key)
            return ThrottleState(
                key=key,
                allowed=tokens >= 1,
                remaining=int(tokens),
                reset_at=time.time() + (self.bucket_size - tokens) / self.rate,
                current_rate=self.rate,
            )


class SlidingWindowThrottle(Throttle):
    """Sliding window rate limiter.

    Tracks requests in a time window for smooth rate limiting.
    """

    def __init__(
        self,
        limit: int,
        window_seconds: float,
        precision: int = 10,
    ):
        self.limit = limit
        self.window_seconds = window_seconds
        self.precision = precision  # Number of sub-windows
        self._requests: Dict[str, List[tuple]] = defaultdict(list)
        self._lock = threading.Lock()

    def _clean_old(self, key: str, now: float) -> None:
        """Remove requests outside the window."""
        cutoff = now - self.window_seconds
        self._requests[key] = [
            (ts, count) for ts, count in self._requests[key]
            if ts > cutoff
        ]

    def _count_requests(self, key: str, now: float) -> int:
        """Count requests in current window."""
        self._clean_old(key, now)
        return sum(count for _, count in self._requests[key])

    async def acquire(self, key: str = "default") -> ThrottleState:
        now = time.time()

        with self._lock:
            current = self._count_requests(key, now)

            if current < self.limit:
                # Add to current sub-window
                sub_window = int(now * self.precision / self.window_seconds)
                sub_window_key = sub_window * self.window_seconds / self.precision

                # Merge with existing sub-window or add new
                updated = False
                for i, (ts, count) in enumerate(self._requests[key]):
                    if abs(ts - sub_window_key) < self.window_seconds / self.precision:
                        self._requests[key][i] = (ts, count + 1)
                        updated = True
                        break

                if not updated:
                    self._requests[key].append((sub_window_key, 1))

                remaining = self.limit - current - 1
                reset_at = now + self.window_seconds

                return ThrottleState(
                    key=key,
                    allowed=True,
                    remaining=remaining,
                    reset_at=reset_at,
                    current_rate=current / self.window_seconds,
                )
            else:
                # Find when oldest request expires
                if self._requests[key]:
                    oldest = min(ts for ts, _ in self._requests[key])
                    retry_after = oldest + self.window_seconds - now
                else:
                    retry_after = self.window_seconds

                return ThrottleState(
                    key=key,
                    allowed=False,
                    remaining=0,
                    reset_at=now + retry_after,
                    retry_after=max(0, retry_after),
                    current_rate=current / self.window_seconds,
                    message="Rate limit exceeded",
                )

    async def release(self, key: str = "default") -> None:
        pass

    def get_state(self, key: str = "default") -> ThrottleState:
        now = time.time()
        with self._lock:
            current = self._count_requests(key, now)
            return ThrottleState(
                key=key,
                allowed=current < self.limit,
                remaining=max(0, self.limit - current),
                reset_at=now + self.window_seconds,
                current_rate=current / self.window_seconds,
            )


class ConcurrencyThrottle(Throttle):
    """Concurrent request limiter.

    Limits number of simultaneous requests.
    """

    def __init__(self, max_concurrent: int):
        self.max_concurrent = max_concurrent
        self._active: Dict[str, int] = defaultdict(int)
        self._lock = threading.Lock()

    async def acquire(self, key: str = "default") -> ThrottleState:
        with self._lock:
            current = self._active[key]

            if current < self.max_concurrent:
                self._active[key] = current + 1
                return ThrottleState(
                    key=key,
                    allowed=True,
                    remaining=self.max_concurrent - current - 1,
                    reset_at=0,  # N/A for concurrency
                    current_rate=current + 1,
                )
            else:
                return ThrottleState(
                    key=key,
                    allowed=False,
                    remaining=0,
                    reset_at=0,
                    retry_after=0.1,  # Suggest retry soon
                    current_rate=current,
                    message="Too many concurrent requests",
                )

    async def release(self, key: str = "default") -> None:
        with self._lock:
            self._active[key] = max(0, self._active[key] - 1)

    def get_state(self, key: str = "default") -> ThrottleState:
        with self._lock:
            current = self._active[key]
            return ThrottleState(
                key=key,
                allowed=current < self.max_concurrent,
                remaining=self.max_concurrent - current,
                reset_at=0,
                current_rate=current,
            )


class AdaptiveThrottle(Throttle):
    """Adaptive rate limiter that adjusts based on error rates.

    Reduces rate when errors increase, recovers when stable.
    """

    def __init__(
        self,
        base_rate: float,
        min_rate: float,
        max_rate: float,
        window_seconds: float = 60.0,
        error_threshold: float = 0.1,
        recovery_rate: float = 1.1,
        reduction_rate: float = 0.5,
    ):
        self.base_rate = base_rate
        self.min_rate = min_rate
        self.max_rate = max_rate
        self.window_seconds = window_seconds
        self.error_threshold = error_threshold
        self.recovery_rate = recovery_rate
        self.reduction_rate = reduction_rate

        self._current_rates: Dict[str, float] = {}
        self._success_counts: Dict[str, int] = defaultdict(int)
        self._error_counts: Dict[str, int] = defaultdict(int)
        self._last_adjustment: Dict[str, float] = {}
        self._inner_throttle: Dict[str, TokenBucketThrottle] = {}
        self._lock = threading.Lock()

    def _get_inner_throttle(self, key: str) -> TokenBucketThrottle:
        if key not in self._inner_throttle:
            rate = self._current_rates.get(key, self.base_rate)
            self._inner_throttle[key] = TokenBucketThrottle(
                rate=rate,
                bucket_size=int(rate * 10),
            )
        return self._inner_throttle[key]

    def _adjust_rate(self, key: str) -> None:
        now = time.time()
        last = self._last_adjustment.get(key, 0)

        if now - last < self.window_seconds:
            return

        total = self._success_counts[key] + self._error_counts[key]
        if total == 0:
            return

        error_rate = self._error_counts[key] / total
        current_rate = self._current_rates.get(key, self.base_rate)

        if error_rate > self.error_threshold:
            # Reduce rate
            new_rate = max(self.min_rate, current_rate * self.reduction_rate)
            logger.info("Reducing rate for " + key + " from " + str(current_rate) + " to " + str(new_rate))
        else:
            # Recover rate
            new_rate = min(self.max_rate, current_rate * self.recovery_rate)

        self._current_rates[key] = new_rate
        self._inner_throttle[key] = TokenBucketThrottle(
            rate=new_rate,
            bucket_size=int(new_rate * 10),
        )

        # Reset counters
        self._success_counts[key] = 0
        self._error_counts[key] = 0
        self._last_adjustment[key] = now

    async def acquire(self, key: str = "default") -> ThrottleState:
        with self._lock:
            self._adjust_rate(key)
            throttle = self._get_inner_throttle(key)

        state = await throttle.acquire(key)
        state.current_rate = self._current_rates.get(key, self.base_rate)
        return state

    async def release(self, key: str = "default") -> None:
        pass

    def record_success(self, key: str = "default") -> None:
        """Record a successful request."""
        with self._lock:
            self._success_counts[key] += 1

    def record_error(self, key: str = "default") -> None:
        """Record a failed request."""
        with self._lock:
            self._error_counts[key] += 1

    def get_state(self, key: str = "default") -> ThrottleState:
        with self._lock:
            throttle = self._get_inner_throttle(key)
        state = throttle.get_state(key)
        state.current_rate = self._current_rates.get(key, self.base_rate)
        return state


class CompositeThrottle(Throttle):
    """Combine multiple throttles (all must allow)."""

    def __init__(self, *throttles: Throttle):
        self._throttles = throttles

    async def acquire(self, key: str = "default") -> ThrottleState:
        states = []
        for throttle in self._throttles:
            state = await throttle.acquire(key)
            states.append(state)

            if not state.allowed:
                # Release any already acquired
                for i, t in enumerate(self._throttles[:len(states) - 1]):
                    await t.release(key)
                return state

        # All allowed - return most restrictive state
        return min(states, key=lambda s: s.remaining)

    async def release(self, key: str = "default") -> None:
        for throttle in self._throttles:
            await throttle.release(key)

    def get_state(self, key: str = "default") -> ThrottleState:
        states = [t.get_state(key) for t in self._throttles]
        denied = [s for s in states if not s.allowed]
        if denied:
            return denied[0]
        return min(states, key=lambda s: s.remaining)


class ThrottleManager:
    """Manage throttles for different keys/routes.

    Usage:
        manager = ThrottleManager()
        manager.add_throttle("api", TokenBucketThrottle(10, 100))
        manager.add_throttle("api", ConcurrencyThrottle(50))

        async def handle_request(user_id):
            state = await manager.acquire("api", user_id)
            if not state.allowed:
                raise RateLimitError(state.retry_after)
            try:
                # Process
                pass
            finally:
                await manager.release("api", user_id)
    """

    def __init__(self):
        self._throttles: Dict[str, List[Throttle]] = defaultdict(list)

    def add_throttle(self, name: str, throttle: Throttle) -> "ThrottleManager":
        """Add throttle for a named route."""
        self._throttles[name].append(throttle)
        return self

    def add_rate_limit(
        self,
        name: str,
        rate: float,
        bucket_size: Optional[int] = None,
    ) -> "ThrottleManager":
        """Add token bucket rate limit."""
        self._throttles[name].append(
            TokenBucketThrottle(rate, bucket_size or int(rate * 10))
        )
        return self

    def add_concurrency_limit(
        self,
        name: str,
        max_concurrent: int,
    ) -> "ThrottleManager":
        """Add concurrency limit."""
        self._throttles[name].append(ConcurrencyThrottle(max_concurrent))
        return self

    async def acquire(self, name: str, key: str = "default") -> ThrottleState:
        """Acquire slots from all throttles."""
        throttles = self._throttles.get(name, [])
        if not throttles:
            return ThrottleState(
                key=key,
                allowed=True,
                remaining=999,
                reset_at=0,
            )

        composite = CompositeThrottle(*throttles)
        return await composite.acquire(key)

    async def release(self, name: str, key: str = "default") -> None:
        """Release slots from all throttles."""
        for throttle in self._throttles.get(name, []):
            await throttle.release(key)

    def get_state(self, name: str, key: str = "default") -> ThrottleState:
        """Get combined state."""
        throttles = self._throttles.get(name, [])
        if not throttles:
            return ThrottleState(key=key, allowed=True, remaining=999, reset_at=0)

        composite = CompositeThrottle(*throttles)
        return composite.get_state(key)


class ThrottleContext:
    """Context manager for throttled operations."""

    def __init__(
        self,
        throttle: Throttle,
        key: str = "default",
        raise_on_throttle: bool = True,
    ):
        self._throttle = throttle
        self._key = key
        self._raise_on_throttle = raise_on_throttle
        self._state: Optional[ThrottleState] = None

    @property
    def state(self) -> Optional[ThrottleState]:
        return self._state

    async def __aenter__(self) -> ThrottleState:
        self._state = await self._throttle.acquire(self._key)
        if not self._state.allowed and self._raise_on_throttle:
            raise ThrottleError(self._state)
        return self._state

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._throttle.release(self._key)
        return False


class ThrottleError(Exception):
    """Raised when request is throttled."""

    def __init__(self, state: ThrottleState):
        self.state = state
        super().__init__(state.message or "Request throttled")


# Convenience functions
def token_bucket(
    rate: float,
    bucket_size: Optional[int] = None,
) -> TokenBucketThrottle:
    """Create token bucket throttle."""
    return TokenBucketThrottle(rate, bucket_size or int(rate * 10))


def sliding_window(
    limit: int,
    window_seconds: float,
) -> SlidingWindowThrottle:
    """Create sliding window throttle."""
    return SlidingWindowThrottle(limit, window_seconds)


def concurrency(max_concurrent: int) -> ConcurrencyThrottle:
    """Create concurrency throttle."""
    return ConcurrencyThrottle(max_concurrent)


def adaptive(
    base_rate: float,
    min_rate: float,
    max_rate: float,
) -> AdaptiveThrottle:
    """Create adaptive throttle."""
    return AdaptiveThrottle(base_rate, min_rate, max_rate)
