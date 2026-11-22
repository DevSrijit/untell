"""A faster, exact reader for the frames that the detector checks share (Film.grey and Film.rgb).

scripts/inspect/checks/film.py decodes every frame twice at full size: once for the grey copy (1/5 size), once
for the colour copy (1/10 size). This reader decodes each distinct frame file once and makes both copies from
that one decode, with the same PIL calls, so every value is the same. Frames that are the same file byte for
byte (the recorder copies a frame that does not change) decode once. The decodes run on threads: PIL releases
the interpreter lock while it decodes and resizes.

install() replaces the two properties on the Film class. The bench (checks_bench.py --fast) uses it to prove
that every finding stays the same; the diff for film.py is in out/perf/RESULT.md.
"""
import hashlib
import os
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image


def _both(path, small, smaller):
    im = Image.open(path)
    im.load()
    g = np.asarray(im.convert("L").resize(small, Image.BILINEAR), dtype=np.int16)
    c = np.asarray(im.convert("RGB").resize(smaller, Image.BILINEAR), dtype=np.int16)
    return g, c


def _frames(self):
    if getattr(self, "_fast_frames", None) is not None:
        return self._fast_frames
    import film as film_mod
    S = film_mod.SMALL
    small, smaller = (self.W // S, self.H // S), (self.W // (2 * S), self.H // (2 * S))
    paths = [self.rec.dir / "frames" / f"f{f:04d}.jpg" for f in range(self.n)]
    digests = [hashlib.blake2b(p.read_bytes(), digest_size=16).digest() for p in paths]
    first = {}
    for i, d in enumerate(digests):
        first.setdefault(d, i)
    todo = sorted(set(first.values()))
    workers = max(1, min(8, int(os.environ.get("UNTELL_CHECK_THREADS", "0")) or (os.cpu_count() or 2) // 2))
    with ThreadPoolExecutor(workers) as ex:
        done = dict(zip(todo, ex.map(lambda i: _both(paths[i], small, smaller), todo)))
    grey = np.stack([done[first[d]][0] for d in digests])
    rgb = np.stack([done[first[d]][1] for d in digests])
    self._fast_frames = (grey, rgb)
    return self._fast_frames


def install():
    import film as film_mod
    from functools import cached_property

    def grey(self):
        return _frames(self)[0]

    def rgb(self):
        return _frames(self)[1]

    g, r = cached_property(grey), cached_property(rgb)
    g.__set_name__(film_mod.Film, "grey")
    r.__set_name__(film_mod.Film, "rgb")
    film_mod.Film.grey = g
    film_mod.Film.rgb = r
