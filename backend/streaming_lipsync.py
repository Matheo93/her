#!/usr/bin/env python3
"""
STREAMING LIP-SYNC SERVICE v2
Real-time frame-by-frame lip sync using MuseTalk
WebSocket streaming: audio in → frames out

OPTIMIZED: Batch=8 processing (~123ms for 8 frames = 15ms/frame effective)
RTX 4090: Can achieve 65+ FPS with batching

Target latency: ~150ms from audio to first frame
"""

import os
import sys
import io
import cv2
import math
import time
import torch
import asyncio
import numpy as np
import base64
import json
import pickle
from pathlib import Path
from typing import Optional, List, Tuple
from dataclasses import dataclass, field

# FastAPI
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

# Audio processing
import librosa
from transformers import WhisperModel, AutoFeatureExtractor

# MuseTalk
sys.path.insert(0, "/workspace/MuseTalk")
from musetalk.utils.utils import load_all_model
# Don't import preprocessing - avatar already preprocessed

# ============================================================================
# CONFIG
# ============================================================================

AVATAR_DIR = "/workspace/MuseTalk/results/avatars"
WHISPER_PATH = "/workspace/MuseTalk/models/whisper"

# Audio config
SAMPLE_RATE = 16000
AUDIO_FPS = 50  # Whisper internal

# Streaming config - OPTIMIZED
FPS = 25
BATCH_SIZE = 8  # Sweet spot on RTX 4090: 123ms for 8 frames
CHUNK_DURATION_MS = int(BATCH_SIZE * 1000 / FPS)  # 320ms
CHUNK_SAMPLES = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)  # 5120 samples

# Feature extraction
AUDIO_PADDING_LEFT = 2
AUDIO_PADDING_RIGHT = 2
AUDIO_FEATURE_LENGTH = 2 * (AUDIO_PADDING_LEFT + AUDIO_PADDING_RIGHT + 1)  # 10

print(f"""
╔══════════════════════════════════════════════════════════╗
║         STREAMING LIP-SYNC SERVICE v2                    ║
╠══════════════════════════════════════════════════════════╣
║  Batch Size: {BATCH_SIZE} frames                                    ║
║  Chunk Duration: {CHUNK_DURATION_MS}ms                                  ║
║  Target FPS: {FPS}                                          ║
║  Expected Latency: ~150ms                                ║
╚══════════════════════════════════════════════════════════╝
""")

# ============================================================================
# GLOBAL STATE
# ============================================================================

app = FastAPI(title="Streaming Lip-Sync v2")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
vae = None
unet = None
pe = None
whisper = None
feature_extractor = None
device = None
timesteps = None

# Avatar cache
avatars = {}


@dataclass
class AvatarData:
    """Pre-processed avatar for fast inference"""
    avatar_id: str
    frame: np.ndarray = None
    coord: List = field(default_factory=list)
    latent: torch.Tensor = None  # [1, 8, 32, 32]
    mask: np.ndarray = None
    mask_coords: List = field(default_factory=list)


# ============================================================================
# MODEL LOADING
# ============================================================================

def load_models():
    """Load all models into GPU memory"""
    global vae, unet, pe, whisper, feature_extractor, device, timesteps

    print("🚀 Loading models...")
    device = torch.device("cuda:0")

    # MuseTalk
    vae, unet, pe = load_all_model(
        unet_model_path="/workspace/MuseTalk/models/musetalk/pytorch_model.bin",
        vae_type="sd-vae",
        unet_config="/workspace/MuseTalk/models/musetalk/musetalk.json",
        device=device
    )

    timesteps = torch.tensor([0], device=device)

    # FP16
    pe = pe.half().to(device)
    vae.vae = vae.vae.half().to(device)
    unet.model = unet.model.half().to(device)

    # Whisper
    print("Loading Whisper...")
    feature_extractor = AutoFeatureExtractor.from_pretrained(WHISPER_PATH)
    whisper = WhisperModel.from_pretrained(WHISPER_PATH)
    whisper = whisper.to(device=device, dtype=torch.float16).eval()
    whisper.requires_grad_(False)

    # Warmup
    print("🔥 Warming up...")
    dummy_latent = torch.randn(BATCH_SIZE, 8, 32, 32).to(device).half()
    dummy_audio = torch.randn(BATCH_SIZE, 50, 384).to(device).half()
    for _ in range(3):
        with torch.no_grad():
            pred = unet.model(dummy_latent, timesteps, encoder_hidden_states=dummy_audio).sample
            _ = vae.decode_latents(pred)

    print("✅ Models loaded!")


def load_avatar(avatar_id: str) -> AvatarData:
    """Load pre-processed avatar"""
    global avatars

    if avatar_id in avatars:
        return avatars[avatar_id]

    base_path = f"{AVATAR_DIR}/{avatar_id}"
    latents_path = f"{base_path}/latents.pt"
    coords_path = f"{base_path}/coords.pkl"
    frame_path = f"{base_path}/full_imgs/00000000.png"
    mask_path = f"{base_path}/mask/00000000.png"
    mask_coords_path = f"{base_path}/mask_coords.pkl"

    if not os.path.exists(latents_path):
        raise FileNotFoundError(f"Avatar {avatar_id} not found")

    print(f"Loading avatar: {avatar_id}")

    avatar = AvatarData(avatar_id=avatar_id)
    avatar.latent = torch.load(latents_path)[0]  # [1, 8, 32, 32]

    with open(coords_path, 'rb') as f:
        avatar.coord = pickle.load(f)[0]

    avatar.frame = cv2.imread(frame_path)

    if os.path.exists(mask_path):
        avatar.mask = cv2.imread(mask_path)

    if os.path.exists(mask_coords_path):
        with open(mask_coords_path, 'rb') as f:
            avatar.mask_coords = pickle.load(f)[0]

    avatars[avatar_id] = avatar
    print(f"✅ Avatar {avatar_id} loaded")
    return avatar


# ============================================================================
# STREAMING PROCESSOR
# ============================================================================

class StreamingProcessor:
    """
    Real-time batch processing lip-sync

    Strategy:
    1. Buffer audio until we have BATCH_SIZE frames worth (320ms)
    2. Extract Whisper features for entire buffer
    3. Process BATCH_SIZE frames in one GPU call (~123ms)
    4. Return frames immediately
    """

    def __init__(self, avatar_id: str = "eva"):
        self.avatar = load_avatar(avatar_id)
        self.audio_buffer = np.array([], dtype=np.float32)
        self.frame_index = 0
        self.total_process_time = 0
        self.total_frames = 0

    def add_audio(self, audio: np.ndarray):
        """Add audio samples to buffer (float32, 16kHz)"""
        self.audio_buffer = np.concatenate([self.audio_buffer, audio.astype(np.float32)])

    def can_process(self) -> bool:
        """Check if we have enough audio for one batch"""
        return len(self.audio_buffer) >= CHUNK_SAMPLES

    def get_buffer_duration_ms(self) -> int:
        """Get current buffer duration in ms"""
        return int(len(self.audio_buffer) / SAMPLE_RATE * 1000)

    @torch.no_grad()
    def process_batch(self) -> List[Tuple[bytes, int]]:
        """
        Process one batch of frames
        Returns: List of (jpeg_bytes, frame_index) tuples
        """
        global vae, unet, pe, whisper, feature_extractor, device, timesteps

        if not self.can_process():
            return []

        # Extract chunk from buffer
        chunk_audio = self.audio_buffer[:CHUNK_SAMPLES].copy()
        self.audio_buffer = self.audio_buffer[CHUNK_SAMPLES:]

        start_time = time.time()

        # ============ 1. WHISPER FEATURES ============
        # Extract mel spectrogram
        audio_feature = feature_extractor(
            chunk_audio,
            return_tensors="pt",
            sampling_rate=SAMPLE_RATE
        ).input_features.to(device=device, dtype=torch.float16)

        # Whisper encoder
        hidden_states = whisper.encoder(audio_feature, output_hidden_states=True).hidden_states
        whisper_feat = torch.stack(hidden_states, dim=2)  # [1, T, layers, dim]

        # ============ 2. PREPARE AUDIO PROMPTS ============
        # Calculate frame positions in whisper features
        whisper_idx_mult = AUDIO_FPS / FPS  # 2.0

        # Pad whisper features
        pad_left = int(whisper_idx_mult * AUDIO_PADDING_LEFT)
        pad_right = int(whisper_idx_mult * AUDIO_PADDING_RIGHT * 3)
        whisper_padded = torch.cat([
            torch.zeros(1, pad_left, *whisper_feat.shape[2:], device=device, dtype=torch.float16),
            whisper_feat,
            torch.zeros(1, pad_right, *whisper_feat.shape[2:], device=device, dtype=torch.float16)
        ], dim=1)

        # Extract audio features for each frame
        audio_prompts = []
        for frame_idx in range(BATCH_SIZE):
            audio_idx = int(frame_idx * whisper_idx_mult)
            clip = whisper_padded[:, audio_idx:audio_idx + AUDIO_FEATURE_LENGTH]

            if clip.shape[1] < AUDIO_FEATURE_LENGTH:
                # Pad if needed
                pad = torch.zeros(1, AUDIO_FEATURE_LENGTH - clip.shape[1], *clip.shape[2:],
                                  device=device, dtype=torch.float16)
                clip = torch.cat([clip, pad], dim=1)

            # Reshape: [1, 10, 5, 384] -> [1, 50, 384]
            clip = clip.reshape(1, -1, clip.shape[-1])
            audio_prompts.append(clip)

        # Stack into batch: [BATCH_SIZE, 50, 384]
        audio_batch = torch.cat(audio_prompts, dim=0)

        # ============ 3. PE (Positional Encoding) ============
        audio_embedding = pe(audio_batch)

        # ============ 4. UNET (Batch) ============
        # Repeat latent for batch
        latent_batch = self.avatar.latent.repeat(BATCH_SIZE, 1, 1, 1).to(device=device, dtype=unet.model.dtype)

        pred_latents = unet.model(
            latent_batch,
            timesteps,
            encoder_hidden_states=audio_embedding
        ).sample

        # ============ 5. VAE DECODE ============
        pred_latents = pred_latents.to(device=device, dtype=vae.vae.dtype)
        recon_batch = vae.decode_latents(pred_latents)  # [B, H, W, C]

        process_time = (time.time() - start_time) * 1000

        # ============ 6. BLEND & ENCODE ============
        results = []
        x1, y1, x2, y2 = self.avatar.coord

        for i, recon_frame in enumerate(recon_batch):
            # Blend onto source
            output = self.avatar.frame.copy()
            face_resized = cv2.resize(
                recon_frame.astype(np.uint8),
                (x2 - x1, y2 - y1),
                interpolation=cv2.INTER_LINEAR
            )
            output[y1:y2, x1:x2] = face_resized

            # Encode JPEG
            _, jpeg = cv2.imencode('.jpg', output, [cv2.IMWRITE_JPEG_QUALITY, 85])
            results.append((jpeg.tobytes(), self.frame_index))
            self.frame_index += 1

        self.total_process_time += process_time
        self.total_frames += BATCH_SIZE

        avg_per_frame = self.total_process_time / self.total_frames
        print(f"Batch: {BATCH_SIZE} frames in {process_time:.0f}ms ({process_time/BATCH_SIZE:.0f}ms/frame, avg: {avg_per_frame:.0f}ms)")

        return results

    def flush(self) -> List[Tuple[bytes, int]]:
        """Process any remaining audio (may be less than full batch)"""
        results = []

        # Process full batches
        while self.can_process():
            results.extend(self.process_batch())

        # Handle remaining (< BATCH_SIZE frames)
        if len(self.audio_buffer) > 0:
            # Pad to full batch
            remaining_samples = len(self.audio_buffer)
            remaining_frames = int(remaining_samples / SAMPLE_RATE * FPS)

            if remaining_frames > 0:
                # Pad audio to full chunk
                pad_needed = CHUNK_SAMPLES - len(self.audio_buffer)
                self.audio_buffer = np.concatenate([
                    self.audio_buffer,
                    np.zeros(pad_needed, dtype=np.float32)
                ])

                batch_results = self.process_batch()
                # Only return the frames we actually have audio for
                results.extend(batch_results[:remaining_frames])

        return results

    def get_stats(self) -> dict:
        """Get processing statistics"""
        return {
            "total_frames": self.total_frames,
            "total_time_ms": self.total_process_time,
            "avg_per_frame_ms": self.total_process_time / max(1, self.total_frames),
            "effective_fps": 1000 * self.total_frames / max(1, self.total_process_time)
        }


# ============================================================================
# WEBSOCKET API
# ============================================================================

@app.on_event("startup")
async def startup():
    load_models()
    # Pre-load Eva
    try:
        load_avatar("eva")
    except Exception as e:
        print(f"Warning: Could not pre-load Eva: {e}")


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "streaming": True,
        "batch_size": BATCH_SIZE,
        "chunk_ms": CHUNK_DURATION_MS,
        "target_fps": FPS,
        "avatars": list(avatars.keys())
    }


@app.get("/avatars")
async def list_avatars():
    """List available avatars"""
    avatar_dirs = []
    for d in os.listdir(AVATAR_DIR):
        if os.path.exists(f"{AVATAR_DIR}/{d}/latents.pt"):
            avatar_dirs.append(d)
    return {"avatars": avatar_dirs}


@app.websocket("/ws/lipsync")
async def websocket_lipsync(ws: WebSocket):
    """
    WebSocket streaming lip-sync

    Input (JSON):
    - {"type": "config", "avatar": "eva"}
    - {"type": "audio", "data": "<base64 float32 array>"}
    - {"type": "audio_wav", "data": "<base64 wav file>"}
    - {"type": "end"}
    - {"type": "ping"}

    Output (JSON):
    - {"type": "frame", "data": "<base64 jpeg>", "index": N, "batch_ms": T}
    - {"type": "done", "stats": {...}}
    - {"type": "pong"}
    - {"type": "error", "message": "..."}
    """
    await ws.accept()
    print("🔌 WebSocket connected")

    processor = None
    avatar_id = "eva"

    try:
        while True:
            msg = await ws.receive()

            if "text" in msg:
                data = json.loads(msg["text"])
                msg_type = data.get("type", "")

                if msg_type == "config":
                    avatar_id = data.get("avatar", "eva")
                    processor = StreamingProcessor(avatar_id)
                    await ws.send_json({"type": "config_ok", "avatar": avatar_id})

                elif msg_type == "audio":
                    if processor is None:
                        processor = StreamingProcessor(avatar_id)

                    # Decode base64 float32 audio
                    audio_b64 = data.get("data", "")
                    if audio_b64:
                        audio_bytes = base64.b64decode(audio_b64)
                        audio = np.frombuffer(audio_bytes, dtype=np.float32)
                        processor.add_audio(audio)

                        # Process if we have enough
                        while processor.can_process():
                            frames = processor.process_batch()
                            for jpeg_bytes, idx in frames:
                                await ws.send_json({
                                    "type": "frame",
                                    "data": base64.b64encode(jpeg_bytes).decode(),
                                    "index": idx
                                })

                elif msg_type == "audio_wav":
                    if processor is None:
                        processor = StreamingProcessor(avatar_id)

                    # Decode WAV file
                    wav_b64 = data.get("data", "")
                    if wav_b64:
                        wav_bytes = base64.b64decode(wav_b64)
                        audio, _ = librosa.load(io.BytesIO(wav_bytes), sr=SAMPLE_RATE)
                        processor.add_audio(audio)

                        # Process all
                        while processor.can_process():
                            frames = processor.process_batch()
                            for jpeg_bytes, idx in frames:
                                await ws.send_json({
                                    "type": "frame",
                                    "data": base64.b64encode(jpeg_bytes).decode(),
                                    "index": idx
                                })

                elif msg_type == "end":
                    if processor:
                        # Flush remaining
                        frames = processor.flush()
                        for jpeg_bytes, idx in frames:
                            await ws.send_json({
                                "type": "frame",
                                "data": base64.b64encode(jpeg_bytes).decode(),
                                "index": idx
                            })

                        await ws.send_json({
                            "type": "done",
                            "stats": processor.get_stats()
                        })
                        processor = StreamingProcessor(avatar_id)  # Reset

                elif msg_type == "ping":
                    await ws.send_json({"type": "pong"})

            elif "bytes" in msg:
                # Raw bytes: assume float32 audio
                if processor is None:
                    processor = StreamingProcessor(avatar_id)

                audio = np.frombuffer(msg["bytes"], dtype=np.float32)
                processor.add_audio(audio)

                while processor.can_process():
                    frames = processor.process_batch()
                    for jpeg_bytes, idx in frames:
                        await ws.send_bytes(jpeg_bytes)

    except WebSocketDisconnect:
        print("🔌 WebSocket disconnected")
    except Exception as e:
        print(f"❌ WebSocket error: {e}")
        import traceback
        traceback.print_exc()
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except:
            pass


@app.post("/lipsync/test")
async def test_lipsync(avatar: str = "eva"):
    """Test endpoint with generated audio"""
    processor = StreamingProcessor(avatar)

    # Generate 1 second of test audio (16000 samples)
    test_audio = np.random.randn(16000).astype(np.float32) * 0.1
    processor.add_audio(test_audio)

    frames = []
    while processor.can_process():
        batch = processor.process_batch()
        frames.extend(batch)
    frames.extend(processor.flush())

    return {
        "frames_generated": len(frames),
        "stats": processor.get_stats(),
        "first_frame_b64": base64.b64encode(frames[0][0]).decode() if frames else None
    }


# ============================================================================
# IDLE ANIMATION
# ============================================================================

class IdleAnimator:
    """
    Generate subtle idle animations using synthetic audio embeddings
    Creates: micro head movements, subtle expression changes
    """

    def __init__(self, avatar_id: str = "eva"):
        self.avatar = load_avatar(avatar_id)
        self.time = 0.0
        self.blink_next = np.random.uniform(2, 5)  # Next blink in 2-5 seconds
        self.blink_state = 0.0

    @torch.no_grad()
    def generate_idle_frame(self) -> bytes:
        """Generate one idle frame with subtle movement"""
        global vae, unet, pe, device, timesteps

        # Time-based subtle variations
        t = self.time
        self.time += 1.0 / FPS

        # Generate synthetic audio embedding with subtle variations
        # Base embedding (silent) with small perturbations
        base_emb = torch.zeros(1, 50, 384, device=device, dtype=torch.float16)

        # Add subtle time-varying noise for micro-movements
        noise_scale = 0.02  # Very subtle
        noise = torch.randn_like(base_emb) * noise_scale

        # Add breathing pattern (slow sine wave)
        breath_freq = 0.25  # ~4 second cycle
        breath = math.sin(2 * math.pi * breath_freq * t) * 0.01
        noise += breath

        # Add head micro-movement pattern
        head_x = math.sin(2 * math.pi * 0.1 * t) * 0.005  # Slow side to side
        head_y = math.sin(2 * math.pi * 0.15 * t + 0.5) * 0.003  # Slow nod
        noise[:, :, :3] += head_x
        noise[:, :, 3:6] += head_y

        # Blink logic
        if t >= self.blink_next:
            self.blink_state = 1.0
            self.blink_next = t + np.random.uniform(2, 6)

        if self.blink_state > 0:
            # Quick close, slower open
            blink_noise = self.blink_state * 0.03
            noise[:, :, 10:20] += blink_noise
            self.blink_state = max(0, self.blink_state - 0.2)

        audio_emb = base_emb + noise

        # PE processing
        audio_embedding = pe(audio_emb)

        # UNet
        latent = self.avatar.latent.to(device=device, dtype=unet.model.dtype)
        pred_latent = unet.model(latent, timesteps, encoder_hidden_states=audio_embedding).sample

        # Decode
        pred_latent = pred_latent.to(device=device, dtype=vae.vae.dtype)
        recon = vae.decode_latents(pred_latent)

        # Blend
        x1, y1, x2, y2 = self.avatar.coord
        output = self.avatar.frame.copy()
        face_resized = cv2.resize(
            recon[0].astype(np.uint8),
            (x2 - x1, y2 - y1),
            interpolation=cv2.INTER_LINEAR
        )
        output[y1:y2, x1:x2] = face_resized

        # Encode
        _, jpeg = cv2.imencode('.jpg', output, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return jpeg.tobytes()


# Global idle animator
idle_animator: Optional[IdleAnimator] = None


@app.websocket("/ws/idle")
async def websocket_idle(ws: WebSocket):
    """
    WebSocket for streaming idle animation frames
    Sends frames continuously at target FPS
    """
    global idle_animator

    await ws.accept()
    print("🔌 Idle WebSocket connected")

    try:
        if idle_animator is None:
            idle_animator = IdleAnimator("eva")

        frame_interval = 1.0 / FPS
        last_frame_time = time.time()

        while True:
            # Check for stop message (non-blocking)
            try:
                msg = await asyncio.wait_for(ws.receive(), timeout=0.001)
                if "text" in msg:
                    data = json.loads(msg["text"])
                    if data.get("type") == "stop":
                        break
                    elif data.get("type") == "ping":
                        await ws.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                pass

            # Generate and send frame
            current_time = time.time()
            if current_time - last_frame_time >= frame_interval:
                frame = idle_animator.generate_idle_frame()
                await ws.send_bytes(frame)
                last_frame_time = current_time
            else:
                await asyncio.sleep(0.01)

    except WebSocketDisconnect:
        print("🔌 Idle WebSocket disconnected")
    except Exception as e:
        print(f"❌ Idle error: {e}")
        import traceback
        traceback.print_exc()


@app.get("/idle/frame")
async def get_idle_frame(avatar: str = "eva"):
    """Get a single idle frame"""
    global idle_animator

    if idle_animator is None or idle_animator.avatar.avatar_id != avatar:
        idle_animator = IdleAnimator(avatar)

    frame = idle_animator.generate_idle_frame()

    return JSONResponse(
        content={"frame": base64.b64encode(frame).decode()},
        headers={"Content-Type": "application/json"}
    )


# ============================================================================
# MAIN
# ============================================================================

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8002, log_level="info")
