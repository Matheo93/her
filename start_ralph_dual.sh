#!/bin/bash
# Auto-start script for Ralph Dual System
# This script starts Worker and Moderator agents in tmux
# Should be added to crontab: @reboot /home/dev/her/start_ralph_dual.sh

set -e

LOG_DIR="/home/dev/her/logs"
SCRIPT_DIR="/home/dev/her"
SESSION_NAME="ralph-dual"

# Ensure log directory exists
mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_DIR/ralph-startup.log"
}

log "Starting Ralph Dual System..."

# Kill existing session if it exists
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
sleep 2

# Check if Claude CLI is available
if ! command -v claude &> /dev/null; then
    log "ERROR: Claude CLI not found. Make sure it's in PATH."
    exit 1
fi

# Start new tmux session with Worker
log "Starting Worker in tmux window 0..."
tmux new-session -d -s "$SESSION_NAME" -n worker "bash $SCRIPT_DIR/loop_worker.sh 2>&1 | tee -a $LOG_DIR/worker.log"

# Add Moderator window
log "Starting Moderator in tmux window 1..."
tmux new-window -t "$SESSION_NAME" -n moderator "bash $SCRIPT_DIR/loop_moderator.sh 2>&1 | tee -a $LOG_DIR/moderator.log"

# Verify both windows are running
sleep 3
WINDOWS=$(tmux list-windows -t "$SESSION_NAME" 2>/dev/null | wc -l)
if [ "$WINDOWS" -eq 2 ]; then
    log "SUCCESS: Ralph Dual System started with 2 windows"
    log "  - Worker: tmux attach -t $SESSION_NAME:worker"
    log "  - Moderator: tmux attach -t $SESSION_NAME:moderator"
else
    log "WARNING: Expected 2 windows, found $WINDOWS"
fi

log "Ralph Dual System startup complete."
