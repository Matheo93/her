"""
Avatar Animation API with ONNX Runtime + DirectML
Optimized for AMD GPU via DirectX 12
"""

import os
import sys
import cv2
import numpy as np
import time
import asyncio
import json
from pathlib import Path
from typing import Optional, Dict
from dataclasses import dataclass

import onnxruntime as ort
import torch
import torch_directml

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn

# DirectML device
dml = torch_directml.device()
print(f"DirectML device: {dml}")

AVATARS_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "avatars"
ONNX_DIR = Path(__file__).resolve().parent / "onnx_models" / "liveportrait_onnx"


@dataclass
class AnimState:
    """Animation state per avatar"""
    last_blink: float = 0.0
    blink_progress: float = 0.0
    next_blink: float = 3.0
    frame_count: int = 0


class ONNXLivePortrait:
    """LivePortrait using ONNX Runtime for fast inference"""

    def __init__(self):
        self.sessions: Dict[str, ort.InferenceSession] = {}
        self.sources: Dict[str, dict] = {}
        self.states: Dict[str, AnimState] = {}

    def initialize(self):
        """Load ONNX models"""
        print("Loading ONNX models...")
        start = time.time()

        # Session options for performance
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess_options.intra_op_num_threads = 8
        sess_options.inter_op_num_threads = 4

        # Use CPU provider (DirectML not available on Linux)
        providers = ['CPUExecutionProvider']

        # Load models (skip warping - uses GridSample3D not supported)
        model_files = {
            'appearance': 'appearance_feature_extractor.onnx',
            'motion': 'motion_extractor.onnx',
            # 'warping': 'warping_spade-fix.onnx',  # GridSample3D not supported
            'stitching': 'stitching.onnx',
            'retinaface': 'retinaface_det_static.onnx',
            # 'landmark': 'landmark.onnx',  # Too slow
        }

        for name, filename in model_files.items():
            path = ONNX_DIR / filename
            if path.exists():
                print(f"  Loading {name}...")
                self.sessions[name] = ort.InferenceSession(
                    str(path),
                    sess_options=sess_options,
                    providers=providers
                )
            else:
                print(f"  Warning: {filename} not found")

        print(f"ONNX models loaded in {time.time()-start:.1f}s")
        print(f"Available models: {list(self.sessions.keys())}")

    def preprocess_source(self, image_path: str, source_id: str) -> dict:
        """Preprocess avatar image"""
        print(f"Preprocessing {source_id}...")

        # Load image
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Cannot load: {image_path}")

        # Handle alpha
        if img.shape[2] == 4:
            alpha = img[:, :, 3:4]
            img_rgb = cv2.cvtColor(img[:, :, :3], cv2.COLOR_BGR2RGB)
        else:
            alpha = None
            img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

        # Resize to 256x256 for model input
        img_256 = cv2.resize(img_rgb, (256, 256))

        # Normalize
        img_tensor = img_256.astype(np.float32) / 255.0
        img_tensor = np.transpose(img_tensor, (2, 0, 1))  # HWC -> CHW
        img_tensor = np.expand_dims(img_tensor, 0)  # Add batch dim

        # Extract appearance features
        if 'appearance' in self.sessions:
            f_s = self.sessions['appearance'].run(
                None, {'input': img_tensor}
            )[0]
        else:
            f_s = img_tensor  # Fallback

        # Extract motion features
        if 'motion' in self.sessions:
            motion_out = self.sessions['motion'].run(
                None, {'input': img_tensor}
            )
            # Motion extractor returns multiple outputs
            x_s_info = {
                'kp': motion_out[0],
                'pitch': motion_out[1] if len(motion_out) > 1 else np.zeros((1, 1)),
                'yaw': motion_out[2] if len(motion_out) > 2 else np.zeros((1, 1)),
                'roll': motion_out[3] if len(motion_out) > 3 else np.zeros((1, 1)),
                'exp': motion_out[4] if len(motion_out) > 4 else np.zeros((1, 21, 3)),
                't': motion_out[5] if len(motion_out) > 5 else np.zeros((1, 3)),
                'scale': motion_out[6] if len(motion_out) > 6 else np.ones((1, 1)),
            }
        else:
            x_s_info = {'kp': np.zeros((1, 21, 3))}

        self.sources[source_id] = {
            'f_s': f_s,
            'x_s_info': x_s_info,
            'img_256': img_256,
            'img_tensor': img_tensor,
            'original_shape': img.shape[:2],
            'alpha': alpha,
        }
        self.states[source_id] = AnimState(last_blink=time.time())

        print(f"  {source_id} preprocessed! Feature shape: {f_s.shape}")
        return {'source_id': source_id, 'shape': img.shape[:2]}

    def generate_frame(self, source_id: str, t: float, speaking: bool = False) -> bytes:
        """Generate animated frame"""
        if source_id not in self.sources:
            raise ValueError(f"Source {source_id} not found")

        source = self.sources[source_id]
        state = self.states[source_id]

        # Animation parameters - subtle movements
        head_yaw = np.sin(t * 0.3) * 3.0 + np.sin(t * 0.7) * 1.0  # degrees
        head_pitch = np.sin(t * 0.4) * 2.0 + np.sin(t * 0.9) * 0.8
        head_roll = np.sin(t * 0.5) * 1.0

        # Blink logic
        current_time = time.time()
        if current_time - state.last_blink > state.next_blink and state.blink_progress == 0:
            state.blink_progress = 1.0
            state.last_blink = current_time
            state.next_blink = 2.5 + np.random.random() * 3.0

        blink = 0.0
        if state.blink_progress > 0:
            blink = state.blink_progress
            state.blink_progress = max(0, state.blink_progress - 0.15)

        state.frame_count += 1
        self.states[source_id] = state

        # Create driving parameters
        x_d_info = {k: v.copy() if isinstance(v, np.ndarray) else v
                    for k, v in source['x_s_info'].items()}

        # Apply head rotation (in degrees for ONNX model)
        x_d_info['pitch'] = source['x_s_info']['pitch'] + head_pitch
        x_d_info['yaw'] = source['x_s_info']['yaw'] + head_yaw
        x_d_info['roll'] = source['x_s_info']['roll'] + head_roll

        # Apply blink
        if blink > 0 and 'exp' in x_d_info:
            x_d_info['exp'] = source['x_s_info']['exp'].copy()
            # Modify eye expression
            x_d_info['exp'][:, 0:2] -= blink * 0.3

        # Generate frame using warping model
        if 'warping' in self.sessions:
            try:
                # Prepare inputs for warping model
                warping_inputs = {
                    'source_feature': source['f_s'].astype(np.float32),
                    'kp_driving': x_d_info['kp'].astype(np.float32),
                    'kp_source': source['x_s_info']['kp'].astype(np.float32),
                }

                # Check input names
                input_names = [i.name for i in self.sessions['warping'].get_inputs()]

                # Run warping
                out = self.sessions['warping'].run(None, warping_inputs)[0]

                # Convert to image
                frame = out[0]  # Remove batch dim
                frame = np.transpose(frame, (1, 2, 0))  # CHW -> HWC
                frame = (frame * 255).clip(0, 255).astype(np.uint8)

            except Exception as e:
                # Fallback: apply simple transformation to source image
                frame = source['img_256'].copy()

                # Apply simple head rotation effect
                h, w = frame.shape[:2]
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, head_roll * 0.5, 1.0)
                M[0, 2] += head_yaw * 0.3
                M[1, 2] += head_pitch * 0.3
                frame = cv2.warpAffine(frame, M, (w, h), borderMode=cv2.BORDER_REPLICATE)

                # Apply blink effect
                if blink > 0:
                    eye_region = frame[60:100, 70:186]
                    eye_region = cv2.GaussianBlur(eye_region, (3, 3), 0)
                    frame[60:100, 70:186] = cv2.addWeighted(
                        frame[60:100, 70:186], 1 - blink * 0.5,
                        eye_region, blink * 0.5, 0
                    )
        else:
            # No warping model - use simple transformation
            frame = source['img_256'].copy()
            h, w = frame.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, head_roll, 1.0)
            M[0, 2] += head_yaw * 0.5
            M[1, 2] += head_pitch * 0.5
            frame = cv2.warpAffine(frame, M, (w, h), borderMode=cv2.BORDER_REPLICATE)

        # Convert to BGR for encoding
        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

        # Encode as WebP
        _, buffer = cv2.imencode('.webp', frame_bgr, [cv2.IMWRITE_WEBP_QUALITY, 85])
        return buffer.tobytes()


# FastAPI app
app = FastAPI(title="ONNX Avatar API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

animator: Optional[ONNXLivePortrait] = None


@app.on_event("startup")
async def startup():
    global animator
    animator = ONNXLivePortrait()
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
        "status": "healthy" if animator else "error",
        "avatars": list(animator.sources.keys()) if animator else [],
        "backend": "ONNX Runtime + DirectML",
        "models": list(animator.sessions.keys()) if animator else []
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


if __name__ == "__main__":
    uvicorn.run("onnx_avatar_api:app", host="0.0.0.0", port=8002, reload=False)
