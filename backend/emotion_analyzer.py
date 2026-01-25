"""
Emotion Analyzer - Sprint 593

Analyze text to detect emotional content and intensity.

Features:
- Keyword-based emotion detection
- Emoji analysis
- Punctuation patterns
- Intensity scoring
- Multi-emotion support
"""

import re
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple
from enum import Enum


class Emotion(str, Enum):
    """Detectable emotions."""
    JOY = "joy"
    SADNESS = "sadness"
    ANGER = "anger"
    FEAR = "fear"
    SURPRISE = "surprise"
    LOVE = "love"
    CURIOSITY = "curiosity"
    EXCITEMENT = "excitement"
    FRUSTRATION = "frustration"
    GRATITUDE = "gratitude"
    NEUTRAL = "neutral"


@dataclass
class EmotionResult:
    """Result of emotion analysis."""
    primary_emotion: Emotion
    primary_intensity: float
    secondary_emotion: Optional[Emotion] = None
    secondary_intensity: float = 0.0
    all_scores: Dict[str, float] = None
    confidence: float = 0.0

    def to_dict(self) -> dict:
        return {
            "primary_emotion": self.primary_emotion.value,
            "primary_intensity": round(self.primary_intensity, 2),
            "secondary_emotion": self.secondary_emotion.value if self.secondary_emotion else None,
            "secondary_intensity": round(self.secondary_intensity, 2),
            "all_scores": {k: round(v, 2) for k, v in (self.all_scores or {}).items()},
            "confidence": round(self.confidence, 2),
        }


# French emotion keywords
EMOTION_KEYWORDS: Dict[Emotion, List[str]] = {
    Emotion.JOY: [
        "heureux", "heureuse", "content", "contente", "joyeux", "joyeuse",
        "ravi", "ravie", "super", "génial", "excellent", "parfait",
        "bien", "bon", "bonne", "cool", "chouette", "top", "youpi",
        "fantastique", "merveilleux", "magnifique", "formidable",
    ],
    Emotion.SADNESS: [
        "triste", "malheureux", "malheureuse", "déprimé", "déprimée",
        "déçu", "déçue", "mélancolique", "nostalgique", "seul", "seule",
        "isolé", "isolée", "pleure", "larmes", "chagrin", "peine",
        "morose", "abattu", "abattue", "cafard",
    ],
    Emotion.ANGER: [
        "énervé", "énervée", "fâché", "fâchée", "furieux", "furieuse",
        "agacé", "agacée", "irrité", "irritée", "colère", "rage",
        "exaspéré", "exaspérée", "insupportable", "marre", "ras-le-bol",
    ],
    Emotion.FEAR: [
        "peur", "effrayé", "effrayée", "terrifié", "terrifiée",
        "angoissé", "angoissée", "anxieux", "anxieuse", "inquiet", "inquiète",
        "stressé", "stressée", "paniqué", "paniquée", "crainte",
    ],
    Emotion.SURPRISE: [
        "surpris", "surprise", "étonné", "étonnée", "choqué", "choquée",
        "incroyable", "wow", "waouh", "oh", "ah", "vraiment",
        "sérieux", "sérieusement", "pas possible", "dingue",
    ],
    Emotion.LOVE: [
        "aime", "adore", "amour", "amoureux", "amoureuse", "tendresse",
        "affection", "câlin", "bisou", "coeur", "chéri", "chérie",
        "adorable", "mignon", "mignonne", "attaché", "attachée",
    ],
    Emotion.CURIOSITY: [
        "curieux", "curieuse", "intéressant", "intéressante", "intrigué",
        "intriguée", "questionne", "demande", "pourquoi", "comment",
        "quoi", "explore", "découvre", "apprend",
    ],
    Emotion.EXCITEMENT: [
        "excité", "excitée", "enthousiaste", "impatient", "impatiente",
        "hâte", "vivement", "pressé", "pressée", "trop bien",
        "j'ai trop hâte", "génialissime",
    ],
    Emotion.FRUSTRATION: [
        "frustré", "frustrée", "déçu", "déçue", "impossible",
        "compliqué", "difficile", "bloqué", "bloquée", "coincé",
        "coincée", "galère", "problème", "souci",
    ],
    Emotion.GRATITUDE: [
        "merci", "reconnaissant", "reconnaissante", "gratitude",
        "remercie", "apprécié", "appréciée", "gentil", "gentille",
        "aimable", "sympa", "adorable",
    ],
}

# Emoji patterns
EMOTION_EMOJIS: Dict[Emotion, List[str]] = {
    Emotion.JOY: ["😊", "😄", "😃", "🙂", "😁", "🥳", "😀", "☺️", "😸"],
    Emotion.SADNESS: ["😢", "😭", "😿", "😞", "😔", "🥺", "😥", "😓"],
    Emotion.ANGER: ["😠", "😡", "🤬", "💢", "😤"],
    Emotion.FEAR: ["😨", "😰", "😱", "🫣", "😧"],
    Emotion.SURPRISE: ["😮", "😲", "😯", "🤯", "😳", "🙀"],
    Emotion.LOVE: ["❤️", "💕", "💗", "💖", "🥰", "😍", "💘", "💝", "♥️"],
    Emotion.CURIOSITY: ["🤔", "🧐", "❓", "🤨"],
    Emotion.EXCITEMENT: ["🤩", "🎉", "🎊", "⚡", "🔥", "✨"],
    Emotion.FRUSTRATION: ["😩", "😫", "🙄", "😒"],
    Emotion.GRATITUDE: ["🙏", "💐", "🤗", "👏"],
}

# Punctuation patterns
INTENSITY_PATTERNS: Dict[str, float] = {
    r"!{3,}": 0.3,    # Multiple exclamation marks
    r"!{2}": 0.2,     # Double exclamation
    r"!": 0.1,        # Single exclamation
    r"\?{2,}": 0.15,  # Multiple question marks
    r"\.{3,}": 0.1,   # Ellipsis
    r"[A-Z]{3,}": 0.2,  # All caps words
}


class EmotionAnalyzer:
    """Analyze emotions in text.

    Usage:
        analyzer = EmotionAnalyzer()
        result = analyzer.analyze("Je suis trop content !")
        print(result.primary_emotion)  # joy
    """

    def __init__(self):
        # Pre-compile keyword patterns for efficiency
        self._keyword_patterns: Dict[Emotion, re.Pattern] = {}
        for emotion, keywords in EMOTION_KEYWORDS.items():
            pattern = r"\b(" + "|".join(re.escape(k) for k in keywords) + r")\b"
            self._keyword_patterns[emotion] = re.compile(pattern, re.IGNORECASE)

        # Compile intensity patterns
        self._intensity_patterns = [
            (re.compile(pattern), boost)
            for pattern, boost in INTENSITY_PATTERNS.items()
        ]

    def analyze(self, text: str) -> EmotionResult:
        """Analyze text for emotional content.

        Args:
            text: Text to analyze

        Returns:
            EmotionResult with detected emotions
        """
        if not text or not text.strip():
            return EmotionResult(
                primary_emotion=Emotion.NEUTRAL,
                primary_intensity=0.0,
                confidence=1.0
            )

        scores: Dict[Emotion, float] = {e: 0.0 for e in Emotion}
        text_lower = text.lower()

        # Analyze keywords
        for emotion, pattern in self._keyword_patterns.items():
            matches = pattern.findall(text_lower)
            if matches:
                scores[emotion] += len(matches) * 0.3

        # Analyze emojis
        for emotion, emojis in EMOTION_EMOJIS.items():
            for emoji in emojis:
                count = text.count(emoji)
                if count > 0:
                    scores[emotion] += count * 0.4

        # Calculate intensity modifiers
        intensity_boost = 0.0
        for pattern, boost in self._intensity_patterns:
            if pattern.search(text):
                intensity_boost += boost

        # Apply intensity boost to all non-zero scores
        for emotion in scores:
            if scores[emotion] > 0:
                scores[emotion] += intensity_boost

        # Normalize scores
        max_score = max(scores.values()) if scores else 0
        if max_score > 0:
            for emotion in scores:
                scores[emotion] = min(1.0, scores[emotion] / max(1.0, max_score))

        # Get primary and secondary emotions
        sorted_emotions = sorted(
            [(e, s) for e, s in scores.items() if s > 0],
            key=lambda x: x[1],
            reverse=True
        )

        if not sorted_emotions or sorted_emotions[0][1] < 0.1:
            return EmotionResult(
                primary_emotion=Emotion.NEUTRAL,
                primary_intensity=0.5,
                all_scores={e.value: s for e, s in scores.items()},
                confidence=0.8
            )

        primary = sorted_emotions[0]
        secondary = sorted_emotions[1] if len(sorted_emotions) > 1 else None

        # Calculate confidence based on score difference
        if secondary and secondary[1] > 0:
            confidence = min(1.0, 0.5 + (primary[1] - secondary[1]) * 0.5)
        else:
            confidence = min(1.0, 0.5 + primary[1] * 0.5)

        return EmotionResult(
            primary_emotion=primary[0],
            primary_intensity=primary[1],
            secondary_emotion=secondary[0] if secondary else None,
            secondary_intensity=secondary[1] if secondary else 0.0,
            all_scores={e.value: s for e, s in scores.items()},
            confidence=confidence
        )

    def get_emotion_for_response(self, user_emotion: EmotionResult) -> Tuple[str, float]:
        """Suggest EVA's emotion based on user's emotion.

        Args:
            user_emotion: Detected user emotion

        Returns:
            Tuple of (emotion_name, intensity) for EVA
        """
        # Empathic response mapping
        response_map = {
            Emotion.JOY: (Emotion.JOY, 0.8),
            Emotion.SADNESS: (Emotion.LOVE, 0.7),  # Tenderness for sadness
            Emotion.ANGER: (Emotion.NEUTRAL, 0.4),  # Calm response
            Emotion.FEAR: (Emotion.LOVE, 0.6),  # Comfort
            Emotion.SURPRISE: (Emotion.CURIOSITY, 0.6),
            Emotion.LOVE: (Emotion.LOVE, 0.9),
            Emotion.CURIOSITY: (Emotion.EXCITEMENT, 0.6),
            Emotion.EXCITEMENT: (Emotion.EXCITEMENT, 0.7),
            Emotion.FRUSTRATION: (Emotion.LOVE, 0.5),  # Understanding
            Emotion.GRATITUDE: (Emotion.JOY, 0.7),
            Emotion.NEUTRAL: (Emotion.NEUTRAL, 0.5),
        }

        emotion, base_intensity = response_map.get(
            user_emotion.primary_emotion,
            (Emotion.NEUTRAL, 0.5)
        )

        # Adjust intensity based on user's intensity
        adjusted_intensity = base_intensity * (0.5 + user_emotion.primary_intensity * 0.5)

        return emotion.value, min(1.0, adjusted_intensity)


# Singleton instance
emotion_analyzer = EmotionAnalyzer()
