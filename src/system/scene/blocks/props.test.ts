// Tests for the block props that agents asked for: shape `moves` (to and by) and `from`, wipe `from`,
// codeBlock `enter` (rest and type), terminal and title fit, measure, and the effect level of hit and typing.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { frameOf, inkBox, makeCtx, textSafe } from "../context";
import { valueAt } from "../time";
import type { Ctx, Node, TextNode } from "../types";
import { BLOCKS, terminalTimes } from ".";

const ctxOf = (id: string): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
};
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const warns = (f: () => unknown): string[] => { const out: string[] = []; const w = console.warn; console.warn = (m: string) => out.push(String(m)); try { f(); } finally { console.warn = w; } return out; };
const at = (ctx: Ctx, n: Node, prop: "x" | "y" | "opacity", t: number) => valueAt(ctx.system, n.tracks?.[prop], prop, t);

describe("item 4: shape moves say which kind of offset they are", () => {
  const ctx = ctxOf("spec");
  const base = { kind: "square" as const, x: 100, y: 600, w: 80, h: 80, at: 0 };
  test("`to` is an offset from the drawn box: a list of places goes to those places", () => {
    const [n] = BLOCKS.shape({ ...base, moves: [{ at: 1, to: [200, 0] }, { at: 2, to: [50, 0] }, { at: 3, to: [300, 40] }] }, ctx);
    expect(at(ctx, n!, "x", 1.9)).toBeCloseTo(200, 5);
    expect(at(ctx, n!, "x", 2.9)).toBeCloseTo(50, 5);
    expect(at(ctx, n!, "x", 9)).toBeCloseTo(300, 5);
    expect(at(ctx, n!, "y", 9)).toBeCloseTo(40, 5);
  });
  test("`by` is a step from the place before", () => {
    const [n] = BLOCKS.shape({ ...base, moves: [{ at: 1, by: [200, 0] }, { at: 2, by: [-150, 0] }] }, ctx);
    expect(at(ctx, n!, "x", 9)).toBeCloseTo(50, 5);
  });
  test("the old `dx`/`dy` form steps as `by` and warns, so a film that relied on it keeps its places", () => {
    let n: Node | undefined;
    const w = warns(() => { [n] = BLOCKS.shape({ ...base, moves: [{ at: 1, dx: 200, dy: 0 }, { at: 2, dx: -150, dy: 0 }] }, ctx); });
    expect(at(ctx, n!, "x", 9)).toBeCloseTo(50, 5);
    expect(w.some((m) => /by: \[dx, dy\]/.test(m))).toBe(true);
  });
  test("a move with two forms throws", () => {
    expect(() => BLOCKS.shape({ ...base, moves: [{ at: 1, to: [1, 1], by: [1, 1] }] }, ctx)).toThrow(/one of to/);
  });
});

describe("item 14: one name for the edge a thing enters from", () => {
  const ctx = ctxOf("spec");
  test("shape slides in from the edge `from` names", () => {
    const sq = { kind: "square" as const, x: 400, y: 900, w: 100, h: 100, enter: "slide" as const, at: 1 };
    const top = BLOCKS.shape({ ...sq, from: "top" }, ctx)[0]!;
    expect(at(ctx, top, "y", 1)).toBeLessThan(-900);
    expect(top.tracks?.x).toBeUndefined();
    const bottom = BLOCKS.shape({ ...sq, from: "bottom" }, ctx)[0]!;
    expect(at(ctx, bottom, "y", 1)).toBeGreaterThan(900);
    const right = BLOCKS.shape({ ...sq, from: "right" }, ctx)[0]!;
    expect(at(ctx, right, "x", 1)).toBeGreaterThan(500);
    for (const n of [top, bottom, right]) for (const p of ["x", "y"] as const) expect(at(ctx, n, p, 5)).toBe(0);
  });
  test("wipe takes `from` as shape does; `direction` is the old form", () => {
    const a = BLOCKS.wipe({ at: 1, from: "right", style: "panel" }, ctx);
    const b = BLOCKS.wipe({ at: 1, direction: "left", style: "panel" }, ctx);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("item 10: codeBlock rows at rest on frame 0, and typed on", () => {
  const box = { x: 200, y: 500, w: 680, h: 600 };
  const lines = ["def search(xs, t):", "    lo = 0", "    return 28"];
  test("at 0 or before, every row is at rest on frame 0 (the frame-0 rule of every text block)", () => {
    for (const sys of ["spec", "manual"]) {
      const ctx = ctxOf(sys);
      const nodes = quiet(() => BLOCKS.codeBlock({ ...box, lines, at: 0 }, ctx));
      const code = nodes.filter((n) => /-l\d/.test(n.id));
      expect(code.length).toBeGreaterThan(0);
      for (const n of code) expect(at(ctx, n, "opacity", 0)).toBe(1);
      for (const n of code) expect(n.tracks?.reveal).toBeUndefined();
    }
  });
  test("`type` types the rows after frame 0; each character keeps its syntax colour", () => {
    const ctx = ctxOf("manual");
    const nodes = quiet(() => BLOCKS.codeBlock({ ...box, lines, at: 1, enter: "type" }, ctx));
    const chars = nodes.filter((n) => /-l2-c\d+$/.test(n.id)) as Extract<Node, { kind: "text" }>[];
    expect(chars.map((c) => c.text).join("")).toBe("return28");
    expect(chars.find((c) => c.text === "2")!.color).toBe("accentText"); // the literal, in the signature's colour
    const firsts = chars.map((c) => c.tracks!.opacity!.find((k) => k.v === 1)!.t);
    expect([...firsts].sort((a, b) => a - b)).toEqual(firsts); // typed in order
    const anchor = nodes.find((n) => n.id === "code-line:3") as Extract<Node, { kind: "anchor" }>;
    expect(anchor.data?.typedAt).toBeGreaterThan(anchor.at!);
  });
  test("`type` at 0: the first row is at rest on frame 0, and the rest types on from there (Manual's hook)", () => {
    const ctx = ctxOf("manual");
    const nodes = quiet(() => BLOCKS.codeBlock({ ...box, lines, at: 0, enter: "type" }, ctx));
    const row0 = nodes.filter((n) => /-l0-/.test(n.id));
    const row1 = nodes.filter((n) => /-l1-c/.test(n.id));
    for (const n of row0) expect(at(ctx, n, "opacity", 0)).toBe(1);
    expect(row1.length).toBeGreaterThan(0);
    for (const n of row1) expect(at(ctx, n, "opacity", 0)).toBe(0);
    for (const n of row1) expect(at(ctx, n, "opacity", 5)).toBe(1);
  });
  test("`rise` keeps the old entrance in every system", () => {
    const ctx = ctxOf("spec");
    const nodes = quiet(() => BLOCKS.codeBlock({ ...box, lines, at: 1, enter: "rise" }, ctx));
    expect(nodes.filter((n) => /-l\d-\d$/.test(n.id)).every((n) => n.tracks?.reveal?.length === 2)).toBe(true);
  });
});

describe("item 21: a phrase change and a cut at one time change on one frame", () => {
  test("kineticWords' next phrase, its last phrase's end and a photo cut at the same time share their frame", () => {
    const ctx = ctxOf("courtside");
    const { MEDIA } = require("../../media.gen");
    MEDIA["props-photo"] = { kind: "photo", width: 2400, height: 3600, subject: [0.3, 0.3, 0.7, 0.7], centre: [0.5, 0.5], grade: "courtside", mask: null };
    const words = quiet(() => BLOCKS.kineticWords({ x: 140, y: 500, w: 800, h: 800, phrases: [{ text: "CAN YOU", at: 0 }, { text: "SWIM", at: 1.7 }], until: 3.43 }, ctx));
    const photo = quiet(() => BLOCKS.photo({ media: "props-photo", box: { x: 0, y: 0, w: 1080, h: 1920 }, motion: "still", enter: "cut", at: 1.7 }, ctx))[0]!;
    const f = frameOf(1.7);
    const on = (id: string, fr: number) => words.filter((n) => n.id.startsWith(id) && n.kind === "text").some((n) => valueAt(ctx.system, n.tracks?.opacity, "opacity", fr / 30) > 0);
    expect(on("kinetic-p0", f - 1)).toBe(true);
    expect(on("kinetic-p0", f)).toBe(false);
    expect(on("kinetic-p1", f)).toBe(true);
    expect(at(ctx, photo, "opacity", (f - 1) / 30)).toBe(0);
    expect(at(ctx, photo, "opacity", f / 30)).toBe(1);
    // The block's end: gone on frameOf(until) in a system that cuts.
    expect(on("kinetic-p1", frameOf(3.43))).toBe(false);
    expect(on("kinetic-p1", frameOf(3.43) - 1)).toBe(true);
  });
});

describe("item 15: type never shrinks in silence; heights come from the block", () => {
  test("title: shrink warns with both roles, throw stops, wrap keeps the role on more lines", () => {
    const ctx = ctxOf("spec");
    const long = "Find twenty-eight in a long sorted list";
    const box = { x: 200, y: 400, w: 600, h: 900 };
    const said = warns(() => BLOCKS.title({ ...box, text: long, at: 0 }, ctx));
    expect(said.some((m) => /does not fit in the display role, so it is set in/.test(m))).toBe(true);
    expect(() => quiet(() => BLOCKS.title({ ...box, text: long, fit: "throw", at: 0 }, ctx))).toThrow(/does not fit/);
    const wrapped = quiet(() => BLOCKS.title({ ...box, h: 1500, text: "Two words wrap", role: "display", fit: "wrap", maxLines: 1, at: 0 }, ctx));
    expect(wrapped.every((n) => n.kind !== "text" || n.role === "display")).toBe(true);
  });
  test("terminal: a result in a larger role takes its rows, and terminalHeight and terminalRows agree with the block", () => {
    const ctx = ctxOf("manual");
    const session = [{ command: "python3 search.py 1000000", output: ["1000000 sorted numbers", { text: "looks: 20", result: true }] }];
    const { terminalHeight, terminalRows } = require(".");
    const rows = terminalRows(ctx, { session, resultRole: "headline" });
    expect(rows).toBeGreaterThan(4); // command, a line, the result over two rows or more, the last prompt
    const h = terminalHeight(ctx, { rows });
    const nodes = quiet(() => BLOCKS.terminal({ x: 200, y: 400, w: 680, h, session, resultRole: "headline", at: 0 }, ctx));
    const result = nodes.find((n) => n.id === "term-r2") as Extract<Node, { kind: "text" }>;
    expect(result.role).toBe("headline");
    // Nothing scrolls: every row fits the height the helper gave.
    expect(nodes.every((n) => !n.tracks?.y)).toBe(true);
    // B.measure gives the panel's box.
    const box = BLOCKS.measure("terminal", { x: 200, y: 400, w: 680, h, session, at: 0 }, ctx);
    expect(box.h).toBeCloseTo(h, 0);
    expect(() => quiet(() => BLOCKS.terminal({ x: 200, y: 400, w: 300, h, session: [{ command: "run", output: [{ text: "a very long result line", result: true }] }], resultRole: "display", fit: "throw", at: 0 }, ctx))).toThrow(/does not fit/);
  });
  test("B.measure: a title's box is as tall as its lines", () => {
    const ctx = ctxOf("spec");
    const b = quiet(() => BLOCKS.measure("title", { x: 200, y: 400, w: 680, text: "Halve it.", role: "headline", at: 0 }, ctx));
    expect(b.y).toBeGreaterThanOrEqual(400);
    expect(b.h).toBeGreaterThanOrEqual(ctx.lineHeight("headline") - 1);
    expect(b.h).toBeLessThan(ctx.lineHeight("headline") * 3);
  });
});

describe("item 23: kineticWords takes explicit breaks and avoids a one-word last line", () => {
  const ctx = ctxOf("courtside");
  const lineOf = (nodes: Node[]) => {
    const ys = [...new Set(nodes.filter((n) => n.kind === "text").map((n) => Math.round((n as { y: number }).y)))].sort((a, b) => a - b);
    return nodes.filter((n) => n.kind === "text").map((n) => [(n as { text: string }).text, ys.indexOf(Math.round((n as { y: number }).y))] as const);
  };
  test("a \\n sets the break", () => {
    const n = quiet(() => BLOCKS.kineticWords({ x: 140, y: 500, w: 800, h: 900, phrases: [{ text: "CAN\nYOU SWIM", at: 0 }] }, ctx));
    const l = lineOf(n);
    expect(l.find(([t]) => t === "CAN")![1]).not.toBe(l.find(([t]) => t === "YOU")![1]);
    expect(l.find(([t]) => t === "YOU")![1]).toBe(l.find(([t]) => t === "SWIM")![1]);
  });
  test("with no break given, the last line is not one word under two", () => {
    const n = quiet(() => BLOCKS.kineticWords({ x: 140, y: 500, w: 800, h: 900, phrases: [{ text: "CAN YOU SWIM", at: 0 }] }, ctx));
    const l = lineOf(n);
    const last = Math.max(...l.map(([, i]) => i));
    const onLast = l.filter(([, i]) => i === last).length, before = l.filter(([, i]) => i === last - 1).length;
    expect(onLast === 1 && before >= 2).toBe(false);
  });
});

describe("item 24: endCard reveal and place", () => {
  test("the default places the name in the upper third of its box; `place` and `reveal` change it", () => {
    for (const sys of ["courtside", "spec"]) {
      const ctx = ctxOf(sys), S = ctx.safe;
      const land = (p: object) => quiet(() => BLOCKS.endCard({ name: "Haskby Pool", line: "Try-outs Friday", at: 3, ...p }, ctx)).find((n) => n.id === "endCard-land") as Extract<Node, { kind: "anchor" }>;
      expect(land({}).y).toBeLessThan(S.top + (S.bottom - S.top) / 3);
      expect(land({ place: "lower" }).y).toBeGreaterThan(land({}).y);
      const cut = quiet(() => BLOCKS.endCard({ name: "Haskby Pool", at: 3, reveal: "cut" }, ctx)).filter((n) => n.kind === "text");
      for (const n of cut) expect(valueAt(ctx.system, n.tracks?.opacity, "opacity", 3 + 1 / 30)).toBe(1);
    }
  });
});

describe("item 27: hit plays a part of its file", () => {
  test("`part` trims the file, and the guard does not read it as film time", () => {
    const ctx = ctxOf("manual");
    const [n] = quiet(() => BLOCKS.hit({ id: "h", media: "manual-tick", at: 2, part: [0.01, 0.2] }, ctx)) as Extract<Node, { kind: "audio" }>[];
    expect(n!.from).toBeCloseTo(0.01, 5);
    expect(n!.until! - n!.at).toBeCloseTo(0.19, 5);
  });
});

describe("item 29: a drop on a guessed bar line says so", () => {
  // An agent's case: the onset it offered was half a beat off. A map with the measured rise places it
  // (beats.test.ts, the proof fixtures); a map without one says how to make the map again.
  test("peakAt on a map with no measured rise warns that the bar line is a guess and how to measure it", () => {
    const { MUSIC } = require("../../music.gen");
    const { SOUNDS } = require("../../media.gen");
    const beat = 0.5;
    SOUNDS["guess-track"] = { kind: "music", file: "x.mp3", duration: 60, peak: 30 };
    MUSIC["guess-track"] = { duration: 60, bpm: 120, confidence: "high", grid: "fixed", halfTime: false,
      beats: Array.from({ length: 120 }, (_, i) => i * beat), downbeats: Array.from({ length: 30 }, (_, i) => i * 2), bars: Array.from({ length: 30 }, (_, i) => i * 2),
      barLufs: Array(30).fill(-14), barPeak: Array(30).fill(-3), sections: [], drops: [{ t: 30, rise: 6 }], onsets: [[29.5, 1], [30, 0.4]], loudest: [15],
      lufs: -14, truePeak: -3, loopShare: null, master: null, gridTrust: "medium", gridIssues: ["the bar start is a guess (downbeat margin 0.14)"] };
    const said = warns(() => BLOCKS.music({ media: "guess-track", peakAt: 5, until: 10 }, ctxOf("courtside")));
    expect(said.some((m) => /bar line that is a guess.*no measured rise.*untell listen analyse guess-track --force/.test(m))).toBe(true);
    // With the rise measured a beat before the bar line, peakAt lands the rise and says so.
    MUSIC["guess-track"] = { ...MUSIC["guess-track"], drops: [{ t: 30, rise: 6, at: 29.5 }] };
    const said2 = warns(() => BLOCKS.music({ media: "guess-track", peakAt: 5, until: 10 }, ctxOf("courtside")));
    const n = quiet(() => BLOCKS.music({ media: "guess-track", peakAt: 5, until: 10 }, ctxOf("courtside")))[0] as { from?: number };
    expect(n.from).toBeCloseTo(24.5, 3);
    expect(said2.concat(said).some((m) => /measured rise in the sound is at 29\.5 s \(1\.0 beat earlier/.test(m))).toBe(true);
  });
});

describe("item 10: Manual's own block map: typed code, a highlight on the beat after it is typed", () => {
  test("a highlight before its row is typed throws with the earliest time; one after it lights the row", () => {
    const ctx = ctxOf("manual");
    const lines = ["def search(xs, t):", "    lo = 0", "    return 28"];
    expect(() => quiet(() => BLOCKS.codeBlock({ x: 200, y: 500, w: 680, h: 600, lines, enter: "type", highlight: [{ line: 2, at: 1.6 }], at: 1 }, ctx))).toThrow(/comes before the line is typed/);
    const nodes = quiet(() => BLOCKS.codeBlock({ x: 200, y: 500, w: 680, h: 600, lines, enter: "type", highlight: [{ line: 2, at: 6 }], at: 1 }, ctx));
    expect(nodes.some((n) => n.id === "code-band")).toBe(true);
  });
});

describe("item 34: product frames a detail with the 3D camera, and declares its bleed", () => {
  test("frame detail aims the camera at the part, fills the frame with it, and marks the shot as bleeding", () => {
    const ctx = ctxOf("matte");
    const { standing } = require("../../three/models");
    const objects = [standing("lamp", "model-lantern", { height: 2.6 })];
    const full = BLOCKS.product({ id: "p", objects, at: 0 }, ctx);
    const det = BLOCKS.product({ id: "p", objects, frame: "detail", detail: { point: [0.5, 0.85, 0.5], span: 0.25 }, shot: "still", at: 0 }, ctx);
    const box = (ns: Node[]) => ns.find((n) => n.id === "p-object") as Extract<Node, { kind: "anchor" }>;
    expect(box(det).h).toBeGreaterThan(ctx.height * 2); // the object runs well past the frame
    expect(box(full).h).toBeLessThan(ctx.height);
    const s3 = det.find((n) => n.kind === "scene3d") as Extract<Node, { kind: "scene3d" }>;
    expect(s3.bleed).toBe(true);
    expect(s3.spec.camera.target![1]).toBeCloseTo(2.6 * 0.85, 1); // aimed at the part, not the object's centre
    expect(s3.spec.box).toEqual({ x: 0, y: 0, w: ctx.width, h: ctx.height }); // the camera moved, not the box
    expect(() => BLOCKS.product({ id: "p", objects, frame: "detail", at: 0 } as never, ctx)).toThrow(/needs detail/);
  });
});

describe("item 22: the panel wipe leaves whole, and leaves no edge for a whip to show", () => {
  test("the panel is exactly the frame, and no frame of its exit shows a thin strip", () => {
    const ctx = ctxOf("courtside");
    const [n] = BLOCKS.wipe({ id: "panel", at: 0.5, style: "panel", layer: -1, hold: 1.5 }, ctx) as Extract<Node, { kind: "rect" }>[];
    expect([n!.x, n!.y, n!.w, n!.h]).toEqual([0, 0, ctx.width, ctx.height]);
    const xs = n!.tracks!.x!;
    const leaveAt = xs[2]!.t, end = xs[xs.length - 1]!.t;
    for (let f = Math.ceil(leaveAt * 30); f <= Math.ceil(end * 30); f++) {
      const shown = ctx.width - valueAt(ctx.system, xs, "x", f / 30);
      if (shown > 0.5 && shown < ctx.width) expect(shown).toBeGreaterThan(ctx.width * 0.15);
    }
  });
});

describe("code is never cut (third sheet, fault 1)", () => {
  const { SYSTEMS: ALL } = require("../../systems");
  const long = "    lo, hi, steps = 0, len(xs) - 1, 0  # the two ends of the part that can still hold the target";
  const cmd = "python3 search.py --numbers 1000000 --target 999999 --report looks";
  const out = "1000000 sorted numbers searched for 999999 in twenty looks, each one halving the list";
  for (const s of ALL as { id: string }[]) {
    test(`${s.id}: codeBlock and terminal fit, widen, step down or wrap; no "…", every row inside the text-safe area`, () => {
      const ctx = ctxOf(s.id), S = ctx.safe;
      const code = quiet(() => BLOCKS.codeBlock({ x: S.left, y: S.top + 100, w: (S.right - S.left) * 0.7, h: 900, lines: ["def search(xs, t):", long, "    return -1"], highlight: [{ line: 2, at: 1 }], at: 0 }, ctx));
      const term = quiet(() => BLOCKS.terminal({ x: S.left, y: S.top + 1050, w: (S.right - S.left) * 0.7, h: 600, session: [{ command: cmd, output: [out] }], at: 0 }, ctx));
      for (const n of [...code, ...term]) {
        if (n.kind !== "text") continue;
        expect(n.text.includes("…"), `${n.id}: ${n.text}`).toBe(false);
        expect(n.x + ctx.measure(n.text, n.role, n.keepCase ? { keepCase: true } : undefined)).toBeLessThanOrEqual(S.right + 1);
      }
      // Every character of the long line is drawn, in order.
      const drawn = code.filter((n) => /^code-l1(r\d+)?-/.test(n.id) && n.kind === "text").map((n) => (n as { text: string }).text).join("");
      expect(drawn.replace(/\s/g, "")).toBe(long.replace(/\s/g, ""));
      // The typed command is all there across its rows.
      const typedCmd = term.filter((n) => /-cmd-c\d+$/.test(n.id)).map((n) => (n as { text: string }).text).join("");
      expect(typedCmd).toBe(cmd.replace(/ /g, ""));
    });
  }
  test("a token wider than the column throws and says by how much", () => {
    const ctx = ctxOf("manual");
    expect(() => quiet(() => BLOCKS.codeBlock({ x: 200, y: 400, w: 300, h: 600, lines: ["x = " + "a".repeat(80)], at: 0 }, ctx))).toThrow(/px wider than the code column/);
  });
});

describe("quote with a picture (Nocturne)", () => {
  const ctx = ctxOf("nocturne"), S = ctx.safe;
  const box = { x: S.left, y: S.top, w: S.right - S.left, h: S.bottom - S.top };
  test("a statement across a picture's edge says so at build, and names quote's picture", () => {
    const said = warns(() => {
      BLOCKS.photo({ id: "pic", media: "nocturne-stacks", box: { x: 44, y: 520, w: 992, h: 1300 }, dim: true, at: 0 }, ctx);
      BLOCKS.quote({ id: "line", ...box, y: 300, h: 500, text: "We opened the roof.", name: "Vela Orin", at: 0 }, ctx);
    });
    expect(said.some((m) => /^line: its text runs across the edge of the picture pic at y 520.*quote\(\{ picture/.test(m))).toBe(true);
  });
  test("quote({ picture }) fills the frame under the statement; the statement fits the width; the role line is in ink", () => {
    const ns = quiet(() => BLOCKS.quote({ id: "q", ...box, text: "We opened the roof.", name: "Vela Orin", job: "Founder", picture: "nocturne-stacks", at: 0 }, ctx));
    const pic = ns.find((n) => n.kind === "image")!;
    expect([pic.x, pic.y, pic.w, pic.h]).toEqual([0, 0, ctx.width, ctx.height]);
    expect(ns.indexOf(pic)).toBe(0);
    const lines = ns.filter((n): n is TextNode => n.kind === "text" && n.id.startsWith("q-line"));
    const sc = lines[0]!.tracks?.scale?.[0]?.v ?? 1;
    const span = Math.max(...lines.map((n) => n.x + ctx.measure(n.text, n.role) * sc)) - Math.min(...lines.map((n) => n.x));
    expect(span / (S.right - S.left)).toBeGreaterThan(0.85);
    expect(ns.find((n) => n.id === "q-role-0")).toMatchObject({ color: "ink" });
  });
  test("an until at the next statement's start is moved so the two never show at once, with no warning", () => {
    const said = warns(() => BLOCKS.quote({ id: "q2", ...box, statements: [{ text: "We opened the roof.", at: 0, until: 4 }, { text: "Night answered.", at: 4 }], name: "Vela Orin", at: 0 }, ctx));
    expect(said.filter((m) => /still leaving/.test(m))).toEqual([]);
  });
});

describe("text at the text-safe top: the build and the frame check agree", () => {
  // An agent's Title film: a headline and a display title at the text-safe top, with x, y and w, warned "does not fit
  // its box or the text-safe area" where the frame check found the ink inside. The build now reads the font's ink.
  const ctx = ctxOf("title"), S = ctx.safe;
  test("a headline whose line box starts at the text-safe top fits; one whose ink rises above it does not", () => {
    const at = (y: number, role: "headline" | "display") => warns(() => BLOCKS.text({ id: "t", text: "LAST FERRY.", role, align: "center", x: S.left, y, w: S.right - S.left, at: 0 }, ctx));
    expect(at(S.top, "headline")).toEqual([]);
    expect(at(S.top, "display")).toEqual([]);
    expect(at(S.top - ctx.lineHeight("headline") * 0.5, "headline").some((m) => /does not fit its box or the text-safe area/.test(m))).toBe(true);
  });
});

describe("lockup with a large markSize: a column whose name lands in the low band", () => {
  // An agent's Cutout film: markSize 300 turned the row into a column, its name landed in the low band 51 px past the
  // band's edge with no warning from the block, and the role warning said "use a column" when it was one.
  const names = ["Oda", "Pasadu", "Lumenrava", "Halvorsen Ark", "Corvellanstrom", "DOPIK'S LOST HOUR"];
  for (const s of SYSTEMS) {
    test(`${s.id}: every text inside the text-safe area, or the block says so; no "use a column" for a column`, () => {
      const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.55), S = ctx.safe;
      for (const markSize of [200, 260, 300, 360]) for (const name of names) {
        const said: string[] = [];
        const ns = (() => { const w = console.warn; console.warn = (m: string) => said.push(String(m)); try { return BLOCKS.lockup({ id: "l", name, axis: "row", role: "display", mark: "circle", markSize, x: S.left, y: S.top + 200, w: S.right - S.left, h: S.bottom - S.top - 200, at: 0 }, ctx); } finally { console.warn = w; } })();
        const off = ns.filter((n) => n.kind === "text" && !s.bleed?.includes(n.role) && !textSafe(ctx, { x: n.x, y: n.y, w: ctx.measure(n.text, n.role), h: ctx.lineHeight(n.role) }, n.role));
        if (off.length) expect([s.id, markSize, name, said.some((m) => /outside the text-safe/.test(m))]).toEqual([s.id, markSize, name, true]);
        const mb = ns.find((n) => n.id === "l-mark-box") as { y: number; h: number } | undefined;
        const column = !!mb && (ns.find((n) => n.id === "l-name") as { y: number }).y >= mb.y + mb.h - 1;
        if (!column) continue;
        // In a column, names up to 14 letters fit: a smaller role keeps them inside the band.
        if (name.length <= 14) expect([s.id, markSize, name, off.map((n) => n.id)]).toEqual([s.id, markSize, name, []]);
        expect([s.id, markSize, name, said.filter((m) => /use a column/.test(m))]).toEqual([s.id, markSize, name, []]);
      }
    });
  }
  test("lines: 2 sets the name on two even lines; slab draws one rectangle behind the whole unit", () => {
    const s = SYSTEMS.find((x) => x.id === "cutout")!;
    const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.55), S = ctx.safe;
    const ns = quiet(() => BLOCKS.lockup({ id: "t", name: "DOPIK'S LOST HOUR", lines: 2, slab: "ink", color: "ground", axis: "column", mark: "none", x: S.left, y: S.top, w: S.right - S.left, at: 1 }, ctx));
    const texts = ns.filter((n) => n.kind === "text") as { id: string; text: string; y: number }[];
    expect(texts.map((t) => [t.id, t.text])).toEqual([["t-name", "DOPIK'S"], ["t-name-l2", "LOST HOUR"]]);
    expect(texts[1]!.y).toBeGreaterThan(texts[0]!.y);
    const slab = ns.find((n) => n.id === "t-slab") as { box: { x: number; y: number; w: number; h: number } };
    expect(ns[0]!.id).toBe("t-slab");
    expect(slab.box.y).toBeLessThan(texts[0]!.y);
    expect(slab.box.y + slab.box.h).toBeGreaterThan(texts[1]!.y + ctx.lineHeight("headline") * 0.5);
    // A "\n" in the name sets the break.
    const nl = quiet(() => BLOCKS.lockup({ id: "u", name: "DOPIK'S LOST\nHOUR", x: S.left, y: S.top, w: S.right - S.left, at: 1 }, ctx)).filter((n) => n.kind === "text") as { text: string }[];
    expect(nl.map((t) => t.text)).toEqual(["DOPIK'S LOST", "HOUR"]);
  });
});

describe("lockup at its default props fits the text-safe area", () => {
  // An agent's Mark film: the lockup crossed the text-safe edge at its default layout, in a column and in a row, and its
  // build warning disagreed with the frame check. Names of 3 to 14 letters, both axes, every system: no warning, and
  // the ink of each text inside the text-safe area (the measure the frame check uses).
  const names = ["Oda", "Pasadu", "Lumenrava", "Halvorsen Ark", "Corvellanstrom"];
  for (const s of SYSTEMS) {
    test(`${s.id}: a column and a row, names of 3 to 14 letters`, () => {
      const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.55), S = ctx.safe;
      for (const axis of ["column", "row"] as const) for (const name of names) {
        const said: string[] = [];
        const ns = (() => { const w = console.warn; console.warn = (m: string) => said.push(String(m)); try { return BLOCKS.lockup({ id: "l", name, line: "Every Saturday.", mark: "circle", axis, x: S.left, y: S.top, w: S.right - S.left, at: 0 }, ctx); } finally { console.warn = w; } })();
        expect([s.id, axis, name, said.filter((m) => /outside the text-safe/.test(m))]).toEqual([s.id, axis, name, []]);
        for (const n of ns) if (n.kind === "text" && !s.bleed?.includes(n.role)) {
          const b = inkBox(ctx, n.role, { x: n.x, y: n.y, w: ctx.measure(n.text, n.role), h: ctx.lineHeight(n.role) });
          expect([s.id, axis, name, n.id, b.x >= S.left - 0.5 && b.x + b.w <= S.right + 0.5 && b.y >= S.top - 0.5 && b.y + b.h <= S.bottom + 0.5]).toEqual([s.id, axis, name, n.id, true]);
        }
      }
    });
  }
});

describe("terminal timing", () => {
  // An agent's Manual film: a terminal at 0 s showed an empty pane for 0.43 s, and the scene computed the result's
  // time by hand. The first prompt is on frame 0; terminalTimes gives the block's own times.
  const s = SYSTEMS.find((x) => x.id === "manual")!;
  const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.55), S = ctx.safe;
  const session = [{ command: "git reset --soft HEAD~1", output: ["Unstaged changes after reset:", { text: "M  waits.py", result: true }] }];
  test("at 0 s the first prompt shows on frame 0", () => {
    const ns = quiet(() => BLOCKS.terminal({ id: "t", x: S.left, y: S.top, w: S.right - S.left, session, at: 0 }, ctx));
    const prompt = ns.find((n) => n.kind === "text" && /^\$/.test((n as TextNode).text)) as TextNode;
    expect(valueAt(s, prompt.tracks?.opacity, "opacity", 0)).toBe(1);
  });
  test("terminalTimes: the result's time is the block's own, and a command ends before its output", () => {
    for (const at of [0, 1.2, -1]) {
      const ns = quiet(() => BLOCKS.terminal({ id: "t", x: S.left, y: S.top, w: S.right - S.left, session, at }, ctx));
      const T = terminalTimes(ctx, { session, at });
      expect((ns.find((n) => n.id === "t-result") as { at: number }).at).toBeCloseTo(T.result!, 6);
      const c = T.commands[0]!;
      expect(c.typed).toBeLessThan(c.enter);
      expect(c.enter).toBeLessThan(c.lines[0]!);
    }
  });
});
