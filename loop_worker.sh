#!/bin/bash
cd /home/dev/her
export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH=/home/dev/her/backend

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
    claude --dangerously-skip-permissions -p "Tu es Ralph Worker ELITE. Tu crées l'APP NUMERO 1 - HER/EVA.

DIRECTIVES:
1. Lis .claude/WORKER_PROMPT.md et .claude/ralph-feedback.md
2. Continue à améliorer EVA avec ULTRA-QUALITÉ
3. Commits fréquents avec messages descriptifs
4. Tests TDD obligatoires
5. Palette HER uniquement (coral, cream, warmWhite, earth)

LIBERTÉ D'INNOVATION:
- Tu peux rechercher sur le web (WebSearch, WebFetch) des nouvelles libs
- Tu peux lire la documentation de libs existantes
- Tu peux croiser les infos et innover
- Tu peux proposer des features nouvelles si elles améliorent l'expérience HER
- Tu peux explorer des techniques d'animation avancées
- Tu peux améliorer les performances

EXEMPLES DE RECHERCHE:
- 'best Three.js face animation techniques 2026'
- 'GSAP micro-animation best practices'
- 'WebRTC audio optimization low latency'
- 'framer-motion spring physics natural feel'

APRÈS CHAQUE FEATURE:
- git add -A && git commit -m 'feat: description'
- Le script fait git push automatiquement

QUESTION ABSOLUE: Quelqu'un pourrait-il tomber amoureux de ça?

GO."

    # Auto-push after worker session
    auto_push

    echo "=== Worker exited, restarting in 10s ==="
    sleep 10
done
