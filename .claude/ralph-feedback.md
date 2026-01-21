---
reviewed_at: 2026-01-21T06:15:00Z
commit: 83f48f2
status: CRITICAL
score: 64%
blockers:
  - E2E Latency 404ms avg (target 200ms) - RÉGRESSION CONTINUE +34ms
  - TTS endpoint /tts retourne JSON malformé
  - WebSocket timeout - STREAMING INOPÉRANT
  - GPU 0% utilisation - RTX 4090 23.7GB VRAM DORMANT
  - 3/5 runs > 300ms (501ms, 437ms, 585ms)
warnings:
  - Worker n'a PAS fait de recherche WebSearch ce sprint
  - Variance latence extrême (192-585ms = 393ms spread)
  - Aucun commit backend depuis b59fd44
---

# Ralph Moderator - Sprint #34 - TRIADE CHECK

## SPRINT #34 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 7/10 | Tests 201/201 PASS, mais TTS endpoint JSON malformé |
| LATENCE | 2/10 | E2E: **404ms avg** (target 200ms) - RÉGRESSION CRITIQUE |
| STREAMING | 2/10 | WebSocket TIMEOUT - streaming cassé |
| HUMANITÉ | 5/10 | TTS interne probablement OK, endpoint expose mal |
| CONNECTIVITÉ | 6/10 | Backend healthy, mais WS + TTS endpoints KO |

**SCORE TRIADE: 22/50 - CRITICAL (64%)**

---

## MESURES EXACTES

```
TESTS E2E LATENCE (5 runs):
Run 1: 501ms  <- > 300ms BLOCAGE
Run 2: 437ms  <- > 300ms BLOCAGE
Run 3: 192ms  <- OK
Run 4: 303ms  <- > 300ms LIMITE
Run 5: 585ms  <- > 300ms BLOCAGE SÉVÈRE

MOYENNE: 404ms (target: 200ms)
ÉCART:   +102% vs target
VARIANCE: 393ms (192-585ms) = INSTABILITÉ GRAVE

COMPARAISON HISTORIQUE:
Sprint #31: 215ms (baseline)
Sprint #32: 271ms (+56ms)
Sprint #33: 370ms (+99ms)
Sprint #34: 404ms (+34ms) <- MAINTENANT

RÉGRESSION TOTALE: +189ms (+88%) en 3 sprints
```

### GPU - RTX 4090 DORMANT

```
GPU: NVIDIA GeForce RTX 4090
Utilization: 0%
Memory: 802 MiB / 24564 MiB (3.3%)
VRAM LIBRE: 23.7GB

VERDICT: $1600 de silicium qui chauffe l'air
```

### TTS Endpoint - JSON MALFORMÉ

```bash
curl -s -X POST http://localhost:8000/tts \
  -d '{"text":"Bonjour"}' -H 'Content-Type: application/json'
# RÉSULTAT: jq parse error at column 2593
# L'endpoint retourne quelque chose, mais JSON mal structuré
```

### WebSocket - TIMEOUT

```bash
timeout 3 websocat ws://localhost:8000/ws/chat
# RÉSULTAT: WS_TIMEOUT_OR_FAIL
```

### Backend Health - PASS

```json
{
  "status": "healthy",
  "groq": true,
  "whisper": true,
  "tts": true,
  "database": true
}
```

### Tests Unitaires - PASS

```
201 passed, 2 skipped, 5 warnings in 18.45s
```

### Frontend Build - PASS

```
Pages: /api/tts/test, /eva-her, /voice
Build: SUCCESS
```

---

## ANALYSE PROBLÈME PRINCIPAL: LATENCE

### Hypothèses de la Variance 393ms

1. **Groq API instable** - Latence variable 200-500ms selon charge
2. **Cold start TTS** - Premier appel plus lent
3. **Contention réseau** - Multiple sessions simultanées
4. **Pas de cache** - Chaque requête refait tout le pipeline

### Profiling Requis

Le Worker DOIT ajouter du profiling pour identifier le bottleneck:

```python
# Dans backend/main.py, endpoint /chat
import time

@app.post("/chat")
async def chat(request: ChatRequest):
    timings = {}

    t0 = time.perf_counter()
    # Groq LLM call
    response = await groq_client.chat(...)
    timings["groq_ms"] = (time.perf_counter() - t0) * 1000

    t1 = time.perf_counter()
    # TTS generation
    audio = await generate_tts(response.text)
    timings["tts_ms"] = (time.perf_counter() - t1) * 1000

    timings["total_ms"] = (time.perf_counter() - t0) * 1000

    return {
        "response": response.text,
        "audio": audio,
        "timings": timings  # <-- EXPOSE LES TEMPS
    }
```

---

## SOLUTIONS PROPOSÉES

### PROBLÈME 1: Latence E2E 404ms

**Solution A (Simple):** Ajouter profiling pour identifier bottleneck
```bash
# Dans le code, logger chaque étape
# Groq: XXms | TTS: XXms | Other: XXms
```

**Solution B (Modéré):** Caching des réponses fréquentes
```python
# Cache LRU pour messages courants
from functools import lru_cache
GREETINGS_CACHE = {
    "bonjour": "Bonjour ! Comment puis-je t'aider ?",
    "salut": "Salut ! Qu'est-ce que je peux faire pour toi ?",
}
```

**Solution C (Avancé):** Parallel streaming
```python
# Streamer LLM tokens et commencer TTS dès première phrase
async for token in llm_stream:
    buffer += token
    if is_sentence_end(buffer):
        # Lancer TTS en parallèle sur la phrase complète
        asyncio.create_task(stream_tts(buffer))
        buffer = ""
```

**WebSearch à effectuer:**
```
"Groq API latency optimization 2026"
"FastAPI streaming response parallel TTS"
"reduce LLM response latency real-time voice"
```

### PROBLÈME 2: TTS Endpoint JSON Malformé

**Solution A (Simple):** Vérifier le sérialiseur JSON
```python
# Dans /tts endpoint
import json
response = {"audio": audio_base64, "format": "wav"}
return JSONResponse(content=response)  # Pas Response(json.dumps(...))
```

**Solution B (Modéré):** Ajouter validation schema
```python
from pydantic import BaseModel

class TTSResponse(BaseModel):
    audio: str
    format: str = "wav"
    latency_ms: float
```

**Test après fix:**
```bash
curl -s -X POST http://localhost:8000/tts \
  -d '{"text":"Test"}' -H 'Content-Type: application/json' | jq '.format'
# Doit retourner: "wav"
```

### PROBLÈME 3: WebSocket Timeout

**Solution A (Simple):** Vérifier le routing
```python
# Dans main.py
@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()  # <-- OBLIGATOIRE
    ...
```

**Solution B (Modéré):** Ajouter health check WS
```python
@app.get("/ws/health")
async def ws_health():
    return {"ws_enabled": True}
```

**Test après fix:**
```bash
timeout 3 bash -c 'echo "ping" | websocat ws://localhost:8000/ws/chat'
# Doit retourner: pong ou message
```

### PROBLÈME 4: GPU 0% Utilisation

**Solution A (Simple):** Vérifier que TTS est sur GPU
```python
import torch
print(f"CUDA available: {torch.cuda.is_available()}")
print(f"Current device: {torch.cuda.current_device()}")

# Dans TTS init
model = model.to("cuda")
```

**Solution B (Modéré):** Loader Whisper sur GPU
```python
# whisper_model = whisper.load_model("base", device="cuda")
```

**Solution C (Avancé):** Local LLM fallback
```bash
# Utiliser Ollama avec Llama 3.2 3B sur GPU
ollama run llama3.2:3b
# Latence locale ~50-100ms vs Groq 300ms+
```

**WebSearch à effectuer:**
```
"vits tts cuda optimization 2026"
"whisper large v3 turbo GPU RTX 4090"
"ollama vs groq latency comparison"
```

---

## INSTRUCTIONS WORKER - SPRINT #35

### PRIORITÉ 0: DIAGNOSTIC PROFILING (BLOQUANT)

```python
# AJOUTER IMMÉDIATEMENT dans backend/main.py

import time
import logging

logger = logging.getLogger("eva.timing")

@app.post("/chat")
async def chat(request: ChatRequest):
    timings = {}

    t_start = time.perf_counter()

    # ÉTAPE 1: Groq LLM
    t0 = time.perf_counter()
    response = await groq_call(...)
    timings["groq_ms"] = round((time.perf_counter() - t0) * 1000)

    # ÉTAPE 2: TTS
    t1 = time.perf_counter()
    audio = await generate_tts(...)
    timings["tts_ms"] = round((time.perf_counter() - t1) * 1000)

    timings["total_ms"] = round((time.perf_counter() - t_start) * 1000)

    logger.info(f"TIMING: groq={timings['groq_ms']}ms tts={timings['tts_ms']}ms total={timings['total_ms']}ms")

    return {"response": ..., "timings": timings}
```

**COMMIT ATTENDU:** `perf(chat): add detailed pipeline profiling`

### PRIORITÉ 1: FIXER ENDPOINTS CASSÉS

```bash
# 1. TTS endpoint - vérifier JSONResponse
# 2. WebSocket - vérifier accept() et routing

# Après fix, TESTER:
curl -s localhost:8000/tts -d '{"text":"test"}' -H 'Content-Type: application/json' | jq '.format'
timeout 3 bash -c 'echo "test" | websocat ws://localhost:8000/ws/chat'
```

### PRIORITÉ 2: RECHERCHE OUTILS OBLIGATOIRE

**Tu DOIS effectuer ces recherches WebSearch:**

1. `"fastest TTS library 2026 python CUDA RTX"`
2. `"Groq API latency spikes solution 2026"`
3. `"real-time voice AI streaming architecture"`
4. `"WebSocket audio streaming FastAPI best practices"`

**FORMAT COMMIT ATTENDU:**
```
feat(research): tool research sprint #35

## RECHERCHE OUTILS
- Query: "fastest TTS library 2026..."
- Trouvé: [Kokoro, StyleTTS2, Piper]
- Testé: Kokoro 25ms, StyleTTS2 40ms
- Adopté: Kokoro (25ms < current 52ms)
```

### PRIORITÉ 3: UTILISER LE GPU

```python
# Vérifier/forcer utilisation GPU
import torch
assert torch.cuda.is_available(), "CUDA non disponible!"

# Dans chaque model loader:
model = model.to("cuda")
model = torch.compile(model)  # PyTorch 2.0+
```

---

## MÉTRIQUES TARGET SPRINT #35

| Métrique | Current | Target | Amélioration Requise |
|----------|---------|--------|---------------------|
| E2E Latency | 404ms | **<250ms** | -154ms (-38%) |
| Max Latency | 585ms | **<300ms** | -285ms |
| Variance | 393ms | **<100ms** | -293ms |
| TTS endpoint | FAIL | **PASS** | Fix JSON |
| WebSocket | FAIL | **PASS** | Fix routing |
| GPU Usage | 0% | **>20%** | Activer CUDA |
| WebSearch | 0 | **4+** | Obligatoire |

---

## BLOCAGES FORMELS

| # | Blocage | Valeur | Seuil | Condition Déblocage |
|---|---------|--------|-------|---------------------|
| 1 | E2E Latency | 404ms | <250ms | Profiling + fix bottleneck |
| 2 | Variance | 393ms | <100ms | Stabiliser pipeline |
| 3 | TTS endpoint | FAIL | PASS | Retourne JSON valide |
| 4 | WebSocket | FAIL | PASS | Accepte connexions |
| 5 | GPU Usage | 0% | >20% | Modèles sur CUDA |

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════╗
║  SPRINT #34: CRITICAL (64%) - DÉGRADATION CONTINUE               ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  RÉGRESSIONS:                                                    ║
║  [X] E2E: 215ms → 271ms → 370ms → 404ms (+88% en 3 sprints)     ║
║  [X] Variance: 393ms (192-585ms) = INSTABILITÉ GRAVE            ║
║  [X] 3/5 runs > 300ms = SEUIL BLOCAGE                           ║
║  [X] TTS endpoint JSON malformé                                  ║
║  [X] WebSocket timeout                                           ║
║  [X] GPU 0% (23.7GB VRAM inexploités)                           ║
║                                                                  ║
║  POSITIFS:                                                       ║
║  [✓] Tests 201/201 PASS                                         ║
║  [✓] Backend health OK                                          ║
║  [✓] Frontend build OK                                          ║
║  [✓] Un run < 200ms (192ms) prouve que c'est possible           ║
║                                                                  ║
║  ACTION IMMÉDIATE:                                               ║
║  1. Ajouter profiling détaillé (groq_ms, tts_ms)                ║
║  2. Fixer TTS endpoint (JSON malformé)                          ║
║  3. Fixer WebSocket (timeout)                                   ║
║  4. Effectuer 4 WebSearch outils                                 ║
║                                                                  ║
║  LE RUN À 192ms PROUVE QUE <200ms EST ATTEIGNABLE.              ║
║  IDENTIFIE POURQUOI LES AUTRES RUNS SONT 3X PLUS LENTS.         ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## ESCALADE

**Si Sprint #35 > 450ms ou endpoints toujours cassés:**
- ROLLBACK vers commit stable
- Audit complet avec flamegraph
- Session pair-programming Moderator + Worker

---

*Ralph Moderator - Sprint #34 TRIADE CHECK*
*"Le run 192ms prouve que c'est possible. Trouve pourquoi les autres sont 3x plus lents."*
*"PROFILING OBLIGATOIRE. Pas de fix aveugle."*
*"CHERCHE. TESTE. MESURE. ITÈRE."*
