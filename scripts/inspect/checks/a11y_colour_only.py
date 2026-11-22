"""a11y/colour-only: shapes that differ only by hue must stay apart for colour-blind viewers.

For each lossless key frame, the distinct fill colours of the boxes on screen (at least 0.2 % of the frame, not
the ground) are paired. Each pair is simulated for deuteranopia and protanopia (Machado 2009, severity 1). A pair
that is clearly apart in normal vision (contrast 1.5:1 or more, or a hue difference) but under 1.5:1 contrast and
under 0.08 OKLab distance in a simulation is a warning, unless the frame also holds text near both (a label).
Labels, dashes and shapes as second cues are only checked as "text near both"; SVG marks are not measured yet.
"""
import numpy as np

from common import parse_rgb, to_oklab
from contrast_over_picture import lum
from film import finding

DEUT = np.array([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]])
PROT = np.array([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]])


def sim(rgb, m):
    c = np.asarray(rgb, dtype=np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    s = np.clip(m @ lin, 0, 1)
    return np.where(s <= 0.0031308, s * 12.92, 1.055 * s ** (1 / 2.4) - 0.055) * 255


def ratio(a, b):
    la, lb = float(lum(a)), float(lum(b))
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def dist(a, b):
    return float(np.linalg.norm(to_oklab(np.array([a], dtype=np.float64))[0] - to_oklab(np.array([b], dtype=np.float64))[0]))


def check(film):
    area = film.W * film.H
    bad = {}
    for f in range(0, film.n, 15):
        boxes = [e for e in film.content(f, 0.8) if e["kind"] == "box" and e["w"] * e["h"] >= 0.002 * area and parse_rgb(e.get("fill"))]
        fills = {}
        for e in boxes:
            fills.setdefault(parse_rgb(e["fill"]), []).append(e)
        cols = list(fills)
        texts = [t for t in film.ink[f] if t["opacity"] >= 0.5]
        for i, a in enumerate(cols):
            for b in cols[i + 1:]:
                if dist(a, b) < 0.08:
                    continue  # not apart in normal vision either
                for name, m in (("deuteranopia", DEUT), ("protanopia", PROT)):
                    sa, sb = sim(a, m), sim(b, m)
                    if ratio(sa, sb) < 1.5 and dist(sa, sb) < 0.08:
                        def labelled(es):
                            return any(any(abs((t["ink"][0] + t["ink"][2]) / 2 - (e["x"] + e["w"] / 2)) < e["w"] / 2 + 80 and
                                           abs((t["ink"][1] + t["ink"][3]) / 2 - (e["y"] + e["h"] / 2)) < e["h"] / 2 + 80 for t in texts) for e in es)
                        if labelled(fills[a]) and labelled(fills[b]):
                            continue
                        key = (a, b, name)
                        bad.setdefault(key, []).append(f)
    return [finding("a11y/colour-only", "warning", film.t(fs[0]), film.t(fs[-1]), {"colours": ["rgb%s" % (a,), "rgb%s" % (b,)], "simulation": name},
                    {"minRatio": 1.5, "minOklab": 0.08}, "Give these two a second cue: a label beside each, a pattern or dash, or tones that differ in lightness, not hue only.")
            for (a, b, name), fs in bad.items()]
