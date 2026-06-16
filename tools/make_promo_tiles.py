#!/usr/bin/env python3
"""Generate the Chrome Web Store promo tiles for CPOS Companion.

  - Small promo tile:   440 x 280
  - Marquee promo tile: 1400 x 560

Both are 24-bit PNG (RGB, no alpha) as the store requires. Brand-matched to the
companion slides (tools/make_companion_slides.py): dark canvas, pixel-C logo,
purple accent, pill tags.

Run:  .venv-screens/bin/python tools/make_promo_tiles.py
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, "extensions/chrome/store")
FFSTORE = os.path.join(ROOT, "extensions/firefox/store")
LOGO = os.path.join(ROOT, "extensions/chrome/icons/icon128.png")

BG      = (20, 20, 31)
HEAD    = (236, 235, 243)
DESC    = (150, 147, 170)
EYEBROW = (183, 148, 255)
PILL_BG = (32, 32, 46)
PILL_TX = (214, 214, 224)

SF = "/System/Library/Fonts/SFNS.ttf"
def font(size, weight="Regular"):
    f = ImageFont.truetype(SF, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f


def logo(size):
    im = Image.open(LOGO).convert("RGBA").resize((size, size), Image.LANCZOS)
    return im


def tracked(d, xy, text, fnt, fill, tracking):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=fnt, fill=fill)
        x += d.textlength(ch, font=fnt) + tracking
    return x


def pills(d, x, y, labels, fnt, h=34, pad=15, gap=10):
    for label in labels:
        w = d.textlength(label, font=fnt) + pad * 2
        d.rounded_rectangle([x, y, x + w, y + h], h // 2, fill=PILL_BG)
        bb = fnt.getbbox(label)
        d.text((x + pad, y + (h - (bb[3] - bb[1])) // 2 - bb[1]), label, font=fnt, fill=PILL_TX)
        x += w + gap


def small_tile():
    W, H = 440, 280
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    lg = logo(76)
    im.paste(lg, ((W - 76) // 2, 44), lg)
    f_word = font(38, "Bold")
    tw = d.textlength("CPOS", font=f_word)
    d.text(((W - tw) // 2, 138), "CPOS", font=f_word, fill=HEAD)
    f_tag = font(15, "Medium")
    tag = "Companion for Codeforces & CSES"
    d.text(((W - d.textlength(tag, font=f_tag)) // 2, 188), tag, font=f_tag, fill=DESC)
    f_eye = font(12, "Semibold")
    eb = "LOCAL-FIRST"
    ebw = sum(d.textlength(c, font=f_eye) + 2 for c in eb) - 2
    tracked(d, ((W - ebw) // 2, 224), eb, f_eye, EYEBROW, 2)
    return im


def marquee_tile():
    W, H = 1400, 560
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    # left text column
    x = 96
    f_eye = font(17, "Semibold")
    tracked(d, (x, 150), "BROWSER COMPANION", f_eye, EYEBROW, 4)
    f_head = font(58, "Bold")
    d.text((x, 190), "Code, analyze, submit —", font=f_head, fill=HEAD)
    d.text((x, 256), "without leaving the tab.", font=f_head, fill=HEAD)
    f_desc = font(21, "Regular")
    d.text((x, 340), "Capture & submit, an in-browser editor, profile analytics", font=f_desc, fill=DESC)
    d.text((x, 370), "and themes for Codeforces & CSES. Local-first.", font=f_desc, fill=DESC)
    pills(d, x, 420, ["In-browser editor", "Profile analytics", "Local-first"], font(16, "Medium"), h=38, pad=17, gap=12)
    # right: large logo
    lg = logo(232)
    im.paste(lg, (W - 232 - 150, (H - 232) // 2), lg)
    return im


os.makedirs(STORE, exist_ok=True)
small = small_tile()
marquee = marquee_tile()
for d in (STORE, FFSTORE):
    small.save(os.path.join(d, "promo-small-440x280.png"))
    marquee.save(os.path.join(d, "promo-marquee-1400x560.png"))
print("wrote promo-small-440x280.png and promo-marquee-1400x560.png to chrome + firefox store/")
