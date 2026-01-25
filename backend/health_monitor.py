"""
Health Monitor - Sprint 647

System health monitoring and alerting.

Features:
- Service health checks
- Resource monitoring
- Alert thresholds
- Health history
- Dependency checks
"""

import time
import asyncio
import psutil
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Awaitable
from enum import Enum
from threading import Lock
from datetime import datetime


class HealthStatus(str, Enum):
    """Health status levels."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


class AlertLevel(str, Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class HealthCheck:
    """Individual health check result."""
    name: str
    status: HealthStatus
    message: str = ""
    latency_ms: float = 0
    timestamp: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "status": self.status.value,
            "message": self.message,
            "latency_ms": round(self.latency_ms, 2),
            "timestamp": self.timestamp,
            "metadata": self.metadata,
        }


@dataclass
class Alert:
    """Health alert."""
    id: str
    level: AlertLevel
    source: str
    message: str
    timestamp: float = field(default_factory=time.time)
    resolved: bool = False
    resolved_at: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "level": self.level.value,
            "source": self.source,
            "message": self.message,
            "timestamp": self.timestamp,
            "resolved": self.resolved,
            "resolved_at": self.resolved_at,
        }


@dataclass
class ResourceMetrics:
    """System resource metrics."""
    cpu_percent: float
    memory_percent: float
    memory_used_mb: float
    memory_available_mb: float
    disk_percent: float
    disk_used_gb: float
    disk_free_gb: float
    open_files: int
    threads: int
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "cpu_percent": round(self.cpu_percent, 1),
            "memory_percent": round(self.memory_percent, 1),
            "memory_used_mb": round(self.memory_used_mb, 1),
            "memory_available_mb": round(self.memory_available_mb, 1),
            "disk_percent": round(self.disk_percent, 1),
            "disk_used_gb": round(self.disk_used_gb, 2),
            "disk_free_gb": round(self.disk_free_gb, 2),
            "open_files": self.open_files,
            "threads": self.threads,
            "timestamp": self.timestamp,
        }


HealthCheckFunc = Callable[[], Awaitable[HealthCheck]]


class HealthMonitor:
    """System health monitoring and alerting.

    Usage:
        monitor = HealthMonitor()

        # Register custom check
        @monitor.register_check("database")
        async def check_database():
            # Check database connection
            return HealthCheck("database", HealthStatus.HEALTHY)

        # Get health status
        health = await monitor.check_all()

        # Get resource metrics
        metrics = monitor.get_resources()
    """

    def __init__(self):
        """Initialize health monitor."""
        self._checks: Dict[str, HealthCheckFunc] = {}
        self._history: Dict[str, List[HealthCheck]] = {}
        self._alerts: List[Alert] = []
        self._lock = Lock()
        self._alert_counter = 0

        # Thresholds
        self._thresholds = {
            "cpu_warning": 80.0,
            "cpu_critical": 95.0,
            "memory_warning": 80.0,
            "memory_critical": 95.0,
            "disk_warning": 85.0,
            "disk_critical": 95.0,
            "latency_warning_ms": 500.0,
            "latency_critical_ms": 2000.0,
        }

        # Register default checks
        self._register_default_checks()

    def _register_default_checks(self):
        """Register built-in health checks."""

        @self.register_check("system")
        async def check_system():
            try:
                cpu = psutil.cpu_percent(interval=0.1)
                mem = psutil.virtual_memory()

                status = HealthStatus.HEALTHY
                messages = []

                if cpu > self._thresholds["cpu_critical"]:
                    status = HealthStatus.UNHEALTHY
                    messages.append(f"CPU critical: {cpu}%")
                elif cpu > self._thresholds["cpu_warning"]:
                    status = HealthStatus.DEGRADED
                    messages.append(f"CPU high: {cpu}%")

                if mem.percent > self._thresholds["memory_critical"]:
                    status = HealthStatus.UNHEALTHY
                    messages.append(f"Memory critical: {mem.percent}%")
                elif mem.percent > self._thresholds["memory_warning"]:
                    if status != HealthStatus.UNHEALTHY:
                        status = HealthStatus.DEGRADED
                    messages.append(f"Memory high: {mem.percent}%")

                return HealthCheck(
                    name="system",
                    status=status,
                    message="; ".join(messages) if messages else "System resources OK",
                    metadata={"cpu": cpu, "memory": mem.percent},
                )
            except Exception as e:
                return HealthCheck(
                    name="system",
                    status=HealthStatus.UNKNOWN,
                    message=str(e),
                )

        @self.register_check("disk")
        async def check_disk():
            try:
                disk = psutil.disk_usage("/")
                percent = disk.percent

                if percent > self._thresholds["disk_critical"]:
                    status = HealthStatus.UNHEALTHY
                    message = f"Disk critical: {percent}%"
                elif percent > self._thresholds["disk_warning"]:
                    status = HealthStatus.DEGRADED
                    message = f"Disk warning: {percent}%"
                else:
                    status = HealthStatus.HEALTHY
                    message = f"Disk usage: {percent}%"

                return HealthCheck(
                    name="disk",
                    status=status,
                    message=message,
                    metadata={
                        "percent": percent,
                        "free_gb": disk.free / (1024**3),
                    },
                )
            except Exception as e:
                return HealthCheck(
                    name="disk",
                    status=HealthStatus.UNKNOWN,
                    message=str(e),
                )

    def register_check(self, name: str):
        """Decorator to register a health check.

        Args:
            name: Check name
        """
        def decorator(func: HealthCheckFunc) -> HealthCheckFunc:
            self._checks[name] = func
            self._history[name] = []
            return func
        return decorator

    def add_check(self, name: str, func: HealthCheckFunc):
        """Add a health check function.

        Args:
            name: Check name
            func: Async function returning HealthCheck
        """
        self._checks[name] = func
        self._history[name] = []

    def remove_check(self, name: str) -> bool:
        """Remove a health check.

        Args:
            name: Check name

        Returns:
            True if removed
        """
        if name in self._checks:
            del self._checks[name]
            return True
        return False

    async def run_check(self, name: str) -> Optional[HealthCheck]:
        """Run a specific health check.

        Args:
            name: Check name

        Returns:
            Health check result
        """
        func = self._checks.get(name)
        if not func:
            return None

        start = time.time()
        try:
            result = await func()
            result.latency_ms = (time.time() - start) * 1000

            # Check latency thresholds
            if result.latency_ms > self._thresholds["latency_critical_ms"]:
                if result.status == HealthStatus.HEALTHY:
                    result.status = HealthStatus.DEGRADED
                result.message += f" (slow: {result.latency_ms:.0f}ms)"
            elif result.latency_ms > self._thresholds["latency_warning_ms"]:
                result.message += f" (latency: {result.latency_ms:.0f}ms)"

            # Store in history
            with self._lock:
                self._history[name].append(result)
                if len(self._history[name]) > 100:
                    self._history[name] = self._history[name][-50:]

            # Generate alerts
            self._check_alerts(result)

            return result

        except Exception as e:
            return HealthCheck(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message=str(e),
                latency_ms=(time.time() - start) * 1000,
            )

    async def check_all(self) -> Dict[str, Any]:
        """Run all health checks.

        Returns:
            Combined health status
        """
        results = {}
        overall_status = HealthStatus.HEALTHY

        for name in self._checks:
            result = await self.run_check(name)
            if result:
                results[name] = result.to_dict()

                # Determine overall status
                if result.status == HealthStatus.UNHEALTHY:
                    overall_status = HealthStatus.UNHEALTHY
                elif result.status == HealthStatus.DEGRADED:
                    if overall_status != HealthStatus.UNHEALTHY:
                        overall_status = HealthStatus.DEGRADED
                elif result.status == HealthStatus.UNKNOWN:
                    if overall_status == HealthStatus.HEALTHY:
                        overall_status = HealthStatus.DEGRADED

        return {
            "status": overall_status.value,
            "timestamp": time.time(),
            "checks": results,
        }

    def _check_alerts(self, check: HealthCheck):
        """Generate alerts based on health check.

        Args:
            check: Health check result
        """
        if check.status == HealthStatus.UNHEALTHY:
            self._create_alert(
                AlertLevel.CRITICAL,
                check.name,
                f"{check.name} is unhealthy: {check.message}",
            )
        elif check.status == HealthStatus.DEGRADED:
            self._create_alert(
                AlertLevel.WARNING,
                check.name,
                f"{check.name} is degraded: {check.message}",
            )

    def _create_alert(self, level: AlertLevel, source: str, message: str):
        """Create a new alert.

        Args:
            level: Alert level
            source: Alert source
            message: Alert message
        """
        with self._lock:
            # Check for duplicate active alerts
            for alert in self._alerts:
                if not alert.resolved and alert.source == source:
                    return  # Don't create duplicate

            self._alert_counter += 1
            alert = Alert(
                id=f"alert_{self._alert_counter}",
                level=level,
                source=source,
                message=message,
            )
            self._alerts.append(alert)

            # Keep only recent alerts
            if len(self._alerts) > 500:
                self._alerts = self._alerts[-250:]

    def resolve_alert(self, alert_id: str) -> bool:
        """Resolve an alert.

        Args:
            alert_id: Alert ID

        Returns:
            True if resolved
        """
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id and not alert.resolved:
                    alert.resolved = True
                    alert.resolved_at = time.time()
                    return True
        return False

    def get_alerts(
        self,
        active_only: bool = False,
        level: Optional[AlertLevel] = None,
        limit: int = 50
    ) -> List[dict]:
        """Get alerts.

        Args:
            active_only: Only return unresolved alerts
            level: Filter by level
            limit: Max alerts to return

        Returns:
            List of alerts
        """
        with self._lock:
            alerts = self._alerts.copy()

        if active_only:
            alerts = [a for a in alerts if not a.resolved]
        if level:
            alerts = [a for a in alerts if a.level == level]

        # Sort by timestamp descending
        alerts.sort(key=lambda a: a.timestamp, reverse=True)

        return [a.to_dict() for a in alerts[:limit]]

    def get_resources(self) -> ResourceMetrics:
        """Get current resource metrics.

        Returns:
            Resource metrics
        """
        try:
            cpu = psutil.cpu_percent(interval=0.1)
            mem = psutil.virtual_memory()
            disk = psutil.disk_usage("/")
            proc = psutil.Process()

            return ResourceMetrics(
                cpu_percent=cpu,
                memory_percent=mem.percent,
                memory_used_mb=mem.used / (1024**2),
                memory_available_mb=mem.available / (1024**2),
                disk_percent=disk.percent,
                disk_used_gb=disk.used / (1024**3),
                disk_free_gb=disk.free / (1024**3),
                open_files=len(proc.open_files()),
                threads=proc.num_threads(),
            )
        except Exception:
            return ResourceMetrics(
                cpu_percent=0,
                memory_percent=0,
                memory_used_mb=0,
                memory_available_mb=0,
                disk_percent=0,
                disk_used_gb=0,
                disk_free_gb=0,
                open_files=0,
                threads=0,
            )

    def get_history(self, name: str, limit: int = 20) -> List[dict]:
        """Get check history.

        Args:
            name: Check name
            limit: Max results

        Returns:
            List of historical checks
        """
        with self._lock:
            history = self._history.get(name, [])
            return [h.to_dict() for h in history[-limit:]]

    def set_threshold(self, name: str, value: float):
        """Set a threshold value.

        Args:
            name: Threshold name
            value: Threshold value
        """
        self._thresholds[name] = value

    def get_thresholds(self) -> Dict[str, float]:
        """Get all thresholds."""
        return self._thresholds.copy()

    def get_summary(self) -> Dict[str, Any]:
        """Get health summary.

        Returns:
            Summary with stats
        """
        with self._lock:
            active_alerts = len([a for a in self._alerts if not a.resolved])
            critical_alerts = len([
                a for a in self._alerts
                if not a.resolved and a.level == AlertLevel.CRITICAL
            ])

        resources = self.get_resources()

        return {
            "active_alerts": active_alerts,
            "critical_alerts": critical_alerts,
            "registered_checks": list(self._checks.keys()),
            "resources": resources.to_dict(),
            "thresholds": self._thresholds,
        }


# Singleton instance
health_monitor = HealthMonitor()
