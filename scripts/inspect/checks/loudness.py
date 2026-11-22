"""loudness: the mix at the system's target (tokens "direction.mix": lufs and range; -16 +/- 2 LUFS without it) integrated, true peak at most -1 dBTP, and each hit 0-2 frames after its picture.

Integrated loudness and true peak (advice only: the scene's mix is before the master, and untell master sets both;
on a mastered render, sound/mix-loudness and sound/true-peak hold the file to the target as errors): hyperframes audio on the mix (detect.ts mixes the audio nodes with ffmpeg;
the mix matches the Remotion renders within 0.1 LU). A system whose music level is 0 and that states no mix target skips the integrated rule.
Silence: exact digital silence for more than 0.5 s inside the film (not at its start or end) is a dropout,
except in a system with no music bed.
On a real render (sound/* ran), only the hit timing rule runs here.
Hit timing: the picture event is a visible change (over 0.02 % of the frame) 0 to 2 frames
before the hit's peak. A hit with no visible change within 6 frames has no cause. Typing ticks (a dense run) are skipped.
"""
import numpy as np

from film import Skip, finding
from sound_common import hits, in_texture

TARGET, RANGE, TRUE_PEAK = -16.0, 2.0, -1.0
EVENT_SHARE = 0.0002
SILENCE_MAX = 0.5


def appears(film, f):
    """A text that shows on frame f and not on the frame before (opacity 0.5): a label or a dimension's value that
    locks. It is a picture cause at any size: a 3-letter label at Schematic's label size changes under EVENT_SHARE of
    the frame, yet a viewer sees it land, and the system puts its tick there."""
    before = {t.get("node") for t in film.ink[f - 1] if t.get("opacity", 0) >= 0.5}
    return any(t.get("opacity", 0) >= 0.5 and t.get("node") not in before for t in film.ink[f])


def check(film):
    if not film.sound.get("hasSound"):
        raise Skip("the film has no sound")
    out = []
    # On a real render, sound/* measures loudness, true peak and silence; this check keeps only the hit timing.
    on_render = getattr(film, "render_checked", False)
    loud = {} if on_render else (film.sound.get("loudness") or {})
    level = ((film.tokens or {}).get("media", {}).get("music", {}) or {}).get("level", 1)
    lufs, tp = loud.get("lufsIntegrated"), loud.get("truePeakDb")
    target, rng = film.limits.get("lufs", TARGET), film.limits.get("lufsRange", RANGE)
    # The scene's mix is never the mastered file: untell master sets its level and limits its true peak after the
    # render. So the level and the true peak here are advice (they never fail the film), with what the master will do.
    master = f"Render the film, then run untell master on the render{f' --system {film.system}' if film.system else ''}: it brings the mix to {target} LUFS and limits the true peak to -1 dBTP."
    # A system with no music (Raw: plain clicks, near silence) plans its quiet mix: the render's pass says the same
    # (sound_checks.check_levels: no level finding for music "none").
    silent = (((film.tokens or {}).get("direction") or {}).get("mix") or {}).get("music") == "none"
    if lufs is not None and not silent and (level > 0 or (film.tokens or {}).get("direction", {}).get("mix")) and abs(lufs - target) > rng:
        out.append(finding("loudness", "advice", 0, film.seconds, {"lufs": lufs, "masterWillAddDb": round(target - lufs, 1), "file": "the scene's mix, before the master"},
                           {"target": target, "range": rng}, master))
    if tp is not None and tp > TRUE_PEAK:
        out.append(finding("loudness", "advice", 0, film.seconds, {"truePeakDb": tp, "file": "the scene's mix, before the master"}, {"max": TRUE_PEAK},
                           master + " If it reports that the limiter took over 4 dB, lower the loudest hit or the bed."))
    # Exact digital silence inside the film (a gap between clips), not at its very start or end. A system with no
    # music bed (music level 0, such as Raw) uses silence on purpose and skips this rule.
    from audio import SR, pcm
    x = pcm(film.sound["wav"]) if level > 0 and not on_render and film.sound.get("wav") else np.zeros(0, dtype=np.float32)
    silent = abs(x) < 1e-5
    hop = int(0.01 * SR)
    blocks = [bool(silent[i:i + hop].all()) for i in range(0, len(x) - hop, hop)]
    run, start = 0, 0
    for i, b in enumerate(blocks + [False]):
        if b:
            if run == 0:
                start = i
            run += 1
            continue
        if run * 0.01 > SILENCE_MAX and start > 0 and i < len(blocks):
            out.append(finding("loudness", "error", start * 0.01, i * 0.01, {"silence": round(run * 0.01, 2)}, {"max": SILENCE_MAX},
                               "Fill this gap: let the bed or room tone run under it; exact digital silence reads as a dropout."))
        run = 0
    hs = hits(film)
    times = [h["picture"] for h in hs]
    # The size of a change the check counts as a hit's picture cause, said in the fix: a small mark (a 24 px cross in
    # hairline) changes less than this, and the check then reads the nearest larger change instead.
    px = EVENT_SHARE * film.W * film.H
    size = f" A change counts when it covers {EVENT_SHARE:.2%} of the frame or more (about {px:.0f} px², a {px ** 0.5:.0f} x {px ** 0.5:.0f} px patch): a smaller mark is not seen as the cause."
    for h in hs:
        if in_texture(times, h["picture"]):
            continue
        pf = h["peakAt"] * film.fps
        near = [f for f in range(max(1, round(pf) - 6), min(film.n, round(pf) + 7)) if film.change[f] > EVENT_SHARE or appears(film, f)]
        if not near:
            out.append(finding("loudness", "warning", h["picture"], h["picture"], {"hit": h["src"], "visibleChange": 0}, {"withinFrames": 6},
                               "Give this hit a cause on screen (a cut, a landing, a click) or remove it." + size, node=h["id"]))
            continue
        # The picture: a visible change 0-2 frames before the peak. Without one, report the nearest change.
        if any(-0.5 <= pf - f <= 2.5 for f in near):
            continue
        ev = min(near, key=lambda f: abs(pf - f))
        out.append(finding("loudness", "error", h["picture"], h["picture"], {"peakAfterPictureFrames": round(pf - ev, 1), "pictureFrame": ev}, {"frames": [0, 2]},
                           "Move the hit so its peak lands 0-2 frames after the picture event (hit at = the event's time)." + size, node=h["id"]))
    return out
