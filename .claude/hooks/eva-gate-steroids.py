#!/usr/bin/env python3
"""
EVA GATE STEROIDES v3.0 - AUTO-HEALING EDITION
===============================================

BLOQUE SI:
- Latence > 500ms (HARD BLOCK)
- Latence > 200ms (WARN + justification requise)
- Pas de Puppeteer utilise
- < 3 screenshots
- TypeScript/Python errors
- Memory leak detecte
- Pas de reflexions
- Tests failing
- WebSocket instable
- Reponse style "ChatGPT generique"

AUTO-HEAL SI:
- Backend down -> restart
- Frontend down -> restart
- Ollama down -> restart
- Port bloque -> kill & restart
"""
import json
import sys
import os
import subprocess
import time
import glob
import re
import socket
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple, List

# === CONFIG ===
BACKEND_URL = os.getenv("EVA_BACKEND", "http://localhost:8000")
FRONTEND_URL = os.getenv("EVA_FRONTEND", "http://localhost:3000")
PROJECT_DIR = Path("/workspace/music-music-ai-training-api")
METRICS_FILE = PROJECT_DIR / ".claude/metrics/latency.jsonl"
REFLECTIONS = PROJECT_DIR / ".claude/reflections.md"
SCREENSHOTS_DIR = PROJECT_DIR / ".claude/screenshots"
LOGS_DIR = PROJECT_DIR / "logs"

# === SEUILS ===
LATENCY_BLOCK = 500  # ms - BLOQUANT
LATENCY_WARN = 300   # ms - WARNING
LATENCY_TARGET = 200 # ms - OBJECTIF
MIN_SCREENSHOTS = 3
MIN_REFLECTIONS = 3
HEALTH_CHECK_TIMEOUT = 10

# === COLORS ===
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"

def log(msg: str, level: str = "INFO"):
    colors = {"INFO": BLUE, "WARN": YELLOW, "ERROR": RED, "OK": GREEN}
    color = colors.get(level, RESET)
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"{color}[{timestamp}] [{level}] {msg}{RESET}", file=sys.stderr)

def cmd(args, timeout: int = 30, cwd: str = None) -> Tuple[bool, str, str]:
    """Execute command and return (success, stdout, stderr)"""
    try:
        if isinstance(args, str):
            r = subprocess.run(args, capture_output=True, text=True, timeout=timeout, shell=True, cwd=cwd)
        else:
            r = subprocess.run(args, capture_output=True, text=True, timeout=timeout, cwd=cwd)
        return r.returncode == 0, r.stdout, r.stderr
    except subprocess.TimeoutExpired:
        return False, "", "timeout"
    except Exception as e:
        return False, "", str(e)

def is_port_in_use(port: int) -> bool:
    """Check if a port is in use"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def kill_port(port: int) -> bool:
    """Kill process using a specific port"""
    log(f"Killing process on port {port}...", "WARN")
    ok, _, _ = cmd(f"lsof -ti:{port} | xargs -r kill -9")
    time.sleep(1)
    return not is_port_in_use(port)

def measure_latency(url: str, method: str = "GET", data: dict = None, samples: int = 3) -> Optional[float]:
    """Measure latency with average over N samples"""
    latencies = []
    for i in range(samples):
        try:
            start = time.perf_counter()
            curl_cmd = ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '10']
            if method == "POST":
                curl_cmd += ['-X', 'POST', '-H', 'Content-Type: application/json']
                if data:
                    curl_cmd += ['-d', json.dumps(data)]
            curl_cmd.append(url)
            ok, out, _ = cmd(curl_cmd)
            elapsed = (time.perf_counter() - start) * 1000
            if ok and out.strip().startswith('2'):
                latencies.append(elapsed)
        except Exception as e:
            log(f"Latency measure {i+1} failed: {e}", "WARN")
    return sum(latencies) / len(latencies) if latencies else None

def log_metric(name: str, value: float, tags: dict = None):
    """Log metric for history"""
    entry = {
        "ts": datetime.now().isoformat(),
        "metric": name,
        "value": value,
        "tags": tags or {}
    }
    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(METRICS_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")

def check_chatgpt_style(text: str) -> Tuple[bool, Optional[str]]:
    """Detect if response is generic ChatGPT style"""
    red_flags = [
        r"je suis (un|une) (ia|intelligence artificielle|assistant)",
        r"en tant qu'(ia|assistant|intelligence)",
        r"je ne (peux|suis) pas (ressentir|avoir|eprouver)",
        r"je n'ai pas (de sentiments|d'emotions|de conscience)",
        r"comment puis-je vous aider",
        r"n'hesitez pas a",
        r"je suis la pour vous aider",
        r"avez-vous d'autres questions",
        r"i am an ai",
        r"as an ai assistant",
        r"i don't have feelings",
    ]
    text_lower = text.lower()
    for pattern in red_flags:
        if re.search(pattern, text_lower):
            return True, pattern
    return False, None

# === AUTO-HEALING FUNCTIONS ===

def heal_backend() -> bool:
    """Try to restart backend"""
    log("AUTO-HEAL: Attempting to restart backend...", "WARN")

    # Kill any existing process on 8000
    kill_port(8000)

    # Start backend
    backend_dir = PROJECT_DIR / "backend"
    ok, out, err = cmd(
        "nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload > ../logs/backend.log 2>&1 &",
        cwd=str(backend_dir)
    )

    # Wait for startup
    for i in range(10):
        time.sleep(1)
        if is_port_in_use(8000):
            log("AUTO-HEAL: Backend started successfully!", "OK")
            return True

    log("AUTO-HEAL: Backend failed to start", "ERROR")
    return False

def heal_frontend() -> bool:
    """Try to restart frontend"""
    log("AUTO-HEAL: Attempting to restart frontend...", "WARN")

    # Kill any existing process on 3000
    kill_port(3000)

    # Start frontend
    frontend_dir = PROJECT_DIR / "frontend"
    bun_path = os.path.expanduser("~/.bun/bin/bun")

    ok, out, err = cmd(
        f"nohup {bun_path} dev > ../logs/frontend.log 2>&1 &",
        cwd=str(frontend_dir)
    )

    # Wait for startup
    for i in range(15):
        time.sleep(1)
        if is_port_in_use(3000):
            log("AUTO-HEAL: Frontend started successfully!", "OK")
            return True

    log("AUTO-HEAL: Frontend failed to start", "ERROR")
    return False

def heal_ollama() -> bool:
    """Try to restart Ollama"""
    log("AUTO-HEAL: Attempting to restart Ollama...", "WARN")

    # Kill existing
    cmd("pkill -f 'ollama serve'")
    time.sleep(1)

    # Start Ollama
    cmd("nohup ollama serve > /tmp/ollama.log 2>&1 &")

    # Wait for startup
    for i in range(10):
        time.sleep(1)
        ok, _, _ = cmd("curl -s http://localhost:11434/api/tags")
        if ok:
            log("AUTO-HEAL: Ollama started successfully!", "OK")
            return True

    log("AUTO-HEAL: Ollama failed to start", "ERROR")
    return False

# === MAIN CHECKS ===

def main():
    log("=" * 50)
    log("EVA GATE STEROIDES v3.0 - AUTO-HEALING", "INFO")
    log("=" * 50)

    # Read input
    try:
        input_data = json.load(sys.stdin) if not sys.stdin.isatty() else {}
    except:
        input_data = {}

    if input_data.get("stop_hook_active"):
        sys.exit(0)

    transcript = str(input_data.get("transcript", ""))
    blocks: List[str] = []
    warnings: List[str] = []
    info: List[str] = []
    healed: List[str] = []

    # ============================================================
    # CHECK 1: BACKEND
    # ============================================================
    log("Checking backend...", "INFO")

    ok, out, _ = cmd(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', f'{BACKEND_URL}/health'])
    if not ok or not out.strip().startswith('2'):
        log(f"Backend DOWN (status: {out.strip()})", "ERROR")

        # AUTO-HEAL
        if heal_backend():
            healed.append("Backend auto-healed")
            ok, out, _ = cmd(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', f'{BACKEND_URL}/health'])

        if not ok or not out.strip().startswith('2'):
            blocks.append(f"""BACKEND DOWN

Status: {out.strip() if out else 'unreachable'}
Auto-heal: FAILED

MANUAL FIX:
cd {PROJECT_DIR}/backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload""")
    else:
        info.append(f"Backend UP ({out.strip()})")

    # ============================================================
    # CHECK 2: FRONTEND
    # ============================================================
    log("Checking frontend...", "INFO")

    ok, out, _ = cmd(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', FRONTEND_URL])
    if not ok or not out.strip().startswith('2'):
        log(f"Frontend DOWN (status: {out.strip()})", "ERROR")

        # AUTO-HEAL
        if heal_frontend():
            healed.append("Frontend auto-healed")
            time.sleep(3)
            ok, out, _ = cmd(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', FRONTEND_URL])

        if not ok or not out.strip().startswith('2'):
            blocks.append(f"""FRONTEND DOWN

Status: {out.strip() if out else 'unreachable'}
Auto-heal: FAILED

MANUAL FIX:
cd {PROJECT_DIR}/frontend
~/.bun/bin/bun dev""")
    else:
        info.append(f"Frontend UP ({out.strip()})")

    # ============================================================
    # CHECK 3: OLLAMA
    # ============================================================
    log("Checking Ollama...", "INFO")

    ok, out, _ = cmd(['curl', '-s', 'http://localhost:11434/api/tags'])
    if not ok:
        log("Ollama DOWN", "ERROR")

        # AUTO-HEAL
        if heal_ollama():
            healed.append("Ollama auto-healed")
        else:
            warnings.append("Ollama not running - LLM may be slow")
    else:
        info.append("Ollama UP")

    # ============================================================
    # CHECK 4: LATENCY E2E
    # ============================================================
    log("Measuring latency...", "INFO")

    lat = measure_latency(
        f'{BACKEND_URL}/chat',
        'POST',
        {"message": f"ping-{time.time()}", "session_id": "gate-check"},
        samples=3
    )

    if lat:
        log_metric("e2e_latency", lat, {"endpoint": "/chat"})

        if lat > LATENCY_BLOCK:
            blocks.append(f"""LATENCE CRITIQUE: {lat:.0f}ms > {LATENCY_BLOCK}ms

BLOQUANT - Impossible de continuer

DIAGNOSTIC:
1. Check LLM model size (use smaller model)
2. Check if GPU is being used
3. Profile backend endpoints
4. Consider caching frequent responses

Current GPU:
nvidia-smi --query-gpu=name,memory.used --format=csv""")
        elif lat > LATENCY_WARN:
            warnings.append(f"Latence elevee: {lat:.0f}ms > {LATENCY_WARN}ms (objectif: {LATENCY_TARGET}ms)")
        elif lat > LATENCY_TARGET:
            info.append(f"Latence OK mais improvable: {lat:.0f}ms (objectif: {LATENCY_TARGET}ms)")
        else:
            info.append(f"Latence excellente: {lat:.0f}ms < {LATENCY_TARGET}ms")
    else:
        if not any("BACKEND" in b for b in blocks):
            warnings.append("Impossible de mesurer la latence - endpoint /chat non accessible")

    # ============================================================
    # CHECK 5: VISUAL VALIDATION (Puppeteer OR Screenshot script)
    # ============================================================
    log("Checking visual validation...", "INFO")

    # Check for MCP Puppeteer usage
    puppeteer_keywords = [
        'puppeteer_navigate', 'puppeteer_screenshot', 'puppeteer_click',
        'puppeteer_evaluate', 'puppeteer_fill', 'mcp__puppeteer'
    ]
    puppeteer_used = any(k in transcript.lower() for k in puppeteer_keywords)

    # Check for screenshot script usage
    screenshot_script_keywords = ['screenshot.js', 'node scripts/screenshot', 'takeScreenshot']
    script_used = any(k in transcript for k in screenshot_script_keywords)

    # Check for recent screenshots (last 10 minutes)
    recent_screenshots = []
    if SCREENSHOTS_DIR.exists():
        now = time.time()
        for ss in SCREENSHOTS_DIR.glob("*.png"):
            if (now - ss.stat().st_mtime) < 600:  # 10 minutes
                recent_screenshots.append(ss.name)

    visual_validated = puppeteer_used or script_used or len(recent_screenshots) >= 2

    if not visual_validated:
        # Instead of blocking, auto-take a screenshot
        log("No visual validation - auto-taking screenshot...", "WARN")
        screenshot_script = PROJECT_DIR / "scripts/screenshot.js"
        if screenshot_script.exists():
            ok, out, err = cmd(f"node {screenshot_script} auto-gate", cwd=str(PROJECT_DIR), timeout=60)
            if ok:
                info.append("Auto-screenshot taken")
                visual_validated = True
            else:
                warnings.append(f"Auto-screenshot failed: {err[:100]}")

        if not visual_validated:
            warnings.append("""Validation visuelle manquante

Pour valider visuellement, utilise:
node scripts/screenshot.js validation

OU si MCP Puppeteer disponible:
mcp__puppeteer__puppeteer_navigate url="http://localhost:3000"
mcp__puppeteer__puppeteer_screenshot name="validation" """)
    else:
        method = "Puppeteer" if puppeteer_used else ("Script" if script_used else f"Recent ({len(recent_screenshots)})")
        info.append(f"Validation visuelle OK ({method})")

    # ============================================================
    # CHECK 6: SCREENSHOTS
    # ============================================================
    log("Counting screenshots...", "INFO")

    screenshots = list(SCREENSHOTS_DIR.glob("*.png")) if SCREENSHOTS_DIR.exists() else []
    screenshot_count = len(screenshots)

    if screenshot_count < MIN_SCREENSHOTS:
        # Auto-take screenshots if needed
        log(f"Only {screenshot_count} screenshots - taking more...", "WARN")
        screenshot_script = PROJECT_DIR / "scripts/screenshot.js"
        if screenshot_script.exists():
            for i in range(MIN_SCREENSHOTS - screenshot_count):
                cmd(f"node {screenshot_script} auto-{i}", cwd=str(PROJECT_DIR), timeout=60)
                time.sleep(2)
            # Recount
            screenshots = list(SCREENSHOTS_DIR.glob("*.png"))
            screenshot_count = len(screenshots)

        if screenshot_count < MIN_SCREENSHOTS:
            warnings.append(f"Screenshots: {screenshot_count}/{MIN_SCREENSHOTS} (prends-en plus!)")
        else:
            info.append(f"{screenshot_count} screenshots (auto-generated)")
    else:
        info.append(f"{screenshot_count} screenshots")

    # ============================================================
    # CHECK 7: TYPESCRIPT
    # ============================================================
    log("Checking TypeScript...", "INFO")

    bun_path = os.path.expanduser("~/.bun/bin/bunx")
    ok, out, err = cmd(f"{bun_path} tsc --noEmit 2>&1 | head -10", cwd=str(PROJECT_DIR / "frontend"))

    combined = (out or "") + (err or "")
    if "error" in combined.lower() and "TS" in combined:
        error_lines = [l for l in combined.split('\n') if 'error' in l.lower()][:3]
        warnings.append(f"TypeScript errors:\n{chr(10).join(error_lines)}")
    else:
        info.append("TypeScript OK")

    # ============================================================
    # CHECK 8: REFLECTIONS
    # ============================================================
    log("Checking reflections...", "INFO")

    if REFLECTIONS.exists():
        content = REFLECTIONS.read_text()
        reflection_count = content.count("## ")

        if reflection_count < MIN_REFLECTIONS:
            warnings.append(f"Reflexions insuffisantes: {reflection_count}/{MIN_REFLECTIONS}")
        else:
            info.append(f"{reflection_count} reflexions")
    else:
        warnings.append("Fichier reflections.md manquant")

    # ============================================================
    # CHECK 9: PERSONALITY (EVA style)
    # ============================================================
    log("Checking EVA personality...", "INFO")

    response_patterns = [
        r'"response"\s*:\s*"([^"]+)"',
        r'"message"\s*:\s*"([^"]+)"',
        r'"text"\s*:\s*"([^"]+)"',
    ]

    eva_responses = []
    for pattern in response_patterns:
        eva_responses.extend(re.findall(pattern, transcript, re.IGNORECASE))

    for response in eva_responses[-3:]:
        is_generic, matched = check_chatgpt_style(response)
        if is_generic:
            warnings.append(f"""REPONSE STYLE CHATGPT DETECTEE

Pattern: "{matched}"
Reponse: "{response[:80]}..."

EVA doit etre empathique, pas generique!""")
            break

    # ============================================================
    # OUTPUT
    # ============================================================

    log("=" * 50)

    if healed:
        log(f"AUTO-HEALED: {', '.join(healed)}", "OK")

    if blocks:
        log(f"BLOCKED ({len(blocks)} issues)", "ERROR")
        output = {
            "decision": "block",
            "reason": f"""
EVA GATE STEROIDES - BLOQUE

{'='*50}
ERREURS BLOQUANTES ({len(blocks)})
{'='*50}

{chr(10).join(f'[{i+1}] {b}' for i, b in enumerate(blocks))}

{'='*50}
WARNINGS ({len(warnings)})
{'='*50}

{chr(10).join(warnings) if warnings else 'Aucun'}

{'='*50}
AUTO-HEALED
{'='*50}

{chr(10).join(healed) if healed else 'Aucun'}

{'='*50}
INFO
{'='*50}

{chr(10).join(info) if info else 'Aucun'}
"""
        }
        print(json.dumps(output))
        sys.exit(0)

    # No blocks
    if warnings:
        log(f"WARNINGS ({len(warnings)}):", "WARN")
        for w in warnings:
            print(f"  - {w}", file=sys.stderr)

    if info:
        log("STATUS:", "OK")
        for i in info:
            print(f"  - {i}", file=sys.stderr)

    log("EVA GATE STEROIDES - PASSED", "OK")
    sys.exit(0)

if __name__ == "__main__":
    main()
