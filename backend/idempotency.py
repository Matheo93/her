"""
Idempotency Handler - Sprint 705

Request deduplication system.

Features:
- Idempotency keys
- Request deduplication
- Response caching
- TTL management
- Conflict detection
"""

import time
import asyncio
import uuid
import hashlib
import json
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Generic,
    Awaitable, Tuple
)
from enum import Enum
import threading
from functools import wraps


class IdempotencyStatus(str, Enum):
    """Request processing status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class IdempotencyRecord:
    """Stored idempotency record."""
    key: str
    request_hash: str
    status: IdempotencyStatus = IdempotencyStatus.PENDING
    response: Optional[Any] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    expires_at: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def is_expired(self) -> bool:
        """Check if record is expired."""
        if self.expires_at is None:
            return False
        return time.time() > self.expires_at

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "key": self.key,
            "status": self.status.value,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "expires_at": self.expires_at,
        }


class IdempotencyStore:
    """In-memory idempotency store (replace with Redis in production)."""

    def __init__(self, default_ttl: int = 86400):
        """Initialize store."""
        self._records: Dict[str, IdempotencyRecord] = {}
        self._lock = threading.Lock()
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[IdempotencyRecord]:
        """Get record by key."""
        record = self._records.get(key)
        if record and record.is_expired():
            self.delete(key)
            return None
        return record

    def create(
        self,
        key: str,
        request_hash: str,
        ttl: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> IdempotencyRecord:
        """Create new record."""
        ttl = ttl if ttl is not None else self._default_ttl
        record = IdempotencyRecord(
            key=key,
            request_hash=request_hash,
            expires_at=time.time() + ttl if ttl > 0 else None,
            metadata=metadata or {},
        )

        with self._lock:
            self._records[key] = record

        return record

    def update_status(
        self,
        key: str,
        status: IdempotencyStatus,
        response: Optional[Any] = None,
        error: Optional[str] = None,
    ) -> Optional[IdempotencyRecord]:
        """Update record status."""
        record = self._records.get(key)
        if not record:
            return None

        with self._lock:
            record.status = status
            record.response = response
            record.error = error
            record.updated_at = time.time()

        return record

    def delete(self, key: str) -> bool:
        """Delete record."""
        with self._lock:
            if key in self._records:
                del self._records[key]
                return True
        return False

    def cleanup_expired(self) -> int:
        """Remove expired records."""
        count = 0
        now = time.time()

        with self._lock:
            expired = [
                key for key, record in self._records.items()
                if record.expires_at and record.expires_at < now
            ]
            for key in expired:
                del self._records[key]
                count += 1

        return count

    def get_stats(self) -> dict:
        """Get store statistics."""
        by_status = {}
        for record in self._records.values():
            by_status[record.status.value] = by_status.get(record.status.value, 0) + 1

        return {
            "total_records": len(self._records),
            "by_status": by_status,
        }


class IdempotencyConflictError(Exception):
    """Raised when request hash doesn't match."""

    def __init__(self, key: str, message: str = "Request conflict"):
        self.key = key
        super().__init__(message)


class IdempotencyInProgressError(Exception):
    """Raised when request is already being processed."""

    def __init__(self, key: str, message: str = "Request in progress"):
        self.key = key
        super().__init__(message)


class IdempotencyHandler:
    """Main idempotency handler.

    Usage:
        handler = IdempotencyHandler()

        # Check and process
        async def process_payment(request):
            key = request.headers.get("Idempotency-Key")

            async with handler.check(key, request.body) as result:
                if result.cached:
                    return result.response

                # Process payment
                response = await payment_service.charge(request)
                result.set_response(response)
                return response
    """

    def __init__(
        self,
        store: Optional[IdempotencyStore] = None,
        default_ttl: int = 86400,
        lock_timeout: float = 30.0,
    ):
        """Initialize handler."""
        self._store = store or IdempotencyStore(default_ttl)
        self._default_ttl = default_ttl
        self._lock_timeout = lock_timeout
        self._pending_locks: Dict[str, asyncio.Lock] = {}
        self._stats = {
            "total_requests": 0,
            "cache_hits": 0,
            "new_requests": 0,
            "conflicts": 0,
        }

    def _compute_hash(self, data: Any) -> str:
        """Compute hash of request data."""
        if isinstance(data, bytes):
            content = data
        elif isinstance(data, str):
            content = data.encode()
        else:
            content = json.dumps(data, sort_keys=True, default=str).encode()

        return hashlib.sha256(content).hexdigest()

    def _get_lock(self, key: str) -> asyncio.Lock:
        """Get or create lock for key."""
        if key not in self._pending_locks:
            self._pending_locks[key] = asyncio.Lock()
        return self._pending_locks[key]

    def check(
        self,
        key: str,
        request_data: Any,
        ttl: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "IdempotencyContext":
        """Check idempotency and return context.

        Args:
            key: Idempotency key
            request_data: Request payload for hashing
            ttl: Optional TTL override
            metadata: Optional metadata to store

        Returns:
            Idempotency context manager
        """
        return IdempotencyContext(
            handler=self,
            key=key,
            request_data=request_data,
            ttl=ttl,
            metadata=metadata,
        )

    async def _check_and_lock(
        self,
        key: str,
        request_hash: str,
        ttl: Optional[int],
        metadata: Optional[Dict[str, Any]],
    ) -> Tuple[bool, Optional[Any], Optional[IdempotencyRecord]]:
        """Check record and acquire lock.

        Returns:
            Tuple of (is_cached, cached_response, record)
        """
        self._stats["total_requests"] += 1

        lock = self._get_lock(key)
        acquired = await asyncio.wait_for(lock.acquire(), timeout=self._lock_timeout)

        if not acquired:
            raise IdempotencyInProgressError(key)

        try:
            record = self._store.get(key)

            if record:
                # Verify hash matches
                if record.request_hash != request_hash:
                    self._stats["conflicts"] += 1
                    raise IdempotencyConflictError(
                        key,
                        "Request body doesn't match original request"
                    )

                # Check status
                if record.status == IdempotencyStatus.IN_PROGRESS:
                    raise IdempotencyInProgressError(key)

                if record.status == IdempotencyStatus.COMPLETED:
                    self._stats["cache_hits"] += 1
                    return (True, record.response, record)

                if record.status == IdempotencyStatus.FAILED:
                    # Allow retry of failed requests
                    pass

            # Create new record
            self._stats["new_requests"] += 1
            record = self._store.create(
                key=key,
                request_hash=request_hash,
                ttl=ttl or self._default_ttl,
                metadata=metadata,
            )
            self._store.update_status(key, IdempotencyStatus.IN_PROGRESS)

            return (False, None, record)

        except Exception:
            lock.release()
            raise

    async def _complete(
        self,
        key: str,
        response: Any,
        lock: asyncio.Lock,
    ) -> None:
        """Mark request as completed."""
        try:
            self._store.update_status(
                key,
                IdempotencyStatus.COMPLETED,
                response=response,
            )
        finally:
            lock.release()

    async def _fail(
        self,
        key: str,
        error: str,
        lock: asyncio.Lock,
    ) -> None:
        """Mark request as failed."""
        try:
            self._store.update_status(
                key,
                IdempotencyStatus.FAILED,
                error=error,
            )
        finally:
            lock.release()

    def generate_key(self, *parts: str) -> str:
        """Generate idempotency key from parts."""
        return ":".join(parts)

    def get_record(self, key: str) -> Optional[IdempotencyRecord]:
        """Get record by key."""
        return self._store.get(key)

    def cleanup(self) -> int:
        """Cleanup expired records."""
        return self._store.cleanup_expired()

    def get_stats(self) -> dict:
        """Get handler statistics."""
        return {
            **self._stats,
            "cache_hit_rate": (
                self._stats["cache_hits"] / self._stats["total_requests"] * 100
                if self._stats["total_requests"] > 0
                else 0
            ),
            "store": self._store.get_stats(),
        }


class IdempotencyContext:
    """Context manager for idempotent operations."""

    def __init__(
        self,
        handler: IdempotencyHandler,
        key: str,
        request_data: Any,
        ttl: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        """Initialize context."""
        self._handler = handler
        self._key = key
        self._request_hash = handler._compute_hash(request_data)
        self._ttl = ttl
        self._metadata = metadata
        self._lock: Optional[asyncio.Lock] = None
        self._record: Optional[IdempotencyRecord] = None

        # Results
        self.cached: bool = False
        self.response: Optional[Any] = None

    async def __aenter__(self) -> "IdempotencyContext":
        """Enter context."""
        self._lock = self._handler._get_lock(self._key)

        cached, response, record = await self._handler._check_and_lock(
            self._key,
            self._request_hash,
            self._ttl,
            self._metadata,
        )

        self.cached = cached
        self.response = response
        self._record = record

        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Exit context."""
        if self._lock and self._lock.locked():
            if exc_type is not None:
                # Request failed
                await self._handler._fail(
                    self._key,
                    str(exc_val),
                    self._lock,
                )
            elif not self.cached and self.response is not None:
                # Request completed
                await self._handler._complete(
                    self._key,
                    self.response,
                    self._lock,
                )
            else:
                self._lock.release()

    def set_response(self, response: Any) -> None:
        """Set the response (call from within context)."""
        self.response = response


def idempotent(
    key_func: Optional[Callable[..., str]] = None,
    ttl: int = 86400,
):
    """Decorator for idempotent functions.

    Usage:
        @idempotent(key_func=lambda r: r.headers['Idempotency-Key'])
        async def process_payment(request):
            return await payment_service.charge(request)
    """
    def decorator(func: Callable) -> Callable:
        handler = IdempotencyHandler(default_ttl=ttl)

        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            # Get key
            if key_func:
                key = key_func(*args, **kwargs)
            else:
                key = str(uuid.uuid4())

            # Get request data for hashing
            request_data = args[0] if args else kwargs

            async with handler.check(key, request_data, ttl) as ctx:
                if ctx.cached:
                    return ctx.response

                result = await func(*args, **kwargs)
                ctx.set_response(result)
                return result

        wrapper._idempotency_handler = handler
        return wrapper

    return decorator


# Singleton instance
idempotency_handler = IdempotencyHandler()


# Convenience functions
async def with_idempotency(
    key: str,
    request_data: Any,
    operation: Callable[[], Awaitable[Any]],
    ttl: int = 86400,
) -> Any:
    """Execute operation with idempotency.

    Usage:
        result = await with_idempotency(
            "payment:123",
            request.body,
            lambda: payment_service.charge(request),
        )
    """
    async with idempotency_handler.check(key, request_data, ttl) as ctx:
        if ctx.cached:
            return ctx.response

        result = await operation()
        ctx.set_response(result)
        return result


def generate_idempotency_key(
    user_id: str,
    action: str,
    *identifiers: str,
) -> str:
    """Generate a standard idempotency key."""
    parts = [user_id, action] + list(identifiers)
    return ":".join(parts)
