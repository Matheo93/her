"""
Session Manager - Sprint 595

Manage user sessions with persistence and lifecycle.

Features:
- Session creation/destruction
- Session timeout handling
- User association
- Session metadata
- Activity tracking
"""

import time
import asyncio
import json
import os
from dataclasses import dataclass, field, asdict
from typing import Dict, Optional, List, Any
from collections import defaultdict
from threading import Lock
from enum import Enum


class SessionState(str, Enum):
    """Session state."""
    ACTIVE = "active"
    IDLE = "idle"
    EXPIRED = "expired"
    TERMINATED = "terminated"


@dataclass
class Session:
    """User session."""
    session_id: str
    user_id: Optional[str] = None
    state: SessionState = SessionState.ACTIVE
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    expires_at: Optional[float] = None
    message_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    device_info: Optional[str] = None
    ip_address: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "state": self.state.value,
            "created_at": self.created_at,
            "last_activity": self.last_activity,
            "expires_at": self.expires_at,
            "message_count": self.message_count,
            "metadata": self.metadata,
            "device_info": self.device_info,
            "duration_seconds": round(time.time() - self.created_at, 1),
            "idle_seconds": round(time.time() - self.last_activity, 1),
        }


@dataclass
class SessionStats:
    """Session statistics."""
    total_created: int = 0
    total_expired: int = 0
    total_terminated: int = 0
    active_sessions: int = 0
    peak_concurrent: int = 0
    avg_duration_seconds: float = 0
    total_messages: int = 0


class SessionManager:
    """Manage user sessions.

    Usage:
        manager = SessionManager()

        # Create session
        session = manager.create_session(user_id="user123")

        # Update activity
        manager.touch(session.session_id)

        # Get session
        session = manager.get_session(session_id)

        # End session
        manager.terminate(session_id)
    """

    def __init__(
        self,
        default_timeout: int = 1800,  # 30 minutes
        max_sessions_per_user: int = 5,
        cleanup_interval: int = 300,  # 5 minutes
        storage_path: Optional[str] = None
    ):
        """Initialize session manager.

        Args:
            default_timeout: Session timeout in seconds
            max_sessions_per_user: Max concurrent sessions per user
            cleanup_interval: Interval for cleanup task
            storage_path: Path for session persistence
        """
        self._sessions: Dict[str, Session] = {}
        self._user_sessions: Dict[str, List[str]] = defaultdict(list)
        self._lock = Lock()
        self._default_timeout = default_timeout
        self._max_sessions_per_user = max_sessions_per_user
        self._cleanup_interval = cleanup_interval
        self._storage_path = storage_path
        self._stats = SessionStats()
        self._session_counter = 0
        self._closed_sessions: List[float] = []  # Track durations

        if storage_path:
            os.makedirs(storage_path, exist_ok=True)
            self._load_sessions()

    def _generate_session_id(self) -> str:
        """Generate unique session ID."""
        self._session_counter += 1
        return f"sess_{int(time.time() * 1000) % 10000000:07d}_{self._session_counter:05d}"

    def create_session(
        self,
        user_id: Optional[str] = None,
        timeout: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
        device_info: Optional[str] = None,
        ip_address: Optional[str] = None
    ) -> Session:
        """Create a new session.

        Args:
            user_id: Optional user identifier
            timeout: Custom timeout in seconds
            metadata: Additional session metadata
            device_info: Device information string
            ip_address: Client IP address

        Returns:
            Created session
        """
        session_id = self._generate_session_id()
        now = time.time()
        timeout_seconds = timeout or self._default_timeout

        session = Session(
            session_id=session_id,
            user_id=user_id,
            created_at=now,
            last_activity=now,
            expires_at=now + timeout_seconds,
            metadata=metadata or {},
            device_info=device_info,
            ip_address=ip_address
        )

        with self._lock:
            # Enforce max sessions per user
            if user_id:
                user_sessions = self._user_sessions[user_id]
                while len(user_sessions) >= self._max_sessions_per_user:
                    # Remove oldest session
                    oldest_id = user_sessions.pop(0)
                    if oldest_id in self._sessions:
                        self._terminate_session(oldest_id, SessionState.TERMINATED)

                user_sessions.append(session_id)

            self._sessions[session_id] = session
            self._stats.total_created += 1
            self._stats.active_sessions = len(self._sessions)
            self._stats.peak_concurrent = max(
                self._stats.peak_concurrent,
                self._stats.active_sessions
            )

        return session

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get session by ID.

        Args:
            session_id: Session identifier

        Returns:
            Session or None if not found/expired
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None

            # Check expiration
            if session.expires_at and time.time() > session.expires_at:
                self._terminate_session(session_id, SessionState.EXPIRED)
                return None

            return session

    def touch(self, session_id: str) -> bool:
        """Update session activity timestamp.

        Args:
            session_id: Session identifier

        Returns:
            True if session exists and was updated
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return False

            now = time.time()
            session.last_activity = now
            session.state = SessionState.ACTIVE

            # Extend expiration
            if session.expires_at:
                session.expires_at = now + self._default_timeout

            return True

    def record_message(self, session_id: str) -> bool:
        """Record a message in the session.

        Args:
            session_id: Session identifier

        Returns:
            True if session exists
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return False

            session.message_count += 1
            session.last_activity = time.time()
            self._stats.total_messages += 1
            return True

    def set_metadata(self, session_id: str, key: str, value: Any) -> bool:
        """Set session metadata.

        Args:
            session_id: Session identifier
            key: Metadata key
            value: Metadata value

        Returns:
            True if session exists
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return False

            session.metadata[key] = value
            return True

    def terminate(self, session_id: str) -> bool:
        """Terminate a session.

        Args:
            session_id: Session identifier

        Returns:
            True if session was terminated
        """
        with self._lock:
            return self._terminate_session(session_id, SessionState.TERMINATED)

    def _terminate_session(self, session_id: str, state: SessionState) -> bool:
        """Internal terminate with state."""
        session = self._sessions.get(session_id)
        if not session:
            return False

        # Track duration for stats
        duration = time.time() - session.created_at
        self._closed_sessions.append(duration)
        if len(self._closed_sessions) > 100:
            self._closed_sessions = self._closed_sessions[-100:]

        # Update stats
        if state == SessionState.EXPIRED:
            self._stats.total_expired += 1
        else:
            self._stats.total_terminated += 1

        # Remove from user sessions
        if session.user_id:
            user_sessions = self._user_sessions.get(session.user_id, [])
            if session_id in user_sessions:
                user_sessions.remove(session_id)

        # Remove session
        del self._sessions[session_id]
        self._stats.active_sessions = len(self._sessions)

        return True

    def get_user_sessions(self, user_id: str) -> List[Session]:
        """Get all sessions for a user.

        Args:
            user_id: User identifier

        Returns:
            List of user's sessions
        """
        with self._lock:
            session_ids = self._user_sessions.get(user_id, [])
            return [
                self._sessions[sid]
                for sid in session_ids
                if sid in self._sessions
            ]

    def cleanup_expired(self) -> int:
        """Clean up expired sessions.

        Returns:
            Number of sessions cleaned up
        """
        now = time.time()
        expired = []

        with self._lock:
            for session_id, session in self._sessions.items():
                if session.expires_at and now > session.expires_at:
                    expired.append(session_id)

            for session_id in expired:
                self._terminate_session(session_id, SessionState.EXPIRED)

        return len(expired)

    def get_stats(self) -> Dict[str, Any]:
        """Get session statistics."""
        with self._lock:
            avg_duration = (
                sum(self._closed_sessions) / len(self._closed_sessions)
                if self._closed_sessions else 0
            )

            return {
                "total_created": self._stats.total_created,
                "total_expired": self._stats.total_expired,
                "total_terminated": self._stats.total_terminated,
                "active_sessions": self._stats.active_sessions,
                "peak_concurrent": self._stats.peak_concurrent,
                "avg_duration_seconds": round(avg_duration, 1),
                "total_messages": self._stats.total_messages,
                "unique_users": len(self._user_sessions),
            }

    def get_all_sessions(self) -> List[Dict[str, Any]]:
        """Get all active sessions."""
        with self._lock:
            return [s.to_dict() for s in self._sessions.values()]

    def _load_sessions(self):
        """Load sessions from disk."""
        if not self._storage_path:
            return

        sessions_file = os.path.join(self._storage_path, "sessions.json")
        if not os.path.exists(sessions_file):
            return

        try:
            with open(sessions_file, "r") as f:
                data = json.load(f)

            now = time.time()
            for session_data in data.get("sessions", []):
                # Skip expired sessions
                if session_data.get("expires_at", 0) < now:
                    continue

                session = Session(
                    session_id=session_data["session_id"],
                    user_id=session_data.get("user_id"),
                    state=SessionState(session_data.get("state", "active")),
                    created_at=session_data["created_at"],
                    last_activity=session_data["last_activity"],
                    expires_at=session_data.get("expires_at"),
                    message_count=session_data.get("message_count", 0),
                    metadata=session_data.get("metadata", {}),
                )
                self._sessions[session.session_id] = session

                if session.user_id:
                    self._user_sessions[session.user_id].append(session.session_id)

            print(f"✅ Loaded {len(self._sessions)} sessions from disk")
        except Exception as e:
            print(f"⚠️ Failed to load sessions: {e}")

    async def save_sessions(self):
        """Save sessions to disk."""
        if not self._storage_path:
            return

        sessions_file = os.path.join(self._storage_path, "sessions.json")
        try:
            with self._lock:
                data = {
                    "sessions": [s.to_dict() for s in self._sessions.values()],
                    "saved_at": time.time(),
                }

            with open(sessions_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"⚠️ Failed to save sessions: {e}")


# Singleton instance
session_manager = SessionManager(
    default_timeout=1800,  # 30 minutes
    max_sessions_per_user=5,
)
