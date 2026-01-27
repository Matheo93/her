"""
Health Check - Sprint 811

Health check system with dependency monitoring.

Features:
- Liveness and readiness probes
- Dependency health checks
- Custom health indicators
- Aggregated health status
- Timeout handling
- Async checks
"""

import asyncio
import logging
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Any, Callable, Dict, List, Optional, Tuple, Union, Awaitable
)

logger = logging.getLogger(__name__)


class HealthStatus(str, Enum):
    """Health status values."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthDetails:
    """Detailed health information."""
    status: HealthStatus
    message: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    duration_ms: float = 0.0
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "message": self.message,
            "data": self.data,
            "timestamp": self.timestamp,
            "duration_ms": round(self.duration_ms, 2),
            "error": self.error,
        }


@dataclass
class HealthResult:
    """Aggregated health check result."""
    status: HealthStatus
    checks: Dict[str, HealthDetails]
    timestamp: float = field(default_factory=time.time)
    total_duration_ms: float = 0.0

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "timestamp": self.timestamp,
            "total_duration_ms": round(self.total_duration_ms, 2),
            "checks": {name: details.to_dict() for name, details in self.checks.items()},
        }

    @property
    def is_healthy(self) -> bool:
        return self.status == HealthStatus.HEALTHY

    @property
    def is_degraded(self) -> bool:
        return self.status == HealthStatus.DEGRADED

    @property
    def is_unhealthy(self) -> bool:
        return self.status == HealthStatus.UNHEALTHY


class HealthIndicator(ABC):
    """Abstract health indicator."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Indicator name."""
        pass

    @abstractmethod
    async def check(self) -> HealthDetails:
        """Perform health check."""
        pass


class SyncHealthIndicator(HealthIndicator):
    """Health indicator for sync checks."""

    def __init__(
        self,
        name: str,
        check_func: Callable[[], Tuple[HealthStatus, str, Dict[str, Any]]],
    ):
        self._name = name
        self._check_func = check_func

    @property
    def name(self) -> str:
        return self._name

    async def check(self) -> HealthDetails:
        """Run sync check in executor."""
        loop = asyncio.get_event_loop()
        start = time.perf_counter()

        try:
            status, message, data = await loop.run_in_executor(
                None, self._check_func
            )
            duration = (time.perf_counter() - start) * 1000

            return HealthDetails(
                status=status,
                message=message,
                data=data,
                duration_ms=duration,
            )
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=HealthStatus.UNHEALTHY,
                message="Check failed",
                error=str(e),
                duration_ms=duration,
            )


class AsyncHealthIndicator(HealthIndicator):
    """Health indicator for async checks."""

    def __init__(
        self,
        name: str,
        check_func: Callable[[], Awaitable[Tuple[HealthStatus, str, Dict[str, Any]]]],
    ):
        self._name = name
        self._check_func = check_func

    @property
    def name(self) -> str:
        return self._name

    async def check(self) -> HealthDetails:
        """Run async check."""
        start = time.perf_counter()

        try:
            status, message, data = await self._check_func()
            duration = (time.perf_counter() - start) * 1000

            return HealthDetails(
                status=status,
                message=message,
                data=data,
                duration_ms=duration,
            )
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=HealthStatus.UNHEALTHY,
                message="Check failed",
                error=str(e),
                duration_ms=duration,
            )


class DatabaseHealthIndicator(HealthIndicator):
    """Check database connectivity.

    Usage:
        indicator = DatabaseHealthIndicator(
            "postgres",
            connection_factory=lambda: psycopg2.connect(...)
        )
    """

    def __init__(
        self,
        name: str,
        connection_factory: Callable,
        query: str = "SELECT 1",
    ):
        self._name = name
        self._connection_factory = connection_factory
        self._query = query

    @property
    def name(self) -> str:
        return self._name

    async def check(self) -> HealthDetails:
        """Check database connectivity."""
        start = time.perf_counter()

        try:
            loop = asyncio.get_event_loop()
            conn = await loop.run_in_executor(None, self._connection_factory)

            try:
                cursor = conn.cursor()
                cursor.execute(self._query)
                cursor.fetchone()
                cursor.close()

                duration = (time.perf_counter() - start) * 1000
                return HealthDetails(
                    status=HealthStatus.HEALTHY,
                    message="Database connection successful",
                    data={"query": self._query},
                    duration_ms=duration,
                )
            finally:
                conn.close()

        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=HealthStatus.UNHEALTHY,
                message="Database connection failed",
                error=str(e),
                duration_ms=duration,
            )


class HttpHealthIndicator(HealthIndicator):
    """Check HTTP endpoint health.

    Usage:
        indicator = HttpHealthIndicator(
            "api",
            url="https://api.example.com/health",
            timeout=5.0
        )
    """

    def __init__(
        self,
        name: str,
        url: str,
        method: str = "GET",
        timeout: float = 5.0,
        expected_status: int = 200,
    ):
        self._name = name
        self._url = url
        self._method = method
        self._timeout = timeout
        self._expected_status = expected_status

    @property
    def name(self) -> str:
        return self._name

    async def check(self) -> HealthDetails:
        """Check HTTP endpoint."""
        start = time.perf_counter()

        try:
            import urllib.request
            import urllib.error

            loop = asyncio.get_event_loop()

            def make_request() -> int:
                req = urllib.request.Request(self._url, method=self._method)
                with urllib.request.urlopen(req, timeout=self._timeout) as response:
                    return response.status

            status_code = await loop.run_in_executor(None, make_request)
            duration = (time.perf_counter() - start) * 1000

            if status_code == self._expected_status:
                return HealthDetails(
                    status=HealthStatus.HEALTHY,
                    message="HTTP endpoint healthy",
                    data={"url": self._url, "status_code": status_code},
                    duration_ms=duration,
                )
            else:
                return HealthDetails(
                    status=HealthStatus.UNHEALTHY,
                    message="Unexpected status code",
                    data={"url": self._url, "status_code": status_code, "expected": self._expected_status},
                    duration_ms=duration,
                )

        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=HealthStatus.UNHEALTHY,
                message="HTTP request failed",
                data={"url": self._url},
                error=str(e),
                duration_ms=duration,
            )


class MemoryHealthIndicator(HealthIndicator):
    """Check memory usage.

    Usage:
        indicator = MemoryHealthIndicator(
            warning_threshold=80,  # 80%
            critical_threshold=95  # 95%
        )
    """

    def __init__(
        self,
        name: str = "memory",
        warning_threshold: float = 80.0,
        critical_threshold: float = 95.0,
    ):
        self._name = name
        self._warning_threshold = warning_threshold
        self._critical_threshold = critical_threshold

    @property
    def name(self) -> str:
        return self._name

    async def check(self) -> HealthDetails:
        """Check memory usage."""
        start = time.perf_counter()

        try:
            import psutil
            memory = psutil.virtual_memory()
            percent = memory.percent
            duration = (time.perf_counter() - start) * 1000

            if percent >= self._critical_threshold:
                status = HealthStatus.UNHEALTHY
                message = "Memory usage critical"
            elif percent >= self._warning_threshold:
                status = HealthStatus.DEGRADED
                message = "Memory usage high"
            else:
                status = HealthStatus.HEALTHY
                message = "Memory usage normal"

            return HealthDetails(
                status=status,
                message=message,
                data={
                    "percent": round(percent, 1),
                    "available_mb": round(memory.available / (1024 * 1024), 1),
                    "total_mb": round(memory.total / (1024 * 1024), 1),
                },
                duration_ms=duration,
            )

        except ImportError:
            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=HealthStatus.UNKNOWN,
                message="psutil not installed",
                duration_ms=duration,
            )
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=HealthStatus.UNKNOWN,
                message="Failed to check memory",
                error=str(e),
                duration_ms=duration,
            )


class DiskHealthIndicator(HealthIndicator):
    """Check disk usage.

    Usage:
        indicator = DiskHealthIndicator(
            path="/",
            warning_threshold=80,
            critical_threshold=95
        )
    """

    def __init__(
        self,
        path: str = "/",
        name: str = "disk",
        warning_threshold: float = 80.0,
        critical_threshold: float = 95.0,
    ):
        self._path = path
        self._name = name
        self._warning_threshold = warning_threshold
        self._critical_threshold = critical_threshold

    @property
    def name(self) -> str:
        return self._name

    async def check(self) -> HealthDetails:
        """Check disk usage."""
        start = time.perf_counter()

        try:
            import psutil
            disk = psutil.disk_usage(self._path)
            percent = disk.percent
            duration = (time.perf_counter() - start) * 1000

            if percent >= self._critical_threshold:
                status = HealthStatus.UNHEALTHY
                message = "Disk usage critical"
            elif percent >= self._warning_threshold:
                status = HealthStatus.DEGRADED
                message = "Disk usage high"
            else:
                status = HealthStatus.HEALTHY
                message = "Disk usage normal"

            return HealthDetails(
                status=status,
                message=message,
                data={
                    "path": self._path,
                    "percent": round(percent, 1),
                    "free_gb": round(disk.free / (1024 * 1024 * 1024), 1),
                    "total_gb": round(disk.total / (1024 * 1024 * 1024), 1),
                },
                duration_ms=duration,
            )

        except ImportError:
            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=HealthStatus.UNKNOWN,
                message="psutil not installed",
                duration_ms=duration,
            )
        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=HealthStatus.UNKNOWN,
                message="Failed to check disk",
                error=str(e),
                duration_ms=duration,
            )


class CustomHealthIndicator(HealthIndicator):
    """Custom health indicator with lambda.

    Usage:
        indicator = CustomHealthIndicator(
            "cache",
            lambda: (HealthStatus.HEALTHY, "Cache OK", {"size": 1000})
        )
    """

    def __init__(
        self,
        name: str,
        check_func: Union[
            Callable[[], Tuple[HealthStatus, str, Dict[str, Any]]],
            Callable[[], Awaitable[Tuple[HealthStatus, str, Dict[str, Any]]]],
        ],
    ):
        self._name = name
        self._check_func = check_func
        self._is_async = asyncio.iscoroutinefunction(check_func)

    @property
    def name(self) -> str:
        return self._name

    async def check(self) -> HealthDetails:
        """Run custom check."""
        start = time.perf_counter()

        try:
            if self._is_async:
                status, message, data = await self._check_func()
            else:
                loop = asyncio.get_event_loop()
                status, message, data = await loop.run_in_executor(
                    None, self._check_func
                )

            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=status,
                message=message,
                data=data,
                duration_ms=duration,
            )

        except Exception as e:
            duration = (time.perf_counter() - start) * 1000
            return HealthDetails(
                status=HealthStatus.UNHEALTHY,
                message="Check failed",
                error=str(e),
                duration_ms=duration,
            )


class HealthChecker:
    """Aggregate health checker.

    Usage:
        checker = HealthChecker()
        checker.add_indicator(DatabaseHealthIndicator(...))
        checker.add_indicator(MemoryHealthIndicator())

        # Liveness check (just alive)
        result = await checker.liveness()

        # Readiness check (all dependencies)
        result = await checker.readiness()

        # Full health check
        result = await checker.check_health()
    """

    def __init__(
        self,
        timeout: float = 30.0,
        parallel: bool = True,
    ):
        self.timeout = timeout
        self.parallel = parallel
        self._indicators: Dict[str, HealthIndicator] = {}
        self._readiness_indicators: Set[str] = set()
        self._liveness_indicators: Set[str] = set()
        self._lock = threading.RLock()

    def add_indicator(
        self,
        indicator: HealthIndicator,
        readiness: bool = True,
        liveness: bool = False,
    ) -> None:
        """Add a health indicator."""
        with self._lock:
            self._indicators[indicator.name] = indicator
            if readiness:
                self._readiness_indicators.add(indicator.name)
            if liveness:
                self._liveness_indicators.add(indicator.name)

    def remove_indicator(self, name: str) -> bool:
        """Remove an indicator."""
        with self._lock:
            if name in self._indicators:
                del self._indicators[name]
                self._readiness_indicators.discard(name)
                self._liveness_indicators.discard(name)
                return True
            return False

    async def check_health(
        self,
        include: Optional[List[str]] = None,
        exclude: Optional[List[str]] = None,
    ) -> HealthResult:
        """Run all health checks."""
        start = time.perf_counter()

        with self._lock:
            indicators = dict(self._indicators)

        # Filter indicators
        if include:
            indicators = {k: v for k, v in indicators.items() if k in include}
        if exclude:
            indicators = {k: v for k, v in indicators.items() if k not in exclude}

        if not indicators:
            return HealthResult(
                status=HealthStatus.HEALTHY,
                checks={},
                total_duration_ms=0,
            )

        # Run checks
        if self.parallel:
            results = await self._run_parallel(indicators)
        else:
            results = await self._run_sequential(indicators)

        # Aggregate status
        overall_status = self._aggregate_status(results)
        total_duration = (time.perf_counter() - start) * 1000

        return HealthResult(
            status=overall_status,
            checks=results,
            total_duration_ms=total_duration,
        )

    async def _run_parallel(
        self,
        indicators: Dict[str, HealthIndicator],
    ) -> Dict[str, HealthDetails]:
        """Run checks in parallel."""
        async def run_with_timeout(name: str, indicator: HealthIndicator) -> Tuple[str, HealthDetails]:
            try:
                result = await asyncio.wait_for(
                    indicator.check(),
                    timeout=self.timeout,
                )
                return name, result
            except asyncio.TimeoutError:
                return name, HealthDetails(
                    status=HealthStatus.UNHEALTHY,
                    message="Health check timed out",
                    error="Timeout after " + str(self.timeout) + " seconds",
                )

        tasks = [
            run_with_timeout(name, indicator)
            for name, indicator in indicators.items()
        ]

        results_list = await asyncio.gather(*tasks, return_exceptions=True)

        results: Dict[str, HealthDetails] = {}
        for item in results_list:
            if isinstance(item, Exception):
                logger.error("Health check error: " + str(item))
                continue
            name, details = item
            results[name] = details

        return results

    async def _run_sequential(
        self,
        indicators: Dict[str, HealthIndicator],
    ) -> Dict[str, HealthDetails]:
        """Run checks sequentially."""
        results: Dict[str, HealthDetails] = {}

        for name, indicator in indicators.items():
            try:
                result = await asyncio.wait_for(
                    indicator.check(),
                    timeout=self.timeout,
                )
                results[name] = result
            except asyncio.TimeoutError:
                results[name] = HealthDetails(
                    status=HealthStatus.UNHEALTHY,
                    message="Health check timed out",
                    error="Timeout after " + str(self.timeout) + " seconds",
                )
            except Exception as e:
                logger.error("Health check error for " + name + ": " + str(e))
                results[name] = HealthDetails(
                    status=HealthStatus.UNHEALTHY,
                    message="Health check failed",
                    error=str(e),
                )

        return results

    def _aggregate_status(self, results: Dict[str, HealthDetails]) -> HealthStatus:
        """Aggregate status from multiple checks."""
        if not results:
            return HealthStatus.HEALTHY

        statuses = [d.status for d in results.values()]

        if any(s == HealthStatus.UNHEALTHY for s in statuses):
            return HealthStatus.UNHEALTHY
        if any(s == HealthStatus.DEGRADED for s in statuses):
            return HealthStatus.DEGRADED
        if any(s == HealthStatus.UNKNOWN for s in statuses):
            return HealthStatus.DEGRADED

        return HealthStatus.HEALTHY

    async def liveness(self) -> HealthResult:
        """Liveness probe - is the service alive?"""
        if not self._liveness_indicators:
            # Default: just return healthy
            return HealthResult(
                status=HealthStatus.HEALTHY,
                checks={},
            )

        return await self.check_health(include=list(self._liveness_indicators))

    async def readiness(self) -> HealthResult:
        """Readiness probe - is the service ready to accept traffic?"""
        if not self._readiness_indicators:
            return await self.check_health()

        return await self.check_health(include=list(self._readiness_indicators))

    def get_indicators(self) -> List[str]:
        """Get list of indicator names."""
        with self._lock:
            return list(self._indicators.keys())


# Missing import
from typing import Set


# Global health checker
_global_checker: Optional[HealthChecker] = None
_checker_lock = threading.Lock()


def get_checker() -> HealthChecker:
    """Get global health checker."""
    global _global_checker
    if _global_checker is None:
        with _checker_lock:
            if _global_checker is None:
                _global_checker = HealthChecker()
    return _global_checker


def set_checker(checker: HealthChecker) -> None:
    """Set global health checker."""
    global _global_checker
    with _checker_lock:
        _global_checker = checker


async def check_health() -> HealthResult:
    """Check health using global checker."""
    return await get_checker().check_health()


async def liveness() -> HealthResult:
    """Liveness probe using global checker."""
    return await get_checker().liveness()


async def readiness() -> HealthResult:
    """Readiness probe using global checker."""
    return await get_checker().readiness()


# Convenience functions
def healthy(message: str = "OK", **data: Any) -> Tuple[HealthStatus, str, Dict[str, Any]]:
    """Return healthy status tuple."""
    return (HealthStatus.HEALTHY, message, data)


def degraded(message: str, **data: Any) -> Tuple[HealthStatus, str, Dict[str, Any]]:
    """Return degraded status tuple."""
    return (HealthStatus.DEGRADED, message, data)


def unhealthy(message: str, **data: Any) -> Tuple[HealthStatus, str, Dict[str, Any]]:
    """Return unhealthy status tuple."""
    return (HealthStatus.UNHEALTHY, message, data)
