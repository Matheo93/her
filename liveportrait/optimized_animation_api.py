"""
Optimized LivePortrait Animation API
PRE-COMPUTED features + CACHED keypoints = FAST animation on CPU
100% LOCAL - NO EXTERNAL APIs
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
from typing import Optional, Dict, List
from dataclasses import dataclass
import threading
from queue import Queue

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
# Animation State
# ============================================================================

@dataclass
class AnimationState:
    """Per-avatar animation state"""
    blink_progress: float = 0.0
    last_blink_time: float = 0.0
    next_blink_interval: float = 3.0
    breath_phase: float = 0.0
    is_talking: bool = False
    talk_intensity: float = 0.0


# ============================================================================
# Pre-computed Frame Cache
# ============================================================================

class FrameCache:
    """Cache pre-computed animation frames for different states"""

    def __init__(self, max_frames: int = 120):  # 4 seconds at 30fps
        self.frames: Dict[str, List[bytes]] = {}
        self.max_frames = max_frames

    def add_frame(self, source_id: str, frame: bytes):
        if source_id not in self.frames:
            self.frames[source_id] = []

        if len(self.frames[source_id]) < self.max_frames:
            self.frames[source_id].append(frame)

    def get_frame(self, source_id: str, index: int) -> Optional[bytes]:
        if source_id not in self.frames:
            return None
        frames = self.frames[source_id]
        if not frames:
            return None
        return frames[index % len(frames)]

    def has_frames(self, source_id: str) -> bool:
        return source_id in self.frames and len(self.frames[source_id]) > 0


# ============================================================================
# Optimized LivePortrait Animator
# ============================================================================

class OptimizedAnimator:
    """
    Optimized face animation using pre-computed features
    Strategy: Pre-compute feature_3d and kp_source ONCE, then only vary kp_driving
    """

    def __init__(self, use_half_precision: bool = False):
        print("=" * 60)
        print("Initializing OPTIMIZED LivePortrait Animator...")
        print("=" * 60)

        # Determine device
        device = 'cpu'
        print(f"Using device: {device}")

        # Create config with CPU optimization
        self.cfg = InferenceConfig(
            flag_force_cpu=True,
            flag_use_half_precision=use_half_precision
        )

        # Load wrapper (this loads the models)
        print("Loading LivePortrait models (this may take a moment)...")
        self.wrapper = LivePortraitWrapper(inference_cfg=self.cfg)
        print("Models loaded!")

        # Initialize cropper for face detection
        self.crop_cfg = CropConfig(flag_force_cpu=True)
        self.cropper = Cropper(crop_cfg=self.crop_cfg, flag_force_cpu=True)

        # Source cache - stores PRE-COMPUTED data
        self.sources: Dict[str, dict] = {}

        # Animation states
        self.states: Dict[str, AnimationState] = {}

        # Frame cache for pre-rendered animations
        self.frame_cache = FrameCache()

        # Generation lock to prevent concurrent inference
        self._generation_lock = threading.Lock()

        print("Animator ready!")

    def preprocess_source(self, image_path: str, source_id: str) -> dict:
        """
        Preprocess and CACHE all expensive computations for a source image
        This is done ONCE per avatar, making subsequent frames fast
        """
        print(f"Preprocessing {source_id}...")

        # Load image
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Cannot read: {image_path}")

        # Handle alpha channel
        has_alpha = len(img.shape) == 3 and img.shape[2] == 4
        if has_alpha:
            bgr = img[:, :, :3]
            alpha = img[:, :, 3]
        else:
            bgr = img
            alpha = np.ones(img.shape[:2], dtype=np.uint8) * 255

        img_rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

        # Detect and crop face
        print(f"  Detecting face...")
        crop_info = self.cropper.crop_source_image(img_rgb, self.crop_cfg)
        if crop_info is None:
            raise ValueError(f"No face detected in {image_path}")

        # Get cropped image (256x256)
        img_crop_256 = crop_info['img_crop_256x256']
        lmk_crop = crop_info['lmk_crop']

        # EXPENSIVE: Prepare source tensor
        print(f"  Preparing source tensor...")
        source_prepared = self.wrapper.prepare_source(img_crop_256)

        # EXPENSIVE: Extract 3D feature volume (this is the most costly operation)
        print(f"  Extracting 3D features (this is slow on CPU)...")
        with torch.no_grad():
            feature_3d = self.wrapper.extract_feature_3d(source_prepared)

        # EXPENSIVE: Get keypoint info
        print(f"  Extracting keypoints...")
        with torch.no_grad():
            kp_info = self.wrapper.get_kp_info(source_prepared, flag_refine_info=True)

        # Transform to get source keypoints (base pose)
        kp_source = self.wrapper.transform_keypoint(kp_info)

        # Store all pre-computed data
        self.sources[source_id] = {
            'original_bgr': bgr.copy(),
            'original_alpha': alpha.copy(),
            'has_alpha': has_alpha,
            'img_rgb': img_rgb,
            'crop_info': crop_info,
            'img_crop_256': img_crop_256,
            # PRE-COMPUTED (expensive) data:
            'feature_3d': feature_3d,
            'kp_source': kp_source,
            'kp_info': kp_info,
            'lmk_crop': lmk_crop,
            # For paste back
            'M_c2o': crop_info.get('M_c2o'),
            'original_shape': bgr.shape[:2],
        }

        # Initialize animation state
        self.states[source_id] = AnimationState(last_blink_time=time.time())

        print(f"Source {source_id} preprocessed and cached!")
        return {
            "source_id": source_id,
            "has_alpha": has_alpha,
            "shape": bgr.shape[:2],
            "status": "ready"
        }

    def _update_animation_state(self, state: AnimationState, t: float) -> AnimationState:
        """Update animation state based on time"""
        current_time = time.time()

        # Blink logic - natural random blinking
        time_since_blink = current_time - state.last_blink_time
        if time_since_blink > state.next_blink_interval:
            state.blink_progress = 1.0
            state.last_blink_time = current_time
            state.next_blink_interval = 2.5 + np.random.random() * 4.0  # 2.5-6.5 seconds
        elif state.blink_progress > 0:
            # Fast close, slower open
            state.blink_progress = max(0, state.blink_progress - 0.25)

        # Breathing phase
        state.breath_phase = (t % 4.0) / 4.0  # 4 second breath cycle

        return state

    def generate_frame(self, source_id: str, t: float) -> bytes:
        """
        Generate a single animated frame using PRE-COMPUTED features
        Only the keypoint transformation and warp_decode are done per-frame
        """
        if source_id not in self.sources:
            raise ValueError(f"Source {source_id} not found")

        source = self.sources[source_id]
        state = self.states.get(source_id, AnimationState())

        # Update animation state
        state = self._update_animation_state(state, t)
        self.states[source_id] = state

        # Get pre-computed data
        feature_3d = source['feature_3d']
        kp_source = source['kp_source']
        kp_info = source['kp_info']

        # ============================================================
        # Generate driving keypoints based on time and animation state
        # This is the FAST part - just modifying keypoint parameters
        # ============================================================

        # Clone the keypoint info for modification
        kp_info_driving = {
            k: v.clone() if isinstance(v, torch.Tensor) else v
            for k, v in kp_info.items()
        }

        # Natural head movement parameters
        # Multiple overlapping sine waves for organic motion
        pitch_delta = (
            math.sin(t * 0.4) * 2.0 +      # Primary slow nod
            math.sin(t * 0.9 + 0.5) * 1.0   # Secondary micro movement
        )
        yaw_delta = (
            math.sin(t * 0.3 + 0.3) * 3.0 +  # Primary slow turn
            math.sin(t * 0.7 + 1.2) * 1.5    # Secondary micro movement
        )
        roll_delta = (
            math.sin(t * 0.5 + 0.8) * 1.5    # Subtle tilt
        )

        # Breathing effect on vertical position
        breath_offset = math.sin(state.breath_phase * 2 * math.pi) * 0.5

        # Apply head rotation deltas
        kp_info_driving['pitch'] = kp_info['pitch'] + pitch_delta + breath_offset
        kp_info_driving['yaw'] = kp_info['yaw'] + yaw_delta
        kp_info_driving['roll'] = kp_info['roll'] + roll_delta

        # Eye blink: Modify expression parameters
        if state.blink_progress > 0:
            # Expression tensor is [1, N, 3] where N is number of expression params
            # Eye-related indices typically include 11, 13, 15, 16, 18
            exp = kp_info_driving['exp'].clone()
            blink_factor = state.blink_progress * 0.3  # Subtle blink
            # Modify eye expression parameters
            for idx in [11, 13, 15, 16, 18]:  # Eye indices
                if idx < exp.shape[1]:
                    exp[:, idx, 1] -= blink_factor  # Close eyes (y-axis)
            kp_info_driving['exp'] = exp

        # Transform to get driving keypoints
        with self._generation_lock:
            kp_driving = self.wrapper.transform_keypoint(kp_info_driving)

            # Apply stitching for smoother results
            if self.cfg.flag_stitching:
                kp_driving = self.wrapper.stitching(kp_source, kp_driving)

            # ============================================================
            # WARP AND DECODE - The actual neural network inference
            # This uses the pre-computed feature_3d, so it's faster
            # ============================================================
            with torch.no_grad():
                ret_dct = self.wrapper.warp_decode(feature_3d, kp_source, kp_driving)

            # Parse output to numpy
            out = self.wrapper.parse_output(ret_dct['out'])  # 1xHxWx3

        # Get first frame (batch size 1)
        out_frame = out[0]  # HxWx3, RGB

        # Convert to BGR for OpenCV
        out_bgr = cv2.cvtColor(out_frame, cv2.COLOR_RGB2BGR)

        # Encode as JPEG (fast, good quality)
        _, buffer = cv2.imencode('.jpg', out_bgr, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buffer.tobytes()

    def pre_generate_frames(self, source_id: str, num_frames: int = 60, fps: int = 15):
        """Pre-generate frames for smooth playback"""
        if source_id not in self.sources:
            print(f"Source {source_id} not found, skipping pre-generation")
            return

        print(f"Pre-generating {num_frames} frames for {source_id}...")
        for i in range(num_frames):
            t = i / fps
            try:
                frame = self.generate_frame(source_id, t)
                self.frame_cache.add_frame(source_id, frame)
                if (i + 1) % 10 == 0:
                    print(f"  Generated {i + 1}/{num_frames} frames")
            except Exception as e:
                print(f"  Error generating frame {i}: {e}")
                break

        print(f"Pre-generation complete for {source_id}: {len(self.frame_cache.frames.get(source_id, []))} frames cached")


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="Optimized LivePortrait API",
    version="3.1.0",
    description="100% LOCAL - Optimized face animation with pre-computed features"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

animator: Optional[OptimizedAnimator] = None


@app.on_event("startup")
async def startup():
    global animator
    try:
        animator = OptimizedAnimator()

        # Preprocess Eva avatar
        eva_path = AVATARS_DIR / "eva.jpg"
        if not eva_path.exists():
            eva_path = AVATARS_DIR / "eva_nobg.png"

        if eva_path.exists():
            animator.preprocess_source(str(eva_path), "eva")
            print("Eva preprocessed and ready!")

            # Pre-generate some frames for instant playback
            print("Pre-generating animation frames...")
            animator.pre_generate_frames("eva", num_frames=60, fps=15)
        else:
            print(f"Warning: Eva avatar not found at {eva_path}")

    except Exception as e:
        print(f"Startup error: {e}")
        import traceback
        traceback.print_exc()
        animator = None


@app.get("/")
async def root():
    return {
        "service": "Optimized LivePortrait API",
        "version": "3.1.0",
        "local": True,
        "optimized": True,
        "description": "Pre-computed features for faster animation"
    }


@app.get("/health")
async def health():
    cached_frames = {}
    if animator and animator.frame_cache:
        for source_id, frames in animator.frame_cache.frames.items():
            cached_frames[source_id] = len(frames)

    return {
        "status": "healthy" if animator else "error",
        "sources": list(animator.sources.keys()) if animator else [],
        "cached_frames": cached_frames,
        "real_animation": True,
        "optimized": True
    }


@app.get("/frame/{source_id}")
async def get_frame(source_id: str, use_cache: bool = True):
    """Get a single animated frame"""
    if not animator or source_id not in animator.sources:
        raise HTTPException(404, "Source not found")

    # Try to use cached frame first for instant response
    if use_cache and animator.frame_cache.has_frames(source_id):
        frame_index = int(time.time() * 15) % 60  # Cycle through cached frames at ~15fps
        frame = animator.frame_cache.get_frame(source_id, frame_index)
        if frame:
            return Response(content=frame, media_type="image/jpeg")

    # Generate fresh frame
    frame = animator.generate_frame(source_id, time.time())
    return Response(content=frame, media_type="image/jpeg")


@app.get("/stream/{source_id}")
async def stream(source_id: str, fps: int = 15):
    """Stream animated frames"""
    if not animator or source_id not in animator.sources:
        raise HTTPException(404, "Source not found")

    def generate():
        start = time.time()
        frame_count = 0
        use_cache = animator.frame_cache.has_frames(source_id)

        while True:
            t = time.time() - start

            try:
                if use_cache:
                    # Use pre-generated cached frames
                    frame = animator.frame_cache.get_frame(source_id, frame_count)
                else:
                    # Generate on the fly
                    frame = animator.generate_frame(source_id, t)

                yield b'--frame\r\n'
                yield b'Content-Type: image/jpeg\r\n\r\n'
                yield frame
                yield b'\r\n'

                frame_count += 1

            except Exception as e:
                print(f"Frame error: {e}")
                break

            if t > 120:  # 2 minute max
                break

            time.sleep(1.0 / fps)

    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.websocket("/ws/animate")
async def ws_animate(ws: WebSocket):
    """WebSocket for real-time animation"""
    await ws.accept()

    if not animator:
        await ws.close(1011, "Not ready")
        return

    source_id = "eva"
    fps = 15
    is_streaming = False
    use_cache = True

    print(f"WebSocket connected")

    try:
        frame_count = 0
        start_time = time.time()

        while True:
            # Check for incoming messages
            try:
                data = await asyncio.wait_for(ws.receive(), timeout=0.01)
                if "text" in data:
                    msg = json.loads(data["text"])

                    if msg.get("type") == "start":
                        is_streaming = True
                        start_time = time.time()
                        frame_count = 0
                        await ws.send_json({"type": "started"})

                    elif msg.get("type") == "stop":
                        is_streaming = False
                        await ws.send_json({"type": "stopped"})

                    elif msg.get("type") == "config":
                        source_id = msg.get("source_id", "eva")
                        fps = msg.get("fps", 15)
                        use_cache = msg.get("use_cache", True)
                        await ws.send_json({
                            "type": "config_ok",
                            "source_id": source_id,
                            "fps": fps,
                            "cached": animator.frame_cache.has_frames(source_id)
                        })

            except asyncio.TimeoutError:
                pass

            # Stream frames if active
            if is_streaming and source_id in animator.sources:
                try:
                    t = time.time() - start_time

                    if use_cache and animator.frame_cache.has_frames(source_id):
                        frame = animator.frame_cache.get_frame(source_id, frame_count)
                    else:
                        frame = animator.generate_frame(source_id, t)

                    await ws.send_bytes(frame)
                    frame_count += 1

                except Exception as e:
                    print(f"Animation error: {e}")

                await asyncio.sleep(1.0 / fps)

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")


@app.post("/preload/{source_id}")
async def preload_source(source_id: str):
    """Manually trigger pre-generation for a source"""
    if not animator or source_id not in animator.sources:
        raise HTTPException(404, "Source not found")

    animator.pre_generate_frames(source_id)
    return {
        "status": "ok",
        "cached_frames": len(animator.frame_cache.frames.get(source_id, []))
    }


if __name__ == "__main__":
    uvicorn.run("optimized_animation_api:app", host="0.0.0.0", port=8002, reload=False)
