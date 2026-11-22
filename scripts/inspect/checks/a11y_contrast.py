"""a11y/contrast: WCAG 2.x contrast for text as it is drawn, on its real backdrop (letters over a picture are
contrast-over-picture).

On the lossless key frames (every 15th frame), with the text shown in full (ink_measure.settled: opacity 0.9 and no mask cutting
its letters; an entrance or a wipe passes through faint frames on purpose, a slide or a push is measured), each letter is measured with ink_measure: the backdrop is the ring
round the letter's ink box, outside every letter box on the frame; the ink is the drawn pixels in the box farthest
from that backdrop (so a blend, a halftone or grain counts as drawn, and the CSS colour does not decide). The
backdrop tone a fifth of the way toward the ink (15th percentile) gives the ratio. A text fails on a frame when its
k-th lowest letter is under the limit (k: a quarter of its letters, at least 1), so one letter under a passing mark
does not decide, and text that is faint everywhere does. The limit is 4.5:1, or 3:1 for large text: 24 px regular or
18.7 px bold (weight 700) at 1x, which is the size on a 390 px wide phone.
A letter under a higher picture or panel, or in a clipped text with no ink drawn (a wipe in progress), is not measured;
the notes count those letters, so a text that is never measured is said, not passed.
APCA Lc (0.0.98G, the drawn ink on its backdrop) is reported as information. Meaningful graphics (chart marks, icons,
UI edges) at 3:1 are not measured yet.
"""
import math

import numpy as np

import ink_measure as im
from film import finding

PHONE = 390


def apca(text_rgb, bg_rgb):
    def y(c):
        c = np.asarray(c, dtype=np.float64) / 255.0
        return float(0.2126729 * c[0] ** 2.4 + 0.7151522 * c[1] ** 2.4 + 0.0721750 * c[2] ** 2.4)
    yt, yb = y(text_rgb), y(bg_rgb)
    yt = yt if yt > 0.022 else yt + (0.022 - yt) ** 1.414
    yb = yb if yb > 0.022 else yb + (0.022 - yb) ** 1.414
    if yb > yt:
        s = (yb ** 0.56 - yt ** 0.57) * 1.14
        return round(0 if s < 0.1 else (s - 0.027) * 100, 1)
    s = (yb ** 0.65 - yt ** 0.62) * 1.14
    return round(0 if s > -0.1 else (s + 0.027) * 100, 1)


def grey_of(l):
    """An sRGB grey with relative luminance l (for the APCA figure)."""
    c = l * 12.92 if l <= 0.0031308 else 1.055 * l ** (1 / 2.4) - 0.055
    v = round(255 * min(1.0, max(0.0, c)))
    return (v, v, v)


def over_picture(e_pics, tz, box):
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    return any(p["z"] < tz and p["x"] <= cx <= p["x"] + p["w"] and p["y"] <= cy <= p["y"] + p["h"] for p in e_pics)


def check(film):
    bad, unmeasured, measured_any, t_px, why_not = {}, {}, set(), {}, {}
    k = PHONE / film.W
    for f in range(0, film.n, 15):
        if not film.rec.has_png(f):
            continue
        els = film.elements(f)
        z = {e["id"]: e["z"] for e in els}
        weights = {e["id"]: e.get("fontWeight") for e in els}
        # Pictures that are not cut-outs: letters over them are contrast-over-picture's. A cut-out shows the
        # ground round its subject, so letters over its box are measured here.
        pics = [e for e in els if e["kind"] == "image" and e["opacity"] >= 0.3 and not e.get("cutout")]
        frame, mask = None, None
        for t in film.ink[f]:
            if t["opacity"] < 0.9 or not t.get("letters"):
                continue
            node = t.get("node") or film.label(t["id"])
            if not im.settled(film, f, t):
                unmeasured.setdefault(node, 0)
                why_not.setdefault(node, {})
                w = "it moves or the view moves" if not film.text_at_rest(f, t) else "a mask or a box cuts its letters"
                why_not[node][w] = why_not[node].get(w, 0) + 1
                continue
            tz = z.get(t["id"], 1e18)
            if frame is None:
                frame = np.asarray(film.rec.frame(f), dtype=np.int16)
                mask = im.letters_mask(im.letter_boxes(film.ink[f]), film.W, film.H)
            weight = int(float(weights.get(t["id"]) or 400))
            size = t["fontPx"] * k
            large = size >= 24 or (weight >= 700 and size >= 18.66)
            limit = 3.0 if large else 4.5
            ratios = []
            for g in t["letters"]:
                box = tuple(int(round(v)) for v in g[1:5])
                if over_picture(pics, tz, box):
                    continue
                if im.covered(film, f, t, box):
                    unmeasured[node] = unmeasured.get(node, 0) + 1
                    why_not.setdefault(node, {})["its letters sit under a higher picture or panel"] = why_not.get(node, {}).get("its letters sit under a higher picture or panel", 0) + 1
                    continue
                m = im.measure(frame, box, mask)
                if m is None:
                    continue
                if m["flat"] and t.get("clipped"):
                    unmeasured[node] = unmeasured.get(node, 0) + 1  # a mask hides it: a wipe in progress
                    why_not.setdefault(node, {})["a mask hides it (a wipe)"] = why_not.get(node, {}).get("a mask hides it (a wipe)", 0) + 1
                    continue
                back = im.near_backdrop(m["ring"], m["ink"])
                ratios.append((im.ratio_of(m["ink"], back), chr(g[0]), m, back))
            if not ratios:
                continue
            measured_any.add(node)
            ratios.sort(key=lambda r: r[0])
            kth = ratios[max(1, math.ceil(0.25 * len(ratios))) - 1]
            if kth[0] < limit:
                css = im.css_rgb(t)
                t_px.setdefault(node, t.get("fontPx"))
                r = bad.setdefault(node, {"frames": [], "ratio": kth[0], "limit": limit, "text": t["text"], "letter": kth[1],
                                          "ink": kth[2]["ink"], "back": kth[3], "css": css})
                r["frames"].append(f)
                if kth[0] < r["ratio"]:
                    r.update({"ratio": kth[0], "letter": kth[1], "ink": kth[2]["ink"], "back": kth[3]})
    for node, n in unmeasured.items():
        if node not in measured_any:
            # The reason the key frames give (a first-use test: an end card's name was not measured, and the note did
            # not say which of four reasons held).
            seen = why_not.get(node) or {}
            reason = "; ".join(f"{k} on {v} key frame(s)" if "letters" not in k else f"{k} ({v} letter(s))" for k, v in sorted(seen.items(), key=lambda kv: -kv[1]))
            film.notes.append({"check": "a11y/contrast", "notMeasured": node, "letters": n,
                               "why": ("not on a key frame (every 15th) in full and at rest: " + reason) if reason else
                                      "it never shows in full on a key frame (opacity 0.9 or more, at rest, no mask cutting its letters)"})
    out = []
    for node, r in bad.items():
        ink = [int(v) for v in r["ink"]]
        measured = {"ratio": round(r["ratio"], 2), "apcaLc": apca(ink, grey_of(r["back"])), "text": r["text"][:40], "letter": r["letter"], "drawnInk": ink}
        fix = "Use a text colour with more contrast against its backdrop (ink, not a muted or rule tone), or set it on a plate."
        if r["css"] is not None:
            css_ratio = (max(float(im.lum(r["css"])), r["back"]) + 0.05) / (min(float(im.lum(r["css"])), r["back"]) + 0.05)
            measured["cssRatio"] = round(css_ratio, 2)
            if css_ratio >= r["limit"]:
                # The colour passes and the drawn letters do not: thin strokes at a small size lose contrast to the edge
                # smoothing (the ink is never drawn in full), or a blend or a cover makes them fainter. A darker tone of
                # the same role cannot help when the colour is already the ink.
                px = t_px.get(node)
                fix = (f"The text's colour passes ({css_ratio:.2f}:1), but its letters draw at {r['ratio']:.2f}:1: thin strokes"
                       f"{f' at {px:.0f} px' if px else ''} lose contrast to the edge smoothing. Set the text larger or heavier"
                       " (a larger role, or a heavier weight of the role); if a blend or a cover sits over it, remove that.")
        out.append(finding("a11y/contrast", "error", film.t(r["frames"][0]), film.t(r["frames"][-1]), measured, {"min": r["limit"]}, fix, node=node))
    return out
