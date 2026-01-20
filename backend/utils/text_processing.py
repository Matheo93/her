"""
Text processing utilities for EVA-VOICE.

Provides humanization layers for making responses more natural:
- Contractions (je suis -> j'suis)
- Robotic phrase removal
- Emotional expressions
- Breathing sounds
- Laughter
"""

import random
import re
from typing import Tuple


# Pre-compile all regex patterns at module load (saves ~0.5ms per call)
_CONTRACTION_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\bje suis\b", re.IGNORECASE), "j'suis"),
    (re.compile(r"\btu es\b", re.IGNORECASE), "t'es"),
    (re.compile(r"\bil y a\b", re.IGNORECASE), "y'a"),
    (re.compile(r"\bje ne sais pas\b", re.IGNORECASE), "j'sais pas"),
    (re.compile(r"\btu as\b", re.IGNORECASE), "t'as"),
    (re.compile(r"\bce que\b", re.IGNORECASE), "c'que"),
    (re.compile(r"\bparce que\b", re.IGNORECASE), "pasque"),
]

_ROBOTIC_PATTERNS: list[re.Pattern] = [
    re.compile(r"en tant qu'(intelligence artificielle|ia|assistant)", re.IGNORECASE),
    re.compile(r"je suis (là|ici) pour (t'aider|vous aider|t'assister)", re.IGNORECASE),
    re.compile(r"n'hésite pas à", re.IGNORECASE),
    re.compile(r"je serai (ravi|heureux|content) de", re.IGNORECASE),
    re.compile(r"puis-je faire quelque chose", re.IGNORECASE),
    re.compile(r"comment puis-je", re.IGNORECASE),
    re.compile(r"est-ce que je peux faire", re.IGNORECASE),
]

_WHITESPACE_PATTERN = re.compile(r'\s+')

# Pre-defined breathing/laughter expressions - ENRICHI avec humour
_BREATHS: Tuple[str, ...] = ("hmm... ", "mmh... ", "oh... ", "ah... ", "haha ", "hihi ", "oh la la ", "pfff ", "")
_BREATH_STARTS: Tuple[str, ...] = (
    "Hmm", "Oh", "Ah", "Mmh", "hmm", "oh", "ah", "mmh",
    "Haha", "Hihi", "haha", "hihi", "Pfff", "pfff", "Mdr", "mdr"
)

# Expressions de rire pour ajouter de l'humour
_LAUGHTER_EXPRESSIONS: Tuple[str, ...] = ("haha ", "hihi ", "mdr ", "")
_SURPRISE_EXPRESSIONS: Tuple[str, ...] = ("Oh! ", "Waouh! ", "Attends... ", "Noooon! ", "")
_EMPATHY_EXPRESSIONS: Tuple[str, ...] = ("Oh... ", "Pfff... ", "Mince... ", "")


def humanize_response(text: str) -> str:
    """Applique des transformations pour rendre le texte plus naturel/humain.

    OPTIMIZED: Uses pre-compiled regex patterns.
    ENRICHI: Ajoute des elements emotionnels et humoristiques.
    """
    result = text

    # Apply natural contractions
    for pattern, replacement in _CONTRACTION_PATTERNS:
        result = pattern.sub(replacement, result)

    # Remove robotic phrases
    for pattern in _ROBOTIC_PATTERNS:
        result = pattern.sub("", result)

    # Clean double spaces (single pass)
    result = _WHITESPACE_PATTERN.sub(' ', result).strip()

    return result


def add_emotional_expression(text: str, detected_emotion: str = "neutral") -> str:
    """Ajoute une expression emotionnelle au debut de la reponse selon l'emotion detectee."""
    if len(text) < 15:
        return text

    # Probabilite d'ajouter une expression
    if random.random() > 0.35:
        return text

    # Expressions selon l'emotion
    expressions_by_emotion = {
        "joy": ["Haha! ", "Oh trop bien! ", "Hihi ", "J'adore! "],
        "humor": ["Mdr! ", "Haha! ", "Hihi! ", "Pfff! "],
        "surprise": ["Oh! ", "Waouh! ", "Attends... ", "Serieux?! "],
        "sadness": ["Oh... ", "Mince... ", "Pfff... ", ""],
        "excitement": ["Oh la la! ", "Waouh! ", "Trop bien! ", ""],
        "love": ["Aww! ", "Oh... ", "C'est mignon! ", ""],
        "neutral": ["", "", "", ""],  # Moins d'expressions pour neutral
    }

    expressions = expressions_by_emotion.get(detected_emotion, [""])
    expr = random.choice(expressions)

    if expr and not text.startswith(_BREATH_STARTS):
        return expr + text[0].lower() + text[1:]

    return text


def add_breathing(text: str, probability: float = 0.4) -> str:
    """Ajoute occasionnellement des respirations/pauses/rires naturels."""
    if random.random() > probability or len(text) < 30:
        return text

    if random.random() < 0.5 and not text.startswith(_BREATH_STARTS):
        breath = random.choice(_BREATHS)
        if breath:
            return breath + text[0].lower() + text[1:]

    return text


def add_laughter(text: str, probability: float = 0.25) -> str:
    """Ajoute occasionnellement des expressions de rire pour rendre Eva plus fun."""
    if random.random() > probability or len(text) < 20:
        return text

    # Ne pas doubler les rires
    if any(laugh in text.lower() for laugh in ["haha", "hihi", "mdr", "lol"]):
        return text

    laugh = random.choice(_LAUGHTER_EXPRESSIONS)
    if laugh:
        return laugh + text[0].lower() + text[1:]
    return text


def add_natural_pauses(text: str) -> str:
    """Add pause markers for more natural speech rhythm."""
    # Add slight pauses after certain punctuation
    text = text.replace(". ", "... ")
    text = text.replace("? ", "?... ")
    text = text.replace("! ", "!... ")
    return text


def detect_emotion_simple(text: str) -> str:
    """Simple emotion detection from text content."""
    text_lower = text.lower()

    # Joy indicators
    if any(w in text_lower for w in ["haha", "hihi", "mdr", "lol", "genial", "super", "trop bien", "j'adore"]):
        return "joy"

    # Sadness indicators
    if any(w in text_lower for w in ["triste", "pas bien", "mal", "dur", "difficile", "pfff"]):
        return "sadness"

    # Surprise indicators
    if any(w in text_lower for w in ["quoi", "serieux", "vraiment", "noooon", "waouh", "oh la la"]):
        return "surprise"

    # Love/affection indicators
    if any(w in text_lower for w in ["t'aime", "adore", "mignon", "adorable", "aww"]):
        return "love"

    # Excitement indicators
    if any(w in text_lower for w in ["hate", "excite", "trop bien", "genial", "!"]):
        return "excitement"

    return "neutral"


def get_mood_from_emotion(emotion: str) -> str:
    """Map detected emotion to Eva mood."""
    emotion_to_mood = {
        "joy": "playful",
        "sadness": "calm",
        "surprise": "excited",
        "love": "intimate",
        "excitement": "excited",
        "humor": "funny",
        "neutral": "default",
    }
    return emotion_to_mood.get(emotion, "default")
