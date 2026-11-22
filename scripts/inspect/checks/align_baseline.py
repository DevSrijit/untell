"""align/baseline: texts side by side in one row whose baselines differ by more than 0.5 px.

Texts of two sizes whose bands share a centre are centre-aligned cells, not a miss. See align.ts (edgeIssues).
"""
from align_common import findings


def check(film):
    return findings(film, "align/baseline", {"baseline"},
                    lambda i: f"Put {i['el']} on the baseline of {i['target']['el']} ({i['off']:+.1f} px).",
                    {"alignedUnderPx": 0.5})
