"""text-crossed: text crossed by a line, an outline or a small mark while both rest. Hard rule: text never
overlaps text, a line or a mark. (transit-collision is the same rule for elements in motion; this one is at rest.)

Data: the capture's shape geometry (detect.ts records every visible SVG shape in screen px: a stroke as a polyline
sampled every 4 px and cut to the part a reveal shows, a fill as its box) and each text's letter ink boxes (sent
whenever the text's ink changes, carried forward between). Every frame is checked.
Not checked on HyperFrames films: detect.ts captures shapes and letters only from the films module's player page.
At a frame f, a text and a shape are at rest when the text's ink and the shape's geometry are the same at
f and at f + 0.2 s. Then:
  stroke  the stroke polyline, inflated by half its stroke width, enters a letter's ink box (shrunk by 1 px, so a
          leader that ends on the label's edge does not count). A finding when it enters 2 letters or more, or over
          20 % of the text's ink width.
  mark    a small filled shape (under 1 % of the frame: a dot, an arrowhead, a tick) whose box overlaps a letter's
          ink by 2 px or more each way.
Not findings: shapes of the text's own block (its underline, strike or highlight band: the shape's data-el label
starts with the text's block id); a filled shape that holds the whole text (a plate or panel); the ground, texture
and grid layers (a data-el label with "grid"); strokes with contrast under 1.3:1 against the ground (a faint
background grid). Shape against shape (a chain through a ring) is not measured.
"""
import re

import numpy as np

from common import parse_rgb
from contrast_over_picture import lum
from film import finding

MIN_LETTERS, MIN_SHARE, MIN_CONTRAST = 2, 0.20, 1.3
HOLD = 0.2


def block_of(node):
    """The block id of a text node: its label without the trailing line and word indexes (title-0 -> title)."""
    return re.sub(r"(-(p|w|l|c)?\d+)+$", "", node or "")


def contrast(rgb, ground):
    a, b = float(lum(np.array(rgb))), float(lum(np.array(ground)))
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def check(film):
    sh = film.cap.get("shapes")
    if not sh:
        from film import Skip
        raise Skip("the capture has no shape geometry (captured before text-crossed existed)")
    geoms = [np.asarray(g, dtype=np.float64).reshape(-1, 2) for g in sh["geoms"]]
    frames = sh["frames"]
    ground = film.ground
    lag = max(1, round(HOLD * film.fps))
    area = film.W * film.H
    found = {}
    for f in range(0, film.n - lag):
        later = {(t["id"]): t["ink"] for t in film.ink[f + lag]}
        later_shapes = {(s["id"], s.get("g"), tuple(s["box"])) for s in frames[f + lag]}
        for t in film.ink[f]:
            if t["opacity"] < 0.5 or not t.get("letters") or later.get(t["id"]) != t["ink"]:
                continue
            node = t.get("node") or film.label(t["id"])
            block = block_of(node)
            tx0, ty0, tx1, ty1 = t["ink"]
            width = max(1.0, tx1 - tx0)
            letters = [g[1:5] for g in t["letters"]]
            for s in frames[f]:
                if (s["id"], s.get("g"), tuple(s["box"])) not in later_shapes:
                    continue  # the shape moves: transit-collision's business
                sid = s["id"]
                if block and sid.startswith(block):
                    continue
                if "grid" in sid.lower() or s.get("layer") in ("ground", "texture"):
                    continue
                bx0, by0, bx1, by1 = s["box"]
                if bx1 < tx0 or bx0 > tx1 or by1 < ty0 or by0 > ty1:
                    continue
                hit_letters, span, kind, depth = 0, 0.0, None, 0.0
                if s.get("stroke") and s.get("g") is not None:
                    col = parse_rgb(s["stroke"])
                    if col is not None and contrast(col, ground) < MIN_CONTRAST:
                        continue
                    pts = geoms[s["g"]]
                    if len(pts):
                        r = s.get("width", 1) / 2
                        xs_in = []
                        for (a, b, c, d) in letters:
                            a, b, c, d = a + 1 - r, b + 1 - r, c - 1 + r, d - 1 + r
                            inside = (pts[:, 0] > a) & (pts[:, 0] < c) & (pts[:, 1] > b) & (pts[:, 1] < d)
                            if inside.any():
                                hit_letters += 1
                                xs_in += list(pts[inside, 0])
                                depth += 4.0 * int(inside.sum())  # the stroke's length inside letter ink, px
                        if xs_in:
                            span = (max(xs_in) - min(xs_in) + 2 * r) / width
                        kind = "stroke"
                        if not (hit_letters >= MIN_LETTERS or span > MIN_SHARE):
                            hit_letters = 0
                if not hit_letters and s.get("fill"):
                    # A plate or panel that holds the whole text is a backdrop, not a crossing.
                    if bx0 <= tx0 + 1 and by0 <= ty0 + 1 and bx1 >= tx1 - 1 and by1 >= ty1 - 1:
                        continue
                    if (bx1 - bx0) * (by1 - by0) >= 0.01 * area:
                        continue
                    for (a, b, c, d) in letters:
                        ox, oy = min(c, bx1) - max(a, bx0), min(d, by1) - max(b, by0)
                        if ox >= 2 and oy >= 2:
                            hit_letters += 1
                            depth = max(depth, min(ox, oy))
                    kind = "mark"
                if hit_letters:
                    key = (node, sid)
                    r_ = found.setdefault(key, {"frames": [], "letters": 0, "span": 0.0, "kind": kind, "text": t["text"], "px": 0.0})
                    r_["frames"].append(f)
                    r_["letters"] = max(r_["letters"], hit_letters)
                    r_["span"] = max(r_["span"], span)
                    r_["px"] = max(r_["px"], depth)
    out = []
    for (node, sid), r in found.items():
        out.append(finding("text-crossed", "error", film.t(r["frames"][0]), film.t(r["frames"][-1] + lag),
                           {"text": r["text"][:40], "shape": sid, "by": r["kind"], "letters": r["letters"], "shareOfWidth": round(r["span"], 2), "overlapPx": round(r["px"], 1)},
                           {"letters": MIN_LETTERS, "shareOfWidth": MIN_SHARE},
                           "Move the label clear of the line (the callout block places a label with a leader), or break the line under the label.",
                           node=f"{node} x {sid}"))
    return out
