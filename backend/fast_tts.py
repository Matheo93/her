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
    """Initialize MMS-TTS French model on GPU"""
    global _tts_model, _tts_tokenizer, _device, _sample_rate

    if _tts_model is not None:
        return True

    try:
        from transformers import VitsModel, AutoTokenizer

        _device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"🚀 Loading MMS-TTS French on {_device.upper()}...")

        # Load model
        _tts_model = VitsModel.from_pretrained("facebook/mms-tts-fra").to(_device)
        _tts_tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-fra")
        _tts_model.eval()

        _sample_rate = _tts_model.config.sampling_rate

        # Warmup
        warmup_text = "Bonjour"
        inputs = _tts_tokenizer(warmup_text, return_tensors="pt").to(_device)
        with torch.no_grad():
            _ = _tts_model(**inputs).waveform

        print(f"✅ MMS-TTS ready (sample rate: {_sample_rate}Hz)")
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
    Generate speech and convert to MP3 for web compatibility

    Args:
        text: Text to synthesize (French)
        speed: Speech speed multiplier

    Returns:
        MP3 audio bytes or None on error
    """
    import subprocess
    import tempfile
    import os

    wav_data = fast_tts(text, speed)
    if wav_data is None:
        return None

    try:
        # Write WAV to temp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_file:
            wav_file.write(wav_data)
            wav_path = wav_file.name

        # Convert to MP3 using ffmpeg
        mp3_path = wav_path.replace(".wav", ".mp3")
        subprocess.run([
            "ffmpeg", "-i", wav_path,
            "-codec:a", "libmp3lame", "-b:a", "128k",
            "-y", mp3_path
        ], capture_output=True, check=True)

        # Read MP3
        with open(mp3_path, "rb") as f:
            mp3_data = f.read()

        # Cleanup
        os.unlink(wav_path)
        os.unlink(mp3_path)

        return mp3_data

    except Exception as e:
        print(f"MP3 conversion error: {e}")
        return wav_data  # Return WAV as fallback


async def async_fast_tts(text: str, speed: float = 1.0) -> Optional[bytes]:
    """Async wrapper for fast_tts"""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fast_tts, text, speed)


async def async_fast_tts_mp3(text: str, speed: float = 1.0) -> Optional[bytes]:
    """Async wrapper for fast_tts_mp3"""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fast_tts_mp3, text, speed)


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
