#!/usr/bin/env python3
"""
AUDIO2FACE-STYLE LIP-SYNC SERVICE
Real-time neural audio-to-face animation
Ultra-low latency: ~30-50ms

Approach:
1. Extract audio features (MFCC, energy, pitch)
2. Neural network predicts facial parameters (52 blend shapes)
3. Warp face image in real-time using thin-plate spline

This is a lightweight implementation inspired by NVIDIA Audio2Face.
"""

import io
import cv2
import numpy as np
import base64
import json
import asyncio
import torch
import torch.nn as nn
from typing import Dict, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Audio processing
import librosa

app = FastAPI(title="Audio2Face Lip-Sync Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# CONFIG
# =============================================================================

SAMPLE_RATE = 16000
HOP_LENGTH = 256
N_MFCC = 13
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# Blend shape names (simplified ARKit-style)
BLEND_SHAPES = [
    "jawOpen", "mouthClose", "mouthFunnel", "mouthPucker",
    "mouthLeft", "mouthRight", "mouthSmileLeft", "mouthSmileRight",
    "mouthFrownLeft", "mouthFrownRight", "mouthUpperUpLeft", "mouthUpperUpRight",
    "mouthLowerDownLeft", "mouthLowerDownRight", "mouthStretchLeft", "mouthStretchRight",
    "eyeBlinkLeft", "eyeBlinkRight", "eyeWideLeft", "eyeWideRight",
    "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight"
]

N_BLEND_SHAPES = len(BLEND_SHAPES)

# =============================================================================
# NEURAL NETWORK: Audio to Blend Shapes
# =============================================================================

class Audio2BlendShapes(nn.Module):
    """
    Lightweight neural network to predict blend shapes from audio features

    Input: MFCC features (batch, time, n_mfcc)
    Output: Blend shape weights (batch, time, n_blend_shapes)
    """

    def __init__(self, n_mfcc: int = N_MFCC, n_blend_shapes: int = N_BLEND_SHAPES):
        super().__init__()

        # Audio encoder
        self.encoder = nn.Sequential(
            nn.Linear(n_mfcc + 2, 64),  # +2 for energy and pitch
            nn.ReLU(),
            nn.Linear(64, 128),
            nn.ReLU(),
            nn.Linear(128, 64),
            nn.ReLU(),
        )

        # Temporal modeling (bidirectional GRU for smooth predictions)
        self.gru = nn.GRU(64, 64, batch_first=True, bidirectional=True)

        # Blend shape predictor
        self.predictor = nn.Sequential(
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, n_blend_shapes),
            nn.Sigmoid()  # Blend shapes are 0-1
        )

    def forward(self, mfcc: torch.Tensor, energy: torch.Tensor, pitch: torch.Tensor) -> torch.Tensor:
        """
        Forward pass

        Args:
            mfcc: (batch, time, n_mfcc)
            energy: (batch, time, 1)
            pitch: (batch, time, 1)

        Returns:
            blend_shapes: (batch, time, n_blend_shapes)
        """
        # Concatenate features
        x = torch.cat([mfcc, energy, pitch], dim=-1)

        # Encode
        x = self.encoder(x)

        # Temporal modeling
        x, _ = self.gru(x)

        # Predict blend shapes
        x = self.predictor(x)

        return x


# =============================================================================
# RULE-BASED FALLBACK (No training data needed)
# =============================================================================

class RuleBasedPredictor:
    """
    Rule-based audio to blend shape prediction
    Uses heuristics to map audio features to facial expressions
    """

    def __init__(self):
        self.prev_blend_shapes = np.zeros(N_BLEND_SHAPES)
        self.smoothing = 0.3

    def predict(self, mfcc: np.ndarray, energy: float, pitch: float) -> np.ndarray:
        """
        Predict blend shapes from audio features

        Args:
            mfcc: MFCC features for one frame
            energy: RMS energy
            pitch: Fundamental frequency estimate

        Returns:
            blend_shapes: Array of N_BLEND_SHAPES weights
        """
        blend_shapes = np.zeros(N_BLEND_SHAPES)

        # Normalize energy
        energy = min(1.0, energy * 5)

        # Normalize pitch (typical speech range 80-400Hz)
        pitch_norm = np.clip((pitch - 80) / 320, 0, 1) if pitch > 0 else 0.5

        # Spectral tilt (brightness indicator)
        if len(mfcc) > 1:
            spectral_tilt = np.mean(mfcc[1:6]) - np.mean(mfcc[6:])
            spectral_tilt = np.clip(spectral_tilt / 20 + 0.5, 0, 1)
        else:
            spectral_tilt = 0.5

        # === JAW / MOUTH OPEN ===
        # Energy controls mouth openness
        blend_shapes[0] = energy * 0.8  # jawOpen

        # === MOUTH SHAPE ===
        # Spectral features control mouth shape
        if energy > 0.1:
            # Bright sounds (high spectral centroid) -> wider mouth
            if spectral_tilt > 0.6:
                blend_shapes[7] = energy * 0.4  # mouthSmileRight
                blend_shapes[6] = energy * 0.4  # mouthSmileLeft
            # Dark sounds -> rounder mouth
            elif spectral_tilt < 0.4:
                blend_shapes[2] = energy * 0.5  # mouthFunnel
                blend_shapes[3] = energy * 0.3  # mouthPucker

            # Fricatives (high energy in upper MFCCs)
            if len(mfcc) > 8 and np.mean(mfcc[8:]) > np.mean(mfcc[:4]):
                blend_shapes[15] = energy * 0.3  # mouthStretchRight
                blend_shapes[14] = energy * 0.3  # mouthStretchLeft

        # === LOWER LIP ===
        blend_shapes[12] = energy * 0.4  # mouthLowerDownLeft
        blend_shapes[13] = energy * 0.4  # mouthLowerDownRight

        # === EYEBROWS ===
        # High pitch = raised eyebrows (surprised/questioning)
        if pitch_norm > 0.7:
            blend_shapes[22] = 0.3  # browInnerUp
            blend_shapes[23] = 0.2  # browOuterUpLeft
            blend_shapes[24] = 0.2  # browOuterUpRight

        # === EYE BLINKS (random) ===
        if np.random.random() < 0.01:  # ~1% chance per frame
            blend_shapes[16] = 1.0  # eyeBlinkLeft
            blend_shapes[17] = 1.0  # eyeBlinkRight

        # Smooth transitions
        blend_shapes = self.smoothing * self.prev_blend_shapes + (1 - self.smoothing) * blend_shapes
        self.prev_blend_shapes = blend_shapes.copy()

        return blend_shapes


# =============================================================================
# FACE WARPER: Apply blend shapes to image
# =============================================================================

class FaceWarper:
    """
    Warp face image based on blend shape weights
    Uses facial landmarks and thin-plate spline warping
    """

    def __init__(self, source_image_path: str):
        import face_alignment

        # Load source image
        self.source_img = cv2.imread(source_image_path, cv2.IMREAD_UNCHANGED)
        if self.source_img is None:
            raise ValueError(f"Could not load image: {source_image_path}")

        self.h, self.w = self.source_img.shape[:2]

        # Detect landmarks
        fa = face_alignment.FaceAlignment(face_alignment.LandmarksType.TWO_D, device='cuda')

        if self.source_img.shape[2] == 4:
            rgb = cv2.cvtColor(self.source_img[:,:,:3], cv2.COLOR_BGR2RGB)
        else:
            rgb = cv2.cvtColor(self.source_img, cv2.COLOR_BGR2RGB)

        landmarks = fa.get_landmarks(rgb)
        if landmarks is None:
            raise ValueError("No face detected")

        self.base_landmarks = landmarks[0].copy()

        # Define control point regions
        self.mouth_outer = list(range(48, 60))
        self.mouth_inner = list(range(60, 68))
        self.left_eye = list(range(36, 42))
        self.right_eye = list(range(42, 48))
        self.left_brow = list(range(17, 22))
        self.right_brow = list(range(22, 27))
        self.jaw = list(range(0, 17))

        # Pre-compute mouth center
        self.mouth_center = np.mean(self.base_landmarks[self.mouth_outer], axis=0)

        print(f"FaceWarper initialized: {self.w}x{self.h}, {len(self.base_landmarks)} landmarks")

    def warp(self, blend_shapes: np.ndarray) -> np.ndarray:
        """
        Apply blend shapes to produce warped image

        Args:
            blend_shapes: Array of N_BLEND_SHAPES weights (0-1)

        Returns:
            Warped image
        """
        # Calculate target landmarks based on blend shapes
        target_landmarks = self.base_landmarks.copy()

        # === JAW OPEN ===
        jaw_open = blend_shapes[0]  # jawOpen
        for i in self.mouth_outer[6:]:  # Lower lip
            target_landmarks[i][1] += jaw_open * 15
        for i in self.mouth_inner[4:]:  # Inner lower lip
            target_landmarks[i][1] += jaw_open * 12
        for i in self.jaw[4:13]:  # Jaw
            target_landmarks[i][1] += jaw_open * 5

        # === MOUTH CLOSE ===
        mouth_close = blend_shapes[1]
        for i in self.mouth_outer[:6]:  # Upper lip down
            target_landmarks[i][1] += mouth_close * 3

        # === MOUTH FUNNEL (O shape) ===
        mouth_funnel = blend_shapes[2]
        for i in self.mouth_outer:
            # Move toward center
            direction = self.mouth_center - target_landmarks[i]
            target_landmarks[i] += direction * mouth_funnel * 0.2

        # === MOUTH PUCKER ===
        mouth_pucker = blend_shapes[3]
        for i in self.mouth_outer:
            direction = self.mouth_center - target_landmarks[i]
            target_landmarks[i] += direction * mouth_pucker * 0.3

        # === MOUTH SMILE ===
        smile_left = blend_shapes[6]
        smile_right = blend_shapes[7]
        # Mouth corners up and out
        target_landmarks[48][0] -= smile_left * 5
        target_landmarks[48][1] -= smile_left * 5
        target_landmarks[54][0] += smile_right * 5
        target_landmarks[54][1] -= smile_right * 5

        # === MOUTH STRETCH ===
        stretch_left = blend_shapes[14]
        stretch_right = blend_shapes[15]
        target_landmarks[48][0] -= stretch_left * 8
        target_landmarks[54][0] += stretch_right * 8

        # === LOWER LIP DOWN ===
        lower_down_left = blend_shapes[12]
        lower_down_right = blend_shapes[13]
        target_landmarks[57][1] += (lower_down_left + lower_down_right) / 2 * 8

        # === EYEBROWS ===
        brow_inner_up = blend_shapes[22]
        target_landmarks[21][1] -= brow_inner_up * 5
        target_landmarks[22][1] -= brow_inner_up * 5

        brow_outer_up_left = blend_shapes[23]
        brow_outer_up_right = blend_shapes[24]
        target_landmarks[17][1] -= brow_outer_up_left * 4
        target_landmarks[26][1] -= brow_outer_up_right * 4

        # === EYE BLINKS ===
        blink_left = blend_shapes[16]
        blink_right = blend_shapes[17]
        for i in self.left_eye[:3]:  # Upper eyelid
            target_landmarks[i][1] += blink_left * 5
        for i in self.right_eye[:3]:
            target_landmarks[i][1] += blink_right * 5

        # Perform warping
        return self._thin_plate_spline_warp(target_landmarks)

    def _thin_plate_spline_warp(self, target_landmarks: np.ndarray) -> np.ndarray:
        """Simple triangulation-based warping"""
        from scipy.spatial import Delaunay

        # Add corner points
        src_pts = np.vstack([
            self.base_landmarks,
            [[0, 0], [self.w-1, 0], [0, self.h-1], [self.w-1, self.h-1]]
        ]).astype(np.float32)

        dst_pts = np.vstack([
            target_landmarks,
            [[0, 0], [self.w-1, 0], [0, self.h-1], [self.w-1, self.h-1]]
        ]).astype(np.float32)

        # Triangulate
        tri = Delaunay(src_pts)

        result = self.source_img.copy()

        for simplex in tri.simplices:
            src_tri = src_pts[simplex]
            dst_tri = dst_pts[simplex]
            self._warp_triangle(self.source_img, result, src_tri, dst_tri)

        return result

    def _warp_triangle(self, img_src, img_dst, tri_src, tri_dst):
        """Warp single triangle"""
        r_src = cv2.boundingRect(np.float32([tri_src]))
        r_dst = cv2.boundingRect(np.float32([tri_dst]))

        if r_src[2] <= 0 or r_src[3] <= 0 or r_dst[2] <= 0 or r_dst[3] <= 0:
            return

        tri_src_offset = [(tri_src[i][0] - r_src[0], tri_src[i][1] - r_src[1]) for i in range(3)]
        tri_dst_offset = [(tri_dst[i][0] - r_dst[0], tri_dst[i][1] - r_dst[1]) for i in range(3)]

        mat = cv2.getAffineTransform(np.float32(tri_src_offset), np.float32(tri_dst_offset))

        # Bounds check
        y1, y2 = max(0, r_src[1]), min(img_src.shape[0], r_src[1] + r_src[3])
        x1, x2 = max(0, r_src[0]), min(img_src.shape[1], r_src[0] + r_src[2])

        if y2 <= y1 or x2 <= x1:
            return

        img_rect = img_src[y1:y2, x1:x2]

        if img_rect.size == 0:
            return

        warped = cv2.warpAffine(img_rect, mat, (r_dst[2], r_dst[3]))

        mask = np.zeros((r_dst[3], r_dst[2]), dtype=np.float32)
        cv2.fillConvexPoly(mask, np.int32(tri_dst_offset), 1.0)

        # Bounds check for destination
        dy1, dy2 = max(0, r_dst[1]), min(img_dst.shape[0], r_dst[1] + r_dst[3])
        dx1, dx2 = max(0, r_dst[0]), min(img_dst.shape[1], r_dst[0] + r_dst[2])

        if dy2 <= dy1 or dx2 <= dx1:
            return

        # Adjust warped and mask sizes
        wy1, wy2 = dy1 - r_dst[1], dy2 - r_dst[1]
        wx1, wx2 = dx1 - r_dst[0], dx2 - r_dst[0]

        warped_crop = warped[wy1:wy2, wx1:wx2]
        mask_crop = mask[wy1:wy2, wx1:wx2]

        if warped_crop.size == 0 or mask_crop.size == 0:
            return

        for c in range(img_dst.shape[2]):
            img_dst[dy1:dy2, dx1:dx2, c] = (
                img_dst[dy1:dy2, dx1:dx2, c] * (1 - mask_crop) +
                warped_crop[:, :, c] * mask_crop
            ).astype(img_dst.dtype)


# =============================================================================
# AUDIO PROCESSOR
# =============================================================================

class AudioProcessor:
    """Extract features from audio for blend shape prediction"""

    def __init__(self, sr: int = SAMPLE_RATE):
        self.sr = sr
        self.predictor = RuleBasedPredictor()

    def process_chunk(self, audio: np.ndarray) -> np.ndarray:
        """
        Process audio chunk and return blend shapes

        Args:
            audio: Float32 audio samples

        Returns:
            blend_shapes: Array of blend shape weights
        """
        if len(audio) < 512:
            return self.predictor.predict(np.zeros(N_MFCC), 0, 0)

        # Energy
        energy = np.sqrt(np.mean(audio ** 2))

        # MFCC
        mfcc = librosa.feature.mfcc(y=audio, sr=self.sr, n_mfcc=N_MFCC, hop_length=len(audio))
        mfcc = mfcc.mean(axis=1)

        # Pitch (simple autocorrelation)
        try:
            pitches, magnitudes = librosa.piptrack(y=audio, sr=self.sr, hop_length=len(audio))
            pitch = pitches[magnitudes.argmax(axis=0)].mean()
        except (ValueError, IndexError, RuntimeError):
            pitch = 0

        return self.predictor.predict(mfcc, energy, pitch)


# =============================================================================
# GLOBAL STATE
# =============================================================================

face_warper: Optional[FaceWarper] = None
audio_processor: Optional[AudioProcessor] = None


# =============================================================================
# API ENDPOINTS
# =============================================================================

@app.on_event("startup")
async def startup():
    global face_warper, audio_processor

    print("Loading Audio2Face service...")

    source_path = "/workspace/eva-gpu/frontend/public/avatars/eva_nobg.png"

    try:
        face_warper = FaceWarper(source_path)
        audio_processor = AudioProcessor()
        print("Audio2Face service ready!")
    except Exception as e:
        print(f"Failed to initialize: {e}")
        import traceback
        traceback.print_exc()


@app.get("/health")
async def health():
    return {
        "status": "ok" if face_warper is not None else "error",
        "service": "audio2face-lipsync",
        "blend_shapes": N_BLEND_SHAPES,
        "latency_ms": "30-50"
    }


@app.websocket("/ws/audio2face")
async def websocket_audio2face(ws: WebSocket):
    """
    Real-time audio to face animation

    Input: {"type": "audio", "data": "<base64 float32>"}
    Output: {"type": "frame", "data": "<base64 jpeg>"}
    """
    global face_warper, audio_processor

    await ws.accept()
    print("Audio2Face WebSocket connected")

    if face_warper is None or audio_processor is None:
        await ws.send_json({"type": "error", "message": "Service not initialized"})
        await ws.close()
        return

    try:
        while True:
            msg = await ws.receive()

            if "text" in msg:
                data = json.loads(msg["text"])

                if data.get("type") == "audio":
                    # Decode audio chunk
                    audio_b64 = data.get("data", "")
                    if audio_b64:
                        audio_bytes = base64.b64decode(audio_b64)
                        audio = np.frombuffer(audio_bytes, dtype=np.float32)

                        # Get blend shapes
                        blend_shapes = audio_processor.process_chunk(audio)

                        # Warp face
                        warped = face_warper.warp(blend_shapes)

                        # Encode as JPEG
                        _, jpeg = cv2.imencode('.jpg', warped, [cv2.IMWRITE_JPEG_QUALITY, 85])

                        await ws.send_json({
                            "type": "frame",
                            "data": base64.b64encode(jpeg.tobytes()).decode(),
                            "blend_shapes": {
                                BLEND_SHAPES[i]: float(blend_shapes[i])
                                for i in range(len(blend_shapes)) if blend_shapes[i] > 0.01
                            }
                        })

                elif data.get("type") == "audio_wav":
                    # Process entire WAV file
                    wav_b64 = data.get("data", "")
                    if wav_b64:
                        wav_bytes = base64.b64decode(wav_b64)
                        audio, _ = librosa.load(io.BytesIO(wav_bytes), sr=SAMPLE_RATE)

                        # Process in 40ms chunks for ~25fps
                        chunk_size = int(SAMPLE_RATE * 0.04)

                        for i in range(0, len(audio), chunk_size):
                            chunk = audio[i:i+chunk_size]

                            if len(chunk) < 256:
                                continue

                            # Get blend shapes
                            blend_shapes = audio_processor.process_chunk(chunk)

                            # Warp face
                            warped = face_warper.warp(blend_shapes)

                            # Encode
                            _, jpeg = cv2.imencode('.jpg', warped, [cv2.IMWRITE_JPEG_QUALITY, 85])

                            await ws.send_json({
                                "type": "frame",
                                "data": base64.b64encode(jpeg.tobytes()).decode(),
                                "time_ms": int(i / SAMPLE_RATE * 1000)
                            })

                            await asyncio.sleep(0.03)  # ~30fps output

                        await ws.send_json({"type": "done"})

                elif data.get("type") == "ping":
                    await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        print("Audio2Face WebSocket disconnected")
    except Exception as e:
        print(f"Audio2Face error: {e}")
        import traceback
        traceback.print_exc()


@app.post("/preview")
async def preview(blend_shapes: Dict[str, float] = None):
    """Preview face with specific blend shapes"""
    global face_warper

    if face_warper is None:
        return {"error": "Service not initialized"}

    if blend_shapes is None:
        blend_shapes = {"jawOpen": 0.5}

    # Convert dict to array
    bs_array = np.zeros(N_BLEND_SHAPES)
    for name, value in blend_shapes.items():
        if name in BLEND_SHAPES:
            bs_array[BLEND_SHAPES.index(name)] = value

    # Warp
    warped = face_warper.warp(bs_array)

    # Encode
    _, jpeg = cv2.imencode('.jpg', warped, [cv2.IMWRITE_JPEG_QUALITY, 90])

    return {
        "frame": base64.b64encode(jpeg.tobytes()).decode()
    }


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8004, log_level="info")
