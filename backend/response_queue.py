"""
Response Queue Manager - Sprint 597

Manage async response queuing and delivery.

Features:
- Priority queue for responses
- Retry logic for failed deliveries
- Dead letter queue for undeliverable
- Rate-aware delivery
- Queue metrics
"""

import asyncio
import time
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, Awaitable
from collections import defaultdict
from enum import Enum
from heapq import heappush, heappop
import json


class Priority(int, Enum):
    """Response priority levels."""
    CRITICAL = 0  # System messages
    HIGH = 1      # Real-time responses
    NORMAL = 2    # Standard responses
    LOW = 3       # Batch/background


class ResponseStatus(str, Enum):
    """Response delivery status."""
    PENDING = "pending"
    SENDING = "sending"
    DELIVERED = "delivered"
    FAILED = "failed"
    DEAD = "dead"


@dataclass(order=True)
class QueuedResponse:
    """A response in the queue."""
    priority: int
    timestamp: float = field(compare=False)
    response_id: str = field(compare=False)
    session_id: str = field(compare=False)
    payload: Dict[str, Any] = field(compare=False)
    attempts: int = field(default=0, compare=False)
    max_attempts: int = field(default=3, compare=False)
    status: ResponseStatus = field(default=ResponseStatus.PENDING, compare=False)
    created_at: float = field(default_factory=time.time, compare=False)
    last_attempt: Optional[float] = field(default=None, compare=False)
    error: Optional[str] = field(default=None, compare=False)

    def to_dict(self) -> dict:
        return {
            "response_id": self.response_id,
            "session_id": self.session_id,
            "priority": Priority(self.priority).name,
            "status": self.status.value,
            "attempts": self.attempts,
            "created_at": self.created_at,
            "age_seconds": round(time.time() - self.created_at, 1),
            "error": self.error,
        }


@dataclass
class QueueStats:
    """Queue statistics."""
    total_queued: int = 0
    total_delivered: int = 0
    total_failed: int = 0
    total_dead: int = 0
    current_size: int = 0
    avg_delivery_time: float = 0.0


class ResponseQueue:
    """Priority-based response queue.

    Usage:
        queue = ResponseQueue()

        # Queue a response
        response_id = queue.enqueue(
            session_id="sess_123",
            payload={"text": "Hello!"},
            priority=Priority.HIGH
        )

        # Process queue
        await queue.process(delivery_fn)

        # Get queue status
        stats = queue.get_stats()
    """

    def __init__(
        self,
        max_queue_size: int = 10000,
        max_attempts: int = 3,
        retry_delay: float = 1.0,
        dead_letter_limit: int = 1000
    ):
        """Initialize response queue.

        Args:
            max_queue_size: Maximum items in queue
            max_attempts: Retry attempts before dead letter
            retry_delay: Base delay between retries (exponential)
            dead_letter_limit: Max items in dead letter queue
        """
        self._queue: List[QueuedResponse] = []
        self._responses: Dict[str, QueuedResponse] = {}
        self._session_queues: Dict[str, List[str]] = defaultdict(list)
        self._dead_letter: List[QueuedResponse] = []
        self._max_queue_size = max_queue_size
        self._max_attempts = max_attempts
        self._retry_delay = retry_delay
        self._dead_letter_limit = dead_letter_limit
        self._stats = QueueStats()
        self._response_counter = 0
        self._delivery_times: List[float] = []
        self._processing = False
        self._lock = asyncio.Lock()

    def _generate_id(self) -> str:
        """Generate unique response ID."""
        self._response_counter += 1
        return f"resp_{int(time.time() * 1000) % 10000000:07d}_{self._response_counter:05d}"

    def enqueue(
        self,
        session_id: str,
        payload: Dict[str, Any],
        priority: Priority = Priority.NORMAL,
        response_id: Optional[str] = None
    ) -> str:
        """Add response to queue.

        Args:
            session_id: Target session
            payload: Response data
            priority: Delivery priority
            response_id: Optional custom ID

        Returns:
            Response ID

        Raises:
            ValueError: If queue is full
        """
        if len(self._queue) >= self._max_queue_size:
            # Try to clear old items
            self._cleanup_old()
            if len(self._queue) >= self._max_queue_size:
                raise ValueError("Queue is full")

        resp_id = response_id or self._generate_id()
        now = time.time()

        response = QueuedResponse(
            priority=priority.value,
            timestamp=now,
            response_id=resp_id,
            session_id=session_id,
            payload=payload,
            max_attempts=self._max_attempts,
            created_at=now
        )

        heappush(self._queue, response)
        self._responses[resp_id] = response
        self._session_queues[session_id].append(resp_id)
        self._stats.total_queued += 1
        self._stats.current_size = len(self._queue)

        return resp_id

    async def process(
        self,
        delivery_fn: Callable[[str, Dict[str, Any]], Awaitable[bool]],
        batch_size: int = 10
    ) -> int:
        """Process queued responses.

        Args:
            delivery_fn: Async function(session_id, payload) -> success
            batch_size: Max items to process per call

        Returns:
            Number of items processed
        """
        async with self._lock:
            if self._processing:
                return 0
            self._processing = True

        try:
            processed = 0
            to_retry = []

            while self._queue and processed < batch_size:
                response = heappop(self._queue)

                if response.status == ResponseStatus.DEAD:
                    continue

                response.status = ResponseStatus.SENDING
                response.attempts += 1
                response.last_attempt = time.time()

                try:
                    start = time.time()
                    success = await delivery_fn(response.session_id, response.payload)
                    elapsed = time.time() - start

                    if success:
                        response.status = ResponseStatus.DELIVERED
                        self._stats.total_delivered += 1
                        self._delivery_times.append(elapsed)
                        if len(self._delivery_times) > 100:
                            self._delivery_times = self._delivery_times[-100:]

                        # Remove from tracking
                        if response.response_id in self._responses:
                            del self._responses[response.response_id]
                        if response.response_id in self._session_queues.get(response.session_id, []):
                            self._session_queues[response.session_id].remove(response.response_id)
                    else:
                        # Delivery failed but no exception
                        response.error = "Delivery returned false"
                        to_retry.append(response)

                except Exception as e:
                    response.error = str(e)
                    to_retry.append(response)

                processed += 1

            # Handle retries
            for response in to_retry:
                if response.attempts >= response.max_attempts:
                    self._move_to_dead_letter(response)
                else:
                    # Exponential backoff
                    await asyncio.sleep(self._retry_delay * (2 ** (response.attempts - 1)))
                    response.status = ResponseStatus.PENDING
                    heappush(self._queue, response)

            self._stats.current_size = len(self._queue)
            self._stats.avg_delivery_time = (
                sum(self._delivery_times) / len(self._delivery_times)
                if self._delivery_times else 0
            )

            return processed

        finally:
            self._processing = False

    def _move_to_dead_letter(self, response: QueuedResponse):
        """Move response to dead letter queue."""
        response.status = ResponseStatus.DEAD
        self._dead_letter.append(response)
        self._stats.total_failed += 1
        self._stats.total_dead += 1

        # Trim dead letter queue
        if len(self._dead_letter) > self._dead_letter_limit:
            self._dead_letter = self._dead_letter[-self._dead_letter_limit:]

        # Clean up tracking
        if response.response_id in self._responses:
            del self._responses[response.response_id]

    def _cleanup_old(self):
        """Remove old pending items."""
        now = time.time()
        max_age = 300  # 5 minutes

        new_queue = []
        for response in self._queue:
            if now - response.created_at < max_age:
                new_queue.append(response)
            else:
                self._move_to_dead_letter(response)

        self._queue = new_queue
        # Re-heapify
        from heapq import heapify
        heapify(self._queue)

    def get_response(self, response_id: str) -> Optional[Dict[str, Any]]:
        """Get response status by ID."""
        response = self._responses.get(response_id)
        if response:
            return response.to_dict()

        # Check dead letter
        for dead in self._dead_letter:
            if dead.response_id == response_id:
                return dead.to_dict()

        return None

    def get_session_queue(self, session_id: str) -> List[Dict[str, Any]]:
        """Get all queued responses for a session."""
        response_ids = self._session_queues.get(session_id, [])
        return [
            self._responses[rid].to_dict()
            for rid in response_ids
            if rid in self._responses
        ]

    def cancel(self, response_id: str) -> bool:
        """Cancel a queued response.

        Args:
            response_id: Response to cancel

        Returns:
            True if cancelled
        """
        response = self._responses.get(response_id)
        if not response or response.status != ResponseStatus.PENDING:
            return False

        response.status = ResponseStatus.DEAD
        response.error = "Cancelled"

        if response_id in self._responses:
            del self._responses[response_id]

        return True

    def get_stats(self) -> Dict[str, Any]:
        """Get queue statistics."""
        return {
            "total_queued": self._stats.total_queued,
            "total_delivered": self._stats.total_delivered,
            "total_failed": self._stats.total_failed,
            "total_dead": self._stats.total_dead,
            "current_size": len(self._queue),
            "dead_letter_size": len(self._dead_letter),
            "avg_delivery_time_ms": round(self._stats.avg_delivery_time * 1000, 1),
            "sessions_with_pending": len([
                s for s, ids in self._session_queues.items() if ids
            ]),
        }

    def get_dead_letters(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent dead letter items."""
        return [r.to_dict() for r in self._dead_letter[-limit:]]

    def retry_dead_letter(self, response_id: str) -> bool:
        """Retry a dead letter item.

        Args:
            response_id: Dead letter to retry

        Returns:
            True if requeued
        """
        for i, dead in enumerate(self._dead_letter):
            if dead.response_id == response_id:
                dead.status = ResponseStatus.PENDING
                dead.attempts = 0
                dead.error = None
                heappush(self._queue, dead)
                self._responses[dead.response_id] = dead
                self._dead_letter.pop(i)
                self._stats.total_dead -= 1
                return True
        return False

    def clear_session(self, session_id: str) -> int:
        """Clear all queued responses for a session.

        Args:
            session_id: Session to clear

        Returns:
            Number of items cleared
        """
        response_ids = self._session_queues.get(session_id, [])
        cleared = 0

        for rid in response_ids:
            if self.cancel(rid):
                cleared += 1

        self._session_queues[session_id] = []
        return cleared


# Singleton instance
response_queue = ResponseQueue(
    max_queue_size=10000,
    max_attempts=3,
    retry_delay=1.0
)
