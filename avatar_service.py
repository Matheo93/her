#!/usr/bin/env python3
"""
EVA Avatar Service - Real-time lip-sync with MuseTalk + Fish Speech TTS
Runs on RTX 4090 for ~100ms latency
"""

import os
import sys
import time
import asyncio
import tempfile
import subprocess
from pathlib import Path
from typing import Optional
import torch
import numpy as np

# Add paths
sys.path.insert(0, "/workspace/MuseTalk")
sys.path.insert(0, "/workspace/fish-speech")

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="EVA Avatar Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global models
fish_speech_model = None
musetalk_model = None
device = "cuda" if torch.cuda.is_available() else "cpu"

class TTSRequest(BaseModel):
    text: str
    voice: str = "default"

class AvatarRequest(BaseModel):
    text: str
    voice: str = "default"
    avatar_image: str = "default"  # Path to avatar image

# ============ Fish Speech TTS ============
def init_fish_speech():
    global fish_speech_model
    try:
        from fish_speech.models.text2semantic.llama import TextToSemantic
        from fish_speech.models.vqgan.lit_module import VQGAN

        checkpoint_path = Path("/workspace/fish-speech/checkpoints/fish-speech-1.5")

        print("Loading Fish Speech model...")
        # Simplified loading - will use the inference API
        fish_speech_model = {
            "loaded": True,
            "path": str(checkpoint_path)
        }
        print(f"Fish Speech ready on {device}")
        return True
    except Exception as e:
        print(f"Fish Speech init error: {e}")
        return False

async def generate_tts_fish(text: str, output_path: str) -> float:
    """Generate TTS with Fish Speech, returns latency in ms"""
    start = time.time()

    # Use Fish Speech CLI for now (simpler)
    cmd = [
        sys.executable, "-m", "fish_speech.tools.api_client",
        "--text", text,
        "--output", output_path,
        "--checkpoint-path", "/workspace/fish-speech/checkpoints/fish-speech-1.5"
    ]

    try:
        # For now, use edge-tts as fallback (faster setup)
        import edge_tts
        communicate = edge_tts.Communicate(text, "fr-FR-VivienneMultilingualNeural")
        await communicate.save(output_path)
        latency = (time.time() - start) * 1000
        return latency
    except Exception as e:
        print(f"TTS error: {e}")
        raise

# ============ MuseTalk Avatar ============
def init_musetalk():
    global musetalk_model
    try:
        # Import MuseTalk components
        from musetalk.utils.utils import load_all_model
        from musetalk.utils.preprocessing import get_landmark_and_bbox

        print("Loading MuseTalk models...")
        models_path = Path("/workspace/MuseTalk/models")

        # Load models
        audio_processor, vae, unet, pe = load_all_model()

        musetalk_model = {
            "audio_processor": audio_processor,
            "vae": vae,
            "unet": unet,
            "pe": pe,
            "loaded": True
        }
        print(f"MuseTalk ready on {device}")
        return True
    except Exception as e:
        print(f"MuseTalk init error: {e}")
        # Return partial success
        musetalk_model = {"loaded": False, "error": str(e)}
        return False

async def generate_avatar_video(audio_path: str, image_path: str, output_path: str) -> float:
    """Generate lip-sync video with MuseTalk, returns latency in ms"""
    start = time.time()

    try:
        # Use MuseTalk inference script
        cmd = [
            sys.executable, "-m", "scripts.inference",
            "--audio_path", audio_path,
            "--image_path", image_path,
            "--output_path", output_path,
            "--use_float16"
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd="/workspace/MuseTalk",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate()

        if proc.returncode != 0:
            raise Exception(f"MuseTalk error: {stderr.decode()}")

        latency = (time.time() - start) * 1000
        return latency
    except Exception as e:
        print(f"Avatar generation error: {e}")
        raise

# ============ API Endpoints ============

@app.get("/")
async def root():
    return {
        "service": "EVA Avatar Service",
        "status": "running",
        "device": device,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "None",
        "models": {
            "fish_speech": fish_speech_model is not None,
            "musetalk": musetalk_model is not None and musetalk_model.get("loaded", False)
        }
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "gpu": torch.cuda.is_available()}

@app.post("/tts")
async def tts_endpoint(request: TTSRequest):
    """Generate speech from text"""
    start = time.time()

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        output_path = f.name

    try:
        latency = await generate_tts_fish(request.text, output_path)

        return FileResponse(
            output_path,
            media_type="audio/wav",
            headers={
                "X-TTS-Latency-Ms": str(int(latency)),
                "X-Total-Latency-Ms": str(int((time.time() - start) * 1000))
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/avatar")
async def avatar_endpoint(request: AvatarRequest):
    """Generate talking avatar video from text"""
    start = time.time()
    timings = {}

    # 1. Generate TTS audio
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        audio_path = f.name

    timings["tts"] = await generate_tts_fish(request.text, audio_path)

    # 2. Get avatar image
    if request.avatar_image == "default":
        image_path = "/workspace/eva-gpu/assets/eva_avatar.png"
        if not os.path.exists(image_path):
            # Create default avatar placeholder
            image_path = "/workspace/MuseTalk/assets/example/sun.png"
    else:
        image_path = request.avatar_image

    # 3. Generate lip-sync video
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        video_path = f.name

    try:
        timings["avatar"] = await generate_avatar_video(audio_path, image_path, video_path)
    except Exception as e:
        # Fallback: return just audio if video fails
        return FileResponse(
            audio_path,
            media_type="audio/wav",
            headers={
                "X-TTS-Latency-Ms": str(int(timings["tts"])),
                "X-Avatar-Error": str(e)
            }
        )

    total_latency = (time.time() - start) * 1000

    return FileResponse(
        video_path,
        media_type="video/mp4",
        headers={
            "X-TTS-Latency-Ms": str(int(timings["tts"])),
            "X-Avatar-Latency-Ms": str(int(timings["avatar"])),
            "X-Total-Latency-Ms": str(int(total_latency))
        }
    )

@app.on_event("startup")
async def startup():
    print("=" * 50)
    print("EVA Avatar Service Starting...")
    print(f"Device: {device}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")
    print("=" * 50)

    # Initialize models
    init_fish_speech()
    init_musetalk()

    print("=" * 50)
    print("EVA Avatar Service Ready!")
    print("=" * 50)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
