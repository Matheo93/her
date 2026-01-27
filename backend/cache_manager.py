"""
Cache Manager - Advanced caching system with multiple backends.

Provides a unified caching interface with support for
memory, file, and distributed caching strategies.
"""

from __future__ import annotations

import hashlib
import json
import pickle
import time
from abc import ABC, abstractmethod
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Generic, TypeVar
from threading import RLock
import asyncio
from functools import wraps


T = TypeVar("T")


class CacheStrategy(Enum):
    """Cache eviction strategies."""

    LRU = "lru"
    LFU = "lfu"
    FIFO = "fifo"
    TTL = "ttl"


class SerializationFormat(Enum):
    """Serialization formats for cache values."""

    JSON = "json"
    PICKLE = "pickle"


@dataclass
class CacheEntry(Generic[T]):
    """A cached entry with metadata."""

    key: str
    value: T
    created_at: float = field(default_factory=time.time)
    expires_at: float | None = None
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)
    size_bytes: int = 0
    tags: set[str] = field(default_factory=set)

    def is_expired(self) -> bool:
        """Check if entry is expired."""
        if self.expires_at is None:
            return False
        return time.time() > self.expires_at

    def touch(self) -> None:
        """Update access metadata."""
        self.access_count += 1
        self.last_accessed = time.time()


@dataclass
class CacheStats:
    """Statistics for cache performance."""

    hits: int = 0
    misses: int = 0
    sets: int = 0
    deletes: int = 0
    evictions: int = 0
    size_bytes: int = 0
    entry_count: int = 0

    @property
    def hit_rate(self) -> float:
        """Calculate hit rate."""
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "hits": self.hits,
            "misses": self.misses,
            "sets": self.sets,
            "deletes": self.deletes,
            "evictions": self.evictions,
            "hit_rate": round(self.hit_rate, 4),
            "size_bytes": self.size_bytes,
            "entry_count": self.entry_count,
        }


class CacheBackend(ABC):
    """Base class for cache backends."""

    @abstractmethod
    def get(self, key: str) -> CacheEntry | None:
        """Get an entry from cache."""
        pass

    @abstractmethod
    def set(self, entry: CacheEntry) -> None:
        """Set an entry in cache."""
        pass

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Delete an entry from cache."""
        pass

    @abstractmethod
    def exists(self, key: str) -> bool:
        """Check if key exists."""
        pass

    @abstractmethod
    def clear(self) -> int:
        """Clear all entries, return count."""
        pass

    @abstractmethod
    def keys(self, pattern: str = "*") -> list[str]:
        """Get keys matching pattern."""
        pass

    @abstractmethod
    def size(self) -> int:
        """Get number of entries."""
        pass


class MemoryBackend(CacheBackend):
    """In-memory cache backend."""

    def __init__(
        self,
        max_size: int = 1000,
        strategy: CacheStrategy = CacheStrategy.LRU
    ):
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._max_size = max_size
        self._strategy = strategy
        self._lock = RLock()

    def get(self, key: str) -> CacheEntry | None:
        """Get an entry."""
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            if entry.is_expired():
                del self._cache[key]
                return None
            entry.touch()
            if self._strategy == CacheStrategy.LRU:
                self._cache.move_to_end(key)
            return entry

    def set(self, entry: CacheEntry) -> None:
        """Set an entry."""
        with self._lock:
            if entry.key in self._cache:
                del self._cache[entry.key]
            elif len(self._cache) >= self._max_size:
                self._evict()
            self._cache[entry.key] = entry

    def delete(self, key: str) -> bool:
        """Delete an entry."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists."""
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return False
            if entry.is_expired():
                del self._cache[key]
                return False
            return True

    def clear(self) -> int:
        """Clear all entries."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            return count

    def keys(self, pattern: str = "*") -> list[str]:
        """Get matching keys."""
        import fnmatch
        with self._lock:
            if pattern == "*":
                return list(self._cache.keys())
            return [k for k in self._cache.keys() if fnmatch.fnmatch(k, pattern)]

    def size(self) -> int:
        """Get entry count."""
        with self._lock:
            return len(self._cache)

    def _evict(self) -> None:
        """Evict an entry based on strategy."""
        if not self._cache:
            return

        if self._strategy == CacheStrategy.LRU:
            self._cache.popitem(last=False)
        elif self._strategy == CacheStrategy.LFU:
            min_key = min(self._cache.keys(), key=lambda k: self._cache[k].access_count)
            del self._cache[min_key]
        elif self._strategy == CacheStrategy.FIFO:
            self._cache.popitem(last=False)
        elif self._strategy == CacheStrategy.TTL:
            now = time.time()
            for key, entry in list(self._cache.items()):
                if entry.is_expired():
                    del self._cache[key]
                    return
            self._cache.popitem(last=False)


class FileBackend(CacheBackend):
    """File-based cache backend."""

    def __init__(
        self,
        directory: str | Path,
        serialization: SerializationFormat = SerializationFormat.PICKLE
    ):
        self._directory = Path(directory)
        self._directory.mkdir(parents=True, exist_ok=True)
        self._serialization = serialization
        self._lock = RLock()

    def _get_path(self, key: str) -> Path:
        """Get file path for key."""
        safe_key = hashlib.md5(key.encode()).hexdigest()
        return self._directory / f"{safe_key}.cache"

    def _serialize(self, entry: CacheEntry) -> bytes:
        """Serialize an entry."""
        if self._serialization == SerializationFormat.JSON:
            data = {
                "key": entry.key,
                "value": entry.value,
                "created_at": entry.created_at,
                "expires_at": entry.expires_at,
                "access_count": entry.access_count,
                "last_accessed": entry.last_accessed,
                "tags": list(entry.tags),
            }
            return json.dumps(data).encode()
        return pickle.dumps(entry)

    def _deserialize(self, data: bytes) -> CacheEntry:
        """Deserialize an entry."""
        if self._serialization == SerializationFormat.JSON:
            obj = json.loads(data.decode())
            return CacheEntry(
                key=obj["key"],
                value=obj["value"],
                created_at=obj["created_at"],
                expires_at=obj["expires_at"],
                access_count=obj["access_count"],
                last_accessed=obj["last_accessed"],
                tags=set(obj["tags"]),
            )
        return pickle.loads(data)

    def get(self, key: str) -> CacheEntry | None:
        """Get an entry."""
        path = self._get_path(key)
        with self._lock:
            if not path.exists():
                return None
            try:
                entry = self._deserialize(path.read_bytes())
                if entry.is_expired():
                    path.unlink()
                    return None
                entry.touch()
                path.write_bytes(self._serialize(entry))
                return entry
            except Exception:
                return None

    def set(self, entry: CacheEntry) -> None:
        """Set an entry."""
        path = self._get_path(entry.key)
        with self._lock:
            path.write_bytes(self._serialize(entry))

    def delete(self, key: str) -> bool:
        """Delete an entry."""
        path = self._get_path(key)
        with self._lock:
            if path.exists():
                path.unlink()
                return True
            return False

    def exists(self, key: str) -> bool:
        """Check if key exists."""
        return self._get_path(key).exists()

    def clear(self) -> int:
        """Clear all entries."""
        with self._lock:
            count = 0
            for path in self._directory.glob("*.cache"):
                path.unlink()
                count += 1
            return count

    def keys(self, pattern: str = "*") -> list[str]:
        """Get keys - note: only returns hash, not original keys."""
        with self._lock:
            files = list(self._directory.glob("*.cache"))
            return [f.stem for f in files]

    def size(self) -> int:
        """Get entry count."""
        with self._lock:
            return len(list(self._directory.glob("*.cache")))


class TieredBackend(CacheBackend):
    """Two-level cache with L1 memory and L2 persistent."""

    def __init__(self, l1: CacheBackend, l2: CacheBackend):
        self._l1 = l1
        self._l2 = l2
        self._lock = RLock()

    def get(self, key: str) -> CacheEntry | None:
        """Get from L1, fallback to L2."""
        with self._lock:
            entry = self._l1.get(key)
            if entry is not None:
                return entry

            entry = self._l2.get(key)
            if entry is not None:
                self._l1.set(entry)
                return entry

            return None

    def set(self, entry: CacheEntry) -> None:
        """Set in both L1 and L2."""
        with self._lock:
            self._l1.set(entry)
            self._l2.set(entry)

    def delete(self, key: str) -> bool:
        """Delete from both levels."""
        with self._lock:
            l1_deleted = self._l1.delete(key)
            l2_deleted = self._l2.delete(key)
            return l1_deleted or l2_deleted

    def exists(self, key: str) -> bool:
        """Check in both levels."""
        with self._lock:
            return self._l1.exists(key) or self._l2.exists(key)

    def clear(self) -> int:
        """Clear both levels."""
        with self._lock:
            return self._l1.clear() + self._l2.clear()

    def keys(self, pattern: str = "*") -> list[str]:
        """Get keys from both levels."""
        with self._lock:
            l1_keys = set(self._l1.keys(pattern))
            l2_keys = set(self._l2.keys(pattern))
            return list(l1_keys | l2_keys)

    def size(self) -> int:
        """Get combined size."""
        with self._lock:
            return self._l1.size() + self._l2.size()


class CacheManager:
    """Main cache manager with multiple namespaces and features."""

    def __init__(
        self,
        backend: CacheBackend | None = None,
        default_ttl: int | None = None,
        prefix: str = ""
    ):
        self._backend = backend or MemoryBackend()
        self._default_ttl = default_ttl
        self._prefix = prefix
        self._stats = CacheStats()
        self._lock = RLock()

    def _make_key(self, key: str) -> str:
        """Create prefixed key."""
        return f"{self._prefix}{key}" if self._prefix else key

    def get(self, key: str, default: T | None = None) -> T | None:
        """Get a value from cache."""
        full_key = self._make_key(key)
        with self._lock:
            entry = self._backend.get(full_key)
            if entry is None:
                self._stats.misses += 1
                return default
            self._stats.hits += 1
            return entry.value

    def set(
        self,
        key: str,
        value: Any,
        ttl: int | None = None,
        tags: set[str] | None = None
    ) -> None:
        """Set a value in cache."""
        full_key = self._make_key(key)
        expires_at = None
        effective_ttl = ttl if ttl is not None else self._default_ttl
        if effective_ttl is not None:
            expires_at = time.time() + effective_ttl

        entry = CacheEntry(
            key=full_key,
            value=value,
            expires_at=expires_at,
            tags=tags or set(),
        )

        with self._lock:
            self._backend.set(entry)
            self._stats.sets += 1
            self._stats.entry_count = self._backend.size()

    def delete(self, key: str) -> bool:
        """Delete a value from cache."""
        full_key = self._make_key(key)
        with self._lock:
            deleted = self._backend.delete(full_key)
            if deleted:
                self._stats.deletes += 1
                self._stats.entry_count = self._backend.size()
            return deleted

    def exists(self, key: str) -> bool:
        """Check if key exists."""
        full_key = self._make_key(key)
        return self._backend.exists(full_key)

    def clear(self) -> int:
        """Clear all entries."""
        with self._lock:
            count = self._backend.clear()
            self._stats.entry_count = 0
            return count

    def get_or_set(
        self,
        key: str,
        factory: Callable[[], T],
        ttl: int | None = None
    ) -> T:
        """Get value or compute and set if missing."""
        value = self.get(key)
        if value is not None:
            return value
        value = factory()
        self.set(key, value, ttl=ttl)
        return value

    def mget(self, *keys: str) -> dict[str, Any]:
        """Get multiple values."""
        result = {}
        for key in keys:
            value = self.get(key)
            if value is not None:
                result[key] = value
        return result

    def mset(self, items: dict[str, Any], ttl: int | None = None) -> None:
        """Set multiple values."""
        for key, value in items.items():
            self.set(key, value, ttl=ttl)

    def keys(self, pattern: str = "*") -> list[str]:
        """Get keys matching pattern."""
        full_pattern = self._make_key(pattern)
        keys = self._backend.keys(full_pattern)
        if self._prefix:
            prefix_len = len(self._prefix)
            return [k[prefix_len:] for k in keys]
        return keys

    def get_stats(self) -> CacheStats:
        """Get cache statistics."""
        with self._lock:
            self._stats.entry_count = self._backend.size()
            return self._stats

    def reset_stats(self) -> None:
        """Reset statistics."""
        with self._lock:
            self._stats = CacheStats()

    def namespace(self, prefix: str) -> CacheManager:
        """Create a namespaced cache manager."""
        return CacheManager(
            backend=self._backend,
            default_ttl=self._default_ttl,
            prefix=f"{self._prefix}{prefix}:"
        )


class AsyncCacheManager:
    """Async wrapper for cache manager."""

    def __init__(self, sync_manager: CacheManager):
        self._sync = sync_manager

    async def get(self, key: str, default: T | None = None) -> T | None:
        """Async get."""
        return await asyncio.to_thread(self._sync.get, key, default)

    async def set(
        self,
        key: str,
        value: Any,
        ttl: int | None = None,
        tags: set[str] | None = None
    ) -> None:
        """Async set."""
        await asyncio.to_thread(self._sync.set, key, value, ttl, tags)

    async def delete(self, key: str) -> bool:
        """Async delete."""
        return await asyncio.to_thread(self._sync.delete, key)

    async def get_or_set(
        self,
        key: str,
        factory: Callable[[], T],
        ttl: int | None = None
    ) -> T:
        """Async get or set."""
        return await asyncio.to_thread(self._sync.get_or_set, key, factory, ttl)


def cached(
    cache: CacheManager,
    key_builder: Callable[..., str] | None = None,
    ttl: int | None = None
):
    """Decorator for caching function results."""
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                key_parts = [func.__name__]
                key_parts.extend(str(a) for a in args)
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = ":".join(key_parts)

            cached_value = cache.get(cache_key)
            if cached_value is not None:
                return cached_value

            result = func(*args, **kwargs)
            cache.set(cache_key, result, ttl=ttl)
            return result
        return wrapper
    return decorator


def async_cached(
    cache: AsyncCacheManager,
    key_builder: Callable[..., str] | None = None,
    ttl: int | None = None
):
    """Decorator for caching async function results."""
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                key_parts = [func.__name__]
                key_parts.extend(str(a) for a in args)
                key_parts.extend(f"{k}={v}" for k, v in sorted(kwargs.items()))
                cache_key = ":".join(key_parts)

            cached_value = await cache.get(cache_key)
            if cached_value is not None:
                return cached_value

            result = await func(*args, **kwargs)
            await cache.set(cache_key, result, ttl=ttl)
            return result
        return wrapper
    return decorator


class CacheInvalidator:
    """Utility for cache invalidation patterns."""

    def __init__(self, cache: CacheManager):
        self._cache = cache
        self._dependencies: dict[str, set[str]] = {}
        self._lock = RLock()

    def register_dependency(self, key: str, depends_on: str) -> None:
        """Register that key depends on another key."""
        with self._lock:
            if depends_on not in self._dependencies:
                self._dependencies[depends_on] = set()
            self._dependencies[depends_on].add(key)

    def invalidate(self, key: str) -> int:
        """Invalidate a key and all dependent keys."""
        count = 0
        with self._lock:
            if self._cache.delete(key):
                count += 1

            dependents = self._dependencies.get(key, set()).copy()
            for dep_key in dependents:
                count += self.invalidate(dep_key)

        return count

    def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching pattern."""
        keys = self._cache.keys(pattern)
        count = 0
        for key in keys:
            if self._cache.delete(key):
                count += 1
        return count


# Export all
__all__ = [
    "CacheStrategy",
    "SerializationFormat",
    "CacheEntry",
    "CacheStats",
    "CacheBackend",
    "MemoryBackend",
    "FileBackend",
    "TieredBackend",
    "CacheManager",
    "AsyncCacheManager",
    "cached",
    "async_cached",
    "CacheInvalidator",
]
