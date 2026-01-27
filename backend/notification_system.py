"""
Notification System - Sprint 819

Multi-channel notification delivery system.

Features:
- Multiple channels (email, SMS, push, webhook)
- Template rendering
- Priority queuing
- Delivery tracking
- Retry logic
- Rate limiting
- User preferences
"""

import asyncio
import hashlib
import threading
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import (
    Any, Callable, Dict, Generic, List, Optional, Set, TypeVar, Union
)

T = TypeVar("T")


class NotificationChannel(str, Enum):
    """Notification delivery channels."""
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    WEBHOOK = "webhook"
    IN_APP = "in_app"
    SLACK = "slack"


class NotificationPriority(str, Enum):
    """Notification priority levels."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class DeliveryStatus(str, Enum):
    """Notification delivery status."""
    PENDING = "pending"
    QUEUED = "queued"
    SENDING = "sending"
    DELIVERED = "delivered"
    FAILED = "failed"
    BOUNCED = "bounced"
    SKIPPED = "skipped"


@dataclass
class NotificationRecipient:
    """Notification recipient."""
    id: str
    email: Optional[str] = None
    phone: Optional[str] = None
    device_tokens: List[str] = field(default_factory=list)
    webhook_url: Optional[str] = None
    slack_channel: Optional[str] = None
    preferences: Dict[str, bool] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def accepts_channel(self, channel: NotificationChannel) -> bool:
        """Check if recipient accepts this channel."""
        return self.preferences.get(channel.value, True)


@dataclass
class NotificationTemplate:
    """Notification template."""
    id: str
    name: str
    channel: NotificationChannel
    subject: Optional[str] = None
    body: str = ""
    html_body: Optional[str] = None
    variables: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def render(self, context: Dict[str, Any]) -> Dict[str, str]:
        """Render template with context."""
        result = {}

        if self.subject:
            result["subject"] = self._render_string(self.subject, context)

        result["body"] = self._render_string(self.body, context)

        if self.html_body:
            result["html_body"] = self._render_string(self.html_body, context)

        return result

    def _render_string(self, template: str, context: Dict[str, Any]) -> str:
        """Simple template rendering with {variable} syntax."""
        result = template
        for key, value in context.items():
            placeholder = "{" + key + "}"
            result = result.replace(placeholder, str(value))
        return result


@dataclass
class Notification:
    """A notification to be delivered."""
    id: str
    template_id: str
    recipient: NotificationRecipient
    channel: NotificationChannel
    context: Dict[str, Any] = field(default_factory=dict)
    priority: NotificationPriority = NotificationPriority.NORMAL
    status: DeliveryStatus = DeliveryStatus.PENDING
    created_at: datetime = field(default_factory=datetime.now)
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    error: Optional[str] = None
    retry_count: int = 0
    max_retries: int = 3
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_scheduled(self) -> bool:
        return self.scheduled_at is not None and self.scheduled_at > datetime.now()

    @property
    def can_retry(self) -> bool:
        return self.retry_count < self.max_retries


@dataclass
class DeliveryResult:
    """Result of notification delivery."""
    notification_id: str
    channel: NotificationChannel
    status: DeliveryStatus
    provider_id: Optional[str] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class NotificationProvider(ABC):
    """Abstract notification provider."""

    @property
    @abstractmethod
    def channel(self) -> NotificationChannel:
        """The channel this provider handles."""
        pass

    @abstractmethod
    async def send(
        self,
        recipient: NotificationRecipient,
        content: Dict[str, str],
        metadata: Dict[str, Any],
    ) -> DeliveryResult:
        """Send notification to recipient."""
        pass


class ConsoleProvider(NotificationProvider):
    """Console provider for testing."""

    @property
    def channel(self) -> NotificationChannel:
        return NotificationChannel.IN_APP

    async def send(
        self,
        recipient: NotificationRecipient,
        content: Dict[str, str],
        metadata: Dict[str, Any],
    ) -> DeliveryResult:
        print(f"[NOTIFICATION] To: {recipient.id}")
        if "subject" in content:
            print(f"  Subject: {content['subject']}")
        print(f"  Body: {content['body']}")

        return DeliveryResult(
            notification_id=metadata.get("notification_id", ""),
            channel=self.channel,
            status=DeliveryStatus.DELIVERED,
            provider_id=str(uuid.uuid4()),
        )


class MockEmailProvider(NotificationProvider):
    """Mock email provider for testing."""

    @property
    def channel(self) -> NotificationChannel:
        return NotificationChannel.EMAIL

    async def send(
        self,
        recipient: NotificationRecipient,
        content: Dict[str, str],
        metadata: Dict[str, Any],
    ) -> DeliveryResult:
        if not recipient.email:
            return DeliveryResult(
                notification_id=metadata.get("notification_id", ""),
                channel=self.channel,
                status=DeliveryStatus.FAILED,
                error="No email address",
            )

        # Simulate sending
        await asyncio.sleep(0.1)

        return DeliveryResult(
            notification_id=metadata.get("notification_id", ""),
            channel=self.channel,
            status=DeliveryStatus.DELIVERED,
            provider_id=str(uuid.uuid4()),
            metadata={"email": recipient.email},
        )


class MockSMSProvider(NotificationProvider):
    """Mock SMS provider for testing."""

    @property
    def channel(self) -> NotificationChannel:
        return NotificationChannel.SMS

    async def send(
        self,
        recipient: NotificationRecipient,
        content: Dict[str, str],
        metadata: Dict[str, Any],
    ) -> DeliveryResult:
        if not recipient.phone:
            return DeliveryResult(
                notification_id=metadata.get("notification_id", ""),
                channel=self.channel,
                status=DeliveryStatus.FAILED,
                error="No phone number",
            )

        await asyncio.sleep(0.1)

        return DeliveryResult(
            notification_id=metadata.get("notification_id", ""),
            channel=self.channel,
            status=DeliveryStatus.DELIVERED,
            provider_id=str(uuid.uuid4()),
            metadata={"phone": recipient.phone},
        )


class MockWebhookProvider(NotificationProvider):
    """Mock webhook provider for testing."""

    @property
    def channel(self) -> NotificationChannel:
        return NotificationChannel.WEBHOOK

    async def send(
        self,
        recipient: NotificationRecipient,
        content: Dict[str, str],
        metadata: Dict[str, Any],
    ) -> DeliveryResult:
        if not recipient.webhook_url:
            return DeliveryResult(
                notification_id=metadata.get("notification_id", ""),
                channel=self.channel,
                status=DeliveryStatus.FAILED,
                error="No webhook URL",
            )

        await asyncio.sleep(0.05)

        return DeliveryResult(
            notification_id=metadata.get("notification_id", ""),
            channel=self.channel,
            status=DeliveryStatus.DELIVERED,
            provider_id=str(uuid.uuid4()),
            metadata={"url": recipient.webhook_url},
        )


class TemplateRegistry:
    """Registry for notification templates."""

    def __init__(self):
        self._templates: Dict[str, NotificationTemplate] = {}

    def register(self, template: NotificationTemplate) -> None:
        """Register a template."""
        self._templates[template.id] = template

    def get(self, template_id: str) -> Optional[NotificationTemplate]:
        """Get template by ID."""
        return self._templates.get(template_id)

    def list_templates(self) -> List[NotificationTemplate]:
        """List all templates."""
        return list(self._templates.values())

    def create(
        self,
        template_id: str,
        name: str,
        channel: NotificationChannel,
        body: str,
        subject: Optional[str] = None,
        html_body: Optional[str] = None,
    ) -> NotificationTemplate:
        """Create and register a template."""
        template = NotificationTemplate(
            id=template_id,
            name=name,
            channel=channel,
            subject=subject,
            body=body,
            html_body=html_body,
        )
        self.register(template)
        return template


class RateLimiter:
    """Simple rate limiter for notifications."""

    def __init__(
        self,
        max_per_second: float = 10.0,
        max_per_recipient_per_hour: int = 100,
    ):
        self.max_per_second = max_per_second
        self.max_per_recipient_per_hour = max_per_recipient_per_hour
        self._last_send_time = 0.0
        self._recipient_counts: Dict[str, List[float]] = {}
        self._lock = threading.Lock()

    def acquire(self, recipient_id: str) -> bool:
        """Try to acquire rate limit permission."""
        with self._lock:
            now = time.time()

            # Global rate limit
            time_since_last = now - self._last_send_time
            min_interval = 1.0 / self.max_per_second
            if time_since_last < min_interval:
                return False

            # Per-recipient rate limit
            hour_ago = now - 3600
            if recipient_id in self._recipient_counts:
                # Clean old entries
                self._recipient_counts[recipient_id] = [
                    t for t in self._recipient_counts[recipient_id] if t > hour_ago
                ]
                if len(self._recipient_counts[recipient_id]) >= self.max_per_recipient_per_hour:
                    return False
            else:
                self._recipient_counts[recipient_id] = []

            # Update tracking
            self._last_send_time = now
            self._recipient_counts[recipient_id].append(now)
            return True

    async def wait_for_slot(self, recipient_id: str, timeout: float = 30.0) -> bool:
        """Wait for rate limit slot."""
        start = time.time()
        while time.time() - start < timeout:
            if self.acquire(recipient_id):
                return True
            await asyncio.sleep(0.1)
        return False


class NotificationQueue:
    """Priority queue for notifications."""

    def __init__(self):
        self._queues: Dict[NotificationPriority, List[Notification]] = {
            priority: [] for priority in NotificationPriority
        }
        self._lock = threading.Lock()

    def enqueue(self, notification: Notification) -> None:
        """Add notification to queue."""
        with self._lock:
            self._queues[notification.priority].append(notification)
            notification.status = DeliveryStatus.QUEUED

    def dequeue(self) -> Optional[Notification]:
        """Get next notification from queue (highest priority first)."""
        with self._lock:
            for priority in [
                NotificationPriority.URGENT,
                NotificationPriority.HIGH,
                NotificationPriority.NORMAL,
                NotificationPriority.LOW,
            ]:
                queue = self._queues[priority]
                for i, notification in enumerate(queue):
                    if not notification.is_scheduled:
                        return queue.pop(i)
            return None

    def size(self) -> int:
        """Get total queue size."""
        with self._lock:
            return sum(len(q) for q in self._queues.values())

    def clear(self) -> int:
        """Clear all queues."""
        with self._lock:
            total = sum(len(q) for q in self._queues.values())
            for queue in self._queues.values():
                queue.clear()
            return total


class NotificationService:
    """Main notification service.

    Usage:
        service = NotificationService()

        # Register providers
        service.register_provider(MockEmailProvider())
        service.register_provider(MockSMSProvider())

        # Create template
        service.templates.create(
            "welcome",
            "Welcome Email",
            NotificationChannel.EMAIL,
            "Hello {name}, welcome to our service!",
            subject="Welcome!"
        )

        # Send notification
        recipient = NotificationRecipient(
            id="user_123",
            email="user@example.com"
        )

        await service.send(
            template_id="welcome",
            recipient=recipient,
            context={"name": "John"}
        )
    """

    def __init__(
        self,
        rate_limiter: Optional[RateLimiter] = None,
        max_workers: int = 5,
    ):
        self._providers: Dict[NotificationChannel, NotificationProvider] = {}
        self._templates = TemplateRegistry()
        self._queue = NotificationQueue()
        self._rate_limiter = rate_limiter or RateLimiter()
        self._max_workers = max_workers
        self._notifications: Dict[str, Notification] = {}
        self._running = False
        self._worker_task: Optional[asyncio.Task] = None

    @property
    def templates(self) -> TemplateRegistry:
        return self._templates

    def register_provider(self, provider: NotificationProvider) -> None:
        """Register a notification provider."""
        self._providers[provider.channel] = provider

    def get_provider(self, channel: NotificationChannel) -> Optional[NotificationProvider]:
        """Get provider for channel."""
        return self._providers.get(channel)

    async def send(
        self,
        template_id: str,
        recipient: NotificationRecipient,
        context: Optional[Dict[str, Any]] = None,
        channel: Optional[NotificationChannel] = None,
        priority: NotificationPriority = NotificationPriority.NORMAL,
        scheduled_at: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Notification:
        """Send a notification."""
        template = self._templates.get(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")

        # Use template channel if not specified
        notification_channel = channel or template.channel

        # Check recipient preferences
        if not recipient.accepts_channel(notification_channel):
            notification = Notification(
                id=str(uuid.uuid4()),
                template_id=template_id,
                recipient=recipient,
                channel=notification_channel,
                context=context or {},
                priority=priority,
                status=DeliveryStatus.SKIPPED,
                scheduled_at=scheduled_at,
                metadata=metadata or {},
            )
            self._notifications[notification.id] = notification
            return notification

        notification = Notification(
            id=str(uuid.uuid4()),
            template_id=template_id,
            recipient=recipient,
            channel=notification_channel,
            context=context or {},
            priority=priority,
            scheduled_at=scheduled_at,
            metadata=metadata or {},
        )

        self._notifications[notification.id] = notification
        self._queue.enqueue(notification)

        return notification

    async def send_immediate(
        self,
        template_id: str,
        recipient: NotificationRecipient,
        context: Optional[Dict[str, Any]] = None,
        channel: Optional[NotificationChannel] = None,
    ) -> DeliveryResult:
        """Send notification immediately (bypass queue)."""
        template = self._templates.get(template_id)
        if not template:
            raise ValueError(f"Template not found: {template_id}")

        notification_channel = channel or template.channel
        provider = self._providers.get(notification_channel)
        if not provider:
            raise ValueError(f"No provider for channel: {notification_channel}")

        # Render content
        content = template.render(context or {})

        # Send
        result = await provider.send(
            recipient=recipient,
            content=content,
            metadata={"template_id": template_id},
        )

        return result

    async def send_bulk(
        self,
        template_id: str,
        recipients: List[NotificationRecipient],
        context: Optional[Dict[str, Any]] = None,
        channel: Optional[NotificationChannel] = None,
        priority: NotificationPriority = NotificationPriority.NORMAL,
    ) -> List[Notification]:
        """Send notification to multiple recipients."""
        notifications = []
        for recipient in recipients:
            notification = await self.send(
                template_id=template_id,
                recipient=recipient,
                context=context,
                channel=channel,
                priority=priority,
            )
            notifications.append(notification)
        return notifications

    async def _process_notification(self, notification: Notification) -> DeliveryResult:
        """Process a single notification."""
        template = self._templates.get(notification.template_id)
        if not template:
            return DeliveryResult(
                notification_id=notification.id,
                channel=notification.channel,
                status=DeliveryStatus.FAILED,
                error="Template not found",
            )

        provider = self._providers.get(notification.channel)
        if not provider:
            return DeliveryResult(
                notification_id=notification.id,
                channel=notification.channel,
                status=DeliveryStatus.FAILED,
                error="No provider for channel",
            )

        # Wait for rate limit
        if not await self._rate_limiter.wait_for_slot(notification.recipient.id):
            return DeliveryResult(
                notification_id=notification.id,
                channel=notification.channel,
                status=DeliveryStatus.FAILED,
                error="Rate limit exceeded",
            )

        notification.status = DeliveryStatus.SENDING
        notification.sent_at = datetime.now()

        try:
            content = template.render(notification.context)
            result = await provider.send(
                recipient=notification.recipient,
                content=content,
                metadata={
                    "notification_id": notification.id,
                    **notification.metadata,
                },
            )

            notification.status = result.status
            if result.status == DeliveryStatus.DELIVERED:
                notification.delivered_at = datetime.now()
            elif result.status == DeliveryStatus.FAILED:
                notification.error = result.error

            return result

        except Exception as e:
            notification.status = DeliveryStatus.FAILED
            notification.error = str(e)
            return DeliveryResult(
                notification_id=notification.id,
                channel=notification.channel,
                status=DeliveryStatus.FAILED,
                error=str(e),
            )

    async def _worker_loop(self) -> None:
        """Background worker loop."""
        while self._running:
            notification = self._queue.dequeue()
            if notification:
                result = await self._process_notification(notification)

                # Retry on failure
                if (
                    result.status == DeliveryStatus.FAILED
                    and notification.can_retry
                ):
                    notification.retry_count += 1
                    notification.status = DeliveryStatus.PENDING
                    self._queue.enqueue(notification)
            else:
                await asyncio.sleep(0.1)

    def start(self) -> None:
        """Start background processing."""
        if self._running:
            return
        self._running = True
        self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self) -> None:
        """Stop background processing."""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    def get_notification(self, notification_id: str) -> Optional[Notification]:
        """Get notification by ID."""
        return self._notifications.get(notification_id)

    def get_stats(self) -> Dict[str, Any]:
        """Get service statistics."""
        status_counts = {status.value: 0 for status in DeliveryStatus}
        for notification in self._notifications.values():
            status_counts[notification.status.value] += 1

        return {
            "total_notifications": len(self._notifications),
            "queue_size": self._queue.size(),
            "status_counts": status_counts,
            "providers": list(self._providers.keys()),
        }


class NotificationBuilder:
    """Fluent builder for notifications.

    Usage:
        notification = (
            NotificationBuilder(service)
            .template("welcome")
            .to(recipient)
            .with_context({"name": "John"})
            .priority(NotificationPriority.HIGH)
            .build()
        )

        await notification.send()
    """

    def __init__(self, service: NotificationService):
        self._service = service
        self._template_id: Optional[str] = None
        self._recipient: Optional[NotificationRecipient] = None
        self._context: Dict[str, Any] = {}
        self._channel: Optional[NotificationChannel] = None
        self._priority = NotificationPriority.NORMAL
        self._scheduled_at: Optional[datetime] = None
        self._metadata: Dict[str, Any] = {}

    def template(self, template_id: str) -> "NotificationBuilder":
        self._template_id = template_id
        return self

    def to(self, recipient: NotificationRecipient) -> "NotificationBuilder":
        self._recipient = recipient
        return self

    def with_context(self, context: Dict[str, Any]) -> "NotificationBuilder":
        self._context.update(context)
        return self

    def via(self, channel: NotificationChannel) -> "NotificationBuilder":
        self._channel = channel
        return self

    def priority(self, priority: NotificationPriority) -> "NotificationBuilder":
        self._priority = priority
        return self

    def schedule(self, scheduled_at: datetime) -> "NotificationBuilder":
        self._scheduled_at = scheduled_at
        return self

    def with_metadata(self, metadata: Dict[str, Any]) -> "NotificationBuilder":
        self._metadata.update(metadata)
        return self

    async def send(self) -> Notification:
        """Send the notification."""
        if not self._template_id:
            raise ValueError("Template ID is required")
        if not self._recipient:
            raise ValueError("Recipient is required")

        return await self._service.send(
            template_id=self._template_id,
            recipient=self._recipient,
            context=self._context,
            channel=self._channel,
            priority=self._priority,
            scheduled_at=self._scheduled_at,
            metadata=self._metadata,
        )


# Convenience functions
def create_service(
    providers: Optional[List[NotificationProvider]] = None,
) -> NotificationService:
    """Create a notification service with default providers."""
    service = NotificationService()

    if providers:
        for provider in providers:
            service.register_provider(provider)
    else:
        # Register mock providers
        service.register_provider(ConsoleProvider())
        service.register_provider(MockEmailProvider())
        service.register_provider(MockSMSProvider())
        service.register_provider(MockWebhookProvider())

    return service
