"""
Avatar Animation API with AMD GPU (DirectML)
Real face movements: head rotation, eye blinks, expressions
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
from typing import Optional, Dict
from dataclasses import dataclass

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


@dataclass
class AnimState:
    """Animation state per avatar"""
    last_blink: float = 0.0
    blink_progress: float = 0.0
    next_blink: float = 3.0
    head_target_yaw: float = 0.0
    head_target_pitch: float = 0.0
    head_current_yaw: float = 0.0
    head_current_pitch: float = 0.0


class LivePortraitAnimator:
    """Real face animation using LivePortrait on AMD GPU"""

    def __init__(self):
        self.wrapper = None
        self.cropper = None
        self.sources: Dict[str, dict] = {}
        self.states: Dict[str, AnimState] = {}
        self.device = dml

    def initialize(self):
        """Load LivePortrait models"""
        print("Loading LivePortrait on AMD GPU...")
        start = time.time()

        from src.config.inference_config import InferenceConfig
        from src.config.crop_config import CropConfig
        from src.live_portrait_wrapper import LivePortraitWrapper
        from src.utils.cropper import Cropper

        cfg = InferenceConfig()
        cfg.flag_force_cpu = True  # Load on CPU first, move heavy models to GPU after
        crop_cfg = CropConfig()

        self.wrapper = LivePortraitWrapper(cfg)

        # Optimize CPU inference with multi-threading
        torch.set_num_threads(16)  # Use 16 threads for parallel computation
        torch.set_num_interop_threads(4)  # Inter-op parallelism

        # Only spade_generator on GPU (warping has grid_sample which is slow on DirectML)
        self.gpu_enabled = False
        try:
            self.wrapper.spade_generator = self.wrapper.spade_generator.to(dml)
            self.gpu_enabled = True
            print(f"  spade_generator on DirectML GPU!")
        except Exception as e:
            print(f"  Failed to move spade_generator to GPU: {e}")
            self.gpu_enabled = False
        print(f"  CPU threads: {torch.get_num_threads()}")

        # Cropper uses ONNX on CPU
        self.cropper = Cropper(crop_cfg=crop_cfg, flag_force_cpu=True)

        print(f"LivePortrait ready on AMD GPU in {time.time()-start:.1f}s")

    def preprocess_source(self, image_path: str, source_id: str) -> dict:
        """Preprocess avatar image for animation"""
        print(f"Preprocessing {source_id}...")

        from src.config.crop_config import CropConfig
        crop_cfg = CropConfig()

        # Load image
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Cannot load: {image_path}")

        # Handle alpha channel
        if img.shape[2] == 4:
            alpha = img[:, :, 3:4]
            rgb = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2RGB)
        else:
            alpha = None
            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Crop face using correct method
        crop_info = self.cropper.crop_source_image(rgb, crop_cfg)
        if crop_info is None:
            raise ValueError(f"No face detected in {image_path}")

        source_rgb = crop_info['img_crop_256x256']

        # Extract features - keep on CPU for now
        source_tensor = torch.from_numpy(source_rgb).permute(2, 0, 1).unsqueeze(0).float() / 255.0
        # source_tensor = source_tensor.to(dml)  # DirectML crashes, using CPU

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

        print(f"  {source_id} preprocessed!")
        return {'source_id': source_id, 'shape': img.shape[:2]}

    def generate_frame(self, source_id: str, t: float,
                       speaking: bool = False,
                       emotion: str = "neutral") -> bytes:
        """Generate animated frame with real face movements"""
        if source_id not in self.sources:
            raise ValueError(f"Source {source_id} not found")

        source = self.sources[source_id]
        state = self.states[source_id]

        # Animation parameters
        # Head movement - subtle idle motion
        head_yaw = np.sin(t * 0.3) * 0.08 + np.sin(t * 0.7) * 0.03
        head_pitch = np.sin(t * 0.4) * 0.05 + np.sin(t * 0.9) * 0.02
        head_roll = np.sin(t * 0.5) * 0.02

        # Blink
        current_time = time.time()
        if current_time - state.last_blink > state.next_blink and state.blink_progress == 0:
            state.blink_progress = 1.0
            state.last_blink = current_time
            state.next_blink = 2.5 + np.random.random() * 3.0

        blink = 0.0
        if state.blink_progress > 0:
            # Blink curve: fast close, slower open
            blink = state.blink_progress
            state.blink_progress = max(0, state.blink_progress - 0.15)

        # Expression based on emotion/speaking
        exp_scale = 1.0
        if speaking:
            # Mouth movement when speaking
            exp_scale = 1.0 + np.sin(t * 8) * 0.1

        self.states[source_id] = state

        # Create driving parameters
        x_d_info = {k: v.clone() if torch.is_tensor(v) else v for k, v in source['x_s_info'].items()}

        # Apply head rotation
        x_d_info['pitch'] = source['x_s_info']['pitch'] + head_pitch
        x_d_info['yaw'] = source['x_s_info']['yaw'] + head_yaw
        x_d_info['roll'] = source['x_s_info']['roll'] + head_roll

        # Apply blink (modify expression)
        if blink > 0:
            # Eye closure coefficient
            x_d_info['exp'] = source['x_s_info']['exp'].clone()
            x_d_info['exp'][:, 0] -= blink * 0.5  # Close eyes

        with torch.no_grad():
            x_d = self.wrapper.transform_keypoint(x_d_info)

            f_s = source['f_s']
            x_s = source['x_s']

            # Warping on CPU (grid_sample is slow on DirectML)
            ret_dct = self.wrapper.warping_module(f_s, kp_source=x_s, kp_driving=x_d)

            # spade_generator on GPU if available
            if self.gpu_enabled:
                warped_feature = ret_dct['out'].to(dml)
                out_img = self.wrapper.spade_generator(feature=warped_feature)
                out_img = out_img.cpu()
            else:
                out_img = self.wrapper.spade_generator(feature=ret_dct['out'])

        # Convert to image
        frame = out_img[0].permute(1, 2, 0).numpy()
        frame = (frame * 255).clip(0, 255).astype(np.uint8)
        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        # Encode as WebP for speed
        _, buffer = cv2.imencode('.webp', frame_bgr, [cv2.IMWRITE_WEBP_QUALITY, 85])
        return buffer.tobytes()


# FastAPI app
app = FastAPI(title="AMD GPU Avatar API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

animator: Optional[LivePortraitAnimator] = None


@app.on_event("startup")
async def startup():
    global animator
    animator = LivePortraitAnimator()
    animator.initialize()

    # Preprocess Eva
    eva_path = AVATARS_DIR / "eva_nobg.png"
    if eva_path.exists():
        try:
            animator.preprocess_source(str(eva_path), "eva")
        except Exception as e:
            print(f"Error preprocessing eva: {e}")

    print(f"Avatar API ready with sources: {list(animator.sources.keys())}")


@app.get("/health")
async def health():
    return {
        "status": "healthy" if animator and animator.wrapper else "error",
        "avatars": list(animator.sources.keys()) if animator else [],
        "gpu": "AMD RX 7600M XT (DirectML)",
        "type": "liveportrait_real_animation"
    }


@app.get("/frame/{avatar_id}")
async def get_frame(avatar_id: str, speaking: bool = False):
    """Get animated frame"""
    if not animator or avatar_id not in animator.sources:
        raise HTTPException(404, f"Avatar {avatar_id} not found")

    frame = animator.generate_frame(avatar_id, time.time(), speaking=speaking)
    return Response(content=frame, media_type="image/webp")


@app.websocket("/ws/{avatar_id}")
async def ws_animate(ws: WebSocket, avatar_id: str):
    """WebSocket for real-time animation streaming"""
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
                    elif msg.get("fps"):
                        fps = min(30, max(10, msg["fps"]))
            except asyncio.TimeoutError:
                pass

            # Generate and send frame
            t = time.time() - start_time
            frame = animator.generate_frame(avatar_id, t, speaking=speaking)
            await ws.send_bytes(frame)

            await asyncio.sleep(1.0 / fps)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WS error: {e}")


@app.post("/preprocess/{avatar_id}")
async def preprocess_avatar(avatar_id: str):
    """Preprocess a new avatar"""
    if not animator:
        raise HTTPException(500, "Animator not initialized")

    path = AVATARS_DIR / f"{avatar_id}_nobg.png"
    if not path.exists():
        path = AVATARS_DIR / f"{avatar_id}.png"
    if not path.exists():
        raise HTTPException(404, f"Avatar image not found: {avatar_id}")

    try:
        result = animator.preprocess_source(str(path), avatar_id)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    uvicorn.run("amd_avatar_api:app", host="0.0.0.0", port=8002, reload=False)
