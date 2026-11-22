"""repeat-shot: the same picture at a near-identical framing twice in one film.

Shots shorter than 0.4 s are the cuts of a montage: the montage is one event, so they are not compared.

A shot is one image element's run of visible frames. Two shots of the same file that do not overlap in time
repeat when the part of the file they show (the crop, from the drawn box, the fit and the focus) and their
place in the frame both match (intersection over union over CROP_IOU and BOX_IOU).
The same photo again as another shot: the cut-out subject of a prepared photo and that photo's plate (one media folder),
one after the other (they may overlap for up to OVERLAP s: a whip from one to the other), where SAME_VIEW or more of the
smaller crop lies inside the other (the same subject shows twice). A warning: the viewer sees the same picture again
(an agent's Courtside film's p-hall). A plate shown again in a new framing is not this rule: that is the first rule's fix.
"""
from film import finding

CROP_IOU = 0.85
MONTAGE = 0.4  # shots shorter than this (s) are cuts of a montage
BOX_IOU = 0.75
OVERLAP = 0.3  # s: two shots of one photo may overlap this long for a transition
SAME_VIEW = 0.6  # the share of the smaller crop inside the other: one shot is a zoom of the other


def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    i = ix * iy
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i
    return i / u if u > 0 else 0.0


def crop(e):
    """The visible part of the file, in file fractions."""
    nw, nh = e["natural"]
    bx, by, bw, bh = e["box"]
    s = max(bw / nw, bh / nh) if e.get("fit") == "cover" else min(bw / nw, bh / nh)
    pos = (e.get("position") or "50% 50%").split()
    fx = float(pos[0][:-1]) / 100 if pos[0].endswith("%") else 0.5
    fy = float(pos[1][:-1]) / 100 if len(pos) > 1 and pos[1].endswith("%") else 0.5
    ox, oy = bx + (bw - nw * s) * fx, by + (bh - nh * s) * fy
    return [(e["x"] - ox) / s / nw, (e["y"] - oy) / s / nh, (e["x"] + e["w"] - ox) / s / nw, (e["y"] + e["h"] - oy) / s / nh]


def photo_of(src):
    """The prepared photo a file belongs to: its media folder (p-hall/subject.png and p-hall/plate.jpg are one photo)."""
    parts = str(src).split("/")
    return parts[-2] if len(parts) > 1 else src


def contained(a, b):
    """The share of the smaller of two crops (file fractions) that lies inside the other."""
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    small = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return ix * iy / small if small > 0 else 0.0


def check(film):
    shots = {}
    for f in range(film.n):
        for e in film.elements(f):
            if e["kind"] != "image" or e["opacity"] < 0.5 or not e.get("natural") or not e.get("box"):
                continue
            s = shots.setdefault(e["id"], {"src": e["src"], "frames": [], "mid": None, "cutout": bool(e.get("cutout"))})
            s["frames"].append(f)
            s["last"] = e
    items = []
    montage = int(MONTAGE * film.fps)
    for eid, s in shots.items():
        if len(s["frames"]) < montage:
            continue  # a cut in a fast montage: the montage is one event, not a repeat
        e = s["last"]
        items.append({"id": eid, "src": s["src"], "photo": photo_of(s["src"]), "cutout": s["cutout"], "a": s["frames"][0], "b": s["frames"][-1],
                      "crop": crop(e), "box": [e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]]})
    out, said = [], set()
    for i, p in enumerate(items):
        for q in items[i + 1:]:
            first, second = sorted([p, q], key=lambda x: x["a"])
            # The same photo again as another shot: its cut-out subject and then its plate (or the other way), where one
            # shows the other's view. The two may overlap for a transition (OVERLAP s: a whip from one to the other).
            # A plate shown again in a new framing is not this rule (the first rule's fix asks for exactly that).
            apart = first["b"] - second["a"] <= OVERLAP * film.fps and second["b"] > first["b"]
            if p["photo"] == q["photo"] and p["cutout"] != q["cutout"] and apart and (second["id"], "photo") not in said:
                inside = contained(p["crop"], q["crop"])
                if inside >= SAME_VIEW and not (p["src"] == q["src"] and iou(p["crop"], q["crop"]) > CROP_IOU and iou(p["box"], q["box"]) > BOX_IOU):
                    said.add((second["id"], "photo"))
                    out.append(finding("repeat-shot", "warning", film.t(second["a"]), film.t(second["b"]),
                                       {"photo": p["photo"], "first": round(film.t(first["a"]), 2), "firstAs": "cut-out" if first["cutout"] else "plate",
                                        "secondAs": "cut-out" if second["cutout"] else "plate", "sameView": round(inside, 2)},
                                       {"sameView": SAME_VIEW},
                                       "This photo shows its subject a second time: use another photo for this shot, or let the first shot carry the moment.",
                                       node=film.label(second["id"])))
                    continue
            if p["src"] != q["src"] or p["cutout"] or q["cutout"] or not (p["b"] < q["a"] or q["b"] < p["a"]):
                continue
            ci, bi = iou(p["crop"], q["crop"]), iou(p["box"], q["box"])
            if ci > CROP_IOU and bi > BOX_IOU:
                first, second = sorted([p, q], key=lambda x: x["a"])
                out.append(finding("repeat-shot", "warning", film.t(second["a"]), film.t(second["b"]),
                                   {"src": p["src"], "first": round(film.t(first["a"]), 2), "cropIoU": round(ci, 2), "boxIoU": round(bi, 2)},
                                   {"cropIoU": CROP_IOU, "boxIoU": BOX_IOU},
                                   "Show this picture a second time only with a new framing (another crop, scale or place), or use a different picture.",
                                   node=film.label(second["id"])))
    return out
