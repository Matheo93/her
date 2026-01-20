"""
Uvicorn production configuration for HER/EVA
Optimized for low-latency voice AI applications
"""
import multiprocessing
import os

# Server
bind = os.getenv("UVICORN_BIND", "0.0.0.0:8000")
workers = int(os.getenv("UVICORN_WORKERS", min(4, multiprocessing.cpu_count())))

# Performance
loop = "uvloop"
http = "httptools"
interface = "asgi3"

# Timeouts (low for voice apps)
timeout_keep_alive = 5
timeout_notify = 30

# Concurrency
limit_concurrency = 1000
limit_max_requests = 10000
backlog = 2048

# WebSocket
ws_max_size = 16777216  # 16MB for audio chunks
ws_ping_interval = 20.0
ws_ping_timeout = 20.0

# Logging
access_log = True
log_level = os.getenv("LOG_LEVEL", "info")

# Security
forwarded_allow_ips = "*"
proxy_headers = True

# Print config on startup
if __name__ == "__main__":
    print(f"""
=== HER/EVA Uvicorn Config ===
Workers: {workers}
Loop: {loop}
HTTP: {http}
WebSocket max size: {ws_max_size / 1024 / 1024:.0f}MB
Backlog: {backlog}
""")
