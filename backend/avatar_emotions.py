"""
Avatar Emotions Controller - Sprint 579

REST API for controlling avatar emotions and expressions.

Features:
- Set current emotion with intensity
- Trigger micro-expressions (blink, smile, etc.)
- Queue emotion transitions
- Get current emotional state
- Emotion blending between states
"""

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from collections import deque


class Emotion(str, Enum):
    """Available emotions for the avatar."""
    JOY = "joy"
    SADNESS = "sadness"
    TENDERNESS = "tenderness"
    EXCITEMENT = "excitement"
    ANGER = "anger"
    FEAR = "fear"
    SURPRISE = "surprise"
    NEUTRAL = "neutral"
    CURIOSITY = "curiosity"
    PLAYFUL = "playful"
    LOVE = "love"
    COMFORT = "comfort"


class MicroExpression(str, Enum):
    """Available micro-expressions."""
    BLINK = "blink"
    SMILE = "smile"
    SMIRK = "smirk"
    RAISE_EYEBROW = "raise_eyebrow"
    WINK = "wink"
    NOD = "nod"
    TILT_HEAD = "tilt_head"


@dataclass
class EmotionState:
    """Current emotional state of the avatar."""
    emotion: Emotion = Emotion.NEUTRAL
    intensity: float = 0.5  # 0.0 to 1.0
    secondary_emotion: Optional[Emotion] = None
    secondary_intensity: float = 0.0
    blend_ratio: float = 0.0  # How much secondary blends with primary
    updated_at: float = field(default_factory=time.time)
    transition_duration_ms: int = 300


@dataclass
class QueuedEmotion:
    """Emotion waiting in the transition queue."""
    emotion: Emotion
    intensity: float
    duration_ms: int  # How long to hold this emotion
    transition_ms: int  # How long to transition to this emotion
    queued_at: float = field(default_factory=time.time)


class AvatarEmotionController:
    """Controls avatar emotions with transitions and queuing.

    Usage:
        controller = AvatarEmotionController()

        # Set emotion immediately
        controller.set_emotion(Emotion.JOY, intensity=0.8)

        # Trigger micro-expression
        controller.trigger_micro_expression(MicroExpression.SMILE)

        # Queue emotion for later
        controller.queue_emotion(Emotion.TENDERNESS, duration_ms=2000)

        # Get current state
        state = controller.get_state()
    """

    def __init__(self):
        self.state = EmotionState()
        self.emotion_queue: deque[QueuedEmotion] = deque(maxlen=10)
        self.pending_micro_expressions: list[tuple[MicroExpression, float]] = []
        self.last_micro_expression: Optional[MicroExpression] = None
        self.last_micro_expression_at: float = 0
        self._processing_queue = False

    def set_emotion(
        self,
        emotion: Emotion,
        intensity: float = 0.6,
        transition_ms: int = 300,
    ) -> EmotionState:
        """Set the current emotion immediately.

        Args:
            emotion: Target emotion
            intensity: Emotion intensity (0.0-1.0)
            transition_ms: Transition duration in milliseconds

        Returns:
            Updated emotion state
        """
        intensity = max(0.0, min(1.0, intensity))

        # Store previous as secondary for smooth blending
        if self.state.emotion != emotion:
            self.state.secondary_emotion = self.state.emotion
            self.state.secondary_intensity = self.state.intensity
            self.state.blend_ratio = 1.0  # Start fully blended, will animate to 0

        self.state.emotion = emotion
        self.state.intensity = intensity
        self.state.transition_duration_ms = transition_ms
        self.state.updated_at = time.time()

        return self.state

    def blend_emotions(
        self,
        primary: Emotion,
        secondary: Emotion,
        ratio: float = 0.5,
        intensity: float = 0.6,
    ) -> EmotionState:
        """Blend two emotions together.

        Args:
            primary: Primary emotion
            secondary: Secondary emotion to blend
            ratio: How much secondary affects the blend (0.0-1.0)
            intensity: Overall intensity

        Returns:
            Updated emotion state
        """
        self.state.emotion = primary
        self.state.intensity = intensity
        self.state.secondary_emotion = secondary
        self.state.secondary_intensity = intensity
        self.state.blend_ratio = max(0.0, min(1.0, ratio))
        self.state.updated_at = time.time()

        return self.state

    def queue_emotion(
        self,
        emotion: Emotion,
        intensity: float = 0.6,
        duration_ms: int = 2000,
        transition_ms: int = 300,
    ) -> int:
        """Add emotion to the transition queue.

        Args:
            emotion: Emotion to queue
            intensity: Emotion intensity
            duration_ms: How long to display this emotion
            transition_ms: Transition duration

        Returns:
            Queue position (0 = next up)
        """
        queued = QueuedEmotion(
            emotion=emotion,
            intensity=intensity,
            duration_ms=duration_ms,
            transition_ms=transition_ms,
        )
        self.emotion_queue.append(queued)
        return len(self.emotion_queue) - 1

    def clear_queue(self) -> int:
        """Clear all queued emotions.

        Returns:
            Number of cleared items
        """
        count = len(self.emotion_queue)
        self.emotion_queue.clear()
        return count

    def trigger_micro_expression(
        self,
        expression: MicroExpression,
        duration_ms: int = 300,
    ) -> bool:
        """Trigger a micro-expression animation.

        Args:
            expression: Type of micro-expression
            duration_ms: How long to show it

        Returns:
            True if triggered, False if cooldown active
        """
        now = time.time()

        # Cooldown: don't spam micro-expressions
        if now - self.last_micro_expression_at < 0.5:  # 500ms cooldown
            return False

        self.pending_micro_expressions.append((expression, now + duration_ms / 1000))
        self.last_micro_expression = expression
        self.last_micro_expression_at = now

        return True

    def get_active_micro_expressions(self) -> list[MicroExpression]:
        """Get currently active micro-expressions.

        Returns:
            List of active micro-expressions
        """
        now = time.time()
        # Clean up expired
        self.pending_micro_expressions = [
            (expr, end) for expr, end in self.pending_micro_expressions
            if end > now
        ]
        return [expr for expr, _ in self.pending_micro_expressions]

    def get_state(self) -> dict:
        """Get current avatar emotional state.

        Returns:
            Dictionary with full emotional state
        """
        now = time.time()
        time_since_update = (now - self.state.updated_at) * 1000  # ms

        # Calculate blend progress (0 = fully transitioned, 1 = just started)
        if self.state.transition_duration_ms > 0:
            blend_progress = max(0.0, 1.0 - time_since_update / self.state.transition_duration_ms)
        else:
            blend_progress = 0.0

        return {
            "emotion": self.state.emotion.value,
            "intensity": round(self.state.intensity, 3),
            "secondary_emotion": self.state.secondary_emotion.value if self.state.secondary_emotion else None,
            "secondary_intensity": round(self.state.secondary_intensity, 3),
            "blend_ratio": round(self.state.blend_ratio * blend_progress, 3),
            "transition_progress": round(1.0 - blend_progress, 3),
            "updated_at": self.state.updated_at,
            "queue_length": len(self.emotion_queue),
            "micro_expressions": [e.value for e in self.get_active_micro_expressions()],
        }

    def get_next_queued(self) -> Optional[QueuedEmotion]:
        """Get and remove next queued emotion.

        Returns:
            Next queued emotion or None
        """
        if self.emotion_queue:
            return self.emotion_queue.popleft()
        return None

    async def process_queue(self) -> None:
        """Process emotion queue in background.

        Automatically transitions through queued emotions.
        """
        if self._processing_queue:
            return

        self._processing_queue = True
        try:
            while self.emotion_queue:
                queued = self.emotion_queue.popleft()

                # Transition to this emotion
                self.set_emotion(
                    queued.emotion,
                    queued.intensity,
                    queued.transition_ms,
                )

                # Wait for transition + duration
                total_wait = (queued.transition_ms + queued.duration_ms) / 1000
                await asyncio.sleep(total_wait)
        finally:
            self._processing_queue = False


# Emotion presets for common scenarios
EMOTION_PRESETS = {
    "greeting": {
        "emotion": Emotion.JOY,
        "intensity": 0.7,
        "micro_expression": MicroExpression.SMILE,
    },
    "thinking": {
        "emotion": Emotion.CURIOSITY,
        "intensity": 0.5,
        "micro_expression": MicroExpression.TILT_HEAD,
    },
    "listening": {
        "emotion": Emotion.NEUTRAL,
        "intensity": 0.4,
        "micro_expression": MicroExpression.NOD,
    },
    "empathy": {
        "emotion": Emotion.TENDERNESS,
        "intensity": 0.6,
        "micro_expression": None,
    },
    "excited": {
        "emotion": Emotion.EXCITEMENT,
        "intensity": 0.8,
        "micro_expression": MicroExpression.SMILE,
    },
    "sad": {
        "emotion": Emotion.SADNESS,
        "intensity": 0.5,
        "micro_expression": None,
    },
    "playful": {
        "emotion": Emotion.PLAYFUL,
        "intensity": 0.7,
        "micro_expression": MicroExpression.WINK,
    },
}


# Singleton instance
avatar_emotion_controller = AvatarEmotionController()
