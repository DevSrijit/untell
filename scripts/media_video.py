"""Treats fetched footage for a design system, with the same grade as photos (media_treat.py).

Usage: python3 scripts/media_video.py assets/media/<name> <system id> [height]
Reads source.mp4 (or source.mov, source.webm, source.m4v); writes:
  plate.mp4      the footage, graded for the system, `height` px tall (default 1440), no sound
  plate-top.mp4  the same, its top eased into the ground, for footage framed low
  plate-dim.mp4  (systems with a dim level) the same, dimmed for type over it
  meta.json      size, duration, fps and the grade used

The grade's black and white points come once from frames sampled across the clip, not from each frame,
so the picture does not flicker. Both files use a keyframe every half second and no B-frames, so a
player seeks to any frame quickly and exactly (the recorder seeks frame by frame).
"""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from media_treat import dim_of, fade_top_array, grade_array, ground_of, key_levels  # noqa: E402

d = Path(sys.argv[1])
system = sys.argv[2]
height = int(sys.argv[3]) if len(sys.argv) > 3 else 1440
# The source clip: MP4, MOV, WebM or M4V.
src = next(p for p in sorted(d.glob("source.*")) if p.suffix.lower() in (".mp4", ".mov", ".webm", ".m4v"))

probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                   "stream=width,height,r_frame_rate:stream_side_data=rotation:format=duration", "-of", "json", str(src)],
                                  capture_output=True, text=True, check=True).stdout)
st = probe["streams"][0]
# A phone clip carries a rotation: ffmpeg turns the frames on decode, so the size must turn too.
if any(abs(int(float(s.get("rotation", 0)))) % 180 == 90 for s in st.get("side_data_list", [])):
    st["width"], st["height"] = st["height"], st["width"]
num, den = (int(v) for v in st["r_frame_rate"].split("/"))
fps = num / den
duration = float(probe["format"]["duration"])
W = round(st["width"] * height / st["height"] / 2) * 2
H = height


def frames(path, every=None):
    """Decoded RGB frames at W x H; with `every`, one frame each `every` seconds."""
    vf = f"scale={W}:{H}:flags=lanczos" + (f",fps=1/{every}" if every else "")
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(path), "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         stdout=subprocess.PIPE)
    size = W * H * 3
    while True:
        buf = p.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, dtype=np.uint8).reshape(H, W, 3).astype(np.float32) / 255.0
    p.wait()


# Fixed levels from about 12 frames across the clip.
samples = list(frames(src, every=max(0.5, duration / 12)))
levels = key_levels(samples, system)
ground = ground_of(system)


def encoder(path):
    return subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                             "-r", f"{num}/{den}", "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "17",
                             "-preset", "medium", "-g", str(max(1, round(fps / 2))), "-bf", "0", "-movflags", "+faststart",
                             "-an", str(path)], stdin=subprocess.PIPE)


outs = [("plate", encoder(d / "plate.mp4"))]
if ground is not None:
    outs.append(("top", encoder(d / "plate-top.mp4")))
if dim_of(system):
    outs.append(("dim", encoder(d / "plate-dim.mp4")))
n = 0
for a in frames(src):
    g = grade_array(a, system, levels)
    for kind, enc in outs:
        f = fade_top_array(g, ground) if kind == "top" else grade_array(a, system, levels, dim=dim_of(system)) if kind == "dim" else g
        enc.stdin.write((np.clip(f, 0, 1) * 255).round().astype(np.uint8).tobytes())
    n += 1
for _, enc in outs:
    enc.stdin.close()
    enc.wait()

meta = {"kind": "video", "width": W, "height": H, "duration": n / fps, "fps": fps, "subject": [0, 0, 1, 1],
        "centre": [0.5, 0.5], "grade": system, "levels": levels, "mask": None}
(d / "meta.json").write_text(json.dumps(meta, indent=1))
print(f"prepared {d.name} for {system}: {n} frames, {W}x{H}, {n / fps:.2f} s, levels {levels[0]:.3f}-{levels[1]:.3f}")
