---
reviewed_at: 2026-01-21T07:30:00Z
commit: 0f1f788
status: SPRINT #60 - RÉGRESSION CONFIRMÉE (ANALYSE APPROFONDIE)
score: 35%
critical_issues:
  - Backend UTILISAIT GROQ au lieu d'OLLAMA malgré USE_OLLAMA_PRIMARY=true
  - Après restart forcé: Cold start 6528ms, Warm avg 292ms
  - WebSocket TIMEOUT (cassé)
  - GPU 0% entre les requêtes (modèle déchargé)
  - Overhead backend +120ms vs Ollama direct
improvements:
  - Tests 202/202 PASS
  - Frontend build OK (après suppression lock)
  - Ollama direct = 170ms (prouve que c'est possible)
  - TTS fonctionne (produit audio binaire)
---

# Ralph Moderator - Sprint #60 - ANALYSE APPROFONDIE POST-RESTART

## VERDICT: RÉGRESSION CONFIRMÉE - ROUTING LLM DÉFAILLANT

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║             🔴 RÉGRESSION MAJEURE - ANALYSE COMPLÈTE 🔴                       ║
║                                                                               ║
║  DÉCOUVERTE CRITIQUE:                                                         ║
║  Le backend utilisait GROQ au lieu d'OLLAMA malgré USE_OLLAMA_PRIMARY=true   ║
║                                                                               ║
║  PREUVE: API retournait "llm": "groq-llama-3.3-70b"                         ║
║  ATTENDU: "llm": "ollama-phi3:mini"                                          ║
║                                                                               ║
║  Après restart forcé: Ollama PRIMARY activé, mais latences TOUJOURS > 200ms ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## SPRINT #60 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 7/10 | Tests 202/202 PASS, build OK, mais config LLM incohérente |
| LATENCE | 3/10 | Cold 6528ms ❌, Warm avg 292ms ❌, Pass rate 28% |
| STREAMING | 2/10 | WebSocket TIMEOUT, streaming cassé |
| HUMANITÉ | 6/10 | TTS produit audio binaire valide |
| CONNECTIVITÉ | 4/10 | Backend OK post-restart, mais WS cassé, routing LLM cassé |

**SCORE TRIADE: 22/50 (44%) - RÉGRESSION vs Sprint #59 (80%)**

---

## TIMELINE DE L'INVESTIGATION

### Phase 1: État Initial
```bash
curl http://localhost:8000/
{"features":{"llm":"groq-llama-3.3-70b"}} # GROQ au lieu d'OLLAMA!

# .env pourtant configuré:
USE_OLLAMA_PRIMARY=true
OLLAMA_MODEL=phi3:mini
```

### Phase 2: Test Latence E2E (AVANT RESTART)
```bash
# Messages uniques - PAS DE CACHE
Run 1: 2134ms ❌ (Groq API lent)
Run 2: 4150ms ❌ (Groq API très lent)
Run 3: 153ms ✅ (CACHE HIT - triche!)
Run 4: 4082ms ❌
Run 5: 161ms ✅ (CACHE HIT)

# Les 153-161ms sont des FAUX POSITIFS (cache)
# La vraie latence Groq = 2-4 secondes
```

### Phase 3: Restart Backend Forcé
```bash
pkill -f uvicorn
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Logs de startup:
✅ Ollama local LLM connected (phi3:mini) [PRIMARY]
🔥 Warming up Ollama phi3:mini...
⚡ Ollama warmup complete: 78ms (model in VRAM)
```

### Phase 4: Test Latence E2E (APRÈS RESTART)
```bash
Run 1: 6528ms ❌ (COLD START CATASTROPHIQUE)
Run 2: 412ms ❌
Run 3: 399ms ❌
Run 4: 191ms ⚠️
Run 5: 273ms ❌
Run 6: 452ms ❌
Run 7: 156ms ✅
Run 8: 161ms ✅

STATS POST-RESTART:
- Cold: 6528ms ❌ (TARGET: <500ms)
- Warm min: 156ms ✅
- Warm max: 452ms ❌
- Warm avg: 292ms ❌ (TARGET: <200ms)
- Pass rate: 2/7 = 28% ❌ (TARGET: 100%)
```

### Phase 5: Test Ollama DIRECT
```bash
# Bypass backend, appeler Ollama directement:
Run 1: 190ms ✅
Run 2: 227ms ⚠️
Run 3: 143ms ✅
Run 4: 158ms ✅
Run 5: 156ms ✅

Moyenne: 175ms ✅

# PREUVE: Ollama est RAPIDE, le problème est le BACKEND!
```

---

## RAW TEST DATA COMPLÈTE

### GPU STATUS
```bash
nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv
NVIDIA GeForce RTX 4090, 0 %, 4329 MiB, 24564 MiB

# GPU: 0% utilisation ENTRE les requêtes
# Modèle chargé (4.3GB) mais déchargé rapidement
# 20GB VRAM INUTILISÉS
```

### WEBSOCKET
```bash
timeout 5 websocat ws://localhost:8000/ws/chat <<< '{"type":"message","content":"test"}'
# RÉSULTAT: TIMEOUT

# WebSocket CASSÉ - était OK au Sprint #59
```

### TTS
```bash
curl -s -X POST http://localhost:8000/tts -d '{"text":"Bonjour"}'
# RÉSULTAT: Données binaires audio (valide)
# Le TTS fonctionne, juste pas en JSON formaté
```

### OLLAMA STATUS
```bash
curl -s http://localhost:11434/api/tags | jq '.models[].name'
"phi3:mini"
"qwen2.5:1.5b"

# Ollama tourne avec phi3:mini ✅
```

### TESTS UNITAIRES
```bash
pytest backend/tests/ -q
202 passed, 1 skipped in 21.81s ✅
```

### FRONTEND BUILD
```bash
cd /home/dev/her/frontend && npm run build
# OK après suppression de .next/lock
```

---

## DIAGNOSTIC ROOT CAUSE

### PROBLÈME #1: ROUTING LLM DÉFAILLANT

Le flag `USE_OLLAMA_PRIMARY=true` N'ÉTAIT PAS respecté avant restart.

**Code source (main.py:486):**
```python
_ollama_available = False  # Initialisé à False
```

**Au startup (lignes 1097-1107):**
```python
if USE_OLLAMA_PRIMARY or USE_OLLAMA_FALLBACK:
    ollama_resp = await http_client.get(f"{OLLAMA_URL}/api/tags", timeout=2.0)
    if ollama_resp.status_code == 200:
        models = [m.get("name", "") for m in ollama_resp.json().get("models", [])]
        if any(OLLAMA_MODEL in m for m in models):
            _ollama_available = True
```

**HYPOTHÈSE:** La vérification Ollama au startup a échoué silencieusement (timeout 2s trop court? Ollama pas encore prêt?).

### PROBLÈME #2: COLD START 6.5 SECONDES

Malgré le warmup de 78ms au startup, la première vraie requête prend 6.5s.

**CAUSE:** Le modèle est déchargé par Ollama entre le warmup et la première requête.

**SOLUTION:** Forcer `OLLAMA_KEEP_ALIVE=-1` ou réduire l'intervalle keepalive.

### PROBLÈME #3: OVERHEAD BACKEND 120ms

- Ollama direct: ~175ms
- Backend via Ollama: ~292ms
- **Overhead: +117ms = +67%!**

**CAUSES POSSIBLES:**
- HTTP client overhead
- Context/history processing
- Logging synchrone
- Emotion analysis overhead
- Async/await non optimisé

### PROBLÈME #4: WEBSOCKET RE-CASSÉ

Le WebSocket qui fonctionnait au Sprint #59 est maintenant TIMEOUT.

**À INVESTIGUER:**
- Race condition au startup?
- Handler WS crashé?
- Port non bind?

---

## COMPARAISON SPRINTS

| Métrique | Sprint #58 | Sprint #59 | Sprint #60 | Trend |
|----------|------------|------------|------------|-------|
| Score | 62% | 80% | 44% | ❌ RÉGRESSION |
| Cold Start | 2200ms | 2229ms | 6528ms | ❌❌ 3x PIRE |
| Warm Avg | 201ms | 192ms | 292ms | ❌ +52% |
| Pass Rate | 50% | 75% | 28% | ❌ -47pts |
| WebSocket | TIMEOUT | OK ✅ | TIMEOUT | ❌ RE-CASSÉ |
| LLM Routing | ? | ? | CASSÉ | ❌ DÉCOUVERT |
| Ollama Direct | N/A | N/A | 175ms ✅ | NOUVEAU |

---

## BLOCAGES ABSOLUS

### 🚨 BLOCAGE #1: ROUTING LLM (CRITIQUE)

Le backend ne route pas vers Ollama de manière fiable.

**Actions:**
```python
# main.py - Ajouter logging explicite au startup:
print(f"🔍 _ollama_available: {_ollama_available}")
print(f"🔍 USE_OLLAMA_PRIMARY: {USE_OLLAMA_PRIMARY}")
print(f"🔍 Actual provider: {'OLLAMA' if _ollama_available else 'GROQ'}")

# Modifier endpoint / pour refléter le vrai état:
"llm": f"ollama-{OLLAMA_MODEL}" if _ollama_available else f"groq-{GROQ_MODEL_FAST}"
```

### 🚨 BLOCAGE #2: COLD START 6528ms (CRITIQUE)

**Actions:**
```bash
# Option 1: Variable d'environnement Ollama
export OLLAMA_KEEP_ALIVE=-1
systemctl restart ollama

# Option 2: Dans le code (plus fiable)
# Ajouter au payload de chaque requête:
"keep_alive": -1
```

### 🚨 BLOCAGE #3: OVERHEAD BACKEND +120ms (HAUTE PRIORITÉ)

**Actions:**
```bash
# Profiler le backend:
py-spy record -o profile.svg --pid $(pgrep -f uvicorn)
# Puis faire des requêtes et analyser
```

### 🚨 BLOCAGE #4: WEBSOCKET TIMEOUT (HAUTE PRIORITÉ)

**Actions:**
```python
# Diagnostic Python:
import asyncio
import websockets

async def test():
    try:
        async with websockets.connect("ws://localhost:8000/ws/chat") as ws:
            await ws.send('{"type":"ping"}')
            print(await ws.recv())
    except Exception as e:
        print(f"WS Error: {e}")

asyncio.run(test())
```

---

## INSTRUCTIONS WORKER - SPRINT #61

### PRIORITÉ 1: FIXER ROUTING LLM (URGENT!)

Le backend DOIT utiliser Ollama quand USE_OLLAMA_PRIMARY=true.

1. Ajouter logs de diagnostic au startup
2. Augmenter le timeout de vérification Ollama (2s → 10s)
3. Retenter la connexion Ollama si échec initial
4. Afficher le vrai provider dans l'API

### PRIORITÉ 2: ÉLIMINER COLD START

1. Mettre OLLAMA_KEEP_ALIVE=-1 dans l'environnement
2. Réduire keepalive interval à 2 secondes
3. Vérifier que le warmup maintient vraiment le modèle chaud

### PRIORITÉ 3: RÉPARER WEBSOCKET

1. Tester avec le script Python ci-dessus
2. Vérifier les logs pour erreurs WS
3. S'assurer que le port 8000 accepte les connexions WS

### PRIORITÉ 4: RÉDUIRE OVERHEAD BACKEND

1. Profiler avec py-spy
2. Identifier les goulots d'étranglement
3. Optimiser le hot path (context, history, logging)

---

## CE QUI VA BIEN

1. **Ollama direct rapide** - 175ms prouve que <200ms est atteignable
2. **TTS fonctionne** - Audio produit correctement
3. **Tests stables** - 202/202 PASS
4. **Build OK** - Frontend compile
5. **phi3:mini chargé** - Modèle disponible

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  SPRINT #60: RÉGRESSION CONFIRMÉE - MAIS ANALYSÉE EN PROFONDEUR              ║
║                                                                               ║
║  SCORE: 22/50 (44%) - CHUTE de 80% à 44%                                     ║
║                                                                               ║
║  ❌ LLM Routing CASSÉ - Backend utilisait Groq au lieu d'Ollama              ║
║  ❌ Cold start: 6528ms (3x pire)                                             ║
║  ❌ Warm avg: 292ms (50% au-dessus du target)                                ║
║  ❌ Pass rate: 28% (target 100%)                                             ║
║  ❌ WebSocket: TIMEOUT (re-cassé depuis Sprint #59)                          ║
║  ❌ GPU: 0% entre requêtes (modèle déchargé)                                 ║
║                                                                               ║
║  ✅ Ollama direct: 175ms (PREUVE que c'est le backend le problème!)          ║
║  ✅ Tests: 202/202 PASS                                                       ║
║  ✅ Build: OK                                                                 ║
║  ✅ TTS: Fonctionne                                                           ║
║                                                                               ║
║  ROOT CAUSE IDENTIFIÉE:                                                       ║
║  Le backend = goulot d'étranglement, pas Ollama                              ║
║  Overhead: +120ms (+67%)                                                      ║
║                                                                               ║
║  OBJECTIFS SPRINT #61:                                                        ║
║  1. Routing LLM fiable (Ollama PRIMARY effectif)                             ║
║  2. Cold start < 500ms                                                        ║
║  3. Warm avg < 200ms                                                          ║
║  4. WebSocket fonctionnel                                                     ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## NOTE FINALE

La bonne nouvelle: Ollama direct à 175ms prouve que le target <200ms est RÉALISABLE.

La mauvaise nouvelle: Le backend ajoute 120ms d'overhead inutile.

**Focus du Worker:**
1. Ne pas toucher à Ollama (il fonctionne bien)
2. Optimiser le backend Python
3. Fixer le routing LLM
4. Réparer le WebSocket

Le GPU à 0% entre les requêtes reste un gaspillage, mais c'est un problème secondaire si on atteint <200ms.

---

*Ralph Moderator - Sprint #60*
*"De 80% à 44%. Régression due au routing LLM. Ollama direct = 175ms. Backend = +120ms overhead. Focus sur le backend."*
