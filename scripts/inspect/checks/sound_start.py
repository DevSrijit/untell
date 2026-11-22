"""sound/hard-start: the music enters above its track's mean level on frame 0 with no rise.

The same rule the music block holds (src/system/scene/blocks/sound.ts, "An opening rise"): a bed that starts at the
film's start (0.05 s or earlier) above the track's mean level, with no fadeIn, in a system that does not move in
single frames (motion.frames.enter over 1), is a finding (warning) unless the scene asked for a hard start with
`fadeIn: 0`. The block adds a 0.15 s rise itself, so a film built with the block passes.
The track's level at the entry: its bar levels over the 1 s from the music node's `from` (the same sum as the
block's windowLevel in src/system/scene/beats.ts); its mean level: `lufs` in assets/media/<track>/music.json.
Note: the block drops `fadeIn: 0` from the node it makes, so the detector cannot tell a hard start asked on purpose
from one left by accident; until the node keeps it (`...(fadeIn !== undefined ? { fadeIn } : {})`), a deliberate
hard start in a film made before the block's rise also fires.
"""
import json
import math

from film import ROOT, Skip, finding
from media_paths import media_file



def window_level(m, start, seconds):
    """The track's level over a window, from its bar levels: the same sum as windowLevel in src/system/scene/beats.ts."""
    e = w = 0.0
    bars = m["bars"]
    for i, a in enumerate(bars):
        b = bars[i + 1] if i + 1 < len(bars) else m["duration"]
        ov = min(b, start + seconds) - max(a, start)
        if ov <= 0:
            continue
        lv = m["barLufs"][i]
        if lv > -70:
            e += ov * 10 ** (lv / 10)
            w += ov
    return 10 * math.log10(e / w) if w else m.get("lufs")


def check(film):
    if not film.sound.get("hasSound"):
        raise Skip("the film has no sound")
    music = [c for c in film.sound["clips"] if c.get("fileKind") == "music"]
    if not music:
        raise Skip("the film has no music")
    if ((film.tokens or {}).get("motion", {}).get("frames", {}) or {}).get("enter", 12) <= 1:
        raise Skip("the system moves in single frames: a hard start is its character")
    first = min(music, key=lambda c: c["at"])
    if first["at"] > 0.05 or "fadeIn" in first:
        return []  # a rise, or fadeIn: 0 asked on purpose
    name = first["src"].split("/")[0]
    mp = media_file(name + "/music.json")
    if not mp.exists():
        raise Skip(f"no music map for {name}")
    m = json.loads(mp.read_text())
    mean, entry = m.get("lufs"), window_level(m, first.get("from") or 0, 1.0)
    if mean is None or entry is None or entry <= mean:
        return []
    return [finding("sound/hard-start", "warning", 0, 0.15, {"entryLufs": round(entry, 1), "trackMeanLufs": mean}, {"rise": "fadeIn when the entry is above the mean"},
                    "Give the bed a fadeIn (the music block adds 0.15 s by itself), enter on a build, or set fadeIn: 0 to ask for a hard start.", node=first.get("id"))]
