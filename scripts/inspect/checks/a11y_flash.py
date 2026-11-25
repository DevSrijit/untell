"""a11y/flash: WCAG 2.3.1 general flash threshold.

A transition: between two frames, the relative luminance of a region changes by 10 % of the maximum or more and
the darker state is under 0.8. A flash is a pair of opposing transitions. Measured on a 1/10 size copy: for each
frame, the share of the frame that brightens and the share that darkens. A frame whose brightening or darkening
share is over 25 % of the frame is a transition in that direction; two opposing transitions make a flash. More than
3 flashes in any 1 s is an error. Red flashes (the stricter red rule) are not measured separately yet.
"""
import numpy as np

from film import finding

AREA = 0.25
LIMIT = 3


# The linear light of each 8-bit level (the sRGB curve), as a table: the same numbers as the curve on every pixel,
# without a power on every pixel (on 3 minutes at 1080p the curve took 36 s, the table well under 1 s).
_C = np.arange(256, dtype=np.float64) / 255.0
LINEAR = np.where(_C <= 0.04045, _C / 12.92, ((_C + 0.055) / 1.055) ** 2.4)


def check(film):
    rgb = film.rgb
    L = 0.2126 * LINEAR[rgb[..., 0]] + 0.7152 * LINEAR[rgb[..., 1]] + 0.0722 * LINEAR[rgb[..., 2]]
    trans = [0]
    for f in range(1, film.n):
        d = L[f] - L[f - 1]
        darker = np.minimum(L[f], L[f - 1]) < 0.8
        up = float(((d >= 0.1) & darker).mean())
        down = float(((d <= -0.1) & darker).mean())
        trans.append(1 if up > AREA else -1 if down > AREA else 0)
    # Flashes: each opposing pair of transitions, counted at its second transition.
    flashes, last = [], 0
    for f, s in enumerate(trans):
        if s == 0:
            continue
        if last and s == -last:
            flashes.append(f)
            last = 0
        else:
            last = s
    out, i = [], 0
    worst = None
    for j, f in enumerate(flashes):
        while flashes[i] < f - film.fps + 1:
            i += 1
        n = j - i + 1
        if n > LIMIT and (worst is None or n > worst[0]):
            worst = (n, flashes[i], f)
    if worst:
        out.append(finding("a11y/flash", "error", film.t(worst[1]), film.t(worst[2]), {"flashesIn1s": worst[0]}, {"max": LIMIT},
                           "Slow the light-dark cuts to at most 3 a second, or keep the alternating area under a quarter of the frame or the change under 10 % of luminance."))
    return out
