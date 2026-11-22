"""ending: the film ends on a held, complete end card, and the music fades.

  kind     the system's direction (tokens "direction.ends"): "cut" ends on a hard cut with no hold and no fade;
           "paper" ends on the ground alone for `hold` s; every other kind (event, card, lockup, offer) holds a
           complete end card at least `hold` s
  (the closing hold ignores changes inside pictures under 60 % of the frame on the last frame: footage or a push
  in a window under a held card; a full-frame picture or 3D canvas still counts)
  moving   a system whose maxStill is under its end's hold (it may not stand still that long) measures the hold
           from the last entrance, exit or cut: the card stays complete while a push or a drift goes on under it
  close    the last visible change (an entrance, a cut, the end card) comes at most limits.endHoldMax before the
           end (about 3 s; more for a calm system): a film that holds its previous frame that long ends without a close
  complete no element at the last frame is mid-entrance (opacity between 0.1 and 0.95, or still moving)
  fade     the music's level in its last 0.1 s is at least FADE_DB under its level 1.5 s before the end
"""
from audio import level, pcm
from film import finding

EVENT_SHARE = 0.004  # over a blinking cursor, under any entrance
FADE_DB = 10.0


def periodic_parts(film):
    """Shapes and elements that move in every second of the film from their first frame to the last (90 % of the 1 s
    windows, the last one included): {id: the box they sweep}. A part that stops before the end is not periodic."""
    win = film.fps
    moves, boxes, first = {}, {}, {}
    shapes = (film.cap.get("shapes") or {}).get("frames") or []
    def parts(f):
        out = {s["id"]: tuple(s["box"]) for s in (shapes[f] if f < len(shapes) else [])}
        for e in film.elements(f):
            if e["layer"] == "content" and e["kind"] != "text" and e["w"] * e["h"] < 0.9 * film.W * film.H:
                out[film.label(e["id"])] = (e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"], e.get("rotation", 0))
        return out
    prev = parts(0)
    for f in range(1, film.n):
        cur = parts(f)
        for k, v in cur.items():
            first.setdefault(k, f)
            b = boxes.get(k, v[:4])
            boxes[k] = (min(b[0], v[0]), min(b[1], v[1]), max(b[2], v[2]), max(b[3], v[3]))
            if k in prev and any(abs(a - c) >= 1 for a, c in zip(prev[k], v)):
                moves.setdefault(k, set()).add(f // win)
        prev = cur
    last_w = (film.n - 1) // win
    out = {}
    for k, ws in moves.items():
        span = range(first[k] // win, last_w + 1)
        if len(span) >= 3 and last_w in ws and sum(1 for w in span if w in ws) >= 0.9 * len(span):
            out[k] = boxes[k]
    return out


AUDIBLE_DB = -40.0  # the bed's level (dBFS RMS) under which its end is not a cut a viewer hears


def check(film):
    out = []
    kind = film.limits.get("endKind")
    hold_min, longest = film.limits["endHold"], film.limits["endHoldMax"]
    # The closing hold: from the last visible change (over EVENT_SHARE of the frame against 0.2 s before) to the end.
    # Pictures on the last frame are masked out: footage or a slow push under a held card does not break the hold, also
    # when the picture fills the frame (rain on a window under Nocturne's quote card). A picture that enters or cuts in
    # still counts: the capture's change measure (below) sees it.
    import numpy as np
    lag = max(1, film.fps // 5)
    keep = np.ones(film.grey.shape[1:], dtype=bool)
    for e in film.elements(film.n - 1):
        if e["kind"] == "image" and e["opacity"] >= 0.3:
            x0, y0 = int(max(0, e["x"]) // 5), int(max(0, e["y"]) // 5)
            keep[y0:int((e["y"] + e["h"]) // 5) + 1, x0:int((e["x"] + e["w"]) // 5) + 1] = False
    # A subject in constant periodic motion (a pendulum that swings through the whole film, a wheel that steps every
    # second) is not an unfinished end: it moves the same way before and during the hold. Its parts leave the measure.
    periodic = periodic_parts(film)
    if periodic:
        film.notes.append({"check": "ending", "info": "in periodic motion through the film, not counted as a change at the end: " + ", ".join(sorted(periodic)[:6])})
        for x0, y0, x1, y1 in periodic.values():
            keep[max(0, int(y0) // 5):int(y1) // 5 + 1, max(0, int(x0) // 5):int(x1) // 5 + 1] = False
    g = film.grey
    def changed(f):
        d = np.abs(g[f] - g[max(0, f - lag)]) > 12
        return float(d[keep].mean()) if keep.any() else 0.0
    # The pixel measure compares a frame with the one 0.2 s (lag frames) before, so a change still reads for lag - 1
    # frames after the frame that first shows the final state: that frame is the change's own.
    last_px = max([f for f in range(1, film.n) if changed(f) > EVENT_SHARE], default=0)
    last = max(0, last_px - (lag - 1)) if last_px else 0
    # A thin change counts too (motion_measure: a label that types, a stroke that draws, a picture that enters), outside
    # pictures masked above.
    # A mark that only blinks at the end (a terminal's cursor on the last line, as Console's end asks) is part of the
    # hold, not a change: its blinks are left out of the thin-change measure.
    import motion_measure
    els = [film.elements(f) for f in range(film.n)]
    blink = motion_measure.blinkers(els, film.n, film.W * film.H)
    if periodic:
        cap = {**film.cap, "shapes": {"frames": [[x for x in fr if x["id"] not in periodic] for fr in ((film.cap.get("shapes") or {}).get("frames") or [])]}}
        drawn = motion_measure.changed(cap, film.n, [[e for e in fr if film.label(e["id"]) not in periodic] for fr in els], blink, content=False)
    else:
        drawn = motion_measure.changed(film.cap, film.n, els, blink, content=False)
    if blink:
        film.notes.append({"check": "ending", "info": f"a blinking mark is part of the end hold: {', '.join(sorted(k.split(':')[0] for k in blink))}"})
    last = max([last] + [f for f in range(1, film.n) if drawn[f]])
    # A system that may not stand still as long as its end holds (direction maxStill under ends.hold: Courtside keeps
    # a push going) holds its end card complete, not frozen: the closing hold runs from the last event (something
    # cuts in or leaves, or a cut), and a push, a drift or a blink under the complete card is part of the hold.
    # The end's kind wins over stillness for what the end shows; stillness wins for how it shows it (moving).
    moving_end = film.limits["stall"] < hold_min
    # A hold counts on the blocks' frame grid: a change at t shows on the first frame after t, and the film ends at
    # n / fps, so a card that first shows on frame F has held (n - F + 1) / fps: a card cut in at end - 1.5 s holds
    # 1.5 s.
    held = lambda f: (film.n - f + (1 if f > 0 else 0)) / film.fps  # noqa: E731
    still_hold = held(last)  # from the last pixel change: the "close" rule reads this one
    if moving_end:
        from film import entrances
        blinking = {film.label(k) for k in blink}
        events = [e["f"] for e in entrances(film) if not all(k.startswith("e:") and k[2:] in blinking for k in e["keys"])]
        from sound_common import cuts
        events += cuts(film)
        vis = lambda f: {film.label(e["id"]) for e in film.content(f, 0.5)} - blinking  # noqa: E731
        prev = vis(0)
        for f in range(1, film.n):
            cur = vis(f)
            if prev - cur:
                events.append(f)
            prev = cur
        last = max(events, default=0)
        film.notes.append({"check": "ending", "info": f"maxStill {film.limits['stall']} s is under the end's hold {hold_min} s: the hold runs from the last entrance, exit or cut, and motion under the complete card is allowed"})
    hold = held(last)
    if kind == "paper":
        # The end dissolves to the ground: the last `hold` seconds show the ground alone.
        off = (abs(film.rgb[-1] - film.ground).max(axis=2) > 28).mean()
        if off > 0.01 or round(hold, 2) < hold_min:
            out.append(finding("ending", "error", film.seconds - hold_min, film.seconds, {"lastFrameOccupied": round(float(off), 4), "closingHold": round(hold, 2)},
                               {"occupied": 0.01, "minHold": hold_min}, "End on the ground alone: dissolve the title into the paper and hold the empty ground under the music's last decay."))
    elif kind != "cut":
        if round(hold, 2) < hold_min:
            out.append(finding("ending", "error", film.t(last), film.seconds, {"closingHold": round(hold, 2)}, {"min": hold_min},
                               "Hold the complete end card: let the last entrance (and any loop) finish this long before the film ends."))
        if (still_hold if moving_end else hold) > longest + 0.25:  # a few frames over is not a different ending
            out.append(finding("ending", "error", film.seconds - (still_hold if moving_end else hold), film.seconds, {"closingHold": round(still_hold if moving_end else hold, 2)}, {"max": longest},
                               "Close the film: bring the end card, the payoff or a last beat-cut later, so the film does not just hold its last frame."))
    f = film.n - 1
    prev = {e["id"]: e for e in film.elements(f - 1)}
    for e in film.content(f, 0.1):
        p = prev.get(e["id"])
        if film.label(e["id"]) in periodic:
            continue  # it moves the same way through the whole film: its motion is not an unfinished entrance
        moving = p is not None and abs(p["x"] - e["x"]) + abs(p["y"] - e["y"]) + abs(p["w"] - e["w"]) >= 1
        fading = 0.1 < e["opacity"] < 0.95 and (p is None or abs(p["opacity"] - e["opacity"]) > 0.005)
        if moving or fading:
            out.append(finding("ending", "error", film.t(f), film.t(f), {"opacity": e["opacity"], "moving": moving}, {"atRest": True},
                               "Finish this element's entrance before the last frame, or start it earlier.", node=film.label(e["id"])))
    music = [c for c in film.sound.get("clips", []) if c.get("fileKind") == "music"]
    if film.sound.get("hasSound") and music and kind != "cut" and not film.sound.get("wav"):
        film.notes.append({"check": "ending", "notMeasured": "the fade of the music at the end", "why": "no mix of the scene (a draft read from the recording cache)"})
    elif film.sound.get("hasSound") and music and kind != "cut":
        s = pcm(film.sound["wav"])
        end = film.seconds
        tail, ref = level(s, end - 0.1, end), level(s, end - 1.6, end - 1.4)
        # A bed already near silent 1.5 s before the end (a quiet passage, a stopped bed) has no cut to hear.
        if ref > AUDIBLE_DB and ref - tail < FADE_DB:
            out.append(finding("ending", "error", end - 1.5, end, {"dropDb": round(ref - tail, 1), "lastDb": round(tail, 1)}, {"minDropDb": FADE_DB},
                               "Fade the music under the end card (fadeOut of about 1 s, ending on a bar) instead of cutting it at the last frame."))
    return out
