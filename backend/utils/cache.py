"""
Caching and rate limiting utilities for EVA-VOICE.

Provides:
- ResponseCache: Intelligent caching for common greetings/expressions
- TTSCache: LRU cache for TTS audio
- RateLimiter: Token bucket rate limiting per client
"""

import asyncio
import hashlib
import os
import random
import re
import time
from collections import defaultdict
from typing import Optional, Any


# Configuration from environment
RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", "60"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))


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
        "salut": [
            "Hey toi! Ca fait plaisir! Comment tu vas?",
            "Oh salut! Haha j'attendais que tu reviennes!",
            "Coucou! Alors, quoi de beau?",
        ],
        "hey": [
            "Hey! Raconte-moi tout!",
            "Oh hey! Ca va? Qu'est-ce qui se passe?",
            "Hey toi! Haha j'suis contente de te voir!",
        ],
        "coucou": [
            "Coucou! Haha t'as bien fait de venir!",
            "Oh coucou toi! Alors, quoi de neuf?",
            "Hey coucou! Ca va ou quoi?",
        ],
        "bonjour": [
            "Bonjour! Haha enfin! Comment tu vas aujourd'hui?",
            "Oh bonjour toi! Bien dormi?",
            "Bonjour! Alors, pret pour une bonne journee?",
        ],
        "bonsoir": [
            "Bonsoir! Alors, c'etait bien ta journee? Raconte!",
            "Oh bonsoir! Fatigue ou ca va?",
            "Hey bonsoir! Qu'est-ce que t'as fait de beau?",
        ],
        "hello": [
            "Hello! Haha t'es la! Comment ca va?",
            "Oh hello! Raconte-moi ta vie!",
            "Hello toi! Ca roule?",
        ],
        "yo": [
            "Yo! Quoi de neuf? Raconte!",
            "Hey yo! Ca va ou quoi?",
            "Yo! Alors, c'est quoi le programme?",
        ],
        "ca va": [
            "Ouais tranquille! Et toi, vraiment? Dis-moi tout!",
            "J'suis bien! Haha et toi alors?",
            "Ca va super! Mais toi, ca roule?",
        ],
        "merci": [
            "Haha avec plaisir! C'est rien du tout!",
            "Oh de rien! C'est normal!",
            "Pas de quoi! Haha t'es mignon!",
        ],
        "thanks": [
            "Haha pas de quoi!",
            "De rien! C'est avec plaisir!",
            "Oh arrete, c'est rien!",
        ],
        "bye": [
            "A plus! Haha reviens vite!",
            "Bye bye! Tu vas me manquer un peu!",
            "A bientot! Prends soin de toi!",
        ],
        "oui": [
            "Oh ouais? Raconte! J'veux savoir!",
            "Hmm... dis-m'en plus alors!",
            "Ok ok... et?",
        ],
        "non": [
            "Haha pourquoi non? Raconte!",
            "Ah bon? Comment ca?",
            "Non? Serieux? Explique!",
        ],
        "ok": [
            "Ok ok... mais encore? Haha j'suis curieuse!",
            "Hmm... et donc?",
            "D'accord... continue!",
        ],
        "ouais": [
            "Ouais ouais... raconte la suite!",
            "Hmm et alors?",
            "Ok... j'ecoute!",
        ],
        "mdr": [
            "Haha qu'est-ce qui te fait rire?",
            "Mdr! Raconte!",
            "Hihi c'est quoi?",
        ],
        "lol": [
            "Haha quoi? Dis-moi!",
            "Lol! C'est quoi le delire?",
            "Hihi raconte!",
        ],
        "haha": [
            "Haha! Quoi? Partage!",
            "C'est quoi qui te fait rire?",
            "Hihi dis-moi!",
        ],
        # More conversational patterns (synchronized with main.py)
        "test": [
            "Haha un test? T'es curieux toi!",
            "Test recu! Mais parle-moi de toi!",
            "Pfff encore un test! Hihi",
        ],
        "allo": [
            "Allo! J'suis la! Ca va?",
            "Hey allo! Haha qu'est-ce qui se passe?",
            "Allo allo! Parle-moi!",
        ],
        "quoi": [
            "Quoi quoi? Haha dis-moi!",
            "Hmm? Qu'est-ce qu'il y a?",
            "Quoi? J'ecoute!",
        ],
        "pourquoi": [
            "Pourquoi pas? Haha! Raconte!",
            "Bonne question! Et toi, pourquoi?",
            "Hmm pourquoi... c'est complique! Haha",
        ],
        "comment": [
            "Comment? Explique-moi mieux!",
            "Comment comment? Haha dis!",
            "Hmm comment quoi?",
        ],
        "cool": [
            "Trop cool! Raconte!",
            "Oh yeah cool! C'est quoi?",
            "Cool! J'veux savoir!",
        ],
        "super": [
            "Super! Dis-moi tout!",
            "Trop super! Et alors?",
            "Super super! Continue!",
        ],
        "bof": [
            "Bof? Ca va pas? Raconte...",
            "Oh bof... qu'est-ce qui se passe?",
            "Hmm bof... dis-moi ce qui va pas",
        ],
        "pas mal": [
            "Pas mal! Raconte plus!",
            "Oh pas mal! C'est quoi?",
            "Hmm pas mal pas mal... continue!",
        ],
        "qui es-tu": [
            "Moi? J'suis Eva! Ton amie virtuelle! Haha",
            "Eva, enchantee! Et toi, c'est quoi ton prenom?",
            "Je m'appelle Eva! On va bien s'entendre!",
        ],
        "tu es qui": [
            "C'est Eva! On se connait deja non? Hihi",
            "Eva! Ton amie prefere! Haha",
            "Qui je suis? Eva pardi! Et toi?",
        ],
        "quoi de neuf": [
            "Pas grand chose! Mais toi, raconte!",
            "Tranquille! Et toi alors?",
            "Rien de special... mais toi?",
        ],
        "tu fais quoi": [
            "La? Je t'attends! Haha",
            "Je discute avec toi! C'est cool non?",
            "Rien de special, j'suis la pour toi!",
        ],
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


class TTSCache:
    """LRU cache for TTS audio to avoid regenerating common phrases."""

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

    def set(self, text: str, voice: str, audio: bytes, rate: str = "+0%", pitch: str = "+0Hz") -> None:
        key = self._make_key(text, voice, rate, pitch)
        if key in self.cache:
            return

        # Evict oldest if full
        if len(self.cache) >= self.max_size:
            oldest = self.access_order.pop(0)
            del self.cache[oldest]

        self.cache[key] = audio
        self.access_order.append(key)


class RateLimiter:
    """Token bucket rate limiter per client."""

    def __init__(self):
        self.requests: dict[str, list[float]] = defaultdict(list)

    def is_allowed(
        self,
        client_id: str,
        limit: int = RATE_LIMIT_REQUESTS,
        window: int = RATE_LIMIT_WINDOW
    ) -> bool:
        now = time.time()
        # Clean old requests
        self.requests[client_id] = [t for t in self.requests[client_id] if now - t < window]

        if len(self.requests[client_id]) >= limit:
            return False

        self.requests[client_id].append(now)
        return True

    def get_remaining(
        self,
        client_id: str,
        limit: int = RATE_LIMIT_REQUESTS,
        window: int = RATE_LIMIT_WINDOW
    ) -> int:
        now = time.time()
        self.requests[client_id] = [t for t in self.requests[client_id] if now - t < window]
        return max(0, limit - len(self.requests[client_id]))


class SmartCache:
    """Advanced cache with TTL, statistics, and automatic cleanup.

    Features:
    - Per-key TTL (time-to-live)
    - Hit/miss statistics
    - Memory-aware eviction
    - Background cleanup
    - Namespaced keys for different cache types
    """

    def __init__(self, max_size: int = 1000, default_ttl: int = 3600):
        """Initialize SmartCache.

        Args:
            max_size: Maximum number of items
            default_ttl: Default TTL in seconds (1 hour)
        """
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.data: dict[str, tuple[Any, float, float]] = {}  # key -> (value, expire_time, access_time)
        self.stats = {
            "hits": 0,
            "misses": 0,
            "sets": 0,
            "evictions": 0,
            "expired": 0,
        }
        self._lock = asyncio.Lock() if asyncio else None

    def _make_key(self, namespace: str, key: str) -> str:
        """Create namespaced key."""
        return f"{namespace}:{key}"

    def get(self, namespace: str, key: str) -> Optional[Any]:
        """Get value from cache.

        Returns None if not found or expired.
        """
        full_key = self._make_key(namespace, key)
        now = time.time()

        if full_key in self.data:
            value, expire_time, _ = self.data[full_key]
            if expire_time > now:
                # Update access time
                self.data[full_key] = (value, expire_time, now)
                self.stats["hits"] += 1
                return value
            else:
                # Expired
                del self.data[full_key]
                self.stats["expired"] += 1

        self.stats["misses"] += 1
        return None

    def set(self, namespace: str, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """Set value in cache with optional TTL."""
        full_key = self._make_key(namespace, key)
        now = time.time()
        expire_time = now + (ttl or self.default_ttl)

        # Evict if at capacity
        if len(self.data) >= self.max_size and full_key not in self.data:
            self._evict_lru()

        self.data[full_key] = (value, expire_time, now)
        self.stats["sets"] += 1

    def delete(self, namespace: str, key: str) -> bool:
        """Delete key from cache. Returns True if key existed."""
        full_key = self._make_key(namespace, key)
        if full_key in self.data:
            del self.data[full_key]
            return True
        return False

    def _evict_lru(self) -> None:
        """Evict least recently used item."""
        if not self.data:
            return

        # Find LRU key
        lru_key = min(self.data.keys(), key=lambda k: self.data[k][2])
        del self.data[lru_key]
        self.stats["evictions"] += 1

    def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns count of removed items."""
        now = time.time()
        expired_keys = [k for k, (_, exp, _) in self.data.items() if exp <= now]

        for key in expired_keys:
            del self.data[key]

        self.stats["expired"] += len(expired_keys)
        return len(expired_keys)

    def get_stats(self) -> dict:
        """Get cache statistics."""
        total = self.stats["hits"] + self.stats["misses"]
        hit_rate = (self.stats["hits"] / total * 100) if total > 0 else 0

        return {
            **self.stats,
            "size": len(self.data),
            "max_size": self.max_size,
            "hit_rate_percent": round(hit_rate, 2),
            "total_requests": total,
        }

    def clear(self) -> None:
        """Clear all cache entries."""
        self.data.clear()

    def get_or_set(self, namespace: str, key: str, factory: callable, ttl: Optional[int] = None) -> Any:
        """Get value or compute and cache it using factory function."""
        value = self.get(namespace, key)
        if value is not None:
            return value

        value = factory()
        self.set(namespace, key, value, ttl)
        return value


class ConversationAnalytics:
    """Track conversation analytics and metrics.

    Provides real-time insights into:
    - Response times
    - User engagement
    - Popular topics
    - Emotion trends
    """

    def __init__(self, window_size: int = 1000):
        """Initialize analytics tracker.

        Args:
            window_size: Number of events to keep in sliding window
        """
        self.window_size = window_size
        self.response_times: list[float] = []
        self.emotions: list[str] = []
        self.topics: dict[str, int] = defaultdict(int)
        self.message_lengths: list[int] = []
        self.session_count = 0
        self.total_messages = 0
        self.start_time = time.time()

    def record_response(
        self,
        response_time_ms: float,
        message_length: int,
        detected_emotion: str = "neutral",
        topics: Optional[list[str]] = None
    ) -> None:
        """Record a response event."""
        # Sliding window for response times
        self.response_times.append(response_time_ms)
        if len(self.response_times) > self.window_size:
            self.response_times.pop(0)

        # Track emotions
        self.emotions.append(detected_emotion)
        if len(self.emotions) > self.window_size:
            self.emotions.pop(0)

        # Track message lengths
        self.message_lengths.append(message_length)
        if len(self.message_lengths) > self.window_size:
            self.message_lengths.pop(0)

        # Track topics
        if topics:
            for topic in topics:
                self.topics[topic] += 1

        self.total_messages += 1

    def record_session_start(self) -> None:
        """Record a new session start."""
        self.session_count += 1

    def get_metrics(self) -> dict:
        """Get current analytics metrics."""
        uptime = time.time() - self.start_time

        # Response time stats
        rt = self.response_times
        avg_rt = sum(rt) / len(rt) if rt else 0
        p50_rt = sorted(rt)[len(rt) // 2] if rt else 0
        p95_rt = sorted(rt)[int(len(rt) * 0.95)] if len(rt) > 10 else avg_rt
        p99_rt = sorted(rt)[int(len(rt) * 0.99)] if len(rt) > 100 else p95_rt

        # Emotion distribution
        emotion_counts = defaultdict(int)
        for e in self.emotions:
            emotion_counts[e] += 1
        total_emotions = len(self.emotions) or 1
        emotion_dist = {k: round(v / total_emotions * 100, 1) for k, v in emotion_counts.items()}

        # Top topics
        top_topics = sorted(self.topics.items(), key=lambda x: x[1], reverse=True)[:10]

        # Message length stats
        ml = self.message_lengths
        avg_length = sum(ml) / len(ml) if ml else 0

        return {
            "uptime_seconds": round(uptime, 0),
            "total_messages": self.total_messages,
            "total_sessions": self.session_count,
            "messages_per_minute": round(self.total_messages / (uptime / 60), 2) if uptime > 0 else 0,
            "response_time": {
                "avg_ms": round(avg_rt, 2),
                "p50_ms": round(p50_rt, 2),
                "p95_ms": round(p95_rt, 2),
                "p99_ms": round(p99_rt, 2),
                "samples": len(rt),
            },
            "emotion_distribution": emotion_dist,
            "top_topics": [{"topic": t, "count": c} for t, c in top_topics],
            "avg_message_length": round(avg_length, 1),
        }

    def reset(self) -> None:
        """Reset all analytics."""
        self.response_times.clear()
        self.emotions.clear()
        self.topics.clear()
        self.message_lengths.clear()
        self.session_count = 0
        self.total_messages = 0
        self.start_time = time.time()


# Singleton instances
response_cache = ResponseCache()
tts_cache = TTSCache(max_size=200)
rate_limiter = RateLimiter()
smart_cache = SmartCache(max_size=1000, default_ttl=3600)
analytics = ConversationAnalytics(window_size=1000)
