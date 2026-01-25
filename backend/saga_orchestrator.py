"""
Saga Orchestrator - Sprint 689

Distributed transaction pattern.

Features:
- Saga definition
- Step execution
- Compensation
- Retry logic
- State persistence
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable
)
from enum import Enum
import threading
from abc import ABC, abstractmethod


class SagaState(str, Enum):
    """Saga execution state."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    COMPENSATING = "compensating"
    COMPENSATED = "compensated"
    FAILED = "failed"


class StepState(str, Enum):
    """Step execution state."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    COMPENSATED = "compensated"
    FAILED = "failed"


T = TypeVar("T")


@dataclass
class SagaStep:
    """Saga step definition."""
    name: str
    action: Callable[["SagaContext"], Awaitable[Any]]
    compensation: Optional[Callable[["SagaContext"], Awaitable[None]]] = None
    retries: int = 0
    timeout: Optional[float] = None
    state: StepState = StepState.PENDING
    result: Optional[Any] = None
    error: Optional[str] = None


@dataclass
class SagaContext:
    """Context passed through saga execution."""
    saga_id: str
    data: Dict[str, Any] = field(default_factory=dict)
    step_results: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def set(self, key: str, value: Any):
        """Set context data."""
        self.data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        """Get context data."""
        return self.data.get(key, default)

    def get_result(self, step_name: str) -> Any:
        """Get result from a previous step."""
        return self.step_results.get(step_name)


@dataclass
class SagaExecution:
    """Saga execution state."""
    id: str
    saga_name: str
    state: SagaState = SagaState.PENDING
    current_step: int = 0
    steps: List[SagaStep] = field(default_factory=list)
    context: Optional[SagaContext] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    error: Optional[str] = None


class Saga:
    """Saga definition with steps and compensations.

    Usage:
        saga = (
            Saga("order-saga")
            .step("create_order", create_order, compensate=cancel_order)
            .step("reserve_inventory", reserve_inventory, compensate=release_inventory)
            .step("charge_payment", charge_payment, compensate=refund_payment)
            .step("ship_order", ship_order)
        )

        result = await saga.execute({"user_id": "123", "items": [...]})
    """

    def __init__(self, name: str):
        """Initialize saga.

        Args:
            name: Saga name
        """
        self.name = name
        self._steps: List[SagaStep] = []
        self._on_complete: Optional[Callable[[SagaContext], Awaitable[None]]] = None
        self._on_fail: Optional[Callable[[SagaContext, Exception], Awaitable[None]]] = None

    def step(
        self,
        name: str,
        action: Callable[[SagaContext], Awaitable[Any]],
        compensate: Optional[Callable[[SagaContext], Awaitable[None]]] = None,
        retries: int = 0,
        timeout: Optional[float] = None,
    ) -> "Saga":
        """Add step to saga.

        Args:
            name: Step name
            action: Step action
            compensate: Compensation action
            retries: Number of retries
            timeout: Step timeout

        Returns:
            Self for chaining
        """
        step = SagaStep(
            name=name,
            action=action,
            compensation=compensate,
            retries=retries,
            timeout=timeout,
        )
        self._steps.append(step)
        return self

    def on_complete(
        self,
        handler: Callable[[SagaContext], Awaitable[None]],
    ) -> "Saga":
        """Set completion handler."""
        self._on_complete = handler
        return self

    def on_fail(
        self,
        handler: Callable[[SagaContext, Exception], Awaitable[None]],
    ) -> "Saga":
        """Set failure handler."""
        self._on_fail = handler
        return self

    async def execute(
        self,
        initial_data: Optional[Dict[str, Any]] = None,
    ) -> SagaExecution:
        """Execute saga.

        Args:
            initial_data: Initial context data

        Returns:
            Saga execution result
        """
        execution = SagaExecution(
            id=str(uuid.uuid4()),
            saga_name=self.name,
            steps=[SagaStep(
                name=s.name,
                action=s.action,
                compensation=s.compensation,
                retries=s.retries,
                timeout=s.timeout,
            ) for s in self._steps],
            context=SagaContext(
                saga_id=str(uuid.uuid4()),
                data=initial_data or {},
            ),
            started_at=time.time(),
        )

        execution.state = SagaState.RUNNING

        try:
            # Execute steps
            for i, step in enumerate(execution.steps):
                execution.current_step = i
                await self._execute_step(execution, step)

            execution.state = SagaState.COMPLETED
            execution.completed_at = time.time()

            if self._on_complete and execution.context:
                await self._on_complete(execution.context)

        except Exception as e:
            execution.error = str(e)
            execution.state = SagaState.COMPENSATING

            # Run compensations
            await self._compensate(execution)

            if self._on_fail and execution.context:
                await self._on_fail(execution.context, e)

        return execution

    async def _execute_step(
        self,
        execution: SagaExecution,
        step: SagaStep,
    ):
        """Execute single step with retry."""
        step.state = StepState.RUNNING
        last_error: Optional[Exception] = None

        for attempt in range(step.retries + 1):
            try:
                if step.timeout:
                    result = await asyncio.wait_for(
                        step.action(execution.context),
                        timeout=step.timeout,
                    )
                else:
                    result = await step.action(execution.context)

                step.result = result
                step.state = StepState.COMPLETED

                if execution.context:
                    execution.context.step_results[step.name] = result

                return

            except Exception as e:
                last_error = e
                if attempt < step.retries:
                    await asyncio.sleep(1 * (attempt + 1))

        step.state = StepState.FAILED
        step.error = str(last_error) if last_error else "Unknown error"
        raise last_error or Exception("Step failed")

    async def _compensate(self, execution: SagaExecution):
        """Run compensation for completed steps in reverse."""
        # Get completed steps in reverse order
        completed_steps = [
            s for s in execution.steps
            if s.state == StepState.COMPLETED
        ]

        for step in reversed(completed_steps):
            if step.compensation:
                try:
                    await step.compensation(execution.context)
                    step.state = StepState.COMPENSATED
                except Exception as e:
                    # Log but continue compensating other steps
                    step.error = f"Compensation failed: {e}"

        execution.state = SagaState.COMPENSATED
        execution.completed_at = time.time()


class SagaOrchestrator:
    """Orchestrator for managing multiple sagas.

    Usage:
        orchestrator = SagaOrchestrator()

        # Register saga
        orchestrator.register(order_saga)

        # Start saga
        execution = await orchestrator.start("order-saga", {"user_id": "123"})

        # Check status
        status = orchestrator.get_execution(execution.id)
    """

    def __init__(self):
        """Initialize orchestrator."""
        self._sagas: Dict[str, Saga] = {}
        self._executions: Dict[str, SagaExecution] = {}
        self._lock = threading.Lock()
        self._stats = {
            "total_executions": 0,
            "completed": 0,
            "compensated": 0,
            "failed": 0,
        }

    def register(self, saga: Saga) -> "SagaOrchestrator":
        """Register saga.

        Args:
            saga: Saga to register

        Returns:
            Self for chaining
        """
        with self._lock:
            self._sagas[saga.name] = saga
        return self

    def get_saga(self, name: str) -> Optional[Saga]:
        """Get saga by name."""
        return self._sagas.get(name)

    async def start(
        self,
        saga_name: str,
        initial_data: Optional[Dict[str, Any]] = None,
    ) -> SagaExecution:
        """Start saga execution.

        Args:
            saga_name: Name of saga to execute
            initial_data: Initial context data

        Returns:
            Saga execution

        Raises:
            ValueError: If saga not found
        """
        saga = self._sagas.get(saga_name)
        if not saga:
            raise ValueError(f"Saga not found: {saga_name}")

        self._stats["total_executions"] += 1

        execution = await saga.execute(initial_data)

        with self._lock:
            self._executions[execution.id] = execution

            if execution.state == SagaState.COMPLETED:
                self._stats["completed"] += 1
            elif execution.state == SagaState.COMPENSATED:
                self._stats["compensated"] += 1
            else:
                self._stats["failed"] += 1

        return execution

    def get_execution(self, execution_id: str) -> Optional[SagaExecution]:
        """Get execution by ID."""
        return self._executions.get(execution_id)

    def get_executions(
        self,
        saga_name: Optional[str] = None,
        state: Optional[SagaState] = None,
        limit: int = 100,
    ) -> List[SagaExecution]:
        """Get executions with filters."""
        executions = list(self._executions.values())

        if saga_name:
            executions = [e for e in executions if e.saga_name == saga_name]
        if state:
            executions = [e for e in executions if e.state == state]

        executions.sort(key=lambda e: e.started_at or 0, reverse=True)
        return executions[:limit]

    def get_stats(self) -> dict:
        """Get orchestrator statistics."""
        return {
            **self._stats,
            "registered_sagas": len(self._sagas),
            "total_executions_stored": len(self._executions),
        }

    def list_sagas(self) -> List[str]:
        """List registered saga names."""
        return list(self._sagas.keys())

    def cleanup_old_executions(self, max_age_hours: int = 24) -> int:
        """Remove old executions."""
        cutoff = time.time() - (max_age_hours * 3600)
        count = 0

        with self._lock:
            old_ids = [
                eid for eid, e in self._executions.items()
                if (e.completed_at or e.started_at or 0) < cutoff
            ]
            for eid in old_ids:
                del self._executions[eid]
                count += 1

        return count


# Singleton instance
saga_orchestrator = SagaOrchestrator()


# Convenience functions
def saga(name: str) -> Saga:
    """Create new saga."""
    return Saga(name)


async def start_saga(
    saga_name: str,
    initial_data: Optional[Dict[str, Any]] = None,
) -> SagaExecution:
    """Start saga on global orchestrator."""
    return await saga_orchestrator.start(saga_name, initial_data)
