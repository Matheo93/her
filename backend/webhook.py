"""
Webhook System - Sprint 757

Outbound webhook management.

Features:
- Webhook registration
- Event dispatching
- Retry with backoff
- Signature verification
- Async delivery
"""

import asyncio
import hashlib
import hmac
import json
import time
import uuid
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Set, Awaitable
)
from enum import Enum
from abc import ABC, abstractmethod
import aiohttp
from functools import wraps


T = TypeVar("T")


class WebhookStatus(str, Enum):
    """Webhook delivery status."""
    PENDING = "pending"
    DELIVERED = "delivered"
    FAILED = "failed"
    RETRYING = "retrying"


class WebhookEvent(str, Enum):
    """Common webhook events."""
    USER_CREATED = "user.created"
    USER_UPDATED = "user.updated"
    USER_DELETED = "user.deleted"
    ORDER_CREATED = "order.created"
    ORDER_COMPLETED = "order.completed"
    PAYMENT_RECEIVED = "payment.received"
    PAYMENT_FAILED = "payment.failed"
    MESSAGE_SENT = "message.sent"
    FILE_UPLOADED = "file.uploaded"
    CUSTOM = "custom"


@dataclass
class WebhookEndpoint:
    """Webhook endpoint configuration."""
    id: str
    url: str
    events: Set[str]
    secret: str = ""
    active: bool = True
    description: str = ""
    headers: Dict[str, str] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "url": self.url,
            "events": list(self.events),
            "active": self.active,
            "description": self.description,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class WebhookDelivery:
    """Webhook delivery attempt."""
    id: str
    endpoint_id: str
    event: str
    payload: Dict[str, Any]
    status: WebhookStatus = WebhookStatus.PENDING
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
            "endpoint_id": self.endpoint_id,
            "event": self.event,
            "payload": self.payload,
            "status": self.status.value,
            "attempts": self.attempts,
            "max_attempts": self.max_attempts,
            "response_code": self.response_code,
            "response_body": self.response_body,
            "error": self.error,
            "created_at": self.created_at,
            "delivered_at": self.delivered_at,
            "next_retry_at": self.next_retry_at,
        }


class WebhookSigner:
    """Signs webhook payloads for verification."""

    @staticmethod
    def sign(payload: str, secret: str, timestamp: int) -> str:
        """Generate HMAC signature."""
        message = f"{timestamp}.{payload}"
        signature = hmac.new(
            secret.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        return f"t={timestamp},v1={signature}"

    @staticmethod
    def verify(payload: str, signature: str, secret: str, tolerance: int = 300) -> bool:
        """Verify webhook signature."""
        try:
            # Parse signature
            parts = dict(p.split("=") for p in signature.split(","))
            timestamp = int(parts.get("t", 0))
            sig = parts.get("v1", "")

            # Check timestamp tolerance
            if abs(time.time() - timestamp) > tolerance:
                return False

            # Verify signature
            expected_sig = hmac.new(
                secret.encode(),
                f"{timestamp}.{payload}".encode(),
                hashlib.sha256
            ).hexdigest()

            return hmac.compare_digest(sig, expected_sig)

        except Exception:
            return False


class WebhookDeliveryService:
    """Handles webhook delivery with retries."""

    def __init__(
        self,
        timeout: float = 30.0,
        max_retries: int = 5,
        base_delay: float = 60.0,
    ):
        self._timeout = timeout
        self._max_retries = max_retries
        self._base_delay = base_delay

    def _calculate_retry_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay."""
        return self._base_delay * (2 ** (attempt - 1))

    async def deliver(
        self,
        endpoint: WebhookEndpoint,
        delivery: WebhookDelivery,
    ) -> WebhookDelivery:
        """Attempt to deliver webhook."""
        delivery.attempts += 1
        delivery.status = WebhookStatus.PENDING

        # Prepare payload
        payload_str = json.dumps(delivery.payload)
        timestamp = int(time.time())

        # Build headers
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "WebhookService/1.0",
            "X-Webhook-ID": delivery.id,
            "X-Webhook-Event": delivery.event,
            "X-Webhook-Timestamp": str(timestamp),
            **endpoint.headers,
        }

        # Add signature if secret is configured
        if endpoint.secret:
            signature = WebhookSigner.sign(payload_str, endpoint.secret, timestamp)
            headers["X-Webhook-Signature"] = signature

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    endpoint.url,
                    data=payload_str,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self._timeout),
                ) as response:
                    delivery.response_code = response.status
                    delivery.response_body = await response.text()

                    if 200 <= response.status < 300:
                        delivery.status = WebhookStatus.DELIVERED
                        delivery.delivered_at = time.time()
                    else:
                        delivery.error = f"HTTP {response.status}"
                        if delivery.attempts < delivery.max_attempts:
                            delivery.status = WebhookStatus.RETRYING
                            delivery.next_retry_at = time.time() + self._calculate_retry_delay(delivery.attempts)
                        else:
                            delivery.status = WebhookStatus.FAILED

        except asyncio.TimeoutError:
            delivery.error = "Request timeout"
            if delivery.attempts < delivery.max_attempts:
                delivery.status = WebhookStatus.RETRYING
                delivery.next_retry_at = time.time() + self._calculate_retry_delay(delivery.attempts)
            else:
                delivery.status = WebhookStatus.FAILED

        except Exception as e:
            delivery.error = str(e)
            if delivery.attempts < delivery.max_attempts:
                delivery.status = WebhookStatus.RETRYING
                delivery.next_retry_at = time.time() + self._calculate_retry_delay(delivery.attempts)
            else:
                delivery.status = WebhookStatus.FAILED

        return delivery


class WebhookManager:
    """Manages webhook endpoints and dispatching.

    Usage:
        manager = WebhookManager()

        # Register endpoint
        endpoint = manager.register_endpoint(
            url="https://example.com/webhook",
            events=["user.created", "order.completed"],
            secret="webhook_secret_key"
        )

        # Dispatch event
        await manager.dispatch("user.created", {"user_id": "123"})

        # Start background worker for retries
        manager.start_worker()
    """

    def __init__(self, delivery_service: Optional[WebhookDeliveryService] = None):
        self._endpoints: Dict[str, WebhookEndpoint] = {}
        self._deliveries: Dict[str, WebhookDelivery] = {}
        self._delivery_service = delivery_service or WebhookDeliveryService()
        self._lock = threading.Lock()
        self._worker_running = False
        self._worker_task: Optional[asyncio.Task] = None

    def register_endpoint(
        self,
        url: str,
        events: List[str],
        secret: str = "",
        description: str = "",
        headers: Optional[Dict[str, str]] = None,
    ) -> WebhookEndpoint:
        """Register a webhook endpoint."""
        endpoint = WebhookEndpoint(
            id=str(uuid.uuid4()),
            url=url,
            events=set(events),
            secret=secret or self._generate_secret(),
            description=description,
            headers=headers or {},
        )

        with self._lock:
            self._endpoints[endpoint.id] = endpoint

        return endpoint

    def _generate_secret(self) -> str:
        """Generate a random secret key."""
        return f"whsec_{uuid.uuid4().hex}"

    def unregister_endpoint(self, endpoint_id: str) -> bool:
        """Remove a webhook endpoint."""
        with self._lock:
            if endpoint_id in self._endpoints:
                del self._endpoints[endpoint_id]
                return True
            return False

    def get_endpoint(self, endpoint_id: str) -> Optional[WebhookEndpoint]:
        """Get endpoint by ID."""
        return self._endpoints.get(endpoint_id)

    def list_endpoints(self, event: Optional[str] = None) -> List[WebhookEndpoint]:
        """List all endpoints, optionally filtered by event."""
        endpoints = list(self._endpoints.values())
        if event:
            endpoints = [e for e in endpoints if event in e.events or "*" in e.events]
        return endpoints

    def update_endpoint(
        self,
        endpoint_id: str,
        url: Optional[str] = None,
        events: Optional[List[str]] = None,
        active: Optional[bool] = None,
        description: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
    ) -> Optional[WebhookEndpoint]:
        """Update endpoint configuration."""
        with self._lock:
            endpoint = self._endpoints.get(endpoint_id)
            if not endpoint:
                return None

            if url is not None:
                endpoint.url = url
            if events is not None:
                endpoint.events = set(events)
            if active is not None:
                endpoint.active = active
            if description is not None:
                endpoint.description = description
            if headers is not None:
                endpoint.headers = headers

            endpoint.updated_at = time.time()
            return endpoint

    async def dispatch(
        self,
        event: str,
        payload: Dict[str, Any],
        endpoint_ids: Optional[List[str]] = None,
    ) -> List[WebhookDelivery]:
        """Dispatch event to matching endpoints."""
        deliveries = []

        # Find matching endpoints
        if endpoint_ids:
            endpoints = [
                self._endpoints[eid]
                for eid in endpoint_ids
                if eid in self._endpoints
            ]
        else:
            endpoints = [
                e for e in self._endpoints.values()
                if e.active and (event in e.events or "*" in e.events)
            ]

        # Create and dispatch deliveries
        for endpoint in endpoints:
            delivery = WebhookDelivery(
                id=str(uuid.uuid4()),
                endpoint_id=endpoint.id,
                event=event,
                payload={
                    "event": event,
                    "data": payload,
                    "timestamp": time.time(),
                },
            )

            with self._lock:
                self._deliveries[delivery.id] = delivery

            # Attempt delivery
            delivery = await self._delivery_service.deliver(endpoint, delivery)
            deliveries.append(delivery)

        return deliveries

    def get_delivery(self, delivery_id: str) -> Optional[WebhookDelivery]:
        """Get delivery by ID."""
        return self._deliveries.get(delivery_id)

    def list_deliveries(
        self,
        endpoint_id: Optional[str] = None,
        status: Optional[WebhookStatus] = None,
        limit: int = 100,
    ) -> List[WebhookDelivery]:
        """List deliveries with optional filters."""
        deliveries = list(self._deliveries.values())

        if endpoint_id:
            deliveries = [d for d in deliveries if d.endpoint_id == endpoint_id]
        if status:
            deliveries = [d for d in deliveries if d.status == status]

        # Sort by created_at desc
        deliveries.sort(key=lambda d: d.created_at, reverse=True)

        return deliveries[:limit]

    async def retry_delivery(self, delivery_id: str) -> Optional[WebhookDelivery]:
        """Manually retry a failed delivery."""
        delivery = self._deliveries.get(delivery_id)
        if not delivery:
            return None

        endpoint = self._endpoints.get(delivery.endpoint_id)
        if not endpoint:
            return None

        delivery.status = WebhookStatus.PENDING
        delivery.attempts = 0
        delivery.error = None

        return await self._delivery_service.deliver(endpoint, delivery)

    async def _worker(self):
        """Background worker for retries."""
        while self._worker_running:
            try:
                now = time.time()

                # Find deliveries to retry
                to_retry = [
                    d for d in self._deliveries.values()
                    if d.status == WebhookStatus.RETRYING
                    and d.next_retry_at
                    and d.next_retry_at <= now
                ]

                for delivery in to_retry:
                    endpoint = self._endpoints.get(delivery.endpoint_id)
                    if endpoint and endpoint.active:
                        await self._delivery_service.deliver(endpoint, delivery)

            except Exception:
                pass  # Log error in production

            await asyncio.sleep(10)

    def start_worker(self):
        """Start background retry worker."""
        if self._worker_running:
            return

        self._worker_running = True

        async def run():
            await self._worker()

        # Create task in current event loop
        try:
            loop = asyncio.get_running_loop()
            self._worker_task = loop.create_task(run())
        except RuntimeError:
            # No running loop, will start when async context is available
            pass

    def stop_worker(self):
        """Stop background worker."""
        self._worker_running = False
        if self._worker_task:
            self._worker_task.cancel()


# Decorator for triggering webhooks
def webhook_trigger(event: str):
    """Decorator to trigger webhook on function call.

    Usage:
        @webhook_trigger("user.created")
        async def create_user(data):
            user = User(**data)
            return user.to_dict()
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            result = await func(*args, **kwargs)
            if _manager and isinstance(result, dict):
                await _manager.dispatch(event, result)
            return result
        return wrapper
    return decorator


# Singleton instance
_manager: Optional[WebhookManager] = None


def configure_webhooks(delivery_service: Optional[WebhookDeliveryService] = None) -> WebhookManager:
    """Configure global webhook manager."""
    global _manager
    _manager = WebhookManager(delivery_service)
    return _manager


def get_webhook_manager() -> WebhookManager:
    """Get global webhook manager."""
    global _manager
    if not _manager:
        _manager = WebhookManager()
    return _manager
