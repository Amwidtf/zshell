"""Generate ZShell launcher icons (Android legacy + adaptive, store 512).

Design: dark gradient background (#1B1B1E -> #101013), bold white geometric
"Z" + accent-blue terminal cursor underscore — "Z + shell". Pre-release
channels get a corner badge: an accent rounded square with a dot-matrix
"A" (alpha) or "B" (beta). All shapes are procedural polygons/dot matrices,
no fonts involved, so output is deterministic across machines.

Usage: uv run --with pillow python scripts/gen-icon.py [--badge alpha|beta|none]
"""
import argparse
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "apps" / "mobile" / "android" / "app" / "src" / "main" / "res"

BG_TOP = (32, 32, 36, 255)       # subtle vertical gradient, top
BG_BOTTOM = (15, 15, 18, 255)    # bottom
GLYPH_MAIN = (238, 238, 238, 255)  # colors.text #eeeeee
GLYPH_CURSOR = (79, 156, 255, 255)  # colors.accent #4f9cff
BADGE_BG = (79, 156, 255, 255)
BADGE_FG = (255, 255, 255, 255)

BASE = 1024  # master canvas


def draw_glyph(draw: ImageDraw.ImageDraw, size: int, ox: float = 0.0, oy: float = 0.0) -> None:
    """Draw "Z_" on a size x size canvas. ox/oy shift in fraction of size."""

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


def draw_badge(draw: ImageDraw.ImageDraw, size: int, badge: str) -> None:
    """Accent rounded square with a bold stroke-drawn channel letter, placed
    top-right of the glyph layer (away from the blue cursor, and inside the
    circular mask after the 66% adaptive downscale)."""
    box = 0.20
    left, top = 1.0 - box - 0.12, 0.12
    draw.rounded_rectangle(
        [left * size, top * size, (left + box) * size, (top + box) * size],
        radius=box * size * 0.26,
        fill=BADGE_BG,
    )
    px0, py0 = left * size, top * size
    side = box * size
    pad = side * 0.27
    x0, x1 = px0 + pad, px0 + side - pad
    y0, y1 = py0 + pad, py0 + side - pad
    xm = (x0 + x1) / 2
    line_w = max(2, int(side * 0.115))
    if badge == "alpha":
        draw.line([(x0, y1), (xm, y0), (x1, y1)], fill=BADGE_FG, width=line_w, joint="curve")
        cb_y = y0 + (y1 - y0) * 0.60
        inset = (x1 - x0) * 0.22
        draw.line([(x0 + inset, cb_y), (x1 - inset, cb_y)], fill=BADGE_FG, width=line_w)
    else:  # beta
        draw.line([(x0, y0), (x0, y1)], fill=BADGE_FG, width=line_w)
        r = (y1 - y0) * 0.28
        for cy in (y0 + r * 0.9, y1 - r * 0.9):
            draw.pieslice(
                [xm - r * 0.4, cy - r, xm + r * 1.6, cy + r],
                start=-90, end=90, fill=BADGE_FG,
            )


def glyph_layer(badge: str) -> Image.Image:
    """Transparent layer: Z_ glyph (nudged up-left when badged) + badge."""
    layer = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    shift_x = 0.01 if badge != "none" else 0.0
    shift_y = -0.02 if badge != "none" else 0.0
    draw_glyph(draw, BASE, ox=shift_x, oy=shift_y)
    if badge != "none":
        draw_badge(draw, BASE, badge)
    return layer


def gradient_bg(size: int) -> Image.Image:
    col = Image.new("RGBA", (1, size))
    for y in range(size):
        t = y / (size - 1)
        col.putpixel(
            (0, y),
            tuple(round(a + (b - a) * t) for a, b in zip(BG_TOP[:3], BG_BOTTOM[:3])) + (255,),
        )
    return col.resize((size, size))


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


def scaled(layer: Image.Image, factor: float) -> Image.Image:
    """Scale a layer around the canvas center (adaptive-icon safe zone)."""
    out = Image.new("RGBA", (BASE, BASE), (0, 0, 0, 0))
    size = int(BASE * factor)
    resized = layer.resize((size, size), Image.LANCZOS)
    offset = (BASE - size) // 2
    out.alpha_composite(resized, (offset, offset))
    return out


def make_square_master(badge: str) -> Image.Image:
    img = gradient_bg(BASE)
    img.alpha_composite(glyph_layer(badge))
    return img


def make_foreground_master(badge: str) -> Image.Image:
    return scaled(glyph_layer(badge), 0.66)


def write_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG")
    print(f"wrote {path.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--badge", choices=["alpha", "beta", "none"], default="none",
        help="channel badge for pre-release builds")
    badge = parser.parse_args().badge

    square = make_square_master(badge)
    fg = make_foreground_master(badge)

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

    # ---- Store / listing 512 (an iOS icon set is added when an iOS shell exists) ----
    store = square.resize((512, 512), Image.LANCZOS)
    write_png(store, ROOT / "assets" / "icon-512.png")
    print("done")


if __name__ == "__main__":
    main()
