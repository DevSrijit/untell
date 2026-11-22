"""Runs every detector check on one film and prints the findings as JSON.

Usage: python3 scripts/inspect/detect.py <film id> [--only check,check]
The film must be recorded and captured first: bun scripts/detect.ts does both and then calls this.
Each check is a module in scripts/inspect/checks/ with check(film) -> list of findings:
  {check, severity: "error" | "warning", from, to, node?, measured, limit, fix}
A check that cannot run on the film raises Skip; the reason goes to "skipped".
"""
import argparse
import importlib
import json
import re
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE / "checks"))
import cover  # noqa: E402
from film import DET as DET_DIR, Film, Skip, finding  # noqa: E402

# In the order a director reads a film: the opening, the flow, the frame, the type, the pictures, the sound, the end.
CHECKS = ["hook", "stall", "message_gap", "dead_space", "density", "transit_collision", "text_crossed", "shape_crossed", "joint", "panel_near_miss",
          "align_centre", "align_baseline", "align_near_miss", "align_rhythm", "align_half_px", "edge_cut", "reading_size", "scale",
          "contrast_over_picture", "type_over_media", "softness", "cutout_fringe", "repeat_shot", "accident", "sound", "sound_start", "beat_sync", "loudness", "hit_over_bed",
          "reveal_energy", "spoiler", "signature", "ending",
          "a11y_contrast", "a11y_flash", "a11y_colour_only", "a11y_motion", "a11y_captions",
          "motion_craft", "motion_rhythm", "motion_focus", "type_tells", "off_safe", "glitches", "change_offset", "edge_sliver", "block_warning", "text_overlap", "cover_any", "reveal_size", "reveal_gap", "ui_state"]


# A demo is not a film: a block demo or a defaults read-through (a few seconds, one block) has no hook, no arc and no
# end. A recording of DEMO_S or less, or one whose films module marks it `demo: true` (capture "demo"), runs the frame
# rules only; the film rules below are listed as not run, with why, and the report says "demo" in its verdict.
DEMO_S = 3.5
FILM_RULES = {"hook", "stall", "message_gap", "dead_space", "ending", "signature", "reveal_size", "reveal_gap", "reveal_energy", "spoiler",
              "beat_sync", "sound", "sound_start", "hit_over_bed", "repeat_shot", "a11y_captions"}


ADVICE = {"motion/unsynced", "reveal-energy", "motion/no-focus"}


def check_id(name):
    """The id a module reports under: a11y_flash -> a11y/flash, align_near_miss -> align/near-miss, dead_space -> dead-space."""
    if name == "sound_start":
        return "sound/hard-start"
    for p in ("a11y_", "motion_", "align_"):
        if name.startswith(p):
            return p[:-1] + "/" + name[len(p):].replace("_", "-")
    return name.replace("_", "-")


def cover_cause(film, e):
    """Why a text is behind a cut-out, where the recording can tell: the text stays over the next shot (its last
    visible frame is at or after the first frame of a cut-out that cuts in on that frame or just before)."""
    node = e["id"]
    frames = [f for f in range(film.n) for t in film.ink[f] if (t.get("node") or film.label(t["id"])) == node and t["opacity"] >= 0.5]
    if not frames:
        return None
    last = max(frames)
    f0 = round(e["from"] * film.fps)
    for f in range(max(1, f0 - 2), min(film.n, f0 + 3)):
        before = {film.label(x["id"]) for x in film.elements(f - 1) if x["kind"] == "image" and x.get("cutout") and x["opacity"] >= 0.5}
        new = [film.label(x["id"]) for x in film.elements(f) if x["kind"] == "image" and x.get("cutout") and x["opacity"] >= 0.5 and film.label(x["id"]) not in before]
        if new and f <= last <= f + 2:
            k = last - f + 1
            return {"cause": f"the text stays {k} frame{'s' if k > 1 else ''} over the next shot: its last frame ({last}) is at or after the first frame of {new[0]} ({f})",
                    "fix": "End the text one frame before the cut (until: cut time - 1 frame), or start the next shot one frame later."}
    return None


def cover_check(film):
    """The cover check (scripts/inspect/cover.py, unchanged): type behind a cut-out must still read. Each finding names
    its cause where the recording can tell it (cover_cause)."""
    rep = cover.check(str(film.rec.dir))
    out = []
    for e in rep["errors"]:
        why = cover_cause(film, e)
        measured = {"rule": e["rule"], "worst": e["worst"], "detail": e["detail"], **({"cause": why["cause"]} if why else {})}
        out.append(finding("cover", "error", e["from"], e["to"], measured, {"letter": cover.LETTER_MAX, "word": cover.WORD_MAX},
                           why["fix"] if why else "Move the type or the subject so the subject hides less of each letter: set the words with placeBehind, or shift the cut-out.",
                           node=e["id"]))
    return out


# The cause each rule's findings share, said once for a group (the first screen of untell check).
CAUSE = {
    "text-clipped": "text cut by the frame or a mask while it rests", "z-fight": "a patch that flickers every frame",
    "reading-size": "letters too small for a phone", "reading-time": "text that leaves before it can be read",
    "dead-space": "an empty part of the frame", "hook": "the opening does not show the subject in time",
    "ending": "the end does not hold as the system asks",
    "sound/hit-over-bed": "effects that the bed hides", "sound/effect-too-loud": "effects louder than the music",
    "motion/stagger": "many entrances on one frame", "sound/cut-on-beat": "cuts off the beat grid", "sound/hit-on-beat": "hits off the beat grid",
    "type-over-media": "type that cannot be read over its backdrop", "edge-cut": "graphics cut by the frame edge",
    "spoiler": "the answer shows before its reveal", "density": "too many words of prose at once",
    "stall": "the picture stands still too long", "message-gap": "no line on screen while no picture leads",
    "loudness": "the level of the mix", "sound/mix-loudness": "the level of the render", "sound/true-peak": "the true peak of the render",
    "sound/drop-on-change": "the music's drop misses the reveal", "signature": "the system's accent never shows",
    "accident": "a stray frame or element", "main-line": "the main line is too small for a phone",
    "subject-size": "the subject is small in the frame at a hero moment", "softness": "a picture drawn larger than its file",
    "change-offset": "two parts of one change land a frame apart", "edge-sliver": "a shape left a few px inside the frame edge",
    "block-warning": "what a block said while it built (a role that shrank, a line cut or left out)",
    "text-overlap": "text that crosses text", "reveal-gap": "frames with no text just before the reveal",
}


# The declaration: // untell-ignore <rule> [<node or block id> ...] [@<from>-<to>]: <reason>. The ids and the span are
# optional. Square brackets round an id (the old docs' [node]) are read as the id. A rule may be a family (sound/*), an
# old name (rules.ALIASES), or hyperframes/<code> (HyperFrames' own findings: the package matches those).
LINT_PREFIXES = ("tell/", "scene/", "lint/")  # untell lint's rule ids (scripts/lint/rules.ts): no detector rule has them
IGNORE = re.compile(r"//\s*untell-ignore\s+([\w/*.-]+)\s*([^:\n]*?)\s*:\s*(.+)$")
SPAN = re.compile(r"@\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*s?$")
NODE_ID = re.compile(r"""\bid:\s*["'`]([\w-]+)""")


def declarations(film, rule_ids, aliases=None):
    """The scene's declared exceptions: `// untell-ignore <rule> [<id> ...] [@<from>-<to>]: <reason>` in the film's source
    files (out/detector/<id>/sources.json). A reason is required. An id is a node id or a block id (a block id covers
    every node of the block: "joint-line" covers "joint-line-0"). A span (@3.4-3.5, seconds; @3.4 for one time) covers the
    findings that overlap it. With no id and no span, the comment binds to the block call on the next code line (its
    `id: "..."`); a comment with neither applies to the whole film and the report says so. Every declaration is kept with
    the findings it suppresses; one that matches nothing is listed with the reason. align/* rules are the alignment
    pass's (it reads the same comments); lint rules are untell lint's."""
    p = DET_DIR / film.id / "sources.json"
    try:
        files = json.loads(p.read_text())
    except (OSError, ValueError):
        return [], "no sources.json: the scene's untell-ignore comments were not read"
    out = []
    # The scene's block ids (id: "..." in its source): a declared id covers a part of its block, never another block
    # whose id only starts with it (node_match).
    owners = set()
    for fp in files:
        try:
            owners |= {m.group(1) for m in NODE_ID.finditer(Path(fp).read_text())}
        except OSError:
            pass
    for fp in files:
        try:
            lines = Path(fp).read_text().splitlines()
        except OSError:
            continue
        for i, line in enumerate(lines):
            m = IGNORE.search(line)
            if not m or m.group(1).startswith("align"):
                continue
            rule, rest = m.group(1), m.group(2).strip()
            # A lint rule (tell/*, scene/*, or with the lint/ prefix) is untell lint's: it applies to its own line or the
            # next, the detector never reports it, so it is kept as a lint declaration and never counts as unused.
            lint = rule.startswith(LINT_PREFIXES)
            known = lint or rule.startswith("hyperframes/") or rule in rule_ids or rule in (aliases or {}) or any(r.startswith(rule[:-1]) for r in rule_ids if rule.endswith("/*"))
            span = None
            sm = SPAN.search(rest)
            if sm:
                a = float(sm.group(1))
                span = (a, float(sm.group(2)) if sm.group(2) else a)
                rest = rest[:sm.start()].strip()
            nodes = [n.strip("[]") for n in re.split(r"[\s,]+", rest) if n.strip("[]")]
            bound = None
            if not nodes and not span and not rule.startswith("hyperframes/"):
                for nxt in lines[i + 1:i + 4]:
                    if nxt.strip().startswith("//"):
                        continue
                    k = NODE_ID.search(nxt)
                    if k:
                        # A template id (`tick-${i}`) cannot be read: the comment covers every id with its start.
                        tpl = nxt[k.end():k.end() + 2] == "${"
                        nodes, bound = [k.group(1) + "*" if tpl else k.group(1)], "the block call on the next line" + (" (a template id: every id that starts with it)" if tpl else "")
                    break
            scope = bound or ("named nodes" if nodes else "") or ""
            if span:
                scope = (scope + " " if scope else "") + f"@{span[0]:g}-{span[1]:g} s"
            out.append({"owners": sorted(owners), "rule": rule, "nodes": nodes, "span": span, "reason": m.group(3).strip(), "where": f"{Path(fp).name}:{i + 1}",
                        "scope": scope or "the whole film", "matched": 0, "known": known, **({"lint": True} if lint else {})})
    return out, None


def system_allows(film, findings):
    """Findings on a signature move the system asks for: the direction's move names the block that draws it and the
    checks it trips by design (Move `allows`: Pop's iris grows from a point and covers the frame). A finding is the
    move's when a node it names was drawn by that block (the node's `block`), or, for a finding with no node, when a
    node of that block is on screen through its span. Returns (kept, allowed); each allowed finding says which move."""
    moves = [m for m in (((film.tokens or {}).get("direction") or {}).get("moves") or []) if isinstance(m, dict) and m.get("allows")]
    if not moves:
        return findings, []
    by_label = {n.get("id"): n for n in film.nodes if isinstance(n, dict)}

    def block_of(label):
        n = by_label.get(label)
        while n is None and "-" in label:
            label = label.rsplit("-", 1)[0]
            n = by_label.get(label)
        return (n or {}).get("block")

    def shows(block, fr):
        return 0 <= fr < film.n and any(block_of(film.label(e["id"])) == block for e in film.elements(fr))

    def on_screen(block, f0, f1):
        # Through the span, or round it: the block shows just before and just after (the ground between two of its cards).
        if any(shows(block, fr) for fr in range(max(0, f0), min(film.n, f1 + 1))):
            return True
        return any(shows(block, f0 - k) for k in range(1, 16)) and any(shows(block, f1 + k) for k in range(1, 16))

    kept, allowed = [], []
    for f in findings:
        m = next((m for m in moves if f["check"] in m["allows"]["checks"] and (
            any(block_of(p) == m["allows"]["block"] for p in parts_of(f.get("node"))) if f.get("node")
            else on_screen(m["allows"]["block"], int(round(f["from"] * film.fps)), int(round(f["to"] * film.fps))))), None)
        if m:
            allowed.append({**f, "allowedBy": {"move": m["move"], "why": m["allows"]["why"]}})
        else:
            kept.append(f)
    return kept, allowed


def parts_of(node):
    """The node ids a finding names: "a x b", "a, b", "a .. b", "t:a" all give a and b."""
    return [x.split(":", 1)[-1] if re.match(r"^[ste]:", x) else x for x in re.split(r" x |, | \.\. |\s\(", node or "") if x]


def node_match(n, p, owners=()):
    """A declared id n covers a finding's node p: the same id, or one is the other's block (p starts with n + "-" or
    n + ":", or n starts with p + "-": a declared generated id "joint-line-0" covers a finding on the block "joint-line").
    A part p of n is n's only when no longer block id of the scene owns it (`owners`: "tick" does not cover "tick-dim"
    when tick-dim is a block of its own). "tick-*" covers every id that starts with "tick-" (a template id's nodes)."""
    if n.endswith("*"):
        return p.startswith(n[:-1])
    if p == n or p.startswith(n + ":") or n.startswith(p + "-"):
        return True
    if not p.startswith(n + "-"):
        return False
    return not any(b != n and len(b) > len(n) and b.startswith(n + "-") and (p == b or p.startswith(b + "-") or p.startswith(b + ":")) for b in owners)


def declared_match(d, f, aliases=None):
    """True when declaration d covers finding f: the same rule, a family (sound/*), or an old name of the rule
    (rules.ALIASES: a declared beat-sync covers sound/cut-on-beat); its ids cover the finding's node; its span overlaps
    the finding's time (one frame of slack)."""
    same = f["check"] == d["rule"] or (d["rule"].endswith("/*") and f["check"].startswith(d["rule"][:-1])) \
        or f["check"] in (aliases or {}).get(d["rule"], [])
    if not same:
        return False
    if d.get("span"):
        a, b = d["span"]
        if f["to"] < a - 0.04 or f["from"] > b + 0.04:
            return False
    if not d["nodes"]:
        return True
    return any(node_match(n, p, d.get("owners", ())) for p in parts_of(f.get("node")) for n in d["nodes"])


def why_unused(d, findings, aliases):
    """Why a declaration matched nothing, and the selector that would match, when a finding of its rule exists."""
    if d["rule"].startswith("hyperframes/"):
        return "a HyperFrames finding: untell check matches it against HyperFrames' own findings (this pass has none)"
    if not d["known"]:
        return f"no rule is called {d['rule']}: run bun scripts/detect.ts --rules for the ids"
    tpl = [n for n in d["nodes"] if n.endswith("-")]
    if tpl:
        return f"{tpl[0]} looks like a template id (`{tpl[0]}${{i}}`), which a comment cannot read: declare {tpl[0]}* (every id that starts with {tpl[0]})"
    same = [f for f in findings if declared_match({**d, "nodes": [], "span": None}, f, aliases)]
    if not same:
        return "no finding of this rule: remove it"
    f = same[0]
    sel = f"@{f['from']:.2f}-{f['to']:.2f}"
    if d["nodes"] and not f.get("node"):
        return f"the finding at {f['from']:.2f} s has no node: declare it with its time, // untell-ignore {f['check']} {sel}: <reason>"
    if d["nodes"]:
        return f"no finding of {f['check']} on {', '.join(d['nodes'])}: the finding at {f['from']:.2f} s is on {f.get('node')} (declare {parts_of(f.get('node'))[0].split('-')[0]} or {sel})"
    return f"no finding of {f['check']} in {d['scope']}: the nearest is at {f['from']:.2f}-{f['to']:.2f} s ({sel})"


def settle(decl, findings, aliases):
    """Writes each declaration's effect line, and returns a note for each one that matched no finding. A lint rule's
    declaration is untell lint's (the detector never reports the rule), so it is never unused here."""
    notes = []
    for d in decl:
        if d.get("lint"):
            d["effect"] = f"declared {d['rule']} ({d['where']}): a lint rule: untell lint applies it to its own line or the next"
            continue
        d["effect"] = effect_line(d)
        if not d["matched"]:
            d["why"] = why_unused(d, findings, aliases)
            if not d["rule"].startswith("hyperframes/"):
                notes.append({"check": "untell-ignore", "unused": f"{d['where']}: {d['rule']} {' '.join(d['nodes'])}".strip(), "why": d["why"]})
        if d["rule"] in aliases:
            d["effect"] += f" (the rule is now {', '.join(aliases[d['rule']])}: declare that id)"
    return notes


def effect_line(d):
    """The one line that says what a declaration did."""
    at = f" at {d['span'][0]:g}-{d['span'][1]:g} s" if d.get("span") else ""
    on = f" on {', '.join(d['nodes'])}" if d["nodes"] else ""
    n = d["matched"]
    return f"declared {d['rule']}{on}{at} ({d['where']}, {d['scope']}): {d['reason']}: suppresses {n} finding{'' if n == 1 else 's'}"


# The hook judges five things; each has its own cause and its own fix, so its findings group by what they measured.
HOOK_KINDS = [("firstMove", "the opening does not move in its first second"), ("firstPicture", "the opening does not show the subject in time"),
              ("firstLine", "the opening line is late or too small"), ("emptyContainer", "an empty pane in the opening"),
              ("textAlone", "text alone on the ground before the picture")]


# The parts of the signature rule, by what a finding measured: each part has its own cause and its own fix. Before, every
# signature group took the title "the system's accent never shows", also over the fix of an accent on too many parts.
SIGNATURE_KINDS = [("accentShareMax", "the system's accent never shows"), ("accentElements", "the accent on more parts at once than the system allows"),
                   ("move", "the signature move does not show")]


def kind_of(f):
    """The part of its rule that a finding measured: one of HOOK_KINDS for the hook, one of SIGNATURE_KINDS for the
    signature, else None."""
    kinds = HOOK_KINDS if f["check"] == "hook" else SIGNATURE_KINDS if f["check"] == "signature" else None
    if not kinds:
        return None
    m = f.get("measured") or {}
    return next((k for k, _ in kinds if k in m), None)


def groups_of(findings):
    """The first screen: findings grouped by cause. One group is the findings of one rule with one fix sentence (the
    same change removes them), or of one rule over the same time (within 0.5 s: three empty bands of one moment). Errors first, then by
    time. likelyGoneAfterFix is the size of the group: one change to the scene clears them all."""
    order = {"error": 0, "warning": 1, "advice": 2}
    out = []
    for f in findings:
        g = next((g for g in out if g["check"] == f["check"] and g.get("kind") == kind_of(f) and (g["fix"] == f["fix"] or (f["from"] <= g["to"] + 0.5 and f["to"] >= g["from"] - 0.5))), None)
        if g is None:
            g = {"check": f["check"], "severity": f["severity"], "fix": f["fix"], "from": f["from"], "to": f["to"], "nodes": [], "count": 0}
            if kind_of(f):
                g["kind"] = kind_of(f)
            out.append(g)
        g["count"] += 1
        g["from"], g["to"] = min(g["from"], f["from"]), max(g["to"], f["to"])
        if order.get(f["severity"], 3) < order.get(g["severity"], 3):
            g["severity"] = f["severity"]
        if f.get("node") and f["node"] not in g["nodes"]:
            g["nodes"].append(f["node"])
    for g in out:
        what = dict(HOOK_KINDS + SIGNATURE_KINDS).get(g.get("kind"), CAUSE.get(g["check"], g["check"]))
        g.pop("kind", None)
        if "attack" in g["fix"]:
            what = "an effect file with two attacks"
        # The loudness rule also judges each hit against its picture: a hit with no picture change near it, or off its
        # change, is a timing fault, not the level of the mix (an agent's Keynote film read the wrong heading).
        if g["check"] == "loudness" and "Give this hit a cause on screen" in g["fix"]:
            what = "a hit with no picture change near it"
        elif g["check"] == "loudness" and "Move the hit so its peak lands" in g["fix"]:
            what = "a hit off its picture change"
        g["cause"] = (f"{g['count']} findings share one cause: {what}" if g["count"] > 1 else what) + f" ({g['from']:.2f}-{g['to']:.2f} s)"
        g["title"] = what  # the cause in words alone: the first screen prints it with its own time column
        g["likelyGoneAfterFix"] = g["count"]
        g["nodes"] = g["nodes"][:6]
    out.sort(key=lambda g: (order.get(g["severity"], 3), g["from"]))
    return out


def verdict_of(kept, film):
    """The one verdict line, in three states: "failed" (an error), "passed with N warnings" (exit 0, but each warning is
    fixed or declared before delivery; an untell-ignore that matches no finding counts here too), "passed" (no error,
    no warning, no unused declaration). Advice never counts. A render that does not
    match the scene (older than its source) is said in the verdict: its sound was not checked, so it is not a pass of
    the render."""
    e = sum(f["severity"] == "error" for f in kept)
    w = sum(f["severity"] == "warning" for f in kept)
    a = sum(f["severity"] == "advice" for f in kept)
    # An untell-ignore that matches no finding: the film is not done (the declaration is stale, or names the wrong rule
    # or node), so the verdict is not a plain pass. The exit code and the JSON follow the state.
    u = sum(1 for n in film.notes if n.get("check") == "untell-ignore" and n.get("unused"))
    stale = next((n["info"] for n in film.notes if n.get("check") == "sound" and "older than" in str(n.get("info", ""))), None)
    unused = f"{u} untell-ignore{'s' if u > 1 else ''} that match{'es' if u == 1 else ''} no finding" if u else ""
    if e:
        state, line = "failed", f"failed: {e} error{'s' if e > 1 else ''}" + (f", {w} warning{'s' if w > 1 else ''}" if w else "") + (f", {unused}" if u else "")
    elif w or u:
        parts = ([f"{w} warning{'s' if w > 1 else ''}"] if w else []) + ([unused] if u else [])
        state, line = "warnings", f"passed with {' and '.join(parts)}: " + ("fix or declare each warning" if w else "") + (" and " if w and u else "") + ("remove each untell-ignore that matches no finding" if u else "") + " before delivery"
    else:
        state, line = "passed", "passed"
    if a:
        line += f" ({a} advice)"
    if stale:
        line += ". The render does not match the scene: sound not checked"
    if getattr(film, "demo", False):
        line += " (a demo: frame rules only)"
    return {"state": state, "errors": e, "warnings": w, "advice": a, "unusedDeclarations": u, "renderStale": bool(stale), "line": line}


def promoted_block_warnings(film, findings):
    """A block's warning that another check was to measure on the frames (a line outside the text-safe area is
    off-safe's), when that check found nothing on the node: a block-warning finding of its own, so no block warning
    stays only in the notes (before: text past the safe area from text and callout reached no verdict)."""
    import block_warning

    def covered(n):
        by = {c.strip() for c in str(n.get("measuredBy", "")).split(",")}
        node = n.get("node") or ""
        return any(f["check"] in by and (not f.get("node") or any(p == node or p.startswith(node + "-") or node.startswith(p + "-") for p in parts_of(f.get("node"))))
                   for f in findings)
    out = []
    for n in [x for x in film.notes if x.get("check") == "block-warning" and x.get("measuredBy")]:
        if covered(n):
            continue
        sp = block_warning.span(film, n["node"])
        a0, b0 = (film.t(sp[0]), film.t(sp[1])) if sp else (0, film.seconds)
        out.append(finding("block-warning", "warning", a0, b0, {"message": n["message"], "measuredBy": n["measuredBy"], "measuredThere": "nothing on this node"}, {"warnings": 0},
                           f"{n['message']} (the block's own warning; {n['measuredBy']} found nothing on this node: change its text, box or role until it draws as asked)", node=n["node"]))
        n["promoted"] = True
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("film")
    ap.add_argument("--only", default=None)
    ap.add_argument("--demo", action="store_true", help="a block demo: frame rules only (the films module's demo: true does the same)")
    a = ap.parse_args()
    film = Film(a.film)
    film.demo = a.demo or bool(film.cap.get("demo")) or film.seconds <= DEMO_S + 1e-6
    only = set(a.only.split(",")) if a.only else None
    findings, skipped = [], {}
    for name in CHECKS + ["cover"]:
        if only and name not in only and check_id(name) not in only:
            continue
        if film.demo and name in FILM_RULES:
            skipped[check_id(name)] = f"a demo ({film.seconds:.1f} s{', marked demo' if (a.demo or film.cap.get('demo')) else f', {DEMO_S} s or less'}): film rules do not apply"
            continue
        try:
            if name in ("beat_sync", "hit_over_bed") and getattr(film, "render_checked", False):
                skipped[{"beat_sync": "sound/cut-on-beat (the scene's mix)", "hit_over_bed": "sound/hit-over-bed (the scene's mix)"}[name]] = "measured on the real render instead"
                continue
            if name == "cover":
                found = cover_check(film)
            else:
                found = importlib.import_module(name).check(film)
            findings += found
        except Skip as s:
            skipped[check_id(name)] = str(s)
        except Exception:  # a broken check must not hide the others
            skipped[check_id(name)] = "crashed: " + traceback.format_exc(limit=3).strip().splitlines()[-1]
            print(traceback.format_exc(), file=sys.stderr)
    if not only or "block-warning" in only or "block_warning" in only:
        findings += promoted_block_warnings(film, findings)
    # Advice: checks whose reel findings need an ear to judge (music timing), or that have no confirmed reel case yet
    # (motion/no-focus); they show, but never fail a film.
    for f in findings:
        if f["check"] in ADVICE:
            f["severity"] = "advice"
    order = {"error": 0, "warning": 1, "advice": 2}
    findings.sort(key=lambda f: (order.get(f["severity"], 3), f["from"]))
    # Findings the scene declares intended (untell-ignore with a reason): out of the findings, never hidden: each is
    # listed with its reason and place, and each declaration with how many findings it matched.
    try:
        import rules as catalog
        rule_ids = [r["id"] for r in catalog.RULES]
        aliases = getattr(catalog, "ALIASES", {})
    except Exception:  # noqa: BLE001  a broken catalog must not stop the report
        rule_ids, aliases, why0 = [], {}, "the rule catalog (checks/rules.py) did not load: untell-ignore comments were not read"
        film.notes.append({"check": "untell-ignore", "info": why0})
    # The system's own signature moves are not faults in that system (direction move `allows`); each is listed.
    findings, allowed = system_allows(film, findings)
    for f in allowed:
        film.notes.append({"check": f["check"], "info": f"the system's move on {f.get('node') or 'the frame'} ({f['from']:.2f}-{f['to']:.2f} s): {f['allowedBy']['why']}"})
    decl, why = declarations(film, rule_ids, aliases)
    if why:
        film.notes.append({"check": "untell-ignore", "info": why})
    declared, kept = [], []
    for f in findings:
        ds = [d for d in decl if not d["rule"].startswith("hyperframes/") and not d.get("lint") and declared_match(d, f, aliases)]
        for d in ds:  # every declaration that covers the finding counts it (two comments on one finding both show)
            d["matched"] += 1
        d = ds[0] if ds else None
        if d:
            declared.append({**f, "declared": {"reason": d["reason"], "where": d["where"], "scope": d["scope"]}})
        else:
            kept.append(f)
    film.notes.extend(settle(decl, findings, aliases))
    for d in decl:
        d.pop("owners", None)
    verdict = verdict_of(kept, film)
    print(json.dumps({"film": film.id, "system": film.system, "seconds": round(film.seconds, 2), "limits": film.limits,
                      "verdict": verdict, "groups": groups_of(kept), "findings": kept, "declared": declared, "declarations": decl, "allowed": allowed,
                      "skipped": skipped, "notes": film.notes}))


if __name__ == "__main__":
    main()
