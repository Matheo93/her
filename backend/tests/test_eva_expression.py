"""
Tests for eva_expression.py - Expression System.

Tests the EVA expression features:
- Emotion detection
- Voice parameters
- Animation suggestions
- Breathing sounds
"""

import pytest
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestEmotionDataclass:
    """Tests for Emotion dataclass."""

    def test_emotion_creation(self):
        """Test Emotion dataclass creation."""
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


class TestEmotionsDict:
    """Tests for EMOTIONS dictionary."""

    def test_all_emotions_defined(self):
        """Test all expected emotions are defined."""
        from eva_expression import EMOTIONS

        expected = [
            "joy", "excitement", "tenderness", "sadness", "surprise",
            "curiosity", "playful", "empathy", "thoughtful", "neutral"
        ]

        for name in expected:
            assert name in EMOTIONS
            emotion = EMOTIONS[name]
            assert emotion.name == name
            assert 0 <= emotion.intensity <= 1
            assert 0.8 <= emotion.voice_speed <= 1.3
            assert -5 <= emotion.voice_pitch <= 5

    def test_neutral_emotion_baseline(self):
        """Test neutral emotion has baseline values."""
        from eva_expression import EMOTIONS

        neutral = EMOTIONS["neutral"]
        assert neutral.voice_speed == 1.0
        assert neutral.voice_pitch == 0
        assert neutral.animation == "idle"


class TestEmotionPatterns:
    """Tests for emotion patterns configuration."""

    def test_patterns_compiled(self):
        """Test patterns are pre-compiled."""
        from eva_expression import EMOTION_PATTERNS_COMPILED
        import re

        for emotion, patterns in EMOTION_PATTERNS_COMPILED.items():
            assert len(patterns) > 0
            for pattern in patterns:
                assert isinstance(pattern, re.Pattern)

    def test_joy_patterns_match(self):
        """Test joy patterns match expected text."""
        from eva_expression import EMOTION_PATTERNS_COMPILED

        joy_patterns = EMOTION_PATTERNS_COMPILED["joy"]
        matches = 0
        for pattern in joy_patterns:
            if pattern.search("haha c'est génial"):
                matches += 1

        assert matches >= 2  # "haha" and "génial"


class TestFrozensets:
    """Tests for pre-computed frozensets."""

    def test_negative_words_exist(self):
        """Test negative words frozenset."""
        from eva_expression import _NEGATIVE_WORDS

        assert "non" in _NEGATIVE_WORDS
        assert "pas" in _NEGATIVE_WORDS
        assert "jamais" in _NEGATIVE_WORDS

    def test_affirmative_words_exist(self):
        """Test affirmative words frozenset."""
        from eva_expression import _AFFIRMATIVE_WORDS

        assert "oui" in _AFFIRMATIVE_WORDS
        assert "ouais" in _AFFIRMATIVE_WORDS


class TestEvaExpressionSystem:
    """Tests for EvaExpressionSystem class."""

    def test_init(self):
        """Test EvaExpressionSystem initialization."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()

        assert system._initialized is False
        assert system._breathing_sounds == {}
        assert system._emotion_sounds == {}


class TestDetectEmotion:
    """Tests for detect_emotion method."""

    def test_detect_joy(self):
        """Test detecting joy emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("haha c'est trop bien!")

        assert emotion.name == "joy"
        assert emotion.intensity > 0

    def test_detect_sadness(self):
        """Test detecting sadness emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("c'est triste, malheureusement")

        assert emotion.name == "sadness"

    def test_detect_surprise(self):
        """Test detecting surprise emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("quoi?! sérieux?")

        assert emotion.name == "surprise"

    def test_detect_curiosity(self):
        """Test detecting curiosity emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("raconte-moi comment ça marche")

        assert emotion.name == "curiosity"

    def test_detect_neutral(self):
        """Test detecting neutral when no pattern matches."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("le ciel est bleu")

        assert emotion.name == "neutral"

    def test_detect_excitement(self):
        """Test detecting excitement emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("waouh!!! c'est incroyable!!!")

        assert emotion.name == "excitement"

    def test_detect_playful(self):
        """Test detecting playful emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("hihi voyons voir 😏")

        # May detect joy or playful depending on pattern priority
        assert emotion.name in ["playful", "joy"]

    def test_detect_empathy(self):
        """Test detecting empathy emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("je comprends, c'est dur")

        assert emotion.name == "empathy"

    def test_detect_thoughtful(self):
        """Test detecting thoughtful emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        emotion = system.detect_emotion("hmm intéressant, je pense que...")

        assert emotion.name == "thoughtful"

    def test_intensity_scales_with_matches(self):
        """Test intensity increases with more matches."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()

        single = system.detect_emotion("haha")
        multiple = system.detect_emotion("haha hihi mdr génial super")

        assert multiple.intensity >= single.intensity


class TestGetVoiceParams:
    """Tests for get_voice_params method."""

    def test_voice_params_joy(self):
        """Test voice params for joy emotion."""
        from eva_expression import EvaExpressionSystem, EMOTIONS

        system = EvaExpressionSystem()
        params = system.get_voice_params(EMOTIONS["joy"])

        assert "rate" in params
        assert "pitch" in params
        assert "+" in params["rate"]  # Faster speech
        assert "+" in params["pitch"]  # Higher pitch

    def test_voice_params_sadness(self):
        """Test voice params for sadness emotion."""
        from eva_expression import EvaExpressionSystem, EMOTIONS

        system = EvaExpressionSystem()
        params = system.get_voice_params(EMOTIONS["sadness"])

        assert "-" in params["rate"]  # Slower speech
        assert "-" in params["pitch"]  # Lower pitch

    def test_voice_params_neutral(self):
        """Test voice params for neutral emotion."""
        from eva_expression import EvaExpressionSystem, EMOTIONS

        system = EvaExpressionSystem()
        params = system.get_voice_params(EMOTIONS["neutral"])

        assert params["rate"] == "+0%"
        assert params["pitch"] == "+0Hz"


class TestGetAnimationSuggestion:
    """Tests for get_animation_suggestion method."""

    def test_animation_suggestion_basic(self):
        """Test basic animation suggestion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("bonjour")

        assert len(animations) >= 1
        assert "type" in animations[0]
        assert "intensity" in animations[0]
        assert "duration" in animations[0]

    def test_animation_question_mark(self):
        """Test animation for question."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("comment vas-tu?")

        types = [a["type"] for a in animations]
        assert "head_tilt" in types

    def test_animation_exclamation(self):
        """Test animation for exclamation."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("super!")

        types = [a["type"] for a in animations]
        assert "eyebrows_up" in types

    def test_animation_negative_words(self):
        """Test animation for negative words."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("non pas jamais")

        types = [a["type"] for a in animations]
        assert "head_shake" in types

    def test_animation_affirmative_words(self):
        """Test animation for affirmative words."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        animations = system.get_animation_suggestion("oui bien sûr")

        types = [a["type"] for a in animations]
        assert "nod" in types


class TestGetBreathingSound:
    """Tests for get_breathing_sound method."""

    def test_breathing_no_sounds_initialized(self):
        """Test breathing sound when not initialized."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        sound = system.get_breathing_sound()

        assert sound is None

    def test_breathing_context_before_speech(self):
        """Test breathing context selection."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        # Manually add some sounds
        system._breathing_sounds = {
            "inhale": b"audio",
            "exhale_thinking": b"audio2"
        }

        sound = system.get_breathing_sound("before_speech")

        assert sound in [b"audio", b"audio2"]

    def test_breathing_context_after_speech(self):
        """Test breathing context after speech."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._breathing_sounds = {
            "exhale_soft": b"audio1",
            "sigh": b"audio2"
        }

        sound = system.get_breathing_sound("after_speech")

        assert sound in [b"audio1", b"audio2"]


class TestGetEmotionSound:
    """Tests for get_emotion_sound method."""

    def test_emotion_sound_no_sounds(self):
        """Test emotion sound when not initialized."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        sound = system.get_emotion_sound("joy")

        assert sound is None

    def test_emotion_sound_joy(self):
        """Test emotion sound for joy."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._emotion_sounds = {
            "laugh_soft": b"laugh1",
            "laugh": b"laugh2"
        }

        sound = system.get_emotion_sound("joy")

        assert sound in [b"laugh1", b"laugh2"]

    def test_emotion_sound_surprise(self):
        """Test emotion sound for surprise."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        system._emotion_sounds = {
            "surprise": b"wow",
            "interest": b"ah"
        }

        sound = system.get_emotion_sound("surprise")

        assert sound in [b"wow", b"ah"]


class TestProcessForExpression:
    """Tests for process_for_expression method."""

    def test_process_basic(self):
        """Test basic expression processing."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        result = system.process_for_expression("bonjour")

        assert "emotion" in result
        assert "intensity" in result
        assert "voice_params" in result
        assert "animations" in result

    def test_process_with_emotion(self):
        """Test expression processing with detected emotion."""
        from eva_expression import EvaExpressionSystem

        system = EvaExpressionSystem()
        result = system.process_for_expression("haha c'est génial!")

        assert result["emotion"] == "joy"
        assert result["intensity"] > 0


class TestGlobalFunctions:
    """Tests for global utility functions."""

    def test_detect_emotion_global(self):
        """Test global detect_emotion function."""
        from eva_expression import detect_emotion

        emotion = detect_emotion("c'est super!")

        assert emotion.name == "joy"

    def test_get_expression_data_global(self):
        """Test global get_expression_data function."""
        from eva_expression import get_expression_data

        data = get_expression_data("bonjour!")

        assert "emotion" in data
        assert "voice_params" in data

    def test_eva_expression_global_instance(self):
        """Test global eva_expression instance exists."""
        from eva_expression import eva_expression

        assert eva_expression is not None
        assert hasattr(eva_expression, "detect_emotion")
        assert hasattr(eva_expression, "get_voice_params")
        assert hasattr(eva_expression, "get_animation_suggestion")

    def test_init_expression_system_global(self):
        """Test global init_expression_system function."""
        from eva_expression import init_expression_system

        # Without TTS available, should return False
        # But function should exist and be callable
        result = init_expression_system()
        assert isinstance(result, bool)
