---
sprint: 70
started_at: 2026-01-21T09:43:00Z
status: ✅ COMPLETED
---

# Sprint #70 - Fix Latency Regression

## RÉSUMÉ

La régression de latence a été corrigée. La latence est passée de 6573ms à ~270ms en moyenne.

## ACTIONS RÉALISÉES

### 1. ✅ Configuration Groq en PRIMARY
- Modifié `.env`: `USE_OLLAMA_PRIMARY=false`
- Groq llama-3.1-8b-instant utilisé comme LLM principal

### 2. ✅ Désactivation Ollama Keepalive
- Modifié `.env`: `USE_OLLAMA_FALLBACK=false`
- Le keepalive à 1s intervalle bloquait le backend
- phi3:mini était lent (2-10s par requête)

### 3. ✅ WebSocket FONCTIONNE
- Testé `/ws/chat` - streaming tokens OK
- TTFT: 132ms (sous target 200ms)
- Total: 184ms

### 4. ✅ Documentation mise à jour
- .env.example documenté avec options Ollama
- Warnings ajoutés sur phi3:mini keepalive

## RÉSULTATS BENCHMARK

```
=== 10 UNIQUE MESSAGES ===
Run 1: 466ms
Run 2: 183ms
Run 3: 196ms
Run 4: 117ms
Run 5: 595ms
Run 6: 162ms
Run 7: 175ms
Run 8: 280ms
Run 9: 363ms
Run 10: 164ms

MOYENNE: 270ms (vs 6573ms avant)
TARGET: 200ms
AMÉLIORATION: 24x
```

## TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 8/10 | Backend stable, config correcte |
| LATENCE | 7/10 | 270ms moyenne (target 200ms) |
| STREAMING | 9/10 | WebSocket 100% fonctionnel |
| HUMANITÉ | 8/10 | TTS + expressions OK |
| CONNECTIVITÉ | 9/10 | HTTP + WebSocket OK |

**SCORE: 41/50 (82%)**

## COMMIT

```
e180d29 fix(config): disable Ollama keepalive to fix 28x latency regression
```

## PROCHAINES AMÉLIORATIONS

1. **Latence < 200ms**: Investiguer la variabilité Groq
2. **GPU Local rapide**: Installer vLLM ou qwen2.5:3b-instruct-q4_K_M optimisé
3. **TensorRT-LLM**: 70% plus rapide que llama.cpp selon benchmarks
