"""sameness (project level): films in one project that share a music track, a picture, or near-identical key frames.

Usage: python3 scripts/inspect/checks/sameness.py <film id> <film id> ...   (prints JSON; bun scripts/detect.ts --sameness runs it)
Each film must be captured first (out/detector/<id>/capture.json).
  track    two films whose music nodes play the same prepared track
  picture  two films that draw the same prepared picture or clip (by its media name)
  frames   two key frames (every 0.5 s) whose 36 x 64 colour thumbnails differ by a mean of DIFF_MAX levels or
           less and whose normalised grey layouts correlate at CORR_MIN or more, both with content (at least BUSY of the frame off its main colour), so two empty grounds do not count
scripts/sameness_wall.py draws the same films side by side for the eye; this check measures.
"""
import json
import sys
from itertools import combinations
import os
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from film import DET, finding  # noqa: E402

# The repository root, or the work tree that untell builds in a project (UNTELL_ROOT).
ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[3])
DIFF_MAX = 8.0  # mean difference per channel, 0-255, on 36 x 64 colour thumbnails
CORR_MIN = 0.9  # and the layouts match: correlation of the normalised 54 x 96 grey frames
BUSY = 0.10  # a key frame counts when at least 10 % of it is off its main colour


def media_name(src):
    tail = src.split("/media/", 1)[-1]
    return tail.split("/")[0]


def facts(fid):
    cap = json.loads((DET / fid / "capture.json").read_text())
    nodes = cap.get("nodes") or []
    gen = (ROOT / "src" / "system" / "media.gen.ts").read_text()
    music = {media_name(n["src"]) for n in nodes if n.get("kind") == "audio" and f'"{media_name(n["src"])}": {{ kind: "music"' in gen}
    pics = {media_name(n["src"]) for n in nodes if n.get("kind") == "image" and n.get("src")}
    d = ROOT / "out" / "recordings" / fid / "frames"
    n, fps = cap["durationInFrames"], cap["fps"]
    hashes = []
    for f in range(0, n, fps // 2):
        im = np.asarray(Image.open(d / f"f{f:04d}.jpg").convert("RGB").resize((36, 64), Image.BILINEAR), dtype=np.int16)
        q = (im // 16).reshape(-1, 3)
        _, counts = np.unique(q[:, 0] * 256 + q[:, 1] * 16 + q[:, 2], return_counts=True)
        if counts.max() / len(q) > 1 - BUSY:  # mostly one colour: an empty ground matches any other
            continue
        g = np.asarray(Image.open(d / f"f{f:04d}.jpg").convert("L").resize((54, 96), Image.BILINEAR), dtype=np.float64)
        g = (g - g.mean()) / (g.std() + 1e-6)
        hashes.append((f / fps, im, g))
    return {"music": music, "pictures": pics, "hashes": hashes}


def main():
    ids = sys.argv[1:]
    fx = {i: facts(i) for i in ids}
    out = []
    for a, b in combinations(ids, 2):
        A, B = fx[a], fx[b]
        for m in sorted(A["music"] & B["music"]):
            out.append(finding("sameness", "error", 0, 0, {"films": [a, b], "track": m}, {"shared": 0},
                               f"Give {b} its own track: two films of one project on the same music read as one template."))
        for p in sorted(A["pictures"] & B["pictures"]):
            out.append(finding("sameness", "warning", 0, 0, {"films": [a, b], "picture": p}, {"shared": 0},
                               f"Use a different picture in {b}, or a clearly different crop and grade of it."))
        best = None
        for ta, ha, ga in A["hashes"]:
            for tb, hb, gb in B["hashes"]:
                d = float(np.abs(ha - hb).mean())
                if d > DIFF_MAX:
                    continue
                r = float((ga * gb).mean())
                if r >= CORR_MIN and (best is None or r > best[0]):
                    best = (r, ta, tb, d)
        if best:
            out.append(finding("sameness", "error", best[1], best[1], {"films": [a, b], "at": [round(best[1], 2), round(best[2], 2)], "meanDiff": round(best[3], 1), "layoutCorr": round(best[0], 3)},
                               {"maxMeanDiff": DIFF_MAX, "maxLayoutCorr": CORR_MIN}, f"Change the layout of one of these frames ({a} at {best[1]:.1f} s, {b} at {best[2]:.1f} s): they look the same."))
    print(json.dumps({"films": ids, "findings": out}))


if __name__ == "__main__":
    main()
