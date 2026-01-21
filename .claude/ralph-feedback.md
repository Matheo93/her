---
reviewed_at: 2026-01-21T08:12:00Z
commit: fb52dca
status: SPRINT #65 - BACKEND CRASH - TORCH MANQUANT DANS VENV!
score: 12%
critical_issues:
  - TORCH MANQUANT: ModuleNotFoundError: No module named 'torch' (fast_tts.py:12)
  - VENV INCOMPLET: Le virtualenv n'a PAS torch installé!
  - BACKEND DOWN: Port 8000 ne répond plus car import échoue
  - GPU 0%: RTX 4090 inutilisée (20GB VRAM gaspillés)
improvements:
  - Ollama UP sur port 11434 (phi3:mini, qwen2.5:1.5b disponibles)
  - Torch système OK (2.9.1+cu128) - juste pas dans venv
  - Frontend build OK
  - Tests unitaires 202 passed
---

# Ralph Moderator - Sprint #65 - TORCH MANQUANT = CRASH

## VERDICT: BACKEND NE PEUT PAS DÉMARRER - TORCH ABSENT DU VENV

### ROOT CAUSE IDENTIFIÉE (08:12 UTC):

```bash
# Test définitif:
$ cd /home/dev/her/backend
$ source venv/bin/activate
$ python3 -c "import torch"
ModuleNotFoundError: No module named 'torch'

# Le venv a fastapi, uvicorn, numpy... mais PAS torch!
# fast_tts.py:12 fait "import torch" → ÉCHEC
# main.py importe fast_tts → CRASH avant même de démarrer

# SOLUTION UNIQUE:
pip install torch==2.9.1+cu128 --index-url https://download.pytorch.org/whl/cu128
```

---

## ANCIEN CONTENU (pour référence) - INSTABILITÉ CRITIQUE

### ÉTAT ACTUEL (TESTÉ 08:10 UTC):

```bash
# Backend (port 8000):
$ curl http://localhost:8000/health
curl: (7) Failed to connect

# Ollama (port 11434):
$ curl http://localhost:11434/api/tags
{"models":[{"name":"phi3:mini",...},{"name":"qwen2.5:1.5b",...}]}
✅ OLLAMA UP avec 2 modèles!

# GPU:
NVIDIA GeForce RTX 4090, 0%, 5650 MiB / 24564 MiB
```

---

## SPRINT #65 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 2/10 | Backend instable - crashe |
| LATENCE | 2/10 | Quand UP: 133-395ms (instable) |
| STREAMING | 0/10 | Backend DOWN = WebSocket inaccessible |
| HUMANITÉ | 2/10 | TTS non testable |
| CONNECTIVITÉ | 4/10 | Ollama UP, Backend DOWN |

**SCORE TRIADE: 10/50 (20%)**

---

## CHRONOLOGIE CRASH (08:00-08:10 UTC)

```
08:01 - Backend démarre OK
       ✅ Health: healthy, groq:true, whisper:true, tts:true

08:02 - Test latence (5 runs sur messages uniques):
       Run 1: 157ms ✓
       Run 2: 395ms ❌ (spike!)
       Run 3: 133ms ✓
       Run 4: 139ms ✓
       Run 5: 153ms ✓
       Stats: avg_latency_ms: 381ms (historique)

08:03 - Backend CRASH silencieux
       curl: (7) Connection refused

08:04 - Restart backend
       ✅ Backend UP de nouveau
       Ollama warmup: 2242ms

08:05 - Nouveaux tests
       Run 1-10: latency=VIDE, curl=10-15ms
       → Backend rejette les requêtes sans les traiter!
       → CRASH SILENCIEUX #2

08:08 - État: Backend DOWN, Ollama UP
08:10 - Confirmation: Port 8000 fermé
```

**PATTERN:** Le backend crashe après ~10-15 requêtes sans erreur visible!

---

## RAW TEST DATA

### TESTS LATENCE QUAND BACKEND ÉTAIT UP (08:02):

```
Messages UNIQUES (pas de cache!):
Run 1: 157ms ✓ (sous target)
Run 2: 395ms ❌ (2x target!)
Run 3: 133ms ✓ (excellent!)
Run 4: 139ms ✓
Run 5: 153ms ✓

MOYENNE: ~195ms (proche du target 200ms)
VARIANCE: 262ms (395-133)
```

**4/5 runs sous 200ms quand stable!**

### STATS SERVEUR (avant crash):

```json
{
  "total_requests": 947,
  "avg_latency_ms": 381,  // Historique avec rate-limits
  "requests_last_hour": 76,
  "active_sessions": 617
}
```

### GPU:

```
NVIDIA GeForce RTX 4090
Utilisation: 0%
VRAM utilisé: 5650 MiB
VRAM libre: 18914 MiB (19GB gaspillés!)
```

### OLLAMA STATUS:

```json
{
  "models": [
    {"name": "phi3:mini", "size": 2.1GB, "family": "phi3"},
    {"name": "qwen2.5:1.5b", "size": 986MB, "family": "qwen2"}
  ]
}
```

**OLLAMA FONCTIONNE!** Modèles locaux disponibles!

---

## DIAGNOSTIC

### CAUSE PROBABLE DU CRASH

1. **Memory leak** - Le serveur accumule de la mémoire
2. **Exception non gérée** - Erreur silencieuse sans log
3. **OOM kill** - Système tue le processus
4. **Conflit ressources** - Plusieurs Workers simultanés

### PROCESSUS SUSPECTS (observés):

```
[python3] <defunct>           ← ZOMBIE!
pip install torch             ← Worker A installe des deps
import backend.main           ← Worker B importe
pytest backend/tests          ← Worker C run tests
uvicorn main:app              ← Moderator démarre backend
```

**CHAOS:** Plusieurs processus se battent pour les mêmes ressources!

---

## POINTS POSITIFS

1. **Latence possible:** 133ms prouvé sur Run 3!
2. **Ollama fonctionnel:** phi3:mini et qwen2.5:1.5b chargés
3. **4/5 runs OK:** Quand stable, performance proche target

---

## INSTRUCTIONS WORKER - SPRINT #66

### PRIORITÉ ABSOLUE 1: STABILISER AVANT TOUT

```bash
# 1. Kill tous les processus parasites
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "pytest backend" 2>/dev/null
sleep 3

# 2. Vérifier qu'aucun processus ne bloque
ps aux | grep -E "python.*backend" | grep -v grep

# 3. Démarrer backend en FOREGROUND pour voir les erreurs
cd /home/dev/her/backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 2>&1 | tee /tmp/backend_debug.log

# 4. OBSERVER pendant 2 minutes
# Si crash: lire /tmp/backend_debug.log
```

### PRIORITÉ 2: UTILISER OLLAMA (DÉJÀ UP!)

```bash
# Ollama est déjà disponible avec phi3:mini
# Modifier .env:
USE_OLLAMA_PRIMARY=true
OLLAMA_MODEL=phi3:mini
USE_GROQ=false

# Test direct Ollama:
curl -s http://localhost:11434/api/generate \
  -d '{"model":"phi3:mini","prompt":"Bonjour"}' | jq '.response'
```

### PRIORITÉ 3: ACTIVER GPU POUR OLLAMA

```bash
# Vérifier si Ollama utilise le GPU:
OLLAMA_NUM_GPU=99 ollama run phi3:mini "test" &
nvidia-smi  # DOIT montrer >0%

# Si toujours 0%:
# Reinstaller Ollama avec CUDA:
curl -fsSL https://ollama.com/install.sh | OLLAMA_HOST=0.0.0.0 sh
systemctl restart ollama
```

### PRIORITÉ 4: MONITORING CRASH

```python
# Ajouter dans main.py pour capturer les crashs:
import traceback
import logging
logging.basicConfig(level=logging.DEBUG, filename='/tmp/eva_debug.log')

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logging.exception(f"CRASH: {exc}")
    traceback.print_exc()
    return JSONResponse(status_code=500, content={"error": str(exc)})
```

---

## BLOCAGES

| Issue | Sévérité | Action |
|-------|----------|--------|
| Backend crashe | CRITIQUE | Debug foreground |
| GPU 0% | HAUTE | Config Ollama CUDA |
| Spike 395ms | MOYENNE | Profiler après stabilisation |
| Rate limit Groq | BASSE | Ollama local = solution |

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║  SPRINT #65: INSTABILITÉ CRITIQUE                                ║
║                                                                   ║
║  ❌ Backend crashe après ~10 requêtes                            ║
║  ❌ Port 8000 DOWN actuellement                                  ║
║  ❌ GPU 0% (19GB VRAM gaspillés)                                 ║
║  ❌ Spike 395ms sur Run 2                                        ║
║                                                                   ║
║  ✅ Ollama UP avec phi3:mini + qwen2.5:1.5b                      ║
║  ✅ 4/5 runs sous 200ms quand stable                             ║
║  ✅ 133ms prouvé possible!                                       ║
║                                                                   ║
║  FOCUS SPRINT #66:                                                ║
║  1. Stabiliser le backend (ne plus crasher)                       ║
║  2. Utiliser Ollama local (déjà UP!)                             ║
║  3. Activer GPU pour Ollama                                       ║
║                                                                   ║
║  SCORE: 10/50 (20%)                                              ║
║                                                                   ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## MESSAGE AU WORKER

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║  WORKER: BONNE NOUVELLE - OLLAMA EST DÉJÀ UP!                    ║
║                                                                   ║
║  Tu as phi3:mini et qwen2.5:1.5b PRÊTS sur port 11434!           ║
║                                                                   ║
║  ACTIONS:                                                         ║
║  1. USE_OLLAMA_PRIMARY=true dans .env                            ║
║  2. OLLAMA_MODEL=phi3:mini                                       ║
║  3. Redémarrer backend PROPREMENT (un seul processus!)           ║
║  4. Tester 20 requêtes d'affilée                                 ║
║                                                                   ║
║  TARGET: Backend stable 5 minutes sans crash                     ║
║                                                                   ║
║  NE PAS FAIRE:                                                   ║
║  - Ajouter des features                                           ║
║  - Optimiser prématurément                                        ║
║  - Runner plusieurs Workers en parallèle                          ║
║                                                                   ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## COMPARAISON SPRINTS

| Sprint | Score | Status |
|--------|-------|--------|
| #61 | 2% | Backend crash numpy |
| #62 | 32% | Rate limit Groq |
| #63 | 56% | Meilleur sprint |
| #64 | 30% | Rate limit retour |
| **#65** | **20%** | **Instabilité crash** |

---

*Ralph Moderator - Sprint #65*
*"Backend crashe mais la solution est là: Ollama UP avec modèles locaux. Stabiliser d'abord, optimiser ensuite."*
