"""
Eva Expression System - Breathing, Emotions & Voice Modulation

Rend Eva vivante avec:
- Sons de respiration réels (audio)
- Détection d'émotions dans le texte
- Modulation de la voix selon l'émotion
- Animations suggérées pour l'avatar
"""

import numpy as np
import re
import random
from typing import Optional, Tuple, Dict, List
from dataclasses import dataclass
import io

# Import TTS for generating breathing sounds
try:
    from ultra_fast_tts import ultra_fast_tts, init_ultra_fast_tts
except ImportError:
    ultra_fast_tts = None


@dataclass
class Emotion:
    """Représente une émotion détectée."""
    name: str
    intensity: float  # 0.0 - 1.0
    voice_speed: float  # 0.8 - 1.3
    voice_pitch: int  # -5 to +5 semitones
    animation: str  # Animation suggérée pour l'avatar


# Émotions supportées avec leurs paramètres vocaux
EMOTIONS = {
    "joy": Emotion("joy", 0.8, 1.1, 2, "smile_big"),
    "excitement": Emotion("excitement", 0.9, 1.2, 3, "eyes_wide"),
    "tenderness": Emotion("tenderness", 0.7, 0.95, 1, "soft_smile"),
    "sadness": Emotion("sadness", 0.6, 0.85, -2, "sad_eyes"),
    "surprise": Emotion("surprise", 0.8, 1.15, 4, "eyebrows_up"),
    "curiosity": Emotion("curiosity", 0.6, 1.05, 1, "head_tilt"),
    "playful": Emotion("playful", 0.7, 1.1, 2, "wink"),
    "empathy": Emotion("empathy", 0.6, 0.9, 0, "nod_slow"),
    "thoughtful": Emotion("thoughtful", 0.5, 0.9, -1, "look_up"),
    "neutral": Emotion("neutral", 0.3, 1.0, 0, "idle"),
}

# Patterns pour détecter les émotions dans le texte
EMOTION_PATTERNS = {
    "joy": [
        r"\bhaha\b", r"\bhihi\b", r"\bmdr\b", r"j'adore", r"trop bien",
        r"génial", r"super", r"cool", r"😊", r"😄", r"❤️"
    ],
    "excitement": [
        r"!!+", r"waouh", r"oh la la", r"incroyable", r"dingue",
        r"trop hâte", r"j'ai hâte", r"QUOI"
    ],
    "tenderness": [
        r"mignon", r"adorable", r"tendresse", r"doux", r"câlin",
        r"prends soin", r"je t'aime"
    ],
    "sadness": [
        r"triste", r"dommage", r"snif", r"désolée", r"malheureusement",
        r"😢", r"😔", r"pfff"
    ],
    "surprise": [
        r"quoi\?!", r"sérieux\?", r"noooon", r"vraiment\?", r"attends",
        r"😮", r"😲"
    ],
    "curiosity": [
        r"raconte", r"dis-moi", r"comment", r"pourquoi", r"c'est quoi",
        r"🤔", r"hmm"
    ],
    "playful": [
        r"taquine", r"coquin", r"😏", r"😜", r"hihi", r"voyons voir"
    ],
    "empathy": [
        r"je comprends", r"c'est dur", r"courage", r"là pour toi",
        r"ça va aller"
    ],
    "thoughtful": [
        r"je pense", r"peut-être", r"hmm", r"intéressant", r"réfléchis"
    ],
}


class EvaExpressionSystem:
    """Système d'expression pour rendre Eva vivante."""

    def __init__(self):
        self._breathing_sounds: Dict[str, bytes] = {}
        self._emotion_sounds: Dict[str, bytes] = {}
        self._initialized = False

    def init(self) -> bool:
        """Initialise les sons de respiration et d'émotion."""
        if self._initialized:
            return True

        if ultra_fast_tts is None:
            print("⚠️  Ultra-fast TTS not available for expression sounds")
            return False

        try:
            init_ultra_fast_tts()

            # Générer les sons de respiration
            breathing_phrases = {
                "inhale": "hmm",
                "exhale_soft": "ah",
                "exhale_thinking": "mmh",
                "sigh": "pfff",
                "breath_pause": "...",
            }

            for name, phrase in breathing_phrases.items():
                audio = ultra_fast_tts(phrase, speed=0.8)
                if audio:
                    self._breathing_sounds[name] = audio

            # Générer les sons d'émotion/réaction
            emotion_sounds = {
                "laugh_soft": "hihi",
                "laugh": "haha",
                "surprise": "oh",
                "interest": "ah",
                "thinking": "hmm",
                "agreement": "mmh mmh",
                "playful": "héhé",
            }

            for name, phrase in emotion_sounds.items():
                audio = ultra_fast_tts(phrase, speed=1.0)
                if audio:
                    self._emotion_sounds[name] = audio

            self._initialized = True
            print(f"✅ Eva Expression: {len(self._breathing_sounds)} breathing + {len(self._emotion_sounds)} emotion sounds")
            return True

        except Exception as e:
            print(f"❌ Expression system init failed: {e}")
            return False

    def detect_emotion(self, text: str) -> Emotion:
        """Détecte l'émotion dominante dans le texte."""
        text_lower = text.lower()
        scores = {}

        for emotion_name, patterns in EMOTION_PATTERNS.items():
            score = 0
            for pattern in patterns:
                matches = len(re.findall(pattern, text_lower, re.IGNORECASE))
                score += matches
            if score > 0:
                scores[emotion_name] = score

        if not scores:
            return EMOTIONS["neutral"]

        # Retourner l'émotion avec le score le plus élevé
        dominant = max(scores, key=scores.get)
        emotion = EMOTIONS[dominant]

        # Ajuster l'intensité selon le nombre de matches
        intensity = min(1.0, scores[dominant] / 3)
        return Emotion(
            emotion.name,
            intensity,
            emotion.voice_speed,
            emotion.voice_pitch,
            emotion.animation
        )

    def get_breathing_sound(self, context: str = "random") -> Optional[bytes]:
        """Retourne un son de respiration approprié au contexte."""
        if not self._breathing_sounds:
            return None

        if context == "before_speech":
            choices = ["inhale", "exhale_thinking"]
        elif context == "after_speech":
            choices = ["exhale_soft", "sigh"]
        elif context == "thinking":
            choices = ["exhale_thinking", "inhale"]
        else:
            choices = list(self._breathing_sounds.keys())

        available = [c for c in choices if c in self._breathing_sounds]
        if not available:
            return None

        return self._breathing_sounds[random.choice(available)]

    def get_emotion_sound(self, emotion: str) -> Optional[bytes]:
        """Retourne un son d'émotion approprié."""
        if not self._emotion_sounds:
            return None

        mapping = {
            "joy": ["laugh_soft", "laugh"],
            "excitement": ["surprise", "interest"],
            "surprise": ["surprise", "interest"],
            "playful": ["playful", "laugh_soft"],
            "thoughtful": ["thinking"],
            "curiosity": ["interest", "thinking"],
        }

        choices = mapping.get(emotion, ["thinking"])
        available = [c for c in choices if c in self._emotion_sounds]
        if not available:
            return None

        return self._emotion_sounds[random.choice(available)]

    def get_voice_params(self, emotion: Emotion) -> Dict[str, str]:
        """Retourne les paramètres de voix pour Edge-TTS selon l'émotion."""
        # Convertir les paramètres en format Edge-TTS
        speed_percent = int((emotion.voice_speed - 1.0) * 100)
        speed_str = f"+{speed_percent}%" if speed_percent >= 0 else f"{speed_percent}%"

        pitch_str = f"+{emotion.voice_pitch}Hz" if emotion.voice_pitch >= 0 else f"{emotion.voice_pitch}Hz"

        return {
            "rate": speed_str,
            "pitch": pitch_str,
        }

    def get_animation_suggestion(self, text: str) -> List[Dict]:
        """Suggère des animations basées sur le texte."""
        emotion = self.detect_emotion(text)
        animations = []

        # Animation de base selon l'émotion
        animations.append({
            "type": emotion.animation,
            "intensity": emotion.intensity,
            "duration": 0.5
        })

        # Animations additionnelles selon le contenu
        if "?" in text:
            animations.append({"type": "head_tilt", "intensity": 0.5, "duration": 0.3})

        if "!" in text:
            animations.append({"type": "eyebrows_up", "intensity": 0.6, "duration": 0.2})

        if any(w in text.lower() for w in ["non", "pas", "jamais"]):
            animations.append({"type": "head_shake", "intensity": 0.4, "duration": 0.4})

        if any(w in text.lower() for w in ["oui", "ouais", "bien sûr"]):
            animations.append({"type": "nod", "intensity": 0.5, "duration": 0.3})

        return animations

    def process_for_expression(self, text: str) -> Dict:
        """Traite le texte et retourne toutes les infos d'expression."""
        emotion = self.detect_emotion(text)

        return {
            "emotion": emotion.name,
            "intensity": emotion.intensity,
            "voice_params": self.get_voice_params(emotion),
            "animations": self.get_animation_suggestion(text),
            "breathing_before": self.get_breathing_sound("before_speech"),
            "breathing_after": self.get_breathing_sound("after_speech"),
        }


# Instance globale
eva_expression = EvaExpressionSystem()


# Fonctions utilitaires
def init_expression_system() -> bool:
    """Initialise le système d'expression."""
    return eva_expression.init()


def detect_emotion(text: str) -> Emotion:
    """Détecte l'émotion dans le texte."""
    return eva_expression.detect_emotion(text)


def get_expression_data(text: str) -> Dict:
    """Retourne toutes les données d'expression pour un texte."""
    return eva_expression.process_for_expression(text)


if __name__ == "__main__":
    # Test
    init_expression_system()

    test_texts = [
        "Haha, trop bien ! J'adore ça !",
        "Oh non, c'est triste...",
        "Attends... QUOI ?! Sérieux ?",
        "Hmm, c'est intéressant ce que tu dis...",
        "Raconte-moi tout ! Je veux savoir !",
    ]

    for text in test_texts:
        emotion = detect_emotion(text)
        print(f"'{text[:40]}...'")
        print(f"  → Emotion: {emotion.name} ({emotion.intensity:.1f})")
        print(f"  → Voice: speed={emotion.voice_speed}, pitch={emotion.voice_pitch}")
        print(f"  → Animation: {emotion.animation}")
        print()
