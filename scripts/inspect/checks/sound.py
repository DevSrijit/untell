"""sound/*: the listening layer (scripts/inspect/sound_checks.py) on the film's real render.

When out/render/<film id>.mp4 exists, has an audio stream and is not older than the film's
source file, sound_checks.run
measures the render itself: cuts against the beat grid, the drop against a full change, each hit over the bed and
its transients, strong onsets with no picture change, holds on loud bars, loudness against the system's mix target,
true peak and digital silence. Its findings come back under "sound/<its rule>". The notes hold the mix facts of
untell listen mix for each effect (masked by the bed or not, through sound_checks.masking; its peak over the music's
loudest moment). Then the detector's own mix-based
rules that cover the same ground (beat-sync, hit-over-bed, and loudness's level, peak and silence rules) do not run.
Without a usable render, a note says "sound not checked on a render", and the mix-based rules run on the ffmpeg mix.
The grid rules (cut-on-beat, drop-on-change, hold-on-loud-bar, onset-unmatched) read the music map's gridTrust
(scripts/music_map.py): on a "low" grid (the cross-check counts another pulse) they are warnings at most, and the fix
says why. Every grid finding carries the trust in its measure.
"""
import json
import subprocess
import sys
from pathlib import Path

from film import ROOT, Skip
from sound_common import grid_trust, lower_for_grid, music

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sound_checks  # noqa: E402

GRID_RULES = {"cut-on-beat", "drop-on-change", "hold-on-loud-bar", "onset-unmatched"}


def render_of(film):
    """The real render, when it exists, has sound and is not older than the film's source. The mastered render
    (out/render/<id>.mastered.mp4, which scripts/render.ts writes) comes first when it is as new as the render."""
    p = ROOT / "out" / "render" / f"{film.id}.mp4"
    m = ROOT / "out" / "render" / f"{film.id}.mastered.mp4"
    if m.exists() and (not p.exists() or m.stat().st_mtime >= p.stat().st_mtime):
        p = m
    if not p.exists():
        return None, "no render at out/render/" + p.name
    src = film.sound.get("sourceMtime")
    if src is not None and p.stat().st_mtime < src:
        return None, "the render is older than the film's source"
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(p)],
                           capture_output=True, text=True).stdout.strip()
    if not probe:
        return None, "the render has no audio"
    return p, None



def onset_holds(film):
    """The holds inside which the onset rule asks for no picture change: the closing hold only (the hold that reaches
    the film's end), and only its first direction.ends.hold seconds, the stillness the system's Ends rule asks for.
    Before, every hold the scene marked silenced the rule, so a scene could mark the whole film as a hold and never hear
    an accent with nothing on screen. A hold in the middle of the film, and the part of a closing hold past the Ends
    hold, now count as film: an accent there asks for a change. A system that states no Ends hold excuses nothing."""
    ends = ((film.tokens or {}).get("direction") or {}).get("ends") or {}
    keep = float(ends.get("hold") or 0)
    if keep <= 0:
        return []
    end = film.n / film.fps
    return [(a, min(b, a + keep)) for a, b in film.holds if b >= end - 1.5 / film.fps]

def check(film):
    if not film.sound.get("hasSound"):
        film.render_checked = False
        raise Skip("the film has no sound")
    render, why = render_of(film)
    film.render_checked = render is not None
    if render is None:
        film.notes.append({"check": "sound", "info": f"sound not checked on a render ({why}); the mix-based rules ran on the ffmpeg mix"})
        # The strong-onset match runs on the scene's own mix too, so an accent with no change shows before the first
        # render (an agent's Riso film met two only after it).
        if film.sound.get("wav") and film.system:
            from audio import pcm
            drawn = film.drawn
            changes = [(film.t(f), max(float(film.change[f]), 0.02 if drawn[f] else 0.0)) for f in range(film.n)]
            found = sound_checks.check_onsets(pcm(film.sound["wav"]), changes, film.sound["clips"], film.fps, sound_checks.mix_of(film.system), sound_checks.step_of(film.system), onset_holds(film))
            for g in found:
                g["check"] = "sound/" + g["check"] if not g["check"].startswith("sound/") else g["check"]
            if found:
                return found
        raise Skip(f"sound not checked on a render: {why}")
    # The one motion measure: a frame where a line draws, a label types or a picture enters is a change (0.02 of the
    # frame at least), though the pixel measure sees little of it.
    drawn = film.drawn
    changes = [(film.t(f), max(float(film.change[f]), 0.02 if drawn[f] else 0.0)) for f in range(film.n)]
    from film import picture_events
    from sound_common import cuts
    from film import declared_reveal
    rv = declared_reveal(film)
    if rv is None:
        try:
            import reveal_energy
            r = reveal_energy.reveal(film)
            rv = (film.t(r[1]), "detected: " + str(r[4])) if r else None
        except Exception:  # noqa: BLE001
            rv = None
    found, info = sound_checks.run(str(render), film.sound["clips"], changes, film.fps, film.system, holds=onset_holds(film), events=picture_events(film),
                                   cut_times=[film.t(f) for f in cuts(film)], reveal=rv)
    lv = info.get("levels", {})
    # The mix facts that untell listen mix reports, from the same functions (sound_checks.masking for each hit, the
    # effect level against the music's loudest moment): each effect, whether the bed masks it, and how far it peaks
    # over the music. The findings (sound/hit-over-bed, sound/effect-too-loud) come from the same rows.
    mix = [{k: h.get(k) for k in ("id", "peakAt", "overInBandDb", "heardIn", "masked") if k in h} for h in (info.get("hits") or [])]
    for e in info.get("effects") or []:
        row = next((r for r in mix if r["id"] == e["id"]), None)
        if row is None:
            row = {"id": e["id"], "peakAt": e.get("peakAt")}
            mix.append(row)
        row.update({"peakDb": e.get("peakDb"), "overMusicPeakDb": round(e["peakDb"] - e["musicPeakDb"], 1) if e.get("musicPeakDb") is not None else None})
    film.notes.append({"check": "sound", "render": str(render.relative_to(ROOT)), "mastered": lv.get("mastered"), "levels": lv.get("whole"), "drop": info.get("drop"),
                       "mix": mix})
    try:
        trust, issues = grid_trust(music(film))
    except Skip:
        trust, issues = "medium", ["the film has no music"]
    out = []
    for f in found:
        rule = f["check"]
        f = dict(f)
        f["check"] = "sound/" + rule
        # A grid the music map marks low trust judges nothing: cuts and loud bars are not held to it (a note says so).
        if trust == "low" and rule == "hold-on-loud-bar":
            film.notes.append({"check": f["check"], "notJudged": f"{f['from']:.2f} s", "why": "the bar lines are not trusted: " + "; ".join(issues)})
            continue
        if trust == "low" and rule == "cut-on-beat":
            # As the picture pass: on a low-trust grid a cut is judged against the strong onsets (beats().cuts).
            from beat_sync import STRONG_ONSET
            from sound_common import film_time, media_path
            clip = music(film)
            try:
                ons = json.loads(media_path(clip["src"].split("/")[0] + "/music.json").read_text()).get("onsets") or []
            except (OSError, ValueError):
                ons = []
            strong = [film_time(clip, t) for t, st in ons if st >= STRONG_ONSET]
            near = min(strong, key=lambda t: abs(t - f["from"]), default=None)
            if near is None or -1 / film.fps - 0.004 <= f["from"] - near <= 2 / film.fps + 0.004:
                continue
            f["measured"] = {**f["measured"], "beat": None, "strongOnset": round(near, 3), "offFrames": round((f["from"] - near) * film.fps, 1)}
        if rule in GRID_RULES:
            f = lower_for_grid(f, trust, issues)
        out.append(f)
    # What the review sheet marks and counts, as the picture pass gives it (beat_sync): the grid the cuts were judged
    # by (the beats, or the strong onsets on a low-trust grid) and the count of cuts on it. With a current render the
    # picture pass does not judge cuts, and the sheet of `untell check --render --sheet` read nothing (a first-use
    # test: "0 on a onset" while cut-on-beat passed).
    clock = (((film.tokens or {}).get("direction") or {}).get("mix") or {}).get("music", "clock") == "clock"
    if clock and info.get("cuts") is not None:
        try:
            clip = music(film)
            from sound_common import grid as _grid
            marks = [float(b) for b in _grid(film, clip)]
            if trust == "low":
                from beat_sync import STRONG_ONSET
                from sound_common import film_time, media_path
                ons = json.loads(media_path(clip["src"].split("/")[0] + "/music.json").read_text()).get("onsets") or []
                marks = sorted(film_time(clip, t) for t, st in ons if st >= STRONG_ONSET)
            off = sum(1 for f in out if f["check"] == "sound/cut-on-beat")
            n = len(info["cuts"])
            film.notes.append({"check": "sound/cut-on-beat", "sheetGrid": [round(b, 3) for b in marks if 0 <= b <= film.seconds],
                               "gridKind": "onset" if trust == "low" else "beat", "cutsJudged": n, "cutsOnGrid": max(0, n - off), "on": "the render"})
        except (Skip, OSError, ValueError):
            pass
    elif not clock:
        film.notes.append({"check": "sound/cut-on-beat", "notJudged": "cuts", "why": "a bed system cuts on the picture's own rhythm (direction.mix.music)"})
    return out
