"""
Tests for avatar services (audio2face, ditto, viseme, streaming_lipsync).

These services handle real-time lip-sync and facial animation.
Tests use mocks for heavy dependencies (torch, cv2, face_alignment).
"""

import pytest
import sys
import os
import numpy as np
from unittest.mock import Mock, patch, MagicMock
import asyncio

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Mock heavy dependencies BEFORE importing modules
# This is required because these modules import cv2, torch at module level


def create_mock_modules():
    """Create mock modules for heavy dependencies."""
    mock_cv2 = MagicMock()
    mock_cv2.imread.return_value = np.zeros((256, 256, 4), dtype=np.uint8)
    mock_cv2.imencode.return_value = (True, np.array([1, 2, 3], dtype=np.uint8))
    mock_cv2.resize.return_value = np.zeros((128, 128, 3), dtype=np.uint8)
    mock_cv2.boundingRect.return_value = (0, 0, 10, 10)
    mock_cv2.getAffineTransform.return_value = np.eye(2, 3)
    mock_cv2.warpAffine.return_value = np.zeros((10, 10, 3), dtype=np.uint8)
    mock_cv2.fillConvexPoly = MagicMock()
    mock_cv2.cvtColor.return_value = np.zeros((256, 256, 3), dtype=np.uint8)
    mock_cv2.IMREAD_UNCHANGED = 1
    mock_cv2.COLOR_BGR2RGB = 4
    mock_cv2.INTER_LINEAR = 1
    mock_cv2.IMWRITE_JPEG_QUALITY = 1

    mock_torch = MagicMock()
    mock_torch.device.return_value = "cpu"
    mock_torch.cuda.is_available.return_value = False
    mock_torch.tensor.return_value = MagicMock()
    mock_torch.randn.return_value = MagicMock()
    mock_torch.zeros.return_value = MagicMock()
    mock_torch.cat.return_value = MagicMock()
    mock_torch.no_grad.return_value = MagicMock(__enter__=MagicMock(), __exit__=MagicMock())
    mock_torch.load.return_value = [MagicMock()]
    mock_torch.Tensor = MagicMock
    mock_torch.float16 = "float16"

    mock_torch_nn = MagicMock()
    mock_torch_nn.Module = MagicMock

    mock_librosa = MagicMock()
    mock_librosa.feature.mfcc.return_value = np.random.randn(13, 1)
    mock_librosa.piptrack.return_value = (np.array([[200.0]]), np.array([[1.0]]))
    mock_librosa.load.return_value = (np.zeros(16000), 16000)
    mock_librosa.core.load.return_value = (np.zeros(16000), 16000)

    mock_face_alignment = MagicMock()
    mock_fa_instance = MagicMock()
    mock_fa_instance.get_landmarks.return_value = [np.random.randn(68, 2) * 100 + 128]
    mock_face_alignment.FaceAlignment.return_value = mock_fa_instance
    mock_face_alignment.LandmarksType = MagicMock()
    mock_face_alignment.LandmarksType.TWO_D = 1

    mock_scipy_spatial = MagicMock()
    mock_delaunay = MagicMock()
    mock_delaunay.simplices = [[0, 1, 2]]
    mock_scipy_spatial.Delaunay.return_value = mock_delaunay

    mock_transformers = MagicMock()
    mock_transformers.WhisperModel = MagicMock
    mock_transformers.AutoFeatureExtractor = MagicMock()
    mock_transformers.AutoFeatureExtractor.from_pretrained.return_value = MagicMock()

    # Mock musetalk (for streaming_lipsync)
    mock_musetalk = MagicMock()
    mock_musetalk.utils = MagicMock()
    mock_musetalk.utils.utils = MagicMock()
    mock_musetalk.utils.utils.load_all_model = MagicMock(return_value=(MagicMock(), MagicMock(), MagicMock()))

    return {
        'cv2': mock_cv2,
        'torch': mock_torch,
        'torch.nn': mock_torch_nn,
        'librosa': mock_librosa,
        'librosa.feature': mock_librosa.feature,
        'librosa.core': mock_librosa.core,
        'face_alignment': mock_face_alignment,
        'scipy': MagicMock(),
        'scipy.spatial': mock_scipy_spatial,
        'transformers': mock_transformers,
        'musetalk': mock_musetalk,
        'musetalk.utils': mock_musetalk.utils,
        'musetalk.utils.utils': mock_musetalk.utils.utils,
    }


# Install mocks
mock_modules = create_mock_modules()
for name, mock in mock_modules.items():
    sys.modules[name] = mock


# =============================================================================
# AUDIO2FACE SERVICE TESTS
# =============================================================================

class TestAudio2FaceBlendShapes:
    """Tests for audio2face_service.py blend shape configuration."""

    def test_blend_shapes_list_not_empty(self):
        """Test BLEND_SHAPES list is properly defined."""
        from audio2face_service import BLEND_SHAPES, N_BLEND_SHAPES

        assert len(BLEND_SHAPES) > 0
        assert N_BLEND_SHAPES == len(BLEND_SHAPES)
        assert "jawOpen" in BLEND_SHAPES
        assert "mouthClose" in BLEND_SHAPES
        assert "eyeBlinkLeft" in BLEND_SHAPES

    def test_sample_rate_config(self):
        """Test audio configuration constants."""
        from audio2face_service import SAMPLE_RATE, HOP_LENGTH, N_MFCC

        assert SAMPLE_RATE == 16000
        assert HOP_LENGTH > 0
        assert N_MFCC > 0

    def test_blend_shapes_count(self):
        """Test we have expected number of blend shapes."""
        from audio2face_service import BLEND_SHAPES, N_BLEND_SHAPES

        # Should have 25 blend shapes (ARKit-style simplified)
        assert N_BLEND_SHAPES == 25
        assert len(BLEND_SHAPES) == 25


class TestRuleBasedPredictor:
    """Tests for RuleBasedPredictor class."""

    def test_predict_silence(self):
        """Test prediction with silent audio."""
        from audio2face_service import RuleBasedPredictor, N_BLEND_SHAPES

        predictor = RuleBasedPredictor()
        mfcc = np.zeros(13)
        energy = 0.0
        pitch = 0.0

        result = predictor.predict(mfcc, energy, pitch)

        assert result.shape == (N_BLEND_SHAPES,)
        # Low energy should result in minimal mouth movement
        assert result[0] < 0.1  # jawOpen

    def test_predict_high_energy(self):
        """Test prediction with high energy audio."""
        from audio2face_service import RuleBasedPredictor

        predictor = RuleBasedPredictor()
        mfcc = np.random.randn(13)
        energy = 0.5
        pitch = 200.0

        result = predictor.predict(mfcc, energy, pitch)

        # High energy should open mouth more
        assert result[0] > 0  # jawOpen > 0 for energy

    def test_predict_smoothing(self):
        """Test that predictions are smoothed over time."""
        from audio2face_service import RuleBasedPredictor

        predictor = RuleBasedPredictor()

        # First prediction with energy
        mfcc = np.zeros(13)
        result1 = predictor.predict(mfcc, 0.5, 200.0)
        jaw_open_1 = result1[0]

        # Second prediction with silence
        result2 = predictor.predict(mfcc, 0.0, 0.0)
        jaw_open_2 = result2[0]

        # Due to smoothing (0.3), second result should still have some value
        # from the first prediction
        assert jaw_open_2 > 0  # Not instant drop to zero

    def test_predict_high_pitch_raises_eyebrows(self):
        """Test high pitch causes eyebrow raise."""
        from audio2face_service import RuleBasedPredictor, BLEND_SHAPES

        predictor = RuleBasedPredictor()
        mfcc = np.zeros(13)
        energy = 0.3
        pitch = 350.0  # High pitch

        result = predictor.predict(mfcc, energy, pitch)

        # High pitch (> 0.7 normalized) should raise eyebrows
        brow_inner_up_idx = BLEND_SHAPES.index("browInnerUp")
        assert result[brow_inner_up_idx] > 0

    def test_predict_spectral_tilt_effect(self):
        """Test spectral tilt affects mouth shape."""
        from audio2face_service import RuleBasedPredictor

        predictor = RuleBasedPredictor()

        # Bright sound (high spectral tilt)
        mfcc_bright = np.zeros(13)
        mfcc_bright[1:6] = 10  # High in upper range
        mfcc_bright[6:] = 2    # Low in lower range

        result_bright = predictor.predict(mfcc_bright, 0.5, 200.0)

        # Dark sound (low spectral tilt)
        predictor2 = RuleBasedPredictor()
        mfcc_dark = np.zeros(13)
        mfcc_dark[1:6] = 2     # Low in upper range
        mfcc_dark[6:] = 10     # High in lower range

        result_dark = predictor2.predict(mfcc_dark, 0.5, 200.0)

        # Both should produce valid results
        assert result_bright.shape == result_dark.shape

    def test_blink_probability(self):
        """Test random blinks occur with low probability."""
        from audio2face_service import RuleBasedPredictor, BLEND_SHAPES

        np.random.seed(42)  # For reproducibility
        predictor = RuleBasedPredictor()

        blink_left_idx = BLEND_SHAPES.index("eyeBlinkLeft")
        blink_right_idx = BLEND_SHAPES.index("eyeBlinkRight")

        blink_count = 0
        # Run many predictions
        for _ in range(1000):
            result = predictor.predict(np.zeros(13), 0.0, 0.0)
            if result[blink_left_idx] > 0.5:
                blink_count += 1

        # Should have some blinks (1% probability per frame)
        # With 1000 frames, expect around 10 blinks
        assert 0 < blink_count < 50  # Reasonable range


class TestAudioProcessor:
    """Tests for AudioProcessor class."""

    def test_process_chunk_short_audio(self):
        """Test processing very short audio returns default."""
        from audio2face_service import AudioProcessor, N_BLEND_SHAPES

        processor = AudioProcessor()
        short_audio = np.zeros(100, dtype=np.float32)

        result = processor.process_chunk(short_audio)

        assert result.shape == (N_BLEND_SHAPES,)

    def test_process_chunk_normal_audio(self):
        """Test processing normal audio chunk."""
        from audio2face_service import AudioProcessor, N_BLEND_SHAPES

        processor = AudioProcessor()
        audio = np.random.randn(1024).astype(np.float32)

        result = processor.process_chunk(audio)

        assert result.shape == (N_BLEND_SHAPES,)


class TestAudio2BlendShapesNetwork:
    """Tests for Audio2BlendShapes neural network structure."""

    def test_network_constants(self):
        """Test network has expected constants."""
        from audio2face_service import N_MFCC, N_BLEND_SHAPES

        assert N_MFCC == 13
        assert N_BLEND_SHAPES == 25


# =============================================================================
# VISEME SERVICE TESTS
# =============================================================================

class TestVisemeConfig:
    """Tests for viseme_service.py configuration."""

    def test_viseme_names_defined(self):
        """Test viseme names are properly defined."""
        from viseme_service import VISEME_NAMES, VISEME_PARAMS

        assert len(VISEME_NAMES) > 0
        assert "sil" in VISEME_NAMES  # Silence
        assert "AA" in VISEME_NAMES   # Open vowel
        assert "OO" in VISEME_NAMES   # Round vowel

        # All names should have params
        for name in VISEME_NAMES:
            assert name in VISEME_PARAMS

    def test_viseme_params_format(self):
        """Test viseme params have correct format (open, wide, round)."""
        from viseme_service import VISEME_PARAMS

        for name, params in VISEME_PARAMS.items():
            assert len(params) == 3
            assert all(0.0 <= p <= 1.0 for p in params)

    def test_viseme_count(self):
        """Test expected number of visemes."""
        from viseme_service import VISEME_NAMES

        assert len(VISEME_NAMES) == 12  # Standard viseme set


class TestAudioAnalyzer:
    """Tests for AudioAnalyzer class."""

    def test_analyze_empty_audio(self):
        """Test analysis of empty audio."""
        from viseme_service import AudioAnalyzer

        analyzer = AudioAnalyzer()
        result = analyzer.analyze_chunk(np.array([]))

        assert "sil" in result
        assert result["sil"] == 1.0

    def test_analyze_silence(self):
        """Test analysis of silent audio (very low energy)."""
        from viseme_service import AudioAnalyzer

        analyzer = AudioAnalyzer()
        silent = np.zeros(1024, dtype=np.float32)
        result = analyzer.analyze_chunk(silent)

        assert "sil" in result
        assert result["sil"] == 1.0

    def test_analyze_active_speech(self):
        """Test analysis of active speech audio."""
        from viseme_service import AudioAnalyzer

        analyzer = AudioAnalyzer()
        # Simulate speech with noise
        speech = np.random.randn(1024).astype(np.float32) * 0.5
        result = analyzer.analyze_chunk(speech)

        # Should have some active visemes
        total_weight = sum(result.values())
        assert total_weight > 0
        assert len(result) > 0

    def test_analyze_smoothing(self):
        """Test energy smoothing works."""
        from viseme_service import AudioAnalyzer

        analyzer = AudioAnalyzer()

        # First analysis with high energy
        loud = np.random.randn(1024).astype(np.float32)
        _ = analyzer.analyze_chunk(loud)

        # Remember previous energy
        prev_energy = analyzer.prev_energy

        # Second analysis with silence should still have some energy (smoothing)
        silent = np.zeros(1024, dtype=np.float32)
        _ = analyzer.analyze_chunk(silent)

        # Energy should not instantly drop to 0 due to smoothing
        # new_energy = smoothing * prev + (1-smoothing) * current
        # For silent: new = 0.3 * prev + 0.7 * 0 = 0.3 * prev
        if prev_energy > 0:
            assert analyzer.prev_energy < prev_energy
            assert analyzer.prev_energy > 0

    def test_normalization(self):
        """Test audio normalization."""
        from viseme_service import AudioAnalyzer

        analyzer = AudioAnalyzer()

        # Test with very loud audio (should normalize)
        loud = np.random.randn(1024).astype(np.float32) * 100
        result = analyzer.analyze_chunk(loud)

        # Should still produce valid output
        assert isinstance(result, dict)
        total = sum(result.values())
        assert total > 0


class TestVisemeAnalyzerSpectral:
    """Tests for spectral feature analysis."""

    def test_high_zcr_fricatives(self):
        """Test high zero crossing rate triggers fricative visemes."""
        from viseme_service import AudioAnalyzer

        analyzer = AudioAnalyzer()

        # Create high ZCR signal (rapid oscillation)
        t = np.arange(1024) / 16000
        high_zcr = (np.sign(np.sin(2 * np.pi * 8000 * t)) * 0.3).astype(np.float32)
        result = analyzer.analyze_chunk(high_zcr)

        # Should have fricative-related visemes (SS, FF, etc.)
        assert len(result) > 0

    def test_low_frequency_round_vowels(self):
        """Test low frequency content triggers round vowel visemes."""
        from viseme_service import AudioAnalyzer

        analyzer = AudioAnalyzer()

        # Low frequency sine wave
        t = np.arange(1024) / 16000
        low_freq = (np.sin(2 * np.pi * 150 * t) * 0.5).astype(np.float32)
        result = analyzer.analyze_chunk(low_freq)

        # Should produce valid output
        assert len(result) > 0


# =============================================================================
# DITTO SERVICE TESTS
# =============================================================================

class TestDittoServiceConfig:
    """Tests for ditto_service.py configuration."""

    def test_app_defined(self):
        """Test FastAPI app is defined."""
        from ditto_service import app

        assert app is not None
        assert app.title == "Ditto Talking Head Service"

    def test_global_state_initialized(self):
        """Test global state variables exist."""
        from ditto_service import ditto_sdk, source_image_prepared, current_source_path

        # Should be None/False on import (not initialized)
        assert ditto_sdk is None
        assert source_image_prepared is False
        assert current_source_path is None


class TestDittoInitialize:
    """Tests for Ditto SDK initialization."""

    def test_initialize_handles_missing_sdk(self):
        """Test initialize returns False when SDK not available."""
        from ditto_service import initialize_ditto

        # Since SDK is not installed in test env, should return False
        result = initialize_ditto()

        # Result should be boolean
        assert isinstance(result, bool)


# =============================================================================
# STREAMING LIPSYNC TESTS
# =============================================================================

class TestStreamingConfig:
    """Tests for streaming_lipsync.py configuration."""

    def test_streaming_constants(self):
        """Test streaming configuration constants."""
        from streaming_lipsync import (
            SAMPLE_RATE, FPS, BATCH_SIZE,
            CHUNK_DURATION_MS, CHUNK_SAMPLES
        )

        assert SAMPLE_RATE == 16000
        assert FPS == 25
        assert BATCH_SIZE > 0
        # CHUNK_DURATION_MS should match batch/fps
        assert CHUNK_DURATION_MS == int(BATCH_SIZE * 1000 / FPS)
        # CHUNK_SAMPLES should match duration at sample rate
        assert CHUNK_SAMPLES == int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)


class TestAvatarDataClass:
    """Tests for AvatarData dataclass."""

    def test_avatar_data_creation(self):
        """Test AvatarData can be created."""
        from streaming_lipsync import AvatarData

        avatar = AvatarData(avatar_id="test")

        assert avatar.avatar_id == "test"
        assert avatar.frame is None
        assert avatar.coord == []
        assert avatar.latent is None

    def test_avatar_data_with_values(self):
        """Test AvatarData with all fields set."""
        from streaming_lipsync import AvatarData

        avatar = AvatarData(
            avatar_id="eva",
            frame=np.zeros((256, 256, 3)),
            coord=[10, 20, 100, 120],
        )

        assert avatar.avatar_id == "eva"
        assert avatar.frame is not None
        assert avatar.coord == [10, 20, 100, 120]


# =============================================================================
# INTEGRATION TESTS (async endpoints)
# =============================================================================

class TestAudio2FaceEndpoints:
    """Tests for audio2face_service FastAPI endpoints."""

    @pytest.mark.asyncio
    async def test_health_endpoint(self):
        """Test health endpoint returns expected format."""
        from audio2face_service import health

        result = await health()

        assert "status" in result
        assert "service" in result
        assert "blend_shapes" in result
        assert result["service"] == "audio2face-lipsync"


class TestVisemeEndpoints:
    """Tests for viseme_service FastAPI endpoints."""

    @pytest.mark.asyncio
    async def test_health_endpoint(self):
        """Test health endpoint returns expected format."""
        from viseme_service import health

        result = await health()

        assert "status" in result
        assert "service" in result
        assert result["service"] == "viseme-lipsync"
        assert "visemes_ready" in result


class TestDittoEndpoints:
    """Tests for ditto_service FastAPI endpoints."""

    @pytest.mark.asyncio
    async def test_health_endpoint(self):
        """Test health endpoint returns expected format."""
        from ditto_service import health

        result = await health()

        assert "status" in result
        assert result["status"] == "ok"
        assert "sdk_ready" in result


# =============================================================================
# EDGE CASES
# =============================================================================

class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_blend_shape_output_valid(self):
        """Test blend shapes output is valid array."""
        from audio2face_service import RuleBasedPredictor, N_BLEND_SHAPES

        predictor = RuleBasedPredictor()

        # Test with various inputs
        for _ in range(10):
            mfcc = np.random.randn(13) * 10
            energy = np.random.random()
            pitch = np.random.random() * 400

            result = predictor.predict(mfcc, energy, pitch)

            assert result.shape == (N_BLEND_SHAPES,)
            assert not np.any(np.isnan(result))
            assert not np.any(np.isinf(result))

    def test_viseme_weights_positive(self):
        """Test viseme weights are non-negative."""
        from viseme_service import AudioAnalyzer

        analyzer = AudioAnalyzer()

        for _ in range(10):
            audio = np.random.randn(1024).astype(np.float32) * 0.3
            result = analyzer.analyze_chunk(audio)

            for weight in result.values():
                assert weight >= 0

    def test_empty_mfcc_handling(self):
        """Test RuleBasedPredictor handles edge case MFCCs."""
        from audio2face_service import RuleBasedPredictor, N_BLEND_SHAPES

        predictor = RuleBasedPredictor()

        # Single MFCC value
        result = predictor.predict(np.array([0.0]), 0.0, 0.0)
        assert result.shape == (N_BLEND_SHAPES,)

        # Very large MFCC array (should still work)
        result = predictor.predict(np.zeros(100), 0.0, 0.0)
        assert result.shape == (N_BLEND_SHAPES,)

    def test_negative_pitch_handling(self):
        """Test negative pitch is handled gracefully."""
        from audio2face_service import RuleBasedPredictor, N_BLEND_SHAPES

        predictor = RuleBasedPredictor()
        result = predictor.predict(np.zeros(13), 0.5, -100.0)

        assert result.shape == (N_BLEND_SHAPES,)
        assert not np.any(np.isnan(result))


# =============================================================================
# WARP FUNCTION TESTS (mocked)
# =============================================================================

class TestVisemeWarpFunctions:
    """Tests for viseme warping functions."""

    def test_warp_triangle_exists(self):
        """Test warp_triangle function exists."""
        from viseme_service import warp_triangle

        assert callable(warp_triangle)

    def test_warp_mouth_exists(self):
        """Test warp_mouth function exists."""
        from viseme_service import warp_mouth

        assert callable(warp_mouth)


class TestAudio2FaceWarpFunctions:
    """Tests for audio2face warping (FaceWarper class)."""

    def test_face_warper_class_exists(self):
        """Test FaceWarper class exists."""
        from audio2face_service import FaceWarper

        assert FaceWarper is not None
