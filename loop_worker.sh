#!/bin/bash
cd /home/dev/her
export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH=/home/dev/her/backend

while true; do
    echo "=== Starting Worker @ $(date) ==="
    claude --dangerously-skip-permissions -p "Tu es Ralph Worker H24. Développe HER/EVA. BOUCLE INFINIE: après chaque sprint, lis feedback puis continue. Lis .claude/WORKER_PROMPT.md. Trinité: latency+qualité+humanité. Lis .claude/ralph-feedback.md. Continue le travail."
    echo "=== Worker exited, restarting in 10s ==="
    sleep 10
done
