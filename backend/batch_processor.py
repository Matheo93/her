"""
Batch Processor - Sprint 711

Efficient batch processing system.

Features:
- Configurable batch sizes
- Parallel processing
- Progress tracking
- Error handling
- Retry logic
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Iterator
)
from enum import Enum
import threading
from abc import ABC, abstractmethod
from concurrent.futures import ThreadPoolExecutor


T = TypeVar("T")
R = TypeVar("R")


class BatchStatus(str, Enum):
    """Batch job status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PARTIAL = "partial"


@dataclass
class BatchItem(Generic[T]):
    """Individual item in a batch."""
    id: str
    data: T
    status: BatchStatus = BatchStatus.PENDING
    result: Optional[Any] = None
    error: Optional[str] = None
    attempts: int = 0
    processed_at: Optional[float] = None


@dataclass
class BatchProgress:
    """Progress information for a batch."""
    total: int
    completed: int
    failed: int
    pending: int
    percentage: float
    elapsed_seconds: float
    estimated_remaining: float
    items_per_second: float

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "pending": self.pending,
            "percentage": round(self.percentage, 2),
            "elapsed_seconds": round(self.elapsed_seconds, 2),
            "estimated_remaining": round(self.estimated_remaining, 2),
            "items_per_second": round(self.items_per_second, 2),
        }


@dataclass
class BatchResult(Generic[T, R]):
    """Result of batch processing."""
    batch_id: str
    status: BatchStatus
    total: int
    successful: int
    failed: int
    results: List[R]
    errors: List[Dict[str, Any]]
    duration_seconds: float

    def success_rate(self) -> float:
        """Calculate success rate."""
        if self.total == 0:
            return 0.0
        return self.successful / self.total * 100

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "batch_id": self.batch_id,
            "status": self.status.value,
            "total": self.total,
            "successful": self.successful,
            "failed": self.failed,
            "success_rate": round(self.success_rate(), 2),
            "duration_seconds": round(self.duration_seconds, 2),
            "error_count": len(self.errors),
        }


@dataclass
class BatchConfig:
    """Configuration for batch processing."""
    batch_size: int = 100
    max_concurrent: int = 10
    max_retries: int = 3
    retry_delay: float = 1.0
    timeout: Optional[float] = None
    fail_fast: bool = False
    progress_callback: Optional[Callable[[BatchProgress], None]] = None


class BatchProcessor(Generic[T, R]):
    """Generic batch processor.

    Usage:
        processor = BatchProcessor(config=BatchConfig(batch_size=50))

        async def process_item(item: dict) -> dict:
            # Process single item
            return {"processed": True, **item}

        # Process items
        result = await processor.process(
            items=[{"id": i} for i in range(1000)],
            processor=process_item
        )

        print(f"Processed {result.successful} of {result.total}")
    """

    def __init__(self, config: Optional[BatchConfig] = None):
        """Initialize processor."""
        self._config = config or BatchConfig()
        self._current_batch_id: Optional[str] = None
        self._cancelled = False
        self._lock = threading.Lock()
        self._stats = {
            "total_processed": 0,
            "total_successful": 0,
            "total_failed": 0,
            "batches_run": 0,
        }

    async def process(
        self,
        items: List[T],
        processor: Callable[[T], Awaitable[R]],
        config: Optional[BatchConfig] = None,
    ) -> BatchResult[T, R]:
        """Process items in batches.

        Args:
            items: Items to process
            processor: Async function to process each item
            config: Optional config override

        Returns:
            BatchResult with results and statistics
        """
        cfg = config or self._config
        batch_id = str(uuid.uuid4())
        self._current_batch_id = batch_id
        self._cancelled = False

        start_time = time.time()
        results: List[R] = []
        errors: List[Dict[str, Any]] = []

        # Create batch items
        batch_items = [
            BatchItem(id=str(i), data=item)
            for i, item in enumerate(items)
        ]

        # Process in chunks
        chunks = list(self._chunk(batch_items, cfg.batch_size))
        completed = 0
        failed = 0

        for chunk_idx, chunk in enumerate(chunks):
            if self._cancelled:
                break

            # Process chunk concurrently
            chunk_results = await self._process_chunk(
                chunk, processor, cfg
            )

            for item, result, error in chunk_results:
                if error:
                    failed += 1
                    errors.append({
                        "item_id": item.id,
                        "data": item.data,
                        "error": error,
                        "attempts": item.attempts,
                    })
                    if cfg.fail_fast:
                        self._cancelled = True
                        break
                else:
                    completed += 1
                    results.append(result)

            # Progress callback
            if cfg.progress_callback:
                elapsed = time.time() - start_time
                total = len(items)
                done = completed + failed
                pending = total - done
                rate = done / elapsed if elapsed > 0 else 0
                remaining = pending / rate if rate > 0 else 0

                progress = BatchProgress(
                    total=total,
                    completed=completed,
                    failed=failed,
                    pending=pending,
                    percentage=(done / total * 100) if total > 0 else 0,
                    elapsed_seconds=elapsed,
                    estimated_remaining=remaining,
                    items_per_second=rate,
                )
                cfg.progress_callback(progress)

        # Determine status
        if self._cancelled:
            status = BatchStatus.CANCELLED
        elif failed == 0:
            status = BatchStatus.COMPLETED
        elif completed == 0:
            status = BatchStatus.FAILED
        else:
            status = BatchStatus.PARTIAL

        duration = time.time() - start_time

        # Update stats
        with self._lock:
            self._stats["total_processed"] += len(items)
            self._stats["total_successful"] += completed
            self._stats["total_failed"] += failed
            self._stats["batches_run"] += 1

        return BatchResult(
            batch_id=batch_id,
            status=status,
            total=len(items),
            successful=completed,
            failed=failed,
            results=results,
            errors=errors,
            duration_seconds=duration,
        )

    async def _process_chunk(
        self,
        chunk: List[BatchItem[T]],
        processor: Callable[[T], Awaitable[R]],
        config: BatchConfig,
    ) -> List[tuple]:
        """Process a chunk of items concurrently."""
        semaphore = asyncio.Semaphore(config.max_concurrent)
        results = []

        async def process_with_retry(item: BatchItem[T]) -> tuple:
            async with semaphore:
                last_error = None

                for attempt in range(config.max_retries):
                    if self._cancelled:
                        return (item, None, "Cancelled")

                    item.attempts = attempt + 1

                    try:
                        if config.timeout:
                            result = await asyncio.wait_for(
                                processor(item.data),
                                timeout=config.timeout
                            )
                        else:
                            result = await processor(item.data)

                        item.status = BatchStatus.COMPLETED
                        item.result = result
                        item.processed_at = time.time()
                        return (item, result, None)

                    except asyncio.TimeoutError:
                        last_error = "Timeout"
                    except Exception as e:
                        last_error = str(e)

                    if attempt < config.max_retries - 1:
                        await asyncio.sleep(
                            config.retry_delay * (2 ** attempt)
                        )

                item.status = BatchStatus.FAILED
                item.error = last_error
                return (item, None, last_error)

        tasks = [process_with_retry(item) for item in chunk]
        results = await asyncio.gather(*tasks)
        return results

    def _chunk(
        self,
        items: List[BatchItem[T]],
        size: int
    ) -> Iterator[List[BatchItem[T]]]:
        """Split items into chunks."""
        for i in range(0, len(items), size):
            yield items[i:i + size]

    def cancel(self) -> bool:
        """Cancel current batch processing."""
        if self._current_batch_id:
            self._cancelled = True
            return True
        return False

    def get_stats(self) -> dict:
        """Get processor statistics."""
        with self._lock:
            return {
                **self._stats,
                "current_batch": self._current_batch_id,
            }


class StreamBatchProcessor(Generic[T, R]):
    """Streaming batch processor for large datasets.

    Usage:
        processor = StreamBatchProcessor()

        async def source():
            for i in range(1000000):
                yield {"id": i}

        async for batch_result in processor.process_stream(
            source=source(),
            processor=process_item,
            batch_size=1000
        ):
            print(f"Processed batch: {batch_result.successful}")
    """

    def __init__(self, config: Optional[BatchConfig] = None):
        """Initialize stream processor."""
        self._config = config or BatchConfig()
        self._batch_processor = BatchProcessor(self._config)

    async def process_stream(
        self,
        source: Any,  # AsyncIterator[T]
        processor: Callable[[T], Awaitable[R]],
        batch_size: Optional[int] = None,
    ):
        """Process items from async iterator in batches.

        Args:
            source: Async iterator of items
            processor: Function to process each item
            batch_size: Items per batch

        Yields:
            BatchResult for each batch
        """
        size = batch_size or self._config.batch_size
        batch: List[T] = []

        async for item in source:
            batch.append(item)

            if len(batch) >= size:
                result = await self._batch_processor.process(
                    batch, processor
                )
                yield result
                batch = []

        # Process remaining items
        if batch:
            result = await self._batch_processor.process(
                batch, processor
            )
            yield result


class ParallelBatchProcessor(Generic[T, R]):
    """Parallel batch processor using thread pool.

    For CPU-bound operations that don't benefit from async.
    """

    def __init__(
        self,
        max_workers: int = 4,
        batch_size: int = 100,
    ):
        """Initialize parallel processor."""
        self._max_workers = max_workers
        self._batch_size = batch_size
        self._executor = ThreadPoolExecutor(max_workers=max_workers)

    def process(
        self,
        items: List[T],
        processor: Callable[[T], R],
    ) -> BatchResult[T, R]:
        """Process items in parallel.

        Args:
            items: Items to process
            processor: Sync function to process each item

        Returns:
            BatchResult with results
        """
        batch_id = str(uuid.uuid4())
        start_time = time.time()
        results: List[R] = []
        errors: List[Dict[str, Any]] = []

        # Submit all items
        futures = {
            self._executor.submit(processor, item): i
            for i, item in enumerate(items)
        }

        # Collect results
        from concurrent.futures import as_completed

        for future in as_completed(futures):
            idx = futures[future]
            try:
                result = future.result()
                results.append(result)
            except Exception as e:
                errors.append({
                    "item_id": str(idx),
                    "data": items[idx],
                    "error": str(e),
                })

        duration = time.time() - start_time
        successful = len(results)
        failed = len(errors)

        if failed == 0:
            status = BatchStatus.COMPLETED
        elif successful == 0:
            status = BatchStatus.FAILED
        else:
            status = BatchStatus.PARTIAL

        return BatchResult(
            batch_id=batch_id,
            status=status,
            total=len(items),
            successful=successful,
            failed=failed,
            results=results,
            errors=errors,
            duration_seconds=duration,
        )

    def shutdown(self) -> None:
        """Shutdown thread pool."""
        self._executor.shutdown(wait=True)


class BatchQueue(Generic[T]):
    """Queue that auto-batches items.

    Usage:
        queue = BatchQueue(
            processor=async_process_batch,
            batch_size=50,
            flush_interval=5.0
        )

        # Add items - will be batched automatically
        await queue.put(item1)
        await queue.put(item2)

        # Flush remaining
        await queue.flush()
    """

    def __init__(
        self,
        processor: Callable[[List[T]], Awaitable[None]],
        batch_size: int = 100,
        flush_interval: float = 10.0,
    ):
        """Initialize batch queue."""
        self._processor = processor
        self._batch_size = batch_size
        self._flush_interval = flush_interval
        self._queue: List[T] = []
        self._lock = asyncio.Lock()
        self._last_flush = time.time()
        self._running = False
        self._flush_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start background flushing."""
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())

    async def stop(self) -> None:
        """Stop and flush remaining."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        await self.flush()

    async def put(self, item: T) -> None:
        """Add item to queue."""
        async with self._lock:
            self._queue.append(item)

            if len(self._queue) >= self._batch_size:
                await self._flush_batch()

    async def flush(self) -> None:
        """Flush current batch."""
        async with self._lock:
            await self._flush_batch()

    async def _flush_batch(self) -> None:
        """Flush without lock (internal)."""
        if self._queue:
            batch = self._queue
            self._queue = []
            self._last_flush = time.time()
            await self._processor(batch)

    async def _flush_loop(self) -> None:
        """Background flush loop."""
        while self._running:
            await asyncio.sleep(1.0)

            if time.time() - self._last_flush >= self._flush_interval:
                async with self._lock:
                    if self._queue:
                        await self._flush_batch()

    def pending_count(self) -> int:
        """Get pending items count."""
        return len(self._queue)


# Singleton instance
batch_processor: BatchProcessor = BatchProcessor()


# Convenience functions
async def process_batch(
    items: List[Any],
    processor: Callable[[Any], Awaitable[Any]],
    batch_size: int = 100,
    max_concurrent: int = 10,
) -> BatchResult:
    """Process items in batches using global processor."""
    config = BatchConfig(
        batch_size=batch_size,
        max_concurrent=max_concurrent,
    )
    return await batch_processor.process(items, processor, config)


def create_batch_processor(
    batch_size: int = 100,
    max_concurrent: int = 10,
    max_retries: int = 3,
) -> BatchProcessor:
    """Create a configured batch processor."""
    config = BatchConfig(
        batch_size=batch_size,
        max_concurrent=max_concurrent,
        max_retries=max_retries,
    )
    return BatchProcessor(config)
