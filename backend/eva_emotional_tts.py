"""
EVA Emotional TTS System
Wrapper for emotional text-to-speech synthesis
Supports: CosyVoice2, Fish Speech, or enhanced Sherpa-ONNX with prosody control
"""

import os
import io
import time
import asyncio
import numpy as np
from typing import Dict, Any, Optional, Tuple, AsyncGenerator
from dataclasses import dataclass
from enum import Enum
import wave
import struct

# Try CosyVoice first
COSYVOICE_AVAILABLE = False
try:
    from cosyvoice.api import CosyVoiceTTS
    COSYVOICE_AVAILABLE = True
    print("✅ CosyVoice available")
except ImportError as e:
    print(f"⚠️ CosyVoice not available: {e}")

# Try torchaudio for audio processing
try:
    import torch
    import torchaudio
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

# Fallback to current ultra_fast_tts
try:
    from ultra_fast_tts import async_ultra_fast_tts, ultra_fast_tts
    ULTRA_TTS_AVAILABLE = True
except ImportError:
    ULTRA_TTS_AVAILABLE = False


class EmotionStyle(Enum):
    """Emotion styles for TTS"""
    NEUTRAL = "neutral"
    JOY = "joy"
    SADNESS = "sadness"
    ANGER = "anger"
    FEAR = "fear"
    SURPRISE = "surprise"
    TENDERNESS = "tenderness"
    EXCITEMENT = "excitement"
    PLAYFUL = "playful"
    INTIMATE = "intimate"


@dataclass
class EmotionalVoiceParams:
    """Parameters for emotional voice synthesis"""
    emotion: EmotionStyle
    intensity: float  # 0-1
    pitch_shift: float  # -1 to 1 (semitones relative)
    speed_factor: float  # 0.5 to 2.0
    energy_factor: float  # 0.5 to 2.0
    breathiness: float  # 0-1


# Emotion to voice parameter mapping
EMOTION_PARAMS = {
    EmotionStyle.NEUTRAL: EmotionalVoiceParams(
        EmotionStyle.NEUTRAL, 0.5, 0, 1.0, 1.0, 0.2
    ),
    EmotionStyle.JOY: EmotionalVoiceParams(
        EmotionStyle.JOY, 0.8, 0.3, 1.15, 1.2, 0.1
    ),
    EmotionStyle.SADNESS: EmotionalVoiceParams(
        EmotionStyle.SADNESS, 0.7, -0.3, 0.85, 0.7, 0.4
    ),
    EmotionStyle.ANGER: EmotionalVoiceParams(
        EmotionStyle.ANGER, 0.9, 0.2, 1.2, 1.4, 0.0
    ),
    EmotionStyle.FEAR: EmotionalVoiceParams(
        EmotionStyle.FEAR, 0.8, 0.4, 1.3, 0.9, 0.3
    ),
    EmotionStyle.SURPRISE: EmotionalVoiceParams(
        EmotionStyle.SURPRISE, 0.9, 0.5, 1.1, 1.3, 0.1
    ),
    EmotionStyle.TENDERNESS: EmotionalVoiceParams(
        EmotionStyle.TENDERNESS, 0.6, -0.1, 0.9, 0.8, 0.5
    ),
    EmotionStyle.EXCITEMENT: EmotionalVoiceParams(
        EmotionStyle.EXCITEMENT, 0.95, 0.4, 1.25, 1.3, 0.0
    ),
    EmotionStyle.PLAYFUL: EmotionalVoiceParams(
        EmotionStyle.PLAYFUL, 0.7, 0.2, 1.1, 1.1, 0.15
    ),
    EmotionStyle.INTIMATE: EmotionalVoiceParams(
        EmotionStyle.INTIMATE, 0.5, -0.2, 0.85, 0.7, 0.6
    ),
}


class EvaEmotionalTTS:
    """
    Emotional TTS system for Eva

    Prioritizes:
    1. CosyVoice2 (best emotional quality, ~150ms)
    2. Fish Speech (emotion markers)
    3. Enhanced Sherpa-ONNX with prosody control
    """

    # Pre-computed emotion prompts (class-level for O(1) lookup)
    _EMOTION_PROMPTS = {
        EmotionStyle.JOY: "Speak with happiness and warmth, slight smile in voice",
        EmotionStyle.SADNESS: "Speak softly with a hint of melancholy, slower pace",
        EmotionStyle.ANGER: "Speak with intensity and force, faster pace",
        EmotionStyle.FEAR: "Speak with trembling uncertainty, higher pitch",
        EmotionStyle.SURPRISE: "Speak with wonder and amazement, varied intonation",
        EmotionStyle.TENDERNESS: "Speak gently and lovingly, soft and caring",
        EmotionStyle.EXCITEMENT: "Speak with enthusiasm and energy, animated",
        EmotionStyle.PLAYFUL: "Speak playfully with teasing tone, light and fun",
        EmotionStyle.INTIMATE: "Speak softly and close, as if sharing a secret",
        EmotionStyle.NEUTRAL: "Speak naturally and conversationally",
    }

    # Pre-computed intensity prompts for all 30 combinations (10 emotions × 3 levels)
    # Eliminates string concatenation at runtime for O(1) lookup
    _INTENSITY_PROMPTS: Dict[EmotionStyle, Dict[str, str]] = {}

    @classmethod
    def _compute_intensity_prompts(cls) -> None:
        """Pre-compute all intensity prompt variations once at class level.

        Creates 30 pre-computed strings (10 emotions × 3 intensity levels)
        to eliminate string concatenation at runtime.
        """
        if cls._INTENSITY_PROMPTS:
            return  # Already computed

        for emotion in EmotionStyle:
            base_prompt = cls._EMOTION_PROMPTS.get(emotion, cls._EMOTION_PROMPTS[EmotionStyle.NEUTRAL])
            cls._INTENSITY_PROMPTS[emotion] = {
                "high": base_prompt + " with strong emotional expression",
                "normal": base_prompt,
                "low": base_prompt + " with subtle emotional undertones",
            }

    def __init__(self, model_cache_dir: str = "./tts_models"):
        # Pre-compute intensity prompts once at class level
        self._compute_intensity_prompts()
        self.model_cache_dir = model_cache_dir
        self.cosyvoice = None
        self.sample_rate = 22050  # CosyVoice default
        self.current_backend = "none"

        # Try to initialize CosyVoice
        if COSYVOICE_AVAILABLE:
            try:
                print("🔄 Loading CosyVoice2 (this may take a minute)...")
                self.cosyvoice = CosyVoiceTTS(
                    model_cache_dir=model_cache_dir,
                    model_type="instruct"  # Supports emotion instructions
                )
                self.current_backend = "cosyvoice"
                self.sample_rate = 22050
                print("✅ CosyVoice2 emotional TTS ready")
            except Exception as e:
                print(f"⚠️ CosyVoice init failed: {e}")
                self.cosyvoice = None

        # Fallback to Sherpa-ONNX
        if self.cosyvoice is None and ULTRA_TTS_AVAILABLE:
            self.current_backend = "sherpa"
            self.sample_rate = 16000
            print("✅ Using Sherpa-ONNX TTS with prosody enhancement")

        if self.current_backend == "none":
            print("⚠️ No TTS backend available!")

    def _get_emotion_prompt(self, emotion: EmotionStyle, intensity: float) -> str:
        """Generate emotion instruction for CosyVoice.

        Optimized: Uses pre-computed class-level prompts for O(1) dict lookup.
        Eliminates string concatenation at runtime.
        """
        prompts = self._INTENSITY_PROMPTS.get(emotion, self._INTENSITY_PROMPTS[EmotionStyle.NEUTRAL])

        if intensity > 0.7:
            return prompts["high"]
        elif intensity < 0.3:
            return prompts["low"]

        return prompts["normal"]

    def _apply_prosody_effects(
        self,
        audio: np.ndarray,
        params: EmotionalVoiceParams
    ) -> np.ndarray:
        """Apply prosody modifications to audio (for non-emotional backends)"""
        if not TORCH_AVAILABLE:
            return audio

        try:
            # Convert to tensor
            if audio.dtype != np.float32:
                audio = audio.astype(np.float32)

            waveform = torch.from_numpy(audio).unsqueeze(0)

            # Speed/tempo change
            if params.speed_factor != 1.0:
                effects = [["tempo", str(params.speed_factor)]]
                waveform, _ = torchaudio.sox_effects.apply_effects_tensor(
                    waveform, self.sample_rate, effects
                )

            # Pitch shift (using effects)
            if params.pitch_shift != 0:
                semitones = params.pitch_shift * 2  # Scale to semitones
                effects = [["pitch", str(int(semitones * 100))]]
                try:
                    waveform, _ = torchaudio.sox_effects.apply_effects_tensor(
                        waveform, self.sample_rate, effects
                    )
                except Exception:
                    pass  # Pitch shift may not be available

            # Volume/energy adjustment
            if params.energy_factor != 1.0:
                waveform = waveform * params.energy_factor

            # Normalize
            max_val = waveform.abs().max()
            if max_val > 0:
                waveform = waveform / max_val * 0.95

            return waveform.squeeze().numpy()

        except Exception as e:
            print(f"⚠️ Prosody effect error: {e}")
            return audio

    async def synthesize(
        self,
        text: str,
        emotion: str = "neutral",
        intensity: float = 0.5
    ) -> Optional[bytes]:
        """
        Synthesize speech with emotion

        Args:
            text: Text to synthesize
            emotion: Emotion name (joy, sadness, etc.)
            intensity: Emotion intensity 0-1

        Returns:
            WAV bytes or None
        """
        start_time = time.time()

        # Get emotion style
        try:
            emotion_style = EmotionStyle(emotion.lower())
        except ValueError:
            emotion_style = EmotionStyle.NEUTRAL

        params = EMOTION_PARAMS.get(emotion_style, EMOTION_PARAMS[EmotionStyle.NEUTRAL])
        params.intensity = intensity

        audio_data = None

        # Try CosyVoice first
        if self.cosyvoice is not None:
            try:
                emotion_prompt = self._get_emotion_prompt(emotion_style, intensity)

                # Generate with emotion instruction
                for audio_chunk in self.cosyvoice.tts_instruct(
                    text,
                    spk_id="中文女",  # Chinese female voice (works for French too)
                    prompt=emotion_prompt,
                    return_format="wav",
                    stream=False
                ):
                    audio_data = audio_chunk.numpy() if hasattr(audio_chunk, 'numpy') else audio_chunk

                latency = (time.time() - start_time) * 1000
                print(f"🎤 CosyVoice TTS: {latency:.0f}ms ({emotion})")

            except Exception as e:
                print(f"⚠️ CosyVoice synthesis error: {e}")
                audio_data = None

        # Fallback to Sherpa-ONNX
        if audio_data is None and ULTRA_TTS_AVAILABLE:
            try:
                wav_bytes = await async_ultra_fast_tts(text)
                if wav_bytes:
                    # Read WAV bytes
                    with io.BytesIO(wav_bytes) as wav_io:
                        import wave
                        with wave.open(wav_io, 'rb') as wav_file:
                            audio_data = np.frombuffer(
                                wav_file.readframes(wav_file.getnframes()),
                                dtype=np.int16
                            ).astype(np.float32) / 32768.0

                    # Apply prosody effects for emotion
                    audio_data = self._apply_prosody_effects(audio_data, params)

                    latency = (time.time() - start_time) * 1000
                    print(f"🎤 Sherpa TTS + Prosody: {latency:.0f}ms ({emotion})")

            except Exception as e:
                print(f"⚠️ Sherpa synthesis error: {e}")
                return None

        if audio_data is None:
            return None

        # Convert to WAV bytes
        return self._to_wav_bytes(audio_data)

    def _to_wav_bytes(self, audio: np.ndarray) -> bytes:
        """Convert numpy audio to WAV bytes"""
        # Ensure proper format
        if audio.dtype == np.float32 or audio.dtype == np.float64:
            # Convert to int16
            audio = (audio * 32767).astype(np.int16)

        # Create WAV
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(self.sample_rate)
            wav_file.writeframes(audio.tobytes())

        return buffer.getvalue()

    async def synthesize_stream(
        self,
        text: str,
        emotion: str = "neutral",
        intensity: float = 0.5
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream synthesized speech with emotion

        Yields WAV chunks for real-time playback
        """
        # For now, generate full audio then yield
        # Future: implement true streaming
        audio = await self.synthesize(text, emotion, intensity)
        if audio:
            yield audio

    def get_backend_info(self) -> Dict[str, Any]:
        """Get information about current TTS backend"""
        return {
            "backend": self.current_backend,
            "sample_rate": self.sample_rate,
            "cosyvoice_available": self.cosyvoice is not None,
            "sherpa_available": ULTRA_TTS_AVAILABLE,
            "emotional_support": self.cosyvoice is not None or ULTRA_TTS_AVAILABLE
        }


# Global instance
eva_tts: Optional[EvaEmotionalTTS] = None


def init_emotional_tts(model_cache_dir: str = "./tts_models") -> EvaEmotionalTTS:
    """Initialize emotional TTS system"""
    global eva_tts
    eva_tts = EvaEmotionalTTS(model_cache_dir)
    return eva_tts


def get_emotional_tts() -> Optional[EvaEmotionalTTS]:
    """Get emotional TTS instance"""
    return eva_tts


async def emotional_tts(text: str, emotion: str = "neutral", intensity: float = 0.5) -> Optional[bytes]:
    """Synthesize speech with emotion"""
    global eva_tts
    if eva_tts is None:
        init_emotional_tts()
    return await eva_tts.synthesize(text, emotion, intensity)
