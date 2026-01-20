#!/bin/bash
# RALPH SUPERVISOR - Quality Manager
# Monitors Worker + Moderator, never stops
cd /home/dev/her
export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH=/home/dev/her/backend
export HF_HOME=/home/dev/.cache/huggingface

source /home/dev/her/optimize_env.sh 2>/dev/null || true

LOG_FILE="/home/dev/her/.claude/supervisor.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_quality() {
    log "=== QUALITY CHECK ==="

    # 1. Backend Health
    health=$(curl -s http://localhost:8000/health 2>/dev/null)
    if echo "$health" | grep -q '"status":"healthy"'; then
        log "Backend: OK"
    else
        log "Backend: FAIL - Restarting..."
        pkill -f "uvicorn.*main:app" 2>/dev/null || true
        cd /home/dev/her/backend && nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 > /tmp/backend.log 2>&1 &
    fi

    # 2. GPU Check
    gpu_util=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader 2>/dev/null | tr -d ' %')
    gpu_mem=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader 2>/dev/null | awk '{print $1}')
    log "GPU: ${gpu_util}% util, ${gpu_mem}MiB mem"

    # 3. PyTorch CUDA
    cuda=$(python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null)
    log "CUDA: $cuda"

    # 4. Test latency
    latency=$(curl -s -X POST http://localhost:8000/chat -H "Content-Type: application/json" -d '{"message":"test","session_id":"supervisor"}' 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('latency_ms','N/A'))" 2>/dev/null)
    log "LLM Latency: ${latency}ms"

    # 5. TTS latency
    tts_time=$(curl -s -X POST http://localhost:8000/tts -H "Content-Type: application/json" -d '{"text":"test"}' -w '%{time_total}' -o /dev/null 2>/dev/null)
    tts_ms=$(echo "$tts_time * 1000" | bc 2>/dev/null | cut -d. -f1)
    log "TTS Latency: ${tts_ms}ms"

    # 6. Check Ralph agents
    worker_running=$(tmux has-session -t ralph_worker 2>/dev/null && echo "yes" || echo "no")
    moderator_running=$(tmux has-session -t ralph_moderator 2>/dev/null && echo "yes" || echo "no")
    log "Worker: $worker_running | Moderator: $moderator_running"

    # 7. Read latest feedback
    if [ -f ".claude/ralph-feedback.md" ]; then
        status=$(grep "^status:" .claude/ralph-feedback.md | head -1 | cut -d: -f2-)
        log "Moderator Status: $status"
    fi

    log "=== END CHECK ==="
    echo ""
}

restart_ralph_if_needed() {
    # Start Worker if not running
    if ! tmux has-session -t ralph_worker 2>/dev/null; then
        log "Starting Ralph Worker..."
        tmux new-session -d -s ralph_worker "./loop_worker.sh"
    fi

    # Start Moderator if not running
    if ! tmux has-session -t ralph_moderator 2>/dev/null; then
        log "Starting Ralph Moderator..."
        tmux new-session -d -s ralph_moderator "./loop_moderator.sh"
    fi
}

auto_push() {
    if [ -n "$(git status --porcelain)" ]; then
        log "Auto-pushing changes..."
        git add -A
        git commit -m "chore(supervisor): auto-commit quality fixes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>" 2>/dev/null || true
        git push origin main 2>/dev/null && log "Pushed!" || log "Push failed"
    fi
}

# Main loop
log "=== SUPERVISOR STARTED ==="
log "Monitoring every 5 minutes"

while true; do
    check_quality
    restart_ralph_if_needed
    auto_push

    log "Next check in 5 minutes..."
    sleep 300
done
