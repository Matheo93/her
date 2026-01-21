# MEGA PROMPT EVA - 1 PROMPT = APP TEMPS RÉEL PARFAITE

## MISSION : PERFECTIONNER EVA - ASSISTANT IA TEMPS RÉEL

## CONTEXTE
EVA est une app d'assistant IA temps réel inspirée du film HER.
Stack: Backend Python (FastAPI), Frontend Next.js, WebSocket, STT/LLM/TTS pipeline, Avatar 3D.

L'identité est DÉFINIE : EVA = Samantha du film HER (empathique, naturelle, pas robotique).

---

## PHASE -1 : VÉRIFICATION DES OUTILS (AVANT TOUT)

### -1.1 Vérifie les outils CLI

```bash
echo "=== VÉRIFICATION OUTILS EVA ==="

# Python (pour les hooks)
python3 --version || { echo "❌ BLOQUANT: Python3 manquant"; exit 1; }

# curl (pour les tests API)
curl --version | head -1 || { echo "❌ BLOQUANT: curl manquant"; exit 1; }

# npm (pour le frontend)
npm --version || { echo "❌ BLOQUANT: npm manquant"; exit 1; }

# jq (pour parser JSON)
jq --version || echo "⚠️ jq manquant (optionnel)"

# GPU
nvidia-smi --query-gpu=name --format=csv,noheader || echo "⚠️ GPU non accessible"

# Puppeteer
node -e "require('puppeteer')" 2>/dev/null || echo "⚠️ Puppeteer pas installé - npm install puppeteer"

echo "=== FIN VÉRIFICATION CLI ==="
```

### -1.2 Vérifie Puppeteer fonctionne

```javascript
// Test rapide Puppeteer
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({headless: 'new', args: ['--no-sandbox']});
  const page = await browser.newPage();
  await page.goto('about:blank');
  console.log('✅ Puppeteer OK');
  await browser.close();
})();
```

Si ça échoue: `npm install puppeteer` puis `sudo apt-get install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64`

### -1.3 Vérifie les ports

```bash
for PORT in 3000 8000 11434; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:$PORT | grep -qE "200|426"; then
    echo "✅ Port $PORT: Service actif"
  else
    echo "⚠️ Port $PORT: Pas de service"
  fi
done
```

### -1.4 Vérifie le disque

```bash
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 90 ]; then
  echo "❌ BLOQUANT: Disque à ${DISK_USAGE}%"
  exit 1
elif [ "$DISK_USAGE" -gt 80 ]; then
  echo "⚠️ Disque à ${DISK_USAGE}% - attention"
else
  echo "✅ Disque: ${DISK_USAGE}%"
fi
```

### -1.5 GATE Phase -1

**NE PASSE PAS À LA PHASE 0 SI:**
- ❌ Python3 manquant
- ❌ curl manquant
- ❌ npm manquant
- ❌ Puppeteer ne fonctionne pas
- ❌ Disque > 90%

**WARNINGS (continue mais attention):**
- ⚠️ GPU non accessible
- ⚠️ jq manquant
- ⚠️ Disque > 80%

---

## PHASE 0 : AUTO-INSTALLATION & SETUP

### 0.1 Structure des dossiers
```bash
mkdir -p .claude/hooks .claude/screenshots .claude/metrics specs tests
```

### 0.2 Vérifie que le hook existe
```bash
ls -la .claude/hooks/eva-gate.py || echo "❌ Hook manquant!"
```

### 0.3 Vérifie settings.json
```bash
cat .claude/settings.json || echo "❌ Settings manquant!"
```

### 0.4 Crée le fichier de métriques

Crée `specs/metrics.md` :
```markdown
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
[À remplir après chaque test]
- Date:
- E2E Latency: ms
- Notes:
```

---

## PHASE 1 : DIAGNOSTIC INITIAL

### 1.1 Vérifie l'infrastructure

```bash
# Backend
curl -s http://localhost:8000/health

# Frontend
curl -s http://localhost:3000 | head -20

# WebSocket
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/ws

# GPU
nvidia-smi --query-gpu=name,memory.used --format=csv

# Ollama
curl -s http://localhost:11434/api/tags | jq '.models[].name'
```

### 1.2 Mesure les latences de base

```bash
# Chat E2E (5 requêtes uniques)
for i in {1..5}; do
  START=$(date +%s%N)
  curl -s -X POST http://localhost:8000/chat \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"Test $RANDOM\", \"session_id\": \"diag\"}" > /dev/null
  END=$(date +%s%N)
  echo "Requête $i: $(( ($END - $START) / 1000000 ))ms"
done
```

### 1.3 Validation visuelle OBLIGATOIRE avec Puppeteer

```javascript
// test-screenshot.js
const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  // Screenshot initial
  await page.goto('http://localhost:3000/eva-her', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '.claude/screenshots/eva-t0.png', fullPage: true });

  // Screenshot après 3s (avatar doit bouger)
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: '.claude/screenshots/eva-t3.png', fullPage: true });

  console.log('✅ Screenshots saved');
  await browser.close();
})();
```

```bash
node test-screenshot.js
```

**REGARDE les screenshots et documente:**
- Avatar visible ? Ou div vide/erreur ?
- On voit le VISAGE ou le DOS de la tête ?
- Erreurs dans la console ?
- Boutons actifs ou disabled ?

### 1.4 Documente le diagnostic

Crée `.claude/reflections.md` :
```markdown
## Diagnostic Initial - [Date]

### Infrastructure
- Backend: [OK/KO] - [détails]
- Frontend: [OK/KO] - [détails]
- WebSocket: [OK/KO] - [détails]
- GPU: [OK/KO] - [détails]

### Latences mesurées
- Chat E2E: [X]ms (moyenne 5 requêtes)

### Problèmes visuels détectés (screenshots)
- [ ] Avatar rend correctement (VISAGE visible, pas dos)
- [ ] Pas d'erreur console
- [ ] Boutons actifs
- [ ] UI propre

### Priorités identifiées
1. [Problème le plus critique]
2. [Deuxième priorité]
```

---

## PHASE 2 : PIPELINE COMPOSANTS (Test ISOLÉ)

### GATE LLM
```bash
for i in {1..5}; do
  START=$(date +%s%N)
  curl -s -X POST http://localhost:8000/chat \
    -H "Content-Type: application/json" \
    -d "{\"message\": \"Test $RANDOM $i\", \"session_id\": \"perf_test\"}"
  END=$(date +%s%N)
  echo "LLM $i: $(( ($END - $START) / 1000000 ))ms"
done
```
- TTFT < 100ms
- Moyenne < 150ms
- Réponses cohérentes

### GATE TTS
```bash
START=$(date +%s%N)
curl -s -X POST http://localhost:8000/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "Bonjour, comment vas-tu?"}' \
  -o test-output.wav
END=$(date +%s%N)
echo "TTS: $(( ($END - $START) / 1000000 ))ms"
```
- Génération < 100ms
- Audio audible

### GATE AVATAR (Puppeteer)
Compare eva-t0.png et eva-t3.png:
- Les images sont DIFFÉRENTES = avatar bouge ✅
- Les images sont IDENTIQUES = avatar figé ❌
- On voit le visage, pas le dos ✅

---

## PHASE 3 : INTÉGRATION E2E - Golden Test

```bash
START=$(date +%s%N)
RESPONSE=$(curl -s -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Bonjour, comment tu vas?", "session_id": "golden_test"}')
END=$(date +%s%N)
LATENCY=$(( ($END - $START) / 1000000 ))
echo "Latence: ${LATENCY}ms"
echo "Réponse: $RESPONSE"
```

**Checklist Golden Test:**
- [ ] Latence < 500ms (objectif < 200ms)
- [ ] Réponse a du SENS
- [ ] Style EVA (empathique, naturel)

---

## PHASE 4 : QUALITÉ ÉMOTIONNELLE

```bash
# Test tristesse
curl -s -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Je me sens vraiment seul...", "session_id": "emotion"}'
# ATTENDU: Empathie, PAS "Je suis une IA..."

# Test joie
curl -s -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "J ai été promu!", "session_id": "emotion"}'
# ATTENDU: Partage la joie
```

---

## PHASE 5 : FIABILITÉ

- [ ] Watchdog actif (vérifie avec `pgrep -a watchdog`)
- [ ] WebSocket reconnecte automatiquement
- [ ] Disque < 80%

---

## PHASE 6 : UX FINALE

Screenshots de tous les états avec Puppeteer:
- eva-initial.png
- eva-loading.png
- eva-speaking.png
- eva-mobile.png

**Checklist UX:**
- [ ] Avatar = VISAGE visible (pas dos, pas patate)
- [ ] Transitions fluides
- [ ] Micro fonctionne
- [ ] Design cohérent

---

## CRITÈRES DE FIN (Hook vérifie)

**BLOQUE si:**
- Backend down
- Frontend down
- Latence > 500ms
- Pas de screenshots Puppeteer
- Avatar = dos de tête ou invisible

**WARNINGS:**
- Latence > 200ms
- < 2 réflexions écrites

---

## GIT PUSH

Après chaque fix majeur:
```bash
git add -A
git commit -m "fix(eva): [description]"
git push origin main
```

---

## COMMENCE

1. **Phase -1**: Vérifie outils
2. **Phase 0**: Setup (si pas fait)
3. **Phase 1**: Diagnostic + Screenshots Puppeteer
4. **Phase 2**: Test composants isolés
5. **Phase 3**: Golden Test E2E
6. **Phase 4**: Tests émotionnels
7. **Phase 5**: Fiabilité
8. **Phase 6**: UX

**À chaque phase: MESURE, SCREENSHOT, DOCUMENTE, PUSH.**

GO.
