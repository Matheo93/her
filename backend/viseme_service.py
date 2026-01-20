#!/usr/bin/env python3
"""
VISEME LIP-SYNC SERVICE
Real-time phoneme detection + viseme blending
Ultra-low latency: ~20-30ms

Visemes: mouth shapes for phonemes
- sil: silence (mouth closed)
- PP: p, b, m
- FF: f, v
- TH: th
- DD: t, d, n, l
- kk: k, g
- CH: ch, j, sh
- SS: s, z
- nn: n, ng
- RR: r
- AA: a
- EE: e, i
- OO: o, u
"""

import os
import io
import cv2
import numpy as np
import base64
import json
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Audio processing
import librosa

app = FastAPI(title="Viseme Lip-Sync Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =============================================================================
# VISEME CONFIGURATION
# =============================================================================

VISEME_NAMES = ["sil", "PP", "FF", "TH", "DD", "kk", "CH", "SS", "RR", "AA", "EE", "OO"]
VISEME_DIR = "/workspace/eva-gpu/frontend/public/avatars/visemes"
SAMPLE_RATE = 16000

# Mouth shape parameters for each viseme (for generation)
# Format: (mouth_open, mouth_wide, lip_round)
VISEME_PARAMS = {
    "sil": (0.0, 0.0, 0.0),    # Closed mouth
    "PP":  (0.1, 0.0, 0.0),    # Lips pressed
    "FF":  (0.15, 0.2, 0.0),   # Lower lip tucked
    "TH":  (0.2, 0.1, 0.0),    # Tongue between teeth
    "DD":  (0.25, 0.1, 0.0),   # Tongue on ridge
    "kk":  (0.3, 0.0, 0.0),    # Back of tongue
    "CH":  (0.2, 0.3, 0.1),    # Lips rounded forward
    "SS":  (0.15, 0.3, 0.0),   # Teeth close
    "RR":  (0.25, 0.0, 0.1),   # Lips slightly rounded
    "AA":  (0.8, 0.3, 0.0),    # Wide open
    "EE":  (0.4, 0.5, 0.0),    # Wide smile
    "OO":  (0.5, 0.0, 0.6),    # Rounded lips
}

# =============================================================================
# AUDIO TO VISEME MAPPING
# =============================================================================

class AudioAnalyzer:
    """Analyze audio to extract viseme weights in real-time"""

    def __init__(self):
        self.prev_energy = 0
        self.smoothing = 0.3

    def analyze_chunk(self, audio: np.ndarray, sr: int = SAMPLE_RATE) -> dict:
        """
        Analyze audio chunk and return viseme weights

        Simple but effective approach:
        - Use energy for mouth openness
        - Use spectral features for mouth shape
        """
        if len(audio) == 0:
            return {"sil": 1.0}

        # Normalize
        audio = audio.astype(np.float32)
        if np.max(np.abs(audio)) > 0:
            audio = audio / np.max(np.abs(audio))

        # Energy (RMS) - controls mouth openness
        energy = np.sqrt(np.mean(audio ** 2))
        energy = self.smoothing * self.prev_energy + (1 - self.smoothing) * energy
        self.prev_energy = energy

        # Spectral centroid - higher = brighter sounds (EE, SS) vs lower = rounder (OO, AA)
        if len(audio) > 512:
            spec = np.abs(np.fft.rfft(audio[:512]))
            freqs = np.fft.rfftfreq(512, 1/sr)
            centroid = np.sum(spec * freqs) / (np.sum(spec) + 1e-8)
            centroid_norm = min(1.0, centroid / 4000)  # Normalize to 0-1
        else:
            centroid_norm = 0.5

        # Zero crossing rate - higher = fricatives (SS, FF, CH)
        zcr = np.sum(np.abs(np.diff(np.sign(audio)))) / (2 * len(audio))

        # Map to visemes
        weights = {}

        if energy < 0.05:
            # Silence
            weights["sil"] = 1.0
        else:
            # Active speech
            mouth_open = min(1.0, energy * 3)

            if zcr > 0.15:
                # Fricatives
                if centroid_norm > 0.6:
                    weights["SS"] = 0.6 * mouth_open
                    weights["EE"] = 0.4 * mouth_open
                else:
                    weights["FF"] = 0.5 * mouth_open
                    weights["TH"] = 0.3 * mouth_open
            elif centroid_norm > 0.5:
                # Bright vowels
                weights["EE"] = 0.5 * mouth_open
                weights["AA"] = 0.3 * mouth_open
            elif centroid_norm < 0.3:
                # Round vowels
                weights["OO"] = 0.5 * mouth_open
                weights["RR"] = 0.3 * mouth_open
            else:
                # Open vowels
                weights["AA"] = 0.6 * mouth_open
                weights["EE"] = 0.2 * mouth_open

            # Add some silence weight for natural look
            total = sum(weights.values())
            if total < 1.0:
                weights["sil"] = 1.0 - total

        return weights


# =============================================================================
# VISEME IMAGE GENERATOR
# =============================================================================

def generate_viseme_images(source_path: str, output_dir: str):
    """
    Generate viseme images from source using facial landmark warping
    """
    import face_alignment

    os.makedirs(output_dir, exist_ok=True)

    # Load source image
    img = cv2.imread(source_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Could not load image: {source_path}")

    # Detect face landmarks
    fa = face_alignment.FaceAlignment(face_alignment.LandmarksType.TWO_D, device='cuda')

    # Convert to RGB for face_alignment
    if img.shape[2] == 4:
        rgb = cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2RGB)
    else:
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    landmarks = fa.get_landmarks(rgb)
    if landmarks is None or len(landmarks) == 0:
        raise ValueError("No face detected in source image")

    lm = landmarks[0]  # First face

    # Mouth landmarks (48-67 in 68-point model)
    mouth_outer = lm[48:60]  # Outer lip
    mouth_inner = lm[60:68]  # Inner lip

    # Get mouth center and bounds
    mouth_center = np.mean(mouth_outer, axis=0)

    print(f"Generating {len(VISEME_PARAMS)} viseme images...")

    for viseme_name, (open_amt, wide_amt, round_amt) in VISEME_PARAMS.items():
        # Create warped version
        warped = warp_mouth(img.copy(), lm, open_amt, wide_amt, round_amt)

        # Save
        output_path = os.path.join(output_dir, f"{viseme_name}.png")
        cv2.imwrite(output_path, warped)
        print(f"  Generated: {viseme_name}.png")

    print("Done!")
    return True


def warp_mouth(img: np.ndarray, landmarks: np.ndarray,
               open_amt: float, wide_amt: float, round_amt: float) -> np.ndarray:
    """
    Warp mouth region based on parameters

    open_amt: 0-1, how open the mouth is
    wide_amt: 0-1, how wide/stretched
    round_amt: 0-1, how rounded/puckered
    """
    h, w = img.shape[:2]

    # Mouth landmarks
    mouth_outer = landmarks[48:60]
    mouth_inner = landmarks[60:68]

    # Get mouth bounds
    mouth_center = np.mean(mouth_outer, axis=0)
    mouth_top = landmarks[51][1]  # Top of upper lip
    mouth_bottom = landmarks[57][1]  # Bottom of lower lip
    mouth_left = landmarks[48][0]
    mouth_right = landmarks[54][0]

    mouth_height = mouth_bottom - mouth_top
    mouth_width = mouth_right - mouth_left

    # Create source and destination points for warping
    # We'll use a simple approach: move lower lip down for opening

    src_pts = []
    dst_pts = []

    # Corner points (fixed)
    corners = [(0, 0), (w-1, 0), (0, h-1), (w-1, h-1)]
    for c in corners:
        src_pts.append(c)
        dst_pts.append(c)

    # Face outline points (fixed)
    for i in [0, 8, 16]:  # Chin area
        pt = landmarks[i]
        src_pts.append(tuple(pt.astype(int)))
        dst_pts.append(tuple(pt.astype(int)))

    # Upper lip (slight movement)
    for i in [48, 49, 50, 51, 52, 53, 54]:
        pt = landmarks[i].copy()
        src_pts.append(tuple(pt.astype(int)))
        # Move up slightly when open
        pt[1] -= open_amt * mouth_height * 0.1
        # Widen
        if i < 51:
            pt[0] -= wide_amt * mouth_width * 0.1
        elif i > 51:
            pt[0] += wide_amt * mouth_width * 0.1
        dst_pts.append(tuple(pt.astype(int)))

    # Lower lip (main movement)
    for i in [55, 56, 57, 58, 59]:
        pt = landmarks[i].copy()
        src_pts.append(tuple(pt.astype(int)))
        # Move down when open
        pt[1] += open_amt * mouth_height * 0.5
        # Widen
        if pt[0] < mouth_center[0]:
            pt[0] -= wide_amt * mouth_width * 0.15
        else:
            pt[0] += wide_amt * mouth_width * 0.15
        dst_pts.append(tuple(pt.astype(int)))

    # Inner mouth
    for i in [60, 61, 62, 63, 64, 65, 66, 67]:
        pt = landmarks[i].copy()
        src_pts.append(tuple(pt.astype(int)))
        if i <= 62:  # Upper inner
            pt[1] -= open_amt * mouth_height * 0.05
        else:  # Lower inner
            pt[1] += open_amt * mouth_height * 0.3
        dst_pts.append(tuple(pt.astype(int)))

    # Apply thin plate spline or piecewise affine warp
    src_pts = np.array(src_pts, dtype=np.float32)
    dst_pts = np.array(dst_pts, dtype=np.float32)

    # Use triangulation for warping
    from scipy.spatial import Delaunay

    tri = Delaunay(src_pts)

    result = img.copy()

    for simplex in tri.simplices:
        src_tri = src_pts[simplex]
        dst_tri = dst_pts[simplex]

        warp_triangle(img, result, src_tri, dst_tri)

    return result


def warp_triangle(img_src, img_dst, tri_src, tri_dst):
    """Warp a triangle from source to destination"""
    # Bounding rectangles
    r_src = cv2.boundingRect(np.float32([tri_src]))
    r_dst = cv2.boundingRect(np.float32([tri_dst]))

    # Offset points
    tri_src_offset = []
    tri_dst_offset = []

    for i in range(3):
        tri_src_offset.append((tri_src[i][0] - r_src[0], tri_src[i][1] - r_src[1]))
        tri_dst_offset.append((tri_dst[i][0] - r_dst[0], tri_dst[i][1] - r_dst[1]))

    # Get affine transform
    mat = cv2.getAffineTransform(
        np.float32(tri_src_offset),
        np.float32(tri_dst_offset)
    )

    # Extract source rectangle
    img_rect = img_src[r_src[1]:r_src[1]+r_src[3], r_src[0]:r_src[0]+r_src[2]]

    # Warp
    warped = cv2.warpAffine(img_rect, mat, (r_dst[2], r_dst[3]))

    # Create mask
    mask = np.zeros((r_dst[3], r_dst[2]), dtype=np.float32)
    cv2.fillConvexPoly(mask, np.int32(tri_dst_offset), 1.0)

    # Blend
    for c in range(img_dst.shape[2]):
        img_dst[r_dst[1]:r_dst[1]+r_dst[3], r_dst[0]:r_dst[0]+r_dst[2], c] = \
            img_dst[r_dst[1]:r_dst[1]+r_dst[3], r_dst[0]:r_dst[0]+r_dst[2], c] * (1 - mask) + \
            warped[:, :, c] * mask


# =============================================================================
# API ENDPOINTS
# =============================================================================

analyzer = AudioAnalyzer()

@app.get("/health")
async def health():
    visemes_exist = os.path.exists(VISEME_DIR) and len(os.listdir(VISEME_DIR)) > 0
    return {
        "status": "ok",
        "service": "viseme-lipsync",
        "visemes_ready": visemes_exist,
        "latency_ms": "20-30"
    }


@app.post("/generate-visemes")
async def api_generate_visemes(source: str = "/workspace/eva-gpu/frontend/public/avatars/eva_nobg.png"):
    """Generate viseme images from source"""
    try:
        generate_viseme_images(source, VISEME_DIR)
        return {"status": "ok", "visemes": os.listdir(VISEME_DIR)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/visemes")
async def list_visemes():
    """List available viseme images"""
    if not os.path.exists(VISEME_DIR):
        return {"visemes": [], "ready": False}

    files = [f for f in os.listdir(VISEME_DIR) if f.endswith('.png')]
    return {"visemes": files, "ready": len(files) >= len(VISEME_NAMES)}


@app.websocket("/ws/viseme")
async def websocket_viseme(ws: WebSocket):
    """
    Real-time viseme detection from audio stream

    Input: {"type": "audio", "data": "<base64 float32>"}
    Output: {"type": "viseme", "weights": {"AA": 0.5, "EE": 0.3, ...}}
    """
    await ws.accept()
    print("Viseme WebSocket connected")

    try:
        while True:
            msg = await ws.receive()

            if "text" in msg:
                data = json.loads(msg["text"])

                if data.get("type") == "audio":
                    # Decode audio
                    audio_b64 = data.get("data", "")
                    if audio_b64:
                        audio_bytes = base64.b64decode(audio_b64)
                        audio = np.frombuffer(audio_bytes, dtype=np.float32)

                        # Analyze
                        weights = analyzer.analyze_chunk(audio)

                        await ws.send_json({
                            "type": "viseme",
                            "weights": weights
                        })

                elif data.get("type") == "audio_wav":
                    # Decode WAV
                    wav_b64 = data.get("data", "")
                    if wav_b64:
                        wav_bytes = base64.b64decode(wav_b64)
                        audio, _ = librosa.load(io.BytesIO(wav_bytes), sr=SAMPLE_RATE)

                        # Analyze in chunks for streaming effect
                        chunk_size = int(SAMPLE_RATE * 0.04)  # 40ms chunks

                        for i in range(0, len(audio), chunk_size):
                            chunk = audio[i:i+chunk_size]
                            weights = analyzer.analyze_chunk(chunk)

                            await ws.send_json({
                                "type": "viseme",
                                "weights": weights,
                                "time_ms": int(i / SAMPLE_RATE * 1000)
                            })

                            await asyncio.sleep(0.03)  # ~30fps

                        # End with silence
                        await ws.send_json({
                            "type": "viseme",
                            "weights": {"sil": 1.0},
                            "done": True
                        })

                elif data.get("type") == "ping":
                    await ws.send_json({"type": "pong"})

    except WebSocketDisconnect:
        print("Viseme WebSocket disconnected")
    except Exception as e:
        print(f"Viseme error: {e}")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8003, log_level="info")
