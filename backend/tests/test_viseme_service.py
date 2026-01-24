"""
Tests for viseme_service.py - Sprint 550
Testing viseme lip-sync audio analysis
"""

import pytest
import numpy as np
from unittest.mock import patch, MagicMock

from viseme_service import (
    AudioAnalyzer,
    VISEME_NAMES,
    VISEME_PARAMS,
    SAMPLE_RATE,
    _SILENCE_WEIGHT,
    _ENERGY_THRESHOLD,
    _ZCR_THRESHOLD,
    _CENTROID_HIGH,
    _CENTROID_MID,
    _CENTROID_LOW,
)


class TestConstants:
    """Tests for module-level constants"""

    def test_viseme_names_is_tuple(self):
        """Sprint 550: VISEME_NAMES should be tuple for immutability"""
        assert isinstance(VISEME_NAMES, tuple)
        assert len(VISEME_NAMES) == 12

    def test_viseme_names_content(self):
        """Test all expected viseme names are present"""
        expected = {"sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "RR", "AA", "EE", "OO"}
        assert set(VISEME_NAMES) == expected

    def test_viseme_params_keys(self):
        """Test VISEME_PARAMS has all viseme keys"""
        for name in VISEME_NAMES:
            assert name in VISEME_PARAMS

    def test_viseme_params_format(self):
        """Test VISEME_PARAMS values are (open, wide, round) tuples"""
        for name, params in VISEME_PARAMS.items():
            assert isinstance(params, tuple)
            assert len(params) == 3
            for p in params:
                assert 0.0 <= p <= 1.0

    def test_silence_weight_constant(self):
        """Test _SILENCE_WEIGHT is pre-computed correctly"""
        assert _SILENCE_WEIGHT == {"sil": 1.0}

    def test_threshold_constants(self):
        """Test threshold constants are reasonable"""
        assert 0 < _ENERGY_THRESHOLD < 1
        assert 0 < _ZCR_THRESHOLD < 1
        assert 0 < _CENTROID_LOW < _CENTROID_MID < _CENTROID_HIGH <= 1

    def test_sample_rate(self):
        """Test SAMPLE_RATE is 16kHz"""
        assert SAMPLE_RATE == 16000


class TestAudioAnalyzer:
    """Tests for AudioAnalyzer class"""

    def test_init(self):
        """Test AudioAnalyzer initialization"""
        analyzer = AudioAnalyzer()
        assert analyzer.prev_energy == 0
        assert analyzer.smoothing == 0.3

    def test_analyze_empty_audio(self):
        """Test analyze_chunk with empty audio returns silence"""
        analyzer = AudioAnalyzer()
        result = analyzer.analyze_chunk(np.array([]))
        assert result == {"sil": 1.0}
        # Should return pre-computed constant
        assert result is _SILENCE_WEIGHT

    def test_analyze_silent_audio(self):
        """Test analyze_chunk with very low energy audio returns silence"""
        analyzer = AudioAnalyzer()
        # Very low amplitude signal
        audio = np.zeros(1024, dtype=np.float32)
        audio[:10] = 0.001  # Tiny amplitude
        result = analyzer.analyze_chunk(audio)
        assert "sil" in result

    def test_analyze_loud_audio(self):
        """Test analyze_chunk with loud audio returns viseme weights"""
        analyzer = AudioAnalyzer()
        # Generate a loud sine wave
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 440 * t) * 0.8
        result = analyzer.analyze_chunk(audio)
        # Should have some viseme weights
        assert len(result) > 0
        # Total weights should sum to ~1.0
        assert 0.9 <= sum(result.values()) <= 1.1

    def test_energy_smoothing(self):
        """Test that energy is smoothed across calls"""
        analyzer = AudioAnalyzer()

        # First call with loud audio
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        loud_audio = np.sin(2 * np.pi * 440 * t) * 0.8
        analyzer.analyze_chunk(loud_audio)
        energy_after_loud = analyzer.prev_energy

        # Second call with silent audio
        silent_audio = np.zeros(1600, dtype=np.float32)
        analyzer.analyze_chunk(silent_audio)
        energy_after_silent = analyzer.prev_energy

        # Energy should decrease but not immediately to zero
        assert energy_after_silent < energy_after_loud
        assert energy_after_silent > 0

    def test_spectral_analysis_bright_sound(self):
        """Test analysis of bright (high frequency) sounds"""
        analyzer = AudioAnalyzer()
        # High frequency sine wave (bright sound like 'EE' or 'SS')
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 3000 * t) * 0.5
        result = analyzer.analyze_chunk(audio)
        # Should detect bright vowels or fricatives
        total = sum(result.values())
        assert total > 0.5

    def test_spectral_analysis_dark_sound(self):
        """Test analysis of dark (low frequency) sounds"""
        analyzer = AudioAnalyzer()
        # Low frequency sine wave (dark sound like 'OO')
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 200 * t) * 0.5
        result = analyzer.analyze_chunk(audio)
        # Should detect round vowels
        total = sum(result.values())
        assert total > 0.5

    def test_short_audio_handling(self):
        """Test handling of audio shorter than FFT window"""
        analyzer = AudioAnalyzer()
        # Short audio (< 512 samples)
        audio = np.sin(np.linspace(0, 1, 256)) * 0.5
        audio = audio.astype(np.float32)
        result = analyzer.analyze_chunk(audio)
        # Should still work with default centroid
        assert len(result) > 0

    def test_viseme_weights_valid(self):
        """Test all viseme weights are between 0 and 1"""
        analyzer = AudioAnalyzer()
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 800 * t) * 0.6
        result = analyzer.analyze_chunk(audio)

        for viseme, weight in result.items():
            assert viseme in VISEME_NAMES
            assert 0.0 <= weight <= 1.0

    def test_normalization_handles_zero_max(self):
        """Test normalization handles all-zero audio"""
        analyzer = AudioAnalyzer()
        audio = np.zeros(1024, dtype=np.float32)
        result = analyzer.analyze_chunk(audio)
        assert result == {"sil": 1.0}

    def test_custom_sample_rate(self):
        """Test analyze_chunk with custom sample rate"""
        analyzer = AudioAnalyzer()
        t = np.linspace(0, 0.1, 4800, dtype=np.float32)  # 48kHz
        audio = np.sin(2 * np.pi * 440 * t) * 0.5
        result = analyzer.analyze_chunk(audio, sr=48000)
        assert len(result) > 0


class TestVisemeMapping:
    """Tests for viseme classification logic"""

    def test_fricative_high_centroid(self):
        """Test fricatives with high spectral centroid (SS, EE)"""
        analyzer = AudioAnalyzer()
        # Simulate high ZCR + high centroid
        # Using white noise-like signal
        np.random.seed(42)
        audio = np.random.randn(1600).astype(np.float32) * 0.3
        result = analyzer.analyze_chunk(audio)
        # Should have some weights
        assert len(result) > 0

    def test_silence_added_when_total_low(self):
        """Test that silence weight is added when total < 1.0"""
        analyzer = AudioAnalyzer()
        # Any active audio should have weights that may need silence padding
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 500 * t) * 0.3
        result = analyzer.analyze_chunk(audio)
        # Total should be close to 1.0
        total = sum(result.values())
        assert 0.95 <= total <= 1.05


class TestIntegration:
    """Integration tests"""

    def test_continuous_audio_stream(self):
        """Test processing continuous audio stream"""
        analyzer = AudioAnalyzer()

        # Simulate 1 second of audio in 40ms chunks
        chunk_size = int(SAMPLE_RATE * 0.04)
        t = np.linspace(0, 1, SAMPLE_RATE, dtype=np.float32)
        full_audio = np.sin(2 * np.pi * 440 * t) * 0.5

        results = []
        for i in range(0, len(full_audio), chunk_size):
            chunk = full_audio[i:i + chunk_size]
            if len(chunk) > 0:
                result = analyzer.analyze_chunk(chunk)
                results.append(result)

        # Should have ~25 chunks
        assert len(results) >= 24
        # All results should be valid
        for result in results:
            assert isinstance(result, dict)
            assert sum(result.values()) > 0.5

    def test_audio_with_silence_gaps(self):
        """Test audio with alternating sound and silence"""
        analyzer = AudioAnalyzer()

        # 100ms of sound
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        sound = np.sin(2 * np.pi * 440 * t) * 0.5
        result1 = analyzer.analyze_chunk(sound)

        # 100ms of silence
        silence = np.zeros(1600, dtype=np.float32)
        result2 = analyzer.analyze_chunk(silence)

        # Sound should have active visemes
        assert "sil" not in result1 or result1.get("sil", 0) < 0.9

        # After silence, energy should still be partially high due to smoothing
        # but next call should return more silence
        result3 = analyzer.analyze_chunk(silence)
        # Eventually should converge to silence
        assert result3.get("sil", 0) > result2.get("sil", 0) or result2.get("sil", 0) > 0.5
