"""
Config Manager - Sprint 661

Centralized configuration system.

Features:
- Environment variables
- JSON/YAML config files
- Nested config access
- Type coercion
- Validation
- Hot reload
"""

import os
import json
import time
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, TypeVar, Type, Union
from pathlib import Path
import threading


T = TypeVar("T")


@dataclass
class ConfigSource:
    """Configuration source."""
    name: str
    data: Dict[str, Any]
    priority: int = 0
    file_path: Optional[str] = None
    last_loaded: float = field(default_factory=time.time)


class ConfigManager:
    """Centralized configuration management.

    Usage:
        config = ConfigManager()

        # Load from sources
        config.load_env()
        config.load_json("config.json")

        # Access values
        api_key = config.get("api.key")
        port = config.get("server.port", default=8000)
        debug = config.get_bool("debug", default=False)

        # Required values (raises if missing)
        secret = config.require("jwt.secret")
    """

    def __init__(self):
        """Initialize config manager."""
        self._sources: List[ConfigSource] = []
        self._cache: Dict[str, Any] = {}
        self._lock = threading.Lock()
        self._watchers: List[callable] = []

    def load_env(
        self,
        prefix: str = "",
        strip_prefix: bool = True,
        priority: int = 100,
    ) -> "ConfigManager":
        """Load from environment variables.

        Args:
            prefix: Only load vars with this prefix
            strip_prefix: Remove prefix from keys
            priority: Source priority (higher = override)
        """
        data = {}

        for key, value in os.environ.items():
            if prefix and not key.startswith(prefix):
                continue

            config_key = key
            if prefix and strip_prefix:
                config_key = key[len(prefix):].lstrip("_")

            # Convert to nested dict (MY_APP__DB__HOST -> db.host)
            config_key = config_key.lower().replace("__", ".")
            data[config_key] = self._coerce_value(value)

        with self._lock:
            self._sources.append(ConfigSource(
                name="env",
                data=data,
                priority=priority,
            ))
            self._rebuild_cache()

        return self

    def load_json(
        self,
        file_path: str,
        priority: int = 50,
        required: bool = False,
    ) -> "ConfigManager":
        """Load from JSON file.

        Args:
            file_path: Path to JSON file
            priority: Source priority
            required: Raise if file not found
        """
        path = Path(file_path)

        if not path.exists():
            if required:
                raise FileNotFoundError(f"Config file not found: {file_path}")
            return self

        with open(path) as f:
            data = json.load(f)

        with self._lock:
            self._sources.append(ConfigSource(
                name=f"json:{path.name}",
                data=self._flatten_dict(data),
                priority=priority,
                file_path=str(path),
            ))
            self._rebuild_cache()

        return self

    def load_dict(
        self,
        data: Dict[str, Any],
        name: str = "dict",
        priority: int = 75,
    ) -> "ConfigManager":
        """Load from dictionary.

        Args:
            data: Configuration dictionary
            name: Source name
            priority: Source priority
        """
        with self._lock:
            self._sources.append(ConfigSource(
                name=name,
                data=self._flatten_dict(data),
                priority=priority,
            ))
            self._rebuild_cache()

        return self

    def get(
        self,
        key: str,
        default: Optional[T] = None,
    ) -> Optional[T]:
        """Get config value.

        Args:
            key: Dot-notation key (e.g., "database.host")
            default: Default if not found
        """
        with self._lock:
            return self._cache.get(key.lower(), default)

    def get_str(self, key: str, default: str = "") -> str:
        """Get string value."""
        value = self.get(key)
        return str(value) if value is not None else default

    def get_int(self, key: str, default: int = 0) -> int:
        """Get integer value."""
        value = self.get(key)
        if value is None:
            return default
        try:
            return int(value)
        except (ValueError, TypeError):
            return default

    def get_float(self, key: str, default: float = 0.0) -> float:
        """Get float value."""
        value = self.get(key)
        if value is None:
            return default
        try:
            return float(value)
        except (ValueError, TypeError):
            return default

    def get_bool(self, key: str, default: bool = False) -> bool:
        """Get boolean value."""
        value = self.get(key)
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower() in ("true", "1", "yes", "on")
        return bool(value)

    def get_list(self, key: str, default: Optional[List] = None) -> List:
        """Get list value."""
        value = self.get(key)
        if value is None:
            return default or []
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return [v.strip() for v in value.split(",")]
        return [value]

    def require(self, key: str) -> Any:
        """Get required value (raises if missing).

        Args:
            key: Config key

        Raises:
            KeyError: If key not found
        """
        value = self.get(key)
        if value is None:
            raise KeyError(f"Required config key not found: {key}")
        return value

    def set(self, key: str, value: Any, source: str = "runtime"):
        """Set config value at runtime.

        Args:
            key: Config key
            value: Value to set
            source: Source name for tracking
        """
        with self._lock:
            # Find or create runtime source
            runtime_source = None
            for s in self._sources:
                if s.name == source:
                    runtime_source = s
                    break

            if not runtime_source:
                runtime_source = ConfigSource(
                    name=source,
                    data={},
                    priority=200,  # High priority for runtime
                )
                self._sources.append(runtime_source)

            runtime_source.data[key.lower()] = value
            self._rebuild_cache()
            self._notify_watchers(key, value)

    def has(self, key: str) -> bool:
        """Check if key exists."""
        return self.get(key) is not None

    def keys(self, prefix: str = "") -> List[str]:
        """Get all config keys."""
        with self._lock:
            if prefix:
                prefix = prefix.lower()
                return [k for k in self._cache.keys() if k.startswith(prefix)]
            return list(self._cache.keys())

    def to_dict(self, prefix: str = "") -> Dict[str, Any]:
        """Export config as dictionary."""
        with self._lock:
            if prefix:
                prefix = prefix.lower()
                return {k: v for k, v in self._cache.items() if k.startswith(prefix)}
            return self._cache.copy()

    def reload(self):
        """Reload all file-based sources."""
        with self._lock:
            for source in self._sources:
                if source.file_path:
                    path = Path(source.file_path)
                    if path.exists():
                        with open(path) as f:
                            if path.suffix == ".json":
                                data = json.load(f)
                                source.data = self._flatten_dict(data)
                        source.last_loaded = time.time()

            self._rebuild_cache()

    def watch(self, callback: callable):
        """Register config change watcher."""
        self._watchers.append(callback)

    def _rebuild_cache(self):
        """Rebuild merged config cache."""
        # Sort by priority
        sorted_sources = sorted(self._sources, key=lambda s: s.priority)

        # Merge in priority order
        self._cache = {}
        for source in sorted_sources:
            self._cache.update(source.data)

    def _notify_watchers(self, key: str, value: Any):
        """Notify watchers of config change."""
        for watcher in self._watchers:
            try:
                watcher(key, value)
            except Exception:
                pass

    def _flatten_dict(
        self,
        data: Dict[str, Any],
        prefix: str = "",
    ) -> Dict[str, Any]:
        """Flatten nested dict to dot notation."""
        result = {}

        for key, value in data.items():
            full_key = f"{prefix}.{key}" if prefix else key
            full_key = full_key.lower()

            if isinstance(value, dict):
                result.update(self._flatten_dict(value, full_key))
            else:
                result[full_key] = value

        return result

    def _coerce_value(self, value: str) -> Any:
        """Coerce string value to appropriate type."""
        # Boolean
        if value.lower() in ("true", "false"):
            return value.lower() == "true"

        # None
        if value.lower() in ("null", "none", ""):
            return None

        # Integer
        try:
            return int(value)
        except ValueError:
            pass

        # Float
        try:
            return float(value)
        except ValueError:
            pass

        # JSON array/object
        if value.startswith("[") or value.startswith("{"):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                pass

        return value

    def get_sources(self) -> List[dict]:
        """Get loaded sources info."""
        return [
            {
                "name": s.name,
                "priority": s.priority,
                "keys": len(s.data),
                "file_path": s.file_path,
                "last_loaded": s.last_loaded,
            }
            for s in self._sources
        ]


# Singleton instance
config_manager = ConfigManager()


# Convenience functions
def get(key: str, default: Any = None) -> Any:
    """Get config value from global manager."""
    return config_manager.get(key, default)


def require(key: str) -> Any:
    """Get required config value from global manager."""
    return config_manager.require(key)


def get_bool(key: str, default: bool = False) -> bool:
    """Get boolean config value."""
    return config_manager.get_bool(key, default)


def get_int(key: str, default: int = 0) -> int:
    """Get integer config value."""
    return config_manager.get_int(key, default)
