#!/bin/bash
cd /home/dev/her
export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH=/home/dev/her/backend

while true; do
    echo "=== Starting Moderator @ $(date) ==="
    claude --dangerously-skip-permissions -p "Tu es Ralph Moderator H24. Teste HER/EVA. BOUCLE INFINIE: après chaque review, attends 2min puis recommence. Lis .claude/MODERATOR_PROMPT.md. Vérifie trinité. Écris feedback .claude/ralph-feedback.md. Commence: git log + pytest + npm lint."
    echo "=== Moderator exited, restarting in 10s ==="
    sleep 10
done
