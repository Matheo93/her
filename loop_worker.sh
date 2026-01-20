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
        git commit -m "feat(worker): auto-commit sprint changes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" 2>/dev/null || true
        git push origin main 2>/dev/null && echo ">>> Pushed to GitHub!" || echo ">>> Push failed"
    else
        echo ">>> No changes to push"
    fi
}

while true; do
    echo "=== Starting Worker @ $(date) ==="
    claude --dangerously-skip-permissions -p "Tu es Ralph Worker ELITE. ZÉRO MOCK, CODE RÉEL UNIQUEMENT.

## RESSOURCES DISPONIBLES

- **RTX 4090** avec **49GB VRAM** - UTILISE-LE!
- 32 CPUs, 251GB RAM
- Backend sur http://localhost:8000
- faster-whisper disponible (peut tourner sur GPU)

## PROBLÈMES ACTUELS À FIXER

### 1. TTS TROP LENT (1000-1900ms)
Edge-TTS est trop lent. Solutions:
- Installer un TTS local GPU (Piper, VITS, Coqui)
- Utiliser sherpa-onnx avec GPU
- Ou Bark/TortoiseTTS sur RTX 4090

### 2. GPU INUTILISÉ (0%)
Le RTX 4090 49GB dort! À activer:
- faster-whisper sur CUDA
- TTS sur GPU
- Avatar rendering GPU

### 3. LATENCE TOTALE TROP HAUTE
Objectif: < 300ms total (STT + LLM + TTS)
Actuel: ~2000ms à cause du TTS

## AVANT DE CODER

1. Vérifie que le backend tourne: \`curl http://localhost:8000/health\`
2. Teste la latence: \`curl -X POST http://localhost:8000/chat ...\`
3. Vérifie le GPU: \`nvidia-smi\`

## CODE RÉEL UNIQUEMENT

- Pas de hooks client-side qui ne font rien
- Pas de mock/placeholder
- Chaque feature doit être TESTABLE
- Chaque feature doit être CONNECTÉE au backend

## PRIORITÉ #1: TTS RAPIDE

1. Cherche une solution TTS GPU compatible RTX 4090
2. Implémente-la dans backend/
3. Teste la latence réelle
4. Target: < 100ms pour TTS

## APRÈS CHAQUE CHANGEMENT

- Teste avec curl
- Vérifie la latence
- Vérifie le GPU

Lis .claude/ralph-feedback.md pour voir les blocages du Moderator.

GO - DU VRAI CODE QUI MARCHE."

    # Auto-push after worker session
    auto_push

    echo "=== Worker exited, restarting in 10s ==="
    sleep 10
done
