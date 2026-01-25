"""
Notification Service - Sprint 619

In-app notification system for users.

Features:
- Multiple notification types
- Read/unread tracking
- Priority levels
- Expiration
- Batch operations
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Set
from enum import Enum
from threading import Lock


class NotificationType(str, Enum):
    """Notification types."""
    INFO = "info"
    SUCCESS = "success"
    WARNING = "warning"
    ERROR = "error"
    SYSTEM = "system"
    CHAT = "chat"
    ACHIEVEMENT = "achievement"


class NotificationPriority(int, Enum):
    """Notification priority levels."""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    URGENT = 3


@dataclass
class Notification:
    """A notification."""
    id: str
    user_id: str
    title: str
    message: str
    type: NotificationType = NotificationType.INFO
    priority: NotificationPriority = NotificationPriority.NORMAL
    read: bool = False
    read_at: Optional[float] = None
    created_at: float = field(default_factory=time.time)
    expires_at: Optional[float] = None
    action_url: Optional[str] = None
    action_label: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    dismissed: bool = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "message": self.message,
            "type": self.type.value,
            "priority": self.priority.value,
            "read": self.read,
            "read_at": self.read_at,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
            "action_url": self.action_url,
            "action_label": self.action_label,
            "metadata": self.metadata,
            "dismissed": self.dismissed,
            "is_expired": self.is_expired,
        }

    @property
    def is_expired(self) -> bool:
        """Check if notification has expired."""
        if self.expires_at is None:
            return False
        return time.time() > self.expires_at


class NotificationService:
    """Manage user notifications.

    Usage:
        service = NotificationService()

        # Send notification
        notification = service.create(
            user_id="user123",
            title="Welcome!",
            message="Thanks for joining.",
            type=NotificationType.SUCCESS
        )

        # Get user notifications
        notifications = service.get_user_notifications("user123")

        # Mark as read
        service.mark_read("user123", notification.id)
    """

    def __init__(
        self,
        max_per_user: int = 100,
        default_expiry_hours: int = 168  # 1 week
    ):
        """Initialize notification service.

        Args:
            max_per_user: Maximum notifications per user
            default_expiry_hours: Default expiry in hours
        """
        self._notifications: Dict[str, Dict[str, Notification]] = {}  # user_id -> {id -> notification}
        self._lock = Lock()
        self._max_per_user = max_per_user
        self._default_expiry_hours = default_expiry_hours

    def create(
        self,
        user_id: str,
        title: str,
        message: str,
        type: NotificationType = NotificationType.INFO,
        priority: NotificationPriority = NotificationPriority.NORMAL,
        expires_hours: Optional[int] = None,
        action_url: Optional[str] = None,
        action_label: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Notification:
        """Create a new notification.

        Args:
            user_id: User ID
            title: Notification title
            message: Notification message
            type: Notification type
            priority: Priority level
            expires_hours: Hours until expiry (None = default)
            action_url: Optional action URL
            action_label: Optional action button label
            metadata: Additional metadata

        Returns:
            Created notification
        """
        notification_id = str(uuid.uuid4())[:8]

        expiry_hours = expires_hours if expires_hours is not None else self._default_expiry_hours
        expires_at = time.time() + (expiry_hours * 3600) if expiry_hours > 0 else None

        notification = Notification(
            id=notification_id,
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            priority=priority,
            expires_at=expires_at,
            action_url=action_url,
            action_label=action_label,
            metadata=metadata or {},
        )

        with self._lock:
            if user_id not in self._notifications:
                self._notifications[user_id] = {}

            user_notifications = self._notifications[user_id]
            user_notifications[notification_id] = notification

            # Enforce max per user
            self._enforce_limit(user_id)

        return notification

    def _enforce_limit(self, user_id: str):
        """Remove oldest notifications if over limit."""
        user_notifications = self._notifications.get(user_id, {})

        # Remove expired first
        expired_ids = [nid for nid, n in user_notifications.items() if n.is_expired]
        for nid in expired_ids:
            del user_notifications[nid]

        # If still over limit, remove oldest read notifications
        if len(user_notifications) > self._max_per_user:
            read_notifications = [
                (nid, n) for nid, n in user_notifications.items()
                if n.read
            ]
            read_notifications.sort(key=lambda x: x[1].created_at)

            while len(user_notifications) > self._max_per_user and read_notifications:
                nid, _ = read_notifications.pop(0)
                del user_notifications[nid]

    def get(self, user_id: str, notification_id: str) -> Optional[Notification]:
        """Get a specific notification.

        Args:
            user_id: User ID
            notification_id: Notification ID

        Returns:
            Notification or None
        """
        with self._lock:
            user_notifications = self._notifications.get(user_id, {})
            notification = user_notifications.get(notification_id)

            if notification and not notification.is_expired:
                return notification
            return None

    def get_user_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
        type_filter: Optional[NotificationType] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get notifications for a user.

        Args:
            user_id: User ID
            unread_only: Only return unread
            type_filter: Filter by type
            limit: Maximum to return

        Returns:
            List of notification dicts
        """
        with self._lock:
            user_notifications = self._notifications.get(user_id, {})

            notifications = [
                n for n in user_notifications.values()
                if not n.is_expired and not n.dismissed
            ]

            if unread_only:
                notifications = [n for n in notifications if not n.read]

            if type_filter:
                notifications = [n for n in notifications if n.type == type_filter]

            # Sort by priority (desc), then created_at (desc)
            notifications.sort(
                key=lambda n: (-n.priority.value, -n.created_at)
            )

            return [n.to_dict() for n in notifications[:limit]]

    def get_unread_count(self, user_id: str) -> int:
        """Get unread notification count.

        Args:
            user_id: User ID

        Returns:
            Unread count
        """
        with self._lock:
            user_notifications = self._notifications.get(user_id, {})
            return len([
                n for n in user_notifications.values()
                if not n.read and not n.is_expired and not n.dismissed
            ])

    def mark_read(self, user_id: str, notification_id: str) -> bool:
        """Mark a notification as read.

        Args:
            user_id: User ID
            notification_id: Notification ID

        Returns:
            True if marked
        """
        with self._lock:
            user_notifications = self._notifications.get(user_id, {})
            notification = user_notifications.get(notification_id)

            if notification and not notification.is_expired:
                notification.read = True
                notification.read_at = time.time()
                return True
            return False

    def mark_all_read(self, user_id: str) -> int:
        """Mark all notifications as read.

        Args:
            user_id: User ID

        Returns:
            Number marked
        """
        count = 0
        with self._lock:
            user_notifications = self._notifications.get(user_id, {})

            for notification in user_notifications.values():
                if not notification.read and not notification.is_expired:
                    notification.read = True
                    notification.read_at = time.time()
                    count += 1

        return count

    def dismiss(self, user_id: str, notification_id: str) -> bool:
        """Dismiss a notification.

        Args:
            user_id: User ID
            notification_id: Notification ID

        Returns:
            True if dismissed
        """
        with self._lock:
            user_notifications = self._notifications.get(user_id, {})
            notification = user_notifications.get(notification_id)

            if notification:
                notification.dismissed = True
                return True
            return False

    def dismiss_all(self, user_id: str) -> int:
        """Dismiss all notifications.

        Args:
            user_id: User ID

        Returns:
            Number dismissed
        """
        count = 0
        with self._lock:
            user_notifications = self._notifications.get(user_id, {})

            for notification in user_notifications.values():
                if not notification.dismissed:
                    notification.dismissed = True
                    count += 1

        return count

    def delete(self, user_id: str, notification_id: str) -> bool:
        """Delete a notification.

        Args:
            user_id: User ID
            notification_id: Notification ID

        Returns:
            True if deleted
        """
        with self._lock:
            user_notifications = self._notifications.get(user_id, {})
            if notification_id in user_notifications:
                del user_notifications[notification_id]
                return True
            return False

    def clear_user(self, user_id: str) -> int:
        """Clear all notifications for a user.

        Args:
            user_id: User ID

        Returns:
            Number cleared
        """
        with self._lock:
            count = len(self._notifications.get(user_id, {}))
            self._notifications[user_id] = {}
            return count

    def broadcast(
        self,
        user_ids: List[str],
        title: str,
        message: str,
        type: NotificationType = NotificationType.SYSTEM,
        priority: NotificationPriority = NotificationPriority.NORMAL
    ) -> int:
        """Send notification to multiple users.

        Args:
            user_ids: List of user IDs
            title: Notification title
            message: Notification message
            type: Notification type
            priority: Priority level

        Returns:
            Number of notifications sent
        """
        count = 0
        for user_id in user_ids:
            self.create(
                user_id=user_id,
                title=title,
                message=message,
                type=type,
                priority=priority
            )
            count += 1
        return count

    def cleanup_expired(self) -> int:
        """Remove expired notifications.

        Returns:
            Number removed
        """
        count = 0
        with self._lock:
            for user_id in list(self._notifications.keys()):
                user_notifications = self._notifications[user_id]
                expired_ids = [
                    nid for nid, n in user_notifications.items()
                    if n.is_expired
                ]
                for nid in expired_ids:
                    del user_notifications[nid]
                    count += 1

        return count

    def get_stats(self) -> Dict[str, Any]:
        """Get notification statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            all_notifications = []
            for user_notifications in self._notifications.values():
                all_notifications.extend(user_notifications.values())

        total = len(all_notifications)
        unread = len([n for n in all_notifications if not n.read])
        expired = len([n for n in all_notifications if n.is_expired])
        dismissed = len([n for n in all_notifications if n.dismissed])

        type_counts = {}
        for ntype in NotificationType:
            type_counts[ntype.value] = len([n for n in all_notifications if n.type == ntype])

        priority_counts = {}
        for priority in NotificationPriority:
            priority_counts[priority.name.lower()] = len([
                n for n in all_notifications if n.priority == priority
            ])

        return {
            "total_notifications": total,
            "unread_count": unread,
            "expired_count": expired,
            "dismissed_count": dismissed,
            "unique_users": len(self._notifications),
            "type_distribution": type_counts,
            "priority_distribution": priority_counts,
            "max_per_user": self._max_per_user,
        }


# Singleton instance
notification_service = NotificationService()
