"""Checks on the sound of a final render, as functions the detector can call. Each returns a list of findings:
  {check, severity: "error" | "warning", from, to, node?, measured, limit, fix}

Inputs are plain values, so a check needs no Film object:
  render   the final mp4 (or wav)
  nodes    the film's audio nodes (dicts: id, src, at, until, from, volume, fadeIn, fadeOut)
  changes  picture changes: a list of (time s, share of the frame that changed), e.g. from picture_changes()
  fps      frames a second (30)
The music map (assets/media/<track>/music.json, scripts/music_map.py) gives the beat grid. Levels, the drop,
onsets, true peak and silence are measured on the render itself, not read from the map, so a check never only
proves that a block agrees with itself.

CLI: python3 scripts/inspect/sound_checks.py <render.mp4> <nodes.json | capture.json> [--system <id>]
Needs ffmpeg and numpy only.
"""
import json
import re
import subprocess
import sys
import os
from pathlib import Path

import numpy as np
from functools import lru_cache

sys.path.insert(0, str(Path(__file__).resolve().parent))
from media_paths import extra_sounds, media_file  # noqa: E402

# The repository root, or the work tree that untell builds in a project (UNTELL_ROOT).
ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[2])
SR = 16000
CUT_SHARE = 0.30     # a cut: over 30 % of the frame changes in one frame
BIG_SHARE = 0.20     # a large picture change, for the drop and the onsets
OVER_DB = 6.0


def finding(check, severity, a, b, measured, limit, fix, node=None):
    f = {"check": check, "severity": severity, "from": round(float(a), 3), "to": round(float(b), 3), "measured": measured, "limit": limit, "fix": fix}
    if node:
        f["node"] = node
    return f


# ---------------------------------------------------------------- reading

def pcm(path, sr=SR, start=0.0, dur=None, channels=1, fmt="f32le"):
    """The decoded samples of a file (read only). The same file and arguments decode once a run."""
    from memo import stamp
    return _pcm(str(path), stamp(path), sr, start, dur, channels, fmt)


@lru_cache(maxsize=32)
def _pcm(path, _stamp, sr, start, dur, channels, fmt):
    # -vn: the sound alone; a render's video stream is not decoded.
    args = ["ffmpeg", "-loglevel", "error", "-ss", str(start), "-i", str(path), "-vn"]
    if dur is not None:
        args += ["-t", str(dur)]
    args += ["-ac", str(channels), "-ar", str(sr), "-f", fmt, "-"]
    raw = subprocess.run(args, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32 if fmt == "f32le" else np.int16)
    return x.reshape(-1, channels) if channels > 1 else x


def ebur128(path, start=0.0, dur=None, pre=None):
    """Integrated loudness, range and true peak by ffmpeg's EBU R128 meter (pre: filters before the meter). The same
    file (by its stamp) and arguments are measured once (memo.py)."""
    from memo import memo, stamp
    return memo("ebur128", [stamp(path), start, dur, pre], lambda: _ebur128(path, start, dur, pre))


def _ebur128(path, start=0.0, dur=None, pre=None):
    args = ["ffmpeg", "-nostats", "-ss", str(start), "-i", str(path), "-vn"]
    if dur is not None:
        args += ["-t", str(dur)]
    args += ["-af", (pre + "," if pre else "") + "ebur128=peak=true", "-f", "null", "-"]
    err = subprocess.run(args, capture_output=True, text=True).stderr
    tail = err[err.rfind("Summary:"):]
    get = lambda k: float(m.group(1)) if (m := re.search(k + r":\s+(-?[\d.]+|-inf)", tail)) and m.group(1) != "-inf" else None  # noqa: E731
    return {"lufs": get("I"), "lra": get("LRA"), "truePeak": get("Peak")}


def level_db(x, a, b, sr=SR):
    seg = x[max(0, int(a * sr)):max(0, int(b * sr))]
    return float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)) if len(seg) else -180.0


RISE_S = 2.0  # the rise of a drop: the level of the RISE_S after a time against the RISE_S before it


def rise_db(x, t, sr=SR):
    """The rise of the sound at t (seconds into x): the level of the RISE_S after t against the RISE_S before it. The one
    measure of a drop: the detector's drop (bed_drop) and the drop time that music({ peakAt }) places (the music map's
    `at`, scripts/music_map.py measured_rise) both read it, so a film placed on the map's drop passes the check."""
    return level_db(x, t, t + RISE_S, sr) - level_db(x, t - RISE_S, t, sr)


def picture_changes(path, fps=30, size=(54, 96)):
    """(time, share of the frame changed from the frame before) for every frame of a video."""
    w, h = size
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-vf", f"fps={fps},scale={w}:{h}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True, check=True).stdout
    fr = np.frombuffer(raw, dtype=np.uint8).reshape(-1, h, w).astype(np.int16)
    out = [(0.0, 0.0)]
    for i in range(1, len(fr)):
        out.append((i / fps, float(np.mean(np.abs(fr[i] - fr[i - 1]) > 24))))
    return out


def cuts_of(changes):
    c = [s for _, s in changes]
    return [changes[f][0] for f in range(1, len(c)) if c[f] > CUT_SHARE and c[f - 1] < c[f] / 3 and (f + 1 >= len(c) or c[f + 1] < c[f] / 3)]


class Facts(dict):
    """kind and peak of each sound file by its src ("<name>/<file>"); a track's prepared master.wav maps to the track."""

    def get(self, src, default=None):
        return super().get(src) or super().get(self.by_name.get(src.split("/")[0], ""), default)

    def __getitem__(self, src):
        v = self.get(src)
        if v is None:
            raise KeyError(src)
        return v


def facts():
    """kind, peak and role of each sound file, from src/system/media.gen.ts. The role "lead-in" marks an effect that
    rises into its moment (a whoosh, a swell, a riser: media add measures the rise, or the record names it)."""
    gen = (ROOT / "src/system/media.gen.ts").read_text()
    f = Facts({f"{m[1]}/{m[3]}": {"name": m[1], "kind": m[2], "duration": float(m[4]), "peak": float(m[5]), "role": m[6]}
               for m in re.finditer(r'"([^"]+)": \{ kind: "(sfx|music)", file: "([^"]+)", duration: ([\d.]+), peak: ([\d.]+)(?:[^\n]*?role: "([\w-]+)")?', gen)})
    for name, x in extra_sounds().items():  # the other media folders (media_paths.py)
        f.setdefault(f"{name}/{x['file']}", {"name": name, "kind": x["kind"], "duration": float(x["duration"]), "peak": float(x["peak"]), "role": x.get("role")})
    f.by_name = {v["name"]: k for k, v in f.items()}
    return f


def bed_of(nodes, seconds):
    """The film's bed. A duck splits it into clips of one file (<bed>-duck<k>, <bed>-after<k>, joined by crossfades):
    the bed is then the first clip, with every clip of its file in "_clips", so gain_at sums them at any time."""
    f = facts()
    # A room tone (music `roomTone`, ids <bed>-room<k>) is air under the bed, not the bed.
    beds = [n for n in nodes if f.get(n["src"], {}).get("kind") == "music" and not re.search(r"-room\d+$", n.get("id", ""))]
    if not beds:
        return None
    main = max(beds, key=lambda n: (n.get("until") or seconds) - n["at"])
    root = re.split(r"-(?:duck|after)\d+", main["id"])[0]
    clips = [n for n in beds if n["src"] == main["src"] and re.split(r"-(?:duck|after)\d+", n["id"])[0] == root]
    if len(clips) < 2:
        return main
    first = min(clips, key=lambda n: n["at"])
    return {**first, "until": max((n.get("until") or seconds) for n in clips), "_clips": clips}


def grid(node, key="beats"):
    """The bed's beat grid (or "downbeats", "bars") in film time, from its music.json."""
    p = media_file(node["src"].split("/")[0] + "/music.json")  # also for src ".../master.wav"
    if not p.exists():
        return []
    m = json.loads(p.read_text())
    end = node.get("until") or 1e9
    return [node["at"] + t - (node.get("from") or 0) for t in m[key] if node["at"] - 1e-6 <= node["at"] + t - (node.get("from") or 0) <= end + 1e-6]


def gain_at(n, t):
    if n.get("_clips"):
        return sum(gain_at({k: v for k, v in c.items() if k != "_clips"}, t) for c in n["_clips"])
    return _gain_at(n, t)


def _gain_at(n, t):
    v = n.get("volume", 1)
    end = n.get("until")
    if n.get("fadeIn") and t < n["at"] + n["fadeIn"]:
        v *= max(0, (t - n["at"]) / n["fadeIn"])
    if n.get("fadeOut") and end is not None and t > end - n["fadeOut"]:
        v *= max(0, (end - t) / n["fadeOut"])
    return v


# ---------------------------------------------------------------- checks

LEAD_F = 10  # how far back a cut's change may start (a grow, a cover, a stepped slide that lands as a cut)


def step_frames(system):
    """The frames of one step of a system that moves on a stepped grid (Riso and Cutout: "12 fps" in their motion),
    else 0: a change on the beat lands on the next step, up to one step late."""
    try:
        t = json.loads((ROOT / "systems" / system / "tokens.json").read_text())
        return 30 / 12 if "12 fps" in json.dumps(t.get("motion") or {}) else 0
    except Exception:  # noqa: BLE001
        return 0


def cut_on_beat(t, start, beats, drops, fps=30, step=0, reveal=None, end=None):
    """One rule for a cut against the beat grid, in both passes (the scene's mix, the render): the cut is on the beat
    when its frame or the frame its change starts on (`start`: a grow, a cover or a slide that lands as a cut starts
    on the beat its author put it on) is 0 to 1 frame after a beat, with one frame of slack each side and one step more
    in a system that moves on a stepped grid (`step` frames). A cut on the track's drop (`drops`: where music({ peakAt })
    puts it, a fact of the track even off the beat grid) is on time; so is a change that lands on a beat (`end`: a stepped
    slide that shows as a cut at its start). Returns (on, nearest beat, offset in frames)."""
    tol = 1 / fps + 0.004
    # A change that lands on the declared reveal within LEAD_F frames (a panel that covers the frame on the drop, a word
    # that grows into the ground on the beat) is judged where its author put it: at the reveal.
    times = {t, start} | ({end} if end is not None else set()) | ({reveal} if reveal is not None and 0 <= reveal - t <= LEAD_F / fps else set())
    b = float(beats[np.abs(np.asarray(beats) - t).argmin()])
    ok = lambda x, y: -tol <= x - y <= 1 / fps + tol + step / fps  # noqa: E731
    on = any(ok(x, float(beats[np.abs(np.asarray(beats) - x).argmin()])) for x in times) or any(abs(x - d) <= tol + 1 / fps for x in times for d in drops)
    return on, b, round((t - b) * fps, 1)


def change_start(changes, t, fps=30, floor=0.004):
    """The time the change that shows as a cut at t starts: the first of the frames before it that change (over `floor`
    of the frame), at most LEAD_F frames back."""
    i = int(round(t * fps))
    j = i
    while j - 1 >= 0 and i - (j - 1) <= LEAD_F and j - 1 < len(changes) and changes[j - 1][1] > floor:
        j -= 1
    return j / fps


def change_end(changes, t, fps=30, floor=0.004, step=0):
    """The time the change that shows as a cut at t lands: the last of the frames after it that still change, at most
    LEAD_F frames on (a stepped slide that starts as a cut and lands on its beat). A stepped system holds a frame or
    two between its steps: held frames inside one step do not end the change."""
    i = int(round(t * fps))
    j, k, held = i, i, 0
    while k + 1 < len(changes) and k + 1 - i <= LEAD_F:
        k += 1
        if changes[k][1] > floor:
            j, held = k, 0
        else:
            held += 1
            if held > int(np.ceil(step)):
                break
    return j / fps


def map_drops(node):
    """The music map's drops (their measured rise, `at`) in film time, inside the bed node's span."""
    p = media_file(node["src"].split("/")[0] + "/music.json")
    try:
        m = json.loads(p.read_text())
    except (OSError, ValueError):
        return []
    end = node.get("until") or 1e9
    return [node["at"] + (d.get("at") if d.get("at") is not None else d["t"]) - (node.get("from") or 0) for d in m.get("drops") or []
            if node["at"] <= node["at"] + (d.get("at") if d.get("at") is not None else d["t"]) - (node.get("from") or 0) <= end]


def cut_offsets(changes, nodes, fps=30, tol_frames=1, cut_times=None, step=0, reveal=None):
    """Each cut's offset to the nearest beat, in frames. A warning over `tol_frames` (plus 4 ms). cut_times: the
    detector's cuts (checks/cuts.py, the review sheet's too); without them, cuts_of on the render's changes."""
    bed = bed_of(nodes, changes[-1][0] if changes else 0)
    if not bed:
        return []
    g = np.asarray(grid(bed))
    if len(g) < 4:
        return []
    out = []
    end = bed.get("until") or (changes[-1][0] if changes else 0)
    for t in (cut_times if cut_times is not None else cuts_of(changes)):
        if not bed["at"] - 1 / fps <= t <= end + 1 / fps:  # no bed plays: no beat to miss
            continue
        on, b, off = cut_on_beat(t, change_start(changes, t, fps), g, map_drops(bed), fps, step, reveal, change_end(changes, t, fps, step=step))
        out.append({"cut": round(t, 3), "beat": round(b, 3), "offFrames": off, "on": on})
    return out


def check_cuts(changes, nodes, fps=30, mix=None, cut_times=None, system=None, reveal=None):
    """Cuts off the beat. Only for a "clock" system: a bed system may cut on the picture's own rhythm. A change at a beat
    shows on the first frame after it, so a cut 0 to 1 frame after its beat is on it; one frame of slack each side."""
    if (mix or {}).get("music", "clock") != "clock":
        return []
    return [finding("cut-on-beat", "warning", c["cut"], c["cut"], c, {"offFrames": 1}, "Move this cut onto the nearest beat: take its time from beats().onBeat().")
            for c in cut_offsets(changes, nodes, fps, cut_times=cut_times, step=step_frames(system) if system else 0, reveal=reveal) if not c.pop("on")]


def render_drop(x, seconds, sr=SR):
    """The render's drop: the time where the 2 s after are loudest against the 2 s before (not out of silence).
    Only a fallback: the whole mix holds the effects too, so a louder run of ticks before a drop moves this pick
    from one render to the next. bed_drop() reads the track itself."""
    best = None
    for t in np.arange(1.0, seconds - 1.0, 1 / 30):
        before, after = level_db(x, t - 2, t, sr), level_db(x, t, t + 2, sr)
        if before < -45:
            continue
        rise = after - before
        if best is None or rise > best[1]:
            best = (float(t), rise)
    if best is None:
        return None
    # Refine to the steepest 50 ms step within 0.5 s of it.
    t0 = best[0]
    steps = [(t, level_db(x, t, t + 0.05, sr) - level_db(x, t - 0.05, t, sr)) for t in np.arange(t0 - 0.5, t0 + 0.5, 0.01)]
    return {"t": round(max(steps, key=lambda s: s[1])[0], 3), "riseDb": round(best[1], 1)}


def bed_drop(nodes, seconds):
    """The drop of the film's bed, measured on the bed's own file through its node (its entry, gain and fades), so
    the same bed gives the same drop in every render, and the effects of the mix (a run of ticks before the drop)
    do not move it. Not read from the music map: music({ peakAt }) places the track by the map's drops, and a check
    that read them back would only prove that the block agrees with itself (an agent's Courtside film: the map put the
    drop one beat late). The rise: the 2 s after against the 2 s before, both inside the part the film plays and clear of
    the fades, not out of silence, on every frame (rise_db: the one measure, which the music map's drop times use too).
    Ties: every other peak of the rise within TIE_DB of the largest (the drop lands on an event when any of them does). The map's drop, when the map has one in the part the film plays, is reported beside it, with how far the
    two disagree. None without a bed."""
    bed = bed_of(nodes, seconds)
    if not bed:
        return None
    frm, at = bed.get("from") or 0, bed["at"]
    end = min(bed.get("until") or seconds, seconds)
    x = pcm(media_file(bed["src"]))
    # The track's own drop: a duck the scene made (hit's dip, music({ duck })) is not the track, and the bed coming back
    # from it is not a drop (Mark: a 13.5 dB rise after a 12.4 dB duck). A ducked bed reads at its full volume wherever
    # one of its clips plays.
    clips = bed.get("_clips")
    vmax = max((c.get("volume", 1) for c in clips), default=1) if clips else None
    def unducked(t):
        if not clips:
            return gain_at(bed, t)
        return vmax if any(c["at"] <= t <= (c.get("until") or seconds) for c in clips) else 0.0
    cands = []
    # Both 2 s windows inside the part the film plays, after the bed's fade-in (a fade-in is a rise of the mix, not of
    # the track) and before its fade-out.
    lo = at + max(2.0, (bed.get("fadeIn") or 0) + 2.0)
    hi = end - max(2.0, bed.get("fadeOut") or 0)
    for t in np.arange(lo, hi, 1 / 30):
        tt = t - at + frm
        g0, g1 = max(1e-6, unducked(t - 1)), max(1e-6, unducked(t + 1))
        before = level_db(x, tt - RISE_S, tt) + 20 * np.log10(g0)
        if before < -45:
            continue
        cands.append((float(t), rise_db(x, tt) + 20 * np.log10(g1 / g0)))
    if not cands:
        return None
    best = max(cands, key=lambda c: c[1])
    # Ties: the other peaks of the rise curve (a frame at least as high as the frames beside it) within TIE_DB of the
    # largest. A drop whose level steps up twice in a second makes a plateau with two peaks, and the measure cannot
    # tell them apart (an agent's track: 7.9 dB at two times 0.4 s apart).
    ties = []
    for i, (t, r) in enumerate(cands):
        if t == best[0] or r < best[1] - TIE_DB:
            continue
        if (i == 0 or r >= cands[i - 1][1]) and (i + 1 == len(cands) or r >= cands[i + 1][1]):
            ties.append(t)
    out = {"t": round(best[0], 3), "riseDb": round(best[1], 1), "source": "the bed's own file", "ties": [round(t, 3) for t in ties]}
    p = media_file(bed["src"].split("/")[0] + "/music.json")
    try:
        drops = json.loads(p.read_text()).get("drops") or []
    except (OSError, ValueError):
        drops = []
    inside = [d for d in drops if frm + 0.5 <= d["t"] <= frm + (end - at) - 0.5]
    if inside:
        best_map = max(inside, key=lambda d: d.get("rise", 0))
        m = at + (best_map.get("at") if best_map.get("at") is not None else best_map["t"]) - frm  # drops[].at: the measured rise
        out["mapDrop"] = round(m, 3)
        out["mapDisagreesS"] = round(m - best[0], 3)
    return out


TIE_DB = 1.0
# The fix sentence of sound/effect-too-loud: the effect rule as src/system/scene/blocks/sound.ts states it.
EFFECT_FIX = "Lower this effect until its peak plus the bed's peak at that moment stay at or under -1 dBTP, at volume 1 at most (the effect rule, `sound.ts`). If it is then masked, do not raise it: leave `hit`'s `duck` at its default, or give `music({ duck: [{ at, depth, length }] })`."


def check_drop(x, changes, seconds, fps=30, sr=SR, mix=None, nodes=None, events=None, reveal=None):
    """The drop against the picture, within one frame (plus 4 ms). With `reveal` ((seconds, how): the scene's declared
    or detected reveal), the drop is judged against the reveal alone, as the picture pass judges it. Without it: a
    large change (BIG_SHARE of the frame, a cut or a pan), or an entrance event (events: cuts, and times where two or
    more elements cut in at once, or one large one)."""
    if (mix or {}).get("music") == "none":  # no music: a rise is a planned click, not a drop
        return [], None
    d = bed_drop(nodes or [], seconds) if nodes else None
    if d is None:
        d = render_drop(x, seconds, sr)
        if d:
            d["source"] = "the render's level"
    if not d or d.get("none") or (d.get("riseDb") or 0) < 6:
        return [], d
    # Not judged: a system that enters on a section, at the start or on a swell (its loudest bar lands on the reveal, and a
    # system such as Title stops the bed there: no drop is asked for), or a track whose map holds no drop in the part the
    # film plays (the picture pass says the same).
    if (mix or {}).get("entry") in ("section", "start", "swell") or (d.get("source") == "the bed's own file" and d.get("mapDrop") is None):
        d["notJudged"] = "the system's entry is " + str((mix or {}).get("entry")) if (mix or {}).get("entry") in ("section", "start", "swell") else "the music map holds no drop"
        return [], d
    big = [reveal[0]] if reveal else [t for t, s in changes if s >= BIG_SHARE] + list(events or [])
    # The drop and the rises tied with it: it lands when any of them sits on a change or an entrance.
    picks = [d["t"]] + [t for t in d.get("ties", []) if t != d["t"]]
    best = None
    for p in picks:
        near = min(big, key=lambda t: abs(t - p)) if big else None
        if near is not None and (best is None or abs(p - near) < abs(best[0] - best[1])):
            best = (p, near)
    near = best[1] if best else None
    off = None if best is None else round((best[0] - best[1]) * fps, 1)
    d.update({"nearestChange": None if near is None else round(near, 3), "offFrames": off, "against": f"the reveal ({reveal[1]})" if reveal else "the biggest changes"})
    if near is None or abs(best[0] - best[1]) > 1 / fps + 0.004:
        what = f"the reveal at {reveal[0]:.2f} s" if reveal else "any large change"
        return [finding("drop-on-change", "warning", d["t"], d["t"], d, {"offFrames": 1},
                        f"The drop ({d['t']:.3f} s) misses {what} by {abs(off or 0):.0f} frames: land them together with music({{ align: {{ track: <the drop's track time>, film: <the reveal> }} }}), or move the reveal onto the drop.")], d
    return [], d


# The bands of the masking measure (listen mix uses the same function and bands): octaves from 60 Hz to 16 kHz, read at
# 44.1 kHz so the top octave is there. A band counts as carrying the hit when it holds the hit's energy within
# CARRY_DB of its strongest band. Octaves, not wider bands: a wide band adds the bed's energy beside the hit's.
NAMED_BANDS = [("60-120 Hz", 60, 120), ("120-250 Hz", 120, 250), ("250-500 Hz", 250, 500), ("0.5-1 kHz", 500, 1000),
               ("1-2 kHz", 1000, 2000), ("2-4 kHz", 2000, 4000), ("4-8 kHz", 4000, 8000), ("8-16 kHz", 8000, 16000)]
SR_BANDS = 44100
CARRY_DB = 10.0


def bands_of(x, sr=SR_BANDS):
    """Energy in each named band (dB) of a segment."""
    if len(x) < 64:
        return {n: -120.0 for n, _, _ in NAMED_BANDS}
    S = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    return {n: float(10 * np.log10(S[(f >= lo) & (f < hi)].sum() + 1e-12)) for n, lo, hi in NAMED_BANDS}


def masking(hit_seg, bed_seg, sr=SR_BANDS):
    """Is the hit heard over the bed? Both segments are 0.1 s at the hit's peak, at their volumes. The ear hears a hit
    in any band where it stands clear of the bed, so the margin is the largest one among the bands that carry the hit
    (within CARRY_DB of its strongest band). A click that is weak in the bass, where the bed is loud, but strong in
    the presence band, where the bed is quiet, is heard. Masked: that margin under OVER_DB.
    This is the one masking measure: untell check (sound/hit-over-bed, hit-over-bed) and untell listen mix use it."""
    hb, bb = bands_of(hit_seg, sr), bands_of(bed_seg, sr)
    top = max(hb.values())
    carry = [k for k in hb if hb[k] >= top - CARRY_DB]
    over = {k: hb[k] - bb[k] for k in hb}
    best = max(carry, key=lambda k: over[k])
    main = max(hb, key=hb.get)
    return {"hitBandsDb": {k: round(v, 1) for k, v in hb.items()}, "bedBandsDb": {k: round(v, 1) for k, v in bb.items()},
            "overBedDb": {k: round(v, 1) for k, v in over.items()}, "mainBand": main, "overInMainBandDb": round(over[main], 1),
            "carryBands": carry, "heardIn": best, "overInBandDb": round(over[best], 1), "masked": bool(round(over[best], 1) < OVER_DB)}


# The band tables that `hit` reads (media.gen.ts SOUNDS bands, music.gen.ts bands), so the block sets its duck by the
# band where the bed covers the hit, as masking() judges it. The values are bands_of() of a 0.1 s window at volume 1.
BAND_HOP = 0.025     # music.gen.ts bands: one frame each 0.025 s from the file's start
BAND_LOW = -30       # a frame's value is clamped to BAND_LOW .. BAND_LOW + 93 dB and written as one character


def fx_bands(path, peak):
    """An effect's bands at its peak (the 0.1 s window that masking() reads), dB, one decimal."""
    x = pcm(path, sr=SR_BANDS)
    w, p = int(0.1 * SR_BANDS), int(peak * SR_BANDS)
    return [round(v, 1) for v in bands_of(x[max(0, p - w // 2): p + w // 2]).values()]


LEAD_RISE = 0.15  # media add: an effect that takes this long (s) or longer to rise to its peak is a lead-in


def fx_rise(path):
    """An effect's rise: seconds from the first 10 ms within 10 dB of its loudest 10 ms to that loudest 10 ms. A click
    or a stamp rises in a few ms; a swell or a riser takes a quarter second or more (media.ts LEAD_RISE)."""
    x = pcm(path, sr=16000)
    hop = 160
    env = np.array([np.sqrt(np.mean(np.square(x[i:i + hop]))) + 1e-9 for i in range(0, max(1, len(x) - hop), hop)])
    d = 20 * np.log10(env)
    pk = int(np.argmax(d))
    return round((pk - int(np.argmax(d >= d[pk] - 10))) * 0.01, 3)


SILENT = 8 / 32768  # -72 dBFS: the render's digital-silence rule (16-bit samples within 8 steps of zero)


def lead_silence(path):
    """Seconds of digital silence at the start of a file: every sample under SILENT, the level the render's
    digital-silence rule reads as silence (a track that opens under it plays as a dropout in the mp4)."""
    x = pcm(path, sr=SR_BANDS)
    loud = np.flatnonzero(np.abs(x) >= SILENT)
    return round(float(loud[0]) / SR_BANDS, 3) if len(loud) else round(len(x) / SR_BANDS, 3)


def track_bands(path):
    """A track's bands each BAND_HOP s (the 0.1 s window centred there), whole dB, as text: 8 characters a frame,
    chr(33 + dB - BAND_LOW). beats.ts bandsAt reads it."""
    x = pcm(path, sr=SR_BANDS)
    w = int(0.1 * SR_BANDS)
    out = []
    for k in range(int(len(x) / SR_BANDS / BAND_HOP) + 1):
        c = int(round(k * BAND_HOP * SR_BANDS))  # by the frame's time: a whole-sample hop drifts off it
        row = bands_of(x[max(0, c - w // 2): c + w // 2]) if c + w // 2 <= len(x) else {n: -120.0 for n, _, _ in NAMED_BANDS}
        out.append("".join(chr(33 + min(93, max(0, int(round(row[n])) - BAND_LOW))) for n, _, _ in NAMED_BANDS))
    return "".join(out)


def _runs(times, gap=0.5, size=3):
    """Dense runs of hits (typing ticks: `size` or more, each within `gap` s of the next) as lists of indexes into the
    sorted times; every other hit is a run of one."""
    order = sorted(range(len(times)), key=lambda i: times[i])
    runs, cur = [], []
    for i in order:
        if cur and times[i] - times[cur[-1]] > gap:
            runs.append(cur)
            cur = []
        cur.append(i)
    if cur:
        runs.append(cur)
    out = []
    for r in runs:
        out += [r] if len(r) >= size else [[i] for i in r]
    return out


def check_hits(nodes, seconds):
    """Each hit over the bed at its peak (masking(): the bands that carry the hit), and double transients. A dense run
    of hits (typing ticks) is judged as one texture: one finding when the median of its margins is under OVER_DB.
    A texture still has to be heard: a system that asks for a tick on each key asks to hear it."""
    f = facts()
    bed = bed_of(nodes, seconds)
    bed_x = pcm(media_file(bed["src"]), sr=SR_BANDS) if bed else None
    out, rows, doubled = [], [], set()
    sfx = [n for n in nodes if f.get(n["src"], {}).get("kind") == "sfx"]
    w = int(0.1 * SR_BANDS)
    cache = {}
    for n in sfx:
        k = f[n["src"]]
        if n["src"] not in cache:
            cache[n["src"]] = pcm(media_file(n["src"]), sr=SR_BANDS)
        fx = cache[n["src"]]
        start = n["at"] - (n.get("from") or 0)
        peak_film = start + k["peak"]
        # The part the node plays: from `from` for as long as it plays (hit's `part`), not the whole file.
        a0 = int((n.get("from") or 0) * SR_BANDS)
        a1 = a0 + int((n["until"] - n["at"]) * SR_BANDS) if n.get("until") is not None else len(fx)
        tr = transients(fx[a0:a1], sr=SR_BANDS)
        part = (n["src"], a0, a1)
        if len(tr) > 1 and part not in doubled:  # once a part of a file: the file is the fault, not each use
            doubled.add(part)
            out.append(finding("hit-double", "warning", peak_film, peak_film, {"transients": tr[:4]}, {"max": 1},
                               "Use an effect with one attack, or trim the file to its main transient.", node=n["id"]))
        p = int(k["peak"] * SR_BANDS)
        hseg = fx[max(0, p - w // 2): p + w // 2] * n.get("volume", 1)
        hit_db = float(20 * np.log10(np.sqrt(np.mean(hseg ** 2)) + 1e-9)) if len(hseg) else -180.0
        row = {"id": n["id"], "peakAt": round(peak_film, 3), "hitDb": round(hit_db, 1)}
        if bed is not None and bed["at"] <= peak_film <= (bed.get("until") or seconds):
            tt = peak_film - bed["at"] + (bed.get("from") or 0)
            g = gain_at(bed, peak_film)
            bseg = bed_x[max(0, int(tt * SR_BANDS) - w // 2): int(tt * SR_BANDS) + w // 2] * g
            if len(bseg) >= w // 2 and g > 0:
                m = masking(hseg, bseg)
                bed_db = float(20 * np.log10(np.sqrt(np.mean(bseg ** 2)) + 1e-9))
                row.update({"bedDb": round(bed_db, 1), "overBedDb": round(hit_db - bed_db, 1), "overBedInBandDb": m["overInBandDb"],
                            "heardIn": m["heardIn"], "masked": m["masked"]})
        rows.append(row)
    judged = [r for r in rows if "masked" in r]
    # How far each hit may rise before it peaks over the music's loudest moment (effect-too-loud's cap): a fix that
    # says "raise it" must not break that cap (an agent's Courtside film raised its impact to 1.8 and passed the music by 9.6 dB).
    _, levels = check_effect_level(nodes, seconds)
    # effect-too-loud also fails any effect over -0.1 dBFS: the room is the smaller of the two caps, so no advice here
    # can raise a hit into a finding there (an agent's Spec film: listen mix's 1.45 then failed as effect-too-loud).
    room = {r["id"]: round(min(r["musicPeakDb"] - r["peakDb"], -0.1 - r["peakDb"]), 1) for r in (levels or [])}
    clips = {r["id"] for r in (levels or []) if r.get("musicPeakDb") is not None and r["musicPeakDb"] > -0.1}
    def fix_for(r, need):
        if r["id"] in clips:
            return (f"The music itself peaks over 0 dBFS near this hit, so no hit can rise: lower the bed (music volume \"auto\", or a lower volume) "
                    f"until it peaks under -1 dBFS, then duck the bed under the hit; raising the hit alone fails sound/effect-too-loud.")
        if room.get(r["id"]) is not None and room[r["id"]] < need:
            return (f"The bed hides this hit in its band, and it cannot rise the {need:.1f} dB it needs: it would peak over the music's loudest moment "
                    f"(room {room[r['id']]:+.1f} dB). Pick an effect with energy where the bed is weak (higher), or duck the bed under it.")
        return (f"Raise this hit by {need:.1f} dB only while its peak plus the bed's peak stay at or under -1 dBTP and its volume is 1 at most; past that, "
                "duck the bed under it (`hit` ducks by default, as deep as the band needs when the media tables have bands; a project made before them: run untell media measure on the effect and untell listen analyse on the track).")
    for run in _runs([r["peakAt"] for r in judged]):
        rs = [judged[i] for i in run]
        if len(rs) == 1:
            r = rs[0]
            if r["masked"]:
                out.append(finding("hit-over-bed", "warning", r["peakAt"], r["peakAt"], {**{k: v for k, v in r.items() if k != "masked"}, "roomUnderMusicPeakDb": room.get(r["id"])},
                                   {"minDb": OVER_DB}, fix_for(r, OVER_DB - r["overBedInBandDb"]), node=r["id"]))
            continue
        med = float(np.median([r["overBedInBandDb"] for r in rs]))
        if round(med, 1) < OVER_DB:
            out.append(finding("hit-over-bed", "warning", rs[0]["peakAt"], rs[-1]["peakAt"],
                               {"texture": len(rs), "medianOverBedInBandDb": round(med, 1), "worst": min(rs, key=lambda r: r["overBedInBandDb"])["id"]},
                               {"minDb": OVER_DB},
                               "These ticks are a texture the bed hides: raise them, high-pass them so they sit above the bed, or duck the bed under the run.",
                               node=f"{rs[0]['id']}..{rs[-1]['id']}"))
    return out, rows


ACCENT_DB = 6.0


def true_peak_envelope(sig, over=4):
    """Per sample, the true peak (4x oversampled, the louder channel) of a signal of shape (n, channels): the peak
    between samples that a sample peak misses."""
    if not len(sig):
        return np.zeros(0)
    from scipy.signal import resample_poly
    up = np.abs(resample_poly(sig, over, 1, axis=0)).max(axis=1)
    n = len(sig)
    return up[:n * over].reshape(n, over).max(axis=1) if len(up) >= n * over else np.abs(sig).max(axis=1)
# The effect rule's ceiling over the bed near an effect (src/system/scene/blocks/sound.ts NEAR_PEAK_MAX): a single
# hit's peak 12 dB over the bed's peak within 1 s, a run of ticks 10 dB. The block's level stays under it.
NEAR_PEAK_MAX = {"hit": 12.0, "tick": 10.0}


def check_effect_level(nodes, seconds, local_db=None, local_s=1.0):
    """sound/effect-too-loud: an effect that peaks over the music. From the files at their volumes and fades (the
    same in every render, before and after the master): each effect's sample peak against the bed's peak over the
    whole film (the music's loudest moment, the drop) and against the bed's peak within `local_s` s of it.
      error    a run of ticks (a texture under the bed) that peaks over the music's loudest moment; a single accent
               that peaks over it by more than ACCENT_DB; any effect that clips (a peak at 0 dBFS)
      warning  a single accent 0 to ACCENT_DB over the music's loudest moment (an impact system may want it: say so
               in the scene), or an effect's peak more than NEAR_PEAK_MAX over the bed's peak near it (the effect
               rule: 12 dB for a hit, 10 dB for a run of ticks; `local_db` overrides it)
    A dense run of hits (typing ticks) is one finding at its loudest."""
    f = facts()
    bed = bed_of(nodes, seconds)
    if not bed:
        return [], None
    # Peaks per channel: a mono fold (-ac 1) reads a peak up to 3 dB off; the louder channel is the one that clips.
    # The bed's peak is its true peak (4x oversampled), as the effect rule (sound.ts) states it and the block reads it
    # (the music map's bar peaks): a sample peak sits under the true peak, so a block that kept an effect 1 dB under
    # the music's true peak read 0.2 dB over its sample peak.
    xs = pcm(media_file(bed["src"]), sr=SR_BANDS, channels=2)
    frm, at = bed.get("from") or 0, bed["at"]
    end = min(bed.get("until") or seconds, seconds)
    t = np.arange(int(at * SR_BANDS), int(end * SR_BANDS)) / SR_BANDS
    src = ((t - at + frm) * SR_BANDS).astype(int)
    ok = (src >= 0) & (src < len(xs))
    g = np.array([gain_at(bed, v) for v in t[::441]])
    gain = np.repeat(g, 441)[:len(t)]
    sig = np.zeros((len(t), xs.shape[1] if xs.ndim > 1 else 1))
    sig[ok] = (xs[src[ok]] if xs.ndim > 1 else xs[src[ok]][:, None]) * gain[ok][:, None]
    lvl = true_peak_envelope(sig)
    db = lambda v: float(20 * np.log10(v + 1e-9))  # noqa: E731
    music_peak = db(lvl.max()) if len(lvl) else -180.0
    rows = []
    for n in nodes:
        k = f.get(n["src"], {})
        if k.get("kind") != "sfx":
            continue
        fx = np.abs(pcm(media_file(n["src"]), sr=SR_BANDS, channels=2)).max(axis=1)
        fx = fx[int((n.get("from") or 0) * SR_BANDS):]
        pk = db(float(np.abs(fx).max()) * n.get("volume", 1)) if len(fx) else -180.0
        tp = n["at"] - (n.get("from") or 0) + k["peak"]
        a, b = int((tp - local_s - at) * SR_BANDS), int((tp + local_s - at) * SR_BANDS)
        seg = lvl[max(0, a):max(0, b)]
        rows.append({"id": n["id"], "peakAt": round(tp, 3), "peakDb": round(pk, 1), "musicPeakDb": round(music_peak, 1),
                     "bedPeakNearDb": round(db(seg.max()), 1) if len(seg) else None})
    out = []
    for run in _runs([r["peakAt"] for r in rows]):
        rs = [rows[i] for i in run]
        r = max(rs, key=lambda r: r["peakDb"])
        node = r["id"] if len(rs) == 1 else f"{rs[0]['id']}..{rs[-1]['id']}"
        span = (rs[0]["peakAt"], rs[-1]["peakAt"])
        over = r["peakDb"] - music_peak
        texture = len(rs) > 1
        over = round(over, 1)  # the figure the report prints: 0.0 is not over
        if r["peakDb"] > -0.1 or over > (0.0 if texture else ACCENT_DB):
            out.append(finding("effect-too-loud", "error", *span, {**r, "overMusicPeakDb": round(over, 1), "effects": len(rs)},
                               {"maxOverMusicPeakDb": 0.0 if texture else ACCENT_DB, "maxPeakDb": -0.1},
                               EFFECT_FIX, node=node))
        elif over > 0:
            out.append(finding("effect-too-loud", "warning", *span, {**r, "overMusicPeakDb": round(over, 1), "effects": len(rs)},
                               {"maxOverMusicPeakDb": 0.0},
                               EFFECT_FIX, node=node))
        elif r["bedPeakNearDb"] is not None and r["peakDb"] > r["bedPeakNearDb"] + (lim := local_db if local_db is not None else NEAR_PEAK_MAX["tick" if texture else "hit"]) + 0.3:
            out.append(finding("effect-too-loud", "warning", *span, {**r, "overBedNearDb": round(r["peakDb"] - r["bedPeakNearDb"], 1), "effects": len(rs)},
                               {"maxOverBedNearDb": lim, "from": "the effect rule (sound.ts NEAR_PEAK_MAX)"},
                               EFFECT_FIX, node=node))
    return out, rows


def transients(x, sr=SR):
    hop = int(0.01 * sr)
    env = np.array([np.sqrt(np.mean(np.square(x[i:i + hop]))) + 1e-9 for i in range(0, max(1, len(x) - hop), hop)])
    d = 20 * np.log10(env)
    top = d.max()
    peaks = [i for i in range(1, len(d) - 1) if d[i] >= d[i - 1] and d[i] >= d[i + 1] and d[i] > top - 6]
    out = []
    for p in peaks:
        if out and ((p - out[-1]) * 0.01 < 0.04 or d[out[-1]:p + 1].min() > min(d[out[-1]], d[p]) - 6):
            if d[p] > d[out[-1]]:
                out[-1] = p
            continue
        out.append(p)
    return [round(p * 0.01, 3) for p in out]


def onsets(x, sr=SR, hop=256):
    """Onsets of the render (spectral flux), strength 0-1 against the strongest."""
    n = 1024
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n)
    S = np.log1p(np.abs(np.fft.rfft(frames, axis=1)))
    flux = np.maximum(0, np.diff(S, axis=0)).sum(axis=1)
    flux = np.r_[0, flux]
    out = []
    w = 5
    for i in range(w, len(flux) - w):
        if flux[i] == flux[i - w:i + w + 1].max() and flux[i] > np.median(flux[max(0, i - 40):i + 40]) * 1.5:
            out.append(((i * hop + n / 2) / sr, float(flux[i])))
    if not out:
        return []
    m = max(s for _, s in out)
    return [(round(t, 3), round(s / m, 2)) for t, s in out]


def step_of(system):
    """The system's frame step in frames a second (tokens step: Riso and Cutout 12), or 0 for one that moves every frame."""
    try:
        return int(json.loads((ROOT / "systems" / system / "tokens.json").read_text()).get("step") or 0)
    except Exception:  # noqa: BLE001
        return 0


def ends_of(system):
    """The system's end from its tokens (direction.ends): kind and hold, or None."""
    try:
        return json.loads((ROOT / "systems" / system / "tokens.json").read_text())["direction"]["ends"]
    except Exception:  # noqa: BLE001
        return None


def mix_of(system):
    """The system's mix from its tokens (direction.mix): lufs, range and the music's role ("clock", "bed", "none")."""
    try:
        return json.loads((ROOT / "systems" / system / "tokens.json").read_text())["direction"]["mix"]
    except Exception:  # noqa: BLE001
        return {"lufs": -16, "range": 2, "music": "clock"}


def accents(x, gap=1.5, strong=0.9, lift=2.0):
    """The onsets a viewer expects a cut on: strength 0.9 of the strongest or more, at least twice the median
    strength of the onsets within 2 s (so it stands out of a busy bar), and the strongest within `gap` seconds."""
    on = onsets(x)
    out = []
    for t, s in on:
        if s < strong:
            continue
        near = [v for u, v in on if abs(u - t) <= 2]
        if s < lift * float(np.median(near)):
            continue
        if out and t - out[-1][0] < gap:
            if s > out[-1][1]:
                out[-1] = (t, s)
            continue
        out.append((t, s))
    return out


ATTACK_S = 0.2


def check_onsets(x, changes, nodes, fps=30, mix=None, step=0, holds=()):
    """Accents with no picture change within 2 frames. Only for a system whose music is the clock (mix.music
    "clock"): a "bed" sits under the picture and does not ask for a change on each onset, and "none" has no music.
    An accent made by an effect (its attack: up to ATTACK_S before its peak, to 2 frames after it; for a lead-in, its
    peak only) has its own cause on screen and is skipped. An accent inside `holds` is skipped too: the caller gives the
    closing hold, cut to the system's Ends hold (checks/sound.py onset_holds), where the system asks the picture to stay
    still (Mark's lockup is held 2 s); asking for a change there was a rule against the system's own end."""
    if (mix or {}).get("music", "clock") != "clock":
        return []
    f = facts()
    # Each effect's own attack: up to ATTACK_S before its peak (from the clip's start at the earliest). An accent there
    # is the effect's attack (an impact rises about 0.15 s to its peak), not the music's: the hit check judges the
    # effect against its picture. Before, only an accent within 2 frames of the peak was skipped, so Noir's boom, whose
    # peak lands on the title, read as an accent with no change 0.13 s before it. An effect that rises into its moment
    # (role "lead-in": a whoosh) keeps the peak only, so it does not hide the music's accents under its long rise.
    spans = []
    for n in nodes:
        fx = f.get(n["src"], {})
        if fx.get("kind") != "sfx":
            continue
        peak = n["at"] - (n.get("from") or 0) + fx["peak"]
        spans.append((peak if fx.get("role") == "lead-in" else max(n["at"], peak - ATTACK_S), peak))
    moving = [t for t, s in changes if s >= 0.02]
    # A system that moves on a frame step (Riso and Cutout: 12 fps) shows a change up to one step after it is asked.
    tol = 2 / fps + (1 / step if step else 0) + 1e-3
    out = []
    for t, s in accents(x):
        if any(a - tol <= t <= p + tol for a, p in spans):
            continue
        if any(a - 1e-6 <= t <= b + 1e-6 for a, b in holds):
            continue
        if not any(abs(t - m) <= tol for m in moving):
            out.append(finding("onset-unmatched", "warning", t, t, {"onsetAt": t, "strength": s}, {"withinFrames": round(tol * fps, 1)},
                               "Put a picture change on this accent (a cut, a word, a hit's cause), or start the music elsewhere."))
    return out


def check_holds(x, changes, nodes, seconds, sr=SR, mix=None):
    """Stills over the loudest bars: a bar in the loudest quarter of the film during which the picture holds.
    Only for a "clock" system: a bed may swell under a held picture."""
    if (mix or {}).get("music", "clock") != "clock":
        return []
    bed = bed_of(nodes, seconds)
    bars = grid(bed, "downbeats") if bed else []
    if len(bars) < 3:
        bars = list(np.arange(0, seconds, 2.0))
    spans = [(a, b) for a, b in zip(bars, bars[1:] + [seconds]) if b - a > 0.5]
    lv = [level_db(x, a, b, sr) for a, b in spans]
    if not lv:
        return []
    cut = np.percentile(lv, 75)
    out = []
    for (a, b), l in zip(spans, lv):
        if l < cut:
            continue
        moved = [s for t, s in changes if a <= t < b]
        if moved and max(moved) < 0.02:
            out.append(finding("hold-on-loud-bar", "warning", a, b, {"barDb": round(l, 1), "maxChange": round(max(moved), 3)}, {"minChange": 0.02},
                               "The busiest picture goes on the busiest music: move a change, a cut or a word into this bar."))
    return out


MASTER_TAG = "untell_master"
PHONE_LOSS = 8.0  # dB lost above 200 Hz (the reels lose 0.1 to 7.7 dB; an agent's Matte film 10.0): a phone drops most of the mix


def mastered(path):
    """(True, how) when a file claims to be mastered by untell master: the tag scripts/master.py writes into the
    file's metadata (untell_master), or else a name that ends in .mastered.<ext> (after links, as the package links a
    render into its work tree). A copy under another name without the tag reads as not mastered."""
    p = Path(path)
    tags = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", str(p)], capture_output=True, text=True).stdout
    try:
        t = {k.lower(): v for k, v in (json.loads(tags).get("format", {}).get("tags") or {}).items()}
    except ValueError:
        t = {}
    if MASTER_TAG in t:
        return True, f"tag {MASTER_TAG}={t[MASTER_TAG]}"
    if ".mastered." in p.resolve().name:
        return True, "the file name (.mastered)"
    return False, "no untell_master tag and no .mastered name"


def check_levels(render, seconds, system=None):
    """Integrated loudness against the system target, true peak, the first 2 s, and exact digital silence.
    The level and the true peak are what untell master sets. On a file that claims to be mastered (mastered()), a
    level off target is an error, and so is a true peak over -1 dBTP. On any other file (a render before the master)
    they are advice: the finding says what the master will do, and never fails the film."""
    out = []
    # The three meters (the whole file, the first 2 s, the phone speaker's band) run at once: three ffmpeg processes.
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(3) as ex:
        whole, first, phone = ex.map(lambda a: ebur128(render, *a), [(0.0, None, None), (0, 2, None), (0.0, None, "highpass=f=200,highpass=f=200")])
    target = mix_of(system) if system else {"lufs": -16, "range": 2, "music": "clock"}
    silent = target.get("music") == "none"  # planned near silence: no level or silence findings
    is_master, how = mastered(render)
    run_master = f"Run untell master on this render{f' --system {system}' if system else ''}: it sets the level and limits the true peak; then check the .mastered file."
    if whole["lufs"] is not None and abs(whole["lufs"] - target["lufs"]) > target["range"] and target.get("music") != "none":
        if is_master:
            out.append(finding("mix-loudness", "error", 0, seconds, {"lufs": whole["lufs"], "target": target["lufs"], "mastered": how}, {"rangeLu": target["range"]},
                               "The mastered file misses the target: run untell master again, and lower the bed if the limiter took more than 4 dB."))
        else:
            out.append(finding("mix-loudness", "advice", 0, seconds, {"lufs": whole["lufs"], "target": target["lufs"], "masterWillAddDb": round(target["lufs"] - whole["lufs"], 1), "mastered": False},
                               {"rangeLu": target["range"]}, run_master))
    if whole["truePeak"] is not None and whole["truePeak"] > -1:
        if is_master:
            out.append(finding("true-peak", "error", 0, seconds, {"truePeakDb": whole["truePeak"], "mastered": how}, {"maxDb": -1},
                               "Lower the bed (music volume \"auto\" caps it) or the loudest hit, then master again, so the true peak stays at or under -1 dBTP."))
        else:
            out.append(finding("true-peak", "advice", 0, seconds, {"truePeakDb": whole["truePeak"], "mastered": False}, {"maxDb": -1}, run_master))
    # A phone speaker plays little under 200 Hz: the mix heard there is the mix above it (the same model as untell
    # listen mix: a 4th-order high-pass at 200 Hz, then the R128 meter).
    loss = None if whole["lufs"] is None or phone["lufs"] is None else round(whole["lufs"] - phone["lufs"], 1)
    if loss is not None and loss > PHONE_LOSS and not silent:
        out.append(finding("phone-loss", "warning", 0, seconds, {"lufs": whole["lufs"], "lufsAbove200Hz": phone["lufs"], "lossDb": loss}, {"maxLossDb": PHONE_LOSS},
                           "Most of this mix is under 200 Hz, which a phone speaker does not play: choose a track with mid-range content (melody, keys, voice), or lift 1-4 kHz in the bed."))
    if not silent and (first["lufs"] is None or first["lufs"] < target["lufs"] - 10):
        out.append(finding("first-2s-level", "warning", 0, 2, {"lufs": first["lufs"]}, {"minLufs": target["lufs"] - 10},
                           "The first 2 s are near silent: enter the music on a stronger bar or put a hit on the first change."))
    # Digital silence: 16-bit samples within 8 steps of zero (-72 dBFS) in both channels for 0.5 s or more.
    # A lossy codec turns exact zeros into a few steps of noise, so exact zero alone misses it in an mp4.
    s = pcm(render, sr=48000, channels=2, fmt="s16le")
    z = np.all(np.abs(s.astype(np.int32)) <= 8, axis=1)
    i, runs = 0, []
    while i < len(z):
        if z[i]:
            j = i
            while j < len(z) and z[j]:
                j += 1
            if (j - i) / 48000 >= 0.5:
                runs.append((i / 48000, j / 48000))
            i = j
        else:
            i += 1
    # A system whose bed stops hard by design (direction.mix.stop "hard": Title stops it on the impact and holds silence
    # under the title) asks for this silence: it is the design, not a dropout.
    designed = target.get("stop") == "hard"
    # The close: silence that runs to the end of the file, after the music has faded under the closing hold (the
    # ending rule asks for that fade, on a bar), is the end of the sound, not a dropout. It may last the system's end
    # hold and half a second more; longer, the sound stops before the picture does, and the fix says so.
    total = len(z) / 48000
    hold = float(((ends_of(system) or {}).get("hold")) or 1.5) if system else 1.5
    close = max(hold, 1.0) + 0.5
    for a, b in ([] if silent or designed else runs):
        at_end = b >= total - 0.05
        if at_end and b - a <= close:
            continue
        out.append(finding("digital-silence", "warning", a, b, {"seconds": round(b - a, 2), **({"atEnd": True} if at_end else {})}, {"maxSeconds": close if at_end else 0.5},
                           f"The sound stops {b - a:.1f} s before the picture ends: run the bed under the end card and fade it over the last {hold:g} s, ending on a bar."
                           if at_end else "Keep room tone or the bed under this stretch: exact silence reads as a dropout."))
    return out, {"whole": whole, "first2s": first, "target": target, "mastered": is_master, "phoneLossDb": loss, "digitalSilence": [[round(a, 2), round(b, 2)] for a, b in runs], **({"designedSilence": "the system's bed stops hard (direction.mix.stop)"} if designed and runs else {})}


def run(render, nodes, changes=None, fps=30, system=None, events=None, cut_times=None, reveal=None, holds=()):
    """Every sound check on one render. Returns (findings, facts). events: picture events (entrances) in seconds,
    for the drop; the detector passes them from the recording."""
    changes = changes if changes is not None else picture_changes(render, fps)
    seconds = changes[-1][0] + 1 / fps if changes else 0
    x = pcm(render)
    found, info = [], {}
    mix = mix_of(system) if system else None
    found += check_cuts(changes, nodes, fps, mix, cut_times, system, reveal[0] if reveal else None)
    info["cuts"] = cut_offsets(changes, nodes, fps, cut_times=cut_times)
    f, info["drop"] = check_drop(x, changes, seconds, fps, mix=mix, nodes=nodes, events=list(events or []) + list(cut_times or []), reveal=reveal)
    found += f
    f, info["hits"] = check_hits(nodes, seconds)
    found += f
    f, info["effects"] = check_effect_level(nodes, seconds)
    found += f
    found += check_onsets(x, changes, nodes, fps, mix, step_of(system), holds)
    found += check_holds(x, changes, nodes, seconds, mix=mix)
    f, info["levels"] = check_levels(render, seconds, system)
    found += f
    found.sort(key=lambda g: g["from"])
    return found, info


def main():
    if "--fx-facts" in sys.argv:
        # --fx-facts <file> <peak>: an effect's bands at its peak (fx_bands) and its rise (fx_rise), as JSON. The
        # repository's media script stores them.
        i = sys.argv.index("--fx-facts")
        print(json.dumps({"bands": fx_bands(sys.argv[i + 1], float(sys.argv[i + 2])), "rise": fx_rise(sys.argv[i + 1])}))
        return
    a = [x for x in sys.argv[1:] if not x.startswith("--")]
    system = sys.argv[sys.argv.index("--system") + 1] if "--system" in sys.argv else None
    if system in a:
        a.remove(system)
    j = json.loads(Path(a[1]).read_text())
    nodes = [n for n in (j.get("nodes", j) if isinstance(j, dict) else j) if n.get("kind") == "audio"]
    found, info = run(a[0], nodes, system=system)
    print(json.dumps({"findings": found, "facts": info}, indent=1))


if __name__ == "__main__":
    main()
