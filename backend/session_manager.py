"""
Session Manager - Sprint 665

User session management system.

Features:
- Session creation/validation
- Session storage
- TTL expiration
- Session data
- Activity tracking
"""

import time
import uuid
import secrets
import hashlib
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, List
from enum import Enum
import threading


class SessionStatus(str, Enum):
    """Session status."""
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"


@dataclass
class Session:
    """Session data."""
    id: str
    token: str
    user_id: Optional[str] = None
    data: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    expires_at: float = 0
    status: SessionStatus = SessionStatus.ACTIVE
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    def is_expired(self) -> bool:
        """Check if session is expired."""
        return time.time() > self.expires_at

    def is_valid(self) -> bool:
        """Check if session is valid."""
        return self.status == SessionStatus.ACTIVE and not self.is_expired()


@dataclass
class SessionConfig:
    """Session configuration."""
    ttl_seconds: int = 3600
    max_sessions_per_user: int = 5
    refresh_on_activity: bool = True
    secure_token: bool = True


class SessionManager:
    """Session management system.

    Usage:
        manager = SessionManager()

        # Create session
        session = manager.create(user_id="user_123")
        token = session.token

        # Validate session
        session = manager.validate(token)
        if session:
            print(f"Valid session for {session.user_id}")

        # Store data
        manager.set_data(token, "cart", {"items": []})
        cart = manager.get_data(token, "cart")

        # Revoke
        manager.revoke(token)
    """

    def __init__(self, config: Optional[SessionConfig] = None):
        """Initialize session manager.

        Args:
            config: Session configuration
        """
        self._config = config or SessionConfig()
        self._sessions: Dict[str, Session] = {}
        self._token_to_id: Dict[str, str] = {}
        self._user_sessions: Dict[str, List[str]] = {}
        self._lock = threading.Lock()
        self._stats = {
            "total_created": 0,
            "total_validated": 0,
            "total_expired": 0,
            "total_revoked": 0,
        }

    def create(
        self,
        user_id: Optional[str] = None,
        data: Optional[Dict[str, Any]] = None,
        ttl_seconds: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Session:
        """Create new session.

        Args:
            user_id: User identifier
            data: Initial session data
            ttl_seconds: Custom TTL (overrides config)
            ip_address: Client IP
            user_agent: Client user agent

        Returns:
            New session
        """
        session_id = str(uuid.uuid4())
        token = self._generate_token()
        ttl = ttl_seconds or self._config.ttl_seconds

        session = Session(
            id=session_id,
            token=token,
            user_id=user_id,
            data=data or {},
            expires_at=time.time() + ttl,
            ip_address=ip_address,
            user_agent=user_agent,
        )

        with self._lock:
            # Enforce max sessions per user
            if user_id and self._config.max_sessions_per_user > 0:
                user_session_ids = self._user_sessions.get(user_id, [])
                while len(user_session_ids) >= self._config.max_sessions_per_user:
                    oldest_id = user_session_ids.pop(0)
                    self._remove_session(oldest_id)

                if user_id not in self._user_sessions:
                    self._user_sessions[user_id] = []
                self._user_sessions[user_id].append(session_id)

            self._sessions[session_id] = session
            self._token_to_id[self._hash_token(token)] = session_id
            self._stats["total_created"] += 1

        return session

    def validate(self, token: str) -> Optional[Session]:
        """Validate session token.

        Args:
            token: Session token

        Returns:
            Session if valid, None otherwise
        """
        with self._lock:
            session_id = self._token_to_id.get(self._hash_token(token))
            if not session_id:
                return None

            session = self._sessions.get(session_id)
            if not session:
                return None

            if not session.is_valid():
                if session.is_expired():
                    session.status = SessionStatus.EXPIRED
                    self._stats["total_expired"] += 1
                return None

            # Update activity
            if self._config.refresh_on_activity:
                session.last_activity = time.time()
                session.expires_at = time.time() + self._config.ttl_seconds

            self._stats["total_validated"] += 1
            return session

    def get(self, token: str) -> Optional[Session]:
        """Get session without validation."""
        session_id = self._token_to_id.get(self._hash_token(token))
        return self._sessions.get(session_id) if session_id else None

    def revoke(self, token: str) -> bool:
        """Revoke session.

        Args:
            token: Session token

        Returns:
            True if revoked
        """
        with self._lock:
            session_id = self._token_to_id.get(self._hash_token(token))
            if not session_id:
                return False

            session = self._sessions.get(session_id)
            if session:
                session.status = SessionStatus.REVOKED
                self._stats["total_revoked"] += 1
                return True

            return False

    def revoke_all(self, user_id: str) -> int:
        """Revoke all sessions for user.

        Args:
            user_id: User ID

        Returns:
            Number of sessions revoked
        """
        count = 0
        with self._lock:
            session_ids = self._user_sessions.get(user_id, [])
            for session_id in session_ids:
                session = self._sessions.get(session_id)
                if session and session.status == SessionStatus.ACTIVE:
                    session.status = SessionStatus.REVOKED
                    self._stats["total_revoked"] += 1
                    count += 1
        return count

    def set_data(self, token: str, key: str, value: Any) -> bool:
        """Set session data.

        Args:
            token: Session token
            key: Data key
            value: Data value

        Returns:
            True if set
        """
        session = self.validate(token)
        if session:
            session.data[key] = value
            return True
        return False

    def get_data(self, token: str, key: str, default: Any = None) -> Any:
        """Get session data.

        Args:
            token: Session token
            key: Data key
            default: Default value

        Returns:
            Data value
        """
        session = self.validate(token)
        if session:
            return session.data.get(key, default)
        return default

    def delete_data(self, token: str, key: str) -> bool:
        """Delete session data key."""
        session = self.validate(token)
        if session and key in session.data:
            del session.data[key]
            return True
        return False

    def refresh(self, token: str, ttl_seconds: Optional[int] = None) -> bool:
        """Refresh session expiration.

        Args:
            token: Session token
            ttl_seconds: New TTL

        Returns:
            True if refreshed
        """
        session = self.validate(token)
        if session:
            ttl = ttl_seconds or self._config.ttl_seconds
            session.expires_at = time.time() + ttl
            session.last_activity = time.time()
            return True
        return False

    def get_user_sessions(self, user_id: str) -> List[Session]:
        """Get all sessions for user."""
        sessions = []
        with self._lock:
            for session_id in self._user_sessions.get(user_id, []):
                session = self._sessions.get(session_id)
                if session:
                    sessions.append(session)
        return sessions

    def cleanup_expired(self) -> int:
        """Remove expired sessions.

        Returns:
            Number removed
        """
        count = 0
        with self._lock:
            expired_ids = [
                sid for sid, s in self._sessions.items()
                if s.is_expired() or s.status != SessionStatus.ACTIVE
            ]
            for session_id in expired_ids:
                self._remove_session(session_id)
                count += 1
        return count

    def _remove_session(self, session_id: str):
        """Remove session from storage."""
        session = self._sessions.pop(session_id, None)
        if session:
            self._token_to_id.pop(self._hash_token(session.token), None)
            if session.user_id and session.user_id in self._user_sessions:
                user_sessions = self._user_sessions[session.user_id]
                if session_id in user_sessions:
                    user_sessions.remove(session_id)

    def _generate_token(self) -> str:
        """Generate session token."""
        if self._config.secure_token:
            return secrets.token_urlsafe(32)
        return str(uuid.uuid4())

    def _hash_token(self, token: str) -> str:
        """Hash token for storage."""
        return hashlib.sha256(token.encode()).hexdigest()

    def get_stats(self) -> dict:
        """Get session statistics."""
        with self._lock:
            active = sum(1 for s in self._sessions.values() if s.is_valid())
            return {
                **self._stats,
                "active_sessions": active,
                "total_sessions": len(self._sessions),
                "unique_users": len(self._user_sessions),
            }


# Singleton instance
session_manager = SessionManager()
