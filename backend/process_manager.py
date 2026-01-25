"""
Process Manager - Sprint 693

Long-running process coordination.

Features:
- Process lifecycle management
- State tracking
- Timeout handling
- Retry logic
- Event notifications
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Set
)
from enum import Enum
import threading
from abc import ABC, abstractmethod


class ProcessState(str, Enum):
    """Process execution state."""
    CREATED = "created"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"


class ProcessPriority(str, Enum):
    """Process priority levels."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ProcessStep:
    """Individual step in a process."""
    name: str
    action: Callable[["ProcessContext"], Awaitable[Any]]
    on_error: Optional[Callable[["ProcessContext", Exception], Awaitable[None]]] = None
    timeout: Optional[float] = None
    retries: int = 0
    state: str = "pending"
    result: Optional[Any] = None
    error: Optional[str] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None


@dataclass
class ProcessContext:
    """Context passed through process execution."""
    process_id: str
    data: Dict[str, Any] = field(default_factory=dict)
    step_results: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    cancelled: bool = False

    def set(self, key: str, value: Any):
        """Set context data."""
        self.data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        """Get context data."""
        return self.data.get(key, default)

    def get_step_result(self, step_name: str) -> Any:
        """Get result from a previous step."""
        return self.step_results.get(step_name)


@dataclass
class Process:
    """Process definition."""
    id: str
    name: str
    steps: List[ProcessStep] = field(default_factory=list)
    state: ProcessState = ProcessState.CREATED
    priority: ProcessPriority = ProcessPriority.NORMAL
    context: Optional[ProcessContext] = None
    current_step: int = 0
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    error: Optional[str] = None
    timeout: Optional[float] = None
    tags: Set[str] = field(default_factory=set)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "state": self.state.value,
            "priority": self.priority.value,
            "current_step": self.current_step,
            "total_steps": len(self.steps),
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "error": self.error,
            "tags": list(self.tags),
        }


class ProcessBuilder:
    """Builder for creating processes.

    Usage:
        process = (
            ProcessBuilder("data-pipeline")
            .step("extract", extract_data)
            .step("transform", transform_data, retries=2)
            .step("load", load_data, timeout=60)
            .with_priority(ProcessPriority.HIGH)
            .with_timeout(300)
            .build()
        )
    """

    def __init__(self, name: str):
        """Initialize builder."""
        self._name = name
        self._steps: List[ProcessStep] = []
        self._priority = ProcessPriority.NORMAL
        self._timeout: Optional[float] = None
        self._tags: Set[str] = set()
        self._initial_data: Dict[str, Any] = {}

    def step(
        self,
        name: str,
        action: Callable[[ProcessContext], Awaitable[Any]],
        on_error: Optional[Callable[[ProcessContext, Exception], Awaitable[None]]] = None,
        timeout: Optional[float] = None,
        retries: int = 0,
    ) -> "ProcessBuilder":
        """Add step to process."""
        step = ProcessStep(
            name=name,
            action=action,
            on_error=on_error,
            timeout=timeout,
            retries=retries,
        )
        self._steps.append(step)
        return self

    def with_priority(self, priority: ProcessPriority) -> "ProcessBuilder":
        """Set process priority."""
        self._priority = priority
        return self

    def with_timeout(self, timeout: float) -> "ProcessBuilder":
        """Set process timeout."""
        self._timeout = timeout
        return self

    def with_tags(self, *tags: str) -> "ProcessBuilder":
        """Add tags to process."""
        self._tags.update(tags)
        return self

    def with_data(self, **data: Any) -> "ProcessBuilder":
        """Set initial context data."""
        self._initial_data.update(data)
        return self

    def build(self) -> Process:
        """Build the process."""
        process_id = str(uuid.uuid4())
        return Process(
            id=process_id,
            name=self._name,
            steps=self._steps,
            priority=self._priority,
            timeout=self._timeout,
            tags=self._tags,
            context=ProcessContext(
                process_id=process_id,
                data=self._initial_data.copy(),
            ),
        )


class ProcessExecutor:
    """Executes processes with lifecycle management.

    Usage:
        executor = ProcessExecutor()

        # Register event handlers
        executor.on_start(lambda p: print(f"Starting: {p.name}"))
        executor.on_complete(lambda p: print(f"Completed: {p.name}"))

        # Run process
        result = await executor.run(process)
    """

    def __init__(self, max_concurrent: int = 10):
        """Initialize executor."""
        self._max_concurrent = max_concurrent
        self._running: Dict[str, asyncio.Task] = {}
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._on_start_handlers: List[Callable[[Process], Awaitable[None]]] = []
        self._on_complete_handlers: List[Callable[[Process], Awaitable[None]]] = []
        self._on_error_handlers: List[Callable[[Process, Exception], Awaitable[None]]] = []
        self._on_step_handlers: List[Callable[[Process, ProcessStep], Awaitable[None]]] = []
        self._lock = threading.Lock()
        self._stats = {
            "total_executed": 0,
            "completed": 0,
            "failed": 0,
            "cancelled": 0,
            "timeout": 0,
        }

    def on_start(
        self,
        handler: Callable[[Process], Awaitable[None]],
    ) -> "ProcessExecutor":
        """Register start handler."""
        self._on_start_handlers.append(handler)
        return self

    def on_complete(
        self,
        handler: Callable[[Process], Awaitable[None]],
    ) -> "ProcessExecutor":
        """Register completion handler."""
        self._on_complete_handlers.append(handler)
        return self

    def on_error(
        self,
        handler: Callable[[Process, Exception], Awaitable[None]],
    ) -> "ProcessExecutor":
        """Register error handler."""
        self._on_error_handlers.append(handler)
        return self

    def on_step(
        self,
        handler: Callable[[Process, ProcessStep], Awaitable[None]],
    ) -> "ProcessExecutor":
        """Register step handler."""
        self._on_step_handlers.append(handler)
        return self

    async def run(self, process: Process) -> Process:
        """Run process to completion."""
        async with self._semaphore:
            return await self._execute(process)

    async def _execute(self, process: Process) -> Process:
        """Execute process steps."""
        self._stats["total_executed"] += 1
        process.state = ProcessState.RUNNING
        process.started_at = time.time()

        # Notify start handlers
        for handler in self._on_start_handlers:
            try:
                await handler(process)
            except Exception:
                pass

        try:
            # Apply process timeout if set
            if process.timeout:
                result = await asyncio.wait_for(
                    self._run_steps(process),
                    timeout=process.timeout,
                )
            else:
                result = await self._run_steps(process)

            process.state = ProcessState.COMPLETED
            self._stats["completed"] += 1

            # Notify completion handlers
            for handler in self._on_complete_handlers:
                try:
                    await handler(process)
                except Exception:
                    pass

        except asyncio.TimeoutError:
            process.state = ProcessState.TIMEOUT
            process.error = "Process timed out"
            self._stats["timeout"] += 1

        except asyncio.CancelledError:
            process.state = ProcessState.CANCELLED
            self._stats["cancelled"] += 1

        except Exception as e:
            process.state = ProcessState.FAILED
            process.error = str(e)
            self._stats["failed"] += 1

            # Notify error handlers
            for handler in self._on_error_handlers:
                try:
                    await handler(process, e)
                except Exception:
                    pass

        finally:
            process.completed_at = time.time()

        return process

    async def _run_steps(self, process: Process):
        """Run all process steps."""
        for i, step in enumerate(process.steps):
            if process.context and process.context.cancelled:
                raise asyncio.CancelledError("Process cancelled")

            process.current_step = i
            await self._run_step(process, step)

    async def _run_step(self, process: Process, step: ProcessStep):
        """Run a single step with retry logic."""
        step.state = "running"
        step.started_at = time.time()

        # Notify step handlers
        for handler in self._on_step_handlers:
            try:
                await handler(process, step)
            except Exception:
                pass

        last_error: Optional[Exception] = None

        for attempt in range(step.retries + 1):
            try:
                if step.timeout:
                    result = await asyncio.wait_for(
                        step.action(process.context),
                        timeout=step.timeout,
                    )
                else:
                    result = await step.action(process.context)

                step.result = result
                step.state = "completed"
                step.completed_at = time.time()

                if process.context:
                    process.context.step_results[step.name] = result

                return

            except Exception as e:
                last_error = e
                if step.on_error:
                    try:
                        await step.on_error(process.context, e)
                    except Exception:
                        pass

                if attempt < step.retries:
                    await asyncio.sleep(1 * (attempt + 1))

        step.state = "failed"
        step.error = str(last_error) if last_error else "Unknown error"
        step.completed_at = time.time()
        raise last_error or Exception("Step failed")

    def get_stats(self) -> dict:
        """Get executor statistics."""
        return {
            **self._stats,
            "running_count": len(self._running),
            "max_concurrent": self._max_concurrent,
        }


class ProcessManager:
    """Central manager for all processes.

    Usage:
        manager = ProcessManager()

        # Create and run process
        process = manager.create("my-process")
        process.step("step1", action1).step("step2", action2)
        result = await manager.run(process.build())

        # Query processes
        running = manager.get_running()
        by_tag = manager.get_by_tag("etl")
    """

    def __init__(self, max_concurrent: int = 10):
        """Initialize manager."""
        self._executor = ProcessExecutor(max_concurrent)
        self._processes: Dict[str, Process] = {}
        self._lock = threading.Lock()

    def create(self, name: str) -> ProcessBuilder:
        """Create a new process builder."""
        return ProcessBuilder(name)

    async def run(self, process: Process) -> Process:
        """Run a process."""
        with self._lock:
            self._processes[process.id] = process

        result = await self._executor.run(process)
        return result

    async def run_all(
        self,
        processes: List[Process],
        parallel: bool = True,
    ) -> List[Process]:
        """Run multiple processes."""
        if parallel:
            tasks = [self.run(p) for p in processes]
            return await asyncio.gather(*tasks)
        else:
            results = []
            for p in processes:
                results.append(await self.run(p))
            return results

    def cancel(self, process_id: str) -> bool:
        """Cancel a running process."""
        process = self._processes.get(process_id)
        if process and process.context:
            process.context.cancelled = True
            return True
        return False

    def get(self, process_id: str) -> Optional[Process]:
        """Get process by ID."""
        return self._processes.get(process_id)

    def get_all(
        self,
        state: Optional[ProcessState] = None,
        limit: int = 100,
    ) -> List[Process]:
        """Get all processes with optional filter."""
        processes = list(self._processes.values())

        if state:
            processes = [p for p in processes if p.state == state]

        processes.sort(key=lambda p: p.created_at, reverse=True)
        return processes[:limit]

    def get_running(self) -> List[Process]:
        """Get running processes."""
        return self.get_all(ProcessState.RUNNING)

    def get_by_tag(self, tag: str) -> List[Process]:
        """Get processes by tag."""
        return [p for p in self._processes.values() if tag in p.tags]

    def get_by_name(self, name: str) -> List[Process]:
        """Get processes by name."""
        return [p for p in self._processes.values() if p.name == name]

    def on_start(
        self,
        handler: Callable[[Process], Awaitable[None]],
    ) -> "ProcessManager":
        """Register start handler."""
        self._executor.on_start(handler)
        return self

    def on_complete(
        self,
        handler: Callable[[Process], Awaitable[None]],
    ) -> "ProcessManager":
        """Register completion handler."""
        self._executor.on_complete(handler)
        return self

    def on_error(
        self,
        handler: Callable[[Process, Exception], Awaitable[None]],
    ) -> "ProcessManager":
        """Register error handler."""
        self._executor.on_error(handler)
        return self

    def cleanup(self, max_age_hours: int = 24) -> int:
        """Remove old completed processes."""
        cutoff = time.time() - (max_age_hours * 3600)
        count = 0

        with self._lock:
            to_remove = [
                pid for pid, p in self._processes.items()
                if p.state in (ProcessState.COMPLETED, ProcessState.FAILED, ProcessState.CANCELLED)
                and (p.completed_at or p.created_at) < cutoff
            ]
            for pid in to_remove:
                del self._processes[pid]
                count += 1

        return count

    def get_stats(self) -> dict:
        """Get manager statistics."""
        by_state = {}
        for p in self._processes.values():
            by_state[p.state.value] = by_state.get(p.state.value, 0) + 1

        return {
            "total_processes": len(self._processes),
            "by_state": by_state,
            "executor": self._executor.get_stats(),
        }


# Singleton instance
process_manager = ProcessManager()


# Convenience functions
def create_process(name: str) -> ProcessBuilder:
    """Create a process using the global manager."""
    return process_manager.create(name)


async def run_process(process: Process) -> Process:
    """Run a process using the global manager."""
    return await process_manager.run(process)
