---
reviewed_at: 2026-01-21T08:04:15Z
commit: fb52dca
status: SPRINT #64 - RATE LIMITER CASSÉ + GPU DORMANT
score: 48%
critical_issues:
  - RATE LIMITER CASSÉ: TTS 2/3 tests = "Rate limit exceeded"
  - GPU 0%: 24GB VRAM inutilisé!
  - VARIANCE LATENCE: 171-586ms (586ms = 3x target!)
  - 1 test unitaire FAILED (rate_limit_header)
improvements:
  - WebSocket FONCTIONNE! (vs timeout Sprint #61)
  - Frontend build PASS
  - Backend UP et répond
  - Ollama direct = 72-231ms (prouve que GPU peut performer)
---

# Ralph Moderator - Sprint #64 - RATE LIMITER CASSÉ

## VERDICT: RÉGRESSION - RATE LIMITER BLOQUE TOUT

### ÉTAT ACTUEL (TESTÉ 08:04 UTC):

```bash
# Health check: OK
{"status":"healthy","groq":true,"whisper":true,"tts":true,"database":true}

# MAIS: Rate limiter cassé!
# MAIS: GPU à 0%!
# MAIS: Variance 415ms!
```

---

## SPRINT #64 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 5/10 | 1 test FAILED, TTS rate limited |
| LATENCE | 4/10 | 296ms moyenne, pic 586ms |
| STREAMING | 7/10 | WebSocket fonctionne! |
| HUMANITÉ | 4/10 | TTS rate limited 2/3 tests |
| CONNECTIVITÉ | 4/10 | Rate limits bloquent |

**SCORE TRIADE: 24/50 (48%)**

---

## RAW TEST DATA (RÉEL - 08:04 UTC)

### TEST 1 - LATENCE E2E (MESSAGES UNIQUES - NO CACHE!):
```
Run 1: 213ms total (internal: 193ms) ✓ MARGINAL
Run 2: 171ms total (internal: 151ms) ✓ EXCELLENT
Run 3: 218ms total (internal: 202ms) MARGINAL
Run 4: 586ms total (internal: 565ms) ❌❌ CATASTROPHE (3x target!)
Run 5: 294ms total (internal: 273ms) ❌

MOYENNE: 296ms (48% AU-DESSUS TARGET 200ms)
MIN: 171ms
MAX: 586ms
VARIANCE: 415ms (ÉNORME!)
```

**40% des requêtes HORS SLA!**

### TEST 2 - OLLAMA DIRECT (sans backend):
```
Run 1: 72ms  ✓ EXCELLENT
Run 2: 133ms ✓
Run 3: 231ms MARGINAL
```

**PREUVE:** Ollama PEUT faire 72ms!
**QUESTION:** Pourquoi backend ajoute +500ms sur Run 4?

### TEST 3 - TTS:
```
Run 1: 3900ms, 32 bytes = {"detail":"Rate limit exceeded"} ❌
Run 2: 109ms, 32 bytes = {"detail":"Rate limit exceeded"} ❌
Run 3: 113ms, 12960 bytes = OK ✓
```

**2/3 TTS = RATE LIMITED!** TTS inutilisable en production.

### TEST 4 - GPU:
```
NVIDIA GeForce RTX 4090
Utilisation: 0%  ❌❌❌
VRAM utilisé: 4540 MiB / 24564 MiB
VRAM libre: ~20GB
```

**20GB VRAM INUTILISÉS PENDANT QUE LATENCE EXPLOSE!**

### TEST 5 - WEBSOCKET:
```json
{"type":"token","content":"Test recu! Mais parle-moi de toi!"}
{"type":"end"}
```

**WebSocket FONCTIONNE!** Amélioration majeure vs Sprint #61-63.

### TEST 6 - TESTS UNITAIRES:
```
17 passed, 1 failed, 1 skipped in 11.94s

FAILED: test_rate_limit_header
  assert 199 < 60  ← rate_limit_remaining incorrect
```

### TEST 7 - FRONTEND BUILD:
```
✓ Build SUCCESS
```

---

## PROBLÈMES CRITIQUES

### PROBLÈME 1: RATE LIMITER CASSÉ (BLOQUANT)
```python
# Test attend: rate_limit_remaining < 60
# Reçoit: rate_limit_remaining = 199

# TTS rate limited après 1 requête
# Impact: TTS inutilisable, tests cassés
```

**ACTION IMMÉDIATE:** Investiguer et fixer le rate limiter dans main.py

### PROBLÈME 2: GPU À 0% PENDANT INFERENCE
```
Ollama TOURNE (PID visible)
Ollama LOADED en mémoire (4540 MiB)
MAIS: 0% GPU utilization pendant requêtes

CAUSE PROBABLE:
- Ollama compilé sans CUDA
- Ou mauvaise config OLLAMA_GPU
```

### PROBLÈME 3: OVERHEAD BACKEND +500ms
```
Ollama direct: 72ms
Via backend Run 4: 586ms
Overhead: +514ms!

Où partent ces 500ms?
- Rate limiter check?
- Memory/history lookup?
- TTS generation intégrée?
```

---

## COMPARAISON SPRINTS

| Sprint | Score | E2E Avg | E2E Max | Variance | Issue Principal |
|--------|-------|---------|---------|----------|-----------------|
| #61 | 56% | 206ms | 367ms | 238ms | WebSocket down |
| #62 | 32% | 4200ms | 4200ms | - | Rate limit 4200ms |
| #63 | 56% | 245ms | 424ms | 290ms | Cold start |
| **#64** | **48%** | **296ms** | **586ms** | **415ms** | Rate limiter + GPU |

**RÉGRESSION vs #63!** Variance +125ms, Max +162ms

---

## BLOCAGES À RÉSOUDRE

| # | Issue | Sévérité | Impact |
|---|-------|----------|--------|
| 1 | Rate limiter cassé | CRITIQUE | Tests fail, TTS bloqué |
| 2 | GPU 0% | CRITIQUE | 20GB VRAM gaspillés |
| 3 | Variance 415ms | HAUTE | UX inconsistante |
| 4 | Backend overhead | HAUTE | +200-500ms mystère |

---

## INSTRUCTIONS WORKER - SPRINT #65

### PRIORITÉ 1: FIXER RATE LIMITER (BLOQUANT)

```bash
# Diagnostic
grep -n "rate_limit\|RateLimiter" /home/dev/her/backend/main.py | head -30

# Le test attend: remaining < 60
# Le code retourne: 199

# Chercher pourquoi la valeur est incorrecte
# Probable: limite augmentée mais test pas mis à jour
# OU: calcul remaining incorrect
```

**FIXER OU AJUSTER TEST - NE PAS IGNORER!**

### PRIORITÉ 2: ACTIVER GPU OLLAMA

```bash
# Vérifier CUDA
ollama ps
nvidia-smi -l 1  # pendant une requête Ollama

# Test direct
curl -s http://localhost:11434/api/generate \
  -d '{"model":"phi3:mini","prompt":"hi"}' &
nvidia-smi  # DOIT montrer GPU > 0%

# Si toujours 0%:
# 1. export OLLAMA_GPU_LAYERS=35
# 2. systemctl restart ollama
# 3. OU réinstaller: curl -fsSL https://ollama.com/install.sh | sh
```

### PRIORITÉ 3: PROFILER BACKEND OVERHEAD

```bash
# Ajouter timing dans /chat:
import time
t0 = time.perf_counter()
# ... après chaque étape
print(f"rate_limit: {(time.perf_counter()-t0)*1000:.0f}ms")
print(f"llm_call: {(time.perf_counter()-t0)*1000:.0f}ms")
print(f"total: {(time.perf_counter()-t0)*1000:.0f}ms")
```

### PRIORITÉ 4: WEBSEARCH (OBLIGATOIRE)

```bash
# Tu DOIS rechercher:
WebSearch: "ollama cuda not using gpu ubuntu 2025"
WebSearch: "fastapi rate limiter slowapi configuration"
WebSearch: "reduce python api latency variance"
```

**SI PAS DE WEBSEARCH = BLOCAGE PROCHAIN SPRINT**

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║  SPRINT #64: RÉGRESSION                                          ║
║                                                                   ║
║  ✅ WebSocket fonctionne (amélioration!)                         ║
║  ✅ Frontend build OK                                             ║
║  ✅ Backend UP                                                    ║
║                                                                   ║
║  ❌ Rate limiter CASSÉ (TTS 2/3 blocked, test FAILED)            ║
║  ❌ GPU 0% - 20GB VRAM dormants!                                  ║
║  ❌ Variance 415ms (586ms max!)                                   ║
║  ❌ Latence 296ms > 200ms target                                  ║
║                                                                   ║
║  SCORE: 24/50 (48%) - RÉGRESSION -8% vs Sprint #63               ║
║                                                                   ║
║  ACCEPTATION: NON                                                 ║
║                                                                   ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## EXIGENCES SPRINT #65

1. **Rate limiter DOIT être fixé** - Tous tests PASS
2. **GPU DOIT montrer >0%** pendant inference
3. **Latence DOIT être <200ms** sur 4/5 runs minimum
4. **Variance DOIT être <150ms**
5. **WebSearch OBLIGATOIRE** sur GPU et rate limiter

---

*Ralph Moderator - Sprint #64*
*"Rate limiter cassé = tests cassés = qualité inconnue. GPU 0% = RTX 4090 en mode paperweight. 586ms = INACCEPTABLE. RÉGRESSION."*
