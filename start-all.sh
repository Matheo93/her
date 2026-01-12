#!/bin/bash

# EVA-VOICE - Start All Services
# 100% Local - No External APIs

set -e

echo "🚀 Starting EVA-VOICE System..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Base directory
BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Kill existing processes on our ports
kill_existing() {
    echo "🔄 Cleaning up existing processes..."
    fuser -k 8000/tcp 2>/dev/null || true
    fuser -k 8001/tcp 2>/dev/null || true
    fuser -k 3001/tcp 2>/dev/null || true
    sleep 1
}

# Start Backend (Groq + Whisper + Edge-TTS)
start_backend() {
    echo -e "${BLUE}📡 Starting Backend API (port 8000)...${NC}"
    cd "$BASE_DIR/backend"
    source venv/bin/activate
    python main.py &
    BACKEND_PID=$!
    echo "   Backend PID: $BACKEND_PID"

    # Wait for backend to be ready
    echo "   Waiting for Whisper to load..."
    sleep 10

    while ! curl -s http://localhost:8000/health > /dev/null; do
        sleep 2
    done
    echo -e "${GREEN}   ✓ Backend ready${NC}"
}

# Start Avatar Engine (Wav2Lip)
start_avatar() {
    echo -e "${BLUE}🎭 Starting Avatar Engine (port 8001)...${NC}"
    cd "$BASE_DIR/avatar-engine"

    if [ -d "venv" ]; then
        source venv/bin/activate
        python avatar_api.py &
        AVATAR_PID=$!
        echo "   Avatar Engine PID: $AVATAR_PID"

        # Wait for avatar engine
        sleep 5
        while ! curl -s http://localhost:8001/health > /dev/null; do
            sleep 2
        done
        echo -e "${GREEN}   ✓ Avatar Engine ready${NC}"
    else
        echo "   ⚠️  Avatar Engine not installed (run setup first)"
    fi
}

# Start Frontend
start_frontend() {
    echo -e "${BLUE}🌐 Starting Frontend (port 3001)...${NC}"
    cd "$BASE_DIR/frontend"
    bun run dev --port 3001 &
    FRONTEND_PID=$!
    echo "   Frontend PID: $FRONTEND_PID"

    # Wait for frontend
    sleep 3
    echo -e "${GREEN}   ✓ Frontend ready${NC}"
}

# Main
main() {
    kill_existing

    echo ""
    start_backend
    echo ""
    start_avatar
    echo ""
    start_frontend

    echo ""
    echo "============================================"
    echo -e "${GREEN}🎉 EVA-VOICE System Ready!${NC}"
    echo "============================================"
    echo ""
    echo "📱 Frontend:        http://localhost:3001"
    echo "📡 Backend API:     http://localhost:8000"
    echo "🎭 Avatar Engine:   http://localhost:8001"
    echo ""
    echo "Press Ctrl+C to stop all services"
    echo ""

    # Wait for Ctrl+C
    wait
}

# Cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping all services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $AVATAR_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    echo "✓ All services stopped"
}

trap cleanup EXIT INT TERM

main
