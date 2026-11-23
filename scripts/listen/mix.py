"""untell listen mix: the final mix of a film, against its parts and its system's target.

Input: the render (mp4 or wav), the film's audio nodes (JSON: a list of nodes, or a capture.json with
"nodes"), and the system id. Output: masking between the bed and each hit per band, the volume or the
duck each hit needs to stand +6 dB over the bed in its own band (by the effect rule of src/system/scene/blocks/sound.ts:
hit peak + bed peak at most -1 dBTP, volume at most 1, else duck the bed), loudness over time against the target,
a phone-speaker check and the level in the first 2 s.
"""
import json
import re
import subprocess
import os
from pathlib import Path

import librosa
import numpy as np
import pyloudnorm
import scipy.signal as sps
import sys

# One masking measure for untell check and untell listen mix: scripts/inspect/sound_checks.py masking().
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "inspect"))
from sound_checks import masking  # noqa: E402

# The repository root, or the work tree that untell builds in a project (UNTELL_ROOT).
ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[2])
SR = 44100
BANDS = [("sub", 20, 60), ("bass", 60, 250), ("lowMid", 250, 500), ("mid", 500, 2000), ("presence", 2000, 6000), ("air", 6000, 16000)]
OVER_DB = 6.0


def r(v, n=1):
    return None if v is None or not np.isfinite(v) else round(float(v), n)


def mix_target(system):
    """The system's loudness target from systems/<id>/tokens.json (direction.mix), as mixTarget() in direction.ts."""
    p = ROOT / "systems" / system / "tokens.json"
    try:
        m = json.loads(p.read_text())["direction"]["mix"]
        return {"lufs": m["lufs"], "range": m["range"], "truePeak": -1}
    except Exception:  # noqa: BLE001
        return {"lufs": -16, "range": 2, "truePeak": -1}


def kinds():
    """Each sound file's kind and peak, from src/system/media.gen.ts."""
    gen = (ROOT / "src/system/media.gen.ts").read_text()
    out = {}
    for m in re.finditer(r'"([^"]+)": \{ kind: "(sfx|music)", file: "([^"]+)", duration: ([\d.]+), peak: ([\d.]+)', gen):
        out[f"{m[1]}/{m[3]}"] = {"kind": m[2], "peak": float(m[5])}
        out[f"{m[1]}/master.wav"] = out[f"{m[1]}/{m[3]}"]  # a prepared master plays the same track
    return out


def band_db(x, sr):
    S = np.abs(np.fft.rfft(x * np.hanning(len(x)))) ** 2
    f = np.fft.rfftfreq(len(x), 1 / sr)
    return {n: 10 * np.log10(S[(f >= lo) & (f < hi)].sum() + 1e-12) for n, lo, hi in BANDS}


def gain_at(n, t):
    v = n.get("volume", 1)
    end = n.get("until")
    if n.get("fadeIn") and t < n["at"] + n["fadeIn"]:
        v *= max(0, (t - n["at"]) / n["fadeIn"])
    if n.get("fadeOut") and end is not None and t > end - n["fadeOut"]:
        v *= max(0, (end - t) / n["fadeOut"])
    return v


def file_peak(path):
    """The highest sample of any channel of a file (not a mono sum, which reads high or low), as an amplitude."""
    y, _ = librosa.load(str(path), sr=SR, mono=False)
    return float(np.abs(y).max()) if y.size else 0.0


def window_peak(path, start, seconds):
    """The highest sample of any channel in a window of a file, as an amplitude."""
    y, _ = librosa.load(str(path), sr=SR, mono=False, offset=max(0.0, start), duration=seconds)
    return float(np.abs(y).max()) if y.size else 0.0


def load_nodes(p):
    j = json.loads(Path(p).read_text())
    nodes = j.get("nodes", j) if isinstance(j, dict) else j
    return [n for n in nodes if n.get("kind") == "audio"]


def analyse(render, nodes_file, system):
    nodes = load_nodes(nodes_file)
    facts = kinds()
    # ffmpeg decodes any container (an mp4 render too); libsndfile does not read mp4.
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(render), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    y = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy()
    dur = y.shape[1] / SR
    meter = pyloudnorm.Meter(SR)
    target = mix_target(system)
    integrated = meter.integrated_loudness(y.T)
    tp = 20 * np.log10(np.abs(sps.resample_poly(y, 4, 1, axis=1)).max() + 1e-12)
    st = []
    for t in np.arange(0, max(0.01, dur - 3) + 1e-6, 0.5):
        seg = y[:, int(t * SR):int((t + 3) * SR)]
        st.append(r(meter.integrated_loudness(seg.T) if seg.shape[1] > SR * 0.5 else -70))
    first = y[:, : int(2 * SR)]
    first_lufs = meter.integrated_loudness(first.T) if first.shape[1] > SR * 0.5 else None
    hp = sps.sosfilt(sps.butter(4, 200, "highpass", fs=SR, output="sos"), y, axis=1)
    phone = meter.integrated_loudness(hp.T)
    # The bed: every music clip. A duck splits one track into clips of the same file (the clip before, the dip and the
    # clip after, joined by short crossfades), so the bed under a hit is the clip that covers its peak.
    beds = [n for n in nodes if facts.get(n["src"], {}).get("kind") == "music"]
    audio_of = {}

    def bed_at(t):
        """The bed clip under film time t and the bed's gain there (the clips that cover t, summed: a crossfade)."""
        cover = [b for b in beds if b["at"] <= t <= (b.get("until") or dur)]
        if not cover:
            return None, 0.0
        b = max(cover, key=lambda x: gain_at(x, t))
        return b, sum(gain_at(x, t) for x in cover if x["src"] == b["src"])
    hits = []
    for n in nodes:
        f = facts.get(n["src"])
        if not f or f["kind"] != "sfx":
            continue
        fx, _ = librosa.load(str(ROOT / "assets/media" / n["src"]), sr=SR, mono=True)
        start = n["at"] - (n.get("from") or 0)
        peak_film = start + f["peak"]
        w = int(0.1 * SR)
        p = int(f["peak"] * SR)
        hseg = fx[max(0, p - w // 2): p + w // 2] * n.get("volume", 1)
        hb = band_db(hseg, SR)
        row = {"id": n["id"], "src": n["src"], "peakAt": r(peak_film, 3), "hitBandsDb": {k: r(v) for k, v in hb.items()}}
        bed, g = bed_at(peak_film)
        if bed is not None:
            if bed["src"] not in audio_of:
                audio_of[bed["src"]], _ = librosa.load(str(ROOT / "assets/media" / bed["src"]), sr=SR, mono=True)
            bed_audio = audio_of[bed["src"]]
            tt = peak_film - bed["at"] + (bed.get("from") or 0)
            bseg = bed_audio[max(0, int(tt * SR) - w // 2): int(tt * SR) + w // 2] * g
            if len(bseg) < w // 2 or g == 0:
                row["note"] = "no bed under this hit"
            else:
                m = masking(hseg, bseg, SR)
                row["hitBandsDb"] = m["hitBandsDb"]  # the shared octave bands
                main = m["heardIn"]  # the band where the hit stands clearest among the bands that carry it
                need = OVER_DB - m["overInBandDb"]
                row.update({"bedBandsDb": m["bedBandsDb"], "overBedDb": m["overBedDb"], "mainBand": m["mainBand"],
                            "overInMainBandDb": m["overInMainBandDb"], "heardIn": main, "overInBandDb": m["overInBandDb"], "masked": m["masked"]})
                if need > 0:
                    # A fix must change the level by 0.5 dB at least. The effect rule (src/system/scene/blocks/sound.ts,
                    # the one statement of it): hit peak + bed peak at most -1 dBTP, volume at most 1; past that, duck.
                    need = max(need, 0.5)
                    vol = n.get("volume", 1) * 10 ** (need / 20)
                    fx_peak = file_peak(ROOT / "assets/media" / n["src"])
                    # The bed's peak while the hit sounds (the hit's own span, 50 ms at least): the two add there.
                    span = max(0.05, min(0.5, len(fx) / SR))
                    bed_near = window_peak(ROOT / "assets/media" / bed["src"], tt - f["peak"], span) * g
                    room = 10 ** (-1 / 20) - bed_near
                    vmax = min(1.0, room / fx_peak) if room > 0 and fx_peak > 0 else 0.0
                    row["maxVolume"] = r(vmax, 3)
                    if vol <= vmax:
                        row["fix"] = (f"raise the hit to volume {vol:.2f} (+{need:.1f} dB); that keeps the effect rule: its peak plus the bed's "
                                      f"peak stay at or under -1 dBTP, at volume 1 at most")
                    else:
                        # The smallest duck D (dB) after which the hit, at the volume it then needs, keeps the rule.
                        cur = n.get("volume", 1)
                        depth = 18.0  # sound.ts BAND_DUCK_MAX: the deepest dip a hit's band may ask for
                        for D in range(1, 19):
                            room_d = 10 ** (-1 / 20) - bed_near * 10 ** (-D / 20)
                            vmax_d = min(1.0, room_d / fx_peak) if room_d > 0 and fx_peak > 0 else 0.0
                            if cur * 10 ** (max(0.0, need - D) / 20) <= vmax_d:
                                depth = float(D)
                                break
                        row["duckDb"] = r(depth)
                        row["fix"] = (f"duck the bed under it: give the hit its bed and leave duck at its default (with the media tables' bands it dips the bed as deep as the band needs, here about {depth:.0f} dB around {peak_film:.2f} s), "
                                      f"or music({{ duck: [{{ at: {peak_film - 0.1:.2f}, depth: {depth:.0f}, length: 0.3 }}] }}); do not raise the hit: over volume "
                                      f"{vmax:.2f} its peak plus the bed's passes -1 dBTP (the effect rule). Or pick a hit with more {main}")
        hits.append(row)
    over_target = [i * 0.5 for i, v in enumerate(st) if v is not None and v > -60 and abs(v - target["lufs"]) > target["range"] + 3]
    # The same comparison as untell check's sound/effect-too-loud (sound_checks.check_effect_level): each effect's peak
    # against the music's loudest peak in the film.
    try:
        from sound_checks import check_effect_level
        _, levels = check_effect_level(nodes, dur)
        by_id = {x["id"]: x for x in (levels or [])}
        for h in hits:
            lv = by_id.get(h["id"])
            if lv and lv.get("peakDb") is not None:
                h["peakDb"] = lv["peakDb"]
                h["musicPeakDb"] = lv.get("musicPeakDb")
    except Exception as e:  # noqa: BLE001  a mix with no bed: nothing to compare with
        print(f"note: no peak comparison ({e})", file=sys.stderr)
    return {
        "render": str(render), "system": system, "target": target, "lufsIntegrated": r(integrated),
        "offTargetLu": r(integrated - target["lufs"]), "truePeakDb": r(tp),
        "headroomDb": r(target["truePeak"] - tp), "onTarget": bool(abs(integrated - target["lufs"]) <= target["range"]),
        "shortTerm": {"step": 0.5, "win": 3.0, "lufs": st}, "shortTermFarFromTarget": over_target,
        "first2sLufs": r(first_lufs) if first_lufs is not None else None,
        "phone": {"lufsAbove200Hz": r(phone), "lossDb": r(integrated - phone)},
        "hits": hits,
    }


def write_md(d):
    t = d["target"]
    L = [f"# The mix of {Path(d['render']).name}\n",
         f"- Integrated {d['lufsIntegrated']} LUFS against the {d['system']} target {t['lufs']} ± {t['range']} LU: "
         + ("on target." if d["onTarget"] else f"off by {d['offTargetLu']:+} LU; change the bed's gain by {-d['offTargetLu']:+.1f} dB"
            + (f", but the true peak ({d['truePeakDb']} dBTP) leaves only {d['headroomDb']} dB: a -1 dBTP limiter in the render step is needed to get there." if -d["offTargetLu"] > d["headroomDb"] else ".")),
         f"- First 2 s: {d['first2sLufs']} LUFS" + (" (quiet: the hook is not heard)." if d["first2sLufs"] is not None and d["first2sLufs"] < t["lufs"] - 8 else "."),
         f"- Phone speaker: {d['phone']['lufsAbove200Hz']} LUFS above 200 Hz, a loss of {d['phone']['lossDb']} dB.", ""]
    if not d["hits"]:
        L.append("- No effects in this film: the effect checks (masking, an effect louder than the music) do not apply.")
    for h in d["hits"]:
        # Masking, then the peak against the music's loudest peak: the two facts untell check judges for each effect.
        if "overInMainBandDb" in h:
            heard = (f"{h['overInBandDb']:+} dB over the bed in the {h['heardIn']} band (it carries the hit)"
                     + (f"; **masked: {h.get('fix') or 'the bed covers it in the band that carries it: raise the hit, or duck the bed under it'}**" if h.get("masked") else ", not masked"))
        else:
            heard = f"{h.get('note') or 'no bed under this hit'}: nothing masks it"
        if h.get("peakDb") is not None and h.get("musicPeakDb") is not None:
            gap = h["musicPeakDb"] - h["peakDb"]
            peak = f"peak {h['peakDb']} dBFS against the music's peak {h['musicPeakDb']} dBFS: " + (f"{gap:.1f} dB under it." if gap >= 0 else f"**{-gap:.1f} dB over it: lower this effect.**")
        else:
            peak = "no music to compare its peak with."
        L.append(f"- {h['id']} at {h['peakAt']} s: {heard}; {peak}")
    return "\n".join(L) + "\n"
