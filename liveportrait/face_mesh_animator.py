"""
REAL Face Animation with MediaPipe Face Mesh
Deforms actual facial features - NOT just frame movement
100% LOCAL - Fast on CPU
"""

import cv2
import numpy as np
import mediapipe as mp
import math
import time
from pathlib import Path
from typing import Optional, Dict, Tuple
from dataclasses import dataclass

@dataclass
class AnimationState:
    """Current animation state for an avatar"""
    blink_progress: float = 0.0
    last_blink_time: float = 0.0
    next_blink_interval: float = 3.0
    mouth_open: float = 0.0
    eyebrow_raise: float = 0.0


class FaceMeshAnimator:
    """
    Real face animation using MediaPipe Face Mesh
    Deforms actual facial landmarks for realistic movement
    """

    # Key facial landmark indices
    # Left eye
    LEFT_EYE_TOP = [159, 160, 161, 158]
    LEFT_EYE_BOTTOM = [144, 145, 153, 154]
    LEFT_EYE_INNER = 133
    LEFT_EYE_OUTER = 33

    # Right eye
    RIGHT_EYE_TOP = [386, 385, 384, 387]
    RIGHT_EYE_BOTTOM = [373, 374, 380, 381]
    RIGHT_EYE_INNER = 362
    RIGHT_EYE_OUTER = 263

    # Eyebrows
    LEFT_EYEBROW = [70, 63, 105, 66, 107]
    RIGHT_EYEBROW = [336, 296, 334, 293, 300]

    # Lips
    UPPER_LIP = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]
    LOWER_LIP = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291]

    # Face contour for head movement
    FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
                 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
                 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]

    def __init__(self, static_mode: bool = True):
        """Initialize MediaPipe Face Mesh"""
        print("Initializing MediaPipe Face Mesh Animator...")

        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=static_mode,
            max_num_faces=1,
            refine_landmarks=True,  # More detailed landmarks around eyes/lips
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )

        self.sources: Dict[str, dict] = {}
        self.states: Dict[str, AnimationState] = {}

        print("Face Mesh Animator ready!")

    def load_source(self, image_path: str, source_id: str) -> dict:
        """Load and preprocess a source image"""
        print(f"Loading source: {source_id} from {image_path}")

        # Load image with alpha if present
        img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
        if img is None:
            raise ValueError(f"Cannot load image: {image_path}")

        # Handle alpha channel
        has_alpha = len(img.shape) == 3 and img.shape[2] == 4
        if has_alpha:
            bgr = img[:, :, :3]
            alpha = img[:, :, 3]
        else:
            bgr = img
            alpha = np.ones(img.shape[:2], dtype=np.uint8) * 255

        # Convert to RGB for MediaPipe
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

        # Detect face landmarks
        results = self.face_mesh.process(rgb)

        if not results.multi_face_landmarks:
            print(f"Warning: No face detected in {source_id}, using center approximation")
            landmarks = None
        else:
            # Get landmarks as numpy array
            landmarks = np.array([
                [lm.x, lm.y, lm.z]
                for lm in results.multi_face_landmarks[0].landmark
            ])

        # Store source data
        self.sources[source_id] = {
            "bgr": bgr.copy(),
            "rgb": rgb.copy(),
            "alpha": alpha.copy(),
            "has_alpha": has_alpha,
            "landmarks": landmarks,
            "shape": bgr.shape[:2],
            "path": image_path
        }

        # Initialize animation state
        self.states[source_id] = AnimationState(last_blink_time=time.time())

        print(f"Loaded {source_id}: shape={bgr.shape[:2]}, has_alpha={has_alpha}, landmarks={'detected' if landmarks is not None else 'none'}")

        return {
            "source_id": source_id,
            "has_alpha": has_alpha,
            "shape": bgr.shape[:2],
            "landmarks_detected": landmarks is not None
        }

    def _get_landmark_points(self, landmarks: np.ndarray, indices: list, h: int, w: int) -> np.ndarray:
        """Convert landmark indices to pixel coordinates"""
        points = []
        for idx in indices:
            x = int(landmarks[idx][0] * w)
            y = int(landmarks[idx][1] * h)
            points.append([x, y])
        return np.array(points, dtype=np.float32)

    def _apply_eye_blink(self, img: np.ndarray, landmarks: np.ndarray,
                         blink_amount: float, h: int, w: int) -> np.ndarray:
        """Apply eye blink by moving eye landmarks"""
        if landmarks is None or blink_amount <= 0:
            return img

        result = img.copy()

        # Get eye regions
        for eye_top, eye_bottom in [(self.LEFT_EYE_TOP, self.LEFT_EYE_BOTTOM),
                                     (self.RIGHT_EYE_TOP, self.RIGHT_EYE_BOTTOM)]:
            # Get eye center
            top_pts = self._get_landmark_points(landmarks, eye_top, h, w)
            bottom_pts = self._get_landmark_points(landmarks, eye_bottom, h, w)

            center_x = int((top_pts[:, 0].mean() + bottom_pts[:, 0].mean()) / 2)
            center_y = int((top_pts[:, 1].mean() + bottom_pts[:, 1].mean()) / 2)

            # Eye dimensions
            eye_width = int(abs(top_pts[:, 0].max() - top_pts[:, 0].min()) * 1.5)
            eye_height = int(abs(top_pts[:, 1].mean() - bottom_pts[:, 1].mean()) * 2)

            # Define region
            x1 = max(0, center_x - eye_width)
            x2 = min(w, center_x + eye_width)
            y1 = max(0, center_y - eye_height)
            y2 = min(h, center_y + eye_height)

            if x2 <= x1 or y2 <= y1:
                continue

            # Extract region
            region = result[y1:y2, x1:x2].copy()
            region_h, region_w = region.shape[:2]

            # Apply vertical squeeze for blink
            squeeze = 1.0 - (blink_amount * 0.7)  # Max 70% closed

            if squeeze < 1.0:
                new_h = max(1, int(region_h * squeeze))
                squeezed = cv2.resize(region, (region_w, new_h), interpolation=cv2.INTER_LINEAR)

                # Pad to original size
                pad_top = (region_h - new_h) // 2
                pad_bottom = region_h - new_h - pad_top

                if pad_top > 0 or pad_bottom > 0:
                    # Use skin color approximation for padding
                    skin_color = region[region_h // 2, region_w // 2].tolist()
                    padded = np.full((region_h, region_w, 3), skin_color, dtype=np.uint8)
                    padded[pad_top:pad_top + new_h, :] = squeezed
                    result[y1:y2, x1:x2] = padded

        return result

    def _apply_mouth_movement(self, img: np.ndarray, landmarks: np.ndarray,
                              mouth_open: float, h: int, w: int) -> np.ndarray:
        """Apply mouth opening/closing"""
        if landmarks is None or mouth_open <= 0:
            return img

        result = img.copy()

        # Get mouth region
        upper_lip = self._get_landmark_points(landmarks, self.UPPER_LIP, h, w)
        lower_lip = self._get_landmark_points(landmarks, self.LOWER_LIP, h, w)

        # Mouth center and dimensions
        center_x = int((upper_lip[:, 0].mean() + lower_lip[:, 0].mean()) / 2)
        center_y = int((upper_lip[:, 1].mean() + lower_lip[:, 1].mean()) / 2)

        mouth_width = int(abs(upper_lip[:, 0].max() - upper_lip[:, 0].min()) * 1.3)
        mouth_height = int(abs(upper_lip[:, 1].mean() - lower_lip[:, 1].mean()) * 3)

        # Define region
        x1 = max(0, center_x - mouth_width)
        x2 = min(w, center_x + mouth_width)
        y1 = max(0, center_y - mouth_height)
        y2 = min(h, center_y + mouth_height)

        if x2 <= x1 or y2 <= y1:
            return result

        # Extract and stretch region vertically for mouth open
        region = result[y1:y2, x1:x2].copy()
        region_h, region_w = region.shape[:2]

        stretch = 1.0 + (mouth_open * 0.3)  # Max 30% stretch
        new_h = int(region_h * stretch)

        stretched = cv2.resize(region, (region_w, new_h), interpolation=cv2.INTER_LINEAR)

        # Crop to original size (from top)
        crop_h = min(region_h, stretched.shape[0])
        result[y1:y1 + crop_h, x1:x2] = stretched[:crop_h, :]

        return result

    def _apply_eyebrow_raise(self, img: np.ndarray, landmarks: np.ndarray,
                             raise_amount: float, h: int, w: int) -> np.ndarray:
        """Apply eyebrow raising"""
        if landmarks is None or abs(raise_amount) < 0.01:
            return img

        result = img.copy()

        for eyebrow_indices in [self.LEFT_EYEBROW, self.RIGHT_EYEBROW]:
            eyebrow_pts = self._get_landmark_points(landmarks, eyebrow_indices, h, w)

            center_x = int(eyebrow_pts[:, 0].mean())
            center_y = int(eyebrow_pts[:, 1].mean())

            brow_width = int(abs(eyebrow_pts[:, 0].max() - eyebrow_pts[:, 0].min()) * 1.5)
            brow_height = int(h * 0.08)

            x1 = max(0, center_x - brow_width)
            x2 = min(w, center_x + brow_width)
            y1 = max(0, center_y - brow_height)
            y2 = min(h, center_y + brow_height)

            if x2 <= x1 or y2 <= y1:
                continue

            # Shift region up or down
            shift = int(raise_amount * brow_height * 0.3)

            if shift != 0:
                region = result[y1:y2, x1:x2].copy()
                new_y1 = max(0, y1 - shift)
                new_y2 = min(h, y2 - shift)

                if new_y2 > new_y1:
                    region_h = min(region.shape[0], new_y2 - new_y1)
                    result[new_y1:new_y1 + region_h, x1:x2] = region[:region_h]

        return result

    def _apply_head_rotation(self, img: np.ndarray, alpha: np.ndarray,
                             pitch: float, yaw: float, roll: float,
                             h: int, w: int) -> Tuple[np.ndarray, np.ndarray]:
        """Apply subtle head rotation using perspective transform"""
        # Small rotation angles only (in degrees)
        pitch = np.clip(pitch, -5, 5)
        yaw = np.clip(yaw, -5, 5)
        roll = np.clip(roll, -3, 3)

        center = (w / 2, h / 2)

        # Rotation matrix
        M = cv2.getRotationMatrix2D(center, roll, 1.0)

        # Add subtle translation for yaw/pitch simulation
        M[0, 2] += yaw * 2
        M[1, 2] += pitch * 2

        result = cv2.warpAffine(img, M, (w, h), borderMode=cv2.BORDER_REPLICATE)
        alpha_out = cv2.warpAffine(alpha, M, (w, h), borderMode=cv2.BORDER_REPLICATE)

        return result, alpha_out

    def _update_animation_state(self, state: AnimationState, t: float) -> AnimationState:
        """Update animation state based on time"""
        current_time = time.time()

        # Blink logic
        time_since_blink = current_time - state.last_blink_time

        if time_since_blink > state.next_blink_interval:
            # Start new blink
            state.blink_progress = 1.0
            state.last_blink_time = current_time
            state.next_blink_interval = 2.0 + np.random.random() * 4.0  # 2-6 seconds
        elif state.blink_progress > 0:
            # Blink animation (fast close, slower open)
            state.blink_progress = max(0, state.blink_progress - 0.2)

        # Subtle mouth movement (breathing/micro expressions)
        state.mouth_open = max(0, math.sin(t * 0.5) * 0.05 + 0.02)

        # Subtle eyebrow movement
        state.eyebrow_raise = math.sin(t * 0.3 + 0.7) * 0.1

        return state

    def generate_frame(self, source_id: str, t: float) -> bytes:
        """Generate an animated frame"""
        if source_id not in self.sources:
            raise ValueError(f"Source {source_id} not loaded")

        source = self.sources[source_id]
        state = self.states[source_id]

        # Update animation state
        state = self._update_animation_state(state, t)
        self.states[source_id] = state

        # Get source data
        img = source["bgr"].copy()
        alpha = source["alpha"].copy()
        landmarks = source["landmarks"]
        h, w = source["shape"]

        # Calculate head movement parameters
        pitch = math.sin(t * 0.4) * 2 + math.sin(t * 0.7) * 1
        yaw = math.sin(t * 0.3 + 0.5) * 3 + math.sin(t * 0.6 + 1.0) * 1.5
        roll = math.sin(t * 0.5 + 1.2) * 1.5

        # Apply animations
        if landmarks is not None:
            # Apply facial deformations
            img = self._apply_eye_blink(img, landmarks, state.blink_progress, h, w)
            img = self._apply_mouth_movement(img, landmarks, state.mouth_open, h, w)
            img = self._apply_eyebrow_raise(img, landmarks, state.eyebrow_raise, h, w)

        # Apply head rotation
        img, alpha = self._apply_head_rotation(img, alpha, pitch, yaw, roll, h, w)

        # Encode output
        if source["has_alpha"]:
            rgba = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
            rgba[:, :, 3] = alpha
            _, buffer = cv2.imencode('.png', rgba, [cv2.IMWRITE_PNG_COMPRESSION, 1])
        else:
            _, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])

        return buffer.tobytes()


# FastAPI Integration
if __name__ == "__main__":
    import asyncio

    print("Testing Face Mesh Animator...")

    animator = FaceMeshAnimator()

    # Load test image
    test_path = Path(__file__).parent.parent / "frontend" / "public" / "avatars" / "eva_nobg.png"
    if not test_path.exists():
        test_path = Path(__file__).parent.parent / "frontend" / "public" / "avatars" / "eva.jpg"

    print(f"Loading: {test_path}")
    result = animator.load_source(str(test_path), "eva")
    print(f"Load result: {result}")

    # Generate test frames
    print("\nGenerating test frames...")
    for i in range(10):
        t = i * 0.1
        frame = animator.generate_frame("eva", t)
        print(f"Frame {i}: {len(frame)} bytes")

    print("\nDone!")
