"""
Job Scheduler - Sprint 741

Background job scheduling and execution.

Features:
- Cron-like scheduling
- One-time jobs
- Recurring jobs
- Job persistence
- Priority queues
"""

import time
import uuid
import heapq
import asyncio
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union, Awaitable
)
from enum import Enum
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from functools import wraps


T = TypeVar("T")


class JobStatus(str, Enum):
    """Job statuses."""
    PENDING = "pending"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class JobPriority(int, Enum):
    """Job priorities."""
    LOW = 3
    NORMAL = 2
    HIGH = 1
    CRITICAL = 0


@dataclass
class CronExpression:
    """Cron expression parser.

    Format: minute hour day_of_month month day_of_week

    Examples:
        "*/5 * * * *"  - Every 5 minutes
        "0 * * * *"    - Every hour
        "0 0 * * *"    - Every day at midnight
        "0 0 * * 0"    - Every Sunday at midnight
        "0 0 1 * *"    - First day of every month
    """
    expression: str

    def __post_init__(self) -> None:
        """Parse cron expression."""
        parts = self.expression.split()
        if len(parts) != 5:
            raise ValueError(f"Invalid cron expression: {self.expression}")

        self._minute = self._parse_field(parts[0], 0, 59)
        self._hour = self._parse_field(parts[1], 0, 23)
        self._day = self._parse_field(parts[2], 1, 31)
        self._month = self._parse_field(parts[3], 1, 12)
        self._weekday = self._parse_field(parts[4], 0, 6)

    def _parse_field(self, field: str, min_val: int, max_val: int) -> List[int]:
        """Parse a single cron field."""
        if field == "*":
            return list(range(min_val, max_val + 1))

        if field.startswith("*/"):
            step = int(field[2:])
            return list(range(min_val, max_val + 1, step))

        if "," in field:
            return [int(x) for x in field.split(",")]

        if "-" in field:
            start, end = field.split("-")
            return list(range(int(start), int(end) + 1))

        return [int(field)]

    def next_run(self, after: Optional[datetime] = None) -> datetime:
        """Get next run time after given datetime."""
        now = after or datetime.now()
        candidate = now.replace(second=0, microsecond=0) + timedelta(minutes=1)

        for _ in range(366 * 24 * 60):  # Max 1 year lookahead
            if (
                candidate.minute in self._minute
                and candidate.hour in self._hour
                and candidate.day in self._day
                and candidate.month in self._month
                and candidate.weekday() in self._weekday
            ):
                return candidate
            candidate += timedelta(minutes=1)

        raise ValueError("Could not find next run time")


@dataclass(order=True)
class Job:
    """Scheduled job."""
    next_run: float = field(compare=True)
    id: str = field(default_factory=lambda: str(uuid.uuid4()), compare=False)
    name: str = field(default="", compare=False)
    func: Callable = field(default=lambda: None, compare=False)
    args: tuple = field(default_factory=tuple, compare=False)
    kwargs: dict = field(default_factory=dict, compare=False)
    cron: Optional[CronExpression] = field(default=None, compare=False)
    interval: Optional[float] = field(default=None, compare=False)
    priority: JobPriority = field(default=JobPriority.NORMAL, compare=False)
    status: JobStatus = field(default=JobStatus.PENDING, compare=False)
    max_retries: int = field(default=0, compare=False)
    retry_count: int = field(default=0, compare=False)
    retry_delay: float = field(default=60.0, compare=False)
    timeout: Optional[float] = field(default=None, compare=False)
    created_at: float = field(default_factory=time.time, compare=False)
    started_at: Optional[float] = field(default=None, compare=False)
    completed_at: Optional[float] = field(default=None, compare=False)
    result: Any = field(default=None, compare=False)
    error: Optional[str] = field(default=None, compare=False)
    metadata: Dict[str, Any] = field(default_factory=dict, compare=False)

    def is_recurring(self) -> bool:
        """Check if job is recurring."""
        return self.cron is not None or self.interval is not None

    def calculate_next_run(self) -> Optional[float]:
        """Calculate next run time."""
        if self.cron:
            return self.cron.next_run().timestamp()
        elif self.interval:
            return time.time() + self.interval
        return None


@dataclass
class JobResult:
    """Job execution result."""
    job_id: str
    success: bool
    result: Any = None
    error: Optional[str] = None
    duration: float = 0.0


class JobQueue:
    """Priority job queue."""

    def __init__(self):
        """Initialize queue."""
        self._heap: List[Job] = []
        self._lock = threading.Lock()
        self._jobs: Dict[str, Job] = {}

    def push(self, job: Job) -> None:
        """Add job to queue."""
        with self._lock:
            heapq.heappush(self._heap, job)
            self._jobs[job.id] = job

    def pop(self) -> Optional[Job]:
        """Get next job from queue."""
        with self._lock:
            while self._heap:
                job = heapq.heappop(self._heap)
                if job.id in self._jobs and job.status != JobStatus.CANCELLED:
                    return job
            return None

    def peek(self) -> Optional[Job]:
        """Peek at next job without removing."""
        with self._lock:
            return self._heap[0] if self._heap else None

    def remove(self, job_id: str) -> bool:
        """Remove job from queue."""
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].status = JobStatus.CANCELLED
                del self._jobs[job_id]
                return True
            return False

    def get(self, job_id: str) -> Optional[Job]:
        """Get job by ID."""
        return self._jobs.get(job_id)

    def size(self) -> int:
        """Get queue size."""
        return len(self._jobs)

    def clear(self) -> None:
        """Clear all jobs."""
        with self._lock:
            self._heap.clear()
            self._jobs.clear()


class Scheduler:
    """Job scheduler."""

    def __init__(self, max_workers: int = 4):
        """Initialize scheduler."""
        self._queue = JobQueue()
        self._max_workers = max_workers
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._workers: List[threading.Thread] = []
        self._results: Dict[str, JobResult] = {}
        self._listeners: List[Callable[[Job, JobResult], None]] = []
        self._lock = threading.Lock()

    def schedule(
        self,
        func: Callable,
        args: tuple = (),
        kwargs: Optional[dict] = None,
        delay: float = 0,
        name: Optional[str] = None,
        priority: JobPriority = JobPriority.NORMAL,
        max_retries: int = 0,
        timeout: Optional[float] = None,
        metadata: Optional[Dict] = None,
    ) -> Job:
        """Schedule a one-time job."""
        job = Job(
            next_run=time.time() + delay,
            name=name or func.__name__,
            func=func,
            args=args,
            kwargs=kwargs or {},
            priority=priority,
            status=JobStatus.SCHEDULED,
            max_retries=max_retries,
            timeout=timeout,
            metadata=metadata or {},
        )

        self._queue.push(job)
        return job

    def schedule_interval(
        self,
        func: Callable,
        interval: float,
        args: tuple = (),
        kwargs: Optional[dict] = None,
        name: Optional[str] = None,
        priority: JobPriority = JobPriority.NORMAL,
        start_immediately: bool = False,
    ) -> Job:
        """Schedule a recurring interval job."""
        delay = 0 if start_immediately else interval

        job = Job(
            next_run=time.time() + delay,
            name=name or func.__name__,
            func=func,
            args=args,
            kwargs=kwargs or {},
            interval=interval,
            priority=priority,
            status=JobStatus.SCHEDULED,
        )

        self._queue.push(job)
        return job

    def schedule_cron(
        self,
        func: Callable,
        cron_expr: str,
        args: tuple = (),
        kwargs: Optional[dict] = None,
        name: Optional[str] = None,
        priority: JobPriority = JobPriority.NORMAL,
    ) -> Job:
        """Schedule a cron job."""
        cron = CronExpression(cron_expr)

        job = Job(
            next_run=cron.next_run().timestamp(),
            name=name or func.__name__,
            func=func,
            args=args,
            kwargs=kwargs or {},
            cron=cron,
            priority=priority,
            status=JobStatus.SCHEDULED,
        )

        self._queue.push(job)
        return job

    def cancel(self, job_id: str) -> bool:
        """Cancel a scheduled job."""
        return self._queue.remove(job_id)

    def pause(self, job_id: str) -> bool:
        """Pause a job."""
        job = self._queue.get(job_id)
        if job:
            job.status = JobStatus.PAUSED
            return True
        return False

    def resume(self, job_id: str) -> bool:
        """Resume a paused job."""
        job = self._queue.get(job_id)
        if job and job.status == JobStatus.PAUSED:
            job.status = JobStatus.SCHEDULED
            return True
        return False

    def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID."""
        return self._queue.get(job_id)

    def get_result(self, job_id: str) -> Optional[JobResult]:
        """Get job result."""
        return self._results.get(job_id)

    def on_complete(self, callback: Callable[[Job, JobResult], None]) -> None:
        """Register completion callback."""
        self._listeners.append(callback)

    def _execute_job(self, job: Job) -> JobResult:
        """Execute a job."""
        job.status = JobStatus.RUNNING
        job.started_at = time.time()

        try:
            if asyncio.iscoroutinefunction(job.func):
                loop = asyncio.new_event_loop()
                try:
                    result = loop.run_until_complete(
                        asyncio.wait_for(
                            job.func(*job.args, **job.kwargs),
                            timeout=job.timeout
                        )
                    )
                finally:
                    loop.close()
            else:
                result = job.func(*job.args, **job.kwargs)

            job.status = JobStatus.COMPLETED
            job.completed_at = time.time()
            job.result = result

            return JobResult(
                job_id=job.id,
                success=True,
                result=result,
                duration=job.completed_at - job.started_at,
            )

        except Exception as e:
            job.error = str(e)

            if job.retry_count < job.max_retries:
                job.retry_count += 1
                job.next_run = time.time() + job.retry_delay
                job.status = JobStatus.SCHEDULED
                self._queue.push(job)

                return JobResult(
                    job_id=job.id,
                    success=False,
                    error=str(e),
                    duration=time.time() - job.started_at,
                )

            job.status = JobStatus.FAILED
            job.completed_at = time.time()

            return JobResult(
                job_id=job.id,
                success=False,
                error=str(e),
                duration=job.completed_at - job.started_at,
            )

    def _reschedule_recurring(self, job: Job) -> None:
        """Reschedule recurring job."""
        next_run = job.calculate_next_run()
        if next_run:
            new_job = Job(
                next_run=next_run,
                name=job.name,
                func=job.func,
                args=job.args,
                kwargs=job.kwargs,
                cron=job.cron,
                interval=job.interval,
                priority=job.priority,
                status=JobStatus.SCHEDULED,
                max_retries=job.max_retries,
                timeout=job.timeout,
                metadata=job.metadata,
            )
            self._queue.push(new_job)

    def _worker(self) -> None:
        """Worker thread."""
        while self._running:
            job = self._queue.peek()

            if job is None:
                time.sleep(0.1)
                continue

            if job.status == JobStatus.PAUSED:
                time.sleep(0.1)
                continue

            if job.next_run > time.time():
                time.sleep(min(0.1, job.next_run - time.time()))
                continue

            job = self._queue.pop()
            if job is None:
                continue

            result = self._execute_job(job)
            self._results[job.id] = result

            for listener in self._listeners:
                try:
                    listener(job, result)
                except Exception:
                    pass

            if job.is_recurring() and result.success:
                self._reschedule_recurring(job)

    def start(self) -> None:
        """Start the scheduler."""
        if self._running:
            return

        self._running = True

        for i in range(self._max_workers):
            worker = threading.Thread(target=self._worker, daemon=True)
            worker.start()
            self._workers.append(worker)

    def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False

        for worker in self._workers:
            worker.join(timeout=1.0)

        self._workers.clear()

    def wait_for(self, job_id: str, timeout: Optional[float] = None) -> Optional[JobResult]:
        """Wait for job completion."""
        start = time.time()

        while True:
            result = self._results.get(job_id)
            if result:
                return result

            job = self._queue.get(job_id)
            if job and job.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                return self._results.get(job_id)

            if timeout and (time.time() - start) > timeout:
                return None

            time.sleep(0.1)


def scheduled(
    cron: Optional[str] = None,
    interval: Optional[float] = None,
    delay: float = 0,
    priority: JobPriority = JobPriority.NORMAL,
) -> Callable:
    """Decorator for scheduled functions."""
    def decorator(func: Callable) -> Callable:
        func._schedule_cron = cron
        func._schedule_interval = interval
        func._schedule_delay = delay
        func._schedule_priority = priority
        return func

    return decorator


# Singleton instance
scheduler = Scheduler()


# Convenience functions
def schedule(
    func: Callable,
    *args: Any,
    delay: float = 0,
    **kwargs: Any,
) -> Job:
    """Schedule a one-time job."""
    return scheduler.schedule(func, args=args, kwargs=kwargs, delay=delay)


def schedule_interval(
    func: Callable,
    interval: float,
    *args: Any,
    **kwargs: Any,
) -> Job:
    """Schedule an interval job."""
    return scheduler.schedule_interval(func, interval, args=args, kwargs=kwargs)


def schedule_cron(func: Callable, cron_expr: str, *args: Any, **kwargs: Any) -> Job:
    """Schedule a cron job."""
    return scheduler.schedule_cron(func, cron_expr, args=args, kwargs=kwargs)
