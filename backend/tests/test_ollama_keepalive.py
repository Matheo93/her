"""
Tests for ollama_keepalive.py - Sprint 552
Testing Ollama keepalive service functionality
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import httpx

from ollama_keepalive import (
    _warmup_once,
    _warmup_burst,
    is_warm,
    get_last_latency,
    ensure_warm,
    start_keepalive,
    stop_keepalive,
    OLLAMA_URL,
    OLLAMA_MODEL,
    KEEPALIVE_INTERVAL,
    KEEP_ALIVE_VALUE,
    WARMUP_BURST_COUNT,
    LATENCY_THRESHOLD_MS,
)


class TestConstants:
    """Tests for module constants"""

    def test_ollama_url_format(self):
        """Test OLLAMA_URL is valid"""
        assert OLLAMA_URL.startswith("http")
        assert "11434" in OLLAMA_URL

    def test_keepalive_interval_reasonable(self):
        """Test keepalive interval is reasonable"""
        assert 0.1 <= KEEPALIVE_INTERVAL <= 10

    def test_keep_alive_value(self):
        """Test keep_alive is infinite (-1)"""
        assert KEEP_ALIVE_VALUE == -1

    def test_warmup_burst_count(self):
        """Test warmup burst count is reasonable"""
        assert 1 <= WARMUP_BURST_COUNT <= 10

    def test_latency_threshold(self):
        """Test latency threshold is reasonable"""
        assert 50 <= LATENCY_THRESHOLD_MS <= 500


class TestWarmupOnce:
    """Tests for _warmup_once function"""

    @pytest.mark.asyncio
    async def test_warmup_success(self):
        """Test successful warmup returns True and latency"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,  # 10ms
            "eval_duration": 20_000_000,  # 20ms
        }

        with patch("ollama_keepalive._http_client") as mock_client:
            mock_client.post = AsyncMock(return_value=mock_response)
            success, latency = await _warmup_once()
            assert success is True
            assert latency > 0

    @pytest.mark.asyncio
    async def test_warmup_creates_client_if_none(self):
        """Test that warmup creates HTTP client if None"""
        import ollama_keepalive

        # Reset client
        ollama_keepalive._http_client = None

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 20_000_000,
        }

        with patch.object(httpx.AsyncClient, "post", new_callable=AsyncMock) as mock_post:
            mock_post.return_value = mock_response
            success, latency = await _warmup_once()
            # Client should be created
            assert ollama_keepalive._http_client is not None

    @pytest.mark.asyncio
    async def test_warmup_failure_status_code(self):
        """Test warmup failure on non-200 status"""
        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("ollama_keepalive._http_client") as mock_client:
            mock_client.post = AsyncMock(return_value=mock_response)
            success, latency = await _warmup_once()
            assert success is False
            assert latency == 0

    @pytest.mark.asyncio
    async def test_warmup_exception_handling(self):
        """Test warmup handles exceptions gracefully"""
        with patch("ollama_keepalive._http_client") as mock_client:
            mock_client.post = AsyncMock(side_effect=Exception("Connection failed"))
            success, latency = await _warmup_once()
            assert success is False
            assert latency == 0

    @pytest.mark.asyncio
    async def test_warmup_heavy_mode(self):
        """Test heavy warmup mode uses more tokens"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 50_000_000,  # Longer for heavy
        }

        with patch("ollama_keepalive._http_client") as mock_client:
            mock_client.post = AsyncMock(return_value=mock_response)
            success, latency = await _warmup_once(heavy=True)
            assert success is True

            # Check that request used heavy mode (10 tokens vs 3)
            call_args = mock_client.post.call_args
            json_data = call_args.kwargs.get("json") or call_args[1].get("json")
            assert json_data["options"]["num_predict"] == 10


class TestWarmupBurst:
    """Tests for _warmup_burst function"""

    @pytest.mark.asyncio
    async def test_warmup_burst_calls_warmup_multiple_times(self):
        """Test burst does multiple warmup calls"""
        call_count = 0

        async def mock_warmup(heavy=False):
            nonlocal call_count
            call_count += 1
            return True, 50.0

        with patch("ollama_keepalive._warmup_once", side_effect=mock_warmup):
            result = await _warmup_burst()
            assert result is True
            assert call_count == WARMUP_BURST_COUNT

    @pytest.mark.asyncio
    async def test_warmup_burst_fails_on_warmup_failure(self):
        """Test burst returns False if any warmup fails"""
        call_count = 0

        async def mock_warmup(heavy=False):
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                return False, 0
            return True, 50.0

        with patch("ollama_keepalive._warmup_once", side_effect=mock_warmup):
            result = await _warmup_burst()
            assert result is False

    @pytest.mark.asyncio
    async def test_warmup_burst_uses_heavy_for_first_three(self):
        """Test first 3 burst calls use heavy mode"""
        heavy_calls = []

        async def mock_warmup(heavy=False):
            heavy_calls.append(heavy)
            return True, 50.0

        with patch("ollama_keepalive._warmup_once", side_effect=mock_warmup):
            await _warmup_burst()
            # First 3 should be heavy
            assert heavy_calls[0] is True
            assert heavy_calls[1] is True
            assert heavy_calls[2] is True
            # Rest should be light
            if len(heavy_calls) > 3:
                assert heavy_calls[3] is False


class TestStateHelpers:
    """Tests for state helper functions"""

    def test_is_warm_initial(self):
        """Test is_warm returns False initially"""
        import ollama_keepalive
        ollama_keepalive._is_warm = False
        assert is_warm() is False

    def test_is_warm_after_warmup(self):
        """Test is_warm returns True after successful warmup"""
        import ollama_keepalive
        ollama_keepalive._is_warm = True
        assert is_warm() is True

    def test_get_last_latency_initial(self):
        """Test get_last_latency returns 0 initially"""
        import ollama_keepalive
        ollama_keepalive._last_latency = 0
        assert get_last_latency() == 0

    def test_get_last_latency_after_warmup(self):
        """Test get_last_latency returns correct value"""
        import ollama_keepalive
        ollama_keepalive._last_latency = 75.5
        assert get_last_latency() == 75.5


class TestEnsureWarm:
    """Tests for ensure_warm function"""

    @pytest.mark.asyncio
    async def test_ensure_warm_skips_if_warm(self):
        """Test ensure_warm returns 0 if already warm"""
        import ollama_keepalive
        ollama_keepalive._is_warm = True

        result = await ensure_warm()
        assert result == 0

    @pytest.mark.asyncio
    async def test_ensure_warm_warms_if_cold(self):
        """Test ensure_warm does warmup if cold"""
        import ollama_keepalive
        ollama_keepalive._is_warm = False

        async def mock_warmup(heavy=False):
            return True, 100.0

        with patch("ollama_keepalive._warmup_once", side_effect=mock_warmup):
            result = await ensure_warm()
            assert result == 100.0

    @pytest.mark.asyncio
    async def test_ensure_warm_returns_negative_on_failure(self):
        """Test ensure_warm returns -1 on failure"""
        import ollama_keepalive
        ollama_keepalive._is_warm = False

        async def mock_warmup(heavy=False):
            return False, 0

        with patch("ollama_keepalive._warmup_once", side_effect=mock_warmup):
            result = await ensure_warm()
            assert result == -1


class TestKeepaliveLifecycle:
    """Tests for start/stop keepalive"""

    @pytest.mark.asyncio
    async def test_start_keepalive_creates_task(self):
        """Test start_keepalive creates asyncio task"""
        import ollama_keepalive

        # Mock the loop to avoid actual execution
        with patch("ollama_keepalive._keepalive_loop", new_callable=AsyncMock):
            task = start_keepalive()
            assert task is not None
            assert isinstance(task, asyncio.Task)

            # Cleanup
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    def test_stop_keepalive_cancels_task(self):
        """Test stop_keepalive cancels the task"""
        import ollama_keepalive

        mock_task = MagicMock()
        ollama_keepalive._keepalive_task = mock_task

        stop_keepalive()

        mock_task.cancel.assert_called_once()
        assert ollama_keepalive._keepalive_task is None

    def test_stop_keepalive_handles_no_task(self):
        """Test stop_keepalive handles None task gracefully"""
        import ollama_keepalive
        ollama_keepalive._keepalive_task = None

        # Should not raise
        stop_keepalive()


class TestLatencyDetection:
    """Tests for latency spike detection"""

    @pytest.mark.asyncio
    async def test_latency_spike_triggers_rewarmup(self):
        """Test high latency triggers re-warmup burst"""
        import ollama_keepalive
        ollama_keepalive._is_warm = True

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 20_000_000,
        }

        with patch("ollama_keepalive._http_client") as mock_client:
            mock_client.post = AsyncMock(return_value=mock_response)

            # Simulate high latency by patching time
            # time.time() is called 3 times:
            # 1. For prompt selection (line 50)
            # 2. start = time.time() (line 56)
            # 3. time.time() - start (line 71) -> latency calc
            with patch("ollama_keepalive.time.time") as mock_time:
                mock_time.side_effect = [0, 0, 0.2]  # 3rd call gives 200ms latency

                success, latency = await _warmup_once()
                assert success is True
                # Latency = (0.2 - 0) * 1000 = 200ms > 150ms threshold
                assert latency == 200.0
                # Model should be marked cold due to high latency
                assert ollama_keepalive._is_warm is False
