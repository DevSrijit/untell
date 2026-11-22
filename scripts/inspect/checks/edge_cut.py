"""edge-cut, text-clipped: a graphic or a text cut at rest.

  edge-cut      a box or SVG element whose painted box lies more than CUT outside the frame, at rest (no move from
                the frame before) and visible (opacity 0.5), for at least REST s. Pictures are exempt (a crop by
                the frame is a framing), and so are the ground and texture.
  text-clipped  text at rest for REST s with a letter cut: by the frame edge (a letter's ink box more than 1 px
                outside the frame), or by a mask or a box that clips it (the capture's raw ink, before clips, more than
                2 px past its visible ink, and the frame shows no ink past the clip: ink_past_clip). Not a finding: text in one of the system's bleed roles (tokens "bleed": the
                system sets that role past the edge on purpose). A wipe in progress is not at rest, so it does not count.
                Text wholly outside the frame is not on screen (a camera move took it out, or it waits for the camera):
                film.py drops it, so only a letter whose ink crosses the frame edge is cut.
The mask part needs a capture of version 4 (raw ink); on an older capture only the frame edge is measured, and the
notes say so.
"""
import numpy as np

from edge_sliver import sliver
from film import finding

CUT, REST = 0.25, 0.3
TAPER, TAPER_IN = 0.7, 4  # ink_past_clip: a glyph's own edge holds under TAPER of the ink TAPER_IN px further in


def outside(x0, y0, x1, y1, W, H):
    a = max(1e-6, (x1 - x0) * (y1 - y0))
    ix, iy = max(0, min(x1, W) - max(x0, 0)), max(0, min(y1, H) - max(y0, 0))
    return 1 - ix * iy / a


def ink_past_clip(film, f, ink, raw):
    """True when the frame shows that nothing is cut: ink is drawn past the clip anyway (the strip between the visible
    ink and the raw ink, on its widest side, differs from the strip beyond it by over 10 grey levels in its most
    changed row or column: a descender that a padded mask still shows), or no full ink reaches the clip edge (its last whole
    pixel row or column inside holds under 3 pixels at 85 % of the text's contrast: the font's box is wider than the
    drawn glyph, which ends before the clip), or the glyph tapers into the clip edge by its own shape (see TAPER)."""
    g = np.asarray(film.rec.frame(f).convert("L"), dtype=np.float64)
    H, W = g.shape
    x0, y0, x1, y1 = [int(round(v)) for v in ink]
    sides = {"bottom": raw[3] - ink[3], "top": ink[1] - raw[1], "right": raw[2] - ink[2], "left": ink[0] - raw[0]}
    side, d = max(sides.items(), key=lambda kv: kv[1])
    d = max(2, int(d))
    clamp = lambda a, lo, hi: max(lo, min(hi, a))  # noqa: E731
    if side in ("bottom", "top"):
        a = y1 if side == "bottom" else y0 - d
        b = y1 + d if side == "bottom" else y0 - 2 * d
        strip = g[clamp(a, 0, H):clamp(a + d, 0, H), clamp(x0, 0, W):clamp(x1, 0, W)]
        beyond = g[clamp(min(b, b + d), 0, H):clamp(max(b, b + d), 0, H), clamp(x0, 0, W):clamp(x1, 0, W)]
        axis = 0
    else:
        a = x1 if side == "right" else x0 - d
        b = x1 + d if side == "right" else x0 - 2 * d
        strip = g[clamp(y0, 0, H):clamp(y1, 0, H), clamp(a, 0, W):clamp(a + d, 0, W)]
        beyond = g[clamp(y0, 0, H):clamp(y1, 0, H), clamp(min(b, b + d), 0, W):clamp(max(b, b + d), 0, W)]
        axis = 1
    if side in ("bottom", "top"):
        e = int(np.floor(ink[3])) - 1 if side == "bottom" else int(np.ceil(ink[1]))
        edge = g[clamp(e, 0, H):clamp(e + 1, 0, H), clamp(x0, 0, W):clamp(x1, 0, W)]
    else:
        e = int(np.floor(ink[2])) - 1 if side == "right" else int(np.ceil(ink[0]))
        edge = g[clamp(y0, 0, H):clamp(y1, 0, H), clamp(e, 0, W):clamp(e + 1, 0, W)]
    body = g[clamp(y0, 0, H):clamp(y1, 0, H), clamp(x0, 0, W):clamp(x1, 0, W)]
    if strip.size == 0 or beyond.size == 0 or edge.size == 0 or body.size == 0:
        return True
    ref = float(np.median(beyond))
    drawn_past = float(np.abs(strip - ref).mean(axis=axis).max()) > 10
    # A cut letter runs into the clip at full ink: the last whole pixel row or column inside the clip holds pixels
    # at 85 % of the text's own contrast. A glyph whose box (font metrics) is wider than its drawn shape ends before
    # the clip, with at most an anti-aliased fringe there, and nothing is cut.
    full = 0.85 * float(np.abs(body - ref).max())
    ink_at_edge = int((np.abs(edge - ref) >= full).sum()) >= 3
    # A glyph that ends by its own shape tapers into the clip: the ink in the last whole column (or row) is clearly
    # shorter than TAPER_IN px further in (a round "0": 33 px of ink at the edge against 55 px 4 px in). A cut runs
    # through the stroke at full length: the edge holds about as much ink as the line further in.
    step = TAPER_IN if side in ("right", "bottom") else -TAPER_IN
    if side in ("bottom", "top"):
        inner = g[clamp(e - step, 0, H):clamp(e - step + 1, 0, H), clamp(x0, 0, W):clamp(x1, 0, W)]
    else:
        inner = g[clamp(y0, 0, H):clamp(y1, 0, H), clamp(e - step, 0, W):clamp(e - step + 1, 0, W)]
    n_edge = int((np.abs(edge - ref) >= 0.5 * full / 0.85).sum())
    n_in = int((np.abs(inner - ref) >= 0.5 * full / 0.85).sum()) if inner.size else 0
    tapers = n_in > 0 and n_edge < TAPER * n_in
    return drawn_past or not ink_at_edge or tapers


def check(film):
    bleed = film.bleed_roles()
    runs, clipped, drawn_past = {}, {}, {}
    prev_ink = {}
    has_raw = (film.cap.get("captureVersion") or 0) >= 4
    for f in range(film.n):
        for e in film.content(f, 0.5):
            if e["kind"] not in ("box", "svg") or not film.rec.at_rest(f, e):
                continue
            # The content() filter clips to the frame; read the raw box for the cut.
            c = outside(e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"], film.W, film.H)
            # A shape left a few px inside the edge is edge-sliver's finding (one fault, one finding).
            if c > CUT and sliver(e, film.W, film.H) is None:
                runs.setdefault(film.label(e["id"]), []).append((f, c))
        cur = {}
        for t in film.ink[f]:
            cur[t["id"]] = t["ink"]
            if t["opacity"] < 0.5 or prev_ink.get(t["id"]) != t["ink"]:
                continue
            role = t.get("role") or film.role_of(t["fontPx"])
            if role in bleed:
                continue
            node = t.get("node") or film.label(t["id"])
            # The frame edge: a letter's ink past the frame.
            past = [g for g in (t.get("letters") or []) if g[1] < -1 or g[2] < -1 or g[3] > film.W + 1 or g[4] > film.H + 1]
            if past:
                clipped.setdefault(node, []).append((f, "frame edge", len(past), len(t.get("letters") or []), t["text"]))
                continue
            # A mask or a clipping box: the raw ink reaches past the visible ink.
            raw = t.get("raw")
            if raw:
                # (A review: a counter's "0" and a pointer's address read 3-6 px cut at their right side. The capture
                # measured digits as proportional glyphs while the kit draws tabular figures: detect.ts now centres a
                # digit's ink in its tabular advance (capture v6). The 2.2 px left on the counter is the font's box past
                # a round glyph: frame 150 shows the "0" taper into the clip edge, which ink_past_clip now reads.)
                over_v = max(t["ink"][1] - raw[1], raw[3] - t["ink"][3])
                over_h = max(t["ink"][0] - raw[0], raw[2] - t["ink"][2])
                over = max(over_v, over_h)
                if over > 2:
                    if node not in drawn_past:
                        drawn_past[node] = ink_past_clip(film, f, t["ink"], raw)
                    if not drawn_past[node]:
                        clipped.setdefault(node, []).append((f, "mask", round(over, 1), len(t.get("letters") or []), t["text"]))
        prev_ink = cur
    if not has_raw:
        film.notes.append({"check": "text-clipped", "notMeasured": "masks", "why": "the capture is older than version 4 (no raw ink): only the frame edge is measured"})
    out = []
    rest = REST * film.fps
    for node, hs in runs.items():
        if len(hs) < rest:
            continue
        out.append(finding("edge-cut", "error", film.t(hs[0][0]), film.t(hs[-1][0]), {"outside": round(max(h[1] for h in hs), 2)}, {"max": CUT},
                           "Bring this graphic inside the frame at rest, or make the bleed deliberate (most of it off frame).", node=node))
    for node, hs in clipped.items():
        # At rest for REST s means one run of frames in a row: a digit that rolls in steps (an odometer's leading digit)
        # rests a frame or two between steps, and those frames do not add up to a rest.
        best, cur = [], []
        for h in hs:
            cur = cur + [h] if cur and h[0] == cur[-1][0] + 1 else [h]
            if len(cur) > len(best):
                best = cur
        if len(best) < rest:
            continue
        hs = best
        f, by, amount, n, text = hs[0]
        measured = {"by": by, "text": text[:40]}
        measured.update({"lettersPast": amount, "letters": n} if by == "frame edge" else {"cutPx": amount})
        out.append(finding("text-clipped", "error", film.t(hs[0][0]), film.t(hs[-1][0]), measured, {"letters": 0, "cutPx": 2},
                           "Show the whole text at rest: move it inside the frame or its box, widen the box, or finish the wipe before the text holds.",
                           node=node))
    return out
