"""
Task Scheduler - Sprint 795

Task scheduling and background job management.

Features:
- Cron-like scheduling
- One-time tasks
- Recurring tasks
- Task priorities
- Task dependencies
- Concurrency control
"""

import asyncio
import time
import heapq
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union,
    Awaitable, Set
)
from enum import Enum
from abc import ABC, abstractmethod
import logging
import threading
from datetime import datetime, timedelta
from functools import total_ordering
import re

logger = logging.getLogger(__name__)


T = TypeVar("T")


class TaskStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class TaskPriority(int, Enum):
    """Task priority levels."""
    CRITICAL = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3
    BACKGROUND = 4


@total_ordering
@dataclass
class ScheduledTask:
    """A scheduled task with execution details."""
    id: str
    name: str
    func: Callable[..., Awaitable[Any]]
    args: tuple = field(default_factory=tuple)
    kwargs: Dict[str, Any] = field(default_factory=dict)
    scheduled_at: float = 0.0
    priority: TaskPriority = TaskPriority.NORMAL
    status: TaskStatus = TaskStatus.PENDING
    result: Any = None
    error: Optional[str] = None
    retries: int = 0
    max_retries: int = 3
    retry_delay: float = 1.0
    timeout: Optional[float] = None
    cron: Optional[str] = None
    interval: Optional[float] = None
    dependencies: Set[str] = field(default_factory=set)
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __lt__(self, other: "ScheduledTask") -> bool:
        # Lower scheduled_at comes first, then lower priority value
        if self.scheduled_at != other.scheduled_at:
            return self.scheduled_at < other.scheduled_at
        return self.priority.value < other.priority.value

    def __eq__(self, other: object) -> bool:
        if isinstance(other, ScheduledTask):
            return self.id == other.id
        return False

    def __hash__(self) -> int:
        return hash(self.id)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status.value,
            "priority": self.priority.name,
            "scheduled_at": self.scheduled_at,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "retries": self.retries,
            "error": self.error,
        }


class CronParser:
    """Parse cron expressions."""

    FIELDS = ["minute", "hour", "day", "month", "weekday"]

    @classmethod
    def parse(cls, expression: str) -> Dict[str, List[int]]:
        """Parse cron expression to field values.

        Format: minute hour day month weekday
        Examples:
            "* * * * *" - Every minute
            "0 * * * *" - Every hour
            "0 0 * * *" - Every day at midnight
            "0 0 * * 0" - Every Sunday at midnight
            "*/15 * * * *" - Every 15 minutes
        """
        parts = expression.strip().split()
        if len(parts) != 5:
            raise ValueError("Cron expression must have 5 fields")

        ranges = [
            (0, 59),   # minute
            (0, 23),   # hour
            (1, 31),   # day
            (1, 12),   # month
            (0, 6),    # weekday (0 = Sunday)
        ]

        result = {}
        for i, (part, (min_val, max_val)) in enumerate(zip(parts, ranges)):
            result[cls.FIELDS[i]] = cls._parse_field(part, min_val, max_val)

        return result

    @classmethod
    def _parse_field(cls, field: str, min_val: int, max_val: int) -> List[int]:
        """Parse a single cron field."""
        values: Set[int] = set()

        for part in field.split(","):
            if part == "*":
                values.update(range(min_val, max_val + 1))
            elif "/" in part:
                base, step = part.split("/")
                step_val = int(step)
                if base == "*":
                    start = min_val
                else:
                    start = int(base)
                values.update(range(start, max_val + 1, step_val))
            elif "-" in part:
                start, end = part.split("-")
                values.update(range(int(start), int(end) + 1))
            else:
                values.add(int(part))

        return sorted(v for v in values if min_val <= v <= max_val)

    @classmethod
    def next_run(cls, expression: str, after: Optional[datetime] = None) -> datetime:
        """Calculate next run time for cron expression."""
        parsed = cls.parse(expression)
        now = after or datetime.now()

        # Start from next minute
        current = now.replace(second=0, microsecond=0) + timedelta(minutes=1)

        for _ in range(366 * 24 * 60):  # Max search: 1 year
            if (
                current.minute in parsed["minute"]
                and current.hour in parsed["hour"]
                and current.day in parsed["day"]
                and current.month in parsed["month"]
                and current.weekday() in parsed["weekday"]
            ):
                return current
            current += timedelta(minutes=1)

        raise ValueError("Could not find next run time for cron: " + expression)


class TaskScheduler:
    """Task scheduler with priority queue and cron support.

    Usage:
        scheduler = TaskScheduler()

        # One-time task
        await scheduler.schedule(
            "task_1",
            my_async_func,
            args=(1, 2),
            delay=5.0,  # Run after 5 seconds
        )

        # Recurring task with interval
        await scheduler.schedule(
            "heartbeat",
            heartbeat_func,
            interval=60.0,  # Every 60 seconds
        )

        # Cron task
        await scheduler.schedule(
            "daily_report",
            generate_report,
            cron="0 9 * * *",  # Every day at 9 AM
        )

        # Start the scheduler
        await scheduler.start()
    """

    def __init__(
        self,
        max_concurrent: int = 10,
        default_timeout: float = 300.0,
    ):
        self._queue: List[ScheduledTask] = []
        self._tasks: Dict[str, ScheduledTask] = {}
        self._lock = threading.RLock()
        self._running = False
        self._max_concurrent = max_concurrent
        self._default_timeout = default_timeout
        self._semaphore: Optional[asyncio.Semaphore] = None
        self._task_counter = 0
        self._completed_tasks: Dict[str, ScheduledTask] = {}
        self._listeners: List[Callable[[ScheduledTask, str], Awaitable[None]]] = []

    def _generate_id(self) -> str:
        """Generate unique task ID."""
        self._task_counter += 1
        return "task_" + str(self._task_counter) + "_" + str(int(time.time() * 1000))

    async def schedule(
        self,
        name: str,
        func: Callable[..., Awaitable[Any]],
        args: tuple = (),
        kwargs: Optional[Dict[str, Any]] = None,
        delay: float = 0.0,
        at: Optional[float] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        timeout: Optional[float] = None,
        cron: Optional[str] = None,
        interval: Optional[float] = None,
        dependencies: Optional[List[str]] = None,
        task_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Schedule a task for execution."""
        with self._lock:
            task_id = task_id or self._generate_id()

            # Calculate scheduled time
            if at is not None:
                scheduled_at = at
            elif cron:
                next_run = CronParser.next_run(cron)
                scheduled_at = next_run.timestamp()
            else:
                scheduled_at = time.time() + delay

            task = ScheduledTask(
                id=task_id,
                name=name,
                func=func,
                args=args,
                kwargs=kwargs or {},
                scheduled_at=scheduled_at,
                priority=priority,
                status=TaskStatus.SCHEDULED,
                max_retries=max_retries,
                retry_delay=retry_delay,
                timeout=timeout or self._default_timeout,
                cron=cron,
                interval=interval,
                dependencies=set(dependencies or []),
                metadata=metadata or {},
            )

            self._tasks[task_id] = task
            heapq.heappush(self._queue, task)

            logger.debug("Scheduled task: " + name + " (id=" + task_id + ")")
            return task_id

    async def cancel(self, task_id: str) -> bool:
        """Cancel a scheduled task."""
        with self._lock:
            if task_id in self._tasks:
                task = self._tasks[task_id]
                if task.status in (TaskStatus.PENDING, TaskStatus.SCHEDULED):
                    task.status = TaskStatus.CANCELLED
                    await self._notify_listeners(task, "cancelled")
                    return True
            return False

    def get_task(self, task_id: str) -> Optional[ScheduledTask]:
        """Get task by ID."""
        return self._tasks.get(task_id) or self._completed_tasks.get(task_id)

    def get_pending_tasks(self) -> List[ScheduledTask]:
        """Get all pending/scheduled tasks."""
        with self._lock:
            return [
                t for t in self._tasks.values()
                if t.status in (TaskStatus.PENDING, TaskStatus.SCHEDULED)
            ]

    def get_running_tasks(self) -> List[ScheduledTask]:
        """Get all currently running tasks."""
        with self._lock:
            return [t for t in self._tasks.values() if t.status == TaskStatus.RUNNING]

    async def start(self) -> None:
        """Start the scheduler."""
        if self._running:
            return

        self._running = True
        self._semaphore = asyncio.Semaphore(self._max_concurrent)
        logger.info("Task scheduler started")

        while self._running:
            await self._process_queue()
            await asyncio.sleep(0.1)  # Small delay between checks

    async def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False
        logger.info("Task scheduler stopped")

    async def _process_queue(self) -> None:
        """Process due tasks from the queue."""
        now = time.time()
        tasks_to_run: List[ScheduledTask] = []

        with self._lock:
            while self._queue:
                # Peek at the next task
                if self._queue[0].scheduled_at > now:
                    break

                task = heapq.heappop(self._queue)

                # Skip cancelled tasks
                if task.status == TaskStatus.CANCELLED:
                    continue

                # Check dependencies
                if not self._dependencies_met(task):
                    # Re-schedule for later
                    task.scheduled_at = now + 1.0
                    heapq.heappush(self._queue, task)
                    continue

                tasks_to_run.append(task)

        # Run tasks concurrently
        if tasks_to_run:
            await asyncio.gather(
                *[self._run_task(task) for task in tasks_to_run],
                return_exceptions=True,
            )

    def _dependencies_met(self, task: ScheduledTask) -> bool:
        """Check if all dependencies are completed."""
        for dep_id in task.dependencies:
            dep_task = self._completed_tasks.get(dep_id)
            if not dep_task or dep_task.status != TaskStatus.COMPLETED:
                return False
        return True

    async def _run_task(self, task: ScheduledTask) -> None:
        """Execute a single task."""
        if not self._semaphore:
            return

        async with self._semaphore:
            task.status = TaskStatus.RUNNING
            task.started_at = time.time()
            await self._notify_listeners(task, "started")

            try:
                if task.timeout:
                    result = await asyncio.wait_for(
                        task.func(*task.args, **task.kwargs),
                        timeout=task.timeout,
                    )
                else:
                    result = await task.func(*task.args, **task.kwargs)

                task.result = result
                task.status = TaskStatus.COMPLETED
                task.completed_at = time.time()
                await self._notify_listeners(task, "completed")

                # Schedule next run for recurring tasks
                await self._schedule_next_run(task)

            except asyncio.TimeoutError:
                task.error = "Task timed out after " + str(task.timeout) + " seconds"
                await self._handle_failure(task)

            except Exception as e:
                task.error = str(e)
                await self._handle_failure(task)

            finally:
                # Move to completed tasks
                with self._lock:
                    if task.id in self._tasks:
                        self._completed_tasks[task.id] = self._tasks.pop(task.id)

    async def _handle_failure(self, task: ScheduledTask) -> None:
        """Handle task failure with retry logic."""
        if task.retries < task.max_retries:
            task.retries += 1
            task.status = TaskStatus.RETRYING
            task.scheduled_at = time.time() + (task.retry_delay * task.retries)

            with self._lock:
                heapq.heappush(self._queue, task)

            logger.warning(
                "Task " + task.name + " failed, retrying (" +
                str(task.retries) + "/" + str(task.max_retries) + ")"
            )
            await self._notify_listeners(task, "retrying")
        else:
            task.status = TaskStatus.FAILED
            task.completed_at = time.time()
            logger.error("Task " + task.name + " failed permanently: " + str(task.error))
            await self._notify_listeners(task, "failed")

    async def _schedule_next_run(self, task: ScheduledTask) -> None:
        """Schedule next run for recurring tasks."""
        if task.interval:
            await self.schedule(
                name=task.name,
                func=task.func,
                args=task.args,
                kwargs=task.kwargs,
                delay=task.interval,
                priority=task.priority,
                max_retries=task.max_retries,
                retry_delay=task.retry_delay,
                timeout=task.timeout,
                interval=task.interval,
                metadata=task.metadata,
            )
        elif task.cron:
            await self.schedule(
                name=task.name,
                func=task.func,
                args=task.args,
                kwargs=task.kwargs,
                cron=task.cron,
                priority=task.priority,
                max_retries=task.max_retries,
                retry_delay=task.retry_delay,
                timeout=task.timeout,
                metadata=task.metadata,
            )

    def add_listener(
        self,
        callback: Callable[[ScheduledTask, str], Awaitable[None]],
    ) -> None:
        """Add task event listener."""
        self._listeners.append(callback)

    def remove_listener(
        self,
        callback: Callable[[ScheduledTask, str], Awaitable[None]],
    ) -> None:
        """Remove task event listener."""
        if callback in self._listeners:
            self._listeners.remove(callback)

    async def _notify_listeners(self, task: ScheduledTask, event: str) -> None:
        """Notify all listeners of task event."""
        for listener in self._listeners:
            try:
                await listener(task, event)
            except Exception as e:
                logger.error("Listener error: " + str(e))

    def stats(self) -> Dict[str, Any]:
        """Get scheduler statistics."""
        with self._lock:
            pending = sum(1 for t in self._tasks.values() if t.status == TaskStatus.SCHEDULED)
            running = sum(1 for t in self._tasks.values() if t.status == TaskStatus.RUNNING)
            completed = sum(1 for t in self._completed_tasks.values() if t.status == TaskStatus.COMPLETED)
            failed = sum(1 for t in self._completed_tasks.values() if t.status == TaskStatus.FAILED)

            return {
                "running": self._running,
                "pending_tasks": pending,
                "running_tasks": running,
                "completed_tasks": completed,
                "failed_tasks": failed,
                "total_scheduled": self._task_counter,
                "max_concurrent": self._max_concurrent,
            }


class TaskQueue:
    """Simple async task queue.

    Usage:
        queue = TaskQueue(workers=5)

        # Add tasks
        await queue.put(my_task_1)
        await queue.put(my_task_2)

        # Process queue
        await queue.start()
    """

    def __init__(self, workers: int = 5):
        self._queue: asyncio.Queue[Callable[..., Awaitable[Any]]] = asyncio.Queue()
        self._workers = workers
        self._running = False
        self._worker_tasks: List[asyncio.Task] = []

    async def put(self, task: Callable[..., Awaitable[Any]]) -> None:
        """Add task to queue."""
        await self._queue.put(task)

    async def start(self) -> None:
        """Start queue workers."""
        if self._running:
            return

        self._running = True
        self._worker_tasks = [
            asyncio.create_task(self._worker(i))
            for i in range(self._workers)
        ]

    async def stop(self) -> None:
        """Stop queue workers."""
        self._running = False
        for task in self._worker_tasks:
            task.cancel()
        self._worker_tasks = []

    async def _worker(self, worker_id: int) -> None:
        """Worker coroutine."""
        while self._running:
            try:
                task = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                try:
                    await task()
                except Exception as e:
                    logger.error("Worker " + str(worker_id) + " task error: " + str(e))
                finally:
                    self._queue.task_done()
            except asyncio.TimeoutError:
                continue

    async def join(self) -> None:
        """Wait for all tasks to complete."""
        await self._queue.join()

    @property
    def size(self) -> int:
        """Get queue size."""
        return self._queue.qsize()


def schedule_task(
    scheduler: TaskScheduler,
    name: Optional[str] = None,
    delay: float = 0.0,
    cron: Optional[str] = None,
    interval: Optional[float] = None,
    priority: TaskPriority = TaskPriority.NORMAL,
) -> Callable[[Callable[..., Awaitable[T]]], Callable[..., Awaitable[T]]]:
    """Decorator to schedule a function.

    Usage:
        scheduler = TaskScheduler()

        @schedule_task(scheduler, interval=60.0)
        async def heartbeat():
            print("heartbeat")
    """
    def decorator(func: Callable[..., Awaitable[T]]) -> Callable[..., Awaitable[T]]:
        task_name = name or func.__name__

        async def wrapper(*args: Any, **kwargs: Any) -> T:
            return await func(*args, **kwargs)

        # Schedule on import (deferred)
        async def _schedule() -> None:
            await scheduler.schedule(
                name=task_name,
                func=func,
                delay=delay,
                cron=cron,
                interval=interval,
                priority=priority,
            )

        # Store schedule function for later
        wrapper._schedule = _schedule  # type: ignore
        wrapper._scheduled_task = True  # type: ignore

        return wrapper

    return decorator
