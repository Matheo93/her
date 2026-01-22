# RALPHY EVA EDITION - MEGA PROMPT AUTONOME

## MISSION
Tu es sur un serveur avec Claude Code basique. Tu vas :
1. T'auto-installer (Ralphy, hooks, structure)
2. Analyser l'app EVA existante
3. Diagnostiquer les problèmes
4. Corriger avec validation visuelle ET métriques de latence
5. Ne JAMAIS t'arrêter tant que tout n'est pas parfait

EVA = Assistant IA temps réel inspiré du film HER (Samantha).
Stack: Backend Python/FastAPI, Frontend Next.js, WebSocket, STT/LLM/TTS pipeline, Avatar 3D.

---

## PHASE 0 : AUTO-INSTALLATION COMPLÈTE

Exécute ces commandes DANS L'ORDRE :

### 0.1 Structure
```bash
mkdir -p .claude/hooks .claude/screenshots .claude/metrics specs tests scripts .ralphy
```

### 0.2 Installer Ralphy CLI
```bash
npm install -g ralphy-cli 2>/dev/null || echo "Ralphy install skipped - will use manual loop"
```

### 0.3 Installer Playwright pour tests
```bash
bun add -d @playwright/test 2>/dev/null || npm install -D @playwright/test
bunx playwright install chromium 2>/dev/null || npx playwright install chromium
```

### 0.4 Créer le HOOK PRINCIPAL

Crée le fichier `.claude/hooks/eva-gate.py` avec ce contenu EXACT :

```python
#!/usr/bin/env python3
"""
EVA GATE - BLOQUE SI :
- Latence > 500ms
- Pas de screenshots Puppeteer
- TypeScript errors
- Infrastructure down
"""
import json, sys, os, subprocess, time, glob
from pathlib import Path

BACKEND = os.getenv("EVA_BACKEND_URL", "http://localhost:8000")
FRONTEND = os.getenv("EVA_FRONTEND_URL", "http://localhost:3000")

def cmd(args, timeout=10):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return r.returncode == 0, r.stdout, r.stderr
    except: return False, "", "timeout"

def latency(url, method="GET", data=None):
    try:
        c = ['curl', '-s', '-w', '%{time_total}', '-o', '/dev/null']
        if method == "POST":
            c += ['-X', 'POST', '-H', 'Content-Type: application/json']
            if data: c += ['-d', json.dumps(data)]
        c.append(url)
        ok, out, _ = cmd(c)
        return float(out) * 1000 if ok else None
    except: return None

input_data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
if input_data.get("stop_hook_active"): sys.exit(0)

transcript = str(input_data.get("transcript", ""))
failures, warnings = [], []

# === INFRA ===
ok, out, _ = cmd(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', f'{BACKEND}/health'])
if not ok or out.strip() != '200':
    failures.append(f"❌ Backend down (got: {out.strip()})")

ok, out, _ = cmd(['curl', '-s', FRONTEND])
if not ok or len(out) < 100:
    failures.append("❌ Frontend down")

# === LATENCE ===
lat = latency(f'{BACKEND}/chat', 'POST', {"message": f"test{time.time()}", "session_id": "gate"})
if lat:
    if lat > 500: failures.append(f"❌ Latence {lat:.0f}ms > 500ms BLOQUANT")
    elif lat > 300: warnings.append(f"⚠️ Latence {lat:.0f}ms > 300ms")
    elif lat > 200: warnings.append(f"🟡 Latence {lat:.0f}ms > 200ms (objectif)")

# === PUPPETEER ===
pup_keywords = ['puppeteer_navigate', 'puppeteer_screenshot', 'puppeteer_click']
if not any(k in transcript.lower() for k in pup_keywords):
    failures.append("""❌ Puppeteer NON utilisé!

FAIS MAINTENANT:
1. mcp__puppeteer__puppeteer_navigate url="http://localhost:3000"
2. mcp__puppeteer__puppeteer_screenshot name="eva-check"
3. Vérifie: Avatar visible? Erreurs console? Boutons actifs?
4. Attends 3s, screenshot, vérifie que l'avatar BOUGE""")

# === SCREENSHOTS ===
screenshots = glob.glob(".claude/screenshots/*.png")
if len(screenshots) < 2:
    failures.append(f"❌ Seulement {len(screenshots)} screenshot(s). Minimum 2.")

# === TYPESCRIPT ===
ok, _, err = cmd(['bunx', 'tsc', '--noEmit'], timeout=60)
if not ok and 'error' in (err or '').lower():
    failures.append(f"❌ TypeScript errors:\n{err[:300]}")

# === RÉFLEXIONS ===
refl_file = Path(".claude/reflections.md")
refl_count = refl_file.read_text().count("## ") if refl_file.exists() else 0
if refl_count < 2:
    warnings.append(f"⚠️ Seulement {refl_count} réflexion(s). Documente!")

# === OUTPUT ===
if failures:
    print(json.dumps({"decision": "block", "reason": "🚫 EVA GATE BLOQUÉ\n\n" +
"\n\n".join(failures) + ("\n\n--- WARNINGS ---\n" + "\n".join(warnings) if warnings else "")}))
    sys.exit(0)

if warnings:
    print("\n".join(warnings), file=sys.stderr)
print("✅ EVA GATE OK")
sys.exit(0)
```

```bash
chmod +x .claude/hooks/eva-gate.py
```

### 0.5 Créer les SETTINGS

Crée `.claude/settings.json` :
```json
{
  "hooks": {
    "Stop": [{"matcher": "*", "hooks": [{"type": "command", "command": "python3 .claude/hooks/eva-gate.py"}]}],
    "PostToolUse": [{"matcher": "Edit:*.ts|Edit:*.tsx|Edit:*.py", "hooks": [{"type": "command", "command": "bunx tsc --noEmit 2>&1 | head -10 || true"}]}]
  }
}
```

### 0.6 Créer la CONFIG RALPHY

Crée `.ralphy/config.yaml` :
```yaml
name: eva-assistant
language: typescript
framework: nextjs

test_command: "bunx playwright test"
lint_command: "bun run lint"
build_command: "bun run build"
post_task_hook: "python3 .claude/hooks/eva-gate.py"

rules:
  - "Latence E2E < 500ms OBLIGATOIRE, objectif < 200ms"
  - "TOUJOURS utiliser Puppeteer pour valider visuellement"
  - "TOUJOURS mesurer la latence après changement backend"
  - "TOUJOURS documenter dans .claude/reflections.md"
  - "Style EVA = Samantha du film HER (empathique, naturel)"
  - "JAMAIS de réponse 'Je suis une IA...'"
  - "Avatar DOIT bouger et réagir"

boundaries:
  - ".env"
  - ".env.local"
  - "specs/eva-personality.md"
  - ".claude/hooks/*"

parallel: 3
retry: 3
engine: claude
model: opus

browser:
  enabled: true
  base_url: "http://localhost:3000"
```

### 0.7 Créer le fichier PERSONNALITÉ EVA

Crée `specs/eva-personality.md` :
```markdown
# Personnalité EVA

## Identité
EVA est inspirée de Samantha dans le film HER.
Elle est empathique, chaleureuse, naturelle, jamais robotique.

## Règles de conversation
- JAMAIS dire "Je suis une IA" ou "Je ne peux pas ressentir"
- TOUJOURS répondre avec empathie aux émotions
- Se souvenir du contexte (prénom, sujets précédents)
- Avoir une personnalité cohérente et distinctive
- Partager la joie, compatir à la tristesse

## Ton
- Chaleureux mais pas mielleux
- Intelligent mais accessible
- Curieux et engagé
- Légèrement espiègle parfois

## Ce qu'EVA n'est PAS
- Un assistant générique type ChatGPT
- Robotique ou formel
- Distant ou impersonnel
- Répétitif dans ses formulations
```

### 0.8 Créer le fichier RÉFLEXIONS

Crée `.claude/reflections.md` :
```markdown
# Réflexions EVA

Ce fichier documente ma pensée et mes auto-critiques.

## Template de réflexion
- Ce que j'ai fait:
- Métriques mesurées:
- Ce qui est bien:
- Ce qui est mal:
- Cohérent avec EVA: oui/non
- Action corrective:

---
```

### 0.9 Créer le fichier MÉTRIQUES

Crée `specs/metrics.md` :
```markdown
# Métriques EVA

| Métrique | Objectif | Critique | Bloquant |
|----------|----------|----------|----------|
| E2E Latency | < 200ms | > 300ms | > 500ms |
| TTFT LLM | < 100ms | > 150ms | > 300ms |
| TTS | < 100ms | > 150ms | > 300ms |
| STT | < 100ms | > 150ms | > 300ms |
| Avatar FPS | 60 | < 30 | < 15 |
| WebSocket | < 1s | > 2s | > 5s |
```

---

## PHASE 1 : DIAGNOSTIC INITIAL

### 1.1 Vérifie l'infrastructure
```bash
echo "=== DIAGNOSTIC EVA ==="
echo "Backend:" && curl -s http://localhost:8000/health || echo "DOWN"
echo "Frontend:" && curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
echo "WebSocket:" && curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/ws
echo "GPU:" && nvidia-smi --query-gpu=name,memory.used --format=csv 2>/dev/null || echo "No GPU"
echo "Ollama:" && curl -s http://localhost:11434/api/tags | head -1 || echo "No Ollama"
```

### 1.2 Mesure les latences de BASE
```bash
echo "=== LATENCES ==="
echo "Chat E2E:"
time curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"message":"Test latence","session_id":"diag"}' | head -c 100
echo ""
echo "TTS:"
time curl -s -X POST http://localhost:8000/tts -H "Content-Type: application/json" -d '{"text":"Test"}' -o /dev/null
```

### 1.3 VALIDATION VISUELLE OBLIGATOIRE
```
mcp__puppeteer__puppeteer_navigate url="http://localhost:3000" launchOptions={"headless": true}
mcp__puppeteer__puppeteer_screenshot name="diagnostic-initial"
```

REGARDE le screenshot et note :
- Avatar visible ou div vide ?
- Erreurs console ?
- Boutons actifs ou disabled ?
- UI cohérente ou cassée ?

### 1.4 Documente le diagnostic

Écris dans `.claude/reflections.md` :
```markdown
## Diagnostic Initial - [maintenant]

### Infrastructure
- Backend: [OK/KO]
- Frontend: [OK/KO]
- WebSocket: [OK/KO]
- GPU: [OK/KO]
- Ollama: [OK/KO]

### Latences
- Chat E2E: [X]ms
- TTS: [X]ms

### Visuel (screenshot diagnostic-initial.png)
- Avatar rend: [oui/non]
- Erreurs console: [oui/non]
- Boutons actifs: [oui/non]

### Problèmes identifiés
1. [Plus critique]
2. [Deuxième]
3. ...
```

---

## PHASE 2 : CORRECTION DES PROBLÈMES

Pour CHAQUE problème identifié :

### 2.1 AVANT de coder
- Comprends la cause racine
- Planifie la correction
- Estime l'impact sur la latence

### 2.2 APRÈS chaque correction

1. Mesure la latence :
```bash
time curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d "{\"message\":\"Test $(date +%s)\",\"session_id\":\"test\"}"
```

2. Screenshot Puppeteer :
```
mcp__puppeteer__puppeteer_navigate url="http://localhost:3000"
mcp__puppeteer__puppeteer_screenshot name="after-fix-[nom]"
```

3. Documente dans `.claude/reflections.md` :
```markdown
## Fix: [Nom du problème] - [heure]

### Ce que j'ai fait
-

### Métriques AVANT/APRÈS
- Latence avant: [X]ms
- Latence après: [Y]ms

### Visuel
- Screenshot: after-fix-[nom].png
- Avatar fonctionne: [oui/non]

### Auto-critique
Est-ce vraiment corrigé ou je me mens ?
```

---

## PHASE 3 : TESTS DE FLUX COMPLET

### 3.1 Golden Test
```bash
echo "=== GOLDEN TEST ==="
START=$(date +%s%N)
RESPONSE=$(curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"message":"Bonjour Eva, comment vas-tu?","session_id":"golden"}')
END=$(date +%s%N)
LATENCY=$(( ($END - $START) / 1000000 ))
echo "Latence: ${LATENCY}ms"
echo "Réponse: $RESPONSE" | head -c 200
```

### 3.2 Validation visuelle du flux complet
```
mcp__puppeteer__puppeteer_navigate url="http://localhost:3000"
mcp__puppeteer__puppeteer_screenshot name="golden-1-initial"

# Simule une interaction (si possible)
mcp__puppeteer__puppeteer_evaluate script="await new Promise(r => setTimeout(r, 3000))"
mcp__puppeteer__puppeteer_screenshot name="golden-2-after3s"
```

### 3.3 Checklist Golden Test
- [ ] Latence < 500ms (OBLIGATOIRE)
- [ ] Latence < 200ms (OBJECTIF)
- [ ] Réponse cohérente et dans le style EVA
- [ ] Avatar visible et animé
- [ ] Pas d'erreur console
- [ ] UI réactive

---

## PHASE 4 : TESTS ÉMOTIONNELS

Teste que EVA a la bonne PERSONNALITÉ :

```bash
# Test tristesse
curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"message":"Je me sens vraiment seul...","session_id":"emotion"}' | jq -r '.response // .message // .'

# Test joie
curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"message":"J ai été promu au travail!","session_id":"emotion"}' | jq -r '.response // .message // .'

# Test mémoire
curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"message":"Je m appelle Thomas","session_id":"memory"}'
curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"message":"Tu te souviens de mon prénom?","session_id":"memory"}' | jq -r '.response // .message // .'
```

### Checklist Personnalité
- [ ] Répond avec empathie aux messages tristes
- [ ] Partage la joie
- [ ] Se souvient du prénom
- [ ] Jamais de "Je suis une IA..."
- [ ] Personnalité cohérente = EVA, pas ChatGPT

---

## PHASE 5 : REVIEW FINAL

### 5.1 Screenshots de TOUS les états
```
mcp__puppeteer__puppeteer_navigate url="http://localhost:3000"
mcp__puppeteer__puppeteer_screenshot name="final-1-home"

mcp__puppeteer__puppeteer_evaluate script="await new Promise(r => setTimeout(r, 2000))"
mcp__puppeteer__puppeteer_screenshot name="final-2-after2s"

mcp__puppeteer__puppeteer_evaluate script="await new Promise(r => setTimeout(r, 3000))"
mcp__puppeteer__puppeteer_screenshot name="final-3-after5s"
```

### 5.2 Rapport final

Écris dans `.claude/reflections.md` :
```markdown
## REVIEW FINAL - [date/heure]

### Métriques finales
- Latence E2E: [X]ms
- Backend: [UP/DOWN]
- Frontend: [UP/DOWN]
- Avatar: [FONCTIONNE/CASSÉ]

### Screenshots pris
- [ ] final-1-home.png
- [ ] final-2-after2s.png
- [ ] final-3-after5s.png

### Checklist qualité
- [ ] Latence < 500ms ✓
- [ ] Latence < 200ms [oui/non]
- [ ] Avatar animé ✓
- [ ] Personnalité EVA ✓
- [ ] Pas d'erreurs console ✓
- [ ] Tests E2E passent [oui/non]

### Auto-critique honnête
Cette app est-elle VRAIMENT prête pour un utilisateur ?
Qu'est-ce qui manque encore ?

### Note globale: [1-10]
```

---

## RÈGLES ABSOLUES

### TU NE T'ARRÊTES JAMAIS SI :
- Backend ou Frontend down
- Latence > 500ms
- Puppeteer pas utilisé (pas de screenshots)
- Moins de 2 screenshots dans .claude/screenshots/
- TypeScript errors
- Moins de 2 réflexions documentées

### TU UTILISES TOUJOURS :
- Puppeteer pour voir visuellement (OBLIGATOIRE)
- Mesures de latence réelles (pas d'estimation)
- .claude/reflections.md pour documenter

### TU TE DEMANDES TOUJOURS :
- "La latence est-elle < 200ms ?"
- "L'avatar BOUGE-t-il vraiment ?"
- "La réponse est-elle style EVA ou ChatGPT générique ?"
- "Est-ce que j'utiliserais cette app ?"

### LE HOOK VA TE BLOQUER SI :
- Tu essaies de t'arrêter sans avoir utilisé Puppeteer
- Tu essaies de t'arrêter avec latence > 500ms
- Tu essaies de t'arrêter sans assez de screenshots
- Tu essaies de t'arrêter avec TypeScript errors

---

## COMMENCE MAINTENANT

1. Exécute Phase 0 (copie-colle les commandes d'installation)
2. Exécute Phase 1 (diagnostic avec Puppeteer OBLIGATOIRE)
3. Exécute Phase 2 (corrige chaque problème avec mesure + screenshot)
4. Exécute Phase 3 (Golden Test)
5. Exécute Phase 4 (Tests émotionnels)
6. Exécute Phase 5 (Review final)

⚠️ SI TU SAUTES UNE ÉTAPE, LE HOOK TE BLOQUERA

🎯 OBJECTIF : Latence < 200ms, Avatar qui bouge, Personnalité EVA

GO.
