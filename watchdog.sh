#!/bin/bash
# Watchdog: Auto-restart backend + monitoring
# Run this in background: nohup bash watchdog.sh > /tmp/watchdog.log 2>&1 &

cd /home/dev/her

BACKEND_PID=""
RESTART_COUNT=0
MAX_RESTARTS=100
LOG_FILE="/home/dev/her/logs/watchdog.log"

start_backend() {
    echo "[$(date)] Starting backend..."
    cd /home/dev/her
    nohup python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 > /home/dev/her/backend.log 2>&1 &
    BACKEND_PID=$!
    echo "[$(date)] Backend started PID: $BACKEND_PID"
    sleep 30  # Wait for initialization (models load slowly)
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
        pkill -f "uvicorn backend.main:app" 2>/dev/null
        sleep 2

        start_backend
        ((RESTART_COUNT++))

        if [ $RESTART_COUNT -ge $MAX_RESTARTS ]; then
            echo "[$(date)] CRITICAL: Max restarts reached ($MAX_RESTARTS). Check logs!"
        fi
    fi
}

# Removed Ralph Loop check - not needed

# Initial check - only start if not already running
if ! check_backend; then
    start_backend
else
    echo "[$(date)] Backend already running and healthy"
fi

echo "[$(date)] Watchdog started. Monitoring backend + Ralph Loop..."

while true; do
    restart_if_needed

    # Check disk usage (df outputs in 1K blocks)
    DISK_USED_KB=$(df / | tail -1 | awk '{print $3}')
    DISK_USED_GB=$((DISK_USED_KB / 1024 / 1024))
    DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | tr -d '%')

    # ALERT LEVELS:
    # 30GB (73%) = Warning
    # 33GB (80%) = Cleanup
    # 36GB (88%) = Aggressive cleanup
    # 38GB (93%) = CRITICAL

    if [ "$DISK_USED_GB" -gt 38 ]; then
        echo ""
        echo "==========================================="
        echo "  🚨 CRITIQUE: STOCKAGE PRESQUE PLEIN!"
        echo "  Utilisé: ${DISK_USED_GB}GB / 41GB"
        echo "  NETTOYAGE AGRESSIF EN COURS..."
        echo "==========================================="
        echo ""
        # Aggressive cleanup
        pip cache purge 2>/dev/null
        rm -rf ~/.cache/huggingface/hub/* 2>/dev/null
        rm -rf ~/.cache/pip/* 2>/dev/null
        ollama rm llama3.1:8b 2>/dev/null
        ollama rm llama3.2:3b 2>/dev/null
        ollama rm codellama 2>/dev/null
        rm -rf /tmp/gradio* /tmp/tmp* 2>/dev/null

    elif [ "$DISK_USED_GB" -gt 36 ]; then
        echo "[$(date)] ⚠️ ALERTE: Disque à ${DISK_USED_GB}GB - Nettoyage..."
        pip cache purge 2>/dev/null
        ollama rm llama3.1:8b 2>/dev/null
        rm -rf ~/.cache/pip/* 2>/dev/null

    elif [ "$DISK_USED_GB" -gt 33 ]; then
        echo "[$(date)] Disque à ${DISK_USED_GB}GB - Nettoyage léger..."
        pip cache purge 2>/dev/null

    elif [ "$DISK_USED_GB" -gt 30 ]; then
        echo "[$(date)] Note: Disque à ${DISK_USED_GB}GB"
    fi

    sleep 30  # Check every 30 seconds
done
