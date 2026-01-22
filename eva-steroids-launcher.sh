#!/bin/bash
#
# EVA STEROIDES LAUNCHER
# ======================
# Lance tout dans tmux avec auto-healing
#
# Usage: ./eva-steroids-launcher.sh
#

set -e

PROJECT_DIR="/workspace/music-music-ai-training-api"
BUN_PATH="$HOME/.bun/bin/bun"
BUNX_PATH="$HOME/.bun/bin/bunx"
TMUX_SESSION="eva-steroids"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Kill existing tmux session
if tmux has-session -t $TMUX_SESSION 2>/dev/null; then
    log "Killing existing tmux session..."
    tmux kill-session -t $TMUX_SESSION
fi

# Create logs directory
mkdir -p "$PROJECT_DIR/logs"

log "========================================"
log "   EVA STEROIDES LAUNCHER v3.0"
log "========================================"

# ============================================
# 1. Start Ollama
# ============================================
log "Starting Ollama..."
pkill -f "ollama serve" 2>/dev/null || true
sleep 1
nohup ollama serve > "$PROJECT_DIR/logs/ollama.log" 2>&1 &

# Wait for Ollama
for i in {1..10}; do
    if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        success "Ollama started"
        break
    fi
    sleep 1
done

# ============================================
# 2. Create tmux session with panes
# ============================================
log "Creating tmux session: $TMUX_SESSION"

# Create session with first window for backend
tmux new-session -d -s $TMUX_SESSION -n "backend" -c "$PROJECT_DIR/backend"

# Create window for frontend
tmux new-window -t $TMUX_SESSION -n "frontend" -c "$PROJECT_DIR/frontend"

# Create window for ralph
tmux new-window -t $TMUX_SESSION -n "ralph" -c "$PROJECT_DIR"

# Create window for monitor
tmux new-window -t $TMUX_SESSION -n "monitor" -c "$PROJECT_DIR"

# ============================================
# 3. Start Backend (window 0)
# ============================================
log "Starting Backend..."
tmux send-keys -t $TMUX_SESSION:backend "cd $PROJECT_DIR/backend && python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | tee ../logs/backend.log" C-m

# Wait for backend
sleep 3
for i in {1..15}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        success "Backend started on :8000"
        break
    fi
    sleep 1
done

# ============================================
# 4. Start Frontend (window 1)
# ============================================
log "Starting Frontend..."
tmux send-keys -t $TMUX_SESSION:frontend "cd $PROJECT_DIR/frontend && $BUN_PATH dev 2>&1 | tee ../logs/frontend.log" C-m

# Wait for frontend
sleep 5
for i in {1..20}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        success "Frontend started on :3000"
        break
    fi
    sleep 1
done

# ============================================
# 5. Start Monitor (window 3)
# ============================================
log "Starting Health Monitor..."

cat > "$PROJECT_DIR/health-monitor.sh" << 'MONITOR_EOF'
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
MONITOR_EOF

chmod +x "$PROJECT_DIR/health-monitor.sh"
tmux send-keys -t $TMUX_SESSION:monitor "$PROJECT_DIR/health-monitor.sh" C-m

# ============================================
# 6. Instructions pour Ralph
# ============================================
log "Setting up Ralph window..."

# Create the ralph launcher script
cat > "$PROJECT_DIR/launch-ralph.sh" << 'RALPH_EOF'
#!/bin/bash
# Lance /ralph dans Claude Code

PROJECT_DIR="/workspace/music-music-ai-training-api"
cd "$PROJECT_DIR"

echo "=================================="
echo "  RALPH LOOP LAUNCHER"
echo "=================================="
echo ""
echo "Pour lancer Ralph, execute dans cette fenetre:"
echo ""
echo "  claude --dangerously-skip-permissions"
echo ""
echo "Puis tape:"
echo "  /ralph"
echo ""
echo "Ralph va tourner en boucle infinie,"
echo "generant des sprints et codant automatiquement."
echo ""
echo "Le hook eva-gate-steroids.py va:"
echo "  - Bloquer si latence > 500ms"
echo "  - Bloquer si pas de Puppeteer"
echo "  - Auto-heal les services down"
echo "  - Forcer les screenshots"
echo "  - Verifier la personnalite EVA"
echo ""
echo "=================================="
RALPH_EOF

chmod +x "$PROJECT_DIR/launch-ralph.sh"

# Show instructions in ralph window
tmux send-keys -t $TMUX_SESSION:ralph "cat $PROJECT_DIR/launch-ralph.sh" C-m

# ============================================
# 7. Final status
# ============================================
echo ""
log "========================================"
log "   EVA STEROIDES READY!"
log "========================================"
echo ""
success "Tmux session: $TMUX_SESSION"
success "Windows:"
echo "  0: backend  - FastAPI on :8000"
echo "  1: frontend - Next.js on :3000"
echo "  2: ralph    - Pour lancer /ralph"
echo "  3: monitor  - Health check auto-heal"
echo ""
log "Commands:"
echo "  tmux attach -t $TMUX_SESSION           # Attach to session"
echo "  tmux select-window -t $TMUX_SESSION:2  # Go to ralph window"
echo ""
log "Dans la fenetre ralph, lance:"
echo "  claude --dangerously-skip-permissions"
echo "  /ralph"
echo ""
log "========================================"
