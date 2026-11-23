#!/usr/bin/env python3
"""untell master: brings a render's whole mix to its system's loudness target and limits its true peak.

Usage:
  python3 scripts/master.py <render.mp4> <system id> [--out <file>] [--lufs <n>] [--peak <dBTP>]
  python3 scripts/master.py <render.mp4> --lufs -14

Why: `music` sets the bed's gain from the track's measured loudness, but the bed and the hits add up, and a
source that clips cannot reach a target under a peak cap by gain alone. The last step of every mix is a limiter.
This is that step, on the final render, so no scene has to tune a volume by hand.

How: measure (EBU R128), apply one gain to reach the target, limit at 4x oversampling so the true peak (not only
the sample peak) stays under the limit, measure again, and correct the gain once or twice. The picture stream is
copied, never encoded again. A silent film (no audio stream, or a stream with no sound) is left alone. A film in a
system whose mix says no music ("none") is mastered too when it has a sound: its clicks reach the system's level.

It reports how much the limiter had to take off. More than 4 dB means the mix is crushed: lower the bed or pick a
calmer part of the track; do not accept the output.
"""
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

# The root of the repository layout: UNTELL_ROOT when untell runs this script in a project's work tree (.untell/lab).
ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parent.parent)
PEAK = -1.0   # dBTP, the limit for every system
MARGIN = 0.3  # the limiter aims this far under the limit: the encoder's own overshoot stays inside it


def measure(path):
    err = subprocess.run(["ffmpeg", "-nostats", "-i", str(path), "-af", "ebur128=peak=true", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    tail = err[err.rfind("Summary:"):]

    def get(k):
        m = re.search(k + r":\s+(-?[\d.]+|-inf)", tail)
        return float(m.group(1)) if m and m.group(1) != "-inf" else None
    return {"lufs": get("I"), "lra": get("LRA"), "truePeak": get("Peak")}


def has_audio(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True).stdout
    return bool(out.strip())


def target_of(system):
    f = ROOT / "systems" / system / "tokens.json"
    if not f.exists():
        sys.exit(f"master: no system \"{system}\" (looked for {f})")
    mix = json.loads(f.read_text()).get("direction", {}).get("mix")
    if not mix:
        sys.exit(f"master: {system} has no mix target in its tokens")
    return mix


EDGE = 0.03  # s: the master's fade at the file's first sample (one AAC frame and a half)


def limiter(gain_db, peak, rate=48000, edge=True):
    """The ffmpeg filter: one gain, then a limiter at 4x oversampling (192 kHz) so the true peak stays under `peak`.
    The mix fades in over its first EDGE s: in an mp4 with its video, the AAC encoder's priming frame decodes too, and
    on a mix that starts at full level on frame 0 (Console's bed) it decoded 0.5 dB over 0 dBTP at 13 ms, past the
    limiter. A fade of 30 ms (one and a half AAC frames) keeps that frame quiet and still reads as a hard start.
    edge=False leaves out the fade: a track's own master (music_map.py) is audio a bed enters anywhere, not a final mix."""
    lim = 10 ** ((peak - MARGIN) / 20)
    # The limiter looks ahead by its attack (3 ms), so it delays the whole mix by that much: the master put the sound
    # 3 ms after the picture (measured with scripts/sync_probe.py). The delay is cut here by hand: 3 ms at 192 kHz is
    # 576 samples off the start, and 576 samples of silence at the end keep the length. alimiter's own latency=1 also
    # removes the delay, but with it a peak passed the limit (Courtside's reel came out at -0.7 dBTP for a -1.3 aim).
    cut = round(0.003 * 192000)
    return (f"{f'afade=t=in:d={EDGE},' if edge else ''}volume={gain_db:.2f}dB,aresample=192000,"
            f"alimiter=limit={lim:.4f}:level=false:attack=3:release=60,atrim=start_sample={cut},asetpts=N/SR/TB,apad=pad_len={cut},aresample={rate}")


# The tag that says a file is mastered: untell check reads it (sound_checks.mastered) and then holds the file to the
# target (an error when the level or the true peak is off). A render without it gets advice: "run untell master".
TAG = "untell_master"


def tag_args(out, tag):
    """ffmpeg arguments that write the tag into the file's metadata. An mp4 or mov keeps a custom key only with
    use_metadata_tags."""
    if not tag:
        return []
    keep = ["-movflags", "+use_metadata_tags"] if Path(out).suffix.lower() in (".mp4", ".mov", ".m4a", ".m4v") else []
    return [*keep, "-metadata", f"{TAG}={tag}"]


def render(src, out, gain_db, ceiling, tag=None):
    af = limiter(gain_db, ceiling)
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-c:v", "copy", "-af", af,
                        "-c:a", "aac", "-b:a", "256k", *tag_args(out, tag), str(out)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"master: ffmpeg failed: {r.stderr.strip()[:400]}")


def master(src, target, rng=2.0, peak=PEAK, out=None, log=print):
    src = Path(src)
    out = Path(out) if out else src.with_name(src.stem + ".mastered" + src.suffix)
    before = measure(src)
    if before["lufs"] is None:
        log("master: the render is silent; nothing to do")
        return None
    tmp = out.with_name(out.stem + ".pass" + out.suffix)
    gain = target - before["lufs"]
    after = None
    # The limiter's ceiling starts at the limit. On a mix with fast, dense peaks (Courtside's footage sound), the
    # limiter's 3 ms attack and the AAC encoder let a peak through by up to 0.8 dB, more than MARGIN covers. So the
    # result is measured, and the ceiling goes down by what came through until the file itself is under the limit.
    ceiling = peak
    for _ in range(6):
        render(src, tmp, gain, ceiling)
        after = measure(tmp)
        miss = target - after["lufs"]
        over = (after["truePeak"] - peak) if after["truePeak"] is not None else 0.0
        if abs(miss) <= 0.3 and over <= 0:
            break
        if abs(miss) > 0.3:
            gain += miss
        if over > 0:
            ceiling -= over + 0.2
    # The last pass again with the tag: the target and the limit it was mastered to, and the measured result.
    render(src, tmp, gain, ceiling, tag=f"lufs={target};truePeak={peak};measuredLufs={after['lufs']};measuredTruePeak={after['truePeak']}")
    shutil.move(tmp, out)
    # What the limiter took: the peak the gain alone would give, less the peak that came out.
    taken = max(0.0, (before["truePeak"] + gain) - after["truePeak"]) if before["truePeak"] is not None else 0.0
    ok_l = abs(after["lufs"] - target) <= rng
    ok_p = after["truePeak"] is not None and after["truePeak"] <= peak + 0.05
    log(f"before: {before['lufs']:.1f} LUFS, true peak {before['truePeak']:+.1f} dBTP")
    log(f"after:  {after['lufs']:.1f} LUFS, true peak {after['truePeak']:+.1f} dBTP (target {target} within {rng} LU, peak at most {peak} dBTP)")
    log(f"gain {gain:+.1f} dB; the limiter took {taken:.1f} dB off the loudest peak")
    if taken > 4:
        log("warning: the limiter took more than 4 dB. The mix is crushed. Lower the bed or the hits, or enter the track at a part with less peak, then render again.")
    if not ok_l:
        log("error: the loudness target was not reached")
    if not ok_p:
        log("error: the true peak is over the limit")
    log(f"wrote {out}")
    return {"before": before, "after": after, "gain": round(gain, 2), "limited": round(taken, 2), "ok": ok_l and ok_p and taken <= 4, "out": str(out)}


def main():
    a = sys.argv[1:]

    def opt(k):
        return a[a.index(k) + 1] if k in a else None
    pos = [x for i, x in enumerate(a) if not x.startswith("--") and (i == 0 or a[i - 1] not in ("--out", "--lufs", "--peak"))]
    if not pos:
        sys.exit(__doc__)
    src = Path(pos[0])
    if not src.exists():
        sys.exit(f"master: no file {src}")
    if not has_audio(src):
        print("master: the render has no audio stream; nothing to do")
        return
    rng = 2.0
    if opt("--lufs") is not None:
        target = float(opt("--lufs"))
    elif len(pos) > 1:
        # A system with no music ("none") is near silent by design, but a film in it with one click has a sound: that
        # sound takes the system's level like any other (a click at its file's level measured -32.6 LUFS for Raw's
        # -26). A render with no sound at all is left alone by master() (no loudness to measure).
        mix = target_of(pos[1])
        target, rng = mix["lufs"], mix.get("range", 2.0)
    else:
        sys.exit("master: give a system id or --lufs <n>")
    res = master(src, target, rng, float(opt("--peak") or PEAK), opt("--out"))
    if "--json" in a and res:
        print(json.dumps(res))
    sys.exit(0 if res is None or res["ok"] else 1)


if __name__ == "__main__":
    main()
