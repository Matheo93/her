---
sprint: 72
started_at: 2026-01-21T10:05:00Z
status: 🔄 IN PROGRESS
---

# Sprint #72 - UTILISER LE GPU!

## OBJECTIFS

1. **GPU >50%** - Passer de 0% à >50% pendant inference
2. **HTTP <150ms** - LLM local = pas de latence réseau
3. **WebSocket <250ms** - Batching de tokens
4. **TTS métriques** - Visibilité sur la latence TTS

## PLAN D'ACTION

### 1. 🔄 Installer qwen2.5:7b sur Ollama
- Pull qwen2.5:7b-instruct-q4_K_M (optimisé pour RTX 4090)
- Configurer .env: USE_OLLAMA_PRIMARY=true
- Test latence locale vs Groq

### 2. 📋 Optimiser WebSocket
- Batching de tokens (groupes de 5)
- Réduire overhead JSON

### 3. 📋 Warmup LLM au démarrage
- Préchauffer le modèle avec une requête test
- Réduire variance latence (actuellement 148-320ms)

### 4. 📋 Métriques TTS
- Logger latence TTS dans les réponses
- Permettre le monitoring

## MESURES INITIALES

```
GPU: 0%
HTTP Latence: 179-320ms (Groq API)
WebSocket: 446ms
TTS: Non mesuré
```

## RECHERCHE PRÉLIMINAIRE

Vérifier performance qwen2.5:7b sur RTX 4090...
