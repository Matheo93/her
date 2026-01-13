"""
EVA HER Integration Module
Brings together all HER-like features:
- Emotional TTS
- Long-term Memory
- Voice Emotion Detection
- Inner Thoughts (Proactivity)
- Presence System (Backchanneling, Silence)
- Realtime Communication

This is the main integration point for HER-like behavior.
"""

import asyncio
import time
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass

# Import all HER modules
from eva_memory import init_memory_system, get_memory_system, EvaMemorySystem
from eva_voice_emotion import init_voice_emotion, detect_voice_emotion, VoiceEmotion
from eva_inner_thoughts import init_inner_thoughts, get_inner_thoughts, process_for_thoughts, get_proactive_message
from eva_presence import init_presence_system, get_presence_system, should_backchannel, analyze_silence, get_response_delay
from eva_realtime import init_realtime, get_realtime_manager, process_realtime_audio
from eva_emotional_tts import init_emotional_tts, get_emotional_tts, emotional_tts


@dataclass
class HERConfig:
    """Configuration for HER-like behavior"""
    # Memory
    memory_storage_path: str = "./eva_memory"

    # Proactivity
    proactivity_threshold: float = 0.6  # 0-1, higher = less chatty
    min_proactive_interval: float = 300  # seconds between proactive messages

    # Backchanneling
    backchannel_enabled: bool = True
    backchannel_probability: float = 0.3

    # Silence
    empathic_silence_enabled: bool = True
    max_comfortable_silence: float = 2.0  # seconds

    # Emotional TTS
    emotional_tts_enabled: bool = True
    tts_model_cache: str = "./tts_models"

    # Voice emotion detection
    voice_emotion_enabled: bool = True

    # Response timing
    base_response_delay: float = 0.3  # seconds
    emotional_delay_multiplier: float = 1.5


class EvaHER:
    """
    Main HER integration class

    Coordinates all subsystems for human-like interaction
    """

    def __init__(self, config: Optional[HERConfig] = None):
        self.config = config or HERConfig()
        self.initialized = False

        # Subsystem instances
        self.memory: Optional[EvaMemorySystem] = None
        self.voice_emotion = None
        self.inner_thoughts = None
        self.presence = None
        self.realtime = None
        self.emotional_tts = None

    async def initialize(self):
        """Initialize all HER subsystems"""
        print("🚀 Initializing EVA HER systems...")

        # 1. Memory system
        try:
            self.memory = init_memory_system(self.config.memory_storage_path)
            print("✅ Memory system ready")
        except Exception as e:
            print(f"⚠️ Memory init failed: {e}")

        # 2. Voice emotion detection
        if self.config.voice_emotion_enabled:
            try:
                self.voice_emotion = init_voice_emotion()
                print("✅ Voice emotion detection ready")
            except Exception as e:
                print(f"⚠️ Voice emotion init failed: {e}")

        # 3. Inner thoughts (proactivity)
        try:
            self.inner_thoughts = init_inner_thoughts(self.config.proactivity_threshold)
            print("✅ Inner thoughts system ready")
        except Exception as e:
            print(f"⚠️ Inner thoughts init failed: {e}")

        # 4. Presence system (backchanneling, silence)
        try:
            self.presence = init_presence_system()
            print("✅ Presence system ready")
        except Exception as e:
            print(f"⚠️ Presence init failed: {e}")

        # 5. Realtime communication
        try:
            self.realtime = init_realtime()
            print("✅ Realtime system ready")
        except Exception as e:
            print(f"⚠️ Realtime init failed: {e}")

        # 6. Emotional TTS (can be slow, load last)
        if self.config.emotional_tts_enabled:
            try:
                self.emotional_tts = init_emotional_tts(self.config.tts_model_cache)
                print("✅ Emotional TTS ready")
            except Exception as e:
                print(f"⚠️ Emotional TTS init failed: {e}")

        self.initialized = True
        print("🎭 EVA HER systems initialized!")

    async def process_message(
        self,
        user_id: str,
        message: str,
        voice_audio: Optional[bytes] = None
    ) -> Dict[str, Any]:
        """
        Process a user message with full HER pipeline

        Returns dict with:
        - response: Eva's response text
        - emotion: Detected/expressed emotion
        - audio: TTS audio bytes (if enabled)
        - thought_prefix: Inner thought prefix (if any)
        - backchannel: Backchannel sound (if appropriate)
        - response_delay: Recommended delay before response
        - memory_context: Relevant memories
        - proactive_topic: Topic for proactive follow-up
        """
        result = {
            "user_emotion": "neutral",
            "response_emotion": "neutral",
            "thought_prefix": None,
            "backchannel": None,
            "response_delay": self.config.base_response_delay,
            "memory_context": None,
            "should_stay_silent": False
        }

        # 1. Detect emotion from voice (if available) OR from text
        if voice_audio and self.voice_emotion:
            voice_emotion = detect_voice_emotion(voice_audio)
            result["user_emotion"] = voice_emotion.emotion
            result["voice_emotion_details"] = {
                "confidence": voice_emotion.confidence,
                "intensity": voice_emotion.intensity,
                "valence": voice_emotion.valence,
                "arousal": voice_emotion.arousal
            }
        else:
            # Fallback: detect emotion from text (critical for HER-like empathy)
            result["user_emotion"] = self._detect_text_emotion(message)

        # 2. Get memory context
        if self.memory:
            memory_context = self.memory.get_context_memories(user_id, message)
            result["memory_context"] = memory_context

        # 3. Check if should stay silent (empathic silence)
        if self.presence and self.config.empathic_silence_enabled:
            should_silent, reason = self.presence.should_stay_silent(result["user_emotion"])
            if should_silent:
                result["should_stay_silent"] = True
                result["silence_reason"] = reason

        # 4. Get inner thought prefix
        if self.inner_thoughts and not result["should_stay_silent"]:
            thought_prefix = process_for_thoughts(user_id, message, result["user_emotion"])
            result["thought_prefix"] = thought_prefix

        # 5. Calculate response delay
        if self.presence:
            result["response_delay"] = self.presence.get_response_delay(result["user_emotion"])

        # 6. Determine response emotion based on user emotion
        result["response_emotion"] = self._determine_response_emotion(result["user_emotion"])

        return result

    def _determine_response_emotion(self, user_emotion: str) -> str:
        """Determine what emotion Eva should express based on user emotion"""
        # Empathetic mirroring with adjustment
        emotion_responses = {
            "joy": "joy",
            "sadness": "tenderness",
            "anger": "tenderness",  # Calm anger with gentleness
            "fear": "tenderness",
            "surprise": "excitement",
            "excitement": "excitement",
            "neutral": "neutral"
        }
        return emotion_responses.get(user_emotion, "neutral")

    async def generate_response_audio(
        self,
        text: str,
        emotion: str = "neutral",
        intensity: float = 0.5
    ) -> Optional[bytes]:
        """Generate emotional TTS audio for response"""
        if not self.emotional_tts:
            return None

        return await emotional_tts(text, emotion, intensity)

    async def get_backchannel(self, user_emotion: str = "neutral") -> Optional[Tuple[str, str]]:
        """Get a backchannel response if appropriate"""
        if not self.config.backchannel_enabled or not self.presence:
            return None

        return should_backchannel(user_emotion)

    async def get_proactive_message(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get a proactive message if Eva should initiate"""
        if not self.inner_thoughts:
            return None

        return get_proactive_message(user_id)

    async def store_interaction(
        self,
        user_id: str,
        user_message: str,
        eva_response: str,
        emotion: str = "neutral"
    ):
        """Store interaction in memory"""
        if self.memory:
            self.memory.extract_and_store(user_id, user_message, eva_response, emotion)

    def get_status(self) -> Dict[str, Any]:
        """Get status of all HER systems"""
        return {
            "initialized": self.initialized,
            "memory": self.memory is not None,
            "voice_emotion": self.voice_emotion is not None,
            "inner_thoughts": self.inner_thoughts is not None,
            "presence": self.presence is not None,
            "realtime": self.realtime is not None,
            "emotional_tts": self.emotional_tts is not None,
            "config": {
                "proactivity_threshold": self.config.proactivity_threshold,
                "backchannel_enabled": self.config.backchannel_enabled,
                "emotional_tts_enabled": self.config.emotional_tts_enabled
            }
        }


# Global instance
eva_her: Optional[EvaHER] = None


async def init_her(config: Optional[HERConfig] = None) -> EvaHER:
    """Initialize EVA HER system"""
    global eva_her
    eva_her = EvaHER(config)
    await eva_her.initialize()
    return eva_her


def get_her() -> Optional[EvaHER]:
    """Get EVA HER instance"""
    return eva_her


# Convenience functions


async def her_process_message(user_id: str, message: str, voice_audio: Optional[bytes] = None) -> Dict[str, Any]:
    """Process message through HER pipeline"""
    global eva_her
    if eva_her is None:
        await init_her()
    return await eva_her.process_message(user_id, message, voice_audio)


async def her_generate_audio(text: str, emotion: str = "neutral") -> Optional[bytes]:
    """Generate emotional TTS audio"""
    global eva_her
    if eva_her is None:
        await init_her()
    return await eva_her.generate_response_audio(text, emotion)


async def her_store_interaction(user_id: str, user_msg: str, eva_msg: str, emotion: str = "neutral"):
    """Store interaction in memory"""
    global eva_her
    if eva_her is None:
        await init_her()
    await eva_her.store_interaction(user_id, user_msg, eva_msg, emotion)
