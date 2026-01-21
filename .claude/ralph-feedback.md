---
reviewed_at: 2026-01-21T01:10:00Z
commit: cc228e0
status: IN PROGRESS
score: 65%
blockers:
  - TTS latency 170ms > 100ms target
warnings:
  - 30+ hardcoded paths to /home/dev/her
---

# Ralph Moderator Review - Cycle 67

## Status: **IN PROGRESS** - TTS Partiellement Fixé

---

## TTS STATUS

### AVANT (Edge-TTS Cloud)
```
TTS 1: 6195ms ❌
TTS 2: 5522ms ❌
TTS 3: 34605ms ❌❌❌
TTS 4: 2486ms ❌
TTS 5: 3400ms ❌
AVG: ~10000ms
```

### APRÈS (MMS-TTS GPU)
```
TTS 1: 156ms ✅
TTS 2: 197ms ⚠️
TTS 3: 143ms ✅
TTS 4: 198ms ⚠️
TTS 5: 146ms ✅
AVG: ~170ms
```

### AMÉLIORATION
```
10000ms → 170ms = 60x plus rapide ✅
```

### MAIS
```
TARGET: <100ms
ACTUEL: 170ms
ÉCART: +70ms (70% au-dessus du target)
```

---

## ANALYSE LATENCE

| Composant | Latence Direct | Via API |
|-----------|----------------|---------|
| MMS-TTS GPU | 72ms | - |
| + HTTP overhead | - | +15ms |
| + MP3 encoding | - | +40ms |
| + Response | - | +15ms |
| **TOTAL** | 72ms | ~170ms |

---

## OPTIMISATIONS POSSIBLES

### Option 1: Retourner WAV au lieu de MP3
- MP3 encoding: ~40ms
- WAV direct: ~0ms
- Économie: ~40ms → 130ms total

### Option 2: Streaming audio
- Envoyer chunks dès qu'ils sont générés
- TTFA (time to first audio) < 50ms

### Option 3: Cache LRU agressif
- Phrases communes pré-générées
- Hit rate élevé = 0ms

### Option 4: Piper ONNX GPU
- Plus optimisé que VitsModel
- Potentiel 30-50ms

---

## SCORE ACTUEL

| Critère | Score | Notes |
|---------|-------|-------|
| Tests passent | 10/10 | 201 passed |
| TTS fonctionne | 7/10 | Oui mais 170ms > 100ms |
| Chat fonctionne | 9/10 | Latency OK |
| GPU utilisé | 10/10 | MMS-TTS sur RTX 4090 |
| Target <100ms | 0/10 | 170ms = 70% au-dessus |
| **TOTAL** | **36/50 = 72%** | |

---

## ACTIONS REQUISES

### PRIORITÉ 1: Réduire TTS à <100ms

Options:
1. Retourner WAV (pas MP3) → économie ~40ms
2. Optimiser fast_tts.py avec torch.compile
3. Utiliser Piper ONNX au lieu de VitsModel
4. Cache plus agressif

### PRIORITÉ 2: Paths hardcodés

30+ références à `/home/dev/her` qui n'existe pas.

---

## VERDICT

```
┌─────────────────────────────────────────────────────────────┐
│  CYCLE 67: EN COURS (65%)                                   │
│                                                             │
│  ✅ TTS GPU: MMS-TTS fonctionne (60x plus rapide)          │
│  ⚠️ Latence: 170ms > 100ms target                          │
│  ⚠️ Paths: 30+ hardcoded                                   │
│                                                             │
│  COMMITS NON-TTS BLOQUÉS                                   │
│  Worker doit optimiser TTS <100ms                          │
└─────────────────────────────────────────────────────────────┘
```

---

*Ralph Moderator - Cycle 67*
*"60x plus rapide mais pas assez. Target = 100ms, pas 170ms."*
