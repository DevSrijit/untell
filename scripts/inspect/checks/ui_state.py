"""ui-state: two elements of one group in the group's "selected" look at once, at rest (a list with two selected rows).

A UI shows one selection in a group: one current row of a list, one active tab, one selected item. Two at once read
as a broken state (an agent's Graphite film: the Soak row kept its selected look while the Cool row took it).
Measured on each frame, at rest (no element of the group moved since the frame before):
  with the kit's state  the nodes the UI kit marks data-state "selected" (capture: node data.state), grouped by
                        their block (the node id before its first "-", or the node's group tag): two or more at once;
  without it            the kit's selection plates (listRow: <row id>-sel<n>) of one block; and the rows of one
                        block: boxes of the same size (within 2 px) whose fill is not the
                        block's common fill (the selected look is the odd fill). Two or more odd boxes at once, in a
                        block of three rows or more, while the others share one fill.
A run of MIN_S or longer is a finding.
"""
from collections import Counter

from film import finding, gesture

MIN_S = 0.3


def selected_by_state(film, f):
    """The selected parts by block, one entry per selection: the parts of one selected row (its plate, its bar, its
    text, all marked "selected") overlap on screen, so parts whose boxes overlap are one selection."""
    states = {n.get("id"): ((n.get("data") or {}).get("state") or n.get("state")) for n in film.nodes}
    by = {}
    for e in film.content(f, 0.5):
        if states.get(film.label(e["id"])) in ("selected", "active"):
            by.setdefault(gesture(film, e["id"]), []).append(e)
    out = {}
    for g, es in by.items():
        out[g] = {q[4] for q in selections([[e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"], film.label(e["id"])] for e in es])}
    return out


THIN = 6  # px: a part this thin is a mark of the part beside it (a tab's underline), not a part of its own


def one_part(q, b):
    """Two selected parts are one selection when their boxes overlap, or when one is a thin mark (a tab's underline)
    across the other's width, under or over it by at most half the other's height. Two selected rows that only touch
    stay two selections."""
    across = min(q[2], b[2]) - max(q[0], b[0]) > 2
    if across and min(q[3], b[3]) - max(q[1], b[1]) > 2:
        return True
    thin = (q[3] - q[1] <= THIN) or (b[3] - b[1] <= THIN)
    gap = max(q[1], b[1]) - min(q[3], b[3])
    return across and thin and gap <= 0.5 * max(q[3] - q[1], b[3] - b[1])


def selections(boxes):
    """The selections that the selected parts make: boxes [x0, y0, x1, y1, label] grouped by one_part. The first
    version counted only overlapping boxes, so one active tab (its label, and its underline under it) read as two."""
    groups = []
    for b in boxes:
        hit = next((q for q in groups if one_part(q, b)), None)
        if hit:
            hit[:4] = [min(hit[0], b[0]), min(hit[1], b[1]), max(hit[2], b[2]), max(hit[3], b[3])]
        else:
            groups.append(list(b))
    return groups


def selected_by_look(film, f):
    import re
    out = {}
    # The kit's selection plate (listRow draws it as <row id>-sel<n>, under the selected row) marks a selected row.
    for e in film.content(f, 0.5):
        if e["kind"] == "box" and re.search(r"-sel\d+$", film.label(e["id"])):
            out.setdefault(gesture(film, e["id"]), set()).add(film.label(e["id"]).rsplit("-sel", 1)[0])
    rows = {}
    for e in film.content(f, 0.5):
        if e["kind"] == "box" and e.get("fill") and e["w"] >= 0.2 * film.W and e["h"] >= 40:
            rows.setdefault((gesture(film, e["id"]), round(e["w"] / 2), round(e["h"] / 2)), []).append(e)
    for (g, _, _), es in rows.items():
        if len(es) < 3:
            continue
        common, n = Counter(e["fill"] for e in es).most_common(1)[0]
        odd = [e for e in es if e["fill"] != common]
        if len(odd) >= 2 and n >= 1:
            out.setdefault(g, set()).update(film.label(e["id"]) for e in odd)
    return out


def check(film):
    marked = any(((n.get("data") or {}).get("state") or n.get("state")) for n in film.nodes)
    if not marked:
        film.notes.append({"check": "ui-state", "how": "by look (the kit marks no data-state): two odd-filled rows of one block"})
    pick = selected_by_state if marked else selected_by_look
    hits = {}
    for f in range(1, film.n):
        moved = set()  # at rest: a selection that slides between rows shows two for a frame or two (MIN_S)
        for g, sel in pick(film, f).items():
            if len(sel) >= 2 and g not in moved:
                hits.setdefault(g, []).append((f, tuple(sorted(sel))))
    out = []
    for g, hs in hits.items():
        frames = [h[0] for h in hs]
        for a, b in film.runs([f in set(frames) for f in range(film.n)]):
            if (b - a + 1) / film.fps < MIN_S:
                continue
            sel = next(h[1] for h in hs if h[0] == a)
            out.append(finding("ui-state", "error", film.t(a), film.t(b), {"group": g, "selected": list(sel)[:6], "by": "data-state" if marked else "fill"},
                               {"selectedAtOnce": 1},
                               f"Two of {g}'s parts show the selected look at once ({', '.join(sel[:3])}): end the first selection on the frame the next one starts.",
                               node=g))
    return out
