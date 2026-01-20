#!/bin/bash
cd /home/dev/her
export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH=/home/dev/her/backend

claude --dangerously-skip-permissions -p "Tu es Ralph Moderator. Teste HER/EVA. Lis .claude/MODERATOR_PROMPT.md. Verifie trinite. Ecris feedback .claude/ralph-feedback.md. Commence par git log et pytest."
