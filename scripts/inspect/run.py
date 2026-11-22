"""Runs the inspect tools on a recording and writes inspect.md and inspect.json.

Every tool returns an image to look at and measured facts with pixel values. Nothing here is a
to-do list or a score: the facts describe the frame, and the model decides what to change.
Usage: python3 scripts/inspect/run.py <recording> [--frames 2.5,5,7.5] [--tools grid,heat,balance,colour,curves,zoom]
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import balance  # noqa: E402
import colour  # noqa: E402
import cover  # noqa: E402
import curves  # noqa: E402
import grid  # noqa: E402
import heat  # noqa: E402
import zoom  # noqa: E402
from common import ROOT, load, out_dir  # noqa: E402


def holds(rec):
    """Stretches where nothing visibly changes (against the frame 0.2 s earlier). The closing hold, which
    reaches the last frame, is reported apart: a film should end on a held frame."""
    import numpy as np
    from PIL import Image
    lag = max(1, rec.fps // 5)
    grey = [np.asarray(Image.open(rec.dir / "frames" / f"f{f:04d}.jpg").convert("L").resize((216, 384)), dtype=np.int16) for f in range(rec.n)]
    still = [f > 0 and float((np.abs(grey[f] - grey[max(0, f - lag)]) > 12).mean()) < 0.0005 for f in range(rec.n)]
    runs, start = [], None
    for f, v in enumerate(still + [False]):
        if v and start is None:
            start = f
        elif not v and start is not None:
            runs.append((start, f - 1))
            start = None
    closing = next(((a, b) for a, b in runs if b == rec.n - 1), None)
    inner = [(a, b) for a, b in runs if b != rec.n - 1]
    a, b = max(inner, key=lambda r: r[1] - r[0], default=(0, -1))
    return {"longest_s": round((b - a + 1) / rec.fps, 2), "from_s": round(a / rec.fps, 2),
            "over_1_5_s": sum((q - p + 1) / rec.fps > 1.5 for p, q in inner),
            "closing_s": round((closing[1] - closing[0] + 1) / rec.fps, 2) if closing else 0}

ALL = ["grid", "heat", "balance", "colour", "curves", "zoom"]


def ensure_png(rec_id: str, frames: list[int], films: str | None = None):
    """Records lossless key frames that are missing. With `films`, only that films module is bundled."""
    d = ROOT / "out" / "recordings" / rec_id / "frames-png"
    missing = [f for f in frames if not (d / f"f{f:04d}.png").exists()]
    if missing:
        extra = ["--films", films] if films else []
        subprocess.run(["bun", "scripts/record.ts", *extra, "--at", ",".join(map(str, missing)), rec_id], cwd=ROOT, check=True, capture_output=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("recording")
    ap.add_argument("--frames", default="2.5,5,7.5", help="seconds")
    ap.add_argument("--tools", default=",".join(ALL))
    ap.add_argument("--films", default=None, help="the films module the recording came from")
    a = ap.parse_args()
    if not (ROOT / "out" / "tokens.json").exists():
        subprocess.run(["bun", "scripts/export_tokens.ts"], cwd=ROOT, check=True, capture_output=True)
    rec = load(a.recording)
    frames = [min(rec.n - 1, round(float(s) * rec.fps)) for s in a.frames.split(",")]
    ensure_png(a.recording, frames, a.films)
    rec = load(a.recording)
    tools = a.tools.split(",")
    result = {"recording": rec.id, "language": rec.language["name"], "frames": frames, "per_frame": {f: {} for f in frames}}
    if "grid" in tools:
        for r in grid.run(rec, frames):
            result["per_frame"][r["frame"]]["grid"] = r
    if "heat" in tools:
        h = heat.run(rec, frames)
        for r in h["frames"]:
            result["per_frame"][r["frame"]]["heat"] = r
        result["density"] = h["density"]
        result["holds"] = holds(rec)
    if "balance" in tools:
        for r in balance.run(rec, frames):
            result["per_frame"][r["frame"]]["balance"] = r
    if "colour" in tools:
        for r in colour.run(rec, frames):
            result["per_frame"][r["frame"]]["colour"] = r
    if "curves" in tools:
        result["motion"] = curves.run(rec)
    # Type behind a cut-out subject (see cover.py): only for a film that has one.
    if any(e.get("kind") == "image" and e.get("cutout") for fr in json.loads((rec.dir / "elements.json").read_text())["frames"] for e in fr):
        result["cover"] = cover.check(str(rec.dir))
    if "zoom" in tools:
        for f in frames:
            spots = []
            pf = result["per_frame"][f]
            for nm in pf.get("grid", {}).get("near_miss_grid", [])[:2]:
                spots.append((nm["box"], f'{nm["element"]} {nm["offset_px"]:+} px off a column line'))
            for o in pf.get("colour", {}).get("off_palette", [])[:1]:
                spots.append((o["box"], f'off-palette {o["hex"]}'))
            for c in (pf.get("heat", {}).get("competing_focal_points") or [])[:1]:
                pass  # competitors are named, not boxed; the heat image shows them
            pf["zoom"] = [str(zoom.zoom(rec, f, b, note, i).relative_to(rec.dir)) for i, (b, note) in enumerate(spots[:4])]
    (out_dir(rec) / "inspect.json").write_text(json.dumps(result, indent=1, default=str))
    (out_dir(rec) / "inspect.md").write_text(to_markdown(result))
    print(out_dir(rec) / "inspect.md")


def to_markdown(r):
    L = [f"# Inspect: {r['recording']}", "", f"Design language: {r['language']}. Every number below is measured from the render. Images are in this folder.", ""]
    if "cover" in r:
        c = r["cover"]
        L.append(f"**Type behind a subject**: letters at most {c['letterMax']:.0%} hidden, words at most {c['wordMax']:.0%}; worst letter {c['worstLetter']:.0%} hidden.")
        for e in c["errors"]:
            L.append(f"- {e['from']} to {e['to']} s, {e['id']} \"{e['text']}\": {e['rule']}, {e['detail']}.")
        L.append("")
    for f, pf in r["per_frame"].items():
        f = int(f)
        L.append(f"## Frame {f}")
        if "grid" in pf:
            g = pf["grid"]
            L.append(f"**Grid** ({g['image']}): {g['elements_checked']} elements at rest; {g['on_grid']} edges on a column line; "
                     f"{g['aligned_pairs']} aligned edge pairs; left edges at {g['left_edges_px']} px.")
            for nm in g["near_miss_grid"]:
                L.append(f"- {nm['element']}: {nm['edge']} edge at {nm['x']} px, {nm['offset_px']:+} px from the column line at {nm['line']} px.")
            for p in g["near_miss_pairs"]:
                L.append(f"- {p['a']} and {p['b']}: {p['edge']} edges at {p['a_px']} and {p['b_px']} px ({p['delta_px']:+} px apart).")
            gaps = ", ".join(f"{x['gap_px']}" for x in g["stack_gaps"])
            if gaps:
                L.append(f"- Gaps between stacked elements, top to bottom: {gaps} px.")
            L.append(f"- Text sizes: {g['distinct_type_sizes_px']} px.")
            for s in g["type_sizes"]:
                if "off_pct" in s and abs(s["off_pct"]) > 4:
                    L.append(f"- \"{s['text']}\" is {s['font_px']} px; the nearest scale step is {s['nearest_role']} at {s['role_px']} px ({s['off_pct']:+}%).")
            for o in g["out_of_frame"]:
                L.append(f"- {o['element']} reaches outside the frame by {o['px_outside']} px.")
            for c in g["covered_text"]:
                L.append(f"- {c['text']} is {c['overlap_pct']}% covered by {c['covered_by']} (box {c['box']}).")
            for i in g["safe_zone_intrusions"]:
                L.append(f"- {i['element']} is {i['px_inside']} px inside the {i['zone']} safe zone.")
        if "heat" in pf:
            h = pf["heat"]
            comp = "; ".join(f"{c['element']} at {c['relative_score']:.0%} of it" for c in h["competing_focal_points"]) or "none"
            L.append(f"**Attention, motion, emptiness** ({h['image']}): first read {h['first_read']} ({(h['first_read_share'] or 0):.0%} of the attention). "
                     f"Competing focal points: {comp}. Motion hotspot at {h['motion_hotspot_px']} px. "
                     f"Empty: {h['dead_pct_in_safe_area']}% of the safe area (top, middle, bottom thirds: {h['dead_pct_by_third_of_safe_area']}%); "
                     f"largest empty band {h['largest_empty_band_px']} px.")
        if "balance" in pf:
            b = pf["balance"]
            L.append(f"**Balance** ({b['image']}): centre of mass at {b['centre_of_mass_px']} px ({b['offset_from_centre_px']} from the centre, "
                     f"{b['centre_of_mass_height_pct']}% down the frame). Weight by third, top to bottom: {b['weight_pct_top_middle_bottom']}%; "
                     f"left/right {b['left_right_pct']}%. Whitespace {b['whitespace_pct_in_safe_area']}% of the safe area. "
                     f"Content margins {b['content_margins_px']} px. Largest text to the next size: {b['largest_to_next_text_ratio']}x.")
        if "colour" in pf:
            c = pf["colour"]
            sw = ", ".join(f"{x['hex']} {x['share_pct']}% ({x.get('nearest_role', '') if not x.get('blend_of') else '/'.join(x['blend_of'][:2])})" for x in c["dominant_colours"][:6])
            L.append(f"**Colour** ({c['image']}): {sw}.")
            if "accent_share_pct" in c:
                L.append(f"- Accent: {c['accent_share_pct']}% of the pixels, on {c['accent_elements'] or 'nothing'}.")
            for o in c["off_palette"]:
                L.append(f"- Off-palette {o['hex']} ({o['share_pct']}%) at box {o['box']}, nearest role {o['nearest_role']} at distance {o['distance']}.")
            for t in c.get("ai_colour_tells", []):
                L.append(f"- {t}.")
            low = [g for g in c["greyscale_text_contrast"] if g["greyscale_contrast"] < 4.5]
            if low:
                L.append("- Text contrast in luminance: " + "; ".join(f"\"{g['text']}\" {g['greyscale_contrast']}:1" for g in low) + ".")
        if pf.get("zoom"):
            L.append("**Close-ups**: " + ", ".join(pf["zoom"]) + ".")
        L.append("")
    if "density" in r:
        d = r["density"]
        budget = f"; {d['seconds_over_budget']} s over the system's budget of {d['budget']} words" if d.get("budget") else ""
        L.append(f"## Whole film\n**Words on screen** ({d['image']}, {d['counts']}): at most {d['max_words']}, on average {d['mean_words']}; "
                 f"{d['seconds_over_6_words']} s with more than 6 words{budget}; {d['seconds_with_no_words']} s with none.")
    if "holds" in r:
        h = r["holds"]
        L.append(f"**Changes**: the longest stretch with no visible change, not counting the closing hold, is {h['longest_s']} s"
                 f"{' (from ' + str(h['from_s']) + ' s)' if h['longest_s'] else ''}. {h['over_1_5_s']} stretches last more than 1.5 s. "
                 f"The closing hold is {h['closing_s']} s.")
    if "motion" in r:
        m = r["motion"]
        L.append(f"**Motion** ({m['curves_image']}, {m['timeline_image']}): {len(m['moves'])} moves; {m['linear_moves']} at constant speed. "
                 f"Camera moves: {m['camera_moves'] or 'none'}.")
        for t in m["starts_without_stagger"]:
            L.append(f"- At {t['at_s']} s, {len(t['elements'])} elements start moving on the same frame: {t['elements'][:5]}.")
        for c in m["collisions"]:
            L.append(f"- At {c['at_s']} s, {c['moving']} overlaps {c['hits']} while moving.")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    main()
