"""a11y/motion: vestibular triggers, as warnings with their span.

  zoom    the camera (or a picture over half the frame) scales by more than 1.3x within 0.5 s
  spin    an element over half the frame turns more than 45 degrees within 0.5 s
Strobing stripes are not measured yet (a11y/flash covers full light-dark flashes).
"""
from film import finding

ZOOM, SPIN, WIN = 1.3, 45.0, 0.5


def check(film):
    win = max(1, int(WIN * film.fps))
    area = film.W * film.H
    series = {}
    for f in range(film.n):
        for e in film.elements(f):
            if e["kind"] == "camera" or (e["w"] * e["h"] >= 0.5 * area and e["layer"] == "content" and e["kind"] in ("image", "box", "svg")):
                series.setdefault(e["id"], {})[f] = (max(e.get("scale", 1) or 1, 1e-3), e.get("rotation", 0) or 0)
    out = []
    for eid, s in series.items():
        fs = sorted(s)
        hit = None
        for i, f in enumerate(fs):
            for g in fs[i + 1:]:
                if g - f > win:
                    break
                z = max(s[g][0] / s[f][0], s[f][0] / s[g][0])
                r = abs(s[g][1] - s[f][1])
                if z > ZOOM or r > SPIN:
                    hit = (f, g, z, r)
                    break
            if hit:
                break
        if hit:
            out.append(finding("a11y/motion", "warning", film.t(hit[0]), film.t(hit[1]), {"zoom": round(hit[2], 2), "turnDeg": round(hit[3], 1)},
                               {"zoom": ZOOM, "turnDeg": SPIN, "within": WIN},
                               "Slow this zoom or turn (over a second or more), or make it smaller: a fast full-frame zoom or spin can make viewers ill.", node=film.label(eid)))
    return out
