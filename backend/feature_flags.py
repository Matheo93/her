"""
Feature Flags - Sprint 669

Feature flag management system.

Features:
- Boolean flags
- Percentage rollout
- User targeting
- Flag groups
- Override support
"""

import time
import hashlib
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Set, Callable
from enum import Enum
import threading
import random


class FlagStatus(str, Enum):
    """Flag status."""
    ENABLED = "enabled"
    DISABLED = "disabled"
    PERCENTAGE = "percentage"
    TARGETED = "targeted"


@dataclass
class FlagRule:
    """Targeting rule."""
    attribute: str
    operator: str  # eq, ne, in, contains, gt, lt
    value: Any


@dataclass
class FeatureFlag:
    """Feature flag definition."""
    name: str
    description: str = ""
    status: FlagStatus = FlagStatus.DISABLED
    percentage: float = 0.0
    rules: List[FlagRule] = field(default_factory=list)
    enabled_users: Set[str] = field(default_factory=set)
    disabled_users: Set[str] = field(default_factory=set)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FlagContext:
    """Evaluation context."""
    user_id: Optional[str] = None
    attributes: Dict[str, Any] = field(default_factory=dict)


class FeatureFlags:
    """Feature flag management.

    Usage:
        flags = FeatureFlags()

        # Define flags
        flags.create("dark_mode", status=FlagStatus.ENABLED)
        flags.create("new_chat", status=FlagStatus.PERCENTAGE, percentage=50)
        flags.create("beta_features", status=FlagStatus.TARGETED)

        # Check flags
        if flags.is_enabled("dark_mode"):
            show_dark_mode()

        # With context
        ctx = FlagContext(user_id="user_123", attributes={"plan": "pro"})
        if flags.is_enabled("beta_features", ctx):
            show_beta()

        # Overrides
        flags.enable_for_user("new_chat", "user_123")
    """

    def __init__(self):
        """Initialize feature flags."""
        self._flags: Dict[str, FeatureFlag] = {}
        self._groups: Dict[str, List[str]] = {}
        self._lock = threading.Lock()
        self._listeners: List[Callable[[str, bool], None]] = []

    def create(
        self,
        name: str,
        description: str = "",
        status: FlagStatus = FlagStatus.DISABLED,
        percentage: float = 0.0,
        rules: Optional[List[FlagRule]] = None,
    ) -> FeatureFlag:
        """Create feature flag.

        Args:
            name: Flag name
            description: Flag description
            status: Initial status
            percentage: Rollout percentage
            rules: Targeting rules

        Returns:
            Created flag
        """
        flag = FeatureFlag(
            name=name,
            description=description,
            status=status,
            percentage=percentage,
            rules=rules or [],
        )

        with self._lock:
            self._flags[name] = flag

        return flag

    def get(self, name: str) -> Optional[FeatureFlag]:
        """Get flag by name."""
        return self._flags.get(name)

    def update(
        self,
        name: str,
        status: Optional[FlagStatus] = None,
        percentage: Optional[float] = None,
        rules: Optional[List[FlagRule]] = None,
    ) -> Optional[FeatureFlag]:
        """Update flag."""
        flag = self._flags.get(name)
        if not flag:
            return None

        with self._lock:
            if status is not None:
                flag.status = status
            if percentage is not None:
                flag.percentage = percentage
            if rules is not None:
                flag.rules = rules
            flag.updated_at = time.time()

        return flag

    def delete(self, name: str) -> bool:
        """Delete flag."""
        with self._lock:
            return self._flags.pop(name, None) is not None

    def is_enabled(
        self,
        name: str,
        context: Optional[FlagContext] = None,
    ) -> bool:
        """Check if flag is enabled.

        Args:
            name: Flag name
            context: Evaluation context

        Returns:
            True if enabled
        """
        flag = self._flags.get(name)
        if not flag:
            return False

        context = context or FlagContext()

        # Check user overrides
        if context.user_id:
            if context.user_id in flag.disabled_users:
                return False
            if context.user_id in flag.enabled_users:
                return True

        # Check status
        if flag.status == FlagStatus.ENABLED:
            return True

        if flag.status == FlagStatus.DISABLED:
            return False

        if flag.status == FlagStatus.PERCENTAGE:
            return self._check_percentage(flag, context)

        if flag.status == FlagStatus.TARGETED:
            return self._check_rules(flag, context)

        return False

    def _check_percentage(self, flag: FeatureFlag, context: FlagContext) -> bool:
        """Check percentage rollout."""
        if not context.user_id:
            return random.random() * 100 < flag.percentage

        # Consistent hashing for user
        hash_input = f"{flag.name}:{context.user_id}"
        hash_value = int(hashlib.md5(hash_input.encode()).hexdigest()[:8], 16)
        user_percentage = (hash_value % 100)
        return user_percentage < flag.percentage

    def _check_rules(self, flag: FeatureFlag, context: FlagContext) -> bool:
        """Check targeting rules."""
        if not flag.rules:
            return False

        for rule in flag.rules:
            attr_value = context.attributes.get(rule.attribute)
            if not self._evaluate_rule(rule, attr_value):
                return False

        return True

    def _evaluate_rule(self, rule: FlagRule, value: Any) -> bool:
        """Evaluate single rule."""
        if value is None:
            return False

        op = rule.operator
        target = rule.value

        if op == "eq":
            return value == target
        elif op == "ne":
            return value != target
        elif op == "in":
            return value in target
        elif op == "contains":
            return target in str(value)
        elif op == "gt":
            return value > target
        elif op == "lt":
            return value < target
        elif op == "gte":
            return value >= target
        elif op == "lte":
            return value <= target

        return False

    def enable(self, name: str):
        """Enable flag globally."""
        self.update(name, status=FlagStatus.ENABLED)
        self._notify(name, True)

    def disable(self, name: str):
        """Disable flag globally."""
        self.update(name, status=FlagStatus.DISABLED)
        self._notify(name, False)

    def enable_for_user(self, name: str, user_id: str):
        """Enable flag for specific user."""
        flag = self._flags.get(name)
        if flag:
            with self._lock:
                flag.enabled_users.add(user_id)
                flag.disabled_users.discard(user_id)

    def disable_for_user(self, name: str, user_id: str):
        """Disable flag for specific user."""
        flag = self._flags.get(name)
        if flag:
            with self._lock:
                flag.disabled_users.add(user_id)
                flag.enabled_users.discard(user_id)

    def set_percentage(self, name: str, percentage: float):
        """Set rollout percentage."""
        self.update(name, status=FlagStatus.PERCENTAGE, percentage=percentage)

    def create_group(self, group_name: str, flag_names: List[str]):
        """Create flag group."""
        with self._lock:
            self._groups[group_name] = flag_names

    def enable_group(self, group_name: str):
        """Enable all flags in group."""
        flags = self._groups.get(group_name, [])
        for name in flags:
            self.enable(name)

    def disable_group(self, group_name: str):
        """Disable all flags in group."""
        flags = self._groups.get(group_name, [])
        for name in flags:
            self.disable(name)

    def list_flags(self) -> List[FeatureFlag]:
        """List all flags."""
        return list(self._flags.values())

    def on_change(self, callback: Callable[[str, bool], None]):
        """Register change listener."""
        self._listeners.append(callback)

    def _notify(self, name: str, enabled: bool):
        """Notify listeners."""
        for listener in self._listeners:
            try:
                listener(name, enabled)
            except Exception:
                pass

    def export(self) -> Dict[str, dict]:
        """Export all flags."""
        return {
            name: {
                "description": flag.description,
                "status": flag.status.value,
                "percentage": flag.percentage,
                "rules": [
                    {"attribute": r.attribute, "operator": r.operator, "value": r.value}
                    for r in flag.rules
                ],
            }
            for name, flag in self._flags.items()
        }

    def import_flags(self, data: Dict[str, dict]):
        """Import flags from dict."""
        for name, config in data.items():
            status = FlagStatus(config.get("status", "disabled"))
            rules = [
                FlagRule(**r) for r in config.get("rules", [])
            ]
            self.create(
                name=name,
                description=config.get("description", ""),
                status=status,
                percentage=config.get("percentage", 0),
                rules=rules,
            )


# Singleton instance
feature_flags = FeatureFlags()
