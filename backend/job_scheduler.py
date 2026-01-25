"""
Job Scheduler - Sprint 699

Background job scheduling system.

Features:
- Cron-style scheduling
- Interval scheduling
- One-time jobs
- Job queues
- Retry policies
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Union
)
from enum import Enum
import threading
from datetime import datetime, timedelta
import heapq
import re


class JobStatus(str, Enum):
    """Job execution status."""
    PENDING = "pending"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class JobPriority(int, Enum):
    """Job priority levels."""
    LOW = 1
    NORMAL = 5
    HIGH = 10
    CRITICAL = 20


@dataclass
class Job:
    """Scheduled job definition."""
    id: str
    name: str
    func: Callable[..., Awaitable[Any]]
    args: tuple = field(default_factory=tuple)
    kwargs: Dict[str, Any] = field(default_factory=dict)
    status: JobStatus = JobStatus.PENDING
    priority: JobPriority = JobPriority.NORMAL
    scheduled_at: Optional[float] = None
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    retries: int = 0
    max_retries: int = 3
    retry_delay: float = 5.0
    timeout: Optional[float] = None
    tags: List[str] = field(default_factory=list)

    def __lt__(self, other: "Job") -> bool:
        """For heap comparison."""
        if self.scheduled_at == other.scheduled_at:
            return self.priority.value > other.priority.value
        return (self.scheduled_at or 0) < (other.scheduled_at or 0)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status.value,
            "priority": self.priority.value,
            "scheduled_at": self.scheduled_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "retries": self.retries,
            "tags": self.tags,
        }


@dataclass
class Schedule:
    """Job schedule definition."""
    type: str  # "cron", "interval", "once"
    value: Any  # cron string, interval seconds, or timestamp
    timezone: str = "UTC"
    last_run: Optional[float] = None
    next_run: Optional[float] = None


class CronParser:
    """Simple cron expression parser."""

    @staticmethod
    def parse(expression: str) -> Dict[str, List[int]]:
        """Parse cron expression to field values."""
        parts = expression.split()
        if len(parts) != 5:
            raise ValueError(f"Invalid cron expression: {expression}")

        fields = ["minute", "hour", "day", "month", "weekday"]
        result = {}

        for i, (field, part) in enumerate(zip(fields, parts)):
            result[field] = CronParser._parse_field(part, CronParser._field_range(field))

        return result

    @staticmethod
    def _field_range(field: str) -> tuple:
        """Get valid range for field."""
        ranges = {
            "minute": (0, 59),
            "hour": (0, 23),
            "day": (1, 31),
            "month": (1, 12),
            "weekday": (0, 6),
        }
        return ranges[field]

    @staticmethod
    def _parse_field(value: str, field_range: tuple) -> List[int]:
        """Parse single cron field."""
        min_val, max_val = field_range

        if value == "*":
            return list(range(min_val, max_val + 1))

        if "/" in value:
            parts = value.split("/")
            step = int(parts[1])
            if parts[0] == "*":
                return list(range(min_val, max_val + 1, step))
            start = int(parts[0])
            return list(range(start, max_val + 1, step))

        if "-" in value:
            parts = value.split("-")
            return list(range(int(parts[0]), int(parts[1]) + 1))

        if "," in value:
            return [int(v) for v in value.split(",")]

        return [int(value)]

    @staticmethod
    def get_next_run(expression: str, from_time: Optional[datetime] = None) -> datetime:
        """Calculate next run time for cron expression."""
        if from_time is None:
            from_time = datetime.now()

        parsed = CronParser.parse(expression)
        current = from_time + timedelta(minutes=1)
        current = current.replace(second=0, microsecond=0)

        for _ in range(365 * 24 * 60):  # Max 1 year
            if (
                current.minute in parsed["minute"]
                and current.hour in parsed["hour"]
                and current.day in parsed["day"]
                and current.month in parsed["month"]
                and current.weekday() in parsed["weekday"]
            ):
                return current
            current += timedelta(minutes=1)

        raise ValueError("Could not find next run time")


class JobQueue:
    """Priority-based job queue."""

    def __init__(self, max_size: Optional[int] = None):
        """Initialize queue."""
        self._heap: List[Job] = []
        self._max_size = max_size
        self._lock = threading.Lock()

    def push(self, job: Job) -> bool:
        """Add job to queue."""
        with self._lock:
            if self._max_size and len(self._heap) >= self._max_size:
                return False
            heapq.heappush(self._heap, job)
            return True

    def pop(self) -> Optional[Job]:
        """Get next job from queue."""
        with self._lock:
            if self._heap:
                return heapq.heappop(self._heap)
            return None

    def peek(self) -> Optional[Job]:
        """Peek at next job without removing."""
        with self._lock:
            return self._heap[0] if self._heap else None

    def __len__(self) -> int:
        return len(self._heap)

    def is_empty(self) -> bool:
        return len(self._heap) == 0


class JobScheduler:
    """Main job scheduler.

    Usage:
        scheduler = JobScheduler()

        # Schedule one-time job
        scheduler.once(process_data, delay=60)

        # Schedule recurring job
        scheduler.every(5).seconds.do(check_health)
        scheduler.every(1).hours.do(cleanup_cache)

        # Cron scheduling
        scheduler.cron("0 */2 * * *", generate_report)

        # Start scheduler
        await scheduler.start()
    """

    def __init__(self, max_concurrent: int = 10):
        """Initialize scheduler."""
        self._queue = JobQueue()
        self._jobs: Dict[str, Job] = {}
        self._schedules: Dict[str, Schedule] = {}
        self._running = False
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._lock = threading.Lock()
        self._stats = {
            "total_scheduled": 0,
            "total_executed": 0,
            "successful": 0,
            "failed": 0,
            "retried": 0,
        }

    def once(
        self,
        func: Callable[..., Awaitable[Any]],
        *args,
        delay: float = 0,
        at: Optional[datetime] = None,
        name: Optional[str] = None,
        priority: JobPriority = JobPriority.NORMAL,
        timeout: Optional[float] = None,
        max_retries: int = 3,
        tags: Optional[List[str]] = None,
        **kwargs,
    ) -> Job:
        """Schedule one-time job."""
        if at:
            scheduled_at = at.timestamp()
        else:
            scheduled_at = time.time() + delay

        job = Job(
            id=str(uuid.uuid4()),
            name=name or func.__name__,
            func=func,
            args=args,
            kwargs=kwargs,
            priority=priority,
            scheduled_at=scheduled_at,
            status=JobStatus.SCHEDULED,
            timeout=timeout,
            max_retries=max_retries,
            tags=tags or [],
        )

        with self._lock:
            self._jobs[job.id] = job
            self._queue.push(job)
            self._stats["total_scheduled"] += 1

        return job

    def every(self, interval: int) -> "IntervalBuilder":
        """Start building interval schedule."""
        return IntervalBuilder(self, interval)

    def cron(
        self,
        expression: str,
        func: Callable[..., Awaitable[Any]],
        *args,
        name: Optional[str] = None,
        priority: JobPriority = JobPriority.NORMAL,
        timeout: Optional[float] = None,
        tags: Optional[List[str]] = None,
        **kwargs,
    ) -> str:
        """Schedule cron job."""
        schedule_id = str(uuid.uuid4())
        next_run = CronParser.get_next_run(expression)

        schedule = Schedule(
            type="cron",
            value=expression,
            next_run=next_run.timestamp(),
        )

        job = Job(
            id=schedule_id,
            name=name or func.__name__,
            func=func,
            args=args,
            kwargs=kwargs,
            priority=priority,
            scheduled_at=next_run.timestamp(),
            status=JobStatus.SCHEDULED,
            timeout=timeout,
            tags=tags or [],
        )

        with self._lock:
            self._schedules[schedule_id] = schedule
            self._jobs[job.id] = job
            self._queue.push(job)
            self._stats["total_scheduled"] += 1

        return schedule_id

    async def start(self) -> None:
        """Start the scheduler."""
        self._running = True
        asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False

    async def _run_loop(self) -> None:
        """Main scheduler loop."""
        while self._running:
            now = time.time()
            job = self._queue.peek()

            if job and (job.scheduled_at or 0) <= now:
                job = self._queue.pop()
                if job:
                    asyncio.create_task(self._execute_job(job))
            else:
                await asyncio.sleep(0.1)

    async def _execute_job(self, job: Job) -> None:
        """Execute a job."""
        async with self._semaphore:
            job.status = JobStatus.RUNNING
            job.started_at = time.time()
            self._stats["total_executed"] += 1

            try:
                if job.timeout:
                    result = await asyncio.wait_for(
                        job.func(*job.args, **job.kwargs),
                        timeout=job.timeout,
                    )
                else:
                    result = await job.func(*job.args, **job.kwargs)

                job.status = JobStatus.COMPLETED
                job.result = result
                job.completed_at = time.time()
                self._stats["successful"] += 1

            except Exception as e:
                job.error = str(e)

                if job.retries < job.max_retries:
                    job.retries += 1
                    job.status = JobStatus.RETRYING
                    job.scheduled_at = time.time() + (job.retry_delay * job.retries)
                    self._queue.push(job)
                    self._stats["retried"] += 1
                else:
                    job.status = JobStatus.FAILED
                    job.completed_at = time.time()
                    self._stats["failed"] += 1

            # Reschedule if recurring
            if job.id in self._schedules:
                await self._reschedule(job.id)

    async def _reschedule(self, schedule_id: str) -> None:
        """Reschedule a recurring job."""
        schedule = self._schedules.get(schedule_id)
        old_job = self._jobs.get(schedule_id)

        if not schedule or not old_job:
            return

        if schedule.type == "cron":
            next_run = CronParser.get_next_run(schedule.value)
            scheduled_at = next_run.timestamp()
        elif schedule.type == "interval":
            scheduled_at = time.time() + schedule.value
        else:
            return

        schedule.last_run = time.time()
        schedule.next_run = scheduled_at

        new_job = Job(
            id=schedule_id,
            name=old_job.name,
            func=old_job.func,
            args=old_job.args,
            kwargs=old_job.kwargs,
            priority=old_job.priority,
            scheduled_at=scheduled_at,
            status=JobStatus.SCHEDULED,
            timeout=old_job.timeout,
            max_retries=old_job.max_retries,
            tags=old_job.tags,
        )

        with self._lock:
            self._jobs[new_job.id] = new_job
            self._queue.push(new_job)
            self._stats["total_scheduled"] += 1

    def cancel(self, job_id: str) -> bool:
        """Cancel a scheduled job."""
        job = self._jobs.get(job_id)
        if job and job.status == JobStatus.SCHEDULED:
            job.status = JobStatus.CANCELLED
            return True
        return False

    def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID."""
        return self._jobs.get(job_id)

    def get_jobs(
        self,
        status: Optional[JobStatus] = None,
        tag: Optional[str] = None,
        limit: int = 100,
    ) -> List[Job]:
        """Get jobs with filters."""
        jobs = list(self._jobs.values())

        if status:
            jobs = [j for j in jobs if j.status == status]
        if tag:
            jobs = [j for j in jobs if tag in j.tags]

        jobs.sort(key=lambda j: j.scheduled_at or 0)
        return jobs[:limit]

    def get_stats(self) -> dict:
        """Get scheduler statistics."""
        return {
            **self._stats,
            "queued_jobs": len(self._queue),
            "total_jobs": len(self._jobs),
            "active_schedules": len(self._schedules),
        }


class IntervalBuilder:
    """Builder for interval-based schedules."""

    def __init__(self, scheduler: JobScheduler, interval: int):
        """Initialize builder."""
        self._scheduler = scheduler
        self._interval = interval
        self._unit = "seconds"

    @property
    def seconds(self) -> "IntervalBuilder":
        """Set unit to seconds."""
        self._unit = "seconds"
        return self

    @property
    def minutes(self) -> "IntervalBuilder":
        """Set unit to minutes."""
        self._unit = "minutes"
        return self

    @property
    def hours(self) -> "IntervalBuilder":
        """Set unit to hours."""
        self._unit = "hours"
        return self

    @property
    def days(self) -> "IntervalBuilder":
        """Set unit to days."""
        self._unit = "days"
        return self

    def do(
        self,
        func: Callable[..., Awaitable[Any]],
        *args,
        name: Optional[str] = None,
        priority: JobPriority = JobPriority.NORMAL,
        timeout: Optional[float] = None,
        tags: Optional[List[str]] = None,
        **kwargs,
    ) -> str:
        """Schedule the job."""
        multipliers = {
            "seconds": 1,
            "minutes": 60,
            "hours": 3600,
            "days": 86400,
        }
        interval_seconds = self._interval * multipliers[self._unit]

        schedule_id = str(uuid.uuid4())
        schedule = Schedule(
            type="interval",
            value=interval_seconds,
            next_run=time.time() + interval_seconds,
        )

        job = Job(
            id=schedule_id,
            name=name or func.__name__,
            func=func,
            args=args,
            kwargs=kwargs,
            priority=priority,
            scheduled_at=time.time() + interval_seconds,
            status=JobStatus.SCHEDULED,
            timeout=timeout,
            tags=tags or [],
        )

        with self._scheduler._lock:
            self._scheduler._schedules[schedule_id] = schedule
            self._scheduler._jobs[job.id] = job
            self._scheduler._queue.push(job)
            self._scheduler._stats["total_scheduled"] += 1

        return schedule_id


# Singleton instance
job_scheduler = JobScheduler()


# Convenience functions
def schedule_once(
    func: Callable[..., Awaitable[Any]],
    *args,
    delay: float = 0,
    **kwargs,
) -> Job:
    """Schedule one-time job on global scheduler."""
    return job_scheduler.once(func, *args, delay=delay, **kwargs)


def schedule_cron(
    expression: str,
    func: Callable[..., Awaitable[Any]],
    *args,
    **kwargs,
) -> str:
    """Schedule cron job on global scheduler."""
    return job_scheduler.cron(expression, func, *args, **kwargs)
