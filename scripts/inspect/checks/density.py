"""density, reading-time: how many words of prose the frame shows at once, and how long each text holds.

  density       prose words on screen at once against the system's word limit (tokens density.maxWords), for
                DENSITY_S or longer. Prose is text with letters that is not code or terminal text (its node marked
                data-content "code" by the renderer, else a monospace face, or a role whose font is "mono"), not data
                (data-content "data": chart values, table cells) and not a label (chart labels, axis values, tags). Numbers alone do not
                count. A word is a run of characters that holds a letter. Text wholly outside the frame is not on
                screen (film.py drops it).
  reading-time  each text of prose (as above) holds at least the system's reading time: density.minHoldBase + density.minHoldPerWord
                for each word (Manual: 1.8 s + 0.3 s a word, so 6 words need 3.6 s). Measured on the text's longest
                run on screen at opacity 0.5. Not a finding: code, labels, and a text of 3 characters or fewer (a line
                number, a typed letter, a variable); a text that holds to the last frame. Nodes that show the same
                text at the same place (boxes that overlap) are one text: a state change (a label that turns into its
                "done" copy, a lit copy of a line number) does not start a new reading time.
Without the system's tokens neither rule can measure: the notes say so.
"""
import re

from film import Skip, finding

DENSITY_S = 0.5
LETTER = re.compile(r"[^\W\d_]", re.UNICODE)


def words(text):
    return [w for w in text.split() if LETTER.search(w)]


def prose(film, t):
    """Prose: not code (film.is_code), not data (a node marked data-content "data": chart values, a table's cells), not
    a label, and with a word."""
    if t.get("content") in ("code", "data"):
        return False
    role = t.get("role") or film.role_of(t["fontPx"])
    return role != "label" and not film.is_code(t) and bool(words(t["text"]))


def lines_of(texts, key):
    """Texts on one line that touch (a typed line drawn one letter a node, a sentence in word nodes) joined into one
    line of text, so a letter is not a word: same baseline within 2 px, gap under half the font size."""
    seen, items = set(), []
    for t in texts:
        if key(t) in seen:
            continue
        seen.add(key(t))
        items.append(t)
    items.sort(key=lambda t: (round(t.get("base") or t["ink"][3]), t["ink"][0]))
    out, cur, last = [], "", None
    for t in items:
        base = t.get("base") or t["ink"][3]
        if last and abs(base - last[0]) <= 2 and t["ink"][0] - last[1] <= 0.5 * (t.get("fontPx") or 20):
            gap = t["ink"][0] - last[1]
            cur += (" " if gap > 0.25 * (t.get("fontPx") or 20) else "") + t["text"].strip()
        else:
            if cur:
                out.append(cur)
            cur = t["text"].strip()
        last = (base, t["ink"][2])
    if cur:
        out.append(cur)
    return out


def overlap(a, b):
    """Intersection over union of two boxes (x0, y0, x1, y1)."""
    ix, iy = max(0, min(a[2], b[2]) - max(a[0], b[0])), max(0, min(a[3], b[3]) - max(a[1], b[1]))
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - ix * iy
    return ix * iy / u if u > 0 else 0.0


def check(film):
    d = (film.tokens or {}).get("density")
    if not d:
        film.notes.append({"check": "density", "notMeasured": "density and reading-time", "why": "the film has no system tokens (no word limit, no time per word)"})
        raise Skip("no system tokens: no word limit and no time per word")
    out = []
    key = lambda t: t.get("node") or film.label(t["id"])  # noqa: E731
    # ---- density
    limit = d["maxWords"]
    over, worst = [], {}
    for f in range(film.n):
        seen, n, texts = set(), 0, []
        for line in lines_of([t for t in film.ink[f] if t["opacity"] >= 0.5 and prose(film, t) and not film.is_ui(f, t)], key):
            n += len(words(line))
            texts.append(line[:30])
        over.append(n > limit)
        if n > limit:
            worst[f] = (n, texts)
    for a, b in film.runs(over):
        if (b - a + 1) / film.fps < DENSITY_S:
            continue
        f = max(range(a, b + 1), key=lambda k: worst[k][0])
        n, texts = worst[f]
        out.append(finding("density", "warning", film.t(a), film.t(b), {"proseWords": n, "texts": texts[:4]}, {"maxWords": limit},
                           f"Show at most {limit} words of prose at once in this system: split the text across beats, or cut words. Code, terminal output, labels and numbers do not count."))
    # ---- reading time
    base, per = d["minHoldBase"], d["minHoldPerWord"]
    # One text to read is one unit: nodes that show the same text at the same place (boxes that overlap) are one
    # unit, so a state change (a label that turns into its "done" copy, a line number lit in the accent) is not a
    # new text.
    shown, first = {}, {}
    for f in range(film.n):
        for t in film.ink[f]:
            if t["opacity"] >= 0.5:
                shown.setdefault(key(t), {})[f] = t
                first.setdefault(key(t), t)
    unit = {}
    nodes = list(first)
    for i, n in enumerate(nodes):
        unit.setdefault(n, n)
        for m in nodes[:i]:
            # The same text at the same place, or the same text that takes over within 3 frames (a label that turns
            # into its "done" copy in a new place).
            fm, fn = sorted(shown[m]), sorted(shown[n])
            handover = abs(fn[0] - fm[-1]) <= 3 or abs(fm[0] - fn[-1]) <= 3
            if first[m]["text"].strip() == first[n]["text"].strip() and (overlap(first[m]["ink"], first[n]["ink"]) > 0.3 or handover):
                unit[n] = unit[m]
                break
    frames_of = {}
    for n, fr in shown.items():
        frames_of.setdefault(unit[n], {}).update(fr)
    for node, frames in frames_of.items():
        t0 = first[node]
        text = t0["text"].strip()
        # Prose only (as density): code is read line by line in its own time, a label at a glance; a mark or a
        # letter of 3 characters or fewer is not a text to read.
        if not prose(film, t0) or len(text) <= 3:
            continue
        w = max(1, len(words(text)))
        need = base + per * w
        runs = film.runs([f in frames for f in range(film.n)], 1)
        # Gaps of a frame or two (a blink, a re-render) do not split a run.
        merged = []
        for a, b in runs:
            if merged and a - merged[-1][1] <= 3:
                merged[-1] = (merged[-1][0], b)
            else:
                merged.append((a, b))
        if any(b >= film.n - 1 for _, b in merged):
            continue
        a, b = max(merged, key=lambda r: r[1] - r[0])
        held = (b - a + 1) / film.fps
        if held >= need:
            continue
        out.append(finding("reading-time", "warning", film.t(a), film.t(b), {"onScreen": round(held, 2), "words": w, "text": text[:40]},
                           {"min": round(need, 2), "rule": f"{base} s + {per} s a word (tokens density)"},
                           f"Hold this text at least {need:.1f} s, or cut it to fewer words.", node=node))
    return out
