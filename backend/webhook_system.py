"""
Webhook System - Sprint 615

Outgoing webhook notifications for events.

Features:
- Webhook registration
- Event types
- Retry with backoff
- Signature verification
- Delivery tracking
"""

import asyncio
import hashlib
import hmac
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Set
from enum import Enum
from threading import Lock
import aiohttp
import json


class EventType(str, Enum):
    """Webhook event types."""
    # Message events
    MESSAGE_CREATED = "message.created"
    MESSAGE_COMPLETED = "message.completed"
    MESSAGE_ERROR = "message.error"

    # Session events
    SESSION_STARTED = "session.started"
    SESSION_ENDED = "session.ended"

    # TTS events
    TTS_STARTED = "tts.started"
    TTS_COMPLETED = "tts.completed"
    TTS_ERROR = "tts.error"

    # User events
    USER_JOINED = "user.joined"
    USER_LEFT = "user.left"

    # System events
    SYSTEM_HEALTH = "system.health"
    SYSTEM_ERROR = "system.error"


class DeliveryStatus(str, Enum):
    """Webhook delivery status."""
    PENDING = "pending"
    DELIVERED = "delivered"
    FAILED = "failed"
    RETRYING = "retrying"


@dataclass
class Webhook:
    """A webhook endpoint."""
    id: str
    url: str
    secret: str  # For HMAC signature
    events: Set[EventType]
    active: bool = True
    name: str = ""
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "events": [e.value for e in self.events],
            "active": self.active,
            "name": self.name,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "metadata": self.metadata,
        }


@dataclass
class WebhookDelivery:
    """A webhook delivery attempt."""
    id: str
    webhook_id: str
    event_type: EventType
    payload: Dict[str, Any]
    status: DeliveryStatus = DeliveryStatus.PENDING
    attempts: int = 0
    max_attempts: int = 5
    response_code: Optional[int] = None
    response_body: Optional[str] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    delivered_at: Optional[float] = None
    next_retry_at: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "webhook_id": self.webhook_id,
            "event_type": self.event_type.value,
            "payload": self.payload,
            "status": self.status.value,
            "attempts": self.attempts,
            "max_attempts": self.max_attempts,
            "response_code": self.response_code,
            "error": self.error,
            "created_at": self.created_at,
            "delivered_at": self.delivered_at,
            "next_retry_at": self.next_retry_at,
        }


class WebhookManager:
    """Manage webhooks and deliveries.

    Usage:
        manager = WebhookManager()

        # Register a webhook
        webhook = manager.register(
            url="https://example.com/webhook",
            events=[EventType.MESSAGE_CREATED, EventType.TTS_COMPLETED]
        )

        # Emit an event
        await manager.emit(
            EventType.MESSAGE_CREATED,
            {"message_id": "123", "content": "Hello"}
        )
    """

    def __init__(self, timeout: float = 10.0):
        """Initialize webhook manager.

        Args:
            timeout: Request timeout in seconds
        """
        self._webhooks: Dict[str, Webhook] = {}
        self._deliveries: Dict[str, WebhookDelivery] = {}
        self._lock = Lock()
        self._timeout = timeout
        self._retry_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the retry worker."""
        if self._retry_task is None:
            self._retry_task = asyncio.create_task(self._retry_worker())

    async def stop(self):
        """Stop the retry worker."""
        if self._retry_task:
            self._retry_task.cancel()
            try:
                await self._retry_task
            except asyncio.CancelledError:
                pass
            self._retry_task = None

    def register(
        self,
        url: str,
        events: List[EventType],
        name: str = "",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Webhook:
        """Register a new webhook.

        Args:
            url: Webhook URL
            events: Event types to subscribe to
            name: Webhook name
            metadata: Additional metadata

        Returns:
            Created webhook
        """
        webhook_id = str(uuid.uuid4())[:8]
        secret = hashlib.sha256(
            f"{webhook_id}{time.time()}".encode()
        ).hexdigest()[:32]

        webhook = Webhook(
            id=webhook_id,
            url=url,
            secret=secret,
            events=set(events),
            name=name or f"Webhook-{webhook_id}",
            metadata=metadata or {},
        )

        with self._lock:
            self._webhooks[webhook_id] = webhook

        return webhook

    def get_webhook(self, webhook_id: str) -> Optional[Dict[str, Any]]:
        """Get webhook by ID.

        Args:
            webhook_id: Webhook ID

        Returns:
            Webhook details with secret or None
        """
        with self._lock:
            webhook = self._webhooks.get(webhook_id)
            if webhook:
                data = webhook.to_dict()
                data["secret"] = webhook.secret
                return data
            return None

    def list_webhooks(self, active_only: bool = True) -> List[Dict[str, Any]]:
        """List all webhooks.

        Args:
            active_only: Only return active webhooks

        Returns:
            List of webhooks
        """
        with self._lock:
            webhooks = list(self._webhooks.values())

        if active_only:
            webhooks = [w for w in webhooks if w.active]

        return [w.to_dict() for w in webhooks]

    def update_webhook(
        self,
        webhook_id: str,
        url: Optional[str] = None,
        events: Optional[List[EventType]] = None,
        active: Optional[bool] = None,
        name: Optional[str] = None
    ) -> bool:
        """Update a webhook.

        Args:
            webhook_id: Webhook ID
            url: New URL
            events: New event list
            active: New active state
            name: New name

        Returns:
            True if updated
        """
        with self._lock:
            webhook = self._webhooks.get(webhook_id)
            if not webhook:
                return False

            if url is not None:
                webhook.url = url
            if events is not None:
                webhook.events = set(events)
            if active is not None:
                webhook.active = active
            if name is not None:
                webhook.name = name

            webhook.updated_at = time.time()
            return True

    def delete_webhook(self, webhook_id: str) -> bool:
        """Delete a webhook.

        Args:
            webhook_id: Webhook ID

        Returns:
            True if deleted
        """
        with self._lock:
            if webhook_id in self._webhooks:
                del self._webhooks[webhook_id]
                return True
            return False

    def _sign_payload(self, payload: str, secret: str) -> str:
        """Create HMAC signature for payload.

        Args:
            payload: JSON payload string
            secret: Webhook secret

        Returns:
            HMAC signature
        """
        return hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()

    async def emit(
        self,
        event_type: EventType,
        payload: Dict[str, Any]
    ) -> List[str]:
        """Emit an event to all subscribed webhooks.

        Args:
            event_type: Event type
            payload: Event payload

        Returns:
            List of delivery IDs
        """
        # Find subscribed webhooks
        with self._lock:
            webhooks = [
                w for w in self._webhooks.values()
                if w.active and event_type in w.events
            ]

        if not webhooks:
            return []

        # Create deliveries
        delivery_ids = []
        for webhook in webhooks:
            delivery_id = str(uuid.uuid4())[:8]
            delivery = WebhookDelivery(
                id=delivery_id,
                webhook_id=webhook.id,
                event_type=event_type,
                payload=payload,
            )

            with self._lock:
                self._deliveries[delivery_id] = delivery

            delivery_ids.append(delivery_id)

            # Attempt immediate delivery
            asyncio.create_task(self._deliver(delivery, webhook))

        return delivery_ids

    async def _deliver(
        self,
        delivery: WebhookDelivery,
        webhook: Webhook
    ):
        """Attempt to deliver a webhook.

        Args:
            delivery: Delivery to send
            webhook: Target webhook
        """
        delivery.attempts += 1
        delivery.status = DeliveryStatus.PENDING

        # Build full payload
        full_payload = {
            "event": delivery.event_type.value,
            "timestamp": time.time(),
            "delivery_id": delivery.id,
            "data": delivery.payload,
        }

        payload_json = json.dumps(full_payload)
        signature = self._sign_payload(payload_json, webhook.secret)

        headers = {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": delivery.event_type.value,
            "X-Webhook-Delivery": delivery.id,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    webhook.url,
                    data=payload_json,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self._timeout)
                ) as response:
                    delivery.response_code = response.status
                    delivery.response_body = await response.text()

                    if 200 <= response.status < 300:
                        delivery.status = DeliveryStatus.DELIVERED
                        delivery.delivered_at = time.time()
                    else:
                        raise Exception(f"HTTP {response.status}")

        except asyncio.TimeoutError:
            delivery.error = "Request timed out"
            self._schedule_retry(delivery)

        except Exception as e:
            delivery.error = str(e)
            self._schedule_retry(delivery)

    def _schedule_retry(self, delivery: WebhookDelivery):
        """Schedule a retry for failed delivery.

        Args:
            delivery: Failed delivery
        """
        if delivery.attempts >= delivery.max_attempts:
            delivery.status = DeliveryStatus.FAILED
            return

        # Exponential backoff: 1s, 2s, 4s, 8s, 16s...
        delay = 2 ** (delivery.attempts - 1)
        delivery.next_retry_at = time.time() + delay
        delivery.status = DeliveryStatus.RETRYING

    async def _retry_worker(self):
        """Background worker that retries failed deliveries."""
        while True:
            try:
                await asyncio.sleep(1)

                now = time.time()
                to_retry = []

                with self._lock:
                    for delivery in self._deliveries.values():
                        if (delivery.status == DeliveryStatus.RETRYING and
                            delivery.next_retry_at and
                            delivery.next_retry_at <= now):
                            webhook = self._webhooks.get(delivery.webhook_id)
                            if webhook:
                                to_retry.append((delivery, webhook))

                for delivery, webhook in to_retry:
                    await self._deliver(delivery, webhook)

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Retry worker error: {e}")

    def get_delivery(self, delivery_id: str) -> Optional[Dict[str, Any]]:
        """Get delivery status.

        Args:
            delivery_id: Delivery ID

        Returns:
            Delivery details or None
        """
        with self._lock:
            delivery = self._deliveries.get(delivery_id)
            return delivery.to_dict() if delivery else None

    def get_deliveries(
        self,
        webhook_id: Optional[str] = None,
        status: Optional[DeliveryStatus] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get deliveries.

        Args:
            webhook_id: Filter by webhook
            status: Filter by status
            limit: Max results

        Returns:
            List of deliveries
        """
        with self._lock:
            deliveries = list(self._deliveries.values())

        if webhook_id:
            deliveries = [d for d in deliveries if d.webhook_id == webhook_id]
        if status:
            deliveries = [d for d in deliveries if d.status == status]

        # Sort by created_at desc
        deliveries.sort(key=lambda d: d.created_at, reverse=True)

        return [d.to_dict() for d in deliveries[:limit]]

    def get_stats(self) -> Dict[str, Any]:
        """Get webhook statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            webhooks = list(self._webhooks.values())
            deliveries = list(self._deliveries.values())

        status_counts = {}
        for status in DeliveryStatus:
            status_counts[status.value] = len([d for d in deliveries if d.status == status])

        event_counts = {}
        for delivery in deliveries:
            event = delivery.event_type.value
            event_counts[event] = event_counts.get(event, 0) + 1

        return {
            "total_webhooks": len(webhooks),
            "active_webhooks": len([w for w in webhooks if w.active]),
            "total_deliveries": len(deliveries),
            "delivery_status": status_counts,
            "event_counts": event_counts,
        }

    def clear_old_deliveries(self, older_than_seconds: float = 86400) -> int:
        """Clear old deliveries.

        Args:
            older_than_seconds: Age threshold

        Returns:
            Number cleared
        """
        cutoff = time.time() - older_than_seconds
        cleared = 0

        with self._lock:
            to_remove = [
                d_id for d_id, d in self._deliveries.items()
                if d.created_at < cutoff
            ]
            for d_id in to_remove:
                del self._deliveries[d_id]
                cleared += 1

        return cleared


# Singleton instance
webhook_manager = WebhookManager()
