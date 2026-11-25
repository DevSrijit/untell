"""The measures of any video file, for untell see: what a model needs to know of a film it cannot watch.

Usage: python3 scripts/measure_video.py picture <video> --out <json> --width W --height H --fps F [--samples S] [--ocr <tesseract>]
                                          [--thumbs <dir> --thumb-rate R --thumb-size WxH]
       python3 scripts/measure_video.py sound <video> --out <json>

It prints one line and writes JSON. Nothing in it judges the film: each value is a measure, and its method is named.

picture  One ffmpeg decode of the file at F frames a second (the caller gives the frame size after rotation) writes
         three copies of the frames into a work folder beside --out, then this script reads them:
           grey    every frame, grey, 1/5 size: the cuts, read by checks/cuts.py (the detector's and the review sheet's
                   one cut function), in parts with one ground, so a long film needs no more memory than a short one.
           small   every frame, RGB, 96 px wide: the motion (mean change of grey level from the frame before, as the
                   review sheet measures it), the brightness, the colours and where the ink sits.
           samples S frames a second, RGB, 640 px on the long side: the detail of text size.
           thumbs  (--thumbs) R frames a second at the contact sheet's frame size, for the review sheet's pages.
         The stalls use the stall rule's own measure (checks/stall.py) on the grey copy: under 0.15 % of the frame
         changes from the frame 0.2 s before.
         Soft changes: a large change of the picture with no hard cut (a fade, a wipe, a large move), found where the
         frames 0.25 s before and after differ much more than the frames round them (see soft_changes).
         Then, for each shot (the time between two hard cuts or soft changes) and for the whole film: the motion level,
         the palette (k-means in OKLab), the brightness, the contrast, light on dark or dark on light, and the ink grid.
sound    The file's sound, mono, 8 kHz: the level every 10 ms (the review sheet's waveform), the onsets (the review
         sheet's method), the silent spans, and the level curve. The loudness (EBU R128) comes from ffmpeg in untell.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent / "inspect" / "checks"))
sys.path.insert(0, str(Path(__file__).resolve().parent / "inspect"))
from cuts import DELTA as CUT_DELTA, cut_frames, film_ground  # noqa: E402
from common import kmeans, to_oklab  # noqa: E402
from film import CHANGE_DELTA  # noqa: E402
from stall import STILL_SHARE  # noqa: E402

STILL = 0.15      # mean change of grey level under this: the motion level "still" (the review sheet's motion line)
STALL = 1.0       # a span still for over this many seconds, by the stall rule's measure, is a stall
INK_DELTA = 28    # a pixel off the ground by more than this on a channel is ink (checks/dead_space.py DELTA)
GRID = 4          # the ink grid: GRID x GRID zones, rows from the top
SMALL_W = 96      # the width of the small copy (the review sheet's motion copy)
PART = 600        # frames of the grey copy read at a time for the cuts
PAD = 16          # frames read either side of a part: the cut function looks 7 frames each way
# The motion levels, by the mean change of grey level from frame to frame on the small copy.
LEVELS = [("still", STILL), ("low", 1.0), ("medium", 4.0), ("high", float("inf"))]
# Ink in a zone, as one digit: 0 none (under 0.5 %), then 2, 5, 10, 20, 35, 50, 70 and 90 %.
INK_STEPS = [0.005, 0.02, 0.05, 0.10, 0.20, 0.35, 0.50, 0.70, 0.90]
# Text-size detail on the 640 px samples: cells of TEXT_CELL px with a share of strong edges in TEXT_EDGES, in a
# row of at least TEXT_RUN such cells (letters stand in lines).
TEXT_CELL, TEXT_EDGE, TEXT_EDGES, TEXT_RUN = 8, 48, (0.12, 0.6), 3
TEXT_MIN = 0.004  # a sample with this share of its cells as text-size detail holds text-size detail
OCR_MAX = 40      # the shots that tesseract reads, the longest first
# Soft changes: the share of the 96 px frame that differs (by over INK_DELTA) between the frames SOFT_LAG s before and
# after a frame. A peak of SOFT_MIN or more, with a calmer moment within 1 s on each side, is a change of the picture.
SOFT_LAG, SOFT_MIN = 0.25, 0.04
EDGE = 24  # a step of more than this many grey levels to a neighbour pixel is an edge (the content of a frame)
SPREAD_BINS = 32  # the colour bins (levels of 256 / SPREAD_BINS on a channel) that the colour spread counts
PICTURE_SPREAD = 24  # a frame whose most common bins need this many or more to cover 90 % of it is a picture


def r(v, n=3):
    return None if v is None or not np.isfinite(v) else round(float(v), n)


def level(m):
    return next(name for name, top in LEVELS if m < top)


def ink_digit(share):
    return str(sum(1 for s in INK_STEPS if share >= s))


def marks(g):
    """A GRID x GRID bool array as rows of "#" (true) and "." (false), top first."""
    return ["".join("#" if v else "." for v in row) for row in g]


def grid_rows(g):
    """A GRID x GRID array of shares as digit rows, top first."""
    return ["".join(ink_digit(v) for v in row) for row in g]


def zone_shares(mask):
    """The share of True in each zone of a (h, w) mask, GRID x GRID."""
    h, w = mask.shape
    ys, xs = np.linspace(0, h, GRID + 1).astype(int), np.linspace(0, w, GRID + 1).astype(int)
    return np.array([[mask[ys[i]:ys[i + 1], xs[j]:xs[j + 1]].mean() if ys[i + 1] > ys[i] and xs[j + 1] > xs[j] else 0.0
                      for j in range(GRID)] for i in range(GRID)])


def ground_of(rgb):
    """The most common colour (bins of 8) of one or more frames: the ground (checks/film.py ground)."""
    q = (rgb.reshape(-1, 3) // 8).astype(np.int32)
    keys, counts = np.unique(q[:, 0] * 1024 + q[:, 1] * 32 + q[:, 2], return_counts=True)
    k = int(keys[counts.argmax()])
    return np.array([(k // 1024) * 8 + 4, ((k // 32) % 32) * 8 + 4, (k % 32) * 8 + 4])


def luma(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def palette(rgb, k=5, top=5, min_share=0.02):
    """The dominant colours of the pixels (n, 3): k-means in OKLab, each centre as the mean sRGB of its pixels."""
    px = rgb.reshape(-1, 3)
    if len(px) > 6000:
        px = px[np.random.default_rng(7).choice(len(px), 6000, replace=False)]
    if len(px) < k:
        return []
    lab = to_oklab(px.astype(np.float64))
    _, a = kmeans(lab.copy(), k=k)
    out = []
    for j in range(k):
        m = a == j
        if m.any():
            c = px[m].mean(axis=0)
            out.append(["#%02X%02X%02X" % tuple(int(round(v)) for v in c), float(m.mean())])
    out.sort(key=lambda x: -x[1])
    # Two centres closer than a just visible difference are one colour.
    merged = []
    for hx, s in out:
        rgbv = np.array([int(hx[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float64)
        near = next((m for m in merged if np.linalg.norm(to_oklab(m[2]) - to_oklab(rgbv)) < 0.04), None)
        if near:
            near[1] += s
        else:
            merged.append([hx, s, rgbv])
    return [[hx, r(s, 2)] for hx, s, _ in merged if s >= min_share][:top]


def text_cells(grey):
    """The cells of one grey frame (h, w) that hold detail of text size: a share of strong edges in TEXT_EDGES, in a
    horizontal run of TEXT_RUN or more such cells. Returns a (rows, cols) bool array."""
    g = grey.astype(np.int16)
    e = np.zeros(g.shape, dtype=bool)
    e[:, 1:] |= np.abs(g[:, 1:] - g[:, :-1]) > TEXT_EDGE
    e[1:, :] |= np.abs(g[1:, :] - g[:-1, :]) > TEXT_EDGE
    rows, cols = g.shape[0] // TEXT_CELL, g.shape[1] // TEXT_CELL
    if rows < 1 or cols < TEXT_RUN:
        return np.zeros((max(rows, 1), max(cols, 1)), dtype=bool)
    d = e[:rows * TEXT_CELL, :cols * TEXT_CELL].reshape(rows, TEXT_CELL, cols, TEXT_CELL).mean(axis=(1, 3))
    cell = (d >= TEXT_EDGES[0]) & (d <= TEXT_EDGES[1])
    out = np.zeros_like(cell)
    for i in range(rows):
        j = 0
        while j < cols:
            if cell[i, j]:
                k = j
                while k < cols and cell[i, k]:
                    k += 1
                if k - j >= TEXT_RUN:
                    out[i, j:k] = True
                j = k
            else:
                j += 1
    return out


def ocr_words(tesseract, image):
    """The words that tesseract reads in one image with a confidence of 70 or more, in reading order."""
    # One thread for each tesseract: the caller runs several at once.
    r_ = subprocess.run([tesseract, str(image), "stdout", "--psm", "11", "tsv"], capture_output=True, text=True, timeout=60,
                        env={**os.environ, "OMP_THREAD_LIMIT": "1"})
    words = []
    for line in r_.stdout.splitlines()[1:]:
        p = line.split("\t")
        if len(p) >= 12 and p[11].strip() and float(p[10] or -1) >= 70 and any(ch.isalnum() for ch in p[11]):
            words.append((int(p[2]), int(p[3]), int(p[4]), int(p[6]), int(p[7]), p[11].strip()))
    words.sort(key=lambda w: (w[0], w[1], w[2], w[3], w[4]))
    # Under 3 letters or digits in all is a stray mark (a net, grain or an edge read as "2"), not text.
    return [w[5] for w in words] if sum(ch.isalnum() for w in words for ch in w[5]) >= 3 else []


def colour_spread(rgb):
    """How many colour bins (SPREAD_BINS levels a channel) the most common colours need to cover 90 % of the pixels.
    Flat graphics need a few; a photograph or footage needs many."""
    q = (rgb.reshape(-1, 3) // (256 // SPREAD_BINS)).astype(np.int32)
    _, counts = np.unique(q[:, 0] * SPREAD_BINS * SPREAD_BINS + q[:, 1] * SPREAD_BINS + q[:, 2], return_counts=True)
    counts = np.sort(counts)[::-1]
    return int(np.searchsorted(np.cumsum(counts), 0.9 * counts.sum()) + 1)


def edges(rgb):
    """The pixels of a frame (h, w, 3) on a step of more than EDGE grey levels to a neighbour: its content."""
    g = luma(rgb)
    e = np.zeros(g.shape, dtype=bool)
    e[:, 1:] |= np.abs(g[:, 1:] - g[:, :-1]) > EDGE
    e[1:, :] |= np.abs(g[1:, :] - g[:-1, :]) > EDGE
    return e


def grow(mask):
    """A mask grown by one pixel each way."""
    out = mask.copy()
    out[1:] |= mask[:-1]
    out[:-1] |= mask[1:]
    out[:, 1:] |= out[:, :-1].copy()
    out[:, :-1] |= out[:, 1:].copy()
    return out


def soft_changes(small, motion, cuts, F):
    """The large changes of the picture with no hard cut. For each frame, D is the share of the 96 px copy that differs
    (by over INK_DELTA on a channel) between the frames SOFT_LAG s before and after it. A peak of D of SOFT_MIN or more,
    with no hard cut in its window and a calmer moment (D under half the peak) within 1 s on each side, is a change. A
    camera that moves all the time has no calmer moment, so it gives no change. Each change is classed on the frame in
    the middle (M) against the frames before (A) and after (B):
      fade   most changed pixels lie between A and B (a mix of both), or M is darker than both (a dip to black)
      wipe   most changed pixels are already as in B or still as in A, and both groups are large (a boundary moves)
      move   neither: the content moved (a slide, a push, a zoom)
    A change starts a new shot only when it replaces the picture: half or more of A's edges are gone in B and 30 % or
    more of B's edges are new (a fade or a wipe), or the change covers half the frame (a fade or a wipe), or it is a
    move that covers 60 % of the frame and takes half of A's edges away. A word that fades in over the same picture
    keeps A's edges: it is an entrance, not a new shot.
    Returns [(frame, kind, D, span in seconds, starts a shot)]."""
    n = len(small)
    h = max(2, int(round(SOFT_LAG * F)))
    if n < 4 * h + 2:
        return []
    D = np.zeros(n)
    for s0 in range(h, n - h, PART):
        b0 = min(n - h, s0 + PART)
        a_ = small[s0 - h:b0 - h].astype(np.int16)
        b_ = small[s0 + h:b0 + h].astype(np.int16)
        D[s0:b0] = (np.abs(b_ - a_).max(axis=3) > INK_DELTA).reshape(b0 - s0, -1).mean(axis=1)
    cut_set = np.zeros(n + 1, dtype=bool)
    cut_set[cuts] = True
    cut_run = np.concatenate([[0], np.cumsum(cut_set)])
    out, last = [], -10 ** 9
    i = 2 * h - 1
    while i < n - 2 * h - 1:
        i += 1
        if D[i] < SOFT_MIN or D[i] < D[i - h:i + h + 1].max() or i - last < 2 * h:
            continue
        # A flat top (the change saturates while it runs): its middle frame.
        j = i
        while j + 1 < n - 2 * h and D[j + 1] >= D[i] - 0.01:
            j += 1
        i = (i + j) // 2
        # No hard cut from the frame before A to the frame after B.
        if cut_run[min(n, i + h + 1)] - cut_run[max(0, i - h)] > 0:
            continue
        left, right = D[max(0, i - 4 * h):i - 2 * h + 1], D[i + 2 * h:i + 4 * h + 1]
        if not len(left) or not len(right) or left.min() > 0.5 * D[i] or right.min() > 0.5 * D[i]:
            continue
        A, M, B = (small[j].astype(np.float32) for j in (i - h, i, i + h))
        changed = np.abs(B - A).max(axis=2) > INK_DELTA
        if changed.mean() < 0.5 * SOFT_MIN:
            continue
        nearA = np.abs(M - A).max(axis=2) <= INK_DELTA / 2
        nearB = np.abs(M - B).max(axis=2) <= INK_DELTA / 2
        c_ = changed.sum()
        sa, sb = float((nearA & changed).sum() / c_), float((nearB & changed & ~nearA).sum() / c_)
        dv = (B - A)[changed]
        alpha = float(np.clip(((M - A)[changed] * dv).sum() / max(1e-6, (dv * dv).sum()), 0, 1))
        mix = np.abs(M - (A + alpha * (B - A))).max(axis=2) <= INK_DELTA / 2
        fit = float((mix & changed & ~nearA & ~nearB).sum() / c_)
        ml, al, bl = (float(luma(x).mean()) for x in (M, A, B))
        if (fit >= 0.5 and 0.15 <= alpha <= 0.85) or ml < min(al, bl) - 0.2 * 255:
            kind = "fade"
        elif sa + sb >= 0.7 and sa >= 0.15 and sb >= 0.15:
            kind = "wipe"
        else:
            kind = "move"
        # The content of A that is gone in B, and the content of B that is new: edges, so that a gradient ground counts
        # as no content.
        eA, eB = edges(A), edges(B)
        lost = float((eA & ~grow(eB)).sum() / eA.sum()) if eA.mean() >= 0.002 else 0.0
        gain = float((eB & ~grow(eA)).sum() / eB.sum()) if eB.mean() >= 0.002 else 0.0
        d = float(D[i])
        starts = ((kind in ("fade", "wipe") and ((lost >= 0.5 and gain >= 0.3) or d >= 0.5))
                  or (kind == "move" and d >= 0.6 and lost >= 0.5))
        # The span: the frames round the middle that move (at least the frames between A and B).
        a0 = i
        while a0 > max(0, i - int(1.5 * F)) and motion[a0] >= STILL:
            a0 -= 1
        b1 = i
        while b1 < min(n - 1, i + int(1.5 * F)) and motion[b1 + 1] >= STILL:
            b1 += 1
        out.append((i, kind, d, (b1 - a0) / F, bool(starts)))
        last = i
    return out


T0 = time.time()


def picture(a):
    W, H, F = a.width, a.height, a.fps
    work = Path(tempfile.mkdtemp(prefix="measure-", dir=Path(a.out).parent))
    try:
        return _picture(a, W, H, F, work)
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _picture(a, W, H, F, work):
    cw, ch = max(2, W // 5 // 2 * 2), max(2, H // 5 // 2 * 2)  # the review sheet's cut copy
    sw, sh = SMALL_W, max(2, round(SMALL_W * H / W / 2) * 2)
    long_side = 640
    tw_, th_ = (long_side, max(2, round(long_side * H / W / 2) * 2)) if W >= H else (max(2, round(long_side * W / H / 2) * 2), long_side)
    S = a.samples
    (work / "samples").mkdir()
    graph = (f"[0:v]fps={F},split=2[a][b];[a]scale={cw}:{ch}:flags=bilinear,format=gray[g];"
             f"[b]scale={sw}:{sh}:flags=area,format=rgb24[s];"
             f"[0:v]fps={S},scale={tw_}:{th_}:flags=area[t]")
    if a.thumbs:
        Path(a.thumbs).mkdir(parents=True, exist_ok=True)
        for old in Path(a.thumbs).glob("t*.png"):
            old.unlink()
        tw2, th2 = (int(v) for v in a.thumb_size.split("x"))
        graph += f";[0:v]fps=fps={a.thumb_rate}:start_time=0:round=near,scale={tw2}:{th2}:flags=lanczos[th]"
    cmd = ["ffmpeg", "-v", "error", "-y", "-i", a.video, "-filter_complex", graph,
           "-map", "[g]", "-f", "rawvideo", str(work / "grey.u8"),
           "-map", "[s]", "-f", "rawvideo", str(work / "small.rgb"),
           "-map", "[t]", "-q:v", "2", "-start_number", "0", str(work / "samples" / "s%05d.jpg"),
           *(["-map", "[th]", "-start_number", "0", str(Path(a.thumbs) / "t%04d.png")] if a.thumbs else [])]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit(f"measure: ffmpeg could not read the frames: {p.stderr.strip()[-300:]}")
    grey = np.memmap(work / "grey.u8", dtype=np.uint8, mode="r")
    n = len(grey) // (cw * ch)
    if n < 2:
        sys.exit("measure: the file has fewer than 2 frames")
    grey = grey[: n * cw * ch].reshape(n, ch, cw)
    small = np.fromfile(work / "small.rgb", dtype=np.uint8)
    small = small[: (len(small) // (sw * sh * 3)) * sw * sh * 3].reshape(-1, sh, sw, 3)
    n = min(n, len(small))
    small = small[:n]
    dur = n / F

    # Motion: the mean change of grey level from the frame before, on the small copy (as the review sheet measures it).
    # The luma of the small copy, made in parts, so a long film needs no float copy of all its colour frames.
    sg = np.empty(small.shape[:3], dtype=np.float32)
    for s0 in range(0, n, PART):
        sg[s0:s0 + PART] = luma(small[s0:s0 + PART].astype(np.float32))
    motion = np.zeros(n)
    motion[1:] = np.abs(np.diff(sg, axis=0)).mean(axis=(1, 2))
    still = motion < STILL

    # Stalls: the stall rule's measure (checks/stall.py, checks/film.py change_lag) on the grey copy: a frame is still
    # when under STILL_SHARE of it changes by more than CHANGE_DELTA from the frame 0.2 s before. A run of still frames
    # starts 0.2 s after the last change. A run that reaches the last frame counts here (the rule leaves it to the end check).
    lag = max(1, int(round(F)) // 5)
    lag_share = np.zeros(n)
    for s0 in range(1, n, PART):
        b0 = min(n, s0 + PART)
        cur = np.asarray(grey[s0:b0], dtype=np.int16)
        prev = np.asarray(grey[np.maximum(0, np.arange(s0, b0) - lag)], dtype=np.int16)
        lag_share[s0:b0] = (np.abs(cur - prev) > CHANGE_DELTA).reshape(b0 - s0, -1).mean(axis=1)
    held = lag_share < STILL_SHARE
    held[0] = False
    stalls, start = [], None
    for i in range(n + 1):
        if i < n and held[i]:
            start = i if start is None else start
        elif start is not None:
            first = 0 if start <= lag else start - lag
            if (i - first) / F > STALL:
                stalls.append([r(first / F, 2), r(i / F, 2)])
            start = None

    # Cuts: checks/cuts.py on the grey copy, in parts of PART frames with PAD frames either side, one ground.
    ground_g = film_ground(grey)
    cuts = set()
    for s0 in range(0, n, PART):
        a0, b0 = max(0, s0 - PAD), min(n, s0 + PART + PAD)
        for c in cut_frames(np.asarray(grey[a0:b0]), ground=ground_g):
            if s0 <= a0 + c < s0 + PART:
                cuts.add(a0 + c)
    cuts = sorted(cuts)
    cut_list = []
    for c in cuts:
        whole = float((np.abs(grey[c].astype(np.int16) - grey[c - 1].astype(np.int16)) > CUT_DELTA).mean())
        cut_list.append({"t": r(c / F, 3), "frame": c, "strength": r(whole, 2)})

    # Per frame: brightness, the ground, the ink and its grid, light or dark ink.
    lum = sg
    lum /= 255.0  # in place: the motion above is already measured
    bright = lum.mean(axis=(1, 2))
    span = np.percentile(lum.reshape(n, -1), 95, axis=1) - np.percentile(lum.reshape(n, -1), 5, axis=1)

    # Soft changes; those that replace the picture start a shot, as a hard cut does.
    soft = soft_changes(small, motion, cuts, F)
    starts = {f: kind for f, kind, _, _, st in soft if st}
    cut_ids = set(cuts)
    bounds = [0] + sorted(set(cuts) | set(starts)) + [n]
    shots, inks, pol = [], np.zeros((n, GRID, GRID)), np.zeros(n)
    ink_share = np.zeros(n)
    for k in range(len(bounds) - 1):
        f0, f1 = bounds[k], bounds[k + 1]
        if f1 <= f0:
            continue
        by = "start" if f0 == 0 else "cut" if f0 in cut_ids else starts[f0]
        seg = small[f0:f1]
        gr = ground_of(seg[:: max(1, len(seg) // 30)])
        off = np.abs(seg.astype(np.int16) - gr[None, None, None, :]).max(axis=3) > INK_DELTA
        ink_share[f0:f1] = off.reshape(len(seg), -1).mean(axis=1)
        for i in range(len(seg)):
            inks[f0 + i] = zone_shares(off[i])
        gl = float(luma(gr.astype(np.float32))) / 255.0
        il = np.array([lum[f0 + i][off[i]].mean() if off[i].mean() >= 0.01 else np.nan for i in range(len(seg))])
        pol[f0:f1] = np.where(np.isnan(il), 0, np.where(il > gl, 1, -1))
        m = motion[f0 + 1:f1] if f1 - f0 > 1 else motion[f0:f1]
        mm = float(m.mean()) if len(m) else 0.0
        step = max(1, len(seg) // 40)
        shots.append({"from": r(f0 / F, 3), "to": r(f1 / F, 3), "by": by, "motion": {"level": level(mm), "mean": r(mm, 2)},
                      "brightness": r(float(bright[f0:f1].mean()), 2),
                      "palette": palette(seg[::step], k=4, top=3, min_share=0.05),
                      "ground": "#%02X%02X%02X" % tuple(int(v) for v in gr),
                      "ink": grid_rows(inks[f0:f1].mean(axis=0)), "inkShare": r(float(ink_share[f0:f1].mean()), 2)})

    # Text-size detail on the samples.
    files = sorted((work / "samples").glob("s*.jpg"))

    def scan(fp):
        im = Image.open(fp)
        rgb = np.asarray(im.convert("RGB"))
        return text_cells(np.asarray(im.convert("L"))), colour_spread(rgb[::2, ::2])
    with ThreadPoolExecutor(8) as ex:
        scanned = list(ex.map(scan, files))
    text_t, spread_t = [], []
    for k, (c, spread) in enumerate(scanned):
        t = k / S
        if t >= dur:
            break
        share = float(c.mean()) if c.size else 0.0
        text_t.append((t, share, zone_shares(c) if c.size else np.zeros((GRID, GRID))))
        spread_t.append(spread)
    # Text-size detail for each shot: the samples inside it (or the one nearest its middle, for a shot shorter than
    # the sample step). The zones mark "#" where a zone holds that detail on the shot's richest sample.
    picks = []
    for sh in shots:
        inside = [x for x in text_t if sh["from"] <= x[0] < sh["to"]]
        if not inside and text_t:
            mid = (sh["from"] + sh["to"]) / 2
            near = min(text_t, key=lambda x: abs(x[0] - mid))
            inside = [near] if abs(near[0] - mid) <= 0.5 / S + (sh["to"] - sh["from"]) / 2 else []
        best = max(inside, key=lambda x: x[1]) if inside else None
        if best and best[1] >= TEXT_MIN:
            sh["text"] = {"zones": marks(best[2] > 0.02), "share": r(best[1], 3)}
            picks.append((sh, best[0], spread_t[int(round(best[0] * S))] >= PICTURE_SPREAD))
    tz = np.mean([z > 0.02 for _, s, z in text_t if s >= TEXT_MIN], axis=0) if any(s >= TEXT_MIN for _, s, _ in text_t) else np.zeros((GRID, GRID))
    text_share = float(np.mean([s >= TEXT_MIN for _, s, _ in text_t])) if text_t else 0.0

    # OCR: with tesseract, the words on the richest sample of each shot with text-size detail (at most OCR_MAX shots,
    # the longest first), read on the frame at that time at up to 1920 px.
    ocr = None
    if a.ocr and picks:
        pick = sorted(picks, key=lambda p_: -(p_[0]["to"] - p_[0]["from"]))[:OCR_MAX]
        big_w, big_h = (min(W, 1920), max(2, round(min(W, 1920) * H / W / 2) * 2)) if W >= H else (max(2, round(min(H, 1920) * W / H / 2) * 2), min(H, 1920))

        def read(p_):
            sh_, t_, _ = p_
            big = work / f"ocr-{t_:.3f}.png"
            q = subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t_:.3f}", "-i", a.video, "-frames:v", "1", "-vf", f"scale={big_w}:{big_h}", str(big)], capture_output=True)
            return ocr_words(a.ocr, big) if q.returncode == 0 and big.exists() else []
        with ThreadPoolExecutor(8) as ex:
            for (sh_, t_, over), words in zip(pick, ex.map(read, pick)):
                if words:
                    sh_["text"]["words"] = " ".join(words)[:160]
                else:
                    sh_["text"]["words"] = None
                    sh_["text"]["why"] = (f"tesseract read no word with a confidence of 70 or more on the frame at {t_:.2f} s: "
                                          + ("the detail sits over a picture, where letters do not separate from the ground" if over
                                             else "the type can be too large or too small to read, or the detail is not type (a pattern, grain, a chart)"))
        for sh_, _, _ in picks[:]:
            if "words" not in sh_["text"]:
                sh_["text"]["words"] = None
                sh_["text"]["why"] = f"not read: tesseract reads the {OCR_MAX} longest shots with text-size detail"
        ocr = {"tool": "tesseract", "shots": len(pick), "of": len(picks)}

    # The first second.
    f1s = min(n, int(round(F)))
    first_change = next((i for i in range(1, n) if lag_share[i] >= STILL_SHARE or not still[i]), None)
    first = {"brightness": r(float(bright[0]), 2), "inkShare": r(float(ink_share[0]), 3), "ink": grid_rows(inks[0]),
             "blankStart": bool(ink_share[0] < 0.005), "firstChangeAt": r(first_change / F, 3) if first_change is not None else None,
             "motion": level(float(motion[1:f1s].mean()) if f1s > 1 else 0.0), "cuts": sum(1 for c in cuts if c < f1s),
             "inkAt1s": r(float(ink_share[min(n - 1, f1s)]), 3),
             "textLike": any(s >= TEXT_MIN for t, s, _ in text_t if t < 1.0)}

    # The film.
    has_ink = pol != 0
    light = float((pol[has_ink] > 0).mean()) if has_ink.any() else None
    pol_word = ("no ink: the frames are one colour" if light is None else "light on dark" if light >= 0.7
                else "dark on light" if light <= 0.3 else f"mixed: light on dark {round(light * 100)} % of the time")
    idx = np.linspace(0, n - 1, min(n, 240)).astype(int)
    film = {"palette": palette(small[idx], k=6, top=5), "brightness": r(float(bright.mean()), 2),
            "contrast": r(float(span.mean()), 2), "polarity": pol_word, "lightInkShare": r(light, 2),
            "ink": grid_rows(inks.mean(axis=0)), "inkShare": r(float(ink_share.mean()), 2)}

    out = {"version": 1, "fps": F, "frames": n, "seconds": r(dur, 3), "size": [W, H], "samples": S, "samples_n": len(files),
           "cuts": cut_list,
           "changes": [{"t": r(f / F, 3), "frame": f, "kind": kind, "strength": r(d, 2), "span": r(span, 2), "shot": st} for f, kind, d, span, st in soft],
           "shots": shots, "stalls": stalls, "stillShare": r(sum(b - a_ for a_, b in stalls) / dur if dur else 0, 3),
           "firstSecond": first, "film": film, "elapsed": r(time.time() - T0, 2),
           "text": {"share": r(text_share, 2), "zones": marks(tz > 0.25), "shots": len(picks), "ocr": ocr},
           # For the review sheet (--measures): the motion of every frame, and the cuts as frames.
           "sheet": {"fps": F, "motion": [r(v, 3) for v in motion], "cuts": cuts, "stalls": stalls}}
    Path(a.out).write_text(json.dumps(out))
    print(f"measure: {n} frames, {len(cuts)} cuts, {len(soft)} soft changes, text-size detail in {len(picks)} shots")


def sound(a):
    SR = 8000
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", a.video, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"], capture_output=True)
    if p.returncode != 0:
        sys.exit(f"measure: ffmpeg could not read the sound: {p.stderr.decode(errors='replace').strip()[-300:]}")
    raw = np.frombuffer(p.stdout, dtype=np.int16)
    x = raw.astype(np.float32) / 32768
    dur = len(x) / SR
    hop = 80  # 10 ms
    k = len(x) // hop
    env = np.sqrt((x[:k * hop].reshape(k, hop) ** 2).mean(axis=1) + 1e-12)
    # Onsets: the review sheet's method (a rise of the 10 ms level over its mean plus 2.5 deviations, 120 ms apart).
    flux = np.maximum(0, np.diff(env, prepend=env[0]))
    thr = flux.mean() + 2.5 * flux.std()
    onsets, last = [], -1e9
    for i, f in enumerate(flux):
        if f > thr and i - last > 12:
            onsets.append(round(i * hop / SR, 3))
            last = i
    # Silent spans: 50 ms windows under -60 dBFS for 0.5 s or more (as untell listen measures them); digital silence apart.
    win = SR // 20
    m = len(x) // win
    wdb = 20 * np.log10(np.sqrt((x[:m * win].reshape(m, win) ** 2).mean(axis=1)) + 1e-12)
    zero = (np.abs(raw[:m * win].reshape(m, win)).max(axis=1) == 0)

    def runs(flags):
        out, i = [], 0
        while i < len(flags):
            if flags[i]:
                j = i
                while j < len(flags) and flags[j]:
                    j += 1
                if (j - i) * 0.05 >= 0.5:
                    out.append([r(i * 0.05, 2), r(j * 0.05, 2)])
                i = j
            else:
                i += 1
        return out
    out = {"version": 1, "seconds": r(dur, 3), "silent": runs(wdb < -60), "digitalSilence": runs(zero),
           "onsets": onsets, "elapsed": r(time.time() - T0, 2),
           "env": [r(v, 4) for v in env]}
    Path(a.out).write_text(json.dumps(out))
    print(f"measure: sound {dur:.1f} s, {len(onsets)} onsets")


ap = argparse.ArgumentParser()
ap.add_argument("what", choices=["picture", "sound"])
ap.add_argument("video")
ap.add_argument("--out", required=True)
ap.add_argument("--width", type=int)
ap.add_argument("--height", type=int)
ap.add_argument("--fps", type=float)
ap.add_argument("--samples", type=float, default=2.0)
ap.add_argument("--ocr")
ap.add_argument("--thumbs", help="a folder for the contact sheet's frames (t0000.png, ...)")
ap.add_argument("--thumb-rate", default="1", help="frames a second for --thumbs, as a ratio (1000/1500)")
ap.add_argument("--thumb-size", default="432x243", help="the size of each frame for --thumbs, WxH")
args = ap.parse_args()
if args.what == "picture":
    if not (args.width and args.height and args.fps):
        sys.exit("measure: picture needs --width, --height and --fps")
    picture(args)
else:
    sound(args)
