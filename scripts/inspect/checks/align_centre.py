"""align/centre: a child's ink is off its container's centre by more than 1 px and less than the tolerance.

The child is meant to be centred: its two insets on the axis are close (their difference under half their sum).
Text counts by its band: from the baseline to the cap line when a letter stands taller than the x height, else to
the x line (so "cone 10" centres its figures, not its line box). See src/system/scene/align.ts (centreIssues).
"""
from align_common import findings


def check(film):
    return findings(film, "align/centre", {"centre"},
                    lambda i: f"Centre the ink of {i['el']} (its cap band) in {i['target']['el']} ({i['off']:+.1f} px off on {i['axis']}).",
                    {"alignedUnderPx": 1})
