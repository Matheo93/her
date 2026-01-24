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


# =============================================================================
# EVA EXPRESSION TESTS
# =============================================================================

class TestEvaExpressionDataStructures:
    """Tests for eva_expression.py data structures."""

    def test_emotion_dataclass(self):
        """Test Emotion dataclass."""
        from eva_expression import Emotion

        emotion = Emotion(
            name="joy",
            intensity=0.8,
            voice_speed=1.1,
            voice_pitch=2,
            animation="smile_big"
        )

        assert emotion.name == "joy"
        assert emotion.intensity == 0.8
        assert emotion.voice_speed == 1.1
        assert emotion.voice_pitch == 2
        assert emotion.animation == "smile_big"

    def test_emotions_dict(self):
        """Test EMOTIONS dictionary contains all expected emotions."""
        from eva_expression import EMOTIONS

        expected_emotions = [
            "joy", "excitement", "tenderness", "sadness",
            "surprise", "curiosity", "playful", "empathy",
            "thoughtful", "neutral"
        ]

        for emotion in expected_emotions:
            assert emotion in EMOTIONS
            assert EMOTIONS[emotion].name == emotion

    def test_emotion_patterns_dict(self):
        """Test EMOTION_PATTERNS dictionary has patterns for emotions."""
        from eva_expression import EMOTION_PATTERNS_COMPILED

        assert "joy" in EMOTION_PATTERNS_COMPILED
        assert "sadness" in EMOTION_PATTERNS_COMPILED

        # Each emotion should have at least one compiled pattern
        for emotion, patterns in EMOTION_PATTERNS_COMPILED.items():
            assert len(patterns) > 0


class TestEvaExpressionSystem:
    """Tests for EvaExpressionSystem class."""

    def test_system_creation(self):
        """Test system can be created."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()

        assert system is not None
        assert system._initialized is False
        assert system._breathing_sounds == {}
        assert system._emotion_sounds == {}

    def test_system_init_without_tts(self):
        """Test init returns False when TTS not available."""
        from eva_expression import EvaExpressionSystem
        import eva_expression

        # Temporarily disable ultra_fast_tts
        original_tts = eva_expression.ultra_fast_tts
        eva_expression.ultra_fast_tts = None

        try:
            system = EvaExpressionSystem()
            result = system.init()

            # Should return False when TTS not available
            assert result is False
            assert system._initialized is False
        finally:
            # Restore
            eva_expression.ultra_fast_tts = original_tts


class TestEvaExpressionDetection:
    """Tests for emotion detection in EvaExpressionSystem."""

    def test_detect_emotion_joy(self):
        """Test detecting joy emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("Haha, j'adore ça !")

        assert emotion.name == "joy"
        assert emotion.intensity > 0

    def test_detect_emotion_sadness(self):
        """Test detecting sadness emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("C'est triste, snif...")

        assert emotion.name == "sadness"

    def test_detect_emotion_surprise(self):
        """Test detecting surprise emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("QUOI?! Attends, sérieux?")

        assert emotion.name == "surprise"

    def test_detect_emotion_curiosity(self):
        """Test detecting curiosity emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("Raconte-moi ! Pourquoi ?")

        assert emotion.name == "curiosity"

    def test_detect_emotion_neutral(self):
        """Test neutral emotion for plain text."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("Le ciel est bleu.")

        assert emotion.name == "neutral"

    def test_detect_emotion_intensity_scales(self):
        """Test intensity scales with number of matches."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()

        # More matches = higher intensity
        low = system.detect_emotion("haha")
        high = system.detect_emotion("haha haha haha j'adore super cool")

        assert high.intensity >= low.intensity


class TestEvaExpressionVoiceParams:
    """Tests for voice parameter generation."""

    def test_get_voice_params_positive_pitch(self):
        """Test voice params with positive pitch."""
        from eva_expression import EvaExpressionSystem, EMOTIONS

        system = EvaExpressionSystem()
        params = system.get_voice_params(EMOTIONS["joy"])

        assert "rate" in params
        assert "pitch" in params
        assert params["pitch"].startswith("+")

    def test_get_voice_params_negative_pitch(self):
        """Test voice params with negative pitch."""
        from eva_expression import EvaExpressionSystem, EMOTIONS

        system = EvaExpressionSystem()
        params = system.get_voice_params(EMOTIONS["sadness"])

        assert params["pitch"].startswith("-")

    def test_get_voice_params_neutral(self):
        """Test voice params for neutral emotion."""
        from eva_expression import EvaExpressionSystem, EMOTIONS

        system = EvaExpressionSystem()
        params = system.get_voice_params(EMOTIONS["neutral"])

        assert params["pitch"] == "+0Hz"


class TestEvaExpressionAnimations:
    """Tests for animation suggestions."""

    def test_get_animation_suggestion_basic(self):
        """Test basic animation suggestion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("Bonjour")

        assert len(animations) >= 1
        assert "type" in animations[0]
        assert "intensity" in animations[0]
        assert "duration" in animations[0]

    def test_get_animation_suggestion_question(self):
        """Test animation for question mark."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("Comment ça va ?")

        types = [a["type"] for a in animations]
        assert "head_tilt" in types

    def test_get_animation_suggestion_exclamation(self):
        """Test animation for exclamation mark."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("Super !")

        types = [a["type"] for a in animations]
        assert "eyebrows_up" in types

    def test_get_animation_suggestion_negative(self):
        """Test animation for negative words."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("Non, jamais")

        types = [a["type"] for a in animations]
        assert "head_shake" in types

    def test_get_animation_suggestion_affirmative(self):
        """Test animation for affirmative words."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("Oui bien sûr")

        types = [a["type"] for a in animations]
        assert "nod" in types


class TestEvaExpressionProcess:
    """Tests for full expression processing."""

    def test_process_for_expression(self):
        """Test full expression processing."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        result = system.process_for_expression("Haha super !")

        assert "emotion" in result
        assert "intensity" in result
        assert "voice_params" in result
        assert "animations" in result


class TestEvaExpressionBreathingSounds:
    """Tests for breathing sound generation."""

    def test_get_breathing_sound_no_sounds(self):
        """Test get_breathing_sound returns None when no sounds."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        # No sounds loaded (not initialized)
        result = system.get_breathing_sound()

        assert result is None

    def test_get_breathing_sound_with_sounds(self):
        """Test get_breathing_sound with loaded sounds."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        # Simulate loaded sounds
        system._breathing_sounds = {
            "inhale": b"test_audio",
            "exhale_soft": b"test_audio2",
        }

        result = system.get_breathing_sound("before_speech")
        assert result is not None

    def test_get_breathing_sound_after_speech(self):
        """Test get_breathing_sound for after_speech context."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._breathing_sounds = {
            "exhale_soft": b"audio1",
            "sigh": b"audio2",
        }

        result = system.get_breathing_sound("after_speech")
        assert result is not None

    def test_get_breathing_sound_thinking(self):
        """Test get_breathing_sound for thinking context."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._breathing_sounds = {
            "exhale_thinking": b"audio",
            "inhale": b"audio2",
        }

        result = system.get_breathing_sound("thinking")
        assert result is not None

    def test_get_breathing_sound_random(self):
        """Test get_breathing_sound for random context."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._breathing_sounds = {
            "inhale": b"audio",
        }

        result = system.get_breathing_sound("random")
        assert result is not None


class TestEvaExpressionEmotionSounds:
    """Tests for emotion sound generation."""

    def test_get_emotion_sound_no_sounds(self):
        """Test get_emotion_sound returns None when no sounds."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        result = system.get_emotion_sound("joy")

        assert result is None

    def test_get_emotion_sound_joy(self):
        """Test get_emotion_sound for joy."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._emotion_sounds = {
            "laugh_soft": b"audio",
            "laugh": b"audio2",
        }

        result = system.get_emotion_sound("joy")
        assert result is not None

    def test_get_emotion_sound_excitement(self):
        """Test get_emotion_sound for excitement."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._emotion_sounds = {
            "surprise": b"audio",
            "interest": b"audio2",
        }

        result = system.get_emotion_sound("excitement")
        assert result is not None

    def test_get_emotion_sound_surprise(self):
        """Test get_emotion_sound for surprise."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._emotion_sounds = {
            "surprise": b"audio",
        }

        result = system.get_emotion_sound("surprise")
        assert result is not None

    def test_get_emotion_sound_playful(self):
        """Test get_emotion_sound for playful."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._emotion_sounds = {
            "playful": b"audio",
            "laugh_soft": b"audio2",
        }

        result = system.get_emotion_sound("playful")
        assert result is not None

    def test_get_emotion_sound_thoughtful(self):
        """Test get_emotion_sound for thoughtful."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._emotion_sounds = {
            "thinking": b"audio",
        }

        result = system.get_emotion_sound("thoughtful")
        assert result is not None

    def test_get_emotion_sound_curiosity(self):
        """Test get_emotion_sound for curiosity."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._emotion_sounds = {
            "interest": b"audio",
            "thinking": b"audio2",
        }

        result = system.get_emotion_sound("curiosity")
        assert result is not None

    def test_get_emotion_sound_unknown(self):
        """Test get_emotion_sound for unknown emotion defaults to thinking."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._emotion_sounds = {
            "thinking": b"audio",
        }

        result = system.get_emotion_sound("unknown_emotion")
        assert result is not None


class TestEvaExpressionGlobalFunctions:
    """Tests for global utility functions."""

    def test_detect_emotion_function(self):
        """Test global detect_emotion function."""
        from eva_expression import detect_emotion

        emotion = detect_emotion("J'adore !")

        assert emotion.name == "joy"

    def test_get_expression_data_function(self):
        """Test global get_expression_data function."""
        from eva_expression import get_expression_data

        data = get_expression_data("Super cool !")

        assert "emotion" in data
        assert "voice_params" in data

    def test_init_expression_system_function(self):
        """Test global init_expression_system function."""
        from eva_expression import init_expression_system
        import eva_expression

        # Save original
        original_tts = eva_expression.ultra_fast_tts

        try:
            # Disable TTS to avoid actual initialization
            eva_expression.ultra_fast_tts = None
            result = init_expression_system()
            assert result is False
        finally:
            eva_expression.ultra_fast_tts = original_tts


class TestEvaExpressionHelpers:
    """Tests for helper functions in eva_expression.py."""

    def test_emotion_valid_parameters(self):
        """Test emotions have valid voice parameters."""
        from eva_expression import EMOTIONS

        for name, emotion in EMOTIONS.items():
            # Intensity should be 0-1
            assert 0.0 <= emotion.intensity <= 1.0

            # Voice speed should be reasonable
            assert 0.5 <= emotion.voice_speed <= 2.0

            # Voice pitch should be reasonable
            assert -10 <= emotion.voice_pitch <= 10

            # Animation should be non-empty
            assert len(emotion.animation) > 0


# =============================================================================
# EVA MICRO EXPRESSIONS TESTS
# =============================================================================

class TestMicroExpressionEnums:
    """Tests for micro expression enums."""

    def test_blink_type_enum(self):
        """Test BlinkType enum values."""
        from eva_micro_expressions import BlinkType

        assert BlinkType.NORMAL.value == "normal"
        assert BlinkType.SLOW.value == "slow"
        assert BlinkType.DOUBLE.value == "double"
        assert BlinkType.HALF.value == "half"
        assert BlinkType.LONG.value == "long"

    def test_gaze_direction_enum(self):
        """Test GazeDirection enum values."""
        from eva_micro_expressions import GazeDirection

        assert GazeDirection.CENTER.value == "center"
        assert GazeDirection.UP_LEFT.value == "up_left"
        assert GazeDirection.UP_RIGHT.value == "up_right"
        assert GazeDirection.DOWN_LEFT.value == "down_left"
        assert GazeDirection.DOWN_RIGHT.value == "down_right"


class TestMicroExpressionDataclasses:
    """Tests for micro expression dataclasses."""

    def test_micro_expression_creation(self):
        """Test MicroExpression dataclass."""
        from eva_micro_expressions import MicroExpression

        expr = MicroExpression(
            type="blink",
            target="eyes",
            value=1.0,
            duration=0.15
        )

        assert expr.type == "blink"
        assert expr.target == "eyes"
        assert expr.value == 1.0
        assert expr.duration == 0.15
        assert expr.easing == "ease_out"  # default
        assert expr.delay == 0.0  # default

    def test_micro_expression_with_easing(self):
        """Test MicroExpression with custom easing."""
        from eva_micro_expressions import MicroExpression

        expr = MicroExpression(
            type="smile",
            target="mouth",
            value=0.5,
            duration=0.3,
            easing="ease_in_out",
            delay=0.1
        )

        assert expr.easing == "ease_in_out"
        assert expr.delay == 0.1

    def test_expression_frame_creation(self):
        """Test ExpressionFrame dataclass."""
        from eva_micro_expressions import ExpressionFrame, MicroExpression

        frame = ExpressionFrame(timestamp=0.0)

        assert frame.timestamp == 0.0
        assert frame.expressions == []

    def test_expression_frame_with_expressions(self):
        """Test ExpressionFrame with expressions list."""
        from eva_micro_expressions import ExpressionFrame, MicroExpression

        expr1 = MicroExpression("blink", "eyes", 1.0, 0.15)
        expr2 = MicroExpression("smile", "mouth", 0.3, 0.5)

        frame = ExpressionFrame(
            timestamp=1.0,
            expressions=[expr1, expr2]
        )

        assert frame.timestamp == 1.0
        assert len(frame.expressions) == 2
        assert frame.expressions[0].type == "blink"
        assert frame.expressions[1].type == "smile"


class TestMicroExpressionSystems:
    """Tests for micro expression system classes."""

    def test_blinking_system_creation(self):
        """Test BlinkingSystem can be created."""
        from eva_micro_expressions import BlinkingSystem

        system = BlinkingSystem()

        assert system is not None
        # Check default state
        assert system.last_blink >= 0
        assert system.current_state == "neutral"

    def test_blinking_system_patterns(self):
        """Test BlinkingSystem has patterns."""
        from eva_micro_expressions import BlinkingSystem

        assert "neutral" in BlinkingSystem.BLINK_PATTERNS
        assert "attentive" in BlinkingSystem.BLINK_PATTERNS
        assert "thinking" in BlinkingSystem.BLINK_PATTERNS

    def test_gaze_system_creation(self):
        """Test GazeSystem can be created."""
        from eva_micro_expressions import GazeSystem

        system = GazeSystem()

        assert system is not None

    def test_micro_smile_system_creation(self):
        """Test MicroSmileSystem can be created."""
        from eva_micro_expressions import MicroSmileSystem

        system = MicroSmileSystem()

        assert system is not None

    def test_gaze_direction_values(self):
        """Test all gaze directions are unique."""
        from eva_micro_expressions import GazeDirection

        values = [d.value for d in GazeDirection]
        assert len(values) == len(set(values))  # All unique

    def test_eva_engine_creation(self):
        """Test EvaMicroExpressionEngine can be created."""
        from eva_micro_expressions import EvaMicroExpressionEngine

        engine = EvaMicroExpressionEngine()

        assert engine is not None
