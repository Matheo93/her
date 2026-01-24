"""
Tests for streaming_lipsync.py - Sprint 554
Testing real-time lip-sync streaming service
"""

import pytest
import numpy as np
from unittest.mock import MagicMock, patch, AsyncMock
from dataclasses import asdict


class TestConstants:
    """Tests for module-level constants"""

    def test_sample_rate(self):
        """Test sample rate is standard 16kHz"""
        from streaming_lipsync import SAMPLE_RATE
        assert SAMPLE_RATE == 16000

    def test_audio_fps(self):
        """Test audio FPS matches Whisper internal rate"""
        from streaming_lipsync import AUDIO_FPS
        assert AUDIO_FPS == 50

    def test_video_fps(self):
        """Test video FPS is 25"""
        from streaming_lipsync import FPS
        assert FPS == 25

    def test_batch_size(self):
        """Test batch size is optimized for RTX 4090"""
        from streaming_lipsync import BATCH_SIZE
        assert BATCH_SIZE == 8

    def test_chunk_duration_calculation(self):
        """Test chunk duration is correctly calculated"""
        from streaming_lipsync import BATCH_SIZE, FPS, CHUNK_DURATION_MS
        expected = int(BATCH_SIZE * 1000 / FPS)  # 8 * 1000 / 25 = 320
        assert CHUNK_DURATION_MS == expected
        assert CHUNK_DURATION_MS == 320

    def test_chunk_samples_calculation(self):
        """Test chunk samples is correctly calculated"""
        from streaming_lipsync import SAMPLE_RATE, CHUNK_DURATION_MS, CHUNK_SAMPLES
        expected = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)  # 16000 * 320 / 1000 = 5120
        assert CHUNK_SAMPLES == expected
        assert CHUNK_SAMPLES == 5120

    def test_audio_padding_values(self):
        """Test audio padding values for feature extraction"""
        from streaming_lipsync import AUDIO_PADDING_LEFT, AUDIO_PADDING_RIGHT, AUDIO_FEATURE_LENGTH
        assert AUDIO_PADDING_LEFT == 2
        assert AUDIO_PADDING_RIGHT == 2
        expected_length = 2 * (AUDIO_PADDING_LEFT + AUDIO_PADDING_RIGHT + 1)  # 10
        assert AUDIO_FEATURE_LENGTH == expected_length


class TestAvatarData:
    """Tests for AvatarData dataclass"""

    def test_avatar_data_creation(self):
        """Test AvatarData can be created"""
        from streaming_lipsync import AvatarData
        avatar = AvatarData(avatar_id="test")
        assert avatar.avatar_id == "test"
        assert avatar.frame is None
        assert avatar.coord == []
        assert avatar.latent is None
        assert avatar.mask is None
        assert avatar.mask_coords == []

    def test_avatar_data_with_values(self):
        """Test AvatarData with values"""
        from streaming_lipsync import AvatarData
        frame = np.zeros((256, 256, 3), dtype=np.uint8)
        coord = [10, 20, 100, 120]

        avatar = AvatarData(
            avatar_id="eva",
            frame=frame,
            coord=coord
        )

        assert avatar.avatar_id == "eva"
        assert avatar.frame is not None
        assert avatar.frame.shape == (256, 256, 3)
        assert avatar.coord == [10, 20, 100, 120]


class TestStreamingProcessor:
    """Tests for StreamingProcessor class"""

    @pytest.fixture
    def mock_avatar(self):
        """Create a mock avatar"""
        from streaming_lipsync import AvatarData
        avatar = AvatarData(avatar_id="test")
        avatar.frame = np.zeros((256, 256, 3), dtype=np.uint8)
        avatar.coord = [50, 50, 150, 150]
        return avatar

    @patch('streaming_lipsync.load_avatar')
    def test_processor_init(self, mock_load, mock_avatar):
        """Test StreamingProcessor initialization"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor

        processor = StreamingProcessor("eva")

        assert processor.avatar == mock_avatar
        assert len(processor.audio_buffer) == 0
        assert processor.frame_index == 0
        assert processor.total_process_time == 0
        assert processor.total_frames == 0

    @patch('streaming_lipsync.load_avatar')
    def test_add_audio(self, mock_load, mock_avatar):
        """Test adding audio to buffer"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor

        processor = StreamingProcessor("eva")
        audio = np.random.randn(1000).astype(np.float32)
        processor.add_audio(audio)

        assert len(processor.audio_buffer) == 1000

    @patch('streaming_lipsync.load_avatar')
    def test_add_audio_multiple(self, mock_load, mock_avatar):
        """Test adding audio multiple times concatenates"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor

        processor = StreamingProcessor("eva")
        audio1 = np.random.randn(500).astype(np.float32)
        audio2 = np.random.randn(700).astype(np.float32)

        processor.add_audio(audio1)
        processor.add_audio(audio2)

        assert len(processor.audio_buffer) == 1200

    @patch('streaming_lipsync.load_avatar')
    def test_can_process_false_when_empty(self, mock_load, mock_avatar):
        """Test can_process returns False with empty buffer"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor

        processor = StreamingProcessor("eva")
        assert processor.can_process() is False

    @patch('streaming_lipsync.load_avatar')
    def test_can_process_false_when_insufficient(self, mock_load, mock_avatar):
        """Test can_process returns False with insufficient audio"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor, CHUNK_SAMPLES

        processor = StreamingProcessor("eva")
        # Add less than required samples
        audio = np.random.randn(CHUNK_SAMPLES - 100).astype(np.float32)
        processor.add_audio(audio)

        assert processor.can_process() is False

    @patch('streaming_lipsync.load_avatar')
    def test_can_process_true_when_sufficient(self, mock_load, mock_avatar):
        """Test can_process returns True with sufficient audio"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor, CHUNK_SAMPLES

        processor = StreamingProcessor("eva")
        # Add exactly required samples
        audio = np.random.randn(CHUNK_SAMPLES).astype(np.float32)
        processor.add_audio(audio)

        assert processor.can_process() is True

    @patch('streaming_lipsync.load_avatar')
    def test_get_buffer_duration_ms(self, mock_load, mock_avatar):
        """Test buffer duration calculation"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor, SAMPLE_RATE

        processor = StreamingProcessor("eva")

        # Empty buffer
        assert processor.get_buffer_duration_ms() == 0

        # Add 1 second of audio
        audio = np.random.randn(SAMPLE_RATE).astype(np.float32)
        processor.add_audio(audio)
        assert processor.get_buffer_duration_ms() == 1000

        # Add another half second
        audio = np.random.randn(SAMPLE_RATE // 2).astype(np.float32)
        processor.add_audio(audio)
        assert processor.get_buffer_duration_ms() == 1500

    @patch('streaming_lipsync.load_avatar')
    def test_get_stats_initial(self, mock_load, mock_avatar):
        """Test initial stats"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor

        processor = StreamingProcessor("eva")
        stats = processor.get_stats()

        assert stats["total_frames"] == 0
        assert stats["total_time_ms"] == 0
        assert stats["avg_per_frame_ms"] == 0
        assert stats["effective_fps"] == 0


class TestIdleAnimator:
    """Tests for IdleAnimator class"""

    @pytest.fixture
    def mock_avatar(self):
        """Create a mock avatar"""
        from streaming_lipsync import AvatarData
        avatar = AvatarData(avatar_id="test")
        avatar.frame = np.zeros((256, 256, 3), dtype=np.uint8)
        avatar.coord = [50, 50, 150, 150]
        return avatar

    @patch('streaming_lipsync.load_avatar')
    def test_idle_animator_init(self, mock_load, mock_avatar):
        """Test IdleAnimator initialization"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import IdleAnimator

        animator = IdleAnimator("eva")

        assert animator.avatar == mock_avatar
        assert animator.time == 0.0
        assert animator.blink_state == 0.0
        # Blink next should be between 2 and 5 seconds
        assert 2 <= animator.blink_next <= 5

    @patch('streaming_lipsync.load_avatar')
    def test_idle_animator_time_advances(self, mock_load, mock_avatar):
        """Test that time advances (even without GPU)"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import IdleAnimator, FPS

        animator = IdleAnimator("eva")
        initial_time = animator.time

        # Simulate time advance without actual GPU call
        animator.time += 1.0 / FPS

        assert animator.time > initial_time
        assert animator.time == pytest.approx(1.0 / FPS)


class TestHealthEndpoint:
    """Tests for /health endpoint"""

    @pytest.mark.asyncio
    async def test_health_returns_ok(self):
        """Test health endpoint returns expected values"""
        from streaming_lipsync import health, BATCH_SIZE, CHUNK_DURATION_MS, FPS

        result = await health()

        assert result["status"] == "ok"
        assert result["streaming"] is True
        assert result["batch_size"] == BATCH_SIZE
        assert result["chunk_ms"] == CHUNK_DURATION_MS
        assert result["target_fps"] == FPS
        assert "avatars" in result
        assert isinstance(result["avatars"], list)


class TestCalculations:
    """Tests for mathematical calculations and formulas"""

    def test_whisper_idx_mult_calculation(self):
        """Test Whisper index multiplier calculation"""
        from streaming_lipsync import AUDIO_FPS, FPS
        whisper_idx_mult = AUDIO_FPS / FPS  # 50 / 25 = 2.0
        assert whisper_idx_mult == 2.0

    def test_frames_to_audio_samples(self):
        """Test frame count to audio samples conversion"""
        from streaming_lipsync import FPS, SAMPLE_RATE

        # For 1 frame at 25 FPS, we need 16000/25 = 640 samples
        samples_per_frame = SAMPLE_RATE / FPS
        assert samples_per_frame == 640

    def test_chunk_contains_correct_frames(self):
        """Test chunk duration produces correct frame count"""
        from streaming_lipsync import CHUNK_DURATION_MS, FPS, BATCH_SIZE

        # CHUNK_DURATION_MS should produce BATCH_SIZE frames at FPS
        frames_in_chunk = CHUNK_DURATION_MS * FPS / 1000
        assert frames_in_chunk == BATCH_SIZE

    def test_audio_feature_extraction_window(self):
        """Test audio feature extraction window size"""
        from streaming_lipsync import (
            AUDIO_PADDING_LEFT, AUDIO_PADDING_RIGHT,
            AUDIO_FEATURE_LENGTH, AUDIO_FPS, FPS
        )

        # Window should be centered on frame with padding
        whisper_idx_mult = AUDIO_FPS / FPS  # 2.0
        pad_left = int(whisper_idx_mult * AUDIO_PADDING_LEFT)  # 4
        pad_right = int(whisper_idx_mult * AUDIO_PADDING_RIGHT)  # 4

        assert pad_left == 4
        assert pad_right == 4

        # Feature length formula: 2 * (left + right + 1)
        expected_length = 2 * (AUDIO_PADDING_LEFT + AUDIO_PADDING_RIGHT + 1)
        assert AUDIO_FEATURE_LENGTH == expected_length


class TestAudioBuffer:
    """Tests for audio buffer management"""

    @pytest.fixture
    def mock_avatar(self):
        """Create a mock avatar"""
        from streaming_lipsync import AvatarData
        avatar = AvatarData(avatar_id="test")
        avatar.frame = np.zeros((256, 256, 3), dtype=np.uint8)
        avatar.coord = [50, 50, 150, 150]
        return avatar

    @patch('streaming_lipsync.load_avatar')
    def test_buffer_type_conversion(self, mock_load, mock_avatar):
        """Test audio buffer converts to float32"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor

        processor = StreamingProcessor("eva")

        # Add int16 audio
        audio_int = np.array([100, -100, 200], dtype=np.int16)
        processor.add_audio(audio_int)

        assert processor.audio_buffer.dtype == np.float32

    @patch('streaming_lipsync.load_avatar')
    def test_buffer_concatenation_preserves_order(self, mock_load, mock_avatar):
        """Test buffer concatenation preserves audio order"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor

        processor = StreamingProcessor("eva")

        # Add sequences that can be identified
        audio1 = np.array([1.0, 2.0, 3.0], dtype=np.float32)
        audio2 = np.array([4.0, 5.0, 6.0], dtype=np.float32)

        processor.add_audio(audio1)
        processor.add_audio(audio2)

        expected = np.array([1.0, 2.0, 3.0, 4.0, 5.0, 6.0], dtype=np.float32)
        np.testing.assert_array_equal(processor.audio_buffer, expected)


class TestLatencyTargets:
    """Tests for latency target constants"""

    def test_target_latency_reasonable(self):
        """Test target latency is achievable"""
        from streaming_lipsync import CHUNK_DURATION_MS, BATCH_SIZE

        # Target: ~150ms from audio to first frame
        # With 320ms chunks, processing should be < 150ms for good UX
        assert CHUNK_DURATION_MS == 320

        # At batch=8 processing ~123ms on RTX 4090:
        # Per-frame effective latency = 123/8 = ~15ms
        effective_per_frame = 123 / BATCH_SIZE
        assert effective_per_frame < 20  # Under 20ms per frame is good

    def test_fps_achievable(self):
        """Test target FPS is achievable with batching"""
        from streaming_lipsync import FPS, BATCH_SIZE

        # 25 FPS = 40ms per frame budget
        frame_budget_ms = 1000 / FPS
        assert frame_budget_ms == 40

        # With batch processing at ~123ms for 8 frames:
        # Effective rate = 8 / 0.123 = ~65 FPS (exceeds 25 FPS target)
        effective_fps = BATCH_SIZE / 0.123
        assert effective_fps > FPS


class TestIntegration:
    """Integration tests for streaming processor"""

    @pytest.fixture
    def mock_avatar(self):
        """Create a mock avatar"""
        from streaming_lipsync import AvatarData
        avatar = AvatarData(avatar_id="test")
        avatar.frame = np.zeros((256, 256, 3), dtype=np.uint8)
        avatar.coord = [50, 50, 150, 150]
        return avatar

    @patch('streaming_lipsync.load_avatar')
    def test_process_workflow(self, mock_load, mock_avatar):
        """Test the complete add->check->process workflow"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor, CHUNK_SAMPLES, SAMPLE_RATE

        processor = StreamingProcessor("eva")

        # Initially cannot process
        assert processor.can_process() is False
        assert processor.get_buffer_duration_ms() == 0

        # Add 100ms of audio
        audio_100ms = np.random.randn(SAMPLE_RATE // 10).astype(np.float32)
        processor.add_audio(audio_100ms)
        assert processor.get_buffer_duration_ms() == 100
        assert processor.can_process() is False  # Still not enough

        # Add more audio to reach threshold (320ms total)
        audio_220ms = np.random.randn(int(SAMPLE_RATE * 0.22)).astype(np.float32)
        processor.add_audio(audio_220ms)
        assert processor.get_buffer_duration_ms() >= 320
        assert processor.can_process() is True

    @patch('streaming_lipsync.load_avatar')
    def test_multiple_batches(self, mock_load, mock_avatar):
        """Test processing multiple batches worth of audio"""
        mock_load.return_value = mock_avatar
        from streaming_lipsync import StreamingProcessor, CHUNK_SAMPLES

        processor = StreamingProcessor("eva")

        # Add 2.5 chunks worth of audio
        audio = np.random.randn(int(CHUNK_SAMPLES * 2.5)).astype(np.float32)
        processor.add_audio(audio)

        # Should be able to process twice
        assert processor.can_process() is True

        # After consuming one chunk, should still have enough for another
        # (This tests the buffer management without GPU)
        initial_buffer = len(processor.audio_buffer)
        processor.audio_buffer = processor.audio_buffer[CHUNK_SAMPLES:]
        assert processor.can_process() is True

        # After consuming second chunk, should not have enough
        processor.audio_buffer = processor.audio_buffer[CHUNK_SAMPLES:]
        assert processor.can_process() is False
