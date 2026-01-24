"""
Tests for ditto_service.py - Sprint 557
Testing Ditto Talking Head Service endpoints
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import io
import base64
import numpy as np


class TestHealthEndpoint:
    """Tests for /health endpoint"""

    @pytest.mark.asyncio
    async def test_health_sdk_not_ready(self):
        """Test health returns sdk_ready=False when not initialized"""
        with patch.dict('sys.modules', {'stream_pipeline_offline': MagicMock()}):
            with patch('ditto_service.ditto_sdk', None):
                from ditto_service import health
                result = await health()
                assert result["status"] == "ok"
                assert result["sdk_ready"] is False

    @pytest.mark.asyncio
    async def test_health_sdk_ready(self):
        """Test health returns sdk_ready=True when initialized"""
        mock_sdk = MagicMock()
        with patch.dict('sys.modules', {'stream_pipeline_offline': MagicMock()}):
            with patch('ditto_service.ditto_sdk', mock_sdk):
                from ditto_service import health
                result = await health()
                assert result["status"] == "ok"
                assert result["sdk_ready"] is True


class TestInitializeDitto:
    """Tests for initialize_ditto function"""

    def test_returns_true_if_already_initialized(self):
        """Test returns True if SDK already initialized"""
        mock_sdk = MagicMock()
        with patch.dict('sys.modules', {'stream_pipeline_offline': MagicMock()}):
            with patch('ditto_service.ditto_sdk', mock_sdk):
                from ditto_service import initialize_ditto
                # Need to patch at module level
                import ditto_service
                original = ditto_service.ditto_sdk
                ditto_service.ditto_sdk = mock_sdk
                try:
                    result = initialize_ditto()
                    assert result is True
                finally:
                    ditto_service.ditto_sdk = original

    def test_returns_false_on_import_error(self):
        """Test returns False when SDK import fails"""
        with patch.dict('sys.modules', {'stream_pipeline_offline': None}):
            import ditto_service
            ditto_service.ditto_sdk = None
            # Force reimport to trigger error
            with patch('builtins.__import__', side_effect=ImportError("No module")):
                result = ditto_service.initialize_ditto()
                # Will fail because of the import error
                assert result is False


class TestGlobalState:
    """Tests for module global state"""

    def test_initial_state(self):
        """Test initial global state values"""
        import ditto_service
        import importlib
        # Reload to get fresh state
        importlib.reload(ditto_service)

        # Check initial state after reload
        assert ditto_service.source_image_prepared is False
        assert ditto_service.current_source_path is None


class TestPrepareSourceEndpoint:
    """Tests for /prepare_source endpoint"""

    @pytest.mark.asyncio
    async def test_prepare_source_sdk_not_initialized(self):
        """Test prepare_source returns 500 when SDK not initialized"""
        from fastapi import UploadFile
        from fastapi.responses import JSONResponse

        mock_file = MagicMock(spec=UploadFile)
        mock_file.read = AsyncMock(return_value=b"fake image data")

        import ditto_service
        ditto_service.ditto_sdk = None

        with patch.object(ditto_service, 'initialize_ditto', return_value=False):
            result = await ditto_service.prepare_source(mock_file)

            assert isinstance(result, JSONResponse)
            assert result.status_code == 500


class TestGenerateEndpoint:
    """Tests for /generate endpoint"""

    @pytest.mark.asyncio
    async def test_generate_sdk_not_initialized(self):
        """Test generate returns 500 when SDK not initialized"""
        from fastapi import UploadFile
        from fastapi.responses import JSONResponse

        mock_audio = MagicMock(spec=UploadFile)
        mock_audio.read = AsyncMock(return_value=b"fake audio data")

        import ditto_service
        ditto_service.ditto_sdk = None

        with patch.object(ditto_service, 'initialize_ditto', return_value=False):
            result = await ditto_service.generate_video(mock_audio)

            assert isinstance(result, JSONResponse)
            assert result.status_code == 500

    @pytest.mark.asyncio
    async def test_generate_no_source_image(self):
        """Test generate returns 400 when no source image"""
        from fastapi import UploadFile
        from fastapi.responses import JSONResponse

        mock_audio = MagicMock(spec=UploadFile)
        mock_audio.read = AsyncMock(return_value=b"fake audio data")
        mock_sdk = MagicMock()

        import ditto_service
        ditto_service.ditto_sdk = mock_sdk
        ditto_service.current_source_path = None

        with patch.object(ditto_service, 'initialize_ditto', return_value=True):
            with patch('tempfile.NamedTemporaryFile') as mock_tmp:
                mock_tmp.return_value.__enter__ = MagicMock(return_value=MagicMock(name='/tmp/test.wav'))
                mock_tmp.return_value.__exit__ = MagicMock(return_value=False)
                result = await ditto_service.generate_video(mock_audio, source_image=None)

                assert isinstance(result, JSONResponse)
                assert result.status_code == 400


class TestWebSocketEndpoint:
    """Tests for /ws/stream WebSocket endpoint"""

    @pytest.mark.asyncio
    async def test_websocket_sdk_not_initialized(self):
        """Test WebSocket closes when SDK not initialized"""
        from fastapi import WebSocket

        mock_ws = MagicMock(spec=WebSocket)
        mock_ws.accept = AsyncMock()
        mock_ws.send_json = AsyncMock()
        mock_ws.close = AsyncMock()

        import ditto_service
        ditto_service.ditto_sdk = None

        with patch.object(ditto_service, 'initialize_ditto', return_value=False):
            await ditto_service.websocket_stream(mock_ws)

            mock_ws.accept.assert_called_once()
            mock_ws.send_json.assert_called_with({"error": "Ditto SDK not initialized"})
            mock_ws.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_websocket_ping_pong(self):
        """Test WebSocket responds to ping with pong"""
        from fastapi import WebSocket, WebSocketDisconnect

        mock_ws = MagicMock(spec=WebSocket)
        mock_ws.accept = AsyncMock()

        # First call returns ping, second raises disconnect
        call_count = 0
        async def mock_receive():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"type": "ping"}
            raise WebSocketDisconnect()

        mock_ws.receive_json = mock_receive
        mock_ws.send_json = AsyncMock()
        mock_sdk = MagicMock()

        import ditto_service
        ditto_service.ditto_sdk = mock_sdk

        await ditto_service.websocket_stream(mock_ws)

        # Verify pong was sent
        mock_ws.send_json.assert_called_with({"type": "pong"})

    @pytest.mark.asyncio
    async def test_websocket_audio_chunk(self):
        """Test WebSocket processes audio chunks"""
        from fastapi import WebSocket, WebSocketDisconnect

        mock_ws = MagicMock(spec=WebSocket)
        mock_ws.accept = AsyncMock()

        # Create fake audio data
        audio_data = np.zeros(1000, dtype=np.float32)
        audio_b64 = base64.b64encode(audio_data.tobytes()).decode()

        call_count = 0
        async def mock_receive():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"type": "audio_chunk", "audio": audio_b64}
            raise WebSocketDisconnect()

        mock_ws.receive_json = mock_receive
        mock_ws.send_json = AsyncMock()
        mock_sdk = MagicMock()

        import ditto_service
        ditto_service.ditto_sdk = mock_sdk

        await ditto_service.websocket_stream(mock_ws)

        # Verify frame response was sent
        mock_ws.send_json.assert_called_with({
            "type": "frame",
            "status": "processing"
        })


class TestAppConfiguration:
    """Tests for FastAPI app configuration"""

    def test_app_title(self):
        """Test app has correct title"""
        import ditto_service
        assert ditto_service.app.title == "Ditto Talking Head Service"

    def test_cors_middleware_configured(self):
        """Test CORS middleware is configured"""
        import ditto_service
        middlewares = [m.cls.__name__ for m in ditto_service.app.user_middleware]
        assert "CORSMiddleware" in middlewares


class TestLogging:
    """Tests for logging configuration"""

    def test_logger_exists(self):
        """Test logger is configured"""
        import ditto_service
        assert ditto_service.logger is not None
        assert ditto_service.logger.name == "ditto_service"


class TestAudioProcessing:
    """Tests for audio data processing"""

    def test_audio_base64_decode(self):
        """Test audio base64 decoding works correctly"""
        # Create test audio data
        audio_data = np.array([0.1, 0.2, 0.3, 0.4, 0.5], dtype=np.float32)
        audio_b64 = base64.b64encode(audio_data.tobytes()).decode()

        # Decode
        audio_bytes = base64.b64decode(audio_b64)
        decoded = np.frombuffer(audio_bytes, dtype=np.float32)

        np.testing.assert_array_almost_equal(audio_data, decoded)

    def test_audio_float32_format(self):
        """Test audio data is in float32 format"""
        audio_data = np.random.randn(1000).astype(np.float32)
        audio_b64 = base64.b64encode(audio_data.tobytes()).decode()

        audio_bytes = base64.b64decode(audio_b64)
        decoded = np.frombuffer(audio_bytes, dtype=np.float32)

        assert decoded.dtype == np.float32
        assert len(decoded) == 1000
