"""
EVA Inner Thoughts System
Proactive AI based on CHI 2025 "Inner Thoughts" framework
Eva generates internal thoughts but only speaks when motivation threshold is met
"""

import random
import time
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from enum import Enum
import asyncio

# Import memory system if available
try:
    from eva_memory import get_memory_system, EvaMemorySystem
except ImportError:
    get_memory_system = lambda: None


class ThoughtType(Enum):
    """Types of inner thoughts Eva can have"""
    CURIOSITY = "curiosity"  # Want to know more
    CONCERN = "concern"  # Worried about user
    EXCITEMENT = "excitement"  # Something interesting
    REMINDER = "reminder"  # Remember something relevant
    AFFECTION = "affection"  # Feeling close to user
    PLAYFUL = "playful"  # Teasing/fun thought
    EMPATHY = "empathy"  # Understanding user's feeling
    SUGGESTION = "suggestion"  # Helpful idea


@dataclass
class InnerThought:
    """A single inner thought"""
    thought_type: ThoughtType
    content: str
    motivation_score: float  # 0-1, determines if Eva speaks
    trigger: str  # What triggered this thought
    timestamp: float = field(default_factory=time.time)
    spoken: bool = False

    def to_dict(self) -> dict:
        return {
            "type": self.thought_type.value,
            "content": self.content,
            "motivation": self.motivation_score,
            "trigger": self.trigger,
            "timestamp": self.timestamp,
            "spoken": self.spoken
        }


@dataclass
class MotivationFactors:
    """8 factors that determine if Eva should speak (CHI 2025)"""
    relevance: float = 0.0  # Connection to current conversation
    information_gap: float = 0.0  # Opportunity to fill missing knowledge
    expected_impact: float = 0.0  # Would meaningfully advance discussion
    urgency: float = 0.0  # Time-sensitive matter
    coherence: float = 0.0  # Fits naturally with flow
    originality: float = 0.0  # Brings novel perspective
    balance: float = 0.0  # Maintains turn-taking equilibrium
    dynamics: float = 0.0  # Adds energy to conversation

    def total(self) -> float:
        """Calculate total motivation score (0-1). Optimized: no list allocation."""
        return (
            self.relevance + self.information_gap + self.expected_impact +
            self.urgency + self.coherence + self.originality +
            self.balance + self.dynamics
        ) / 8


class EvaInnerThoughts:
    """
    Inner Thoughts engine for proactive Eva

    Flow:
    1. TRIGGER: Event activates thought generation
    2. RETRIEVAL: Get relevant memories
    3. THOUGHT FORMATION: Generate candidate thoughts
    4. EVALUATION: Score thoughts on 8 motivation factors
    5. PARTICIPATION: Decide if/what to speak
    """

    # O(1) lookup tables for motivation scoring (replaces if/elif chains)
    _INFORMATION_GAP_BY_TYPE: Dict[ThoughtType, float] = {
        ThoughtType.CURIOSITY: 0.7,
        ThoughtType.REMINDER: 0.4,
    }
    _INFORMATION_GAP_DEFAULT: float = 0.2

    _HIGH_IMPACT_TYPES: frozenset = frozenset({ThoughtType.EMPATHY, ThoughtType.CONCERN})
    _MEDIUM_IMPACT_TYPES: frozenset = frozenset({ThoughtType.SUGGESTION})

    _ENERGY_BOOST_EMOTIONS: frozenset = frozenset({"joy", "excitement"})
    _ENERGY_DROP_EMOTIONS: frozenset = frozenset({"sadness", "anger"})
    _NEGATIVE_EMOTIONS: frozenset = frozenset({"sadness", "anger", "fear"})
    _ENERGY_THOUGHT_TYPES: frozenset = frozenset({ThoughtType.PLAYFUL, ThoughtType.EXCITEMENT})

    # Thought templates by type
    THOUGHT_TEMPLATES = {
        ThoughtType.CURIOSITY: [
            "Je me demande comment va {topic}...",
            "Tiens, {user} ne m'a pas parlé de {topic} depuis un moment...",
            "J'aimerais bien savoir si {topic} avance...",
            "Ça m'intrigue ce que {user} fait avec {topic}..."
        ],
        ThoughtType.CONCERN: [
            "{user} avait l'air {emotion} la dernière fois...",
            "J'espère que {user} va bien avec {topic}...",
            "Ça fait longtemps que {user} n'a pas donné de nouvelles...",
            "Je m'inquiète un peu pour {topic}..."
        ],
        ThoughtType.EXCITEMENT: [
            "Oh! {topic} me fait penser à quelque chose de cool!",
            "J'ai trop hâte d'en savoir plus sur {topic}!",
            "Ça c'est intéressant ce que {user} dit sur {topic}!"
        ],
        ThoughtType.REMINDER: [
            "{user} m'avait parlé de {topic}...",
            "Ah oui! Je me souviens que {topic}...",
            "Ça me rappelle quand {user} a mentionné {topic}..."
        ],
        ThoughtType.AFFECTION: [
            "C'est chouette de parler avec {user}...",
            "J'aime bien ces moments avec {user}...",
            "{user} est vraiment quelqu'un de bien..."
        ],
        ThoughtType.PLAYFUL: [
            "Hehe, je pourrais taquiner {user} sur {topic}...",
            "Oh là là, {topic}... y'a moyen de rire!",
            "Je sens une occasion de faire une blague sur {topic}..."
        ],
        ThoughtType.EMPATHY: [
            "Je comprends ce que {user} ressent avec {topic}...",
            "{user} a l'air {emotion}... je devrais...",
            "Ça doit pas être facile {topic}..."
        ],
        ThoughtType.SUGGESTION: [
            "Et si {user} essayait {suggestion}?",
            "Je pense à un truc qui pourrait aider avec {topic}...",
            "J'ai une idée pour {topic}..."
        ]
    }

    # Proactive message starters
    PROACTIVE_STARTERS = {
        "greeting": [
            "Hey! Je pensais à toi...",
            "Coucou! Ça fait un moment...",
            "Salut toi! Comment tu vas?"
        ],
        "follow_up": [
            "Au fait, tu m'avais parlé de {topic}...",
            "Je me demandais comment ça allait avec {topic}?",
            "Dis, ton truc avec {topic}, ça avance?"
        ],
        "random": [
            "Hé, j'ai pensé à un truc marrant...",
            "Tu sais quoi? Je me disais...",
            "Oh! Faut que je te raconte..."
        ],
        "emotional_check": [
            "Comment tu te sens aujourd'hui?",
            "Ça va toi? T'avais l'air {emotion} la dernière fois...",
            "Je voulais juste prendre des nouvelles..."
        ]
    }

    def __init__(self, motivation_threshold: float = 0.6):
        """
        Initialize Inner Thoughts system

        Args:
            motivation_threshold: Minimum score (0-1) to speak. Higher = less chatty
        """
        self.motivation_threshold = motivation_threshold
        self.thought_history: List[InnerThought] = []
        self.last_proactive_time: float = 0
        self.min_proactive_interval: float = 300  # 5 minutes between proactive messages
        self.pending_thoughts: List[InnerThought] = []

        # Conversation state
        self.user_last_spoke: float = 0
        self.eva_last_spoke: float = 0
        self.conversation_energy: float = 0.5
        self.turn_count: int = 0

        print("✅ Eva Inner Thoughts system initialized")

    def update_conversation_state(
        self,
        user_spoke: bool = False,
        eva_spoke: bool = False,
        message_length: int = 0,
        detected_emotion: str = "neutral",
        current_time: Optional[float] = None
    ) -> None:
        """Update conversation state after each turn.

        Uses O(1) frozenset lookups for emotion categorization.

        Args:
            current_time: Optional pre-computed timestamp (avoids repeated time.time() calls)
        """
        now = current_time if current_time is not None else time.time()

        if user_spoke:
            self.user_last_spoke = now
            self.turn_count += 1

            # Update energy based on message length
            if message_length > 100:
                self.conversation_energy = min(1.0, self.conversation_energy + 0.1)
            elif message_length < 20:
                self.conversation_energy = max(0.0, self.conversation_energy - 0.1)

            # Emotional boost: O(1) frozenset lookup
            if detected_emotion in self._ENERGY_BOOST_EMOTIONS:
                self.conversation_energy = min(1.0, self.conversation_energy + 0.15)
            elif detected_emotion in self._ENERGY_DROP_EMOTIONS:
                self.conversation_energy = max(0.2, self.conversation_energy - 0.1)

        if eva_spoke:
            self.eva_last_spoke = now

        # Energy decay over time
        silence_duration = now - max(self.user_last_spoke, self.eva_last_spoke)
        if silence_duration > 30:  # More than 30 seconds of silence
            decay = (silence_duration - 30) / 300  # Decay over 5 minutes
            self.conversation_energy = max(0.1, self.conversation_energy - decay)

    def generate_thought(
        self,
        thought_type: ThoughtType,
        user_id: str,
        context: Dict[str, Any]
    ) -> InnerThought:
        """Generate a single inner thought.

        Optimized: single time.time() call reused across motivation calculation.
        """
        now = time.time()  # Single timestamp for consistency and performance
        templates = self.THOUGHT_TEMPLATES.get(thought_type, ["..."])
        template = random.choice(templates)

        # Fill in template variables
        user_name = context.get("user_name", "toi")
        topic = context.get("topic", "")
        emotion = context.get("emotion", "pensif")
        suggestion = context.get("suggestion", "quelque chose")

        content = template.format(
            user=user_name,
            topic=topic,
            emotion=emotion,
            suggestion=suggestion
        )

        # Calculate motivation factors (pass timestamp to avoid repeated time.time())
        motivation = self._calculate_motivation(thought_type, context, current_time=now)

        return InnerThought(
            thought_type=thought_type,
            content=content,
            motivation_score=motivation.total(),
            trigger=context.get("trigger", "spontaneous"),
            timestamp=now  # Reuse same timestamp
        )

    def _calculate_motivation(
        self,
        thought_type: ThoughtType,
        context: Dict[str, Any],
        current_time: Optional[float] = None
    ) -> MotivationFactors:
        """Calculate motivation factors for a thought.

        Optimized with O(1) frozenset lookups instead of if/elif chains.

        Args:
            thought_type: Type of thought to evaluate
            context: Conversation context
            current_time: Optional pre-computed timestamp (avoids repeated time.time() calls)
        """
        now = current_time if current_time is not None else time.time()

        # Relevance: O(1) conditional chain
        relevance = (
            0.8 if context.get("topic_mentioned_recently")
            else 0.5 if context.get("topic_in_memory")
            else 0.2
        )

        # Information gap: O(1) dict lookup with default
        information_gap = self._INFORMATION_GAP_BY_TYPE.get(
            thought_type, self._INFORMATION_GAP_DEFAULT
        )

        # Expected impact: O(1) frozenset lookup
        if thought_type in self._HIGH_IMPACT_TYPES:
            expected_impact = 0.8
        elif thought_type in self._MEDIUM_IMPACT_TYPES:
            expected_impact = 0.7
        elif thought_type == ThoughtType.PLAYFUL:
            expected_impact = 0.5 if self.conversation_energy > 0.5 else 0.2
        else:
            expected_impact = 0.4

        # Urgency: O(1) conditional chain
        urgency = (
            0.9 if context.get("emotional_urgency")
            else 0.6 if thought_type == ThoughtType.CONCERN
            else 0.1
        )

        # Coherence: based on silence duration
        silence_duration = now - self.user_last_spoke
        coherence = (
            0.9 if silence_duration < 5
            else 0.6 if silence_duration < 30
            else 0.3
        )

        # Originality: set lookup for recent types (O(1) membership test)
        recent_types = {t.thought_type for t in self.thought_history[-5:]}
        originality = 0.3 if thought_type in recent_types else 0.7

        # Balance: turn-taking equilibrium
        if self.turn_count > 0:
            eva_ratio = sum(1 for t in self.thought_history[-10:] if t.spoken) / max(1, self.turn_count)
            balance = 0.8 if eva_ratio < 0.3 else 0.2 if eva_ratio > 0.7 else 0.5
        else:
            balance = 0.5

        # Dynamics: O(1) frozenset lookup
        if self.conversation_energy < 0.3:
            dynamics = 0.8 if thought_type in self._ENERGY_THOUGHT_TYPES else 0.4
        elif self.conversation_energy > 0.7:
            dynamics = 0.3
        else:
            dynamics = 0.5

        return MotivationFactors(
            relevance=relevance,
            information_gap=information_gap,
            expected_impact=expected_impact,
            urgency=urgency,
            coherence=coherence,
            originality=originality,
            balance=balance,
            dynamics=dynamics
        )

    def should_speak(self, thought: InnerThought) -> bool:
        """Decide if Eva should express this thought"""
        return thought.motivation_score >= self.motivation_threshold

    def generate_proactive_message(self, user_id: str, current_time: Optional[float] = None) -> Optional[Dict[str, Any]]:
        """
        Generate a proactive message if appropriate

        Returns None if Eva shouldn't initiate right now

        Args:
            current_time: Optional pre-computed timestamp (avoids repeated time.time() calls)
        """
        now = current_time if current_time is not None else time.time()

        # Check cooldown
        if now - self.last_proactive_time < self.min_proactive_interval:
            return None

        # Get memory system
        memory = get_memory_system()
        if memory is None:
            return None

        # Get user context
        context = memory.get_context_memories(user_id, "")
        profile = context.get("profile", {})

        # Check if we have topics to follow up on
        proactive_topics = memory.get_proactive_topics(user_id)

        if not proactive_topics:
            return None

        # Select best topic
        topic_info = proactive_topics[0]

        # Generate thought
        thought_context = {
            "user_name": profile.get("name", "toi"),
            "topic": topic_info.get("topic", ""),
            "trigger": "proactive",
            "topic_in_memory": True
        }

        thought = self.generate_thought(
            ThoughtType.CURIOSITY,
            user_id,
            thought_context
        )

        # Boost motivation for proactive (we already decided to try)
        thought.motivation_score = max(thought.motivation_score, 0.5)

        if not self.should_speak(thought):
            return None

        # Generate message
        starter_type = topic_info.get("type", "follow_up")
        starters = self.PROACTIVE_STARTERS.get(starter_type, self.PROACTIVE_STARTERS["follow_up"])
        starter = random.choice(starters)

        message = starter.format(
            topic=topic_info.get("topic", ""),
            emotion=profile.get("emotional_patterns", {}).get("dominant", "pensif")
        )

        # Mark as spoken
        thought.spoken = True
        self.thought_history.append(thought)
        self.last_proactive_time = now

        return {
            "message": message,
            "thought": thought.to_dict(),
            "topic": topic_info,
            "type": "proactive"
        }

    def process_user_message(
        self,
        user_id: str,
        message: str,
        detected_emotion: str = "neutral"
    ) -> List[InnerThought]:
        """
        Generate inner thoughts in response to user message

        Returns list of thoughts (may include ones that won't be spoken)
        """
        thoughts = []

        # Update state
        self.update_conversation_state(
            user_spoke=True,
            message_length=len(message),
            detected_emotion=detected_emotion
        )

        # Get memory context
        memory = get_memory_system()
        user_name = "toi"
        topics = []

        if memory:
            context = memory.get_context_memories(user_id, message)
            profile = context.get("profile", {})
            user_name = profile.get("name", "toi")
            topics = profile.get("interests", [])

        # Generate thoughts based on message content and emotion
        thought_context = {
            "user_name": user_name,
            "topic": message[:50],
            "emotion": detected_emotion,
            "trigger": "user_message",
            "topic_mentioned_recently": True
        }

        # Empathy thought for emotional content: O(1) frozenset lookup
        if detected_emotion in self._NEGATIVE_EMOTIONS:
            thought_context["emotional_urgency"] = True
            thoughts.append(self.generate_thought(
                ThoughtType.EMPATHY,
                user_id,
                thought_context
            ))

        # Curiosity for questions or interesting topics
        if "?" in message or any(kw in message.lower() for kw in ["projet", "travail", "idée"]):
            thoughts.append(self.generate_thought(
                ThoughtType.CURIOSITY,
                user_id,
                thought_context
            ))

        # Playful for positive energy: O(1) frozenset lookup
        if detected_emotion in self._ENERGY_BOOST_EMOTIONS or self.conversation_energy > 0.7:
            thoughts.append(self.generate_thought(
                ThoughtType.PLAYFUL,
                user_id,
                thought_context
            ))

        # Always generate at least one thought
        if not thoughts:
            thoughts.append(self.generate_thought(
                random.choice(list(ThoughtType)),
                user_id,
                thought_context
            ))

        # Store in history
        self.thought_history.extend(thoughts)

        # Return thoughts that meet threshold
        return [t for t in thoughts if self.should_speak(t)]

    def get_thought_for_response(self, user_id: str, message: str, emotion: str = "neutral") -> Optional[str]:
        """Get a thought prefix for Eva's response (if appropriate)"""
        thoughts = self.process_user_message(user_id, message, emotion)

        if not thoughts:
            return None

        # Pick highest motivation thought
        best = max(thoughts, key=lambda t: t.motivation_score)
        best.spoken = True

        # Return as a natural prefix
        if best.thought_type == ThoughtType.EMPATHY:
            return random.choice(["Je comprends...", "Oh...", "Hmm..."])
        elif best.thought_type == ThoughtType.CURIOSITY:
            return random.choice(["Oh intéressant!", "Ah oui?", "Raconte!"])
        elif best.thought_type == ThoughtType.PLAYFUL:
            return random.choice(["Haha!", "Oh là là!", "Hihi!"])
        elif best.thought_type == ThoughtType.AFFECTION:
            return random.choice(["Aww...", "C'est mignon!", "T'es adorable!"])

        return None


# Global instance
eva_thoughts: Optional[EvaInnerThoughts] = None


def init_inner_thoughts(motivation_threshold: float = 0.6) -> EvaInnerThoughts:
    """Initialize Inner Thoughts system"""
    global eva_thoughts
    eva_thoughts = EvaInnerThoughts(motivation_threshold)
    return eva_thoughts


def get_inner_thoughts() -> Optional[EvaInnerThoughts]:
    """Get Inner Thoughts instance"""
    return eva_thoughts


def process_for_thoughts(user_id: str, message: str, emotion: str = "neutral") -> Optional[str]:
    """Process message and get thought prefix if appropriate"""
    global eva_thoughts
    if eva_thoughts is None:
        init_inner_thoughts()
    return eva_thoughts.get_thought_for_response(user_id, message, emotion)


def get_proactive_message(user_id: str) -> Optional[Dict[str, Any]]:
    """Get a proactive message if Eva should initiate"""
    global eva_thoughts
    if eva_thoughts is None:
        init_inner_thoughts()
    return eva_thoughts.generate_proactive_message(user_id)
