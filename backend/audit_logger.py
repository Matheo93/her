"""
Audit Logger - Sprint 649

Security and compliance audit logging.

Features:
- Action tracking
- User activity logging
- Security events
- Compliance reporting
- Log retention
"""

import time
import uuid
import json
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any
from enum import Enum
from threading import Lock
from datetime import datetime, timedelta


class AuditAction(str, Enum):
    """Audit action types."""
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGOUT = "logout"
    ACCESS_DENIED = "access_denied"
    PERMISSION_CHANGE = "permission_change"
    CONFIG_CHANGE = "config_change"
    EXPORT = "export"
    IMPORT = "import"
    API_CALL = "api_call"


class AuditSeverity(str, Enum):
    """Audit event severity."""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


# Alias for backward compatibility
AuditLevel = AuditSeverity


@dataclass
class AuditEntry:
    """Single audit log entry."""
    id: str
    action: AuditAction
    severity: AuditSeverity
    user_id: Optional[str]
    resource_type: str
    resource_id: Optional[str]
    description: str
    timestamp: float
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    success: bool = True
    error_message: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "action": self.action.value,
            "severity": self.severity.value,
            "user_id": self.user_id,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "description": self.description,
            "timestamp": self.timestamp,
            "datetime": datetime.fromtimestamp(self.timestamp).isoformat(),
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "metadata": self.metadata,
            "success": self.success,
            "error_message": self.error_message,
        }


@dataclass
class AuditStats:
    """Audit statistics."""
    total_entries: int = 0
    entries_by_action: Dict[str, int] = field(default_factory=dict)
    entries_by_severity: Dict[str, int] = field(default_factory=dict)
    entries_by_user: Dict[str, int] = field(default_factory=dict)
    failed_operations: int = 0


class AuditLogger:
    """Security and compliance audit logging.

    Usage:
        logger = AuditLogger()

        # Log an action
        logger.log(
            action=AuditAction.CREATE,
            user_id="user123",
            resource_type="conversation",
            resource_id="conv456",
            description="Created new conversation",
        )

        # Query logs
        entries = logger.query(user_id="user123", limit=50)
    """

    def __init__(self, max_entries: int = 10000, retention_days: int = 90):
        """Initialize audit logger.

        Args:
            max_entries: Maximum entries to keep in memory
            retention_days: Days to retain logs
        """
        self._entries: List[AuditEntry] = []
        self._lock = Lock()
        self._max_entries = max_entries
        self._retention_days = retention_days
        self._stats = AuditStats()

    def log(
        self,
        action: AuditAction,
        resource_type: str,
        description: str,
        user_id: Optional[str] = None,
        resource_id: Optional[str] = None,
        severity: AuditSeverity = AuditSeverity.INFO,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        success: bool = True,
        error_message: Optional[str] = None,
    ) -> str:
        """Log an audit entry.

        Args:
            action: Action type
            resource_type: Type of resource affected
            description: Human-readable description
            user_id: User who performed the action
            resource_id: ID of affected resource
            severity: Event severity
            ip_address: Client IP address
            user_agent: Client user agent
            metadata: Additional context
            success: Whether operation succeeded
            error_message: Error message if failed

        Returns:
            Entry ID
        """
        entry_id = str(uuid.uuid4())[:12]

        entry = AuditEntry(
            id=entry_id,
            action=action,
            severity=severity,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            description=description,
            timestamp=time.time(),
            ip_address=ip_address,
            user_agent=user_agent,
            metadata=metadata or {},
            success=success,
            error_message=error_message,
        )

        with self._lock:
            self._entries.append(entry)
            self._update_stats(entry)

            # Enforce max entries
            if len(self._entries) > self._max_entries:
                self._entries = self._entries[-int(self._max_entries * 0.8):]

        return entry_id

    def _update_stats(self, entry: AuditEntry):
        """Update statistics with new entry."""
        self._stats.total_entries += 1

        action = entry.action.value
        self._stats.entries_by_action[action] = \
            self._stats.entries_by_action.get(action, 0) + 1

        severity = entry.severity.value
        self._stats.entries_by_severity[severity] = \
            self._stats.entries_by_severity.get(severity, 0) + 1

        if entry.user_id:
            self._stats.entries_by_user[entry.user_id] = \
                self._stats.entries_by_user.get(entry.user_id, 0) + 1

        if not entry.success:
            self._stats.failed_operations += 1

    def log_login(
        self,
        user_id: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        success: bool = True,
        error_message: Optional[str] = None,
    ) -> str:
        """Log a login attempt."""
        return self.log(
            action=AuditAction.LOGIN,
            user_id=user_id,
            resource_type="session",
            description=f"User login {'successful' if success else 'failed'}",
            severity=AuditSeverity.INFO if success else AuditSeverity.WARNING,
            ip_address=ip_address,
            user_agent=user_agent,
            success=success,
            error_message=error_message,
        )

    def log_access_denied(
        self,
        user_id: Optional[str],
        resource_type: str,
        resource_id: Optional[str],
        reason: str,
        ip_address: Optional[str] = None,
    ) -> str:
        """Log an access denied event."""
        return self.log(
            action=AuditAction.ACCESS_DENIED,
            user_id=user_id,
            resource_type=resource_type,
            resource_id=resource_id,
            description=f"Access denied: {reason}",
            severity=AuditSeverity.WARNING,
            ip_address=ip_address,
            success=False,
            error_message=reason,
        )

    def log_config_change(
        self,
        user_id: str,
        config_key: str,
        old_value: Any,
        new_value: Any,
    ) -> str:
        """Log a configuration change."""
        return self.log(
            action=AuditAction.CONFIG_CHANGE,
            user_id=user_id,
            resource_type="config",
            resource_id=config_key,
            description=f"Configuration changed: {config_key}",
            severity=AuditSeverity.INFO,
            metadata={
                "old_value": str(old_value),
                "new_value": str(new_value),
            },
        )

    def log_api_call(
        self,
        user_id: Optional[str],
        endpoint: str,
        method: str,
        status_code: int,
        latency_ms: float,
        ip_address: Optional[str] = None,
    ) -> str:
        """Log an API call."""
        success = 200 <= status_code < 400
        severity = AuditSeverity.INFO if success else AuditSeverity.WARNING

        return self.log(
            action=AuditAction.API_CALL,
            user_id=user_id,
            resource_type="api",
            resource_id=endpoint,
            description=f"{method} {endpoint} -> {status_code}",
            severity=severity,
            ip_address=ip_address,
            success=success,
            metadata={
                "method": method,
                "status_code": status_code,
                "latency_ms": latency_ms,
            },
        )

    def query(
        self,
        user_id: Optional[str] = None,
        action: Optional[AuditAction] = None,
        severity: Optional[AuditSeverity] = None,
        resource_type: Optional[str] = None,
        resource_id: Optional[str] = None,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
        success_only: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[dict]:
        """Query audit logs.

        Args:
            user_id: Filter by user
            action: Filter by action type
            severity: Filter by severity
            resource_type: Filter by resource type
            resource_id: Filter by resource ID
            start_time: Filter by start timestamp
            end_time: Filter by end timestamp
            success_only: Filter by success status
            limit: Max results
            offset: Results offset

        Returns:
            List of matching entries
        """
        with self._lock:
            results = self._entries.copy()

        # Apply filters
        if user_id:
            results = [e for e in results if e.user_id == user_id]
        if action:
            results = [e for e in results if e.action == action]
        if severity:
            results = [e for e in results if e.severity == severity]
        if resource_type:
            results = [e for e in results if e.resource_type == resource_type]
        if resource_id:
            results = [e for e in results if e.resource_id == resource_id]
        if start_time:
            results = [e for e in results if e.timestamp >= start_time]
        if end_time:
            results = [e for e in results if e.timestamp <= end_time]
        if success_only is not None:
            results = [e for e in results if e.success == success_only]

        # Sort by timestamp descending
        results.sort(key=lambda e: e.timestamp, reverse=True)

        # Apply pagination
        results = results[offset:offset + limit]

        return [e.to_dict() for e in results]

    def get_entry(self, entry_id: str) -> Optional[dict]:
        """Get a specific audit entry.

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

    def get_user_activity(
        self,
        user_id: str,
        days: int = 7,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """Get user activity summary.

        Args:
            user_id: User ID
            days: Days to look back
            limit: Max entries

        Returns:
            Activity summary
        """
        cutoff = time.time() - (days * 86400)

        with self._lock:
            user_entries = [
                e for e in self._entries
                if e.user_id == user_id and e.timestamp >= cutoff
            ]

        # Count by action
        by_action: Dict[str, int] = {}
        for entry in user_entries:
            by_action[entry.action.value] = by_action.get(entry.action.value, 0) + 1

        # Recent entries
        recent = sorted(user_entries, key=lambda e: e.timestamp, reverse=True)[:limit]

        return {
            "user_id": user_id,
            "period_days": days,
            "total_actions": len(user_entries),
            "actions_by_type": by_action,
            "recent_entries": [e.to_dict() for e in recent],
        }

    def get_security_events(
        self,
        hours: int = 24,
        limit: int = 100,
    ) -> List[dict]:
        """Get recent security-related events.

        Args:
            hours: Hours to look back
            limit: Max results

        Returns:
            Security events
        """
        cutoff = time.time() - (hours * 3600)
        security_actions = {
            AuditAction.LOGIN,
            AuditAction.LOGOUT,
            AuditAction.ACCESS_DENIED,
            AuditAction.PERMISSION_CHANGE,
        }

        with self._lock:
            events = [
                e for e in self._entries
                if e.action in security_actions and e.timestamp >= cutoff
            ]

        events.sort(key=lambda e: e.timestamp, reverse=True)
        return [e.to_dict() for e in events[:limit]]

    def get_stats(self) -> Dict[str, Any]:
        """Get audit statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            return {
                "total_entries": self._stats.total_entries,
                "current_entries": len(self._entries),
                "max_entries": self._max_entries,
                "entries_by_action": self._stats.entries_by_action,
                "entries_by_severity": self._stats.entries_by_severity,
                "failed_operations": self._stats.failed_operations,
                "top_users": dict(
                    sorted(
                        self._stats.entries_by_user.items(),
                        key=lambda x: x[1],
                        reverse=True
                    )[:10]
                ),
            }

    def cleanup(self, days: Optional[int] = None) -> int:
        """Remove old entries.

        Args:
            days: Days to retain (default: retention_days)

        Returns:
            Number of entries removed
        """
        retention = days or self._retention_days
        cutoff = time.time() - (retention * 86400)

        with self._lock:
            original_count = len(self._entries)
            self._entries = [e for e in self._entries if e.timestamp >= cutoff]
            removed = original_count - len(self._entries)

        return removed

    def export(
        self,
        start_time: Optional[float] = None,
        end_time: Optional[float] = None,
    ) -> str:
        """Export audit logs as JSON.

        Args:
            start_time: Start timestamp
            end_time: End timestamp

        Returns:
            JSON string
        """
        entries = self.query(
            start_time=start_time,
            end_time=end_time,
            limit=100000,
        )

        return json.dumps({
            "export_time": datetime.now().isoformat(),
            "total_entries": len(entries),
            "entries": entries,
        }, indent=2)


# Singleton instance
audit_logger = AuditLogger()
