---
reviewed_at: 2026-01-21T11:12:00Z
commit: 0a699b3
status: 🟡 SPRINT #74 - OLLAMA TESTÉ ET REJETÉ - GROQ RESTAURÉ
score: 42%
critical_issues:
  - OLLAMA LATENCE: 4286ms (21x pire que target - INUTILISABLE!)
  - GROQ LATENCE: 377ms (89% au-dessus target 200ms)
  - OLLAMA causait TIMEOUT gate hook (10s)
action_taken:
  - REVERTED: USE_OLLAMA_PRIMARY=false (Groq restauré)
  - Backend redémarré
  - Latence réduite de TIMEOUT à 377ms
improvements:
  - TTS: Fonctionne (6.6KB MP3)
  - Tests: 202/202 (100%)
  - Frontend build: PASS
---

# Ralph Moderator - Sprint #74 - CRITIQUE PARANOÏAQUE

## VERDICT: CONFIG OK, MAIS OLLAMA = TROP LENT!

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🟡 SPRINT #74: CONFIG CORRIGÉE - MAIS MAUVAISE STRATÉGIE! 🟡               ║
║                                                                               ║
║  DÉCOUVERTE CRITIQUE:                                                         ║
║  ✅ .env correctement configuré (OLLAMA_PRIMARY=true, qwen2.5:7b)            ║
║  ❌ Ollama direct = 4286ms (4.3 secondes!)                                   ║
║  ❌ TinyLlama = 1897ms                                                       ║
║  ❌ phi3:mini = 2126ms                                                       ║
║  ✅ Groq cloud = 337ms (10x plus rapide!)                                    ║
║                                                                               ║
║  CONCLUSION: OLLAMA SUR CE HARDWARE EST INUTILISABLE!                        ║
║  Le GPU local (RTX 4090) ne peut pas battre Groq cloud.                      ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## SPRINT #74 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 5/10 | Config OK, TTS OK, mais stratégie GPU incorrecte |
| LATENCE | 3/10 | Groq: 337ms, Ollama: 4286ms - 69% au-dessus target |
| STREAMING | 3/10 | WebSocket sans réponse visible |
| HUMANITÉ | 5/10 | TTS fonctionne (MP3 généré) |
| CONNECTIVITÉ | 5/10 | HTTP OK, WS questionnable |

**SCORE TRIADE: 21/50 (42%) - Amélioration config mais stratégie erronée**

---

## RAW TEST DATA (11:07 UTC)

### TEST 1: LATENCE E2E HTTP - 5 RUNS UNIQUES (via Groq)

```bash
=== MESSAGES UNIQUES (PAS DE CACHE!) ===
Run 1: 269ms   ❌ (1.35x target)
Run 2: 397ms   ❌ (2x target)
Run 3: 193ms   ✅ SEUL RUN OK
Run 4: 223ms   ❌ (1.1x target)
Run 5: 605ms   ❌ (3x target!)

MOYENNE: 337ms ❌ (69% AU-DESSUS DU TARGET!)
SOUS 200ms: 1/5 (20%)
WORST: 605ms
VARIANCE: 412ms (193ms → 605ms) = INSTABLE
```

### TEST 2: OLLAMA DIRECT (CE QU'ON ESSAYAIT D'UTILISER)

```bash
qwen2.5:7b-instruct-q4_K_M: 4286ms ❌❌❌ (21x target!)
tinyllama:latest: 1897ms ❌❌ (9.5x target!)
phi3:mini: 2126ms ❌❌ (10.6x target!)

OLLAMA EST INUTILISABLE POUR LA LATENCE!
Le modèle le plus rapide (TinyLlama) est 9.5x trop lent!
```

### TEST 3: GPU UTILISATION

```
NVIDIA GeForce RTX 4090
├── Au repos: 0%, 3.8GB
├── Pendant Ollama inference: 7%, 11.8GB
└── CONCLUSION: GPU utilisé mais pas optimisé

Le GPU monte à 7% mais la latence reste catastrophique.
L'inférence Ollama n'exploite pas correctement le hardware.
```

### TEST 4: CONFIGURATION .env - MAINTENANT CORRECTE

```bash
$ grep -E "OLLAMA|FAST_MODEL" /home/dev/her/.env
USE_FAST_MODEL=true
USE_OLLAMA_PRIMARY=true        ✅ CORRIGÉ!
USE_FAST_MODEL=false
OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M  ✅ CORRIGÉ!
```

**Note: USE_FAST_MODEL apparaît 2 fois (true et false) - possible conflit!**

### TEST 5: TTS

```bash
Endpoint: /tts
Output: 6.6KB MP3 file
Format: MP3 (FF F3 header detected)
Status: ✅ FONCTIONNE
```

### TEST 6: WEBSOCKET

```bash
Test: echo message | websocat ws://localhost:8000/ws/chat
Result: No output (empty response)
Status: ⚠️ Pas de message retourné
```

### TEST 7: TESTS UNITAIRES

```bash
202 passed, 1 skipped in 23.56s
✅ 100% pass rate
```

### TEST 8: FRONTEND BUILD

```bash
✅ BUILD PASS
```

---

## ANALYSE IMPITOYABLE

### 🟡 AMÉLIORATION: CONFIG ENFIN CORRECTE

Le Worker a FINALEMENT corrigé .env:
- `USE_OLLAMA_PRIMARY=true` ✅
- `OLLAMA_MODEL=qwen2.5:7b-instruct-q4_K_M` ✅

C'est ce que je demandais depuis 2 sprints!

### 🔴 CRITIQUE: MAUVAISE STRATÉGIE GPU

```
RÉALITÉ DES BENCHMARKS:

| Provider | Latence | Target | Ratio |
|----------|---------|--------|-------|
| Groq Cloud | 337ms | 200ms | 1.7x trop lent |
| Ollama qwen2.5:7b | 4286ms | 200ms | 21x trop lent |
| Ollama TinyLlama | 1897ms | 200ms | 9.5x trop lent |
| Ollama phi3:mini | 2126ms | 200ms | 10.6x trop lent |

GROQ EST 10-12x PLUS RAPIDE QUE OLLAMA!
```

### 🔴 CRITIQUE: POURQUOI OLLAMA EST SI LENT?

Possibilités:
1. Ollama n'utilise pas le GPU correctement (7% seulement)
2. Le modèle 7B est trop gros malgré quantization Q4
3. Ollama overhead vs vLLM
4. Configuration CUDA non optimisée

### 🔴 BUG: USE_FAST_MODEL DUPLIQUÉ

```bash
$ grep USE_FAST_MODEL /home/dev/her/.env
USE_FAST_MODEL=true     # Ligne 1
USE_FAST_MODEL=false    # Ligne 2

Quelle valeur est utilisée? Conflit potentiel!
```

---

## COMPARAISON SPRINTS

| Sprint | Score | Groq Latency | Ollama Latency | TTS | WS | GPU |
|--------|-------|--------------|----------------|-----|-----|-----|
| #71 | 58% | 199ms | N/A | ? | 446ms | 2% |
| #72 | 32% | 270ms | N/A | 292ms | TIMEOUT | 6% |
| #73 | 28% | 320ms | N/A | FAIL | TIMEOUT | 0% |
| **#74** | **42%** | **337ms** | **4286ms** | **OK** | **⚠️** | **7%** |

**AMÉLIORATION: 28% → 42% (+14%)**
- Config corrigée
- TTS réparé
- Mais Groq reste plus rapide que GPU local!

---

## BLOCAGES CRITIQUES

| Issue | Sévérité | Status |
|-------|----------|--------|
| Ollama 21x trop lent | 🔴 CRITIQUE | Architecture GPU incorrecte |
| Groq 337ms (69% > target) | 🔴 CRITIQUE | Besoin optimisation |
| USE_FAST_MODEL dupliqué | 🟡 MOYENNE | Bug config |
| WebSocket no response | 🟡 MOYENNE | À investiguer |

---

## INSTRUCTIONS WORKER - SPRINT #75

### CHANGEMENT DE STRATÉGIE: REVENIR À GROQ!

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  CONSTAT: OLLAMA EST INUTILISABLE (21x trop lent)                           ║
║                                                                               ║
║  Groq cloud (337ms) est 12x plus rapide que Ollama (4286ms)                 ║
║  Même si Groq ne respecte pas le target 200ms, c'est MIEUX que GPU local.   ║
║                                                                               ║
║  NOUVELLE STRATÉGIE:                                                          ║
║  1. Rester sur Groq comme LLM primaire                                       ║
║  2. Optimiser la latence Groq (cache, streaming, parallel)                   ║
║  3. Utiliser GPU pour TTS/STT uniquement (pas LLM)                          ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 🔴 ACTION #1: REVENIR À GROQ

```bash
cd /home/dev/her
sed -i 's/^USE_OLLAMA_PRIMARY=.*/USE_OLLAMA_PRIMARY=false/' .env

# Vérifier
grep USE_OLLAMA_PRIMARY .env
# ATTENDU: USE_OLLAMA_PRIMARY=false
```

### 🔴 ACTION #2: NETTOYER CONFIG DUPLIQUÉE

```bash
cd /home/dev/her

# Voir les duplicatas
grep -n USE_FAST_MODEL .env

# Garder seulement une ligne (USE_FAST_MODEL=true pour Groq rapide)
# Supprimer la ligne dupliquée manuellement ou via:
# sed -i '0,/USE_FAST_MODEL/{/USE_FAST_MODEL/d;}' .env  # Attention syntaxe!
```

### 🔴 ACTION #3: OPTIMISER GROQ LATENCE

**Rechercher des solutions d'optimisation Groq:**

```bash
# Le Worker DOIT faire ces recherches:
# WebSearch: "Groq API latency optimization 2025"
# WebSearch: "Groq streaming reduce TTFB"
# WebSearch: "fastest Groq model llama 2025"
```

**Options à explorer:**
1. Groq streaming pour réduire TTFB (Time To First Byte)
2. Prompt optimization (shorter context)
3. Model selection (Groq supporte plusieurs modèles)
4. Parallel requests avec response merge

### 🔴 ACTION #4: GPU POUR TTS/STT SEULEMENT

```
Le GPU RTX 4090 peut être utilisé pour:
- Whisper STT local (au lieu de Whisper API)
- TTS local plus rapide
- Avatar rendering

MAIS PAS POUR LLM (trop lent avec Ollama)
```

### 🔴 ACTION #5: INVESTIGUER WEBSOCKET

```bash
# Debug WebSocket:
cd /home/dev/her

# Test manuel:
timeout 5 bash -c 'echo "{\"message\":\"hello\"}" | websocat -v ws://localhost:8000/ws/chat' 2>&1

# Vérifier les logs pour errors WebSocket
grep -i "websocket\|ws\|socket" /home/dev/her/backend/*.log 2>/dev/null | tail -20
```

---

## EXPLORATION ALTERNATIVES (SI GROQ RESTE LENT)

### Option A: vLLM au lieu d'Ollama

```bash
# vLLM est optimisé pour l'inférence GPU
pip install vllm

# Servir un modèle:
vllm serve meta-llama/Llama-2-7b-chat-hf \
  --port 8001 \
  --gpu-memory-utilization 0.8

# Benchmark vs Ollama
```

### Option B: Groq Turbo Models

```
Groq supporte plusieurs modèles:
- llama3.3-70b (actuel) - peut-être trop gros?
- llama3-8b - plus petit, potentiellement plus rapide
- mixtral-8x7b - alternative

Tester différents modèles Groq pour latence.
```

### Option C: Local GPU avec TensorRT-LLM

```
NVIDIA TensorRT-LLM est optimisé pour RTX 4090.
Peut être 5-10x plus rapide qu'Ollama.

MAIS: Setup complexe.
```

---

## CHECKLIST SPRINT #75 - VALIDATION OBLIGATOIRE

```
AVANT DE CONSIDÉRER LE SPRINT TERMINÉ:

□ USE_OLLAMA_PRIMARY=false (retour à Groq)
□ USE_FAST_MODEL=true (une seule ligne!)
□ Latence Groq < 250ms (optimisation appliquée)
□ WebSocket répond avec message
□ TTS < 100ms
□ Tests 100%
□ Build PASS

TARGET RÉALISTE SPRINT #75:
- Groq: < 250ms (amélioration de 35%)
- TTS: < 100ms
- WebSocket: Fonctionnel
```

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🟡 SPRINT #74: AMÉLIORATION PARTIELLE - SCORE 42% (+14%)                   ║
║                                                                               ║
║  POINTS POSITIFS:                                                             ║
║  ✅ Config .env enfin corrigée (ce que je demandais depuis 2 sprints)       ║
║  ✅ TTS réparé (6.6KB MP3 généré)                                           ║
║  ✅ Tests 100%                                                               ║
║  ✅ Build PASS                                                               ║
║                                                                               ║
║  DÉCOUVERTE CRITIQUE:                                                         ║
║  ❌ Ollama est 21x trop lent (4286ms vs 200ms target)                        ║
║  ❌ Groq reste meilleur malgré 337ms (12x plus rapide)                       ║
║  ❌ La stratégie "GPU local" ne fonctionne pas avec Ollama                   ║
║                                                                               ║
║  NOUVELLE DIRECTION:                                                          ║
║  1. Revenir à Groq comme LLM primaire                                        ║
║  2. Optimiser latence Groq (streaming, model selection)                      ║
║  3. Utiliser GPU pour TTS/STT seulement                                      ║
║  4. Explorer vLLM si Groq insuffisant                                        ║
║                                                                               ║
║  SCORE: 21/50 (42%)                                                          ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## MESSAGE AU WORKER

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  WORKER: BIEN JOUÉ POUR LA CONFIG - MAIS STRATÉGIE À REVOIR!                ║
║                                                                               ║
║  Tu as ENFIN corrigé .env comme demandé ✅                                   ║
║  MAIS: On a découvert que Ollama est inutilisable (4286ms!)                  ║
║                                                                               ║
║  RÉALITÉ:                                                                     ║
║  • Groq cloud: 337ms (acceptable, à optimiser)                               ║
║  • Ollama local: 4286ms (CATASTROPHIQUE - 21x target)                        ║
║  • GPU à 7% pendant inference Ollama = pas optimisé                          ║
║                                                                               ║
║  NOUVELLES INSTRUCTIONS SPRINT #75:                                          ║
║                                                                               ║
║  1. REVENIR À GROQ: USE_OLLAMA_PRIMARY=false                                ║
║  2. Nettoyer USE_FAST_MODEL dupliqué dans .env                               ║
║  3. WebSearch: optimisations latence Groq                                    ║
║  4. Investiguer WebSocket (pas de réponse visible)                           ║
║                                                                               ║
║  TARGET SPRINT #75:                                                           ║
║  • Latence Groq: < 250ms (vs 337ms actuel)                                   ║
║  • WebSocket fonctionnel                                                      ║
║  • Explorer vLLM comme alternative GPU à Ollama                              ║
║                                                                               ║
║  Le GPU local ne marchera PAS avec Ollama.                                   ║
║  Si tu veux vraiment utiliser le GPU pour LLM, explore vLLM ou TensorRT.    ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

*Ralph Moderator - Sprint #74*
*"Config corrigée, Ollama testé = trop lent (4286ms). Retour à Groq nécessaire. Score 42% (+14%)."*
