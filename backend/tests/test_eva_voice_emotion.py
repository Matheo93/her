"""
Tests for eva_voice_emotion.py - Voice Emotion Detection System.

Tests:
- VoiceEmotion dataclass
- ProsodicFeatures dataclass
- VoiceEmotionDetector class
- Module-level functions
"""

import pytest
import numpy as np
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestVoiceEmotionDataclass:
    """Tests for VoiceEmotion dataclass."""

    def test_voice_emotion_creation(self):
        """Test VoiceEmotion creation."""
        from eva_voice_emotion import VoiceEmotion

        emotion = VoiceEmotion(
            emotion="joy",
            confidence=0.8,
            intensity=0.7,
            valence=0.9,
            arousal=0.8,
            features={"pitch": 200}
        )

        assert emotion.emotion == "joy"
        assert emotion.confidence == 0.8
        assert emotion.intensity == 0.7
        assert emotion.valence == 0.9
        assert emotion.arousal == 0.8
        assert emotion.features == {"pitch": 200}

    def test_default_neutral_emotion(self):
        """Test pre-computed default neutral emotion."""
        from eva_voice_emotion import _DEFAULT_NEUTRAL_EMOTION

        assert _DEFAULT_NEUTRAL_EMOTION.emotion == "neutral"
        assert _DEFAULT_NEUTRAL_EMOTION.confidence == 0.3
        assert _DEFAULT_NEUTRAL_EMOTION.intensity == 0.5
        assert _DEFAULT_NEUTRAL_EMOTION.valence == 0.0
        assert _DEFAULT_NEUTRAL_EMOTION.arousal == 0.3
        assert _DEFAULT_NEUTRAL_EMOTION.features == {}


class TestProsodicFeaturesDataclass:
    """Tests for ProsodicFeatures dataclass."""

    def test_prosodic_features_creation(self):
        """Test ProsodicFeatures creation."""
        from eva_voice_emotion import ProsodicFeatures

        features = ProsodicFeatures(
            pitch_mean=150.0,
            pitch_std=30.0,
            pitch_range=100.0,
            energy_mean=0.5,
            energy_std=0.1,
            speech_rate=3.0,
            pause_ratio=0.2,
            spectral_centroid=2000.0,
            spectral_rolloff=4000.0,
            zero_crossing_rate=0.1,
            mfcc_mean=np.zeros(13)
        )

        assert features.pitch_mean == 150.0
        assert features.pitch_std == 30.0
        assert features.speech_rate == 3.0
        assert len(features.mfcc_mean) == 13


class TestVoiceEmotionDetector:
    """Tests for VoiceEmotionDetector class."""

    def test_detector_init(self):
        """Test detector initialization."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector(sample_rate=16000)

        assert detector.sample_rate == 16000
        assert detector.baseline_features is None
        assert len(detector._calibration_samples) == 0

    def test_detector_custom_sample_rate(self):
        """Test detector with custom sample rate."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector(sample_rate=44100)

        assert detector.sample_rate == 44100

    def test_emotion_profiles_exist(self):
        """Test that emotion profiles are defined."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        assert "joy" in detector.EMOTION_PROFILES
        assert "sadness" in detector.EMOTION_PROFILES
        assert "anger" in detector.EMOTION_PROFILES
        assert "fear" in detector.EMOTION_PROFILES
        assert "surprise" in detector.EMOTION_PROFILES
        assert "neutral" in detector.EMOTION_PROFILES

    def test_profile_means_computed(self):
        """Test that profile means are pre-computed."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        # Profile means should be computed
        assert len(detector._PROFILE_MEANS) > 0
        assert "joy" in detector._PROFILE_MEANS
        assert "pitch_mean" in detector._PROFILE_MEANS["joy"]

    def test_deque_history_maxlen(self):
        """Test that history uses deque with maxlen (optimization)."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        # Deque should have maxlen
        assert detector._pitch_history.maxlen == 20
        assert detector._energy_history.maxlen == 20

    def test_extract_features_without_librosa(self):
        """Test extract_features returns None without librosa."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        detector = VoiceEmotionDetector()

        if not LIBROSA_AVAILABLE:
            audio = np.zeros(16000, dtype=np.float32)
            result = detector.extract_features(audio)
            assert result is None


class TestModuleLevelFunctions:
    """Tests for module-level functions."""

    def test_init_voice_emotion(self):
        """Test init_voice_emotion function."""
        from eva_voice_emotion import init_voice_emotion, VoiceEmotionDetector

        detector = init_voice_emotion(sample_rate=16000)

        assert isinstance(detector, VoiceEmotionDetector)
        assert detector.sample_rate == 16000

    def test_detect_voice_emotion_returns_default(self):
        """Test detect_voice_emotion returns default for empty audio."""
        from eva_voice_emotion import detect_voice_emotion, VoiceEmotion

        # Empty audio should return neutral
        result = detect_voice_emotion(bytes())

        assert isinstance(result, VoiceEmotion)
        assert result.emotion == "neutral"

    def test_detect_voice_emotion_bytes(self):
        """Test detect_voice_emotion_bytes with valid audio."""
        from eva_voice_emotion import detect_voice_emotion_bytes, VoiceEmotion

        # Create minimal WAV-like bytes (will likely fail parsing but should return neutral)
        result = detect_voice_emotion_bytes(bytes(100))

        assert isinstance(result, VoiceEmotion)
        # Should return neutral for invalid audio
        assert result.emotion == "neutral"


class TestEmotionProfileStructure:
    """Tests for emotion profile structure."""

    def test_joy_profile_structure(self):
        """Test joy profile has required keys."""
        from eva_voice_emotion import VoiceEmotionDetector

        joy_profile = VoiceEmotionDetector.EMOTION_PROFILES["joy"]

        assert "pitch_mean" in joy_profile
        assert "pitch_std" in joy_profile
        assert "energy_mean" in joy_profile
        assert "speech_rate" in joy_profile
        assert "valence" in joy_profile
        assert "arousal" in joy_profile

    def test_profile_values_are_tuples_or_floats(self):
        """Test profile values are tuples (ranges) or floats."""
        from eva_voice_emotion import VoiceEmotionDetector

        for emotion, profile in VoiceEmotionDetector.EMOTION_PROFILES.items():
            # Range values should be tuples
            assert isinstance(profile["pitch_mean"], tuple)
            assert len(profile["pitch_mean"]) == 2

            # Valence and arousal should be floats
            assert isinstance(profile["valence"], (int, float))
            assert isinstance(profile["arousal"], (int, float))

    def test_valence_range(self):
        """Test valence is in valid range (-1 to 1)."""
        from eva_voice_emotion import VoiceEmotionDetector

        for emotion, profile in VoiceEmotionDetector.EMOTION_PROFILES.items():
            assert -1.0 <= profile["valence"] <= 1.0

    def test_arousal_range(self):
        """Test arousal is in valid range (0 to 1)."""
        from eva_voice_emotion import VoiceEmotionDetector

        for emotion, profile in VoiceEmotionDetector.EMOTION_PROFILES.items():
            assert 0.0 <= profile["arousal"] <= 1.0
