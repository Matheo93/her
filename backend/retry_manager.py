"""
Retry Manager - Sprint 655

Retry logic with backoff strategies.

Features:
- Exponential backoff
- Linear backoff
- Jitter support
- Retry conditions
- Circuit integration
"""

import time
import asyncio
import random
from dataclasses import dataclass, field
from typing import Optional, List, Any, Callable, Awaitable, TypeVar, Type
from enum import Enum
from functools import wraps


T = TypeVar("T")


class BackoffStrategy(str, Enum):
    """Backoff strategy types."""
    CONSTANT = "constant"
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    FIBONACCI = "fibonacci"


@dataclass
class RetryConfig:
    """Retry configuration."""
    max_attempts: int = 3
    strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL
    base_delay: float = 1.0
    max_delay: float = 60.0
    jitter: bool = True
    jitter_factor: float = 0.1
    retry_on: Optional[List[Type[Exception]]] = None
    retry_if: Optional[Callable[[Exception], bool]] = None


@dataclass
class RetryAttempt:
    """Single retry attempt info."""
    attempt: int
    delay: float
    error: Optional[str] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class RetryResult:
    """Result of retry operation."""
    success: bool
    value: Any = None
    attempts: int = 0
    total_time: float = 0
    history: List[RetryAttempt] = field(default_factory=list)
    final_error: Optional[str] = None


class RetryManager:
    """Retry logic with configurable backoff.

    Usage:
        manager = RetryManager()

        # Use as decorator
        @manager.retry(max_attempts=3, strategy=BackoffStrategy.EXPONENTIAL)
        async def call_api():
            return await http.get("/api")

        # Use directly
        result = await manager.execute(
            call_api,
            max_attempts=3,
        )
    """

    def __init__(self):
        """Initialize retry manager."""
        self._default_config = RetryConfig()
        self._stats = {
            "total_operations": 0,
            "successful_operations": 0,
            "failed_operations": 0,
            "total_retries": 0,
        }

    def _calculate_delay(
        self,
        attempt: int,
        config: RetryConfig,
    ) -> float:
        """Calculate delay for next retry.

        Args:
            attempt: Current attempt number (1-based)
            config: Retry configuration

        Returns:
            Delay in seconds
        """
        if config.strategy == BackoffStrategy.CONSTANT:
            delay = config.base_delay

        elif config.strategy == BackoffStrategy.LINEAR:
            delay = config.base_delay * attempt

        elif config.strategy == BackoffStrategy.EXPONENTIAL:
            delay = config.base_delay * (2 ** (attempt - 1))

        elif config.strategy == BackoffStrategy.FIBONACCI:
            def fib(n: int) -> int:
                if n <= 1:
                    return n
                a, b = 0, 1
                for _ in range(2, n + 1):
                    a, b = b, a + b
                return b

            delay = config.base_delay * fib(attempt)

        else:
            delay = config.base_delay

        # Apply max delay cap
        delay = min(delay, config.max_delay)

        # Apply jitter
        if config.jitter:
            jitter_range = delay * config.jitter_factor
            delay += random.uniform(-jitter_range, jitter_range)
            delay = max(0, delay)

        return delay

    def _should_retry(
        self,
        error: Exception,
        config: RetryConfig,
    ) -> bool:
        """Check if should retry on this error.

        Args:
            error: Exception that occurred
            config: Retry configuration

        Returns:
            True if should retry
        """
        # Check custom condition
        if config.retry_if:
            try:
                return config.retry_if(error)
            except Exception:
                return False

        # Check exception types
        if config.retry_on:
            return any(isinstance(error, exc_type) for exc_type in config.retry_on)

        # Default: retry on all exceptions
        return True

    async def execute(
        self,
        func: Callable[[], Awaitable[T]],
        max_attempts: int = 3,
        strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        jitter: bool = True,
        retry_on: Optional[List[Type[Exception]]] = None,
        retry_if: Optional[Callable[[Exception], bool]] = None,
    ) -> RetryResult:
        """Execute function with retries.

        Args:
            func: Async function to execute
            max_attempts: Maximum attempts
            strategy: Backoff strategy
            base_delay: Base delay in seconds
            max_delay: Maximum delay
            jitter: Add randomness to delay
            retry_on: Exception types to retry on
            retry_if: Custom retry condition

        Returns:
            Retry result
        """
        config = RetryConfig(
            max_attempts=max_attempts,
            strategy=strategy,
            base_delay=base_delay,
            max_delay=max_delay,
            jitter=jitter,
            retry_on=retry_on,
            retry_if=retry_if,
        )

        history: List[RetryAttempt] = []
        start_time = time.time()
        self._stats["total_operations"] += 1

        for attempt in range(1, config.max_attempts + 1):
            try:
                result = await func()

                self._stats["successful_operations"] += 1

                return RetryResult(
                    success=True,
                    value=result,
                    attempts=attempt,
                    total_time=time.time() - start_time,
                    history=history,
                )

            except Exception as e:
                error_msg = str(e)

                # Check if should retry
                if attempt >= config.max_attempts or not self._should_retry(e, config):
                    self._stats["failed_operations"] += 1

                    history.append(RetryAttempt(
                        attempt=attempt,
                        delay=0,
                        error=error_msg,
                    ))

                    return RetryResult(
                        success=False,
                        attempts=attempt,
                        total_time=time.time() - start_time,
                        history=history,
                        final_error=error_msg,
                    )

                # Calculate delay
                delay = self._calculate_delay(attempt, config)
                self._stats["total_retries"] += 1

                history.append(RetryAttempt(
                    attempt=attempt,
                    delay=delay,
                    error=error_msg,
                ))

                # Wait before retry
                await asyncio.sleep(delay)

        # Should not reach here
        self._stats["failed_operations"] += 1
        return RetryResult(
            success=False,
            attempts=config.max_attempts,
            total_time=time.time() - start_time,
            history=history,
            final_error="Max attempts reached",
        )

    def retry(
        self,
        max_attempts: int = 3,
        strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL,
        base_delay: float = 1.0,
        max_delay: float = 60.0,
        jitter: bool = True,
        retry_on: Optional[List[Type[Exception]]] = None,
        retry_if: Optional[Callable[[Exception], bool]] = None,
    ):
        """Decorator for retry logic.

        Args:
            max_attempts: Maximum attempts
            strategy: Backoff strategy
            base_delay: Base delay
            max_delay: Maximum delay
            jitter: Add randomness
            retry_on: Exception types
            retry_if: Custom condition
        """
        def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
            @wraps(func)
            async def wrapper(*args, **kwargs) -> T:
                async def call():
                    return await func(*args, **kwargs)

                result = await self.execute(
                    call,
                    max_attempts=max_attempts,
                    strategy=strategy,
                    base_delay=base_delay,
                    max_delay=max_delay,
                    jitter=jitter,
                    retry_on=retry_on,
                    retry_if=retry_if,
                )

                if result.success:
                    return result.value
                else:
                    raise Exception(result.final_error)

            return wrapper
        return decorator

    def get_stats(self) -> dict:
        """Get retry statistics."""
        total = self._stats["total_operations"]
        success = self._stats["successful_operations"]

        return {
            **self._stats,
            "success_rate": success / total if total > 0 else 0,
            "avg_retries": self._stats["total_retries"] / total if total > 0 else 0,
        }

    def reset_stats(self):
        """Reset statistics."""
        self._stats = {
            "total_operations": 0,
            "successful_operations": 0,
            "failed_operations": 0,
            "total_retries": 0,
        }


def with_retry(
    max_attempts: int = 3,
    strategy: BackoffStrategy = BackoffStrategy.EXPONENTIAL,
    base_delay: float = 1.0,
    **kwargs,
):
    """Standalone retry decorator.

    Usage:
        @with_retry(max_attempts=3)
        async def call_api():
            return await http.get("/api")
    """
    manager = RetryManager()
    return manager.retry(
        max_attempts=max_attempts,
        strategy=strategy,
        base_delay=base_delay,
        **kwargs,
    )


# Singleton instance
retry_manager = RetryManager()
