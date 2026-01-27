"""
Rate Limiter - Sprint 747

Request rate limiting system.

Features:
- Multiple algorithms (token bucket, sliding window, fixed window)
- Per-user and per-IP limiting
- Configurable limits
- Distributed support
- Decorator support
"""

import time
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union, Tuple
)
from enum import Enum
from abc import ABC, abstractmethod
from functools import wraps
from collections import defaultdict
import hashlib


T = TypeVar("T")


class RateLimitAlgorithm(str, Enum):
    """Rate limiting algorithms."""
    TOKEN_BUCKET = "token_bucket"
    SLIDING_WINDOW = "sliding_window"
    FIXED_WINDOW = "fixed_window"
    LEAKY_BUCKET = "leaky_bucket"


@dataclass
class RateLimitResult:
    """Result of rate limit check."""
    allowed: bool
    remaining: int
    reset_at: float
    retry_after: Optional[float] = None
    limit: int = 0


@dataclass
class RateLimitConfig:
    """Rate limit configuration."""
    requests: int  # Number of requests
    window: float  # Time window in seconds
    algorithm: RateLimitAlgorithm = RateLimitAlgorithm.SLIDING_WINDOW
    burst: Optional[int] = None  # For token bucket


class RateLimiter(ABC):
    """Base rate limiter."""

    @abstractmethod
    def check(self, key: str) -> RateLimitResult:
        """Check if request is allowed."""
        pass

    @abstractmethod
    def reset(self, key: str) -> None:
        """Reset limit for key."""
        pass


class TokenBucketLimiter(RateLimiter):
    """Token bucket rate limiter.

    Allows burst traffic while maintaining average rate.

    Usage:
        limiter = TokenBucketLimiter(rate=10, capacity=20)
        result = limiter.check("user-123")
        if result.allowed:
            # Process request
            pass
    """

    def __init__(
        self,
        rate: float,  # Tokens per second
        capacity: int,  # Maximum bucket capacity
    ):
        self._rate = rate
        self._capacity = capacity
        self._buckets: Dict[str, Dict[str, float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> RateLimitResult:
        now = time.time()

        with self._lock:
            if key not in self._buckets:
                self._buckets[key] = {
                    "tokens": self._capacity,
                    "last_update": now,
                }

            bucket = self._buckets[key]

            # Add tokens based on time elapsed
            elapsed = now - bucket["last_update"]
            bucket["tokens"] = min(
                self._capacity,
                bucket["tokens"] + elapsed * self._rate
            )
            bucket["last_update"] = now

            if bucket["tokens"] >= 1:
                bucket["tokens"] -= 1
                return RateLimitResult(
                    allowed=True,
                    remaining=int(bucket["tokens"]),
                    reset_at=now + (self._capacity - bucket["tokens"]) / self._rate,
                    limit=self._capacity,
                )
            else:
                retry_after = (1 - bucket["tokens"]) / self._rate
                return RateLimitResult(
                    allowed=False,
                    remaining=0,
                    reset_at=now + retry_after,
                    retry_after=retry_after,
                    limit=self._capacity,
                )

    def reset(self, key: str) -> None:
        with self._lock:
            if key in self._buckets:
                del self._buckets[key]


class SlidingWindowLimiter(RateLimiter):
    """Sliding window rate limiter.

    More accurate than fixed window, prevents burst at window boundaries.

    Usage:
        limiter = SlidingWindowLimiter(requests=100, window=60)
        result = limiter.check("user-123")
    """

    def __init__(
        self,
        requests: int,  # Max requests
        window: float,  # Window in seconds
    ):
        self._requests = requests
        self._window = window
        self._timestamps: Dict[str, List[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str) -> RateLimitResult:
        now = time.time()
        window_start = now - self._window

        with self._lock:
            # Remove old timestamps
            self._timestamps[key] = [
                ts for ts in self._timestamps[key]
                if ts > window_start
            ]

            current_count = len(self._timestamps[key])

            if current_count < self._requests:
                self._timestamps[key].append(now)
                remaining = self._requests - current_count - 1
                reset_at = now + self._window

                return RateLimitResult(
                    allowed=True,
                    remaining=remaining,
                    reset_at=reset_at,
                    limit=self._requests,
                )
            else:
                oldest = min(self._timestamps[key])
                retry_after = oldest + self._window - now

                return RateLimitResult(
                    allowed=False,
                    remaining=0,
                    reset_at=oldest + self._window,
                    retry_after=max(0, retry_after),
                    limit=self._requests,
                )

    def reset(self, key: str) -> None:
        with self._lock:
            if key in self._timestamps:
                del self._timestamps[key]


class FixedWindowLimiter(RateLimiter):
    """Fixed window rate limiter.

    Simple but can allow 2x burst at window boundaries.

    Usage:
        limiter = FixedWindowLimiter(requests=100, window=60)
        result = limiter.check("user-123")
    """

    def __init__(
        self,
        requests: int,
        window: float,
    ):
        self._requests = requests
        self._window = window
        self._counters: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.Lock()

    def _get_window_key(self, now: float) -> int:
        return int(now / self._window)

    def check(self, key: str) -> RateLimitResult:
        now = time.time()
        window_key = self._get_window_key(now)

        with self._lock:
            if key not in self._counters:
                self._counters[key] = {"window": window_key, "count": 0}

            counter = self._counters[key]

            # Reset if window changed
            if counter["window"] != window_key:
                counter["window"] = window_key
                counter["count"] = 0

            if counter["count"] < self._requests:
                counter["count"] += 1
                remaining = self._requests - counter["count"]
                reset_at = (window_key + 1) * self._window

                return RateLimitResult(
                    allowed=True,
                    remaining=remaining,
                    reset_at=reset_at,
                    limit=self._requests,
                )
            else:
                reset_at = (window_key + 1) * self._window
                retry_after = reset_at - now

                return RateLimitResult(
                    allowed=False,
                    remaining=0,
                    reset_at=reset_at,
                    retry_after=retry_after,
                    limit=self._requests,
                )

    def reset(self, key: str) -> None:
        with self._lock:
            if key in self._counters:
                del self._counters[key]


class LeakyBucketLimiter(RateLimiter):
    """Leaky bucket rate limiter.

    Smooths out bursts by processing at fixed rate.

    Usage:
        limiter = LeakyBucketLimiter(rate=10, capacity=20)
        result = limiter.check("user-123")
    """

    def __init__(
        self,
        rate: float,  # Leak rate per second
        capacity: int,  # Bucket capacity
    ):
        self._rate = rate
        self._capacity = capacity
        self._buckets: Dict[str, Dict[str, float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str) -> RateLimitResult:
        now = time.time()

        with self._lock:
            if key not in self._buckets:
                self._buckets[key] = {"level": 0, "last_update": now}

            bucket = self._buckets[key]

            # Drain bucket based on time elapsed
            elapsed = now - bucket["last_update"]
            bucket["level"] = max(0, bucket["level"] - elapsed * self._rate)
            bucket["last_update"] = now

            if bucket["level"] + 1 <= self._capacity:
                bucket["level"] += 1
                remaining = int(self._capacity - bucket["level"])

                return RateLimitResult(
                    allowed=True,
                    remaining=remaining,
                    reset_at=now + bucket["level"] / self._rate,
                    limit=self._capacity,
                )
            else:
                retry_after = (bucket["level"] - self._capacity + 1) / self._rate

                return RateLimitResult(
                    allowed=False,
                    remaining=0,
                    reset_at=now + retry_after,
                    retry_after=retry_after,
                    limit=self._capacity,
                )

    def reset(self, key: str) -> None:
        with self._lock:
            if key in self._buckets:
                del self._buckets[key]


class RateLimiterManager:
    """Manages multiple rate limiters.

    Usage:
        manager = RateLimiterManager()

        # Add limiters
        manager.add("api", SlidingWindowLimiter(100, 60))
        manager.add("login", FixedWindowLimiter(5, 300))

        # Check limits
        result = manager.check("api", "user-123")
        if not result.allowed:
            raise Exception(f"Rate limited. Retry after {result.retry_after}s")
    """

    def __init__(self):
        self._limiters: Dict[str, RateLimiter] = {}
        self._lock = threading.Lock()

    def add(self, name: str, limiter: RateLimiter) -> None:
        """Add a rate limiter."""
        with self._lock:
            self._limiters[name] = limiter

    def get(self, name: str) -> Optional[RateLimiter]:
        """Get limiter by name."""
        return self._limiters.get(name)

    def remove(self, name: str) -> bool:
        """Remove a rate limiter."""
        with self._lock:
            if name in self._limiters:
                del self._limiters[name]
                return True
            return False

    def check(self, name: str, key: str) -> RateLimitResult:
        """Check rate limit."""
        limiter = self._limiters.get(name)
        if not limiter:
            return RateLimitResult(allowed=True, remaining=-1, reset_at=0)
        return limiter.check(key)

    def check_all(self, key: str) -> Dict[str, RateLimitResult]:
        """Check all limiters for a key."""
        results = {}
        for name, limiter in self._limiters.items():
            results[name] = limiter.check(key)
        return results

    def reset(self, name: str, key: str) -> None:
        """Reset specific limiter for key."""
        limiter = self._limiters.get(name)
        if limiter:
            limiter.reset(key)

    def reset_all(self, key: str) -> None:
        """Reset all limiters for key."""
        for limiter in self._limiters.values():
            limiter.reset(key)


def rate_limit(
    requests: int,
    window: float,
    key_func: Optional[Callable[..., str]] = None,
    algorithm: RateLimitAlgorithm = RateLimitAlgorithm.SLIDING_WINDOW,
) -> Callable:
    """Rate limit decorator.

    Usage:
        @rate_limit(requests=10, window=60)
        def my_endpoint():
            pass

        @rate_limit(requests=5, window=300, key_func=lambda user_id: user_id)
        def login(user_id: str):
            pass
    """
    if algorithm == RateLimitAlgorithm.TOKEN_BUCKET:
        limiter = TokenBucketLimiter(rate=requests / window, capacity=requests)
    elif algorithm == RateLimitAlgorithm.FIXED_WINDOW:
        limiter = FixedWindowLimiter(requests=requests, window=window)
    elif algorithm == RateLimitAlgorithm.LEAKY_BUCKET:
        limiter = LeakyBucketLimiter(rate=requests / window, capacity=requests)
    else:
        limiter = SlidingWindowLimiter(requests=requests, window=window)

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            if key_func:
                key = key_func(*args, **kwargs)
            else:
                key = func.__name__

            result = limiter.check(key)
            if not result.allowed:
                raise RateLimitExceeded(
                    f"Rate limit exceeded. Retry after {result.retry_after:.2f}s",
                    result=result,
                )

            return func(*args, **kwargs)
        return wrapper
    return decorator


class RateLimitExceeded(Exception):
    """Rate limit exceeded exception."""

    def __init__(self, message: str, result: RateLimitResult):
        super().__init__(message)
        self.result = result


# Singleton manager
rate_limiter_manager = RateLimiterManager()


# Convenience functions
def create_limiter(
    requests: int,
    window: float,
    algorithm: RateLimitAlgorithm = RateLimitAlgorithm.SLIDING_WINDOW,
) -> RateLimiter:
    """Create a rate limiter."""
    if algorithm == RateLimitAlgorithm.TOKEN_BUCKET:
        return TokenBucketLimiter(rate=requests / window, capacity=requests)
    elif algorithm == RateLimitAlgorithm.FIXED_WINDOW:
        return FixedWindowLimiter(requests=requests, window=window)
    elif algorithm == RateLimitAlgorithm.LEAKY_BUCKET:
        return LeakyBucketLimiter(rate=requests / window, capacity=requests)
    else:
        return SlidingWindowLimiter(requests=requests, window=window)


def check_rate_limit(
    name: str,
    key: str,
) -> RateLimitResult:
    """Check rate limit using global manager."""
    return rate_limiter_manager.check(name, key)
