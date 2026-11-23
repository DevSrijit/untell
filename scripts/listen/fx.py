"""untell listen fx: the measures of one sound effect file.

Attack, peak, decay, tail, duration, transients (a double hit), loudness, pitch when it is tonal, and a
spectral class (whoosh, impact, click, tick, riser, pop, swell, other) from rules on the envelope and the
spectrum, checked against CLAP zero-shot tags when the character part is installed.
"""
import librosa
import numpy as np
import pyloudnorm

SR = 44100


def r(v, n=3):
    return None if v is None or not np.isfinite(v) else round(float(v), n)


def transients(x, sr):
    """Attacks within 6 dB of the loudest, 40 ms or more apart, with a 6 dB dip between them."""
    hop = int(0.01 * sr)
    env = np.array([np.sqrt(np.mean(np.square(x[i:i + hop]))) + 1e-9 for i in range(0, max(1, len(x) - hop), hop)])
    d = 20 * np.log10(env)
    top = d.max()
    peaks = [i for i in range(1, len(d) - 1) if d[i] >= d[i - 1] and d[i] >= d[i + 1] and d[i] > top - 6]
    out = []
    for p in peaks:
        if out and ((p - out[-1]) * 0.01 < 0.04 or d[out[-1]:p + 1].min() > min(d[out[-1]], d[p]) - 6):
            if d[p] > d[out[-1]]:
                out[-1] = p
            continue
        out.append(p)
    return [round(p * 0.01, 3) for p in out]


def analyse(path, use_clap=True):
    y, sr = librosa.load(str(path), sr=SR, mono=True)
    # The peak is the highest sample of any channel: a mono average reads low (tick-hi: -0.9 dB against -0.3 dBFS on
    # its louder channel), and the effect rule in sound.ts needs the real peak.
    ys, _ = librosa.load(str(path), sr=SR, mono=False)
    peak_amp = float(np.abs(ys).max()) if ys.size else float(np.abs(y).max())
    dur = len(y) / sr
    hop = int(0.005 * sr)
    env = np.array([np.sqrt(np.mean(np.square(y[i:i + hop]))) for i in range(0, max(1, len(y) - hop), hop)]) + 1e-9
    edb = 20 * np.log10(env)
    pk = int(np.argmax(env))
    peak_t = pk * 0.005
    top = edb[pk]
    start = np.argmax(edb > top - 40)
    a10 = np.argmax(env[start:pk + 1] >= 0.1 * env[pk]) + start
    a90 = np.argmax(env[start:pk + 1] >= 0.9 * env[pk]) + start
    after = edb[pk:]
    decay20 = np.argmax(after < top - 20) * 0.005 if (after < top - 20).any() else dur - peak_t
    tail40 = np.argmax(after < top - 40) * 0.005 if (after < top - 40).any() else dur - peak_t
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=512))
    cen = librosa.feature.spectral_centroid(S=S, sr=sr)[0]
    flat = float(np.mean(librosa.feature.spectral_flatness(S=S)))
    w = np.sum(S, axis=0) + 1e-9
    act = w > w.max() * 0.05
    cen_act = cen[act] if act.any() else cen
    c_mean = float(np.average(cen_act))
    third = max(1, len(cen_act) // 3)
    slope = float(np.mean(cen_act[-third:]) - np.mean(cen_act[:third])) / (c_mean + 1e-9)
    tr = transients(y, sr)
    try:
        lufs = float(pyloudnorm.Meter(sr, block_size=min(0.4, max(0.05, dur / 2))).integrated_loudness(y))
    except Exception:  # noqa: BLE001
        lufs = None
    pitch = None
    try:
        f0, vf, vp = librosa.pyin(y[: int(min(dur, 2) * sr)], fmin=50, fmax=2000, sr=sr)
        if np.nanmean(vp) > 0.5 and np.isfinite(np.nanmedian(f0)):
            pitch = {"hz": r(np.nanmedian(f0), 1), "note": librosa.hz_to_note(np.nanmedian(f0)), "voicedShare": r(np.mean(vf), 2)}
    except Exception:  # noqa: BLE001
        pass
    attack = (a90 - a10) * 0.005
    # Rules, in the order a sound designer would name them.
    if dur < 0.25 and c_mean > 2500:
        cls = "tick" if dur < 0.12 or c_mean > 5000 else "click"
    elif dur < 0.35 and pitch:
        cls = "pop"
    elif attack < 0.03 and tail40 > 0.8 and c_mean < 1500:
        cls = "impact"
    elif attack < 0.03 and dur < 0.8:
        cls = "click" if c_mean > 2500 else "pop" if pitch else "hit"
    elif peak_t > 0.6 * dur and slope > 0.2:
        cls = "riser"
    elif attack > 0.3:
        cls = "swell"
    elif flat > 0.05 and attack > 0.03:
        cls = "whoosh"
    else:
        cls = "other"
    out = {"file": path.name, "duration": r(dur), "peakAt": r(peak_t), "attack": r(attack), "attackFrom": r(a10 * 0.005),
           "decayTo20dB": r(decay20), "tailTo40dB": r(tail40), "lufs": r(lufs, 1), "peakDb": r(20 * np.log10(peak_amp + 1e-12), 1),
           "centroidHz": r(c_mean, 0), "brightnessSlope": r(slope, 2), "flatness": r(flat, 3), "pitch": pitch,
           "transients": tr, "doubleHit": len(tr) > 1, "class": cls,
           "classMethod": "rules on duration, attack, tail, centroid, flatness and pitch; see clapClass for a second opinion"}
    if use_clap:
        import analysis as A
        from vocab import VOCAB
        st = np.stack([librosa.resample(y, orig_sr=sr, target_sr=A.LSR)] * 2)
        e = A.clap_audio(st, [(0, min(dur, 10))])[0]
        T = A.clap_words("fx", VOCAB["fx"])
        s = T @ e
        order = np.argsort(s)[::-1]
        out["clapClass"] = [{"tag": VOCAB["fx"][i], "score": r(s[i], 3)} for i in order[:5]]
    return out


def write_md(d, name):
    L = [f"# {name}: what this effect sounds like\n",
         f"- Class: **{d['class']}** (rules); " + (f"CLAP hears: {', '.join(t['tag'] for t in d['clapClass'])}." if d.get("clapClass") else "no CLAP opinion (the character part is not installed)."),
         f"- {d['duration']} s long. Attack {d['attack']} s from {d['attackFrom']} s; peak at {d['peakAt']} s; "
         f"down 20 dB {d['decayTo20dB']} s after the peak; tail to -40 dB {d['tailTo40dB']} s.",
         f"- Level {d['lufs']} LUFS, peak {d['peakDb']} dBFS. Centroid {d['centroidHz']} Hz, brightness slope {d['brightnessSlope']}, flatness {d['flatness']}.",
         f"- Pitch: {d['pitch']['note'] + ' (' + str(d['pitch']['hz']) + ' Hz)' if d['pitch'] else 'not tonal'}.",
         f"- Transients: {len(d['transients'])} at {d['transients']} s." + (" **A double hit: trim to one attack or choose another file.**" if d["doubleHit"] else ""),
         "- Use: `hit` places the peak one frame after its picture, so this file starts "
         f"{d['peakAt']} s before the peak frame.", ""]
    return "\n".join(L)
