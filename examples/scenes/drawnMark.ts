// The drawnMark scene: a brand mark given as SVG paths, drawn on by its strokes, filled part by part, then locked up
// with its name. The mark is original geometry drawn for this demo (no real brand): a disc cut by one chord, the two
// parts a gutter apart, over a bar. Velmira is a fictional name, drawn at random. The paths are inline here; a project
// adds its own file with `untell media add <file>.svg --as <name>` and gives that name as `mark`.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { heroBox, markAspect } from "../../src/system/scene/blocks";
import { DIRECTION } from "../../src/system/direction";

export const seconds = 7;

/** The mark as an SVG file's text: the inline form of what `untell media add` reads from a file. */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300">
  <path d="M120 0A120 120 0 0 0 16.08 180H223.92A120 120 0 0 0 120 0Z"/>
  <path d="M27.13 196A120 120 0 0 0 212.87 196Z"/>
  <rect x="0" y="252" width="240" height="48"/>
</svg>`;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const mark = { svg: SVG };
  // The mark takes the system's hero share of the frame (a little more in a wide frame, where the lockup sits beside it).
  const box = heroBox(ctx, markAspect(mark), { area: ctx.height > ctx.width ? 0.2 : 0.24 });
  return [
    // The accent on the cut part, in a system that keeps its accent for the mark (Keynote keeps it for links and states).
    ...B.drawnMark({ id: "mark", mark, box, accent: DIRECTION[ctx.system.id]?.accentFor ? undefined : 1, times: [0.2, 0.9, 1.6], fills: [1.6, 2.3, 3.0], fillWith: "cut",
      lockup: { name: "Velmira", line: "Glass for the table", at: 3.8 }, at: 0.2 }, ctx),
  ];
};
