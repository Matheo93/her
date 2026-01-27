"""
Task Queue - Sprint 761

Distributed task queue system.

Features:
- Async task execution
- Priority queues
- Task dependencies
- Retry with backoff
- Result storage
- Worker pools
"""

import asyncio
import uuid
import time
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Awaitable, Set
)
from enum import Enum
from abc import ABC, abstractmethod
import traceback


T = TypeVar("T")


class TaskStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    RETRY = "retry"
    CANCELLED = "cancelled"


class TaskPriority(int, Enum):
    """Task priority levels."""
    LOW = 10
    NORMAL = 5
    HIGH = 1
    CRITICAL = 0


@dataclass
class TaskResult:
    """Task execution result."""
    task_id: str
    status: TaskStatus
    result: Any = None
    error: Optional[str] = None
    traceback_str: Optional[str] = None
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    attempts: int = 0

    @property
    def duration_ms(self) -> Optional[float]:
        if self.started_at and self.finished_at:
            return (self.finished_at - self.started_at) * 1000
        return None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "status": self.status.value,
            "result": self.result,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "attempts": self.attempts,
        }


@dataclass
class Task:
    """Task definition."""
    id: str
    name: str
    func: Callable[..., Awaitable[Any]]
    args: tuple = field(default_factory=tuple)
    kwargs: Dict[str, Any] = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    max_retries: int = 3
    retry_delay: float = 60.0
    timeout: Optional[float] = None
    depends_on: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)

    def __lt__(self, other: "Task") -> bool:
        """Compare by priority for heap ordering."""
        return (self.priority.value, self.created_at) < (other.priority.value, other.created_at)


class TaskRegistry:
    """Registry of registered tasks."""

    def __init__(self):
        self._tasks: Dict[str, Callable[..., Awaitable[Any]]] = {}
        self._options: Dict[str, dict] = {}

    def register(
        self,
        name: Optional[str] = None,
        max_retries: int = 3,
        retry_delay: float = 60.0,
        timeout: Optional[float] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
    ) -> Callable:
        """Decorator to register a task."""
        def decorator(func: Callable[..., Awaitable[Any]]) -> Callable:
            task_name = name or func.__name__
            self._tasks[task_name] = func
            self._options[task_name] = {
                "max_retries": max_retries,
                "retry_delay": retry_delay,
                "timeout": timeout,
                "priority": priority,
            }
            return func
        return decorator

    def get(self, name: str) -> Optional[Callable[..., Awaitable[Any]]]:
        """Get registered task by name."""
        return self._tasks.get(name)

    def get_options(self, name: str) -> dict:
        """Get task options."""
        return self._options.get(name, {})

    def list_tasks(self) -> List[str]:
        """List all registered task names."""
        return list(self._tasks.keys())


class ResultBackend(ABC):
    """Abstract result storage backend."""

    @abstractmethod
    async def store(self, task_id: str, result: TaskResult) -> None:
        """Store task result."""
        pass

    @abstractmethod
    async def get(self, task_id: str) -> Optional[TaskResult]:
        """Get task result."""
        pass

    @abstractmethod
    async def delete(self, task_id: str) -> bool:
        """Delete task result."""
        pass


class MemoryResultBackend(ResultBackend):
    """In-memory result storage."""

    def __init__(self, max_results: int = 10000):
        self._results: Dict[str, TaskResult] = {}
        self._max_results = max_results
        self._lock = threading.Lock()

    async def store(self, task_id: str, result: TaskResult) -> None:
        with self._lock:
            self._results[task_id] = result
            if len(self._results) > self._max_results:
                sorted_ids = sorted(
                    self._results.keys(),
                    key=lambda k: self._results[k].finished_at or 0
                )
                for old_id in sorted_ids[:len(sorted_ids) // 2]:
                    del self._results[old_id]

    async def get(self, task_id: str) -> Optional[TaskResult]:
        return self._results.get(task_id)

    async def delete(self, task_id: str) -> bool:
        with self._lock:
            if task_id in self._results:
                del self._results[task_id]
                return True
            return False


class TaskQueue:
    """Task queue with worker management."""

    def __init__(
        self,
        result_backend: Optional[ResultBackend] = None,
        default_timeout: float = 300.0,
    ):
        self._registry = TaskRegistry()
        self._result_backend = result_backend or MemoryResultBackend()
        self._default_timeout = default_timeout
        self._queues: Dict[TaskPriority, asyncio.Queue] = {}
        self._pending: Dict[str, Task] = {}
        self._running: Dict[str, Task] = {}
        self._dependencies: Dict[str, Set[str]] = defaultdict(set)
        self._workers: List[asyncio.Task] = []
        self._running_flag = False
        self._lock = threading.Lock()
        self._initialized = False

    def _ensure_queues(self) -> None:
        """Ensure queues are created."""
        if not self._initialized:
            for p in TaskPriority:
                self._queues[p] = asyncio.Queue()
            self._initialized = True

    def task(
        self,
        name: Optional[str] = None,
        max_retries: int = 3,
        retry_delay: float = 60.0,
        timeout: Optional[float] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
    ) -> Callable:
        """Decorator to register a task."""
        return self._registry.register(
            name=name,
            max_retries=max_retries,
            retry_delay=retry_delay,
            timeout=timeout,
            priority=priority,
        )

    async def enqueue(
        self,
        task_name: str,
        *args: Any,
        priority: Optional[TaskPriority] = None,
        depends_on: Optional[List[str]] = None,
        **kwargs: Any,
    ) -> str:
        """Enqueue a task for execution."""
        self._ensure_queues()

        func = self._registry.get(task_name)
        if not func:
            raise ValueError("Task not registered: " + task_name)

        options = self._registry.get_options(task_name)
        task_priority = priority or options.get("priority", TaskPriority.NORMAL)

        task = Task(
            id=str(uuid.uuid4()),
            name=task_name,
            func=func,
            args=args,
            kwargs=kwargs,
            priority=task_priority,
            max_retries=options.get("max_retries", 3),
            retry_delay=options.get("retry_delay", 60.0),
            timeout=options.get("timeout") or self._default_timeout,
            depends_on=depends_on or [],
        )

        await self._result_backend.store(
            task.id,
            TaskResult(task_id=task.id, status=TaskStatus.PENDING)
        )

        if task.depends_on:
            all_done = True
            for dep_id in task.depends_on:
                dep_result = await self._result_backend.get(dep_id)
                if not dep_result or dep_result.status not in (TaskStatus.SUCCESS, TaskStatus.FAILED):
                    all_done = False
                    self._dependencies[dep_id].add(task.id)

            if not all_done:
                self._pending[task.id] = task
                return task.id

        await self._queues[task_priority].put(task)
        await self._result_backend.store(
            task.id,
            TaskResult(task_id=task.id, status=TaskStatus.QUEUED)
        )

        return task.id

    async def get_result(
        self,
        task_id: str,
        wait: bool = False,
        timeout: float = 60.0,
    ) -> Optional[TaskResult]:
        """Get task result."""
        if wait:
            start = time.time()
            while time.time() - start < timeout:
                result = await self._result_backend.get(task_id)
                if result and result.status in (TaskStatus.SUCCESS, TaskStatus.FAILED, TaskStatus.CANCELLED):
                    return result
                await asyncio.sleep(0.1)
            return None

        return await self._result_backend.get(task_id)

    async def cancel(self, task_id: str) -> bool:
        """Cancel a pending task."""
        if task_id in self._pending:
            del self._pending[task_id]
            await self._result_backend.store(
                task_id,
                TaskResult(task_id=task_id, status=TaskStatus.CANCELLED)
            )
            return True
        return False

    async def _execute_task(self, task: Task) -> TaskResult:
        """Execute a single task."""
        result = TaskResult(
            task_id=task.id,
            status=TaskStatus.RUNNING,
            started_at=time.time(),
            attempts=0,
        )

        self._running[task.id] = task

        try:
            while result.attempts < task.max_retries:
                result.attempts += 1

                try:
                    if task.timeout:
                        output = await asyncio.wait_for(
                            task.func(*task.args, **task.kwargs),
                            timeout=task.timeout
                        )
                    else:
                        output = await task.func(*task.args, **task.kwargs)

                    result.status = TaskStatus.SUCCESS
                    result.result = output
                    break

                except asyncio.TimeoutError:
                    result.error = "Task timed out"
                    result.status = TaskStatus.RETRY if result.attempts < task.max_retries else TaskStatus.FAILED

                except Exception as e:
                    result.error = str(e)
                    result.traceback_str = traceback.format_exc()
                    result.status = TaskStatus.RETRY if result.attempts < task.max_retries else TaskStatus.FAILED

                if result.status == TaskStatus.RETRY:
                    await asyncio.sleep(task.retry_delay * result.attempts)

        finally:
            result.finished_at = time.time()
            if task.id in self._running:
                del self._running[task.id]

        return result

    async def _worker(self, worker_id: int) -> None:
        """Worker coroutine that processes tasks."""
        while self._running_flag:
            task = None

            for priority in TaskPriority:
                try:
                    task = self._queues[priority].get_nowait()
                    break
                except asyncio.QueueEmpty:
                    continue

            if task:
                result = await self._execute_task(task)
                await self._result_backend.store(task.id, result)

                if task.id in self._dependencies:
                    for dep_task_id in list(self._dependencies[task.id]):
                        if dep_task_id in self._pending:
                            dep_task = self._pending[dep_task_id]
                            all_done = True
                            for dep_id in dep_task.depends_on:
                                dep_result = await self._result_backend.get(dep_id)
                                if not dep_result or dep_result.status not in (TaskStatus.SUCCESS, TaskStatus.FAILED):
                                    all_done = False
                                    break

                            if all_done:
                                del self._pending[dep_task_id]
                                await self._queues[dep_task.priority].put(dep_task)

                    del self._dependencies[task.id]
            else:
                await asyncio.sleep(0.1)

    async def start_workers(self, num_workers: int = 4) -> None:
        """Start worker tasks."""
        if self._running_flag:
            return

        self._ensure_queues()
        self._running_flag = True
        for i in range(num_workers):
            worker = asyncio.create_task(self._worker(i))
            self._workers.append(worker)

    async def stop_workers(self, wait: bool = True) -> None:
        """Stop worker tasks."""
        self._running_flag = False

        if wait:
            for worker in self._workers:
                worker.cancel()
                try:
                    await worker
                except asyncio.CancelledError:
                    pass

        self._workers.clear()

    def get_queue_sizes(self) -> Dict[str, int]:
        """Get current queue sizes."""
        self._ensure_queues()
        return {p.name: self._queues[p].qsize() for p in TaskPriority}

    def get_running_count(self) -> int:
        """Get number of currently running tasks."""
        return len(self._running)

    def list_registered_tasks(self) -> List[str]:
        """List all registered task names."""
        return self._registry.list_tasks()


_queue: Optional[TaskQueue] = None


def get_task_queue() -> TaskQueue:
    """Get global task queue."""
    global _queue
    if not _queue:
        _queue = TaskQueue()
    return _queue


def task(
    name: Optional[str] = None,
    max_retries: int = 3,
    retry_delay: float = 60.0,
    timeout: Optional[float] = None,
    priority: TaskPriority = TaskPriority.NORMAL,
) -> Callable:
    """Global task decorator."""
    return get_task_queue().task(
        name=name,
        max_retries=max_retries,
        retry_delay=retry_delay,
        timeout=timeout,
        priority=priority,
    )
