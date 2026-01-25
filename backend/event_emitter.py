"""
Event Emitter - Sprint 659

Pub/sub event system.

Features:
- Event subscription
- Async handlers
- Event history
- Wildcard patterns
- Priority handlers
"""

import asyncio
import time
import fnmatch
from dataclasses import dataclass, field
from typing import Dict, List, Any, Callable, Awaitable, Optional, Set
from enum import Enum
from collections import defaultdict
import threading
import weakref


class EventPriority(int, Enum):
    """Handler priority levels."""
    LOWEST = 0
    LOW = 25
    NORMAL = 50
    HIGH = 75
    HIGHEST = 100
    MONITOR = 200  # Always runs last, for logging


@dataclass
class Event:
    """Event data."""
    name: str
    data: Any = None
    timestamp: float = field(default_factory=time.time)
    source: Optional[str] = None
    cancelled: bool = False

    def cancel(self):
        """Cancel event propagation."""
        self.cancelled = True


@dataclass
class EventHandler:
    """Registered handler."""
    callback: Callable[[Event], Awaitable[None]]
    priority: EventPriority = EventPriority.NORMAL
    once: bool = False
    pattern: Optional[str] = None


@dataclass
class EventStats:
    """Statistics for an event type."""
    emit_count: int = 0
    handler_count: int = 0
    avg_duration_ms: float = 0
    last_emitted: Optional[float] = None


class EventEmitter:
    """Async event emitter with pattern matching.

    Usage:
        emitter = EventEmitter()

        # Subscribe to events
        @emitter.on("user.created")
        async def on_user_created(event: Event):
            print(f"User created: {event.data}")

        # Subscribe with wildcard
        @emitter.on("user.*")
        async def on_any_user_event(event: Event):
            print(f"User event: {event.name}")

        # Emit events
        await emitter.emit("user.created", {"id": 123, "name": "John"})

        # One-time handler
        @emitter.once("app.ready")
        async def on_ready(event: Event):
            print("App is ready!")
    """

    def __init__(self, max_history: int = 100):
        """Initialize event emitter.

        Args:
            max_history: Maximum events to keep in history
        """
        self._handlers: Dict[str, List[EventHandler]] = defaultdict(list)
        self._pattern_handlers: List[EventHandler] = []
        self._history: List[Event] = []
        self._max_history = max_history
        self._stats: Dict[str, EventStats] = defaultdict(EventStats)
        self._lock = threading.Lock()
        self._paused: Set[str] = set()

    def on(
        self,
        event_name: str,
        priority: EventPriority = EventPriority.NORMAL,
    ):
        """Decorator to register event handler.

        Args:
            event_name: Event name or pattern (supports wildcards)
            priority: Handler priority
        """
        def decorator(func: Callable[[Event], Awaitable[None]]):
            self.add_listener(event_name, func, priority=priority)
            return func
        return decorator

    def once(
        self,
        event_name: str,
        priority: EventPriority = EventPriority.NORMAL,
    ):
        """Decorator for one-time handler."""
        def decorator(func: Callable[[Event], Awaitable[None]]):
            self.add_listener(event_name, func, priority=priority, once=True)
            return func
        return decorator

    def add_listener(
        self,
        event_name: str,
        callback: Callable[[Event], Awaitable[None]],
        priority: EventPriority = EventPriority.NORMAL,
        once: bool = False,
    ):
        """Add event listener.

        Args:
            event_name: Event name or pattern
            callback: Async callback function
            priority: Handler priority
            once: Remove after first call
        """
        handler = EventHandler(
            callback=callback,
            priority=priority,
            once=once,
            pattern=event_name if "*" in event_name or "?" in event_name else None,
        )

        with self._lock:
            if handler.pattern:
                self._pattern_handlers.append(handler)
                self._pattern_handlers.sort(key=lambda h: -h.priority)
            else:
                self._handlers[event_name].append(handler)
                self._handlers[event_name].sort(key=lambda h: -h.priority)

    def remove_listener(
        self,
        event_name: str,
        callback: Callable[[Event], Awaitable[None]],
    ):
        """Remove event listener."""
        with self._lock:
            if "*" in event_name or "?" in event_name:
                self._pattern_handlers = [
                    h for h in self._pattern_handlers
                    if h.callback != callback or h.pattern != event_name
                ]
            else:
                self._handlers[event_name] = [
                    h for h in self._handlers[event_name]
                    if h.callback != callback
                ]

    def remove_all_listeners(self, event_name: Optional[str] = None):
        """Remove all listeners for an event or all events."""
        with self._lock:
            if event_name:
                self._handlers[event_name] = []
            else:
                self._handlers.clear()
                self._pattern_handlers.clear()

    async def emit(
        self,
        event_name: str,
        data: Any = None,
        source: Optional[str] = None,
    ) -> Event:
        """Emit an event.

        Args:
            event_name: Event name
            data: Event data
            source: Event source identifier

        Returns:
            The emitted event
        """
        event = Event(
            name=event_name,
            data=data,
            source=source,
        )

        # Check if paused
        if event_name in self._paused:
            return event

        start_time = time.time()

        # Get matching handlers
        handlers = self._get_handlers(event_name)

        # Track handlers to remove (once handlers)
        to_remove: List[tuple] = []

        # Execute handlers in priority order
        for handler in handlers:
            if event.cancelled:
                break

            try:
                await handler.callback(event)
            except Exception as e:
                # Log error but continue
                print(f"Event handler error for {event_name}: {e}")

            if handler.once:
                if handler.pattern:
                    to_remove.append(("pattern", handler))
                else:
                    to_remove.append((event_name, handler))

        # Remove one-time handlers
        with self._lock:
            for key, handler in to_remove:
                if key == "pattern":
                    if handler in self._pattern_handlers:
                        self._pattern_handlers.remove(handler)
                else:
                    if handler in self._handlers[key]:
                        self._handlers[key].remove(handler)

        # Update stats
        duration_ms = (time.time() - start_time) * 1000
        self._update_stats(event_name, duration_ms, len(handlers))

        # Add to history
        self._add_to_history(event)

        return event

    async def emit_async(
        self,
        event_name: str,
        data: Any = None,
        source: Optional[str] = None,
    ):
        """Emit event without waiting for handlers."""
        asyncio.create_task(self.emit(event_name, data, source))

    def _get_handlers(self, event_name: str) -> List[EventHandler]:
        """Get all handlers matching event name."""
        handlers = []

        with self._lock:
            # Exact match handlers
            handlers.extend(self._handlers.get(event_name, []))

            # Pattern match handlers
            for handler in self._pattern_handlers:
                if handler.pattern and fnmatch.fnmatch(event_name, handler.pattern):
                    handlers.append(handler)

        # Sort by priority
        handlers.sort(key=lambda h: -h.priority)
        return handlers

    def _update_stats(self, event_name: str, duration_ms: float, handler_count: int):
        """Update event statistics."""
        with self._lock:
            stats = self._stats[event_name]
            stats.emit_count += 1
            stats.handler_count = handler_count
            stats.last_emitted = time.time()
            
            # Rolling average
            if stats.emit_count == 1:
                stats.avg_duration_ms = duration_ms
            else:
                stats.avg_duration_ms = (
                    stats.avg_duration_ms * 0.9 + duration_ms * 0.1
                )

    def _add_to_history(self, event: Event):
        """Add event to history."""
        with self._lock:
            self._history.append(event)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]

    def pause(self, event_name: str):
        """Pause event emissions."""
        with self._lock:
            self._paused.add(event_name)

    def resume(self, event_name: str):
        """Resume event emissions."""
        with self._lock:
            self._paused.discard(event_name)

    def listener_count(self, event_name: str) -> int:
        """Get number of listeners for event."""
        count = len(self._handlers.get(event_name, []))
        for handler in self._pattern_handlers:
            if handler.pattern and fnmatch.fnmatch(event_name, handler.pattern):
                count += 1
        return count

    def event_names(self) -> List[str]:
        """Get all registered event names."""
        return list(self._handlers.keys())

    def get_history(
        self,
        event_name: Optional[str] = None,
        limit: int = 10,
    ) -> List[Event]:
        """Get event history."""
        with self._lock:
            if event_name:
                filtered = [e for e in self._history if e.name == event_name]
            else:
                filtered = self._history.copy()
            return filtered[-limit:]

    def get_stats(self, event_name: Optional[str] = None) -> dict:
        """Get event statistics."""
        with self._lock:
            if event_name:
                stats = self._stats.get(event_name)
                if stats:
                    return {
                        "emit_count": stats.emit_count,
                        "handler_count": stats.handler_count,
                        "avg_duration_ms": round(stats.avg_duration_ms, 2),
                        "last_emitted": stats.last_emitted,
                    }
                return {}
            
            return {
                name: {
                    "emit_count": s.emit_count,
                    "handler_count": s.handler_count,
                    "avg_duration_ms": round(s.avg_duration_ms, 2),
                }
                for name, s in self._stats.items()
            }

    def clear_history(self):
        """Clear event history."""
        with self._lock:
            self._history.clear()

    def reset_stats(self):
        """Reset all statistics."""
        with self._lock:
            self._stats.clear()


# Singleton instance
event_emitter = EventEmitter()


# Convenience functions
async def emit(event_name: str, data: Any = None, source: Optional[str] = None) -> Event:
    """Emit event using global emitter."""
    return await event_emitter.emit(event_name, data, source)


def on(event_name: str, priority: EventPriority = EventPriority.NORMAL):
    """Register handler on global emitter."""
    return event_emitter.on(event_name, priority)


def once(event_name: str, priority: EventPriority = EventPriority.NORMAL):
    """Register one-time handler on global emitter."""
    return event_emitter.once(event_name, priority)
