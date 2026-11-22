"""The snap preview: one image that shows a frame before and after the chosen moves, and why.

Usage: python3 scripts/snap/preview.py --dir out/snap/<film> --ids <id,id,...>
It reads before.png, after.png (the real renderer drew the moved nodes), analysis.json and after.json from the
directory (scripts/snap/cli.ts writes them) and writes:
  preview-1.png  before | after, side by side.
  preview-2.png  the overlay: the frame dimmed, each target line in blue, each miss in red with its offset in px,
                 each move as an arrow with its hunk id.
  preview-3.png and on: one row per hunk, worst first: its id and move, the before crop and the after crop at 4x
                 or more, so a 2 px error is plain to see.
Every page is at most 2000 px on its long side: a model sees each image at about that size, and a longer page would
shrink the crops. preview.png is a copy of page 1.
"""
import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("--dir", required=True)
ap.add_argument("--ids", required=True)
a = ap.parse_args()
D = Path(a.dir)
A = json.loads((D / "analysis.json").read_text())
AF = json.loads((D / "after.json").read_text()) if (D / "after.json").exists() else None
ids = [x for x in a.ids.split(",") if x]
props = [p for p in A["proposals"] if p["id"] in ids]
before = Image.open(D / "before.png").convert("RGB")
after = Image.open(D / "after.png").convert("RGB")
FW, FH = before.size

BLUE, RED, GREEN, INK, PAPER = (0, 122, 255), (230, 40, 40), (20, 150, 60), (20, 20, 20), (250, 250, 250)
try:
    F = lambda s: ImageFont.truetype("/System/Library/Fonts/SFNSMono.ttf", s)  # noqa: E731
    F(10)
except OSError:
    F = lambda s: ImageFont.load_default()  # noqa: E731

els = {e["id"]: e for e in A["frameEls"]}
els_after = {e["id"]: e for e in (AF or {}).get("frameEls", [])}


def pbox(e):
    """The painted box of an element: ink for text, the stroke for a line."""
    if e.get("text"):
        b = e["text"]["ink"]
    else:
        s = (e.get("stroke") or 0) / 2 if e["kind"] == "path" else 0
        b = {k: e["box"][k] + (s if k in ("x1", "y1") else -s) for k in ("x0", "y0", "x1", "y1")}
    return b["x0"], b["y0"], b["x1"], b["y1"]


def feature(e, name, axis):
    if e is None:
        return None
    b = e["box"]
    if e.get("text"):
        t = e["text"]
        if name == "baseline":
            return t["baseline"]
        if name in ("bandCy", "bandTop"):
            mid = t["baseline"] - (t["xh"] + t["cap"]) / 2
            tall = any(l["y0"] < mid and l["y1"] - l["y0"] > 0.6 * t["cap"] for l in t.get("letters") or []) if t.get("letters") else t["ink"]["y0"] < mid
            top = t["baseline"] - (t["cap"] if tall else t["xh"])
            return top if name == "bandTop" else (top + t["baseline"]) / 2
        if name == "bandCx":
            return (t["ink"]["x0"] + t["ink"]["x1"]) / 2
    if name == "line":
        return (b["y0"] + b["y1"]) / 2 if axis == "y" else (b["x0"] + b["x1"]) / 2
    return {"left": b["x0"], "right": b["x1"], "cx": (b["x0"] + b["x1"]) / 2, "top": b["y0"], "bottom": b["y1"], "cy": (b["y0"] + b["y1"]) / 2}.get(name)


def issue_of(p):
    return next((i for i in A["issues"] if i.get("fix") == p["id"]), None)


def geometry(p, src):
    """For a proposal: the moving feature's value, the target value, and the across-axis spans of both elements.
    The target is where it ends (after every chosen move): an earlier hunk may move it too."""
    e, t = src.get(p["el"]), (els_after or src).get(p["joins"]["el"]) or src.get(p["joins"]["el"])
    ax = p["axis"]
    v = feature(e, p["feature"], ax)
    if p["joins"]["el"].startswith("guide:"):
        # A guide (the scene's line or the baseline grid): its value is where the feature goes.
        tv, t = p["to"], None
    elif p["kind"] == "centre":
        tv = feature(t, "cy" if ax == "y" else "cx", ax)
    elif p["kind"] in ("rhythm", "half-px"):
        tv = p["to"]
    else:
        tv = feature(t, p["joins"]["feature"], ax)
    span = lambda x: (pbox(x)[0], pbox(x)[2]) if ax == "y" else (pbox(x)[1], pbox(x)[3])  # noqa: E731
    return v, tv, span(e) if e else None, span(t) if t and p["kind"] not in ("rhythm", "half-px") else None


def crop_region(p):
    v, tv, se, st = geometry(p, els)
    ax = p["axis"]
    lo_, hi_ = min(v, tv), max(v, tv)
    if p["kind"] == "centre" and st:
        c = els[p["joins"]["el"]]
        b = pbox(c)
        lo_, hi_ = (b[1], b[3]) if ax == "y" else (b[0], b[2])
        a0, a1 = se
        mid, w = (a0 + a1) / 2, min(320, (a1 - a0) + 40)
    elif st:
        # At the moving element's end nearest its partner: the moved edge and the target line both show there.
        if se[1] < st[0]:
            mid = se[1] + min(60, (st[0] - se[1]) / 2)
        elif st[1] < se[0]:
            mid = se[0] - min(60, (se[0] - st[1]) / 2)
        else:
            mid = (max(se[0], st[0]) + min(se[1], st[1])) / 2
        w = 240
    else:
        mid, w = (se[0] + se[1]) / 2, min(320, se[1] - se[0] + 40)
    pad = max(14, 0.6 * (hi_ - lo_) if p["kind"] != "centre" else 8)
    a0, a1 = lo_ - pad, hi_ + pad
    # A text that moves shows whole: its ink along the axis is in the crop (at most 180 px).
    e = els.get(p["el"])
    if e and e.get("text") and p["kind"] != "centre":
        b = pbox(e)
        e0, e1 = (b[1], b[3]) if ax == "y" else (b[0], b[2])
        a0, a1 = min(a0, e0 - 6), max(a1, e1 + 6)
        if a1 - a0 > 180:
            c = (lo_ + hi_) / 2
            a0, a1 = c - 90, c + 90
    if ax == "y":
        box = (mid - w / 2, a0, mid + w / 2, a1)
    else:
        box = (a0, mid - w / 2, a1, mid + w / 2)
    x0, y0, x1, y1 = (max(0, box[0]), max(0, box[1]), min(FW, box[2]), min(FH, box[3]))
    return int(x0), int(y0), int(round(x1)), int(round(y1))


def zoomed(img, region, p, src, when):
    """A crop at 4x or more, with the target line in blue and the moving feature in red (before) or green (after)."""
    x0, y0, x1, y1 = region
    z = max(4, min(8, int(300 / max(1, max(x1 - x0, (y1 - y0) * 1.6)))))
    im = img.crop(region).resize(((x1 - x0) * z, (y1 - y0) * z), Image.NEAREST)
    d = ImageDraw.Draw(im)
    v, tv, _, _ = geometry(p, src)
    ax = p["axis"]
    def line(val, col):
        if val is None:
            return
        if ax == "y":
            yy = (val - y0) * z
            d.line([(0, yy), (im.width, yy)], fill=col, width=2)
        else:
            xx = (val - x0) * z
            d.line([(xx, 0), (xx, im.height)], fill=col, width=2)
    line(tv, BLUE)
    line(v, RED if when == "before" else GREEN)
    off = (v - tv) if (v is not None and tv is not None) else 0
    tag = f"{p['id']} {when}: {'on the line' if abs(off) <= 0.5 else f'{off:+.1f} px'}  ({z}x)"
    tb = d.textbbox((6, 4), tag, font=F(13))
    d.rectangle([tb[0] - 3, tb[1] - 2, tb[2] + 3, tb[3] + 2], fill=(255, 255, 255))
    d.text((6, 4), tag, fill=INK, font=F(13))
    return im


def arrow(d, a, b, col, w=3):
    d.line([a, b], fill=col, width=w)
    import math
    ang = math.atan2(b[1] - a[1], b[0] - a[0])
    for s in (-0.5, 0.5):
        d.line([b, (b[0] - 12 * math.cos(ang + s), b[1] - 12 * math.sin(ang + s))], fill=col, width=w)


# ---------- the overlay ----------
ov = Image.blend(before, Image.new("RGB", before.size, (255, 255, 255)), 0.55)
d = ImageDraw.Draw(ov)
# The scene's guides (withGuides): thin cyan lines with their names, under the misses.
G = A.get("guides") or {}
CYAN = (0, 170, 200)
for gl in G.get("x", []):
    for yy in range(0, FH, 12):
        d.line([(gl["v"], yy), (gl["v"], min(FH, yy + 6))], fill=CYAN, width=1)
    # One label per column (at its left line), so the labels of a column's two lines do not overlap.
    if not gl["name"].endswith(".right"):
        d.text((gl["v"] + 3, 4), gl["name"].replace(".left", ""), fill=CYAN, font=F(max(12, FW // 90)))
for gl in G.get("y", []):
    for xx in range(0, FW, 12):
        d.line([(xx, gl["v"]), (min(FW, xx + 6), gl["v"])], fill=CYAN, width=1)
    d.text((4, gl["v"] + 2), gl["name"], fill=CYAN, font=F(max(12, FW // 90)))
if G.get("baseline"):
    bl = G["baseline"]
    # At the foot of the frame, clear of the column names along the top.
    d.text((FW - 22 * max(12, FW // 90), FH - 2 * max(12, FW // 90)), f"baseline grid: {bl['unit']} px from {bl['top']}", fill=CYAN, font=F(max(12, FW // 90)))
# Labels: a size that reads when the page is shown at a README's or a model's size (about a sixtieth of the frame's
# width), in the margin beside the frame's content, with a leader to the arrow, so no label sits on the ink it
# measures. Hunks that share one cause (one kind, feature, axis and direction) share one label.
LS = max(18, FW // 64)
GS = max(12, FW // 90)
marks = {}
for p in props:
    v, tv, se, st = geometry(p, els)
    if v is None or tv is None:
        continue
    ax = p["axis"]
    spans = [s for s in (se, st) if s]
    s0, s1 = min(s[0] for s in spans) - 20, max(s[1] for s in spans) + 20
    if ax == "y":
        d.line([(s0, tv), (s1, tv)], fill=BLUE, width=2)
        d.line([(se[0] - 10, v), (se[1] + 10, v)], fill=RED, width=2)
        ax_x = se[1] + 14
        arrow(d, (ax_x, v), (ax_x, tv if abs(tv - v) > 4 else v + (4 if tv > v else -4)), RED)
        tip = (ax_x, (v + tv) / 2)
    else:
        d.line([(tv, s0), (tv, s1)], fill=BLUE, width=2)
        d.line([(v, se[0] - 10), (v, se[1] + 10)], fill=RED, width=2)
        ay = se[1] + 14
        arrow(d, (v, ay), (tv if abs(tv - v) > 4 else v + (4 if tv > v else -4), ay), RED)
        tip = ((v + tv) / 2, ay)
    cause = (p["kind"], p["feature"], ax, 1 if v - tv > 0 else -1)
    marks.setdefault(cause, []).append((p, tip, v - tv))
# One label per cause, in a margin to the right of the frame, in the order of their tips from the top, each with a
# thin leader to its arrows: a label never covers the ink it measures, and two labels never overlap.
M = max(440, FW // 3)
canvas = Image.new("RGB", (FW + M, FH), PAPER)
canvas.paste(ov, (0, 0))
d = ImageDraw.Draw(canvas)
d.line([(FW, 0), (FW, FH)], fill=(200, 200, 200), width=1)
rows = []
for cause, ms in marks.items():
    tips = [m[1] for m in ms]
    offs = sorted({round(m[2], 1) for m in ms})
    ids_ = " ".join(m[0]["id"] for m in ms[:3]) + (f" +{len(ms) - 3}" if len(ms) > 3 else "")
    px_ = f"{offs[0]:+.1f} px" if len(offs) == 1 else f"{offs[0]:+.1f} to {offs[-1]:+.1f} px"
    lines = [f"{len(ms)} hunks, one cause", px_, ids_] if len(ms) > 1 else [f"{ms[0][0]['id']}: {px_}"]
    rows.append((sum(t[1] for t in tips) / len(tips), tips, lines))
y_next = 8
for cy, tips, lines in sorted(rows, key=lambda r: r[0]):
    lh = int(LS * 1.25)
    h_ = lh * len(lines) + 8
    y_ = max(y_next, min(int(cy - h_ / 2), FH - h_ - 4))
    x_ = FW + 16
    for t in tips:
        d.line([t, (FW + 8, y_ + h_ / 2)], fill=(230, 120, 120), width=1)
    w_ = max(d.textbbox((0, 0), l, font=F(LS))[2] for l in lines)
    d.rectangle([x_ - 6, y_, min(FW + M - 4, x_ + w_ + 6), y_ + h_], fill=RED)
    for i, l in enumerate(lines):
        d.text((x_, y_ + 4 + i * lh), l, fill=(255, 255, 255), font=F(LS))
    y_next = y_ + h_ + 10
ov = canvas

# ---------- the pages ----------
# A model opens each image scaled to about 2000 px on its long side: a long sheet shrinks its 4x crops until a 2 px
# miss is gone. So every page is at most MAX px on its long side, and the crops keep their 4x.
MAX = 2000
GAP, HEAD = 16, 34
crops = []
# Worst first: the larger move at the higher confidence.
for p in sorted(props, key=lambda p: -p["confidence"] * max(1, abs(p["delta"]))):
    r = crop_region(p)
    crops.append((p, zoomed(before, r, p, els, "before"), zoomed(after, r, p, els_after or els, "after")))

n_left = len([i for i in (AF or {}).get("issues", []) if i["level"] != "advice" and not i.get("ignored")])
title = (f"{A['film']} at {A['t']:.2f} s: {len(props)} move(s) ({', '.join(ids[:10])}{' ...' if len(ids) > 10 else ''}); "
         f"{n_left} issue(s) left after")


def fit(im, w, h):
    s_ = min(w / im.width, h / im.height, 1.0)
    return im.resize((max(1, int(im.width * s_)), max(1, int(im.height * s_))), Image.LANCZOS) if s_ < 1 else im


pages = []
# Page 1: before | after, side by side, as large as fits.
bw = (MAX - GAP) // 2
b1, a1 = fit(before, bw, MAX - HEAD), fit(after, bw, MAX - HEAD)
pg = Image.new("RGB", (b1.width + a1.width + GAP, b1.height + HEAD), PAPER)
dd = ImageDraw.Draw(pg)
dd.text((8, 8), f"{title}. Left: before. Right: after.", fill=INK, font=F(16))
pg.paste(b1, (0, HEAD)); pg.paste(a1, (b1.width + GAP, HEAD))
pages.append(("preview-1.png", pg))
# Page 2: the overlay.
o1 = fit(ov, MAX, MAX - HEAD)
pg = Image.new("RGB", (o1.width, o1.height + HEAD), PAPER)
ImageDraw.Draw(pg).text((8, 8), "overlay: blue = the line it joins, red = where it is now, arrow = the move, label = hunk id and px, cyan = the scene's guides", fill=INK, font=F(16))
pg.paste(o1, (0, HEAD))
pages.append(("preview-2.png", pg))
# Pages 3...: the crops at 4x or more, before | after, with the hunk id; as many rows as fit in MAX.
LAB = 300
rows_ = []
for p, b, c in crops:
    w = LAB + b.width + c.width + 3 * GAP
    h = max(b.height, c.height, 70) + GAP
    if w > MAX:
        # A crop pair wider than a page: stack the after under the before.
        w, h = LAB + max(b.width, c.width) + 2 * GAP, b.height + c.height + 2 * GAP
    rows_.append((p, b, c, w, h))
page_rows, cur, hcur = [], [], HEAD
for r in rows_:
    if cur and hcur + r[4] > MAX:
        page_rows.append(cur); cur, hcur = [], HEAD
    cur.append(r); hcur += r[4]
if cur:
    page_rows.append(cur)
for k, rs in enumerate(page_rows):
    W_ = max(r[3] for r in rs)
    pg = Image.new("RGB", (W_, HEAD + sum(r[4] for r in rs)), PAPER)
    d2 = ImageDraw.Draw(pg)
    d2.text((8, 8), f"crops {k + 1} of {len(page_rows)}: before (red = where it is) | after (green), blue = the line it joins", fill=INK, font=F(16))
    y = HEAD
    for p, b, c, w, h in rs:
        sign = "+" if p["delta"] > 0 else ""
        d2.text((8, y), f"{p['id']}  {p['kind']} {p['level']}", fill=INK, font=F(15))
        d2.text((8, y + 22), f"move {p['group'][:34]} {p['axis']} {sign}{p['delta']} px", fill=INK, font=F(13))
        d2.text((8, y + 40), f"{p['el'][:20]} {p['feature']}", fill=INK, font=F(12))
        d2.text((8, y + 56), f"-> {p['joins']['el'][:22]} {p['joins']['feature']}", fill=INK, font=F(12))
        pg.paste(b, (LAB, y))
        if LAB + b.width + c.width + 3 * GAP <= MAX:
            pg.paste(c, (LAB + b.width + GAP, y))
        else:
            pg.paste(c, (LAB, y + b.height + GAP))
        y += h
    pages.append((f"preview-{k + 3}.png", pg))
for old in D.glob("preview-*.png"):
    old.unlink()
for name, im in pages:
    im.save(D / name)
# preview.png: the first page, under the old name (a link from older notes keeps working).
pages[0][1].save(D / "preview.png")
print("preview pages (each at most 2000 px on its long side; crops at 4x or more):")
for name, im in pages:
    print(f"  {D / name}  {im.width}x{im.height}")
