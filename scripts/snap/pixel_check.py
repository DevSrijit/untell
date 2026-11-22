"""Measures text ink from the frame shots, to check the model's text measures (scripts/snap/judge.ts shots).

Usage: python3 scripts/snap/pixel_check.py [--tag before] [--match <regex>]
For each row at warning or error whose element is a text and whose feature is its ink centre on y (bandCy), it finds
the ink rows in the shot (first row with ink; last busy row = baseline) and prints the model's band centre, the
pixel band centre, and the offset to the target measured both ways. A row where the two differ by 0.75 px or more
is a measure to look at.
"""
import argparse
import json
import re
import sys
from pathlib import Path

from PIL import Image

sys.argv, argv = [sys.argv[0]], sys.argv[1:]
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "out" / "snap" / "judge"
ap = argparse.ArgumentParser()
ap.add_argument("--tag", default="before")
ap.add_argument("--match")
a = ap.parse_args(argv)


def ink_rows(im, b):
    W, H = im.size
    x0, y0, x1, y1 = int(max(0, b["x0"])), int(max(0, b["y0"] - 4)), int(min(W, b["x1"] + 1)), int(min(H, b["y1"] + 5))
    c = im.crop((x0, y0, x1, y1))
    px = c.load()
    border = sorted([px[i, 0] for i in range(c.width)] + [px[i, c.height - 1] for i in range(c.width)], key=sum)
    bg = border[len(border) // 2]
    counts = [sum(1 for xx in range(c.width) if max(abs(px[xx, yy][k] - bg[k]) for k in range(3)) > 60) for yy in range(c.height)]
    mx = max(counts)
    if not mx:
        return None
    top = next(i for i, n in enumerate(counts) if n >= max(2, 0.04 * mx))
    busy = [i for i, n in enumerate(counts) if n >= 0.25 * mx]
    return y0 + top, y0 + busy[-1] + 1


rows = json.loads((D / f"issues-{a.tag}.json").read_text())
for r in rows:
    if r["level"] == "advice" or r.get("ignored") or r["axis"] != "y" or r["feature"] != "bandCy" or r["kinds"][0] != "text":
        continue
    if a.match and not re.search(a.match, r["film"]):
        continue
    shot = D / "shots" / f"{r['film']}-{r['frame']}.png"
    if not shot.exists():
        continue
    ir = ink_rows(Image.open(shot).convert("RGB"), r["elBox"])
    if not ir:
        continue
    pc = (ir[0] + ir[1]) / 2
    print(f"{r['film']:34} {r['el']:22} model {r['v']:7.1f} pixels {pc:7.1f} ({ir[0]}-{ir[1]})  off model {r['off']:+5.1f} pixels {pc - r['to']:+5.1f}  {'LOOK' if abs(pc - r['v']) >= 0.75 else ''}")
