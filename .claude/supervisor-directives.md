# SUPERVISOR DIRECTIVES - CYCLE 1
**Date:** 2026-01-20T13:20:00Z
**Status:** ARCHITECTURE GAP IDENTIFIED

---

## CRITICAL FINDINGS

### 1. `/chat` Endpoint is TEXT-ONLY (BY DESIGN)

**Observation:** Moderator tests `/chat` for `audio_base64` but this endpoint is designed to return TEXT ONLY.

```python
# main.py:1817-1847
async def chat(...):
    response = await get_llm_response(session_id, message)
    return {
        "response": response,
        "session_id": session_id,
        "latency_ms": round(latency),
        "rate_limit_remaining": ...
    }
    # NO AUDIO HERE!
```

### 2. Audio Endpoints Require Audio INPUT

Current endpoints:
- `/voice` - requires audio file (STT input)
- `/voice/stream` - requires audio file
- `/voice/lipsync` - requires audio file

**GAP:** No simple "text in → text + audio out" endpoint exists.

### 3. TTS Works Independently

```
TTS endpoint: 4.8ms (EXCELLENT)
GPU TTS: 174ms (logs confirm GPU Piper works)
```

---

## DIRECTIVES FOR WORKER

### PRIORITY 1: Create `/chat/audio` Endpoint

Add a new endpoint that combines chat + TTS:

```python
@app.post("/chat/audio")
async def chat_with_audio(data: dict):
    # 1. Get LLM response
    response = await get_llm_response(session_id, message)

    # 2. Generate TTS
    audio = await async_emotional_tts(response)

    # 3. Return both
    return {
        "response": response,
        "audio_base64": base64.b64encode(audio).decode() if audio else None,
        "latency_ms": ...
    }
```

### PRIORITY 2: Use the Fallback Fix

I applied the fallback fix to `async_emotional_tts` at lines 1953-1964:
- Fallback to GPU TTS if ultra_fast fails
- Fallback to fast TTS if GPU fails

**VERIFY this is working!**

---

## DIRECTIVES FOR MODERATOR

### Adjust Test Strategy

1. **For text-only tests:** Use `/chat`
2. **For audio tests:** Use `/tts` OR create `/chat/audio`
3. **For E2E voice:** Use WebSocket or `/voice` with audio input

### GPU Utilization

GPU 0% during idle is NORMAL. Test GPU during active inference:
```bash
# While running TTS
nvidia-smi --query-gpu=utilization.gpu --format=csv
```

---

## METRICS FROM CYCLE 1

| Metric | Value | Status |
|--------|-------|--------|
| Backend | healthy | PASS |
| CUDA | True | PASS |
| GPU Memory | 678 MiB | LOADED |
| LLM Latency | 240ms | PASS |
| TTS Latency | 4.8ms | EXCELLENT |
| Tests | 199/200 | PASS |

---

## NEXT CHECK

In 5 minutes. Monitoring continues.

---

*Supervisor - Cycle 1*
*"Architecture gap identified. Worker must create /chat/audio endpoint."*
