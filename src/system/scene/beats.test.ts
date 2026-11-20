// Tests for the beat helpers (beats.ts) and the sound blocks that use them (blocks/sound.ts).
// The maps here are made up, so the tests do not change when scripts/music_map.py measures the tracks again.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join as joinPath } from "node:path";
import { SOUNDS } from "../media.gen";
import { MUSIC, type MusicMap } from "../music.gen";
import { SYSTEMS } from "../systems";
import { FPS, frameOf, go, makeCtx } from "./context";
import { appearTimes, beats, frame, gainFor, onBeat, peakOf, revealedAt, windowLevel } from "./beats";
import { hit, music, musicFrom, OPEN_RISE, typing } from "./blocks/sound";
import { BLOCKS } from "./blocks";
import type { Node } from "./types";

// A 60 s track at 120 BPM: a beat every 0.5 s from 0.1 s, a bar every 2 s, a drop at 20.1 s.
const beatTimes = Array.from({ length: 120 }, (_, i) => 0.1 + i * 0.5);
const map: MusicMap = {
  duration: 60, bpm: 120, confidence: "high", grid: "fixed", halfTime: false,
  beats: beatTimes, downbeats: beatTimes.filter((_, i) => i % 4 === 0),
  bars: beatTimes.filter((_, i) => i % 4 === 0),
  barLufs: beatTimes.filter((_, i) => i % 4 === 0).map((t) => (t >= 20 && t < 40 ? -10 : -20)),
  barPeak: beatTimes.filter((_, i) => i % 4 === 0).map((t) => (t >= 20 && t < 40 ? -3 : -12)),
  sections: [{ start: 0, end: 20.1, role: "build", material: "A" }, { start: 20.1, end: 40.1, role: "drop", material: "B" }, { start: 40.1, end: 60, role: "outro", material: "A" }],
  drops: [{ t: 20.1, rise: 9 }], onsets: [[20.1, 1], [24.6, 0.8], [30.1, 0.6]], loudest: [10, 11, 12, 13, 14],
  lufs: -14, truePeak: -3, loopShare: 0.3, master: null, gridTrust: "high", gridIssues: [],
};
MUSIC["test-120"] = map;
SOUNDS["test-120"] = { kind: "music", file: "source.mp3", duration: 60, peak: 20.1 };
SOUNDS["test-tick"] = { kind: "sfx", file: "source.mp3", duration: 0.2, peak: 0.05 };
const system = SYSTEMS.find((s) => s.id === "courtside")!;
const ctx = makeCtx(system, 1080, 1920, (t) => t.length * 40);

describe("beats", () => {
  test("maps track time to film time through at and from", () => {
    const b = beats("test-120", { from: 16.1, at: 0, until: 10 });
    expect(b.beats[0]).toBe(0);
    expect(b.beats.length).toBe(21);
    expect(b.drops).toEqual([{ t: 4, rise: 9 }]);
    expect(b.bars).toEqual([0, 2, 4, 6, 8, 10]);
    expect(b.film(20.1)).toBeCloseTo(4);
    expect(b.track(4)).toBeCloseTo(20.1);
  });
  test("snaps to the nearest beat and to a frame", () => {
    const b = beats("test-120", { from: 16.1 });
    expect(b.onBeat(1.12)).toBe(1);
    expect(b.onBar(3.2)).toBe(4);
    expect(onBeat(0.26, [0, 0.5])).toBe(0.5);
    expect(frame(0.3456)).toBeCloseTo(10 / 30);
  });
  test("finds the strongest onset in a window, and the loudest bars in film time", () => {
    const b = beats("test-120", { from: 16.1, until: 20 });
    expect(b.strongest(5, 15)!.t).toBeCloseTo(frame(8.5));
    expect(b.loudest[0]!.t).toBe(4);
  });
  test("unknown track throws and names the maps", () => {
    expect(() => beats("nope", { from: 0 })).toThrow(/test-120/);
  });
});

describe("music", () => {
  test("peakAt puts the drop on the film time", () => {
    expect(musicFrom({ media: "test-120", peakAt: 4.2, until: 12 })).toBeCloseTo(15.9);
    const [n] = music({ media: "test-120", peakAt: 4.2, until: 12 }, ctx) as Extract<Node, { kind: "audio" }>[];
    expect(n!.from).toBeCloseTo(15.9);
  });
  test("align and from", () => {
    expect(musicFrom({ media: "test-120", align: { track: 10, film: 2 } })).toBe(8);
    expect(() => musicFrom({ media: "test-120", from: 1, peakAt: 2 })).toThrow(/exactly one/);
  });
  test("peakAt falls back to the loudest bar when no drop fits", () => {
    expect(peakOf("test-120", "drop", (t) => t > 25)!.kind).toBe("loudest");
    expect(() => musicFrom({ media: "test-120", peakAt: 30, until: 70 })).toThrow(/no drop/);
  });
  test("auto volume reaches the mix target and keeps the true peak under -1 dBTP", () => {
    expect(windowLevel("test-120", 0, 10).lufs).toBeCloseTo(-20, 1);
    // -20 LUFS to the courtside target: the gain is capped by the true peak (-12 dBTP +11 dB = -1).
    const g = gainFor("test-120", 0, 10, { lufs: -14, truePeak: -1 });
    expect(20 * Math.log10(g)).toBeCloseTo(6, 1);
    const g2 = gainFor("test-120", 20.1, 10, { lufs: -14, truePeak: -1 });
    expect(20 * Math.log10(g2)).toBeCloseTo(-4, 1);
    const [n] = music({ media: "test-120", from: 0, until: 10 }, ctx) as Extract<Node, { kind: "audio" }>[];
    expect(n!.volume).toBeCloseTo(g, 3);
    const [m] = music({ media: "test-120", from: 0, until: 10, volume: 0.4 }, ctx) as Extract<Node, { kind: "audio" }>[];
    expect(m!.volume).toBe(0.4);
  });
});

describe("music: master and opening rise", () => {
  const audio = (nodes: Node[]) => nodes[0] as Extract<Node, { kind: "audio" }>;
  test("plays the prepared master when the map names one", () => {
    MUSIC["test-120"] = { ...map, master: "master.wav" };
    expect(audio(music({ media: "test-120", from: 0, until: 10 }, ctx)).src).toBe("test-120/master.wav");
    MUSIC["test-120"] = map;
    expect(audio(music({ media: "test-120", from: 0, until: 10 }, ctx)).src).toBe("test-120/source.mp3");
  });
  test("rises over OPEN_RISE when it enters above the track's mean level", () => {
    // The drop part (-10 LUFS) is louder than the track (-14 LUFS); the intro (-20) is not.
    expect(audio(music({ media: "test-120", from: 20.1, until: 10 }, ctx)).fadeIn).toBe(OPEN_RISE);
    expect(audio(music({ media: "test-120", from: 0, until: 10 }, ctx)).fadeIn).toBeUndefined();
    expect(audio(music({ media: "test-120", from: 20.1, until: 10, fadeIn: 0 }, ctx)).fadeIn).toBe(0);
    const raw = makeCtx(SYSTEMS.find((s) => s.id === "raw")!, 1080, 1920, (t) => t.length * 40);
    expect(raw.instant).toBe(true);
    expect(audio(music({ media: "test-120", from: 20.1, until: 10 }, raw)).fadeIn).toBeUndefined();
  });
});

describe("events", () => {
  const word: Node = { id: "w-0", kind: "text", x: 0, y: 0, text: "Go", role: "display", color: "ink",
    tracks: { opacity: go(ctx, 1, 0, 1), y: go(ctx, 1, 40, 0) } };
  test("revealedAt is the frame the node stops moving", () => {
    const t = revealedAt(system, [word], "w");
    expect(t).toBeCloseTo(frame(1 + ctx.dur.enter), 5);
  });
  test("hit on a node lands its peak on the frame the node has arrived (the first frame that shows the change)", () => {
    const [n] = hit({ id: "h", media: "test-tick", on: { nodes: [word], id: "w" } }, ctx) as Extract<Node, { kind: "audio" }>[];
    expect(n!.at + 0.05).toBeCloseTo(frame(1 + ctx.dur.enter), 5);
  });
  test("hit at a time lands its peak on the first frame after it (frameOf), never a frame later", () => {
    const [n] = hit({ id: "h", media: "test-tick", at: 1 }, ctx) as Extract<Node, { kind: "audio" }>[];
    expect(n!.at + 0.05).toBeCloseTo(31 / 30, 5);
  });
  test("typing ticks once a key and merges keys on one frame", () => {
    const keys: Node[] = [0, 0.1, 0.1, 0.3].map((t, i) => ({ id: `k-${i}`, kind: "text", x: 0, y: 0, text: "a", role: "body", color: "ink",
      tracks: { opacity: [{ t: 0, v: 0 }, { t: Math.max(0, t - 1 / 30), v: 0 }, { t, v: 1, curve: "step" }] } }) as Node);
    expect(appearTimes(system, keys, "k").length).toBe(3);
    expect(typing({ id: "t", media: "test-tick", nodes: keys, of: "k" }, ctx).length).toBe(3);
  });
});

describe("revealedAt: the last part of a block", () => {
  test("a leader shown from frame 0 that draws from 1 s to 2 s has arrived at 2 s, not when its label lands at 1 s", () => {
    const s = SYSTEMS.find((x) => x.id === "spec")!;
    const nodes: Node[] = [
      { id: "c-text", kind: "text", x: 0, y: 0, text: "CABLE", role: "label", color: "ink", tracks: { opacity: [{ t: 0.5, v: 0 }, { t: 1, v: 1, curve: "linear" }] } },
      { id: "c-leader", kind: "path", d: "M0 0L100 0", stroke: "ink", width: 1, tracks: { draw: [{ t: 1, v: 0 }, { t: 2, v: 1, curve: "linear" }] } },
    ];
    expect(revealedAt(s, nodes, "c")).toBeCloseTo(2, 2);
    expect(revealedAt(s, nodes, "c-text")).toBeCloseTo(1, 2);
  });
  test("a shape that slides in, then moves: arrived when the slide ends, not after the move; after names the move", () => {
    // Before: hit({ on }) took the last change before the exit, so a landing sound played on a later move, 2.2 s late.
    const s = SYSTEMS.find((x) => x.id === "cutout")!;
    const c = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
    const wedge = BLOCKS.shape({ id: "wedge", kind: "sector", x: 300, y: 600, w: 400, h: 400, at: 0.3, enter: "slide", moves: [{ at: 2.5, to: [600, 0] }] }, c);
    const landed = revealedAt(s, wedge, "wedge");
    expect(landed).toBeLessThan(1.5);
    expect(landed).toBeGreaterThan(0.3);
    expect(revealedAt(s, wedge, "wedge", 2.5)).toBeGreaterThan(2.5);
  });
  test("a part that leaves does not end the block before its last part arrives", () => {
    const s = SYSTEMS.find((x) => x.id === "spec")!;
    const nodes: Node[] = [
      { id: "d-line", kind: "path", d: "M0 0L100 0", stroke: "ink", width: 1, tracks: { draw: [{ t: 0, v: 0 }, { t: 1.5, v: 1, curve: "linear" }], opacity: [{ t: 0, v: 1 }, { t: 3, v: 1 }, { t: 3.2, v: 0, curve: "linear" }] } },
      { id: "d-value", kind: "text", x: 0, y: 0, text: "10 mm", role: "label", color: "ink", tracks: { opacity: [{ t: 1.5, v: 0 }, { t: 1.7, v: 1, curve: "linear" }, { t: 3, v: 1 }, { t: 3.2, v: 0, curve: "linear" }] } },
    ];
    expect(revealedAt(s, nodes, "d")).toBeCloseTo(1.7, 2);
  });
});


describe("beats on a low-trust grid (an agent's case)", () => {
  test("cuts are the strong onsets, and beats() says so at build; a trusted grid cuts on its beats", () => {
    const base = { duration: 60, bpm: 120, confidence: "high" as const, grid: "fixed" as const, halfTime: false, beats: Array.from({ length: 120 }, (_, i) => i * 0.5), downbeats: [], bars: [0],
      barLufs: [-14], barPeak: [-3], sections: [], drops: [], onsets: [[1.23, 0.9], [2.1, 0.3], [3.37, 0.6]] as [number, number][], loudest: [], lufs: -14, truePeak: -3, loopShare: null, master: null };
    const low = beats({ ...base, gridTrust: "low", gridIssues: ["the cross-check counts 140 BPM against 93 BPM: 2:3"] }, { from: 0, until: 5 });
    expect(low.cuts).toEqual([frame(1.23), frame(3.37)]);
    expect(low.onCut(3.2)).toBeCloseTo(frame(3.37), 5);
    const high = beats({ ...base, gridTrust: "high", gridIssues: [] }, { from: 0, until: 5 });
    expect(high.cuts).toEqual(high.beats);
  });
});

// The scene's beat grid and the detector's grid are one grid: beats() snaps each beat of the music map to the nearest
// frame, a change made there shows on the next frame (frameOf), and sound/cut-on-beat reads the unsnapped beats of
// the same map with a window of that frame and one frame of slack on each side. A film that cuts on every value of
// beats() (on a low-trust grid: every value of cuts) must give no sound/cut-on-beat finding, at any tempo and offset.
describe("a cut on each beats() value passes sound/cut-on-beat", () => {
  const INSPECT = joinPath(import.meta.dir, "../../../scripts/inspect");
  const cases = [
    { media: "noir-music-4", from: 11.37, at: 0 }, // 80 BPM
    { media: "kinetic-music-3", from: 71.679, at: 0 }, // 124 BPM
    { media: "keynote-music-2", from: 40.013, at: 1.5 }, // 151 BPM, a bed that enters late
    { media: "ma-music-3", from: 3.29, at: 0 }, // 87 BPM
    { media: "mark-music-117", from: 36.0, at: 0 }, // low trust: the cuts are the strong onsets
  ];
  const SECONDS = 12;
  // The music files do not ship with the repository: with none on disk, the case does not run.
  const onDisk = (m: string) => spawnSync("test", ["-d", joinPath(import.meta.dir, "../../../assets/media", m)]).status === 0;
  for (const c of cases) {
    test.skipIf(!onDisk(c.media))(`${c.media} from ${c.from} s at ${c.at} s`, () => {
      const g = beats(c.media, { from: c.from, at: c.at, until: SECONDS });
      const times = g.gridTrust === "low" ? g.cuts : g.beats;
      expect(times.length).toBeGreaterThan(4);
      const frames = times.map(frameOf).filter((f) => f > 0 && f < SECONDS * FPS);
      // Small grey frames that change all at once on each cut frame, and hold between cuts.
      const r = spawnSync("python3", ["-c", `import sys, json; sys.path[:0] = ["${INSPECT}", "${joinPath(INSPECT, "checks")}"]
import numpy as np, sound_checks, beat_sync
sound_checks.bed_drop = lambda *a: None  # the drop is not under test: no need to read the bed's file
cuts = set(json.loads(sys.argv[1])); n = ${SECONDS * FPS}
grey, v = [], 0
for f in range(n):
    v ^= f in cuts
    grey.append(np.full((32, 18), 40 + 150 * v, dtype=np.uint8))
class F:
    fps, seconds, n, nodes, notes, tokens, system = 30, ${SECONDS}, n, [], [], {}, None
    change = [0.0] * n
    sound = {"hasSound": True, "beats": {}, "clips": [{"id": "music", "src": "${c.media}/master.wav", "fileKind": "music", "at": ${c.at}, "from": ${c.from}, "until": ${SECONDS}}]}
    def t(self, f): return f / self.fps
f = F(); f.grey = grey
import cuts as cutmod
print(json.dumps({"cuts": cutmod.cut_frames(grey), "findings": [x["measured"] for x in beat_sync.check(f) if x["check"] == "sound/cut-on-beat"]}))`, JSON.stringify(frames)], { encoding: "utf8" });
      expect(r.stderr).toBe("");
      const out = JSON.parse(r.stdout);
      expect(out.cuts).toEqual(frames); // the detector sees every cut, and no other
      expect(out.findings).toEqual([]);
    });
  }
});

describe("beats on a low-trust grid with few cut points", () => {
  // An agent's Graphite film: every onCut call fell on one onset (10.77 s), and nothing at build said so.
  test("onCut calls far apart that land on one cut point warn once at build, with the points there are", () => {
    const base = MUSIC[Object.keys(MUSIC)[0]!]!;
    const map = { ...base, gridTrust: "low" as const, gridIssues: ["a test"], onsets: [[3.0, 1], [3.5, 0.1]] as [number, number][] };
    const said: string[] = [];
    const w = console.warn; console.warn = (m: string) => said.push(String(m));
    try {
      const g = beats(map, { from: 0, until: 10 });
      expect(g.onCut(1)).toBeCloseTo(g.onCut(8), 5);
    } finally { console.warn = w; }
    expect(said.filter((m) => /fewer than the scene asks for/.test(m)).length).toBe(1);
  });
});
