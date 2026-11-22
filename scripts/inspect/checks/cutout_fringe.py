"""cutout-fringe: a cut-out that keeps its source backdrop: an enclosed patch, or a rim that follows the silhouette.

For each picture the film draws with `cutout` (data-cutout), three measures run:

1. Plain backdrop (when the source photo's backdrop round the subject is one colour). The subject PNG and the
   source photo in the same media folder (assets/media/<name>/source.jpg) are read, and scripts/media_cut.py's
   clean() runs as a dry run on them. It reports
     gaps   enclosed backdrop-coloured patches inside the matte that touch no outside and are bounded by clearly
            different subject (the light gap in a hair loop)
   and this check measures
     rim    the share of edge pixels (alpha 0.05 to 0.95, and 2 px inside the solid matte), weighted by alpha, whose
            own colour in the PNG is nearer the backdrop than the inner subject, among edge pixels whose inner subject
            differs from the backdrop by over CLEAR; over RIM_MAX is a rim.
   A finding only when the film draws the cut-out over a ground that differs from the backdrop by over GROUND_DIFF.

2. Any backdrop, on the files (no model of the whole backdrop). The subject's grade is fitted (own colour = source
   colour x a 3x4 matrix, least squares on the solid inside of the matte), so the source's local backdrop can be
   compared with the PNG's colours. For each pixel inside the matte, its local backdrop is the nearest source pixel
   3 px or more outside the matte, graded; its inner colour is the nearest PNG pixel CORE px or more inside. At each
   depth (1 px steps at a 1280 px long side), the share of pixels (where the inner and local backdrop colours differ
   by over CLEAR) whose own colour is nearer the local backdrop than the inner colour. A matte's anti-aliasing makes
   the first 1-2 px backdrop-like on every cut-out; a rim is a band: rimPx counts the depths from the edge with a
   share of RIM_SHARE or more, and RIM_MIN_PX or more is a rim band in the file.

3. As drawn in the film (the one that decides for a rim band). On the lossless frame where the cut-out rests at its
   largest, the matte is placed in the frame (its box, fit and object position). At every RIM_STEP px along the
   silhouette, three tones are read along the inward normal: the band (depth 1 to the band's drawn width), the
   subject inside it (4 px deeper) and the ground (FILM_OUT px outside). A point shows a line when the band differs
   from both the subject and the ground by over LINE_DIFF (largest channel difference). filmRim is the share of
   points that show it; over FILM_RIM_MAX, with a drawn band of 1.5 px or more, is an error.
4. Part of the outline (segment_bands): in 16 sectors round the matte's centre, the depth to which the pixels are
   mostly nearer the local backdrop than the subject and textured (the source's grey spread in a 7 px window is
   TEXTURE_MIN or more: kept backdrop on a busy ground shows its texture, a part of the subject in shadow is smooth); SEG_MIN_PX (8 px at a 1280 px long side) or more in a sector is
   backdrop kept along that side (water round a swimmer's shoulders), which the whole-outline measure averages away.
A cut-out drawn over its own source plate (the photo it was cut from, in place) shows no rim by design; the
band matches the ground there and shows no line. A cut-out whose silhouette is under 200 points, or that never rests on
a lossless frame, is not measured by 3; the notes say so and give the file's rimPx.
"""
import sys
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from film import ROOT, Skip, finding

sys.path.insert(0, str(ROOT / "scripts"))
import media_cut  # noqa: E402
from media_paths import media_file  # noqa: E402

RIM_MAX = 0.30
CLEAR = 60  # edge pixels whose inner subject is this far (largest channel difference) from the backdrop
GROUND_DIFF = 40
CORE = 12
RIM_SHARE, RIM_MIN_PX, DEPTHS = 0.6, 3, 12
FILM_OUT, RIM_STEP = 5, 3
LINE_DIFF = 30
FILM_RIM_MAX = 0.3


def grey(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def rim_profile(alpha, own, src):
    """Measure 2: the share of backdrop-like pixels at each depth inside the matte, and rimPx (see the docstring)."""
    k = max(alpha.shape) / 1280
    solid = alpha > 0.5
    depth = ndi.distance_transform_edt(solid)
    core = depth > CORE * k
    if not core.any():
        return None, 0
    ys, xs = np.nonzero(core)
    pick = np.random.default_rng(0).choice(len(ys), min(20000, len(ys)), replace=False)
    grade, *_ = np.linalg.lstsq(np.c_[src[ys[pick], xs[pick]], np.ones(len(pick))], own[ys[pick], xs[pick]], rcond=None)
    far = (alpha < 0.02) & ~ndi.binary_dilation(alpha > 0.02, iterations=max(2, round(3 * k)))
    if not far.any():
        return None, 0
    io = ndi.distance_transform_edt(~far, return_distances=False, return_indices=True)
    back = (np.c_[src[io[0], io[1]].reshape(-1, 3), np.ones(alpha.size)] @ grade).reshape(own.shape)
    ii = ndi.distance_transform_edt(~core, return_distances=False, return_indices=True)
    inner = own[ii[0], ii[1]]
    valid = np.abs(inner - back).max(axis=2) > CLEAR
    near = np.abs(own - back).max(axis=2) < np.abs(own - inner).max(axis=2)
    prof = []
    for d in range(1, DEPTHS + 1):
        m = valid & (depth > (d - 1) * k) & (depth <= d * k)
        prof.append(round(float(near[m].mean()), 2) if m.sum() > 30 else None)
    rim_px = 0
    for v in prof:
        if v is None or v < RIM_SHARE:
            break
        rim_px += 1
    # Measure 4 reads "kept backdrop" strictly: nearer the local backdrop than the subject, within BACK_NEAR of it, and
    # textured: kept backdrop on a busy ground shows that ground's texture (water, a crowd), while a part of the subject
    # in shadow on a dark ground (Courtside's p-hall arm) is smooth. Texture: the grey level's spread in a window of
    # TEXTURE_WIN px (at 1280) of the source, TEXTURE_MIN or more.
    g = grey(src)
    win = max(3, int(round(TEXTURE_WIN * k)))
    m1 = ndi.uniform_filter(g, win)
    spread = np.sqrt(np.clip(ndi.uniform_filter(g * g, win) - m1 * m1, 0, None))
    segment_bands.last = segment_bands(solid, depth, valid, near & (np.abs(own - back).max(axis=2) < BACK_NEAR) & (spread >= TEXTURE_MIN), k)
    return prof, rim_px


SEGMENTS, SEG_DEPTH, SEG_MIN_PX, BACK_NEAR = 16, 40, 8, 30
TEXTURE_WIN, TEXTURE_MIN = 7, 8.0


def segment_bands(solid, depth, valid, near, k):
    """Measure 4: backdrop kept along part of the outline (water round a swimmer's shoulders, a ragged patch). The
    matte's outline is cut into SEGMENTS sectors round its centre; in each, the depth (px at a 1280 px long side) to
    which the pixels at that depth are mostly (RIM_SHARE) nearer the local backdrop than the subject. A whole-outline
    measure (2) averages such a patch away. Returns [(sector, depth px, share of the outline in the sector)]."""
    cy, cx = ndi.center_of_mass(solid)
    ys, xs = np.nonzero(solid & (depth <= SEG_DEPTH * k))
    if len(ys) < 200:
        return []
    sec = ((np.arctan2(ys - cy, xs - cx) + np.pi) / (2 * np.pi) * SEGMENTS).astype(int) % SEGMENTS
    d = depth[ys, xs] / k
    v, nr = valid[ys, xs], near[ys, xs]
    out = []
    for b in range(SEGMENTS):
        m = sec == b
        if m.sum() < 100:
            continue
        band = 0
        for step in range(1, SEG_DEPTH + 1):
            sel = m & v & (d > step - 1) & (d <= step)
            if sel.sum() < 20 or nr[sel].mean() < RIM_SHARE:
                break
            band = step
        out.append((b, band, round(float(m.mean()), 3)))
    return out


@lru_cache(maxsize=16)
def analyse(png):
    """analyse_files, once for the same files (by their bytes) and the same code (this module and media_cut.py)."""
    import memo
    p = Path(png)
    key = [memo.content(p), memo.content(p.parent / "source.jpg"), memo.content(p.parent / "cutout.png"), memo.code_of(sys.modules[__name__], media_cut)]
    return memo.memo("cutout-fringe", key, lambda: analyse_files(png))


def analyse_files(png):
    """For one prepared cut-out file: the plain-backdrop report (media_cut.clean dry run), its backdrop colour and rim
    share (measure 1, None when the backdrop is not plain), and the depth profile with rimPx (measure 2).
    None when the file is not an RGBA cut-out."""
    p = Path(png)
    im = Image.open(p)
    if im.mode != "RGBA":
        return None
    alpha = np.asarray(im.getchannel("A"), dtype=np.float64) / 255.0
    own = np.asarray(im.convert("RGB"), dtype=np.float64)
    out = {"report": None, "backdrop": None, "rim": None, "profile": None, "rimPx": None, "width": im.size[0]}
    src_path = p.parent / "source.jpg"
    if not src_path.exists():
        return out
    src_im = Image.open(src_path).convert("RGB")
    if src_im.size != im.size:
        src_im = src_im.resize(im.size)
    src = np.asarray(src_im, dtype=np.float64)
    segment_bands.last = []
    out["profile"], out["rimPx"] = rim_profile(alpha, own, src)
    out["segments"] = [x for x in segment_bands.last if x[1] >= SEG_MIN_PX]
    # The ungraded cut (cutout.png beside a graded subject.png) holds the source's own colours: read the sectors there.
    raw = p.parent / "cutout.png"
    if raw.exists() and raw != p:
        ri = Image.open(raw)
        if ri.mode == "RGBA" and ri.size == im.size:
            segment_bands.last = []
            rim_profile(np.asarray(ri.getchannel("A"), dtype=np.float64) / 255.0, np.asarray(ri.convert("RGB"), dtype=np.float64), src)
            out["segments"] = [x for x in segment_bands.last if x[1] >= SEG_MIN_PX]
    _, _, report = media_cut.clean(src, alpha, log=lambda *a: None, busy=False)  # a dry run of the plain path: its output is not saved
    out["report"] = report
    if not report.get("plain"):
        return out
    k = max(alpha.shape) / 1280
    solid, outside = alpha > 0.5, alpha < 0.02
    ring = ndi.binary_dilation(solid, iterations=max(2, round(12 * k))) & outside
    backdrop = np.median(src[ring], axis=0)
    out["backdrop"] = backdrop
    band = ((alpha > 0.05) & (alpha < 0.95)) | (solid & ~ndi.binary_erosion(solid, iterations=max(1, round(2 * k))))
    core8 = ndi.binary_erosion(solid, iterations=max(2, round(8 * k)))
    if not core8.any() or not band.any():
        return out
    idx = ndi.distance_transform_edt(~core8, return_distances=False, return_indices=True)
    inner = src[idx[0], idx[1]]
    d_back = np.abs(own - backdrop).max(axis=2)
    d_in = np.abs(own - inner).max(axis=2)
    valid = band & (np.abs(inner - backdrop).max(axis=2) > CLEAR)
    if valid.sum() < 50:
        return out
    w = alpha * valid  # a faint edge pixel shows little: weight by its alpha
    out["rim"] = float((w * (d_back < d_in)).sum() / w.sum())
    return out


def placement(png, e):
    """Where the cut-out's file lands in the frame: (scale, x offset, y offset, box) from the element's box, fit and
    object position."""
    nw, nh = Image.open(png).size
    bx, by, bw, bh = e.get("box") or (e["x"], e["y"], e["w"], e["h"])
    fit = e.get("fit", "cover")
    s = max(bw / nw, bh / nh) if fit in ("cover", "fill", "none") else min(bw / nw, bh / nh)
    px, py = 0.5, 0.5
    pos = (e.get("position") or "").replace("%", "").split()
    if len(pos) == 2:
        px, py = float(pos[0]) / 100, float(pos[1]) / 100
    return s, bx + (bw - nw * s) * px, by + (bh - nh * s) * py, (bx, by, bw, bh)


def placed_alpha(png, e, W, H):
    """The cut-out's matte in frame pixels (H, W). The box clips the picture (overflow hidden) and the frame clips the box."""
    s, ox, oy, (bx, by, bw, bh) = placement(png, e)
    a = Image.open(png).getchannel("A")
    dw, dh = max(1, round(a.size[0] * s)), max(1, round(a.size[1] * s))
    small = np.asarray(a.resize((dw, dh), Image.BILINEAR), dtype=np.float64) / 255.0
    out = np.zeros((H, W))
    x0, y0 = int(round(ox)), int(round(oy))
    cx0, cy0 = max(0, x0, int(bx)), max(0, y0, int(by))
    cx1, cy1 = min(W, x0 + dw, int(bx + bw)), min(H, y0 + dh, int(by + bh))
    if cx1 > cx0 and cy1 > cy0:
        out[cy0:cy1, cx0:cx1] = small[cy0 - y0:cy1 - y0, cx0 - x0:cx1 - x0]
    return out


def film_rim(frame, alpha, band_px):
    """Measure 3: the share of silhouette points where the drawn band (depth 1 to band_px) differs from both the
    subject 4 px deeper and the ground FILM_OUT px outside. Returns (share, points) or None."""
    H, W = alpha.shape
    solid = alpha > 0.5
    edge = solid & ~ndi.binary_erosion(solid)
    ys, xs = np.nonzero(edge)
    if len(ys) < 200:
        return None
    keep = np.arange(0, len(ys), RIM_STEP)
    ys, xs = ys[keep], xs[keep]
    sm = ndi.gaussian_filter(alpha, 2.0)
    gy, gx = np.gradient(sm)
    n = np.hypot(gx[ys, xs], gy[ys, xs]) + 1e-9
    ux, uy = gx[ys, xs] / n, gy[ys, xs] / n  # inward: alpha rises

    def at(d):
        x = np.clip(np.round(xs + ux * d).astype(int), 0, W - 1)
        y = np.clip(np.round(ys + uy * d).astype(int), 0, H - 1)
        return frame[y, x]
    depth = max(1, int(round(band_px)))
    band = np.median(np.stack([at(d) for d in range(1, depth + 1)]), axis=0)
    inner = np.median(np.stack([at(depth + 4 + d) for d in range(3)]), axis=0)
    ground = np.median(np.stack([at(-FILM_OUT - d) for d in range(3)]), axis=0)
    inside = (xs > FILM_OUT + 4) & (xs < W - FILM_OUT - 4) & (ys > FILM_OUT + 4) & (ys < H - FILM_OUT - 4)
    if inside.sum() < 100:
        return None
    line = (np.abs(band - inner).max(axis=1) > LINE_DIFF) & (np.abs(band - ground).max(axis=1) > LINE_DIFF)
    return float(line[inside].mean()), int(inside.sum())


def check(film):
    seen = {}
    for f in range(film.n):
        for e in film.elements(f):
            if e.get("kind") == "image" and e.get("cutout") and e.get("src") and e["opacity"] >= 0.9:
                # The largest lossless frame where the cut-out rests (the same box as the frame before).
                score = (film.rec.has_png(f) and film.rec.at_rest(f, e), e["w"] * e["h"])
                cur = seen.get(e["src"])
                if cur is None or score > cur[0]:
                    seen[e["src"]] = (score, f, e)
    if not seen:
        raise Skip("the film draws no cut-out")
    out = []
    for src, (score, f, e) in seen.items():
        tail = src.split("/media/", 1)[-1]
        png = media_file(tail)
        res = analyse(str(png)) if png.exists() else None
        if res is None:
            film.notes.append({"check": "cutout-fringe", "notChecked": tail, "why": "the cut-out file is missing or has no alpha"})
            continue
        frame = np.asarray(film.rec.frame(f), dtype=np.float64)
        node = film.label(e["id"])
        measured = {"file": tail}
        bad_band = False
        # 2 and 3: a rim band in the file, and whether it shows as a line in the film.
        if res["profile"] is None:
            film.notes.append({"check": "cutout-fringe", "file": tail, "why": "no source.jpg beside the cut-out, or no backdrop round it: the rim band is not measured"})
        else:
            k = max(1.0, res["width"] / 1280)
            s = placement(png, e)[0]
            band_px = res["rimPx"] * k * s
            measured.update({"rimPx": res["rimPx"], "bandDrawnPx": round(band_px, 1), "profile": res["profile"][:8]})
            if res["rimPx"] >= RIM_MIN_PX and band_px >= 1.5:
                if not score[0]:
                    film.notes.append({"check": "cutout-fringe", "file": tail, "why": "never at rest on a lossless key frame: the rim as drawn is not measured"})
                else:
                    fr = film_rim(frame, placed_alpha(png, e, film.W, film.H), band_px)
                    if fr is None:
                        film.notes.append({"check": "cutout-fringe", "file": tail, "why": "the silhouette in the frame is too short to measure"})
                    else:
                        measured.update({"filmRim": round(fr[0], 3), "points": fr[1]})
                        bad_band = fr[0] > FILM_RIM_MAX
        # 1. Plain backdrop: gaps and the rim on the files, where the ground under the cut-out differs from the backdrop.
        holes, rim1 = [], None
        if res["backdrop"] is not None:
            x0, y0 = int(max(0, e["x"])), int(max(0, e["y"]))
            x1, y1 = int(min(film.W, e["x"] + e["w"])), int(min(film.H, e["y"] + e["h"]))
            under = np.median(frame[y0:y1, x0:x1].reshape(-1, 3), axis=0) if x1 > x0 and y1 > y0 else film.ground
            diff = float(np.abs(under - res["backdrop"]).max())
            if diff > GROUND_DIFF:
                holes, rim1 = res["report"].get("holes", []), res["rim"]
            measured.update({"gaps": len(holes), "gapPx": sum(h["px"] for h in holes), "rimShare": None if rim1 is None else round(rim1, 3),
                             "backdrop": [int(c) for c in res["backdrop"]], "groundDiff": round(diff)})
        # 4. Backdrop kept along part of the outline.
        segs = res.get("segments") or []
        if segs:
            measured.update({"keptBackdrop": [{"sector": b, "depthPx": d} for b, d, _ in segs], "sectorsOf": SEGMENTS})
        film.notes.append({"check": "cutout-fringe", **measured})
        if segs and not (bad_band or bool(res["report"] and res["report"].get("holes"))):
            # A warning: a shadowed edge of the subject on a dark backdrop of the same tone reads as kept backdrop too
            # (Courtside's p-hall arm); water or grass kept along a side (p-rope) is the case it is for.
            out.append(finding("cutout-fringe", "warning", film.t(f), film.t(f), measured, {"keptBackdropPx": SEG_MIN_PX},
                               f"Part of the outline keeps its source backdrop ({len(segs)} of {SEGMENTS} sectors, up to {max(d for _, d, _ in segs)} px deep at a "
                               "1280 px long side): cut the subject again there (a tighter matte on that side), crop that side out of the frame, or pick another photo.", node=node))
            continue
        bad_plain = bool(holes) or (rim1 is not None and rim1 > RIM_MAX)
        if bad_plain or bad_band:
            if bad_band and not bad_plain:
                fix = (f"A {measured['bandDrawnPx']} px band of the source backdrop follows the silhouette and shows as a line: cut the "
                       "subject again with a tighter matte (erode its edge by the band's width), or draw it over its own source plate.")
            else:
                fix = "Run prepare again (it cleans gaps and the rim), or `media_cut.py --clean`."
            out.append(finding("cutout-fringe", "error", film.t(f), film.t(f), measured,
                               {"gaps": 0, "rimShare": RIM_MAX, "rimPx": RIM_MIN_PX, "filmRim": FILM_RIM_MAX}, fix, node=node))
    return out
