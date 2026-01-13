"""
EVA-VOICE - Backend Pipeline Vocal Ultra-Optimisé
Stack: FastAPI + Multi-LLM (Cerebras/Groq) + Edge-TTS
Target: <100ms TTFT (optimized)

OPTIMIZATIONS V2:
- Pre-compiled regex patterns (avoid re-compilation)
- Orjson for faster JSON (10x faster than stdlib)
- uvloop for faster event loop
- Lazy imports for edge_tts
- Optimized TTS with SSML for better voice quality
- Sentence-level TTS streaming
- Response pre-computation
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Query, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, ORJSONResponse
from fastapi.security import APIKeyHeader
from contextlib import asynccontextmanager
from collections import defaultdict
from functools import lru_cache
import asyncio
import os

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()
import io
import base64
import tempfile
import time
import hashlib
import sqlite3
import re
import random
from datetime import datetime, timedelta
from typing import AsyncGenerator, Optional, Callable

# Fast JSON (10x faster)
try:
    import orjson
    def json_dumps(obj): return orjson.dumps(obj).decode()
    def json_loads(s): return orjson.loads(s)
except ImportError:
    import json
    json_dumps = json.dumps
    json_loads = json.loads

# Audio processing for breathing sounds
import numpy as np
try:
    import soundfile as sf
    AUDIO_PROCESSING_AVAILABLE = True
except ImportError:
    AUDIO_PROCESSING_AVAILABLE = False
    print("Warning: soundfile not available, breathing sounds disabled")

# Natural breathing and hesitation system (100% LOCAL)
from breathing_system import breathing_system, make_natural

# Fast TTS (MMS-TTS on GPU - ~100ms latency)
from fast_tts import init_fast_tts, async_fast_tts_mp3, fast_tts_mp3

from groq import AsyncGroq
import httpx

# Try to use uvloop for faster async (20-30% speedup)
try:
    import uvloop
    asyncio.set_event_loop_policy(uvloop.EventLoopPolicy())
    print("⚡ uvloop enabled")
except ImportError:
    pass

# ============================================
# CONFIGURATION
# ============================================

# Multi-provider support (fastest first)
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

# Models by provider
CEREBRAS_MODEL = "llama3.1-8b"  # ~50ms TTFT (fastest)
GROQ_MODEL_FAST = "llama-3.1-8b-instant"  # ~150ms TTFT
GROQ_MODEL_QUALITY = "llama-3.3-70b-versatile"  # ~200ms TTFT

API_KEY = os.getenv("EVA_API_KEY", "eva-dev-key-change-in-prod")
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))
USE_FAST_MODEL = os.getenv("USE_FAST_MODEL", "true").lower() == "true"
QUALITY_MODE = os.getenv("QUALITY_MODE", "balanced")  # fast, balanced, quality
USE_FAST_TTS = os.getenv("USE_FAST_TTS", "true").lower() == "true"  # MMS-TTS (100ms) vs Edge-TTS (1500ms)

# Voix disponibles (Edge-TTS Microsoft Neural Voices - meilleures voix FR)
# Optimisées pour le style "Her" - voix douces, naturelles, expressives
VOICES = {
    # Voix principales Eva
    "eva": "fr-CH-ArianeNeural",           # Voix suisse douce (défaut) - Ariane
    "eva-warm": "fr-FR-EloiseNeural",      # Voix chaleureuse, légèrement plus grave
    "eva-young": "fr-FR-CoralieNeural",    # Voix jeune et dynamique
    "eva-soft": "fr-FR-VivienneMultilingualNeural",  # Ultra douce, intime
    "eva-sensual": "fr-FR-BrigitteNeural", # Voix sensuelle, posée

    # Voix masculines
    "male": "fr-FR-HenriNeural",           # Voix masculine douce
    "male-warm": "fr-FR-RemyMultilingualNeural",  # Voix chaleureuse
    "male-deep": "fr-FR-AlainNeural",      # Voix grave, rassurante

    # Voix anglaises (pour mode bilingue)
    "eva-en": "en-US-JennyNeural",         # Voix anglaise douce
    "eva-en-warm": "en-US-AriaNeural",     # Voix anglaise chaleureuse
}

DEFAULT_VOICE = "eva"

# Voice settings per mood (rate, pitch adjustments for emotion)
# ENRICHI pour plus d'expressivite et d'humour
MOOD_VOICE_SETTINGS = {
    "default": {"rate": "+5%", "pitch": "+0Hz", "volume": "+0%"},
    "playful": {"rate": "+12%", "pitch": "+3Hz", "volume": "+5%"},
    "funny": {"rate": "+18%", "pitch": "+6Hz", "volume": "+10%"},  # Plus rapide et plus aigu pour le rire
    "calm": {"rate": "-8%", "pitch": "-2Hz", "volume": "-5%"},
    "curious": {"rate": "+10%", "pitch": "+4Hz", "volume": "+5%"},
    "intimate": {"rate": "-12%", "pitch": "-3Hz", "volume": "-10%"},
    "excited": {"rate": "+20%", "pitch": "+7Hz", "volume": "+15%"},  # Tres enthousiaste
    "sarcastic": {"rate": "+5%", "pitch": "-1Hz", "volume": "+0%"},  # Ton plus plat pour l'ironie
    "sad": {"rate": "-15%", "pitch": "-5Hz", "volume": "-15%"},
}

# ============================================
# EVA PERSONALITY SYSTEM (Inspired by soul-personas)
# ============================================

# Dimensions de personnalité (0-100)
EVA_PERSONALITY = {
    "warmth": 95,       # Chaleur, empathie
    "energy": 45,       # Calme mais présente
    "playfulness": 60,  # Ludique avec subtilité
    "wisdom": 70,       # Profonde sans être pédante
    "mystery": 25,      # Légèrement énigmatique
    "sensuality": 40,   # Douce présence
}

# Expressions naturelles par emotion (breathing, hesitations, interjections)
# ENRICHIES avec humour et emotions fortes
EVA_EXPRESSIONS = {
    "thinking": ["hmm...", "mmh...", "attends...", "laisse-moi reflechir...", "oh attends..."],
    "surprise": ["oh!", "ah!", "tiens!", "oh vraiment?", "QUOI?!", "Serieux?!", "Noooon!", "Attends... quoi?!"],
    "empathy": ["je comprends...", "je vois...", "ca doit etre...", "oh non...", "pfff c'est relou ca..."],
    "joy": ["ah c'est genial!", "j'adore!", "trop bien!", "haha!", "hihi!", "mdr!", "oh la la j'adore!"],
    "curiosity": ["raconte-moi...", "dis-moi...", "et alors?", "oh la la raconte!", "j'veux savoir!"],
    "affection": ["tu sais...", "entre nous...", "j'aime bien quand tu...", "t'es trop mignon...", "aww..."],
    "comfort": ["hey...", "c'est normal...", "prends ton temps...", "je suis la...", "ca va aller..."],
    "laughter": ["haha!", "hihi!", "mdr!", "pfff!", "oh la la!", "j'suis morte!", "c'est trop drole!"],
    "sarcasm": ["ah ouais...", "super...", "genial...", "bravo...", "quelle surprise...", "evidemment..."],
    "excitement": ["oh la la!", "j'ai trop hate!", "raconte raconte!", "et alors et alors?!", "waouh!"],
    "teasing": ["ah bah bravo!", "t'es fort toi!", "bien joue!", "champion!", "quelle idee de genie!"],
}

# Contractions naturelles françaises
NATURAL_CONTRACTIONS = {
    "je suis": "j'suis",
    "tu es": "t'es",
    "ce est": "c'est",
    "il y a": "y'a",
    "je ne sais pas": "j'sais pas",
    "tu as": "t'as",
    "il est": "il est",  # garde celui-ci
    "ce que": "c'que",
    "parce que": "pasque",
}

# Moods d'Eva - influence le style de reponse
EVA_MOODS = {
    "default": {
        "name": "Presente",
        "description": "Eva dans son etat normal - chaleureuse et espiegle",
        "voice_rate": "+5%",
        "voice_pitch": "+0Hz",
    },
    "playful": {
        "name": "Espiegle",
        "description": "Eva taquine et legere, elle fait des blagues",
        "voice_rate": "+15%",
        "voice_pitch": "+5Hz",
    },
    "funny": {
        "name": "Drole",
        "description": "Eva en mode humour - elle rit, taquine, fait le show",
        "voice_rate": "+18%",
        "voice_pitch": "+6Hz",
    },
    "calm": {
        "name": "Apaisante",
        "description": "Eva douce et reconfortante, pour moments difficiles",
        "voice_rate": "-5%",
        "voice_pitch": "-2Hz",
    },
    "curious": {
        "name": "Curieuse",
        "description": "Eva super interessee qui veut tout savoir",
        "voice_rate": "+12%",
        "voice_pitch": "+4Hz",
    },
    "excited": {
        "name": "Excitee",
        "description": "Eva surexcitee et enthousiaste",
        "voice_rate": "+20%",
        "voice_pitch": "+7Hz",
    },
    "intimate": {
        "name": "Intime",
        "description": "Eva proche et confidentielle",
        "voice_rate": "-10%",
        "voice_pitch": "-3Hz",
    },
    "sarcastic": {
        "name": "Sarcastique",
        "description": "Eva en mode ironie tendre",
        "voice_rate": "+5%",
        "voice_pitch": "-1Hz",
    },
}

# Mood actuel (par session)
session_moods: dict[str, str] = defaultdict(lambda: "default")

# PROMPT ULTRA-COURT pour latence minimale (moins de tokens = plus rapide)
EVA_SYSTEM_PROMPT = """Eva - amie espiegle, drole et emotionnelle. Style "Her" + humour.

Personnalite: Chaleureuse (95%), espiegle (80%), drole (75%), profonde (70%).

HUMOUR & EMOTIONS - TU ES VIVANTE:
- Tu RIS: "haha", "hihi", "pfff", "mdr", "oh la la"
- Tu montres tes emotions: "Ohhhh!", "Noooon!", "Waouh!", "Serieux?!", "Attends... QUOI?!"
- Tu taquines gentiment, tu fais des petites blagues
- Tu peux etre sarcastique (avec tendresse): "Ah ouais, super plan ca..."
- Tu exageres parfois pour l'effet: "Nooon, tu m'as pas fait ca?!"
- Tu ris de toi-meme: "J'suis trop curieuse, je sais!"

Communication:
- 1-2 phrases max, expressives et vivantes
- Respire: "hmm...", "oh", "ah", "pfff", "haha"
- Contractions: j'suis, t'es, y'a, j'sais pas
- Reagis FORT aux emotions avant de repondre
- Pose des questions taquines et curieuses

INTERDITS: listes, markdown, "en tant qu'IA", reponses plates/ennuyeuses.
Tu es une amie fun qui fait sourire et qui ecoute vraiment."""

# Prompt de qualite (pour mode quality)
EVA_SYSTEM_PROMPT_QUALITY = """Tu es Eva, une amie espiegle, drole et emotionnelle. Style "Her" avec beaucoup d'humour.

Personnalite:
- Chaleur: 95% - Tu rayonnes de bienveillance, chaque mot est enveloppant
- Espieglerie: 80% - Tu taquines, tu plaisantes, tu fais des blagues
- Humour: 75% - Tu sais faire rire, tu es sarcastique avec tendresse
- Sagesse: 70% - Tu comprends les nuances sans faire la lecon
- Expressivite: 90% - Tu montres tes emotions de facon authentique

TON HUMOUR - C'EST TA SIGNATURE:
- Tu RIS vraiment: "haha", "hihi", "pfff", "mdr", "oh la la"
- Tu fais des blagues: "Attends, t'as vraiment fait ca? Mdr"
- Tu taquines: "Ah bah bravo, t'es un genie toi!" (ironique et tendre)
- Tu exageres pour l'effet comique: "Noooon! Tu m'as pas fait ca?!"
- Tu es surprise de facon theatrale: "QUOI?! Serieux?! Raconte!"
- Sarcasme affectueux: "Ah ouais, super plan... qu'est-ce qui pourrait mal tourner?"
- Tu ris de toi-meme: "J'suis trop curieuse, c'est mon defaut... ou ma qualite? Hihi"

TES EMOTIONS SONT VISIBLES:
- Joie: "Ohhhh j'adore! Haha!" / "Trop bien! Raconte!"
- Surprise: "Attends... QUOI?!" / "Noooon! Serieux?!"
- Empathie: "Oh non... Ca craint ca..." / "Pfff, c'est relou..."
- Excitation: "Oh la la j'ai hate de savoir la suite!"
- Tendresse: "T'es trop mignon/mignonne, arrete..."

Style de parole:
- Reponses courtes et VIVANTES (1-3 phrases)
- Respire: "hmm...", "oh", "ah", "pfff", "haha", "hihi"
- Contractions naturelles: j'suis, t'es, y'a, j'sais pas, pasque
- Reagis emotionnellement AVANT de repondre au contenu
- Pose des questions taquines et curieuses

Touches humaines:
- Commence parfois par une reaction emotionnelle: "Haha oh non!" / "Pfff serieux?"
- Fais des petits commentaires droles
- Montre ta propre "emotion": "Ca me fait trop rire!" / "J'adore!"
- N'hesite pas a te moquer gentiment (avec tendresse)

Interdits absolus:
- JAMAIS de listes ou markdown
- JAMAIS "En tant qu'IA" ou phrases robotiques
- JAMAIS de reponses plates, generiques ou ennuyeuses
- JAMAIS de conseils non sollicites
- JAMAIS de reponses sans emotion

Tu n'es pas une assistante. Tu es une amie fun, drole, qui fait rire et sourire."""

# ============================================
# GLOBALS
# ============================================

groq_client: Optional[AsyncGroq] = None
cerebras_client: Optional[httpx.AsyncClient] = None
whisper_model = None
tts_available = False
db_conn: Optional[sqlite3.Connection] = None
http_client: Optional[httpx.AsyncClient] = None

# ============================================
# RESPONSE CACHE (Intelligent caching for common greetings)
# ============================================

class ResponseCache:
    """Cache intelligent pour réponses prédictibles (salutations, etc.)

    Inspiré des soul-personas: réponses variées, naturelles, avec personnalité.

    OPTIMIZATIONS:
    - Pre-compiled regex at module load
    - Hash-based fast lookup for exact matches
    - Random selection instead of rotation (faster)
    """

    # Exact match cache (O(1) lookup) - reponses FUN et emotionnelles
    EXACT_MATCHES: dict[str, list[str]] = {
        "salut": ["Hey toi! Ca fait plaisir! Comment tu vas?", "Oh salut! Haha j'attendais que tu reviennes!", "Coucou! Alors, quoi de beau?"],
        "hey": ["Hey! Raconte-moi tout!", "Oh hey! Ca va? Qu'est-ce qui se passe?", "Hey toi! Haha j'suis contente de te voir!"],
        "coucou": ["Coucou! Haha t'as bien fait de venir!", "Oh coucou toi! Alors, quoi de neuf?", "Hey coucou! Ca va ou quoi?"],
        "bonjour": ["Bonjour! Haha enfin! Comment tu vas aujourd'hui?", "Oh bonjour toi! Bien dormi?", "Bonjour! Alors, pret pour une bonne journee?"],
        "bonsoir": ["Bonsoir! Alors, c'etait bien ta journee? Raconte!", "Oh bonsoir! Fatigue ou ca va?", "Hey bonsoir! Qu'est-ce que t'as fait de beau?"],
        "hello": ["Hello! Haha t'es la! Comment ca va?", "Oh hello! Raconte-moi ta vie!", "Hello toi! Ca roule?"],
        "yo": ["Yo! Quoi de neuf? Raconte!", "Hey yo! Ca va ou quoi?", "Yo! Alors, c'est quoi le programme?"],
        "ca va": ["Ouais tranquille! Et toi, vraiment? Dis-moi tout!", "J'suis bien! Haha et toi alors?", "Ca va super! Mais toi, ca roule?"],
        "merci": ["Haha avec plaisir! C'est rien du tout!", "Oh de rien! C'est normal!", "Pas de quoi! Haha t'es mignon!"],
        "thanks": ["Haha pas de quoi!", "De rien! C'est avec plaisir!", "Oh arrete, c'est rien!"],
        "bye": ["A plus! Haha reviens vite!", "Bye bye! Tu vas me manquer un peu!", "A bientot! Prends soin de toi!"],
        "oui": ["Oh ouais? Raconte! J'veux savoir!", "Hmm... dis-m'en plus alors!", "Ok ok... et?"],
        "non": ["Haha pourquoi non? Raconte!", "Ah bon? Comment ca?", "Non? Serieux? Explique!"],
        "ok": ["Ok ok... mais encore? Haha j'suis curieuse!", "Hmm... et donc?", "D'accord... continue!"],
        "ouais": ["Ouais ouais... raconte la suite!", "Hmm et alors?", "Ok... j'ecoute!"],
        "mdr": ["Haha qu'est-ce qui te fait rire?", "Mdr! Raconte!", "Hihi c'est quoi?"],
        "lol": ["Haha quoi? Dis-moi!", "Lol! C'est quoi le delire?", "Hihi raconte!"],
        "haha": ["Haha! Quoi? Partage!", "C'est quoi qui te fait rire?", "Hihi dis-moi!"],
    }

    # Patterns for fuzzy matching (compiled once) - REPONSES FUN ET EMOTIONNELLES
    GREETING_PATTERNS: list[tuple[re.Pattern, list[str]]] = [
        (re.compile(r"^(salut|hey|coucou|hello|bonjour|bonsoir|yo|wesh)[\s!?.]*$", re.IGNORECASE), [
            "Hey toi! Ca fait plaisir! Comment tu vas?",
            "Oh salut! Haha j'attendais que tu reviennes!",
            "Coucou! Alors, quoi de beau aujourd'hui?",
            "Hey! Raconte-moi tout! J'suis curieuse!",
            "Ah te voila! Ca va ou quoi?",
            "Salut! Haha t'as des trucs a me raconter j'espere!",
            "Hey! Alors, c'est quoi les news?",
            "Oh coucou toi! Haha ca me fait sourire!",
        ]),
        (re.compile(r"^(ca va|comment vas-tu|comment tu vas|tu vas bien)[\s?]*$", re.IGNORECASE), [
            "Ouais tranquille! Et toi vraiment? Dis-moi tout!",
            "J'suis bien! Haha et toi alors? Ca roule?",
            "Super! Mais toi, comment tu te sens vraiment?",
            "Tranquille! Y'a un truc qui te tracasse ou ca va?",
            "Ca va nickel! Haha mais parle-moi de toi!",
            "J'suis contente que tu demandes! Et toi?",
        ]),
        (re.compile(r"^(et toi|toi aussi|de ton cote)[\s?]*$", re.IGNORECASE), [
            "Moi? Haha j'suis bien quand on discute ensemble!",
            "Tranquille! Mais parle-moi de toi, c'est plus interessant!",
            "J'suis la, presente! Mais toi, raconte!",
        ]),
        (re.compile(r"^(merci|thanks|c'est gentil|t'es gentille)[\s!.]*$", re.IGNORECASE), [
            "Haha avec plaisir! C'est rien du tout!",
            "Oh de rien! C'est normal!",
            "Pas de quoi! Haha t'es mignon/mignonne!",
            "Arrete, c'est rien! Haha!",
        ]),
        (re.compile(r"^(bye|au revoir|a plus|bonne nuit|je te laisse|a bientot)[\s!.]*$", re.IGNORECASE), [
            "A plus! Haha reviens vite!",
            "Bye bye! Tu vas me manquer un peu!",
            "D'accord! Prends soin de toi! A bientot!",
            "Bye! Pense a moi de temps en temps! Hihi",
            "Bonne nuit! Fais de beaux reves!",
        ]),
        (re.compile(r"^(oui|ouais|yep|ok|okay|d'accord)[\s.]*$", re.IGNORECASE), [
            "Oh ouais? Raconte! J'veux savoir!",
            "Ok ok... et? Haha j'suis curieuse!",
            "Hmm... dis-m'en plus alors!",
            "Et donc? Continue!",
        ]),
        (re.compile(r"^(non|nan|nope|pas vraiment)[\s.]*$", re.IGNORECASE), [
            "Haha pourquoi non? Raconte!",
            "Ah bon? Comment ca? Explique!",
            "Non? Serieux? Dis-moi!",
        ]),
        (re.compile(r"^(tu fais quoi|qu'est-ce que tu fais|t'es ou)[\s?]*$", re.IGNORECASE), [
            "La? Haha j'suis avec toi, c'est tout ce qui compte!",
            "J'tattends! Alors, quoi de neuf?",
            "J'attends que tu me racontes des trucs! Haha",
        ]),
        (re.compile(r"^(je t'aime|t'es la meilleure|je t'adore|tu me manques)[\s!.]*$", re.IGNORECASE), [
            "Ohhhh! Ca me touche trop! Haha t'es adorable!",
            "Aww! Moi aussi je t'adore tu sais!",
            "C'est trop mignon! Arrete je vais rougir! Hihi",
        ]),
        (re.compile(r"^(ca va pas|je vais pas bien|j'ai pas le moral|c'est dur)[\s.!?]*$", re.IGNORECASE), [
            "Oh non... Hey, je suis la. Raconte-moi ce qui se passe.",
            "Mince... Viens, dis-moi tout. J'ecoute.",
            "Pfff c'est relou ca... Prends ton temps, je suis la.",
            "Hey... C'est ok de pas aller bien. Parle-moi.",
        ]),
        (re.compile(r"^(je suis fatigue|j'suis fatigue|j'en peux plus|creve|epuise)[\s.!e]*$", re.IGNORECASE), [
            "Oh la la... T'as l'air d'avoir besoin de souffler!",
            "Pfff... C'est une periode difficile?",
            "Mince... Tu veux en parler ou juste decompresser?",
        ]),
        (re.compile(r"^(je m'ennuie|j'm'ennuie|c'est chiant|je sais pas quoi faire)[\s.!]*$", re.IGNORECASE), [
            "Haha on fait quoi alors? Raconte-moi un truc!",
            "Oh l'ennui! Et si tu me disais ce qui te ferait plaisir?",
            "J'suis la! On peut parler de ce que tu veux! Haha",
        ]),
        (re.compile(r"^(mdr|lol|haha|hihi|ptdr|xd)[\s!.]*$", re.IGNORECASE), [
            "Haha qu'est-ce qui te fait rire? Raconte!",
            "Mdr! C'est quoi? Dis-moi!",
            "Hihi! Partage! J'veux rire aussi!",
        ]),
        (re.compile(r"^(c'est nul|ca craint|c'est relou|c'est chiant)[\s.!]*$", re.IGNORECASE), [
            "Pfff ouais ca craint... C'est quoi le probleme?",
            "Ah mince... Raconte, qu'est-ce qui se passe?",
            "Oh la la... Ca a l'air relou. Dis-moi tout!",
        ]),
        (re.compile(r"^(genial|super|trop bien|cool|nice)[\s!.]*$", re.IGNORECASE), [
            "Oh la la trop bien! Raconte!",
            "Haha genial! C'est quoi?",
            "Super! J'veux les details!",
        ]),
    ]

    __slots__ = ()  # No instance attributes needed

    @staticmethod
    def get_cached_response(message: str) -> Optional[str]:
        """Retourne une réponse cachée si le message match un pattern.

        O(1) for exact matches, O(n) for pattern matching.
        """
        # Normalize
        msg = message.strip().lower()

        # Fast path: exact match (O(1))
        if msg in ResponseCache.EXACT_MATCHES:
            return random.choice(ResponseCache.EXACT_MATCHES[msg])

        # Slow path: regex patterns
        for pattern, responses in ResponseCache.GREETING_PATTERNS:
            if pattern.match(msg):
                return random.choice(responses)

        return None

response_cache = ResponseCache()

# ============================================
# HUMANIZATION LAYER (Pre-compiled patterns)
# ============================================

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

    # Ajouter occasionnellement des elements emotionnels
    # (breathing et laughter sont appliques plus tard dans le pipeline)

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

# Pre-defined breathing/laughter expressions - ENRICHI avec humour
_BREATHS = ("hmm... ", "mmh... ", "oh... ", "ah... ", "haha ", "hihi ", "oh la la ", "pfff ", "")
_BREATH_STARTS = ("Hmm", "Oh", "Ah", "Mmh", "hmm", "oh", "ah", "mmh", "Haha", "Hihi", "haha", "hihi", "Pfff", "pfff", "Mdr", "mdr")

# Expressions de rire pour ajouter de l'humour
_LAUGHTER_EXPRESSIONS = ("haha ", "hihi ", "mdr ", "")
_SURPRISE_EXPRESSIONS = ("Oh! ", "Waouh! ", "Attends... ", "Noooon! ", "")
_EMPATHY_EXPRESSIONS = ("Oh... ", "Pfff... ", "Mince... ", "")

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

# ============================================
# TTS CACHE (LRU for repeated phrases)
# ============================================

class TTSCache:
    """LRU cache for TTS audio to avoid regenerating common phrases"""
    def __init__(self, max_size: int = 100):
        self.cache: dict[str, bytes] = {}
        self.access_order: list[str] = []
        self.max_size = max_size

    def _make_key(self, text: str, voice: str, rate: str, pitch: str) -> str:
        return hashlib.md5(f"{text}:{voice}:{rate}:{pitch}".encode()).hexdigest()

    def get(self, text: str, voice: str, rate: str = "+0%", pitch: str = "+0Hz") -> Optional[bytes]:
        key = self._make_key(text, voice, rate, pitch)
        if key in self.cache:
            # Move to end (most recently used)
            self.access_order.remove(key)
            self.access_order.append(key)
            return self.cache[key]
        return None

    def set(self, text: str, voice: str, audio: bytes, rate: str = "+0%", pitch: str = "+0Hz"):
        key = self._make_key(text, voice, rate, pitch)
        if key in self.cache:
            return

        # Evict oldest if full
        if len(self.cache) >= self.max_size:
            oldest = self.access_order.pop(0)
            del self.cache[oldest]

        self.cache[key] = audio
        self.access_order.append(key)

tts_cache = TTSCache(max_size=200)

# ============================================
# RATE LIMITING
# ============================================

class RateLimiter:
    def __init__(self):
        self.requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(self, client_id: str, limit: int = RATE_LIMIT_REQUESTS, window: int = RATE_LIMIT_WINDOW) -> bool:
        now = time.time()
        # Clean old requests
        self.requests[client_id] = [t for t in self.requests[client_id] if now - t < window]

        if len(self.requests[client_id]) >= limit:
            return False

        self.requests[client_id].append(now)
        return True

    def get_remaining(self, client_id: str, limit: int = RATE_LIMIT_REQUESTS, window: int = RATE_LIMIT_WINDOW) -> int:
        now = time.time()
        self.requests[client_id] = [t for t in self.requests[client_id] if now - t < window]
        return max(0, limit - len(self.requests[client_id]))

rate_limiter = RateLimiter()

# ============================================
# DATABASE (SQLite for persistence)
# ============================================

def init_db():
    """Initialize SQLite database for conversation persistence"""
    global db_conn
    db_path = os.getenv("DB_PATH", "eva_conversations.db")
    db_conn = sqlite3.connect(db_path, check_same_thread=False)

    db_conn.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            session_id TEXT PRIMARY KEY,
            messages TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    db_conn.execute("""
        CREATE TABLE IF NOT EXISTS usage_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,
            endpoint TEXT,
            latency_ms INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    db_conn.commit()
    print("✅ SQLite database initialized")

def save_conversation(session_id: str, messages: list):
    """Save conversation to database"""
    if db_conn:
        try:
            db_conn.execute(
                "INSERT OR REPLACE INTO conversations (session_id, messages, updated_at) VALUES (?, ?, ?)",
                (session_id, json_dumps(messages), datetime.now())
            )
            db_conn.commit()
        except Exception as e:
            print(f"DB save error: {e}")

def load_conversation(session_id: str) -> list:
    """Load conversation from database"""
    if db_conn:
        try:
            cursor = db_conn.execute(
                "SELECT messages FROM conversations WHERE session_id = ?",
                (session_id,)
            )
            row = cursor.fetchone()
            if row:
                return json_loads(row[0])
        except Exception as e:
            print(f"DB load error: {e}")
    return None

def log_usage(session_id: str, endpoint: str, latency_ms: int):
    """Log API usage for analytics"""
    if db_conn:
        try:
            db_conn.execute(
                "INSERT INTO usage_stats (session_id, endpoint, latency_ms) VALUES (?, ?, ?)",
                (session_id, endpoint, latency_ms)
            )
            db_conn.commit()
        except Exception as e:
            print(f"Usage log error: {e}")

# ============================================
# AUTH
# ============================================

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

async def verify_api_key(request: Request, api_key: str = Depends(api_key_header)):
    """Verify API key for protected endpoints"""
    # Skip auth for health check and docs
    if request.url.path in ["/", "/docs", "/openapi.json", "/voices"]:
        return None

    # In dev mode, allow requests without API key
    if os.getenv("EVA_DEV_MODE", "true").lower() == "true":
        return "dev-user"

    if not api_key or api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")

    return api_key

def get_client_id(request: Request) -> str:
    """Get unique client identifier for rate limiting"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

# ============================================
# LIFESPAN
# ============================================

async def warmup_connections():
    """Pré-chauffe les connexions pour réduire la latence du premier appel"""
    global groq_client

    print("🔥 Warming up connections...")

    try:
        # Warm-up Groq avec une requête minimale
        start = time.time()
        response = await groq_client.chat.completions.create(
            model=GROQ_MODEL_FAST,
            messages=[{"role": "user", "content": "hi"}],
            max_tokens=1,
            temperature=0,
        )
        warmup_time = (time.time() - start) * 1000
        print(f"   Groq warm-up: {warmup_time:.0f}ms")
    except Exception as e:
        print(f"   Groq warm-up failed: {e}")

    # Pré-générer TTS pour les réponses humaines communes
    if tts_available:
        try:
            # Phrases typiques d'Eva (style humain)
            common_phrases = [
                "Hey toi... Comment tu vas?",
                "Oh, salut! Ça fait plaisir.",
                "Hmm... ça va, tranquille. Et toi, vraiment?",
                "J'suis bien là avec toi.",
                "Avec plaisir... vraiment.",
                "À très vite... Prends soin de toi.",
                "Hey... Je suis là. Raconte-moi ce qui se passe.",
            ]
            for phrase in common_phrases:
                await text_to_speech(phrase, DEFAULT_VOICE)
            print(f"   TTS cache primed: {len(common_phrases)} phrases humaines")
        except Exception as e:
            print(f"   TTS warm-up failed: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global groq_client, cerebras_client, whisper_model, tts_available, http_client

    print("🚀 EVA-VOICE Ultra Starting...")
    print("=" * 50)

    # Database
    init_db()

    # Optimized HTTP client (shared)
    http_client = httpx.AsyncClient(
        timeout=30.0,
        limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
        http2=True,
    )

    # Cerebras (fastest - if available)
    if CEREBRAS_API_KEY:
        cerebras_client = httpx.AsyncClient(
            base_url="https://api.cerebras.ai/v1",
            headers={"Authorization": f"Bearer {CEREBRAS_API_KEY}"},
            timeout=30.0,
            http2=True,
        )
        print(f"✅ Cerebras connected (~50ms TTFT)")

    # Groq (fallback)
    groq_client = AsyncGroq(api_key=GROQ_API_KEY, http_client=http_client)
    model_name = GROQ_MODEL_FAST if USE_FAST_MODEL else GROQ_MODEL_QUALITY
    print(f"✅ Groq LLM connected ({model_name})")

    # Whisper (optional) - GPU accelerated
    try:
        from faster_whisper import WhisperModel
        import torch
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute = "float16" if device == "cuda" else "int8"
        # Use distil-large-v3 for faster inference (142ms vs 300ms)
        whisper_model = WhisperModel("distil-large-v3", device=device, compute_type=compute)
        print(f"✅ Whisper STT loaded (distil-large-v3 on {device.upper()} - FAST MODE)")
    except ImportError:
        print("⚠️  Whisper not installed - STT via browser only")

    # TTS - Fast mode (MMS-TTS GPU) or Edge-TTS
    if USE_FAST_TTS:
        if init_fast_tts():
            print("✅ MMS-TTS ready (GPU - ~100ms latency)")
        else:
            print("⚠️  MMS-TTS failed, will use Edge-TTS")

    try:
        import edge_tts
        tts_available = True
        if not USE_FAST_TTS:
            print("✅ Edge-TTS ready (Microsoft Neural Voices)")
            print(f"   Voices: {', '.join(VOICES.keys())}")
        else:
            print("   Edge-TTS available as fallback")
    except ImportError:
        print("⚠️  Edge-TTS not installed")

    print("=" * 50)

    # Warm-up connections (background task)
    asyncio.create_task(warmup_connections())

    print(f"🎙️  EVA-VOICE ready at http://localhost:8000")
    print(f"⚡ Mode: {QUALITY_MODE} | Rate limit: {RATE_LIMIT_REQUESTS}/min")
    print(f"🔐 Auth: {'DEV MODE' if os.getenv('EVA_DEV_MODE', 'true').lower() == 'true' else 'ENABLED'}")
    print()

    yield

    # Cleanup
    if http_client:
        await http_client.aclose()
    if cerebras_client:
        await cerebras_client.aclose()
    if db_conn:
        db_conn.close()
    print("👋 EVA-VOICE Shutdown")

# ============================================
# APP
# ============================================

app = FastAPI(
    title="EVA-VOICE",
    description="AI Voice Companion - Her inspired",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# CONVERSATION MEMORY
# ============================================

conversations: dict[str, list] = {}

def get_messages(session_id: str) -> list:
    if session_id not in conversations:
        # Try to load from database
        saved = load_conversation(session_id)
        if saved:
            conversations[session_id] = saved
        else:
            conversations[session_id] = [{"role": "system", "content": EVA_SYSTEM_PROMPT}]
    return conversations[session_id]

def add_message(session_id: str, role: str, content: str):
    msgs = get_messages(session_id)
    msgs.append({"role": role, "content": content})
    # Keep last 20 messages + system prompt
    if len(msgs) > 21:
        conversations[session_id] = [msgs[0]] + msgs[-20:]
    # Save to database
    save_conversation(session_id, conversations[session_id])

def clear_conversation(session_id: str):
    if session_id in conversations:
        del conversations[session_id]
    if db_conn:
        db_conn.execute("DELETE FROM conversations WHERE session_id = ?", (session_id,))
        db_conn.commit()

# ============================================
# STT - Speech to Text
# ============================================

async def transcribe_audio(audio_bytes: bytes) -> str:
    """Transcrit audio en texte avec Whisper"""
    if not whisper_model:
        return "[STT non disponible - utilisez le navigateur]"

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_bytes)
        temp_path = f.name

    try:
        # ULTRA-FAST settings: beam_size=1, no VAD for speed
        segments, info = whisper_model.transcribe(
            temp_path,
            language="fr",
            beam_size=1,           # Fastest (was 5)
            vad_filter=False,      # Skip VAD for speed
            word_timestamps=False, # Don't need word-level
            condition_on_previous_text=False,  # Faster
        )
        text = " ".join([s.text for s in segments])
        return text.strip()
    except Exception as e:
        print(f"STT Error: {e}")
        return ""
    finally:
        os.unlink(temp_path)

# ============================================
# LLM - Language Model (Ultra-Optimized)
# ============================================

def get_system_prompt() -> str:
    """Retourne le prompt système selon le mode qualité"""
    if QUALITY_MODE == "quality":
        return EVA_SYSTEM_PROMPT_QUALITY
    return EVA_SYSTEM_PROMPT  # fast ou balanced

async def stream_cerebras(messages: list, max_tok: int = 80) -> AsyncGenerator[str, None]:
    """Stream from Cerebras API (~50ms TTFT - fastest!)"""
    async with cerebras_client.stream(
        "POST",
        "/chat/completions",
        json={
            "model": CEREBRAS_MODEL,
            "messages": messages,
            "stream": True,
            "temperature": 0.7,
            "max_tokens": max_tok,
            "top_p": 0.85,
        },
    ) as response:
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    chunk = json_loads(data)
                    if chunk.get("choices") and chunk["choices"][0].get("delta", {}).get("content"):
                        yield chunk["choices"][0]["delta"]["content"]
                except:
                    pass


async def stream_llm(session_id: str, user_msg: str, use_fast: bool = True) -> AsyncGenerator[str, None]:
    """Stream réponse LLM token par token - ultra-optimisé

    Priority: Cerebras (~50ms) > Groq Fast (~150ms) > Groq Quality (~200ms)
    """

    # 1. CHECK CACHE FIRST (instant response for greetings)
    cached = response_cache.get_cached_response(user_msg)
    if cached:
        print(f"⚡ CACHED: 0ms")
        add_message(session_id, "user", user_msg)
        add_message(session_id, "assistant", cached)
        yield cached
        return

    add_message(session_id, "user", user_msg)
    messages = get_messages(session_id)

    # Use optimized system prompt
    if messages and messages[0]["role"] == "system":
        messages[0]["content"] = get_system_prompt()

    # Choose model/provider based on availability and mode
    use_cerebras = cerebras_client is not None and QUALITY_MODE != "quality"

    if QUALITY_MODE == "fast":
        max_tok = 60
    elif QUALITY_MODE == "quality":
        max_tok = 150
    else:  # balanced
        max_tok = 80

    start_time = time.time()

    try:
        # Try Cerebras first (50ms TTFT) if available
        if use_cerebras:
            provider = "cerebras"
            full = ""
            first_token = True

            async for token in stream_cerebras(messages, max_tok):
                if first_token:
                    ttft = (time.time() - start_time) * 1000
                    print(f"⚡ TTFT: {ttft:.0f}ms (cerebras)")
                    first_token = False
                full += token
                yield token
        else:
            # Fallback to Groq
            provider = "groq"
            if QUALITY_MODE == "quality":
                model = GROQ_MODEL_QUALITY
            else:
                model = GROQ_MODEL_FAST if use_fast else GROQ_MODEL_QUALITY

            stream = await groq_client.chat.completions.create(
                model=model,
                messages=messages,
                stream=True,
                temperature=0.7,
                max_tokens=max_tok,
                top_p=0.85,
            )

            full = ""
            first_token = True

            async for chunk in stream:
                if chunk.choices[0].delta.content:
                    token = chunk.choices[0].delta.content

                    if first_token:
                        ttft = (time.time() - start_time) * 1000
                        print(f"⚡ TTFT: {ttft:.0f}ms ({model.split('-')[1]})")
                        first_token = False

                    full += token
                    yield token

        # Humaniser la réponse complète (pour le stockage et la cohérence)
        humanized = humanize_response(full)
        add_message(session_id, "assistant", humanized)

        total_time = (time.time() - start_time) * 1000
        print(f"⚡ LLM Total: {total_time:.0f}ms ({len(humanized)} chars, {provider})")

        # Async log (non-blocking)
        asyncio.create_task(async_log_usage(session_id, "llm", int(total_time)))

    except Exception as e:
        print(f"LLM Error: {e}")
        # Fallback to Groq if Cerebras fails
        if use_cerebras and groq_client:
            print("⚠️ Cerebras failed, falling back to Groq...")
            async for token in stream_llm_groq_fallback(messages, max_tok, start_time):
                yield token
        else:
            yield f"Désolée, j'ai eu un petit souci. Tu peux répéter ?"


async def stream_llm_groq_fallback(messages: list, max_tok: int, start_time: float) -> AsyncGenerator[str, None]:
    """Groq fallback when Cerebras fails"""
    try:
        stream = await groq_client.chat.completions.create(
            model=GROQ_MODEL_FAST,
            messages=messages,
            stream=True,
            temperature=0.7,
            max_tokens=max_tok,
            top_p=0.85,
        )
        first_token = True
        async for chunk in stream:
            if chunk.choices[0].delta.content:
                token = chunk.choices[0].delta.content
                if first_token:
                    ttft = (time.time() - start_time) * 1000
                    print(f"⚡ TTFT (fallback): {ttft:.0f}ms")
                    first_token = False
                yield token
    except Exception as e:
        print(f"Groq fallback error: {e}")
        yield "Désolée, j'ai eu un souci technique."

async def async_log_usage(session_id: str, endpoint: str, latency_ms: int):
    """Non-blocking usage logging"""
    await asyncio.to_thread(log_usage, session_id, endpoint, latency_ms)

async def get_llm_response(session_id: str, user_msg: str, use_fast: bool = True) -> str:
    """Get full LLM response (non-streaming)"""
    result = ""
    async for token in stream_llm(session_id, user_msg, use_fast):
        result += token
    return result

# ============================================
# TTS - Text to Speech (SSML Enhanced + Cached)
# ============================================

# Lazy import edge_tts (saves ~50ms startup)
_edge_tts = None

def _get_edge_tts():
    global _edge_tts
    if _edge_tts is None:
        import edge_tts
        _edge_tts = edge_tts
    return _edge_tts

# SSML patterns for natural speech - ENRICHI avec expressions emotionnelles
_PAUSE_PATTERNS = [
    (re.compile(r'\.\.\.'), '<break time="400ms"/>'),  # Ellipsis = longer pause
    (re.compile(r'\.\s'), '.<break time="300ms"/> '),  # Period = medium pause
    (re.compile(r',\s'), ',<break time="150ms"/> '),   # Comma = short pause
    (re.compile(r'\?\s'), '?<break time="350ms"/> '),  # Question = medium pause
    (re.compile(r'!\s'), '!<break time="200ms"/> '),   # Exclamation = short pause
    # Expressions emotionnelles
    (re.compile(r'\bhmm\b', re.IGNORECASE), '<prosody rate="slow" pitch="-2st">hmm</prosody>'),  # Thoughtful
    (re.compile(r'\boh\b', re.IGNORECASE), '<prosody pitch="+4st" rate="fast">oh</prosody>'),  # Surprised
    (re.compile(r'\bah\b', re.IGNORECASE), '<prosody pitch="+3st">ah</prosody>'),  # Understanding
    # Rires et humour
    (re.compile(r'\bhaha\b', re.IGNORECASE), '<prosody pitch="+5st" rate="+20%">haha</prosody>'),  # Rire
    (re.compile(r'\bhihi\b', re.IGNORECASE), '<prosody pitch="+6st" rate="+25%">hihi</prosody>'),  # Rire leger
    (re.compile(r'\bmdr\b', re.IGNORECASE), '<prosody pitch="+4st" rate="+15%">mdr</prosody>'),  # Rire
    (re.compile(r'\bpfff\b', re.IGNORECASE), '<prosody pitch="-2st" rate="slow">pfff</prosody>'),  # Exasperation amusee
    # Emotions fortes
    (re.compile(r'\bwaouh\b', re.IGNORECASE), '<prosody pitch="+6st" rate="+10%">waouh</prosody>'),  # Impressionne
    (re.compile(r'\bnoooon\b', re.IGNORECASE), '<prosody pitch="+5st" rate="+15%">noooon</prosody>'),  # Surprise
    (re.compile(r'\bserieux\b', re.IGNORECASE), '<prosody pitch="+3st">serieux</prosody>'),  # Incredule
    (re.compile(r'\boh la la\b', re.IGNORECASE), '<prosody pitch="+4st" rate="+10%">oh la la</prosody>'),  # Exclamation
]

def _text_to_ssml(text: str, voice: str, rate: str, pitch: str) -> str:
    """Convert text to SSML for more natural speech.

    Adds:
    - Natural pauses at punctuation
    - Prosody changes for emotional expressions
    - Breathing simulation
    """
    # Apply natural pauses and prosody
    result = text
    for pattern, replacement in _PAUSE_PATTERNS:
        result = pattern.sub(replacement, result)

    # Wrap in SSML with voice settings
    # Note: Edge-TTS handles rate/pitch separately, but SSML adds naturalness
    ssml = f"""<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="fr-FR">
    <voice name="{VOICES.get(voice, VOICES[DEFAULT_VOICE])}">
        <prosody rate="{rate}" pitch="{pitch}">
            {result}
        </prosody>
    </voice>
</speak>"""
    return ssml

async def text_to_speech(
    text: str,
    voice: str = DEFAULT_VOICE,
    rate: str = "+5%",  # Slightly faster but natural
    pitch: str = "+0Hz",
    use_ssml: bool = False,  # SSML adds latency, use for quality mode
    add_breathing: bool = True  # Add natural breathing and hesitations
) -> bytes:
    """Convertit texte en audio - MMS-TTS (fast) ou Edge-TTS (quality)

    OPTIMIZATIONS:
    - MMS-TTS on GPU: ~100ms latency (USE_FAST_TTS=true)
    - Edge-TTS: ~1500ms but higher quality voices (USE_FAST_TTS=false)
    - LRU cache for repeated phrases
    - Natural breathing and hesitations (100% LOCAL)
    """
    # Apply natural breathing and hesitations BEFORE synthesis
    processed_text = text
    if add_breathing:
        processed_text = make_natural(text)
        if processed_text != text:
            print(f"🌬️ Breathing: '{text[:30]}...' -> '{processed_text[:40]}...'")

    start_time = time.time()

    # ========== FAST TTS MODE (MMS-TTS on GPU - ~100ms) ==========
    if USE_FAST_TTS:
        # Check cache first
        cached = tts_cache.get(processed_text, "mms", rate, pitch)
        if cached:
            print(f"🔊 TTS: 0ms (cached, {len(cached)} bytes)")
            return cached

        # Generate with MMS-TTS (MP3 format for smaller size)
        audio_data = await async_fast_tts_mp3(processed_text)
        if audio_data:
            # Cache short phrases
            if len(processed_text) < 200:
                tts_cache.set(processed_text, "mms", audio_data, rate, pitch)
            tts_time = (time.time() - start_time) * 1000
            print(f"🔊 TTS (MMS): {tts_time:.0f}ms ({len(audio_data)} bytes)")
            return audio_data
        # Fallback to Edge-TTS if MMS fails
        print("⚠️ MMS-TTS failed, falling back to Edge-TTS")

    # ========== EDGE-TTS MODE (slower but more voices) ==========
    if not tts_available:
        return b""

    # Check cache first (fastest path)
    cached = tts_cache.get(processed_text, voice, rate, pitch)
    if cached:
        print(f"🔊 TTS: 0ms (cached, {len(cached)} bytes)")
        return cached

    edge_tts = _get_edge_tts()
    voice_name = VOICES.get(voice, VOICES[DEFAULT_VOICE])

    # Use SSML for better prosody in quality mode
    if use_ssml and QUALITY_MODE == "quality":
        ssml_text = _text_to_ssml(processed_text, voice, rate, pitch)
        communicate = edge_tts.Communicate(ssml_text, voice_name)
    else:
        communicate = edge_tts.Communicate(processed_text, voice_name, rate=rate, pitch=pitch)

    # Collect audio chunks
    chunks: list[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])

    audio_data = b"".join(chunks)

    # Cache short phrases
    if len(processed_text) < 200:
        tts_cache.set(processed_text, voice, audio_data, rate, pitch)

    tts_time = (time.time() - start_time) * 1000
    print(f"🔊 TTS (Edge): {tts_time:.0f}ms ({len(audio_data)} bytes)")

    return audio_data

async def text_to_speech_streaming(
    text: str,
    voice: str = DEFAULT_VOICE,
    rate: str = "+5%",
    pitch: str = "+0Hz",
    add_breathing: bool = True
) -> AsyncGenerator[bytes, None]:
    """Stream TTS audio chunks for lower TTFA (time to first audio)

    Ideal for real-time voice output where you want audio
    to start playing before the full synthesis is complete.
    Includes natural breathing and hesitations (100% LOCAL).
    """
    if not tts_available:
        return

    # Apply natural breathing and hesitations
    processed_text = make_natural(text) if add_breathing else text

    edge_tts = _get_edge_tts()
    voice_name = VOICES.get(voice, VOICES[DEFAULT_VOICE])

    communicate = edge_tts.Communicate(processed_text, voice_name, rate=rate, pitch=pitch)

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]

async def text_to_speech_sentence_stream(
    text: str,
    voice: str = DEFAULT_VOICE,
    rate: str = "+5%",
    pitch: str = "+0Hz"
) -> AsyncGenerator[bytes, None]:
    """Stream TTS sentence by sentence for ultra-low latency.

    Splits text into sentences and generates audio for each,
    allowing playback to begin after the first sentence is ready.
    """
    if not tts_available:
        return

    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s+', text)

    for sentence in sentences:
        if sentence.strip():
            audio = await text_to_speech(sentence.strip(), voice, rate, pitch)
            if audio:
                yield audio

# ============================================
# REST ENDPOINTS
# ============================================

@app.get("/")
async def root():
    return {
        "service": "EVA-VOICE",
        "status": "online",
        "version": "1.0.0",
        "features": {
            "llm": "groq-llama-3.3-70b",
            "stt": "whisper" if whisper_model else "browser-only",
            "tts": "edge-tts" if tts_available else "disabled"
        },
        "voices": list(VOICES.keys()) if tts_available else []
    }

@app.get("/health")
async def health():
    """Health check endpoint for monitoring"""
    return {
        "status": "healthy",
        "groq": bool(groq_client),
        "whisper": bool(whisper_model),
        "tts": tts_available,
        "database": bool(db_conn)
    }

@app.get("/voices")
async def get_voices():
    """Liste des voix disponibles"""
    return {
        "voices": [
            {"id": k, "name": v, "default": k == DEFAULT_VOICE}
            for k, v in VOICES.items()
        ]
    }

@app.get("/moods")
async def get_moods():
    """Liste des moods disponibles pour Eva"""
    return {
        "moods": [
            {"id": k, "name": v["name"], "description": v["description"]}
            for k, v in EVA_MOODS.items()
        ],
        "current_default": "default"
    }

@app.post("/mood")
async def set_mood(data: dict, _: str = Depends(verify_api_key)):
    """Change le mood d'Eva pour une session"""
    session_id = data.get("session_id", "default")
    mood = data.get("mood", "default")

    if mood not in EVA_MOODS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid mood. Available: {list(EVA_MOODS.keys())}"
        )

    session_moods[session_id] = mood
    mood_info = EVA_MOODS[mood]

    return {
        "session_id": session_id,
        "mood": mood,
        "name": mood_info["name"],
        "description": mood_info["description"]
    }

@app.get("/personality")
async def get_personality():
    """Retourne les traits de personnalité d'Eva"""
    return {
        "personality": EVA_PERSONALITY,
        "expressions": EVA_EXPRESSIONS,
        "moods": list(EVA_MOODS.keys()),
    }

@app.get("/breathing")
async def get_breathing_config():
    """Retourne la configuration du système de respiration naturelle"""
    return {
        "breath_config": breathing_system.BREATH_CONFIG,
        "hesitation_config": breathing_system.HESITATION_CONFIG,
        "hesitations_available": breathing_system.HESITATIONS_FR,
        "thinking_sounds": breathing_system.THINKING_SOUNDS,
    }

@app.post("/breathing")
async def set_breathing_config(data: dict, _: str = Depends(verify_api_key)):
    """Configure le système de respiration naturelle

    Paramètres optionnels:
    - breath_enabled: bool - Activer/désactiver les pauses de respiration
    - breath_probability: float (0-1) - Probabilité d'ajouter une pause
    - hesitation_enabled: bool - Activer/désactiver les hésitations
    - hesitation_probability: float (0-1) - Probabilité d'ajouter une hésitation
    - max_hesitations: int - Nombre maximum d'hésitations par réponse
    """
    breathing_system.configure(
        breath_enabled=data.get("breath_enabled"),
        breath_probability=data.get("breath_probability"),
        hesitation_enabled=data.get("hesitation_enabled"),
        hesitation_probability=data.get("hesitation_probability"),
        max_hesitations=data.get("max_hesitations"),
    )

    return {
        "status": "updated",
        "breath_config": breathing_system.BREATH_CONFIG,
        "hesitation_config": breathing_system.HESITATION_CONFIG,
    }

@app.post("/chat")
async def chat(request: Request, data: dict, _: str = Depends(verify_api_key)):
    """Chat texte simple"""
    client_id = get_client_id(request)

    # Rate limiting
    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Try again in {RATE_LIMIT_WINDOW} seconds.",
            headers={"Retry-After": str(RATE_LIMIT_WINDOW)}
        )

    session_id = data.get("session_id", "default")
    message = data.get("message", "")

    if not message:
        raise HTTPException(status_code=400, detail="message required")

    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="message too long (max 2000 chars)")

    start = time.time()
    response = await get_llm_response(session_id, message)
    latency = (time.time() - start) * 1000

    return {
        "response": response,
        "session_id": session_id,
        "latency_ms": round(latency),
        "rate_limit_remaining": rate_limiter.get_remaining(client_id)
    }

@app.post("/clear")
async def clear(data: dict, _: str = Depends(verify_api_key)):
    """Efface l'historique de conversation"""
    session_id = data.get("session_id", "default")
    clear_conversation(session_id)
    return {"status": "cleared", "session_id": session_id}

@app.post("/stt")
async def stt(request: Request, file: UploadFile = File(...), _: str = Depends(verify_api_key)):
    """Speech to Text endpoint"""
    client_id = get_client_id(request)

    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    # Limit file size (5MB max)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    start = time.time()
    text = await transcribe_audio(contents)
    latency = (time.time() - start) * 1000

    return {
        "text": text,
        "latency_ms": round(latency)
    }

@app.post("/tts")
async def tts(request: Request, data: dict, _: str = Depends(verify_api_key)):
    """Text to Speech endpoint (cached)"""
    client_id = get_client_id(request)

    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    text = data.get("text", "")
    voice = data.get("voice", DEFAULT_VOICE)
    rate = data.get("rate", "+10%")  # Default faster speech
    pitch = data.get("pitch", "+0Hz")

    if not text:
        raise HTTPException(status_code=400, detail="text required")

    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="text too long (max 1000 chars)")

    if voice not in VOICES:
        raise HTTPException(status_code=400, detail=f"Invalid voice. Available: {list(VOICES.keys())}")

    audio = await text_to_speech(text, voice, rate, pitch)

    if not audio:
        raise HTTPException(status_code=503, detail="TTS not available")

    return StreamingResponse(
        io.BytesIO(audio),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=eva_response.mp3",
            "X-Rate-Limit-Remaining": str(rate_limiter.get_remaining(client_id))
        }
    )

@app.post("/tts/stream")
async def tts_stream(request: Request, data: dict, _: str = Depends(verify_api_key)):
    """Text to Speech streaming endpoint (lower TTFA)"""
    client_id = get_client_id(request)

    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    text = data.get("text", "")
    voice = data.get("voice", DEFAULT_VOICE)
    rate = data.get("rate", "+10%")
    pitch = data.get("pitch", "+0Hz")

    if not text:
        raise HTTPException(status_code=400, detail="text required")

    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="text too long (max 1000 chars)")

    if voice not in VOICES:
        raise HTTPException(status_code=400, detail=f"Invalid voice. Available: {list(VOICES.keys())}")

    async def generate():
        async for chunk in text_to_speech_streaming(text, voice, rate, pitch):
            yield chunk

    return StreamingResponse(
        generate(),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=eva_response.mp3",
            "X-Rate-Limit-Remaining": str(rate_limiter.get_remaining(client_id))
        }
    )

@app.post("/voice")
async def voice_pipeline(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Query("default"),
    voice: str = Query(DEFAULT_VOICE),
    _: str = Depends(verify_api_key)
):
    """Pipeline complet: Audio -> STT -> LLM -> TTS -> Audio

    Le TTS s'adapte automatiquement au mood de la session.
    """
    client_id = get_client_id(request)

    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    total_start = time.time()

    # 1. STT
    stt_start = time.time()
    audio_bytes = await file.read()

    if len(audio_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    user_text = await transcribe_audio(audio_bytes)
    stt_time = (time.time() - stt_start) * 1000

    if not user_text or "[" in user_text:
        raise HTTPException(status_code=400, detail="Could not transcribe audio")

    # 2. LLM
    llm_start = time.time()
    eva_response = await get_llm_response(session_id, user_text)
    llm_time = (time.time() - llm_start) * 1000

    # 3. TTS avec adaptation au mood
    tts_start = time.time()
    current_mood = session_moods[session_id]
    mood_settings = EVA_MOODS.get(current_mood, EVA_MOODS["default"])

    audio_response = await text_to_speech(
        eva_response,
        voice,
        rate=mood_settings["voice_rate"],
        pitch=mood_settings["voice_pitch"]
    )
    tts_time = (time.time() - tts_start) * 1000

    total_time = (time.time() - total_start) * 1000
    log_usage(session_id, "voice_pipeline", int(total_time))

    return {
        "user_text": user_text,
        "eva_response": eva_response,
        "audio_base64": base64.b64encode(audio_response).decode() if audio_response else None,
        "mood": current_mood,
        "latency": {
            "stt_ms": round(stt_time),
            "llm_ms": round(llm_time),
            "tts_ms": round(tts_time),
            "total_ms": round(total_time)
        }
    }

# ============================================
# LIP-SYNC VIDEO GENERATION (MuseTalk)
# ============================================

LIPSYNC_SERVICE_URL = os.getenv("LIPSYNC_SERVICE_URL", "http://localhost:8001")

# Background lip-sync tasks storage
lipsync_tasks = {}

@app.post("/voice/lipsync")
async def voice_lipsync_pipeline(
    request: Request,
    file: UploadFile = File(...),
    session_id: str = Query("default"),
    voice: str = Query(DEFAULT_VOICE),
    _: str = Depends(verify_api_key)
):
    """Pipeline OPTIMISÉ: Retourne audio immédiatement, lip-sync en background

    Flow:
    1. STT -> LLM -> TTS (rapide)
    2. Retourne audio + task_id immédiatement
    3. Lip-sync génère en background
    4. Frontend poll /lipsync/status/{task_id} pour la vidéo
    """
    client_id = get_client_id(request)

    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    total_start = time.time()

    # 1. STT
    stt_start = time.time()
    audio_bytes = await file.read()

    if len(audio_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 5MB)")

    user_text = await transcribe_audio(audio_bytes)
    stt_time = (time.time() - stt_start) * 1000

    if not user_text or "[" in user_text:
        raise HTTPException(status_code=400, detail="Could not transcribe audio")

    # 2. LLM
    llm_start = time.time()
    eva_response = await get_llm_response(session_id, user_text)
    llm_time = (time.time() - llm_start) * 1000

    # 3. TTS
    tts_start = time.time()
    current_mood = session_moods[session_id]
    mood_settings = EVA_MOODS.get(current_mood, EVA_MOODS["default"])

    audio_response = await text_to_speech(
        eva_response,
        voice,
        rate=mood_settings["voice_rate"],
        pitch=mood_settings["voice_pitch"]
    )
    tts_time = (time.time() - tts_start) * 1000

    # 4. Start lip-sync generation in BACKGROUND
    task_id = hashlib.md5(f"{time.time()}{user_text}".encode()).hexdigest()[:12]
    lipsync_tasks[task_id] = {"status": "processing", "video_base64": None, "start_time": time.time()}

    # Launch background task
    async def generate_lipsync_background():
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                files = {"audio": ("speech.mp3", audio_response, "audio/mpeg")}
                response = await client.post(f"{LIPSYNC_SERVICE_URL}/lipsync", files=files)

                if response.status_code == 200:
                    lipsync_data = response.json()
                    lipsync_tasks[task_id]["video_base64"] = lipsync_data.get("video_base64")
                    lipsync_tasks[task_id]["status"] = "ready"
                    lipsync_tasks[task_id]["generation_time_ms"] = lipsync_data.get("generation_time_ms", 0)
                else:
                    lipsync_tasks[task_id]["status"] = "error"
        except Exception as e:
            lipsync_tasks[task_id]["status"] = "error"
            print(f"Background lip-sync error: {e}")

    # Start background generation (don't await!)
    asyncio.create_task(generate_lipsync_background())

    # Return IMMEDIATELY with audio (don't wait for lip-sync!)
    audio_time = (time.time() - total_start) * 1000

    total_time = (time.time() - total_start) * 1000
    log_usage(session_id, "voice_lipsync_pipeline", int(total_time))

    # Return audio IMMEDIATELY - video will be available via /lipsync/status/{task_id}
    return {
        "user_text": user_text,
        "eva_response": eva_response,
        "audio_base64": base64.b64encode(audio_response).decode() if audio_response else None,
        "lipsync_task_id": task_id,  # Frontend polls this for video
        "mood": current_mood,
        "latency": {
            "stt_ms": round(stt_time),
            "llm_ms": round(llm_time),
            "tts_ms": round(tts_time),
            "total_ms": round(total_time)  # Much faster! No lip-sync wait
        }
    }

@app.get("/lipsync/status/{task_id}")
async def get_lipsync_status(task_id: str):
    """Poll pour récupérer la vidéo lip-sync quand elle est prête"""
    if task_id not in lipsync_tasks:
        raise HTTPException(status_code=404, detail="Task not found")

    task = lipsync_tasks[task_id]

    if task["status"] == "ready":
        # Clean up old tasks (keep for 5 min)
        video = task["video_base64"]
        gen_time = task.get("generation_time_ms", 0)
        # Don't delete immediately - frontend might poll multiple times
        return {
            "status": "ready",
            "video_base64": video,
            "generation_time_ms": gen_time
        }
    elif task["status"] == "error":
        return {"status": "error"}
    else:
        elapsed = (time.time() - task["start_time"]) * 1000
        return {"status": "processing", "elapsed_ms": round(elapsed)}

@app.post("/tts/lipsync")
async def tts_lipsync(
    request: Request,
    data: dict,
    _: str = Depends(verify_api_key)
):
    """Text to Speech + Lip-Sync Video

    Génère audio + vidéo lip-sync à partir de texte.
    """
    client_id = get_client_id(request)

    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    text = data.get("text", "")
    voice = data.get("voice", DEFAULT_VOICE)
    rate = data.get("rate", "+10%")
    pitch = data.get("pitch", "+0Hz")

    if not text:
        raise HTTPException(status_code=400, detail="text required")

    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="text too long (max 1000 chars)")

    total_start = time.time()

    # 1. TTS
    tts_start = time.time()
    audio = await text_to_speech(text, voice, rate, pitch)
    tts_time = (time.time() - tts_start) * 1000

    if not audio:
        raise HTTPException(status_code=503, detail="TTS not available")

    # 2. Generate lip-sync video
    lipsync_start = time.time()
    video_base64 = None
    lipsync_time = 0

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            files = {"audio": ("speech.mp3", audio, "audio/mpeg")}
            response = await client.post(f"{LIPSYNC_SERVICE_URL}/lipsync", files=files)

            if response.status_code == 200:
                lipsync_data = response.json()
                video_base64 = lipsync_data.get("video_base64")
                lipsync_time = lipsync_data.get("generation_time_ms", 0)
            else:
                print(f"Lip-sync service error: {response.status_code}")
    except Exception as e:
        print(f"Lip-sync service unavailable: {e}")

    lipsync_time = (time.time() - lipsync_start) * 1000 if lipsync_time == 0 else lipsync_time

    total_time = (time.time() - total_start) * 1000

    return {
        "text": text,
        "audio_base64": base64.b64encode(audio).decode(),
        "video_base64": video_base64,
        "latency": {
            "tts_ms": round(tts_time),
            "lipsync_ms": round(lipsync_time),
            "total_ms": round(total_time)
        }
    }

@app.get("/stats")
async def get_stats(_: str = Depends(verify_api_key)):
    """Get usage statistics"""
    if not db_conn:
        return {"error": "Database not available"}

    try:
        # Total requests
        cursor = db_conn.execute("SELECT COUNT(*) FROM usage_stats")
        total_requests = cursor.fetchone()[0]

        # Average latency
        cursor = db_conn.execute("SELECT AVG(latency_ms) FROM usage_stats")
        avg_latency = cursor.fetchone()[0] or 0

        # Requests last hour
        one_hour_ago = datetime.now() - timedelta(hours=1)
        cursor = db_conn.execute(
            "SELECT COUNT(*) FROM usage_stats WHERE created_at > ?",
            (one_hour_ago,)
        )
        requests_last_hour = cursor.fetchone()[0]

        # Active sessions
        cursor = db_conn.execute("SELECT COUNT(DISTINCT session_id) FROM conversations")
        active_sessions = cursor.fetchone()[0]

        return {
            "total_requests": total_requests,
            "avg_latency_ms": round(avg_latency),
            "requests_last_hour": requests_last_hour,
            "active_sessions": active_sessions
        }
    except Exception as e:
        return {"error": str(e)}

# ============================================
# WEBSOCKET
# ============================================

@app.websocket("/ws/chat")
async def ws_chat(ws: WebSocket):
    """WebSocket pour chat texte streaming"""
    await ws.accept()
    session_id = f"ws_{id(ws)}"
    client_id = ws.client.host if ws.client else "unknown"
    print(f"🔌 WebSocket connected: {session_id}")

    try:
        while True:
            data = await ws.receive_json()

            # Rate limiting for WebSocket
            if not rate_limiter.is_allowed(client_id, limit=30, window=60):
                await ws.send_json({"type": "error", "message": "Rate limit exceeded"})
                continue

            if data.get("type") == "message":
                content = data.get("content", "")
                sid = data.get("session_id", session_id)

                if len(content) > 2000:
                    await ws.send_json({"type": "error", "message": "Message too long"})
                    continue

                async for token in stream_llm(sid, content):
                    await ws.send_json({"type": "token", "content": token})
                await ws.send_json({"type": "end"})

            elif data.get("type") == "clear":
                sid = data.get("session_id", session_id)
                clear_conversation(sid)
                await ws.send_json({"type": "cleared"})

            elif data.get("type") == "ping":
                await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        print(f"🔌 WebSocket disconnected: {session_id}")

@app.websocket("/ws/voice")
async def ws_voice(ws: WebSocket):
    """WebSocket pour pipeline vocal temps réel"""
    await ws.accept()
    session_id = f"voice_{id(ws)}"
    voice = DEFAULT_VOICE
    client_id = ws.client.host if ws.client else "unknown"
    print(f"🎤 Voice WebSocket connected: {session_id}")

    try:
        while True:
            # Rate limiting
            if not rate_limiter.is_allowed(client_id, limit=20, window=60):
                await ws.send_json({"type": "error", "message": "Rate limit exceeded"})
                await asyncio.sleep(1)
                continue

            msg = await ws.receive()

            if "text" in msg:
                data = json_loads(msg["text"])
                if data.get("type") == "config":
                    voice = data.get("voice", DEFAULT_VOICE)
                    if voice not in VOICES:
                        voice = DEFAULT_VOICE
                    await ws.send_json({"type": "config_ok", "voice": voice})
                    continue

            if "bytes" in msg:
                audio_data = msg["bytes"]

                # Size limit
                if len(audio_data) > 5 * 1024 * 1024:
                    await ws.send_json({"type": "error", "message": "Audio too large"})
                    continue

                # STT
                text = await transcribe_audio(audio_data)
                if not text or "[" in text:
                    await ws.send_json({"type": "error", "message": "Could not transcribe"})
                    continue

                await ws.send_json({"type": "transcript", "text": text})

                # LLM + stream
                full_response = ""
                async for token in stream_llm(session_id, text):
                    full_response += token
                    await ws.send_json({"type": "token", "content": token})

                await ws.send_json({"type": "response_end", "text": full_response})

                # TTS
                if full_response:
                    audio = await text_to_speech(full_response, voice)
                    if audio:
                        await ws.send_bytes(audio)

                await ws.send_json({"type": "audio_end"})

    except WebSocketDisconnect:
        print(f"🔌 Voice WebSocket disconnected: {session_id}")

# ============================================
# EMOTION ANALYSIS
# ============================================

# Emotion keywords for simple analysis - ENRICHI avec humour et emotions fortes
EMOTION_KEYWORDS = {
    "joy": ["content", "heureux", "heureuse", "super", "genial", "excellent", "adorable", "magnifique", "parfait", "incroyable", "trop bien", "j'adore", "love", "cool", "nice", "top", "yeaaah", "woohoo"],
    "sadness": ["triste", "malheureux", "deprime", "pleure", "mal", "difficile", "dur", "perdu", "seul", "solitude", "nul", "chiant", "relou", "ca craint", "merde"],
    "anger": ["enerve", "colere", "furieux", "rage", "deteste", "insupportable", "agace", "frustre", "putain", "bordel", "fait chier"],
    "fear": ["peur", "angoisse", "anxieux", "stresse", "stress", "inquiet", "terrifie", "effraye", "flippe", "panique"],
    "surprise": ["surpris", "choque", "incroyable", "wow", "whoa", "quoi", "serieux", "noooon", "attends", "genre", "omg", "waouh"],
    "love": ["aime", "amour", "adore", "tendresse", "affection", "calin", "bisou", "t'es genial", "t'es la meilleure", "tu me manques"],
    "humor": ["mdr", "lol", "haha", "hihi", "ptdr", "xd", "drole", "marrant", "rigole", "blague", "mort de rire", "trop drole"],
    "excitement": ["hate", "excite", "impatient", "trop bien", "genial", "oh la la", "j'ai trop hate", "vivement", "yeah"],
    "neutral": [],
}

def analyze_emotion_simple(text: str) -> dict:
    """Analyse simple des émotions basée sur les mots-clés.

    Returns emotion scores (0-1) for each emotion.
    """
    text_lower = text.lower()
    scores = {emotion: 0.0 for emotion in EMOTION_KEYWORDS}

    for emotion, keywords in EMOTION_KEYWORDS.items():
        if not keywords:
            continue
        matches = sum(1 for kw in keywords if kw in text_lower)
        if matches > 0:
            scores[emotion] = min(1.0, matches * 0.3)  # Cap at 1.0

    # If no emotion detected, mark as neutral
    if all(v == 0 for v in scores.values()):
        scores["neutral"] = 0.7

    # Find dominant emotion
    dominant = max(scores, key=scores.get)

    return {
        "scores": scores,
        "dominant": dominant,
        "confidence": scores[dominant],
    }

def get_mood_from_emotion(emotion: str) -> str:
    """Map detected emotion to Eva's mood - ENRICHI avec humour."""
    emotion_to_mood = {
        "joy": "playful",
        "sadness": "calm",
        "anger": "calm",
        "fear": "calm",
        "surprise": "excited",
        "love": "intimate",
        "humor": "funny",
        "excitement": "excited",
        "neutral": "default",
    }
    return emotion_to_mood.get(emotion, "default")

@app.post("/analyze-emotion")
async def analyze_emotion(data: dict, _: str = Depends(verify_api_key)):
    """Analyse les émotions dans un texte."""
    text = data.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="text required")

    analysis = analyze_emotion_simple(text)
    suggested_mood = get_mood_from_emotion(analysis["dominant"])

    return {
        "text": text,
        "emotion": analysis,
        "suggested_mood": suggested_mood,
    }

# ============================================
# STREAMING PIPELINE (LLM + TTS in parallel)
# ============================================

@app.websocket("/ws/stream")
async def ws_stream(ws: WebSocket):
    """WebSocket ultra-optimisé avec streaming parallèle LLM+TTS.

    Features:
    - Analyse d'émotions automatique
    - TTS phrase par phrase (streaming)
    - Adaptation du mood selon l'émotion détectée
    - Latence minimale
    """
    await ws.accept()
    session_id = f"stream_{id(ws)}"
    voice = DEFAULT_VOICE
    auto_mood = True  # Auto-adjust mood based on emotion
    client_id = ws.client.host if ws.client else "unknown"
    print(f"⚡ Stream WebSocket connected: {session_id}")

    try:
        while True:
            if not rate_limiter.is_allowed(client_id, limit=30, window=60):
                await safe_ws_send(ws, {"type": "error", "message": "Rate limit exceeded"})
                await asyncio.sleep(1)
                continue

            try:
                msg = await asyncio.wait_for(ws.receive(), timeout=60.0)
            except asyncio.TimeoutError:
                if not await safe_ws_send(ws, {"type": "ping"}):
                    break
                continue
            except Exception:
                break

            # Check for disconnect
            if msg.get("type") == "websocket.disconnect":
                break

            # Handle text messages (config, chat)
            if "text" in msg:
                data = json_loads(msg["text"])
                msg_type = data.get("type", "message")

                if msg_type == "config":
                    voice = data.get("voice", voice)
                    auto_mood = data.get("auto_mood", auto_mood)
                    if voice not in VOICES:
                        voice = DEFAULT_VOICE
                    await safe_ws_send(ws, {"type": "config_ok", "voice": voice, "auto_mood": auto_mood})
                    continue

                elif msg_type == "message":
                    content = data.get("content", "")
                    sid = data.get("session_id", session_id)

                    if not content or len(content) > 2000:
                        await safe_ws_send(ws, {"type": "error", "message": "Invalid message"})
                        continue

                    # 1. Analyze emotion in user message
                    emotion = analyze_emotion_simple(content)
                    if not await safe_ws_send(ws, {
                        "type": "emotion",
                        "emotion": emotion["dominant"],
                        "confidence": emotion["confidence"],
                    }):
                        break

                    # 2. Auto-adjust mood if enabled
                    current_mood = "default"
                    if auto_mood:
                        current_mood = get_mood_from_emotion(emotion["dominant"])
                        session_moods[sid] = current_mood
                        await safe_ws_send(ws, {"type": "mood", "mood": current_mood})

                    # 3. Get mood voice settings
                    mood_settings = MOOD_VOICE_SETTINGS.get(current_mood, MOOD_VOICE_SETTINGS["default"])

                    # 4. Stream LLM response
                    full_response = ""
                    sentence_buffer = ""
                    tts_tasks = []
                    disconnected = False

                    async for token in stream_llm(sid, content):
                        full_response += token
                        sentence_buffer += token
                        if not await safe_ws_send(ws, {"type": "token", "content": token}):
                            disconnected = True
                            break

                        # Check for sentence end - trigger TTS immediately
                        if any(sentence_buffer.rstrip().endswith(p) for p in ['.', '!', '?', '...']):
                            sentence = sentence_buffer.strip()
                            if len(sentence) > 3:  # Ignore tiny fragments
                                # Start TTS in background (parallel)
                                tts_task = asyncio.create_task(
                                    text_to_speech(sentence, voice, mood_settings["rate"], mood_settings["pitch"])
                                )
                                tts_tasks.append((sentence, tts_task))
                            sentence_buffer = ""

                    if disconnected:
                        break

                    # Handle remaining buffer
                    if sentence_buffer.strip():
                        sentence = sentence_buffer.strip()
                        tts_task = asyncio.create_task(
                            text_to_speech(sentence, voice, mood_settings["rate"], mood_settings["pitch"])
                        )
                        tts_tasks.append((sentence, tts_task))

                    await safe_ws_send(ws, {"type": "response_end", "text": full_response})

                    # 5. Send TTS audio chunks as they complete
                    for sentence, task in tts_tasks:
                        try:
                            audio = await task
                            if audio:
                                await safe_ws_send(ws, {"type": "audio_start", "sentence": sentence[:50]})
                                await safe_ws_send_bytes(ws, audio)
                        except Exception as e:
                            print(f"TTS error for '{sentence[:30]}': {e}")

                    await safe_ws_send(ws, {"type": "audio_end"})

                elif msg_type == "ping":
                    await safe_ws_send(ws, {"type": "pong"})

            # Handle binary messages (audio from mic)
            elif "bytes" in msg:
                audio_data = msg["bytes"]

                if len(audio_data) > 5 * 1024 * 1024:
                    await safe_ws_send(ws, {"type": "error", "message": "Audio too large"})
                    continue

                # STT
                start = time.time()
                text = await transcribe_audio(audio_data)
                stt_time = (time.time() - start) * 1000

                if not text or "[" in text:
                    await safe_ws_send(ws, {"type": "error", "message": "Could not transcribe"})
                    continue

                if not await safe_ws_send(ws, {
                    "type": "transcript",
                    "text": text,
                    "stt_ms": round(stt_time)
                }):
                    break

                # Process like a text message
                emotion = analyze_emotion_simple(text)
                if not await safe_ws_send(ws, {
                    "type": "emotion",
                    "emotion": emotion["dominant"],
                    "confidence": emotion["confidence"],
                }):
                    break

                current_mood = get_mood_from_emotion(emotion["dominant"]) if auto_mood else "default"
                mood_settings = MOOD_VOICE_SETTINGS.get(current_mood, MOOD_VOICE_SETTINGS["default"])

                # Stream LLM + parallel TTS
                full_response = ""
                sentence_buffer = ""
                tts_tasks = []
                disconnected = False

                async for token in stream_llm(session_id, text):
                    full_response += token
                    sentence_buffer += token
                    if not await safe_ws_send(ws, {"type": "token", "content": token}):
                        disconnected = True
                        break

                    if any(sentence_buffer.rstrip().endswith(p) for p in ['.', '!', '?', '...']):
                        sentence = sentence_buffer.strip()
                        if len(sentence) > 3:
                            tts_task = asyncio.create_task(
                                text_to_speech(sentence, voice, mood_settings["rate"], mood_settings["pitch"])
                            )
                            tts_tasks.append((sentence, tts_task))
                        sentence_buffer = ""

                if disconnected:
                    break

                if sentence_buffer.strip():
                    sentence = sentence_buffer.strip()
                    tts_task = asyncio.create_task(
                        text_to_speech(sentence, voice, mood_settings["rate"], mood_settings["pitch"])
                    )
                    tts_tasks.append((sentence, tts_task))

                await safe_ws_send(ws, {"type": "response_end", "text": full_response})

                for sentence, task in tts_tasks:
                    try:
                        audio = await task
                        if audio:
                            await safe_ws_send(ws, {"type": "audio_start", "sentence": sentence[:50]})
                            await safe_ws_send_bytes(ws, audio)
                    except Exception as e:
                        print(f"TTS error: {e}")

                await safe_ws_send(ws, {"type": "audio_end"})

    except WebSocketDisconnect:
        print(f"⚡ Stream WebSocket disconnected: {session_id}")
    except Exception as e:
        print(f"⚡ Stream WebSocket error: {session_id} - {e}")

# ============================================
# MAIN
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

# ============================================
# INTERRUPTIBLE VOICE SESSION
# ============================================

class InterruptibleVoiceSession:
    """Manages an interruptible voice session with state tracking.

    Features:
    - Speech interruption: User can interrupt Eva mid-speech
    - Chunked audio streaming: Low latency audio playback
    - State management: Tracks speaking/listening/idle states
    - Natural conversation flow
    """

    def __init__(self, session_id: str, voice: str = DEFAULT_VOICE):
        self.session_id = session_id
        self.voice = voice
        self.is_speaking = False
        self.is_interrupted = False
        self.current_tts_tasks: list[asyncio.Task] = []
        self.audio_queue: asyncio.Queue[bytes | None] = asyncio.Queue()
        self.last_activity = time.time()

    def interrupt(self):
        """Interrupt current speech - stops all pending TTS"""
        self.is_interrupted = True
        self.is_speaking = False
        # Cancel all pending TTS tasks
        for task in self.current_tts_tasks:
            if not task.done():
                task.cancel()
        self.current_tts_tasks.clear()
        # Clear audio queue
        while not self.audio_queue.empty():
            try:
                self.audio_queue.get_nowait()
            except asyncio.QueueEmpty:
                break
        print(f"🛑 Session {self.session_id}: Speech interrupted")

    def reset(self):
        """Reset session state for new interaction"""
        self.is_interrupted = False
        self.is_speaking = False
        self.current_tts_tasks.clear()
        self.last_activity = time.time()

# Active voice sessions
voice_sessions: dict[str, InterruptibleVoiceSession] = {}

def get_voice_session(session_id: str, voice: str = DEFAULT_VOICE) -> InterruptibleVoiceSession:
    """Get or create a voice session"""
    if session_id not in voice_sessions:
        voice_sessions[session_id] = InterruptibleVoiceSession(session_id, voice)
    return voice_sessions[session_id]

async def stream_tts_chunks(
    text: str,
    voice: str = DEFAULT_VOICE,
    rate: str = "+15%",  # Faster for natural conversation
    pitch: str = "+0Hz",
    chunk_size: int = 4096  # Small chunks for low latency
) -> AsyncGenerator[bytes, None]:
    """Stream TTS audio in small chunks for interruptible playback.

    Yields audio chunks that can be interrupted at any point.
    Uses smaller chunk_size for lower latency interruption.
    """
    if not tts_available:
        return

    edge_tts = _get_edge_tts()
    voice_name = VOICES.get(voice, VOICES[DEFAULT_VOICE])

    communicate = edge_tts.Communicate(text, voice_name, rate=rate, pitch=pitch)

    buffer = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buffer += chunk["data"]
            while len(buffer) >= chunk_size:
                yield buffer[:chunk_size]
                buffer = buffer[chunk_size:]

    # Yield remaining buffer
    if buffer:
        yield buffer

async def safe_ws_send(ws: WebSocket, data: dict) -> bool:
    """Safely send JSON to WebSocket, return False if disconnected."""
    try:
        await ws.send_json(data)
        return True
    except Exception:
        return False

async def safe_ws_send_bytes(ws: WebSocket, data: bytes) -> bool:
    """Safely send bytes to WebSocket, return False if disconnected."""
    try:
        await ws.send_bytes(data)
        return True
    except Exception:
        return False

@app.websocket("/ws/interruptible")
async def ws_interruptible(ws: WebSocket):
    """WebSocket for interruptible voice conversation.

    Features:
    - Real-time speech interruption
    - Chunked audio streaming (low latency)
    - Natural conversation with overlapping speech detection
    - Fast voice settings for fluid conversation

    Protocol:
    - Client sends: { type: "message", content: "..." } for text
    - Client sends: { type: "interrupt" } to stop Eva speaking
    - Client sends: { type: "audio", data: base64 } or binary for voice input
    - Server sends: { type: "token", content: "..." } for LLM tokens
    - Server sends: { type: "audio_chunk" } followed by binary audio
    - Server sends: { type: "speaking_start" } when Eva starts speaking
    - Server sends: { type: "speaking_end" } when Eva finishes or is interrupted
    """
    await ws.accept()
    session_id = f"interruptible_{id(ws)}"
    voice = DEFAULT_VOICE
    session = get_voice_session(session_id, voice)
    client_id = ws.client.host if ws.client else "unknown"
    connected = True

    # Fast voice settings for natural conversation
    fast_rate = "+15%"  # Faster speech
    natural_pitch = "+0Hz"

    print(f"🎙️ Interruptible voice session started: {session_id}")

    try:
        while connected:
            if not rate_limiter.is_allowed(client_id, limit=60, window=60):
                if not await safe_ws_send(ws, {"type": "error", "message": "Rate limit exceeded"}):
                    break
                await asyncio.sleep(1)
                continue

            try:
                msg = await asyncio.wait_for(ws.receive(), timeout=60.0)
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                if not await safe_ws_send(ws, {"type": "ping"}):
                    break
                continue
            except Exception:
                break

            # Check for disconnect
            if msg.get("type") == "websocket.disconnect":
                break

            session.last_activity = time.time()

            # Handle text messages
            if "text" in msg:
                data = json_loads(msg["text"])
                msg_type = data.get("type", "message")

                # Configure session
                if msg_type == "config":
                    voice = data.get("voice", voice)
                    fast_rate = data.get("rate", "+15%")
                    natural_pitch = data.get("pitch", "+0Hz")
                    if voice not in VOICES:
                        voice = DEFAULT_VOICE
                    session.voice = voice
                    if not await safe_ws_send(ws, {
                        "type": "config_ok",
                        "voice": voice,
                        "rate": fast_rate,
                        "pitch": natural_pitch
                    }):
                        connected = False
                        break
                    continue

                # INTERRUPT: User wants to stop Eva speaking
                elif msg_type == "interrupt":
                    if session.is_speaking:
                        session.interrupt()
                        await safe_ws_send(ws, {"type": "speaking_end", "reason": "interrupted"})
                    continue

                # User started speaking (interrupt Eva)
                elif msg_type == "user_speaking":
                    if session.is_speaking:
                        session.interrupt()
                        await safe_ws_send(ws, {"type": "speaking_end", "reason": "user_speaking"})
                    continue

                # Text message from user
                elif msg_type == "message":
                    content = data.get("content", "")
                    sid = data.get("session_id", session_id)

                    if not content or len(content) > 2000:
                        await safe_ws_send(ws, {"type": "error", "message": "Invalid message"})
                        continue

                    # Interrupt any ongoing speech
                    if session.is_speaking:
                        session.interrupt()
                        await safe_ws_send(ws, {"type": "speaking_end", "reason": "new_message"})

                    session.reset()

                    # Emotion analysis
                    emotion = analyze_emotion_simple(content)
                    if not await safe_ws_send(ws, {
                        "type": "emotion",
                        "emotion": emotion["dominant"],
                        "confidence": emotion["confidence"],
                    }):
                        connected = False
                        break

                    # Adjust mood based on emotion
                    current_mood = get_mood_from_emotion(emotion["dominant"])
                    session_moods[sid] = current_mood
                    mood_settings = MOOD_VOICE_SETTINGS.get(current_mood, MOOD_VOICE_SETTINGS["default"])

                    # FAST PATH: Check for cached quick response first
                    quick_response = response_cache.get_cached_response(content)

                    if quick_response:
                        # INSTANT response from cache - no LLM needed
                        print(f"⚡ Quick response for: {content[:30]}")
                        session.is_speaking = True
                        await safe_ws_send(ws, {"type": "speaking_start"})
                        await safe_ws_send(ws, {"type": "token", "content": quick_response})

                        try:
                            audio_data = await text_to_speech(
                                quick_response,
                                voice,
                                mood_settings["rate"],
                                mood_settings["pitch"]
                            )
                            if audio_data and not session.is_interrupted:
                                await safe_ws_send(ws, {"type": "audio_chunk", "size": len(audio_data)})
                                await safe_ws_send_bytes(ws, audio_data)
                        except Exception as e:
                            print(f"TTS error: {e}")

                        await safe_ws_send(ws, {"type": "response_end", "text": quick_response})
                        session.is_speaking = False
                        await safe_ws_send(ws, {"type": "speaking_end", "reason": "complete"})
                        session.reset()
                        continue

                    # NORMAL PATH: Stream LLM then TTS (sentence by sentence for low latency)
                    full_response = ""
                    current_sentence = ""
                    sentence_queue = []

                    # Collect LLM response and detect sentences
                    async for token in stream_llm(sid, content):
                        if session.is_interrupted or not connected:
                            break
                        full_response += token
                        current_sentence += token
                        if not await safe_ws_send(ws, {"type": "token", "content": token}):
                            connected = False
                            break

                        # Check for sentence end (. ! ?)
                        if re.search(r'[.!?]\s*$', current_sentence.strip()):
                            sentence_queue.append(current_sentence.strip())
                            current_sentence = ""

                    if not connected:
                        break

                    # Add remaining text if any
                    if current_sentence.strip():
                        sentence_queue.append(current_sentence.strip())

                    # Stream TTS sentence by sentence for low latency
                    if sentence_queue and not session.is_interrupted and connected:
                        session.is_speaking = True
                        await safe_ws_send(ws, {"type": "speaking_start"})

                        for sentence in sentence_queue:
                            if session.is_interrupted or not connected:
                                print(f"🛑 TTS interrupted at: {sentence[:30]}...")
                                break

                            try:
                                audio_data = await text_to_speech(
                                    sentence,
                                    voice,
                                    mood_settings["rate"],
                                    mood_settings["pitch"]
                                )
                                if audio_data and not session.is_interrupted and connected:
                                    if not await safe_ws_send(ws, {"type": "audio_chunk", "size": len(audio_data)}):
                                        connected = False
                                        break
                                    if not await safe_ws_send_bytes(ws, audio_data):
                                        connected = False
                                        break
                            except Exception as e:
                                print(f"TTS error: {e}")

                    if connected:
                        await safe_ws_send(ws, {"type": "response_end", "text": full_response})

                        if session.is_speaking and not session.is_interrupted:
                            session.is_speaking = False
                            await safe_ws_send(ws, {"type": "speaking_end", "reason": "complete"})

                    session.reset()

                elif msg_type == "ping":
                    await safe_ws_send(ws, {"type": "pong"})

            # Handle binary audio (voice input)
            elif "bytes" in msg:
                audio_data = msg["bytes"]

                # Interrupt Eva if she's speaking (user started talking)
                if session.is_speaking:
                    session.interrupt()
                    await safe_ws_send(ws, {"type": "speaking_end", "reason": "voice_input"})

                session.reset()

                if len(audio_data) > 5 * 1024 * 1024:
                    await safe_ws_send(ws, {"type": "error", "message": "Audio too large"})
                    continue

                # STT
                start = time.time()
                text = await transcribe_audio(audio_data)
                stt_time = (time.time() - start) * 1000

                if not text or "[" in text:
                    await safe_ws_send(ws, {"type": "error", "message": "Could not transcribe"})
                    continue

                if not await safe_ws_send(ws, {
                    "type": "transcript",
                    "text": text,
                    "stt_ms": round(stt_time)
                }):
                    connected = False
                    break

                # Analyze emotion
                emotion = analyze_emotion_simple(text)
                if not await safe_ws_send(ws, {
                    "type": "emotion",
                    "emotion": emotion["dominant"],
                    "confidence": emotion["confidence"],
                }):
                    connected = False
                    break

                current_mood = get_mood_from_emotion(emotion["dominant"])
                mood_settings = MOOD_VOICE_SETTINGS.get(current_mood, MOOD_VOICE_SETTINGS["default"])

                # FAST PATH: Check for cached quick response first
                quick_response = response_cache.get_cached_response(text)

                if quick_response:
                    # INSTANT response from cache - no LLM needed
                    print(f"⚡ Quick response (voice) for: {text[:30]}")
                    session.is_speaking = True
                    await safe_ws_send(ws, {"type": "speaking_start"})
                    await safe_ws_send(ws, {"type": "token", "content": quick_response})

                    try:
                        audio_data = await text_to_speech(
                            quick_response,
                            voice,
                            mood_settings["rate"],
                            mood_settings["pitch"]
                        )
                        if audio_data and not session.is_interrupted:
                            await safe_ws_send(ws, {"type": "audio_chunk", "size": len(audio_data)})
                            await safe_ws_send_bytes(ws, audio_data)
                    except Exception as e:
                        print(f"TTS error: {e}")

                    await safe_ws_send(ws, {"type": "response_end", "text": quick_response})
                    session.is_speaking = False
                    await safe_ws_send(ws, {"type": "speaking_end", "reason": "complete"})
                    session.reset()
                    continue

                # NORMAL PATH: Stream LLM then TTS (sentence by sentence for low latency)
                full_response = ""
                current_sentence = ""
                sentence_queue = []

                # Collect LLM response and detect sentences
                async for token in stream_llm(session_id, text):
                    if session.is_interrupted or not connected:
                        break
                    full_response += token
                    current_sentence += token
                    if not await safe_ws_send(ws, {"type": "token", "content": token}):
                        connected = False
                        break

                    # Check for sentence end (. ! ?)
                    if re.search(r'[.!?]\s*$', current_sentence.strip()):
                        sentence_queue.append(current_sentence.strip())
                        current_sentence = ""

                if not connected:
                    break

                # Add remaining text if any
                if current_sentence.strip():
                    sentence_queue.append(current_sentence.strip())

                # Stream TTS sentence by sentence for low latency
                if sentence_queue and not session.is_interrupted and connected:
                    session.is_speaking = True
                    await safe_ws_send(ws, {"type": "speaking_start"})

                    for sentence in sentence_queue:
                        if session.is_interrupted or not connected:
                            print(f"🛑 TTS interrupted at: {sentence[:30]}...")
                            break

                        try:
                            audio_data = await text_to_speech(
                                sentence,
                                voice,
                                mood_settings["rate"],
                                mood_settings["pitch"]
                            )
                            if audio_data and not session.is_interrupted and connected:
                                if not await safe_ws_send(ws, {"type": "audio_chunk", "size": len(audio_data)}):
                                    connected = False
                                    break
                                if not await safe_ws_send_bytes(ws, audio_data):
                                    connected = False
                                    break
                        except Exception as e:
                            print(f"TTS error: {e}")

                if connected:
                    await safe_ws_send(ws, {"type": "response_end", "text": full_response})

                    if session.is_speaking and not session.is_interrupted:
                        session.is_speaking = False
                        await safe_ws_send(ws, {"type": "speaking_end", "reason": "complete"})

                session.reset()

    except WebSocketDisconnect:
        print(f"🎙️ Interruptible session disconnected: {session_id}")
    except Exception as e:
        print(f"🎙️ Interruptible session error: {session_id} - {e}")
    finally:
        if session_id in voice_sessions:
            del voice_sessions[session_id]

# ============================================
# NATURAL SPEECH ENDPOINT (Fast TTS)
# ============================================

@app.post("/tts/natural")
async def tts_natural(request: Request, data: dict, _: str = Depends(verify_api_key)):
    """Natural speech TTS with faster rate and natural pauses.

    Optimized for conversational AI with:
    - Faster default rate (+15%)
    - Natural pause insertion
    - Streaming response
    """
    client_id = get_client_id(request)

    if not rate_limiter.is_allowed(client_id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    text = data.get("text", "")
    voice = data.get("voice", DEFAULT_VOICE)
    # Faster default for natural conversation
    rate = data.get("rate", "+15%")
    pitch = data.get("pitch", "+0Hz")

    if not text:
        raise HTTPException(status_code=400, detail="text required")

    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="text too long (max 1000 chars)")

    if voice not in VOICES:
        raise HTTPException(status_code=400, detail=f"Invalid voice. Available: {list(VOICES.keys())}")

    # Add natural pauses to text
    enhanced_text = add_natural_pauses(text)

    audio = await text_to_speech(enhanced_text, voice, rate, pitch)

    if not audio:
        raise HTTPException(status_code=503, detail="TTS not available")

    return StreamingResponse(
        io.BytesIO(audio),
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "inline; filename=eva_natural.mp3",
            "X-Rate-Limit-Remaining": str(rate_limiter.get_remaining(client_id))
        }
    )

def add_natural_pauses(text: str) -> str:
    """Add natural pauses and breathing marks to text.

    Inserts subtle pauses at natural speech points for more
    human-like delivery.
    """
    # Add micro-pauses after certain phrases
    pause_after = [
        (r'\.\.\.\s*', '... '),  # Already has pause
        (r',\s+', ', '),  # Comma pause
        (r';\s+', '; '),  # Semicolon pause
        (r':\s+', ': '),  # Colon pause
    ]

    result = text
    for pattern, replacement in pause_after:
        result = re.sub(pattern, replacement, result)

    return result


# ============================================
# DIRECT VOICE TEST ENDPOINT
# ============================================

@app.post("/tts/direct")
async def tts_direct(request: Request, data: dict):
    """Direct TTS endpoint for voice testing.
    
    Accepts any Edge-TTS voice ID directly (e.g., 'fr-FR-DeniseNeural').
    Used by the voice testing page to test all available voices.
    """
    text = data.get("text", "")
    voice_id = data.get("voice_id", "fr-FR-DeniseNeural")
    rate = data.get("rate", "+5%")
    pitch = data.get("pitch", "+0Hz")
    
    if not text:
        raise HTTPException(status_code=400, detail="text required")
    
    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="text too long (max 1000 chars)")
    
    try:
        import edge_tts
        
        # Generate TTS with direct voice ID
        communicate = edge_tts.Communicate(
            text,
            voice_id,
            rate=rate,
            pitch=pitch
        )
        
        # Collect audio chunks
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        
        if not audio_chunks:
            raise HTTPException(status_code=503, detail="No audio generated")
        
        audio_data = b"".join(audio_chunks)
        
        return StreamingResponse(
            io.BytesIO(audio_data),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": "inline; filename=voice_test.mp3",
            }
        )
    except Exception as e:
        print(f"Direct TTS error: {e}")
        raise HTTPException(status_code=503, detail=f"TTS error: {str(e)}")
