"""a11y/captions: captions (text from the captions block, a data-el label that holds "caption") must read.

  safe     inside the platform-safe area (the scene context's safe box)
  size     at least the caption role's size
  lines    at most 2 lines on screen at once
  time     each caption page on screen at least 1 s
A page is the caption's node without its word part: the captions block draws one node a word
(captions-p0-w3-now), so its page is captions-p0; a caption written by hand is its own page. Lines are rows of
caption ink (tops within half a letter of each other).
Contrast on the real backdrop is a11y/contrast and contrast-over-picture. A film with no captions skips this check;
the films here have no speech, so no caption is required. A film that carries meaning only in sound cannot be
found from the recording; the craft floor asks for it.
"""
import re

from film import Skip, finding


def page_of(node):
    return re.sub(r"-w\d+.*$", "", node)


def check(film):
    caps = {}
    for f in range(film.n):
        for t in film.ink[f]:
            if t["opacity"] >= 0.5 and "caption" in (t.get("node") or "").lower():
                caps.setdefault(page_of(t["node"]), {}).setdefault(f, []).append(t)
    if not caps:
        raise Skip("the film has no captions (no speech)")
    out = []
    safe = (film.cap.get("ctx") or {}).get("safe")
    short = min(film.W, film.H)
    min_px = (film.tokens or {}).get("type", {}).get("caption", {}).get("size", 0) * short
    for page, frames in caps.items():
        fs = sorted(frames)
        texts = [t for f in fs for t in frames[f]]
        x0, y0 = min(t["ink"][0] for t in texts), min(t["ink"][1] for t in texts)
        x1, y1 = max(t["ink"][2] for t in texts), max(t["ink"][3] for t in texts)
        a, b = film.t(fs[0]), film.t(fs[-1])
        if safe and (x0 < safe["left"] - 1 or x1 > safe["right"] + 1 or y0 < safe["top"] - 1 or y1 > safe["bottom"] + 1):
            out.append(finding("a11y/captions", "error", a, b, {"ink": [round(v) for v in (x0, y0, x1, y1)]}, {"safe": safe},
                               "Keep captions inside the safe area: place the captions block's zone inside ctx.safe.", node=page))
        small = min(t["fontPx"] for t in texts)
        if small < min_px - 0.5:
            out.append(finding("a11y/captions", "error", a, b, {"fontPx": small}, {"min": round(min_px, 1)},
                               "Set captions at the caption role size or larger (the captions block does).", node=page))
        if len(fs) / film.fps < 1.0 and fs[-1] < film.n - 1:
            out.append(finding("a11y/captions", "error", a, b, {"onScreen": round(len(fs) / film.fps, 2)}, {"min": 1.0},
                               "Hold each caption page at least 1 s: put more words on the page, or give it more time.", node=page))

    def rows(f):
        tops = sorted(t["ink"][1] for t in film.ink[f] if t["opacity"] >= 0.5 and "caption" in (t.get("node") or "").lower())
        n, last = 0, None
        for y in tops:
            if last is None or y - last > 0.5 * max(1.0, min_px or 20):
                n += 1
                last = y
        return n
    lines = [rows(f) for f in range(film.n)]
    for a, b in film.runs([n > 2 for n in lines]):
        out.append(finding("a11y/captions", "error", film.t(a), film.t(b), {"lines": max(lines[a:b + 1])}, {"max": 2},
                           "Show at most 2 caption lines at once: split the words into more pages."))
    return out
