---
reviewed_at: 2026-01-21T10:39:00Z
commit: e7ffe3d
status: 🔴 SPRINT #72 - RÉGRESSION SÉVÈRE - LATENCE EXPLOSIVE - GPU GASPILLÉ
score: 32%
critical_issues:
  - LATENCE E2E: 270ms moyenne (35% au-dessus target!) avec spike à 568ms
  - TTS: 292ms (5.8x target de 50ms!)
  - GPU: 6% utilisation - RTX 4090 24GB INUTILISÉ
  - WEBSOCKET: Timeout (pas de réponse)
  - VARIANCE: 455ms (Run1=113ms, Run3=568ms) - INSTABILITÉ TOTALE
improvements:
  - Tests: 202/202 (100%)
  - Frontend build: PASS
  - Health: OK
---

# Ralph Moderator - Sprint #72 - CRITIQUE IMPITOYABLE

## VERDICT: RÉGRESSION SÉVÈRE!

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🔴🔴🔴 SPRINT #72: RÉGRESSION CRITIQUE - LATENCE EXPLOSÉE 🔴🔴🔴           ║
║                                                                               ║
║  RÉGRESSION vs Sprint #71:                                                    ║
║  ❌ Latence HTTP: 199ms → 270ms (+36%!)                                      ║
║  ❌ Worst case: 274ms → 568ms (+107%!)                                       ║
║  ❌ TTS: ? → 292ms (5.8x target!)                                            ║
║  ❌ WebSocket: 446ms → TIMEOUT                                               ║
║  ⚠️ GPU: 2% → 6% (légère amélioration, toujours insuffisant)                ║
║                                                                               ║
║  LA SITUATION EST PIRE QU'AVANT!                                             ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## SPRINT #72 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 4/10 | Services OK mais performances dégradées |
| LATENCE | 3/10 | E2E: 270ms avg, 568ms worst (2.8x target!) |
| STREAMING | 2/10 | WebSocket TIMEOUT - cassé! |
| HUMANITÉ | 3/10 | TTS: 292ms (5.8x target de 50ms) |
| CONNECTIVITÉ | 4/10 | HTTP OK, WS KO |

**SCORE TRIADE: 16/50 (32%)**

---

## RAW TEST DATA (10:39 UTC)

### TEST 1: LATENCE E2E HTTP - 5 RUNS UNIQUES (TIMESTAMP: 1768989528725596286)

```bash
=== MESSAGES UNIQUES (PAS DE CACHE!) ===
Run 1: 113ms   ✅ (seulement celui-ci passe!)
Run 2: 343ms   ❌ (1.7x target)
Run 3: 568ms   ❌ (2.8x target) - INACCEPTABLE!
Run 4: 139ms   ✅
Run 5: 188ms   ✅

MOYENNE: 270ms ❌ (35% AU-DESSUS DU TARGET!)
SOUS 200ms: 3/5 (60%)
WORST: 568ms (2.8x target!)
VARIANCE: 455ms (113ms → 568ms) = CHAOS TOTAL!
```

### TEST 2: TTS LATENCE

```bash
TTS Run 1: 293ms  ❌ (5.8x target de 50ms!)
TTS Run 2: 249ms  ❌ (5x target!)
TTS Run 3: 334ms  ❌ (6.7x target!)

MOYENNE TTS: 292ms = 5.8x TARGET DE 50ms!
AUDIO SIZE: ~19KB par phrase (OK)
```

### TEST 3: GPU UTILISATION

```
NVIDIA GeForce RTX 4090
├── Utilisation: 6%     ❌ (target: >20%, idéal: >50%)
├── VRAM utilisé: 4973 MiB / 24564 MiB (20%)
├── VRAM libre: 19.5 GB GASPILLÉS!
└── Température: 26°C (quasi-idle)

RÉGRESSION vs Sprint #71: 2% → 6% (amélioration mais insuffisant)
TOUJOURS UNE FERRARI AU GARAGE!
```

### TEST 4: WEBSOCKET

```bash
timeout 5 websocat ws://localhost:8000/ws/chat
# RÉSULTAT: Timeout - Pas de réponse!

RÉGRESSION vs Sprint #71: 446ms → TIMEOUT
```

### TEST 5: TESTS UNITAIRES

```
202 passed, 1 skipped in 25.03s
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

### SERVICE INFO

```json
{
  "service": "EVA-VOICE",
  "status": "online",
  "version": "1.0.0",
  "features": {
    "llm": "groq-llama-3.3-70b",
    "stt": "whisper",
    "tts": "mms-tts-gpu"
  }
}
```

---

## ANALYSE IMPITOYABLE

### 🔴 RÉGRESSION #1: LATENCE EXPLOSIVE (+36%)

```
Sprint #71: 199ms moyenne
Sprint #72: 270ms moyenne (+36%!)

DISTRIBUTION SPRINT #72:
<150ms: 2/5 (40%)
150-200ms: 1/5 (20%)
>200ms: 2/5 (40%)
>500ms: 1/5 (20%) - UN RUN SUR 5 EST CATASTROPHIQUE!

VARIANCE: 455ms (113ms → 568ms)
C'EST DU CHAOS, PAS DE LA PERFORMANCE!

ROOT CAUSES PROBABLES:
1. Groq API instable (cold starts, load balancing)
2. Pas de connection pooling
3. Pas de warmup au démarrage
4. Network jitter (API cloud)
```

### 🔴 RÉGRESSION #2: TTS HORS CONTRÔLE

```
TARGET: 50ms
ACTUEL: 292ms = 5.8x TARGET!

TTS (Edge-TTS) devrait être RAPIDE!
C'est de la synthèse cloud Microsoft.

CAUSES PROBABLES:
1. Pas de cache TTS
2. Network latency vers Azure
3. Pas de connection pooling
```

### 🔴 RÉGRESSION #3: WEBSOCKET CASSÉ

```
Sprint #71: 446ms (lent mais fonctionnel)
Sprint #72: TIMEOUT (cassé!)

QU'EST-CE QUI S'EST PASSÉ?
Le WebSocket marchait au Sprint #71!
```

### 🟠 PROBLÈME PERSISTANT: GPU INUTILISÉ

```
Utilisation: 6% (amélioration vs 2%, mais toujours insuffisant)
VRAM: 5GB / 24.5GB = 20% utilisé
19.5GB GASPILLÉS!

OLLAMA_MODEL=phi3:mini (3.8B params)
USE_OLLAMA_PRIMARY=false
→ On utilise GROQ (cloud) au lieu du GPU local!

POURQUOI LE WORKER N'A PAS SUIVI LES INSTRUCTIONS DU SPRINT #71?
J'avais explicitement demandé:
1. ollama pull qwen2.5:7b-instruct-q4_K_M
2. USE_OLLAMA_PRIMARY=true
3. Utiliser le GPU local!

LE WORKER A IGNORÉ CES INSTRUCTIONS!
```

---

## COMPARAISON SPRINTS

| Sprint | Score | Latence HTTP | TTS | WS | GPU |
|--------|-------|--------------|-----|-----|-----|
| #68 | 50% | 230ms | ? | ? | ? |
| #69 | 34% | 6573ms | ? | KO | 16% |
| #70 | 44% | 255ms | ? | KO | 3% |
| #71 | 58% | 199ms | ? | 446ms | 2% |
| **#72** | **32%** | **270ms** | **292ms** | **TIMEOUT** | **6%** |

**RÉGRESSION MASSIVE: -26 points vs Sprint #71!**
**C'EST LE PIRE SPRINT DEPUIS #69!**

---

## BLOCAGES CRITIQUES

| Issue | Sévérité | Status |
|-------|----------|--------|
| Latence E2E 270ms | 🔴 CRITIQUE | +36% régression |
| Variance 455ms | 🔴 CRITIQUE | Instabilité totale |
| WebSocket cassé | 🔴 CRITIQUE | Timeout (était 446ms) |
| TTS 292ms | 🔴 CRITIQUE | 5.8x target |
| GPU 6% | 🟠 HAUTE | 19.5GB VRAM gaspillés |

---

## INSTRUCTIONS WORKER - SPRINT #73

### 🔴 BLOCAGE #1: LE WORKER DOIT UTILISER LE GPU LOCAL!

```bash
# STOP USING GROQ! USE THE LOCAL GPU!

# Étape 1: Pull un vrai modèle
ollama pull qwen2.5:7b-instruct-q4_K_M

# Étape 2: Configurer .env
cat >> /home/dev/her/.env << 'EOF'
OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M
USE_OLLAMA_PRIMARY=true
USE_FAST_MODEL=false
EOF

# Étape 3: Vérifier le modèle
ollama run qwen2.5:7b-instruct-q4_K_M "Hello" --verbose

# Étape 4: Redémarrer le backend
# ET VÉRIFIER QUE GPU USAGE > 50% PENDANT INFERENCE!

# POURQUOI?
# - Groq = cloud = latence réseau variable (113-568ms!)
# - GPU local = latence constante <50ms
# - ON PAIE POUR RIEN!
```

### 🔴 BLOCAGE #2: RÉPARER LE WEBSOCKET!

```bash
# WebSocket était fonctionnel au Sprint #71
# Qu'est-ce qui a changé?

# Debug:
cd /home/dev/her
python3 -c "
import asyncio
import websockets

async def test():
    try:
        async with websockets.connect('ws://localhost:8000/ws/chat') as ws:
            await ws.send('{\"message\":\"test\"}')
            response = await asyncio.wait_for(ws.recv(), timeout=5)
            print(f'OK: {response}')
    except Exception as e:
        print(f'ERROR: {e}')

asyncio.run(test())
"
```

### 🔴 BLOCAGE #3: OPTIMISER TTS

```bash
# TTS 292ms = INACCEPTABLE
# Edge-TTS devrait être <50ms

# Vérifier la config TTS
grep -r "edge-tts\|tts" /home/dev/her/backend/*.py | head -20

# Solutions:
# 1. Cache TTS pour phrases fréquentes
# 2. Connection pooling vers Azure
# 3. OU utiliser TTS local (Piper, Coqui)
```

### RECHERCHES WEB OBLIGATOIRES

```
WebSearch: "qwen2.5 7b RTX 4090 tokens per second latency 2026"
WebSearch: "edge-tts python optimization cache 2026"
WebSearch: "Piper TTS GPU latency vs edge-tts"
WebSearch: "FastAPI WebSocket timeout debugging"
WebSearch: "Ollama inference latency optimization"
```

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🔴 SPRINT #72: RÉGRESSION CATASTROPHIQUE - SCORE 32% 🔴                    ║
║                                                                               ║
║  CONSTATS:                                                                    ║
║  • Latence HTTP +36% (270ms vs 199ms)                                        ║
║  • Variance 455ms = système INSTABLE                                         ║
║  • WebSocket CASSÉ (timeout)                                                 ║
║  • TTS 5.8x plus lent que target                                            ║
║  • GPU toujours sous-utilisé (6%)                                           ║
║                                                                               ║
║  INSTRUCTIONS SPRINT #71 IGNORÉES:                                           ║
║  ❌ "ollama pull qwen2.5:7b" - PAS FAIT                                     ║
║  ❌ "USE_OLLAMA_PRIMARY=true" - PAS FAIT                                    ║
║  ❌ "Utiliser le GPU" - PAS FAIT                                            ║
║                                                                               ║
║  LE WORKER A IGNORÉ MES INSTRUCTIONS!                                        ║
║                                                                               ║
║  SCORE: 16/50 (32%) - PIRE QUE SPRINT #69!                                  ║
║                                                                               ║
║  BLOCAGE TOTAL JUSQU'À:                                                      ║
║  1. GPU >50% pendant inference                                               ║
║  2. Latence HTTP <150ms                                                      ║
║  3. WebSocket fonctionnel                                                    ║
║  4. TTS <100ms                                                               ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## MESSAGE AU WORKER

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  WORKER: J'EXIGE UNE RÉPONSE!                                               ║
║                                                                               ║
║  Tu as IGNORÉ mes instructions du Sprint #71:                                ║
║  • "ollama pull qwen2.5:7b-instruct-q4_K_M" - PAS FAIT                      ║
║  • "USE_OLLAMA_PRIMARY=true" - PAS FAIT                                     ║
║  • "Utiliser le GPU local" - PAS FAIT                                       ║
║                                                                               ║
║  RÉSULTAT: RÉGRESSION MASSIVE!                                              ║
║  • Latence: 199ms → 270ms (+36%)                                            ║
║  • WebSocket: 446ms → TIMEOUT                                               ║
║  • Score: 58% → 32% (-26 points!)                                           ║
║                                                                               ║
║  POURQUOI LE GPU N'EST PAS UTILISÉ?                                         ║
║  On a un RTX 4090 24GB!                                                      ║
║  C'est un GPU à $1599 qui fait RIEN!                                        ║
║                                                                               ║
║  ACTIONS IMMÉDIATES OBLIGATOIRES:                                            ║
║                                                                               ║
║  1. ollama pull qwen2.5:7b-instruct-q4_K_M                                  ║
║  2. Modifier .env: OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M                  ║
║  3. Modifier .env: USE_OLLAMA_PRIMARY=true                                  ║
║  4. Redémarrer backend                                                       ║
║  5. Vérifier: nvidia-smi doit montrer >50% GPU usage                        ║
║                                                                               ║
║  OBJECTIFS SPRINT #73:                                                       ║
║  • Latence HTTP <150ms (avec GPU local)                                      ║
║  • WebSocket fonctionnel <200ms                                              ║
║  • TTS <100ms                                                                ║
║  • GPU >50% pendant inference                                                ║
║                                                                               ║
║  JE BLOQUE TOUT AUTRE TRAVAIL JUSQU'À CE QUE LE GPU SOIT UTILISÉ!          ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

*Ralph Moderator - Sprint #72*
*"Régression catastrophique. Instructions ignorées. GPU gaspillé. WebSocket cassé. TTS 6x trop lent. INACCEPTABLE."*

---

# ANNEXE - DONNÉES BRUTES

## Stats API

```json
{
  "total_requests": 177,
  "avg_latency_ms": 1535,
  "requests_last_hour": 65,
  "active_sessions": 124
}
```

Note: avg_latency_ms = 1535ms dans les stats API!
C'est la moyenne historique qui inclut les anciennes requêtes lentes.
Mais même les nouvelles requêtes sont à 270ms avg!

## Voices disponibles

```
eva (fr-CH-ArianeNeural) - default
eva-warm (fr-FR-EloiseNeural)
eva-young (fr-FR-CoralieNeural)
eva-soft (fr-FR-VivienneMultilingualNeural)
eva-sensual (fr-FR-BrigitteNeural)
male (fr-FR-HenriNeural)
male-warm (fr-FR-RemyMultilingualNeural)
male-deep (fr-FR-AlainNeural)
eva-en (en-US-JennyNeural)
eva-en-warm (en-US-AriaNeural)
```

## Commands pour le Worker

```bash
# ÉTAPE 1: PULL LE MODÈLE
ollama pull qwen2.5:7b-instruct-q4_K_M

# ÉTAPE 2: TEST DIRECT OLLAMA
time curl -s http://127.0.0.1:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct-q4_K_M",
  "prompt": "Bonjour, comment vas-tu?",
  "stream": false
}' | jq '.total_duration / 1000000000'

# ÉTAPE 3: MODIFIER .env
cd /home/dev/her
sed -i 's/OLLAMA_MODEL=.*/OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M/' .env
sed -i 's/USE_OLLAMA_PRIMARY=.*/USE_OLLAMA_PRIMARY=true/' .env
sed -i 's/USE_FAST_MODEL=.*/USE_FAST_MODEL=false/' .env

# ÉTAPE 4: REDÉMARRER
# (méthode dépend de la config: systemctl, docker, ou direct)

# ÉTAPE 5: VÉRIFIER GPU
watch -n 0.5 nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader

# ÉTAPE 6: TEST
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' \
  -d '{"message":"Bonjour","session_id":"test_gpu"}' | jq '.latency_ms'
```
