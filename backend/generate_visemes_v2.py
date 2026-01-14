#!/usr/bin/env python3
"""
Generate viseme images with more pronounced mouth movements
Uses direct pixel manipulation for visible differences
"""

import cv2
import numpy as np
import face_alignment
import os

VISEME_DIR = "/workspace/eva-gpu/frontend/public/avatars/visemes"
SOURCE_PATH = "/workspace/eva-gpu/frontend/public/avatars/eva_nobg.png"

# Viseme parameters: (jaw_open, mouth_width, lip_pucker)
# More aggressive values for visible differences
VISEMES = {
    "sil": (0.0, 0.0, 0.0),    # Closed
    "PP":  (0.05, -0.1, 0.0),  # Lips pressed (p, b, m)
    "FF":  (0.1, 0.1, 0.0),    # Teeth on lip (f, v)
    "TH":  (0.15, 0.05, 0.0),  # Tongue out (th)
    "DD":  (0.2, 0.0, 0.0),    # Tongue up (t, d, n)
    "kk":  (0.25, -0.05, 0.0), # Back tongue (k, g)
    "CH":  (0.15, 0.2, 0.3),   # Rounded (ch, sh)
    "SS":  (0.1, 0.25, 0.0),   # Teeth close (s, z)
    "RR":  (0.2, 0.0, 0.2),    # R sound
    "AA":  (0.7, 0.2, 0.0),    # Wide open (a)
    "EE":  (0.3, 0.4, 0.0),    # Wide smile (e, i)
    "OO":  (0.5, -0.2, 0.5),   # Rounded (o, u)
}

def warp_mouth_region(img, landmarks, jaw_open, mouth_width, lip_pucker):
    """
    Warp the mouth region of the image

    jaw_open: 0-1, how much the jaw drops
    mouth_width: -0.5 to 0.5, negative = narrower, positive = wider
    lip_pucker: 0-1, how much lips pucker forward
    """
    result = img.copy()
    h, w = img.shape[:2]

    # Get mouth landmarks (48-67)
    mouth_pts = landmarks[48:68].copy()
    mouth_center = np.mean(mouth_pts, axis=0)

    # Upper lip: 48-54 (outer), 60-64 (inner)
    # Lower lip: 54-60 (outer), 64-68 (inner)

    # Create target points
    target_pts = mouth_pts.copy()

    # Jaw open - move lower lip down
    for i in range(6, 12):  # Lower outer lip (54-59 mapped to 6-11)
        target_pts[i][1] += jaw_open * 25
    for i in range(16, 20):  # Lower inner lip (64-67 mapped to 16-19)
        target_pts[i][1] += jaw_open * 20

    # Mouth width - stretch or compress horizontally
    for i in range(len(target_pts)):
        dx = target_pts[i][0] - mouth_center[0]
        target_pts[i][0] = mouth_center[0] + dx * (1 + mouth_width)

    # Lip pucker - move lips toward center
    if lip_pucker > 0:
        for i in range(len(target_pts)):
            direction = mouth_center - target_pts[i]
            target_pts[i] += direction * lip_pucker * 0.3

    # Create mesh for warping
    # Define a region around the mouth
    margin = 60
    x_min = max(0, int(mouth_center[0] - 100))
    x_max = min(w, int(mouth_center[0] + 100))
    y_min = max(0, int(mouth_center[1] - 60))
    y_max = min(h, int(mouth_center[1] + 80 + jaw_open * 30))

    # Source and destination points for affine transform of subregions
    # Use triangulation
    from scipy.spatial import Delaunay

    # Add corner points for the mouth region
    corners = np.array([
        [x_min, y_min],
        [x_max, y_min],
        [x_min, y_max],
        [x_max, y_max],
        [mouth_center[0], y_min],
        [mouth_center[0], y_max],
        [x_min, mouth_center[1]],
        [x_max, mouth_center[1]],
    ])

    src_pts = np.vstack([mouth_pts, corners]).astype(np.float32)
    dst_pts = np.vstack([target_pts, corners]).astype(np.float32)

    # Triangulate
    tri = Delaunay(src_pts)

    # Warp each triangle
    for simplex in tri.simplices:
        warp_triangle(img, result, src_pts[simplex], dst_pts[simplex])

    return result

def warp_triangle(src_img, dst_img, src_tri, dst_tri):
    """Warp a triangle from source to destination"""
    # Bounding rectangles
    r1 = cv2.boundingRect(np.float32([src_tri]))
    r2 = cv2.boundingRect(np.float32([dst_tri]))

    if r1[2] <= 0 or r1[3] <= 0 or r2[2] <= 0 or r2[3] <= 0:
        return

    # Offset triangles
    src_tri_rect = [(src_tri[i][0] - r1[0], src_tri[i][1] - r1[1]) for i in range(3)]
    dst_tri_rect = [(dst_tri[i][0] - r2[0], dst_tri[i][1] - r2[1]) for i in range(3)]

    # Get affine transform
    mat = cv2.getAffineTransform(np.float32(src_tri_rect), np.float32(dst_tri_rect))

    # Extract and warp
    y1, y2 = max(0, r1[1]), min(src_img.shape[0], r1[1] + r1[3])
    x1, x2 = max(0, r1[0]), min(src_img.shape[1], r1[0] + r1[2])

    if y2 <= y1 or x2 <= x1:
        return

    src_rect = src_img[y1:y2, x1:x2]
    if src_rect.size == 0:
        return

    warped = cv2.warpAffine(src_rect, mat, (r2[2], r2[3]),
                            borderMode=cv2.BORDER_REFLECT_101)

    # Create mask
    mask = np.zeros((r2[3], r2[2]), dtype=np.float32)
    cv2.fillConvexPoly(mask, np.int32(dst_tri_rect), 1.0)

    # Apply to destination
    dy1, dy2 = max(0, r2[1]), min(dst_img.shape[0], r2[1] + r2[3])
    dx1, dx2 = max(0, r2[0]), min(dst_img.shape[1], r2[0] + r2[2])

    if dy2 <= dy1 or dx2 <= dx1:
        return

    # Crop warped and mask to match destination region
    wy1, wy2 = dy1 - r2[1], dy2 - r2[1]
    wx1, wx2 = dx1 - r2[0], dx2 - r2[0]

    warped_crop = warped[wy1:wy2, wx1:wx2]
    mask_crop = mask[wy1:wy2, wx1:wx2]

    if warped_crop.size == 0:
        return

    # Blend
    mask_3d = mask_crop[:, :, np.newaxis]
    dst_img[dy1:dy2, dx1:dx2] = (
        dst_img[dy1:dy2, dx1:dx2] * (1 - mask_3d) +
        warped_crop * mask_3d
    ).astype(dst_img.dtype)


def main():
    print("Loading image and detecting landmarks...")

    # Load image
    img = cv2.imread(SOURCE_PATH, cv2.IMREAD_UNCHANGED)
    if img is None:
        print(f"Error: Could not load {SOURCE_PATH}")
        return

    print(f"Image size: {img.shape}")

    # Detect landmarks
    fa = face_alignment.FaceAlignment(face_alignment.LandmarksType.TWO_D, device='cuda')

    if img.shape[2] == 4:
        rgb = cv2.cvtColor(img[:,:,:3], cv2.COLOR_BGR2RGB)
    else:
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    landmarks = fa.get_landmarks(rgb)
    if landmarks is None:
        print("Error: No face detected")
        return

    lm = landmarks[0]
    print(f"Detected {len(lm)} landmarks")

    # Generate visemes
    os.makedirs(VISEME_DIR, exist_ok=True)

    print(f"\nGenerating {len(VISEMES)} viseme images...")

    for name, (jaw_open, mouth_width, lip_pucker) in VISEMES.items():
        print(f"  {name}: jaw={jaw_open}, width={mouth_width}, pucker={lip_pucker}")

        warped = warp_mouth_region(img, lm, jaw_open, mouth_width, lip_pucker)

        output_path = os.path.join(VISEME_DIR, f"{name}.png")
        cv2.imwrite(output_path, warped)
        print(f"    Saved: {output_path}")

    print("\nDone!")


if __name__ == "__main__":
    main()
