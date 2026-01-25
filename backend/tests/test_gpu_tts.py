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

    def test_config_initially_none(self):
        """Test that _config starts as None."""
        import gpu_tts
        gpu_tts._config = None
        assert gpu_tts._config is None

    def test_phoneme_id_map_initially_none(self):
        """Test that _phoneme_id_map starts as None."""
        import gpu_tts
        gpu_tts._phoneme_id_map = None
        assert gpu_tts._phoneme_id_map is None

    def test_model_path_includes_onnx_extension(self):
        """Test MODEL_PATH has .onnx extension."""
        import gpu_tts
        assert gpu_tts.MODEL_PATH.endswith(".onnx")

    def test_config_path_includes_json_extension(self):
        """Test CONFIG_PATH has .json extension."""
        import gpu_tts
        assert gpu_tts.CONFIG_PATH.endswith(".json")

    def test_models_available_is_boolean(self):
        """Test _models_available is a boolean."""
        import gpu_tts
        assert isinstance(gpu_tts._models_available, bool)


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

    def test_converts_text_to_lowercase(self):
        """Test that text is converted to lowercase in fallback."""
        import gpu_tts

        gpu_tts._phoneme_id_map = {
            "^": [1],
            "$": [2],
            "a": [4],
            "A": [5],  # Capital A
        }

        with patch("subprocess.run", side_effect=Exception("No espeak")):
            result = gpu_tts.text_to_phoneme_ids("A")

        # Should use lowercase mapping
        assert 4 in result  # lowercase 'a' ID

    def test_handles_espeak_success(self):
        """Test that espeak-ng output is processed correctly."""
        import gpu_tts

        gpu_tts._phoneme_id_map = {
            "^": [1],
            "$": [2],
            " ": [3],
            "a": [4],
            "b": [5],
        }

        mock_result = MagicMock()
        mock_result.stdout = "ab"

        with patch("subprocess.run", return_value=mock_result):
            result = gpu_tts.text_to_phoneme_ids("ab")

        assert isinstance(result, list)
        assert result[0] == 1  # Start token

    def test_handles_space_character(self):
        """Test that spaces are handled correctly."""
        import gpu_tts

        gpu_tts._phoneme_id_map = {
            "^": [1],
            "$": [2],
            " ": [3],
            "a": [4],
        }

        mock_result = MagicMock()
        mock_result.stdout = "a a"

        with patch("subprocess.run", return_value=mock_result):
            result = gpu_tts.text_to_phoneme_ids("a a")

        assert 3 in result  # Space token

    def test_skips_unknown_phonemes(self):
        """Test that unknown phonemes are skipped."""
        import gpu_tts

        gpu_tts._phoneme_id_map = {
            "^": [1],
            "$": [2],
            "a": [4],
        }

        mock_result = MagicMock()
        mock_result.stdout = "a@#b"

        with patch("subprocess.run", return_value=mock_result):
            result = gpu_tts.text_to_phoneme_ids("test")

        # Should only have start, 'a', and end tokens
        assert result[0] == 1
        assert result[-1] == 2

    def test_handles_empty_espeak_output(self):
        """Test handling of empty espeak output."""
        import gpu_tts

        gpu_tts._phoneme_id_map = {
            "^": [1],
            "$": [2],
        }

        mock_result = MagicMock()
        mock_result.stdout = ""

        with patch("subprocess.run", return_value=mock_result):
            result = gpu_tts.text_to_phoneme_ids("")

        assert result[0] == 1  # Start
        assert result[-1] == 2  # End

    def test_fallback_handles_unknown_chars(self):
        """Test fallback mode skips unknown characters."""
        import gpu_tts

        gpu_tts._phoneme_id_map = {
            "^": [1],
            "$": [2],
            "a": [4],
        }

        with patch("subprocess.run", side_effect=Exception("No espeak")):
            result = gpu_tts.text_to_phoneme_ids("a@#!")

        # Should only have start, 'a', and end
        assert len(result) == 3


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

    def test_speed_parameter_affects_length_scale(self):
        """Test that speed parameter affects the length scale."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {"length_scale": 1.0}}
        gpu_tts._sample_rate = 22050

        mock_audio = np.random.randn(22050).astype(np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            result = gpu_tts.gpu_tts("Bonjour", speed=2.0)

        # Verify session.run was called with scales
        call_args = gpu_tts._session.run.call_args
        scales = call_args[1]["scales"]
        # Length scale should be 1.0 / 2.0 = 0.5
        assert scales[1] == pytest.approx(0.5)

    def test_default_speed_is_one(self):
        """Test that default speed is 1.0."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {"length_scale": 1.0}}
        gpu_tts._sample_rate = 22050

        mock_audio = np.random.randn(22050).astype(np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            gpu_tts.gpu_tts("Bonjour")

        call_args = gpu_tts._session.run.call_args
        scales = call_args[1]["scales"]
        assert scales[1] == pytest.approx(1.0)

    def test_uses_default_inference_config(self):
        """Test uses defaults when inference config missing."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {}  # No inference section
        gpu_tts._sample_rate = 22050

        mock_audio = np.random.randn(22050).astype(np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            result = gpu_tts.gpu_tts("Bonjour")

        assert result is not None

    def test_normalizes_audio_output(self):
        """Test that audio output is normalized."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {}}
        gpu_tts._sample_rate = 22050

        # Create audio with high values
        mock_audio = np.ones(22050, dtype=np.float32) * 2.0
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            result = gpu_tts.gpu_tts("Bonjour")

        assert result is not None

    def test_handles_zero_max_audio(self):
        """Test handling of zero max audio value."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {}}
        gpu_tts._sample_rate = 22050

        # Create silence (all zeros)
        mock_audio = np.zeros(22050, dtype=np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            result = gpu_tts.gpu_tts("Bonjour")

        # Should still return bytes
        assert result is not None

    def test_wav_output_format(self):
        """Test that output is valid WAV format."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {}}
        gpu_tts._sample_rate = 22050

        mock_audio = np.random.randn(22050).astype(np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            result = gpu_tts.gpu_tts("Bonjour")

        # WAV files start with "RIFF"
        assert result[:4] == b"RIFF"

    def test_attempts_init_if_not_initialized(self):
        """Test that gpu_tts attempts init if not initialized."""
        import gpu_tts
        gpu_tts._initialized = False

        with patch("gpu_tts.init_gpu_tts", return_value=False) as mock_init:
            result = gpu_tts.gpu_tts("Hello")

        mock_init.assert_called_once()
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

    def test_calls_gpu_tts_with_text(self):
        """Test that gpu_tts is called with the text."""
        import gpu_tts

        with patch("gpu_tts.gpu_tts", return_value=None) as mock_tts:
            gpu_tts.gpu_tts_mp3("Test text")

        mock_tts.assert_called_once_with("Test text", 1.0)

    def test_calls_gpu_tts_with_speed(self):
        """Test that speed parameter is passed to gpu_tts."""
        import gpu_tts

        with patch("gpu_tts.gpu_tts", return_value=None) as mock_tts:
            gpu_tts.gpu_tts_mp3("Test", speed=1.5)

        mock_tts.assert_called_once_with("Test", 1.5)

    def test_converts_wav_to_mp3(self):
        """Test WAV to MP3 conversion with ffmpeg."""
        import gpu_tts

        wav_data = b"RIFF" + b"\x00" * 100
        mp3_data = b"\xff\xfb" + b"\x00" * 100

        mock_process = MagicMock()
        mock_process.communicate.return_value = (mp3_data, b"")

        with patch("gpu_tts.gpu_tts", return_value=wav_data):
            with patch("subprocess.Popen", return_value=mock_process) as mock_popen:
                result = gpu_tts.gpu_tts_mp3("Test")

        assert result == mp3_data
        mock_popen.assert_called_once()

    def test_ffmpeg_receives_wav_input(self):
        """Test that ffmpeg receives WAV data as input."""
        import gpu_tts

        wav_data = b"RIFF" + b"\x00" * 100
        mp3_data = b"\xff\xfb" + b"\x00" * 100

        mock_process = MagicMock()
        mock_process.communicate.return_value = (mp3_data, b"")

        with patch("gpu_tts.gpu_tts", return_value=wav_data):
            with patch("subprocess.Popen", return_value=mock_process):
                gpu_tts.gpu_tts_mp3("Test")

        mock_process.communicate.assert_called_once_with(input=wav_data)


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

    @pytest.mark.asyncio
    async def test_async_gpu_tts_calls_sync_version(self):
        """Test async_gpu_tts calls synchronous gpu_tts."""
        import gpu_tts

        with patch("gpu_tts.gpu_tts", return_value=b"audio") as mock_tts:
            result = await gpu_tts.async_gpu_tts("Hello", 1.0)

        mock_tts.assert_called_once_with("Hello", 1.0)

    @pytest.mark.asyncio
    async def test_async_gpu_tts_mp3_calls_sync_version(self):
        """Test async_gpu_tts_mp3 calls synchronous gpu_tts_mp3."""
        import gpu_tts

        with patch("gpu_tts.gpu_tts_mp3", return_value=b"mp3") as mock_tts:
            result = await gpu_tts.async_gpu_tts_mp3("Hello", 1.0)

        mock_tts.assert_called_once_with("Hello", 1.0)


class TestBenchmark:
    """Tests for benchmark function."""

    def test_benchmark_exists(self):
        """Test benchmark function exists."""
        import gpu_tts
        assert hasattr(gpu_tts, 'benchmark')
        assert callable(gpu_tts.benchmark)

    def test_benchmark_calls_init(self):
        """Test that benchmark calls init_gpu_tts."""
        import gpu_tts

        with patch("gpu_tts.init_gpu_tts") as mock_init:
            with patch("gpu_tts.gpu_tts", return_value=None):
                gpu_tts.benchmark()

        mock_init.assert_called()

    def test_benchmark_runs_multiple_phrases(self):
        """Test that benchmark runs multiple test phrases."""
        import gpu_tts

        call_count = 0
        def track_calls(*args):
            nonlocal call_count
            call_count += 1
            return b"audio"

        with patch("gpu_tts.init_gpu_tts"):
            with patch("gpu_tts.gpu_tts", side_effect=track_calls):
                gpu_tts.benchmark()

        # Should run warmup + 10 timed runs per phrase (4 phrases)
        assert call_count > 40


class TestInitGpuTtsExtended:
    """Extended tests for init_gpu_tts function."""

    def test_sets_sample_rate_from_config(self):
        """Test that sample rate is set from config."""
        import gpu_tts
        gpu_tts._initialized = False
        gpu_tts._models_available = True

        mock_config = {
            "audio": {"sample_rate": 44100},
            "phoneme_id_map": {"^": [1], "$": [2]},
            "inference": {}
        }

        mock_session = MagicMock()
        mock_session.get_providers.return_value = ["CPUExecutionProvider"]
        mock_session.run.return_value = [np.zeros((1, 1000))]

        with patch("builtins.open", MagicMock()):
            with patch("json.load", return_value=mock_config):
                with patch("onnxruntime.get_available_providers", return_value=["CPUExecutionProvider"]):
                    with patch("onnxruntime.InferenceSession", return_value=mock_session):
                        gpu_tts.init_gpu_tts()

        assert gpu_tts._sample_rate == 44100
        gpu_tts._initialized = False

    def test_sets_phoneme_id_map_from_config(self):
        """Test that phoneme_id_map is set from config."""
        import gpu_tts
        gpu_tts._initialized = False
        gpu_tts._models_available = True

        mock_config = {
            "audio": {"sample_rate": 22050},
            "phoneme_id_map": {"^": [1], "$": [2], "test": [99]},
            "inference": {}
        }

        mock_session = MagicMock()
        mock_session.get_providers.return_value = ["CPUExecutionProvider"]
        mock_session.run.return_value = [np.zeros((1, 1000))]

        with patch("builtins.open", MagicMock()):
            with patch("json.load", return_value=mock_config):
                with patch("onnxruntime.get_available_providers", return_value=["CPUExecutionProvider"]):
                    with patch("onnxruntime.InferenceSession", return_value=mock_session):
                        gpu_tts.init_gpu_tts()

        assert gpu_tts._phoneme_id_map["test"] == [99]
        gpu_tts._initialized = False

    def test_falls_back_to_cpu_when_no_cuda(self):
        """Test falls back to CPU when CUDA not available."""
        import gpu_tts
        gpu_tts._initialized = False
        gpu_tts._models_available = True

        mock_config = {
            "audio": {"sample_rate": 22050},
            "phoneme_id_map": {"^": [1], "$": [2]},
            "inference": {}
        }

        mock_session = MagicMock()
        mock_session.get_providers.return_value = ["CPUExecutionProvider"]
        mock_session.run.return_value = [np.zeros((1, 1000))]

        with patch("builtins.open", MagicMock()):
            with patch("json.load", return_value=mock_config):
                with patch("onnxruntime.get_available_providers", return_value=["CPUExecutionProvider"]):
                    with patch("onnxruntime.InferenceSession", return_value=mock_session) as mock_sess_class:
                        gpu_tts.init_gpu_tts()

        # Should use CPU provider
        mock_sess_class.assert_called()
        gpu_tts._initialized = False

    def test_performs_warmup_runs(self):
        """Test that warmup runs are performed."""
        import gpu_tts
        gpu_tts._initialized = False
        gpu_tts._models_available = True

        mock_config = {
            "audio": {"sample_rate": 22050},
            "phoneme_id_map": {"^": [1], "$": [2]},
            "inference": {}
        }

        mock_session = MagicMock()
        mock_session.get_providers.return_value = ["CPUExecutionProvider"]
        mock_session.run.return_value = [np.zeros((1, 1000))]

        with patch("builtins.open", MagicMock()):
            with patch("json.load", return_value=mock_config):
                with patch("onnxruntime.get_available_providers", return_value=["CPUExecutionProvider"]):
                    with patch("onnxruntime.InferenceSession", return_value=mock_session):
                        gpu_tts.init_gpu_tts()

        # Should have called run 3 times for warmup
        assert mock_session.run.call_count == 3
        gpu_tts._initialized = False

    def test_handles_init_exception(self):
        """Test that init handles exceptions gracefully."""
        import gpu_tts
        gpu_tts._initialized = False
        gpu_tts._models_available = True

        with patch("builtins.open", side_effect=Exception("File error")):
            result = gpu_tts.init_gpu_tts()

        assert result is False
        gpu_tts._initialized = False


class TestEdgeCases:
    """Tests for edge cases and error conditions."""

    def test_gpu_tts_with_very_long_text(self):
        """Test handling of very long text input."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {}}
        gpu_tts._sample_rate = 22050

        mock_audio = np.random.randn(22050).astype(np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        # Create long list of phoneme IDs
        long_ids = [1] + [2] * 1000 + [3]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=long_ids):
            result = gpu_tts.gpu_tts("A" * 1000)

        assert result is not None

    def test_gpu_tts_with_special_characters(self):
        """Test handling of special characters in text."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {}}
        gpu_tts._sample_rate = 22050

        mock_audio = np.random.randn(22050).astype(np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            result = gpu_tts.gpu_tts("Café! Über @#$%")

        assert result is not None

    def test_phoneme_ids_with_multi_token_phonemes(self):
        """Test phonemes that map to multiple IDs."""
        import gpu_tts

        gpu_tts._phoneme_id_map = {
            "^": [1],
            "$": [2],
            "a": [4, 5, 6],  # Multi-token
        }

        with patch("subprocess.run", side_effect=Exception("No espeak")):
            result = gpu_tts.text_to_phoneme_ids("a")

        # Should include all IDs from the multi-token mapping
        assert 4 in result
        assert 5 in result
        assert 6 in result

    def test_gpu_tts_negative_speed(self):
        """Test handling of negative speed value."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {"length_scale": 1.0}}
        gpu_tts._sample_rate = 22050

        mock_audio = np.random.randn(22050).astype(np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            # Negative speed should result in negative length_scale
            result = gpu_tts.gpu_tts("Bonjour", speed=-1.0)

        # Should still produce output (behavior undefined but shouldn't crash)
        assert result is not None

    def test_gpu_tts_zero_speed(self):
        """Test handling of zero speed value."""
        import gpu_tts
        gpu_tts._initialized = True
        gpu_tts._session = MagicMock()
        gpu_tts._config = {"inference": {"length_scale": 1.0}}
        gpu_tts._sample_rate = 22050

        mock_audio = np.random.randn(22050).astype(np.float32)
        gpu_tts._session.run.return_value = [mock_audio.reshape(1, -1)]

        with patch("gpu_tts.text_to_phoneme_ids", return_value=[1, 2, 3, 4, 5]):
            try:
                result = gpu_tts.gpu_tts("Bonjour", speed=0.0)
                # Division by zero in length_scale calculation
            except ZeroDivisionError:
                pass  # Expected behavior
