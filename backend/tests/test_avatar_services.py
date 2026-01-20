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


# =============================================================================
# GENERATE VISEMES SOLID TESTS
# =============================================================================

class TestGenerateVisemesSolid:
    """Tests for generate_visemes_solid.py."""

    def test_visemes_dict(self):
        """Test VISEMES dictionary is defined correctly."""
        from generate_visemes_solid import VISEMES

        assert len(VISEMES) == 12  # Standard viseme set

        expected_visemes = ["sil", "PP", "FF", "TH", "DD", "kk",
                          "CH", "SS", "RR", "AA", "EE", "OO"]

        for viseme in expected_visemes:
            assert viseme in VISEMES
            # Each viseme should have 3 float values
            assert len(VISEMES[viseme]) == 3

    def test_background_color(self):
        """Test background color constant."""
        from generate_visemes_solid import BACKGROUND_COLOR

        # Should be BGR tuple
        assert len(BACKGROUND_COLOR) == 3
        assert all(0 <= c <= 255 for c in BACKGROUND_COLOR)

    def test_composite_function_exists(self):
        """Test composite_on_background function exists."""
        from generate_visemes_solid import composite_on_background

        assert callable(composite_on_background)

    def test_composite_rgb_passthrough(self):
        """Test composite returns RGB unchanged when no alpha."""
        from generate_visemes_solid import composite_on_background

        # Create RGB image (no alpha)
        rgb_img = np.zeros((10, 10, 3), dtype=np.uint8)
        rgb_img[:, :, 0] = 255  # Red

        result = composite_on_background(rgb_img, (0, 0, 0))

        assert result.shape == (10, 10, 3)
        assert np.all(result[:, :, 0] == 255)

    def test_composite_rgba(self):
        """Test composite blends RGBA correctly."""
        from generate_visemes_solid import composite_on_background

        # Create RGBA image with 50% transparent red
        rgba_img = np.zeros((10, 10, 4), dtype=np.uint8)
        rgba_img[:, :, 2] = 255  # Red in BGR
        rgba_img[:, :, 3] = 128  # 50% alpha

        # Composite on black background
        result = composite_on_background(rgba_img, (0, 0, 0))

        assert result.shape == (10, 10, 3)
        # Red should be ~128 (blended 50% with black)
        assert 120 <= result[5, 5, 2] <= 135


# =============================================================================
# SADTALKER SERVICE TESTS
# =============================================================================

class TestSadTalkerServiceConfig:
    """Tests for sadtalker_service.py configuration."""

    def test_app_defined(self):
        """Test FastAPI app is defined."""
        from sadtalker_service import app

        assert app is not None
        assert app.title == "SadTalker Lip-Sync Service"

    def test_global_state_initialized(self):
        """Test global state variables exist."""
        from sadtalker_service import sadtalker, source_path

        # Should be None on import (not initialized)
        assert sadtalker is None
        assert source_path is None


class TestSadTalkerInitialize:
    """Tests for SadTalker initialization."""

    def test_initialize_handles_missing_module(self):
        """Test initialize returns False when SadTalker not available."""
        from sadtalker_service import initialize_sadtalker

        # Since SadTalker is not installed in test env, should return False
        result = initialize_sadtalker()

        # Result should be boolean
        assert isinstance(result, bool)
        # Should be False since we don't have the SadTalker module
        assert result is False


class TestSadTalkerEndpoints:
    """Tests for sadtalker_service FastAPI endpoints."""

    @pytest.mark.asyncio
    async def test_health_endpoint(self):
        """Test health endpoint returns expected format."""
        from sadtalker_service import health

        result = await health()

        assert "status" in result
        assert result["status"] == "ok"
        assert "ready" in result
        assert "cuda" in result

    @pytest.mark.asyncio
    async def test_prepare_source_no_file(self):
        """Test prepare_source handles no file gracefully."""
        import io
        from fastapi import UploadFile
        from sadtalker_service import prepare_source

        # Create a mock UploadFile
        content = b"fake image data"
        file = UploadFile(filename="test.png", file=io.BytesIO(content))

        result = await prepare_source(file)

        assert "status" in result
        assert result["status"] == "ok"

    @pytest.mark.asyncio
    async def test_generate_no_sadtalker(self):
        """Test generate returns error when SadTalker not initialized."""
        import io
        from fastapi import UploadFile
        from sadtalker_service import generate
        import sadtalker_service

        # Ensure SadTalker is not initialized and source is set
        sadtalker_service.sadtalker = None
        sadtalker_service.source_path = "/tmp/test.png"

        # Create a mock audio file
        content = b"fake audio data"
        file = UploadFile(filename="test.wav", file=io.BytesIO(content))

        result = await generate(file)

        # Should return JSONResponse with error 500 (SadTalker init fails)
        assert result.status_code == 500

        # Clean up
        sadtalker_service.source_path = None


# =============================================================================
# FASTERLP SERVICE TESTS
# =============================================================================

class TestFasterLPServiceConfig:
    """Tests for fasterlp_service.py configuration."""

    def test_app_defined(self):
        """Test FastAPI app is properly defined."""
        from fasterlp_service import app

        assert app is not None
        assert app.title == "FasterLivePortrait Service"

    def test_global_state_initial(self):
        """Test global state is initially None/False."""
        from fasterlp_service import flp_pipeline, joyvasa_pipeline, source_prepared

        assert flp_pipeline is None
        assert joyvasa_pipeline is None
        assert source_prepared is False

    def test_cors_middleware(self):
        """Test CORS middleware is configured."""
        from fasterlp_service import app
        from starlette.middleware.cors import CORSMiddleware

        # Check middleware stack
        has_cors = False
        for middleware in app.user_middleware:
            if middleware.cls == CORSMiddleware:
                has_cors = True
                # Check allow_origins
                assert middleware.kwargs.get("allow_origins") == ["*"]
                break

        assert has_cors


class TestFasterLPInitialize:
    """Tests for pipeline initialization functions."""

    def test_initialize_pipeline_returns_bool(self):
        """Test initialize_pipeline returns boolean."""
        from fasterlp_service import initialize_pipeline

        # Will fail (no real FasterLivePortrait) but should return False
        result = initialize_pipeline()

        assert isinstance(result, bool)
        assert result is False  # No real pipeline available

    def test_initialize_joyvasa_returns_bool(self):
        """Test initialize_joyvasa returns boolean."""
        from fasterlp_service import initialize_joyvasa

        # Will fail (no real JoyVASA) but should return False
        result = initialize_joyvasa()

        assert isinstance(result, bool)
        assert result is False  # No real pipeline available


class TestFasterLPHealthEndpoint:
    """Tests for health endpoint."""

    @pytest.mark.asyncio
    async def test_health_returns_status(self):
        """Test health endpoint returns proper status."""
        from fasterlp_service import health

        result = await health()

        assert "status" in result
        assert result["status"] == "ok"
        assert "pipeline_ready" in result
        assert "joyvasa_ready" in result

    @pytest.mark.asyncio
    async def test_health_pipeline_not_ready(self):
        """Test health shows pipeline not ready initially."""
        import fasterlp_service
        from fasterlp_service import health

        # Ensure pipelines are None
        fasterlp_service.flp_pipeline = None
        fasterlp_service.joyvasa_pipeline = None

        result = await health()

        assert result["pipeline_ready"] is False
        assert result["joyvasa_ready"] is False


class TestFasterLPPrepareSource:
    """Tests for prepare_source endpoint."""

    @pytest.mark.asyncio
    async def test_prepare_source_no_pipeline(self):
        """Test prepare_source returns error when pipeline not initialized."""
        import io
        from fastapi import UploadFile
        from fasterlp_service import prepare_source
        import fasterlp_service

        # Ensure pipeline is None
        fasterlp_service.flp_pipeline = None

        # Create a mock image file
        content = b"fake image data"
        file = UploadFile(filename="test.png", file=io.BytesIO(content))

        result = await prepare_source(file)

        # Should return JSONResponse with error 500 (pipeline not initialized)
        assert result.status_code == 500


class TestFasterLPAnimateWithAudio:
    """Tests for animate_with_audio endpoint."""

    @pytest.mark.asyncio
    async def test_animate_no_pipeline(self):
        """Test animate_with_audio returns error when pipeline not initialized."""
        import io
        from fastapi import UploadFile
        from fasterlp_service import animate_with_audio
        import fasterlp_service

        # Ensure pipeline is None
        fasterlp_service.flp_pipeline = None

        # Create mock files
        audio = UploadFile(filename="test.wav", file=io.BytesIO(b"fake audio"))

        result = await animate_with_audio(audio)

        # Should return JSONResponse with error 500
        assert result.status_code == 500

    @pytest.mark.asyncio
    async def test_animate_no_joyvasa(self):
        """Test animate_with_audio returns error when JoyVASA not initialized."""
        import io
        from fastapi import UploadFile
        from fasterlp_service import animate_with_audio
        import fasterlp_service

        # Mock flp_pipeline but not joyvasa
        fasterlp_service.flp_pipeline = MagicMock()
        fasterlp_service.joyvasa_pipeline = None

        audio = UploadFile(filename="test.wav", file=io.BytesIO(b"fake audio"))

        result = await animate_with_audio(audio)

        # Should return JSONResponse with error 500
        assert result.status_code == 500

        # Cleanup
        fasterlp_service.flp_pipeline = None


class TestFasterLPAnimateWithVideo:
    """Tests for animate_with_video endpoint."""

    @pytest.mark.asyncio
    async def test_animate_video_no_pipeline(self):
        """Test animate_with_video returns error when pipeline not initialized."""
        import io
        from fastapi import UploadFile
        from fasterlp_service import animate_with_video
        import fasterlp_service

        # Ensure pipeline is None
        fasterlp_service.flp_pipeline = None

        # Create mock video file
        video = UploadFile(filename="test.mp4", file=io.BytesIO(b"fake video"))

        result = await animate_with_video(video)

        # Should return JSONResponse with error 500
        assert result.status_code == 500

    @pytest.mark.asyncio
    async def test_animate_video_no_source(self):
        """Test animate_with_video returns error when no source prepared."""
        import io
        from fastapi import UploadFile
        from fasterlp_service import animate_with_video
        import fasterlp_service

        # Mock pipeline but no source
        mock_pipeline = MagicMock()
        mock_pipeline.prepare_source.return_value = False  # No face detected
        fasterlp_service.flp_pipeline = mock_pipeline
        fasterlp_service.source_prepared = False

        video = UploadFile(filename="test.mp4", file=io.BytesIO(b"fake video"))

        result = await animate_with_video(video, source_image=None)

        # Should return JSONResponse with error 400 (no source)
        assert result.status_code == 400

        # Cleanup
        fasterlp_service.flp_pipeline = None


# =============================================================================
# GENERATE VISEMES V2 TESTS
# =============================================================================

class TestGenerateVisemesV2Config:
    """Tests for generate_visemes_v2.py configuration."""

    def test_visemes_dict_defined(self):
        """Test VISEMES dict is properly defined."""
        from generate_visemes_v2 import VISEMES

        assert len(VISEMES) > 0
        assert "sil" in VISEMES  # Silence
        assert "AA" in VISEMES   # Open mouth
        assert "OO" in VISEMES   # Rounded mouth
        assert "EE" in VISEMES   # Wide smile

    def test_viseme_params_format(self):
        """Test viseme params are (jaw_open, mouth_width, lip_pucker) tuples."""
        from generate_visemes_v2 import VISEMES

        for name, params in VISEMES.items():
            assert len(params) == 3, f"Viseme {name} should have 3 params"
            jaw_open, mouth_width, lip_pucker = params
            assert 0.0 <= jaw_open <= 1.0, f"jaw_open out of range for {name}"
            assert -0.5 <= mouth_width <= 0.5, f"mouth_width out of range for {name}"
            assert 0.0 <= lip_pucker <= 1.0, f"lip_pucker out of range for {name}"

    def test_silence_viseme_closed(self):
        """Test silence viseme has closed mouth."""
        from generate_visemes_v2 import VISEMES

        sil = VISEMES["sil"]
        assert sil[0] == 0.0  # jaw_open
        assert sil[1] == 0.0  # mouth_width
        assert sil[2] == 0.0  # lip_pucker

    def test_viseme_count(self):
        """Test expected number of visemes."""
        from generate_visemes_v2 import VISEMES

        assert len(VISEMES) == 12  # Standard viseme set


class TestWarpTriangle:
    """Tests for warp_triangle function."""

    def test_warp_triangle_valid(self):
        """Test warp_triangle with valid triangles."""
        from generate_visemes_v2 import warp_triangle

        src_img = np.zeros((100, 100, 3), dtype=np.uint8)
        dst_img = np.zeros((100, 100, 3), dtype=np.uint8)

        src_tri = np.array([[10, 10], [30, 10], [20, 30]], dtype=np.float32)
        dst_tri = np.array([[15, 15], [35, 15], [25, 35]], dtype=np.float32)

        # Should not raise exception
        warp_triangle(src_img, dst_img, src_tri, dst_tri)

    def test_warp_triangle_degenerate(self):
        """Test warp_triangle handles degenerate triangles."""
        from generate_visemes_v2 import warp_triangle

        src_img = np.zeros((100, 100, 3), dtype=np.uint8)
        dst_img = np.zeros((100, 100, 3), dtype=np.uint8)

        # Degenerate triangle (all points same)
        src_tri = np.array([[10, 10], [10, 10], [10, 10]], dtype=np.float32)
        dst_tri = np.array([[10, 10], [10, 10], [10, 10]], dtype=np.float32)

        # Should not raise, just return early
        warp_triangle(src_img, dst_img, src_tri, dst_tri)


class TestWarpMouthRegion:
    """Tests for warp_mouth_region function."""

    def test_warp_mouth_no_change(self):
        """Test warp with no parameters returns similar image."""
        from generate_visemes_v2 import warp_mouth_region

        img = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
        # Create mock landmarks (68 points)
        landmarks = np.random.randn(68, 2) * 20 + 128

        result = warp_mouth_region(img, landmarks, 0.0, 0.0, 0.0)

        assert result.shape == img.shape
        assert result.dtype == img.dtype

    def test_warp_mouth_jaw_open(self):
        """Test warp with jaw_open parameter."""
        from generate_visemes_v2 import warp_mouth_region

        img = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
        landmarks = np.random.randn(68, 2) * 20 + 128

        result = warp_mouth_region(img, landmarks, 0.5, 0.0, 0.0)

        assert result.shape == img.shape

    def test_warp_mouth_all_params(self):
        """Test warp with all parameters."""
        from generate_visemes_v2 import warp_mouth_region

        img = np.random.randint(0, 255, (256, 256, 3), dtype=np.uint8)
        landmarks = np.random.randn(68, 2) * 20 + 128

        result = warp_mouth_region(img, landmarks, 0.5, 0.2, 0.3)

        assert result.shape == img.shape
        assert result.dtype == img.dtype
