"""Cover check: type behind a cut-out subject must still read.

Usage: python3 scripts/inspect/cover.py <recording id or dir>   (exit code 1 when a rule fails)

A cut-out (an image with data-cutout, such as the photo block's `over` subject) may cover type on purpose.
That is the "type behind the subject" device, and HyperFrames' own check is told to accept it. This check
measures what the viewer loses. For every frame it maps the cut-out's alpha into the frame through the
image's drawn box (its fit, focus and motion), then reads how much of each letter's ink box the subject
hides. The recorder writes the ink boxes (elements.json "glyphs") from the font's own glyph metrics.

Rules:
  letter  no letter more than 30 % hidden. A letter hidden past that stops reading as itself.
  word    no text element more than 15 % hidden over all its letters together.
Hair and other soft edges count by their alpha: a strand at 40 % alpha hides 40 % of what is under it.
The verdict is checks/cover_rule.py judge(), the one the kit's placeBehind gives on its own estimate.
"""
import json
import sys
import os
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent / "checks"))
import cover_rule  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent))
from media_paths import media_file  # noqa: E402

LETTER_MAX = cover_rule.LETTER_MAX
WORD_MAX = cover_rule.WORD_MAX
# The repository root, or the work tree that untell builds in a project (UNTELL_ROOT).
ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[2])


def load(rec):
    d = Path(rec)
    if not d.exists():
        d = ROOT / "out" / "recordings" / rec
    return d, json.loads((d / "elements.json").read_text())


_alpha = {}


def alpha_of(src):
    # The page path ends in .../media/<name>/<file>; the file lives in assets/media.
    tail = src.split("/media/", 1)[-1]
    if tail not in _alpha:
        im = Image.open(media_file(tail))
        _alpha[tail] = np.asarray(im.getchannel("A"), dtype=np.float32) / 255.0 if im.mode in ("RGBA", "LA") else None
    return _alpha[tail]


def pct(v, size):
    v = v.strip()
    return float(v[:-1]) / 100 if v.endswith("%") else None


def coverage(img, box):
    """The share of a frame box [x0, y0, x1, y1] that the cut-out hides, by alpha."""
    a = alpha_of(img["src"])
    if a is None:
        return 0.0
    nh, nw = a.shape
    bx, by, bw, bh = img["box"]
    s = max(bw / nw, bh / nh) if img.get("fit", "cover") == "cover" else min(bw / nw, bh / nh)
    dw, dh = nw * s, nh * s
    pos = (img.get("position") or "50% 50%").split()
    fx, fy = (pct(pos[0], bw) or 0.5), (pct(pos[1] if len(pos) > 1 else "50%", bh) or 0.5)
    ox, oy = bx + (bw - dw) * fx, by + (bh - dh) * fy
    # Only the visible part of the image counts (its crop box).
    vx0, vy0, vx1, vy1 = img["x"], img["y"], img["x"] + img["w"], img["y"] + img["h"]
    x0, y0, x1, y1 = box
    n = 14
    xs = x0 + (np.arange(n) + 0.5) / n * (x1 - x0)
    ys = y0 + (np.arange(n) + 0.5) / n * (y1 - y0)
    X, Y = np.meshgrid(xs, ys)
    inside = (X >= vx0) & (X < vx1) & (Y >= vy0) & (Y < vy1)
    u = ((X - ox) / s).astype(int)
    v = ((Y - oy) / s).astype(int)
    ok = inside & (u >= 0) & (u < nw) & (v >= 0) & (v < nh)
    hid = np.zeros_like(X)
    hid[ok] = a[v[ok], u[ok]]
    return float(hid.mean() * img.get("opacity", 1))


def check(rec):
    d, data = load(rec)
    fps = data.get("fps", 30)
    fails = {}  # (text id, rule) -> {frames, worst, detail}
    worst_any = 0.0
    behind = 0
    for f, els in enumerate(data["frames"]):
        cuts = [e for e in els if e.get("kind") == "image" and e.get("cutout")]
        if not cuts:
            continue
        for t in els:
            if t.get("kind") != "text" or not t.get("glyphs") or t.get("opacity", 1) < 0.5:
                continue
            over = [c for c in cuts if c["z"] > t["z"]]
            if not over:
                continue
            letters = []
            for g in t["glyphs"]:
                box = g[1:5]
                area = max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])
                hidden = 1 - np.prod([1 - coverage(c, box) for c in over])
                letters.append((chr(g[0]), hidden, area))
            if not letters:
                continue
            # The one verdict (checks/cover_rule.py), the same that the kit's placeBehind gives on its own estimate.
            v = cover_rule.judge(letters)
            top, word = v["letter"], v["word"]
            ch = max(letters, key=lambda x: x[1])[0]
            worst_any = max(worst_any, top)
            if top > 0.05:
                behind += 1
            for rule, value, limit, detail in (("letter", top, LETTER_MAX, f'"{ch}" {top:.0%} hidden'), ("word", word, WORD_MAX, f"{word:.0%} of the word hidden")):
                if rule in v["fails"]:
                    k = (t["id"].split(":")[0], t.get("text", ""), rule)
                    r = fails.setdefault(k, {"frames": [], "worst": 0, "detail": ""})
                    r["frames"].append(f)
                    if value > r["worst"]:
                        r["worst"], r["detail"] = value, detail
    out = []
    for (tid, text, rule), r in sorted(fails.items(), key=lambda kv: kv[1]["frames"][0]):
        fr = r["frames"]
        out.append({"id": tid, "text": text, "rule": rule, "from": round(fr[0] / fps, 2), "to": round(fr[-1] / fps, 2), "frames": len(fr), "worst": round(r["worst"], 3), "detail": r["detail"]})
    report = {"letterMax": LETTER_MAX, "wordMax": WORD_MAX, "errors": out, "textFramesBehindSubject": behind, "worstLetter": round(worst_any, 3)}
    (d / "cover.json").write_text(json.dumps(report, indent=1))
    return report


def main():
    rep = check(sys.argv[1])
    print(f"cover check ({sys.argv[1]}): letters at most {LETTER_MAX:.0%} hidden, words at most {WORD_MAX:.0%}")
    for e in rep["errors"]:
        print(f'  ✗ {e["from"]:.2f} to {e["to"]:.2f} s  {e["id"]} "{e["text"]}"  {e["rule"]}: {e["detail"]}')
    print(f'  {len(rep["errors"])} error(s); text behind a subject in {rep["textFramesBehindSubject"]} text-frames; worst letter {rep["worstLetter"]:.0%} hidden')
    sys.exit(1 if rep["errors"] else 0)


if __name__ == "__main__":
    main()
