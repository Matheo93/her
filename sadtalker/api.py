"""
SadTalker API - Real Lip Sync Animation
Generates video from image + audio with realistic lip movements
"""

import os
import sys
import shutil
import tempfile
import time
from pathlib import Path
from typing import Optional

import torch
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import uvicorn

# Add sadtalker to path
SADTALKER_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SADTALKER_DIR))

from src.utils.preprocess import CropAndExtract
from src.test_audio2coeff import Audio2Coeff
from src.facerender.animate import AnimateFromCoeff
from src.generate_batch import get_data
from src.generate_facerender_batch import get_facerender_data
from src.utils.init_path import init_path

# ============================================================================
# Configuration
# ============================================================================

CHECKPOINT_DIR = SADTALKER_DIR / "checkpoints"
CONFIG_DIR = SADTALKER_DIR / "src" / "config"
RESULTS_DIR = SADTALKER_DIR / "results"
AVATARS_DIR = SADTALKER_DIR.parent / "frontend" / "public" / "avatars"

RESULTS_DIR.mkdir(exist_ok=True)

# Device
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"SadTalker using device: {DEVICE}")

# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="SadTalker Lip Sync API",
    version="1.0.0",
    description="Real lip sync animation from image + audio"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global models (loaded once at startup)
preprocess_model: Optional[CropAndExtract] = None
audio_to_coeff: Optional[Audio2Coeff] = None
animate_from_coeff: Optional[AnimateFromCoeff] = None
sadtalker_paths: Optional[dict] = None


@app.on_event("startup")
async def startup():
    global preprocess_model, audio_to_coeff, animate_from_coeff, sadtalker_paths

    print("Loading SadTalker models...")
    start = time.time()

    try:
        # Initialize paths
        sadtalker_paths = init_path(
            str(CHECKPOINT_DIR),
            str(CONFIG_DIR),
            256,  # size
            False,  # old_version
            'crop'  # preprocess
        )

        # Load models
        preprocess_model = CropAndExtract(sadtalker_paths, DEVICE)
        audio_to_coeff = Audio2Coeff(sadtalker_paths, DEVICE)
        animate_from_coeff = AnimateFromCoeff(sadtalker_paths, DEVICE)

        print(f"SadTalker models loaded in {time.time() - start:.1f}s")
    except Exception as e:
        print(f"Error loading SadTalker: {e}")
        import traceback
        traceback.print_exc()


@app.get("/")
async def root():
    return {
        "service": "SadTalker Lip Sync API",
        "version": "1.0.0",
        "device": DEVICE,
        "ready": preprocess_model is not None
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy" if preprocess_model else "not_ready",
        "device": DEVICE,
        "cuda_available": torch.cuda.is_available()
    }


@app.get("/avatars")
async def list_avatars():
    """List available avatar images"""
    avatars = []
    if AVATARS_DIR.exists():
        for f in AVATARS_DIR.glob("*_nobg.png"):
            name = f.stem.replace("_nobg", "")
            avatars.append({
                "id": name,
                "name": name.title(),
                "path": str(f)
            })
    return {"avatars": avatars}


@app.post("/generate")
async def generate_video(
    audio: UploadFile = File(...),
    avatar: str = Form(default="eva"),
    pose_style: int = Form(default=0),
    expression_scale: float = Form(default=1.0),
):
    """
    Generate lip-synced video from audio and avatar image

    - audio: Audio file (wav, mp3)
    - avatar: Avatar name (eva, luna, emma, adam, alex)
    - pose_style: Pose style 0-45
    - expression_scale: Expression intensity (0.5-1.5)
    """
    if not preprocess_model:
        raise HTTPException(503, "Models not loaded yet")

    # Find avatar image
    avatar_path = AVATARS_DIR / f"{avatar}_nobg.png"
    if not avatar_path.exists():
        avatar_path = AVATARS_DIR / f"{avatar}.jpg"
    if not avatar_path.exists():
        raise HTTPException(404, f"Avatar '{avatar}' not found")

    # Create temp directory for this request
    request_id = f"{int(time.time() * 1000)}"
    work_dir = RESULTS_DIR / request_id
    work_dir.mkdir(exist_ok=True)

    try:
        # Save uploaded audio
        audio_path = work_dir / f"audio{Path(audio.filename).suffix}"
        with open(audio_path, "wb") as f:
            content = await audio.read()
            f.write(content)

        # Generate video
        print(f"Generating lip sync for {avatar} with {audio.filename}...")
        start = time.time()

        # Step 1: Extract 3DMM from source image
        first_frame_dir = work_dir / "first_frame"
        first_frame_dir.mkdir(exist_ok=True)

        first_coeff_path, crop_pic_path, crop_info = preprocess_model.generate(
            str(avatar_path),
            str(first_frame_dir),
            'crop',
            source_image_flag=True,
            pic_size=256
        )

        if first_coeff_path is None:
            raise HTTPException(500, "Failed to extract face coefficients")

        # Step 2: Audio to coefficients
        batch = get_data(
            first_coeff_path,
            str(audio_path),
            DEVICE,
            ref_eyeblink_coeff_path=None,
            still=True
        )
        coeff_path = audio_to_coeff.generate(batch, str(work_dir), pose_style, None)

        # Step 3: Generate video
        data = get_facerender_data(
            coeff_path,
            crop_pic_path,
            first_coeff_path,
            str(audio_path),
            batch_size=2,
            input_yaw_list=None,
            input_pitch_list=None,
            input_roll_list=None,
            expression_scale=expression_scale,
            still_mode=True,
            preprocess='crop',
            size=256
        )

        result_path = animate_from_coeff.generate(
            data,
            str(work_dir),
            str(avatar_path),
            crop_info,
            enhancer=None,
            background_enhancer=None,
            preprocess='crop',
            img_size=256
        )

        # Move result to final location
        output_path = RESULTS_DIR / f"{request_id}.mp4"
        shutil.move(result_path, output_path)

        print(f"Generated in {time.time() - start:.1f}s: {output_path}")

        # Clean up work directory
        shutil.rmtree(work_dir, ignore_errors=True)

        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename=f"lipsync_{avatar}_{request_id}.mp4"
        )

    except Exception as e:
        # Clean up on error
        shutil.rmtree(work_dir, ignore_errors=True)
        print(f"Error generating video: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))


@app.post("/generate-from-tts")
async def generate_from_tts(
    text: str = Form(...),
    avatar: str = Form(default="eva"),
    voice: str = Form(default="eva"),
    pose_style: int = Form(default=0),
):
    """
    Generate lip-synced video from text (uses TTS backend)
    """
    import httpx

    if not preprocess_model:
        raise HTTPException(503, "Models not loaded yet")

    # Get TTS audio from backend
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "http://localhost:8000/tts",
                json={"text": text, "voice": voice},
                timeout=30.0
            )
            if response.status_code != 200:
                raise HTTPException(500, "TTS generation failed")

            audio_content = response.content
        except Exception as e:
            raise HTTPException(500, f"TTS error: {e}")

    # Create temp audio file
    request_id = f"{int(time.time() * 1000)}"
    work_dir = RESULTS_DIR / request_id
    work_dir.mkdir(exist_ok=True)

    audio_path = work_dir / "tts_audio.mp3"
    with open(audio_path, "wb") as f:
        f.write(audio_content)

    # Find avatar
    avatar_path = AVATARS_DIR / f"{avatar}_nobg.png"
    if not avatar_path.exists():
        avatar_path = AVATARS_DIR / f"{avatar}.jpg"
    if not avatar_path.exists():
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(404, f"Avatar '{avatar}' not found")

    try:
        print(f"Generating lip sync for {avatar} from TTS...")
        start = time.time()

        # Extract 3DMM
        first_frame_dir = work_dir / "first_frame"
        first_frame_dir.mkdir(exist_ok=True)

        first_coeff_path, crop_pic_path, crop_info = preprocess_model.generate(
            str(avatar_path),
            str(first_frame_dir),
            'crop',
            source_image_flag=True,
            pic_size=256
        )

        if first_coeff_path is None:
            raise HTTPException(500, "Failed to extract face")

        # Audio to coefficients
        batch = get_data(
            first_coeff_path,
            str(audio_path),
            DEVICE,
            ref_eyeblink_coeff_path=None,
            still=True
        )
        coeff_path = audio_to_coeff.generate(batch, str(work_dir), pose_style, None)

        # Generate video
        data = get_facerender_data(
            coeff_path,
            crop_pic_path,
            first_coeff_path,
            str(audio_path),
            batch_size=2,
            input_yaw_list=None,
            input_pitch_list=None,
            input_roll_list=None,
            expression_scale=1.0,
            still_mode=True,
            preprocess='crop',
            size=256
        )

        result_path = animate_from_coeff.generate(
            data,
            str(work_dir),
            str(avatar_path),
            crop_info,
            enhancer=None,
            background_enhancer=None,
            preprocess='crop',
            img_size=256
        )

        output_path = RESULTS_DIR / f"{request_id}.mp4"
        shutil.move(result_path, output_path)

        print(f"Generated in {time.time() - start:.1f}s")

        shutil.rmtree(work_dir, ignore_errors=True)

        return FileResponse(
            output_path,
            media_type="video/mp4",
            filename=f"lipsync_{avatar}_{request_id}.mp4"
        )

    except Exception as e:
        shutil.rmtree(work_dir, ignore_errors=True)
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(500, str(e))


@app.delete("/results/{video_id}")
async def delete_result(video_id: str):
    """Delete a generated video"""
    video_path = RESULTS_DIR / f"{video_id}.mp4"
    if video_path.exists():
        video_path.unlink()
        return {"deleted": True}
    raise HTTPException(404, "Video not found")


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8003, reload=False)
