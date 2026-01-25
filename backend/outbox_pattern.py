"""
Outbox Pattern - Sprint 691

Reliable event publishing pattern.

Features:
- Outbox table simulation
- Event publishing
- Retry mechanism
- Idempotency
- Processing guarantees
"""

import time
import asyncio
import uuid
import json
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar,
    Awaitable
)
from enum import Enum
import threading


class OutboxStatus(str, Enum):
    """Outbox entry status."""
    PENDING = "pending"
    PROCESSING = "processing"
    PUBLISHED = "published"
    FAILED = "failed"


@dataclass
class OutboxEntry:
    """Outbox entry representing an event to publish."""
    id: str
    event_type: str
    payload: Dict[str, Any]
    aggregate_id: Optional[str] = None
    aggregate_type: Optional[str] = None
    status: OutboxStatus = OutboxStatus.PENDING
    created_at: float = field(default_factory=time.time)
    processed_at: Optional[float] = None
    attempts: int = 0
    max_attempts: int = 3
    last_error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "event_type": self.event_type,
            "payload": self.payload,
            "aggregate_id": self.aggregate_id,
            "aggregate_type": self.aggregate_type,
            "status": self.status.value,
            "created_at": self.created_at,
            "processed_at": self.processed_at,
            "attempts": self.attempts,
            "metadata": self.metadata,
        }


class OutboxStore:
    """In-memory outbox store (replace with DB in production).

    Usage:
        store = OutboxStore()

        # Add entry
        entry = store.add("user.created", {"user_id": "123"})

        # Get pending entries
        pending = store.get_pending(limit=10)

        # Mark as published
        store.mark_published(entry.id)
    """

    def __init__(self):
        """Initialize store."""
        self._entries: Dict[str, OutboxEntry] = {}
        self._lock = threading.Lock()

    def add(
        self,
        event_type: str,
        payload: Dict[str, Any],
        aggregate_id: Optional[str] = None,
        aggregate_type: Optional[str] = None,
        max_attempts: int = 3,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> OutboxEntry:
        """Add entry to outbox."""
        entry = OutboxEntry(
            id=str(uuid.uuid4()),
            event_type=event_type,
            payload=payload,
            aggregate_id=aggregate_id,
            aggregate_type=aggregate_type,
            max_attempts=max_attempts,
            metadata=metadata or {},
        )

        with self._lock:
            self._entries[entry.id] = entry

        return entry

    def get(self, entry_id: str) -> Optional[OutboxEntry]:
        """Get entry by ID."""
        return self._entries.get(entry_id)

    def get_pending(self, limit: int = 100) -> List[OutboxEntry]:
        """Get pending entries."""
        with self._lock:
            pending = [
                e for e in self._entries.values()
                if e.status == OutboxStatus.PENDING
            ]
            pending.sort(key=lambda e: e.created_at)
            return pending[:limit]

    def get_failed(self, limit: int = 100) -> List[OutboxEntry]:
        """Get failed entries that can be retried."""
        with self._lock:
            failed = [
                e for e in self._entries.values()
                if e.status == OutboxStatus.FAILED and e.attempts < e.max_attempts
            ]
            return failed[:limit]

    def mark_processing(self, entry_id: str) -> bool:
        """Mark entry as processing."""
        entry = self._entries.get(entry_id)
        if entry and entry.status in (OutboxStatus.PENDING, OutboxStatus.FAILED):
            entry.status = OutboxStatus.PROCESSING
            entry.attempts += 1
            return True
        return False

    def mark_published(self, entry_id: str) -> bool:
        """Mark entry as published."""
        entry = self._entries.get(entry_id)
        if entry:
            entry.status = OutboxStatus.PUBLISHED
            entry.processed_at = time.time()
            return True
        return False

    def mark_failed(self, entry_id: str, error: str) -> bool:
        """Mark entry as failed."""
        entry = self._entries.get(entry_id)
        if entry:
            entry.status = OutboxStatus.FAILED
            entry.last_error = error
            return True
        return False

    def remove_published(self, older_than_hours: int = 24) -> int:
        """Remove old published entries."""
        cutoff = time.time() - (older_than_hours * 3600)
        count = 0

        with self._lock:
            to_remove = [
                eid for eid, e in self._entries.items()
                if e.status == OutboxStatus.PUBLISHED and (e.processed_at or 0) < cutoff
            ]
            for eid in to_remove:
                del self._entries[eid]
                count += 1

        return count

    def get_stats(self) -> dict:
        """Get store statistics."""
        with self._lock:
            total = len(self._entries)
            by_status = {}
            for e in self._entries.values():
                by_status[e.status.value] = by_status.get(e.status.value, 0) + 1

        return {
            "total_entries": total,
            "by_status": by_status,
        }


class OutboxPublisher:
    """Publisher that processes outbox entries.

    Usage:
        publisher = OutboxPublisher(store)

        # Register handler
        publisher.on("user.created", async_publish_to_kafka)

        # Process entries
        await publisher.process()

        # Or run continuous
        await publisher.run(interval=5.0)
    """

    def __init__(self, store: OutboxStore):
        """Initialize publisher.

        Args:
            store: Outbox store
        """
        self._store = store
        self._handlers: Dict[str, Callable[[OutboxEntry], Awaitable[None]]] = {}
        self._default_handler: Optional[Callable[[OutboxEntry], Awaitable[None]]] = None
        self._running = False
        self._stats = {
            "processed": 0,
            "published": 0,
            "failed": 0,
        }

    def on(
        self,
        event_type: str,
        handler: Callable[[OutboxEntry], Awaitable[None]],
    ) -> "OutboxPublisher":
        """Register handler for event type.

        Args:
            event_type: Event type to handle
            handler: Async handler function

        Returns:
            Self for chaining
        """
        self._handlers[event_type] = handler
        return self

    def set_default_handler(
        self,
        handler: Callable[[OutboxEntry], Awaitable[None]],
    ) -> "OutboxPublisher":
        """Set default handler for unregistered event types."""
        self._default_handler = handler
        return self

    async def process(self, limit: int = 100) -> int:
        """Process pending entries.

        Args:
            limit: Max entries to process

        Returns:
            Number of entries processed
        """
        entries = self._store.get_pending(limit)
        entries.extend(self._store.get_failed(limit))

        processed = 0
        for entry in entries[:limit]:
            await self._process_entry(entry)
            processed += 1

        return processed

    async def _process_entry(self, entry: OutboxEntry):
        """Process single entry."""
        if not self._store.mark_processing(entry.id):
            return

        self._stats["processed"] += 1

        handler = self._handlers.get(entry.event_type, self._default_handler)
        if not handler:
            self._store.mark_failed(entry.id, f"No handler for {entry.event_type}")
            self._stats["failed"] += 1
            return

        try:
            await handler(entry)
            self._store.mark_published(entry.id)
            self._stats["published"] += 1
        except Exception as e:
            self._store.mark_failed(entry.id, str(e))
            self._stats["failed"] += 1

    async def run(
        self,
        interval: float = 5.0,
        batch_size: int = 100,
    ):
        """Run continuous processing loop.

        Args:
            interval: Seconds between processing cycles
            batch_size: Entries per cycle
        """
        self._running = True
        while self._running:
            try:
                await self.process(batch_size)
            except Exception:
                pass
            await asyncio.sleep(interval)

    def stop(self):
        """Stop the processing loop."""
        self._running = False

    def get_stats(self) -> dict:
        """Get publisher statistics."""
        return {
            **self._stats,
            "registered_handlers": len(self._handlers),
            "has_default_handler": self._default_handler is not None,
        }


class OutboxManager:
    """High-level outbox management.

    Usage:
        manager = OutboxManager()

        # Create event with context manager
        async with manager.transaction() as tx:
            # Your business logic...
            tx.emit("user.created", {"user_id": user.id})
            tx.emit("email.send", {"to": user.email, "template": "welcome"})

        # Register handlers
        manager.on("user.created", publish_to_kafka)

        # Start processing
        await manager.start()
    """

    def __init__(self):
        """Initialize manager."""
        self._store = OutboxStore()
        self._publisher = OutboxPublisher(self._store)
        self._task: Optional[asyncio.Task] = None

    def emit(
        self,
        event_type: str,
        payload: Dict[str, Any],
        aggregate_id: Optional[str] = None,
        aggregate_type: Optional[str] = None,
    ) -> OutboxEntry:
        """Emit event to outbox.

        Args:
            event_type: Event type
            payload: Event payload
            aggregate_id: Optional aggregate ID
            aggregate_type: Optional aggregate type

        Returns:
            Created outbox entry
        """
        return self._store.add(
            event_type=event_type,
            payload=payload,
            aggregate_id=aggregate_id,
            aggregate_type=aggregate_type,
        )

    def on(
        self,
        event_type: str,
        handler: Callable[[OutboxEntry], Awaitable[None]],
    ) -> "OutboxManager":
        """Register event handler."""
        self._publisher.on(event_type, handler)
        return self

    def transaction(self) -> "OutboxTransaction":
        """Create transaction context."""
        return OutboxTransaction(self._store)

    async def process(self, limit: int = 100) -> int:
        """Process pending entries."""
        return await self._publisher.process(limit)

    async def start(
        self,
        interval: float = 5.0,
        batch_size: int = 100,
    ):
        """Start background processing."""
        self._task = asyncio.create_task(
            self._publisher.run(interval, batch_size)
        )

    def stop(self):
        """Stop background processing."""
        self._publisher.stop()
        if self._task:
            self._task.cancel()

    def get_stats(self) -> dict:
        """Get manager statistics."""
        return {
            "store": self._store.get_stats(),
            "publisher": self._publisher.get_stats(),
        }

    def cleanup(self, older_than_hours: int = 24) -> int:
        """Cleanup old entries."""
        return self._store.remove_published(older_than_hours)


class OutboxTransaction:
    """Transaction context for collecting events."""

    def __init__(self, store: OutboxStore):
        """Initialize transaction."""
        self._store = store
        self._entries: List[OutboxEntry] = []
        self._committed = False

    def emit(
        self,
        event_type: str,
        payload: Dict[str, Any],
        aggregate_id: Optional[str] = None,
        aggregate_type: Optional[str] = None,
    ) -> OutboxEntry:
        """Emit event (will be added on commit)."""
        entry = OutboxEntry(
            id=str(uuid.uuid4()),
            event_type=event_type,
            payload=payload,
            aggregate_id=aggregate_id,
            aggregate_type=aggregate_type,
        )
        self._entries.append(entry)
        return entry

    def commit(self):
        """Commit all pending entries to store."""
        if self._committed:
            return

        for entry in self._entries:
            self._store._entries[entry.id] = entry

        self._committed = True
        self._entries = []

    def rollback(self):
        """Discard all pending entries."""
        self._entries = []

    async def __aenter__(self) -> "OutboxTransaction":
        """Enter context."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Exit context - commit on success, rollback on error."""
        if exc_type is None:
            self.commit()
        else:
            self.rollback()
        return False


# Singleton instance
outbox_manager = OutboxManager()


# Convenience functions
def emit(
    event_type: str,
    payload: Dict[str, Any],
    aggregate_id: Optional[str] = None,
) -> OutboxEntry:
    """Emit event to global outbox."""
    return outbox_manager.emit(event_type, payload, aggregate_id)


def on_event(event_type: str) -> Callable:
    """Decorator for registering event handler.

    Usage:
        @on_event("user.created")
        async def handle_user_created(entry: OutboxEntry):
            await publish_to_kafka(entry.payload)
    """
    def decorator(func: Callable) -> Callable:
        outbox_manager.on(event_type, func)
        return func
    return decorator
