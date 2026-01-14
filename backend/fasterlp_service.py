"""
FasterLivePortrait Service - Real-time portrait animation
Uses ONNX models from FasterLivePortrait
"""

import sys
import os
sys.path.insert(0, '/workspace/FasterLivePortrait')

import asyncio
import base64
import io
import json
import logging
import tempfile
import time
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="FasterLivePortrait Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global pipeline instance
flp_pipeline = None
joyvasa_pipeline = None
source_prepared = False
source_info = None

def initialize_pipeline():
    """Initialize FasterLivePortrait pipeline with ONNX config"""
    global flp_pipeline

    if flp_pipeline is not None:
        return True

    try:
        from omegaconf import OmegaConf
        from src.pipelines.faster_live_portrait_pipeline import FasterLivePortraitPipeline

        cfg_file = "/workspace/FasterLivePortrait/configs/onnx_infer.yaml"
        checkpoints_dir = "/workspace/FasterLivePortrait/checkpoints"

        infer_cfg = OmegaConf.load(cfg_file)

        # Update checkpoint paths
        for name in infer_cfg.models:
            if not isinstance(infer_cfg.models[name].model_path, str):
                for i in range(len(infer_cfg.models[name].model_path)):
                    infer_cfg.models[name].model_path[i] = infer_cfg.models[name].model_path[i].replace(
                        "./checkpoints", checkpoints_dir
                    )
            else:
                infer_cfg.models[name].model_path = infer_cfg.models[name].model_path.replace(
                    "./checkpoints", checkpoints_dir
                )

        for name in infer_cfg.animal_models:
            if not isinstance(infer_cfg.animal_models[name].model_path, str):
                for i in range(len(infer_cfg.animal_models[name].model_path)):
                    infer_cfg.animal_models[name].model_path[i] = infer_cfg.animal_models[name].model_path[i].replace(
                        "./checkpoints", checkpoints_dir
                    )
            else:
                infer_cfg.animal_models[name].model_path = infer_cfg.animal_models[name].model_path.replace(
                    "./checkpoints", checkpoints_dir
                )

        infer_cfg.infer_params.flag_pasteback = True
        flp_pipeline = FasterLivePortraitPipeline(cfg=infer_cfg, is_animal=False)
        logger.info("FasterLivePortrait pipeline initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize FasterLivePortrait pipeline: {e}")
        import traceback
        traceback.print_exc()
        return False

def initialize_joyvasa():
    """Initialize JoyVASA audio-to-motion pipeline"""
    global joyvasa_pipeline

    if joyvasa_pipeline is not None:
        return True

    try:
        from src.pipelines.joyvasa_audio_to_motion_pipeline import JoyVASAAudio2MotionPipeline

        checkpoints_dir = "/workspace/FasterLivePortrait/checkpoints"
        motion_model_path = os.path.join(checkpoints_dir, "JoyVASA/motion_generator/motion_generator_hubert_chinese.pt")
        audio_model_path = os.path.join(checkpoints_dir, "chinese-hubert-base")
        motion_template_path = os.path.join(checkpoints_dir, "JoyVASA/motion_template/motion_template.pkl")

        if not os.path.exists(motion_model_path):
            logger.warning(f"JoyVASA motion model not found at {motion_model_path}")
            return False

        joyvasa_pipeline = JoyVASAAudio2MotionPipeline(
            motion_model_path=motion_model_path,
            audio_model_path=audio_model_path,
            motion_template_path=motion_template_path
        )
        logger.info("JoyVASA pipeline initialized successfully")
        return True
    except Exception as e:
        logger.error(f"Failed to initialize JoyVASA pipeline: {e}")
        import traceback
        traceback.print_exc()
        return False

@app.on_event("startup")
async def startup():
    """Initialize pipelines on startup"""
    logger.info("Starting FasterLivePortrait service...")
    if not initialize_pipeline():
        logger.warning("FasterLivePortrait pipeline not initialized - will retry on first request")
    initialize_joyvasa()

@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "ok",
        "pipeline_ready": flp_pipeline is not None,
        "joyvasa_ready": joyvasa_pipeline is not None
    }

@app.post("/prepare_source")
async def prepare_source(
    source_image: UploadFile = File(...),
):
    """Prepare source image for animation"""
    global source_prepared, source_info

    if flp_pipeline is None:
        if not initialize_pipeline():
            return JSONResponse(
                status_code=500,
                content={"error": "FasterLivePortrait pipeline not initialized"}
            )

    try:
        # Save uploaded image
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            content = await source_image.read()
            tmp.write(content)
            source_path = tmp.name

        logger.info(f"Preparing source image from {source_path}")

        # Prepare source for LivePortrait
        ret = flp_pipeline.prepare_source(source_path, realtime=True)
        if not ret:
            return JSONResponse(
                status_code=400,
                content={"error": "No face detected in source image"}
            )

        source_prepared = True
        source_info = source_path
        os.unlink(source_path)

        return {"status": "ok", "message": "Source image prepared"}
    except Exception as e:
        logger.error(f"Error preparing source: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )

@app.post("/animate_with_audio")
async def animate_with_audio(
    audio: UploadFile = File(...),
    source_image: Optional[UploadFile] = File(None),
):
    """Generate animated video from audio using JoyVASA + LivePortrait"""
    global source_prepared

    if flp_pipeline is None:
        if not initialize_pipeline():
            return JSONResponse(
                status_code=500,
                content={"error": "FasterLivePortrait pipeline not initialized"}
            )

    if joyvasa_pipeline is None:
        return JSONResponse(
            status_code=500,
            content={"error": "JoyVASA pipeline not initialized. Please download JoyVASA models."}
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
                source_path = tmp.name

            ret = flp_pipeline.prepare_source(source_path, realtime=False)
            if not ret:
                os.unlink(source_path)
                return JSONResponse(
                    status_code=400,
                    content={"error": "No face detected in source image"}
                )
            os.unlink(source_path)
            source_prepared = True

        if not source_prepared:
            return JSONResponse(
                status_code=400,
                content={"error": "No source image prepared"}
            )

        # Generate motion from audio using JoyVASA
        logger.info("Generating motion from audio...")
        motion_data = joyvasa_pipeline.gen_motion_sequence(audio_path)

        # Animate frames
        logger.info(f"Animating {motion_data['n_frames']} frames...")
        h, w = flp_pipeline.src_imgs[0].shape[:2]
        fps = motion_data['output_fps']

        # Create video writer
        output_path = tempfile.mktemp(suffix=".mp4")
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        vout = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

        motion_lst = motion_data['motion']
        c_eyes_lst = motion_data.get('c_eyes_lst', [])
        c_lip_lst = motion_data.get('c_lip_lst', [])

        for frame_ind in range(len(motion_lst)):
            first_frame = frame_ind == 0
            dri_motion_info = [
                motion_lst[frame_ind],
                c_eyes_lst[frame_ind] if c_eyes_lst else None,
                c_lip_lst[frame_ind] if c_lip_lst else None
            ]

            out_crop, out_org = flp_pipeline.run_with_pkl(
                dri_motion_info,
                flp_pipeline.src_imgs[0],
                flp_pipeline.src_infos[0],
                first_frame=first_frame
            )

            if out_org is not None:
                out_org = cv2.cvtColor(out_org, cv2.COLOR_RGB2BGR)
                vout.write(out_org)

        vout.release()

        # Add audio to video
        final_output = tempfile.mktemp(suffix=".mp4")
        cmd = f'ffmpeg -loglevel error -y -i "{output_path}" -i "{audio_path}" -map 0:v -map 1:a -c:v libx264 -c:a aac -pix_fmt yuv420p "{final_output}"'
        os.system(cmd)

        # Read and return video
        with open(final_output, 'rb') as f:
            video_data = f.read()

        # Cleanup
        os.unlink(audio_path)
        os.unlink(output_path)
        os.unlink(final_output)

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

@app.post("/animate_with_video")
async def animate_with_video(
    driving_video: UploadFile = File(...),
    source_image: Optional[UploadFile] = File(None),
):
    """Generate animated video using driving video"""
    global source_prepared

    if flp_pipeline is None:
        if not initialize_pipeline():
            return JSONResponse(
                status_code=500,
                content={"error": "FasterLivePortrait pipeline not initialized"}
            )

    try:
        # Save driving video
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            video_content = await driving_video.read()
            tmp.write(video_content)
            video_path = tmp.name

        # Use provided source image or existing one
        if source_image is not None:
            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                content = await source_image.read()
                tmp.write(content)
                source_path = tmp.name

            ret = flp_pipeline.prepare_source(source_path, realtime=False)
            if not ret:
                os.unlink(source_path)
                return JSONResponse(
                    status_code=400,
                    content={"error": "No face detected in source image"}
                )
            os.unlink(source_path)
            source_prepared = True

        if not source_prepared:
            return JSONResponse(
                status_code=400,
                content={"error": "No source image prepared"}
            )

        # Process driving video
        vcap = cv2.VideoCapture(video_path)
        fps = int(vcap.get(cv2.CAP_PROP_FPS))
        h, w = flp_pipeline.src_imgs[0].shape[:2]

        output_path = tempfile.mktemp(suffix=".mp4")
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        vout = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

        frame_ind = 0
        while vcap.isOpened():
            ret, frame = vcap.read()
            if not ret:
                break

            first_frame = frame_ind == 0
            dri_crop, out_crop, out_org, dri_motion_info = flp_pipeline.run(
                frame,
                flp_pipeline.src_imgs[0],
                flp_pipeline.src_infos[0],
                first_frame=first_frame
            )
            frame_ind += 1

            if out_org is not None:
                out_org = cv2.cvtColor(out_org, cv2.COLOR_RGB2BGR)
                vout.write(out_org)

        vcap.release()
        vout.release()

        # Add audio from original video
        final_output = tempfile.mktemp(suffix=".mp4")
        cmd = f'ffmpeg -loglevel error -y -i "{output_path}" -i "{video_path}" -map 0:v -map 1:a? -c:v libx264 -c:a aac -pix_fmt yuv420p -shortest "{final_output}"'
        os.system(cmd)

        # Read and return video
        with open(final_output, 'rb') as f:
            video_data = f.read()

        # Cleanup
        os.unlink(video_path)
        os.unlink(output_path)
        os.unlink(final_output)

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

@app.websocket("/ws/realtime")
async def websocket_realtime(websocket: WebSocket):
    """WebSocket for real-time frame-by-frame animation"""
    await websocket.accept()
    logger.info("WebSocket connection established")

    if flp_pipeline is None:
        if not initialize_pipeline():
            await websocket.send_json({"error": "Pipeline not initialized"})
            await websocket.close()
            return

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "frame":
                # Receive driving frame and animate
                frame_b64 = data.get("frame")
                if frame_b64 and source_prepared:
                    frame_bytes = base64.b64decode(frame_b64)
                    frame_arr = np.frombuffer(frame_bytes, dtype=np.uint8)
                    frame = cv2.imdecode(frame_arr, cv2.IMREAD_COLOR)

                    if frame is not None:
                        first_frame = data.get("first_frame", False)
                        dri_crop, out_crop, out_org, _ = flp_pipeline.run(
                            frame,
                            flp_pipeline.src_imgs[0],
                            flp_pipeline.src_infos[0],
                            first_frame=first_frame
                        )

                        if out_org is not None:
                            _, buffer = cv2.imencode('.jpg', cv2.cvtColor(out_org, cv2.COLOR_RGB2BGR))
                            out_b64 = base64.b64encode(buffer).decode('utf-8')
                            await websocket.send_json({
                                "type": "frame",
                                "frame": out_b64
                            })

            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8006)
