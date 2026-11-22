"""Zoom inspector: 2-4x close-ups of a lossless frame, with pixel rulers in source coordinates.

The other tools say where to look (a near-miss edge, a competing focal point, an off-palette region);
this renders only those spots, large, so a model can see a 1 px gap or a ragged edge.
"""
import sys

from PIL import Image, ImageDraw

from common import font, load, out_dir

MAX_W = 1400
RULER = 46


def zoom(rec, f, box, note="", index=0, pad=40):
    x, y, w, h = [int(round(v)) for v in box]
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(rec.width, x + w + pad), min(rec.height, y + h + pad)
    crop = rec.frame(f).crop((x0, y0, x1, y1))
    k = max(2, min(4, MAX_W // max(1, crop.width)))
    big = crop.resize((crop.width * k, crop.height * k), Image.NEAREST)
    out = Image.new("RGB", (big.width + RULER, big.height + RULER + 44), (250, 250, 250))
    out.paste(big, (RULER, RULER + 44))
    d = ImageDraw.Draw(out)
    d.text((8, 8), f"frame {f} ({f / rec.fps:.2f} s) · {k}x · source px {x0}-{x1}, {y0}-{y1} · {note}"[:120], fill=(20, 20, 20), font=font(22))
    # Rulers in source pixels: a tick every 10 px, a label every 50.
    for sx in range(x0 - x0 % 10 + 10, x1, 10):
        px = RULER + (sx - x0) * k
        major = sx % 50 == 0
        d.line([(px, RULER + 44 - (14 if major else 6)), (px, RULER + 44)], fill=(60, 60, 60), width=1)
        if major:
            d.text((px + 2, 46), str(sx), fill=(60, 60, 60), font=font(16))
    for sy in range(y0 - y0 % 10 + 10, y1, 10):
        py = RULER + 44 + (sy - y0) * k
        major = sy % 50 == 0
        d.line([(RULER - (14 if major else 6), py), (RULER, py)], fill=(60, 60, 60), width=1)
        if major:
            d.text((2, py + 2), str(sy), fill=(60, 60, 60), font=font(16))
    # The box of interest.
    bx, by = RULER + (x - x0) * k, RULER + 44 + (y - y0) * k
    d.rectangle([bx, by, bx + w * k, by + h * k], outline=(255, 0, 140), width=2)
    path = out_dir(rec) / f"zoom-f{f:04d}-{index}.png"
    out.save(path)
    return path


if __name__ == "__main__":
    rec = load(sys.argv[1])
    f = int(sys.argv[2])
    box = [float(v) for v in sys.argv[3].split(",")]
    print(zoom(rec, f, box, "manual"))
