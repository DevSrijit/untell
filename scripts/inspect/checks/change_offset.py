"""change-offset: two parts of the frame that change together, except that one changes a frame after the other.

A step is a change of one node in one frame (a fill or colour, opacity by OPACITY or more, a box by 2 px or more, or the
node shows or goes) that holds on both sides: the node does not change at all for ISOLATE frames before it and
ISOLATE frames after it (a cut of a colour, a jump of a band, a box that cuts in or out). A tween is
not a step. The node's state is read from the recording's elements (box, opacity, fill, by the node's label: the
parts of one node are one state) and from the capture's SVG shapes (fill, stroke, painted box, by their node).
Steps on a frame where the view moves are not read (a pan moves every node at once). A part wholly outside the frame
keeps its place in the state with no geometry: a move between two frames on which it is outside is no change, as no
viewer sees it (a slow camera push moved the rules of a view that was off screen by half a px, one a frame before the
other).

Nodes that step on the same frames are one group (sixteen bars that turn grey on one frame). Two groups A and B
change together when, MIN_TOGETHER times or more, B steps on the frame of a step of A or on the frame after it.
When MIN_OFF of those times or more B steps one frame after A (and the frame shows both changes: over SEEN of it
changes on each of the two frames), and they never step on the same frame in the other
direction (B one frame before A), that is a finding: the viewer sees the two parts of one change on two frames
(a code band that cuts one frame after the shape it explains, a label one frame after its bar).
A one-frame cascade (three groups or more that each step one frame after the one before) is a designed sweep, and
does not count.
"""
from collections import defaultdict

from film import finding

ISOLATE = 2
MIN_TOGETHER, MIN_OFF = 2, 2
BOX_PX, OPACITY = 1.0, 0.25
SEEN = 0.0002  # share of the frame (film.change) that shows a change


def _states(film):
    """Per frame: {node: {part: (x, y, w, h, opacity, fill, colour)}}, from the elements and the capture's shapes."""
    shapes = (film.cap.get("shapes") or {}).get("frames") or []
    out = []
    for f in range(film.n):
        cur = defaultdict(dict)
        for e in film.elements(f):
            if e.get("layer") != "content" or e.get("kind") == "camera" or e["opacity"] < 0.05 or ":" not in e["id"]:
                continue  # an element with no node has no name to report
            if e["w"] * e["h"] >= 0.9 * film.W * film.H:
                continue  # the frame's own plate
            off = e["x"] + e["w"] <= 0 or e["y"] + e["h"] <= 0 or e["x"] >= film.W or e["y"] >= film.H
            cur[film.label(e["id"])][e["id"]] = (*((None,) * 4 if off else (e["x"], e["y"], e["w"], e["h"])), e["opacity"], e.get("fill"), e.get("color"))
        for i, sh in enumerate(shapes[f] if f < len(shapes) else []):
            if sh.get("layer") in ("ground", "texture") or sh.get("opacity", 1) < 0.05:
                continue
            b = sh["box"]
            off = b[2] <= 0 or b[3] <= 0 or b[0] >= film.W or b[1] >= film.H
            # A part's key holds its geometry index; a part wholly outside the frame is keyed by its node alone.
            key = f"{sh['id']}#{'off' if off else sh.get('g', i)}"
            cur["s:" + sh["id"]][key] = (*((None,) * 4 if off else (b[0], b[1], b[2] - b[0], b[3] - b[1])), sh.get("opacity", 1), sh.get("fill"), sh.get("stroke"))
        out.append(cur)
    return out


def _diff(a, b):
    """(any change, a step-sized change) between two states of one node."""
    if a == b:
        return False, False
    if a is None or b is None:
        return True, True  # the node shows or goes
    if set(a) != set(b):
        return True, True
    big = False
    for k, u in a.items():
        v = b[k]
        if u == v:
            continue
        if u[5:] != v[5:] or abs(u[4] - v[4]) >= OPACITY:
            big = True
        elif u[0] is not None and v[0] is not None and max(abs(u[i] - v[i]) for i in range(4)) >= 2 * BOX_PX:
            big = True
    small = any(a[k] != b[k] for k in a)
    return small, big


def steps(film):
    """{node: [frame, ...]}: the frames on which each node steps (see the docstring)."""
    st = _states(film)
    nodes = set().union(*[set(s) for s in st]) if st else set()
    moving = film.view_moving
    out = {}
    for k in nodes:
        d = [(False, False)] + [_diff(st[f - 1].get(k), st[f].get(k)) for f in range(1, film.n)]
        fs = []
        for f in range(1, film.n):
            if not d[f][1] or moving[f] or (f + 1 < film.n and moving[f + 1]):
                continue
            if any(d[g][0] for g in range(max(1, f - ISOLATE), f)) or any(d[g][0] for g in range(f + 1, min(film.n, f + 1 + ISOLATE))):
                continue
            fs.append(f)
        if fs:
            out[k] = fs
    return out


def check(film):
    by_node = steps(film)
    # Nodes that step on exactly the same frames are one group.
    groups = defaultdict(list)
    for k, fs in by_node.items():
        groups[tuple(fs)].append(k)
    items = [(list(fs), sorted(ks)) for fs, ks in groups.items()]
    at = defaultdict(set)  # frame -> group indexes that step there
    for i, (fs, _) in enumerate(items):
        for f in fs:
            at[f].add(i)
    out = []
    for a, (fa, ka) in enumerate(items):
        for b, (fb, kb) in enumerate(items):
            if a == b:
                continue
            sb = set(fb)
            same = [f for f in fa if f in sb]
            # The frame must show both changes: a node that steps under a cover (a black frame, a mask) shows nothing.
            late = [f for f in fa if f + 1 in sb and f not in sb and film.change[f] > SEEN and film.change[f + 1] > SEEN]
            early = [f for f in fa if f - 1 in sb and f not in sb]
            if len(late) < MIN_OFF or len(same) + len(late) < MIN_TOGETHER or early:
                continue
            # A cascade: a third group steps one frame after B, or one frame before A, on those frames.
            if any(at[f + 2] - {a, b} or at[f - 1] - {a, b} for f in late):
                continue
            node = f"{', '.join(ka[:3])} x {', '.join(kb[:3])}"
            out.append(finding("change-offset", "error", film.t(late[0]), film.t(late[-1] + 1),
                               {"first": ka[:6], "second": kb[:6], "offFrames": 1, "oneFrameApart": len(late), "sameFrame": len(same),
                                "frames": [[f, f + 1] for f in late][:8]},
                               {"offFrames": 0, "minTimes": MIN_OFF},
                               f"{kb[0]} changes one frame after {ka[0]}, {len(late)} times: give both changes the same time (a change at t "
                               "shows on the first frame after t), or take both from one beat, so they land on one frame.", node=node))
    return out
