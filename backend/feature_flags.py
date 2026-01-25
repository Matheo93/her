"""
Feature Flags - Sprint 633

Feature flag management system.

Features:
- Boolean and percentage flags
- User targeting
- Segment targeting
- A/B testing
- Flag lifecycle
"""

import time
import hashlib
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any, Set
from enum import Enum
from threading import Lock


class FlagType(str, Enum):
    """Flag types."""
    BOOLEAN = "boolean"
    PERCENTAGE = "percentage"
    VARIANT = "variant"
    JSON = "json"


class FlagStatus(str, Enum):
    """Flag lifecycle status."""
    DRAFT = "draft"
    ACTIVE = "active"
    DEPRECATED = "deprecated"
    ARCHIVED = "archived"


@dataclass
class FlagVariant:
    """A variant for multivariate flags."""
    name: str
    value: Any
    weight: int = 1  # Relative weight for distribution


@dataclass
class TargetingRule:
    """A targeting rule for flag evaluation."""
    attribute: str
    operator: str  # eq, neq, contains, gt, lt, in
    value: Any

    def matches(self, context: Dict[str, Any]) -> bool:
        """Check if context matches this rule."""
        attr_value = context.get(self.attribute)

        if attr_value is None:
            return False

        if self.operator == "eq":
            return attr_value == self.value
        elif self.operator == "neq":
            return attr_value != self.value
        elif self.operator == "contains":
            return self.value in str(attr_value)
        elif self.operator == "gt":
            return attr_value > self.value
        elif self.operator == "lt":
            return attr_value < self.value
        elif self.operator == "in":
            return attr_value in self.value

        return False


@dataclass
class Segment:
    """A user segment for targeting."""
    name: str
    rules: List[TargetingRule] = field(default_factory=list)
    match_all: bool = True  # AND vs OR for rules

    def matches(self, context: Dict[str, Any]) -> bool:
        """Check if context matches this segment."""
        if not self.rules:
            return False

        if self.match_all:
            return all(rule.matches(context) for rule in self.rules)
        else:
            return any(rule.matches(context) for rule in self.rules)


@dataclass
class FeatureFlag:
    """A feature flag definition."""
    key: str
    name: str
    description: str = ""
    flag_type: FlagType = FlagType.BOOLEAN
    status: FlagStatus = FlagStatus.DRAFT

    # Value configuration
    default_value: Any = False
    variants: List[FlagVariant] = field(default_factory=list)
    percentage: int = 0  # 0-100 for rollout

    # Targeting
    enabled_users: Set[str] = field(default_factory=set)
    disabled_users: Set[str] = field(default_factory=set)
    segments: List[str] = field(default_factory=list)
    targeting_rules: List[TargetingRule] = field(default_factory=list)

    # Metadata
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    tags: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "key": self.key,
            "name": self.name,
            "description": self.description,
            "flag_type": self.flag_type.value,
            "status": self.status.value,
            "default_value": self.default_value,
            "variants": [
                {"name": v.name, "value": v.value, "weight": v.weight}
                for v in self.variants
            ],
            "percentage": self.percentage,
            "enabled_users": list(self.enabled_users),
            "disabled_users": list(self.disabled_users),
            "segments": self.segments,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "tags": self.tags,
        }


@dataclass
class EvaluationResult:
    """Result of flag evaluation."""
    flag_key: str
    enabled: bool
    value: Any
    variant: Optional[str] = None
    reason: str = ""

    def to_dict(self) -> dict:
        return {
            "flag_key": self.flag_key,
            "enabled": self.enabled,
            "value": self.value,
            "variant": self.variant,
            "reason": self.reason,
        }


class FeatureFlagManager:
    """Feature flag management and evaluation.

    Usage:
        manager = FeatureFlagManager()

        # Create a flag
        manager.create_flag(
            key="new_feature",
            name="New Feature",
            flag_type=FlagType.BOOLEAN,
            default_value=False
        )

        # Activate with percentage rollout
        manager.set_percentage("new_feature", 50)
        manager.activate("new_feature")

        # Evaluate for a user
        result = manager.evaluate("new_feature", {"user_id": "user123"})
        if result.enabled:
            # Show new feature
            pass
    """

    def __init__(self):
        """Initialize manager."""
        self._flags: Dict[str, FeatureFlag] = {}
        self._segments: Dict[str, Segment] = {}
        self._lock = Lock()
        self._evaluation_cache: Dict[str, EvaluationResult] = {}
        self._cache_ttl = 60.0  # seconds
        self._cache_timestamps: Dict[str, float] = {}

    def create_flag(
        self,
        key: str,
        name: str,
        description: str = "",
        flag_type: FlagType = FlagType.BOOLEAN,
        default_value: Any = False,
        tags: Optional[List[str]] = None
    ) -> FeatureFlag:
        """Create a new feature flag."""
        with self._lock:
            if key in self._flags:
                raise ValueError(f"Flag {key} already exists")

            flag = FeatureFlag(
                key=key,
                name=name,
                description=description,
                flag_type=flag_type,
                default_value=default_value,
                tags=tags or [],
            )
            self._flags[key] = flag
            return flag

    def get_flag(self, key: str) -> Optional[FeatureFlag]:
        """Get a flag by key."""
        with self._lock:
            return self._flags.get(key)

    def update_flag(
        self,
        key: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        default_value: Any = None,
        tags: Optional[List[str]] = None
    ) -> Optional[FeatureFlag]:
        """Update a flag."""
        with self._lock:
            flag = self._flags.get(key)
            if not flag:
                return None

            if name is not None:
                flag.name = name
            if description is not None:
                flag.description = description
            if default_value is not None:
                flag.default_value = default_value
            if tags is not None:
                flag.tags = tags

            flag.updated_at = time.time()
            self._clear_flag_cache(key)
            return flag

    def delete_flag(self, key: str) -> bool:
        """Delete a flag."""
        with self._lock:
            if key in self._flags:
                del self._flags[key]
                self._clear_flag_cache(key)
                return True
            return False

    def activate(self, key: str) -> bool:
        """Activate a flag."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.status = FlagStatus.ACTIVE
                flag.updated_at = time.time()
                self._clear_flag_cache(key)
                return True
            return False

    def deactivate(self, key: str) -> bool:
        """Deactivate a flag (set to draft)."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.status = FlagStatus.DRAFT
                flag.updated_at = time.time()
                self._clear_flag_cache(key)
                return True
            return False

    def deprecate(self, key: str) -> bool:
        """Mark flag as deprecated."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.status = FlagStatus.DEPRECATED
                flag.updated_at = time.time()
                return True
            return False

    def archive(self, key: str) -> bool:
        """Archive a flag."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.status = FlagStatus.ARCHIVED
                flag.updated_at = time.time()
                return True
            return False

    def set_percentage(self, key: str, percentage: int) -> bool:
        """Set rollout percentage (0-100)."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.percentage = max(0, min(100, percentage))
                flag.updated_at = time.time()
                self._clear_flag_cache(key)
                return True
            return False

    def add_variant(
        self,
        key: str,
        variant_name: str,
        value: Any,
        weight: int = 1
    ) -> bool:
        """Add a variant to a flag."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.variants.append(FlagVariant(
                    name=variant_name,
                    value=value,
                    weight=weight
                ))
                flag.updated_at = time.time()
                self._clear_flag_cache(key)
                return True
            return False

    def remove_variant(self, key: str, variant_name: str) -> bool:
        """Remove a variant from a flag."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.variants = [v for v in flag.variants if v.name != variant_name]
                flag.updated_at = time.time()
                self._clear_flag_cache(key)
                return True
            return False

    def enable_for_user(self, key: str, user_id: str) -> bool:
        """Enable flag for a specific user."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.enabled_users.add(user_id)
                flag.disabled_users.discard(user_id)
                flag.updated_at = time.time()
                self._clear_flag_cache(key)
                return True
            return False

    def disable_for_user(self, key: str, user_id: str) -> bool:
        """Disable flag for a specific user."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.disabled_users.add(user_id)
                flag.enabled_users.discard(user_id)
                flag.updated_at = time.time()
                self._clear_flag_cache(key)
                return True
            return False

    def add_targeting_rule(
        self,
        key: str,
        attribute: str,
        operator: str,
        value: Any
    ) -> bool:
        """Add a targeting rule to a flag."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.targeting_rules.append(TargetingRule(
                    attribute=attribute,
                    operator=operator,
                    value=value
                ))
                flag.updated_at = time.time()
                self._clear_flag_cache(key)
                return True
            return False

    def clear_targeting_rules(self, key: str) -> bool:
        """Clear all targeting rules from a flag."""
        with self._lock:
            flag = self._flags.get(key)
            if flag:
                flag.targeting_rules = []
                flag.updated_at = time.time()
                self._clear_flag_cache(key)
                return True
            return False

    # Segment management

    def create_segment(
        self,
        name: str,
        rules: Optional[List[Dict[str, Any]]] = None,
        match_all: bool = True
    ) -> Segment:
        """Create a user segment."""
        with self._lock:
            segment = Segment(
                name=name,
                rules=[
                    TargetingRule(
                        attribute=r["attribute"],
                        operator=r["operator"],
                        value=r["value"]
                    )
                    for r in (rules or [])
                ],
                match_all=match_all
            )
            self._segments[name] = segment
            return segment

    def get_segment(self, name: str) -> Optional[Segment]:
        """Get a segment by name."""
        with self._lock:
            return self._segments.get(name)

    def delete_segment(self, name: str) -> bool:
        """Delete a segment."""
        with self._lock:
            if name in self._segments:
                del self._segments[name]
                return True
            return False

    def add_flag_to_segment(self, key: str, segment_name: str) -> bool:
        """Add a flag to a segment."""
        with self._lock:
            flag = self._flags.get(key)
            if flag and segment_name in self._segments:
                if segment_name not in flag.segments:
                    flag.segments.append(segment_name)
                    flag.updated_at = time.time()
                    self._clear_flag_cache(key)
                return True
            return False

    # Evaluation

    def _get_bucket(self, key: str, user_id: str) -> int:
        """Get consistent bucket (0-99) for user."""
        hash_input = f"{key}:{user_id}"
        hash_value = hashlib.md5(hash_input.encode()).hexdigest()
        return int(hash_value[:8], 16) % 100

    def _select_variant(
        self,
        variants: List[FlagVariant],
        user_id: str,
        flag_key: str
    ) -> FlagVariant:
        """Select a variant based on weights."""
        if not variants:
            raise ValueError("No variants defined")

        total_weight = sum(v.weight for v in variants)
        bucket = self._get_bucket(f"{flag_key}:variant", user_id)

        # Scale bucket to total weight
        target = (bucket * total_weight) // 100

        cumulative = 0
        for variant in variants:
            cumulative += variant.weight
            if target < cumulative:
                return variant

        return variants[-1]

    def _clear_flag_cache(self, key: str):
        """Clear cache entries for a flag."""
        to_remove = [k for k in self._evaluation_cache if k.startswith(f"{key}:")]
        for k in to_remove:
            del self._evaluation_cache[k]
            self._cache_timestamps.pop(k, None)

    def evaluate(
        self,
        key: str,
        context: Optional[Dict[str, Any]] = None,
        use_cache: bool = True
    ) -> EvaluationResult:
        """Evaluate a flag for a given context."""
        context = context or {}
        user_id = context.get("user_id", "")

        # Check cache
        cache_key = f"{key}:{user_id}"
        if use_cache and cache_key in self._evaluation_cache:
            timestamp = self._cache_timestamps.get(cache_key, 0)
            if time.time() - timestamp < self._cache_ttl:
                return self._evaluation_cache[cache_key]

        with self._lock:
            flag = self._flags.get(key)

            if not flag:
                result = EvaluationResult(
                    flag_key=key,
                    enabled=False,
                    value=None,
                    reason="flag_not_found"
                )
                return result

            # Check status
            if flag.status != FlagStatus.ACTIVE:
                result = EvaluationResult(
                    flag_key=key,
                    enabled=False,
                    value=flag.default_value,
                    reason=f"flag_{flag.status.value}"
                )
                return result

            # Check disabled users
            if user_id in flag.disabled_users:
                result = EvaluationResult(
                    flag_key=key,
                    enabled=False,
                    value=flag.default_value,
                    reason="user_disabled"
                )
                self._cache_result(cache_key, result)
                return result

            # Check enabled users
            if user_id in flag.enabled_users:
                result = self._get_enabled_result(flag, user_id, "user_enabled")
                self._cache_result(cache_key, result)
                return result

            # Check segments
            for segment_name in flag.segments:
                segment = self._segments.get(segment_name)
                if segment and segment.matches(context):
                    result = self._get_enabled_result(flag, user_id, f"segment:{segment_name}")
                    self._cache_result(cache_key, result)
                    return result

            # Check targeting rules
            if flag.targeting_rules:
                if all(rule.matches(context) for rule in flag.targeting_rules):
                    result = self._get_enabled_result(flag, user_id, "targeting_rules")
                    self._cache_result(cache_key, result)
                    return result

            # Check percentage rollout
            if flag.percentage > 0:
                bucket = self._get_bucket(key, user_id)
                if bucket < flag.percentage:
                    result = self._get_enabled_result(flag, user_id, f"percentage:{flag.percentage}")
                    self._cache_result(cache_key, result)
                    return result

            # Default
            result = EvaluationResult(
                flag_key=key,
                enabled=False,
                value=flag.default_value,
                reason="default"
            )
            self._cache_result(cache_key, result)
            return result

    def _get_enabled_result(
        self,
        flag: FeatureFlag,
        user_id: str,
        reason: str
    ) -> EvaluationResult:
        """Get result for enabled flag."""
        if flag.flag_type == FlagType.VARIANT and flag.variants:
            variant = self._select_variant(flag.variants, user_id, flag.key)
            return EvaluationResult(
                flag_key=flag.key,
                enabled=True,
                value=variant.value,
                variant=variant.name,
                reason=reason
            )

        return EvaluationResult(
            flag_key=flag.key,
            enabled=True,
            value=True if flag.flag_type == FlagType.BOOLEAN else flag.default_value,
            reason=reason
        )

    def _cache_result(self, cache_key: str, result: EvaluationResult):
        """Cache an evaluation result."""
        self._evaluation_cache[cache_key] = result
        self._cache_timestamps[cache_key] = time.time()

    def evaluate_all(
        self,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, EvaluationResult]:
        """Evaluate all active flags for a context."""
        results = {}
        with self._lock:
            keys = list(self._flags.keys())

        for key in keys:
            results[key] = self.evaluate(key, context)

        return results

    # Listing

    def list_flags(
        self,
        status: Optional[FlagStatus] = None,
        tag: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List flags with optional filters."""
        with self._lock:
            flags = list(self._flags.values())

        if status:
            flags = [f for f in flags if f.status == status]

        if tag:
            flags = [f for f in flags if tag in f.tags]

        return [f.to_dict() for f in flags]

    def list_segments(self) -> List[Dict[str, Any]]:
        """List all segments."""
        with self._lock:
            return [
                {
                    "name": s.name,
                    "rules": [
                        {
                            "attribute": r.attribute,
                            "operator": r.operator,
                            "value": r.value
                        }
                        for r in s.rules
                    ],
                    "match_all": s.match_all
                }
                for s in self._segments.values()
            ]

    def get_stats(self) -> Dict[str, Any]:
        """Get flag statistics."""
        with self._lock:
            flags = list(self._flags.values())

        by_status = {}
        for status in FlagStatus:
            by_status[status.value] = len([f for f in flags if f.status == status])

        by_type = {}
        for ftype in FlagType:
            by_type[ftype.value] = len([f for f in flags if f.flag_type == ftype])

        return {
            "total_flags": len(flags),
            "by_status": by_status,
            "by_type": by_type,
            "total_segments": len(self._segments),
            "cache_size": len(self._evaluation_cache),
        }

    def clear_cache(self):
        """Clear evaluation cache."""
        with self._lock:
            self._evaluation_cache.clear()
            self._cache_timestamps.clear()


# Singleton instance
feature_flag_manager = FeatureFlagManager()


# Convenience functions
def is_enabled(key: str, context: Optional[Dict[str, Any]] = None) -> bool:
    """Check if a flag is enabled."""
    return feature_flag_manager.evaluate(key, context).enabled


def get_value(key: str, context: Optional[Dict[str, Any]] = None) -> Any:
    """Get flag value."""
    return feature_flag_manager.evaluate(key, context).value


def get_variant(key: str, context: Optional[Dict[str, Any]] = None) -> Optional[str]:
    """Get selected variant name."""
    return feature_flag_manager.evaluate(key, context).variant


# Compatibility wrapper for Sprint 609 API
class FeatureFlagsCompat:
    """Compatibility wrapper for old feature flags API."""

    def __init__(self, manager: FeatureFlagManager):
        self._manager = manager

    def get_all_flags(self) -> List[Dict[str, Any]]:
        """Get all flags."""
        return self._manager.list_flags()

    def get_flag(self, name: str) -> Optional[Dict[str, Any]]:
        """Get a flag by name."""
        flag = self._manager.get_flag(name)
        return flag.to_dict() if flag else None

    def is_enabled(self, name: str, user_id: Optional[str] = None) -> bool:
        """Check if flag is enabled."""
        context = {"user_id": user_id} if user_id else {}
        return self._manager.evaluate(name, context).enabled

    def get_user_flags(self, user_id: str) -> Dict[str, bool]:
        """Get all flags for a user."""
        context = {"user_id": user_id}
        results = self._manager.evaluate_all(context)
        return {k: v.enabled for k, v in results.items()}

    def set_flag(self, name: str, enabled: bool) -> bool:
        """Set a flag's enabled state."""
        flag = self._manager.get_flag(name)
        if not flag:
            # Create if not exists
            self._manager.create_flag(
                key=name,
                name=name,
                default_value=enabled
            )
            if enabled:
                self._manager.set_percentage(name, 100)
                return self._manager.activate(name)
            return True

        if enabled:
            self._manager.set_percentage(name, 100)
            return self._manager.activate(name)
        else:
            return self._manager.deactivate(name)


# Create compatibility instance
feature_flags = FeatureFlagsCompat(feature_flag_manager)
