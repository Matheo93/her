"""
REAL LivePortrait Animation API
100% LOCAL - Actual face animation, not fake frame shifting
"""

import sys
import os
import cv2
import numpy as np
import torch
import asyncio
import json
import time
import math
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, Response
import uvicorn

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.config.inference_config import InferenceConfig
from src.config.crop_config import CropConfig
from src.live_portrait_wrapper import LivePortraitWrapper
from src.utils.cropper import Cropper
from src.utils.camera import get_rotation_matrix

# ============================================================================
# Configuration
# ============================================================================

AVATARS_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "avatars"

print(f"AVATARS_DIR: {AVATARS_DIR}")

# ============================================================================
# Real LivePortrait Animator
# ============================================================================

class RealAnimator:
    """Real face animation using LivePortrait models"""

    def __init__(self):
        print("Initializing REAL LivePortrait Animator...")

        # Create config
        self.cfg = InferenceConfig(flag_force_cpu=True)

        # Load models
        print("Loading LivePortrait models...")
        self.wrapper = LivePortraitWrapper(inference_cfg=self.cfg)
        print("Models loaded!")

        # Initialize cropper for face detection
        self.crop_cfg = CropConfig(flag_force_cpu=True)
        self.cropper = Cropper(crop_cfg=self.crop_cfg, flag_force_cpu=True)

        # Source cache
        self.sources = {}

    def preprocess_source(self, image_path: str, source_id: str):
        """Preprocess a source image for animation"""
        print(f"Preprocessing {source_id}...")

        # Load image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read: {image_path}")

        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Detect and crop face
        crop_info = self.cropper.crop_source_image(img_rgb, self.crop_cfg)
        if crop_info is None:
            raise ValueError(f"No face detected in {image_path}")

        # Get cropped image
        img_crop_256 = crop_info['img_crop_256x256']
        lmk_crop = crop_info['lmk_crop']

        # Prepare source image tensor
        source_prepared = self.wrapper.prepare_source(img_crop_256)

        # Extract appearance features (feature volume)
        feature_3d = self.wrapper.extract_feature_3d(source_prepared)

        # Get keypoint info
        kp_info = self.wrapper.get_kp_info(source_prepared, flag_refine_info=True)

        # Transform keypoints to get source keypoints
        kp_source = self.wrapper.transform_keypoint(kp_info)

        # Store source info
        self.sources[source_id] = {
            'img': img,
            'img_rgb': img_rgb,
            'crop_info': crop_info,
            'feature_3d': feature_3d,
            'kp_source': kp_source,
            'kp_info': kp_info,
            'lmk_crop': lmk_crop,
        }

        print(f"Source {source_id} preprocessed!")
        return {"source_id": source_id, "status": "ok"}

    def generate_animated_frame(self, source_id: str, t: float) -> bytes:
        """Generate a frame with REAL face animation"""
        if source_id not in self.sources:
            raise ValueError(f"Source {source_id} not found")

        source = self.sources[source_id]

        # Get source info
        feature_3d = source['feature_3d']
        kp_source = source['kp_source']
        kp_info = source['kp_info']

        # Generate natural motion parameters based on time
        # Head rotation (very subtle)
        pitch_delta = math.sin(t * 0.5) * 3  # degrees
        yaw_delta = math.sin(t * 0.3 + 0.5) * 4
        roll_delta = math.sin(t * 0.7 + 1.0) * 2

        # Create driving keypoint info by modifying source
        kp_info_driving = {k: v.clone() if isinstance(v, torch.Tensor) else v for k, v in kp_info.items()}

        # Modify rotation
        kp_info_driving['pitch'] = kp_info['pitch'] + pitch_delta
        kp_info_driving['yaw'] = kp_info['yaw'] + yaw_delta
        kp_info_driving['roll'] = kp_info['roll'] + roll_delta

        # Transform to get driving keypoints
        kp_driving = self.wrapper.transform_keypoint(kp_info_driving)

        # Apply stitching for smoother results
        if self.cfg.flag_stitching:
            kp_driving = self.wrapper.stitching(kp_source, kp_driving)

        # Warp and decode
        ret_dct = self.wrapper.warp_decode(feature_3d, kp_source, kp_driving)

        # Parse output
        out = self.wrapper.parse_output(ret_dct['out'])  # 1xHxWx3

        # Get first frame
        out_frame = out[0]  # HxWx3

        # Convert to BGR for OpenCV
        out_bgr = cv2.cvtColor(out_frame, cv2.COLOR_RGB2BGR)

        # Encode as JPEG
        _, buffer = cv2.imencode('.jpg', out_bgr, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return buffer.tobytes()


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="REAL LivePortrait API",
    version="3.0.0",
    description="100% LOCAL - REAL face animation with LivePortrait"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

animator: Optional[RealAnimator] = None

@app.on_event("startup")
async def startup():
    global animator
    try:
        animator = RealAnimator()

        # Preprocess Eva
        eva_path = AVATARS_DIR / "eva.jpg"  # Use original with face visible
        if eva_path.exists():
            animator.preprocess_source(str(eva_path), "eva")
            print("Eva ready for REAL animation!")

    except Exception as e:
        print(f"Startup error: {e}")
        import traceback
        traceback.print_exc()
        animator = None

@app.get("/health")
async def health():
    return {
        "status": "healthy" if animator else "error",
        "sources": list(animator.sources.keys()) if animator else [],
        "real_animation": True
    }

@app.get("/frame/{source_id}")
async def get_frame(source_id: str):
    if not animator or source_id not in animator.sources:
        raise HTTPException(404, "Source not found")

    frame = animator.generate_animated_frame(source_id, time.time())
    return Response(content=frame, media_type="image/jpeg")

@app.get("/stream/{source_id}")
async def stream(source_id: str, fps: int = 12):
    """Stream animated frames"""
    if not animator or source_id not in animator.sources:
        raise HTTPException(404, "Source not found")

    def generate():
        start = time.time()
        while True:
            t = time.time() - start
            try:
                frame = animator.generate_animated_frame(source_id, t)
                yield b'--frame\r\n'
                yield b'Content-Type: image/jpeg\r\n\r\n'
                yield frame
                yield b'\r\n'
            except Exception as e:
                print(f"Frame error: {e}")
                break

            if t > 60:
                break
            time.sleep(1.0 / fps)

    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.websocket("/ws/animate")
async def ws_animate(ws: WebSocket):
    await ws.accept()

    if not animator:
        await ws.close(1011, "Not ready")
        return

    source_id = "eva"
    fps = 12
    is_streaming = False

    try:
        while True:
            try:
                data = await asyncio.wait_for(ws.receive(), timeout=0.01)
                if "text" in data:
                    msg = json.loads(data["text"])
                    if msg.get("type") == "start":
                        is_streaming = True
                        await ws.send_json({"type": "started"})
                    elif msg.get("type") == "stop":
                        is_streaming = False
                        await ws.send_json({"type": "stopped"})
                    elif msg.get("type") == "config":
                        source_id = msg.get("source_id", "eva")
                        fps = msg.get("fps", 12)
                        await ws.send_json({"type": "config_ok"})
            except asyncio.TimeoutError:
                pass

            if is_streaming and source_id in animator.sources:
                try:
                    frame = animator.generate_animated_frame(source_id, time.time())
                    await ws.send_bytes(frame)
                except Exception as e:
                    print(f"Animation error: {e}")
                await asyncio.sleep(1.0 / fps)

    except WebSocketDisconnect:
        pass


if __name__ == "__main__":
    uvicorn.run("real_animation_api:app", host="0.0.0.0", port=8002, reload=False)
