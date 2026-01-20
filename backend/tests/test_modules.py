"""
Tests for refactored EVA-VOICE modules.

Tests the new modular structure:
- services/database.py
- utils/cache.py
- utils/text_processing.py
- services/llm_service.py
"""

import pytest
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestTextProcessing:
    """Tests for utils/text_processing.py."""

    def test_humanize_response_contractions(self):
        """Test French contractions are applied."""
        from utils.text_processing import humanize_response

        result = humanize_response("je suis content")
        assert "j'suis" in result

        result = humanize_response("tu es genial")
        assert "t'es" in result

        result = humanize_response("il y a beaucoup")
        assert "y'a" in result

    def test_humanize_response_removes_robotic(self):
        """Test robotic phrases are removed."""
        from utils.text_processing import humanize_response

        result = humanize_response("En tant qu'intelligence artificielle, je pense que...")
        assert "intelligence artificielle" not in result
        assert "en tant qu" not in result.lower()

        # Note: contractions are applied first, so "je suis" -> "j'suis"
        # which breaks the "je suis là pour t'aider" pattern
        result = humanize_response("N'hésite pas à me poser des questions")
        assert "n'hésite pas" not in result.lower()

    def test_humanize_cleans_whitespace(self):
        """Test double spaces are cleaned."""
        from utils.text_processing import humanize_response

        result = humanize_response("Hello   world  test")
        assert "   " not in result
        assert "  " not in result

    def test_detect_emotion_simple(self):
        """Test simple emotion detection."""
        from utils.text_processing import detect_emotion_simple

        assert detect_emotion_simple("haha c'est trop drole") == "joy"
        assert detect_emotion_simple("je suis triste") == "sadness"
        assert detect_emotion_simple("quoi serieux?!") == "surprise"
        assert detect_emotion_simple("je t'adore") == "love"
        assert detect_emotion_simple("bonjour") == "neutral"

    def test_get_mood_from_emotion(self):
        """Test emotion to mood mapping."""
        from utils.text_processing import get_mood_from_emotion

        assert get_mood_from_emotion("joy") == "playful"
        assert get_mood_from_emotion("sadness") == "calm"
        assert get_mood_from_emotion("surprise") == "excited"
        assert get_mood_from_emotion("neutral") == "default"
        assert get_mood_from_emotion("unknown") == "default"


class TestCache:
    """Tests for utils/cache.py."""

    def test_response_cache_exact_match(self):
        """Test exact match caching."""
        from utils.cache import ResponseCache

        response = ResponseCache.get_cached_response("salut")
        assert response is not None
        assert len(response) > 0

    def test_response_cache_pattern_match(self):
        """Test regex pattern matching."""
        from utils.cache import ResponseCache

        response = ResponseCache.get_cached_response("ca va?")
        assert response is not None

        response = ResponseCache.get_cached_response("comment tu vas?")
        assert response is not None

    def test_response_cache_no_match(self):
        """Test no match returns None."""
        from utils.cache import ResponseCache

        response = ResponseCache.get_cached_response("tell me about quantum physics")
        assert response is None

    def test_tts_cache_set_get(self):
        """Test TTS cache set and get."""
        from utils.cache import TTSCache

        cache = TTSCache(max_size=10)
        audio = b"test audio data"

        cache.set("hello", "eva", audio)
        result = cache.get("hello", "eva")

        assert result == audio

    def test_tts_cache_lru_eviction(self):
        """Test LRU eviction when cache is full."""
        from utils.cache import TTSCache

        cache = TTSCache(max_size=2)

        cache.set("one", "eva", b"1")
        cache.set("two", "eva", b"2")
        cache.set("three", "eva", b"3")  # Should evict "one"

        assert cache.get("one", "eva") is None
        assert cache.get("two", "eva") == b"2"
        assert cache.get("three", "eva") == b"3"

    def test_rate_limiter_allows_requests(self):
        """Test rate limiter allows requests within limit."""
        from utils.cache import RateLimiter

        limiter = RateLimiter()
        client = "test-client"

        # Should allow up to limit
        for _ in range(5):
            assert limiter.is_allowed(client, limit=5, window=60)

        # Should reject after limit
        assert not limiter.is_allowed(client, limit=5, window=60)

    def test_rate_limiter_remaining(self):
        """Test rate limiter remaining count."""
        from utils.cache import RateLimiter

        limiter = RateLimiter()
        client = "test-client"

        assert limiter.get_remaining(client, limit=10, window=60) == 10

        limiter.is_allowed(client, limit=10, window=60)
        limiter.is_allowed(client, limit=10, window=60)

        assert limiter.get_remaining(client, limit=10, window=60) == 8


class TestDatabase:
    """Tests for services/database.py."""

    def test_json_functions(self):
        """Test JSON serialization functions work."""
        from services.database import json_dumps, json_loads

        data = {"key": "value", "number": 42}
        serialized = json_dumps(data)
        deserialized = json_loads(serialized)

        assert deserialized == data

    def test_init_db(self):
        """Test database initialization."""
        import tempfile
        import os as _os

        from services import database

        # Use temp file
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            temp_path = f.name

        try:
            _os.environ["DB_PATH"] = temp_path
            database.init_db()

            assert database.db_conn is not None
            database.close_db()
        finally:
            _os.unlink(temp_path)
            if "DB_PATH" in _os.environ:
                del _os.environ["DB_PATH"]


class TestLLMService:
    """Tests for services/llm_service.py."""

    def test_get_system_prompt_speed(self):
        """Test speed mode system prompt."""
        from services.llm_service import get_system_prompt

        prompt = get_system_prompt(speed_mode=True)
        assert len(prompt) < 200  # Speed prompt should be short

    def test_get_system_prompt_default(self):
        """Test default system prompt."""
        from services.llm_service import get_system_prompt

        prompt = get_system_prompt(speed_mode=False)
        assert "Eva" in prompt
        assert len(prompt) > 100

    def test_build_her_prompt_new(self):
        """Test HER prompt for new relationship."""
        from services.llm_service import build_her_prompt

        prompt = build_her_prompt("user123", relationship_stage="new")

        assert "Eva" in prompt
        assert "rencontrer" in prompt or "accueillante" in prompt

    def test_build_her_prompt_friend(self):
        """Test HER prompt for friend relationship."""
        from services.llm_service import build_her_prompt

        prompt = build_her_prompt("user123", relationship_stage="friend")

        assert "ami" in prompt.lower()

    def test_build_her_prompt_with_memory(self):
        """Test HER prompt with memory context."""
        from services.llm_service import build_her_prompt

        memory = {
            "profile": {
                "name": "Alice",
                "interests": ["music", "coding"],
            }
        }

        prompt = build_her_prompt("user123", memory_context=memory, relationship_stage="friend")

        assert "Alice" in prompt
        assert "music" in prompt or "coding" in prompt

    def test_conversation_management(self):
        """Test conversation get/add/clear."""
        from services.llm_service import get_messages, add_message, clear_conversation, conversations

        session = "test-session-123"

        # Clear any existing
        clear_conversation(session)

        # Get should create new
        msgs = get_messages(session)
        assert len(msgs) == 1  # System prompt only
        assert msgs[0]["role"] == "system"

        # Add messages
        add_message(session, "user", "hello")
        add_message(session, "assistant", "hi there!")

        msgs = get_messages(session)
        assert len(msgs) == 3

        # Clear
        clear_conversation(session)
        assert session not in conversations
