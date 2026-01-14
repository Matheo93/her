#!/usr/bin/env python3
"""
Generate viseme images with SOLID background (no transparency)
This prevents flickering during alpha blending
"""

import cv2
import numpy as np
import face_alignment
import os

VISEME_DIR = "/workspace/eva-gpu/frontend/public/avatars/visemes"
SOURCE_PATH = "/workspace/eva-gpu/frontend/public/avatars/eva_nobg.png"
BACKGROUND_COLOR = (74, 74, 13)  # BGR for #0d4a4a (teal)

VISEMES = {
    "sil": (0.0, 0.0, 0.0),
    "PP":  (0.05, -0.1, 0.0),
    "FF":  (0.1, 0.1, 0.0),
    "TH":  (0.15, 0.05, 0.0),
    "DD":  (0.2, 0.0, 0.0),
    "kk":  (0.25, -0.05, 0.0),
    "CH":  (0.15, 0.2, 0.3),
    "SS":  (0.1, 0.25, 0.0),
    "RR":  (0.2, 0.0, 0.2),
    "AA":  (0.7, 0.2, 0.0),
    "EE":  (0.3, 0.4, 0.0),
    "OO":  (0.5, -0.2, 0.5),
}

def composite_on_background(img_rgba, bg_color):
    """Composite RGBA image onto solid background"""
    if img_rgba.shape[2] == 4:
        # Split channels
        bgr = img_rgba[:, :, :3]
        alpha = img_rgba[:, :, 3:4].astype(float) / 255.0

        # Create background
        bg = np.full_like(bgr, bg_color, dtype=np.uint8)

        # Composite
        result = (bgr.astype(float) * alpha + bg.astype(float) * (1 - alpha)).astype(np.uint8)
        return result
    return img_rgba[:, :, :3]

def warp_mouth_region(img, landmarks, jaw_open, mouth_width, lip_pucker):
    """Warp mouth region"""
    result = img.copy()
    h, w = img.shape[:2]

    mouth_pts = landmarks[48:68].copy()
    mouth_center = np.mean(mouth_pts, axis=0)

    target_pts = mouth_pts.copy()

    # Jaw open
    for i in range(6, 12):
        target_pts[i][1] += jaw_open * 25
    for i in range(16, 20):
        target_pts[i][1] += jaw_open * 20

    # Mouth width
    for i in range(len(target_pts)):
        dx = target_pts[i][0] - mouth_center[0]
        target_pts[i][0] = mouth_center[0] + dx * (1 + mouth_width)

    # Lip pucker
    if lip_pucker > 0:
        for i in range(len(target_pts)):
            direction = mouth_center - target_pts[i]
            target_pts[i] += direction * lip_pucker * 0.3

    # Warp using triangulation
    from scipy.spatial import Delaunay

    margin = 60
    x_min = max(0, int(mouth_center[0] - 100))
    x_max = min(w, int(mouth_center[0] + 100))
    y_min = max(0, int(mouth_center[1] - 60))
    y_max = min(h, int(mouth_center[1] + 80 + jaw_open * 30))

    corners = np.array([
        [x_min, y_min], [x_max, y_min],
        [x_min, y_max], [x_max, y_max],
        [mouth_center[0], y_min], [mouth_center[0], y_max],
        [x_min, mouth_center[1]], [x_max, mouth_center[1]],
    ])

    src_pts = np.vstack([mouth_pts, corners]).astype(np.float32)
    dst_pts = np.vstack([target_pts, corners]).astype(np.float32)

    tri = Delaunay(src_pts)

    for simplex in tri.simplices:
        warp_triangle(img, result, src_pts[simplex], dst_pts[simplex])

    return result

def warp_triangle(src_img, dst_img, src_tri, dst_tri):
    r1 = cv2.boundingRect(np.float32([src_tri]))
    r2 = cv2.boundingRect(np.float32([dst_tri]))

    if r1[2] <= 0 or r1[3] <= 0 or r2[2] <= 0 or r2[3] <= 0:
        return

    src_tri_rect = [(src_tri[i][0] - r1[0], src_tri[i][1] - r1[1]) for i in range(3)]
    dst_tri_rect = [(dst_tri[i][0] - r2[0], dst_tri[i][1] - r2[1]) for i in range(3)]

    mat = cv2.getAffineTransform(np.float32(src_tri_rect), np.float32(dst_tri_rect))

    y1, y2 = max(0, r1[1]), min(src_img.shape[0], r1[1] + r1[3])
    x1, x2 = max(0, r1[0]), min(src_img.shape[1], r1[0] + r1[2])

    if y2 <= y1 or x2 <= x1:
        return

    src_rect = src_img[y1:y2, x1:x2]
    if src_rect.size == 0:
        return

    warped = cv2.warpAffine(src_rect, mat, (r2[2], r2[3]), borderMode=cv2.BORDER_REFLECT_101)

    mask = np.zeros((r2[3], r2[2]), dtype=np.float32)
    cv2.fillConvexPoly(mask, np.int32(dst_tri_rect), 1.0)

    dy1, dy2 = max(0, r2[1]), min(dst_img.shape[0], r2[1] + r2[3])
    dx1, dx2 = max(0, r2[0]), min(dst_img.shape[1], r2[0] + r2[2])

    if dy2 <= dy1 or dx2 <= dx1:
        return

    wy1, wy2 = dy1 - r2[1], dy2 - r2[1]
    wx1, wx2 = dx1 - r2[0], dx2 - r2[0]

    warped_crop = warped[wy1:wy2, wx1:wx2]
    mask_crop = mask[wy1:wy2, wx1:wx2]

    if warped_crop.size == 0:
        return

    mask_3d = mask_crop[:, :, np.newaxis]
    dst_img[dy1:dy2, dx1:dx2] = (
        dst_img[dy1:dy2, dx1:dx2] * (1 - mask_3d) +
        warped_crop * mask_3d
    ).astype(dst_img.dtype)


def main():
    print("Loading image...")
    img_rgba = cv2.imread(SOURCE_PATH, cv2.IMREAD_UNCHANGED)
    if img_rgba is None:
        print(f"Error loading {SOURCE_PATH}")
        return

    print(f"Image: {img_rgba.shape}")

    # Composite onto solid background
    print("Compositing on solid background...")
    img = composite_on_background(img_rgba, BACKGROUND_COLOR)

    # Detect landmarks
    print("Detecting landmarks...")
    fa = face_alignment.FaceAlignment(face_alignment.LandmarksType.TWO_D, device='cuda')
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    landmarks = fa.get_landmarks(rgb)
    if not landmarks:
        print("No face detected!")
        return

    lm = landmarks[0]
    print(f"Found {len(lm)} landmarks")

    os.makedirs(VISEME_DIR, exist_ok=True)

    print(f"\nGenerating {len(VISEMES)} visemes with solid background...")
    for name, (jaw, width, pucker) in VISEMES.items():
        warped = warp_mouth_region(img, lm, jaw, width, pucker)

        # Save as JPEG (no transparency, faster loading)
        output_path = os.path.join(VISEME_DIR, f"{name}.jpg")
        cv2.imwrite(output_path, warped, [cv2.IMWRITE_JPEG_QUALITY, 95])
        print(f"  {name}.jpg")

    print("\nDone!")


if __name__ == "__main__":
    main()
