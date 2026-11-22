"""reading-size: text whose letters, scaled to a 390 px wide phone, are under a minimum height for its role.

Letter height: the font's cap height (the ink height of "H", from the real font at the drawn size, so a
transform scale counts), times 390 / film width. Only text at rest and visible (opacity 0.5) for 0.5 s or more.
A line of 16 characters or more that is the main text on screen (no visible text 1.5 times larger) is read as a
sentence, so it needs at least LINE_CAP whatever its role. A small label beside a larger line keeps its role minimum.
Code and terminal text (film.is_code: a monospace face, or a role whose font is "mono") is read line by line, as body
text is: it needs the larger of LINE_CAP and the cap height that the system's body size gives in the code's own face
(tokens type.body.size x the short side x the code's cap-to-size ratio, on the phone), whatever its role and whatever
larger text is on screen. A film made of code is read in its code.
"""
from film import finding

PHONE = 390
# Minimum cap height on a 390 px wide phone, in px, per role. Body 7 px is about a 10 pt text size.
MIN_CAP = {"display": 12.0, "headline": 9.0, "body": 8.0, "label": 7.0, "caption": 7.0}
LINE_CHARS = 16
# A line to read (16 characters or more) needs a cap height of 11 px on the phone, about a 15 px text size: the
# review judged Console's terminal unreadable at 10.3 px (label size) and readable at 17 px (headline size).
LINE_CAP = 11.0


def code_need(film, t, k):
    """The cap height on the phone that code needs: LINE_CAP, or the system's body size in the code's own face."""
    body = ((film.tokens or {}).get("type") or {}).get("body") or {}
    if not body.get("size") or not t.get("fontPx"):
        return LINE_CAP
    return max(LINE_CAP, round(body["size"] * min(film.W, film.H) * (t["cap"] / t["fontPx"]) * k, 1))


def check(film):
    k = PHONE / film.W
    bad = {}  # node -> frames, worst
    prev = {}
    for f in range(film.n):
        cur = {}
        caps = [t["cap"] for t in film.ink[f] if t["opacity"] >= 0.5]
        for t in film.ink[f]:
            cur[t["id"]] = t["ink"]
            if t["opacity"] < 0.5 or prev.get(t["id"]) != t["ink"] or not film.text_at_rest(f, t):
                continue
            role = t.get("role") or film.role_of(t["fontPx"]) or "body"
            need = MIN_CAP.get(role, 7.0)
            # The line rule: a sentence that is the main text on screen (no visible text 1.5 times larger).
            if len(t["text"]) >= LINE_CHARS and max(caps) < 1.5 * t["cap"]:
                need = max(need, LINE_CAP)
            code = film.is_code(t)
            if code:
                need = max(need, code_need(film, t, k))
            cap = t["cap"] * k
            if cap < need:
                key = t.get("node") or film.label(t["id"])
                r = bad.setdefault(key, {"frames": [], "cap": cap, "need": need, "role": role, "text": t["text"], "code": code})
                r["frames"].append(f)
                r["cap"] = min(r["cap"], cap)
        prev = cur
    out = []
    code = {n: r for n, r in bad.items() if r["code"] and len(r["frames"]) >= film.fps * 0.5}
    if len(code) >= 3:
        # Code in one face and one size: one finding for the block, not one for each row or letter.
        nodes = sorted(code)
        r0 = min(code.values(), key=lambda r: r["cap"])
        frames = sorted({f for r in code.values() for f in r["frames"]})
        out.append(finding("reading-size", "error", film.t(frames[0]), film.t(frames[-1]),
                           {"capPxOnPhone": round(r0["cap"], 1), "role": r0["role"], "code": True, "texts": len(nodes),
                            "text": max(code.values(), key=lambda r: len(r["text"].strip()))["text"].strip()[:40]}, {"minCapPx": r0["need"]},
                           "Set the code at the system's body size or larger (fewer, shorter lines, or a smaller part of the program): on a phone it is read line by line, and at this size it does not read.",
                           node=f"{nodes[0]} .. {nodes[-1]} ({len(nodes)} texts)"))
        bad = {n: r for n, r in bad.items() if n not in code}
    for node, r in bad.items():
        if len(r["frames"]) < film.fps * 0.5:
            continue
        out.append(finding("reading-size", "error", film.t(r["frames"][0]), film.t(r["frames"][-1]),
                           {"capPxOnPhone": round(r["cap"], 1), "role": r["role"], "text": r["text"][:40]}, {"minCapPx": r["need"]},
                           "Set this text in a larger role (body or headline) or cut it to fewer words so it can be larger; on a phone it is too small to read.", node=node))
    return out
