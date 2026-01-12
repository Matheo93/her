"""
Natural Animation Engine - 100% LOCAL
Real natural movements: head rotation, eye blinks, breathing, micro-movements
No external APIs - Pure OpenCV + NumPy
"""

import cv2
import numpy as np
import math
import time
from pathlib import Path
from typing import Optional, Generator
import asyncio

class NaturalAnimator:
    """
    Creates natural-looking animations from a static image.
    Simulates: breathing, head micro-movements, eye blinks, subtle expressions
    """

    def __init__(self):
        self.source_images = {}
        self.blink_state = {}
        self.breath_phase = {}
        self.last_blink_time = {}

    def load_source(self, image_path: str, source_id: str = "default") -> dict:
        """Load a source image with alpha channel support"""
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Cannot load image: {image_path}")

        has_alpha = len(img.shape) == 3 and img.shape[2] == 4

        if has_alpha:
            bgr = img[:, :, :3]
            alpha = img[:, :, 3]
        else:
            bgr = img
            alpha = np.ones(img.shape[:2], dtype=np.uint8) * 255

        self.source_images[source_id] = {
            "bgr": bgr,
            "alpha": alpha,
            "has_alpha": has_alpha,
            "shape": bgr.shape[:2],
            "path": image_path
        }

        # Initialize animation states
        self.blink_state[source_id] = 0.0
        self.breath_phase[source_id] = 0.0
        self.last_blink_time[source_id] = time.time()

        return {"source_id": source_id, "has_alpha": has_alpha, "shape": bgr.shape[:2]}

    def _apply_breathing(self, img: np.ndarray, alpha: np.ndarray, t: float) -> tuple:
        """Apply subtle breathing motion (chest expansion)"""
        h, w = img.shape[:2]

        # Breathing parameters
        breath_cycle = 4.0  # seconds per breath
        breath_amount = 0.008  # Very subtle

        # Calculate breath phase
        phase = (t % breath_cycle) / breath_cycle * 2 * math.pi
        breath = math.sin(phase) * breath_amount

        # Scale from center-bottom (chest area)
        scale = 1.0 + breath
        M = cv2.getRotationMatrix2D((w/2, h * 0.7), 0, scale)

        # Apply to both image and alpha
        img_out = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
        alpha_out = cv2.warpAffine(alpha, M, (w, h), borderMode=cv2.BORDER_REPLICATE)

        return img_out, alpha_out

    def _apply_head_movement(self, img: np.ndarray, alpha: np.ndarray, t: float) -> tuple:
        """Apply subtle head micro-movements"""
        h, w = img.shape[:2]

        # Multiple overlapping sine waves for natural movement
        # Horizontal sway
        dx = (math.sin(t * 0.5) * 2 +
              math.sin(t * 0.8 + 1.2) * 1 +
              math.sin(t * 1.3 + 0.5) * 0.5)

        # Vertical bob
        dy = (math.sin(t * 0.7) * 1.5 +
              math.sin(t * 1.1 + 0.8) * 0.8)

        # Subtle rotation
        angle = math.sin(t * 0.4) * 0.5 + math.sin(t * 0.9 + 1.5) * 0.3

        # Create transformation
        M = cv2.getRotationMatrix2D((w/2, h/3), angle, 1.0)
        M[0, 2] += dx
        M[1, 2] += dy

        img_out = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
        alpha_out = cv2.warpAffine(alpha, M, (w, h), borderMode=cv2.BORDER_REPLICATE)

        return img_out, alpha_out

    def _apply_blink(self, img: np.ndarray, source_id: str, t: float) -> np.ndarray:
        """Apply eye blink effect"""
        current_time = time.time()
        last_blink = self.last_blink_time.get(source_id, current_time)
        blink_state = self.blink_state.get(source_id, 0.0)

        # Random blink interval (2-6 seconds)
        blink_interval = 3.0 + np.random.random() * 3.0

        # Check if it's time to blink
        if current_time - last_blink > blink_interval and blink_state == 0:
            self.blink_state[source_id] = 1.0
            self.last_blink_time[source_id] = current_time

        # Blink animation (quick close, slower open)
        if blink_state > 0:
            blink_state -= 0.15  # Speed of blink
            if blink_state < 0:
                blink_state = 0
            self.blink_state[source_id] = blink_state

            # Apply blink effect (darken eye region slightly)
            # This is a simplified effect - real implementation would need face landmarks
            h, w = img.shape[:2]
            eye_region_y = int(h * 0.25)
            eye_region_h = int(h * 0.15)

            # Create a subtle darkening mask for blink
            if blink_state > 0.5:
                blink_intensity = (blink_state - 0.5) * 2
                mask = np.ones_like(img, dtype=np.float32)
                mask[eye_region_y:eye_region_y + eye_region_h, :] *= (1 - blink_intensity * 0.3)
                img = (img * mask).astype(np.uint8)

        return img

    def _apply_expression_variation(self, img: np.ndarray, t: float) -> np.ndarray:
        """Apply very subtle expression variations"""
        # Subtle brightness/contrast variations to simulate life
        variation = math.sin(t * 0.3) * 0.02 + 1.0
        img = cv2.convertScaleAbs(img, alpha=variation, beta=0)
        return img

    def generate_frame(self, source_id: str, t: float, max_size: int = 512, use_jpeg: bool = True) -> bytes:
        """Generate a single animated frame (optimized for speed)"""
        if source_id not in self.source_images:
            raise ValueError(f"Source {source_id} not loaded")

        source = self.source_images[source_id]
        img = source["bgr"].copy()
        alpha = source["alpha"].copy()

        # Resize for performance if needed
        h, w = img.shape[:2]
        if max(h, w) > max_size:
            scale = max_size / max(h, w)
            new_w, new_h = int(w * scale), int(h * scale)
            img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
            alpha = cv2.resize(alpha, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

        # Apply animations in order
        img, alpha = self._apply_breathing(img, alpha, t)
        img, alpha = self._apply_head_movement(img, alpha, t)
        img = self._apply_blink(img, source_id, t)
        img = self._apply_expression_variation(img, t)

        # Combine with alpha for output
        if source["has_alpha"] and not use_jpeg:
            rgba = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
            rgba[:, :, 3] = alpha
            _, buffer = cv2.imencode('.png', rgba, [cv2.IMWRITE_PNG_COMPRESSION, 1])
        else:
            # Use JPEG for speed (no alpha but much faster)
            _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])

        return buffer.tobytes()

    def stream_animation(self, source_id: str, fps: int = 30, duration: float = None) -> Generator[bytes, None, None]:
        """Stream animated frames continuously"""
        if source_id not in self.source_images:
            raise ValueError(f"Source {source_id} not loaded")

        start_time = time.time()
        frame_interval = 1.0 / fps

        while True:
            t = time.time() - start_time

            if duration and t > duration:
                break

            frame = self.generate_frame(source_id, t)
            yield frame

            # Maintain frame rate
            elapsed = time.time() - start_time - t
            sleep_time = frame_interval - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

    async def async_stream_animation(self, source_id: str, fps: int = 30, duration: float = None):
        """Async version for WebSocket streaming"""
        if source_id not in self.source_images:
            raise ValueError(f"Source {source_id} not loaded")

        start_time = time.time()
        frame_interval = 1.0 / fps

        while True:
            t = time.time() - start_time

            if duration and t > duration:
                break

            frame = self.generate_frame(source_id, t)
            yield frame

            await asyncio.sleep(frame_interval)


# Test function
if __name__ == "__main__":
    import sys

    animator = NaturalAnimator()

    # Load Eva
    eva_path = Path(__file__).parent.parent / "frontend" / "public" / "avatars" / "eva_nobg.png"
    if not eva_path.exists():
        eva_path = Path(__file__).parent.parent / "frontend" / "public" / "avatars" / "eva.jpg"

    print(f"Loading: {eva_path}")
    animator.load_source(str(eva_path), "eva")

    # Generate test frames
    print("Generating test animation...")
    for i, frame in enumerate(animator.stream_animation("eva", fps=25, duration=3)):
        print(f"Frame {i}: {len(frame)} bytes")
        if i >= 75:  # 3 seconds at 25fps
            break

    print("Done!")
