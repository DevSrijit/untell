"""One motion measure for the detector and the review sheet: what changed on each frame, from the capture.

A pixel measure on a small copy of the frame misses thin things: a hairline that draws (a callout's leader, a traced
curve, a ramp line), a label that types one letter a frame. The capture knows each of them exactly, so a frame
changed when, against the frame before:
  a text types or wipes   its letter count changed, its ink box crossed a STEP px step, or its opacity changed by
                          OPACITY or more;
  a stroke draws          a shape's box, opacity or drawn length (the capture's "len"/"dash" when present) changed;
  a picture enters        an element's opacity changed by OPACITY or more, or its box crossed a STEP px step;
  a picture moves         its content's scale (a push) or position (a drift) moved it a STEP px step in its box.
changed(cap, n) returns a list of n booleans (frame 0 is False). The detector ORs it with its pixel measure; the
review sheet does the same when the film's capture is beside the video.
"""
OPACITY = 0.05
STEP = 3  # px: boxes are compared in steps of 3 px, so a slow drift (under 3 px a frame) is not a change by itself


def _texts(fr):
    out = {}
    for t in fr or []:
        letters = t.get("letters")
        # The letters typed so far and the opacity; the ink box only by STEP px (a drift of a px a frame is not a change).
        out[t["id"]] = (tuple(round(v / STEP) for v in t["ink"]), len(letters) if letters is not None else None, round(t.get("opacity", 1), 2))
    return out


def _shapes(fr):
    return {s["id"]: (tuple(round(v / STEP) for v in s.get("box") or ()), round(s.get("opacity", 1), 2), s.get("len"), s.get("dash"), s.get("d") and len(s["d"]))
            for s in fr or []}


def _content(e):
    """How far a picture's content has moved inside its box, px, in STEP steps: its scale (a push) over the box's long
    side, and its position (a drift; "x% y%" of the room the cover leaves). A slow push on a dark, low-contrast picture
    changes few pixels, but the picture moves: an 8 % push over 4 s moves its edge about a px a frame."""
    size = max(e.get("w") or 0, e.get("h") or 0)
    scale = round((e.get("scale") or 1) * size / STEP)
    pos = tuple(round(float(v.rstrip("%")) * size / 100 / STEP) for v in str(e.get("position") or "").split() if v.endswith("%"))
    return scale, pos


def _elements(fr, content=True):
    # content False: a picture counts only when it enters, leaves or fades (its opacity): a push or drift moves its box
    # and its content, and under a held card that is the picture's motion, not a change of the card.
    pic = lambda e: e.get("kind") in ("image", "video")  # noqa: E731
    return {e["id"]: ((round(e.get("opacity", 1), 2),) if not content and pic(e) else
                      (round(e["x"] / STEP), round(e["y"] / STEP), round(e["w"] / STEP), round(e["h"] / STEP), round(e.get("opacity", 1), 2), *(_content(e) if pic(e) else ())))
            for e in fr or [] if e.get("layer") == "content"}


def _differs(a, b):
    if a == b:
        return False
    for k in set(a) | set(b):
        x, y = a.get(k), b.get(k)
        if x is None or y is None:  # it entered or left
            return True
        if x != y:
            for p, q in zip(x, y):
                if isinstance(p, float) and isinstance(q, float):
                    if abs(p - q) >= OPACITY:
                        return True
                elif p != q:
                    return True
    return False


BLINK_AREA = 0.01  # a blinking mark covers under 1 % of the frame (a terminal's cursor is about 0.1 %)


def blinkers(elements, n, area):
    """The marks that only blink at the end: {element id: the first frame of its blinking}. A blinker is small (its
    box under BLINK_AREA of `area`, the frame's px), keeps its box from that frame to the end, and only turns on and
    off (two or more changes of opacity, or it leaves and comes back). A terminal's cursor that blinks on the last line
    is one: the end holds while it blinks (Console's end, direction.ends). A fade in only rises, so it is no blink."""
    seq = {}
    for f in range(min(n, len(elements or []))):
        for e in elements[f] or []:
            if e.get("layer") == "content":
                seq.setdefault(e["id"], {})[f] = e
    out = {}
    for eid, frames in seq.items():
        last = max(frames)
        # Off on the last frames is a blink off too, but only while it blinked on within the last second.
        if n - 1 - last > 30 or any(frames[f]["w"] * frames[f]["h"] > BLINK_AREA * area for f in frames):
            continue
        box = lambda e: (round(e["x"] / STEP), round(e["y"] / STEP), round(e["w"] / STEP), round(e["h"] / STEP))  # noqa: E731
        end_box = box(frames[last])
        # Back from the end: the frames where it shows with this box, or is hidden (a blink off), since it settled.
        start = last
        while start - 1 >= 0 and (start - 1 not in frames or box(frames[start - 1]) == end_box):
            if start - 1 not in frames and not any(g in frames for g in range(start - 1, -1, -1)):
                break
            start -= 1
        states = [round(frames[f].get("opacity", 1), 2) if f in frames else 0.0 for f in range(start, n)]
        steps = [b - a for a, b in zip(states, states[1:]) if abs(a - b) >= OPACITY]
        # A blink turns off and on again: its opacity falls and rises. A label that fades in only rises, so it is not
        # a blinker (the steps of a fade counted as flips, and the ending note called still labels a blinking mark).
        if len(steps) >= 2 and any(d < 0 for d in steps) and any(d > 0 for d in steps):
            out[eid] = start
    return out


def changed(cap, n, elements=None, ignore=None, content=True):
    """Per frame: True when a text, a shape or an element changed from the frame before (see the module doc).
    `ignore`: {element id: first frame}, elements left out from that frame on (blinkers()). `content` False leaves out
    a picture's slow push or drift inside its box: the end check reads whether the end card is complete and held, and
    a slow push under a held card is the hold, not a new change."""
    ink = cap.get("ink") or []
    shapes = (cap.get("shapes") or {}).get("frames") or []
    out = [False] * n
    ig = ignore or {}
    els = lambda f: _elements([e for e in elements[f] or [] if not (e["id"] in ig and f >= ig[e["id"]])], content)  # noqa: E731
    pt = _texts(ink[0]) if ink else {}
    ps = _shapes(shapes[0]) if shapes else {}
    pe = els(0) if elements else {}
    for f in range(1, n):
        ct = _texts(ink[f]) if f < len(ink) else pt
        cs = _shapes(shapes[f]) if f < len(shapes) else ps
        ce = els(f) if elements and f < len(elements) else pe
        out[f] = _differs(pt, ct) or _differs(ps, cs) or _differs(pe, ce)
        pt, ps, pe = ct, cs, ce
    return out
