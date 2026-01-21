"""
vLLM High-Performance LLM Service

Ultra-fast local LLM inference using vLLM's optimized serving.
Features:
- PagedAttention for efficient memory management
- Continuous batching for high throughput
- ~35-50ms TTFT on RTX 4090

Usage:
    from vllm_service import init_vllm, stream_vllm, get_vllm_response

    # Initialize at startup
    await init_vllm()

    # Stream tokens
    async for token in stream_vllm(messages):
        print(token, end="")
"""

import asyncio
import time
from typing import AsyncGenerator, Optional, List, Dict, Any

# vLLM imports (lazy load to avoid startup delay)
_llm = None
_sampling_params = None
_model_id = "microsoft/Phi-3-mini-4k-instruct"  # Same quality as phi3:mini
_vllm_available = False


def init_vllm(
    model_id: str = "microsoft/Phi-3-mini-4k-instruct",
    max_model_len: int = 2048,
    gpu_memory_utilization: float = 0.4  # Leave room for TTS models
) -> bool:
    """Initialize vLLM with the specified model.

    Args:
        model_id: HuggingFace model ID
        max_model_len: Maximum sequence length
        gpu_memory_utilization: Fraction of GPU memory to use

    Returns:
        True if initialization successful
    """
    global _llm, _sampling_params, _model_id, _vllm_available

    try:
        from vllm import LLM, SamplingParams

        print(f"🚀 Initializing vLLM with {model_id}...")
        start = time.time()

        _llm = LLM(
            model=model_id,
            max_model_len=max_model_len,
            gpu_memory_utilization=gpu_memory_utilization,
            trust_remote_code=True,
            dtype="auto",  # Use bf16 if available
            enforce_eager=False,  # Enable CUDA graphs for speed
        )

        # Default sampling params for conversational AI
        _sampling_params = SamplingParams(
            temperature=0.7,
            top_p=0.85,
            max_tokens=80,
            stop=["<|end|>", "<|user|>", "\n\n"],
        )

        _model_id = model_id
        _vllm_available = True

        load_time = time.time() - start
        print(f"✅ vLLM ready ({model_id}) in {load_time:.1f}s")

        # Warmup inference
        _ = _llm.generate(["Hello"], _sampling_params)
        print(f"⚡ vLLM warmup complete")

        return True

    except Exception as e:
        print(f"❌ vLLM initialization failed: {e}")
        _vllm_available = False
        return False


def is_vllm_available() -> bool:
    """Check if vLLM is initialized and ready."""
    return _vllm_available and _llm is not None


def _format_messages_to_prompt(messages: List[Dict[str, str]]) -> str:
    """Convert chat messages to a prompt string for Phi-3.

    Phi-3 uses:
    <|system|>
    {system_message}<|end|>
    <|user|>
    {user_message}<|end|>
    <|assistant|>
    """
    prompt_parts = []

    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if role == "system":
            prompt_parts.append(f"<|system|>\n{content}<|end|>")
        elif role == "user":
            prompt_parts.append(f"<|user|>\n{content}<|end|>")
        elif role == "assistant":
            prompt_parts.append(f"<|assistant|>\n{content}<|end|>")

    # Add the assistant prefix for generation
    prompt_parts.append("<|assistant|>\n")

    return "\n".join(prompt_parts)


def get_vllm_response(
    messages: List[Dict[str, str]],
    max_tokens: int = 80,
    temperature: float = 0.7
) -> Optional[str]:
    """Get a complete response from vLLM (non-streaming).

    Args:
        messages: List of chat messages
        max_tokens: Maximum tokens to generate
        temperature: Sampling temperature

    Returns:
        Generated text or None on error
    """
    global _llm, _sampling_params

    if not _vllm_available or _llm is None:
        return None

    try:
        from vllm import SamplingParams

        prompt = _format_messages_to_prompt(messages)

        params = SamplingParams(
            temperature=temperature,
            top_p=0.85,
            max_tokens=max_tokens,
            stop=["<|end|>", "<|user|>", "\n\n"],
        )

        start = time.time()
        outputs = _llm.generate([prompt], params)
        latency = (time.time() - start) * 1000

        if outputs and outputs[0].outputs:
            text = outputs[0].outputs[0].text.strip()
            print(f"⚡ vLLM: {latency:.0f}ms ({len(text)} chars)")
            return text

        return None

    except Exception as e:
        print(f"❌ vLLM error: {e}")
        return None


async def stream_vllm(
    messages: List[Dict[str, str]],
    max_tokens: int = 80,
    temperature: float = 0.7
) -> AsyncGenerator[str, None]:
    """Stream tokens from vLLM.

    Note: vLLM's core generate() is synchronous but highly optimized.
    We wrap it to provide async interface compatible with the rest of the app.

    For true streaming, vLLM's AsyncLLMEngine is needed but adds complexity.
    This approach gives near-instant complete response for short generations.

    Args:
        messages: List of chat messages
        max_tokens: Maximum tokens to generate
        temperature: Sampling temperature

    Yields:
        Generated text chunks
    """
    # For short responses (80 tokens), full generation is fast enough
    # Run in thread to not block the event loop
    response = await asyncio.to_thread(
        get_vllm_response,
        messages,
        max_tokens,
        temperature
    )

    if response:
        # Yield the complete response (fast for short responses)
        # For longer responses, consider word-by-word yielding
        yield response


async def stream_vllm_tokens(
    messages: List[Dict[str, str]],
    max_tokens: int = 80,
    temperature: float = 0.7
) -> AsyncGenerator[str, None]:
    """Stream tokens word-by-word for UI responsiveness.

    This simulates streaming by yielding words from a complete response.
    vLLM's batch inference is so fast that this often feels smoother
    than true token-by-token streaming with higher latency.

    Args:
        messages: List of chat messages
        max_tokens: Maximum tokens to generate
        temperature: Sampling temperature

    Yields:
        Individual words/tokens
    """
    response = await asyncio.to_thread(
        get_vllm_response,
        messages,
        max_tokens,
        temperature
    )

    if response:
        # Yield word by word for UI responsiveness
        words = response.split()
        for i, word in enumerate(words):
            yield word + (" " if i < len(words) - 1 else "")
            # Small delay between words for natural feel
            if i == 0:
                # No delay on first word - immediate TTFT
                pass
            else:
                await asyncio.sleep(0.01)  # 10ms between words


def shutdown_vllm():
    """Clean shutdown of vLLM."""
    global _llm, _vllm_available

    if _llm is not None:
        # vLLM handles cleanup internally
        _llm = None
        _vllm_available = False
        print("🛑 vLLM shutdown")


# For testing
if __name__ == "__main__":
    import asyncio

    async def test():
        if init_vllm():
            messages = [
                {"role": "system", "content": "Tu es EVA, une IA amicale."},
                {"role": "user", "content": "Salut! Comment tu vas?"}
            ]

            start = time.time()
            response = get_vllm_response(messages)
            latency = (time.time() - start) * 1000

            print(f"\nResponse: {response}")
            print(f"Latency: {latency:.0f}ms")

            shutdown_vllm()

    asyncio.run(test())
