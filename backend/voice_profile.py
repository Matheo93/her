"""
Voice Profile Manager - Sprint 611

Manage user voice preferences and profiles.

Features:
- Voice selection
- Speed/pitch settings
- Custom voice names
- Voice presets
- Usage statistics
"""

import time
from dataclasses import dataclass, field
from typing import Dict, Optional, List, Any
from threading import Lock


@dataclass
class VoiceSettings:
    """Voice settings for a profile."""
    voice_id: str = "fr-FR-DeniseNeural"
    speed: float = 1.0  # 0.5 - 2.0
    pitch: int = 0  # -10 to +10
    volume: float = 1.0  # 0.0 - 1.0

    def to_dict(self) -> dict:
        return {
            "voice_id": self.voice_id,
            "speed": self.speed,
            "pitch": self.pitch,
            "volume": self.volume,
        }

    @staticmethod
    def from_dict(data: dict) -> "VoiceSettings":
        return VoiceSettings(
            voice_id=data.get("voice_id", "fr-FR-DeniseNeural"),
            speed=max(0.5, min(2.0, data.get("speed", 1.0))),
            pitch=max(-10, min(10, data.get("pitch", 0))),
            volume=max(0.0, min(1.0, data.get("volume", 1.0))),
        )


@dataclass
class VoiceProfile:
    """A user's voice profile."""
    user_id: str
    name: str = "Default"
    settings: VoiceSettings = field(default_factory=VoiceSettings)
    is_default: bool = True
    usage_count: int = 0
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    last_used_at: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "name": self.name,
            "settings": self.settings.to_dict(),
            "is_default": self.is_default,
            "usage_count": self.usage_count,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "last_used_at": self.last_used_at,
        }


# Available voices
AVAILABLE_VOICES: List[Dict[str, Any]] = [
    {
        "id": "fr-FR-DeniseNeural",
        "name": "Denise",
        "language": "fr-FR",
        "gender": "female",
        "style": "warm",
        "description": "Voix féminine chaleureuse et naturelle"
    },
    {
        "id": "fr-FR-VivienneNeural",
        "name": "Vivienne",
        "language": "fr-FR",
        "gender": "female",
        "style": "professional",
        "description": "Voix féminine professionnelle"
    },
    {
        "id": "fr-FR-HenriNeural",
        "name": "Henri",
        "language": "fr-FR",
        "gender": "male",
        "style": "calm",
        "description": "Voix masculine calme et posée"
    },
    {
        "id": "fr-FR-EloiseNeural",
        "name": "Eloise",
        "language": "fr-FR",
        "gender": "female",
        "style": "soft",
        "description": "Voix féminine douce"
    },
    {
        "id": "fr-FR-RemyNeural",
        "name": "Remy",
        "language": "fr-FR",
        "gender": "male",
        "style": "energetic",
        "description": "Voix masculine dynamique"
    },
]

# Voice presets
VOICE_PRESETS: Dict[str, Dict[str, Any]] = {
    "natural": {
        "name": "Naturel",
        "description": "Voix naturelle et conversationnelle",
        "settings": {"speed": 1.0, "pitch": 0, "volume": 1.0}
    },
    "slow": {
        "name": "Lent",
        "description": "Voix plus lente pour une meilleure compréhension",
        "settings": {"speed": 0.8, "pitch": 0, "volume": 1.0}
    },
    "fast": {
        "name": "Rapide",
        "description": "Voix plus rapide pour les utilisateurs avancés",
        "settings": {"speed": 1.3, "pitch": 0, "volume": 1.0}
    },
    "soft": {
        "name": "Doux",
        "description": "Voix douce et apaisante",
        "settings": {"speed": 0.9, "pitch": -2, "volume": 0.9}
    },
    "energetic": {
        "name": "Énergique",
        "description": "Voix dynamique et enthousiaste",
        "settings": {"speed": 1.1, "pitch": 2, "volume": 1.0}
    },
}


class VoiceProfileManager:
    """Manage user voice profiles.

    Usage:
        manager = VoiceProfileManager()

        # Get or create default profile
        profile = manager.get_active_profile("user123")

        # Update settings
        manager.update_profile("user123", "Default", speed=1.2)

        # Apply preset
        manager.apply_preset("user123", "Default", "soft")
    """

    def __init__(self):
        """Initialize voice profile manager."""
        self._profiles: Dict[str, Dict[str, VoiceProfile]] = {}
        self._lock = Lock()

    def get_profiles(self, user_id: str) -> List[Dict[str, Any]]:
        """Get all profiles for a user.

        Args:
            user_id: User identifier

        Returns:
            List of user profiles
        """
        with self._lock:
            user_profiles = self._profiles.get(user_id, {})
            return [p.to_dict() for p in user_profiles.values()]

    def get_active_profile(self, user_id: str) -> VoiceProfile:
        """Get or create the active profile for a user.

        Args:
            user_id: User identifier

        Returns:
            Active voice profile
        """
        with self._lock:
            if user_id not in self._profiles:
                self._profiles[user_id] = {}

            user_profiles = self._profiles[user_id]

            # Find default profile
            for profile in user_profiles.values():
                if profile.is_default:
                    return profile

            # Create default if none exists
            default = VoiceProfile(
                user_id=user_id,
                name="Default",
                is_default=True
            )
            user_profiles["Default"] = default
            return default

    def get_profile(self, user_id: str, name: str) -> Optional[VoiceProfile]:
        """Get a specific profile by name.

        Args:
            user_id: User identifier
            name: Profile name

        Returns:
            Profile or None
        """
        with self._lock:
            user_profiles = self._profiles.get(user_id, {})
            return user_profiles.get(name)

    def create_profile(
        self,
        user_id: str,
        name: str,
        voice_id: Optional[str] = None,
        speed: Optional[float] = None,
        pitch: Optional[int] = None,
        is_default: bool = False
    ) -> VoiceProfile:
        """Create a new voice profile.

        Args:
            user_id: User identifier
            name: Profile name
            voice_id: Voice ID
            speed: Voice speed
            pitch: Voice pitch
            is_default: Set as default

        Returns:
            Created profile
        """
        settings = VoiceSettings()
        if voice_id:
            settings.voice_id = voice_id
        if speed:
            settings.speed = max(0.5, min(2.0, speed))
        if pitch:
            settings.pitch = max(-10, min(10, pitch))

        profile = VoiceProfile(
            user_id=user_id,
            name=name,
            settings=settings,
            is_default=is_default
        )

        with self._lock:
            if user_id not in self._profiles:
                self._profiles[user_id] = {}

            # Clear default if setting new default
            if is_default:
                for p in self._profiles[user_id].values():
                    p.is_default = False

            self._profiles[user_id][name] = profile

        return profile

    def update_profile(
        self,
        user_id: str,
        name: str,
        voice_id: Optional[str] = None,
        speed: Optional[float] = None,
        pitch: Optional[int] = None,
        volume: Optional[float] = None,
        new_name: Optional[str] = None
    ) -> Optional[VoiceProfile]:
        """Update a profile.

        Args:
            user_id: User identifier
            name: Profile name
            voice_id: New voice ID
            speed: New speed
            pitch: New pitch
            volume: New volume
            new_name: Rename profile

        Returns:
            Updated profile or None
        """
        with self._lock:
            user_profiles = self._profiles.get(user_id, {})
            profile = user_profiles.get(name)

            if not profile:
                return None

            if voice_id:
                profile.settings.voice_id = voice_id
            if speed is not None:
                profile.settings.speed = max(0.5, min(2.0, speed))
            if pitch is not None:
                profile.settings.pitch = max(-10, min(10, pitch))
            if volume is not None:
                profile.settings.volume = max(0.0, min(1.0, volume))

            profile.updated_at = time.time()

            # Handle rename
            if new_name and new_name != name:
                del user_profiles[name]
                profile.name = new_name
                user_profiles[new_name] = profile

            return profile

    def delete_profile(self, user_id: str, name: str) -> bool:
        """Delete a profile.

        Args:
            user_id: User identifier
            name: Profile name

        Returns:
            True if deleted
        """
        with self._lock:
            user_profiles = self._profiles.get(user_id, {})
            if name in user_profiles:
                del user_profiles[name]
                return True
            return False

    def set_default(self, user_id: str, name: str) -> bool:
        """Set a profile as default.

        Args:
            user_id: User identifier
            name: Profile name

        Returns:
            True if set
        """
        with self._lock:
            user_profiles = self._profiles.get(user_id, {})
            profile = user_profiles.get(name)

            if not profile:
                return False

            # Clear other defaults
            for p in user_profiles.values():
                p.is_default = False

            profile.is_default = True
            profile.updated_at = time.time()
            return True

    def apply_preset(
        self,
        user_id: str,
        profile_name: str,
        preset_name: str
    ) -> Optional[VoiceProfile]:
        """Apply a preset to a profile.

        Args:
            user_id: User identifier
            profile_name: Profile name
            preset_name: Preset name

        Returns:
            Updated profile or None
        """
        preset = VOICE_PRESETS.get(preset_name)
        if not preset:
            return None

        settings = preset["settings"]
        return self.update_profile(
            user_id,
            profile_name,
            speed=settings.get("speed"),
            pitch=settings.get("pitch"),
            volume=settings.get("volume")
        )

    def record_usage(self, user_id: str, profile_name: str):
        """Record profile usage.

        Args:
            user_id: User identifier
            profile_name: Profile name
        """
        with self._lock:
            user_profiles = self._profiles.get(user_id, {})
            profile = user_profiles.get(profile_name)

            if profile:
                profile.usage_count += 1
                profile.last_used_at = time.time()

    def get_available_voices(self) -> List[Dict[str, Any]]:
        """Get all available voices."""
        return AVAILABLE_VOICES

    def get_presets(self) -> Dict[str, Dict[str, Any]]:
        """Get all voice presets."""
        return VOICE_PRESETS

    def get_stats(self, user_id: str) -> Dict[str, Any]:
        """Get voice usage statistics for a user.

        Args:
            user_id: User identifier

        Returns:
            Usage statistics
        """
        with self._lock:
            user_profiles = self._profiles.get(user_id, {})

            if not user_profiles:
                return {"profile_count": 0}

            total_usage = sum(p.usage_count for p in user_profiles.values())
            most_used = max(user_profiles.values(), key=lambda p: p.usage_count)
            voices_used = set(p.settings.voice_id for p in user_profiles.values())

            return {
                "profile_count": len(user_profiles),
                "total_usage": total_usage,
                "most_used_profile": most_used.name,
                "voices_used": list(voices_used),
            }


# Singleton instance
voice_profile_manager = VoiceProfileManager()
