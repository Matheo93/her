"""
Data Pipeline - Sprint 773

ETL data pipeline system.

Features:
- Pipeline stages
- Data transformations
- Error handling
- Parallel execution
- Progress tracking
- Retry logic
"""

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Union, Iterator
)
from enum import Enum
from abc import ABC, abstractmethod
import logging
import traceback

logger = logging.getLogger(__name__)


T = TypeVar("T")
R = TypeVar("R")


class StageStatus(str, Enum):
    """Stage execution status."""
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class StageResult:
    """Result of a stage execution."""
    stage_name: str
    status: StageStatus
    data: Any = None
    error: Optional[str] = None
    duration_ms: float = 0
    records_processed: int = 0
    records_failed: int = 0

    def to_dict(self) -> dict:
        return {
            "stage_name": self.stage_name,
            "status": self.status.value,
            "error": self.error,
            "duration_ms": round(self.duration_ms, 2),
            "records_processed": self.records_processed,
            "records_failed": self.records_failed,
        }


@dataclass
class PipelineResult:
    """Result of a pipeline execution."""
    pipeline_id: str
    status: StageStatus
    stages: List[StageResult] = field(default_factory=list)
    started_at: float = 0
    finished_at: float = 0
    final_data: Any = None

    @property
    def duration_ms(self) -> float:
        return (self.finished_at - self.started_at) * 1000

    @property
    def total_records(self) -> int:
        return sum(s.records_processed for s in self.stages)

    def to_dict(self) -> dict:
        return {
            "pipeline_id": self.pipeline_id,
            "status": self.status.value,
            "duration_ms": round(self.duration_ms, 2),
            "total_records": self.total_records,
            "stages": [s.to_dict() for s in self.stages],
        }


class Stage(ABC, Generic[T, R]):
    """Base pipeline stage."""

    def __init__(
        self,
        name: str,
        retry_count: int = 0,
        retry_delay: float = 1.0,
        skip_on_error: bool = False,
    ):
        self.name = name
        self.retry_count = retry_count
        self.retry_delay = retry_delay
        self.skip_on_error = skip_on_error

    @abstractmethod
    async def process(self, data: T) -> R:
        """Process data."""
        pass

    async def execute(self, data: T) -> StageResult:
        """Execute stage with retry logic."""
        start = time.time()
        attempt = 0
        last_error = None

        while attempt <= self.retry_count:
            try:
                result = await self.process(data)
                duration = (time.time() - start) * 1000

                records = 1
                if isinstance(result, (list, tuple)):
                    records = len(result)

                return StageResult(
                    stage_name=self.name,
                    status=StageStatus.SUCCESS,
                    data=result,
                    duration_ms=duration,
                    records_processed=records,
                )

            except Exception as e:
                last_error = str(e)
                logger.warning(
                    "Stage " + self.name + " attempt " + str(attempt + 1) +
                    " failed: " + last_error
                )
                attempt += 1
                if attempt <= self.retry_count:
                    await asyncio.sleep(self.retry_delay * attempt)

        duration = (time.time() - start) * 1000
        return StageResult(
            stage_name=self.name,
            status=StageStatus.SKIPPED if self.skip_on_error else StageStatus.FAILED,
            error=last_error,
            duration_ms=duration,
        )


class FunctionStage(Stage[T, R]):
    """Stage from a function."""

    def __init__(
        self,
        name: str,
        func: Callable[[T], Union[R, Awaitable[R]]],
        **kwargs: Any,
    ):
        super().__init__(name, **kwargs)
        self.func = func

    async def process(self, data: T) -> R:
        result = self.func(data)
        if asyncio.iscoroutine(result):
            return await result
        return result  # type: ignore


class MapStage(Stage[List[T], List[R]]):
    """Map function over list."""

    def __init__(
        self,
        name: str,
        func: Callable[[T], Union[R, Awaitable[R]]],
        batch_size: Optional[int] = None,
        parallel: bool = False,
        **kwargs: Any,
    ):
        super().__init__(name, **kwargs)
        self.func = func
        self.batch_size = batch_size
        self.parallel = parallel

    async def _apply(self, item: T) -> R:
        result = self.func(item)
        if asyncio.iscoroutine(result):
            return await result
        return result  # type: ignore

    async def process(self, data: List[T]) -> List[R]:
        if self.parallel:
            tasks = [self._apply(item) for item in data]
            return await asyncio.gather(*tasks)

        results = []
        for item in data:
            result = await self._apply(item)
            results.append(result)

        return results


class FilterStage(Stage[List[T], List[T]]):
    """Filter list by predicate."""

    def __init__(
        self,
        name: str,
        predicate: Callable[[T], Union[bool, Awaitable[bool]]],
        **kwargs: Any,
    ):
        super().__init__(name, **kwargs)
        self.predicate = predicate

    async def _check(self, item: T) -> bool:
        result = self.predicate(item)
        if asyncio.iscoroutine(result):
            return await result
        return result  # type: ignore

    async def process(self, data: List[T]) -> List[T]:
        results = []
        for item in data:
            if await self._check(item):
                results.append(item)
        return results


class AggregateStage(Stage[List[T], R]):
    """Aggregate list to single value."""

    def __init__(
        self,
        name: str,
        func: Callable[[List[T]], Union[R, Awaitable[R]]],
        **kwargs: Any,
    ):
        super().__init__(name, **kwargs)
        self.func = func

    async def process(self, data: List[T]) -> R:
        result = self.func(data)
        if asyncio.iscoroutine(result):
            return await result
        return result  # type: ignore


class FlattenStage(Stage[List[List[T]], List[T]]):
    """Flatten nested lists."""

    def __init__(self, name: str = "flatten", **kwargs: Any):
        super().__init__(name, **kwargs)

    async def process(self, data: List[List[T]]) -> List[T]:
        result = []
        for item in data:
            if isinstance(item, list):
                result.extend(item)
            else:
                result.append(item)
        return result


class SplitStage(Stage[List[T], List[List[T]]]):
    """Split list into chunks."""

    def __init__(
        self,
        name: str,
        chunk_size: int,
        **kwargs: Any,
    ):
        super().__init__(name, **kwargs)
        self.chunk_size = chunk_size

    async def process(self, data: List[T]) -> List[List[T]]:
        chunks = []
        for i in range(0, len(data), self.chunk_size):
            chunks.append(data[i : i + self.chunk_size])
        return chunks


class Pipeline:
    """Data processing pipeline."""

    def __init__(
        self,
        name: str,
        on_stage_start: Optional[Callable[[str], None]] = None,
        on_stage_end: Optional[Callable[[StageResult], None]] = None,
        on_error: Optional[Callable[[str, Exception], None]] = None,
    ):
        self.name = name
        self._stages: List[Stage] = []
        self._on_stage_start = on_stage_start
        self._on_stage_end = on_stage_end
        self._on_error = on_error

    def add_stage(self, stage: Stage) -> "Pipeline":
        """Add a stage to the pipeline."""
        self._stages.append(stage)
        return self

    def add(
        self,
        name: str,
        func: Callable,
        **kwargs: Any,
    ) -> "Pipeline":
        """Add a function stage."""
        self._stages.append(FunctionStage(name, func, **kwargs))
        return self

    def map(
        self,
        name: str,
        func: Callable,
        parallel: bool = False,
        **kwargs: Any,
    ) -> "Pipeline":
        """Add a map stage."""
        self._stages.append(MapStage(name, func, parallel=parallel, **kwargs))
        return self

    def filter(
        self,
        name: str,
        predicate: Callable,
        **kwargs: Any,
    ) -> "Pipeline":
        """Add a filter stage."""
        self._stages.append(FilterStage(name, predicate, **kwargs))
        return self

    def aggregate(
        self,
        name: str,
        func: Callable,
        **kwargs: Any,
    ) -> "Pipeline":
        """Add an aggregate stage."""
        self._stages.append(AggregateStage(name, func, **kwargs))
        return self

    def flatten(self, name: str = "flatten", **kwargs: Any) -> "Pipeline":
        """Add a flatten stage."""
        self._stages.append(FlattenStage(name, **kwargs))
        return self

    def split(
        self,
        name: str,
        chunk_size: int,
        **kwargs: Any,
    ) -> "Pipeline":
        """Add a split stage."""
        self._stages.append(SplitStage(name, chunk_size, **kwargs))
        return self

    async def execute(self, data: Any) -> PipelineResult:
        """Execute the pipeline."""
        pipeline_id = str(uuid.uuid4())[:8]
        result = PipelineResult(
            pipeline_id=pipeline_id,
            status=StageStatus.RUNNING,
            started_at=time.time(),
        )

        current_data = data

        for stage in self._stages:
            if self._on_stage_start:
                self._on_stage_start(stage.name)

            stage_result = await stage.execute(current_data)
            result.stages.append(stage_result)

            if self._on_stage_end:
                self._on_stage_end(stage_result)

            if stage_result.status == StageStatus.FAILED:
                if self._on_error:
                    self._on_error(stage.name, Exception(stage_result.error))

                result.status = StageStatus.FAILED
                result.finished_at = time.time()
                return result

            if stage_result.status == StageStatus.SKIPPED:
                continue

            current_data = stage_result.data

        result.status = StageStatus.SUCCESS
        result.final_data = current_data
        result.finished_at = time.time()

        return result


class ParallelPipeline:
    """Execute multiple pipelines in parallel."""

    def __init__(
        self,
        pipelines: List[Pipeline],
        max_concurrent: int = 5,
    ):
        self._pipelines = {p.name: p for p in pipelines}
        self._max_concurrent = max_concurrent

    async def execute(
        self,
        data: Dict[str, Any],
    ) -> Dict[str, PipelineResult]:
        """Execute all pipelines in parallel."""
        semaphore = asyncio.Semaphore(self._max_concurrent)

        async def run_with_limit(name: str, pipeline: Pipeline) -> tuple:
            async with semaphore:
                result = await pipeline.execute(data.get(name))
                return name, result

        tasks = [
            run_with_limit(name, pipeline)
            for name, pipeline in self._pipelines.items()
            if name in data
        ]

        results = await asyncio.gather(*tasks)
        return dict(results)


class BatchProcessor(Generic[T, R]):
    """Process items in batches."""

    def __init__(
        self,
        process_func: Callable[[List[T]], Awaitable[List[R]]],
        batch_size: int = 100,
        max_concurrent: int = 1,
        on_batch_complete: Optional[Callable[[int, int], None]] = None,
    ):
        self._process_func = process_func
        self._batch_size = batch_size
        self._max_concurrent = max_concurrent
        self._on_batch_complete = on_batch_complete

    async def process(self, items: List[T]) -> List[R]:
        """Process all items in batches."""
        batches = []
        for i in range(0, len(items), self._batch_size):
            batches.append(items[i : i + self._batch_size])

        semaphore = asyncio.Semaphore(self._max_concurrent)
        results: List[R] = []
        completed = [0]

        async def process_batch(batch: List[T], index: int) -> List[R]:
            async with semaphore:
                result = await self._process_func(batch)
                completed[0] += 1
                if self._on_batch_complete:
                    self._on_batch_complete(completed[0], len(batches))
                return result

        tasks = [process_batch(batch, i) for i, batch in enumerate(batches)]
        batch_results = await asyncio.gather(*tasks)

        for batch_result in batch_results:
            results.extend(batch_result)

        return results


def pipeline(name: str) -> Pipeline:
    """Create a new pipeline."""
    return Pipeline(name)


def stage(
    name: str,
    func: Callable,
    **kwargs: Any,
) -> FunctionStage:
    """Create a function stage."""
    return FunctionStage(name, func, **kwargs)


async def run_pipeline(
    name: str,
    data: Any,
    *stages: Stage,
) -> PipelineResult:
    """Run a quick pipeline."""
    p = Pipeline(name)
    for s in stages:
        p.add_stage(s)
    return await p.execute(data)
