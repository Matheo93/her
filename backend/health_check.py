"""
Health Check - Sprint 749

Application health monitoring system.

Features:
- Liveness and readiness checks
- Dependency health
- Async checks
- Aggregated status
- Detailed diagnostics
"""

import time
import asyncio
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union, Awaitable
)
from enum import Enum
from abc import ABC, abstractmethod
from functools import wraps
import traceback


T = TypeVar("T")


class HealthStatus(str, Enum):
    """Health status values."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class CheckResult:
    """Result of a health check."""
    name: str
    status: HealthStatus
    message: str = ""
    duration_ms: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "status": self.status.value,
            "message": self.message,
            "duration_ms": round(self.duration_ms, 2),
            "details": self.details,
            "timestamp": self.timestamp,
            "error": self.error,
        }


@dataclass
class HealthReport:
    """Aggregated health report."""
    status: HealthStatus
    checks: List[CheckResult]
    duration_ms: float = 0.0
    timestamp: float = field(default_factory=time.time)
    version: str = ""
    uptime_seconds: float = 0.0

    def to_dict(self) -> dict:
        return {
            "status": self.status.value,
            "checks": [c.to_dict() for c in self.checks],
            "duration_ms": round(self.duration_ms, 2),
            "timestamp": self.timestamp,
            "version": self.version,
            "uptime_seconds": round(self.uptime_seconds, 2),
        }


class HealthCheck(ABC):
    """Base health check class."""

    def __init__(self, name: str, critical: bool = True, timeout: float = 5.0):
        self.name = name
        self.critical = critical
        self.timeout = timeout

    @abstractmethod
    async def check(self) -> CheckResult:
        """Perform health check."""
        pass


class FunctionCheck(HealthCheck):
    """Health check from a function."""

    def __init__(
        self,
        name: str,
        check_func: Callable[[], Union[bool, Awaitable[bool]]],
        critical: bool = True,
        timeout: float = 5.0,
    ):
        super().__init__(name, critical, timeout)
        self.check_func = check_func

    async def check(self) -> CheckResult:
        start = time.time()
        try:
            if asyncio.iscoroutinefunction(self.check_func):
                result = await asyncio.wait_for(
                    self.check_func(),
                    timeout=self.timeout
                )
            else:
                result = self.check_func()

            duration = (time.time() - start) * 1000

            if isinstance(result, bool):
                status = HealthStatus.HEALTHY if result else HealthStatus.UNHEALTHY
                message = "Check passed" if result else "Check failed"
            elif isinstance(result, tuple):
                status = HealthStatus.HEALTHY if result[0] else HealthStatus.UNHEALTHY
                message = result[1] if len(result) > 1 else ""
            else:
                status = HealthStatus.HEALTHY
                message = str(result)

            return CheckResult(
                name=self.name,
                status=status,
                message=message,
                duration_ms=duration,
            )

        except asyncio.TimeoutError:
            duration = (time.time() - start) * 1000
            return CheckResult(
                name=self.name,
                status=HealthStatus.UNHEALTHY,
                message="Check timed out",
                duration_ms=duration,
                error="Timeout after " + str(self.timeout) + "s",
            )

        except Exception as e:
            duration = (time.time() - start) * 1000
            return CheckResult(
                name=self.name,
                status=HealthStatus.UNHEALTHY,
                message="Check failed with exception",
                duration_ms=duration,
                error=str(e),
            )


class DatabaseCheck(HealthCheck):
    """Database connectivity check."""

    def __init__(
        self,
        name: str = "database",
        ping_func: Optional[Callable[[], Awaitable[bool]]] = None,
        critical: bool = True,
    ):
        super().__init__(name, critical)
        self.ping_func = ping_func

    async def check(self) -> CheckResult:
        start = time.time()
        try:
            if self.ping_func:
                if asyncio.iscoroutinefunction(self.ping_func):
                    connected = await self.ping_func()
                else:
                    connected = self.ping_func()
            else:
                # Default: assume healthy if no ping function
                connected = True

            duration = (time.time() - start) * 1000
            return CheckResult(
                name=self.name,
                status=HealthStatus.HEALTHY if connected else HealthStatus.UNHEALTHY,
                message="Connected" if connected else "Connection failed",
                duration_ms=duration,
            )

        except Exception as e:
            duration = (time.time() - start) * 1000
            return CheckResult(
                name=self.name,
                status=HealthStatus.UNHEALTHY,
                message="Connection error",
                duration_ms=duration,
                error=str(e),
            )


class DiskSpaceCheck(HealthCheck):
    """Disk space health check."""

    def __init__(
        self,
        name: str = "disk",
        path: str = "/",
        min_free_percent: float = 10.0,
        critical: bool = True,
    ):
        super().__init__(name, critical)
        self.path = path
        self.min_free_percent = min_free_percent

    async def check(self) -> CheckResult:
        import shutil
        start = time.time()

        try:
            total, used, free = shutil.disk_usage(self.path)
            free_percent = (free / total) * 100
            duration = (time.time() - start) * 1000

            if free_percent >= self.min_free_percent:
                status = HealthStatus.HEALTHY
            elif free_percent >= self.min_free_percent / 2:
                status = HealthStatus.DEGRADED
            else:
                status = HealthStatus.UNHEALTHY

            return CheckResult(
                name=self.name,
                status=status,
                message=f"{free_percent:.1f}% free ({free // (1024**3)} GB)",
                duration_ms=duration,
                details={
                    "total_gb": total // (1024**3),
                    "used_gb": used // (1024**3),
                    "free_gb": free // (1024**3),
                    "free_percent": round(free_percent, 2),
                },
            )

        except Exception as e:
            duration = (time.time() - start) * 1000
            return CheckResult(
                name=self.name,
                status=HealthStatus.UNKNOWN,
                message="Could not check disk",
                duration_ms=duration,
                error=str(e),
            )


class MemoryCheck(HealthCheck):
    """Memory usage health check."""

    def __init__(
        self,
        name: str = "memory",
        max_used_percent: float = 90.0,
        critical: bool = True,
    ):
        super().__init__(name, critical)
        self.max_used_percent = max_used_percent

    async def check(self) -> CheckResult:
        start = time.time()

        try:
            import psutil
            memory = psutil.virtual_memory()
            duration = (time.time() - start) * 1000

            if memory.percent <= self.max_used_percent:
                status = HealthStatus.HEALTHY
            elif memory.percent <= self.max_used_percent + 5:
                status = HealthStatus.DEGRADED
            else:
                status = HealthStatus.UNHEALTHY

            return CheckResult(
                name=self.name,
                status=status,
                message=f"{memory.percent}% used ({memory.available // (1024**2)} MB available)",
                duration_ms=duration,
                details={
                    "total_mb": memory.total // (1024**2),
                    "available_mb": memory.available // (1024**2),
                    "used_percent": memory.percent,
                },
            )

        except ImportError:
            duration = (time.time() - start) * 1000
            return CheckResult(
                name=self.name,
                status=HealthStatus.UNKNOWN,
                message="psutil not available",
                duration_ms=duration,
            )

        except Exception as e:
            duration = (time.time() - start) * 1000
            return CheckResult(
                name=self.name,
                status=HealthStatus.UNKNOWN,
                message="Could not check memory",
                duration_ms=duration,
                error=str(e),
            )


class HealthChecker:
    """Health check manager.

    Usage:
        checker = HealthChecker(version="1.0.0")

        # Add checks
        checker.add_check(DatabaseCheck(ping_func=db.ping))
        checker.add_check(DiskSpaceCheck(min_free_percent=10))

        # Add function check
        checker.add_function_check("cache", lambda: redis.ping())

        # Run checks
        report = await checker.check_health()

        # Liveness check
        alive = await checker.is_alive()

        # Readiness check
        ready = await checker.is_ready()
    """

    def __init__(self, version: str = ""):
        self._checks: Dict[str, HealthCheck] = {}
        self._version = version
        self._start_time = time.time()
        self._lock = threading.Lock()

    def add_check(self, check: HealthCheck) -> None:
        """Add a health check."""
        with self._lock:
            self._checks[check.name] = check

    def remove_check(self, name: str) -> bool:
        """Remove a health check."""
        with self._lock:
            if name in self._checks:
                del self._checks[name]
                return True
            return False

    def add_function_check(
        self,
        name: str,
        check_func: Callable[[], Union[bool, Awaitable[bool]]],
        critical: bool = True,
        timeout: float = 5.0,
    ) -> None:
        """Add a function-based health check."""
        check = FunctionCheck(name, check_func, critical, timeout)
        self.add_check(check)

    async def check_health(self, include_details: bool = True) -> HealthReport:
        """Run all health checks and return report."""
        start = time.time()
        results: List[CheckResult] = []

        # Run checks concurrently
        tasks = []
        for check in self._checks.values():
            tasks.append(check.check())

        if tasks:
            check_results = await asyncio.gather(*tasks, return_exceptions=True)

            for i, result in enumerate(check_results):
                if isinstance(result, Exception):
                    check_name = list(self._checks.values())[i].name
                    results.append(CheckResult(
                        name=check_name,
                        status=HealthStatus.UNHEALTHY,
                        message="Check threw exception",
                        error=str(result),
                    ))
                else:
                    results.append(result)

        # Determine overall status
        overall_status = self._aggregate_status(results)

        duration = (time.time() - start) * 1000
        uptime = time.time() - self._start_time

        return HealthReport(
            status=overall_status,
            checks=results if include_details else [],
            duration_ms=duration,
            version=self._version,
            uptime_seconds=uptime,
        )

    def _aggregate_status(self, results: List[CheckResult]) -> HealthStatus:
        """Aggregate check results into overall status."""
        if not results:
            return HealthStatus.HEALTHY

        has_unhealthy_critical = False
        has_degraded = False
        has_unhealthy_non_critical = False

        for result in results:
            check = self._checks.get(result.name)
            is_critical = check.critical if check else True

            if result.status == HealthStatus.UNHEALTHY:
                if is_critical:
                    has_unhealthy_critical = True
                else:
                    has_unhealthy_non_critical = True
            elif result.status == HealthStatus.DEGRADED:
                has_degraded = True

        if has_unhealthy_critical:
            return HealthStatus.UNHEALTHY
        if has_degraded or has_unhealthy_non_critical:
            return HealthStatus.DEGRADED
        return HealthStatus.HEALTHY

    async def is_alive(self) -> bool:
        """Basic liveness check (app is running)."""
        return True

    async def is_ready(self) -> bool:
        """Readiness check (app can serve traffic)."""
        report = await self.check_health(include_details=False)
        return report.status in (HealthStatus.HEALTHY, HealthStatus.DEGRADED)

    async def get_liveness(self) -> dict:
        """Get liveness response."""
        return {
            "status": "alive",
            "timestamp": time.time(),
        }

    async def get_readiness(self) -> dict:
        """Get readiness response."""
        report = await self.check_health()
        return {
            "status": "ready" if await self.is_ready() else "not_ready",
            "checks": report.to_dict(),
        }


# Singleton instance
health_checker = HealthChecker()


# Convenience functions
def add_health_check(check: HealthCheck) -> None:
    """Add health check to global checker."""
    health_checker.add_check(check)


def add_function_check(
    name: str,
    check_func: Callable[[], Union[bool, Awaitable[bool]]],
    critical: bool = True,
) -> None:
    """Add function check to global checker."""
    health_checker.add_function_check(name, check_func, critical)


async def check_health() -> HealthReport:
    """Run global health check."""
    return await health_checker.check_health()


async def is_healthy() -> bool:
    """Check if application is healthy."""
    report = await health_checker.check_health()
    return report.status == HealthStatus.HEALTHY


async def is_ready() -> bool:
    """Check if application is ready."""
    return await health_checker.is_ready()
