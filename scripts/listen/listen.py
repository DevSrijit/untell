"""untell listen: tells an agent what a sound sounds like, because an agent cannot hear.

Usage (run with scripts/listen/untell-listen, which uses the .venv-audio environment):
  untell-listen analyse <name | file> ... [--all] [--force] [--no-stems] [--no-clap]
      A music track: writes listen.json, listen.md and listen.png beside it (assets/media/<name>/).
  untell-listen fx <name | file> ... [--all]
      A sound effect: writes listen.json and listen.md beside it.
  untell-listen mix <render.mp4> <nodes.json | capture.json> <system>
      A film's final mix: masking per hit, loudness against the system target, phone check. Prints Markdown;
      writes <render>.mix.json beside the render.
  untell-listen compare "<brief in words>" [<name> ...]
      Ranks analysed tracks for a brief and says why each wins or loses: the prepared ones and the files analysed by
      path (.untell/listen/). A <name> is a prepared name or the path of an analysed file. Default: every one.
  untell-listen analyse <name> --drop <seconds>
      Pins the drop at a track time that a render showed: the map then says it was set by hand, and every command
      (listen.md, compare, music({ peakAt }), the checks) reads that one time.
Set up once (the core: bars, beats, sections, the drop, loudness and the key):
  uv venv .venv-audio --python 3.12
  uv pip install --python .venv-audio/bin/python numpy scipy librosa soundfile pyloudnorm
Optional parts, each found at run time; without one, listen says what it skips and the command that adds it:
  picture (listen.png):     uv pip install --python .venv-audio/bin/python pillow
  stems (Demucs):           uv pip install --python .venv-audio/bin/python torch torchaudio demucs
  character tags (CLAP):    uv pip install --python .venv-audio/bin/python torch "transformers==4.46.3"
                            (later transformers versions returned flat CLAP scores in our test)

Dependencies and licences. untell installs none of them itself, vendors none and links none statically; a
user installs them as ordinary packages.
  | Package          | Licence                    | Why                                   | Pulled in by         |
  | numpy, scipy     | BSD-3-Clause               | arrays, filters, resampling           | core                 |
  | librosa          | ISC                        | spectra, chroma, onsets, beat tracker | core                 |
  | soundfile        | BSD-3-Clause (its bundled libsndfile is LGPL-2.1, a shared library) | reading audio | core |
  | soxr             | LGPL-2.1-or-later          | resampling inside librosa             | librosa (required)   |
  | scikit-learn, numba | BSD-3-Clause, BSD-2-Clause | used inside librosa                | librosa              |
  | pyloudnorm       | MIT                        | ITU-R BS.1770-4 loudness              | core                 |
  | Pillow           | MIT-CMU (HPND)                 | listen.png                        | optional             |
  | torch            | BSD-3-Clause               | runs Demucs and CLAP                  | optional             |
  | torchaudio       | BSD-2-Clause               | audio I/O for Demucs                  | optional (stems)     |
  | demucs, julius, einops | MIT                  | stem separation                       | optional (stems)     |
  | lameenc          | LGPL-3.0-or-later          | MP3 export in Demucs; untell never calls it | demucs         |
  | transformers, tokenizers | Apache-2.0         | runs CLAP                             | optional (tags)      |
Model weights (downloaded on first use, never shipped with untell):
  | Demucs htdemucs (adefossez/HTDemucs, about 80 MB)   | MIT         |
  | CLAP laion/clap-htsat-unfused (about 600 MB)        | Apache-2.0  |
untell itself uses no GPL or AGPL code.
"""
import argparse
import hashlib
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
HERE = Path(__file__).resolve().parent
# The repository root, or the work tree that untell builds in a project (UNTELL_ROOT).
ROOT = Path(os.environ.get("UNTELL_ROOT") or HERE.parents[1])
# How to add a package: the repository's command, or the one that untell names (UNTELL_LISTEN_SETUP).
SETUP = os.environ.get("UNTELL_LISTEN_SETUP")
MEDIA = ROOT / "assets" / "media"
sys.path.insert(0, str(HERE))


def manifest():
    p = ROOT / "assets" / "media.json"
    return json.loads(p.read_text()) if p.exists() else {}


def resolve(item):
    """A name in assets/media.json, or a file path. Returns (name, audio file, output dir).
    A prepared track writes its results beside it (assets/media/<name>/). Any other file writes them to
    .untell/listen/<name>/ under the current folder, never beside the file: the file may sit in a folder that is not
    the project's, and a link is not followed to its target's folder. The output folder is printed."""
    m = manifest()
    if item in m:
        return item, MEDIA / item / m[item]["file"], MEDIA / item
    p = Path(item).absolute()
    if not p.exists():
        raise SystemExit(f"{item}: no prepared track by that name and no such file. Give a name from the media list or a path.")
    # untell's own copy of a file (in .untell/listen/<name>/): the results go beside it, in that folder.
    if p.parent.parent.name == "listen" and p.parent.parent.parent.name == ".untell":
        return p.parent.name, p, p.parent
    # Any other file: a name of its own, so files with one stem ("source.mp3" in three folders) never share results.
    name = p.stem if p.stem.lower() not in GENERIC else f"{p.parent.name}-{p.stem}"
    name = f"{name}-{hashlib.sha1(str(p).encode()).hexdigest()[:6]}"
    out = Path.cwd() / ".untell" / "listen" / name
    out.mkdir(parents=True, exist_ok=True)
    print(f"{name}: not a prepared track; results go to {out}")
    return name, p, out


# File stems that name no track: such a file takes its folder's name too.
GENERIC = {"source", "audio", "track", "music", "song", "sound", "master", "file", "download"}


def clean(d):
    return {k: v for k, v in d.items() if not k.startswith("_")}


HOW = {
    "stems": "stems skipped: Demucs is not installed. Add it: " + (SETUP or "uv pip install --python .venv-audio/bin/python torch torchaudio demucs"),
    "clap": "character tags skipped: CLAP is not installed. Add it: " + (SETUP or "uv pip install --python .venv-audio/bin/python torch \"transformers==4.46.3\""),
    "plot": "listen.png skipped: Pillow is not installed. Add it: " + (SETUP or "uv pip install --python .venv-audio/bin/python pillow"),
}


def available():
    """Which optional parts this environment can run."""
    from importlib.util import find_spec
    has = lambda *m: all(find_spec(x) is not None for x in m)  # noqa: E731
    return {"stems": has("torch", "demucs"), "clap": has("torch", "transformers"), "plot": has("PIL")}


def cmd_analyse(a):
    import analysis
    import prose
    av = available()
    for k in ("stems", "clap", "plot"):
        if not av[k] and not getattr(a, f"no_{k}", False):
            print(HOW[k])
    a.no_stems = a.no_stems or not av["stems"]
    a.no_clap = a.no_clap or not av["clap"]
    plot = None
    if av["plot"]:
        import plot
    items = a.items or [n for n, v in manifest().items() if v["kind"] == "music"]
    if a.drop is not None and len(items) != 1:
        raise SystemExit("--drop pins the drop of one track: give one track")
    for it in items:
        name, f, out = resolve(it)
        if (out / "listen.json").exists() and not a.force and not lacks_cross_check(out / "listen.json"):
            if a.drop is None:
                print(f"{name}: listen.json exists (use --force)")
                continue
            d = json.loads((out / "listen.json").read_text())
        else:
            t0 = time.time()
            d = clean(analysis.analyse(f, use_stems=not a.no_stems, use_clap=not a.no_clap))
            d["name"] = name
            d["seconds"] = round(time.time() - t0, 1)
        with_rise(d, f)
        if a.drop is not None:
            pin_drop(d, a.drop)
        (out / "listen.json").write_text(json.dumps(d))
        (out / "listen.md").write_text(prose.write(d))
        if plot:
            plot.draw(d, f, out / "listen.png")
        print(f"{name}: {d['rhythm']['bpm']} BPM, {len(d['sections'])} sections, {len(d['drops'])} drops, loop share "
              f"{d['repetition'].get('loopShare')}, {d['seconds']} s")


def with_rise(d, f):
    """Each drop gets `at`: where its rise is in the sound (music_map.measured_rise), the one time every command reports
    and `music({ peakAt })` places. `t` stays the bar line. A drop pinned by hand keeps its time."""
    sys.path.insert(0, str(HERE.parent))
    import music_map
    if not d.get("drops"):
        return
    beat = 60.0 / d["rhythm"]["bpm"]
    # The file the music node plays: the master beside the track when one was made (music_map.py measures the same).
    played = Path(f).with_name("master.wav") if Path(f).with_name("master.wav").exists() else f
    for x in d["drops"]:
        if x.get("pinned"):
            continue
        x["at"] = round(float(music_map.measured_rise(played, x["t"], beat)), 3)


def lacks_cross_check(p):
    """True when a kept result was made with no HyperFrames CLI and one is found now (UNTELL_HYPERFRAMES or PATH): its
    beat grid was never cross-checked, so it is analysed again instead of reused."""
    import analysis
    try:
        val = json.loads(p.read_text()).get("validation") or {}
    except (OSError, ValueError):
        return False
    if val.get("hyperframes") != "not available" or not analysis.hyperframes_cli():
        return False
    print(f"{p.parent.name}: the kept result has no HyperFrames cross-check, and a HyperFrames CLI is here now: analysing it again")
    return True


def pin_drop(d, t):
    """--drop <seconds>: the drop is at this track time, as a render showed it. The nearest drop within a bar moves
    there; with none, a drop is added. Its `at` is set by hand, and the map says so (`pinned`)."""
    bar = 4 * 60.0 / d["rhythm"]["bpm"]
    near = [x for x in d.get("drops", []) if abs(x.get("at", x["t"]) - t) <= bar]
    x = min(near, key=lambda x: abs(x.get("at", x["t"]) - t)) if near else None
    if x is None:
        x = {"t": round(t, 3), "riseDb": None, "bar": None}
        d.setdefault("drops", []).append(x)
        d["drops"].sort(key=lambda q: q["t"])
    x["at"] = round(t, 3)
    x["pinned"] = "set by hand (untell listen analyse --drop)"
    print(f"{d.get('name', 'track')}: the drop is pinned at {t:.3f} s (set by hand); music({{ peakAt }}) places it there")


def cmd_fx(a):
    import fx
    if not available()["clap"] and not a.no_clap:
        print(HOW["clap"])
        a.no_clap = True
    items = a.items or [n for n, v in manifest().items() if v["kind"] == "sfx"]
    for it in items:
        name, f, out = resolve(it)
        d = fx.analyse(f, use_clap=not a.no_clap)
        d["name"] = name
        (out / "listen.json").write_text(json.dumps(d))
        (out / "listen.md").write_text(fx.write_md(d, name))
        print(f"{name}: {d['class']} ({', '.join(t['tag'] for t in d.get('clapClass', [])[:2])}), {d['duration']} s, "
              f"{len(d['transients'])} transient(s)")


def cmd_mix(a):
    import mix
    d = mix.analyse(a.items[0], a.items[1], a.items[2])
    Path(str(a.items[0]) + ".mix.json").write_text(json.dumps(d))
    print(mix.write_md(d))


def cmd_compare(a):
    import compare
    if not available()["clap"]:
        print(HOW["clap"] + " The ranking below uses the structure only.")
    brief, names = a.items[0], a.items[1:]
    tracks = {}
    # Every analysed track: the prepared ones (assets/media/<name>/) and the files analysed by path
    # (.untell/listen/<name>/ under this folder), so a track need not be added to the media list to be compared.
    found = {p.parent.name: p for p in sorted((Path.cwd() / ".untell" / "listen").glob("*/listen.json"))}
    found.update({p.parent.name: p for p in sorted(MEDIA.glob("*/listen.json"))})
    # A name may be a prepared name, a .untell/listen folder name, or the path of a file that was analysed.
    want = set()
    for n in names:
        if n in found:
            want.add(n)
            continue
        q = Path(n)
        hit = [k for k, p in found.items() if q.exists() and k.startswith((q.stem if q.stem.lower() not in GENERIC else f"{q.absolute().parent.name}-{q.stem}") + "-")
               and k.endswith(hashlib.sha1(str(q.absolute()).encode()).hexdigest()[:6])]
        if not hit:
            raise SystemExit(f"{n}: no analysis found. Run: untell listen analyse {n}")
        want.update(hit)
    for name, p in found.items():
        if names and name not in want:
            continue
        d = json.loads(p.read_text())
        if "rhythm" in d:
            tracks[name] = d
    ranked = compare.rank(brief, tracks)
    print(compare.write_md(brief, ranked))
    if a.json:
        print(json.dumps(ranked))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["analyse", "analyze", "fx", "mix", "compare"])
    ap.add_argument("items", nargs="*")
    ap.add_argument("--all", action="store_true", help="every prepared track or effect (the default with no names)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-stems", action="store_true")
    ap.add_argument("--no-clap", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--drop", type=float, default=None, help="analyse: pin the track's drop at this track time, in seconds (as a render showed it)")
    a = ap.parse_args()
    {"analyse": cmd_analyse, "analyze": cmd_analyse, "fx": cmd_fx, "mix": cmd_mix, "compare": cmd_compare}[a.cmd](a)


if __name__ == "__main__":
    main()
