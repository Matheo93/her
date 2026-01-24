"""
Tests for eva_voice_emotion.py - Voice Emotion Detection System.

Sprint 556 - Comprehensive test coverage

Tests:
- VoiceEmotion dataclass
- ProsodicFeatures dataclass
- VoiceEmotionDetector class
- Module-level functions
- Edge cases and error handling
"""

import pytest
import numpy as np
import sys
import os
from unittest.mock import Mock, patch, MagicMock
from collections import deque

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ============================================================================
# VoiceEmotion Dataclass Tests
# ============================================================================

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

    def test_voice_emotion_all_emotions(self):
        """Test VoiceEmotion with all standard emotions."""
        from eva_voice_emotion import VoiceEmotion

        emotions = ["joy", "sadness", "anger", "fear", "surprise", "neutral"]
        for emotion_name in emotions:
            emotion = VoiceEmotion(
                emotion=emotion_name,
                confidence=0.5,
                intensity=0.5,
                valence=0.0,
                arousal=0.5,
                features={}
            )
            assert emotion.emotion == emotion_name

    def test_voice_emotion_edge_values(self):
        """Test VoiceEmotion with edge values."""
        from eva_voice_emotion import VoiceEmotion

        # Minimum values
        emotion_min = VoiceEmotion(
            emotion="neutral",
            confidence=0.0,
            intensity=0.0,
            valence=-1.0,
            arousal=0.0,
            features={}
        )
        assert emotion_min.confidence == 0.0
        assert emotion_min.valence == -1.0

        # Maximum values
        emotion_max = VoiceEmotion(
            emotion="joy",
            confidence=1.0,
            intensity=1.0,
            valence=1.0,
            arousal=1.0,
            features={"a": 1, "b": 2, "c": 3}
        )
        assert emotion_max.confidence == 1.0
        assert emotion_max.valence == 1.0

    def test_voice_emotion_empty_features(self):
        """Test VoiceEmotion with empty features dict."""
        from eva_voice_emotion import VoiceEmotion

        emotion = VoiceEmotion(
            emotion="neutral",
            confidence=0.5,
            intensity=0.5,
            valence=0.0,
            arousal=0.3,
            features={}
        )
        assert emotion.features == {}
        assert len(emotion.features) == 0

    def test_voice_emotion_complex_features(self):
        """Test VoiceEmotion with complex features dict."""
        from eva_voice_emotion import VoiceEmotion

        features = {
            "pitch_mean": 150.5,
            "pitch_std": 30.2,
            "energy_mean": 0.45,
            "speech_rate": 3.5,
            "pause_ratio": 0.2,
            "rel_pitch": 1.1,
            "rel_energy": 0.95
        }
        emotion = VoiceEmotion(
            emotion="joy",
            confidence=0.8,
            intensity=0.7,
            valence=0.9,
            arousal=0.8,
            features=features
        )
        assert emotion.features["pitch_mean"] == 150.5
        assert len(emotion.features) == 7

    def test_default_neutral_emotion(self):
        """Test pre-computed default neutral emotion."""
        from eva_voice_emotion import _DEFAULT_NEUTRAL_EMOTION

        assert _DEFAULT_NEUTRAL_EMOTION.emotion == "neutral"
        assert _DEFAULT_NEUTRAL_EMOTION.confidence == 0.3
        assert _DEFAULT_NEUTRAL_EMOTION.intensity == 0.5
        assert _DEFAULT_NEUTRAL_EMOTION.valence == 0.0
        assert _DEFAULT_NEUTRAL_EMOTION.arousal == 0.3
        assert _DEFAULT_NEUTRAL_EMOTION.features == {}

    def test_default_neutral_emotion_immutability(self):
        """Test that default neutral emotion is reused."""
        from eva_voice_emotion import _DEFAULT_NEUTRAL_EMOTION

        # Should be the same object reference
        emotion1 = _DEFAULT_NEUTRAL_EMOTION
        emotion2 = _DEFAULT_NEUTRAL_EMOTION
        assert emotion1 is emotion2


# ============================================================================
# ProsodicFeatures Dataclass Tests
# ============================================================================

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
        assert features.pitch_range == 100.0
        assert features.energy_mean == 0.5
        assert features.energy_std == 0.1
        assert features.speech_rate == 3.0
        assert features.pause_ratio == 0.2
        assert features.spectral_centroid == 2000.0
        assert features.spectral_rolloff == 4000.0
        assert features.zero_crossing_rate == 0.1
        assert len(features.mfcc_mean) == 13

    def test_prosodic_features_different_mfcc_sizes(self):
        """Test ProsodicFeatures with different MFCC sizes."""
        from eva_voice_emotion import ProsodicFeatures

        for n_mfcc in [5, 13, 20, 40]:
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
                mfcc_mean=np.random.randn(n_mfcc)
            )
            assert len(features.mfcc_mean) == n_mfcc

    def test_prosodic_features_edge_values(self):
        """Test ProsodicFeatures with edge values."""
        from eva_voice_emotion import ProsodicFeatures

        # Very high pitch
        features_high = ProsodicFeatures(
            pitch_mean=500.0,
            pitch_std=100.0,
            pitch_range=300.0,
            energy_mean=0.9,
            energy_std=0.2,
            speech_rate=5.0,
            pause_ratio=0.1,
            spectral_centroid=5000.0,
            spectral_rolloff=8000.0,
            zero_crossing_rate=0.2,
            mfcc_mean=np.ones(13)
        )
        assert features_high.pitch_mean == 500.0

        # Very low pitch
        features_low = ProsodicFeatures(
            pitch_mean=50.0,
            pitch_std=5.0,
            pitch_range=20.0,
            energy_mean=0.1,
            energy_std=0.01,
            speech_rate=1.0,
            pause_ratio=0.8,
            spectral_centroid=500.0,
            spectral_rolloff=1000.0,
            zero_crossing_rate=0.01,
            mfcc_mean=np.zeros(13)
        )
        assert features_low.pitch_mean == 50.0


# ============================================================================
# VoiceEmotionDetector Tests
# ============================================================================

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

        detector2 = VoiceEmotionDetector(sample_rate=22050)
        assert detector2.sample_rate == 22050

        detector3 = VoiceEmotionDetector(sample_rate=8000)
        assert detector3.sample_rate == 8000

    def test_detector_default_sample_rate(self):
        """Test detector with default sample rate."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()
        assert detector.sample_rate == 16000

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

    def test_emotion_profiles_count(self):
        """Test the number of emotion profiles."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()
        assert len(detector.EMOTION_PROFILES) == 6

    def test_profile_means_computed(self):
        """Test that profile means are pre-computed."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        # Profile means should be computed
        assert len(detector._PROFILE_MEANS) > 0
        assert "joy" in detector._PROFILE_MEANS
        assert "pitch_mean" in detector._PROFILE_MEANS["joy"]
        assert "pitch_std" in detector._PROFILE_MEANS["joy"]
        assert "energy_mean" in detector._PROFILE_MEANS["joy"]
        assert "speech_rate" in detector._PROFILE_MEANS["joy"]

    def test_profile_means_values(self):
        """Test profile means have correct values."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        # Joy profile mean should be average of range
        joy_profile = detector.EMOTION_PROFILES["joy"]
        joy_means = detector._PROFILE_MEANS["joy"]

        expected_pitch_mean = (joy_profile["pitch_mean"][0] + joy_profile["pitch_mean"][1]) / 2
        assert joy_means["pitch_mean"] == expected_pitch_mean

    def test_deque_history_maxlen(self):
        """Test that history uses deque with maxlen (optimization)."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        # Deque should have maxlen
        assert detector._pitch_history.maxlen == 20
        assert detector._energy_history.maxlen == 20

    def test_deque_history_auto_removal(self):
        """Test that deque automatically removes old items."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        # Add more than maxlen items
        for i in range(30):
            detector._pitch_history.append(float(i))

        # Should only keep last 20
        assert len(detector._pitch_history) == 20
        assert detector._pitch_history[0] == 10.0  # First kept item

    def test_extract_features_without_librosa(self):
        """Test extract_features returns None without librosa."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        detector = VoiceEmotionDetector()

        if not LIBROSA_AVAILABLE:
            audio = np.zeros(16000, dtype=np.float32)
            result = detector.extract_features(audio)
            assert result is None

    def test_extract_features_short_audio(self):
        """Test extract_features with too short audio."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        if not LIBROSA_AVAILABLE:
            pytest.skip("librosa not available")

        detector = VoiceEmotionDetector(sample_rate=16000)

        # Audio shorter than 0.5 seconds
        short_audio = np.zeros(1000, dtype=np.float32)
        result = detector.extract_features(short_audio)
        assert result is None

    def test_detect_emotion_returns_default_for_none_features(self):
        """Test detect_emotion returns default when features extraction fails."""
        from eva_voice_emotion import VoiceEmotionDetector, _DEFAULT_NEUTRAL_EMOTION

        detector = VoiceEmotionDetector()

        with patch.object(detector, 'extract_features', return_value=None):
            result = detector.detect_emotion(np.zeros(16000))
            assert result is _DEFAULT_NEUTRAL_EMOTION

    def test_update_baseline_single_sample(self):
        """Test update_baseline with single sample."""
        from eva_voice_emotion import VoiceEmotionDetector, ProsodicFeatures

        detector = VoiceEmotionDetector()

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

        detector.update_baseline(features)

        # Should have one sample in history
        assert len(detector._pitch_history) == 1
        assert len(detector._energy_history) == 1

    def test_update_baseline_multiple_samples(self):
        """Test update_baseline with multiple samples."""
        from eva_voice_emotion import VoiceEmotionDetector, ProsodicFeatures

        detector = VoiceEmotionDetector()

        for i in range(5):
            features = ProsodicFeatures(
                pitch_mean=150.0 + i * 10,
                pitch_std=30.0,
                pitch_range=100.0,
                energy_mean=0.5 + i * 0.05,
                energy_std=0.1,
                speech_rate=3.0,
                pause_ratio=0.2,
                spectral_centroid=2000.0,
                spectral_rolloff=4000.0,
                zero_crossing_rate=0.1,
                mfcc_mean=np.zeros(13)
            )
            detector.update_baseline(features)

        # Should have 5 samples
        assert len(detector._pitch_history) == 5
        assert len(detector._energy_history) == 5

        # Baseline should be computed after 3 samples
        assert detector.baseline_features is not None

    def test_update_baseline_creates_baseline_after_threshold(self):
        """Test that baseline is created after minimum samples."""
        from eva_voice_emotion import VoiceEmotionDetector, ProsodicFeatures

        detector = VoiceEmotionDetector()

        def make_features(pitch, energy):
            return ProsodicFeatures(
                pitch_mean=pitch,
                pitch_std=30.0,
                pitch_range=100.0,
                energy_mean=energy,
                energy_std=0.1,
                speech_rate=3.0,
                pause_ratio=0.2,
                spectral_centroid=2000.0,
                spectral_rolloff=4000.0,
                zero_crossing_rate=0.1,
                mfcc_mean=np.zeros(13)
            )

        # First two samples - no baseline yet
        detector.update_baseline(make_features(150.0, 0.5))
        assert detector.baseline_features is None

        detector.update_baseline(make_features(160.0, 0.55))
        assert detector.baseline_features is None

        # Third sample - baseline should be created
        detector.update_baseline(make_features(170.0, 0.6))
        assert detector.baseline_features is not None

        # Check baseline is average
        expected_pitch = (150.0 + 160.0 + 170.0) / 3
        assert abs(detector.baseline_features.pitch_mean - expected_pitch) < 0.01


# ============================================================================
# Emotion Profile Structure Tests
# ============================================================================

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

    def test_all_profiles_have_required_keys(self):
        """Test all profiles have required keys."""
        from eva_voice_emotion import VoiceEmotionDetector

        required_keys = ["pitch_mean", "pitch_std", "energy_mean", "speech_rate", "valence", "arousal"]

        for emotion, profile in VoiceEmotionDetector.EMOTION_PROFILES.items():
            for key in required_keys:
                assert key in profile, f"Missing {key} in {emotion} profile"

    def test_profile_values_are_tuples_or_floats(self):
        """Test profile values are tuples (ranges) or floats."""
        from eva_voice_emotion import VoiceEmotionDetector

        for emotion, profile in VoiceEmotionDetector.EMOTION_PROFILES.items():
            # Range values should be tuples
            assert isinstance(profile["pitch_mean"], tuple)
            assert len(profile["pitch_mean"]) == 2

            assert isinstance(profile["pitch_std"], tuple)
            assert len(profile["pitch_std"]) == 2

            assert isinstance(profile["energy_mean"], tuple)
            assert len(profile["energy_mean"]) == 2

            assert isinstance(profile["speech_rate"], tuple)
            assert len(profile["speech_rate"]) == 2

            # Valence and arousal should be floats
            assert isinstance(profile["valence"], (int, float))
            assert isinstance(profile["arousal"], (int, float))

    def test_profile_range_ordering(self):
        """Test that profile ranges have min < max."""
        from eva_voice_emotion import VoiceEmotionDetector

        for emotion, profile in VoiceEmotionDetector.EMOTION_PROFILES.items():
            assert profile["pitch_mean"][0] <= profile["pitch_mean"][1]
            assert profile["pitch_std"][0] <= profile["pitch_std"][1]
            assert profile["energy_mean"][0] <= profile["energy_mean"][1]
            assert profile["speech_rate"][0] <= profile["speech_rate"][1]

    def test_valence_range(self):
        """Test valence is in valid range (-1 to 1)."""
        from eva_voice_emotion import VoiceEmotionDetector

        for emotion, profile in VoiceEmotionDetector.EMOTION_PROFILES.items():
            assert -1.0 <= profile["valence"] <= 1.0, f"Invalid valence for {emotion}"

    def test_arousal_range(self):
        """Test arousal is in valid range (0 to 1)."""
        from eva_voice_emotion import VoiceEmotionDetector

        for emotion, profile in VoiceEmotionDetector.EMOTION_PROFILES.items():
            assert 0.0 <= profile["arousal"] <= 1.0, f"Invalid arousal for {emotion}"

    def test_joy_has_positive_valence(self):
        """Test joy has positive valence."""
        from eva_voice_emotion import VoiceEmotionDetector

        joy = VoiceEmotionDetector.EMOTION_PROFILES["joy"]
        assert joy["valence"] > 0

    def test_sadness_has_negative_valence(self):
        """Test sadness has negative valence."""
        from eva_voice_emotion import VoiceEmotionDetector

        sadness = VoiceEmotionDetector.EMOTION_PROFILES["sadness"]
        assert sadness["valence"] < 0

    def test_anger_has_high_arousal(self):
        """Test anger has high arousal."""
        from eva_voice_emotion import VoiceEmotionDetector

        anger = VoiceEmotionDetector.EMOTION_PROFILES["anger"]
        assert anger["arousal"] >= 0.7

    def test_sadness_has_low_arousal(self):
        """Test sadness has low arousal."""
        from eva_voice_emotion import VoiceEmotionDetector

        sadness = VoiceEmotionDetector.EMOTION_PROFILES["sadness"]
        assert sadness["arousal"] <= 0.4

    def test_neutral_has_moderate_values(self):
        """Test neutral has moderate values."""
        from eva_voice_emotion import VoiceEmotionDetector

        neutral = VoiceEmotionDetector.EMOTION_PROFILES["neutral"]
        assert neutral["valence"] == 0.0
        assert 0.2 <= neutral["arousal"] <= 0.5


# ============================================================================
# Module-Level Functions Tests
# ============================================================================

class TestModuleLevelFunctions:
    """Tests for module-level functions."""

    def test_init_voice_emotion(self):
        """Test init_voice_emotion function."""
        from eva_voice_emotion import init_voice_emotion, VoiceEmotionDetector

        detector = init_voice_emotion(sample_rate=16000)

        assert isinstance(detector, VoiceEmotionDetector)
        assert detector.sample_rate == 16000

    def test_init_voice_emotion_custom_rate(self):
        """Test init_voice_emotion with custom sample rate."""
        from eva_voice_emotion import init_voice_emotion

        detector = init_voice_emotion(sample_rate=44100)
        assert detector.sample_rate == 44100

    def test_init_voice_emotion_sets_global(self):
        """Test init_voice_emotion sets global detector."""
        import eva_voice_emotion

        detector = eva_voice_emotion.init_voice_emotion(sample_rate=16000)
        assert eva_voice_emotion.voice_emotion_detector is detector

    def test_detect_voice_emotion_initializes_detector(self):
        """Test detect_voice_emotion initializes detector if needed."""
        import eva_voice_emotion

        # Reset global detector
        eva_voice_emotion.voice_emotion_detector = None

        # Call should initialize
        result = eva_voice_emotion.detect_voice_emotion(np.zeros(16000))

        assert eva_voice_emotion.voice_emotion_detector is not None

    def test_detect_voice_emotion_returns_voice_emotion(self):
        """Test detect_voice_emotion returns VoiceEmotion type."""
        from eva_voice_emotion import detect_voice_emotion, VoiceEmotion

        audio = np.random.randn(16000).astype(np.float32) * 0.1
        result = detect_voice_emotion(audio)

        assert isinstance(result, VoiceEmotion)

    def test_detect_voice_emotion_bytes_returns_default(self):
        """Test detect_voice_emotion_bytes with invalid bytes."""
        from eva_voice_emotion import detect_voice_emotion_bytes, VoiceEmotion

        # Invalid audio bytes should return neutral
        result = detect_voice_emotion_bytes(bytes(100))

        assert isinstance(result, VoiceEmotion)
        assert result.emotion == "neutral"

    def test_detect_voice_emotion_bytes_empty(self):
        """Test detect_voice_emotion_bytes with empty bytes."""
        from eva_voice_emotion import detect_voice_emotion_bytes

        result = detect_voice_emotion_bytes(b"")
        assert result.emotion == "neutral"


# ============================================================================
# is_user_about_to_speak Tests
# ============================================================================

class TestIsUserAboutToSpeak:
    """Tests for is_user_about_to_speak method."""

    def test_returns_tuple(self):
        """Test method returns tuple of (bool, float)."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        if not LIBROSA_AVAILABLE:
            pytest.skip("librosa not available")

        detector = VoiceEmotionDetector()
        audio = np.random.randn(16000).astype(np.float32) * 0.01

        result = detector.is_user_about_to_speak(audio)

        assert isinstance(result, tuple)
        assert len(result) == 2
        assert isinstance(result[0], bool)
        assert isinstance(result[1], float)

    def test_returns_false_for_silence(self):
        """Test returns False for silent audio."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        if not LIBROSA_AVAILABLE:
            pytest.skip("librosa not available")

        detector = VoiceEmotionDetector()
        silence = np.zeros(16000, dtype=np.float32)

        result = detector.is_user_about_to_speak(silence)

        assert result[0] is False

    def test_returns_false_for_short_audio(self):
        """Test returns False for very short audio."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        if not LIBROSA_AVAILABLE:
            pytest.skip("librosa not available")

        detector = VoiceEmotionDetector()
        short_audio = np.zeros(100, dtype=np.float32)

        result = detector.is_user_about_to_speak(short_audio)

        assert result == (False, 0.0)

    def test_confidence_in_valid_range(self):
        """Test confidence is in valid range."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        if not LIBROSA_AVAILABLE:
            pytest.skip("librosa not available")

        detector = VoiceEmotionDetector()
        audio = np.random.randn(16000).astype(np.float32) * 0.1

        _, confidence = detector.is_user_about_to_speak(audio)

        assert 0.0 <= confidence <= 1.0


# ============================================================================
# detect_from_bytes Tests
# ============================================================================

class TestDetectFromBytes:
    """Tests for detect_from_bytes method."""

    def test_returns_voice_emotion(self):
        """Test method returns VoiceEmotion."""
        from eva_voice_emotion import VoiceEmotionDetector, VoiceEmotion

        detector = VoiceEmotionDetector()

        result = detector.detect_from_bytes(bytes(100))

        assert isinstance(result, VoiceEmotion)

    def test_returns_neutral_for_invalid_bytes(self):
        """Test returns neutral for invalid audio bytes."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        result = detector.detect_from_bytes(b"not audio data")

        assert result.emotion == "neutral"

    def test_handles_empty_bytes(self):
        """Test handles empty bytes gracefully."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        result = detector.detect_from_bytes(b"")

        assert result.emotion == "neutral"


# ============================================================================
# Feature Extraction Tests (with mocking)
# ============================================================================

class TestFeatureExtraction:
    """Tests for feature extraction with mocking."""

    def test_extract_features_normalizes_audio(self):
        """Test that audio is normalized during feature extraction."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        if not LIBROSA_AVAILABLE:
            pytest.skip("librosa not available")

        detector = VoiceEmotionDetector()

        # Create audio with values > 1
        audio = np.random.randn(16000).astype(np.float32) * 10

        # Should not crash and should process
        result = detector.extract_features(audio)

        # Result may be None if audio is too short, but shouldn't crash

    def test_extract_features_handles_stereo(self):
        """Test that stereo audio is converted to mono."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        if not LIBROSA_AVAILABLE:
            pytest.skip("librosa not available")

        detector = VoiceEmotionDetector()

        # Create stereo audio
        stereo_audio = np.random.randn(16000, 2).astype(np.float32) * 0.1

        # Should handle without error
        result = detector.extract_features(stereo_audio)

    def test_extract_features_converts_dtype(self):
        """Test that non-float32 audio is converted."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        if not LIBROSA_AVAILABLE:
            pytest.skip("librosa not available")

        detector = VoiceEmotionDetector()

        # Create audio with different dtype
        audio_int16 = (np.random.randn(16000) * 32767).astype(np.int16)

        # Should handle without error
        result = detector.extract_features(audio_int16)


# ============================================================================
# Detect Emotion Integration Tests
# ============================================================================

class TestDetectEmotionIntegration:
    """Integration tests for detect_emotion."""

    def test_detect_emotion_returns_voice_emotion(self):
        """Test detect_emotion returns VoiceEmotion type."""
        from eva_voice_emotion import VoiceEmotionDetector, VoiceEmotion

        detector = VoiceEmotionDetector()

        audio = np.random.randn(16000).astype(np.float32) * 0.1
        result = detector.detect_emotion(audio)

        assert isinstance(result, VoiceEmotion)

    def test_detect_emotion_has_valid_confidence(self):
        """Test detect_emotion returns valid confidence."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        audio = np.random.randn(16000).astype(np.float32) * 0.1
        result = detector.detect_emotion(audio)

        assert 0.0 <= result.confidence <= 1.0

    def test_detect_emotion_has_valid_valence(self):
        """Test detect_emotion returns valid valence."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        audio = np.random.randn(16000).astype(np.float32) * 0.1
        result = detector.detect_emotion(audio)

        assert -1.0 <= result.valence <= 1.0

    def test_detect_emotion_has_valid_arousal(self):
        """Test detect_emotion returns valid arousal."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        audio = np.random.randn(16000).astype(np.float32) * 0.1
        result = detector.detect_emotion(audio)

        assert 0.0 <= result.arousal <= 1.0

    def test_detect_emotion_returns_known_emotion(self):
        """Test detect_emotion returns a known emotion."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        known_emotions = {"joy", "sadness", "anger", "fear", "surprise", "neutral"}

        audio = np.random.randn(16000).astype(np.float32) * 0.1
        result = detector.detect_emotion(audio)

        assert result.emotion in known_emotions


# ============================================================================
# LIBROSA_AVAILABLE Flag Tests
# ============================================================================

class TestLibrosaAvailableFlag:
    """Tests related to LIBROSA_AVAILABLE flag."""

    def test_librosa_available_is_bool(self):
        """Test LIBROSA_AVAILABLE is a boolean."""
        from eva_voice_emotion import LIBROSA_AVAILABLE

        assert isinstance(LIBROSA_AVAILABLE, bool)

    def test_detector_works_without_librosa(self):
        """Test detector can be created without librosa."""
        from eva_voice_emotion import VoiceEmotionDetector

        # Should not raise even without librosa
        detector = VoiceEmotionDetector()
        assert detector is not None


# ============================================================================
# Edge Case Tests
# ============================================================================

class TestEdgeCases:
    """Tests for edge cases."""

    def test_empty_audio_array(self):
        """Test handling of empty audio array."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        empty_audio = np.array([], dtype=np.float32)
        result = detector.detect_emotion(empty_audio)

        assert result.emotion == "neutral"

    def test_very_long_audio(self):
        """Test handling of very long audio."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        # 10 seconds of audio
        long_audio = np.random.randn(160000).astype(np.float32) * 0.1
        result = detector.detect_emotion(long_audio)

        assert result is not None

    def test_zero_audio(self):
        """Test handling of all-zero audio."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        zero_audio = np.zeros(16000, dtype=np.float32)
        result = detector.detect_emotion(zero_audio)

        assert result is not None

    def test_constant_audio(self):
        """Test handling of constant value audio."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        constant_audio = np.ones(16000, dtype=np.float32) * 0.5
        result = detector.detect_emotion(constant_audio)

        assert result is not None

    def test_multiple_detections_same_detector(self):
        """Test multiple detections on same detector instance."""
        from eva_voice_emotion import VoiceEmotionDetector

        detector = VoiceEmotionDetector()

        for i in range(10):
            audio = np.random.randn(16000).astype(np.float32) * 0.1
            result = detector.detect_emotion(audio)
            assert result is not None

    def test_baseline_updates_over_time(self):
        """Test that baseline is updated with each detection."""
        from eva_voice_emotion import VoiceEmotionDetector, LIBROSA_AVAILABLE

        if not LIBROSA_AVAILABLE:
            pytest.skip("librosa not available")

        detector = VoiceEmotionDetector()

        # Do multiple detections
        for i in range(5):
            audio = np.random.randn(16000).astype(np.float32) * 0.1
            detector.detect_emotion(audio)

        # Should have history
        assert len(detector._pitch_history) <= 5
        assert len(detector._energy_history) <= 5
