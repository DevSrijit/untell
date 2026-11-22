"""Heat maps for one key frame, and a words-on-screen strip for the film.

heat-fNNNN.png has three panels over the frame:
  motion     pixel change accumulated over the half second around the frame;
  attention  a cheap salience model per element: luminance contrast x size x centre bias x motion,
             with the predicted first read and any element that competes with it;
  emptiness  dead regions: no element and no visible variation in the pixels.
density.png charts words on screen, frame by frame.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from common import font, label, load, out_dir

COMPETES = 0.75  # a second element scoring this share of the first competes for attention
CELL = 60  # emptiness cell, px


def grey(img: Image.Image, scale=4) -> np.ndarray:
    return np.asarray(img.convert("L").resize((img.width // scale, img.height // scale)), dtype=np.float32)


def motion_map(rec, f, half=8):
    """Mean absolute change per pixel across frames f-half..f+half (downscaled 4x)."""
    lo, hi = max(1, f - half), min(rec.n - 1, f + half)
    prev = grey(Image.open(rec.dir / "frames" / f"f{lo - 1:04d}.jpg"))
    acc = np.zeros_like(prev)
    for k in range(lo, hi + 1):
        cur = grey(Image.open(rec.dir / "frames" / f"f{k:04d}.jpg"))
        acc += np.abs(cur - prev)
        prev = cur
    return acc / (hi - lo + 1)


def colorize(m: np.ndarray, size, alpha=0.62):
    """A heat colour map (dark blue → red → yellow) as an RGBA overlay."""
    v = np.clip(m / (np.percentile(m, 99.5) + 1e-6), 0, 1)
    r = np.clip(v * 2.2, 0, 1)
    g = np.clip(v * 2.2 - 1.0, 0, 1)
    b = np.clip(0.6 - v * 1.2, 0, 1) * (v > 0.02)
    a = np.clip(v * 1.6, 0, 1) * alpha
    rgba = (np.stack([r, g, b, a], -1) * 255).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA").resize(size, Image.BILINEAR)


def ground_colour(img: np.ndarray) -> np.ndarray:
    """The ground: the most common colour along the frame's left and right edges."""
    edge = np.concatenate([img[:, :8].reshape(-1, 3), img[:, -8:].reshape(-1, 3)])
    q = (edge // 8).astype(np.int32)
    keys, counts = np.unique(q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2], return_counts=True)
    k = keys[np.argmax(counts)]
    return np.array([k // 10000, (k // 100) % 100, k % 100]) * 8 + 4


def attention(rec, f, motion):
    """Scores each visible element: how far it stands out from the ground (lightness and colour),
    its size, its distance from the centre, and its motion. Returns elements sorted by score."""
    from common import to_oklab
    img = np.asarray(rec.frame(f), dtype=np.float32)
    lab = to_oklab(img)
    g = to_oklab(ground_colour(img).reshape(1, 3).astype(np.float32))[0]
    diff = np.sqrt(((lab - g) * np.array([1.0, 2.0, 2.0])) ** 2).sum(-1)  # colour difference counts double
    W, H = rec.width, rec.height
    mo = np.asarray(Image.fromarray(motion).resize((W, H)), dtype=np.float32)
    scored = []
    for e in rec.content(f):
        x0, y0 = int(max(0, e["x"])), int(max(0, e["y"]))
        x1, y1 = int(min(W, e["x"] + e["w"])), int(min(H, e["y"] + e["h"]))
        if x1 - x0 < 4 or y1 - y0 < 4:
            continue
        c = float(np.percentile(diff[y0:y1, x0:x1], 90))
        area = (x1 - x0) * (y1 - y0) / (W * H)
        cx, cy = (x0 + x1) / 2 / W - 0.5, (y0 + y1) / 2 / H - 0.45
        centre = float(np.exp(-(cx ** 2 + cy ** 2) / 0.18))
        m = float(mo[y0:y1, x0:x1].mean()) / 255
        score = (c + 0.02) * (area ** 0.5) * (0.6 + 0.4 * centre) * (1 + 6 * m)
        scored.append({"element": e, "score": score, "contrast": round(c, 3), "area_pct": round(100 * area, 1), "motion": round(m, 3)})
    scored.sort(key=lambda s: -s["score"])
    # Nested pieces of one text block (a red word inside a headline) are one reading target.
    blocks = [s for s in scored if not any(_inside(s["element"], o["element"]) and o is not s and
              (o["element"]["w"] * o["element"]["h"]) > (s["element"]["w"] * s["element"]["h"]) * 1.05 for o in scored)]
    kept = []
    for b in blocks:
        be = b["element"]
        parts = [s for s in scored if be["x"] <= s["element"]["x"] + s["element"]["w"] / 2 <= be["x"] + be["w"]
                 and be["y"] <= s["element"]["y"] + s["element"]["h"] / 2 <= be["y"] + be["h"]]
        b = dict(b)
        b["score"] = max(s["score"] for s in parts)
        texts = sorted((s["element"] for s in parts if s["element"]["kind"] == "text"), key=lambda e: (round(e["y"] / 20), e["x"]))
        b["full_text"] = " ".join(e["text"] for e in texts)
        kept.append(b)
    kept.sort(key=lambda s: -s["score"])
    total = sum(s["score"] for s in kept) or 1
    for s in kept:
        s["share"] = round(s["score"] / total, 3)
    return kept


def _inside(a, b):
    return b["x"] - 1 <= a["x"] and b["y"] - 1 <= a["y"] and a["x"] + a["w"] <= b["x"] + b["w"] + 1 and a["y"] + a["h"] <= b["y"] + b["h"] + 1


def emptiness(rec, f):
    """Cells with no element and almost no pixel variation. Returns a boolean grid and facts."""
    img = np.asarray(rec.frame(f).convert("L"), dtype=np.float32)
    W, H = rec.width, rec.height
    cols, rows = W // CELL, H // CELL
    occupied = np.zeros((rows, cols), bool)
    for e in rec.content(f, min_opacity=0.15):
        c0, c1 = int(max(0, e["x"]) // CELL), int(min(W - 1, e["x"] + e["w"]) // CELL)
        r0, r1 = int(max(0, e["y"]) // CELL), int(min(H - 1, e["y"] + e["h"]) // CELL)
        occupied[r0:r1 + 1, c0:c1 + 1] = True
    dead = np.zeros((rows, cols), bool)
    for r in range(rows):
        for c in range(cols):
            if not occupied[r, c] and img[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL].std() < 4:
                dead[r, c] = True
    g = rec.language["grid"]
    safe = dead[int(g["safeTop"] * H // CELL):int((1 - g["safeBottom"]) * H // CELL)]
    thirds = [round(100 * float(safe[int(len(safe) * k / 3):int(len(safe) * (k + 1) / 3)].mean()), 1) for k in range(3)]
    # The largest run of fully dead rows: "the bottom is dead" in one number.
    full = dead.all(axis=1)
    best, start, run_start = 0, 0, None
    for r, v in enumerate(list(full) + [False]):
        if v and run_start is None:
            run_start = r
        elif not v and run_start is not None:
            if r - run_start > best:
                best, start = r - run_start, run_start
            run_start = None
    return dead, {"dead_pct_in_safe_area": round(100 * float(safe.mean()), 1), "dead_pct_by_third_of_safe_area": thirds,
                  "largest_empty_band_px": [start * CELL, (start + best) * CELL] if best else None}


def panel(base, overlay=None):
    img = base.convert("RGBA")
    if overlay is not None:
        img = Image.alpha_composite(img, overlay)
    return img


def run_frame(rec, f):
    base = rec.frame(f)
    W, H = rec.width, rec.height
    mo = motion_map(rec, f)
    att = attention(rec, f, mo)
    dead, empty_facts = emptiness(rec, f)

    # Panel 1: motion.
    p1 = panel(base.copy().convert("L").convert("RGB"), colorize(mo, (W, H)))
    # Panel 2: attention, element by element.
    p2 = base.copy().convert("L").convert("RGB").convert("RGBA")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    top = att[0]["score"] if att else 1
    for s in att:
        e, v = s["element"], s["score"] / top
        d.rectangle([e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]], fill=(255, int(170 - 120 * v), 0, int(40 + 150 * v)))
    p2 = Image.alpha_composite(p2, layer)
    d2 = ImageDraw.Draw(p2)
    competitors = [s for s in att[1:] if s["score"] >= COMPETES * top]
    for rank, s in enumerate(att[:1] + competitors):
        e = s["element"]
        d2.rectangle([e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]], outline=(255, 0, 0) if rank else (0, 200, 90), width=6)
        label(d2, (e["x"] + 6, max(4, e["y"] - 34)), "first read" if rank == 0 else f"competes ({s['score'] / top:.0%})",
              bg=(0, 150, 70) if rank == 0 else (220, 0, 0))
    # Panel 3: emptiness.
    p3 = base.copy().convert("RGBA")
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for r, c in zip(*np.nonzero(dead)):
        d.rectangle([c * CELL, r * CELL, (c + 1) * CELL - 1, (r + 1) * CELL - 1], fill=(120, 0, 255, 70))
    p3 = Image.alpha_composite(p3, layer)

    gap = 24
    out = Image.new("RGB", (W * 3 + gap * 2, H + 70), (24, 24, 24))
    for i, (p, title) in enumerate([(p1, "motion (±0.27 s)"), (p2, "attention: first read and competitors"), (p3, f"empty: {empty_facts['dead_pct_in_safe_area']}% of the safe area")]):
        out.paste(p.convert("RGB"), (i * (W + gap), 70))
        ImageDraw.Draw(out).text((i * (W + gap) + 10, 16), title, fill=(255, 255, 255), font=font(34))
    path = out_dir(rec) / f"heat-f{f:04d}.png"
    out.save(path)

    def name(s):
        e = s["element"]
        if s.get("full_text"):
            return f'"{s["full_text"][:40]}"'
        return f'{e["kind"]} {round(e["w"])}x{round(e["h"])} at ({round(e["x"])}, {round(e["y"])})'
    hot = np.unravel_index(np.argmax(mo), mo.shape)
    return {
        "frame": f, "time_s": round(f / rec.fps, 2), "image": str(path.relative_to(rec.dir)),
        "first_read": name(att[0]) if att else None,
        "first_read_share": att[0]["share"] if att else None,
        "competing_focal_points": [{"element": name(s), "relative_score": round(s["score"] / top, 2)} for s in competitors],
        "focal_count": 1 + len(competitors) if att else 0,
        "motion_hotspot_px": [int(hot[1] * 4), int(hot[0] * 4)], "motion_mean": round(float(mo.mean()), 2),
        **empty_facts,
    }


PROSE = {"display", "headline", "body", "caption"}


def count_words(texts):
    """Words in visible texts. Pieces of one line (typed characters, a word split for colour) that sit
    edge to edge on the same row are joined first, so they count as the words they spell."""
    rows = {}
    for t in texts:
        rows.setdefault((round(t["y"] / 4), t.get("role")), []).append(t)
    seen, count = set(), 0
    for row in rows.values():
        row.sort(key=lambda t: t["x"])
        line, last = "", None
        for t in row:
            if last is not None and t["x"] - (last["x"] + last["w"]) > 0.25 * t["h"]:
                line += " "
            line += t["text"]
            last = t
        for piece in [line]:
            if piece not in seen:
                seen.add(piece)
                count += len(piece.split())
    return count


def density_strip(rec):
    """Words on screen per frame (visible text, opacity >= 0.5), as a strip chart.
    When the film marks type roles (a design-system film), only prose counts: display, headline, body
    and caption. Labels and numbers on charts and diagrams are read differently and do not count."""
    words = []
    roles_known = any(t.get("role") for fr in rec.tracks for t in fr)
    for f in range(rec.n):
        vis = [t for t in rec.tracks[f]
               if (not roles_known or t.get("role") in PROSE) and t["opacity"] >= 0.5
               and t["x"] < rec.width and t["y"] < rec.height and t["x"] + t["w"] > 0 and t["y"] + t["h"] > 0]
        words.append(count_words(vis))
    W, H = 1600, 360
    img = Image.new("RGB", (W, H), (250, 250, 250))
    d = ImageDraw.Draw(img)
    top = max(max(words), 12)
    pad = 60
    for limit, color in ((6, (255, 170, 0)), (12, (230, 60, 60))):
        y = H - pad - (H - 2 * pad) * limit / top
        d.line([(pad, y), (W - 20, y)], fill=color, width=2)
        d.text((W - 210, y - 30), f"{limit} words", fill=color, font=font(22))
    pts = [(pad + (W - pad - 20) * f / (rec.n - 1), H - pad - (H - 2 * pad) * w / top) for f, w in enumerate(words)]
    d.line(pts, fill=(20, 20, 20), width=3)
    for s in range(0, int(rec.n / rec.fps) + 1):
        x = pad + (W - pad - 20) * s * rec.fps / (rec.n - 1)
        d.line([(x, H - pad), (x, H - pad + 8)], fill=(80, 80, 80), width=2)
        d.text((x - 8, H - pad + 12), f"{s}s", fill=(80, 80, 80), font=font(20))
    d.text((pad, 14), "words on screen", fill=(20, 20, 20), font=font(26))
    path = out_dir(rec) / "density.png"
    img.save(path)
    budget = (rec.language.get("density") or {}).get("maxWords")
    return {"image": str(path.relative_to(rec.dir)), "counts": "prose only" if roles_known else "all text", "budget": budget,
            "seconds_over_budget": round(sum(w > budget for w in words) / rec.fps, 2) if budget else None,
            "max_words": max(words), "mean_words": round(sum(words) / len(words), 1),
            "seconds_over_6_words": round(sum(w > 6 for w in words) / rec.fps, 2), "seconds_with_no_words": round(sum(w == 0 for w in words) / rec.fps, 2)}


def run(rec, frames):
    return {"frames": [run_frame(rec, f) for f in frames], "density": density_strip(rec)}


if __name__ == "__main__":
    import json
    rec = load(sys.argv[1])
    frames = [int(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 else [75, 150, 225]
    print(json.dumps(run(rec, frames), indent=1)[:3000])
