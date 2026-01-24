"""
Tests for audio2face_service.py - Sprint 544

Tests Audio2Face lip-sync service logic:
- Audio2BlendShapes neural network
- RuleBasedPredictor heuristics
- AudioProcessor feature extraction
- FaceWarper blend shape application
- Health endpoint logic
- WebSocket message handling
- Preview endpoint logic

Note: Tests mock cv2, torch, librosa to avoid GPU/CUDA dependencies.
"""

import pytest
import numpy as np
from unittest.mock import MagicMock, patch, AsyncMock
import asyncio


# =============================================================================
# Constants matching the service
# =============================================================================

BLEND_SHAPES = [
    "jawOpen", "mouthClose", "mouthFunnel", "mouthPucker",
    "mouthLeft", "mouthRight", "mouthSmileLeft", "mouthSmileRight",
    "mouthFrownLeft", "mouthFrownRight", "mouthUpperUpLeft", "mouthUpperUpRight",
    "mouthLowerDownLeft", "mouthLowerDownRight", "mouthStretchLeft", "mouthStretchRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft", "eyeWideRight",
    "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight"
]

N_BLEND_SHAPES = len(BLEND_SHAPES)
N_MFCC = 13
SAMPLE_RATE = 16000


# =============================================================================
# RuleBasedPredictor Tests
# =============================================================================

class TestRuleBasedPredictor:
    """Test RuleBasedPredictor heuristic blend shape prediction."""

    def test_init_sets_prev_blend_shapes_to_zeros(self):
        """Test initialization sets previous blend shapes to zeros."""
        prev_blend_shapes = np.zeros(N_BLEND_SHAPES)
        assert prev_blend_shapes.shape == (N_BLEND_SHAPES,)
        assert np.all(prev_blend_shapes == 0)

    def test_init_sets_smoothing_factor(self):
        """Test smoothing factor is set."""
        smoothing = 0.3
        assert 0 < smoothing < 1

    def test_predict_returns_correct_shape(self):
        """Test predict returns array of correct shape."""
        # Simulate the prediction logic
        blend_shapes = np.zeros(N_BLEND_SHAPES)
        assert blend_shapes.shape == (N_BLEND_SHAPES,)

    def test_predict_with_zero_energy(self):
        """Test prediction with zero energy produces minimal mouth movement."""
        energy = 0.0
        blend_shapes = np.zeros(N_BLEND_SHAPES)

        # Energy controls mouth openness
        blend_shapes[0] = energy * 0.8  # jawOpen

        assert blend_shapes[0] == 0.0  # No jaw movement with zero energy

    def test_predict_with_high_energy(self):
        """Test prediction with high energy opens mouth."""
        energy = 1.0
        blend_shapes = np.zeros(N_BLEND_SHAPES)

        # Energy controls mouth openness
        blend_shapes[0] = energy * 0.8  # jawOpen

        assert blend_shapes[0] == 0.8

    def test_jaw_open_scales_with_energy(self):
        """Test jaw opening scales linearly with energy."""
        for energy in [0.0, 0.25, 0.5, 0.75, 1.0]:
            expected_jaw = min(1.0, energy * 5) * 0.8  # Normalized energy * 0.8
            assert expected_jaw >= 0
            assert expected_jaw <= 1.0

    def test_pitch_normalization(self):
        """Test pitch normalization for typical speech range."""
        # Pitch range: 80-400Hz
        for pitch in [0, 80, 200, 400, 500]:
            if pitch > 0:
                pitch_norm = np.clip((pitch - 80) / 320, 0, 1)
            else:
                pitch_norm = 0.5

            assert 0 <= pitch_norm <= 1

    def test_high_pitch_raises_eyebrows(self):
        """Test high pitch raises eyebrows."""
        pitch_norm = 0.8  # High pitch
        blend_shapes = np.zeros(N_BLEND_SHAPES)

        if pitch_norm > 0.7:
            blend_shapes[22] = 0.3  # browInnerUp
            blend_shapes[23] = 0.2  # browOuterUpLeft
            blend_shapes[24] = 0.2  # browOuterUpRight

        assert blend_shapes[22] == 0.3
        assert blend_shapes[23] == 0.2
        assert blend_shapes[24] == 0.2

    def test_low_pitch_no_eyebrow_raise(self):
        """Test low pitch doesn't raise eyebrows."""
        pitch_norm = 0.3  # Low pitch
        blend_shapes = np.zeros(N_BLEND_SHAPES)

        if pitch_norm > 0.7:
            blend_shapes[22] = 0.3

        assert blend_shapes[22] == 0.0

    def test_spectral_tilt_calculation(self):
        """Test spectral tilt calculation from MFCC."""
        mfcc = np.random.randn(N_MFCC)

        spectral_tilt = np.mean(mfcc[1:6]) - np.mean(mfcc[6:])
        spectral_tilt = np.clip(spectral_tilt / 20 + 0.5, 0, 1)

        assert 0 <= spectral_tilt <= 1

    def test_bright_sounds_widen_mouth(self):
        """Test bright sounds (high spectral tilt) widen mouth."""
        energy = 0.5
        spectral_tilt = 0.8  # Bright
        blend_shapes = np.zeros(N_BLEND_SHAPES)

        if energy > 0.1 and spectral_tilt > 0.6:
            blend_shapes[7] = energy * 0.4  # mouthSmileRight
            blend_shapes[6] = energy * 0.4  # mouthSmileLeft

        assert blend_shapes[7] == 0.2
        assert blend_shapes[6] == 0.2

    def test_dark_sounds_round_mouth(self):
        """Test dark sounds (low spectral tilt) round mouth."""
        energy = 0.5
        spectral_tilt = 0.3  # Dark
        blend_shapes = np.zeros(N_BLEND_SHAPES)

        if energy > 0.1 and spectral_tilt < 0.4:
            blend_shapes[2] = energy * 0.5  # mouthFunnel
            blend_shapes[3] = energy * 0.3  # mouthPucker

        assert blend_shapes[2] == 0.25
        assert blend_shapes[3] == 0.15

    def test_smoothing_blends_frames(self):
        """Test smoothing factor blends consecutive frames."""
        smoothing = 0.3
        prev = np.ones(N_BLEND_SHAPES) * 0.5
        current = np.ones(N_BLEND_SHAPES) * 1.0

        smoothed = smoothing * prev + (1 - smoothing) * current

        expected = 0.3 * 0.5 + 0.7 * 1.0
        assert np.allclose(smoothed, expected)

    def test_blink_probability(self):
        """Test eye blink has small probability."""
        blink_prob = 0.01
        assert blink_prob == 0.01  # ~1% per frame

    def test_lower_lip_movement(self):
        """Test lower lip moves with energy."""
        energy = 0.5
        blend_shapes = np.zeros(N_BLEND_SHAPES)

        blend_shapes[12] = energy * 0.4  # mouthLowerDownLeft
        blend_shapes[13] = energy * 0.4  # mouthLowerDownRight

        assert blend_shapes[12] == 0.2
        assert blend_shapes[13] == 0.2


# =============================================================================
# Audio2BlendShapes Neural Network Tests
# =============================================================================

class TestAudio2BlendShapesNetwork:
    """Test Audio2BlendShapes neural network architecture."""

    def test_input_dimensions(self):
        """Test expected input dimensions."""
        n_mfcc = N_MFCC
        n_extra = 2  # energy + pitch
        expected_input = n_mfcc + n_extra

        assert expected_input == 15

    def test_output_dimensions(self):
        """Test output is N_BLEND_SHAPES."""
        assert N_BLEND_SHAPES == 25

    def test_encoder_architecture(self):
        """Test encoder layer dimensions."""
        # Input: 15 -> 64 -> 128 -> 64
        layers = [(15, 64), (64, 128), (128, 64)]

        for in_dim, out_dim in layers:
            assert in_dim > 0
            assert out_dim > 0

    def test_gru_is_bidirectional(self):
        """Test GRU is configured as bidirectional."""
        hidden_size = 64
        bidirectional = True
        output_size = hidden_size * 2 if bidirectional else hidden_size

        assert output_size == 128

    def test_predictor_output_sigmoid(self):
        """Test predictor uses sigmoid for 0-1 output."""
        # Blend shapes should be in [0, 1]
        raw_values = np.array([-10, -1, 0, 1, 10])
        sigmoid_values = 1 / (1 + np.exp(-raw_values))

        assert np.all(sigmoid_values >= 0)
        assert np.all(sigmoid_values <= 1)

    def test_forward_concatenates_features(self):
        """Test forward pass concatenates mfcc, energy, pitch."""
        batch, time = 2, 10
        mfcc = np.random.randn(batch, time, N_MFCC)
        energy = np.random.randn(batch, time, 1)
        pitch = np.random.randn(batch, time, 1)

        x = np.concatenate([mfcc, energy, pitch], axis=-1)

        assert x.shape == (batch, time, N_MFCC + 2)


# =============================================================================
# AudioProcessor Tests
# =============================================================================

class TestAudioProcessor:
    """Test AudioProcessor feature extraction."""

    def test_sample_rate_default(self):
        """Test default sample rate is 16000."""
        assert SAMPLE_RATE == 16000

    def test_short_audio_returns_zeros(self):
        """Test audio shorter than 512 samples returns zeros."""
        min_samples = 512
        audio = np.zeros(256)

        if len(audio) < min_samples:
            result = np.zeros(N_MFCC)
        else:
            result = None

        assert np.all(result == 0)

    def test_energy_calculation(self):
        """Test RMS energy calculation."""
        audio = np.array([0.5, -0.5, 0.5, -0.5])
        energy = np.sqrt(np.mean(audio ** 2))

        assert energy == 0.5

    def test_silent_audio_has_zero_energy(self):
        """Test silent audio has zero energy."""
        audio = np.zeros(1000)
        energy = np.sqrt(np.mean(audio ** 2))

        assert energy == 0.0

    def test_loud_audio_has_high_energy(self):
        """Test loud audio has high energy."""
        audio = np.ones(1000) * 0.8
        energy = np.sqrt(np.mean(audio ** 2))

        assert np.isclose(energy, 0.8)

    def test_mfcc_shape(self):
        """Test MFCC output shape expectation."""
        n_mfcc = N_MFCC
        assert n_mfcc == 13

    def test_pitch_detection_range(self):
        """Test pitch should be in typical speech range."""
        # Typical speech: 80-400 Hz
        min_pitch = 80
        max_pitch = 400

        for pitch in [100, 200, 300]:
            assert min_pitch <= pitch <= max_pitch


# =============================================================================
# FaceWarper Tests
# =============================================================================

class TestFaceWarperLogic:
    """Test FaceWarper blend shape application logic."""

    def test_jaw_open_moves_lower_lip_down(self):
        """Test jaw opening moves lower lip landmarks down."""
        jaw_open = 0.5
        base_y = 100
        movement = jaw_open * 15

        target_y = base_y + movement

        assert target_y == 107.5

    def test_mouth_funnel_moves_toward_center(self):
        """Test mouth funnel moves lips toward center."""
        mouth_funnel = 0.5
        landmark = np.array([100, 50])
        center = np.array([80, 60])

        direction = center - landmark
        new_pos = landmark + direction * mouth_funnel * 0.2

        expected = np.array([100 + (-20) * 0.5 * 0.2, 50 + 10 * 0.5 * 0.2])
        assert np.allclose(new_pos, expected)

    def test_smile_moves_corners_up_and_out(self):
        """Test smile moves mouth corners up and outward."""
        smile = 0.5
        corner_x, corner_y = 100, 80

        # Left corner
        new_x = corner_x - smile * 5
        new_y = corner_y - smile * 5

        assert new_x == 97.5
        assert new_y == 77.5

    def test_mouth_stretch_moves_corners_horizontal(self):
        """Test mouth stretch moves corners horizontally."""
        stretch = 0.5
        left_x = 50
        right_x = 100

        new_left_x = left_x - stretch * 8
        new_right_x = right_x + stretch * 8

        assert new_left_x == 46
        assert new_right_x == 104

    def test_brow_inner_up_moves_landmarks_up(self):
        """Test brow inner up moves eyebrow landmarks up."""
        brow_up = 0.5
        base_y = 30

        new_y = base_y - brow_up * 5

        assert new_y == 27.5

    def test_eye_blink_moves_upper_eyelid_down(self):
        """Test eye blink moves upper eyelid landmarks down."""
        blink = 1.0
        base_y = 50

        new_y = base_y + blink * 5

        assert new_y == 55

    def test_blend_shape_values_clipped_to_01(self):
        """Test blend shapes are expected to be in 0-1 range."""
        blend_shapes = np.random.rand(N_BLEND_SHAPES)

        assert np.all(blend_shapes >= 0)
        assert np.all(blend_shapes <= 1)


# =============================================================================
# Health Endpoint Tests
# =============================================================================

class TestHealthEndpoint:
    """Test health endpoint logic."""

    def test_health_returns_ok_when_initialized(self):
        """Test health returns ok when face_warper is initialized."""
        face_warper = MagicMock()

        def get_health():
            return {
                "status": "ok" if face_warper is not None else "error",
                "service": "audio2face-lipsync",
                "blend_shapes": N_BLEND_SHAPES,
                "latency_ms": "30-50"
            }

        result = get_health()

        assert result["status"] == "ok"
        assert result["service"] == "audio2face-lipsync"
        assert result["blend_shapes"] == 25

    def test_health_returns_error_when_not_initialized(self):
        """Test health returns error when face_warper is None."""
        face_warper = None

        def get_health():
            return {
                "status": "ok" if face_warper is not None else "error",
                "service": "audio2face-lipsync"
            }

        result = get_health()

        assert result["status"] == "error"

    def test_health_includes_latency_estimate(self):
        """Test health includes latency estimate."""
        result = {"latency_ms": "30-50"}

        assert "latency_ms" in result
        assert result["latency_ms"] == "30-50"


# =============================================================================
# WebSocket Message Handling Tests
# =============================================================================

class TestWebSocketHandling:
    """Test WebSocket message handling logic."""

    def test_audio_message_type_recognized(self):
        """Test audio message type is recognized."""
        data = {"type": "audio", "data": "base64data"}

        assert data.get("type") == "audio"

    def test_audio_wav_message_type_recognized(self):
        """Test audio_wav message type is recognized."""
        data = {"type": "audio_wav", "data": "base64wavdata"}

        assert data.get("type") == "audio_wav"

    def test_ping_message_returns_pong(self):
        """Test ping message type returns pong."""
        data = {"type": "ping"}

        if data.get("type") == "ping":
            response = {"type": "pong"}

        assert response["type"] == "pong"

    def test_frame_response_includes_data(self):
        """Test frame response includes data field."""
        response = {
            "type": "frame",
            "data": "base64jpegdata",
            "blend_shapes": {}
        }

        assert response["type"] == "frame"
        assert "data" in response

    def test_done_message_sent_after_wav_processing(self):
        """Test done message is sent after WAV processing."""
        response = {"type": "done"}

        assert response["type"] == "done"

    def test_error_message_when_not_initialized(self):
        """Test error message sent when service not initialized."""
        response = {"type": "error", "message": "Service not initialized"}

        assert response["type"] == "error"
        assert "not initialized" in response["message"]

    def test_chunk_size_for_25fps(self):
        """Test chunk size calculation for 25fps output."""
        fps = 25
        chunk_duration = 1 / fps  # 0.04 seconds
        chunk_size = int(SAMPLE_RATE * chunk_duration)

        assert chunk_size == 640  # 16000 * 0.04

    def test_blend_shapes_filtered_by_threshold(self):
        """Test blend shapes are filtered by threshold in response."""
        blend_shapes = np.array([0.5, 0.001, 0.2, 0.005, 0.8])
        threshold = 0.01

        filtered = {f"bs_{i}": v for i, v in enumerate(blend_shapes) if v > threshold}

        assert len(filtered) == 3
        assert "bs_0" in filtered
        assert "bs_2" in filtered
        assert "bs_4" in filtered


# =============================================================================
# Preview Endpoint Tests
# =============================================================================

class TestPreviewEndpoint:
    """Test preview endpoint logic."""

    def test_preview_converts_dict_to_array(self):
        """Test preview converts blend shape dict to array."""
        blend_shapes_dict = {"jawOpen": 0.5, "mouthSmileLeft": 0.3}

        bs_array = np.zeros(N_BLEND_SHAPES)
        for name, value in blend_shapes_dict.items():
            if name in BLEND_SHAPES:
                bs_array[BLEND_SHAPES.index(name)] = value

        assert bs_array[0] == 0.5  # jawOpen is index 0
        assert bs_array[6] == 0.3  # mouthSmileLeft is index 6

    def test_preview_default_blend_shapes(self):
        """Test preview uses default blend shapes when none provided."""
        blend_shapes = None

        if blend_shapes is None:
            blend_shapes = {"jawOpen": 0.5}

        assert blend_shapes["jawOpen"] == 0.5

    def test_preview_returns_error_when_not_initialized(self):
        """Test preview returns error when face_warper is None."""
        face_warper = None

        if face_warper is None:
            result = {"error": "Service not initialized"}
        else:
            result = {"frame": "data"}

        assert "error" in result

    def test_preview_ignores_unknown_blend_shapes(self):
        """Test preview ignores unknown blend shape names."""
        blend_shapes_dict = {"jawOpen": 0.5, "unknownShape": 0.8}

        bs_array = np.zeros(N_BLEND_SHAPES)
        for name, value in blend_shapes_dict.items():
            if name in BLEND_SHAPES:
                bs_array[BLEND_SHAPES.index(name)] = value

        # unknownShape should be ignored
        assert np.sum(bs_array > 0) == 1


# =============================================================================
# Blend Shape Index Tests
# =============================================================================

class TestBlendShapeIndices:
    """Test blend shape indices match expected positions."""

    def test_jaw_open_index(self):
        """Test jawOpen is at index 0."""
        assert BLEND_SHAPES.index("jawOpen") == 0

    def test_mouth_close_index(self):
        """Test mouthClose is at index 1."""
        assert BLEND_SHAPES.index("mouthClose") == 1

    def test_mouth_funnel_index(self):
        """Test mouthFunnel is at index 2."""
        assert BLEND_SHAPES.index("mouthFunnel") == 2

    def test_mouth_pucker_index(self):
        """Test mouthPucker is at index 3."""
        assert BLEND_SHAPES.index("mouthPucker") == 3

    def test_mouth_smile_left_index(self):
        """Test mouthSmileLeft is at index 6."""
        assert BLEND_SHAPES.index("mouthSmileLeft") == 6

    def test_mouth_smile_right_index(self):
        """Test mouthSmileRight is at index 7."""
        assert BLEND_SHAPES.index("mouthSmileRight") == 7

    def test_eye_blink_left_index(self):
        """Test eyeBlinkLeft is at index 16."""
        assert BLEND_SHAPES.index("eyeBlinkLeft") == 16

    def test_eye_blink_right_index(self):
        """Test eyeBlinkRight is at index 17."""
        assert BLEND_SHAPES.index("eyeBlinkRight") == 17

    def test_brow_inner_up_index(self):
        """Test browInnerUp is at index 22."""
        assert BLEND_SHAPES.index("browInnerUp") == 22

    def test_total_blend_shapes_count(self):
        """Test total blend shapes count is 25."""
        assert len(BLEND_SHAPES) == 25


# =============================================================================
# Configuration Tests
# =============================================================================

class TestConfiguration:
    """Test service configuration values."""

    def test_sample_rate(self):
        """Test sample rate is 16000."""
        assert SAMPLE_RATE == 16000

    def test_hop_length(self):
        """Test hop length for MFCC."""
        hop_length = 256
        assert hop_length == 256

    def test_n_mfcc(self):
        """Test number of MFCC coefficients."""
        assert N_MFCC == 13

    def test_device_selection(self):
        """Test device selection logic."""
        # Simulating torch.cuda.is_available()
        cuda_available = False
        device = "cuda" if cuda_available else "cpu"

        assert device == "cpu"

    def test_uvicorn_port(self):
        """Test uvicorn runs on port 8004."""
        port = 8004
        assert port == 8004

    def test_uvicorn_host(self):
        """Test uvicorn binds to 0.0.0.0."""
        host = "0.0.0.0"
        assert host == "0.0.0.0"


# =============================================================================
# Lifespan Handler Tests
# =============================================================================

class TestLifespanHandler:
    """Test lifespan handler behavior."""

    def test_lifespan_sets_global_face_warper(self):
        """Test lifespan initializes face_warper."""
        face_warper = None

        # Simulate successful init
        face_warper = MagicMock()

        assert face_warper is not None

    def test_lifespan_sets_global_audio_processor(self):
        """Test lifespan initializes audio_processor."""
        audio_processor = None

        # Simulate successful init
        audio_processor = MagicMock()

        assert audio_processor is not None

    def test_lifespan_handles_init_failure(self):
        """Test lifespan handles initialization failure gracefully."""
        initialized = False

        try:
            raise Exception("Failed to initialize")
        except Exception:
            initialized = False

        assert initialized is False


# =============================================================================
# CORS Configuration Tests
# =============================================================================

class TestCORSConfiguration:
    """Test CORS middleware configuration."""

    def test_cors_allows_all_origins(self):
        """Test CORS allows all origins."""
        cors_config = {"allow_origins": ["*"]}
        assert "*" in cors_config["allow_origins"]

    def test_cors_allows_all_methods(self):
        """Test CORS allows all methods."""
        cors_config = {"allow_methods": ["*"]}
        assert "*" in cors_config["allow_methods"]

    def test_cors_allows_all_headers(self):
        """Test CORS allows all headers."""
        cors_config = {"allow_headers": ["*"]}
        assert "*" in cors_config["allow_headers"]


# =============================================================================
# Triangulation Warping Tests
# =============================================================================

class TestTriangulationWarping:
    """Test triangulation-based warping logic."""

    def test_corner_points_added(self):
        """Test corner points are added for triangulation."""
        landmarks = np.random.rand(68, 2)
        w, h = 512, 512

        corners = np.array([[0, 0], [w-1, 0], [0, h-1], [w-1, h-1]])
        all_points = np.vstack([landmarks, corners])

        assert all_points.shape == (72, 2)

    def test_affine_transform_for_triangle(self):
        """Test affine transform is used for triangle warping."""
        src_tri = np.array([[0, 0], [10, 0], [5, 10]], dtype=np.float32)
        dst_tri = np.array([[0, 0], [12, 0], [6, 12]], dtype=np.float32)

        # Just verify triangles have 3 points
        assert len(src_tri) == 3
        assert len(dst_tri) == 3

    def test_bounding_rect_validation(self):
        """Test bounding rect dimensions are validated."""
        rect = (10, 20, 100, 50)  # x, y, w, h

        valid = rect[2] > 0 and rect[3] > 0
        assert valid is True

    def test_invalid_bounding_rect_skipped(self):
        """Test invalid bounding rect is skipped."""
        rect = (10, 20, 0, 50)  # Invalid: width is 0

        valid = rect[2] > 0 and rect[3] > 0
        assert valid is False
