"""The cover rule: one verdict for a text behind a cut-out, for the recorded check (scripts/inspect/cover.py) and for
the kit's planner (placeBehind in src/system/scene/cover.ts), so both judge the same frame the same way.

judge(letters) takes the letters of one text on one frame as (char, hidden, area[, contrast]):
  hidden    the share of the letter's ink box that the cut-out hides, by its alpha (0 to 1)
  area      the letter's ink box area (px), the weight of the letter in the word
  contrast  optional: the WCAG ratio of the letter's ink against the cut-out where it overlaps it. A letter the
            cut-out hides but that still reads on it (3:1 or more) counts as half hidden.
A text fails on a frame when one letter is over LETTER_MAX hidden, or the word (area-weighted) over WORD_MAX.
The planner must sample every frame of the text's time (not every 0.25 s): a push's last frame is a frame too.
This module has no inputs beyond the numbers, so a TypeScript port can be checked against it on the same cases.
"""
LETTER_MAX = 0.30
WORD_MAX = 0.15
READS_ON_CUTOUT = 3.0


def judge(letters):
    """{"letter": worst letter share, "word": word share, "fails": [rule ...], "detail": text}."""
    if not letters:
        return {"letter": 0.0, "word": 0.0, "fails": [], "detail": ""}
    eff = []
    for x in letters:
        ch, hidden, area = x[0], x[1], x[2]
        contrast = x[3] if len(x) > 3 else None
        eff.append((ch, hidden * (0.5 if contrast is not None and contrast >= READS_ON_CUTOUT else 1.0), area))
    total = sum(a for _, _, a in eff) or 1.0
    word = sum(h * a for _, h, a in eff) / total
    ch, top, _ = max(eff, key=lambda x: x[1])
    fails = [r for r, v, lim in (("letter", top, LETTER_MAX), ("word", word, WORD_MAX)) if v > lim]
    return {"letter": round(top, 3), "word": round(word, 3), "fails": fails,
            "detail": f'"{ch}" {top:.0%} hidden; {word:.0%} of the word hidden'}
