"""
Avatar Engine API - Real-time Wav2Lip lip-sync
100% Local - No external APIs
"""

import os
import io
import cv2
import math
import torch
import numpy as np
from typing import Optional
from pathlib import Path
from time import time
import asyncio
from concurrent.futures import ThreadPoolExecutor

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
AVATAR_DIR = Path(__file__).parent / "avatars"
AVATAR_DIR.mkdir(exist_ok=True)

# Default avatar
DEFAULT_AVATAR = Path(__file__).parent.parent / "frontend" / "public" / "avatars" / "eva.jpg"

# ============================================================================
# Wav2Lip Engine
# ============================================================================

class Wav2LipEngine:
    """Real-time Wav2Lip lip-sync engine"""

    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"Wav2Lip Engine using: {self.device}")

        if self.device == 'cuda':
            print(f"GPU: {torch.cuda.get_device_name(0)}")
            print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")

        # Load models
        self.model = self._load_wav2lip_model()
        self.face_detector = self._load_face_detector()

        # Cache
        self.face_cache = {}  # avatar_id -> (face_crop, coords, full_frame)

        # Mel parameters
        self.mel_step_size = 16
        self.img_size = 96

        print("Wav2Lip Engine ready!")

    def _load_wav2lip_model(self) -> torch.nn.Module:
        """Load Wav2Lip GAN model"""
        print(f"Loading Wav2Lip from {CHECKPOINT_PATH}...")

        model = Wav2Lip()

        if self.device == 'cuda':
            checkpoint = torch.load(str(CHECKPOINT_PATH))
        else:
            checkpoint = torch.load(str(CHECKPOINT_PATH), map_location='cpu')

        # Clean state dict
        state_dict = checkpoint["state_dict"]
        new_state_dict = {k.replace('module.', ''): v for k, v in state_dict.items()}
        model.load_state_dict(new_state_dict)

        model = model.to(self.device)
        model.eval()

        print("Wav2Lip model loaded!")
        return model

    def _load_face_detector(self) -> RetinaFace:
        """Load face detection model"""
        print(f"Loading face detector from {FACE_DETECTION_PATH}...")

        gpu_id = 0 if self.device == 'cuda' else -1
        detector = RetinaFace(
            gpu_id=gpu_id,
            model_path=str(FACE_DETECTION_PATH),
            network="mobilenet"
        )

        print("Face detector loaded!")
        return detector

    def preprocess_avatar(self, image_path: str, avatar_id: str = "default") -> dict:
        """Preprocess avatar image - detect face and cache"""

        # Read image
        img = cv2.imread(image_path)
        if img is None:
            raise ValueError(f"Cannot read image: {image_path}")

        # Resize to reasonable size
        max_size = 720
        h, w = img.shape[:2]
        if max(h, w) > max_size:
            scale = max_size / max(h, w)
            img = cv2.resize(img, (int(w * scale), int(h * scale)))

        # Detect face
        faces = self.face_detector([img])
        if not faces or not faces[0]:
            raise ValueError("No face detected in image")

        # Get first face
        box, landmarks, score = faces[0][0]
        x1, y1, x2, y2 = map(int, box)

        # Add padding
        pad = 10
        y1 = max(0, y1 - pad)
        y2 = min(img.shape[0], y2 + pad)
        x1 = max(0, x1 - pad)
        x2 = min(img.shape[1], x2 + pad)

        # Extract face
        face_crop = img[y1:y2, x1:x2]
        face_resized = cv2.resize(face_crop, (self.img_size, self.img_size))

        # Cache
        self.face_cache[avatar_id] = {
            "face_crop": face_resized,
            "coords": (y1, y2, x1, x2),
            "full_frame": img.copy(),
            "original_face_size": (x2 - x1, y2 - y1)
        }

        return {
            "avatar_id": avatar_id,
            "face_detected": True,
            "face_box": [x1, y1, x2, y2],
            "image_size": list(img.shape[:2])
        }

    def audio_to_mel(self, audio_bytes: bytes, sample_rate: int = 16000) -> np.ndarray:
        """Convert audio bytes to mel spectrogram"""

        # Convert bytes to numpy array
        audio_data = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32)

        # Normalize
        audio_data = audio_data / 32768.0

        # Generate mel spectrogram
        mel = audio.melspectrogram(audio_data)

        if np.isnan(mel.reshape(-1)).sum() > 0:
            raise ValueError("Mel contains NaN values")

        return mel

    def mel_to_chunks(self, mel: np.ndarray, fps: float = 25) -> list:
        """Split mel spectrogram into chunks for each frame"""

        mel_chunks = []
        mel_idx_multiplier = 80.0 / fps
        i = 0

        while True:
            start_idx = int(i * mel_idx_multiplier)
            if start_idx + self.mel_step_size > len(mel[0]):
                mel_chunks.append(mel[:, len(mel[0]) - self.mel_step_size:])
                break
            mel_chunks.append(mel[:, start_idx:start_idx + self.mel_step_size])
            i += 1

        return mel_chunks

    @torch.no_grad()
    def generate_frames(
        self,
        audio_bytes: bytes,
        avatar_id: str = "default",
        fps: float = 25,
        batch_size: int = 8
    ) -> list:
        """Generate lip-synced frames from audio"""

        if avatar_id not in self.face_cache:
            raise ValueError(f"Avatar {avatar_id} not preprocessed")

        cache = self.face_cache[avatar_id]
        face = cache["face_crop"]
        coords = cache["coords"]
        full_frame = cache["full_frame"]
        orig_size = cache["original_face_size"]

        # Convert audio to mel chunks
        mel = self.audio_to_mel(audio_bytes)
        mel_chunks = self.mel_to_chunks(mel, fps)

        if not mel_chunks:
            return []

        # Prepare batches
        frames = []

        for i in range(0, len(mel_chunks), batch_size):
            batch_mels = mel_chunks[i:i + batch_size]
            batch_size_actual = len(batch_mels)

            # Prepare image batch
            img_batch = np.array([face] * batch_size_actual)
            mel_batch = np.array(batch_mels)

            # Mask lower half of face
            img_masked = img_batch.copy()
            img_masked[:, self.img_size // 2:] = 0

            # Concatenate masked and original
            img_batch = np.concatenate((img_masked, img_batch), axis=3) / 255.0
            mel_batch = mel_batch.reshape(batch_size_actual, mel_batch.shape[1], mel_batch.shape[2], 1)

            # Convert to tensors
            img_tensor = torch.FloatTensor(img_batch.transpose(0, 3, 1, 2)).to(self.device)
            mel_tensor = torch.FloatTensor(mel_batch.transpose(0, 3, 1, 2)).to(self.device)

            # Inference
            pred = self.model(mel_tensor, img_tensor)

            # Convert predictions to frames
            pred = pred.cpu().numpy().transpose(0, 2, 3, 1) * 255.0

            for p in pred:
                # Resize prediction to original face size
                p_resized = cv2.resize(p.astype(np.uint8), orig_size)

                # Overlay on full frame
                output_frame = full_frame.copy()
                y1, y2, x1, x2 = coords
                output_frame[y1:y2, x1:x2] = p_resized

                frames.append(output_frame)

        return frames

    def frames_to_video_bytes(self, frames: list, fps: float = 25) -> bytes:
        """Convert frames to video bytes (MJPEG)"""

        output = io.BytesIO()

        for frame in frames:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
            output.write(buffer.tobytes())

        return output.getvalue()

    def generate_single_frame(self, audio_chunk: bytes, avatar_id: str = "default") -> bytes:
        """Generate single lip-synced frame for real-time streaming"""

        frames = self.generate_frames(audio_chunk, avatar_id, fps=25, batch_size=1)

        if not frames:
            # Return original frame
            if avatar_id in self.face_cache:
                frame = self.face_cache[avatar_id]["full_frame"]
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                return buffer.tobytes()
            return b""

        _, buffer = cv2.imencode('.jpg', frames[0], [cv2.IMWRITE_JPEG_QUALITY, 85])
        return buffer.tobytes()


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(title="Avatar Engine API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global engine instance
engine: Optional[Wav2LipEngine] = None
executor = ThreadPoolExecutor(max_workers=2)

@app.on_event("startup")
async def startup():
    """Initialize engine on startup"""
    global engine
    print("Initializing Avatar Engine...")
    engine = Wav2LipEngine()

    # Preprocess default avatar
    if DEFAULT_AVATAR.exists():
        try:
            engine.preprocess_avatar(str(DEFAULT_AVATAR), "eva")
            print(f"Default avatar 'eva' preprocessed")
        except Exception as e:
            print(f"Failed to preprocess default avatar: {e}")

@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "device": engine.device if engine else "not initialized",
        "avatars_loaded": list(engine.face_cache.keys()) if engine else []
    }

@app.post("/avatar/upload")
async def upload_avatar(
    file: UploadFile = File(...),
    avatar_id: str = "custom"
):
    """Upload and preprocess a new avatar image"""

    if not engine:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    # Save uploaded file
    avatar_path = AVATAR_DIR / f"{avatar_id}.jpg"
    content = await file.read()

    with open(avatar_path, "wb") as f:
        f.write(content)

    # Preprocess
    try:
        result = engine.preprocess_avatar(str(avatar_path), avatar_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/avatar/preprocess")
async def preprocess_avatar(avatar_id: str = "eva", image_path: str = None):
    """Preprocess an existing avatar image"""

    if not engine:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    if image_path is None:
        image_path = str(DEFAULT_AVATAR)

    try:
        result = engine.preprocess_avatar(image_path, avatar_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/generate")
async def generate_lipsync(
    audio: UploadFile = File(...),
    avatar_id: str = "eva",
    fps: float = 25
):
    """Generate lip-synced video from audio file"""

    if not engine:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    if avatar_id not in engine.face_cache:
        raise HTTPException(status_code=404, detail=f"Avatar {avatar_id} not found")

    # Read audio
    audio_bytes = await audio.read()

    # Generate frames
    try:
        loop = asyncio.get_event_loop()
        frames = await loop.run_in_executor(
            executor,
            engine.generate_frames,
            audio_bytes,
            avatar_id,
            fps,
            8
        )

        if not frames:
            raise HTTPException(status_code=400, detail="No frames generated")

        # Convert to MJPEG stream
        def generate():
            for frame in frames:
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')

        return StreamingResponse(
            generate(),
            media_type="multipart/x-mixed-replace; boundary=frame"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/avatar")
async def websocket_avatar(websocket: WebSocket):
    """WebSocket endpoint for real-time lip-sync streaming"""

    await websocket.accept()

    if not engine:
        await websocket.close(code=1011, reason="Engine not initialized")
        return

    avatar_id = "eva"

    try:
        while True:
            # Receive audio chunk (binary)
            data = await websocket.receive()

            if "bytes" in data:
                audio_chunk = data["bytes"]

                # Generate lip-synced frame
                loop = asyncio.get_event_loop()
                frame_bytes = await loop.run_in_executor(
                    executor,
                    engine.generate_single_frame,
                    audio_chunk,
                    avatar_id
                )

                # Send frame back
                await websocket.send_bytes(frame_bytes)

            elif "text" in data:
                msg = data["text"]
                import json
                parsed = json.loads(msg)

                if parsed.get("type") == "config":
                    avatar_id = parsed.get("avatar_id", "eva")
                    await websocket.send_json({"type": "config_ok", "avatar_id": avatar_id})

    except WebSocketDisconnect:
        print("Avatar WebSocket disconnected")
    except Exception as e:
        print(f"Avatar WebSocket error: {e}")
        await websocket.close(code=1011, reason=str(e))

@app.get("/avatars")
async def list_avatars():
    """List available avatars"""

    if not engine:
        return {"avatars": []}

    return {
        "avatars": [
            {"id": k, "preprocessed": True}
            for k in engine.face_cache.keys()
        ]
    }

# ============================================================================
# Main
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(
        "avatar_api:app",
        host="0.0.0.0",
        port=8001,
        reload=False,
        workers=1
    )
