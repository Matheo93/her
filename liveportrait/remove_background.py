"""
Background Removal Script - 100% LOCAL (no API)
Uses U2-Net model via rembg library
"""

import sys
from pathlib import Path
from rembg import remove, new_session
from PIL import Image
import io

# Paths
AVATARS_DIR = Path(__file__).parent.parent / "frontend" / "public" / "avatars"

def remove_background(input_path: str, output_path: str = None, model: str = "u2net") -> str:
    """
    Remove background from an image using U2-Net (100% local)

    Args:
        input_path: Path to input image
        output_path: Path for output (default: input_nobg.png)
        model: Model to use (u2net, u2netp, u2net_human_seg, silueta, isnet-general-use)

    Returns:
        Path to output image
    """
    input_path = Path(input_path)

    if output_path is None:
        output_path = input_path.parent / f"{input_path.stem}_nobg.png"
    else:
        output_path = Path(output_path)

    print(f"Loading model: {model}...")
    session = new_session(model)

    print(f"Processing: {input_path}")

    # Read input image
    with open(input_path, "rb") as f:
        input_data = f.read()

    # Remove background
    output_data = remove(
        input_data,
        session=session,
        alpha_matting=True,  # Better edge quality
        alpha_matting_foreground_threshold=240,
        alpha_matting_background_threshold=10,
        alpha_matting_erode_size=10,
    )

    # Save output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(output_data)

    print(f"Saved: {output_path}")
    return str(output_path)


def process_all_avatars(model: str = "u2net"):
    """Process all avatars in the avatars directory"""
    print(f"Processing avatars in: {AVATARS_DIR}")

    for img_path in AVATARS_DIR.glob("*.jpg"):
        output_path = img_path.parent / f"{img_path.stem}_nobg.png"
        if not output_path.exists():
            remove_background(str(img_path), str(output_path), model)
        else:
            print(f"Already exists: {output_path}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # Process specific file
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        model = sys.argv[3] if len(sys.argv) > 3 else "u2net"
        remove_background(input_file, output_file, model)
    else:
        # Process all avatars
        process_all_avatars()
