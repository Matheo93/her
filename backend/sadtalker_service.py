"""
SadTalker Service - Fast lip-sync generation
"""

import sys
import os
sys.path.insert(0, '/workspace/SadTalker')

import asyncio
import base64
import io
import tempfile
import time

import cv2
import torch
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan handler for startup/shutdown"""
    print("Starting SadTalker service...")
    initialize_sadtalker()
    yield
    print("SadTalker service shutting down...")


app = FastAPI(title="SadTalker Lip-Sync Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global
sadtalker = None
source_path = None

def initialize_sadtalker():
    global sadtalker
    if sadtalker is not None:
        return True

    try:
        from src.gradio_demo import SadTalker

        checkpoint_path = '/workspace/SadTalker/checkpoints'
        config_path = '/workspace/SadTalker/src/config'

        sadtalker = SadTalker(
            checkpoint_path=checkpoint_path,
            config_path=config_path,
            lazy_load=True
        )
        print("SadTalker initialized on GPU:", torch.cuda.is_available())
        return True
    except Exception as e:
        print(f"Error initializing SadTalker: {e}")
        import traceback
        traceback.print_exc()
        return False

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ready": sadtalker is not None,
        "cuda": torch.cuda.is_available()
    }

@app.post("/prepare_source")
async def prepare_source(source_image: UploadFile = File(...)):
    global source_path

    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            content = await source_image.read()
            tmp.write(content)
            source_path = tmp.name

        return {"status": "ok", "message": "Source prepared"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/generate")
async def generate(audio: UploadFile = File(...)):
    global sadtalker, source_path

    if sadtalker is None:
        if not initialize_sadtalker():
            return JSONResponse(status_code=500, content={"error": "SadTalker not initialized"})

    if source_path is None:
        return JSONResponse(status_code=400, content={"error": "No source image"})

    try:
        # Save audio
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            content = await audio.read()
            tmp.write(content)
            audio_path = tmp.name

        start_time = time.time()

        # Generate
        result_path = sadtalker.test(
            source_image=source_path,
            driven_audio=audio_path,
            preprocess='crop',
            still_mode=False,
            use_enhancer=False,
            batch_size=2,
            size=256,
            pose_style=0,
            exp_scale=1.0,
            use_ref_video=False,
            ref_video=None,
            ref_info=None,
            use_idle_mode=False,
            length_of_audio=0,
            result_dir='/tmp/sadtalker_results'
        )

        elapsed = time.time() - start_time
        print(f"Generation took {elapsed:.2f}s")

        # Read result
        with open(result_path, 'rb') as f:
            video_data = f.read()

        # Cleanup
        os.unlink(audio_path)
        os.unlink(result_path)

        return StreamingResponse(io.BytesIO(video_data), media_type="video/mp4")

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8007)
