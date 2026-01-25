"""
Metrics Collector - Sprint 667

Application metrics collection.

Features:
- Counter metrics
- Gauge metrics
- Histogram metrics
- Timer metrics
- Labels support
"""

import time
import math
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Callable
from enum import Enum
from collections import defaultdict
import threading


class MetricType(str, Enum):
    """Metric types."""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


@dataclass
class MetricValue:
    """Metric with labels."""
    name: str
    type: MetricType
    value: float
    labels: Dict[str, str] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)


@dataclass
class HistogramBucket:
    """Histogram bucket."""
    le: float
    count: int = 0


class Counter:
    """Counter metric (only increases)."""

    def __init__(self, name: str, description: str = ""):
        self.name = name
        self.description = description
        self._values: Dict[str, float] = defaultdict(float)
        self._lock = threading.Lock()

    def inc(self, value: float = 1, labels: Optional[Dict[str, str]] = None):
        """Increment counter."""
        if value < 0:
            raise ValueError("Counter can only increase")
        key = self._labels_key(labels)
        with self._lock:
            self._values[key] += value

    def get(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Get counter value."""
        key = self._labels_key(labels)
        return self._values.get(key, 0)

    def _labels_key(self, labels: Optional[Dict[str, str]]) -> str:
        if not labels:
            return ""
        return ",".join(f"{k}={v}" for k, v in sorted(labels.items()))

    def collect(self) -> List[MetricValue]:
        """Collect all values."""
        result = []
        with self._lock:
            for key, value in self._values.items():
                labels = dict(kv.split("=") for kv in key.split(",") if kv)
                result.append(MetricValue(
                    name=self.name,
                    type=MetricType.COUNTER,
                    value=value,
                    labels=labels,
                ))
        return result


class Gauge:
    """Gauge metric (can increase or decrease)."""

    def __init__(self, name: str, description: str = ""):
        self.name = name
        self.description = description
        self._values: Dict[str, float] = defaultdict(float)
        self._lock = threading.Lock()

    def set(self, value: float, labels: Optional[Dict[str, str]] = None):
        """Set gauge value."""
        key = self._labels_key(labels)
        with self._lock:
            self._values[key] = value

    def inc(self, value: float = 1, labels: Optional[Dict[str, str]] = None):
        """Increment gauge."""
        key = self._labels_key(labels)
        with self._lock:
            self._values[key] += value

    def dec(self, value: float = 1, labels: Optional[Dict[str, str]] = None):
        """Decrement gauge."""
        key = self._labels_key(labels)
        with self._lock:
            self._values[key] -= value

    def get(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Get gauge value."""
        key = self._labels_key(labels)
        return self._values.get(key, 0)

    def _labels_key(self, labels: Optional[Dict[str, str]]) -> str:
        if not labels:
            return ""
        return ",".join(f"{k}={v}" for k, v in sorted(labels.items()))

    def collect(self) -> List[MetricValue]:
        """Collect all values."""
        result = []
        with self._lock:
            for key, value in self._values.items():
                labels = dict(kv.split("=") for kv in key.split(",") if kv)
                result.append(MetricValue(
                    name=self.name,
                    type=MetricType.GAUGE,
                    value=value,
                    labels=labels,
                ))
        return result


class Histogram:
    """Histogram metric with buckets."""

    DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

    def __init__(
        self,
        name: str,
        description: str = "",
        buckets: Optional[List[float]] = None,
    ):
        self.name = name
        self.description = description
        self.buckets = sorted(buckets or self.DEFAULT_BUCKETS)
        self._observations: Dict[str, List[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def observe(self, value: float, labels: Optional[Dict[str, str]] = None):
        """Record observation."""
        key = self._labels_key(labels)
        with self._lock:
            self._observations[key].append(value)

    def get_stats(self, labels: Optional[Dict[str, str]] = None) -> dict:
        """Get histogram statistics."""
        key = self._labels_key(labels)
        observations = self._observations.get(key, [])

        if not observations:
            return {"count": 0, "sum": 0, "buckets": {}}

        bucket_counts = {b: 0 for b in self.buckets}
        bucket_counts[float("inf")] = 0

        for obs in observations:
            for bucket in self.buckets + [float("inf")]:
                if obs <= bucket:
                    bucket_counts[bucket] += 1

        return {
            "count": len(observations),
            "sum": sum(observations),
            "mean": sum(observations) / len(observations),
            "min": min(observations),
            "max": max(observations),
            "buckets": bucket_counts,
        }

    def _labels_key(self, labels: Optional[Dict[str, str]]) -> str:
        if not labels:
            return ""
        return ",".join(f"{k}={v}" for k, v in sorted(labels.items()))

    def collect(self) -> List[MetricValue]:
        """Collect all values."""
        result = []
        with self._lock:
            for key, observations in self._observations.items():
                labels = dict(kv.split("=") for kv in key.split(",") if kv)
                if observations:
                    result.append(MetricValue(
                        name=self.name + "_count",
                        type=MetricType.HISTOGRAM,
                        value=len(observations),
                        labels=labels,
                    ))
                    result.append(MetricValue(
                        name=self.name + "_sum",
                        type=MetricType.HISTOGRAM,
                        value=sum(observations),
                        labels=labels,
                    ))
        return result


class Timer:
    """Timer context manager for measuring duration."""

    def __init__(
        self,
        histogram: Histogram,
        labels: Optional[Dict[str, str]] = None,
    ):
        self.histogram = histogram
        self.labels = labels
        self.start_time = 0.0
        self.duration = 0.0

    def __enter__(self):
        self.start_time = time.time()
        return self

    def __exit__(self, *args):
        self.duration = time.time() - self.start_time
        self.histogram.observe(self.duration, self.labels)


class MetricsCollector:
    """Metrics collection registry.

    Usage:
        metrics = MetricsCollector()

        # Create metrics
        requests = metrics.counter("http_requests_total", "Total HTTP requests")
        active_users = metrics.gauge("active_users", "Current active users")
        latency = metrics.histogram("request_latency_seconds", "Request latency")

        # Record
        requests.inc(labels={"method": "GET", "path": "/api"})
        active_users.set(42)

        with latency.timer({"endpoint": "/chat"}):
            await process_request()

        # Export
        all_metrics = metrics.collect()
    """

    def __init__(self):
        """Initialize metrics collector."""
        self._counters: Dict[str, Counter] = {}
        self._gauges: Dict[str, Gauge] = {}
        self._histograms: Dict[str, Histogram] = {}
        self._lock = threading.Lock()

    def counter(self, name: str, description: str = "") -> Counter:
        """Get or create counter."""
        with self._lock:
            if name not in self._counters:
                self._counters[name] = Counter(name, description)
            return self._counters[name]

    def gauge(self, name: str, description: str = "") -> Gauge:
        """Get or create gauge."""
        with self._lock:
            if name not in self._gauges:
                self._gauges[name] = Gauge(name, description)
            return self._gauges[name]

    def histogram(
        self,
        name: str,
        description: str = "",
        buckets: Optional[List[float]] = None,
    ) -> Histogram:
        """Get or create histogram."""
        with self._lock:
            if name not in self._histograms:
                self._histograms[name] = Histogram(name, description, buckets)
            return self._histograms[name]

    def timer(
        self,
        name: str,
        labels: Optional[Dict[str, str]] = None,
    ) -> Timer:
        """Create timer for histogram."""
        histogram = self.histogram(name + "_duration_seconds")
        return Timer(histogram, labels)

    def collect(self) -> List[MetricValue]:
        """Collect all metrics."""
        result = []
        with self._lock:
            for counter in self._counters.values():
                result.extend(counter.collect())
            for gauge in self._gauges.values():
                result.extend(gauge.collect())
            for histogram in self._histograms.values():
                result.extend(histogram.collect())
        return result

    def to_prometheus(self) -> str:
        """Export in Prometheus format."""
        lines = []
        metrics = self.collect()

        for metric in metrics:
            labels_str = ""
            if metric.labels:
                labels_str = "{" + ",".join(f'{k}="{v}"' for k, v in metric.labels.items()) + "}"
            lines.append(f"{metric.name}{labels_str} {metric.value}")

        return "\n".join(lines)

    def to_dict(self) -> dict:
        """Export as dictionary."""
        return {
            "counters": {
                name: counter.collect()
                for name, counter in self._counters.items()
            },
            "gauges": {
                name: gauge.collect()
                for name, gauge in self._gauges.items()
            },
            "histograms": {
                name: histogram.get_stats()
                for name, histogram in self._histograms.items()
            },
        }

    def reset(self):
        """Reset all metrics."""
        with self._lock:
            self._counters.clear()
            self._gauges.clear()
            self._histograms.clear()


# Singleton instance
metrics_collector = MetricsCollector()
