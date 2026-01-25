"""
Request Pipeline - Sprint 681

Request processing pipeline with stages.

Features:
- Pipeline stages
- Stage composition
- Transformation chain
- Validation chain
- Error propagation
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Union, Awaitable
)
from enum import Enum
import threading
from functools import wraps


class StageResult(str, Enum):
    """Stage execution result."""
    CONTINUE = "continue"  # Continue to next stage
    SKIP = "skip"  # Skip remaining stages
    ABORT = "abort"  # Abort pipeline


T = TypeVar("T")
U = TypeVar("U")


@dataclass
class PipelineContext(Generic[T]):
    """Pipeline execution context."""
    data: T
    metadata: Dict[str, Any] = field(default_factory=dict)
    errors: List[Exception] = field(default_factory=list)
    stage_results: Dict[str, Any] = field(default_factory=dict)
    start_time: float = field(default_factory=time.time)
    aborted: bool = False
    abort_reason: Optional[str] = None


@dataclass
class Stage(Generic[T, U]):
    """Pipeline stage definition."""
    name: str
    handler: Callable[[PipelineContext[T]], Union[U, Awaitable[U]]]
    condition: Optional[Callable[[PipelineContext[T]], bool]] = None
    on_error: Optional[Callable[[Exception, PipelineContext[T]], None]] = None
    timeout: Optional[float] = None
    is_async: bool = False


class Pipeline(Generic[T]):
    """Request processing pipeline.

    Usage:
        pipeline = Pipeline[dict]("request-pipeline")

        # Add stages
        pipeline.add_stage("validate", validate_request)
        pipeline.add_stage("transform", transform_request)
        pipeline.add_stage("process", process_request)

        # Execute
        ctx = await pipeline.execute({"user": "john"})

        # Or use builder pattern
        result = await (
            Pipeline[dict]("api")
            .pipe(validate)
            .pipe(transform)
            .pipe(process)
            .execute(input_data)
        )
    """

    def __init__(self, name: str):
        """Initialize pipeline.

        Args:
            name: Pipeline name
        """
        self.name = name
        self._stages: List[Stage] = []
        self._lock = threading.Lock()
        self._stats = {
            "total_executions": 0,
            "successful": 0,
            "failed": 0,
            "aborted": 0,
        }

    def add_stage(
        self,
        name: str,
        handler: Callable,
        condition: Optional[Callable[[PipelineContext], bool]] = None,
        on_error: Optional[Callable[[Exception, PipelineContext], None]] = None,
        timeout: Optional[float] = None,
    ) -> "Pipeline[T]":
        """Add stage to pipeline.

        Args:
            name: Stage name
            handler: Stage handler
            condition: Optional condition for execution
            on_error: Error handler
            timeout: Stage timeout

        Returns:
            Self for chaining
        """
        is_async = asyncio.iscoroutinefunction(handler)

        stage = Stage(
            name=name,
            handler=handler,
            condition=condition,
            on_error=on_error,
            timeout=timeout,
            is_async=is_async,
        )

        with self._lock:
            self._stages.append(stage)

        return self

    def pipe(
        self,
        handler: Callable,
        name: Optional[str] = None,
        condition: Optional[Callable] = None,
    ) -> "Pipeline[T]":
        """Fluent API for adding stages."""
        stage_name = name or handler.__name__
        return self.add_stage(stage_name, handler, condition)

    async def execute(self, data: T) -> PipelineContext[T]:
        """Execute pipeline.

        Args:
            data: Input data

        Returns:
            Pipeline context with results
        """
        self._stats["total_executions"] += 1
        ctx = PipelineContext(data=data)

        for stage in self._stages:
            if ctx.aborted:
                break

            # Check condition
            if stage.condition and not stage.condition(ctx):
                continue

            try:
                result = await self._execute_stage(stage, ctx)

                ctx.stage_results[stage.name] = result

                if isinstance(result, StageResult):
                    if result == StageResult.SKIP:
                        break
                    elif result == StageResult.ABORT:
                        ctx.aborted = True
                        ctx.abort_reason = f"Stage '{stage.name}' aborted"
                        self._stats["aborted"] += 1
                        break

            except Exception as e:
                ctx.errors.append(e)

                if stage.on_error:
                    try:
                        stage.on_error(e, ctx)
                    except Exception:
                        pass

                self._stats["failed"] += 1
                raise

        if not ctx.aborted and not ctx.errors:
            self._stats["successful"] += 1

        return ctx

    async def _execute_stage(
        self,
        stage: Stage,
        ctx: PipelineContext,
    ) -> Any:
        """Execute single stage."""
        if stage.is_async:
            if stage.timeout:
                return await asyncio.wait_for(
                    stage.handler(ctx),
                    timeout=stage.timeout,
                )
            return await stage.handler(ctx)
        else:
            return stage.handler(ctx)

    def execute_sync(self, data: T) -> PipelineContext[T]:
        """Synchronous execute."""
        self._stats["total_executions"] += 1
        ctx = PipelineContext(data=data)

        for stage in self._stages:
            if ctx.aborted:
                break

            if stage.condition and not stage.condition(ctx):
                continue

            try:
                result = stage.handler(ctx)
                ctx.stage_results[stage.name] = result

                if isinstance(result, StageResult):
                    if result == StageResult.SKIP:
                        break
                    elif result == StageResult.ABORT:
                        ctx.aborted = True
                        ctx.abort_reason = f"Stage '{stage.name}' aborted"
                        self._stats["aborted"] += 1
                        break

            except Exception as e:
                ctx.errors.append(e)
                if stage.on_error:
                    try:
                        stage.on_error(e, ctx)
                    except Exception:
                        pass
                self._stats["failed"] += 1
                raise

        if not ctx.aborted and not ctx.errors:
            self._stats["successful"] += 1

        return ctx

    def get_stages(self) -> List[str]:
        """Get stage names."""
        return [s.name for s in self._stages]

    def get_stats(self) -> dict:
        """Get execution statistics."""
        return {
            "name": self.name,
            "stages": len(self._stages),
            **self._stats,
        }

    def reset_stats(self):
        """Reset statistics."""
        self._stats = {
            "total_executions": 0,
            "successful": 0,
            "failed": 0,
            "aborted": 0,
        }


class TransformPipeline(Generic[T, U]):
    """Pipeline that transforms data through stages.

    Usage:
        pipeline = TransformPipeline[str, dict]("transform")

        pipeline.add_transform("parse", json.loads)
        pipeline.add_transform("validate", validate_schema)
        pipeline.add_transform("enrich", add_metadata)

        result = await pipeline.execute('{"key": "value"}')
    """

    def __init__(self, name: str):
        """Initialize transform pipeline."""
        self.name = name
        self._transforms: List[tuple[str, Callable]] = []
        self._stats = {"total": 0, "success": 0, "failed": 0}

    def add_transform(
        self,
        name: str,
        transform: Callable[[Any], Any],
    ) -> "TransformPipeline[T, U]":
        """Add transformation."""
        self._transforms.append((name, transform))
        return self

    def map(self, transform: Callable) -> "TransformPipeline[T, U]":
        """Fluent API for adding transform."""
        return self.add_transform(transform.__name__, transform)

    async def execute(self, data: T) -> U:
        """Execute transform pipeline."""
        self._stats["total"] += 1
        result: Any = data

        try:
            for name, transform in self._transforms:
                if asyncio.iscoroutinefunction(transform):
                    result = await transform(result)
                else:
                    result = transform(result)

            self._stats["success"] += 1
            return result
        except Exception:
            self._stats["failed"] += 1
            raise

    def execute_sync(self, data: T) -> U:
        """Synchronous execute."""
        self._stats["total"] += 1
        result: Any = data

        try:
            for name, transform in self._transforms:
                result = transform(result)
            self._stats["success"] += 1
            return result
        except Exception:
            self._stats["failed"] += 1
            raise


class ValidationPipeline(Generic[T]):
    """Pipeline for running multiple validations.

    Usage:
        pipeline = ValidationPipeline[dict]("user-validation")

        pipeline.add_validator("email", validate_email)
        pipeline.add_validator("age", validate_age)
        pipeline.add_validator("name", validate_name)

        errors = await pipeline.validate(user_data)
        if errors:
            raise ValidationError(errors)
    """

    def __init__(self, name: str, fail_fast: bool = False):
        """Initialize validation pipeline.

        Args:
            name: Pipeline name
            fail_fast: Stop on first error
        """
        self.name = name
        self.fail_fast = fail_fast
        self._validators: List[tuple[str, Callable[[T], Optional[str]]]] = []

    def add_validator(
        self,
        name: str,
        validator: Callable[[T], Optional[str]],
    ) -> "ValidationPipeline[T]":
        """Add validator.

        Validator should return error message or None if valid.
        """
        self._validators.append((name, validator))
        return self

    def check(
        self,
        validator: Callable[[T], Optional[str]],
    ) -> "ValidationPipeline[T]":
        """Fluent API for adding validator."""
        return self.add_validator(validator.__name__, validator)

    async def validate(self, data: T) -> Dict[str, str]:
        """Run all validators.

        Returns:
            Dictionary of field -> error message
        """
        errors: Dict[str, str] = {}

        for name, validator in self._validators:
            try:
                if asyncio.iscoroutinefunction(validator):
                    error = await validator(data)
                else:
                    error = validator(data)

                if error:
                    errors[name] = error
                    if self.fail_fast:
                        break

            except Exception as e:
                errors[name] = str(e)
                if self.fail_fast:
                    break

        return errors

    def validate_sync(self, data: T) -> Dict[str, str]:
        """Synchronous validate."""
        errors: Dict[str, str] = {}

        for name, validator in self._validators:
            try:
                error = validator(data)
                if error:
                    errors[name] = error
                    if self.fail_fast:
                        break
            except Exception as e:
                errors[name] = str(e)
                if self.fail_fast:
                    break

        return errors

    @property
    def is_valid(self) -> Callable[[T], bool]:
        """Get a validation function."""
        def check(data: T) -> bool:
            return len(self.validate_sync(data)) == 0
        return check


class FilterPipeline(Generic[T]):
    """Pipeline for filtering data through multiple filters.

    Usage:
        pipeline = FilterPipeline[User]("user-filter")

        pipeline.add_filter("active", lambda u: u.is_active)
        pipeline.add_filter("verified", lambda u: u.is_verified)
        pipeline.add_filter("adult", lambda u: u.age >= 18)

        filtered = await pipeline.filter(users)
    """

    def __init__(self, name: str):
        """Initialize filter pipeline."""
        self.name = name
        self._filters: List[tuple[str, Callable[[T], bool]]] = []

    def add_filter(
        self,
        name: str,
        predicate: Callable[[T], bool],
    ) -> "FilterPipeline[T]":
        """Add filter predicate."""
        self._filters.append((name, predicate))
        return self

    def where(self, predicate: Callable[[T], bool]) -> "FilterPipeline[T]":
        """Fluent API for adding filter."""
        return self.add_filter(predicate.__name__, predicate)

    async def filter(self, items: List[T]) -> List[T]:
        """Filter items through all predicates."""
        result = items

        for name, predicate in self._filters:
            if asyncio.iscoroutinefunction(predicate):
                result = [item for item in result if await predicate(item)]
            else:
                result = [item for item in result if predicate(item)]

        return result

    def filter_sync(self, items: List[T]) -> List[T]:
        """Synchronous filter."""
        result = items

        for name, predicate in self._filters:
            result = [item for item in result if predicate(item)]

        return result


class PipelineBuilder:
    """Factory for creating common pipelines.

    Usage:
        builder = PipelineBuilder()

        # Create request pipeline
        pipeline = (
            builder.request("api-request")
            .validate(schema)
            .transform(normalize)
            .process(handler)
            .build()
        )
    """

    def request(self, name: str) -> "RequestPipelineBuilder":
        """Create request pipeline builder."""
        return RequestPipelineBuilder(name)


class RequestPipelineBuilder:
    """Builder for request processing pipelines."""

    def __init__(self, name: str):
        self._pipeline = Pipeline[Any](name)

    def validate(self, validator: Callable) -> "RequestPipelineBuilder":
        """Add validation stage."""
        self._pipeline.add_stage("validate", validator)
        return self

    def transform(self, transformer: Callable) -> "RequestPipelineBuilder":
        """Add transform stage."""
        self._pipeline.add_stage("transform", transformer)
        return self

    def process(self, handler: Callable) -> "RequestPipelineBuilder":
        """Add process stage."""
        self._pipeline.add_stage("process", handler)
        return self

    def respond(self, responder: Callable) -> "RequestPipelineBuilder":
        """Add response stage."""
        self._pipeline.add_stage("respond", responder)
        return self

    def build(self) -> Pipeline:
        """Build the pipeline."""
        return self._pipeline


# Convenience functions
def pipeline(name: str) -> Pipeline:
    """Create new pipeline."""
    return Pipeline(name)


def transform_pipeline(name: str) -> TransformPipeline:
    """Create transform pipeline."""
    return TransformPipeline(name)


def validation_pipeline(name: str, fail_fast: bool = False) -> ValidationPipeline:
    """Create validation pipeline."""
    return ValidationPipeline(name, fail_fast)


def filter_pipeline(name: str) -> FilterPipeline:
    """Create filter pipeline."""
    return FilterPipeline(name)
