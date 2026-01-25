"""
Job Queue - Sprint 645

Background job processing system.

Features:
- Priority queues
- Job scheduling
- Retry with backoff
- Job dependencies
- Dead letter queue
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Awaitable
from enum import Enum
from threading import Lock


class JobStatus(str, Enum):
    """Job status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    RETRYING = "retrying"
    CANCELLED = "cancelled"
    DEAD = "dead"


class JobPriority(int, Enum):
    """Job priority levels."""
    LOW = 1
    NORMAL = 5
    HIGH = 10
    CRITICAL = 20


@dataclass
class JobResult:
    """Result of job execution."""
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: float = 0


@dataclass
class Job:
    """Job to be processed."""
    id: str
    name: str
    payload: Dict[str, Any]
    priority: JobPriority = JobPriority.NORMAL
    status: JobStatus = JobStatus.PENDING
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    attempts: int = 0
    max_attempts: int = 3
    result: Optional[JobResult] = None
    error: Optional[str] = None
    depends_on: List[str] = field(default_factory=list)
    timeout: float = 300
    delay: float = 0

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "payload": self.payload,
            "priority": self.priority.value,
            "status": self.status.value,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "attempts": self.attempts,
            "max_attempts": self.max_attempts,
            "error": self.error,
            "depends_on": self.depends_on,
        }


@dataclass
class QueueStats:
    """Queue statistics."""
    pending: int = 0
    running: int = 0
    completed: int = 0
    failed: int = 0
    dead: int = 0
    total_processed: int = 0


JobHandler = Callable[[Job], Awaitable[JobResult]]


class JobQueue:
    """Background job processing system.

    Usage:
        queue = JobQueue()

        @queue.handler("send_email")
        async def send_email(job):
            return JobResult(success=True)

        job_id = queue.enqueue("send_email", {"to": "user@example.com"})
        await queue.start()
    """

    def __init__(self, concurrency: int = 5):
        """Initialize job queue."""
        self._handlers: Dict[str, JobHandler] = {}
        self._jobs: Dict[str, Job] = {}
        self._pending: List[str] = []
        self._running: Dict[str, asyncio.Task] = {}
        self._dead_letter: List[Job] = []
        self._lock = Lock()
        self._concurrency = concurrency
        self._running_flag = False
        self._durations: List[float] = []
        self._stats = QueueStats()

    def handler(self, name: str):
        """Decorator to register job handler."""
        def decorator(func: JobHandler) -> JobHandler:
            self._handlers[name] = func
            return func
        return decorator

    def register_handler(self, name: str, handler: JobHandler):
        """Register job handler."""
        self._handlers[name] = handler

    def enqueue(
        self,
        name: str,
        payload: Dict[str, Any],
        priority: JobPriority = JobPriority.NORMAL,
        max_attempts: int = 3,
        depends_on: Optional[List[str]] = None,
        delay: float = 0,
        timeout: float = 300,
    ) -> str:
        """Enqueue a job."""
        job_id = str(uuid.uuid4())[:8]

        job = Job(
            id=job_id,
            name=name,
            payload=payload,
            priority=priority,
            max_attempts=max_attempts,
            depends_on=depends_on or [],
            delay=delay,
            timeout=timeout,
        )

        with self._lock:
            self._jobs[job_id] = job
            self._add_to_pending(job_id)
            self._stats.pending += 1

        return job_id

    def _add_to_pending(self, job_id: str):
        """Add job to pending queue sorted by priority."""
        job = self._jobs[job_id]
        insert_pos = 0
        for i, pending_id in enumerate(self._pending):
            pending_job = self._jobs.get(pending_id)
            if pending_job and pending_job.priority.value < job.priority.value:
                break
            insert_pos = i + 1
        self._pending.insert(insert_pos, job_id)

    def cancel(self, job_id: str) -> bool:
        """Cancel a job."""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False

            if job.status == JobStatus.PENDING:
                job.status = JobStatus.CANCELLED
                if job_id in self._pending:
                    self._pending.remove(job_id)
                    self._stats.pending -= 1
                return True

            if job.status == JobStatus.RUNNING:
                task = self._running.get(job_id)
                if task:
                    task.cancel()
                    job.status = JobStatus.CANCELLED
                    return True
        return False

    def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID."""
        return self._jobs.get(job_id)

    def _can_run_job(self, job: Job) -> bool:
        """Check if job can run."""
        for dep_id in job.depends_on:
            dep_job = self._jobs.get(dep_id)
            if not dep_job or dep_job.status != JobStatus.COMPLETED:
                return False
        if job.delay > 0 and time.time() < job.created_at + job.delay:
            return False
        return True

    async def _process_job(self, job: Job):
        """Process a single job."""
        handler = self._handlers.get(job.name)
        if not handler:
            job.status = JobStatus.FAILED
            job.error = f"No handler for job: {job.name}"
            return

        job.status = JobStatus.RUNNING
        job.started_at = time.time()
        job.attempts += 1

        with self._lock:
            self._stats.pending -= 1
            self._stats.running += 1

        try:
            result = await asyncio.wait_for(handler(job), timeout=job.timeout)
            job.result = result
            job.completed_at = time.time()
            duration = (job.completed_at - job.started_at) * 1000

            if result.success:
                job.status = JobStatus.COMPLETED
                with self._lock:
                    self._stats.completed += 1
                    self._stats.total_processed += 1
                    self._durations.append(duration)
                    if len(self._durations) > 1000:
                        self._durations = self._durations[-500:]
            else:
                job.error = result.error
                await self._handle_failure(job)

        except asyncio.TimeoutError:
            job.error = f"Job timed out after {job.timeout}s"
            await self._handle_failure(job)
        except asyncio.CancelledError:
            job.status = JobStatus.CANCELLED
            with self._lock:
                self._stats.running -= 1
        except Exception as e:
            job.error = str(e)
            await self._handle_failure(job)
        finally:
            with self._lock:
                if job.status == JobStatus.RUNNING:
                    self._stats.running -= 1
                if job.id in self._running:
                    del self._running[job.id]

    async def _handle_failure(self, job: Job):
        """Handle job failure with retry logic."""
        with self._lock:
            self._stats.running -= 1
            if job.attempts < job.max_attempts:
                job.status = JobStatus.RETRYING
                delay = min(2 ** job.attempts, 60)
                job.delay = delay
                job.created_at = time.time()
                self._add_to_pending(job.id)
                self._stats.pending += 1
            else:
                job.status = JobStatus.DEAD
                self._dead_letter.append(job)
                self._stats.failed += 1
                self._stats.dead += 1
                if len(self._dead_letter) > 1000:
                    self._dead_letter = self._dead_letter[-500:]

    async def _worker(self):
        """Worker loop to process jobs."""
        while self._running_flag:
            job_to_run: Optional[Job] = None
            with self._lock:
                for job_id in list(self._pending):
                    job = self._jobs.get(job_id)
                    if job and self._can_run_job(job):
                        job_to_run = job
                        self._pending.remove(job_id)
                        break

            if job_to_run:
                task = asyncio.create_task(self._process_job(job_to_run))
                with self._lock:
                    self._running[job_to_run.id] = task
            else:
                await asyncio.sleep(0.1)

    async def start(self):
        """Start processing jobs."""
        if self._running_flag:
            return
        self._running_flag = True
        workers = [asyncio.create_task(self._worker()) for _ in range(self._concurrency)]
        await asyncio.gather(*workers, return_exceptions=True)

    async def stop(self, wait: bool = True):
        """Stop processing jobs."""
        self._running_flag = False
        if wait:
            tasks = list(self._running.values())
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    def get_stats(self) -> Dict[str, Any]:
        """Get queue statistics."""
        with self._lock:
            avg_duration = sum(self._durations) / len(self._durations) if self._durations else 0
            return {
                "pending": self._stats.pending,
                "running": self._stats.running,
                "completed": self._stats.completed,
                "failed": self._stats.failed,
                "dead": self._stats.dead,
                "total_processed": self._stats.total_processed,
                "avg_duration_ms": round(avg_duration, 2),
                "handlers": list(self._handlers.keys()),
                "concurrency": self._concurrency,
            }

    def get_dead_letter_jobs(self, limit: int = 50) -> List[dict]:
        """Get dead letter jobs."""
        with self._lock:
            return [job.to_dict() for job in self._dead_letter[-limit:]]

    def retry_dead_letter(self, job_id: str) -> bool:
        """Retry a dead letter job."""
        with self._lock:
            for i, job in enumerate(self._dead_letter):
                if job.id == job_id:
                    job.status = JobStatus.PENDING
                    job.attempts = 0
                    job.error = None
                    job.delay = 0
                    job.created_at = time.time()
                    self._dead_letter.pop(i)
                    self._add_to_pending(job_id)
                    self._stats.dead -= 1
                    self._stats.pending += 1
                    return True
        return False

    def clear_dead_letter(self) -> int:
        """Clear all dead letter jobs."""
        with self._lock:
            count = len(self._dead_letter)
            self._dead_letter.clear()
            self._stats.dead = 0
            return count

    def list_jobs(self, status: Optional[JobStatus] = None, limit: int = 50) -> List[dict]:
        """List jobs."""
        with self._lock:
            jobs = list(self._jobs.values())
            if status:
                jobs = [j for j in jobs if j.status == status]
            jobs.sort(key=lambda j: j.created_at, reverse=True)
            return [j.to_dict() for j in jobs[:limit]]


# Singleton instance
job_queue = JobQueue(concurrency=5)


@job_queue.handler("send_notification")
async def handle_send_notification(job: Job) -> JobResult:
    """Handle sending notifications."""
    await asyncio.sleep(0.1)
    return JobResult(success=True, data={"sent": True, "to": job.payload.get("user_id")})


@job_queue.handler("process_audio")
async def handle_process_audio(job: Job) -> JobResult:
    """Handle audio processing."""
    await asyncio.sleep(0.5)
    return JobResult(success=True, data={"processed": True})


@job_queue.handler("cleanup_sessions")
async def handle_cleanup_sessions(job: Job) -> JobResult:
    """Handle session cleanup."""
    await asyncio.sleep(0.2)
    return JobResult(success=True, data={"cleaned": 10})
