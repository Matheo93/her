"""
Ultra-Fast TTS Module - GPU Piper VITS Backend
Target latency: ~30-60ms

Uses gpu_tts (ONNX Runtime) as primary backend.
Falls back to sherpa_onnx if available.
"""

import time
from typing import Optional

# Global state
_backend = None  # "gpu" | "sherpa" | None

def _init_gpu_backend() -> bool:
    """Try to initialize GPU TTS backend"""
    try:
        from gpu_tts import init_gpu_tts
        return init_gpu_tts()
    except Exception as e:
        print(f"GPU backend unavailable: {e}")
        return False


def _init_sherpa_backend() -> bool:
    """Try to initialize Sherpa-ONNX backend"""
    global _sherpa_tts, _sherpa_sample_rate

    try:
        import sherpa_onnx
        import numpy as np

        MODEL_PATH = "/workspace/eva-gpu/models/tts/vits-piper-fr_FR-siwis-low"

        tts_config = sherpa_onnx.OfflineTtsConfig(
            model=sherpa_onnx.OfflineTtsModelConfig(
                vits=sherpa_onnx.OfflineTtsVitsModelConfig(
                    model=f"{MODEL_PATH}/fr_FR-siwis-low.onnx",
                    tokens=f"{MODEL_PATH}/tokens.txt",
                    data_dir=f"{MODEL_PATH}/espeak-ng-data",
                ),
                provider="cpu",
                num_threads=4,
            ),
            max_num_sentences=1,
        )

        _sherpa_tts = sherpa_onnx.OfflineTts(tts_config)
        _sherpa_sample_rate = _sherpa_tts.sample_rate

        # Warmup
        for _ in range(3):
            _ = _sherpa_tts.generate("Bonjour")

        return True
    except Exception as e:
        print(f"Sherpa backend unavailable: {e}")
        return False


def init_ultra_fast_tts() -> bool:
    """Initialize the fastest available TTS backend"""
    global _backend

    if _backend is not None:
        return True

    print("🚀 Loading Ultra-Fast TTS...")

    # Try GPU backend first (ONNX Runtime with Piper model)
    if _init_gpu_backend():
        _backend = "gpu"
        print("✅ Ultra-Fast TTS ready (GPU backend, ~50-70ms)")
        return True

    # Fallback to Sherpa-ONNX
    if _init_sherpa_backend():
        _backend = "sherpa"
        print("✅ Ultra-Fast TTS ready (Sherpa backend, ~30-60ms)")
        return True

    print("❌ No TTS backend available")
    return False


def ultra_fast_tts(text: str, speed: float = 1.0) -> Optional[bytes]:
    """
    Generate speech ultra-fast using best available backend.

    Args:
        text: Text to synthesize (French)
        speed: Speech speed multiplier (1.0 = normal)

    Returns:
        WAV audio bytes or None on error
    """
    global _backend

    if _backend is None:
        if not init_ultra_fast_tts():
            return None

    try:
        if _backend == "gpu":
            from gpu_tts import gpu_tts
            return gpu_tts(text)

        elif _backend == "sherpa":
            import numpy as np
            import io
            import scipy.io.wavfile as wav

            audio = _sherpa_tts.generate(text, speed=speed)

            if audio.samples is None or len(audio.samples) == 0:
                return None

            # Convert to int16 WAV
            samples = np.array(audio.samples)
            max_val = np.max(np.abs(samples))
            if max_val > 0:
                samples = samples / max_val * 0.95
            audio_int16 = (samples * 32767).astype(np.int16)

            buffer = io.BytesIO()
            wav.write(buffer, _sherpa_sample_rate, audio_int16)
            return buffer.getvalue()

        return None

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

    print(f"\n=== Ultra-Fast TTS Benchmark (backend: {_backend}) ===\n")

    for phrase in phrases:
        times = []
        for _ in range(10):
            start = time.time()
            audio = ultra_fast_tts(phrase)
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)

        avg = sum(times) / len(times)
        min_t = min(times)
        size = len(audio) if audio else 0
        print(f"'{phrase[:30]}' -> AVG {avg:.0f}ms | MIN {min_t:.0f}ms ({size} bytes)")

    print("\n✅ Benchmark complete!")


if __name__ == "__main__":
    benchmark()
