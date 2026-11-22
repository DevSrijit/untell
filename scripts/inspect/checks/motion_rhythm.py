"""motion/too-much, motion/unsynced, motion/orphan: how much moves at once, and whether the moves keep a rhythm.

  too-much   more groups moving at once than the budget (MOVERS_BASE, half for a calm system: entrance over
             20 frames), or, with two or more groups moving, over BUDGET_AREA of the frame in motion, for longer than
             0.5 s. Each part counts by its move in the world (film.in_world: the camera's pan and zoom taken out),
             and a camera move counts as one group of its own: a glide moves the view, not every part in it.
  unsynced   the starts of moves: a start is in rhythm when it is within 2 frames of a beat, of another start, or
             of a hit. Under half the starts in rhythm (with 6 or more starts) is a finding. Films without a beat
             grid use the other starts only.
  orphan     one element starts to move while nothing else moves (0.3 s either side), off the beat and with no hit (a
             picture's own slow push or drift, keyed over 2 s or more, is not a move of its own):
             a move with no cause (Kowalski: justified motion, every move answers "why").
"""
from film import gesture, finding
from motion_common import segments

MOVERS_BASE, BUDGET_AREA = 6, 0.6
# A stagger: starts of one gesture at most this many frames apart (a statement's words or lines, a list's rows). Moves a
# beat apart are not a stagger: they keep the music's rhythm or none.
STAGGER_F = 10


def beats_of(film):
    """The beat grid in film time, or [] without music or when the music map's grid trust is low (the grid may
    count another pulse: then only other starts and hits set the rhythm, and a note says so)."""
    try:
        from sound_common import grid, grid_trust, music
        clip = music(film)
        trust, issues = grid_trust(clip)
        if trust == "low":
            film.notes.append({"check": "motion/unsynced", "beats": "not used", "why": "; ".join(issues)})
            return []
        return grid(film, clip)
    except Exception:
        return []


def check(film):
    out = []
    segs = segments(film)
    enter = ((film.tokens or {}).get("motion", {}).get("frames", {}) or {}).get("enter", 12)
    budget = MOVERS_BASE if enter <= 20 else MOVERS_BASE // 2
    area = film.W * film.H
    counts, shares = [0] * film.n, [0.0] * film.n
    for f in range(1, film.n):
        prev = {e["id"]: e for e in film.elements(f - 1)}
        groups, moved_area = set(), 0.0
        cam = next((e for e in film.elements(f) if e["kind"] == "camera"), None)
        pcam = next((e for e in film.elements(f - 1) if e["kind"] == "camera"), None)
        panning = cam is not None and pcam is not None and (cam["x"], cam["y"], cam["scale"]) != (pcam["x"], pcam["y"], pcam["scale"])
        for e in film.content(f, 0.3):
            p = prev.get(e["id"])
            if p is None:
                continue
            # In the world's coordinates (film.in_world): the camera's glide or push is one move of the view, counted
            # once below; a part counts as a mover only when it moves in the world.
            e, p = film.in_world(f, e), film.in_world(f - 1, p)
            d = (round(e["x"] - p["x"]), round(e["y"] - p["y"]), round(e["w"] - p["w"]), round(e["h"] - p["h"]))
            # A box mapped out of a camera move carries up to a pixel of rounding noise (film.in_world).
            floor = 1.5 if e.get("_world") or p.get("_world") else 1
            if any(abs(v) >= floor for v in (e["x"] - p["x"], e["y"] - p["y"], e["w"] - p["w"], e["h"] - p["h"])) if floor > 1 else any(abs(v) >= 1 for v in d):
                # Elements that move by the same step move as one (a camera pan, a group): they count once.
                # While the camera pans, elements that move by one step move with it: they count once.
                # The parts of one block's gesture (the bars of one chart, the digits of a counter) are one mover.
                groups.add(d if panning and d[2] == 0 and d[3] == 0 else (gesture(film, e["id"]),))
                moved_area += e["w"] * e["h"]
        counts[f] = len(groups) + (1 if panning else 0)
        shares[f] = min(1.0, moved_area / area) if len(groups) > 1 else 0.0
    over = [counts[f] > budget or shares[f] > BUDGET_AREA for f in range(film.n)]
    for a, b in film.runs(over):
        if (b - a + 1) / film.fps > 0.5:
            out.append(finding("motion/too-much", "warning", film.t(a), film.t(b), {"movingGroups": max(counts[a:b + 1]), "areaInMotion": round(max(shares[a:b + 1]), 2)},
                               {"movers": budget, "area": BUDGET_AREA}, "Move fewer things at once: let one element lead and the rest wait or hold (Kowalski: justified motion)."))
    beats = beats_of(film)
    hits = []
    try:
        from sound_common import hits as hits_of
        hits = [h["picture"] for h in hits_of(film)]
    except Exception:
        pass
    starts = sorted({(s["a"], s["label"]) for s in segs})
    tol = 2 / film.fps + 0.004
    frames = [a for a, _ in starts]
    # A regular stagger is a rhythm of its own: starts of one gesture (one block's words, rows or bars) spaced evenly,
    # within a frame (Nocturne's lines, a list's rows), are all in rhythm.
    by_gesture = {}
    for a, lab in starts:
        by_gesture.setdefault(gesture(film, lab), []).append(a)
    staggered = set()
    for g, fs in by_gesture.items():
        fs = sorted(set(fs))
        # Runs of three or more starts with even gaps (within a frame, each under a second): one statement's words, a
        # list's rows. A gesture may hold several runs (two statements, each staggered).
        # Two starts STAGGER_F frames apart or less are a stagger too (the second line of a statement after its first).
        i = 0
        while i + 1 < len(fs):
            j = i + 1
            while j + 1 < len(fs) and abs((fs[j + 1] - fs[j]) - (fs[i + 1] - fs[i])) <= 1 and fs[j + 1] - fs[j] <= STAGGER_F:
                j += 1
            gap = fs[i + 1] - fs[i]
            if gap <= STAGGER_F and j - i >= 1:
                staggered.update(fs[i:j + 1])
                i = j + 1
            else:
                i += 1
    # A start within half a second after another start of the same element is that move's follow-through (a squash
    # that springs back, a press that rises again): it keeps the rhythm of the move it ends.
    follow = {(a, lab) for a, lab in starts if any(l2 == lab and 0 < a - a2 <= film.fps // 2 for a2, l2 in starts)}
    synced = 0
    for a, lab in starts:
        t = film.t(a)
        if (a, lab) in follow or a in staggered or any(abs(t - b) <= tol for b in beats) or any(abs(t - h) <= tol for h in hits) or any(o != a and abs(o - a) <= 2 for o in frames):
            synced += 1
    if len(starts) >= 6 and synced / len(starts) < 0.5:
        out.append(finding("motion/unsynced", "warning", 0, film.seconds, {"starts": len(starts), "inRhythm": synced}, {"minShare": 0.5},
                           "Start moves on the beat or together in a regular stagger, so the motion keeps one rhythm."))
    win = int(0.3 * film.fps)
    # A picture's own slow push or drift (its scale or place keyed over 2 s or more: the Media section's picture motion)
    # moves through the shot: it is the picture's motion, not a move that needs a cause.
    by_id = {n.get("id"): n for n in film.nodes if isinstance(n, dict)}
    def slow_picture(label):
        n = by_id.get(label)
        if not n or n.get("kind") != "image":
            return False
        for k in ("scale", "x", "y"):
            ks = (n.get("inner") or {}).get(k) or (n.get("tracks") or {}).get(k) or []  # photo's push is on its inner picture
            if len(ks) >= 2 and ks[-1]["t"] - ks[0]["t"] >= 2 and ks[-1]["v"] != ks[0]["v"]:
                return True
        return False
    for s in segs:
        if s["kind"] != "move" or slow_picture(s["label"]):
            continue
        others = [o for o in segs if o is not s and o["label"] != s["label"] and o["a"] <= s["a"] + win and o["b"] >= s["a"] - win]
        # The camera's own move is another move (the parts are measured in the world, so it is not among the segments).
        camera = any(film.view_moving[f] for f in range(max(1, s["a"] - win), min(film.n, s["a"] + win + 1)))
        t = film.t(s["a"])
        if others or camera or any(abs(t - b) <= tol for b in beats) or any(abs(t - h) <= tol for h in hits):
            continue
        out.append(finding("motion/orphan", "warning", t, film.t(s["b"]), {"alone": True, "offBeat": bool(beats)}, {"cause": "beat, hit or another move"},
                           "Give this move a cause (land it on a beat, a hit or another element's move) or remove it (Kowalski: every move answers why).", node=s["label"]))
    return out
