"""
Job Queue - Sprint 625

Background job processing system.

Features:
- Job scheduling
- Priority queues
- Retry with backoff
- Job dependencies
- Dead letter queue
- Worker pool
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Awaitable
from enum import Enum
from threading import Lock
from heapq import heappush, heappop
from collections import deque


class JobStatus(str, Enum):
    """Job status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    DEAD = "dead"
    CANCELLED = "cancelled"


class JobPriority(int, Enum):
    """Job priority levels."""
    CRITICAL = 0
    HIGH = 1
    NORMAL = 2
    LOW = 3
    BACKGROUND = 4


@dataclass
class Job:
    """A job in the queue."""
    id: str
    name: str
    handler: str
    payload: Dict[str, Any]
    priority: JobPriority = JobPriority.NORMAL
    status: JobStatus = JobStatus.PENDING
    max_retries: int = 3
    retry_count: int = 0
    retry_delay: float = 1.0
    timeout: float = 300.0
    depends_on: List[str] = field(default_factory=list)
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    scheduled_for: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "handler": self.handler,
            "payload": self.payload,
            "priority": self.priority.name,
            "status": self.status.value,
            "max_retries": self.max_retries,
            "retry_count": self.retry_count,
            "timeout": self.timeout,
            "depends_on": self.depends_on,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "scheduled_for": self.scheduled_for,
        }

    def __lt__(self, other):
        """For priority queue comparison."""
        if self.priority != other.priority:
            return self.priority.value < other.priority.value
        return self.created_at < other.created_at


JobHandler = Callable[[Dict[str, Any]], Awaitable[Any]]


class JobQueue:
    """Job queue system.

    Usage:
        queue = JobQueue()

        # Register a handler
        @queue.handler("send_email")
        async def send_email(payload):
            # Send email logic
            return {"sent": True}

        # Enqueue a job
        job_id = await queue.enqueue(
            "send_email",
            payload={"to": "user@example.com"},
            priority=JobPriority.HIGH
        )

        # Start processing
        await queue.start_workers(num_workers=3)

        # Get job status
        job = queue.get_job(job_id)
    """

    def __init__(self, max_jobs: int = 10000):
        """Initialize job queue.

        Args:
            max_jobs: Maximum jobs to store
        """
        self._handlers: Dict[str, JobHandler] = {}
        self._jobs: Dict[str, Job] = {}
        self._queue: List[Job] = []
        self._dead_letter: deque = deque(maxlen=1000)
        self._lock = Lock()
        self._max_jobs = max_jobs
        self._workers: List[asyncio.Task] = []
        self._running = False
        self._processing = 0

    def handler(self, name: str):
        """Decorator to register a job handler.

        Args:
            name: Handler name
        """
        def decorator(func: JobHandler):
            self._handlers[name] = func
            return func
        return decorator

    def register_handler(self, name: str, handler: JobHandler):
        """Register a job handler.

        Args:
            name: Handler name
            handler: Handler function
        """
        self._handlers[name] = handler

    async def enqueue(
        self,
        handler: str,
        payload: Optional[Dict[str, Any]] = None,
        name: Optional[str] = None,
        priority: JobPriority = JobPriority.NORMAL,
        max_retries: int = 3,
        retry_delay: float = 1.0,
        timeout: float = 300.0,
        depends_on: Optional[List[str]] = None,
        delay: Optional[float] = None
    ) -> str:
        """Enqueue a job.

        Args:
            handler: Handler name
            payload: Job payload
            name: Optional job name
            priority: Job priority
            max_retries: Maximum retries
            retry_delay: Delay between retries
            timeout: Job timeout
            depends_on: Job IDs this job depends on
            delay: Delay before processing (seconds)

        Returns:
            Job ID
        """
        job_id = str(uuid.uuid4())[:12]

        job = Job(
            id=job_id,
            name=name or handler,
            handler=handler,
            payload=payload or {},
            priority=priority,
            max_retries=max_retries,
            retry_delay=retry_delay,
            timeout=timeout,
            depends_on=depends_on or [],
            scheduled_for=time.time() + delay if delay else None,
        )

        with self._lock:
            # Enforce max jobs
            if len(self._jobs) >= self._max_jobs:
                self._cleanup_completed()

            self._jobs[job_id] = job
            heappush(self._queue, job)

        return job_id

    async def enqueue_batch(
        self,
        jobs: List[Dict[str, Any]]
    ) -> List[str]:
        """Enqueue multiple jobs.

        Args:
            jobs: List of job configs

        Returns:
            List of job IDs
        """
        job_ids = []
        for job_config in jobs:
            job_id = await self.enqueue(**job_config)
            job_ids.append(job_id)
        return job_ids

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job by ID.

        Args:
            job_id: Job ID

        Returns:
            Job dict or None
        """
        with self._lock:
            job = self._jobs.get(job_id)
            return job.to_dict() if job else None

    def get_jobs(
        self,
        status: Optional[JobStatus] = None,
        handler: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get jobs with filters.

        Args:
            status: Filter by status
            handler: Filter by handler
            limit: Maximum results

        Returns:
            List of jobs
        """
        with self._lock:
            jobs = list(self._jobs.values())

        if status:
            jobs = [j for j in jobs if j.status == status]
        if handler:
            jobs = [j for j in jobs if j.handler == handler]

        jobs.sort(key=lambda j: j.created_at, reverse=True)
        return [j.to_dict() for j in jobs[:limit]]

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending job.

        Args:
            job_id: Job ID

        Returns:
            True if cancelled
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False

            if job.status not in (JobStatus.PENDING, JobStatus.RETRYING):
                return False

            job.status = JobStatus.CANCELLED
            job.completed_at = time.time()
            return True

    async def retry_job(self, job_id: str) -> bool:
        """Manually retry a failed job.

        Args:
            job_id: Job ID

        Returns:
            True if retried
        """
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False

            if job.status not in (JobStatus.FAILED, JobStatus.DEAD):
                return False

            job.status = JobStatus.PENDING
            job.retry_count = 0
            job.error = None
            heappush(self._queue, job)
            return True

    async def start_workers(self, num_workers: int = 3):
        """Start worker pool.

        Args:
            num_workers: Number of workers
        """
        if self._running:
            return

        self._running = True

        for i in range(num_workers):
            worker = asyncio.create_task(self._worker_loop(i))
            self._workers.append(worker)

    async def stop_workers(self, wait: bool = True):
        """Stop all workers.

        Args:
            wait: Wait for current jobs to finish
        """
        self._running = False

        if wait:
            while self._processing > 0:
                await asyncio.sleep(0.1)

        for worker in self._workers:
            worker.cancel()
            try:
                await worker
            except asyncio.CancelledError:
                pass

        self._workers.clear()

    async def _worker_loop(self, worker_id: int):
        """Worker processing loop.

        Args:
            worker_id: Worker identifier
        """
        while self._running:
            job = self._get_next_job()

            if not job:
                await asyncio.sleep(0.1)
                continue

            await self._process_job(job, worker_id)

    def _get_next_job(self) -> Optional[Job]:
        """Get next job to process.

        Returns:
            Next job or None
        """
        with self._lock:
            while self._queue:
                job = heappop(self._queue)

                # Skip cancelled/completed jobs
                if job.status in (JobStatus.CANCELLED, JobStatus.COMPLETED, JobStatus.DEAD):
                    continue

                # Check scheduled time
                if job.scheduled_for and time.time() < job.scheduled_for:
                    heappush(self._queue, job)
                    return None

                # Check dependencies
                if not self._dependencies_met(job):
                    heappush(self._queue, job)
                    return None

                return job

        return None

    def _dependencies_met(self, job: Job) -> bool:
        """Check if job dependencies are met.

        Args:
            job: Job to check

        Returns:
            True if all dependencies completed
        """
        for dep_id in job.depends_on:
            dep = self._jobs.get(dep_id)
            if not dep or dep.status != JobStatus.COMPLETED:
                return False
        return True

    async def _process_job(self, job: Job, worker_id: int):
        """Process a single job.

        Args:
            job: Job to process
            worker_id: Worker identifier
        """
        handler = self._handlers.get(job.handler)
        if not handler:
            job.status = JobStatus.FAILED
            job.error = f"Handler not found: {job.handler}"
            job.completed_at = time.time()
            return

        with self._lock:
            job.status = JobStatus.RUNNING
            job.started_at = time.time()
            self._processing += 1

        try:
            result = await asyncio.wait_for(
                handler(job.payload),
                timeout=job.timeout
            )

            with self._lock:
                job.status = JobStatus.COMPLETED
                job.result = result
                job.completed_at = time.time()

        except asyncio.TimeoutError:
            await self._handle_failure(job, "Job timed out")

        except Exception as e:
            await self._handle_failure(job, str(e))

        finally:
            with self._lock:
                self._processing -= 1

    async def _handle_failure(self, job: Job, error: str):
        """Handle job failure.

        Args:
            job: Failed job
            error: Error message
        """
        with self._lock:
            job.error = error
            job.retry_count += 1

            if job.retry_count >= job.max_retries:
                job.status = JobStatus.DEAD
                job.completed_at = time.time()
                self._dead_letter.append(job.to_dict())
            else:
                job.status = JobStatus.RETRYING
                job.scheduled_for = time.time() + (job.retry_delay * (2 ** job.retry_count))
                heappush(self._queue, job)

    def _cleanup_completed(self):
        """Remove old completed jobs."""
        cutoff = time.time() - 3600  # 1 hour

        to_remove = [
            job_id for job_id, job in self._jobs.items()
            if job.status in (JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.DEAD)
            and job.completed_at and job.completed_at < cutoff
        ]

        for job_id in to_remove:
            del self._jobs[job_id]

    def get_dead_letter_jobs(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get dead letter queue jobs.

        Args:
            limit: Maximum results

        Returns:
            List of dead jobs
        """
        with self._lock:
            jobs = list(self._dead_letter)
        return jobs[-limit:]

    def clear_dead_letter(self) -> int:
        """Clear dead letter queue.

        Returns:
            Number cleared
        """
        with self._lock:
            count = len(self._dead_letter)
            self._dead_letter.clear()
        return count

    def get_stats(self) -> Dict[str, Any]:
        """Get queue statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            jobs = list(self._jobs.values())

        by_status = {}
        for status in JobStatus:
            by_status[status.value] = len([j for j in jobs if j.status == status])

        by_handler = {}
        for job in jobs:
            by_handler[job.handler] = by_handler.get(job.handler, 0) + 1

        return {
            "total_jobs": len(jobs),
            "queue_size": len(self._queue),
            "processing": self._processing,
            "workers": len(self._workers),
            "running": self._running,
            "by_status": by_status,
            "by_handler": by_handler,
            "dead_letter_count": len(self._dead_letter),
            "registered_handlers": list(self._handlers.keys()),
        }

    def purge_queue(self, status: Optional[JobStatus] = None) -> int:
        """Purge jobs from queue.

        Args:
            status: Only purge jobs with this status

        Returns:
            Number purged
        """
        with self._lock:
            if status:
                to_remove = [
                    job_id for job_id, job in self._jobs.items()
                    if job.status == status
                ]
            else:
                to_remove = [
                    job_id for job_id, job in self._jobs.items()
                    if job.status in (JobStatus.COMPLETED, JobStatus.CANCELLED)
                ]

            for job_id in to_remove:
                del self._jobs[job_id]

            return len(to_remove)


# Singleton instance
job_queue = JobQueue()


# Built-in test handlers
@job_queue.handler("echo")
async def echo_handler(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Echo handler for testing."""
    return {"echoed": payload}


@job_queue.handler("delay")
async def delay_handler(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Delay handler for testing."""
    delay = payload.get("seconds", 1)
    await asyncio.sleep(delay)
    return {"delayed": delay}
