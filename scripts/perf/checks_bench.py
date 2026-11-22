"""Times each detector check alone, in the order scripts/inspect/detect.py runs them.

Usage: python3 scripts/perf/checks_bench.py <film id> [--rec <recordings dir>] [--det <detector dir>] [--fast]
Prints JSON: {"load": {wall, cpu}, "pixels": {wall, cpu}, "checks": {name: {wall, cpu, findings}}, "findings": [...]}

It does not change the checks. It loads the film as detect.py does, then reads the frames once (Film.grey and
Film.rgb, which the pixel checks share), so each check's time is its own work and not the frame decode.
With --rec and --det it reads a recording and a capture from other folders (the bench's own copies).
With --fast it reads the frames with scripts/perf/fastfilm.py (one decode per distinct frame, on threads).
"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
INSPECT = HERE.parent / "inspect"
sys.path.insert(0, str(INSPECT))
sys.path.insert(0, str(INSPECT / "checks"))

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
import importlib  # noqa: E402


def timed(fn):
    w, c = time.perf_counter(), time.process_time()
    out = fn()
    return out, {"wall": time.perf_counter() - w, "cpu": time.process_time() - c}


fid = sys.argv[1]
film, t_load = timed(lambda: film_mod.Film(fid))
_, t_pix = timed(lambda: (film.grey, film.rgb, film.change))
res = {"load": t_load, "pixels": t_pix, "checks": {}, "findings": []}
for name in detect.CHECKS + ["cover"]:
    def run():
        try:
            if name == "cover":
                return detect.cover_check(film)
            return importlib.import_module(name).check(film)
        except film_mod.Skip as s:
            return {"skipped": str(s)}
        except Exception as e:  # noqa: BLE001
            return {"crashed": repr(e)}
    found, t = timed(run)
    t["findings"] = len(found) if isinstance(found, list) else found
    res["checks"][name] = t
    if isinstance(found, list):
        res["findings"] += found
print(json.dumps(res))
