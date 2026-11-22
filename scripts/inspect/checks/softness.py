"""softness: a picture or clip drawn larger than its file (upscale factor over 1.15 warns, over 1.25 fails:
the same two limits as the photo block's UPSCALE).

Photos: the recorder's natural size and drawn box with its fit (cover: the larger of the two ratios).
Clips: the element joined to its image node by its data-el label, and the file's size from media.gen.ts.
The worst factor over the whole film counts, so a push that ends past the file's size is caught.
"""
import re

from film import ROOT, finding

LIMIT = 1.15  # warn
FAIL = 1.25   # error


def media_sizes():
    text = (ROOT / "src" / "system" / "media.gen.ts").read_text()
    return {m.group(1): (int(m.group(2)), int(m.group(3))) for m in re.finditer(r'"([^"]+)": \{ kind: "(?:photo|video)", width: (\d+), height: (\d+)', text)}


def check(film):
    sizes = media_sizes()
    worst = {}
    for f in range(film.n):
        for e in film.elements(f):
            if e["kind"] != "image" or e["opacity"] < 0.5:
                continue
            if e.get("natural") and e.get("box"):
                nw, nh = e["natural"]
                bw, bh = e["box"][2], e["box"][3]
                # The recorder keeps the page's absolute URL; the finding names the file as the scene does (<name>/<file>).
                src = e.get("src", "").split("/media/", 1)[-1].replace("file://", "")
                fit = e.get("fit", "fill")
            else:
                node = film.node(film.label(e["id"]))
                if not node or not node.get("src"):
                    continue
                name = node["src"].split("/")[0]
                if name not in sizes:
                    continue
                nw, nh = sizes[name]
                bw, bh = e["w"], e["h"]  # the visible box; a clip has no natural size in the recording
                src, fit = node["src"], node.get("fit", "cover")
            if not nw or not nh:
                continue
            up = max(bw / nw, bh / nh) if fit in ("cover", "fill", "none") else min(bw / nw, bh / nh)
            key = film.label(e["id"])
            if up > worst.get(key, (0,))[0]:
                worst[key] = (up, f, src, [nw, nh], [round(bw), round(bh)])
    out = []
    for node, (up, f, src, nat, box) in worst.items():
        if up > LIMIT:
            out.append(finding("softness", "error" if up > FAIL else "warning", film.t(f), film.t(f), {"upscale": round(up, 2), "file": nat, "drawn": box, "src": src}, {"warnOver": LIMIT, "max": FAIL},
                               f"Use a larger file (at least {round(box[0] / LIMIT)} x {round(box[1] / LIMIT)} px for this box) or draw the picture smaller.", node=node))
    return out
