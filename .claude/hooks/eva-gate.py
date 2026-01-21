#!/usr/bin/env python3
"""
EVA GATE - Ne laisse RIEN passer si les métriques sont mauvaises
"""
import json
import sys
import os
import subprocess
import time
from pathlib import Path

input_data = json.load(sys.stdin)

if input_data.get("stop_hook_active"):
    sys.exit(0)

failures = []
warnings = []

# ============================================
# PHASE 0: INFRASTRUCTURE
# ============================================

def check_backend():
    try:
        result = subprocess.run(
            ['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}',
             'http://localhost:8000/health'],
            capture_output=True, text=True, timeout=5
        )
        if result.stdout.strip() != '200':
            return False, "Backend not responding 200"
        return True, None
    except:
        return False, "Backend unreachable"

def check_frontend():
    try:
        result = subprocess.run(
            ['curl', '-s', 'http://localhost:3000'],
            capture_output=True, text=True, timeout=5
        )
        if 'Eva' not in result.stdout and 'eva' not in result.stdout.lower():
            return False, "Frontend not serving Eva app"
        return True, None
    except:
        return False, "Frontend unreachable"

def check_gpu():
    try:
        result = subprocess.run(['nvidia-smi'], capture_output=True, timeout=5)
        if result.returncode == 0:
            return True, None
        return False, "GPU not accessible"
    except:
        return False, "nvidia-smi not found"

# ============================================
# PHASE 1: LATENCY GATES
# ============================================

def measure_chat_latency():
    """Test E2E latency with unique message (no cache)"""
    try:
        unique_msg = f"Test latence {time.time()}"
        start = time.time()
        result = subprocess.run([
            'curl', '-s', '-X', 'POST',
            'http://localhost:8000/chat',
            '-H', 'Content-Type: application/json',
            '-d', json.dumps({
                "message": unique_msg,
                "session_id": "gate_test"
            })
        ], capture_output=True, text=True, timeout=10)
        latency_ms = (time.time() - start) * 1000

        if result.returncode != 0:
            return None, "Chat endpoint failed"

        return latency_ms, None
    except Exception as e:
        return None, str(e)

# ============================================
# PHASE 1.5: VISUAL VALIDATION (Puppeteer)
# ============================================

def check_puppeteer_used(transcript):
    """Vérifie que Puppeteer a été utilisé pour valider visuellement"""
    puppeteer_keywords = ['puppeteer', 'screenshot', 'eva-test']
    return any(kw in transcript.lower() for kw in puppeteer_keywords)

def check_screenshots_exist():
    """Vérifie qu'il y a des screenshots de validation"""
    screenshots_dir = Path(".claude/screenshots")
    if not screenshots_dir.exists():
        return 0, []
    screenshots = list(screenshots_dir.glob("*.png"))
    return len(screenshots), [s.name for s in screenshots]

# ============================================
# MAIN CHECK
# ============================================

transcript = str(input_data.get("transcript", ""))

# --- PHASE 0: Infrastructure ---
backend_ok, backend_err = check_backend()
if not backend_ok:
    failures.append(f"❌ INFRA: {backend_err}")

frontend_ok, frontend_err = check_frontend()
if not frontend_ok:
    failures.append(f"❌ INFRA: {frontend_err}")

gpu_ok, gpu_err = check_gpu()
if not gpu_ok:
    warnings.append(f"⚠️ GPU: {gpu_err}")

# --- PHASE 1: Latency ---
if backend_ok:
    chat_latency, chat_err = measure_chat_latency()
    if chat_err:
        failures.append(f"❌ LATENCY: Chat - {chat_err}")
    elif chat_latency:
        if chat_latency > 500:
            failures.append(f"❌ LATENCY: Chat {chat_latency:.0f}ms > 500ms BLOQUANT")
        elif chat_latency > 300:
            warnings.append(f"⚠️ LATENCY: Chat {chat_latency:.0f}ms > 300ms (objectif: <200ms)")

# --- PHASE 1.5: Visual Validation ---
screenshot_count, screenshot_names = check_screenshots_exist()
if screenshot_count < 2:
    warnings.append(f"⚠️ VISUEL: Seulement {screenshot_count} screenshots")

# ============================================
# OUTPUT
# ============================================

if failures:
    output = {
        "decision": "block",
        "reason": "🚫 EVA INCOMPLÈTE\n\n" + "\n\n".join(failures)
    }
    if warnings:
        output["reason"] += "\n\n--- WARNINGS ---\n" + "\n".join(warnings)
    print(json.dumps(output))
    sys.exit(0)

if warnings:
    print(f"⚠️ WARNINGS:\n" + "\n".join(warnings), file=sys.stderr)

print("✅ TOUS LES CHECKS EVA PASSENT")
sys.exit(0)
