// Formula: a short piece of maths or a value set on a shape ("π d", "r = 0.32 m", "48 T"), which rides with the
// shape as it moves. Use it for the label that belongs to a part, not to the frame.
//
// Rules this block enforces:
// - Its text is a diagram label (`content: "data"`), not prose: the density rule does not count its words.
// - The text keeps its case as written (maths and units), in the label role by default.
// - It sits on one side of a point on the shape (`place`: above, below, left, right or centred on it), a gap away,
//   so no letter touches the shape's outline. Above, below and centred, the text is centred on the point's x; left
//   and right, on the point's y. Along that axis it slides into the text-safe area when the point is near an edge,
//   so it may sit off the point's centre there. It warns when it cannot fit.
// - `follow` (the shape's x and y keys) moves it with the shape. The text-safe check runs at every key, so the
//   label is readable wherever the shape stops.
// - It comes on and goes off by the system's vocabulary (a cut in a one-frame or opaque system, else a fade).
// - `avoid`: the nodes of nearby parts. The text keeps clear of their outlines (a gear's teeth, a belt's spans,
//   other labels) at every place it passes; it moves to the nearest clear place, or the block throws.
// - It names its box: anchor `<id>-box`.
import type { TypeRole } from "../../systems";
import type { ColorRole } from "../roles";
import type { Block, Node } from "../types";
import { inkBox } from "../context";
import { vocabulary } from "../vocabulary";
import { clearPlace, followPath, followTracks, outlinesOf, safeAlong, type Follow } from "./callout";
import { onOff } from "./shape";

export type FormulaProps = {
  id?: string;
  text: string;
  /** The point on the shape, px. */
  x: number; y: number;
  /** Where the text sits from the point. Default "above". Above, below and center centre the text on the point's x
   *  (left and right on its y), and slide it along that axis into the text-safe area near an edge. */
  place?: "above" | "below" | "left" | "right" | "center";
  /** The gap from the point, px. Default: half the role's size. */
  gap?: number;
  role?: TypeRole;
  color?: ColorRole;
  /** The keys of a moving shape, so the label rides with it. */
  follow?: Follow;
  /** The nodes of nearby parts (gear, belt, dimension, callout). The text keeps clear of their geometry. */
  avoid?: Node[];
  at: number;
  until?: number;
};

export const formula: Block<FormulaProps> = (p, ctx) => {
  const id = p.id ?? "formula";
  const role = p.role ?? "label";
  const w = ctx.measure(p.text, role, { keepCase: true }), h = ctx.lineHeight(role);
  const g = p.gap ?? Math.round(ctx.size(role) * 0.5);
  const place = p.place ?? "above";
  let x = place === "left" ? p.x - g - w : place === "right" ? p.x + g : p.x - w / 2;
  let y = place === "above" ? p.y - g - h : place === "below" ? p.y + g : p.y - h / 2;
  // Centred on the point along one axis (x for above, below and center; y for left and right): slide it along that
  // axis into the text-safe area, at every place `follow` takes it. Before: "below" near the frame's side ran past
  // the safe edge (a first-use test).
  const path = followPath(p.follow);
  const dxs = path.map(([dx]) => dx), dys = path.map(([, dy]) => dy);
  const S = ctx.safe;
  if (place === "left" || place === "right") {
    // By the role's ink, as the text-safe check reads it (a descender may reach under the line box).
    const ink = inkBox(ctx, role, { x, y, w, h });
    const lo = S.top - Math.min(...dys) - (ink.y - y), hi = S.bottom - Math.max(...dys) - (ink.y + ink.h - y);
    if (lo <= hi) y = Math.min(Math.max(y, lo), hi);
  } else {
    const right = y + h > S.lowBandTop ? S.lowBandRight : S.right;
    const lo = S.left - Math.min(...dxs), hi = right - w - Math.max(...dxs);
    if (lo <= hi) x = Math.min(Math.max(x, lo), hi);
  }
  const box = clearPlace(ctx, { x, y, w, h }, outlinesOf(p.avoid ?? []), p.follow, role, `formula ${id}: "${p.text}"`, Math.round(ctx.size(role) * 0.25));
  if (!safeAlong(ctx, box, p.follow, role)) console.warn(`formula ${id}: "${p.text}" leaves the text-safe area`);
  const voc = vocabulary(ctx);
  const how = ctx.instant || voc.opaque || voc.text === "cut" ? "cut" : "fade";
  const out: Node[] = [
    { id: `${id}-text`, kind: "text", x: box.x, y: box.y, text: p.text, role, color: p.color ?? "ink", keepCase: true, content: "data", tracks: { opacity: onOff(ctx, p.at, p.until, how, how), ...followTracks(p.follow) } },
    { id: `${id}-box`, kind: "anchor", ...box, at: p.at },
  ];
  return out;
};
