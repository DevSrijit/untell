// A code block that is at rest on frame 0 (`at` before the film), lit on a beat, then a line that is typed on. It is
// the case an agent hit: `at: -0.8` once broke the line numbers' tracks, and the two renderers showed different frames.
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 6;
const CODE = ["def search(xs, t):", "    lo, hi = 0, len(xs) - 1", "    while lo <= hi:", "        mid = (lo + hi) // 2", "    return -1"];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const s = ctx.safe, w = s.right - s.left;
  // Each panel sizes to its rows (h left out), so no line is left out; the typed one sits a body line under the first.
  const rest = { id: "rest", x: s.left, y: s.top, w, title: "search.py", lines: CODE, at: -0.8, highlight: [{ line: 2, at: 1.5 }, { line: 4, at: 2.3 }] };
  const below = s.top + B.measure("codeBlock", rest, ctx).h + ctx.lineHeight("body");
  return [
    ...B.codeBlock(rest, ctx),
    ...B.codeBlock({ id: "typed", x: s.left, y: below, w, lines: ["print(search(xs, 28))"], enter: "type", at: 3 }, ctx),
  ];
};
