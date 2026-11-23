"""The beat grid's trust: one source for the music map (music_map.py: gridTrust, gridIssues) and the listening report
(prose.py: listen.md). Before, listen.md printed the analysis's own tempo confidence (medium) and the music map its
grid trust (low) for one track."""

RELATIONS = [(2.0, "octave (double)"), (0.5, "octave (half)"), (4 / 3, "3:4"), (3 / 4, "4:3"), (1.5, "2:3"), (2 / 3, "3:2")]


def grid_trust(d):
    """How far the track's beat grid can be trusted, and why: (level, issues).
    low     the cross-check (hyperframes audio, when it ran) counts another pulse of the music: an octave, 3:4 or 2:3
            tempo relation, or another tempo; or the analysis's own confidence is low.
    medium  no cross-check ran; or the cross-check's beats sit on this grid's off-beat (phase) or agree weakly (under
            60 % within 50 ms); or the grid is tracked with a large residual (the tempo drifts); or the bar start is
            unsure (downbeat margin under 0.1); or the meter came out as 3.
    high    otherwise."""
    rh = d["rhythm"]
    v = d.get("validation") or {}
    low, med = [], []
    if rh.get("confidence") == "low":
        low.append("the analysis's tempo confidence is low")
    hb = v.get("hyperframesBpm")
    if hb:
        k = hb / rh["bpm"]
        if abs(k - 1) > 0.03:
            rel = next((name for x, name in RELATIONS if abs(k / x - 1) <= 0.04), "another tempo")
            low.append(f"the cross-check counts {hb:g} BPM against {rh['bpm']:g} BPM: {rel}")
        else:
            w50, off = v.get("beatsWithin50ms"), v.get("beatsOnOffbeat")
            if w50 is not None and off is not None and w50 < 0.5 and off >= 0.4:
                med.append(f"the cross-check's beats sit on this grid's off-beat ({off:.0%} of them)")
            elif w50 is not None and w50 < 0.6:
                med.append(f"the cross-check's beats agree weakly ({w50:.0%} within 50 ms)")
    else:
        med.append("not cross-checked (hyperframes audio did not run)")
    if rh.get("grid") == "tracked" and (rh.get("gridResidualMs") or 0) > 50:
        med.append(f"the tempo drifts (tracked grid, residual {rh['gridResidualMs']:g} ms)")
    # Under 0.3 the bar's first beat is a guess (listen.md says the same): `music({ peakAt })` warns and offers the
    # strongest onset near the drop.
    if (rh.get("downbeatMargin") if rh.get("downbeatMargin") is not None else 1) < 0.3:
        med.append(f"the bar start is a guess (downbeat margin {rh['downbeatMargin']:g})")
    if rh.get("meter") == 3:
        med.append("the meter came out as 3")
    return ("low" if low else "medium" if med else "high"), low + med
