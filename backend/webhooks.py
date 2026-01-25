"""
Webhook System - Sprint 635

Webhook delivery and management.

Features:
- Webhook registration
- Event subscription
- Delivery with retry
- Signature verification
- Delivery history
"""

import time
import hmac
import hashlib
import asyncio
import json
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Set, Callable
from enum import Enum
from threading import Lock
import httpx


class WebhookEventType(str, Enum):
    """Common webhook event types."""
    MESSAGE_CREATED = "message.created"
    MESSAGE_UPDATED = "message.updated"
    MESSAGE_DELETED = "message.deleted"
    SESSION_STARTED = "session.started"
    SESSION_ENDED = "session.ended"
    USER_JOINED = "user.joined"
    USER_LEFT = "user.left"
    AUDIO_GENERATED = "audio.generated"
    ERROR_OCCURRED = "error.occurred"
    CUSTOM = "custom"


class DeliveryStatus(str, Enum):
    """Webhook delivery status."""
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    RETRYING = "retrying"


@dataclass
class WebhookEndpoint:
    """A webhook endpoint configuration."""
    id: str
    url: str
    secret: str
    events: Set[str] = field(default_factory=set)
    enabled: bool = True
    description: str = ""
    created_at: float = field(default_factory=time.time)
    headers: Dict[str, str] = field(default_factory=dict)
    
    # Retry configuration
    max_retries: int = 3
    retry_delay: float = 1.0  # seconds
    timeout: float = 30.0  # seconds

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "events": list(self.events),
            "enabled": self.enabled,
            "description": self.description,
            "created_at": self.created_at,
            "max_retries": self.max_retries,
            "timeout": self.timeout,
        }


@dataclass
class WebhookDelivery:
    """A webhook delivery attempt."""
    id: str
    endpoint_id: str
    event_type: str
    payload: Dict[str, Any]
    status: DeliveryStatus = DeliveryStatus.PENDING
    attempts: int = 0
    last_attempt_at: Optional[float] = None
    response_status: Optional[int] = None
    response_body: Optional[str] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "endpoint_id": self.endpoint_id,
            "event_type": self.event_type,
            "status": self.status.value,
            "attempts": self.attempts,
            "last_attempt_at": self.last_attempt_at,
            "response_status": self.response_status,
            "error": self.error,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }


class WebhookManager:
    """Webhook management and delivery.

    Usage:
        manager = WebhookManager()

        # Register endpoint
        endpoint = manager.register_endpoint(
            url="https://example.com/webhook",
            secret="my-secret",
            events=["message.created", "session.started"]
        )

        # Trigger event
        await manager.trigger_event(
            "message.created",
            {"message_id": "123", "content": "Hello"}
        )
    """

    def __init__(self):
        """Initialize manager."""
        self._endpoints: Dict[str, WebhookEndpoint] = {}
        self._deliveries: List[WebhookDelivery] = []
        self._lock = Lock()
        self._delivery_queue: asyncio.Queue = asyncio.Queue()
        self._running = False
        self._worker_task: Optional[asyncio.Task] = None
        self._max_history = 1000
        self._id_counter = 0
        self._event_handlers: Dict[str, List[Callable]] = {}

    def _generate_id(self, prefix: str = "") -> str:
        """Generate unique ID."""
        self._id_counter += 1
        return f"{prefix}{int(time.time() * 1000)}{self._id_counter}"

    def register_endpoint(
        self,
        url: str,
        secret: str,
        events: Optional[List[str]] = None,
        description: str = "",
        headers: Optional[Dict[str, str]] = None,
        max_retries: int = 3,
        timeout: float = 30.0
    ) -> WebhookEndpoint:
        """Register a webhook endpoint.

        Args:
            url: Endpoint URL
            secret: Secret for signing
            events: Event types to subscribe
            description: Description
            headers: Custom headers
            max_retries: Max retry attempts
            timeout: Request timeout

        Returns:
            Created endpoint
        """
        endpoint = WebhookEndpoint(
            id=self._generate_id("wh_"),
            url=url,
            secret=secret,
            events=set(events or []),
            description=description,
            headers=headers or {},
            max_retries=max_retries,
            timeout=timeout,
        )

        with self._lock:
            self._endpoints[endpoint.id] = endpoint

        return endpoint

    def update_endpoint(
        self,
        endpoint_id: str,
        url: Optional[str] = None,
        secret: Optional[str] = None,
        events: Optional[List[str]] = None,
        enabled: Optional[bool] = None,
        description: Optional[str] = None
    ) -> Optional[WebhookEndpoint]:
        """Update an endpoint."""
        with self._lock:
            endpoint = self._endpoints.get(endpoint_id)
            if not endpoint:
                return None

            if url is not None:
                endpoint.url = url
            if secret is not None:
                endpoint.secret = secret
            if events is not None:
                endpoint.events = set(events)
            if enabled is not None:
                endpoint.enabled = enabled
            if description is not None:
                endpoint.description = description

            return endpoint

    def delete_endpoint(self, endpoint_id: str) -> bool:
        """Delete an endpoint."""
        with self._lock:
            if endpoint_id in self._endpoints:
                del self._endpoints[endpoint_id]
                return True
            return False

    def get_endpoint(self, endpoint_id: str) -> Optional[WebhookEndpoint]:
        """Get an endpoint."""
        with self._lock:
            return self._endpoints.get(endpoint_id)

    def list_endpoints(self) -> List[Dict[str, Any]]:
        """List all endpoints."""
        with self._lock:
            return [e.to_dict() for e in self._endpoints.values()]

    def subscribe(self, endpoint_id: str, event: str) -> bool:
        """Subscribe endpoint to an event."""
        with self._lock:
            endpoint = self._endpoints.get(endpoint_id)
            if endpoint:
                endpoint.events.add(event)
                return True
            return False

    def unsubscribe(self, endpoint_id: str, event: str) -> bool:
        """Unsubscribe endpoint from an event."""
        with self._lock:
            endpoint = self._endpoints.get(endpoint_id)
            if endpoint:
                endpoint.events.discard(event)
                return True
            return False

    def _sign_payload(self, payload: str, secret: str) -> str:
        """Sign payload with HMAC-SHA256."""
        signature = hmac.new(
            secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
        return f"sha256={signature}"

    def verify_signature(
        self,
        payload: str,
        signature: str,
        secret: str
    ) -> bool:
        """Verify webhook signature."""
        expected = self._sign_payload(payload, secret)
        return hmac.compare_digest(expected, signature)

    async def trigger_event(
        self,
        event_type: str,
        payload: Dict[str, Any],
        sync: bool = False
    ) -> List[str]:
        """Trigger a webhook event.

        Args:
            event_type: Event type
            payload: Event payload
            sync: Wait for delivery (default: async)

        Returns:
            List of delivery IDs
        """
        delivery_ids = []

        with self._lock:
            endpoints = [
                e for e in self._endpoints.values()
                if e.enabled and (not e.events or event_type in e.events)
            ]

        for endpoint in endpoints:
            delivery = WebhookDelivery(
                id=self._generate_id("del_"),
                endpoint_id=endpoint.id,
                event_type=event_type,
                payload=payload,
            )

            with self._lock:
                self._deliveries.append(delivery)
                if len(self._deliveries) > self._max_history:
                    self._deliveries = self._deliveries[-self._max_history:]

            delivery_ids.append(delivery.id)

            if sync:
                await self._deliver(endpoint, delivery)
            else:
                await self._delivery_queue.put((endpoint, delivery))

        # Trigger local handlers
        await self._trigger_local_handlers(event_type, payload)

        return delivery_ids

    async def _trigger_local_handlers(
        self,
        event_type: str,
        payload: Dict[str, Any]
    ):
        """Trigger local event handlers."""
        handlers = self._event_handlers.get(event_type, [])
        handlers.extend(self._event_handlers.get("*", []))

        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event_type, payload)
                else:
                    handler(event_type, payload)
            except Exception as e:
                print(f"Local handler error: {e}")

    def on_event(self, event_type: str, handler: Callable):
        """Register a local event handler.

        Args:
            event_type: Event type (* for all)
            handler: Handler function
        """
        if event_type not in self._event_handlers:
            self._event_handlers[event_type] = []
        self._event_handlers[event_type].append(handler)

    def off_event(self, event_type: str, handler: Callable):
        """Remove a local event handler."""
        if event_type in self._event_handlers:
            self._event_handlers[event_type] = [
                h for h in self._event_handlers[event_type]
                if h != handler
            ]

    async def _deliver(
        self,
        endpoint: WebhookEndpoint,
        delivery: WebhookDelivery
    ) -> bool:
        """Deliver webhook to endpoint."""
        payload_json = json.dumps({
            "event": delivery.event_type,
            "timestamp": time.time(),
            "delivery_id": delivery.id,
            "data": delivery.payload,
        })

        signature = self._sign_payload(payload_json, endpoint.secret)

        headers = {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": delivery.event_type,
            "X-Webhook-Delivery": delivery.id,
            **endpoint.headers,
        }

        for attempt in range(endpoint.max_retries + 1):
            delivery.attempts = attempt + 1
            delivery.last_attempt_at = time.time()
            delivery.status = DeliveryStatus.RETRYING if attempt > 0 else DeliveryStatus.PENDING

            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        endpoint.url,
                        content=payload_json,
                        headers=headers,
                        timeout=endpoint.timeout,
                    )

                delivery.response_status = response.status_code
                delivery.response_body = response.text[:1000]

                if 200 <= response.status_code < 300:
                    delivery.status = DeliveryStatus.SUCCESS
                    delivery.completed_at = time.time()
                    return True

            except Exception as e:
                delivery.error = str(e)

            # Wait before retry
            if attempt < endpoint.max_retries:
                await asyncio.sleep(endpoint.retry_delay * (2 ** attempt))

        delivery.status = DeliveryStatus.FAILED
        delivery.completed_at = time.time()
        return False

    async def _delivery_worker(self):
        """Background worker for async deliveries."""
        while self._running:
            try:
                endpoint, delivery = await asyncio.wait_for(
                    self._delivery_queue.get(),
                    timeout=1.0
                )
                await self._deliver(endpoint, delivery)
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                print(f"Delivery worker error: {e}")

    async def start(self):
        """Start the delivery worker."""
        if not self._running:
            self._running = True
            self._worker_task = asyncio.create_task(self._delivery_worker())

    async def stop(self):
        """Stop the delivery worker."""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    def get_delivery(self, delivery_id: str) -> Optional[Dict[str, Any]]:
        """Get a delivery by ID."""
        with self._lock:
            for delivery in self._deliveries:
                if delivery.id == delivery_id:
                    return delivery.to_dict()
            return None

    def list_deliveries(
        self,
        endpoint_id: Optional[str] = None,
        event_type: Optional[str] = None,
        status: Optional[DeliveryStatus] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """List deliveries with filters."""
        with self._lock:
            deliveries = list(self._deliveries)

        if endpoint_id:
            deliveries = [d for d in deliveries if d.endpoint_id == endpoint_id]
        if event_type:
            deliveries = [d for d in deliveries if d.event_type == event_type]
        if status:
            deliveries = [d for d in deliveries if d.status == status]

        deliveries = sorted(deliveries, key=lambda d: d.created_at, reverse=True)
        return [d.to_dict() for d in deliveries[:limit]]

    async def retry_delivery(self, delivery_id: str) -> bool:
        """Retry a failed delivery."""
        with self._lock:
            delivery = None
            for d in self._deliveries:
                if d.id == delivery_id:
                    delivery = d
                    break

            if not delivery or delivery.status != DeliveryStatus.FAILED:
                return False

            endpoint = self._endpoints.get(delivery.endpoint_id)
            if not endpoint:
                return False

        delivery.status = DeliveryStatus.PENDING
        delivery.attempts = 0
        delivery.error = None

        await self._delivery_queue.put((endpoint, delivery))
        return True

    def get_stats(self) -> Dict[str, Any]:
        """Get webhook statistics."""
        with self._lock:
            deliveries = list(self._deliveries)
            endpoints = list(self._endpoints.values())

        by_status = {}
        for status in DeliveryStatus:
            by_status[status.value] = len([d for d in deliveries if d.status == status])

        by_event = {}
        for delivery in deliveries:
            by_event[delivery.event_type] = by_event.get(delivery.event_type, 0) + 1

        return {
            "total_endpoints": len(endpoints),
            "enabled_endpoints": len([e for e in endpoints if e.enabled]),
            "total_deliveries": len(deliveries),
            "by_status": by_status,
            "by_event": dict(sorted(by_event.items(), key=lambda x: x[1], reverse=True)[:10]),
            "queue_size": self._delivery_queue.qsize(),
            "running": self._running,
        }

    def clear_history(self, before: Optional[float] = None) -> int:
        """Clear delivery history.

        Args:
            before: Clear deliveries before this timestamp

        Returns:
            Number of deliveries cleared
        """
        with self._lock:
            if before:
                original = len(self._deliveries)
                self._deliveries = [
                    d for d in self._deliveries
                    if d.created_at >= before
                ]
                return original - len(self._deliveries)
            else:
                count = len(self._deliveries)
                self._deliveries = []
                return count


# Singleton instance
webhook_manager = WebhookManager()


# Convenience function
async def emit_event(event_type: str, payload: Dict[str, Any]) -> List[str]:
    """Emit a webhook event.

    Args:
        event_type: Event type
        payload: Event payload

    Returns:
        List of delivery IDs
    """
    return await webhook_manager.trigger_event(event_type, payload)
