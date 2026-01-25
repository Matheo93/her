"""
Session Store - Sprint 617

Manage user sessions with expiration and data storage.

Features:
- Session creation/validation
- Data storage per session
- Automatic expiration
- Session renewal
- Activity tracking
"""

import time
import uuid
import hashlib
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, List
from threading import Lock


@dataclass
class Session:
    """A user session."""
    id: str
    user_id: Optional[str] = None
    data: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    expires_at: float = field(default_factory=lambda: time.time() + 3600)
    last_activity: float = field(default_factory=time.time)
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    is_authenticated: bool = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "data": self.data,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
            "last_activity": self.last_activity,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "is_authenticated": self.is_authenticated,
            "is_expired": self.is_expired,
            "remaining_seconds": max(0, self.expires_at - time.time()),
        }

    @property
    def is_expired(self) -> bool:
        """Check if session has expired."""
        return time.time() > self.expires_at


class SessionStore:
    """Manage sessions.

    Usage:
        store = SessionStore()

        # Create a session
        session = store.create()

        # Validate session
        session = store.get(session_id)

        # Store data
        store.set_data(session_id, "key", "value")

        # Authenticate user
        store.authenticate(session_id, user_id="user123")
    """

    def __init__(
        self,
        default_ttl: int = 3600,
        max_sessions_per_user: int = 5,
        cleanup_interval: int = 300
    ):
        """Initialize session store.

        Args:
            default_ttl: Default session TTL in seconds
            max_sessions_per_user: Max sessions per user
            cleanup_interval: Cleanup interval in seconds
        """
        self._sessions: Dict[str, Session] = {}
        self._user_sessions: Dict[str, List[str]] = {}  # user_id -> session_ids
        self._lock = Lock()
        self._default_ttl = default_ttl
        self._max_sessions_per_user = max_sessions_per_user
        self._last_cleanup = time.time()
        self._cleanup_interval = cleanup_interval

    def _generate_session_id(self) -> str:
        """Generate a unique session ID."""
        random_bytes = uuid.uuid4().bytes + str(time.time()).encode()
        return hashlib.sha256(random_bytes).hexdigest()[:32]

    def _maybe_cleanup(self):
        """Run cleanup if interval has passed."""
        now = time.time()
        if now - self._last_cleanup > self._cleanup_interval:
            self._cleanup_expired()
            self._last_cleanup = now

    def _cleanup_expired(self):
        """Remove expired sessions."""
        expired_ids = [
            sid for sid, session in self._sessions.items()
            if session.is_expired
        ]
        for sid in expired_ids:
            session = self._sessions.pop(sid, None)
            if session and session.user_id:
                user_sessions = self._user_sessions.get(session.user_id, [])
                if sid in user_sessions:
                    user_sessions.remove(sid)

    def create(
        self,
        user_id: Optional[str] = None,
        ttl: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None
    ) -> Session:
        """Create a new session.

        Args:
            user_id: Optional user ID
            ttl: Session TTL in seconds
            ip_address: Client IP
            user_agent: Client user agent
            data: Initial session data

        Returns:
            Created session
        """
        with self._lock:
            self._maybe_cleanup()

            session_id = self._generate_session_id()
            ttl = ttl or self._default_ttl

            session = Session(
                id=session_id,
                user_id=user_id,
                data=data or {},
                expires_at=time.time() + ttl,
                ip_address=ip_address,
                user_agent=user_agent,
                is_authenticated=user_id is not None,
            )

            self._sessions[session_id] = session

            # Track user sessions
            if user_id:
                if user_id not in self._user_sessions:
                    self._user_sessions[user_id] = []

                user_sessions = self._user_sessions[user_id]
                user_sessions.append(session_id)

                # Enforce max sessions per user
                while len(user_sessions) > self._max_sessions_per_user:
                    old_sid = user_sessions.pop(0)
                    self._sessions.pop(old_sid, None)

            return session

    def get(self, session_id: str, touch: bool = True) -> Optional[Session]:
        """Get a session by ID.

        Args:
            session_id: Session ID
            touch: Update last activity timestamp

        Returns:
            Session or None if not found/expired
        """
        with self._lock:
            self._maybe_cleanup()

            session = self._sessions.get(session_id)
            if not session:
                return None

            if session.is_expired:
                self._sessions.pop(session_id, None)
                if session.user_id:
                    user_sessions = self._user_sessions.get(session.user_id, [])
                    if session_id in user_sessions:
                        user_sessions.remove(session_id)
                return None

            if touch:
                session.last_activity = time.time()

            return session

    def validate(self, session_id: str) -> bool:
        """Check if session is valid.

        Args:
            session_id: Session ID

        Returns:
            True if valid
        """
        return self.get(session_id, touch=False) is not None

    def authenticate(
        self,
        session_id: str,
        user_id: str,
        extend_ttl: bool = True
    ) -> bool:
        """Authenticate a session with a user.

        Args:
            session_id: Session ID
            user_id: User ID
            extend_ttl: Extend session TTL

        Returns:
            True if authenticated
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if not session or session.is_expired:
                return False

            # Remove from old user's sessions
            if session.user_id and session.user_id != user_id:
                old_user_sessions = self._user_sessions.get(session.user_id, [])
                if session_id in old_user_sessions:
                    old_user_sessions.remove(session_id)

            session.user_id = user_id
            session.is_authenticated = True
            session.last_activity = time.time()

            if extend_ttl:
                session.expires_at = time.time() + self._default_ttl

            # Track new user sessions
            if user_id not in self._user_sessions:
                self._user_sessions[user_id] = []
            if session_id not in self._user_sessions[user_id]:
                self._user_sessions[user_id].append(session_id)

            return True

    def logout(self, session_id: str) -> bool:
        """Logout/destroy a session.

        Args:
            session_id: Session ID

        Returns:
            True if destroyed
        """
        with self._lock:
            session = self._sessions.pop(session_id, None)
            if session:
                if session.user_id:
                    user_sessions = self._user_sessions.get(session.user_id, [])
                    if session_id in user_sessions:
                        user_sessions.remove(session_id)
                return True
            return False

    def renew(self, session_id: str, ttl: Optional[int] = None) -> bool:
        """Renew/extend a session.

        Args:
            session_id: Session ID
            ttl: New TTL in seconds

        Returns:
            True if renewed
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if not session or session.is_expired:
                return False

            ttl = ttl or self._default_ttl
            session.expires_at = time.time() + ttl
            session.last_activity = time.time()
            return True

    def set_data(
        self,
        session_id: str,
        key: str,
        value: Any
    ) -> bool:
        """Set session data.

        Args:
            session_id: Session ID
            key: Data key
            value: Data value

        Returns:
            True if set
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if not session or session.is_expired:
                return False

            session.data[key] = value
            session.last_activity = time.time()
            return True

    def get_data(
        self,
        session_id: str,
        key: str,
        default: Any = None
    ) -> Any:
        """Get session data.

        Args:
            session_id: Session ID
            key: Data key
            default: Default value

        Returns:
            Data value or default
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if not session or session.is_expired:
                return default
            return session.data.get(key, default)

    def delete_data(self, session_id: str, key: str) -> bool:
        """Delete session data.

        Args:
            session_id: Session ID
            key: Data key

        Returns:
            True if deleted
        """
        with self._lock:
            session = self._sessions.get(session_id)
            if not session or session.is_expired:
                return False

            if key in session.data:
                del session.data[key]
                session.last_activity = time.time()
                return True
            return False

    def get_user_sessions(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all sessions for a user.

        Args:
            user_id: User ID

        Returns:
            List of session details
        """
        with self._lock:
            session_ids = self._user_sessions.get(user_id, [])
            sessions = []
            for sid in session_ids:
                session = self._sessions.get(sid)
                if session and not session.is_expired:
                    sessions.append(session.to_dict())
            return sessions

    def terminate_user_sessions(
        self,
        user_id: str,
        except_session_id: Optional[str] = None
    ) -> int:
        """Terminate all sessions for a user.

        Args:
            user_id: User ID
            except_session_id: Session to keep

        Returns:
            Number of sessions terminated
        """
        with self._lock:
            session_ids = self._user_sessions.get(user_id, [])[:]
            terminated = 0

            for sid in session_ids:
                if sid != except_session_id:
                    if self._sessions.pop(sid, None):
                        terminated += 1

            # Update user sessions list
            if except_session_id and except_session_id in session_ids:
                self._user_sessions[user_id] = [except_session_id]
            else:
                self._user_sessions[user_id] = []

            return terminated

    def get_stats(self) -> Dict[str, Any]:
        """Get session statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            sessions = list(self._sessions.values())

        active = len([s for s in sessions if not s.is_expired])
        authenticated = len([s for s in sessions if s.is_authenticated and not s.is_expired])
        anonymous = active - authenticated

        # Session age distribution
        now = time.time()
        ages = [(now - s.created_at) / 60 for s in sessions if not s.is_expired]
        avg_age = sum(ages) / len(ages) if ages else 0

        return {
            "total_sessions": len(sessions),
            "active_sessions": active,
            "authenticated_sessions": authenticated,
            "anonymous_sessions": anonymous,
            "unique_users": len([u for u, sids in self._user_sessions.items() if sids]),
            "average_age_minutes": round(avg_age, 2),
            "default_ttl_seconds": self._default_ttl,
            "max_sessions_per_user": self._max_sessions_per_user,
        }

    def cleanup(self) -> int:
        """Force cleanup of expired sessions.

        Returns:
            Number of sessions cleaned
        """
        with self._lock:
            before = len(self._sessions)
            self._cleanup_expired()
            self._last_cleanup = time.time()
            return before - len(self._sessions)


# Singleton instance
session_store = SessionStore()
