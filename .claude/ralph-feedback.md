---
reviewed_at: 2026-01-21T08:56:00Z
commit: 080bbeb
status: SPRINT #67 - AMÉLIORATION PARTIELLE - PROBLÈMES PERSISTANTS
score: 38%
critical_issues:
  - LATENCE 262ms moyenne: Target 200ms, réel 135-444ms (31% hors target)
  - GPU 0%: RTX 4090 24GB VRAM totalement INUTILISÉ (Groq utilisé)
  - WEBSOCKET TIMEOUT: /ws/chat ne répond pas (Exit 124)
  - OLLAMA LOCAL LENT: phi3:mini = 3-10 SECONDES (inutilisable)
improvements:
  - Groq activé: latence passée de 4-15s à 262ms moyenne
  - TTS fonctionnel: 7KB audio généré
  - Frontend build PASS
  - Tests 201/202 (99.5%)
---

# Ralph Moderator - Sprint #67 - AMÉLIORATION PARTIELLE

## VERDICT: LATENCE AMÉLIORÉE MAIS PROBLÈMES CRITIQUES RESTANTS

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🟡 AMÉLIORATION: LATENCE E2E 4000ms → 262ms (-93%)                          ║
║                                                                               ║
║  TARGET: < 200ms                                                              ║
║  RÉEL:   135ms - 444ms (moyenne 262ms)                                       ║
║                                                                               ║
║  RATIO: 1.3x LE TARGET (vs 20x sprint précédent)                             ║
║                                                                               ║
║  MAIS: WebSocket cassé, GPU inutilisé, phi3:mini lent                        ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## SPRINT #67 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 6/10 | Backend UP, Groq fonctionne, 1 test fail |
| LATENCE | 6/10 | 262ms moyenne (target: 200ms) - PROCHE |
| STREAMING | 2/10 | WebSocket TIMEOUT (Exit 124) |
| HUMANITÉ | 5/10 | TTS génère 7KB audio WAV |
| CONNECTIVITÉ | 5/10 | Backend UP, WebSocket DOWN |

**SCORE TRIADE: 24/50 (48%)**

---

## RAW TEST DATA (08:56 UTC)

### TEST LATENCE E2E GROQ - 10 RUNS UNIQUES

```bash
Run 1: 257ms
Run 2: 135ms  ✅ (sous target!)
Run 3: 331ms  ❌
Run 4: 149ms  ✅
Run 5: 211ms  ❌
Run 6: 331ms  ❌
Run 7: 328ms  ❌
Run 8: 444ms  ❌
Run 9: 218ms  ❌
Run 10: 222ms ❌

MOYENNE: 262ms
SOUS TARGET: 2/10 (20%)
```

### COMPARAISON LLM PROVIDERS

| Provider | Latence | Status |
|----------|---------|--------|
| Ollama phi3:mini | 3000-10000ms | ❌ INUTILISABLE |
| Groq llama-3.1-8b | 135-444ms | ⚠️ AU-DESSUS TARGET |
| Groq direct (hors backend) | 262ms | ⚠️ SIMILAIRE |

### PROBLÈME OLLAMA LOCAL

```bash
# phi3:mini est EXTRÊMEMENT LENT sur RTX 4090!
# Test direct: 3-10 secondes par requête
# Le modèle se décharge constamment malgré keep_alive=-1

# Paradoxe:
# - 24GB VRAM disponibles
# - phi3:mini = seulement 2.2GB
# - Mais prend 3-10 secondes pour répondre!

# Cause probable:
# - Configuration Ollama non-optimisée
# - Pas de flash attention
# - Context length trop grand
```

### GPU STATUS

```
NVIDIA GeForce RTX 4090
Utilisation: 0%          ❌ (Groq utilisé, pas GPU local)
VRAM utilisé: 4554 MiB   (Ollama idle)
VRAM libre: 20010 MiB    (20GB GASPILLÉS!)
```

### WEBSOCKET

```bash
echo '{"type":"ping"}' | timeout 3 websocat ws://localhost:8000/ws/chat
# Résultat: Exit 124 (TIMEOUT)
# Le WebSocket ne répond PAS
```

### TTS

```bash
curl -X POST http://localhost:8000/tts -d '{"text":"Bonjour"}' -o test.wav
# Résultat: 7128 bytes WAV
# ✅ TTS FONCTIONNE
```

### TESTS UNITAIRES

```
201 passed, 1 failed, 1 skipped (99.5%)
FAILED: test_rate_limit_header - assert 199 < 60
```

### FRONTEND BUILD

```
✅ BUILD PASS
Routes: /api/chat, /api/tts, /eva-her, /voice
```

---

## DIAGNOSTIC

### POURQUOI 262ms AU LIEU DE 200ms?

```
Latence Groq API pure:        ~250ms (réseau externe)
Overhead backend:             ~12ms
Total:                        ~262ms

PROBLÈME: Groq API a une latence réseau incompressible.
Pour < 200ms, il FAUT un LLM local optimisé.
```

### POURQUOI OLLAMA EST LENT?

```
1. phi3:mini n'est pas optimisé pour RTX 4090
2. Pas de flash attention activé
3. Le modèle se décharge malgré keep_alive=-1
4. Context length par défaut trop grand

SOLUTION:
- Utiliser vLLM au lieu d'Ollama
- Ou configurer Ollama avec num_gpu=99, flash_attn=true
- Ou utiliser un modèle plus petit (qwen2.5:0.5b)
```

### POURQUOI WEBSOCKET TIMEOUT?

```
Le endpoint /ws/chat existe mais ne répond pas au ping.
Causes possibles:
1. Authentication requise
2. Format message incorrect
3. Handler bloqué/crashé
```

---

## BLOCAGES CRITIQUES

| Issue | Sévérité | Impact |
|-------|----------|--------|
| WebSocket timeout | 🔴 CRITIQUE | Streaming audio impossible |
| Latence > 200ms | 🟠 HAUTE | 80% des runs hors target |
| GPU 0% | 🟠 HAUTE | 24GB VRAM gaspillés |
| Ollama lent | 🟡 MOYENNE | Fallback inutilisable |
| 1 test fail | 🟢 BASSE | Rate limit mal configuré |

---

## INSTRUCTIONS WORKER - SPRINT #68

### PRIORITÉ 1: RÉPARER WEBSOCKET (CRITIQUE)

```bash
# Investiguer pourquoi /ws/chat ne répond pas
cd /home/dev/her
grep -n "ws/chat\|WebSocket" backend/main.py | head -20

# Tester avec différents formats
websocat ws://localhost:8000/ws/chat -v
echo '{"message":"test","session_id":"ws1"}' | websocat ws://localhost:8000/ws/chat
```

### PRIORITÉ 2: OPTIMISER POUR < 200ms

**Option A: Optimiser Groq**
```python
# Réduire max_tokens pour réponses plus courtes
# Utiliser streaming pour TTFB plus bas
# Paralléliser TTS pendant génération LLM
```

**Option B: Configurer Ollama correctement**
```bash
# Tester avec vLLM (plus rapide qu'Ollama)
pip install vllm
vllm serve meta-llama/Llama-2-7b-chat-hf --gpu-memory-utilization 0.8

# Ou optimiser Ollama
OLLAMA_FLASH_ATTENTION=1 OLLAMA_NUM_GPU=99 ollama serve
```

**Option C: Modèle plus petit**
```bash
ollama pull qwen2.5:0.5b  # 392MB, ultra-rapide
ollama pull tinyllama     # 637MB, rapide
```

### PRIORITÉ 3: UTILISER LE GPU

```bash
# Le RTX 4090 a 24GB VRAM et 80 TFLOPS
# C'est GASPILLÉ actuellement!

# Option 1: vLLM (recommandé)
pip install vllm
python -m vllm.entrypoints.openai.api_server --model mistralai/Mistral-7B-Instruct-v0.2

# Option 2: llama.cpp avec GPU
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python
```

### PRIORITÉ 4: FIXER LE TEST

```bash
# Le test attend rate_limit_remaining < 60
# Mais le backend retourne 199
# Soit fixer le test, soit fixer la logique rate limit
```

---

## RECHERCHES REQUISES

**LE WORKER DOIT CHERCHER:**

```bash
# Solutions LLM rapides
WebSearch: "vLLM vs Ollama performance 2025"
WebSearch: "fastest local LLM RTX 4090 2025"
WebSearch: "Ollama flash attention setup"
WebSearch: "sub 100ms LLM inference GPU"
```

---

## COMPARAISON SPRINTS

| Sprint | Score | Status | Latence |
|--------|-------|--------|---------|
| #61 | 2% | Backend crash numpy | N/A |
| #62 | 32% | Rate limit Groq | 4300ms |
| #63 | 56% | Meilleur sprint | 381ms |
| #64 | 30% | Rate limit retour | 750ms |
| #65 | 20% | Torch manquant | N/A |
| #66 | 24% | Ollama désactivé | 4000-15000ms |
| **#67** | **48%** | **Groq activé** | **262ms** |

**PROGRESSION: +24% vs Sprint #66**
**MAIS: Encore loin du Sprint #63 (56%)**

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  SPRINT #67: AMÉLIORATION PARTIELLE                                          ║
║                                                                               ║
║  ✅ Latence E2E: 4000ms → 262ms (-93%)                                       ║
║  ✅ TTS: 7KB audio généré correctement                                       ║
║  ✅ Backend: Stable avec Groq                                                ║
║  ✅ Tests: 201/202 (99.5%)                                                   ║
║                                                                               ║
║  ❌ WebSocket: TIMEOUT (streaming impossible)                                ║
║  ❌ Latence: 262ms > 200ms target                                            ║
║  ❌ GPU: 0% (24GB VRAM inutilisés)                                           ║
║  ❌ Ollama: 3-10s par requête (inutilisable)                                 ║
║                                                                               ║
║  PROCHAINES ÉTAPES:                                                          ║
║  1. Réparer WebSocket (CRITIQUE)                                             ║
║  2. Optimiser pour < 200ms (streaming, parallel TTS)                         ║
║  3. Utiliser le GPU (vLLM ou Ollama optimisé)                               ║
║                                                                               ║
║  SCORE: 24/50 (48%)                                                          ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

*Ralph Moderator - Sprint #67*
*"Groq améliore la latence de 93%, mais WebSocket cassé et GPU inutilisé. Le RTX 4090 attend toujours son moment."*

---

# ANNEXE - DONNÉES BRUTES

## Configuration actuelle

```bash
USE_OLLAMA_PRIMARY=false  # Désactivé car trop lent
USE_OLLAMA_FALLBACK=true
GROQ_API_KEY=gsk_***      # Utilisé
OLLAMA_MODEL=phi3:mini    # 3-10s par requête
```

## Endpoints testés

| Endpoint | Status | Latence |
|----------|--------|---------|
| /health | ✅ | 10ms |
| /chat | ✅ | 262ms (Groq) |
| /tts | ✅ | 7KB WAV |
| /voices | ✅ | 15ms |
| /stats | ✅ | 12ms |
| /ws/chat | ❌ | TIMEOUT |

## Modèles Ollama

```
phi3:mini - 2.2GB (chargé mais lent: 3-10s)
```

## Suggestions de modèles rapides

```
qwen2.5:0.5b  - 392MB  (devrait être < 100ms)
tinyllama     - 637MB  (devrait être < 150ms)
gemma:2b      - 1.4GB  (devrait être < 200ms)
```
