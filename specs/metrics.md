# Métriques EVA

## Objectifs de Latence
| Métrique | Objectif | Critique | Bloquant |
|----------|----------|----------|----------|
| E2E Total | < 200ms | > 300ms | > 500ms |
| TTFT LLM | < 100ms | > 150ms | > 300ms |
| TTS | < 100ms | > 150ms | > 300ms |
| STT | < 100ms | > 150ms | > 300ms |
| Avatar FPS | 60 | < 30 | < 15 |
| WebSocket Connect | < 1s | > 2s | > 5s |
| Cold Start | < 500ms | > 1s | > 2s |

## Mesures Actuelles

### Diagnostic 2026-01-21

| Métrique | Mesuré | Objectif | Status |
|----------|--------|----------|--------|
| E2E Total (warm) | 186ms | < 200ms | ✅ PASS |
| E2E Total (cold) | 1942ms | < 500ms | ❌ FAIL |
| LLM (warm) | 197-230ms | < 150ms | ⚠️ PROCHE |
| TTS | 30ms | < 100ms | ✅ PASS |
| Cold Start | 1942ms | < 500ms | ❌ FAIL |

**Score Global: 93%**

#### Détails
- Backend: ✅ healthy (groq, whisper, tts, database)
- Frontend: ✅ actif
- GPU: ✅ RTX 4090 (3.9GB/24.5GB)
- Disque: ⚠️ 80%
- Watchdog: ⚠️ Non actif

#### Points d'amélioration identifiés
1. Cold start trop élevé (1942ms vs 500ms objectif)
2. Réponses commencent par "Haha" - inapproprié pour émotions négatives
3. Avatar statique (pas d'animation)
4. Pas de watchdog actif
