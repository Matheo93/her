"""
EVA-VOICE API Tests
Run with: pytest tests/ -v
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
import json
import os

# Set dev mode for tests
os.environ["EVA_DEV_MODE"] = "true"

from main import app, rate_limiter


@pytest.fixture
def client():
    """Create test client"""
    # Reset rate limiter for each test
    rate_limiter.requests.clear()
    return TestClient(app)


class TestHealthEndpoints:
    """Test health and status endpoints"""

    def test_root(self, client):
        """Test root endpoint returns service info"""
        response = client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "EVA-VOICE"
        assert data["status"] == "online"
        assert "features" in data

    def test_health(self, client):
        """Test health endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "groq" in data
        assert "tts" in data
        assert "database" in data

    def test_voices(self, client):
        """Test voices endpoint"""
        response = client.get("/voices")
        assert response.status_code == 200
        data = response.json()
        assert "voices" in data
        assert len(data["voices"]) >= 1
        # Check default voice exists
        default_voice = next((v for v in data["voices"] if v["default"]), None)
        assert default_voice is not None


class TestChatEndpoint:
    """Test chat endpoint"""

    def test_chat_success(self, client):
        """Test successful chat request"""
        response = client.post("/chat", json={
            "message": "Hello",
            "session_id": "test-session"
        })
        assert response.status_code == 200
        data = response.json()
        assert "response" in data
        assert data["session_id"] == "test-session"
        assert "latency_ms" in data
        assert "rate_limit_remaining" in data

    def test_chat_missing_message(self, client):
        """Test chat without message"""
        response = client.post("/chat", json={
            "session_id": "test"
        })
        assert response.status_code == 400
        assert "message required" in response.json()["detail"]

    def test_chat_message_too_long(self, client):
        """Test chat with message exceeding limit"""
        long_message = "x" * 2001
        response = client.post("/chat", json={
            "message": long_message,
            "session_id": "test"
        })
        assert response.status_code == 400
        assert "too long" in response.json()["detail"]


class TestTTSEndpoint:
    """Test TTS endpoint"""

    def test_tts_success(self, client):
        """Test successful TTS request"""
        response = client.post("/tts", json={
            "text": "Bonjour",
            "voice": "eva"
        })
        # TTS may not be available in test environment
        if response.status_code == 503:
            pytest.skip("TTS not available in test environment")
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/mpeg"
        assert len(response.content) > 0

    def test_tts_missing_text(self, client):
        """Test TTS without text"""
        response = client.post("/tts", json={
            "voice": "eva"
        })
        assert response.status_code == 400
        assert "text required" in response.json()["detail"]

    def test_tts_invalid_voice(self, client):
        """Test TTS with invalid voice"""
        response = client.post("/tts", json={
            "text": "Hello",
            "voice": "invalid-voice"
        })
        assert response.status_code == 400
        assert "Invalid voice" in response.json()["detail"]

    def test_tts_text_too_long(self, client):
        """Test TTS with text exceeding limit"""
        long_text = "x" * 1001
        response = client.post("/tts", json={
            "text": long_text,
            "voice": "eva"
        })
        assert response.status_code == 400
        assert "too long" in response.json()["detail"]


class TestRateLimiting:
    """Test rate limiting"""

    def test_rate_limiter_class(self):
        """Test RateLimiter class directly"""
        from main import RateLimiter
        limiter = RateLimiter()

        # Should allow first request
        assert limiter.is_allowed("test-client", limit=5, window=60) is True

        # Should track remaining
        assert limiter.get_remaining("test-client", limit=5, window=60) == 4

        # Exhaust the limit
        for _ in range(4):
            limiter.is_allowed("test-client", limit=5, window=60)

        # Should be blocked
        assert limiter.is_allowed("test-client", limit=5, window=60) is False
        assert limiter.get_remaining("test-client", limit=5, window=60) == 0

    def test_rate_limit_header(self, client):
        """Test rate limit remaining in response"""
        response = client.post("/chat", json={
            "message": "test",
            "session_id": "rate-test"
        })
        assert response.status_code == 200
        data = response.json()
        assert "rate_limit_remaining" in data
        assert data["rate_limit_remaining"] < 60


class TestClearConversation:
    """Test conversation clearing"""

    def test_clear_success(self, client):
        """Test clearing conversation"""
        # First create a conversation
        client.post("/chat", json={
            "message": "Hello",
            "session_id": "clear-test"
        })

        # Then clear it
        response = client.post("/clear", json={
            "session_id": "clear-test"
        })
        assert response.status_code == 200
        assert response.json()["status"] == "cleared"


class TestStats:
    """Test stats endpoint"""

    def test_stats(self, client):
        """Test stats endpoint"""
        response = client.get("/stats")
        assert response.status_code == 200
        data = response.json()
        # DB may not be available in test environment
        if "error" in data:
            pytest.skip("Database not available in test environment")
        assert "total_requests" in data
        assert "avg_latency_ms" in data
        assert "requests_last_hour" in data
        assert "active_sessions" in data


class TestInputValidation:
    """Test input validation"""

    def test_empty_json(self, client):
        """Test with empty JSON body"""
        response = client.post("/chat", json={})
        assert response.status_code == 400

    def test_invalid_json(self, client):
        """Test with invalid JSON"""
        response = client.post("/chat",
            content="not json",
            headers={"Content-Type": "application/json"}
        )
        assert response.status_code == 422  # Validation error


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
