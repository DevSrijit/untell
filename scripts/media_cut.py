"""Cuts the subject out of a photo: the person and what they hold (a ball, a racket, a cup).

Usage: .venv-media/bin/python scripts/media_cut.py <source.jpg> <cutout.png> [model] [--keep-holes] [--no-clean] [--open x0,y0,x1,y1 ...]
       .venv-media/bin/python scripts/media_cut.py --clean <source.jpg> <cutout.png>     clean an existing cut-out again
Uses rembg's BiRefNet general model (local, free; the model downloads once to ~/.u2net). A person-only
model drops held objects: a player loses her ball. The general model keeps the main object group.

After the matte, `clean` fixes the two faults a matte leaves on a plain backdrop. Both show the moment the
cut-out sits on a ground of another colour:
- A gap the subject encloses (the loop of a hair bun, the space under an arm) stays filled with the backdrop.
  Over a white letter it looks right by chance; over a dark ground it is a white patch.
- The edge keeps a rim of backdrop colour (a light halo round dark hair).
On a plain backdrop round the subject (one colour, low spread) it works with that one colour. On a busy backdrop
(clean_busy) it takes the backdrop locally, from the source photo just outside the matte, per arc of the silhouette:
- The rim: on each arc (a cell of ARC px along the outline), the depth to which the matte's edge pixels are nearer
  the local backdrop than the local subject (the inside of the matte, CORE px deep), in a tone that the backdrop's
  colour histogram explains HOLE_RATIO times better than the subject's (so a tone the subject shows anywhere inside,
  such as a leg in shadow or black shorts, is never taken). An arc whose band is BAND_MIN px
  deep or more loses those backdrop-like pixels down to the band's depth. A pixel that is nearer the subject is never
  removed, an arc where the subject and the backdrop look alike (under CLEAR apart) is not touched, and a band must
  end: within END_PX under it, under BAND_END of the pixels are backdrop-like. A tone that goes on deeper is a dark
  part of the subject (a leg in shadow on a dark hall), and that arc stays.
- The edge colour: every soft pixel within MAX_BAND px of the outline takes the subject's colour recovered from its alpha and the local backdrop
  (colour = alpha x subject + (1 - alpha) x backdrop), so no backdrop tint stays under a soft edge.
- Enclosed gaps: patches inside the matte whose colours the ring round the subject explains far better than the
  subject does (colour histograms of the ring and of the subject's inside), that touch no outside, are HOLE_MAX of the
  subject or less, whose own histogram meets the ring's (intersection HOLE_RING or more) and not the subject's, and
  that show texture (a flat patch may be the subject in the backdrop's tone: it stays, and the log says so).
On a plain backdrop, a subject mostly in the backdrop's own tone (under SUBJECT_CLEAR of it differs clearly: a black
lens on black) is left as it is: the method cannot tell its gaps and rim from the subject.
A gap opens only with evidence that it is backdrop, not subject in the backdrop's colour: the matte itself was unsure
there (alpha under SURE on UNSURE_MIN of the patch: a gap the model half saw) and the patch is as flat as the backdrop.
A patch the matte holds at full alpha (white chrome on a white backdrop) stays: the report lists it as "possible" and
the log says "possible enclosed backdrop at <box>"; --open <box> opens it when the agent decides it is backdrop.
It prints each gap it opens, so a wrong one (a patch that is part of the subject) is seen: run again with
--keep-holes. The report says how much alpha it removed, so a cleanup that eats the subject is seen too.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

PLAIN_SPREAD = 16   # the backdrop is plain when its colour spread (std per channel) round the subject is under this
LIKE = 20           # a pixel is backdrop-like within this distance (largest channel difference) of the backdrop
SURE, UNSURE_MIN = 0.95, 0.15  # a gap opens only where the matte was unsure (alpha under SURE) on UNSURE_MIN of it
FLAT_MIN, FLAT_RING = 8.0, 1.5  # ... and the patch is as flat as the backdrop (std under max(FLAT_MIN, FLAT_RING x the ring's spread))
SUBJECT_CLEAR = 0.5  # the plain path runs when this share of the subject differs clearly from the backdrop
RIM_PX = 4          # the rim: this many px in from the matte's edge (at 1280 px long side; scaled with the image)


ARC, BAND_MIN, MAX_BAND, CORE, CLEAR, MARGIN = 40, 2, 14, 12, 60, 12
END_PX, BAND_END = 3, 0.35
BAND_SHARE, HOLE_RATIO, HOLE_RING, HOLE_SUBJECT, HOLE_TEXTURE, HOLE_MAX = 0.6, 4.0, 0.5, 0.25, 14, 0.01


def unsure_matte(alpha, m):
    """The share of a region where the matte itself was unsure (alpha under SURE): a gap the model half saw. A region
    the matte holds at full alpha is the subject as far as the matte can tell (chrome on a white backdrop)."""
    return float((alpha[m] < SURE).mean()) if m.any() else 0.0


def boxes_meet(a, b):
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]


def clean(src, alpha, keep_holes=False, log=print, busy=True, open_boxes=None):
    """src: HxWx3 float (0-255). alpha: HxW float (0-1). Returns (rgb, alpha, report). busy=False leaves a busy
    backdrop as it is (the detector's dry run reads only the plain-backdrop report). open_boxes: [x0, y0, x1, y1] boxes
    (px of src) where the agent decided a possible gap is backdrop: a candidate that meets one opens without the
    matte-evidence rule."""
    h, w = alpha.shape
    k = max(h, w) / 1280
    outside = alpha < 0.02
    solid = alpha > 0.5
    if not solid.any() or not outside.any():
        return src, alpha, {"plain": False, "holes": [], "rim": 0}
    ring = ndi.binary_dilation(solid, iterations=max(2, round(12 * k))) & outside
    if ring.sum() < 50:
        return src, alpha, {"plain": False, "holes": [], "rim": 0}
    spread = float(src[ring].std(axis=0).max())
    report = {"plain": spread < PLAIN_SPREAD, "spread": round(spread, 1), "holes": [], "rim": 0}
    if not report["plain"]:
        if not busy:
            log(f"clean: the backdrop is not plain (spread {spread:.1f}); nothing changed")
            return src, alpha, report
        return clean_busy(src, alpha, report, keep_holes, log, open_boxes)
    backdrop = np.median(src[ring], axis=0)
    dist = np.abs(src - backdrop).max(axis=2)
    # A subject mostly in the backdrop's own tone (a black lens on black) gives this method nothing to tell them apart
    # by: its gaps and its rim would be the subject itself.
    report["subjectClear"] = round(float((dist[solid] > LIKE * 3).mean()), 3)
    if report["subjectClear"] < SUBJECT_CLEAR:
        log(f"clean: the subject is mostly in the backdrop's tone ({report['subjectClear']:.0%} of it differs clearly); nothing changed")
        return src, alpha, report
    alpha = alpha.copy()

    # 1. Enclosed gaps: backdrop-like patches inside the matte that touch no outside, are small against the
    #    subject, and are bounded by subject that is clearly not backdrop (so a white shirt on white stays).
    if not keep_holes:
        like = (dist < LIKE) & (alpha > 0.3)
        lab, n = ndi.label(like)
        subject_area = float(solid.sum())
        near_out = ndi.binary_dilation(outside, iterations=max(1, round(3 * k)))
        for i, sl in enumerate(ndi.find_objects(lab), start=1):
            m = lab == i
            area = int(m.sum())
            if area < 120 * k * k or area > 0.03 * subject_area or (m & near_out).any():
                continue
            border = ndi.binary_dilation(m, iterations=max(2, round(4 * k))) & ~m & (alpha > 0.5)
            if border.sum() < 20 or np.median(dist[border]) < 60:
                continue
            ys, xs = np.where(m)
            box = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]
            # Evidence that it is backdrop, not subject in the backdrop's colour: the matte was unsure there (a gap the
            # model half saw), and the patch is as flat as the backdrop round the subject. White chrome on a white
            # backdrop is held at full alpha: it stays, and the report names it for the agent to decide (--open).
            unsure = unsure_matte(alpha, m)
            flat = float(src[m].std(axis=0).max()) <= max(FLAT_MIN, FLAT_RING * spread)
            forced = any(boxes_meet(box, b) for b in (open_boxes or []))
            if not forced and (unsure < UNSURE_MIN or not flat):
                why = f"the matte holds it at full alpha ({unsure:.0%} unsure)" if unsure < UNSURE_MIN else "it is not as flat as the backdrop"
                report.setdefault("possible", []).append({"box": box, "px": area, "why": why})
                log(f"clean: possible enclosed backdrop at {box} ({area} px), kept: {why}. Open it with --open {','.join(map(str, box))} if it is backdrop.")
                continue
            grow = ndi.binary_dilation(m, iterations=max(1, round(2 * k))) & (dist < LIKE * 2.5)
            alpha[grow] = 0
            hole = {"box": box, "px": area, "unsure": round(unsure, 2), **({"forced": True} if forced else {})}
            report["holes"].append(hole)
            log(f"clean: opened a gap of {area} px at {hole['box']} (backdrop inside the subject; the matte was {unsure:.0%} unsure there)")

    # 2. The rim: near the edge, a pixel as far from the backdrop's colour as the subject is keeps its alpha;
    #    a backdrop-like one loses it. Then every edge pixel takes the colour of the nearest inner pixel, so no
    #    backdrop colour is left under a soft edge.
    solid = alpha > 0.5
    inner = ndi.binary_erosion(solid, iterations=max(1, round(RIM_PX * k)))
    band = (alpha > 0) & ~inner
    keep = np.clip((dist - LIKE) / (LIKE * 2.0), 0, 1)
    before = alpha[band].sum()
    alpha[band] = alpha[band] * keep[band]
    report["rim"] = int(round(before - alpha[band].sum()))
    core = ndi.binary_erosion(alpha > 0.5, iterations=max(1, round(2 * k))) & (dist > LIKE * 3)
    rgb = src.copy()
    if core.any():
        idx = ndi.distance_transform_edt(~core, return_distances=False, return_indices=True)
        # Only the rim band takes the inner colour: a part of the subject in the backdrop's tone away from the edge
        # (white chrome on a white backdrop) keeps its own colour.
        edge = (alpha > 0) & ~core & ~inner
        rgb[edge] = src[idx[0][edge], idx[1][edge]]
    alpha = ndi.gaussian_filter(alpha, 0.6 * k) * (alpha > 0)  # a soft edge again, with no step
    log(f"clean: backdrop {[int(c) for c in backdrop]}, {len(report['holes'])} gap(s) opened, rim cleaned ({report['rim']} px of alpha removed)")
    return rgb, np.clip(alpha, 0, 1), report


def _smooth(img, mask, sigma):
    """The mean colour of `img` over `mask` round each pixel (a normalised Gaussian, sigma px), computed at a quarter
    of the size: the local backdrop or subject colour as a smooth field. Where the mask is far away, the nearest
    mask pixel's colour."""
    f = max(1, int(sigma // 4))
    sm, si = mask[::f, ::f].astype(np.float64), img[::f, ::f]
    w = ndi.gaussian_filter(sm, sigma / f)
    c = np.stack([ndi.gaussian_filter(si[..., i] * sm, sigma / f) for i in range(3)], axis=-1)
    field = c / np.maximum(w, 1e-6)[..., None]
    if (w < 1e-4).any() and sm.any():
        idx = ndi.distance_transform_edt(w < 1e-4, return_distances=False, return_indices=True)
        field = field[idx[0], idx[1]]
    zoom = (mask.shape[0] / field.shape[0], mask.shape[1] / field.shape[1], 1)
    out = ndi.zoom(field, zoom, order=1)
    return out[:mask.shape[0], :mask.shape[1]]


def _hist(px, bins=8):
    """A normalised colour histogram (bins per channel) of pixels (N x 3)."""
    q = np.clip(px // (256 // bins), 0, bins - 1).astype(int)
    h = np.bincount(q[:, 0] * bins * bins + q[:, 1] * bins + q[:, 2], minlength=bins ** 3).astype(np.float64)
    return h / max(1.0, h.sum())


def clean_busy(src, alpha, report, keep_holes=False, log=print, open_boxes=None):
    """The cleanup on a busy backdrop (see the module docstring). Returns (rgb, alpha, report)."""
    h, w = alpha.shape
    k = max(h, w) / 1280
    alpha0 = alpha
    alpha = alpha.copy()
    solid, near = alpha > 0.5, alpha > 0.02
    depth = ndi.distance_transform_edt(solid)
    out_d = ndi.distance_transform_edt(~near)
    ring = (out_d >= 3 * k) & (out_d <= 12 * k)
    core = depth > CORE * k
    if ring.sum() < 50 or core.sum() < 50:
        log("clean: the matte is too small or too thin to read a local backdrop; nothing changed")
        return src, alpha, report
    back = _smooth(src, ring, 8 * k)
    subj = _smooth(src, core, 8 * k)
    d_back = np.abs(src - back).max(axis=2)
    d_subj = np.abs(src - subj).max(axis=2)
    clear = np.abs(subj - back).max(axis=2) > CLEAR
    # Colour models: histograms of the ring (the backdrop) and of the subject's inside. A tone that the subject shows
    # anywhere inside (a shadowed leg, black shorts) is never taken for the backdrop.
    hb, hs = _hist(src[ring]), _hist(src[core])
    q = np.clip(src // 32, 0, 7).astype(int)
    flat = q[..., 0] * 64 + q[..., 1] * 8 + q[..., 2]
    ratio = (hb[flat] + 1e-4) / (hs[flat] + 1e-4)
    like = clear & (d_back + MARGIN < d_subj) & (ratio > HOLE_RATIO)  # nearer the local backdrop, in a backdrop tone
    # 1. The rim, per arc: arcs are cells of ARC px (at 1280) along the outline; each pixel belongs to the arc of its
    #    nearest outline pixel.
    edge = solid & ~ndi.binary_erosion(solid)
    ey, ex = np.nonzero(edge)
    cell = max(1, int(round(ARC * k)))
    arc_of_edge = np.full(edge.shape, -1, dtype=np.int64)
    arc_of_edge[ey, ex] = (ey // cell) * (w // cell + 1) + ex // cell
    band_zone = near & (depth <= MAX_BAND * k)
    idx = ndi.distance_transform_edt(~edge, return_distances=False, return_indices=True)
    arc = arc_of_edge[idx[0], idx[1]]
    zy, zx = np.nonzero(band_zone)
    za, zd, zl, zc = arc[zy, zx], depth[zy, zx] / k, like[zy, zx], clear[zy, zx]
    bands = {}
    order = np.argsort(za, kind="stable")
    za, zd, zl, zc, zy, zx = za[order], zd[order], zl[order], zc[order], zy[order], zx[order]
    starts = np.r_[0, np.nonzero(np.diff(za))[0] + 1, len(za)]
    remove = np.zeros_like(solid)
    skipped = 0
    for a, b in zip(starts[:-1], starts[1:]):
        d, l_, c_ = zd[a:b], zl[a:b], zc[a:b]
        band = 0
        for step in range(0, MAX_BAND + 1):
            sel = c_ & (d > step - 1) & (d <= step) if step else c_ & (d == 0)
            if sel.sum() < 8:
                if step:
                    break
                continue
            if l_[sel].mean() < BAND_SHARE:
                break
            band = step
        # A band ends: just under it the pixels are the subject's. When the backdrop-like tone goes on deeper (a leg in
        # shadow on a dark hall), it is a dark part of the subject, not a band: the arc is left as it is.
        below = c_ & (d > band) & (d <= band + END_PX)
        if band >= BAND_MIN and (below.sum() < 8 or l_[below].mean() >= BAND_END):
            skipped += 1
            continue
        if band >= BAND_MIN:
            bands[int(za[a])] = band
            m = l_ & (d <= band + 0.5)
            remove[zy[a:b][m], zx[a:b][m]] = True
    report["busy"] = {"arcs": int(len(starts) - 1), "banded": len(bands), "bandPx": sorted(bands.values(), reverse=True)[:12], "noEnd": skipped}
    alpha[remove] = 0
    if remove.any():  # a soft edge again where the band went, with no step and no stray specks
        zone = ndi.binary_dilation(remove, iterations=max(1, round(2 * k)))
        lone = zone & (alpha > 0) & ~ndi.binary_opening(alpha > 0.5, iterations=max(1, round(k)))
        alpha[lone & (depth <= MAX_BAND * k)] = 0
        alpha = np.where(zone, np.minimum(alpha, ndi.gaussian_filter(alpha, 0.6 * k)), alpha)
    # 2. Enclosed gaps, by colour histograms of the ring (backdrop) and of the subject's inside.
    report["busyHoles"] = []
    if not keep_holes:
        cand = (alpha > 0.3) & (depth > 2 * k) & (ratio > HOLE_RATIO)
        lab, n = ndi.label(cand)
        subject_area = float(solid.sum())
        near_out = ndi.binary_dilation(~near, iterations=max(1, round(3 * k)))
        for i, sl in enumerate(ndi.find_objects(lab), start=1):
            m = lab[sl] == i
            area = int(m.sum())
            if area < 120 * k * k or area > HOLE_MAX * subject_area or (m & near_out[sl]).any():
                continue
            px = src[sl][m]
            hr = _hist(px)
            if np.minimum(hr, hb).sum() < HOLE_RING or np.minimum(hr, hs).sum() > HOLE_SUBJECT:
                continue
            sbox = [int(sl[1].start), int(sl[0].start), int(sl[1].stop - 1), int(sl[0].stop - 1)]
            unsure = unsure_matte(alpha0[sl], m)
            if unsure < UNSURE_MIN and not any(boxes_meet(sbox, b) for b in (open_boxes or [])):
                report.setdefault("possible", []).append({"box": sbox, "px": area, "why": f"the matte holds it at full alpha ({unsure:.0%} unsure)"})
                log(f"clean: possible enclosed backdrop at {sbox} ({area} px), kept: the matte holds it at full alpha. Open it with --open {','.join(map(str, sbox))} if it is backdrop.")
                continue
            # A flat patch (a white dial, a light shirt) can be the subject in the backdrop's tone: colour cannot tell.
            # A gap on a busy backdrop shows the backdrop's texture, so only a textured patch opens.
            if float(px.std(axis=0).max()) < HOLE_TEXTURE:
                log(f"clean: a flat patch in the backdrop's colours at {[int(sl[1].start), int(sl[0].start)]} ({area} px) is left: it may be the subject. Check it.")
                continue
            alpha[sl][m] = 0
            ys, xs = np.nonzero(m)
            hole = {"box": [int(xs.min() + sl[1].start), int(ys.min() + sl[0].start), int(xs.max() + sl[1].start), int(ys.max() + sl[0].start)], "px": area}
            report["busyHoles"].append(hole)
            log(f"clean: opened a gap of {area} px at {hole['box']} (its colours are the backdrop's, not the subject's)")
    # 3. The edge colour: the subject's own colour from the alpha and the local backdrop.
    rgb = src.copy()
    # Only at the outline (within MAX_BAND px of it): a matte that is unsure over the whole body keeps its colours.
    soft = (alpha > 0.02) & (alpha < 0.98) & (depth <= MAX_BAND * k)
    a3 = alpha[soft][:, None]
    rgb[soft] = np.clip((src[soft] - (1 - a3) * back[soft]) / np.maximum(a3, 0.15), 0, 255)
    removed = float((alpha0 - alpha).clip(0).sum())
    report["rim"] = int(round(removed))
    report["removedShareOfSubject"] = round(removed / max(1.0, float(alpha0.sum())), 4)
    log(f"clean: busy backdrop (spread {report['spread']}): {len(bands)} of {report['busy']['arcs']} arcs had a band "
        f"(deepest {max(bands.values()) if bands else 0} px at 1280), {len(report['busyHoles'])} gap(s) opened, "
        f"{report['removedShareOfSubject']:.2%} of the matte's alpha removed")
    return rgb, np.clip(alpha, 0, 1), report


def save(rgb, alpha, path):
    out = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).round().astype(np.uint8)
    Image.fromarray(out, "RGBA").save(path)


def main():
    args = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith("--") and sys.argv[i - 1] != "--open"]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    src_im = Image.open(args[0]).convert("RGB")
    if "--clean" in flags:
        cut = Image.open(args[1]).convert("RGBA")
    else:
        from rembg import new_session, remove
        model = args[2] if len(args) > 2 else "birefnet-general-lite"
        cut = remove(src_im, session=new_session(model)).convert("RGBA")
        print(f"cut out with {model}: {args[1]}")
    if "--no-clean" in flags:
        cut.save(args[1])
        return
    if cut.size != src_im.size:
        src_im = src_im.resize(cut.size, Image.LANCZOS)
    opened = [[int(v) for v in sys.argv[i + 1].split(",")] for i, a in enumerate(sys.argv) if a == "--open" and i + 1 < len(sys.argv)]
    rgb, alpha, _ = clean(np.asarray(src_im, dtype=float), np.asarray(cut, dtype=float)[..., 3] / 255, keep_holes="--keep-holes" in flags, open_boxes=opened)
    save(rgb, alpha, args[1])


if __name__ == "__main__":
    main()
