"""Writes scripts/inspect/hf_overrides.json: for each system, the HyperFrames check findings (`hyperframes check`)
that the system's own direction contradicts, with the severity untell gives them and why, quoting the system's rule.

Usage: python3 scripts/inspect/hf_overrides.py [--check]
  --check   write nothing; exit 1 when the file on disk differs from what the tokens give (the test runs this)
The package reads the file (tools/inspect/hf_overrides.json) and passes each HyperFrames finding through with the
system's severity: "off" (the system asks for the opposite, so the finding is not shown) or "advice" (shown, never
fails). It is generated from systems/<id>/tokens.json, so it cannot drift from the systems:
  line_unread      the film's last line needs 2 s: off for a system whose end is a cut with no hold, or whose end holds
                   its last change under 2 s (direction.ends.hold); untell's reading-time check judges that line
  dead_stretch     more than 3 s with nothing changing: advice for a system whose maxStill is 3 s or more
  text_below_floor text under 2.6 % of the short side: advice for a system that sets a role under that size
Text in a role that a system sets past the frame edge on purpose (tokens bleed: Kinetic, Courtside) needs no row: the
renderers mark it with HyperFrames' own opt-outs (data-layout-allow-overflow, data-layout-allow-safe-zone; layout.ts
textAttrs), so canvas_overflow and outside_safe_zone stay full findings for every other element.
  film_silent      a film over 15 s with no sound: off for a system with no music bed (media.music.level 0)
The codes come from HyperFrames' own docs (references/lint-validate-inspect.md: the craft and layout findings); the
test checks that every system named is a system of the repository and every code is one of KNOWN.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / "hf_overrides.json"
KNOWN = {"line_unread", "dead_stretch", "text_below_floor", "first_frame_empty", "film_silent", "canvas_overflow",
         "outside_safe_zone", "content_overlap"}
FLOOR = 0.026  # HyperFrames' text_below_floor: 2.6 % of the frame's short side
CLOSING_S = 2.0  # HyperFrames' line_unread: the film's last line needs 2 s on screen


def overrides():
    out = {}
    for p in sorted((ROOT / "systems").glob("*/tokens.json")):
        t = json.loads(p.read_text())
        d = t.get("direction") or {}
        ends = d.get("ends") or {}
        rows = {}
        if ends.get("kind") == "cut" and not ends.get("hold"):
            rows["line_unread"] = {"severity": "off", "why": f"{t['name']} ends on a cut with no hold: \"{ends.get('how', '')}\""}
        elif ends.get("hold") is not None and ends["hold"] < CLOSING_S:
            rows["line_unread"] = {"severity": "off", "why": f"{t['name']}'s end holds its last change {ends['hold']:g} s (direction ends.hold), under HyperFrames' "
                                                            f"{CLOSING_S:g} s for a closing line; untell's reading-time check judges the last line by its words"}
        if (d.get("maxStill") or 0) >= 3:
            rows["dead_stretch"] = {"severity": "advice", "why": f"{t['name']} may hold still for {d['maxStill']} s (direction maxStill): stillness is part of its pace"}
        small = sorted((v["size"], k) for k, v in (t.get("type") or {}).items() if v.get("size", 1) < FLOOR)
        if small:
            rows["text_below_floor"] = {"severity": "advice", "why": f"{t['name']} sets its {', '.join(k for _, k in small)} role{'s' if len(small) > 1 else ''} at "
                                                                     f"{', '.join(f'{s * 100:.1f} %' for s, _ in small)} of the short side, under HyperFrames' 2.6 %; untell's reading-size checks it per role on a phone"}
        level = ((t.get("media") or {}).get("music") or {}).get("level")
        if level == 0:
            rows["film_silent"] = {"severity": "off", "why": f"{t['name']} has no music bed (media.music.level 0): silence is its sound"}
        if rows:
            out[t["id"]] = rows
    return out


def main():
    data = overrides()
    text = json.dumps(data, indent=1, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        ids = {p.parent.name for p in (ROOT / "systems").glob("*/tokens.json")}
        bad = [f"{s}/{c}" for s, rows in data.items() for c in rows if s not in ids or c not in KNOWN]
        stale = not OUT.exists() or OUT.read_text() != text
        print(json.dumps({"systems": len(data), "unknown": bad, "stale": stale}))
        sys.exit(1 if bad or stale else 0)
    OUT.write_text(text)
    print(f"wrote {OUT}: {sum(len(r) for r in data.values())} overrides in {len(data)} systems")


if __name__ == "__main__":
    main()
