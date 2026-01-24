"""
EVA Realtime Communication System
Full-duplex WebRTC/WebSocket for natural conversation
Handles: Interruptions, Turn-taking, Streaming audio
"""

import asyncio
import time
import json
import base64
import numpy as np
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field
from enum import Enum
import io
import wave

# WebRTC support
try:
    from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
    from aiortc.contrib.media import MediaPlayer, MediaRecorder
    WEBRTC_AVAILABLE = True
except ImportError:
    WEBRTC_AVAILABLE = False
    print("⚠️ WebRTC (aiortc) not available - using WebSocket fallback")

# VAD for speech detection
try:
    from faster_whisper.vad import VadOptions, get_speech_timestamps
    VAD_AVAILABLE = True
except ImportError:
    VAD_AVAILABLE = False
    print("⚠️ Silero VAD not available")


class ConversationState(Enum):
    """Current state of the conversation"""
    IDLE = "idle"  # No one speaking
    USER_SPEAKING = "user_speaking"  # User is talking
    EVA_SPEAKING = "eva_speaking"  # Eva is talking
    INTERRUPTED = "interrupted"  # Eva was interrupted
    PROCESSING = "processing"  # Processing user input


# Pre-computed state sets for O(1) lookup (module-level for performance)
_CAN_RESPOND_STATES = frozenset({ConversationState.IDLE, ConversationState.PROCESSING})


@dataclass
class AudioBuffer:
    """Buffer for audio chunks.

    Optimizations:
    - Pre-computed max_chunks at init time
    - Cached total_samples for duration calculation
    - Efficient slicing instead of reassignment
    """
    chunks: List[bytes] = field(default_factory=list)
    sample_rate: int = 16000
    max_duration: float = 30.0  # Max seconds to buffer
    _total_samples: int = field(default=0, repr=False)  # Cache for performance
    _max_chunks: int = field(default=0, init=False, repr=False)

    def __post_init__(self):
        # Pre-compute max chunks at init (avoids repeated calculation)
        self._max_chunks = int(self.max_duration * self.sample_rate / 512)

    def add(self, chunk: bytes):
        self.chunks.append(chunk)
        self._total_samples += len(chunk) // 2  # 2 bytes per int16 sample
        # Limit buffer size
        if len(self.chunks) > self._max_chunks:
            # Track removed samples
            removed = self.chunks[0]
            self._total_samples -= len(removed) // 2
            self.chunks = self.chunks[-self._max_chunks:]

    def get_audio(self) -> np.ndarray:
        if not self.chunks:
            return np.array([], dtype=np.float32)
        # Pre-allocate output array for better performance
        total_len = sum(len(c) // 2 for c in self.chunks)
        result = np.empty(total_len, dtype=np.float32)
        idx = 0
        for chunk in self.chunks:
            arr = np.frombuffer(chunk, dtype=np.int16).astype(np.float32)
            arr_len = len(arr)
            result[idx:idx + arr_len] = arr
            idx += arr_len
        result /= 32768.0
        return result

    def clear(self):
        self.chunks = []
        self._total_samples = 0

    def duration(self) -> float:
        return self._total_samples / self.sample_rate


@dataclass
class VADState:
    """Voice Activity Detection state"""
    is_speech: bool = False
    speech_start: Optional[float] = None
    speech_end: Optional[float] = None
    silence_duration: float = 0.0
    energy_level: float = 0.0


class RealtimeSession:
    """
    Manages a real-time voice conversation session

    Features:
    - Full-duplex audio (simultaneous send/receive)
    - VAD for speech detection
    - Interrupt detection
    - Turn-taking management
    """

    def __init__(
        self,
        session_id: str,
        sample_rate: int = 16000,
        on_user_speech: Optional[Callable] = None,
        on_interrupt: Optional[Callable] = None,
        on_silence: Optional[Callable] = None
    ):
        self.session_id = session_id
        self.sample_rate = sample_rate
        self.state = ConversationState.IDLE

        # Callbacks
        self.on_user_speech = on_user_speech  # Called when user finishes speaking
        self.on_interrupt = on_interrupt  # Called when user interrupts Eva
        self.on_silence = on_silence  # Called during meaningful silence

        # Audio buffers
        self.user_audio_buffer = AudioBuffer(sample_rate=sample_rate)
        self.eva_audio_queue: asyncio.Queue = asyncio.Queue()

        # VAD state
        self.vad_state = VADState()
        self.vad_options = VadOptions(
            threshold=0.5,
            min_speech_duration_ms=250,
            min_silence_duration_ms=500,
            speech_pad_ms=200
        ) if VAD_AVAILABLE else None

        # Timing
        self.last_user_speech_end: float = 0
        self.last_eva_speech_end: float = 0
        self.eva_speech_start: float = 0

        # Interrupt handling
        self.interrupt_threshold: float = 0.15  # Energy threshold for interrupt
        self.min_interrupt_duration: float = 0.2  # Minimum duration to trigger interrupt

        # Statistics
        self.total_user_speech_time: float = 0
        self.total_eva_speech_time: float = 0
        self.interrupt_count: int = 0

        print(f"🎙️ Realtime session created: {session_id}")

    def _detect_speech(self, audio_chunk: np.ndarray) -> bool:
        """Detect if audio chunk contains speech"""
        if len(audio_chunk) == 0:
            return False

        # Simple energy-based detection
        energy = np.sqrt(np.mean(audio_chunk ** 2))
        self.vad_state.energy_level = energy

        # Dynamic threshold
        threshold = 0.02  # Base threshold

        return energy > threshold

    def _check_interrupt(self, audio_chunk: np.ndarray, current_time: Optional[float] = None) -> bool:
        """Check if user is interrupting Eva's speech.

        Args:
            audio_chunk: Audio samples to analyze
            current_time: Optional timestamp to avoid repeated time.time() calls
        """
        if self.state != ConversationState.EVA_SPEAKING:
            return False

        # Check energy level
        energy = np.sqrt(np.mean(audio_chunk ** 2))

        if energy > self.interrupt_threshold:
            now = current_time if current_time is not None else time.time()
            # Track duration of potential interrupt
            if not hasattr(self, '_interrupt_start') or self._interrupt_start is None:
                self._interrupt_start = now
            elif now - self._interrupt_start > self.min_interrupt_duration:
                return True
        else:
            self._interrupt_start = None

        return False

    async def process_audio_chunk(self, audio_bytes: bytes) -> Dict[str, Any]:
        """
        Process incoming audio chunk from user

        Returns dict with:
        - speech_detected: bool
        - interrupt: bool
        - should_respond: bool
        - transcription_ready: bool
        """
        result = {
            "speech_detected": False,
            "interrupt": False,
            "should_respond": False,
            "transcription_ready": False,
            "state": self.state.value
        }

        # Convert to numpy
        audio = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0

        # Check for interrupt if Eva is speaking
        if self._check_interrupt(audio):
            result["interrupt"] = True
            self.state = ConversationState.INTERRUPTED
            self.interrupt_count += 1

            if self.on_interrupt:
                await self.on_interrupt(self.session_id)

            return result

        # Detect speech
        is_speech = self._detect_speech(audio)
        result["speech_detected"] = is_speech

        now = time.time()

        if is_speech:
            # User is speaking
            if self.state != ConversationState.USER_SPEAKING:
                self.state = ConversationState.USER_SPEAKING
                self.vad_state.speech_start = now
                self.vad_state.silence_duration = 0

            self.vad_state.is_speech = True
            self.user_audio_buffer.add(audio_bytes)

        else:
            # Silence
            if self.state == ConversationState.USER_SPEAKING:
                # User was speaking, now silent
                self.vad_state.silence_duration = now - (self.vad_state.speech_start or now)

                # Check if user is done speaking (enough silence)
                if self.vad_state.silence_duration > 0.7:  # 700ms of silence
                    self.state = ConversationState.PROCESSING
                    self.vad_state.speech_end = now
                    self.last_user_speech_end = now
                    self.total_user_speech_time += self.user_audio_buffer.duration()

                    result["should_respond"] = True
                    result["transcription_ready"] = True

                    if self.on_user_speech:
                        audio_data = self.user_audio_buffer.get_audio()
                        await self.on_user_speech(self.session_id, audio_data)

                    self.user_audio_buffer.clear()

            self.vad_state.is_speech = False

        return result

    def start_eva_speech(self, current_time: Optional[float] = None):
        """Mark that Eva has started speaking.

        Args:
            current_time: Optional timestamp to avoid repeated time.time() calls
        """
        self.state = ConversationState.EVA_SPEAKING
        self.eva_speech_start = current_time if current_time is not None else time.time()

    def end_eva_speech(self, current_time: Optional[float] = None):
        """Mark that Eva has finished speaking.

        Args:
            current_time: Optional timestamp to avoid repeated time.time() calls
        """
        now = current_time if current_time is not None else time.time()
        self.last_eva_speech_end = now
        self.total_eva_speech_time += now - self.eva_speech_start
        self.state = ConversationState.IDLE
        self._interrupt_start = None

    async def queue_eva_audio(self, audio_bytes: bytes):
        """Queue audio for Eva to speak"""
        await self.eva_audio_queue.put(audio_bytes)

    async def get_eva_audio(self) -> Optional[bytes]:
        """Get next audio chunk for Eva to speak"""
        try:
            return await asyncio.wait_for(self.eva_audio_queue.get(), timeout=0.1)
        except asyncio.TimeoutError:
            return None

    def get_turn_state(self, current_time: Optional[float] = None) -> Dict[str, Any]:
        """Get current turn-taking state.

        Args:
            current_time: Optional timestamp to avoid repeated time.time() calls
        """
        now = current_time if current_time is not None else time.time()
        return {
            "state": self.state.value,
            "user_speaking": self.state == ConversationState.USER_SPEAKING,
            "eva_speaking": self.state == ConversationState.EVA_SPEAKING,
            "silence_duration": now - max(self.last_user_speech_end, self.last_eva_speech_end),
            "user_speech_duration": self.user_audio_buffer.duration(),
            "energy_level": self.vad_state.energy_level,
            "can_respond": self.state in _CAN_RESPOND_STATES,
            "interrupted": self.state == ConversationState.INTERRUPTED
        }

    def get_stats(self) -> Dict[str, Any]:
        """Get session statistics"""
        total_time = self.total_user_speech_time + self.total_eva_speech_time
        return {
            "session_id": self.session_id,
            "total_user_speech": self.total_user_speech_time,
            "total_eva_speech": self.total_eva_speech_time,
            "user_ratio": self.total_user_speech_time / total_time if total_time > 0 else 0.5,
            "interrupt_count": self.interrupt_count,
            "current_state": self.state.value
        }


class RealtimeManager:
    """Manages multiple realtime sessions"""

    def __init__(self):
        self.sessions: Dict[str, RealtimeSession] = {}
        print("✅ Realtime Manager initialized")

    def create_session(
        self,
        session_id: str,
        on_user_speech: Optional[Callable] = None,
        on_interrupt: Optional[Callable] = None
    ) -> RealtimeSession:
        """Create a new realtime session"""
        if session_id in self.sessions:
            return self.sessions[session_id]

        session = RealtimeSession(
            session_id=session_id,
            on_user_speech=on_user_speech,
            on_interrupt=on_interrupt
        )
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id: str) -> Optional[RealtimeSession]:
        """Get existing session"""
        return self.sessions.get(session_id)

    def close_session(self, session_id: str):
        """Close and remove a session"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            print(f"🔒 Session closed: {session_id}")


# Global manager
realtime_manager: Optional[RealtimeManager] = None


def init_realtime() -> RealtimeManager:
    """Initialize realtime manager"""
    global realtime_manager
    realtime_manager = RealtimeManager()
    return realtime_manager


def get_realtime_manager() -> RealtimeManager:
    """Get realtime manager"""
    global realtime_manager
    if realtime_manager is None:
        init_realtime()
    return realtime_manager


async def process_realtime_audio(session_id: str, audio_bytes: bytes) -> Dict[str, Any]:
    """Process audio for a session"""
    manager = get_realtime_manager()
    session = manager.get_session(session_id)

    if session is None:
        session = manager.create_session(session_id)

    return await session.process_audio_chunk(audio_bytes)
