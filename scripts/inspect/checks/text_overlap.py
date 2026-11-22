"""text-overlap: text that crosses text on screen, in any frame, at rest or in a hand-over.

Hard rule 1: text never crosses text. On every frame, each pair of visible texts (opacity MIN_OPACITY or more each)
from different blocks is tested letter by letter (the capture's letter ink boxes; the text's ink box when it has no
letters): a letter of one that overlaps a letter of the other by MIN_PX or more each way is a crossing. The parts of
one block are one text (the digits of a counter, the words of one kineticWords, the letters of one typeOn, a line and
its lit copy): a block is the node id before its first "-". One finding for each pair of blocks, over all the frames
where they cross: the frames, the worst frame (both texts at their most opaque) and the texts there.
A hand-over of one title to the next is a crossing too when both show the same words at once (the outgoing "Veyrasa."
still on screen while the end card's "Veyrasa" enters): the viewer reads the word twice. That is measured on texts of
headline size or larger (cap height SAME_CAP of the frame height or more), for SAME_FRAMES frames or more.
transit-collision is the motion family and lets a number that replaces another in place pass; here a hand-over in one
place (a title leaving while the next enters in the same box) is a finding, as a reviewer's first tell. A replacement a
scene means declares it: // untell-ignore text-overlap <block id>: <reason>.
"""
import re

from film import finding

MIN_OPACITY = 0.25
MIN_PX = 2.0
SAME_CAP = 0.02
SAME_FRAMES = 2


def block(node):
    return (node or "").split("-")[0].split(":")[0]


def boxes(t):
    return [g[1:5] for g in t["letters"]] if t.get("letters") else [t["ink"]]


def crosses(a, b):
    for p in boxes(a):
        for q in boxes(b):
            if min(p[2], q[2]) - max(p[0], q[0]) >= MIN_PX and min(p[3], q[3]) - max(p[1], q[1]) >= MIN_PX:
                return True
    return False


def words(s):
    return re.sub(r"[^\w]+", " ", (s or "").lower()).strip()


def check(film):
    runs, same = {}, {}
    for f in range(film.n):
        texts = [t for t in film.ink[f] if t["opacity"] >= MIN_OPACITY]
        for i, a in enumerate(texts):
            na = a.get("node") or film.label(a["id"])
            for b in texts[i + 1:]:
                nb = b.get("node") or film.label(b["id"])
                ba, bb = block(na), block(nb)
                if ba == bb:
                    continue
                key = tuple(sorted((ba, bb)))
                op = round(min(a["opacity"], b["opacity"]), 2)
                ia, ib = a["ink"], b["ink"]
                if min(ia[2], ib[2]) - max(ia[0], ib[0]) >= MIN_PX and min(ia[3], ib[3]) - max(ia[1], ib[1]) >= MIN_PX and crosses(a, b):
                    runs.setdefault(key, {}).setdefault(f, []).append((op, a["text"], b["text"], na, nb))
                elif len(words(a["text"])) >= 3 and words(a["text"]) == words(b["text"]) \
                        and min(a.get("cap") or 0, b.get("cap") or 0) >= SAME_CAP * film.H:
                    same.setdefault(key, {}).setdefault(f, []).append((op, a["text"], b["text"], na, nb))
    out = []
    for kind, table in (("letters cross", runs), ("same words twice", same)):
        for (ba, bb), by_frame in table.items():
            frames = sorted(by_frame)
            if kind == "same words twice" and len(frames) < SAME_FRAMES:
                continue
            worst_f = max(frames, key=lambda f: max(h[0] for h in by_frame[f]))
            op, ta, tb, na, nb = max(by_frame[worst_f], key=lambda h: h[0])
            parts = sorted({h[3] for f in frames for h in by_frame[f]} | {h[4] for f in frames for h in by_frame[f]})
            fix = ("Keep these texts apart on every frame: end the first before the next one enters in that place (a hand-over "
                   "needs the first gone, or a cut), or move one. A replacement you mean is declared: "
                   f"// untell-ignore text-overlap {ba}: <reason>.") if kind == "letters cross" else (
                  "The same words show twice at once: end the outgoing text (a cut exit, or until: the next entrance) before "
                  "the next block shows them, or let one block carry the words through the hand-over.")
            out.append(finding("text-overlap", "error", film.t(frames[0]), film.t(frames[-1]),
                               {"kind": kind, "texts": [ta[:30], tb[:30]], "frames": len(frames), "atFrame": worst_f, "opacityBoth": op,
                                "parts": parts[:8]},
                               {"frames": 0} if kind == "letters cross" else {"frames": SAME_FRAMES - 1},
                               fix, node=f"{ba} x {bb}"))
    return out
