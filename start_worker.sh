#!/bin/bash
cd /home/dev/her
export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH=/home/dev/her/backend

claude --dangerously-skip-permissions -p "Tu es Ralph Worker. Developpe HER/EVA. Lis .claude/WORKER_PROMPT.md. Trinite: latency+qualite+humanite. Zero API sauf Groq. Lis feedback dans .claude/ralph-feedback.md. Commence par explorer le code."
