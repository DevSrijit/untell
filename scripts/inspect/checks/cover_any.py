"""cover (every node kind): text hidden under something drawn above it.

scripts/inspect/cover.py judges type behind a cut-out. This module judges type under every other node kind: a 3D
canvas, a photo or clip, a shape, a panel. Draw order comes from the recording (each element's z); what hides a
letter comes from the rendered pixels. For each visible text (opacity 0.5) on each frame, every element drawn above
it (higher z, opacity 0.5, not a cut-out: cover.py has those) whose box crosses the text's ink is read:
  box or panel with a fill   it hides the part of each letter's ink box under its box;
  picture, canvas            it hides the pixels of each letter's ink box that it draws: in the rendered frame they
                             are neither the text's colour nor the colour under the text (its plate), within NEAR
                             levels on each channel.
An element that moves on that frame (a wipe sweeping across the text) is a transition and is not read.
The verdict is the one in cover_rule.py (a letter over 30 % hidden, or the word over 15 %), the same as for a
cut-out. One finding for each text and each element over it, over the frames where the verdict fails.
Not measured: the scene's SVG shape layer. It is one element (one z) that holds every shape, some under the text and
some over it, so its draw order says nothing about one shape; a shape over text is shape-crossed's.
"""
import numpy as np

import cover_rule
from film import finding

NEAR = 48
# Advice: no real case on the reels or agents' films yet (6 judged before the moving-element rule: all transitions).
MIN_FRAMES = 2


def rgb_of(s):
    import re
    m = re.findall(r"[\d.]+", s or "")
    return np.array([float(v) for v in m[:3]]) if len(m) >= 3 else None


def wipes(film):
    """The labels of the nodes a wipe drew: a wipe covers the frame on purpose (the cut between two scenes)."""
    return {n.get("id") for n in film.nodes if isinstance(n, dict) and n.get("block") == "wipe"}


def check(film):
    _w = wipes(film)
    wipe = lambda label: label in _w
    from PIL import Image
    runs = {}
    frame_cache = {}

    def frame(f):
        if f not in frame_cache:
            frame_cache.clear()
            frame_cache[f] = np.asarray(Image.open(film.rec.dir / "frames" / f"f{f:04d}.jpg").convert("RGB"), dtype=np.int16)
        return frame_cache[f]
    prev = {}
    for f in range(film.n):
        els = film.elements(f)
        by_id = {e["id"]: e for e in els}
        # An element that moves over the text (a wipe sweeping across, a panel sliding through) is a transition, not a
        # cover: only an element at rest on this frame and the one before hides a letter.
        moving = {e["id"] for e in els if e["id"] in prev and any(abs(e[k] - prev[e["id"]][k]) >= 1 for k in ("x", "y", "w", "h"))}
        prev = by_id
        for t in film.ink[f]:
            if t["opacity"] < 0.5 or not t.get("letters"):
                continue
            te = by_id.get(t["id"])
            if te is None or te.get("z") is None:
                continue
            x0, y0, x1, y1 = t["ink"]
            above = [e for e in els if e is not te and e["id"] not in moving and e["kind"] in ("image", "box") and (e.get("z") or 0) > te["z"]
                     and e["opacity"] >= 0.5 and not e.get("cutout") and e["layer"] == "content" and not wipe(film.label(e["id"]))
                     and e["x"] < x1 and e["x"] + e["w"] > x0 and e["y"] < y1 and e["y"] + e["h"] > y0]
            if not above:
                continue
            ink_c, plate_c = rgb_of(t.get("color")), rgb_of(t.get("plate"))
            for e in above:
                letters = []
                for g in t["letters"]:
                    ch, lx0, ly0, lx1, ly1 = chr(g[0]) if isinstance(g[0], int) else str(g[0]), *g[1:5]
                    area = max(1.0, (lx1 - lx0) * (ly1 - ly0))
                    ox0, oy0 = max(lx0, e["x"]), max(ly0, e["y"])
                    ox1, oy1 = min(lx1, e["x"] + e["w"]), min(ly1, e["y"] + e["h"])
                    if ox1 <= ox0 or oy1 <= oy0:
                        letters.append((ch, 0.0, area))
                        continue
                    if e["kind"] == "box" and e.get("fill") and "rgba(0, 0, 0, 0)" not in e["fill"] and e["fill"] != "transparent":
                        letters.append((ch, (ox1 - ox0) * (oy1 - oy0) / area, area))
                        continue
                    if ink_c is None or plate_c is None:
                        letters.append((ch, 0.0, area))
                        continue
                    px = frame(f)[int(oy0):int(np.ceil(oy1)), int(ox0):int(np.ceil(ox1))].reshape(-1, 3)
                    if not len(px):
                        letters.append((ch, 0.0, area))
                        continue
                    other = (np.abs(px - ink_c).max(axis=1) > NEAR) & (np.abs(px - plate_c).max(axis=1) > NEAR)
                    letters.append((ch, float(other.sum()) / area, area))
                v = cover_rule.judge(letters)
                if v["fails"]:
                    key = (t.get("node") or film.label(t["id"]), film.label(e["id"]))
                    runs.setdefault(key, []).append((f, v, t["text"], e["kind"]))
    out = []
    for (node, over), hs in runs.items():
        if len(hs) < MIN_FRAMES:
            continue
        worst = max(hs, key=lambda h: h[1]["word"])
        out.append(finding("cover", "advice", film.t(hs[0][0]), film.t(hs[-1][0]),
                           {"rule": "+".join(worst[1]["fails"]), "worst": worst[1]["word"], "detail": worst[1]["detail"], "text": worst[2][:30],
                            "over": over, "overKind": worst[3], "frames": len(hs), "atFrame": worst[0]},
                           {"letter": cover_rule.LETTER_MAX, "word": cover_rule.WORD_MAX},
                           f"{over} ({worst[3]}) is drawn over \"{worst[2][:30]}\" and hides its letters: move the text clear of it (lineAbove the subject's "
                           "largest extent), frame the subject with room, or put the text above it in the draw order.",
                           node=node))
    return out
