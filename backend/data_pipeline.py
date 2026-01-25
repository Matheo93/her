"""
Data Pipeline - Sprint 719

ETL and data processing pipelines.

Features:
- Pipeline stages
- Data transformations
- Error handling
- Parallel processing
- Monitoring
"""

import time
import asyncio
import uuid
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Iterator, Union
)
from enum import Enum
import threading
from abc import ABC, abstractmethod


T = TypeVar("T")
U = TypeVar("U")


class PipelineStatus(str, Enum):
    """Pipeline execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class StageStatus(str, Enum):
    """Stage execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class StageResult:
    """Result from a pipeline stage."""
    stage_name: str
    status: StageStatus
    data: Any = None
    error: Optional[str] = None
    duration_ms: float = 0
    input_count: int = 0
    output_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "stage_name": self.stage_name,
            "status": self.status.value,
            "error": self.error,
            "duration_ms": round(self.duration_ms, 2),
            "input_count": self.input_count,
            "output_count": self.output_count,
        }


@dataclass
class PipelineResult:
    """Result from pipeline execution."""
    pipeline_id: str
    pipeline_name: str
    status: PipelineStatus
    stages: List[StageResult] = field(default_factory=list)
    data: Any = None
    total_duration_ms: float = 0
    started_at: Optional[float] = None
    completed_at: Optional[float] = None

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "pipeline_id": self.pipeline_id,
            "pipeline_name": self.pipeline_name,
            "status": self.status.value,
            "stages": [s.to_dict() for s in self.stages],
            "total_duration_ms": round(self.total_duration_ms, 2),
            "stage_count": len(self.stages),
        }


class Stage(ABC, Generic[T, U]):
    """Abstract pipeline stage."""

    def __init__(self, name: str):
        """Initialize stage."""
        self.name = name
        self._skip_on_error = False
        self._retry_count = 0
        self._timeout: Optional[float] = None

    def skip_on_error(self) -> "Stage[T, U]":
        """Mark stage as skippable on error."""
        self._skip_on_error = True
        return self

    def retry(self, count: int) -> "Stage[T, U]":
        """Set retry count."""
        self._retry_count = count
        return self

    def timeout(self, seconds: float) -> "Stage[T, U]":
        """Set timeout."""
        self._timeout = seconds
        return self

    @abstractmethod
    async def process(self, data: T) -> U:
        """Process data through stage."""
        pass


class TransformStage(Stage[T, U]):
    """Transformation stage."""

    def __init__(
        self,
        name: str,
        transform: Callable[[T], Union[U, Awaitable[U]]],
    ):
        """Initialize transform stage."""
        super().__init__(name)
        self._transform = transform

    async def process(self, data: T) -> U:
        """Apply transformation."""
        result = self._transform(data)
        if asyncio.iscoroutine(result):
            return await result
        return result


class FilterStage(Stage[List[T], List[T]]):
    """Filter stage for lists."""

    def __init__(
        self,
        name: str,
        predicate: Callable[[T], bool],
    ):
        """Initialize filter stage."""
        super().__init__(name)
        self._predicate = predicate

    async def process(self, data: List[T]) -> List[T]:
        """Apply filter."""
        return [item for item in data if self._predicate(item)]


class MapStage(Stage[List[T], List[U]]):
    """Map stage for lists."""

    def __init__(
        self,
        name: str,
        mapper: Callable[[T], Union[U, Awaitable[U]]],
    ):
        """Initialize map stage."""
        super().__init__(name)
        self._mapper = mapper

    async def process(self, data: List[T]) -> List[U]:
        """Apply map."""
        results = []
        for item in data:
            result = self._mapper(item)
            if asyncio.iscoroutine(result):
                result = await result
            results.append(result)
        return results


class FlatMapStage(Stage[List[T], List[U]]):
    """FlatMap stage for lists."""

    def __init__(
        self,
        name: str,
        mapper: Callable[[T], List[U]],
    ):
        """Initialize flatmap stage."""
        super().__init__(name)
        self._mapper = mapper

    async def process(self, data: List[T]) -> List[U]:
        """Apply flatmap."""
        results = []
        for item in data:
            mapped = self._mapper(item)
            results.extend(mapped)
        return results


class AggregateStage(Stage[List[T], U]):
    """Aggregate stage."""

    def __init__(
        self,
        name: str,
        aggregator: Callable[[List[T]], U],
    ):
        """Initialize aggregate stage."""
        super().__init__(name)
        self._aggregator = aggregator

    async def process(self, data: List[T]) -> U:
        """Apply aggregation."""
        return self._aggregator(data)


class GroupByStage(Stage[List[T], Dict[str, List[T]]]):
    """GroupBy stage."""

    def __init__(
        self,
        name: str,
        key_fn: Callable[[T], str],
    ):
        """Initialize groupby stage."""
        super().__init__(name)
        self._key_fn = key_fn

    async def process(self, data: List[T]) -> Dict[str, List[T]]:
        """Apply grouping."""
        groups: Dict[str, List[T]] = {}
        for item in data:
            key = self._key_fn(item)
            if key not in groups:
                groups[key] = []
            groups[key].append(item)
        return groups


class BatchStage(Stage[List[T], List[List[T]]]):
    """Batch stage - split into chunks."""

    def __init__(self, name: str, batch_size: int):
        """Initialize batch stage."""
        super().__init__(name)
        self._batch_size = batch_size

    async def process(self, data: List[T]) -> List[List[T]]:
        """Split into batches."""
        batches = []
        for i in range(0, len(data), self._batch_size):
            batches.append(data[i:i + self._batch_size])
        return batches


class Pipeline:
    """Data processing pipeline.

    Usage:
        pipeline = Pipeline("etl-pipeline")

        pipeline.add_stage(
            TransformStage("parse", lambda x: json.loads(x))
        ).add_stage(
            FilterStage("filter", lambda x: x["active"])
        ).add_stage(
            MapStage("transform", lambda x: {"id": x["id"], "name": x["name"]})
        )

        result = await pipeline.execute(data)
    """

    def __init__(
        self,
        name: str,
        on_stage_start: Optional[Callable[[str], None]] = None,
        on_stage_complete: Optional[Callable[[StageResult], None]] = None,
        on_error: Optional[Callable[[str, Exception], None]] = None,
    ):
        """Initialize pipeline."""
        self.name = name
        self._stages: List[Stage] = []
        self._on_stage_start = on_stage_start
        self._on_stage_complete = on_stage_complete
        self._on_error = on_error
        self._cancelled = False
        self._paused = False
        self._lock = threading.Lock()

    def add_stage(self, stage: Stage) -> "Pipeline":
        """Add a stage to pipeline."""
        self._stages.append(stage)
        return self

    def transform(
        self,
        name: str,
        fn: Callable[[Any], Any],
    ) -> "Pipeline":
        """Add transform stage."""
        return self.add_stage(TransformStage(name, fn))

    def filter(
        self,
        name: str,
        predicate: Callable[[Any], bool],
    ) -> "Pipeline":
        """Add filter stage."""
        return self.add_stage(FilterStage(name, predicate))

    def map(
        self,
        name: str,
        mapper: Callable[[Any], Any],
    ) -> "Pipeline":
        """Add map stage."""
        return self.add_stage(MapStage(name, mapper))

    def group_by(
        self,
        name: str,
        key_fn: Callable[[Any], str],
    ) -> "Pipeline":
        """Add groupby stage."""
        return self.add_stage(GroupByStage(name, key_fn))

    def batch(self, name: str, size: int) -> "Pipeline":
        """Add batch stage."""
        return self.add_stage(BatchStage(name, size))

    async def execute(self, data: Any) -> PipelineResult:
        """Execute pipeline on data.

        Args:
            data: Input data

        Returns:
            PipelineResult with all stage results
        """
        pipeline_id = str(uuid.uuid4())
        start_time = time.time()
        self._cancelled = False
        self._paused = False

        result = PipelineResult(
            pipeline_id=pipeline_id,
            pipeline_name=self.name,
            status=PipelineStatus.RUNNING,
            started_at=start_time,
        )

        current_data = data

        for stage in self._stages:
            # Check for cancellation
            if self._cancelled:
                result.status = PipelineStatus.CANCELLED
                break

            # Wait while paused
            while self._paused:
                await asyncio.sleep(0.1)
                if self._cancelled:
                    break

            stage_start = time.time()

            if self._on_stage_start:
                self._on_stage_start(stage.name)

            stage_result = StageResult(
                stage_name=stage.name,
                status=StageStatus.RUNNING,
                input_count=len(current_data) if isinstance(current_data, list) else 1,
            )

            try:
                # Execute with retry
                for attempt in range(stage._retry_count + 1):
                    try:
                        if stage._timeout:
                            current_data = await asyncio.wait_for(
                                stage.process(current_data),
                                timeout=stage._timeout
                            )
                        else:
                            current_data = await stage.process(current_data)

                        stage_result.status = StageStatus.COMPLETED
                        stage_result.data = current_data
                        stage_result.output_count = len(current_data) if isinstance(current_data, list) else 1
                        break

                    except asyncio.TimeoutError:
                        if attempt == stage._retry_count:
                            raise
                        await asyncio.sleep(0.5 * (attempt + 1))

            except Exception as e:
                stage_result.status = StageStatus.FAILED
                stage_result.error = str(e)

                if self._on_error:
                    self._on_error(stage.name, e)

                if not stage._skip_on_error:
                    result.status = PipelineStatus.FAILED
                    result.stages.append(stage_result)
                    break
                else:
                    stage_result.status = StageStatus.SKIPPED

            stage_result.duration_ms = (time.time() - stage_start) * 1000

            if self._on_stage_complete:
                self._on_stage_complete(stage_result)

            result.stages.append(stage_result)

        # Finalize
        result.completed_at = time.time()
        result.total_duration_ms = (result.completed_at - start_time) * 1000
        result.data = current_data

        if result.status == PipelineStatus.RUNNING:
            result.status = PipelineStatus.COMPLETED

        return result

    def cancel(self) -> None:
        """Cancel pipeline execution."""
        with self._lock:
            self._cancelled = True

    def pause(self) -> None:
        """Pause pipeline execution."""
        with self._lock:
            self._paused = True

    def resume(self) -> None:
        """Resume pipeline execution."""
        with self._lock:
            self._paused = False

    def get_stages(self) -> List[str]:
        """Get stage names."""
        return [s.name for s in self._stages]


class ParallelPipeline:
    """Run multiple pipelines in parallel."""

    def __init__(self, name: str):
        """Initialize parallel pipeline."""
        self.name = name
        self._pipelines: List[Pipeline] = []

    def add_pipeline(self, pipeline: Pipeline) -> "ParallelPipeline":
        """Add a pipeline."""
        self._pipelines.append(pipeline)
        return self

    async def execute(self, data: Any) -> List[PipelineResult]:
        """Execute all pipelines in parallel."""
        tasks = [p.execute(data) for p in self._pipelines]
        return await asyncio.gather(*tasks)


class StreamPipeline(Generic[T, U]):
    """Streaming data pipeline.

    Usage:
        async def source():
            for i in range(1000):
                yield {"id": i}

        pipeline = StreamPipeline("stream")
        pipeline.filter(lambda x: x["id"] % 2 == 0)
        pipeline.map(lambda x: x["id"] * 2)

        async for result in pipeline.stream(source()):
            print(result)
    """

    def __init__(self, name: str):
        """Initialize stream pipeline."""
        self.name = name
        self._operations: List[Callable] = []

    def filter(self, predicate: Callable[[T], bool]) -> "StreamPipeline":
        """Add filter operation."""
        self._operations.append(("filter", predicate))
        return self

    def map(self, mapper: Callable[[T], U]) -> "StreamPipeline":
        """Add map operation."""
        self._operations.append(("map", mapper))
        return self

    async def stream(self, source: Any) -> Any:
        """Stream data through pipeline."""
        async for item in source:
            result = item
            skip = False

            for op_type, op in self._operations:
                if skip:
                    break

                if op_type == "filter":
                    if not op(result):
                        skip = True
                elif op_type == "map":
                    result = op(result)

            if not skip:
                yield result


class PipelineBuilder:
    """Fluent pipeline builder.

    Usage:
        result = await (
            PipelineBuilder("etl")
            .source([1, 2, 3, 4, 5])
            .filter("even", lambda x: x % 2 == 0)
            .map("double", lambda x: x * 2)
            .aggregate("sum", sum)
            .execute()
        )
    """

    def __init__(self, name: str):
        """Initialize builder."""
        self._name = name
        self._pipeline = Pipeline(name)
        self._source_data: Any = None

    def source(self, data: Any) -> "PipelineBuilder":
        """Set source data."""
        self._source_data = data
        return self

    def transform(self, name: str, fn: Callable) -> "PipelineBuilder":
        """Add transform."""
        self._pipeline.add_stage(TransformStage(name, fn))
        return self

    def filter(self, name: str, predicate: Callable) -> "PipelineBuilder":
        """Add filter."""
        self._pipeline.add_stage(FilterStage(name, predicate))
        return self

    def map(self, name: str, mapper: Callable) -> "PipelineBuilder":
        """Add map."""
        self._pipeline.add_stage(MapStage(name, mapper))
        return self

    def group_by(self, name: str, key_fn: Callable) -> "PipelineBuilder":
        """Add groupby."""
        self._pipeline.add_stage(GroupByStage(name, key_fn))
        return self

    def aggregate(self, name: str, aggregator: Callable) -> "PipelineBuilder":
        """Add aggregate."""
        self._pipeline.add_stage(AggregateStage(name, aggregator))
        return self

    def batch(self, name: str, size: int) -> "PipelineBuilder":
        """Add batch."""
        self._pipeline.add_stage(BatchStage(name, size))
        return self

    async def execute(self) -> PipelineResult:
        """Execute the pipeline."""
        if self._source_data is None:
            raise ValueError("No source data set")
        return await self._pipeline.execute(self._source_data)


# Convenience functions
def create_pipeline(name: str) -> Pipeline:
    """Create a new pipeline."""
    return Pipeline(name)


def create_builder(name: str) -> PipelineBuilder:
    """Create a new pipeline builder."""
    return PipelineBuilder(name)
