"""
Health Checker - Sprint 623

Comprehensive health monitoring system.

Features:
- Component health checks
- Dependency checks
- Periodic monitoring
- Alerts/thresholds
- Health history
"""

import time
import asyncio
import psutil
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Awaitable
from enum import Enum
from threading import Lock


class HealthStatus(str, Enum):
    """Health status levels."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthCheck:
    """A health check configuration."""
    name: str
    check_fn: Callable[[], Awaitable[Dict[str, Any]]]
    interval_seconds: int = 30
    timeout_seconds: int = 10
    critical: bool = True
    enabled: bool = True


@dataclass
class HealthResult:
    """Result of a health check."""
    name: str
    status: HealthStatus
    message: str = ""
    latency_ms: float = 0.0
    details: Dict[str, Any] = field(default_factory=dict)
    checked_at: float = field(default_factory=time.time)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "status": self.status.value,
            "message": self.message,
            "latency_ms": round(self.latency_ms, 2),
            "details": self.details,
            "checked_at": self.checked_at,
            "error": self.error,
        }


class HealthChecker:
    """Health monitoring system.

    Usage:
        checker = HealthChecker()

        # Register a check
        @checker.register("database", critical=True)
        async def check_database():
            # Return dict with status info
            return {"connected": True, "pool_size": 10}

        # Run all checks
        results = await checker.check_all()

        # Get overall status
        status = checker.get_status()
    """

    def __init__(self):
        """Initialize health checker."""
        self._checks: Dict[str, HealthCheck] = {}
        self._results: Dict[str, HealthResult] = {}
        self._history: List[Dict[str, Any]] = []
        self._lock = Lock()
        self._max_history = 100
        self._monitor_task: Optional[asyncio.Task] = None

    def register(
        self,
        name: str,
        interval_seconds: int = 30,
        timeout_seconds: int = 10,
        critical: bool = True,
        enabled: bool = True
    ):
        """Register a health check.

        Args:
            name: Check name
            interval_seconds: Check interval
            timeout_seconds: Check timeout
            critical: If True, failure affects overall status
            enabled: If False, check is skipped

        Returns:
            Decorator function
        """
        def decorator(func: Callable[[], Awaitable[Dict[str, Any]]]):
            check = HealthCheck(
                name=name,
                check_fn=func,
                interval_seconds=interval_seconds,
                timeout_seconds=timeout_seconds,
                critical=critical,
                enabled=enabled,
            )
            self._checks[name] = check
            return func
        return decorator

    def add_check(
        self,
        name: str,
        check_fn: Callable[[], Awaitable[Dict[str, Any]]],
        **kwargs
    ):
        """Add a health check.

        Args:
            name: Check name
            check_fn: Check function
            **kwargs: Additional options
        """
        check = HealthCheck(
            name=name,
            check_fn=check_fn,
            **kwargs
        )
        self._checks[name] = check

    async def run_check(self, name: str) -> HealthResult:
        """Run a single health check.

        Args:
            name: Check name

        Returns:
            Health result
        """
        check = self._checks.get(name)
        if not check:
            return HealthResult(
                name=name,
                status=HealthStatus.UNKNOWN,
                error="Check not found"
            )

        if not check.enabled:
            return HealthResult(
                name=name,
                status=HealthStatus.UNKNOWN,
                message="Check disabled"
            )

        start_time = time.time()

        try:
            # Run check with timeout
            result_data = await asyncio.wait_for(
                check.check_fn(),
                timeout=check.timeout_seconds
            )

            latency_ms = (time.time() - start_time) * 1000

            # Determine status from result
            status = HealthStatus.HEALTHY
            if result_data.get("status") == "degraded":
                status = HealthStatus.DEGRADED
            elif result_data.get("status") == "unhealthy":
                status = HealthStatus.UNHEALTHY

            result = HealthResult(
                name=name,
                status=status,
                message=result_data.get("message", "OK"),
                latency_ms=latency_ms,
                details=result_data,
            )

        except asyncio.TimeoutError:
            result = HealthResult(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message="Check timed out",
                latency_ms=check.timeout_seconds * 1000,
                error="Timeout",
            )

        except Exception as e:
            latency_ms = (time.time() - start_time) * 1000
            result = HealthResult(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message=str(e),
                latency_ms=latency_ms,
                error=type(e).__name__,
            )

        with self._lock:
            self._results[name] = result

        return result

    async def check_all(self) -> Dict[str, Dict[str, Any]]:
        """Run all health checks.

        Returns:
            Dict of check results
        """
        tasks = [
            self.run_check(name)
            for name in self._checks
        ]

        results = await asyncio.gather(*tasks)

        # Store in history
        snapshot = {
            "timestamp": time.time(),
            "results": {r.name: r.to_dict() for r in results},
            "overall": self._calculate_overall_status([r.status for r in results]).value,
        }

        with self._lock:
            self._history.append(snapshot)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]

        return {r.name: r.to_dict() for r in results}

    def _calculate_overall_status(self, statuses: List[HealthStatus]) -> HealthStatus:
        """Calculate overall health status.

        Args:
            statuses: List of individual statuses

        Returns:
            Overall status
        """
        if not statuses:
            return HealthStatus.UNKNOWN

        # Check critical checks only
        critical_statuses = []
        for name, check in self._checks.items():
            if check.critical and name in self._results:
                critical_statuses.append(self._results[name].status)

        if not critical_statuses:
            critical_statuses = statuses

        if HealthStatus.UNHEALTHY in critical_statuses:
            return HealthStatus.UNHEALTHY
        if HealthStatus.DEGRADED in critical_statuses:
            return HealthStatus.DEGRADED
        if all(s == HealthStatus.HEALTHY for s in critical_statuses):
            return HealthStatus.HEALTHY

        return HealthStatus.UNKNOWN

    def get_status(self) -> Dict[str, Any]:
        """Get current health status.

        Returns:
            Status summary
        """
        with self._lock:
            results = dict(self._results)

        statuses = [r.status for r in results.values()]
        overall = self._calculate_overall_status(statuses)

        return {
            "status": overall.value,
            "checks": {name: r.to_dict() for name, r in results.items()},
            "timestamp": time.time(),
        }

    def get_history(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get health history.

        Args:
            limit: Maximum entries

        Returns:
            List of historical snapshots
        """
        with self._lock:
            return self._history[-limit:][::-1]

    def enable_check(self, name: str) -> bool:
        """Enable a check.

        Args:
            name: Check name

        Returns:
            True if enabled
        """
        if name in self._checks:
            self._checks[name].enabled = True
            return True
        return False

    def disable_check(self, name: str) -> bool:
        """Disable a check.

        Args:
            name: Check name

        Returns:
            True if disabled
        """
        if name in self._checks:
            self._checks[name].enabled = False
            return True
        return False

    def list_checks(self) -> List[Dict[str, Any]]:
        """List all registered checks.

        Returns:
            List of check configurations
        """
        return [
            {
                "name": check.name,
                "interval_seconds": check.interval_seconds,
                "timeout_seconds": check.timeout_seconds,
                "critical": check.critical,
                "enabled": check.enabled,
            }
            for check in self._checks.values()
        ]

    async def start_monitoring(self):
        """Start periodic health monitoring."""
        if self._monitor_task is not None:
            return

        self._monitor_task = asyncio.create_task(self._monitor_loop())

    async def stop_monitoring(self):
        """Stop periodic health monitoring."""
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
            self._monitor_task = None

    async def _monitor_loop(self):
        """Background monitoring loop."""
        while True:
            try:
                await self.check_all()
                await asyncio.sleep(30)  # Default interval
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Health monitor error: {e}")
                await asyncio.sleep(30)


# Singleton instance
health_checker = HealthChecker()


# Built-in checks
@health_checker.register("system", interval_seconds=60, critical=False)
async def check_system():
    """Check system resources."""
    cpu_percent = psutil.cpu_percent(interval=0.1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")

    status = "healthy"
    if cpu_percent > 90 or memory.percent > 90 or disk.percent > 90:
        status = "degraded"
    if cpu_percent > 95 or memory.percent > 95 or disk.percent > 95:
        status = "unhealthy"

    return {
        "status": status,
        "cpu_percent": cpu_percent,
        "memory_percent": memory.percent,
        "memory_available_gb": round(memory.available / (1024**3), 2),
        "disk_percent": disk.percent,
        "disk_free_gb": round(disk.free / (1024**3), 2),
    }


@health_checker.register("process", interval_seconds=30, critical=True)
async def check_process():
    """Check current process health."""
    process = psutil.Process()
    memory_info = process.memory_info()

    return {
        "status": "healthy",
        "pid": process.pid,
        "memory_rss_mb": round(memory_info.rss / (1024**2), 2),
        "memory_vms_mb": round(memory_info.vms / (1024**2), 2),
        "num_threads": process.num_threads(),
        "cpu_percent": process.cpu_percent(),
    }


@health_checker.register("uptime", interval_seconds=60, critical=False)
async def check_uptime():
    """Check system uptime."""
    boot_time = psutil.boot_time()
    uptime_seconds = time.time() - boot_time

    return {
        "status": "healthy",
        "boot_time": boot_time,
        "uptime_seconds": int(uptime_seconds),
        "uptime_hours": round(uptime_seconds / 3600, 2),
        "uptime_days": round(uptime_seconds / 86400, 2),
    }
