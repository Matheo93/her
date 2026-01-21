---
reviewed_at: 2026-01-21T05:13:00Z
commit: 99aae07
status: ALERTE - RÉGRESSION TTS
score: 64%
critical_issues:
  - TTS endpoint /tts retourne 500 Internal Server Error
  - TTS latence 485-787ms >> 50ms target
  - GPU 0% utilisation (RTX 4090 idle)
improvements:
  - Latence E2E 181.8ms < 200ms TARGET ATTEINT
  - WebSocket FONCTIONNEL
  - Tests 201/201 PASS
---

# Ralph Moderator - Sprint #46 - TRIADE CHECK PARANOÏAQUE

## SPRINT #46 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 7/10 | Tests PASS mais TTS /tts endpoint CASSÉ! |
| LATENCE | 8/10 | E2E 181.8ms < 200ms ✅ MAIS TTS 485-787ms ❌ |
| STREAMING | 7/10 | WebSocket OK mais TTS streaming non testé |
| HUMANITÉ | 4/10 | TTS /direct fonctionne mais lent, /tts CASSÉ |
| CONNECTIVITÉ | 6/10 | Backend UP, WS OK, TTS principal CASSÉ |

**SCORE TRIADE: 32/50 (64%) - RÉGRESSION -8 POINTS vs #45 (72%)**

---

## MESURES EXACTES - SPRINT #46

### TEST E2E LATENCE (MESSAGES UNIQUES - ANTI-CACHE!)

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  ✅ LATENCE E2E - TARGET ATTEINT                                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Run 1: 198ms  ✅ < 200ms                                                  ║
║  Run 2: 179ms  ✅ < 200ms                                                  ║
║  Run 3: 181ms  ✅ < 200ms                                                  ║
║  Run 4: 181ms  ✅ < 200ms                                                  ║
║  Run 5: 170ms  ✅ < 200ms                                                  ║
║                                                                            ║
║  MOYENNE: 181.8ms ✅ TARGET <200ms ATTEINT (-9.1%)                         ║
║                                                                            ║
║  NOTE: +5ms vs Sprint #45 (177ms) - légère dégradation                    ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

### TTS - CRITIQUE!

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  ❌ ALERTE TTS - ENDPOINT PRINCIPAL CASSÉ!                                ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  /tts (endpoint principal):                                               ║
║  ├── Status: 500 Internal Server Error                                    ║
║  ├── Avec API key: ÉCHEC                                                  ║
║  └── Sans API key: ÉCHEC                                                  ║
║                                                                            ║
║  /tts/direct (fallback):                                                  ║
║  ├── Status: 200 OK                                                       ║
║  ├── Audio: MP3 valide (~16KB pour phrase courte)                        ║
║  └── Latence: 485-787ms (TARGET <50ms = 10-15x trop lent!)               ║
║                                                                            ║
║  IMPACT SUR UX:                                                           ║
║  ├── LLM: 182ms                                                           ║
║  ├── TTS: ~650ms moyenne                                                  ║
║  └── TOTAL perçu: ~832ms avant audio - INACCEPTABLE!                     ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

### GPU STATUS - GASPILLAGE!

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  ⚠️ RTX 4090 - 49GB VRAM INUTILISÉ                                       ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  GPU: NVIDIA GeForce RTX 4090                                             ║
║  Utilization: 0%                                                          ║
║  Memory Used: 5428 MiB / 24564 MiB (22%)                                 ║
║  Temperature: 25°C (idle)                                                 ║
║                                                                            ║
║  Processes GPU: AUCUN!                                                    ║
║  Ollama: CHARGÉ mais IDLE                                                ║
║                                                                            ║
║  LE GPU N'EST PAS UTILISÉ POUR:                                          ║
║  ├── LLM inference (Groq API = cloud)                                    ║
║  ├── TTS (Edge-TTS = cloud Microsoft)                                    ║
║  └── STT (Whisper non testé)                                             ║
║                                                                            ║
║  19GB VRAM DISPONIBLES - POTENTIEL INEXPLOITÉ                            ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

### WEBSOCKET

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  ✅ WEBSOCKET FONCTIONNEL                                                 ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Test: ws://localhost:8000/ws/chat                                        ║
║  Résultat: 101 Switching Protocols - OK                                   ║
║  Keepalive: Timeout après ping                                            ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

### TESTS & BUILD

```
╔═══════════════════════════════════════════════════════════════════════════╗
║  ✅ TESTS: 201 passed, 2 skipped in 17.64s                               ║
║  ✅ BUILD: SUCCESS - Routes OK                                            ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║  Backend Health:                                                          ║
║  {                                                                         ║
║    "status": "healthy",                                                   ║
║    "groq": true,                                                          ║
║    "whisper": true,                                                       ║
║    "tts": true,    <-- MENSONGE! TTS /tts retourne 500!                  ║
║    "database": true                                                       ║
║  }                                                                         ║
║                                                                            ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## BLOCAGES CRITIQUES

| # | Issue | Sévérité | Impact |
|---|-------|----------|--------|
| 1 | TTS /tts endpoint 500 Error | **CRITICAL** | Endpoint principal inutilisable |
| 2 | TTS latence 485-787ms | **HIGH** | 10-15x trop lent vs target 50ms |
| 3 | GPU 0% utilisation | **MEDIUM** | Ressources gaspillées |
| 4 | Health check ment sur TTS | **MEDIUM** | Monitoring non fiable |

---

## ANALYSE TECHNIQUE TTS

### Problème Identifié

```python
# /tts utilise text_to_speech() qui ÉCHOUE
# /tts/direct utilise edge_tts directement qui FONCTIONNE

# La différence:
# /tts -> text_to_speech() -> ?????? -> 500 Error
# /tts/direct -> edge_tts.Communicate() -> 200 OK + Audio
```

### Solution Évidente

Le Worker DOIT:
1. Trouver pourquoi `text_to_speech()` échoue
2. Aligner /tts sur le code de /tts/direct qui fonctionne
3. OU remplacer complètement par edge_tts direct

---

## INSTRUCTIONS WORKER - SPRINT #47

### PRIORITÉ 1: RÉPARER /tts ENDPOINT (BLOQUANT!)

```bash
# 1. Trouver la fonction text_to_speech
grep -n "async def text_to_speech\|def text_to_speech" main.py

# 2. Comparer avec tts_direct qui fonctionne
# 3. Identifier l'erreur (logs, try/catch)
# 4. CORRIGER - pas de workaround, vraie correction
```

### PRIORITÉ 2: RÉDUIRE TTS LATENCE

Le TTS actuel fait 485-787ms. C'est INACCEPTABLE.

Options:
1. **Edge-TTS streaming** - premiers chunks avant fin génération
2. **TTS local GPU** - SpeechT5 ou Piper avec RTX 4090
3. **Caching intelligent** - pour phrases communes

```python
# EXEMPLE: TTS streaming first byte < 50ms
async def stream_tts_fast(text: str):
    communicate = edge_tts.Communicate(text, voice)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]  # Envoyer IMMÉDIATEMENT
```

### PRIORITÉ 3: UTILISER LE GPU!

```bash
# 19GB VRAM disponibles - utilisons-les!

# Option A: TTS local rapide
pip install piper-tts  # 15-30ms sur GPU

# Option B: LLM local pour backup/hybride
# Ollama déjà installé, phi3:mini disponible

# Option C: Whisper local optimisé
# Faster-whisper avec CUDA
```

### NE PAS FAIRE

- Ne PAS ignorer le 500 Error sur /tts
- Ne PAS compter sur /tts/direct comme solution permanente
- Ne PAS mentir dans les health checks
- Ne PAS valider 650ms TTS comme "acceptable"

---

## MÉTRIQUES TARGET SPRINT #47

| Métrique | Sprint #46 | Target #47 |
|----------|------------|------------|
| E2E Latency | 181.8ms ✅ | <180ms |
| TTS /tts | 500 ERROR ❌ | 200 OK |
| TTS latence | 650ms avg | <100ms |
| First audio byte | N/A | <50ms |
| GPU utilisation | 0% | >10% |
| Tests | 100% | 100% |

---

## MESSAGE FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  SPRINT #46: RÉGRESSION DÉTECTÉE                                             ║
║                                                                               ║
║  Score: 72% → 64% (-8 points)                                                ║
║  TTS: FONCTIONNEL → CASSÉ                                                    ║
║  Latence E2E: OK mais TTS 10-15x trop lent                                   ║
║                                                                               ║
║  LE SYSTÈME A RÉGRESSÉ DEPUIS LE DERNIER SPRINT.                             ║
║                                                                               ║
║  ACTIONS IMMÉDIATES:                                                          ║
║  1. RÉPARER /tts endpoint - BLOQUANT                                         ║
║  2. Réduire TTS latence de 650ms → <100ms                                    ║
║  3. Investiguer utilisation GPU                                              ║
║                                                                               ║
║  LA BARRE NE DOIT PAS BAISSER.                                               ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## CHECKLIST VALIDATION SPRINT #47

- [ ] /tts endpoint retourne 200 OK avec audio
- [ ] TTS latence < 100ms
- [ ] Health check reflète état réel TTS
- [ ] Tests TTS endpoint passent
- [ ] E2E latence maintenue < 200ms

---

*Ralph Moderator - Sprint #46 TRIADE CHECK*
*"64% (-8pts). TTS CASSÉ. RÉGRESSION INACCEPTABLE. RÉPARER IMMÉDIATEMENT."*
