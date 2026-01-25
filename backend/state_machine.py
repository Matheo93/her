"""
State Machine - Sprint 723

Finite state machine implementation.

Features:
- States and transitions
- Guards and actions
- Event-driven transitions
- State history
- Hierarchical states
"""

import time
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Set, Tuple
)
from enum import Enum
import threading
from abc import ABC, abstractmethod


T = TypeVar("T")


@dataclass
class Transition:
    """State transition definition."""
    from_state: str
    to_state: str
    event: str
    guard: Optional[Callable[[], bool]] = None
    action: Optional[Callable[[], None]] = None
    description: str = ""

    def can_execute(self) -> bool:
        """Check if transition can execute."""
        if self.guard is None:
            return True
        return self.guard()


@dataclass
class State:
    """State definition."""
    name: str
    on_enter: Optional[Callable[[], None]] = None
    on_exit: Optional[Callable[[], None]] = None
    is_final: bool = False
    is_initial: bool = False
    parent: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StateChange:
    """Record of a state change."""
    from_state: str
    to_state: str
    event: str
    timestamp: float = field(default_factory=time.time)
    data: Dict[str, Any] = field(default_factory=dict)


class StateMachine:
    """Finite state machine implementation.

    Usage:
        sm = StateMachine("order")

        # Define states
        sm.add_state("pending", is_initial=True)
        sm.add_state("processing")
        sm.add_state("shipped")
        sm.add_state("delivered", is_final=True)
        sm.add_state("cancelled", is_final=True)

        # Define transitions
        sm.add_transition("pending", "processing", "process")
        sm.add_transition("processing", "shipped", "ship")
        sm.add_transition("shipped", "delivered", "deliver")
        sm.add_transition("pending", "cancelled", "cancel")
        sm.add_transition("processing", "cancelled", "cancel")

        # Use
        sm.start()
        sm.send("process")  # pending -> processing
        sm.send("ship")     # processing -> shipped
        print(sm.current_state)  # "shipped"
    """

    def __init__(
        self,
        name: str,
        context: Optional[Dict[str, Any]] = None,
    ):
        """Initialize state machine."""
        self.name = name
        self._states: Dict[str, State] = {}
        self._transitions: List[Transition] = []
        self._current_state: Optional[str] = None
        self._initial_state: Optional[str] = None
        self._context = context or {}
        self._history: List[StateChange] = []
        self._lock = threading.Lock()
        self._listeners: List[Callable[[StateChange], None]] = []
        self._started = False

    def add_state(
        self,
        name: str,
        on_enter: Optional[Callable[[], None]] = None,
        on_exit: Optional[Callable[[], None]] = None,
        is_initial: bool = False,
        is_final: bool = False,
        parent: Optional[str] = None,
        **metadata,
    ) -> "StateMachine":
        """Add a state.

        Args:
            name: State name
            on_enter: Callback when entering state
            on_exit: Callback when exiting state
            is_initial: Mark as initial state
            is_final: Mark as final state
            parent: Parent state for hierarchical FSM
            **metadata: Additional state metadata

        Returns:
            Self for chaining
        """
        state = State(
            name=name,
            on_enter=on_enter,
            on_exit=on_exit,
            is_initial=is_initial,
            is_final=is_final,
            parent=parent,
            metadata=metadata,
        )

        self._states[name] = state

        if is_initial:
            self._initial_state = name

        return self

    def add_transition(
        self,
        from_state: str,
        to_state: str,
        event: str,
        guard: Optional[Callable[[], bool]] = None,
        action: Optional[Callable[[], None]] = None,
        description: str = "",
    ) -> "StateMachine":
        """Add a transition.

        Args:
            from_state: Source state
            to_state: Target state
            event: Event that triggers transition
            guard: Optional guard condition
            action: Optional action to execute
            description: Transition description

        Returns:
            Self for chaining
        """
        transition = Transition(
            from_state=from_state,
            to_state=to_state,
            event=event,
            guard=guard,
            action=action,
            description=description,
        )

        self._transitions.append(transition)
        return self

    def start(self) -> bool:
        """Start the state machine.

        Returns:
            True if started successfully
        """
        with self._lock:
            if self._started:
                return False

            if not self._initial_state:
                raise ValueError("No initial state defined")

            self._current_state = self._initial_state
            self._started = True

            # Call on_enter for initial state
            state = self._states.get(self._current_state)
            if state and state.on_enter:
                state.on_enter()

            return True

    def send(self, event: str, data: Optional[Dict[str, Any]] = None) -> bool:
        """Send an event to the state machine.

        Args:
            event: Event name
            data: Optional event data

        Returns:
            True if transition occurred
        """
        with self._lock:
            if not self._started:
                raise RuntimeError("State machine not started")

            # Find matching transition
            transition = self._find_transition(event)

            if not transition:
                return False

            # Check guard
            if not transition.can_execute():
                return False

            # Execute transition
            return self._execute_transition(transition, data or {})

    def _find_transition(self, event: str) -> Optional[Transition]:
        """Find a matching transition."""
        for t in self._transitions:
            if t.from_state == self._current_state and t.event == event:
                return t
        return None

    def _execute_transition(
        self,
        transition: Transition,
        data: Dict[str, Any],
    ) -> bool:
        """Execute a transition."""
        old_state = self._current_state
        new_state = transition.to_state

        # Exit current state
        current = self._states.get(old_state)
        if current and current.on_exit:
            current.on_exit()

        # Execute action
        if transition.action:
            transition.action()

        # Update state
        self._current_state = new_state

        # Enter new state
        next_state = self._states.get(new_state)
        if next_state and next_state.on_enter:
            next_state.on_enter()

        # Record history
        change = StateChange(
            from_state=old_state,
            to_state=new_state,
            event=transition.event,
            data=data,
        )
        self._history.append(change)

        # Notify listeners
        for listener in self._listeners:
            listener(change)

        return True

    def can(self, event: str) -> bool:
        """Check if an event can be processed.

        Args:
            event: Event to check

        Returns:
            True if event can be processed
        """
        transition = self._find_transition(event)
        if not transition:
            return False
        return transition.can_execute()

    @property
    def current_state(self) -> Optional[str]:
        """Get current state."""
        return self._current_state

    @property
    def is_final(self) -> bool:
        """Check if in a final state."""
        if not self._current_state:
            return False
        state = self._states.get(self._current_state)
        return state.is_final if state else False

    @property
    def context(self) -> Dict[str, Any]:
        """Get context."""
        return self._context

    def set_context(self, key: str, value: Any) -> None:
        """Set context value."""
        self._context[key] = value

    def get_context(self, key: str, default: Any = None) -> Any:
        """Get context value."""
        return self._context.get(key, default)

    def on_transition(self, listener: Callable[[StateChange], None]) -> None:
        """Add transition listener."""
        self._listeners.append(listener)

    def get_history(self) -> List[StateChange]:
        """Get transition history."""
        return self._history.copy()

    def get_available_events(self) -> List[str]:
        """Get events available from current state."""
        events = []
        for t in self._transitions:
            if t.from_state == self._current_state and t.can_execute():
                events.append(t.event)
        return events

    def get_states(self) -> List[str]:
        """Get all state names."""
        return list(self._states.keys())

    def reset(self) -> None:
        """Reset to initial state."""
        with self._lock:
            self._current_state = self._initial_state
            self._history.clear()
            self._started = False

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "current_state": self._current_state,
            "is_final": self.is_final,
            "available_events": self.get_available_events(),
            "history_length": len(self._history),
            "states": self.get_states(),
        }


class StateMachineBuilder:
    """Fluent builder for state machines.

    Usage:
        sm = (StateMachineBuilder("traffic_light")
            .state("red", is_initial=True)
            .state("yellow")
            .state("green")
            .transition("red", "green", "timer")
            .transition("green", "yellow", "timer")
            .transition("yellow", "red", "timer")
            .build())
    """

    def __init__(self, name: str):
        """Initialize builder."""
        self._name = name
        self._states: List[Tuple[str, dict]] = []
        self._transitions: List[Tuple[str, str, str, dict]] = []
        self._context: Dict[str, Any] = {}

    def state(
        self,
        name: str,
        **kwargs,
    ) -> "StateMachineBuilder":
        """Add a state."""
        self._states.append((name, kwargs))
        return self

    def transition(
        self,
        from_state: str,
        to_state: str,
        event: str,
        **kwargs,
    ) -> "StateMachineBuilder":
        """Add a transition."""
        self._transitions.append((from_state, to_state, event, kwargs))
        return self

    def context(self, key: str, value: Any) -> "StateMachineBuilder":
        """Add context."""
        self._context[key] = value
        return self

    def build(self) -> StateMachine:
        """Build the state machine."""
        sm = StateMachine(self._name, self._context)

        for name, kwargs in self._states:
            sm.add_state(name, **kwargs)

        for from_state, to_state, event, kwargs in self._transitions:
            sm.add_transition(from_state, to_state, event, **kwargs)

        return sm


class StateMachineRunner:
    """Runs multiple state machines in parallel."""

    def __init__(self):
        """Initialize runner."""
        self._machines: Dict[str, StateMachine] = {}
        self._lock = threading.Lock()

    def register(self, machine_id: str, machine: StateMachine) -> None:
        """Register a state machine."""
        with self._lock:
            self._machines[machine_id] = machine

    def unregister(self, machine_id: str) -> bool:
        """Unregister a state machine."""
        with self._lock:
            if machine_id in self._machines:
                del self._machines[machine_id]
                return True
            return False

    def get(self, machine_id: str) -> Optional[StateMachine]:
        """Get a state machine."""
        return self._machines.get(machine_id)

    def send(self, machine_id: str, event: str, data: Optional[dict] = None) -> bool:
        """Send event to a specific machine."""
        machine = self._machines.get(machine_id)
        if not machine:
            return False
        return machine.send(event, data)

    def broadcast(self, event: str, data: Optional[dict] = None) -> Dict[str, bool]:
        """Send event to all machines."""
        results = {}
        for machine_id, machine in self._machines.items():
            results[machine_id] = machine.send(event, data)
        return results

    def get_all_states(self) -> Dict[str, str]:
        """Get current state of all machines."""
        return {
            mid: m.current_state or "unknown"
            for mid, m in self._machines.items()
        }


# Pre-built state machine templates
def order_state_machine() -> StateMachine:
    """Create an order state machine."""
    return (StateMachineBuilder("order")
        .state("pending", is_initial=True)
        .state("confirmed")
        .state("processing")
        .state("shipped")
        .state("delivered", is_final=True)
        .state("cancelled", is_final=True)
        .transition("pending", "confirmed", "confirm")
        .transition("pending", "cancelled", "cancel")
        .transition("confirmed", "processing", "process")
        .transition("confirmed", "cancelled", "cancel")
        .transition("processing", "shipped", "ship")
        .transition("shipped", "delivered", "deliver")
        .build())


def document_state_machine() -> StateMachine:
    """Create a document workflow state machine."""
    return (StateMachineBuilder("document")
        .state("draft", is_initial=True)
        .state("review")
        .state("approved")
        .state("published", is_final=True)
        .state("rejected")
        .transition("draft", "review", "submit")
        .transition("review", "approved", "approve")
        .transition("review", "rejected", "reject")
        .transition("rejected", "draft", "revise")
        .transition("approved", "published", "publish")
        .build())


def task_state_machine() -> StateMachine:
    """Create a task state machine."""
    return (StateMachineBuilder("task")
        .state("todo", is_initial=True)
        .state("in_progress")
        .state("blocked")
        .state("done", is_final=True)
        .transition("todo", "in_progress", "start")
        .transition("in_progress", "blocked", "block")
        .transition("blocked", "in_progress", "unblock")
        .transition("in_progress", "done", "complete")
        .transition("todo", "done", "complete")
        .build())


# Singleton runner
state_machine_runner = StateMachineRunner()


# Convenience functions
def create_state_machine(name: str) -> StateMachine:
    """Create a new state machine."""
    return StateMachine(name)


def create_builder(name: str) -> StateMachineBuilder:
    """Create a state machine builder."""
    return StateMachineBuilder(name)
