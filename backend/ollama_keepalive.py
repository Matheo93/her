"""
Ollama Keepalive Service

Prevents model unloading by sending periodic warmup requests.
Ensures Ollama model stays in VRAM for instant inference.

Key features:
- Aggressive keepalive every 5 seconds (Ollama deactivates model after ~10s)
- Measures and reports actual inference latency
- Auto-recovery if Ollama becomes unavailable
- Initial burst warmup to ensure model is GPU-hot
"""

import asyncio
import time
from typing import Optional
import httpx

# Configuration
OLLAMA_URL = "http://127.0.0.1:11434"
OLLAMA_MODEL = "phi3:mini"
KEEPALIVE_INTERVAL = 5  # seconds - CRITICAL: Ollama deactivates after ~10s, so 5s keeps it warm
KEEP_ALIVE_VALUE = 86400  # 24h in seconds - -1 doesn't work reliably in Ollama
WARMUP_BURST_COUNT = 3  # Initial burst of requests to ensure model is fully GPU-active

# State
_keepalive_task: Optional[asyncio.Task] = None
_http_client: Optional[httpx.AsyncClient] = None
_last_latency: float = 0
_is_warm: bool = False


async def _warmup_once() -> tuple[bool, float]:
    """Send a single warmup request to Ollama.

    Returns:
        Tuple of (success, latency_ms)
    """
    global _http_client, _last_latency, _is_warm

    if _http_client is None:
        _http_client = httpx.AsyncClient(timeout=30.0)

    try:
        start = time.time()
        resp = await _http_client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [{"role": "user", "content": "ping"}],
                "stream": False,
                "keep_alive": KEEP_ALIVE_VALUE,
                "options": {
                    "num_predict": 3,
                    "num_ctx": 128,
                }
            }
        )
        latency = (time.time() - start) * 1000
        _last_latency = latency

        if resp.status_code == 200:
            data = resp.json()
            load_duration = data.get("load_duration", 0) / 1_000_000  # ns to ms
            eval_duration = data.get("eval_duration", 0) / 1_000_000

            # Model is "warm" if load_duration is minimal (< 100ms)
            _is_warm = load_duration < 100

            if not _is_warm:
                print(f"🔥 Ollama cold start: load={load_duration:.0f}ms, eval={eval_duration:.0f}ms")
            else:
                # Only log occasionally to reduce noise
                pass

            return True, latency
        else:
            print(f"⚠️ Ollama keepalive failed: {resp.status_code}")
            return False, 0

    except Exception as e:
        print(f"⚠️ Ollama keepalive error: {e}")
        _is_warm = False
        return False, 0


async def _warmup_burst() -> bool:
    """Do an initial burst of warmup requests to ensure model is fully GPU-active.

    Returns:
        True if warmup succeeded
    """
    print(f"🚀 Starting warmup burst ({WARMUP_BURST_COUNT} requests)...")

    for i in range(WARMUP_BURST_COUNT):
        success, latency = await _warmup_once()
        if success:
            print(f"   Burst {i+1}/{WARMUP_BURST_COUNT}: {latency:.0f}ms")
        else:
            print(f"   Burst {i+1}/{WARMUP_BURST_COUNT}: FAILED")
            return False
        # Small delay between burst requests
        if i < WARMUP_BURST_COUNT - 1:
            await asyncio.sleep(0.1)

    print(f"✅ Warmup burst complete - model should be GPU-hot")
    return True


async def _keepalive_loop():
    """Background loop that keeps Ollama model warm."""
    global _is_warm

    consecutive_failures = 0
    max_failures = 3
    log_counter = 0

    # Initial burst warmup to ensure model is fully active
    await _warmup_burst()

    while True:
        try:
            success, latency = await _warmup_once()

            if success:
                consecutive_failures = 0
                log_counter += 1
                if not _is_warm:
                    print(f"🔥 Ollama warmed up: {latency:.0f}ms")
                    _is_warm = True
                elif log_counter % 12 == 0:  # Log every ~60s (12 x 5s) to reduce noise
                    print(f"🔄 Keepalive OK: {latency:.0f}ms (model warm)")
            else:
                consecutive_failures += 1
                _is_warm = False
                if consecutive_failures >= max_failures:
                    print(f"❌ Ollama unavailable after {max_failures} attempts, retrying burst...")
                    await _warmup_burst()
                    consecutive_failures = 0

            await asyncio.sleep(KEEPALIVE_INTERVAL)

        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"⚠️ Keepalive loop error: {e}")
            await asyncio.sleep(KEEPALIVE_INTERVAL)


def start_keepalive(
    ollama_url: str = OLLAMA_URL,
    model: str = OLLAMA_MODEL,
    interval: int = KEEPALIVE_INTERVAL
) -> asyncio.Task:
    """Start the background keepalive task.

    Args:
        ollama_url: Ollama API URL
        model: Model name to keep warm
        interval: Seconds between keepalive pings

    Returns:
        The background task
    """
    global _keepalive_task, OLLAMA_URL, OLLAMA_MODEL, KEEPALIVE_INTERVAL

    OLLAMA_URL = ollama_url
    OLLAMA_MODEL = model
    KEEPALIVE_INTERVAL = interval

    _keepalive_task = asyncio.create_task(_keepalive_loop())
    print(f"🔄 Ollama keepalive started ({model} @ {interval}s interval)")

    return _keepalive_task


def stop_keepalive():
    """Stop the keepalive task."""
    global _keepalive_task, _http_client

    if _keepalive_task is not None:
        _keepalive_task.cancel()
        _keepalive_task = None
        print("🛑 Ollama keepalive stopped")


def is_warm() -> bool:
    """Check if the model is currently warm in VRAM."""
    return _is_warm


def get_last_latency() -> float:
    """Get the latency of the last keepalive ping."""
    return _last_latency


async def ensure_warm() -> float:
    """Ensure model is warm before inference.

    Called before critical requests to guarantee fast response.

    Returns:
        Warmup latency in ms (0 if already warm)
    """
    if _is_warm:
        return 0

    success, latency = await _warmup_once()
    return latency if success else -1


# Testing
if __name__ == "__main__":
    async def test():
        print("Testing Ollama keepalive...")

        # Test single warmup
        success, latency = await _warmup_once()
        print(f"Warmup 1: success={success}, latency={latency:.0f}ms, warm={_is_warm}")

        # Second call should be faster (model warm)
        success, latency = await _warmup_once()
        print(f"Warmup 2: success={success}, latency={latency:.0f}ms, warm={_is_warm}")

        # Third call to confirm
        success, latency = await _warmup_once()
        print(f"Warmup 3: success={success}, latency={latency:.0f}ms, warm={_is_warm}")

    asyncio.run(test())
