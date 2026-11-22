"""off-safe: text outside the platform-safe area at rest.

The safe area is the scene context's (ctx.safe, the area TikTok, Reels and Shorts leave clear at 9:16; at other
sizes the system's margin): text whose ink, at rest for REST s, lies more than SLACK px past it. Below the low band's
top (lowBandTop), text must also end by lowBandRight (the platforms' side buttons). The same rule as the blocks'
textSafe(). Not a finding: text in the system's bleed roles (set past the edge on purpose), caption text (a11y/captions
checks it), and text cut by the frame (text-clipped reports that). Key marks that are not text (a logo shape) are not
measured: a graphic may sit in the lower band on purpose; the notes say so once.
"""
from film import Skip, finding

REST, SLACK = 0.3, 2


def check(film):
    safe = (film.cap.get("ctx") or {}).get("safe")
    if not safe:
        raise Skip("the capture has no safe area (no scene context)")
    bleed = film.bleed_roles()
    runs, prev = {}, {}
    for f in range(film.n):
        cur = {}
        for t in film.ink[f]:
            cur[t["id"]] = t["ink"]
            if t["opacity"] < 0.5 or prev.get(t["id"]) != t["ink"]:
                continue
            node = t.get("node") or film.label(t["id"])
            role = t.get("role") or film.role_of(t["fontPx"])
            if role in bleed or "caption" in node.lower():
                continue
            x0, y0, x1, y1 = t["ink"]
            if x0 < -1 or y0 < -1 or x1 > film.W + 1 or y1 > film.H + 1:
                continue  # cut by the frame: text-clipped
            # In the low band (the platforms' side buttons) when the ink reaches more than SLACK px into it: a line that
            # touches its top by a fraction of a px (a waffle's caption, 0.2 px) is above it.
            right = safe.get("lowBandRight", safe["right"]) if y1 > safe.get("lowBandTop", film.H) + SLACK else safe["right"]
            past = max(safe["left"] - x0, safe["top"] - y0, x1 - right, y1 - safe["bottom"])
            if past > SLACK:
                side = max([("left", safe["left"] - x0), ("top", safe["top"] - y0), ("right", x1 - right), ("bottom", y1 - safe["bottom"])], key=lambda s: s[1])[0]
                runs.setdefault(node, []).append((f, round(past, 1), side, t["text"]))
        prev = cur
    film.notes.append({"check": "off-safe", "measures": "text only; key marks that are not text are not measured"})
    out = []
    for node, hs in runs.items():
        if len(hs) < REST * film.fps:
            continue
        worst = max(hs, key=lambda h: h[1])
        out.append(finding("off-safe", "error", film.t(hs[0][0]), film.t(hs[-1][0]), {"pastPx": worst[1], "side": worst[2], "text": worst[3][:40]},
                           {"safe": {k: safe[k] for k in ("left", "top", "right", "bottom") if k in safe}, "slackPx": SLACK},
                           "Move the text inside ctx.safe (and, in the low band, left of lowBandRight): the platform's buttons and captions cover it there.",
                           node=node))
    return out
