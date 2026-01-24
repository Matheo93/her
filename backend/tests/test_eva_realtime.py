"""
Tests for eva_realtime.py - Realtime Communication System.

Sprint 552: Comprehensive tests for realtime voice conversation system.

Tests cover:
- AudioBuffer operations (add, get_audio, clear, duration, chunk limiting)
- VADState dataclass
- ConversationState enum and state transitions
- RealtimeSession full lifecycle (init, speech detection, interrupts, turn-taking)
- RealtimeManager session management
- Utility functions (init_realtime, get_realtime_manager, process_realtime_audio)
"""

import pytest
import asyncio
import numpy as np
import sys
import os
import time
from unittest.mock import Mock, patch, AsyncMock

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


class TestAudioBuffer:
    """Tests for AudioBuffer class."""

    def test_audio_buffer_init_defaults(self):
        """Test AudioBuffer initialization with defaults."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer()

        assert buffer.chunks == []
        assert buffer.sample_rate == 16000
        assert buffer.max_duration == 30.0
        assert buffer._total_samples == 0
        assert buffer._max_chunks > 0

    def test_audio_buffer_init_custom_sample_rate(self):
        """Test AudioBuffer with custom sample rate."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer(sample_rate=44100)

        assert buffer.sample_rate == 44100
        # max_chunks should scale with sample rate
        assert buffer._max_chunks > 0

    def test_audio_buffer_init_custom_max_duration(self):
        """Test AudioBuffer with custom max duration."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer(max_duration=60.0)

        assert buffer.max_duration == 60.0

    def test_audio_buffer_add_single_chunk(self):
        """Test adding single audio chunk."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer(sample_rate=16000)

        # Create 512 samples (1024 bytes for int16)
        chunk = bytes(1024)
        buffer.add(chunk)

        assert len(buffer.chunks) == 1
        assert buffer._total_samples == 512

    def test_audio_buffer_add_multiple_chunks(self):
        """Test adding multiple audio chunks."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer(sample_rate=16000)

        for i in range(5):
            chunk = bytes(1024)  # 512 samples each
            buffer.add(chunk)

        assert len(buffer.chunks) == 5
        assert buffer._total_samples == 512 * 5

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

    def test_audio_buffer_removes_oldest_on_overflow(self):
        """Test that oldest chunks are removed when buffer overflows."""
        from eva_realtime import AudioBuffer

        # Very small buffer
        buffer = AudioBuffer(sample_rate=16000, max_duration=0.05)

        initial_max = buffer._max_chunks

        # Add many chunks
        for i in range(initial_max + 10):
            buffer.add(bytes(1024))

        assert len(buffer.chunks) == buffer._max_chunks

    def test_audio_buffer_total_samples_updated_on_overflow(self):
        """Test _total_samples is correctly updated when chunks are removed."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer(sample_rate=16000, max_duration=0.05)
        max_chunks = buffer._max_chunks

        # Fill buffer to max
        for i in range(max_chunks + 5):
            buffer.add(bytes(1024))  # 512 samples each

        expected_samples = max_chunks * 512
        assert buffer._total_samples == expected_samples

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

    def test_audio_buffer_get_audio_multiple_chunks(self):
        """Test get_audio combines multiple chunks correctly."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer()

        # Add two chunks
        chunk1 = np.array([100, 200, 300], dtype=np.int16)
        chunk2 = np.array([400, 500], dtype=np.int16)
        buffer.add(chunk1.tobytes())
        buffer.add(chunk2.tobytes())

        audio = buffer.get_audio()

        assert len(audio) == 5
        expected = np.array([100, 200, 300, 400, 500], dtype=np.float32) / 32768.0
        np.testing.assert_array_almost_equal(audio, expected)

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

    def test_audio_buffer_duration_calculation(self):
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

    def test_audio_buffer_duration_after_clear(self):
        """Test duration is zero after clear."""
        from eva_realtime import AudioBuffer

        buffer = AudioBuffer()
        buffer.add(bytes(32000))
        buffer.clear()

        assert buffer.duration() == 0.0

    def test_audio_buffer_max_chunks_calculation(self):
        """Test max_chunks is correctly calculated in __post_init__."""
        from eva_realtime import AudioBuffer

        # At 16000 Hz, 30s, with 512 bytes per chunk (256 int16 samples)
        buffer = AudioBuffer(sample_rate=16000, max_duration=30.0)

        # max_chunks = max_duration * sample_rate / 512
        expected = int(30.0 * 16000 / 512)
        assert buffer._max_chunks == expected


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

    def test_vad_state_custom_values(self):
        """Test VADState with custom values."""
        from eva_realtime import VADState

        state = VADState(
            is_speech=True,
            speech_start=1.0,
            speech_end=2.0,
            silence_duration=0.5,
            energy_level=0.8
        )

        assert state.is_speech is True
        assert state.speech_start == 1.0
        assert state.speech_end == 2.0
        assert state.silence_duration == 0.5
        assert state.energy_level == 0.8


class TestConversationState:
    """Tests for ConversationState enum."""

    def test_conversation_state_idle(self):
        """Test IDLE state."""
        from eva_realtime import ConversationState

        assert ConversationState.IDLE.value == "idle"

    def test_conversation_state_user_speaking(self):
        """Test USER_SPEAKING state."""
        from eva_realtime import ConversationState

        assert ConversationState.USER_SPEAKING.value == "user_speaking"

    def test_conversation_state_eva_speaking(self):
        """Test EVA_SPEAKING state."""
        from eva_realtime import ConversationState

        assert ConversationState.EVA_SPEAKING.value == "eva_speaking"

    def test_conversation_state_interrupted(self):
        """Test INTERRUPTED state."""
        from eva_realtime import ConversationState

        assert ConversationState.INTERRUPTED.value == "interrupted"

    def test_conversation_state_processing(self):
        """Test PROCESSING state."""
        from eva_realtime import ConversationState

        assert ConversationState.PROCESSING.value == "processing"

    def test_all_states_count(self):
        """Test total number of states."""
        from eva_realtime import ConversationState

        assert len(ConversationState) == 5

    def test_can_respond_states_set(self):
        """Test _CAN_RESPOND_STATES contains correct states."""
        from eva_realtime import ConversationState, _CAN_RESPOND_STATES

        assert ConversationState.IDLE in _CAN_RESPOND_STATES
        assert ConversationState.PROCESSING in _CAN_RESPOND_STATES
        assert ConversationState.USER_SPEAKING not in _CAN_RESPOND_STATES
        assert ConversationState.EVA_SPEAKING not in _CAN_RESPOND_STATES


class TestRealtimeSession:
    """Tests for RealtimeSession class."""

    @pytest.fixture
    def mock_vad(self):
        """Mock VAD options to avoid dependency."""
        with patch("eva_realtime.VAD_AVAILABLE", False):
            yield

    def test_session_init(self, mock_vad):
        """Test session initialization."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test-123")

        assert session.session_id == "test-123"
        assert session.sample_rate == 16000
        assert session.state == ConversationState.IDLE
        assert session.interrupt_count == 0

    def test_session_custom_sample_rate(self, mock_vad):
        """Test session with custom sample rate."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test", sample_rate=44100)

        assert session.sample_rate == 44100
        assert session.user_audio_buffer.sample_rate == 44100

    def test_session_callbacks(self, mock_vad):
        """Test session stores callbacks."""
        from eva_realtime import RealtimeSession

        on_speech = Mock()
        on_interrupt = Mock()
        on_silence = Mock()

        session = RealtimeSession(
            session_id="test",
            on_user_speech=on_speech,
            on_interrupt=on_interrupt,
            on_silence=on_silence
        )

        assert session.on_user_speech == on_speech
        assert session.on_interrupt == on_interrupt
        assert session.on_silence == on_silence

    def test_session_initial_audio_buffer(self, mock_vad):
        """Test session creates audio buffer."""
        from eva_realtime import RealtimeSession, AudioBuffer

        session = RealtimeSession(session_id="test")

        assert isinstance(session.user_audio_buffer, AudioBuffer)
        assert len(session.user_audio_buffer.chunks) == 0

    def test_session_initial_vad_state(self, mock_vad):
        """Test session creates VAD state."""
        from eva_realtime import RealtimeSession, VADState

        session = RealtimeSession(session_id="test")

        assert isinstance(session.vad_state, VADState)
        assert session.vad_state.is_speech is False

    def test_session_interrupt_settings(self, mock_vad):
        """Test session has interrupt settings."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")

        assert session.interrupt_threshold == 0.15
        assert session.min_interrupt_duration == 0.2

    def test_session_timing_defaults(self, mock_vad):
        """Test session timing defaults."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")

        assert session.last_user_speech_end == 0
        assert session.last_eva_speech_end == 0
        assert session.eva_speech_start == 0

    def test_session_statistics_defaults(self, mock_vad):
        """Test session statistics defaults."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")

        assert session.total_user_speech_time == 0
        assert session.total_eva_speech_time == 0
        assert session.interrupt_count == 0

    def test_detect_speech_empty_audio(self, mock_vad):
        """Test speech detection with empty audio."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")
        audio = np.array([], dtype=np.float32)

        result = session._detect_speech(audio)

        assert result is False

    def test_detect_speech_silent_audio(self, mock_vad):
        """Test speech detection with silent audio."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")
        # Very quiet audio (below threshold)
        audio = np.zeros(1000, dtype=np.float32) + 0.001

        result = session._detect_speech(audio)

        assert result == False
        assert session.vad_state.energy_level > 0

    def test_detect_speech_loud_audio(self, mock_vad):
        """Test speech detection with loud audio."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")
        # Loud audio (above threshold of 0.02)
        audio = np.ones(1000, dtype=np.float32) * 0.1

        result = session._detect_speech(audio)

        assert result == True
        assert session.vad_state.energy_level > 0.02

    def test_check_interrupt_not_eva_speaking(self, mock_vad):
        """Test interrupt check when Eva is not speaking."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.state = ConversationState.IDLE
        audio = np.ones(1000, dtype=np.float32) * 0.5

        result = session._check_interrupt(audio)

        assert result is False

    def test_check_interrupt_eva_speaking_low_energy(self, mock_vad):
        """Test interrupt check with Eva speaking and low energy audio."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.state = ConversationState.EVA_SPEAKING
        audio = np.zeros(1000, dtype=np.float32)

        result = session._check_interrupt(audio)

        assert result is False

    def test_check_interrupt_eva_speaking_high_energy_short(self, mock_vad):
        """Test interrupt check with high energy but short duration."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.state = ConversationState.EVA_SPEAKING
        audio = np.ones(1000, dtype=np.float32) * 0.5

        # First call - starts tracking
        result = session._check_interrupt(audio, current_time=0.0)
        assert result is False

        # Second call - still within min_interrupt_duration (0.2s)
        result = session._check_interrupt(audio, current_time=0.1)
        assert result is False

    def test_check_interrupt_eva_speaking_high_energy_long(self, mock_vad):
        """Test interrupt check with high energy and sufficient duration."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.state = ConversationState.EVA_SPEAKING
        audio = np.ones(1000, dtype=np.float32) * 0.5

        # First call - starts tracking
        session._check_interrupt(audio, current_time=0.0)

        # Second call - past min_interrupt_duration (0.2s)
        result = session._check_interrupt(audio, current_time=0.3)
        assert result is True

    def test_check_interrupt_resets_on_silence(self, mock_vad):
        """Test interrupt tracking resets when audio becomes quiet."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.state = ConversationState.EVA_SPEAKING

        # High energy audio
        loud_audio = np.ones(1000, dtype=np.float32) * 0.5
        session._check_interrupt(loud_audio, current_time=0.0)
        assert session._interrupt_start is not None

        # Quiet audio
        quiet_audio = np.zeros(1000, dtype=np.float32)
        session._check_interrupt(quiet_audio, current_time=0.1)
        assert session._interrupt_start is None

    def test_start_eva_speech(self, mock_vad):
        """Test starting Eva speech."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")

        session.start_eva_speech(current_time=100.0)

        assert session.state == ConversationState.EVA_SPEAKING
        assert session.eva_speech_start == 100.0

    def test_start_eva_speech_uses_time_now(self, mock_vad):
        """Test start_eva_speech uses current time if not provided."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")

        before = time.time()
        session.start_eva_speech()
        after = time.time()

        assert before <= session.eva_speech_start <= after

    def test_end_eva_speech(self, mock_vad):
        """Test ending Eva speech."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.start_eva_speech(current_time=100.0)

        session.end_eva_speech(current_time=105.0)

        assert session.state == ConversationState.IDLE
        assert session.last_eva_speech_end == 105.0
        assert session.total_eva_speech_time == 5.0
        assert session._interrupt_start is None

    def test_get_turn_state(self, mock_vad):
        """Test getting turn-taking state."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.last_user_speech_end = 10.0
        session.last_eva_speech_end = 15.0
        session.vad_state.energy_level = 0.5

        state = session.get_turn_state(current_time=20.0)

        assert state["state"] == "idle"
        assert state["user_speaking"] is False
        assert state["eva_speaking"] is False
        assert state["silence_duration"] == 5.0
        assert state["energy_level"] == 0.5
        assert state["can_respond"] is True
        assert state["interrupted"] is False

    def test_get_turn_state_user_speaking(self, mock_vad):
        """Test turn state when user is speaking."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.state = ConversationState.USER_SPEAKING

        state = session.get_turn_state(current_time=0.0)

        assert state["user_speaking"] is True
        assert state["eva_speaking"] is False
        assert state["can_respond"] is False

    def test_get_turn_state_eva_speaking(self, mock_vad):
        """Test turn state when Eva is speaking."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.state = ConversationState.EVA_SPEAKING

        state = session.get_turn_state(current_time=0.0)

        assert state["user_speaking"] is False
        assert state["eva_speaking"] is True
        assert state["can_respond"] is False

    def test_get_stats(self, mock_vad):
        """Test getting session statistics."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test-session")
        session.total_user_speech_time = 30.0
        session.total_eva_speech_time = 20.0
        session.interrupt_count = 2

        stats = session.get_stats()

        assert stats["session_id"] == "test-session"
        assert stats["total_user_speech"] == 30.0
        assert stats["total_eva_speech"] == 20.0
        assert stats["user_ratio"] == 0.6  # 30 / 50
        assert stats["interrupt_count"] == 2

    def test_get_stats_no_speech(self, mock_vad):
        """Test stats when no speech has occurred."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")

        stats = session.get_stats()

        assert stats["user_ratio"] == 0.5  # Default when no speech

    @pytest.mark.asyncio
    async def test_queue_eva_audio(self, mock_vad):
        """Test queueing Eva audio."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")
        audio_bytes = b"test audio data"

        await session.queue_eva_audio(audio_bytes)

        assert session.eva_audio_queue.qsize() == 1

    @pytest.mark.asyncio
    async def test_get_eva_audio_with_data(self, mock_vad):
        """Test getting Eva audio when queue has data."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")
        audio_bytes = b"test audio data"
        await session.queue_eva_audio(audio_bytes)

        result = await session.get_eva_audio()

        assert result == audio_bytes

    @pytest.mark.asyncio
    async def test_get_eva_audio_empty_queue(self, mock_vad):
        """Test getting Eva audio from empty queue."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")

        result = await session.get_eva_audio()

        assert result is None

    @pytest.mark.asyncio
    async def test_process_audio_chunk_silent(self, mock_vad):
        """Test processing silent audio chunk."""
        from eva_realtime import RealtimeSession

        session = RealtimeSession(session_id="test")
        # Silent audio (zeros)
        silent_audio = np.zeros(1000, dtype=np.int16).tobytes()

        result = await session.process_audio_chunk(silent_audio)

        assert result["speech_detected"] == False
        assert result["interrupt"] == False
        assert result["should_respond"] == False

    @pytest.mark.asyncio
    async def test_process_audio_chunk_speech(self, mock_vad):
        """Test processing audio chunk with speech."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        # Loud audio (above threshold)
        loud_audio = (np.ones(1000, dtype=np.float32) * 5000).astype(np.int16).tobytes()

        result = await session.process_audio_chunk(loud_audio)

        assert result["speech_detected"] == True
        assert session.state == ConversationState.USER_SPEAKING
        assert session.vad_state.is_speech == True

    @pytest.mark.asyncio
    async def test_process_audio_chunk_interrupt(self, mock_vad):
        """Test processing audio chunk triggers interrupt."""
        from eva_realtime import RealtimeSession, ConversationState

        session = RealtimeSession(session_id="test")
        session.state = ConversationState.EVA_SPEAKING
        session._interrupt_start = 0.0  # Pre-set interrupt start

        # Loud audio to trigger interrupt (needs to be high enough)
        loud_audio = (np.ones(1000, dtype=np.float32) * 10000).astype(np.int16).tobytes()

        # Call past min_interrupt_duration (0.2s)
        result = await session.process_audio_chunk(loud_audio, current_time=0.3)

        assert result["interrupt"] == True
        assert session.state == ConversationState.INTERRUPTED
        assert session.interrupt_count == 1

    @pytest.mark.asyncio
    async def test_process_audio_chunk_interrupt_callback(self, mock_vad):
        """Test interrupt callback is called."""
        from eva_realtime import RealtimeSession, ConversationState

        on_interrupt = AsyncMock()
        session = RealtimeSession(session_id="test-123", on_interrupt=on_interrupt)
        session.state = ConversationState.EVA_SPEAKING
        session._interrupt_start = 0.0  # Pre-set interrupt start

        loud_audio = (np.ones(1000, dtype=np.float32) * 10000).astype(np.int16).tobytes()

        await session.process_audio_chunk(loud_audio, current_time=0.3)

        on_interrupt.assert_called_once_with("test-123")

    @pytest.mark.asyncio
    async def test_process_audio_speech_to_silence_transition(self, mock_vad):
        """Test transition from speech to silence triggers response."""
        from eva_realtime import RealtimeSession, ConversationState

        on_user_speech = AsyncMock()
        session = RealtimeSession(session_id="test", on_user_speech=on_user_speech)

        # First: Speech - set state directly
        session.state = ConversationState.USER_SPEAKING
        session.vad_state.speech_start = 0.0

        # Then: Silence for 700ms+ (at least 0.7s silence duration)
        silent_audio = np.zeros(1000, dtype=np.int16).tobytes()

        result = await session.process_audio_chunk(silent_audio, current_time=1.0)

        assert session.state == ConversationState.PROCESSING
        assert result["should_respond"] == True
        assert result["transcription_ready"] == True
        on_user_speech.assert_called_once()


class TestRealtimeManager:
    """Tests for RealtimeManager class."""

    @pytest.fixture
    def mock_vad(self):
        """Mock VAD options."""
        with patch("eva_realtime.VAD_AVAILABLE", False):
            yield

    def test_manager_init(self, mock_vad):
        """Test manager initialization."""
        from eva_realtime import RealtimeManager

        manager = RealtimeManager()

        assert manager.sessions == {}

    def test_create_session(self, mock_vad):
        """Test creating a new session."""
        from eva_realtime import RealtimeManager, RealtimeSession

        manager = RealtimeManager()

        session = manager.create_session("session-1")

        assert isinstance(session, RealtimeSession)
        assert session.session_id == "session-1"
        assert "session-1" in manager.sessions

    def test_create_session_with_callbacks(self, mock_vad):
        """Test creating session with callbacks."""
        from eva_realtime import RealtimeManager

        manager = RealtimeManager()
        on_speech = Mock()
        on_interrupt = Mock()

        session = manager.create_session(
            "session-1",
            on_user_speech=on_speech,
            on_interrupt=on_interrupt
        )

        assert session.on_user_speech == on_speech
        assert session.on_interrupt == on_interrupt

    def test_create_session_idempotent(self, mock_vad):
        """Test creating same session returns existing."""
        from eva_realtime import RealtimeManager

        manager = RealtimeManager()

        session1 = manager.create_session("session-1")
        session2 = manager.create_session("session-1")

        assert session1 is session2
        assert len(manager.sessions) == 1

    def test_get_session_exists(self, mock_vad):
        """Test getting existing session."""
        from eva_realtime import RealtimeManager

        manager = RealtimeManager()
        created = manager.create_session("session-1")

        retrieved = manager.get_session("session-1")

        assert retrieved is created

    def test_get_session_not_exists(self, mock_vad):
        """Test getting non-existent session."""
        from eva_realtime import RealtimeManager

        manager = RealtimeManager()

        result = manager.get_session("non-existent")

        assert result is None

    def test_close_session(self, mock_vad):
        """Test closing a session."""
        from eva_realtime import RealtimeManager

        manager = RealtimeManager()
        manager.create_session("session-1")
        assert "session-1" in manager.sessions

        manager.close_session("session-1")

        assert "session-1" not in manager.sessions

    def test_close_session_non_existent(self, mock_vad):
        """Test closing non-existent session doesn't error."""
        from eva_realtime import RealtimeManager

        manager = RealtimeManager()

        # Should not raise
        manager.close_session("non-existent")

    def test_multiple_sessions(self, mock_vad):
        """Test managing multiple sessions."""
        from eva_realtime import RealtimeManager

        manager = RealtimeManager()

        session1 = manager.create_session("session-1")
        session2 = manager.create_session("session-2")
        session3 = manager.create_session("session-3")

        assert len(manager.sessions) == 3
        assert manager.get_session("session-1") is session1
        assert manager.get_session("session-2") is session2
        assert manager.get_session("session-3") is session3


class TestUtilityFunctions:
    """Tests for utility functions."""

    @pytest.fixture
    def reset_manager(self):
        """Reset global manager before each test."""
        import eva_realtime
        eva_realtime.realtime_manager = None
        yield
        eva_realtime.realtime_manager = None

    @pytest.fixture
    def mock_vad(self):
        """Mock VAD options."""
        with patch("eva_realtime.VAD_AVAILABLE", False):
            yield

    def test_init_realtime(self, reset_manager, mock_vad):
        """Test init_realtime creates manager."""
        from eva_realtime import init_realtime, RealtimeManager
        import eva_realtime

        manager = init_realtime()

        assert isinstance(manager, RealtimeManager)
        assert eva_realtime.realtime_manager is manager

    def test_get_realtime_manager_creates_if_none(self, reset_manager, mock_vad):
        """Test get_realtime_manager creates manager if none exists."""
        from eva_realtime import get_realtime_manager, RealtimeManager
        import eva_realtime

        assert eva_realtime.realtime_manager is None

        manager = get_realtime_manager()

        assert isinstance(manager, RealtimeManager)
        assert eva_realtime.realtime_manager is manager

    def test_get_realtime_manager_returns_existing(self, reset_manager, mock_vad):
        """Test get_realtime_manager returns existing manager."""
        from eva_realtime import init_realtime, get_realtime_manager

        manager1 = init_realtime()
        manager2 = get_realtime_manager()

        assert manager1 is manager2

    @pytest.mark.asyncio
    async def test_process_realtime_audio_creates_session(self, reset_manager, mock_vad):
        """Test process_realtime_audio creates session if needed."""
        from eva_realtime import process_realtime_audio, get_realtime_manager

        audio_bytes = np.zeros(1000, dtype=np.int16).tobytes()

        result = await process_realtime_audio("new-session", audio_bytes)

        manager = get_realtime_manager()
        assert "new-session" in manager.sessions
        assert "speech_detected" in result

    @pytest.mark.asyncio
    async def test_process_realtime_audio_uses_existing_session(self, reset_manager, mock_vad):
        """Test process_realtime_audio uses existing session."""
        from eva_realtime import process_realtime_audio, get_realtime_manager

        audio_bytes = np.zeros(1000, dtype=np.int16).tobytes()

        # First call creates session
        await process_realtime_audio("test-session", audio_bytes)
        manager = get_realtime_manager()
        session = manager.get_session("test-session")

        # Second call uses same session
        await process_realtime_audio("test-session", audio_bytes)

        assert manager.get_session("test-session") is session


class TestWebRTCAvailability:
    """Tests for WebRTC availability flag."""

    def test_webrtc_available_flag_exists(self):
        """Test WEBRTC_AVAILABLE flag is defined."""
        from eva_realtime import WEBRTC_AVAILABLE

        assert isinstance(WEBRTC_AVAILABLE, bool)


class TestVADAvailability:
    """Tests for VAD availability flag."""

    def test_vad_available_flag_exists(self):
        """Test VAD_AVAILABLE flag is defined."""
        from eva_realtime import VAD_AVAILABLE

        assert isinstance(VAD_AVAILABLE, bool)
