"""
Performance Monitor - Sprint 607

Track and analyze application performance.

Features:
- Request timing
- Endpoint metrics
- Resource usage
- Percentile calculations
- Slow request detection
"""

import time
import os
import psutil
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Callable
from collections import defaultdict
from threading import Lock
from contextlib import contextmanager


@dataclass
class RequestMetric:
    """Metrics for a single request."""
    endpoint: str
    method: str
    duration_ms: float
    status_code: int
    timestamp: float = field(default_factory=time.time)
    trace_id: Optional[str] = None
    user_id: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "endpoint": self.endpoint,
            "method": self.method,
            "duration_ms": round(self.duration_ms, 2),
            "status_code": self.status_code,
            "timestamp": self.timestamp,
            "trace_id": self.trace_id,
            "user_id": self.user_id,
        }


@dataclass
class EndpointStats:
    """Aggregated stats for an endpoint."""
    count: int = 0
    total_ms: float = 0
    min_ms: float = float("inf")
    max_ms: float = 0
    error_count: int = 0
    durations: List[float] = field(default_factory=list)

    def add(self, duration_ms: float, is_error: bool = False):
        """Add a request to stats."""
        self.count += 1
        self.total_ms += duration_ms
        self.min_ms = min(self.min_ms, duration_ms)
        self.max_ms = max(self.max_ms, duration_ms)
        if is_error:
            self.error_count += 1

        # Keep recent durations for percentiles
        self.durations.append(duration_ms)
        if len(self.durations) > 1000:
            self.durations = self.durations[-1000:]

    def get_stats(self) -> Dict[str, Any]:
        """Get computed statistics."""
        if self.count == 0:
            return {"count": 0}

        # Calculate percentiles
        sorted_durations = sorted(self.durations)
        n = len(sorted_durations)

        p50 = sorted_durations[int(n * 0.5)] if n > 0 else 0
        p90 = sorted_durations[int(n * 0.9)] if n > 1 else p50
        p95 = sorted_durations[int(n * 0.95)] if n > 5 else p90
        p99 = sorted_durations[int(n * 0.99)] if n > 20 else p95

        return {
            "count": self.count,
            "avg_ms": round(self.total_ms / self.count, 2),
            "min_ms": round(self.min_ms, 2),
            "max_ms": round(self.max_ms, 2),
            "p50_ms": round(p50, 2),
            "p90_ms": round(p90, 2),
            "p95_ms": round(p95, 2),
            "p99_ms": round(p99, 2),
            "error_count": self.error_count,
            "error_rate": round(self.error_count / self.count * 100, 2),
        }


class PerformanceMonitor:
    """Monitor application performance.

    Usage:
        monitor = PerformanceMonitor()

        # Record request
        monitor.record_request(
            endpoint="/chat",
            method="POST",
            duration_ms=150,
            status_code=200
        )

        # Use timer context
        with monitor.timer("/chat", "POST") as t:
            response = process_request()
            t.status_code = 200

        # Get stats
        stats = monitor.get_endpoint_stats()
    """

    def __init__(
        self,
        slow_threshold_ms: float = 500,
        max_slow_requests: int = 100,
        max_metrics: int = 10000
    ):
        """Initialize performance monitor.

        Args:
            slow_threshold_ms: Threshold for slow request detection
            max_slow_requests: Max slow requests to store
            max_metrics: Max request metrics to store
        """
        self._slow_threshold_ms = slow_threshold_ms
        self._max_slow_requests = max_slow_requests
        self._max_metrics = max_metrics

        self._metrics: List[RequestMetric] = []
        self._endpoint_stats: Dict[str, EndpointStats] = defaultdict(EndpointStats)
        self._slow_requests: List[RequestMetric] = []
        self._lock = Lock()

        # Global counters
        self._total_requests = 0
        self._total_errors = 0
        self._start_time = time.time()

    def record_request(
        self,
        endpoint: str,
        method: str,
        duration_ms: float,
        status_code: int,
        trace_id: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> RequestMetric:
        """Record a request metric.

        Args:
            endpoint: Request endpoint
            method: HTTP method
            duration_ms: Request duration
            status_code: Response status code
            trace_id: Optional trace ID
            user_id: Optional user ID

        Returns:
            Created metric
        """
        metric = RequestMetric(
            endpoint=endpoint,
            method=method,
            duration_ms=duration_ms,
            status_code=status_code,
            trace_id=trace_id,
            user_id=user_id
        )

        is_error = status_code >= 400

        with self._lock:
            # Store metric
            self._metrics.append(metric)
            if len(self._metrics) > self._max_metrics:
                self._metrics = self._metrics[-self._max_metrics:]

            # Update endpoint stats
            key = f"{method} {endpoint}"
            self._endpoint_stats[key].add(duration_ms, is_error)

            # Global counters
            self._total_requests += 1
            if is_error:
                self._total_errors += 1

            # Check slow request
            if duration_ms >= self._slow_threshold_ms:
                self._slow_requests.append(metric)
                if len(self._slow_requests) > self._max_slow_requests:
                    self._slow_requests = self._slow_requests[-self._max_slow_requests:]

        return metric

    @contextmanager
    def timer(
        self,
        endpoint: str,
        method: str = "GET",
        trace_id: Optional[str] = None,
        user_id: Optional[str] = None
    ):
        """Context manager for timing requests.

        Usage:
            with monitor.timer("/chat", "POST") as t:
                response = process()
                t.status_code = response.status_code
        """
        class TimerContext:
            def __init__(self):
                self.status_code = 200
                self.start = time.time()

        ctx = TimerContext()
        try:
            yield ctx
        finally:
            duration_ms = (time.time() - ctx.start) * 1000
            self.record_request(
                endpoint=endpoint,
                method=method,
                duration_ms=duration_ms,
                status_code=ctx.status_code,
                trace_id=trace_id,
                user_id=user_id
            )

    def get_endpoint_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get stats for all endpoints."""
        with self._lock:
            return {
                key: stats.get_stats()
                for key, stats in self._endpoint_stats.items()
            }

    def get_slow_requests(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get slow requests."""
        with self._lock:
            return [m.to_dict() for m in self._slow_requests[-limit:]]

    def get_recent_requests(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent requests."""
        with self._lock:
            return [m.to_dict() for m in self._metrics[-limit:]]

    def get_system_metrics(self) -> Dict[str, Any]:
        """Get system resource metrics."""
        try:
            process = psutil.Process()
            memory = process.memory_info()
            cpu_percent = process.cpu_percent(interval=0.1)

            return {
                "memory_mb": round(memory.rss / 1024 / 1024, 2),
                "memory_percent": round(process.memory_percent(), 2),
                "cpu_percent": round(cpu_percent, 2),
                "threads": process.num_threads(),
                "open_files": len(process.open_files()),
                "connections": len(process.connections()),
            }
        except Exception:
            return {"error": "Unable to get system metrics"}

    def get_summary(self) -> Dict[str, Any]:
        """Get performance summary."""
        uptime = time.time() - self._start_time

        with self._lock:
            # Calculate overall stats
            if self._metrics:
                durations = [m.duration_ms for m in self._metrics]
                avg_duration = sum(durations) / len(durations)
            else:
                avg_duration = 0

            return {
                "uptime_seconds": round(uptime, 1),
                "total_requests": self._total_requests,
                "total_errors": self._total_errors,
                "error_rate": round(
                    self._total_errors / self._total_requests * 100
                    if self._total_requests > 0 else 0, 2
                ),
                "requests_per_second": round(
                    self._total_requests / uptime if uptime > 0 else 0, 2
                ),
                "avg_duration_ms": round(avg_duration, 2),
                "slow_request_count": len(self._slow_requests),
                "slow_threshold_ms": self._slow_threshold_ms,
                "endpoint_count": len(self._endpoint_stats),
            }

    def get_health_status(self) -> Dict[str, Any]:
        """Get health status based on metrics."""
        summary = self.get_summary()
        system = self.get_system_metrics()

        status = "healthy"
        issues = []

        # Check error rate
        if summary["error_rate"] > 5:
            status = "degraded"
            issues.append(f"High error rate: {summary['error_rate']}%")
        elif summary["error_rate"] > 10:
            status = "unhealthy"
            issues.append(f"Very high error rate: {summary['error_rate']}%")

        # Check slow requests
        if summary["slow_request_count"] > 10:
            if status == "healthy":
                status = "degraded"
            issues.append(f"Many slow requests: {summary['slow_request_count']}")

        # Check memory
        if "memory_percent" in system and system["memory_percent"] > 80:
            if status == "healthy":
                status = "degraded"
            issues.append(f"High memory usage: {system['memory_percent']}%")

        return {
            "status": status,
            "issues": issues,
            "summary": summary,
            "system": system,
        }

    def reset(self):
        """Reset all metrics."""
        with self._lock:
            self._metrics.clear()
            self._endpoint_stats.clear()
            self._slow_requests.clear()
            self._total_requests = 0
            self._total_errors = 0
            self._start_time = time.time()


# Singleton instance
perf_monitor = PerformanceMonitor(
    slow_threshold_ms=500,
    max_slow_requests=100,
    max_metrics=10000
)
