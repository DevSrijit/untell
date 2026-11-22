"""motion/no-focus: while things move, one move leads the eye.

A reviewer's tell: "too much movement, unsynchronised movement, no clear attention-drawing element". motion/too-much
counts how many groups move; this check asks whether one of them leads. Kowalski's standard behind it: every move
has a purpose, and a group enters as one gesture (a stagger), not as unrelated moves.

Every frame, from elements.json (content elements at opacity 0.3 or more):
  moves     each element that moved, scaled or faded since the frame before. Its weight is the square root of its
            area times its change (centre travel in px + half its size change + 40 x its opacity change).
  gestures  moves that read as one: they share a step (a camera pan, a group moved together), or they go the same
            way (within 30 degrees) and sit near each other (centres within 12 % of the frame diagonal), or they belong
            to one node (one id stem). A staggered row of bars is one gesture.
  compete   two gestures or more, the second at least SECOND of the first's weight, and their centres at least
            APART of the diagonal apart: the eye must split.
A finding: compete for longer than HOLD s (gaps of 2 frames bridged). Eye jumps: the leading gesture's centre jumps
more than half the diagonal within JUMP_WITHIN s, three times or more in the film.
A still frame is not judged here: a static layout's hierarchy is not a motion fault.
"""
import math

from film import finding

SECOND, APART, HOLD = 0.5, 0.25, 0.4
JUMP_WITHIN, JUMPS = 0.6, 3
MIN_WEIGHT = 40  # a gesture under this weight (a 1 px drift of a small mark) is not a move the eye follows


def stem(label):
    return label.rstrip("0123456789").split("-")[0] or label


def gestures(film, f):
    """The gestures at frame f: (weight, centre x, centre y, labels), heaviest first."""
    prev = {e["id"]: e for e in film.elements(f - 1)}
    items = []
    for e in film.content(f, 0.3):
        p = prev.get(e["id"])
        if p is None:
            continue
        dx, dy = (e["x"] + e["w"] / 2) - (p["x"] + p["w"] / 2), (e["y"] + e["h"] / 2) - (p["y"] + p["h"] / 2)
        ds, do = abs(e["w"] - p["w"]) + abs(e["h"] - p["h"]), abs(e["opacity"] - p["opacity"])
        mv = math.hypot(dx, dy) + ds / 2
        if mv < 0.5 and do < 0.04:
            continue
        area = max(1.0, min(e["w"], film.W) * min(e["h"], film.H))
        items.append({"label": film.label(e["id"]), "cx": e["x"] + e["w"] / 2, "cy": e["y"] + e["h"] / 2, "dx": dx, "dy": dy,
                      "w": area ** 0.5 * (mv + 40 * do)})
    diag = math.hypot(film.W, film.H)
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    for i, a in enumerate(items):
        for j in range(i + 1, len(items)):
            b = items[j]
            ma, mb = math.hypot(a["dx"], a["dy"]), math.hypot(b["dx"], b["dy"])
            same_step = ma >= 0.5 and abs(a["dx"] - b["dx"]) < 1 and abs(a["dy"] - b["dy"]) < 1
            near = math.hypot(a["cx"] - b["cx"], a["cy"] - b["cy"]) < 0.12 * diag
            same_way = (ma < 0.5 and mb < 0.5) or (ma >= 0.5 and mb >= 0.5 and a["dx"] * b["dx"] + a["dy"] * b["dy"] > 0.866 * ma * mb)
            if same_step or (near and same_way) or stem(a["label"]) == stem(b["label"]):
                parent[find(i)] = find(j)
    groups = {}
    for i, it in enumerate(items):
        groups.setdefault(find(i), []).append(it)
    out = []
    for g in groups.values():
        w = sum(i["w"] for i in g)
        if w < MIN_WEIGHT:
            continue
        out.append((w, sum(i["cx"] * i["w"] for i in g) / w, sum(i["cy"] * i["w"] for i in g) / w, sorted({i["label"] for i in g})))
    return sorted(out, key=lambda x: -x[0])


def check(film):
    diag = math.hypot(film.W, film.H)
    comp, leaders = [False] * film.n, [None] * film.n
    detail = {}
    for f in range(1, film.n):
        gs = gestures(film, f)
        if gs:
            leaders[f] = gs[0]
        if len(gs) >= 2 and gs[1][0] >= SECOND * gs[0][0] and math.hypot(gs[0][1] - gs[1][1], gs[0][2] - gs[1][2]) >= APART * diag:
            comp[f] = True
            detail[f] = gs
    # Bridge gaps of up to 2 frames.
    for f in range(1, film.n - 2):
        if comp[f - 1] and not comp[f] and (comp[f + 1] or comp[f + 2]):
            comp[f] = True
    out = []
    for a, b in film.runs(comp):
        if (b - a + 1) / film.fps < HOLD:
            continue
        mid = next((f for f in range(a + (b - a) // 2, b + 1) if f in detail), a)
        gs = detail.get(mid) or detail.get(a)
        if not gs:
            continue
        names = [", ".join(g[3][:3]) for g in gs[:3]]
        out.append(finding("motion/no-focus", "warning", film.t(a), film.t(b),
                           {"gestures": len(gs), "leading": names, "secondShare": round(gs[1][0] / gs[0][0], 2),
                            "apartPx": round(math.hypot(gs[0][1] - gs[1][1], gs[0][2] - gs[1][2]))},
                           {"secondShare": SECOND, "apart": APART, "seconds": HOLD},
                           "Let one move lead: hold the others still until it lands, or move them as one gesture (same way, a stagger) next to it.",
                           node=gs[0][3][0]))
    # Eye jumps: the leading gesture's centre moves across the frame, again and again, within a short time.
    jumps, last = [], None
    for f in range(1, film.n):
        L = leaders[f]
        if L is None:
            continue
        if last is not None and L[3] != last[1][3] and f - last[0] <= JUMP_WITHIN * film.fps \
                and math.hypot(L[1] - last[1][1], L[2] - last[1][2]) > 0.5 * diag:
            jumps.append(f)
        last = (f, L)
    if len(jumps) >= JUMPS:
        names = []
        for f in jumps:
            for lab in leaders[f][3][:1]:
                if lab not in names:
                    names.append(lab)
        out.append(finding("motion/no-focus", "warning", film.t(jumps[0]), film.t(jumps[-1]), {"eyeJumps": len(jumps), "leads": names[:5]}, {"max": JUMPS - 1},
                           "Keep the eye path short: start each new move near the last one, or lead the eye with a move between them.",
                           node=", ".join(names[:3])))
    return out
