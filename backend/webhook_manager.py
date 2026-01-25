"""
Webhook Manager - Sprint 671

Outgoing webhook management.

Features:
- Webhook registration
- Retry with backoff
- Signature verification
- Event filtering
- Delivery tracking
"""

import time
import uuid
import hmac
import hashlib
import asyncio
import aiohttp
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Set
from enum import Enum
import threading
import json


class WebhookStatus(str, Enum):
    """Webhook status."""
    ACTIVE = "active"
    PAUSED = "paused"
    FAILED = "failed"


class DeliveryStatus(str, Enum):
    """Delivery attempt status."""
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"


@dataclass
class Webhook:
    """Webhook configuration."""
    id: str
    url: str
    events: Set[str]
    secret: str
    status: WebhookStatus = WebhookStatus.ACTIVE
    created_at: float = field(default_factory=time.time)
    headers: Dict[str, str] = field(default_factory=dict)
    max_retries: int = 3
    timeout: int = 30
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DeliveryAttempt:
    """Single delivery attempt."""
    id: str
    webhook_id: str
    event: str
    payload: Dict[str, Any]
    status: DeliveryStatus = DeliveryStatus.PENDING
    attempts: int = 0
    response_code: Optional[int] = None
    response_body: Optional[str] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    delivered_at: Optional[float] = None


class WebhookManager:
    """Webhook management system.

    Usage:
        manager = WebhookManager()

        # Register webhook
        webhook = manager.register(
            url="https://api.example.com/webhook",
            events={"user.created", "order.completed"},
            secret="my_secret_key",
        )

        # Trigger event
        await manager.trigger("user.created", {"user_id": 123, "email": "test@example.com"})

        # Check deliveries
        deliveries = manager.get_deliveries(webhook.id)
    """

    def __init__(self):
        """Initialize webhook manager."""
        self._webhooks: Dict[str, Webhook] = {}
        self._deliveries: Dict[str, DeliveryAttempt] = {}
        self._lock = threading.Lock()
        self._stats = {
            "total_webhooks": 0,
            "total_deliveries": 0,
            "successful_deliveries": 0,
            "failed_deliveries": 0,
        }

    def register(
        self,
        url: str,
        events: Set[str],
        secret: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        max_retries: int = 3,
        timeout: int = 30,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Webhook:
        """Register new webhook.

        Args:
            url: Webhook endpoint URL
            events: Events to subscribe to
            secret: Signing secret
            headers: Custom headers
            max_retries: Max retry attempts
            timeout: Request timeout
            metadata: Additional metadata

        Returns:
            Registered webhook
        """
        webhook_id = str(uuid.uuid4())[:8]
        secret = secret or self._generate_secret()

        webhook = Webhook(
            id=webhook_id,
            url=url,
            events=events,
            secret=secret,
            headers=headers or {},
            max_retries=max_retries,
            timeout=timeout,
            metadata=metadata or {},
        )

        with self._lock:
            self._webhooks[webhook_id] = webhook
            self._stats["total_webhooks"] += 1

        return webhook

    def unregister(self, webhook_id: str) -> bool:
        """Unregister webhook."""
        with self._lock:
            return self._webhooks.pop(webhook_id, None) is not None

    def get(self, webhook_id: str) -> Optional[Webhook]:
        """Get webhook by ID."""
        return self._webhooks.get(webhook_id)

    def list_webhooks(self, event: Optional[str] = None) -> List[Webhook]:
        """List webhooks, optionally filtered by event."""
        webhooks = list(self._webhooks.values())
        if event:
            webhooks = [w for w in webhooks if event in w.events or "*" in w.events]
        return webhooks

    def pause(self, webhook_id: str) -> bool:
        """Pause webhook."""
        webhook = self._webhooks.get(webhook_id)
        if webhook:
            webhook.status = WebhookStatus.PAUSED
            return True
        return False

    def resume(self, webhook_id: str) -> bool:
        """Resume webhook."""
        webhook = self._webhooks.get(webhook_id)
        if webhook:
            webhook.status = WebhookStatus.ACTIVE
            return True
        return False

    async def trigger(
        self,
        event: str,
        payload: Dict[str, Any],
        webhook_ids: Optional[List[str]] = None,
    ) -> List[str]:
        """Trigger webhook event.

        Args:
            event: Event name
            payload: Event payload
            webhook_ids: Specific webhooks (None for all matching)

        Returns:
            List of delivery IDs
        """
        delivery_ids = []

        # Find matching webhooks
        if webhook_ids:
            webhooks = [self._webhooks[wid] for wid in webhook_ids if wid in self._webhooks]
        else:
            webhooks = [w for w in self._webhooks.values() 
                       if w.status == WebhookStatus.ACTIVE and (event in w.events or "*" in w.events)]

        # Create deliveries
        for webhook in webhooks:
            delivery_id = await self._create_delivery(webhook, event, payload)
            delivery_ids.append(delivery_id)

        return delivery_ids

    async def _create_delivery(
        self,
        webhook: Webhook,
        event: str,
        payload: Dict[str, Any],
    ) -> str:
        """Create and execute delivery."""
        delivery_id = str(uuid.uuid4())[:12]

        delivery = DeliveryAttempt(
            id=delivery_id,
            webhook_id=webhook.id,
            event=event,
            payload=payload,
        )

        with self._lock:
            self._deliveries[delivery_id] = delivery
            self._stats["total_deliveries"] += 1

        # Execute delivery
        asyncio.create_task(self._execute_delivery(webhook, delivery))

        return delivery_id

    async def _execute_delivery(
        self,
        webhook: Webhook,
        delivery: DeliveryAttempt,
    ):
        """Execute delivery with retries."""
        backoff = 1

        while delivery.attempts < webhook.max_retries:
            delivery.attempts += 1
            delivery.status = DeliveryStatus.RETRYING if delivery.attempts > 1 else DeliveryStatus.PENDING

            try:
                # Prepare payload
                body = json.dumps({
                    "event": delivery.event,
                    "payload": delivery.payload,
                    "timestamp": time.time(),
                    "delivery_id": delivery.id,
                })

                # Sign payload
                signature = self._sign_payload(body, webhook.secret)

                headers = {
                    "Content-Type": "application/json",
                    "X-Webhook-Signature": signature,
                    "X-Webhook-Event": delivery.event,
                    "X-Webhook-Delivery": delivery.id,
                    **webhook.headers,
                }

                async with aiohttp.ClientSession() as session:
                    async with session.post(
                        webhook.url,
                        data=body,
                        headers=headers,
                        timeout=aiohttp.ClientTimeout(total=webhook.timeout),
                    ) as response:
                        delivery.response_code = response.status
                        delivery.response_body = await response.text()

                        if 200 <= response.status < 300:
                            delivery.status = DeliveryStatus.SUCCESS
                            delivery.delivered_at = time.time()
                            with self._lock:
                                self._stats["successful_deliveries"] += 1
                            return
                        else:
                            delivery.error = f"HTTP {response.status}"

            except asyncio.TimeoutError:
                delivery.error = "Timeout"
            except Exception as e:
                delivery.error = str(e)

            # Wait before retry
            if delivery.attempts < webhook.max_retries:
                await asyncio.sleep(backoff)
                backoff *= 2

        # All retries failed
        delivery.status = DeliveryStatus.FAILED
        with self._lock:
            self._stats["failed_deliveries"] += 1

        # Mark webhook as failed after too many failures
        recent_failures = sum(
            1 for d in self._deliveries.values()
            if d.webhook_id == webhook.id and d.status == DeliveryStatus.FAILED
        )
        if recent_failures >= 5:
            webhook.status = WebhookStatus.FAILED

    def _sign_payload(self, payload: str, secret: str) -> str:
        """Sign payload with HMAC-SHA256."""
        return hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256,
        ).hexdigest()

    def _generate_secret(self) -> str:
        """Generate webhook secret."""
        return uuid.uuid4().hex

    def verify_signature(
        self,
        payload: str,
        signature: str,
        secret: str,
    ) -> bool:
        """Verify webhook signature."""
        expected = self._sign_payload(payload, secret)
        return hmac.compare_digest(signature, expected)

    def get_deliveries(
        self,
        webhook_id: Optional[str] = None,
        status: Optional[DeliveryStatus] = None,
        limit: int = 100,
    ) -> List[DeliveryAttempt]:
        """Get delivery attempts."""
        deliveries = list(self._deliveries.values())

        if webhook_id:
            deliveries = [d for d in deliveries if d.webhook_id == webhook_id]
        if status:
            deliveries = [d for d in deliveries if d.status == status]

        deliveries.sort(key=lambda d: d.created_at, reverse=True)
        return deliveries[:limit]

    def get_stats(self) -> dict:
        """Get webhook statistics."""
        return {
            **self._stats,
            "active_webhooks": sum(1 for w in self._webhooks.values() if w.status == WebhookStatus.ACTIVE),
            "pending_deliveries": sum(1 for d in self._deliveries.values() if d.status in (DeliveryStatus.PENDING, DeliveryStatus.RETRYING)),
        }

    def cleanup_old_deliveries(self, max_age_hours: int = 24) -> int:
        """Remove old delivery records."""
        cutoff = time.time() - (max_age_hours * 3600)
        count = 0
        with self._lock:
            old_ids = [did for did, d in self._deliveries.items() if d.created_at < cutoff]
            for did in old_ids:
                del self._deliveries[did]
                count += 1
        return count


# Singleton instance
webhook_manager = WebhookManager()
