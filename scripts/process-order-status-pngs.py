#!/usr/bin/env python3
"""Remove edge-connected near-white canvas from order status PNGs."""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

TOLERANCE = 20
WHITE_THRESHOLD = 255 - TOLERANCE
SCRIPT_DIR = Path(__file__).resolve().parent
TARGET_DIR = SCRIPT_DIR.parent / "public" / "images" / "order-status"


def is_near_white(r: int, g: int, b: int) -> bool:
    if r >= WHITE_THRESHOLD and g >= WHITE_THRESHOLD and b >= WHITE_THRESHOLD:
        return True
    # Neutral light canvas tones (slightly warm/cool gray around the icon).
    return min(r, g, b) >= 230 and max(r, g, b) - min(r, g, b) <= 12


def remove_edge_white_background(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = rgba.load()
    visited = [[False] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()

    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))

    while queue:
        x, y = queue.popleft()
        if x < 0 or y < 0 or x >= width or y >= height or visited[y][x]:
            continue

        visited[y][x] = True
        red, green, blue, alpha = pixels[x, y]
        if alpha == 0 or not is_near_white(red, green, blue):
            continue

        pixels[x, y] = (red, green, blue, 0)
        queue.extend([(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)])

    return rgba


def trim_transparent(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        return image
    return image.crop(bbox)


def process_file(path: Path) -> tuple[int, int]:
    original = Image.open(path)
    original_size = original.size
    processed = trim_transparent(remove_edge_white_background(original))
    processed.save(path, format="PNG", optimize=True)
    return original_size, processed.size


def main() -> None:
    if not TARGET_DIR.is_dir():
        raise SystemExit(f"Target directory not found: {TARGET_DIR}")

    png_files = sorted(TARGET_DIR.glob("*.png"))
    if not png_files:
        raise SystemExit(f"No PNG files found in {TARGET_DIR}")

    for png_path in png_files:
        before, after = process_file(png_path)
        print(f"{png_path.name}: {before[0]}x{before[1]} -> {after[0]}x{after[1]}")

    print(f"Processed {len(png_files)} PNG(s) in {TARGET_DIR}")


if __name__ == "__main__":
    main()
