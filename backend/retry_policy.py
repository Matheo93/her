"""
Retry Policy - Sprint 739

Configurable retry strategies for resilient operations.

Features:
- Multiple retry strategies
- Exponential backoff
- Jitter support
- Retry budgets
- Custom conditions
"""

import time
import random
import asyncio
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic, Type, Union
)
from enum import Enum
from abc import ABC, abstractmethod
from functools import wraps
import threading


T = TypeVar("T")


class RetryStrategy(str, Enum):
    """Retry strategies."""
    IMMEDIATE = "immediate"
    FIXED_DELAY = "fixed_delay"
    LINEAR_BACKOFF = "linear_backoff"
    EXPONENTIAL_BACKOFF = "exponential_backoff"
    FIBONACCI_BACKOFF = "fibonacci_backoff"


@dataclass
class RetryConfig:
    """Retry configuration."""
    max_attempts: int = 3
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL_BACKOFF
    base_delay: float = 1.0  # seconds
    max_delay: float = 60.0  # seconds
    jitter: bool = True
    jitter_factor: float = 0.1
    retry_on: List[Type[Exception]] = field(default_factory=lambda: [Exception])
    retry_if: Optional[Callable[[Exception], bool]] = None
    on_retry: Optional[Callable[[int, Exception, float], None]] = None


@dataclass
class RetryResult(Generic[T]):
    """Result of retry operation."""
    success: bool
    value: Optional[T] = None
    exception: Optional[Exception] = None
    attempts: int = 0
    total_time: float = 0.0


class DelayCalculator(ABC):
    """Base delay calculator."""

    @abstractmethod
    def calculate(self, attempt: int, config: RetryConfig) -> float:
        """Calculate delay for attempt."""
        pass


class ImmediateDelay(DelayCalculator):
    """No delay."""

    def calculate(self, attempt: int, config: RetryConfig) -> float:
        return 0.0


class FixedDelay(DelayCalculator):
    """Fixed delay."""

    def calculate(self, attempt: int, config: RetryConfig) -> float:
        return config.base_delay


class LinearBackoff(DelayCalculator):
    """Linear backoff."""

    def calculate(self, attempt: int, config: RetryConfig) -> float:
        return min(config.base_delay * attempt, config.max_delay)


class ExponentialBackoff(DelayCalculator):
    """Exponential backoff."""

    def calculate(self, attempt: int, config: RetryConfig) -> float:
        return min(config.base_delay * (2 ** (attempt - 1)), config.max_delay)


class FibonacciBackoff(DelayCalculator):
    """Fibonacci backoff."""

    def calculate(self, attempt: int, config: RetryConfig) -> float:
        def fib(n: int) -> int:
            if n <= 1:
                return n
            a, b = 0, 1
            for _ in range(2, n + 1):
                a, b = b, a + b
            return b

        return min(config.base_delay * fib(attempt), config.max_delay)


DELAY_CALCULATORS: Dict[RetryStrategy, DelayCalculator] = {
    RetryStrategy.IMMEDIATE: ImmediateDelay(),
    RetryStrategy.FIXED_DELAY: FixedDelay(),
    RetryStrategy.LINEAR_BACKOFF: LinearBackoff(),
    RetryStrategy.EXPONENTIAL_BACKOFF: ExponentialBackoff(),
    RetryStrategy.FIBONACCI_BACKOFF: FibonacciBackoff(),
}


def add_jitter(delay: float, factor: float) -> float:
    """Add random jitter to delay."""
    jitter_range = delay * factor
    return delay + random.uniform(-jitter_range, jitter_range)


class RetryBudget:
    """Retry budget with token bucket.

    Limits total retries across operations.

    Usage:
        budget = RetryBudget(tokens_per_second=10, max_tokens=100)

        if budget.acquire():
            # Perform retry
            pass
    """

    def __init__(
        self,
        tokens_per_second: float = 10.0,
        max_tokens: int = 100,
    ):
        """Initialize retry budget."""
        self._tokens_per_second = tokens_per_second
        self._max_tokens = max_tokens
        self._tokens = float(max_tokens)
        self._last_update = time.time()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        """Refill tokens based on time elapsed."""
        now = time.time()
        elapsed = now - self._last_update
        self._tokens = min(
            self._max_tokens,
            self._tokens + elapsed * self._tokens_per_second
        )
        self._last_update = now

    def acquire(self, tokens: int = 1) -> bool:
        """Acquire tokens for retry."""
        with self._lock:
            self._refill()
            if self._tokens >= tokens:
                self._tokens -= tokens
                return True
            return False

    @property
    def available_tokens(self) -> float:
        """Get available tokens."""
        with self._lock:
            self._refill()
            return self._tokens


class Retrier:
    """Retry executor.

    Usage:
        retrier = Retrier(RetryConfig(max_attempts=3))

        result = retrier.execute(risky_function, arg1, arg2)

        if result.success:
            print(result.value)
        else:
            print(f"Failed after {result.attempts} attempts")
    """

    def __init__(
        self,
        config: Optional[RetryConfig] = None,
        budget: Optional[RetryBudget] = None,
    ):
        """Initialize retrier."""
        self._config = config or RetryConfig()
        self._budget = budget
        self._calculator = DELAY_CALCULATORS[self._config.strategy]

    def should_retry(self, exception: Exception) -> bool:
        """Check if should retry for exception."""
        # Check retry_if condition
        if self._config.retry_if:
            return self._config.retry_if(exception)

        # Check exception types
        return any(
            isinstance(exception, exc_type)
            for exc_type in self._config.retry_on
        )

    def get_delay(self, attempt: int) -> float:
        """Get delay for attempt."""
        delay = self._calculator.calculate(attempt, self._config)

        if self._config.jitter:
            delay = add_jitter(delay, self._config.jitter_factor)

        return max(0, delay)

    def execute(
        self,
        func: Callable[..., T],
        *args: Any,
        **kwargs: Any,
    ) -> RetryResult[T]:
        """Execute function with retries.

        Args:
            func: Function to execute
            *args: Positional arguments
            **kwargs: Keyword arguments

        Returns:
            RetryResult with success/failure info
        """
        start_time = time.time()
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._config.max_attempts + 1):
            try:
                result = func(*args, **kwargs)
                return RetryResult(
                    success=True,
                    value=result,
                    attempts=attempt,
                    total_time=time.time() - start_time,
                )
            except Exception as e:
                last_exception = e

                # Check if we should retry
                if not self.should_retry(e):
                    break

                # Check budget
                if self._budget and not self._budget.acquire():
                    break

                # Last attempt?
                if attempt >= self._config.max_attempts:
                    break

                # Calculate delay
                delay = self.get_delay(attempt)

                # Callback
                if self._config.on_retry:
                    self._config.on_retry(attempt, e, delay)

                # Wait
                if delay > 0:
                    time.sleep(delay)

        return RetryResult(
            success=False,
            exception=last_exception,
            attempts=self._config.max_attempts,
            total_time=time.time() - start_time,
        )

    async def execute_async(
        self,
        func: Callable[..., T],
        *args: Any,
        **kwargs: Any,
    ) -> RetryResult[T]:
        """Execute async function with retries."""
        start_time = time.time()
        last_exception: Optional[Exception] = None

        for attempt in range(1, self._config.max_attempts + 1):
            try:
                if asyncio.iscoroutinefunction(func):
                    result = await func(*args, **kwargs)
                else:
                    result = func(*args, **kwargs)

                return RetryResult(
                    success=True,
                    value=result,
                    attempts=attempt,
                    total_time=time.time() - start_time,
                )
            except Exception as e:
                last_exception = e

                if not self.should_retry(e):
                    break

                if self._budget and not self._budget.acquire():
                    break

                if attempt >= self._config.max_attempts:
                    break

                delay = self.get_delay(attempt)

                if self._config.on_retry:
                    self._config.on_retry(attempt, e, delay)

                if delay > 0:
                    await asyncio.sleep(delay)

        return RetryResult(
            success=False,
            exception=last_exception,
            attempts=self._config.max_attempts,
            total_time=time.time() - start_time,
        )


def retry(
    max_attempts: int = 3,
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL_BACKOFF,
    base_delay: float = 1.0,
    max_delay: float = 60.0,
    jitter: bool = True,
    retry_on: Optional[List[Type[Exception]]] = None,
    retry_if: Optional[Callable[[Exception], bool]] = None,
) -> Callable:
    """Retry decorator.

    Usage:
        @retry(max_attempts=3)
        def risky_function():
            ...

        @retry(strategy=RetryStrategy.LINEAR_BACKOFF, retry_on=[ConnectionError])
        async def fetch_data():
            ...
    """
    config = RetryConfig(
        max_attempts=max_attempts,
        strategy=strategy,
        base_delay=base_delay,
        max_delay=max_delay,
        jitter=jitter,
        retry_on=retry_on or [Exception],
        retry_if=retry_if,
    )

    retrier = Retrier(config)

    def decorator(func: Callable) -> Callable:
        if asyncio.iscoroutinefunction(func):
            @wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                result = await retrier.execute_async(func, *args, **kwargs)
                if result.success:
                    return result.value
                raise result.exception or Exception("Retry failed")
            return async_wrapper
        else:
            @wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                result = retrier.execute(func, *args, **kwargs)
                if result.success:
                    return result.value
                raise result.exception or Exception("Retry failed")
            return sync_wrapper

    return decorator


class RetryContext:
    """Context manager for retries.

    Usage:
        with RetryContext(max_attempts=3) as ctx:
            while ctx.should_continue:
                try:
                    result = risky_operation()
                    ctx.success(result)
                except Exception as e:
                    ctx.fail(e)
    """

    def __init__(
        self,
        config: Optional[RetryConfig] = None,
        max_attempts: int = 3,
    ):
        """Initialize retry context."""
        self._config = config or RetryConfig(max_attempts=max_attempts)
        self._calculator = DELAY_CALCULATORS[self._config.strategy]
        self._attempt = 0
        self._succeeded = False
        self._result: Any = None
        self._last_exception: Optional[Exception] = None

    def __enter__(self) -> "RetryContext":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        return False

    @property
    def should_continue(self) -> bool:
        """Check if should continue retrying."""
        return (
            not self._succeeded
            and self._attempt < self._config.max_attempts
        )

    @property
    def attempt(self) -> int:
        """Get current attempt number."""
        return self._attempt

    @property
    def result(self) -> Any:
        """Get result if succeeded."""
        return self._result

    @property
    def exception(self) -> Optional[Exception]:
        """Get last exception."""
        return self._last_exception

    def success(self, result: Any = None) -> None:
        """Mark as succeeded."""
        self._succeeded = True
        self._result = result

    def fail(self, exception: Exception) -> None:
        """Mark attempt as failed."""
        self._attempt += 1
        self._last_exception = exception

        # Wait before next attempt
        if self.should_continue:
            delay = self._calculator.calculate(self._attempt, self._config)
            if self._config.jitter:
                delay = add_jitter(delay, self._config.jitter_factor)
            if delay > 0:
                time.sleep(delay)


# Singleton instances
default_budget = RetryBudget()


# Convenience functions
def with_retry(
    func: Callable[..., T],
    *args: Any,
    max_attempts: int = 3,
    **kwargs: Any,
) -> T:
    """Execute function with default retry policy."""
    config = RetryConfig(max_attempts=max_attempts)
    retrier = Retrier(config)
    result = retrier.execute(func, *args, **kwargs)

    if result.success:
        return result.value
    raise result.exception or Exception("Retry failed")


async def with_retry_async(
    func: Callable[..., T],
    *args: Any,
    max_attempts: int = 3,
    **kwargs: Any,
) -> T:
    """Execute async function with default retry policy."""
    config = RetryConfig(max_attempts=max_attempts)
    retrier = Retrier(config)
    result = await retrier.execute_async(func, *args, **kwargs)

    if result.success:
        return result.value
    raise result.exception or Exception("Retry failed")
