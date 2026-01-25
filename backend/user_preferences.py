"""
User Preferences - Sprint 601

Store and manage user preferences.

Features:
- Key-value preference storage
- Default values
- Type validation
- Preference categories
- Import/export
"""

import time
import json
import os
from dataclasses import dataclass, field
from typing import Dict, Optional, Any, List, Union
from enum import Enum
from threading import Lock


class PreferenceCategory(str, Enum):
    """Preference categories."""
    VOICE = "voice"
    DISPLAY = "display"
    NOTIFICATIONS = "notifications"
    PRIVACY = "privacy"
    ACCESSIBILITY = "accessibility"
    ADVANCED = "advanced"


class PreferenceType(str, Enum):
    """Preference value types."""
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    SELECT = "select"
    RANGE = "range"


@dataclass
class PreferenceDefinition:
    """Definition of a preference."""
    key: str
    category: PreferenceCategory
    pref_type: PreferenceType
    default: Any
    label: str
    description: str = ""
    options: Optional[List[str]] = None  # For SELECT type
    min_value: Optional[float] = None    # For RANGE type
    max_value: Optional[float] = None    # For RANGE type
    step: Optional[float] = None         # For RANGE type

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "category": self.category.value,
            "type": self.pref_type.value,
            "default": self.default,
            "label": self.label,
            "description": self.description,
            "options": self.options,
            "min_value": self.min_value,
            "max_value": self.max_value,
            "step": self.step,
        }


# Default preference definitions
PREFERENCE_DEFINITIONS: List[PreferenceDefinition] = [
    # Voice preferences
    PreferenceDefinition(
        key="voice_id",
        category=PreferenceCategory.VOICE,
        pref_type=PreferenceType.SELECT,
        default="fr-FR-DeniseNeural",
        label="Voix EVA",
        description="Voix utilisée par EVA",
        options=["fr-FR-DeniseNeural", "fr-FR-VivienneNeural", "fr-FR-HenriNeural"]
    ),
    PreferenceDefinition(
        key="voice_speed",
        category=PreferenceCategory.VOICE,
        pref_type=PreferenceType.RANGE,
        default=1.0,
        label="Vitesse de parole",
        description="Vitesse de la voix (0.5 à 2.0)",
        min_value=0.5,
        max_value=2.0,
        step=0.1
    ),
    PreferenceDefinition(
        key="voice_pitch",
        category=PreferenceCategory.VOICE,
        pref_type=PreferenceType.RANGE,
        default=0,
        label="Tonalité",
        description="Ajustement de la tonalité (-10 à +10)",
        min_value=-10,
        max_value=10,
        step=1
    ),
    PreferenceDefinition(
        key="auto_play_audio",
        category=PreferenceCategory.VOICE,
        pref_type=PreferenceType.BOOLEAN,
        default=True,
        label="Lecture auto",
        description="Lire automatiquement les réponses audio"
    ),

    # Display preferences
    PreferenceDefinition(
        key="theme",
        category=PreferenceCategory.DISPLAY,
        pref_type=PreferenceType.SELECT,
        default="light",
        label="Thème",
        description="Thème de l'interface",
        options=["light", "dark", "auto"]
    ),
    PreferenceDefinition(
        key="font_size",
        category=PreferenceCategory.DISPLAY,
        pref_type=PreferenceType.SELECT,
        default="medium",
        label="Taille du texte",
        description="Taille de la police",
        options=["small", "medium", "large"]
    ),
    PreferenceDefinition(
        key="show_timestamps",
        category=PreferenceCategory.DISPLAY,
        pref_type=PreferenceType.BOOLEAN,
        default=True,
        label="Afficher l'heure",
        description="Afficher l'heure des messages"
    ),
    PreferenceDefinition(
        key="compact_mode",
        category=PreferenceCategory.DISPLAY,
        pref_type=PreferenceType.BOOLEAN,
        default=False,
        label="Mode compact",
        description="Affichage condensé des messages"
    ),

    # Notification preferences
    PreferenceDefinition(
        key="sound_enabled",
        category=PreferenceCategory.NOTIFICATIONS,
        pref_type=PreferenceType.BOOLEAN,
        default=True,
        label="Sons",
        description="Activer les sons de notification"
    ),
    PreferenceDefinition(
        key="sound_volume",
        category=PreferenceCategory.NOTIFICATIONS,
        pref_type=PreferenceType.RANGE,
        default=0.7,
        label="Volume",
        description="Volume des notifications",
        min_value=0,
        max_value=1,
        step=0.1
    ),

    # Privacy preferences
    PreferenceDefinition(
        key="save_history",
        category=PreferenceCategory.PRIVACY,
        pref_type=PreferenceType.BOOLEAN,
        default=True,
        label="Sauvegarder l'historique",
        description="Conserver l'historique des conversations"
    ),
    PreferenceDefinition(
        key="analytics_enabled",
        category=PreferenceCategory.PRIVACY,
        pref_type=PreferenceType.BOOLEAN,
        default=True,
        label="Analytics",
        description="Autoriser la collecte de données anonymes"
    ),

    # Accessibility
    PreferenceDefinition(
        key="reduced_motion",
        category=PreferenceCategory.ACCESSIBILITY,
        pref_type=PreferenceType.BOOLEAN,
        default=False,
        label="Réduire les animations",
        description="Désactiver les animations"
    ),
    PreferenceDefinition(
        key="high_contrast",
        category=PreferenceCategory.ACCESSIBILITY,
        pref_type=PreferenceType.BOOLEAN,
        default=False,
        label="Contraste élevé",
        description="Augmenter le contraste des couleurs"
    ),

    # Advanced
    PreferenceDefinition(
        key="debug_mode",
        category=PreferenceCategory.ADVANCED,
        pref_type=PreferenceType.BOOLEAN,
        default=False,
        label="Mode debug",
        description="Afficher les informations de débogage"
    ),
    PreferenceDefinition(
        key="api_timeout",
        category=PreferenceCategory.ADVANCED,
        pref_type=PreferenceType.RANGE,
        default=30,
        label="Timeout API",
        description="Délai d'attente en secondes",
        min_value=5,
        max_value=120,
        step=5
    ),
]


@dataclass
class UserPreferences:
    """User preference data."""
    user_id: str
    preferences: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "preferences": self.preferences,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class PreferenceManager:
    """Manage user preferences.

    Usage:
        manager = PreferenceManager()

        # Get preference
        voice = manager.get("user123", "voice_id")

        # Set preference
        manager.set("user123", "voice_id", "fr-FR-VivienneNeural")

        # Get all user preferences
        prefs = manager.get_all("user123")
    """

    def __init__(self, storage_path: Optional[str] = None):
        """Initialize preference manager.

        Args:
            storage_path: Path for preference persistence
        """
        self._users: Dict[str, UserPreferences] = {}
        self._definitions: Dict[str, PreferenceDefinition] = {
            d.key: d for d in PREFERENCE_DEFINITIONS
        }
        self._lock = Lock()
        self._storage_path = storage_path

        if storage_path:
            os.makedirs(storage_path, exist_ok=True)
            self._load_preferences()

    def _get_default(self, key: str) -> Any:
        """Get default value for a preference."""
        definition = self._definitions.get(key)
        return definition.default if definition else None

    def _validate_value(self, key: str, value: Any) -> bool:
        """Validate a preference value."""
        definition = self._definitions.get(key)
        if not definition:
            return True  # Allow unknown keys

        ptype = definition.pref_type

        if ptype == PreferenceType.STRING:
            return isinstance(value, str)
        elif ptype == PreferenceType.NUMBER:
            return isinstance(value, (int, float))
        elif ptype == PreferenceType.BOOLEAN:
            return isinstance(value, bool)
        elif ptype == PreferenceType.SELECT:
            return value in (definition.options or [])
        elif ptype == PreferenceType.RANGE:
            if not isinstance(value, (int, float)):
                return False
            if definition.min_value is not None and value < definition.min_value:
                return False
            if definition.max_value is not None and value > definition.max_value:
                return False
            return True

        return True

    def get(self, user_id: str, key: str) -> Any:
        """Get a preference value.

        Args:
            user_id: User identifier
            key: Preference key

        Returns:
            Preference value or default
        """
        with self._lock:
            user = self._users.get(user_id)
            if not user:
                return self._get_default(key)
            return user.preferences.get(key, self._get_default(key))

    def set(self, user_id: str, key: str, value: Any) -> bool:
        """Set a preference value.

        Args:
            user_id: User identifier
            key: Preference key
            value: Preference value

        Returns:
            True if set successfully
        """
        if not self._validate_value(key, value):
            return False

        with self._lock:
            if user_id not in self._users:
                self._users[user_id] = UserPreferences(user_id=user_id)

            user = self._users[user_id]
            user.preferences[key] = value
            user.updated_at = time.time()

        return True

    def get_all(self, user_id: str) -> Dict[str, Any]:
        """Get all preferences for a user.

        Args:
            user_id: User identifier

        Returns:
            Dict of all preferences with defaults filled in
        """
        result = {}

        # Start with defaults
        for key, definition in self._definitions.items():
            result[key] = definition.default

        # Override with user values
        with self._lock:
            user = self._users.get(user_id)
            if user:
                result.update(user.preferences)

        return result

    def set_multiple(self, user_id: str, preferences: Dict[str, Any]) -> Dict[str, bool]:
        """Set multiple preferences at once.

        Args:
            user_id: User identifier
            preferences: Dict of key-value pairs

        Returns:
            Dict of key to success status
        """
        results = {}
        for key, value in preferences.items():
            results[key] = self.set(user_id, key, value)
        return results

    def reset(self, user_id: str, key: Optional[str] = None) -> bool:
        """Reset preference(s) to default.

        Args:
            user_id: User identifier
            key: Specific key to reset, or None for all

        Returns:
            True if reset successfully
        """
        with self._lock:
            user = self._users.get(user_id)
            if not user:
                return True

            if key:
                if key in user.preferences:
                    del user.preferences[key]
            else:
                user.preferences.clear()

            user.updated_at = time.time()

        return True

    def get_definitions(
        self,
        category: Optional[PreferenceCategory] = None
    ) -> List[Dict[str, Any]]:
        """Get preference definitions.

        Args:
            category: Filter by category

        Returns:
            List of preference definitions
        """
        definitions = list(self._definitions.values())
        if category:
            definitions = [d for d in definitions if d.category == category]
        return [d.to_dict() for d in definitions]

    def get_by_category(self, user_id: str) -> Dict[str, Dict[str, Any]]:
        """Get preferences organized by category.

        Args:
            user_id: User identifier

        Returns:
            Dict of category to preferences
        """
        all_prefs = self.get_all(user_id)
        result: Dict[str, Dict[str, Any]] = {}

        for key, value in all_prefs.items():
            definition = self._definitions.get(key)
            if definition:
                category = definition.category.value
                if category not in result:
                    result[category] = {}
                result[category][key] = value

        return result

    def export_preferences(self, user_id: str) -> str:
        """Export preferences as JSON.

        Args:
            user_id: User identifier

        Returns:
            JSON string of preferences
        """
        prefs = self.get_all(user_id)
        return json.dumps(prefs, indent=2)

    def import_preferences(self, user_id: str, json_data: str) -> Dict[str, bool]:
        """Import preferences from JSON.

        Args:
            user_id: User identifier
            json_data: JSON string of preferences

        Returns:
            Dict of key to success status
        """
        try:
            data = json.loads(json_data)
            if not isinstance(data, dict):
                return {}
            return self.set_multiple(user_id, data)
        except json.JSONDecodeError:
            return {}

    def delete_user(self, user_id: str) -> bool:
        """Delete all preferences for a user.

        Args:
            user_id: User identifier

        Returns:
            True if deleted
        """
        with self._lock:
            if user_id in self._users:
                del self._users[user_id]
                return True
        return False

    def _load_preferences(self):
        """Load preferences from disk."""
        if not self._storage_path:
            return

        prefs_file = os.path.join(self._storage_path, "preferences.json")
        if not os.path.exists(prefs_file):
            return

        try:
            with open(prefs_file, "r") as f:
                data = json.load(f)

            for user_id, user_data in data.items():
                self._users[user_id] = UserPreferences(
                    user_id=user_id,
                    preferences=user_data.get("preferences", {}),
                    created_at=user_data.get("created_at", time.time()),
                    updated_at=user_data.get("updated_at", time.time()),
                )

            print(f"✅ Loaded preferences for {len(self._users)} users")
        except Exception as e:
            print(f"⚠️ Failed to load preferences: {e}")

    async def save_preferences(self):
        """Save preferences to disk."""
        if not self._storage_path:
            return

        prefs_file = os.path.join(self._storage_path, "preferences.json")
        try:
            with self._lock:
                data = {
                    user_id: user.to_dict()
                    for user_id, user in self._users.items()
                }

            with open(prefs_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"⚠️ Failed to save preferences: {e}")


# Singleton instance
preference_manager = PreferenceManager()
