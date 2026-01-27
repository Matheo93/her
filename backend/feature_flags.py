"""
Feature Flags - Sprint 743

Feature flag management system.

Features:
- Boolean and percentage flags
- User targeting
- Environment-based flags
- A/B testing support
- Flag persistence
"""

import time
import json
import hashlib
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union, Set
)
from enum import Enum
from abc import ABC, abstractmethod


T = TypeVar("T")


class FlagType(str, Enum):
    """Flag types."""
    BOOLEAN = "boolean"
    PERCENTAGE = "percentage"
    VARIANT = "variant"
    USER_LIST = "user_list"
    ENVIRONMENT = "environment"


class Environment(str, Enum):
    """Deployment environments."""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


@dataclass
class FlagRule:
    """Targeting rule for a flag."""
    type: str  # user_id, email, attribute, percentage
    operator: str  # equals, contains, in, greater_than, etc.
    value: Any
    enabled: bool = True


@dataclass
class FlagVariant:
    """A/B test variant."""
    name: str
    weight: int = 1
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FeatureFlag:
    """Feature flag definition."""
    key: str
    name: str
    description: str = ""
    flag_type: FlagType = FlagType.BOOLEAN
    enabled: bool = False
    default_value: Any = None
    percentage: float = 0.0
    variants: List[FlagVariant] = field(default_factory=list)
    rules: List[FlagRule] = field(default_factory=list)
    environments: List[Environment] = field(default_factory=list)
    user_whitelist: Set[str] = field(default_factory=set)
    user_blacklist: Set[str] = field(default_factory=set)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "key": self.key,
            "name": self.name,
            "description": self.description,
            "flag_type": self.flag_type.value,
            "enabled": self.enabled,
            "default_value": self.default_value,
            "percentage": self.percentage,
            "variants": [{"name": v.name, "weight": v.weight, "payload": v.payload} for v in self.variants],
            "environments": [e.value for e in self.environments],
            "user_whitelist": list(self.user_whitelist),
            "user_blacklist": list(self.user_blacklist),
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "metadata": self.metadata,
        }


@dataclass
class FlagContext:
    """Context for flag evaluation."""
    user_id: Optional[str] = None
    email: Optional[str] = None
    environment: Environment = Environment.DEVELOPMENT
    attributes: Dict[str, Any] = field(default_factory=dict)

    def get(self, key: str, default: Any = None) -> Any:
        """Get context value."""
        if key == "user_id":
            return self.user_id
        if key == "email":
            return self.email
        if key == "environment":
            return self.environment
        return self.attributes.get(key, default)


class FlagStore(ABC):
    """Abstract flag storage."""

    @abstractmethod
    def get(self, key: str) -> Optional[FeatureFlag]:
        """Get flag by key."""
        pass

    @abstractmethod
    def set(self, flag: FeatureFlag) -> None:
        """Store flag."""
        pass

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Delete flag."""
        pass

    @abstractmethod
    def list(self) -> List[FeatureFlag]:
        """List all flags."""
        pass


class MemoryFlagStore(FlagStore):
    """In-memory flag storage."""

    def __init__(self):
        self._flags: Dict[str, FeatureFlag] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[FeatureFlag]:
        return self._flags.get(key)

    def set(self, flag: FeatureFlag) -> None:
        with self._lock:
            flag.updated_at = time.time()
            self._flags[flag.key] = flag

    def delete(self, key: str) -> bool:
        with self._lock:
            if key in self._flags:
                del self._flags[key]
                return True
            return False

    def list(self) -> List[FeatureFlag]:
        return list(self._flags.values())


class FeatureFlagManager:
    """Feature flag manager.

    Usage:
        flags = FeatureFlagManager()

        # Create flag
        flags.create("new_feature", "New Feature", enabled=True)

        # Check flag
        if flags.is_enabled("new_feature"):
            # New feature code
            pass

        # With context
        ctx = FlagContext(user_id="user-123")
        if flags.is_enabled("beta_feature", ctx):
            # Beta feature for specific user
            pass

        # Percentage rollout
        flags.create("gradual_rollout", "Gradual", flag_type=FlagType.PERCENTAGE, percentage=25.0)

        # A/B testing
        flags.create(
            "experiment",
            "A/B Test",
            flag_type=FlagType.VARIANT,
            variants=[
                FlagVariant("control", weight=1),
                FlagVariant("treatment", weight=1),
            ]
        )
        variant = flags.get_variant("experiment", ctx)
    """

    def __init__(
        self,
        store: Optional[FlagStore] = None,
        environment: Environment = Environment.DEVELOPMENT,
    ):
        """Initialize feature flag manager."""
        self._store = store or MemoryFlagStore()
        self._environment = environment
        self._listeners: List[Callable[[str, bool], None]] = []
        self._cache: Dict[str, tuple] = {}
        self._cache_ttl = 60.0

    def create(
        self,
        key: str,
        name: str,
        description: str = "",
        flag_type: FlagType = FlagType.BOOLEAN,
        enabled: bool = False,
        default_value: Any = None,
        percentage: float = 0.0,
        variants: Optional[List[FlagVariant]] = None,
        environments: Optional[List[Environment]] = None,
    ) -> FeatureFlag:
        """Create a feature flag."""
        flag = FeatureFlag(
            key=key,
            name=name,
            description=description,
            flag_type=flag_type,
            enabled=enabled,
            default_value=default_value,
            percentage=percentage,
            variants=variants or [],
            environments=environments or [Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION],
        )
        self._store.set(flag)
        return flag

    def get_flag(self, key: str) -> Optional[FeatureFlag]:
        """Get flag by key."""
        return self._store.get(key)

    def update(self, key: str, **kwargs: Any) -> Optional[FeatureFlag]:
        """Update flag properties."""
        flag = self._store.get(key)
        if not flag:
            return None

        for k, v in kwargs.items():
            if hasattr(flag, k):
                setattr(flag, k, v)

        self._store.set(flag)
        self._invalidate_cache(key)
        return flag

    def delete(self, key: str) -> bool:
        """Delete a flag."""
        self._invalidate_cache(key)
        return self._store.delete(key)

    def list_flags(self) -> List[FeatureFlag]:
        """List all flags."""
        return self._store.list()

    def is_enabled(
        self,
        key: str,
        context: Optional[FlagContext] = None,
        default: bool = False,
    ) -> bool:
        """Check if flag is enabled.

        Args:
            key: Flag key
            context: Evaluation context
            default: Default value if flag not found

        Returns:
            Whether flag is enabled
        """
        flag = self._store.get(key)
        if not flag:
            return default

        # Check environment
        ctx = context or FlagContext(environment=self._environment)
        if flag.environments and ctx.environment not in flag.environments:
            return False

        # Check master switch
        if not flag.enabled:
            return False

        # Check blacklist
        if ctx.user_id and ctx.user_id in flag.user_blacklist:
            return False

        # Check whitelist
        if ctx.user_id and ctx.user_id in flag.user_whitelist:
            return True

        # Evaluate by type
        if flag.flag_type == FlagType.BOOLEAN:
            return flag.enabled

        if flag.flag_type == FlagType.PERCENTAGE:
            return self._evaluate_percentage(flag, ctx)

        if flag.flag_type == FlagType.USER_LIST:
            return ctx.user_id in flag.user_whitelist if ctx.user_id else False

        if flag.flag_type == FlagType.ENVIRONMENT:
            return ctx.environment in flag.environments

        return flag.enabled

    def get_value(
        self,
        key: str,
        context: Optional[FlagContext] = None,
        default: Any = None,
    ) -> Any:
        """Get flag value."""
        flag = self._store.get(key)
        if not flag or not self.is_enabled(key, context):
            return default
        return flag.default_value if flag.default_value is not None else default

    def get_variant(
        self,
        key: str,
        context: Optional[FlagContext] = None,
    ) -> Optional[FlagVariant]:
        """Get variant for A/B test."""
        flag = self._store.get(key)
        if not flag or flag.flag_type != FlagType.VARIANT:
            return None

        if not self.is_enabled(key, context):
            return None

        return self._select_variant(flag, context)

    def _evaluate_percentage(self, flag: FeatureFlag, context: FlagContext) -> bool:
        """Evaluate percentage-based flag."""
        if flag.percentage <= 0:
            return False
        if flag.percentage >= 100:
            return True

        # Consistent hashing based on user_id or random
        hash_key = f"{flag.key}:{context.user_id or ''}"
        hash_value = int(hashlib.md5(hash_key.encode()).hexdigest()[:8], 16)
        bucket = hash_value % 100

        return bucket < flag.percentage

    def _select_variant(
        self,
        flag: FeatureFlag,
        context: Optional[FlagContext],
    ) -> Optional[FlagVariant]:
        """Select variant based on weights."""
        if not flag.variants:
            return None

        total_weight = sum(v.weight for v in flag.variants)
        if total_weight == 0:
            return flag.variants[0] if flag.variants else None

        # Consistent hashing
        ctx = context or FlagContext()
        hash_key = f"{flag.key}:{ctx.user_id or ''}"
        hash_value = int(hashlib.md5(hash_key.encode()).hexdigest()[:8], 16)
        bucket = hash_value % total_weight

        cumulative = 0
        for variant in flag.variants:
            cumulative += variant.weight
            if bucket < cumulative:
                return variant

        return flag.variants[-1]

    def _invalidate_cache(self, key: str) -> None:
        """Invalidate cache for key."""
        if key in self._cache:
            del self._cache[key]

    def on_change(self, callback: Callable[[str, bool], None]) -> None:
        """Register change callback."""
        self._listeners.append(callback)

    def enable(self, key: str) -> bool:
        """Enable a flag."""
        flag = self.update(key, enabled=True)
        if flag:
            for listener in self._listeners:
                listener(key, True)
            return True
        return False

    def disable(self, key: str) -> bool:
        """Disable a flag."""
        flag = self.update(key, enabled=False)
        if flag:
            for listener in self._listeners:
                listener(key, False)
            return True
        return False

    def add_to_whitelist(self, key: str, user_id: str) -> bool:
        """Add user to whitelist."""
        flag = self._store.get(key)
        if flag:
            flag.user_whitelist.add(user_id)
            self._store.set(flag)
            return True
        return False

    def remove_from_whitelist(self, key: str, user_id: str) -> bool:
        """Remove user from whitelist."""
        flag = self._store.get(key)
        if flag and user_id in flag.user_whitelist:
            flag.user_whitelist.remove(user_id)
            self._store.set(flag)
            return True
        return False

    def add_to_blacklist(self, key: str, user_id: str) -> bool:
        """Add user to blacklist."""
        flag = self._store.get(key)
        if flag:
            flag.user_blacklist.add(user_id)
            self._store.set(flag)
            return True
        return False

    def set_percentage(self, key: str, percentage: float) -> bool:
        """Set percentage for gradual rollout."""
        if not 0 <= percentage <= 100:
            return False
        flag = self.update(key, percentage=percentage)
        return flag is not None


# Singleton instance
feature_flags = FeatureFlagManager()


# Convenience functions
def create_flag(
    key: str,
    name: str,
    enabled: bool = False,
    **kwargs: Any,
) -> FeatureFlag:
    """Create a feature flag."""
    return feature_flags.create(key, name, enabled=enabled, **kwargs)


def is_enabled(key: str, context: Optional[FlagContext] = None) -> bool:
    """Check if flag is enabled."""
    return feature_flags.is_enabled(key, context)


def get_variant(key: str, context: Optional[FlagContext] = None) -> Optional[FlagVariant]:
    """Get A/B test variant."""
    return feature_flags.get_variant(key, context)


def flag(key: str, default: bool = False) -> Callable:
    """Decorator for feature-flagged functions.

    Usage:
        @flag("new_algorithm")
        def process_data(data):
            # New algorithm
            pass

        # Falls back to default behavior if flag is disabled
    """
    def decorator(func: Callable) -> Callable:
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            if is_enabled(key):
                return func(*args, **kwargs)
            return None
        return wrapper
    return decorator
