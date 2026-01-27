"""
Metrics Collector - Sprint 745

Application metrics collection and reporting.

Features:
- Counter, Gauge, Histogram metrics
- Labels and dimensions
- Aggregation
- Export formats
- Time-series storage
"""

import time
import threading
import statistics
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union, Tuple
)
from enum import Enum
from abc import ABC, abstractmethod
from collections import defaultdict
import json


T = TypeVar("T")


class MetricType(str, Enum):
    """Metric types."""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"
    TIMER = "timer"


@dataclass
class MetricValue:
    """Metric value with timestamp."""
    value: float
    timestamp: float = field(default_factory=time.time)
    labels: Dict[str, str] = field(default_factory=dict)


class Metric(ABC):
    """Base metric class."""

    def __init__(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
    ):
        self.name = name
        self.description = description
        self.label_names = labels or []
        self._lock = threading.Lock()

    @property
    @abstractmethod
    def type(self) -> MetricType:
        """Get metric type."""
        pass

    @abstractmethod
    def collect(self) -> List[MetricValue]:
        """Collect metric values."""
        pass

    def _labels_key(self, labels: Dict[str, str]) -> str:
        """Create hashable key from labels."""
        return json.dumps(labels, sort_keys=True)


class Counter(Metric):
    """Monotonically increasing counter.

    Usage:
        requests = Counter("http_requests_total", "Total HTTP requests", ["method", "path"])
        requests.inc()
        requests.inc({"method": "GET", "path": "/api"})
        requests.add(5, {"method": "POST", "path": "/api"})
    """

    def __init__(self, name: str, description: str = "", labels: Optional[List[str]] = None):
        super().__init__(name, description, labels)
        self._values: Dict[str, float] = defaultdict(float)

    @property
    def type(self) -> MetricType:
        return MetricType.COUNTER

    def inc(self, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment by 1."""
        self.add(1, labels)

    def add(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Add value to counter."""
        if value < 0:
            raise ValueError("Counter can only increase")

        with self._lock:
            key = self._labels_key(labels or {})
            self._values[key] += value

    def get(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Get current value."""
        key = self._labels_key(labels or {})
        return self._values.get(key, 0.0)

    def collect(self) -> List[MetricValue]:
        with self._lock:
            return [
                MetricValue(value=v, labels=json.loads(k) if k != "{}" else {})
                for k, v in self._values.items()
            ]


class Gauge(Metric):
    """Gauge that can go up and down.

    Usage:
        temperature = Gauge("temperature_celsius", "Current temperature")
        temperature.set(25.5)
        temperature.inc()
        temperature.dec(2)
    """

    def __init__(self, name: str, description: str = "", labels: Optional[List[str]] = None):
        super().__init__(name, description, labels)
        self._values: Dict[str, float] = defaultdict(float)

    @property
    def type(self) -> MetricType:
        return MetricType.GAUGE

    def set(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Set gauge value."""
        with self._lock:
            key = self._labels_key(labels or {})
            self._values[key] = value

    def inc(self, value: float = 1, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment gauge."""
        with self._lock:
            key = self._labels_key(labels or {})
            self._values[key] += value

    def dec(self, value: float = 1, labels: Optional[Dict[str, str]] = None) -> None:
        """Decrement gauge."""
        with self._lock:
            key = self._labels_key(labels or {})
            self._values[key] -= value

    def get(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Get current value."""
        key = self._labels_key(labels or {})
        return self._values.get(key, 0.0)

    def collect(self) -> List[MetricValue]:
        with self._lock:
            return [
                MetricValue(value=v, labels=json.loads(k) if k != "{}" else {})
                for k, v in self._values.items()
            ]


class Histogram(Metric):
    """Histogram for value distribution.

    Usage:
        request_duration = Histogram(
            "http_request_duration_seconds",
            "Request duration in seconds",
            buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 5.0]
        )
        request_duration.observe(0.42)
    """

    DEFAULT_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1.0, 2.5, 5.0, 7.5, 10.0)

    def __init__(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
        buckets: Optional[Tuple[float, ...]] = None,
    ):
        super().__init__(name, description, labels)
        self._buckets = tuple(sorted(buckets or self.DEFAULT_BUCKETS))
        self._counts: Dict[str, Dict[float, int]] = defaultdict(lambda: defaultdict(int))
        self._sums: Dict[str, float] = defaultdict(float)
        self._totals: Dict[str, int] = defaultdict(int)

    @property
    def type(self) -> MetricType:
        return MetricType.HISTOGRAM

    def observe(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Observe a value."""
        with self._lock:
            key = self._labels_key(labels or {})
            self._sums[key] += value
            self._totals[key] += 1

            # Find the bucket this value belongs to
            for bucket in self._buckets:
                if value <= bucket:
                    self._counts[key][bucket] += 1
                    break  # Only count in one bucket

    def get_bucket_counts(self, labels: Optional[Dict[str, str]] = None) -> Dict[float, int]:
        """Get bucket counts."""
        key = self._labels_key(labels or {})
        counts = {}
        cumulative = 0
        for bucket in self._buckets:
            cumulative += self._counts[key].get(bucket, 0)
            counts[bucket] = cumulative
        counts[float("inf")] = self._totals[key]
        return counts

    def collect(self) -> List[MetricValue]:
        with self._lock:
            results = []
            for key in self._sums:
                labels = json.loads(key) if key != "{}" else {}
                results.append(MetricValue(value=self._sums[key], labels={**labels, "type": "sum"}))
                results.append(MetricValue(value=self._totals[key], labels={**labels, "type": "count"}))
                for bucket, count in self.get_bucket_counts(labels if labels else None).items():
                    results.append(MetricValue(value=count, labels={**labels, "le": str(bucket)}))
            return results


class Summary(Metric):
    """Summary with quantiles.

    Usage:
        response_size = Summary(
            "http_response_size_bytes",
            "Response size in bytes",
            quantiles=[0.5, 0.9, 0.99]
        )
        response_size.observe(1024)
    """

    DEFAULT_QUANTILES = (0.5, 0.9, 0.95, 0.99)

    def __init__(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
        quantiles: Optional[Tuple[float, ...]] = None,
        max_age: float = 600,
    ):
        super().__init__(name, description, labels)
        self._quantiles = quantiles or self.DEFAULT_QUANTILES
        self._max_age = max_age
        self._observations: Dict[str, List[Tuple[float, float]]] = defaultdict(list)

    @property
    def type(self) -> MetricType:
        return MetricType.SUMMARY

    def observe(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Observe a value."""
        now = time.time()
        with self._lock:
            key = self._labels_key(labels or {})
            self._observations[key].append((value, now))
            # Clean old observations
            self._observations[key] = [
                (v, t) for v, t in self._observations[key]
                if now - t < self._max_age
            ]

    def get_quantiles(self, labels: Optional[Dict[str, str]] = None) -> Dict[float, float]:
        """Get quantile values."""
        key = self._labels_key(labels or {})
        values = [v for v, _ in self._observations.get(key, [])]

        if not values:
            return {q: 0.0 for q in self._quantiles}

        sorted_values = sorted(values)
        result = {}
        for q in self._quantiles:
            idx = int(len(sorted_values) * q)
            result[q] = sorted_values[min(idx, len(sorted_values) - 1)]
        return result

    def collect(self) -> List[MetricValue]:
        with self._lock:
            results = []
            for key in self._observations:
                labels = json.loads(key) if key != "{}" else {}
                values = [v for v, _ in self._observations[key]]
                if values:
                    results.append(MetricValue(value=sum(values), labels={**labels, "type": "sum"}))
                    results.append(MetricValue(value=len(values), labels={**labels, "type": "count"}))
                    for q, v in self.get_quantiles(labels if labels else None).items():
                        results.append(MetricValue(value=v, labels={**labels, "quantile": str(q)}))
            return results


class Timer:
    """Context manager for timing.

    Usage:
        duration = Histogram("operation_duration")

        with Timer(duration):
            do_something()

        # Or as decorator
        @Timer(duration)
        def my_function():
            pass
    """

    def __init__(self, metric: Union[Histogram, Summary], labels: Optional[Dict[str, str]] = None):
        self.metric = metric
        self.labels = labels
        self._start: Optional[float] = None

    def __enter__(self) -> "Timer":
        self._start = time.time()
        return self

    def __exit__(self, *args: Any) -> None:
        if self._start:
            duration = time.time() - self._start
            self.metric.observe(duration, self.labels)

    def __call__(self, func: Callable) -> Callable:
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            with self:
                return func(*args, **kwargs)
        return wrapper


class MetricsRegistry:
    """Metrics registry.

    Usage:
        registry = MetricsRegistry()
        requests = registry.counter("http_requests_total")
        duration = registry.histogram("http_request_duration")
    """

    def __init__(self):
        self._metrics: Dict[str, Metric] = {}
        self._lock = threading.Lock()

    def register(self, metric: Metric) -> Metric:
        """Register a metric."""
        with self._lock:
            if metric.name in self._metrics:
                return self._metrics[metric.name]
            self._metrics[metric.name] = metric
            return metric

    def unregister(self, name: str) -> bool:
        """Unregister a metric."""
        with self._lock:
            if name in self._metrics:
                del self._metrics[name]
                return True
            return False

    def get(self, name: str) -> Optional[Metric]:
        """Get metric by name."""
        return self._metrics.get(name)

    def counter(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
    ) -> Counter:
        """Create or get counter."""
        metric = Counter(name, description, labels)
        return self.register(metric)

    def gauge(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
    ) -> Gauge:
        """Create or get gauge."""
        metric = Gauge(name, description, labels)
        return self.register(metric)

    def histogram(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
        buckets: Optional[Tuple[float, ...]] = None,
    ) -> Histogram:
        """Create or get histogram."""
        metric = Histogram(name, description, labels, buckets)
        return self.register(metric)

    def summary(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
        quantiles: Optional[Tuple[float, ...]] = None,
    ) -> Summary:
        """Create or get summary."""
        metric = Summary(name, description, labels, quantiles)
        return self.register(metric)

    def collect_all(self) -> Dict[str, List[MetricValue]]:
        """Collect all metrics."""
        with self._lock:
            return {name: m.collect() for name, m in self._metrics.items()}

    def to_prometheus(self) -> str:
        """Export in Prometheus format."""
        lines = []
        for name, metric in self._metrics.items():
            lines.append(f"# HELP {name} {metric.description}")
            lines.append(f"# TYPE {name} {metric.type.value}")
            for value in metric.collect():
                labels_str = ",".join(f'{k}="{v}"' for k, v in value.labels.items())
                if labels_str:
                    lines.append(f"{name}{{{labels_str}}} {value.value}")
                else:
                    lines.append(f"{name} {value.value}")
        return "\n".join(lines)

    def to_json(self) -> str:
        """Export as JSON."""
        data = {}
        for name, metric in self._metrics.items():
            data[name] = {
                "type": metric.type.value,
                "description": metric.description,
                "values": [
                    {"value": v.value, "labels": v.labels, "timestamp": v.timestamp}
                    for v in metric.collect()
                ]
            }
        return json.dumps(data, indent=2)


# Global registry
metrics = MetricsRegistry()


# Convenience functions
def counter(name: str, description: str = "", labels: Optional[List[str]] = None) -> Counter:
    """Create counter in global registry."""
    return metrics.counter(name, description, labels)


def gauge(name: str, description: str = "", labels: Optional[List[str]] = None) -> Gauge:
    """Create gauge in global registry."""
    return metrics.gauge(name, description, labels)


def histogram(name: str, description: str = "", labels: Optional[List[str]] = None, buckets: Optional[Tuple[float, ...]] = None) -> Histogram:
    """Create histogram in global registry."""
    return metrics.histogram(name, description, labels, buckets)


def summary(name: str, description: str = "", labels: Optional[List[str]] = None, quantiles: Optional[Tuple[float, ...]] = None) -> Summary:
    """Create summary in global registry."""
    return metrics.summary(name, description, labels, quantiles)
