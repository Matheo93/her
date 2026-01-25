"""
Background Task Manager - Sprint 613

Manage background jobs and async operations.

Features:
- Task scheduling
- Progress tracking
- Cancellation
- Retry logic
- Task dependencies
"""

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, Callable, Any, List, Set
from enum import Enum
from threading import Lock
import traceback


class TaskStatus(str, Enum):
    """Task status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class TaskPriority(int, Enum):
    """Task priority levels."""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


@dataclass
class TaskResult:
    """Result of a task execution."""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: float = 0.0


@dataclass
class BackgroundTask:
    """A background task."""
    id: str
    name: str
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.NORMAL
    progress: float = 0.0  # 0-100
    progress_message: str = ""
    result: Optional[TaskResult] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    retry_count: int = 0
    max_retries: int = 3
    dependencies: Set[str] = field(default_factory=set)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status.value,
            "priority": self.priority.value,
            "progress": self.progress,
            "progress_message": self.progress_message,
            "result": {
                "success": self.result.success,
                "data": self.result.data,
                "error": self.result.error,
                "duration_ms": self.result.duration_ms,
            } if self.result else None,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "retry_count": self.retry_count,
            "max_retries": self.max_retries,
            "dependencies": list(self.dependencies),
            "metadata": self.metadata,
        }


class TaskManager:
    """Manage background tasks.

    Usage:
        manager = TaskManager()

        # Register a task handler
        @manager.register("process_audio")
        async def process_audio(ctx: TaskContext):
            ctx.update_progress(50, "Processing...")
            return {"output": "done"}

        # Submit a task
        task_id = await manager.submit("process_audio", priority=TaskPriority.HIGH)

        # Check status
        status = manager.get_task(task_id)
    """

    def __init__(self, max_concurrent: int = 5):
        """Initialize task manager.

        Args:
            max_concurrent: Maximum concurrent tasks
        """
        self._tasks: Dict[str, BackgroundTask] = {}
        self._handlers: Dict[str, Callable] = {}
        self._lock = Lock()
        self._max_concurrent = max_concurrent
        self._running_count = 0
        self._queue: asyncio.Queue = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None

    def register(self, name: str):
        """Register a task handler.

        Args:
            name: Task name

        Returns:
            Decorator function
        """
        def decorator(func: Callable):
            self._handlers[name] = func
            return func
        return decorator

    async def start(self):
        """Start the task worker."""
        if self._worker_task is None:
            self._worker_task = asyncio.create_task(self._worker())

    async def stop(self):
        """Stop the task worker."""
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None

    async def submit(
        self,
        name: str,
        priority: TaskPriority = TaskPriority.NORMAL,
        dependencies: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        max_retries: int = 3
    ) -> str:
        """Submit a new task.

        Args:
            name: Task handler name
            priority: Task priority
            dependencies: Task IDs that must complete first
            metadata: Task metadata (passed to handler)
            max_retries: Maximum retry attempts

        Returns:
            Task ID
        """
        if name not in self._handlers:
            raise ValueError(f"Unknown task handler: {name}")

        task_id = str(uuid.uuid4())[:8]
        task = BackgroundTask(
            id=task_id,
            name=name,
            priority=priority,
            dependencies=set(dependencies or []),
            metadata=metadata or {},
            max_retries=max_retries,
        )

        with self._lock:
            self._tasks[task_id] = task

        # Add to queue with priority (negative for max-heap behavior)
        await self._queue.put((-priority.value, time.time(), task_id))

        return task_id

    async def _worker(self):
        """Background worker that processes tasks."""
        while True:
            try:
                # Get next task from queue
                _, _, task_id = await self._queue.get()

                with self._lock:
                    task = self._tasks.get(task_id)
                    if not task or task.status == TaskStatus.CANCELLED:
                        continue

                # Check dependencies
                deps_met = True
                for dep_id in task.dependencies:
                    dep_task = self._tasks.get(dep_id)
                    if not dep_task or dep_task.status != TaskStatus.COMPLETED:
                        deps_met = False
                        break

                if not deps_met:
                    # Re-queue with delay
                    await asyncio.sleep(0.1)
                    await self._queue.put((-task.priority.value, time.time(), task_id))
                    continue

                # Wait if at max concurrent
                while self._running_count >= self._max_concurrent:
                    await asyncio.sleep(0.1)

                # Execute task
                self._running_count += 1
                asyncio.create_task(self._execute_task(task))

            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Worker error: {e}")

    async def _execute_task(self, task: BackgroundTask):
        """Execute a single task.

        Args:
            task: Task to execute
        """
        try:
            task.status = TaskStatus.RUNNING
            task.started_at = time.time()

            handler = self._handlers[task.name]
            ctx = TaskContext(task)

            start_time = time.time()
            result_data = await handler(ctx)
            duration_ms = (time.time() - start_time) * 1000

            task.result = TaskResult(
                success=True,
                data=result_data,
                duration_ms=duration_ms,
            )
            task.status = TaskStatus.COMPLETED
            task.progress = 100.0
            task.completed_at = time.time()

        except asyncio.CancelledError:
            task.status = TaskStatus.CANCELLED
            task.completed_at = time.time()

        except Exception as e:
            error_msg = str(e)
            tb = traceback.format_exc()

            # Retry logic
            if task.retry_count < task.max_retries:
                task.retry_count += 1
                task.status = TaskStatus.RETRYING
                # Re-queue
                await self._queue.put((-task.priority.value, time.time(), task.id))
            else:
                task.result = TaskResult(
                    success=False,
                    error=f"{error_msg}\n{tb}",
                    duration_ms=(time.time() - (task.started_at or time.time())) * 1000,
                )
                task.status = TaskStatus.FAILED
                task.completed_at = time.time()

        finally:
            self._running_count -= 1

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task status.

        Args:
            task_id: Task ID

        Returns:
            Task details or None
        """
        with self._lock:
            task = self._tasks.get(task_id)
            return task.to_dict() if task else None

    def get_all_tasks(
        self,
        status: Optional[TaskStatus] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get all tasks.

        Args:
            status: Filter by status
            limit: Maximum tasks to return

        Returns:
            List of tasks
        """
        with self._lock:
            tasks = list(self._tasks.values())

        if status:
            tasks = [t for t in tasks if t.status == status]

        # Sort by created_at descending
        tasks.sort(key=lambda t: t.created_at, reverse=True)

        return [t.to_dict() for t in tasks[:limit]]

    async def cancel_task(self, task_id: str) -> bool:
        """Cancel a task.

        Args:
            task_id: Task ID

        Returns:
            True if cancelled
        """
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False

            if task.status in (TaskStatus.PENDING, TaskStatus.RETRYING):
                task.status = TaskStatus.CANCELLED
                task.completed_at = time.time()
                return True

        return False

    def clear_completed(self, older_than_seconds: float = 3600) -> int:
        """Clear completed tasks older than threshold.

        Args:
            older_than_seconds: Age threshold

        Returns:
            Number of tasks cleared
        """
        cutoff = time.time() - older_than_seconds
        cleared = 0

        with self._lock:
            to_remove = []
            for task_id, task in self._tasks.items():
                if task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
                    if task.completed_at and task.completed_at < cutoff:
                        to_remove.append(task_id)

            for task_id in to_remove:
                del self._tasks[task_id]
                cleared += 1

        return cleared

    def get_stats(self) -> Dict[str, Any]:
        """Get task statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            tasks = list(self._tasks.values())

        status_counts = {}
        for status in TaskStatus:
            status_counts[status.value] = len([t for t in tasks if t.status == status])

        total_duration = sum(
            t.result.duration_ms for t in tasks
            if t.result and t.result.success
        )
        completed_count = status_counts.get("completed", 0)
        avg_duration = total_duration / completed_count if completed_count > 0 else 0

        return {
            "total_tasks": len(tasks),
            "status_counts": status_counts,
            "running_count": self._running_count,
            "max_concurrent": self._max_concurrent,
            "average_duration_ms": avg_duration,
            "registered_handlers": list(self._handlers.keys()),
        }


class TaskContext:
    """Context passed to task handlers."""

    def __init__(self, task: BackgroundTask):
        """Initialize context.

        Args:
            task: The task being executed
        """
        self._task = task

    @property
    def task_id(self) -> str:
        """Get task ID."""
        return self._task.id

    @property
    def metadata(self) -> Dict[str, Any]:
        """Get task metadata."""
        return self._task.metadata

    def update_progress(self, progress: float, message: str = ""):
        """Update task progress.

        Args:
            progress: Progress percentage (0-100)
            message: Progress message
        """
        self._task.progress = max(0, min(100, progress))
        self._task.progress_message = message

    def is_cancelled(self) -> bool:
        """Check if task was cancelled."""
        return self._task.status == TaskStatus.CANCELLED


# Singleton instance
task_manager = TaskManager()


# Register built-in tasks
@task_manager.register("echo")
async def echo_task(ctx: TaskContext):
    """Simple echo task for testing."""
    ctx.update_progress(50, "Processing...")
    await asyncio.sleep(0.1)
    ctx.update_progress(100, "Done")
    return {"echo": ctx.metadata.get("message", "Hello")}


@task_manager.register("delay")
async def delay_task(ctx: TaskContext):
    """Delayed task for testing."""
    delay = ctx.metadata.get("delay", 1.0)
    steps = 10
    for i in range(steps):
        if ctx.is_cancelled():
            return {"cancelled": True}
        ctx.update_progress((i + 1) * 10, f"Step {i + 1}/{steps}")
        await asyncio.sleep(delay / steps)
    return {"completed": True, "delay": delay}
