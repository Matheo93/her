"""
Pub/Sub System - Sprint 727

Publish/Subscribe messaging implementation.

Features:
- Topics and subscriptions
- Message filtering
- Dead letter queue
- Message acknowledgment
- Async delivery
"""

import asyncio
import time
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, Awaitable, Set
)
from enum import Enum
import threading
from abc import ABC, abstractmethod
import uuid
import json


class MessageStatus(str, Enum):
    """Message delivery status."""
    PENDING = "pending"
    DELIVERED = "delivered"
    ACKNOWLEDGED = "acknowledged"
    FAILED = "failed"
    DEAD_LETTER = "dead_letter"


@dataclass
class Message:
    """Pub/Sub message."""
    id: str
    topic: str
    data: Any
    attributes: Dict[str, str] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)
    status: MessageStatus = MessageStatus.PENDING
    delivery_count: int = 0
    max_retries: int = 3

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "topic": self.topic,
            "data": self.data,
            "attributes": self.attributes,
            "timestamp": self.timestamp,
            "status": self.status.value,
            "delivery_count": self.delivery_count,
        }

    @classmethod
    def create(
        cls,
        topic: str,
        data: Any,
        attributes: Optional[Dict[str, str]] = None,
    ) -> "Message":
        """Create a new message."""
        return cls(
            id=str(uuid.uuid4()),
            topic=topic,
            data=data,
            attributes=attributes or {},
        )


@dataclass
class Filter:
    """Message filter."""
    attributes: Dict[str, str] = field(default_factory=dict)

    def matches(self, message: Message) -> bool:
        """Check if message matches filter."""
        if not self.attributes:
            return True

        for key, expected in self.attributes.items():
            if message.attributes.get(key) != expected:
                return False
        return True


MessageHandler = Callable[[Message], Awaitable[bool]]


@dataclass
class Subscription:
    """Topic subscription."""
    id: str
    topic: str
    handler: MessageHandler
    filter: Optional[Filter] = None
    active: bool = True
    created_at: float = field(default_factory=time.time)
    messages_received: int = 0
    messages_acknowledged: int = 0

    def matches(self, message: Message) -> bool:
        """Check if message matches subscription filter."""
        if self.filter is None:
            return True
        return self.filter.matches(message)


class Topic:
    """Pub/Sub topic."""

    def __init__(self, name: str, max_history: int = 1000):
        """Initialize topic."""
        self.name = name
        self.max_history = max_history
        self._subscriptions: Dict[str, Subscription] = {}
        self._message_history: List[Message] = []
        self._lock = threading.Lock()

    def add_subscription(self, subscription: Subscription) -> None:
        """Add a subscription."""
        with self._lock:
            self._subscriptions[subscription.id] = subscription

    def remove_subscription(self, subscription_id: str) -> bool:
        """Remove a subscription."""
        with self._lock:
            if subscription_id in self._subscriptions:
                del self._subscriptions[subscription_id]
                return True
            return False

    def get_subscriptions(self) -> List[Subscription]:
        """Get all subscriptions."""
        return list(self._subscriptions.values())

    def add_to_history(self, message: Message) -> None:
        """Add message to history."""
        with self._lock:
            self._message_history.append(message)
            if len(self._message_history) > self.max_history:
                self._message_history = self._message_history[-self.max_history:]

    def get_history(self, limit: int = 100) -> List[Message]:
        """Get message history."""
        return self._message_history[-limit:]


class PubSubBroker:
    """Pub/Sub message broker.

    Usage:
        broker = PubSubBroker()

        # Create topic
        broker.create_topic("events")

        # Subscribe
        async def handler(message):
            print(f"Received: {message.data}")
            return True

        broker.subscribe("events", handler)

        # Publish
        await broker.publish("events", {"type": "user_created", "user_id": "123"})
    """

    def __init__(
        self,
        enable_dead_letter: bool = True,
        dead_letter_topic: str = "__dead_letter__",
    ):
        """Initialize broker."""
        self._topics: Dict[str, Topic] = {}
        self._enable_dead_letter = enable_dead_letter
        self._dead_letter_topic = dead_letter_topic
        self._lock = threading.Lock()
        self._message_callbacks: List[Callable[[Message], None]] = []

        if enable_dead_letter:
            self.create_topic(dead_letter_topic)

    def create_topic(self, name: str, max_history: int = 1000) -> Topic:
        """Create a topic.

        Args:
            name: Topic name
            max_history: Max messages to keep in history

        Returns:
            Created topic
        """
        with self._lock:
            if name not in self._topics:
                self._topics[name] = Topic(name, max_history)
            return self._topics[name]

    def get_topic(self, name: str) -> Optional[Topic]:
        """Get a topic by name."""
        return self._topics.get(name)

    def delete_topic(self, name: str) -> bool:
        """Delete a topic."""
        with self._lock:
            if name in self._topics:
                del self._topics[name]
                return True
            return False

    def list_topics(self) -> List[str]:
        """List all topics."""
        return list(self._topics.keys())

    def subscribe(
        self,
        topic_name: str,
        handler: MessageHandler,
        filter_attrs: Optional[Dict[str, str]] = None,
    ) -> str:
        """Subscribe to a topic.

        Args:
            topic_name: Topic to subscribe to
            handler: Async message handler
            filter_attrs: Optional attribute filter

        Returns:
            Subscription ID
        """
        topic = self._topics.get(topic_name)
        if not topic:
            topic = self.create_topic(topic_name)

        subscription = Subscription(
            id=str(uuid.uuid4()),
            topic=topic_name,
            handler=handler,
            filter=Filter(filter_attrs) if filter_attrs else None,
        )

        topic.add_subscription(subscription)
        return subscription.id

    def unsubscribe(self, topic_name: str, subscription_id: str) -> bool:
        """Unsubscribe from a topic."""
        topic = self._topics.get(topic_name)
        if not topic:
            return False
        return topic.remove_subscription(subscription_id)

    async def publish(
        self,
        topic_name: str,
        data: Any,
        attributes: Optional[Dict[str, str]] = None,
    ) -> Message:
        """Publish a message to a topic.

        Args:
            topic_name: Target topic
            data: Message data
            attributes: Optional message attributes

        Returns:
            Published message
        """
        topic = self._topics.get(topic_name)
        if not topic:
            topic = self.create_topic(topic_name)

        message = Message.create(topic_name, data, attributes)
        topic.add_to_history(message)

        # Deliver to subscribers
        await self._deliver_message(message, topic)

        # Notify callbacks
        for callback in self._message_callbacks:
            callback(message)

        return message

    async def _deliver_message(self, message: Message, topic: Topic) -> None:
        """Deliver message to subscribers."""
        subscriptions = topic.get_subscriptions()

        for subscription in subscriptions:
            if not subscription.active:
                continue

            if not subscription.matches(message):
                continue

            subscription.messages_received += 1
            success = await self._try_deliver(message, subscription)

            if success:
                message.status = MessageStatus.ACKNOWLEDGED
                subscription.messages_acknowledged += 1
            elif message.delivery_count >= message.max_retries:
                await self._move_to_dead_letter(message)

    async def _try_deliver(
        self,
        message: Message,
        subscription: Subscription,
    ) -> bool:
        """Try to deliver message to subscription."""
        message.delivery_count += 1

        try:
            result = await subscription.handler(message)
            return result
        except Exception:
            message.status = MessageStatus.FAILED
            return False

    async def _move_to_dead_letter(self, message: Message) -> None:
        """Move message to dead letter queue."""
        if not self._enable_dead_letter:
            return

        message.status = MessageStatus.DEAD_LETTER
        dlq_topic = self._topics.get(self._dead_letter_topic)

        if dlq_topic:
            dlq_message = Message.create(
                self._dead_letter_topic,
                {
                    "original_topic": message.topic,
                    "original_data": message.data,
                    "original_id": message.id,
                    "failure_count": message.delivery_count,
                },
            )
            dlq_topic.add_to_history(dlq_message)

    def on_message(self, callback: Callable[[Message], None]) -> None:
        """Register message callback."""
        self._message_callbacks.append(callback)

    def get_dead_letter_messages(self, limit: int = 100) -> List[Message]:
        """Get dead letter messages."""
        if not self._enable_dead_letter:
            return []

        dlq_topic = self._topics.get(self._dead_letter_topic)
        if not dlq_topic:
            return []

        return dlq_topic.get_history(limit)

    def get_stats(self) -> dict:
        """Get broker statistics."""
        stats = {
            "topics": len(self._topics),
            "topic_details": {},
        }

        for name, topic in self._topics.items():
            subs = topic.get_subscriptions()
            stats["topic_details"][name] = {
                "subscriptions": len(subs),
                "history_size": len(topic.get_history()),
                "total_received": sum(s.messages_received for s in subs),
                "total_acknowledged": sum(s.messages_acknowledged for s in subs),
            }

        return stats


class TypedPubSub:
    """Type-safe Pub/Sub wrapper.

    Usage:
        pubsub = TypedPubSub[UserEvent](broker, "user_events")

        @pubsub.handler
        async def handle_user_event(event: UserEvent) -> bool:
            print(f"User: {event.user_id}")
            return True

        await pubsub.publish(UserEvent(user_id="123", action="login"))
    """

    def __init__(self, broker: PubSubBroker, topic: str):
        """Initialize typed pub/sub."""
        self._broker = broker
        self._topic = topic
        self._broker.create_topic(topic)

    async def publish(self, data: Any, attributes: Optional[Dict[str, str]] = None) -> Message:
        """Publish typed data."""
        return await self._broker.publish(self._topic, data, attributes)

    def subscribe(
        self,
        handler: MessageHandler,
        filter_attrs: Optional[Dict[str, str]] = None,
    ) -> str:
        """Subscribe with typed handler."""
        return self._broker.subscribe(self._topic, handler, filter_attrs)

    def unsubscribe(self, subscription_id: str) -> bool:
        """Unsubscribe."""
        return self._broker.unsubscribe(self._topic, subscription_id)

    def handler(self, func: MessageHandler) -> MessageHandler:
        """Decorator to subscribe a handler."""
        self.subscribe(func)
        return func


class EventBus:
    """Simple event bus using pub/sub.

    Usage:
        bus = EventBus()

        @bus.on("user_created")
        async def handle_user_created(data):
            print(f"User created: {data['user_id']}")

        await bus.emit("user_created", {"user_id": "123"})
    """

    def __init__(self):
        """Initialize event bus."""
        self._broker = PubSubBroker(enable_dead_letter=False)

    async def emit(self, event: str, data: Any = None) -> None:
        """Emit an event."""
        await self._broker.publish(event, data)

    def on(self, event: str) -> Callable:
        """Decorator to listen for an event."""
        def decorator(func: Callable[[Any], Awaitable[bool]]) -> Callable:
            async def handler(message: Message) -> bool:
                return await func(message.data)

            self._broker.subscribe(event, handler)
            return func
        return decorator

    def once(self, event: str) -> Callable:
        """Decorator to listen for an event once."""
        def decorator(func: Callable[[Any], Awaitable[bool]]) -> Callable:
            state = {"subscription_id": None}

            async def handler(message: Message) -> bool:
                result = await func(message.data)
                if state["subscription_id"]:
                    self._broker.unsubscribe(event, state["subscription_id"])
                return result

            state["subscription_id"] = self._broker.subscribe(event, handler)
            return func
        return decorator

    def off(self, event: str, subscription_id: str) -> bool:
        """Remove event listener."""
        return self._broker.unsubscribe(event, subscription_id)


# Singleton instances
pubsub_broker = PubSubBroker()
event_bus = EventBus()


# Convenience functions
def create_topic(name: str) -> Topic:
    """Create a topic using global broker."""
    return pubsub_broker.create_topic(name)


async def publish(topic: str, data: Any, attributes: Optional[Dict[str, str]] = None) -> Message:
    """Publish using global broker."""
    return await pubsub_broker.publish(topic, data, attributes)


def subscribe(topic: str, handler: MessageHandler) -> str:
    """Subscribe using global broker."""
    return pubsub_broker.subscribe(topic, handler)
