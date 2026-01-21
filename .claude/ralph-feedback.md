---
reviewed_at: 2026-01-21T08:03:15Z
commit: fb52dca
status: SPRINT #64 - CATASTROPHE LATENCE + WEBSOCKET MORT
score: 30%
critical_issues:
  - LATENCE EXPLOSIVE: 160ms → 4363ms après 5 requêtes!
  - RATE LIMIT GROQ: De 55 à 2 requêtes restantes
  - WebSocket Connection REFUSED (error 111)
  - GPU 0% pendant inference
  - TTS endpoint renvoie vide
improvements:
  - Frontend build OK (Next.js 16.1.1)
  - Tests 17/19 PASS (89%)
  - Première requête 160ms
---

# Ralph Moderator - Sprint #64 - ALERTE ROUGE

## VERDICT: RÉGRESSION CONFIRMÉE - RATE LIMIT DÉTRUIT TOUT

### DONNÉES BRUTES TIMESTAMP 08:02:55 UTC

---

## SPRINT #64 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 5/10 | Tests 89%, 1 fail rate limit |
| LATENCE | 1/10 | **3067ms moyenne** - 15x target! |
| STREAMING | 0/10 | WebSocket Connection refused |
| HUMANITÉ | 2/10 | TTS renvoie vide |
| CONNECTIVITÉ | 7/10 | Backend UP mais throttled |

**SCORE TRIADE: 15/50 (30%) - RÉGRESSION vs Sprint #63**

---

## RAW TEST DATA - LATENCE E2E (MESSAGES UNIQUES)

```
TIMESTAMP: 1768982550830593387

Test 1: 160ms  ✅ PREMIÈRE REQUÊTE OK
Test 2: 2244ms ❌ (11x target - rate limited!)
Test 3: 4351ms ❌ (22x target!)
Test 4: 4216ms ❌ (21x target!)
Test 5: 4363ms ❌ (22x target!)

MOYENNE: 3067ms (15x over target!)
MIN: 160ms
MAX: 4363ms
VARIANCE: 4203ms

RATE LIMIT REMAINING:
55 → 22 → 18 → 11 → 7 → 2

DIAGNOSTIC: GROQ RATE LIMIT DESTRUCTION!
```

**PREUVE IRRÉFUTABLE:** Le système collapse après 2-3 requêtes rapides.

---

## RAW TEST DATA - GPU

```
Test 1 (pendant idle):
22%, 3665 MiB / 24564 MiB, RTX 4090

Test 2 (pendant inference):
0%, 4154 MiB / 24564 MiB, RTX 4090

CONCLUSION: GPU TOTALEMENT IGNORÉ
VRAM GASPILLÉ: 20GB sur 24GB (83%)
```

---

## RAW TEST DATA - WEBSOCKET

```bash
websocat ws://127.0.0.1:8000/ws/chat
Result: WebSocketError: Connection refused (os error 111)
```

**WEBSOCKET ENDPOINT MORT!**

---

## RAW TEST DATA - TTS

```bash
curl -X POST http://127.0.0.1:8000/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Bonjour"}'

Result: (vide - 0 bytes)
TIME: 0.000155s
```

**TTS NE FONCTIONNE PAS!**

---

## RAW TEST DATA - TESTS UNITAIRES

```
python3 -m pytest backend/tests/test_api.py -v

PASSED: 17/19 tests (89%)
FAILED: 1 (test_rate_limit_header - assert 199 < 60)
SKIPPED: 1 (database test)

Time: 11.99s
```

---

## RAW TEST DATA - FRONTEND

```
npm run build

✓ Next.js 16.1.1 (Turbopack)
✓ Compiled in 10.0s
✓ Static pages: 10/10
✓ Build SUCCESS
```

---

## BLOCAGES CRITIQUES

### BLOCAGE 1: GROQ RATE LIMIT (BLOQUEUR ABSOLU)

```
Symptômes:
- Première requête: 160ms (OK)
- Requêtes suivantes: 2000-4400ms (CATASTROPHE)
- rate_limit_remaining décroit rapidement

Cause:
- Plan Groq gratuit = 30 RPM / 6000 TPM
- Conversations longues = beaucoup de tokens
- Chaque requête consomme le quota

SOLUTION OBLIGATOIRE:
1. LLM LOCAL (RTX 4090 disponible!)
2. Ou upgrade Groq tier
3. Ou alternative API
```

### BLOCAGE 2: WEBSOCKET (SÉVÈRE)

```
Symptômes:
- Connection refused (error 111)
- Endpoint /ws/chat inaccessible

Impact:
- Pas de streaming audio
- Pas de real-time

SOLUTION:
- Vérifier route dans main.py
- Restart backend si nécessaire
```

### BLOCAGE 3: TTS (HAUTE)

```
Symptômes:
- Réponse vide
- Temps 0.155ms (trop rapide = erreur)

SOLUTION:
- Debug service MMS-TTS
- Vérifier GPU pour TTS
```

---

## INSTRUCTIONS WORKER - SPRINT #65

### STOP! LE CACHE N'EST PAS LA SOLUTION!

Le rate limit Groq est le VRAI problème. Le cache masque le symptôme mais en production avec des conversations UNIQUES, tout explose.

### PRIORITÉ 1: IMPLEMENTER LLM LOCAL MAINTENANT

```bash
# Tu as une RTX 4090 avec 24GB VRAM!
# Elle est à 0% utilisation!

# Option A: Ollama (probablement déjà installé)
curl http://localhost:11434/api/tags

# Si Ollama répond, modifier .env:
USE_OLLAMA_PRIMARY=true
OLLAMA_MODEL=llama3.2:3b

# Option B: vLLM (plus rapide)
pip install vllm
vllm serve meta-llama/Llama-3.1-8B-Instruct \
  --gpu-memory-utilization 0.8 \
  --max-model-len 4096

# Option C: llama.cpp (minimal)
./llama.cpp/build/bin/llama-server \
  -m models/llama-3-8b.gguf \
  -ngl 99 \  # Toutes couches sur GPU
  --port 8080
```

### PRIORITÉ 2: WEBSEARCH OBLIGATOIRE

```
WebSearch: "fastest open source LLM inference RTX 4090 2025"
WebSearch: "vLLM benchmark latency 2025"
WebSearch: "Groq rate limit bypass alternatives 2025"
WebSearch: "llama.cpp performance RTX 4090"
```

### PRIORITÉ 3: RÉPARER WEBSOCKET

```bash
grep -rn "websocket|WebSocket|ws/" /home/dev/her/backend/main.py
# Trouver pourquoi Connection refused
```

---

## COMPARAISON SPRINTS

| Sprint | Score | E2E Latency | Issue Principal |
|--------|-------|-------------|-----------------|
| #61 | 56% | 206ms | Variance 238ms |
| #62 | 32% | 3067ms | Rate limit |
| #63 | 56% | 245ms | Cold start 424ms |
| #64 | 30% | 3067ms | Rate limit RETOUR |

**PATTERN ÉVIDENT:** Rate limit Groq = performances désastreuses

---

## VERDICT FINAL

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║  SPRINT #64: RÉGRESSION SÉVÈRE - RATE LIMIT CONFIRMÉ                      ║
║                                                                            ║
║  DONNÉES BRUTES:                                                           ║
║  • Latence: 160ms → 4363ms (27x dégradation)                              ║
║  • Rate limit: 55 → 2 requêtes                                            ║
║  • GPU: 0% utilisation, 20GB gaspillés                                    ║
║  • WebSocket: Connection refused                                           ║
║  • TTS: Réponse vide                                                       ║
║                                                                            ║
║  LA SOLUTION N'EST PAS:                                                    ║
║  ❌ Cache (masque le problème)                                             ║
║  ❌ Retry (empire le rate limit)                                           ║
║  ❌ Timeout plus long (UX horrible)                                        ║
║                                                                            ║
║  LA SOLUTION EST:                                                          ║
║  ✅ LLM LOCAL sur RTX 4090 (24GB VRAM!)                                   ║
║  ✅ Ollama / vLLM / llama.cpp                                              ║
║  ✅ <50ms latence possible en local!                                       ║
║                                                                            ║
║  WORKER: Tu as le hardware. UTILISE-LE.                                   ║
║                                                                            ║
║  SCORE: 15/50 (30%)                                                       ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## ACTIONS IMMÉDIATES REQUISES

1. **WebSearch** alternatives LLM locales
2. **Tester** Ollama existant
3. **Implémenter** fallback local automatique
4. **Réparer** WebSocket endpoint
5. **Debug** TTS service

---

*Ralph Moderator - Sprint #64*
*"160ms → 4363ms = INACCEPTABLE. GPU à 0% avec 24GB VRAM = CRIME. FIX IT NOW."*
