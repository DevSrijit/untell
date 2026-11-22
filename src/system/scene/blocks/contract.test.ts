// The block contract, tested on every block at once. One table gives each block small, valid props with `at` as a
// parameter (every other time in the props is `at` plus an offset), so four rules run on all blocks:
// - Same frame (item 12): a block that enters at t first changes on frameOf(t), the first frame after t. Two blocks
//   given the same time change on the same frame, in every system that moves on each frame.
// - Rest from frame 0 (item 13): a block with `at` before the film shows at rest on frame 0: the frame equals the
//   frame of the same block long after it entered, and something shows.
// - Times (item 11): a time the block cannot honour throws (NaN, an until before its at, a list out of order),
//   and every track the block returns is in time order.
// - Documented defaults (item 4): a prop whose doc says "Default: <value>" gives the same nodes when it is left
//   out and when it is given that value.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MEDIA } from "../../media.gen";
import { SYSTEMS } from "../../systems";
import { frameOf, makeCtx } from "../context";
import { evaluate, withSystemMotion } from "../time";
import type { Ctx, Node, Prop } from "../types";
import { BLOCKS } from ".";

const ctxOf = (id: string, w = 1080, h = 1920): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * 0.5);
};
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
MEDIA["contract-photo"] = { kind: "photo", width: 2400, height: 3600, subject: [0.3, 0.3, 0.7, 0.7], centre: [0.5, 0.5], grade: "spec", mask: null };

const X = 200, Y = 420, W = 640, H = 800;
// A wheel at rest for the rope's fixture: the rope reads its geometry only.
const WHEEL = BLOCKS.pulley({ id: "wheel", cx: 540, cy: 900, r: 120, at: -1 }, ctxOf("spec"));
const box = { x: X, y: Y, w: W, h: H };
type Fixture = (at: number) => Record<string, unknown>;

/** Small valid props for each block. Every time is `at` plus an offset, so the block can move in time as a whole. */
export const FIXTURES: Record<string, Fixture> = {
  lineChart: (at) => ({ ...box, title: "Height of the ball, m", xLabels: ["0", "1", "2", "3"], series: [{ label: "Ball", values: [0, 4.9, 2.1, 0.4] }], at }),
  arrow: (at) => ({ from: [200, 600], to: [700, 900], at }),
  box: (at) => ({ ...box, label: "Cache", at }),
  shape: (at) => ({ kind: "square", x: 300, y: 600, w: 200, h: 200, at }),
  text: (at) => ({ x: X, y: Y, text: "Halve the list on each look.", role: "body", at }),
  title: (at) => ({ x: X, y: Y, w: W, text: "Find 28 in a sorted list.", at }),
  rule: (at) => ({ x1: X, y1: 700, x2: X + W, y2: 700, at }),
  curve: (at) => ({ fn: (x: number) => x * x, domain: [-1, 1], box: { x: X, y: 700, w: W, h: 300 }, at }),
  bar: (at) => ({ x: X, y: 700, w: W, h: 80, value: 6, max: 10, at }),
  typeOn: (at) => ({ x: X, y: Y, text: "ls -la", at }),
  cross: (at) => ({ x: 400, y: 700, at }),
  frameGrid: (at) => ({ at }),
  barChart: (at) => ({ ...box, title: "Looks, by size", categories: ["16", "1k", "1M"], series: [{ label: "Looks", values: [4, 10, 20] }], at }),
  slopeChart: (at) => ({ ...box, title: "Cache reads, %", fromLabel: "Before", toLabel: "After", items: [{ label: "Edge", from: 40, to: 80 }, { label: "Origin", from: 60, to: 20 }], at }),
  dumbbell: (at) => ({ ...box, title: "Load, s", fromLabel: "Cold", toLabel: "Warm", rows: [{ label: "Home", from: 3.2, to: 1.1 }, { label: "Search", from: 2.4, to: 0.9 }], at }),
  stackedBar: (at) => ({ ...box, title: "Time per request, ms", parts: ["DNS", "TLS", "Body"], rows: [{ label: "Cold", values: [20, 40, 60] }, { label: "Warm", values: [0, 10, 60] }], at }),
  waffle: (at) => ({ ...box, title: "Requests served from cache", total: 100, filled: 72, label: "72 of 100", at }),
  areaChart: (at) => ({ ...box, title: "Water in the tank, L", xLabels: ["0", "1", "2", "3"], series: [{ label: "Tank", values: [10, 40, 30, 60] }], at }),
  counter: (at) => ({ x: X, y: Y, w: W, h: 300, value: 1024, at }),
  bigStat: (at) => ({ x: X, y: Y, w: W, h: 500, value: 20, label: "looks for a million numbers", at }),
  meter: (at) => ({ x: X, y: Y, w: W, h: 400, title: "Battery, %", value: 64, target: 100, at }),
  ranking: (at) => ({ ...box, title: "Fastest route, min", states: ["Monday", "Friday"], rows: [{ label: "Bridge", before: 1, after: 2 }, { label: "Tunnel", before: 2, after: 1 }], at }),
  flow: (at) => ({ ...box, nodes: [{ id: "a", label: "Phone", col: 0, row: 0 }, { id: "b", label: "Edge", col: 1, row: 0 }], edges: [{ from: "a", to: "b" }], at }),
  sequence: (at) => ({ ...box, actors: [{ id: "c", label: "Client" }, { id: "s", label: "Server" }], steps: [{ from: "c", to: "s", label: "GET /" }, { from: "s", to: "c", label: "200 OK" }], at }),
  tree: (at) => ({ ...box, root: { label: "Root", children: [{ label: "Left" }, { label: "Right", key: true }] }, at }),
  cycle: (at) => ({ ...box, steps: [{ label: "Heat" }, { label: "Rise" }, { label: "Cool" }], at }),
  waveform: (at) => ({ ...box, title: "Two tones and their sum", lanes: [{ label: "Low", parts: [{ a: 1, k: 2 }] }, { label: "High", parts: [{ a: 0.5, k: 5 }] }], at }),
  timeline: (at) => ({ ...box, title: "Bridge works", from: 1990, to: 2020, events: [{ when: 1995, label: "Start" }, { when: 2010, label: "Open", key: true }], at }),
  numberLine: (at) => ({ ...box, title: "Where 28 sits", min: 0, max: 100, markers: [{ value: 28, label: "Target", at: at + 0.5 }], at }),
  steps: (at) => ({ ...box, steps: [{ title: "Look at the middle" }, { title: "Drop half" }, { title: "Repeat" }], at }),
  split: (at) => ({ ...box, a: { heading: "Linear", points: ["Looks at each", "Slow"] }, b: { heading: "Binary", points: ["Halves", "Fast"] }, at }),
  matrix: (at) => ({ ...box, columns: ["Fast", "Sorted"], rows: [{ label: "Linear", cells: [false, false] }, { label: "Binary", cells: [true, true] }], at }),
  quote: (at) => ({ ...box, text: "Measure twice, cut once.", name: "Iven Rasko", at }),
  kineticWords: (at) => ({ ...box, phrases: [{ text: "Halve it", at }, { text: "again", at: at + 0.6 }] }),
  captions: (at) => ({ x: X, y: 900, w: W, h: 300, words: [{ text: "Halve", start: at, end: at + 0.4 }, { text: "the", start: at + 0.4, end: at + 0.6 }, { text: "list", start: at + 0.6, end: at + 1 }] }),
  lowerThird: (at) => ({ x: X, y: 1000, w: W, h: 200, name: "Odelia Varn", job: "Bridge engineer", at }),
  codeBlock: (at) => ({ ...box, lines: ["def search(xs, t):", "    lo, hi = 0, len(xs) - 1", "    return -1"], highlight: [{ line: 2, at: at + 6 }, { line: 3, at: at + 7 }], enter: "type", at }), // highlights after the typing
  terminal: (at) => ({ ...box, session: [{ command: "python3 s.py", output: ["looks: 20"] }], at }),
  carry: (at) => ({ text: "28", role: "headline", from: { x: 200, y: 400, w: 100, h: 80 }, to: { x: 500, y: 900, w: 100, h: 80 }, at, show: at }),
  wipe: (at) => ({ at }),
  highlight: (at) => ({ target: { x: 200, y: 500, w: 300, h: 60 }, role: "body", text: "sorted", style: "underline", at }),
  annotate: (at) => ({ target: { x: 300, y: 700, w: 200, h: 200 }, label: "Middle", at }),
  rows: (at) => ({ n: 3, at }),
  ground: (at) => ({ color: "surface", at }),
  fitText: (at) => ({ text: "Twenty looks.", x: X, y: Y, w: W, h: 400, at }),
  wordSeries: (at) => ({ words: [{ text: "One", at }, { text: "two", at: at + 0.4 }], x: X, y: Y, w: W }),
  lockup: (at) => ({ name: "Velmora", x: X, y: Y, w: W, at }),
  endCard: (at) => ({ name: "Velmora", line: "Lamps that dim with the sun", at }),
  drawnMark: (at) => ({ mark: { viewBox: [0, 0, 100, 100], paths: [{ d: "M0 0H100V100H0Z", paint: "fill" }, { d: "M0 110H100V130H0Z", paint: "fill" }] }, box, accent: 1, lockup: { name: "Velmora", line: "Lamps", at: at + 3 }, at }),
  pane: (at) => ({ ...box, title: "search.py", at }),
  gear: (at) => ({ cx: 540, cy: 900, r: 160, teeth: 12, at }),
  belt: (at) => ({ a: { x: 350, y: 900, r: 100 }, b: { x: 750, y: 900, r: 60 }, at }),
  pulley: (at) => ({ cx: 540, cy: 900, r: 120, turns: [{ at: at + 1, by: 90 }], at }),
  rope: (at) => ({ run: [{ x: 420, y: 500 }, { wheel: WHEEL, turn: "cw" }, { x: 660, y: 1300 }], at }),
  callout: (at) => ({ label: "Hinge", target: { x: 500, y: 900 }, at }),
  dimension: (at) => ({ from: { x: 300, y: 900 }, to: { x: 700, y: 900 }, offset: 60, text: "40 mm", at }),
  formula: (at) => ({ text: "log2 n", x: 540, y: 800, at }),
  sheet: (at) => ({ at }),
  photo: (at) => ({ media: "contract-photo", box: { x: 0, y: 0, w: 1080, h: 1920 }, motion: "still", at }),
  uiWindow: (at) => ({ ...box, title: "Queue", at }),
  listRow: (at) => ({ x: X, y: 600, w: W, title: "Kiln 2 firing", at }),
  button: (at) => ({ x: X, y: 600, text: "Start", at }),
  field: (at) => ({ x: X, y: 600, w: 600, label: "Your file", value: "notes.txt", at }),
  badge: (at) => ({ x: X, y: 600, text: "New", at }),
  tab: (at) => ({ x: X, y: 600, tabs: ["Queue", "Done"], active: [{ index: 0, at }], at }),
  toast: (at) => ({ text: "Saved", at }),
  cursor: (at) => ({ path: [{ x: 300, y: 700, at }, { x: 500, y: 900, at: at + 0.6 }], at }),
};

/** Blocks that the frame and rest rules do not cover, and why. */
/** Blocks whose `at` is not when they start to change, by design. */
const LANDS_AT: Record<string, string> = {
  endCard: "`at` is when the card lands (the last strong beat): it starts to enter before it",
};
const NOT_DRAWN: Record<string, string> = {
  hold: "draws nothing: a time window for the check",
  reveal: "draws nothing: an anchor with the reveal time for the checks",
  music: "sound: draws nothing", hit: "sound: draws nothing", typing: "sound: draws nothing",
  camera: "moves the view, not a node; its moves have their own times",
  product: "3D: drawn on a canvas from the time alone, tested in three/",
  shadowBars: "an effect only two systems allow; it has its own test",
};

const drawn = (n: Node) => n.kind !== "audio" && n.kind !== "anchor" && n.kind !== "camera" && n.kind !== "hold";
const PROPS: Prop[] = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "rotate", "draw", "reveal"];
const build = (name: string, at: number, ctx: Ctx) => quiet(() => (BLOCKS as unknown as Record<string, (p: unknown, c: Ctx) => Node[]>)[name]!(FIXTURES[name]!(at), ctx));
/** The state of every drawn node at a time, after the system's motion (both renderers apply it first). */
const state = (ctx: Ctx, nodes: Node[], t: number) => nodes.filter(drawn).map((n) => {
  const v = evaluate(ctx.system, n.tracks, t);
  return PROPS.map((p) => Math.round(v[p] * 1e6) / 1e6);
});
/**
 * The first frame on which a block's change begins, from its keys after the system's motion: a tween begins on the
 * first frame after its start key (its start value shows on the start key's own frame), and a step on the first
 * frame at or after its end key. A key value that a slow curve keeps under 1e-6 for some frames still counts.
 */
const firstChange = (ctx: Ctx, nodes: Node[]): number => {
  let best = Infinity;
  for (const n of withSystemMotion(ctx.system, nodes).filter(drawn)) for (const keys of Object.values(n.tracks ?? {})) {
    for (let i = 1; i < (keys?.length ?? 0); i++) {
      const a = keys![i - 1]!, b = keys![i]!;
      if (Math.abs(a.v - b.v) < 1e-9) continue;
      best = Math.min(best, b.curve === "step" ? Math.ceil(b.t * 30 - 1e-9) : Math.floor(a.t * 30 + 1e-6) + 1);
      break;
    }
  }
  return best === Infinity ? -1 : best;
};

describe("every block is in the table", () => {
  test("each block has a fixture or a reason", () => {
    for (const name of Object.keys(BLOCKS).filter((k) => k !== "measure")) expect(name in FIXTURES || name in NOT_DRAWN).toBe(true);
  });
});

describe("item 12: two blocks given the same time change on the same frame", () => {
  // On a frame, between frames, and a beat time that is not on the grid (1.57 s is frame 47.1).
  for (const t of [1, 1 + 0.4 / 30, 1.57, 2.3]) {
    for (const sys of ["spec", "manual", "console", "ma", "riso", "cutout", "primary"]) {
      test(`${sys}, entrance at ${t.toFixed(3)} s: every block first changes on frame ${frameOf(t)}`, () => {
        const ctx = ctxOf(sys);
        const off: string[] = [];
        const firsts = new Map<string, number>();
        for (const name of Object.keys(FIXTURES)) {
          if (name in LANDS_AT) continue;
          let nodes: Node[];
          try { nodes = build(name, t, ctx); } catch { continue; } // a block the system does not allow
          if (!nodes.some(drawn)) continue; // the system draws nothing for it (a wipe in a system that cuts)
          const f = firstChange(ctx, nodes);
          firsts.set(name, f);
        }
        // A system that moves on every frame: every block on frameOf(t). A stepped system (Riso, Cutout: 12 fps)
        // moves its grid, so there every block shares one first frame, whichever it is.
        const stepped = !!ctx.system.step;
        for (const [name, f] of firsts) if (stepped ? f !== Math.min(...firsts.values()) : f !== frameOf(t)) off.push(`${name}: frame ${f}`);
        expect(off).toEqual([]);
      });
    }
  }
});

describe("item 13: every block can stand at rest from frame 0", () => {
  for (const sys of ["spec", "manual", "riso", "console"]) {
    test(`${sys}: \`at\` before the film shows the block at rest on frame 0`, () => {
      const ctx = ctxOf(sys);
      const off: string[] = [];
      for (const name of Object.keys(FIXTURES)) {
        let early: Node[], late: Node[];
        try { early = build(name, -10, ctx); late = build(name, 0, ctx); } catch (e) { if (/does not allow/.test(String(e))) continue; throw e; }
        const a = withSystemMotion(ctx.system, early), b = withSystemMotion(ctx.system, late);
        // Compare by node id; a node that shows in neither build does not count.
        const byId = (ns: Node[], t: number) => new Map(ns.filter(drawn).map((n) => [n.id, PROPS.map((q) => Math.round(evaluate(ctx.system, n.tracks, t)[q] * 1e6) / 1e6)]));
        const sa = byId(a, 0), sb = byId(b, 10);
        for (const id of new Set([...sa.keys(), ...sb.keys()])) {
          const va = sa.get(id), vb = sb.get(id);
          if (!(va?.[0] ?? 0) && !(vb?.[0] ?? 0)) continue;
          if (JSON.stringify(va) !== JSON.stringify(vb)) { off.push(`${name}: frame 0 is not its rest (${id})`); break; }
        }
        const visible = (ns: Node[], t: number) => ns.filter(drawn).some((n) => evaluate(ctx.system, n.tracks, t).opacity > 0);
        // A block whose content has ended by then (captions, a wipe) shows nothing in both builds.
        if (visible(b, 10) && !visible(a, 0)) off.push(`${name}: nothing shows on frame 0`);
        for (const n of early) for (const keys of Object.values(n.tracks ?? {})) if (keys?.some((k) => k.t < 0)) off.push(`${name}: a key before 0`);
      }
      expect(off).toEqual([]);
    });
  }
});

describe("item 11: no block accepts a time it cannot honour", () => {
  const ctx = ctxOf("spec");
  test("a time that is not a number throws, with what to give", () => {
    for (const name of Object.keys(FIXTURES)) {
      const p = FIXTURES[name]!(1);
      if (!("at" in p)) continue;
      expect(() => quiet(() => (BLOCKS as never as Record<string, (p: unknown, c: Ctx) => Node[]>)[name]!({ ...p, at: Number.NaN }, ctx))).toThrow(/Give at in seconds/);
    }
  });
  test("an until that is not after at throws", () => {
    expect(() => BLOCKS.title({ ...FIXTURES.title!(2), until: 1 } as never, ctx)).toThrow(/until \(1\) is not after at \(2\)/);
    expect(() => BLOCKS.shape({ ...FIXTURES.shape!(2), until: 2 } as never, ctx)).toThrow(/not after/);
  });
  test("a list of timed items out of order throws", () => {
    expect(() => quiet(() => BLOCKS.codeBlock({ ...FIXTURES.codeBlock!(1), highlight: [{ line: 2, at: 2 }, { line: 1, at: 1.5 }] } as never, ctx))).toThrow(/time order/);
    expect(() => BLOCKS.shape({ ...FIXTURES.shape!(1), moves: [{ at: 3, to: [10, 0] }, { at: 2, to: [20, 0] }] } as never, ctx)).toThrow(/time order/);
  });
  test("a negative `at` on codeBlock shows its rows and numbers at rest, with keys in order (the proof's bug)", () => {
    const nodes = quiet(() => BLOCKS.codeBlock({ ...FIXTURES.codeBlock!(-0.8), enter: undefined, highlight: [{ line: 2, at: 1.5 }] } as never, ctx));
    const nums = nodes.filter((n) => /-n\d+$/.test(n.id));
    expect(nums.length).toBe(3);
    for (const n of nums) expect(evaluate(ctx.system, n.tracks, 0).opacity).toBe(n.id.endsWith("-n1") ? 1 : 1);
    // The lit number of line 2 waits for its time on both renderers.
    const lit = nodes.find((n) => n.id.endsWith("-n1-lit"))!;
    expect(evaluate(ctx.system, lit.tracks, 0).opacity).toBe(0);
    expect(evaluate(ctx.system, lit.tracks, 1.5 + 1 / 30).opacity).toBe(1);
  });
  test("every track every block returns is in time order", () => {
    for (const sys of ["spec", "riso", "console"]) for (const name of Object.keys(FIXTURES)) for (const at of [-1, 0, 1.57]) {
      let nodes: Node[];
      try { nodes = build(name, at, ctxOf(sys)); } catch (e) { if (/does not allow/.test(String(e))) continue; throw e; }
      for (const n of nodes) for (const keys of Object.values(n.tracks ?? {})) for (let i = 1; i < (keys?.length ?? 0); i++) expect(keys![i]!.t).toBeGreaterThanOrEqual(keys![i - 1]!.t);
    }
  });
});

// ---------------------------------------------------------------- item 4: documented defaults

/** Each top-level prop of a block's props type whose doc names a literal default: [prop, value]. */
function documentedDefaults(name: string): [string, unknown][] {
  const file = ["uiWindow", "listRow", "button", "field", "cursor", "badge", "tab", "toast"].includes(name) ? "ui" : name;
  const src = readFileSync(join(import.meta.dir, `${file}.ts`), "utf8");
  const type = `${name[0]!.toUpperCase()}${name.slice(1)}Props`;
  const start = src.search(new RegExp(`export type ${type}\\b`));
  if (start < 0) return [];
  let depth = 0, i = src.indexOf("{", start);
  const open = i;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; if (src[i] === "}") { depth--; if (!depth) break; } }
  const body = src.slice(open + 1, i);
  const out: [string, unknown][] = [];
  // A doc comment, then a top-level optional prop: `name?: type;`.
  for (const m of body.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\s*(\w+)\?:/g)) {
    const d = m[1]!.replace(/\s*\*\s*/g, " ");
    // A literal only: a number, a string or a boolean that ends the sentence ("Default 13." or "Default: "rule")").
    // Only the first "default" in the doc counts: "(default: none, ...)" names no literal, whatever follows it.
    const first = d.match(/\bdefault\b:?\s*([\s\S]*)$/i)?.[1] ?? "";
    const lit = first.match(/^(-?\d+(?:\.\d+)?|"[^"]+"|true|false)(?=\s*(?:[,;)]|\.(?!\d)|$))/);
    if (!lit) continue;
    const raw = lit[1]!;
    out.push([m[2]!, raw.startsWith('"') ? raw.slice(1, -1) : raw === "true" ? true : raw === "false" ? false : Number(raw)]);
  }
  return out;
}

describe("item 4: every documented literal default is what the code does", () => {
  for (const sys of ["spec", "manual"]) {
    test(`${sys}: leaving a prop out gives the same nodes as giving its documented default`, () => {
      const ctx = ctxOf(sys);
      const off: string[] = [];
      let checked = 0;
      for (const name of Object.keys(FIXTURES)) {
        for (const [prop, value] of documentedDefaults(name)) {
          const p = FIXTURES[name]!(1);
          if (prop in p) continue;
          const call = (q: unknown) => quiet(() => JSON.stringify((BLOCKS as never as Record<string, (p: unknown, c: Ctx) => Node[]>)[name]!(q, ctx)));
          let a: string, b: string;
          try { a = call(p); } catch (e) { if (/does not allow/.test(String(e))) continue; throw e; }
          // A prop that only applies with another one (photo's `rate` is for footage) may refuse its default here.
          try { b = call({ ...p, [prop]: value }); } catch { continue; }
          checked++;
          if (a !== b) off.push(`${name}.${prop}: the doc says the default is ${JSON.stringify(value)}, and the code does something else`);
        }
      }
      expect(off).toEqual([]);
      expect(checked).toBeGreaterThan(15);
    });
  }
});

// ---------------------------------------------------------------- item 21: `until` is the frame rule's other side

describe("item 21: a block given `until` is gone (or starts to leave) on frameOf(until), the frame a block given `at` shows", () => {
  const until = 3, gone = frameOf(until); // frame 91
  /** Fixtures with `until` set, for the blocks that take it. */
  const withUntil = (name: string, at: number) => ({ ...FIXTURES[name]!(at), until });
  test("in a one-frame system every drawn node is hidden on frameOf(until) and shown on the frame before", () => {
    const ctx = ctxOf("console");
    const off: string[] = [];
    for (const name of Object.keys(FIXTURES)) {
      // Their until means something else: kineticWords, wordSeries and captions end with their last phrase; carry's
      // until follows `show`; endCard holds to the film's end.
      if (["kineticWords", "wordSeries", "captions", "carry", "endCard"].includes(name)) continue;
      let nodes: Node[];
      try { nodes = withSystemMotion(ctx.system, build2(name, withUntil(name, 1), ctx)); } catch (e) { if (/does not allow|not after/.test(String(e))) continue; throw e; }
      const shown = (f: number) => nodes.filter(drawn).filter((n) => evaluate(ctx.system, n.tracks, f / 30).opacity > 0).map((n) => n.id);
      if (shown(gone).length) off.push(`${name}: ${shown(gone).slice(0, 3).join(", ")} still drawn on frame ${gone}`);
      if (!shown(gone - 1).length && shown(gone - 5).length) off.push(`${name}: gone before frameOf(until)`);
    }
    expect(off).toEqual([]);
  });
  test("in a system that tweens, the exit starts on frameOf(until): the frame before still shows the block at rest", () => {
    const ctx = ctxOf("spec");
    const off: string[] = [];
    for (const name of Object.keys(FIXTURES)) {
      let nodes: Node[];
      try { nodes = withSystemMotion(ctx.system, build2(name, withUntil(name, 0), ctx)); } catch (e) { if (/does not allow|not after/.test(String(e))) continue; throw e; }
      const s = (f: number) => JSON.stringify(state(ctx, nodes, f / 30));
      if (s(gone - 1) !== s(gone - 2)) continue; // the block is still moving there (a long entrance); not a rest frame
      if (s(gone - 1) === s(gone) && s(gone) !== s(gone + 30)) off.push(`${name}: its exit starts after frameOf(until)`);
    }
    expect(off).toEqual([]);
  });
});

function build2(name: string, props: Record<string, unknown>, ctx: Ctx): Node[] {
  return quiet(() => (BLOCKS as unknown as Record<string, (p: unknown, c: Ctx) => Node[]>)[name]!(props, ctx));
}

// ---------------------------------------------------------------- the catalog: one demo for each block, one name for each meaning

import { DEMOS } from "../../../../examples/scenes/demos";
import { OLD_NAMES } from "./guard";

describe("the catalog: each block has a demo that calls it", () => {
  // The catalog's blocks: every block in BLOCKS except measure; the ui kit is one entry (ui), the sounds one (sound).
  const UI = ["uiWindow", "listRow", "button", "field", "cursor", "badge", "tab", "toast"], SOUND = ["music", "hit", "typing"];
  const catalog = [...new Set(Object.keys(BLOCKS).filter((k) => k !== "measure").map((k) => (UI.includes(k) ? "ui" : SOUND.includes(k) ? "sound" : k)))];
  test("every block is in DEMOS, once", () => {
    const named = DEMOS.map((d) => d.block);
    expect(catalog.filter((b) => !named.includes(b))).toEqual([]);
    expect(named.filter((b, i) => named.indexOf(b) !== i)).toEqual([]);
  });
  test("each demo's scene file calls its block (the ui kit and the sounds: any of their parts)", () => {
    const off: string[] = [];
    for (const d of DEMOS) {
      const src = readFileSync(join(import.meta.dir, "../../../../examples/scenes", `${d.file}.ts`), "utf8");
      const calls = d.block === "ui" ? UI : d.block === "sound" ? SOUND : [d.block];
      if (!calls.some((b) => src.includes(`B.${b}(`) || new RegExp(`\\b${b}\\(`).test(src))) off.push(`${d.block}: ${d.file}.ts does not call it`);
    }
    expect(off).toEqual([]);
  });
});

describe("one name, one meaning: an old prop name gives the same nodes as the new one", () => {
  const ctx = ctxOf("spec");
  // A value for each renamed prop, valid for its block.
  const VALUE: Record<string, unknown> = { enter: "fade", role: "headline", job: "Bridge engineer", clipStart: 0 };
  const QUOTE = { enter: "word", role: "headline" };
  test("each old name maps to its new name", () => {
    const off: string[] = [];
    for (const [name, pairs] of Object.entries(OLD_NAMES)) {
      if (!FIXTURES[name]) continue; // music draws nothing; it is checked in sound.test.ts
      for (const [old, now] of pairs) {
        const value = name === "quote" ? QUOTE[now as keyof typeof QUOTE] : VALUE[now];
        const base = { ...FIXTURES[name]!(1) } as Record<string, unknown>;
        // lowerThird's fixture gives the job by its new name: drop it, so each call gives it one way.
        if (name === "lowerThird") delete base.job;
        const a = JSON.stringify(build2(name, { ...base, [now]: value }, ctx));
        const b = JSON.stringify(build2(name, { ...base, [old]: value }, ctx));
        if (a !== b) off.push(`${name}: "${old}" and "${now}" draw different nodes`);
      }
    }
    expect(off).toEqual([]);
  });
  test("quote: the old pair (size, role as the job) equals the new pair (role, job)", () => {
    const base = FIXTURES.quote!(1) as Record<string, unknown>;
    const a = JSON.stringify(build2("quote", { ...base, role: "headline", job: "Head of Nursing" }, ctx));
    const b = JSON.stringify(build2("quote", { ...base, size: "headline", role: "Head of Nursing" }, ctx));
    expect(a).toBe(b);
  });
});

describe("pinned: every block that declares it keeps its nodes in screen space", () => {
  const ctx = ctxOf("spec");
  test("each such block returns every drawn node pinned", () => {
    const off: string[] = [];
    for (const name of Object.keys(FIXTURES)) {
      const src = readFileSync(join(import.meta.dir, `${["uiWindow", "listRow", "button", "field", "cursor", "badge", "tab", "toast"].includes(name) ? "ui" : name}.ts`), "utf8");
      const type = src.slice(Math.max(0, src.search(new RegExp(`export type ${name[0]!.toUpperCase()}${name.slice(1)}Props\\b`))));
      if (!/^\s*pinned\?:/m.test(type.slice(0, type.indexOf("\n};") + 1))) continue;
      const nodes = build2(name, { ...FIXTURES[name]!(1), pinned: true }, ctx).filter(drawn);
      if (!nodes.length || nodes.some((n) => !n.pinned)) off.push(name);
    }
    expect(off).toEqual([]);
  });
});
