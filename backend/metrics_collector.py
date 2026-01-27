"""
Metrics Collector - Sprint 807

Application metrics collection and aggregation.

Features:
- Counter, Gauge, Histogram, Summary metrics
- Labels support
- Time series storage
- Aggregation functions
- Prometheus-style metrics
- Export formats
"""

import math
import statistics
import threading
import time
from abc import ABC, abstractmethod
from collections import defaultdict
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Any, Callable, Dict, Generic, Iterator, List, Optional, Set, Tuple, TypeVar, Union
)

T = TypeVar("T")


class MetricType(str, Enum):
    """Type of metric."""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


@dataclass
class MetricValue:
    """Single metric value with timestamp."""
    value: float
    timestamp: float = field(default_factory=time.time)
    labels: Dict[str, str] = field(default_factory=dict)


@dataclass
class MetricMeta:
    """Metric metadata."""
    name: str
    metric_type: MetricType
    description: str = ""
    unit: str = ""
    label_names: List[str] = field(default_factory=list)


class Metric(ABC):
    """Abstract base metric."""

    def __init__(
        self,
        name: str,
        description: str = "",
        unit: str = "",
        label_names: Optional[List[str]] = None,
    ):
        self.name = name
        self.description = description
        self.unit = unit
        self.label_names = label_names or []
        self._lock = threading.RLock()

    @property
    @abstractmethod
    def metric_type(self) -> MetricType:
        """Get metric type."""
        pass

    @abstractmethod
    def collect(self) -> List[MetricValue]:
        """Collect all metric values."""
        pass

    def meta(self) -> MetricMeta:
        """Get metric metadata."""
        return MetricMeta(
            name=self.name,
            metric_type=self.metric_type,
            description=self.description,
            unit=self.unit,
            label_names=self.label_names,
        )

    def _validate_labels(self, labels: Dict[str, str]) -> None:
        """Validate labels match expected names."""
        if set(labels.keys()) != set(self.label_names):
            expected = set(self.label_names)
            provided = set(labels.keys())
            raise ValueError(
                "Label mismatch. Expected: " + str(expected) + ", got: " + str(provided)
            )


class Counter(Metric):
    """Counter metric - monotonically increasing value.

    Usage:
        counter = Counter("http_requests_total", "Total HTTP requests")
        counter.inc()
        counter.inc(5)

        # With labels
        counter = Counter("http_requests_total", label_names=["method", "status"])
        counter.labels(method="GET", status="200").inc()
    """

    def __init__(
        self,
        name: str,
        description: str = "",
        unit: str = "",
        label_names: Optional[List[str]] = None,
    ):
        super().__init__(name, description, unit, label_names)
        self._values: Dict[tuple, float] = defaultdict(float)

    @property
    def metric_type(self) -> MetricType:
        return MetricType.COUNTER

    def inc(self, amount: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment counter."""
        if amount < 0:
            raise ValueError("Counter can only be incremented")

        labels = labels or {}
        if self.label_names:
            self._validate_labels(labels)

        label_key = tuple(sorted(labels.items()))

        with self._lock:
            self._values[label_key] += amount

    def labels(self, **labels: str) -> "CounterChild":
        """Get child counter with labels."""
        return CounterChild(self, labels)

    def get(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Get current value."""
        labels = labels or {}
        label_key = tuple(sorted(labels.items()))

        with self._lock:
            return self._values.get(label_key, 0.0)

    def collect(self) -> List[MetricValue]:
        """Collect all values."""
        with self._lock:
            result = []
            for label_key, value in self._values.items():
                labels = dict(label_key)
                result.append(MetricValue(value=value, labels=labels))
            return result

    def reset(self) -> None:
        """Reset counter (use with caution)."""
        with self._lock:
            self._values.clear()


class CounterChild:
    """Counter child with preset labels."""

    def __init__(self, parent: Counter, labels: Dict[str, str]):
        self._parent = parent
        self._labels = labels

    def inc(self, amount: float = 1.0) -> None:
        """Increment counter."""
        self._parent.inc(amount, self._labels)

    def get(self) -> float:
        """Get current value."""
        return self._parent.get(self._labels)


class Gauge(Metric):
    """Gauge metric - value that can go up and down.

    Usage:
        gauge = Gauge("temperature_celsius", "Current temperature")
        gauge.set(23.5)
        gauge.inc()
        gauge.dec(2)

        # Track in-progress
        with gauge.track_inprogress():
            do_work()
    """

    def __init__(
        self,
        name: str,
        description: str = "",
        unit: str = "",
        label_names: Optional[List[str]] = None,
    ):
        super().__init__(name, description, unit, label_names)
        self._values: Dict[tuple, float] = defaultdict(float)

    @property
    def metric_type(self) -> MetricType:
        return MetricType.GAUGE

    def set(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Set gauge value."""
        labels = labels or {}
        if self.label_names:
            self._validate_labels(labels)

        label_key = tuple(sorted(labels.items()))

        with self._lock:
            self._values[label_key] = value

    def inc(self, amount: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Increment gauge."""
        labels = labels or {}
        if self.label_names:
            self._validate_labels(labels)

        label_key = tuple(sorted(labels.items()))

        with self._lock:
            self._values[label_key] += amount

    def dec(self, amount: float = 1.0, labels: Optional[Dict[str, str]] = None) -> None:
        """Decrement gauge."""
        self.inc(-amount, labels)

    def labels(self, **labels: str) -> "GaugeChild":
        """Get child gauge with labels."""
        return GaugeChild(self, labels)

    def get(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Get current value."""
        labels = labels or {}
        label_key = tuple(sorted(labels.items()))

        with self._lock:
            return self._values.get(label_key, 0.0)

    def set_to_current_time(self, labels: Optional[Dict[str, str]] = None) -> None:
        """Set gauge to current timestamp."""
        self.set(time.time(), labels)

    def track_inprogress(self, labels: Optional[Dict[str, str]] = None) -> "GaugeContextManager":
        """Context manager for tracking in-progress operations."""
        return GaugeContextManager(self, labels)

    def collect(self) -> List[MetricValue]:
        """Collect all values."""
        with self._lock:
            result = []
            for label_key, value in self._values.items():
                labels = dict(label_key)
                result.append(MetricValue(value=value, labels=labels))
            return result


class GaugeChild:
    """Gauge child with preset labels."""

    def __init__(self, parent: Gauge, labels: Dict[str, str]):
        self._parent = parent
        self._labels = labels

    def set(self, value: float) -> None:
        self._parent.set(value, self._labels)

    def inc(self, amount: float = 1.0) -> None:
        self._parent.inc(amount, self._labels)

    def dec(self, amount: float = 1.0) -> None:
        self._parent.dec(amount, self._labels)

    def get(self) -> float:
        return self._parent.get(self._labels)


class GaugeContextManager:
    """Context manager for gauge tracking."""

    def __init__(self, gauge: Gauge, labels: Optional[Dict[str, str]] = None):
        self._gauge = gauge
        self._labels = labels

    def __enter__(self) -> "GaugeContextManager":
        self._gauge.inc(1.0, self._labels)
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        self._gauge.dec(1.0, self._labels)


class Histogram(Metric):
    """Histogram metric - distribution of values.

    Usage:
        histogram = Histogram(
            "http_request_duration_seconds",
            "HTTP request duration",
            buckets=[0.1, 0.5, 1.0, 5.0]
        )
        histogram.observe(0.25)

        # Time a function
        with histogram.time():
            do_work()
    """

    DEFAULT_BUCKETS = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)

    def __init__(
        self,
        name: str,
        description: str = "",
        unit: str = "",
        label_names: Optional[List[str]] = None,
        buckets: Optional[Tuple[float, ...]] = None,
    ):
        super().__init__(name, description, unit, label_names)
        self._buckets = tuple(sorted(buckets or self.DEFAULT_BUCKETS)) + (float("inf"),)
        self._bucket_counts: Dict[tuple, Dict[float, int]] = defaultdict(
            lambda: {b: 0 for b in self._buckets}
        )
        self._sums: Dict[tuple, float] = defaultdict(float)
        self._counts: Dict[tuple, int] = defaultdict(int)

    @property
    def metric_type(self) -> MetricType:
        return MetricType.HISTOGRAM

    @property
    def buckets(self) -> Tuple[float, ...]:
        """Get bucket boundaries."""
        return self._buckets

    def observe(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Observe a value."""
        labels = labels or {}
        if self.label_names:
            self._validate_labels(labels)

        label_key = tuple(sorted(labels.items()))

        with self._lock:
            self._sums[label_key] += value
            self._counts[label_key] += 1

            for bucket in self._buckets:
                if value <= bucket:
                    self._bucket_counts[label_key][bucket] += 1

    def labels(self, **labels: str) -> "HistogramChild":
        """Get child histogram with labels."""
        return HistogramChild(self, labels)

    def time(self, labels: Optional[Dict[str, str]] = None) -> "HistogramTimer":
        """Context manager for timing operations."""
        return HistogramTimer(self, labels)

    def get_sample_count(self, labels: Optional[Dict[str, str]] = None) -> int:
        """Get sample count."""
        labels = labels or {}
        label_key = tuple(sorted(labels.items()))

        with self._lock:
            return self._counts.get(label_key, 0)

    def get_sample_sum(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Get sample sum."""
        labels = labels or {}
        label_key = tuple(sorted(labels.items()))

        with self._lock:
            return self._sums.get(label_key, 0.0)

    def collect(self) -> List[MetricValue]:
        """Collect all values."""
        with self._lock:
            result = []
            for label_key in set(self._sums.keys()) | set(self._counts.keys()):
                labels = dict(label_key)

                # Add bucket counts
                for bucket, count in self._bucket_counts[label_key].items():
                    bucket_labels = {**labels, "le": str(bucket)}
                    result.append(
                        MetricValue(
                            value=count,
                            labels=bucket_labels,
                        )
                    )

                # Add sum
                sum_labels = {**labels, "_type": "sum"}
                result.append(
                    MetricValue(
                        value=self._sums.get(label_key, 0.0),
                        labels=sum_labels,
                    )
                )

                # Add count
                count_labels = {**labels, "_type": "count"}
                result.append(
                    MetricValue(
                        value=self._counts.get(label_key, 0),
                        labels=count_labels,
                    )
                )

            return result


class HistogramChild:
    """Histogram child with preset labels."""

    def __init__(self, parent: Histogram, labels: Dict[str, str]):
        self._parent = parent
        self._labels = labels

    def observe(self, value: float) -> None:
        self._parent.observe(value, self._labels)

    def time(self) -> "HistogramTimer":
        return HistogramTimer(self._parent, self._labels)


class HistogramTimer:
    """Timer context manager for histogram."""

    def __init__(self, histogram: Histogram, labels: Optional[Dict[str, str]] = None):
        self._histogram = histogram
        self._labels = labels
        self._start: float = 0

    def __enter__(self) -> "HistogramTimer":
        self._start = time.perf_counter()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        duration = time.perf_counter() - self._start
        self._histogram.observe(duration, self._labels)


class Summary(Metric):
    """Summary metric - quantiles over a sliding window.

    Usage:
        summary = Summary(
            "http_request_duration_seconds",
            quantiles=[0.5, 0.9, 0.99]
        )
        summary.observe(0.25)
    """

    DEFAULT_QUANTILES = (0.5, 0.9, 0.95, 0.99)

    def __init__(
        self,
        name: str,
        description: str = "",
        unit: str = "",
        label_names: Optional[List[str]] = None,
        quantiles: Optional[Tuple[float, ...]] = None,
        max_age: float = 600.0,
    ):
        super().__init__(name, description, unit, label_names)
        self._quantiles = quantiles or self.DEFAULT_QUANTILES
        self._max_age = max_age
        self._values: Dict[tuple, List[Tuple[float, float]]] = defaultdict(list)

    @property
    def metric_type(self) -> MetricType:
        return MetricType.SUMMARY

    @property
    def quantiles(self) -> Tuple[float, ...]:
        """Get quantile boundaries."""
        return self._quantiles

    def observe(self, value: float, labels: Optional[Dict[str, str]] = None) -> None:
        """Observe a value."""
        labels = labels or {}
        if self.label_names:
            self._validate_labels(labels)

        label_key = tuple(sorted(labels.items()))
        now = time.time()

        with self._lock:
            # Add new value
            self._values[label_key].append((now, value))

            # Remove old values
            cutoff = now - self._max_age
            self._values[label_key] = [
                (t, v) for t, v in self._values[label_key] if t > cutoff
            ]

    def labels(self, **labels: str) -> "SummaryChild":
        """Get child summary with labels."""
        return SummaryChild(self, labels)

    def get_quantile(
        self,
        quantile: float,
        labels: Optional[Dict[str, str]] = None,
    ) -> Optional[float]:
        """Get quantile value."""
        labels = labels or {}
        label_key = tuple(sorted(labels.items()))

        with self._lock:
            values = [v for _, v in self._values.get(label_key, [])]

        if not values:
            return None

        values.sort()
        index = int(quantile * len(values))
        index = min(index, len(values) - 1)
        return values[index]

    def get_count(self, labels: Optional[Dict[str, str]] = None) -> int:
        """Get sample count."""
        labels = labels or {}
        label_key = tuple(sorted(labels.items()))

        with self._lock:
            return len(self._values.get(label_key, []))

    def get_sum(self, labels: Optional[Dict[str, str]] = None) -> float:
        """Get sample sum."""
        labels = labels or {}
        label_key = tuple(sorted(labels.items()))

        with self._lock:
            return sum(v for _, v in self._values.get(label_key, []))

    def collect(self) -> List[MetricValue]:
        """Collect all values."""
        with self._lock:
            result = []
            for label_key, values in self._values.items():
                labels = dict(label_key)
                sorted_values = sorted(v for _, v in values)

                if sorted_values:
                    # Add quantiles
                    for q in self._quantiles:
                        index = int(q * len(sorted_values))
                        index = min(index, len(sorted_values) - 1)
                        q_labels = {**labels, "quantile": str(q)}
                        result.append(
                            MetricValue(
                                value=sorted_values[index],
                                labels=q_labels,
                            )
                        )

                    # Add sum and count
                    result.append(
                        MetricValue(
                            value=sum(sorted_values),
                            labels={**labels, "_type": "sum"},
                        )
                    )
                    result.append(
                        MetricValue(
                            value=len(sorted_values),
                            labels={**labels, "_type": "count"},
                        )
                    )

            return result


class SummaryChild:
    """Summary child with preset labels."""

    def __init__(self, parent: Summary, labels: Dict[str, str]):
        self._parent = parent
        self._labels = labels

    def observe(self, value: float) -> None:
        self._parent.observe(value, self._labels)


class MetricsRegistry:
    """Registry for collecting metrics.

    Usage:
        registry = MetricsRegistry()

        counter = Counter("requests_total", "Total requests")
        registry.register(counter)

        # Get all metrics
        for name, metric in registry.collect():
            print(name, metric)
    """

    def __init__(self):
        self._metrics: Dict[str, Metric] = {}
        self._lock = threading.RLock()

    def register(self, metric: Metric) -> Metric:
        """Register a metric."""
        with self._lock:
            if metric.name in self._metrics:
                raise ValueError("Metric already registered: " + metric.name)
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
        with self._lock:
            return self._metrics.get(name)

    def collect(self) -> Iterator[Tuple[str, List[MetricValue]]]:
        """Collect all metric values."""
        with self._lock:
            metrics = list(self._metrics.items())

        for name, metric in metrics:
            yield name, metric.collect()

    def get_all_metadata(self) -> List[MetricMeta]:
        """Get metadata for all metrics."""
        with self._lock:
            return [m.meta() for m in self._metrics.values()]

    def to_prometheus(self) -> str:
        """Export metrics in Prometheus format."""
        lines = []

        for name, values in self.collect():
            metric = self._metrics.get(name)
            if not metric:
                continue

            # Add help and type
            if metric.description:
                lines.append("# HELP " + name + " " + metric.description)
            lines.append("# TYPE " + name + " " + metric.metric_type.value)

            # Add values
            for mv in values:
                label_str = ""
                if mv.labels:
                    label_parts = [k + '="' + v + '"' for k, v in mv.labels.items()]
                    label_str = "{" + ",".join(label_parts) + "}"

                lines.append(name + label_str + " " + str(mv.value))

        return "\n".join(lines)

    def to_json(self) -> Dict[str, Any]:
        """Export metrics as JSON."""
        result: Dict[str, Any] = {}

        for name, values in self.collect():
            metric = self._metrics.get(name)
            if not metric:
                continue

            result[name] = {
                "type": metric.metric_type.value,
                "description": metric.description,
                "values": [
                    {
                        "value": mv.value,
                        "labels": mv.labels,
                        "timestamp": mv.timestamp,
                    }
                    for mv in values
                ],
            }

        return result


# Default global registry
_default_registry = MetricsRegistry()


def get_registry() -> MetricsRegistry:
    """Get default registry."""
    return _default_registry


def counter(
    name: str,
    description: str = "",
    unit: str = "",
    label_names: Optional[List[str]] = None,
    registry: Optional[MetricsRegistry] = None,
) -> Counter:
    """Create and register a counter."""
    reg = registry or _default_registry
    c = Counter(name, description, unit, label_names)
    return reg.register(c)


def gauge(
    name: str,
    description: str = "",
    unit: str = "",
    label_names: Optional[List[str]] = None,
    registry: Optional[MetricsRegistry] = None,
) -> Gauge:
    """Create and register a gauge."""
    reg = registry or _default_registry
    g = Gauge(name, description, unit, label_names)
    return reg.register(g)


def histogram(
    name: str,
    description: str = "",
    unit: str = "",
    label_names: Optional[List[str]] = None,
    buckets: Optional[Tuple[float, ...]] = None,
    registry: Optional[MetricsRegistry] = None,
) -> Histogram:
    """Create and register a histogram."""
    reg = registry or _default_registry
    h = Histogram(name, description, unit, label_names, buckets)
    return reg.register(h)


def summary(
    name: str,
    description: str = "",
    unit: str = "",
    label_names: Optional[List[str]] = None,
    quantiles: Optional[Tuple[float, ...]] = None,
    max_age: float = 600.0,
    registry: Optional[MetricsRegistry] = None,
) -> Summary:
    """Create and register a summary."""
    reg = registry or _default_registry
    s = Summary(name, description, unit, label_names, quantiles, max_age)
    return reg.register(s)
