"""
Context Window Manager - Sprint 605

Manage conversation context for LLM interactions.

Features:
- Token counting estimation
- Context window limits
- Message prioritization
- Sliding window
- Summary injection
"""

import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum
from threading import Lock


class MessageRole(str, Enum):
    """Message roles."""
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"


class Priority(int, Enum):
    """Message priority for context selection."""
    CRITICAL = 0   # System prompts, never truncate
    HIGH = 1       # Recent messages
    NORMAL = 2     # Older messages
    LOW = 3        # Can be summarized


@dataclass
class ContextMessage:
    """A message in the context window."""
    role: MessageRole
    content: str
    timestamp: float = field(default_factory=time.time)
    priority: Priority = Priority.NORMAL
    token_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)
    is_summary: bool = False

    def to_dict(self) -> dict:
        return {
            "role": self.role.value,
            "content": self.content,
        }

    def to_full_dict(self) -> dict:
        return {
            "role": self.role.value,
            "content": self.content,
            "timestamp": self.timestamp,
            "priority": self.priority.name,
            "token_count": self.token_count,
            "is_summary": self.is_summary,
            "metadata": self.metadata,
        }


class ContextWindow:
    """A context window for a session.

    Usage:
        window = ContextWindow(max_tokens=4000)

        # Add messages
        window.add_system("You are EVA...")
        window.add_user("Hello!")
        window.add_assistant("Hi there!")

        # Get context for API
        messages = window.get_context()
    """

    def __init__(
        self,
        session_id: str,
        max_tokens: int = 4000,
        reserve_tokens: int = 500,
        recent_count: int = 10
    ):
        """Initialize context window.

        Args:
            session_id: Session identifier
            max_tokens: Maximum tokens in context
            reserve_tokens: Tokens to reserve for response
            recent_count: Number of recent messages to prioritize
        """
        self._session_id = session_id
        self._max_tokens = max_tokens
        self._reserve_tokens = reserve_tokens
        self._recent_count = recent_count
        self._messages: List[ContextMessage] = []
        self._system_prompt: Optional[ContextMessage] = None
        self._summary: Optional[ContextMessage] = None
        self._lock = Lock()
        self._total_tokens = 0

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """Estimate token count for text.

        Simple estimation: ~4 chars per token for English/French.
        """
        return max(1, len(text) // 4)

    def add_system(self, content: str, **metadata) -> ContextMessage:
        """Add system prompt (only one allowed).

        Args:
            content: System prompt content
            **metadata: Additional metadata

        Returns:
            Created message
        """
        token_count = self.estimate_tokens(content)
        message = ContextMessage(
            role=MessageRole.SYSTEM,
            content=content,
            priority=Priority.CRITICAL,
            token_count=token_count,
            metadata=metadata
        )

        with self._lock:
            if self._system_prompt:
                self._total_tokens -= self._system_prompt.token_count
            self._system_prompt = message
            self._total_tokens += token_count

        return message

    def add_user(self, content: str, **metadata) -> ContextMessage:
        """Add user message.

        Args:
            content: User message content
            **metadata: Additional metadata

        Returns:
            Created message
        """
        return self._add_message(MessageRole.USER, content, metadata)

    def add_assistant(self, content: str, **metadata) -> ContextMessage:
        """Add assistant message.

        Args:
            content: Assistant message content
            **metadata: Additional metadata

        Returns:
            Created message
        """
        return self._add_message(MessageRole.ASSISTANT, content, metadata)

    def _add_message(
        self,
        role: MessageRole,
        content: str,
        metadata: Dict[str, Any]
    ) -> ContextMessage:
        """Internal add message."""
        token_count = self.estimate_tokens(content)
        message = ContextMessage(
            role=role,
            content=content,
            token_count=token_count,
            metadata=metadata
        )

        with self._lock:
            self._messages.append(message)
            self._total_tokens += token_count

            # Trim if over limit
            self._trim_context()

        return message

    def _trim_context(self):
        """Trim context to fit within token limit."""
        available = self._max_tokens - self._reserve_tokens

        # Account for system prompt and summary
        fixed_tokens = 0
        if self._system_prompt:
            fixed_tokens += self._system_prompt.token_count
        if self._summary:
            fixed_tokens += self._summary.token_count

        available -= fixed_tokens

        # Calculate current message tokens
        message_tokens = sum(m.token_count for m in self._messages)

        if message_tokens <= available:
            return

        # Need to trim - keep recent messages
        recent = self._messages[-self._recent_count:]
        older = self._messages[:-self._recent_count]

        # Remove oldest messages until within limit
        while older and message_tokens > available:
            removed = older.pop(0)
            message_tokens -= removed.token_count
            self._total_tokens -= removed.token_count

        self._messages = older + recent

    def set_summary(self, content: str):
        """Set conversation summary.

        Args:
            content: Summary content
        """
        token_count = self.estimate_tokens(content)
        message = ContextMessage(
            role=MessageRole.SYSTEM,
            content=content,
            priority=Priority.HIGH,
            token_count=token_count,
            is_summary=True
        )

        with self._lock:
            if self._summary:
                self._total_tokens -= self._summary.token_count
            self._summary = message
            self._total_tokens += token_count

    def get_context(self) -> List[Dict[str, str]]:
        """Get context messages for API call.

        Returns:
            List of messages in API format
        """
        result = []

        with self._lock:
            # System prompt first
            if self._system_prompt:
                result.append(self._system_prompt.to_dict())

            # Summary if present
            if self._summary:
                result.append({
                    "role": "system",
                    "content": f"[Résumé de la conversation précédente]\n{self._summary.content}"
                })

            # Conversation messages
            for msg in self._messages:
                result.append(msg.to_dict())

        return result

    def get_stats(self) -> Dict[str, Any]:
        """Get context window statistics."""
        with self._lock:
            return {
                "session_id": self._session_id,
                "message_count": len(self._messages),
                "total_tokens": self._total_tokens,
                "max_tokens": self._max_tokens,
                "reserve_tokens": self._reserve_tokens,
                "available_tokens": self._max_tokens - self._reserve_tokens - self._total_tokens,
                "has_summary": self._summary is not None,
                "utilization_percent": round(
                    self._total_tokens / (self._max_tokens - self._reserve_tokens) * 100, 1
                )
            }

    def get_history(self) -> List[Dict[str, Any]]:
        """Get full message history."""
        with self._lock:
            return [m.to_full_dict() for m in self._messages]

    def clear(self, keep_system: bool = True):
        """Clear context.

        Args:
            keep_system: Whether to keep system prompt
        """
        with self._lock:
            self._messages.clear()
            self._summary = None
            if not keep_system:
                self._system_prompt = None
            self._total_tokens = (
                self._system_prompt.token_count if self._system_prompt else 0
            )


class ContextManager:
    """Manage context windows for multiple sessions.

    Usage:
        manager = ContextManager()

        # Get or create window
        window = manager.get_window("session_123")

        # Add messages
        window.add_user("Hello!")
        window.add_assistant("Hi!")

        # Get context for API
        messages = window.get_context()
    """

    def __init__(
        self,
        default_max_tokens: int = 4000,
        default_reserve_tokens: int = 500,
        default_recent_count: int = 10
    ):
        """Initialize context manager.

        Args:
            default_max_tokens: Default max tokens per window
            default_reserve_tokens: Default reserved tokens
            default_recent_count: Default recent message count
        """
        self._windows: Dict[str, ContextWindow] = {}
        self._default_max_tokens = default_max_tokens
        self._default_reserve_tokens = default_reserve_tokens
        self._default_recent_count = default_recent_count
        self._lock = Lock()

    def get_window(
        self,
        session_id: str,
        max_tokens: Optional[int] = None,
        reserve_tokens: Optional[int] = None,
        recent_count: Optional[int] = None
    ) -> ContextWindow:
        """Get or create context window.

        Args:
            session_id: Session identifier
            max_tokens: Optional custom max tokens
            reserve_tokens: Optional custom reserve
            recent_count: Optional custom recent count

        Returns:
            Context window
        """
        with self._lock:
            if session_id not in self._windows:
                self._windows[session_id] = ContextWindow(
                    session_id=session_id,
                    max_tokens=max_tokens or self._default_max_tokens,
                    reserve_tokens=reserve_tokens or self._default_reserve_tokens,
                    recent_count=recent_count or self._default_recent_count
                )
            return self._windows[session_id]

    def remove_window(self, session_id: str) -> bool:
        """Remove a context window.

        Args:
            session_id: Session identifier

        Returns:
            True if removed
        """
        with self._lock:
            if session_id in self._windows:
                del self._windows[session_id]
                return True
            return False

    def get_all_stats(self) -> List[Dict[str, Any]]:
        """Get stats for all windows."""
        with self._lock:
            return [w.get_stats() for w in self._windows.values()]

    def cleanup_old(self, max_age_seconds: int = 3600) -> int:
        """Remove old windows.

        Args:
            max_age_seconds: Maximum age for windows

        Returns:
            Number of windows removed
        """
        now = time.time()
        to_remove = []

        with self._lock:
            for session_id, window in self._windows.items():
                if window._messages:
                    last_activity = window._messages[-1].timestamp
                    if now - last_activity > max_age_seconds:
                        to_remove.append(session_id)
                elif now - window._messages[0].timestamp if window._messages else now > max_age_seconds:
                    to_remove.append(session_id)

            for session_id in to_remove:
                del self._windows[session_id]

        return len(to_remove)


# Singleton instance
context_manager = ContextManager(
    default_max_tokens=4000,
    default_reserve_tokens=500,
    default_recent_count=10
)
