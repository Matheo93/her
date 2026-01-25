"""
Config Manager - Sprint 639

Dynamic configuration management.

Features:
- Runtime config updates
- Environment-aware
- Config validation
- Config history
- Change notifications
"""

import time
import os
import json
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Callable, TypeVar, Generic
from enum import Enum
from threading import Lock
from pathlib import Path


class ConfigSource(str, Enum):
    """Config value source."""
    DEFAULT = "default"
    FILE = "file"
    ENVIRONMENT = "environment"
    RUNTIME = "runtime"
    REMOTE = "remote"


class ConfigType(str, Enum):
    """Config value type."""
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    JSON = "json"
    LIST = "list"


@dataclass
class ConfigValue:
    """A configuration value."""
    key: str
    value: Any
    default: Any
    source: ConfigSource
    config_type: ConfigType
    description: str = ""
    required: bool = False
    secret: bool = False
    validators: List[str] = field(default_factory=list)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self, include_secret: bool = False) -> dict:
        return {
            "key": self.key,
            "value": "***" if self.secret and not include_secret else self.value,
            "default": "***" if self.secret else self.default,
            "source": self.source.value,
            "type": self.config_type.value,
            "description": self.description,
            "required": self.required,
            "secret": self.secret,
            "updated_at": self.updated_at,
        }


@dataclass
class ConfigChange:
    """A config change record."""
    key: str
    old_value: Any
    new_value: Any
    source: ConfigSource
    timestamp: float = field(default_factory=time.time)
    reason: str = ""


class ConfigSchema:
    """Config schema definition."""

    def __init__(self):
        self._definitions: Dict[str, Dict[str, Any]] = {}

    def define(
        self,
        key: str,
        config_type: ConfigType,
        default: Any = None,
        description: str = "",
        required: bool = False,
        secret: bool = False,
        validators: Optional[List[Callable]] = None,
        env_var: Optional[str] = None
    ):
        """Define a config key.

        Args:
            key: Config key
            config_type: Value type
            default: Default value
            description: Description
            required: Is required
            secret: Is secret
            validators: Validation functions
            env_var: Environment variable name
        """
        self._definitions[key] = {
            "type": config_type,
            "default": default,
            "description": description,
            "required": required,
            "secret": secret,
            "validators": validators or [],
            "env_var": env_var or key.upper().replace(".", "_"),
        }

    def get_definition(self, key: str) -> Optional[Dict[str, Any]]:
        """Get a config definition."""
        return self._definitions.get(key)

    def list_definitions(self) -> List[Dict[str, Any]]:
        """List all definitions."""
        return [
            {"key": k, **v}
            for k, v in self._definitions.items()
        ]


class ConfigManager:
    """Dynamic configuration manager.

    Usage:
        config = ConfigManager()

        # Define schema
        config.schema.define(
            "api.timeout",
            ConfigType.INTEGER,
            default=30,
            description="API request timeout"
        )

        # Get config
        timeout = config.get("api.timeout")

        # Set runtime config
        config.set("api.timeout", 60)

        # Watch for changes
        config.watch("api.*", lambda key, old, new: print(f"{key} changed"))
    """

    def __init__(self, env: str = "development"):
        """Initialize config manager.

        Args:
            env: Environment name
        """
        self.env = env
        self.schema = ConfigSchema()
        self._values: Dict[str, ConfigValue] = {}
        self._history: List[ConfigChange] = []
        self._watchers: Dict[str, List[Callable]] = {}
        self._lock = Lock()
        self._max_history = 1000

    def _coerce_value(self, value: Any, config_type: ConfigType) -> Any:
        """Coerce value to expected type."""
        if value is None:
            return None

        if config_type == ConfigType.STRING:
            return str(value)
        elif config_type == ConfigType.INTEGER:
            return int(value)
        elif config_type == ConfigType.FLOAT:
            return float(value)
        elif config_type == ConfigType.BOOLEAN:
            if isinstance(value, bool):
                return value
            if isinstance(value, str):
                return value.lower() in ("true", "1", "yes", "on")
            return bool(value)
        elif config_type == ConfigType.JSON:
            if isinstance(value, str):
                return json.loads(value)
            return value
        elif config_type == ConfigType.LIST:
            if isinstance(value, str):
                return [v.strip() for v in value.split(",")]
            return list(value)

        return value

    def _validate_value(
        self,
        key: str,
        value: Any,
        validators: List[Callable]
    ) -> bool:
        """Validate a config value."""
        for validator in validators:
            try:
                if not validator(value):
                    return False
            except Exception:
                return False
        return True

    def load_from_env(self):
        """Load config from environment variables."""
        for key, definition in self.schema._definitions.items():
            env_var = definition.get("env_var", key.upper().replace(".", "_"))
            env_value = os.environ.get(env_var)

            if env_value is not None:
                try:
                    coerced = self._coerce_value(env_value, definition["type"])
                    self._set_value(
                        key,
                        coerced,
                        ConfigSource.ENVIRONMENT,
                        definition
                    )
                except Exception:
                    pass

    def load_from_file(self, path: str):
        """Load config from JSON file.

        Args:
            path: Path to config file
        """
        file_path = Path(path)
        if not file_path.exists():
            return

        with open(file_path) as f:
            data = json.load(f)

        self._load_from_dict(data, ConfigSource.FILE)

    def _load_from_dict(self, data: Dict[str, Any], source: ConfigSource):
        """Load config from dictionary."""
        for key, value in self._flatten_dict(data).items():
            definition = self.schema.get_definition(key)
            if definition:
                try:
                    coerced = self._coerce_value(value, definition["type"])
                    self._set_value(key, coerced, source, definition)
                except Exception:
                    pass

    def _flatten_dict(
        self,
        d: Dict[str, Any],
        parent_key: str = "",
        sep: str = "."
    ) -> Dict[str, Any]:
        """Flatten nested dictionary."""
        items = []
        for k, v in d.items():
            new_key = parent_key + sep + k if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten_dict(v, new_key, sep).items())
            else:
                items.append((new_key, v))
        return dict(items)

    def _set_value(
        self,
        key: str,
        value: Any,
        source: ConfigSource,
        definition: Dict[str, Any]
    ):
        """Set a config value."""
        with self._lock:
            old_value = self._values.get(key)

            config_value = ConfigValue(
                key=key,
                value=value,
                default=definition.get("default"),
                source=source,
                config_type=definition["type"],
                description=definition.get("description", ""),
                required=definition.get("required", False),
                secret=definition.get("secret", False),
            )

            self._values[key] = config_value

            # Record history
            if old_value:
                change = ConfigChange(
                    key=key,
                    old_value=old_value.value,
                    new_value=value,
                    source=source,
                )
                self._history.append(change)
                if len(self._history) > self._max_history:
                    self._history = self._history[-self._max_history:]

                # Notify watchers
                self._notify_watchers(key, old_value.value, value)

    def _notify_watchers(self, key: str, old_value: Any, new_value: Any):
        """Notify watchers of config change."""
        for pattern, handlers in self._watchers.items():
            if self._matches_pattern(key, pattern):
                for handler in handlers:
                    try:
                        handler(key, old_value, new_value)
                    except Exception:
                        pass

    def _matches_pattern(self, key: str, pattern: str) -> bool:
        """Check if key matches pattern."""
        if pattern == "*":
            return True

        if pattern.endswith(".*"):
            prefix = pattern[:-2]
            return key.startswith(prefix + ".")

        return key == pattern

    def get(self, key: str, default: Any = None) -> Any:
        """Get a config value.

        Args:
            key: Config key
            default: Default if not found

        Returns:
            Config value
        """
        with self._lock:
            config_value = self._values.get(key)

            if config_value:
                return config_value.value

            # Check schema for default
            definition = self.schema.get_definition(key)
            if definition:
                return definition.get("default", default)

            return default

    def set(
        self,
        key: str,
        value: Any,
        reason: str = ""
    ) -> bool:
        """Set a runtime config value.

        Args:
            key: Config key
            value: New value
            reason: Change reason

        Returns:
            True if set successfully
        """
        definition = self.schema.get_definition(key)
        if not definition:
            return False

        try:
            coerced = self._coerce_value(value, definition["type"])

            # Validate
            validators = definition.get("validators", [])
            if not self._validate_value(key, coerced, validators):
                return False

            self._set_value(key, coerced, ConfigSource.RUNTIME, definition)
            return True

        except Exception:
            return False

    def reset(self, key: str) -> bool:
        """Reset config to default value.

        Args:
            key: Config key

        Returns:
            True if reset
        """
        definition = self.schema.get_definition(key)
        if not definition:
            return False

        default = definition.get("default")
        return self.set(key, default, reason="reset to default")

    def watch(self, pattern: str, handler: Callable):
        """Watch for config changes.

        Args:
            pattern: Key pattern (e.g., "api.*" or "*")
            handler: Handler function (key, old_value, new_value)
        """
        with self._lock:
            if pattern not in self._watchers:
                self._watchers[pattern] = []
            self._watchers[pattern].append(handler)

    def unwatch(self, pattern: str, handler: Callable):
        """Stop watching for changes.

        Args:
            pattern: Key pattern
            handler: Handler to remove
        """
        with self._lock:
            if pattern in self._watchers:
                self._watchers[pattern] = [
                    h for h in self._watchers[pattern]
                    if h != handler
                ]

    def get_all(self, include_secrets: bool = False) -> Dict[str, Any]:
        """Get all config values.

        Args:
            include_secrets: Include secret values

        Returns:
            Dict of all configs
        """
        with self._lock:
            return {
                key: cv.to_dict(include_secret=include_secrets)
                for key, cv in self._values.items()
            }

    def get_history(
        self,
        key: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get config change history.

        Args:
            key: Filter by key
            limit: Max items

        Returns:
            List of changes
        """
        with self._lock:
            changes = list(self._history)

        if key:
            changes = [c for c in changes if c.key == key]

        changes = sorted(changes, key=lambda c: c.timestamp, reverse=True)

        return [
            {
                "key": c.key,
                "old_value": c.old_value,
                "new_value": c.new_value,
                "source": c.source.value,
                "timestamp": c.timestamp,
                "reason": c.reason,
            }
            for c in changes[:limit]
        ]

    def export(self, include_secrets: bool = False) -> Dict[str, Any]:
        """Export config as dictionary.

        Args:
            include_secrets: Include secret values

        Returns:
            Config dictionary
        """
        result = {}
        with self._lock:
            for key, cv in self._values.items():
                value = cv.value if (include_secrets or not cv.secret) else "***"
                parts = key.split(".")
                current = result
                for part in parts[:-1]:
                    current = current.setdefault(part, {})
                current[parts[-1]] = value
        return result

    def get_stats(self) -> Dict[str, Any]:
        """Get config statistics.

        Returns:
            Statistics dict
        """
        with self._lock:
            values = list(self._values.values())

        by_source = {}
        for source in ConfigSource:
            by_source[source.value] = len([v for v in values if v.source == source])

        by_type = {}
        for ctype in ConfigType:
            by_type[ctype.value] = len([v for v in values if v.config_type == ctype])

        return {
            "total_configs": len(values),
            "by_source": by_source,
            "by_type": by_type,
            "secrets_count": len([v for v in values if v.secret]),
            "required_count": len([v for v in values if v.required]),
            "history_size": len(self._history),
            "watchers_count": sum(len(h) for h in self._watchers.values()),
            "environment": self.env,
        }


# Singleton instance
config_manager = ConfigManager(
    env=os.environ.get("APP_ENV", "development")
)


# Define common configs
config_manager.schema.define(
    "app.name",
    ConfigType.STRING,
    default="EVA Voice",
    description="Application name"
)

config_manager.schema.define(
    "app.debug",
    ConfigType.BOOLEAN,
    default=False,
    description="Debug mode"
)

config_manager.schema.define(
    "api.timeout",
    ConfigType.INTEGER,
    default=30,
    description="API request timeout in seconds"
)

config_manager.schema.define(
    "api.rate_limit",
    ConfigType.INTEGER,
    default=100,
    description="Requests per minute"
)

config_manager.schema.define(
    "tts.default_voice",
    ConfigType.STRING,
    default="eva",
    description="Default TTS voice"
)

config_manager.schema.define(
    "llm.max_tokens",
    ConfigType.INTEGER,
    default=1024,
    description="Max LLM tokens"
)

config_manager.schema.define(
    "cache.ttl",
    ConfigType.INTEGER,
    default=3600,
    description="Cache TTL in seconds"
)

# Load from environment
config_manager.load_from_env()
