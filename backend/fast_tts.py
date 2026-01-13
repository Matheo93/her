"""
Fast TTS Module - MMS-TTS on GPU
Ultra-low latency: ~100ms for French TTS
"""

import torch
import numpy as np
import io
import time
from typing import Optional
import scipy.io.wavfile as wav

# Global model instances
_tts_model = None
_tts_tokenizer = None
_device = None
_sample_rate = 16000

def init_fast_tts():
    """Initialize MMS-TTS French model on GPU with maximum optimizations"""
    global _tts_model, _tts_tokenizer, _device, _sample_rate

    if _tts_model is not None:
        return True

    try:
        from transformers import VitsModel, AutoTokenizer

        _device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🚀 Loading MMS-TTS French on {_device.upper()} (OPTIMIZED)...")

        # Load model with fp16 for faster inference
        _tts_model = VitsModel.from_pretrained(
            "facebook/mms-tts-fra",
            torch_dtype=torch.float16 if _device == "cuda" else torch.float32
        ).to(_device)
        _tts_tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-fra")
        _tts_model.eval()

        # Try to compile model for faster inference (PyTorch 2.0+)
        try:
            _tts_model = torch.compile(_tts_model, mode="reduce-overhead")
            print("   torch.compile enabled")
        except Exception:
            pass  # torch.compile not available

        _sample_rate = _tts_model.config.sampling_rate

        # Warmup (multiple times for torch.compile)
        for _ in range(3):
            inputs = _tts_tokenizer("Bonjour", return_tensors="pt").to(_device)
            if _device == "cuda":
                inputs = {k: v.to(_device) for k, v in inputs.items()}
            with torch.no_grad(), torch.cuda.amp.autocast(enabled=(_device == "cuda")):
                _ = _tts_model(**inputs).waveform

        print(f"✅ MMS-TTS ready (sample rate: {_sample_rate}Hz, fp16={_device=='cuda'})")
        return True

    except Exception as e:
        print(f"❌ MMS-TTS init failed: {e}")
        return False


def fast_tts(text: str, speed: float = 1.0) -> Optional[bytes]:
    """
    Generate speech from text using MMS-TTS

    Args:
        text: Text to synthesize (French)
        speed: Speech speed multiplier (1.0 = normal)

    Returns:
        WAV audio bytes or None on error
    """
    global _tts_model, _tts_tokenizer, _device, _sample_rate

    if _tts_model is None:
        if not init_fast_tts():
            return None

    try:
        # Tokenize
        inputs = _tts_tokenizer(text, return_tensors="pt").to(_device)

        # Generate
        with torch.no_grad():
            output = _tts_model(**inputs).waveform

        # Convert to numpy
        audio = output.squeeze().cpu().numpy()

        # Apply speed adjustment if needed
        if speed != 1.0:
            # Resample for speed change
            from scipy.signal import resample
            new_length = int(len(audio) / speed)
            audio = resample(audio, new_length)

        # Normalize audio
        audio = audio / np.max(np.abs(audio)) * 0.95
        audio = (audio * 32767).astype(np.int16)

        # Convert to WAV bytes
        buffer = io.BytesIO()
        wav.write(buffer, _sample_rate, audio)
        return buffer.getvalue()

    except Exception as e:
        print(f"TTS error: {e}")
        return None


def fast_tts_mp3(text: str, speed: float = 1.0) -> Optional[bytes]:
    """
    Generate speech and convert to MP3 for web compatibility (optimized)

    Args:
        text: Text to synthesize (French)
        speed: Speech speed multiplier

    Returns:
        MP3 audio bytes or None on error
    """
    global _tts_model, _tts_tokenizer, _device, _sample_rate
    import subprocess

    if _tts_model is None:
        if not init_fast_tts():
            return None

    try:
        # Generate audio directly (skip WAV intermediate)
        inputs = _tts_tokenizer(text, return_tensors="pt").to(_device)

        with torch.no_grad():
            output = _tts_model(**inputs).waveform

        # Convert to numpy
        audio = output.squeeze().cpu().numpy()

        # Normalize
        audio = audio / np.max(np.abs(audio)) * 0.95
        audio_int16 = (audio * 32767).astype(np.int16)

        # Pipe directly to ffmpeg for MP3 encoding (no temp files!)
        process = subprocess.Popen(
            [
                "ffmpeg", "-f", "s16le", "-ar", str(_sample_rate), "-ac", "1",
                "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "64k",
                "-f", "mp3", "pipe:1"
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        mp3_data, _ = process.communicate(input=audio_int16.tobytes())

        return mp3_data

    except Exception as e:
        print(f"MP3 TTS error: {e}")
        return None


async def async_fast_tts(text: str, speed: float = 1.0) -> Optional[bytes]:
    """Async wrapper for fast_tts (WAV format)"""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fast_tts, text, speed)


async def async_fast_tts_mp3(text: str, speed: float = 1.0) -> Optional[bytes]:
    """Async wrapper for fast_tts_mp3 (MP3 format - smaller, faster transfer)"""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fast_tts_mp3, text, speed)


# Default async function uses MP3 for web compatibility
async_tts = async_fast_tts_mp3


# Benchmark function
def benchmark():
    """Run TTS benchmark"""
    init_fast_tts()

    phrases = [
        "Salut!",
        "Comment tu vas?",
        "C'est super intéressant ce que tu me racontes!",
        "Oh la la, j'adore discuter avec toi!",
    ]

    print("\n=== MMS-TTS Benchmark ===\n")

    for phrase in phrases:
        # Warmup
        _ = fast_tts(phrase)

        # Timed
        if _device == "cuda":
            torch.cuda.synchronize()
        start = time.time()
        audio = fast_tts(phrase)
        if _device == "cuda":
            torch.cuda.synchronize()
        elapsed = (time.time() - start) * 1000

        print(f"'{phrase[:30]}...' -> {elapsed:.0f}ms ({len(audio)} bytes)")

    print("\n✅ Benchmark complete!")


if __name__ == "__main__":
    benchmark()
