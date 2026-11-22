"""joint: a part that rests on another part leaves it while the parts move.

A scene attaches one shape to another with shape's `on` (a beam on a fulcrum's apex, a load on the beam's end). The
shape names the joint in an anchor `<id>-on`: the point in scene px where the two touch at rest, the node of the shape
(`self`) and the node of the part (`part`). The capture records the screen matrix of every painted shape on every frame
(`m`, capture version 7). On each frame where both nodes paint, the check maps the joint point through each node's
matrix: that is where the renderer draws that point of the shape and that point of the part. When the two land more
than TOL apart, the shape has left the part (it floats over it, sinks into it, or stays behind while the part turns).

It measures only what the scene declares: it does not guess which parts touch, and it knows no physics. A joint that
holds at rest but not in motion is the fault it finds: a turn about the wrong point, a follower without the part's
motion, or two renderers that turn about different points.
"""
import math

from film import Skip, finding

TOL = 3.0  # px: the matrices keep 0.01 px and the joint is a point, so 3 px is the smallest gap a phone shows


def at(m, x, y):
    a, b, c, d, e, f = m
    return a * x + c * y + e, b * x + d * y + f


def check(film):
    joints = [n for n in film.nodes if n.get("kind") == "anchor" and str(n.get("id", "")).endswith("-on") and (n.get("data") or {}).get("part")]
    if not joints:
        raise Skip("no joint: the scene attaches no shape to another (shape `on`)")
    sh = film.cap.get("shapes")
    if not sh or (film.cap.get("captureVersion") or 0) < 7:
        raise Skip("the capture has no shape matrices (capture version 7)")
    frames = sh["frames"]
    out = []
    for j in joints:
        d = j["data"]
        x, y, me, part = float(d["x"]), float(d["y"]), str(d["self"]), str(d["part"])
        gaps = []
        for f in range(min(film.n, len(frames))):
            a = next((s for s in frames[f] if s["id"] == me and s.get("m")), None)
            b = next((s for s in frames[f] if s["id"] == part and s.get("m")), None)
            if not a or not b:
                continue
            pa, pb = at(a["m"], x, y), at(b["m"], x, y)
            gaps.append((f, math.hypot(pa[0] - pb[0], pa[1] - pb[1])))
        bad = [(f, g) for f, g in gaps if g > TOL]
        if not bad:
            continue
        worst = max(bad, key=lambda r: r[1])
        name = j["id"][:-3]
        out.append(finding("joint", "error", film.t(bad[0][0]), film.t(bad[-1][0] + 1),
                           {"shape": me, "part": part, "point": [round(x, 1), round(y, 1)], "gapPx": round(worst[1], 1), "atS": round(film.t(worst[0]), 2), "frames": len(bad)},
                           {"gapPx": TOL},
                           f"{name} rests on {part} at ({x:.0f}, {y:.0f}), but it leaves that point by {worst[1]:.0f} px while they move. "
                           "Let the kit keep it there: give the shape `on: { part, at }` and no hand-computed moves; a part that turns on another "
                           "turns about the point it rests on (its `pivot` defaults to that point).", node=name))
    return out
