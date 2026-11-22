"""signature: the system's look is on screen. Only the parts that a measure can check.

Measured on the lossless key frames (every 15th frame, at half size, so thin accent lines count):
  accent shows    the accent covers at least MIN_SHARE of the frame on one key frame, for a system whose accent is
                  not near its ground or ink (then it would not read as an accent anyway). An accent pixel is the
                  accent (tokens colors.accent) or its text tone (colors.accentText) within ACCENT_NEAR, or a tint of
                  the accent over the ground or the surface: a pixel on the line from that ground to the accent, at
                  TINT_MIN of the way or more, within TINT_NEAR of the line, in a flat area (a 3 x 3 opening) and not
                  on a picture (Manual's lit code band is the accent at a tint).
  accent elements the accent pixels on one key frame, grown by JOIN px (half size), make separate parts of the
                  frame; each part of MIN_PART of the frame or more, off the pictures, is one accent element. A frame
                  with more than the system's accentElements.max for 1 s or more is a warning: the eye has more than
                  one place to go. A code block is one element (its band, gutter bar and literals sit together). Only
                  for a system that states accentElements (Manual): elsewhere the accent may be an ink or a material.
                  A thin line in the accent joins the parts it runs between (a dimension's extension line from its
                  line to its arrow, a callout's leader from its label to its arrow): its px on the full-size frame,
                  the accent or its text tone blended over the ground or the surface (a 1 px line on a half px), join
                  the parts and add nothing to their size. At half size such a line blends away.
  hairline grid   (a move whose how says "fixed pitch") on every key frame, the lines in the system's rule colour that
                  run across most of the frame (a column or a row with GRID_RUN of its px in that colour) stand on
                  one lattice in both axes: GRID_MIN lines or more each way (and most of the lines found), each gap
                  a whole number of pitches within GRID_TOL px (a line that content covers leaves a gap of two
                  pitches; a long line of content in the rule colour, off the lattice, is left out).
Not measured yet (the direction's measurable moves go to "notes" with their method): per-block signatures such as
Graphite's tilt, Spec's figure window.
"""
import numpy as np
from scipy import ndimage as ndi

from film import Skip, entrance_groups, finding

MIN_SHARE = 0.0005
# A system that draws in hairlines (stroke of 2 px or less at 1080) puts its accent on a line: a blue dimension line half
# the frame wide covers 0.048 % of the frame, under MIN_SHARE, though it reads at once. Its accent shows when the accent
# lines on one key frame, measured on the full frame, add up to HAIRLINE_LEN of the frame's width.
HAIRLINE_STROKE, HAIRLINE_LEN = 2.0, 0.25
ACCENT_NEAR = 28
TINT_MIN, TINT_NEAR = 0.08, 8
JOIN, MIN_PART = 24, 0.0004
LINE_MIN = 0.3


def hexrgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)])


def accent_lines(im, c):
    """The px of thin accent lines on a full-size RGB frame (int16): the accent or its text tone, or a blend of either over
    the ground or the surface at LINE_MIN of the way or more (a 1 px line on a half px is such a blend). They join
    accent parts; they never count as a part's size."""
    x = im.astype(np.float32)
    out = np.zeros(im.shape[:2], bool)
    for t in ("accent", "accentText"):
        if not c.get(t):
            continue
        tgt = hexrgb(c[t]).astype(np.float32)
        for k in ("ground", "surface"):
            if not c.get(k):
                continue
            bg = hexrgb(c[k]).astype(np.float32)
            v = tgt - bg
            vv = float(v @ v)
            if vv < 40 ** 2:
                continue
            off = np.abs(x - bg).max(axis=2) >= TINT_NEAR
            if not off.any():
                continue
            xs = x[off]
            a = ((xs - bg) @ v) / vv
            near = np.abs(xs - (bg + a[:, None] * v)).max(axis=1) < TINT_NEAR
            line = np.zeros(out.shape, bool)
            line[off] = near & (a >= LINE_MIN) & (a <= 1.05)
            out |= line
    return out


def accent_mask(im, c, pictures=None, tints=True):
    """Accent pixels of an RGB frame (int16, h x w x 3): the accent, its text tone, and tints of the accent over the
    ground or the surface (flat areas only, and not inside `pictures`, a mask of the photos and clips on the frame:
    a photo's tones are not a tint)."""
    acc = hexrgb(c["accent"])
    m = np.abs(im - acc).max(axis=2) < ACCENT_NEAR
    if c.get("accentText"):
        m |= np.abs(im - hexrgb(c["accentText"])).max(axis=2) < ACCENT_NEAR
    if not tints:
        return m
    x = im.astype(np.float32)
    for k in ("ground", "surface"):
        if not c.get(k):
            continue
        bg = hexrgb(c[k]).astype(np.float32)
        v = (acc - bg).astype(np.float32)
        vv = float(v @ v)
        if vv < 40 ** 2:
            continue
        # Only pixels off this ground can be a tint (most of a frame is the ground itself): test those alone.
        off = np.abs(x - bg).max(axis=2) >= TINT_NEAR
        tint = np.zeros(m.shape, bool)
        if off.any():
            xs = x[off]
            a = ((xs - bg) @ v) / vv
            near = np.abs(xs - (bg + a[:, None] * v)).max(axis=1) < TINT_NEAR
            tint[off] = near & (a >= TINT_MIN) & (a <= 1.05)
        if pictures is not None:
            tint &= ~pictures
        # A tint is a flat area (a band, a panel): an opening removes hairlines and the soft edges of letters.
        m |= ndi.binary_opening(tint, np.ones((3, 3), bool))
    return m


WIDE_SHARE, WIDE_FRAMES, FULL_ACCENT = 0.6, 0.5, 0.9
HOLD_DIFF, LAND_F = 0.5, 12  # a frame that differs from the next by less (mean, 0-255) holds; a change lands within 12 frames


def ground_changes(film):
    """The frames on which the frame's main colour (bins of 32, half or more of the frame) differs from the frame before:
    the picture takes a new ground, by a cut or by a shape that grows until it fills the frame."""
    out, prev = [], None
    for f in range(film.n):
        q = (film.rgb[f] // 32).reshape(-1, 3)
        keys, counts = np.unique(q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2], return_counts=True)
        main = int(keys[counts.argmax()]) if counts.max() >= 0.5 * len(q) else None
        if f and main is not None and main != prev:
            out.append(f)
        prev = main if main is not None else prev
    return out


def measure_move(film, c, how):
    """Measures a direction move whose `how` this check knows, else None:
      "60 % of the frame width on most beats"  the share of frames with text on screen whose text ink (the union of the
                                               visible texts' ink, opacity 0.5) spans WIDE_SHARE of the frame width;
                                               it passes over WIDE_FRAMES of them;
      "more than 90 % of a frame at a scene change"  the accent's share of the frame on each scene change (a cut, an
                                               entrance, a new ground: ground_changes) and the frames up to where it
                                               lands; it passes when one reaches FULL_ACCENT.
      and, each in its own function below: the statement's width (Nocturne), partial opacity (Primary, Cutout, Raw),
      how text reaches full opacity (Title, Ma), typing one character at a time (Raw, Console), one accent region (Cutout,
      Graphite), one accent word (Courtside), the overprint colour and motion on twos (Riso).
    Returns (ok, measured)."""
    low = how.lower()
    if "bright band" in low:
        return light_sweeps(film, low)
    if "frame width" in low and "60" in low:
        shown = wide = 0
        for f in range(film.n):
            xs = [t["ink"] for t in film.ink[f] if t["opacity"] >= 0.5]
            if not xs:
                continue
            shown += 1
            spans = sorted((max(0, x[0]), min(film.W, x[2])) for x in xs)
            cover, end = 0.0, -1.0
            for a, b in spans:
                if b <= end:
                    continue
                cover += b - max(a, end)
                end = b
            wide += cover >= WIDE_SHARE * film.W
        share = wide / shown if shown else 0.0
        return share > WIDE_FRAMES, {"framesWide": round(share, 2), "need": f"over {WIDE_FRAMES:.0%} of the frames with text span {WIDE_SHARE:.0%} of the width"}
    if "90 %" in low and "scene change" in low:
        from sound_common import cuts as cut_frames
        acc = hexrgb(c["accent"])
        best = 0.0
        # A scene change: a cut, an entrance, or a new ground: the frame's main colour changes (a word that grows into
        # the ground is a run of frames, not one cut). Each is read on its frame and on the frames up to where the
        # change lands (the picture holds), at most LAND_F frames on: the kit's toGround move fills the frame on its
        # beat, the last frame of the run.
        moving = np.abs(np.diff(film.rgb, axis=0)).mean(axis=(1, 2, 3)) > HOLD_DIFF
        def land(f):
            g = f
            while g < min(film.n - 1, f + LAND_F) and moving[g]:
                g += 1
            return g
        for f in cut_frames(film) + [g["last"] for g in entrance_groups(film)] + ground_changes(film):
            for g in range(f, max(land(f), min(film.n - 1, f + 1)) + 1):
                rgb = film.rgb[g]
                best = max(best, float((np.abs(rgb - acc[None, None, :]).max(axis=2) < 40).mean()))
        return best >= FULL_ACCENT, {"accentAtCut": round(best, 2), "need": f"{FULL_ACCENT:.0%} of a frame at a cut"}
    if "85 %" in low and "safe width" in low:
        return statement_width(film)
    if "partial opacity" in low:
        # Primary: "no shape at partial opacity for more than 2 frames"; Cutout: "no sliding shape"; Raw: "no element".
        limit = 2 if "more than 2 frames" in low else 0
        return partial_opacity(film, "all" if "no element" in low else "shapes", limit)
    if "full opacity in one frame" in low:
        return text_fade(film, most=1)
    if "full opacity over 40 frames" in low:
        return text_fade(film, least=40)
    if "one character at a time" in low:
        return typing_steps(film)
    if "one connected region per key frame" in low:
        return accent_regions(film, c)
    if "one word per key frame" in low:
        return accent_words(film, c)
    if "overprint colour" in low:
        return overprint(film, c)
    if "every second or third frame" in low:
        return stepped_motion(film)
    if "fixed pitch" in low:
        return hairline_grid(film, c)
    return None


GRID_RUN, GRID_MIN, GRID_TOL, GRID_NEAR = 0.3, 4, 1.5, 16


def _lines(prof):
    """The centres of the runs of columns (or rows) whose share is GRID_RUN or more."""
    idx = np.where(prof >= GRID_RUN)[0]
    if not len(idx):
        return []
    out, start = [], idx[0]
    for a, b in zip(idx[:-1], idx[1:]):
        if b != a + 1:
            out.append((start + a) / 2)
            start = b
    out.append((start + idx[-1]) / 2)
    return out


def _pitch(centres):
    """(pitch, regular): the most common gap, and whether GRID_MIN lines or more stand on one lattice of that pitch
    (each gap between them a whole number of pitches within GRID_TOL px). A line off the lattice is content drawn in
    the rule colour (a divider, a dimension), not a fault of the grid: it is left out."""
    if len(centres) < GRID_MIN:
        return None, False
    gaps = np.diff(centres)
    p = float(np.median(gaps[gaps > 2])) if (gaps > 2).any() else 0.0
    if p <= 2:
        return None, False
    best = []
    for start in range(min(3, len(centres))):
        on = [centres[start]]
        for c in centres[start + 1:]:
            g = c - on[-1]
            k = max(1, round(g / p))
            if abs(g - k * p) <= GRID_TOL * k:
                on.append(c)
        if len(on) > len(best):
            best = on
    return round(p, 2), len(best) >= max(GRID_MIN, 0.6 * len(centres))


def hairline_grid(film, c):
    """Hairlines at one pitch on every key frame (see the module header). Returns (ok, measured)."""
    if "rule" not in c:
        return None
    rule = hexrgb(c["rule"])
    bad, pitch = [], None
    frames = _keyframes(film)
    for f in frames:
        im = np.asarray(film.rec.frame(f), dtype=np.int16)
        m = np.abs(im - rule[None, None, :]).max(axis=2) < GRID_NEAR
        px_, okx = _pitch(_lines(m.mean(axis=0)))
        py_, oky = _pitch(_lines(m.mean(axis=1)))
        if not (okx and oky):
            bad.append(f)
        elif pitch is None:
            pitch = [px_, py_]
    return bool(frames) and not bad, {"gridPitchPx": pitch, "keyFramesWithoutGrid": bad[:8], "keyFrames": len(frames), "need": f"lines in the rule colour at one pitch, {GRID_MIN} or more each way, on every key frame"}


STATEMENT_SHARE, STATEMENT_FRAMES = 0.85, 0.5


def statement_width(film):
    """Nocturne's statement fitted to the width: on the frames where a text in the film's largest role is at full ink,
    the union of that role's ink across x against the text-safe width (the capture's ctx.safe). It passes when over
    STATEMENT_FRAMES of those frames reach STATEMENT_SHARE."""
    safe = ((film.cap.get("ctx") or {}).get("safe")) or {}
    sw = (safe.get("right") or film.W) - (safe.get("left") or 0)
    roles = [t.get("role") for fr in film.ink for t in fr if t.get("role")]
    order = ["display", "headline", "body"]
    role = next((r for r in order if r in roles), None)
    if role is None:
        return False, {"statementWidth": None, "need": "a statement in a type role"}
    shares = []
    for fr in film.ink:
        ts = [t for t in fr if t.get("role") == role and t["opacity"] >= 0.5]
        if not ts or max(t["opacity"] for t in ts) < 0.95:
            continue
        shares.append((max(t["ink"][2] for t in ts) - min(t["ink"][0] for t in ts)) / sw)
    if not shares:
        return False, {"statementWidth": None, "need": f"a {role} statement at full ink"}
    wide = sum(x >= STATEMENT_SHARE for x in shares) / len(shares)
    return wide > STATEMENT_FRAMES, {"statementWidth": round(float(np.median(shares)), 2), "framesWide": round(wide, 2),
                                     "need": f"over {STATEMENT_FRAMES:.0%} of the frames with the {role} statement span {STATEMENT_SHARE:.0%} of the safe width"}


def _opacity_runs(series, limit):
    """The longest run of frames at partial opacity (over 0.05, under 0.95) in an id -> [opacity per frame] map."""
    worst, who = 0, None
    for k, ops in series.items():
        run = 0
        for o in ops:
            run = run + 1 if o is not None and 0.05 < o < 0.95 else 0
            if run > worst:
                worst, who = run, k
    return worst, who


def partial_opacity(film, what, limit):
    """Frames at partial opacity: per shape (the capture's drawn shapes and the boxes and svg elements), or per element
    of any kind (Raw), the longest run of frames between 5 % and 95 % opacity. Passes when no run is over `limit`."""
    shapes = (film.cap.get("shapes") or {}).get("frames") or []
    series = {}
    for f in range(film.n):
        for sh in shapes[f] if f < len(shapes) else []:
            series.setdefault("s:" + sh["id"], [None] * film.n)[f] = sh.get("opacity", 1)
        for e in film.elements(f):
            if e.get("layer") != "content" or (what == "shapes" and e["kind"] not in ("box", "svg")):
                continue
            series.setdefault("e:" + film.label(e["id"]), [None] * film.n)[f] = e.get("opacity", 1)
    worst, who = _opacity_runs(series, limit)
    return worst <= limit, {"partialFrames": worst, "element": who, "need": f"no {'element' if what == 'all' else 'shape'} at partial opacity for more than {limit} frame{'s' if limit != 1 else ''}"}


FULL_O = 0.99  # full opacity: an eased fade reaches 0.95 well before its end (40 frames reach it at 33)


def text_fade(film, most=None, least=None):
    """How texts reach full opacity: per text node, each entrance from under 5 % to 95 % or more, in frames. Title: every
    entrance in one frame (most 1); Ma: every entrance over 40 frames or more (least 40; 2 frames of slack)."""
    lens, last = [], {}
    for f in range(film.n):
        seen = {}
        for t in film.ink[f]:
            seen[t.get("node") or t["id"]] = max(seen.get(t.get("node") or t["id"], 0), t["opacity"])
        for k, o in seen.items():
            st = last.get(k)
            if st is None and f > 0:  # it was not on screen on the frame before
                st = ("low", f - 1)
            if o <= 0.05:
                last[k] = ("low", f)
            elif o >= FULL_O and st and st[0] == "low":
                lens.append(f - st[1])
                last[k] = ("full", f)
            elif st is None:
                last[k] = ("full" if o >= FULL_O else "low", f)
        for k in list(last):
            if k not in seen:
                last[k] = ("low", f)
    if not lens:
        return True, {"entrances": 0, "need": "no text entrance to read"}
    if most is not None:
        bad = [x for x in lens if x > most]
        return not bad, {"entrances": len(lens), "slowest": max(lens), "need": f"every text at full opacity within {most} frame"}
    bad = [x for x in lens if x < least - 2]
    return not bad, {"entrances": len(lens), "fastest": min(lens), "need": f"every text entrance over {least} frames or more"}


def light_sweeps(film, low):
    """A light sweep across a 3D subject (Matte, Keynote): read from the scene's product shots (scene3d nodes and their
    sweeps, which the renderer draws as a light that rises and falls on a half sine: its start is `at`, its peak is
    at + duration / 2). It passes when one 3D shot on screen for 1 s or more holds a sweep that starts inside it; the
    length the move names ("30-60 frames") is reported, not judged (the block sets it from the shot). At least one: the reels and signature films
    sweep once in the film, not in each shot, so "once per shot" is reported (shotsWithSweep), not judged. A film with
    no 3D shot returns None: the move stays not measured (a photo's sweep is not read from the pixels yet). Declared
    data, not pixels: a sweep in a system that does not allow "light-sweep" is not drawn, and such a system names no
    sweep."""
    import re
    shots = [n for n in film.nodes if n.get("kind") == "scene3d" and isinstance(n.get("spec"), dict)]
    if not shots:
        return None
    m = re.search(r"(\d+)\s*-\s*(\d+)\s*frames", low)
    lo, hi = (int(m.group(1)), int(m.group(2))) if m else (0, 10 ** 6)
    judged, have, sweeps = 0, 0, []
    for n in shots:
        sp = n["spec"]
        a, b = float(sp.get("at") or 0), float(sp.get("until") if sp.get("until") is not None else film.seconds)
        a, b = max(0.0, a), min(film.seconds, b)
        if b - a < 1.0:
            continue
        judged += 1
        ok = [w for w in (sp.get("sweep") or []) if a - 1e-6 <= float(w.get("at", -1)) < b]
        have += 1 if ok else 0
        sweeps += [[round(float(w["at"]), 2), round(float(w["at"]) + float(w.get("duration") or 0) / 2, 2), round(float(w.get("duration") or 0) * film.fps)] for w in ok]
    if not judged:
        return None
    # The length is reported, not judged: the product block sets it from the shot (0.35 of it, at most 2.4 s), so a
    # long shot draws a sweep longer than the move's frames by itself.
    return have > 0, {"shots": judged, "shotsWithSweep": have, "sweepStartPeakFrames": sweeps[:8], "movesFrames": [lo, hi],
                      "need": "a sweep that starts inside a 3D shot of 1 s or more (read from the scene's product shots)"}


def typing_steps(film):
    """Typing grows one character at a time: per text node whose letters grow, the largest growth from one frame to the
    next (letters drawn, from the capture)."""
    # A typed line is one node a letter ("line-0-3": line 0, letter 3) or one node whose letters grow: count the letters
    # of each line (the node id without its last part) on each frame.
    prev, worst, typed = {}, 0, 0
    for f in range(film.n):
        now = {}
        for t in film.ink[f]:
            if t["opacity"] < 0.5:
                continue
            node = t.get("node") or t["id"]
            k = node.rsplit("-", 1)[0] if len(t["text"].strip()) == 1 else node
            now[k] = now.get(k, 0) + len(t.get("letters") or [])
        for k, n in now.items():
            if k in prev and n > prev[k]:
                typed += 1
                worst = max(worst, n - prev[k])
        prev = now
    if typed < 3:
        return False, {"typedSteps": typed, "need": "a text that types"}
    return worst <= 1, {"typedSteps": typed, "mostLettersAFrame": worst, "need": "one character a frame at most"}


def _keyframes(film):
    return [f for f in range(0, film.n, 15) if film.rec.has_png(f)]


def accent_regions(film, c):
    """The accent's connected regions per key frame (the accent mask of this check, off the pictures, parts of MIN_PART
    or more): one at most on every key frame."""
    worst, at = 0, None
    for f in _keyframes(film):
        im = np.asarray(film.rec.frame(f).resize((film.W // 2, film.H // 2)), dtype=np.int16)
        m = accent_mask(im, c, np.zeros(im.shape[:2], bool), tints=False)
        lab, n = ndi.label(ndi.binary_dilation(m, np.ones((3, 3), bool), iterations=JOIN))
        k = int((ndi.sum(m, lab, range(1, n + 1)) / m.size >= MIN_PART).sum()) if n else 0
        if k > worst:
            worst, at = k, f
    return worst <= 1, {"accentRegions": worst, "atFrame": at, "need": "one accent region per key frame at most"}


def _rgb(s):
    import re
    m = re.findall(r"[\d.]+", s or "")
    return np.array([float(v) for v in m[:3]]) if len(m) >= 3 else None


def accent_words(film, c):
    """The words set in the accent (or its text tone) per key frame, from the capture's text colours: one at most."""
    tones = [hexrgb(c[k]) for k in ("accent", "accentText") if k in c]
    worst, at = 0, None
    for f in range(0, film.n, 15):
        words = sum(len(t["text"].split()) for t in film.ink[f] if t["opacity"] >= 0.5 and (col := _rgb(t.get("color"))) is not None and any(np.abs(col - tc).max() < 24 for tc in tones))
        if words > worst:
            worst, at = words, f
    return worst <= 1, {"accentWords": worst, "atFrame": at, "need": "one accent word per key frame at most"}


def overprint(film, c):
    """Inks multiply where they overlap (Riso): on the key frames where the two inks (the accent and the second accent)
    meet (their areas, grown by a few px, touch), the multiply colour of the two must show (0.1 % of the frame within 40
    levels). A film whose inks never meet has nothing to judge: the move is a rule for overlaps, not an order to overlap."""
    if "accent2" not in c:
        return None
    a1, a2 = hexrgb(c["accent"]), hexrgb(c["accent2"])
    mult = a1 * a2 / 255.0
    best, met = 0.0, 0
    for f in _keyframes(film):
        im = np.asarray(film.rec.frame(f).resize((film.W // 2, film.H // 2)), dtype=np.int16)
        near = lambda col: np.abs(im - col[None, None, :]).max(axis=2) < 40  # noqa: E731
        share = float(near(mult).mean())
        best = max(best, share)
        grow = np.ones((5, 5), bool)
        if share < 0.001 and (ndi.binary_dilation(near(a1), grow) & ndi.binary_dilation(near(a2), grow)).mean() > 0.0005:
            met += 1
    if best >= 0.001 or not met:
        return True, {"overprintShare": round(best, 4), "inksMeetWithoutOverprint": met, "need": "where the two inks meet, their multiply colour"}
    return False, {"overprintShare": round(best, 4), "inksMeetWithoutOverprint": met, "need": "where the two inks meet, their multiply colour"}


def stepped_motion(film):
    """Motion on twos or threes: of the frames on which a moving element (its box, from the capture) changes, the share
    that follow a frame that changed too. Under 10 % passes (a held frame between steps)."""
    prev, changes, runs = {}, [], 0
    moved = [False] * film.n
    for f in range(film.n):
        for e in film.elements(f):
            if e.get("layer") != "content":
                continue
            k, b = e["id"], (round(e["x"]), round(e["y"]), round(e["w"]), round(e["h"]))
            if k in prev and prev[k] != b:
                moved[f] = True
            prev[k] = b
    changes = [f for f in range(1, film.n) if moved[f]]
    if not changes:  # nothing slides: what changes stamps in one frame, which is the move
        return True, {"moves": 0, "need": "motion that holds every other frame"}
    runs = sum(1 for f in changes if moved[f - 1])
    share = runs / len(changes)
    return share < 0.1, {"moves": len(changes), "onConsecutiveFrames": round(share, 2), "need": "motion that holds every other frame"}


def moves(film, c, d, listed=False):
    """The direction's measurable signature moves: each measured (measure_move) is a note, and a finding when it does
    not show; the others are listed as not measured. `listed`: the caller has listed them already."""
    out = []
    if not listed:
        for mv in (d.get("moves") or []):
            if isinstance(mv.get("measurable"), dict) and mv["measurable"].get("check") == "signature":
                film.notes.append({"check": "signature", "notMeasured": mv["move"], "how": mv["measurable"].get("how")})
    for mv in (d.get("moves") or []):
        how = ((mv.get("measurable") or {}) if isinstance(mv.get("measurable"), dict) else {}).get("how") or ""
        got = measure_move(film, c, how)
        if got is None:
            continue
        film.notes[:] = [n for n in film.notes if n.get("notMeasured") != mv["move"]]
        ok, measured = got
        film.notes.append({"check": "signature", "measured": mv["move"], **measured})
        if not ok:
            out.append(finding("signature", "warning", 0, film.seconds, {"move": mv["move"][:80], **measured}, {"how": how},
                               f"The system's signature move is this: {how} No frame of the film shows it. Show the move with the block that the system's block map gives it."))
    return out


def check(film):
    if not film.tokens:
        raise Skip("the film declares no system")
    c = film.tokens.get("colors", {})
    if "accent" not in c:
        raise Skip("the system has no accent")
    acc = hexrgb(c["accent"])
    for other in ("ground", "ink"):
        if other in c and np.abs(hexrgb(c[other]) - acc).max() < 40:
            # The accent cannot be told from the ground or the ink, so only the direction's moves are measured.
            film.notes.append({"check": "signature", "notMeasured": "the accent", "why": f"the accent is close to the {other}"})
            return moves(film, c, film.tokens.get("direction") or {})
    # The count of accent elements runs only for a system that states its limit (System.accentElements): in another
    # system the accent may be a print ink or a material (Riso's pink, Matte's metal), and parts of the frame in it
    # are not separate accents.
    cap = (film.tokens.get("accentElements") or {}).get("max")
    if not cap:
        film.notes.append({"check": "signature", "notMeasured": "accent elements", "why": "the system states no accentElements"})
    best, counts = 0.0, []
    grow = np.ones((3, 3), bool)
    stroke = float(film.tokens.get("stroke") or 0)
    hairline, longest = 0 < stroke <= HAIRLINE_STROKE, 0.0
    for f in range(0, film.n, 15):
        if not film.rec.has_png(f):
            continue
        im = np.asarray(film.rec.frame(f).resize((film.W // 2, film.H // 2)), dtype=np.int16)
        pics = np.zeros(im.shape[:2], bool)
        for e in film.elements(f):
            if e["kind"] == "image" and e["opacity"] >= 0.3:
                x0, y0 = max(0, int(e["x"] // 2)), max(0, int(e["y"] // 2))
                pics[y0:max(y0, int((e["y"] + e["h"]) // 2)), x0:max(x0, int((e["x"] + e["w"]) // 2))] = True
        # The tints are read when they can change the answer: while the accent has not shown yet, or to count elements.
        m = accent_mask(im, c, pics, tints=bool(cap) or best < MIN_SHARE)
        best = max(best, float(m.mean()))
        if hairline and best < MIN_SHARE:
            full = np.asarray(film.rec.frame(f), dtype=np.int16)
            lm = accent_mask(full, c, None, tints=False)
            length = float(lm.sum()) / max(1.0, stroke * film.W / 1080.0)
            longest = max(longest, length / film.W)
            if longest >= HAIRLINE_LEN:
                best = MIN_SHARE
        if not cap:
            continue
        m &= ~pics  # a picture's own tones are not an accent element
        # Thin accent lines at full size (any px of each 2 x 2 block) join the parts they run between.
        fl = accent_lines(np.asarray(film.rec.frame(f), dtype=np.int16), c)
        h2, w2 = m.shape
        joins = (m | fl[:2 * h2, :2 * w2].reshape(h2, 2, w2, 2).any(axis=(1, 3))) & ~pics
        lab, n = ndi.label(ndi.binary_dilation(joins, grow, iterations=JOIN))
        if n:
            sizes = ndi.sum(m, lab, range(1, n + 1)) / m.size
            counts.append((f, int((sizes >= MIN_PART).sum())))
        else:
            counts.append((f, 0))
    # The direction's measurable moves are listed in the notes; this check measures the accent.
    for mv in ((film.tokens.get("direction") or {}).get("moves") or []):
        if isinstance(mv.get("measurable"), dict) and mv["measurable"].get("check") == "signature":
            film.notes.append({"check": "signature", "notMeasured": mv["move"], "how": mv["measurable"].get("how")})
    out = []
    # What the accent is FOR (direction.accentFor; until a system states it, the tokens' own words "kept for a link or a
    # selected state"): an accent kept for links and selected states need not show in a film that has neither.
    d = film.tokens.get("direction") or {}
    roles = d.get("accentFor")  # e.g. ["links", "selected states"]
    if roles and best < MIN_SHARE:
        stems = {r.split()[0].lower().rstrip("s") for r in roles}  # "links" -> link, "selected states" -> selected
        has = any(str(v).lower().rstrip("s") in stems for n in film.nodes for v in ((n.get("data") or {}).get("state"), n.get("state"), (n.get("data") or {}).get("role")) if v)
        if not has:
            film.notes.append({"check": "signature", "notJudged": "the accent never shows", "why": f"the system keeps its accent for {' and '.join(roles)} (direction.accentFor), and the film shows none"})
            best = MIN_SHARE  # not a finding
    out += moves(film, c, d, listed=True)
    if best < MIN_SHARE:
        out.append(finding("signature", "error", 0, film.seconds, {"accentShareMax": round(best, 5), "accent": c["accent"], **({"accentLineShareOfWidth": round(longest, 3)} if hairline else {})},
                           {"min": MIN_SHARE, **({"lineShareOfWidth": HAIRLINE_LEN} if hairline else {})},
                           "Put the system's accent on screen where the film makes its point (the result, the key word, the one shape)."))
    # More accent elements than the system allows, on two key frames in a row or more (1 s).
    run = []
    for f, k in counts + [(None, 0)]:
        if cap and k > cap:
            run.append((f, k))
            continue
        if len(run) >= 2:
            out.append(finding("signature", "warning", film.t(run[0][0]), film.t(run[-1][0]), {"accentElements": max(k for _, k in run), "frames": [f for f, _ in run][:8]},
                               {"max": cap, "from": "accentElements.max"},
                               "Keep the accent on one point at a time: set the other accent parts in ink or a muted tone, or show them on another beat."))
        run = []
    return out
