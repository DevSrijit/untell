"""spoiler: the answer shows before its reveal, as placeholders at low contrast in the places the reveal fills.

The reveal: the one the scene declares (film.declared_reveal: an anchor "reveal", or a terminal's result line), else
the largest entrance in the last third of the film (film.entrance_groups, by area). Its items are what cuts in
within REVEAL_WINDOW of it (SVG shapes by painted box, boxes and pictures by their element, text by its ink).
A placeholder: another node, on screen at least HOLD_S in the time before the reveal (from 0 to the reveal less
LEAD_S), whose box matches a revealed item's box (intersection over union IOU or more; text must also be the same
text), drawn fainter than that item: its contrast to the ground is under FAINT of the item's, or its opacity is
under 0.6. A finding when PLACEHOLDERS or more revealed items have one, and they are at least half of the items:
the viewer can count the answer before the film tells it (the critic's "skeleton loader").
Not measured: a spoiler in another form (the same number written smaller elsewhere, an earlier chart that shows the
result). Those need the meaning of the content; the notes say what was compared.
"""
import re

from film import declared_reveal, entrance_groups, finding

REVEAL_WINDOW = 1.0  # s: the revealed items are those that cut in within this time from the reveal
LEAD_S, HOLD_S = 0.5, 0.3
IOU, FAINT, PLACEHOLDERS = 0.8, 0.6, 3


def iou(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / u if u > 0 else 0.0


def lum(rgb):
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(rgb, ground):
    a, b = lum(rgb), lum(ground)
    return (max(a, b) + 0.05) / (min(a, b) + 0.05)


def parse(c):
    m = re.findall(r"[\d.]+", c or "")
    return tuple(float(v) for v in m[:3]) if len(m) >= 3 else None


def items_at(film, f):
    """Everything drawn at frame f: (key, kind, box, colour, opacity, text)."""
    out = []
    shapes = (film.cap.get("shapes") or {}).get("frames") or []
    for s in shapes[f] if f < len(shapes) else []:
        if s.get("layer") in ("ground", "texture"):
            continue
        out.append(("s:" + s["id"], "shape", tuple(s["box"]), parse(s.get("fill") or s.get("stroke")), s.get("opacity", 1), None))
    for e in film.content(f, 0.05):
        if e["kind"] in ("box", "image"):
            out.append(("e:" + film.label(e["id"]), e["kind"], (e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]), parse(e.get("fill")), e["opacity"], None))
    for t in film.ink[f]:
        if t["opacity"] >= 0.05:
            out.append(("t:" + (t.get("node") or film.label(t["id"])), "text", tuple(t["ink"]), parse(t.get("color")), t["opacity"], t["text"].strip()))
    return out


def check(film):
    groups = entrance_groups(film)
    dec = declared_reveal(film)
    if dec:
        t_rev, how = dec
        f_rev = round(t_rev * film.fps)
    else:
        late = [g for g in groups if g["f"] >= film.n * 2 / 3]
        if not late:
            film.notes.append({"check": "spoiler", "notMeasured": "no reveal", "why": "nothing cuts in in the last third and the scene declares no reveal"})
            return []
        g = max(late, key=lambda g: g["area"])
        f_rev, how = g["f"], "the largest entrance in the last third"
    win = round(REVEAL_WINDOW * film.fps)
    revealed = {}
    for g in groups:
        if abs(g["f"] - f_rev) <= 2 or (f_rev <= g["f"] <= f_rev + win):
            for k, kind, box, _ in g["items"]:
                revealed.setdefault(k, (kind, box))
    if not revealed:
        film.notes.append({"check": "spoiler", "reveal": round(f_rev / film.fps, 2), "how": how, "notMeasured": "nothing cuts in at the reveal"})
        return []
    # The revealed items as drawn once they are in (their colour and opacity), from the frame after the window.
    after = {it[0]: it for it in items_at(film, min(film.n - 1, f_rev + win + 1))}
    ground = tuple(float(v) for v in film.ground)
    first_seen, frames_seen = {}, {}
    end = f_rev - round(LEAD_S * film.fps)
    for f in range(0, max(0, end)):
        now = items_at(film, f)
        for k, (kind, box) in revealed.items():
            ref = after.get(k)
            if not ref or (box[2] - box[0]) * (box[3] - box[1]) < 16:
                continue
            for k2, kind2, box2, col2, op2, text2 in now:
                if k2 == k or iou(box, box2) < IOU:
                    continue
                if kind == "text" and text2 != ref[5]:
                    continue
                faint = op2 < 0.6
                if not faint and col2 and ref[3]:
                    faint = contrast(col2, ground) < FAINT * contrast(ref[3], ground)
                if faint:
                    first_seen.setdefault(k, f)
                    frames_seen[k] = frames_seen.get(k, 0) + 1
                    break
    held = [k for k, n in frames_seen.items() if n >= HOLD_S * film.fps]
    film.notes.append({"check": "spoiler", "reveal": round(f_rev / film.fps, 2), "how": how, "revealed": len(revealed), "placeholders": len(held),
                       "compared": "box (IoU) and, for text, the same text; contrast to the ground or opacity"})
    if len(held) < PLACEHOLDERS or len(held) < 0.5 * len(revealed):
        return []
    f0 = min(first_seen[k] for k in held)
    return [finding("spoiler", "error", film.t(f0), film.t(f_rev),
                    {"placeholders": len(held), "revealedItems": len(revealed), "shownBeforeRevealS": round((f_rev - f0) / film.fps, 2), "reveal": round(film.t(f_rev), 2), "revealFrom": how},
                    {"placeholders": PLACEHOLDERS - 1, "faintUnder": FAINT},
                    "Do not draw the answer before the reveal: remove the faint placeholders, or show them only from the reveal, so the count lands with it.",
                    node=", ".join(sorted(held)[:4]))]
