"""motion/easing, motion/scale-from-zero, motion/consistency, motion/stagger: motion craft, measured from the
element boxes in every frame (Emil Kowalski's animation standards, translated from UI to rendered video).

  easing        a move's curve shape from its position samples: the share of its travel done in its first quarter
                of time. An entrance that starts slow (first quarter under EASE_IN_FIRST, last quarter over
                EASE_IN_LAST) is ease-in on an entrance: "never ease-in" (Kowalski, responsive easing).
  scale-from-zero  an element that enters at scale under 0.2 and grows: "nothing appears from nothing" (Kowalski:
                start at 0.9-0.97 with opacity).
  consistency   elements of one kind and size (width and height within about 20 px) that slide in (20 px or more) in one film with durations more than 1.6 times apart
                (Kowalski: cohesion; the same kind of element moves the same way).
  stagger       four or more elements of one kind starting their entrance on the same frame, in a system whose
                stagger token is over one frame (Kowalski: everything-at-once where a stagger belongs). Text counts by
                line: the parts of one line (a code row in syntax colours, its line number) that enter together are
                one unit, so a block's own row-by-row stagger does not fire.
Not measured here: purpose and frequency (a judgement: craft floor), origin-aware scaling (the recorder keeps no
transform origin), spring settings, interruption and performance (they do not apply to rendered frames).
"""
from film import gesture, finding
from motion_common import segments

EASE_IN_FIRST, EASE_IN_LAST = 0.10, 0.40


def row_units(film, ss):
    """Text entrances grouped into lines: parts whose boxes (at the end of the entrance) share a top and a height
    within 2 px and touch end to end (a gap of at most one line height: a line number and its code) are one unit."""
    boxes = []
    for s in ss:
        e = next((x for x in film.elements(s["b"]) if x["id"] == s["id"]), None)
        if e:
            boxes.append((e["y"], e["h"], e["x"], e["x"] + e["w"]))
    boxes.sort(key=lambda b: (round(b[0]), b[2]))
    units = []
    for y, h, x0, x1 in boxes:
        u = units[-1] if units else None
        if u and abs(u[0] - y) <= 2 and abs(u[1] - h) <= 2 and x0 - u[3] <= 1.0 * h:
            u[3] = max(u[3], x1)
        else:
            units.append([y, h, x0, x1])
    return units


def check(film):
    out = []
    # A wipe is a cut between two scenes, not an entrance of content: its sweep and its iris are not judged here.
    wipes = {n.get("id") for n in film.nodes if isinstance(n, dict) and n.get("block") == "wipe"}
    segs = [s for s in segments(film) if s["label"] not in wipes]
    seen = set()
    for s in segs:
        # A word that grows into the ground (kineticWords exit "toGround", its <phrase>-grow node) speeds up on purpose:
        # it leaves the frame by filling it, an exit, not an entrance.
        if s["kind"] == "enter" and s["frames"] >= 6 and s["dist"] > 20 and s["firstQ"] < EASE_IN_FIRST and s["lastQ"] > EASE_IN_LAST and s["label"] not in seen \
                and not s["label"].endswith("-grow"):
            seen.add(s["label"])
            out.append(finding("motion/easing", "warning", film.t(s["a"]), film.t(s["b"]), {"firstQuarter": round(s["firstQ"], 2), "lastQuarter": round(s["lastQ"], 2), "kind": s["kind"]},
                               {"firstQuarterMin": EASE_IN_FIRST}, "Ease this entrance out, not in: it starts slow and delays the moment the viewer watches (Kowalski: never ease-in on an entrance).", node=s["label"]))
    # Scale from zero.
    for s in segs:
        if s["kind"] == "enter" and (s["scale0"] or 1) < 0.2 and s["label"] not in seen:
            seen.add(s["label"])
            out.append(finding("motion/scale-from-zero", "warning", film.t(s["a"]), film.t(s["b"]), {"startScale": s["scale0"]}, {"minScale": 0.2},
                               "Start this entrance at about 0.9-0.97 scale with a fade, not from zero (Kowalski: nothing appears from nothing).", node=s["label"]))
    # Consistency: same kind and similar size, different entrance durations.
    groups = {}
    for s in segs:
        if s["kind"] != "enter" or s["frames"] < 2 or s["dist"] < 20:
            continue
        key = (s["elkind"], round(s["w"] / 20), round(s["h"] / 20))
        groups.setdefault(key, []).append(s)
    for key, ss in groups.items():
        lab = {}
        for s in ss:
            lab.setdefault(s["label"], s)
        ss = list(lab.values())
        if len(ss) < 2:
            continue
        # The parts of one block's designed gesture (a counter's digit columns turn at their own speeds) are one mover:
        # consistency compares different blocks only.
        if len({gesture(film, s["label"]) for s in ss}) < 2:
            continue
        lo, hi = min(ss, key=lambda s: s["frames"]), max(ss, key=lambda s: s["frames"])
        if gesture(film, lo["label"]) == gesture(film, hi["label"]):
            by = {}
            for s in ss:
                by.setdefault(gesture(film, s["label"]), []).append(s)
            fast = {g: min(v, key=lambda s: s["frames"]) for g, v in by.items()}
            slow = {g: max(v, key=lambda s: s["frames"]) for g, v in by.items()}
            lo = min(fast.values(), key=lambda s: s["frames"])
            hi = max((slow[g] for g in slow if g != gesture(film, lo["label"])), key=lambda s: s["frames"])
        if hi["frames"] > 1.6 * lo["frames"] and hi["frames"] - lo["frames"] >= 4:
            out.append(finding("motion/consistency", "warning", film.t(lo["a"]), film.t(hi["b"]), {"fastest": [lo["label"], lo["frames"]], "slowest": [hi["label"], hi["frames"]]},
                               {"maxRatio": 1.6}, "Give these elements of one kind the same entrance duration and curve (Kowalski: cohesion).", node=f"{lo['label']} x {hi['label']}"))
    # Stagger: many of one kind starting together.
    stagger = ((film.tokens or {}).get("motion", {}).get("frames", {}) or {}).get("stagger", 0)
    if stagger > 1:
        starts = {}
        for s in segs:
            if s["kind"] == "enter":
                starts.setdefault((s["a"], s["elkind"]), []).append(s)
        for (a, kind), ss in starts.items():
            labels = {s["label"] for s in ss}
            # One line of text drawn in several parts (a code row split into syntax-colour runs) is one unit: the
            # parts sit on one line and touch end to end. Count units, not parts.
            if kind == "text" and len(row_units(film, ss)) < 4:
                continue
            if len(labels) >= 4:
                out.append(finding("motion/stagger", "warning", film.t(a), film.t(a), {"together": len(labels), "kind": kind}, {"max": 3, "staggerFrames": stagger},
                                   f"Stagger these entrances by the system's {stagger} frames instead of starting them on one frame (Kowalski: stagger groups).", node=", ".join(sorted(labels)[:4])))
    return out
