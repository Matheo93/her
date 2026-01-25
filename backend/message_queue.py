"""
Message Queue - Sprint 709

In-process message queue system.

Features:
- Topics and queues
- Pub/Sub pattern
- Request/Reply pattern
- Dead letter queue
- Message ordering
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Set, Deque
)
from collections import deque
from enum import Enum
import threading
from abc import ABC, abstractmethod
import heapq


class MessagePriority(int, Enum):
    """Message priority levels."""
    LOW = 1
    NORMAL = 5
    HIGH = 10
    URGENT = 20


class MessageStatus(str, Enum):
    """Message status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    DEAD_LETTERED = "dead_lettered"


@dataclass
class Message:
    """Queue message."""
    id: str
    topic: str
    payload: Any
    priority: MessagePriority = MessagePriority.NORMAL
    status: MessageStatus = MessageStatus.PENDING
    created_at: float = field(default_factory=time.time)
    processed_at: Optional[float] = None
    attempts: int = 0
    max_attempts: int = 3
    delay_until: Optional[float] = None
    reply_to: Optional[str] = None
    correlation_id: Optional[str] = None
    headers: Dict[str, str] = field(default_factory=dict)
    error: Optional[str] = None

    def __lt__(self, other: "Message") -> bool:
        """For priority queue comparison."""
        if self.priority != other.priority:
            return self.priority.value > other.priority.value
        return self.created_at < other.created_at

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "topic": self.topic,
            "priority": self.priority.value,
            "status": self.status.value,
            "created_at": self.created_at,
            "attempts": self.attempts,
        }


@dataclass
class Subscription:
    """Topic subscription."""
    id: str
    topic: str
    handler: Callable[[Message], Awaitable[None]]
    filter: Optional[Callable[[Message], bool]] = None
    group: Optional[str] = None


class Queue:
    """Individual message queue."""

    def __init__(self, name: str, max_size: Optional[int] = None):
        """Initialize queue."""
        self.name = name
        self.max_size = max_size
        self._messages: List[Message] = []
        self._lock = threading.Lock()
        self._event = asyncio.Event()

    def push(self, message: Message) -> bool:
        """Push message to queue."""
        with self._lock:
            if self.max_size and len(self._messages) >= self.max_size:
                return False
            heapq.heappush(self._messages, message)
            self._event.set()
        return True

    def pop(self) -> Optional[Message]:
        """Pop highest priority message."""
        with self._lock:
            if self._messages:
                msg = heapq.heappop(self._messages)
                if not self._messages:
                    self._event.clear()
                return msg
        return None

    def peek(self) -> Optional[Message]:
        """Peek at next message."""
        with self._lock:
            return self._messages[0] if self._messages else None

    async def wait(self, timeout: Optional[float] = None) -> bool:
        """Wait for messages."""
        try:
            await asyncio.wait_for(self._event.wait(), timeout)
            return True
        except asyncio.TimeoutError:
            return False

    def __len__(self) -> int:
        return len(self._messages)


class MessageBroker:
    """Central message broker.

    Usage:
        broker = MessageBroker()

        # Subscribe to topic
        @broker.subscribe("orders")
        async def handle_order(message: Message):
            print(f"Processing order: {message.payload}")

        # Publish message
        await broker.publish("orders", {"order_id": "123"})

        # Start broker
        await broker.start()
    """

    def __init__(
        self,
        max_concurrent: int = 10,
        dead_letter_queue: bool = True,
    ):
        """Initialize broker."""
        self._queues: Dict[str, Queue] = {}
        self._subscriptions: Dict[str, List[Subscription]] = {}
        self._consumer_groups: Dict[str, Dict[str, int]] = {}  # topic -> group -> last_index
        self._dead_letter: Optional[Queue] = Queue("dead_letter") if dead_letter_queue else None
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._running = False
        self._lock = threading.Lock()
        self._stats = {
            "published": 0,
            "processed": 0,
            "failed": 0,
            "dead_lettered": 0,
        }

    def _get_queue(self, topic: str) -> Queue:
        """Get or create queue for topic."""
        if topic not in self._queues:
            with self._lock:
                if topic not in self._queues:
                    self._queues[topic] = Queue(topic)
        return self._queues[topic]

    async def publish(
        self,
        topic: str,
        payload: Any,
        priority: MessagePriority = MessagePriority.NORMAL,
        delay: Optional[float] = None,
        headers: Optional[Dict[str, str]] = None,
        reply_to: Optional[str] = None,
        correlation_id: Optional[str] = None,
    ) -> Message:
        """Publish message to topic.

        Args:
            topic: Topic name
            payload: Message payload
            priority: Message priority
            delay: Delay in seconds
            headers: Optional headers
            reply_to: Reply queue for request/reply
            correlation_id: Correlation ID

        Returns:
            Created message
        """
        message = Message(
            id=str(uuid.uuid4()),
            topic=topic,
            payload=payload,
            priority=priority,
            delay_until=time.time() + delay if delay else None,
            headers=headers or {},
            reply_to=reply_to,
            correlation_id=correlation_id,
        )

        queue = self._get_queue(topic)
        queue.push(message)
        self._stats["published"] += 1

        return message

    def subscribe(
        self,
        topic: str,
        filter_fn: Optional[Callable[[Message], bool]] = None,
        group: Optional[str] = None,
    ) -> Callable:
        """Subscribe to topic (decorator).

        Usage:
            @broker.subscribe("orders")
            async def handle_order(message: Message):
                pass
        """
        def decorator(func: Callable[[Message], Awaitable[None]]) -> Callable:
            subscription = Subscription(
                id=str(uuid.uuid4()),
                topic=topic,
                handler=func,
                filter=filter_fn,
                group=group,
            )

            if topic not in self._subscriptions:
                self._subscriptions[topic] = []
            self._subscriptions[topic].append(subscription)

            return func
        return decorator

    def add_subscriber(
        self,
        topic: str,
        handler: Callable[[Message], Awaitable[None]],
        filter_fn: Optional[Callable[[Message], bool]] = None,
        group: Optional[str] = None,
    ) -> str:
        """Add subscriber programmatically."""
        subscription = Subscription(
            id=str(uuid.uuid4()),
            topic=topic,
            handler=handler,
            filter=filter_fn,
            group=group,
        )

        if topic not in self._subscriptions:
            self._subscriptions[topic] = []
        self._subscriptions[topic].append(subscription)

        return subscription.id

    def remove_subscriber(self, subscription_id: str) -> bool:
        """Remove subscriber."""
        for topic, subs in self._subscriptions.items():
            for sub in subs:
                if sub.id == subscription_id:
                    subs.remove(sub)
                    return True
        return False

    async def start(self) -> None:
        """Start message processing."""
        self._running = True
        asyncio.create_task(self._process_loop())

    async def stop(self) -> None:
        """Stop message processing."""
        self._running = False

    async def _process_loop(self) -> None:
        """Main processing loop."""
        while self._running:
            processed = False

            for topic, queue in list(self._queues.items()):
                if topic not in self._subscriptions:
                    continue

                message = queue.peek()
                if not message:
                    continue

                # Check delay
                if message.delay_until and time.time() < message.delay_until:
                    continue

                message = queue.pop()
                if message:
                    asyncio.create_task(self._process_message(message))
                    processed = True

            if not processed:
                await asyncio.sleep(0.01)

    async def _process_message(self, message: Message) -> None:
        """Process a single message."""
        async with self._semaphore:
            message.status = MessageStatus.PROCESSING
            message.attempts += 1

            subscribers = self._subscriptions.get(message.topic, [])

            for sub in subscribers:
                # Apply filter
                if sub.filter and not sub.filter(message):
                    continue

                try:
                    await sub.handler(message)
                    message.status = MessageStatus.COMPLETED
                    message.processed_at = time.time()
                    self._stats["processed"] += 1

                except Exception as e:
                    message.error = str(e)
                    self._stats["failed"] += 1

                    if message.attempts < message.max_attempts:
                        # Retry
                        message.status = MessageStatus.PENDING
                        message.delay_until = time.time() + (2 ** message.attempts)
                        queue = self._get_queue(message.topic)
                        queue.push(message)
                    else:
                        # Dead letter
                        message.status = MessageStatus.DEAD_LETTERED
                        if self._dead_letter:
                            self._dead_letter.push(message)
                            self._stats["dead_lettered"] += 1

    async def request(
        self,
        topic: str,
        payload: Any,
        timeout: float = 30.0,
    ) -> Optional[Any]:
        """Request/Reply pattern.

        Args:
            topic: Request topic
            payload: Request payload
            timeout: Response timeout

        Returns:
            Response payload or None
        """
        reply_queue = f"reply:{uuid.uuid4()}"
        correlation_id = str(uuid.uuid4())
        response: List[Any] = []
        event = asyncio.Event()

        async def reply_handler(message: Message):
            if message.correlation_id == correlation_id:
                response.append(message.payload)
                event.set()

        self.add_subscriber(reply_queue, reply_handler)

        try:
            await self.publish(
                topic,
                payload,
                reply_to=reply_queue,
                correlation_id=correlation_id,
            )

            await asyncio.wait_for(event.wait(), timeout)
            return response[0] if response else None

        except asyncio.TimeoutError:
            return None

        finally:
            self.remove_subscriber(reply_queue)

    async def reply(
        self,
        original_message: Message,
        response: Any,
    ) -> None:
        """Send reply to request."""
        if original_message.reply_to:
            await self.publish(
                original_message.reply_to,
                response,
                correlation_id=original_message.correlation_id,
                priority=MessagePriority.HIGH,
            )

    def get_dead_letters(self, limit: int = 100) -> List[Message]:
        """Get dead lettered messages."""
        if not self._dead_letter:
            return []

        messages = []
        for _ in range(min(limit, len(self._dead_letter))):
            msg = self._dead_letter.pop()
            if msg:
                messages.append(msg)
        return messages

    def requeue_dead_letter(self, message: Message) -> bool:
        """Requeue a dead lettered message."""
        message.status = MessageStatus.PENDING
        message.attempts = 0
        message.error = None
        queue = self._get_queue(message.topic)
        return queue.push(message)

    def get_stats(self) -> dict:
        """Get broker statistics."""
        queue_stats = {
            name: len(queue) for name, queue in self._queues.items()
        }

        return {
            **self._stats,
            "queue_depths": queue_stats,
            "total_queues": len(self._queues),
            "total_subscriptions": sum(len(s) for s in self._subscriptions.values()),
            "dead_letter_count": len(self._dead_letter) if self._dead_letter else 0,
        }


class Topic:
    """Pub/Sub topic wrapper.

    Usage:
        topic = Topic("events", broker)

        # Publish
        await topic.publish({"event": "created"})

        # Subscribe
        @topic.on
        async def handler(msg):
            print(msg.payload)
    """

    def __init__(self, name: str, broker: MessageBroker):
        """Initialize topic."""
        self.name = name
        self._broker = broker

    async def publish(
        self,
        payload: Any,
        **kwargs,
    ) -> Message:
        """Publish to topic."""
        return await self._broker.publish(self.name, payload, **kwargs)

    def on(self, func: Callable[[Message], Awaitable[None]]) -> Callable:
        """Subscribe decorator."""
        return self._broker.subscribe(self.name)(func)

    def subscribe(
        self,
        handler: Callable[[Message], Awaitable[None]],
        **kwargs,
    ) -> str:
        """Subscribe to topic."""
        return self._broker.add_subscriber(self.name, handler, **kwargs)


# Singleton instance
message_broker = MessageBroker()


# Convenience functions
async def publish(
    topic: str,
    payload: Any,
    **kwargs,
) -> Message:
    """Publish using global broker."""
    return await message_broker.publish(topic, payload, **kwargs)


def subscribe(topic: str, **kwargs) -> Callable:
    """Subscribe using global broker."""
    return message_broker.subscribe(topic, **kwargs)


async def request(
    topic: str,
    payload: Any,
    timeout: float = 30.0,
) -> Optional[Any]:
    """Request using global broker."""
    return await message_broker.request(topic, payload, timeout)
