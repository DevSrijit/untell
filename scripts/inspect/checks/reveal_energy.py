"""reveal-energy: the film's key reveal sits on one of the track's loudest bars, not on a dip.

The bars: the music map's bars and their loudness (music.json, the bars beats() gives a scene), those the film plays
at least 1 s of; without a map, hyperframes downbeats and the level of the file.
The reveal: the one the scene declares (an anchor node with the id "reveal", or a terminal's result line), else the
film's largest entrance in its last third (what cuts in within 3 frames, by area: a typed letter is not a reveal). The reveal's bar (the last bar that starts by a quarter second after the reveal) must be within 3 dB of the loudest bar played, and the bed
must not drop more than 3 dB from the bar before.
A reveal on a drop's measured rise (the map's drop `at`, where music({ peakAt }) puts it; within one frame) opens the
bar that the rise starts: the first map bar that starts within about one beat (1.25) after the rise. The map's bar line can sit a
beat after the rise it measured (a guessed bar start), and the bar before the line is then the quiet one before the drop.
"""
import json

from audio import level, pcm
from film import Skip, finding
from sound_common import film_time, hits, media_path, music, track_time

NEAR_DB = 3.0


def reveal(film, hit_times=()):
    """The film's reveal as (area, frame, key, text, how). The one the scene declares comes first
    (film.declared_reveal: an anchor "reveal", or a terminal's result line). Else the largest entrance in the last
    third of the film (film.entrance_groups: what cuts in within 3 frames, by area, so a typed letter or one small
    label is not a reveal). Else, for a film with nothing late, the largest entrance after the first second."""
    from film import declared_reveal, entrance_groups
    # A UI state that changes (a selected row's text in the selected colour, an active tab's label: node `state`) is
    # not an entrance of content: a moving selection never counts as the reveal.
    from film import state_nodes
    stated = state_nodes(film)
    groups = [g for g in entrance_groups(film) if g["f"] >= film.fps]
    for g in groups:
        g["keys"] = [k for k in g["keys"] if k.split(":", 1)[-1] not in stated] or g["keys"]
    groups = [g for g in groups if any(k.split(":", 1)[-1] not in stated for k in g["keys"])]
    def describe(g):
        texts = [x[3] for x in g["items"] if x[1] == "text" and x[3]]
        # The text that reveals is the largest that enters (a chart's labels enter with the bar they name: the reveal is
        # the result line, not the first label); by its ink's height.
        tx = sorted((x for x in g["items"] if x[1] == "text"), key=lambda x: -(x[2][3] - x[2][1]))
        key = tx[0][0] if tx else next((k for k in g["keys"] if k.startswith("t:")), g["keys"][0])
        return (g["area"], g["f"], key.split(":", 1)[1], " / ".join(texts)[:40] or key.split(":", 1)[1])
    dec = declared_reveal(film)
    if dec:
        f = round(dec[0] * film.fps)
        near = [g for g in groups if abs(g["f"] - f) <= 2]
        if near:
            return (*describe(max(near, key=lambda g: g["area"])), dec[1])
        return (0.0, f, "reveal", "(declared)", dec[1])
    late = [g for g in groups if g["f"] >= film.n * 2 / 3]
    pool = late or groups
    if not pool:
        return None
    return (*describe(max(pool, key=lambda g: g["area"])), "the largest entrance in the last third" if late else "the largest entrance after 1 s")


def map_bars(clip, a0, a1):
    """(bar start, LUFS) of the bars that the film plays at least 1 s of, from the music map (assets/media/<track>/
    music.json, the bars that beats() gives a scene), or None without a map."""
    p = media_path(clip["src"].split("/")[0] + "/music.json")
    try:
        m = json.loads(p.read_text())
    except (OSError, ValueError):
        return None
    bars, lufs = m.get("bars") or [], m.get("barLufs") or []
    ends = bars[1:] + [m.get("duration", bars[-1] + 2 if bars else 0)]
    return [(b, l) for b, e, l in zip(bars, ends, lufs) if min(e, a1) - max(b, a0) >= 1.0 and l > -70]


def rise_bar(clip, lv, tt, fps, step=0):
    """The index in lv of the bar that a drop's measured rise at track time tt opens, or None when no measured rise
    of the map is within one frame of tt (and one frame step more in a system that moves on a step: Riso shows a
    stamp up to two frames after it is asked)."""
    try:
        m = json.loads(media_path(clip["src"].split("/")[0] + "/music.json").read_text())
    except (OSError, ValueError):
        return None
    beat = 60.0 / (m.get("bpm") or 120)
    tol = 1.0 / fps + (1.0 / step if step else 0) + 0.004
    if not any(d.get("at") is not None and abs(d["at"] - tt) <= tol for d in m.get("drops") or []):
        return None
    # A beat and a quarter: the grid's beat drifts a little from the measured rise (a rise 1.02 beats before its bar).
    return next((i for i, (b, _) in enumerate(lv) if tt - 0.25 <= b <= tt + 1.25 * beat), None)


def check(film):
    clip = music(film)
    # The bars come from the music map: when the map marks its grid low trust, the reveal's bar is a guess too (an
    # agent's Kinetic film: the drop check put the bar one beat off). Not judged then.
    from sound_common import grid_trust
    trust, issues = grid_trust(clip)
    if trust == "low":
        raise Skip("not judged: the grid is not trusted (" + "; ".join(issues) + ")")
    rv = reveal(film, [h["picture"] for h in hits(film)])
    if not rv:
        raise Skip("no text enters after the first second")
    a0, a1 = track_time(clip, clip["at"]), track_time(clip, clip.get("until") or film.seconds)
    lv = map_bars(clip, a0, a1)
    if lv is None:
        # No music map: the bars from hyperframes downbeats and their level measured on the file.
        beats = film.sound["beats"].get(clip["src"], {})
        bars = [b for b in (beats.get("downbeats") or beats.get("beats", [])[::4]) if a0 - 2.5 <= b <= a1]
        if len(bars) < 3:
            raise Skip("no bar grid in the part the film plays")
        s = pcm(str(media_path(clip["src"])))
        lv = [(b, level(s, b, b2)) for b, b2 in zip(bars, bars[1:]) if min(b2, a1) - max(b, a0) >= 1.0]
    if len(lv) < 2:
        raise Skip("under two bars in the part the film plays")
    t_rev = film.t(rv[1])
    tt = track_time(clip, t_rev)
    # A reveal set on a bar's first beat may show a few frames before it: a quarter second early still counts.
    idx = max([i for i, (b, _) in enumerate(lv) if b <= tt + 0.25], default=None)
    rise = rise_bar(clip, lv, tt, film.fps, int((film.tokens or {}).get("step") or 0))
    entry = ((((film.tokens or {}).get("direction") or {}).get("mix") or {}).get("entry"))
    if rise is not None and entry == "drop":
        # The system puts its drop on the reveal (direction mix.entry "drop", music({ peakAt })): the reveal is on the
        # measured drop, so asking for the loudest bar would contradict the system's own entry rule.
        film.notes.append({"check": "reveal-energy", "reveal": rv[3][:40], "at": round(t_rev, 2), "on": "the measured drop (the system's entry rule)"})
        return []
    if rise is not None:
        idx = rise
    if idx is None:
        raise Skip("the reveal comes before the first bar")
    loudest = max(v for _, v in lv)
    here = lv[idx][1]
    drop = lv[idx - 1][1] - here if idx > 0 else 0.0
    film.notes.append({"check": "reveal-energy", "reveal": rv[3][:40], "at": round(t_rev, 2), "how": rv[4], "barDb": round(here, 1), "loudestBarDb": round(loudest, 1)})
    if loudest - here > NEAR_DB or drop > NEAR_DB:
        return [finding("reveal-energy", "warning", t_rev, t_rev,
                        {"reveal": rv[3][:40], "revealFrom": rv[4], "barDb": round(here, 1), "loudestBarDb": round(loudest, 1), "dropFromBarBeforeDb": round(drop, 1),
                         "loudestBarAt": round(film_time(clip, max(lv, key=lambda x: x[1])[0]), 2)},
                        {"withinDb": NEAR_DB}, "Move the reveal onto one of the track's loudest bars, or enter the track so a loud bar lands on the reveal.", node=rv[2])]
    return []
