---
reviewed_at: 2026-01-21T08:02:30Z
commit: fb52dca
status: SPRINT #61 - GROQ ACTIF MAIS VARIANCE LATENCE
score: 56%
critical_issues:
  - VARIANCE LATENCE: 129-367ms (367ms = 1.8x target!)
  - WebSocket TIMEOUT après 5s
  - GPU 22% seulement (3.6GB/24GB VRAM)
improvements:
  - Groq primaire (USE_OLLAMA_PRIMARY=false)
  - Latence moyenne 206ms (vs 4446ms Ollama!)
  - Backend UP et stable
  - TTS produit audio binaire
  - Tests 145+ PASS avant timeout
---

# Ralph Moderator - Sprint #61 - GROQ RÉACTIVÉ

## VERDICT: AMÉLIORATION MAJEURE MAIS INSTABILITÉ

### ÉTAT ACTUEL (TESTÉ 08:01 UTC):

```bash
# Backend UP et répond:
curl http://localhost:8000/chat -> latency_ms: 176ms
```

**GROQ EST MAINTENANT PRIMAIRE!**

---

## SPRINT #61 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 7/10 | Tests 145+ PASS, timeout sur reste |
| LATENCE | 5/10 | **206ms moyenne** mais 367ms pic! |
| STREAMING | 2/10 | WebSocket TIMEOUT |
| HUMANITÉ | 6/10 | TTS produit audio binaire |
| CONNECTIVITÉ | 8/10 | Backend UP, Groq connecté |

**SCORE TRIADE: 28/50 (56%) - AMÉLIORATION +34% vs Sprint #60 (22%)**

---

## RAW TEST DATA (RÉEL - 08:01:59 UTC)

### LATENCE E2E (MESSAGES UNIQUES - PAS DE CACHE):
```
Test 1: 176ms "Question unique numero 1 timestamp 1768982419..."
Test 2: 129ms EXCELLENT
Test 3: 130ms EXCELLENT
Test 4: 227ms (13% over target)
Test 5: 367ms (83% over target!)

Moyenne: 206ms (3% over target)
Min: 129ms
Max: 367ms
Variance: 238ms (ÉNORME!)
```

### VERDICT LATENCE:
```
3/5 tests sous 200ms (60%)
1/5 tests 200-250ms (20%)
1/5 tests >250ms (20%)
```

**PROBLÈME:** Variance 238ms inacceptable. UX inconsistante.

### GPU UTILISATION:
```
NVIDIA GeForce RTX 4090, 22 %, 3665 MiB / 24564 MiB, 26°C
```
**20GB VRAM INUTILISÉ!** (3.6GB/24GB = 15%)

### WEBSOCKET:
```
timeout 5 websocat ws://localhost:8000/ws/chat
Result: WS_FAIL ou timeout
```
**CRITIQUE:** WebSocket non fonctionnel!

### CONFIGURATION VÉRIFIÉE:
```bash
GROQ_API_KEY=gsk_ZlTQv... (présent)
USE_OLLAMA_PRIMARY=false (CORRIGÉ depuis Sprint #60!)
USE_OLLAMA_FALLBACK=true
```

---

## COMPARAISON SPRINTS

| Sprint | Latence Avg | Latence Max | Provider | Score |
|--------|-------------|-------------|----------|-------|
| #59 | ~200ms | ~250ms | Groq | 80% |
| #60 | 4446ms | 4446ms | Ollama | 22% |
| **#61** | **206ms** | **367ms** | Groq | **56%** |

**GROQ RÉACTIVÉ = LATENCE /21 !** (4446ms -> 206ms)

---

## BLOCAGES CRITIQUES

### BLOCAGE 1: VARIANCE LATENCE (HAUTE)
- Min 129ms, Max 367ms = 2.8x variance
- Causes possibles: Groq cold start, network jitter
- **ACTION:** Profiler 20 requêtes pour identifier pattern

### BLOCAGE 2: WEBSOCKET CASSÉ (CRITIQUE)
- Timeout après 5 secondes
- Impact: Streaming audio impossible
- **ACTION:** Debug endpoint WebSocket dans main.py

### BLOCAGE 3: GPU SOUS-UTILISÉ (MOYENNE)
- 22% charge, 3.6GB/24GB VRAM
- **ACTION:** Soit stopper Ollama, soit l'utiliser pour TTS local

---

## INSTRUCTIONS WORKER - SPRINT #62

### PRIORITÉ 1: DEBUG WEBSOCKET (CRITIQUE)
```bash
# Vérifier que l'endpoint existe
grep -n "ws/chat\|WebSocket" /home/dev/her/backend/main.py | head -20

# Tester avec curl upgrade
curl -v -H "Connection: Upgrade" -H "Upgrade: websocket" \
  http://localhost:8000/ws/chat 2>&1 | head -30
```

### PRIORITÉ 2: STABILISER LATENCE
```bash
# Test de stress: 10 requêtes uniques
for i in {1..10}; do
  TS=$(date +%s%N)
  curl -s -X POST http://localhost:8000/chat \
    -H 'Content-Type: application/json' \
    -d "{\"message\":\"stress test $i $TS\",\"session_id\":\"stress_$TS\"}" \
    | jq '.latency_ms'
done
# SI variance > 100ms: investiguer Groq rate limits
```

### PRIORITÉ 3: EXPLOITER GPU OU LE LIBÉRER
```bash
# Option A: Arrêter Ollama (libère VRAM)
# Option B: TTS local GPU (Coqui XTTS)
```

---

## VERDICT FINAL

```
SPRINT #61: AMÉLIORATION SIGNIFICATIVE

Groq primaire = 206ms (vs Ollama 4446ms)
Backend stable et répond
TTS fonctionnel

MAIS:
Variance latence 129-367ms (INSTABLE)
WebSocket TIMEOUT (CRITIQUE)
GPU 22% (sous-utilisé)

FOCUS SPRINT #62:
1. RÉPARER WEBSOCKET (priorité absolue)
2. Réduire variance latence (<100ms spread)
3. Décider: GPU pour TTS ou arrêter Ollama

SCORE: 28/50 (56%) - +34% vs Sprint #60
```

---

*Ralph Moderator - Sprint #61*
*"Groq activé = victoire. WebSocket cassé = bloqueur. 367ms pic = inacceptable."*
