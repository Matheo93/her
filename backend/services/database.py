"""
Database service for EVA-VOICE
Handles SQLite persistence for conversations and usage stats.
"""

import os
import sqlite3
from datetime import datetime
from typing import Optional

# Fast JSON (10x faster)
try:
    import orjson
    def json_dumps(obj) -> str:
        return orjson.dumps(obj).decode()
    def json_loads(s: str):
        return orjson.loads(s)
except ImportError:
    import json
    json_dumps = json.dumps
    json_loads = json.loads


# Global connection
db_conn: Optional[sqlite3.Connection] = None


def init_db() -> None:
    """Initialize SQLite database for conversation persistence."""
    global db_conn
    db_path = os.getenv("DB_PATH", "eva_conversations.db")
    db_conn = sqlite3.connect(db_path, check_same_thread=False)

    db_conn.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            session_id TEXT PRIMARY KEY,
            messages TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    db_conn.execute("""
        CREATE TABLE IF NOT EXISTS usage_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            endpoint TEXT,
            latency_ms INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    db_conn.commit()
    print("✅ SQLite database initialized")


def save_conversation(session_id: str, messages: list) -> None:
    """Save conversation to database."""
    if db_conn:
        try:
            db_conn.execute(
                "INSERT OR REPLACE INTO conversations (session_id, messages, updated_at) VALUES (?, ?, ?)",
                (session_id, json_dumps(messages), datetime.now())
            )
            db_conn.commit()
        except Exception as e:
            print(f"DB save error: {e}")


def load_conversation(session_id: str) -> Optional[list]:
    """Load conversation from database."""
    if db_conn:
        try:
            cursor = db_conn.execute(
                "SELECT messages FROM conversations WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            if row:
                return json_loads(row[0])
        except Exception as e:
            print(f"DB load error: {e}")
    return None


def log_usage(session_id: str, endpoint: str, latency_ms: int) -> None:
    """Log API usage for analytics (synchronous)."""
    if db_conn:
        try:
            db_conn.execute(
                "INSERT INTO usage_stats (session_id, endpoint, latency_ms) VALUES (?, ?, ?)",
                (session_id, endpoint, latency_ms)
            )
            db_conn.commit()
        except Exception as e:
            print(f"Usage log error: {e}")


def get_stats() -> dict:
    """Get usage statistics from database."""
    if not db_conn:
        return {"error": "Database not initialized"}

    try:
        # Total conversations
        cursor = db_conn.execute("SELECT COUNT(*) FROM conversations")
        total_conversations = cursor.fetchone()[0]

        # Total API calls
        cursor = db_conn.execute("SELECT COUNT(*) FROM usage_stats")
        total_calls = cursor.fetchone()[0]

        # Average latency
        cursor = db_conn.execute("SELECT AVG(latency_ms) FROM usage_stats")
        avg_latency = cursor.fetchone()[0] or 0

        # Calls by endpoint
        cursor = db_conn.execute(
            "SELECT endpoint, COUNT(*) as count FROM usage_stats GROUP BY endpoint ORDER BY count DESC"
        )
        by_endpoint = {row[0]: row[1] for row in cursor.fetchall()}

        return {
            "total_conversations": total_conversations,
            "total_api_calls": total_calls,
            "average_latency_ms": round(avg_latency, 2),
            "calls_by_endpoint": by_endpoint,
        }
    except Exception as e:
        return {"error": str(e)}


def get_connection() -> Optional[sqlite3.Connection]:
    """Get the current database connection."""
    return db_conn


def close_db() -> None:
    """Close database connection."""
    global db_conn
    if db_conn:
        db_conn.close()
        db_conn = None
