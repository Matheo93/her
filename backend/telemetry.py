"""
Telemetry - Sprint 783

Application telemetry and observability system.

Features:
- Metrics collection
- Tracing integration
- Log correlation
- Custom dimensions
- Aggregations
- Export formats
"""

import asyncio
import time
import threading
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union,
    Awaitable, Set
)
from enum import Enum
from abc import ABC, abstractmethod
from collections import defaultdict
from contextlib import contextmanager, asynccontextmanager
import logging
import json

logger = logging.getLogger(__name__)


T = TypeVar("T")


class MetricType(str, Enum):
    """Type of metric."""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


@dataclass
class MetricValue:
    """Single metric value."""
    name: str
    value: float
    timestamp: float
    metric_type: MetricType
    labels: Dict[str, str] = field(default_factory=dict)
    unit: str = ""

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "value": self.value,
            "timestamp": self.timestamp,
            "type": self.metric_type.value,
            "labels": self.labels,
            "unit": self.unit,
        }


class Counter:
    """Counter metric - monotonically increasing."""

    def __init__(self, name: str, description: str = "", labels: Optional[List[str]] = None):
        self.name = name
        self.description = description
        self.label_names = labels or []
        self._values: Dict[tuple, float] = defaultdict(float)
        self._lock = threading.Lock()

    def inc(self, value: float = 1, **labels: str) -> None:
        """Increment counter."""
        key = tuple(labels.get(l, "") for l in self.label_names)
        with self._lock:
            self._values[key] += value

    def get(self, **labels: str) -> float:
        """Get current value."""
        key = tuple(labels.get(l, "") for l in self.label_names)
        with self._lock:
            return self._values[key]

    def collect(self) -> List[MetricValue]:
        """Collect all values."""
        now = time.time()
        results = []
        with self._lock:
            for key, value in self._values.items():
                label_dict = dict(zip(self.label_names, key))
                results.append(MetricValue(
                    name=self.name,
                    value=value,
                    timestamp=now,
                    metric_type=MetricType.COUNTER,
                    labels=label_dict,
                ))
        return results


class Gauge:
    """Gauge metric - arbitrary value."""

    def __init__(self, name: str, description: str = "", labels: Optional[List[str]] = None):
        self.name = name
        self.description = description
        self.label_names = labels or []
        self._values: Dict[tuple, float] = {}
        self._lock = threading.Lock()

    def set(self, value: float, **labels: str) -> None:
        """Set gauge value."""
        key = tuple(labels.get(l, "") for l in self.label_names)
        with self._lock:
            self._values[key] = value

    def inc(self, value: float = 1, **labels: str) -> None:
        """Increment gauge."""
        key = tuple(labels.get(l, "") for l in self.label_names)
        with self._lock:
            self._values[key] = self._values.get(key, 0) + value

    def dec(self, value: float = 1, **labels: str) -> None:
        """Decrement gauge."""
        key = tuple(labels.get(l, "") for l in self.label_names)
        with self._lock:
            self._values[key] = self._values.get(key, 0) - value

    def get(self, **labels: str) -> float:
        """Get current value."""
        key = tuple(labels.get(l, "") for l in self.label_names)
        with self._lock:
            return self._values.get(key, 0)

    def collect(self) -> List[MetricValue]:
        """Collect all values."""
        now = time.time()
        results = []
        with self._lock:
            for key, value in self._values.items():
                label_dict = dict(zip(self.label_names, key))
                results.append(MetricValue(
                    name=self.name,
                    value=value,
                    timestamp=now,
                    metric_type=MetricType.GAUGE,
                    labels=label_dict,
                ))
        return results


class Histogram:
    """Histogram metric with buckets."""

    DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]

    def __init__(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
        buckets: Optional[List[float]] = None,
    ):
        self.name = name
        self.description = description
        self.label_names = labels or []
        self.buckets = sorted(buckets or self.DEFAULT_BUCKETS)
        self._counts: Dict[tuple, Dict[float, int]] = defaultdict(
            lambda: defaultdict(int)
        )
        self._sums: Dict[tuple, float] = defaultdict(float)
        self._totals: Dict[tuple, int] = defaultdict(int)
        self._lock = threading.Lock()

    def observe(self, value: float, **labels: str) -> None:
        """Record an observation."""
        key = tuple(labels.get(l, "") for l in self.label_names)
        with self._lock:
            self._sums[key] += value
            self._totals[key] += 1
            for bucket in self.buckets:
                if value <= bucket:
                    self._counts[key][bucket] += 1

    def collect(self) -> List[MetricValue]:
        """Collect histogram values."""
        now = time.time()
        results = []
        with self._lock:
            for key in set(list(self._counts.keys()) + list(self._sums.keys())):
                label_dict = dict(zip(self.label_names, key))

                # Bucket counts
                for bucket in self.buckets:
                    bucket_labels = {**label_dict, "le": str(bucket)}
                    results.append(MetricValue(
                        name=self.name + "_bucket",
                        value=self._counts[key][bucket],
                        timestamp=now,
                        metric_type=MetricType.HISTOGRAM,
                        labels=bucket_labels,
                    ))

                # Sum
                results.append(MetricValue(
                    name=self.name + "_sum",
                    value=self._sums[key],
                    timestamp=now,
                    metric_type=MetricType.HISTOGRAM,
                    labels=label_dict,
                ))

                # Count
                results.append(MetricValue(
                    name=self.name + "_count",
                    value=self._totals[key],
                    timestamp=now,
                    metric_type=MetricType.HISTOGRAM,
                    labels=label_dict,
                ))

        return results

    @contextmanager
    def time(self, **labels: str):
        """Time a block of code."""
        start = time.time()
        try:
            yield
        finally:
            self.observe(time.time() - start, **labels)


@dataclass
class SpanContext:
    """Trace span context."""
    trace_id: str
    span_id: str
    parent_span_id: Optional[str] = None
    sampled: bool = True
    baggage: Dict[str, str] = field(default_factory=dict)


@dataclass
class Span:
    """Trace span."""
    name: str
    context: SpanContext
    start_time: float
    end_time: Optional[float] = None
    status: str = "ok"
    attributes: Dict[str, Any] = field(default_factory=dict)
    events: List[Dict[str, Any]] = field(default_factory=list)

    @property
    def duration_ms(self) -> float:
        if self.end_time:
            return (self.end_time - self.start_time) * 1000
        return (time.time() - self.start_time) * 1000

    def set_attribute(self, key: str, value: Any) -> "Span":
        self.attributes[key] = value
        return self

    def add_event(self, name: str, **attributes: Any) -> "Span":
        self.events.append({
            "name": name,
            "timestamp": time.time(),
            "attributes": attributes,
        })
        return self

    def set_status(self, status: str, message: str = "") -> "Span":
        self.status = status
        if message:
            self.attributes["error.message"] = message
        return self

    def end(self) -> None:
        self.end_time = time.time()

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "trace_id": self.context.trace_id,
            "span_id": self.context.span_id,
            "parent_span_id": self.context.parent_span_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": round(self.duration_ms, 2),
            "status": self.status,
            "attributes": self.attributes,
            "events": self.events,
        }


class Tracer:
    """Distributed tracing."""

    def __init__(self, service_name: str):
        self.service_name = service_name
        self._active_spans: Dict[str, Span] = {}
        self._completed_spans: List[Span] = []
        self._lock = threading.Lock()
        self._current_span: Optional[Span] = None

    def start_span(
        self,
        name: str,
        parent: Optional[Span] = None,
        attributes: Optional[Dict[str, Any]] = None,
    ) -> Span:
        """Start a new span."""
        parent_ctx = parent.context if parent else (self._current_span.context if self._current_span else None)

        context = SpanContext(
            trace_id=parent_ctx.trace_id if parent_ctx else str(uuid.uuid4()),
            span_id=str(uuid.uuid4())[:16],
            parent_span_id=parent_ctx.span_id if parent_ctx else None,
        )

        span = Span(
            name=name,
            context=context,
            start_time=time.time(),
            attributes={
                "service.name": self.service_name,
                **(attributes or {}),
            },
        )

        with self._lock:
            self._active_spans[span.context.span_id] = span

        return span

    def end_span(self, span: Span) -> None:
        """End a span."""
        span.end()
        with self._lock:
            self._active_spans.pop(span.context.span_id, None)
            self._completed_spans.append(span)

    @contextmanager
    def span(
        self,
        name: str,
        attributes: Optional[Dict[str, Any]] = None,
    ):
        """Context manager for spans."""
        span = self.start_span(name, parent=self._current_span, attributes=attributes)
        prev_span = self._current_span
        self._current_span = span
        try:
            yield span
        except Exception as e:
            span.set_status("error", str(e))
            raise
        finally:
            self._current_span = prev_span
            self.end_span(span)

    @asynccontextmanager
    async def async_span(
        self,
        name: str,
        attributes: Optional[Dict[str, Any]] = None,
    ):
        """Async context manager for spans."""
        span = self.start_span(name, parent=self._current_span, attributes=attributes)
        prev_span = self._current_span
        self._current_span = span
        try:
            yield span
        except Exception as e:
            span.set_status("error", str(e))
            raise
        finally:
            self._current_span = prev_span
            self.end_span(span)

    def get_completed_spans(self) -> List[Span]:
        """Get and clear completed spans."""
        with self._lock:
            spans = self._completed_spans.copy()
            self._completed_spans.clear()
            return spans


class MetricExporter(ABC):
    """Abstract metric exporter."""

    @abstractmethod
    async def export(self, metrics: List[MetricValue]) -> None:
        """Export metrics."""
        pass


class SpanExporter(ABC):
    """Abstract span exporter."""

    @abstractmethod
    async def export(self, spans: List[Span]) -> None:
        """Export spans."""
        pass


class ConsoleExporter(MetricExporter, SpanExporter):
    """Export to console."""

    async def export(self, data: Union[List[MetricValue], List[Span]]) -> None:
        for item in data:
            if isinstance(item, MetricValue):
                print(json.dumps(item.to_dict()))
            elif isinstance(item, Span):
                print(json.dumps(item.to_dict()))


class InMemoryExporter(MetricExporter, SpanExporter):
    """Store in memory for testing."""

    def __init__(self):
        self.metrics: List[MetricValue] = []
        self.spans: List[Span] = []
        self._lock = threading.Lock()

    async def export(self, data: Union[List[MetricValue], List[Span]]) -> None:
        with self._lock:
            for item in data:
                if isinstance(item, MetricValue):
                    self.metrics.append(item)
                elif isinstance(item, Span):
                    self.spans.append(item)

    def get_metrics(self) -> List[MetricValue]:
        with self._lock:
            return self.metrics.copy()

    def get_spans(self) -> List[Span]:
        with self._lock:
            return self.spans.copy()

    def clear(self) -> None:
        with self._lock:
            self.metrics.clear()
            self.spans.clear()


class TelemetryProvider:
    """Central telemetry provider.

    Usage:
        telemetry = TelemetryProvider("my-service")

        # Metrics
        requests = telemetry.counter("http_requests", labels=["method", "path"])
        requests.inc(method="GET", path="/api/users")

        latency = telemetry.histogram("http_latency", labels=["method"])
        with latency.time(method="GET"):
            # Handle request
            pass

        # Tracing
        with telemetry.span("process_order") as span:
            span.set_attribute("order_id", "123")
            # Process
    """

    def __init__(
        self,
        service_name: str,
        metric_exporters: Optional[List[MetricExporter]] = None,
        span_exporters: Optional[List[SpanExporter]] = None,
    ):
        self.service_name = service_name
        self._counters: Dict[str, Counter] = {}
        self._gauges: Dict[str, Gauge] = {}
        self._histograms: Dict[str, Histogram] = {}
        self._tracer = Tracer(service_name)
        self._metric_exporters = metric_exporters or []
        self._span_exporters = span_exporters or []
        self._export_task: Optional[asyncio.Task] = None
        self._export_interval = 10.0
        self._lock = threading.Lock()

    def counter(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
    ) -> Counter:
        """Get or create a counter."""
        with self._lock:
            if name not in self._counters:
                self._counters[name] = Counter(name, description, labels)
            return self._counters[name]

    def gauge(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
    ) -> Gauge:
        """Get or create a gauge."""
        with self._lock:
            if name not in self._gauges:
                self._gauges[name] = Gauge(name, description, labels)
            return self._gauges[name]

    def histogram(
        self,
        name: str,
        description: str = "",
        labels: Optional[List[str]] = None,
        buckets: Optional[List[float]] = None,
    ) -> Histogram:
        """Get or create a histogram."""
        with self._lock:
            if name not in self._histograms:
                self._histograms[name] = Histogram(name, description, labels, buckets)
            return self._histograms[name]

    def span(self, name: str, **attributes: Any):
        """Create a trace span context."""
        return self._tracer.span(name, attributes)

    def async_span(self, name: str, **attributes: Any):
        """Create an async trace span context."""
        return self._tracer.async_span(name, attributes)

    def collect_metrics(self) -> List[MetricValue]:
        """Collect all metrics."""
        metrics = []
        with self._lock:
            for counter in self._counters.values():
                metrics.extend(counter.collect())
            for gauge in self._gauges.values():
                metrics.extend(gauge.collect())
            for histogram in self._histograms.values():
                metrics.extend(histogram.collect())
        return metrics

    async def export_metrics(self) -> None:
        """Export collected metrics."""
        metrics = self.collect_metrics()
        for exporter in self._metric_exporters:
            try:
                await exporter.export(metrics)
            except Exception as e:
                logger.error("Metric export error: " + str(e))

    async def export_spans(self) -> None:
        """Export completed spans."""
        spans = self._tracer.get_completed_spans()
        if not spans:
            return
        for exporter in self._span_exporters:
            try:
                await exporter.export(spans)
            except Exception as e:
                logger.error("Span export error: " + str(e))

    async def _export_loop(self) -> None:
        """Periodic export loop."""
        while True:
            try:
                await asyncio.sleep(self._export_interval)
                await self.export_metrics()
                await self.export_spans()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Export loop error: " + str(e))

    async def start(self) -> None:
        """Start automatic export."""
        self._export_task = asyncio.create_task(self._export_loop())

    async def stop(self) -> None:
        """Stop and export remaining data."""
        if self._export_task:
            self._export_task.cancel()
            try:
                await self._export_task
            except asyncio.CancelledError:
                pass

        # Final export
        await self.export_metrics()
        await self.export_spans()

    def get_stats(self) -> dict:
        """Get telemetry stats."""
        with self._lock:
            return {
                "service_name": self.service_name,
                "counters": list(self._counters.keys()),
                "gauges": list(self._gauges.keys()),
                "histograms": list(self._histograms.keys()),
                "active_spans": len(self._tracer._active_spans),
            }


# Global instance
_provider: Optional[TelemetryProvider] = None


def get_telemetry() -> TelemetryProvider:
    """Get global telemetry provider."""
    global _provider
    if not _provider:
        _provider = TelemetryProvider("default")
    return _provider


def configure_telemetry(
    service_name: str,
    metric_exporters: Optional[List[MetricExporter]] = None,
    span_exporters: Optional[List[SpanExporter]] = None,
) -> TelemetryProvider:
    """Configure global telemetry."""
    global _provider
    _provider = TelemetryProvider(service_name, metric_exporters, span_exporters)
    return _provider
