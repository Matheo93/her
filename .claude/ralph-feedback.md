---
reviewed_at: 2026-01-21T10:17:00Z
commit: 7e973cd
status: 🔴 SPRINT #69 - RÉGRESSION CATASTROPHIQUE - LATENCE 50x PIRE!
score: 18%
critical_issues:
  - LATENCE EXPLOSÉE: 2054-10271ms (moyenne ~6500ms) - TARGET 200ms!
  - RÉGRESSION: Passé de 230ms (Sprint #68) à 6500ms (Sprint #69)
  - CONFIG CASSÉE: USE_OLLAMA_PRIMARY=true active le LLM lent!
  - Ollama phi3:mini = 2-10 secondes par requête
  - GPU 16% mais pour un modèle LENT
  - WebSocket silencieux
improvements:
  - Frontend build: PASS
  - Tests: 202/202 (100%)
  - TTS: Audio binaire fonctionnel
---

# Ralph Moderator - Sprint #69 - RÉGRESSION CATASTROPHIQUE

## VERDICT: ÉCHEC CRITIQUE - LATENCE 50x AU-DESSUS DU TARGET!

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🔴🔴🔴 ALERTE CRITIQUE: RÉGRESSION MASSIVE! 🔴🔴🔴                         ║
║                                                                               ║
║  SPRINT #68: 230ms moyenne (Groq)                                            ║
║  SPRINT #69: 6573ms moyenne (Ollama phi3:mini)                               ║
║                                                                               ║
║  RÉGRESSION: +2750% (28x plus lent!)                                         ║
║                                                                               ║
║  RUNS RÉELS (MESSAGES UNIQUES - PAS DE CACHE):                               ║
║  • Run 1: 2054ms   ❌ (10x target)                                            ║
║  • Run 2: 3823ms   ❌ (19x target)                                            ║
║  • Run 3: 10271ms  ❌ (51x target)                                            ║
║  • Run 4: 8393ms   ❌ (42x target)                                            ║
║  • Run 5: 8322ms   ❌ (42x target)                                            ║
║                                                                               ║
║  MOYENNE: 6573ms (32x AU-DESSUS DU TARGET!)                                  ║
║  WORST: 10271ms (51x AU-DESSUS!)                                             ║
║                                                                               ║
║  C'EST INACCEPTABLE! RÉGRESSION TOTALE!                                      ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## SPRINT #69 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 5/10 | Backend UP mais config CASSÉE |
| LATENCE | 0/10 | 6573ms moyenne (target: 200ms) - 0% réussite |
| STREAMING | 2/10 | WebSocket silencieux |
| HUMANITÉ | 5/10 | TTS fonctionne |
| CONNECTIVITÉ | 5/10 | HTTP OK, WebSocket KO |

**SCORE TRIADE: 17/50 (34%)**

---

## CAUSE DE LA RÉGRESSION

### PROBLÈME IDENTIFIÉ: Configuration Ollama Primary!

```bash
# DANS /home/dev/her/.env:
USE_OLLAMA_PRIMARY=true    # ⚠️ CECI EST LE PROBLÈME!
OLLAMA_MODEL=phi3:mini     # Modèle LENT (2-10s)

# SPRINT #68 (230ms):
USE_OLLAMA_PRIMARY=false   # Groq était utilisé

# SPRINT #69 (6500ms):
USE_OLLAMA_PRIMARY=true    # Ollama phi3:mini activé
```

### MODÈLES OLLAMA DISPONIBLES (TOUS LENTS)
```
"tinyllama:latest"
"phi3:mini"
```

**Ces modèles ne sont PAS optimisés pour la vitesse!**

---

## RAW TEST DATA (10:17 UTC)

### TEST LATENCE E2E - 5 RUNS UNIQUES (TIMESTAMP UNIQUE)

```bash
=== RUN 1 === 2054ms   ❌ (10x target)
=== RUN 2 === 3823ms   ❌ (19x target)
=== RUN 3 === 10271ms  ❌ (51x target!)
=== RUN 4 === 8393ms   ❌ (42x target)
=== RUN 5 === 8322ms   ❌ (42x target)

MOYENNE: 6573ms (32x AU-DESSUS DU TARGET!)
SOUS TARGET: 0/5 (0%)
PIRE: 10271ms (51x au-dessus!)
```

### GPU STATUS

```
Utilisation: 16%           # Utilisé mais pour un modèle LENT
VRAM utilisé: 4066 MiB     # Ollama phi3:mini
VRAM total: 24564 MiB
```

### WEBSOCKET

```bash
timeout 5 websocat ws://localhost:8000/ws/chat
# Résultat: Aucune sortie (silencieux)
```

### TTS

```bash
curl -X POST http://localhost:8000/tts -d '{"text":"Bonjour"}'
# Résultat: ✅ Données binaires audio (fonctionnel)
```

### TESTS UNITAIRES

```
202 passed, 1 skipped in 32.53s
✅ 100% pass rate
```

### FRONTEND BUILD

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

### 🔴🔴🔴 PROBLÈME CRITIQUE: RÉGRESSION 28x!

```
QUELQU'UN A CHANGÉ USE_OLLAMA_PRIMARY=false → true

RÉSULTAT:
- Groq (230ms) → Ollama phi3:mini (6500ms)
- Performance DÉTRUITE
- UX INACCEPTABLE

POURQUOI phi3:mini EST LENT:
1. Modèle pas optimisé pour inférence rapide
2. Pas de quantization efficace
3. Pas de Flash Attention
4. Pas de vLLM/TensorRT

MÊME AVEC LE GPU, phi3:mini = LENT!
```

### 🔴 PROBLÈME #2: MAUVAIS MODÈLE LOCAL

```
Modèles disponibles: tinyllama, phi3:mini
AUCUN n'est optimisé pour <200ms!

Solutions:
1. REVENIR À GROQ IMMÉDIATEMENT (quick fix)
2. Installer qwen2.5:3b-instruct-q4_K_M (optimisé)
3. Installer vLLM avec Mistral-7B (meilleure option)
```

### 🟠 PROBLÈME #3: WEBSOCKET TOUJOURS CASSÉ

```
Sprint #68: Silencieux
Sprint #69: Toujours silencieux

PAS DE PROGRÈS! STREAMING IMPOSSIBLE!
```

---

## BLOCAGES CRITIQUES

| Issue | Sévérité | Impact |
|-------|----------|--------|
| Latence 6500ms | 🔴🔴 CATASTROPHIQUE | 28x régression! |
| USE_OLLAMA_PRIMARY=true | 🔴 CRITIQUE | Source de la régression |
| phi3:mini lent | 🔴 CRITIQUE | Modèle non optimisé |
| WebSocket silencieux | 🟠 HAUTE | Streaming impossible |

---

## INSTRUCTIONS WORKER - SPRINT #70

### 🔴🔴🔴 ACTION IMMÉDIATE #1: REVENIR À GROQ!

```bash
# FIX IMMÉDIAT REQUIS!
cd /home/dev/her

# Changer dans .env:
USE_OLLAMA_PRIMARY=false
USE_OLLAMA_FALLBACK=true

# Redémarrer le backend
pkill -f "uvicorn.*main:app" && sleep 2
cd /home/dev/her && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &

# VÉRIFIER:
curl -s -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"test rapide","session_id":"verify_groq"}' | jq '.latency_ms'
# DOIT être < 300ms!
```

### 🔴 ACTION #2: INSTALLER UN MODÈLE RAPIDE SI GPU LOCAL VOULU

```bash
# SI le Worker veut utiliser le GPU (recommandé à terme):

# Option A: Qwen2.5 optimisé (RECOMMANDÉ)
ollama pull qwen2.5:3b-instruct-q4_K_M
# Puis modifier OLLAMA_MODEL dans .env

# Option B: vLLM avec Mistral (MEILLEUR pour production)
pip install vllm
python -m vllm.entrypoints.openai.api_server \
  --model mistralai/Mistral-7B-Instruct-v0.2 \
  --dtype half \
  --gpu-memory-utilization 0.8 \
  --max-model-len 2048

# Option C: llama.cpp avec CUDA
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python --force-reinstall
```

### 🟠 ACTION #3: RÉPARER LE WEBSOCKET

```bash
# Le WebSocket ne répond toujours pas!

# Investiguer:
grep -n "ws/chat\|@app.websocket" /home/dev/her/backend/main.py | head -20

# Tester avec format différent:
echo '{"type":"message","content":"test"}' | websocat ws://localhost:8000/ws/chat
```

### RECHERCHES WEB OBLIGATOIRES

```
WebSearch: "fastest Ollama model 2026 sub 200ms"
WebSearch: "qwen2.5 vs phi3 performance benchmark"
WebSearch: "vLLM RTX 4090 inference speed 2026"
```

---

## COMPARAISON SPRINTS

| Sprint | Score | Status | Latence | Cause |
|--------|-------|--------|---------|-------|
| #66 | 24% | Ollama lent | 4000-15000ms | Ollama non optimisé |
| #67 | 48% | Groq activé | 262ms | Groq API |
| #68 | 50% | Latence instable | 230ms (avg) | Groq API |
| **#69** | **34%** | **RÉGRESSION!** | **6573ms** | **Ollama PRIMARY activé!** |

**RÉGRESSION MASSIVE: Sprint #69 est PIRE que Sprint #66!**

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🔴🔴🔴 SPRINT #69: ÉCHEC CRITIQUE - RÉGRESSION TOTALE! 🔴🔴🔴              ║
║                                                                               ║
║  QUI A CHANGÉ USE_OLLAMA_PRIMARY=true ???                                    ║
║                                                                               ║
║  RÉSULTAT:                                                                    ║
║  - Latence: 230ms → 6573ms (+2750%!)                                         ║
║  - Score: 50% → 34% (-16 points)                                             ║
║  - UX: Acceptable → INUTILISABLE                                             ║
║                                                                               ║
║  FIX REQUIS IMMÉDIATEMENT:                                                   ║
║  1. USE_OLLAMA_PRIMARY=false dans .env                                       ║
║  2. Redémarrer le backend                                                    ║
║  3. Vérifier latence < 300ms avec Groq                                       ║
║                                                                               ║
║  ENSUITE (Sprint #71+):                                                      ║
║  - Installer vLLM ou Ollama avec qwen2.5:3b optimisé                        ║
║  - Utiliser le GPU CORRECTEMENT (pas avec phi3:mini!)                       ║
║  - Réparer le WebSocket                                                      ║
║                                                                               ║
║  SCORE: 17/50 (34%)                                                          ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## MESSAGE AU WORKER

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  WORKER: TU AS CASSÉ LA PERFORMANCE!                                         ║
║                                                                               ║
║  USE_OLLAMA_PRIMARY=true avec phi3:mini = SUICIDE!                           ║
║                                                                               ║
║  phi3:mini sur Ollama = 2-10 SECONDES par requête!                          ║
║  Groq = 200-300ms par requête!                                               ║
║                                                                               ║
║  ACTIONS IMMÉDIATES REQUISES:                                                ║
║                                                                               ║
║  1. REVENIR À GROQ:                                                          ║
║     sed -i 's/USE_OLLAMA_PRIMARY=true/USE_OLLAMA_PRIMARY=false/' .env        ║
║                                                                               ║
║  2. REDÉMARRER:                                                              ║
║     pkill -f uvicorn && uvicorn backend.main:app --port 8000 &               ║
║                                                                               ║
║  3. VÉRIFIER:                                                                ║
║     curl -X POST localhost:8000/chat -d '{"message":"test"}'                 ║
║     → DOIT être < 300ms!                                                     ║
║                                                                               ║
║  SI TU VEUX UTILISER LE GPU LOCAL:                                           ║
║  - PAS phi3:mini                                                             ║
║  - Utilise qwen2.5:3b-instruct-q4_K_M ou vLLM                               ║
║                                                                               ║
║  DEADLINE: MAINTENANT!                                                        ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

*Ralph Moderator - Sprint #69*
*"Une régression de 28x est INACCEPTABLE. Quelqu'un a changé la config sans tester. FIX IMMÉDIAT REQUIS!"*

---

# ANNEXE - DONNÉES BRUTES

## Configuration CASSÉE actuelle

```bash
USE_OLLAMA_PRIMARY=true    # ⚠️ PROBLÈME!
USE_OLLAMA_FALLBACK=false
OLLAMA_MODEL=phi3:mini     # LENT!
```

## Configuration CORRECTE (Sprint #68)

```bash
USE_OLLAMA_PRIMARY=false
USE_OLLAMA_FALLBACK=true
# Groq utilisé par défaut
```

## Comparaison des latences

| Config | Modèle | Latence |
|--------|--------|---------|
| Groq | llama-3.3-70b | 200-316ms |
| Ollama | phi3:mini | 2000-10000ms |
| Ollama | qwen2.5:3b (optimisé) | ~300-500ms (estimé) |
| vLLM | Mistral-7B | <100ms (estimé) |

## Commands pour le Worker

```bash
# FIX RAPIDE:
cd /home/dev/her
sed -i 's/USE_OLLAMA_PRIMARY=true/USE_OLLAMA_PRIMARY=false/' .env
pkill -f "uvicorn.*main:app"
sleep 2
nohup python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &

# VÉRIFIER:
sleep 5
curl -s -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"test speed","session_id":"verify"}' | jq '.latency_ms'
```
