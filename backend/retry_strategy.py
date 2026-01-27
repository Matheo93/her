"""
Retry Strategy - Sprint 803

Advanced retry patterns with backoff strategies.

Features:
- Exponential backoff
- Linear backoff
- Fibonacci backoff
- Jittered backoff
- Decorators for sync/async
- Context managers
- Retry policies
"""

import asyncio
import functools
import logging
import random
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Any, Callable, Dict, Generic, List, Optional, Set, Tuple, Type, TypeVar,
    Union, Awaitable
)

logger = logging.getLogger(__name__)


T = TypeVar("T")
ExceptionType = Union[Type[Exception], Tuple[Type[Exception], ...]]


class RetryState(str, Enum):
    """Retry operation state."""
    PENDING = "pending"
    RETRYING = "retrying"
    SUCCESS = "success"
    FAILED = "failed"
    EXHAUSTED = "exhausted"


@dataclass
class RetryAttempt:
    """Information about a retry attempt."""
    attempt_number: int
    delay: float
    exception: Optional[Exception] = None
    timestamp: float = field(default_factory=time.time)
    duration: float = 0.0

    def to_dict(self) -> dict:
        return {
            "attempt_number": self.attempt_number,
            "delay": self.delay,
            "exception": str(self.exception) if self.exception else None,
            "timestamp": self.timestamp,
            "duration": self.duration,
        }


@dataclass
class RetryResult(Generic[T]):
    """Result of a retry operation."""
    value: Optional[T]
    success: bool
    attempts: List[RetryAttempt]
    total_time: float
    state: RetryState

    @property
    def attempt_count(self) -> int:
        return len(self.attempts)

    @property
    def last_exception(self) -> Optional[Exception]:
        if self.attempts and self.attempts[-1].exception:
            return self.attempts[-1].exception
        return None


class BackoffStrategy(ABC):
    """Abstract backoff strategy."""

    @abstractmethod
    def get_delay(self, attempt: int) -> float:
        """Calculate delay for given attempt number (1-indexed)."""
        pass

    def reset(self) -> None:
        """Reset strategy state if any."""
        pass


class ConstantBackoff(BackoffStrategy):
    """Constant delay between retries.

    Usage:
        backoff = ConstantBackoff(delay=1.0)
        backoff.get_delay(1)  # 1.0
        backoff.get_delay(5)  # 1.0
    """

    def __init__(self, delay: float = 1.0):
        self.delay = delay

    def get_delay(self, attempt: int) -> float:
        return self.delay


class LinearBackoff(BackoffStrategy):
    """Linear increase in delay.

    Usage:
        backoff = LinearBackoff(initial=1.0, increment=0.5, max_delay=10.0)
        backoff.get_delay(1)  # 1.0
        backoff.get_delay(2)  # 1.5
        backoff.get_delay(3)  # 2.0
    """

    def __init__(
        self,
        initial: float = 1.0,
        increment: float = 1.0,
        max_delay: float = 60.0,
    ):
        self.initial = initial
        self.increment = increment
        self.max_delay = max_delay

    def get_delay(self, attempt: int) -> float:
        delay = self.initial + (attempt - 1) * self.increment
        return min(delay, self.max_delay)


class ExponentialBackoff(BackoffStrategy):
    """Exponential increase in delay.

    Usage:
        backoff = ExponentialBackoff(base=1.0, multiplier=2.0, max_delay=60.0)
        backoff.get_delay(1)  # 1.0
        backoff.get_delay(2)  # 2.0
        backoff.get_delay(3)  # 4.0
    """

    def __init__(
        self,
        base: float = 1.0,
        multiplier: float = 2.0,
        max_delay: float = 60.0,
    ):
        self.base = base
        self.multiplier = multiplier
        self.max_delay = max_delay

    def get_delay(self, attempt: int) -> float:
        delay = self.base * (self.multiplier ** (attempt - 1))
        return min(delay, self.max_delay)


class FibonacciBackoff(BackoffStrategy):
    """Fibonacci sequence delay.

    Usage:
        backoff = FibonacciBackoff(multiplier=1.0, max_delay=60.0)
        backoff.get_delay(1)  # 1.0
        backoff.get_delay(2)  # 1.0
        backoff.get_delay(3)  # 2.0
        backoff.get_delay(4)  # 3.0
        backoff.get_delay(5)  # 5.0
    """

    def __init__(self, multiplier: float = 1.0, max_delay: float = 60.0):
        self.multiplier = multiplier
        self.max_delay = max_delay
        self._cache: Dict[int, int] = {1: 1, 2: 1}

    def _fibonacci(self, n: int) -> int:
        if n in self._cache:
            return self._cache[n]
        result = self._fibonacci(n - 1) + self._fibonacci(n - 2)
        self._cache[n] = result
        return result

    def get_delay(self, attempt: int) -> float:
        fib = self._fibonacci(attempt)
        delay = fib * self.multiplier
        return min(delay, self.max_delay)


class JitteredBackoff(BackoffStrategy):
    """Add random jitter to another backoff strategy.

    Usage:
        base = ExponentialBackoff(base=1.0)
        backoff = JitteredBackoff(base, jitter_factor=0.5)
        # Adds -50% to +50% jitter
    """

    def __init__(
        self,
        base_strategy: BackoffStrategy,
        jitter_factor: float = 0.5,
        min_jitter: float = 0.0,
    ):
        self.base_strategy = base_strategy
        self.jitter_factor = jitter_factor
        self.min_jitter = min_jitter

    def get_delay(self, attempt: int) -> float:
        base_delay = self.base_strategy.get_delay(attempt)
        jitter_range = base_delay * self.jitter_factor
        jitter = random.uniform(-jitter_range, jitter_range)
        delay = base_delay + jitter
        return max(delay, self.min_jitter)

    def reset(self) -> None:
        self.base_strategy.reset()


class DecorrelatedJitterBackoff(BackoffStrategy):
    """AWS-style decorrelated jitter backoff.

    Usage:
        backoff = DecorrelatedJitterBackoff(base=1.0, max_delay=60.0)
        # Each delay is: random(base, previous_delay * 3)
    """

    def __init__(self, base: float = 1.0, max_delay: float = 60.0):
        self.base = base
        self.max_delay = max_delay
        self._previous_delay = base

    def get_delay(self, attempt: int) -> float:
        if attempt == 1:
            self._previous_delay = self.base
            return self.base

        delay = random.uniform(self.base, self._previous_delay * 3)
        delay = min(delay, self.max_delay)
        self._previous_delay = delay
        return delay

    def reset(self) -> None:
        self._previous_delay = self.base


class PolynomialBackoff(BackoffStrategy):
    """Polynomial increase in delay.

    Usage:
        backoff = PolynomialBackoff(base=1.0, power=2, max_delay=60.0)
        backoff.get_delay(1)  # 1.0
        backoff.get_delay(2)  # 4.0
        backoff.get_delay(3)  # 9.0
    """

    def __init__(
        self,
        base: float = 1.0,
        power: float = 2,
        max_delay: float = 60.0,
    ):
        self.base = base
        self.power = power
        self.max_delay = max_delay

    def get_delay(self, attempt: int) -> float:
        delay = self.base * (attempt ** self.power)
        return min(delay, self.max_delay)


@dataclass
class RetryPolicy:
    """Retry policy configuration.

    Usage:
        policy = RetryPolicy(
            max_attempts=5,
            backoff=ExponentialBackoff(),
            retry_on=(ConnectionError, TimeoutError),
            stop_on=(ValueError,),
        )
    """
    max_attempts: int = 3
    backoff: BackoffStrategy = field(default_factory=lambda: ExponentialBackoff())
    retry_on: ExceptionType = Exception
    stop_on: Optional[ExceptionType] = None
    on_retry: Optional[Callable[[RetryAttempt], None]] = None
    on_success: Optional[Callable[[RetryResult], None]] = None
    on_failure: Optional[Callable[[RetryResult], None]] = None

    def should_retry(self, exception: Exception, attempt: int) -> bool:
        """Check if should retry for given exception."""
        if attempt >= self.max_attempts:
            return False
        if self.stop_on and isinstance(exception, self.stop_on):
            return False
        return isinstance(exception, self.retry_on)


class Retrier:
    """Execute operations with retry logic.

    Usage:
        retrier = Retrier(RetryPolicy(max_attempts=3))

        # Sync execution
        result = retrier.execute(risky_function, arg1, arg2)

        # Async execution
        result = await retrier.execute_async(async_risky_function, arg1)
    """

    def __init__(self, policy: RetryPolicy):
        self.policy = policy

    def execute(
        self,
        func: Callable[..., T],
        *args: Any,
        **kwargs: Any,
    ) -> RetryResult[T]:
        """Execute function with retry logic."""
        attempts: List[RetryAttempt] = []
        start_time = time.time()
        self.policy.backoff.reset()

        for attempt_num in range(1, self.policy.max_attempts + 1):
            attempt_start = time.time()
            delay = self.policy.backoff.get_delay(attempt_num) if attempt_num > 1 else 0

            if delay > 0:
                time.sleep(delay)

            try:
                result = func(*args, **kwargs)
                attempt = RetryAttempt(
                    attempt_number=attempt_num,
                    delay=delay,
                    duration=time.time() - attempt_start,
                )
                attempts.append(attempt)

                ret_result = RetryResult(
                    value=result,
                    success=True,
                    attempts=attempts,
                    total_time=time.time() - start_time,
                    state=RetryState.SUCCESS,
                )

                if self.policy.on_success:
                    self.policy.on_success(ret_result)

                return ret_result

            except Exception as e:
                attempt = RetryAttempt(
                    attempt_number=attempt_num,
                    delay=delay,
                    exception=e,
                    duration=time.time() - attempt_start,
                )
                attempts.append(attempt)

                if self.policy.on_retry:
                    self.policy.on_retry(attempt)

                if not self.policy.should_retry(e, attempt_num):
                    break

                logger.debug(
                    "Retry attempt " + str(attempt_num) + " failed: " + str(e)
                )

        # Exhausted all retries
        ret_result = RetryResult(
            value=None,
            success=False,
            attempts=attempts,
            total_time=time.time() - start_time,
            state=RetryState.EXHAUSTED,
        )

        if self.policy.on_failure:
            self.policy.on_failure(ret_result)

        return ret_result

    async def execute_async(
        self,
        func: Callable[..., Awaitable[T]],
        *args: Any,
        **kwargs: Any,
    ) -> RetryResult[T]:
        """Execute async function with retry logic."""
        attempts: List[RetryAttempt] = []
        start_time = time.time()
        self.policy.backoff.reset()

        for attempt_num in range(1, self.policy.max_attempts + 1):
            attempt_start = time.time()
            delay = self.policy.backoff.get_delay(attempt_num) if attempt_num > 1 else 0

            if delay > 0:
                await asyncio.sleep(delay)

            try:
                result = await func(*args, **kwargs)
                attempt = RetryAttempt(
                    attempt_number=attempt_num,
                    delay=delay,
                    duration=time.time() - attempt_start,
                )
                attempts.append(attempt)

                ret_result = RetryResult(
                    value=result,
                    success=True,
                    attempts=attempts,
                    total_time=time.time() - start_time,
                    state=RetryState.SUCCESS,
                )

                if self.policy.on_success:
                    self.policy.on_success(ret_result)

                return ret_result

            except Exception as e:
                attempt = RetryAttempt(
                    attempt_number=attempt_num,
                    delay=delay,
                    exception=e,
                    duration=time.time() - attempt_start,
                )
                attempts.append(attempt)

                if self.policy.on_retry:
                    self.policy.on_retry(attempt)

                if not self.policy.should_retry(e, attempt_num):
                    break

                logger.debug(
                    "Retry attempt " + str(attempt_num) + " failed: " + str(e)
                )

        ret_result = RetryResult(
            value=None,
            success=False,
            attempts=attempts,
            total_time=time.time() - start_time,
            state=RetryState.EXHAUSTED,
        )

        if self.policy.on_failure:
            self.policy.on_failure(ret_result)

        return ret_result


def retry(
    max_attempts: int = 3,
    backoff: Optional[BackoffStrategy] = None,
    retry_on: ExceptionType = Exception,
    stop_on: Optional[ExceptionType] = None,
    on_retry: Optional[Callable[[RetryAttempt], None]] = None,
) -> Callable:
    """Decorator for retrying functions.

    Usage:
        @retry(max_attempts=3, backoff=ExponentialBackoff())
        def risky_operation():
            ...

        @retry(max_attempts=5, retry_on=(ConnectionError, TimeoutError))
        async def async_risky_operation():
            ...
    """
    if backoff is None:
        backoff = ExponentialBackoff()

    policy = RetryPolicy(
        max_attempts=max_attempts,
        backoff=backoff,
        retry_on=retry_on,
        stop_on=stop_on,
        on_retry=on_retry,
    )

    def decorator(func: Callable) -> Callable:
        retrier = Retrier(policy)

        if asyncio.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                result = await retrier.execute_async(func, *args, **kwargs)
                if not result.success:
                    if result.last_exception:
                        raise result.last_exception
                    raise RuntimeError("Retry exhausted without exception")
                return result.value
            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                result = retrier.execute(func, *args, **kwargs)
                if not result.success:
                    if result.last_exception:
                        raise result.last_exception
                    raise RuntimeError("Retry exhausted without exception")
                return result.value
            return sync_wrapper

    return decorator


class RetryContext:
    """Context manager for retry operations.

    Usage:
        policy = RetryPolicy(max_attempts=3)

        with RetryContext(policy) as ctx:
            for attempt in ctx:
                try:
                    result = risky_operation()
                    ctx.success(result)
                    break
                except Exception as e:
                    ctx.fail(e)
    """

    def __init__(self, policy: RetryPolicy):
        self.policy = policy
        self.attempts: List[RetryAttempt] = []
        self._result: Optional[Any] = None
        self._success = False
        self._exception: Optional[Exception] = None
        self._attempt_num = 0
        self._start_time = 0.0
        self._exhausted = False

    def __enter__(self) -> "RetryContext":
        self._start_time = time.time()
        self.policy.backoff.reset()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        return False

    def __iter__(self) -> "RetryContext":
        return self

    def __next__(self) -> int:
        if self._success or self._exhausted:
            raise StopIteration

        self._attempt_num += 1

        if self._attempt_num > self.policy.max_attempts:
            self._exhausted = True
            raise StopIteration

        if self._attempt_num > 1:
            delay = self.policy.backoff.get_delay(self._attempt_num)
            time.sleep(delay)

        return self._attempt_num

    def success(self, value: Any = None) -> None:
        """Mark attempt as successful."""
        self._result = value
        self._success = True
        attempt = RetryAttempt(
            attempt_number=self._attempt_num,
            delay=self.policy.backoff.get_delay(self._attempt_num) if self._attempt_num > 1 else 0,
        )
        self.attempts.append(attempt)

    def fail(self, exception: Exception) -> None:
        """Mark attempt as failed."""
        self._exception = exception
        delay = self.policy.backoff.get_delay(self._attempt_num) if self._attempt_num > 1 else 0
        attempt = RetryAttempt(
            attempt_number=self._attempt_num,
            delay=delay,
            exception=exception,
        )
        self.attempts.append(attempt)

        if self.policy.on_retry:
            self.policy.on_retry(attempt)

        if not self.policy.should_retry(exception, self._attempt_num):
            self._exhausted = True

    def get_result(self) -> RetryResult:
        """Get the retry result."""
        state = RetryState.SUCCESS if self._success else RetryState.EXHAUSTED
        return RetryResult(
            value=self._result if self._success else None,
            success=self._success,
            attempts=self.attempts,
            total_time=time.time() - self._start_time,
            state=state,
        )


class AsyncRetryContext:
    """Async context manager for retry operations.

    Usage:
        policy = RetryPolicy(max_attempts=3)

        async with AsyncRetryContext(policy) as ctx:
            async for attempt in ctx:
                try:
                    result = await async_risky_operation()
                    ctx.success(result)
                    break
                except Exception as e:
                    ctx.fail(e)
    """

    def __init__(self, policy: RetryPolicy):
        self.policy = policy
        self.attempts: List[RetryAttempt] = []
        self._result: Optional[Any] = None
        self._success = False
        self._exception: Optional[Exception] = None
        self._attempt_num = 0
        self._start_time = 0.0
        self._exhausted = False

    async def __aenter__(self) -> "AsyncRetryContext":
        self._start_time = time.time()
        self.policy.backoff.reset()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        return False

    def __aiter__(self) -> "AsyncRetryContext":
        return self

    async def __anext__(self) -> int:
        if self._success or self._exhausted:
            raise StopAsyncIteration

        self._attempt_num += 1

        if self._attempt_num > self.policy.max_attempts:
            self._exhausted = True
            raise StopAsyncIteration

        if self._attempt_num > 1:
            delay = self.policy.backoff.get_delay(self._attempt_num)
            await asyncio.sleep(delay)

        return self._attempt_num

    def success(self, value: Any = None) -> None:
        """Mark attempt as successful."""
        self._result = value
        self._success = True
        attempt = RetryAttempt(
            attempt_number=self._attempt_num,
            delay=self.policy.backoff.get_delay(self._attempt_num) if self._attempt_num > 1 else 0,
        )
        self.attempts.append(attempt)

    def fail(self, exception: Exception) -> None:
        """Mark attempt as failed."""
        self._exception = exception
        delay = self.policy.backoff.get_delay(self._attempt_num) if self._attempt_num > 1 else 0
        attempt = RetryAttempt(
            attempt_number=self._attempt_num,
            delay=delay,
            exception=exception,
        )
        self.attempts.append(attempt)

        if self.policy.on_retry:
            self.policy.on_retry(attempt)

        if not self.policy.should_retry(exception, self._attempt_num):
            self._exhausted = True

    def get_result(self) -> RetryResult:
        """Get the retry result."""
        state = RetryState.SUCCESS if self._success else RetryState.EXHAUSTED
        return RetryResult(
            value=self._result if self._success else None,
            success=self._success,
            attempts=self.attempts,
            total_time=time.time() - self._start_time,
            state=state,
        )


class RetryBudget:
    """Track and limit retries across operations.

    Usage:
        budget = RetryBudget(max_retries_per_minute=100)

        if budget.can_retry():
            budget.record_retry()
            # do retry
    """

    def __init__(
        self,
        max_retries_per_minute: int = 100,
        window_seconds: float = 60.0,
    ):
        self.max_retries = max_retries_per_minute
        self.window_seconds = window_seconds
        self._retries: List[float] = []

    def _cleanup_old_retries(self) -> None:
        """Remove retries outside the window."""
        cutoff = time.time() - self.window_seconds
        self._retries = [t for t in self._retries if t > cutoff]

    def can_retry(self) -> bool:
        """Check if retry is allowed."""
        self._cleanup_old_retries()
        return len(self._retries) < self.max_retries

    def record_retry(self) -> None:
        """Record a retry attempt."""
        self._retries.append(time.time())

    def get_retry_count(self) -> int:
        """Get current retry count in window."""
        self._cleanup_old_retries()
        return len(self._retries)

    def reset(self) -> None:
        """Reset retry budget."""
        self._retries = []


# Convenience factory functions
def constant_backoff(delay: float = 1.0) -> ConstantBackoff:
    """Create constant backoff strategy."""
    return ConstantBackoff(delay)


def linear_backoff(
    initial: float = 1.0,
    increment: float = 1.0,
    max_delay: float = 60.0,
) -> LinearBackoff:
    """Create linear backoff strategy."""
    return LinearBackoff(initial, increment, max_delay)


def exponential_backoff(
    base: float = 1.0,
    multiplier: float = 2.0,
    max_delay: float = 60.0,
) -> ExponentialBackoff:
    """Create exponential backoff strategy."""
    return ExponentialBackoff(base, multiplier, max_delay)


def fibonacci_backoff(
    multiplier: float = 1.0,
    max_delay: float = 60.0,
) -> FibonacciBackoff:
    """Create fibonacci backoff strategy."""
    return FibonacciBackoff(multiplier, max_delay)


def jittered_exponential(
    base: float = 1.0,
    multiplier: float = 2.0,
    max_delay: float = 60.0,
    jitter_factor: float = 0.5,
) -> JitteredBackoff:
    """Create exponential backoff with jitter."""
    exp = ExponentialBackoff(base, multiplier, max_delay)
    return JitteredBackoff(exp, jitter_factor)
