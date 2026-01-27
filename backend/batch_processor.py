"""
Batch Processor - Sprint 817

Batch processing and job management utilities.

Features:
- Batch item processing with parallel execution
- Progress tracking and callbacks
- Error handling and retry
- Rate limiting
- Chunking strategies
- Result aggregation
"""

import asyncio
import concurrent.futures
import threading
import time
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import (
    Any, Callable, Dict, Generic, Iterable, Iterator, List, Optional, Set,
    Tuple, TypeVar, Union
)

T = TypeVar("T")
R = TypeVar("R")


class JobStatus(str, Enum):
    """Job execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class BatchStrategy(str, Enum):
    """Batch processing strategy."""
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    CHUNKED = "chunked"


@dataclass
class ItemResult(Generic[T, R]):
    """Result of processing a single item."""
    item: T
    result: Optional[R] = None
    error: Optional[Exception] = None
    duration_ms: float = 0.0
    retries: int = 0

    @property
    def success(self) -> bool:
        return self.error is None


@dataclass
class BatchResult(Generic[T, R]):
    """Result of batch processing."""
    total_items: int
    processed: int
    succeeded: int
    failed: int
    duration_ms: float
    items: List[ItemResult[T, R]] = field(default_factory=list)
    errors: List[Tuple[T, Exception]] = field(default_factory=list)

    @property
    def success_rate(self) -> float:
        if self.total_items == 0:
            return 0.0
        return self.succeeded / self.total_items

    def get_successful(self) -> List[R]:
        """Get successful results."""
        return [item.result for item in self.items if item.success and item.result is not None]

    def get_failed(self) -> List[T]:
        """Get failed items."""
        return [item.item for item in self.items if not item.success]


@dataclass
class BatchProgress:
    """Progress information for batch processing."""
    total: int
    processed: int
    succeeded: int
    failed: int
    current_item: Optional[Any] = None
    eta_seconds: Optional[float] = None
    items_per_second: float = 0.0

    @property
    def percent_complete(self) -> float:
        if self.total == 0:
            return 0.0
        return (self.processed / self.total) * 100


class ProgressCallback(ABC):
    """Abstract progress callback."""

    @abstractmethod
    def on_progress(self, progress: BatchProgress) -> None:
        """Called on progress update."""
        pass

    def on_item_complete(self, item: Any, result: ItemResult) -> None:
        """Called when an item is processed."""
        pass

    def on_batch_complete(self, result: BatchResult) -> None:
        """Called when batch is complete."""
        pass


class ConsoleProgressCallback(ProgressCallback):
    """Print progress to console."""

    def __init__(self, update_interval: float = 1.0):
        self.update_interval = update_interval
        self._last_update = 0.0

    def on_progress(self, progress: BatchProgress) -> None:
        now = time.time()
        if now - self._last_update >= self.update_interval:
            eta = f"{progress.eta_seconds:.0f}s" if progress.eta_seconds else "?"
            print(
                f"Progress: {progress.processed}/{progress.total} "
                f"({progress.percent_complete:.1f}%) - "
                f"Success: {progress.succeeded}, Failed: {progress.failed} - "
                f"ETA: {eta}"
            )
            self._last_update = now

    def on_batch_complete(self, result: BatchResult) -> None:
        print(
            f"Batch complete: {result.succeeded}/{result.total_items} succeeded "
            f"({result.success_rate * 100:.1f}%) in {result.duration_ms:.0f}ms"
        )


class BatchProcessor(Generic[T, R]):
    """Process items in batches.

    Usage:
        processor = BatchProcessor(
            process_fn=lambda x: x * 2,
            max_workers=4,
            retry_count=3,
        )

        items = [1, 2, 3, 4, 5]
        result = processor.process(items)

        for r in result.get_successful():
            print(r)
    """

    def __init__(
        self,
        process_fn: Callable[[T], R],
        max_workers: int = 4,
        strategy: BatchStrategy = BatchStrategy.PARALLEL,
        retry_count: int = 0,
        retry_delay: float = 1.0,
        rate_limit: Optional[float] = None,
        timeout: Optional[float] = None,
        progress_callback: Optional[ProgressCallback] = None,
    ):
        self.process_fn = process_fn
        self.max_workers = max_workers
        self.strategy = strategy
        self.retry_count = retry_count
        self.retry_delay = retry_delay
        self.rate_limit = rate_limit
        self.timeout = timeout
        self.progress_callback = progress_callback

        self._cancelled = False
        self._paused = False
        self._lock = threading.Lock()
        self._last_process_time = 0.0

    def process(self, items: List[T]) -> BatchResult[T, R]:
        """Process a list of items."""
        self._cancelled = False
        self._paused = False

        start_time = time.time()
        results: List[ItemResult[T, R]] = []
        errors: List[Tuple[T, Exception]] = []

        if self.strategy == BatchStrategy.SEQUENTIAL:
            results = self._process_sequential(items)
        elif self.strategy == BatchStrategy.PARALLEL:
            results = self._process_parallel(items)
        elif self.strategy == BatchStrategy.CHUNKED:
            results = self._process_chunked(items)

        # Collect errors
        for r in results:
            if not r.success:
                errors.append((r.item, r.error))

        duration = (time.time() - start_time) * 1000
        succeeded = sum(1 for r in results if r.success)

        result = BatchResult(
            total_items=len(items),
            processed=len(results),
            succeeded=succeeded,
            failed=len(results) - succeeded,
            duration_ms=duration,
            items=results,
            errors=errors,
        )

        if self.progress_callback:
            self.progress_callback.on_batch_complete(result)

        return result

    def _process_sequential(self, items: List[T]) -> List[ItemResult[T, R]]:
        """Process items sequentially."""
        results = []
        start_time = time.time()

        for i, item in enumerate(items):
            if self._cancelled:
                break

            while self._paused:
                time.sleep(0.1)
                if self._cancelled:
                    break

            result = self._process_item(item)
            results.append(result)
            self._update_progress(items, results, start_time)

        return results

    def _process_parallel(self, items: List[T]) -> List[ItemResult[T, R]]:
        """Process items in parallel using thread pool."""
        results: List[ItemResult[T, R]] = []
        start_time = time.time()

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {
                executor.submit(self._process_item, item): item
                for item in items
            }

            for future in concurrent.futures.as_completed(futures):
                if self._cancelled:
                    for f in futures:
                        f.cancel()
                    break

                result = future.result()
                results.append(result)
                self._update_progress(items, results, start_time)

        return results

    def _process_chunked(
        self,
        items: List[T],
        chunk_size: int = 100,
    ) -> List[ItemResult[T, R]]:
        """Process items in chunks."""
        results = []
        start_time = time.time()

        for chunk_start in range(0, len(items), chunk_size):
            if self._cancelled:
                break

            chunk = items[chunk_start : chunk_start + chunk_size]
            chunk_results = self._process_parallel(chunk)
            results.extend(chunk_results)
            self._update_progress(items, results, start_time)

        return results

    def _process_item(self, item: T) -> ItemResult[T, R]:
        """Process a single item with retry logic."""
        start_time = time.time()
        retries = 0
        last_error = None

        if self.rate_limit:
            with self._lock:
                elapsed = time.time() - self._last_process_time
                wait_time = (1.0 / self.rate_limit) - elapsed
                if wait_time > 0:
                    time.sleep(wait_time)
                self._last_process_time = time.time()

        while retries <= self.retry_count:
            try:
                if self.timeout:
                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                        future = executor.submit(self.process_fn, item)
                        result = future.result(timeout=self.timeout)
                else:
                    result = self.process_fn(item)

                duration = (time.time() - start_time) * 1000
                item_result = ItemResult(
                    item=item,
                    result=result,
                    duration_ms=duration,
                    retries=retries,
                )

                if self.progress_callback:
                    self.progress_callback.on_item_complete(item, item_result)

                return item_result

            except Exception as e:
                last_error = e
                retries += 1
                if retries <= self.retry_count:
                    time.sleep(self.retry_delay * retries)

        duration = (time.time() - start_time) * 1000
        item_result = ItemResult(
            item=item,
            error=last_error,
            duration_ms=duration,
            retries=retries - 1,
        )

        if self.progress_callback:
            self.progress_callback.on_item_complete(item, item_result)

        return item_result

    def _update_progress(
        self,
        items: List[T],
        results: List[ItemResult[T, R]],
        start_time: float,
    ) -> None:
        """Update progress callback."""
        if not self.progress_callback:
            return

        elapsed = time.time() - start_time
        processed = len(results)
        succeeded = sum(1 for r in results if r.success)
        failed = processed - succeeded

        items_per_second = processed / elapsed if elapsed > 0 else 0
        remaining = len(items) - processed
        eta = remaining / items_per_second if items_per_second > 0 else None

        progress = BatchProgress(
            total=len(items),
            processed=processed,
            succeeded=succeeded,
            failed=failed,
            eta_seconds=eta,
            items_per_second=items_per_second,
        )

        self.progress_callback.on_progress(progress)

    def cancel(self) -> None:
        """Cancel batch processing."""
        self._cancelled = True

    def pause(self) -> None:
        """Pause batch processing."""
        self._paused = True

    def resume(self) -> None:
        """Resume batch processing."""
        self._paused = False


class AsyncBatchProcessor(Generic[T, R]):
    """Async batch processor."""

    def __init__(
        self,
        process_fn: Callable[[T], R],
        max_concurrency: int = 10,
        retry_count: int = 0,
        retry_delay: float = 1.0,
        rate_limit: Optional[float] = None,
        timeout: Optional[float] = None,
    ):
        self.process_fn = process_fn
        self.max_concurrency = max_concurrency
        self.retry_count = retry_count
        self.retry_delay = retry_delay
        self.rate_limit = rate_limit
        self.timeout = timeout
        self._cancelled = False
        self._semaphore: Optional[asyncio.Semaphore] = None
        self._rate_limiter: Optional[asyncio.Lock] = None
        self._last_process_time = 0.0

    async def process(self, items: List[T]) -> BatchResult[T, R]:
        """Process items asynchronously."""
        self._cancelled = False
        self._semaphore = asyncio.Semaphore(self.max_concurrency)
        self._rate_limiter = asyncio.Lock()

        start_time = time.time()
        results: List[ItemResult[T, R]] = []

        tasks = [self._process_item(item) for item in items]
        item_results = await asyncio.gather(*tasks, return_exceptions=True)

        for i, result in enumerate(item_results):
            if isinstance(result, Exception):
                results.append(ItemResult(item=items[i], error=result))
            else:
                results.append(result)

        duration = (time.time() - start_time) * 1000
        succeeded = sum(1 for r in results if r.success)
        errors = [(r.item, r.error) for r in results if not r.success]

        return BatchResult(
            total_items=len(items),
            processed=len(results),
            succeeded=succeeded,
            failed=len(results) - succeeded,
            duration_ms=duration,
            items=results,
            errors=errors,
        )

    async def _process_item(self, item: T) -> ItemResult[T, R]:
        """Process a single item."""
        async with self._semaphore:
            if self._cancelled:
                return ItemResult(item=item, error=Exception("Cancelled"))

            if self.rate_limit:
                async with self._rate_limiter:
                    elapsed = time.time() - self._last_process_time
                    wait_time = (1.0 / self.rate_limit) - elapsed
                    if wait_time > 0:
                        await asyncio.sleep(wait_time)
                    self._last_process_time = time.time()

            start_time = time.time()
            retries = 0
            last_error = None

            while retries <= self.retry_count:
                try:
                    if asyncio.iscoroutinefunction(self.process_fn):
                        if self.timeout:
                            result = await asyncio.wait_for(
                                self.process_fn(item), timeout=self.timeout
                            )
                        else:
                            result = await self.process_fn(item)
                    else:
                        result = self.process_fn(item)

                    duration = (time.time() - start_time) * 1000
                    return ItemResult(
                        item=item, result=result, duration_ms=duration, retries=retries
                    )

                except Exception as e:
                    last_error = e
                    retries += 1
                    if retries <= self.retry_count:
                        await asyncio.sleep(self.retry_delay * retries)

            duration = (time.time() - start_time) * 1000
            return ItemResult(
                item=item, error=last_error, duration_ms=duration, retries=retries - 1
            )

    def cancel(self) -> None:
        """Cancel processing."""
        self._cancelled = True


def chunk_iterator(items: Iterable[T], chunk_size: int) -> Iterator[List[T]]:
    """Iterate over items in chunks."""
    chunk = []
    for item in items:
        chunk.append(item)
        if len(chunk) >= chunk_size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


class BatchJob(Generic[T, R]):
    """A batch processing job with state."""

    def __init__(
        self,
        name: str,
        items: List[T],
        process_fn: Callable[[T], R],
        max_workers: int = 4,
        retry_count: int = 0,
    ):
        self.id = str(uuid.uuid4())
        self.name = name
        self.items = items
        self.process_fn = process_fn
        self.max_workers = max_workers
        self.retry_count = retry_count
        self.status = JobStatus.PENDING
        self.created_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.result: Optional[BatchResult[T, R]] = None
        self.error: Optional[Exception] = None
        self._processor: Optional[BatchProcessor[T, R]] = None
        self._thread: Optional[threading.Thread] = None
        self._progress = BatchProgress(total=len(items), processed=0, succeeded=0, failed=0)

    @property
    def progress(self) -> BatchProgress:
        return self._progress

    @property
    def is_complete(self) -> bool:
        return self.status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED)

    def start(self) -> None:
        """Start the job in a background thread."""
        if self.status != JobStatus.PENDING:
            raise RuntimeError("Job already started")

        self.status = JobStatus.RUNNING
        self.started_at = datetime.now()

        class ProgressTracker(ProgressCallback):
            def __init__(self, job: "BatchJob"):
                self.job = job

            def on_progress(self, progress: BatchProgress) -> None:
                self.job._progress = progress

        self._processor = BatchProcessor(
            process_fn=self.process_fn,
            max_workers=self.max_workers,
            retry_count=self.retry_count,
            progress_callback=ProgressTracker(self),
        )

        def run():
            try:
                self.result = self._processor.process(self.items)
                self.status = JobStatus.COMPLETED
            except Exception as e:
                self.error = e
                self.status = JobStatus.FAILED
            finally:
                self.completed_at = datetime.now()

        self._thread = threading.Thread(target=run, daemon=True)
        self._thread.start()

    def wait(self, timeout: Optional[float] = None) -> BatchResult[T, R]:
        """Wait for job to complete."""
        if self._thread:
            self._thread.join(timeout)
        if not self.is_complete:
            raise TimeoutError("Job did not complete in time")
        if self.status == JobStatus.FAILED and self.error:
            raise self.error
        return self.result

    def cancel(self) -> None:
        """Cancel the job."""
        if self._processor:
            self._processor.cancel()
        self.status = JobStatus.CANCELLED
        self.completed_at = datetime.now()


class JobManager:
    """Manage multiple batch jobs."""

    def __init__(self, max_concurrent: int = 5):
        self.max_concurrent = max_concurrent
        self._jobs: Dict[str, BatchJob] = {}
        self._queue: List[str] = []
        self._running: Set[str] = set()
        self._lock = threading.Lock()
        self._manager_thread: Optional[threading.Thread] = None
        self._shutdown = False

    def submit(
        self, name: str, items: List[Any], process_fn: Callable, max_workers: int = 4
    ) -> BatchJob:
        """Submit a new batch job."""
        job = BatchJob(name=name, items=items, process_fn=process_fn, max_workers=max_workers)
        with self._lock:
            self._jobs[job.id] = job
            self._queue.append(job.id)
        self._ensure_manager_running()
        return job

    def _ensure_manager_running(self) -> None:
        if self._manager_thread is None or not self._manager_thread.is_alive():
            self._manager_thread = threading.Thread(target=self._manage_jobs, daemon=True)
            self._manager_thread.start()

    def _manage_jobs(self) -> None:
        while not self._shutdown:
            with self._lock:
                completed = {jid for jid in self._running if self._jobs[jid].is_complete}
                self._running -= completed
                while len(self._running) < self.max_concurrent and self._queue:
                    job_id = self._queue.pop(0)
                    self._jobs[job_id].start()
                    self._running.add(job_id)
            time.sleep(0.1)

    def get_job(self, job_id: str) -> Optional[BatchJob]:
        return self._jobs.get(job_id)

    def wait_all(self, timeout: Optional[float] = None) -> Dict[str, BatchResult]:
        start = time.time()
        while True:
            all_complete = all(job.is_complete for job in self._jobs.values())
            if all_complete:
                break
            if timeout and (time.time() - start) > timeout:
                raise TimeoutError("Not all jobs completed in time")
            time.sleep(0.1)
        return {jid: job.result for jid, job in self._jobs.items() if job.result}

    def shutdown(self, wait: bool = True) -> None:
        self._shutdown = True
        if wait:
            for job in self._jobs.values():
                if not job.is_complete:
                    job.cancel()


class BatchPipeline(Generic[T]):
    """Chain multiple processing steps."""

    def __init__(self):
        self._steps: List[Tuple[str, Callable]] = []

    def add_step(self, name: str, process_fn: Callable) -> "BatchPipeline[T]":
        self._steps.append((name, process_fn))
        return self

    def process(
        self, items: List[T], max_workers: int = 4, stop_on_error: bool = True
    ) -> Dict[str, BatchResult]:
        results = {}
        current_items = items

        for step_name, process_fn in self._steps:
            processor = BatchProcessor(process_fn=process_fn, max_workers=max_workers)
            result = processor.process(current_items)
            results[step_name] = result
            if stop_on_error and result.failed > 0:
                break
            current_items = result.get_successful()

        return results


def process_batch(
    items: List[T], process_fn: Callable[[T], R], max_workers: int = 4, retry_count: int = 0
) -> BatchResult[T, R]:
    """Simple batch processing function."""
    processor = BatchProcessor(
        process_fn=process_fn, max_workers=max_workers, retry_count=retry_count
    )
    return processor.process(items)


async def async_process_batch(
    items: List[T], process_fn: Callable[[T], R], max_concurrency: int = 10
) -> BatchResult[T, R]:
    """Simple async batch processing function."""
    processor = AsyncBatchProcessor(process_fn=process_fn, max_concurrency=max_concurrency)
    return await processor.process(items)
