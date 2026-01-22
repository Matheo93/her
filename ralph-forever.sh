#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# RALPH FOREVER - NE S'ARRÊTE JAMAIS
# Vérifie toutes les 20 secondes et relance immédiatement si Ralph s'arrête
# ═══════════════════════════════════════════════════════════════════════════

PROJECT="/workspace/music-music-ai-training-api"
LOG="$PROJECT/.claude/logs/ralph-forever.log"
SPRINT=230

mkdir -p "$(dirname $LOG)"

log() {
    echo "[$(date '+%H:%M:%S')] $1" | tee -a "$LOG"
}

restart_ralph() {
    log "🚀 RELANCE SPRINT $SPRINT"

    # Clear any stuck state first
    tmux send-keys -t eva-steroids:ralph C-c 2>/dev/null
    sleep 1

    # Send the ralph command
    tmux send-keys -t eva-steroids:ralph "/ralph-loop:ralph-loop Sprint $SPRINT Ameliore avatar UX latence mobile. Code teste valide. Boucle infinie sans arret." Enter

    SPRINT=$((SPRINT+1))

    sleep 5
    log "✅ Sprint $((SPRINT-1)) lancé"
}

check_ralph_active() {
    local output=$(tmux capture-pane -t eva-steroids:ralph -p 2>/dev/null | tail -30)

    # Check if Ralph finished (multiple patterns)
    if echo "$output" | grep -qE "Brewed for|Baked for|Crunched for|Goodbye|loop found"; then
        return 1  # Finished - needs restart
    fi

    # Check if there's an error
    if echo "$output" | grep -qE "API Error|Stop hook failed|hook error"; then
        return 1  # Error - needs restart
    fi

    # Check if waiting for input (empty prompt at end)
    local last_lines=$(echo "$output" | tail -5)
    if echo "$last_lines" | grep -qE "^❯ $|^❯$"; then
        # Double check it's really idle (no activity indicator)
        if ! echo "$output" | grep -qE "Running|Waiting|interrupt|tokens"; then
            return 1  # Idle - needs restart
        fi
    fi

    # Check if actively running (has activity indicators)
    if echo "$output" | grep -qE "esc to interrupt|Running|tokens\)|Considering|Analyzing|Reading|Writing|Bash\(|Edit\(|Read\("; then
        return 0  # Active
    fi

    # If we see recent activity, assume active
    return 0
}

log "═══════════════════════════════════════════════════════════"
log "   RALPH FOREVER V2 - STARTED"
log "   Check toutes les 20 secondes"
log "   NE S'ARRÊTE JAMAIS"
log "═══════════════════════════════════════════════════════════"

# Initial check
sleep 2
if ! check_ralph_active; then
    log "⚡ Ralph inactif - Lancement initial..."
    restart_ralph
fi

# Main loop - check every 20 seconds
while true; do
    sleep 20

    # Check if tmux session exists
    if ! tmux has-session -t eva-steroids 2>/dev/null; then
        log "❌ SESSION TMUX DOWN"
        continue
    fi

    # Check if Ralph is active
    if ! check_ralph_active; then
        log "🔄 Ralph arrêté - RELANCE"
        restart_ralph
    fi
done
