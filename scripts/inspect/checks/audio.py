"""Sound helpers: decode a file to mono samples, and its level in dB over short windows."""
import subprocess
from functools import lru_cache

import numpy as np

SR = 16000


@lru_cache(maxsize=32)
def pcm(path, start=0.0, duration=None):
    args = ["ffmpeg", "-loglevel", "error", "-ss", str(start), "-i", str(path)]
    if duration is not None:
        args += ["-t", str(duration)]
    args += ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"]
    return np.frombuffer(subprocess.run(args, capture_output=True, check=True).stdout, dtype=np.float32)


def db(x):
    return float(20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-9)) if len(x) else -180.0


def level(samples, t0, t1):
    """The RMS level in dBFS of samples between t0 and t1 seconds."""
    a, b = max(0, int(t0 * SR)), max(0, int(t1 * SR))
    return db(samples[a:b])


def envelope(samples, hop=0.05, win=0.1):
    """(times, dB) every `hop` seconds over windows of `win` seconds."""
    n = int(len(samples) / (hop * SR))
    ts = np.arange(n) * hop
    return ts, np.array([level(samples, t, t + win) for t in ts])
