"""
Tests for eva_realtime.py - Realtime Communication System.

Tests:
- AudioBuffer operations (add, get_audio, clear, duration)
- VADState dataclass
- ConversationState enum
"""

import pytest
import numpy as np
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestAudioBuffer:
    """Tests for AudioBuffer class - Sprint 526."""

    def test_audio_buffer_init(self):
        """Test AudioBuffer initialization."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer()

        assert buffer.chunks == []
        assert buffer.sample_rate == 16000
        assert buffer.max_duration == 30.0
        assert buffer._total_samples == 0
        assert buffer._max_chunks > 0

    def test_audio_buffer_add_chunk(self):
        """Test adding audio chunk."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer(sample_rate=16000)

        # Create 512 samples (1024 bytes for int16)
        chunk = bytes(1024)
        buffer.add(chunk)

        assert len(buffer.chunks) == 1
        assert buffer._total_samples == 512

    def test_audio_buffer_max_chunks_limit(self):
        """Test buffer respects max_chunks limit."""
        from eva_realtime import AudioBuffer

        # Small buffer for testing
        buffer = AudioBuffer(sample_rate=16000, max_duration=0.1)

        # Add more chunks than max
        for i in range(100):
            chunk = bytes(1024)  # 512 samples
            buffer.add(chunk)

        # Should be limited
        assert len(buffer.chunks) <= buffer._max_chunks

    def test_audio_buffer_get_audio_empty(self):
        """Test get_audio on empty buffer."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer()
        audio = buffer.get_audio()

        assert isinstance(audio, np.ndarray)
        assert len(audio) == 0
        assert audio.dtype == np.float32

    def test_audio_buffer_get_audio_with_data(self):
        """Test get_audio returns normalized float32 array."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer()

        # Create int16 audio data
        samples = np.array([0, 16384, -16384, 32767, -32768], dtype=np.int16)
        buffer.add(samples.tobytes())

        audio = buffer.get_audio()

        assert audio.dtype == np.float32
        assert len(audio) == 5
        # Check normalization (divided by 32768)
        assert abs(audio[0]) < 0.001  # 0 -> ~0
        assert abs(audio[1] - 0.5) < 0.01  # 16384 -> ~0.5
        assert abs(audio[4] + 1.0) < 0.001  # -32768 -> -1.0

    def test_audio_buffer_clear(self):
        """Test clearing buffer."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer()
        buffer.add(bytes(1024))
        buffer.add(bytes(1024))

        assert len(buffer.chunks) == 2
        assert buffer._total_samples > 0

        buffer.clear()

        assert len(buffer.chunks) == 0
        assert buffer._total_samples == 0

    def test_audio_buffer_duration(self):
        """Test duration calculation."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer(sample_rate=16000)

        # Add 16000 samples = 1 second
        # 16000 samples * 2 bytes/sample = 32000 bytes
        buffer.add(bytes(32000))

        duration = buffer.duration()
        assert abs(duration - 1.0) < 0.001

    def test_audio_buffer_duration_cached(self):
        """Test that duration uses cached _total_samples."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer(sample_rate=16000)

        # Add 8000 samples = 0.5 seconds
        buffer.add(bytes(16000))

        # Manually check cached value
        assert buffer._total_samples == 8000
        assert buffer.duration() == 0.5


class TestVADState:
    """Tests for VADState dataclass."""

    def test_vad_state_defaults(self):
        """Test VADState default values."""
        from eva_realtime import VADState

        state = VADState()

        assert state.is_speech is False
        assert state.speech_start is None
        assert state.speech_end is None
        assert state.silence_duration == 0.0
        assert state.energy_level == 0.0


class TestConversationState:
    """Tests for ConversationState enum."""

    def test_conversation_states(self):
        """Test all conversation states exist."""
        from eva_realtime import ConversationState

        assert ConversationState.IDLE.value == "idle"
        assert ConversationState.USER_SPEAKING.value == "user_speaking"
        assert ConversationState.EVA_SPEAKING.value == "eva_speaking"
        assert ConversationState.INTERRUPTED.value == "interrupted"
        assert ConversationState.PROCESSING.value == "processing"


class TestRealtimeSession:
    """Tests for RealtimeSession class."""

    @pytest.mark.skipif(True, reason="VAD dependency issue in test environment")
    def test_session_init(self):
        """Test session initialization."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test-123")

        assert session.session_id == "test-123"
        assert session.sample_rate == 16000
        assert session.state == ConversationState.IDLE
        assert session.interrupt_count == 0

    @pytest.mark.skipif(True, reason="VAD dependency issue in test environment")
    def test_session_custom_sample_rate(self):
        """Test session with custom sample rate."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test", sample_rate=44100)

        assert session.sample_rate == 44100
        assert session.user_audio_buffer.sample_rate == 44100
