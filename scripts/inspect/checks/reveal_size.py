"""reveal-size: the reveal is the largest moment: its element is the largest type (or picture) on screen, it is not
small against the film's other moments, and it holds for the system's reading time.

The reveal: the one the scene declares (B.reveal({ at }), film.declared_reveal), else the detected one
(reveal_energy.reveal: the largest entrance in the last third). Its element: what enters within ENTER_F frames of
that time (text by its node, pictures by their element); for a declared reveal with nothing entering, the texts that
show at that time. Measured over the reveal's hold (from the reveal to the frame its element drops under opacity 0.5):
  on screen   its largest letters (cap height) against the largest letters of any other text on screen with it, on
              the frame where the other is largest. A picture reveal: its box area against the other pictures'.
  in the film its cap against the film's large type: the LARGE_Q quantile of each frame's largest cap outside the
              reveal's hold. A reveal smaller than that is smaller than most of the film's own moments.
  met else    a reveal that grows into the ground (kineticWords exit "toGround") or stands on an accent ground (60 % of
              the frame in the accent while it shows) meets the size rules; only its hold is judged. A picture reveal
              (no text enters) is subject-size's.
  hold        from the reveal to the end of its hold, against the system's reading time for its words
              (density.minHoldBase + density.minHoldPerWord per word).
  shows       with B.reveal({ at, of }): the first frame where the block `of` shows in the rendered frame (its letters'
              pixels in its own colour, at half of their most) against the declared time, within the system's step
              (1 frame; 1 + 30 / step frames in a stepped system), late or early. A word under a panel is on but does
              not show; a word on screen before the declared time is early.
"""
import numpy as np

from film import Skip, declared_reveal, entrance_groups, finding

ENTER_F = 4
LARGE_Q = 0.5
SLACK = 0.95  # 5 % of slack on each size comparison (rounding of the ink boxes)
# The blocks whose text is the reveal when one of them is named (handover.ts TEXT_BLOCKS).
TEXT_BLOCKS = {"title", "text", "typeOn", "fitText", "kineticWords", "wordSeries", "quote", "bigStat", "counter", "lockup", "endCard", "formula"}
REVEAL_CHANGE = 0.02  # a reveal changes 2 % of the frame or more at its time (or draws a line, or something enters)


NEAR = 48  # levels on each channel: a pixel in the text's own colour (cover_any's measure)
SHOWN = 0.5  # the block shows once its letters hold half of the ink they hold at their most
BEGUN = 0.1  # its entrance has begun once its letters hold a tenth of their most ink
FULL = 0.9  # it is out in full once its letters hold nine tenths of their most ink


def late_reveal(film, of, f0, at, how):
    """The declared reveal against the picture: the first frame where the named block shows in the rendered frame (its
    letters' pixels in its own colour, at SHOWN of their most) must come within the system's step of the declared
    time. A word under a panel has opacity 1 but does not show. Before: B.reveal({ at: 7.2, of }) passed with its word
    7 frames late under a wipe. Returns findings, or [] (also when the frames or the colours are not there)."""
    import re
    from PIL import Image
    step = (film.tokens or {}).get("step") or 0
    # A change at t shows on the first frame after t; a stepped system (12 fps) shows it on its next tick, up to
    # 30 / step frames later.
    tol = 1 + (int(np.ceil(film.fps / step)) if step else 0)
    # From the film's start: a block that already shows before the declared time is early (a result on screen at 9.8 s
    # under a reveal declared at 10.5 s passed before). Frames where the block is off are not read.
    span = range(0, min(film.n, f0 + 3 * film.fps))
    frames_dir = film.rec.dir / "frames"
    if not (frames_dir / f"f{span.start:04d}.jpg").exists():
        return []
    def share(f):
        tot = hit = 0
        img = None
        for t in film.ink[f]:
            k = node_of(film, t)
            if not (k == of or k.startswith(of + "-")) or t["opacity"] < 0.5 or not t.get("letters"):
                continue
            m = re.findall(r"[\d.]+", t.get("color") or "")
            if len(m) < 3:
                continue
            c = np.array([float(v) for v in m[:3]])
            if img is None:
                img = np.asarray(Image.open(frames_dir / f"f{f:04d}.jpg").convert("RGB"), dtype=np.int16)
            for g in t["letters"]:
                x0, y0, x1, y1 = (int(round(v)) for v in g[1:5])
                px = img[max(0, y0):max(0, y1), max(0, x0):max(0, x1)].reshape(-1, 3)
                tot += len(px)
                hit += int((np.abs(px - c).max(axis=1) <= NEAR).sum())
        return hit / tot if tot else 0.0
    shares = [(f, share(f)) for f in span]
    most = max((v for _, v in shares), default=0.0)
    if most <= 0.05:
        return []
    shown = {f for f, v in shares if v >= SHOWN * most}
    # The run of showing frames that the reveal belongs to: the one that holds the declared frame (or its step), else
    # the first one after it. Its first frame against the declared one, both ways, within the step.
    at_reveal = next((f for f in range(f0, min(film.n, f0 + tol + 1)) if f in shown), None)
    if at_reveal is not None:
        first = at_reveal
        while first - 1 in shown:
            first -= 1
    else:
        first = next((f for f in sorted(shown) if f > f0), None)
    # Early means the answer is out in full before its moment: an entrance (a fade over the enter time) that lands on
    # the declared time passes half of its ink a few frames before it, and is on time. Before, a default end card's
    # fade read 2 frames early.
    full = {f for f, v in shares if v >= FULL * most}
    out_full = min((f for f in full if first is not None and f >= first), default=first)
    if first is not None and f0 - first > tol and f0 - out_full > tol:
        first = out_full
        film.notes.append({"check": "reveal-size", "revealShowsAt": round(film.t(first), 3), "declared": round(at, 3), "of": of})
        return [finding("reveal-size", "warning", film.t(first), film.t(f0), {"declared": round(at, 3), "of": of, "showsAt": round(film.t(first), 3),
                                                                            "framesEarly": int(f0 - first), "how": how},
                        {"withinFrames": tol},
                        f"\"{of}\" shows at {film.t(first):.2f} s, {f0 - first} frames before the declared reveal ({at:.2f} s): the answer is out before its moment. "
                        f"Bring it in at the declared time, or move B.reveal (and the music's peakAt) to {film.t(first):.2f} s.", node=of)]
    if first is None or first - f0 <= tol:
        return []
    # An entrance that starts on the declared time is on time: a line that rises out of its mask, or fades in over the
    # system's enter time, reaches half of its ink some frames later. Late means its letters had not started to show:
    # under BEGUN of their most at the declared time and for the step after it. Before, a masked rise made the agent
    # declare the reveal 6 frames late by hand.
    begun = next((f for f in range(max(0, f0 - tol), min(film.n, f0 + tol + 1)) if dict(shares).get(f, 0.0) >= BEGUN * most), None)
    if begun is not None:
        return []
    film.notes.append({"check": "reveal-size", "revealShowsAt": round(film.t(first), 3), "declared": round(at, 3), "of": of})
    return [finding("reveal-size", "warning", film.t(f0), film.t(first), {"declared": round(at, 3), "of": of, "showsAt": round(film.t(first), 3),
                                                                        "framesLate": int(first - f0), "how": how},
                    {"withinFrames": tol},
                    f"The declared reveal ({at:.2f} s) comes {first - f0} frames before \"{of}\" shows ({film.t(first):.2f} s): something covers it or it enters late. "
                    f"Show it by the declared time (move the cover or the entrance), or move B.reveal (and the music's peakAt) to {film.t(first):.2f} s.", node=of)]


def node_of(film, t):
    return t.get("node") or film.label(t["id"])


def check(film):
    dec = declared_reveal(film)
    how = None
    if dec:
        at, how = dec
    else:
        import reveal_energy
        r = reveal_energy.reveal(film)
        if not r:
            raise Skip("no reveal: the scene declares none (B.reveal) and nothing large enters in the last third")
        at, how = film.t(r[1]), "detected: " + str(r[4])
    f0 = min(film.n - 1, max(0, round(at * film.fps)))
    # What enters at the reveal: within ENTER_F frames, and for a declared reveal within half a second after it (a
    # fade reaches opacity 0.5 some frames after its start); the largest of it is judged first.
    after = film.fps // 2 if dec else ENTER_F
    from film import state_nodes
    stated = state_nodes(film)
    keys = {k[2:] for g in entrance_groups(film) if -ENTER_F <= g["f"] - f0 <= after for k in g["keys"] if k.startswith("t:") and k[2:] not in stated}
    # The block the scene names as its reveal (B.reveal({ of })): only its text is judged; a block with no text (a chart,
    # a picture) is the picture checks' to judge, not this one's.
    late = []
    of = next((str((n.get("data") or {}).get("of")) for n in film.nodes if n.get("kind") == "anchor" and n.get("id") == "reveal" and (n.get("data") or {}).get("of")), None)
    if of:
        mine = {k for k in keys if k == of or k.startswith(of + "-")}
        blocks = {n.get("block") for n in film.nodes if isinstance(n, dict) and (n.get("id") == of or str(n.get("id", "")).startswith(of + "-"))}
        if not (blocks & TEXT_BLOCKS):
            film.notes.append({"check": "reveal-size", "notJudged": of, "why": "the declared reveal is a picture, a chart or a shape (" + ", ".join(sorted(str(b) for b in blocks)) + "): its size is the picture checks', not its labels'"})
            return []
        keys = mine or keys
        if dec:
            late = late_reveal(film, of, f0, at, how)
    # With a declared reveal, a text that changes at that time is part of it too (a dimension whose number types on,
    # a value that turns into its answer): the same node, other words, within ENTER_F frames.
    if dec:
        before = {node_of(film, t): t["text"] for t in film.ink[max(0, f0 - ENTER_F - 1)] if t["opacity"] >= 0.5}
        for f in range(max(0, f0 - ENTER_F), min(film.n, f0 + 2 * ENTER_F)):
            for t in film.ink[f]:
                k = node_of(film, t)
                if t["opacity"] >= 0.5 and k in before and t["text"] != before[k]:
                    keys.add(k)
    if dec and not keys:
        # A declared reveal must show: something enters or changes at its time by the system's measure of a change
        # (a cut, an entrance, a share of the frame that changes, a line that draws). The music alone is not a reveal.
        win = range(max(1, f0 - ENTER_F), min(film.n, f0 + after + 1))
        moved = max((float(film.change[f]) for f in win), default=0.0)
        if moved < REVEAL_CHANGE and not any(film.drawn[f] for f in win):
            out0 = [finding("reveal-size", "warning", film.t(win.start), film.t(win.stop - 1), {"reveal": None, "changedShare": round(moved, 3), "how": how},
                            {"minChangedShare": REVEAL_CHANGE},
                            f"Nothing changes on screen at the declared reveal ({at:.2f} s): bring the answer in there (a cut, an entrance, a push), or move B.reveal to the time it shows.")]
            film.notes.append({"check": "reveal-size", "reveal": None, "at": round(at, 2), "how": how, "nothingChanges": True})
            return out0
    if not keys:
        keys = {node_of(film, t) for t in film.ink[min(film.n - 1, f0 + ENTER_F)] if t["opacity"] >= 0.5}
    # The reveal's own line: the largest text of what enters (a window that enters with it brings its rows along).
    sized = {}
    for f in range(max(0, f0 - ENTER_F), min(film.n, f0 + max(2 * ENTER_F, after + ENTER_F))):
        for t in film.ink[f]:
            if node_of(film, t) in keys and t["opacity"] >= 0.5:
                sized[node_of(film, t)] = (max(t["cap"], sized.get(node_of(film, t), (0, ""))[0]), t["text"])
    if sized:
        # The reveal's own line: the largest text that enters, unless it is a short word (3 letters or fewer: "ON" set
        # larger beside "THURSDAY"); then the longest text that enters with it.
        first = max(sized, key=lambda k: sized[k][0])
        if len(sized[first][1].strip()) <= 3:
            # Its neighbours: what shows with it at the reveal and was not on screen just before (the words of one phrase).
            before = {node_of(film, t) for t in film.ink[max(0, f0 - ENTER_F - 1)] if t["opacity"] >= 0.5}
            for f in range(f0, min(film.n, f0 + 2 * ENTER_F)):
                for t in film.ink[f]:
                    k = node_of(film, t)
                    if t["opacity"] >= 0.5 and k not in before:
                        sized[k] = (max(t["cap"], sized.get(k, (0, ""))[0]), t["text"])
            first = max(sized, key=lambda k: (len(sized[k][1].strip()), sized[k][0]))
        keys = {first}
    if not keys:
        film.notes.append({"check": "reveal-size", "notMeasured": f"the reveal at {at:.2f} s ({how})", "why": "no text enters or shows at the reveal; a picture reveal is judged by subject-size"})
        return late
    # The hold: from the reveal to the frame its texts drop under opacity 0.5.
    start = next((f for f in range(max(0, f0 - ENTER_F), film.n) if any(node_of(film, t) in keys and t["opacity"] >= 0.5 for t in film.ink[f])), None)
    if start is None:
        return late
    end = start
    while end + 1 < film.n and any(node_of(film, t) in keys and t["opacity"] >= 0.5 for t in film.ink[end + 1]):
        end += 1
    # On the frame grid: a reveal held to the film's end holds to n / fps, one frame past its last frame's start (a
    # change at t shows on the first frame after t), as ending counts its hold.
    hold = (end - start + 1 + (1 if end == film.n - 1 else 0)) / film.fps
    words = max(1, len(" ".join({t["text"] for t in film.ink[start] if node_of(film, t) in keys}).split()))
    dens = (film.tokens or {}).get("density") or {}
    need = round((dens.get("minHoldBase") or 1.0) + (dens.get("minHoldPerWord") or 0.2) * words, 2)
    # The reveal as the film's last event holds as the system's end holds: never ask for more than direction.ends.hold.
    end_hold = film.limits.get("endHold")
    last_event = not any(g["f"] > end + 1 for g in entrance_groups(film))
    if last_event and end_hold is not None:
        need = min(need, end_hold)
    mine = max((t["cap"] for f in range(start, end + 1) for t in film.ink[f] if node_of(film, t) in keys and t["opacity"] >= 0.5), default=0)
    text = next((t["text"] for t in film.ink[start] if node_of(film, t) in keys), "")
    out = list(late)
    # The level, by the precision on the reels (8 reel errors judged: 2 real): an error where the type is the subject
    # (direction.compose.kind "fill": Kinetic), advice elsewhere (a UI state, a diagram's label, a typed line).
    sev = "error" if (((film.tokens or {}).get("direction") or {}).get("compose") or {}).get("kind") == "fill" else "advice"
    # A Kinetic reveal may be met another way than by the largest type (blocks/kineticWords: reveal, exit "toGround"):
    # the word grows into the ground, or an accent ground stands behind it. Then the size rules do not apply.
    acc = ((film.tokens or {}).get("colors") or {}).get("accent")
    grows = any(((n.get("data") or {}).get("exit") or n.get("exit")) == "toGround" for n in film.nodes if n.get("id", "").split("-")[0] in {k.split("-")[0] for k in keys})
    ground = False
    if acc and not grows:
        a = np.array([int(acc[i:i + 2], 16) for i in (1, 3, 5)])
        # Behind it while it shows (60 % of the frame), or grown into it as it leaves (90 % within 12 frames after).
        acc_share = lambda f: float((np.abs(film.rgb[f] - a[None, None, :]).max(axis=2) < 40).mean())  # noqa: E731
        # A grow, not a cut: the accent rises through partial shares over two frames or more before it fills the frame
        # (a cut to an accent ground after the reveal does not make a small word the largest moment).
        window = [acc_share(f) for f in range(max(start, end - 8), min(film.n, end + 13))]
        full = next((i for i, v in enumerate(window) if v >= 0.9), None)
        grown = full is not None and sum(1 for v in window[:full] if 0.15 < v < 0.9) >= 2
        ground = any(acc_share(f) >= 0.6 for f in range(start, end + 1, 3)) or grown
    if grows or ground:
        film.notes.append({"check": "reveal-size", "met": "the reveal grows into the ground (exit toGround)" if grows else "an accent ground stands behind the reveal"})
        return late if round(hold, 2) >= need else late + [finding("reveal-size", sev, film.t(start), film.t(end), {"reveal": text[:30], "hold": round(hold, 2), "words": words, "how": how},
                                                             {"minHold": need}, f"Hold the reveal \"{text[:30]}\" for {need} s or more (it shows {hold:.2f} s).", node=sorted(keys)[0])]
    # On screen: any other text larger than the reveal while the reveal shows.
    rival = None
    for f in range(start, end + 1):
        for t in film.ink[f]:
            if t["opacity"] >= 0.5 and node_of(film, t) not in keys and t["cap"] * SLACK > mine and (rival is None or t["cap"] > rival[0]):
                rival = (t["cap"], f, t["text"], node_of(film, t))
    if rival:
        out.append(finding("reveal-size", sev, film.t(start), film.t(end), {"reveal": text[:30], "revealCapPx": round(mine), "largerText": rival[2][:30],
                                                                                 "largerCapPx": round(rival[0]), "atFrame": rival[1], "how": how},
                           {"largestOnScreen": True},
                           f"The reveal \"{text[:30]}\" is smaller than \"{rival[2][:30]}\" on screen with it: show the reveal alone, or set it larger than everything beside it.",
                           node=sorted(keys)[0]))
    # In the film: smaller than most of the film's own moments.
    caps = [max((t["cap"] for t in film.ink[f] if t["opacity"] >= 0.5), default=0) for f in range(film.n) if not start <= f <= end]
    caps = [c for c in caps if c > 0]
    if caps:
        big = float(np.quantile(caps, LARGE_Q))
        if mine < SLACK * big:
            out.append(finding("reveal-size", sev, film.t(start), film.t(end), {"reveal": text[:30], "revealCapPx": round(mine), "filmLargeCapPx": round(big), "how": how},
                               {"atLeast": f"the film's median largest letters ({LARGE_Q:.0%} of frames are larger or equal)"},
                               f"The reveal \"{text[:30]}\" ({round(mine)} px letters) is smaller than most of the film's moments ({round(big)} px): make it the largest type of the film (a larger role, fewer letters on its line, or a camera push).",
                               node=sorted(keys)[0]))
    if round(hold, 2) < need:
        out.append(finding("reveal-size", sev, film.t(start), film.t(end), {"reveal": text[:30], "hold": round(hold, 2), "words": words, "how": how},
                           {"minHold": need, "from": "density.minHoldBase + minHoldPerWord x words"},
                           f"Hold the reveal \"{text[:30]}\" for {need} s or more (it shows {hold:.2f} s): move the next change later.",
                           node=sorted(keys)[0]))
    film.notes.append({"check": "reveal-size", "reveal": text[:30], "at": round(at, 2), "how": how, "capPx": round(mine), "hold": round(hold, 2)})
    return out
