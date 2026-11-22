"""Shared reader for the align/* checks: the alignment model's issues for a film (out/detector/<id>/align.json).

The geometry pass is one model in one place: src/system/scene/align.ts. scripts/snap/detect_align.ts runs it on the
film's rest frames (every 0.5 s and the last) and writes align.json; detect.ts runs it after the capture. When the
file is missing or older than the capture, this module runs it. Each issue carries the id of the snap proposal
that fixes it ("fix") and the command that previews it ("preview").
"""
import json
import subprocess
from pathlib import Path

from film import ROOT, Skip, finding

LEVEL = {"error": "error", "warning": "warning"}


def issues(film):
    """The model's issues for the film (cached on the film)."""
    if getattr(film, "_align", None) is not None:
        return film._align
    d = ROOT / "out" / "detector" / film.id
    p, cap = d / "align.json", d / "capture.json"
    if not p.exists() or p.stat().st_mtime < cap.stat().st_mtime:
        r = subprocess.run(["bun", str(ROOT / "scripts/snap/detect_align.ts"), film.id], cwd=ROOT, capture_output=True, text=True, timeout=600)
        if r.returncode != 0:
            raise Skip("the alignment pass failed: " + (r.stderr.strip().splitlines() or ["?"])[-1])
    data = json.loads(p.read_text())
    film._align = data["issues"]
    film._align_camera = data.get("camera")
    # The scene's align declarations (// untell-ignore align/<rule> <id> @<from>-<to>: <reason>), as the report shows
    # every other rule's: what each suppresses, or why it matches nothing and the selector that would.
    notes = getattr(film, "notes", None)
    if isinstance(notes, list):
        for line in data.get("declarations", []):
            notes.append({"check": "untell-ignore", "info": line} if "suppresses" in line else {"check": "untell-ignore", "unused": line.split(": matches nothing")[0], "why": line.split(": matches nothing; ", 1)[-1]})
    return film._align


def findings(film, check, kinds, fix_text, limit):
    """Findings for issues of the given kinds: errors and warnings that the scene did not declare as designed.

    The level is the model's: it comes from the judged precision of the issue's class (align.ts LEVELS), so an error
    is a class a designer agreed with 95 % of the time on the survey (systems/playbooks/ALIGN.md).
    """
    out = []
    shared = getattr(film, "_align_camera", None) if issues(film) is not None else None
    for i in issues(film):
        if i["kind"] not in kinds or i.get("ignored") or i["level"] not in LEVEL:
            continue
        # Every alignment finding moves with the camera (scaled, turned or tilted on each frame it shows): one cause.
        camera = (" The camera is the shared cause: every alignment finding shows only while the camera is scaled, turned"
                  " or tilted, so a move in the scene (or a snap) does not fix it. Keep the camera at scale 1 with no turn"
                  " or tilt while the content holds, or let it move only between holds.") if shared and i.get("camera") else ""
        f = finding(check, LEVEL[i["level"]], i["t0"], i["t1"],
                    {"feature": i["feature"], "axis": i["axis"], "at": i["v"], "target": f"{i['target']['el']}.{i['target']['feature']}", "line": i["to"],
                     "offPx": i["off"], "onLine": i["on"][:4], "confidence": i["confidence"], "relation": i.get("cls", "")},
                    {**limit, "tolPx": i["tol"]},
                    fix_text(i) + (camera or (f" Snap {i['fix']} fixes it: {i['preview']}" if i.get("fix") and i.get("preview") else f" Snap {i['fix']} fixes it." if i.get("fix") else "")),
                    node=i["el"] if i["kind"] in ("centre", "half-px", "rhythm") else f"{i['el']} x {i['target']['el']}")
        if camera:
            f["measured"]["sharedCause"] = "camera"
        if i.get("fix") and not camera:
            f["snap"] = i["fix"]
            if i.get("preview"):
                f["preview"] = i["preview"]
        out.append(f)
    return out
