"""
Rate Limiter - Sprint 585

Per-user rate limiting for API endpoints.
Uses token bucket algorithm with sliding window.

Features:
- Per-user/IP rate limits
- Configurable limits per endpoint
- Burst allowance
- Automatic cleanup
- Statistics tracking
"""

import time
import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict, Optional, Tuple, Any
from threading import Lock
from enum import Enum


class RateLimitResult(str, Enum):
    """Result of rate limit check."""
    ALLOWED = "allowed"
    DENIED = "denied"
    WARNING = "warning"  # Close to limit


@dataclass
class TokenBucket:
    """Token bucket for rate limiting."""
    tokens: float
    last_update: float
    request_count: int = 0
    last_request: float = 0


@dataclass
class RateLimitConfig:
    """Configuration for a rate limit rule."""
    requests_per_minute: int = 60
    burst_size: int = 10  # Extra tokens for burst
    warning_threshold: float = 0.8  # Warn at 80% usage


@dataclass
class RateLimitStats:
    """Statistics for rate limiting."""
    total_requests: int = 0
    allowed_requests: int = 0
    denied_requests: int = 0
    warnings_issued: int = 0
    unique_users: int = 0


class RateLimiter:
    """Per-user rate limiter using token bucket algorithm.

    Usage:
        limiter = RateLimiter()

        # Check rate limit
        result = limiter.check("user123", "chat")
        if result.result == RateLimitResult.DENIED:
            return {"error": "Rate limit exceeded"}

        # Configure endpoint limits
        limiter.configure_endpoint("tts", RateLimitConfig(
            requests_per_minute=30,
            burst_size=5
        ))
    """

    def __init__(self, default_config: Optional[RateLimitConfig] = None):
        self._buckets: Dict[str, TokenBucket] = {}
        self._lock = Lock()
        self._configs: Dict[str, RateLimitConfig] = {}
        self._default_config = default_config or RateLimitConfig()
        self._stats = RateLimitStats()
        self._cleanup_interval = 300  # 5 minutes
        self._last_cleanup = time.time()

    def configure_endpoint(self, endpoint: str, config: RateLimitConfig) -> None:
        """Configure rate limit for specific endpoint.

        Args:
            endpoint: Endpoint identifier (e.g., "chat", "tts")
            config: Rate limit configuration
        """
        self._configs[endpoint] = config

    def _get_config(self, endpoint: str) -> RateLimitConfig:
        """Get configuration for endpoint."""
        return self._configs.get(endpoint, self._default_config)

    def _get_bucket_key(self, user_id: str, endpoint: str) -> str:
        """Generate bucket key for user+endpoint."""
        return f"{user_id}:{endpoint}"

    def _refill_tokens(self, bucket: TokenBucket, config: RateLimitConfig) -> None:
        """Refill tokens based on elapsed time."""
        now = time.time()
        elapsed = now - bucket.last_update

        # Calculate tokens to add (per second rate)
        tokens_per_second = config.requests_per_minute / 60.0
        new_tokens = elapsed * tokens_per_second

        # Cap at max tokens (rate + burst)
        max_tokens = config.requests_per_minute + config.burst_size
        bucket.tokens = min(max_tokens, bucket.tokens + new_tokens)
        bucket.last_update = now

    def check(
        self,
        user_id: str,
        endpoint: str = "default",
        consume: bool = True
    ) -> Dict[str, Any]:
        """Check if request is allowed under rate limit.

        Args:
            user_id: User or IP identifier
            endpoint: Endpoint being accessed
            consume: If True, consume a token. If False, just check.

        Returns:
            Dict with result, remaining tokens, retry_after if denied
        """
        now = time.time()
        config = self._get_config(endpoint)
        bucket_key = self._get_bucket_key(user_id, endpoint)

        with self._lock:
            # Get or create bucket
            bucket = self._buckets.get(bucket_key)
            if bucket is None:
                max_tokens = config.requests_per_minute + config.burst_size
                bucket = TokenBucket(
                    tokens=max_tokens,
                    last_update=now
                )
                self._buckets[bucket_key] = bucket
                self._stats.unique_users += 1

            # Refill tokens
            self._refill_tokens(bucket, config)

            # Update stats
            self._stats.total_requests += 1

            # Check if allowed
            max_tokens = config.requests_per_minute + config.burst_size
            usage_ratio = 1 - (bucket.tokens / max_tokens)

            if bucket.tokens < 1:
                # Denied
                self._stats.denied_requests += 1

                # Calculate retry_after
                tokens_per_second = config.requests_per_minute / 60.0
                retry_after = (1 - bucket.tokens) / tokens_per_second

                return {
                    "result": RateLimitResult.DENIED,
                    "remaining": 0,
                    "limit": config.requests_per_minute,
                    "retry_after": round(retry_after, 1),
                    "message": "Rate limit exceeded"
                }

            # Consume token if requested
            if consume:
                bucket.tokens -= 1
                bucket.request_count += 1
                bucket.last_request = now

            self._stats.allowed_requests += 1

            # Check if warning threshold reached
            result = RateLimitResult.ALLOWED
            if usage_ratio >= config.warning_threshold:
                result = RateLimitResult.WARNING
                self._stats.warnings_issued += 1

            # Trigger cleanup if needed
            if now - self._last_cleanup > self._cleanup_interval:
                self._cleanup_old_buckets()

            return {
                "result": result,
                "remaining": int(bucket.tokens),
                "limit": config.requests_per_minute,
                "retry_after": 0,
                "message": "OK" if result == RateLimitResult.ALLOWED else "Approaching rate limit"
            }

    def _cleanup_old_buckets(self) -> int:
        """Remove inactive buckets to free memory."""
        now = time.time()
        self._last_cleanup = now

        # Remove buckets with no activity for 10 minutes
        inactive_threshold = now - 600
        keys_to_remove = [
            key for key, bucket in self._buckets.items()
            if bucket.last_request < inactive_threshold
        ]

        for key in keys_to_remove:
            del self._buckets[key]

        return len(keys_to_remove)

    def reset_user(self, user_id: str, endpoint: Optional[str] = None) -> int:
        """Reset rate limit for a user.

        Args:
            user_id: User identifier
            endpoint: If specified, only reset that endpoint. Otherwise reset all.

        Returns:
            Number of buckets reset
        """
        with self._lock:
            if endpoint:
                bucket_key = self._get_bucket_key(user_id, endpoint)
                if bucket_key in self._buckets:
                    del self._buckets[bucket_key]
                    return 1
                return 0

            # Reset all endpoints for user
            keys_to_remove = [
                key for key in self._buckets.keys()
                if key.startswith(f"{user_id}:")
            ]
            for key in keys_to_remove:
                del self._buckets[key]
            return len(keys_to_remove)

    def get_user_status(self, user_id: str) -> Dict[str, Any]:
        """Get rate limit status for all endpoints for a user.

        Args:
            user_id: User identifier

        Returns:
            Dict with status per endpoint
        """
        status = {}

        with self._lock:
            for key, bucket in self._buckets.items():
                if key.startswith(f"{user_id}:"):
                    endpoint = key.split(":", 1)[1]
                    config = self._get_config(endpoint)
                    max_tokens = config.requests_per_minute + config.burst_size

                    # Refill for accurate display
                    self._refill_tokens(bucket, config)

                    status[endpoint] = {
                        "remaining": int(bucket.tokens),
                        "limit": config.requests_per_minute,
                        "burst": config.burst_size,
                        "request_count": bucket.request_count,
                        "last_request": bucket.last_request,
                    }

        return status

    def get_stats(self) -> Dict[str, Any]:
        """Get rate limiter statistics."""
        return {
            "total_requests": self._stats.total_requests,
            "allowed_requests": self._stats.allowed_requests,
            "denied_requests": self._stats.denied_requests,
            "warnings_issued": self._stats.warnings_issued,
            "unique_users": self._stats.unique_users,
            "active_buckets": len(self._buckets),
            "denial_rate": round(
                self._stats.denied_requests / max(1, self._stats.total_requests) * 100, 2
            ),
        }


# Singleton instance with default configuration
rate_limiter = RateLimiter(RateLimitConfig(
    requests_per_minute=60,
    burst_size=10,
    warning_threshold=0.8
))

# Configure specific endpoints
rate_limiter.configure_endpoint("chat", RateLimitConfig(
    requests_per_minute=30,
    burst_size=5,
    warning_threshold=0.7
))

rate_limiter.configure_endpoint("tts", RateLimitConfig(
    requests_per_minute=20,
    burst_size=3,
    warning_threshold=0.8
))

rate_limiter.configure_endpoint("export", RateLimitConfig(
    requests_per_minute=10,
    burst_size=2,
    warning_threshold=0.9
))
