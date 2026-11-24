"""Measures a sound file for untell: its length and peak, or its beats and energy bar by bar.

Usage:
  python media_sound.py measure <file>                 JSON: duration, peak (s into the file), lufs (null)
  python media_sound.py beats <file> [<beats.json>]    JSON: bpm, beat times, bars with energy, entries

untell uses HyperFrames' `audio` and `beats` commands when it finds a local HyperFrames CLI. This script is
the fallback, and it always makes the energy map. It needs ffmpeg and numpy. <beats.json> is the output of
`hyperframes beats <file> --json` ({"bpm", "beatTimes"}); without it, the script finds the tempo itself.
"""
import json
import subprocess
import sys

import numpy as np

RATE = 22050


def decode(path):
    """The file as mono float samples at RATE."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def rms(x, hop):
    n = len(x) // hop
    if n == 0:
        return np.zeros(1, dtype=np.float32)
    return np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(axis=1))


def loudness(path):
    """Integrated loudness (LUFS) by ffmpeg's ebur128 meter (ITU-R BS.1770), or None when ffmpeg gives none."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True)
    import re
    m = re.findall(r"I:\s+(-?\d+(?:\.\d+)?) LUFS", r.stderr)
    return float(m[-1]) if m else None


def measure(path):
    """Length, the time of the loudest 10 ms, the integrated loudness (LUFS) and the sample peak (dBFS): what `hit` and
    `typing` need to set an effect's level against the bed. ffmpeg and numpy only; no HyperFrames."""
    x = decode(path)
    hop = RATE // 100  # 10 ms
    env = rms(x, hop)
    peak = (int(np.argmax(env)) + 0.5) * hop / RATE
    top = float(np.max(np.abs(x))) if len(x) else 0.0
    # The peak is the true peak over the louder channel (ebur128): a mono fold reads a stereo effect low.
    import re
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True)
    tp = re.search(r"True peak:\s*\n\s*Peak:\s*(-?\d+(?:\.\d+)?) dBFS", r.stderr)
    top_db = max(20 * np.log10(max(top, 1e-9)), float(tp.group(1)) if tp else -1e9)
    return {"duration": round(len(x) / RATE, 3), "peak": round(peak, 3), "lufs": loudness(path),
            "peakDb": round(top_db, 1)}


def tempo(x):
    """The tempo (60 to 180 BPM) and beat times, from the autocorrelation of an onset envelope."""
    hop = 256
    env = rms(x, hop)
    onset = np.maximum(0, np.diff(np.log1p(env * 100), prepend=0))
    onset = onset - onset.mean()
    fps = RATE / hop
    ac = np.correlate(onset, onset, mode="full")[len(onset) - 1:]
    lags = np.arange(len(ac))
    ok = (lags >= fps * 60 / 180) & (lags <= fps * 60 / 60)
    # Prefer tempos near 120 BPM a little, so the result is not a half or double of the true tempo.
    bpm_of = 60 * fps / np.maximum(lags, 1)
    weight = np.exp(-0.5 * (np.log2(bpm_of / 120)) ** 2)
    lag = int(lags[ok][np.argmax((ac * weight)[ok])])
    period = lag
    phase = max(range(period), key=lambda p: onset[p::period].sum())
    beats = np.arange(phase, len(onset), period) / fps
    return round(60 * fps / lag, 1), [round(float(b), 3) for b in beats]


def bars(x, beat_times, per_bar=4):
    """Energy (RMS, 0 to 1 of the loudest bar) of each bar of `per_bar` beats, and where energy jumps."""
    out = []
    for i in range(0, len(beat_times) - per_bar, per_bar):
        a, b = beat_times[i], beat_times[i + per_bar]
        seg = x[int(a * RATE): int(b * RATE)]
        out.append({"bar": len(out) + 1, "at": beat_times[i], "energy": float(np.sqrt((seg ** 2).mean())) if len(seg) else 0.0})
    top = max([b["energy"] for b in out] or [1]) or 1
    for b in out:
        b["energy"] = round(b["energy"] / top, 3)
    # Entries: a bar much louder than the four bars before it (a drop or a swell), the largest jumps first,
    # then the strongest bars.
    entries = []
    jumps = []
    for i, b in enumerate(out):
        if i == 0:
            continue
        before = np.mean([p["energy"] for p in out[max(0, i - 4):i]])
        if b["energy"] - before >= 0.2:
            jumps.append((b["energy"] - before, b, before))
    for jump, b, before in sorted(jumps, key=lambda j: -j[0])[:4]:
        entries.append({"at": b["at"], "bar": b["bar"], "why": f"drop: energy {before:.2f} to {b['energy']:.2f}"})
    strong = sorted(out, key=lambda b: -b["energy"])[:3]
    for b in sorted(strong, key=lambda b: b["at"]):
        if not any(e["bar"] == b["bar"] for e in entries):
            entries.append({"at": b["at"], "bar": b["bar"], "why": f"strong bar: energy {b['energy']:.2f}"})
    entries.sort(key=lambda e: e["at"])
    return out, entries


def main():
    cmd, path = sys.argv[1], sys.argv[2]
    if cmd == "measure":
        print(json.dumps(measure(path)))
        return
    if cmd == "beats":
        x = decode(path)
        if len(sys.argv) > 3:
            given = json.load(open(sys.argv[3]))
            bpm, beats, by = given["bpm"], given["beatTimes"], "hyperframes beats"
        else:
            (bpm, beats), by = tempo(x), "untell (onset autocorrelation)"
        bar_list, entries = bars(x, beats)
        print(json.dumps({"bpm": bpm, "beatsBy": by, "beats": beats, "bars": bar_list, "entries": entries,
                          "duration": round(len(x) / RATE, 3)}))
        return
    raise SystemExit(f"unknown command {cmd}")


if __name__ == "__main__":
    main()
