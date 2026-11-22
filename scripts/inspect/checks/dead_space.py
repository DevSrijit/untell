"""dead-space: a large part of the frame stays empty, over the whole film.

The old measure (fixed bands, each judged by itself) missed a half-empty frame four times: a short beat stays under
the limit, a band "changes" when its words change, and an empty span that crosses two bands is two short runs. This
measure reads the whole frame and the whole film.

Per frame: the largest empty span, a run of rows over the whole frame height that holds no content (and at 16:9 a run
of columns over the whole width). A row holds content when ROW_FULL of its pixels in the 1/10 copy are off the ground
colour (more than DELTA on a channel), or when a visible text's ink (opacity 0.5) crosses it. Not content: the grain
of a ground and the marks of a sheet's grid (a mark of MARK px or less each way in the 1/10 copy), a straight hairline
across the frame (1 or 2 px thick), and a panel in the ground's own tone (an empty pane is empty).
On a drawing sheet (Spec, Schematic) this means: the drawing's lines, labels and dimensions are content; the sheet's grid
(hairlines and marks at a fixed pitch) and a plate with nothing on it are the sheet, not content. A frame of grid alone
reads as an empty sheet, so the grid never fills a frame. The finding says so, and where the system puts a figure.
The span counts when it reaches SPAN of the frame: a third, and at 9:16 0.40 of the height, because the text-safe foot
leaves the 35 % under it to the platform's buttons by design.
The film: the share of its frames with such a span, outside a designed end (an end of kind card, paper or lockup,
or a cut to the empty ground, from the last large change) and outside declared holds. Over the system's limit, one finding with the runs.
A run longer than the system's run limit is a finding of its own (one stretch the viewer sees half empty).
The limits: the system's direction.space (emptyShare: the share of the film; emptyRun: one stretch, in seconds); a
system that states none gets DEFAULT_SHARE and a run of limits.deadSpan. The finding says where the limit came from.
"""
import numpy as np

from film import finding, gesture

DESIGNED_EMPTY_ENDS = {"card", "paper", "lockup", "cut"}  # direction.ts Ends.kind
DELTA = 28
ROW_FULL = 0.005  # a row of the 1/10 copy with under 0.5 % of its pixels off the ground is empty
MARK = 3
SPAN_TALL, SPAN = 0.40, 1 / 3
DEFAULT_SHARE = 0.35
# The level, by precision on agents' films and the reels (8 judged: 7 real, 1 debatable, 87 %): a warning (error needs 95 %).


FILLER_S = 1.0
FILLER_AREA = 0.05  # a flat block of 5 % of the frame or more can stand in for content


def fillers(film, f):
    """Flat blocks that fill space and show nothing: a box element of FILLER_AREA to 90 % of the frame, filled with one
    colour that is not the ground's (a pane in the ground's tone is already empty), with no text, picture or smaller
    element on it, and alone in its group (a chart's bars come several to a group). Returns [(label, box)]."""
    import re
    area = film.W * film.H
    els = film.content(f, 0.5)
    texts = [t["ink"] for t in film.ink[f] if t["opacity"] >= 0.5]
    out = []
    for e in els:
        if e["kind"] != "box" or e.get("stroke") or not FILLER_AREA * area <= e["w"] * e["h"] <= 0.9 * area:
            continue
        m = re.findall(r"[\d.]+", e.get("fill") or "")
        if len(m) < 3 or "url(" in (e.get("fill") or "") or max(abs(float(m[i]) - float(film.ground[i])) for i in range(3)) <= 40:
            continue
        x0, y0, x1, y1 = e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]
        inside = lambda b: b[0] < x1 and b[2] > x0 and b[1] < y1 and b[3] > y0  # noqa: E731
        if any(inside(t) for t in texts):
            continue  # a plate under text
        if any(o is not e and o["kind"] in ("image", "box") and o["w"] * o["h"] < e["w"] * e["h"] and inside((o["x"], o["y"], o["x"] + o["w"], o["y"] + o["h"])) for o in els):
            continue
        group = gesture(film, e["id"])
        if sum(1 for o in els if o["kind"] == "box" and gesture(film, o["id"]) == group) > 1:
            continue  # a chart mark: one of several in its group
        out.append((film.label(e["id"]), (x0, y0, x1, y1)))
    return out


def off_ground(film):
    """Per frame, the pixels of the 1/10 copy that are not ground, without grain, grid marks and straight hairlines."""
    if getattr(film, "_off_ground", None) is not None:
        return film._off_ground
    from scipy import ndimage as ndi
    off = (np.abs(film.rgb - film.ground[None, None, None, :]).max(axis=3) > DELTA)
    for f in range(film.n):
        lab, k = ndi.label(off[f])
        if not k:
            continue
        drop = np.zeros(k + 1, dtype=bool)
        for i, sl in enumerate(ndi.find_objects(lab), start=1):
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            area = int((lab[sl] == i).sum())
            # Grain and grid marks (MARK px or less each way), and a straight hairline across the frame: one or two px
            # thick, six or more long. Upright lines stay: the lit edges of a dark object on a dark ground are upright lines.
            drop[i] = (h <= MARK and w <= MARK) or (h <= 2 and w >= 6 and area <= 2 * w)
        off[f][drop[lab]] = False
    # A flat block that shows nothing does not fill the frame: its pixels count as empty.
    k = off.shape[2] / film.W
    film._fillers = {}
    for f in range(film.n):
        for label, (x0, y0, x1, y1) in fillers(film, f):
            off[f][max(0, int(y0 * k)):int(y1 * k) + 1, max(0, int(x0 * k)):int(x1 * k) + 1] = False
            film._fillers.setdefault(label, []).append(f)
    film._off_ground = off
    return film._off_ground


def longest_false(flags):
    """(length, start) of the longest run of False in a 1-D bool array."""
    best, start, run = 0, 0, 0
    for i, v in enumerate(list(flags) + [True]):
        if not v:
            run += 1
        else:
            if run > best:
                best, start = run, i - run
            run = 0
    return best, start


def spans(film):
    """Per frame: (share, start, axis) of the largest empty span ("rows" over the height; at 16:9 also "columns")."""
    if getattr(film, "_spans", None) is not None:
        return film._spans
    off = off_ground(film)
    n, h, w = off.shape
    wide = film.W / film.H > 1.2
    panes = {nd.get("id") for nd in film.nodes if nd.get("pane")}
    out = []
    for f in range(n):
        rows = off[f].mean(axis=1) >= ROW_FULL
        cols = off[f].mean(axis=0) >= ROW_FULL
        # A pane's panel (a terminal, a code block, a window: the node says pane) is picture, in any tone: the frame it
        # covers is filled. Before: a window run to the foot still read as empty, and an agent padded the frame.
        for e in film.content(f, 0.5):
            if film.label(e["id"]) in panes:
                rows[max(0, int(e["y"] / film.H * h)):min(h, int(np.ceil((e["y"] + e["h"]) / film.H * h)))] = True
                cols[max(0, int(e["x"] / film.W * w)):min(w, int(np.ceil((e["x"] + e["w"]) / film.W * w)))] = True
        for t in film.ink[f]:
            if t["opacity"] >= 0.5:
                x0, y0, x1, y1 = t["ink"]
                rows[max(0, int(y0 / film.H * h)):min(h, int(np.ceil(y1 / film.H * h)))] = True
                cols[max(0, int(x0 / film.W * w)):min(w, int(np.ceil(x1 / film.W * w)))] = True
        r, rs = longest_false(rows)
        best = (r / h, rs / h, "rows")
        if wide:
            c, cs = longest_false(cols)
            if c / w > best[0]:
                best = (c / w, cs / w, "columns")
        out.append(best)
    film._spans = out
    return out


def limits(film):
    """(share limit, run limit, where they come from)."""
    d = (film.tokens or {}).get("direction") or {}
    space = d.get("space") or {}
    run = film.limits.get("deadSpan", 2.0)
    if space.get("emptyShare") is not None:
        return space["emptyShare"], space.get("emptyRun", run), "direction.space"
    return DEFAULT_SHARE, run, "the default (the system states no direction.space)"


def SHEET_NOTE(film):
    """For a film on a drawing sheet: what counts as content, and where the system puts a figure."""
    if not any(str(n.get("id", "")).endswith("-grid-v") or str(n.get("id", "")).endswith("-grid-marks") for n in film.nodes):
        return ""
    fig = ((((film.tokens or {}).get("direction") or {}).get("compose") or {}).get("figure") or {}).get("foot")
    where = f" This system stands a figure on {fig * 100:.0f} % of the frame's height (figureBox; fitDrawing with no area)." if fig else ""
    return (" On a drawing sheet the grid and an empty plate are not content: only the drawing's lines, labels and dimensions fill the frame."
            + where)


def check(film):
    sp = spans(film)
    need = SPAN_TALL if film.H / film.W > 1.5 else SPAN
    share_max, run_max, why = limits(film)
    end_from = film.n
    if film.limits.get("endKind") in DESIGNED_EMPTY_ENDS:
        big = [f for f in range(film.n) if film.change[f] > 0.02]
        end_from = max(big) if big else film.n
    judged = [f for f in range(film.n) if f < end_from and not film.in_hold(f)]
    if not judged:
        return []
    empty = [sp[f][0] >= need and f < end_from and not film.in_hold(f) for f in range(film.n)]
    runs = film.runs(empty)
    share = sum(empty) / len(judged)
    fill = getattr(film, "_fillers", {})
    def filler_in(a, b):
        return sorted(lb for lb, fs in fill.items() if any(a <= x <= b for x in fs))
    out = []

    def where(a, b):
        s = min((sp[f] for f in range(a, b + 1)), key=lambda x: x[0])
        ax = "height" if s[2] == "rows" else "width"
        lo = max(sp[f][1] for f in range(a, b + 1))
        return s, ax, lo
    if share > share_max:
        worst = max(runs, key=lambda r: r[1] - r[0])
        s, ax, lo = where(*worst)
        out.append(finding("dead-space", "warning", film.t(runs[0][0]), film.t(runs[-1][1]),
                           {"emptyTimeShare": round(share, 2), "spanAtLeast": round(need, 2), "runs": [[round(film.t(a), 2), round(film.t(b + 1), 2)] for a, b in runs][:10],
                            "longestRun": [round(film.t(worst[0]), 2), round(film.t(worst[1] + 1), 2)], "emptyShareOfFrame": round(s[0], 2),
                            "emptySpan": f"{ax} {sp[worst[0]][1] * 100:.0f}-{(sp[worst[0]][1] + sp[worst[0]][0]) * 100:.0f} %"},
                           {"maxTimeShare": share_max, "from": why},
                           f"{share * 100:.0f} % of the film leaves {need * 100:.0f} % or more of the frame's {ax} empty "
                           f"(longest {film.t(worst[0]):.1f}-{film.t(worst[1] + 1):.1f} s, {ax} {sp[worst[0]][1] * 100:.0f}-{(sp[worst[0]][1] + sp[worst[0]][0]) * 100:.0f} %). "
                           "Fill it: set the words larger or across more lines, move the picture or panel into that part, or give the system's next block that space."
                           + SHEET_NOTE(film)))
    # A flat block that fills space and shows nothing, on screen for FILLER_S or more, is padding, not content.
    for label, fs in fill.items():
        for a, b in film.runs([x in set(fs) for x in range(film.n)]):
            if (b - a + 1) / film.fps < FILLER_S:
                continue
            out.append(finding("dead-space", "warning", film.t(a), film.t(b), {"filler": label, "seconds": round((b - a + 1) / film.fps, 2)},
                               {"maxFillerSeconds": FILLER_S},
                               f"{label}: this block fills space and shows nothing; make the subject larger or draw content here.", node=label))
    for a, b in runs:
        dur = (b - a + 1) / film.fps
        if dur <= run_max:
            continue
        s, ax, _ = where(a, b)
        y0 = sp[a][1]
        flat = filler_in(a, b)
        out.append(finding("dead-space", "warning", film.t(a), film.t(b),
                           {**({"filler": flat} if flat else {}), "empty": round(dur, 2), "emptyShareOfFrame": round(s[0], 2), "emptySpan": f"{ax} {y0 * 100:.0f}-{(y0 + sp[a][0]) * 100:.0f} %",
                            "emptySpanY": [round(y0 * 100), round((y0 + sp[a][0]) * 100)] if ax == "height" else None},
                           {"max": round(run_max, 2), "spanAtLeast": round(need, 2), "from": why},
                           (f"{', '.join(flat)}: this block fills space and shows nothing; make the subject larger or draw content here. " if flat else "")
                           + f"For {dur:.1f} s, {s[0] * 100:.0f} % of the frame's {ax} is empty ({y0 * 100:.0f}-{(y0 + sp[a][0]) * 100:.0f} %). "
                           "Move a picture, a shape or the next line into that part, or rebalance the layout." + SHEET_NOTE(film)))
    return out
