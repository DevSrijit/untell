"""Motion curves and a beat timeline for a whole recording.

curves.png: one row per moving element, with its own motion (the camera's movement removed), scale
and opacity over time. Linear segments are red, overshoots orange; ticks mark where moves start.
timeline.png: camera moves, hard cuts, still stretches, and when each text enters and leaves.
Facts: every move with its easing, starts that share a frame (no stagger), moves that collide.
"""
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from analyze import easing_of  # noqa: E402
from common import font, load, out_dir  # noqa: E402


def name_of(e):
    return e["text"][:24] if e.get("text") else f'{e["kind"]} {round(e["w"])}x{round(e["h"])}'


def camera_path(rec):
    """The camera's screen shift per frame: exact when the recording has the kit's camera, else estimated."""
    exact = []
    for f in range(rec.n):
        c = next((e for e in rec.elements[f] or [] if e.get("kind") == "camera"), None)
        if c is None:
            break
        exact.append((-(c["x"] - 540.0) * c["scale"], -(c["y"] - 960.0) * c["scale"]))
    if len(exact) == rec.n:
        base = exact[0]
        return np.array([(x - base[0], y - base[1]) for x, y in exact])
    if rec.language.get("id") and not exact:
        # A film made with a system declares its camera when it has one; without it there is no camera to guess.
        return np.zeros((rec.n, 2))
    return estimate_camera(rec)


def estimate_camera(rec):
    """Per-frame camera translation: the median shift of elements present in both frames, when most
    of them agree on it (fixed elements such as a masthead do not move with the camera)."""
    cam = [(0.0, 0.0)]
    for f in range(1, rec.n):
        prev = {e["id"]: e for e in rec.content(f - 1, 0.05)}
        shifts = [(e["x"] - prev[e["id"]]["x"], e["y"] - prev[e["id"]]["y"]) for e in rec.content(f, 0.05) if e["id"] in prev]
        dx = dy = 0.0
        moving = [s for s in shifts if abs(s[0]) + abs(s[1]) > 0.2]
        if len(moving) >= 3:
            mx, my = float(np.median([s[0] for s in moving])), float(np.median([s[1] for s in moving]))
            agree = sum(1 for s in moving if abs(s[0] - mx) < 1.5 and abs(s[1] - my) < 1.5) / len(shifts)
            if agree >= 0.5:
                dx, dy = mx, my
        cam.append((cam[-1][0] + dx, cam[-1][1] + dy))
    return np.array(cam)


def tracks(rec, cam):
    """Element id -> per-frame arrays of own position, width and opacity. World elements have the
    camera removed; screen-fixed elements (still while the camera moves) keep their raw position."""
    raw = defaultdict(dict)
    for f in range(rec.n):
        for e in rec.content(f, 0.0):
            raw[e["id"]][f] = e
    cam_step = np.hypot(*np.diff(cam, axis=0).T)
    out = {}
    for eid, frames in raw.items():
        during = [abs(frames[f]["y"] - frames[f - 1]["y"]) + abs(frames[f]["x"] - frames[f - 1]["x"])
                  for f in frames if f - 1 in frames and cam_step[f - 1] > 2]
        fixed = bool(during) and float(np.median(during)) < 0.5
        t = {"x": [np.nan] * rec.n, "y": [np.nan] * rec.n, "w": [np.nan] * rec.n, "o": [0.0] * rec.n, "el": None, "fixed": fixed}
        for f, e in frames.items():
            cx, cy = (0.0, 0.0) if fixed else (cam[f][0], cam[f][1])
            t["x"][f] = e["x"] + e["w"] / 2 - cx
            t["y"][f] = e["y"] + e["h"] / 2 - cy
            t["w"][f] = e["w"]
            t["o"][f] = e["opacity"]
            if t["el"] is None or e["opacity"] > t["el"]["opacity"]:
                t["el"] = e
        out[eid] = t
    return out


def segments(flags, min_len=4):
    out, start = [], None
    for i, v in enumerate(list(flags) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= min_len:
                out.append((start, i))
            start = None
    return out


def analyse(rec):
    cam = camera_path(rec)
    tr = tracks(rec, cam)
    moves = []
    for eid, t in tr.items():
        x, y = np.array(t["x"]), np.array(t["y"])
        step = np.hypot(np.diff(x), np.diff(y))
        moving = np.nan_to_num(step) > 0.4
        for a, b in segments(moving):
            p0, p1 = np.array([x[a], y[a]]), np.array([x[b], y[b]])
            dist = float(np.linalg.norm(p1 - p0))
            if dist < 6 or np.isnan(dist):
                continue
            prog = [float(np.dot(np.array([x[k], y[k]]) - p0, p1 - p0) / dist ** 2) for k in range(a, b + 1)]
            kind, mid = easing_of(prog)
            moves.append({"id": eid, "element": name_of(t["el"]), "from_s": round(a / rec.fps, 2), "to_s": round(b / rec.fps, 2),
                          "start_frame": a, "end_frame": b, "distance_px": round(dist), "easing": kind, "progress_at_half_time": mid})
    # Starts that share a frame: three or more moves beginning within one frame of each other.
    starts = defaultdict(list)
    for m in moves:
        starts[m["start_frame"] // 2].append(m["element"])
    together = [{"at_s": round(k * 2 / rec.fps, 2), "elements": v} for k, v in starts.items() if len(v) >= 3]
    # Collisions: two elements whose boxes overlap while at least one of them is moving.
    collisions = []
    for m in moves:
        for f in range(m["start_frame"], m["end_frame"] + 1, 3):
            els = {e["id"]: e for e in rec.content(f)}
            me = els.get(m["id"])
            if not me:
                continue
            parent = m["id"].rsplit("/", 1)[0]
            for oid, o in els.items():
                if oid == m["id"] or oid.rsplit("/", 1)[0] == parent or oid.startswith(m["id"] + "/") or m["id"].startswith(oid + "/"):
                    continue
                ix = min(me["x"] + me["w"], o["x"] + o["w"]) - max(me["x"], o["x"])
                iy = min(me["y"] + me["h"], o["y"] + o["h"]) - max(me["y"], o["y"])
                small = min(me["w"] * me["h"], o["w"] * o["h"])
                if ix > 0 and iy > 0 and ix * iy > 0.15 * small and not _contains(o, me) and not _contains(me, o):
                    collisions.append({"at_s": round(f / rec.fps, 2), "moving": m["element"], "hits": name_of(o)})
                    break
    seen_c, uniq = set(), []
    for c in collisions:
        k = (c["moving"], c["hits"])
        if k not in seen_c:
            seen_c.add(k)
            uniq.append(c)
    camera_moves = []
    speed = np.hypot(*np.diff(cam, axis=0).T)
    for a, b in segments(speed > 0.5, 3):
        camera_moves.append({"from_s": round(a / rec.fps, 2), "to_s": round(b / rec.fps, 2),
                             "distance_px": round(float(np.hypot(*(cam[b] - cam[a]))))})
    return cam, tr, moves, together, uniq, camera_moves


def _contains(a, b):
    return a["x"] <= b["x"] + 1 and a["y"] <= b["y"] + 1 and b["x"] + b["w"] <= a["x"] + a["w"] + 1 and b["y"] + b["h"] <= a["y"] + a["h"] + 1


def draw_curves(rec, tr, moves):
    by_id = defaultdict(list)
    for m in moves:
        by_id[m["id"]].append(m)
    ids = sorted(by_id, key=lambda i: -sum(m["distance_px"] for m in by_id[i]))[:16]
    W, row, left = 1800, 92, 340
    H = 70 + row * max(1, len(ids)) + 40
    img = Image.new("RGB", (W, H), (250, 250, 250))
    d = ImageDraw.Draw(img)
    X = lambda f: left + (W - left - 30) * f / (rec.n - 1)
    for s in range(0, int(rec.n / rec.fps) + 1):
        d.line([(X(s * rec.fps), 50), (X(s * rec.fps), H - 30)], fill=(225, 225, 225), width=1)
        d.text((X(s * rec.fps) - 8, H - 28), f"{s}s", fill=(110, 110, 110), font=font(18))
    d.text((14, 10), "own motion (black), scale (blue), opacity (grey) · red: constant speed · orange: overshoot · ticks: move starts", fill=(30, 30, 30), font=font(22))
    for r, eid in enumerate(ids):
        t = tr[eid]
        y0 = 60 + r * row
        d.text((14, y0 + 30), name_of(t["el"])[:26], fill=(30, 30, 30), font=font(20))
        x, y = np.array(t["x"]), np.array(t["y"])
        rest = np.array([np.nanmedian(x), np.nanmedian(y)])
        dist = np.hypot(x - rest[0], y - rest[1])
        mx = np.nanmax(dist) if np.isfinite(np.nanmax(dist)) and np.nanmax(dist) > 0 else 1
        w = np.array(t["w"]); wr = w / np.nanmedian(w) if np.isfinite(np.nanmedian(w)) else w
        def line(vals, color, lo, hi):
            pts = [(X(f), y0 + row - 14 - (row - 28) * (v - lo) / (hi - lo + 1e-9)) for f, v in enumerate(vals) if np.isfinite(v)]
            if len(pts) > 1:
                d.line(pts, fill=color, width=2)
        line(np.array(t["o"]), (170, 170, 170), 0, 1)
        line(np.clip(wr, 0, 2), (40, 110, 255), 0, 2)
        line(dist / mx, (20, 20, 20), 0, 1)
        for m in by_id[eid]:
            d.line([(X(m["start_frame"]), y0 + 4), (X(m["start_frame"]), y0 + row - 10)], fill=(120, 120, 120), width=1)
            if m["easing"].startswith("linear"):
                d.rectangle([X(m["start_frame"]), y0 + row - 12, X(m["end_frame"]), y0 + row - 6], fill=(230, 30, 30))
            if m["easing"].startswith("spring"):
                d.ellipse([X(m["end_frame"]) - 6, y0 + 8, X(m["end_frame"]) + 6, y0 + 20], fill=(255, 150, 0))
    path = out_dir(rec) / "curves.png"
    img.save(path)
    return path


def draw_timeline(rec, cam, camera_moves):
    W, left = 1800, 260
    # One row per text element (a counter keeps its element while its digits change), named by its first words.
    by_el, names = {}, {}
    for f in range(rec.n):
        for t in rec.tracks[f]:
            if t["opacity"] >= 0.5 and t["y"] < rec.height and t["y"] + t["h"] > 0:
                by_el.setdefault(t["id"], []).append(f)
                names.setdefault(t["id"], t["text"][:30])
    texts = {names[k]: v for k, v in list(by_el.items())[:22]}
    rows = 3 + len(texts)
    H = 60 + rows * 34 + 40
    img = Image.new("RGB", (W, H), (250, 250, 250))
    d = ImageDraw.Draw(img)
    X = lambda f: left + (W - left - 30) * f / (rec.n - 1)
    for s in range(0, int(rec.n / rec.fps) + 1):
        d.line([(X(s * rec.fps), 44), (X(s * rec.fps), H - 30)], fill=(225, 225, 225), width=1)
        d.text((X(s * rec.fps) - 8, H - 28), f"{s}s", fill=(110, 110, 110), font=font(18))
    report = __import__("json").loads((rec.dir / "report.json").read_text()) if (rec.dir / "report.json").exists() else {}
    y = 50
    d.text((14, y), "camera", fill=(30, 30, 30), font=font(20))
    for m in camera_moves:
        d.rectangle([X(m["from_s"] * rec.fps), y + 4, X(m["to_s"] * rec.fps), y + 24], fill=(40, 110, 255))
    y += 34
    d.text((14, y), "hard cuts", fill=(30, 30, 30), font=font(20))
    for c in report.get("hard_cuts_s", []):
        d.line([(X(c * rec.fps), y), (X(c * rec.fps), y + 28)], fill=(230, 30, 30), width=4)
    y += 34
    d.text((14, y), "still", fill=(30, 30, 30), font=font(20))
    a, b = report.get("longest_still_s", [0, 0])
    if b > a:
        d.rectangle([X(a * rec.fps), y + 4, X(b * rec.fps), y + 24], fill=(150, 150, 150))
    y += 34
    for text, fs in texts.items():
        d.text((14, y), text[:22], fill=(30, 30, 30), font=font(18))
        runs, start = [], fs[0]
        for p, q in zip(fs, fs[1:] + [None]):
            if q is None or q != p + 1:
                runs.append((start, p))
                start = q
        for s, e in runs:
            d.rectangle([X(s), y + 6, X(e), y + 24], fill=(30, 30, 30))
        y += 34
    path = out_dir(rec) / "timeline.png"
    img.save(path)
    return path


def run(rec):
    cam, tr, moves, together, collisions, camera_moves = analyse(rec)
    return {
        "curves_image": str(draw_curves(rec, tr, moves).relative_to(rec.dir)),
        "timeline_image": str(draw_timeline(rec, cam, camera_moves).relative_to(rec.dir)),
        "moves": [{k: v for k, v in m.items() if k not in ("id", "start_frame", "end_frame")} for m in moves],
        "linear_moves": sum(1 for m in moves if m["easing"].startswith("linear")),
        "starts_without_stagger": together, "collisions": collisions, "camera_moves": camera_moves,
    }


if __name__ == "__main__":
    import json
    print(json.dumps(run(load(sys.argv[1])), indent=1)[:3500])
