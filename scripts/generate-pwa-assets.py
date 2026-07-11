#!/usr/bin/env python3
"""Generate PWA icon assets from the OWEG logo source files."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

# Primary mark: O + shopping bag on black (already used for existing PWA icons)
LOGO_SOURCE = PUBLIC / "icon-512x512.png"
# Flat mark for small sizes / badge
BADGE_SOURCE = PUBLIC / "oweg_O.png"

BRAND_BG = (0, 0, 0, 255)
MASKABLE_LOGO_SCALE = 0.58  # ~58% of canvas — safe zone for adaptive icons


def ensure_rgba(image: Image.Image) -> Image.Image:
    if image.mode == "RGBA":
        return image
    return image.convert("RGBA")


def fit_center(canvas_size: int, logo: Image.Image, scale: float) -> Image.Image:
    logo = ensure_rgba(logo)
    target = int(canvas_size * scale)
    logo.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), BRAND_BG)
    offset = ((canvas_size - logo.width) // 2, (canvas_size - logo.height) // 2)
    canvas.paste(logo, offset, logo)
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ensure_rgba(image).save(path, format="PNG", optimize=True)
    print(f"wrote {path.relative_to(ROOT)}")


def save_favicon(source: Image.Image, path: Path) -> None:
    source = ensure_rgba(source)
    sizes = [(16, 16), (32, 32), (48, 48)]
    icons = [source.resize(size, Image.Resampling.LANCZOS) for size in sizes]
    path.parent.mkdir(parents=True, exist_ok=True)
    icons[0].save(
        path,
        format="ICO",
        sizes=[(icon.width, icon.height) for icon in icons],
        append_images=icons[1:],
    )
    print(f"wrote {path.relative_to(ROOT)}")


def main() -> None:
    if not LOGO_SOURCE.exists():
        raise SystemExit(f"Missing logo source: {LOGO_SOURCE}")
    if not BADGE_SOURCE.exists():
        raise SystemExit(f"Missing badge source: {BADGE_SOURCE}")

    logo = Image.open(LOGO_SOURCE)
    badge_source = Image.open(BADGE_SOURCE)

    # Standard app icon (512×512)
    save_png(logo.resize((512, 512), Image.Resampling.LANCZOS), PUBLIC / "icon.png")

    # Maskable adaptive icon — logo centered with padding in safe zone
    save_png(fit_center(512, logo, MASKABLE_LOGO_SCALE), PUBLIC / "icon-512x512-maskable.png")

    # Notification badge (72×72)
    badge = ensure_rgba(badge_source).resize((72, 72), Image.Resampling.LANCZOS)
    save_png(badge, PUBLIC / "badge.png")

    # Favicon bundle
    favicon_source = ensure_rgba(badge_source).resize((48, 48), Image.Resampling.LANCZOS)
    save_favicon(favicon_source, PUBLIC / "favicon.ico")

    # Keep existing sizes in sync with the primary mark
    save_png(logo.resize((192, 192), Image.Resampling.LANCZOS), PUBLIC / "icon-192x192.png")
    save_png(logo.resize((512, 512), Image.Resampling.LANCZOS), PUBLIC / "icon-512x512.png")
    save_png(logo.resize((180, 180), Image.Resampling.LANCZOS), PUBLIC / "apple-touch-icon.png")
    save_png(logo.resize((32, 32), Image.Resampling.LANCZOS), PUBLIC / "favicon-32x32.png")


if __name__ == "__main__":
    main()
