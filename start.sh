#!/bin/bash

# EVA-VOICE - Start Script
# Démarre le backend et le frontend

echo "🚀 Starting EVA-VOICE..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Kill existing processes
pkill -f "uvicorn main:app" 2>/dev/null
pkill -f "next dev" 2>/dev/null

# Get script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Start Backend
echo -e "${YELLOW}Starting Backend...${NC}"
cd "$DIR/backend"
source venv/bin/activate 2>/dev/null || {
    echo "Creating Python venv..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -q fastapi uvicorn groq python-dotenv websockets python-multipart edge-tts
}

export GROQ_API_KEY="${GROQ_API_KEY:-}"
nohup python main.py > server.log 2>&1 &
BACKEND_PID=$!
echo -e "${GREEN}✅ Backend started (PID: $BACKEND_PID)${NC}"

# Wait for backend
sleep 2

# Check backend
if curl -s http://localhost:8000/ > /dev/null; then
    echo -e "${GREEN}✅ Backend ready at http://localhost:8000${NC}"
else
    echo -e "${RED}❌ Backend failed to start${NC}"
    cat server.log
    exit 1
fi

# Start Frontend
echo -e "${YELLOW}Starting Frontend...${NC}"
cd "$DIR/frontend"
nohup bun dev --port 3001 > frontend.log 2>&1 &
FRONTEND_PID=$!
echo -e "${GREEN}✅ Frontend started (PID: $FRONTEND_PID)${NC}"

# Wait for frontend
sleep 3

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  EVA-VOICE is running!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo -e "  Frontend: ${YELLOW}http://localhost:3001${NC}"
echo -e "  Backend:  ${YELLOW}http://localhost:8000${NC}"
echo ""
echo -e "  Press Ctrl+C to stop"
echo ""

# Keep running and wait for Ctrl+C
trap "pkill -f 'uvicorn main:app'; pkill -f 'next dev'; echo 'Stopped'; exit 0" SIGINT SIGTERM

wait
