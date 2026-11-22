"""align/rhythm: a run of three or more like siblings whose gaps differ by 1 px to a few px. See align.ts (rhythmIssues)."""
from align_common import findings


def check(film):
    return findings(film, "align/rhythm", {"rhythm"},
                    lambda i: f"Give the gap before {i['el']} the run's gap ({i['off']:+.1f} px off).",
                    {"equalWithinPx": 1})
