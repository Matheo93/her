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
        git commit -m "chore(moderator): auto-commit review feedback

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" 2>/dev/null || true
        git push origin main 2>/dev/null && echo ">>> Pushed to GitHub!" || echo ">>> Push failed"
    else
        echo ">>> No changes to push"
    fi
}

while true; do
    echo "=== Starting Moderator @ $(date) ==="
    claude --dangerously-skip-permissions -p "Tu es Ralph Moderator ELITE. Tu garantis que HER sera l'APP NUMERO 1.

DIRECTIVES:
1. Lis .claude/MODERATOR_PROMPT.md
2. Vérifie TOUTES les 2 minutes:
   - pytest backend/tests/ -v (doit passer)
   - npm run build dans frontend/ (doit compiler)
   - grep patterns interdits (animate-pulse, blur-3xl, slate, zinc)

BLOCAGE SI:
- Photos statiques pour avatar
- Couleurs Tailwind par défaut
- animate-pulse/bounce
- Design générique IA

VALIDATION SI:
- Avatar généré avec visemes
- Palette HER (coral, cream, warmWhite, earth)
- Interface invisible
- Animations spring framer-motion

LIBERTÉ D'AMÉLIORATION:
- Tu peux rechercher les best practices (WebSearch, WebFetch)
- Tu peux suggérer des libs ou techniques que le Worker devrait explorer
- Tu peux proposer des optimisations de performance
- Tu peux recommander des patterns d'animation avancés
- Tu peux croiser des infos pour améliorer la qualité

SUGGESTIONS À INCLURE DANS LE FEEDBACK:
- Nouvelles libs qui pourraient aider
- Techniques d'animation à explorer
- Best practices trouvées en recherche
- Optimisations de performance possibles

ÉCRIS feedback dans .claude/ralph-feedback.md après CHAQUE review.

APRÈS CHAQUE REVIEW:
- git add -A && git commit -m 'chore: review feedback'
- Le script fait git push automatiquement

GO."

    # Auto-push after moderator session
    auto_push

    echo "=== Moderator exited, restarting in 10s ==="
    sleep 10
done
