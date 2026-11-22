"""Runs scripts/inspect/detect.py unchanged on a recording and a capture in other folders (for the bench).

Usage: python3 scripts/perf/run_detect_py.py <film id> --rec <recordings dir> --det <detector dir> [--fast] [--film-py <dir>]
With --fast, the frames are read by scripts/perf/fastfilm.py (the same values, one decode per distinct frame).
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
INSPECT = HERE.parent / "inspect"
sys.path.insert(0, str(INSPECT))
sys.path.insert(0, str(INSPECT / "checks"))
# --film-py <dir>: load film.py from this folder first (the frozen copy for the "before" side of a proof).
if "--film-py" in sys.argv:
    sys.path.insert(0, sys.argv[sys.argv.index("--film-py") + 1])
import common  # noqa: E402
import film as film_mod  # noqa: E402


def arg(k):
    return sys.argv[sys.argv.index(k) + 1] if k in sys.argv else None


if arg("--rec"):
    common.REC = Path(arg("--rec"))
if arg("--det"):
    film_mod.DET = Path(arg("--det"))
if "--fast" in sys.argv:
    sys.path.insert(0, str(HERE))
    import fastfilm  # noqa: E402
    fastfilm.install()

import detect  # noqa: E402

sys.argv = [sys.argv[0], sys.argv[1]]
detect.main()
