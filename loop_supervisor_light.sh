#!/bin/bash
# LIGHTWEIGHT SUPERVISOR - No parallel processes
cd /home/dev/her
export HF_HOME=/home/dev/.cache/huggingface
export PYTHONPATH=/home/dev/her/backend

while true; do
    echo "=== SUPERVISOR CHECK @ $(date) ==="
    
    # Basic checks
    backend=$(curl -s http://localhost:8000/health 2>/dev/null | grep -q "healthy" && echo "OK" || echo "DOWN")
    gpu_mem=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader 2>/dev/null)
    mem=$(free -h | grep Mem | awk '{print $3}')
    
    echo "Backend: $backend | GPU: $gpu_mem | RAM: $mem"
    
    # Restart backend if down
    if [ "$backend" = "DOWN" ]; then
        echo "RESTARTING BACKEND..."
        cd /home/dev/her/backend && nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 > /tmp/backend.log 2>&1 &
    fi
    
    # Restart agents if needed
    tmux has-session -t ralph_worker 2>/dev/null || tmux new-session -d -s ralph_worker "./loop_worker.sh"
    tmux has-session -t ralph_moderator 2>/dev/null || tmux new-session -d -s ralph_moderator "./loop_moderator.sh"
    
    # Auto-push changes
    if [ -n "$(git status --porcelain)" ]; then
        git add -A && git commit -m "chore: auto-commit" 2>/dev/null && git push 2>/dev/null
    fi
    
    echo "Next check in 5 min"
    sleep 300
done
