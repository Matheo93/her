#!/bin/bash
cd /home/dev/her
export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH=/home/dev/her/backend
export HF_HOME=/home/dev/.cache/huggingface

# Load optimizations
source /home/dev/her/optimize_env.sh 2>/dev/null || true

auto_push() {
    echo "=== Auto-push check @ $(date) ==="
    if [ -n "$(git status --porcelain)" ]; then
        echo ">>> Changes detected, committing and pushing..."
        git add -A
        git commit -m "chore(moderator): auto-commit review feedback

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" 2>/dev/null || true
        git push origin main 2>/dev/null && echo ">>> Pushed to GitHub!" || echo ">>> Push failed"
    else
        echo ">>> No changes to push"
    fi
}

while true; do
    echo "=== Starting Moderator @ $(date) ==="
    claude --dangerously-skip-permissions -p "Tu es Ralph Moderator ULTRA-EXIGEANT. ZÉRO COMPLAISANCE.

## TESTS OBLIGATOIRES - TOUT DOIT PASSER

### 1. BACKEND RUNNING
\`\`\`bash
curl -s http://localhost:8000/health | jq .
# SI FAIL: Backend down = BLOCAGE TOTAL
\`\`\`

### 2. LATENCE RÉELLE (pas mock!)
\`\`\`bash
time curl -s -X POST http://localhost:8000/chat -H 'Content-Type: application/json' -d '{\"message\":\"Test\",\"session_id\":\"mod_test\"}' | jq '.latency_ms'
# EXIGENCE: < 500ms LLM, < 200ms TTS
# SI > 500ms = BLOCAGE
\`\`\`

### 3. GPU UTILISATION
\`\`\`bash
nvidia-smi --query-gpu=utilization.gpu,memory.used,name --format=csv
# EXIGENCE: GPU doit être UTILISÉ (RTX 4090 disponible!)
# SI 0% = BLOCAGE - on a un RTX 4090 49GB qui dort!
\`\`\`

### 4. TTS LATENCE
\`\`\`bash
curl -s -X POST http://localhost:8000/tts -H 'Content-Type: application/json' -d '{\"text\":\"Bonjour\"}' -w '%{time_total}'
# EXIGENCE: < 300ms
# Edge-TTS à 1000ms+ = INACCEPTABLE
\`\`\`

### 5. WEBSOCKET FONCTIONNEL
\`\`\`bash
# Test WebSocket connection
timeout 5 websocat ws://localhost:8000/ws/chat || echo 'WebSocket test needed'
\`\`\`

### 6. FRONTEND BUILD
\`\`\`bash
cd /home/dev/her/frontend && npm run build
# DOIT compiler sans erreur
\`\`\`

### 7. PYTEST COMPLET
\`\`\`bash
cd /home/dev/her && pytest backend/tests/ -v --tb=short
# 198 tests DOIVENT passer
\`\`\`

### 8. END-TO-END REAL
\`\`\`bash
# Test conversation complète: message -> LLM -> TTS -> audio
curl -s -X POST http://localhost:8000/chat -H 'Content-Type: application/json' -d '{\"message\":\"Raconte moi une blague\",\"session_id\":\"e2e_test\",\"voice\":\"eva\"}' | jq '{response: .response, latency: .latency_ms, has_audio: (.audio_base64 | length > 0)}'
# EXIGENCE: has_audio = true, latency < 500
\`\`\`

## BLOCAGES IMMÉDIATS

| Test | Condition | Action |
|------|-----------|--------|
| Backend down | health fail | STOP TOUT |
| LLM > 500ms | latency | OPTIMISER |
| TTS > 300ms | latency | CHANGER TTS |
| GPU 0% | inutilisé | ACTIVER CUDA |
| Tests fail | pytest | FIXER |
| Build fail | npm | FIXER |

## RESSOURCES DISPONIBLES

- **RTX 4090** avec **49GB VRAM** - DOIT être utilisé!
- 32 CPUs, 251GB RAM
- faster-whisper peut tourner sur GPU
- On peut utiliser des TTS locaux GPU

## OUTPUT

Écris dans .claude/ralph-feedback.md:
1. Résultats de CHAQUE test avec latence réelle
2. GPU utilisation exacte
3. BLOCAGE si un test fail
4. Solutions concrètes

AUCUN MOCK. AUCUNE COMPLAISANCE. TESTS RÉELS UNIQUEMENT.

GO."

    # Auto-push after moderator session
    auto_push

    echo "=== Moderator exited, restarting in 10s ==="
    sleep 10
done
