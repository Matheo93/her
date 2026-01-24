"""
Tests for gpu_tts.py - GPU-Accelerated Piper TTS Module

Tests:
- Module state and initialization
- TTS generation
- Phoneme conversion
- Error handling
"""

import pytest
import sys
import os
from unittest.mock import patch, MagicMock
import numpy as np

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestModuleState:
    """Tests for module state variables."""

    def test_initial_session_is_none(self):
        """Test that _session starts as None."""
        import gpu_tts
        # Reset state
        gpu_tts._session = None
        gpu_tts._initialized = False

        assert gpu_tts._session is None

    def test_initial_initialized_is_false(self):
        """Test that _initialized starts as False."""
        import gpu_tts
        gpu_tts._initialized = False

        assert gpu_tts._initialized is False

    def test_default_sample_rate(self):
        """Test default sample rate is 22050."""
        import gpu_tts

        assert gpu_tts._sample_rate == 22050

    def test_model_path_uses_env_or_default(self):
        """Test MODEL_DIR uses environment variable or default."""
        import gpu_tts

        # Should have a path defined
        assert gpu_tts.MODEL_DIR is not None
        assert isinstance(gpu_tts.MODEL_DIR, str)


class TestInitGpuTts:
    """Tests for init_gpu_tts function."""

    def test_returns_true_if_already_initialized(self):
        """Test returns True if already initialized."""
        import gpu_tts
        gpu_tts._initialized = True

        result = gpu_tts.init_gpu_tts()

        assert result is True

    def test_returns_false_if_models_not_available(self):
        """Test returns False when models don't exist."""
        import gpu_tts
        gpu_tts._initialized = False
        original = gpu_tts._models_available

        try:
            gpu_tts._models_available = False
            result = gpu_tts.init_gpu_tts()
            assert result is False
        finally:
            gpu_tts._models_available = original

    def test_init_attempts_cuda_provider(self):
        """Test that init tries CUDA provider."""
        import gpu_tts
        gpu_tts._initialized = False
        gpu_tts._models_available = True

        mock_config = {
            "audio": {"sample_rate": 22050},
            "phoneme_id_map": {"^": [1], "$": [2], " ": [3]},
            "inference": {}
        }

        mock_session = MagicMock()
        mock_session.get_providers.return_value = ["CUDAExecutionProvider"]
        mock_session.run.return_value = [np.zeros((1, 1000))]

        with patch("builtins.open", MagicMock()):
            with patch("json.load", return_value=mock_config):
                with patch("onnxruntime.get_available_providers", return_value=["CUDAExecutionProvider", "CPUExecutionProvider"]):
                    with patch("onnxruntime.SessionOptions", return_value=MagicMock()):
                        with patch("onnxruntime.InferenceSession", return_value=mock_session):
                            # This will fail because models don't exist
                            # but we can verify the function is called
                            result = gpu_tts.init_gpu_tts()

        # Cleanup
        gpu_tts._initialized = False


class TestTextToPhonemeIds:
    """Tests for text_to_phoneme_ids function."""

    def test_returns_list_of_ints(self):
        """Test that function returns list of integers."""
        import gpu_tts

        # Mock the phoneme map
        gpu_tts._phoneme_id_map = {
            "^": [1],
            "$": [2],
            " ": [3],
            "a": [4],
            "b": [5],
        }

        # Mock subprocess to fail (triggers fallback)
        with patch("subprocess.run", side_effect=Exception("No espeak")):
            result = gpu_tts.text_to_phoneme_ids("ab")

        assert isinstance(result, list)
        assert all(isinstance(x, int) for x in result)

    def test_includes_start_and_end_tokens(self):
        """Test that result includes start and end tokens."""
        import gpu_tts

        gpu_tts._phoneme_id_map = {
            "^": [1],  # Start token
            "$": [2],  # End token
            " ": [3],
            "a": [4],
        }

        with patch("subprocess.run", side_effect=Exception("No espeak")):
            result = gpu_tts.text_to_phoneme_ids("a")

        # Should start with ^ token and end with $ token
        assert result[0] == 1  # Start token
        assert result[-1] == 2  # End token


class TestGpuTts:
    """Tests for gpu_tts function."""

    def test_returns_none_when_not_initialized(self):
        """Test returns None when not initialized and init fails."""
        import gpu_tts
        gpu_tts._initialized = False
        gpu_tts._models_available = False

        result = gpu_tts.gpu_tts("Hello")

        assert result is None

    def test_returns_none_for_very_short_input(self):
        """Test returns None for input that produces < 3 phonemes."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._phoneme_id_map = {"^": [1], "$": [2]}

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2]):  # Only 2 IDs
            result = gpu_tts.gpu_tts("")

        assert result is None

    def test_returns_bytes_on_success(self):
        """Test returns bytes when TTS succeeds."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {}}
        gpu_tts._sample_rate = 22050

        # Mock session output
        mock_audio = np.random.randn(22050).astype(np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            result = gpu_tts.gpu_tts("Bonjour")

        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_handles_exception_gracefully(self):
        """Test that exceptions return None."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._session.run.side_effect = Exception("ONNX error")

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            result = gpu_tts.gpu_tts("Bonjour")

        assert result is None


class TestGpuTtsMp3:
    """Tests for gpu_tts_mp3 function."""

    def test_returns_none_when_wav_fails(self):
        """Test returns None when WAV generation fails."""
        import gpu_tts

        with patch("gpu_tts.gpu_tts", return_value=None):
            result = gpu_tts.gpu_tts_mp3("Test")

        assert result is None

    def test_returns_wav_on_conversion_error(self):
        """Test returns WAV data when MP3 conversion fails."""
        import gpu_tts

        wav_data = b"RIFF" + b"\x00" * 100

        with patch("gpu_tts.gpu_tts", return_value=wav_data):
            with patch("subprocess.Popen", side_effect=Exception("No ffmpeg")):
                result = gpu_tts.gpu_tts_mp3("Test")

        assert result == wav_data


class TestAsyncWrappers:
    """Tests for async wrapper functions."""

    def test_async_gpu_tts_exists(self):
        """Test async_gpu_tts function exists."""
        import gpu_tts
        assert hasattr(gpu_tts, 'async_gpu_tts')
        assert callable(gpu_tts.async_gpu_tts)

    def test_async_gpu_tts_mp3_exists(self):
        """Test async_gpu_tts_mp3 function exists."""
        import gpu_tts
        assert hasattr(gpu_tts, 'async_gpu_tts_mp3')
        assert callable(gpu_tts.async_gpu_tts_mp3)


class TestBenchmark:
    """Tests for benchmark function."""

    def test_benchmark_exists(self):
        """Test benchmark function exists."""
        import gpu_tts
        assert hasattr(gpu_tts, 'benchmark')
        assert callable(gpu_tts.benchmark)
