"""untell listen: the analysis of one music track.

An agent cannot hear. This module measures what a mix engineer hears in a track and writes it as data:
rhythm, structure, repetition, energy and tension, spectrum, harmony, stems, dynamics and character.
Every figure carries a confidence or the method that made it, so an agent knows what to trust.

The entry point is analyse(path) -> dict. listen.py writes the dict as listen.json, and prose.py and
plot.py turn it into listen.md and listen.png.

Methods (all local; nothing generates audio):
- Signal measures: numpy, scipy, librosa (ISC licence), pyloudnorm (MIT, ITU-R BS.1770-4).
- Key and danceability: our own code on librosa features (a profile fit on chroma; DFA of the level envelope).
- Stems: Demucs htdemucs (MIT, about 80 MB).
- Character tags: CLAP, laion/clap-htsat-unfused (Apache-2.0, about 600 MB), zero-shot against vocab.py.
- Cross-checks: hyperframes audio (beats, bpm, loudness) when the CLI is present.
"""
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import librosa
import numpy as np
import pyloudnorm
import scipy.signal as sps

SR = 22050          # analysis rate, mono
HOP = 512           # analysis hop: 23.2 ms
FR = SR / HOP       # analysis frames a second
LAG = HOP / SR      # the onset envelope's lag behind the attack
# Downbeat cue weights (see rhythm()). Chosen on the 22 lab tracks against the result with stems: these weights put
# the bar start where the stems do on 15 of 22 tracks without stems (low 1.0, chroma 0.5 alone: 14; low-band
# peaks used as kicks: 12). With stems, the kick cue decides.
DOWN_W = {"low": 0.5, "chroma": 0.5, "span": 0.5, "bass": 0.0}
LSR = 44100         # loudness and stem rate, stereo
STEP = 0.5          # the step of the curves in listen.json, seconds
BANDS = [("sub", 20, 60), ("bass", 60, 250), ("lowMid", 250, 500), ("mid", 500, 2000), ("presence", 2000, 6000), ("air", 6000, 20000)]
# The HyperFrames CLI for the cross-check (validate): UNTELL_HYPERFRAMES, else `hyperframes` on PATH, else none.
HF_ENV = "UNTELL_HYPERFRAMES"


def hyperframes_cli():
    """The HyperFrames CLI's path, or None (the cross-check is then skipped with one line)."""
    p = os.environ.get(HF_ENV)
    if p:
        return p if Path(p).exists() else None
    return shutil.which("hyperframes")


def r(v, n=3):
    """Rounds a float for JSON (None stays None)."""
    return None if v is None or not np.isfinite(v) else round(float(v), n)


def db(x, floor=-120.0):
    return float(max(floor, 20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-12))) if len(x) else floor


# ---------------------------------------------------------------- loading and loudness

def load(path):
    st, _ = librosa.load(str(path), sr=LSR, mono=False)
    if st.ndim == 1:
        st = np.stack([st, st])
    mono = librosa.resample(st.mean(axis=0), orig_sr=LSR, target_sr=SR)
    return st.astype(np.float32), mono.astype(np.float32)


class Loudness:
    """K-weighted loudness (ITU-R BS.1770-4) with cumulative sums, so any window costs nothing."""

    def __init__(self, st):
        meter = pyloudnorm.Meter(LSR)
        self.meter = meter
        k = st.T.astype(np.float64)
        # The K-weighting: a high shelf, then a high pass, along time (axis 0) in each channel.
        # pyloudnorm's apply_filter filters along the last axis. On a (samples, channels) array that is the channel
        # axis, which read every bar and every short-term window about 5 dB too loud, so the music block's auto gain
        # set each bed about 5 dB under the system's mix target. loudness_test.py holds this against ffmpeg's meter.
        for f in meter._filters.values():
            k = f.passband_gain * sps.lfilter(f.b, f.a, k, axis=0)
        self.cum = np.concatenate([[0.0], np.cumsum(np.square(k).sum(axis=1))])
        self.n = k.shape[0]

    def window(self, t0, t1):
        a, b = int(max(0, t0) * LSR), int(min(self.n, t1 * LSR))
        if b - a < LSR * 0.05:
            return -120.0
        ms = (self.cum[b] - self.cum[a]) / (b - a)
        return float(max(-120.0, -0.691 + 10 * np.log10(ms + 1e-15)))

    def curve(self, win, step, dur):
        ts = np.arange(0, dur, step)
        return ts, np.array([self.window(t + step / 2 - win / 2, t + step / 2 + win / 2) for t in ts])


def peak_curve(st, block=0.1):
    """The true peak (4x oversampled, linear) of each 0.1 s block, computed in chunks to keep memory low."""
    n = int(block * LSR)
    out = []
    chunk = n * 200
    for a in range(0, st.shape[1], chunk):
        seg = st[:, max(0, a - 64): a + chunk + 64]
        over = np.abs(sps.resample_poly(seg, 4, 1, axis=1)).max(axis=0)
        lead = (a - max(0, a - 64)) * 4
        over = over[lead: lead + min(chunk, st.shape[1] - a) * 4]
        m = len(over) // (4 * n) * 4 * n
        blocks = over[:m].reshape(-1, 4 * n).max(axis=1)
        if len(over) > m:
            blocks = np.r_[blocks, over[m:].max()]
        out.append(blocks)
    return np.concatenate(out)


def dynamics(st, mono, lo, dur):
    """Integrated, short-term and momentary loudness, range, crest, true peak, clipping, floor and silence."""
    integrated = float(lo.meter.integrated_loudness(st.T))
    _, short = lo.curve(3.0, 1.0, dur)
    _, mom = lo.curve(0.4, 0.1, dur)
    # Loudness range (EBU Tech 3342): short-term values gated at -70 LUFS and 20 LU under their mean, 10th to 95th percentile.
    g = short[short > -70]
    if len(g):
        rel = 10 * np.log10(np.mean(10 ** (g / 10))) - 20
        g = g[g > rel]
    lra = float(np.percentile(g, 95) - np.percentile(g, 10)) if len(g) > 2 else 0.0
    true_peak = 20 * np.log10(peak_curve(st).max() + 1e-12)
    sample_peak = 20 * np.log10(np.abs(st).max() + 1e-12)
    clip = np.abs(st).max(axis=0) >= 0.999
    rms = db(st)
    win = int(0.05 * LSR)
    frames = np.sqrt(np.mean(np.square(st.mean(axis=0)[: len(st[0]) // win * win].reshape(-1, win)), axis=1)) + 1e-12
    fdb = 20 * np.log10(frames)
    voiced = fdb[fdb > -70]
    floor = float(np.percentile(voiced, 5)) if len(voiced) else -120.0
    # Silence: runs of 50 ms windows under -60 dBFS of 0.5 s or more; exact digital zero is listed apart.
    sil, zero = [], []
    for flags, out in ((fdb < -60, sil), (np.abs(st).max(axis=0)[: len(frames) * win].reshape(-1, win).max(axis=1) == 0, zero)):
        i = 0
        while i < len(flags):
            if flags[i]:
                j = i
                while j < len(flags) and flags[j]:
                    j += 1
                if (j - i) * 0.05 >= 0.5:
                    out.append([r(i * 0.05, 2), r(j * 0.05, 2)])
                i = j
            else:
                i += 1
    return {
        "lufsIntegrated": r(integrated, 1), "lufsShortTermMax": r(short.max(), 1), "lufsMomentaryMax": r(mom.max(), 1),
        "loudnessRange": r(lra, 1), "truePeakDb": r(true_peak, 2), "samplePeakDb": r(sample_peak, 2),
        "crestDb": r(sample_peak - rms, 1), "clippedSamples": int(clip.sum()), "noiseFloorDb": r(floor, 1),
        "silence": sil, "digitalSilence": zero,
        "shortTerm": {"step": 1.0, "win": 3.0, "lufs": [r(v, 1) for v in short]},
        "method": "pyloudnorm K-weighting (ITU-R BS.1770-4); true peak by 4x oversampling; LRA per EBU Tech 3342",
    }


# ---------------------------------------------------------------- rhythm

def spectra(mono):
    S = np.abs(librosa.stft(mono, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    return S, freqs


def band_flux(S, freqs, lo, hi):
    e = np.log1p(S[(freqs >= lo) & (freqs < hi)].sum(axis=0) * 10)
    return np.maximum(0, np.diff(e, prepend=e[0]))


def interp(curve, times):
    return np.interp(np.asarray(times) * FR, np.arange(len(curve)), curve)


def rhythm(mono, S, freqs, dur, kicks=None):
    oenv = librosa.onset.onset_strength(y=mono, sr=SR, hop_length=HOP, aggregate=np.median)
    low = band_flux(S, freqs, 20, 150)
    # The tempo and its octave ambiguity: the onset autocorrelation at T, T/2 and 2T.
    ac = librosa.autocorrelate(oenv - oenv.mean(), max_size=int(FR * 4))
    ac = ac / (ac[0] + 1e-9)

    def strength(bpm):
        lag = 60 / bpm * FR
        return float(np.interp(lag, np.arange(len(ac)), ac)) if lag < len(ac) - 1 else 0.0

    tempo = float(librosa.feature.tempo(onset_envelope=oenv, sr=SR, hop_length=HOP, start_bpm=120)[0])
    lags = np.arange(int(FR * 60 / 210), int(FR * 60 / 50))
    best_lag = lags[np.argmax(ac[lags])]
    acf_tempo = 60 * FR / best_lag
    # Fit a constant grid: refine the tempo by 1 % either way and the phase, to the most onset energy on the beats.
    # The envelope weights the low band (kick, bass) as much as the full band, so a grid does not lock onto
    # off-beat hats (house music puts its loudest high onsets between the beats).
    fitenv = oenv / (oenv.mean() + 1e-9) + low / (low.mean() + 1e-9)

    def fit(t0):
        best = (-1, t0, 0.0)
        for bpm in np.linspace(t0 * 0.99, t0 * 1.01, 41):
            p = 60 / bpm
            phases = np.linspace(0, p, 60, endpoint=False)
            k = np.arange(int(dur / p) + 1)
            grid = phases[:, None] + k[None, :] * p
            vals = interp(fitenv, np.clip(grid, 0, dur)).mean(axis=1)
            i = int(np.argmax(vals))
            if vals[i] > best[0]:
                best = (float(vals[i]), float(bpm), float(phases[i]))
        return best

    # Octave: fit T/2, T and 2T. Take the fastest tempo up to 180 BPM whose beats carry at least 70 % of the onset
    # energy of the best fit: a beat that has onsets on it is a beat that is heard.
    cands = [c for c in (tempo / 2, tempo, tempo * 2, tempo * 4) if 50 <= c <= 220]
    fits = {c: fit(c) for c in cands}
    top = max(f[0] for f in fits.values())
    # Octave rule: the grid with the most onset energy, unless it is under 80 BPM and its double (up to 180 BPM)
    # keeps half that energy: a pulse that slow with heard beats between is a half-time feel at the faster tempo.
    chosen = max(fits, key=lambda c: fits[c][0])
    half_time = False
    for c in cands:
        if chosen < 80 and abs(c - 2 * chosen) < 1 and c <= 180 and fits[c][0] >= 0.5 * top:
            chosen, half_time = c, True
    best = fits[chosen]
    octave = [{"bpm": r(f[1], 1), "relative": r(f[0] / (best[0] + 1e-9), 2)} for c, f in fits.items() if c != chosen]
    clarity = best[0] / (fitenv.mean() + 1e-9)
    bpm, phase = best[1], best[2]
    period = 60 / bpm
    # With the kicks from the drum stem: move the phase by a half or a quarter beat when that puts more kicks
    # on the grid. The kick, not the hat, marks the beat a viewer taps to.
    phase_moved = 0.0
    if kicks is not None and len(kicks) >= 16:
        def on(ph):
            g = ph + np.arange(int((dur - ph) / period) + 1) * period
            return float(np.mean([np.abs(g - k).min() <= 0.04 for k in kicks]))
        shares = {o: on((phase + o * period) % period) for o in (0, 0.25, 0.5, 0.75)}
        o = max(shares, key=shares.get)
        if o and shares[o] >= shares[0] + 0.2:
            phase, phase_moved = (phase + o * period) % period, o
    fixed = phase + np.arange(int((dur - phase) / period) + 1) * period
    _, tracked = librosa.beat.beat_track(onset_envelope=oenv, sr=SR, hop_length=HOP, bpm=bpm, tightness=200, units="time")
    # The grid residual: how far the tracker's beats sit from the fixed grid, modulo half a beat (a tracker may
    # follow the off-beat; that is a phase choice, not a tempo change).
    def resid_of(g):
        if not len(tracked):
            return 1.0
        d = np.array([np.abs(g - t).min() for t in tracked])
        return float(np.median(np.minimum(d, np.abs(d - period / 2))))
    resid = resid_of(fixed)
    use_fixed = clarity >= 1.15 and resid <= 0.035
    beats = fixed if use_fixed else np.asarray(tracked)
    # The local tempo over time, from the tracker's beat intervals in 8 s windows.
    curve = []
    if len(tracked) > 4:
        iv = np.diff(tracked)
        for t0 in np.arange(0, dur, 4.0):
            sel = iv[(tracked[:-1] >= t0) & (tracked[:-1] < t0 + 8)]
            if len(sel) >= 3:
                curve.append({"t": r(t0, 1), "bpm": r(60 / np.median(sel), 1)})
    bvals = [c["bpm"] for c in curve]
    stability = float(np.std(bvals)) if bvals else None
    # Octave ambiguity: how strong half and double time are against the chosen tempo.
    s0, sh, sd = strength(bpm), strength(bpm / 2), strength(bpm * 2)
    alts = octave  # the other octaves and how much onset energy their beats carry, against the chosen grid
    # Meter: beat-level low-band and chroma change, autocorrelated at 3 and 4 beats.
    bl = interp(low, beats)
    bo = interp(oenv, beats)
    m3 = np.corrcoef(bl[:-3], bl[3:])[0, 1] if len(bl) > 8 else 0
    m4 = np.corrcoef(bl[:-4], bl[4:])[0, 1] if len(bl) > 8 else 0
    meter = 3 if (m3 > m4 + 0.15) else 4
    # Downbeat: the phase (0..meter-1) whose beats carry the most bar-start cues. Each cue is a z-score per beat:
    # - low: low-band (kick and bass) onset strength on the beat;
    # - chroma: the change of harmony at the beat (frame level, smoothed);
    # - span: the change of harmony between the two beats before and the two after (harmony changes on a bar);
    # - bass: the change of the bass note between the beat before and the beat (the bass moves on the bar).
    # With stems, a kick on the beat is added (the strongest cue). DOWN_W holds the weights.
    chroma = librosa.feature.chroma_cqt(y=mono, sr=SR, hop_length=HOP)
    cnov = np.r_[0, np.linalg.norm(np.diff(chroma, axis=1), axis=0)]
    bc = interp(np.convolve(cnov, np.ones(5) / 5, "same"), beats)
    bframes = np.clip((np.asarray(beats) * FR).astype(int), 0, chroma.shape[1] - 1)
    cs = librosa.util.sync(chroma, bframes, aggregate=np.mean)[:, 1:len(beats) + 1] if len(beats) > 4 else np.zeros((12, len(beats)))
    span = np.zeros(len(beats))
    for i in range(2, min(len(beats), cs.shape[1]) - 2):
        a, b = cs[:, i - 2:i].mean(axis=1), cs[:, i:i + 2].mean(axis=1)
        span[i] = 1 - np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9)
    bass_c = librosa.feature.chroma_cqt(y=mono, sr=SR, hop_length=HOP, fmin=librosa.note_to_hz("C1"), n_octaves=3)
    bs = librosa.util.sync(bass_c, bframes, aggregate=np.mean)[:, 1:len(beats) + 1] if len(beats) > 4 else np.zeros((12, len(beats)))
    bnote = bs.argmax(axis=0) if bs.size else np.zeros(len(beats), dtype=int)
    bmove = np.r_[0, (np.diff(bnote) != 0).astype(float)][:len(beats)]
    bmove = np.pad(bmove, (0, max(0, len(beats) - len(bmove))))
    z = lambda v: (v - v.mean()) / (v.std() + 1e-9)  # noqa: E731
    feats = {"low": z(bl), "chroma": z(bc), "span": z(np.pad(span, (0, max(0, len(beats) - len(span))))[:len(beats)]), "bass": z(bmove)}
    scores = [float(sum(DOWN_W[k] * np.mean(v[ph::meter]) for k, v in feats.items())) for ph in range(meter)]
    if kicks is not None and len(kicks) >= 16:  # a kick on the bar's first beat is the strongest downbeat cue
        kb = np.array([np.abs(kicks - b).min() <= 0.04 for b in beats], dtype=float)
        scores = [sc + float(np.mean(kb[ph::meter]) - np.mean(kb)) * 2 for ph, sc in enumerate(scores)]
    order = np.argsort(scores)[::-1]
    ph = int(order[0])
    down_conf = scores[order[0]] - scores[order[1]]
    downbeats = beats[ph::meter]
    # Swing: where strong onsets fall between two beats (0.5 straight, 0.67 a triplet swing).
    peaks = librosa.util.peak_pick(oenv, pre_max=3, post_max=3, pre_avg=10, post_avg=10, delta=np.percentile(oenv, 75) * 0.3, wait=3)
    pt = peaks / FR
    fr = []
    for t in pt:
        i = np.searchsorted(beats, t) - 1
        if 0 <= i < len(beats) - 1:
            f = (t - beats[i]) / (beats[i + 1] - beats[i])
            if 0.3 <= f <= 0.8:
                fr.append(f)
    swing = None
    if len(fr) >= 16:
        h, e = np.histogram(fr, bins=20, range=(0.3, 0.8))
        f = (e[np.argmax(h)] + e[np.argmax(h) + 1]) / 2
        feel = "straight" if f < 0.56 else "light swing" if f < 0.62 else "swung" if f <= 0.7 else "unclear (off-beat onsets sit late; likely a 16th-note pattern)"
        swing = {"offbeatAt": r(f, 2), "ratio": r(f / (1 - f), 2), "feel": feel,
                 "onsets": len(fr)}
    # Each beat: is a pulse heard on it (an onset within 40 ms)?
    heard = np.array([np.abs(pt - b).min() <= 0.04 if len(pt) else False for b in beats])
    # The onset envelope peaks about one hop after the attack (librosa's flux compares a frame with the one before).
    # Move every time back by one hop: checked against hyperframes beats, the grid sat 25-29 ms late without it.
    beats, downbeats, pt = beats - LAG, downbeats - LAG, pt - LAG
    keep = beats >= 0
    heard = heard[keep]
    beats, downbeats, pt = beats[keep], downbeats[downbeats >= 0], pt[pt >= 0]
    conf = "high" if (use_fixed and clarity > 1.5 and down_conf > 0.5) else "medium" if clarity > 1.2 else "low"
    return {
        "bpm": r(bpm, 2), "bpmAutocorrelation": r(acf_tempo, 1), "grid": "fixed" if use_fixed else "tracked",
        "pulseClarity": r(clarity, 2), "halfTimeFeel": half_time, "phaseMovedToKicks": phase_moved, "gridResidualMs": r(resid * 1000, 1), "confidence": conf,
        "stabilityBpmStd": r(stability, 2), "curve": curve, "octaveAlternatives": alts,
        "meter": meter, "meterScores": {"3": r(m3, 2), "4": r(m4, 2)}, "downbeatPhase": ph, "downbeatMargin": r(down_conf, 2),
        "swing": swing, "beats": [r(b) for b in beats], "downbeats": [r(b) for b in downbeats],
        "beatHeard": [bool(h) for h in heard],
        "_oenv": oenv, "_low": low, "_chroma": chroma, "_peaks": pt, "_feats": feats, "_kicked": kicks is not None and len(kicks) >= 16,
    }


def bars_of(rh, dur):
    """Bars from the downbeats, extended to the start and the end of the track with the median bar length."""
    d = np.asarray(rh["downbeats"], dtype=float)
    if len(d) < 2:
        L = 4 * 60 / rh["bpm"]
        d = np.arange(0, dur, L)
    L = float(np.median(np.diff(d)))
    pre = np.arange(d[0] - L, -1e-6, -L)[::-1]
    post = np.arange(d[-1] + L, dur, L)
    starts = np.concatenate([pre, d, post])
    starts = starts[starts < dur - 0.25]
    if starts[0] > 0.25:
        starts = np.r_[0.0, starts]
    ends = np.r_[starts[1:], dur]
    measured = np.array([(s >= d[0] - 1e-3 and s <= d[-1] + 1e-3) for s in starts])
    return starts, ends, measured, L


# ---------------------------------------------------------------- spectrum, stems, harmony

def bands_curve(S, freqs, dur):
    P = S ** 2
    n = int(np.ceil(dur / STEP))
    idx = np.minimum((np.arange(P.shape[1]) / FR / STEP).astype(int), n - 1)
    out = {}
    for name, lo, hi in BANDS:
        e = P[(freqs >= lo) & (freqs < hi)].sum(axis=0)
        acc = np.bincount(idx, weights=e, minlength=n) / np.maximum(1, np.bincount(idx, minlength=n))
        out[name] = 10 * np.log10(acc + 1e-10)
    ref = max(v.max() for v in out.values())
    return {k: v - ref for k, v in out.items()}


def stems(path, dur):
    """Demucs htdemucs: drums, bass, vocals, other, as mono arrays at SR. None when Demucs fails."""
    try:
        import torch
        import demucs.api as dapi
        dev = "mps" if torch.backends.mps.is_available() else "cpu"
        sep = dapi.Separator(model="htdemucs", device=dev, progress=False, shifts=0)  # shifts=0: no random time shift, so the stems repeat run to run
        _, st = sep.separate_audio_file(str(path))
        return {k: librosa.resample(v.mean(dim=0).cpu().numpy(), orig_sr=sep.samplerate, target_sr=SR) for k, v in st.items()}
    except Exception as e:  # noqa: BLE001 - stems are optional; the rest of the analysis still runs
        print(f"stems skipped: {e}")
        return None


def onset_classes(drums, S_unused=None):
    """Drum hits from the drum stem, each classed by where its energy sits: kick, snare, hat or other."""
    S = np.abs(librosa.stft(drums, n_fft=1024, hop_length=256))
    f = librosa.fft_frequencies(sr=SR, n_fft=1024)
    env = librosa.onset.onset_strength(S=librosa.amplitude_to_db(S), sr=SR, hop_length=256)
    on = librosa.onset.onset_detect(onset_envelope=env, sr=SR, hop_length=256, units="frames", backtrack=False)
    out = []
    lo, mid, hi = f < 150, (f >= 150) & (f < 5000), f >= 6000
    peak = env.max() + 1e-9
    for i in on:
        seg = S[:, i: i + 4].sum(axis=1) ** 2
        e = np.array([seg[lo].sum(), seg[mid].sum(), seg[hi].sum()]) + 1e-12
        share = e / e.sum()
        flat = float(librosa.feature.spectral_flatness(S=S[:, i: i + 4]).mean())
        if share[0] > 0.55:
            c = "kick"
        elif share[2] > 0.5:
            c = "hat"
        elif share[1] > 0.45 and flat > 0.02:
            c = "snare"
        else:
            c = "other"
        out.append((i * 256 / SR, c, float(env[i] / peak)))
    return out


# ---------------------------------------------------------------- structure

def bar_features(mono, rh, starts, ends, S, freqs):
    """One vector a bar: chroma at beat resolution (4 x 12), timbre (13 MFCC) and level."""
    chroma = rh["_chroma"]
    mf = librosa.feature.mfcc(S=librosa.power_to_db(librosa.feature.melspectrogram(S=S ** 2, sr=SR)), n_mfcc=13)
    feats, chromas, tim = [], [], []
    for a, b in zip(starts, ends):
        fa, fb = int(a * FR), max(int(a * FR) + 1, int(b * FR))
        q = np.array_split(np.arange(fa, fb), 4)
        c = np.concatenate([chroma[:, x].mean(axis=1) if len(x) else np.zeros(12) for x in q])
        m = mf[:, fa:fb].mean(axis=1)
        chromas.append(c)
        tim.append(m)
    C, T = np.array(chromas), np.array(tim)
    T = (T - T.mean(axis=0)) / (T.std(axis=0) + 1e-9)
    return C, T


def cos_rows(A, B):
    A = A / (np.linalg.norm(A, axis=1, keepdims=True) + 1e-9)
    B = B / (np.linalg.norm(B, axis=1, keepdims=True) + 1e-9)
    return A @ B.T


def structure(C, T, bar_db, starts, ends, L, dur, drops):
    n = len(starts)
    # Self-similarity of bars: harmony (beat-level chroma, centred) and timbre, equally weighted.
    Cc = C - C.mean(axis=1, keepdims=True)
    SSM = 0.5 * cos_rows(Cc, Cc) + 0.5 * cos_rows(T, T)
    # Novelty: a checkerboard kernel 4 bars each side along the diagonal, plus level jumps.
    w = 4
    nov = np.zeros(n)
    for i in range(w, n - w + 1):
        A = SSM[i - w:i, i - w:i].mean() + SSM[i:i + w, i:i + w].mean()
        X = SSM[i - w:i, i:i + w].mean()
        lv = abs(np.mean(bar_db[i:i + 2]) - np.mean(bar_db[max(0, i - 2):i]))
        nov[i] = (A / 2 - X) + 0.04 * lv
    cut = nov.mean() + 0.6 * nov.std()
    bounds = [0]
    for i in np.argsort(nov)[::-1]:
        if nov[i] < cut:
            break
        if all(abs(i - b) >= 4 for b in bounds) and n - i >= 2:
            bounds.append(int(i))
    for d in drops:  # a drop always starts a section
        i = int(np.argmin(np.abs(starts - d)))
        if all(abs(i - b) >= 2 for b in bounds):
            bounds.append(i)
    bounds = sorted(bounds) + [n]
    secs = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        lv = 10 * np.log10(np.mean(10 ** (bar_db[a:b] / 10)))
        secs.append({"bars": [a + 1, b], "start": r(starts[a]), "end": r(ends[b - 1]), "lufs": r(lv, 1),
                     "_vec": np.r_[Cc[a:b].mean(axis=0), T[a:b].mean(axis=0)]})
    # Letters: sections with alike material share a letter.
    letters = []
    for s in secs:
        lab = None
        for j, o in enumerate(secs[: len(letters)]):
            if cos_rows(s["_vec"][None], o["_vec"][None])[0, 0] > 0.85:
                lab = letters[j]
                break
        letters.append(lab or chr(ord("A") + len(set(letters))))
    loud = np.percentile(bar_db, 75)
    for i, s in enumerate(secs):
        s["material"] = letters[i]
        prev = secs[i - 1]["lufs"] if i else None
        nxt = secs[i + 1]["lufs"] if i + 1 < len(secs) else None
        a, b = s["bars"][0] - 1, s["bars"][1]
        rise = np.polyfit(np.arange(b - a), bar_db[a:b], 1)[0] * (b - a) if b - a >= 2 else 0
        has_drop = any(s["start"] - L / 2 <= d <= s["start"] + L / 2 for d in drops)
        if has_drop or (prev is not None and s["lufs"] - prev >= 4 and s["lufs"] >= loud - 1.5):
            role = "drop"
        elif i == 0 and (nxt is None or s["lufs"] < nxt - 2):
            role = "intro"
        elif i == len(secs) - 1 and (prev is None or s["lufs"] < prev - 2 or rise < -4):
            role = "outro"
        elif prev is not None and s["lufs"] <= prev - 4:
            role = "break"
        elif nxt is not None and i + 1 < len(secs) and rise >= 2:
            role = "build"
        else:
            role = "body"
        s["role"] = role
        s["levelRiseDb"] = r(rise, 1)
    # A section that runs into a drop and rises is a build even when it is loud.
    for i in range(len(secs) - 1):
        if secs[i + 1]["role"] == "drop" and secs[i]["role"] in ("body", "intro") and secs[i]["levelRiseDb"] >= 1.5:
            secs[i]["role"] = "build"
    for s in secs:
        s.pop("_vec")
    return secs, SSM, nov


def repetition(C, T, starts, measured, bar_db=None):
    """How much of the track is one loop, whether new material arrives, and whether the melody changes or only moves in pitch.

    Blocks of 4 bars are compared on harmony and melody: beat-level chroma (16 beats x 12 notes), centred.
    Two blocks hold the same loop at a cosine of 0.85 or more. Timbre (MFCC) is compared apart: it tells an
    arrangement change (drums in or out) over the same loop from new material. A block that only matches an
    earlier one after its chroma is shifted is a transposed repeat: the same loop at another pitch.
    Near-silent blocks (under -40 LUFS) are left out."""
    n = len(starts) // 4
    if n < 2:
        return {"blocks": n, "loopShare": None, "note": "too short to judge"}
    keep = [i for i in range(n) if bar_db is None or np.mean(bar_db[4 * i:4 * i + 4]) > -40]
    Cb = np.array([C[4 * i:4 * i + 4].ravel() for i in range(n)])
    Tb = np.array([T[4 * i:4 * i + 4].ravel() for i in range(n)])
    Cb = Cb - Cb.mean(axis=1, keepdims=True)
    sim = cos_rows(Cb, Cb)
    tim = cos_rows(Tb, Tb)

    def shifted(i, j):
        a = C[4 * i:4 * i + 4].reshape(-1, 12)
        b = C[4 * j:4 * j + 4].reshape(-1, 12)
        best = (-1.0, 0)
        for k in range(12):
            bb = np.roll(b, k, axis=1)
            s = cos_rows((a - a.mean()).ravel()[None], (bb - bb.mean()).ravel()[None])[0, 0]
            if s > best[0]:
                best = (float(s), k)
        return best

    clusters, label = [], [-1] * n
    for i in keep:
        for c, rep in enumerate(clusters):
            if sim[i, rep] >= 0.85:
                label[i] = c
                break
        else:
            label[i] = len(clusters)
            clusters.append(i)
    counts = np.bincount([label[i] for i in keep], minlength=len(clusters))
    order = np.argsort(counts)[::-1]
    nk = len(keep)
    repeats = sum(1 for i in keep if any(sim[i, j] >= 0.85 for j in keep if j < i))
    transposed = []
    for c, rep in enumerate(clusters[1:], start=1):
        for c0 in range(c):
            r0 = clusters[c0]
            s, k = shifted(rep, r0)
            if k and s >= 0.85 and sim[rep, r0] < 0.7:
                transposed.append({"block": c, "like": c0, "semitones": int(k if k <= 6 else k - 12), "similarity": r(s, 2)})
                break
    # Arrangement: blocks of one loop whose timbre differs (cosine under 0.6) mark an arrangement change.
    arrangement = 0
    for c in range(len(clusters)):
        mem = [i for i in keep if label[i] == c]
        arrangement += sum(1 for a, b in zip(mem, mem[1:]) if tim[a, b] < 0.6)
    entries = [{"bar": int(4 * clusters[c] + 1), "t": r(starts[4 * clusters[c]]), "material": c} for c in range(1, len(clusters))]
    Cc = C - C.mean(axis=1, keepdims=True)
    barsim = cos_rows(Cc, Cc)
    rep = [max(barsim[i, i - 4] if i >= 4 else -1, barsim[i, i - 8] if i >= 8 else -1) >= 0.85 for i in range(len(starts))]
    lagshare = float(np.mean(rep[4:])) if len(rep) > 4 else 0
    return {
        "blocks": n, "blockBars": 4, "distinctBlocks": len(clusters),
        "loopShare": r(counts[order[0]] / nk, 2), "topTwoShare": r(counts[order[:2]].sum() / nk, 2),
        "repeatShare": r(repeats / nk, 2),
        "mainLoop": {"material": int(order[0]), "firstBar": int(4 * clusters[order[0]] + 1), "blocks": int(counts[order[0]])},
        "lagRepeatShare": r(lagshare, 2), "transposedRepeats": transposed,
        "distinctAfterTransposition": len(clusters) - len(transposed), "arrangementChanges": arrangement,
        "newMaterial": entries, "blockLabels": label,
        "method": "4-bar blocks; beat-level chroma cosine >= 0.85 is the same loop (harmony and melody); "
                  "a chroma shift match >= 0.85 where the plain match is under 0.7 is a transposition; timbre (MFCC) under 0.6 inside a loop is an arrangement change",
    }


# ---------------------------------------------------------------- energy, tension, events

def tension_curve(S, freqs, oenv, mom_ts, mom, dur):
    n = int(np.ceil(dur / STEP))
    t = np.arange(n) * STEP
    cen = librosa.feature.spectral_centroid(S=S, sr=SR)[0]
    fi = np.minimum((np.arange(len(cen)) / FR / STEP).astype(int), n - 1)
    cnt = np.maximum(1, np.bincount(fi, minlength=n))
    c = np.bincount(fi, weights=cen, minlength=n) / cnt
    dens = np.bincount(fi, weights=oenv, minlength=n) / cnt
    hi = S[freqs >= 4000].sum(axis=0)
    h = 10 * np.log10(np.bincount(fi, weights=hi, minlength=n) / cnt + 1e-10)
    lv = np.interp(t, mom_ts, mom)

    def z(x):
        x = sps.medfilt(x, 3)
        return (x - x.mean()) / (x.std() + 1e-9)

    # Tension: brightness, onset density and high band, each against the track, plus the 4 s rise in level.
    slope = np.r_[np.zeros(8), lv[8:] - lv[:-8]]
    raw = 0.35 * z(c) + 0.25 * z(dens) + 0.2 * z(h) + 0.2 * z(slope)
    raw = np.convolve(raw, np.ones(3) / 3, "same")
    ten = (raw - raw.min()) / (raw.max() - raw.min() + 1e-9)
    return t, lv, ten, c, dens


def drops_of(lo, downbeats, dur, bar_len, low_db):
    """A drop: a downbeat where the 2 s after are 6 dB or more louder than the 2 s before, not out of silence;
    or 3 dB louder while the low end (20-250 Hz) rises 6 dB or more (the bass and kick arrive)."""
    out = []
    for d in downbeats:
        if d < 2 or d > dur - 2:
            continue
        before, after = lo.window(d - 2, d), lo.window(d, d + 2)
        if before < -45:
            continue
        i = int(d / STEP)
        lrise = float(np.mean(low_db[i:i + 4]) - np.mean(low_db[max(0, i - 4):i]))
        if after - before >= 6 or (after - before >= 3 and lrise >= 6):
            out.append((float(d), after - before))
    keep = []
    for d, s in sorted(out, key=lambda x: -x[1]):
        if all(abs(d - k[0]) > 4 * bar_len for k in keep):
            keep.append((d, s))
    return sorted(keep)


def builds_of(t, lv, ten, cen, dens, targets, beat):
    """Builds that end on a drop or a section start: a rise in tension over 1.5 s or more. Classed as a riser
    (brightness climbs), a roll (onset density doubles) or a level swell."""
    out = []
    for T0 in targets:
        j = int(T0 / STEP)
        if j < 4:
            continue
        i = j - 1
        while i > max(0, j - 32) and ten[i - 1] <= ten[i] + 0.02:
            i -= 1
        length = (j - i) * STEP
        rise = float(ten[j - 1] - ten[i])
        if length < 1.5 or rise < 0.15:
            continue
        kinds = []
        if cen[j - 1] > cen[i] * 1.3:
            kinds.append("riser or filter sweep (brightness climbs)")
        last = dens[max(i, j - 4):j].mean()
        early = dens[i:max(i + 1, j - 4)].mean()
        if last > 1.8 * early:
            kinds.append("roll (onsets get denser)")
        if lv[j - 1] - lv[i] >= 4:
            kinds.append(f"level swell (+{lv[j - 1] - lv[i]:.0f} dB)")
        out.append({"start": r(i * STEP, 2), "end": r(T0, 2), "strength": r(rise, 2), "kinds": kinds or ["tension rises"]})
    return out


# ---------------------------------------------------------------- harmony

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


# Key profiles: how much each pitch class sounds in a major or a minor key, from listening tests.
KEY_PROFILES = {
    "krumhansl": ((6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88),
                  (6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17)),
    "temperley": ((5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0),
                  (5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0)),
}
FLATS = {"C#": "Db", "D#": "Eb", "G#": "Ab", "A#": "Bb"}


def key_scores(chroma, profile):
    """Pearson r of the mean chroma with each of the 24 key profiles, best first: (r, root, mode)."""
    scores = []
    for mode, prof in zip(("major", "minor"), KEY_PROFILES[profile]):
        for root in range(12):
            scores.append((float(np.corrcoef(chroma, np.roll(prof, root))[0, 1]), root, mode))
    return sorted(scores, reverse=True)


def key_name(root):
    return FLATS.get(NOTES[root], NOTES[root])


def choose_key(chroma, chords, bass_notes):
    """The key from three kinds of evidence, as a listener hears a home note:
    - the profile fit of the mean chroma (Krumhansl-Kessler), which alone confuses a key with its relative, its
      mediant and its parallel;
    - the share of bars whose chord is the key's tonic triad;
    - the share of bar starts whose bass note is the key's tonic.
    Score = r + 3.0 x tonic-chord share + 0.25 x bass-tonic share, over the 8 keys with the best profile fit.
    The weights were set on the 22 lab tracks: the home chord decides between close profile fits; the bass at bar
    starts only breaks ties (it is often a pedal on the fifth). Trust: medium; the chords are a rough reading."""
    ks = key_scores(chroma, "krumhansl")[:8]
    nb = max(1, len(chords))

    def tonic(rt, md):
        return chords.count(NOTES[rt] + ("" if md == "major" else "m")) / nb

    def btonic(rt):
        return bass_notes.count(rt) / max(1, len(bass_notes))
    scored = sorted(((k[0] + 3.0 * tonic(k[1], k[2]) + 0.25 * btonic(k[1]), k) for k in ks), reverse=True)
    best, nxt = scored[0][1], scored[1]
    k2 = key_scores(chroma, "temperley")[0]
    return {"key": key_name(best[1]), "mode": best[2], "strength": r(best[0], 2), "score": r(scored[0][0], 2),
            "margin": r(scored[0][0] - nxt[0], 2), "tonicChordShare": r(tonic(best[1], best[2]), 2),
            "bassTonicShare": r(btonic(best[1]), 2), "profileBest": f"{key_name(ks[0][1])} {ks[0][2]}",
            "chosenByChords": best != ks[0],
            "agrees": bool(key_name(k2[1]) == key_name(best[1]) and k2[2] == best[2]), "second": f"{key_name(k2[1])} {k2[2]}",
            "method": "profile fit on tuned chroma of the harmonic part (Krumhansl-Kessler) + 3.0 x the share of bars on the tonic "
                      "triad + 0.25 x the share of bar starts with the tonic in the bass, over the 8 best profile fits"}


def harmony(st, C, starts):
    # A chord a bar: the best major or minor triad template on the bar's chroma.
    bar_chroma = C.reshape(len(C), 4, 12).mean(axis=1)
    tmpl, names = [], []
    for root in range(12):
        for q, iv in (("", (0, 4, 7)), ("m", (0, 3, 7))):
            v = np.zeros(12)
            v[[(root + x) % 12 for x in iv]] = 1
            tmpl.append(v / np.linalg.norm(v))
            names.append(NOTES[root] + q)
    tmpl = np.array(tmpl)
    bc = bar_chroma / (np.linalg.norm(bar_chroma, axis=1, keepdims=True) + 1e-9)
    sc = bc @ tmpl.T
    chords = [names[i] for i in sc.argmax(axis=1)]
    fit = sc.max(axis=1)
    key = None
    try:
        # Tuned chroma of the harmonic part: drums smear every pitch class and pull the key to the kick's note.
        mono = librosa.resample(st.mean(axis=0), orig_sr=LSR, target_sr=SR)
        harm = librosa.effects.harmonic(mono, margin=4)
        tuning = float(librosa.estimate_tuning(y=harm, sr=SR))
        chroma = librosa.feature.chroma_cqt(y=harm, sr=SR, hop_length=HOP, tuning=tuning).mean(axis=1)
        # The bass note at each bar start: the strongest pitch class from C1 to C4 over the bar's first quarter.
        bass = librosa.feature.chroma_cqt(y=harm, sr=SR, hop_length=HOP, tuning=tuning, fmin=librosa.note_to_hz("C1"), n_octaves=3)
        ends = list(starts[1:]) + [len(harm) / SR]
        bass_notes = []
        for a0, b0 in zip(starts, ends):
            f0, f1 = int(a0 * FR), max(int(a0 * FR) + 1, int((a0 + (b0 - a0) / 4) * FR))
            seg = bass[:, f0:f1]
            if seg.size and seg.sum() > 0:
                bass_notes.append(int(seg.mean(axis=1).argmax()))
        key = choose_key(chroma, chords, bass_notes)
    except Exception as e:  # noqa: BLE001
        key = {"key": None, "error": str(e)}
    changes = sum(1 for a, b in zip(chords, chords[1:]) if a != b)
    uniq = sorted(set(chords), key=chords.index)
    return {"key": key, "chordPerBar": chords, "chordFit": [r(x, 2) for x in fit], "chordChanges": changes,
            "distinctChords": uniq[:16], "chordConfidence": "low" if np.median(fit) < 0.75 else "medium",
            "chordMethod": "triad templates on the bar's mean chroma (CQT); a rough guide, not a transcription"}


# ---------------------------------------------------------------- character (CLAP)

_CLAP = None


def clap():
    global _CLAP
    if _CLAP is None:
        from transformers import ClapModel, ClapProcessor
        name = "laion/clap-htsat-unfused"
        _CLAP = (ClapModel.from_pretrained(name).eval(), ClapProcessor.from_pretrained(name))
    return _CLAP


def clap_audio(st, windows):
    import torch
    m, p = clap()
    y48 = librosa.resample(st.mean(axis=0), orig_sr=LSR, target_sr=48000)
    clips = [y48[int(a * 48000):int(b * 48000)] for a, b in windows]
    with torch.no_grad():
        a = m.get_audio_features(**p.feature_extractor(clips, sampling_rate=48000, return_tensors="pt"))
    a = a / a.norm(dim=-1, keepdim=True)
    return a.numpy()


def clap_text(texts):
    import torch
    m, p = clap()
    with torch.no_grad():
        t = m.get_text_features(**p.tokenizer(texts, return_tensors="pt", padding=True))
    t = t / t.norm(dim=-1, keepdim=True)
    return t.numpy()


def clap_words(category, words):
    """One text embedding a word: the mean of its prompt sentences (vocab.prompts), normalised."""
    from vocab import prompts
    out = []
    for w in words:
        e = clap_text(prompts(category, w)).mean(axis=0)
        out.append(e / np.linalg.norm(e))
    return np.array(out)


def character(st, sections, dur):
    from vocab import VOCAB
    # Windows of 10 s: the middle of each section of 6 s or more (at most 8), so the tags hear the whole track.
    wins = []
    for s in sections:
        a, b = s["start"], s["end"]
        if b - a >= 6:
            c = (a + b) / 2
            wins.append((max(0, c - 5), min(dur, c + 5), s))
    if not wins:
        wins = [(0, min(dur, 10), None)]
    if len(wins) > 8:
        wins = sorted(wins, key=lambda w: -(w[1] - w[0]))[:8]
        wins.sort(key=lambda w: w[0])
    A = clap_audio(st, [(a, b) for a, b, _ in wins])
    mean = A.mean(axis=0)
    mean = mean / np.linalg.norm(mean)
    tags = {}
    for cat, words in VOCAB.items():
        T = clap_words(cat, words)
        s = T @ mean
        z = (s - s.mean()) / (s.std() + 1e-9)
        order = np.argsort(s)[::-1]
        tags[cat] = [{"tag": words[i], "score": r(s[i], 3), "z": r(z[i], 2)} for i in order]
    # The mood of each section window, for the timeline.
    moods = VOCAB["mood"]
    Tm = clap_words("mood", moods)
    per = []
    for (a, b, s), e in zip(wins, A):
        sc = Tm @ e
        top = np.argsort(sc)[::-1][:3]
        per.append({"start": r(a, 1), "end": r(b, 1), "moods": [moods[i] for i in top]})
    return {"tags": tags, "perSection": per, "embedding": [round(float(v), 4) for v in mean],
            "model": "laion/clap-htsat-unfused (zero-shot cosine; z is against the other words in the category)",
            "trust": "medium: zero-shot tags rank words well for broad genre and mood; scores near each other mean little"}


def danceability(st):
    """How steady the pulse of the loudness is (Streich and Herrera, 2005): detrended fluctuation analysis of the
    level envelope. Music with a strong, regular beat gives a low DFA exponent at beat scales, so a high value here."""
    try:
        x = librosa.resample(st.mean(axis=0), orig_sr=LSR, target_sr=SR)
        fr = int(0.010 * SR)
        n = len(x) // fr
        env = x[:n * fr].reshape(n, fr).std(axis=1)          # level every 10 ms
        y = np.cumsum(env - env.mean())
        taus = np.unique(np.round(np.geomspace(31, 880, 36) / 10).astype(int))   # windows of 310 ms to 8.8 s
        F = []
        for tau in taus:
            m = len(y) // tau
            if m < 4:
                break
            seg = y[:m * tau].reshape(m, tau)
            t = np.arange(tau) - (tau - 1) / 2
            slope = (seg * t).sum(axis=1) / (t ** 2).sum()
            res = seg - seg.mean(axis=1, keepdims=True) - slope[:, None] * t
            F.append(np.sqrt((res ** 2).mean()))
        F = np.array(F)
        lt, lf = np.log10(taus[:len(F)]), np.log10(F + 1e-12)
        alphas = np.diff(lf) / np.diff(lt)
        alphas = alphas[np.isfinite(alphas) & (alphas > 0.05)]
        d = float(1 / alphas.mean()) if len(alphas) else 0.0
        return {"value": r(d, 2), "scale": "about 0.7 to 1.4 here (the inverse of the mean DFA exponent of the level envelope); higher is a steadier pulse",
                "trust": "low: on 22 tracks it agreed weakly with an earlier DFA implementation (Pearson r 0.21); "
                         "for cutting, use the pulse clarity and the share of kicks on the beat"}
    except Exception as e:  # noqa: BLE001
        return {"value": None, "error": str(e)}


# ---------------------------------------------------------------- entry points

def entry_points(starts, ends, bar_db, sections, drops, rep_labels, dur, lo, length):
    """Ranked entry points for a film of `length` seconds: start on a bar, end inside the track, a hook in the
    first 2 s, the drop or the loudest bar 30-75 % of the way in, new material inside, and an end on a section edge."""
    out = []
    sec_starts = np.array([s["start"] for s in sections])
    sec_ends = np.array([s["end"] for s in sections])
    for i, a in enumerate(starts):
        b = a + length
        if b > dur:
            break
        why, score = [], 0.0
        open_lv = lo.window(a, a + 2)
        peak_lv = max(bar_db) if len(bar_db) else -20
        if open_lv >= peak_lv - 8:
            score += 1
            why.append(f"opens loud ({open_lv:.0f} LUFS in the first 2 s)")
        elif open_lv < peak_lv - 14:
            score -= 1
            why.append(f"opens quiet ({open_lv:.0f} LUFS)")
        if np.min(np.abs(sec_starts - a)) < 0.3:
            score += 0.5
            why.append("starts on a section edge")
        ds = [d for d in drops if a + 0.3 * length <= d[0] <= a + 0.75 * length]
        if ds:
            score += 2
            why.append(f"the drop lands {ds[0][0] - a:.1f} s in (+{ds[0][1]:.0f} dB)")
        else:
            inside = [(bar_db[j], starts[j]) for j in range(len(starts)) if a + 0.3 * length <= starts[j] <= a + 0.75 * length]
            if inside and max(inside)[0] >= peak_lv - 1.5:
                score += 1
                why.append(f"a loudest bar lands {max(inside)[1] - a:.1f} s in")
        blocks = {rep_labels[j // 4] for j in range(len(starts)) if a <= starts[j] < b and j // 4 < len(rep_labels)}
        if len(blocks) >= 2:
            score += 0.5 * min(3, len(blocks) - 1)
            why.append(f"{len(blocks)} kinds of 4-bar material inside")
        else:
            why.append("one loop for the whole window")
        if np.min(np.abs(sec_ends - b)) < 0.6 or np.min(np.abs(ends - b)) < 0.05:
            score += 0.5
            why.append("ends on a bar or section edge (fade under the last card)")
        out.append({"from": r(a, 3), "to": r(b, 3), "bar": i + 1, "score": r(score, 2), "why": why})
    out.sort(key=lambda e: -e["score"])
    pick = []
    for e in out:  # keep different places in the track
        if all(abs(e["from"] - p["from"]) > length / 2 for p in pick):
            pick.append(e)
        if len(pick) == 3:
            break
    return pick


# ---------------------------------------------------------------- validation

def uses_hyperframes():
    """True when the project renders with HyperFrames: a hyperframes.json, or a package.json that names hyperframes, in
    the working folder or a folder above it (the work tree of untell sits inside the project)."""
    for d in [Path.cwd(), *Path.cwd().parents][:6]:
        if (d / "hyperframes.json").exists():
            return True
        pj = d / "package.json"
        if pj.exists():
            try:
                if "hyperframes" in pj.read_text():
                    return True
            except OSError:
                pass
    return False


def hyperframes(path):
    hf = hyperframes_cli()
    if not hf:
        # The cross-check is optional. Name the setting only to a project that renders with HyperFrames.
        print(f"cross-check skipped: no HyperFrames CLI (set {HF_ENV} to its path, or put hyperframes on PATH)" if uses_hyperframes()
              else "cross-check skipped", file=sys.stderr)
        return None
    env = {**os.environ, "HYPERFRAMES_NO_TELEMETRY": "1", "DO_NOT_TRACK": "1"}
    p = subprocess.run([hf, "audio", str(path), "--only=beats,downbeats,bpm,loudness,moments", "--json"], capture_output=True, text=True, env=env, timeout=600)
    try:
        return json.loads(p.stdout)["items"][0]
    except Exception:  # noqa: BLE001
        return None


def validate(hf, rh, dyn):
    if not hf:
        return {"hyperframes": "not available"}
    hb = np.asarray(hf.get("beats", {}).get("times", []))
    mine = np.asarray(rh["beats"], dtype=float)
    out = {"hyperframesBpm": hf.get("bpm", {}).get("value"), "bpm": rh["bpm"],
           "hyperframesLufs": hf.get("loudness", {}).get("lufsIntegrated"), "lufs": dyn["lufsIntegrated"],
           "hyperframesTruePeak": hf.get("loudness", {}).get("truePeakDb"), "truePeak": dyn["truePeakDb"]}
    if len(hb) and len(mine):
        off = np.array([np.abs(mine - t).min() for t in hb])
        out["beatsWithin50ms"] = r(np.mean(off <= 0.05), 2)
        out["beatOffsetMedianMs"] = r(np.median(off) * 1000, 1)
        # A grid on the off-beat matches at half a beat; say so.
        half = 30 / rh["bpm"]
        out["beatsOnOffbeat"] = r(np.mean(np.abs(off - half) <= 0.05), 2)
        out["hyperframesBeatsFrom"] = r(hb[0], 2)
    return out


# ---------------------------------------------------------------- the whole analysis

def analyse(path, use_stems=True, use_clap=True):
    path = Path(path)
    st, mono = load(path)
    dur = len(mono) / SR
    lo = Loudness(st)
    dyn = dynamics(st, mono, lo, dur)
    S, freqs = spectra(mono)
    stem = stems(path, dur) if use_stems else None
    cls = onset_classes(stem["drums"]) if stem else []
    kicks = np.array([t0 for t0, c, s in cls if c == "kick" and s > 0.15])
    rh = rhythm(mono, S, freqs, dur, kicks if len(kicks) else None)
    starts, ends, measured, L = bars_of(rh, dur)
    bar_lufs = np.array([lo.window(a, b) for a, b in zip(starts, ends)])
    pk = peak_curve(st)
    bar_tp = [20 * np.log10(pk[int(a * 10):max(int(a * 10) + 1, int(b * 10))].max() + 1e-12) for a, b in zip(starts, ends)]
    mom_ts, mom = lo.curve(0.4, 0.1, dur)
    bands = bands_curve(S, freqs, dur)
    low_db = 10 * np.log10(10 ** (bands["sub"] / 10) + 10 ** (bands["bass"] / 10))
    drops = drops_of(lo, rh["downbeats"], dur, L, low_db)
    C, T = bar_features(mono, rh, starts, ends, S, freqs)
    secs, SSM, nov = structure(C, T, bar_lufs, starts, ends, L, dur, [d for d, _ in drops])
    rep = repetition(C, T, starts, measured, bar_lufs)
    t, lv, ten, cen, dens = tension_curve(S, freqs, rh["_oenv"], mom_ts, mom, dur)
    builds = builds_of(t, lv, ten, cen, dens, sorted({d for d, _ in drops} | {s["start"] for s in secs if s["start"] > 2}), 60 / rh["bpm"])
    # The phone speaker: a small speaker gives little under about 200 Hz.
    hp = sps.sosfilt(sps.butter(4, 200, "highpass", fs=LSR, output="sos"), st, axis=1)
    phone = float(pyloudnorm.Meter(LSR).integrated_loudness(hp.T))
    mid, side = st.mean(axis=0), (st[0] - st[1]) / 2
    width = db(side) - db(mid)
    corr = float(np.corrcoef(st[0], st[1])[0, 1]) if st[0].std() > 0 and st[1].std() > 0 else 1.0
    harm = harmony(st, C, starts)
    # Stems.
    stem_out = None
    if stem:
        n = int(np.ceil(dur / STEP))
        stem_out = {"model": "Demucs htdemucs (MIT, ~80 MB)", "step": STEP, "envelopes": {}, "presence": {}, "events": []}
        mixdb = np.array([db(mono[int(a * SR):int(b * SR)]) for a, b in zip(starts, ends)])
        for name, y in stem.items():
            env = [r(db(y[int(i * STEP * SR):int((i + 1) * STEP * SR)]), 1) for i in range(n)]
            stem_out["envelopes"][name] = env
            bd = np.array([db(y[int(a * SR):int(b * SR)]) for a, b in zip(starts, ends)])
            ref = np.percentile(bd, 95)
            on = (bd >= max(ref - 20, -50)) & (bd >= mixdb - 18)
            # Smooth: one bar on or off alone does not count.
            on = sps.medfilt(on.astype(float), 3) > 0.5 if len(on) >= 3 else on
            stem_out["presence"][name] = [bool(x) for x in on]
            for i in range(len(on)):
                if on[i] and (i == 0 or not on[i - 1]):
                    stem_out["events"].append({"t": r(starts[i]), "bar": i + 1, "stem": name, "event": "enters" if i else "present from the start"})
                if not on[i] and i and on[i - 1]:
                    stem_out["events"].append({"t": r(starts[i]), "bar": i + 1, "stem": name, "event": "leaves"})
        stem_out["events"].sort(key=lambda e: e["t"])
        vb = np.array(stem_out["presence"]["vocals"])
        vshare = float(np.mean(vb)) if len(vb) else 0
        stem_out["vocals"] = {"present": bool(vb.sum() >= 4), "barShare": r(vshare, 2),
                              "trust": "medium: htdemucs leaks lead synths into vocals; check the CLAP 'vocals' tag too"}
        per_bar = []
        for a, b in zip(starts, ends):
            sel = [c for t0, c, s in cls if a <= t0 < b and s > 0.15]
            per_bar.append({k: sel.count(k) for k in ("kick", "snare", "hat", "other")})
        stem_out["drumHits"] = {"counts": {k: sum(p[k] for p in per_bar) for k in ("kick", "snare", "hat", "other")}, "perBar": per_bar,
                                "method": "drum stem onsets, classed by band share (kick < 150 Hz, hat > 6 kHz, snare a noisy mid)"}
        kicks = np.array([t0 for t0, c, s in cls if c == "kick" and s > 0.15])
        beats = np.asarray(rh["beats"], dtype=float)
        if len(kicks) > 8:
            on_beat = np.mean([np.abs(beats - k).min() <= 0.04 for k in kicks])
            per_beat = len(kicks) / max(1, len(beats))
            stem_out["drumHits"]["kickOnBeatShare"] = r(on_beat, 2)
            stem_out["drumHits"]["fourOnTheFloor"] = bool(on_beat > 0.8 and per_beat > 0.6)
        # Phone view of the drums: how much of the kit is above 200 Hz.
        d = stem["drums"]
        dh = sps.sosfilt(sps.butter(4, 200, "highpass", fs=SR, output="sos"), d)
        stem_out["drumsAbove200HzDb"] = r(db(dh) - db(d), 1)
        b = stem["bass"]
        bh = sps.sosfilt(sps.butter(4, 200, "highpass", fs=SR, output="sos"), b)
        stem_out["bassAbove200HzDb"] = r(db(bh) - db(b), 1)
    stem = None
    import gc
    gc.collect()
    char = character(st, secs, dur) if use_clap else None
    hf = hyperframes(path)
    val = validate(hf, rh, dyn)
    entries = {"short": entry_points(starts, ends, bar_lufs, secs, drops, rep.get("blockLabels", []), dur, lo, 15.0),
               "long": entry_points(starts, ends, bar_lufs, secs, drops, rep.get("blockLabels", []), dur, lo, 38.0)}
    loud_order = np.argsort(bar_lufs)[::-1]
    strong = [(t0, s) for t0, s in zip(rh["_peaks"], interp(rh["_oenv"], rh["_peaks"]))]
    smax = max([s for _, s in strong] or [1])
    strong = sorted([(t0, s / smax) for t0, s in strong if s / smax >= 0.3], key=lambda x: -x[1])[:400]
    out = {
        "file": path.name, "duration": r(dur, 3), "version": 2,
        "rhythm": {k: v for k, v in rh.items() if not k.startswith("_")},
        "bars": [{"i": i + 1, "start": r(a), "end": r(b), "lufs": r(l, 1), "truePeak": r(p, 1), "measured": bool(m)}
                 for i, (a, b, l, p, m) in enumerate(zip(starts, ends, bar_lufs, bar_tp, measured))],
        "barLength": r(L, 3),
        "loudestBars": [int(i + 1) for i in loud_order[: max(1, len(starts) // 4)]],
        "sections": secs,
        "repetition": rep,
        "drops": [{"t": r(d), "riseDb": r(s, 1), "bar": int(np.argmin(np.abs(starts - d)) + 1)} for d, s in drops],
        "builds": builds,
        "onsets": [{"t": r(t0), "strength": r(s, 2)} for t0, s in sorted(strong)],
        "curves": {"step": STEP, "lufsMomentary": [r(v, 1) for v in lv], "tension": [r(v, 2) for v in ten],
                   "centroidHz": [r(v, 0) for v in cen], "onsetDensity": [r(v, 2) for v in dens],
                   "bands": {k: [r(x, 1) for x in v] for k, v in bands.items()}},
        "spectrum": {"centroidHz": r(float(np.mean(cen)), 0), "bandsMeanDb": {k: r(float(10 * np.log10(np.mean(10 ** (v / 10)))), 1) for k, v in bands.items()},
                     "phone": {"lufsAbove200Hz": r(phone, 1), "lossDb": r(dyn["lufsIntegrated"] - phone, 1),
                               "note": "a phone speaker plays little under about 200 Hz; a large loss means the track leans on sub and bass"},
                     "stereo": {"sideToMidDb": r(width, 1), "correlation": r(corr, 2)}},
        "harmony": harm,
        "stems": stem_out,
        "dynamics": dyn,
        "character": char,
        "danceability": danceability(st),
        "entryPoints": entries,
        "validation": val,
        "_ssm": SSM, "_novelty": nov,
    }
    return out
