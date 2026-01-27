"""
Config Loader - Sprint 797

Configuration loading and management.

Features:
- Environment variable loading
- YAML/JSON/TOML config files
- Config validation
- Secret management
- Hot reloading
- Hierarchical configs
"""

import os
import json
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union,
    Type, Generic, Set
)
from enum import Enum
from abc import ABC, abstractmethod
import logging
from pathlib import Path
import threading
import time

logger = logging.getLogger(__name__)


T = TypeVar("T")


class ConfigError(Exception):
    """Configuration error."""
    pass


class ConfigValidationError(ConfigError):
    """Configuration validation error."""
    def __init__(self, errors: List[str]):
        self.errors = errors
        super().__init__("Config validation failed: " + ", ".join(errors))


class ConfigSource(ABC):
    """Abstract configuration source."""

    @abstractmethod
    def load(self) -> Dict[str, Any]:
        """Load configuration from source."""
        pass

    @abstractmethod
    def can_reload(self) -> bool:
        """Check if source supports hot reloading."""
        pass


class EnvironmentSource(ConfigSource):
    """Load config from environment variables."""

    def __init__(
        self,
        prefix: str = "",
        separator: str = "__",
        lowercase: bool = True,
    ):
        self.prefix = prefix
        self.separator = separator
        self.lowercase = lowercase

    def load(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        prefix = self.prefix + self.separator if self.prefix else ""

        for key, value in os.environ.items():
            if prefix and not key.startswith(prefix):
                continue

            # Remove prefix
            config_key = key[len(prefix):] if prefix else key

            # Convert to lowercase if needed
            if self.lowercase:
                config_key = config_key.lower()

            # Parse nested keys (e.g., DATABASE__HOST -> database.host)
            parts = config_key.split(self.separator.lower() if self.lowercase else self.separator)

            # Build nested dict
            current = result
            for part in parts[:-1]:
                if part not in current:
                    current[part] = {}
                current = current[part]

            # Set value (try to parse as JSON for complex types)
            current[parts[-1]] = self._parse_value(value)

        return result

    def _parse_value(self, value: str) -> Any:
        """Parse string value to appropriate type."""
        # Boolean
        if value.lower() in ("true", "yes", "1", "on"):
            return True
        if value.lower() in ("false", "no", "0", "off"):
            return False

        # None
        if value.lower() in ("null", "none", ""):
            return None

        # Try JSON for lists/dicts
        if value.startswith(("[", "{")):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                pass

        # Try number
        try:
            if "." in value:
                return float(value)
            return int(value)
        except ValueError:
            pass

        return value

    def can_reload(self) -> bool:
        return True


class FileSource(ConfigSource):
    """Load config from file (JSON, YAML, TOML)."""

    def __init__(self, path: Union[str, Path], required: bool = True):
        self.path = Path(path)
        self.required = required
        self._last_modified: Optional[float] = None

    def load(self) -> Dict[str, Any]:
        if not self.path.exists():
            if self.required:
                raise ConfigError("Config file not found: " + str(self.path))
            return {}

        self._last_modified = self.path.stat().st_mtime
        content = self.path.read_text()
        suffix = self.path.suffix.lower()

        if suffix == ".json":
            return json.loads(content)
        elif suffix in (".yaml", ".yml"):
            try:
                import yaml
                return yaml.safe_load(content) or {}
            except ImportError:
                raise ConfigError("PyYAML not installed. Install with: pip install pyyaml")
        elif suffix == ".toml":
            try:
                import tomllib
            except ImportError:
                try:
                    import tomli as tomllib  # type: ignore
                except ImportError:
                    raise ConfigError("tomli not installed. Install with: pip install tomli")
            return tomllib.loads(content)
        else:
            raise ConfigError("Unsupported config format: " + suffix)

    def can_reload(self) -> bool:
        return True

    def has_changed(self) -> bool:
        """Check if file has been modified."""
        if not self.path.exists():
            return self._last_modified is not None

        current_mtime = self.path.stat().st_mtime
        return current_mtime != self._last_modified


class DictSource(ConfigSource):
    """Load config from dictionary."""

    def __init__(self, data: Dict[str, Any]):
        self.data = data

    def load(self) -> Dict[str, Any]:
        return dict(self.data)

    def can_reload(self) -> bool:
        return False


class ConfigValidator:
    """Validate configuration."""

    def __init__(self):
        self._rules: List[Callable[[Dict[str, Any]], Optional[str]]] = []

    def add_rule(
        self,
        rule: Callable[[Dict[str, Any]], Optional[str]],
    ) -> "ConfigValidator":
        """Add validation rule. Rule returns error message or None."""
        self._rules.append(rule)
        return self

    def required(self, *keys: str) -> "ConfigValidator":
        """Add required key rules."""
        for key in keys:
            self._rules.append(
                lambda cfg, k=key: (
                    "Required config key missing: " + k
                    if self._get_nested(cfg, k) is None
                    else None
                )
            )
        return self

    def type_check(self, key: str, expected_type: Type) -> "ConfigValidator":
        """Add type check rule."""
        def check(cfg: Dict[str, Any]) -> Optional[str]:
            value = self._get_nested(cfg, key)
            if value is not None and not isinstance(value, expected_type):
                return "Config key '" + key + "' must be " + expected_type.__name__
            return None
        self._rules.append(check)
        return self

    def range_check(
        self,
        key: str,
        min_value: Optional[float] = None,
        max_value: Optional[float] = None,
    ) -> "ConfigValidator":
        """Add numeric range check."""
        def check(cfg: Dict[str, Any]) -> Optional[str]:
            value = self._get_nested(cfg, key)
            if value is None:
                return None
            if not isinstance(value, (int, float)):
                return "Config key '" + key + "' must be numeric"
            if min_value is not None and value < min_value:
                return "Config key '" + key + "' must be >= " + str(min_value)
            if max_value is not None and value > max_value:
                return "Config key '" + key + "' must be <= " + str(max_value)
            return None
        self._rules.append(check)
        return self

    def enum_check(self, key: str, allowed: List[Any]) -> "ConfigValidator":
        """Add enum check."""
        def check(cfg: Dict[str, Any]) -> Optional[str]:
            value = self._get_nested(cfg, key)
            if value is not None and value not in allowed:
                return "Config key '" + key + "' must be one of: " + str(allowed)
            return None
        self._rules.append(check)
        return self

    def validate(self, config: Dict[str, Any]) -> List[str]:
        """Validate config and return errors."""
        errors = []
        for rule in self._rules:
            error = rule(config)
            if error:
                errors.append(error)
        return errors

    def _get_nested(self, data: Dict[str, Any], key: str) -> Any:
        """Get nested value using dot notation."""
        parts = key.split(".")
        current = data
        for part in parts:
            if not isinstance(current, dict) or part not in current:
                return None
            current = current[part]
        return current


@dataclass
class ConfigSchema:
    """Schema definition for config keys."""
    key: str
    type: Type = str
    default: Any = None
    required: bool = False
    description: str = ""
    secret: bool = False
    enum: Optional[List[Any]] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class ConfigManager:
    """Configuration manager with multiple sources and validation.

    Usage:
        config = ConfigManager()

        # Add sources (later sources override earlier ones)
        config.add_source(FileSource("config.yaml"))
        config.add_source(FileSource("config.local.yaml", required=False))
        config.add_source(EnvironmentSource(prefix="APP"))

        # Add validation
        config.validator.required("database.host", "database.port")
        config.validator.type_check("database.port", int)

        # Load config
        config.load()

        # Access values
        db_host = config.get("database.host")
        db_port = config.get("database.port", 5432)
    """

    def __init__(self):
        self._sources: List[ConfigSource] = []
        self._config: Dict[str, Any] = {}
        self._lock = threading.RLock()
        self.validator = ConfigValidator()
        self._reload_callback: Optional[Callable[[Dict[str, Any]], None]] = None
        self._watching = False
        self._schema: Dict[str, ConfigSchema] = {}

    def add_source(self, source: ConfigSource) -> "ConfigManager":
        """Add configuration source."""
        self._sources.append(source)
        return self

    def add_schema(self, schema: ConfigSchema) -> "ConfigManager":
        """Add config schema definition."""
        self._schema[schema.key] = schema

        # Auto-add validation rules from schema
        if schema.required:
            self.validator.required(schema.key)
        if schema.type:
            self.validator.type_check(schema.key, schema.type)
        if schema.enum:
            self.validator.enum_check(schema.key, schema.enum)
        if schema.min_value is not None or schema.max_value is not None:
            self.validator.range_check(schema.key, schema.min_value, schema.max_value)

        return self

    def load(self, validate: bool = True) -> Dict[str, Any]:
        """Load configuration from all sources."""
        with self._lock:
            self._config = {}

            # Apply defaults from schema
            for schema in self._schema.values():
                if schema.default is not None:
                    self._set_nested(self._config, schema.key, schema.default)

            # Load from sources (later overrides earlier)
            for source in self._sources:
                try:
                    source_config = source.load()
                    self._deep_merge(self._config, source_config)
                except Exception as e:
                    logger.error("Failed to load config from source: " + str(e))
                    raise

            # Validate
            if validate:
                errors = self.validator.validate(self._config)
                if errors:
                    raise ConfigValidationError(errors)

            logger.info("Configuration loaded successfully")
            return dict(self._config)

    def reload(self) -> bool:
        """Reload configuration if any source has changed."""
        try:
            new_config = self.load(validate=True)
            if self._reload_callback:
                self._reload_callback(new_config)
            return True
        except Exception as e:
            logger.error("Failed to reload config: " + str(e))
            return False

    def get(self, key: str, default: Any = None) -> Any:
        """Get config value using dot notation."""
        with self._lock:
            value = self._get_nested(self._config, key)
            if value is None:
                # Check schema for default
                if key in self._schema and self._schema[key].default is not None:
                    return self._schema[key].default
                return default
            return value

    def get_all(self) -> Dict[str, Any]:
        """Get all configuration."""
        with self._lock:
            return dict(self._config)

    def get_section(self, prefix: str) -> Dict[str, Any]:
        """Get config section by prefix."""
        with self._lock:
            section = self._get_nested(self._config, prefix)
            return dict(section) if isinstance(section, dict) else {}

    def set(self, key: str, value: Any) -> None:
        """Set config value at runtime."""
        with self._lock:
            self._set_nested(self._config, key, value)

    def on_reload(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """Set callback for config reload."""
        self._reload_callback = callback

    def watch(self, interval: float = 5.0) -> None:
        """Watch for config file changes."""
        if self._watching:
            return

        self._watching = True

        def _watch_thread() -> None:
            while self._watching:
                time.sleep(interval)
                for source in self._sources:
                    if isinstance(source, FileSource) and source.has_changed():
                        logger.info("Config file changed, reloading...")
                        self.reload()
                        break

        thread = threading.Thread(target=_watch_thread, daemon=True)
        thread.start()

    def stop_watching(self) -> None:
        """Stop watching for changes."""
        self._watching = False

    def to_dict(self, include_secrets: bool = False) -> Dict[str, Any]:
        """Export config as dict, optionally masking secrets."""
        with self._lock:
            if include_secrets:
                return dict(self._config)

            result = dict(self._config)
            for schema in self._schema.values():
                if schema.secret:
                    value = self._get_nested(result, schema.key)
                    if value is not None:
                        self._set_nested(result, schema.key, "***REDACTED***")
            return result

    def _get_nested(self, data: Dict[str, Any], key: str) -> Any:
        """Get nested value using dot notation."""
        parts = key.split(".")
        current = data
        for part in parts:
            if not isinstance(current, dict) or part not in current:
                return None
            current = current[part]
        return current

    def _set_nested(self, data: Dict[str, Any], key: str, value: Any) -> None:
        """Set nested value using dot notation."""
        parts = key.split(".")
        current = data
        for part in parts[:-1]:
            if part not in current:
                current[part] = {}
            current = current[part]
        current[parts[-1]] = value

    def _deep_merge(self, base: Dict[str, Any], override: Dict[str, Any]) -> None:
        """Deep merge override into base."""
        for key, value in override.items():
            if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                self._deep_merge(base[key], value)
            else:
                base[key] = value


class SecretManager:
    """Manage secrets with encryption/masking.

    Usage:
        secrets = SecretManager()
        secrets.set("api_key", "sk-12345")

        # Get secret (returns real value)
        key = secrets.get("api_key")

        # Get masked value (for logging)
        masked = secrets.get_masked("api_key")  # "sk-1****"
    """

    def __init__(self, mask_char: str = "*", visible_chars: int = 4):
        self._secrets: Dict[str, str] = {}
        self._lock = threading.RLock()
        self._mask_char = mask_char
        self._visible_chars = visible_chars

    def set(self, key: str, value: str) -> None:
        """Set a secret."""
        with self._lock:
            self._secrets[key] = value

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        """Get a secret value."""
        with self._lock:
            return self._secrets.get(key, default)

    def get_masked(self, key: str) -> Optional[str]:
        """Get masked secret for logging."""
        with self._lock:
            value = self._secrets.get(key)
            if not value:
                return None
            return self._mask(value)

    def delete(self, key: str) -> bool:
        """Delete a secret."""
        with self._lock:
            if key in self._secrets:
                del self._secrets[key]
                return True
            return False

    def keys(self) -> List[str]:
        """Get all secret keys."""
        with self._lock:
            return list(self._secrets.keys())

    def _mask(self, value: str) -> str:
        """Mask a secret value."""
        if len(value) <= self._visible_chars:
            return self._mask_char * len(value)
        return value[:self._visible_chars] + self._mask_char * (len(value) - self._visible_chars)

    def load_from_env(self, mapping: Dict[str, str]) -> None:
        """Load secrets from environment variables.

        Args:
            mapping: Dict of secret_key -> env_var_name
        """
        for key, env_var in mapping.items():
            value = os.environ.get(env_var)
            if value:
                self.set(key, value)


# Global instances
_config_manager: Optional[ConfigManager] = None
_secret_manager: Optional[SecretManager] = None


def get_config() -> ConfigManager:
    """Get global config manager."""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager


def get_secrets() -> SecretManager:
    """Get global secret manager."""
    global _secret_manager
    if _secret_manager is None:
        _secret_manager = SecretManager()
    return _secret_manager
