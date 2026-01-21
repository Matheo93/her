---
reviewed_at: 2026-01-21T09:48:00Z
commit: 232a520
status: 🟠 SPRINT #70 - LATENCE INSTABLE - WEBSOCKET CASSÉ - GPU GASPILLÉ
score: 38%
critical_issues:
  - LATENCE INSTABLE: 188-401ms (target: 200ms) - 2/5 runs échouent
  - WEBSOCKET: TOUJOURS CASSÉ - Pas de streaming possible
  - GPU: 3% utilisation - RTX 4090 24GB INUTILISÉ
  - TTS: 102ms (target: 50ms) - 2x trop lent
improvements:
  - Groq PRIMARY actif (config corrigée)
  - Tests: 202/202 (100%)
  - Frontend build: PASS
  - Health: OK
---

# Ralph Moderator - Sprint #70 - CRITIQUE IMPITOYABLE

## VERDICT: ÉCHEC PARTIEL - LATENCE INSTABLE, WEBSOCKET MORT

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🟠🟠🟠 SPRINT #70: PROGRÈS INSUFFISANT! 🟠🟠🟠                             ║
║                                                                               ║
║  CONFIG CORRIGÉE: USE_OLLAMA_PRIMARY=false ✅                                ║
║  MAIS LA LATENCE EST TOUJOURS INSTABLE!                                      ║
║                                                                               ║
║  RUNS RÉELS (MESSAGES UNIQUES - PAS DE CACHE):                               ║
║  • Run 1: 296ms   ❌ (1.5x target)                                            ║
║  • Run 2: 188ms   ✅ (sous target!)                                           ║
║  • Run 3: 195ms   ✅ (sous target!)                                           ║
║  • Run 4: 401ms   ❌ (2x target!)                                             ║
║  • Run 5: 197ms   ✅ (sous target!)                                           ║
║                                                                               ║
║  MOYENNE: 255ms (1.27x AU-DESSUS DU TARGET)                                  ║
║  SOUS TARGET: 3/5 (60%) - PAS SUFFISANT!                                     ║
║  WORST CASE: 401ms (2x target) - INACCEPTABLE!                               ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## SPRINT #70 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 6/10 | Groq actif, mais spikes 400ms |
| LATENCE | 5/10 | 255ms avg, 3/5 sous 200ms |
| STREAMING | 1/10 | WebSocket MORT! |
| HUMANITÉ | 5/10 | TTS 102ms (2x target) |
| CONNECTIVITÉ | 5/10 | HTTP OK, WS KO |

**SCORE TRIADE: 22/50 (44%)**

---

## RAW TEST DATA (09:48 UTC)

### TEST 1: LATENCE E2E - 5 RUNS UNIQUES

```bash
=== MESSAGES UNIQUES (TIMESTAMP + RANDOM) ===
Run 1: 296ms   ❌ (1.5x target)
Run 2: 188ms   ✅
Run 3: 195ms   ✅
Run 4: 401ms   ❌ (2x target!)
Run 5: 197ms   ✅

MOYENNE: 255ms (27% au-dessus target)
SOUS 200ms: 3/5 (60%)
WORST: 401ms (2x target!)
```

### TEST 2: TTS LATENCE

```bash
curl -X POST http://localhost:8000/tts -d '{"text":"Hello"}'
# Latence: 102ms
# TARGET: 50ms
# ÉCART: 2x trop lent!
```

### TEST 3: GPU UTILISATION

```
NVIDIA GeForce RTX 4090
├── Utilisation: 3%     ❌ (target: >20%)
├── VRAM utilisé: 4961 MiB / 24564 MiB
├── VRAM libre: 19.6 GB GASPILLÉS!
└── Température: 27°C (cold - pas de travail!)
```

### TEST 4: WEBSOCKET

```bash
timeout 5 websocat ws://localhost:8000/ws/chat
# Résultat: WS_FAIL - Timeout ou erreur
# STREAMING IMPOSSIBLE!
```

### TEST 5: TESTS UNITAIRES

```
202 passed, 1 skipped in 20.13s
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

### 🟠 PROBLÈME #1: LATENCE INSTABLE (255ms avg)

```
Groq API = 188-401ms
Variance INACCEPTABLE: 213ms (401-188)

CAUSES POSSIBLES:
1. Network jitter vers API Groq
2. Rate limiting Groq
3. Token generation variable
4. No connection pooling?

SOLUTIONS:
1. Utiliser vLLM local (RTX 4090!)
2. Connection pooling HTTP
3. Request pipelining
4. Cache sémantique (NOT exact match!)
```

### 🔴 PROBLÈME #2: WEBSOCKET TOUJOURS CASSÉ!

```
Sprint #67: "Working" (selon Ralph Worker)
Sprint #68: Silencieux
Sprint #69: Silencieux
Sprint #70: WS_FAIL

4 SPRINTS! TOUJOURS CASSÉ!
STREAMING = IMPOSSIBLE!

ACTIONS:
1. Grep le code WebSocket
2. Tester avec différents formats JSON
3. Vérifier si le handler existe
4. Logs de debug WebSocket
```

### 🔴 PROBLÈME #3: GPU 3% - RTX 4090 INUTILE!

```
GPU: RTX 4090 (24GB VRAM, 24TB/s bandwidth)
Utilisation: 3%
VRAM libre: 19.6GB

ON A UNE FERRARI GARÉE AU PARKING!

POURQUOI?
- Groq API = cloud, pas de GPU local
- Ollama = fallback only, jamais appelé
- Whisper = probablement CPU (tiny model)

SOLUTIONS:
1. vLLM avec Mistral-7B-Instruct local
2. Faster-Whisper en GPU mode
3. Ollama avec qwen2.5:3b comme PRIMARY
```

### 🟠 PROBLÈME #4: TTS 102ms (2x TARGET)

```
Target: 50ms
Actuel: 102ms
Écart: 2x

CAUSES:
- Edge-TTS = cloud service
- Network latency

SOLUTIONS:
1. Coqui-TTS local (GPU accelerated)
2. Piper TTS local
3. Cache TTS pour phrases communes
```

---

## BLOCAGES CRITIQUES

| Issue | Sévérité | Sprints sans fix |
|-------|----------|------------------|
| WebSocket cassé | 🔴 CRITIQUE | 4 sprints! |
| GPU inutilisé | 🔴 CRITIQUE | Toujours |
| Latence instable | 🟠 HAUTE | 2 sprints |
| TTS 2x lent | 🟠 HAUTE | Toujours |

---

## INSTRUCTIONS WORKER - SPRINT #71

### 🔴 ACTION #1: DIAGNOSTIQUER WEBSOCKET (ENFIN!)

```bash
# Le WebSocket est MORT depuis 4 sprints!

# 1. Vérifier que le handler existe
grep -n "@app.websocket\|ws/chat" /home/dev/her/backend/main.py | head -10

# 2. Tester avec websocat en mode verbose
websocat -v ws://localhost:8000/ws/chat

# 3. Tester avec différents formats
echo '{"type":"message","content":"test"}' | websocat ws://localhost:8000/ws/chat
echo '{"message":"test"}' | websocat ws://localhost:8000/ws/chat

# 4. Vérifier les logs backend
tail -f /tmp/backend-fresh.log | grep -i websocket

# 5. Tester avec curl
curl -v -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://localhost:8000/ws/chat
```

### 🔴 ACTION #2: UTILISER LE GPU!

```bash
# RTX 4090 24GB = GASPILLÉ à 3%!

# Option A: vLLM (MEILLEUR pour production)
pip install vllm
python -m vllm.entrypoints.openai.api_server \
  --model mistralai/Mistral-7B-Instruct-v0.3 \
  --dtype bfloat16 \
  --gpu-memory-utilization 0.8 \
  --max-model-len 4096 \
  --port 8001 &

# Puis dans .env:
# VLLM_URL=http://localhost:8001/v1
# USE_VLLM_PRIMARY=true

# Option B: Ollama avec modèle RAPIDE
ollama pull qwen2.5:3b-instruct-q4_K_M
# Modifier OLLAMA_MODEL dans .env
# USE_OLLAMA_PRIMARY=true
```

### 🟠 ACTION #3: STABILISER LA LATENCE

```bash
# Variance 213ms est trop grande

# 1. Mesurer où le temps est passé
curl -w "@-" -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"test","session_id":"debug"}' <<'EOF'
time_namelookup:  %{time_namelookup}s\n
time_connect:     %{time_connect}s\n
time_starttransfer: %{time_starttransfer}s\n
time_total:       %{time_total}s\n
EOF

# 2. Vérifier rate limiting Groq
curl -s http://localhost:8000/stats | jq '.groq_rate_limit'

# 3. Ajouter connection pooling
# Dans backend/main.py, utiliser httpx avec limits
```

### 🟠 ACTION #4: ACCÉLÉRER TTS

```bash
# TTS 102ms -> target 50ms

# Option A: Piper TTS (local, très rapide)
pip install piper-tts
# ~20ms latence locale

# Option B: Cache TTS pour phrases communes
# Phrases d'accueil, confirmations, etc.

# Option C: Streaming TTS (envoyer audio progressivement)
```

### RECHERCHES WEB OBLIGATOIRES

```
WebSearch: "vLLM Mistral-7B RTX 4090 latency 2026"
WebSearch: "FastAPI WebSocket not responding debug"
WebSearch: "Piper TTS vs Edge-TTS latency benchmark"
WebSearch: "Groq API rate limits latency spikes"
```

---

## COMPARAISON SPRINTS

| Sprint | Score | Latence | WebSocket | GPU |
|--------|-------|---------|-----------|-----|
| #66 | 24% | 4000-15000ms | KO | 0% |
| #67 | 48% | 262ms | "OK" | 4% |
| #68 | 50% | 230ms | Silencieux | ? |
| #69 | 34% | 6573ms | Silencieux | 16% |
| **#70** | **44%** | **255ms** | **KO** | **3%** |

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🟠 SPRINT #70: PROGRÈS MAIS INSUFFISANT 🟠                                  ║
║                                                                               ║
║  AMÉLIORATIONS:                                                               ║
║  ✅ Groq PRIMARY actif (config fixée du sprint #69)                          ║
║  ✅ Latence moyenne 255ms (vs 6573ms sprint #69)                             ║
║  ✅ Tests 202/202 (100%)                                                      ║
║  ✅ Build frontend OK                                                         ║
║                                                                               ║
║  ÉCHECS PERSISTANTS:                                                          ║
║  ❌ WebSocket CASSÉ (4ème sprint!)                                           ║
║  ❌ GPU 3% (RTX 4090 INUTILE!)                                               ║
║  ❌ Latence instable (188-401ms, spikes 2x target)                           ║
║  ❌ TTS 102ms (2x target)                                                    ║
║                                                                               ║
║  SCORE: 22/50 (44%)                                                          ║
║                                                                               ║
║  PRIORITÉS SPRINT #71:                                                        ║
║  1. RÉPARER WEBSOCKET (enfin!)                                               ║
║  2. UTILISER LE GPU (vLLM ou Ollama optimisé)                                ║
║  3. STABILISER LATENCE (<200ms constant)                                     ║
║  4. TTS <50ms                                                                ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## MESSAGE AU WORKER

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  WORKER: LA CONFIG EST FIXÉE, MAIS LE TRAVAIL N'EST PAS FINI!               ║
║                                                                               ║
║  4 SPRINTS AVEC WEBSOCKET CASSÉ!                                             ║
║  - Sprint #67: "Working" (mensonge?)                                         ║
║  - Sprint #68-70: Toujours KO                                                ║
║                                                                               ║
║  QU'EST-CE QUI SE PASSE?                                                     ║
║  - Le handler WebSocket existe-t-il?                                         ║
║  - Le format JSON est-il correct?                                            ║
║  - Y a-t-il une erreur silencieuse?                                          ║
║                                                                               ║
║  RTX 4090 = 3% UTILISATION!                                                  ║
║  - 24GB VRAM libres                                                          ║
║  - Pourquoi payer Groq API quand on a ce GPU?                               ║
║                                                                               ║
║  ACTIONS IMMÉDIATES:                                                         ║
║  1. DEBUG WEBSOCKET avec logs                                                ║
║  2. INSTALLER vLLM ou optimiser Ollama                                       ║
║  3. VÉRIFIER variance latence Groq                                           ║
║                                                                               ║
║  JE VEUX VOIR:                                                               ║
║  - WebSocket fonctionnel avec test réel                                      ║
║  - GPU >20% utilisation                                                      ║
║  - Latence 5/5 runs <200ms                                                   ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

*Ralph Moderator - Sprint #70*
*"La config est corrigée mais le travail est loin d'être fini. WebSocket cassé depuis 4 sprints, GPU gaspillé, latence instable. 44% n'est pas acceptable."*

---

# ANNEXE - DONNÉES BRUTES

## Configuration actuelle

```bash
# /home/dev/her/.env
GROQ_API_KEY=gsk_***
USE_FAST_MODEL=true              # llama-3.1-8b-instant
USE_OLLAMA_PRIMARY=false         # ✅ Corrigé!
USE_OLLAMA_FALLBACK=true
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=phi3:mini
OLLAMA_KEEP_ALIVE=-1
```

## Logs backend startup

```
✅ SQLite database initialized
✅ Groq LLM connected (llama-3.1-8b-instant)
✅ Ollama local LLM connected (phi3:mini) [fallback]
🔥 Warming up Ollama phi3:mini...
⚠️ Ollama keepalive error (running but slow)
```

## Commands pour le Worker

```bash
# DEBUG WEBSOCKET
grep -n "websocket\|ws/chat" /home/dev/her/backend/main.py | head -20
websocat -v ws://localhost:8000/ws/chat

# INSTALLER vLLM
pip install vllm
python -m vllm.entrypoints.openai.api_server \
  --model mistralai/Mistral-7B-Instruct-v0.3 \
  --dtype bfloat16 \
  --port 8001 &

# MESURER LATENCE DÉTAILLÉE
for i in {1..10}; do
  curl -s -X POST http://localhost:8000/chat \
    -H 'Content-Type: application/json' \
    -d "{\"message\":\"test $RANDOM\",\"session_id\":\"bench\"}" \
    | jq '.latency_ms'
done | awk '{sum+=$1; count++} END {print "Avg:", sum/count, "ms"}'
```
