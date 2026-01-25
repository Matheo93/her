"""
Rate Limiter - Sprint 643

Advanced rate limiting system.

Features:
- Token bucket algorithm
- Sliding window
- Per-user limits
- Per-endpoint limits
- Rate limit headers
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Tuple
from enum import Enum
from threading import Lock
from collections import defaultdict


class LimitStrategy(str, Enum):
    """Rate limiting strategy."""
    TOKEN_BUCKET = "token_bucket"
    SLIDING_WINDOW = "sliding_window"
    FIXED_WINDOW = "fixed_window"
    LEAKY_BUCKET = "leaky_bucket"


@dataclass
class RateLimitConfig:
    """Rate limit configuration."""
    requests: int
    window: float  # seconds
    burst: Optional[int] = None  # max burst for token bucket
    strategy: LimitStrategy = LimitStrategy.SLIDING_WINDOW

    def to_dict(self) -> dict:
        return {
            "requests": self.requests,
            "window": self.window,
            "burst": self.burst,
            "strategy": self.strategy.value,
        }


@dataclass
class RateLimitResult:
    """Result of rate limit check."""
    allowed: bool
    remaining: int
    reset_at: float
    retry_after: Optional[float] = None

    def to_headers(self) -> Dict[str, str]:
        """Get rate limit headers."""
        headers = {
            "X-RateLimit-Remaining": str(self.remaining),
            "X-RateLimit-Reset": str(int(self.reset_at)),
        }
        if self.retry_after:
            headers["Retry-After"] = str(int(self.retry_after))
        return headers


@dataclass
class TokenBucket:
    """Token bucket for rate limiting."""
    capacity: int
    tokens: float
    refill_rate: float  # tokens per second
    last_update: float = field(default_factory=time.time)

    def consume(self, tokens: int = 1) -> Tuple[bool, int]:
        """Try to consume tokens.

        Returns:
            (allowed, remaining_tokens)
        """
        now = time.time()
        elapsed = now - self.last_update
        self.last_update = now

        # Refill tokens
        self.tokens = min(
            self.capacity,
            self.tokens + elapsed * self.refill_rate
        )

        if self.tokens >= tokens:
            self.tokens -= tokens
            return True, int(self.tokens)

        return False, 0


@dataclass
class SlidingWindow:
    """Sliding window for rate limiting."""
    window_size: float  # seconds
    max_requests: int
    requests: List[float] = field(default_factory=list)

    def add_request(self) -> Tuple[bool, int]:
        """Try to add a request.

        Returns:
            (allowed, remaining)
        """
        now = time.time()
        cutoff = now - self.window_size

        # Remove old requests
        self.requests = [t for t in self.requests if t > cutoff]

        if len(self.requests) < self.max_requests:
            self.requests.append(now)
            remaining = self.max_requests - len(self.requests)
            return True, remaining

        return False, 0

    def get_reset_time(self) -> float:
        """Get when the oldest request will expire."""
        if not self.requests:
            return time.time()
        return self.requests[0] + self.window_size


class RateLimiter:
    """Advanced rate limiting system.

    Usage:
        limiter = RateLimiter()

        # Configure global limit
        limiter.configure_global(100, 60)  # 100 req/min

        # Configure per-endpoint
        limiter.configure_endpoint("/chat", 10, 60)  # 10 req/min

        # Check rate limit
        result = limiter.check("user123", "/chat")
        if not result.allowed:
            return 429, result.to_headers()
    """

    def __init__(self):
        """Initialize rate limiter."""
        self._global_config: Optional[RateLimitConfig] = None
        self._endpoint_configs: Dict[str, RateLimitConfig] = {}
        self._user_configs: Dict[str, RateLimitConfig] = {}

        # State storage
        self._buckets: Dict[str, TokenBucket] = {}
        self._windows: Dict[str, SlidingWindow] = {}
        self._lock = Lock()

        # Stats
        self._stats = {
            "total_requests": 0,
            "allowed_requests": 0,
            "blocked_requests": 0,
        }
        self._blocked_users: Dict[str, int] = defaultdict(int)

    def configure_global(
        self,
        requests: int,
        window: float,
        burst: Optional[int] = None,
        strategy: LimitStrategy = LimitStrategy.SLIDING_WINDOW
    ):
        """Configure global rate limit.

        Args:
            requests: Max requests per window
            window: Window size in seconds
            burst: Max burst (for token bucket)
            strategy: Limiting strategy
        """
        self._global_config = RateLimitConfig(
            requests=requests,
            window=window,
            burst=burst or requests,
            strategy=strategy,
        )

    def configure_endpoint(
        self,
        endpoint: str,
        requests: int,
        window: float,
        burst: Optional[int] = None,
        strategy: LimitStrategy = LimitStrategy.SLIDING_WINDOW
    ):
        """Configure endpoint-specific rate limit.

        Args:
            endpoint: Endpoint path
            requests: Max requests per window
            window: Window size in seconds
            burst: Max burst
            strategy: Limiting strategy
        """
        self._endpoint_configs[endpoint] = RateLimitConfig(
            requests=requests,
            window=window,
            burst=burst or requests,
            strategy=strategy,
        )

    def configure_user(
        self,
        user_id: str,
        requests: int,
        window: float,
        burst: Optional[int] = None,
        strategy: LimitStrategy = LimitStrategy.SLIDING_WINDOW
    ):
        """Configure user-specific rate limit.

        Args:
            user_id: User identifier
            requests: Max requests per window
            window: Window size in seconds
            burst: Max burst
            strategy: Limiting strategy
        """
        self._user_configs[user_id] = RateLimitConfig(
            requests=requests,
            window=window,
            burst=burst or requests,
            strategy=strategy,
        )

    def remove_endpoint_config(self, endpoint: str) -> bool:
        """Remove endpoint configuration."""
        if endpoint in self._endpoint_configs:
            del self._endpoint_configs[endpoint]
            return True
        return False

    def remove_user_config(self, user_id: str) -> bool:
        """Remove user configuration."""
        if user_id in self._user_configs:
            del self._user_configs[user_id]
            return True
        return False

    def _get_config(
        self,
        user_id: str,
        endpoint: Optional[str] = None
    ) -> Optional[RateLimitConfig]:
        """Get effective rate limit config."""
        # Priority: user > endpoint > global
        if user_id in self._user_configs:
            return self._user_configs[user_id]

        if endpoint and endpoint in self._endpoint_configs:
            return self._endpoint_configs[endpoint]

        return self._global_config

    def _get_bucket_key(
        self,
        user_id: str,
        endpoint: Optional[str] = None
    ) -> str:
        """Get storage key for user/endpoint combination."""
        if endpoint:
            return f"{user_id}:{endpoint}"
        return user_id

    def _check_token_bucket(
        self,
        key: str,
        config: RateLimitConfig
    ) -> RateLimitResult:
        """Check using token bucket algorithm."""
        with self._lock:
            if key not in self._buckets:
                self._buckets[key] = TokenBucket(
                    capacity=config.burst or config.requests,
                    tokens=config.burst or config.requests,
                    refill_rate=config.requests / config.window,
                )

            bucket = self._buckets[key]
            allowed, remaining = bucket.consume()

            reset_at = time.time() + (1 / bucket.refill_rate)
            retry_after = None if allowed else (1 / bucket.refill_rate)

            return RateLimitResult(
                allowed=allowed,
                remaining=remaining,
                reset_at=reset_at,
                retry_after=retry_after,
            )

    def _check_sliding_window(
        self,
        key: str,
        config: RateLimitConfig
    ) -> RateLimitResult:
        """Check using sliding window algorithm."""
        with self._lock:
            if key not in self._windows:
                self._windows[key] = SlidingWindow(
                    window_size=config.window,
                    max_requests=config.requests,
                )

            window = self._windows[key]
            allowed, remaining = window.add_request()

            reset_at = window.get_reset_time()
            retry_after = None if allowed else (reset_at - time.time())

            return RateLimitResult(
                allowed=allowed,
                remaining=remaining,
                reset_at=reset_at,
                retry_after=retry_after if retry_after and retry_after > 0 else None,
            )

    def check(
        self,
        user_id: str,
        endpoint: Optional[str] = None
    ) -> RateLimitResult:
        """Check if request is allowed.

        Args:
            user_id: User identifier
            endpoint: Optional endpoint path

        Returns:
            Rate limit result
        """
        config = self._get_config(user_id, endpoint)

        if not config:
            # No limit configured
            return RateLimitResult(
                allowed=True,
                remaining=999999,
                reset_at=time.time() + 60,
            )

        key = self._get_bucket_key(user_id, endpoint)

        # Update stats
        self._stats["total_requests"] += 1

        if config.strategy == LimitStrategy.TOKEN_BUCKET:
            result = self._check_token_bucket(key, config)
        else:
            result = self._check_sliding_window(key, config)

        if result.allowed:
            self._stats["allowed_requests"] += 1
        else:
            self._stats["blocked_requests"] += 1
            self._blocked_users[user_id] += 1

        return result

    def reset_user(self, user_id: str):
        """Reset rate limit state for a user.

        Args:
            user_id: User identifier
        """
        with self._lock:
            # Remove all keys starting with user_id
            bucket_keys = [k for k in self._buckets if k.startswith(user_id)]
            for key in bucket_keys:
                del self._buckets[key]

            window_keys = [k for k in self._windows if k.startswith(user_id)]
            for key in window_keys:
                del self._windows[key]

    def reset_endpoint(self, endpoint: str):
        """Reset rate limit state for an endpoint.

        Args:
            endpoint: Endpoint path
        """
        with self._lock:
            bucket_keys = [k for k in self._buckets if k.endswith(f":{endpoint}")]
            for key in bucket_keys:
                del self._buckets[key]

            window_keys = [k for k in self._windows if k.endswith(f":{endpoint}")]
            for key in window_keys:
                del self._windows[key]

    def get_user_status(self, user_id: str) -> Dict[str, Any]:
        """Get rate limit status for a user.

        Args:
            user_id: User identifier

        Returns:
            User status dict
        """
        with self._lock:
            result = {
                "user_id": user_id,
                "blocked_count": self._blocked_users.get(user_id, 0),
                "buckets": {},
                "windows": {},
            }

            for key, bucket in self._buckets.items():
                if key.startswith(user_id):
                    result["buckets"][key] = {
                        "tokens": int(bucket.tokens),
                        "capacity": bucket.capacity,
                    }

            for key, window in self._windows.items():
                if key.startswith(user_id):
                    result["windows"][key] = {
                        "requests": len(window.requests),
                        "max_requests": window.max_requests,
                    }

            return result

    def list_configs(self) -> Dict[str, Any]:
        """List all rate limit configurations."""
        return {
            "global": self._global_config.to_dict() if self._global_config else None,
            "endpoints": {
                ep: cfg.to_dict() for ep, cfg in self._endpoint_configs.items()
            },
            "users": {
                uid: cfg.to_dict() for uid, cfg in self._user_configs.items()
            },
        }

    def get_stats(self) -> Dict[str, Any]:
        """Get rate limiter statistics."""
        with self._lock:
            total = self._stats["total_requests"]
            blocked = self._stats["blocked_requests"]

            return {
                **self._stats,
                "block_rate": blocked / total if total > 0 else 0,
                "top_blocked_users": dict(
                    sorted(
                        self._blocked_users.items(),
                        key=lambda x: x[1],
                        reverse=True
                    )[:10]
                ),
                "active_buckets": len(self._buckets),
                "active_windows": len(self._windows),
            }

    def clear_stats(self):
        """Clear statistics."""
        self._stats = {
            "total_requests": 0,
            "allowed_requests": 0,
            "blocked_requests": 0,
        }
        self._blocked_users.clear()

    def cleanup(self, max_age: float = 3600):
        """Cleanup old rate limit state.

        Args:
            max_age: Max age in seconds for state
        """
        now = time.time()
        cutoff = now - max_age

        with self._lock:
            # Clean buckets not updated recently
            bucket_keys = [
                k for k, b in self._buckets.items()
                if b.last_update < cutoff
            ]
            for key in bucket_keys:
                del self._buckets[key]

            # Clean windows with no recent requests
            window_keys = [
                k for k, w in self._windows.items()
                if not w.requests or max(w.requests) < cutoff
            ]
            for key in window_keys:
                del self._windows[key]


# Singleton instance
rate_limiter = RateLimiter()

# Configure default limits
rate_limiter.configure_global(100, 60)  # 100 requests per minute
rate_limiter.configure_endpoint("/chat", 20, 60)  # 20 per minute
rate_limiter.configure_endpoint("/tts", 30, 60)  # 30 per minute
rate_limiter.configure_endpoint("/ws", 5, 60)  # 5 connections per minute
