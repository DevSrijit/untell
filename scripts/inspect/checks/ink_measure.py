"""The contrast of a letter as it is drawn: the measure that a11y/contrast, contrast-over-picture and type-over-media share.

Why it exists: the first measure took the text colour from the capture (CSS `color`) and called "backdrop" the
pixels in the letter's own ink box that were far from that colour. Two cases broke it:
  - A narrow glyph (".", "l", "I", "1", "–", "'") fills its ink box: the box holds no backdrop. Grain, JPEG noise
    or anti-aliasing then made the letter's own lighter pixels the "backdrop", and black type on paper measured
    1.1:1 (the Riso example film, Graphite's headlines, Courtside's grey label).
  - A blend (multiply) draws a colour that is not the CSS colour: light ink multiplied onto a black block is
    invisible, but its CSS colour against the block reads 16:1.
This measure reads both tones from the pixels:
  backdrop  the ring round the letter: RING px wide, starting GAP px outside its ink box, minus every letter box of
            every text on the frame (dilated by GAP px, so anti-aliased edges and a 1-3 px misregistration of a
            Riso ink do not count). The ring always holds backdrop, even for a glyph that fills its box.
  ink       the pixels in the letter's ink box farthest from the backdrop's median (at least INK_SHARE of the
            98th-percentile distance), averaged by median. When the letter is drawn as faint as its backdrop,
            "ink" is the backdrop's own grain, and the ratio comes out near 1: a finding, never a skip.
A letter is not measured, and the caller notes it, when its centre is covered by a higher element (a cut-out, a
panel), or when the text is clipped by a mask and the box shows no ink (a wipe in progress).
"""
import numpy as np

from common import parse_rgb

GAP, RING = 2, 4
INK_SHARE = 0.7
FLAT = 10  # 98th-percentile distance from the backdrop under this: no ink is drawn in the box


def lum(rgb):
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def wcag(a, b):
    la, lb = float(lum(a)), float(lum(b))
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def letter_boxes(ink_frame):
    """Every letter box of every text on a frame, as int (x0, y0, x1, y1)."""
    out = []
    for t in ink_frame:
        for g in t.get("letters") or []:
            out.append(tuple(int(round(v)) for v in g[1:5]))
    return out


def letters_mask(boxes, W, H, grow=GAP):
    m = np.zeros((H, W), dtype=bool)
    for a, b, c, d in boxes:
        m[max(0, b - grow):max(0, min(H, d + grow)), max(0, a - grow):max(0, min(W, c + grow))] = True
    return m


def measure(frame, box, mask):
    """The drawn ink and the backdrop of one letter. frame: (H, W, 3) int16; box: (x0, y0, x1, y1); mask: letters_mask.
    Returns None when the box is too small or no backdrop shows round it, else a dict:
      ink      the drawn ink colour (rgb)
      ring     the backdrop pixels round the letter (n, 3)
      flat     True when nothing in the box differs from the backdrop (no ink drawn, or ink as faint as the ground)
      spread   the 98th-percentile distance of the box's pixels from the backdrop's median"""
    H, W = frame.shape[:2]
    a, b, c, d = box
    a, b, c, d = max(0, a), max(0, b), min(W, c), min(H, d)
    if c - a < 1 or d - b < 1:
        return None
    o = GAP + RING
    A, B, C, D = max(0, a - o), max(0, b - o), min(W, c + o), min(H, d + o)
    region = frame[B:D, A:C]
    ring = region[~mask[B:D, A:C]]
    if len(ring) < 12:
        return None
    med = np.median(ring, axis=0)
    px = frame[b:d, a:c].reshape(-1, 3)
    dist = np.abs(px - med).max(axis=1)
    spread = float(np.percentile(dist, 98))
    sel = px[dist >= INK_SHARE * spread] if spread > 0 else px
    ink = np.median(sel, axis=0)
    return {"ink": ink, "ring": ring, "flat": spread < FLAT, "spread": spread}


def drawn_over_picture(frame, box, mask, css):
    """Over a picture the ring's median is no single backdrop, so the drawn ink is found from the CSS colour:
    the box's pixels within NEAR_CSS of it (at least INK_MIN of the box). When fewer are near it (a blend or a grade
    moved the colour), the ink is measure()'s. Returns (ink, background pixels) or None. The background is the ring
    and the box's pixels over 60 levels from the drawn ink; it must hold 20 % of the box's size."""
    m = measure(frame, box, mask)
    if m is None:
        return None
    H, W = frame.shape[:2]
    a, b, c, d = max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3])
    px = frame[b:d, a:c].reshape(-1, 3)
    near = px[np.abs(px - np.asarray(css)).max(axis=1) <= NEAR_CSS] if css is not None else px[:0]
    ink = np.median(near, axis=0) if len(near) >= INK_MIN * len(px) else m["ink"]
    bg = np.concatenate([px[np.abs(px - ink).max(axis=1) > 60], m["ring"]])
    if len(bg) < 0.2 * len(px):
        return None
    return ink, bg


NEAR_CSS, INK_MIN = 40, 0.05


def near_backdrop(ring, ink, pct=15):
    """The backdrop tone nearest the ink: the pct-th percentile of the ring's luminance toward the ink. Ring pixels
    nearer the ink than 0.4 of the way to the ring's median are ink that spills past a too-small glyph box (the
    font's metrics and the drawn glyph can differ, as for a tabular "1"): they do not count."""
    ref = float(np.abs(np.median(ring, axis=0) - ink).max())
    if ref > FLAT:
        keep = ring[np.abs(ring - ink).max(axis=1) >= 0.4 * ref]
        ring = keep if len(keep) >= 12 else ring
    lr = lum(ring)
    li = float(lum(ink))
    return float(np.percentile(lr, pct if li < np.median(lr) else 100 - pct))


def ratio_of(ink, back_lum):
    li = float(lum(ink))
    return (max(li, back_lum) + 0.05) / (min(li, back_lum) + 0.05)


def covered(film, f, t, box):
    """True when the letter's centre lies under a higher element that is not text (a cut-out, a panel) at opacity 0.5."""
    els = film.elements(f)
    tz = next((e["z"] for e in els if e["id"] == t["id"]), None)
    if tz is None:
        return False
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    for e in els:
        solid = e["kind"] == "image" or (e["kind"] == "box" and e.get("fill") not in (None, "transparent", "rgba(0, 0, 0, 0)"))
        if e["z"] > tz and solid and e["opacity"] >= 0.5 and e.get("layer") == "content" \
                and e["x"] <= cx <= e["x"] + e["w"] and e["y"] <= cy <= e["y"] + e["h"]:
            return True
    return False


def settled(film, f, t):
    """True when the text shows in full and at rest: at opacity 0.9 or more, no mask or box cuts its letters (its ink is
    at least 90 % of its x-height tall, and the capture's raw ink, when it has one, is not taller than its visible ink),
    and film.text_at_rest (it does not move, the view does not move, no blur track is on: a whip pan's motion blur is
    the system's own move, not the text's contrast). An entrance, a slide or a whip is not measured until it lands."""
    if t["opacity"] < 0.9 or not film.text_at_rest(f, t):
        return False
    h = t["ink"][3] - t["ink"][1]
    if t.get("xh") and h < 0.9 * t["xh"]:
        return False
    raw = t.get("raw")
    return not (raw and (raw[3] - raw[1]) - h > 2)


def css_rgb(t):
    return parse_rgb(t.get("color"))
