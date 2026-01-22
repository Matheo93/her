#!/bin/bash
# Monitor Ralph toutes les 300 secondes

LOG="/workspace/music-music-ai-training-api/.claude/logs/ralph-monitor.log"
mkdir -p "$(dirname $LOG)"

echo "=== RALPH MONITOR STARTED $(date) ===" | tee -a "$LOG"

while true; do
    echo "" | tee -a "$LOG"
    echo "═══════════════════════════════════════════════════════════" | tee -a "$LOG"
    echo "CHECK: $(date)" | tee -a "$LOG"
    echo "═══════════════════════════════════════════════════════════" | tee -a "$LOG"
    
    # Check if tmux session exists
    if ! tmux has-session -t eva-steroids 2>/dev/null; then
        echo "❌ TMUX SESSION DOWN - Relaunching..." | tee -a "$LOG"
        cd /workspace/music-music-ai-training-api && ./eva-steroids-launcher.sh
        sleep 30
        continue
    fi
    
    # Capture Ralph window
    RALPH_OUTPUT=$(tmux capture-pane -t eva-steroids:ralph -p 2>/dev/null | tail -30)
    
    # Check if Ralph is active
    if echo "$RALPH_OUTPUT" | grep -qE "Iteration|iter|Leavening|Considering|Running|Waiting"; then
        echo "✅ RALPH ACTIF" | tee -a "$LOG"
    else
        echo "⚠️  RALPH PEUT-ÊTRE INACTIF" | tee -a "$LOG"
    fi
    
    # Show last activity
    echo "--- Dernière activité Ralph ---" | tee -a "$LOG"
    echo "$RALPH_OUTPUT" | tail -15 | tee -a "$LOG"
    
    # Check services
    echo "" | tee -a "$LOG"
    echo "--- Services ---" | tee -a "$LOG"
    BACKEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null)
    FRONTEND=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)
    OLLAMA=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:11434/api/tags 2>/dev/null)
    
    echo "Backend: $BACKEND | Frontend: $FRONTEND | Ollama: $OLLAMA" | tee -a "$LOG"
    
    # Latency check
    START=$(date +%s%3N)
    curl -s -X POST http://localhost:8000/chat \
        -H "Content-Type: application/json" \
        -d '{"message":"monitor ping","session_id":"monitor"}' > /dev/null 2>&1
    END=$(date +%s%3N)
    LAT=$((END-START))
    echo "Latence: ${LAT}ms" | tee -a "$LOG"
    
    # Screenshot count
    SS_COUNT=$(find /workspace/music-music-ai-training-api/.claude/screenshots -name "*.png" 2>/dev/null | wc -l)
    echo "Screenshots: $SS_COUNT" | tee -a "$LOG"
    
    # Check if Ralph needs restart
    if echo "$RALPH_OUTPUT" | grep -qE "Goodbye|exit|No active"; then
        echo "🔄 RALPH TERMINÉ - Relance..." | tee -a "$LOG"
        tmux send-keys -t eva-steroids:ralph "/ralph-loop:ralph-loop Diagnostique et corrige EVA. Verifie latence moins de 500ms. Valide visuellement avec node scripts/screenshot.js. Teste avatar. Continue en boucle." C-m
        sleep 5
    fi
    
    echo "" | tee -a "$LOG"
    echo "⏳ Prochain check dans 300 secondes..." | tee -a "$LOG"
    sleep 300
done
