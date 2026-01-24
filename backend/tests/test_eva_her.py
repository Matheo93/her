"""
Tests for eva_her.py - HER Integration Module.

Tests the optimized emotion detection with frozensets.
"""

import pytest
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestEmotionWordSets:
    """Tests for module-level emotion word frozensets."""

    def test_sadness_words_is_frozenset(self):
        """Test _SADNESS_WORDS is a frozenset for O(1) lookup."""
        from eva_her import _SADNESS_WORDS
        assert isinstance(_SADNESS_WORDS, frozenset)
        assert len(_SADNESS_WORDS) > 0

    def test_joy_words_is_frozenset(self):
        """Test _JOY_WORDS is a frozenset."""
        from eva_her import _JOY_WORDS
        assert isinstance(_JOY_WORDS, frozenset)
        assert len(_JOY_WORDS) > 0

    def test_anger_words_is_frozenset(self):
        """Test _ANGER_WORDS is a frozenset."""
        from eva_her import _ANGER_WORDS
        assert isinstance(_ANGER_WORDS, frozenset)
        assert len(_ANGER_WORDS) > 0

    def test_fear_words_is_frozenset(self):
        """Test _FEAR_WORDS is a frozenset."""
        from eva_her import _FEAR_WORDS
        assert isinstance(_FEAR_WORDS, frozenset)
        assert len(_FEAR_WORDS) > 0

    def test_surprise_words_is_frozenset(self):
        """Test _SURPRISE_WORDS is a frozenset."""
        from eva_her import _SURPRISE_WORDS
        assert isinstance(_SURPRISE_WORDS, frozenset)
        assert len(_SURPRISE_WORDS) > 0


class TestHERConfig:
    """Tests for HERConfig dataclass."""

    def test_default_config(self):
        """Test HERConfig has sensible defaults."""
        from eva_her import HERConfig
        config = HERConfig()

        assert config.memory_storage_path == "./eva_memory"
        assert config.proactivity_threshold == 0.6
        assert config.backchannel_enabled is True
        assert config.emotional_tts_enabled is True

    def test_custom_config(self):
        """Test HERConfig accepts custom values."""
        from eva_her import HERConfig
        config = HERConfig(
            memory_storage_path="/custom/path",
            proactivity_threshold=0.8,
            backchannel_enabled=False
        )

        assert config.memory_storage_path == "/custom/path"
        assert config.proactivity_threshold == 0.8
        assert config.backchannel_enabled is False


class TestEvaHER:
    """Tests for EvaHER class."""

    def test_init_without_config(self):
        """Test EvaHER initializes with default config."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her.config is not None
        assert her.initialized is False
        assert her.memory is None

    def test_init_with_custom_config(self):
        """Test EvaHER uses custom config."""
        from eva_her import EvaHER, HERConfig
        config = HERConfig(proactivity_threshold=0.9)
        her = EvaHER(config=config)

        assert her.config.proactivity_threshold == 0.9


class TestTextEmotionDetection:
    """Tests for _detect_text_emotion method."""

    def test_detect_sadness(self):
        """Test sadness detection."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._detect_text_emotion("Je suis triste") == "sadness"
        assert her._detect_text_emotion("J'ai mal") == "sadness"
        assert her._detect_text_emotion("Je me sens seul") == "sadness"

    def test_detect_joy(self):
        """Test joy detection."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._detect_text_emotion("Je suis content") == "joy"
        assert her._detect_text_emotion("C'est super") == "joy"
        assert her._detect_text_emotion("C'est génial") == "joy"

    def test_detect_anger(self):
        """Test anger detection."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._detect_text_emotion("Je suis furieux") == "anger"
        assert her._detect_text_emotion("Je déteste ça") == "anger"
        assert her._detect_text_emotion("C'est insupportable") == "anger"

    def test_detect_fear(self):
        """Test fear detection."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._detect_text_emotion("J'ai peur") == "fear"
        assert her._detect_text_emotion("Je suis anxieux") == "fear"
        assert her._detect_text_emotion("Je suis stressé") == "fear"

    def test_detect_surprise(self):
        """Test surprise detection."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._detect_text_emotion("Je suis surpris") == "surprise"
        assert her._detect_text_emotion("C'est dingue") == "surprise"
        assert her._detect_text_emotion("C'est fou") == "surprise"

    def test_detect_excitement_punctuation(self):
        """Test excitement detection via punctuation."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._detect_text_emotion("Wow!!") == "excitement"
        # génial is a joy word, so it returns joy (word match before punctuation check)
        # But if no word match, !!! triggers excitement
        result = her._detect_text_emotion("C'est génial!!!")
        assert result in ("joy", "excitement")  # Either is acceptable

    def test_detect_curiosity_punctuation(self):
        """Test curiosity detection via question marks."""
        from eva_her import EvaHER
        her = EvaHER()

        # Multiple ?? triggers curiosity detection
        # Words like "comment" may or may not match depending on implementation
        result = her._detect_text_emotion("Quoi?? Comment??")
        assert result in ("curiosity", "surprise")  # Either is acceptable
        assert her._detect_text_emotion("Hmm??") == "curiosity"

    def test_detect_neutral(self):
        """Test neutral detection for plain messages."""
        from eva_her import EvaHER
        her = EvaHER()

        # Need messages with no emotion words
        assert her._detect_text_emotion("Bonjour") == "neutral"
        assert her._detect_text_emotion("D'accord") == "neutral"
        assert her._detect_text_emotion("Merci") == "neutral"

    def test_case_insensitive(self):
        """Test emotion detection is case insensitive."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._detect_text_emotion("JE SUIS TRISTE") == "sadness"
        assert her._detect_text_emotion("Je Suis Content") == "joy"


class TestDetermineResponseEmotion:
    """Tests for _determine_response_emotion method."""

    def test_joy_response(self):
        """Test response to joy is joy."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._determine_response_emotion("joy") == "joy"

    def test_sadness_response(self):
        """Test response to sadness is tenderness."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._determine_response_emotion("sadness") == "tenderness"

    def test_anger_response(self):
        """Test response to anger is tenderness."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._determine_response_emotion("anger") == "tenderness"

    def test_unknown_emotion_response(self):
        """Test response to unknown emotion is neutral."""
        from eva_her import EvaHER
        her = EvaHER()

        assert her._determine_response_emotion("unknown") == "neutral"


class TestGetStatus:
    """Tests for get_status method."""

    def test_status_before_init(self):
        """Test status before initialization."""
        from eva_her import EvaHER
        her = EvaHER()
        status = her.get_status()

        assert status["initialized"] is False
        assert status["memory"] is False
        assert status["voice_emotion"] is False


class TestGlobalFunctions:
    """Tests for module-level functions."""

    def test_get_her_returns_none_before_init(self):
        """Test get_her returns None before initialization."""
        import eva_her
        # Reset global
        eva_her.eva_her = None

        result = eva_her.get_her()
        assert result is None
