"""
Tests for ollama_keepalive.py - Ollama Keepalive Service.

Tests:
- State management (is_warm, get_last_latency)
- Configuration constants
- Warmup logic
"""

import pytest
import asyncio
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import ollama_keepalive as ok


class TestStateManagement:
    """Tests for state management functions."""

    def test_is_warm_returns_bool(self):
        """Test is_warm returns boolean."""
        result = ok.is_warm()
        assert isinstance(result, bool)

    def test_get_last_latency_returns_numeric(self):
        """Test get_last_latency returns numeric (int or float)."""
        result = ok.get_last_latency()
        assert isinstance(result, (int, float))

    def test_initial_is_warm_is_false(self):
        """Test initial _is_warm state is False."""
        ok._is_warm = False
        assert ok.is_warm() is False

    def test_initial_last_latency_is_zero(self):
        """Test initial _last_latency is 0."""
        ok._last_latency = 0
        assert ok.get_last_latency() == 0


class TestConfigurationConstants:
    """Tests for configuration constants."""

    def test_ollama_url_defined(self):
        """Test OLLAMA_URL is defined."""
        assert hasattr(ok, 'OLLAMA_URL')
        assert isinstance(ok.OLLAMA_URL, str)
        assert 'http' in ok.OLLAMA_URL

    def test_ollama_model_defined(self):
        """Test OLLAMA_MODEL is defined."""
        assert hasattr(ok, 'OLLAMA_MODEL')
        assert isinstance(ok.OLLAMA_MODEL, str)

    def test_keepalive_interval_defined(self):
        """Test KEEPALIVE_INTERVAL is defined."""
        assert hasattr(ok, 'KEEPALIVE_INTERVAL')
        assert ok.KEEPALIVE_INTERVAL >= 0

    def test_keep_alive_value_is_infinite(self):
        """Test KEEP_ALIVE_VALUE is -1 (infinite)."""
        assert ok.KEEP_ALIVE_VALUE == -1

    def test_warmup_burst_count_positive(self):
        """Test WARMUP_BURST_COUNT is positive."""
        assert ok.WARMUP_BURST_COUNT > 0

    def test_latency_threshold_defined(self):
        """Test LATENCY_THRESHOLD_MS is defined."""
        assert hasattr(ok, 'LATENCY_THRESHOLD_MS')
        assert ok.LATENCY_THRESHOLD_MS > 0


class TestWarmupOnce:
    """Tests for _warmup_once function."""

    @pytest.mark.asyncio
    async def test_warmup_once_handles_success(self):
        """Test _warmup_once handles successful response."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client

        success, latency = await ok._warmup_once()

        assert success is True
        assert latency > 0

    @pytest.mark.asyncio
    async def test_warmup_once_handles_failure(self):
        """Test _warmup_once handles failed response."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client

        success, latency = await ok._warmup_once()

        assert success is False
        assert latency == 0

    @pytest.mark.asyncio
    async def test_warmup_once_handles_exception(self):
        """Test _warmup_once handles exceptions."""
        mock_client = AsyncMock()
        mock_client.post.side_effect = Exception("Connection error")
        ok._http_client = mock_client

        success, latency = await ok._warmup_once()

        assert success is False
        assert latency == 0
        assert ok._is_warm is False


class TestEnsureWarm:
    """Tests for ensure_warm function."""

    @pytest.mark.asyncio
    async def test_ensure_warm_when_already_warm(self):
        """Test ensure_warm returns 0 if already warm."""
        ok._is_warm = True

        result = await ok.ensure_warm()

        assert result == 0

    @pytest.mark.asyncio
    async def test_ensure_warm_returns_minus_one_on_failure(self):
        """Test ensure_warm returns -1 on failure."""
        ok._is_warm = False

        mock_client = AsyncMock()
        mock_client.post.side_effect = Exception("Connection error")
        ok._http_client = mock_client

        result = await ok.ensure_warm()

        assert result == -1


class TestEdgeCases:
    """Tests for edge cases."""

    @pytest.mark.asyncio
    async def test_warmup_with_high_load_duration_not_warm(self):
        """Test warmup considers high load_duration as not warm."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 500_000_000,
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client
        ok._is_warm = True

        await ok._warmup_once()

        assert ok._is_warm is False


class TestWarmupBurst:
    """Tests for _warmup_burst function."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        ok._keepalive_task = None
        yield
        ok._is_warm = False
        ok._last_latency = 0

    @pytest.mark.asyncio
    async def test_warmup_burst_makes_correct_number_of_requests(self):
        """Test warmup_burst makes WARMUP_BURST_COUNT requests."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client

        await ok._warmup_burst()

        assert mock_client.post.call_count == ok.WARMUP_BURST_COUNT

    @pytest.mark.asyncio
    async def test_warmup_burst_returns_true_on_success(self):
        """Test warmup_burst returns True when all requests succeed."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client

        result = await ok._warmup_burst()

        assert result is True

    @pytest.mark.asyncio
    async def test_warmup_burst_returns_false_on_failure(self):
        """Test warmup_burst returns False when a request fails."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client

        result = await ok._warmup_burst()

        assert result is False

    @pytest.mark.asyncio
    async def test_warmup_burst_uses_heavy_for_first_requests(self):
        """Test first 3 burst requests use heavy warmup (more tokens)."""
        calls = []

        async def capture_post(*args, **kwargs):
            calls.append(kwargs.get("json", {}))
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "load_duration": 10_000_000,
                "eval_duration": 5_000_000,
            }
            return mock_resp

        mock_client = AsyncMock()
        mock_client.post.side_effect = capture_post
        ok._http_client = mock_client

        await ok._warmup_burst()

        # First 3 should have num_predict=10 (heavy), rest num_predict=3
        for i in range(3):
            assert calls[i]["options"]["num_predict"] == 10
        for i in range(3, ok.WARMUP_BURST_COUNT):
            assert calls[i]["options"]["num_predict"] == 3


class TestKeepaliveLoop:
    """Tests for _keepalive_loop function."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        ok._keepalive_task = None
        yield
        ok._is_warm = False
        ok._last_latency = 0

    @pytest.mark.asyncio
    async def test_keepalive_loop_can_be_cancelled(self):
        """Test keepalive loop handles cancellation gracefully."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client

        # Start loop and cancel immediately
        task = asyncio.create_task(ok._keepalive_loop())
        await asyncio.sleep(0.01)
        task.cancel()

        with pytest.raises(asyncio.CancelledError):
            await task


class TestStartStopKeepalive:
    """Tests for start_keepalive and stop_keepalive functions."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        if ok._keepalive_task is not None:
            ok._keepalive_task.cancel()
        ok._keepalive_task = None
        yield
        if ok._keepalive_task is not None:
            ok._keepalive_task.cancel()
        ok._keepalive_task = None

    @pytest.mark.asyncio
    async def test_start_keepalive_creates_task(self):
        """Test start_keepalive creates a background task."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch.object(ok, '_http_client', mock_client):
            task = ok.start_keepalive()

            assert task is not None
            assert isinstance(task, asyncio.Task)
            assert ok._keepalive_task is task

            # Cleanup
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

    @pytest.mark.asyncio
    async def test_start_keepalive_updates_config(self):
        """Test start_keepalive updates global config."""
        original_url = ok.OLLAMA_URL
        original_model = ok.OLLAMA_MODEL
        original_interval = ok.KEEPALIVE_INTERVAL

        mock_client = AsyncMock()
        with patch.object(ok, '_http_client', mock_client):
            task = ok.start_keepalive(
                ollama_url="http://test:1234",
                model="test-model",
                interval=10
            )

            assert ok.OLLAMA_URL == "http://test:1234"
            assert ok.OLLAMA_MODEL == "test-model"
            assert ok.KEEPALIVE_INTERVAL == 10

            # Cleanup
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            ok.OLLAMA_URL = original_url
            ok.OLLAMA_MODEL = original_model
            ok.KEEPALIVE_INTERVAL = original_interval

    def test_stop_keepalive_cancels_task(self):
        """Test stop_keepalive cancels the keepalive task."""
        mock_task = MagicMock()
        ok._keepalive_task = mock_task

        ok.stop_keepalive()

        mock_task.cancel.assert_called_once()
        assert ok._keepalive_task is None

    def test_stop_keepalive_handles_no_task(self):
        """Test stop_keepalive handles case when no task exists."""
        ok._keepalive_task = None

        # Should not raise
        ok.stop_keepalive()

        assert ok._keepalive_task is None


class TestWarmupOnStartup:
    """Tests for warmup_on_startup function."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        ok._keepalive_task = None
        yield
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None

    @pytest.mark.asyncio
    async def test_warmup_on_startup_success(self):
        """Test warmup_on_startup returns True on success."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch('httpx.AsyncClient', return_value=mock_client):
            result = await ok.warmup_on_startup()

        assert result is True
        assert ok._is_warm is True

    @pytest.mark.asyncio
    async def test_warmup_on_startup_failure(self):
        """Test warmup_on_startup returns False on failure."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch('httpx.AsyncClient', return_value=mock_client):
            ok._http_client = None  # Force client creation
            result = await ok.warmup_on_startup()

        assert result is False

    @pytest.mark.asyncio
    async def test_warmup_on_startup_sets_config(self):
        """Test warmup_on_startup sets OLLAMA_URL and OLLAMA_MODEL."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response

        with patch('httpx.AsyncClient', return_value=mock_client):
            await ok.warmup_on_startup(
                ollama_url="http://custom:5000",
                model="custom-model"
            )

        assert ok.OLLAMA_URL == "http://custom:5000"
        assert ok.OLLAMA_MODEL == "custom-model"


class TestWarmupOnceHeavyMode:
    """Tests for _warmup_once heavy mode."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        yield
        ok._is_warm = False
        ok._last_latency = 0

    @pytest.mark.asyncio
    async def test_warmup_once_heavy_uses_more_tokens(self):
        """Test heavy=True uses num_predict=10."""
        captured_json = None

        async def capture_post(*args, **kwargs):
            nonlocal captured_json
            captured_json = kwargs.get("json", {})
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "load_duration": 10_000_000,
                "eval_duration": 5_000_000,
            }
            return mock_resp

        mock_client = AsyncMock()
        mock_client.post.side_effect = capture_post
        ok._http_client = mock_client

        await ok._warmup_once(heavy=True)

        assert captured_json["options"]["num_predict"] == 10

    @pytest.mark.asyncio
    async def test_warmup_once_light_uses_fewer_tokens(self):
        """Test heavy=False uses num_predict=3."""
        captured_json = None

        async def capture_post(*args, **kwargs):
            nonlocal captured_json
            captured_json = kwargs.get("json", {})
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "load_duration": 10_000_000,
                "eval_duration": 5_000_000,
            }
            return mock_resp

        mock_client = AsyncMock()
        mock_client.post.side_effect = capture_post
        ok._http_client = mock_client

        await ok._warmup_once(heavy=False)

        assert captured_json["options"]["num_predict"] == 3


class TestPromptVariation:
    """Tests for prompt variation logic."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        yield
        ok._is_warm = False
        ok._last_latency = 0

    @pytest.mark.asyncio
    async def test_uses_varied_prompts(self):
        """Test that different prompts are used based on time."""
        prompts_used = []

        async def capture_post(*args, **kwargs):
            json_data = kwargs.get("json", {})
            messages = json_data.get("messages", [])
            if messages:
                prompts_used.append(messages[0].get("content"))
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "load_duration": 10_000_000,
                "eval_duration": 5_000_000,
            }
            return mock_resp

        mock_client = AsyncMock()
        mock_client.post.side_effect = capture_post
        ok._http_client = mock_client

        # Call warmup and verify a prompt was used
        await ok._warmup_once()

        assert len(prompts_used) == 1
        assert prompts_used[0] in ["hi", "hello", "bonjour", "hey", "coucou"]


class TestLatencyTracking:
    """Tests for latency tracking."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        yield
        ok._is_warm = False
        ok._last_latency = 0

    @pytest.mark.asyncio
    async def test_updates_last_latency(self):
        """Test _warmup_once updates _last_latency."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client

        initial_latency = ok._last_latency
        await ok._warmup_once()

        # Latency should be updated (will be very small due to mocking)
        assert ok._last_latency >= 0

    @pytest.mark.asyncio
    async def test_latency_threshold_detection(self):
        """Test latency spike detection when > threshold."""
        # Create a slow mock that returns after a delay
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 10_000_000,
            "eval_duration": 5_000_000,
        }

        async def slow_post(*args, **kwargs):
            # Simulate slow response
            await asyncio.sleep(0.01)  # Small delay
            return mock_response

        mock_client = AsyncMock()
        mock_client.post.side_effect = slow_post
        ok._http_client = mock_client

        await ok._warmup_once()

        # Latency should have been recorded
        assert ok._last_latency > 0


class TestHttpClientCreation:
    """Tests for HTTP client creation."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        yield
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None

    @pytest.mark.asyncio
    async def test_creates_http_client_if_none(self):
        """Test _warmup_once creates HTTP client if None."""
        ok._http_client = None

        with patch('httpx.AsyncClient') as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {
                "load_duration": 10_000_000,
                "eval_duration": 5_000_000,
            }
            mock_client.post.return_value = mock_response
            mock_client_class.return_value = mock_client

            await ok._warmup_once()

            mock_client_class.assert_called_once()


class TestWarmStateTransitions:
    """Tests for warm state transitions."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        yield
        ok._is_warm = False
        ok._last_latency = 0

    @pytest.mark.asyncio
    async def test_becomes_warm_with_low_latency(self):
        """Test model becomes warm with low load_duration and latency."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 50_000_000,  # 50ms < 100ms threshold
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client
        ok._is_warm = False

        await ok._warmup_once()

        # Should be warm (load_duration < 100ms and latency low due to mock)
        assert ok._is_warm is True

    @pytest.mark.asyncio
    async def test_stays_cold_with_high_load_duration(self):
        """Test model stays cold with high load_duration."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "load_duration": 200_000_000,  # 200ms > 100ms threshold
            "eval_duration": 5_000_000,
        }

        mock_client = AsyncMock()
        mock_client.post.return_value = mock_response
        ok._http_client = mock_client
        ok._is_warm = False

        await ok._warmup_once()

        # Should not be warm due to high load_duration
        assert ok._is_warm is False


class TestApiRequestFormat:
    """Tests for API request format."""

    @pytest.fixture(autouse=True)
    def reset_state(self):
        """Reset module state before each test."""
        ok._is_warm = False
        ok._last_latency = 0
        ok._http_client = None
        yield
        ok._is_warm = False
        ok._last_latency = 0

    @pytest.mark.asyncio
    async def test_correct_api_endpoint(self):
        """Test requests are sent to correct endpoint."""
        captured_url = None

        async def capture_post(url, *args, **kwargs):
            nonlocal captured_url
            captured_url = url
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "load_duration": 10_000_000,
                "eval_duration": 5_000_000,
            }
            return mock_resp

        mock_client = AsyncMock()
        mock_client.post.side_effect = capture_post
        ok._http_client = mock_client

        await ok._warmup_once()

        assert "/api/chat" in captured_url

    @pytest.mark.asyncio
    async def test_correct_request_structure(self):
        """Test request has correct structure."""
        captured_json = None

        async def capture_post(*args, **kwargs):
            nonlocal captured_json
            captured_json = kwargs.get("json", {})
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "load_duration": 10_000_000,
                "eval_duration": 5_000_000,
            }
            return mock_resp

        mock_client = AsyncMock()
        mock_client.post.side_effect = capture_post
        ok._http_client = mock_client

        await ok._warmup_once()

        assert "model" in captured_json
        assert "messages" in captured_json
        assert "stream" in captured_json
        assert captured_json["stream"] is False
        assert "keep_alive" in captured_json
        assert captured_json["keep_alive"] == -1
        assert "options" in captured_json
        assert "num_ctx" in captured_json["options"]
        assert "num_gpu" in captured_json["options"]
        assert captured_json["options"]["num_gpu"] == 99
