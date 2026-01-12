"""
Simple Avatar Animation API
Mouvements SUBTILS et HUMAINS - PAS de LivePortrait lourd
100% LOCAL - RAPIDE sur CPU
"""

import cv2
import numpy as np
import math
import time
import asyncio
import json
from pathlib import Path
from typing import Optional, Dict
from dataclasses import dataclass, field

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
import uvicorn

AVATARS_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "avatars"

@dataclass
class AnimState:
    """État d'animation par avatar"""
    last_blink: float = 0.0
    blink_progress: float = 0.0
    next_blink: float = 3.0
    breath_phase: float = 0.0


class SubtleAnimator:
    """
    Animation SUBTILE et HUMAINE
    - Micro-mouvements de tête (1-2 pixels max)
    - Clignement naturel des yeux
    - Respiration douce
    - PAS de rotation exagérée
    """

    def __init__(self):
        self.sources: Dict[str, dict] = {}
        self.states: Dict[str, AnimState] = {}
        print("SubtleAnimator initialized")

    def load_source(self, image_path: str, source_id: str, target_size: int = 400) -> dict:
        """Charge un avatar avec transparence, redimensionné pour performance"""
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Cannot load: {image_path}")

        has_alpha = img.shape[2] == 4 if len(img.shape) == 3 and img.shape[2] == 4 else False

        if has_alpha:
            bgra = img
        else:
            bgra = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
            bgra[:, :, 3] = 255

        # Redimensionner pour performance (garder ratio)
        h, w = bgra.shape[:2]
        if max(h, w) > target_size:
            scale = target_size / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            bgra = cv2.resize(bgra, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
            print(f"  Resized {source_id}: {w}x{h} -> {new_w}x{new_h}")

        self.sources[source_id] = {
            "bgra": bgra,
            "has_alpha": has_alpha,
            "shape": bgra.shape[:2],
            "path": image_path
        }
        self.states[source_id] = AnimState(last_blink=time.time())

        print(f"Loaded {source_id}: {bgra.shape}, alpha={has_alpha}")
        return {"source_id": source_id, "has_alpha": has_alpha, "shape": bgra.shape[:2]}

    def generate_frame(self, source_id: str, t: float) -> bytes:
        """Génère une frame avec animation SUBTILE"""
        if source_id not in self.sources:
            raise ValueError(f"Source {source_id} not found")

        source = self.sources[source_id]
        state = self.states[source_id]

        img = source["bgra"].copy()
        h, w = img.shape[:2]

        # ==========================================
        # MICRO-MOUVEMENTS SUBTILS (1-3 pixels max)
        # ==========================================

        # Mouvement horizontal très léger (respiration naturelle)
        dx = math.sin(t * 0.4) * 1.5 + math.sin(t * 0.7) * 0.5

        # Mouvement vertical (respiration)
        breath_cycle = 4.0  # 4 secondes par respiration
        breath = math.sin(t * 2 * math.pi / breath_cycle)
        dy = breath * 2  # Max 2 pixels haut/bas

        # Micro-rotation (très subtile, presque imperceptible)
        angle = math.sin(t * 0.3) * 0.3  # Max 0.3 degré

        # ==========================================
        # CLIGNEMENT DES YEUX
        # ==========================================
        current_time = time.time()
        time_since_blink = current_time - state.last_blink

        if time_since_blink > state.next_blink and state.blink_progress == 0:
            state.blink_progress = 1.0
            state.last_blink = current_time
            state.next_blink = 2.5 + np.random.random() * 4.0  # 2.5-6.5 sec

        if state.blink_progress > 0:
            state.blink_progress = max(0, state.blink_progress - 0.2)

        self.states[source_id] = state

        # ==========================================
        # APPLIQUER LES TRANSFORMATIONS
        # ==========================================

        # Matrice de transformation (rotation + translation)
        center = (w / 2, h / 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        M[0, 2] += dx
        M[1, 2] += dy

        # Appliquer avec bordure transparente
        result = cv2.warpAffine(
            img, M, (w, h),
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0, 0)  # Transparent
        )

        # ==========================================
        # EFFET DE CLIGNEMENT (assombrir légèrement les yeux)
        # ==========================================
        if state.blink_progress > 0.3:
            # Zone approximative des yeux (30% depuis le haut, 20% de hauteur)
            eye_y1 = int(h * 0.25)
            eye_y2 = int(h * 0.40)

            blink_factor = (state.blink_progress - 0.3) / 0.7  # 0 à 1

            # Assombrir légèrement la zone des yeux
            eye_region = result[eye_y1:eye_y2, :, :3].astype(np.float32)
            eye_region *= (1.0 - blink_factor * 0.15)  # Max 15% plus sombre
            result[eye_y1:eye_y2, :, :3] = eye_region.astype(np.uint8)

        # ==========================================
        # ENCODER EN WEBP (rapide + transparence + petit)
        # ==========================================
        _, buffer = cv2.imencode('.webp', result, [cv2.IMWRITE_WEBP_QUALITY, 85])
        return buffer.tobytes()


# ============================================================================
# FastAPI
# ============================================================================

app = FastAPI(title="Simple Avatar API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

animator: Optional[SubtleAnimator] = None


@app.on_event("startup")
async def startup():
    global animator
    animator = SubtleAnimator()

    # Charger les avatars avec fond transparent
    for name in ["eva", "luna", "emma", "adam", "alex"]:
        nobg_path = AVATARS_DIR / f"{name}_nobg.png"
        if nobg_path.exists():
            try:
                animator.load_source(str(nobg_path), name)
            except Exception as e:
                print(f"Error loading {name}: {e}")

    print(f"Loaded avatars: {list(animator.sources.keys())}")


@app.get("/health")
async def health():
    return {
        "status": "healthy" if animator else "error",
        "avatars": list(animator.sources.keys()) if animator else [],
        "type": "subtle_animation"
    }


@app.get("/frame/{avatar_id}")
async def get_frame(avatar_id: str):
    """Obtenir une frame animée"""
    if not animator or avatar_id not in animator.sources:
        raise HTTPException(404, f"Avatar {avatar_id} not found")

    frame = animator.generate_frame(avatar_id, time.time())
    return Response(content=frame, media_type="image/webp")


@app.get("/static/{avatar_id}")
async def get_static(avatar_id: str):
    """Obtenir l'image statique"""
    nobg_path = AVATARS_DIR / f"{avatar_id}_nobg.png"
    if nobg_path.exists():
        return FileResponse(nobg_path, media_type="image/png")
    raise HTTPException(404, f"Avatar {avatar_id} not found")


@app.websocket("/ws/{avatar_id}")
async def ws_animate(ws: WebSocket, avatar_id: str):
    """WebSocket pour streaming d'animation"""
    await ws.accept()

    if not animator or avatar_id not in animator.sources:
        await ws.close(1008, "Avatar not found")
        return

    fps = 30  # 30 FPS pour fluidité
    start_time = time.time()
    connected = True

    try:
        while connected:
            # Vérifier messages entrants (non-bloquant)
            try:
                data = await asyncio.wait_for(ws.receive(), timeout=0.001)
                if "text" in data:
                    msg = json.loads(data["text"])
                    if msg.get("type") == "stop":
                        break
                    elif msg.get("fps"):
                        fps = min(60, max(10, msg["fps"]))
                elif data.get("type") == "websocket.disconnect":
                    break
            except asyncio.TimeoutError:
                pass

            # Générer et envoyer frame
            try:
                t = time.time() - start_time
                frame = animator.generate_frame(avatar_id, t)
                await ws.send_bytes(frame)
            except Exception:
                break

            await asyncio.sleep(1.0 / fps)

    except WebSocketDisconnect:
        connected = False
    except Exception as e:
        print(f"WS error: {e}")
    finally:
        connected = False


if __name__ == "__main__":
    uvicorn.run("simple_avatar_api:app", host="0.0.0.0", port=8002, reload=False)
