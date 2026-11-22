"""accident: a single frame that differs from both neighbours and is near-empty or near-flat, or an element on
screen for only 1-2 frames.

Frame: the frame differs from both neighbours by a mean of more than JUMP grey levels, the neighbours are
close to each other (under a third of that), and the frame is near-flat (grey std under FLAT) or near-empty
(under 0.5 % of it off the ground colour).
Flat run: more than 3 frames in a row of one flat colour (grey std under FLAT), away from the first and last second.
Element: a content element (text, or a shape or picture of at least 0.3 % of the frame) visible (opacity 0.5)
for 1 or 2 frames in all, not at the first or last frame, where the pixels in its box changed.
Subject gap: one or two frames where the regions that hold the subject on both sides keep under 30 % of it (by
region: a small subject on a dark ground vanishing at a cut, subject_gaps).
Empty frame: one or two frames that keep under 60 % of the content (off the ground and not near black) of both frames
round them, also inside a camera move or a whip (empty_frames).
flash-frame: one or two frames of a wrong colour or a full-frame pop, also at a cut: the frames' mean colour (small
RGB copy) differs from the frame before and the frame after by over POP levels, they are not a blend of the two
(a dissolve), and the frames before and after differ from each other by less than the pop (a cut A to B passes; A, X, B
with X far from both is a pop). Not a finding in a system whose pictures may flash (media.pictures.placements holds
"flash") or whose direction names flash cuts, when a picture is on screen in those frames. In such a system a
flat (black) run between two picture flashes is not a finding either; a black hold after the last flash still is. A frame the one-frame rule above already reports is not repeated.
"""
import numpy as np

from film import finding

JUMP = 8.0
FLAT = 6.0
FLAT_RUN = 3
POP = 30.0


def flash_allowed(film):
    """The system flashes on purpose: its pictures may flash (media.pictures.placements holds "flash"), or its
    direction names flash cuts (Title: stills for a few frames, black between)."""
    t = film.tokens or {}
    if "flash" in (t.get("media", {}).get("pictures", {}).get("placements") or []):
        return True
    return any("flash cut" in str(m.get("move", "")).lower() for m in ((t.get("direction") or {}).get("moves") or []) if isinstance(m, dict))


KEEP = 0.6        # an empty frame keeps under 60 % of the content of both frames round it
CONTENT_MIN = 0.05  # ... which show at least 5 % of the frame as content


def content_share(film):
    """Per frame: the share of the frame that is content: off the ground colour and not near black (the small RGB copy).
    A layer that drops out draws black or the ground, so its content goes."""
    rgb = film.rgb
    off = (np.abs(rgb - film.ground[None, None, None, :]).max(axis=3) > 28) & (rgb.max(axis=3) >= 20)
    return off.reshape(film.n, -1).mean(axis=1)


def empty_frames(film, reported=()):
    """One or two frames that lose most of their content while the frames on both sides keep it, also inside a camera
    move or a whip (the one-frame rule above asks the neighbours to match, and a move makes them differ). A renderer
    that drops a layer, or a filter region that ends, draws such frames black or empty. A system that flashes on
    purpose may hold black between two picture flashes."""
    c = content_share(film)
    allows = flash_allowed(film)
    out, f = [], 1
    while f < film.n - 1:
        hit = None
        for k in (1, 2):
            a, b = f - 1, f + k
            if b >= film.n:
                continue
            xs = list(range(f, f + k))
            side = min(c[a], c[b])
            top = max(c[x] for x in xs)
            # A hand-over is not a dropout: when the texts before and after differ (one phrase leaves, the next builds its
            # lines over two frames: kineticWords' line stagger), the thin frames are the next text arriving.
            texts = lambda g: {t.get("node") or film.label(t["id"]) for t in film.ink[g] if t["opacity"] >= 0.5}  # noqa: E731
            if side >= CONTENT_MIN and top < KEEP * side and side - top >= 0.04 and not any(x in reported for x in xs) \
                    and (texts(a) == texts(b) or not (texts(a) or texts(b))):
                hit = (xs, top, side)
                break
        if hit:
            xs, top, side = hit
            pic = lambda g: any(x["kind"] == "image" and x["opacity"] >= 0.5 for x in film.elements(g))  # noqa: E731
            # A system that flashes on purpose may cut a flash to black and the black to the next beat.
            if not (allows and (pic(xs[0] - 1) or pic(xs[-1] + 1))):
                moving = any(film.view_moving[x] for x in xs)
                out.append(finding("accident", "error", film.t(xs[0]), film.t(xs[-1]),
                                   {"frame": xs[0], "frames": len(xs), "content": round(float(top), 3), "neighboursContent": round(float(side), 3), "inViewMove": moving},
                                   {"keepAtLeast": KEEP},
                                   "These frames lose most of the picture while the frames round them are full: "
                                   + ("a layer or a filter drops out during the camera move; check the frames by eye and fix the renderer or the move." if moving
                                      else "remove the empty frames, or end the outgoing shot on the frame the next one starts.")))
            f = xs[-1] + 2
            continue
        f += 1
    return out


GRID = (8, 4)        # rows, columns of the regions a subject gap is read in
CELL_FULL = 0.05     # a region holds the subject: 5 % of it off the ground
CELL_DROP = 0.3      # ... and on the gap frame it keeps under 30 % of what both neighbours hold


def cell_share(film):
    """Per frame and region (GRID): the share of the region off the ground colour (the small RGB copy), without text:
    a word that leaves in a word-by-word build is not a subject that vanishes."""
    off = (np.abs(film.rgb - film.ground[None, None, None, :]).max(axis=3) > 28)
    n, h, w = off.shape
    k = w / film.W
    for f in range(n):
        for t in film.ink[f]:
            x0, y0, x1, y1 = t["ink"]
            off[f, max(0, int(y0 * k) - 1):int(y1 * k) + 2, max(0, int(x0 * k) - 1):int(x1 * k) + 2] = False
    r, c = GRID
    hh, ww = h // r, w // c
    return off[:, :hh * r, :ww * c].reshape(n, r, hh, c, ww).mean(axis=(2, 4))


def subject_gaps(film, reported=()):
    """A subject that vanishes for one or two frames (a 3D canvas that is blank for a frame at a cut): regions that
    hold the subject on the frames on both sides keep under CELL_DROP of it on the gap frame(s). Read by region, so a
    small subject on a dark ground counts though most of the frame does not change."""
    cs = cell_share(film)
    out, f = [], 1
    while f < film.n - 1:
        hit = None
        for k in (1, 2):
            a, b = f - 1, f + k
            # In a pan the subject moves from region to region: there the whole-frame rule (empty_frames) reads it.
            if b >= film.n or any(x in reported for x in range(f, f + k)) or any(film.near_view_move(x, 1) for x in range(f, f + k)):
                continue
            side = np.minimum(cs[a], cs[b])
            full = side >= CELL_FULL
            if full.sum() < 2:
                continue
            gap = np.max([cs[x] for x in range(f, f + k)], axis=0)
            lost = full & (gap < CELL_DROP * side)
            if lost.sum() >= max(2, 0.5 * full.sum()):
                hit = (list(range(f, f + k)), int(lost.sum()), int(full.sum()))
                break
        if hit and flash_allowed(film) and any(x["kind"] == "image" and x["opacity"] >= 0.5 for g in (hit[0][0] - 1, hit[0][-1] + 1) for x in film.elements(g)):
            f = hit[0][-1] + 2  # a system that flashes on purpose cuts a flash to black
            continue
        if hit:
            xs, lost, full = hit
            out.append(finding("accident", "error", film.t(xs[0]), film.t(xs[-1]), {"frame": xs[0], "frames": len(xs), "subjectGap": True, "regionsLost": lost, "regionsWithSubject": full},
                               {"keepAtLeast": CELL_DROP},
                               "The subject vanishes for these frames while it shows on both sides (often one frame at a cut): start the next shot on the frame the last one ends, and check the frames round the cut by eye."))
            f = xs[-1] + 2
            continue
        f += 1
    return out


def check(film):
    g = film.grey.astype(np.float32)
    out = []
    for f in range(1, film.n - 1):
        dp = float(np.abs(g[f] - g[f - 1]).mean())
        dn = float(np.abs(g[f] - g[f + 1]).mean())
        if min(dp, dn) < JUMP:
            continue
        ds = float(np.abs(g[f + 1] - g[f - 1]).mean())
        if ds > min(dp, dn) / 3:
            continue
        flat = float(g[f].std())
        empty = float((np.abs(film.rgb[f] - film.ground).max(axis=2) > 28).mean())
        if flat < FLAT or empty < 0.005:
            out.append(finding("accident", "error", film.t(f), film.t(f), {"frame": f, "std": round(flat, 2), "occupied": round(empty, 4), "jump": round(min(dp, dn), 1)},
                               {"std": FLAT, "occupied": 0.005}, "Remove this one-frame flash: end the outgoing shot on the frame the next one starts, with no empty or flat frame between."))
    # A run of more than FLAT_RUN flat frames inside the film (one colour: an empty flash or a dropped shot).
    # The first and last second do not count: a film may open from or end on its plain ground on purpose.
    # Flat: one colour, with nothing on it (under 0.05 % of the frame off its median grey by 20 levels, so a
    # small word on a dark ground is not flat).
    flat = [float(g[f].std()) < FLAT and float((np.abs(g[f] - np.median(g[f])) > 20).mean()) < 0.0005 for f in range(film.n)]
    edge = film.fps
    for a, b in film.runs(flat):
        pic = lambda f: any(e["kind"] == "image" and e["opacity"] >= 0.5 for e in film.elements(f))  # noqa: E731
        montage = flash_allowed(film) and pic(a - 1) and pic(b + 1)  # black between two flashes of a declared flash cut
        # A declared hold (the hold block: Title's black holds are its rhythm) is designed stillness, not a dropped shot.
        held = all(film.in_hold(f) for f in range(a, b + 1))
        if b - a + 1 > FLAT_RUN and a > edge and b < film.n - 1 - edge and not montage and not held:
            out.append(finding("accident", "error", film.t(a), film.t(b), {"flatFrames": b - a + 1}, {"max": FLAT_RUN},
                               "Remove this stretch of one flat colour, or put the next shot or the ground's texture in it."))
    out += empty_frames(film, {round(x["measured"]["frame"]) for x in out if isinstance(x["measured"], dict) and "frame" in x["measured"]})
    out += subject_gaps(film, {round(x["measured"]["frame"]) for x in out if isinstance(x["measured"], dict) and "frame" in x["measured"]})
    # flash-frame: a one- or two-frame pop of colour, also at a cut. A warning: editors cut a flash frame on purpose,
    # and no case has been confirmed on the reels, agents' films or the block examples.
    reported = {round(x["measured"]["frame"]) for x in out if isinstance(x["measured"], dict) and "frame" in x["measured"]}
    rgb = film.rgb.astype(np.float32)
    mean = rgb.reshape(film.n, -1, 3)
    d = lambda a, b: float(np.abs(mean[a] - mean[b]).mean())  # noqa: E731
    allows = flash_allowed(film)
    f = 1
    while f < film.n - 2:
        hit = None
        for k in (1, 2):
            a, b = f - 1, f + k
            if b >= film.n:
                continue
            xs = list(range(f, f + k))
            if any(x in reported for x in xs):
                continue
            ab = d(a, b)
            if all(d(a, x) > POP and d(x, b) > POP and d(a, x) > ab and d(x, b) > ab for x in xs):
                blend = all(float(np.abs(mean[x] - (mean[a] + mean[b]) / 2).mean()) < POP / 2 for x in xs)
                if k == 2 and d(f, f + 1) > POP:
                    continue
                if not blend:
                    hit = (xs, ab)
                    break
        if hit:
            xs, ab = hit
            pic = any(e["kind"] == "image" and e["opacity"] >= 0.5 for x in xs for e in film.elements(x))
            if not (allows and pic):
                around = {film.label(e["id"]) for e in film.elements(xs[0] - 1) + film.elements(xs[-1] + 1) if e["opacity"] >= 0.5}
                only = sorted({film.label(e["id"]) for x in xs for e in film.elements(x) if e["opacity"] >= 0.5} - around)
                out.append(finding("flash-frame", "warning", film.t(xs[0]), film.t(xs[-1]),
                                   {"frames": len(xs), "popLevels": round(min(min(d(xs[0] - 1, x), d(x, xs[-1] + 1)) for x in xs), 1), "beforeToAfter": round(ab, 1)},
                                   {"maxPopLevels": POP, "minFrames": 3},
                                   "Remove the stray frame(s) at this cut: end the outgoing shot on the frame the next one starts, with no frame of another colour between.",
                                   node=", ".join(only[:3]) or "(the whole frame)"))
            f = xs[-1] + 2
            continue
        f += 1
    # Elements on screen for 1-2 frames.
    area = film.W * film.H
    seen = {}
    for f in range(film.n):
        for e in film.content(f, 0.5):
            if e["kind"] != "text" and e["w"] * e["h"] < 0.003 * area:
                continue
            # Keyed by the data-el label, not the DOM path: a node that re-mounts (a new path) is still one element.
            seen.setdefault(film.label(e["id"]), set()).add(f)
    for eid, frames in seen.items():
        frames = sorted(frames)
        if len(frames) > 2 or frames[0] == 0 or frames[-1] == film.n - 1:
            continue
        f = frames[0]
        if film.change[f] < 0.0005 and film.change[min(film.n - 1, frames[-1] + 1)] < 0.0005:
            continue
        out.append(finding("accident", "error", film.t(frames[0]), film.t(frames[-1]), {"frames": len(frames)}, {"minFrames": 3},
                           "Hold this element at least a few frames or remove it: on screen for 1-2 frames it reads as a glitch.", node=film.label(eid)))
    return out
