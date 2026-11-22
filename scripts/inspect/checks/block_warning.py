"""block-warning: what the blocks said while the scene was built: a title that shrank a role to fit, a code line that
wraps, a label that was cut or left out, a box outside the text-safe area.

The capture (version 5) keeps every console warning that the scene's blocks gave while it built (detect.ts wraps the
scene). A warning that starts with "<block> <id>:" and whose id names a node of the film (the node, or its parts
"<id>-...") is a finding with the block's own message, over the time the node shows. A warning of a block that draws
no node (a size probe such as B.measure) goes to the notes, and so does a warning whose fault another check measures
on the frames (MEASURED: an enlarged photo is softness's, a line outside the text-safe area is off-safe's), so one
fault gives one finding. A warning that only says how the block adapted with nothing lost (INFO: a panel that widens)
goes to the notes too. A capture without warnings (before version 5, or a
HyperFrames page that untell did not build) says so and is not passed.
"""
import re

from film import Skip, finding

HEAD = re.compile(r"^(?:(\w+) )?([\w-]+): (.+)$", re.S)
# Warnings whose fault another check measures on the frames: they go to the notes with that check's name, so one fault
# is one finding (an enlarged photo is softness's; a line outside the text-safe area is off-safe's or text-clipped's;
# an effect's level without a bed is measured by the sound checks).
MEASURED = [(re.compile(r"is enlarged [\d.]+x"), "softness"), (re.compile(r"text-safe area"), "off-safe"),
            (re.compile(r"no bed given"), "hit-over-bed, sound/effect-too-loud")]
# Warnings that say how the block adapted with nothing lost on screen (a panel that widens to reach the text-safe edge),
# or how a prop reads (a move given as steps): the notes, not a finding.
INFO = [re.compile(r"panel widens"), re.compile(r"moves with dx and dy step")]


def span(film, node):
    """First and last frame on which a part of the node shows (opacity 0.5), from the elements and the ink."""
    def mine(label):
        return label == node or label.startswith(node + "-") or label.startswith(node + ":")
    fs = [f for f in range(film.n)
          if any(e["opacity"] >= 0.5 and mine(film.label(e["id"])) for e in film.elements(f))
          or any(t["opacity"] >= 0.5 and mine(t.get("node") or film.label(t["id"])) for t in film.ink[f])]
    return (fs[0], fs[-1]) if fs else None


def check(film):
    said = film.cap.get("warnings")
    if said is None:
        raise Skip("the capture holds no block warnings (a capture before version 5): capture the film again")
    ids = {n.get("id") for n in film.nodes if n.get("id")}
    out, seen = [], set()
    for msg in said:
        m = HEAD.match(msg.strip())
        if not m or msg in seen:
            continue
        seen.add(msg)
        block, node, text = m.group(1), m.group(2), m.group(3).strip()
        if not any(i == node or i.startswith(node + "-") for i in ids):
            film.notes.append({"check": "block-warning", "fromNoNode": msg[:200], "why": "the block draws no node of the film (a size probe)"})
            continue
        if any(rx.search(text) for rx in INFO):
            film.notes.append({"check": "block-warning", "node": node, "message": text[:200], "info": "the block adapted; nothing is lost on screen"})
            continue
        by = next((c for rx, c in MEASURED if rx.search(text)), None)
        if by:
            film.notes.append({"check": "block-warning", "node": node, "message": text[:200], "measuredBy": by})
            continue
        sp = span(film, node)
        a, b = (film.t(sp[0]), film.t(sp[1])) if sp else (0, film.seconds)
        out.append(finding("block-warning", "warning", a, b, {"block": block, "message": text[:300]}, {"warnings": 0},
                           f"{text} (the {block or 'block'}'s own warning: change its text, box or role until it draws as asked)", node=node))
    return out
