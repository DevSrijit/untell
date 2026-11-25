"""Colour on pixels for one key frame.

Dominant colours by k-means in OKLab, each mapped to the nearest palette role or to a blend of two
roles (anti-aliased edges are blends). Off-palette colours are located. The accent's share of pixels
and its number of separate regions are counted. A greyscale panel checks that text still reads.
For videos without a palette, the known AI colour tells are measured instead.
"""
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from common import font, kmeans, label, load, out_dir, parse_rgb, to_oklab
from heat import ground_colour

OFF_PALETTE = 0.035  # OKLab distance from every role and every two-role blend
ACCENT_NEAR = 0.05


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def seg_dist(p, a, b):
    """Distance from p to the segment a-b, and the blend position t."""
    ab = b - a
    t = float(np.clip(np.dot(p - a, ab) / (np.dot(ab, ab) + 1e-9), 0, 1))
    return float(np.linalg.norm(p - (a + t * ab))), t


def chroma_hue(lab):
    c = float(np.hypot(lab[1], lab[2]))
    h = float((np.degrees(np.arctan2(lab[2], lab[1])) + 360) % 360)
    return c, h


def facts_for(rec, f):
    img = rec.frame(f)
    small = np.asarray(img.resize((rec.width // 4, rec.height // 4)), dtype=np.float32)
    px = small.reshape(-1, 3)
    lab = to_oklab(px)
    centres, assign = kmeans(lab.copy())
    shares = np.bincount(assign, minlength=len(centres)) / len(assign)
    palette = (rec.language.get("palette") or {}).get("roles")
    clusters = []
    off = []
    if palette:
        roles = {r: to_oklab(hexrgb(h).reshape(1, 3))[0] for r, h in palette.items()}
        names = list(roles)
    for j, c in enumerate(centres):
        if shares[j] < 0.002:
            continue
        rgb = np.clip(np.asarray(_lab_to_rgb(c)), 0, 255).astype(int)
        entry = {"hex": "#%02X%02X%02X" % tuple(rgb), "share_pct": round(100 * float(shares[j]), 2)}
        if palette:
            dist, role = min((float(np.linalg.norm(c - v)), r) for r, v in roles.items())
            best_blend = min(((seg_dist(c, roles[a], roles[b]) + (a, b)) for i, a in enumerate(names) for b in names[i + 1:]), key=lambda z: z[0])
            entry["nearest_role"] = role
            entry["role_distance"] = round(dist, 3)
            if dist > OFF_PALETTE and best_blend[0] <= OFF_PALETTE:
                entry["blend_of"] = [best_blend[2], best_blend[3], round(best_blend[1], 2)]
            if dist > OFF_PALETTE and best_blend[0] > OFF_PALETTE:
                mask = (assign == j).reshape(small.shape[:2])
                lbl, n = ndimage.label(mask)
                if n:
                    sizes = ndimage.sum(mask, lbl, range(1, n + 1))
                    big = int(np.argmax(sizes)) + 1
                    ys, xs = np.nonzero(lbl == big)
                    box = [int(xs.min() * 4), int(ys.min() * 4), int((xs.max() - xs.min() + 1) * 4), int((ys.max() - ys.min() + 1) * 4)]
                    # A region, not an anti-aliased sliver: at least 8 px across and 0.2 % of the frame.
                    if min(box[2], box[3]) < 8 or sizes[big - 1] / mask.size < 0.002:
                        clusters.append(entry)
                        continue
                    entry["off_palette"] = True
                    off.append({"hex": entry["hex"], "share_pct": entry["share_pct"], "nearest_role": role, "distance": round(dist, 3), "box": box})
        clusters.append(entry)
    clusters.sort(key=lambda e: -e["share_pct"])
    facts = {"frame": f, "time_s": round(f / rec.fps, 2), "dominant_colours": clusters, "off_palette": off}
    if palette and rec.language.get("accentMode") == "ink":
        facts["accent"] = "none: this system has no accent colour, so emphasis must come from size, weight or position"
    elif palette:
        acc = to_oklab(hexrgb(palette["accent"]).reshape(1, 3))[0]
        near = np.linalg.norm(lab - acc, axis=1) < ACCENT_NEAR
        mask = near.reshape(small.shape[:2])
        # Letters of one word are one region: join pieces closer than about 12 px before counting.
        lbl, n = ndimage.label(ndimage.binary_dilation(mask, iterations=3))
        sizes = ndimage.sum(mask, lbl, range(1, n + 1)) if n else []
        regions = int(sum(1 for s in sizes if s / mask.size > 0.0008))
        facts["accent_share_pct"] = round(100 * float(near.mean()), 2)
        facts["accent_regions"] = regions
        # How many things wear each ink: elements whose inked pixels are mostly that colour.
        # The accent counts in both its fill and its text value; extra inks (accent2, accent3) count apart.
        full = np.asarray(img, dtype=np.float32)
        ground = hexrgb(palette["ground"])
        inks = {"accent": [hexrgb(palette["accent"])] + ([hexrgb(palette["accentText"])] if palette.get("accentText") else [])}
        for k in ("accent2", "accent3"):
            if palette.get(k):
                inks[k] = [hexrgb(palette[k])]
        things = {k: [] for k in inks}
        for e in rec.content(f):
            x0, y0 = int(max(0, e["x"])), int(max(0, e["y"]))
            x1, y1 = int(min(rec.width, e["x"] + e["w"])), int(min(rec.height, e["y"] + e["h"]))
            if (x1 - x0) * (y1 - y0) < 100:
                continue
            box = full[y0:y1:2, x0:x1:2].reshape(-1, 3)
            inked = np.linalg.norm(box - ground, axis=1) > 40
            if inked.sum() < 20:
                continue
            for k, cols in inks.items():
                d = np.min([np.linalg.norm(box[inked] - c, axis=1) for c in cols], axis=0)
                if (d < 60).mean() > 0.5:
                    things[k].append(e.get("text", f'{e["kind"]} {round(e["w"])}x{round(e["h"])}')[:30])
        # A word inside a red headline and the headline are one thing: keep unique names.
        facts["accent_elements"] = sorted(set(things["accent"]))
        if len(inks) > 1:
            facts["elements_by_ink"] = {k: sorted(set(v)) for k, v in things.items()}
    else:
        g = to_oklab(ground_colour(np.asarray(img, dtype=np.float32)).reshape(1, 3).astype(np.float32))[0]
        gc, gh = chroma_hue(g)
        tells = []
        if g[0] < 0.35 and gc > 0.02 and 220 < gh < 290:
            tells.append(f"navy or ink-blue ground (L {g[0]:.2f}, chroma {gc:.3f}, hue {gh:.0f})")
        if g[0] < 0.25:
            neon = [c for c in clusters if chroma_hue(to_oklab(hexrgb(c["hex"]).reshape(1, 3))[0])[0] > 0.16]
            if neon:
                tells.append("saturated accents on a near-black ground: " + ", ".join(c["hex"] for c in neon[:3]))
        purple = [c for c in clusters if (lambda ch: ch[0] > 0.1 and 280 < ch[1] < 330)(chroma_hue(to_oklab(hexrgb(c["hex"]).reshape(1, 3))[0]))]
        if purple:
            tells.append("purple or violet: " + ", ".join(c["hex"] for c in purple[:3]))
        glow = soft_glow(img)
        if glow["share_pct"] >= 3:
            tells.append(f"a soft colour glow or blob behind the content: {glow['share_pct']}% of the frame at box {glow['box']}, "
                         f"peak {glow['peak_hex']} against the ground")
        facts["soft_glow"] = glow
        facts["ground_hex"] = "#%02X%02X%02X" % tuple(int(v) for v in ground_colour(np.asarray(img, dtype=np.float32)))
        facts["ai_colour_tells"] = tells
    # Greyscale: text contrast in luminance only, against the colour right behind it.
    grey_rows = []
    # Linear luminance (WCAG), not gamma-encoded grey: contrast ratios must use light, not code values.
    rgbf = np.asarray(img, dtype=np.float32) / 255.0
    lin = np.where(rgbf <= 0.04045, rgbf / 12.92, ((rgbf + 0.055) / 1.055) ** 2.4)
    G = lin @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    for e in rec.content(f):
        if e["kind"] != "text" or e["w"] * e["h"] < 200:
            continue
        x0, y0 = int(max(0, e["x"])), int(max(0, e["y"]))
        x1, y1 = int(min(rec.width, e["x"] + e["w"])), int(min(rec.height, e["y"] + e["h"]))
        box = G[y0:y1, x0:x1]
        if box.size < 50:
            continue
        lo, hi = np.percentile(box, 3), np.percentile(box, 97)
        ratio = (hi + 0.05) / (lo + 0.05)
        grey_rows.append({"text": e["text"][:28], "greyscale_contrast": round(float(ratio), 2)})
    facts["greyscale_text_contrast"] = sorted(grey_rows, key=lambda r: r["greyscale_contrast"])[:6]
    return facts


def soft_glow(img):
    """Finds a blurred colour blob: an area that differs from the ground in colour or lightness, changes
    smoothly (no edges, no text), and is large. Returns its share of the frame and its box."""
    from PIL import ImageFilter
    small = img.resize((img.width // 6, img.height // 6))
    arr = np.asarray(small, dtype=np.float32)
    lab = to_oklab(arr)
    g = to_oklab(ground_colour(np.asarray(img, dtype=np.float32)).reshape(1, 3).astype(np.float32))[0]
    diff = np.sqrt(((lab - g) * np.array([1.0, 2.0, 2.0])) ** 2).sum(-1)
    # Smooth: the local detail (difference from a blurred copy) is tiny, so it is not text, a rule or a shape.
    blurred = np.asarray(small.filter(ImageFilter.GaussianBlur(3)), dtype=np.float32)
    detail = np.abs(arr - blurred).sum(-1)
    mask = (diff > 0.012) & (diff < 0.25) & (detail < 6)
    mask = ndimage.binary_opening(mask, iterations=2)
    lbl, n = ndimage.label(mask)
    if not n:
        return {"share_pct": 0.0, "box": None, "peak_hex": None}
    sizes = ndimage.sum(mask, lbl, range(1, n + 1))
    big = int(np.argmax(sizes)) + 1
    region = lbl == big
    ys, xs = np.nonzero(region)
    # A glow fades: its difference from the ground falls off from a peak. A flat panel does not.
    vals = diff[region]
    fades = float(np.percentile(vals, 90) - np.percentile(vals, 10)) > 0.01
    share = float(region.mean()) * 100 if fades else 0.0
    peak = np.unravel_index(np.argmax(np.where(region, diff, 0)), diff.shape)
    rgb = arr[peak]
    return {"share_pct": round(share, 1), "box": [int(xs.min() * 6), int(ys.min() * 6), int((xs.max() - xs.min() + 1) * 6), int((ys.max() - ys.min() + 1) * 6)],
            "peak_hex": "#%02X%02X%02X" % tuple(int(v) for v in rgb)}


def _lab_to_rgb(lab):
    L, a, b = lab
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.291485548 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
    return [255 * (12.92 * c if c <= 0.0031308 else 1.055 * max(c, 0) ** (1 / 2.4) - 0.055) for c in rgb]


def overlay(rec, f, facts):
    W, H = rec.width, rec.height
    frame = rec.frame(f)
    grey = frame.convert("L").convert("RGB")
    marked = frame.copy()
    d = ImageDraw.Draw(marked)
    for o in facts["off_palette"]:
        x, y, w, h = o["box"]
        d.rectangle([x, y, x + w, y + h], outline=(255, 0, 200), width=6)
        label(d, (x + 6, max(4, y - 34)), f'off-palette {o["hex"]} ({o["share_pct"]}%)', bg=(200, 0, 160))
    sw = 120
    strip_h = sw + 90
    out = Image.new("RGB", (W * 2 + 24, H + strip_h), (24, 24, 24))
    out.paste(marked, (0, strip_h))
    out.paste(grey, (W + 24, strip_h))
    d = ImageDraw.Draw(out)
    x = 10
    for c in facts["dominant_colours"][:9]:
        d.rectangle([x, 10, x + sw, 10 + sw], fill=c["hex"])
        tag = c.get("nearest_role", "")
        if c.get("blend_of"):
            tag = f'{c["blend_of"][0]}/{c["blend_of"][1]}'
        if c.get("off_palette"):
            tag = "OFF-PALETTE"
        d.text((x, 14 + sw), f'{c["share_pct"]}%', fill=(255, 255, 255), font=font(22))
        d.text((x, 40 + sw), tag[:14], fill=(255, 120, 220) if c.get("off_palette") else (200, 200, 200), font=font(20))
        x += sw + 18
    d.text((W + 34, strip_h - 40), "greyscale", fill=(255, 255, 255), font=font(26))
    path = out_dir(rec) / f"colour-f{f:04d}.png"
    out.save(path)
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
    print(json.dumps(run(rec, frames), indent=1))
