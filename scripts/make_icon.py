"""LTTV launcher art: a green screen-with-chat-tail mark holding a play triangle.

Usage: python3 scripts/make_icon.py android/app/src/main/res   (needs Pillow and Ubuntu Bold)
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

GREEN = (22, 163, 74)
GREEN_LIGHT = (74, 222, 128)
BG_TOP = (24, 26, 31)
BG_BOTTOM = (10, 11, 14)
FONT = "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf"
SS = 4  # supersampling factor


def vertical_gradient(w, h, top, bottom):
    img = Image.new("RGB", (w, h), top)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def draw_mark(d, cx, cy, size):
    """Screen (rounded rect outline) with a chat-bubble tail at bottom-left and a play triangle."""
    w, h = size, size * 0.74
    x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
    stroke = size * 0.11
    r = size * 0.2
    d.rounded_rectangle([x0, y0, x1, y1], radius=r, outline=GREEN, width=round(stroke))
    # Chat tail: a small triangle hanging from the lower-left edge.
    tx = x0 + w * 0.22
    d.polygon([(tx, y1 - stroke * 0.5), (tx + w * 0.2, y1 - stroke * 0.5), (tx - w * 0.02, y1 + h * 0.3)], fill=GREEN)
    # Play triangle, optically centred (nudged right).
    ph = h * 0.42
    px = cx + w * 0.04
    d.polygon([(px - ph * 0.45, cy - ph / 2), (px - ph * 0.45, cy + ph / 2), (px + ph * 0.55, cy)], fill=GREEN_LIGHT)


def glow(img, cx, cy, radius, color, alpha):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=color + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.5))
    return Image.alpha_composite(img.convert("RGBA"), layer)


def icon(px):
    """Square launcher icon: the mark on the left and the LTTV wordmark on the right, like the
    banner (the Fire TV apps grid only shows this square icon for sideloaded apps)."""
    S = px * SS
    img = vertical_gradient(S, S, BG_TOP, BG_BOTTOM)
    img = glow(img, S * 0.27, S / 2, S * 0.26, GREEN, 70)
    d = ImageDraw.Draw(img)
    draw_mark(d, S * 0.26, S * 0.47, S * 0.34)
    font = ImageFont.truetype(FONT, round(S * 0.2))
    total = d.textlength("LTTV", font=font)
    # Centre the word in the space right of the mark.
    left, right = S * 0.46, S * 0.95
    x = left + (right - left - total) / 2
    d.text((x, S * 0.5), "LTTV", font=font, fill=GREEN, anchor="lm")
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out.resize((px, px), Image.LANCZOS)


def banner(w=320, h=180):
    W, H = w * SS, h * SS
    img = vertical_gradient(W, H, BG_TOP, BG_BOTTOM)
    img = glow(img, W * 0.27, H * 0.5, H * 0.42, GREEN, 60)
    d = ImageDraw.Draw(img)
    draw_mark(d, W * 0.27, H * 0.47, H * 0.5)
    font = ImageFont.truetype(FONT, round(H * 0.3))
    text_x, base_y = W * 0.47, H * 0.5
    d.text((text_x, base_y), "LTTV", font=font, fill=GREEN, anchor="lm")
    return img.convert("RGB").resize((w, h), Image.LANCZOS)


if __name__ == "__main__":
    res = sys.argv[1]
    banner().save(f"{res}/drawable/banner.png")
    for folder, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        os.makedirs(f"{res}/mipmap-{folder}", exist_ok=True)
        icon(px).save(f"{res}/mipmap-{folder}/ic_launcher_green.png")
