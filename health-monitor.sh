#!/bin/bash
# Health Monitor - Auto-heals services

PROJECT_DIR="/workspace/music-music-ai-training-api"
BUN_PATH="$HOME/.bun/bin/bun"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

heal_backend() {
    echo -e "${YELLOW}[HEAL] Restarting backend...${NC}"
    pkill -f "uvicorn main:app" 2>/dev/null || true
    sleep 2
    cd "$PROJECT_DIR/backend"
    nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload > ../logs/backend.log 2>&1 &
    sleep 5
}

heal_frontend() {
    echo -e "${YELLOW}[HEAL] Restarting frontend...${NC}"
    pkill -f "bun.*dev" 2>/dev/null || true
    sleep 2
    cd "$PROJECT_DIR/frontend"
    nohup $BUN_PATH dev > ../logs/frontend.log 2>&1 &
    sleep 8
}

heal_ollama() {
    echo -e "${YELLOW}[HEAL] Restarting Ollama...${NC}"
    pkill -f "ollama serve" 2>/dev/null || true
    sleep 2
    nohup ollama serve > "$PROJECT_DIR/logs/ollama.log" 2>&1 &
    sleep 5
}

echo "=================================="
echo "  EVA HEALTH MONITOR"
echo "  Checking every 30s"
echo "=================================="

while true; do
    NOW=$(date '+%H:%M:%S')

    # Check Backend
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health | grep -q "^2"; then
        echo -e "[$NOW] Backend:  ${GREEN}UP${NC}"
    else
        echo -e "[$NOW] Backend:  ${RED}DOWN${NC}"
        heal_backend
    fi

    # Check Frontend
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 | grep -q "^2"; then
        echo -e "[$NOW] Frontend: ${GREEN}UP${NC}"
    else
        echo -e "[$NOW] Frontend: ${RED}DOWN${NC}"
        heal_frontend
    fi

    # Check Ollama
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo -e "[$NOW] Ollama:   ${GREEN}UP${NC}"
    else
        echo -e "[$NOW] Ollama:   ${RED}DOWN${NC}"
        heal_ollama
    fi

    # Measure latency
    START=$(date +%s%N)
    RESP=$(curl -s -X POST http://localhost:8000/chat \
        -H "Content-Type: application/json" \
        -d '{"message":"ping","session_id":"monitor"}' 2>/dev/null)
    END=$(date +%s%N)

    if [ -n "$RESP" ]; then
        LATENCY=$(( ($END - $START) / 1000000 ))
        if [ $LATENCY -lt 200 ]; then
            echo -e "[$NOW] Latency:  ${GREEN}${LATENCY}ms${NC}"
        elif [ $LATENCY -lt 500 ]; then
            echo -e "[$NOW] Latency:  ${YELLOW}${LATENCY}ms${NC}"
        else
            echo -e "[$NOW] Latency:  ${RED}${LATENCY}ms${NC}"
        fi
    fi

    echo "---"
    sleep 30
done
