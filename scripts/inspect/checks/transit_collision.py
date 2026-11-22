"""transit-collision: two elements that do not overlap at rest but cross while one of them moves.

One family with text-crossed: text never overlaps text, a line or a mark. This check covers elements in motion;
text-crossed (text_crossed.py) covers text crossed by a stroke or a small mark while both rest.

Items per frame: text by its ink (the union of its letters' ink boxes, from the capture), and boxes,
pictures and SVG elements by their painted box (elements.json), when visible (opacity over 0.1).
Moving: the item's box changes from the frame before and to the frame after (in transit; a one-frame step is not).
A pair is a finding when, in at least 2 frames, both are visible, at least one moves, their boxes overlap by more than
MIN_PX each way, and the two never overlap in any frame where both are at rest.
Designed overlaps are not findings: a pair that overlaps at rest (a label in its panel, an element on another),
two items that rest on the same place at different times (a number that replaces another), a box that
rests behind text somewhere in the film (a highlight band, a plate), a cut-out (data-cutout), a backdrop or wipe panel (a box or picture over 20 % of the frame), the ground and
texture layers, and full-frame SVG layers (the scene's shape layer, whose painted box is not known).
"""
from film import finding

MIN_PX = 3
MIN_FRAMES = 2
BIG = 0.20


def items(film, f):
    area = film.W * film.H
    out = {}
    for e in film.elements(f):
        if e["layer"] != "content" or e["opacity"] <= 0.1 or e["kind"] == "text" or e.get("cutout"):
            continue
        if e["w"] * e["h"] > BIG * area:
            continue
        out[e["id"]] = (e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"])
    for t in film.ink[f]:
        if t["opacity"] > 0.1:
            out[t["id"]] = tuple(t["ink"])
    return out


def overlap(a, b):
    return min(a[2], b[2]) - max(a[0], b[0]), min(a[3], b[3]) - max(a[1], b[1])


def moved(a, b):
    return a is None or b is None or max(abs(x - y) for x, y in zip(a, b)) >= 1


def check(film):
    frames = [items(film, f) for f in range(film.n)]
    rest_overlap = set()  # pairs that overlap at rest: designed
    hits = {}  # pair -> list of (frame, depth, area)
    for f in range(film.n):
        cur = frames[f]
        prev = frames[f - 1] if f else {}
        nxt = frames[f + 1] if f + 1 < film.n else {}
        mov = {k: (f > 0 and f + 1 < film.n and moved(prev.get(k), b) and moved(b, nxt.get(k))) for k, b in cur.items()}
        keys = sorted(cur)
        for i, ka in enumerate(keys):
            a = cur[ka]
            for kb in keys[i + 1:]:
                if film.label(ka) == film.label(kb):
                    continue
                b = cur[kb]
                ox, oy = overlap(a, b)
                pair = (ka, kb)
                if ox > 0 and oy > 0 and not mov[ka] and not mov[kb]:
                    rest_overlap.add(pair)
                    continue
                if ox > MIN_PX and oy > MIN_PX and (mov[ka] or mov[kb]):
                    hits.setdefault(pair, []).append((f, min(ox, oy), ox * oy, mov[ka], mov[kb]))
    # Rest boxes per item over the whole film: two items that ever rest on the same place (a number that
    # replaces another, a band that sits behind a line) overlap by design.
    rests = {}
    for f in range(1, film.n):
        for k, b in frames[f].items():
            if not moved(frames[f - 1].get(k), b):
                rests.setdefault(k, set()).add(tuple(round(v) for v in b))
    texts = {t["id"] for fr in film.ink for t in fr}
    backdrop = {k for k in rests if k not in texts and any(overlap(a, b)[0] > 0 and overlap(a, b)[1] > 0
                for t in texts & rests.keys() for a in rests[k] for b in rests[t])}

    def rest_overlap_ever(ka, kb):
        return any(overlap(a, b)[0] > 0 and overlap(a, b)[1] > 0 for a in rests.get(ka, ()) for b in rests.get(kb, ()))

    out = []
    seen = set()
    for (ka, kb), hs in sorted(hits.items(), key=lambda kv: kv[1][0][0]):
        if (ka, kb) in rest_overlap or len(hs) < MIN_FRAMES or rest_overlap_ever(ka, kb):
            continue
        if (ka in backdrop and kb in texts) or (kb in backdrop and ka in texts):
            continue
        la, lb = film.label(ka), film.label(kb)
        if (la, lb) in seen:
            continue
        seen.add((la, lb))
        worst = max(hs, key=lambda h: h[2])
        mover = la if worst[3] and not worst[4] else lb if worst[4] and not worst[3] else f"{la} and {lb}"
        out.append(finding("transit-collision", "error", film.t(hs[0][0]), film.t(hs[-1][0]),
                           {"pair": [la, lb], "frames": len(hs), "overlapPx": round(worst[1], 1), "overlapArea": round(worst[2]), "moving": mover},
                           {"overlapPx": MIN_PX},
                           f"Keep {mover} clear of the other while it moves: move it out the other way, fade it before they meet, or move both together.",
                           node=f"{la} x {lb}"))
    return out
