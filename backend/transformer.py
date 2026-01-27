"""
Data Transformer - Sprint 767

Data transformation pipeline system.

Features:
- Fluent API for chaining
- Built-in transformations
- Custom transformers
- Batch processing
- Error handling
- Type coercion
"""

import re
import json
import hashlib
import base64
from datetime import datetime
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Type, Generic,
    Union, Tuple, Iterator
)
from enum import Enum
from abc import ABC, abstractmethod
from functools import reduce


T = TypeVar("T")
R = TypeVar("R")


class TransformError(Exception):
    """Transformation error."""

    def __init__(self, message: str, field: Optional[str] = None, value: Any = None):
        self.field = field
        self.value = value
        super().__init__(message)


class Transform(ABC, Generic[T, R]):
    """Base transformation class."""

    @abstractmethod
    def apply(self, value: T) -> R:
        """Apply transformation."""
        pass

    def __call__(self, value: T) -> R:
        return self.apply(value)


class Pipeline(Generic[T]):
    """Transformation pipeline.

    Usage:
        result = (
            Pipeline(data)
            .map(lambda x: x * 2)
            .filter(lambda x: x > 10)
            .take(5)
            .collect()
        )
    """

    def __init__(self, data: Union[List[T], Iterator[T]]):
        self._data = list(data) if not isinstance(data, list) else data
        self._transforms: List[Callable] = []

    def map(self, func: Callable[[T], R]) -> "Pipeline[R]":
        """Apply function to each element."""
        self._data = [func(item) for item in self._data]
        return self  # type: ignore

    def filter(self, predicate: Callable[[T], bool]) -> "Pipeline[T]":
        """Filter elements by predicate."""
        self._data = [item for item in self._data if predicate(item)]
        return self

    def reject(self, predicate: Callable[[T], bool]) -> "Pipeline[T]":
        """Reject elements matching predicate."""
        self._data = [item for item in self._data if not predicate(item)]
        return self

    def take(self, n: int) -> "Pipeline[T]":
        """Take first n elements."""
        self._data = self._data[:n]
        return self

    def skip(self, n: int) -> "Pipeline[T]":
        """Skip first n elements."""
        self._data = self._data[n:]
        return self

    def slice(self, start: int, end: Optional[int] = None) -> "Pipeline[T]":
        """Slice elements."""
        self._data = self._data[start:end]
        return self

    def reverse(self) -> "Pipeline[T]":
        """Reverse order."""
        self._data = list(reversed(self._data))
        return self

    def sort(
        self,
        key: Optional[Callable[[T], Any]] = None,
        reverse: bool = False,
    ) -> "Pipeline[T]":
        """Sort elements."""
        self._data = sorted(self._data, key=key, reverse=reverse)
        return self

    def unique(self, key: Optional[Callable[[T], Any]] = None) -> "Pipeline[T]":
        """Remove duplicates."""
        seen: set = set()
        result = []
        for item in self._data:
            k = key(item) if key else item
            k_hash = hash(str(k))
            if k_hash not in seen:
                seen.add(k_hash)
                result.append(item)
        self._data = result
        return self

    def flatten(self) -> "Pipeline":
        """Flatten nested lists."""
        result = []
        for item in self._data:
            if isinstance(item, (list, tuple)):
                result.extend(item)
            else:
                result.append(item)
        self._data = result
        return self

    def flat_map(self, func: Callable[[T], List[R]]) -> "Pipeline[R]":
        """Map and flatten."""
        result = []
        for item in self._data:
            mapped = func(item)
            if isinstance(mapped, (list, tuple)):
                result.extend(mapped)
            else:
                result.append(mapped)
        self._data = result
        return self  # type: ignore

    def group_by(self, key: Callable[[T], str]) -> Dict[str, List[T]]:
        """Group elements by key."""
        groups: Dict[str, List[T]] = {}
        for item in self._data:
            k = key(item)
            if k not in groups:
                groups[k] = []
            groups[k].append(item)
        return groups

    def partition(self, predicate: Callable[[T], bool]) -> Tuple[List[T], List[T]]:
        """Partition into matching and non-matching."""
        matching = []
        not_matching = []
        for item in self._data:
            if predicate(item):
                matching.append(item)
            else:
                not_matching.append(item)
        return matching, not_matching

    def chunk(self, size: int) -> "Pipeline[List[T]]":
        """Split into chunks."""
        chunks = []
        for i in range(0, len(self._data), size):
            chunks.append(self._data[i : i + size])
        self._data = chunks  # type: ignore
        return self  # type: ignore

    def compact(self) -> "Pipeline[T]":
        """Remove None and empty values."""
        self._data = [
            item
            for item in self._data
            if item is not None and item != "" and item != []
        ]
        return self

    def tap(self, func: Callable[[List[T]], None]) -> "Pipeline[T]":
        """Execute function without modifying data."""
        func(self._data)
        return self

    def reduce(self, func: Callable[[R, T], R], initial: R) -> R:
        """Reduce to single value."""
        return reduce(func, self._data, initial)

    def find(self, predicate: Callable[[T], bool]) -> Optional[T]:
        """Find first matching element."""
        for item in self._data:
            if predicate(item):
                return item
        return None

    def find_index(self, predicate: Callable[[T], bool]) -> int:
        """Find index of first matching element."""
        for i, item in enumerate(self._data):
            if predicate(item):
                return i
        return -1

    def every(self, predicate: Callable[[T], bool]) -> bool:
        """Check if all elements match predicate."""
        return all(predicate(item) for item in self._data)

    def some(self, predicate: Callable[[T], bool]) -> bool:
        """Check if any element matches predicate."""
        return any(predicate(item) for item in self._data)

    def count(self, predicate: Optional[Callable[[T], bool]] = None) -> int:
        """Count elements."""
        if predicate:
            return sum(1 for item in self._data if predicate(item))
        return len(self._data)

    def first(self) -> Optional[T]:
        """Get first element."""
        return self._data[0] if self._data else None

    def last(self) -> Optional[T]:
        """Get last element."""
        return self._data[-1] if self._data else None

    def collect(self) -> List[T]:
        """Collect results as list."""
        return self._data.copy()

    def to_dict(self, key: Callable[[T], str]) -> Dict[str, T]:
        """Convert to dictionary."""
        return {key(item): item for item in self._data}


class DataTransformer:
    """Object/dict transformer.

    Usage:
        result = (
            DataTransformer(user_dict)
            .pick("name", "email")
            .rename("name", "full_name")
            .transform("email", str.lower)
            .add("created_at", datetime.now())
            .result()
        )
    """

    def __init__(self, data: Dict[str, Any]):
        self._data = data.copy()

    def pick(self, *keys: str) -> "DataTransformer":
        """Keep only specified keys."""
        self._data = {k: v for k, v in self._data.items() if k in keys}
        return self

    def omit(self, *keys: str) -> "DataTransformer":
        """Remove specified keys."""
        self._data = {k: v for k, v in self._data.items() if k not in keys}
        return self

    def rename(self, old_key: str, new_key: str) -> "DataTransformer":
        """Rename a key."""
        if old_key in self._data:
            self._data[new_key] = self._data.pop(old_key)
        return self

    def transform(
        self, key: str, func: Callable[[Any], Any], default: Any = None
    ) -> "DataTransformer":
        """Transform a value."""
        if key in self._data:
            self._data[key] = func(self._data[key])
        elif default is not None:
            self._data[key] = default
        return self

    def add(self, key: str, value: Any) -> "DataTransformer":
        """Add a key-value pair."""
        self._data[key] = value
        return self

    def add_computed(
        self, key: str, func: Callable[[Dict[str, Any]], Any]
    ) -> "DataTransformer":
        """Add computed value."""
        self._data[key] = func(self._data)
        return self

    def remove(self, key: str) -> "DataTransformer":
        """Remove a key."""
        self._data.pop(key, None)
        return self

    def default(self, key: str, value: Any) -> "DataTransformer":
        """Set default value if key missing or None."""
        if self._data.get(key) is None:
            self._data[key] = value
        return self

    def defaults(self, defaults: Dict[str, Any]) -> "DataTransformer":
        """Set multiple defaults."""
        for key, value in defaults.items():
            if self._data.get(key) is None:
                self._data[key] = value
        return self

    def merge(self, other: Dict[str, Any]) -> "DataTransformer":
        """Merge with another dict."""
        self._data.update(other)
        return self

    def deep_merge(self, other: Dict[str, Any]) -> "DataTransformer":
        """Deep merge with another dict."""
        self._data = _deep_merge(self._data, other)
        return self

    def flatten(self, separator: str = ".") -> "DataTransformer":
        """Flatten nested dict."""
        self._data = _flatten_dict(self._data, separator)
        return self

    def unflatten(self, separator: str = ".") -> "DataTransformer":
        """Unflatten dict."""
        self._data = _unflatten_dict(self._data, separator)
        return self

    def map_keys(self, func: Callable[[str], str]) -> "DataTransformer":
        """Transform all keys."""
        self._data = {func(k): v for k, v in self._data.items()}
        return self

    def map_values(self, func: Callable[[Any], Any]) -> "DataTransformer":
        """Transform all values."""
        self._data = {k: func(v) for k, v in self._data.items()}
        return self

    def filter_keys(self, predicate: Callable[[str], bool]) -> "DataTransformer":
        """Filter by key."""
        self._data = {k: v for k, v in self._data.items() if predicate(k)}
        return self

    def filter_values(self, predicate: Callable[[Any], bool]) -> "DataTransformer":
        """Filter by value."""
        self._data = {k: v for k, v in self._data.items() if predicate(v)}
        return self

    def compact(self) -> "DataTransformer":
        """Remove None values."""
        self._data = {k: v for k, v in self._data.items() if v is not None}
        return self

    def result(self) -> Dict[str, Any]:
        """Get result."""
        return self._data.copy()


# Built-in string transforms
class StringTransforms:
    """String transformation utilities."""

    @staticmethod
    def lower(s: str) -> str:
        return s.lower()

    @staticmethod
    def upper(s: str) -> str:
        return s.upper()

    @staticmethod
    def capitalize(s: str) -> str:
        return s.capitalize()

    @staticmethod
    def title(s: str) -> str:
        return s.title()

    @staticmethod
    def strip(s: str) -> str:
        return s.strip()

    @staticmethod
    def slug(s: str) -> str:
        """Convert to URL slug."""
        s = s.lower().strip()
        s = re.sub(r"[^\w\s-]", "", s)
        s = re.sub(r"[-\s]+", "-", s)
        return s

    @staticmethod
    def camel_case(s: str) -> str:
        """Convert to camelCase."""
        parts = re.split(r"[-_\s]+", s)
        return parts[0].lower() + "".join(p.capitalize() for p in parts[1:])

    @staticmethod
    def snake_case(s: str) -> str:
        """Convert to snake_case."""
        s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", s)
        s = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s)
        return re.sub(r"[-\s]+", "_", s).lower()

    @staticmethod
    def kebab_case(s: str) -> str:
        """Convert to kebab-case."""
        return StringTransforms.snake_case(s).replace("_", "-")

    @staticmethod
    def pascal_case(s: str) -> str:
        """Convert to PascalCase."""
        parts = re.split(r"[-_\s]+", s)
        return "".join(p.capitalize() for p in parts)

    @staticmethod
    def truncate(s: str, length: int, suffix: str = "...") -> str:
        """Truncate string."""
        if len(s) <= length:
            return s
        return s[: length - len(suffix)] + suffix

    @staticmethod
    def mask(s: str, visible: int = 4, char: str = "*") -> str:
        """Mask string, showing only last N characters."""
        if len(s) <= visible:
            return s
        return char * (len(s) - visible) + s[-visible:]

    @staticmethod
    def extract_numbers(s: str) -> str:
        """Extract only numbers."""
        return re.sub(r"\D", "", s)

    @staticmethod
    def remove_html(s: str) -> str:
        """Remove HTML tags."""
        return re.sub(r"<[^>]+>", "", s)


# Built-in number transforms
class NumberTransforms:
    """Number transformation utilities."""

    @staticmethod
    def clamp(value: float, min_val: float, max_val: float) -> float:
        """Clamp value between min and max."""
        return max(min_val, min(max_val, value))

    @staticmethod
    def round_to(value: float, decimals: int = 0) -> float:
        """Round to N decimal places."""
        return round(value, decimals)

    @staticmethod
    def to_percentage(value: float, total: float) -> float:
        """Convert to percentage."""
        return (value / total) * 100 if total else 0

    @staticmethod
    def currency(value: float, symbol: str = "$", decimals: int = 2) -> str:
        """Format as currency."""
        formatted = "{:,.{d}f}".format(value, d=decimals)
        return symbol + formatted

    @staticmethod
    def bytes_to_human(size: int) -> str:
        """Convert bytes to human readable."""
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if abs(size) < 1024.0:
                return "{:.1f} {}".format(size, unit)
            size /= 1024.0
        return "{:.1f} PB".format(size)


# Built-in date transforms
class DateTransforms:
    """Date transformation utilities."""

    @staticmethod
    def to_iso(dt: datetime) -> str:
        """Convert to ISO format."""
        return dt.isoformat()

    @staticmethod
    def to_timestamp(dt: datetime) -> float:
        """Convert to Unix timestamp."""
        return dt.timestamp()

    @staticmethod
    def format_date(dt: datetime, fmt: str = "%Y-%m-%d") -> str:
        """Format date."""
        return dt.strftime(fmt)

    @staticmethod
    def from_timestamp(ts: float) -> datetime:
        """Create datetime from timestamp."""
        return datetime.fromtimestamp(ts)

    @staticmethod
    def relative_time(dt: datetime) -> str:
        """Get relative time string."""
        now = datetime.now()
        diff = now - dt

        seconds = int(diff.total_seconds())
        if seconds < 60:
            return "just now"
        if seconds < 3600:
            mins = seconds // 60
            return str(mins) + " minute" + ("s" if mins != 1 else "") + " ago"
        if seconds < 86400:
            hours = seconds // 3600
            return str(hours) + " hour" + ("s" if hours != 1 else "") + " ago"
        if seconds < 604800:
            days = seconds // 86400
            return str(days) + " day" + ("s" if days != 1 else "") + " ago"
        return dt.strftime("%b %d, %Y")


# Built-in encoding transforms
class EncodingTransforms:
    """Encoding transformation utilities."""

    @staticmethod
    def to_base64(data: Union[str, bytes]) -> str:
        """Encode to base64."""
        if isinstance(data, str):
            data = data.encode()
        return base64.b64encode(data).decode()

    @staticmethod
    def from_base64(data: str) -> bytes:
        """Decode from base64."""
        return base64.b64decode(data)

    @staticmethod
    def to_json(data: Any, pretty: bool = False) -> str:
        """Convert to JSON string."""
        if pretty:
            return json.dumps(data, indent=2, default=str)
        return json.dumps(data, default=str)

    @staticmethod
    def from_json(data: str) -> Any:
        """Parse JSON string."""
        return json.loads(data)

    @staticmethod
    def md5(data: Union[str, bytes]) -> str:
        """Calculate MD5 hash."""
        if isinstance(data, str):
            data = data.encode()
        return hashlib.md5(data).hexdigest()

    @staticmethod
    def sha256(data: Union[str, bytes]) -> str:
        """Calculate SHA256 hash."""
        if isinstance(data, str):
            data = data.encode()
        return hashlib.sha256(data).hexdigest()


# Helper functions
def _deep_merge(base: Dict, update: Dict) -> Dict:
    """Deep merge two dictionaries."""
    result = base.copy()
    for key, value in update.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = _deep_merge(result[key], value)
        else:
            result[key] = value
    return result


def _flatten_dict(d: Dict, separator: str = ".", parent_key: str = "") -> Dict:
    """Flatten nested dictionary."""
    items: List[Tuple[str, Any]] = []
    for k, v in d.items():
        new_key = parent_key + separator + k if parent_key else k
        if isinstance(v, dict):
            items.extend(_flatten_dict(v, separator, new_key).items())
        else:
            items.append((new_key, v))
    return dict(items)


def _unflatten_dict(d: Dict, separator: str = ".") -> Dict:
    """Unflatten dictionary."""
    result: Dict = {}
    for key, value in d.items():
        parts = key.split(separator)
        current = result
        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value
    return result


# Batch transformer
class BatchTransformer(Generic[T]):
    """Batch data transformer.

    Usage:
        results = (
            BatchTransformer(users)
            .transform(lambda u: {**u, "name": u["name"].upper()})
            .filter(lambda u: u["active"])
            .sort(key=lambda u: u["created_at"])
            .execute()
        )
    """

    def __init__(self, items: List[T], batch_size: int = 100):
        self._items = items
        self._batch_size = batch_size
        self._transforms: List[Callable] = []

    def transform(self, func: Callable[[T], T]) -> "BatchTransformer[T]":
        """Add transformation."""
        self._transforms.append(("transform", func))
        return self

    def filter(self, predicate: Callable[[T], bool]) -> "BatchTransformer[T]":
        """Add filter."""
        self._transforms.append(("filter", predicate))
        return self

    def sort(
        self,
        key: Optional[Callable[[T], Any]] = None,
        reverse: bool = False,
    ) -> "BatchTransformer[T]":
        """Add sort."""
        self._transforms.append(("sort", (key, reverse)))
        return self

    def execute(self) -> List[T]:
        """Execute all transformations in batches."""
        results = self._items.copy()

        for op, func in self._transforms:
            if op == "transform":
                new_results = []
                for i in range(0, len(results), self._batch_size):
                    batch = results[i : i + self._batch_size]
                    new_results.extend([func(item) for item in batch])
                results = new_results

            elif op == "filter":
                new_results = []
                for i in range(0, len(results), self._batch_size):
                    batch = results[i : i + self._batch_size]
                    new_results.extend([item for item in batch if func(item)])
                results = new_results

            elif op == "sort":
                key, reverse = func
                results = sorted(results, key=key, reverse=reverse)

        return results


def transform(data: Union[Dict, List]) -> Union[DataTransformer, Pipeline]:
    """Create transformer for data.

    Usage:
        # Dict
        result = transform(user).pick("name", "email").result()

        # List
        result = transform(users).filter(lambda u: u["active"]).collect()
    """
    if isinstance(data, dict):
        return DataTransformer(data)
    return Pipeline(data)
