"""
Audit Logger - Sprint 621

Track and log user actions for compliance and debugging.

Features:
- Action logging
- User tracking
- Resource tracking
- Search/filter
- Retention policies
"""

import time
import uuid
import json
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any
from enum import Enum
from threading import Lock


class AuditAction(str, Enum):
    """Audit action types."""
    # Authentication
    LOGIN = "auth.login"
    LOGOUT = "auth.logout"
    LOGIN_FAILED = "auth.login_failed"
    PASSWORD_CHANGE = "auth.password_change"

    # User management
    USER_CREATE = "user.create"
    USER_UPDATE = "user.update"
    USER_DELETE = "user.delete"

    # Resource operations
    RESOURCE_CREATE = "resource.create"
    RESOURCE_READ = "resource.read"
    RESOURCE_UPDATE = "resource.update"
    RESOURCE_DELETE = "resource.delete"

    # API operations
    API_REQUEST = "api.request"
    API_ERROR = "api.error"
    RATE_LIMITED = "api.rate_limited"

    # System events
    SYSTEM_START = "system.start"
    SYSTEM_STOP = "system.stop"
    CONFIG_CHANGE = "system.config_change"

    # Custom
    CUSTOM = "custom"


class AuditLevel(str, Enum):
    """Audit severity levels."""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class AuditEntry:
    """An audit log entry."""
    id: str
    action: AuditAction
    level: AuditLevel = AuditLevel.INFO
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    description: str = ""
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "action": self.action.value,
            "level": self.level.value,
            "user_id": self.user_id,
            "session_id": self.session_id,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "description": self.description,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "metadata": self.metadata,
            "created_at": self.created_at,
        }

    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())


class AuditLogger:
    """Audit logging system.

    Usage:
        logger = AuditLogger()

        # Log an action
        logger.log(
            action=AuditAction.LOGIN,
            user_id="user123",
            ip_address="192.168.1.1"
        )

        # Log resource change
        logger.log_change(
            action=AuditAction.USER_UPDATE,
            user_id="admin",
            resource_type="user",
            resource_id="user123",
            old_value={"name": "John"},
            new_value={"name": "Jane"}
        )

        # Search logs
        logs = logger.search(user_id="user123", action=AuditAction.LOGIN)
    """

    def __init__(
        self,
        max_entries: int = 100000,
        retention_days: int = 90
    ):
        """Initialize audit logger.

        Args:
            max_entries: Maximum entries to keep in memory
            retention_days: Days to retain entries
        """
        self._entries: List[AuditEntry] = []
        self._lock = Lock()
        self._max_entries = max_entries
        self._retention_days = retention_days
        self._last_cleanup = time.time()

    def log(
        self,
        action: AuditAction,
        level: AuditLevel = AuditLevel.INFO,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        description: str = "",
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> AuditEntry:
        """Log an audit entry.

        Args:
            action: Action type
            level: Severity level
            user_id: User performing action
            session_id: Session ID
            resource_type: Resource type affected
            resource_id: Resource ID affected
            description: Description of action
            ip_address: Client IP
            user_agent: Client user agent
            metadata: Additional metadata

        Returns:
            Created audit entry
        """
        entry = AuditEntry(
            id=str(uuid.uuid4())[:12],
            action=action,
            level=level,
            user_id=user_id,
            session_id=session_id,
            resource_type=resource_type,
            resource_id=resource_id,
            description=description,
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {},
        )

        with self._lock:
            self._entries.append(entry)
            self._maybe_cleanup()

        return entry

    def log_change(
        self,
        action: AuditAction,
        user_id: Optional[str],
        resource_type: str,
        resource_id: str,
        old_value: Optional[Dict[str, Any]],
        new_value: Optional[Dict[str, Any]],
        description: str = "",
        **kwargs
    ) -> AuditEntry:
        """Log a resource change with before/after values.

        Args:
            action: Action type
            user_id: User performing action
            resource_type: Resource type
            resource_id: Resource ID
            old_value: Value before change
            new_value: Value after change
            description: Description
            **kwargs: Additional fields

        Returns:
            Created audit entry
        """
        entry = AuditEntry(
            id=str(uuid.uuid4())[:12],
            action=action,
            level=AuditLevel.INFO,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            description=description or f"{action.value} on {resource_type}/{resource_id}",
            old_value=old_value,
            new_value=new_value,
            **kwargs
        )

        with self._lock:
            self._entries.append(entry)
            self._maybe_cleanup()

        return entry

    def log_error(
        self,
        description: str,
        user_id: Optional[str] = None,
        error: Optional[Exception] = None,
        **kwargs
    ) -> AuditEntry:
        """Log an error.

        Args:
            description: Error description
            user_id: User ID
            error: Exception object
            **kwargs: Additional fields

        Returns:
            Created audit entry
        """
        metadata = kwargs.pop("metadata", {})
        if error:
            metadata["error_type"] = type(error).__name__
            metadata["error_message"] = str(error)

        return self.log(
            action=AuditAction.API_ERROR,
            level=AuditLevel.ERROR,
            user_id=user_id,
            description=description,
            metadata=metadata,
            **kwargs
        )

    def get(self, entry_id: str) -> Optional[Dict[str, Any]]:
        """Get entry by ID.

        Args:
            entry_id: Entry ID

        Returns:
            Entry dict or None
        """
        with self._lock:
            for entry in self._entries:
                if entry.id == entry_id:
                    return entry.to_dict()
        return None

    def search(
        self,
        action: Optional[AuditAction] = None,
        level: Optional[AuditLevel] = None,
        user_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """Search audit logs.

        Args:
            action: Filter by action
            level: Filter by level
            user_id: Filter by user
            resource_type: Filter by resource type
            resource_id: Filter by resource ID
            start_time: Filter by start time
            end_time: Filter by end time
            limit: Maximum results
            offset: Results offset

        Returns:
            List of matching entries
        """
        with self._lock:
            results = []

            for entry in reversed(self._entries):
                # Apply filters
                if action and entry.action != action:
                    continue
                if level and entry.level != level:
                    continue
                if user_id and entry.user_id != user_id:
                    continue
                if resource_type and entry.resource_type != resource_type:
                    continue
                if resource_id and entry.resource_id != resource_id:
                    continue
                if start_time and entry.created_at < start_time:
                    continue
                if end_time and entry.created_at > end_time:
                    continue

                results.append(entry)

            # Apply pagination
            paginated = results[offset:offset + limit]
            return [e.to_dict() for e in paginated]

    def get_user_activity(
        self,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get activity log for a user.

        Args:
            user_id: User ID
            limit: Maximum entries

        Returns:
            List of user's audit entries
        """
        return self.search(user_id=user_id, limit=limit)

    def get_resource_history(
        self,
        resource_type: str,
        resource_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get change history for a resource.

        Args:
            resource_type: Resource type
            resource_id: Resource ID
            limit: Maximum entries

        Returns:
            List of resource's audit entries
        """
        return self.search(
            resource_type=resource_type,
            resource_id=resource_id,
            limit=limit
        )

    def count(
        self,
        action: Optional[AuditAction] = None,
        level: Optional[AuditLevel] = None,
        user_id: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None
    ) -> int:
        """Count matching entries.

        Args:
            action: Filter by action
            level: Filter by level
            user_id: Filter by user
            start_time: Filter by start time
            end_time: Filter by end time

        Returns:
            Count of matching entries
        """
        with self._lock:
            count = 0

            for entry in self._entries:
                if action and entry.action != action:
                    continue
                if level and entry.level != level:
                    continue
                if user_id and entry.user_id != user_id:
                    continue
                if start_time and entry.created_at < start_time:
                    continue
                if end_time and entry.created_at > end_time:
                    continue
                count += 1

            return count

    def _maybe_cleanup(self):
        """Run cleanup if needed."""
        now = time.time()

        # Cleanup every hour
        if now - self._last_cleanup < 3600:
            return

        self._last_cleanup = now
        self._cleanup()

    def _cleanup(self):
        """Remove old entries."""
        if self._retention_days <= 0:
            return

        cutoff = time.time() - (self._retention_days * 86400)

        # Remove old entries
        self._entries = [
            e for e in self._entries
            if e.created_at >= cutoff
        ]

        # Enforce max entries
        if len(self._entries) > self._max_entries:
            self._entries = self._entries[-self._max_entries:]

    def cleanup(self) -> int:
        """Force cleanup.

        Returns:
            Number of entries removed
        """
        with self._lock:
            before = len(self._entries)
            self._cleanup()
            return before - len(self._entries)

    def export(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None
    ) -> List[Dict[str, Any]]:
        """Export entries for backup.

        Args:
            start_time: Export from time
            end_time: Export until time

        Returns:
            List of all matching entries
        """
        return self.search(
            start_time=start_time,
            end_time=end_time,
            limit=self._max_entries
        )

    def get_stats(self) -> Dict[str, Any]:
        """Get audit statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            entries = self._entries[:]

        total = len(entries)

        # Count by action
        action_counts = {}
        for action in AuditAction:
            action_counts[action.value] = len([e for e in entries if e.action == action])

        # Count by level
        level_counts = {}
        for level in AuditLevel:
            level_counts[level.value] = len([e for e in entries if e.level == level])

        # Unique users
        unique_users = len(set(e.user_id for e in entries if e.user_id))

        # Time range
        oldest = min(e.created_at for e in entries) if entries else None
        newest = max(e.created_at for e in entries) if entries else None

        return {
            "total_entries": total,
            "action_counts": action_counts,
            "level_counts": level_counts,
            "unique_users": unique_users,
            "oldest_entry": oldest,
            "newest_entry": newest,
            "retention_days": self._retention_days,
            "max_entries": self._max_entries,
        }


# Singleton instance
audit_logger = AuditLogger()
