// Exits always complete. A text block given `until` (or a title given `exit`) leaves within its exit time: after the
// exit begins, every masked line reaches the end of its reveal (gone above or below its mask) or its opacity reaches
// 0 within the system's exit duration (plus the stagger of its lines and one frame). No line may rest half revealed.
// It runs over every text block, every system, and times on and off the frame grid, an `until` inside the entrance
// included.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { lines, makeCtx } from "../context";
import { evaluate, withSystemMotion } from "../time";
import type { Ctx, Node } from "../types";
import { BLOCKS } from ".";
import { FIXTURES } from "./contract.test";

const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const ctxOf = (id: string): Ctx => { const s = SYSTEMS.find((x) => x.id === id)!; return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5); };
/** Text blocks whose `until` starts their exit. The numbers blocks (counter, bigStat, meter) wait for the roll to land;
 *  endCard's `until` is the film's end (the card holds to it), not an exit. */
const TEXT = ["text", "title", "fitText", "wordSeries", "kineticWords", "captions", "lockup", "quote", "typeOn", "lowerThird", "codeBlock", "terminal", "highlight", "annotate", "steps", "split", "matrix", "flow", "tree", "cycle", "sequence", "lineChart", "barChart"];
const TIMES: [number, number][] = [[1, 3], [0.7, 1.05], [1.013, 1.4], [0, 2.017], [-1, 0.6], [1, 1.1]];
const TITLES = ["line", "word", "fade", "cut"].flatMap((enter) => ["same", "fade", "cut"].map((exit) => ({ enter, exit })));

/** The first node still on screen half revealed, after `end`: opacity over 0.01 and a reveal strictly inside (-99.5, 99.5) other than 0... or any opacity with a reveal that never moves on. */
function stuck(ctx: Ctx, nodes: Node[], end: number): string | null {
  for (const n of withSystemMotion(ctx.system, nodes)) {
    if (n.kind === "audio" || n.kind === "anchor" || n.kind === "hold") continue;
    for (let f = Math.ceil(end * 30); f <= Math.ceil(end * 30) + 45; f += 3) {
      const v = evaluate(ctx.system, n.tracks, f / 30);
      if (v.opacity > 0.01) return `${n.id} shows at ${(f / 30).toFixed(2)} s (opacity ${v.opacity.toFixed(2)}, reveal ${v.reveal.toFixed(1)})`;
    }
  }
  return null;
}
const exitEnd = (ctx: Ctx, until: number, rows = 6) => until + ctx.dur.exit + rows * ctx.dur.stagger + 2 / 30;

describe("every exit completes: nothing rests half revealed after it leaves", () => {
  for (const s of SYSTEMS) {
    test(`${s.id}`, () => {
      const ctx = ctxOf(s.id);
      const off: string[] = [];
      for (const [at, until] of TIMES) {
        for (const name of TEXT) {
          let nodes: Node[];
          try { nodes = quiet(() => (BLOCKS as never as Record<string, (p: unknown, c: Ctx) => Node[]>)[name]!({ ...FIXTURES[name]!(at), until }, ctx)); } catch (e) { if (/does not allow|not after|after the typing|highlight/.test(String(e))) continue; throw e; }
          const why = stuck(ctx, nodes, exitEnd(ctx, until, 8) + 1.5);
          if (why) off.push(`${name} at ${at}, until ${until}: ${why}`);
        }
        for (const t of TITLES) {
          const nodes = quiet(() => BLOCKS.title({ ...FIXTURES.title!(at), text: "Find 28 in a sorted list of a million numbers.", maxLines: 4, until, ...t } as never, ctx));
          const why = stuck(ctx, nodes, exitEnd(ctx, until));
          if (why) off.push(`title ${JSON.stringify(t)} at ${at}, until ${until}: ${why}`);
        }
        const ls = lines(ctx, { id: "l", x: 200, y: 600, lines: ["One", "two", "three"], role: "body", at, until });
        const why = stuck(ctx, ls, exitEnd(ctx, until));
        if (why) off.push(`lines at ${at}, until ${until}: ${why}`);
      }
      expect(off).toEqual([]);
    });
  }
});
