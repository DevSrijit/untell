// Cross: a + registration mark, as printed where two grid lines meet.
//
// Rules this block enforces:
// - The mark is two strokes of the system stroke width, centred on (x, y). Its size is 24 px at a
//   1080 px short side unless the caller sets it.
// - A registration mark is printed, not animated: it appears whole in one frame, in every system.
// - At `until`, it fades out. After that it stays hidden.
// - `offset` moves the mark by [dx, dy] px: the misregistration of one ink against another (Riso).
//   Draw one cross per ink, each with its own offset.
import { px } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Node } from "../types";
import { markSize, shown } from "./rule";

export type CrossProps = {
  id?: string;
  /** The centre of the mark, px. */
  x: number; y: number;
  /** The length of each arm, end to end, px. Default: 24 px at a 1080 px short side. */
  size?: number;
  /** Default: "ink". */
  color?: ColorRole;
  /** A multiple of the system stroke. Default: 1. */
  weight?: number;
  /** Misregistration in px, as [dx, dy]: the mark prints this far from (x, y). Default [0, 0]. */
  offset?: [number, number];
  at: number;
  until?: number;
};

export const cross: Block<CrossProps> = (p, ctx) => {
  const s = p.size ?? markSize(ctx);
  const h = s / 2;
  const x = p.x + (p.offset?.[0] ?? 0), y = p.y + (p.offset?.[1] ?? 0);
  const node: Node = {
    id: p.id ?? "cross", kind: "path", d: `M${px(x - h)} ${px(y)}h${s}M${px(x)} ${px(y - h)}v${s}`,
    stroke: p.color ?? "ink", width: ctx.stroke * (p.weight ?? 1), cap: "butt",
    box: { x: x - h, y: y - h, w: s, h: s },
    tracks: { opacity: shown(ctx, p.at, p.until) },
  };
  return [node];
};
