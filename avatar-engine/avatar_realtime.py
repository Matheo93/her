"""
Avatar Realtime - Streaming lip-sync avec génération asynchrone
Génère les frames pendant que l'audio joue
"""

import os
import io
import cv2
import torch
import numpy as np
import asyncio
from typing import Optional, AsyncGenerator
from pathlib import Path
from time import time
from concurrent.futures import ThreadPoolExecutor
from queue import Queue
import threading

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
import uvicorn

# Audio processing
import audio
from models import Wav2Lip
from batch_face import RetinaFace

# ============================================================================
# Configuration
# ============================================================================

CHECKPOINT_PATH = Path(__file__).parent / "checkpoints" / "wav2lip_gan.pth"
FACE_DETECTION_PATH = Path(__file__).parent / "checkpoints" / "mobilenet.pth"
DEFAULT_AVATAR = Path(__file__).parent.parent / "frontend" / "public" / "avatars" / "eva.jpg"

# Optimize CPU threads
torch.set_num_threads(4)

# ============================================================================
# Optimized Wav2Lip Engine
# ============================================================================

class FastWav2LipEngine:
    """Optimized Wav2Lip for streaming"""

    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"FastWav2Lip using: {self.device}")

        self.model = self._load_model()
        self.face_detector = self._load_face_detector()
        self.face_cache = {}
        self.mel_step_size = 16
        self.img_size = 96

        # Thread pool for parallel processing
        self.executor = ThreadPoolExecutor(max_workers=2)

        print("FastWav2Lip ready!")

    def _load_model(self):
        model = Wav2Lip()
        checkpoint = torch.load(str(CHECKPOINT_PATH), map_location=self.device)
        state_dict = {k.replace('module.', ''): v for k, v in checkpoint["state_dict"].items()}
        model.load_state_dict(state_dict)
        model = model.to(self.device)
        model.eval()

        return model

    def _load_face_detector(self):
        return RetinaFace(
            gpu_id=0 if self.device == 'cuda' else -1,
            model_path=str(FACE_DETECTION_PATH),
            network="mobilenet"
        )

    def preprocess_avatar(self, image_path: str, avatar_id: str = "eva"):
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read: {image_path}")

        # Resize smaller for speed
        max_size = 480
        h, w = img.shape[:2]
        if max(h, w) > max_size:
            scale = max_size / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)))

        faces = self.face_detector([img])
        if not faces or not faces[0]:
            raise ValueError("No face detected")

        box = faces[0][0][0]
        x1, y1, x2, y2 = map(int, box)

        pad = 5
        y1, y2 = max(0, y1-pad), min(img.shape[0], y2+pad)
        x1, x2 = max(0, x1-pad), min(img.shape[1], x2+pad)

        face = cv2.resize(img[y1:y2, x1:x2], (self.img_size, self.img_size))

        self.face_cache[avatar_id] = {
            "face": face,
            "coords": (y1, y2, x1, x2),
            "frame": img.copy(),
            "size": (x2-x1, y2-y1)
        }

        return {"avatar_id": avatar_id, "ok": True}

    @torch.no_grad()
    def generate_frame_batch(self, mel_chunks: list, avatar_id: str) -> list:
        """Generate batch of frames from mel chunks"""
        if avatar_id not in self.face_cache:
            return []

        cache = self.face_cache[avatar_id]
        face = cache["face"]
        coords = cache["coords"]
        frame = cache["frame"]
        size = cache["size"]

        batch_size = len(mel_chunks)
        if batch_size == 0:
            return []

        # Prepare batch
        img_batch = np.array([face] * batch_size)
        mel_batch = np.array(mel_chunks)

        # Mask lower half
        img_masked = img_batch.copy()
        img_masked[:, self.img_size // 2:] = 0

        # Normalize
        img_batch = np.concatenate((img_masked, img_batch), axis=3) / 255.0
        mel_batch = mel_batch.reshape(batch_size, mel_batch.shape[1], mel_batch.shape[2], 1)

        # To tensors
        img_t = torch.FloatTensor(img_batch.transpose(0, 3, 1, 2)).to(self.device)
        mel_t = torch.FloatTensor(mel_batch.transpose(0, 3, 1, 2)).to(self.device)

        # Inference
        pred = self.model(mel_t, img_t)
        pred = pred.cpu().numpy().transpose(0, 2, 3, 1) * 255.0

        # Build output frames
        frames = []
        y1, y2, x1, x2 = coords
        for p in pred:
            out = frame.copy()
            # LANCZOS4 for high-quality upscaling (less pixelated)
            out[y1:y2, x1:x2] = cv2.resize(p.astype(np.uint8), size, interpolation=cv2.INTER_LANCZOS4)
            frames.append(out)

        return frames

    def audio_to_mel_chunks(self, audio_bytes: bytes, fps: float = 25) -> list:
        """Convert audio to mel chunks"""
        audio_data = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        mel = audio.melspectrogram(audio_data)

        chunks = []
        mel_idx_mult = 80.0 / fps
        i = 0
        while True:
            start = int(i * mel_idx_mult)
            if start + self.mel_step_size > len(mel[0]):
                chunks.append(mel[:, -self.mel_step_size:])
                break
            chunks.append(mel[:, start:start + self.mel_step_size])
            i += 1

        return chunks

    async def stream_frames(self, audio_bytes: bytes, avatar_id: str, fps: float = 25) -> AsyncGenerator[bytes, None]:
        """Stream frames as they're generated"""
        mel_chunks = self.audio_to_mel_chunks(audio_bytes, fps)

        if not mel_chunks:
            return

        # Process in small batches for lower latency
        batch_size = 4
        frame_interval = 1.0 / fps

        for i in range(0, len(mel_chunks), batch_size):
            batch = mel_chunks[i:i + batch_size]

            # Generate in thread pool
            loop = asyncio.get_event_loop()
            frames = await loop.run_in_executor(
                self.executor,
                self.generate_frame_batch,
                batch,
                avatar_id
            )

            # Yield each frame
            for frame in frames:
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
                yield buffer.tobytes()
                await asyncio.sleep(frame_interval * 0.5)  # Slight delay between frames


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(title="Avatar Realtime API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine: Optional[FastWav2LipEngine] = None

@app.on_event("startup")
async def startup():
    global engine
    print("Starting FastWav2Lip...")
    engine = FastWav2LipEngine()
    if DEFAULT_AVATAR.exists():
        engine.preprocess_avatar(str(DEFAULT_AVATAR), "eva")
        print("Avatar 'eva' ready")

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "device": engine.device if engine else "none",
        "avatars": list(engine.face_cache.keys()) if engine else []
    }

@app.get("/avatars")
async def list_avatars():
    return {"avatars": list(engine.face_cache.keys()) if engine else []}

@app.get("/frame/{avatar_id}")
async def get_static_frame(avatar_id: str = "eva"):
    """Get static frame (no lip-sync)"""
    if not engine or avatar_id not in engine.face_cache:
        raise HTTPException(404, "Avatar not found")

    frame = engine.face_cache[avatar_id]["frame"]
    _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])

    return StreamingResponse(
        io.BytesIO(buffer.tobytes()),
        media_type="image/jpeg"
    )

@app.post("/generate/{avatar_id}")
async def generate_video(avatar_id: str, audio_file: UploadFile = File(...)):
    """Generate lip-synced video stream"""
    if not engine or avatar_id not in engine.face_cache:
        raise HTTPException(404, "Avatar not found")

    audio_bytes = await audio_file.read()

    async def stream():
        async for frame in engine.stream_frames(audio_bytes, avatar_id):
            yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + frame + b'\r\n'

    return StreamingResponse(
        stream(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.websocket("/ws/lipsync")
async def websocket_lipsync(ws: WebSocket):
    """WebSocket for real-time lip-sync"""
    await ws.accept()

    if not engine:
        await ws.close(1011, "Engine not ready")
        return

    avatar_id = "eva"
    print(f"Lip-sync WS connected")

    try:
        while True:
            data = await ws.receive()

            if "text" in data:
                import json
                msg = json.loads(data["text"])
                if msg.get("type") == "config":
                    avatar_id = msg.get("avatar_id", "eva")
                    await ws.send_json({"type": "ok", "avatar_id": avatar_id})

            elif "bytes" in data:
                # Receive audio, stream back frames
                audio_bytes = data["bytes"]

                async for frame in engine.stream_frames(audio_bytes, avatar_id, fps=20):
                    await ws.send_bytes(frame)

                await ws.send_json({"type": "done"})

    except WebSocketDisconnect:
        print("Lip-sync WS disconnected")


if __name__ == "__main__":
    uvicorn.run("avatar_realtime:app", host="0.0.0.0", port=8001, reload=False)
