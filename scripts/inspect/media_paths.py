"""Where a media file is: assets/media/<rel>, or another media folder that a test bench adds to DIRS. Also the sound
facts of those folders (registry.gen.ts in each), as media.gen.ts gives assets/media's.
"""
import json
import os
import re
from pathlib import Path

# The repository root, or the work tree that untell builds in a project (UNTELL_ROOT).
ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[2])
DIRS = [ROOT / "assets" / "media"]


def media_file(rel):
    """The first folder that holds rel, else assets/media/rel (so a message names the usual place)."""
    rel = str(rel)
    for d in DIRS:
        p = d / rel
        if p.exists():
            return p
    return DIRS[0] / rel


def extra_sounds():
    """{name: {kind, file, duration, peak}} of the other media folders (empty without a registry)."""
    out = {}
    for d in DIRS[1:]:
        try:
            m = re.search(r"REGISTRY = (\{.*\}) as const", (d / "registry.gen.ts").read_text(), re.S)
            out.update(json.loads(m.group(1)).get("SOUNDS", {}) if m else {})
        except (OSError, ValueError):
            pass
    return out
