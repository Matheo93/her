#!/bin/bash
# Health check script for Ralph Dual System
# Monitors Worker and Moderator, restarts if needed
# Add to crontab: */5 * * * * /home/dev/her/ralph_health_check.sh

LOG_FILE="/home/dev/her/logs/health-check.log"
SCRIPT_DIR="/home/dev/her"
SESSION_NAME="ralph-dual"

mkdir -p "$(dirname $LOG_FILE)"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check if tmux session exists
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    log "ALERT: Session $SESSION_NAME not found. Restarting..."
    "$SCRIPT_DIR/start_ralph_dual.sh"
    exit 0
fi

# Check Worker window
WORKER_PID=$(tmux list-panes -t "$SESSION_NAME:worker" -F '#{pane_pid}' 2>/dev/null | head -1)
if [ -z "$WORKER_PID" ] || ! ps -p "$WORKER_PID" > /dev/null 2>&1; then
    log "ALERT: Worker not running. Restarting window..."
    tmux respawn-window -t "$SESSION_NAME:worker" -k "bash $SCRIPT_DIR/loop_worker.sh" 2>/dev/null || true
fi

# Check Moderator window
MODERATOR_PID=$(tmux list-panes -t "$SESSION_NAME:moderator" -F '#{pane_pid}' 2>/dev/null | head -1)
if [ -z "$MODERATOR_PID" ] || ! ps -p "$MODERATOR_PID" > /dev/null 2>&1; then
    log "ALERT: Moderator not running. Restarting window..."
    tmux respawn-window -t "$SESSION_NAME:moderator" -k "bash $SCRIPT_DIR/loop_moderator.sh" 2>/dev/null || true
fi

# Log status (only every hour to avoid spam)
MINUTE=$(date +%M)
if [ "$MINUTE" = "00" ]; then
    CLAUDE_PROCS=$(pgrep -c claude 2>/dev/null || echo "0")
    log "STATUS: Session active, $CLAUDE_PROCS Claude processes running"
fi
