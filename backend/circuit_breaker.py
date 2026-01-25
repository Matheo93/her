"""
Circuit Breaker - Sprint 631

Resilience pattern for external service calls.

Features:
- Three states (closed/open/half-open)
- Failure counting
- Automatic recovery
- Timeout handling
- Fallback support
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, Callable, TypeVar, Generic, List
from enum import Enum
from threading import Lock
from functools import wraps


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject requests
    HALF_OPEN = "half_open"  # Testing recovery


@dataclass
class CircuitStats:
    """Circuit breaker statistics."""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    last_failure_time: Optional[float] = None
    last_success_time: Optional[float] = None
    consecutive_failures: int = 0
    consecutive_successes: int = 0
    state_changes: int = 0

    def to_dict(self) -> dict:
        return {
            "total_calls": self.total_calls,
            "successful_calls": self.successful_calls,
            "failed_calls": self.failed_calls,
            "rejected_calls": self.rejected_calls,
            "last_failure_time": self.last_failure_time,
            "last_success_time": self.last_success_time,
            "consecutive_failures": self.consecutive_failures,
            "consecutive_successes": self.consecutive_successes,
            "state_changes": self.state_changes,
            "success_rate": self.success_rate,
        }

    @property
    def success_rate(self) -> float:
        if self.total_calls == 0:
            return 1.0
        return self.successful_calls / self.total_calls


class CircuitBreakerError(Exception):
    """Raised when circuit is open."""
    pass


T = TypeVar("T")


class CircuitBreaker(Generic[T]):
    """Circuit breaker for resilient service calls.

    Usage:
        breaker = CircuitBreaker("external_api", failure_threshold=5)

        try:
            result = await breaker.call(external_api_call, timeout=5.0)
        except CircuitBreakerError:
            # Circuit is open, use fallback
            result = cached_value

        # Or with decorator
        @breaker.protect
        async def call_external_api():
            return await httpx.get("https://api.example.com")
    """

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        success_threshold: int = 3,
        timeout: float = 30.0,
        half_open_timeout: float = 60.0,
        excluded_exceptions: Optional[tuple] = None
    ):
        """Initialize circuit breaker.

        Args:
            name: Circuit breaker name
            failure_threshold: Failures before opening
            success_threshold: Successes before closing from half-open
            timeout: Default call timeout
            half_open_timeout: Time before trying half-open
            excluded_exceptions: Exceptions that don't count as failures
        """
        self.name = name
        self.failure_threshold = failure_threshold
        self.success_threshold = success_threshold
        self.timeout = timeout
        self.half_open_timeout = half_open_timeout
        self.excluded_exceptions = excluded_exceptions or ()

        self._state = CircuitState.CLOSED
        self._stats = CircuitStats()
        self._lock = Lock()
        self._last_state_change = time.time()
        self._fallback: Optional[Callable[[], T]] = None

    @property
    def state(self) -> CircuitState:
        """Get current state, handling auto-transition to half-open."""
        with self._lock:
            if self._state == CircuitState.OPEN:
                if time.time() - self._last_state_change >= self.half_open_timeout:
                    self._transition_to(CircuitState.HALF_OPEN)
            return self._state

    @property
    def stats(self) -> CircuitStats:
        """Get statistics."""
        with self._lock:
            return self._stats

    def _transition_to(self, new_state: CircuitState):
        """Transition to a new state."""
        if self._state != new_state:
            self._state = new_state
            self._last_state_change = time.time()
            self._stats.state_changes += 1

    def _record_success(self):
        """Record a successful call."""
        with self._lock:
            self._stats.total_calls += 1
            self._stats.successful_calls += 1
            self._stats.last_success_time = time.time()
            self._stats.consecutive_successes += 1
            self._stats.consecutive_failures = 0

            if self._state == CircuitState.HALF_OPEN:
                if self._stats.consecutive_successes >= self.success_threshold:
                    self._transition_to(CircuitState.CLOSED)

    def _record_failure(self):
        """Record a failed call."""
        with self._lock:
            self._stats.total_calls += 1
            self._stats.failed_calls += 1
            self._stats.last_failure_time = time.time()
            self._stats.consecutive_failures += 1
            self._stats.consecutive_successes = 0

            if self._state == CircuitState.CLOSED:
                if self._stats.consecutive_failures >= self.failure_threshold:
                    self._transition_to(CircuitState.OPEN)

            elif self._state == CircuitState.HALF_OPEN:
                self._transition_to(CircuitState.OPEN)

    def _record_rejection(self):
        """Record a rejected call."""
        with self._lock:
            self._stats.total_calls += 1
            self._stats.rejected_calls += 1

    def set_fallback(self, fallback: Callable[[], T]):
        """Set fallback function.

        Args:
            fallback: Function to call when circuit is open
        """
        self._fallback = fallback

    async def call(
        self,
        func: Callable[..., Any],
        *args,
        timeout: Optional[float] = None,
        **kwargs
    ) -> T:
        """Execute function through circuit breaker.

        Args:
            func: Function to call
            *args: Function arguments
            timeout: Optional timeout override
            **kwargs: Function keyword arguments

        Returns:
            Function result

        Raises:
            CircuitBreakerError: When circuit is open
        """
        state = self.state

        if state == CircuitState.OPEN:
            self._record_rejection()

            if self._fallback:
                return self._fallback()

            raise CircuitBreakerError(f"Circuit breaker {self.name} is open")

        call_timeout = timeout or self.timeout

        try:
            if asyncio.iscoroutinefunction(func):
                result = await asyncio.wait_for(
                    func(*args, **kwargs),
                    timeout=call_timeout
                )
            else:
                result = func(*args, **kwargs)

            self._record_success()
            return result

        except self.excluded_exceptions:
            # Don't count as failure
            self._record_success()
            raise

        except asyncio.TimeoutError:
            self._record_failure()
            raise

        except Exception:
            self._record_failure()
            raise

    def protect(self, func: Callable[..., T]) -> Callable[..., T]:
        """Decorator to protect a function with circuit breaker.

        Usage:
            @breaker.protect
            async def call_api():
                return await httpx.get(url)
        """
        @wraps(func)
        async def wrapper(*args, **kwargs):
            return await self.call(func, *args, **kwargs)
        return wrapper

    def reset(self):
        """Reset circuit breaker to closed state."""
        with self._lock:
            self._transition_to(CircuitState.CLOSED)
            self._stats.consecutive_failures = 0
            self._stats.consecutive_successes = 0

    def force_open(self):
        """Force circuit to open state."""
        with self._lock:
            self._transition_to(CircuitState.OPEN)

    def force_close(self):
        """Force circuit to closed state."""
        with self._lock:
            self._transition_to(CircuitState.CLOSED)
            self._stats.consecutive_failures = 0

    def to_dict(self) -> dict:
        """Get circuit breaker status."""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_threshold": self.failure_threshold,
            "success_threshold": self.success_threshold,
            "timeout": self.timeout,
            "half_open_timeout": self.half_open_timeout,
            "stats": self._stats.to_dict(),
        }


class CircuitBreakerManager:
    """Manage multiple circuit breakers.

    Usage:
        manager = CircuitBreakerManager()

        # Get or create circuit breaker
        breaker = manager.get("external_api", failure_threshold=5)

        # Check all circuit states
        states = manager.get_all_states()
    """

    def __init__(self):
        """Initialize manager."""
        self._breakers: Dict[str, CircuitBreaker] = {}
        self._lock = Lock()

    def get(
        self,
        name: str,
        failure_threshold: int = 5,
        success_threshold: int = 3,
        timeout: float = 30.0,
        half_open_timeout: float = 60.0
    ) -> CircuitBreaker:
        """Get or create a circuit breaker.

        Args:
            name: Circuit breaker name
            failure_threshold: Failures before opening
            success_threshold: Successes before closing
            timeout: Default call timeout
            half_open_timeout: Time before half-open

        Returns:
            Circuit breaker instance
        """
        with self._lock:
            if name not in self._breakers:
                self._breakers[name] = CircuitBreaker(
                    name=name,
                    failure_threshold=failure_threshold,
                    success_threshold=success_threshold,
                    timeout=timeout,
                    half_open_timeout=half_open_timeout,
                )
            return self._breakers[name]

    def get_all(self) -> Dict[str, CircuitBreaker]:
        """Get all circuit breakers."""
        with self._lock:
            return dict(self._breakers)

    def get_all_states(self) -> Dict[str, str]:
        """Get all circuit states."""
        with self._lock:
            return {
                name: breaker.state.value
                for name, breaker in self._breakers.items()
            }

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get all circuit statistics."""
        with self._lock:
            return {
                name: breaker.to_dict()
                for name, breaker in self._breakers.items()
            }

    def reset_all(self):
        """Reset all circuit breakers."""
        with self._lock:
            for breaker in self._breakers.values():
                breaker.reset()

    def get_open_circuits(self) -> List[str]:
        """Get names of open circuits."""
        with self._lock:
            return [
                name for name, breaker in self._breakers.items()
                if breaker.state == CircuitState.OPEN
            ]

    def get_stats_summary(self) -> Dict[str, Any]:
        """Get summary statistics."""
        with self._lock:
            breakers = list(self._breakers.values())

        total = len(breakers)
        by_state = {state.value: 0 for state in CircuitState}

        for breaker in breakers:
            by_state[breaker.state.value] += 1

        total_calls = sum(b.stats.total_calls for b in breakers)
        total_failures = sum(b.stats.failed_calls for b in breakers)

        return {
            "total_circuits": total,
            "by_state": by_state,
            "total_calls": total_calls,
            "total_failures": total_failures,
            "overall_success_rate": (
                (total_calls - total_failures) / total_calls
                if total_calls > 0 else 1.0
            ),
        }

    def remove(self, name: str) -> bool:
        """Remove a circuit breaker.

        Args:
            name: Circuit breaker name

        Returns:
            True if removed
        """
        with self._lock:
            if name in self._breakers:
                del self._breakers[name]
                return True
            return False


# Singleton manager
circuit_breaker_manager = CircuitBreakerManager()


# Convenience function
def get_circuit_breaker(name: str, **kwargs) -> CircuitBreaker:
    """Get or create a circuit breaker.

    Args:
        name: Circuit breaker name
        **kwargs: Circuit breaker options

    Returns:
        Circuit breaker instance
    """
    return circuit_breaker_manager.get(name, **kwargs)
