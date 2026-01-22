#!/bin/bash
cd /workspace/music-music-ai-training-api
LOG=".claude/logs/auto-push.log"
mkdir -p .claude/logs

while true; do
    sleep 300  # Every 5 minutes

    CHANGES=$(git status --porcelain 2>/dev/null | wc -l)
    if [ "$CHANGES" -gt 0 ]; then
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
        git add -A 2>/dev/null
        git commit -m "🤖 Auto-save: Ralph Sprint $(date '+%H:%M') - $CHANGES files

Co-Authored-By: Ralph <ralph@eva.ai>" 2>/dev/null

        # Pull with rebase first to handle remote changes
        git pull --rebase origin main 2>&1 | tee -a "$LOG"

        git push origin main 2>&1 | tee -a "$LOG"
        echo "[$TIMESTAMP] Pushed $CHANGES files" >> "$LOG"
    else
        # Even if no local changes, try to push any unpushed commits
        UNPUSHED=$(git log origin/main..HEAD --oneline 2>/dev/null | wc -l)
        if [ "$UNPUSHED" -gt 0 ]; then
            git pull --rebase origin main 2>&1 | tee -a "$LOG"
            git push origin main 2>&1 | tee -a "$LOG"
            echo "[$(date '+%Y-%m-%d %H:%M')] Pushed $UNPUSHED unpushed commits" >> "$LOG"
        fi
    fi
done
