"""untell listen compare: rank candidate tracks for a brief written in words.

Score = the CLAP match between the brief and the track (cosine of the brief's text embedding with the track's
mean audio embedding, as a z-score among the candidates) + points for what the brief asks of the structure
(a drop, a build, a clean end, no vocals, a steady beat) - a penalty for one loop that fills the track.
Each track gets the reasons it wins or loses, so the choice can be checked.
"""
import re

import numpy as np


def _bpm(b):
    """The tempo a brief names, as (low, high) BPM, or None: "118-142 BPM", "118 to 142 bpm", "about 120 BPM"."""
    m = re.search(r"(\d{2,3})\s*(?:-|–|to)\s*(\d{2,3})\s*bpm", b)
    if m:
        return (float(m.group(1)), float(m.group(2)))
    m = re.search(r"(\d{2,3})\s*bpm", b)
    return (float(m.group(1)) - 4, float(m.group(1)) + 4) if m else None


def tempo(bpm):
    """A tempo as the reader should see it: whole when it is whole, else one decimal (116.98 is "117.0", never "117",
    so a value just outside a range never prints as inside it)."""
    return f"{bpm:.0f}" if abs(bpm - round(bpm)) < 0.05 else f"{bpm:.1f}"


def wants(brief):
    b = brief.lower()
    return {
        "drop": bool(re.search(r"\bdrop|\bpeak|\bhit hard|\bpayoff", b)),
        "build": bool(re.search(r"\bbuild|\brise|\bris(es|ing)|\bclimb", b)),
        "cleanEnd": bool(re.search(r"ends? clean|clean end|button end|hard end|resolve", b)),
        "noVocals": not re.search(r"\bvocal|\bsing|\blyric", b) or bool(re.search(r"no vocals|instrumental", b)),
        "energy": bool(re.search(r"hype|energ|punch|drive|intense|launch|sport|fast", b)),
        "bpm": _bpm(b),
        "calm": bool(re.search(r"calm|soft|quiet|gentle|ambient|study|relax", b)),
        "evolving": bool(re.search(r"evolv|story|journey|goes somewhere|develop", b)) or True,
    }


def rank(brief, tracks):
    """tracks: {name: listen.json dict}. Returns a ranked list of {name, score, why_for, why_against}."""
    from importlib.util import find_spec
    w = wants(brief)
    names = list(tracks)
    if not names:
        return []
    clap = find_spec("transformers") is not None and all(tracks[n].get("character") for n in names)
    if clap:
        import analysis as A
        e = A.clap_text([brief, f"music for {brief}"]).mean(axis=0)
        e = e / np.linalg.norm(e)
        sims = np.array([np.dot(np.asarray(tracks[n]["character"]["embedding"]), e) for n in names])
        z = (sims - sims.mean()) / (sims.std() + 1e-9) if len(names) > 1 else np.zeros(1)
    else:  # no sound match: structure only
        sims, z = np.zeros(len(names)), np.zeros(len(names))
    out = []
    for n, s, zz in zip(names, sims, z):
        d = tracks[n]
        pro, con = [], []
        score = 2.0 * float(zz)
        if clap:
            moods = [t["tag"] for t in d["character"]["tags"]["mood"][:3]]
            if len(names) == 1:  # a z-score needs two tracks or more: give the match alone, as information
                pro.append(f"sound match {s:.3f} (one track: no other to compare it with); it sounds {', '.join(moods)}")
            else:
                (pro if zz > 0.3 else con if zz < -0.3 else pro).append(f"sound match {s:.3f} (z {zz:+.1f}); it sounds {', '.join(moods)}")
        if w["drop"]:
            if d["drops"]:
                score += 1.5
                pro.append(f"a drop at {d['drops'][0].get('at', d['drops'][0]['t'])} s ({'+' + str(d['drops'][0]['riseDb']) + ' dB' if d['drops'][0].get('riseDb') is not None else 'set by hand'})")
            else:
                score -= 1.5
                con.append("no drop")
        if w["build"]:
            if d["builds"]:
                score += 0.75
                pro.append(f"{len(d['builds'])} build(s)")
            else:
                score -= 0.5
                con.append("no build")
        if w["cleanEnd"]:
            last = d["sections"][-1]
            dz = d["dynamics"]
            tail_quiet = last["role"] == "outro" or (dz["silence"] and dz["silence"][-1][1] >= d["duration"] - 0.6)
            if tail_quiet:
                score += 0.5
                pro.append("the track has an ending (an outro or a stop), not only a loop that runs out")
            else:
                con.append("no clear ending in the file: the film must fade it")
        st = d.get("stems")
        if w["noVocals"] and st and st["vocals"]["present"] and st["vocals"]["barShare"] > 0.3:
            score -= 0.5
            con.append(f"vocals or a vocal-like lead in {round(st['vocals']['barShare'] * 100)} % of bars")
        lr = d["dynamics"]["loudnessRange"] or 0
        if w["energy"]:
            peak = d["dynamics"]["lufsShortTermMax"]
            if peak is not None and peak >= -12:
                score += 0.5
                pro.append(f"loud peaks ({peak} LUFS short-term)")
            elif peak is not None and peak < -18:
                score -= 1
                con.append(f"quiet throughout ({peak} LUFS short-term max)")
        if w["calm"] and d["dynamics"]["lufsShortTermMax"] is not None and d["dynamics"]["lufsShortTermMax"] > -12:
            score -= 0.5
            con.append("loud for a calm brief")
        rep = d["repetition"]
        rs = rep.get("repeatShare") or 0
        if rs >= 0.5:
            score -= 3.0 * (rs - 0.4)
            con.append(f"loop-based: {round(rs * 100)} % of its 4-bar blocks repeat an earlier block ({rep.get('distinctAfterTransposition')} loops in all)")
        if rep.get("transposedRepeats"):
            score -= 0.5
            con.append(f"{len(rep['transposedRepeats'])} transposed repeat(s): the 'change' is the same loop at another pitch")
        if rep.get("distinctAfterTransposition", 0) >= 4 and rs < 0.5:
            score += 0.5
            pro.append(f"{rep['distinctAfterTransposition']} kinds of material")
        if lr < 3:
            con.append(f"flat (range {lr} LU)")
        if d["rhythm"]["confidence"] == "low" and w["energy"]:
            con.append("no clear beat to cut on")
        # Tempo: a BPM the brief names (one number or a range). Half or double time counts as a match, with a note.
        if w["bpm"]:
            lo, hi = w["bpm"]
            bpm = float(d["rhythm"]["bpm"])
            v, r = tempo(bpm), f"{lo:g}-{hi:g}"
            # In range means in range: lo <= bpm <= hi, with no tolerance (117 is outside 118-128).
            fits = [k for k in (1, 2, 0.5) if lo <= bpm * k <= hi]
            near = [k for k in (1, 2, 0.5) if lo - 2 <= bpm * k <= hi + 2]
            if 1 in fits:
                score += 1.0
                pro.append(f"{v} BPM, in the brief's {r}")
            elif fits:
                score += 0.25
                pro.append(f"{v} BPM: in the brief's {r} only at {'double' if fits[0] == 2 else 'half'} time")
            elif 1 in near:
                score -= 0.5
                off = lo - bpm if bpm < lo else bpm - hi
                con.append(f"{v} BPM, outside the brief's {r} by {tempo(off)} BPM ({'slower' if bpm < lo else 'faster'})")
            else:
                score -= 2.0
                con.append(f"{v} BPM, outside the brief's {r}")
        out.append({"name": n, "score": round(score, 2), "match": round(float(s), 3) if clap else None, "for": pro, "against": con})
    out.sort(key=lambda x: -x["score"])
    return out


def _clap_hint():
    """The command that adds the character part, as listen.py words it (the package maps it to untell's own)."""
    try:
        import listen
        return "Add it: " + listen.HOW["clap"].split("Add it: ", 1)[1] + "."
    except Exception:
        return ""


def write_md(brief, ranked):
    clap = any(t["match"] is not None for t in ranked)
    how = ("The sound match is CLAP zero-shot (medium trust). " if clap else
           "**Ranked by structure only.** The optional sound model (CLAP) is not installed, or a track has no character tags, "
           "so nothing in this rank hears how a track sounds against the brief: the order comes from the structure and the "
           "tempo alone. The first track is not the best match for the brief's mood; choose by reading each track's "
           "listen.md. " + _clap_hint() + " ")
    one = len(ranked) == 1
    L = [f"# Tracks for: \"{brief}\"\n", (f"One track, so nothing is ranked: `untell listen compare` gives its points against the brief. Give two candidates or more to rank them. {how}" if one else f"Ranked by `untell listen compare`. {how}")
         + "The structure points come from listen.json (drops, builds, ending, loop share, tempo).\n"]
    for i, t in enumerate(ranked):
        # Without the model there is no sound score: say so, and give the structure points as what they are.
        mark = (f"score {t['score']}" if t["match"] is not None else
                f"no sound score: it needs the optional model; structure points {t['score']:+g}")
        # "nothing" read as a verdict on the track; it means that the brief asks for nothing this track has or lacks.
        pro = '; '.join(t['for']) or "no point that the brief asks for"
        con = '; '.join(t['against']) or "no point against the brief"
        L.append(f"{'-' if one else str(i + 1) + '.'} **{t['name']}** ({mark}). For: {pro}. Against: {con}.")
    return "\n".join(L) + "\n"
