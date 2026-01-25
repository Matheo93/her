"""
TTS Streaming Optimizer - Sprint 575

Optimizations for ultra-low latency TTS streaming:
1. Pre-warm cache with common first chunks
2. Chunk-level caching (not just full responses)
3. Predictive pre-generation based on LLM streaming
4. Parallel chunk processing for multi-sentence responses

Target metrics:
- First byte latency: <30ms (cached) / <50ms (fresh)
- Subsequent chunks: streamed in parallel with LLM
"""

import asyncio
import hashlib
import time
from collections import OrderedDict
from typing import Optional, AsyncGenerator, Callable
from dataclasses import dataclass, field


@dataclass
class ChunkCacheEntry:
    """Cached TTS chunk with metadata."""
    audio: bytes
    text: str
    generated_at: float
    generation_time_ms: float
    hit_count: int = 0


class TTSChunkCache:
    """LRU cache for TTS audio chunks.

    Caches individual chunks rather than full responses,
    enabling cache hits on partial matches.
    """

    def __init__(self, max_size: int = 500):
        self.max_size = max_size
        self.cache: OrderedDict[str, ChunkCacheEntry] = OrderedDict()
        self.stats = {
            "hits": 0,
            "misses": 0,
            "evictions": 0,
            "total_generation_saved_ms": 0.0,
        }

    def _make_key(self, text: str) -> str:
        """Create cache key from text."""
        normalized = text.strip().lower()
        return hashlib.md5(normalized.encode()).hexdigest()

    def get(self, text: str) -> Optional[bytes]:
        """Get cached audio for text chunk."""
        key = self._make_key(text)

        if key in self.cache:
            entry = self.cache[key]
            entry.hit_count += 1
            self.stats["hits"] += 1
            self.stats["total_generation_saved_ms"] += entry.generation_time_ms

            # Move to end (most recently used)
            self.cache.move_to_end(key)
            return entry.audio

        self.stats["misses"] += 1
        return None

    def set(self, text: str, audio: bytes, generation_time_ms: float) -> None:
        """Cache audio for text chunk."""
        key = self._make_key(text)

        # Don't cache if already exists
        if key in self.cache:
            return

        # Evict oldest if at capacity
        while len(self.cache) >= self.max_size:
            self.cache.popitem(last=False)
            self.stats["evictions"] += 1

        self.cache[key] = ChunkCacheEntry(
            audio=audio,
            text=text,
            generated_at=time.time(),
            generation_time_ms=generation_time_ms,
        )

    def get_stats(self) -> dict:
        """Get cache statistics."""
        total = self.stats["hits"] + self.stats["misses"]
        hit_rate = (self.stats["hits"] / total * 100) if total > 0 else 0

        return {
            **self.stats,
            "size": len(self.cache),
            "max_size": self.max_size,
            "hit_rate_percent": round(hit_rate, 2),
        }

    def prewarm(self, chunks: list[str], generate_fn: Callable[[str], bytes]) -> int:
        """Pre-warm cache with common chunks.

        Returns number of chunks generated.
        """
        generated = 0
        for chunk in chunks:
            if self._make_key(chunk) not in self.cache:
                start = time.time()
                audio = generate_fn(chunk)
                if audio:
                    gen_time = (time.time() - start) * 1000
                    self.set(chunk, audio, gen_time)
                    generated += 1
        return generated


# Common first chunks to pre-warm (greetings, acknowledgments)
PREWARM_CHUNKS = [
    # French greetings
    "Hey!",
    "Salut!",
    "Coucou!",
    "Bonjour!",
    "Bonsoir!",
    "Hello!",

    # Acknowledgments
    "Hmm...",
    "Ah...",
    "Oh...",
    "Oui...",
    "D'accord...",
    "OK...",

    # Thinking sounds
    "Alors...",
    "Bon...",
    "Eh bien...",
    "Tu sais...",
    "En fait...",

    # Emotional expressions
    "Haha!",
    "Oh la la!",
    "Wow!",
    "Mince...",
    "Super!",

    # Transitions
    "Et donc...",
    "Mais...",
    "Parce que...",
    "Du coup...",
    "En tout cas...",
]


class StreamingTTSOptimizer:
    """Optimizes TTS streaming with caching and prediction.

    Features:
    1. Chunk-level caching for instant first bytes
    2. Parallel generation of subsequent chunks
    3. Pre-warming of common phrases
    4. Integration with LLM streaming for predictive generation
    """

    def __init__(
        self,
        generate_fn: Callable[[str], bytes],
        cache_size: int = 500,
        enable_parallel: bool = True,
        max_parallel_chunks: int = 3,
    ):
        """Initialize optimizer.

        Args:
            generate_fn: Function to generate TTS audio from text
            cache_size: Maximum cached chunks
            enable_parallel: Enable parallel chunk generation
            max_parallel_chunks: Max chunks to generate in parallel
        """
        self.generate_fn = generate_fn
        self.cache = TTSChunkCache(max_size=cache_size)
        self.enable_parallel = enable_parallel
        self.max_parallel_chunks = max_parallel_chunks
        self._prewarm_task: Optional[asyncio.Task] = None
        self._is_warmed = False

        # Metrics
        self.metrics = {
            "first_byte_latencies_ms": [],
            "total_requests": 0,
            "cache_hits_first_chunk": 0,
        }

    async def prewarm_cache(self) -> int:
        """Pre-warm cache with common chunks.

        Should be called at server startup.
        """
        print("🔥 Pre-warming TTS chunk cache...")

        def sync_generate(text: str) -> bytes:
            return self.generate_fn(text)

        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        generated = await loop.run_in_executor(
            None,
            self.cache.prewarm,
            PREWARM_CHUNKS,
            sync_generate,
        )

        self._is_warmed = True
        print(f"✅ Pre-warmed {generated} TTS chunks")
        return generated

    def generate_chunk_cached(self, text: str) -> tuple[bytes, bool, float]:
        """Generate or retrieve cached chunk.

        Returns:
            Tuple of (audio_bytes, was_cached, generation_time_ms)
        """
        # Try cache first
        cached = self.cache.get(text)
        if cached:
            return cached, True, 0.0

        # Generate fresh
        start = time.time()
        audio = self.generate_fn(text)
        gen_time = (time.time() - start) * 1000

        if audio:
            self.cache.set(text, audio, gen_time)

        return audio, False, gen_time

    async def stream_optimized(
        self,
        chunks: list[str],
        skip_header_after_first: bool = True,
    ) -> AsyncGenerator[bytes, None]:
        """Stream TTS with optimization.

        Yields audio chunks with optimized latency.
        First chunk uses cache or fast generation.
        Subsequent chunks can be generated in parallel.
        """
        if not chunks:
            return

        self.metrics["total_requests"] += 1
        WAV_HEADER_SIZE = 44

        # First chunk - prioritize low latency
        start = time.time()
        first_audio, was_cached, gen_time = self.generate_chunk_cached(chunks[0])
        first_byte_latency = (time.time() - start) * 1000

        self.metrics["first_byte_latencies_ms"].append(first_byte_latency)
        if len(self.metrics["first_byte_latencies_ms"]) > 1000:
            self.metrics["first_byte_latencies_ms"].pop(0)

        if was_cached:
            self.metrics["cache_hits_first_chunk"] += 1

        if first_audio:
            yield first_audio
            print(f"🔊 First chunk: {first_byte_latency:.0f}ms {'(cached)' if was_cached else ''} - '{chunks[0][:30]}...'")

        # Remaining chunks
        if len(chunks) > 1:
            if self.enable_parallel and len(chunks) > 2:
                # Parallel generation for multiple remaining chunks
                async for audio in self._stream_parallel(
                    chunks[1:],
                    skip_header=skip_header_after_first,
                ):
                    yield audio
            else:
                # Sequential for single remaining chunk
                for chunk_text in chunks[1:]:
                    audio, was_cached, gen_time = self.generate_chunk_cached(chunk_text)
                    if audio:
                        if skip_header_after_first:
                            yield audio[WAV_HEADER_SIZE:]
                        else:
                            yield audio
                        print(f"🔊 Chunk: {gen_time:.0f}ms {'(cached)' if was_cached else ''} - '{chunk_text[:30]}...'")
                    await asyncio.sleep(0)

    async def _stream_parallel(
        self,
        chunks: list[str],
        skip_header: bool = True,
    ) -> AsyncGenerator[bytes, None]:
        """Stream chunks with parallel pre-generation.

        Generates next N chunks in parallel while yielding current.
        """
        WAV_HEADER_SIZE = 44
        loop = asyncio.get_event_loop()

        # Create futures for parallel generation
        pending_futures: list[asyncio.Future] = []
        chunk_results: dict[int, bytes] = {}
        next_to_yield = 0

        async def generate_async(idx: int, text: str) -> tuple[int, bytes, bool, float]:
            audio, cached, gen_time = await loop.run_in_executor(
                None,
                self.generate_chunk_cached,
                text,
            )
            return idx, audio, cached, gen_time

        # Start initial batch
        for i, chunk_text in enumerate(chunks[:self.max_parallel_chunks]):
            future = asyncio.create_task(generate_async(i, chunk_text))
            pending_futures.append(future)

        next_to_start = self.max_parallel_chunks

        while next_to_yield < len(chunks) or pending_futures:
            # Wait for any completion
            if pending_futures:
                done, pending_futures_set = await asyncio.wait(
                    pending_futures,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                pending_futures = list(pending_futures_set)

                # Collect results
                for future in done:
                    idx, audio, cached, gen_time = await future
                    if audio:
                        chunk_results[idx] = audio
                        print(f"🔊 Parallel chunk {idx}: {gen_time:.0f}ms {'(cached)' if cached else ''}")

            # Yield in order
            while next_to_yield in chunk_results:
                audio = chunk_results.pop(next_to_yield)
                if skip_header:
                    yield audio[WAV_HEADER_SIZE:]
                else:
                    yield audio
                next_to_yield += 1

            # Start more if available
            while next_to_start < len(chunks) and len(pending_futures) < self.max_parallel_chunks:
                future = asyncio.create_task(generate_async(next_to_start, chunks[next_to_start]))
                pending_futures.append(future)
                next_to_start += 1

    def get_metrics(self) -> dict:
        """Get optimizer metrics."""
        latencies = self.metrics["first_byte_latencies_ms"]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0

        cache_hit_rate = (
            self.metrics["cache_hits_first_chunk"] / self.metrics["total_requests"] * 100
            if self.metrics["total_requests"] > 0 else 0
        )

        return {
            "total_requests": self.metrics["total_requests"],
            "avg_first_byte_latency_ms": round(avg_latency, 2),
            "first_chunk_cache_hit_rate": round(cache_hit_rate, 2),
            "cache": self.cache.get_stats(),
            "is_warmed": self._is_warmed,
        }


# Singleton instance (initialized lazily)
_optimizer: Optional[StreamingTTSOptimizer] = None


def get_tts_optimizer() -> Optional[StreamingTTSOptimizer]:
    """Get the TTS optimizer singleton."""
    return _optimizer


def init_tts_optimizer(generate_fn: Callable[[str], bytes]) -> StreamingTTSOptimizer:
    """Initialize the TTS optimizer singleton.

    Args:
        generate_fn: Function to generate TTS audio from text

    Returns:
        The initialized optimizer
    """
    global _optimizer
    _optimizer = StreamingTTSOptimizer(
        generate_fn=generate_fn,
        cache_size=500,
        enable_parallel=True,
        max_parallel_chunks=3,
    )
    return _optimizer


async def prewarm_tts_cache() -> int:
    """Pre-warm the TTS cache at server startup.

    Returns number of chunks pre-warmed.
    """
    if _optimizer is None:
        print("⚠️ TTS optimizer not initialized")
        return 0

    return await _optimizer.prewarm_cache()
