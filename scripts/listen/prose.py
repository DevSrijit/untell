"""listen.md: the analysis as a mix engineer's notes, on a timeline, with a verdict at the end.

A model reads this file to know what a track sounds like before it chooses it. Each line says what the
measure is and how far to trust it.
"""
from trust import grid_trust  # the music map's grid trust (trust.py): one source for both



def _stems_at(d, bar_index):
    st = d.get("stems")
    if not st:
        return []
    return [n for n in ("drums", "bass", "other", "vocals") if bar_index < len(st["presence"][n]) and st["presence"][n][bar_index]]


def _drum_desc(d, a, b):
    st = d.get("stems")
    if not st:
        return ""
    per = st["drumHits"]["perBar"][a:b]
    if not per:
        return ""
    k = sum(p["kick"] for p in per) / len(per)
    s = sum(p["snare"] for p in per) / len(per)
    h = sum(p["hat"] for p in per) / len(per)
    if k + s + h < 0.5:
        return "no drum hits"
    return f"drums per bar: {k:.1f} kick, {s:.1f} snare, {h:.1f} hat"


def top_tags(d, cat, n=3, zmin=0.8):
    ch = d.get("character")
    if not ch:
        return []
    return [t["tag"] for t in ch["tags"][cat] if t["z"] >= zmin][:n] or [ch["tags"][cat][0]["tag"]]


def verdict(d):
    good, bad = [], []
    rep, dyn, rh = d["repetition"], d["dynamics"], d["rhythm"]
    ls, rs, t2 = rep.get("loopShare"), rep.get("repeatShare"), rep.get("topTwoShare")
    if rs is not None and rs >= 0.6:
        bad.append(f"Loop-based: {round(rs * 100)} % of its 4-bar blocks repeat the harmony of an earlier block, and "
                   f"{rep['distinctAfterTransposition']} loops make the whole track (the top two cover {round(t2 * 100)} %, the main one {round(ls * 100)} %). "
                   + (f"What changes is the arrangement ({rep['arrangementChanges']} changes: parts in and out), not the music. " if rep.get("arrangementChanges")
                      else "Parts drop in and out over the same loops; the music itself does not move on. ")
                   + "It reads as a looping beat, not as a song that goes somewhere.")
    elif ls is not None and ls >= 0.5:
        bad.append(f"One 4-bar loop fills {round(ls * 100)} % of the track.")
    if rep.get("transposedRepeats"):
        n = len(rep["transposedRepeats"])
        shifts = sorted({t["semitones"] for t in rep["transposedRepeats"]})
        bad.append(f"{n} later block(s) repeat earlier material shifted by {', '.join(f'{s:+d}' for s in shifts)} semitones: "
                   "the change is a pitch shift of the same loop, not new melody.")
    if rep.get("distinctAfterTransposition") is not None and rep["distinctAfterTransposition"] <= 2 and rep.get("blocks", 0) >= 6:
        bad.append(f"Only {rep['distinctAfterTransposition']} kinds of material in {rep['blocks']} blocks.")
    if rep.get("distinctAfterTransposition", 0) >= 4 and (rs or 0) < 0.6:
        good.append(f"{rep['distinctAfterTransposition']} kinds of 4-bar material: the arrangement moves.")
    if d["drops"]:
        # A drop pinned by hand wins; one added by --drop has no measured rise (riseDb None).
        best = next((x for x in d["drops"] if x.get("pinned")), None) or max(d["drops"], key=lambda x: x["riseDb"] or 0)
        rise = f"+{best['riseDb']} dB, " if best.get("riseDb") is not None else ""
        good.append(f"A drop at {best.get('at', best['t'])} s ({rise}{'set by hand' if best.get('pinned') else 'measured'}): a clear moment to land a reveal on."
                    + (f" Its bar line is at {best['t']} s; the rise in the sound is the time to use." if abs(best.get('at', best['t']) - best['t']) > 1 / 30 else ""))
    else:
        bad.append("No drop: the level never jumps 6 dB on a downbeat. Do not choose it for a film that needs one big moment.")
    if d["builds"]:
        good.append(f"{len(d['builds'])} build(s) into section changes, e.g. {d['builds'][0]['start']}-{d['builds'][0]['end']} s ({', '.join(d['builds'][0]['kinds'])}).")
    if dyn["loudnessRange"] is not None and dyn["loudnessRange"] < 4:
        bad.append(f"Flat dynamics (loudness range {dyn['loudnessRange']} LU): it will not rise with the picture.")
    if dyn["truePeakDb"] is not None and dyn["truePeakDb"] > -1:
        bad.append(f"True peak {dyn['truePeakDb']} dBTP and {dyn['clippedSamples']} clipped samples: keep its gain at or under "
                   f"{-1 - dyn['truePeakDb']:.1f} dB to stay under -1 dBTP.")
    if d["spectrum"]["phone"]["lossDb"] is not None and d["spectrum"]["phone"]["lossDb"] > 4:
        bad.append(f"It loses {d['spectrum']['phone']['lossDb']} dB on a phone speaker: its weight is under 200 Hz.")
    st = d.get("stems")
    if st and st["vocals"]["present"]:
        bad.append(f"Vocals (or a vocal-like lead) in {round(st['vocals']['barShare'] * 100)} % of bars: words in the music compete with words on screen.")
    if rh["confidence"] == "low":
        bad.append("The beat is unclear (low pulse clarity): do not cut to its grid without listening checks.")
    elif rh["confidence"] == "high":
        good.append(f"A clear, steady pulse at {rh['bpm']} BPM: cuts can sit on its grid.")
    first2 = d["sections"][0]
    if first2["role"] == "intro" and first2["end"] > 8:
        bad.append(f"A quiet intro of {first2['end']:.0f} s ({first2['lufs']} LUFS): enter later for a hook in the first 2 s.")
    h = d["harmony"]
    if h["chordChanges"] <= max(2, len(d["bars"]) // 16):
        bad.append(f"The harmony barely moves ({h['chordChanges']} chord changes in {len(d['bars'])} bars).")
    return good, bad


def write(d):
    L = []
    rh, dyn, sp, h = d["rhythm"], d["dynamics"], d["spectrum"], d["harmony"]
    key = h["key"] or {}
    L.append(f"# {d['name']}: what it sounds like\n")
    L.append(f"Measured by `untell listen` (scripts/listen). File `{d['file']}`, {d['duration']:.1f} s. "
             "Every number below is measured, not heard: the trust notes say how far each one holds.\n")
    L.append("## In one paragraph\n")
    moods, genres, uses = top_tags(d, "mood"), top_tags(d, "genre", 2), top_tags(d, "use")
    L.append(f"{(', '.join(moods).capitalize() + ' ' + ' / '.join(genres)) if moods else 'Music (character not measured)'} at {rh['bpm']:.0f} BPM"
             f"{' (half-time feel)' if rh.get('halfTimeFeel') else ''}, in {key.get('key') or '?'} {key.get('mode') or ''}. "
             f"{len(d['sections'])} sections, {len(d['drops'])} drop(s), {d['repetition'].get('distinctAfterTransposition')} harmonic loops, repeat share {d['repetition'].get('repeatShare')}. "
             f"It measures {dyn['lufsIntegrated']} LUFS with a {dyn['loudnessRange']} LU range." + (f" Suits: {', '.join(uses)}." if uses else "") + "\n")
    L.append("## Timeline\n")
    for s in d["sections"]:
        a, b = s["bars"][0] - 1, s["bars"][1]
        stems = _stems_at(d, a)
        line = f"- **{s['start']:.1f}-{s['end']:.1f} s (bars {s['bars'][0]}-{s['bars'][1]}): {s['role']}, material {s['material']}.** "
        line += f"{s['lufs']} LUFS"
        if s["levelRiseDb"]:
            line += f", level {'rises' if s['levelRiseDb'] > 0 else 'falls'} {abs(s['levelRiseDb'])} dB across it"
        # Say what was measured: with no stems, nothing is known about what plays (never "quiet").
        line += (f". Playing: {', '.join(stems) if stems else 'little (every stem under its presence level)'}" if d.get("stems")
                 else ". Playing: not measured (the stems part is not installed)")
        dd = _drum_desc(d, a, b)
        if dd:
            line += f"; {dd}"
        line += "."
        ch = d.get("character")
        if ch:
            win = [p for p in ch["perSection"] if s["start"] <= (p["start"] + p["end"]) / 2 < s["end"]]
            if win:
                line += f" Sounds {', '.join(win[0]['moods'])}."
        L.append(line)
        events = []
        st = d.get("stems")
        if st:
            for e in st["events"]:
                if s["start"] - 0.05 <= e["t"] < s["end"] - 0.05 and e["event"] != "present from the start":
                    events.append(f"{e['t']:.1f} s: {e['stem']} {e['event']}")
        for bl in d["builds"]:
            if s["start"] <= bl["end"] <= s["end"] + 0.1:
                events.append(f"{bl['start']:.1f}-{bl['end']:.1f} s: build, {', '.join(bl['kinds'])} (strength {bl['strength']})")
        for dr in d["drops"]:
            if s["start"] - 0.1 <= dr["t"] < s["end"]:
                events.append(f"{dr.get('at', dr['t']):.2f} s: **the drop** ({'+' + str(dr['riseDb']) + ' dB' if dr.get('riseDb') is not None else 'no measured rise'}{', set by hand' if dr.get('pinned') else ''})")
        for nm in d["repetition"].get("newMaterial", []):
            if s["start"] - 0.05 <= nm["t"] < s["end"] - 0.05:
                events.append(f"{nm['t']:.1f} s: new material (block {nm['material']})")
        for tr in d["repetition"].get("transposedRepeats", []):
            t = d["bars"][min(len(d["bars"]) - 1, 4 * [i for i, x in enumerate(d["repetition"]["blockLabels"]) if x == tr["block"]][0])]["start"]
            if s["start"] - 0.05 <= t < s["end"] - 0.05:
                events.append(f"{t:.1f} s: the block {tr['like']} loop again, moved {tr['semitones']:+d} semitones")
        for e in events:
            L.append(f"  - {e}")
    L.append("")
    L.append("## Rhythm\n")
    # The grid's trust is the music map's (trust.py): beats() and music({ peakAt }) act on that level, so the report
    # says the same one. The analysis's own tempo confidence is one of its inputs.
    trust, why = grid_trust(d)
    L.append(f"- Tempo {rh['bpm']} BPM, {rh['grid']} grid, grid trust **{trust}**" + (f" ({'; '.join(why)})" if why else "")
             + f"; the tempo analysis's own confidence {rh['confidence']} (pulse clarity {rh['pulseClarity']}, "
             f"grid residual {rh['gridResidualMs']} ms, tempo spread {rh['stabilityBpmStd']} BPM)."
             + (" Half-time feel: the heaviest hits come every other beat." if rh.get("halfTimeFeel") else ""))
    if rh["octaveAlternatives"]:
        L.append("- Octave ambiguity: " + "; ".join(f"{o['bpm']} BPM carries {o['relative']} of the onset energy" for o in rh["octaveAlternatives"]) + ".")
    L.append(f"- Meter {rh['meter']}/4 (autocorrelation at 3: {rh['meterScores']['3']}, at 4: {rh['meterScores']['4']}); "
             f"downbeat margin {rh['downbeatMargin']} (under 0.3: the bar's first beat is a guess).")
    if rh["swing"]:
        L.append(f"- Swing: off-beat onsets at {rh['swing']['offbeatAt']} of the beat, {rh['swing']['feel']}.")
    st = d.get("stems")
    if st and st["drumHits"].get("fourOnTheFloor") is not None:
        L.append(f"- Kick on the beat in {round(st['drumHits']['kickOnBeatShare'] * 100)} % of kicks; four on the floor: {st['drumHits']['fourOnTheFloor']}.")
    v = d["validation"]
    if "beatsWithin50ms" in v:
        L.append(f"- Check against hyperframes beats ({v['hyperframesBpm']} BPM, from {v['hyperframesBeatsFrom']} s): "
                 f"{round(v['beatsWithin50ms'] * 100)} % of its beats within 50 ms of this grid, median offset {v['beatOffsetMedianMs']} ms.")
    L.append("\n## Structure and repetition\n")
    rep = d["repetition"]
    L.append(f"- {rep.get('blocks')} blocks of 4 bars; {rep.get('distinctBlocks')} distinct harmonic loops, {rep.get('distinctAfterTransposition')} after transposed repeats are merged. "
             f"Repeat share {rep.get('repeatShare')} (blocks that repeat an earlier block's harmony). "
             f"Main loop: {rep.get('mainLoop', {}).get('blocks')} blocks from bar {rep.get('mainLoop', {}).get('firstBar')} (loop share {rep.get('loopShare')}, top two {rep.get('topTwoShare')}). "
             f"Arrangement changes inside a loop: {rep.get('arrangementChanges')}. Bars that repeat the bar 4 or 8 back: {rep.get('lagRepeatShare')}.")
    L.append(f"- Trust: medium. The similarity is measured on chroma and timbre; a change in a lead line over the same loop can count as the same loop.")
    L.append("\n## Harmony\n")
    L.append(f"- Key {key.get('key')} {key.get('mode')} (profile fit {key.get('strength')}, tonic chord in {round((key.get('tonicChordShare') or 0) * 100)} % of bars; "
             f"second profile agrees: {key.get('agrees')}"
             + (f"; the profile alone said {key.get('profileBest')}, the bar chords moved it" if key.get("chosenByChords") else "") + ").")
    L.append(f"- {h['chordChanges']} chord changes over {len(d['bars'])} bars; chords heard (rough): {', '.join(h['distinctChords'])}. Trust: {h['chordConfidence']}.")
    L.append("\n## Loudness and dynamics\n")
    L.append(f"- Integrated {dyn['lufsIntegrated']} LUFS, short-term max {dyn['lufsShortTermMax']}, momentary max {dyn['lufsMomentaryMax']}, range {dyn['loudnessRange']} LU.")
    L.append(f"- True peak {dyn['truePeakDb']} dBTP, {dyn['clippedSamples']} clipped samples, crest {dyn['crestDb']} dB, noise floor {dyn['noiseFloorDb']} dBFS.")
    if dyn["silence"]:
        L.append(f"- Near silence (under -60 dBFS, 0.5 s or more): {', '.join(f'{a}-{b} s' for a, b in dyn['silence'])}."
                 + (f" Exact digital silence: {', '.join(f'{a}-{b} s' for a, b in dyn['digitalSilence'])}." if dyn["digitalSilence"] else ""))
    if "hyperframesLufs" in v:
        L.append(f"- Check against hyperframes audio: {v['hyperframesLufs']} LUFS, {v['hyperframesTruePeak']} dBTP.")
    L.append("\n## Spectrum\n")
    bm = sp["bandsMeanDb"]
    L.append(f"- Mean energy per band against the loudest band: " + ", ".join(f"{k} {v} dB" for k, v in bm.items()) + f". Centroid {sp['centroidHz']} Hz.")
    L.append(f"- Phone speaker (above 200 Hz): {sp['phone']['lufsAbove200Hz']} LUFS, a loss of {sp['phone']['lossDb']} dB."
             + (f" Drums keep {st['drumsAbove200HzDb']} dB above 200 Hz, bass {st['bassAbove200HzDb']} dB." if st else ""))
    L.append(f"- Stereo: side {sp['stereo']['sideToMidDb']} dB under mid, channel correlation {sp['stereo']['correlation']}.")
    if st:
        L.append(f"\n## Sources ({st['model']})\n")
        L.append(f"- Vocals present: {st['vocals']['present']} ({round(st['vocals']['barShare'] * 100)} % of bars). {st['vocals']['trust']}.")
        c = st["drumHits"]["counts"]
        L.append(f"- Drum hits: {c['kick']} kick, {c['snare']} snare, {c['hat']} hat, {c['other']} other.")
    ch = d.get("character")
    if ch:
        L.append(f"\n## Character ({ch['model']})\n")
        for cat in ("mood", "genre", "use", "texture"):
            L.append(f"- {cat}: " + ", ".join(f"{t['tag']} ({t['z']:+.1f})" for t in ch["tags"][cat][:6]))
        L.append(f"- Trust: {ch['trust']}.")
    dz = d.get("danceability", {})
    if dz.get("value") is not None:
        L.append(f"- Danceability {dz['value']} ({dz['scale']}). Trust: {dz.get('trust', 'not stated')}.")
    L.append("\n## Entry points\n")
    for k, label in (("short", "a 10-20 s film (15 s window)"), ("long", "a 30-45 s film (38 s window)")):
        L.append(f"For {label}:")
        for i, e in enumerate(d["entryPoints"][k]):
            L.append(f"{i + 1}. from {e['from']} s (bar {e['bar']}): {'; '.join(e['why'])}.")
        L.append("")
    good, bad = verdict(d)
    L.append("## Verdict\n")
    if moods:
        L.append(f"**It feels** {', '.join(moods)}; it sounds like {' or '.join(genres)}.\n")
        L.append(f"**It suits** {', '.join(uses)}.\n")
    else:
        L.append("**Character:** not measured (CLAP is not installed); the verdict below uses the measures only.\n")
    L.append("**It does well:**\n")
    L += [f"- {g}" for g in good] or ["- Nothing stands out."]
    L.append("\n**It does badly:**\n")
    L += [f"- {b}" for b in bad] or ["- Nothing measured stands against it."]
    L.append("")
    return "\n".join(L)
