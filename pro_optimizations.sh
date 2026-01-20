#!/bin/bash
# Professional Server Optimizations for HER/EVA
# Run with sudo for sysctl changes

echo "=== HER Professional Server Optimizations ==="

# Check if running as root for sysctl
if [ "$EUID" -eq 0 ]; then
    echo ">>> Applying system-level optimizations..."

    # TCP Performance (low latency for WebSocket)
    sysctl -w net.core.somaxconn=65535 2>/dev/null
    sysctl -w net.core.netdev_max_backlog=65535 2>/dev/null
    sysctl -w net.ipv4.tcp_max_syn_backlog=65535 2>/dev/null
    sysctl -w net.ipv4.tcp_tw_reuse=1 2>/dev/null
    sysctl -w net.ipv4.tcp_fin_timeout=15 2>/dev/null
    sysctl -w net.ipv4.tcp_keepalive_time=60 2>/dev/null
    sysctl -w net.ipv4.tcp_keepalive_intvl=10 2>/dev/null
    sysctl -w net.ipv4.tcp_keepalive_probes=6 2>/dev/null

    # Memory Performance
    sysctl -w vm.swappiness=10 2>/dev/null
    sysctl -w vm.dirty_ratio=40 2>/dev/null
    sysctl -w vm.dirty_background_ratio=10 2>/dev/null

    # File System
    sysctl -w fs.file-max=2097152 2>/dev/null
    sysctl -w fs.inotify.max_user_watches=524288 2>/dev/null

    echo ">>> System-level optimizations applied!"
else
    echo ">>> Run with sudo for system-level optimizations"
fi

# User-level optimizations (no sudo needed)
echo ">>> Applying user-level optimizations..."

# Increase file descriptors for current session
ulimit -n 65535 2>/dev/null || true

# Node.js optimizations
export NODE_OPTIONS="--max-old-space-size=8192 --max-http-header-size=32768"
export UV_THREADPOOL_SIZE=32

# Python optimizations
export PYTHONUNBUFFERED=1
export PYTHONDONTWRITEBYTECODE=1
export PYTHONHASHSEED=0

# FastAPI/Uvicorn optimizations
export UVICORN_WORKERS=4
export UVICORN_LOOP=uvloop
export UVICORN_HTTP=httptools

# Git optimizations
git config --global core.preloadindex true 2>/dev/null
git config --global core.fscache true 2>/dev/null
git config --global gc.auto 256 2>/dev/null
git config --global pack.threads 0 2>/dev/null

# CPU governor (if available)
if command -v cpupower &> /dev/null; then
    sudo cpupower frequency-set -g performance 2>/dev/null || true
fi

echo ">>> User-level optimizations applied!"
echo ""
echo "=== Current Settings ==="
echo "File descriptors: $(ulimit -n)"
echo "Node memory: 8GB"
echo "UV thread pool: 32"
echo "Uvicorn workers: 4"
echo ""
echo "=== Performance Tips ==="
echo "1. Use uvloop in FastAPI: pip install uvloop httptools"
echo "2. Enable HTTP/2 in nginx if using reverse proxy"
echo "3. Use Redis for caching if needed"
echo "4. Consider nginx microcaching for static assets"
