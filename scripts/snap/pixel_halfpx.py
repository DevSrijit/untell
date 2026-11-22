"""Labels half-px findings on boxes from the pixels: is the box edge soft (an in-between px at the edge) or crisp?

Usage: python3 scripts/snap/pixel_halfpx.py <issues file> [<issues file> ...] --out <labels.json>
For each half-px row on a box or picture (not a line, not a text), it reads the frame shot across the edge, at the
box's middle. Soft: a px at the edge sits between its two neighbours by a fifth of their step or more on both sides.
Soft is "real" (the edge blurs), crisp is "measure" (the painter rounded the box: the model's fraction is not drawn).
Rows already labelled in the output file keep their label.
"""
import json
import os
import sys
from pathlib import Path

from PIL import Image

args = sys.argv[1:]
out_path = Path(args[args.index("--out") + 1])
files = [a for i, a in enumerate(args) if a != "--out" and (i == 0 or args[i - 1] != "--out")]
ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "out" / "snap" / "judge"
have = {l["key"]: l for l in json.loads(out_path.read_text())} if out_path.exists() else {}


def soft(seq):
    for i in range(1, len(seq) - 1):
        a, m, c = sum(seq[i - 1]), sum(seq[i]), sum(seq[i + 1])
        step = abs(c - a)
        if step >= 60 and min(a, c) + 0.2 * step < m < max(a, c) - 0.2 * step:
            return True
    return False


n_new = 0
for f in files:
    for r in json.loads(Path(f).read_text()):
        if r["kind"] != "half-px" or r.get("ignored") or r["kinds"][0] in ("path", "text") or r["level"] == "advice":
            continue
        key = f"{r['film']}|{r['kind']}|{r['el']}|{r['feature']}|{r['target']['el']}|{r['target']['feature']}|{r['axis']}"
        if key in have:
            continue
        p = D / "shots" / f"{r['film']}-{r['frame']}.png"
        if not p.exists() or not r.get("elBox"):
            continue
        im = Image.open(p).convert("RGB")
        b, v = r["elBox"], r["v"]
        if r["axis"] == "y":
            x = int((b["x0"] + b["x1"]) / 2)
            seq = [im.getpixel((x, y)) for y in range(int(v) - 2, int(v) + 3)]
        else:
            y = int((b["y0"] + b["y1"]) / 2)
            seq = [im.getpixel((x, y)) for x in range(int(v) - 2, int(v) + 3)]
        s = soft(seq)
        have[key] = {"key": key, "film": r["film"], "verdict": "real" if s else "measure", "cls0": "half-px-box",
                     "why": "The edge is soft in the pixels (an in-between px at the edge)." if s else "The box edge is crisp in the pixels: the painter rounded it.",
                     "px": r["off"], "level0": r["level"], "t": r["at"]}
        n_new += 1
out_path.write_text(json.dumps(list(have.values()), indent=1))
print(f"{n_new} new half-px box label(s); {sum(1 for l in have.values() if l['verdict'] == 'real')} real of {len(have)}")
