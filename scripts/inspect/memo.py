"""A disk memo for the detector's slow measures that depend only on files: the same files and the same code give the
same result, so a second check of a film does not measure them again.

memo(space, key_parts, fn) returns fn(), from out/detector/.memo/<space>/<key>.pkl when the key is known. The key is
a hash of the parts: put in it every input of fn (file contents or file stamps, arguments) and the source of the
code that computes it (code_of). UNTELL_NO_CACHE=1 turns the memo off. A memo file that does not load is measured
again. The folder keeps at most MAX_FILES files a space; the oldest go first.
"""
import hashlib
import os
import pickle
from pathlib import Path

ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[2])
DIR = ROOT / "out" / "detector" / ".memo"
MAX_FILES = 400


def stamp(path):
    """A file's identity without reading it: its path, size and modification time (ns)."""
    p = Path(path)
    try:
        s = p.stat()
    except OSError:
        return f"{p}:missing"
    return f"{p.resolve()}:{s.st_size}:{s.st_mtime_ns}"


def content(path):
    """A hash of a file's bytes (for files that a tool may write again with the same name)."""
    try:
        return hashlib.blake2b(Path(path).read_bytes(), digest_size=16).hexdigest()
    except OSError:
        return f"{path}:missing"


def code_of(*modules):
    """A hash of the source of the modules that compute a result."""
    h = hashlib.blake2b(digest_size=16)
    for m in modules:
        f = getattr(m, "__file__", None)
        h.update(Path(f).read_bytes() if f else repr(m).encode())
    return h.hexdigest()


def memo(space, key_parts, fn):
    if os.environ.get("UNTELL_NO_CACHE") == "1":
        return fn()
    h = hashlib.blake2b(digest_size=20)
    for part in key_parts:
        h.update(str(part).encode())
        h.update(b"\0")
    d = DIR / space
    p = d / f"{h.hexdigest()}.pkl"
    if p.exists():
        try:
            with p.open("rb") as fh:
                return pickle.load(fh)
        except Exception:  # noqa: BLE001  a broken memo file is measured again
            pass
    out = fn()
    try:
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / f".{p.name}.{os.getpid()}"
        with tmp.open("wb") as fh:
            pickle.dump(out, fh, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(tmp, p)
        files = sorted(d.glob("*.pkl"), key=lambda q: q.stat().st_mtime)
        for q in files[:-MAX_FILES]:
            q.unlink(missing_ok=True)
    except OSError:
        pass
    return out
