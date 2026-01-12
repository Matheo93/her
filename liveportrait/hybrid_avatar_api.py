"""
Hybrid Avatar Animation API - 24 FPS
Uses pre-rendered frames for idle + real-time generation for speaking/emotions
"""

import os
import sys
sys.path.insert(0, '.')

import torch
import torch_directml
import cv2
import numpy as np
import time
import asyncio
import json
from pathlib import Path
from typing import Optional, Dict, List
from dataclasses import dataclass, field

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
import uvicorn

# AMD GPU via DirectML
dml = torch_directml.device()
print(f"Using AMD GPU: {dml}")

# Fake CUDA for LivePortrait compatibility
class FakeCuda:
    is_available = staticmethod(lambda: True)
    device_count = staticmethod(lambda: 1)
    get_device_name = staticmethod(lambda idx=0: "AMD RX 7600M XT")
    current_device = staticmethod(lambda: 0)
    set_device = staticmethod(lambda idx: None)
    synchronize = staticmethod(lambda: None)
torch.cuda = FakeCuda

AVATARS_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "avatars"
CACHE_DIR = Path(__file__).resolve().parent / "animation_cache"


@dataclass
class AnimationCache:
    """Pre-rendered animation frames for an avatar"""
    frames: List[bytes] = field(default_factory=list)
    fps: int = 24
    duration: float = 4.0  # seconds
    current_index: int = 0

    def get_next_frame(self) -> bytes:
        """Get next frame in the loop"""
        if not self.frames:
            return b""
        frame = self.frames[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.frames)
        return frame

    def get_frame_at_time(self, t: float) -> bytes:
        """Get frame at specific time"""
        if not self.frames:
            return b""
        # Loop time
        t = t % self.duration
        index = int(t * self.fps) % len(self.frames)
        return self.frames[index]


@dataclass
class AnimState:
    """Animation state per avatar"""
    last_blink: float = 0.0
    blink_progress: float = 0.0
    next_blink: float = 3.0
    speaking: bool = False
    emotion: str = "neutral"


class HybridAnimator:
    """
    Hybrid animation approach:
    - Pre-rendered frames for idle animation (24 FPS)
    - Real-time generation for speaking/emotions
    """

    def __init__(self):
        self.wrapper = None
        self.cropper = None
        self.sources: Dict[str, dict] = {}
        self.states: Dict[str, AnimState] = {}
        self.caches: Dict[str, AnimationCache] = {}
        self.device = dml
        self.gpu_enabled = False

    def initialize(self):
        """Load LivePortrait models"""
        print("Loading LivePortrait for hybrid animation...")
        start = time.time()

        from src.config.inference_config import InferenceConfig
        from src.config.crop_config import CropConfig
        from src.live_portrait_wrapper import LivePortraitWrapper
        from src.utils.cropper import Cropper

        cfg = InferenceConfig()
        cfg.flag_force_cpu = True
        crop_cfg = CropConfig()

        self.wrapper = LivePortraitWrapper(cfg)
        torch.set_num_threads(16)
        torch.set_num_interop_threads(4)

        # Only spade_generator on GPU
        try:
            self.wrapper.spade_generator = self.wrapper.spade_generator.to(dml)
            self.gpu_enabled = True
            print(f"  spade_generator on DirectML GPU!")
        except Exception as e:
            print(f"  Failed to move spade_generator to GPU: {e}")
            self.gpu_enabled = False

        self.cropper = Cropper(crop_cfg=crop_cfg, flag_force_cpu=True)
        print(f"LivePortrait ready in {time.time()-start:.1f}s")

    def preprocess_source(self, image_path: str, source_id: str) -> dict:
        """Preprocess avatar and generate idle animation cache"""
        print(f"Preprocessing {source_id}...")

        from src.config.crop_config import CropConfig
        crop_cfg = CropConfig()

        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Cannot load: {image_path}")

        if img.shape[2] == 4:
            alpha = img[:, :, 3:4]
            rgb = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2RGB)
        else:
            alpha = None
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        crop_info = self.cropper.crop_source_image(rgb, crop_cfg)
        if crop_info is None:
            raise ValueError(f"No face detected in {image_path}")

        source_rgb = crop_info['img_crop_256x256']
        source_tensor = torch.from_numpy(source_rgb).permute(2, 0, 1).unsqueeze(0).float() / 255.0

        with torch.no_grad():
            f_s = self.wrapper.extract_feature_3d(source_tensor)
            x_s_info = self.wrapper.get_kp_info(source_tensor)
            x_s = self.wrapper.transform_keypoint(x_s_info)

        self.sources[source_id] = {
            'f_s': f_s,
            'x_s': x_s,
            'x_s_info': x_s_info,
            'crop_info': crop_info,
            'original_shape': img.shape[:2],
            'alpha': alpha,
            'source_tensor': source_tensor
        }
        self.states[source_id] = AnimState(last_blink=time.time())

        # Try to load cached animation
        cache_file = CACHE_DIR / f"{source_id}_cache.npz"
        if cache_file.exists():
            print(f"  Loading cached animation for {source_id}...")
            self._load_cache(source_id, cache_file)
        else:
            print(f"  No cache found, will generate on first request")
            self.caches[source_id] = AnimationCache()

        print(f"  {source_id} preprocessed!")
        return {'source_id': source_id, 'shape': img.shape[:2]}

    def _load_cache(self, source_id: str, cache_file: Path):
        """Load pre-rendered animation from cache"""
        try:
            data = np.load(str(cache_file), allow_pickle=True)
            frames = [f.tobytes() for f in data['frames']]
            self.caches[source_id] = AnimationCache(
                frames=frames,
                fps=int(data['fps']),
                duration=float(data['duration'])
            )
            print(f"  Loaded {len(frames)} cached frames")
        except Exception as e:
            print(f"  Failed to load cache: {e}")
            self.caches[source_id] = AnimationCache()

    def generate_idle_cache(self, source_id: str, fps: int = 24, duration: float = 4.0) -> int:
        """Generate and cache idle animation frames"""
        if source_id not in self.sources:
            raise ValueError(f"Source {source_id} not found")

        print(f"Generating {duration}s idle animation at {fps} FPS...")
        source = self.sources[source_id]
        total_frames = int(fps * duration)
        frames = []

        # Blink timing within the loop
        blink_times = [1.2, 3.5]  # seconds

        for i in range(total_frames):
            t = i / fps

            # Smooth head movements
            head_yaw = np.sin(t * 0.5) * 0.06 + np.sin(t * 1.2) * 0.02
            head_pitch = np.sin(t * 0.7) * 0.04 + np.sin(t * 1.5) * 0.015
            head_roll = np.sin(t * 0.6) * 0.015

            # Blink at specific times
            blink = 0
            for bt in blink_times:
                frame_dist = abs(i - int(bt * fps))
                if frame_dist < 4:
                    blink = max(blink, 1 - frame_dist / 4)

            x_d_info = {k: v.clone() if torch.is_tensor(v) else v for k, v in source['x_s_info'].items()}
            x_d_info['pitch'] = source['x_s_info']['pitch'] + head_pitch
            x_d_info['yaw'] = source['x_s_info']['yaw'] + head_yaw
            x_d_info['roll'] = source['x_s_info']['roll'] + head_roll

            if blink > 0:
                x_d_info['exp'] = source['x_s_info']['exp'].clone()
                x_d_info['exp'][:, 0] -= blink * 0.5

            with torch.no_grad():
                x_d = self.wrapper.transform_keypoint(x_d_info)
                ret_dct = self.wrapper.warping_module(source['f_s'], kp_source=source['x_s'], kp_driving=x_d)

                if self.gpu_enabled:
                    warped_feature = ret_dct['out'].to(dml)
                    out_img = self.wrapper.spade_generator(feature=warped_feature)
                    out_img = out_img.cpu()
                else:
                    out_img = self.wrapper.spade_generator(feature=ret_dct['out'])

            frame = out_img[0].permute(1, 2, 0).numpy()
            frame = (frame * 255).clip(0, 255).astype(np.uint8)
            frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

            _, buffer = cv2.imencode('.webp', frame_bgr, [cv2.IMWRITE_WEBP_QUALITY, 85])
            frames.append(buffer)

            if (i + 1) % 10 == 0:
                print(f"  Frame {i+1}/{total_frames}")

        # Save cache
        CACHE_DIR.mkdir(exist_ok=True)
        cache_file = CACHE_DIR / f"{source_id}_cache.npz"
        np.savez(str(cache_file),
                 frames=np.array([np.frombuffer(f.tobytes(), dtype=np.uint8) for f in frames], dtype=object),
                 fps=fps,
                 duration=duration)

        self.caches[source_id] = AnimationCache(
            frames=[f.tobytes() for f in frames],
            fps=fps,
            duration=duration
        )

        print(f"  Cached {len(frames)} frames to {cache_file}")
        return len(frames)

    def generate_realtime_frame(self, source_id: str, t: float, speaking: bool = False) -> bytes:
        """Generate frame in real-time (for speaking/emotions)"""
        if source_id not in self.sources:
            raise ValueError(f"Source {source_id} not found")

        source = self.sources[source_id]
        state = self.states[source_id]

        # More expressive movements when speaking
        if speaking:
            head_yaw = np.sin(t * 0.8) * 0.1 + np.sin(t * 2.0) * 0.03
            head_pitch = np.sin(t * 1.0) * 0.06 + np.sin(t * 2.5) * 0.02
            head_roll = np.sin(t * 0.7) * 0.02
        else:
            head_yaw = np.sin(t * 0.3) * 0.06
            head_pitch = np.sin(t * 0.4) * 0.04
            head_roll = np.sin(t * 0.5) * 0.015

        # Natural blink
        current_time = time.time()
        if current_time - state.last_blink > state.next_blink and state.blink_progress == 0:
            state.blink_progress = 1.0
            state.last_blink = current_time
            state.next_blink = 2.5 + np.random.random() * 3.0

        blink = 0.0
        if state.blink_progress > 0:
            blink = state.blink_progress
            state.blink_progress = max(0, state.blink_progress - 0.15)

        x_d_info = {k: v.clone() if torch.is_tensor(v) else v for k, v in source['x_s_info'].items()}
        x_d_info['pitch'] = source['x_s_info']['pitch'] + head_pitch
        x_d_info['yaw'] = source['x_s_info']['yaw'] + head_yaw
        x_d_info['roll'] = source['x_s_info']['roll'] + head_roll

        if blink > 0:
            x_d_info['exp'] = source['x_s_info']['exp'].clone()
            x_d_info['exp'][:, 0] -= blink * 0.5

        # Mouth movement when speaking
        if speaking:
            if 'exp' not in x_d_info or x_d_info['exp'] is source['x_s_info']['exp']:
                x_d_info['exp'] = source['x_s_info']['exp'].clone()
            # Open mouth variation
            mouth_open = abs(np.sin(t * 8)) * 0.3
            x_d_info['exp'][:, 10] += mouth_open  # Mouth expression coefficient

        with torch.no_grad():
            x_d = self.wrapper.transform_keypoint(x_d_info)
            ret_dct = self.wrapper.warping_module(source['f_s'], kp_source=source['x_s'], kp_driving=x_d)

            if self.gpu_enabled:
                warped_feature = ret_dct['out'].to(dml)
                out_img = self.wrapper.spade_generator(feature=warped_feature)
                out_img = out_img.cpu()
            else:
                out_img = self.wrapper.spade_generator(feature=ret_dct['out'])

        frame = out_img[0].permute(1, 2, 0).numpy()
        frame = (frame * 255).clip(0, 255).astype(np.uint8)
        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        _, buffer = cv2.imencode('.webp', frame_bgr, [cv2.IMWRITE_WEBP_QUALITY, 85])
        return buffer.tobytes()

    def get_frame(self, source_id: str, t: float, speaking: bool = False) -> bytes:
        """Get animation frame - cached for idle, real-time for speaking"""
        if speaking:
            return self.generate_realtime_frame(source_id, t, speaking=True)

        # Use cached idle animation
        cache = self.caches.get(source_id)
        if cache and cache.frames:
            return cache.get_frame_at_time(t)

        # Fallback to real-time if no cache
        return self.generate_realtime_frame(source_id, t, speaking=False)


# FastAPI app
app = FastAPI(title="Hybrid Avatar API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

animator: Optional[HybridAnimator] = None


@app.on_event("startup")
async def startup():
    global animator
    animator = HybridAnimator()
    animator.initialize()

    # Preprocess Eva
    eva_path = AVATARS_DIR / "eva_nobg.png"
    if eva_path.exists():
        try:
            animator.preprocess_source(str(eva_path), "eva")

            # Generate cache if not exists
            if not animator.caches["eva"].frames:
                print("Generating idle animation cache for Eva...")
                animator.generate_idle_cache("eva", fps=24, duration=4.0)
        except Exception as e:
            print(f"Error preprocessing eva: {e}")

    print(f"Hybrid Avatar API ready with sources: {list(animator.sources.keys())}")
    for sid, cache in animator.caches.items():
        print(f"  {sid}: {len(cache.frames)} cached frames ({cache.duration}s at {cache.fps} FPS)")


@app.get("/health")
async def health():
    cached_info = {}
    if animator:
        for sid, cache in animator.caches.items():
            cached_info[sid] = {
                "frames": len(cache.frames),
                "fps": cache.fps,
                "duration": cache.duration
            }

    return {
        "status": "healthy" if animator and animator.wrapper else "error",
        "avatars": list(animator.sources.keys()) if animator else [],
        "gpu": "AMD RX 7600M XT (DirectML)",
        "type": "hybrid_prerendered_realtime",
        "cache": cached_info,
        "performance": {
            "idle_fps": 24,
            "realtime_fps": 1.5,
            "mode": "prerendered_idle_realtime_speaking"
        }
    }


@app.get("/frame/{avatar_id}")
async def get_frame(avatar_id: str, speaking: bool = False):
    """Get animated frame - uses cache for idle, real-time for speaking"""
    if not animator or avatar_id not in animator.sources:
        raise HTTPException(404, f"Avatar {avatar_id} not found")

    frame = animator.get_frame(avatar_id, time.time(), speaking=speaking)
    return Response(content=frame, media_type="image/webp")


@app.websocket("/ws/{avatar_id}")
async def ws_animate(ws: WebSocket, avatar_id: str):
    """WebSocket for real-time animation streaming at 24 FPS"""
    await ws.accept()

    if not animator or avatar_id not in animator.sources:
        await ws.close(1008, "Avatar not found")
        return

    fps = 24
    start_time = time.time()
    speaking = False

    try:
        while True:
            # Check for messages
            try:
                data = await asyncio.wait_for(ws.receive(), timeout=0.001)
                if "text" in data:
                    msg = json.loads(data["text"])
                    if msg.get("type") == "stop":
                        break
                    elif msg.get("type") == "speaking":
                        speaking = msg.get("value", False)
            except asyncio.TimeoutError:
                pass

            t = time.time() - start_time
            frame = animator.get_frame(avatar_id, t, speaking=speaking)
            await ws.send_bytes(frame)

            await asyncio.sleep(1.0 / fps)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WS error: {e}")


@app.post("/generate-cache/{avatar_id}")
async def generate_cache(avatar_id: str, fps: int = 24, duration: float = 4.0):
    """Generate idle animation cache for an avatar"""
    if not animator or avatar_id not in animator.sources:
        raise HTTPException(404, f"Avatar {avatar_id} not found")

    try:
        num_frames = animator.generate_idle_cache(avatar_id, fps=fps, duration=duration)
        return {"status": "ok", "frames": num_frames, "fps": fps, "duration": duration}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/cached-animation/{avatar_id}")
async def get_cached_animation(avatar_id: str):
    """Get info about cached animation"""
    if not animator or avatar_id not in animator.caches:
        raise HTTPException(404, f"No cache for {avatar_id}")

    cache = animator.caches[avatar_id]
    return {
        "avatar_id": avatar_id,
        "frames": len(cache.frames),
        "fps": cache.fps,
        "duration": cache.duration,
        "has_cache": len(cache.frames) > 0
    }


if __name__ == "__main__":
    uvicorn.run("hybrid_avatar_api:app", host="0.0.0.0", port=8002, reload=False)
