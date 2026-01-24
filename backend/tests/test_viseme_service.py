"""
Tests for viseme_service.py - Sprint 550
Testing viseme lip-sync audio analysis
"""

import pytest
import numpy as np
from unittest.mock import patch, MagicMock

from viseme_service import (
    AudioAnalyzer,
    VISEME_NAMES,
    VISEME_PARAMS,
    SAMPLE_RATE,
    _SILENCE_WEIGHT,
    _ENERGY_THRESHOLD,
    _ZCR_THRESHOLD,
    _CENTROID_HIGH,
    _CENTROID_MID,
    _CENTROID_LOW,
)


class TestConstants:
    """Tests for module-level constants"""

    def test_viseme_names_is_tuple(self):
        """Sprint 550: VISEME_NAMES should be tuple for immutability"""
        assert isinstance(VISEME_NAMES, tuple)
        assert len(VISEME_NAMES) == 12

    def test_viseme_names_content(self):
        """Test all expected viseme names are present"""
        expected = {"sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "RR", "AA", "EE", "OO"}
        assert set(VISEME_NAMES) == expected

    def test_viseme_params_keys(self):
        """Test VISEME_PARAMS has all viseme keys"""
        for name in VISEME_NAMES:
            assert name in VISEME_PARAMS

    def test_viseme_params_format(self):
        """Test VISEME_PARAMS values are (open, wide, round) tuples"""
        for name, params in VISEME_PARAMS.items():
            assert isinstance(params, tuple)
            assert len(params) == 3
            for p in params:
                assert 0.0 <= p <= 1.0

    def test_silence_weight_constant(self):
        """Test _SILENCE_WEIGHT is pre-computed correctly"""
        assert _SILENCE_WEIGHT == {"sil": 1.0}

    def test_threshold_constants(self):
        """Test threshold constants are reasonable"""
        assert 0 < _ENERGY_THRESHOLD < 1
        assert 0 < _ZCR_THRESHOLD < 1
        assert 0 < _CENTROID_LOW < _CENTROID_MID < _CENTROID_HIGH <= 1

    def test_sample_rate(self):
        """Test SAMPLE_RATE is 16kHz"""
        assert SAMPLE_RATE == 16000


class TestAudioAnalyzer:
    """Tests for AudioAnalyzer class"""

    def test_init(self):
        """Test AudioAnalyzer initialization"""
        analyzer = AudioAnalyzer()
        assert analyzer.prev_energy == 0
        assert analyzer.smoothing == 0.3

    def test_analyze_empty_audio(self):
        """Test analyze_chunk with empty audio returns silence"""
        analyzer = AudioAnalyzer()
        result = analyzer.analyze_chunk(np.array([]))
        assert result == {"sil": 1.0}
        # Should return pre-computed constant
        assert result is _SILENCE_WEIGHT

    def test_analyze_silent_audio(self):
        """Test analyze_chunk with very low energy audio returns silence"""
        analyzer = AudioAnalyzer()
        # Very low amplitude signal
        audio = np.zeros(1024, dtype=np.float32)
        audio[:10] = 0.001  # Tiny amplitude
        result = analyzer.analyze_chunk(audio)
        assert "sil" in result

    def test_analyze_loud_audio(self):
        """Test analyze_chunk with loud audio returns viseme weights"""
        analyzer = AudioAnalyzer()
        # Generate a loud sine wave
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 440 * t) * 0.8
        result = analyzer.analyze_chunk(audio)
        # Should have some viseme weights
        assert len(result) > 0
        # Total weights should sum to ~1.0
        assert 0.9 <= sum(result.values()) <= 1.1

    def test_energy_smoothing(self):
        """Test that energy is smoothed across calls"""
        analyzer = AudioAnalyzer()

        # First call with loud audio
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        loud_audio = np.sin(2 * np.pi * 440 * t) * 0.8
        analyzer.analyze_chunk(loud_audio)
        energy_after_loud = analyzer.prev_energy

        # Second call with silent audio
        silent_audio = np.zeros(1600, dtype=np.float32)
        analyzer.analyze_chunk(silent_audio)
        energy_after_silent = analyzer.prev_energy

        # Energy should decrease but not immediately to zero
        assert energy_after_silent < energy_after_loud
        assert energy_after_silent > 0

    def test_spectral_analysis_bright_sound(self):
        """Test analysis of bright (high frequency) sounds"""
        analyzer = AudioAnalyzer()
        # High frequency sine wave (bright sound like 'EE' or 'SS')
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 3000 * t) * 0.5
        result = analyzer.analyze_chunk(audio)
        # Should detect bright vowels or fricatives
        total = sum(result.values())
        assert total > 0.5

    def test_spectral_analysis_dark_sound(self):
        """Test analysis of dark (low frequency) sounds"""
        analyzer = AudioAnalyzer()
        # Low frequency sine wave (dark sound like 'OO')
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 200 * t) * 0.5
        result = analyzer.analyze_chunk(audio)
        # Should detect round vowels
        total = sum(result.values())
        assert total > 0.5

    def test_short_audio_handling(self):
        """Test handling of audio shorter than FFT window"""
        analyzer = AudioAnalyzer()
        # Short audio (< 512 samples)
        audio = np.sin(np.linspace(0, 1, 256)) * 0.5
        audio = audio.astype(np.float32)
        result = analyzer.analyze_chunk(audio)
        # Should still work with default centroid
        assert len(result) > 0

    def test_viseme_weights_valid(self):
        """Test all viseme weights are between 0 and 1"""
        analyzer = AudioAnalyzer()
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 800 * t) * 0.6
        result = analyzer.analyze_chunk(audio)

        for viseme, weight in result.items():
            assert viseme in VISEME_NAMES
            assert 0.0 <= weight <= 1.0

    def test_normalization_handles_zero_max(self):
        """Test normalization handles all-zero audio"""
        analyzer = AudioAnalyzer()
        audio = np.zeros(1024, dtype=np.float32)
        result = analyzer.analyze_chunk(audio)
        assert result == {"sil": 1.0}

    def test_custom_sample_rate(self):
        """Test analyze_chunk with custom sample rate"""
        analyzer = AudioAnalyzer()
        t = np.linspace(0, 0.1, 4800, dtype=np.float32)  # 48kHz
        audio = np.sin(2 * np.pi * 440 * t) * 0.5
        result = analyzer.analyze_chunk(audio, sr=48000)
        assert len(result) > 0


class TestVisemeMapping:
    """Tests for viseme classification logic"""

    def test_fricative_high_centroid(self):
        """Test fricatives with high spectral centroid (SS, EE)"""
        analyzer = AudioAnalyzer()
        # Simulate high ZCR + high centroid
        # Using white noise-like signal
        np.random.seed(42)
        audio = np.random.randn(1600).astype(np.float32) * 0.3
        result = analyzer.analyze_chunk(audio)
        # Should have some weights
        assert len(result) > 0

    def test_silence_added_when_total_low(self):
        """Test that silence weight is added when total < 1.0"""
        analyzer = AudioAnalyzer()
        # Any active audio should have weights that may need silence padding
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 500 * t) * 0.3
        result = analyzer.analyze_chunk(audio)
        # Total should be close to 1.0
        total = sum(result.values())
        assert 0.95 <= total <= 1.05


class TestIntegration:
    """Integration tests"""

    def test_continuous_audio_stream(self):
        """Test processing continuous audio stream"""
        analyzer = AudioAnalyzer()

        # Simulate 1 second of audio in 40ms chunks
        chunk_size = int(SAMPLE_RATE * 0.04)
        t = np.linspace(0, 1, SAMPLE_RATE, dtype=np.float32)
        full_audio = np.sin(2 * np.pi * 440 * t) * 0.5

        results = []
        for i in range(0, len(full_audio), chunk_size):
            chunk = full_audio[i:i + chunk_size]
            if len(chunk) > 0:
                result = analyzer.analyze_chunk(chunk)
                results.append(result)

        # Should have ~25 chunks
        assert len(results) >= 24
        # All results should be valid
        for result in results:
            assert isinstance(result, dict)
            assert sum(result.values()) > 0.5

    def test_audio_with_silence_gaps(self):
        """Test audio with alternating sound and silence"""
        analyzer = AudioAnalyzer()

        # 100ms of sound
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        sound = np.sin(2 * np.pi * 440 * t) * 0.5
        result1 = analyzer.analyze_chunk(sound)

        # 100ms of silence
        silence = np.zeros(1600, dtype=np.float32)
        result2 = analyzer.analyze_chunk(silence)

        # Sound should have active visemes
        assert "sil" not in result1 or result1.get("sil", 0) < 0.9

        # After silence, energy should still be partially high due to smoothing
        # but next call should return more silence
        result3 = analyzer.analyze_chunk(silence)
        # Eventually should converge to silence
        assert result3.get("sil", 0) > result2.get("sil", 0) or result2.get("sil", 0) > 0.5


class TestAudioAnalyzerEdgeCases:
    """Additional edge case tests for AudioAnalyzer"""

    def test_analyze_single_sample(self):
        """Test analyze_chunk with single sample"""
        analyzer = AudioAnalyzer()
        audio = np.array([0.5], dtype=np.float32)
        result = analyzer.analyze_chunk(audio)
        assert isinstance(result, dict)

    def test_analyze_negative_values(self):
        """Test analyze_chunk with negative audio values"""
        analyzer = AudioAnalyzer()
        audio = np.array([-0.5, -0.3, -0.8, -0.2] * 400, dtype=np.float32)
        result = analyzer.analyze_chunk(audio)
        assert len(result) > 0

    def test_analyze_max_amplitude(self):
        """Test analyze_chunk with max amplitude (1.0)"""
        analyzer = AudioAnalyzer()
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 440 * t) * 1.0
        result = analyzer.analyze_chunk(audio)
        total = sum(result.values())
        assert 0.9 <= total <= 1.1

    def test_analyze_dc_offset(self):
        """Test analyze_chunk with DC offset"""
        analyzer = AudioAnalyzer()
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 440 * t) * 0.5 + 0.3  # DC offset
        result = analyzer.analyze_chunk(audio)
        assert len(result) > 0

    def test_analyze_clipped_audio(self):
        """Test analyze_chunk with clipped/distorted audio"""
        analyzer = AudioAnalyzer()
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 440 * t) * 2.0  # Intentionally over 1.0
        audio = np.clip(audio, -1.0, 1.0).astype(np.float32)
        result = analyzer.analyze_chunk(audio)
        assert len(result) > 0

    def test_analyze_impulse(self):
        """Test analyze_chunk with impulse (single spike)"""
        analyzer = AudioAnalyzer()
        audio = np.zeros(1600, dtype=np.float32)
        audio[800] = 1.0  # Single impulse
        result = analyzer.analyze_chunk(audio)
        assert isinstance(result, dict)

    def test_analyze_square_wave(self):
        """Test analyze_chunk with square wave (high harmonics)"""
        analyzer = AudioAnalyzer()
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sign(np.sin(2 * np.pi * 440 * t)) * 0.5
        audio = audio.astype(np.float32)
        result = analyzer.analyze_chunk(audio)
        # Square wave has high ZCR, should detect fricatives
        assert len(result) > 0

    def test_prev_energy_persistence(self):
        """Test that prev_energy persists across multiple calls"""
        analyzer = AudioAnalyzer()
        assert analyzer.prev_energy == 0

        # First call with loud audio
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 440 * t) * 0.8
        analyzer.analyze_chunk(audio)

        assert analyzer.prev_energy > 0

    def test_multiple_analyzers_independent(self):
        """Test that multiple AudioAnalyzer instances are independent"""
        analyzer1 = AudioAnalyzer()
        analyzer2 = AudioAnalyzer()

        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 440 * t) * 0.8

        analyzer1.analyze_chunk(audio)

        assert analyzer1.prev_energy > 0
        assert analyzer2.prev_energy == 0


class TestZCRBranches:
    """Tests for zero crossing rate branches in analyze_chunk"""

    def test_high_zcr_high_centroid(self):
        """Test high ZCR + high centroid -> SS, EE"""
        analyzer = AudioAnalyzer()
        # White noise has high ZCR
        np.random.seed(42)
        audio = np.random.randn(1600).astype(np.float32) * 0.5
        result = analyzer.analyze_chunk(audio)
        # Should produce some weights
        assert len(result) > 0

    def test_high_zcr_low_centroid(self):
        """Test high ZCR + low centroid -> FF, TH"""
        analyzer = AudioAnalyzer()
        # Low-pass filtered noise has high ZCR but low centroid
        np.random.seed(42)
        noise = np.random.randn(1600).astype(np.float32) * 0.3
        # Simple low-pass: moving average
        kernel = np.ones(10) / 10
        audio = np.convolve(noise, kernel, mode='same').astype(np.float32)
        result = analyzer.analyze_chunk(audio)
        assert len(result) > 0


class TestCentroidBranches:
    """Tests for spectral centroid branches"""

    def test_mid_centroid_bright_vowels(self):
        """Test mid centroid -> EE, AA (bright vowels)"""
        analyzer = AudioAnalyzer()
        # Mid-frequency sine wave
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 1500 * t) * 0.5
        result = analyzer.analyze_chunk(audio)
        assert len(result) > 0

    def test_low_centroid_round_vowels(self):
        """Test low centroid -> OO, RR (round vowels)"""
        analyzer = AudioAnalyzer()
        # Low-frequency sine wave
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 150 * t) * 0.5
        result = analyzer.analyze_chunk(audio)
        assert len(result) > 0

    def test_default_open_vowels(self):
        """Test default case -> AA, EE (open vowels)"""
        analyzer = AudioAnalyzer()
        # Mid-range frequency
        t = np.linspace(0, 0.1, 1600, dtype=np.float32)
        audio = np.sin(2 * np.pi * 600 * t) * 0.4
        result = analyzer.analyze_chunk(audio)
        assert len(result) > 0


class TestWarpMouth:
    """Tests for warp_mouth function"""

    def test_warp_mouth_basic(self):
        """Test basic warp_mouth functionality"""
        from viseme_service import warp_mouth

        # Create dummy image
        img = np.zeros((200, 200, 4), dtype=np.uint8)
        img[:, :, 3] = 255  # Alpha channel

        # Create dummy landmarks (68 points)
        landmarks = np.zeros((68, 2), dtype=np.float32)
        # Set mouth landmarks (48-67) around center
        for i in range(48, 68):
            landmarks[i] = [100 + (i - 58) * 5, 120 + (i % 4) * 3]
        # Set chin landmarks
        landmarks[0] = [50, 180]
        landmarks[8] = [100, 190]
        landmarks[16] = [150, 180]

        # Test with minimal warping
        result = warp_mouth(img, landmarks, 0.1, 0.1, 0.1)
        assert result.shape == img.shape

    def test_warp_mouth_closed(self):
        """Test warp_mouth with closed mouth (0, 0, 0)"""
        from viseme_service import warp_mouth

        img = np.zeros((200, 200, 4), dtype=np.uint8)
        img[:, :, 3] = 255

        landmarks = np.zeros((68, 2), dtype=np.float32)
        for i in range(48, 68):
            landmarks[i] = [100 + (i - 58) * 5, 120]
        landmarks[0] = [50, 180]
        landmarks[8] = [100, 190]
        landmarks[16] = [150, 180]

        result = warp_mouth(img, landmarks, 0.0, 0.0, 0.0)
        assert result.shape == img.shape

    def test_warp_mouth_wide_open(self):
        """Test warp_mouth with wide open mouth"""
        from viseme_service import warp_mouth

        img = np.zeros((200, 200, 4), dtype=np.uint8)
        img[:, :, 3] = 255

        landmarks = np.zeros((68, 2), dtype=np.float32)
        for i in range(48, 68):
            landmarks[i] = [100 + (i - 58) * 5, 120 + (i % 4) * 3]
        landmarks[0] = [50, 180]
        landmarks[8] = [100, 190]
        landmarks[16] = [150, 180]
        landmarks[51] = [100, 115]  # Top of upper lip
        landmarks[57] = [100, 125]  # Bottom of lower lip

        result = warp_mouth(img, landmarks, 0.8, 0.3, 0.0)
        assert result.shape == img.shape


class TestWarpTriangle:
    """Tests for warp_triangle function"""

    def test_warp_triangle_basic(self):
        """Test basic triangle warping"""
        from viseme_service import warp_triangle

        # Create source and destination images
        img_src = np.zeros((100, 100, 3), dtype=np.uint8)
        img_src[40:60, 40:60] = 255  # White square in center
        img_dst = np.zeros((100, 100, 3), dtype=np.uint8)

        # Define triangles
        tri_src = np.array([[40, 40], [60, 40], [50, 60]], dtype=np.float32)
        tri_dst = np.array([[35, 35], [65, 35], [50, 65]], dtype=np.float32)

        warp_triangle(img_src, img_dst, tri_src, tri_dst)
        # Result should have some non-zero pixels
        assert np.sum(img_dst) > 0

    def test_warp_triangle_identity(self):
        """Test triangle warping with identical triangles"""
        from viseme_service import warp_triangle

        img_src = np.ones((100, 100, 3), dtype=np.uint8) * 128
        img_dst = np.zeros((100, 100, 3), dtype=np.uint8)

        # Same triangle
        tri = np.array([[30, 30], [70, 30], [50, 70]], dtype=np.float32)

        warp_triangle(img_src, img_dst, tri, tri)
        # Should copy the triangle region
        assert np.sum(img_dst) > 0


class TestGenerateVisemeImages:
    """Tests for generate_viseme_images function"""

    @pytest.mark.skipif(True, reason="face_alignment module not installed")
    def test_generate_viseme_images_no_image(self):
        """Test generate_viseme_images with non-existent image"""
        # This test requires face_alignment module which is not installed
        pass

    def test_generate_viseme_images_function_exists(self):
        """Test generate_viseme_images function exists and is callable"""
        from viseme_service import generate_viseme_images
        assert callable(generate_viseme_images)


class TestAPIEndpoints:
    """Tests for FastAPI endpoints"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        from fastapi.testclient import TestClient
        from viseme_service import app
        return TestClient(app)

    def test_health_endpoint(self, client):
        """Test /health endpoint"""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["service"] == "viseme-lipsync"
        assert "visemes_ready" in data
        assert "latency_ms" in data

    def test_list_visemes_no_dir(self, client):
        """Test /visemes endpoint when directory doesn't exist"""
        with patch('viseme_service.os.path.exists', return_value=False):
            response = client.get("/visemes")
            assert response.status_code == 200
            data = response.json()
            assert data["visemes"] == []
            assert data["ready"] is False

    def test_list_visemes_with_files(self, client):
        """Test /visemes endpoint with existing files"""
        with patch('viseme_service.os.path.exists', return_value=True):
            with patch('viseme_service.os.listdir', return_value=["AA.png", "EE.png", "OO.png"]):
                response = client.get("/visemes")
                assert response.status_code == 200
                data = response.json()
                assert len(data["visemes"]) == 3
                assert "AA.png" in data["visemes"]

    @patch('viseme_service.generate_viseme_images')
    def test_generate_visemes_endpoint_success(self, mock_gen, client):
        """Test /generate-visemes endpoint success"""
        mock_gen.return_value = True
        with patch('viseme_service.os.listdir', return_value=["AA.png", "EE.png"]):
            response = client.post("/generate-visemes")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"

    @patch('viseme_service.generate_viseme_images')
    def test_generate_visemes_endpoint_error(self, mock_gen, client):
        """Test /generate-visemes endpoint error"""
        mock_gen.side_effect = Exception("Test error")
        response = client.post("/generate-visemes")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "error"
        assert "Test error" in data["message"]


class TestWebSocket:
    """Tests for WebSocket endpoint"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        from fastapi.testclient import TestClient
        from viseme_service import app
        return TestClient(app)

    def test_websocket_ping_pong(self, client):
        """Test WebSocket ping/pong"""
        import json
        with client.websocket_connect("/ws/viseme") as ws:
            ws.send_text(json.dumps({"type": "ping"}))
            data = ws.receive_json()
            assert data["type"] == "pong"

    def test_websocket_audio_processing(self, client):
        """Test WebSocket audio processing"""
        import json
        import base64

        with client.websocket_connect("/ws/viseme") as ws:
            # Create audio data
            audio = np.sin(np.linspace(0, 1, 1600)).astype(np.float32) * 0.5
            audio_b64 = base64.b64encode(audio.tobytes()).decode()

            ws.send_text(json.dumps({
                "type": "audio",
                "data": audio_b64
            }))

            data = ws.receive_json()
            assert data["type"] == "viseme"
            assert "weights" in data

    def test_websocket_empty_audio(self, client):
        """Test WebSocket with empty audio data"""
        import json

        with client.websocket_connect("/ws/viseme") as ws:
            ws.send_text(json.dumps({
                "type": "audio",
                "data": ""
            }))
            # Should not crash, just continue


class TestVisemeParamsCompleteness:
    """Tests for VISEME_PARAMS completeness"""

    def test_all_visemes_have_params(self):
        """Test all VISEME_NAMES have corresponding VISEME_PARAMS"""
        for name in VISEME_NAMES:
            assert name in VISEME_PARAMS, f"Missing VISEME_PARAMS for {name}"

    def test_params_values_in_range(self):
        """Test all param values are in valid range [0, 1]"""
        for name, (open_amt, wide_amt, round_amt) in VISEME_PARAMS.items():
            assert 0.0 <= open_amt <= 1.0, f"{name} open_amt out of range"
            assert 0.0 <= wide_amt <= 1.0, f"{name} wide_amt out of range"
            assert 0.0 <= round_amt <= 1.0, f"{name} round_amt out of range"

    def test_silence_viseme_closed(self):
        """Test 'sil' viseme has closed mouth"""
        assert VISEME_PARAMS["sil"] == (0.0, 0.0, 0.0)

    def test_aa_viseme_wide_open(self):
        """Test 'AA' viseme has wide open mouth"""
        open_amt, wide_amt, round_amt = VISEME_PARAMS["AA"]
        assert open_amt >= 0.7, "AA should have high open_amt"
        assert round_amt < 0.1, "AA should not be rounded"

    def test_oo_viseme_rounded(self):
        """Test 'OO' viseme has rounded lips"""
        open_amt, wide_amt, round_amt = VISEME_PARAMS["OO"]
        assert round_amt >= 0.5, "OO should have high round_amt"


class TestModuleConstants:
    """Additional tests for module constants"""

    def test_viseme_dir_path(self):
        """Test VISEME_DIR is a valid path format"""
        from viseme_service import VISEME_DIR
        assert isinstance(VISEME_DIR, str)
        assert len(VISEME_DIR) > 0

    def test_sample_rate_standard(self):
        """Test SAMPLE_RATE is a standard audio rate"""
        standard_rates = [8000, 11025, 16000, 22050, 44100, 48000]
        assert SAMPLE_RATE in standard_rates

    def test_energy_threshold_reasonable(self):
        """Test energy threshold is reasonable for speech detection"""
        assert 0.01 <= _ENERGY_THRESHOLD <= 0.2

    def test_zcr_threshold_reasonable(self):
        """Test ZCR threshold is reasonable for fricative detection"""
        assert 0.1 <= _ZCR_THRESHOLD <= 0.3


class TestSilenceWeightOptimization:
    """Tests for _SILENCE_WEIGHT optimization"""

    def test_silence_weight_is_dict(self):
        """Test _SILENCE_WEIGHT is a dict"""
        assert isinstance(_SILENCE_WEIGHT, dict)

    def test_silence_weight_single_key(self):
        """Test _SILENCE_WEIGHT has single 'sil' key"""
        assert list(_SILENCE_WEIGHT.keys()) == ["sil"]

    def test_silence_weight_value(self):
        """Test _SILENCE_WEIGHT value is 1.0"""
        assert _SILENCE_WEIGHT["sil"] == 1.0

    def test_empty_audio_returns_silence_constant(self):
        """Test that empty audio returns the exact _SILENCE_WEIGHT constant"""
        analyzer = AudioAnalyzer()
        result = analyzer.analyze_chunk(np.array([]))
        # Should be the exact same object (identity check)
        assert result is _SILENCE_WEIGHT
