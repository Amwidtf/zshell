"""Generate ZShell launcher icons (Android legacy + adaptive, iOS, store 512).

Design: dark background (#161616), bold white geometric "Z" + accent-blue
terminal cursor underscore — "Z + shell". All shapes are procedural polygons,
no fonts involved, so output is deterministic across machines.

Usage: uv run --with pillow python scripts/gen-icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "apps" / "mobile" / "android" / "app" / "src" / "main" / "res"

BG = (22, 22, 22, 255)          # colors.bg #161616
GLYPH_MAIN = (238, 238, 238, 255)  # colors.text #eeeeee
GLYPH_CURSOR = (79, 156, 255, 255)  # colors.accent #4f9cff

BASE = 1024  # master canvas


def draw_glyph(draw: ImageDraw.ImageDraw, size: int, ox: float = 0.0, oy: float = 0.0) -> None:
    """Draw "Z_" centered on a size x size canvas. ox/oy shift in fraction of size."""

    def px(x: float, y: float) -> tuple[float, float]:
        return (x + ox) * size, (y + oy) * size

    # Bold geometric Z occupying x 0.22..0.66, y 0.26..0.74 (width 0.44).
    z_left, z_right = 0.22, 0.66
    z_top, z_bottom = 0.26, 0.74
    stroke = 0.105  # bar thickness
    diagonal = 0.135  # diagonal stroke horizontal width
    z = [
        px(z_left, z_top),
        px(z_right, z_top),
        px(z_right - 0.02, z_top + stroke),
        # right side down to mid point where diagonal starts
        px(z_left + diagonal + stroke + 0.04, z_top + stroke),
        px(z_right - stroke - 0.02, z_bottom - stroke),
        px(z_right, z_bottom),
        px(z_left, z_bottom),
        px(z_left + 0.02, z_bottom - stroke),
        px(z_right - diagonal - stroke - 0.04, z_top + stroke * 2),
        px(z_left + stroke, z_top + stroke * 2),
    ]
    draw.polygon(z, fill=GLYPH_MAIN)

    # Terminal cursor underscore to the right of the Z, baseline-aligned.
    c_left, c_right = 0.70, 0.80
    c_top, c_bottom = z_bottom - stroke, z_bottom
    draw.rectangle(
        [px(c_left, c_top), px(c_right, c_bottom)],
        fill=GLYPH_CURSOR,
    )


def rounded_mask(size: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def circle_mask(size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse([0, 0, size - 1, size - 1], fill=255)
    return mask


def make_square_master() -> Image.Image:
    img = Image.new("RGBA", (BASE, BASE), BG)
    draw = ImageDraw.Draw(img)
    draw_glyph(draw, BASE)
    return img


def make_foreground_master() -> Image.Image:
    """Adaptive-icon foreground: transparent canvas, glyph inside the 66% safe zone."""
    img = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Scale glyph (drawn for full canvas) into the safe zone, centered.
    safe = 0.66
    glyph_layer = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    draw_glyph(ImageDraw.Draw(glyph_layer), BASE)
    scaled_size = int(BASE * safe)
    scaled = glyph_layer.resize((scaled_size, scaled_size), Image.LANCZOS)
    offset = (BASE - scaled_size) // 2
    img.alpha_composite(scaled, (offset, offset))
    return img


def write_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"wrote {path.relative_to(ROOT)}")


def main() -> None:
    square = make_square_master()
    fg = make_foreground_master()

    # ---- Android legacy launcher icons (square w/ rounded corners + round) ----
    densities = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for bucket, size in densities.items():
        s = square.resize((size, size), Image.LANCZOS)
        # rounded-corner legacy icon (alpha), radius ~17.5%
        rounded = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        rounded.paste(s, (0, 0), rounded_mask(size, int(size * 0.175)))
        write_png(rounded, RES / bucket / "ic_launcher.png")
        # round variant
        round_img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        round_img.paste(s, (0, 0), circle_mask(size))
        write_png(round_img, RES / bucket / "ic_launcher_round.png")

    # ---- Android adaptive icon foreground layers (108dp canvas) ----
    adaptive = {
        "mipmap-mdpi": 108,
        "mipmap-hdpi": 162,
        "mipmap-xhdpi": 216,
        "mipmap-xxhdpi": 324,
        "mipmap-xxxhdpi": 432,
    }
    for bucket, size in adaptive.items():
        write_png(fg.resize((size, size), Image.LANCZOS), RES / bucket / "ic_launcher_foreground.png")

    # ---- iOS AppIcon (single universal 1024, Xcode 14+ style) ----
    ios = ROOT / "apps" / "mobile" / "ios" / "ZShell" / "Images.xcassets" / "AppIcon.appiconset"
    s = square.resize((1024, 1024), Image.LANCZOS)
    # iOS icons must be fully opaque squares (no alpha, no rounding)
    flat = Image.new("RGB", (1024, 1024), BG[:3])
    flat.paste(s, (0, 0), s)
    write_png(flat, ios / "Icon-1024.png")

    # ---- Store / listing 512 ----
    store = square.resize((512, 512), Image.LANCZOS)
    write_png(store, ROOT / "assets" / "icon-512.png")
    print("done")


if __name__ == "__main__":
    main()
