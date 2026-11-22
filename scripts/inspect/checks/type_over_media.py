"""type-over-media: type that cannot be read over pictures or footage, and type that cannot be read in time.

Over a picture (a photo, clip or 3D canvas drawn under the text), on every third frame the text shows in full (ink_measure.settled):
  worst     the WCAG contrast of each letter as drawn against the real pixels behind it (ink_measure: the
            letter's own ink box, or the text's ink box cut into one column per letter when the capture has no
            letters; the drawn ink, the ring round the letter and the box's pixels far from the ink); the WORST
            frame is reported, since footage moves under text
  busy      the share of backdrop pixels round the text (its ink box grown by half its cap height, minus every
            letter box grown by 3 px, so the letters' own edges never count) with a local grey gradient over BUSY_GRAD
            levels; over BUSY_SHARE the text needs a plate, a dimmed plate or a calmer region, even when the
            contrast passes
For all text (reading time is not here: density.py's reading-time rule holds each text for the system's time per word):
  line      a line over 45 characters at 9:16
  lines     more than 3 lines of body text on screen at once (lines_of: texts side by side on one line count once)
  thin      a light face (weight under 300) under 24 px at 1080 px wide
Not measured: tracking (the recorder does not keep letter-spacing).
"""
import numpy as np

import ink_measure as im
from common import parse_rgb
from contrast_over_picture import LIMITS, DEFAULT, lum
from film import finding

BUSY_GRAD, BUSY_SHARE = 40, 0.18
LINE_MAX, BODY_LINES = 45, 3


def lines_of(spans):
    """The lines that ink spans (top, bottom) make: two spans are on one line when they overlap by half the shorter
    one. Texts set side by side on one line (a formula of carried pieces, words of a kinetic line) are one line,
    though their ink tops differ with their glyphs ("x", "r" and a superscript start at different heights)."""
    rows = []
    for a, b in sorted(spans):
        r = rows[-1] if rows else None
        if r and min(b, r[1]) - max(a, r[0]) >= 0.5 * min(b - a, r[1] - r[0]):
            rows[-1] = (min(a, r[0]), max(b, r[1]))
        else:
            rows.append((a, b))
    return len(rows)


def letters_of(t):
    x0, y0, x1, y1 = t["ink"]
    n = max(1, len([c for c in t["text"] if not c.isspace()]))
    w = (x1 - x0) / n
    return [(x0 + i * w, y0, x0 + (i + 1) * w, y1) for i in range(n)]


def check(film):
    out = []
    worst, busy, skipped, measured = {}, {}, set(), set()
    for f in range(0, film.n, 3):
        els = film.elements(f)
        z = {e["id"]: e["z"] for e in els}
        pics = [e for e in els if e["kind"] == "image" and e["opacity"] >= 0.3 and not e.get("cutout")]
        if not pics:
            continue
        frame, mask, grown = None, None, None
        for t in film.ink[f]:
            if t["opacity"] < 0.5:
                continue
            x0, y0, x1, y1 = t["ink"]
            tz = z.get(t["id"], 1e18)
            if not [p for p in pics if p["z"] < tz and p["x"] < x1 and p["x"] + p["w"] > x0 and p["y"] < y1 and p["y"] + p["h"] > y0]:
                continue
            if not im.settled(film, f, t):
                skipped.add(t.get("node") or film.label(t["id"]))
                continue
            measured.add(t.get("node") or film.label(t["id"]))
            col = parse_rgb(t["color"])
            if col is None:
                continue
            if frame is None:
                frame = np.asarray(film.rec.frame(f), dtype=np.int16)
                mask = im.letters_mask(im.letter_boxes(film.ink[f]), film.W, film.H)
            node = t.get("node") or film.label(t["id"])
            role = t.get("role") or film.role_of(t["fontPx"]) or "body"
            boxes = [g[1:5] for g in t["letters"]] if t.get("letters") else letters_of(t)
            for a, b, c, d in boxes:
                a, b, c, d = int(max(0, a)), int(max(0, b)), int(min(film.W, c)), int(min(film.H, d))
                if c - a < 2 or d - b < 2:
                    continue
                drawn = im.drawn_over_picture(frame, (a, b, c, d), mask, col)
                if drawn is None:
                    continue
                ink, bg = drawn
                lt = float(lum(ink))
                lb = lum(bg)
                near = float(np.percentile(lb, 85 if lt > np.median(lb) else 15))
                ratio = (max(lt, near) + 0.05) / (min(lt, near) + 0.05)
                if node not in worst or ratio < worst[node]["ratio"]:
                    worst[node] = {"ratio": ratio, "frame": f, "limit": LIMITS.get(role, DEFAULT), "text": t["text"]}
            # Busy backdrop: gradients in the backdrop round the text, away from every letter. The first measure read
            # the pixels of the text's own ink box that were far from the text colour: the anti-aliased edges of the
            # letters counted as backdrop, so a shorter text (fewer word spaces of flat plate in its box) read busier
            # on the same plate. Now: the text's box grown by half its cap height, minus every letter box grown by
            # 3 px, and a pixel counts only where its gradient comes from backdrop pixels alone.
            m = max(6, int(0.5 * (t.get("cap") or 20)))
            a, b, c, d = int(max(0, x0 - m)), int(max(0, y0 - m)), int(min(film.W, x1 + m)), int(min(film.H, y1 + m))
            if c - a > 4 and d - b > 4:
                box = frame[b:d, a:c]
                g = box.mean(axis=2)
                grad = np.hypot(np.diff(g, axis=1)[:-1], np.diff(g, axis=0)[:, :-1])
                if grown is None:  # one mask a frame: every letter box on the frame grown by 3 px
                    grown = im.letters_mask(im.letter_boxes(film.ink[f]), film.W, film.H, grow=3)
                back = ~grown[b:d, a:c]
                clear = back[:-1, :-1] & back[1:, :-1] & back[:-1, 1:]
                if clear.sum() > 50:
                    share = float((grad[clear] > BUSY_GRAD).mean())
                    if share > busy.get(node, {"share": 0})["share"]:
                        busy[node] = {"share": share, "frame": f, "text": t["text"]}
    for node in sorted(skipped - measured):
        film.notes.append({"check": "type-over-media", "notMeasured": node, "why": "over a picture, but never shown in full (it fades or wipes the whole time)"})
    for node, r in worst.items():
        if r["ratio"] < r["limit"]:
            out.append(finding("type-over-media", "error", film.t(r["frame"]), film.t(r["frame"]), {"worstRatio": round(r["ratio"], 2), "text": r["text"][:40]},
                               {"min": r["limit"]}, "Dim or grade the picture under this text, or put the text on a plate: on its worst frame it does not read.", node=node))
    for node, r in busy.items():
        if r["share"] > BUSY_SHARE:
            out.append(finding("type-over-media", "warning", film.t(r["frame"]), film.t(r["frame"]), {"busyShare": round(r["share"], 3), "text": r["text"][:40]},
                               {"max": BUSY_SHARE}, "The picture behind this text is busy: move the text to a calm region, blur or dim the picture there, or use a plate.", node=node))
    # Line length, lines at once, thin weights. (Reading time is the reading-time rule in density.py.)
    shown = {}
    for f in range(film.n):
        for t in film.ink[f]:
            if t["opacity"] >= 0.5:
                node = t.get("node") or film.label(t["id"])
                shown.setdefault(node, {"frames": set(), "t": t})["frames"].add(f)
    for node, r in shown.items():
        t = r["t"]
        if film.H / film.W > 1.5 and len(t["text"]) > LINE_MAX:
            out.append(finding("type-over-media", "warning", film.t(min(r["frames"])), film.t(max(r["frames"])), {"chars": len(t["text"])}, {"max": LINE_MAX},
                               "Break this line: at 9:16 a line over 45 characters is hard to read.", node=node))
    els_weight = {}
    for f in range(0, film.n, 5):
        for e in film.content(f, 0.5):
            if e["kind"] == "text" and e.get("fontWeight") and int(float(e["fontWeight"])) < 300 and e["fontPx"] < 24 * film.W / 1080:
                els_weight.setdefault(film.label(e["id"]), (f, e))
    for node, (f, e) in els_weight.items():
        out.append(finding("type-over-media", "warning", film.t(f), film.t(f), {"weight": e["fontWeight"], "fontPx": e["fontPx"]}, {"minPxForLight": round(24 * film.W / 1080)},
                           "Use a regular or heavier weight at this size, or set the text larger.", node=node))
    over = []
    for f in range(film.n):
        # Lines of prose: code and data (film.is_code, data-content "data") are read line by line, not as body text.
        spans = [(t["ink"][1], t["ink"][3]) for t in film.ink[f] if t["opacity"] >= 0.5 and (t.get("role") or film.role_of(t["fontPx"])) == "body"
                 and not film.is_code(t) and t.get("content") != "data" and not film.is_ui(f, t)]
        over.append(lines_of(spans) > BODY_LINES)
    for a, b in film.runs(over):
        if (b - a + 1) / film.fps >= 0.5:
            out.append(finding("type-over-media", "warning", film.t(a), film.t(b), {"bodyLines": "over 3"}, {"max": BODY_LINES},
                               "Show at most 3 lines of body text at once: split the text across beats."))
    return out
