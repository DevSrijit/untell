"""hit-over-bed: each effect stands out from the music at its moment, and has one transient.

Level: the effect's RMS over 0.1 s at its peak (from its file, times its volume) against the music's RMS over the
same 0.1 s (from the track, times the bed volume and its fades). Under +6 dB is a warning: the hit does not read.
Double transient: two attacks in the part of the effect file that plays, each within 6 dB of the loudest,
40 ms or more apart with a dip of 6 dB or more between them. A dense run (typing ticks) is judged as one texture.
The measure is sound_checks.masking (the bands that carry the hit), shared with sound/hit-over-bed and untell listen mix.
It also reports sound/effect-too-loud (sound_checks.check_effect_level) on the mix.
"""
import numpy as np

from audio import SR, db, level, pcm
from film import Skip, finding
from sound_common import hits, in_texture, media_path, track_time

OVER_DB = 6.0


def bed_gain(clip, t):
    """The bed's volume at film time t, with its linear fades."""
    v = clip.get("volume", 1)
    end = clip.get("until")
    if clip.get("fadeIn") and t < clip["at"] + clip["fadeIn"]:
        v *= max(0, (t - clip["at"]) / clip["fadeIn"])
    if clip.get("fadeOut") and end is not None and t > end - clip["fadeOut"]:
        v *= max(0, (end - t) / clip["fadeOut"])
    return v


def transients(x):
    hop = int(0.01 * SR)
    env = np.array([np.sqrt(np.mean(np.square(x[i:i + hop]))) + 1e-9 for i in range(0, max(1, len(x) - hop), hop)])
    d = 20 * np.log10(env)
    top = d.max()
    peaks = [i for i in range(1, len(d) - 1) if d[i] >= d[i - 1] and d[i] >= d[i + 1] and d[i] > top - 6]
    out = []
    for p in peaks:
        if out and (p - out[-1]) * 0.01 < 0.04:
            if d[p] > d[out[-1]]:
                out[-1] = p
            continue
        if out and d[out[-1]:p + 1].min() > min(d[out[-1]], d[p]) - 6:
            if d[p] > d[out[-1]]:
                out[-1] = p
            continue
        out.append(p)
    return [round(p * 0.01, 3) for p in out]


def check(film):
    """On the scene's mix (no current render): the shared masking measure and the effect level of
    scripts/inspect/sound_checks.py, the same functions that sound/* runs on a render and that untell listen mix uses."""
    if not film.sound.get("hasSound"):
        raise Skip("the film has no sound")
    if not hits(film):
        raise Skip("the film has no effects")
    import sound_checks
    nodes = film.sound["clips"]
    found, _ = sound_checks.check_hits(nodes, film.seconds)
    loud, _ = sound_checks.check_effect_level(nodes, film.seconds)
    out = []
    for f in found:
        f = dict(f)
        f["check"] = "sound/" + f["check"]  # the render's ids: one id per cause in both passes
        out.append(f)
    for f in loud:
        f = dict(f)
        f["check"] = "sound/effect-too-loud"
        out.append(f)
    return out
