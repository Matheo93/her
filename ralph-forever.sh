#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# RALPH FOREVER V3 - NE S'ARRÊTE JAMAIS
# Recrée la window si elle meurt
# ═══════════════════════════════════════════════════════════════════════════

PROJECT="/workspace/music-music-ai-training-api"
LOG="$PROJECT/.claude/logs/ralph-forever.log"
SPRINT=235

mkdir -p "$(dirname $LOG)"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"
}

ensure_ralph_window() {
    # Check if ralph window exists
    if ! tmux list-windows -t eva-steroids 2>/dev/null | grep -q "ralph"; then
        log "🔧 Window ralph n'existe pas - CRÉATION"
        tmux new-window -t eva-steroids -n ralph "cd $PROJECT && claude --dangerously-skip-permissions"
        sleep 15  # Wait for Claude to start
        return 1  # Window was created
    fi
    return 0  # Window exists
}

restart_ralph() {
    log "🚀 RELANCE SPRINT $SPRINT"

    # Ensure window exists
    ensure_ralph_window

    # Clear any stuck state
    tmux send-keys -t eva-steroids:ralph C-c 2>/dev/null
    sleep 1

    # Send command
    tmux send-keys -t eva-steroids:ralph "/ralph-loop:ralph-loop Sprint $SPRINT Ameliore avatar UX latence mobile. Code teste valide. Boucle infinie." Enter

    SPRINT=$((SPRINT+1))
    sleep 5
    log "✅ Sprint $((SPRINT-1)) lancé"
}

check_ralph_active() {
    # First ensure window exists
    if ! ensure_ralph_window; then
        return 1  # Window was just created, needs restart
    fi

    local output=$(tmux capture-pane -t eva-steroids:ralph -p 2>/dev/null | tail -30)

    # Check if finished
    if echo "$output" | grep -qE "Brewed for|Baked for|Crunched for"; then
        return 1
    fi

    # Check if error or context exhausted
    if echo "$output" | grep -qE "API Error|Stop hook failed|Context left until auto-compact: [0-9]%"; then
        return 1
    fi

    # Check if active
    if echo "$output" | grep -qE "esc to interrupt|Running|tokens\)|Bash\(|Edit\(|Read\(|Search\("; then
        return 0
    fi

    # Check idle prompt
    local last=$(echo "$output" | tail -3)
    if echo "$last" | grep -qE "^❯ $|^❯$|Try \""; then
        return 1
    fi

    return 0
}

log "═══════════════════════════════════════════════════════════"
log "   RALPH FOREVER V3 - STARTED"
log "   Check toutes les 20 secondes"
log "   Recrée window si morte"
log "═══════════════════════════════════════════════════════════"

# Initial check
sleep 2
if ! check_ralph_active; then
    restart_ralph
fi

# Main loop
while true; do
    sleep 20

    if ! tmux has-session -t eva-steroids 2>/dev/null; then
        log "❌ SESSION TMUX DOWN"
        continue
    fi

    if ! check_ralph_active; then
        log "🔄 Ralph arrêté - RELANCE"
        restart_ralph
    fi
done
