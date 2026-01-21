"""
Streaming TTS Module - Ultra-low latency GPU-based TTS with streaming support.

Target: First byte < 30ms by using sentence chunking with MMS-TTS GPU.

Architecture:
- Split text into sentence chunks
- Generate audio for first chunk immediately (TTFA target: <50ms)
- Stream subsequent chunks in parallel
- Yield audio data progressively
"""

import asyncio
import re
import io
import time
from typing import AsyncGenerator, Optional
import numpy as np

# WAV header constants
WAV_HEADER_SIZE = 44


def split_into_chunks(text: str, max_chunk_words: int = 8, first_chunk_words: int = 3) -> list[str]:
    """Split text into small speakable chunks for ultra-fast TTFA.

    Strategy:
    1. First chunk is VERY short (2-3 words) for instant audio feedback
    2. Split by sentence endings (. ! ?)
    3. If sentence is long, split by commas or conjunctions
    4. Keep subsequent chunks ~8 words max
    """
    if not text:
        return []

    # Clean text
    text = text.strip()

    # First split by sentences
    sentence_pattern = r'(?<=[.!?])\s+'
    sentences = re.split(sentence_pattern, text)

    chunks = []
    is_first_chunk = True

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue

        words = sentence.split()

        # First chunk: ultra-short for fast TTFA
        if is_first_chunk and len(words) > first_chunk_words:
            # Take only first few words
            first_part = ' '.join(words[:first_chunk_words])
            # Add punctuation if it makes sense
            if words[first_chunk_words - 1][-1] not in '.!?,;':
                first_part += '...'
            chunks.append(first_part)
            is_first_chunk = False

            # Rest of the sentence
            remaining_words = words[first_chunk_words:]
            if remaining_words:
                remaining = ' '.join(remaining_words)
                # Process remaining as normal chunks
                for i in range(0, len(remaining_words), max_chunk_words):
                    chunk = ' '.join(remaining_words[i:i + max_chunk_words])
                    if chunk:
                        chunks.append(chunk)
        elif len(words) <= max_chunk_words:
            chunks.append(sentence)
            is_first_chunk = False
        else:
            # Split long sentences by commas or conjunctions
            sub_pattern = r'(?<=,)\s+|(?<=;)\s+|\s+(?:et|ou|mais|donc|car)\s+'
            sub_chunks = re.split(sub_pattern, sentence)

            for sub in sub_chunks:
                sub = sub.strip()
                if not sub:
                    continue

                sub_words = sub.split()

                if is_first_chunk and len(sub_words) > first_chunk_words:
                    first_part = ' '.join(sub_words[:first_chunk_words])
                    if sub_words[first_chunk_words - 1][-1] not in '.!?,;':
                        first_part += '...'
                    chunks.append(first_part)
                    is_first_chunk = False
                    remaining_words = sub_words[first_chunk_words:]
                    for i in range(0, len(remaining_words), max_chunk_words):
                        chunk = ' '.join(remaining_words[i:i + max_chunk_words])
                        if chunk:
                            chunks.append(chunk)
                elif len(sub_words) <= max_chunk_words:
                    chunks.append(sub)
                    is_first_chunk = False
                else:
                    # Force split long chunks by word count
                    for i in range(0, len(sub_words), max_chunk_words):
                        chunk = ' '.join(sub_words[i:i + max_chunk_words])
                        if chunk:
                            chunks.append(chunk)
                    is_first_chunk = False

    return chunks


def create_wav_header(sample_rate: int, num_samples: int, channels: int = 1, bits_per_sample: int = 16) -> bytes:
    """Create a WAV header for given audio parameters."""
    byte_rate = sample_rate * channels * bits_per_sample // 8
    block_align = channels * bits_per_sample // 8
    data_size = num_samples * block_align

    header = io.BytesIO()
    # RIFF header
    header.write(b'RIFF')
    header.write((data_size + 36).to_bytes(4, 'little'))  # File size - 8
    header.write(b'WAVE')
    # fmt subchunk
    header.write(b'fmt ')
    header.write((16).to_bytes(4, 'little'))  # Subchunk1 size
    header.write((1).to_bytes(2, 'little'))   # Audio format (PCM)
    header.write(channels.to_bytes(2, 'little'))
    header.write(sample_rate.to_bytes(4, 'little'))
    header.write(byte_rate.to_bytes(4, 'little'))
    header.write(block_align.to_bytes(2, 'little'))
    header.write(bits_per_sample.to_bytes(2, 'little'))
    # data subchunk
    header.write(b'data')
    header.write(data_size.to_bytes(4, 'little'))

    return header.getvalue()


async def stream_tts_gpu(
    text: str,
    speed: float = 1.0
) -> AsyncGenerator[bytes, None]:
    """Stream TTS audio using MMS-TTS GPU with sentence chunking.

    Yields:
        WAV audio bytes chunk by chunk (first chunk includes header).
        Each chunk can be concatenated for a complete WAV file.

    Target metrics:
        - Time to first byte: <50ms
        - Chunk generation: 30-70ms per chunk
    """
    from fast_tts import init_fast_tts, fast_tts, _sample_rate, _initialized

    if not _initialized:
        if not init_fast_tts():
            return

    chunks = split_into_chunks(text)
    if not chunks:
        return

    first_chunk = True
    total_samples_so_far = 0

    for chunk_text in chunks:
        start_time = time.time()

        # Generate audio for this chunk
        wav_data = fast_tts(chunk_text)

        if not wav_data:
            continue

        elapsed = (time.time() - start_time) * 1000

        if first_chunk:
            # First chunk: yield complete WAV data
            yield wav_data
            first_chunk = False
            print(f"🔊 TTS First chunk: {elapsed:.0f}ms - '{chunk_text[:30]}...'")
        else:
            # Subsequent chunks: yield only audio data (skip header)
            # This allows chunked WAV streaming
            yield wav_data[WAV_HEADER_SIZE:]
            print(f"🔊 TTS Chunk: {elapsed:.0f}ms - '{chunk_text[:30]}...'")

        # Small yield to prevent blocking
        await asyncio.sleep(0)


async def stream_tts_gpu_mp3(
    text: str,
    speed: float = 1.0
) -> AsyncGenerator[bytes, None]:
    """Stream TTS as MP3 chunks using MMS-TTS GPU.

    Uses lameenc for fast MP3 encoding.
    """
    from fast_tts import init_fast_tts, _model, _tokenizer, _device, _sample_rate, _initialized
    import torch

    if not _initialized:
        if not init_fast_tts():
            return

    try:
        import lameenc
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(64)
        encoder.set_in_sample_rate(_sample_rate)
        encoder.set_channels(1)
        encoder.set_quality(7)  # Faster encoding
    except ImportError:
        # Fallback to WAV streaming
        async for chunk in stream_tts_gpu(text, speed):
            yield chunk
        return

    chunks = split_into_chunks(text)
    if not chunks:
        return

    for chunk_text in chunks:
        start_time = time.time()

        # Generate audio
        inputs = _tokenizer(chunk_text, return_tensors="pt").to(_device)

        with torch.inference_mode():
            output = _model(**inputs).waveform

        audio = output.squeeze().cpu().numpy()
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            audio = audio / max_val * 0.95
        audio_int16 = (audio * 32767).astype(np.int16)

        # Encode to MP3
        mp3_data = encoder.encode(audio_int16.tobytes())

        elapsed = (time.time() - start_time) * 1000
        print(f"🔊 TTS MP3 Chunk: {elapsed:.0f}ms - '{chunk_text[:30]}...'")

        if mp3_data:
            yield bytes(mp3_data)

        await asyncio.sleep(0)

    # Flush encoder
    final_data = encoder.flush()
    if final_data:
        yield bytes(final_data)


async def fast_first_byte_tts(
    text: str,
    max_first_chunk_words: int = 5
) -> tuple[bytes, AsyncGenerator[bytes, None]]:
    """Get first audio chunk ASAP, then return generator for the rest.

    This is optimized for minimal Time To First Audio (TTFA).

    Returns:
        Tuple of (first_chunk_bytes, remaining_chunks_generator)

    Usage:
        first_audio, rest = await fast_first_byte_tts("Hello, how are you today?")
        # Play first_audio immediately (~30-50ms)
        # Then iterate rest for remaining audio
    """
    from fast_tts import init_fast_tts, fast_tts, _initialized

    if not _initialized:
        if not init_fast_tts():
            return b"", _empty_generator()

    chunks = split_into_chunks(text, max_chunk_words=max_first_chunk_words)

    if not chunks:
        return b"", _empty_generator()

    # Generate first chunk synchronously for minimum latency
    start = time.time()
    first_audio = fast_tts(chunks[0])
    elapsed = (time.time() - start) * 1000

    if not first_audio:
        return b"", _empty_generator()

    print(f"🚀 TTS First byte: {elapsed:.0f}ms - '{chunks[0][:30]}...'")

    # Return first chunk and generator for the rest
    async def remaining_generator() -> AsyncGenerator[bytes, None]:
        for chunk_text in chunks[1:]:
            wav_data = fast_tts(chunk_text)
            if wav_data:
                yield wav_data[WAV_HEADER_SIZE:]  # Skip header for continuation
            await asyncio.sleep(0)

    return first_audio, remaining_generator()


async def _empty_generator() -> AsyncGenerator[bytes, None]:
    """Empty async generator."""
    return
    yield  # Make it a generator


# Benchmark function
async def benchmark_streaming():
    """Benchmark streaming TTS latency."""
    from fast_tts import init_fast_tts

    init_fast_tts()

    test_texts = [
        "Salut! Comment tu vas?",
        "Je suis vraiment content de te revoir. Ça fait longtemps qu'on ne s'est pas parlé!",
        "Oh là là, c'est une question intéressante. Laisse-moi réfléchir un instant avant de te répondre.",
    ]

    print("\n=== Streaming TTS Benchmark ===\n")

    for text in test_texts:
        print(f"Text: '{text[:50]}...' ({len(text)} chars)")

        # Traditional full TTS
        from fast_tts import fast_tts
        start = time.time()
        audio = fast_tts(text)
        full_time = (time.time() - start) * 1000
        print(f"  Full TTS: {full_time:.0f}ms")

        # Streaming TTS (time to first byte)
        start = time.time()
        first_byte_time = None
        total_bytes = 0

        async for chunk in stream_tts_gpu(text):
            if first_byte_time is None:
                first_byte_time = (time.time() - start) * 1000
            total_bytes += len(chunk)

        total_time = (time.time() - start) * 1000
        print(f"  Streaming: TTFB={first_byte_time:.0f}ms, Total={total_time:.0f}ms, {total_bytes} bytes")
        print()


if __name__ == "__main__":
    asyncio.run(benchmark_streaming())
