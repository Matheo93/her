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

### Diagnostic 2026-01-21 (Sprint 85)

| Métrique | Mesuré | Objectif | Status |
|----------|--------|----------|--------|
| E2E Total (warm) | 154-182ms | < 200ms | ✅ PASS |
| E2E Total (cold) | 1547ms | < 500ms | ❌ FAIL |
| LLM (warm) | 202-205ms | < 150ms | ⚠️ PROCHE |
| TTS | 28ms | < 100ms | ✅ PASS |
| Cold Start | 1547ms | < 500ms | ❌ FAIL |
| Session chaude | 16ms | N/A | ✅ EXCELLENT |

**Score Global: 91%**

#### Infrastructure
- Backend: ✅ healthy (groq, whisper, tts, database)
- Frontend: ✅ actif
- GPU: ✅ RTX 4090 (4GB/24.5GB)
- Disque: ⚠️ 80%
- Watchdog: ⚠️ Non actif
- Ollama: ✅ 3 modèles disponibles

#### Tests Émotionnels
- Tristesse: ⚠️ Confusion identité ("Oh, Eva, je t'aime")
- Joie: ❌ Réponse null
- Anxiété: ❌ "Haha" inapproprié

#### UX Validation
- Desktop: ✅ Design cohérent
- Mobile: ✅ Responsive OK
- Input: ✅ Fonctionnel
- Avatar: ⚠️ Cercle statique (pas de visage humain)

#### Points d'amélioration identifiés
1. Cold start trop élevé (1547ms vs 500ms objectif)
2. Réponses "Haha" inappropriées pour émotions négatives
3. Avatar = cercle dégradé (pas de visage humain animé)
4. Confusion identité dans les réponses (Eva parle d'elle à la 3e personne)
5. Réponse null sur test joie
6. Pas de watchdog actif
