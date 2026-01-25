"""
Workflow Engine - Sprint 695

State machine and workflow orchestration.

Features:
- State definitions
- Transition rules
- Guards and actions
- Event-driven transitions
- Workflow persistence
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Set, Tuple
)
from enum import Enum
import threading
from abc import ABC, abstractmethod


@dataclass
class State:
    """Workflow state definition."""
    name: str
    on_enter: Optional[Callable[["WorkflowContext"], Awaitable[None]]] = None
    on_exit: Optional[Callable[["WorkflowContext"], Awaitable[None]]] = None
    is_initial: bool = False
    is_final: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Transition:
    """State transition definition."""
    name: str
    from_state: str
    to_state: str
    guard: Optional[Callable[["WorkflowContext"], bool]] = None
    action: Optional[Callable[["WorkflowContext"], Awaitable[None]]] = None
    priority: int = 0


@dataclass
class WorkflowContext:
    """Context passed through workflow execution."""
    workflow_id: str
    instance_id: str
    current_state: str
    data: Dict[str, Any] = field(default_factory=dict)
    history: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def set(self, key: str, value: Any):
        """Set context data."""
        self.data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        """Get context data."""
        return self.data.get(key, default)

    def add_history(self, from_state: str, to_state: str, transition: str):
        """Add transition to history."""
        self.history.append({
            "from": from_state,
            "to": to_state,
            "transition": transition,
            "timestamp": time.time(),
        })


class WorkflowStatus(str, Enum):
    """Workflow instance status."""
    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class WorkflowInstance:
    """Running workflow instance."""
    id: str
    workflow_id: str
    status: WorkflowStatus = WorkflowStatus.CREATED
    context: Optional[WorkflowContext] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    error: Optional[str] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "workflow_id": self.workflow_id,
            "status": self.status.value,
            "current_state": self.context.current_state if self.context else None,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "error": self.error,
        }


class Workflow:
    """Workflow definition with states and transitions.

    Usage:
        workflow = (
            Workflow("order-workflow")
            .add_state(State("pending", is_initial=True))
            .add_state(State("processing"))
            .add_state(State("shipped"))
            .add_state(State("delivered", is_final=True))
            .add_transition(Transition("start", "pending", "processing"))
            .add_transition(Transition("ship", "processing", "shipped"))
            .add_transition(Transition("deliver", "shipped", "delivered"))
        )
    """

    def __init__(self, name: str):
        """Initialize workflow."""
        self.name = name
        self._states: Dict[str, State] = {}
        self._transitions: Dict[str, Transition] = {}
        self._initial_state: Optional[str] = None
        self._final_states: Set[str] = set()

    def add_state(self, state: State) -> "Workflow":
        """Add state to workflow."""
        self._states[state.name] = state
        if state.is_initial:
            self._initial_state = state.name
        if state.is_final:
            self._final_states.add(state.name)
        return self

    def add_transition(self, transition: Transition) -> "Workflow":
        """Add transition to workflow."""
        self._transitions[transition.name] = transition
        return self

    def get_state(self, name: str) -> Optional[State]:
        """Get state by name."""
        return self._states.get(name)

    def get_transition(self, name: str) -> Optional[Transition]:
        """Get transition by name."""
        return self._transitions.get(name)

    def get_available_transitions(self, current_state: str) -> List[Transition]:
        """Get transitions available from current state."""
        return [
            t for t in self._transitions.values()
            if t.from_state == current_state
        ]

    def validate(self) -> Tuple[bool, List[str]]:
        """Validate workflow definition."""
        errors = []

        if not self._initial_state:
            errors.append("No initial state defined")

        if not self._final_states:
            errors.append("No final states defined")

        for t in self._transitions.values():
            if t.from_state not in self._states:
                errors.append(f"Transition '{t.name}' references unknown state '{t.from_state}'")
            if t.to_state not in self._states:
                errors.append(f"Transition '{t.name}' references unknown state '{t.to_state}'")

        return len(errors) == 0, errors


class WorkflowExecutor:
    """Executes workflow instances.

    Usage:
        executor = WorkflowExecutor(workflow)

        # Create instance
        instance = executor.create_instance({"order_id": "123"})

        # Trigger transition
        await executor.trigger(instance, "start")
        await executor.trigger(instance, "ship")
    """

    def __init__(self, workflow: Workflow):
        """Initialize executor."""
        self._workflow = workflow
        self._instances: Dict[str, WorkflowInstance] = {}
        self._lock = threading.Lock()
        self._on_transition_handlers: List[Callable] = []
        self._on_complete_handlers: List[Callable] = []
        self._on_error_handlers: List[Callable] = []

    def create_instance(
        self,
        initial_data: Optional[Dict[str, Any]] = None,
    ) -> WorkflowInstance:
        """Create new workflow instance."""
        if not self._workflow._initial_state:
            raise ValueError("Workflow has no initial state")

        instance_id = str(uuid.uuid4())
        context = WorkflowContext(
            workflow_id=self._workflow.name,
            instance_id=instance_id,
            current_state=self._workflow._initial_state,
            data=initial_data or {},
        )

        instance = WorkflowInstance(
            id=instance_id,
            workflow_id=self._workflow.name,
            context=context,
        )

        with self._lock:
            self._instances[instance_id] = instance

        return instance

    async def trigger(
        self,
        instance: WorkflowInstance,
        transition_name: str,
    ) -> bool:
        """Trigger a transition.

        Args:
            instance: Workflow instance
            transition_name: Name of transition to trigger

        Returns:
            True if transition was successful
        """
        if instance.status in (WorkflowStatus.COMPLETED, WorkflowStatus.FAILED, WorkflowStatus.CANCELLED):
            return False

        transition = self._workflow.get_transition(transition_name)
        if not transition:
            return False

        if transition.from_state != instance.context.current_state:
            return False

        # Check guard
        if transition.guard and not transition.guard(instance.context):
            return False

        from_state = instance.context.current_state
        to_state = transition.to_state

        try:
            # Start if not running
            if instance.status == WorkflowStatus.CREATED:
                instance.status = WorkflowStatus.RUNNING
                instance.started_at = time.time()

            # Exit current state
            current_state_obj = self._workflow.get_state(from_state)
            if current_state_obj and current_state_obj.on_exit:
                await current_state_obj.on_exit(instance.context)

            # Execute transition action
            if transition.action:
                await transition.action(instance.context)

            # Update state
            instance.context.current_state = to_state
            instance.context.add_history(from_state, to_state, transition_name)

            # Enter new state
            new_state_obj = self._workflow.get_state(to_state)
            if new_state_obj and new_state_obj.on_enter:
                await new_state_obj.on_enter(instance.context)

            # Notify handlers
            for handler in self._on_transition_handlers:
                try:
                    await handler(instance, transition_name, from_state, to_state)
                except Exception:
                    pass

            # Check if complete
            if to_state in self._workflow._final_states:
                instance.status = WorkflowStatus.COMPLETED
                instance.completed_at = time.time()

                for handler in self._on_complete_handlers:
                    try:
                        await handler(instance)
                    except Exception:
                        pass

            return True

        except Exception as e:
            instance.status = WorkflowStatus.FAILED
            instance.error = str(e)

            for handler in self._on_error_handlers:
                try:
                    await handler(instance, e)
                except Exception:
                    pass

            return False

    async def auto_advance(
        self,
        instance: WorkflowInstance,
        max_transitions: int = 100,
    ) -> int:
        """Automatically advance through transitions.

        Uses guards to determine which transitions to take.
        """
        count = 0
        while count < max_transitions:
            if instance.status in (WorkflowStatus.COMPLETED, WorkflowStatus.FAILED):
                break

            available = self._workflow.get_available_transitions(
                instance.context.current_state
            )

            # Sort by priority
            available.sort(key=lambda t: t.priority, reverse=True)

            triggered = False
            for t in available:
                if t.guard is None or t.guard(instance.context):
                    if await self.trigger(instance, t.name):
                        count += 1
                        triggered = True
                        break

            if not triggered:
                break

        return count

    def on_transition(self, handler: Callable) -> "WorkflowExecutor":
        """Register transition handler."""
        self._on_transition_handlers.append(handler)
        return self

    def on_complete(self, handler: Callable) -> "WorkflowExecutor":
        """Register completion handler."""
        self._on_complete_handlers.append(handler)
        return self

    def on_error(self, handler: Callable) -> "WorkflowExecutor":
        """Register error handler."""
        self._on_error_handlers.append(handler)
        return self

    def get_instance(self, instance_id: str) -> Optional[WorkflowInstance]:
        """Get instance by ID."""
        return self._instances.get(instance_id)

    def get_instances(
        self,
        status: Optional[WorkflowStatus] = None,
        limit: int = 100,
    ) -> List[WorkflowInstance]:
        """Get instances with optional filter."""
        instances = list(self._instances.values())
        if status:
            instances = [i for i in instances if i.status == status]
        instances.sort(key=lambda i: i.created_at, reverse=True)
        return instances[:limit]


class WorkflowEngine:
    """Central engine for managing multiple workflows.

    Usage:
        engine = WorkflowEngine()

        # Register workflow
        engine.register(order_workflow)

        # Start instance
        instance = await engine.start("order-workflow", {"order_id": "123"})

        # Trigger transition
        await engine.trigger(instance.id, "ship")
    """

    def __init__(self):
        """Initialize engine."""
        self._workflows: Dict[str, Workflow] = {}
        self._executors: Dict[str, WorkflowExecutor] = {}
        self._instances: Dict[str, Tuple[str, WorkflowInstance]] = {}
        self._lock = threading.Lock()
        self._stats = {
            "total_instances": 0,
            "completed": 0,
            "failed": 0,
        }

    def register(self, workflow: Workflow) -> "WorkflowEngine":
        """Register workflow."""
        valid, errors = workflow.validate()
        if not valid:
            raise ValueError(f"Invalid workflow: {errors}")

        with self._lock:
            self._workflows[workflow.name] = workflow
            self._executors[workflow.name] = WorkflowExecutor(workflow)

        return self

    def get_workflow(self, name: str) -> Optional[Workflow]:
        """Get workflow by name."""
        return self._workflows.get(name)

    async def start(
        self,
        workflow_name: str,
        initial_data: Optional[Dict[str, Any]] = None,
    ) -> WorkflowInstance:
        """Start a new workflow instance."""
        executor = self._executors.get(workflow_name)
        if not executor:
            raise ValueError(f"Workflow not found: {workflow_name}")

        instance = executor.create_instance(initial_data)
        self._stats["total_instances"] += 1

        with self._lock:
            self._instances[instance.id] = (workflow_name, instance)

        return instance

    async def trigger(
        self,
        instance_id: str,
        transition_name: str,
    ) -> bool:
        """Trigger transition on instance."""
        entry = self._instances.get(instance_id)
        if not entry:
            return False

        workflow_name, instance = entry
        executor = self._executors.get(workflow_name)
        if not executor:
            return False

        result = await executor.trigger(instance, transition_name)

        if instance.status == WorkflowStatus.COMPLETED:
            self._stats["completed"] += 1
        elif instance.status == WorkflowStatus.FAILED:
            self._stats["failed"] += 1

        return result

    def get_instance(self, instance_id: str) -> Optional[WorkflowInstance]:
        """Get instance by ID."""
        entry = self._instances.get(instance_id)
        return entry[1] if entry else None

    def get_instances(
        self,
        workflow_name: Optional[str] = None,
        status: Optional[WorkflowStatus] = None,
        limit: int = 100,
    ) -> List[WorkflowInstance]:
        """Get instances with filters."""
        instances = [entry[1] for entry in self._instances.values()]

        if workflow_name:
            instances = [i for i in instances if i.workflow_id == workflow_name]
        if status:
            instances = [i for i in instances if i.status == status]

        instances.sort(key=lambda i: i.created_at, reverse=True)
        return instances[:limit]

    def list_workflows(self) -> List[str]:
        """List registered workflow names."""
        return list(self._workflows.keys())

    def get_stats(self) -> dict:
        """Get engine statistics."""
        by_status = {}
        for _, instance in self._instances.values():
            by_status[instance.status.value] = by_status.get(instance.status.value, 0) + 1

        return {
            **self._stats,
            "registered_workflows": len(self._workflows),
            "active_instances": len(self._instances),
            "by_status": by_status,
        }


# Builder functions for common patterns
def linear_workflow(
    name: str,
    states: List[str],
    transition_prefix: str = "next",
) -> Workflow:
    """Create a simple linear workflow.

    Usage:
        wf = linear_workflow("simple", ["start", "middle", "end"])
    """
    workflow = Workflow(name)

    for i, state_name in enumerate(states):
        is_initial = i == 0
        is_final = i == len(states) - 1
        workflow.add_state(State(state_name, is_initial=is_initial, is_final=is_final))

    for i in range(len(states) - 1):
        workflow.add_transition(Transition(
            name=f"{transition_prefix}_{i+1}",
            from_state=states[i],
            to_state=states[i + 1],
        ))

    return workflow


def approval_workflow(name: str) -> Workflow:
    """Create a standard approval workflow."""
    return (
        Workflow(name)
        .add_state(State("draft", is_initial=True))
        .add_state(State("pending_approval"))
        .add_state(State("approved", is_final=True))
        .add_state(State("rejected", is_final=True))
        .add_transition(Transition("submit", "draft", "pending_approval"))
        .add_transition(Transition("approve", "pending_approval", "approved"))
        .add_transition(Transition("reject", "pending_approval", "rejected"))
        .add_transition(Transition("revise", "rejected", "draft"))
    )


# Singleton instance
workflow_engine = WorkflowEngine()


# Convenience functions
def create_workflow(name: str) -> Workflow:
    """Create a new workflow."""
    return Workflow(name)


async def start_workflow(
    workflow_name: str,
    initial_data: Optional[Dict[str, Any]] = None,
) -> WorkflowInstance:
    """Start workflow on global engine."""
    return await workflow_engine.start(workflow_name, initial_data)
