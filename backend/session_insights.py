"""
Session Insights - Sprint 577

Real-time session analytics and conversation quality metrics.

Features:
- Per-session tracking (message count, duration, emotions)
- Response quality scoring (based on length, latency, emotion match)
- Engagement metrics (response rate, conversation depth)
- Session summaries for debugging and improvement

Target: Help identify issues and improve EVA's conversational quality.
"""

import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional, Any
from enum import Enum


class ConversationQuality(Enum):
    """Quality levels for conversation assessment."""
    EXCELLENT = "excellent"  # Deep, engaging, emotional
    GOOD = "good"           # Normal conversation flow
    FAIR = "fair"           # Short exchanges, limited engagement
    POOR = "poor"           # Very short, disconnected, or errors


@dataclass
class MessageMetrics:
    """Metrics for a single message exchange."""
    timestamp: float
    user_message_length: int
    response_length: int
    response_latency_ms: float
    detected_emotion: str = "neutral"
    emotion_confidence: float = 0.0
    was_cached: bool = False
    tts_latency_ms: float = 0.0
    error: Optional[str] = None


@dataclass
class SessionMetrics:
    """Metrics for a user session."""
    session_id: str
    start_time: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    message_count: int = 0
    total_user_chars: int = 0
    total_response_chars: int = 0
    emotions_detected: dict = field(default_factory=lambda: defaultdict(int))
    avg_response_latency_ms: float = 0.0
    avg_tts_latency_ms: float = 0.0
    cache_hit_rate: float = 0.0
    errors: list = field(default_factory=list)

    # Quality indicators
    engagement_score: float = 0.0  # 0-100
    quality: ConversationQuality = ConversationQuality.FAIR

    def __post_init__(self):
        self._latencies: list[float] = []
        self._tts_latencies: list[float] = []
        self._cache_hits: int = 0
        self._cache_misses: int = 0


class SessionInsights:
    """Track and analyze session metrics in real-time.

    Usage:
        insights = SessionInsights()

        # Record a message exchange
        insights.record_exchange(
            session_id="user123",
            user_message="Salut!",
            response="Hey! Comment tu vas?",
            latency_ms=150,
            emotion="joy"
        )

        # Get session summary
        summary = insights.get_session_summary("user123")
    """

    def __init__(self, max_sessions: int = 1000, session_timeout: int = 3600):
        """Initialize session insights tracker.

        Args:
            max_sessions: Maximum concurrent sessions to track
            session_timeout: Session timeout in seconds (1 hour default)
        """
        self.max_sessions = max_sessions
        self.session_timeout = session_timeout
        self.sessions: dict[str, SessionMetrics] = {}
        self.global_stats = {
            "total_sessions": 0,
            "total_messages": 0,
            "total_errors": 0,
            "avg_session_duration_min": 0.0,
            "emotion_distribution": defaultdict(int),
        }
        self._session_durations: list[float] = []

    def _get_or_create_session(self, session_id: str) -> SessionMetrics:
        """Get existing session or create new one."""
        if session_id not in self.sessions:
            # Evict oldest if at capacity
            if len(self.sessions) >= self.max_sessions:
                self._evict_oldest_session()

            self.sessions[session_id] = SessionMetrics(session_id=session_id)
            self.global_stats["total_sessions"] += 1

        return self.sessions[session_id]

    def _evict_oldest_session(self) -> None:
        """Evict the least recently active session."""
        if not self.sessions:
            return

        oldest_id = min(self.sessions.keys(), key=lambda k: self.sessions[k].last_activity)
        old_session = self.sessions.pop(oldest_id)

        # Record session duration for stats
        duration = old_session.last_activity - old_session.start_time
        self._session_durations.append(duration)
        if len(self._session_durations) > 100:
            self._session_durations.pop(0)

        # Update global avg duration
        if self._session_durations:
            self.global_stats["avg_session_duration_min"] = round(
                sum(self._session_durations) / len(self._session_durations) / 60, 2
            )

    def record_exchange(
        self,
        session_id: str,
        user_message: str,
        response: str,
        latency_ms: float,
        emotion: str = "neutral",
        emotion_confidence: float = 0.0,
        was_cached: bool = False,
        tts_latency_ms: float = 0.0,
        error: Optional[str] = None,
    ) -> None:
        """Record a message exchange for a session.

        Args:
            session_id: Unique session identifier
            user_message: User's input message
            response: EVA's response
            latency_ms: Response generation latency
            emotion: Detected emotion in response
            emotion_confidence: Confidence of emotion detection
            was_cached: Whether response came from cache
            tts_latency_ms: TTS generation latency
            error: Error message if any
        """
        session = self._get_or_create_session(session_id)
        now = time.time()

        # Update basic counters
        session.message_count += 1
        session.total_user_chars += len(user_message)
        session.total_response_chars += len(response)
        session.last_activity = now

        # Track latencies
        session._latencies.append(latency_ms)
        if len(session._latencies) > 100:
            session._latencies.pop(0)
        session.avg_response_latency_ms = sum(session._latencies) / len(session._latencies)

        # Track TTS latency
        if tts_latency_ms > 0:
            session._tts_latencies.append(tts_latency_ms)
            if len(session._tts_latencies) > 100:
                session._tts_latencies.pop(0)
            session.avg_tts_latency_ms = sum(session._tts_latencies) / len(session._tts_latencies)

        # Track cache hits
        if was_cached:
            session._cache_hits += 1
        else:
            session._cache_misses += 1
        total_cache = session._cache_hits + session._cache_misses
        session.cache_hit_rate = session._cache_hits / total_cache if total_cache > 0 else 0

        # Track emotions
        session.emotions_detected[emotion] += 1
        self.global_stats["emotion_distribution"][emotion] += 1

        # Track errors
        if error:
            session.errors.append({"time": now, "error": error})
            self.global_stats["total_errors"] += 1

        # Update global stats
        self.global_stats["total_messages"] += 1

        # Calculate quality metrics
        self._update_quality_metrics(session)

    def _update_quality_metrics(self, session: SessionMetrics) -> None:
        """Update session quality metrics based on conversation patterns."""
        # Engagement score (0-100)
        # Based on: message count, avg message length, emotion variety

        msg_score = min(session.message_count * 5, 30)  # Up to 30 points for 6+ messages

        avg_user_len = session.total_user_chars / session.message_count if session.message_count > 0 else 0
        len_score = min(avg_user_len / 5, 30)  # Up to 30 points for avg 150+ chars

        emotion_variety = len(session.emotions_detected)
        emotion_score = min(emotion_variety * 10, 20)  # Up to 20 points for 2+ emotions

        # Latency penalty
        latency_penalty = max(0, (session.avg_response_latency_ms - 300) / 100)  # Penalty above 300ms
        latency_penalty = min(latency_penalty, 20)  # Max 20 point penalty

        # Error penalty
        error_penalty = min(len(session.errors) * 5, 20)  # 5 points per error, max 20

        session.engagement_score = max(0, min(100,
            msg_score + len_score + emotion_score - latency_penalty - error_penalty
        ))

        # Determine quality level
        if session.engagement_score >= 70:
            session.quality = ConversationQuality.EXCELLENT
        elif session.engagement_score >= 50:
            session.quality = ConversationQuality.GOOD
        elif session.engagement_score >= 30:
            session.quality = ConversationQuality.FAIR
        else:
            session.quality = ConversationQuality.POOR

    def get_session_summary(self, session_id: str) -> Optional[dict]:
        """Get summary for a specific session."""
        if session_id not in self.sessions:
            return None

        session = self.sessions[session_id]
        duration = session.last_activity - session.start_time

        # Find dominant emotion
        dominant_emotion = "neutral"
        if session.emotions_detected:
            dominant_emotion = max(session.emotions_detected.keys(),
                                   key=lambda k: session.emotions_detected[k])

        return {
            "session_id": session_id,
            "duration_minutes": round(duration / 60, 2),
            "message_count": session.message_count,
            "avg_user_message_length": round(session.total_user_chars / session.message_count, 1) if session.message_count > 0 else 0,
            "avg_response_length": round(session.total_response_chars / session.message_count, 1) if session.message_count > 0 else 0,
            "avg_response_latency_ms": round(session.avg_response_latency_ms, 2),
            "avg_tts_latency_ms": round(session.avg_tts_latency_ms, 2),
            "cache_hit_rate_percent": round(session.cache_hit_rate * 100, 1),
            "emotions_detected": dict(session.emotions_detected),
            "dominant_emotion": dominant_emotion,
            "engagement_score": round(session.engagement_score, 1),
            "quality": session.quality.value,
            "error_count": len(session.errors),
        }

    def get_global_stats(self) -> dict:
        """Get global statistics across all sessions."""
        active_sessions = len(self.sessions)

        # Calculate quality distribution
        quality_dist = defaultdict(int)
        avg_engagement = 0
        if self.sessions:
            for s in self.sessions.values():
                quality_dist[s.quality.value] += 1
                avg_engagement += s.engagement_score
            avg_engagement /= len(self.sessions)

        return {
            "active_sessions": active_sessions,
            "total_sessions_ever": self.global_stats["total_sessions"],
            "total_messages": self.global_stats["total_messages"],
            "total_errors": self.global_stats["total_errors"],
            "avg_session_duration_min": self.global_stats["avg_session_duration_min"],
            "emotion_distribution": dict(self.global_stats["emotion_distribution"]),
            "quality_distribution": dict(quality_dist),
            "avg_engagement_score": round(avg_engagement, 1),
            "messages_per_session": round(
                self.global_stats["total_messages"] / self.global_stats["total_sessions"], 2
            ) if self.global_stats["total_sessions"] > 0 else 0,
        }

    def cleanup_stale_sessions(self) -> int:
        """Remove sessions that have been inactive beyond timeout.

        Returns:
            Number of sessions cleaned up.
        """
        now = time.time()
        stale_ids = [
            sid for sid, session in self.sessions.items()
            if now - session.last_activity > self.session_timeout
        ]

        for sid in stale_ids:
            old_session = self.sessions.pop(sid)
            duration = old_session.last_activity - old_session.start_time
            self._session_durations.append(duration)

        return len(stale_ids)


# Singleton instance
session_insights = SessionInsights(max_sessions=1000, session_timeout=3600)
