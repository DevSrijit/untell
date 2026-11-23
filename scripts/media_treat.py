"""Treats a fetched photo for a design system, so stock looks like it belongs to the system.

Usage: python3 scripts/media_treat.py assets/media/<name> <system id>
Reads source.jpg and cutout.png (the subject with transparency); writes:
  plate.jpg    the whole photo, graded for the system
  plate-top.jpg  (dark systems) the plate with its top eased into the ground, for a photo framed low
  subject.png  the cut-out subject, graded the same way, with its alpha
  meta.json    size, the subject's box and centre (fractions of the photo), and the grade used
  ink-<role>.png  (duotone systems with inks: Riso) one halftone separation per ink, for photo `passes`
  paper.png    (posterize systems: Cutout) the subject as a two-tone paper cut with a smoothed edge, for photo `paper`

With --layers it writes only ink-*.png and paper.png, and leaves the other files as they are.

Also a module: scripts/media_video.py grades footage frame by frame with the same functions.

Grades come from each system's tokens.json ("media.grade", written from src/system/media-spec.ts):
mono, tone, duotone, posterize, phosphor or none. Each maps the picture's black and white onto palette
roles, so the result stays on the system's palette. "none" (and --as-is) leaves the picture untouched.
"""
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter



def luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def s_curve(x, k):
    # A smooth S around the middle; k > 1 adds contrast.
    return 1 / (1 + np.exp(-k * (x - 0.5)))


def levels_of(a):
    """The black and white points a grade stretches to: 3rd and 97th percentile of luma."""
    y = luma(a)
    return float(np.percentile(y, 3)), float(np.percentile(y, 97))


KEY_SHARE = 0.35  # how far a tone grade stretches a picture's levels toward full range: it keeps the key


def key_levels(samples, system):
    """The levels for a picture (or the sample frames of a clip): (lo, hi, share). `share` is how far a tone grade
    stretches toward full range: KEY_SHARE, which keeps a night scene dark, or more when the graded picture would show too
    little detail on a phone (detail_fault): the least of 0.5, 0.65, 0.8 and 1 that shows enough. One share for a whole
    clip, so footage does not flicker."""
    lv = [levels_of(a) for a in samples]
    lo, hi = float(np.median([v[0] for v in lv])), float(np.median([v[1] for v in lv]))
    t = tokens_of(system) if system != "none" else None
    if ((t or {}).get("media", {}).get("grade") or {}).get("kind") != "tone":
        return lo, hi, KEY_SHARE
    for share in (KEY_SHARE, 0.5, 0.65, 0.8, 1.0):
        if all(detail_fault(grade_array(a, system, (lo, hi, share))) is None for a in samples):
            return lo, hi, share
    return lo, hi, 1.0


def tokens_of(system):
    # untell sets UNTELL_SYSTEMS to the project's systems folder. There a missing system is an error, so a grade
    # never falls back to "none" when a path misses. The repository reads its own systems/ folder.
    own = os.environ.get("UNTELL_SYSTEMS")
    p = (Path(own) if own else Path(__file__).resolve().parents[1] / "systems") / system / "tokens.json"
    if not p.exists():
        if own:
            raise SystemExit(f"no design system {system}: {p} is missing")
        return None
    return json.loads(p.read_text())


def colour(t, role):
    g = t["colors"][role].lstrip("#")
    return np.array([int(g[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


def curve(x, k):
    """An S-curve on 0-1 with strength k (0: straight)."""
    if k <= 0:
        return x
    return (s_curve(x, k) - s_curve(0, k)) / (s_curve(1, k) - s_curve(0, k))


def ramp(t, stops):
    """t (0-1) through colour stops, evenly spaced, linearly between them."""
    n = len(stops) - 1
    x = np.clip(t, 0, 1) * n
    i = np.minimum(np.floor(x).astype(int), n - 1)
    f = (x - i)[..., None]
    s = np.stack(stops)
    return s[i] * (1 - f) + s[i + 1] * f


# The ink over the brightest part of a picture behind type: WCAG's 4.5:1 for normal text, plus a margin for what the
# film does to the picture (JPEG, scaling, a push), so small type at the edge of a light patch still passes.
TEXT_CONTRAST = 5.0


def luminance(c):
    """WCAG relative luminance of an sRGB colour (0-1)."""
    c = np.asarray(c, dtype=np.float64)
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return float(0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2])


def behind_type_share(t, base, far):
    """How far a picture behind type may reach from its ground end `base` toward its other end `far` (0-1): the
    largest share at which the system's ink keeps TEXT_CONTRAST over every point of the picture. Type in ink (a
    statement, a name, a role line) then reads anywhere on it, and the picture keeps all the range that allows (a
    fixed share of the light role made Nocturne's and Title's pictures too dark to read on a phone: their brightest
    point sat at 60 and 31 of 255). On a dark ground the picture's light is capped; on a paper ground, its dark."""
    ink = luminance(colour(t, "ink"))
    def ok(k):
        lp = luminance(base + (far - base) * k)
        return (max(ink, lp) + 0.05) / (min(ink, lp) + 0.05) >= TEXT_CONTRAST
    if ok(1.0):
        return 1.0
    lo_, hi_ = 0.0, 1.0
    for _ in range(30):
        mid = (lo_ + hi_) / 2
        lo_, hi_ = (mid, hi_) if ok(mid) else (lo_, mid)
    return lo_


def behind_type_light(t, dark, light):
    """The light of a picture behind type on a dark ground (behind_type_share)."""
    return dark + (light - dark) * behind_type_share(t, dark, light)


def grade_array(a, system, levels=None, dim=None):
    """Grades an RGB array (0-1) by the system's media grade (src/system/media-spec.ts). Footage passes
    fixed levels, so the grade does not flicker. `dim`: the picture goes behind type, so its light is
    behind_type_light, and the picture's levels stretch over that whole range (the detail stays visible)."""
    t = tokens_of(system) if system != "none" else None
    g = (t or {}).get("media", {}).get("grade", {"kind": "none"})
    if g["kind"] == "none":
        return a
    lo, hi, share = (tuple(levels) + (KEY_SHARE,))[:3] if levels else (*levels_of(a), KEY_SHARE)
    if g["kind"] == "tone" and not dim:
        # A tone grade keeps the picture's key: a high-key product shot stays bright, a night scene stays
        # dark. It stretches only KEY_SHARE of the way to full range (graphic grades stretch all the way), more only
        # where that would leave too little visible detail (key_levels). Behind type the light is already capped
        # low, so the picture stretches all the way inside that range.
        lo, hi = lo * share, 1 - (1 - hi) * share
    def norm(v):
        return np.clip((v - lo) / max(1e-3, hi - lo), 0, 1)
    k = g["kind"]
    if k in ("mono", "phosphor"):
        y = norm(luma(a)) ** g.get("gamma", 1)
        y = curve(y, g.get("contrast", 4))
        dark = colour(t, g["dark"])
        light = colour(t, g["light"] if k == "mono" else g["tint"])
        if dim:
            light = behind_type_light(t, dark, light)
        return dark + (light - dark) * y[..., None]
    if k == "tone":
        y = luma(a)[..., None]
        c = y + (a - y) * g["saturation"]
        w = g["warmth"] * 0.06
        c = c * np.array([1 + w, 1, 1 - w], dtype=np.float32)
        c = curve(norm(c), g["contrast"])
        dark, light = colour(t, g["dark"]), colour(t, g["light"])
        if dim:
            light = behind_type_light(t, dark, light)
        return dark + (light - dark) * c
    if k == "duotone":
        stops = [colour(t, r) for r in g["stops"]]
        if dim:
            # The stops close toward the end that the ink reads against (the paper, on a paper system).
            ink = luminance(colour(t, "ink"))
            far = lambda c: abs(luminance(c) - ink)  # noqa: E731
            base = stops[0] if far(stops[0]) >= far(stops[-1]) else stops[-1]
            k_ = behind_type_share(t, base, stops[-1] if base is stops[0] else stops[0])
            stops = [base + (s - base) * k_ for s in stops]
        return ramp(curve(norm(luma(a)), 3), stops)
    if k == "posterize":
        stops = [colour(t, r) for r in g["stops"]]
        # Smooth first, so the cut makes clean shapes, not ragged texture (cut paper, not a threshold).
        y = luma(a)
        im = Image.fromarray((np.clip(y, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(1.0, 0.004 * max(y.shape))))
        y = norm(np.asarray(im, dtype=np.float32) / 255.0)
        idx = np.minimum((y * len(stops)).astype(int), len(stops) - 1)
        return np.stack(stops)[idx]
    raise ValueError(f"unknown grade {k}")


def ground_of(system):
    """The system's ground colour (0-1 RGB): a picture framed low eases into it. None for --as-is."""
    t = tokens_of(system) if system != "none" else None
    return colour(t, "ground") if t else None


def dim_of(system):
    """Whether prepare writes plate-dim (a picture behind type; behind_type_light sets its light): every graded system.
    None for "none" (as-is)."""
    return None if system == "none" else True


# Visible detail on a phone: a picture whose 95th percentile of luma is under DETAIL_TOP, or whose spread from the 5th to
# the 95th percentile is under DETAIL_SPREAD (of 255), shows almost nothing at phone size in a dim room. prepare says so.
DETAIL_TOP, DETAIL_SPREAD = 72, 48


def detail(a):
    """(mean, p5, p95) of a picture's luma, 0-255."""
    y = luma(np.clip(a, 0, 1)) * 255
    return float(y.mean()), float(np.percentile(y, 5)), float(np.percentile(y, 95))


def detail_fault(a):
    """None when the picture shows enough detail, else why not (the measure and the floor)."""
    mean, p5, p95 = detail(a)
    if p95 >= DETAIL_TOP and p95 - p5 >= DETAIL_SPREAD:
        return None
    return f"too little visible detail: luma mean {mean:.0f}, 5th-95th percentile {p5:.0f}-{p95:.0f} of 255 (needs the 95th at {DETAIL_TOP} or more and a spread of {DETAIL_SPREAD} or more)"


def fade_top_array(a, ground, share=0.3):
    """The top `share` of the picture eases into the ground (smoothstep: no visible start or end)."""
    h = a.shape[0]
    w = np.clip(np.arange(h, dtype=np.float32)[:, None, None] / (share * h), 0, 1)
    w = w * w * (3 - 2 * w)
    return ground + (a - ground) * w


# ---------------------------------------------------------------- ink separations and paper cuts

def inks_of(system):
    """The ink roles of a duotone grade: its stops without the ground, darkest first (they print in that order)."""
    t = tokens_of(system) if system != "none" else None
    g = (t or {}).get("media", {}).get("grade", {})
    if g.get("kind") != "duotone":
        return []
    return [r for r in g["stops"] if r != "ground"]


def halftone(cover, angle, cell, ss=3):
    """A hard-edged dot screen for a coverage map (0-1): round dots at `angle` degrees, `cell` px apart, each dot's
    area equal to the coverage at its cell centre. Drawn at `ss` times the size, then reduced, so the dot edges are
    clean, not stepped. Returns alpha 0-1."""
    h, w = cover.shape
    a = np.radians(angle)
    ys, xs = np.mgrid[0:h * ss, 0:w * ss].astype(np.float32) / ss
    u = xs * np.cos(a) + ys * np.sin(a)
    v = -xs * np.sin(a) + ys * np.cos(a)
    cu, cv = (np.floor(u / cell) + 0.5) * cell, (np.floor(v / cell) + 0.5) * cell
    # The cell centre back in picture space, to read the coverage there.
    cx, cy = cu * np.cos(a) - cv * np.sin(a), cu * np.sin(a) + cv * np.cos(a)
    c = cover[np.clip(cy.astype(int), 0, h - 1), np.clip(cx.astype(int), 0, w - 1)]
    r = cell * np.sqrt(np.clip(c, 0, 1) / np.pi)
    dot = (np.hypot(u - cu, v - cv) < r).astype(np.float32)
    return np.asarray(Image.fromarray((dot * 255).astype(np.uint8)).resize((w, h), Image.BOX), dtype=np.float32) / 255.0


def ink_layers(d, a, system, levels):
    """One halftone layer per ink (ink-<role>.png): the ink colour, with the dots as alpha. The first ink takes the
    shadows, the second the mid tones; printed over each other with multiply they rebuild the picture in two inks."""
    inks = inks_of(system)
    if not inks:
        return []
    t = tokens_of(system)
    lo, hi = levels[:2]
    y = curve(np.clip((luma(a) - lo) / max(1e-3, hi - lo), 0, 1), 3)
    # Smooth the tone a little first, so each dot reads the area round it, not one noisy pixel.
    y = np.asarray(Image.fromarray((y * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32) / 255.0
    n = len(inks)
    cell = max(6.0, max(a.shape[:2]) / 140)
    angles = [15, 75, 45]
    out = []
    for k, role in enumerate(inks):
        # Ink k covers the tones darker than its share of the range: the first ink only the darks, the last the most.
        edge = (k + 1) / (n + 0.5)
        cover = np.clip((edge - y) / edge, 0, 1) ** 0.85
        alpha = halftone(cover, angles[k % 3], cell)
        rgba = np.dstack([np.broadcast_to(colour(t, role), a.shape[:2] + (3,)), alpha])
        Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA").save(d / f"ink-{role}.png")
        out.append(role)
    return out


def paper_cut(d, cut, system):
    """paper.png: the subject as cut paper, for a posterize system (Cutout). The edge comes from a smoothed alpha
    (blur, then a hard threshold, then open and close), so it is one clean silhouette with no islands. Inside, two
    tones only: the first and last stops of the grade (ink and paper), cut at the smoothed tone's median. No third
    tone, so no coloured rim at the edge."""
    t = tokens_of(system) if system != "none" else None
    g = (t or {}).get("media", {}).get("grade", {})
    if g.get("kind") != "posterize":
        return False
    w, h = cut.size
    k = max(2.0, 0.006 * max(w, h))
    al = cut.getchannel("A").filter(ImageFilter.GaussianBlur(k)).point(lambda v: 255 if v >= 128 else 0)
    size = int(k) * 2 + 1
    al = al.filter(ImageFilter.MinFilter(size)).filter(ImageFilter.MaxFilter(size))  # open: drop specks
    al = al.filter(ImageFilter.MaxFilter(size)).filter(ImageFilter.MinFilter(size))  # close: fill pinholes
    # A soft edge of about one pixel, so the cut is clean at any scale.
    al = al.filter(ImageFilter.GaussianBlur(0.8))
    y = luma(np.asarray(cut.convert("RGB"), dtype=np.float32) / 255.0)
    y = np.asarray(Image.fromarray((y * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(k * 1.5)), dtype=np.float32) / 255.0
    inside = np.asarray(al, dtype=np.float32) > 127
    cut_at = float(np.median(y[inside])) if inside.any() else 0.5
    dark, light = colour(t, g["stops"][0]), colour(t, g["stops"][-1])
    rgb = np.where((y < cut_at)[..., None], dark, light)
    img = to_image(rgb)
    img.putalpha(al)
    img.save(d / "paper.png")
    return True


def layers(d, system, src, cut, levels):
    a = np.asarray(src, dtype=np.float32) / 255.0
    inks = ink_layers(d, a, system, levels)
    paper = paper_cut(d, cut, system)
    if inks:
        print(f"  ink layers: {', '.join(f'ink-{r}.png' for r in inks)}")
    if paper:
        print("  paper cut: paper.png")


def to_image(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255).round().astype(np.uint8))


# The plates of one film's pictures (a product on its backdrop, shot after shot) must match in colour and light: a plate
# with a blue cast beside two warm ones reads as another shoot. The measure: the mean colour of the graded plate where
# the subject is not (alpha under 0.1; the outer tenth of the frame when the subject covers nearly all of it), in CIE
# CIELAB. Two plates differ when their distance (CIE76) is over PLATE_DE: about the step a viewer sees between two
# plates side by side, one cut apart.
PLATE_DE = 6.0


def cielab(rgb):
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    x, y, z = (np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ c) / np.array([0.9505, 1.0, 1.089])
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116  # noqa: E731
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]


def plate_colour(plate, al):
    """The mean colour (0-255 RGB) of a graded plate where the subject is not."""
    a = np.asarray(plate, dtype=np.float64)
    a = a * 255.0 if a.max() <= 1.0 + 1e-6 else a
    m = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).resize((a.shape[1], a.shape[0])), dtype=np.float64) / 255.0 < 0.1
    if m.mean() < 0.05:
        h, w = m.shape
        m = np.zeros_like(m)
        m[: h // 10], m[-h // 10:], m[:, : w // 10], m[:, -w // 10:] = True, True, True, True
    return [round(float(v), 1) for v in a[m].mean(axis=0)[:3]]


def plate_mismatch(d, system, colour):
    """Warnings for the prepared pictures of the same grade whose plates differ from this one by more than PLATE_DE."""
    out = []
    mine = cielab(colour)
    for m in sorted(d.parent.glob("*/meta.json")):
        if m.parent == d:
            continue
        try:
            o = json.loads(m.read_text())
        except (OSError, ValueError):
            continue
        if o.get("kind") != "photo" or o.get("grade") != system or not o.get("plateColour"):
            continue
        de = float(np.linalg.norm(np.array(mine) - np.array(cielab(o["plateColour"]))))
        if de > PLATE_DE:
            out.append(f"{d.name}'s plate differs from {m.parent.name}'s by {de:.1f} (CIE76, limit {PLATE_DE:.0f}): in one film, the shots look like two shoots. "
                       "Choose pictures shot on one backdrop and in one light, or use one of them.")
    return out


def main():
    d = Path(sys.argv[1])
    system = sys.argv[2]
    src = Image.open(d / "source.jpg").convert("RGB")
    cut = Image.open(d / "cutout.png").convert("RGBA")
    if cut.size != src.size:
        cut = cut.resize(src.size, Image.LANCZOS)
    ground = ground_of(system)
    a = np.asarray(src, dtype=np.float32) / 255.0
    levels = key_levels([a], system)
    if "--layers" in sys.argv:
        layers(d, system, src, cut, levels)
        return
    plate = grade_array(a, system, levels)
    to_image(plate).save(d / "plate.jpg", quality=94)
    # plate-top.jpg: for a picture framed low (the photo block's `fade: "top"`). Only the plate fades: the
    # subject draws from subject.png on top. plate-dim.jpg: for a picture behind type (the system's `dim`).
    if ground is not None:
        to_image(fade_top_array(plate, ground)).save(d / "plate-top.jpg", quality=94)
    plates = {"plate": plate}
    if dim_of(system):
        plates["plate-dim"] = grade_array(a, system, levels, dim=dim_of(system))
        to_image(plates["plate-dim"]).save(d / "plate-dim.jpg", quality=94)
    # Visible detail: a plate that shows almost nothing on a phone is a fault of the picture or of the grade. Say so.
    for name, pa in plates.items():
        why = detail_fault(pa)
        if why:
            print(f"warning: {d.name} {name}.jpg for {system}: {why}. Choose a picture with more light in it, or one whose subject is lit.")
    alpha = cut.getchannel("A")
    subject = to_image(grade_array(np.asarray(cut.convert("RGB"), dtype=np.float32) / 255.0, system, levels))
    subject.putalpha(alpha)
    subject.save(d / "subject.png")

    # The subject's box and centre from its alpha, as fractions of the photo.
    al = np.asarray(alpha, dtype=np.float32) / 255.0
    ys, xs = np.where(al > 0.5)
    W, H = src.size
    box = [float(xs.min() / W), float(ys.min() / H), float((xs.max() + 1) / W), float((ys.max() + 1) / H)] if len(xs) else [0, 0, 1, 1]
    weights = al[al > 0.5]
    centre = [float((xs * weights).sum() / weights.sum() / W), float((ys * weights).sum() / weights.sum() / H)] if len(xs) else [0.5, 0.5]
    # A coarse alpha mask (64 columns, rows to keep the photo's shape), one hex digit a cell (0 clear, f solid),
    # so blocks can plan type around the subject without reading the file.
    cols = 64
    rows = max(1, round(cols * H / W))
    small = np.asarray(Image.fromarray((al * 255).astype(np.uint8)).resize((cols, rows), Image.BOX), dtype=np.float32) / 255.0
    mask = {"cols": cols, "rows": rows, "data": "".join("0123456789abcdef"[min(15, int(round(v * 15)))] for v in small.flatten())}
    meta = {"kind": "photo", "width": W, "height": H, "subject": box, "centre": centre, "grade": system, "coverage": float((al > 0.5).mean()), "mask": mask,
            "detail": {name: [round(v) for v in detail(pa)] for name, pa in plates.items()}, "plateColour": plate_colour(plate, al)}
    (d / "meta.json").write_text(json.dumps(meta, indent=1))
    for w in plate_mismatch(d, system, meta["plateColour"]):
        print(f"warning: {w}")
    print(f"prepared {d.name} for {system}: subject box {[round(v, 3) for v in box]}, covers {meta['coverage']:.0%} of the photo")
    layers(d, system, src, cut, levels)


if __name__ == "__main__":
    main()
