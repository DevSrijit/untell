// Line breaks in the title and text blocks: no one-word last line under a line of two or more words when the
// measure allows another break, and the fallback to one more line never adds one-word lines.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import type { Ctx } from "../types";
import { BLOCKS as B } from ".";
import { wrap } from "./text";

// A measure of 0.5 em a character: widths are easy to plan.
const ctxOf = (id: string): Ctx => { const s = SYSTEMS.find((x) => x.id === id)!; return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5); };
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const linesOf = (ctx: Ctx, text: string, w: number, role: "display" | "headline" = "headline") =>
  quiet(() => B.title({ id: "t", x: 121, y: 300, w, text, role, maxLines: 4, fit: "wrap", at: 0 }, ctx)).filter((n) => n.kind === "text").map((n) => (n as { text: string }).text);
const em = (ctx: Ctx, role: "headline" | "display") => ctx.size(role) * 0.5;

describe("title: no one-word last line", () => {
  for (const sys of ["riso", "spec", "studio", "cutout"]) {
    test(`${sys}: "Half the list goes each time." never ends on one word under two words`, () => {
      const ctx = ctxOf(sys);
      // Widths from 13 to 16 characters: greedy breaking gives "Half the list / goes each / time.".
      for (let ch = 13; ch <= 16; ch++) {
        const ls = linesOf(ctx, "Half the list goes each time.", Math.round(ch * em(ctx, "headline")) + 2);
        const n = ls.length;
        if (n > 1) expect(!ls[n - 1]!.includes(" ") && ls[n - 2]!.includes(" ")).toBe(false);
      }
    });
  }
  test("one more line is taken only when it adds no one-word line", () => {
    const ctx = ctxOf("riso");
    // "Find the" fits and "the middle" does not: "Find the / middle" stays; "Find / the / middle" is worse.
    const w = Math.round(9 * em(ctx, "headline")) + 2;
    const ls = linesOf(ctx, "Find the middle", w);
    expect(ls.filter((l) => !l.includes(" ")).length).toBeLessThanOrEqual(1);
  });
});

describe("text wrap: no one-word last line under two words", () => {
  test("a narrower measure keeps the line count and moves a word down", () => {
    const ctx = ctxOf("spec");
    const w = Math.round(13.5 * ctx.size("body") * 0.5);
    const ls = wrap(ctx, "Half the list goes each time.", "body", w);
    expect(ls.length).toBe(3);
    expect(ls[2]!.includes(" ")).toBe(true);
  });
});
