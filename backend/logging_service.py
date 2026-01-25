"""
Logging Service - Sprint 603

Structured logging with levels and contexts.

Features:
- Multiple log levels
- Structured JSON output
- Context enrichment
- Request tracing
- Log rotation
"""

import time
import json
import os
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, List, Callable
from enum import IntEnum
from threading import Lock
from datetime import datetime
import traceback


class LogLevel(IntEnum):
    """Log severity levels."""
    DEBUG = 10
    INFO = 20
    WARN = 30
    ERROR = 40
    CRITICAL = 50


@dataclass
class LogEntry:
    """A single log entry."""
    level: LogLevel
    message: str
    timestamp: float = field(default_factory=time.time)
    logger_name: str = "default"
    context: Dict[str, Any] = field(default_factory=dict)
    trace_id: Optional[str] = None
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    duration_ms: Optional[float] = None
    error: Optional[str] = None
    stack_trace: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "level": self.level.name,
            "level_value": self.level.value,
            "message": self.message,
            "timestamp": self.timestamp,
            "timestamp_iso": datetime.fromtimestamp(self.timestamp).isoformat(),
            "logger": self.logger_name,
            "context": self.context,
            "trace_id": self.trace_id,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "duration_ms": self.duration_ms,
            "error": self.error,
            "stack_trace": self.stack_trace,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    def format_console(self) -> str:
        """Format for console output."""
        ts = datetime.fromtimestamp(self.timestamp).strftime("%H:%M:%S")
        level = self.level.name.ljust(8)
        name = self.logger_name[:20].ljust(20)

        line = f"[{ts}] {level} {name} | {self.message}"

        if self.trace_id:
            line += f" [trace:{self.trace_id[:8]}]"
        if self.duration_ms:
            line += f" ({self.duration_ms:.1f}ms)"
        if self.error:
            line += f" ERROR: {self.error}"

        return line


class Logger:
    """Named logger instance.

    Usage:
        log = logging_service.get_logger("api.chat")
        log.info("Processing message", message_id="123")
        log.error("Failed", error=str(e))
    """

    def __init__(
        self,
        name: str,
        service: "LoggingService",
        default_context: Optional[Dict[str, Any]] = None
    ):
        self._name = name
        self._service = service
        self._default_context = default_context or {}

    def _log(
        self,
        level: LogLevel,
        message: str,
        **kwargs
    ):
        """Internal log method."""
        context = {**self._default_context}

        # Extract special fields
        trace_id = kwargs.pop("trace_id", None)
        session_id = kwargs.pop("session_id", None)
        user_id = kwargs.pop("user_id", None)
        duration_ms = kwargs.pop("duration_ms", None)
        error = kwargs.pop("error", None)
        exc = kwargs.pop("exc", None)

        # Remaining kwargs go to context
        context.update(kwargs)

        stack_trace = None
        if exc:
            error = str(exc)
            stack_trace = traceback.format_exc()

        entry = LogEntry(
            level=level,
            message=message,
            logger_name=self._name,
            context=context if context else {},
            trace_id=trace_id,
            session_id=session_id,
            user_id=user_id,
            duration_ms=duration_ms,
            error=error,
            stack_trace=stack_trace,
        )

        self._service._emit(entry)

    def debug(self, message: str, **kwargs):
        """Log debug message."""
        self._log(LogLevel.DEBUG, message, **kwargs)

    def info(self, message: str, **kwargs):
        """Log info message."""
        self._log(LogLevel.INFO, message, **kwargs)

    def warn(self, message: str, **kwargs):
        """Log warning message."""
        self._log(LogLevel.WARN, message, **kwargs)

    def error(self, message: str, **kwargs):
        """Log error message."""
        self._log(LogLevel.ERROR, message, **kwargs)

    def critical(self, message: str, **kwargs):
        """Log critical message."""
        self._log(LogLevel.CRITICAL, message, **kwargs)

    def with_context(self, **kwargs) -> "Logger":
        """Create child logger with additional context."""
        new_context = {**self._default_context, **kwargs}
        return Logger(self._name, self._service, new_context)


class LoggingService:
    """Central logging service.

    Usage:
        service = LoggingService()

        # Get logger
        log = service.get_logger("module.name")
        log.info("Hello", key="value")

        # Query logs
        recent = service.query(level=LogLevel.ERROR, limit=100)
    """

    def __init__(
        self,
        min_level: LogLevel = LogLevel.INFO,
        max_entries: int = 5000,
        console_output: bool = True,
        json_output: bool = False,
        file_path: Optional[str] = None
    ):
        """Initialize logging service.

        Args:
            min_level: Minimum log level to record
            max_entries: Maximum entries to keep in memory
            console_output: Print to console
            json_output: Use JSON format for console
            file_path: Optional file for log persistence
        """
        self._min_level = min_level
        self._max_entries = max_entries
        self._console_output = console_output
        self._json_output = json_output
        self._file_path = file_path
        self._entries: List[LogEntry] = []
        self._loggers: Dict[str, Logger] = {}
        self._handlers: List[Callable[[LogEntry], None]] = []
        self._lock = Lock()

        # Stats
        self._level_counts: Dict[str, int] = {level.name: 0 for level in LogLevel}
        self._logger_counts: Dict[str, int] = {}

        # Open file if specified
        self._file = None
        if file_path:
            os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
            self._file = open(file_path, "a")

    def get_logger(
        self,
        name: str,
        **default_context
    ) -> Logger:
        """Get or create a named logger.

        Args:
            name: Logger name (e.g., "api.chat")
            **default_context: Default context for all logs

        Returns:
            Logger instance
        """
        if name not in self._loggers:
            self._loggers[name] = Logger(name, self, default_context or {})
        return self._loggers[name]

    def add_handler(self, handler: Callable[[LogEntry], None]):
        """Add custom log handler.

        Args:
            handler: Function called for each log entry
        """
        self._handlers.append(handler)

    def set_level(self, level: LogLevel):
        """Set minimum log level.

        Args:
            level: New minimum level
        """
        self._min_level = level

    def _emit(self, entry: LogEntry):
        """Emit a log entry."""
        if entry.level < self._min_level:
            return

        with self._lock:
            # Store entry
            self._entries.append(entry)
            if len(self._entries) > self._max_entries:
                self._entries = self._entries[-self._max_entries:]

            # Update stats
            self._level_counts[entry.level.name] += 1
            self._logger_counts[entry.logger_name] = (
                self._logger_counts.get(entry.logger_name, 0) + 1
            )

        # Console output
        if self._console_output:
            if self._json_output:
                print(entry.to_json())
            else:
                # Color codes for terminal
                colors = {
                    LogLevel.DEBUG: "\033[90m",    # Gray
                    LogLevel.INFO: "\033[0m",      # Default
                    LogLevel.WARN: "\033[93m",     # Yellow
                    LogLevel.ERROR: "\033[91m",    # Red
                    LogLevel.CRITICAL: "\033[95m", # Magenta
                }
                reset = "\033[0m"
                color = colors.get(entry.level, "")
                print(f"{color}{entry.format_console()}{reset}")

        # File output
        if self._file:
            self._file.write(entry.to_json() + "\n")
            self._file.flush()

        # Custom handlers
        for handler in self._handlers:
            try:
                handler(entry)
            except Exception:
                pass

    def query(
        self,
        level: Optional[LogLevel] = None,
        logger_name: Optional[str] = None,
        trace_id: Optional[str] = None,
        session_id: Optional[str] = None,
        since: Optional[float] = None,
        until: Optional[float] = None,
        search: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Query log entries.

        Args:
            level: Filter by minimum level
            logger_name: Filter by logger name
            trace_id: Filter by trace ID
            session_id: Filter by session ID
            since: Filter by start timestamp
            until: Filter by end timestamp
            search: Search in message
            limit: Maximum entries to return

        Returns:
            List of matching log entries
        """
        with self._lock:
            entries = self._entries.copy()

        # Apply filters
        if level:
            entries = [e for e in entries if e.level >= level]
        if logger_name:
            entries = [e for e in entries if e.logger_name.startswith(logger_name)]
        if trace_id:
            entries = [e for e in entries if e.trace_id == trace_id]
        if session_id:
            entries = [e for e in entries if e.session_id == session_id]
        if since:
            entries = [e for e in entries if e.timestamp >= since]
        if until:
            entries = [e for e in entries if e.timestamp <= until]
        if search:
            search_lower = search.lower()
            entries = [e for e in entries if search_lower in e.message.lower()]

        # Return most recent
        return [e.to_dict() for e in entries[-limit:]]

    def get_stats(self) -> Dict[str, Any]:
        """Get logging statistics."""
        with self._lock:
            return {
                "total_entries": len(self._entries),
                "level_counts": dict(self._level_counts),
                "logger_counts": dict(self._logger_counts),
                "min_level": self._min_level.name,
                "max_entries": self._max_entries,
            }

    def get_recent_errors(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent error and critical entries."""
        return self.query(level=LogLevel.ERROR, limit=limit)

    def clear(self):
        """Clear all log entries."""
        with self._lock:
            self._entries.clear()
            self._level_counts = {level.name: 0 for level in LogLevel}
            self._logger_counts.clear()

    def close(self):
        """Close file handle."""
        if self._file:
            self._file.close()
            self._file = None


# Singleton instance
logging_service = LoggingService(
    min_level=LogLevel.INFO,
    max_entries=5000,
    console_output=True,
    json_output=False
)

# Convenience function
def get_logger(name: str, **kwargs) -> Logger:
    """Get a logger instance."""
    return logging_service.get_logger(name, **kwargs)
