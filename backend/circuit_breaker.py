"""
Circuit Breaker - Sprint 645

Fault tolerance system for external service calls.

Features:
- Circuit states (closed, open, half-open)
- Automatic recovery
- Failure threshold
- Health monitoring
- Per-service breakers
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Awaitable, TypeVar
from enum import Enum
from threading import Lock
from functools import wraps


T = TypeVar('T')


class CircuitState(str, Enum):
    """Circuit breaker state."""
    CLOSED = "closed"  # Normal operation
    OPEN = "open"  # Failing, rejecting calls
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


@dataclass
class CircuitConfig:
    """Circuit breaker configuration."""
    failure_threshold: int = 5  # failures before opening
    success_threshold: int = 3  # successes to close from half-open
    timeout: float = 30.0  # seconds to stay open before half-open
    half_open_max_calls: int = 3  # max concurrent calls in half-open


@dataclass
class Circuit:
    """Individual circuit breaker."""
    name: str
    config: CircuitConfig
    state: CircuitState = CircuitState.CLOSED
    stats: CircuitStats = field(default_factory=CircuitStats)
    opened_at: Optional[float] = None
    half_open_calls: int = 0

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "state": self.state.value,
            "stats": {
                "total_calls": self.stats.total_calls,
                "successful_calls": self.stats.successful_calls,
                "failed_calls": self.stats.failed_calls,
                "rejected_calls": self.stats.rejected_calls,
                "consecutive_failures": self.stats.consecutive_failures,
                "consecutive_successes": self.stats.consecutive_successes,
            },
            "config": {
                "failure_threshold": self.config.failure_threshold,
                "success_threshold": self.config.success_threshold,
                "timeout": self.config.timeout,
            },
            "opened_at": self.opened_at,
        }


class CircuitBreakerError(Exception):
    """Raised when circuit is open."""
    def __init__(self, circuit_name: str, retry_after: float):
        self.circuit_name = circuit_name
        self.retry_after = retry_after
        super().__init__(f"Circuit '{circuit_name}' is open. Retry after {retry_after:.1f}s")


class CircuitBreaker:
    """Circuit breaker system for fault tolerance.

    Usage:
        cb = CircuitBreaker()

        # Create circuit
        cb.create("external_api", failure_threshold=5, timeout=30)

        # Use as decorator
        @cb.protect("external_api")
        async def call_external_api():
            return await http_client.get("/api")

        # Or call directly
        async with cb.call("external_api"):
            result = await http_client.get("/api")
    """

    def __init__(self):
        """Initialize circuit breaker."""
        self._circuits: Dict[str, Circuit] = {}
        self._lock = Lock()
        self._global_stats = {
            "total_calls": 0,
            "total_failures": 0,
            "total_rejected": 0,
        }

    def create(
        self,
        name: str,
        failure_threshold: int = 5,
        success_threshold: int = 3,
        timeout: float = 30.0,
        half_open_max_calls: int = 3,
    ) -> Circuit:
        """Create a new circuit breaker.

        Args:
            name: Circuit name (usually service name)
            failure_threshold: Failures before opening
            success_threshold: Successes to close from half-open
            timeout: Seconds to stay open
            half_open_max_calls: Max concurrent calls when half-open
        """
        config = CircuitConfig(
            failure_threshold=failure_threshold,
            success_threshold=success_threshold,
            timeout=timeout,
            half_open_max_calls=half_open_max_calls,
        )

        circuit = Circuit(name=name, config=config)

        with self._lock:
            self._circuits[name] = circuit

        return circuit

    def get(self, name: str) -> Optional[Circuit]:
        """Get circuit by name."""
        return self._circuits.get(name)

    def _can_execute(self, circuit: Circuit) -> bool:
        """Check if call can be executed."""
        if circuit.state == CircuitState.CLOSED:
            return True

        if circuit.state == CircuitState.OPEN:
            # Check if timeout has passed
            if circuit.opened_at:
                elapsed = time.time() - circuit.opened_at
                if elapsed >= circuit.config.timeout:
                    # Transition to half-open
                    circuit.state = CircuitState.HALF_OPEN
                    circuit.half_open_calls = 0
                    return True
            return False

        if circuit.state == CircuitState.HALF_OPEN:
            # Allow limited calls in half-open
            return circuit.half_open_calls < circuit.config.half_open_max_calls

        return False

    def _record_success(self, circuit: Circuit):
        """Record successful call."""
        with self._lock:
            circuit.stats.total_calls += 1
            circuit.stats.successful_calls += 1
            circuit.stats.consecutive_successes += 1
            circuit.stats.consecutive_failures = 0
            circuit.stats.last_success_time = time.time()
            self._global_stats["total_calls"] += 1

            if circuit.state == CircuitState.HALF_OPEN:
                circuit.half_open_calls -= 1
                if circuit.stats.consecutive_successes >= circuit.config.success_threshold:
                    # Close circuit
                    circuit.state = CircuitState.CLOSED
                    circuit.opened_at = None

    def _record_failure(self, circuit: Circuit):
        """Record failed call."""
        with self._lock:
            circuit.stats.total_calls += 1
            circuit.stats.failed_calls += 1
            circuit.stats.consecutive_failures += 1
            circuit.stats.consecutive_successes = 0
            circuit.stats.last_failure_time = time.time()
            self._global_stats["total_calls"] += 1
            self._global_stats["total_failures"] += 1

            if circuit.state == CircuitState.HALF_OPEN:
                circuit.half_open_calls -= 1
                # Back to open
                circuit.state = CircuitState.OPEN
                circuit.opened_at = time.time()

            elif circuit.state == CircuitState.CLOSED:
                if circuit.stats.consecutive_failures >= circuit.config.failure_threshold:
                    # Open circuit
                    circuit.state = CircuitState.OPEN
                    circuit.opened_at = time.time()

    def _record_rejected(self, circuit: Circuit):
        """Record rejected call."""
        with self._lock:
            circuit.stats.rejected_calls += 1
            self._global_stats["total_rejected"] += 1

    def call(self, name: str):
        """Context manager for circuit-protected calls.

        Usage:
            async with cb.call("api"):
                result = await make_request()
        """
        return CircuitContext(self, name)

    def protect(self, name: str):
        """Decorator to protect a function with circuit breaker.

        Usage:
            @cb.protect("api")
            async def call_api():
                return await request()
        """
        def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
            @wraps(func)
            async def wrapper(*args, **kwargs) -> T:
                async with self.call(name):
                    return await func(*args, **kwargs)
            return wrapper
        return decorator

    def reset(self, name: str):
        """Reset circuit to closed state."""
        circuit = self._circuits.get(name)
        if circuit:
            with self._lock:
                circuit.state = CircuitState.CLOSED
                circuit.opened_at = None
                circuit.stats.consecutive_failures = 0
                circuit.stats.consecutive_successes = 0

    def force_open(self, name: str):
        """Force circuit to open state."""
        circuit = self._circuits.get(name)
        if circuit:
            with self._lock:
                circuit.state = CircuitState.OPEN
                circuit.opened_at = time.time()

    def list_circuits(self) -> List[dict]:
        """List all circuits."""
        with self._lock:
            return [c.to_dict() for c in self._circuits.values()]

    def get_stats(self) -> Dict[str, Any]:
        """Get global statistics."""
        with self._lock:
            circuits_by_state = {
                "closed": 0,
                "open": 0,
                "half_open": 0,
            }
            for circuit in self._circuits.values():
                circuits_by_state[circuit.state.value] += 1

            return {
                **self._global_stats,
                "circuits_count": len(self._circuits),
                "circuits_by_state": circuits_by_state,
            }

    def health_check(self) -> Dict[str, Any]:
        """Check health of all circuits."""
        unhealthy = []
        for circuit in self._circuits.values():
            if circuit.state != CircuitState.CLOSED:
                unhealthy.append({
                    "name": circuit.name,
                    "state": circuit.state.value,
                    "consecutive_failures": circuit.stats.consecutive_failures,
                })

        return {
            "healthy": len(unhealthy) == 0,
            "total_circuits": len(self._circuits),
            "unhealthy_circuits": unhealthy,
        }


class CircuitContext:
    """Async context manager for circuit-protected calls."""

    def __init__(self, breaker: CircuitBreaker, name: str):
        self._breaker = breaker
        self._name = name
        self._circuit: Optional[Circuit] = None

    async def __aenter__(self):
        self._circuit = self._breaker.get(self._name)

        if not self._circuit:
            # Auto-create with defaults
            self._circuit = self._breaker.create(self._name)

        if not self._breaker._can_execute(self._circuit):
            self._breaker._record_rejected(self._circuit)
            retry_after = 0.0
            if self._circuit.opened_at:
                elapsed = time.time() - self._circuit.opened_at
                retry_after = max(0, self._circuit.config.timeout - elapsed)
            raise CircuitBreakerError(self._name, retry_after)

        if self._circuit.state == CircuitState.HALF_OPEN:
            with self._breaker._lock:
                self._circuit.half_open_calls += 1

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._circuit:
            if exc_type is None:
                self._breaker._record_success(self._circuit)
            else:
                self._breaker._record_failure(self._circuit)
        return False  # Don't suppress exceptions


# Singleton instance
circuit_breaker = CircuitBreaker()

# Pre-configure common circuits
circuit_breaker.create("groq_api", failure_threshold=3, timeout=60)
circuit_breaker.create("edge_tts", failure_threshold=5, timeout=30)
circuit_breaker.create("external_api", failure_threshold=5, timeout=30)


# Compatibility layer for main.py Sprint 618 API
class CircuitBreakerManagerCompat:
    """Compatibility wrapper for older API."""

    def __init__(self, cb: CircuitBreaker):
        self._cb = cb

    def get_all_stats(self) -> dict:
        """Get stats for all circuits."""
        return {c["name"]: c["stats"] for c in self._cb.list_circuits()}

    def get_all(self) -> Dict[str, Circuit]:
        """Get all circuits."""
        return self._cb._circuits

    def get_all_states(self) -> dict:
        """Get states for all circuits."""
        return {c["name"]: c["state"] for c in self._cb.list_circuits()}

    def get_open_circuits(self) -> list:
        """Get list of open circuits."""
        return [c["name"] for c in self._cb.list_circuits() if c["state"] != "closed"]

    def reset_all(self):
        """Reset all circuits."""
        for name in self._cb._circuits:
            self._cb.reset(name)

    def get_stats_summary(self) -> dict:
        """Get summary of circuit stats."""
        return self._cb.get_stats()


circuit_breaker_manager = CircuitBreakerManagerCompat(circuit_breaker)


def get_circuit_breaker(name: str) -> Circuit:
    """Get or create a circuit breaker."""
    circuit = circuit_breaker.get(name)
    if not circuit:
        circuit = circuit_breaker.create(name)
    return circuit
