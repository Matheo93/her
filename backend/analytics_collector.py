"""
Analytics Collector - Sprint 599

Collect and aggregate usage analytics.

Features:
- Event tracking
- Time series data
- Aggregation (hourly, daily)
- Top N queries
- Session analytics
"""

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from collections import defaultdict
from enum import Enum
from threading import Lock
import json


class EventType(str, Enum):
    """Types of trackable events."""
    MESSAGE = "message"
    TTS = "tts"
    STT = "stt"
    SESSION_START = "session_start"
    SESSION_END = "session_end"
    ERROR = "error"
    API_CALL = "api_call"
    VOICE_CHANGE = "voice_change"
    EMOTION_DETECT = "emotion_detect"


@dataclass
class AnalyticsEvent:
    """A single analytics event."""
    event_type: EventType
    timestamp: float = field(default_factory=time.time)
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    duration_ms: Optional[float] = None
    success: bool = True

    def to_dict(self) -> dict:
        return {
            "event_type": self.event_type.value,
            "timestamp": self.timestamp,
            "session_id": self.session_id,
            "user_id": self.user_id,
            "metadata": self.metadata,
            "duration_ms": self.duration_ms,
            "success": self.success
        }


@dataclass
class TimeSeriesPoint:
    """A point in a time series."""
    timestamp: float
    value: float
    count: int = 1


class AnalyticsCollector:
    """Collect and aggregate analytics.

    Usage:
        analytics = AnalyticsCollector()

        # Track event
        analytics.track(
            EventType.MESSAGE,
            session_id="sess_123",
            metadata={"text_length": 50}
        )

        # Get stats
        stats = analytics.get_summary()
    """

    def __init__(
        self,
        max_events: int = 10000,
        aggregation_interval: int = 3600,  # 1 hour
        retention_hours: int = 24
    ):
        """Initialize analytics collector.

        Args:
            max_events: Maximum events to store
            aggregation_interval: Interval for aggregation (seconds)
            retention_hours: Hours to retain data
        """
        self._events: List[AnalyticsEvent] = []
        self._max_events = max_events
        self._aggregation_interval = aggregation_interval
        self._retention_seconds = retention_hours * 3600
        self._lock = Lock()

        # Counters
        self._event_counts: Dict[str, int] = defaultdict(int)
        self._error_counts: Dict[str, int] = defaultdict(int)
        self._session_durations: List[float] = []
        self._latencies: Dict[str, List[float]] = defaultdict(list)

        # Hourly aggregates
        self._hourly_events: Dict[int, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._hourly_latencies: Dict[int, Dict[str, List[float]]] = defaultdict(lambda: defaultdict(list))

        # Top queries/phrases
        self._phrase_counts: Dict[str, int] = defaultdict(int)
        self._emotion_counts: Dict[str, int] = defaultdict(int)
        self._voice_usage: Dict[str, int] = defaultdict(int)

        # Real-time metrics
        self._active_sessions: set = set()
        self._messages_per_session: Dict[str, int] = defaultdict(int)

    def _get_hour_bucket(self, timestamp: float) -> int:
        """Get hourly bucket for a timestamp."""
        return int(timestamp // 3600) * 3600

    def track(
        self,
        event_type: EventType,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        duration_ms: Optional[float] = None,
        success: bool = True
    ) -> AnalyticsEvent:
        """Track an analytics event.

        Args:
            event_type: Type of event
            session_id: Optional session ID
            user_id: Optional user ID
            metadata: Additional event data
            duration_ms: Event duration in milliseconds
            success: Whether event was successful

        Returns:
            Created event
        """
        event = AnalyticsEvent(
            event_type=event_type,
            session_id=session_id,
            user_id=user_id,
            metadata=metadata or {},
            duration_ms=duration_ms,
            success=success
        )

        with self._lock:
            # Store event
            self._events.append(event)
            if len(self._events) > self._max_events:
                self._events = self._events[-self._max_events:]

            # Update counters
            self._event_counts[event_type.value] += 1

            if not success:
                error_type = metadata.get("error_type", "unknown") if metadata else "unknown"
                self._error_counts[error_type] += 1

            # Track latency
            if duration_ms is not None:
                self._latencies[event_type.value].append(duration_ms)
                if len(self._latencies[event_type.value]) > 1000:
                    self._latencies[event_type.value] = self._latencies[event_type.value][-1000:]

            # Hourly aggregation
            hour = self._get_hour_bucket(event.timestamp)
            self._hourly_events[hour][event_type.value] += 1
            if duration_ms is not None:
                self._hourly_latencies[hour][event_type.value].append(duration_ms)

            # Session tracking
            if session_id:
                if event_type == EventType.SESSION_START:
                    self._active_sessions.add(session_id)
                elif event_type == EventType.SESSION_END:
                    self._active_sessions.discard(session_id)
                    if "duration_seconds" in (metadata or {}):
                        self._session_durations.append(metadata["duration_seconds"])
                        if len(self._session_durations) > 500:
                            self._session_durations = self._session_durations[-500:]
                elif event_type == EventType.MESSAGE:
                    self._messages_per_session[session_id] += 1

            # Track phrases (for MESSAGE events)
            if event_type == EventType.MESSAGE and metadata:
                text = metadata.get("text", "")
                if text and len(text) > 3:
                    # Track first few words
                    words = text.lower().split()[:5]
                    phrase = " ".join(words)
                    self._phrase_counts[phrase] += 1

            # Track emotions
            if event_type == EventType.EMOTION_DETECT and metadata:
                emotion = metadata.get("emotion", "neutral")
                self._emotion_counts[emotion] += 1

            # Track voice usage
            if event_type == EventType.TTS and metadata:
                voice = metadata.get("voice", "default")
                self._voice_usage[voice] += 1

        return event

    def get_summary(self) -> Dict[str, Any]:
        """Get analytics summary."""
        with self._lock:
            # Calculate latency stats
            latency_stats = {}
            for event_type, latencies in self._latencies.items():
                if latencies:
                    sorted_l = sorted(latencies)
                    latency_stats[event_type] = {
                        "avg_ms": round(sum(latencies) / len(latencies), 1),
                        "p50_ms": round(sorted_l[len(sorted_l) // 2], 1),
                        "p95_ms": round(sorted_l[int(len(sorted_l) * 0.95)], 1) if len(sorted_l) > 20 else None,
                        "count": len(latencies)
                    }

            # Session stats
            avg_session_duration = (
                sum(self._session_durations) / len(self._session_durations)
                if self._session_durations else 0
            )
            avg_messages = (
                sum(self._messages_per_session.values()) / len(self._messages_per_session)
                if self._messages_per_session else 0
            )

            return {
                "event_counts": dict(self._event_counts),
                "error_counts": dict(self._error_counts),
                "latency_stats": latency_stats,
                "active_sessions": len(self._active_sessions),
                "total_sessions": len(self._messages_per_session),
                "avg_session_duration_seconds": round(avg_session_duration, 1),
                "avg_messages_per_session": round(avg_messages, 1),
                "top_emotions": dict(sorted(
                    self._emotion_counts.items(),
                    key=lambda x: x[1],
                    reverse=True
                )[:10]),
                "voice_usage": dict(self._voice_usage),
            }

    def get_hourly_stats(self, hours: int = 24) -> List[Dict[str, Any]]:
        """Get hourly statistics.

        Args:
            hours: Number of hours to return

        Returns:
            List of hourly stats
        """
        now = time.time()
        result = []

        with self._lock:
            for i in range(hours):
                hour = self._get_hour_bucket(now - i * 3600)
                events = dict(self._hourly_events.get(hour, {}))
                latencies = {}

                for event_type, lats in self._hourly_latencies.get(hour, {}).items():
                    if lats:
                        latencies[event_type] = round(sum(lats) / len(lats), 1)

                result.append({
                    "hour": hour,
                    "hour_str": time.strftime("%Y-%m-%d %H:00", time.localtime(hour)),
                    "events": events,
                    "avg_latencies_ms": latencies,
                    "total_events": sum(events.values())
                })

        return result

    def get_top_phrases(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get most common phrases.

        Args:
            limit: Maximum phrases to return

        Returns:
            List of phrase counts
        """
        with self._lock:
            sorted_phrases = sorted(
                self._phrase_counts.items(),
                key=lambda x: x[1],
                reverse=True
            )[:limit]
            return [{"phrase": p, "count": c} for p, c in sorted_phrases]

    def get_recent_events(
        self,
        event_type: Optional[EventType] = None,
        session_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get recent events with optional filters.

        Args:
            event_type: Filter by event type
            session_id: Filter by session
            limit: Maximum events to return

        Returns:
            List of events
        """
        with self._lock:
            events = self._events.copy()

        # Apply filters
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        if session_id:
            events = [e for e in events if e.session_id == session_id]

        # Return most recent
        return [e.to_dict() for e in events[-limit:]]

    def get_error_summary(self) -> Dict[str, Any]:
        """Get error statistics."""
        with self._lock:
            # Recent errors
            recent_errors = [
                e for e in self._events
                if not e.success or e.event_type == EventType.ERROR
            ][-50:]

            return {
                "error_counts": dict(self._error_counts),
                "total_errors": sum(self._error_counts.values()),
                "recent_errors": [e.to_dict() for e in recent_errors],
                "error_rate": self._calculate_error_rate()
            }

    def _calculate_error_rate(self) -> float:
        """Calculate overall error rate."""
        total_events = sum(self._event_counts.values())
        total_errors = sum(self._error_counts.values())
        if total_events == 0:
            return 0.0
        return round(total_errors / total_events * 100, 2)

    def get_session_stats(self, session_id: str) -> Dict[str, Any]:
        """Get statistics for a specific session.

        Args:
            session_id: Session identifier

        Returns:
            Session statistics
        """
        with self._lock:
            session_events = [
                e for e in self._events
                if e.session_id == session_id
            ]

            if not session_events:
                return {"status": "not_found"}

            event_counts = defaultdict(int)
            total_latency = 0
            latency_count = 0

            for event in session_events:
                event_counts[event.event_type.value] += 1
                if event.duration_ms:
                    total_latency += event.duration_ms
                    latency_count += 1

            start_time = session_events[0].timestamp
            end_time = session_events[-1].timestamp

            return {
                "session_id": session_id,
                "event_counts": dict(event_counts),
                "total_events": len(session_events),
                "start_time": start_time,
                "duration_seconds": round(end_time - start_time, 1),
                "avg_latency_ms": round(total_latency / latency_count, 1) if latency_count else None,
                "message_count": self._messages_per_session.get(session_id, 0)
            }

    def cleanup_old_data(self) -> int:
        """Remove old data beyond retention period.

        Returns:
            Number of events removed
        """
        now = time.time()
        cutoff = now - self._retention_seconds

        with self._lock:
            original_count = len(self._events)
            self._events = [e for e in self._events if e.timestamp > cutoff]

            # Clean old hourly buckets
            old_hours = [h for h in self._hourly_events if h < cutoff]
            for h in old_hours:
                del self._hourly_events[h]
                if h in self._hourly_latencies:
                    del self._hourly_latencies[h]

            return original_count - len(self._events)

    def reset(self):
        """Reset all analytics data."""
        with self._lock:
            self._events.clear()
            self._event_counts.clear()
            self._error_counts.clear()
            self._session_durations.clear()
            self._latencies.clear()
            self._hourly_events.clear()
            self._hourly_latencies.clear()
            self._phrase_counts.clear()
            self._emotion_counts.clear()
            self._voice_usage.clear()
            self._active_sessions.clear()
            self._messages_per_session.clear()


# Singleton instance
analytics = AnalyticsCollector(
    max_events=10000,
    aggregation_interval=3600,
    retention_hours=24
)
