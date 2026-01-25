"""
Feature Flags - Sprint 609

Control feature rollout and A/B testing.

Features:
- Boolean flags
- Percentage rollout
- User targeting
- Environment-based
- Default values
"""

import time
import hashlib
import json
import os
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, List, Set
from enum import Enum
from threading import Lock


class FlagType(str, Enum):
    """Flag types."""
    BOOLEAN = "boolean"
    PERCENTAGE = "percentage"
    USER_LIST = "user_list"
    ENVIRONMENT = "environment"


@dataclass
class FeatureFlag:
    """A feature flag definition."""
    name: str
    flag_type: FlagType
    enabled: bool = True
    percentage: float = 100.0  # For PERCENTAGE type
    allowed_users: Set[str] = field(default_factory=set)  # For USER_LIST type
    environments: Set[str] = field(default_factory=set)  # For ENVIRONMENT type
    description: str = ""
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "flag_type": self.flag_type.value,
            "enabled": self.enabled,
            "percentage": self.percentage,
            "allowed_users": list(self.allowed_users),
            "environments": list(self.environments),
            "description": self.description,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


# Default feature flags
DEFAULT_FLAGS: List[FeatureFlag] = [
    FeatureFlag(
        name="new_tts_engine",
        flag_type=FlagType.PERCENTAGE,
        enabled=True,
        percentage=0,
        description="Enable new TTS engine"
    ),
    FeatureFlag(
        name="voice_cloning",
        flag_type=FlagType.USER_LIST,
        enabled=True,
        allowed_users=set(),
        description="Voice cloning feature (beta)"
    ),
    FeatureFlag(
        name="advanced_emotions",
        flag_type=FlagType.BOOLEAN,
        enabled=True,
        description="Advanced emotion detection"
    ),
    FeatureFlag(
        name="debug_mode",
        flag_type=FlagType.ENVIRONMENT,
        enabled=True,
        environments={"development", "staging"},
        description="Debug mode (dev/staging only)"
    ),
    FeatureFlag(
        name="rate_limit_v2",
        flag_type=FlagType.PERCENTAGE,
        enabled=True,
        percentage=50,
        description="New rate limiting algorithm"
    ),
    FeatureFlag(
        name="context_summarization",
        flag_type=FlagType.BOOLEAN,
        enabled=False,
        description="Auto-summarize long conversations"
    ),
    FeatureFlag(
        name="premium_voices",
        flag_type=FlagType.USER_LIST,
        enabled=True,
        allowed_users=set(),
        description="Premium voice options"
    ),
    FeatureFlag(
        name="analytics_v2",
        flag_type=FlagType.PERCENTAGE,
        enabled=True,
        percentage=25,
        description="New analytics system"
    ),
]


class FeatureFlagManager:
    """Manage feature flags.

    Usage:
        flags = FeatureFlagManager()

        # Check if feature is enabled
        if flags.is_enabled("new_tts_engine", user_id="user123"):
            use_new_engine()

        # Get all flags for a user
        user_flags = flags.get_user_flags("user123")
    """

    def __init__(
        self,
        environment: str = "production",
        storage_path: Optional[str] = None
    ):
        """Initialize feature flag manager.

        Args:
            environment: Current environment
            storage_path: Path for flag persistence
        """
        self._flags: Dict[str, FeatureFlag] = {}
        self._environment = environment
        self._storage_path = storage_path
        self._lock = Lock()

        # Load default flags
        for flag in DEFAULT_FLAGS:
            self._flags[flag.name] = flag

        # Load from storage
        if storage_path:
            os.makedirs(storage_path, exist_ok=True)
            self._load_flags()

    def _user_hash(self, user_id: str, flag_name: str) -> float:
        """Generate deterministic hash for user + flag."""
        combined = f"{user_id}:{flag_name}"
        hash_value = int(hashlib.md5(combined.encode()).hexdigest()[:8], 16)
        return (hash_value % 10000) / 100.0  # 0-100

    def is_enabled(
        self,
        flag_name: str,
        user_id: Optional[str] = None,
        default: bool = False
    ) -> bool:
        """Check if a feature flag is enabled.

        Args:
            flag_name: Flag name
            user_id: Optional user ID for targeting
            default: Default if flag not found

        Returns:
            Whether feature is enabled
        """
        with self._lock:
            flag = self._flags.get(flag_name)

        if not flag:
            return default

        if not flag.enabled:
            return False

        if flag.flag_type == FlagType.BOOLEAN:
            return True

        elif flag.flag_type == FlagType.PERCENTAGE:
            if not user_id:
                # Without user ID, use random check
                import random
                return random.random() * 100 < flag.percentage

            # Deterministic check based on user
            user_percent = self._user_hash(user_id, flag_name)
            return user_percent < flag.percentage

        elif flag.flag_type == FlagType.USER_LIST:
            if not user_id:
                return False
            return user_id in flag.allowed_users

        elif flag.flag_type == FlagType.ENVIRONMENT:
            return self._environment in flag.environments

        return default

    def get_flag(self, flag_name: str) -> Optional[Dict[str, Any]]:
        """Get flag details.

        Args:
            flag_name: Flag name

        Returns:
            Flag details or None
        """
        with self._lock:
            flag = self._flags.get(flag_name)
            return flag.to_dict() if flag else None

    def get_all_flags(self) -> Dict[str, Dict[str, Any]]:
        """Get all flags."""
        with self._lock:
            return {name: f.to_dict() for name, f in self._flags.items()}

    def get_user_flags(self, user_id: str) -> Dict[str, bool]:
        """Get all flags evaluated for a user.

        Args:
            user_id: User ID

        Returns:
            Dict of flag name to enabled status
        """
        with self._lock:
            return {
                name: self.is_enabled(name, user_id)
                for name in self._flags
            }

    def set_flag(
        self,
        flag_name: str,
        enabled: Optional[bool] = None,
        percentage: Optional[float] = None,
        allowed_users: Optional[List[str]] = None,
        environments: Optional[List[str]] = None,
        description: Optional[str] = None
    ) -> bool:
        """Update a flag.

        Args:
            flag_name: Flag name
            enabled: New enabled state
            percentage: New percentage (0-100)
            allowed_users: New allowed users list
            environments: New environments list
            description: New description

        Returns:
            True if flag was updated
        """
        with self._lock:
            flag = self._flags.get(flag_name)
            if not flag:
                return False

            if enabled is not None:
                flag.enabled = enabled
            if percentage is not None:
                flag.percentage = max(0, min(100, percentage))
            if allowed_users is not None:
                flag.allowed_users = set(allowed_users)
            if environments is not None:
                flag.environments = set(environments)
            if description is not None:
                flag.description = description

            flag.updated_at = time.time()

        return True

    def create_flag(
        self,
        name: str,
        flag_type: str = "boolean",
        enabled: bool = True,
        percentage: float = 100.0,
        allowed_users: Optional[List[str]] = None,
        environments: Optional[List[str]] = None,
        description: str = ""
    ) -> FeatureFlag:
        """Create a new flag.

        Args:
            name: Flag name
            flag_type: Type (boolean, percentage, user_list, environment)
            enabled: Initial enabled state
            percentage: Initial percentage
            allowed_users: Initial allowed users
            environments: Initial environments
            description: Flag description

        Returns:
            Created flag
        """
        try:
            ftype = FlagType(flag_type)
        except ValueError:
            ftype = FlagType.BOOLEAN

        flag = FeatureFlag(
            name=name,
            flag_type=ftype,
            enabled=enabled,
            percentage=percentage,
            allowed_users=set(allowed_users or []),
            environments=set(environments or []),
            description=description
        )

        with self._lock:
            self._flags[name] = flag

        return flag

    def delete_flag(self, flag_name: str) -> bool:
        """Delete a flag.

        Args:
            flag_name: Flag name

        Returns:
            True if deleted
        """
        with self._lock:
            if flag_name in self._flags:
                del self._flags[flag_name]
                return True
        return False

    def add_user_to_flag(self, flag_name: str, user_id: str) -> bool:
        """Add user to a USER_LIST flag.

        Args:
            flag_name: Flag name
            user_id: User to add

        Returns:
            True if added
        """
        with self._lock:
            flag = self._flags.get(flag_name)
            if not flag or flag.flag_type != FlagType.USER_LIST:
                return False

            flag.allowed_users.add(user_id)
            flag.updated_at = time.time()
            return True

    def remove_user_from_flag(self, flag_name: str, user_id: str) -> bool:
        """Remove user from a USER_LIST flag.

        Args:
            flag_name: Flag name
            user_id: User to remove

        Returns:
            True if removed
        """
        with self._lock:
            flag = self._flags.get(flag_name)
            if not flag or flag.flag_type != FlagType.USER_LIST:
                return False

            flag.allowed_users.discard(user_id)
            flag.updated_at = time.time()
            return True

    def _load_flags(self):
        """Load flags from storage."""
        if not self._storage_path:
            return

        flags_file = os.path.join(self._storage_path, "feature_flags.json")
        if not os.path.exists(flags_file):
            return

        try:
            with open(flags_file, "r") as f:
                data = json.load(f)

            for name, flag_data in data.items():
                self._flags[name] = FeatureFlag(
                    name=name,
                    flag_type=FlagType(flag_data.get("flag_type", "boolean")),
                    enabled=flag_data.get("enabled", True),
                    percentage=flag_data.get("percentage", 100.0),
                    allowed_users=set(flag_data.get("allowed_users", [])),
                    environments=set(flag_data.get("environments", [])),
                    description=flag_data.get("description", ""),
                    created_at=flag_data.get("created_at", time.time()),
                    updated_at=flag_data.get("updated_at", time.time()),
                )

            print(f"✅ Loaded {len(data)} feature flags")
        except Exception as e:
            print(f"⚠️ Failed to load feature flags: {e}")

    async def save_flags(self):
        """Save flags to storage."""
        if not self._storage_path:
            return

        flags_file = os.path.join(self._storage_path, "feature_flags.json")
        try:
            with self._lock:
                data = {name: f.to_dict() for name, f in self._flags.items()}

            with open(flags_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"⚠️ Failed to save feature flags: {e}")


# Get environment from env var
current_env = os.environ.get("ENVIRONMENT", "development")

# Singleton instance
feature_flags = FeatureFlagManager(
    environment=current_env
)
