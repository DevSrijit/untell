"""Shared loading and drawing for the inspect tools.

A recording is out/recordings/<id>/: frames/*.jpg, frames-png/*.png (key frames), tracks.json (text),
elements.json (every painted element), report.json. Tokens come from out/tokens.json.
"""
import json
from collections import OrderedDict
from dataclasses import dataclass
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

# The repository root, or the work tree that untell builds in a project (UNTELL_ROOT).
ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[2])
REC = ROOT / "out" / "recordings"
FONT = "/System/Library/Fonts/SFNS.ttf"

# Videos made without a kit are checked against a neutral grid with the same proportions.
NEUTRAL = {
    "id": "neutral", "name": "Neutral grid",
    "grid": {"columns": 6, "margin": 0.067, "gutter": 0.022, "safeTop": 0.13, "safeBottom": 0.21},
    "type": {}, "palette": None,
}


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


# Decoded frames kept in memory (Recording.frame): 256 MB holds every key frame of a 15 s film at 1080 x 1920.
FRAME_BUDGET = int(os.environ.get("UNTELL_FRAME_CACHE_MB", "256")) * 1 << 20
_FRAMES = OrderedDict()
_FRAME_BYTES = [0]


@dataclass
class Recording:
    id: str
    dir: Path
    fps: int
    width: int
    height: int
    n: int
    elements: list  # per frame: list of element dicts (None where not sampled)
    tracks: list  # per frame: list of text dicts
    language: dict

    def frame(self, f: int) -> Image.Image:
        """Frame f at full size, RGB: the lossless key frame when there is one. Several checks read the same key
        frames, so decoded frames stay in memory up to FRAME_BUDGET bytes (the oldest go first); each call returns
        a copy, so a check that draws on its frame does not change it for the next."""
        key = (str(self.dir), f)
        im = _FRAMES.get(key)
        if im is None:
            png = self.dir / "frames-png" / f"f{f:04d}.png"
            im = Image.open(png if png.exists() else self.dir / "frames" / f"f{f:04d}.jpg").convert("RGB")
            _FRAMES[key] = im
            _FRAME_BYTES[0] += im.width * im.height * 3
            while _FRAME_BYTES[0] > FRAME_BUDGET and len(_FRAMES) > 1:
                _, old = _FRAMES.popitem(last=False)
                _FRAME_BYTES[0] -= old.width * old.height * 3
        else:
            _FRAMES.move_to_end(key)
        return im.copy()

    def has_png(self, f: int) -> bool:
        return (self.dir / "frames-png" / f"f{f:04d}.png").exists()

    def content(self, f: int, min_opacity: float = 0.5) -> list:
        """Visible content elements at frame f: no ground, no texture, nothing that fills the frame."""
        out = []
        for e in self.elements[f] or []:
            if e["layer"] != "content" or e["opacity"] < min_opacity:
                continue
            if e["w"] * e["h"] > 0.9 * self.width * self.height:
                continue
            x0, y0 = max(0, e["x"]), max(0, e["y"])
            x1, y1 = min(self.width, e["x"] + e["w"]), min(self.height, e["y"] + e["h"])
            if x1 <= x0 or y1 <= y0:
                continue
            out.append(e)
        return out

    def at_rest(self, f: int, el: dict) -> bool:
        """True when the element did not move between f-1 and f (it is not mid-animation or mid-camera)."""
        prev = {e["id"]: e for e in (self.elements[f - 1] or [])} if f > 0 else {}
        p = prev.get(el["id"])
        return p is not None and abs(p["x"] - el["x"]) + abs(p["y"] - el["y"]) + abs(p["w"] - el["w"]) < 1


def system_language(sid: str, W: int, H: int) -> dict | None:
    """A system from systems/<id>/tokens.json, converted from short-side units to the frame fractions these tools use."""
    p = ROOT / "systems" / sid / "tokens.json"
    if not p.exists():
        return None
    s = json.loads(p.read_text())
    short = min(W, H)
    tall = H / W > 1.5
    grid = {"columns": s["columns"], "margin": s["margin"] * short / W, "gutter": 0.022 * short / W,
            "safeTop": 0.06, "safeBottom": 0.08}
    if tall:
        # The area TikTok, Instagram Reels and YouTube Shorts all leave clear (from their overlay layouts):
        # y 15 % to 65 %, x 11.1 % to 82.2 %; below y 43.75 %, TikTok's side buttons end text at x 72.2 %.
        grid.update({"safeTop": 0.15, "safeBottom": 0.35, "safeLeft": 0.1111, "safeRight": 0.1778,
                     "lowBandTop": 0.4375, "lowBandRight": 0.2778})
        # The columns fill the text area (see src/system/frame.ts).
        grid["margin"] = max(grid["margin"], 0.1111)
        grid["marginRight"] = max(s["margin"] * short / W, 0.1778)
    type_ = {r: {**t, "size": t["size"] * short / H} for r, t in s["type"].items()}
    return {"id": s["id"], "name": s["name"], "grid": grid, "type": type_, "palette": {"roles": s["colors"]}, "accentMode": s["accentMode"],
            "density": s["density"]}


def language_for(rec_id: str, W: int = 1080, H: int = 1920, system: str | None = None) -> dict:
    # A film made with a system says so in elements.json (from data-system). Without it, fall back to the old languages.
    if system:
        found = system_language(system, W, H)
        if not found:
            raise ValueError(f"{rec_id}: no tokens for system {system!r}; run bun scripts/export_systems.ts")
        return found
    if rec_id.startswith("hf-"):
        raise ValueError(f"{rec_id}: a HyperFrames film must declare its design system with data-system on its root")
    tokens = json.loads((ROOT / "out" / "tokens.json").read_text())
    if "swiss" in rec_id:
        return tokens["swiss"]
    for key in ("data", "collage"):
        if rec_id == f"specimen-{key}":
            return tokens[key]
    return NEUTRAL


def load(rec_id: str) -> Recording:
    d = REC / rec_id
    el = json.loads((d / "elements.json").read_text())
    tr = json.loads((d / "tracks.json").read_text())
    return Recording(id=rec_id, dir=d, fps=el["fps"], width=el["width"], height=el["height"], n=el["durationInFrames"],
                     elements=el["frames"], tracks=tr["frames"], language=language_for(rec_id, el["width"], el["height"], el.get("system")))


def grid_lines(rec: Recording) -> dict:
    """Column edges, margins and safe zones in frame pixels."""
    g = rec.language["grid"]
    W, H = rec.width, rec.height
    m, gut = g["margin"] * W, g["gutter"] * W
    mr = g.get("marginRight", g["margin"]) * W
    cols = g["columns"]
    colW = (W - m - mr - (cols - 1) * gut) / cols
    edges = []
    for k in range(cols):
        left = m + k * (colW + gut)
        edges += [left, left + colW]
    return {"margin": m, "marginRight": mr, "gutter": gut, "colW": colW, "edges": sorted(set(round(e, 1) for e in edges)),
            "safeTop": g["safeTop"] * H, "safeBottom": (1 - g["safeBottom"]) * H,
            "safeLeft": g.get("safeLeft", 0) * W, "safeRight": (1 - g.get("safeRight", 0)) * W,
            "lowBandTop": g.get("lowBandTop", 1) * H, "lowBandRight": (1 - g.get("lowBandRight", 0)) * W}


def type_scale_px(rec: Recording) -> dict:
    return {role: round(t["size"] * rec.height, 1) for role, t in rec.language.get("type", {}).items()}


def out_dir(rec: Recording) -> Path:
    d = rec.dir / "inspect"
    d.mkdir(exist_ok=True)
    return d


def label(draw: ImageDraw.ImageDraw, xy, text: str, fill=(255, 255, 255), bg=(20, 20, 20), size: int = 22):
    """A small text tag with a solid background, readable on any frame."""
    f = font(size)
    x, y = xy
    l, t, r, b = draw.textbbox((x, y), text, font=f)
    draw.rectangle([l - 5, t - 3, r + 5, b + 3], fill=bg)
    draw.text((x, y), text, fill=fill, font=f)


def to_oklab(rgb: np.ndarray) -> np.ndarray:
    """sRGB (0..255, shape (..., 3)) to OKLab."""
    c = rgb.astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929], [0.2119034982, 0.6806995451, 0.1073969566], [0.0883024619, 0.2817188376, 0.6299787005]])
    M2 = np.array([[0.2104542553, 0.793617785, -0.0040720468], [1.9779984951, -2.428592205, 0.4505937099], [0.0259040371, 0.7827717662, -0.808675766]])
    lms = np.cbrt(lin @ M1.T)
    return lms @ M2.T


def kmeans(x, k=8, iters=14, seed=3):
    """k-means on the rows of x (n, d): the centres and the cluster of each row. colour.py and untell see share it."""
    rng = np.random.default_rng(seed)
    c = x[rng.choice(len(x), k, replace=False)]
    for _ in range(iters):
        d = ((x[:, None, :] - c[None]) ** 2).sum(-1)
        a = d.argmin(1)
        for j in range(k):
            if (a == j).any():
                c[j] = x[a == j].mean(0)
    return c, a


def parse_rgb(css: str | None):
    if not css or not css.startswith("rgb"):
        return None
    parts = css[css.index("(") + 1: css.index(")")].split(",")
    return tuple(int(float(p)) for p in parts[:3])
