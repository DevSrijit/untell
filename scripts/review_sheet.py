"""The review sheet: a whole film in one image, for a model (or a person) to judge.

Usage: python3 scripts/review_sheet.py <video.mp4> [--out sheet.jpg] [--step 0.5] [--beats beats.json]
                                       [--findings findings.json] [--cols 8] [--align align.json] [--theme dark|light]

A model cannot watch a video. It can read this: every row is a strip of time.
  - Frames every `step` seconds, each with its time. A frame that follows a cut has a red top edge. A cut is a change
    done in one frame (checks/cuts.py); a word that rolls, pops or grows in over several frames is not one.
  - Under each row: the motion line (how much the picture changes, frame to frame: flat means a stall),
    the waveform of the sound, beat ticks (from --beats, or detected onsets), and cut marks.
  - Findings from the detector (--findings, the JSON of `detect` or `untell check`) show as labelled spans on the
    timeline. A finding without a time (a lint rule, the HyperFrames check) cannot go on the timeline: the sheet lists
    it under the header. --findings also reads the JSON of `untell lint --json`.
  - With --align (out/detector/<id>/align.json, the alignment model's issues): on each frame, the scene's guides in
    cyan (when the scene names any: withGuides), the line each element
    should join in blue and where the element is in red, with its offset in px; under the rows, a "worst misses"
    strip of crops from the full-size frames, zoomed 5x, so a model can read a 3 px error.
It also writes <out>.json: the cuts, stalls (no change for over 1 s), loudness per second and the beat grid,
so the numbers behind the picture are exact; and <out stem>.phone.jpg, the phone sheet: a frame from each shot at
390 px wide, the size a phone shows it, for the phone pass of the critique.
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--out")
ap.add_argument("--step", type=float, default=0.5)
ap.add_argument("--beats")
ap.add_argument("--findings")
ap.add_argument("--cols", type=int, default=8)
ap.add_argument("--align")
ap.add_argument("--theme", choices=["dark", "light"], default="dark")
ap.add_argument("--capture", help="the detector's capture.json: thin changes (a label that types, a line that draws) count as motion")
a = ap.parse_args()
video = Path(a.video)
out = Path(a.out) if a.out else video.with_suffix(".sheet.jpg")


def probe():
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration",
                        "-of", "json", str(video)], capture_output=True, text=True, check=True)
    d = json.loads(r.stdout)
    v = next(s for s in d["streams"] if s["codec_type"] == "video")
    n, m = (int(x) for x in v["r_frame_rate"].split("/"))
    return v["width"], v["height"], n / m, float(d["format"]["duration"]), any(s["codec_type"] == "audio" for s in d["streams"])


W, H, fps, dur, has_audio = probe()
# Small frames for the motion line (every frame), read once.
SW = 96
SH = max(2, round(SW * H / W / 2) * 2)
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"scale={SW}:{SH}", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                     capture_output=True, check=True).stdout
small = np.frombuffer(raw, dtype=np.uint8).reshape(-1, SH, SW).astype(np.int16)
n_frames = len(small)
dur = min(dur, n_frames / fps)  # the picture's length: the sound may run a frame longer
diff = np.zeros(n_frames)
diff[1:] = np.abs(small[1:] - small[:-1]).mean(axis=(1, 2))
changed = np.zeros(n_frames)
changed[1:] = (np.abs(small[1:] - small[:-1]) > 24).mean(axis=(1, 2))
# A cut: the one cut function of the detector (scripts/inspect/checks/cuts.py): a whole-frame change that is a spike,
# or a shot change of a subject on one ground (a 3D object on a dark plate), read by region.
import sys  # noqa: E402
sys.path.insert(0, str(Path(__file__).resolve().parent / "inspect" / "checks"))
from cuts import cut_frames  # noqa: E402
# On the detector's own copy (1/5 of the frame, film.py SMALL): at the sheet's 96 px a headline that cuts to the next
# one is a few pixels, and the sheet said "0 cuts" where the detector found the cut at 8.03 s (an agent's Graphite film).
_cw, _ch = max(2, W // 5 // 2 * 2), max(2, H // 5 // 2 * 2)
_raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-vf", f"scale={_cw}:{_ch}:flags=bilinear", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                      capture_output=True, check=True).stdout
cuts = cut_frames(np.frombuffer(_raw, dtype=np.uint8).reshape(-1, _ch, _cw).astype(np.int16))
# A stall: no visible change for over a second.
still = diff < 0.15
# The one motion measure (scripts/inspect/checks/motion_measure.py): with the film's capture, a frame where a label
# types, a stroke draws or a picture enters is not still, though its pixels change little.
if a.capture:
    import json as _json
    from motion_measure import changed as _changed
    _drawn = _changed(_json.loads(Path(a.capture).read_text()), n_frames)
    still = still & ~np.array(_drawn[:n_frames] + [False] * max(0, n_frames - len(_drawn)))
stalls, start = [], None
for i in range(n_frames + 1):
    if i < n_frames and still[i]:
        start = i if start is None else start
    else:
        if start is not None and (i - start) / fps > 1.0:
            stalls.append([round(start / fps, 2), round(i / fps, 2)])
        start = None

# Sound: an envelope for the waveform, loudness per second, onsets when no beat grid is given.
env = np.zeros(1)
per_second = []
onsets = []
if has_audio:
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
    hop = 80  # 10 ms
    k = len(x) // hop
    env = np.sqrt((x[:k * hop].reshape(k, hop) ** 2).mean(axis=1) + 1e-12)
    per_second = [round(float(20 * np.log10(np.sqrt((x[s * 8000:(s + 1) * 8000] ** 2).mean() + 1e-12))), 1) for s in range(int(len(x) / 8000))]
    flux = np.maximum(0, np.diff(env, prepend=env[0]))
    thr = flux.mean() + 2.5 * flux.std()
    last = -1e9
    for i, f in enumerate(flux):
        if f > thr and i - last > 12:
            onsets.append(round(i * hop / 8000, 3))
            last = i
beats = []
if a.beats:
    b = json.loads(Path(a.beats).read_text())
    beats = b.get("beats") or b.get("beatTimes") or []
findings = []
if a.findings:
    f = json.loads(Path(a.findings).read_text())
    if isinstance(f, dict) and "results" in f:  # untell lint --json: findings per file, with a line and no time
        findings = [dict(x, check=x.get("rule"), file=r.get("file")) for r in f["results"] for x in r.get("findings", [])]
    else:
        findings = f.get("findings", f) if isinstance(f, dict) else f
# The grid the check judged the cuts by (beat_sync's note: the beats, or the strong onsets on a low-trust grid) and its
# count of cuts on it. The sheet marks that grid and gives that count, so the sheet and the check agree. Before, the
# sheet marked onsets of its own and said "0 on a onset" while the check passed every cut (a first-use test).
grid_kind, judged_cuts, bed_cuts = ("beat" if beats else "onset"), None, False
if a.findings and isinstance(f, dict):
    # A bed system: the check does not hold cuts to the beat, so the sheet gives no count against its own onsets.
    bed_cuts = any(isinstance(x, dict) and x.get("check") == "sound/cut-on-beat" and x.get("notJudged") == "cuts" for x in f.get("notes") or [])
    _g = next((x for x in f.get("notes") or [] if isinstance(x, dict) and x.get("sheetGrid")), None)
    if _g and not beats:
        beats, grid_kind = list(_g["sheetGrid"]), _g.get("gridKind", "beat")
        judged_cuts = (_g.get("cutsOnGrid", 0), _g.get("cutsJudged", 0)) if _g.get("cutsJudged") else None  # no "0 of 0"
an = lambda w: ("an " if w[0] in "aeiou" else "a ") + w  # noqa: E731
# A finding without a time goes in the list under the header, not on the timeline.
notes = [fd for fd in findings if fd.get("from") is None]
findings = [fd for fd in findings if fd.get("from") is not None]
NOTE_MAX = 10
note_lines = [("x " if fd.get("severity") == "error" else "! ") + f'{fd.get("check", "?")}: {fd.get("message", "")}'[:140]
              + (f'  ({fd["file"]}:{fd.get("line", "")})' if fd.get("file") else "") for fd in notes[:NOTE_MAX]]
if len(notes) > NOTE_MAX:
    note_lines.append(f"  ... and {len(notes) - NOTE_MAX} more in the findings file")
# The height of the header: the title line, then one line for each listed finding.
HEAD = 26 + 14 * len(note_lines)

align, guides = [], None
if a.align:
    _aj = json.loads(Path(a.align).read_text())
    align = [i for i in _aj["issues"] if i["level"] in ("error", "warning") and not i.get("ignored") and i.get("elBox")]
    # The scene's guides (withGuides): drawn on every frame as thin cyan lines, so a miss reads against its grid.
    guides = _aj.get("guides")
# The worst misses: the larger offset at the higher confidence, one per element and axis.
worst, seen_w = [], set()
for i in sorted(align, key=lambda i: -i["confidence"] * max(1, abs(i["off"]))):
    if (i["el"], i["axis"]) in seen_w:
        continue
    seen_w.add((i["el"], i["axis"]))
    worst.append(i)
worst = worst[:8]
ZOOM, CROP_W, CROP_H = 5, 76, 44
STRIP_H = (CROP_H * ZOOM + 30) if worst else 0

# ---------- The picture ----------
# untell's picture style. The same block opens scripts/listen/plot.py; keep the two in step, so the tools read as
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


def _font_file(name):
    """A kit font file by name: the package's registry/fonts, else the repository's @fontsource packages, else None."""
    here = Path(__file__).resolve().parent
    family = name.split("-latin-")[0]
    for root in [Path(p) for p in [__import__("os").environ.get("UNTELL_FONTS", "")] if p] + [here.parent / "fonts", here.parent.parent / "fonts",
                                                                                         here.parent / "node_modules" / "@fontsource" / family / "files",
                                                                                         here.parent.parent / "node_modules" / "@fontsource" / family / "files"]:
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


C = THEMES[a.theme]
S = 2  # drawn at twice the size, then scaled down: smooth lines and type


def s(v):
    return int(round(v * S))


F_TITLE, F_FACT, F_LABEL, F_TIME, F_TAG = font("bold", s(20)), font("mono", s(12)), font("sans", s(11)), font("mono", s(11)), font("mono", s(11))

# Layout, in px of the final sheet. The frames keep their old size, so a model reads the same detail.
COLS = a.cols
TW = 216
TH = round(TW * H / W)
GUT = 9 * U           # the label column left of the lanes
PAD = 2 * U
LANES = [("motion", 4 * U), ("sound", 5 * U), ("faults", 0)]
times = [round(i * a.step, 3) for i in range(int(dur / a.step) + 1) if i * a.step < dur - 1e-6]
rows = (len(times) + COLS - 1) // COLS
RW = COLS * TW
cut_times = [c / fps for c in cuts]


MAX_FAULT_LANES = 8


def lanes_for(t0, t1):
    """The faults of one row: one lane for each rule (errors first, then by time), with a bar over each span of its
    findings. A rule with one finding names its node; a rule with more says how many. Lanes past MAX_FAULT_LANES fold
    into one line that names the rest."""
    groups = {}
    for fd in findings:
        s0, s1 = float(fd.get("from", 0)), float(fd.get("to", fd.get("from", 0)))
        if not (s1 >= t0 and s0 < t1):
            continue
        g = groups.setdefault((fd.get("check", "?"), fd.get("severity")), [])
        g.append((s0, s1, fd))
    order = sorted(groups.items(), key=lambda kv: (0 if kv[0][1] == "error" else 1, min(x[0] for x in kv[1])))
    placed = []
    for lane, ((check, sev), items) in enumerate(order[:MAX_FAULT_LANES]):
        spans = []
        for s0, s1, _ in sorted(items, key=lambda x: x[0]):  # merge overlapping spans into one bar
            if spans and s0 <= spans[-1][1] + 1e-6:
                spans[-1][1] = max(spans[-1][1], s1)
            else:
                spans.append([s0, s1])
        fd = items[0][2]
        m = fd.get("measured") if isinstance(fd.get("measured"), dict) else {}
        detail = (fd.get("node") or m.get("band") or "") if len(items) == 1 else f"{len(items)} findings"
        label = ("x " if sev == "error" else "! ") + str(check) + (f"  {detail}" if detail else "")
        bars = [((max(a_, t0) - t0) / (t1 - t0) * RW, max((min(b_, t1) - t0) / (t1 - t0) * RW, (max(a_, t0) - t0) / (t1 - t0) * RW + 3)) for a_, b_ in spans]
        placed.append((bars, sev, lane, label))
    rest = order[MAX_FAULT_LANES:]
    if rest:
        placed.append(([], None, MAX_FAULT_LANES, f"+ {len(rest)} more rules in this row: " + ", ".join(k[0] for k, _ in rest)[:160]))
    return placed


row_faults = [lanes_for(ri * COLS * a.step, (ri + 1) * COLS * a.step) for ri in range(rows)]
FAULT_LANE = 3 * U


def track_h(ri):
    n = max([p[2] for p in row_faults[ri]], default=-1) + 1
    return LANES[0][1] + LANES[1][1] + (max(1, n) * FAULT_LANE if findings else 0) + 2 * U


# The header: the film's facts, then the findings that have no time.
NOTE_H = 2 * U + 18 * len(note_lines) if note_lines else 0
HEAD = 9 * U + NOTE_H
row_y = []
y = PAD + HEAD
for ri in range(rows):
    row_y.append(y)
    y += TH + track_h(ri) + 3 * U
ZOOM, CROP_W, CROP_H = 5, 76, 44
STRIP_ROW = CROP_H * ZOOM + 5 * U
PER_ROW = max(1, int(RW // (CROP_W * ZOOM + 2 * U)))
strip_y = y
total_h = y + (U * 4 + STRIP_ROW * ((len(worst) + PER_ROW - 1) // PER_ROW) if worst else 0) + 4 * U
sheet = Image.new("RGB", (s(GUT + RW + 2 * PAD), s(total_h)), C["bg"])
d = ImageDraw.Draw(sheet)


def text(xy, t, f, fill, anchor="la"):
    d.text((s(xy[0]), s(xy[1])), t, font=f, fill=fill, anchor=anchor)


def tw(t, f):
    return f.getlength(t) / S


# Picture changes: each start of a run of changing frames after a still one (a cut, a draw, an entrance). A film that
# changes by drawing on the onsets of a low-trust grid has no cut, and the sheet said "0 cuts" with nothing else
# (an agent's Spec film changed on five onsets). The count says how many changes land within 2 frames of a marked
# beat or onset.
change_starts = [i for i in range(1, n_frames) if not still[i] and still[i - 1]]
marks = beats or onsets
on_mark = sum(1 for i in change_starts if any(abs(i / fps - m) <= 2 / fps for m in marks))

# Header.
text((PAD, PAD), video.name, F_TITLE, C["ink"])
facts = [f"{dur:.2f} s", f"{W} × {H}", f"{fps:g} fps", f"{len(cuts)} cut{'s' if len(cuts) != 1 else ''}",
         f"{len(change_starts)} picture change{'s' if len(change_starts) != 1 else ''}"
         + ((f", {on_mark} on {an(grid_kind)}" if beats else f", {on_mark} near an onset heard in the file") if has_audio and marks and not judged_cuts and not bed_cuts else ""),
         *([f"{judged_cuts[0]} of {judged_cuts[1]} cuts on {an(grid_kind)} (the check)"] if judged_cuts and has_audio else []),
         # Without the capture, a label that fades in or a line that draws is too thin for the pixel measure: the count
         # says so, since the stall check counts those changes (the hoist's sheet showed 4 stalls where the check found 0).
         f"{len(stalls)} stall{'s' if len(stalls) != 1 else ''}" + ("" if a.capture else " (pixels only: no --capture)"), (f"sound: {'the check' + chr(39) + 's ' if judged_cuts else ''}{grid_kind}s marked" if has_audio else "no sound")]
errs = sum(1 for f in findings + notes if f.get("severity") == "error")
# Advice is not a warning (the check says "2 warnings, 1 advice"; the sheet said "3 warnings").
warns = sum(1 for f in findings + notes if f.get("severity") == "warning")
advs = sum(1 for f in findings + notes if f.get("severity") == "advice")
if a.findings:
    facts.append(f"{errs} error{'s' if errs != 1 else ''} · {warns} warning{'s' if warns != 1 else ''}" + (f" · {advs} advice" if advs else ""))
text((PAD, PAD + 4 * U), "   ·   ".join(facts), F_FACT, C["muted"])
# The key, right-aligned on the title line: each mark with its name. On the facts line, a long line of facts ran
# under it (the check's grid and count made it longer).
KY = PAD + U
kx = PAD + GUT + RW
# The cut's label says what counts (checks/cuts.py): a change done in one frame. A word that rolls, pops or grows in over
# several frames is a change on the beat, not a cut, so a film can show fewer cuts than it has beat changes.
for label, kind in reversed([("cut: a change done in one frame", "cut"), (grid_kind, "tick"), ("x error", "error"), ("! warning", "warn")]):
    kx -= tw(label, F_LABEL)
    text((kx, KY), label, F_LABEL, C["muted"])
    kx -= U
    if kind == "cut":
        d.rectangle([s(kx - 2), s(KY), s(kx), s(KY + 12)], fill=C["ink"])
    elif kind == "tick":
        d.rectangle([s(kx - 1), s(KY + 3), s(kx), s(KY + 12)], fill=C["accent"] if beats else C["faint"])
    else:
        d.rectangle([s(kx - 14), s(KY + 5), s(kx), s(KY + 9)], fill=C[kind])
        kx -= 14
    kx -= 2 * U
for k, line in enumerate(note_lines):
    text((PAD, PAD + 7 * U + 18 * k), line, F_FACT, C["error"] if line.startswith("x") else C["warn"] if line.startswith("!") else C["muted"])


def grab(t, w_, h_, scale=None):
    """The frame shown at t, w_ x h_ RGB. ffmpeg gives nothing (and exits 0) for a time past the last frame's start:
    11.967 s in a 12 s film at 30 fps is 0.3 ms past frame 359. Then the frame before is the one on screen, so the
    grab steps back up to two frames. With still no frame it stops with a message, never a blank or black frame."""
    for back in (0, 0.5, 1, 2):
        tt = max(0.0, t - back / fps)
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{tt:.4f}", "-i", str(video), "-frames:v", "1",
                            *(["-vf", f"scale={w_}:{h_}:flags=lanczos"] if scale else []), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True)
        if len(r.stdout) >= w_ * h_ * 3:
            return Image.frombuffer("RGB", (w_, h_), r.stdout[:w_ * h_ * 3], "raw", "RGB", 0, 1)
    sys.exit(f"review sheet: no frame at {t:.3f} s in {video} ({dur:.3f} s, {fps:g} fps): {r.stderr.decode(errors='replace').strip()[:200] or 'ffmpeg gave no picture'}")


def frame_at(t):
    return grab(t, s(TW), s(TH), scale=True)


for ri in range(rows):
    y0 = row_y[ri]
    x0r = PAD + GUT
    t0, t1 = ri * COLS * a.step, (ri + 1) * COLS * a.step
    # Frames, each with its time; a frame that follows a cut says so in its tag.
    for ci in range(COLS):
        k = ri * COLS + ci
        if k >= len(times):
            break
        t = times[k]
        x = x0r + ci * TW
        sheet.paste(frame_at(t), (s(x), s(y0)))
        sx, sy = TW / W, TH / H
        if guides:  # the scene's guides, thin and quiet
            for gl in guides.get("x", []):
                d.line([(s(x + gl["v"] * sx), s(y0)), (s(x + gl["v"] * sx), s(y0 + TH))], fill=C["accent"], width=1)
            for gl in guides.get("y", []):
                d.line([(s(x), s(y0 + gl["v"] * sy)), (s(x + TW), s(y0 + gl["v"] * sy))], fill=C["accent"], width=1)
        now = [i for i in align if i["t0"] - 1e-6 <= t <= i["t1"] + 1e-6]
        labelled = {id(i) for i in sorted(now, key=lambda i: -abs(i["off"]))[:2]}
        for i in now:  # each alignment miss that holds now: the line to join, where it is; the two largest with their offset
            eb, tb = i["elBox"], i.get("targetBox") or i["elBox"]
            if i["axis"] == "y":
                xa, xb = min(eb["x0"], tb["x0"]), max(eb["x1"], tb["x1"])
                d.line([(s(x + xa * sx), s(y0 + i["to"] * sy)), (s(x + xb * sx), s(y0 + i["to"] * sy))], fill=C["accent"], width=S)
                d.line([(s(x + eb["x0"] * sx), s(y0 + i["v"] * sy)), (s(x + eb["x1"] * sx), s(y0 + i["v"] * sy))], fill=C["error"], width=S)
                if id(i) in labelled:
                    lab = f"{i['off']:+.0f} px"
                    text((min(x + eb["x1"] * sx + 2, x + TW - tw(lab, F_TAG) - 2), y0 + i["v"] * sy - 6), lab, F_TAG, C["error"])
            else:
                ya, yb = min(eb["y0"], tb["y0"]), max(eb["y1"], tb["y1"])
                d.line([(s(x + i["to"] * sx), s(y0 + ya * sy)), (s(x + i["to"] * sx), s(y0 + yb * sy))], fill=C["accent"], width=S)
                d.line([(s(x + i["v"] * sx), s(y0 + eb["y0"] * sy)), (s(x + i["v"] * sx), s(y0 + eb["y1"] * sy))], fill=C["error"], width=S)
                if id(i) in labelled:
                    lab = f"{i['off']:+.0f} px"
                    text((min(x + i["v"] * sx + 2, x + TW - tw(lab, F_TAG) - 2), y0 + eb["y1"] * sy), lab, F_TAG, C["error"])
        d.rectangle([s(x), s(y0), s(x + TW) - 1, s(y0 + TH) - 1], outline=C["bg"], width=S)
        cut_here = [c for c in cut_times if t - a.step < c <= t]
        after_cut = bool(cut_here)
        # The cut's own time: a frame at 6.5 s after a cut at 6.03 s said "6.5 s  cut" (a first-use test).
        c0 = cut_here[-1] if cut_here else None
        tag = f"{t:.1f} s" + (("  cut" if t - c0 < 1.5 / fps else f"  cut at {c0:.2f}") if after_cut else "")
        d.rounded_rectangle([s(x + 6), s(y0 + 6), s(x + 6 + tw(tag, F_TIME) + 10), s(y0 + 24)], radius=s(3), fill=C["tagbg"])
        text((x + 11, y0 + 15), tag, F_TIME, C["ink"], anchor="lm")
        if after_cut:
            d.rectangle([s(x), s(y0), s(x + TW), s(y0 + 3)], fill=C["ink"])
    # The lanes under the row: time runs from t0 to t1 across the row, as the frames above.
    ty = y0 + TH + U
    th = track_h(ri) - U
    d.rectangle([s(x0r), s(ty), s(x0r + RW), s(ty + th)], fill=C["panel"])
    px = lambda t: x0r + (t - t0) / (t1 - t0) * RW  # noqa: E731
    for ci in range(COLS + 1):  # the time grid: one line at each frame's time
        d.line([(s(x0r + ci * TW), s(ty)), (s(x0r + ci * TW), s(ty + th))], fill=C["grid"], width=1)
    ly = ty
    # Motion: how much the picture changes, frame to frame. Flat for over a second is a stall.
    mh = LANES[0][1]
    text((PAD, ly + mh / 2), "motion", F_LABEL, C["muted"], anchor="lm")
    f0, f1 = int(t0 * fps), min(n_frames, int(t1 * fps))
    top = max(1.0, float(np.percentile(diff, 99)))
    base = ly + mh - 6
    pts = [(s(px(i / fps)), s(base - min(1, diff[i] / top) * (mh - 12))) for i in range(f0, f1)]
    if len(pts) > 1:
        d.line(pts, fill=C["ink"], width=S, joint="curve")
    for s0, s1 in stalls:
        if s1 > t0 and s0 < t1:
            xa, xb = px(max(s0, t0)), px(min(s1, t1))
            d.rectangle([s(xa), s(base + 2), s(xb), s(base + 4)], fill=C["muted"])
            lab = f"still {s1 - s0:.1f} s"
            text((min(xa + 4, x0r + RW - tw(lab, F_TAG) - 4), ly + 4), lab, F_TAG, C["muted"])
    ly += mh
    d.line([(s(x0r), s(ly)), (s(x0r + RW), s(ly))], fill=C["grid"], width=1)
    # Sound: the waveform, mirrored, with the beats (or onsets) as ticks.
    sh = LANES[1][1]
    text((PAD, ly + sh / 2), "sound", F_LABEL, C["muted"], anchor="lm")
    if has_audio and len(env) > 1:
        mid = ly + sh / 2
        e0, e1 = int(t0 * 100), min(len(env), int(t1 * 100))
        peak = max(1e-4, float(env.max()))
        for i in range(e0, e1):
            hgt = env[i] / peak * (sh / 2 - 5)
            xx = s(px(i / 100))
            d.line([(xx, s(mid - hgt)), (xx, s(mid + hgt))], fill=C["wave"], width=1)
        for b in (beats or onsets):
            if t0 <= b < t1:
                d.line([(s(px(b)), s(ly + 2)), (s(px(b)), s(ly + 11))], fill=C["accent"] if beats else C["muted"], width=S)
    else:
        text((x0r + U, ly + sh / 2), "no sound", F_TAG, C["faint"], anchor="lm")
    ly += sh
    # Faults: one bar over the time each covers, with its symbol and rule id, packed so labels never overlap.
    if findings:
        d.line([(s(x0r), s(ly)), (s(x0r + RW), s(ly))], fill=C["grid"], width=1)
        n = max([p[2] for p in row_faults[ri]], default=-1) + 1
        text((PAD, ly + max(1, n) * FAULT_LANE / 2), "faults", F_LABEL, C["muted"], anchor="lm")
        if not row_faults[ri]:
            text((x0r + U, ly + FAULT_LANE / 2), "none in this row", F_TAG, C["faint"], anchor="lm")
        for bars, sev, lane, label in row_faults[ri]:
            col = C["error"] if sev == "error" else C["warn"] if sev else C["muted"]
            yy = ly + lane * FAULT_LANE + 6
            for xa, xb in bars:
                d.rectangle([s(x0r + xa), s(yy + 12), s(x0r + xb), s(yy + 15)], fill=col)
            text((x0r + (bars[0][0] if bars and bars[0][0] < RW - 200 else 0) + 1, yy), label, F_TAG, col)
    # Cuts: a line through every lane at the cut's time.
    for c in cut_times:
        if t0 <= c < t1:
            d.line([(s(px(c)), s(ty)), (s(px(c)), s(ty + th))], fill=C["ink"], width=S)


def full_frame(t):
    return grab(t, W, H)


# The worst alignment misses: crops of the full-size frame, zoomed 5x, with the line to join and where it is.
if worst:
    text((PAD, strip_y + U), "worst alignment misses, 5x", F_LABEL, C["muted"])
for k, i in enumerate(worst):
    eb, tb = i["elBox"], i.get("targetBox") or i["elBox"]
    if i["axis"] == "y":
        cx = (eb["x1"] + tb["x0"]) / 2 if tb["x0"] >= eb["x1"] else (eb["x0"] + tb["x1"]) / 2 if tb["x1"] <= eb["x0"] else (eb["x0"] + eb["x1"]) / 2
        cy = (i["v"] + i["to"]) / 2
    else:
        cy = (eb["y1"] + tb["y0"]) / 2 if tb["y0"] >= eb["y1"] else (eb["y0"] + tb["y1"]) / 2 if tb["y1"] <= eb["y0"] else (eb["y0"] + eb["y1"]) / 2
        cx = (i["v"] + i["to"]) / 2
    box = (int(cx - CROP_W / 2), int(cy - CROP_H / 2), int(cx + CROP_W / 2), int(cy + CROP_H / 2))
    box = (max(0, box[0]), max(0, box[1]), min(W, box[2]), min(H, box[3]))
    if box[2] <= box[0] or box[3] <= box[1]:  # the miss lies outside the frame: nothing to zoom
        continue
    Z = ZOOM * S
    crop = full_frame(i["at"]).crop(box).resize(((box[2] - box[0]) * Z, (box[3] - box[1]) * Z), Image.NEAREST)
    cd = ImageDraw.Draw(crop)
    if i["axis"] == "y":
        cd.line([(0, (i["to"] - box[1]) * Z), (crop.width, (i["to"] - box[1]) * Z)], fill=C["accent"], width=2 * S)
        cd.line([(0, (i["v"] - box[1]) * Z), (crop.width, (i["v"] - box[1]) * Z)], fill=C["error"], width=2 * S)
    else:
        cd.line([((i["to"] - box[0]) * Z, 0), ((i["to"] - box[0]) * Z, crop.height)], fill=C["accent"], width=2 * S)
        cd.line([((i["v"] - box[0]) * Z, 0), ((i["v"] - box[0]) * Z, crop.height)], fill=C["error"], width=2 * S)
    xx = PAD + GUT + (k % PER_ROW) * (CROP_W * ZOOM + 2 * U)
    yy = strip_y + 4 * U + (k // PER_ROW) * STRIP_ROW
    text((xx, yy), f"x {i['kind']}  {i['el']}  {i['off']:+.1f} px  at {i['at']:.1f} s" + (f"  snap {i['fix']}" if i.get("fix") else ""), F_TAG, C["error"])
    sheet.paste(crop, (s(xx), s(yy + 2 * U)))

sheet = sheet.resize((sheet.width // S, sheet.height // S), Image.LANCZOS)

sheet.save(out, quality=88)
data = {"video": str(video), "seconds": round(dur, 3), "fps": fps, "size": [W, H], "cuts": [round(c, 3) for c in cut_times], "stalls": stalls,
        "changes": [round(i / fps, 3) for i in change_starts], "changesOnMarks": on_mark,
        "loudnessPerSecondDb": per_second, "beats": beats, "onsets": onsets if not beats else [], "sheet": str(out),
        "findingsOnTimeline": len(findings), "findingsListed": len(notes),
        "alignWorst": [{k: i.get(k) for k in ("kind", "el", "feature", "axis", "v", "to", "off", "at", "fix", "level")} for i in worst]}

# The phone sheet: frames at the size a phone shows them (PHONE_W px wide, one image pixel to one screen point), one
# from the middle of each shot (between cuts; evenly spaced when the film has few cuts). Open it at 100 % to read the
# film as a viewer does: can every text be read, is the subject clear, does anything sit under the platform's controls.
PHONE_W, PHONE_COLS, PHONE_MAX = 390, 4, 12
bounds = [0.0] + cut_times + [dur]
shots = [(a_ + b_) / 2 for a_, b_ in zip(bounds, bounds[1:]) if b_ - a_ >= 0.2]
if len(shots) < 6:
    shots = [dur * (k + 0.5) / 8 for k in range(8)]
if len(shots) > PHONE_MAX:
    shots = [shots[round(k * (len(shots) - 1) / (PHONE_MAX - 1))] for k in range(PHONE_MAX)]
PH = round(PHONE_W * H / W)
F_PHONE = font("mono", 13)
prows = (len(shots) + PHONE_COLS - 1) // PHONE_COLS
pg, pl = 16, 22
phone = Image.new("RGB", (PHONE_COLS * PHONE_W + (PHONE_COLS + 1) * pg, prows * (PH + pl + pg) + pg), C["bg"])
pd = ImageDraw.Draw(phone)
for k, t in enumerate(shots):
    x_, y_ = pg + (k % PHONE_COLS) * (PHONE_W + pg), pg + (k // PHONE_COLS) * (PH + pl + pg)
    phone.paste(full_frame(t).resize((PHONE_W, PH), Image.LANCZOS), (x_, y_))
    pd.text((x_, y_ + PH + 4), f"{t:.1f} s", font=F_PHONE, fill=C["muted"])
phone_out = out.with_name(out.stem + ".phone.jpg")
phone.save(phone_out, quality=90)
data["phone"] = str(phone_out)
out.with_suffix(".json").write_text(json.dumps(data, indent=1))
print(f"review sheet: {out}  (cuts {len(cuts)}, picture changes {len(change_starts)}, stalls {len(stalls)}{', onsets ' + str(len(onsets)) if has_audio and not beats else ''})")
print(f"phone sheet: {phone_out}  (frames at {PHONE_W} px wide: open it at 100 %)")
