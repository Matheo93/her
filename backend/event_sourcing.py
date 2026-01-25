"""
Event Sourcing - Sprint 735

Event sourcing implementation.

Features:
- Event store
- Aggregates
- Projections
- Snapshots
- Event replay
"""

import time
import json
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Type, Generic
)
from abc import ABC, abstractmethod
import threading
from datetime import datetime


T = TypeVar("T")


@dataclass
class Event:
    """Base event class."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    aggregate_id: str = ""
    aggregate_type: str = ""
    event_type: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    version: int = 0
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "aggregate_id": self.aggregate_id,
            "aggregate_type": self.aggregate_type,
            "event_type": self.event_type,
            "data": self.data,
            "metadata": self.metadata,
            "version": self.version,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Event":
        """Create from dictionary."""
        return cls(**data)


@dataclass
class Snapshot:
    """Aggregate snapshot."""
    aggregate_id: str
    aggregate_type: str
    version: int
    state: Dict[str, Any]
    timestamp: float = field(default_factory=time.time)


class Aggregate(ABC):
    """Base aggregate class.

    Aggregates encapsulate domain logic and emit events.

    Usage:
        class UserAggregate(Aggregate):
            def __init__(self, user_id: str):
                super().__init__(user_id)
                self.name = ""
                self.email = ""

            def create(self, name: str, email: str):
                self._apply(Event(
                    event_type="UserCreated",
                    data={"name": name, "email": email}
                ))

            def _on_user_created(self, event: Event):
                self.name = event.data["name"]
                self.email = event.data["email"]
    """

    def __init__(self, aggregate_id: str):
        """Initialize aggregate."""
        self._id = aggregate_id
        self._version = 0
        self._uncommitted_events: List[Event] = []

    @property
    def id(self) -> str:
        """Get aggregate ID."""
        return self._id

    @property
    def version(self) -> int:
        """Get current version."""
        return self._version

    @property
    @abstractmethod
    def aggregate_type(self) -> str:
        """Get aggregate type name."""
        pass

    def _apply(self, event: Event) -> None:
        """Apply an event."""
        event.aggregate_id = self._id
        event.aggregate_type = self.aggregate_type
        event.version = self._version + 1

        # Apply to state
        self._mutate(event)

        # Track uncommitted
        self._uncommitted_events.append(event)
        self._version = event.version

    def _mutate(self, event: Event) -> None:
        """Mutate state from event."""
        handler_name = f"_on_{self._to_snake_case(event.event_type)}"
        handler = getattr(self, handler_name, None)
        if handler:
            handler(event)

    def _to_snake_case(self, name: str) -> str:
        """Convert CamelCase to snake_case."""
        result = []
        for i, char in enumerate(name):
            if char.isupper() and i > 0:
                result.append("_")
            result.append(char.lower())
        return "".join(result)

    def load_from_history(self, events: List[Event]) -> None:
        """Load aggregate from event history."""
        for event in events:
            self._mutate(event)
            self._version = event.version

    def get_uncommitted_events(self) -> List[Event]:
        """Get uncommitted events."""
        return self._uncommitted_events.copy()

    def clear_uncommitted_events(self) -> None:
        """Clear uncommitted events."""
        self._uncommitted_events.clear()

    def get_snapshot(self) -> Snapshot:
        """Create a snapshot."""
        return Snapshot(
            aggregate_id=self._id,
            aggregate_type=self.aggregate_type,
            version=self._version,
            state=self._get_state(),
        )

    def load_from_snapshot(self, snapshot: Snapshot) -> None:
        """Load from snapshot."""
        self._version = snapshot.version
        self._set_state(snapshot.state)

    @abstractmethod
    def _get_state(self) -> Dict[str, Any]:
        """Get serializable state."""
        pass

    @abstractmethod
    def _set_state(self, state: Dict[str, Any]) -> None:
        """Set state from serialized data."""
        pass


class EventStore:
    """Event store for persisting events.

    Usage:
        store = EventStore()

        # Save events
        store.save(aggregate_id, events)

        # Load events
        events = store.load(aggregate_id)

        # Load with version filter
        events = store.load(aggregate_id, from_version=10)
    """

    def __init__(self):
        """Initialize event store."""
        self._events: Dict[str, List[Event]] = {}
        self._snapshots: Dict[str, Snapshot] = {}
        self._all_events: List[Event] = []
        self._lock = threading.Lock()
        self._handlers: List[Callable[[Event], None]] = []

    def save(self, aggregate_id: str, events: List[Event]) -> None:
        """Save events for an aggregate.

        Args:
            aggregate_id: Aggregate ID
            events: Events to save
        """
        with self._lock:
            if aggregate_id not in self._events:
                self._events[aggregate_id] = []

            for event in events:
                self._events[aggregate_id].append(event)
                self._all_events.append(event)

                # Notify handlers
                for handler in self._handlers:
                    handler(event)

    def load(
        self,
        aggregate_id: str,
        from_version: int = -1,
        to_version: Optional[int] = None,
    ) -> List[Event]:
        """Load events for an aggregate.

        Args:
            aggregate_id: Aggregate ID
            from_version: Start version (exclusive), -1 for all
            to_version: End version (inclusive)

        Returns:
            List of events
        """
        events = self._events.get(aggregate_id, [])

        filtered = [
            e for e in events
            if e.version > from_version
            and (to_version is None or e.version <= to_version)
        ]

        return filtered

    def load_all(
        self,
        from_position: int = 0,
        limit: Optional[int] = None,
    ) -> List[Event]:
        """Load all events.

        Args:
            from_position: Start position
            limit: Max events

        Returns:
            List of events
        """
        events = self._all_events[from_position:]
        if limit:
            events = events[:limit]
        return events

    def save_snapshot(self, snapshot: Snapshot) -> None:
        """Save aggregate snapshot."""
        with self._lock:
            self._snapshots[snapshot.aggregate_id] = snapshot

    def load_snapshot(self, aggregate_id: str) -> Optional[Snapshot]:
        """Load aggregate snapshot."""
        return self._snapshots.get(aggregate_id)

    def on_event(self, handler: Callable[[Event], None]) -> None:
        """Subscribe to events."""
        self._handlers.append(handler)

    def get_aggregate_ids(self, aggregate_type: Optional[str] = None) -> List[str]:
        """Get all aggregate IDs."""
        if aggregate_type:
            ids = set()
            for events in self._events.values():
                for e in events:
                    if e.aggregate_type == aggregate_type:
                        ids.add(e.aggregate_id)
            return list(ids)
        return list(self._events.keys())

    def get_event_count(self, aggregate_id: Optional[str] = None) -> int:
        """Get event count."""
        if aggregate_id:
            return len(self._events.get(aggregate_id, []))
        return len(self._all_events)


class Repository(Generic[T]):
    """Aggregate repository.

    Usage:
        repo = Repository(UserAggregate, event_store)

        # Save
        user = UserAggregate("user-123")
        user.create("Alice", "alice@example.com")
        repo.save(user)

        # Load
        user = repo.load("user-123")
    """

    def __init__(
        self,
        aggregate_class: Type[T],
        event_store: EventStore,
        snapshot_frequency: int = 100,
    ):
        """Initialize repository."""
        self._aggregate_class = aggregate_class
        self._event_store = event_store
        self._snapshot_frequency = snapshot_frequency

    def save(self, aggregate: T) -> None:
        """Save aggregate events."""
        events = aggregate.get_uncommitted_events()
        if not events:
            return

        self._event_store.save(aggregate.id, events)
        aggregate.clear_uncommitted_events()

        # Create snapshot if needed
        if aggregate.version % self._snapshot_frequency == 0:
            snapshot = aggregate.get_snapshot()
            self._event_store.save_snapshot(snapshot)

    def load(self, aggregate_id: str) -> Optional[T]:
        """Load aggregate from events."""
        # Try loading from snapshot first
        snapshot = self._event_store.load_snapshot(aggregate_id)

        aggregate = self._aggregate_class(aggregate_id)

        if snapshot:
            aggregate.load_from_snapshot(snapshot)
            events = self._event_store.load(aggregate_id, from_version=snapshot.version)
        else:
            events = self._event_store.load(aggregate_id)

        if not events and not snapshot:
            return None

        aggregate.load_from_history(events)
        return aggregate


class Projection(ABC):
    """Base projection class.

    Projections build read models from events.

    Usage:
        class UserListProjection(Projection):
            def __init__(self):
                super().__init__()
                self.users = {}

            @property
            def handles(self) -> List[str]:
                return ["UserCreated", "UserUpdated"]

            def apply(self, event: Event):
                if event.event_type == "UserCreated":
                    self.users[event.aggregate_id] = {
                        "id": event.aggregate_id,
                        "name": event.data["name"]
                    }
    """

    def __init__(self):
        """Initialize projection."""
        self._position = 0
        self._lock = threading.Lock()

    @property
    @abstractmethod
    def handles(self) -> List[str]:
        """Event types this projection handles."""
        pass

    @abstractmethod
    def apply(self, event: Event) -> None:
        """Apply event to projection."""
        pass

    def update_position(self, position: int) -> None:
        """Update position."""
        self._position = position

    @property
    def position(self) -> int:
        """Get current position."""
        return self._position


class ProjectionManager:
    """Manages projections and rebuilds.

    Usage:
        manager = ProjectionManager(event_store)
        manager.register(UserListProjection())
        manager.start()  # Start processing new events
        manager.rebuild()  # Rebuild from scratch
    """

    def __init__(self, event_store: EventStore):
        """Initialize projection manager."""
        self._event_store = event_store
        self._projections: List[Projection] = []
        self._running = False

    def register(self, projection: Projection) -> None:
        """Register a projection."""
        self._projections.append(projection)

    def process_event(self, event: Event) -> None:
        """Process single event through projections."""
        for projection in self._projections:
            if event.event_type in projection.handles:
                projection.apply(event)

    def rebuild(self, projection: Optional[Projection] = None) -> None:
        """Rebuild projection(s) from scratch."""
        targets = [projection] if projection else self._projections

        for proj in targets:
            # Reset position
            proj.update_position(0)

            # Replay all events
            events = self._event_store.load_all()
            for i, event in enumerate(events):
                if event.event_type in proj.handles:
                    proj.apply(event)
                proj.update_position(i + 1)

    def catch_up(self, projection: Optional[Projection] = None) -> None:
        """Catch up projection(s) to current position."""
        targets = [projection] if projection else self._projections

        for proj in targets:
            events = self._event_store.load_all(from_position=proj.position)
            for i, event in enumerate(events):
                if event.event_type in proj.handles:
                    proj.apply(event)
                proj.update_position(proj.position + i + 1)

    def start(self) -> None:
        """Start processing events."""
        self._running = True
        self._event_store.on_event(self.process_event)

    def stop(self) -> None:
        """Stop processing events."""
        self._running = False


# Singleton instances
event_store = EventStore()


# Convenience functions
def create_event(
    event_type: str,
    aggregate_id: str = "",
    aggregate_type: str = "",
    data: Optional[Dict] = None,
) -> Event:
    """Create an event."""
    return Event(
        event_type=event_type,
        aggregate_id=aggregate_id,
        aggregate_type=aggregate_type,
        data=data or {},
    )


def save_events(aggregate_id: str, events: List[Event]) -> None:
    """Save events to global store."""
    event_store.save(aggregate_id, events)


def load_events(aggregate_id: str) -> List[Event]:
    """Load events from global store."""
    return event_store.load(aggregate_id)
