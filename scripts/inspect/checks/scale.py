"""main-line, subject-size: calm is not empty. A quiet system (Ma, Matte) leaves space around one subject that owns
the frame and a line that reads; a weak film leaves a small subject and caption-size type lost in the frame.

  main-line     the main line of each moment (the largest prose text on screen, at rest) has a minimum letter
                height on a 390 px wide phone: the larger of MAIN_MIN px and MAIN_SHARE of the cap height the
                system's headline role gives in that text's face. A film may set a line in body; its main line may
                not be body when nothing larger is on screen, unless a picture leads (what the frame draws, without
                text, covers PICTURE_LEADS of it: a credit over a full-bleed street). Runs of MAIN_S or longer. Code is not prose (it has
                reading-size's own rule); labels are not lines.
  subject-size  in every system whose hook shows a subject with an area (tokens direction.hook show "picture" or
                "both", and area), the subject covers that share of the frame at the film's hero moments: the hook (the frame at hook.by), the reveal
                (the scene's declared reveal, else the largest entrance in the last third) and the last frame (those two
                at LATER_SHARE of the area: a lockup sets the subject beside a name). The
                subject is what is drawn off the ground colour, not counting text: its box (1st to 99th percentile
                of those pixels, so stray grain does not count). A 3D canvas or a full-frame picture counts by what
                it draws, not by the size of its element. And the subject must have mass: where it is a picture (a
                photo, a clip, a 3D canvas), its silhouette (the pixels it draws off the ground inside the picture's
                element, without text) covers SILHOUETTE of that share. A thin lamp whose box is large draws little.
                A system whose pictures sit small in the field by design (placements "small-in-field": Keynote,
                Studio, Ma) is held to its hook and its reveal; its end may set the subject small beside the name.
"""
import numpy as np

from film import declared_reveal, entrance_groups, finding

MAIN_MIN, MAIN_SHARE, MAIN_S = 12.0, 0.75, 1.0
LATER_SHARE = 0.6
PICTURE_LEADS = 0.5  # a drawn picture over half the frame leads the moment
SUBJECT_DELTA = 14  # a dark object on a dark ground (Matte) differs from it by under 28 levels
PHONE = 390
SILHOUETTE = 0.3  # of the box share the direction asks for (a chair, a shoe, a person pass; a thin lamp does not)


def attribution(film, t):
    """A quote's name or job under its rule: the source of a statement, not the line of a moment."""
    label = t.get("node") or film.label(t["id"])
    n = film.node(label) or {}
    return n.get("block") == "quote" and (label.endswith("-name") or label.endswith("-job"))


def headline_need(film, t):
    head = ((film.tokens or {}).get("type") or {}).get("headline") or {}
    if not head.get("size") or not t.get("fontPx"):
        return MAIN_MIN
    cap_ratio = t["cap"] / t["fontPx"]
    return max(MAIN_MIN, round(MAIN_SHARE * head["size"] * min(film.W, film.H) * cap_ratio * PHONE / film.W, 1))


def subject_box(film, f):
    """(share of the frame, box in px) of what the frame draws off the ground, without text."""
    rgb = film.rgb[f]
    h, w = rgb.shape[:2]
    off = np.abs(rgb - film.ground[None, None, :]).max(axis=2) > SUBJECT_DELTA
    k = w / film.W
    for t in film.ink[f]:
        x0, y0, x1, y1 = t["ink"]
        off[max(0, int(y0 * k) - 1):int(y1 * k) + 2, max(0, int(x0 * k) - 1):int(x1 * k) + 2] = False
    ys, xs = np.nonzero(off)
    if len(xs) < 20:
        return 0.0, None
    x0, x1 = np.percentile(xs, [1, 99])
    y0, y1 = np.percentile(ys, [1, 99])
    share = float((x1 - x0 + 1) * (y1 - y0 + 1) / (w * h))
    return share, [round(v / k) for v in (x0, y0, x1, y1)]


def silhouette(film, f):
    """The share of the frame that pictures (photos, clips, 3D canvases at opacity 0.5) draw off the ground, without
    text, or None when no picture is on screen (a drawn shape has no silhouette rule: a hairline diagram is thin by
    design)."""
    imgs = [e for e in film.elements(f) if e["kind"] == "image" and e["opacity"] >= 0.5]
    if not imgs:
        return None
    rgb = film.rgb[f]
    h, w = rgb.shape[:2]
    k = w / film.W
    off = np.abs(rgb - film.ground[None, None, :]).max(axis=2) > SUBJECT_DELTA
    m = np.zeros_like(off)
    for e in imgs:
        m[max(0, int(e["y"] * k)):int((e["y"] + e["h"]) * k) + 1, max(0, int(e["x"] * k)):int((e["x"] + e["w"]) * k) + 1] = True
    for t in film.ink[f]:
        x0, y0, x1, y1 = t["ink"]
        off[max(0, int(y0 * k) - 1):int(y1 * k) + 2, max(0, int(x0 * k) - 1):int(x1 * k) + 2] = False
    return float((off & m).mean())


def check(film):
    out = []
    # ---- main-line (a film rule: a block demo has no main line of its own)
    if getattr(film, "demo", False):
        film.notes.append({"check": "main-line", "notRun": "a demo: a block demo has no main line"})
        return out
    k = PHONE / film.W
    small, worst = [], {}
    for f in range(film.n):
        texts = [t for t in film.ink[f] if t["opacity"] >= 0.5 and not film.is_code(t) and (t.get("role") or film.role_of(t["fontPx"])) != "label"
                 and not attribution(film, t)
                 and any(c.isalpha() for c in t["text"]) and film.text_at_rest(f, t)]
        if not texts:
            small.append(False)
            continue
        main = max(texts, key=lambda t: t["cap"])
        need = headline_need(film, main)
        cap = main["cap"] * k
        # A number set larger than the line (a big stat: "35,163" over "steps, at 1.2 m a step") is the moment's main
        # line; its caption may be small.
        stat = max((t for t in film.ink[f] if t["opacity"] >= 0.5 and not any(c.isalpha() for c in t["text"]) and any(c.isdigit() for c in t["text"])
                    and film.text_at_rest(f, t)), key=lambda t: t["cap"], default=None)
        if stat is not None and stat["cap"] * k >= need:
            small.append(False)
            continue
        # A picture that fills the frame leads the moment (a credit over a street): then the line may be small.
        if cap < need and subject_box(film, f)[0] >= PICTURE_LEADS:
            small.append(False)
            continue
        small.append(cap < need)
        if cap < need:
            worst[f] = (cap, need, main)
    for a, b in film.runs(small):
        if (b - a + 1) / film.fps < MAIN_S:
            continue
        cap, need, t = min((worst[f] for f in range(a, b + 1)), key=lambda x: x[0])
        out.append(finding("main-line", "error", film.t(a), film.t(b),
                           {"capPxOnPhone": round(cap, 1), "text": t["text"][:40], "role": t.get("role") or film.role_of(t["fontPx"])},
                           {"minCapPx": need, "rule": f"{MAIN_SHARE} of the headline role's cap, at least {MAIN_MIN} px"},
                           "Set the main line of this moment in the headline role (or larger), or add a headline over it: the largest line on screen is too small to carry it on a phone.",
                           node=t.get("node") or film.label(t["id"])))
    # ---- subject-size (a film rule: a demo has no hook, reveal or end)
    if getattr(film, "demo", False):
        return out
    area = film.limits.get("hookArea")
    placements = ((film.tokens or {}).get("media", {}).get("pictures", {}) or {}).get("placements") or []
    if not area or film.limits.get("hookShow") not in ("picture", "both"):
        film.notes.append({"check": "subject-size", "notMeasured": "the system's hook shows no subject with an area (direction.hook show picture or both, with area)"})
        return out
    roomy = "small-in-field" in placements
    by = film.limits.get("hookShowBy") or film.limits["hookBy"]
    moments = [("hook", min(film.n - 1, round(by * film.fps)))]
    dec = declared_reveal(film)
    if dec:
        moments.append(("reveal", min(film.n - 1, round(dec[0] * film.fps) + 3)))
    else:
        late = [g for g in entrance_groups(film) if g["f"] >= film.n * 2 / 3]
        if late:
            moments.append(("reveal", min(film.n - 1, max(late, key=lambda g: g["area"])["last"] + 3)))
    if not roomy:
        moments.append(("end", film.n - 1))
    for name, f in moments:
        share, box = subject_box(film, f)
        sil = silhouette(film, f)
        # The direction states the hook's area; the reveal and the end may sit the subject beside a name (a lockup),
        # so they ask for LATER_SHARE of it.
        need = area if name == "hook" else round(LATER_SHARE * area, 3)
        # A picture is judged by its silhouette (what it draws), not its box; a drawn subject (no picture on screen) by
        # its box, in a system whose hook is a picture and whose subjects are not small by design (as before).
        thin = sil is not None and sil < SILHOUETTE * need
        small = sil is None and share < need and film.limits.get("hookShow") == "picture" and not roomy
        if sil is not None:
            share_ok = True
        else:
            share_ok = not small
        if not share_ok or thin:
            why = (f"its box covers {share:.0%} of the frame" if not share_ok else "") + \
                  (f"it draws only {sil:.1%} of the frame (a thin subject)" if thin else "")
            out.append(finding("subject-size", "error", film.t(f), film.t(f), {"moment": name, "subjectShare": round(share, 3), "silhouetteShare": None if sil is None else round(sil, 3), "box": box},
                               {"minShare": need, "minSilhouette": round(SILHOUETTE * need, 3), "from": "direction.hook.area" + ("" if name == "hook" else f" x {LATER_SHARE}")},
                               f"Give the subject the frame at the {name}: {why}. Draw it larger (a closer shot, a larger fill, a pose that spreads its mass), "
                               f"so its box covers {need:.0%} of the frame and it draws {SILHOUETTE * need:.1%} or more.",
                               node=name))
    return out
