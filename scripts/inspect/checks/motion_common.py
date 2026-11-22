"""Move segments from elements.json, for the motion checks.

A segment is one element's run of frames in which its box moves or scales (its centre shifts 0.1 px or more,
or its size changes 0.1 px or more (the recorder keeps 0.1 px), so the slow start of an ease-in counts), from the frame before),
in the world's coordinates (film.in_world): a part that only rides the camera's glide or push does not move. Each segment has: start and end frame, the distance
its centre travels, its size change, the share of the travel done in the first and last quarter of its time (the
curve shape), and its kind: "enter" (its opacity rises during the segment or it is new on screen up to 3 frames before), "exit" (its
opacity falls or it leaves), or "move" (on screen the whole time).
"""
import numpy as np


def series(film):
    if getattr(film, "_series", None) is not None:
        return film._series
    s = {}
    for f in range(film.n):
        for e in film.elements(f):
            if e["layer"] != "content" or e["kind"] == "camera":
                continue
            # In the world's coordinates: a part that rides the camera's glide or push does not move by itself.
            s.setdefault(e["id"], {})[f] = film.in_world(f, e)
    film._series = s
    return s


def segments(film, min_frames=4):
    if getattr(film, "_segments", None) is not None:
        return film._segments
    out = []
    for eid, fr in series(film).items():
        fs = sorted(fr)
        run = []
        def close():
            if len(run) >= min_frames:
                out.append(make(film, eid, fr, run[0] - 1 if run[0] - 1 in fr else run[0], run[-1]))
        for f in fs:
            p = fr.get(f - 1)
            e = fr[f]
            # 0.1 px on screen; 1 px for a box mapped out of a camera move (film.in_world: the rounding noise).
            floor = 1.0 if e.get("_world") or (p or {}).get("_world") else 0.1
            moved = p is not None and (abs((p["x"] + p["w"] / 2) - (e["x"] + e["w"] / 2)) + abs((p["y"] + p["h"] / 2) - (e["y"] + e["h"] / 2)) >= floor
                                       or abs(p["w"] - e["w"]) + abs(p["h"] - e["h"]) >= floor)
            if moved:
                run.append(f)
            else:
                close()
                run = []
        close()
    film._segments = out
    return out


def make(film, eid, fr, a, b):
    xs = np.array([[fr[f]["x"] + fr[f]["w"] / 2, fr[f]["y"] + fr[f]["h"] / 2] for f in range(a, b + 1) if f in fr])
    steps = np.linalg.norm(np.diff(xs, axis=0), axis=1) if len(xs) > 1 else np.zeros(1)
    total = float(steps.sum()) or 1e-6
    n = len(steps)
    q = max(1, n // 4)
    o0, o1 = fr[a]["opacity"], fr[b]["opacity"]
    # An entrance: it fades up during the move, or it appeared at most 3 frames before the move starts.
    before = fr.get(a - 3)
    kind = "enter" if (o1 - o0 > 0.2 or before is None or o1 - before["opacity"] > 0.2) else "exit" if (o0 - o1 > 0.2 or (b + 1) not in fr) else "move"
    return {"id": eid, "label": film.label(eid), "a": a, "b": b, "frames": b - a, "dist": total,
            "firstQ": float(steps[:q].sum()) / total, "lastQ": float(steps[-q:].sum()) / total, "kind": kind,
            "scale0": fr[a].get("scale", 1), "w": fr[b]["w"], "h": fr[b]["h"], "elkind": fr[b]["kind"],
            "role": fr[b].get("fontPx")}
