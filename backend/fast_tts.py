"""
Fast TTS Module - VITS/MMS-TTS on GPU
Ultra-low latency: ~30ms on RTX 4090
"""

import torch
import numpy as np
import io
import time
from typing import Optional
import scipy.io.wavfile as wav

# Global model instances
_model = None
_tokenizer = None
_device = None
_sample_rate = 16000
_initialized = False


def init_fast_tts() -> bool:
    """Initialize VITS/MMS-TTS French on GPU"""
    global _model, _tokenizer, _device, _sample_rate, _initialized

    if _initialized:
        return True

    try:
        from transformers import VitsModel, AutoTokenizer

        _device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🚀 Loading VITS-MMS French on {_device.upper()}...")

        # Load model
        _model = VitsModel.from_pretrained("facebook/mms-tts-fra").to(_device)
        _tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-fra")
        _model.eval()

        _sample_rate = _model.config.sampling_rate

        # Warmup (critical for GPU - first runs are slow)
        for _ in range(5):
            inputs = _tokenizer("Test", return_tensors="pt").to(_device)
            with torch.inference_mode():
                _ = _model(**inputs).waveform

        if _device == "cuda":
            torch.cuda.synchronize()

        _initialized = True
        print(f"✅ VITS-MMS ready ({_device.upper()}, {_sample_rate}Hz, ~30ms)")
        return True

    except Exception as e:
        print(f"❌ VITS-MMS init failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def fast_tts(text: str) -> Optional[bytes]:
    """Generate speech using VITS GPU - returns WAV bytes"""
    global _model, _tokenizer, _device, _sample_rate, _initialized

    if not _initialized and not init_fast_tts():
        return None

    try:
        inputs = _tokenizer(text, return_tensors="pt").to(_device)

        with torch.inference_mode():
            output = _model(**inputs).waveform

        # Convert to numpy
        audio = output.squeeze().cpu().numpy()

        # Normalize
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val * 0.95
        audio_int16 = (audio * 32767).astype(np.int16)

        # To WAV bytes
        buffer = io.BytesIO()
        wav.write(buffer, _sample_rate, audio_int16)
        return buffer.getvalue()

    except Exception as e:
        print(f"VITS error: {e}")
        return None


def fast_tts_mp3(text: str) -> Optional[bytes]:
    """Generate MP3 using VITS GPU"""
    global _model, _tokenizer, _device, _sample_rate, _initialized

    if not _initialized and not init_fast_tts():
        return None

    try:
        inputs = _tokenizer(text, return_tensors="pt").to(_device)

        with torch.inference_mode():
            output = _model(**inputs).waveform

        audio = output.squeeze().cpu().numpy()
        audio = audio / np.max(np.abs(audio)) * 0.95
        audio_int16 = (audio * 32767).astype(np.int16)

        # Use lameenc for fast MP3 encoding
        try:
            import lameenc
            encoder = lameenc.Encoder()
            encoder.set_bit_rate(64)
            encoder.set_in_sample_rate(_sample_rate)
            encoder.set_channels(1)
            encoder.set_quality(7)
            mp3_data = encoder.encode(audio_int16.tobytes())
            mp3_data += encoder.flush()
            return bytes(mp3_data)
        except ImportError:
            # Fallback: return WAV
            buffer = io.BytesIO()
            wav.write(buffer, _sample_rate, audio_int16)
            return buffer.getvalue()

    except Exception as e:
        print(f"VITS MP3 error: {e}")
        return None


async def async_fast_tts(text: str) -> Optional[bytes]:
    """Async wrapper for fast_tts"""
    import asyncio
    return await asyncio.get_event_loop().run_in_executor(None, fast_tts, text)


async def async_fast_tts_mp3(text: str) -> Optional[bytes]:
    """Async wrapper for fast_tts_mp3"""
    import asyncio
    return await asyncio.get_event_loop().run_in_executor(None, fast_tts_mp3, text)


if __name__ == "__main__":
    # Benchmark
    init_fast_tts()

    phrases = ["Salut!", "Comment tu vas?", "C'est super!"]

    print("\n=== VITS-MMS Benchmark ===")
    for phrase in phrases:
        # Warmup
        _ = fast_tts(phrase)
        if _device == "cuda":
            torch.cuda.synchronize()

        # Timed
        start = time.time()
        audio = fast_tts(phrase)
        if _device == "cuda":
            torch.cuda.synchronize()
        elapsed = (time.time() - start) * 1000

        if audio:
            print(f"'{phrase}' -> {elapsed:.0f}ms ({len(audio)} bytes)")
