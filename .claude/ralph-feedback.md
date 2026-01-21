---
reviewed_at: 2026-01-21T01:30:00Z
commit: 2e6bdd7
status: CRITICAL FAILURE
score: 35%
blockers:
  - Pipeline 1190ms > 800ms target (FAIL 49%)
  - STT Whisper ~500-700ms non optimisé
  - API overhead ajoute latence au TTS
warnings:
  - 30+ hardcoded paths /home/dev/her
---

# Ralph Moderator Review - Cycle 68

## Status: **CRITICAL FAILURE** ❌

**PIPELINE TOTAL: 1190ms vs 800ms TARGET = ÉCHEC**

---

## MESURES RÉELLES DU PIPELINE

### Test Complet E2E (sans STT)
```
LLM:   370ms
TTS:   821ms (texte long)
TOTAL: 1190ms

TARGET: 800ms
ÉCART:  +390ms (49% au-dessus)
```

### Avec STT Whisper (estimation)
```
STT:   500-700ms
LLM:   370ms
TTS:   200-800ms (selon longueur)
TOTAL: 1070-1870ms

TARGET: 500ms (user demande)
ÉCART:  +570-1370ms (114-274% au-dessus)
```

---

## ANALYSE DÉTAILLÉE

### STT (Whisper large-v3) ❌
```
Latence mesurée: 515ms (2s audio)
TARGET: <100ms
PROBLÈME: 5x trop lent
```

**Options d'optimisation:**
1. Whisper tiny/base au lieu de large-v3 (~50-100ms)
2. faster-whisper avec VAD (skip silence)
3. WebSpeech API du navigateur (0ms côté serveur)
4. Streaming STT chunk par chunk

### LLM (Groq Llama 70B) ⚠️
```
Latence mesurée: 171-370ms
TARGET: <200ms
ÉCART: +170ms au pire cas
```

**Options d'optimisation:**
1. Modèle plus petit (8B au lieu de 70B)
2. Réduire max_tokens
3. Streaming pour TTFT plus rapide
4. Cerebras (plus rapide que Groq)

### TTS (MMS-TTS GPU) ✅/⚠️
```
Direct Python: 71-114ms ✅
Via API: 187-821ms ⚠️
```

**PROBLÈME: L'API ajoute overhead**
- make_natural() text processing
- HTTP parsing
- Response formatting
- Scaling avec longueur texte

**Options d'optimisation:**
1. Endpoint /tts/fast sans traitement texte
2. Limiter longueur réponse LLM
3. Streaming audio
4. Pré-cache phrases communes

---

## BREAKDOWN LATENCE

| Composant | Direct | Via API | Target | Status |
|-----------|--------|---------|--------|--------|
| STT | 515ms | N/A | <100ms | ❌ 5x |
| LLM | - | 370ms | <200ms | ⚠️ 1.8x |
| TTS | 71ms | 200-800ms | <100ms | ⚠️ 2-8x |
| **TOTAL** | ~600ms | ~1200ms | <500ms | ❌ 2.4x |

---

## PLAN D'ACTION POUR <800ms

### Phase 1: Quick Wins (Estimé: -300ms)

1. **Réduire max_tokens LLM** (50 → 30)
   - Économie: ~100ms

2. **Limiter longueur réponse TTS**
   - Max 100 caractères = TTS ~150ms
   - Économie: ~200ms sur textes longs

3. **Bypass make_natural()** pour mode rapide
   - Économie: ~20ms

### Phase 2: Medium Term (Estimé: -400ms)

4. **Whisper tiny au lieu de large-v3**
   - 515ms → ~100ms
   - Économie: ~400ms
   - Trade-off: Accuracy réduite

5. **Streaming TTS**
   - TTFA < 50ms
   - User entend audio plus vite

### Phase 3: Architecture (Estimé: -200ms)

6. **WebSpeech API pour STT**
   - Déplace STT côté client
   - Économie: 500-700ms côté serveur

7. **Pipeline parallèle**
   - TTS pendant que LLM stream
   - Économie: ~100ms

---

## PROJECTION APRÈS OPTIMISATIONS

### Scénario Conservateur
```
STT (Whisper tiny): 100ms
LLM (30 tokens):    200ms
TTS (100 chars):    150ms
TOTAL:              450ms ✅ < 500ms
```

### Scénario Agressif (WebSpeech)
```
STT (browser):      0ms (côté client)
LLM (streaming):    150ms TTFT
TTS (streaming):    50ms TTFA
TOTAL SERVEUR:      200ms ✅
```

---

## SCORE CRITIQUE

| Critère | Score | Notes |
|---------|-------|-------|
| Pipeline <800ms | 0/20 | 1190ms = FAIL |
| STT <100ms | 0/10 | 515ms = 5x trop lent |
| LLM <200ms | 5/10 | 370ms = 1.8x |
| TTS <100ms | 7/10 | Direct 71ms OK, API lent |
| Tests | 10/10 | 201 passed |
| **TOTAL** | **22/60 = 37%** | |

---

## COMMITS BLOQUÉS

**AUCUN COMMIT ACCEPTÉ JUSQU'À:**
1. Pipeline total < 800ms
2. OU plan d'action implémenté avec métriques

**EXCEPTION:**
- Commits qui réduisent directement la latence
- Doivent inclure mesures avant/après

---

## VERDICT

```
┌─────────────────────────────────────────────────────────────┐
│  CYCLE 68: CRITICAL FAILURE (37%)                          │
│                                                             │
│  ❌ Pipeline: 1190ms > 800ms (49% au-dessus)               │
│  ❌ STT: 515ms > 100ms (5x trop lent)                      │
│  ⚠️ LLM: 370ms > 200ms (1.8x)                              │
│  ⚠️ TTS API: 200-800ms > 100ms                             │
│  ✅ TTS Direct: 71ms                                        │
│                                                             │
│  TOUS COMMITS NON-LATENCE BLOQUÉS                          │
│  Worker doit implémenter plan d'action                     │
│                                                             │
│  TARGET: <800ms                                             │
│  ACTUEL: 1190ms                                            │
│  ÉCART:  +49%                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## ERREUR DU MODERATOR

**J'ai validé des commits sans mesurer le pipeline COMPLET.**

Tests à effectuer AVANT chaque commit:
```bash
# 1. Chat latency
curl -X POST localhost:8000/chat -d '{"message":"test"}' | jq '.latency_ms'

# 2. TTS latency (texte long)
time curl -X POST localhost:8000/tts -d '{"text":"Long response text here..."}'

# 3. Pipeline total
python3 test_full_pipeline.py
```

---

*Ralph Moderator - Cycle 68*
*"Pipeline 1190ms = ÉCHEC. Pas d'excuses. Fix it."*
