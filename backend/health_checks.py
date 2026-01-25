"""
Health Check System - Sprint 589

Comprehensive health monitoring for all system components.

Features:
- Component health checks (database, memory, TTS, LLM)
- Dependency status
- Resource utilization
- Latency metrics
- Readiness/liveness probes
"""

import time
import asyncio
import os
import psutil
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, List, Callable, Awaitable
from enum import Enum
from threading import Lock


class HealthStatus(str, Enum):
    """Health status levels."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class ComponentHealth:
    """Health status of a single component."""
    name: str
    status: HealthStatus = HealthStatus.UNKNOWN
    message: str = ""
    latency_ms: Optional[float] = None
    last_check: float = 0
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SystemHealth:
    """Overall system health."""
    status: HealthStatus = HealthStatus.UNKNOWN
    components: Dict[str, ComponentHealth] = field(default_factory=dict)
    timestamp: float = 0
    uptime_seconds: float = 0
    version: str = "2.0.0"


class HealthCheckRegistry:
    """Registry for health check functions."""

    def __init__(self):
        self._checks: Dict[str, Callable[[], Awaitable[ComponentHealth]]] = {}
        self._lock = Lock()

    def register(
        self,
        name: str,
        check_fn: Callable[[], Awaitable[ComponentHealth]]
    ):
        """Register a health check function."""
        with self._lock:
            self._checks[name] = check_fn

    def unregister(self, name: str):
        """Unregister a health check."""
        with self._lock:
            self._checks.pop(name, None)

    def get_all(self) -> Dict[str, Callable[[], Awaitable[ComponentHealth]]]:
        """Get all registered checks."""
        with self._lock:
            return dict(self._checks)


# Global registry
health_registry = HealthCheckRegistry()


class HealthChecker:
    """Main health check coordinator.

    Usage:
        checker = HealthChecker()

        # Run all checks
        health = await checker.check_all()

        # Check specific component
        component = await checker.check_component("database")

        # Get liveness (quick check)
        alive = await checker.liveness()

        # Get readiness (full check)
        ready = await checker.readiness()
    """

    def __init__(self):
        self._start_time = time.time()
        self._last_full_check: Optional[SystemHealth] = None
        self._cache_ttl = 5.0  # Cache health for 5 seconds
        self._lock = Lock()

    async def check_component(self, name: str) -> Optional[ComponentHealth]:
        """Check health of a specific component.

        Args:
            name: Component name

        Returns:
            Component health or None if not found
        """
        checks = health_registry.get_all()
        check_fn = checks.get(name)
        if not check_fn:
            return None

        start = time.time()
        try:
            health = await check_fn()
            health.latency_ms = (time.time() - start) * 1000
            health.last_check = time.time()
            return health
        except Exception as e:
            return ComponentHealth(
                name=name,
                status=HealthStatus.UNHEALTHY,
                message=str(e),
                latency_ms=(time.time() - start) * 1000,
                last_check=time.time()
            )

    async def check_all(self, use_cache: bool = True) -> SystemHealth:
        """Check health of all components.

        Args:
            use_cache: Use cached result if available

        Returns:
            System health status
        """
        now = time.time()

        # Check cache
        if use_cache and self._last_full_check:
            if now - self._last_full_check.timestamp < self._cache_ttl:
                return self._last_full_check

        checks = health_registry.get_all()
        components: Dict[str, ComponentHealth] = {}

        # Run all checks concurrently
        async def run_check(name: str, fn: Callable) -> tuple:
            try:
                start = time.time()
                health = await fn()
                health.latency_ms = (time.time() - start) * 1000
                health.last_check = now
                return name, health
            except Exception as e:
                return name, ComponentHealth(
                    name=name,
                    status=HealthStatus.UNHEALTHY,
                    message=str(e),
                    last_check=now
                )

        results = await asyncio.gather(*[
            run_check(name, fn) for name, fn in checks.items()
        ])

        for name, health in results:
            components[name] = health

        # Determine overall status
        statuses = [c.status for c in components.values()]
        if all(s == HealthStatus.HEALTHY for s in statuses):
            overall = HealthStatus.HEALTHY
        elif any(s == HealthStatus.UNHEALTHY for s in statuses):
            overall = HealthStatus.UNHEALTHY
        elif any(s == HealthStatus.DEGRADED for s in statuses):
            overall = HealthStatus.DEGRADED
        else:
            overall = HealthStatus.UNKNOWN

        health = SystemHealth(
            status=overall,
            components=components,
            timestamp=now,
            uptime_seconds=now - self._start_time,
        )

        with self._lock:
            self._last_full_check = health

        return health

    async def liveness(self) -> Dict[str, Any]:
        """Quick liveness check (is the service running?).

        Returns:
            Simple alive/dead status
        """
        return {
            "status": "alive",
            "timestamp": time.time(),
            "uptime_seconds": round(time.time() - self._start_time, 1),
        }

    async def readiness(self) -> Dict[str, Any]:
        """Full readiness check (is the service ready to accept requests?).

        Returns:
            Detailed health status
        """
        health = await self.check_all()
        return {
            "status": health.status.value,
            "ready": health.status in (HealthStatus.HEALTHY, HealthStatus.DEGRADED),
            "timestamp": health.timestamp,
            "uptime_seconds": round(health.uptime_seconds, 1),
            "version": health.version,
            "components": {
                name: {
                    "status": c.status.value,
                    "message": c.message,
                    "latency_ms": round(c.latency_ms, 1) if c.latency_ms else None,
                }
                for name, c in health.components.items()
            }
        }


# Singleton instance
health_checker = HealthChecker()


# ═══════════════════════════════════════════════════════════════
# Built-in Health Checks
# ═══════════════════════════════════════════════════════════════

async def check_system_resources() -> ComponentHealth:
    """Check system CPU, memory, disk."""
    try:
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage("/")

        # Determine status based on thresholds
        if cpu_percent > 90 or memory.percent > 90 or disk.percent > 90:
            status = HealthStatus.UNHEALTHY
            message = "Critical resource usage"
        elif cpu_percent > 70 or memory.percent > 70 or disk.percent > 80:
            status = HealthStatus.DEGRADED
            message = "High resource usage"
        else:
            status = HealthStatus.HEALTHY
            message = "Resources OK"

        return ComponentHealth(
            name="system",
            status=status,
            message=message,
            details={
                "cpu_percent": round(cpu_percent, 1),
                "memory_percent": round(memory.percent, 1),
                "memory_available_mb": round(memory.available / 1024 / 1024, 0),
                "disk_percent": round(disk.percent, 1),
                "disk_free_gb": round(disk.free / 1024 / 1024 / 1024, 1),
            }
        )
    except Exception as e:
        return ComponentHealth(
            name="system",
            status=HealthStatus.UNKNOWN,
            message=str(e)
        )


async def check_memory_system() -> ComponentHealth:
    """Check EVA memory system."""
    try:
        from eva_memory import get_memory_system, get_memory_metrics

        memory = get_memory_system()
        if memory is None:
            return ComponentHealth(
                name="memory",
                status=HealthStatus.UNHEALTHY,
                message="Memory system not initialized"
            )

        metrics = get_memory_metrics()
        return ComponentHealth(
            name="memory",
            status=HealthStatus.HEALTHY,
            message="Memory system OK",
            details={
                "total_ops": metrics.get("total_ops", 0),
                "profiles_loaded": len(memory.user_profiles),
                "sessions_active": len(memory.session_memories),
            }
        )
    except ImportError:
        return ComponentHealth(
            name="memory",
            status=HealthStatus.UNKNOWN,
            message="Memory module not available"
        )
    except Exception as e:
        return ComponentHealth(
            name="memory",
            status=HealthStatus.UNHEALTHY,
            message=str(e)
        )


async def check_rate_limiter() -> ComponentHealth:
    """Check rate limiter status."""
    try:
        from rate_limiter import rate_limiter

        stats = rate_limiter.get_stats()
        denial_rate = stats.get("denial_rate", 0)

        if denial_rate > 50:
            status = HealthStatus.DEGRADED
            message = f"High denial rate: {denial_rate}%"
        else:
            status = HealthStatus.HEALTHY
            message = "Rate limiter OK"

        return ComponentHealth(
            name="rate_limiter",
            status=status,
            message=message,
            details=stats
        )
    except ImportError:
        return ComponentHealth(
            name="rate_limiter",
            status=HealthStatus.UNKNOWN,
            message="Rate limiter module not available"
        )
    except Exception as e:
        return ComponentHealth(
            name="rate_limiter",
            status=HealthStatus.UNHEALTHY,
            message=str(e)
        )


async def check_websocket_manager() -> ComponentHealth:
    """Check WebSocket connection manager."""
    try:
        from websocket_manager import ws_manager

        stats = ws_manager.get_stats()
        return ComponentHealth(
            name="websocket",
            status=HealthStatus.HEALTHY,
            message=f"{stats['active_connections']} active connections",
            details=stats
        )
    except ImportError:
        return ComponentHealth(
            name="websocket",
            status=HealthStatus.UNKNOWN,
            message="WebSocket manager not available"
        )
    except Exception as e:
        return ComponentHealth(
            name="websocket",
            status=HealthStatus.UNHEALTHY,
            message=str(e)
        )


async def check_env_config() -> ComponentHealth:
    """Check required environment variables."""
    required_vars = [
        "GROQ_API_KEY",
    ]
    optional_vars = [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
    ]

    missing = [v for v in required_vars if not os.getenv(v)]
    present_optional = [v for v in optional_vars if os.getenv(v)]

    if missing:
        return ComponentHealth(
            name="config",
            status=HealthStatus.UNHEALTHY,
            message=f"Missing required: {', '.join(missing)}",
            details={
                "missing_required": missing,
                "optional_present": present_optional,
            }
        )

    return ComponentHealth(
        name="config",
        status=HealthStatus.HEALTHY,
        message="Configuration OK",
        details={
            "required_present": required_vars,
            "optional_present": present_optional,
        }
    )


# Register built-in checks
health_registry.register("system", check_system_resources)
health_registry.register("memory", check_memory_system)
health_registry.register("rate_limiter", check_rate_limiter)
health_registry.register("websocket", check_websocket_manager)
health_registry.register("config", check_env_config)
