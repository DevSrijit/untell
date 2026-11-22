"""contrast-over-picture: text over a picture must contrast with the real pixels under each letter.

On the lossless key frames (every 15th frame), for each text shown in full (ink_measure.settled) whose box overlaps a picture drawn under it
(lower z), each letter's ink box (from the capture) is read from the frame. The ink is the colour as drawn
(ink_measure.drawn_over_picture: the box's pixels near the CSS colour, or, when a blend or a grade moved them, the
pixels farthest from the backdrop). The background is the ring round the letter (outside every letter box) and the
pixels in the box far from the drawn ink; its tone closest to the ink (85th percentile toward it) gives the WCAG
ratio. Under 4.5:1 (3:1 for display and headline) is a finding.
"""
import numpy as np

import ink_measure as im
from common import parse_rgb
from film import finding

LIMITS = {"display": 3.0, "headline": 3.0}
DEFAULT = 4.5


lum = im.lum


def check(film):
    bad, skipped, measured = {}, set(), set()
    for f in range(0, film.n, 15):
        if not film.rec.has_png(f):
            continue
        els = film.elements(f)
        z = {e["id"]: e["z"] for e in els}
        pics = [e for e in els if e["kind"] == "image" and e["opacity"] >= 0.3 and not e.get("cutout")]
        if not pics:
            continue
        frame, mask = None, None
        for t in film.ink[f]:
            if t["opacity"] < 0.5 or not t.get("letters"):
                continue
            x0, y0, x1, y1 = t["ink"]
            tz = z.get(t["id"], 1e18)
            under = [p for p in pics if p["z"] < tz and p["x"] < x1 and p["x"] + p["w"] > x0 and p["y"] < y1 and p["y"] + p["h"] > y0]
            if not under:
                continue
            node = t.get("node") or film.label(t["id"])
            if not im.settled(film, f, t):
                skipped.add(node)
                continue
            measured.add(node)
            col = parse_rgb(t["color"])
            if col is None:
                continue
            if frame is None:
                frame = np.asarray(film.rec.frame(f), dtype=np.int16)
                mask = im.letters_mask(im.letter_boxes(film.ink[f]), film.W, film.H)
            role = t.get("role") or film.role_of(t["fontPx"]) or "body"
            limit = LIMITS.get(role, DEFAULT)
            worst = None
            for g in t["letters"]:
                a, b, c, d = [int(round(v)) for v in g[1:5]]
                a, b, c, d = max(0, a), max(0, b), min(film.W, c), min(film.H, d)
                if c - a < 2 or d - b < 2:
                    continue
                if not any(p["x"] <= (a + c) / 2 <= p["x"] + p["w"] and p["y"] <= (b + d) / 2 <= p["y"] + p["h"] for p in under):
                    continue
                drawn = im.drawn_over_picture(frame, (a, b, c, d), mask, col)
                if drawn is None:
                    continue
                ink, bg = drawn
                lt = float(lum(ink))
                lb = lum(bg)
                near = float(np.percentile(lb, 85 if lt > np.median(lb) else 15))
                ratio = (max(lt, near) + 0.05) / (min(lt, near) + 0.05)
                if worst is None or ratio < worst[0]:
                    worst = (ratio, chr(g[0]))
            if worst and worst[0] < limit:
                node = t.get("node") or film.label(t["id"])
                r = bad.setdefault(node, {"frames": [], "ratio": worst[0], "letter": worst[1], "limit": limit, "text": t["text"]})
                r["frames"].append(f)
                if worst[0] < r["ratio"]:
                    r["ratio"], r["letter"] = worst
    for node in sorted(skipped - measured):
        film.notes.append({"check": "contrast-over-picture", "notMeasured": node, "why": "over a picture, but never shown in full on a key frame (it fades or wipes the whole time)"})
    return [finding("contrast-over-picture", "error", film.t(r["frames"][0]), film.t(r["frames"][-1]),
                    {"ratio": round(r["ratio"], 2), "letter": r["letter"], "text": r["text"][:40]}, {"min": r["limit"]},
                    "Dim or grade the picture under the text, move the text to a calm part of the picture, or put it on a plate.", node=node)
            for node, r in bad.items()]
