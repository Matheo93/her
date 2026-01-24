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
