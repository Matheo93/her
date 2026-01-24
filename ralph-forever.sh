#!/bin/bash
# RALPH FOREVER V4 - ULTRA AGRESSIF
# Kill et recrée si bloqué

PROJECT="/workspace/music-music-ai-training-api"
LOG="$PROJECT/.claude/logs/ralph-forever.log"
SPRINT=520
LAST_COMMIT=""
STUCK_COUNT=0

mkdir -p "$(dirname $LOG)"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"
}

force_restart_ralph() {
    log "🔥 FORCE RESTART RALPH"

    # Kill window completely
    tmux kill-window -t eva-steroids:ralph 2>/dev/null
    sleep 3

    # Create fresh window
    tmux new-window -t eva-steroids -n ralph "cd $PROJECT && claude --dangerously-skip-permissions"
    sleep 15

    # Send command AND press Enter multiple times
    tmux send-keys -t eva-steroids:ralph "/ralph-loop:ralph-loop Sprint $SPRINT Ameliore avatar UX latence mobile. Code teste valide. Boucle infinie." Enter
    sleep 3
    tmux send-keys -t eva-steroids:ralph Enter
    sleep 2
    tmux send-keys -t eva-steroids:ralph Enter
    sleep 2
    tmux send-keys -t eva-steroids:ralph Enter

    SPRINT=$((SPRINT+1))
    STUCK_COUNT=0
    sleep 5
    log "✅ Sprint $((SPRINT-1)) lancé FRESH"
}

check_progress() {
    # Get current last commit
    CURRENT_COMMIT=$(cd $PROJECT && git log --oneline -1 2>/dev/null | cut -d' ' -f1)

    if [ "$CURRENT_COMMIT" = "$LAST_COMMIT" ]; then
        STUCK_COUNT=$((STUCK_COUNT+1))
        log "⚠️ Pas de nouveau commit ($STUCK_COUNT/3)"

        if [ $STUCK_COUNT -ge 3 ]; then
            log "❌ BLOQUÉ 3 checks - FORCE RESTART"
            force_restart_ralph
        fi
    else
        STUCK_COUNT=0
        LAST_COMMIT=$CURRENT_COMMIT
        log "✅ Nouveau commit: $CURRENT_COMMIT"
    fi
}

check_ralph_alive() {
    # Check window exists
    if ! tmux list-windows -t eva-steroids 2>/dev/null | grep -q ralph; then
        log "❌ Window ralph MORTE"
        force_restart_ralph
        return
    fi

    local output=$(tmux capture-pane -t eva-steroids:ralph -p 2>/dev/null | tail -20)

    # Check for fatal states
    if echo "$output" | grep -qE "Brewed for|Baked for|Crunched for|Context left until auto-compact: [0-9]%|Interrupted"; then
        log "❌ Ralph TERMINÉ ou LOW CONTEXT"
        force_restart_ralph
        return
    fi

    # Check if active
    if echo "$output" | grep -qE "esc to interrupt|Running|tokens\)"; then
        log "✅ Ralph ACTIF"
    else
        log "⚠️ Ralph peut-être IDLE"
    fi
}

log "═══════════════════════════════════════════════════════════"
log "   RALPH FOREVER V4 - ULTRA AGRESSIF"
log "   Check 30s + progress check"
log "═══════════════════════════════════════════════════════════"

# Initial
LAST_COMMIT=$(cd $PROJECT && git log --oneline -1 2>/dev/null | cut -d' ' -f1)

while true; do
    sleep 30

    if ! tmux has-session -t eva-steroids 2>/dev/null; then
        log "❌ SESSION DOWN"
        continue
    fi

    check_ralph_alive
    check_progress
done
