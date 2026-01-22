#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# RALPH FOREVER - NE S'ARRÊTE JAMAIS
# Vérifie toutes les 30 secondes et relance immédiatement si Ralph s'arrête
# ═══════════════════════════════════════════════════════════════════════════

PROJECT="/workspace/music-music-ai-training-api"
LOG="$PROJECT/.claude/logs/ralph-forever.log"
SPRINT=1

mkdir -p "$(dirname $LOG)"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"
}

restart_ralph() {
    log "🚀 STARTING SPRINT $SPRINT"

    # Send the ralph command
    tmux send-keys -t eva-steroids:ralph "/ralph-loop:ralph-loop Sprint $SPRINT - Diagnostique EVA en boucle infinie. Latence moins de 500ms. Screenshots obligatoires. Teste avatar et personnalite. Continue sans fin." C-m

    sleep 3

    # Send Enter if needed
    tmux send-keys -t eva-steroids:ralph Enter 2>/dev/null

    SPRINT=$((SPRINT+1))

    log "✅ Sprint $((SPRINT-1)) lancé"
}

check_ralph_active() {
    local output=$(tmux capture-pane -t eva-steroids:ralph -p 2>/dev/null | tail -20)

    # Check if Ralph is actively running
    if echo "$output" | grep -qE "Running|Waiting|Considering|Leavening|Beboppin|Photosynthesizing|Baking"; then
        return 0  # Active
    fi

    # Check if Ralph finished (Baked for X)
    if echo "$output" | grep -qE "Baked for|Goodbye|terminé|loop found"; then
        return 1  # Finished - needs restart
    fi

    # Check if waiting for input (just prompt)
    if echo "$output" | grep -qE "^❯ $|^❯$"; then
        return 1  # Idle - needs restart
    fi

    return 0  # Assume active
}

log "═══════════════════════════════════════════════════════════"
log "   RALPH FOREVER STARTED"
log "   Vérifie toutes les 30 secondes"
log "   NE S'ARRÊTE JAMAIS"
log "═══════════════════════════════════════════════════════════"

# Initial check - start Ralph if not running
sleep 2
if ! check_ralph_active; then
    log "⚡ Ralph inactif au démarrage - Lancement initial..."
    restart_ralph
fi

# Main loop - check every 30 seconds
while true; do
    sleep 30

    # Check if tmux session exists
    if ! tmux has-session -t eva-steroids 2>/dev/null; then
        log "❌ SESSION TMUX DOWN - Relancement complet..."
        cd "$PROJECT" && ./eva-steroids-launcher.sh
        sleep 30
        restart_ralph
        continue
    fi

    # Check if Ralph is active
    if ! check_ralph_active; then
        log "🔄 Ralph terminé ou inactif - RELANCE IMMÉDIATE"
        restart_ralph
    else
        # Silent check - just log occasionally
        if [ $((RANDOM % 10)) -eq 0 ]; then
            SS=$(find "$PROJECT/.claude/screenshots" -name "*.png" 2>/dev/null | wc -l)
            log "✅ Ralph actif | Screenshots: $SS"
        fi
    fi
done
