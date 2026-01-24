"""
Tests for uvicorn_config.py - Sprint 554
Testing Uvicorn production configuration for HER/EVA
"""

import pytest
import os
import multiprocessing
from unittest.mock import patch


class TestServerConfig:
    """Tests for server configuration"""

    def test_bind_default(self):
        """Test default bind address"""
        with patch.dict(os.environ, {}, clear=True):
            # Re-import to get fresh values
            import importlib
            import uvicorn_config
            importlib.reload(uvicorn_config)

            # Default should be 0.0.0.0:8000
            assert uvicorn_config.bind == "0.0.0.0:8000"

    def test_bind_from_env(self):
        """Test bind address from environment"""
        with patch.dict(os.environ, {"UVICORN_BIND": "127.0.0.1:9000"}, clear=False):
            import importlib
            import uvicorn_config
            importlib.reload(uvicorn_config)

            assert uvicorn_config.bind == "127.0.0.1:9000"

    def test_workers_default(self):
        """Test default workers count"""
        with patch.dict(os.environ, {}, clear=True):
            import importlib
            import uvicorn_config
            importlib.reload(uvicorn_config)

            # Default should be min(4, cpu_count)
            expected = min(4, multiprocessing.cpu_count())
            assert uvicorn_config.workers == expected

    def test_workers_from_env(self):
        """Test workers count from environment"""
        with patch.dict(os.environ, {"UVICORN_WORKERS": "8"}, clear=False):
            import importlib
            import uvicorn_config
            importlib.reload(uvicorn_config)

            assert uvicorn_config.workers == 8

    def test_workers_max_capped(self):
        """Test workers count is capped at 4 by default"""
        with patch.dict(os.environ, {}, clear=True):
            with patch.object(multiprocessing, 'cpu_count', return_value=16):
                import importlib
                import uvicorn_config
                importlib.reload(uvicorn_config)

                # Should be min(4, 16) = 4
                assert uvicorn_config.workers == 4


class TestPerformanceConfig:
    """Tests for performance configuration"""

    def test_loop_uvloop(self):
        """Test event loop is uvloop"""
        import uvicorn_config
        assert uvicorn_config.loop == "uvloop"

    def test_http_httptools(self):
        """Test HTTP parser is httptools"""
        import uvicorn_config
        assert uvicorn_config.http == "httptools"

    def test_interface_asgi3(self):
        """Test interface is ASGI3"""
        import uvicorn_config
        assert uvicorn_config.interface == "asgi3"


class TestTimeoutConfig:
    """Tests for timeout configuration"""

    def test_timeout_keep_alive(self):
        """Test keep-alive timeout is low for voice apps"""
        import uvicorn_config
        assert uvicorn_config.timeout_keep_alive == 5
        # Low timeout is good for voice apps
        assert uvicorn_config.timeout_keep_alive < 30

    def test_timeout_notify(self):
        """Test notify timeout"""
        import uvicorn_config
        assert uvicorn_config.timeout_notify == 30


class TestConcurrencyConfig:
    """Tests for concurrency configuration"""

    def test_limit_concurrency(self):
        """Test concurrency limit is high"""
        import uvicorn_config
        assert uvicorn_config.limit_concurrency == 1000
        # Should handle many concurrent connections
        assert uvicorn_config.limit_concurrency >= 100

    def test_limit_max_requests(self):
        """Test max requests limit"""
        import uvicorn_config
        assert uvicorn_config.limit_max_requests == 10000
        # Should allow many requests before worker restart
        assert uvicorn_config.limit_max_requests >= 1000

    def test_backlog(self):
        """Test connection backlog"""
        import uvicorn_config
        assert uvicorn_config.backlog == 2048
        # High backlog for burst traffic
        assert uvicorn_config.backlog >= 1024


class TestWebSocketConfig:
    """Tests for WebSocket configuration"""

    def test_ws_max_size(self):
        """Test WebSocket max message size"""
        import uvicorn_config
        assert uvicorn_config.ws_max_size == 16777216
        # 16MB for audio chunks
        assert uvicorn_config.ws_max_size == 16 * 1024 * 1024

    def test_ws_ping_interval(self):
        """Test WebSocket ping interval"""
        import uvicorn_config
        assert uvicorn_config.ws_ping_interval == 20.0

    def test_ws_ping_timeout(self):
        """Test WebSocket ping timeout"""
        import uvicorn_config
        assert uvicorn_config.ws_ping_timeout == 20.0
        # Timeout should equal interval for reliability
        assert uvicorn_config.ws_ping_timeout == uvicorn_config.ws_ping_interval


class TestLoggingConfig:
    """Tests for logging configuration"""

    def test_access_log_enabled(self):
        """Test access log is enabled"""
        import uvicorn_config
        assert uvicorn_config.access_log is True

    def test_log_level_default(self):
        """Test default log level"""
        with patch.dict(os.environ, {}, clear=True):
            import importlib
            import uvicorn_config
            importlib.reload(uvicorn_config)

            assert uvicorn_config.log_level == "info"

    def test_log_level_from_env(self):
        """Test log level from environment"""
        with patch.dict(os.environ, {"LOG_LEVEL": "debug"}, clear=False):
            import importlib
            import uvicorn_config
            importlib.reload(uvicorn_config)

            assert uvicorn_config.log_level == "debug"


class TestSecurityConfig:
    """Tests for security configuration"""

    def test_forwarded_allow_ips(self):
        """Test forwarded IPs allow all (for reverse proxy)"""
        import uvicorn_config
        assert uvicorn_config.forwarded_allow_ips == "*"

    def test_proxy_headers_enabled(self):
        """Test proxy headers are enabled"""
        import uvicorn_config
        assert uvicorn_config.proxy_headers is True


class TestConfigValues:
    """Tests for specific config values"""

    def test_ws_max_size_in_mb(self):
        """Test WebSocket max size is exactly 16MB"""
        import uvicorn_config
        mb = uvicorn_config.ws_max_size / 1024 / 1024
        assert mb == 16.0

    def test_reasonable_backlog(self):
        """Test backlog is power of 2 (efficient)"""
        import uvicorn_config
        # 2048 is 2^11
        assert uvicorn_config.backlog & (uvicorn_config.backlog - 1) == 0

    def test_timeouts_reasonable(self):
        """Test timeouts are reasonable for voice apps"""
        import uvicorn_config
        # Keep-alive should be short for voice (quick connection cycling)
        assert uvicorn_config.timeout_keep_alive <= 10
        # Notify timeout should be longer but not too long
        assert 10 <= uvicorn_config.timeout_notify <= 60

    def test_concurrency_limits_balanced(self):
        """Test concurrency limits are balanced"""
        import uvicorn_config
        # Max requests per worker should be higher than concurrency
        assert uvicorn_config.limit_max_requests >= uvicorn_config.limit_concurrency


class TestVoiceAppOptimizations:
    """Tests specific to voice app optimizations"""

    def test_low_latency_config(self):
        """Test configuration is optimized for low latency"""
        import uvicorn_config

        # uvloop is faster than asyncio
        assert uvicorn_config.loop == "uvloop"

        # httptools is faster than h11
        assert uvicorn_config.http == "httptools"

        # Short keep-alive for voice streams
        assert uvicorn_config.timeout_keep_alive <= 10

    def test_high_throughput_config(self):
        """Test configuration supports high throughput"""
        import uvicorn_config

        # High concurrency limit
        assert uvicorn_config.limit_concurrency >= 500

        # High backlog for burst handling
        assert uvicorn_config.backlog >= 1024

    def test_websocket_audio_support(self):
        """Test WebSocket config supports audio streaming"""
        import uvicorn_config

        # 16MB allows for long audio chunks
        # At 16kHz 16-bit mono, 16MB = ~500 seconds of audio
        audio_seconds = uvicorn_config.ws_max_size / (16000 * 2)
        assert audio_seconds > 100  # At least 100 seconds
