// An agent's case (Spec): typed labels that share one slot.
// - typeOn takes an `until` on, before or after the frame of its last typed key in every system (it threw "keys out
//   of time order" in the package the proof used), and no character shows from `until` on.
// - `replaces`: the old label leaves on the frame that the new one first shows, so two texts never show in one place
//   (the load label faded out over the slope label in the proof). The same for title, text and kineticWords.
// - typeOn's exit is a cut in a one-frame system and in a system whose text cuts.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { frameOf, makeCtx, withView } from "../context";
import { valueAt } from "../time";
import type { Ctx, Node } from "../types";
import { BLOCKS } from ".";
import { typeOnEnd } from "./typeOn";
import { checkReplaces, unbuiltReplaces } from "./handover";

const ctxOf = (id: string): Ctx => { const s = SYSTEMS.find((x) => x.id === id)!; return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5); };
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const op = (ctx: Ctx, n: Node, f: number) => (n.tracks?.opacity ? valueAt(ctx.system, n.tracks.opacity, "opacity", f / 30) : 1);
const texts = (ns: Node[]) => ns.filter((n) => n.kind === "text");

describe("typeOn: until on the frame of its last key", () => {
  for (const s of SYSTEMS) {
    test(`${s.id}: no throw, and nothing shows from until on`, () => {
      const ctx = ctxOf(s.id);
      const text = "LOAD AT EACH HANGER";
      for (const at of [1, 1.013, 5.37]) {
        const end = typeOnEnd({ text, at, pace: "write" }, ctx);
        for (const d of [-1 / 30, -0.001, 0, 0.001, 1 / 60, 1 / 30]) {
          const until = end + d;
          const ns = quiet(() => BLOCKS.typeOn({ id: "t", x: 200, y: 600, text, at, pace: "write", until }, ctx));
          // Every node is hidden once the exit has run (one frame, or the system's exit).
          const gone = frameOf(until) + Math.ceil(ctx.dur.exit * 30) + 1;
          for (const n of ns) expect(op(ctx, n, gone)).toBe(0);
        }
      }
    });
  }
});

describe("replaces: one place, one text at a time", () => {
  for (const id of ["spec", "schematic", "console", "graphite", "ma"]) {
    test(`${id}: typeOn after typeOn, title after title`, () => {
      const ctx = ctxOf(id);
      const a = quiet(() => BLOCKS.typeOn({ id: "load", x: 200, y: 1100, text: "LOAD AT EACH HANGER", pace: "write", at: 4.5, until: 7 }, ctx));
      const b = quiet(() => BLOCKS.typeOn({ id: "slope", x: 200, y: 1100, text: "SLOPE AT EACH HANGER", pace: "write", at: 6.3, replaces: "load" }, ctx));
      const t1 = quiet(() => BLOCKS.title({ id: "l1", x: 200, y: 400, w: 680, text: "Why does it curve?", role: "headline", at: 0, until: 9 }, ctx));
      const t2 = quiet(() => BLOCKS.title({ id: "l2", x: 200, y: 400, w: 680, text: "Equal loads", role: "headline", at: 5.5, replaces: "l1" }, ctx));
      for (const [old, , at] of [[a, b, 6.3], [t1, t2, 5.5]] as const) {
        const f = frameOf(at);
        for (const n of texts(old)) for (let g = f; g < f + 20; g++) expect(op(ctx, n, g)).toBe(0);
        // The old text still shows on the frame before (it has not left early).
        expect(Math.max(...texts(old).map((n) => op(ctx, n, f - 1)))).toBeGreaterThan(0);
      }
    });
  }
  test("a replaces that names no block of the scene fails when the scene is built, and says what to do", () => {
    const ctx = ctxOf("spec");
    quiet(() => BLOCKS.text({ id: "x", x: 200, y: 400, text: "One", role: "body", at: 1, replaces: "nothing" }, ctx));
    expect(unbuiltReplaces(ctx).length).toBe(1);
    expect(() => checkReplaces(ctx)).toThrow(/the scene builds no block with the id "nothing"/);
  });
  // A first-use test: replaces threw when the replaced block was built later in the code, also inside one return
  // list. The order of the code does not matter now.
  for (const id of ["spec", "primary", "ma"]) test(`${id}: the replaced block built after the block that replaces it leaves on the same frame`, () => {
    const ctx = ctxOf(id);
    const t2 = quiet(() => BLOCKS.title({ id: "l2", x: 200, y: 400, w: 680, text: "Equal loads", role: "headline", at: 5.5, replaces: "l1" }, ctx));
    const t1 = quiet(() => BLOCKS.title({ id: "l1", x: 200, y: 400, w: 680, text: "Why does it curve?", role: "headline", at: 0, until: 9 }, ctx));
    const f = frameOf(5.5);
    for (const n of texts(t1)) for (let g = f; g < f + 20; g++) expect(op(ctx, n, g)).toBe(0);
    expect(Math.max(...texts(t1).map((n) => op(ctx, n, f - 1)))).toBeGreaterThan(0);
    expect(Math.max(...texts(t2).map((n) => op(ctx, n, f + 20)))).toBeGreaterThan(0);
    expect(unbuiltReplaces(ctx)).toEqual([]);
    // In one return list, as a scene writes it.
    const ctx2 = ctxOf(id);
    const list = quiet(() => [...BLOCKS.title({ id: "b", x: 200, y: 400, w: 680, text: "Equal loads", role: "headline", at: 3, replaces: "a" }, ctx2),
      ...BLOCKS.title({ id: "a", x: 200, y: 400, w: 680, text: "Why?", role: "headline", at: 0 }, ctx2)]);
    for (const n of texts(list).filter((n) => n.id.startsWith("a"))) expect(op(ctx2, n, frameOf(3) + 5)).toBe(0);
    expect(() => checkReplaces(ctx2)).not.toThrow();
  });
  test("a replaces made on a view copy (withView) is seen at the end of the root build", () => {
    const ctx = ctxOf("spec");
    const view = withView(ctx, { x: 1080 });
    quiet(() => BLOCKS.title({ id: "b", x: 1280, y: 400, w: 680, text: "Two", role: "headline", at: 3, replaces: "nothing" }, view));
    expect(() => checkReplaces(ctx)).toThrow(/the scene builds no block with the id "nothing"/);
  });
});

describe("typeOn exit", () => {
  test("a one-frame system cuts; spec fades unless exit is cut", () => {
    for (const [id, exit, frames] of [["console", undefined, 1], ["spec", undefined, 2], ["spec", "cut", 1]] as const) {
      const ctx = ctxOf(id);
      const ns = quiet(() => BLOCKS.typeOn({ id: "t", x: 200, y: 600, text: "AB", at: 1, until: 3, exit }, ctx));
      const n = texts(ns)[0]!;
      const f = frameOf(3);
      // How many frames from `until` until the character is gone: 1 for a cut.
      let k = 0;
      while (op(ctx, n, f + k) > 0 && k < 30) k++;
      expect(k + 1 >= frames).toBe(true);
      if (frames === 1) expect(op(ctx, n, f)).toBe(0);
    }
  });
  test("content: data marks every character as data", () => {
    const ctx = ctxOf("spec");
    const ns = BLOCKS.typeOn({ id: "t", x: 200, y: 600, text: "FIG. 2", at: 1, content: "data" }, ctx);
    for (const n of texts(ns)) expect((n as { content?: string }).content).toBe("data");
  });
});

describe("hand-over by default: two text blocks in one box", () => {
  for (const id of ["matte", "studio", "keynote", "kinetic", "console", "ma", "riso"]) {
    test(`${id}: "Sit back." then "Orlenne." in one box never show together`, () => {
      const ctx = ctxOf(id);
      const box = { x: ctx.safe.left, y: 700, w: ctx.safe.right - ctx.safe.left, h: ctx.lineHeight("headline") * 2 };
      const a = quiet(() => BLOCKS.title({ id: "line", text: "Sit back.", role: "headline", ...box, at: 0.2, until: 5 }, ctx));
      const b = quiet(() => BLOCKS.title({ id: "name", text: "Orlenne.", role: "headline", ...box, at: 5 }, ctx));
      for (let f = 0; f < 240; f++) {
        const on = (ns: Node[]) => texts(ns).some((n) => op(ctx, n, f) > 0.01);
        expect(on(a) && on(b)).toBe(false);
      }
      // The new title keeps its own time: it shows from frameOf(5) on (or rises in from it).
      expect(Math.max(...texts(b).map((n) => op(ctx, n, frameOf(5) + 20)))).toBeGreaterThan(0.5);
    });
  }
  test("two titles in different places keep their own times", () => {
    const ctx = ctxOf("matte");
    const a = quiet(() => BLOCKS.title({ id: "top", text: "Sit back.", role: "headline", x: ctx.safe.left, y: 400, w: 600, at: 0.2, until: 5 }, ctx));
    quiet(() => BLOCKS.title({ id: "low", text: "Orlenne.", role: "headline", x: ctx.safe.left, y: 1000, w: 600, at: 4 }, ctx));
    expect(Math.max(...texts(a).map((n) => op(ctx, n, frameOf(4.5))))).toBeGreaterThan(0.5);
  });
  test("the block built first that starts later makes the earlier one leave too", () => {
    const ctx = ctxOf("matte");
    const box = { x: ctx.safe.left, y: 700, w: 700 };
    const late = quiet(() => BLOCKS.text({ id: "late", text: "Second", role: "headline", ...box, at: 3 }, ctx));
    const early = quiet(() => BLOCKS.text({ id: "early", text: "First", role: "headline", ...box, at: 0.5 }, ctx));
    for (let f = 0; f < 150; f++) expect(texts(late).some((n) => op(ctx, n, f) > 0.01) && texts(early).some((n) => op(ctx, n, f) > 0.01)).toBe(false);
  });
});

// An agent's Noir film: the second shot's line starts where a wipe has already covered the first line (wipeTimes().show),
// and wipeOut hides the first line there. The build gave a hand-over note all the same, and the agent spent two checks.
describe("a wipe between two lines in one place", () => {
  test("no hand-over note when the wipe hides the earlier line before the later one starts; a note without the wipe", () => {
    const ctx = ctxOf("noir"), S = ctx.safe;
    const said: string[] = [], warn = console.warn;
    console.warn = (...m: unknown[]) => said.push(m.map(String).join(" "));
    try {
      const box = { x: S.left, y: S.top, w: S.right - S.left };
      BLOCKS.title({ id: "line1", text: "Someone is locked out.", role: "headline", ...box, at: -1 }, ctx);
      const { wipeTimes } = require("./wipe") as typeof import("./wipe");
      const wt = wipeTimes(ctx, { id: "sweep", at: 2.75, from: "left" });
      BLOCKS.title({ id: "line2", text: "Every lock opens.", role: "headline", ...box, at: wt.show({ ...box, h: ctx.lineHeight("headline") }) }, ctx);
      expect(said.filter((m) => /replaces/.test(m))).toEqual([]);
      const ctx2 = ctxOf("noir");
      BLOCKS.title({ id: "line1", text: "Someone is locked out.", role: "headline", ...box, at: -1 }, ctx2);
      BLOCKS.title({ id: "line2", text: "Every lock opens.", role: "headline", ...box, at: 3 }, ctx2);
      expect(said.filter((m) => /replaces/.test(m)).length).toBe(1);
    } finally { console.warn = warn; }
  });
});
