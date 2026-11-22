"""The beat rules of the scene's mix, before a render: cuts and hits against the music's beat grid, and where the
track's drop lands. They report under the same rule ids as the render's sound checks (one id per cause, so one
declaration covers both passes): sound/cut-on-beat (a cut off the beat), sound/hit-on-beat (a hit off the beat),
sound/drop-on-change (the drop misses the reveal, or lands on nothing).

Beats: hyperframes beats on the music file, mapped to film time through the music node's `at` and `from`.
Beats: the music map's grid (sound_common.grid), the one a scene's beats() gives. Cuts: checks/cuts.py. Hits: each
effect's change time on the frame grid (its peak plays on the frame that shows the change, as the hit block puts it).
A change at a beat shows on the first frame after the beat, so a cut is on the beat when its frame is 0 to 1 frame
after it; a cut outside that by more than one frame (plus 4 ms), or a hit more than one frame (plus 4 ms) off the
nearest beat, is a finding. Hits in a dense run (typing
ticks: three or more, each within 0.35 s of the next) are a texture under a gesture and are not held to the grid.
Drop: sound_checks.bed_drop (the music map's drops inside the part the film plays, else the largest rise of the
track's own level, at least DROP_DB, not out of silence); the events are cuts, hits and entrances (film.picture_events). It goes to "notes" with where it lands; a warning when no cut or hit is within
one beat of it (the level measure places a drop to about one beat).
On a grid the music map marks "low" trust (it disagrees with its own cross-check: 93 BPM against 140 BPM), cuts and
hits are judged against the strong onsets instead (beats().cuts in the kit gives the same list). The drop does not use
the grid.
The drop against the reveal: the scene's reveal (B.reveal, or the detected one) and the bed's own drop are both known
before a render, so the drop that misses the reveal by more than one frame (plus 4 ms) is a finding here, on run 1.
A drop that lands within one frame of a tie (a rise within 1 dB of it) lands.
"""

import numpy as np

from audio import level, pcm
from film import Skip, finding
from sound_common import cuts, grid, grid_trust, hits, in_texture, lower_for_grid, media_path, music, nearest, track_time

DROP_DB = 6.0


def lead_in(src):
    """True when the effect file's role in the media table is "lead-in" (sound_checks.facts)."""
    from sound_checks import facts
    return (facts().get(src) or {}).get("role") == "lead-in"
STRONG_ONSET = 0.5  # beats.ts STRONG_ONSET: a cut point on a low-trust grid


def check(film):
    clip = music(film)
    beats = grid(film, clip)
    if len(beats) < 4:
        raise Skip(f"no beat grid for {clip['src']} (hyperframes beats found {len(beats)} beats in the part the film plays)")
    tol = 1 / film.fps + 0.004
    out = []
    trust, issues = grid_trust(clip)
    judged = True
    if trust == "low":
        # The kit's cut points on a low-trust grid (beats().cuts, scene/beats.ts): the strong onsets (strength 0.5 or
        # more), measured in the sound. Cuts and hits are judged against those, never against the untrusted beats.
        import json as _json
        from sound_common import film_time
        try:
            ons = _json.loads(media_path(clip["src"].split("/")[0] + "/music.json").read_text()).get("onsets") or []
        except (OSError, ValueError):
            ons = []
        end = clip.get("until") or film.seconds
        strong = sorted(film_time(clip, t) for t, st in ons if st >= STRONG_ONSET and clip["at"] - 1e-6 <= film_time(clip, t) <= end + 1e-6)
        if len(strong) >= 2:
            beats = strong
            film.notes.append({"check": "sound/cut-on-beat", "against": f"{len(strong)} strong onsets (the grid is not trusted: {'; '.join(issues)})"})
        else:
            judged = False
            film.notes.append({"check": "sound/cut-on-beat", "notJudged": "cuts and hits", "why": "the grid is not trusted and the track has no strong onsets: " + "; ".join(issues)})
    # A cut with no bed playing has no beat to miss: after the bed stops (Title stops it hard on the impact) or before it
    # enters, the cut is not judged.
    bed_from, bed_to = clip["at"], clip.get("until") or film.seconds
    # Only a clock system cuts on its beats; a bed system may cut on the picture's own rhythm (sound_checks.check_cuts,
    # the render's pass, says the same).
    clock = (((film.tokens or {}).get("direction") or {}).get("mix") or {}).get("music", "clock") == "clock"
    n_judged = n_on = 0
    for f in (cuts(film) if judged and clock else []):
        t = film.t(f)
        if not bed_from - tol <= t <= bed_to + tol:
            continue
        n_judged += 1
        # A change at the beat shows on the first frame after it (frameOf in context.ts): the rule is
        # sound_checks.cut_on_beat, the render's pass too (the change's start, a stepped system's step, the drop).
        from sound_checks import change_end, change_start, cut_on_beat, map_drops, step_frames
        changes = [(film.t(g), float(film.change[g])) for g in range(film.n)]
        from film import declared_reveal
        rv = declared_reveal(film)
        on, b, off = cut_on_beat(t, change_start(changes, t, film.fps), beats, map_drops(clip), film.fps, step_frames(film.system) if film.system else 0, rv[0] if rv else None, change_end(changes, t, film.fps, step=step_frames(film.system) if film.system else 0))
        n_on += 1 if on else 0
        if not on:
            out.append(finding("sound/cut-on-beat", "warning", t, t, {"cutAt": round(t, 3), "nearestBeat": round(b, 3), "offFrames": off},
                               {"offFrames": 1}, "Move this cut onto the nearest beat (or move the change so it lands on one)."))
    # What the review sheet marks and counts: the grid this check judged by (the beats, or the strong onsets on a
    # low-trust grid) and its count of cuts on it. Before, the sheet marked its own onsets and said "0 on a onset"
    # while this check passed every cut (a first-use test).
    if judged and clock:
        film.notes.append({"check": "sound/cut-on-beat", "sheetGrid": [round(float(b), 3) for b in beats], "gridKind": "onset" if trust == "low" else "beat",
                           "cutsJudged": n_judged, "cutsOnGrid": n_on})
    hs = hits(film)
    times = [h["picture"] for h in hs]
    # A hit on the declared reveal, or on the drop's measured rise (music peakAt lands the rise there), is on time by
    # definition: the music map's bar line may sit a few frames from the rise it measured.
    import sound_checks as _sc
    from film import declared_reveal as _dr
    on_time = []
    r = _dr(film)
    if r:
        on_time.append(r[0])
    try:
        _d = _sc.bed_drop(film.sound["clips"], film.seconds)
        if _d and not _d.get("none") and _d.get("t") is not None:
            on_time.append(float(_d["t"]))
    except Exception:  # noqa: BLE001  no drop: nothing to add
        pass
    # An effect whose role is "lead-in" (a whoosh, a swell, a riser: media add measures its rise to the peak, or the
    # media record names the role) leads into its change: it follows the motion it carries, not a beat.
    for h in (hs if judged and clock else []):  # a bed system's hits follow the picture, not the beat
        if lead_in(h.get("src") or ""):
            continue
        if in_texture(times, h["picture"]):
            continue
        if any(abs(h["picture"] - t) <= tol + 1 / film.fps for t in on_time):
            continue
        b = nearest(beats, h["picture"])
        # A stepped system (12 fps: Riso, Cutout) shows a change on its next step, so its hit waits for it: one step late.
        from sound_checks import step_frames
        late = step_frames(film.system) / film.fps if film.system else 0
        if not -tol <= h["picture"] - b <= tol + late:
            out.append(finding("sound/hit-on-beat", "warning", h["picture"], h["picture"],
                               {"hitAt": round(h["picture"], 3), "nearestBeat": round(b, 3), "offFrames": round((h["picture"] - b) * film.fps, 1)},
                               {"offFrames": 1}, f"Move the picture event and its hit onto the nearest beat ({b:.3f} s). For an entrance, build the block with landOn (from scene/blocks): landOn(ctx, <beat>, (at, c) => B.<block>({{ ..., at }}, c)) makes it arrive on that beat; at: <beat> - ctx.dur.enter arrives off the beat (a slide 3 to 6 frames late, a grow or a fade up to 2 frames early).", node=h["id"]))
    # The drop: from the track alone (sound_checks.bed_drop: the music map's drops, else the track's own level), so the
    # same bed gives the same drop in every mix. It lands on an event: a cut, a hit, or two or more things cutting in.
    import sound_checks
    from film import picture_events
    from film import declared_reveal
    d = sound_checks.bed_drop(film.sound["clips"], film.seconds)
    entry = (((film.tokens or {}).get("direction") or {}).get("mix") or {}).get("entry")
    if d and (entry in ("section", "start", "swell") or d.get("mapDrop") is None):
        # A system that enters on a section or at the start does not place a drop; a track whose map holds no drop in
        # the part the film plays has none to place. Not judged.
        film.notes.append({"check": "sound/drop-on-change", "notJudged": "the drop", "why": f"the system's entry is {entry}" if entry in ("section", "start", "swell") else "the music map holds no drop in the part the film plays"})
        d = None
    if d and not d.get("none") and (d.get("riseDb") or 0) >= DROP_DB:
        at = d["t"]
        picks = [at] + [t for t in d.get("ties", []) if t != at]
        rv = declared_reveal(film)
        if rv is None:
            try:
                import reveal_energy
                r = reveal_energy.reveal(film, [h["picture"] for h in hs])
                rv = (film.t(r[1]), "detected: " + str(r[4])) if r else None
            except Exception:  # noqa: BLE001  a reveal that cannot be found is said below
                rv = None
        events = [film.t(f) for f in cuts(film)] + [h["picture"] for h in hs] + picture_events(film)
        target = [rv[0]] if rv else events
        best = min(((p, e) for p in picks for e in target), key=lambda pe: abs(pe[0] - pe[1]), default=None)
        off = None if best is None else round((best[0] - best[1]) * film.fps, 1)
        landed = best is not None and abs(best[0] - best[1]) <= tol
        film.notes.append({"check": "sound/drop-on-change", "drop": round(at, 3), "riseDb": d.get("riseDb"), "from": d.get("source"),
                           "against": f"the reveal at {rv[0]:.2f} s ({rv[1]})" if rv else "the nearest cut, hit or entrance",
                           "nearest": None if best is None else round(best[1], 3), "offFrames": off, "lands": landed})
        if not landed:
            what = f"the reveal ({rv[0]:.2f} s, {rv[1]})" if rv else "any cut, hit or entrance"
            move = (f"move the track so the drop lands on the reveal: music({{ align: {{ track: <the drop's track time>, film: {rv[0]:.3f} }} }}), "
                    f"or move the reveal to {at:.3f} s") if rv else "put the film's biggest change (a cut, the reveal, a hit) on it"
            out.append(finding("sound/drop-on-change", "warning", min(at, best[1]) if best else at, max(at, best[1]) if best else at,
                               {"dropAt": round(at, 3), "riseDb": d.get("riseDb"), "target": None if best is None else round(best[1], 3),
                                "offFrames": off, "against": "reveal" if rv else "events", "dropFrom": d.get("source"),
                                **({"mapDrop": d["mapDrop"]} if d.get("mapDrop") is not None else {})},
                               {"offFrames": 1},
                               f"The drop ({at:.3f} s, the bed's own level) misses {what} by {abs(off or 0):.0f} frames: {move}."))
    return [lower_for_grid(f, trust, issues) if f["check"] != "sound/drop-on-change" else f for f in out]
