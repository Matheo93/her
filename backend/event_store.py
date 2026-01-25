"""
Event Store - Sprint 697

Event sourcing persistence layer.

Features:
- Event persistence
- Stream management
- Snapshots
- Projections
- Subscriptions
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Iterator, Type
)
from enum import Enum
import threading
from abc import ABC, abstractmethod
import json
import hashlib


@dataclass
class Event:
    """Base event class."""
    id: str
    stream_id: str
    type: str
    data: Dict[str, Any]
    metadata: Dict[str, Any] = field(default_factory=dict)
    version: int = 0
    timestamp: float = field(default_factory=time.time)
    correlation_id: Optional[str] = None
    causation_id: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "stream_id": self.stream_id,
            "type": self.type,
            "data": self.data,
            "metadata": self.metadata,
            "version": self.version,
            "timestamp": self.timestamp,
            "correlation_id": self.correlation_id,
            "causation_id": self.causation_id,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Event":
        """Create from dictionary."""
        return cls(**data)


@dataclass
class Snapshot:
    """Aggregate snapshot for optimization."""
    stream_id: str
    version: int
    state: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)


class EventStream:
    """Collection of events for an aggregate."""

    def __init__(self, stream_id: str):
        """Initialize stream."""
        self.id = stream_id
        self._events: List[Event] = []
        self._version: int = 0
        self._snapshot: Optional[Snapshot] = None

    @property
    def version(self) -> int:
        """Current stream version."""
        return self._version

    @property
    def events(self) -> List[Event]:
        """All events in stream."""
        return self._events.copy()

    def append(self, event: Event) -> None:
        """Append event to stream."""
        self._version += 1
        event.version = self._version
        self._events.append(event)

    def get_events_from(self, version: int = 0) -> List[Event]:
        """Get events from a specific version."""
        return [e for e in self._events if e.version > version]

    def set_snapshot(self, snapshot: Snapshot) -> None:
        """Set aggregate snapshot."""
        self._snapshot = snapshot

    def get_snapshot(self) -> Optional[Snapshot]:
        """Get current snapshot."""
        return self._snapshot


class EventStore:
    """In-memory event store (replace with DB in production).

    Usage:
        store = EventStore()

        # Append events
        event = store.append("order-123", "OrderCreated", {"amount": 100})

        # Read stream
        events = store.read_stream("order-123")

        # Subscribe to events
        store.subscribe("OrderCreated", handle_order_created)
    """

    def __init__(self):
        """Initialize store."""
        self._streams: Dict[str, EventStream] = {}
        self._all_events: List[Event] = []
        self._subscriptions: Dict[str, List[Callable[[Event], Awaitable[None]]]] = {}
        self._global_subscribers: List[Callable[[Event], Awaitable[None]]] = []
        self._lock = threading.Lock()
        self._position: int = 0

    def append(
        self,
        stream_id: str,
        event_type: str,
        data: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
        expected_version: Optional[int] = None,
        correlation_id: Optional[str] = None,
        causation_id: Optional[str] = None,
    ) -> Event:
        """Append event to stream.

        Args:
            stream_id: Stream identifier
            event_type: Type of event
            data: Event payload
            metadata: Optional metadata
            expected_version: Expected stream version (for optimistic locking)
            correlation_id: Correlation ID for tracing
            causation_id: ID of event that caused this one

        Returns:
            Created event

        Raises:
            ConcurrencyError: If expected_version doesn't match
        """
        with self._lock:
            if stream_id not in self._streams:
                self._streams[stream_id] = EventStream(stream_id)

            stream = self._streams[stream_id]

            if expected_version is not None and stream.version != expected_version:
                raise ConcurrencyError(
                    f"Expected version {expected_version}, but stream is at {stream.version}"
                )

            event = Event(
                id=str(uuid.uuid4()),
                stream_id=stream_id,
                type=event_type,
                data=data,
                metadata=metadata or {},
                correlation_id=correlation_id,
                causation_id=causation_id,
            )

            stream.append(event)
            self._all_events.append(event)
            self._position += 1

        return event

    async def append_async(
        self,
        stream_id: str,
        event_type: str,
        data: Dict[str, Any],
        **kwargs,
    ) -> Event:
        """Async append with notifications."""
        event = self.append(stream_id, event_type, data, **kwargs)
        await self._notify_subscribers(event)
        return event

    def read_stream(
        self,
        stream_id: str,
        from_version: int = 0,
        max_count: Optional[int] = None,
    ) -> List[Event]:
        """Read events from stream."""
        stream = self._streams.get(stream_id)
        if not stream:
            return []

        events = stream.get_events_from(from_version)
        if max_count:
            events = events[:max_count]
        return events

    def read_all(
        self,
        from_position: int = 0,
        max_count: Optional[int] = None,
    ) -> List[Event]:
        """Read all events from position."""
        events = self._all_events[from_position:]
        if max_count:
            events = events[:max_count]
        return events

    def get_stream(self, stream_id: str) -> Optional[EventStream]:
        """Get stream by ID."""
        return self._streams.get(stream_id)

    def stream_exists(self, stream_id: str) -> bool:
        """Check if stream exists."""
        return stream_id in self._streams

    def get_stream_version(self, stream_id: str) -> int:
        """Get current stream version."""
        stream = self._streams.get(stream_id)
        return stream.version if stream else 0

    def subscribe(
        self,
        event_type: str,
        handler: Callable[[Event], Awaitable[None]],
    ) -> "EventStore":
        """Subscribe to event type."""
        if event_type not in self._subscriptions:
            self._subscriptions[event_type] = []
        self._subscriptions[event_type].append(handler)
        return self

    def subscribe_all(
        self,
        handler: Callable[[Event], Awaitable[None]],
    ) -> "EventStore":
        """Subscribe to all events."""
        self._global_subscribers.append(handler)
        return self

    async def _notify_subscribers(self, event: Event) -> None:
        """Notify subscribers of new event."""
        handlers = self._subscriptions.get(event.type, []) + self._global_subscribers
        for handler in handlers:
            try:
                await handler(event)
            except Exception:
                pass

    def save_snapshot(
        self,
        stream_id: str,
        state: Dict[str, Any],
    ) -> Optional[Snapshot]:
        """Save aggregate snapshot."""
        stream = self._streams.get(stream_id)
        if not stream:
            return None

        snapshot = Snapshot(
            stream_id=stream_id,
            version=stream.version,
            state=state,
        )
        stream.set_snapshot(snapshot)
        return snapshot

    def get_snapshot(self, stream_id: str) -> Optional[Snapshot]:
        """Get snapshot for stream."""
        stream = self._streams.get(stream_id)
        return stream.get_snapshot() if stream else None

    def get_stats(self) -> dict:
        """Get store statistics."""
        return {
            "total_streams": len(self._streams),
            "total_events": len(self._all_events),
            "current_position": self._position,
            "subscriptions": len(self._subscriptions),
        }


class Projection(ABC):
    """Base class for projections.

    Usage:
        class OrdersProjection(Projection):
            def __init__(self):
                super().__init__(["OrderCreated", "OrderShipped"])
                self.orders = {}

            async def apply(self, event: Event):
                if event.type == "OrderCreated":
                    self.orders[event.stream_id] = event.data
    """

    def __init__(self, event_types: List[str]):
        """Initialize projection."""
        self.event_types = event_types
        self._position: int = 0

    @abstractmethod
    async def apply(self, event: Event) -> None:
        """Apply event to projection."""
        pass

    @property
    def position(self) -> int:
        """Current projection position."""
        return self._position

    async def process(self, event: Event) -> bool:
        """Process event if applicable."""
        if event.type in self.event_types:
            await self.apply(event)
            self._position += 1
            return True
        return False


class ProjectionManager:
    """Manages multiple projections.

    Usage:
        manager = ProjectionManager(event_store)
        manager.register(OrdersProjection())
        manager.register(InventoryProjection())

        await manager.rebuild_all()
        await manager.run()
    """

    def __init__(self, store: EventStore):
        """Initialize manager."""
        self._store = store
        self._projections: Dict[str, Projection] = {}
        self._running = False

    def register(self, projection: Projection, name: Optional[str] = None) -> "ProjectionManager":
        """Register projection."""
        projection_name = name or projection.__class__.__name__
        self._projections[projection_name] = projection
        return self

    def get(self, name: str) -> Optional[Projection]:
        """Get projection by name."""
        return self._projections.get(name)

    async def rebuild(self, name: str) -> int:
        """Rebuild a specific projection."""
        projection = self._projections.get(name)
        if not projection:
            return 0

        projection._position = 0
        events = self._store.read_all()
        count = 0

        for event in events:
            if await projection.process(event):
                count += 1

        return count

    async def rebuild_all(self) -> Dict[str, int]:
        """Rebuild all projections."""
        results = {}
        for name in self._projections:
            results[name] = await self.rebuild(name)
        return results

    async def run(self, poll_interval: float = 0.1) -> None:
        """Run continuous projection updates."""
        self._running = True
        positions = {name: p.position for name, p in self._projections.items()}

        while self._running:
            for name, projection in self._projections.items():
                events = self._store.read_all(
                    from_position=positions[name],
                    max_count=100,
                )
                for event in events:
                    await projection.process(event)
                    positions[name] += 1

            await asyncio.sleep(poll_interval)

    def stop(self) -> None:
        """Stop projection runner."""
        self._running = False

    def get_stats(self) -> dict:
        """Get manager statistics."""
        return {
            "projections": {
                name: {"position": p.position, "event_types": p.event_types}
                for name, p in self._projections.items()
            }
        }


class AggregateRoot(ABC):
    """Base class for event-sourced aggregates.

    Usage:
        class Order(AggregateRoot):
            def __init__(self, order_id: str):
                super().__init__(order_id)
                self.items = []
                self.status = "pending"

            def create(self, items: List[dict]):
                self._apply("OrderCreated", {"items": items})

            def _on_OrderCreated(self, data: dict):
                self.items = data["items"]
                self.status = "created"
    """

    def __init__(self, aggregate_id: str):
        """Initialize aggregate."""
        self.id = aggregate_id
        self._version: int = 0
        self._uncommitted_events: List[Event] = []

    @property
    def version(self) -> int:
        """Current version."""
        return self._version

    def _apply(
        self,
        event_type: str,
        data: Dict[str, Any],
        is_new: bool = True,
    ) -> None:
        """Apply event to aggregate."""
        if is_new:
            event = Event(
                id=str(uuid.uuid4()),
                stream_id=self.id,
                type=event_type,
                data=data,
            )
            self._uncommitted_events.append(event)

        # Find and call handler
        handler_name = f"_on_{event_type}"
        handler = getattr(self, handler_name, None)
        if handler:
            handler(data)

        self._version += 1

    def get_uncommitted_events(self) -> List[Event]:
        """Get events not yet persisted."""
        return self._uncommitted_events.copy()

    def mark_committed(self) -> None:
        """Mark events as committed."""
        self._uncommitted_events.clear()

    def load_from_history(self, events: List[Event]) -> None:
        """Load aggregate from event history."""
        for event in events:
            self._apply(event.type, event.data, is_new=False)


class AggregateRepository(Generic[TypeVar("T", bound=AggregateRoot)]):
    """Repository for event-sourced aggregates.

    Usage:
        repo = AggregateRepository(Order, event_store)
        order = await repo.get("order-123")
        order.ship()
        await repo.save(order)
    """

    def __init__(
        self,
        aggregate_type: Type,
        store: EventStore,
        snapshot_interval: int = 100,
    ):
        """Initialize repository."""
        self._aggregate_type = aggregate_type
        self._store = store
        self._snapshot_interval = snapshot_interval

    async def get(self, aggregate_id: str) -> Optional[Any]:
        """Load aggregate from store."""
        stream = self._store.get_stream(aggregate_id)
        if not stream:
            return None

        aggregate = self._aggregate_type(aggregate_id)

        # Check for snapshot
        snapshot = stream.get_snapshot()
        if snapshot:
            aggregate.__dict__.update(snapshot.state)
            aggregate._version = snapshot.version
            events = stream.get_events_from(snapshot.version)
        else:
            events = stream.events

        aggregate.load_from_history(events)
        return aggregate

    async def save(self, aggregate: Any) -> List[Event]:
        """Save aggregate to store."""
        events = aggregate.get_uncommitted_events()
        saved_events = []

        for event in events:
            saved = await self._store.append_async(
                stream_id=aggregate.id,
                event_type=event.type,
                data=event.data,
                metadata=event.metadata,
            )
            saved_events.append(saved)

        aggregate.mark_committed()

        # Create snapshot if needed
        if aggregate.version % self._snapshot_interval == 0:
            state = {k: v for k, v in aggregate.__dict__.items()
                     if not k.startswith("_")}
            self._store.save_snapshot(aggregate.id, state)

        return saved_events


class ConcurrencyError(Exception):
    """Raised when optimistic concurrency check fails."""
    pass


# Singleton instance
event_store = EventStore()


# Convenience functions
def append_event(
    stream_id: str,
    event_type: str,
    data: Dict[str, Any],
    **kwargs,
) -> Event:
    """Append event to global store."""
    return event_store.append(stream_id, event_type, data, **kwargs)


def read_stream(stream_id: str, from_version: int = 0) -> List[Event]:
    """Read stream from global store."""
    return event_store.read_stream(stream_id, from_version)
