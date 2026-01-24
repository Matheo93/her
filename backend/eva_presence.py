"""
EVA Presence System
Handles: Backchanneling, Silence Awareness, Breathing, Turn-Taking
Makes Eva feel present and listening even when not speaking
"""

import random
import time
import asyncio
import numpy as np
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from enum import Enum
import io

# Audio processing
try:
    import soundfile as sf
    AUDIO_AVAILABLE = True
except ImportError:
    AUDIO_AVAILABLE = False


class PresenceState(Enum):
    """Eva's current presence state"""
    IDLE = "idle"  # Waiting, light breathing
    LISTENING = "listening"  # User is speaking
    THINKING = "thinking"  # Processing response
    SPEAKING = "speaking"  # Eva is talking
    EMPATHIC_SILENCE = "empathic_silence"  # Meaningful pause


class BackchannelType(Enum):
    """Types of backchannel responses"""
    ACKNOWLEDGMENT = "acknowledgment"  # "mmhmm", "yeah"
    ENCOURAGEMENT = "encouragement"  # "go on", "tell me more"
    SURPRISE = "surprise"  # "oh!", "wow"
    EMPATHY = "empathy"  # "oh no", "aww"
    AGREEMENT = "agreement"  # "exactly", "right"
    THINKING = "thinking"  # "hmm", "interesting"


@dataclass
class BackchannelConfig:
    """Configuration for a backchannel type"""
    sounds: List[str]
    audio_files: List[str] = field(default_factory=list)
    probability: float = 0.3  # Base probability of use
    min_interval: float = 2.0  # Minimum seconds between backchannels
    emotion_boost: Dict[str, float] = field(default_factory=dict)


@dataclass
class SilenceContext:
    """Context about current silence"""
    duration: float
    after_emotion: str
    user_finished: bool
    is_comfortable: bool  # Should we stay silent?
    recommended_action: str


class EvaPresenceSystem:
    """
    Manages Eva's presence in conversation

    Features:
    - Backchanneling: "mmhmm", "yeah" while user speaks
    - Silence awareness: Know when to stay quiet
    - Breathing sounds: Subtle presence indicators
    - Turn-taking: Natural conversation flow

    Optimizations:
    - Pre-computed frozensets for O(1) emotion lookups
    - Optional timestamp parameters to avoid repeated time.time() calls
    """

    # Pre-computed emotion sets for O(1) lookup (class-level for performance)
    _SAD_EMOTIONS = frozenset({"sadness", "grief"})
    _EMOTIONAL_EMOTIONS = frozenset({"fear", "anger", "frustration"})
    _CRYING_EMOTIONS = frozenset({"grief", "crying"})
    _SILENCE_NEEDS_SPACE = frozenset({"sadness", "fear"})
    _DELAY_EMOTIONS = frozenset({"anger", "frustration"})

    # Backchannel configurations
    BACKCHANNELS = {
        BackchannelType.ACKNOWLEDGMENT: BackchannelConfig(
            sounds=["mmhmm", "mh mh", "ouais", "oui oui", "d'accord", "ok"],
            probability=0.4,
            min_interval=3.0,
            emotion_boost={"neutral": 0.1}
        ),
        BackchannelType.ENCOURAGEMENT: BackchannelConfig(
            sounds=["continue", "raconte", "et après?", "vas-y", "je t'écoute"],
            probability=0.2,
            min_interval=5.0,
            emotion_boost={"curiosity": 0.2}
        ),
        BackchannelType.SURPRISE: BackchannelConfig(
            sounds=["oh!", "ah bon?", "sérieux?", "vraiment?", "nooon!", "waouh"],
            probability=0.3,
            min_interval=4.0,
            emotion_boost={"surprise": 0.3, "excitement": 0.2}
        ),
        BackchannelType.EMPATHY: BackchannelConfig(
            sounds=["oh non...", "mince...", "je comprends...", "aww...", "pfff..."],
            probability=0.5,
            min_interval=4.0,
            emotion_boost={"sadness": 0.4, "frustration": 0.3}
        ),
        BackchannelType.AGREEMENT: BackchannelConfig(
            sounds=["exactement", "tout à fait", "carrément", "c'est clair", "grave"],
            probability=0.25,
            min_interval=4.0,
            emotion_boost={"agreement": 0.2}
        ),
        BackchannelType.THINKING: BackchannelConfig(
            sounds=["hmm", "intéressant...", "ah oui...", "je vois...", "effectivement"],
            probability=0.3,
            min_interval=3.0,
            emotion_boost={"neutral": 0.1, "curiosity": 0.1}
        )
    }

    # Comfortable silence durations by context
    SILENCE_THRESHOLDS = {
        "neutral": 1.0,  # Normal pause before responding
        "emotional": 2.0,  # After emotional content
        "sad": 3.0,  # After sadness, give space
        "thinking": 1.5,  # When user is thinking
        "question": 0.8,  # After a question, respond quicker
    }

    # Breathing patterns for different states
    BREATHING_PATTERNS = {
        PresenceState.IDLE: {"rate": 0.2, "depth": 0.3, "audible": False},
        PresenceState.LISTENING: {"rate": 0.25, "depth": 0.4, "audible": True},
        PresenceState.THINKING: {"rate": 0.15, "depth": 0.5, "audible": True},
        PresenceState.SPEAKING: {"rate": 0.3, "depth": 0.6, "audible": False},
        PresenceState.EMPATHIC_SILENCE: {"rate": 0.1, "depth": 0.3, "audible": True},
    }

    def __init__(self, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.state = PresenceState.IDLE

        # Timing
        self.last_backchannel_time: float = 0
        self.last_user_speech_end: float = 0
        self.last_eva_speech_end: float = 0
        self.current_silence_start: float = 0

        # Backchannel tracking per type
        self.last_backchannel_by_type: Dict[BackchannelType, float] = {
            t: 0 for t in BackchannelType
        }

        # Audio cache for backchannel sounds
        self.backchannel_audio_cache: Dict[str, bytes] = {}

        # Conversation context
        self.user_speaking: bool = False
        self.user_emotion: str = "neutral"
        self.user_speech_duration: float = 0

        print("✅ Eva Presence System initialized")

    def set_state(self, state: PresenceState):
        """Set Eva's presence state"""
        self.state = state

    def user_started_speaking(self):
        """Called when VAD detects user speech start"""
        self.user_speaking = True
        self.set_state(PresenceState.LISTENING)
        self.user_speech_duration = 0

    def user_stopped_speaking(self, duration: float = 0, current_time: Optional[float] = None):
        """Called when VAD detects user speech end.

        Args:
            duration: How long user was speaking
            current_time: Optional timestamp to avoid repeated time.time() calls
        """
        now = current_time if current_time is not None else time.time()
        self.user_speaking = False
        self.last_user_speech_end = now
        self.user_speech_duration = duration
        self.current_silence_start = now
        self.set_state(PresenceState.THINKING)

    def eva_started_speaking(self):
        """Called when Eva starts speaking"""
        self.set_state(PresenceState.SPEAKING)

    def eva_stopped_speaking(self, current_time: Optional[float] = None):
        """Called when Eva stops speaking.

        Args:
            current_time: Optional timestamp to avoid repeated time.time() calls
        """
        now = current_time if current_time is not None else time.time()
        self.last_eva_speech_end = now
        self.current_silence_start = now
        self.set_state(PresenceState.IDLE)

    def should_backchannel(
        self, detected_emotion: str = "neutral", current_time: Optional[float] = None
    ) -> Optional[Tuple[str, BackchannelType]]:
        """
        Determine if Eva should produce a backchannel response.

        Args:
            detected_emotion: Current detected emotion
            current_time: Optional timestamp to avoid repeated time.time() calls

        Returns: Tuple of (sound, type) or None
        """
        if not self.user_speaking:
            return None

        now = current_time if current_time is not None else time.time()

        # Global cooldown
        if now - self.last_backchannel_time < 2.0:
            return None

        # Need minimum speech duration
        if self.user_speech_duration < 2.0:
            return None

        self.user_emotion = detected_emotion

        # Find appropriate backchannel type
        candidates = []

        for bc_type, config in self.BACKCHANNELS.items():
            # Check type-specific cooldown
            if now - self.last_backchannel_by_type[bc_type] < config.min_interval:
                continue

            # Calculate probability with emotion boost
            prob = config.probability
            for emotion, boost in config.emotion_boost.items():
                if emotion in detected_emotion.lower():
                    prob += boost

            # Random check
            if random.random() < prob:
                candidates.append((bc_type, config, prob))

        if not candidates:
            return None

        # Select based on probability (weighted)
        candidates.sort(key=lambda x: x[2], reverse=True)
        selected_type, config, _ = candidates[0]

        # Select sound
        sound = random.choice(config.sounds)

        # Update timing
        self.last_backchannel_time = now
        self.last_backchannel_by_type[selected_type] = now

        return (sound, selected_type)

    def analyze_silence(
        self, detected_emotion: str = "neutral", current_time: Optional[float] = None
    ) -> SilenceContext:
        """
        Analyze current silence and recommend action.

        Args:
            detected_emotion: Current detected emotion
            current_time: Optional timestamp to avoid repeated time.time() calls

        Returns context about whether to speak or stay silent
        """
        now = current_time if current_time is not None else time.time()
        silence_duration = now - self.current_silence_start

        # Determine threshold based on context (using frozensets for O(1) lookup)
        if detected_emotion in self._SAD_EMOTIONS:
            threshold = self.SILENCE_THRESHOLDS["sad"]
            after_emotion = "sad"
        elif detected_emotion in self._EMOTIONAL_EMOTIONS:
            threshold = self.SILENCE_THRESHOLDS["emotional"]
            after_emotion = "emotional"
        else:
            threshold = self.SILENCE_THRESHOLDS["neutral"]
            after_emotion = "neutral"

        # Determine if silence is comfortable (should we NOT speak?)
        is_comfortable = silence_duration < threshold

        # Recommend action (using frozenset for O(1) lookup)
        if silence_duration < 0.5:
            action = "wait"  # Too soon
        elif is_comfortable and detected_emotion in self._SAD_EMOTIONS:
            action = "presence"  # Show presence without words
        elif silence_duration > threshold * 2:
            action = "speak"  # Should respond
        elif silence_duration > threshold:
            action = "ready"  # Can speak if needed
        else:
            action = "wait"

        return SilenceContext(
            duration=silence_duration,
            after_emotion=after_emotion,
            user_finished=not self.user_speaking,
            is_comfortable=is_comfortable,
            recommended_action=action
        )

    def get_presence_sound(self) -> Optional[Dict[str, Any]]:
        """
        Get a subtle presence sound (breathing, soft acknowledgment)

        Used during silence to maintain presence
        """
        if self.state == PresenceState.EMPATHIC_SILENCE:
            # Soft breath or sigh
            sounds = ["...", "(soft breath)", "(gentle sigh)"]
            return {
                "type": "presence",
                "sound": random.choice(sounds),
                "audible": True
            }

        breathing = self.BREATHING_PATTERNS.get(self.state, {})
        if breathing.get("audible"):
            return {
                "type": "breathing",
                "rate": breathing.get("rate", 0.2),
                "depth": breathing.get("depth", 0.3)
            }

        return None

    def should_stay_silent(
        self, detected_emotion: str = "neutral", current_time: Optional[float] = None
    ) -> Tuple[bool, str]:
        """
        Determine if Eva should stay silent (presence without words).

        Args:
            detected_emotion: Current detected emotion
            current_time: Optional timestamp to avoid repeated time.time() calls

        Returns: (should_stay_silent, reason)
        """
        # After very emotional content (using frozenset for O(1) lookup)
        if detected_emotion in self._CRYING_EMOTIONS:
            return True, "emotional_support"

        # User is still processing (pass timestamp through)
        silence = self.analyze_silence(detected_emotion, current_time)
        if silence.is_comfortable and detected_emotion in self._SILENCE_NEEDS_SPACE:
            return True, "giving_space"

        # Very short pause - don't interrupt thinking
        if silence.duration < 0.8 and not self.user_speaking:
            return True, "natural_pause"

        return False, "ready_to_speak"

    def get_response_delay(self, detected_emotion: str = "neutral") -> float:
        """
        Calculate appropriate delay before responding.

        Based on emotional context and conversation flow
        """
        base_delay = 0.3  # Minimum 300ms

        # Add delay for emotional content (using frozenset for O(1) lookup)
        if detected_emotion == "sadness":
            base_delay += 0.8  # Pause before responding to sadness
        elif detected_emotion == "joy":
            base_delay += 0.2  # Quick response to joy
        elif detected_emotion in self._DELAY_EMOTIONS:
            base_delay += 0.5  # Slight pause for anger

        # Add delay based on user speech length
        if self.user_speech_duration > 10:
            base_delay += 0.5  # Longer response for longer input

        return min(base_delay, 2.0)  # Cap at 2 seconds

    def get_turn_taking_cue(self, current_time: Optional[float] = None) -> Dict[str, Any]:
        """
        Get current turn-taking state for coordination.

        Args:
            current_time: Optional timestamp to avoid repeated time.time() calls

        Used by frontend for avatar animations
        """
        now = current_time if current_time is not None else time.time()

        return {
            "state": self.state.value,
            "user_speaking": self.user_speaking,
            "silence_duration": now - self.current_silence_start if not self.user_speaking else 0,
            "can_speak": not self.user_speaking and (now - self.current_silence_start) > 0.5,
            "breathing": self.BREATHING_PATTERNS.get(self.state, {}),
            "attention_level": 0.9 if self.state == PresenceState.LISTENING else 0.5
        }

    def generate_backchannel_audio(self, sound: str) -> Optional[bytes]:
        """
        Generate audio for a backchannel sound

        Returns WAV bytes or None
        """
        # Check cache
        if sound in self.backchannel_audio_cache:
            return self.backchannel_audio_cache[sound]

        # For now, return None - actual TTS should generate this
        # In production, pre-generate and cache backchannel audio
        return None


# Interrupt detection for full-duplex


class InterruptDetector:
    """
    Detect user interruptions during Eva's speech

    Uses VAD and energy analysis
    """

    def __init__(self, energy_threshold: float = 0.1, min_duration: float = 0.3):
        self.energy_threshold = energy_threshold
        self.min_duration = min_duration
        self.interrupt_start: Optional[float] = None
        self.is_interrupted: bool = False

    def process_audio_chunk(
        self, audio_chunk: np.ndarray, current_time: Optional[float] = None
    ) -> bool:
        """
        Process audio chunk and detect if user is interrupting.

        Args:
            audio_chunk: Audio samples to analyze
            current_time: Optional timestamp to avoid repeated time.time() calls

        Returns True if interrupt detected
        """
        # Calculate RMS energy
        if len(audio_chunk) == 0:
            return False

        energy = np.sqrt(np.mean(audio_chunk ** 2))

        if energy > self.energy_threshold:
            now = current_time if current_time is not None else time.time()
            if self.interrupt_start is None:
                self.interrupt_start = now
            elif now - self.interrupt_start > self.min_duration:
                self.is_interrupted = True
                return True
        else:
            self.interrupt_start = None

        return False

    def reset(self):
        """Reset interrupt state"""
        self.interrupt_start = None
        self.is_interrupted = False


# Global instance
eva_presence: Optional[EvaPresenceSystem] = None
interrupt_detector: Optional[InterruptDetector] = None


def init_presence_system(sample_rate: int = 16000) -> EvaPresenceSystem:
    """Initialize presence system"""
    global eva_presence, interrupt_detector
    eva_presence = EvaPresenceSystem(sample_rate)
    interrupt_detector = InterruptDetector()
    return eva_presence


def get_presence_system() -> Optional[EvaPresenceSystem]:
    """Get presence system instance"""
    return eva_presence


def should_backchannel(emotion: str = "neutral") -> Optional[Tuple[str, str]]:
    """Check if Eva should backchannel"""
    global eva_presence
    if eva_presence is None:
        init_presence_system()
    result = eva_presence.should_backchannel(emotion)
    if result:
        return (result[0], result[1].value)
    return None


def analyze_silence(emotion: str = "neutral") -> Dict[str, Any]:
    """Analyze current silence"""
    global eva_presence
    if eva_presence is None:
        init_presence_system()
    context = eva_presence.analyze_silence(emotion)
    return {
        "duration": context.duration,
        "after_emotion": context.after_emotion,
        "is_comfortable": context.is_comfortable,
        "recommended_action": context.recommended_action
    }


def get_response_delay(emotion: str = "neutral") -> float:
    """Get recommended response delay"""
    global eva_presence
    if eva_presence is None:
        init_presence_system()
    return eva_presence.get_response_delay(emotion)


def check_interrupt(audio_chunk: np.ndarray) -> bool:
    """Check if user is interrupting"""
    global interrupt_detector
    if interrupt_detector is None:
        interrupt_detector = InterruptDetector()
    return interrupt_detector.process_audio_chunk(audio_chunk)
