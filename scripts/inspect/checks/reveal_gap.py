"""reveal-gap: the text before a declared reveal leaves some frames before the reveal's text shows, so the reveal
lands on a frame with no text.

The reveal: the one the scene declares (B.reveal({ at }), film.declared_reveal). Its text: the block that B.reveal
names (`of`), else any text. The first frame where that text is on screen (in the capture's ink, opacity 0.02 or more)
from the reveal's time on (from one step before it) is the reveal's first frame. From there, the check counts back the
frames with no text on screen at all, outside declared holds, to the last frame that shows text.
Not judged: a reveal that fades in (a dissolve may leave the ground between two lines: Ma, Nocturne), and a gap that a
designed transition fills (a box or a shape of COVER of the frame or more that enters or moves in the gap: a flood, a
wipe, a slab).
A finding: that gap is longer than the system's step (1 frame; one tick, ceil(30 / step) frames, in a stepped system),
and not longer than the window: the longer of the system's enter and exit (motion.frames) plus the step, and under
half a second. A gap longer than the window is a pause that the picture holds, not a slip. A reveal whose named block has no text (a picture,
a chart) is not judged. Hand-overs (handover.ts) end the old text on the frame before the new one shows, so a
hand-over has no gap.
The fault it finds: an end card that cuts in (`enter: "cut"`) while the scene cleared its words one enter duration
before the card's time (a first-use test: 5 frames with no text at the drop).
"""
import math

from film import Skip, declared_reveal, finding

SHOWN = 0.02  # a text is on screen: the capture keeps text from this opacity on
CUT_IN = 0.9  # the reveal cuts in: on its first frame its text is at this opacity or more
COVER = 0.25  # a panel, a wipe or a flood: a box or a shape of a quarter of the frame or more


def node_of(film, t):
    return t.get("node") or film.label(t["id"])


def check(film):
    dec = declared_reveal(film)
    if not dec:
        raise Skip("no declared reveal (B.reveal)")
    at, how = dec
    f0 = min(film.n - 1, max(0, round(at * film.fps)))
    tokens = film.tokens or {}
    step = tokens.get("step") or 0
    allowed = max(1, math.ceil(film.fps / step)) if step else 1
    frames = (tokens.get("motion") or {}).get("frames") or {}
    # A slip is at most one entrance or exit long (the lead the scene took off), and under half a second: a longer gap
    # reads as a beat that the picture holds (a product that turns with no line for 0.9 s in Keynote).
    window = min(max(frames.get("enter") or 0, frames.get("exit") or 0) + allowed, film.fps // 2)
    of = next((str((n.get("data") or {}).get("of")) for n in film.nodes if n.get("kind") == "anchor" and n.get("id") == "reveal" and (n.get("data") or {}).get("of")), None)

    def any_text(f):
        return any(t["opacity"] >= SHOWN for t in film.ink[f])

    def reveal_text_t(t):
        return of is None or node_of(film, t) == of or node_of(film, t).startswith(of + "-")

    def reveal_text(f):
        return any(t["opacity"] >= SHOWN and reveal_text_t(t) for t in film.ink[f])

    span = range(max(0, f0 - allowed), min(film.n, f0 + film.fps // 2 + 1))
    f1 = next((f for f in span if reveal_text(f)), None)
    if f1 is None:
        film.notes.append({"check": "reveal-gap", "notJudged": of or "the reveal", "why": "no text of the reveal shows within half a second of its time (a picture or a chart reveal)"})
        return []
    gap, g = 0, f1 - 1
    while g >= 0 and not any_text(g) and not film.in_hold(g):
        gap += 1
        g -= 1
    if g < 0 or film.in_hold(g) or gap <= allowed or gap > window:
        return []
    # A reveal that fades in is a dissolve: the system's own hand-over (Ma, Nocturne) may leave the ground between two
    # lines. The fault is a reveal that cuts in on a frame the earlier text has already left.
    if max((t["opacity"] for t in film.ink[f1] if reveal_text_t(t)), default=0) < CUT_IN:
        film.notes.append({"check": "reveal-gap", "notJudged": "a gap before a reveal that fades in", "frames": gap})
        return []
    # A designed transition fills the gap: a flat panel, a wipe or a flood (a box or a shape of COVER of the frame or more)
    # that enters or moves in those frames (Pop's flood, Noir's shadow sweep, Cutout's slab). A picture that a camera
    # move brings in is not one.
    gap_frames = range(g + 1, f1)
    # In the world's coordinates (film.in_world): a plate that a camera move or a whip carries across the frame stands
    # still there, so the view's move is not a transition (the Courtside fault had a whip in its gap).
    def boxes(f):
        return {e["id"]: (round(w["x"]), round(w["y"]), round(w["w"]), round(w["h"])) for e in film.elements(f)
                if e["kind"] in ("box", "svg") and e["opacity"] >= 0.5 and e["w"] * e["h"] >= COVER * film.W * film.H
                for w in [film.in_world(f, e)]}
    before = boxes(g)
    if any(k not in before or before[k] != v for f in gap_frames for k, v in boxes(f).items()):
        film.notes.append({"check": "reveal-gap", "notJudged": "a transition (a panel, a wipe or a flood) fills the gap before the reveal", "frames": gap})
        return []
    return [finding("reveal-gap", "warning", film.t(g + 1), film.t(f1),
                    {"framesWithNoText": gap, "lastTextFrame": g, "revealShowsFrame": f1, "reveal": round(at, 3), "how": how},
                    {"maxFrames": allowed, "window": window},
                    f"The text before the reveal leaves {gap} frames before the reveal shows ({film.t(g + 1):.2f} to {film.t(f1):.2f} s): "
                    "the reveal lands on a frame with no text. Keep the earlier text on screen until the reveal's time (until: <the reveal's at>). "
                    "A block that cuts in (enter: \"cut\") has no entrance lead: endCardLead(ctx, \"cut\") is 0.",
                    node=of)]
