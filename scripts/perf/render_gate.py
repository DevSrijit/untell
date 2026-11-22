"""The quality gate for a render made another way: how far it is from the framework's own render.

Usage: python3 scripts/perf/render_gate.py <candidate.mp4> <reference.mp4> [--json]
Video, every frame, decoded to grey at full size: the share of pixels more than 40 levels apart (hf_check's rule
for two renderers: under 1 %), the mean difference, and SSIM (ffmpeg's ssim filter, per frame).
Sound, decoded to 48 kHz stereo: the correlation of the two signals and the level of their difference against the
reference, in dB (lower is closer), after the best alignment within 50 ms.
It exits 1 when a frame is 1 % or more off, or when the sound misses: correlation under 0.999, the difference
less than 25 dB below the reference, or sound on one side only.
"""
import json
import subprocess
import sys

import numpy as np

cand, ref = sys.argv[1], sys.argv[2]


def probe(p):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,nb_frames", "-of", "json", p],
                         capture_output=True, text=True).stdout
    s = json.loads(out)["streams"][0]
    return int(s["width"]), int(s["height"]), int(s.get("nb_frames") or 0)


def frames(p, w, h):
    pr = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", p, "-f", "rawvideo", "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE)
    n = w * h
    while True:
        b = pr.stdout.read(n)
        if len(b) < n:
            break
        yield np.frombuffer(b, dtype=np.uint8).reshape(h, w)


w, h, _ = probe(ref)
cw, ch, _ = probe(cand)
res = {"size": [cw, ch], "refSize": [w, h]}
if (cw, ch) != (w, h):
    res["error"] = "sizes differ"
    print(json.dumps(res))
    sys.exit(1)
off, mean = [], []
for a, b in zip(frames(cand, w, h), frames(ref, w, h)):
    d = np.abs(a.astype(np.int16) - b.astype(np.int16))
    off.append(float((d > 40).mean() * 100))
    mean.append(float(d.mean()))
ssim = subprocess.run(["ffmpeg", "-i", cand, "-i", ref, "-lavfi", "[0:v][1:v]ssim=stats_file=-", "-f", "null", "-"], capture_output=True, text=True).stdout
per = [float(l.split("All:")[1].split()[0]) for l in ssim.splitlines() if "All:" in l]
res.update({"frames": len(off), "worstOffPct": max(off) if off else None, "worstFrame": int(np.argmax(off)) if off else None,
            "meanDiff": float(np.mean(mean)) if mean else None, "ssimMin": min(per) if per else None, "ssimMean": float(np.mean(per)) if per else None})


def pcm(p):
    r = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", p, "-vn", "-f", "f32le", "-ac", "2", "-ar", "48000", "-"], capture_output=True)
    return np.frombuffer(r.stdout, dtype=np.float32).reshape(-1, 2).mean(axis=1) if r.stdout else None


a, b = pcm(cand), pcm(ref)
if a is not None and b is not None and len(a) and len(b):
    n = min(len(a), len(b))
    best = None
    for lag in range(-2400, 2401, 48):  # 50 ms each way, 1 ms steps
        x = a[max(0, lag):n + min(0, lag)]
        y = b[max(0, -lag):n - max(0, lag)]
        m = min(len(x), len(y))
        x, y = x[:m], y[:m]
        e = float(np.sqrt(np.mean((x - y) ** 2)) / (np.sqrt(np.mean(y ** 2)) + 1e-12))
        if best is None or e < best[1]:
            best = (lag, e, float(np.corrcoef(x, y)[0, 1]))
    res["sound"] = {"lagMs": best[0] / 48, "diffDb": round(20 * np.log10(best[1] + 1e-12), 1), "correlation": round(best[2], 4)}
else:
    res["sound"] = None if (a is None and b is None) else "one side has no sound"
# Sound: the two mixes must line up and match (correlation at least 0.999, the difference at least 25 dB below the
# reference), and both sides must have sound or neither.
snd = res["sound"]
sound_ok = snd is None or (isinstance(snd, dict) and snd["correlation"] >= 0.999 and snd["diffDb"] <= -25)
res["pass"] = bool(res.get("worstOffPct") is not None and res["worstOffPct"] < 1 and sound_ok)
print(json.dumps(res))
sys.exit(0 if res["pass"] else 1)
