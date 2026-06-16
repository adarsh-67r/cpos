#!/usr/bin/env python3
"""Generate the CPOS companion marketing slides (store screenshots + website gallery).

Produces composited slides from raw product screenshots: a dark canvas with an
eyebrow label, headline, description, pill tags and a framed screenshot, plus the
CPOS footer. Renders at 2x (2560x1600 -> docs/shots) and downscales to 1280x800
(-> Chrome/Firefox store screenshots).

Run:  .venv-screens/bin/python tools/make_companion_slides.py
"""
import os
import glob
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DESK = os.path.expanduser("~/Desktop")

def SRC(name):
    """Resolve a Desktop screenshot by its time prefix (macOS uses a U+202F
    narrow no-break space before AM/PM, which is awkward to type)."""
    prefix = name.replace(" PM.png", "").replace(" AM.png", "")
    hits = glob.glob(os.path.join(DESK, prefix + "*.png"))
    if not hits:
        raise FileNotFoundError(name)
    return hits[0]

# ---- palette (sampled from the original slides) ----
BG       = (20, 20, 31)      # canvas
FRAME_BG = (27, 27, 43)      # screenshot tile
FRAME_LN = (42, 42, 60)      # tile border
HEAD     = (236, 235, 243)   # headline
DESC     = (138, 135, 160)   # description
EYEBROW  = (183, 148, 255)   # purple accent
PILL_BG  = (32, 32, 46)
PILL_TX  = (214, 214, 224)
FOOT_TX  = (120, 117, 140)
FOOT_R   = (110, 107, 130)

SF = "/System/Library/Fonts/SFNS.ttf"
def font(size, weight="Regular"):
    f = ImageFont.truetype(SF, size)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass
    return f

# ---- 2x geometry (canvas 2560x1600) ----
S = 2
W, H = 1280 * S, 800 * S
LEFT = 56 * S
COLW = 430 * S                     # text wrap width
FRAME = (528 * S, 56 * S, 1223 * S, 743 * S)
INSET = 20 * S
RAD_FRAME = 22 * S
RAD_SHOT = 13 * S


def wrap(draw, text, fnt, maxw):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=fnt) <= maxw:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_tracked(draw, xy, text, fnt, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + tracking
    return x


def rounded_shot(img, radius):
    img = img.convert("RGB")
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0], img.size[1]], radius, fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def make_slide(spec):
    canvas = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(canvas)

    # ---- framed screenshot (right) ----
    fx0, fy0, fx1, fy1 = FRAME
    d.rounded_rectangle([fx0, fy0, fx1, fy1], RAD_FRAME, fill=FRAME_BG, outline=FRAME_LN, width=max(1, S))
    inner = (fx0 + INSET, fy0 + INSET, fx1 - INSET, fy1 - INSET)
    iw, ih = inner[2] - inner[0], inner[3] - inner[1]

    shot = Image.open(SRC(spec["img"])).convert("RGB")
    if spec.get("crop"):
        l, t, r, b = spec["crop"]
        shot = shot.crop((l, t, shot.width - r, shot.height - b))
    scale = min(iw / shot.width, ih / shot.height)
    nw, nh = int(shot.width * scale), int(shot.height * scale)
    shot = shot.resize((nw, nh), Image.LANCZOS)
    shot = rounded_shot(shot, RAD_SHOT)
    px = inner[0] + (iw - nw) // 2
    py = inner[1] + (ih - nh) // 2
    canvas.paste(shot, (px, py), shot)

    # ---- eyebrow ----
    y = 252 * S
    f_eye = font(13 * S, "Semibold")
    draw_tracked(d, (LEFT, y), spec["eyebrow"].upper(), f_eye, EYEBROW, 3 * S)

    # ---- headline ----
    y = 288 * S
    f_head = font(52 * S, "Bold")
    for line in spec["headline"]:
        d.text((LEFT, y), line, font=f_head, fill=HEAD)
        y += 50 * S

    # ---- description ----
    y += 18 * S
    f_desc = font(19 * S, "Regular")
    for line in wrap(d, spec["desc"], f_desc, COLW):
        d.text((LEFT, y), line, font=f_desc, fill=DESC)
        y += 27 * S

    # ---- pills ----
    y += 18 * S
    f_pill = font(15 * S, "Medium")
    px = LEFT
    ph = 36 * S
    pad = 17 * S
    gap = 11 * S
    for label in spec["pills"]:
        tw = d.textlength(label, font=f_pill)
        pw = tw + pad * 2
        d.rounded_rectangle([px, y, px + pw, y + ph], ph // 2, fill=PILL_BG)
        bbox = f_pill.getbbox(label)
        th = bbox[3] - bbox[1]
        d.text((px + pad, y + (ph - th) // 2 - bbox[1]), label, font=f_pill, fill=PILL_TX)
        px += pw + gap

    # ---- footer ----
    fy = 760 * S
    r = 6 * S
    d.ellipse([LEFT, fy - r, LEFT + 2 * r, fy + r], fill=EYEBROW)
    f_foot = font(17 * S, "Bold")
    bb = f_foot.getbbox("CPOS")
    d.text((LEFT + 2 * r + 10 * S, fy - (bb[3] - bb[1]) // 2 - bb[1]), "CPOS", font=f_foot, fill=HEAD)
    f_fr = font(15 * S, "Regular")
    rt = "Companion · Codeforces & CSES · local-first"
    rw = d.textlength(rt, font=f_fr)
    bb = f_fr.getbbox(rt)
    d.text((fx1 - rw, fy - (bb[3] - bb[1]) // 2 - bb[1]), rt, font=f_fr, fill=FOOT_R)

    return canvas


SLIDES = [
    dict(name="popup", eyebrow="One hub",
         headline=["Every tool,", "one popup"],
         desc="Toggle every feature on a whim — analytics, editor, themes, reminders, practice tools. Local-first: no accounts, no servers.",
         pills=["Toggle anything", "Local-first", "Codeforces + CSES"],
         img="Screenshot 2026-06-16 at 10.07.35 PM.png"),
    dict(name="editor", eyebrow="In-browser editor",
         headline=["Code without", "leaving the tab"],
         desc="A LeetCode-style editor right on the problem page: run against samples, diff the output, then submit — all in place.",
         pills=["Run vs samples", "Diff view", "One-click submit"],
         img="Screenshot 2026-06-16 at 10.09.07 PM.png"),
    dict(name="analytics", eyebrow="Profile analytics",
         headline=["Know your", "numbers"],
         desc="Activity heatmap, streaks, solved-by-rating, tags, verdicts and languages — the charts Codeforces doesn't show.",
         pills=["52-week heatmap", "Streaks", "Tag breakdown"],
         img="Screenshot 2026-06-16 at 10.10.09 PM.png"),
    dict(name="compare", eyebrow="VS mode",
         headline=["Compare any", "handles"],
         desc="Stack profiles side by side with an overlaid rating history. See exactly where you stand.",
         pills=["Side-by-side stats", "Rating overlay"],
         img="Screenshot 2026-06-16 at 10.10.27 PM.png"),
    dict(name="modernize", eyebrow="Modernize",
         headline=["A cleaner", "Codeforces"],
         desc="A sleek font, calmer spacing and card layouts across Codeforces & CSES — with solve-status row coloring, live solve counts and a hide-solved toggle layered on top.",
         pills=["Sleek typography", "Solve-status", "Hide solved"],
         img="Screenshot 2026-06-16 at 10.08.18 PM.png",
         crop=(0, 18, 0, 0)),
]

STORE_DIRS = [os.path.join(ROOT, "extensions/chrome/store"),
              os.path.join(ROOT, "extensions/firefox/store")]
SHOTS_DIR = os.path.join(ROOT, "docs/shots")

for i, spec in enumerate(SLIDES, 1):
    big = make_slide(spec)
    # docs/shots: 2x
    big.save(os.path.join(SHOTS_DIR, f"companion-{spec['name']}.png"))
    # store: 1x
    small = big.resize((1280, 800), Image.LANCZOS)
    for sd in STORE_DIRS:
        small.save(os.path.join(sd, f"screenshot-{i}.png"))
    print(f"slide {i}: {spec['name']}")
print("done")
