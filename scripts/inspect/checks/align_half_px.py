"""align/half-px: a rest position on a fraction of a px that blurs: a hairline that covers two rows of px at part
strength, or a box edge between px. Text is advice only (Chrome sets glyphs on whole px rows). See align.ts (halfPxIssues).
"""
from align_common import findings


def check(film):
    return findings(film, "align/half-px", {"half-px"},
                    lambda i: f"Put {i['el']} on {i['to']} ({i['off']:+.1f} px): an odd-width line centres on .5, an even one on a whole px.",
                    {"crispWithinPx": 0.25})
