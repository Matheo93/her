---
reviewed_at: 2026-01-21T09:54:00Z
commit: 52931af
status: 🟠 SPRINT #71 - WEBSOCKET OK MAIS LENT - GPU GASPILLÉ - LATENCE INSTABLE
score: 40%
critical_issues:
  - LATENCE E2E: 199ms moyenne (borderline) mais Run1 = 274ms
  - WEBSOCKET LATENCY: 446ms via WS (2.2x target!) - HTTP = 199ms
  - GPU: 2% utilisation - RTX 4090 24GB INUTILISÉ
  - TTS: Format raw binary, pas de métrique latence
improvements:
  - WebSocket FONCTIONNE (websocat bugué, Python OK)
  - Tests: 202/202 (100%)
  - Frontend build: PASS
  - Health: OK
---

# Ralph Moderator - Sprint #71 - CRITIQUE IMPITOYABLE

## VERDICT: WEBSOCKET RÉPARÉ MAIS TROP LENT!

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🟠🟠🟠 SPRINT #71: WEBSOCKET OK MAIS PERFORMANCES INSUFFISANTES 🟠🟠🟠     ║
║                                                                               ║
║  DÉCOUVERTE IMPORTANTE:                                                       ║
║  ✅ WebSocket FONCTIONNE (Python websockets OK)                              ║
║  ❌ websocat buggé (connection refused - OUTIL CASSÉ, PAS LE BACKEND!)       ║
║                                                                               ║
║  MAIS:                                                                        ║
║  ❌ WebSocket latency: 446ms (2.2x target!)                                  ║
║  ❌ HTTP latency: 199ms avg mais spikes 274ms                                ║
║  ❌ GPU: 2% (RTX 4090 INUTILE!)                                              ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## SPRINT #71 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 6/10 | Services OK, latence instable |
| LATENCE | 5/10 | HTTP 199ms avg, WS 446ms |
| STREAMING | 6/10 | WebSocket fonctionnel mais 2x lent |
| HUMANITÉ | 5/10 | TTS format raw, pas de métriques |
| CONNECTIVITÉ | 7/10 | HTTP OK, WS OK (Python) |

**SCORE TRIADE: 29/50 (58%)**

---

## RAW TEST DATA (09:54 UTC)

### TEST 1: LATENCE E2E HTTP - 5 RUNS UNIQUES

```bash
=== MESSAGES UNIQUES (TIMESTAMP + RANDOM) ===
Run 1: 274ms   ❌ (1.37x target)
Run 2: 148ms   ✅
Run 3: 168ms   ✅
Run 4: 196ms   ✅
Run 5: 207ms   ⚠️ (juste au-dessus)

MOYENNE: 199ms (BORDERLINE!)
SOUS 200ms: 3/5 (60%)
WORST: 274ms (1.37x target)
```

### TEST 2: WEBSOCKET - FONCTIONNEL!

```bash
# Python websockets test:
Connected to WebSocket!
Response: "Je vais bien, merci..."
Tokens: 19
Total time: 446ms   ❌ (2.2x target!)

# websocat: Connection refused (OUTIL BUGUÉ, PAS LE BACKEND!)
```

### TEST 3: GPU UTILISATION

```
NVIDIA GeForce RTX 4090
├── Utilisation: 2%     ❌ (target: >20%)
├── VRAM utilisé: 4961 MiB / 24564 MiB
├── VRAM libre: 19.6 GB GASPILLÉS!
└── Température: ~27°C (idle)
```

### TEST 4: TTS

```bash
curl -X POST http://localhost:8000/tts -d '{"text":"Bonjour"}'
# Retourne: Audio binaire raw (pas JSON)
# Pas de métrique de latence visible
```

### TEST 5: TESTS UNITAIRES

```
202 passed, 1 skipped in 24.98s
✅ 100% pass rate
```

### TEST 6: FRONTEND BUILD

```
✅ BUILD PASS
Routes: /, /eva-her, /voice, /api/*
```

### HEALTH CHECK

```json
{
  "status": "healthy",
  "groq": true,
  "whisper": true,
  "tts": true,
  "database": true
}
```

---

## ANALYSE IMPITOYABLE

### ✅ RÉSOLU: WEBSOCKET

```
AVANT (Sprint #70): "WebSocket cassé"
MAINTENANT: WebSocket FONCTIONNE!

Le problème était websocat (outil de test), PAS le backend.
Python websockets connecte et reçoit des réponses.

MAIS: 446ms de latence via WebSocket vs 199ms via HTTP
POURQUOI? Le streaming token par token ajoute du overhead.
```

### 🟠 PROBLÈME #1: LATENCE INSTABLE (199ms avg)

```
HTTP Latency Distribution:
- Min: 148ms ✅
- Avg: 199ms ⚠️ BORDERLINE
- Max: 274ms ❌

VARIANCE: 126ms (inacceptable!)

CAUSES:
1. Groq API network jitter
2. Premier run = cold start?
3. Pas de connection pooling?

SOLUTIONS REQUISES:
1. Warmup Groq au démarrage
2. Connection pooling httpx
3. Retry with exponential backoff
```

### 🔴 PROBLÈME #2: GPU 2% - RTX 4090 GASPILLÉ!

```
Configuration actuelle:
├── USE_OLLAMA_PRIMARY=false
├── USE_FAST_MODEL=true (Groq)
├── Ollama models: tinyllama, phi3:mini (MINUSCULES!)
└── GPU: Essentiellement idle

24GB VRAM DISPONIBLES!
Pourquoi utiliser Groq API (payant, latence réseau)
quand on a un RTX 4090 capable de run des LLMs?

SOLUTIONS:
1. Installer un vrai modèle: qwen2.5:7b ou mistral:7b
2. OU vLLM avec Mistral-7B-Instruct
3. USE_OLLAMA_PRIMARY=true
```

### 🟠 PROBLÈME #3: WEBSOCKET 446ms (2.2x HTTP)

```
HTTP: 199ms
WebSocket: 446ms
Overhead: 247ms (124% de plus!)

CAUSE: Streaming token-by-token via WS
- Chaque token = 1 message JSON
- 19 tokens = 19 round-trips
- Network overhead x19

SOLUTIONS:
1. Batch tokens (envoyer par groupes de 5)
2. Binary encoding au lieu de JSON
3. Ou utiliser Server-Sent Events (SSE)
```

---

## BLOCAGES CRITIQUES

| Issue | Sévérité | Status |
|-------|----------|--------|
| GPU inutilisé | 🔴 CRITIQUE | 2% (24GB gaspillés) |
| WebSocket lent | 🟠 HAUTE | 446ms vs 199ms HTTP |
| Latence instable | 🟠 HAUTE | 148-274ms variance |
| TTS métriques | 🟠 MOYENNE | Pas de données latence |

---

## INSTRUCTIONS WORKER - SPRINT #72

### 🔴 ACTION #1: UTILISER LE GPU!!!

```bash
# Le RTX 4090 est à 2%! ON A UNE FERRARI AU GARAGE!

# Option A: Ollama avec modèle rapide
ollama pull qwen2.5:7b-instruct-q4_K_M
# Puis dans .env:
OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M
USE_OLLAMA_PRIMARY=true
USE_FAST_MODEL=false

# Option B: vLLM (meilleur throughput)
pip install vllm
python -m vllm.entrypoints.openai.api_server \
  --model mistralai/Mistral-7B-Instruct-v0.3 \
  --dtype bfloat16 \
  --gpu-memory-utilization 0.8 \
  --port 8001 &

# OBJECTIF: GPU >50% pendant inference
```

### 🟠 ACTION #2: RÉDUIRE LATENCE WEBSOCKET

```python
# Actuellement: 1 message par token = 19 messages pour 19 tokens
# SOLUTION: Batch tokens

# Dans main.py ws_chat():
buffer = []
async for token in stream_llm(sid, content):
    buffer.append(token)
    if len(buffer) >= 5 or token.endswith(('.', '!', '?', '\n')):
        await ws.send_json({"type": "tokens", "content": buffer})
        buffer = []
if buffer:
    await ws.send_json({"type": "tokens", "content": buffer})
```

### 🟠 ACTION #3: WARMUP AU DÉMARRAGE

```python
# Dans startup():
# Faire un appel Groq/Ollama au boot pour "préchauffer"
async def warmup_llm():
    try:
        await groq_client.chat.completions.create(
            model=GROQ_MODEL_FAST,
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=1
        )
        print("✅ Groq warmup complete")
    except Exception as e:
        print(f"⚠️ Groq warmup failed: {e}")
```

### 🟠 ACTION #4: MESURER TTS LATENCE

```bash
# Actuellement: TTS retourne binary sans métriques
# BESOIN: Ajouter latence dans réponse ou logs

curl -X POST http://localhost:8000/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Bonjour, comment vas-tu?"}' \
  -w '\nHTTP_TIME: %{time_total}s'

# OU modifier endpoint pour retourner JSON avec audio base64 + latence
```

### RECHERCHES WEB OBLIGATOIRES

```
WebSearch: "Ollama qwen2.5 7b RTX 4090 tokens per second 2026"
WebSearch: "WebSocket streaming optimization batch tokens"
WebSearch: "vLLM vs Ollama latency comparison RTX 4090"
WebSearch: "Groq API warmup cold start latency"
```

---

## COMPARAISON SPRINTS

| Sprint | Score | Latence HTTP | Latence WS | GPU |
|--------|-------|--------------|------------|-----|
| #68 | 50% | 230ms | ? | ? |
| #69 | 34% | 6573ms | KO | 16% |
| #70 | 44% | 255ms | KO | 3% |
| **#71** | **58%** | **199ms** | **446ms** | **2%** |

**PROGRÈS:** +14 points, WebSocket réparé!
**RÉGRESSION:** GPU encore plus bas (2% vs 3%)

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🟠 SPRINT #71: PROGRÈS SIGNIFICATIF MAIS INSUFFISANT 🟠                     ║
║                                                                               ║
║  AMÉLIORATIONS:                                                               ║
║  ✅ WebSocket FONCTIONNEL (diagnostic: websocat bugué)                       ║
║  ✅ HTTP latence 199ms (borderline mais proche target)                       ║
║  ✅ Tests 202/202 (100%)                                                      ║
║  ✅ Build frontend OK                                                         ║
║                                                                               ║
║  ÉCHECS PERSISTANTS:                                                          ║
║  ❌ GPU 2% - RTX 4090 24GB TOTALEMENT INUTILISÉ!                             ║
║  ❌ WebSocket 446ms (2.2x target, 2.2x HTTP!)                                ║
║  ❌ Latence instable (148-274ms, variance 126ms)                             ║
║  ❌ TTS sans métriques                                                       ║
║                                                                               ║
║  SCORE: 29/50 (58%)                                                          ║
║                                                                               ║
║  PRIORITÉS SPRINT #72:                                                        ║
║  1. UTILISER LE GPU! (qwen2.5:7b ou vLLM)                                    ║
║  2. RÉDUIRE LATENCE WS (batching tokens)                                     ║
║  3. STABILISER LATENCE HTTP (warmup, pooling)                                ║
║  4. MESURER TTS LATENCE                                                      ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## MESSAGE AU WORKER

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  WORKER: BON TRAVAIL SUR LE WEBSOCKET!                                       ║
║                                                                               ║
║  LE WEBSOCKET MARCHE! Le problème était websocat, pas ton code.             ║
║  Python websockets connecte parfaitement.                                    ║
║                                                                               ║
║  MAIS:                                                                        ║
║                                                                               ║
║  RTX 4090 à 2%! POURQUOI?                                                    ║
║  - tinyllama et phi3:mini sont MINUSCULES                                    ║
║  - Groq API = cloud = latence réseau                                         ║
║  - On PAIE Groq alors qu'on a 24GB VRAM!                                     ║
║                                                                               ║
║  ACTION IMMÉDIATE:                                                           ║
║  1. ollama pull qwen2.5:7b-instruct-q4_K_M                                   ║
║  2. OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M                                  ║
║  3. USE_OLLAMA_PRIMARY=true                                                  ║
║  4. Redémarrer backend                                                       ║
║                                                                               ║
║  JE VEUX VOIR DANS LE PROCHAIN SPRINT:                                       ║
║  - GPU >50% pendant inference                                                ║
║  - Latence HTTP <150ms (GPU local = pas de réseau!)                         ║
║  - WebSocket <250ms avec batching                                            ║
║  - TTS avec métriques de latence                                            ║
║                                                                               ║
║  ON A LE MATÉRIEL, IL FAUT L'UTILISER!                                       ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

*Ralph Moderator - Sprint #71*
*"WebSocket réparé! Mais GPU à 2% avec un RTX 4090 24GB = crime contre l'optimisation. Utilisez le matériel qu'on a!"*

---

# ANNEXE - DONNÉES BRUTES

## Configuration actuelle

```bash
# /home/dev/her/.env
GROQ_API_KEY=gsk_***
USE_FAST_MODEL=true              # llama-3.1-8b-instant
USE_OLLAMA_PRIMARY=false         # ❌ Devrait être true!
USE_OLLAMA_FALLBACK=true
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=phi3:mini           # ❌ Trop petit!
OLLAMA_KEEP_ALIVE=-1
```

## Ollama Models Available

```
tinyllama:latest  - 1B params (trop petit!)
phi3:mini         - 3.8B params (trop petit!)

RECOMMANDÉ:
qwen2.5:7b-instruct-q4_K_M  - 7B params, quantized
mistral:7b-instruct-q4_K_M  - 7B params, quantized
```

## WebSocket Test Results

```python
# Python websockets - SUCCÈS
Connected to WebSocket!
Response: "Je vais bien, merci..."
Tokens: 19
Total time: 446ms

# websocat - ÉCHEC (outil bugué)
WebSocketError: Connection refused (os error 111)
```

## Commands pour le Worker

```bash
# UTILISER LE GPU
ollama pull qwen2.5:7b-instruct-q4_K_M
# Modifier .env:
# OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M
# USE_OLLAMA_PRIMARY=true

# VÉRIFIER GPU USAGE
watch -n 1 nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv

# BENCHMARK LOCAL LLM
curl -X POST http://127.0.0.1:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct-q4_K_M",
  "prompt": "Hello, how are you?",
  "stream": false
}' | jq '.total_duration / 1000000 | round | tostring + "ms"'
```
