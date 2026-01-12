"""
LivePortrait API - Real-time talking head animation
100% LOCAL - NO EXTERNAL APIs
Natural animations: head movements, eye blinks, breathing
"""

import os
import sys
import cv2
import numpy as np
import asyncio
from pathlib import Path
from typing import Optional
import json
import glob

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse, Response
import uvicorn

# Import our natural animation engine
from natural_animation import NaturalAnimator

# ============================================================================
# Configuration
# ============================================================================

AVATARS_DIR = Path(__file__).resolve().parent.parent / "frontend" / "public" / "avatars"

print(f"AVATARS_DIR: {AVATARS_DIR}")
print(f"AVATARS_DIR exists: {AVATARS_DIR.exists()}")

# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="LivePortrait API",
    version="2.1.0",
    description="100% LOCAL Avatar Animation - Natural movements, blinks, breathing"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

animator: Optional[NaturalAnimator] = None

def discover_avatars() -> list[str]:
    """Automatically discover all available avatars in the avatars directory"""
    avatars = set()
    
    if not AVATARS_DIR.exists():
        return []
    
    # Find all .jpg and .png files (excluding _nobg variants for naming)
    for ext in ["*.jpg", "*.jpeg", "*.png"]:
        for path in AVATARS_DIR.glob(ext):
            name = path.stem
            # Remove _nobg suffix to get base name
            if name.endswith("_nobg"):
                name = name[:-5]
            avatars.add(name)
    
    return sorted(list(avatars))

@app.on_event("startup")
async def startup():
    global animator
    try:
        animator = NaturalAnimator()
        print("Natural Animator initialized!")

        # Auto-discover and load all avatars
        avatar_names = discover_avatars()
        print(f"Discovered avatars: {avatar_names}")
        
        for avatar_name in avatar_names:
            nobg_path = AVATARS_DIR / f"{avatar_name}_nobg.png"
            jpg_path = AVATARS_DIR / f"{avatar_name}.jpg"
            jpeg_path = AVATARS_DIR / f"{avatar_name}.jpeg"
            png_path = AVATARS_DIR / f"{avatar_name}.png"

            # Priority: nobg PNG > JPG > JPEG > PNG
            if nobg_path.exists():
                result = animator.load_source(str(nobg_path), avatar_name)
                print(f"Loaded {avatar_name} (nobg): {result}")
            elif jpg_path.exists():
                result = animator.load_source(str(jpg_path), avatar_name)
                print(f"Loaded {avatar_name} (jpg): {result}")
            elif jpeg_path.exists():
                result = animator.load_source(str(jpeg_path), avatar_name)
                print(f"Loaded {avatar_name} (jpeg): {result}")
            elif png_path.exists():
                result = animator.load_source(str(png_path), avatar_name)
                print(f"Loaded {avatar_name} (png): {result}")

        print(f"All avatars loaded! Total: {len(animator.source_images)}")
    except Exception as e:
        print(f"Startup error: {e}")
        import traceback
        traceback.print_exc()
        animator = None

@app.get("/")
async def root():
    return {
        "service": "LivePortrait API",
        "version": "2.1.0",
        "local": True,
        "description": "100% LOCAL - Natural head movements, eye blinks, breathing"
    }

@app.get("/health")
async def health():
    return {
        "status": "healthy" if animator else "degraded",
        "sources": list(animator.source_images.keys()) if animator else [],
        "local": True,
        "features": ["breathing", "head_movement", "eye_blinks", "micro_expressions"]
    }

@app.get("/avatars")
async def list_avatars():
    """List available avatars with gender hints"""
    avatars = []
    
    # Gender mapping based on avatar names
    GENDER_MAP = {
        "eva": "female",
        "luna": "female", 
        "emma": "female",
        "adam": "male",
        "alex": "male",
        "max": "male",
        "leo": "male",
        "noah": "male",
        "lucas": "male",
    }
    
    if animator:
        for source_id, data in animator.source_images.items():
            gender = GENDER_MAP.get(source_id.lower(), "unknown")
            avatars.append({
                "id": source_id,
                "name": source_id.title(),
                "gender": gender,
                "has_alpha": data["has_alpha"],
                "url": f"/avatar/{source_id}"
            })
    return {"avatars": avatars}

@app.get("/avatar/{source_id}")
async def get_avatar(source_id: str):
    """Get static avatar image"""
    nobg_path = AVATARS_DIR / f"{source_id}_nobg.png"
    jpg_path = AVATARS_DIR / f"{source_id}.jpg"
    jpeg_path = AVATARS_DIR / f"{source_id}.jpeg"
    png_path = AVATARS_DIR / f"{source_id}.png"

    if nobg_path.exists():
        return FileResponse(nobg_path, media_type="image/png")
    elif jpg_path.exists():
        return FileResponse(jpg_path, media_type="image/jpeg")
    elif jpeg_path.exists():
        return FileResponse(jpeg_path, media_type="image/jpeg")
    elif png_path.exists():
        return FileResponse(png_path, media_type="image/png")
    else:
        raise HTTPException(404, f"Avatar '{source_id}' not found")

@app.get("/frame/{source_id}")
async def get_animated_frame(source_id: str):
    """Get a single animated frame"""
    if not animator or source_id not in animator.source_images:
        raise HTTPException(404, "Source not found")

    import time
    frame = animator.generate_frame(source_id, time.time())
    media_type = "image/png" if animator.source_images[source_id]["has_alpha"] else "image/jpeg"
    return Response(content=frame, media_type=media_type)

@app.get("/stream/{source_id}")
async def stream_animation(source_id: str, fps: int = 25):
    """Stream animated frames as multipart response"""
    if not animator or source_id not in animator.source_images:
        raise HTTPException(404, "Source not found")

    def generate():
        import time
        start = time.time()
        frame_interval = 1.0 / fps

        while True:
            t = time.time() - start
            frame = animator.generate_frame(source_id, t)

            yield b'--frame\r\n'
            content_type = b'Content-Type: image/png\r\n\r\n' if animator.source_images[source_id]["has_alpha"] else b'Content-Type: image/jpeg\r\n\r\n'
            yield content_type
            yield frame
            yield b'\r\n'

            # Limit to prevent infinite streaming
            if t > 60:  # 60 seconds max
                break

            time.sleep(frame_interval)

    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

@app.post("/avatar/reload")
async def reload_avatars():
    """Reload all avatars (useful after adding new ones)"""
    global animator
    
    if not animator:
        raise HTTPException(500, "Animator not initialized")
    
    # Clear existing
    animator.source_images.clear()
    
    # Reload all
    avatar_names = discover_avatars()
    loaded = []
    
    for avatar_name in avatar_names:
        nobg_path = AVATARS_DIR / f"{avatar_name}_nobg.png"
        jpg_path = AVATARS_DIR / f"{avatar_name}.jpg"
        jpeg_path = AVATARS_DIR / f"{avatar_name}.jpeg"
        png_path = AVATARS_DIR / f"{avatar_name}.png"

        path = None
        if nobg_path.exists():
            path = nobg_path
        elif jpg_path.exists():
            path = jpg_path
        elif jpeg_path.exists():
            path = jpeg_path
        elif png_path.exists():
            path = png_path
            
        if path:
            result = animator.load_source(str(path), avatar_name)
            loaded.append({"name": avatar_name, "result": result})
    
    return {"message": "Avatars reloaded", "loaded": loaded}

@app.websocket("/ws/animate")
async def websocket_animate(ws: WebSocket):
    """WebSocket for real-time animation streaming"""
    await ws.accept()

    if not animator:
        await ws.close(1011, "Animator not ready")
        return

    source_id = "eva"
    fps = 25
    is_streaming = False

    print(f"WebSocket connected")

    try:
        while True:
            # Check for incoming messages (non-blocking)
            try:
                data = await asyncio.wait_for(ws.receive(), timeout=0.01)

                if "text" in data:
                    msg = json.loads(data["text"])

                    if msg.get("type") == "config":
                        source_id = msg.get("source_id", "eva")
                        fps = msg.get("fps", 25)
                        await ws.send_json({
                            "type": "config_ok",
                            "source_id": source_id,
                            "fps": fps,
                            "has_alpha": animator.source_images.get(source_id, {}).get("has_alpha", False)
                        })

                    elif msg.get("type") == "start":
                        is_streaming = True
                        await ws.send_json({"type": "started"})

                    elif msg.get("type") == "stop":
                        is_streaming = False
                        await ws.send_json({"type": "stopped"})

                    elif msg.get("type") == "frame":
                        # Send single frame on demand
                        import time
                        frame = animator.generate_frame(source_id, time.time())
                        await ws.send_bytes(frame)

            except asyncio.TimeoutError:
                pass

            # Stream frames if streaming is active
            if is_streaming and source_id in animator.source_images:
                import time
                frame = animator.generate_frame(source_id, time.time())
                await ws.send_bytes(frame)
                await asyncio.sleep(1.0 / fps)

    except WebSocketDisconnect:
        print("WebSocket disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8002, reload=False)
