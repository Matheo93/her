"""
Feature Flags - Sprint 805

Feature flag management with rules and targeting.

Features:
- Boolean and multivariate flags
- User/group targeting
- Percentage rollouts
- Rule-based evaluation
- Flag persistence
- Override support
"""

import hashlib
import json
import logging
import random
import re
import time
import threading
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import (
    Any, Callable, Dict, Generic, List, Optional, Set, TypeVar, Union
)

logger = logging.getLogger(__name__)


T = TypeVar("T")


class FlagType(str, Enum):
    """Type of feature flag."""
    BOOLEAN = "boolean"
    STRING = "string"
    NUMBER = "number"
    JSON = "json"


class OperatorType(str, Enum):
    """Comparison operators for rules."""
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    MATCHES = "matches"
    IN = "in"
    NOT_IN = "not_in"
    GREATER_THAN = "greater_than"
    LESS_THAN = "less_than"
    GREATER_EQUAL = "greater_equal"
    LESS_EQUAL = "less_equal"


@dataclass
class EvaluationContext:
    """Context for evaluating feature flags.

    Usage:
        context = EvaluationContext(
            user_id="user-123",
            attributes={
                "email": "user@example.com",
                "plan": "premium",
                "country": "US",
            }
        )
    """
    user_id: Optional[str] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    groups: List[str] = field(default_factory=list)

    def get_attribute(self, key: str, default: Any = None) -> Any:
        """Get attribute value."""
        return self.attributes.get(key, default)

    def has_group(self, group: str) -> bool:
        """Check if context has a group."""
        return group in self.groups


@dataclass
class Condition:
    """Single condition for rule evaluation.

    Usage:
        condition = Condition(
            attribute="plan",
            operator=OperatorType.EQUALS,
            value="premium"
        )
    """
    attribute: str
    operator: OperatorType
    value: Any

    def evaluate(self, context: EvaluationContext) -> bool:
        """Evaluate condition against context."""
        attr_value = context.get_attribute(self.attribute)

        if attr_value is None:
            return False

        op = self.operator

        if op == OperatorType.EQUALS:
            return attr_value == self.value
        elif op == OperatorType.NOT_EQUALS:
            return attr_value != self.value
        elif op == OperatorType.CONTAINS:
            return self.value in str(attr_value)
        elif op == OperatorType.NOT_CONTAINS:
            return self.value not in str(attr_value)
        elif op == OperatorType.STARTS_WITH:
            return str(attr_value).startswith(str(self.value))
        elif op == OperatorType.ENDS_WITH:
            return str(attr_value).endswith(str(self.value))
        elif op == OperatorType.MATCHES:
            return bool(re.match(str(self.value), str(attr_value)))
        elif op == OperatorType.IN:
            return attr_value in self.value
        elif op == OperatorType.NOT_IN:
            return attr_value not in self.value
        elif op == OperatorType.GREATER_THAN:
            return float(attr_value) > float(self.value)
        elif op == OperatorType.LESS_THAN:
            return float(attr_value) < float(self.value)
        elif op == OperatorType.GREATER_EQUAL:
            return float(attr_value) >= float(self.value)
        elif op == OperatorType.LESS_EQUAL:
            return float(attr_value) <= float(self.value)

        return False


@dataclass
class Rule:
    """Rule with conditions and result value.

    Usage:
        rule = Rule(
            id="premium-users",
            conditions=[
                Condition("plan", OperatorType.EQUALS, "premium"),
                Condition("country", OperatorType.IN, ["US", "CA"]),
            ],
            value=True,
            match_all=True  # All conditions must match
        )
    """
    id: str
    conditions: List[Condition]
    value: Any
    match_all: bool = True
    priority: int = 0

    def evaluate(self, context: EvaluationContext) -> Optional[Any]:
        """Evaluate rule against context. Returns value if matches, None otherwise."""
        if not self.conditions:
            return self.value

        if self.match_all:
            # All conditions must match
            if all(c.evaluate(context) for c in self.conditions):
                return self.value
        else:
            # Any condition can match
            if any(c.evaluate(context) for c in self.conditions):
                return self.value

        return None


@dataclass
class Variant(Generic[T]):
    """Variant for multivariate flags.

    Usage:
        variants = [
            Variant(name="control", value="old_button", weight=50),
            Variant(name="treatment", value="new_button", weight=50),
        ]
    """
    name: str
    value: T
    weight: int = 100


@dataclass
class PercentageRollout:
    """Percentage-based rollout configuration.

    Usage:
        rollout = PercentageRollout(
            percentage=25,  # 25% of users
            sticky_key="user_id"  # Consistent assignment
        )
    """
    percentage: float  # 0-100
    sticky_key: Optional[str] = "user_id"
    seed: str = ""

    def is_enabled(self, context: EvaluationContext) -> bool:
        """Check if rollout is enabled for context."""
        if self.percentage <= 0:
            return False
        if self.percentage >= 100:
            return True

        # Get sticky value
        if self.sticky_key:
            sticky_value = context.get_attribute(self.sticky_key)
            if sticky_value is None and self.sticky_key == "user_id":
                sticky_value = context.user_id

            if sticky_value:
                # Hash-based consistent assignment
                hash_input = str(sticky_value) + self.seed
                hash_value = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)
                bucket = hash_value % 100
                return bucket < self.percentage

        # Random assignment
        return random.random() * 100 < self.percentage


@dataclass
class FeatureFlag(Generic[T]):
    """Feature flag with rules and targeting.

    Usage:
        flag = FeatureFlag(
            key="new_checkout",
            default_value=False,
            flag_type=FlagType.BOOLEAN,
            enabled=True,
            rules=[...],
            rollout=PercentageRollout(percentage=25),
        )
    """
    key: str
    default_value: T
    flag_type: FlagType = FlagType.BOOLEAN
    enabled: bool = True
    description: str = ""
    rules: List[Rule] = field(default_factory=list)
    rollout: Optional[PercentageRollout] = None
    variants: List[Variant] = field(default_factory=list)
    target_users: Set[str] = field(default_factory=set)
    target_groups: Set[str] = field(default_factory=set)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def evaluate(self, context: EvaluationContext) -> T:
        """Evaluate flag for given context."""
        # Flag disabled
        if not self.enabled:
            return self.default_value

        # Check target users
        if context.user_id and context.user_id in self.target_users:
            return self._get_enabled_value()

        # Check target groups
        for group in context.groups:
            if group in self.target_groups:
                return self._get_enabled_value()

        # Evaluate rules by priority
        sorted_rules = sorted(self.rules, key=lambda r: r.priority, reverse=True)
        for rule in sorted_rules:
            result = rule.evaluate(context)
            if result is not None:
                return result

        # Check percentage rollout
        if self.rollout and self.rollout.is_enabled(context):
            return self._get_enabled_value()

        return self.default_value

    def _get_enabled_value(self) -> T:
        """Get the enabled value, considering variants."""
        if self.variants:
            return self._select_variant()

        # For boolean flags, return True
        if self.flag_type == FlagType.BOOLEAN:
            return True  # type: ignore

        return self.default_value

    def _select_variant(self) -> T:
        """Select variant based on weights."""
        total_weight = sum(v.weight for v in self.variants)
        rand = random.random() * total_weight

        cumulative = 0
        for variant in self.variants:
            cumulative += variant.weight
            if rand < cumulative:
                return variant.value

        return self.variants[-1].value if self.variants else self.default_value

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "key": self.key,
            "default_value": self.default_value,
            "flag_type": self.flag_type.value,
            "enabled": self.enabled,
            "description": self.description,
            "target_users": list(self.target_users),
            "target_groups": list(self.target_groups),
            "metadata": self.metadata,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class FlagStore(ABC):
    """Abstract flag storage."""

    @abstractmethod
    def get(self, key: str) -> Optional[FeatureFlag]:
        """Get flag by key."""
        pass

    @abstractmethod
    def set(self, flag: FeatureFlag) -> None:
        """Save or update flag."""
        pass

    @abstractmethod
    def delete(self, key: str) -> bool:
        """Delete flag by key."""
        pass

    @abstractmethod
    def list_all(self) -> List[FeatureFlag]:
        """List all flags."""
        pass


class InMemoryFlagStore(FlagStore):
    """In-memory flag storage.

    Usage:
        store = InMemoryFlagStore()
        store.set(flag)
        flag = store.get("my-flag")
    """

    def __init__(self):
        self._flags: Dict[str, FeatureFlag] = {}
        self._lock = threading.RLock()

    def get(self, key: str) -> Optional[FeatureFlag]:
        with self._lock:
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

    def list_all(self) -> List[FeatureFlag]:
        with self._lock:
            return list(self._flags.values())


class FeatureFlagClient:
    """Feature flag client for evaluating flags.

    Usage:
        client = FeatureFlagClient(store)

        # Create a flag
        client.create_flag("new_feature", default=False)

        # Evaluate
        context = EvaluationContext(user_id="user-123")
        enabled = client.is_enabled("new_feature", context)

        # Get value
        value = client.get_value("theme", context, default="light")
    """

    def __init__(
        self,
        store: Optional[FlagStore] = None,
        cache_ttl: float = 60.0,
    ):
        self.store = store or InMemoryFlagStore()
        self.cache_ttl = cache_ttl
        self._cache: Dict[str, tuple] = {}  # key -> (flag, timestamp)
        self._overrides: Dict[str, Any] = {}
        self._lock = threading.RLock()
        self._listeners: List[Callable[[str, Any, Any], None]] = []

    def _get_flag(self, key: str) -> Optional[FeatureFlag]:
        """Get flag from cache or store."""
        with self._lock:
            # Check cache
            if key in self._cache:
                flag, timestamp = self._cache[key]
                if time.time() - timestamp < self.cache_ttl:
                    return flag

            # Fetch from store
            flag = self.store.get(key)
            if flag:
                self._cache[key] = (flag, time.time())

            return flag

    def create_flag(
        self,
        key: str,
        default: Any,
        flag_type: FlagType = FlagType.BOOLEAN,
        enabled: bool = True,
        description: str = "",
    ) -> FeatureFlag:
        """Create a new feature flag."""
        flag = FeatureFlag(
            key=key,
            default_value=default,
            flag_type=flag_type,
            enabled=enabled,
            description=description,
        )
        self.store.set(flag)
        return flag

    def update_flag(self, key: str, **updates: Any) -> Optional[FeatureFlag]:
        """Update an existing flag."""
        flag = self.store.get(key)
        if not flag:
            return None

        for fld, value in updates.items():
            if hasattr(flag, fld):
                setattr(flag, fld, value)

        flag.updated_at = time.time()
        self.store.set(flag)

        # Invalidate cache
        with self._lock:
            if key in self._cache:
                del self._cache[key]

        return flag

    def delete_flag(self, key: str) -> bool:
        """Delete a feature flag."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
        return self.store.delete(key)

    def is_enabled(
        self,
        key: str,
        context: Optional[EvaluationContext] = None,
        default: bool = False,
    ) -> bool:
        """Check if a boolean flag is enabled."""
        # Check override
        with self._lock:
            if key in self._overrides:
                return bool(self._overrides[key])

        flag = self._get_flag(key)
        if not flag:
            return default

        ctx = context or EvaluationContext()
        result = flag.evaluate(ctx)

        return bool(result)

    def get_value(
        self,
        key: str,
        context: Optional[EvaluationContext] = None,
        default: Any = None,
    ) -> Any:
        """Get flag value."""
        # Check override
        with self._lock:
            if key in self._overrides:
                return self._overrides[key]

        flag = self._get_flag(key)
        if not flag:
            return default

        ctx = context or EvaluationContext()
        return flag.evaluate(ctx)

    def get_string(
        self,
        key: str,
        context: Optional[EvaluationContext] = None,
        default: str = "",
    ) -> str:
        """Get string flag value."""
        return str(self.get_value(key, context, default))

    def get_number(
        self,
        key: str,
        context: Optional[EvaluationContext] = None,
        default: float = 0.0,
    ) -> float:
        """Get numeric flag value."""
        return float(self.get_value(key, context, default))

    def get_json(
        self,
        key: str,
        context: Optional[EvaluationContext] = None,
        default: Any = None,
    ) -> Any:
        """Get JSON flag value."""
        return self.get_value(key, context, default or {})

    def set_override(self, key: str, value: Any) -> None:
        """Set a local override for testing."""
        with self._lock:
            old_value = self._overrides.get(key)
            self._overrides[key] = value

        self._notify_listeners(key, old_value, value)

    def clear_override(self, key: str) -> None:
        """Clear a local override."""
        with self._lock:
            if key in self._overrides:
                del self._overrides[key]

    def clear_all_overrides(self) -> None:
        """Clear all local overrides."""
        with self._lock:
            self._overrides.clear()

    def add_rule(
        self,
        key: str,
        rule_id: str,
        conditions: List[Condition],
        value: Any,
        match_all: bool = True,
        priority: int = 0,
    ) -> Optional[Rule]:
        """Add a rule to a flag."""
        flag = self.store.get(key)
        if not flag:
            return None

        rule = Rule(
            id=rule_id,
            conditions=conditions,
            value=value,
            match_all=match_all,
            priority=priority,
        )
        flag.rules.append(rule)
        flag.updated_at = time.time()
        self.store.set(flag)

        # Invalidate cache
        with self._lock:
            if key in self._cache:
                del self._cache[key]

        return rule

    def remove_rule(self, key: str, rule_id: str) -> bool:
        """Remove a rule from a flag."""
        flag = self.store.get(key)
        if not flag:
            return False

        original_len = len(flag.rules)
        flag.rules = [r for r in flag.rules if r.id != rule_id]

        if len(flag.rules) < original_len:
            flag.updated_at = time.time()
            self.store.set(flag)

            with self._lock:
                if key in self._cache:
                    del self._cache[key]

            return True

        return False

    def set_rollout(
        self,
        key: str,
        percentage: float,
        sticky_key: Optional[str] = "user_id",
    ) -> bool:
        """Set percentage rollout for a flag."""
        flag = self.store.get(key)
        if not flag:
            return False

        flag.rollout = PercentageRollout(
            percentage=percentage,
            sticky_key=sticky_key,
            seed=key,
        )
        flag.updated_at = time.time()
        self.store.set(flag)

        with self._lock:
            if key in self._cache:
                del self._cache[key]

        return True

    def add_target_user(self, key: str, user_id: str) -> bool:
        """Add user to flag's target users."""
        flag = self.store.get(key)
        if not flag:
            return False

        flag.target_users.add(user_id)
        flag.updated_at = time.time()
        self.store.set(flag)

        with self._lock:
            if key in self._cache:
                del self._cache[key]

        return True

    def remove_target_user(self, key: str, user_id: str) -> bool:
        """Remove user from flag's target users."""
        flag = self.store.get(key)
        if not flag:
            return False

        flag.target_users.discard(user_id)
        flag.updated_at = time.time()
        self.store.set(flag)

        with self._lock:
            if key in self._cache:
                del self._cache[key]

        return True

    def add_target_group(self, key: str, group: str) -> bool:
        """Add group to flag's target groups."""
        flag = self.store.get(key)
        if not flag:
            return False

        flag.target_groups.add(group)
        flag.updated_at = time.time()
        self.store.set(flag)

        with self._lock:
            if key in self._cache:
                del self._cache[key]

        return True

    def add_listener(
        self,
        listener: Callable[[str, Any, Any], None],
    ) -> None:
        """Add change listener."""
        self._listeners.append(listener)

    def remove_listener(
        self,
        listener: Callable[[str, Any, Any], None],
    ) -> None:
        """Remove change listener."""
        if listener in self._listeners:
            self._listeners.remove(listener)

    def _notify_listeners(
        self,
        key: str,
        old_value: Any,
        new_value: Any,
    ) -> None:
        """Notify listeners of change."""
        for listener in self._listeners:
            try:
                listener(key, old_value, new_value)
            except Exception as e:
                logger.error("Listener error: " + str(e))

    def list_flags(self) -> List[Dict[str, Any]]:
        """List all flags."""
        return [flag.to_dict() for flag in self.store.list_all()]

    def invalidate_cache(self, key: Optional[str] = None) -> None:
        """Invalidate cache."""
        with self._lock:
            if key:
                if key in self._cache:
                    del self._cache[key]
            else:
                self._cache.clear()


# Global client singleton
_global_client: Optional[FeatureFlagClient] = None
_client_lock = threading.Lock()


def get_client() -> FeatureFlagClient:
    """Get global feature flag client."""
    global _global_client
    if _global_client is None:
        with _client_lock:
            if _global_client is None:
                _global_client = FeatureFlagClient()
    return _global_client


def set_client(client: FeatureFlagClient) -> None:
    """Set global feature flag client."""
    global _global_client
    with _client_lock:
        _global_client = client


def is_enabled(
    key: str,
    context: Optional[EvaluationContext] = None,
    default: bool = False,
) -> bool:
    """Check if flag is enabled using global client."""
    return get_client().is_enabled(key, context, default)


def get_value(
    key: str,
    context: Optional[EvaluationContext] = None,
    default: Any = None,
) -> Any:
    """Get flag value using global client."""
    return get_client().get_value(key, context, default)


# Convenience function to create context
def context(
    user_id: Optional[str] = None,
    attributes: Optional[Dict[str, Any]] = None,
    groups: Optional[List[str]] = None,
) -> EvaluationContext:
    """Create evaluation context."""
    return EvaluationContext(
        user_id=user_id,
        attributes=attributes or {},
        groups=groups or [],
    )
