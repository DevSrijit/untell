"""listen.png: one picture of a track, drawn as an instrument panel that a model can read at about 1800 px wide.

Lanes, top to bottom, on one time axis:
1. Sections: a labelled band for each, with its role, its material letter and its bars.
2. Spectrum: the mel spectrogram, with a tick on every downbeat at its top edge.
3. Loudness (momentary LUFS) and tension (0 to 1), each labelled at its end; builds as labelled spans.
4. Energy per band: one small lane for each band, sub to air, in dB.
5. Stems (only when measured): drums, bass, other, vocals; filled where the stem plays.
6. Entry points: the ranked windows for a 15 s and a 38 s film, with their times.
Drops are marks through every lane, each with its time and its rise. Whatever was not measured is named in one line at
the foot, never drawn as an empty lane.

Usage (the listen tool calls draw()): python plot.py <listen.json> <audio> <out.png> [--theme dark|light]
The theme is dark unless --theme or UNTELL_THEME says light.
"""
import os
import sys
from pathlib import Path

import librosa
import numpy as np
from PIL import Image, ImageDraw, ImageFont

# untell's picture style. The same block opens scripts/review_sheet.py; keep the two in step, so the tools read as
# one product: one sans for words and one mono for numbers (Geist and Geist Mono, SIL OFL, the kit's own font
# files), one palette for each theme, an 8 px unit, and one way to mark a fault: a bar over its time in the fault
# colour, with its symbol and rule id ("x" an error, "!" a warning), so colour is never the only signal.
THEMES = {
    "dark": dict(bg=(13, 14, 16), panel=(20, 22, 25), well=(9, 10, 12), rule=(46, 49, 54), grid=(31, 34, 38),
                 ink=(236, 237, 238), muted=(142, 147, 153), faint=(84, 89, 96), accent=(112, 170, 255),
                 error=(255, 99, 86), warn=(240, 180, 66), tagbg=(0, 0, 0), wave=(112, 117, 124)),
    "light": dict(bg=(248, 248, 246), panel=(255, 255, 255), well=(240, 240, 237), rule=(216, 216, 212), grid=(230, 230, 226),
                  ink=(22, 22, 22), muted=(104, 104, 104), faint=(178, 178, 173), accent=(36, 102, 222),
                  error=(214, 46, 36), warn=(176, 112, 20), tagbg=(255, 255, 255), wave=(150, 150, 146)),
}
U = 8  # the spacing unit, px
S = 2  # drawn at twice the size, then scaled down: smooth lines and type


def _font_file(name):
    """A kit font file by name: the package's registry/fonts, else the repository's @fontsource packages, else None."""
    here = Path(__file__).resolve().parent
    family = name.split("-latin-")[0]
    roots = [Path(p) for p in [os.environ.get("UNTELL_FONTS", "")] if p] + [
        here.parent / "fonts", here.parent.parent / "fonts",
        here.parent / "node_modules" / "@fontsource" / family / "files", here.parent.parent / "node_modules" / "@fontsource" / family / "files"]
    for root in roots:
        if (root / name).exists():
            return root / name
    return None


def font(kind, size):
    name = {"sans": "geist-latin-500-normal.woff2", "bold": "geist-latin-600-normal.woff2", "mono": "geist-mono-latin-400-normal.woff2"}[kind]
    f = _font_file(name)
    try:
        return ImageFont.truetype(str(f), size) if f else ImageFont.load_default(size)
    except (OSError, TypeError):
        return ImageFont.load_default()


def mix(a, b, t):
    """The colour t of the way from a to b."""
    return tuple(int(round(x + (y - x) * t)) for x, y in zip(a, b))


def s(v):
    return int(round(v * S))


def draw(d, path, out, theme=None):
    C = THEMES[theme or os.environ.get("UNTELL_THEME") or "dark"]
    y, sr = librosa.load(str(path), sr=22050, mono=True)
    dur = float(d["duration"])
    rh, c = d["rhythm"], d["curves"]
    stems = d.get("stems")
    F_TITLE, F_FACT, F_LABEL, F_NUM, F_TAG = font("bold", s(22)), font("mono", s(12)), font("sans", s(12)), font("mono", s(11)), font("mono", s(11))

    WIDTH, PAD, GUT = 1800, 3 * U, 12 * U
    PW = WIDTH - 2 * PAD - GUT  # the plot width
    X0 = PAD + GUT
    BANDS = list(c["bands"])
    lanes = [("sections", 5 * U), ("spectrum", 36 * U), ("loudness", 19 * U), ("bands", 4 * U * len(BANDS) + U)]
    if stems:
        lanes.append(("stems", 4 * U * 4))
    ER = 2 * U + 4  # one row for each ranked window
    n_entry = sum(len(d["entryPoints"][k]) for k in ("short", "long"))
    lanes.append(("entry points", ER * n_entry + U))
    HEAD = 10 * U
    GAP = U
    AXIS = 4 * U
    missing = ([] if stems else ["stems (drums, bass, other, vocals)"]) + ([] if d.get("character") else ["character tags"])
    FOOT = 4 * U if missing else 0
    total = PAD + HEAD + sum(h for _, h in lanes) + GAP * (len(lanes) - 1) + AXIS + FOOT + PAD
    img = Image.new("RGB", (s(WIDTH), s(total)), C["bg"])
    g = ImageDraw.Draw(img)

    def text(xy, t, f, fill, anchor="la"):
        g.text((s(xy[0]), s(xy[1])), t, font=f, fill=fill, anchor=anchor)

    def tx(t):
        return X0 + t / dur * PW

    # Header: the name, then the facts in mono.
    key = d["harmony"].get("key") or {}
    dyn = d["dynamics"]
    text((PAD, PAD), d.get("name") or Path(str(path)).stem, F_TITLE, C["ink"])
    facts = [f"{rh['bpm']:.1f} BPM", f"{rh['confidence']} confidence", f"{key.get('key') or '?'} {key.get('mode') or ''}".strip(),
             f"{dyn['lufsIntegrated']:.1f} LUFS", f"range {dyn['loudnessRange']:.1f} LU", f"true peak {dyn['truePeakDb']:.1f} dBTP",
             f"repeat share {d['repetition'].get('repeatShare')}", f"{dur:.1f} s"]
    text((PAD, PAD + 4 * U + 2), "   ·   ".join(facts).replace("-", "−"), F_FACT, C["muted"])

    y0 = PAD + HEAD
    top = {}
    for name, h in lanes:
        top[name] = y0
        title = {"bands": "bands, dB", "loudness": "loudness"}.get(name, name)
        text((PAD, y0 + (h / 2 if name not in ("bands", "stems", "entry points") else 2 * U)), title, F_LABEL, C["muted"], anchor="lm")
        if name not in ("bands", "stems"):
            g.rectangle([s(X0), s(y0), s(X0 + PW), s(y0 + h)], fill=C["panel"])
        y0 += h + GAP
    plot_bottom = y0 - GAP

    # 1. Sections.
    sy, sh = top["sections"], lanes[0][1]
    tint = {"drop": C["accent"], "build": C["warn"]}
    for k, sec in enumerate(d["sections"]):
        xa, xb = tx(sec["start"]), tx(sec["end"])
        base = mix(C["panel"], C["ink"], 0.06 if k % 2 else 0.11)
        fill = mix(C["panel"], tint[sec["role"]], 0.28) if sec["role"] in tint else base
        g.rectangle([s(xa), s(sy), s(xb) - 1, s(sy + sh)], fill=fill)
        g.rectangle([s(xa), s(sy), s(xa) + S - 1, s(sy + sh)], fill=C["bg"])
        full = f"{sec['role']} {sec['material']}  ·  bars {sec['bars'][0]}–{sec['bars'][1]}"
        short = f"{sec['role']} {sec['material']}"
        lab = full if F_LABEL.getlength(full) / S < xb - xa - 2 * U else short if F_LABEL.getlength(short) / S < xb - xa - U else ""
        if lab:
            text((xa + U, sy + sh / 2), lab, F_LABEL, C["ink"], anchor="lm")

    # 2. Spectrum: the mel spectrogram in one ramp from the well to the ink.
    py, ph = top["spectrum"], lanes[1][1]
    M = librosa.power_to_db(librosa.feature.melspectrogram(y=y, sr=sr, n_mels=128, hop_length=512), ref=np.max)
    v = np.clip((M + 80) / 80, 0, 1)[::-1]
    im = Image.fromarray((v * 255).astype(np.uint8)).resize((s(PW), s(ph)), Image.BILINEAR)
    a = (np.asarray(im).astype(np.float32) / 255) ** 1.35
    lo, hi = np.array(C["well"], np.float32), np.array(C["ink"], np.float32)
    rgb = (lo + (hi - lo) * a[..., None]).astype(np.uint8)
    img.paste(Image.fromarray(rgb, "RGB"), (s(X0), s(py)))
    # Frequency labels: where 300 Hz, 1.2 kHz and 4 kHz fall on the mel scale (128 bands up to 11 kHz).
    mel_max = librosa.hz_to_mel(sr / 2)
    for hz, lab in ((300, "300 Hz"), (1200, "1.2 kHz"), (4000, "4 kHz"), (11025, "11 kHz")):
        fy = py + ph - librosa.hz_to_mel(hz) / mel_max * ph
        text((X0 - U, fy), lab, F_NUM, C["muted"], anchor="rm")
        g.line([(s(X0 - U / 2), s(fy)), (s(X0), s(fy))], fill=C["faint"], width=S)
    for b in rh["downbeats"]:
        g.line([(s(tx(b)), s(py)), (s(tx(b)), s(py + 5))], fill=C["muted"], width=1)

    # 3. Loudness (LUFS, ink) and tension (0 to 1, accent), each named at its end; builds as labelled spans.
    ly, lh = top["loudness"], lanes[2][1]
    for bl in d["builds"]:
        xa, xb = tx(bl["start"]), tx(bl["end"])
        g.rectangle([s(xa), s(ly), s(xb), s(ly + lh)], fill=mix(C["panel"], C["warn"], 0.16))
        text((xa + U / 2, ly + U / 2), f"build {bl['start']:.1f}–{bl['end']:.1f} s", F_TAG, C["warn"])
    L = np.array(c["lufsMomentary"], np.float32)
    lmin, lmax = max(-60.0, float(np.floor(L.min() / 10) * 10)), float(np.ceil(L.max() / 10) * 10)
    lmax = max(lmax, lmin + 10)
    t = np.arange(len(L)) * c["step"]
    inner = (ly + 2 * U, ly + lh - U)
    yl = lambda v_: inner[1] - (v_ - lmin) / (lmax - lmin) * (inner[1] - inner[0])  # noqa: E731
    for gv in np.arange(lmin, lmax + 0.1, 10):
        g.line([(s(X0), s(yl(gv))), (s(X0 + PW), s(yl(gv)))], fill=C["grid"], width=1)
        text((X0 - U, yl(gv)), f"{gv:.0f}".replace("-", "−"), F_NUM, C["muted"], anchor="rm")
    g.line([(s(tx(a_)), s(yl(b_))) for a_, b_ in zip(t, L)], fill=C["ink"], width=S + 1, joint="curve")
    T = np.array(c["tension"], np.float32)
    tt = np.arange(len(T)) * c["step"]
    yt = lambda v_: inner[1] - v_ * (inner[1] - inner[0])  # noqa: E731
    g.line([(s(tx(a_)), s(yt(b_))) for a_, b_ in zip(tt, T)], fill=C["accent"], width=S + 1, joint="curve")
    text((X0 + PW - U, inner[0] - U - 4), "loudness, LUFS", F_TAG, C["ink"], anchor="ra")
    text((X0 + PW - U - F_TAG.getlength("loudness, LUFS") / S - 2 * U, inner[0] - U - 4), "tension, 0 to 1", F_TAG, C["accent"], anchor="ra")

    # 4. Energy per band: one small lane each, −60 to 0 dB.
    by = top["bands"]
    bh = 4 * U
    for k, n in enumerate(BANDS):
        yy = by + k * bh
        g.rectangle([s(X0), s(yy), s(X0 + PW), s(yy + bh - 2)], fill=C["panel"])
        text((X0 - U, yy + bh / 2 - 1), n, F_TAG, C["muted"], anchor="rm")
        B = np.clip((np.array(c["bands"][n], np.float32) + 60) / 60, 0, 1)
        tb = np.arange(len(B)) * c["step"]
        pts = [(s(tx(a_)), s(yy + bh - 3 - b_ * (bh - 6))) for a_, b_ in zip(tb, B)]
        g.polygon(pts + [(s(tx(tb[-1])), s(yy + bh - 3)), (s(tx(tb[0])), s(yy + bh - 3))], fill=mix(C["panel"], C["ink"], 0.18))
        g.line(pts, fill=C["muted"], width=S, joint="curve")

    # 5. Stems, only when measured.
    if stems:
        sty = top["stems"]
        for k, n in enumerate(["drums", "bass", "other", "vocals"]):
            yy = sty + k * 4 * U
            g.rectangle([s(X0), s(yy), s(X0 + PW), s(yy + 4 * U - 2)], fill=C["panel"])
            text((X0 - U, yy + 2 * U - 1), n, F_TAG, C["muted"], anchor="rm")
            for bar, on in zip(d["bars"], stems["presence"].get(n, [])):
                if on:
                    g.rectangle([s(tx(bar["start"])), s(yy + 8), s(tx(bar["end"])) - 1, s(yy + 4 * U - 10)], fill=mix(C["panel"], C["ink"], 0.7))

    # 6. Entry points: one row for each ranked window, named by the film length and rank, with its times.
    ey = top["entry points"] + U / 2
    k_row = 0
    for k, lab in (("short", "15 s film"), ("long", "38 s film")):
        for rank, e in enumerate(d["entryPoints"][k]):
            yy = ey + k_row * ER
            xa, xb = tx(e["from"]), tx(e["to"])
            fill = mix(C["panel"], C["ink"], [0.85, 0.55, 0.35][min(rank, 2)])
            g.rectangle([s(xa), s(yy), s(xb), s(yy + ER - 4)], fill=fill)
            tag = f"{lab}  #{rank + 1}  {e['from']:.1f}–{e['to']:.1f} s"
            inside = F_TAG.getlength(tag) / S < xb - xa - U
            text((xa + U / 2 if inside else xb + U / 2, yy + (ER - 4) / 2), tag, F_TAG, (C["bg"] if rank < 2 else C["ink"]) if inside else C["muted"], anchor="lm")
            k_row += 1

    # Drops: a mark through every lane, with its time and rise in a tag at the top of the spectrum.
    for dr in d["drops"]:
        x = tx(dr.get("at", dr["t"]))
        g.line([(s(x), s(top["sections"])), (s(x), s(plot_bottom))], fill=C["accent"], width=S)
        tag = f"drop  {dr.get('at', dr['t']):.2f} s" + (f"  +{dr['riseDb']} dB" if dr.get("riseDb") is not None else "  set by hand")
        w = F_TAG.getlength(tag) / S + U * 1.5
        xa = min(x, X0 + PW - w)
        g.rounded_rectangle([s(xa), s(py + U), s(xa + w), s(py + U + 18)], radius=s(3), fill=C["accent"])
        text((xa + U * 0.75, py + U + 9), tag, F_TAG, C["bg"], anchor="lm")

    # The time axis.
    ay = plot_bottom + U
    step = 5 if dur < 140 else 10 if dur < 300 else 30
    for tv in np.arange(0, dur + 1e-6, step):
        g.line([(s(tx(tv)), s(plot_bottom)), (s(tx(tv)), s(ay))], fill=C["faint"], width=S)
        text((tx(tv), ay + 2), f"{tv:.0f}", F_NUM, C["muted"], anchor="ma")
    text((X0 - U, ay + 2), "track time, s", F_TAG, C["muted"], anchor="ra")
    if missing:
        text((PAD, total - PAD - U), "not measured: " + ", ".join(missing) + ". untell listen setup --extras adds them.", F_TAG, C["faint"])
    img.resize((WIDTH, total), Image.LANCZOS).save(out)


if __name__ == "__main__":
    import json
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    theme = sys.argv[sys.argv.index("--theme") + 1] if "--theme" in sys.argv else None
    args = [x for x in args if x != theme]
    draw(json.loads(Path(args[0]).read_text()), args[1], args[2], theme)
