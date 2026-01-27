"""
Audit Log - Sprint 763

Audit logging system for tracking actions.

Features:
- Action logging
- User tracking
- Resource changes
- Queryable logs
- Retention policies
"""

import time
import uuid
import json
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Set
)
from enum import Enum
from abc import ABC, abstractmethod
from functools import wraps
import hashlib


T = TypeVar("T")


class AuditAction(str, Enum):
    """Common audit actions."""
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGOUT = "logout"
    EXPORT = "export"
    IMPORT = "import"
    PERMISSION_CHANGE = "permission_change"
    SETTINGS_CHANGE = "settings_change"
    CUSTOM = "custom"


class AuditSeverity(str, Enum):
    """Audit entry severity."""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


@dataclass
class AuditEntry:
    """Single audit log entry."""
    id: str
    timestamp: float
    action: AuditAction
    resource_type: str
    resource_id: Optional[str]
    user_id: Optional[str]
    user_email: Optional[str]
    ip_address: Optional[str]
    user_agent: Optional[str]
    severity: AuditSeverity
    message: str
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    request_id: Optional[str] = None
    success: bool = True
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "action": self.action.value,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "user_id": self.user_id,
            "user_email": self.user_email,
            "ip_address": self.ip_address,
            "severity": self.severity.value,
            "message": self.message,
            "old_value": self.old_value,
            "new_value": self.new_value,
            "metadata": self.metadata,
            "success": self.success,
            "error": self.error,
        }

    def get_changes(self) -> Dict[str, tuple]:
        """Get changed fields between old and new values."""
        if not self.old_value or not self.new_value:
            return {}

        changes = {}
        all_keys = set(self.old_value.keys()) | set(self.new_value.keys())

        for key in all_keys:
            old = self.old_value.get(key)
            new = self.new_value.get(key)
            if old != new:
                changes[key] = (old, new)

        return changes


@dataclass
class AuditQuery:
    """Query parameters for audit logs."""
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    actions: Optional[List[AuditAction]] = None
    resource_types: Optional[List[str]] = None
    resource_ids: Optional[List[str]] = None
    user_ids: Optional[List[str]] = None
    severities: Optional[List[AuditSeverity]] = None
    success_only: Optional[bool] = None
    limit: int = 100
    offset: int = 0


class AuditStorage(ABC):
    """Abstract audit storage backend."""

    @abstractmethod
    async def store(self, entry: AuditEntry) -> None:
        """Store audit entry."""
        pass

    @abstractmethod
    async def query(self, query: AuditQuery) -> List[AuditEntry]:
        """Query audit entries."""
        pass

    @abstractmethod
    async def get(self, entry_id: str) -> Optional[AuditEntry]:
        """Get single entry by ID."""
        pass

    @abstractmethod
    async def delete_older_than(self, timestamp: float) -> int:
        """Delete entries older than timestamp."""
        pass


class MemoryAuditStorage(AuditStorage):
    """In-memory audit storage."""

    def __init__(self, max_entries: int = 100000):
        self._entries: Dict[str, AuditEntry] = {}
        self._by_user: Dict[str, List[str]] = defaultdict(list)
        self._by_resource: Dict[str, List[str]] = defaultdict(list)
        self._max_entries = max_entries
        self._lock = threading.Lock()

    async def store(self, entry: AuditEntry) -> None:
        with self._lock:
            self._entries[entry.id] = entry

            if entry.user_id:
                self._by_user[entry.user_id].append(entry.id)

            if entry.resource_type and entry.resource_id:
                key = entry.resource_type + ":" + entry.resource_id
                self._by_resource[key].append(entry.id)

            # Cleanup old entries if needed
            if len(self._entries) > self._max_entries:
                sorted_ids = sorted(
                    self._entries.keys(),
                    key=lambda k: self._entries[k].timestamp
                )
                for old_id in sorted_ids[:len(sorted_ids) // 4]:
                    self._remove_entry(old_id)

    def _remove_entry(self, entry_id: str) -> None:
        """Remove entry from all indexes."""
        entry = self._entries.get(entry_id)
        if not entry:
            return

        if entry.user_id and entry_id in self._by_user[entry.user_id]:
            self._by_user[entry.user_id].remove(entry_id)

        if entry.resource_type and entry.resource_id:
            key = entry.resource_type + ":" + entry.resource_id
            if entry_id in self._by_resource[key]:
                self._by_resource[key].remove(entry_id)

        del self._entries[entry_id]

    async def query(self, query: AuditQuery) -> List[AuditEntry]:
        entries = list(self._entries.values())

        # Filter by time
        if query.start_time:
            entries = [e for e in entries if e.timestamp >= query.start_time]
        if query.end_time:
            entries = [e for e in entries if e.timestamp <= query.end_time]

        # Filter by action
        if query.actions:
            entries = [e for e in entries if e.action in query.actions]

        # Filter by resource
        if query.resource_types:
            entries = [e for e in entries if e.resource_type in query.resource_types]
        if query.resource_ids:
            entries = [e for e in entries if e.resource_id in query.resource_ids]

        # Filter by user
        if query.user_ids:
            entries = [e for e in entries if e.user_id in query.user_ids]

        # Filter by severity
        if query.severities:
            entries = [e for e in entries if e.severity in query.severities]

        # Filter by success
        if query.success_only is not None:
            entries = [e for e in entries if e.success == query.success_only]

        # Sort by timestamp descending
        entries.sort(key=lambda e: e.timestamp, reverse=True)

        # Paginate
        return entries[query.offset:query.offset + query.limit]

    async def get(self, entry_id: str) -> Optional[AuditEntry]:
        return self._entries.get(entry_id)

    async def delete_older_than(self, timestamp: float) -> int:
        with self._lock:
            to_delete = [
                entry_id for entry_id, entry in self._entries.items()
                if entry.timestamp < timestamp
            ]
            for entry_id in to_delete:
                self._remove_entry(entry_id)
            return len(to_delete)


class AuditLogger:
    """Audit logging system.

    Usage:
        logger = AuditLogger()

        # Log an action
        await logger.log(
            action=AuditAction.CREATE,
            resource_type="user",
            resource_id="123",
            user_id="admin",
            message="Created new user",
            new_value={"name": "John", "email": "john@example.com"}
        )

        # Log with context manager
        async with logger.track(
            action=AuditAction.UPDATE,
            resource_type="settings",
            resource_id="global",
            user_id="admin",
            old_value={"theme": "light"}
        ) as entry:
            # Do work...
            entry.new_value = {"theme": "dark"}

        # Query logs
        entries = await logger.query(AuditQuery(
            user_ids=["admin"],
            limit=10
        ))
    """

    def __init__(
        self,
        storage: Optional[AuditStorage] = None,
        default_severity: AuditSeverity = AuditSeverity.INFO,
    ):
        self._storage = storage or MemoryAuditStorage()
        self._default_severity = default_severity
        self._context: Dict[str, Any] = {}

    def set_context(self, **kwargs: Any) -> None:
        """Set default context for all entries."""
        self._context.update(kwargs)

    def clear_context(self) -> None:
        """Clear default context."""
        self._context.clear()

    async def log(
        self,
        action: AuditAction,
        resource_type: str,
        message: str,
        resource_id: Optional[str] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        severity: Optional[AuditSeverity] = None,
        old_value: Optional[Dict[str, Any]] = None,
        new_value: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        request_id: Optional[str] = None,
        success: bool = True,
        error: Optional[str] = None,
    ) -> AuditEntry:
        """Log an audit entry."""
        entry = AuditEntry(
            id=str(uuid.uuid4()),
            timestamp=time.time(),
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            user_id=user_id or self._context.get("user_id"),
            user_email=user_email or self._context.get("user_email"),
            ip_address=ip_address or self._context.get("ip_address"),
            user_agent=user_agent or self._context.get("user_agent"),
            severity=severity or self._default_severity,
            message=message,
            old_value=old_value,
            new_value=new_value,
            metadata=metadata or {},
            request_id=request_id or self._context.get("request_id"),
            success=success,
            error=error,
        )

        await self._storage.store(entry)
        return entry

    async def log_create(
        self,
        resource_type: str,
        resource_id: str,
        new_value: Dict[str, Any],
        **kwargs: Any,
    ) -> AuditEntry:
        """Shortcut for CREATE action."""
        return await self.log(
            action=AuditAction.CREATE,
            resource_type=resource_type,
            resource_id=resource_id,
            message="Created " + resource_type + " " + resource_id,
            new_value=new_value,
            **kwargs,
        )

    async def log_update(
        self,
        resource_type: str,
        resource_id: str,
        old_value: Dict[str, Any],
        new_value: Dict[str, Any],
        **kwargs: Any,
    ) -> AuditEntry:
        """Shortcut for UPDATE action."""
        return await self.log(
            action=AuditAction.UPDATE,
            resource_type=resource_type,
            resource_id=resource_id,
            message="Updated " + resource_type + " " + resource_id,
            old_value=old_value,
            new_value=new_value,
            **kwargs,
        )

    async def log_delete(
        self,
        resource_type: str,
        resource_id: str,
        old_value: Optional[Dict[str, Any]] = None,
        **kwargs: Any,
    ) -> AuditEntry:
        """Shortcut for DELETE action."""
        return await self.log(
            action=AuditAction.DELETE,
            resource_type=resource_type,
            resource_id=resource_id,
            message="Deleted " + resource_type + " " + resource_id,
            old_value=old_value,
            **kwargs,
        )

    async def log_login(
        self,
        user_id: str,
        user_email: Optional[str] = None,
        success: bool = True,
        **kwargs: Any,
    ) -> AuditEntry:
        """Shortcut for LOGIN action."""
        return await self.log(
            action=AuditAction.LOGIN,
            resource_type="session",
            message="User login " + ("successful" if success else "failed"),
            user_id=user_id,
            user_email=user_email,
            success=success,
            severity=AuditSeverity.INFO if success else AuditSeverity.WARNING,
            **kwargs,
        )

    async def log_logout(
        self,
        user_id: str,
        **kwargs: Any,
    ) -> AuditEntry:
        """Shortcut for LOGOUT action."""
        return await self.log(
            action=AuditAction.LOGOUT,
            resource_type="session",
            message="User logged out",
            user_id=user_id,
            **kwargs,
        )

    async def query(self, query: AuditQuery) -> List[AuditEntry]:
        """Query audit entries."""
        return await self._storage.query(query)

    async def get(self, entry_id: str) -> Optional[AuditEntry]:
        """Get single entry by ID."""
        return await self._storage.get(entry_id)

    async def get_user_activity(
        self,
        user_id: str,
        limit: int = 50,
    ) -> List[AuditEntry]:
        """Get activity for a specific user."""
        return await self.query(AuditQuery(
            user_ids=[user_id],
            limit=limit,
        ))

    async def get_resource_history(
        self,
        resource_type: str,
        resource_id: str,
        limit: int = 50,
    ) -> List[AuditEntry]:
        """Get history for a specific resource."""
        return await self.query(AuditQuery(
            resource_types=[resource_type],
            resource_ids=[resource_id],
            limit=limit,
        ))

    async def cleanup(self, days: int = 90) -> int:
        """Delete entries older than specified days."""
        cutoff = time.time() - (days * 24 * 60 * 60)
        return await self._storage.delete_older_than(cutoff)


def audit(
    action: AuditAction,
    resource_type: str,
    severity: AuditSeverity = AuditSeverity.INFO,
    capture_args: bool = False,
    capture_result: bool = False,
) -> Callable:
    """Decorator to automatically audit function calls.

    Usage:
        @audit(AuditAction.CREATE, "user")
        async def create_user(data: dict):
            user = User(**data)
            return user
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            logger = get_audit_logger()

            metadata = {}
            if capture_args:
                metadata["args"] = str(args)
                metadata["kwargs"] = str(kwargs)

            try:
                result = await func(*args, **kwargs)

                if capture_result:
                    metadata["result"] = str(result)

                await logger.log(
                    action=action,
                    resource_type=resource_type,
                    message="Executed " + func.__name__,
                    severity=severity,
                    metadata=metadata,
                    success=True,
                )

                return result

            except Exception as e:
                await logger.log(
                    action=action,
                    resource_type=resource_type,
                    message="Failed " + func.__name__,
                    severity=AuditSeverity.ERROR,
                    metadata=metadata,
                    success=False,
                    error=str(e),
                )
                raise

        return wrapper
    return decorator


# Singleton
_logger: Optional[AuditLogger] = None


def get_audit_logger() -> AuditLogger:
    """Get global audit logger."""
    global _logger
    if not _logger:
        _logger = AuditLogger()
    return _logger


def configure_audit(storage: Optional[AuditStorage] = None) -> AuditLogger:
    """Configure global audit logger."""
    global _logger
    _logger = AuditLogger(storage=storage)
    return _logger
