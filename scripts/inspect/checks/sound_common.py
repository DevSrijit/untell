"""Shared sound facts for the sound checks: the music clip, its beat grid in film time, the hits and the cuts."""
import json

import numpy as np

from film import ROOT, Skip

CUT_SHARE = 0.30


def music(film):
    if not film.sound.get("hasSound"):
        raise Skip("the film has no sound")
    m = [c for c in film.sound["clips"] if c.get("fileKind") == "music"]
    if not m:
        raise Skip("the film has no music")
    main = max(m, key=lambda c: (c.get("until") or film.seconds) - c["at"])
    # A duck splits the bed into clips of one file (<bed>-duck<k>, <bed>-after<k>), each on the same track clock. The
    # bed is all of them: one clip from the first entry to the last end, on the first clip's clock, so the grid is
    # the one beats() gives the scene over the whole film (one clip alone gave a grid that starts at 8.1 s, or stops).
    import re
    root = lambda c: re.split(r"-(?:duck|after)\d+", c["id"])[0]  # noqa: E731
    parts = [c for c in m if c["src"] == main["src"] and root(c) == root(main)]
    if len(parts) < 2:
        return main
    first = min(parts, key=lambda c: c["at"])
    return {**first, "id": root(main), "until": max((c.get("until") or film.seconds) for c in parts)}


def film_time(clip, track_t):
    return clip["at"] + track_t - (clip.get("from") or 0)


def track_time(clip, film_t):
    return film_t - clip["at"] + (clip.get("from") or 0)


def grid(film, clip, key="beats"):
    """The beat grid (or "downbeats") of a music clip in film time. The music map (assets/media/<track>/music.json) comes
    first: it is the grid that beats() gives a scene and that the render's sound checks read, so the scene, the render
    and the mix are held to one grid. (On Pop, Courtside and Graphite the hyperframes beats of the file sat a third to a
    half beat from the map's, and every event the scene put on the map's beats read 4-5 frames off.) Without a map:
    hyperframes beats on the file (detect.ts)."""
    m = None
    try:
        m = json.loads(media_path(clip["src"].split("/")[0] + "/music.json").read_text())
    except (OSError, ValueError):
        pass
    ts = (m or {}).get(key) or film.sound["beats"].get(clip["src"], {}).get(key, [])
    end = clip.get("until") or film.seconds
    return [film_time(clip, t) for t in ts if clip["at"] - 1e-6 <= film_time(clip, t) <= end + 1e-6]


def hits(film):
    """Effects: each with its peak time in the film and its picture time: the change time on the frame grid (onGrid in
    context.ts), one frame before the peak, since the hit block lands the peak on the first frame that shows the change
    (src/system/scene/blocks/sound.ts). A hit at a beat therefore has its picture 0 to 1 frame before that beat."""
    out = []
    for c in film.sound.get("clips", []):
        if c.get("fileKind") != "sfx" or c.get("peak") is None:
            continue
        start = c["at"] - (c.get("from") or 0)
        out.append({**c, "peakAt": start + c["peak"], "picture": start + c["peak"] - 1 / 30})
    return sorted(out, key=lambda h: h["picture"])


def cuts(film):
    """Cuts: cuts.cut_frames on the film's small grey frames, the one cut function the review sheet uses too (a whole
    frame change that is a spike, or a shot change of a subject on one ground, read by region). Cached."""
    if getattr(film, "_cuts", None) is None:
        from cuts import cut_frames
        film._cuts = cut_frames(film.grey)
    return film._cuts


def grid_trust(clip):
    """How far the music clip's beat grid can be trusted: (level, issues) from its music map
    (assets/media/<track>/music.json, scripts/music_map.py grid_trust). Without a map or a trust value: medium."""
    p = media_path(clip["src"].split("/")[0] + "/music.json")
    try:
        m = json.loads(p.read_text())
    except (OSError, ValueError):
        return "medium", ["no music map for this track"]
    return m.get("gridTrust", "medium"), m.get("gridIssues", ["the music map has no grid trust: prepare the track's music map again"])


def lower_for_grid(f, level, issues):
    """A grid rule's finding on a low-trust grid: a warning at most, with why in its fix and its measure."""
    f = dict(f)
    f["measured"] = {**f["measured"], "gridTrust": level} if isinstance(f.get("measured"), dict) else f.get("measured")
    if level == "low":
        f["severity"] = "warning" if f["severity"] == "error" else f["severity"]
        f["fix"] += f" (This track's beat grid is unreliable: {'; '.join(issues)}. Check by ear.)"
    return f


def media_path(src):
    from media_paths import media_file
    return media_file(src)


def in_texture(times, t, gap=0.35, size=3):
    """True when t is in a dense run of hits (typing ticks): at least `size` hits each within `gap` s of the next."""
    ts = sorted(times)
    i = ts.index(t)
    a = i
    while a > 0 and ts[a] - ts[a - 1] <= gap:
        a -= 1
    b = i
    while b + 1 < len(ts) and ts[b + 1] - ts[b] <= gap:
        b += 1
    return b - a + 1 >= size


def nearest(grid_, t):
    if not grid_:
        return None
    g = np.asarray(grid_)
    return float(g[np.abs(g - t).argmin()])
