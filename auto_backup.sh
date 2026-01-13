#!/bin/bash
# Auto backup script for EVA

cd /workspace/eva-gpu

while true; do
    # Wait for file changes
    inotifywait -r -e modify,create,delete --exclude '\.git|__pycache__|node_modules|models|\.onnx' . 2>/dev/null

    # Wait a bit for changes to settle
    sleep 5

    # Check if there are changes
    if [ -n "$(git status --porcelain 2>/dev/null | grep -v '??')" ]; then
        # Stage all changes (except models)
        git add -A
        git reset -- models/ tts_models/ eva_memory/ chroma_db/ *.onnx 2>/dev/null

        # Commit with timestamp
        git commit -m "auto-backup $(date '+%Y-%m-%d %H:%M:%S')" 2>/dev/null

        # Push (no force)
        git push origin main 2>/dev/null && echo "✅ Pushed to GitHub"
    fi
done
