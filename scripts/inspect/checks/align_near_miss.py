"""align/near-miss: two related edges, lines or centres that are 0.5 px to the tolerance apart.

It generalises panel-near-miss (box edges and text left edges, 1-8 px) to every feature (edges, hairlines, centres,
ink centres) with a tolerance of about 2 % of the frame's short side, smaller for small elements, ranked by how
related the two are (one container, one block, neighbours). A pair that panel-near-miss already reports is left to it.
"""
import panel_near_miss
from align_common import findings


def check(film):
    if getattr(film, "_panel", None) is None:
        film._panel = panel_near_miss.check(film)
    taken = {frozenset(f["measured"]["pair"]) for f in film._panel}
    out = findings(film, "align/near-miss", {"edge"},
                   lambda i: f"Put the {i['feature']} of {i['el']} on the {i['target']['feature']} of {i['target']['el']} ({i['off']:+.1f} px), or set them clearly apart.",
                   {"alignedUnderPx": 0.5})
    return [f for f in out if frozenset(f["node"].split(" x ")) not in taken]
