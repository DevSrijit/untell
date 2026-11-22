"""panel-near-miss: panel or box edges, or text left edges, that miss alignment by 1 to 8 px.

A thin use of the alignment model (src/system/scene/align.ts, read through align_common): its edge near misses
between two boxes or pictures (left, right, top or bottom edges) or between two texts (left edges), 1 to 8 px
apart, at rest on the frames it samples (every 0.5 s and the last). align/near-miss reports every other pair.
The model leaves out what a designer would not call a miss: a container and its child (an inset), a label centred
in its own pill or avatar (its edges follow its centre), parts of two copies of one block that differ by their
content, and pairs the scene declares (// untell-ignore align/near-miss <node>: <reason>).
Each finding carries the snap proposal that fixes it, and the model's level for its class (align.ts LEVELS).
"""
import align_common
from film import finding

MIN, MAX = 1.0, 8.0
BOX_EDGES = {"left", "right", "top", "bottom"}


def check(film):
    out = []
    seen = set()
    for i in align_common.issues(film):
        if i["kind"] != "edge" or i.get("ignored") or i["level"] not in ("error", "warning"):
            continue
        kinds = i.get("kinds") or []
        d = abs(i["off"])
        if not (MIN <= d <= MAX) or i["feature"] != i["target"]["feature"]:
            continue
        boxes = all(k in ("rect", "image") for k in kinds) and i["feature"] in BOX_EDGES
        texts = all(k == "text" for k in kinds) and i["feature"] == "left"
        if not (boxes or texts):
            continue
        la, lb = i["el"], i["target"]["el"]
        key = (frozenset((la, lb)), i["feature"])
        if key in seen:
            continue
        seen.add(key)
        side = "text left" if texts else i["feature"]
        # The model's level (from its class's judged precision), not always error.
        f = finding("panel-near-miss", i["level"], i["t0"], i["t1"], {"pair": [la, lb], "edge": side, "offPx": round(d, 1)},
                    {"alignedUnderPx": MIN, "orApartOverPx": MAX},
                    f"Align the {side} edges of {la} and {lb} exactly (one shared value), or set them clearly apart."
                    + (f" Snap {i['fix']} fixes it" + (f": {i['preview']}" if i.get("preview") else ".") if i.get("fix") else ""),
                    node=f"{la} x {lb}")
        if i.get("fix"):
            f["snap"] = i["fix"]
        out.append(f)
    return out
