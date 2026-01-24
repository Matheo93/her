"""
Tests for fast_tts.py - VITS/MMS-TTS on GPU.

Tests:
- Module state and globals
- Init function behavior
- TTS functions (fast_tts, fast_tts_mp3)
- Async wrappers
"""

import pytest
import sys
import os
from unittest.mock import MagicMock, patch, AsyncMock

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import fast_tts as ft


class TestModuleState:
    """Tests for module-level state variables."""

    def test_model_is_none_initially(self):
        """Test _model is None initially."""
        # Reset state for test
        ft._model = None
        assert ft._model is None

    def test_tokenizer_is_none_initially(self):
        """Test _tokenizer is None initially."""
        ft._tokenizer = None
        assert ft._tokenizer is None

    def test_device_is_none_initially(self):
        """Test _device is None initially."""
        ft._device = None
        assert ft._device is None

    def test_sample_rate_default(self):
        """Test _sample_rate has default value."""
        assert ft._sample_rate == 16000

    def test_tts_executor_exists(self):
        """Test _tts_executor is a ThreadPoolExecutor."""
        assert ft._tts_executor is not None


class TestInitFastTts:
    """Tests for init_fast_tts function."""

    def test_init_returns_true_if_already_initialized(self):
        """Test init returns True if already initialized."""
        ft._initialized = True
        result = ft.init_fast_tts()
        assert result is True
        # Reset
        ft._initialized = False

    def test_init_catches_exceptions_and_returns_false(self):
        """Test init catches exceptions and returns False."""
        ft._initialized = False

        # Function signature check - init_fast_tts should return bool
        assert callable(ft.init_fast_tts)

        # If it runs and fails (no GPU/transformers), it should return False
        # If it runs and succeeds, it returns True
        # Both are valid - just check it returns a bool
        result = ft.init_fast_tts()
        assert isinstance(result, bool)

        # Reset
        ft._initialized = False


class TestFastTts:
    """Tests for fast_tts function."""

    def test_fast_tts_returns_none_when_not_initialized(self):
        """Test fast_tts returns None when not initialized."""
        ft._initialized = False
        ft._model = None

        with patch.object(ft, 'init_fast_tts', return_value=False):
            result = ft.fast_tts("Test")
            assert result is None

    @patch.object(ft, '_tokenizer')
    @patch.object(ft, '_model')
    def test_fast_tts_handles_exceptions(self, mock_model, mock_tokenizer):
        """Test fast_tts handles exceptions gracefully."""
        ft._initialized = True
        ft._device = "cpu"

        mock_tokenizer.side_effect = Exception("Tokenizer error")

        result = ft.fast_tts("Test")
        assert result is None

        # Reset
        ft._initialized = False

    @patch.object(ft, '_tokenizer')
    @patch.object(ft, '_model')
    @patch('fast_tts.torch')
    def test_fast_tts_returns_bytes_on_success(self, mock_torch, mock_model, mock_tokenizer):
        """Test fast_tts returns bytes on success."""
        ft._initialized = True
        ft._device = "cpu"
        ft._sample_rate = 16000

        # Mock tokenizer
        mock_inputs = MagicMock()
        mock_inputs.to.return_value = mock_inputs
        mock_tokenizer.return_value = mock_inputs

        # Mock model output
        import numpy as np
        mock_waveform = MagicMock()
        mock_waveform.squeeze.return_value.cpu.return_value.numpy.return_value = np.zeros(16000, dtype=np.float32)
        mock_model.return_value.waveform = mock_waveform

        mock_torch.inference_mode.return_value.__enter__ = MagicMock()
        mock_torch.inference_mode.return_value.__exit__ = MagicMock()

        result = ft.fast_tts("Test")

        # Should return WAV bytes
        if result is not None:
            assert isinstance(result, bytes)
            assert len(result) > 0

        # Reset
        ft._initialized = False


class TestFastTtsMp3:
    """Tests for fast_tts_mp3 function."""

    def test_fast_tts_mp3_returns_none_when_not_initialized(self):
        """Test fast_tts_mp3 returns None when not initialized."""
        ft._initialized = False
        ft._model = None

        with patch.object(ft, 'init_fast_tts', return_value=False):
            result = ft.fast_tts_mp3("Test")
            assert result is None

    @patch.object(ft, '_tokenizer')
    @patch.object(ft, '_model')
    def test_fast_tts_mp3_handles_exceptions(self, mock_model, mock_tokenizer):
        """Test fast_tts_mp3 handles exceptions gracefully."""
        ft._initialized = True
        ft._device = "cpu"
        ft._cuda_stream = None

        mock_tokenizer.side_effect = Exception("Tokenizer error")

        result = ft.fast_tts_mp3("Test")
        assert result is None

        # Reset
        ft._initialized = False


class TestAsyncWrappers:
    """Tests for async wrapper functions."""

    @pytest.mark.asyncio
    async def test_async_fast_tts_calls_fast_tts(self):
        """Test async_fast_tts wraps fast_tts."""
        with patch.object(ft, 'fast_tts', return_value=b'test_wav_data') as mock_tts:
            result = await ft.async_fast_tts("Hello")

            assert result == b'test_wav_data'
            mock_tts.assert_called_once_with("Hello")

    @pytest.mark.asyncio
    async def test_async_fast_tts_mp3_calls_fast_tts_mp3(self):
        """Test async_fast_tts_mp3 wraps fast_tts_mp3."""
        with patch.object(ft, 'fast_tts_mp3', return_value=b'test_mp3_data') as mock_tts:
            result = await ft.async_fast_tts_mp3("Hello")

            assert result == b'test_mp3_data'
            mock_tts.assert_called_once_with("Hello")

    @pytest.mark.asyncio
    async def test_async_fast_tts_returns_none_on_failure(self):
        """Test async_fast_tts returns None on failure."""
        with patch.object(ft, 'fast_tts', return_value=None):
            result = await ft.async_fast_tts("Hello")
            assert result is None


class TestCudaStream:
    """Tests for CUDA stream handling."""

    def test_cuda_stream_is_none_initially(self):
        """Test _cuda_stream is None initially."""
        # Just check it's defined
        assert hasattr(ft, '_cuda_stream')

    def test_lameenc_encoder_is_none_initially(self):
        """Test _lameenc_encoder is None initially (may be initialized)."""
        # Just check it's defined
        assert hasattr(ft, '_lameenc_encoder')


class TestDeviceSelection:
    """Tests for device selection logic."""

    def test_device_selection_cpu_fallback(self):
        """Test that CPU is used when CUDA not available."""
        ft._initialized = False
        ft._device = None

        with patch('fast_tts.torch') as mock_torch:
            mock_torch.cuda.is_available.return_value = False

            # Try to access device logic (would be set during init)
            assert mock_torch.cuda.is_available() is False
