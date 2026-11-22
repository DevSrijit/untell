// The code-block scene: Euclid's algorithm in JavaScript, one line lit at a time.
// The code runs as shown: gcd(1071, 462) returns 21 (1071 = 3 x 3 x 7 x 17, 462 = 2 x 3 x 7 x 11).
// The loop tests b > 0, not b !== 0, because JetBrains Mono draws !== as a ligature.
import type { Ctx, Node } from "../../src/system/scene/types";
import { lineAndBlock, type BLOCKS } from "../../src/system/scene/blocks";

const CODE = [
  "function gcd(a, b) {",
  "  while (b > 0) {",
  "    [a, b] = [b, a % b];",
  "  }",
  "  return a;",
  "}",
  "gcd(1071, 462); // 21",
];

export const seconds = 10.5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe;
  const tall = ctx.height > ctx.width;
  // The line says what the code shows. At 9:16 it sits at the text-safe top and the panel straight under it, so the
  // most rows keep the full width above the low band (a row below lowBandTop ends sooner and may wrap). At 16:9 the
  // line takes a column at the left and the panel the right half, both on the optical centre. The panel's height
  // comes from its rows (no h). The last lit line holds to the end: the film ends on the answer.
  const line = "gcd(1071, 462) is 21.";
  const lineRows = (w: number) => B.measure("title", { id: "m", x: s.left, y: s.top, w, text: line, role: "headline", keepCase: true, at: -10 }, ctx).h;
  const P = (x: number, y: number, w: number) => ({ id: "gcd", x, y, w, title: "gcd.js", lines: CODE, at: 0.4,
    highlight: [{ line: 2, at: 2.4 }, { line: 3, at: 4.0 }, { line: 5, at: 5.6 }, { line: 7, at: 7.2 }] });
  if (tall) {
    const L = lineAndBlock(ctx, { lineH: lineRows(s.right - s.left), gap: Math.round(ctx.lineHeight("body") * 0.6) });
    return [
      ...B.title({ id: "line", text: line, role: "headline", keepCase: true, x: L.line.x, y: L.line.y, w: L.line.w, at: 0 }, ctx),
      ...B.codeBlock(P(L.block.x, L.block.y, L.block.w), ctx),
    ];
  }
  const colW = Math.round((s.right - s.left) * 0.36), gap = Math.round(ctx.lineHeight("body"));
  const pw = s.right - s.left - colW - gap, px = s.left + colW + gap;
  const h = B.measure("codeBlock", { ...P(px, s.top, pw), at: -10, highlight: [] }, ctx).h;
  const mid = s.top + (s.bottom - s.top) * 0.46;
  const lh = lineRows(colW);
  return [
    ...B.title({ id: "line", text: line, role: "headline", keepCase: true, x: s.left, y: Math.round(Math.max(s.top, mid - lh / 2)), w: colW, at: 0 }, ctx),
    ...B.codeBlock(P(px, Math.round(Math.max(s.top, Math.min(s.bottom - h, mid - h / 2))), pw), ctx),
  ];
};
