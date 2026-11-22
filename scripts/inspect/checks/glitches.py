"""ghost (and a text stuck part-way through its entrance or exit: stuck()), z-fight, late-load, tiny-move: small glitches a viewer reads as a fault, from the element boxes and the ink.
All four are warnings: none has a confirmed case on the reels, the agents' films or the block examples (a review judged 14
findings on block examples on frames at 4-5x: a counter's digits read as a z-fight, a mask reveal as a late load; both
are fixed below), and a designed one-frame pop or a counting digit can look the same.

  ghost      a content element at opacity GHOST_LO to GHOST_HI that holds that opacity (within 0.01) and its box for
             over REST s: a fade that did not finish. Not a finding when the scene declares it: its node's opacity
             track holds a value in that range: the last key, or two keys of that value REST s or more apart (a dim plate, a
             ghosted step, a grid at 0.2). A slow fade that starts there and never finishes in the film is a ghost.
             An element whose node is not in the capture (an inner part of a block) is judged by its own track only
             when one exists; the notes count the rest.
  z-fight    flicker: a patch of the frame (FLICK_MIN px or more of the 1/5 copy, under a quarter of the frame) whose
             pixels jump by over FLICK grey levels and come back on the next frame, two frames in a row (A, B, A, B), twice or more within 1 s:
             two surfaces at one depth in 3D, or two elements that swap in front of each other. The scene's draw order
             is static, so the pixels are the only evidence. Pixels inside an element that moves on that frame do not count (a
             scrolling strip), and no pixel counts on a frame where the view moves (film.view_moving: a camera move or
             a pan carries a repeating pattern through the frame), nor inside a text whose characters or ink change on those
             frames (a counter that counts), nor inside an element that shows or goes once within 3 frames
             (an entrance, an exit, a cut-out that changes on a cut: two things that cross once). A full-frame strobe is a11y/flash's.
  late-load  a picture or a text that changes size by a step within its first LATE_S s on screen (over 2 % in one
             frame, held before and after, while it does not move: a reveal that opens over several frames is not one): a font that swaps in after the first frame (the text
             reflows) or a picture that pops to its size after its box shows.
  tiny-move  a move that reads as jitter: an element at rest for 3 frames or more that moves 0.5 to 2 px and rests
             again, or one that jumps 6 px or more in 1-2 frames with no fade, while the rest of the frame holds
             (not a camera move, not an entrance or exit, not an element that steps three times or more: a typing
             cursor or a ticking hand steps on purpose), and not a state change: the element's size changes with the
             move (a wipe or an exit begins), or another part of its block fades or changes size on those frames, or
             the move ends with an edge on an edge of a still part of its block (a button press: the face drops onto
             its own edge). A shared move of half the elements or more (four or more on screen) is a camera move.
"""
import math

import numpy as np

from film import finding

GHOST_LO, GHOST_HI, REST = 0.02, 0.3, 0.3
SMALL_K = 5  # film.grey is 1/5 of the frame
FLICK, FLICK_MIN = 30, 30  # grey levels; pixels of the small copy (1/5 size) in one patch
LATE_S = 0.5


def declared_dim(node):
    """True when the node's opacity track holds a value in the ghost range (a key in range with the next key at
    least REST s later, or the last key)."""
    keys = ((node or {}).get("tracks") or {}).get("opacity") or []
    for i, k in enumerate(keys):
        if GHOST_LO - 0.005 <= k["v"] <= GHOST_HI + 0.005:
            nxt = keys[i + 1] if i + 1 < len(keys) else None
            # Held: the last key, or the next key keeps the value (a slow fade from it is not a hold).
            if nxt is None or (abs(nxt["v"] - k["v"]) <= 0.03 and nxt["t"] - k["t"] >= REST):
                return True
    return False


def stem_node(film, label):
    """The scene node for a label, or for its block (label minus trailing parts) when the label is an inner part."""
    n = film.node(label)
    parts = label.split("-")
    while n is None and len(parts) > 1:
        parts = parts[:-1]
        n = film.node("-".join(parts))
    return n


def ghosts(film):
    runs, undeclared = {}, {}
    for f in range(1, film.n):
        prev = {e["id"]: e for e in film.elements(f - 1)}
        for e in film.content(f, GHOST_LO):
            if e["opacity"] > GHOST_HI or e["kind"] not in ("box", "svg", "text", "image"):
                continue
            p = prev.get(e["id"])
            if p is None or abs(p["opacity"] - e["opacity"]) > 0.01 or abs(p["x"] - e["x"]) + abs(p["y"] - e["y"]) + abs(p["w"] - e["w"]) > 0.5:
                continue
            runs.setdefault(e["id"], []).append(f)
    out = []
    for eid, fs in runs.items():
        seq = film.runs([f in set(fs) for f in range(film.n)])
        long = [(a, b) for a, b in seq if (b - a + 1) / film.fps > REST]
        if not long:
            continue
        label = film.label(eid)
        node = film.node(label)
        if node is None:
            node = stem_node(film, label)
            if node is None:
                undeclared[label] = undeclared.get(label, 0) + 1
                continue
        if declared_dim(node):
            continue
        a, b = long[0]
        op = next(e["opacity"] for e in film.elements(a) if e["id"] == eid)
        out.append(finding("ghost", "warning", film.t(a), film.t(b), {"opacity": round(op, 3), "seconds": round((b - a + 1) / film.fps, 2)},
                           {"opacityAtRest": f"not {GHOST_LO}-{GHOST_HI} unless the track holds it", "seconds": REST},
                           "Finish the fade (to 0 or to full), or hold the low opacity on purpose in the node's opacity track (a dim plate).", node=label))
    if undeclared:
        film.notes.append({"check": "ghost", "notJudged": sorted(undeclared)[:10], "why": "faint inner parts of blocks with no node of their own"})
    return out


def once_changed(film, f, pad=3):
    """Content elements whose visibility (opacity 0.5) changes exactly once in frames f-pad to f+pad."""
    seen, boxes = {}, {}
    for g in range(max(0, f - pad), min(film.n, f + pad + 1)):
        vis = {}
        for e in film.elements(g):
            if e.get("layer") == "content" and e["w"] * e["h"] < 0.9 * film.W * film.H:
                vis[e["id"]] = e["opacity"] >= 0.5
                boxes[e["id"]] = e
        for i in set(vis) | set(seen):
            seen.setdefault(i, []).append(vis.get(i, False))
    out = []
    for i, v in seen.items():
        if sum(1 for a, b in zip(v, v[1:]) if a != b) == 1 and i in boxes:
            out.append(boxes[i])
    return out


def z_fights(film):
    """Flicker: a patch of the frame whose pixels jump and come back on the next frame (A, B, A), twice or more within
    1 s. Two surfaces that fight for the same depth (3D) or two elements that swap in front of each other look so."""
    from scipy import ndimage as ndi
    g = film.grey.astype(np.int16)
    n = film.n
    if n < 4:
        return []
    up = g[1:-1] - g[:-2]
    dn = g[2:] - g[1:-1]
    back = np.abs(g[2:] - g[:-2])
    flick = (np.abs(up) > FLICK) & (np.abs(dn) > FLICK) & (np.sign(up) != np.sign(dn)) & (back < FLICK / 2)
    # A blink alternates: the pixel flips on two frames in a row (A, B, A, B). A move that turns back (a pendulum at
    # the end of its swing) passes A, B, A once and goes on.
    flick = flick & (np.roll(flick, -1, axis=0) | np.roll(flick, 1, axis=0))
    flick[0] &= False
    # Pixels inside an element that moves on that frame do not count: a striped strip that scrolls a half period a
    # frame also reads A, B, A, B, but that is motion, not two surfaces fighting.
    from film import moving_elements
    mov = moving_elements(film)
    for k in range(len(flick)):
        if not flick[k].any():
            continue
        # A camera move or a pan: the whole view moves, and a repeating pattern in it (a grid of squares, stripes)
        # reads A, B, A, B as it passes. That is motion, not two surfaces that fight.
        if film.near_view_move(k + 1, 1):
            flick[k] = False
            continue
        # An entrance, an exit or a cut near this frame (an element that shows or goes once in 3 frames each side: a
        # word that pops in, a cut-out that changes on the phrase) reads A, B, A as the two cross. An element that
        # blinks shows and goes again and again: that one is kept.
        for e in once_changed(film, k + 1):
            x0, y0 = max(0, int(e["x"] / SMALL_K) - 1), max(0, int(e["y"] / SMALL_K) - 1)
            x1, y1 = int((e["x"] + e["w"]) / SMALL_K) + 2, int((e["y"] + e["h"]) / SMALL_K) + 2
            flick[k, y0:y1, x0:x1] = False
        if not flick[k].any():
            continue
        for e in mov[k + 1] + (mov[k + 2] if k + 2 < n else []):
            x0, y0 = max(0, int(e["x"] / SMALL_K) - 1), max(0, int(e["y"] / SMALL_K) - 1)
            x1, y1 = int((e["x"] + e["w"]) / SMALL_K) + 2, int((e["y"] + e["h"]) / SMALL_K) + 2
            flick[k, y0:y1, x0:x1] = False
        # Text whose characters or ink change on these frames (a counter that counts, a digit strip that rolls inside
        # its window): new digits each frame, not two surfaces that fight.
        for f2 in (k + 1, k + 2):
            if f2 >= n:
                continue
            before = {t["id"]: (t["text"], t["ink"]) for t in film.ink[f2 - 1]}
            after = {t["id"]: (t["text"], t["ink"]) for t in film.ink[f2]}
            # A text that changes, or one that shows or goes on this frame (a counter draws each digit as its own node).
            for tid in set(before) | set(after):
                if before.get(tid) != after.get(tid):
                    a0, b0, a1, b1 = (after.get(tid) or before.get(tid))[1]
                    flick[k, max(0, int(b0 / SMALL_K) - 1):int(b1 / SMALL_K) + 2, max(0, int(a0 / SMALL_K) - 1):int(a1 / SMALL_K) + 2] = False
    hits = []
    win = film.fps
    csum = np.cumsum(flick, axis=0)
    total = flick[0].size
    for f in range(len(flick)):
        if not flick[f].any():
            continue
        lo = max(0, f - win)
        count = csum[f] - (csum[lo - 1] if lo > 0 else 0)
        m = flick[f] & (count >= 2)
        if m.sum() < FLICK_MIN or m.mean() > 0.25:  # a full-frame strobe is a11y/flash's
            continue
        lab, k = ndi.label(m)
        sizes = np.bincount(lab.ravel())
        big = int(sizes[1:].max()) if k else 0
        if big >= FLICK_MIN:
            ys, xs = np.nonzero(lab == int(sizes[1:].argmax()) + 1)
            hits.append((f + 1, big, (float(xs.mean()) * SMALL_K, float(ys.mean()) * SMALL_K)))
    out = []
    if hits:
        runs = []
        for f, px, c in hits:
            if runs and f - runs[-1][1] <= win:
                runs[-1] = (runs[-1][0], f, max(runs[-1][2], px), runs[-1][3] + 1, runs[-1][4])
            else:
                runs.append((f, f, px, 1, c))
        for a, b, px, k, (cx, cy) in runs:
            area = round(px * (film.W * film.H) / total)
            # The elements at the patch: the ones that blink (their opacity flips) first, then the ones under them.
            at = [e for f in range(a - 1, min(film.n, b + 2)) for e in film.elements(f)
                  if e.get("layer") == "content" and e["x"] <= cx <= e["x"] + e["w"] and e["y"] <= cy <= e["y"] + e["h"]
                  and e["w"] * e["h"] < 0.9 * film.W * film.H and "/" not in film.label(e["id"])]
            ops = {}
            for e in at:
                ops.setdefault(film.label(e["id"]), set()).add(round(e["opacity"], 1))
            names = sorted(ops, key=lambda lab: -len(ops[lab]))[:2]
            out.append(finding("z-fight", "warning", film.t(a - 1), film.t(b + 1), {"flickers": k + 1, "patchPx": area, "at": [round(cx), round(cy)]},
                               {"maxFlickersPerSecond": 1},
                               "Stop the flicker: give the two surfaces or elements a fixed order (a layer or z, or a small depth offset in 3D), or drop the one that blinks.",
                               node=" x ".join(names) or "(a 3D canvas or the ground)"))
    return out


def late_loads(film):
    out, seen = [], set()
    first = {}
    late = round(LATE_S * film.fps)
    for f in range(1, film.n):
        prev = {e["id"]: e for e in film.elements(f - 1)}
        for e in film.content(f, 0.5):
            if e["kind"] not in ("image", "text"):
                continue
            first.setdefault(e["id"], f)
            p = prev.get(e["id"])
            lab = film.label(e["id"])
            if p is None or p["opacity"] < 0.5 or f - first[e["id"]] > late or lab in seen:
                continue
            nat0, nat1 = p.get("natural"), e.get("natural")
            popped = e["kind"] == "image" and nat1 and (not nat0 or not nat0[0]) and nat1[0]
            dw, dh = abs(e["w"] - p["w"]) / max(1, p["w"]), abs(e["h"] - p["h"]) / max(1, p["h"])
            # Its top left stays: a reflow or a pop to size, not a move. (A scale animation keeps changing, and the
            # hold test below drops it; a one-frame scale step is the pop itself.)
            still_pos = abs(e["x"] - p["x"]) <= 1 and abs(e["y"] - p["y"]) <= 1
            same_text = e.get("text") == p.get("text")
            stepped = still_pos and same_text and max(dw, dh) > 0.02
            if stepped and f >= 2:
                # Held before the step too: a mask that opens over several frames (a rise reveal) grows every frame,
                # and its last growth is not a pop.
                pp = [x for x in film.elements(f - 2) if x["id"] == e["id"]]
                stepped = not pp or (abs(pp[0]["w"] - p["w"]) <= 0.5 and abs(pp[0]["h"] - p["h"]) <= 0.5)
            if stepped:
                # A step, then held: the next frames keep the new size (an animation keeps changing).
                nxt = [x for x in film.elements(min(film.n - 1, f + 2)) if x["id"] == e["id"]]
                stepped = bool(nxt) and abs(nxt[0]["w"] - e["w"]) <= 0.5 and abs(nxt[0]["h"] - e["h"]) <= 0.5
            if popped or stepped:
                seen.add(lab)
                out.append(finding("late-load", "warning", film.t(f), film.t(f),
                                   {"kind": e["kind"], "from": [round(p["w"]), round(p["h"])], "to": [round(e["w"]), round(e["h"])], "afterFrames": f - first[e["id"]]},
                                   {"changeAfterFirstFrame": 0.02},
                                   "Load the font or the picture before the film starts (wait for it, or preload it), so it shows at its size on its first frame.",
                                   node=lab))
    return out


def _touch(a, b):
    """(y, x): a's top or bottom edge on b's, and a's left or right edge on b's, within 1 px."""
    return (min(abs(a["y"] - b["y"]), abs(a["y"] + a["h"] - b["y"] - b["h"])) <= 1,
            min(abs(a["x"] - b["x"]), abs(a["x"] + a["w"] - b["x"] - b["w"])) <= 1)


def pressed(film, series, root, f, j):
    """True when a part of block `root` that moves over frames f..j ends with an edge newly on an edge of a part of the
    same block that holds still there."""
    parts = {eid: s for eid, s in series.items() if film.label(eid).split("-")[0] == root and f - 1 in s and j in s}
    still = [s[j] for s in parts.values() if abs(s[j]["x"] - s[f - 1]["x"]) + abs(s[j]["y"] - s[f - 1]["y"]) < 0.1]
    for s in parts.values():
        a0, a1 = s[f - 1], s[j]
        if abs(a1["x"] - a0["x"]) + abs(a1["y"] - a0["y"]) < 0.5:
            continue
        for b in still:
            if b is a1:
                continue
            now, before = _touch(a1, b), _touch(a0, b)
            if (now[0] and not before[0]) or (now[1] and not before[1]):
                return True
    return False


def tiny_moves(film):
    out, seen = [], set()
    series = {}
    for f in range(film.n):
        for e in film.content(f, 0.5):
            if e["kind"] == "camera":
                continue
            series.setdefault(e["id"], {})[f] = e
    # Frames where most elements move by one step: a camera move or a group move; a small shift there is not jitter.
    moved_share = [0.0] * film.n
    for f in range(1, film.n):
        a = [s for s in series.values() if f in s and f - 1 in s]
        if len(a) >= 4:  # with fewer elements a shared move cannot be told from shared jitter
            moved_share[f] = sum(1 for s in a if abs(s[f]["x"] - s[f - 1]["x"]) + abs(s[f]["y"] - s[f - 1]["y"]) >= 0.5) / len(a)
    for eid, s in series.items():
        fs = sorted(s)
        lab = film.label(eid)
        if lab in seen:
            continue
        # An element that moves in steps again and again (a typing cursor, a ticking hand) steps on purpose.
        steps = sum(1 for f in fs if f - 1 in s and math.hypot(s[f]["x"] - s[f - 1]["x"], s[f]["y"] - s[f - 1]["y"]) >= 2
                    and not (f + 1 in s and math.hypot(s[f + 1]["x"] - s[f]["x"], s[f + 1]["y"] - s[f]["y"]) >= 0.1))
        if steps >= 3:
            continue
        i = 0
        while i < len(fs):
            f = fs[i]
            if f - 1 not in s:
                i += 1
                continue
            d = math.hypot(s[f]["x"] - s[f - 1]["x"], s[f]["y"] - s[f - 1]["y"])
            if d < 0.1:
                i += 1
                continue
            # A run of moving frames.
            j = f
            while j + 1 in s and math.hypot(s[j + 1]["x"] - s[j]["x"], s[j + 1]["y"] - s[j]["y"]) >= 0.1:
                j += 1
            rest_before = all(k in s and math.hypot(s[k]["x"] - s[k - 1]["x"], s[k]["y"] - s[k - 1]["y"]) < 0.1 for k in range(f - 3, f) if k - 1 in s) and f - 3 in s
            rest_after = all(k in s and math.hypot(s[k]["x"] - s[k - 1]["x"], s[k]["y"] - s[k - 1]["y"]) < 0.1 for k in range(j + 1, j + 4)) and j + 3 in s
            total = math.hypot(s[j]["x"] - s[f - 1]["x"], s[j]["y"] - s[f - 1]["y"])
            frames = j - f + 1
            fade = abs(s[j]["opacity"] - s[f - 1]["opacity"]) > 0.05
            camera = max(moved_share[f:j + 1]) > 0.5
            # A state change, not jitter: the element's size changes with the move (a wipe or an exit starts), or another
            # part of its block changes on the same frames (a button press: the face drops as its shadow goes).
            sized = any(k in s and k - 1 in s and abs(s[k]["w"] - s[k - 1]["w"]) + abs(s[k]["h"] - s[k - 1]["h"]) > 0.5 for k in range(f, j + 4))
            root = lab.split("-")[0]
            partner = False
            for k in range(f, j + 1):
                now = {x["id"]: x for x in film.elements(k)}
                for x in film.elements(k - 1):
                    if x["id"] == eid or film.label(x["id"]).split("-")[0] != root:
                        continue
                    y = now.get(x["id"])
                    # Only a fade or a size change of a sibling marks a state change: siblings that move with it are the same jitter.
                    if y is None or abs(y["opacity"] - x["opacity"]) > 0.05 or abs(y["w"] - x["w"]) + abs(y["h"] - x["h"]) > 0.5:
                        partner = True
            # A press: on these frames a part of its block (it, or a part that moves with it) ends with an edge newly on
            # an edge of a part that held still (a button's face that drops onto its own edge). Contact, not jitter.
            if not partner:
                partner = pressed(film, series, root, f, j)
            if rest_before and rest_after and not fade and not camera and not sized and not partner:
                if 0.5 <= total < 2 or (frames <= 2 and total >= 6):
                    seen.add(lab)
                    out.append(finding("tiny-move", "warning", film.t(f), film.t(j), {"px": round(total, 1), "frames": frames},
                                       {"minPx": 2, "minFrames": 3},
                                       "Remove this move, or make it a real one: at least a few px over 3 frames or more with the system's curve (a nudge under 2 px or a 1-2 frame jump reads as jitter).",
                                       node=lab))
                    break
            i = fs.index(j) + 1 if j in fs else i + 1
    return out


STUCK_S = 0.3
STUCK_TRACKS = ("opacity", "x", "y", "reveal")
HOME = {"opacity": 1.0, "x": 0.0, "y": 0.0, "reveal": 0.0}  # the value at rest: shown in full, in its place


def part_out(film, node, t):
    """True when the node's text is cut at time t: partly past the frame, or partly hidden by a mask (the capture's raw
    ink past its visible ink)."""
    f = min(film.n - 1, max(0, round(t * film.fps)))
    for x in film.ink[f] + film.ink_off[f]:
        if (x.get("node") or film.label(x["id"])) != node:
            continue
        x0, y0, x1, y1 = x["ink"]
        if x0 < -1 or y0 < -1 or x1 > film.W + 1 or y1 > film.H + 1:
            return True
        raw = x.get("raw")
        if raw and max(x0 - raw[0], y0 - raw[1], raw[2] - x1, raw[3] - y1) > 2:
            return True
    return False


def stuck(film):
    """ghost, stuck part-way: a text whose entrance or exit stops between its end values and holds there. In a text
    node's opacity, x, y or reveal track, a hold (two keys of one value STUCK_S s or more apart) away from the value at
    rest (HOME: opacity 1, no offset, reveal 0) that a move runs into and a move in the same direction leaves (1 -> 0.5, held 4 s, -> 0: a title stopped mid-exit, partly masked or
    partly faded). An x or y hold counts only while the text is cut (part_out: partly past the frame or under a mask): a
terminal that scrolls a line at a time holds in full view by design. An opacity hold counts only on the way out (1 -> v
-> 0): on the way in, a dim step (a step number that waits at 42 % for its turn) is a designed state. A staged move that a scene means (a two-step
reveal) can look the same: a warning."""
    out, said = [], {}
    for n in film.nodes:
        if n.get("kind") != "text":
            continue
        for k, keys in (n.get("tracks") or {}).items():
            if k not in STUCK_TRACKS or not keys or len(keys) < 4:
                continue
            ks = sorted(keys, key=lambda q: q["t"])
            for i in range(1, len(ks) - 2):
                a, b = ks[i], ks[i + 1]
                u, w = ks[i - 1]["v"], ks[i + 2]["v"]
                v = a["v"]
                if abs(b["v"] - v) > 1e-6 or b["t"] - a["t"] < STUCK_S:
                    continue
                if not ((u > v + 1e-6 and v > w + 1e-6) or (u < v - 1e-6 and v < w - 1e-6)):
                    continue  # not part-way through one move
                if k == "opacity" and not u > v:
                    continue  # a dim step on the way in (a step number that waits at 42 %) is a designed state
                if abs(v - HOME[k]) <= 1e-6:
                    continue  # at rest: shown in full, in its place (an entrance from below that leaves upward rests at 0)
                op = film.track_at((n.get("tracks") or {}).get("opacity"), (a["t"] + b["t"]) / 2)
                if op is not None and op < 0.05:
                    continue  # hidden while it holds
                if k in ("x", "y") and not part_out(film, n["id"], (a["t"] + b["t"]) / 2):
                    continue  # a staged move in full view (a terminal that scrolls a line at a time) is a design
                key = (k, round(a["t"], 2), round(b["t"], 2), round(v, 3))
                if key in said:  # the parts of one block that hold together are one finding
                    said[key]["measured"]["nodes"] = said[key]["measured"].get("nodes", 1) + 1
                    break
                said[key] = out.append(finding("ghost", "warning", a["t"], b["t"], {"stuck": k, "value": round(v, 3), "between": [round(u, 3), round(w, 3)], "seconds": round(b["t"] - a["t"], 2)},
                                   {"holdPartWayS": STUCK_S},
                                   "This text stops part-way through its move and holds there: let the entrance or the exit run to its end in one move, or hold it at an end value.",
                                   node=n["id"])) or out[-1]
                break
    return out


def check(film):
    return ghosts(film) + z_fights(film) + late_loads(film) + tiny_moves(film) + stuck(film)
