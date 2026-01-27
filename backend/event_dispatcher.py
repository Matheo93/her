"""
Event Dispatcher - Sprint 799

Event-driven architecture utilities.

Features:
- Pub/sub messaging
- Event handlers
- Async events
- Event filtering
- Event replay
- Middleware support
"""

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union,
    Awaitable, Set, Pattern, Type
)
from enum import Enum
from abc import ABC, abstractmethod
import logging
import threading
import re
from collections import defaultdict
import weakref

logger = logging.getLogger(__name__)


T = TypeVar("T")


class EventPriority(int, Enum):
    """Event handler priority."""
    HIGHEST = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3
    LOWEST = 4


@dataclass
class Event:
    """Base event class."""
    type: str
    data: Any = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: float = field(default_factory=time.time)
    source: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "data": self.data,
            "id": self.id,
            "timestamp": self.timestamp,
            "source": self.source,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Event":
        return cls(
            type=data["type"],
            data=data.get("data"),
            id=data.get("id", str(uuid.uuid4())),
            timestamp=data.get("timestamp", time.time()),
            source=data.get("source"),
            metadata=data.get("metadata", {}),
        )


class EventHandler(ABC):
    """Abstract event handler."""

    @abstractmethod
    async def handle(self, event: Event) -> None:
        """Handle an event."""
        pass

    def can_handle(self, event: Event) -> bool:
        """Check if handler can process this event."""
        return True


class FunctionHandler(EventHandler):
    """Handler wrapping a function."""

    def __init__(
        self,
        func: Union[Callable[[Event], None], Callable[[Event], Awaitable[None]]],
        event_type: Optional[str] = None,
        pattern: Optional[str] = None,
    ):
        self.func = func
        self.event_type = event_type
        self.pattern = re.compile(pattern) if pattern else None
        self._is_async = asyncio.iscoroutinefunction(func)

    async def handle(self, event: Event) -> None:
        if self._is_async:
            await self.func(event)
        else:
            self.func(event)

    def can_handle(self, event: Event) -> bool:
        if self.event_type and event.type != self.event_type:
            return False
        if self.pattern and not self.pattern.match(event.type):
            return False
        return True


@dataclass
class Subscription:
    """Event subscription."""
    id: str
    handler: EventHandler
    event_type: Optional[str]
    pattern: Optional[Pattern]
    priority: EventPriority
    once: bool = False
    active: bool = True

    def matches(self, event: Event) -> bool:
        if not self.active:
            return False
        if self.event_type and event.type != self.event_type:
            return False
        if self.pattern and not self.pattern.match(event.type):
            return False
        return self.handler.can_handle(event)


class EventMiddleware(ABC):
    """Event middleware for processing events."""

    @abstractmethod
    async def process(
        self,
        event: Event,
        next_handler: Callable[[Event], Awaitable[None]],
    ) -> None:
        """Process event and call next handler."""
        pass


class LoggingMiddleware(EventMiddleware):
    """Log all events."""

    def __init__(self, log_data: bool = False):
        self.log_data = log_data

    async def process(
        self,
        event: Event,
        next_handler: Callable[[Event], Awaitable[None]],
    ) -> None:
        start = time.time()
        if self.log_data:
            logger.debug("Event: " + event.type + " data=" + str(event.data))
        else:
            logger.debug("Event: " + event.type)

        await next_handler(event)

        elapsed = (time.time() - start) * 1000
        logger.debug("Event " + event.type + " processed in " + str(round(elapsed, 2)) + "ms")


class FilterMiddleware(EventMiddleware):
    """Filter events by predicate."""

    def __init__(self, predicate: Callable[[Event], bool]):
        self.predicate = predicate

    async def process(
        self,
        event: Event,
        next_handler: Callable[[Event], Awaitable[None]],
    ) -> None:
        if self.predicate(event):
            await next_handler(event)


class TransformMiddleware(EventMiddleware):
    """Transform events before dispatching."""

    def __init__(self, transformer: Callable[[Event], Event]):
        self.transformer = transformer

    async def process(
        self,
        event: Event,
        next_handler: Callable[[Event], Awaitable[None]],
    ) -> None:
        transformed = self.transformer(event)
        await next_handler(transformed)


class EventDispatcher:
    """Event dispatcher with pub/sub pattern.

    Usage:
        dispatcher = EventDispatcher()

        # Subscribe to events
        @dispatcher.on("user.created")
        async def handle_user_created(event: Event):
            print(f"User created: {event.data}")

        # Subscribe with pattern
        @dispatcher.on_pattern(r"user\\..*")
        async def handle_all_user_events(event: Event):
            print(f"User event: {event.type}")

        # Emit events
        await dispatcher.emit("user.created", {"id": 1, "name": "John"})

        # Or create and emit Event object
        event = Event(type="user.updated", data={"id": 1, "name": "Jane"})
        await dispatcher.emit_event(event)
    """

    def __init__(self):
        self._subscriptions: Dict[str, List[Subscription]] = defaultdict(list)
        self._pattern_subscriptions: List[Subscription] = []
        self._middlewares: List[EventMiddleware] = []
        self._lock = threading.RLock()
        self._event_history: List[Event] = []
        self._max_history = 1000
        self._subscription_counter = 0

    def _generate_subscription_id(self) -> str:
        self._subscription_counter += 1
        return "sub_" + str(self._subscription_counter)

    def subscribe(
        self,
        event_type: str,
        handler: Union[EventHandler, Callable[[Event], Any]],
        priority: EventPriority = EventPriority.NORMAL,
        once: bool = False,
    ) -> str:
        """Subscribe to a specific event type."""
        with self._lock:
            if not isinstance(handler, EventHandler):
                handler = FunctionHandler(handler, event_type=event_type)

            sub_id = self._generate_subscription_id()
            subscription = Subscription(
                id=sub_id,
                handler=handler,
                event_type=event_type,
                pattern=None,
                priority=priority,
                once=once,
            )

            self._subscriptions[event_type].append(subscription)
            self._sort_subscriptions(event_type)

            return sub_id

    def subscribe_pattern(
        self,
        pattern: str,
        handler: Union[EventHandler, Callable[[Event], Any]],
        priority: EventPriority = EventPriority.NORMAL,
        once: bool = False,
    ) -> str:
        """Subscribe to events matching a pattern."""
        with self._lock:
            if not isinstance(handler, EventHandler):
                handler = FunctionHandler(handler, pattern=pattern)

            sub_id = self._generate_subscription_id()
            compiled_pattern = re.compile(pattern)
            subscription = Subscription(
                id=sub_id,
                handler=handler,
                event_type=None,
                pattern=compiled_pattern,
                priority=priority,
                once=once,
            )

            self._pattern_subscriptions.append(subscription)
            self._pattern_subscriptions.sort(key=lambda s: s.priority.value)

            return sub_id

    def unsubscribe(self, subscription_id: str) -> bool:
        """Unsubscribe by subscription ID."""
        with self._lock:
            # Check specific subscriptions
            for event_type, subs in self._subscriptions.items():
                for sub in subs:
                    if sub.id == subscription_id:
                        subs.remove(sub)
                        return True

            # Check pattern subscriptions
            for sub in self._pattern_subscriptions:
                if sub.id == subscription_id:
                    self._pattern_subscriptions.remove(sub)
                    return True

            return False

    def _sort_subscriptions(self, event_type: str) -> None:
        """Sort subscriptions by priority."""
        self._subscriptions[event_type].sort(key=lambda s: s.priority.value)

    def on(
        self,
        event_type: str,
        priority: EventPriority = EventPriority.NORMAL,
    ) -> Callable:
        """Decorator for subscribing to an event type."""
        def decorator(func: Callable[[Event], Any]) -> Callable:
            self.subscribe(event_type, func, priority)
            return func
        return decorator

    def on_pattern(
        self,
        pattern: str,
        priority: EventPriority = EventPriority.NORMAL,
    ) -> Callable:
        """Decorator for subscribing to events matching a pattern."""
        def decorator(func: Callable[[Event], Any]) -> Callable:
            self.subscribe_pattern(pattern, func, priority)
            return func
        return decorator

    def once(self, event_type: str) -> Callable:
        """Decorator for one-time subscription."""
        def decorator(func: Callable[[Event], Any]) -> Callable:
            self.subscribe(event_type, func, once=True)
            return func
        return decorator

    def add_middleware(self, middleware: EventMiddleware) -> None:
        """Add middleware to the dispatch chain."""
        self._middlewares.append(middleware)

    def remove_middleware(self, middleware: EventMiddleware) -> bool:
        """Remove middleware."""
        if middleware in self._middlewares:
            self._middlewares.remove(middleware)
            return True
        return False

    async def emit(
        self,
        event_type: str,
        data: Any = None,
        source: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Event:
        """Emit an event by type and data."""
        event = Event(
            type=event_type,
            data=data,
            source=source,
            metadata=metadata or {},
        )
        await self.emit_event(event)
        return event

    async def emit_event(self, event: Event) -> None:
        """Emit an Event object."""
        # Store in history
        self._event_history.append(event)
        if len(self._event_history) > self._max_history:
            self._event_history = self._event_history[-self._max_history:]

        # Build handler chain with middleware
        async def dispatch_to_handlers(e: Event) -> None:
            await self._dispatch_to_handlers(e)

        # Apply middleware
        handler = dispatch_to_handlers
        for middleware in reversed(self._middlewares):
            prev_handler = handler

            async def make_handler(m: EventMiddleware, h: Callable) -> Callable:
                async def wrapped(e: Event) -> None:
                    await m.process(e, h)
                return wrapped

            handler = await make_handler(middleware, prev_handler)

        await handler(event)

    async def _dispatch_to_handlers(self, event: Event) -> None:
        """Dispatch event to matching handlers."""
        handlers_to_remove: List[Subscription] = []

        # Get specific subscriptions
        with self._lock:
            specific_subs = list(self._subscriptions.get(event.type, []))
            pattern_subs = list(self._pattern_subscriptions)

        # Process specific subscriptions
        for sub in specific_subs:
            if sub.matches(event):
                try:
                    await sub.handler.handle(event)
                except Exception as e:
                    logger.error("Handler error for " + event.type + ": " + str(e))

                if sub.once:
                    handlers_to_remove.append(sub)

        # Process pattern subscriptions
        for sub in pattern_subs:
            if sub.matches(event):
                try:
                    await sub.handler.handle(event)
                except Exception as e:
                    logger.error("Handler error for " + event.type + ": " + str(e))

                if sub.once:
                    handlers_to_remove.append(sub)

        # Remove one-time handlers
        with self._lock:
            for sub in handlers_to_remove:
                self.unsubscribe(sub.id)

    def emit_sync(
        self,
        event_type: str,
        data: Any = None,
        source: Optional[str] = None,
    ) -> Event:
        """Emit event synchronously (for non-async contexts)."""
        event = Event(type=event_type, data=data, source=source)

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.emit_event(event))
        except RuntimeError:
            # No event loop, run in new loop
            asyncio.run(self.emit_event(event))

        return event

    async def replay(
        self,
        handler: Union[EventHandler, Callable[[Event], Any]],
        event_type: Optional[str] = None,
        since: Optional[float] = None,
        until: Optional[float] = None,
    ) -> int:
        """Replay historical events to a handler."""
        if not isinstance(handler, EventHandler):
            handler = FunctionHandler(handler)

        count = 0
        for event in self._event_history:
            if event_type and event.type != event_type:
                continue
            if since and event.timestamp < since:
                continue
            if until and event.timestamp > until:
                continue

            await handler.handle(event)
            count += 1

        return count

    def get_history(
        self,
        event_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[Event]:
        """Get event history."""
        history = self._event_history
        if event_type:
            history = [e for e in history if e.type == event_type]
        return history[-limit:]

    def clear_history(self) -> None:
        """Clear event history."""
        self._event_history = []

    def get_subscriptions(self, event_type: Optional[str] = None) -> List[Subscription]:
        """Get all subscriptions."""
        with self._lock:
            if event_type:
                return list(self._subscriptions.get(event_type, []))
            all_subs = []
            for subs in self._subscriptions.values():
                all_subs.extend(subs)
            all_subs.extend(self._pattern_subscriptions)
            return all_subs

    def clear_subscriptions(self, event_type: Optional[str] = None) -> None:
        """Clear subscriptions."""
        with self._lock:
            if event_type:
                self._subscriptions[event_type] = []
            else:
                self._subscriptions.clear()
                self._pattern_subscriptions.clear()


class EventBus:
    """Global event bus singleton.

    Usage:
        from event_dispatcher import bus

        @bus.on("app.started")
        async def on_start(event):
            print("App started!")

        await bus.emit("app.started")
    """

    _instance: Optional[EventDispatcher] = None
    _lock = threading.Lock()

    @classmethod
    def get_instance(cls) -> EventDispatcher:
        """Get singleton dispatcher instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = EventDispatcher()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Reset the singleton (for testing)."""
        with cls._lock:
            cls._instance = None


# Global bus instance
bus = EventBus.get_instance()


class DomainEvent(Event):
    """Domain-specific event with aggregate info."""

    def __init__(
        self,
        type: str,
        aggregate_type: str,
        aggregate_id: str,
        data: Any = None,
        **kwargs: Any,
    ):
        super().__init__(type=type, data=data, **kwargs)
        self.aggregate_type = aggregate_type
        self.aggregate_id = aggregate_id

    def to_dict(self) -> dict:
        result = super().to_dict()
        result["aggregate_type"] = self.aggregate_type
        result["aggregate_id"] = self.aggregate_id
        return result


class EventStore:
    """Simple in-memory event store.

    Usage:
        store = EventStore()

        # Store events
        store.append("user-123", event1)
        store.append("user-123", event2)

        # Get events for aggregate
        events = store.get_events("user-123")

        # Get events since version
        events = store.get_events("user-123", since_version=5)
    """

    def __init__(self):
        self._events: Dict[str, List[Event]] = defaultdict(list)
        self._lock = threading.RLock()

    def append(self, stream_id: str, event: Event) -> int:
        """Append event to stream. Returns new version."""
        with self._lock:
            self._events[stream_id].append(event)
            return len(self._events[stream_id])

    def get_events(
        self,
        stream_id: str,
        since_version: int = 0,
        max_count: Optional[int] = None,
    ) -> List[Event]:
        """Get events from stream."""
        with self._lock:
            events = self._events.get(stream_id, [])
            events = events[since_version:]
            if max_count:
                events = events[:max_count]
            return list(events)

    def get_version(self, stream_id: str) -> int:
        """Get current version of stream."""
        with self._lock:
            return len(self._events.get(stream_id, []))

    def get_all_streams(self) -> List[str]:
        """Get all stream IDs."""
        with self._lock:
            return list(self._events.keys())

    def clear(self, stream_id: Optional[str] = None) -> None:
        """Clear events."""
        with self._lock:
            if stream_id:
                self._events[stream_id] = []
            else:
                self._events.clear()
