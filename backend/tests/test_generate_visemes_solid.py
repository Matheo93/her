"""
Tests for generate_visemes_solid.py

Sprint 562: Backend - Viseme generation with solid background tests
"""

import pytest
import numpy as np
from unittest.mock import Mock, patch, MagicMock
import sys

# Mock cv2 and face_alignment before importing
sys.modules['cv2'] = Mock()
sys.modules['face_alignment'] = Mock()
sys.modules['scipy'] = Mock()
sys.modules['scipy.spatial'] = Mock()

# Now import the module
from generate_visemes_solid import (
    VISEME_DIR,
    SOURCE_PATH,
    BACKGROUND_COLOR,
    VISEMES,
    composite_on_background,
    warp_mouth_region,
    warp_triangle,
    main,
)


# ============================================================================
# CONSTANTS TESTS
# ============================================================================

class TestConstants:
    """Test module constants"""

    def test_viseme_dir_is_string(self):
        assert isinstance(VISEME_DIR, str)

    def test_viseme_dir_path_format(self):
        assert "visemes" in VISEME_DIR

    def test_source_path_is_string(self):
        assert isinstance(SOURCE_PATH, str)

    def test_source_path_has_png_extension(self):
        assert SOURCE_PATH.endswith(".png")

    def test_background_color_is_tuple(self):
        assert isinstance(BACKGROUND_COLOR, tuple)

    def test_background_color_has_three_values(self):
        assert len(BACKGROUND_COLOR) == 3

    def test_background_color_values_in_range(self):
        for value in BACKGROUND_COLOR:
            assert 0 <= value <= 255


# ============================================================================
# VISEMES DICTIONARY TESTS
# ============================================================================

class TestVisemesDictionary:
    """Test VISEMES dictionary structure"""

    def test_visemes_is_dict(self):
        assert isinstance(VISEMES, dict)

    def test_visemes_has_12_entries(self):
        assert len(VISEMES) == 12

    def test_visemes_has_silence(self):
        assert "sil" in VISEMES

    def test_visemes_silence_is_neutral(self):
        jaw, width, pucker = VISEMES["sil"]
        assert jaw == 0.0
        assert width == 0.0
        assert pucker == 0.0

    def test_visemes_has_bilabials(self):
        assert "PP" in VISEMES

    def test_visemes_has_labiodentals(self):
        assert "FF" in VISEMES

    def test_visemes_has_dental(self):
        assert "TH" in VISEMES

    def test_visemes_has_alveolar(self):
        assert "DD" in VISEMES

    def test_visemes_has_velar(self):
        assert "kk" in VISEMES

    def test_visemes_has_postalveolar(self):
        assert "CH" in VISEMES

    def test_visemes_has_sibilant(self):
        assert "SS" in VISEMES

    def test_visemes_has_approximant(self):
        assert "RR" in VISEMES

    def test_visemes_has_open_vowel(self):
        assert "AA" in VISEMES

    def test_visemes_has_front_vowel(self):
        assert "EE" in VISEMES

    def test_visemes_has_rounded_vowel(self):
        assert "OO" in VISEMES

    def test_all_visemes_have_three_values(self):
        for name, values in VISEMES.items():
            assert isinstance(values, tuple), f"{name} should be a tuple"
            assert len(values) == 3, f"{name} should have 3 values"

    def test_viseme_values_are_floats(self):
        for name, (jaw, width, pucker) in VISEMES.items():
            assert isinstance(jaw, float), f"{name} jaw should be float"
            assert isinstance(width, float), f"{name} width should be float"
            assert isinstance(pucker, float), f"{name} pucker should be float"

    def test_aa_viseme_has_wide_jaw(self):
        jaw, width, pucker = VISEMES["AA"]
        assert jaw > 0.5, "AA viseme should have wide jaw opening"

    def test_oo_viseme_has_pucker(self):
        jaw, width, pucker = VISEMES["OO"]
        assert pucker > 0, "OO viseme should have lip pucker"

    def test_pp_viseme_has_closed_lips(self):
        jaw, width, pucker = VISEMES["PP"]
        assert jaw < 0.2, "PP viseme should have nearly closed jaw"


# ============================================================================
# COMPOSITE_ON_BACKGROUND TESTS
# ============================================================================

class TestCompositeOnBackground:
    """Test composite_on_background function"""

    def test_handles_rgba_image(self):
        # Create RGBA image with alpha channel
        img_rgba = np.zeros((100, 100, 4), dtype=np.uint8)
        img_rgba[:, :, :3] = 255  # White
        img_rgba[:, :, 3] = 128   # 50% alpha

        bg_color = (0, 0, 0)  # Black background
        result = composite_on_background(img_rgba, bg_color)

        assert result.shape == (100, 100, 3)

    def test_output_is_rgb(self):
        img_rgba = np.zeros((50, 50, 4), dtype=np.uint8)
        img_rgba[:, :, 3] = 255

        result = composite_on_background(img_rgba, (128, 128, 128))

        assert result.shape[2] == 3, "Output should be RGB (3 channels)"

    def test_handles_rgb_image(self):
        # RGB image (no alpha)
        img_rgb = np.zeros((100, 100, 3), dtype=np.uint8)
        img_rgb[:, :] = (100, 100, 100)

        result = composite_on_background(img_rgb, (0, 0, 0))

        assert result.shape == (100, 100, 3)

    def test_full_opacity_preserves_image(self):
        img_rgba = np.zeros((10, 10, 4), dtype=np.uint8)
        img_rgba[:, :, :3] = (100, 150, 200)
        img_rgba[:, :, 3] = 255  # Full opacity

        result = composite_on_background(img_rgba, (0, 0, 0))

        np.testing.assert_array_equal(result, img_rgba[:, :, :3])

    def test_zero_opacity_shows_background(self):
        img_rgba = np.zeros((10, 10, 4), dtype=np.uint8)
        img_rgba[:, :, :3] = (255, 255, 255)
        img_rgba[:, :, 3] = 0  # Zero opacity

        bg_color = (50, 100, 150)
        result = composite_on_background(img_rgba, bg_color)

        expected = np.full((10, 10, 3), bg_color, dtype=np.uint8)
        np.testing.assert_array_equal(result, expected)

    def test_half_opacity_blends(self):
        img_rgba = np.zeros((10, 10, 4), dtype=np.uint8)
        img_rgba[:, :, :3] = (200, 200, 200)
        img_rgba[:, :, 3] = 128  # ~50% opacity

        bg_color = (0, 0, 0)
        result = composite_on_background(img_rgba, bg_color)

        # Should be blended value
        assert 90 < result[0, 0, 0] < 110

    def test_preserves_image_dimensions(self):
        img_rgba = np.zeros((200, 300, 4), dtype=np.uint8)
        img_rgba[:, :, 3] = 255

        result = composite_on_background(img_rgba, (0, 0, 0))

        assert result.shape[0] == 200
        assert result.shape[1] == 300


# ============================================================================
# WARP_TRIANGLE TESTS
# ============================================================================

class TestWarpTriangle:
    """Test warp_triangle function"""

    @pytest.fixture
    def mock_cv2(self):
        with patch('generate_visemes_solid.cv2') as mock:
            mock.boundingRect.return_value = (10, 10, 20, 20)
            mock.getAffineTransform.return_value = np.eye(2, 3)
            mock.warpAffine.return_value = np.zeros((20, 20, 3), dtype=np.uint8)
            mock.fillConvexPoly = Mock()
            mock.BORDER_REFLECT_101 = 4
            yield mock

    def test_handles_zero_width_bounding_rect(self, mock_cv2):
        mock_cv2.boundingRect.return_value = (10, 10, 0, 20)

        src_img = np.zeros((100, 100, 3), dtype=np.uint8)
        dst_img = np.zeros((100, 100, 3), dtype=np.uint8)
        src_tri = np.array([[10, 10], [20, 10], [15, 20]], dtype=np.float32)
        dst_tri = np.array([[10, 10], [20, 10], [15, 20]], dtype=np.float32)

        # Should return early without error
        warp_triangle(src_img, dst_img, src_tri, dst_tri)

    def test_handles_zero_height_bounding_rect(self, mock_cv2):
        mock_cv2.boundingRect.return_value = (10, 10, 20, 0)

        src_img = np.zeros((100, 100, 3), dtype=np.uint8)
        dst_img = np.zeros((100, 100, 3), dtype=np.uint8)
        src_tri = np.array([[10, 10], [20, 10], [15, 20]], dtype=np.float32)
        dst_tri = np.array([[10, 10], [20, 10], [15, 20]], dtype=np.float32)

        # Should return early without error
        warp_triangle(src_img, dst_img, src_tri, dst_tri)

    def test_handles_negative_bounding_rect(self, mock_cv2):
        mock_cv2.boundingRect.return_value = (10, 10, -5, 20)

        src_img = np.zeros((100, 100, 3), dtype=np.uint8)
        dst_img = np.zeros((100, 100, 3), dtype=np.uint8)
        src_tri = np.array([[10, 10], [20, 10], [15, 20]], dtype=np.float32)
        dst_tri = np.array([[10, 10], [20, 10], [15, 20]], dtype=np.float32)

        # Should return early without error
        warp_triangle(src_img, dst_img, src_tri, dst_tri)


# ============================================================================
# WARP_MOUTH_REGION TESTS
# ============================================================================

class TestWarpMouthRegion:
    """Test warp_mouth_region function"""

    @pytest.fixture
    def mock_dependencies(self):
        with patch('generate_visemes_solid.cv2') as mock_cv2, \
             patch.object(sys.modules['scipy.spatial'], 'Delaunay') as mock_delaunay:

            mock_cv2.boundingRect.return_value = (10, 10, 20, 20)
            mock_cv2.getAffineTransform.return_value = np.eye(2, 3)
            mock_cv2.warpAffine.return_value = np.zeros((20, 20, 3), dtype=np.uint8)
            mock_cv2.fillConvexPoly = Mock()
            mock_cv2.BORDER_REFLECT_101 = 4

            mock_tri = Mock()
            mock_tri.simplices = np.array([[0, 1, 2]])
            mock_delaunay.return_value = mock_tri

            yield mock_cv2, mock_delaunay

    def test_creates_copy_of_image(self, mock_dependencies):
        img = np.zeros((200, 200, 3), dtype=np.uint8)
        landmarks = np.zeros((68, 2), dtype=np.float32)
        landmarks[48:68] = [[100, 100]] * 20  # Mouth landmarks

        with patch('generate_visemes_solid.warp_triangle'):
            result = warp_mouth_region(img, landmarks, 0.0, 0.0, 0.0)

        assert result is not img, "Should return a copy"

    def test_accepts_jaw_open_parameter(self, mock_dependencies):
        img = np.zeros((200, 200, 3), dtype=np.uint8)
        landmarks = np.zeros((68, 2), dtype=np.float32)
        landmarks[48:68] = [[100, 100]] * 20

        with patch('generate_visemes_solid.warp_triangle'):
            result = warp_mouth_region(img, landmarks, 0.5, 0.0, 0.0)

        assert result is not None

    def test_accepts_mouth_width_parameter(self, mock_dependencies):
        img = np.zeros((200, 200, 3), dtype=np.uint8)
        landmarks = np.zeros((68, 2), dtype=np.float32)
        landmarks[48:68] = [[100, 100]] * 20

        with patch('generate_visemes_solid.warp_triangle'):
            result = warp_mouth_region(img, landmarks, 0.0, 0.3, 0.0)

        assert result is not None

    def test_accepts_lip_pucker_parameter(self, mock_dependencies):
        img = np.zeros((200, 200, 3), dtype=np.uint8)
        landmarks = np.zeros((68, 2), dtype=np.float32)
        landmarks[48:68] = [[100, 100]] * 20

        with patch('generate_visemes_solid.warp_triangle'):
            result = warp_mouth_region(img, landmarks, 0.0, 0.0, 0.5)

        assert result is not None

    def test_handles_extreme_jaw_open(self, mock_dependencies):
        img = np.zeros((200, 200, 3), dtype=np.uint8)
        landmarks = np.zeros((68, 2), dtype=np.float32)
        landmarks[48:68] = [[100, 100]] * 20

        with patch('generate_visemes_solid.warp_triangle'):
            result = warp_mouth_region(img, landmarks, 1.0, 0.0, 0.0)

        assert result is not None

    def test_uses_mouth_landmarks(self, mock_dependencies):
        img = np.zeros((200, 200, 3), dtype=np.uint8)
        landmarks = np.zeros((68, 2), dtype=np.float32)
        # Set mouth landmarks (48-67)
        for i in range(48, 68):
            landmarks[i] = [100 + i - 48, 120 + (i - 48) % 5]

        with patch('generate_visemes_solid.warp_triangle'):
            result = warp_mouth_region(img, landmarks, 0.2, 0.1, 0.1)

        assert result is not None


# ============================================================================
# MAIN FUNCTION TESTS
# ============================================================================

class TestMain:
    """Test main function"""

    @pytest.fixture
    def mock_all_dependencies(self):
        with patch('generate_visemes_solid.cv2') as mock_cv2, \
             patch('generate_visemes_solid.face_alignment') as mock_fa, \
             patch('generate_visemes_solid.os') as mock_os, \
             patch('generate_visemes_solid.warp_mouth_region') as mock_warp, \
             patch('generate_visemes_solid.composite_on_background') as mock_composite:

            # Setup cv2 mocks
            mock_img = np.zeros((200, 200, 4), dtype=np.uint8)
            mock_cv2.imread.return_value = mock_img
            mock_cv2.cvtColor.return_value = np.zeros((200, 200, 3), dtype=np.uint8)
            mock_cv2.imwrite.return_value = True
            mock_cv2.IMREAD_UNCHANGED = -1
            mock_cv2.COLOR_BGR2RGB = 4
            mock_cv2.IMWRITE_JPEG_QUALITY = 1

            # Setup face_alignment mocks
            mock_fa_instance = Mock()
            mock_fa_instance.get_landmarks.return_value = [np.zeros((68, 2))]
            mock_fa.FaceAlignment.return_value = mock_fa_instance
            mock_fa.LandmarksType.TWO_D = 1

            # Setup os mocks
            mock_os.makedirs = Mock()
            mock_os.path.join = lambda *args: "/".join(args)

            # Setup warp mock
            mock_warp.return_value = np.zeros((200, 200, 3), dtype=np.uint8)

            # Setup composite mock
            mock_composite.return_value = np.zeros((200, 200, 3), dtype=np.uint8)

            yield {
                'cv2': mock_cv2,
                'face_alignment': mock_fa,
                'os': mock_os,
                'warp': mock_warp,
                'composite': mock_composite,
            }

    def test_loads_source_image(self, mock_all_dependencies):
        mocks = mock_all_dependencies

        main()

        mocks['cv2'].imread.assert_called_once()

    def test_handles_missing_image(self, mock_all_dependencies):
        mocks = mock_all_dependencies
        mocks['cv2'].imread.return_value = None

        # Should return early without error
        main()

        mocks['face_alignment'].FaceAlignment.assert_not_called()

    def test_creates_face_alignment_instance(self, mock_all_dependencies):
        mocks = mock_all_dependencies

        main()

        mocks['face_alignment'].FaceAlignment.assert_called_once()

    def test_composites_on_background(self, mock_all_dependencies):
        mocks = mock_all_dependencies

        main()

        mocks['composite'].assert_called_once()

    def test_handles_no_face_detected(self, mock_all_dependencies):
        mocks = mock_all_dependencies
        fa_instance = mocks['face_alignment'].FaceAlignment.return_value
        fa_instance.get_landmarks.return_value = None

        # Should return early without error
        main()

        mocks['warp'].assert_not_called()

    def test_handles_empty_landmarks(self, mock_all_dependencies):
        mocks = mock_all_dependencies
        fa_instance = mocks['face_alignment'].FaceAlignment.return_value
        fa_instance.get_landmarks.return_value = []

        # Should return early without error
        main()

        mocks['warp'].assert_not_called()

    def test_creates_output_directory(self, mock_all_dependencies):
        mocks = mock_all_dependencies

        main()

        mocks['os'].makedirs.assert_called()

    def test_generates_all_visemes(self, mock_all_dependencies):
        mocks = mock_all_dependencies

        main()

        # Should call warp_mouth_region for each viseme
        assert mocks['warp'].call_count == len(VISEMES)

    def test_saves_visemes_as_jpeg(self, mock_all_dependencies):
        mocks = mock_all_dependencies

        main()

        # Should save one image per viseme
        assert mocks['cv2'].imwrite.call_count == len(VISEMES)


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestIntegration:
    """Integration tests"""

    def test_composite_with_real_numpy_arrays(self):
        # Create test RGBA image
        img_rgba = np.zeros((50, 50, 4), dtype=np.uint8)
        img_rgba[10:40, 10:40, :3] = (200, 100, 50)  # Orange square
        img_rgba[10:40, 10:40, 3] = 200  # High opacity

        bg_color = (30, 30, 30)  # Dark gray
        result = composite_on_background(img_rgba, bg_color)

        # Check result is valid
        assert result.dtype == np.uint8
        assert result.shape == (50, 50, 3)

        # Check blending happened
        center_pixel = result[25, 25]
        assert center_pixel[0] > bg_color[0]  # B channel should be higher
        assert center_pixel[1] > bg_color[1]  # G channel should be higher
        assert center_pixel[2] > bg_color[2]  # R channel should be higher

    def test_viseme_parameters_reasonable(self):
        """Test that all viseme parameters are in reasonable ranges"""
        for name, (jaw, width, pucker) in VISEMES.items():
            assert -0.5 <= jaw <= 1.0, f"{name} jaw out of range"
            assert -0.5 <= width <= 0.5, f"{name} width out of range"
            assert 0.0 <= pucker <= 1.0, f"{name} pucker out of range"

    def test_viseme_names_are_standard(self):
        """Test that viseme names follow standard naming"""
        expected_visemes = {
            "sil", "PP", "FF", "TH", "DD", "kk",
            "CH", "SS", "RR", "AA", "EE", "OO"
        }
        assert set(VISEMES.keys()) == expected_visemes


# ============================================================================
# EDGE CASES TESTS
# ============================================================================

class TestEdgeCases:
    """Test edge cases"""

    def test_composite_with_single_pixel_image(self):
        img_rgba = np.array([[[[255, 128, 64, 255]]]], dtype=np.uint8)
        result = composite_on_background(img_rgba.reshape(1, 1, 4), (0, 0, 0))
        assert result.shape == (1, 1, 3)

    def test_composite_with_large_image(self):
        img_rgba = np.zeros((1000, 1000, 4), dtype=np.uint8)
        img_rgba[:, :, 3] = 255
        result = composite_on_background(img_rgba, (128, 128, 128))
        assert result.shape == (1000, 1000, 3)

    def test_composite_with_varying_alpha(self):
        img_rgba = np.zeros((100, 100, 4), dtype=np.uint8)
        # Create gradient alpha
        for i in range(100):
            img_rgba[:, i, 3] = int(255 * i / 99)
        img_rgba[:, :, :3] = 255

        result = composite_on_background(img_rgba, (0, 0, 0))

        # Left side should be close to background, right close to foreground
        assert result[50, 0, 0] < result[50, 99, 0]

    def test_viseme_dict_immutable_structure(self):
        """Test that VISEMES dict values cannot be accidentally modified"""
        original_sil = VISEMES["sil"]
        assert isinstance(original_sil, tuple), "Values should be tuples (immutable)"
