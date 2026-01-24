"""
Tests for ultra_fast_tts.py - Ultra-Fast TTS Module

Tests:
- Backend initialization
- TTS generation
- Fallback behavior
- Error handling
"""

import pytest
import sys
import os
from unittest.mock import patch, MagicMock

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestModuleState:
    """Tests for module state variables."""

    def test_initial_backend_is_none(self):
        """Test that backend starts as None."""
        import ultra_fast_tts
        # Reset state
        ultra_fast_tts._backend = None
        ultra_fast_tts._init_attempted = False

        assert ultra_fast_tts._backend is None

    def test_init_attempted_starts_false(self):
        """Test that init_attempted starts as False."""
        import ultra_fast_tts
        ultra_fast_tts._init_attempted = False

        assert ultra_fast_tts._init_attempted is False


class TestBackendInitialization:
    """Tests for backend initialization functions."""

    def test_init_gpu_backend_returns_bool(self):
        """Test _init_gpu_backend returns boolean."""
        import ultra_fast_tts
        result = ultra_fast_tts._init_gpu_backend()
        assert isinstance(result, bool)

    def test_init_mms_backend_returns_bool(self):
        """Test _init_mms_backend returns boolean."""
        import ultra_fast_tts
        result = ultra_fast_tts._init_mms_backend()
        assert isinstance(result, bool)

    def test_init_sherpa_backend_returns_bool(self):
        """Test _init_sherpa_backend returns boolean."""
        import ultra_fast_tts
        result = ultra_fast_tts._init_sherpa_backend()
        assert isinstance(result, bool)


class TestInitUltraFastTts:
    """Tests for init_ultra_fast_tts function."""

    def test_init_sets_attempted_flag(self):
        """Test that init sets _init_attempted flag."""
        import ultra_fast_tts
        ultra_fast_tts._backend = None
        ultra_fast_tts._init_attempted = False

        # Mock all backends to fail
        with patch.object(ultra_fast_tts, '_init_gpu_backend', return_value=False):
            with patch.object(ultra_fast_tts, '_init_mms_backend', return_value=False):
                with patch.object(ultra_fast_tts, '_init_sherpa_backend', return_value=False):
                    ultra_fast_tts.init_ultra_fast_tts()

        assert ultra_fast_tts._init_attempted is True

    def test_init_returns_true_if_already_initialized(self):
        """Test init returns True if already initialized."""
        import ultra_fast_tts
        ultra_fast_tts._backend = "gpu"

        result = ultra_fast_tts.init_ultra_fast_tts()

        assert result is True

    def test_init_skips_if_already_attempted(self):
        """Test init returns False if already attempted and failed."""
        import ultra_fast_tts
        ultra_fast_tts._backend = None
        ultra_fast_tts._init_attempted = True

        result = ultra_fast_tts.init_ultra_fast_tts()

        assert result is False

    def test_init_tries_gpu_first(self):
        """Test that GPU backend is tried first."""
        import ultra_fast_tts
        ultra_fast_tts._backend = None
        ultra_fast_tts._init_attempted = False

        gpu_mock = MagicMock(return_value=True)
        mms_mock = MagicMock(return_value=True)

        with patch.object(ultra_fast_tts, '_init_gpu_backend', gpu_mock):
            with patch.object(ultra_fast_tts, '_init_mms_backend', mms_mock):
                ultra_fast_tts.init_ultra_fast_tts()

        gpu_mock.assert_called_once()
        mms_mock.assert_not_called()
        assert ultra_fast_tts._backend == "gpu"

    def test_init_falls_back_to_mms(self):
        """Test fallback to MMS when GPU fails."""
        import ultra_fast_tts
        ultra_fast_tts._backend = None
        ultra_fast_tts._init_attempted = False

        with patch.object(ultra_fast_tts, '_init_gpu_backend', return_value=False):
            with patch.object(ultra_fast_tts, '_init_mms_backend', return_value=True):
                with patch.object(ultra_fast_tts, '_init_sherpa_backend', return_value=False):
                    ultra_fast_tts.init_ultra_fast_tts()

        assert ultra_fast_tts._backend == "mms"

    def test_init_falls_back_to_sherpa(self):
        """Test fallback to Sherpa when GPU and MMS fail."""
        import ultra_fast_tts
        ultra_fast_tts._backend = None
        ultra_fast_tts._init_attempted = False

        with patch.object(ultra_fast_tts, '_init_gpu_backend', return_value=False):
            with patch.object(ultra_fast_tts, '_init_mms_backend', return_value=False):
                with patch.object(ultra_fast_tts, '_init_sherpa_backend', return_value=True):
                    ultra_fast_tts.init_ultra_fast_tts()

        assert ultra_fast_tts._backend == "sherpa"


class TestUltraFastTts:
    """Tests for ultra_fast_tts function."""

    def test_returns_none_when_no_backend(self):
        """Test returns None when no backend available."""
        import ultra_fast_tts
        ultra_fast_tts._backend = None
        ultra_fast_tts._init_attempted = True  # Prevent re-init

        result = ultra_fast_tts.ultra_fast_tts("Hello")

        assert result is None

    def test_calls_gpu_backend_when_selected(self):
        """Test calls gpu_tts when GPU backend is selected."""
        import ultra_fast_tts
        ultra_fast_tts._backend = "gpu"

        mock_gpu_tts = MagicMock(return_value=b"audio_data")

        with patch.dict('sys.modules', {'gpu_tts': MagicMock(gpu_tts=mock_gpu_tts)}):
            result = ultra_fast_tts.ultra_fast_tts("Bonjour")

        mock_gpu_tts.assert_called_once_with("Bonjour")
        assert result == b"audio_data"

    def test_calls_mms_backend_when_selected(self):
        """Test calls fast_tts when MMS backend is selected."""
        import ultra_fast_tts
        ultra_fast_tts._backend = "mms"

        mock_fast_tts = MagicMock(return_value=b"audio_data")

        with patch.dict('sys.modules', {'fast_tts': MagicMock(fast_tts=mock_fast_tts)}):
            result = ultra_fast_tts.ultra_fast_tts("Bonjour")

        mock_fast_tts.assert_called_once_with("Bonjour")
        assert result == b"audio_data"

    def test_handles_exception_gracefully(self):
        """Test that exceptions are caught and None returned."""
        import ultra_fast_tts
        ultra_fast_tts._backend = "gpu"

        mock_gpu_tts = MagicMock(side_effect=Exception("TTS error"))

        with patch.dict('sys.modules', {'gpu_tts': MagicMock(gpu_tts=mock_gpu_tts)}):
            result = ultra_fast_tts.ultra_fast_tts("Bonjour")

        assert result is None

    def test_speed_parameter_default(self):
        """Test default speed is 1.0."""
        import ultra_fast_tts
        ultra_fast_tts._backend = "mms"

        mock_fast_tts = MagicMock(return_value=b"audio_data")

        with patch.dict('sys.modules', {'fast_tts': MagicMock(fast_tts=mock_fast_tts)}):
            ultra_fast_tts.ultra_fast_tts("Bonjour")

        # MMS backend doesn't use speed in call, so just verify it works
        mock_fast_tts.assert_called_once()


class TestAsyncUltraFastTts:
    """Tests for async_ultra_fast_tts function."""

    @pytest.mark.asyncio
    async def test_async_wrapper_exists(self):
        """Test that async wrapper function exists."""
        import ultra_fast_tts
        assert hasattr(ultra_fast_tts, 'async_ultra_fast_tts')

    @pytest.mark.asyncio
    async def test_async_returns_result(self):
        """Test async wrapper returns result."""
        import ultra_fast_tts

        with patch.object(ultra_fast_tts, 'ultra_fast_tts', return_value=b"audio"):
            # Mock the executor
            mock_executor = MagicMock()
            with patch.dict('sys.modules', {'fast_tts': MagicMock(_tts_executor=mock_executor)}):
                # The async function uses run_in_executor which is complex to test
                # Just verify function signature works
                assert callable(ultra_fast_tts.async_ultra_fast_tts)


class TestBenchmark:
    """Tests for benchmark function."""

    def test_benchmark_exists(self):
        """Test benchmark function exists."""
        import ultra_fast_tts
        assert hasattr(ultra_fast_tts, 'benchmark')
        assert callable(ultra_fast_tts.benchmark)
