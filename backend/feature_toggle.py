"""
Feature Toggle - Sprint 785

Feature flag and toggle system with targeting.

Features:
- Boolean toggles
- Percentage rollouts
- User targeting
- A/B testing
- Override support
- Audit logging
"""

import asyncio
import time
import random
import hashlib
import threading
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Set,
    Union
)
from enum import Enum
from abc import ABC, abstractmethod
import logging
import json

logger = logging.getLogger(__name__)


T = TypeVar("T")


class ToggleType(str, Enum):
    """Type of feature toggle."""
    BOOLEAN = "boolean"
    PERCENTAGE = "percentage"
    USER_LIST = "user_list"
    EXPERIMENT = "experiment"
    SCHEDULED = "scheduled"


class ToggleState(str, Enum):
    """Toggle state."""
    ON = "on"
    OFF = "off"
    CONDITIONAL = "conditional"


@dataclass
class ToggleConfig:
    """Feature toggle configuration."""
    name: str
    toggle_type: ToggleType
    enabled: bool = True
    description: str = ""
    percentage: float = 0  # For percentage rollouts
    user_ids: Set[str] = field(default_factory=set)  # Targeted users
    user_groups: Set[str] = field(default_factory=set)  # Targeted groups
    rules: List[Dict[str, Any]] = field(default_factory=list)  # Custom rules
    variants: Dict[str, float] = field(default_factory=dict)  # A/B variants
    start_time: Optional[float] = None  # Scheduled start
    end_time: Optional[float] = None  # Scheduled end
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "type": self.toggle_type.value,
            "enabled": self.enabled,
            "description": self.description,
            "percentage": self.percentage,
            "user_ids": list(self.user_ids),
            "user_groups": list(self.user_groups),
            "rules": self.rules,
            "variants": self.variants,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "metadata": self.metadata,
        }


@dataclass
class ToggleContext:
    """Context for toggle evaluation."""
    user_id: Optional[str] = None
    user_groups: Set[str] = field(default_factory=set)
    attributes: Dict[str, Any] = field(default_factory=dict)
    session_id: Optional[str] = None

    def get(self, key: str, default: Any = None) -> Any:
        return self.attributes.get(key, default)


@dataclass
class EvaluationResult:
    """Result of toggle evaluation."""
    name: str
    enabled: bool
    variant: Optional[str] = None
    reason: str = ""
    evaluated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "enabled": self.enabled,
            "variant": self.variant,
            "reason": self.reason,
            "evaluated_at": self.evaluated_at,
        }


class ToggleStorage(ABC):
    """Abstract toggle storage."""

    @abstractmethod
    async def get(self, name: str) -> Optional[ToggleConfig]:
        """Get toggle configuration."""
        pass

    @abstractmethod
    async def set(self, config: ToggleConfig) -> None:
        """Save toggle configuration."""
        pass

    @abstractmethod
    async def delete(self, name: str) -> bool:
        """Delete toggle."""
        pass

    @abstractmethod
    async def list_all(self) -> List[ToggleConfig]:
        """List all toggles."""
        pass


class InMemoryStorage(ToggleStorage):
    """In-memory toggle storage."""

    def __init__(self):
        self._toggles: Dict[str, ToggleConfig] = {}
        self._lock = threading.Lock()

    async def get(self, name: str) -> Optional[ToggleConfig]:
        with self._lock:
            return self._toggles.get(name)

    async def set(self, config: ToggleConfig) -> None:
        config.updated_at = time.time()
        with self._lock:
            self._toggles[config.name] = config

    async def delete(self, name: str) -> bool:
        with self._lock:
            if name in self._toggles:
                del self._toggles[name]
                return True
            return False

    async def list_all(self) -> List[ToggleConfig]:
        with self._lock:
            return list(self._toggles.values())


class FeatureToggle:
    """Feature toggle manager.

    Usage:
        toggles = FeatureToggle()

        # Create toggle
        await toggles.create("dark_mode", enabled=True)

        # Create percentage rollout
        await toggles.create_percentage("new_ui", percentage=25)

        # Create A/B test
        await toggles.create_experiment("button_color", {
            "blue": 50,
            "green": 50
        })

        # Check toggle
        ctx = ToggleContext(user_id="user123")
        if await toggles.is_enabled("dark_mode", ctx):
            # Show dark mode
            pass

        # Get variant
        variant = await toggles.get_variant("button_color", ctx)
    """

    def __init__(
        self,
        storage: Optional[ToggleStorage] = None,
        on_evaluation: Optional[Callable[[EvaluationResult], None]] = None,
    ):
        self._storage = storage or InMemoryStorage()
        self._on_evaluation = on_evaluation
        self._overrides: Dict[str, bool] = {}
        self._lock = threading.Lock()

    async def create(
        self,
        name: str,
        enabled: bool = True,
        description: str = "",
        **metadata: Any,
    ) -> ToggleConfig:
        """Create a boolean toggle."""
        config = ToggleConfig(
            name=name,
            toggle_type=ToggleType.BOOLEAN,
            enabled=enabled,
            description=description,
            metadata=metadata,
        )
        await self._storage.set(config)
        logger.info("Created toggle: " + name)
        return config

    async def create_percentage(
        self,
        name: str,
        percentage: float,
        description: str = "",
        **metadata: Any,
    ) -> ToggleConfig:
        """Create a percentage rollout toggle."""
        config = ToggleConfig(
            name=name,
            toggle_type=ToggleType.PERCENTAGE,
            enabled=True,
            percentage=min(100, max(0, percentage)),
            description=description,
            metadata=metadata,
        )
        await self._storage.set(config)
        logger.info("Created percentage toggle: " + name + " at " + str(percentage) + "%")
        return config

    async def create_user_list(
        self,
        name: str,
        user_ids: Set[str],
        user_groups: Optional[Set[str]] = None,
        description: str = "",
        **metadata: Any,
    ) -> ToggleConfig:
        """Create a user-targeted toggle."""
        config = ToggleConfig(
            name=name,
            toggle_type=ToggleType.USER_LIST,
            enabled=True,
            user_ids=user_ids,
            user_groups=user_groups or set(),
            description=description,
            metadata=metadata,
        )
        await self._storage.set(config)
        logger.info("Created user list toggle: " + name)
        return config

    async def create_experiment(
        self,
        name: str,
        variants: Dict[str, float],
        description: str = "",
        **metadata: Any,
    ) -> ToggleConfig:
        """Create an A/B experiment toggle."""
        total = sum(variants.values())
        if abs(total - 100) > 0.01:
            raise ValueError("Variant percentages must sum to 100")

        config = ToggleConfig(
            name=name,
            toggle_type=ToggleType.EXPERIMENT,
            enabled=True,
            variants=variants,
            description=description,
            metadata=metadata,
        )
        await self._storage.set(config)
        logger.info("Created experiment: " + name + " with variants " + str(list(variants.keys())))
        return config

    async def create_scheduled(
        self,
        name: str,
        start_time: float,
        end_time: Optional[float] = None,
        description: str = "",
        **metadata: Any,
    ) -> ToggleConfig:
        """Create a scheduled toggle."""
        config = ToggleConfig(
            name=name,
            toggle_type=ToggleType.SCHEDULED,
            enabled=True,
            start_time=start_time,
            end_time=end_time,
            description=description,
            metadata=metadata,
        )
        await self._storage.set(config)
        logger.info("Created scheduled toggle: " + name)
        return config

    async def get(self, name: str) -> Optional[ToggleConfig]:
        """Get toggle configuration."""
        return await self._storage.get(name)

    async def update(
        self,
        name: str,
        **updates: Any,
    ) -> Optional[ToggleConfig]:
        """Update toggle configuration."""
        config = await self._storage.get(name)
        if not config:
            return None

        for key, value in updates.items():
            if hasattr(config, key):
                setattr(config, key, value)

        await self._storage.set(config)
        logger.info("Updated toggle: " + name)
        return config

    async def delete(self, name: str) -> bool:
        """Delete a toggle."""
        result = await self._storage.delete(name)
        if result:
            logger.info("Deleted toggle: " + name)
        return result

    async def list_all(self) -> List[ToggleConfig]:
        """List all toggles."""
        return await self._storage.list_all()

    def set_override(self, name: str, enabled: bool) -> None:
        """Set a local override (for testing)."""
        with self._lock:
            self._overrides[name] = enabled

    def clear_override(self, name: str) -> None:
        """Clear a local override."""
        with self._lock:
            self._overrides.pop(name, None)

    def clear_all_overrides(self) -> None:
        """Clear all overrides."""
        with self._lock:
            self._overrides.clear()

    async def is_enabled(
        self,
        name: str,
        context: Optional[ToggleContext] = None,
    ) -> bool:
        """Check if toggle is enabled for context."""
        result = await self.evaluate(name, context)
        return result.enabled

    async def evaluate(
        self,
        name: str,
        context: Optional[ToggleContext] = None,
    ) -> EvaluationResult:
        """Evaluate toggle for context."""
        context = context or ToggleContext()

        # Check overrides first
        with self._lock:
            if name in self._overrides:
                result = EvaluationResult(
                    name=name,
                    enabled=self._overrides[name],
                    reason="override",
                )
                if self._on_evaluation:
                    self._on_evaluation(result)
                return result

        # Get toggle config
        config = await self._storage.get(name)
        if not config:
            result = EvaluationResult(
                name=name,
                enabled=False,
                reason="not_found",
            )
            if self._on_evaluation:
                self._on_evaluation(result)
            return result

        # Evaluate based on type
        if not config.enabled:
            result = EvaluationResult(
                name=name,
                enabled=False,
                reason="disabled",
            )
        elif config.toggle_type == ToggleType.BOOLEAN:
            result = EvaluationResult(
                name=name,
                enabled=True,
                reason="boolean_enabled",
            )
        elif config.toggle_type == ToggleType.PERCENTAGE:
            result = self._evaluate_percentage(config, context)
        elif config.toggle_type == ToggleType.USER_LIST:
            result = self._evaluate_user_list(config, context)
        elif config.toggle_type == ToggleType.EXPERIMENT:
            result = self._evaluate_experiment(config, context)
        elif config.toggle_type == ToggleType.SCHEDULED:
            result = self._evaluate_scheduled(config, context)
        else:
            result = EvaluationResult(
                name=name,
                enabled=False,
                reason="unknown_type",
            )

        if self._on_evaluation:
            self._on_evaluation(result)

        return result

    def _evaluate_percentage(
        self,
        config: ToggleConfig,
        context: ToggleContext,
    ) -> EvaluationResult:
        """Evaluate percentage rollout."""
        # Use user_id for consistent bucketing
        bucket_key = context.user_id or context.session_id or str(random.random())
        bucket = self._get_bucket(config.name, bucket_key)

        enabled = bucket < config.percentage

        return EvaluationResult(
            name=config.name,
            enabled=enabled,
            reason="percentage_" + ("in" if enabled else "out"),
        )

    def _evaluate_user_list(
        self,
        config: ToggleConfig,
        context: ToggleContext,
    ) -> EvaluationResult:
        """Evaluate user list targeting."""
        # Check user ID
        if context.user_id and context.user_id in config.user_ids:
            return EvaluationResult(
                name=config.name,
                enabled=True,
                reason="user_targeted",
            )

        # Check user groups
        if context.user_groups & config.user_groups:
            return EvaluationResult(
                name=config.name,
                enabled=True,
                reason="group_targeted",
            )

        return EvaluationResult(
            name=config.name,
            enabled=False,
            reason="not_targeted",
        )

    def _evaluate_experiment(
        self,
        config: ToggleConfig,
        context: ToggleContext,
    ) -> EvaluationResult:
        """Evaluate A/B experiment."""
        bucket_key = context.user_id or context.session_id or str(random.random())
        bucket = self._get_bucket(config.name, bucket_key)

        cumulative = 0.0
        selected_variant = None

        for variant, percentage in config.variants.items():
            cumulative += percentage
            if bucket < cumulative:
                selected_variant = variant
                break

        return EvaluationResult(
            name=config.name,
            enabled=True,
            variant=selected_variant,
            reason="experiment_" + (selected_variant or "control"),
        )

    def _evaluate_scheduled(
        self,
        config: ToggleConfig,
        context: ToggleContext,
    ) -> EvaluationResult:
        """Evaluate scheduled toggle."""
        now = time.time()

        # Check start time
        if config.start_time and now < config.start_time:
            return EvaluationResult(
                name=config.name,
                enabled=False,
                reason="not_started",
            )

        # Check end time
        if config.end_time and now > config.end_time:
            return EvaluationResult(
                name=config.name,
                enabled=False,
                reason="ended",
            )

        return EvaluationResult(
            name=config.name,
            enabled=True,
            reason="scheduled_active",
        )

    def _get_bucket(self, name: str, key: str) -> float:
        """Get consistent bucket value (0-100) for a key."""
        hash_input = name + ":" + key
        hash_bytes = hashlib.md5(hash_input.encode()).digest()
        bucket = int.from_bytes(hash_bytes[:4], "big") % 10000
        return bucket / 100

    async def get_variant(
        self,
        name: str,
        context: Optional[ToggleContext] = None,
    ) -> Optional[str]:
        """Get experiment variant for context."""
        result = await self.evaluate(name, context)
        return result.variant

    async def get_all_enabled(
        self,
        context: Optional[ToggleContext] = None,
    ) -> List[str]:
        """Get all enabled toggles for context."""
        toggles = await self._storage.list_all()
        enabled = []

        for toggle in toggles:
            result = await self.evaluate(toggle.name, context)
            if result.enabled:
                enabled.append(toggle.name)

        return enabled

    async def add_user(self, name: str, user_id: str) -> bool:
        """Add user to toggle's user list."""
        config = await self._storage.get(name)
        if not config:
            return False

        config.user_ids.add(user_id)
        await self._storage.set(config)
        return True

    async def remove_user(self, name: str, user_id: str) -> bool:
        """Remove user from toggle's user list."""
        config = await self._storage.get(name)
        if not config:
            return False

        config.user_ids.discard(user_id)
        await self._storage.set(config)
        return True

    async def set_percentage(self, name: str, percentage: float) -> bool:
        """Update percentage for rollout toggle."""
        config = await self._storage.get(name)
        if not config:
            return False

        config.percentage = min(100, max(0, percentage))
        await self._storage.set(config)
        return True


# Global instance
_toggles: Optional[FeatureToggle] = None


def get_feature_toggles() -> FeatureToggle:
    """Get global feature toggle manager."""
    global _toggles
    if not _toggles:
        _toggles = FeatureToggle()
    return _toggles


def configure_feature_toggles(
    storage: Optional[ToggleStorage] = None,
    on_evaluation: Optional[Callable[[EvaluationResult], None]] = None,
) -> FeatureToggle:
    """Configure global feature toggles."""
    global _toggles
    _toggles = FeatureToggle(storage=storage, on_evaluation=on_evaluation)
    return _toggles
