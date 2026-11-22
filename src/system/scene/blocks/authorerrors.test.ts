// Author errors never reach the guard's "bug in the block" throw. Every block, in every system, with its timed lists
// squeezed close together (closer than a move takes) and with times before 0: a block either draws, or throws an
// error that says what the scene gave and what to give. Before: shape turns 0.56 s apart, and a turn at -1 s, threw
// "keys out of time order ... This is a bug in the block".
import { expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import type { Node } from "../types";
import { BLOCKS } from ".";
import { FIXTURES } from "./contract.test";
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
// Squeeze every list of timed objects (and number lists named like times) to near-equal times.
function squeeze(v: unknown, at: number, d: number): unknown {
  if (Array.isArray(v)) {
    if (v.length >= 2 && v.every((x) => x && typeof x === "object" && typeof (x as any).at === "number")) return v.map((x, i) => ({ ...(x as object), at: at + i * d }));
    return v.map((x) => squeeze(x, at, d));
  }
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, squeeze(x, at, d)]));
  return v;
}
test("timed lists squeezed together, and times before 0, give author errors, never a bug in the block", () => {
  const hits = new Set<string>();
  for (const s of SYSTEMS) {
    const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
    for (const [name, fx] of Object.entries(FIXTURES)) {
      const extra: Record<string, unknown> = name === "shape" ? { turns: [{ at: 1, by: 90 }, { at: 1.1, by: 90 }], moves: [{ at: 1, to: [10, 0] }, { at: 1.05, to: [20, 0] }], squash: [1, 1.05] } : {};
      for (const at of [-1, -0.2, 0, 1]) for (const d of [0.01, 0.05, 0.2]) {
        const props = at === -1 && name === 'shape' ? { ...(fx(at) as object), turns: [{ at: -1, by: 90 }, { at: 2, by: 90 }], moves: [{ at: -1, to: [10, 0] }, { at: 2, to: [20, 0] }], angle: 10 } : squeeze({ ...(fx(at) as object), ...(at === 1 ? extra : at === -1 ? { ...(name === 'gear' ? { turns: [{ at: -1, until: 1, turns: 1 }, { at: 1.5, until: 3, turns: 1 }] } : {}) } : {}) }, at + 0.1, d);
        try { quiet(() => (BLOCKS as any)[name](props, ctx) as Node[]); } catch (e) { const m = (e as Error).message; if (/bug in the block/.test(m)) hits.add(`${name} [${s.id}] at ${at} d ${d}: ${m.slice(0, 200)}`); }
      }
    }
  }
  expect([...hits]).toEqual([]);
});

test("shape: the error names the two turns and the gap; a turn before 0 rests turned at frame 0; angle sets the start", () => {
  const s = SYSTEMS.find((x) => x.id === "cutout")!;
  const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
  const base = { id: "hand", kind: "rect" as const, x: 400, y: 600, w: 40, h: 300, at: 0 };
  expect(() => quiet(() => BLOCKS.shape({ ...base, turns: [{ at: 0.9, by: 30 }, { at: 1.46, by: 30 }] }, ctx))).toThrow(/turns\[0\] at 0\.900 s and turns\[1\] at 1\.460 s are 0\.560 s apart/);
  const rot = (p: object) => ((quiet(() => BLOCKS.shape({ ...base, ...p }, ctx))[0] as Node).tracks!.rotate ?? [])[0]?.v;
  expect(rot({ turns: [{ at: -1, by: -30 }, { at: 2, by: 30 }], angle: 15 })).toBe(-15);
  expect(rot({ angle: 15 })).toBe(15);
});

test("wipeTimes.show in a 12 fps system: on a tick frame, at or after the smooth time, at most 2.5 frames later", async () => {
  // Before: show() read the shape's continuous motion; the render showed the word on the next 12 fps tick (7.27 s for 7.2).
  const { wipeTimes } = await import("./wipe");
  const s = SYSTEMS.find((x) => x.id === "cutout")!;
  const smooth = { ...s, step: undefined };
  const mk = (sys: typeof s) => makeCtx(sys, 1080, 1920, (t, r) => t.length * sys.type[r].size * 1080 * 0.5);
  const ticks = new Set(Array.from({ length: 200 }, (_, k) => Math.round((k * 30) / 12)));
  for (const x of [100, 300, 500, 700]) {
    const b = { x, y: 900, w: 200, h: 120 };
    const stepped = wipeTimes(mk(s), { id: "w", at: 6.8, from: "left", style: "panel" }).show(b);
    const plain = wipeTimes(mk(smooth as typeof s), { id: "w", at: 6.8, from: "left", style: "panel" }).show(b);
    expect(ticks.has(Math.round(stepped * 30))).toBe(true);
    expect(stepped).toBeGreaterThanOrEqual(plain - 1e-6);
    expect(stepped - plain).toBeLessThanOrEqual(2.5 / 30 + 1e-6);
  }
});

test("sound blocks with times at 0 and before 0: no clip of no length, no bug in the block", async () => {
  // Before: typing with a key at 0 s made a clip of zero duration and stopped the build.
  const { SOUNDS } = await import("../../media.gen");
  const { MUSIC } = await import("../../music.gen");
  const sfx = Object.keys(SOUNDS).filter((k) => SOUNDS[k]!.kind === "sfx").slice(0, 6);
  const track = Object.keys(MUSIC)[0]!;
  const problems: string[] = [];
  const run = (what: string, f: () => Node[]) => {
    try {
      for (const n of quiet(f)) if (n.kind === "audio" && !((n.until ?? Infinity) - n.at > 0)) problems.push(`${what}: ${n.id} ${n.at}-${n.until}`);
    } catch (e) { if (/bug in the block|plays from/.test((e as Error).message)) problems.push(`${what}: ${(e as Error).message.slice(0, 160)}`); }
  };
  for (const id of ["manual", "riso", "raw"]) {
    const s = SYSTEMS.find((x) => x.id === id)!;
    const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
    for (const media of sfx) {
      for (const at of [-1, -0.04, 0, 0.01, 1 / 30]) run(`hit ${media} ${at} [${id}]`, () => BLOCKS.hit({ id: "h", media, at }, ctx));
      for (const first of [-0.5, 0, 1 / 30]) {
        const keys: Node[] = Array.from({ length: 6 }, (_, i) => ({ id: `k-c${i}`, kind: "text", x: 0, y: 0, text: "a", role: "body", color: "ink",
          tracks: { opacity: [{ t: 0, v: 0 }, { t: Math.max(0, first + i / 30 - 1 / 30), v: 0 }, { t: Math.max(0, first + i / 30), v: 1, curve: "step" }] } }) as Node);
        run(`typing ${media} from ${first} [${id}]`, () => BLOCKS.typing({ id: "t", media, nodes: keys, of: "k", every: 1 }, ctx));
      }
    }
    for (const at of [-2, 0]) run(`music ${track} at ${at} [${id}]`, () => BLOCKS.music({ media: track, at, until: 6 }, ctx));
    run(`music ${track} peakAt 0 [${id}]`, () => BLOCKS.music({ media: track, peakAt: 0, until: 6 }, ctx));
  }
  expect(problems).toEqual([]);
});
