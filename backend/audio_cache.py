"""
Audio Cache System - Sprint 591

Cache TTS audio responses for faster retrieval.

Features:
- LRU cache with configurable size
- TTL-based expiration
- Memory and disk backing
- Cache statistics
- Prewarming support
"""

import os
import time
import hashlib
import asyncio
import json
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, List
from collections import OrderedDict
from threading import Lock

try:
    import aiofiles
    AIOFILES_AVAILABLE = True
except ImportError:
    AIOFILES_AVAILABLE = False


@dataclass
class CachedAudio:
    """Cached audio entry."""
    key: str
    audio_data: bytes
    text: str
    voice: str
    created_at: float
    last_accessed: float
    access_count: int = 0
    size_bytes: int = 0
    generation_time_ms: float = 0


@dataclass
class CacheStats:
    """Cache statistics."""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    total_entries: int = 0
    total_size_bytes: int = 0
    avg_generation_time_saved_ms: float = 0


class AudioCache:
    """LRU cache for TTS audio with disk persistence.

    Usage:
        cache = AudioCache(max_size_mb=100)

        # Get from cache
        audio = cache.get("Bonjour", "eva")

        # Add to cache
        cache.set("Bonjour", "eva", audio_bytes, generation_time_ms=50)

        # Prewarm common phrases
        await cache.prewarm_common()

        # Get statistics
        stats = cache.get_stats()
    """

    def __init__(
        self,
        max_size_mb: int = 100,
        max_entries: int = 1000,
        ttl_seconds: int = 86400,  # 24 hours
        disk_path: Optional[str] = None
    ):
        """Initialize audio cache.

        Args:
            max_size_mb: Maximum cache size in MB
            max_entries: Maximum number of entries
            ttl_seconds: Time to live for entries
            disk_path: Optional path for disk persistence
        """
        self._cache: OrderedDict[str, CachedAudio] = OrderedDict()
        self._lock = Lock()
        self._max_size_bytes = max_size_mb * 1024 * 1024
        self._max_entries = max_entries
        self._ttl = ttl_seconds
        self._disk_path = disk_path
        self._current_size = 0
        self._stats = CacheStats()
        self._generation_times: List[float] = []  # Track saved times

        if disk_path:
            os.makedirs(disk_path, exist_ok=True)
            self._load_from_disk()

    def _generate_key(self, text: str, voice: str) -> str:
        """Generate cache key from text and voice."""
        content = f"{voice}:{text.lower().strip()}"
        return hashlib.md5(content.encode()).hexdigest()

    def _is_expired(self, entry: CachedAudio) -> bool:
        """Check if entry is expired."""
        return time.time() - entry.created_at > self._ttl

    def _evict_if_needed(self):
        """Evict entries to make room (LRU)."""
        while (
            len(self._cache) >= self._max_entries or
            self._current_size > self._max_size_bytes
        ):
            if not self._cache:
                break

            # Remove least recently used
            key, entry = self._cache.popitem(last=False)
            self._current_size -= entry.size_bytes
            self._stats.evictions += 1

    def get(self, text: str, voice: str) -> Optional[bytes]:
        """Get audio from cache.

        Args:
            text: Text that was converted to speech
            voice: Voice used for TTS

        Returns:
            Audio bytes or None if not cached
        """
        key = self._generate_key(text, voice)

        with self._lock:
            entry = self._cache.get(key)

            if entry is None:
                self._stats.misses += 1
                return None

            if self._is_expired(entry):
                # Remove expired entry
                del self._cache[key]
                self._current_size -= entry.size_bytes
                self._stats.misses += 1
                return None

            # Update access info and move to end (most recent)
            entry.last_accessed = time.time()
            entry.access_count += 1
            self._cache.move_to_end(key)

            self._stats.hits += 1

            # Track generation time saved
            if entry.generation_time_ms > 0:
                self._generation_times.append(entry.generation_time_ms)
                if len(self._generation_times) > 100:
                    self._generation_times = self._generation_times[-100:]

            return entry.audio_data

    def set(
        self,
        text: str,
        voice: str,
        audio_data: bytes,
        generation_time_ms: float = 0
    ):
        """Add audio to cache.

        Args:
            text: Text that was converted to speech
            voice: Voice used for TTS
            audio_data: Audio bytes to cache
            generation_time_ms: How long it took to generate
        """
        key = self._generate_key(text, voice)
        size = len(audio_data)

        with self._lock:
            # Remove existing entry if present
            if key in self._cache:
                old_entry = self._cache.pop(key)
                self._current_size -= old_entry.size_bytes

            # Evict if needed
            self._evict_if_needed()

            # Don't cache if too large
            if size > self._max_size_bytes * 0.1:  # Max 10% of cache per entry
                return

            entry = CachedAudio(
                key=key,
                audio_data=audio_data,
                text=text,
                voice=voice,
                created_at=time.time(),
                last_accessed=time.time(),
                size_bytes=size,
                generation_time_ms=generation_time_ms
            )

            self._cache[key] = entry
            self._current_size += size
            self._stats.total_entries = len(self._cache)
            self._stats.total_size_bytes = self._current_size

    def delete(self, text: str, voice: str) -> bool:
        """Remove entry from cache.

        Args:
            text: Text to remove
            voice: Voice

        Returns:
            True if entry was removed
        """
        key = self._generate_key(text, voice)

        with self._lock:
            if key in self._cache:
                entry = self._cache.pop(key)
                self._current_size -= entry.size_bytes
                self._stats.total_entries = len(self._cache)
                self._stats.total_size_bytes = self._current_size
                return True
            return False

    def clear(self):
        """Clear all entries."""
        with self._lock:
            self._cache.clear()
            self._current_size = 0
            self._stats.total_entries = 0
            self._stats.total_size_bytes = 0

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_requests = self._stats.hits + self._stats.misses
            hit_rate = (self._stats.hits / total_requests * 100) if total_requests > 0 else 0
            avg_saved = sum(self._generation_times) / len(self._generation_times) if self._generation_times else 0

            return {
                "hits": self._stats.hits,
                "misses": self._stats.misses,
                "evictions": self._stats.evictions,
                "total_entries": len(self._cache),
                "total_size_mb": round(self._current_size / 1024 / 1024, 2),
                "max_size_mb": round(self._max_size_bytes / 1024 / 1024, 2),
                "hit_rate_percent": round(hit_rate, 1),
                "avg_generation_time_saved_ms": round(avg_saved, 1),
                "total_time_saved_ms": round(sum(self._generation_times), 0),
            }

    def _load_from_disk(self):
        """Load cache index from disk."""
        if not self._disk_path:
            return

        index_path = os.path.join(self._disk_path, "index.json")
        if not os.path.exists(index_path):
            return

        try:
            with open(index_path, "r") as f:
                index = json.load(f)

            for key, meta in index.items():
                audio_path = os.path.join(self._disk_path, f"{key}.mp3")
                if os.path.exists(audio_path):
                    with open(audio_path, "rb") as f:
                        audio_data = f.read()

                    if time.time() - meta["created_at"] < self._ttl:
                        entry = CachedAudio(
                            key=key,
                            audio_data=audio_data,
                            text=meta["text"],
                            voice=meta["voice"],
                            created_at=meta["created_at"],
                            last_accessed=meta.get("last_accessed", meta["created_at"]),
                            access_count=meta.get("access_count", 0),
                            size_bytes=len(audio_data),
                            generation_time_ms=meta.get("generation_time_ms", 0)
                        )
                        self._cache[key] = entry
                        self._current_size += len(audio_data)

            print(f"✅ Loaded {len(self._cache)} cached audio entries from disk")
        except Exception as e:
            print(f"⚠️ Failed to load audio cache from disk: {e}")

    async def save_to_disk(self):
        """Save cache index to disk."""
        if not self._disk_path:
            return

        index = {}
        with self._lock:
            entries_to_save = list(self._cache.items())

        for key, entry in entries_to_save:
            index[key] = {
                "text": entry.text,
                "voice": entry.voice,
                "created_at": entry.created_at,
                "last_accessed": entry.last_accessed,
                "access_count": entry.access_count,
                "generation_time_ms": entry.generation_time_ms,
            }

            # Save audio file
            audio_path = os.path.join(self._disk_path, f"{key}.mp3")
            if AIOFILES_AVAILABLE:
                async with aiofiles.open(audio_path, "wb") as f:
                    await f.write(entry.audio_data)
            else:
                with open(audio_path, "wb") as f:
                    f.write(entry.audio_data)

        # Save index
        index_path = os.path.join(self._disk_path, "index.json")
        if AIOFILES_AVAILABLE:
            async with aiofiles.open(index_path, "w") as f:
                await f.write(json.dumps(index, indent=2))
        else:
            with open(index_path, "w") as f:
                f.write(json.dumps(index, indent=2))

    def get_cached_phrases(self) -> List[Dict[str, Any]]:
        """Get list of all cached phrases."""
        with self._lock:
            return [
                {
                    "text": entry.text[:50] + "..." if len(entry.text) > 50 else entry.text,
                    "voice": entry.voice,
                    "size_kb": round(entry.size_bytes / 1024, 1),
                    "access_count": entry.access_count,
                    "age_hours": round((time.time() - entry.created_at) / 3600, 1),
                }
                for entry in self._cache.values()
            ]


# Common phrases for prewarming
COMMON_PHRASES = [
    "Bonjour !",
    "Comment ça va ?",
    "Je t'écoute.",
    "Dis-moi tout.",
    "Avec plaisir.",
    "C'est une bonne question.",
    "Laisse-moi réfléchir...",
    "Je comprends.",
    "Merci de me faire confiance.",
    "À bientôt !",
    "Bonne journée !",
    "Je suis là pour toi.",
    "Qu'est-ce que tu en penses ?",
    "C'est intéressant.",
    "Continue, je t'écoute.",
]


# Singleton instance
audio_cache = AudioCache(
    max_size_mb=100,
    max_entries=500,
    ttl_seconds=86400 * 7,  # 7 days
)
