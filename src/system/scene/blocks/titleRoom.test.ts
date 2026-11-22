// An agent's case (Spec): a title at the text-safe top lost its mask's overflow from its box, so a box
// of exactly two display lines could never hold two lines ("does not fit" for text that fitted). The mask's pad grows
// the mask; it never takes room from the text. In every system, for N = 1 to 3, a box of exactly N line heights at the
// text-safe top holds N lines with fit: "throw", and every line stays text-safe.
import { describe, expect, test } from "bun:test";
import { SYSTEMS, type TypeRole } from "../../systems";
import { makeCtx } from "../context";
import type { Ctx } from "../types";
import { BLOCKS } from ".";

const ctxOf = (id: string, w = 1080, h = 1920): Ctx => { const s = SYSTEMS.find((x) => x.id === id)!; return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * 0.5); };

describe("title: a box of N line heights holds N lines", () => {
  for (const s of SYSTEMS) {
    test(s.id, () => {
      for (const [w, h] of [[1080, 1920], [1920, 1080]]) {
        const ctx = ctxOf(s.id, w, h);
        for (const role of ["display", "headline", "body"] as TypeRole[]) {
          const S = ctx.safe, lh = ctx.lineHeight(role);
          const width = S.lowBandRight - S.left;
          // A word that fills 90 % of the measure: two never share a line.
          const L = Math.max(1, Math.floor((0.9 * width) / (0.5 * ctx.size(role))));
          for (let n = 1; n <= 3; n++) {
            if (S.top + (n + 1) * lh > S.bottom) continue;
            const text = Array.from({ length: n }, () => "M".repeat(L)).join(" ");
            const warned: string[] = [];
            const w0 = console.warn; console.warn = (m: string) => warned.push(m);
            let ns;
            try { ns = BLOCKS.title({ id: "t", x: S.left, y: S.top, w: width, h: n * lh, text, role, fit: "throw", maxLines: n, at: 0 }, ctx); }
            finally { console.warn = w0; }
            expect(ns.filter((x) => x.kind === "text").length).toBe(n);
            expect(warned.filter((m) => /outside the text-safe/.test(m))).toEqual([]);
          }
        }
      }
    });
  }
});
