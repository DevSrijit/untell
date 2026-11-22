"""shape-crossed: one stroke crossing another at rest where the drawing says they should touch or stay apart.

Same family as text-crossed and transit-collision. Uses the stroke points the capture records (every 4 px, screen px).
At a frame every 0.5 s where both shapes rest (same geometry 0.2 s later), two narrow cases:
  through   a chain or belt span (a data-el label with "chain" or "belt") goes deep inside a closed outline (a ring, a gear, a circle: first and last point within
            8 px). Deep: inside the outline by more than the outline's own relief (tooth depth: the spread of its
            radius about its centre) plus 3 stroke widths, for 3 points or more. A chain or belt that wraps a gear
            on its pitch line stays within the tooth depth; a chain through the ring does not.
  leaders   two leader lines (a data-el label with "leader") whose segments cross.
Not findings: shapes of one block (the same data-el label prefix before the last "-"), grid, axis, hatch,
texture and ground layers, and dimension lines ("dim" in the label): a dimension line crosses the shape it
measures by design, and the detector cannot tell which shape that is. It cannot tell a designed overlap of two
outlines (a gear meshing into another) from a fault either, so outline against outline is left out. Other lines
through outlines (construction lines, a crank arm inside its ring, a spiral through its tiles, extension lines) are
designed far more often than not, and their labels do not say which: only chain and belt spans are checked.
"""
import re

import numpy as np

from film import Skip, finding

WRAPS = re.compile(r"chain|belt", re.I)  # the narrow case: a span that should wrap an outline
SKIP = re.compile(r"grid|axis|axes|hatch|texture|ground|dim", re.I)


def block(label):
    return re.sub(r"-[^-]*$", "", label)


def inside(pts, poly):
    """Ray casting: which points lie inside the closed polygon."""
    x, y = pts[:, 0][:, None], pts[:, 1][:, None]
    x1, y1 = poly[:, 0][None, :], poly[:, 1][None, :]
    x2, y2 = np.roll(poly[:, 0], -1)[None, :], np.roll(poly[:, 1], -1)[None, :]
    cond = (y1 > y) != (y2 > y)
    xs = (x2 - x1) * (y - y1) / np.where(y2 - y1 == 0, 1e-9, y2 - y1) + x1
    return ((cond & (x < xs)).sum(axis=1) % 2) == 1


def cross(a, b):
    """True when two polylines have crossing segments."""
    for i in range(len(a) - 1):
        p, r = a[i], a[i + 1] - a[i]
        q, s = b[:-1], b[1:] - b[:-1]
        den = r[0] * s[:, 1] - r[1] * s[:, 0]
        ok = np.abs(den) > 1e-9
        t = ((q[:, 0] - p[0]) * s[:, 1] - (q[:, 1] - p[1]) * s[:, 0]) / np.where(ok, den, 1)
        u = ((q[:, 0] - p[0]) * r[1] - (q[:, 1] - p[1]) * r[0]) / np.where(ok, den, 1)
        hit = ok & (t >= 0) & (t < 1) & (u >= 0) & (u < 1)
        for j in np.where(hit)[0]:
            x = p + t[j] * r
            # A junction (one leader ending on the other's end) is not a crossing.
            if min(np.hypot(*(x - e)) for e in (a[0], a[-1], b[0], b[-1])) > 2:
                return True
    return False


def check(film):
    sh = film.cap.get("shapes")
    if not sh:
        raise Skip("the capture has no shape geometry")
    geoms = [np.asarray(g, dtype=np.float64).reshape(-1, 2) for g in sh["geoms"]]
    frames = sh["frames"]
    lag = max(1, round(0.2 * film.fps))
    found = {}
    for f in range(0, film.n - lag, 15):
        later = {(s["id"], s.get("g")) for s in frames[f + lag]}
        strokes = [s for s in frames[f] if s.get("g") is not None and (s["id"], s["g"]) in later and not SKIP.search(s["id"])
                   and s.get("layer") not in ("ground", "texture") and len(geoms[s["g"]]) >= 2]
        closed = [s for s in strokes if len(geoms[s["g"]]) >= 8 and np.hypot(*(geoms[s["g"]][0] - geoms[s["g"]][-1])) < 8]
        for o in closed:
            poly = geoms[o["g"]]
            c = poly.mean(axis=0)
            rad = np.hypot(poly[:, 0] - c[0], poly[:, 1] - c[1])
            relief = float(rad.max() - rad.min())
            ox0, oy0, ox1, oy1 = o["box"]
            for s in strokes:
                if s is o or block(s["id"]) == block(o["id"]) or s in closed or not WRAPS.search(s["id"]):
                    continue
                pts = geoms[s["g"]]
                near = (pts[:, 0] > ox0) & (pts[:, 0] < ox1) & (pts[:, 1] > oy0) & (pts[:, 1] < oy1)
                if near.sum() < 3:
                    continue
                p = pts[near]
                ins = inside(p, poly)
                if ins.sum() < 3:
                    continue
                d = np.min(np.hypot(p[ins][:, None, 0] - poly[None, :, 0], p[ins][:, None, 1] - poly[None, :, 1]), axis=1)
                limit = relief + 3 * max(s.get("width", 1), o.get("width", 1))
                deep = int((d > limit).sum())
                if deep >= 3:
                    r = found.setdefault(("through", s["id"], o["id"]), {"frames": [], "depth": 0.0, "limit": limit})
                    r["frames"].append(f)
                    r["depth"] = max(r["depth"], float(d.max()))
        leaders = [s for s in strokes if "leader" in s["id"].lower()]
        for i, a in enumerate(leaders):
            for b in leaders[i + 1:]:
                if block(a["id"]) != block(b["id"]) and cross(geoms[a["g"]], geoms[b["g"]]):
                    found.setdefault(("leaders", a["id"], b["id"]), {"frames": [], "depth": 0.0, "limit": 0})["frames"].append(f)
    out = []
    for (kind, a, b), r in found.items():
        fix = ("Route the line on the outline it should wrap (tangent, on the pitch line), not through it." if kind == "through"
               else "Route the two leaders so they do not cross: swap the labels or bend one leader.")
        out.append(finding("shape-crossed", "error", film.t(r["frames"][0]), film.t(r["frames"][-1] + lag),
                           {"kind": kind, "line": a, "outline": b, "depthPx": round(r["depth"], 1)},
                           {"depthPx": round(r["limit"], 1)} if kind == "through" else {"crossings": 0}, fix, node=f"{a} x {b}"))
    return out
