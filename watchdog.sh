#!/bin/bash
# Watchdog: Auto-restart backend + monitoring
# Run this in background: nohup bash watchdog.sh > /tmp/watchdog.log 2>&1 &

cd /workspace/music-music-ai-training-api

BACKEND_PID=""
RESTART_COUNT=0
MAX_RESTARTS=100

start_backend() {
    echo "[$(date)] Starting backend..."
    cd /workspace/music-music-ai-training-api/backend
    nohup python3 main.py > /tmp/backend.log 2>&1 &
    BACKEND_PID=$!
    echo "[$(date)] Backend started PID: $BACKEND_PID"
    sleep 20  # Wait for initialization
}

check_backend() {
    # Check if backend responds to health endpoint
    HEALTH=$(curl -s --max-time 5 http://localhost:8000/health 2>/dev/null)
    if echo "$HEALTH" | grep -q "healthy"; then
        return 0  # Healthy
    else
        return 1  # Unhealthy
    fi
}

restart_if_needed() {
    if ! check_backend; then
        echo "[$(date)] Backend unhealthy or down! Restarting... (count: $RESTART_COUNT)"

        # Kill any existing backend processes
        pkill -f "python3 main.py" 2>/dev/null
        sleep 2

        start_backend
        ((RESTART_COUNT++))

        if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
            echo "[$(date)] CRITICAL: Max restarts reached ($MAX_RESTARTS). Check logs!"
        fi
    fi
}

# Also restart Ralph Loop if tmux dies
check_ralph_loop() {
    if ! tmux ls 2>/dev/null | grep -q "ralph-dual"; then
        echo "[$(date)] Ralph Loop tmux dead! Restarting..."
        cd /workspace/music-music-ai-training-api
        bash ./start_ralph_dual.sh 2>&1
    fi
}

# Initial start
start_backend

echo "[$(date)] Watchdog started. Monitoring backend + Ralph Loop..."

while true; do
    restart_if_needed
    check_ralph_loop

    # Check disk usage
    DISK_USED_GB=$(df / | tail -1 | awk '{print $3}' | sed 's/G//')
    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')

    # ALERT if > 38GB used
    if [ "$DISK_USED_GB" -gt 38 ]; then
        echo ""
        echo "==========================================="
        echo "  ATTENTION: STOCKAGE PRESQUE ATTEINT!"
        echo "  Utilisé: ${DISK_USED_GB}GB / 40GB"
        echo "  Nettoyage automatique en cours..."
        echo "==========================================="
        echo ""
        pip cache purge 2>/dev/null
        ollama rm llama3.1:8b 2>/dev/null
        ollama rm llama3.2:3b 2>/dev/null
        rm -rf /tmp/* 2>/dev/null
    fi

    # Clean if > 80%
    if [ "$DISK_USAGE" -gt 80 ]; then
        echo "[$(date)] Disk at ${DISK_USAGE}%, cleaning..."
        pip cache purge 2>/dev/null
    fi

    sleep 30  # Check every 30 seconds
done
