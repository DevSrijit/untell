"""stall: no visible change for longer than the system's limit, outside a declared hold.

Still: under STILL_SHARE of the frame changed from the frame 0.2 s before (the repository's hold measure, run.py), and no
change in the capture over those 0.2 s (motion_measure: a line that draws, a label that types, a picture that enters):
the one motion measure the review sheet uses too.
The closing hold (it reaches the last frame) is the ending check's business, not a stall.
"""
from film import finding

STILL_SHARE = 0.0015


def check(film):
    lim = film.limits["stall"]
    lag = max(1, film.fps // 5)
    drawn = film.drawn
    still = [f > 0 and film.change_lag[f] < STILL_SHARE and not film.in_hold(f) and not any(drawn[max(1, f - lag + 1):f + 1]) for f in range(film.n)]
    out = []
    for a, b in film.runs(still):
        if b == film.n - 1:
            continue
        # A run of still frames measured against 0.2 s earlier starts 0.2 s after the last change. A run at the film's
        # start has no change before it: it starts on frame 0 (it was counted from 0.2 s before the film began).
        dur = (b + 1) / film.fps if a <= lag else (b - a + 1 + lag) / film.fps
        if dur > lim:
            out.append(finding("stall", "error", film.t(max(0, a - lag)), film.t(b), {"still": round(dur, 2)}, {"max": lim},
                               "Give this stretch a change (a move, an entrance, a cut on the beat) or mark it with a hold block if the stillness is the design."))
    return out
