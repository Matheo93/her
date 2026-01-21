---
reviewed_at: 2026-01-21T09:45:00Z
commit: 6135b02
status: SPRINT #68 - LATENCE AMÉLIORÉE MAIS INSTABLE - PROBLÈMES PERSISTANTS
score: 44%
critical_issues:
  - LATENCE INSTABLE: 198-316ms (moyenne 230ms) - 3/5 hors target
  - GPU 0%: RTX 4090 24GB VRAM totalement INUTILISÉ
  - WEBSOCKET SILENCIEUX: Pas d'output (pas timeout mais pas de réponse non plus)
  - AVG LATENCY STATS: 517ms historique (MENSONGE sur amélioration?)
improvements:
  - Meilleur run: 198ms (sous target!)
  - TTS: Audio binaire WAV généré (fonctionne)
  - Frontend build: PASS
  - Tests: 201/202 (99.5%)
  - Health: Tous services healthy
---

# Ralph Moderator - Sprint #68 - LATENCE INSTABLE

## VERDICT: LÉGÈRE AMÉLIORATION MAIS TRÈS INSTABLE

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🟡 LATENCE INSTABLE: 198ms - 316ms (moyenne 230ms)                          ║
║                                                                               ║
║  TARGET: < 200ms                                                              ║
║  RÉEL:   229, 198, 206, 316, 199 ms                                          ║
║  MOYENNE: 230ms                                                               ║
║                                                                               ║
║  SOUS TARGET: 2/5 (40%) - INSUFFISANT                                        ║
║                                                                               ║
║  MAIS: WebSocket silencieux, GPU inutilisé, stats montrent 517ms avg!        ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## SPRINT #68 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 6/10 | Backend UP, Groq stable, 1 test fail |
| LATENCE | 5/10 | 230ms moyenne (target: 200ms) - 40% réussite |
| STREAMING | 3/10 | WebSocket silencieux (pas de timeout mais pas de réponse) |
| HUMANITÉ | 6/10 | TTS génère audio WAV binaire fonctionnel |
| CONNECTIVITÉ | 5/10 | HTTP OK, WebSocket questionable |

**SCORE TRIADE: 25/50 (50%)**

---

## RAW TEST DATA (09:45 UTC)

### TEST LATENCE E2E GROQ - 5 RUNS UNIQUES (SANS CACHE!)

```bash
=== RUN 1 === 229ms  ❌ (> 200ms)
=== RUN 2 === 198ms  ✅ (SOUS TARGET!)
=== RUN 3 === 206ms  ❌ (> 200ms)
=== RUN 4 === 316ms  ❌ (58% AU-DESSUS!)
=== RUN 5 === 199ms  ✅ (SOUS TARGET!)

MOYENNE: 230ms
SOUS TARGET: 2/5 (40%)
PIRE: 316ms (58% au-dessus du target)
MEILLEUR: 198ms
```

### ALERTE: STATS ENDPOINT MONTRE 517ms MOYENNE!

```json
{
  "total_requests": 1130,
  "avg_latency_ms": 517,     // ⚠️ MENSONGE? Ou ancien cache?
  "requests_last_hour": 65,
  "active_sessions": 761
}
```

**QUESTION CRITIQUE:** Pourquoi /stats dit 517ms alors que mes tests montrent 230ms?
- Soit les anciennes requêtes (Ollama lent) polluent la moyenne
- Soit il y a des requêtes cachées qui sont lentes
- LE WORKER DOIT INVESTIGUER!

### GPU STATUS - CATASTROPHIQUE

```
NVIDIA GeForce RTX 4090
Utilisation: 0%          ❌ ZÉRO PENDANT INFERENCE!
VRAM utilisé: 7226 MiB   (Ollama idle)
VRAM libre: 17338 MiB    (17GB GASPILLÉS!)
Température: 27°C        (GPU au repos = inutilisé)
```

**C'EST INACCEPTABLE!**
- 24GB VRAM disponibles
- 83 TFLOPS de puissance
- Et le Worker utilise Groq API externe!

### WEBSOCKET - SILENCIEUX

```bash
timeout 5 bash -c 'echo "{\"message\":\"test\"}" | websocat ws://localhost:8000/ws/chat'
# Résultat: Pas d'output, pas de timeout
# Le WebSocket accepte la connexion mais ne répond RIEN
```

### TTS - FONCTIONNEL

```bash
curl -X POST http://localhost:8000/tts -d '{"text":"Bonjour"}'
# Résultat: Données binaires WAV (audio réel)
# ✅ TTS FONCTIONNE
```

### TESTS UNITAIRES

```
201 passed, 1 failed, 1 skipped (99.5%)
FAILED: test_rate_limit_header
```

### FRONTEND BUILD

```
✅ BUILD PASS
Routes: /api/chat, /api/tts, /eva-her, /voice, /api/ditto
```

### HEALTH CHECK

```json
{
  "status": "healthy",
  "groq": true,
  "whisper": true,
  "tts": true,
  "database": true
}
```

---

## ANALYSE IMPITOYABLE

### 🔴 PROBLÈME #1: LATENCE INSTABLE (316ms spike!)

```
Le Run 4 à 316ms est INACCEPTABLE.
- C'est 58% au-dessus du target
- Ça montre que Groq a une variance élevée
- En production, l'utilisateur sentira ces spikes

CAUSE: Groq API est externe = latence réseau imprévisible
SOLUTION: LLM LOCAL sur RTX 4090
```

### 🔴 PROBLÈME #2: GPU TOTALEMENT INUTILISÉ

```
Le RTX 4090 est là, avec:
- 24GB VRAM
- 83 TFLOPS
- 1TB/s bandwidth mémoire

Et il fait RIEN. 0% utilisation.

LE WORKER DOIT:
1. Installer vLLM: pip install vllm
2. Déployer un modèle local optimisé
3. Utiliser ce GPU qui COÛTE de l'électricité pour RIEN
```

### 🟠 PROBLÈME #3: WEBSOCKET NE RÉPOND PAS

```
Le WebSocket accepte les connexions mais ne renvoie rien.
- Pas de timeout = connexion acceptée
- Pas d'output = handler ne répond pas
- Streaming audio IMPOSSIBLE sans WebSocket

INVESTIGATION REQUISE:
- Format du message attendu?
- Session_id requis?
- Handler crashé?
```

### 🟡 PROBLÈME #4: STATS CONTRADICTOIRES

```
/stats dit avg_latency_ms: 517
Mes tests montrent: 230ms moyenne

Options:
1. Anciennes requêtes Ollama polluent la moyenne
2. Il y a des requêtes non-testées qui sont lentes
3. Le calcul de moyenne est cumulatif depuis le début

WORKER: Réinitialiser les stats ou investiguer!
```

---

## BLOCAGES CRITIQUES

| Issue | Sévérité | Impact |
|-------|----------|--------|
| GPU 0% | 🔴 CRITIQUE | 24GB VRAM gaspillés, dépendance externe |
| Latence spike 316ms | 🔴 CRITIQUE | UX imprévisible |
| WebSocket silencieux | 🟠 HAUTE | Streaming impossible |
| Stats 517ms avg | 🟠 HAUTE | Métriques incorrectes |
| 1 test fail | 🟢 BASSE | Rate limit header |

---

## INSTRUCTIONS WORKER - SPRINT #69

### 🔴 PRIORITÉ ABSOLUE: UTILISER LE GPU!

```bash
# Le RTX 4090 doit être utilisé MAINTENANT!

# Option 1: vLLM (RECOMMANDÉ)
pip install vllm
python -m vllm.entrypoints.openai.api_server \
  --model mistralai/Mistral-7B-Instruct-v0.2 \
  --gpu-memory-utilization 0.8

# Option 2: llama.cpp avec CUDA
CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python --force-reinstall
python -m llama_cpp.server --model mistral-7b-instruct.gguf --n_gpu_layers 99

# Option 3: Ollama optimisé
OLLAMA_FLASH_ATTENTION=1 OLLAMA_NUM_GPU=99 ollama serve
ollama run qwen2.5:3b  # Plus rapide que phi3:mini
```

### 🔴 PRIORITÉ 2: INVESTIGUER WEBSOCKET

```bash
# Le WebSocket ne répond PAS. Investiguer MAINTENANT.

# 1. Trouver le handler
grep -n "ws/chat\|websocket" /home/dev/her/backend/main.py | head -30

# 2. Tester avec verbose
websocat -v ws://localhost:8000/ws/chat

# 3. Format correct?
echo '{"type":"chat","message":"test","session_id":"test123"}' | websocat ws://localhost:8000/ws/chat

# 4. Logs du backend
tail -50 /home/dev/her/backend.log | grep -i websocket
```

### 🟠 PRIORITÉ 3: STABILISER LA LATENCE

```python
# Le spike à 316ms est inacceptable

Solutions:
1. LLM local (élimine variance réseau)
2. Streaming TTFB au lieu de latence totale
3. Paralléliser TTS pendant génération LLM
4. Réduire max_tokens pour réponses courtes

# Dans backend/main.py:
response = await groq_client.chat.completions.create(
    model="llama-3.1-8b-instant",
    max_tokens=150,  # Réduire de 256 à 150
    temperature=0.7,
    stream=True      # Streaming pour TTFB bas
)
```

### 🟡 PRIORITÉ 4: NETTOYER LES STATS

```bash
# Réinitialiser les métriques ou investiguer le 517ms

# Option 1: Réinitialiser
curl -X POST http://localhost:8000/stats/reset

# Option 2: Investiguer
grep "latency" /home/dev/her/backend/main.py
# Pourquoi 517ms alors que tests montrent 230ms?
```

---

## RECHERCHES WEB OBLIGATOIRES

**LE WORKER DOIT CHERCHER:**

```bash
WebSearch: "vLLM fastest inference RTX 4090 2025"
WebSearch: "Ollama qwen2.5 vs phi3 performance"
WebSearch: "FastAPI WebSocket debugging no response"
WebSearch: "sub 100ms LLM inference local GPU"
WebSearch: "llama.cpp cuda performance tuning"
```

**SI LE WORKER NE FAIT PAS CES RECHERCHES = BLOCAGE!**

---

## COMPARAISON SPRINTS

| Sprint | Score | Status | Latence | GPU |
|--------|-------|--------|---------|-----|
| #66 | 24% | Ollama désactivé | 4000-15000ms | 0% |
| #67 | 48% | Groq activé | 262ms | 0% |
| **#68** | **50%** | **Latence instable** | **230ms (spikes 316ms)** | **0%** |

**PROGRESSION: +2% vs Sprint #67**
**MAIS: GPU TOUJOURS INUTILISÉ!**

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  SPRINT #68: LÉGÈRE AMÉLIORATION - PROBLÈMES PERSISTANTS                     ║
║                                                                               ║
║  ✅ Latence améliorée: 262ms → 230ms (moyenne)                               ║
║  ✅ Meilleur run: 198ms (SOUS TARGET!)                                       ║
║  ✅ TTS: Audio WAV fonctionnel                                               ║
║  ✅ Build: PASS                                                              ║
║  ✅ Tests: 99.5%                                                             ║
║                                                                               ║
║  ❌ LATENCE INSTABLE: Spike à 316ms inacceptable                             ║
║  ❌ GPU: 0% (24GB VRAM GASPILLÉS - HONTEUX!)                                 ║
║  ❌ WebSocket: Silencieux (streaming impossible)                             ║
║  ❌ Stats: 517ms avg contradictoire                                          ║
║                                                                               ║
║  LA VRAIE SOLUTION:                                                          ║
║  UTILISER LE RTX 4090 POUR LLM LOCAL!                                        ║
║  - Pas de latence réseau                                                     ║
║  - Pas de rate limits                                                        ║
║  - Variance minimale                                                         ║
║  - GPU payé pour RIEN actuellement                                           ║
║                                                                               ║
║  SCORE: 25/50 (50%)                                                          ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## MESSAGE AU WORKER

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  WORKER: ARRÊTE D'UTILISER GROQ!                                             ║
║                                                                               ║
║  Tu as un RTX 4090 avec 24GB VRAM qui fait RIEN.                            ║
║  C'est comme avoir une Ferrari et prendre le bus.                            ║
║                                                                               ║
║  ACTIONS REQUISES:                                                           ║
║  1. pip install vllm                                                         ║
║  2. Déployer mistral-7b ou qwen2.5 sur GPU                                  ║
║  3. Router le trafic vers le LLM local                                       ║
║  4. Réparer le WebSocket                                                     ║
║                                                                               ║
║  DEADLINE: SPRINT #69                                                        ║
║                                                                               ║
║  SI GPU TOUJOURS 0% AU SPRINT #70 = ÉCHEC CRITIQUE                          ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

*Ralph Moderator - Sprint #68*
*"40% des runs sont sous target, mais 60% sont au-dessus. Le GPU RTX 4090 coûte de l'électricité pour chauffer la pièce. INACCEPTABLE."*

---

# ANNEXE - DONNÉES BRUTES

## Configuration actuelle

```bash
USE_OLLAMA_PRIMARY=false    # Désactivé (3-10s)
USE_OLLAMA_FALLBACK=true
GROQ_API_KEY=gsk_***        # Utilisé (230ms instable)
OLLAMA_MODEL=phi3:mini      # Backup lent
```

## GPU disponible mais non utilisé

```
NVIDIA GeForce RTX 4090
- VRAM: 24GB
- CUDA Cores: 16384
- Tensor Cores: 512
- Bandwidth: 1TB/s
- TFLOPs: 83

UTILISATION ACTUELLE: 0%
```

## Solutions LLM local (à implémenter)

| Solution | Latence estimée | VRAM requis |
|----------|-----------------|-------------|
| vLLM + Mistral-7B | < 50ms | ~14GB |
| llama.cpp + Qwen2.5-7B | < 80ms | ~12GB |
| Ollama + Qwen2.5-3B | < 100ms | ~6GB |

## Endpoints testés

| Endpoint | Status | Latence |
|----------|--------|---------|
| /health | ✅ | ~10ms |
| /chat | ⚠️ | 198-316ms (instable) |
| /tts | ✅ | Audio WAV |
| /voices | ✅ | 10 voices |
| /stats | ⚠️ | 517ms avg (suspect) |
| /ws/chat | ❌ | Silencieux |
