"""
WebSocket Connection Manager - Sprint 587

Manages WebSocket connections with:
- Connection lifecycle tracking
- Session association
- Heartbeat/ping handling
- Graceful reconnection support
- Connection statistics

Features:
- Track active connections
- Associate connections with sessions
- Monitor connection health
- Clean up stale connections
"""

import time
import asyncio
from dataclasses import dataclass, field
from typing import Dict, Optional, Set, Any, Callable, Awaitable
from collections import defaultdict
from threading import Lock
from enum import Enum
from fastapi import WebSocket


class ConnectionState(str, Enum):
    """WebSocket connection state."""
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTING = "disconnecting"
    DISCONNECTED = "disconnected"


@dataclass
class ConnectionInfo:
    """Information about a WebSocket connection."""
    connection_id: str
    websocket: WebSocket
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    state: ConnectionState = ConnectionState.CONNECTING
    connected_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    last_ping: float = 0
    last_pong: float = 0
    ping_count: int = 0
    message_count: int = 0
    bytes_sent: int = 0
    bytes_received: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectionStats:
    """Statistics for all connections."""
    total_connections: int = 0
    active_connections: int = 0
    total_messages: int = 0
    total_bytes_sent: int = 0
    total_bytes_received: int = 0
    avg_connection_duration: float = 0
    longest_connection: float = 0


class WebSocketManager:
    """Manages WebSocket connections with health monitoring.

    Usage:
        manager = WebSocketManager()

        # On connect
        conn_id = manager.connect(websocket, session_id)

        # On message
        manager.record_message(conn_id, len(data), sent=False)

        # On disconnect
        await manager.disconnect(conn_id)

        # Get status
        status = manager.get_connection_status(conn_id)
    """

    def __init__(
        self,
        ping_interval: float = 30.0,
        ping_timeout: float = 10.0,
        max_inactive: float = 300.0
    ):
        """Initialize WebSocket manager.

        Args:
            ping_interval: Seconds between pings
            ping_timeout: Seconds to wait for pong
            max_inactive: Max seconds without activity before cleanup
        """
        self._connections: Dict[str, ConnectionInfo] = {}
        self._session_connections: Dict[str, Set[str]] = defaultdict(set)
        self._lock = Lock()
        self._counter = 0
        self._stats = ConnectionStats()
        self._ping_interval = ping_interval
        self._ping_timeout = ping_timeout
        self._max_inactive = max_inactive
        self._ping_task: Optional[asyncio.Task] = None
        self._closed_connections: list = []  # Track closed for stats

    def _generate_connection_id(self) -> str:
        """Generate unique connection ID."""
        self._counter += 1
        return f"ws_{int(time.time() * 1000) % 10000000:07d}_{self._counter:04d}"

    def connect(
        self,
        websocket: WebSocket,
        session_id: Optional[str] = None,
        user_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Register a new WebSocket connection.

        Args:
            websocket: The WebSocket connection
            session_id: Optional session identifier
            user_id: Optional user identifier
            metadata: Optional additional metadata

        Returns:
            Connection ID
        """
        conn_id = self._generate_connection_id()
        now = time.time()

        info = ConnectionInfo(
            connection_id=conn_id,
            websocket=websocket,
            session_id=session_id,
            user_id=user_id,
            state=ConnectionState.CONNECTED,
            connected_at=now,
            last_activity=now,
            metadata=metadata or {}
        )

        with self._lock:
            self._connections[conn_id] = info
            if session_id:
                self._session_connections[session_id].add(conn_id)
            self._stats.total_connections += 1
            self._stats.active_connections = len(self._connections)

        return conn_id

    async def disconnect(self, connection_id: str, code: int = 1000, reason: str = "Normal closure"):
        """Disconnect and cleanup a WebSocket connection.

        Args:
            connection_id: The connection ID
            code: WebSocket close code
            reason: Close reason
        """
        with self._lock:
            info = self._connections.get(connection_id)
            if not info:
                return

            info.state = ConnectionState.DISCONNECTING

        # Try to close gracefully
        try:
            await info.websocket.close(code=code, reason=reason)
        except Exception:
            pass  # Already closed

        with self._lock:
            info.state = ConnectionState.DISCONNECTED

            # Track for stats
            duration = time.time() - info.connected_at
            self._closed_connections.append({
                "duration": duration,
                "messages": info.message_count,
                "bytes_sent": info.bytes_sent,
                "bytes_received": info.bytes_received
            })

            # Keep only last 100 for stats
            if len(self._closed_connections) > 100:
                self._closed_connections = self._closed_connections[-100:]

            # Remove from session tracking
            if info.session_id:
                self._session_connections[info.session_id].discard(connection_id)
                if not self._session_connections[info.session_id]:
                    del self._session_connections[info.session_id]

            # Remove connection
            del self._connections[connection_id]
            self._stats.active_connections = len(self._connections)

    def record_message(
        self,
        connection_id: str,
        size: int,
        sent: bool = True
    ):
        """Record a message for a connection.

        Args:
            connection_id: The connection ID
            size: Message size in bytes
            sent: True if sent, False if received
        """
        with self._lock:
            info = self._connections.get(connection_id)
            if not info:
                return

            info.last_activity = time.time()
            info.message_count += 1

            if sent:
                info.bytes_sent += size
                self._stats.total_bytes_sent += size
            else:
                info.bytes_received += size
                self._stats.total_bytes_received += size

            self._stats.total_messages += 1

    def record_pong(self, connection_id: str):
        """Record a pong received from client.

        Args:
            connection_id: The connection ID
        """
        with self._lock:
            info = self._connections.get(connection_id)
            if info:
                info.last_pong = time.time()
                info.last_activity = time.time()

    def get_connection_status(self, connection_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific connection.

        Args:
            connection_id: The connection ID

        Returns:
            Connection status dict or None
        """
        with self._lock:
            info = self._connections.get(connection_id)
            if not info:
                return None

            now = time.time()
            return {
                "connection_id": info.connection_id,
                "session_id": info.session_id,
                "user_id": info.user_id,
                "state": info.state.value,
                "connected_at": info.connected_at,
                "duration_seconds": round(now - info.connected_at, 1),
                "last_activity": info.last_activity,
                "idle_seconds": round(now - info.last_activity, 1),
                "message_count": info.message_count,
                "bytes_sent": info.bytes_sent,
                "bytes_received": info.bytes_received,
                "ping_count": info.ping_count,
            }

    def get_session_connections(self, session_id: str) -> list:
        """Get all connections for a session.

        Args:
            session_id: The session ID

        Returns:
            List of connection IDs
        """
        with self._lock:
            return list(self._session_connections.get(session_id, set()))

    async def broadcast_to_session(
        self,
        session_id: str,
        message: Any,
        exclude: Optional[str] = None
    ) -> int:
        """Broadcast message to all connections in a session.

        Args:
            session_id: The session ID
            message: Message to send (will be JSON encoded)
            exclude: Optional connection ID to exclude

        Returns:
            Number of connections sent to
        """
        conn_ids = self.get_session_connections(session_id)
        sent_count = 0

        for conn_id in conn_ids:
            if conn_id == exclude:
                continue

            info = self._connections.get(conn_id)
            if info and info.state == ConnectionState.CONNECTED:
                try:
                    await info.websocket.send_json(message)
                    self.record_message(conn_id, len(str(message)), sent=True)
                    sent_count += 1
                except Exception:
                    pass  # Connection may have closed

        return sent_count

    async def send_to_connection(
        self,
        connection_id: str,
        message: Any
    ) -> bool:
        """Send message to a specific connection.

        Args:
            connection_id: The connection ID
            message: Message to send

        Returns:
            True if sent successfully
        """
        with self._lock:
            info = self._connections.get(connection_id)
            if not info or info.state != ConnectionState.CONNECTED:
                return False

        try:
            await info.websocket.send_json(message)
            self.record_message(connection_id, len(str(message)), sent=True)
            return True
        except Exception:
            return False

    def get_stats(self) -> Dict[str, Any]:
        """Get overall connection statistics."""
        with self._lock:
            # Calculate average duration from closed connections
            if self._closed_connections:
                durations = [c["duration"] for c in self._closed_connections]
                avg_duration = sum(durations) / len(durations)
                max_duration = max(durations)
            else:
                avg_duration = 0
                max_duration = 0

            return {
                "total_connections": self._stats.total_connections,
                "active_connections": self._stats.active_connections,
                "active_sessions": len(self._session_connections),
                "total_messages": self._stats.total_messages,
                "total_bytes_sent": self._stats.total_bytes_sent,
                "total_bytes_received": self._stats.total_bytes_received,
                "avg_connection_duration": round(avg_duration, 1),
                "longest_connection": round(max_duration, 1),
            }

    def get_all_connections(self) -> list:
        """Get list of all active connections."""
        with self._lock:
            return [
                self.get_connection_status(conn_id)
                for conn_id in self._connections.keys()
            ]

    async def cleanup_stale_connections(self) -> int:
        """Cleanup connections that have been inactive too long.

        Returns:
            Number of connections cleaned up
        """
        now = time.time()
        stale_ids = []

        with self._lock:
            for conn_id, info in self._connections.items():
                if now - info.last_activity > self._max_inactive:
                    stale_ids.append(conn_id)

        for conn_id in stale_ids:
            await self.disconnect(conn_id, code=1001, reason="Connection timeout")

        return len(stale_ids)

    async def ping_all(self) -> int:
        """Send ping to all active connections.

        Returns:
            Number of connections pinged
        """
        now = time.time()
        pinged = 0

        conn_ids = list(self._connections.keys())
        for conn_id in conn_ids:
            info = self._connections.get(conn_id)
            if info and info.state == ConnectionState.CONNECTED:
                try:
                    await info.websocket.send_json({
                        "type": "ping",
                        "timestamp": now
                    })
                    info.last_ping = now
                    info.ping_count += 1
                    pinged += 1
                except Exception:
                    pass  # Connection may have closed

        return pinged


# Singleton instance
ws_manager = WebSocketManager()
