"""orphan-line, truncated: two type tells a reader sees at once.

  orphan-line  a headline or display text set in two lines or more whose last line is one short word: one word of
               SHORT_CHARS letters or fewer, or a word whose line is under ORPHAN_SHARE of the widest line, while the
               line before it holds two words or more. Lines: the text's line nodes (text-0, text-1; a title's word
               nodes p0-w0 group by their row), at rest for REST s. Kinetic type that sets one word a line on purpose
               has no line of two words before it, so it does not count.
  truncated    text that ends in an ellipsis ("…" or "...") at rest for REST s, or text the capture marks as cut by
               CSS (text-overflow: ellipsis with the text wider than its box): a block shortened a label or a UI
               line, and the reader loses its end.
Both read the capture's ink (the text, its ink box and its role) on every frame.
"""
import re

from film import finding

SHORT_CHARS, ORPHAN_SHARE, REST = 4, 0.4, 0.5
HEAD_ROLES = {"display", "headline", "title"}


def group_of(node):
    """The text a line belongs to: the node without its line index (head-0 -> head) or word part (t-p0-w3 -> t)."""
    return re.sub(r"(-p\d+)?-w\d+.*$", "", re.sub(r"-\d+$", "", node or ""))


def rows(items):
    """Items of one text grouped into lines: an item joins a line when its ink top is within half a letter height of
    the line's, or when the middle of its ink lies inside the line's ink span (a period typed as its own node sits low
    on the baseline, and is on the same line)."""
    out = []
    for t in sorted(items, key=lambda t: t["ink"][1]):
        h = max(4.0, t["ink"][3] - t["ink"][1])
        if out:
            top = min(x["ink"][1] for x in out[-1])
            bottom = max(x["ink"][3] for x in out[-1])
            mid = (t["ink"][1] + t["ink"][3]) / 2
            if abs(t["ink"][1] - out[-1][0]["ink"][1]) < 0.5 * h or top <= mid <= bottom:
                out[-1].append(t)
                continue
        out.append([t])
    return out


def check(film):
    orphans, cut = {}, {}
    rest_frames = max(1, round(REST * film.fps))
    prev = {}
    for f in range(film.n):
        cur = {t["id"]: t["ink"] for t in film.ink[f]}
        groups = {}
        for t in film.ink[f]:
            if t["opacity"] < 0.9:
                continue
            still = prev.get(t["id"]) == t["ink"]
            text = t["text"].strip()
            # truncated
            if still and (re.search(r"(…|\.\.\.)[\"'”’)\]]*$", text) or t.get("ellipsis")):
                cut.setdefault(t.get("node") or film.label(t["id"]), []).append((f, text))
            role = t.get("role") or film.role_of(t["fontPx"])
            if role in HEAD_ROLES and still:
                groups.setdefault(group_of(t.get("node") or film.label(t["id"])), []).append(t)
        for g, items in groups.items():
            ls = rows(items)
            if len(ls) < 2:
                continue
            words = [" ".join(x["text"] for x in sorted(line, key=lambda x: x["ink"][0])).split() for line in ls]
            widths = [max(x["ink"][2] for x in line) - min(x["ink"][0] for x in line) for line in ls]
            last, before = words[-1], words[-2]
            if len(last) == 1 and len(before) >= 2 and (len(last[0].strip(".,;:!?\"'”")) <= SHORT_CHARS or widths[-1] < ORPHAN_SHARE * max(widths)):
                orphans.setdefault(g, []).append((f, last[0], round(widths[-1] / max(widths), 2), len(ls)))
        prev = cur
    out = []
    for g, hs in orphans.items():
        if len(hs) < rest_frames:
            continue
        f, word, share, n = hs[0]
        # kineticWords (word nodes <id>-p<n>-w<n>) picks its own break and takes no line breaks yet: the agent cannot
        # move the break, so the finding is advice and says what the agent can do instead.
        kinetic = any(re.match(rf"^{re.escape(g)}-p\d+-w\d+$", n2.get("id", "")) for n2 in film.nodes)
        out.append(finding("orphan-line", "advice" if kinetic else "warning", film.t(hs[0][0]), film.t(hs[-1][0]), {"lastLine": word, "widthShare": share, "lines": n, **({"block": "kineticWords"} if kinetic else {})},
                           {"minChars": SHORT_CHARS + 1, "minWidthShare": ORPHAN_SHARE},
                           ("kineticWords picks the break itself and takes no line breaks yet: change the words (one more word on the last line), or set this line with text or title, which take a break."
                            if kinetic else "Break the headline so its last line holds two words or more: change the box width or the break, or shorten the line."), node=g))
    for node, hs in cut.items():
        if len(hs) < rest_frames:
            continue
        out.append(finding("truncated", "warning", film.t(hs[0][0]), film.t(hs[-1][0]), {"text": hs[0][1][-40:]}, {"ellipsis": False},
                           "Show the whole text: shorten it to fit, widen its box, or use a smaller role; a block that cuts it with an ellipsis hides its end.", node=node))
    return out
