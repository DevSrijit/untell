"""The film as the checks see it: the recording, the capture, the sound and the system's tokens.

A check reads only this. It holds:
  rec       the recording (common.Recording): elements.json, tracks.json and the frames
  cap       out/detector/<id>/capture.json: the scene's nodes and the ink of every text element in every frame
  sound     out/detector/<id>/sound.json: the mixed sound, its loudness, the clips and the beat grids
  tokens    systems/<id>/tokens.json, raw
  limits    the per-system limits, derived from the tokens (see limits_for)
Pixel measures use every recorded frame (frames/*.jpg), not a fixed sample. A frame is read once, small.
"""
import json
import sys
from functools import cached_property
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import ROOT, load  # noqa: E402

DET = ROOT / "out" / "detector"
DRIFT_PX, FAST_PX = 1.5, 3.0  # text_at_rest: a text that drifts this little a frame rests; a view this fast moves
# The small grey copy every pixel measure uses: 1/5 of 1080 x 1920. At this size the grain of a textured
# system (Ma, Riso, Noir) averages out, so a change over CHANGE_DELTA grey levels is a real change.
SMALL = 5
CHANGE_DELTA = 12


class Skip(Exception):
    """A check that cannot run on this film raises Skip with the reason."""


def finding(check, severity, from_s, to_s, measured, limit, fix, node=None):
    out = {"check": check, "severity": severity, "from": round(float(from_s), 2), "to": round(float(to_s), 2),
           "measured": measured, "limit": limit, "fix": fix}
    if node:
        out["node"] = node
    return out


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def music_bpm(sound):
    """The tempo of the film's music bed: the BPM of its first music clip that has a beat grid, or None."""
    for c in (sound or {}).get("clips") or []:
        if c.get("fileKind") == "music":
            bpm = ((sound.get("beats") or {}).get(c.get("src")) or {}).get("bpm")
            if bpm:
                return bpm
    return None


def max_still_for(d, bpm):
    """The stall limit for a tempo, as maxStillFor in src/system/direction.ts: the larger of maxStill and
    maxStillBeats at that tempo, when the direction states beats and the film has a tempo."""
    if d.get("maxStillBeats") and bpm:
        # A word held that many beats, cut on the beat, measures up to a few frames longer on the frame grid (a change
        # shows on the frame after its time, and the cut's own frame counts): 4 frames of slack, so the system's own
        # rhythm (Kinetic: a word for two beats) is not a stall.
        return max(d["maxStill"], d["maxStillBeats"] * 60 / bpm + 4 / 30)
    return d["maxStill"]


def limits_for(tokens, bpm=None):
    """Per-system limits. A calm system (long holds, slow entrances) may hold and leave space; a fast one may not.
    The system's direction (tokens "direction", from src/system/direction.ts) states the stall limit, the hook,
    the end and the mix target; where it is missing, the limits derive from density.minHoldBase (the shortest
    hold), motion.frames.enter (the length of an entrance) and media.pictures.placements."""
    if not tokens:
        hold, enter, placements = 1.2, 12, []
    else:
        hold = tokens["density"]["minHoldBase"]
        enter = tokens["motion"]["frames"]["enter"]
        placements = tokens.get("media", {}).get("pictures", {}).get("placements", [])
    roomy = "small-in-field" in placements  # emptiness is part of the design
    d = (tokens or {}).get("direction") or {}
    ends = d.get("ends") or {}
    mix = d.get("mix") or {}
    return {
        # From the direction where it is present.
        "hookShow": (d.get("hook") or {}).get("show"),
        "hookRole": (d.get("hook") or {}).get("role"),
        "hookArea": (d.get("hook") or {}).get("area"),
        "hookShowBy": (d.get("hook") or {}).get("by"),
        "endKind": ends.get("kind"),
        "lufs": mix.get("lufs", -16.0),
        "lufsRange": mix.get("range", 2.0),
        # hook: by 1.0 s something moved and a subject shows; text alone at the start for at most this long.
        "hookBy": 1.0,
        "textAlone": round(clamp(hold, 1.0, 2.4), 2),
        # stall: no visible change for longer than this, outside a declared hold.
        # With maxStillBeats, a stretch of that many beats at the music's tempo is the system's rhythm, not a stall.
        "stall": round(max_still_for(d, bpm), 2) if d.get("maxStill") is not None else round(clamp(hold + 0.6, 1.2, 3.5), 2),
        # dead-space: a band empty for longer than this.
        "deadSpace": round(clamp(1.5 * hold, 1.5, 4.0) * (3 if roomy else 1), 2),
        # dead-space, when the empty band is part of an empty span of 40 % of the frame or more: one shortest hold
        # (1.5 to 2.4 s: a fast system's 1.0 s would fail its own flash framing).
        "deadSpan": round(clamp(hold, 1.5, 2.4) * (3 if roomy else 1), 2),
        # message-gap: no sentence or headline on screen for longer than this, while no picture leads.
        "messageGap": round(max(1.5, hold), 2),
        # ending: the closing hold must last at least this long (a held end card).
        "endHold": ends["hold"] if ends.get("hold") is not None else round(clamp(hold * 0.6, 0.6, 1.5), 2),
        "endHoldMax": round(max(clamp(hold + 1.5, 2.5, 4.0), (ends.get("hold") or 0) + 1.5), 2),
        "enterFrames": enter,
    }


class Film:
    def __init__(self, rec_id):
        self.id = rec_id
        self.rec = load(rec_id)
        d = DET / rec_id
        self.cap = json.loads((d / "capture.json").read_text())
        self.sound = json.loads((d / "sound.json").read_text()) if (d / "sound.json").exists() else {"hasSound": False}
        el = json.loads((self.rec.dir / "elements.json").read_text())
        self.system = el.get("system")
        tp = ROOT / "systems" / (self.system or "") / "tokens.json"
        self.tokens = json.loads(tp.read_text()) if self.system and tp.exists() else None
        self.limits = limits_for(self.tokens, music_bpm(self.sound))
        self.fps, self.W, self.H, self.n = self.rec.fps, self.rec.width, self.rec.height, self.rec.n
        self.nodes = self.cap.get("nodes") or []
        self.ink = self.cap["ink"]
        # Letters go out only when a text's ink changed (see detect.ts): carry them forward to every frame.
        last = {}
        for fr in self.ink:
            for t in fr:
                if t.get("letters") is not None:
                    last[t["id"]] = (t["ink"], t["letters"])
                elif t["id"] in last and last[t["id"]][0] == t["ink"]:
                    t["letters"] = last[t["id"]][1]
        # Text that lies wholly outside the frame is not on screen: a camera move took it out, or it waits outside for
        # the camera. No check reads it (it is not clipped, not small, not shown). film.ink_off keeps it per frame.
        self.ink_off = []
        for f, fr in enumerate(self.ink):
            keep, off = [], []
            for t in fr:
                x0, y0, x1, y1 = t["ink"]
                (keep if x1 > 0 and y1 > 0 and x0 < self.W and y0 < self.H else off).append(t)
            self.ink[f] = keep
            self.ink_off.append(off)
        self.notes = []  # facts a check reports that are not findings (where the drop lands)

    # ---------- time ----------
    def t(self, f):
        return f / self.fps

    @property
    def seconds(self):
        return self.n / self.fps

    def runs(self, flags, min_len=1):
        """Runs of True as (first, last) frame pairs."""
        out, start = [], None
        for f, v in enumerate(list(flags) + [False]):
            if v and start is None:
                start = f
            elif not v and start is not None:
                if f - start >= min_len:
                    out.append((start, f - 1))
                start = None
        return out

    # ---------- pixels ----------
    @cached_property
    def _small_frames(self):
        """The grey and the colour copies of every frame, from one decode of each distinct frame file.
        The recorder copies a frame that does not change, so equal files decode once. Decodes run on threads
        (PIL releases the interpreter lock while it decodes and resizes). The values are the same as two
        separate decodes: the same PIL calls on the same decoded picture."""
        import hashlib
        import os
        from concurrent.futures import ThreadPoolExecutor
        small, smaller = (self.W // SMALL, self.H // SMALL), (self.W // (2 * SMALL), self.H // (2 * SMALL))
        paths = [self.rec.dir / "frames" / f"f{f:04d}.jpg" for f in range(self.n)]
        digests = [hashlib.blake2b(p.read_bytes(), digest_size=16).digest() for p in paths]
        first = {}
        for i, d in enumerate(digests):
            first.setdefault(d, i)

        def both(i):
            im = Image.open(paths[i])
            im.load()
            return (np.asarray(im.convert("L").resize(small, Image.BILINEAR), dtype=np.int16),
                    np.asarray(im.convert("RGB").resize(smaller, Image.BILINEAR), dtype=np.int16))
        todo = sorted(set(first.values()))
        with ThreadPoolExecutor(max(1, min(8, (os.cpu_count() or 2) // 2))) as ex:
            done = dict(zip(todo, ex.map(both, todo)))
        return np.stack([done[first[d]][0] for d in digests]), np.stack([done[first[d]][1] for d in digests])

    @cached_property
    def grey(self):
        """Every frame, grey, 1/SMALL size, as int16 (n, h, w)."""
        return self._small_frames[0]

    @cached_property
    def rgb(self):
        """Every frame, RGB, 1/(2*SMALL) size, as int16 (n, h, w, 3)."""
        return self._small_frames[1]

    @cached_property
    def change(self):
        """Share of the frame that changed from the frame before (index 0 is 0)."""
        g = self.grey
        out = np.zeros(self.n)
        out[1:] = (np.abs(g[1:] - g[:-1]) > CHANGE_DELTA).reshape(self.n - 1, -1).mean(axis=1)
        return out

    @cached_property
    def drawn(self):
        """Per frame: True when the capture says something changed from the frame before (motion_measure: a text that
        types, a stroke that draws, a picture that enters or moves). Thin changes the pixel measure misses count."""
        import motion_measure
        return motion_measure.changed(self.cap, self.n, [self.elements(f) for f in range(self.n)])

    @cached_property
    def change_lag(self):
        """Share of the frame that changed from the frame 0.2 s before (the repository's hold measure, run.py)."""
        lag = max(1, self.fps // 5)
        g = self.grey
        out = np.zeros(self.n)
        for f in range(1, self.n):
            out[f] = float((np.abs(g[f] - g[max(0, f - lag)]) > CHANGE_DELTA).mean())
        return out

    @cached_property
    def ground(self):
        """The ground colour: the most common colour of the whole film (bins of 8)."""
        q = (self.rgb[:: max(1, self.n // 60)] // 8).reshape(-1, 3)
        keys, counts = np.unique(q[:, 0] * 1024 + q[:, 1] * 32 + q[:, 2], return_counts=True)
        k = int(keys[counts.argmax()])
        return np.array([(k // 1024) * 8 + 4, ((k // 32) % 32) * 8 + 4, (k % 32) * 8 + 4])

    def png_or_jpg(self, f):
        return self.rec.frame(f)

    # ---------- elements ----------
    def elements(self, f):
        return self.rec.elements[f] or []

    def content(self, f, min_opacity=0.5):
        return self.rec.content(f, min_opacity)

    @staticmethod
    def label(eid):
        """The data-el label of an element id ("label:path"), or the path when it has none."""
        return eid.split(":")[0] if ":" in eid else eid

    def node(self, label):
        return next((n for n in self.nodes if n.get("id") == label), None)

    @cached_property
    def _pinned(self):
        return {n.get("id") for n in self.nodes if n.get("pinned")}

    def in_world(self, f, e):
        """The element with its box in the world's coordinates: the camera's pan and zoom on frame f taken out (the
        renderer draws the world at translate(-cam) scale(s) about the frame's centre; the camera element holds the
        centre it looks at and its scale). A pinned node (screen space) and a frame with no camera keep their box.
        A part that moves only because the camera moves then stands still: the motion checks judge what the scene
        moves, and the camera's own move is one move of the view."""
        # Only the scene's parts (a labelled element): the world's own container keeps its box.
        if e.get("kind") == "camera" or e.get("layer") != "content" or ":" not in e["id"] or self.label(e["id"]) in self._pinned:
            return e
        cam = next((c for c in self.elements(f) if c["kind"] == "camera"), None)
        if cam is None:
            return e
        k = cam.get("scale") or 1
        if abs(cam["x"] - self.W / 2) < 1e-6 and abs(cam["y"] - self.H / 2) < 1e-6 and abs(k - 1) < 1e-9:
            return e
        # "_world": the camera zooms or moves on this frame. The recorder rounds a text box to whole px while the camera
        # moves smoothly, so the mapped box carries up to a pixel of noise; the motion checks take a move under 1 px a
        # frame as that noise. A camera at rest at zoom 1 maps exactly, and the box keeps the fine floor.
        noisy = abs(k - 1) > 1e-6 or self.view_moving[f]
        return {**e, "x": self.W / 2 + (e["x"] - self.W + cam["x"]) / k, "y": self.H / 2 + (e["y"] - self.H + cam["y"]) / k, "w": e["w"] / k, "h": e["h"] / k,
                **({"_world": True} if noisy else {})}

    @cached_property
    def holds(self):
        """Declared holds (the hold block) as (from, to) seconds."""
        out = []
        for n in self.nodes:
            if n.get("kind") != "hold":
                continue
            keys = (n.get("tracks") or {}).get("opacity") or []
            on = [k["t"] for k in keys if k["v"] > 0]
            off = [k["t"] for k in keys if k["v"] == 0 and on and k["t"] > min(on)]
            a = min(on) if on else 0
            b = min(off) if off else self.seconds
            out.append((a, b))
        return out

    def in_hold(self, f):
        t = self.t(f)
        return any(a - 1e-6 <= t <= b + 1e-6 for a, b in self.holds)

    def role_of(self, size_px):
        """The type role whose size is nearest to a font size in px (for text the renderer did not mark)."""
        if not self.tokens:
            return None
        short = min(self.W, self.H)
        return min(self.tokens["type"], key=lambda r: abs(self.tokens["type"][r]["size"] * short - size_px))

    def bleed_roles(self):
        return set((self.tokens or {}).get("bleed", []) or [])

    def is_picture(self, e):
        return e.get("kind") == "image"

    @cached_property
    def view_moving(self):
        """Per frame: True when the view moves (a camera move or a pan), from the frame before to this frame.
        Evidence, in order: the camera element of the recording changes (the kit's World); a layer that fills the
        frame (the scene's SVG shape layer) moves; or most content elements (3 or more, 60 %) move by one shared step.
        A recording of a page without the World keeps the camera element at 0,0,1, so the layers are the evidence there."""
        out = [False] * self.n
        self.view_speed = [0.0] * self.n
        for f in range(1, self.n):
            prev = {e["id"]: e for e in self.elements(f - 1)}
            moved, steps, speed = False, [], 0.0
            for e in self.elements(f):
                p = prev.get(e["id"])
                if p is None:
                    continue
                if e["kind"] == "camera":
                    if abs(p["x"] - e["x"]) + abs(p["y"] - e["y"]) > 0.5 or abs(p.get("scale", 1) - e.get("scale", 1)) > 0.002:
                        moved = True
                        speed = max(speed, abs(p["x"] - e["x"]) + abs(p["y"] - e["y"]) + 1000 * abs(p.get("scale", 1) - e.get("scale", 1)))
                    continue
                if e["layer"] != "content":
                    continue
                d = (e["x"] - p["x"], e["y"] - p["y"])
                if e["w"] * e["h"] >= 0.9 * self.W * self.H and e["kind"] in ("svg", "box") and abs(d[0]) + abs(d[1]) >= 0.5:
                    moved = True
                    speed = max(speed, abs(d[0]) + abs(d[1]))
                steps.append(d)
            if not moved and len(steps) >= 3:
                big = [d for d in steps if abs(d[0]) + abs(d[1]) >= 1]
                if len(big) >= 0.6 * len(steps):
                    mx, my = float(np.median([d[0] for d in big])), float(np.median([d[1] for d in big]))
                    if sum(1 for d in big if abs(d[0] - mx) + abs(d[1] - my) < 2) >= 0.6 * len(steps):
                        moved = True
                        speed = max(speed, abs(mx) + abs(my))
            out[f] = moved
            self.view_speed[f] = speed
        return out

    @staticmethod
    def track_at(keys, t):
        """The value of a node's track at time t: linear between keys, held after the last ("step" holds the value before)."""
        if not keys:
            return None
        if t <= keys[0]["t"]:
            return keys[0]["v"]
        for a, b in zip(keys, keys[1:]):
            if a["t"] <= t <= b["t"]:
                if b.get("curve") == "step" or b["t"] == a["t"]:
                    return a["v"] if t < b["t"] else b["v"]
                return a["v"] + (b["v"] - a["v"]) * (t - a["t"]) / (b["t"] - a["t"])
        return keys[-1]["v"]

    @cached_property
    def blurred(self):
        """Per frame: True when a node's blur track (blur, blurX, blurY: a whip's motion blur, a defocus) is over 0.5."""
        tracks = [v for n in self.nodes for k, v in ((n.get("tracks") or {}).items()) if k.lower().startswith("blur") and v]
        return [any(abs(self.track_at(keys, self.t(f)) or 0) > 0.5 for keys in tracks) for f in range(self.n)]

    @cached_property
    def _ink_at(self):
        return [{t["id"]: t["ink"] for t in fr} for fr in self.ink]

    def text_at_rest(self, f, t):
        """The shared rest test for every text check (contrast, reading, type): the text's ink is where it was on the
        frame before and where it is on the frame after (within DRIFT_PX: a slow push or drift reads as at rest), the
        view does not move faster than FAST_PX a frame within a frame of f (a whip, a scroll), and no blur track (a
        whip's motion blur) is on. A text in transit or under a system's own blur is not read."""
        _ = self.view_moving  # fills view_speed
        if self.blurred[f] or any(self.view_speed[g] > FAST_PX for g in range(max(0, f - 1), min(self.n, f + 2))):
            return False
        ink = t["ink"]
        for g in (f - 1, f + 1):
            if not 0 <= g < self.n:
                continue
            other = self._ink_at[g].get(t["id"])
            if other is None or max(abs(a - b) for a, b in zip(other, ink)) > DRIFT_PX:
                return False
        return True

    def near_view_move(self, f, pad=1):
        """True when the view moves within `pad` frames of frame f."""
        return any(self.view_moving[k] for k in range(max(0, f - pad), min(self.n, f + pad + 1)))

    @cached_property
    def _families(self):
        """Font family of each text element id (from elements.json)."""
        fam = {}
        for f in range(self.n):
            for e in self.elements(f):
                if e.get("kind") == "text" and e.get("fontFamily"):
                    fam.setdefault(e["id"], e["fontFamily"])
        return fam

    def is_code(self, t):
        """True for code or terminal text. A text in the label role is not (a label in mono is still a label). Else a
        text whose node is marked data-content "code" is code, and "prose" or "data" is not, whatever its face. Else,
        with the system's tokens: the text is set in the system's mono face
        (tokens fonts.mono, when it is not also the face of its prose: Console sets everything in one mono face, so
        there a face says nothing), or in a role whose font is "mono"; and its role is not "label" (Spec, Schematic
        and Raw set labels in mono: a label in mono is still a label). Without tokens: a monospace family name."""
        import re
        role = t.get("role") or self.role_of(t.get("fontPx") or 0)
        if role == "label":
            return False  # a label in mono is still a label (its own size rule), code or not
        # What the renderer marks (data-content on the text's node, capture version 5) decides next.
        if t.get("content") == "code":
            return True
        if t.get("content") in ("prose", "data"):
            return False
        fam = (self._families.get(t["id"]) or "").lower()
        fonts = (self.tokens or {}).get("fonts") or {}
        if self.tokens:
            mono = (fonts.get("mono") or "").lower()
            prose = {(fonts.get(k) or "").lower() for k in ("text", "display")}
            if mono and mono not in prose and fam and mono in fam:
                return True
            return bool(role and (self.tokens.get("type", {}).get(role) or {}).get("font") == "mono" and mono and mono not in prose)
        return bool(re.search(r"mono|code|consol|menlo", fam))

    def is_ui(self, f, t):
        """True for text inside a product UI pane (a box of 8 to 90 % of the frame) in a system whose hook is product UI
        (direction.hook.how names "UI": Graphite). Its rows, labels and values are the product's data, read as UI,
        not as prose: density and type-over-media's body rule do not count them (an agent's Graphite film declared both)."""
        how = (((self.tokens or {}).get("direction") or {}).get("hook") or {}).get("how") or ""
        if "UI" not in how:
            return False
        x0, y0, x1, y1 = t["ink"]
        area = self.W * self.H
        return any(e["kind"] == "box" and 0.08 * area <= e["w"] * e["h"] <= 0.9 * area and e["x"] - 2 <= x0 and e["y"] - 2 <= y0
                   and x1 <= e["x"] + e["w"] + 2 and y1 <= e["y"] + e["h"] + 2 for e in self.content(f, 0.5))

    def picture_hero(self, f):
        """True when a picture (photo, clip, 3D canvas) fills at least 20 % of the frame at frame f."""
        area = self.W * self.H
        for e in self.content(f, 0.5):
            if e["kind"] == "image" and e["w"] * e["h"] >= 0.2 * area:
                return True
        for e in self.elements(f):
            if e["kind"] == "image" and e["opacity"] >= 0.5 and e["w"] * e["h"] >= 0.2 * area:
                return True
        return False


def gesture(film, label):
    """The designed gesture a part belongs to: the parts of one block's gesture (the digit columns of a counter, the
    bars of one chart, the rows of one list) move as one mover. The block's own `group` tag on its node (capture
    nodes: "group", or data.group) comes first; else the block id: the node id before its first "-" (a block names its
    parts <block id>-<part>)."""
    cache = getattr(film, "_gesture", None)
    if cache is None:
        cache = film._gesture = {}
        for n in film.nodes:
            g = n.get("group") or (n.get("data") or {}).get("group")
            if g:
                cache[n.get("id")] = str(g)
    lab = film.label(label)
    return cache.get(lab) or lab.split("-")[0]


def entrances(film):
    """Per frame: what cuts or fades in on that frame (first frame at opacity 0.5 after a frame below it), as
    {"f", "keys", "area", "shapes": [(key, box, fill)], "texts": [(key, ink, text)]}. Text by its node (the ink), SVG
    shapes by their painted box (the capture), and boxes and pictures by their element. Nothing counts on a frame
    where the view moves (a pan brings things into the frame; that is not an entrance) or on frame 0. Cached."""
    if getattr(film, "_entrances", None) is not None:
        return film._entrances
    shapes = (film.cap.get("shapes") or {}).get("frames") or [[] for _ in range(film.n)]
    def seen(f):
        out = {}
        for t in film.ink[f]:
            if t["opacity"] >= 0.5:
                k = "t:" + (t.get("node") or film.label(t["id"]))
                x0, y0, x1, y1 = t["ink"]
                out.setdefault(k, ("text", (x0, y0, x1, y1), t["text"]))
        for s in shapes[f] if f < len(shapes) else []:
            if s.get("opacity", 1) >= 0.5 and s.get("layer") not in ("ground", "texture"):
                out.setdefault("s:" + s["id"], ("shape", tuple(s["box"]), s.get("fill") or s.get("stroke")))
        for e in film.content(f, 0.5):
            if e["kind"] in ("box", "image"):
                out.setdefault("e:" + film.label(e["id"]), (e["kind"], (e["x"], e["y"], e["x"] + e["w"], e["y"] + e["h"]), e.get("fill")))
        return out
    prev = seen(0)
    res = []
    for f in range(1, film.n):
        cur = seen(f)
        new = {k: v for k, v in cur.items() if k not in prev}
        prev = cur
        if not new or film.near_view_move(f, 1):
            continue
        area = 0.0
        for kind, (x0, y0, x1, y1), _ in new.values():
            area += max(0, min(x1, film.W) - max(x0, 0)) * max(0, min(y1, film.H) - max(y0, 0))
        res.append({"f": f, "keys": sorted(new), "area": area / (film.W * film.H),
                    "items": [(k, kind, box, extra) for k, (kind, box, extra) in new.items()]})
    film._entrances = res
    return res


def state_nodes(film):
    """The ids of the texts and marks that show a UI state (node `state`: a selected row's text in the selected colour)
    and their other copies (the same `group`): a change of state, not an entrance of content."""
    nodes = [n for n in film.nodes if isinstance(n, dict)]
    groups = {n.get("group") for n in nodes if n.get("state") and n.get("group")}
    return {n.get("id") for n in nodes if n.get("state") or (n.get("group") and n.get("group") in groups)}


def entrance_groups(film, window=3):
    """Entrances that land within `window` frames of each other, merged: {"f" (first), "last", "keys", "area", "items"}."""
    out = []
    for e in entrances(film):
        if out and e["f"] - out[-1]["last"] <= window:
            g = out[-1]
            g["last"] = e["f"]
            g["keys"] += e["keys"]
            g["area"] += e["area"]
            g["items"] += e["items"]
        else:
            out.append({"f": e["f"], "last": e["f"], "keys": list(e["keys"]), "area": e["area"], "items": list(e["items"])})
    return out


def picture_events(film, min_items=2, min_area=0.01):
    """Times (s) of picture events for the sound checks: two or more things cut in on one frame, or one thing of at
    least 1 % of the frame."""
    return [round(film.t(e["f"]), 3) for e in entrances(film) if len(e["keys"]) >= min_items or e["area"] >= min_area]


def declared_reveal(film):
    """The reveal the scene declares, in seconds, or None: an anchor node with the id "reveal" (a scene can push
    { id: "reveal", kind: "anchor", x: 0, y: 0, w: 0, h: 0, at: <seconds> }), else the anchor of a terminal's result
    line (terminal session output { result: true } gives "<id>-result"). Returns (seconds, how)."""
    anchors = [n for n in film.nodes if n.get("kind") == "anchor" and n.get("at") is not None]
    for n in anchors:
        if n["id"] == "reveal" or n["id"].endswith(":reveal") or (n.get("data") or {}).get("role") == "reveal":
            return float(n["at"]), f"declared: anchor {n['id']}"
    for n in anchors:
        if n["id"].endswith("-result"):
            return float(n["at"]), f"the terminal's result line ({n['id']})"
    return None


def _moved(p, e):
    return abs(p["x"] - e["x"]) + abs(p["y"] - e["y"]) + abs(p["w"] - e["w"]) + abs(p["h"] - e["h"]) >= 1 or abs(p.get("rotation", 0) - e.get("rotation", 0)) >= 0.5


def moving_elements(film):
    """Per frame: the content elements (opacity 0.3 or more) that moved, scaled or turned since the frame before.
    Cached on the film. Elements that only change opacity do not count as moving."""
    if getattr(film, "_moving", None) is not None:
        return film._moving
    out = [[]]
    for f in range(1, film.n):
        prev = {e["id"]: e for e in film.elements(f - 1)}
        out.append([e for e in film.content(f, 0.3) if e["id"] in prev and _moved(prev[e["id"]], e)])
    film._moving = out
    return out


def motion_starts(film, rest=3):
    """(frame, element) for each start of a move after at least `rest` still frames."""
    mov = moving_elements(film)
    last = {}
    starts = []
    for f in range(1, film.n):
        for e in mov[f]:
            k = e["id"]
            if f - last.get(k, -99) > rest:
                starts.append((f, e))
            last[k] = f
    return starts
