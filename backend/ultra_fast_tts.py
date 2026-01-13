"""
Ultra-Fast TTS Module - Sherpa-ONNX Piper VITS
Target latency: ~30-60ms (3-5x faster than MMS-TTS)
"""

import sherpa_onnx
import numpy as np
import io
import time
from typing import Optional
import scipy.io.wavfile as wav

# Global instances
_tts = None
_sample_rate = 16000

MODEL_PATH = "/workspace/eva-gpu/models/tts/vits-piper-fr_FR-siwis-low"


def init_ultra_fast_tts() -> bool:
    """Initialize Sherpa-ONNX Piper VITS for ultra-fast French TTS"""
    global _tts, _sample_rate

    if _tts is not None:
        return True

    try:
        print("🚀 Loading Ultra-Fast TTS (Sherpa-ONNX Piper VITS)...")

        tts_config = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                    model=f"{MODEL_PATH}/fr_FR-siwis-low.onnx",
                    tokens=f"{MODEL_PATH}/tokens.txt",
                    data_dir=f"{MODEL_PATH}/espeak-ng-data",
                ),
                provider="cpu",  # Fast even on CPU
                num_threads=4,
            ),
            max_num_sentences=1,
        )

        _tts = sherpa_onnx.OfflineTts(tts_config)
        _sample_rate = _tts.sample_rate

        # Warmup
        for _ in range(5):
            _ = _tts.generate("Bonjour")

        print(f"✅ Ultra-Fast TTS ready (sample rate: {_sample_rate}Hz, ~30-60ms latency)")
        return True

    except Exception as e:
        print(f"❌ Ultra-Fast TTS init failed: {e}")
        return False


def ultra_fast_tts(text: str, speed: float = 1.0) -> Optional[bytes]:
    """
    Generate speech ultra-fast using Sherpa-ONNX Piper VITS

    Args:
        text: Text to synthesize (French)
        speed: Speech speed multiplier (1.0 = normal)

    Returns:
        WAV audio bytes or None on error
    """
    global _tts, _sample_rate

    if _tts is None:
        if not init_ultra_fast_tts():
            return None

    try:
        # Generate audio
        audio = _tts.generate(text, speed=speed)

        if audio.samples is None or len(audio.samples) == 0:
            return None

        # Convert to int16
        samples = np.array(audio.samples)
        max_val = np.max(np.abs(samples))
        if max_val > 0:
            samples = samples / max_val * 0.95
        audio_int16 = (samples * 32767).astype(np.int16)

        # Convert to WAV bytes
        buffer = io.BytesIO()
        wav.write(buffer, _sample_rate, audio_int16)
        return buffer.getvalue()

    except Exception as e:
        print(f"Ultra-Fast TTS error: {e}")
        return None


async def async_ultra_fast_tts(text: str, speed: float = 1.0) -> Optional[bytes]:
    """Async wrapper for ultra_fast_tts"""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, ultra_fast_tts, text, speed)


def benchmark():
    """Run benchmark"""
    init_ultra_fast_tts()

    phrases = [
        "Salut!",
        "Comment tu vas?",
        "C'est super intéressant!",
        "Oh la la, j'adore discuter avec toi!",
    ]

    print("\n=== Ultra-Fast TTS Benchmark ===\n")

    for phrase in phrases:
        times = []
        for _ in range(10):
            start = time.time()
            audio = ultra_fast_tts(phrase)
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)

        avg = sum(times) / len(times)
        min_t = min(times)
        print(f"'{phrase[:30]}' -> AVG {avg:.0f}ms | MIN {min_t:.0f}ms ({len(audio)} bytes)")

    print("\n✅ Benchmark complete!")


if __name__ == "__main__":
    benchmark()
