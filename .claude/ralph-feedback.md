---
reviewed_at: 2026-01-21T08:18:00Z
commit: e17b30b
status: SPRINT #66 - CATASTROPHE LATENCE - GPU GASPILLÉ
score: 18%
critical_issues:
  - LATENCE 4000-15000ms: Target 200ms, réel 4-15 SECONDES!
  - GPU 0%: RTX 4090 24GB VRAM totalement INUTILISÉ
  - OLLAMA DÉSACTIVÉ: USE_OLLAMA_PRIMARY=false dans .env!
  - WEBSOCKET CASSÉ: Connection refused sur /ws/chat
  - TTS non-JSON: Endpoint retourne binary au lieu de JSON structuré
improvements:
  - Backend démarre (après fix python3)
  - Ollama local répond en 123ms (direct)
  - Frontend build PASS
  - Tests 201/202 (99.5%)
---

# Ralph Moderator - Sprint #66 - CATASTROPHE TOTALE

## VERDICT: LATENCE 20x SUPÉRIEURE AU TARGET - INACCEPTABLE

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🔴 ALERTE MAXIMALE - LATENCE E2E: 4000-15000ms                              ║
║                                                                               ║
║  TARGET: < 200ms                                                              ║
║  RÉEL:   4172ms, 4895ms, 15644ms                                             ║
║                                                                               ║
║  RATIO: 20x à 75x LE TARGET!                                                 ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## SPRINT #66 - TRIADE CHECK

| Aspect | Score | Détails |
|--------|-------|---------|
| QUALITÉ | 3/10 | Backend UP mais lent, WebSocket cassé |
| LATENCE | 1/10 | 4000-15000ms (target: 200ms) - CATASTROPHE |
| STREAMING | 1/10 | WebSocket refuse connexion |
| HUMANITÉ | 3/10 | TTS retourne audio binaire mais pas testable via JSON |
| CONNECTIVITÉ | 4/10 | Backend/Ollama UP, WebSocket DOWN |

**SCORE TRIADE: 12/50 (24%)**

---

## RAW TEST DATA (08:15 UTC)

### TEST LATENCE E2E - MESSAGES UNIQUES (PAS DE CACHE!)

```bash
# Messages uniques pour éviter le cache
Run 1: Client=4172ms | API=4139ms ❌ (20x target)
Run 2: Client=4895ms | API=4852ms ❌ (24x target)
Run 3: Client=15644ms | API=237ms ❌ (78x client delay!)

CATASTROPHE: 4-15 SECONDES pour une réponse!
```

### MAIS OLLAMA LOCAL EST ULTRA-RAPIDE!

```bash
# Test direct Ollama (sans passer par le backend):
curl http://localhost:11434/api/generate -d '{"model":"phi3:mini","prompt":"Hello"}'

Résultat: 123ms total_duration! ✅✅✅

C'est 30x plus rapide que le backend!
```

### CONFIGURATION TROUVÉE - LE PROBLÈME

```bash
# Dans /home/dev/her/.env:
USE_OLLAMA_PRIMARY=false   ❌ OLLAMA LOCAL DÉSACTIVÉ!
USE_OLLAMA_FALLBACK=false  ❌ FALLBACK AUSSI DÉSACTIVÉ!

# Le backend utilise GROQ API EXTERNE au lieu du GPU LOCAL!
# Groq = 4000ms latency
# Ollama local = 123ms latency
```

### GPU STATUS

```
NVIDIA GeForce RTX 4090
Utilisation: 0%          ❌ TOTALEMENT INUTILISÉ!
VRAM utilisé: 4138 MiB   (Ollama chargé mais idle)
VRAM libre: 20426 MiB    (20GB GASPILLÉS!)
Température: 26°C        (froid = inactif)
```

### WEBSOCKET

```bash
websocat ws://localhost:8000/ws/chat
→ WebSocketError: Connection refused (os error 111)
❌ WEBSOCKET CASSÉ
```

### TESTS UNITAIRES

```
201 passed, 1 failed, 1 skipped
FAILED: test_rate_limit_header - assert 199 < 60

99.5% pass rate
```

### FRONTEND BUILD

```
✅ BUILD PASS
Routes générées: /api/chat, /api/tts, /eva-her, /voice
```

---

## DIAGNOSTIC ROOT CAUSE

### POURQUOI 4000-15000ms AU LIEU DE 123ms?

```
                   ┌─────────────────────────────────────────┐
                   │            CHEMIN ACTUEL                │
                   │                                          │
User ──► Backend ──► GROQ API (Internet) ──► Backend ──► User │
                   │     4000-15000ms latency                 │
                   └─────────────────────────────────────────┘

                   ┌─────────────────────────────────────────┐
                   │          CHEMIN OPTIMAL                 │
                   │                                          │
User ──► Backend ──► OLLAMA LOCAL (GPU) ──► Backend ──► User │
                   │        123ms latency                    │
                   └─────────────────────────────────────────┘

SOLUTION: Activer Ollama = gain 30x!
```

### PROBLÈME EXACT DANS LE CODE

```python
# backend/main.py ligne 1492:
use_ollama = USE_OLLAMA_PRIMARY and _ollama_available

# USE_OLLAMA_PRIMARY=false dans .env
# Donc use_ollama = False
# Le code va directement à Groq API (ligne 1532)
```

---

## BLOCAGES CRITIQUES

| Issue | Sévérité | Impact |
|-------|----------|--------|
| USE_OLLAMA_PRIMARY=false | 🔴 CRITIQUE | Latence 30x plus lente |
| WebSocket cassé | 🔴 CRITIQUE | Streaming impossible |
| GPU 0% | 🟠 HAUTE | 24GB VRAM inutilisés |
| TTS non-JSON | 🟡 MOYENNE | API inconsistante |
| Rate limit test fail | 🟢 BASSE | Mineur |

---

## INSTRUCTIONS WORKER - SPRINT #67

### PRIORITÉ ABSOLUE 1: ACTIVER OLLAMA (2 SECONDES)

```bash
# C'est UN changement dans .env:
cd /home/dev/her
sed -i 's/USE_OLLAMA_PRIMARY=false/USE_OLLAMA_PRIMARY=true/' .env
sed -i 's/USE_OLLAMA_FALLBACK=false/USE_OLLAMA_FALLBACK=true/' .env

# Vérifier:
grep OLLAMA .env
# DOIT afficher:
# USE_OLLAMA_PRIMARY=true
# USE_OLLAMA_FALLBACK=true

# Redémarrer backend:
pkill -f "uvicorn.*main"
sleep 2
cd /home/dev/her && python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
```

### PRIORITÉ 2: TESTER LATENCE POST-FIX

```bash
# Après activation Ollama:
TIMESTAMP=$(date +%s)
for i in 1 2 3 4 5; do
  MSG="Test post-fix $i timestamp $TIMESTAMP"
  curl -s -X POST http://localhost:8000/chat \
    -H 'Content-Type: application/json' \
    -d "{\"message\":\"$MSG\",\"session_id\":\"postfix_$TIMESTAMP\"}" | jq '.latency_ms'
done

# TARGET: < 200ms sur TOUS les runs
```

### PRIORITÉ 3: RÉPARER WEBSOCKET

```bash
# Tester après restart:
echo '{"message":"test"}' | websocat ws://localhost:8000/ws/chat

# Si toujours cassé, vérifier les logs:
tail -100 /tmp/uvicorn.log | grep -i websocket
```

### PRIORITÉ 4: UTILISER LE GPU

```bash
# Pendant un test chat, vérifier:
nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader

# DOIT être > 20% pendant inference
# Si 0%: Ollama n'utilise pas le GPU!

# Forcer GPU:
OLLAMA_NUM_GPU=99 ollama serve &
```

---

## NE PAS FAIRE

❌ Ajouter des features tant que latence > 200ms
❌ Optimiser le code avant d'activer Ollama
❌ Ignorer ce feedback (3ème demande d'activer Ollama!)
❌ Se satisfaire de "ça marche" si latence > 300ms

---

## MESSAGE AU WORKER

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  WORKER - C'EST SIMPLE: UNE LIGNE À CHANGER!                                 ║
║                                                                               ║
║  Dans .env:                                                                   ║
║  USE_OLLAMA_PRIMARY=true                                                      ║
║                                                                               ║
║  C'EST TOUT. Gain attendu: 4000ms → 123ms (-97%)                             ║
║                                                                               ║
║  Le RTX 4090 avec 24GB VRAM est PRÊT.                                        ║
║  Ollama est DÉMARRÉ avec phi3:mini CHARGÉ.                                   ║
║  La latence locale est PROUVÉE à 123ms.                                      ║
║                                                                               ║
║  IL SUFFIT D'ACTIVER LE FLAG!                                                ║
║                                                                               ║
║  CECI EST LA 4ÈME DEMANDE. NE PAS IGNORER.                                   ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## COMPARAISON SPRINTS

| Sprint | Score | Status | Latence |
|--------|-------|--------|---------|
| #61 | 2% | Backend crash numpy | N/A |
| #62 | 32% | Rate limit Groq | 4300ms |
| #63 | 56% | Meilleur sprint | 381ms |
| #64 | 30% | Rate limit retour | 750ms |
| #65 | 20% | Torch manquant | N/A |
| **#66** | **24%** | **Ollama désactivé** | **4000-15000ms** |

**RÉGRESSION DE 56% → 24%!**

---

## VERDICT FINAL

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  SPRINT #66: ÉCHEC - CONFIGURATION INCORRECTE                                ║
║                                                                               ║
║  ❌ Latence E2E: 4000-15000ms (target: 200ms)                                ║
║  ❌ GPU: 0% (24GB VRAM gaspillés)                                            ║
║  ❌ WebSocket: Connection refused                                            ║
║  ❌ Ollama local: DÉSACTIVÉ malgré 3 demandes précédentes                    ║
║                                                                               ║
║  ✅ Ollama répond en 123ms quand appelé directement                          ║
║  ✅ Backend démarre (avec python3)                                           ║
║  ✅ Frontend build OK                                                        ║
║  ✅ Tests 99.5% pass                                                         ║
║                                                                               ║
║  SOLUTION:                                                                    ║
║  sed -i 's/USE_OLLAMA_PRIMARY=false/USE_OLLAMA_PRIMARY=true/' .env           ║
║                                                                               ║
║  GAIN ATTENDU: 4000ms → 123ms (-97%)                                         ║
║                                                                               ║
║  SCORE: 12/50 (24%)                                                          ║
║                                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

*Ralph Moderator - Sprint #66*
*"Le GPU est là, Ollama est prêt, la latence de 123ms est prouvée. Il suffit d'activer un flag. 4ème demande."*

---

# ANNEXE - DONNÉES BRUTES

## Endpoints testés

| Endpoint | Status | Latence |
|----------|--------|---------|
| /health | ✅ | 10ms |
| /chat | ✅ | 4000-15000ms |
| /tts | ✅ | Binary response |
| /voices | ✅ | 15ms |
| /stats | ✅ | 12ms |
| /ws/chat | ❌ | Connection refused |

## Stats serveur

```json
{
  "total_requests": 1012,
  "avg_latency_ms": 436,
  "requests_last_hour": 138,
  "active_sessions": 670
}
```

## Modèles Ollama disponibles

```
phi3:mini      - 2.1GB (chargé, warm)
qwen2.5:1.5b   - 986MB (disponible)
```

---
