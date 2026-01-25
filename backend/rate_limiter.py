"""
Rate Limiter - Sprint 657

Advanced rate limiting system.

Features:
- Token bucket algorithm
- Sliding window
- Per-user/IP limits
- Rate limit headers
- Distributed support
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable
from enum import Enum
from collections import defaultdict
import threading


class RateLimitStrategy(str, Enum):
    """Rate limit algorithms."""
    TOKEN_BUCKET = "token_bucket"
    SLIDING_WINDOW = "sliding_window"
    FIXED_WINDOW = "fixed_window"
    LEAKY_BUCKET = "leaky_bucket"


@dataclass
class RateLimitConfig:
    """Rate limit configuration."""
    requests: int = 100
    window_seconds: int = 60
    strategy: RateLimitStrategy = RateLimitStrategy.TOKEN_BUCKET
    burst_size: Optional[int] = None
    penalty_seconds: int = 0


@dataclass
class RateLimitResult:
    """Result of rate limit check."""
    allowed: bool
    remaining: int
    reset_at: float
    retry_after: Optional[int] = None
    limit: int = 0

    def to_headers(self) -> Dict[str, str]:
        """Convert to HTTP headers."""
        headers = {
            "X-RateLimit-Limit": str(self.limit),
            "X-RateLimit-Remaining": str(max(0, self.remaining)),
            "X-RateLimit-Reset": str(int(self.reset_at)),
        }
        if self.retry_after is not None:
            headers["Retry-After"] = str(self.retry_after)
        return headers


@dataclass
class TokenBucket:
    """Token bucket state."""
    tokens: float
    last_refill: float
    max_tokens: int
    refill_rate: float  # tokens per second


@dataclass
class SlidingWindow:
    """Sliding window state."""
    timestamps: List[float] = field(default_factory=list)
    window_seconds: int = 60


class RateLimiter:
    """Rate limiting system.

    Usage:
        limiter = RateLimiter()

        # Check rate limit
        result = limiter.check("user_123", config=RateLimitConfig(requests=100))
        if not result.allowed:
            return HTTPResponse(429, headers=result.to_headers())

        # Or use as decorator
        @limiter.limit(requests=100, window_seconds=60)
        async def handle_request(user_id: str):
            return {"status": "ok"}
    """

    def __init__(self):
        """Initialize rate limiter."""
        self._token_buckets: Dict[str, TokenBucket] = {}
        self._sliding_windows: Dict[str, SlidingWindow] = {}
        self._fixed_windows: Dict[str, Dict[str, int]] = defaultdict(dict)
        self._penalties: Dict[str, float] = {}
        self._lock = threading.Lock()
        self._stats = {
            "total_requests": 0,
            "allowed_requests": 0,
            "blocked_requests": 0,
        }

    def check(
        self,
        key: str,
        config: Optional[RateLimitConfig] = None,
        requests: int = 100,
        window_seconds: int = 60,
        strategy: RateLimitStrategy = RateLimitStrategy.TOKEN_BUCKET,
        burst_size: Optional[int] = None,
    ) -> RateLimitResult:
        """Check if request is allowed."""
        if config is None:
            config = RateLimitConfig(
                requests=requests,
                window_seconds=window_seconds,
                strategy=strategy,
                burst_size=burst_size,
            )

        with self._lock:
            self._stats["total_requests"] += 1

            # Check penalty
            if key in self._penalties:
                if time.time() < self._penalties[key]:
                    self._stats["blocked_requests"] += 1
                    return RateLimitResult(
                        allowed=False,
                        remaining=0,
                        reset_at=self._penalties[key],
                        retry_after=int(self._penalties[key] - time.time()),
                        limit=config.requests,
                    )
                else:
                    del self._penalties[key]

            # Apply strategy
            if config.strategy == RateLimitStrategy.TOKEN_BUCKET:
                result = self._check_token_bucket(key, config)
            elif config.strategy == RateLimitStrategy.SLIDING_WINDOW:
                result = self._check_sliding_window(key, config)
            elif config.strategy == RateLimitStrategy.FIXED_WINDOW:
                result = self._check_fixed_window(key, config)
            elif config.strategy == RateLimitStrategy.LEAKY_BUCKET:
                result = self._check_leaky_bucket(key, config)
            else:
                result = self._check_token_bucket(key, config)

            if result.allowed:
                self._stats["allowed_requests"] += 1
            else:
                self._stats["blocked_requests"] += 1
                if config.penalty_seconds > 0:
                    self._penalties[key] = time.time() + config.penalty_seconds

            return result

    def _check_token_bucket(self, key: str, config: RateLimitConfig) -> RateLimitResult:
        """Token bucket algorithm."""
        now = time.time()
        max_tokens = config.burst_size or config.requests
        refill_rate = config.requests / config.window_seconds

        if key not in self._token_buckets:
            self._token_buckets[key] = TokenBucket(
                tokens=max_tokens,
                last_refill=now,
                max_tokens=max_tokens,
                refill_rate=refill_rate,
            )

        bucket = self._token_buckets[key]
        elapsed = now - bucket.last_refill
        tokens_to_add = elapsed * refill_rate
        bucket.tokens = min(bucket.max_tokens, bucket.tokens + tokens_to_add)
        bucket.last_refill = now

        if bucket.tokens >= 1:
            bucket.tokens -= 1
            return RateLimitResult(
                allowed=True,
                remaining=int(bucket.tokens),
                reset_at=now + config.window_seconds,
                limit=config.requests,
            )
        else:
            wait_time = (1 - bucket.tokens) / refill_rate
            return RateLimitResult(
                allowed=False,
                remaining=0,
                reset_at=now + wait_time,
                retry_after=int(wait_time) + 1,
                limit=config.requests,
            )

    def _check_sliding_window(self, key: str, config: RateLimitConfig) -> RateLimitResult:
        """Sliding window algorithm."""
        now = time.time()
        window_start = now - config.window_seconds

        if key not in self._sliding_windows:
            self._sliding_windows[key] = SlidingWindow(
                timestamps=[],
                window_seconds=config.window_seconds,
            )

        window = self._sliding_windows[key]
        window.timestamps = [ts for ts in window.timestamps if ts > window_start]

        if len(window.timestamps) < config.requests:
            window.timestamps.append(now)
            return RateLimitResult(
                allowed=True,
                remaining=config.requests - len(window.timestamps),
                reset_at=window.timestamps[0] + config.window_seconds if window.timestamps else now + config.window_seconds,
                limit=config.requests,
            )
        else:
            oldest = window.timestamps[0]
            retry_after = int(oldest + config.window_seconds - now) + 1
            return RateLimitResult(
                allowed=False,
                remaining=0,
                reset_at=oldest + config.window_seconds,
                retry_after=max(1, retry_after),
                limit=config.requests,
            )

    def _check_fixed_window(self, key: str, config: RateLimitConfig) -> RateLimitResult:
        """Fixed window algorithm."""
        now = time.time()
        window_key = str(int(now // config.window_seconds))

        if window_key not in self._fixed_windows[key]:
            self._fixed_windows[key] = {window_key: 0}

        count = self._fixed_windows[key].get(window_key, 0)

        if count < config.requests:
            self._fixed_windows[key][window_key] = count + 1
            return RateLimitResult(
                allowed=True,
                remaining=config.requests - count - 1,
                reset_at=(int(now // config.window_seconds) + 1) * config.window_seconds,
                limit=config.requests,
            )
        else:
            reset_at = (int(now // config.window_seconds) + 1) * config.window_seconds
            return RateLimitResult(
                allowed=False,
                remaining=0,
                reset_at=reset_at,
                retry_after=int(reset_at - now) + 1,
                limit=config.requests,
            )

    def _check_leaky_bucket(self, key: str, config: RateLimitConfig) -> RateLimitResult:
        """Leaky bucket algorithm."""
        config_copy = RateLimitConfig(
            requests=config.requests,
            window_seconds=config.window_seconds,
            strategy=RateLimitStrategy.TOKEN_BUCKET,
            burst_size=1,
            penalty_seconds=config.penalty_seconds,
        )
        return self._check_token_bucket(key, config_copy)

    def reset(self, key: str):
        """Reset rate limit for a key."""
        with self._lock:
            self._token_buckets.pop(key, None)
            self._sliding_windows.pop(key, None)
            self._fixed_windows.pop(key, None)
            self._penalties.pop(key, None)

    def reset_all(self):
        """Reset all rate limits."""
        with self._lock:
            self._token_buckets.clear()
            self._sliding_windows.clear()
            self._fixed_windows.clear()
            self._penalties.clear()

    def get_stats(self) -> dict:
        """Get rate limiter statistics."""
        with self._lock:
            total = self._stats["total_requests"]
            blocked = self._stats["blocked_requests"]

            return {
                **self._stats,
                "block_rate": blocked / total if total > 0 else 0,
                "active_buckets": len(self._token_buckets),
                "active_windows": len(self._sliding_windows),
                "active_penalties": len(self._penalties),
            }

    def limit(
        self,
        requests: int = 100,
        window_seconds: int = 60,
        strategy: RateLimitStrategy = RateLimitStrategy.TOKEN_BUCKET,
        key_func: Optional[Callable[..., str]] = None,
    ):
        """Decorator for rate limiting."""
        config = RateLimitConfig(
            requests=requests,
            window_seconds=window_seconds,
            strategy=strategy,
        )

        def decorator(func):
            async def wrapper(*args, **kwargs):
                if key_func:
                    key = key_func(*args, **kwargs)
                elif args:
                    key = str(args[0])
                else:
                    key = "default"

                result = self.check(key, config=config)

                if not result.allowed:
                    raise RateLimitExceeded(
                        f"Rate limit exceeded. Retry after {result.retry_after} seconds",
                        headers=result.to_headers(),
                    )

                return await func(*args, **kwargs)

            return wrapper
        return decorator


class RateLimitExceeded(Exception):
    """Rate limit exceeded exception."""

    def __init__(self, message: str, headers: Dict[str, str]):
        super().__init__(message)
        self.headers = headers


# Singleton instance
rate_limiter = RateLimiter()
