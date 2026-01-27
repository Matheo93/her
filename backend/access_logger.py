"""
Access Logger - Sprint 775

Structured HTTP access logging system.

Features:
- Request/response logging
- Structured format
- Performance metrics
- Log rotation
- Filtering
- Export formats
"""

import time
import json
import uuid
import asyncio
import threading
from datetime import datetime
from dataclasses import dataclass, field, asdict
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Set
)
from enum import Enum
from abc import ABC, abstractmethod
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


T = TypeVar("T")


class LogLevel(str, Enum):
    """Log level."""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class AccessLogEntry:
    """Single access log entry."""
    id: str
    timestamp: float
    method: str
    path: str
    status_code: int
    duration_ms: float
    client_ip: Optional[str] = None
    user_agent: Optional[str] = None
    user_id: Optional[str] = None
    request_size: int = 0
    response_size: int = 0
    query_params: Optional[Dict[str, Any]] = None
    headers: Optional[Dict[str, str]] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    trace_id: Optional[str] = None

    @property
    def is_error(self) -> bool:
        return self.status_code >= 400

    @property
    def is_slow(self) -> bool:
        return self.duration_ms > 1000

    @property
    def datetime(self) -> datetime:
        return datetime.fromtimestamp(self.timestamp)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "datetime": self.datetime.isoformat(),
            "method": self.method,
            "path": self.path,
            "status_code": self.status_code,
            "duration_ms": round(self.duration_ms, 2),
            "client_ip": self.client_ip,
            "user_id": self.user_id,
            "request_size": self.request_size,
            "response_size": self.response_size,
            "error": self.error,
            "metadata": self.metadata,
        }

    def to_common_log_format(self) -> str:
        """Format as Common Log Format (CLF)."""
        ip = self.client_ip or "-"
        user = self.user_id or "-"
        dt = self.datetime.strftime("%d/%b/%Y:%H:%M:%S +0000")
        request = self.method + " " + self.path + " HTTP/1.1"
        size = str(self.response_size) if self.response_size else "-"
        return ip + " - " + user + " [" + dt + '] "' + request + '" ' + str(self.status_code) + " " + size

    def to_json(self) -> str:
        """Format as JSON."""
        return json.dumps(self.to_dict())


class LogWriter(ABC):
    """Abstract log writer."""

    @abstractmethod
    async def write(self, entry: AccessLogEntry) -> None:
        """Write log entry."""
        pass

    @abstractmethod
    async def flush(self) -> None:
        """Flush buffered entries."""
        pass

    @abstractmethod
    async def close(self) -> None:
        """Close writer."""
        pass


class ConsoleLogWriter(LogWriter):
    """Write logs to console."""

    def __init__(self, format_type: str = "json"):
        self.format_type = format_type

    async def write(self, entry: AccessLogEntry) -> None:
        if self.format_type == "json":
            print(entry.to_json())
        else:
            print(entry.to_common_log_format())

    async def flush(self) -> None:
        pass

    async def close(self) -> None:
        pass


class MemoryLogWriter(LogWriter):
    """Store logs in memory."""

    def __init__(self, max_entries: int = 10000):
        self._entries: List[AccessLogEntry] = []
        self._max_entries = max_entries
        self._lock = threading.Lock()

    async def write(self, entry: AccessLogEntry) -> None:
        with self._lock:
            self._entries.append(entry)
            if len(self._entries) > self._max_entries:
                self._entries = self._entries[-self._max_entries:]

    async def flush(self) -> None:
        pass

    async def close(self) -> None:
        pass

    def get_entries(self) -> List[AccessLogEntry]:
        with self._lock:
            return self._entries.copy()

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()


class FileLogWriter(LogWriter):
    """Write logs to file."""

    def __init__(
        self,
        file_path: str,
        format_type: str = "json",
        buffer_size: int = 100,
    ):
        self.file_path = file_path
        self.format_type = format_type
        self.buffer_size = buffer_size
        self._buffer: List[str] = []
        self._lock = threading.Lock()

    async def write(self, entry: AccessLogEntry) -> None:
        if self.format_type == "json":
            line = entry.to_json()
        else:
            line = entry.to_common_log_format()

        with self._lock:
            self._buffer.append(line)
            if len(self._buffer) >= self.buffer_size:
                await self.flush()

    async def flush(self) -> None:
        with self._lock:
            if not self._buffer:
                return

            with open(self.file_path, "a") as f:
                for line in self._buffer:
                    f.write(line + "\n")
            self._buffer.clear()

    async def close(self) -> None:
        await self.flush()


class AccessLogFilter:
    """Filter log entries."""

    def __init__(
        self,
        include_paths: Optional[List[str]] = None,
        exclude_paths: Optional[List[str]] = None,
        min_status: Optional[int] = None,
        max_status: Optional[int] = None,
        min_duration_ms: Optional[float] = None,
        include_methods: Optional[List[str]] = None,
    ):
        self.include_paths = include_paths
        self.exclude_paths = exclude_paths or []
        self.min_status = min_status
        self.max_status = max_status
        self.min_duration_ms = min_duration_ms
        self.include_methods = include_methods

    def should_log(self, entry: AccessLogEntry) -> bool:
        """Check if entry should be logged."""
        # Path filters
        if self.exclude_paths:
            for pattern in self.exclude_paths:
                if entry.path.startswith(pattern):
                    return False

        if self.include_paths:
            matched = False
            for pattern in self.include_paths:
                if entry.path.startswith(pattern):
                    matched = True
                    break
            if not matched:
                return False

        # Status filters
        if self.min_status and entry.status_code < self.min_status:
            return False
        if self.max_status and entry.status_code > self.max_status:
            return False

        # Duration filter
        if self.min_duration_ms and entry.duration_ms < self.min_duration_ms:
            return False

        # Method filter
        if self.include_methods and entry.method not in self.include_methods:
            return False

        return True


@dataclass
class AccessLogStats:
    """Access log statistics."""
    total_requests: int = 0
    error_count: int = 0
    avg_duration_ms: float = 0
    p50_duration_ms: float = 0
    p95_duration_ms: float = 0
    p99_duration_ms: float = 0
    requests_by_status: Dict[int, int] = field(default_factory=dict)
    requests_by_method: Dict[str, int] = field(default_factory=dict)
    requests_by_path: Dict[str, int] = field(default_factory=dict)
    slowest_paths: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "total_requests": self.total_requests,
            "error_count": self.error_count,
            "error_rate": round(self.error_count / max(1, self.total_requests) * 100, 2),
            "avg_duration_ms": round(self.avg_duration_ms, 2),
            "p50_duration_ms": round(self.p50_duration_ms, 2),
            "p95_duration_ms": round(self.p95_duration_ms, 2),
            "p99_duration_ms": round(self.p99_duration_ms, 2),
            "requests_by_status": self.requests_by_status,
            "requests_by_method": self.requests_by_method,
            "top_paths": dict(sorted(
                self.requests_by_path.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10]),
            "slowest_paths": self.slowest_paths[:5],
        }


class AccessLogger:
    """HTTP access logger.

    Usage:
        logger = AccessLogger()

        # In middleware
        entry = logger.start_request(request)
        response = await handler(request)
        logger.end_request(entry, response)

        # Or use context manager
        with logger.track(request) as entry:
            response = await handler(request)
            entry.status_code = response.status_code
    """

    def __init__(
        self,
        writers: Optional[List[LogWriter]] = None,
        log_filter: Optional[AccessLogFilter] = None,
    ):
        self._writers = writers or [ConsoleLogWriter()]
        self._filter = log_filter
        self._stats_entries: List[AccessLogEntry] = []
        self._stats_lock = threading.Lock()
        self._max_stats_entries = 10000

    def add_writer(self, writer: LogWriter) -> None:
        """Add a log writer."""
        self._writers.append(writer)

    def set_filter(self, log_filter: AccessLogFilter) -> None:
        """Set log filter."""
        self._filter = log_filter

    def create_entry(
        self,
        method: str,
        path: str,
        client_ip: Optional[str] = None,
        user_agent: Optional[str] = None,
        user_id: Optional[str] = None,
        query_params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        request_size: int = 0,
        trace_id: Optional[str] = None,
    ) -> AccessLogEntry:
        """Create a new log entry."""
        return AccessLogEntry(
            id=str(uuid.uuid4()),
            timestamp=time.time(),
            method=method.upper(),
            path=path,
            status_code=0,
            duration_ms=0,
            client_ip=client_ip,
            user_agent=user_agent,
            user_id=user_id,
            query_params=query_params,
            headers=headers,
            request_size=request_size,
            trace_id=trace_id or str(uuid.uuid4())[:8],
        )

    async def log(
        self,
        entry: AccessLogEntry,
        status_code: int,
        response_size: int = 0,
        error: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Complete and log an entry."""
        entry.status_code = status_code
        entry.response_size = response_size
        entry.duration_ms = (time.time() - entry.timestamp) * 1000
        entry.error = error
        if metadata:
            entry.metadata.update(metadata)

        # Apply filter
        if self._filter and not self._filter.should_log(entry):
            return

        # Store for stats
        with self._stats_lock:
            self._stats_entries.append(entry)
            if len(self._stats_entries) > self._max_stats_entries:
                self._stats_entries = self._stats_entries[-self._max_stats_entries:]

        # Write to all writers
        for writer in self._writers:
            try:
                await writer.write(entry)
            except Exception as e:
                logger.error("Log writer error: " + str(e))

    async def log_request(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        **kwargs: Any,
    ) -> AccessLogEntry:
        """Log a completed request."""
        entry = self.create_entry(method, path, **kwargs)
        entry.status_code = status_code
        entry.duration_ms = duration_ms

        if self._filter and not self._filter.should_log(entry):
            return entry

        with self._stats_lock:
            self._stats_entries.append(entry)
            if len(self._stats_entries) > self._max_stats_entries:
                self._stats_entries = self._stats_entries[-self._max_stats_entries:]

        for writer in self._writers:
            try:
                await writer.write(entry)
            except Exception as e:
                logger.error("Log writer error: " + str(e))

        return entry

    def get_stats(self, since: Optional[float] = None) -> AccessLogStats:
        """Get access log statistics."""
        with self._stats_lock:
            entries = self._stats_entries.copy()

        if since:
            entries = [e for e in entries if e.timestamp >= since]

        if not entries:
            return AccessLogStats()

        durations = sorted([e.duration_ms for e in entries])
        total = len(entries)

        by_status: Dict[int, int] = defaultdict(int)
        by_method: Dict[str, int] = defaultdict(int)
        by_path: Dict[str, int] = defaultdict(int)
        path_durations: Dict[str, List[float]] = defaultdict(list)

        error_count = 0

        for entry in entries:
            by_status[entry.status_code] += 1
            by_method[entry.method] += 1
            by_path[entry.path] += 1
            path_durations[entry.path].append(entry.duration_ms)
            if entry.is_error:
                error_count += 1

        slowest = sorted(
            [
                {
                    "path": path,
                    "avg_ms": sum(durs) / len(durs),
                    "count": len(durs),
                }
                for path, durs in path_durations.items()
            ],
            key=lambda x: x["avg_ms"],
            reverse=True,
        )

        def percentile(data: List[float], p: float) -> float:
            if not data:
                return 0
            idx = int(len(data) * p / 100)
            return data[min(idx, len(data) - 1)]

        return AccessLogStats(
            total_requests=total,
            error_count=error_count,
            avg_duration_ms=sum(durations) / total,
            p50_duration_ms=percentile(durations, 50),
            p95_duration_ms=percentile(durations, 95),
            p99_duration_ms=percentile(durations, 99),
            requests_by_status=dict(by_status),
            requests_by_method=dict(by_method),
            requests_by_path=dict(by_path),
            slowest_paths=slowest[:10],
        )

    async def flush(self) -> None:
        """Flush all writers."""
        for writer in self._writers:
            try:
                await writer.flush()
            except Exception as e:
                logger.error("Flush error: " + str(e))

    async def close(self) -> None:
        """Close all writers."""
        for writer in self._writers:
            try:
                await writer.close()
            except Exception as e:
                logger.error("Close error: " + str(e))


# FastAPI middleware helper
def create_access_log_middleware(access_logger: AccessLogger):
    """Create FastAPI middleware for access logging.

    Usage:
        logger = AccessLogger()
        app.middleware("http")(create_access_log_middleware(logger))
    """
    async def middleware(request: Any, call_next: Callable):
        entry = access_logger.create_entry(
            method=request.method,
            path=request.url.path,
            client_ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            query_params=dict(request.query_params),
        )

        try:
            response = await call_next(request)
            await access_logger.log(
                entry,
                status_code=response.status_code,
            )
            return response

        except Exception as e:
            await access_logger.log(
                entry,
                status_code=500,
                error=str(e),
            )
            raise

    return middleware


# Singleton
_logger: Optional[AccessLogger] = None


def get_access_logger() -> AccessLogger:
    """Get global access logger."""
    global _logger
    if not _logger:
        _logger = AccessLogger()
    return _logger


def configure_access_logger(
    writers: Optional[List[LogWriter]] = None,
    log_filter: Optional[AccessLogFilter] = None,
) -> AccessLogger:
    """Configure global access logger."""
    global _logger
    _logger = AccessLogger(writers=writers, log_filter=log_filter)
    return _logger
