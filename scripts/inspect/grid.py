"""Grid overlay and alignment facts for one key frame.

Draws the language's columns, margins, gutters, safe zones and a baseline grid over the frame, outlines
every element, and marks near-miss edges in red with their offset. Facts are measurements, not advice.
"""
import statistics
import sys

from PIL import Image, ImageDraw

from common import grid_lines, label, load, out_dir, type_scale_px

NEAR = (2.0, 8.0)  # an edge this far off a line is a near miss; closer is aligned, further is a choice
BASELINE = 24


def _elements(rec, f):
    """Content elements at rest, without inline pieces nested inside another text element."""
    els = [e for e in rec.content(f) if rec.at_rest(f, e)]
    texts = [e for e in els if e["kind"] == "text"]

    def nested(e):
        for t in texts:
            if t is e:
                continue
            if t["x"] <= e["x"] + 0.5 and t["y"] <= e["y"] + 0.5 and e["x"] + e["w"] <= t["x"] + t["w"] + 0.5 and e["y"] + e["h"] <= t["y"] + t["h"] + 0.5 \
                    and (t["w"] * t["h"]) > (e["w"] * e["h"]) * 1.05:
                return True
        return False
    return [e for e in els if not nested(e)]


def name(e):
    if e["kind"] == "text":
        return f'"{e["text"][:28]}"'
    return f'{e["kind"]} {round(e["w"])}x{round(e["h"])}'


def facts_for(rec, f):
    g = grid_lines(rec)
    els = _elements(rec, f)
    near_grid, on_grid, near_pairs, aligned_pairs = [], [], [], []
    for e in els:
        edges = [("left", e["x"])] + ([("right", e["x"] + e["w"])] if e["kind"] != "text" else [])
        for side, x in edges:
            d, guide = min((abs(x - gx), gx) for gx in g["edges"])
            if d < NEAR[0]:
                on_grid.append({"element": name(e), "edge": side, "x": round(x, 1)})
            elif d <= NEAR[1]:
                near_grid.append({"element": name(e), "edge": side, "x": round(x, 1), "line": guide,
                                  "offset_px": round(x - guide, 1), "snap_px": round(guide - x, 1), "box": [e["x"], e["y"], e["w"], e["h"]]})
    for i, a in enumerate(els):
        for b in els[i + 1:]:
            for side, va, vb in (("left", a["x"], b["x"]), ("top", a["y"], b["y"]), ("bottom", a["y"] + a["h"], b["y"] + b["h"])):
                d = abs(va - vb)
                if d < NEAR[0]:
                    aligned_pairs.append((name(a), name(b), side))
                elif d <= NEAR[1]:
                    near_pairs.append({"a": name(a), "b": name(b), "edge": side, "a_px": round(va, 1), "b_px": round(vb, 1), "delta_px": round(vb - va, 1)})
    # Type sizes against the token scale.
    scale = type_scale_px(rec)
    sizes = []
    for e in els:
        if e["kind"] != "text":
            continue
        if scale:
            role, px = min(scale.items(), key=lambda kv: abs(kv[1] - e["fontPx"]))
            off = (e["fontPx"] - px) / px
            sizes.append({"text": e["text"][:28], "font_px": e["fontPx"], "nearest_role": role, "role_px": px, "off_pct": round(100 * off, 1)})
        else:
            sizes.append({"text": e["text"][:28], "font_px": e["fontPx"]})
    distinct_sizes = sorted({round(e["fontPx"]) for e in els if e["kind"] == "text"})
    # Stacked spacing: elements that overlap horizontally, in reading order.
    stack = sorted(els, key=lambda e: e["y"])
    gaps = []
    for a, b in zip(stack, stack[1:]):
        if min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"]) > 20 and b["y"] >= a["y"] + a["h"] - 1:
            gaps.append({"above": name(a), "below": name(b), "gap_px": round(b["y"] - (a["y"] + a["h"]), 1)})
    gap_values = [x["gap_px"] for x in gaps]
    # Safe zones.
    intrusions = []
    for e in els:
        # Safe zones apply to text: graphics may run under the platform's UI.
        if e["kind"] != "text":
            continue
        if e["y"] < g["safeTop"] - 1:
            intrusions.append({"element": name(e), "zone": "top", "px_inside": round(g["safeTop"] - e["y"], 1)})
        if e["y"] + e["h"] > g["safeBottom"] + 1:
            intrusions.append({"element": name(e), "zone": "bottom", "px_inside": round(e["y"] + e["h"] - g["safeBottom"], 1)})
        # Side zones: the platform's buttons and captions sit there.
        if e["x"] < g["safeLeft"] - 1:
            intrusions.append({"element": name(e), "zone": "left", "px_inside": round(g["safeLeft"] - e["x"], 1)})
        right = g["lowBandRight"] if e["y"] + e["h"] > g["lowBandTop"] else g["safeRight"]
        if e["x"] + e["w"] > right + 1:
            intrusions.append({"element": name(e), "zone": "right", "px_inside": round(e["x"] + e["w"] - right, 1)})
    # Out of frame: px of an element at rest beyond each frame edge.
    W, H = rec.width, rec.height
    out_of_frame = []
    for e in els:
        sides = {"left": -e["x"], "right": e["x"] + e["w"] - W, "top": -e["y"], "bottom": e["y"] + e["h"] - H}
        sides = {k: round(v, 1) for k, v in sides.items() if v > 1}
        if sides:
            out_of_frame.append({"element": name(e), "px_outside": sides})
    # Covered: text with another element drawn above it over more than 10 % of its box.
    covered = []
    for tx in els:
        if tx["kind"] != "text":
            continue
        for o in els:
            if o is tx or o["z"] <= tx["z"]:
                continue
            ix = min(tx["x"] + tx["w"], o["x"] + o["w"]) - max(tx["x"], o["x"])
            iy = min(tx["y"] + tx["h"], o["y"] + o["h"]) - max(tx["y"], o["y"])
            if ix > 0 and iy > 0 and ix * iy > 0.1 * tx["w"] * tx["h"]:
                covered.append({"text": name(tx), "covered_by": name(o), "overlap_pct": round(100 * ix * iy / (tx["w"] * tx["h"]), 1),
                                "box": [round(max(tx["x"], o["x"])), round(max(tx["y"], o["y"])), round(ix), round(iy)]})
    left_edges = sorted({round(e["x"]) for e in els})
    return {
        "frame": f, "time_s": round(f / rec.fps, 2), "elements_checked": len(els),
        "on_grid": len(on_grid), "near_miss_grid": near_grid, "near_miss_pairs": near_pairs, "aligned_pairs": len(aligned_pairs),
        "left_edges_px": left_edges, "type_sizes": sizes, "distinct_type_sizes_px": distinct_sizes,
        "stack_gaps": gaps, "gap_spread_px": round(max(gap_values) - min(gap_values), 1) if len(gap_values) > 1 else 0,
        "gap_stdev_px": round(statistics.pstdev(gap_values), 1) if len(gap_values) > 1 else 0,
        "safe_zone_intrusions": intrusions,
        "out_of_frame": out_of_frame, "covered_text": covered,
    }


def overlay(rec, f, facts):
    g = grid_lines(rec)
    W, H = rec.width, rec.height
    base = rec.frame(f).convert("RGBA")
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # Baseline grid, columns, safe zones.
    for y in range(0, H, BASELINE):
        d.line([(0, y), (W, y)], fill=(0, 140, 255, 22), width=1)
    edges = g["edges"]
    for i in range(0, len(edges), 2):
        d.rectangle([edges[i], 0, edges[i + 1], H], fill=(0, 160, 255, 30))
    for x in (g["margin"], W - g["marginRight"]):
        d.line([(x, 0), (x, H)], fill=(0, 120, 255, 140), width=2)
    d.rectangle([0, 0, W, g["safeTop"]], fill=(255, 60, 60, 38))
    d.rectangle([0, g["safeBottom"], W, H], fill=(255, 60, 60, 38))
    if g["safeLeft"] > 0:
        d.rectangle([0, g["safeTop"], g["safeLeft"], g["safeBottom"]], fill=(255, 60, 60, 38))
    if g["safeRight"] < W:
        d.rectangle([g["safeRight"], g["safeTop"], W, g["lowBandTop"]], fill=(255, 60, 60, 38))
        d.rectangle([g["lowBandRight"], g["lowBandTop"], W, g["safeBottom"]], fill=(255, 60, 60, 38))
    # Element boxes.
    for e in _elements(rec, f):
        color = (0, 110, 255, 230) if e["kind"] == "text" else (200, 0, 200, 230)
        d.rectangle([e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]], outline=color, width=2)
    img = Image.alpha_composite(base, layer)
    d = ImageDraw.Draw(img)
    # Near misses in red, with their offset.
    for nm in facts["near_miss_grid"]:
        x, (bx, by, bw, bh) = nm["x"], nm["box"]
        d.line([(x, by - 20), (x, by + bh + 20)], fill=(255, 0, 0), width=5)
        d.line([(nm["line"], by - 20), (nm["line"], by + bh + 20)], fill=(255, 0, 0), width=1)
        label(d, (x + 8, by - 34), f'{nm["offset_px"]:+} px off column line', bg=(220, 0, 0))
    for c in facts["covered_text"]:
        x, y, w, h = c["box"]
        d.rectangle([x, y, x + w, y + h], outline=(255, 140, 0), width=6)
        label(d, (x + 6, y + 6), f'covers text ({c["overlap_pct"]}%)', bg=(220, 110, 0))
    for o in facts["out_of_frame"]:
        label(d, (20, 60 + 40 * facts["out_of_frame"].index(o)), f'{o["element"]} outside the frame: {o["px_outside"]}', bg=(220, 0, 0))
    label(d, (14, 14), f"grid · frame {f} ({f / rec.fps:.2f} s) · {rec.language['name']}", size=24)
    label(d, (14, H - 44), "blue: columns and margins · red bands: safe zones · boxes: text (blue), shapes (magenta)", size=20)
    path = out_dir(rec) / f"grid-f{f:04d}.png"
    img.convert("RGB").save(path)
    return path


def run(rec, frames):
    results = []
    for f in frames:
        facts = facts_for(rec, f)
        facts["image"] = str(overlay(rec, f, facts).relative_to(rec.dir))
        results.append(facts)
    return results


if __name__ == "__main__":
    rec = load(sys.argv[1])
    frames = [int(x) for x in sys.argv[2].split(",")] if len(sys.argv) > 2 else [75, 150, 225]
    import json
    for r in run(rec, frames):
        print(json.dumps({k: v for k, v in r.items() if k not in ("type_sizes",)}, indent=1)[:1800])
