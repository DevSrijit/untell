"""edge-sliver: a shape that sticks a few px into the frame at rest: the edge of a panel that a move did not take far
enough out (a panel's 8 px overhang left after a whip).

A box or SVG element (content, opacity 0.5 or more, not the ground) whose box shows SLIVER_PX px or less of itself
inside the frame across one frame edge, while LEFT_OUT times that or more of it lies past that edge, at rest (the
same box on the frame before) for REST s or more. The frame must show it: the strip it covers in the frame differs
from the strip just inside it by over DIFF grey levels in its median row or column (a shape the same tone as its
ground shows nothing). A text is text-clipped's; a picture cut by the frame is a framing.
"""
import numpy as np

from film import finding

SLIVER_PX, LEFT_OUT, REST, DIFF = 16, 4, 0.3, 18


def sliver(e, W, H):
    """(side, px inside, px outside) when the element shows a sliver across one edge, else None."""
    x0, y0, x1, y1 = e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]
    if x1 <= 0 or y1 <= 0 or x0 >= W or y0 >= H:
        return None
    sides = []
    if x0 < 0:
        sides.append(("left", min(x1, W), -x0))
    if x1 > W:
        sides.append(("right", W - max(x0, 0), x1 - W))
    if y0 < 0:
        sides.append(("top", min(y1, H), -y0))
    if y1 > H:
        sides.append(("bottom", H - max(y0, 0), y1 - H))
    for side, inside, past in sides:
        if 0.5 <= inside <= SLIVER_PX and past >= LEFT_OUT * inside:
            return side, inside, past
    return None


def shows(film, f, side, inside):
    """True when the frame draws the sliver: its strip differs from the strip just inside it."""
    g = np.asarray(film.rec.frame(f).convert("L"), dtype=np.float64)
    H, W = g.shape
    d = max(1, int(round(inside)))
    if side == "left":
        a, b = g[:, :d], g[:, d + 2:d + 2 + d]
    elif side == "right":
        a, b = g[:, W - d:], g[:, W - 2 * d - 2:W - d - 2]
    elif side == "top":
        a, b = g[:d, :].T, g[d + 2:2 * d + 2, :].T
    else:
        a, b = g[H - d:, :].T, g[H - 2 * d - 2:H - d - 2, :].T
    if a.size == 0 or b.size == 0:
        return False
    return float(np.median(np.abs(a.mean(axis=1) - b.mean(axis=1)))) > DIFF or float(np.abs(a.mean() - b.mean())) > DIFF


def check(film):
    rest = max(1, round(REST * film.fps))
    runs = {}
    prev = {}
    for f in range(film.n):
        cur = {}
        for e in film.elements(f):
            if e.get("layer") != "content" or e["kind"] not in ("box", "svg") or e["opacity"] < 0.5:
                continue
            cur[e["id"]] = e
            p = prev.get(e["id"])
            if p is None or abs(p["x"] - e["x"]) + abs(p["y"] - e["y"]) + abs(p["w"] - e["w"]) + abs(p["h"] - e["h"]) >= 0.5:
                continue
            s = sliver(e, film.W, film.H)
            if s:
                runs.setdefault((e["id"], s[0]), []).append((f, s))
        prev = cur
    out = []
    for (eid, side), fs in runs.items():
        frames = [f for f, _ in fs]
        # The longest run of consecutive frames.
        best, start = [], 0
        for i in range(1, len(frames) + 1):
            if i == len(frames) or frames[i] != frames[i - 1] + 1:
                if i - start > len(best):
                    best = frames[start:i]
                start = i
        if len(best) < rest:
            continue
        mid = best[len(best) // 2]
        inside, past = dict(fs)[mid][1], dict(fs)[mid][2]
        if not shows(film, mid, side, inside):
            continue
        node = film.label(eid)
        out.append(finding("edge-sliver", "error", film.t(best[0]), film.t(best[-1]),
                           {"side": side, "insidePx": round(inside, 1), "outsidePx": round(past, 1), "frame": mid},
                           {"maxInsidePx": 0, "sliverPx": SLIVER_PX},
                           f"{node} shows only {inside:.0f} px of itself at the {side} edge: move it {inside:.0f} px or more further out, "
                           "or bring it into the frame clearly.", node=node))
    return out
