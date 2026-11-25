"""The tempo of any file's sound, with its trust: the rhythm of untell listen's analysis (analysis.rhythm), alone.

Usage: python3 scripts/listen/tempo.py <audio or video file> --out <json>

untell see runs it when the listen tools are set up. It reads the sound with ffmpeg, then runs the same beat tracker
and the same confidence as `untell listen analyse`, without the rest of that analysis (sections, harmony, stems).
"""
import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import analysis as A

ap = argparse.ArgumentParser()
ap.add_argument("file")
ap.add_argument("--out", required=True)
a = ap.parse_args()
t0 = time.time()
with tempfile.TemporaryDirectory() as d:
    wav = Path(d) / "sound.wav"
    p = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.file, "-vn", "-ac", "2", "-ar", str(A.LSR), str(wav)], capture_output=True, text=True)
    if p.returncode != 0:
        sys.exit(f"tempo: ffmpeg could not read the sound: {p.stderr.strip()[-300:]}")
    st, mono = A.load(wav)
dur = len(mono) / A.SR
S, freqs = A.spectra(mono)
rh = A.rhythm(mono, S, freqs, dur)
out = {"bpm": rh["bpm"], "confidence": rh["confidence"], "pulseClarity": rh["pulseClarity"], "grid": rh["grid"],
       "meter": rh["meter"], "beats": rh["beats"], "downbeats": rh["downbeats"], "seconds": round(time.time() - t0, 2),
       "method": "untell listen's rhythm: an onset envelope, a tempo fit on it, a fixed or tracked beat grid"}
Path(a.out).write_text(json.dumps(out))
print(f"tempo: {rh['bpm']} BPM, {rh['confidence']} confidence")
