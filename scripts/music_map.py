"""The music map: the part of untell listen that blocks read.

Usage: python3 scripts/music_map.py [<name> ...] [--analyse]
For each prepared music track (assets/media/<name>/, kind "music" in assets/media.json) it reads listen.json
(made by scripts/listen/untell-listen analyse; with --analyse it runs that first when listen.json is missing),
writes music.json beside it, and writes src/system/music.gen.ts with the map of every track.

music.json holds: BPM and its confidence, the beat grid, downbeats, bars with their loudness and true peak,
sections (intro, build, drop, break, body, outro), drop times, the onsets with strength (spectral flux, 0-1), the loudest
bars, integrated loudness, true peak and the loop share. Times are seconds into the file.
It also holds gridTrust ("high", "medium" or "low") and gridIssues (why): how far the beat grid can be trusted, from
listen.json (grid_trust). The checks lower their grid rules to warnings for a "low" grid.
With --trust it only adds gridTrust to each existing music.json (from its listen.json) and writes music.gen.ts again.
With --bands it only adds bands and lead to each existing music.json (lead: the seconds of digital silence at the
start of the file that plays, sound_checks.lead_silence; `music` skips them by default), and the bands (each octave band of each 0.1 s window, a window each
0.025 s, of the file that plays: sound_checks.track_bands), and writes music.gen.ts again. `hit` reads them to set its duck by the
band where the bed covers the hit.
With --rise it only adds each drop's measured rise (`at`, measured_rise) to each existing music.json, and writes
music.gen.ts again. --rise-of <music.json> <audio> [offset] prints the drops with their rise and writes nothing.
A drop's `t` is the bar line the analysis found; `at` is where the rise is in the sound. They differ when the grid's
bar start is off (a beat late in three tracks of agents' films); `music({ peakAt })` places `at`.
Mastering: a track whose true peak is over -1 dBTP gets master.wav beside it (true-peak limited to -1 dBTP at 4x
oversampling with scripts/master.py's limiter, no other change); music.json names it, and `music` plays it.
"""
import json
import subprocess
import sys
import os
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent / "inspect"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / "listen"))
import master as mastering  # noqa: E402
import sound_checks  # noqa: E402

# The repository root, or the work tree that untell builds in a project (UNTELL_ROOT).
ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[1])
MEDIA = ROOT / "assets" / "media"
GEN = ROOT / "src" / "system" / "music.gen.ts"


def onsets(path):
    """Onsets of the whole file (spectral flux), strength against the 99th percentile, 0.3 and over, at most 600."""
    x = sound_checks.pcm(path)
    raw = sound_checks.onsets(x)
    if not raw:
        return []
    # sound_checks.onsets scales by the strongest; rescale by the 99th percentile so one spike does not flatten the rest.
    p99 = float(np.percentile([s for _, s in raw], 99)) or 1.0
    out = [(t, round(min(1.0, s / p99), 2)) for t, s in raw if s / p99 >= 0.3]
    return sorted(sorted(out, key=lambda o: -o[1])[:600])


RISE_STEP = 0.01  # the measured rise is read every 10 ms


def measured_rise(path, drop, beat, offset=0.0):
    """Where a drop's rise is in the sound itself, in seconds into the file: the time from two beats before the drop's
    bar line to two beats after it where sound_checks.rise_db (the level of the 2 s after against the 2 s before) is
    largest, read every RISE_STEP. It is the measure the detector reads for the drop (sound_checks.bed_drop), so the time
    music({ peakAt }) places is the time the check finds. The bar line comes from the beat grid, whose first beat of a bar
    can be a guess, so it can sit a beat or two from the rise (agents' films on four tracks); the level of the sound does
    not depend on the grid. `offset` is the file time of the audio's first sample (a test fixture holds a window).
    Returns the drop's own time when the sound around it cannot be read."""
    w = sound_checks.RISE_S
    a = max(offset + w, drop - 2 * beat)
    b = drop + 2 * beat
    x = sound_checks.pcm(path, start=a - w - offset, dur=b - a + 2 * w)
    if len(x) < int((b - a + 2 * w) * sound_checks.SR) - sound_checks.SR // 10:
        return drop
    ts = np.arange(a, b + 1e-9, RISE_STEP)
    rises = [sound_checks.rise_db(x, t - (a - w)) for t in ts]
    return float(ts[int(np.argmax(rises))])


def prepare_master(path, true_peak):
    """A track whose true peak is over -1 dBTP gets master.wav beside it: the same audio, true-peak limited to
    -1 dBTP at 4x oversampling (master.py's limiter, no gain), so a bed at full level never clips. Returns the
    master's file name and its measured true peak, or (None, None) when the track needs no master."""
    if true_peak is None or true_peak <= mastering.PEAK:
        return None, None
    out = path.with_name("master.wav")
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(path), "-af", mastering.limiter(0.0, mastering.PEAK, edge=False),
                        "-c:a", "pcm_s24le", str(out)], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"{path.parent.name}: master failed: {r.stderr.strip()[:200]}")
        return None, None
    m = mastering.measure(out)
    print(f"{path.parent.name}: true peak {true_peak:+.2f} dBTP -> master.wav {m['truePeak']:+.2f} dBTP")
    return out.name, m["truePeak"]


# Tempo ratios between two methods that mean one of them counts a different pulse of the same music.
from trust import RELATIONS, grid_trust  # noqa: E402,F401  (scripts/listen/trust.py: one source with listen.md)


def drops_with_rise(path, d, offset=0.0):
    """The drops of listen.json, each with `at`: its measured rise (measured_rise) on `path`, the file the music node
    plays (the master when there is one: its limiter changes the level a little, and a drop on a level plateau can move),
    which `music({ peakAt })` places. A drop pinned by hand (listen analyse --drop) keeps its time. `t` stays the bar
    line the analysis found."""
    beat = 60.0 / d["rhythm"]["bpm"]
    out = []
    for x in d["drops"]:
        at = x["at"] if x.get("pinned") and x.get("at") is not None else measured_rise(path, x["t"], beat, offset)
        out.append({"t": x["t"], "rise": x["riseDb"] if x.get("riseDb") is not None else 0, "at": round(float(at), 3), **({"pinned": True} if x.get("pinned") else {})})
    return out


def compact(d, path):
    rh = d["rhythm"]
    ons = onsets(path)
    bars = d["bars"]
    return {
        "duration": d["duration"], "bpm": rh["bpm"], "confidence": rh["confidence"], "grid": rh["grid"],
        "halfTime": bool(rh.get("halfTimeFeel")),
        "beats": rh["beats"], "downbeats": rh["downbeats"],
        "bars": [b["start"] for b in bars], "barLufs": [b["lufs"] for b in bars], "barPeak": [b["truePeak"] for b in bars],
        "sections": [{"start": s["start"], "end": s["end"], "role": s["role"], "material": s["material"]} for s in d["sections"]],
        "drops": drops_with_rise(path, d),
        "onsets": [[t, s] for t, s in ons],
        "loudest": [i - 1 for i in d["loudestBars"]],
        "lufs": d["dynamics"]["lufsIntegrated"], "truePeak": d["dynamics"]["truePeakDb"],
        "loopShare": d["repetition"].get("loopShare"), "master": None,
        "gridTrust": grid_trust(d)[0], "gridIssues": grid_trust(d)[1],
    }


def rise_only(names):
    """--rise: add the measured rise (`at`) to each drop of each existing music.json, from the track's own file, and
    write music.gen.ts again. No other field changes and no master is made."""
    manifest = json.loads((ROOT / "assets" / "media.json").read_text())
    for n in names:
        mj = MEDIA / n / "music.json"
        if not mj.exists():
            continue
        c = json.loads(mj.read_text())
        src = MEDIA / n / (c.get("master") or manifest[n]["file"])
        beat = 60.0 / c["bpm"]
        for x in c["drops"]:
            if not x.get("pinned"):
                x["at"] = round(float(measured_rise(src, x["t"], beat)), 3)
        mj.write_text(json.dumps(c))
        moved = [f"{x['t']} -> {x['at']}" for x in c["drops"] if abs(x["at"] - x["t"]) > 1 / 30]
        print(f"{n}: {len(c['drops'])} drops" + (f"; measured rise off the bar line: {', '.join(moved)}" if moved else ""))


def bands_only(names):
    """--bands: add bands (sound_checks.track_bands, of the file that plays: the master when there is one) to each
    existing music.json. No other field changes."""
    manifest = json.loads((ROOT / "assets" / "media.json").read_text())
    for n in names:
        mj = MEDIA / n / "music.json"
        if not mj.exists():
            continue
        c = json.loads(mj.read_text())
        played = MEDIA / n / (c.get("master") or manifest[n]["file"])
        c["bands"], c["lead"] = sound_checks.track_bands(played), sound_checks.lead_silence(played)
        mj.write_text(json.dumps(c))
        print(f"{n}: bands for {len(c['bands']) // 8} frames" + silence_note(c["lead"]))


def silence_note(lead):
    """What to say about digital silence at a track's start."""
    return (f"; it opens with {lead:.2f} s of digital silence: music() enters where the sound starts unless the scene places the drop"
            if lead >= 0.05 else "")


def rise_of_file(music_json, audio, offset):
    """--rise-of <music.json> <audio> [offset]: print the drops of a map with their measured rise, from an audio file
    whose first sample is at file time `offset` (a test fixture's window). Writes nothing."""
    c = json.loads(Path(music_json).read_text())
    beat = 60.0 / c["bpm"]
    print(json.dumps([{**x, "at": round(float(measured_rise(Path(audio), x["t"], beat, offset)), 3)}
                      for x in c["drops"] if offset <= x["t"] - 3 * beat and x["t"] + 2 * beat <= offset + audio_seconds(audio)]))


def audio_seconds(path):
    """The length of an audio file in seconds (ffprobe)."""
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    return float(r.stdout.strip() or 0)


def main():
    if "--rise-of" in sys.argv:
        i = sys.argv.index("--rise-of")
        a = sys.argv[i + 1:]
        rise_of_file(a[0], a[1], float(a[2]) if len(a) > 2 else 0.0)
        return
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    manifest = json.loads((ROOT / "assets" / "media.json").read_text())
    names = args or sorted(n for n, v in manifest.items() if v["kind"] == "music")
    for n in names if "--trust" in sys.argv else []:
        mj, lj = MEDIA / n / "music.json", MEDIA / n / "listen.json"
        if mj.exists() and lj.exists():
            c = json.loads(mj.read_text())
            c["gridTrust"], c["gridIssues"] = grid_trust(json.loads(lj.read_text()))
            mj.write_text(json.dumps(c))
            print(f"{n}: grid trust {c['gridTrust']}" + (f" ({'; '.join(c['gridIssues'])})" if c["gridIssues"] else ""))
    if "--rise" in sys.argv:
        rise_only(names)
    if "--bands" in sys.argv:
        bands_only(names)
    for n in names if not {"--trust", "--rise", "--bands"} & set(sys.argv) else []:
        lj = MEDIA / n / "listen.json"
        if not lj.exists() and "--analyse" in sys.argv:
            subprocess.run([str(ROOT / "scripts/listen/untell-listen"), "analyse", n], check=True)
        if not lj.exists():
            print(f"{n}: no listen.json (run scripts/listen/untell-listen analyse {n})")
            continue
        src = MEDIA / n / manifest[n]["file"]
        c = compact(json.loads(lj.read_text()), src)
        name, tp = prepare_master(src, c["truePeak"])
        if name:  # the master only lowers peaks: bar loudness stays, bar peaks are capped at the master's peak
            c.update({"master": name, "truePeak": tp, "barPeak": [min(p, tp) for p in c["barPeak"]],
                      "drops": drops_with_rise(src.with_name(name), json.loads(lj.read_text()))})
        c["bands"], c["lead"] = sound_checks.track_bands(src.with_name(name) if name else src), sound_checks.lead_silence(src.with_name(name) if name else src)
        if c["lead"] >= 0.05:
            print(f"{n}: {silence_note(c['lead'])[2:]}")
        (MEDIA / n / "music.json").write_text(json.dumps(c))
    rows = []
    for p in sorted(MEDIA.glob("*/music.json")):
        rows.append(f"  {json.dumps(p.parent.name)}: {p.read_text()},")
    GEN.write_text(
        "// Generated by scripts/music_map.py from each track's listen.json. Do not edit.\n"
        "// The map of every prepared music track, in seconds into the file: the beat grid, bars with loudness\n"
        "// (LUFS) and true peak (dBTP), sections, drops, strong onsets (time, strength 0-1) and the loudest bars\n"
        "// (indices into bars). Read it through src/system/scene/beats.ts.\n"
        "export type MusicSection = { start: number; end: number; role: \"intro\" | \"build\" | \"drop\" | \"break\" | \"body\" | \"outro\"; material: string };\n"
        "export type MusicMap = {\n"
        "  duration: number; bpm: number; confidence: \"high\" | \"medium\" | \"low\"; grid: \"fixed\" | \"tracked\"; halfTime: boolean;\n"
        "  beats: number[]; downbeats: number[]; bars: number[]; barLufs: number[]; barPeak: number[];\n"
        "  /** A drop: `t` the bar line, `rise` its rise in dB, `at` the measured rise in the sound (music_map.py measured_rise),\n"
        "   *  which `music({ peakAt })` places; `pinned` when it was set by hand (untell listen analyse --drop). A map made\n"
        "   *  before `at` existed has none. */\n"
        "  sections: MusicSection[]; drops: { t: number; rise: number; at?: number; pinned?: boolean }[]; onsets: [number, number][]; loudest: number[];\n"
        "  lufs: number; truePeak: number; loopShare: number | null;\n"
        "  /** A file beside the source, true-peak limited to -1 dBTP, when the source peaks over -1 dBTP. `music` plays it. */\n"
        "  master: string | null;\n"
        "  /** How far the beat grid can be trusted (scripts/music_map.py grid_trust), and why. A \"low\" grid counts another pulse. */\n"
        "  gridTrust: \"high\" | \"medium\" | \"low\"; gridIssues: string[];\n"
        "  /** Each octave band (60 Hz to 16 kHz) of the 0.1 s window centred each 0.025 s from the start, dB at volume 1, 8\n"
        "   *  characters a window (sound_checks.track_bands). Read it through bandsAt (beats.ts): `hit` sets its duck by the\n"
        "   *  band where the bed covers the hit. A map made before it existed has none. */\n"
        "  bands?: string;\n"
        "  /** Seconds of digital silence at the start of the file that plays (sound_checks.lead_silence). `music` enters\n"
        "   *  after them by default. A map made before it existed has none. */\n"
        "  lead?: number;\n"
        "};\n"
        "export const MUSIC: Record<string, MusicMap> = {\n" + "\n".join(rows) + "\n};\n")
    print(f"wrote {GEN.relative_to(ROOT)} ({len(rows)} tracks)")


if __name__ == "__main__":
    main()
