"""
GPU-Accelerated Piper TTS Module
Target latency: ~20-50ms on RTX 4090
Uses ONNX Runtime with CUDA ExecutionProvider
"""

import numpy as np
import io
import time
import json
from typing import Optional
import scipy.io.wavfile as wav
import onnxruntime as ort

# Global instances
_session = None
_config = None
_sample_rate = 22050
_phoneme_id_map = None
_initialized = False

import os

# Use environment variable or default path (graceful fallback if not exists)
MODEL_DIR = os.environ.get("PIPER_TTS_MODEL_DIR", "/home/dev/her/models/tts")
MODEL_PATH = f"{MODEL_DIR}/fr_FR-siwis-medium.onnx"
CONFIG_PATH = f"{MODEL_DIR}/fr_FR-siwis-medium.onnx.json"

# Check if models exist at startup
_models_available = os.path.exists(MODEL_PATH) and os.path.exists(CONFIG_PATH)


def init_gpu_tts() -> bool:
    """Initialize Piper TTS on GPU with CUDA ExecutionProvider"""
    global _session, _config, _sample_rate, _phoneme_id_map, _initialized

    if _initialized:
        return True

    # Check if models exist before trying to load
    if not _models_available:
        print(f"⚠️  GPU TTS models not found at {MODEL_DIR}")
        print("   Using Edge-TTS fallback instead")
        return False

    try:
        print("🚀 Loading GPU TTS (Piper VITS on CUDA)...")

        # Load config
        with open(CONFIG_PATH, 'r') as f:
            _config = json.load(f)

        _sample_rate = _config['audio']['sample_rate']
        _phoneme_id_map = _config['phoneme_id_map']

        # Create ONNX session with CUDA
        providers = ort.get_available_providers()
        print(f"   Available providers: {providers}")

        # Prefer CUDA, fall back to CPU
        if 'CUDAExecutionProvider' in providers:
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            _session = ort.InferenceSession(
                MODEL_PATH,
                sess_options=sess_options,
                providers=['CUDAExecutionProvider', 'CPUExecutionProvider']
            )
            actual_provider = _session.get_providers()[0]
            print(f"   Using provider: {actual_provider}")
        else:
            print("   CUDA not available, using CPU")
            _session = ort.InferenceSession(MODEL_PATH, providers=['CPUExecutionProvider'])

        # Warmup runs for JIT compilation
        dummy_ids = np.array([[1, 2, 3, 4, 5]], dtype=np.int64)
        dummy_lengths = np.array([5], dtype=np.int64)
        dummy_scales = np.array([0.667, 1.0, 0.8], dtype=np.float32)

        for _ in range(3):
            _session.run(
                None,
                {
                    'input': dummy_ids,
                    'input_lengths': dummy_lengths,
                    'scales': dummy_scales
                }
            )

        _initialized = True
        print(f"✅ GPU TTS ready (sample rate: {_sample_rate}Hz)")
        return True

    except Exception as e:
        print(f"❌ GPU TTS init failed: {e}")
        import traceback
        traceback.print_exc()
        return False


def text_to_phoneme_ids(text: str) -> list[int]:
    """Convert text to phoneme IDs using espeak-ng"""
    global _phoneme_id_map
    import subprocess

    try:
        # Use espeak-ng for IPA phonemization
        result = subprocess.run(
            ['espeak-ng', '-v', 'fr', '-q', '--ipa', '-s', '175', text],
            capture_output=True,
            text=True,
            timeout=2
        )
        phonemes_str = result.stdout.strip()

        # Convert phonemes to IDs
        ids = [_phoneme_id_map['^'][0]]  # Start token

        for char in phonemes_str:
            if char in _phoneme_id_map:
                ids.extend(_phoneme_id_map[char])
            elif char == ' ':
                ids.extend(_phoneme_id_map.get(' ', [3]))
            # Skip unknown phonemes

        ids.append(_phoneme_id_map['$'][0])  # End token

        return ids

    except Exception as e:
        # Fallback: simple character-based
        ids = [_phoneme_id_map['^'][0]]
        for char in text.lower():
            if char in _phoneme_id_map:
                ids.extend(_phoneme_id_map[char])
        ids.append(_phoneme_id_map['$'][0])
        return ids


def gpu_tts(text: str, speed: float = 1.0) -> Optional[bytes]:
    """
    Generate speech using GPU-accelerated Piper TTS

    Args:
        text: Text to synthesize (French)
        speed: Speech speed multiplier (1.0 = normal)

    Returns:
        WAV audio bytes or None on error
    """
    global _session, _config, _sample_rate

    if not _initialized:
        if not init_gpu_tts():
            return None

    try:
        # Convert text to phoneme IDs
        phoneme_ids = text_to_phoneme_ids(text)

        if len(phoneme_ids) < 3:
            return None

        # Prepare inputs
        input_ids = np.array([phoneme_ids], dtype=np.int64)
        input_lengths = np.array([len(phoneme_ids)], dtype=np.int64)

        # Scales: [noise_scale, length_scale, noise_w]
        inference_config = _config.get('inference', {})
        length_scale = inference_config.get('length_scale', 1.0) / speed
        scales = np.array([
            inference_config.get('noise_scale', 0.667),
            length_scale,
            inference_config.get('noise_w', 0.8)
        ], dtype=np.float32)

        # Run inference
        outputs = _session.run(
            None,
            {
                'input': input_ids,
                'input_lengths': input_lengths,
                'scales': scales
            }
        )

        # Get audio output
        audio = outputs[0].squeeze()

        # Normalize
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val * 0.95
        audio_int16 = (audio * 32767).astype(np.int16)

        # Convert to WAV bytes
        buffer = io.BytesIO()
        wav.write(buffer, _sample_rate, audio_int16)
        return buffer.getvalue()

    except Exception as e:
        print(f"GPU TTS error: {e}")
        import traceback
        traceback.print_exc()
        return None


def gpu_tts_mp3(text: str, speed: float = 1.0) -> Optional[bytes]:
    """Generate speech and convert to MP3 for web compatibility"""
    import subprocess

    wav_data = gpu_tts(text, speed)
    if wav_data is None:
        return None

    try:
        # Convert WAV to MP3 using ffmpeg
        process = subprocess.Popen(
            [
                "ffmpeg", "-f", "wav", "-i", "pipe:0",
                "-codec:a", "libmp3lame", "-b:a", "96k",
                "-f", "mp3", "pipe:1"
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        mp3_data, _ = process.communicate(input=wav_data)
        return mp3_data

    except Exception as e:
        print(f"MP3 conversion error: {e}")
        return wav_data  # Return WAV as fallback


async def async_gpu_tts(text: str, speed: float = 1.0) -> Optional[bytes]:
    """Async wrapper for gpu_tts (WAV format)"""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, gpu_tts, text, speed)


async def async_gpu_tts_mp3(text: str, speed: float = 1.0) -> Optional[bytes]:
    """Async wrapper for gpu_tts_mp3 (MP3 format)"""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, gpu_tts_mp3, text, speed)


def benchmark():
    """Run TTS benchmark"""
    init_gpu_tts()

    phrases = [
        "Salut!",
        "Comment tu vas?",
        "C'est super intéressant ce que tu me racontes!",
        "Oh la la, j'adore discuter avec toi! Tu es vraiment quelqu'un de special.",
    ]

    print("\n=== GPU TTS Benchmark ===\n")

    for phrase in phrases:
        # Warmup
        _ = gpu_tts(phrase)

        # Timed runs
        times = []
        for _ in range(10):
            start = time.time()
            audio = gpu_tts(phrase)
            elapsed = (time.time() - start) * 1000
            times.append(elapsed)

        avg = sum(times) / len(times)
        min_t = min(times)
        max_t = max(times)

        if audio:
            print(f"'{phrase[:40]}...' -> AVG {avg:.0f}ms | MIN {min_t:.0f}ms | MAX {max_t:.0f}ms ({len(audio)} bytes)")
        else:
            print(f"'{phrase[:40]}...' -> FAILED")

    print("\n✅ Benchmark complete!")


if __name__ == "__main__":
    benchmark()
