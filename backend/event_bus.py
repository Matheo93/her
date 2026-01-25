"""
Event Bus - Sprint 637

Pub/Sub event system for internal communication.

Features:
- Topic-based subscriptions
- Pattern matching
- Async handlers
- Event history
- Dead letter queue
"""

import time
import asyncio
import fnmatch
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Set
from enum import Enum
from threading import Lock
import inspect


class EventPriority(int, Enum):
    """Event handler priority."""
    CRITICAL = 0
    HIGH = 25
    NORMAL = 50
    LOW = 75
    BACKGROUND = 100


@dataclass
class Event:
    """An event in the system."""
    id: str
    topic: str
    data: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)
    source: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "topic": self.topic,
            "data": self.data,
            "timestamp": self.timestamp,
            "source": self.source,
            "metadata": self.metadata,
        }


@dataclass
class Subscription:
    """A topic subscription."""
    id: str
    pattern: str
    handler: Callable
    priority: EventPriority = EventPriority.NORMAL
    filters: Dict[str, Any] = field(default_factory=dict)
    is_pattern: bool = False
    once: bool = False
    active: bool = True

    def matches(self, topic: str) -> bool:
        """Check if subscription matches topic."""
        if self.is_pattern:
            return fnmatch.fnmatch(topic, self.pattern)
        return topic == self.pattern


@dataclass
class DeadLetter:
    """A failed event delivery."""
    event: Event
    subscription_id: str
    error: str
    timestamp: float = field(default_factory=time.time)
    retries: int = 0


class EventBus:
    """Pub/Sub event bus for internal communication.

    Usage:
        bus = EventBus()

        # Subscribe to topic
        @bus.on("user.created")
        async def handle_user_created(event):
            print(f"User created: {event.data}")

        # Subscribe with pattern
        @bus.on("user.*")
        def handle_all_user_events(event):
            print(f"User event: {event.topic}")

        # Publish event
        await bus.publish("user.created", {"id": "123", "name": "John"})

        # One-time subscription
        bus.once("order.completed", lambda e: print("Order done!"))
    """

    def __init__(self, max_history: int = 1000, enable_dead_letter: bool = True):
        """Initialize event bus.

        Args:
            max_history: Max events to keep in history
            enable_dead_letter: Enable dead letter queue
        """
        self._subscriptions: Dict[str, Subscription] = {}
        self._history: List[Event] = []
        self._dead_letters: List[DeadLetter] = []
        self._lock = Lock()
        self._max_history = max_history
        self._enable_dead_letter = enable_dead_letter
        self._id_counter = 0
        self._stats = {
            "events_published": 0,
            "events_delivered": 0,
            "events_failed": 0,
        }

    def _generate_id(self, prefix: str = "") -> str:
        """Generate unique ID."""
        self._id_counter += 1
        return f"{prefix}{int(time.time() * 1000)}{self._id_counter}"

    def subscribe(
        self,
        pattern: str,
        handler: Callable,
        priority: EventPriority = EventPriority.NORMAL,
        filters: Optional[Dict[str, Any]] = None,
        once: bool = False
    ) -> str:
        """Subscribe to a topic or pattern.

        Args:
            pattern: Topic or glob pattern
            handler: Handler function
            priority: Handler priority
            filters: Optional data filters
            once: Remove after first match

        Returns:
            Subscription ID
        """
        is_pattern = "*" in pattern or "?" in pattern

        subscription = Subscription(
            id=self._generate_id("sub_"),
            pattern=pattern,
            handler=handler,
            priority=priority,
            filters=filters or {},
            is_pattern=is_pattern,
            once=once,
        )

        with self._lock:
            self._subscriptions[subscription.id] = subscription

        return subscription.id

    def unsubscribe(self, subscription_id: str) -> bool:
        """Unsubscribe from a topic.

        Args:
            subscription_id: Subscription ID

        Returns:
            True if unsubscribed
        """
        with self._lock:
            if subscription_id in self._subscriptions:
                del self._subscriptions[subscription_id]
                return True
            return False

    def on(
        self,
        pattern: str,
        priority: EventPriority = EventPriority.NORMAL,
        filters: Optional[Dict[str, Any]] = None
    ):
        """Decorator for subscribing to events.

        Usage:
            @bus.on("user.created")
            async def handle(event):
                pass
        """
        def decorator(handler: Callable) -> Callable:
            self.subscribe(pattern, handler, priority, filters)
            return handler
        return decorator

    def once(
        self,
        pattern: str,
        handler: Callable,
        priority: EventPriority = EventPriority.NORMAL
    ) -> str:
        """Subscribe for one event only.

        Args:
            pattern: Topic or pattern
            handler: Handler function
            priority: Handler priority

        Returns:
            Subscription ID
        """
        return self.subscribe(pattern, handler, priority, once=True)

    def _matches_filters(self, event: Event, filters: Dict[str, Any]) -> bool:
        """Check if event matches filters."""
        for key, value in filters.items():
            event_value = event.data.get(key)
            if event_value != value:
                return False
        return True

    async def publish(
        self,
        topic: str,
        data: Dict[str, Any],
        source: str = "",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Event:
        """Publish an event.

        Args:
            topic: Event topic
            data: Event data
            source: Event source
            metadata: Optional metadata

        Returns:
            Published event
        """
        event = Event(
            id=self._generate_id("evt_"),
            topic=topic,
            data=data,
            source=source,
            metadata=metadata or {},
        )

        with self._lock:
            self._history.append(event)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]
            self._stats["events_published"] += 1

        await self._dispatch(event)
        return event

    def publish_sync(
        self,
        topic: str,
        data: Dict[str, Any],
        source: str = "",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Event:
        """Publish an event synchronously (runs handlers in loop).

        Args:
            topic: Event topic
            data: Event data
            source: Event source
            metadata: Optional metadata

        Returns:
            Published event
        """
        event = Event(
            id=self._generate_id("evt_"),
            topic=topic,
            data=data,
            source=source,
            metadata=metadata or {},
        )

        with self._lock:
            self._history.append(event)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]
            self._stats["events_published"] += 1

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(self._dispatch(event))
        finally:
            loop.close()

        return event

    async def _dispatch(self, event: Event):
        """Dispatch event to matching subscribers."""
        with self._lock:
            subscriptions = list(self._subscriptions.values())

        # Sort by priority
        subscriptions.sort(key=lambda s: s.priority.value)

        to_remove = []

        for sub in subscriptions:
            if not sub.active:
                continue

            if not sub.matches(event.topic):
                continue

            if sub.filters and not self._matches_filters(event, sub.filters):
                continue

            try:
                if inspect.iscoroutinefunction(sub.handler):
                    await sub.handler(event)
                else:
                    sub.handler(event)

                with self._lock:
                    self._stats["events_delivered"] += 1

                if sub.once:
                    to_remove.append(sub.id)

            except Exception as e:
                with self._lock:
                    self._stats["events_failed"] += 1

                if self._enable_dead_letter:
                    self._add_dead_letter(event, sub.id, str(e))

        # Remove one-time subscriptions
        for sub_id in to_remove:
            self.unsubscribe(sub_id)

    def _add_dead_letter(self, event: Event, subscription_id: str, error: str):
        """Add event to dead letter queue."""
        with self._lock:
            self._dead_letters.append(DeadLetter(
                event=event,
                subscription_id=subscription_id,
                error=error,
            ))

            # Limit dead letter queue size
            if len(self._dead_letters) > 100:
                self._dead_letters = self._dead_letters[-100:]

    def get_history(
        self,
        topic: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get event history.

        Args:
            topic: Filter by topic
            limit: Max events to return

        Returns:
            List of events
        """
        with self._lock:
            events = list(self._history)

        if topic:
            events = [e for e in events if e.topic == topic]

        events = sorted(events, key=lambda e: e.timestamp, reverse=True)
        return [e.to_dict() for e in events[:limit]]

    def get_dead_letters(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get dead letter queue.

        Args:
            limit: Max items to return

        Returns:
            List of dead letters
        """
        with self._lock:
            letters = list(self._dead_letters)

        letters = sorted(letters, key=lambda d: d.timestamp, reverse=True)
        return [
            {
                "event": d.event.to_dict(),
                "subscription_id": d.subscription_id,
                "error": d.error,
                "timestamp": d.timestamp,
                "retries": d.retries,
            }
            for d in letters[:limit]
        ]

    async def retry_dead_letter(self, index: int) -> bool:
        """Retry a dead letter.

        Args:
            index: Dead letter index

        Returns:
            True if retried
        """
        with self._lock:
            if index < 0 or index >= len(self._dead_letters):
                return False

            dead_letter = self._dead_letters[index]
            dead_letter.retries += 1

        await self._dispatch(dead_letter.event)
        return True

    def clear_dead_letters(self) -> int:
        """Clear dead letter queue.

        Returns:
            Number of items cleared
        """
        with self._lock:
            count = len(self._dead_letters)
            self._dead_letters = []
            return count

    def list_subscriptions(self) -> List[Dict[str, Any]]:
        """List all subscriptions.

        Returns:
            List of subscriptions
        """
        with self._lock:
            return [
                {
                    "id": s.id,
                    "pattern": s.pattern,
                    "priority": s.priority.name,
                    "is_pattern": s.is_pattern,
                    "once": s.once,
                    "active": s.active,
                    "has_filters": bool(s.filters),
                }
                for s in self._subscriptions.values()
            ]

    def get_topics(self) -> List[str]:
        """Get all unique topics from history.

        Returns:
            List of topics
        """
        with self._lock:
            topics = set(e.topic for e in self._history)
        return sorted(topics)

    def pause_subscription(self, subscription_id: str) -> bool:
        """Pause a subscription.

        Args:
            subscription_id: Subscription ID

        Returns:
            True if paused
        """
        with self._lock:
            sub = self._subscriptions.get(subscription_id)
            if sub:
                sub.active = False
                return True
            return False

    def resume_subscription(self, subscription_id: str) -> bool:
        """Resume a subscription.

        Args:
            subscription_id: Subscription ID

        Returns:
            True if resumed
        """
        with self._lock:
            sub = self._subscriptions.get(subscription_id)
            if sub:
                sub.active = True
                return True
            return False

    def get_stats(self) -> Dict[str, Any]:
        """Get event bus statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            return {
                **self._stats,
                "total_subscriptions": len(self._subscriptions),
                "active_subscriptions": len([s for s in self._subscriptions.values() if s.active]),
                "history_size": len(self._history),
                "dead_letters": len(self._dead_letters),
                "unique_topics": len(set(e.topic for e in self._history)),
            }

    def clear_history(self) -> int:
        """Clear event history.

        Returns:
            Number of events cleared
        """
        with self._lock:
            count = len(self._history)
            self._history = []
            return count


# Singleton instance
event_bus = EventBus()


# Convenience functions
async def emit(topic: str, data: Dict[str, Any], **kwargs) -> Event:
    """Emit an event.

    Args:
        topic: Event topic
        data: Event data
        **kwargs: Additional event options

    Returns:
        Published event
    """
    return await event_bus.publish(topic, data, **kwargs)


def on(pattern: str, **kwargs):
    """Decorator for subscribing to events.

    Args:
        pattern: Topic or pattern
        **kwargs: Subscription options
    """
    return event_bus.on(pattern, **kwargs)
