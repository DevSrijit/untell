"""Balance and composition facts for one key frame.

Visual weight per pixel is its difference from the ground in OKLab (lightness, with colour counted
double), so a red bar weighs more than a grey rule of the same size. The overlay shows the thirds,
the frame centre, the centre of mass and the weight of each quadrant.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw

from common import label, load, out_dir, to_oklab
from heat import ground_colour

WEAK_HIERARCHY = 1.6


def weight_map(rec, f):
    img = np.asarray(rec.frame(f).resize((rec.width // 2, rec.height // 2)), dtype=np.float32)
    lab = to_oklab(img)
    g = to_oklab(ground_colour(img).reshape(1, 3).astype(np.float32))[0]
    w = np.sqrt(((lab - g) * np.array([1.0, 2.0, 2.0])) ** 2).sum(-1)
    w[w < 0.04] = 0  # grain and anti-aliasing are not weight
    return w


def facts_for(rec, f):
    w = weight_map(rec, f)
    h2, w2 = w.shape
    total = float(w.sum()) or 1.0
    ys, xs = np.mgrid[0:h2, 0:w2]
    cx, cy = float((w * xs).sum() / total) * 2, float((w * ys).sum() / total) * 2
    W, H = rec.width, rec.height
    quad = {"top_left": w[: h2 // 2, : w2 // 2].sum(), "top_right": w[: h2 // 2, w2 // 2:].sum(),
            "bottom_left": w[h2 // 2:, : w2 // 2].sum(), "bottom_right": w[h2 // 2:, w2 // 2:].sum()}
    thirds = [w[int(h2 * k / 3): int(h2 * (k + 1) / 3)].sum() for k in range(3)]
    g = rec.language["grid"]
    safe = w[int(g["safeTop"] * h2): int((1 - g["safeBottom"]) * h2)]
    whitespace = float((safe == 0).mean())
    # Content margins: the union of visible content.
    els = rec.content(f)
    if els:
        x0 = min(max(0, e["x"]) for e in els); y0 = min(max(0, e["y"]) for e in els)
        x1 = max(min(W, e["x"] + e["w"]) for e in els); y1 = max(min(H, e["y"] + e["h"]) for e in els)
        margins = {"top": round(y0), "bottom": round(H - y1), "left": round(x0), "right": round(W - x1)}
    else:
        margins = None
    # Hierarchy: the largest text against the next size down.
    sizes = sorted({round(e["fontPx"]) for e in els if e["kind"] == "text"}, reverse=True)
    ratio = round(sizes[0] / sizes[1], 2) if len(sizes) > 1 else None
    return {
        "frame": f, "time_s": round(f / rec.fps, 2),
        "centre_of_mass_px": [round(cx), round(cy)], "offset_from_centre_px": [round(cx - W / 2), round(cy - H / 2)],
        "centre_of_mass_height_pct": round(100 * cy / H, 1),
        "weight_pct_by_quadrant": {k: round(100 * float(v) / total, 1) for k, v in quad.items()},
        "weight_pct_top_middle_bottom": [round(100 * float(t) / total, 1) for t in thirds],
        "left_right_pct": [round(100 * float(w[:, : w2 // 2].sum()) / total, 1), round(100 * float(w[:, w2 // 2:].sum()) / total, 1)],
        "whitespace_pct_in_safe_area": round(100 * whitespace, 1),
        "content_margins_px": margins,
        "text_sizes_px": sizes[:5], "largest_to_next_text_ratio": ratio, "weak_hierarchy": ratio is not None and ratio < WEAK_HIERARCHY,
    }


def overlay(rec, f, facts):
    W, H = rec.width, rec.height
    img = rec.frame(f).convert("RGBA")
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    for k in (1, 2):
        d.line([(W * k / 3, 0), (W * k / 3, H)], fill=(0, 120, 255, 150), width=2)
        d.line([(0, H * k / 3), (W, H * k / 3)], fill=(0, 120, 255, 150), width=2)
    d.line([(W / 2, 0), (W / 2, H)], fill=(120, 120, 120, 120), width=1)
    d.line([(0, H / 2), (W, H / 2)], fill=(120, 120, 120, 120), width=1)
    img = Image.alpha_composite(img, layer)
    d = ImageDraw.Draw(img)
    cx, cy = facts["centre_of_mass_px"]
    d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], outline=(255, 0, 120), width=7)
    d.line([(cx - 40, cy), (cx + 40, cy)], fill=(255, 0, 120), width=4)
    d.line([(cx, cy - 40), (cx, cy + 40)], fill=(255, 0, 120), width=4)
    d.line([(W / 2, H / 2), (cx, cy)], fill=(255, 0, 120), width=3)
    label(d, (cx + 34, cy - 14), f"centre of mass ({facts['offset_from_centre_px'][0]:+}, {facts['offset_from_centre_px'][1]:+} px from centre)", bg=(200, 0, 100))
    q = facts["weight_pct_by_quadrant"]
    for (k, v), (x, y) in zip(q.items(), [(20, H / 2 - 50), (W / 2 + 20, H / 2 - 50), (20, H / 2 + 14), (W / 2 + 20, H / 2 + 14)]):
        label(d, (x, y), f"{v}% weight", bg=(0, 90, 200))
    label(d, (14, 14), f"balance · frame {f} ({f / rec.fps:.2f} s) · blue: thirds", size=24)
    path = out_dir(rec) / f"balance-f{f:04d}.png"
    img.convert("RGB").save(path)
    return path


def run(rec, frames):
    out = []
    for f in frames:
        facts = facts_for(rec, f)
        facts["image"] = str(overlay(rec, f, facts).relative_to(rec.dir))
        out.append(facts)
    return out


if __name__ == "__main__":
    import json
    rec = load(sys.argv[1])
    frames = [int(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 else [75, 150, 225]
    print(json.dumps(run(rec, frames), indent=1)[:2500])
