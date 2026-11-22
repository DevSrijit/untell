"""message-gap: no sentence or headline on screen for longer than the limit, while no picture leads.

A message: visible text (opacity 0.5) that is a headline or display line, or a run of at least 3 words.
A picture leads when a photo, clip or 3D canvas covers at least 20 % of the frame. In a system whose hook asks for a
picture alone (direction.hook.show "picture": the subject carries the opening with no line), the picture the hook
counts leads too: a shape, a drawing or a mark of the hook's area (hook.picture_at). Such a system asks for no line.
The first 0.5 s (an entrance) does not count, nor, in a system whose end is "paper" (Ma), the closing hold from the
last change over 2 % of the frame: the paper end shows the ground alone there, as the direction asks.
"""
from film import finding


def has_message(film, f):
    for t in film.ink[f]:
        if t["opacity"] < 0.5:
            continue
        role = t.get("role") or film.role_of(t["fontPx"])
        if role in ("display", "headline") or len(t["text"].split()) >= 3:
            return True
    return False


def check(film):
    lim = film.limits["messageGap"]
    start = int(0.5 * film.fps)
    # A paper end shows the ground alone in its closing hold (from the last large change): that is the ending check's.
    # Every other end keeps a line on screen to the end, so the rule runs to the last frame there.
    big = [f for f in range(film.n) if film.change[f] > 0.02]
    end = (max(big) if big else film.n) if film.limits.get("endKind") == "paper" else film.n
    # The system's own hook: a picture-only hook names its subject, and that subject on screen carries the message.
    own = film.limits.get("hookShow") == "picture"
    area = film.limits.get("hookArea") or 0.015
    if own:
        from hook import picture_at
    # Only a drawn subject counts (a shape, a mark of several parts, a drawing): a pane or an empty box of that size
    # carries no message, so a box element that picture_at names does not lead.
    def leads(f):
        if film.picture_hero(f):
            return True
        if not own:
            return False
        pid = picture_at(film, f, area)
        return pid is not None and pid not in {e["id"] for e in film.content(f, 0.5) if e["kind"] == "box"}
    gap = [start <= f < end and not has_message(film, f) and not film.in_hold(f) and not leads(f) for f in range(film.n)]
    out = []
    for a, b in film.runs(gap):
        dur = (b - a + 1) / film.fps
        if dur > lim:
            out.append(finding("message-gap", "error", film.t(a), film.t(b), {"noMessage": round(dur, 2)}, {"max": lim},
                               "Keep the line on screen through the move (pin it or carry it with the camera), or show the picture that carries the message here."))
    return out
