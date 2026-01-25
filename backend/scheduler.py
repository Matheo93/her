"""
Scheduler - Sprint 641

Task scheduling system.

Features:
- Cron-like scheduling
- One-time tasks
- Recurring tasks
- Task dependencies
- Execution history
"""

import time
import asyncio
import heapq
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Set
from enum import Enum
from threading import Lock
from datetime import datetime, timedelta
import re


class TaskStatus(str, Enum):
    """Task status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ScheduleType(str, Enum):
    """Schedule type."""
    ONCE = "once"
    INTERVAL = "interval"
    CRON = "cron"
    DAILY = "daily"
    WEEKLY = "weekly"


@dataclass
class ScheduledTask:
    """A scheduled task."""
    id: str
    name: str
    handler: Callable
    schedule_type: ScheduleType
    next_run: float
    interval: Optional[float] = None  # seconds for interval
    cron_expr: Optional[str] = None
    enabled: bool = True
    max_runs: Optional[int] = None
    run_count: int = 0
    last_run: Optional[float] = None
    last_result: Optional[Any] = None
    last_error: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    timeout: float = 300.0
    retry_count: int = 0
    max_retries: int = 0
    created_at: float = field(default_factory=time.time)

    def __lt__(self, other: "ScheduledTask") -> bool:
        return self.next_run < other.next_run

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "schedule_type": self.schedule_type.value,
            "next_run": self.next_run,
            "next_run_iso": datetime.fromtimestamp(self.next_run).isoformat() if self.next_run else None,
            "interval": self.interval,
            "cron_expr": self.cron_expr,
            "enabled": self.enabled,
            "max_runs": self.max_runs,
            "run_count": self.run_count,
            "last_run": self.last_run,
            "last_error": self.last_error,
            "tags": self.tags,
            "timeout": self.timeout,
            "created_at": self.created_at,
        }


@dataclass
class TaskExecution:
    """A task execution record."""
    task_id: str
    task_name: str
    started_at: float
    completed_at: Optional[float] = None
    status: TaskStatus = TaskStatus.RUNNING
    result: Optional[Any] = None
    error: Optional[str] = None
    duration: Optional[float] = None


class CronParser:
    """Simple cron expression parser."""

    @staticmethod
    def parse(expr: str) -> Dict[str, Set[int]]:
        """Parse cron expression.

        Format: minute hour day month weekday
        Supports: *, */n, n, n-m, n,m
        """
        parts = expr.strip().split()
        if len(parts) != 5:
            raise ValueError("Invalid cron expression")

        return {
            "minute": CronParser._parse_field(parts[0], 0, 59),
            "hour": CronParser._parse_field(parts[1], 0, 23),
            "day": CronParser._parse_field(parts[2], 1, 31),
            "month": CronParser._parse_field(parts[3], 1, 12),
            "weekday": CronParser._parse_field(parts[4], 0, 6),
        }

    @staticmethod
    def _parse_field(field: str, min_val: int, max_val: int) -> Set[int]:
        """Parse a single cron field."""
        if field == "*":
            return set(range(min_val, max_val + 1))

        if field.startswith("*/"):
            step = int(field[2:])
            return set(range(min_val, max_val + 1, step))

        values = set()
        for part in field.split(","):
            if "-" in part:
                start, end = part.split("-")
                values.update(range(int(start), int(end) + 1))
            else:
                values.add(int(part))

        return values

    @staticmethod
    def next_run(expr: str, after: Optional[float] = None) -> float:
        """Calculate next run time from cron expression."""
        parsed = CronParser.parse(expr)
        now = datetime.fromtimestamp(after or time.time())
        dt = now.replace(second=0, microsecond=0) + timedelta(minutes=1)

        for _ in range(525600):  # Max 1 year search
            if (
                dt.minute in parsed["minute"]
                and dt.hour in parsed["hour"]
                and dt.day in parsed["day"]
                and dt.month in parsed["month"]
                and dt.weekday() in parsed["weekday"]
            ):
                return dt.timestamp()
            dt += timedelta(minutes=1)

        raise ValueError("Could not find next run time")


class Scheduler:
    """Task scheduling system.

    Usage:
        scheduler = Scheduler()

        # Schedule one-time task
        scheduler.schedule_once(
            "cleanup",
            cleanup_handler,
            delay=3600  # 1 hour
        )

        # Schedule recurring task
        scheduler.schedule_interval(
            "heartbeat",
            heartbeat_handler,
            interval=60  # every minute
        )

        # Schedule with cron
        scheduler.schedule_cron(
            "daily_report",
            report_handler,
            "0 9 * * *"  # 9 AM daily
        )

        # Start scheduler
        await scheduler.start()
    """

    def __init__(self, max_history: int = 1000):
        """Initialize scheduler."""
        self._tasks: Dict[str, ScheduledTask] = {}
        self._task_heap: List[ScheduledTask] = []
        self._history: List[TaskExecution] = []
        self._lock = Lock()
        self._running = False
        self._worker_task: Optional[asyncio.Task] = None
        self._max_history = max_history
        self._id_counter = 0
        self._handlers: Dict[str, Callable] = {}

    def _generate_id(self) -> str:
        """Generate unique task ID."""
        self._id_counter += 1
        return f"task_{int(time.time())}{self._id_counter}"

    def schedule_once(
        self,
        name: str,
        handler: Callable,
        delay: float = 0,
        at: Optional[float] = None,
        tags: Optional[List[str]] = None,
        timeout: float = 300.0
    ) -> str:
        """Schedule a one-time task.

        Args:
            name: Task name
            handler: Task handler
            delay: Delay in seconds
            at: Specific timestamp
            tags: Task tags
            timeout: Execution timeout

        Returns:
            Task ID
        """
        next_run = at or (time.time() + delay)

        task = ScheduledTask(
            id=self._generate_id(),
            name=name,
            handler=handler,
            schedule_type=ScheduleType.ONCE,
            next_run=next_run,
            max_runs=1,
            tags=tags or [],
            timeout=timeout,
        )

        return self._add_task(task)

    def schedule_interval(
        self,
        name: str,
        handler: Callable,
        interval: float,
        delay: float = 0,
        max_runs: Optional[int] = None,
        tags: Optional[List[str]] = None,
        timeout: float = 300.0
    ) -> str:
        """Schedule an interval task.

        Args:
            name: Task name
            handler: Task handler
            interval: Interval in seconds
            delay: Initial delay
            max_runs: Maximum runs
            tags: Task tags
            timeout: Execution timeout

        Returns:
            Task ID
        """
        task = ScheduledTask(
            id=self._generate_id(),
            name=name,
            handler=handler,
            schedule_type=ScheduleType.INTERVAL,
            next_run=time.time() + delay,
            interval=interval,
            max_runs=max_runs,
            tags=tags or [],
            timeout=timeout,
        )

        return self._add_task(task)

    def schedule_cron(
        self,
        name: str,
        handler: Callable,
        cron_expr: str,
        max_runs: Optional[int] = None,
        tags: Optional[List[str]] = None,
        timeout: float = 300.0
    ) -> str:
        """Schedule a cron task.

        Args:
            name: Task name
            handler: Task handler
            cron_expr: Cron expression
            max_runs: Maximum runs
            tags: Task tags
            timeout: Execution timeout

        Returns:
            Task ID
        """
        next_run = CronParser.next_run(cron_expr)

        task = ScheduledTask(
            id=self._generate_id(),
            name=name,
            handler=handler,
            schedule_type=ScheduleType.CRON,
            next_run=next_run,
            cron_expr=cron_expr,
            max_runs=max_runs,
            tags=tags or [],
            timeout=timeout,
        )

        return self._add_task(task)

    def schedule_daily(
        self,
        name: str,
        handler: Callable,
        hour: int = 0,
        minute: int = 0,
        tags: Optional[List[str]] = None,
        timeout: float = 300.0
    ) -> str:
        """Schedule a daily task.

        Args:
            name: Task name
            handler: Task handler
            hour: Hour (0-23)
            minute: Minute (0-59)
            tags: Task tags
            timeout: Execution timeout

        Returns:
            Task ID
        """
        cron_expr = f"{minute} {hour} * * *"
        return self.schedule_cron(name, handler, cron_expr, tags=tags, timeout=timeout)

    def _add_task(self, task: ScheduledTask) -> str:
        """Add task to scheduler."""
        with self._lock:
            self._tasks[task.id] = task
            heapq.heappush(self._task_heap, task)
            self._handlers[task.id] = task.handler

        return task.id

    def cancel_task(self, task_id: str) -> bool:
        """Cancel a scheduled task.

        Args:
            task_id: Task ID

        Returns:
            True if cancelled
        """
        with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.enabled = False
                del self._tasks[task_id]
                return True
            return False

    def pause_task(self, task_id: str) -> bool:
        """Pause a task.

        Args:
            task_id: Task ID

        Returns:
            True if paused
        """
        with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.enabled = False
                return True
            return False

    def resume_task(self, task_id: str) -> bool:
        """Resume a paused task.

        Args:
            task_id: Task ID

        Returns:
            True if resumed
        """
        with self._lock:
            task = self._tasks.get(task_id)
            if task:
                task.enabled = True
                return True
            return False

    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task details.

        Args:
            task_id: Task ID

        Returns:
            Task info or None
        """
        with self._lock:
            task = self._tasks.get(task_id)
            return task.to_dict() if task else None

    def list_tasks(
        self,
        tag: Optional[str] = None,
        enabled_only: bool = False
    ) -> List[Dict[str, Any]]:
        """List all tasks.

        Args:
            tag: Filter by tag
            enabled_only: Only enabled tasks

        Returns:
            List of tasks
        """
        with self._lock:
            tasks = list(self._tasks.values())

        if tag:
            tasks = [t for t in tasks if tag in t.tags]

        if enabled_only:
            tasks = [t for t in tasks if t.enabled]

        return [t.to_dict() for t in sorted(tasks, key=lambda t: t.next_run)]

    async def run_task_now(self, task_id: str) -> bool:
        """Run a task immediately.

        Args:
            task_id: Task ID

        Returns:
            True if executed
        """
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False

        await self._execute_task(task)
        return True

    async def _execute_task(self, task: ScheduledTask):
        """Execute a task."""
        execution = TaskExecution(
            task_id=task.id,
            task_name=task.name,
            started_at=time.time(),
        )

        try:
            handler = self._handlers.get(task.id)
            if not handler:
                raise ValueError("Handler not found")

            if asyncio.iscoroutinefunction(handler):
                result = await asyncio.wait_for(
                    handler(),
                    timeout=task.timeout
                )
            else:
                result = handler()

            execution.status = TaskStatus.COMPLETED
            execution.result = result
            task.last_result = result
            task.last_error = None
            task.retry_count = 0

        except asyncio.TimeoutError:
            execution.status = TaskStatus.FAILED
            execution.error = "Timeout"
            task.last_error = "Timeout"

        except Exception as e:
            execution.status = TaskStatus.FAILED
            execution.error = str(e)
            task.last_error = str(e)

            # Retry logic
            if task.retry_count < task.max_retries:
                task.retry_count += 1
                task.next_run = time.time() + (60 * task.retry_count)
                heapq.heappush(self._task_heap, task)

        execution.completed_at = time.time()
        execution.duration = execution.completed_at - execution.started_at

        task.last_run = execution.started_at
        task.run_count += 1

        with self._lock:
            self._history.append(execution)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]

        # Schedule next run for recurring tasks
        if execution.status == TaskStatus.COMPLETED:
            self._schedule_next_run(task)

    def _schedule_next_run(self, task: ScheduledTask):
        """Schedule next run for recurring task."""
        if task.max_runs and task.run_count >= task.max_runs:
            with self._lock:
                if task.id in self._tasks:
                    del self._tasks[task.id]
            return

        if task.schedule_type == ScheduleType.ONCE:
            with self._lock:
                if task.id in self._tasks:
                    del self._tasks[task.id]
            return

        if task.schedule_type == ScheduleType.INTERVAL:
            task.next_run = time.time() + (task.interval or 60)
        elif task.schedule_type == ScheduleType.CRON and task.cron_expr:
            task.next_run = CronParser.next_run(task.cron_expr)

        with self._lock:
            if task.id in self._tasks:
                heapq.heappush(self._task_heap, task)

    async def _worker(self):
        """Background worker for task execution."""
        while self._running:
            try:
                now = time.time()

                while self._task_heap:
                    with self._lock:
                        if not self._task_heap:
                            break

                        next_task = self._task_heap[0]

                        if next_task.next_run > now:
                            break

                        heapq.heappop(self._task_heap)

                        if not next_task.enabled:
                            continue

                        if next_task.id not in self._tasks:
                            continue

                    await self._execute_task(next_task)

                await asyncio.sleep(1)

            except Exception as e:
                print(f"Scheduler worker error: {e}")
                await asyncio.sleep(5)

    async def start(self):
        """Start the scheduler."""
        if not self._running:
            self._running = True
            self._worker_task = asyncio.create_task(self._worker())

    async def stop(self):
        """Stop the scheduler."""
        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass

    def get_history(
        self,
        task_id: Optional[str] = None,
        status: Optional[TaskStatus] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get execution history.

        Args:
            task_id: Filter by task
            status: Filter by status
            limit: Max items

        Returns:
            List of executions
        """
        with self._lock:
            history = list(self._history)

        if task_id:
            history = [h for h in history if h.task_id == task_id]

        if status:
            history = [h for h in history if h.status == status]

        history = sorted(history, key=lambda h: h.started_at, reverse=True)

        return [
            {
                "task_id": h.task_id,
                "task_name": h.task_name,
                "started_at": h.started_at,
                "completed_at": h.completed_at,
                "status": h.status.value,
                "duration": h.duration,
                "error": h.error,
            }
            for h in history[:limit]
        ]

    def get_stats(self) -> Dict[str, Any]:
        """Get scheduler statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            tasks = list(self._tasks.values())
            history = list(self._history)

        by_type = {}
        for stype in ScheduleType:
            by_type[stype.value] = len([t for t in tasks if t.schedule_type == stype])

        by_status = {}
        for status in TaskStatus:
            by_status[status.value] = len([h for h in history if h.status == status])

        return {
            "total_tasks": len(tasks),
            "enabled_tasks": len([t for t in tasks if t.enabled]),
            "by_type": by_type,
            "history_size": len(history),
            "by_status": by_status,
            "running": self._running,
        }


# Singleton instance
scheduler = Scheduler()
