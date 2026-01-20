"""
Ditto Talking Head Service - Real-time audio-driven lip-sync
Uses PyTorch models from ditto-talkinghead
"""
# noqa: E402 - sys.path must be modified before other imports
import sys
import os

sys.path.insert(0, '/workspace/ditto-talkinghead')

import base64  # noqa: E402
import io  # noqa: E402
import logging  # noqa: E402
import tempfile  # noqa: E402
from typing import Optional  # noqa: E402

import numpy as np  # noqa: E402
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse, StreamingResponse  # noqa: E402
import uvicorn  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Ditto Talking Head Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global SDK instance
ditto_sdk = None
source_image_prepared = False
current_source_path = None

def initialize_ditto():
    """Initialize ditto SDK with PyTorch config"""
    global ditto_sdk

    if ditto_sdk is not None:
        return True

    try:
        from stream_pipeline_offline import StreamSDK

        data_root = "/workspace/ditto-talkinghead/checkpoints/ditto_pytorch"
        cfg_pkl = "/workspace/ditto-talkinghead/checkpoints/ditto_cfg/v0.4_hubert_cfg_pytorch.pkl"

        logger.info(f"Loading Ditto SDK from {data_root}")
        ditto_sdk = StreamSDK(cfg_pkl, data_root)
        logger.info("Ditto SDK initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize Ditto SDK: {e}")
        import traceback
        traceback.print_exc()
        return False

@app.on_event("startup")
async def startup():
    """Initialize SDK on startup"""
    logger.info("Starting Ditto service...")
    if not initialize_ditto():
        logger.warning("Ditto SDK not initialized - will retry on first request")

@app.get("/health")
async def health():
    """Health check"""
    return {"status": "ok", "sdk_ready": ditto_sdk is not None}

@app.post("/prepare_source")
async def prepare_source(
    source_image: UploadFile = File(...),
):
    """Prepare source image for animation"""
    global source_image_prepared, current_source_path

    if ditto_sdk is None:
        if not initialize_ditto():
            return JSONResponse(
                status_code=500,
                content={"error": "Ditto SDK not initialized"}
            )

    try:
        # Save uploaded image
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            content = await source_image.read()
            tmp.write(content)
            current_source_path = tmp.name

        logger.info(f"Source image saved to {current_source_path}")
        source_image_prepared = True

        return {"status": "ok", "message": "Source image prepared"}
    except Exception as e:
        logger.error(f"Error preparing source: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/generate")
async def generate_video(
    audio: UploadFile = File(...),
    source_image: Optional[UploadFile] = File(None),
):
    """Generate talking head video from audio"""
    global current_source_path

    if ditto_sdk is None:
        if not initialize_ditto():
            return JSONResponse(
                status_code=500,
                content={"error": "Ditto SDK not initialized"}
            )

    try:
        # Save audio to temp file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            audio_content = await audio.read()
            tmp.write(audio_content)
            audio_path = tmp.name

        # Use provided source image or existing one
        if source_image is not None:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                content = await source_image.read()
                tmp.write(content)
                current_source_path = tmp.name

        if current_source_path is None:
            return JSONResponse(
                status_code=400,
                content={"error": "No source image provided"}
            )

        # Generate video
        output_path = tempfile.mktemp(suffix=".mp4")

        import librosa
        import math

        # Setup SDK
        ditto_sdk.setup(current_source_path, output_path)

        # Load and process audio
        audio_data, sr = librosa.core.load(audio_path, sr=16000)
        num_f = math.ceil(len(audio_data) / 16000 * 25)

        ditto_sdk.setup_Nd(N_d=num_f)

        # Process audio
        aud_feat = ditto_sdk.wav2feat.wav2feat(audio_data)
        ditto_sdk.audio2motion_queue.put(aud_feat)
        ditto_sdk.close()

        # Add audio to video
        tmp_output = ditto_sdk.tmp_output_path
        cmd = f'ffmpeg -loglevel error -y -i "{tmp_output}" -i "{audio_path}" -map 0:v -map 1:a -c:v copy -c:a aac "{output_path}"'
        os.system(cmd)

        # Read and return video
        with open(output_path, 'rb') as f:
            video_data = f.read()

        # Cleanup
        os.unlink(audio_path)
        os.unlink(output_path)
        if os.path.exists(tmp_output):
            os.unlink(tmp_output)

        return StreamingResponse(
            io.BytesIO(video_data),
            media_type="video/mp4"
        )

    except Exception as e:
        logger.error(f"Error generating video: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """WebSocket for real-time streaming (frames as base64)"""
    await websocket.accept()
    logger.info("WebSocket connection established")

    if ditto_sdk is None:
        if not initialize_ditto():
            await websocket.send_json({"error": "Ditto SDK not initialized"})
            await websocket.close()
            return

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "audio_chunk":
                # Process audio chunk and return frame
                audio_b64 = data.get("audio")
                if audio_b64:
                    audio_bytes = base64.b64decode(audio_b64)
                    audio_array = np.frombuffer(audio_bytes, dtype=np.float32)

                    # TODO: Implement real-time streaming with ditto
                    # For now, send placeholder response
                    await websocket.send_json({
                        "type": "frame",
                        "status": "processing"
                    })

            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8005)
