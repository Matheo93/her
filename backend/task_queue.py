"""
Task Queue - Sprint 663

In-memory async task queue.

Features:
- Priority queues
- Task scheduling
- Worker pool
- Retry logic
- Task status tracking
"""

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Any, Callable, Awaitable, Optional
from enum import Enum
from heapq import heappush, heappop
import threading


class TaskStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskPriority(int, Enum):
    """Task priority levels."""
    LOW = 0
    NORMAL = 50
    HIGH = 75
    CRITICAL = 100


@dataclass
class Task:
    """Task definition."""
    id: str
    name: str
    func: Callable[..., Awaitable[Any]]
    args: tuple = field(default_factory=tuple)
    kwargs: dict = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    result: Any = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    retries: int = 0
    max_retries: int = 3
    schedule_at: Optional[float] = None

    def __lt__(self, other: "Task") -> bool:
        """Compare by priority for heap."""
        return self.priority > other.priority


@dataclass
class TaskResult:
    """Task execution result."""
    task_id: str
    status: TaskStatus
    result: Any = None
    error: Optional[str] = None
    duration: float = 0


class TaskQueue:
    """Async task queue with workers.

    Usage:
        queue = TaskQueue(workers=4)
        await queue.start()

        # Add tasks
        task_id = await queue.add(my_async_func, args=(1, 2), priority=TaskPriority.HIGH)

        # Wait for result
        result = await queue.wait(task_id)

        # Schedule task
        await queue.schedule(my_func, delay=60)

        await queue.stop()
    """

    def __init__(self, workers: int = 4):
        """Initialize task queue.

        Args:
            workers: Number of concurrent workers
        """
        self._workers = workers
        self._queue: List[Task] = []
        self._tasks: Dict[str, Task] = {}
        self._lock = threading.Lock()
        self._running = False
        self._worker_tasks: List[asyncio.Task] = []
        self._condition = asyncio.Condition()
        self._stats = {
            "total_tasks": 0,
            "completed_tasks": 0,
            "failed_tasks": 0,
            "cancelled_tasks": 0,
        }

    async def start(self):
        """Start the queue workers."""
        if self._running:
            return

        self._running = True
        for i in range(self._workers):
            task = asyncio.create_task(self._worker(i))
            self._worker_tasks.append(task)

    async def stop(self, wait: bool = True):
        """Stop the queue.

        Args:
            wait: Wait for pending tasks to complete
        """
        self._running = False

        if wait:
            async with self._condition:
                self._condition.notify_all()

            for task in self._worker_tasks:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

        self._worker_tasks.clear()

    async def add(
        self,
        func: Callable[..., Awaitable[Any]],
        args: tuple = (),
        kwargs: Optional[dict] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        max_retries: int = 3,
        name: Optional[str] = None,
    ) -> str:
        """Add task to queue.

        Args:
            func: Async function to execute
            args: Positional arguments
            kwargs: Keyword arguments
            priority: Task priority
            max_retries: Max retry attempts
            name: Task name for tracking

        Returns:
            Task ID
        """
        task_id = str(uuid.uuid4())[:8]
        task = Task(
            id=task_id,
            name=name or func.__name__,
            func=func,
            args=args,
            kwargs=kwargs or {},
            priority=priority,
            max_retries=max_retries,
        )

        with self._lock:
            self._tasks[task_id] = task
            heappush(self._queue, task)
            self._stats["total_tasks"] += 1

        async with self._condition:
            self._condition.notify()

        return task_id

    async def schedule(
        self,
        func: Callable[..., Awaitable[Any]],
        delay: float,
        args: tuple = (),
        kwargs: Optional[dict] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
    ) -> str:
        """Schedule task for later.

        Args:
            func: Async function
            delay: Delay in seconds
            args: Positional arguments
            kwargs: Keyword arguments
            priority: Task priority

        Returns:
            Task ID
        """
        task_id = str(uuid.uuid4())[:8]
        task = Task(
            id=task_id,
            name=func.__name__,
            func=func,
            args=args,
            kwargs=kwargs or {},
            priority=priority,
            status=TaskStatus.SCHEDULED,
            schedule_at=time.time() + delay,
        )

        with self._lock:
            self._tasks[task_id] = task
            self._stats["total_tasks"] += 1

        # Start scheduler coroutine
        asyncio.create_task(self._schedule_task(task))

        return task_id

    async def _schedule_task(self, task: Task):
        """Wait and enqueue scheduled task."""
        if task.schedule_at:
            delay = task.schedule_at - time.time()
            if delay > 0:
                await asyncio.sleep(delay)

        task.status = TaskStatus.PENDING

        with self._lock:
            heappush(self._queue, task)

        async with self._condition:
            self._condition.notify()

    async def wait(self, task_id: str, timeout: Optional[float] = None) -> TaskResult:
        """Wait for task completion.

        Args:
            task_id: Task ID
            timeout: Maximum wait time

        Returns:
            Task result
        """
        start_time = time.time()

        while True:
            task = self._tasks.get(task_id)
            if not task:
                return TaskResult(task_id=task_id, status=TaskStatus.FAILED, error="Task not found")

            if task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
                return TaskResult(
                    task_id=task_id,
                    status=task.status,
                    result=task.result,
                    error=task.error,
                    duration=(task.completed_at or 0) - (task.started_at or 0),
                )

            if timeout and (time.time() - start_time) > timeout:
                return TaskResult(task_id=task_id, status=TaskStatus.PENDING, error="Timeout")

            await asyncio.sleep(0.1)

    def cancel(self, task_id: str) -> bool:
        """Cancel a pending task.

        Args:
            task_id: Task ID

        Returns:
            True if cancelled
        """
        task = self._tasks.get(task_id)
        if not task:
            return False

        if task.status in (TaskStatus.PENDING, TaskStatus.SCHEDULED):
            task.status = TaskStatus.CANCELLED
            self._stats["cancelled_tasks"] += 1
            return True

        return False

    def get_task(self, task_id: str) -> Optional[Task]:
        """Get task by ID."""
        return self._tasks.get(task_id)

    def get_status(self, task_id: str) -> Optional[TaskStatus]:
        """Get task status."""
        task = self._tasks.get(task_id)
        return task.status if task else None

    async def _worker(self, worker_id: int):
        """Worker coroutine."""
        while self._running:
            task = None

            # Get next task
            with self._lock:
                while self._queue:
                    candidate = heappop(self._queue)
                    if candidate.status == TaskStatus.PENDING:
                        task = candidate
                        break

            if not task:
                async with self._condition:
                    await asyncio.wait_for(
                        self._condition.wait(),
                        timeout=1.0,
                    )
                continue

            # Execute task
            task.status = TaskStatus.RUNNING
            task.started_at = time.time()

            try:
                result = await task.func(*task.args, **task.kwargs)
                task.result = result
                task.status = TaskStatus.COMPLETED
                task.completed_at = time.time()
                self._stats["completed_tasks"] += 1

            except Exception as e:
                task.error = str(e)
                task.retries += 1

                if task.retries < task.max_retries:
                    # Retry
                    task.status = TaskStatus.PENDING
                    with self._lock:
                        heappush(self._queue, task)
                else:
                    task.status = TaskStatus.FAILED
                    task.completed_at = time.time()
                    self._stats["failed_tasks"] += 1

    def get_stats(self) -> dict:
        """Get queue statistics."""
        pending = sum(1 for t in self._tasks.values() if t.status == TaskStatus.PENDING)
        running = sum(1 for t in self._tasks.values() if t.status == TaskStatus.RUNNING)

        return {
            **self._stats,
            "pending_tasks": pending,
            "running_tasks": running,
            "queue_size": len(self._queue),
            "workers": self._workers,
            "running": self._running,
        }

    def clear_completed(self):
        """Clear completed tasks from memory."""
        with self._lock:
            completed_ids = [
                tid for tid, task in self._tasks.items()
                if task.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED)
            ]
            for tid in completed_ids:
                del self._tasks[tid]


# Singleton instance
task_queue = TaskQueue()
