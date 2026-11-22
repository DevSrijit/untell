// The terminal scene: three shell commands and their real output (GNU coreutils factor, bash, bc).
// Run them to check: factor 360 1001 2026; echo $((2**16)); echo "obase=2;2026" | bc
import type { Ctx, Node } from "../../src/system/scene/types";
import { lineAndBlock, terminalHeight, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 14.5;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe;
  const tall = ctx.height > ctx.width;
  // The line says what the session shows. At 9:16 the panel sits straight under it, with seven rows (the nine rows of
  // the session scroll by two); at 16:9 the line takes a column at the left and the panel the right half. The session
  // ends on its last answer and a waiting prompt, which hold to the end: the film never ends on an empty frame.
  const line = "Three commands, three exact answers.";
  const lineRows = (w: number) => B.measure("title", { id: "m", x: s.left, y: s.top, w, text: line, role: "headline", keepCase: true, at: -10 }, ctx).h;
  const h = terminalHeight(ctx, { rows: 7 });
  const session = [
    { command: "factor 360 1001 2026", run: 0.15, output: ["360: 2 2 2 3 3 5", "1001: 7 11 13", "2026: 2 1013"] },
    { command: "echo $((2**16))", pause: 1.2, run: 0.1, output: ["65536"] },
    { command: "echo \"obase=2;2026\" | bc", pause: 1.2, run: 0.25, output: [{ text: "11111101010", result: true }] },
  ];
  if (tall) {
    const L = lineAndBlock(ctx, { lineH: lineRows(s.right - s.left), gap: Math.round(ctx.lineHeight("body") * 0.6) });
    return [
      ...B.title({ id: "line", text: line, role: "headline", keepCase: true, x: L.line.x, y: L.line.y, w: L.line.w, at: 0 }, ctx),
      ...B.terminal({ id: "sh", x: L.block.x, y: L.block.y, w: L.block.w, h, at: 0.4, session }, ctx),
    ];
  }
  const colW = Math.round((s.right - s.left) * 0.36), gap = Math.round(ctx.lineHeight("body"));
  const mid = s.top + (s.bottom - s.top) * 0.46, lh = lineRows(colW);
  return [
    ...B.title({ id: "line", text: line, role: "headline", keepCase: true, x: s.left, y: Math.round(Math.max(s.top, mid - lh / 2)), w: colW, at: 0 }, ctx),
    ...B.terminal({ id: "sh", x: s.left + colW + gap, y: Math.round(Math.max(s.top, Math.min(s.bottom - h, mid - h / 2))), w: s.right - s.left - colW - gap, h, at: 0.4, session }, ctx),
  ];
};
