"""Checks the inspect tools against clips whose problems are known.

Each check names a clip, the frame to look at, and the fact that must (or must not) appear.
Usage: python3 scripts/inspect/validate.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import balance  # noqa: E402
import colour  # noqa: E402
import grid  # noqa: E402
import heat  # noqa: E402
from common import load  # noqa: E402

results = []


def check(name, ok, detail):
    results.append((name, bool(ok), detail))


def g(rec_id, f):
    return grid.facts_for(load(rec_id), f)


for design in ("A", "B"):
    # Clean clips stay quiet.
    for f in (60, 160, 270):
        facts = g(f"explainer-{design}-none", f)
        check(f"{design} clean f{f}: no covered text", not facts["covered_text"], facts["covered_text"])
        check(f"{design} clean f{f}: nothing outside the frame", not facts["out_of_frame"], facts["out_of_frame"])
    # Clipped: the closing line runs off the right edge.
    facts = g(f"explainer-{design}-clipped", 280)
    check(f"{design} clipped: closing line outside the frame", any("right" in o["px_outside"] for o in facts["out_of_frame"]), facts["out_of_frame"])
    # Occlusion: the grown card covers its neighbour's label.
    facts = g(f"explainer-{design}-occlusion", 225)
    check(f"{design} occlusion: a label is covered", any(c for c in facts["covered_text"]), [(c["text"], c["covered_by"], c["overlap_pct"]) for c in facts["covered_text"]])
    # Tiny text: 13 px labels show in the type sizes.
    facts = g(f"explainer-{design}-tiny_text", 200)
    check(f"{design} tiny text: 13 px type found", min(facts["distinct_type_sizes_px"] or [99]) <= 14, facts["distinct_type_sizes_px"])
    # Low contrast: the subtitle fails in luminance.
    rec = load(f"explainer-{design}-low_contrast")
    c = colour.facts_for(rec, 60)
    sub = [x for x in c["greyscale_text_contrast"] if x["text"].startswith(("Here is", "Every formula"))]
    check(f"{design} low contrast: subtitle under 3:1", sub and sub[0]["greyscale_contrast"] < 3, sub)
    clean = colour.facts_for(load(f"explainer-{design}-none"), 60)
    sub = [x for x in clean["greyscale_text_contrast"] if x["text"].startswith(("Here is", "Every formula"))]
    check(f"{design} clean: subtitle over 4.5:1", sub and sub[0]["greyscale_contrast"] >= 4.5, sub)

# Opus drafts with content in the top of the frame: weight and emptiness show it.
for rec_id, f in (("gen-rust_v0", 150),):
    rec = load(rec_id)
    b = balance.facts_for(rec, f)
    _, e = heat.emptiness(rec, f)
    check(f"{rec_id}: bottom third carries little weight", b["weight_pct_top_middle_bottom"][2] < 15, b["weight_pct_top_middle_bottom"])
    check(f"{rec_id}: bottom of the safe area is mostly empty", e["dead_pct_by_third_of_safe_area"][2] > 50, e["dead_pct_by_third_of_safe_area"])
    c = colour.facts_for(rec, f)
    check(f"{rec_id}: AI colour tell found", c.get("ai_colour_tells"), c.get("ai_colour_tells"))

# AI colour tells on Opus drafts, and the soft glow on the test clips that have one.
for rec_id, f in (("gen-https_v0", 45),):
    c = colour.facts_for(load(rec_id), f)
    check(f"{rec_id}: AI colour tell found", c.get("ai_colour_tells"), c.get("ai_colour_tells"))
for rec_id in ("explainer-A-none", "explainer-B-none"):
    gl = colour.soft_glow(load(rec_id).frame(150))
    check(f"{rec_id}: soft glow found", gl["share_pct"] >= 3, gl)
gl = colour.soft_glow(load("specimen-swiss2").frame(150))
check("swiss: no soft glow", gl["share_pct"] < 3, gl)

# The Swiss specimen: on palette, one red thing per frame.
rec = load("specimen-swiss2")
for f in (69, 150, 261):
    c = colour.facts_for(rec, f)
    check(f"swiss f{f}: no off-palette colour", not c["off_palette"], c["off_palette"])
    check(f"swiss f{f}: the accent marks one subject", 1 <= len(c["accent_elements"]) <= 2, c["accent_elements"])

passed = sum(ok for _, ok, _ in results)
for name, ok, detail in results:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + ("" if ok else f"   {str(detail)[:200]}"))
print(f"\n{passed}/{len(results)} checks pass")
sys.exit(0 if passed == len(results) else 1)
