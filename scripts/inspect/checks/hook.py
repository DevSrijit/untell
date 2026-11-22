"""hook: by 1.0 s something has moved, and the subject the system's direction names is on screen by its time.

The direction (tokens "direction.hook") says what the opening shows: "picture" (a picture, a shape or box of at
least `area` of the frame), "line" (text in `role` or a larger role) or "both", and `by` when (seconds, with one
frame of grace). SVG shapes count by their painted box from the capture. Without a direction: a picture, a shape of at least 1.5 % of the frame, or display type by 1.0 s.
The parts of one group (one block's designed unit, such as a mark drawn path by path) are one picture by what they paint.
When the direction asks for a picture, text alone on the ground (no picture at all, of any size) may last at most limits.textAlone.
An empty container is not content: a pane (an outlined box, or a box within 40 levels of the ground's tone; a solid
slab of colour is a shape) of PANE_AREA of the frame or more with no text, shape or picture inside it,
on frame 0 or for EMPTY_S in the hook's time (by), is a finding (the empty code pane of a code film).
In a system whose window must stay full (direction.compose.fullPanes: Graphite), a pane whose content leaves PANE_PART of its height empty in one run (rows under the last row) is a finding
too: an agent's Graphite film's opening panel held two rows and half a pane of nothing.
Measured: the first frame with a visible change against 0.2 s before (so a slow fade counts), and the first
frame each kind of subject is visible (opacity 0.5). A visible change is one on MOVE_SHARE of the frame; when the
opening has none, the message gives the most it has and how much faster a slow drift or push must be.
"""
import re

import film as film_mod
from film import finding

PANE_AREA = 0.10   # a panel of 10 % of the frame or more is a container the hook must fill
EMPTY_S = 0.3      # an empty container on frame 0, or for this long in the hook's time, is a finding
PANE_PART = 0.4    # a full-pane system: a run of this share of the pane's height with nothing in it

MOVE_SHARE = 0.001  # a change on 0.1 % of the frame is a visible move
ORDER = ["caption", "label", "body", "headline", "display"]


SEGMENT = re.compile(r"^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*L\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*$")


def closed_lines(film, ids, tol=8.0):
    """The box (x0, y0, x1, y1) of the largest group of straight lines among `ids` that meet end to end and close:
    every end meets another line's end within `tol` px (a triangle of three rules, a box of four). None when no group
    closes."""
    segs = []
    for i in ids:
        n = film.node(i)
        m = SEGMENT.match((n or {}).get("d") or "") if n and n.get("kind") == "path" else None
        if m:
            x1, y1, x2, y2 = map(float, m.groups())
            segs.append(((x1, y1), (x2, y2)))
    if len(segs) < 3:
        return None
    near = lambda p, q: abs(p[0] - q[0]) <= tol and abs(p[1] - q[1]) <= tol  # noqa: E731
    # Groups of lines joined at their ends.
    parent = list(range(len(segs)))
    def root(k):
        while parent[k] != k:
            k = parent[k]
        return k
    for a in range(len(segs)):
        for b in range(a + 1, len(segs)):
            if any(near(p, q) for p in segs[a] for q in segs[b]):
                parent[root(a)] = root(b)
    best = None
    for r in {root(k) for k in range(len(segs))}:
        group = [segs[k] for k in range(len(segs)) if root(k) == r]
        ends = [p for s in group for p in s]
        if len(group) < 3 or any(sum(near(p, q) for q in ends) < 2 for p in ends):
            continue  # an open chain: some end meets no other end
        xs, ys = [p[0] for p in ends], [p[1] for p in ends]
        box = (min(xs), min(ys), max(xs), max(ys))
        if best is None or (box[2] - box[0]) * (box[3] - box[1]) > (best[2] - best[0]) * (best[3] - best[1]):
            best = box
    return best


def picture_at(film, f, area_min):
    area = film.W * film.H
    # Shapes in the scene's SVG layer (one full-frame element in the recording): their painted boxes from the capture.
    for s in ((film.cap.get("shapes") or {}).get("frames") or [[]] * film.n)[f]:
        x0, y0, x1, y1 = s["box"]
        if s.get("layer") not in ("ground", "texture") and "grid" not in s["id"] and (x1 - x0) * (y1 - y0) >= area_min * area and s.get("opacity", 1) >= 0.5:
            return s["id"]
    for e in film.content(f, 0.5):
        if e["kind"] in ("image", "svg", "box") and e["w"] * e["h"] >= area_min * area:
            return e["id"]
    for e in film.elements(f):
        if e["kind"] == "image" and e["opacity"] >= 0.5 and e["w"] * e["h"] >= area_min * area:
            return e["id"]
    # The parts of one group (one designed unit: a mark drawn path by path, as drawnMark names it) are one picture when
    # what they paint covers the hook's area: a mark of four paths on 30 % of the frame is the subject at 30 %, though
    # no path alone reaches 15 %. Each part counts by what it paints: a filled part by its box, a line by the box of the
    # part of it that shows (a stroke that draws on has its full box in the capture while only a stub of it shows).
    # The cells are painted as drawing_cover paints them, so parts scattered over the frame do not count their outer box.
    frame_shapes = ((film.cap.get("shapes") or {}).get("frames") or [[]] * film.n)[f]
    geoms = (film.cap.get("shapes") or {}).get("geoms") or []
    groups = {}
    for s in frame_shapes:
        if s.get("layer") in ("ground", "texture") or "grid" in s["id"] or s.get("opacity", 1) < 0.5:
            continue
        g = (film.node(s["id"]) or {}).get("group")
        if not g:
            continue
        if s.get("fill"):
            groups.setdefault(g, []).append(tuple(s["box"]))
        elif s.get("g") is not None and s["g"] < len(geoms) and geoms[s["g"]]:
            pts, half = geoms[s["g"]], (s.get("width") or 0) / 2
            groups[g] = groups.get(g, []) + [(min(p[0] for p in pts) - half, min(p[1] for p in pts) - half,
                                              max(p[0] for p in pts) + half, max(p[1] for p in pts) + half)]
    for g, bs in groups.items():
        if len(bs) >= 2 and drawing_cover(film, bs) >= area_min:
            return g
    # A drawing made of many hairlines (a schematic) or a UI window made of panes and rows is one picture: the box
    # round its shapes and panels (not the ground, its texture or a sheet's grid) covers the hook's area.
    boxes = [s["box"] for s in ((film.cap.get("shapes") or {}).get("frames") or [[]] * film.n)[f]
             if s.get("layer") not in ("ground", "texture") and "grid" not in s["id"] and s.get("opacity", 1) >= 0.5]
    boxes += [(e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]) for e in film.content(f, 0.5)
              if e["kind"] in ("box", "svg") and e["w"] * e["h"] < 0.9 * area and e["layer"] == "content"]
    # Lines that meet end to end and close (a triangle of three rules) enclose a shape: the box round their ends
    # counts as a shape in any system.
    shown = [sh["id"] for sh in ((film.cap.get("shapes") or {}).get("frames") or [[]] * film.n)[f] if sh.get("opacity", 1) >= 0.5]
    loop = closed_lines(film, shown)
    if loop and (loop[2] - loop[0]) * (loop[3] - loop[1]) >= area_min * area:
        return "drawing"
    how = (((film.tokens or {}).get("direction") or {}).get("hook") or {}).get("how") or ""
    drawn = any(w in how for w in ("UI", "diagram", "drawing", "hairline"))  # direction.hook names a drawing or a UI
    if drawn and len(boxes) >= 2 and drawing_cover(film, boxes) >= area_min:
        return "drawing"
    return None


THIN = 0.012  # a part thinner than this share of the frame's width is a line: it covers one cell of the grid, not its box


def drawing_cover(film, boxes):
    """The share of the frame a drawing's parts cover, painted on a grid of 1/10 of the frame: each part fills its box,
    and a thin part (a rod, a hairline, a support bar) fills one cell across its length. One wide line adds a thin
    strip, not the outer box of the whole drawing (a support bar across the frame once passed a 19 % drawing)."""
    import numpy as np
    gw, gh = max(1, film.W // 10), max(1, film.H // 10)
    m = np.zeros((gh, gw), dtype=bool)
    k = gw / film.W
    for x0, y0, x1, y1 in boxes:
        a, b = max(0, int(x0 * k)), min(gw, int(np.ceil(x1 * k)))
        c, d = max(0, int(y0 * k)), min(gh, int(np.ceil(y1 * k)))
        if b <= a or d <= c:
            continue
        if (x1 - x0) < THIN * film.W:
            m[c:d, (a + b) // 2] = True
        elif (y1 - y0) < THIN * film.W:
            m[(c + d) // 2, a:b] = True
        else:
            m[c:d, a:b] = True
    return float(m.mean())


def line_at(film, f, role_min):
    need = ORDER.index(role_min) if role_min in ORDER else ORDER.index("display")
    for t in film.ink[f]:
        if t["opacity"] < 0.5:
            continue
        role = t.get("role") or film.role_of(t["fontPx"])
        big = t["cap"] >= 0.04 * film.H  # letters this large act as display type in any role
        if big or (role in ORDER and ORDER.index(role) >= need):
            return t["id"]
    return None


def pane_like(film, e):
    """A box that reads as a container: an outline (stroke), or a fill within 40 levels of the ground colour."""
    import re
    if e.get("stroke"):
        return True
    m = re.findall(r"[\d.]+", e.get("fill") or "")
    if len(m) < 3:
        return False
    return max(abs(float(m[i]) - float(film.ground[i])) for i in range(3)) <= 40


def full_panes(film):
    d = (film.tokens or {}).get("direction") or {}
    c = d.get("compose") or {}
    return bool(c.get("fullPanes"))


def empty_part(film, f, e):
    """The longest run of the pane's height (a share) that no text, shape or element inside it covers."""
    y0, y1 = e["y"], e["y"] + e["h"]
    x0, x1 = e["x"], e["x"] + e["w"]
    covered = []
    inside = lambda b: b[0] >= x0 - 2 and b[1] >= y0 - 2 and b[2] <= x1 + 2 and b[3] <= y1 + 2  # noqa: E731
    covered += [t["ink"] for t in film.ink[f] if t["opacity"] >= 0.5 and inside(t["ink"])]
    covered += [(o["x"], o["y"], o["x"] + o["w"], o["y"] + o["h"]) for o in film.content(f, 0.5) if o is not e and o["kind"] in ("image", "box", "svg")
                and o["w"] * o["h"] < 0.9 * e["w"] * e["h"] and inside((o["x"], o["y"], o["x"] + o["w"], o["y"] + o["h"]))]
    # A list's row rules count: hairlines across most of the pane (a list that runs on under the fold is a list, not
    # an empty panel). Other shapes (a cursor passing through) do not fill a pane.
    covered += [tuple(s["box"]) for s in ((film.cap.get("shapes") or {}).get("frames") or [[]] * film.n)[f]
                if s.get("opacity", 1) >= 0.5 and "grid" not in s["id"] and inside(tuple(s["box"]))
                and s["box"][3] - s["box"][1] <= 4 and s["box"][2] - s["box"][0] >= 0.5 * e["w"]]
    rows = [False] * max(1, int(e["h"]))
    for b in covered:
        for y in range(max(0, int(b[1] - y0)), min(len(rows), int(b[3] - y0) + 1)):
            rows[y] = True
    best = run = 0
    for v in rows + [True]:
        run = 0 if v else run + 1
        best = max(best, run)
    return best / max(1, len(rows))


def empty_containers(film, until_f):
    """Panels (boxes of PANE_AREA of the frame or more, opacity 0.5) that hold nothing in frames 0 to until_f: no text,
    no shape and no picture inside their box; in a full-pane system also a pane with PANE_PART of its height empty.
    Returns {label: (frames, area share, empty part or None)}."""
    full = full_panes(film)
    area = film.W * film.H
    shapes = (film.cap.get("shapes") or {}).get("frames") or []
    out = {}
    for f in range(0, min(film.n, until_f + 1)):
        # A container is a pane in (or near) the ground's tone, or an outlined one: a solid slab of colour is a shape.
        boxes = [e for e in film.content(f, 0.5) if e["kind"] == "box" and e["w"] * e["h"] >= PANE_AREA * area and pane_like(film, e)]
        for e in boxes:
            x0, y0, x1, y1 = e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]
            inside = lambda b: b[0] >= x0 - 2 and b[1] >= y0 - 2 and b[2] <= x1 + 2 and b[3] <= y1 + 2  # noqa: E731
            held = any(t["opacity"] >= 0.5 and inside(t["ink"]) for t in film.ink[f])
            held = held or any(s.get("opacity", 1) >= 0.5 and s.get("layer") not in ("ground", "texture") and inside(s["box"])
                               and (s["box"][2] - s["box"][0]) * (s["box"][3] - s["box"][1]) < 0.9 * e["w"] * e["h"]
                               and (s["box"][2] - s["box"][0]) * (s["box"][3] - s["box"][1]) >= 0.002 * area
                               for s in (shapes[f] if f < len(shapes) else []))
            held = held or any(o is not e and o["kind"] in ("image", "box", "svg") and o["w"] * o["h"] < 0.9 * e["w"] * e["h"]
                               and o["w"] * o["h"] >= 0.002 * area and inside((o["x"], o["y"], o["x"] + o["w"], o["y"] + o["h"]))
                               for o in film.content(f, 0.5))
            part = None
            if held and full:
                part = empty_part(film, f, e)
                held = part < PANE_PART
            if not held:
                r = out.setdefault(film.label(e["id"]), ([], e["w"] * e["h"] / area, part))
                r[0].append(f)
    return out


def first(film, fn):
    return next((f for f in range(film.n) if fn(f)), None)


def check(film):
    lim = film.limits
    out = []
    moved = next((f for f in range(1, film.n) if film.change_lag[f] > MOVE_SHARE), None)
    if moved is None or film.t(moved) > lim["hookBy"]:
        # How much motion the rule needs, and how much the opening has: a slow drift or push that moves too few pixels
        # in 0.2 s does not count, so the message says by how much to speed it up.
        early = [float(film.change_lag[f]) for f in range(1, min(film.n, int(round(lim["hookBy"] * film.fps)) + 1))]
        most = max(early, default=0.0)
        need = (f"A move here is a change on {MOVE_SHARE:.1%} of the frame or more against the frame 0.2 s before (a pixel counts when its grey "
                f"level moves {film_mod.CHANGE_DELTA} or more); by {lim['hookBy']} s the opening changes {most:.2%} of the frame at most. ")
        slow = (f"A slow drift or push counts only at speed: make it about {MOVE_SHARE / most:.1f} times faster (a larger amount over the same time), "
                "or start an entrance or a cut in the first second.") if most > 0 else "Start a motion in the first second: an entrance, a push or a cut, not a still opening."
        out.append(finding("hook", "error", 0, film.t(moved if moved is not None else film.n - 1), {"firstMove": None if moved is None else round(film.t(moved), 2),
                                                                                                   "mostChangeInHook": round(most, 5)},
                           {"by": lim["hookBy"], "moveShare": MOVE_SHARE}, need + slow))
    show = lim.get("hookShow")
    by = lim["hookShowBy"] if lim.get("hookShowBy") is not None else lim["hookBy"]
    grace = 1.5 / film.fps
    area = lim.get("hookArea") or 0.015
    pic = first(film, lambda f: picture_at(film, f, area))
    line = first(film, lambda f: line_at(film, f, lim.get("hookRole") or "display"))
    t_of = lambda f: None if f is None else round(film.t(f), 2)  # noqa: E731
    # Any picture at all (the floor of a film with no direction): a smaller picture than the hook's area is still a
    # picture on the ground, so text beside it is not alone, and the fix says to draw it larger.
    small = first(film, lambda f: picture_at(film, f, min(area, 0.015))) if show in ("picture", "both") else None
    text_first = first(film, lambda f: any(t["opacity"] >= 0.5 for t in film.ink[f])) if show in ("picture", "both") else None
    if show in ("picture", "both") and (pic is None or film.t(pic) > by + grace):
        early_small = small is not None and film.t(small) <= by + grace
        fix = f"Open on the subject the system's hook names: a picture or shape of {area:.0%} of the frame, on screen by {by} s"
        fix += (f". A smaller one shows from {film.t(small):.2f} s: draw it larger, so the parts on screen by {by} s cover {area:.0%} of the frame (a group counts each part by its box)."
                if early_small else ".")
        if text_first is not None and (pic is None or text_first < pic) and not early_small:
            fix += " Do not open on text before it."
        out.append(finding("hook", "error", 0, film.t(pic) if pic is not None else film.seconds, {"firstPicture": t_of(pic), "area": area, "smallerPicture": t_of(small)},
                           {"by": by}, fix
                           + (" A drawing is counted by what its parts cover, so an open drawing (a lever, a linkage: thin parts) covers little of the frame:"
                              " lay its plate under it (sheet `plate: true`, the figure box), and the hook counts the plate with its drawing as one picture."
                              if any(w in ((((film.tokens or {}).get("direction") or {}).get("hook") or {}).get("how") or "") for w in ("diagram", "drawing", "hairline")) else "")))
    if show in ("line", "both") and (line is None or film.t(line) > by + grace):
        out.append(finding("hook", "error", 0, film.t(line) if line is not None else film.seconds, {"firstLine": t_of(line), "role": lim.get("hookRole")},
                           {"by": by}, f"Set the opening line in {lim.get('hookRole') or 'display'} size on screen by {by} s."))
    if show is None:
        subj = first(film, lambda f: picture_at(film, f, 0.015) or line_at(film, f, "display"))
        if subj is None or film.t(subj) > lim["hookBy"] + grace:
            out.append(finding("hook", "error", 0, film.t(subj) if subj is not None else film.seconds, {"firstSubject": t_of(subj)}, {"by": lim["hookBy"]},
                               "Bring the picture, shape or display line on screen by 1 s."))
    # An empty container is not content: a pane, a window or a card that shows nothing on frame 0, or for EMPTY_S in
    # the hook's time, reads as a template slide.
    for label, (frames, share, part) in empty_containers(film, round((by + grace) * film.fps)).items():
        runs = film.runs([f in set(frames) for f in range(film.n)])
        a, b = max(runs, key=lambda r: r[1] - r[0])
        if 0 in frames or (b - a + 1) / film.fps >= EMPTY_S:
            a = 0 if 0 in frames else a
            b = next(r[1] for r in runs if r[0] <= a <= r[1]) if 0 in frames else b
            out.append(finding("hook", "error", film.t(a), film.t(b + 1), {"emptyContainer": label, "shareOfFrame": round(share, 2), "emptyFor": round((b - a + 1) / film.fps, 2),
                                                                           **({"emptyPartOfPane": round(part, 2)} if part is not None else {})},
                               {"by": by, "emptyOnFrame0": False, "maxEmpty": EMPTY_S, **({"maxEmptyPart": PANE_PART} if part is not None else {})},
                               ("Fill this pane before the film starts: show its first content (a line of the code, the picture) on frame 0, or bring the pane in with its content, not empty."
                                if part is None else f"This system's window stays full: {part:.0%} of the pane's height is empty. Fill it with rows to its foot on frame 0, or make the pane shorter."),
                               node=label))
    # Text alone on the ground before any picture: a picture under the hook's area is still there (the hook's own
    # finding above says to draw it larger), so the text beside it is not alone.
    if show in ("picture", "both"):
        seen = small if small is not None else pic
        if text_first is not None and (seen is None or text_first < seen):
            alone = (film.t(seen) if seen is not None else film.seconds) - film.t(text_first)
            if alone > lim["textAlone"]:
                out.append(finding("hook", "error", film.t(text_first), film.t(text_first) + alone, {"textAlone": round(alone, 2)}, {"max": lim["textAlone"]},
                                   "Do not hold text alone on the ground: bring the picture in under the first line."))
    return out
