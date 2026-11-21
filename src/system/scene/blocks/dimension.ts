// Dimension: a measure drawn as a drawing does. Two extension lines, a dimension line with a tick at each
// end, and the measure as a label. Use it to draw the answer, not only to type it (hard rule 12).
//
// Rules this block enforces:
// - Its text is a diagram label (`content: "data"`), not prose: the density rule does not count its words.
// - The extension lines start a small gap off the measured points and run past the dimension line, so the
//   line never touches the part. The dimension line sits `offset` px off the line from `from` to `to`, on the
//   side the sign of `offset` gives (positive: the left of from -> to, as a viewer sees it; up for a measure
//   drawn left to right).
// - Ticks are 45-degree slashes, the drawing convention for Spec and Schematic. Their length is 3 x the label
//   size / 4, and they are drawn with the dimension line.
// - The label is horizontal at any angle, centred on the dimension line's middle and moved out past it, so no
//   letter touches a line (hard rule 1). It keeps its case as written ("2.11 m", "π d").
// - Its lines are 3/4 of the system stroke, and never under PHONE_LINE (2 px at 1080 wide): a thinner line on a 390 px
//   phone blends under 3:1 against the ground (ink on Spec's ground: 1.5 px gives 2.0:1, 2 px gives 3.1:1).
// - It draws on in order: the extension lines, then the dimension line and ticks (stroke reveal on the move
//   curve), then the label lands. In a one-frame system each part cuts in.
// - `avoid`: the nodes of nearby parts; the label keeps clear of their outlines, or moves to the nearest clear place.
// - `follow` (x and y keys of the shape) moves every part with the shape, so the dimension stays on a part that
//   moves. The text-safe check runs at every key.
// - It names the label: anchor `<id>-label`, and the dimension line: anchor `<id>-line-box` (data x1 y1 x2 y2).
// - `figure` (blocks/figure.ts) places the dimension itself, as a drawing does, with no `offset`: on the `side` of
//   what it measures ("above" by default; "below", "left", "right"), just clear of every part and label in its span
//   (where they pass over the whole film), one step further out where its line or label would meet another.
//   It measures along that side (the x distance above or below, the y distance at the left or the right), so its
//   extension lines run square from each measured point to the tier, whatever their heights. Its label is centred on
//   the line, on the far side from the figure, and slides along the line (past an extension line where it must, with
//   the line run on under it) to stay in the text-safe area and clear of every label and line already placed.
// - The tiers step out from the edge; one more tier is the lowest place where the label still stands in the text-safe
//   area (on the side "above"). Under a drawing that reaches into the lower band, that tier keeps the value on its line
//   where the grid of tiers had none (the lever film: "6 m" went on a leader, so "2 m" could not continue its line).
// - Where the measured parts stand under the text-safe foot (a drawing on Schematic's figure foot reaches into the
//   lower band), the lines are picture and stay where they belong: in the nearest clear tier, inside the picture-safe
//   area. Only the value must be text. When no place on or along the line is text-safe, the value goes on a short
//   leader (as a drawing puts a value that does not fit on its line): the nearest clear place in the text-safe area,
//   with a hairline from the value to the dimension line, never longer than the figure's maxLeader. So the answer's
//   dimension can stand in the lower band. With no place at all, the block throws and names a fix it has tried and
//   that works: another side, a longer leader, or how far to raise the drawing.
import { go, px, seq } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Node } from "../types";
import { vocabulary } from "../vocabulary";
import { clearPlace, crosses, followTracks, outlinesOf, safeAlong, type Follow } from "./callout";
import { segHitsBox, segsCross, type Figure, type Side } from "./figure";
import { pictureSafe } from "./sheet";
import type { Box } from "./util";
import { textSafe } from "../context";
import { onOff } from "./shape";
import { knockOut } from "./sheet";

const knocked = (...a: Parameters<typeof knockOut>): Node[] => { const k = knockOut(...a); return k ? [k] : []; };

/** The thinnest line a drawing block draws by default, px at 1080 wide (see the header). */
export const PHONE_LINE = 2;

export type DimensionProps = {
  id?: string;
  /** The two measured points, px. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** The distance from the measured line to the dimension line, px. Positive: the left side of from -> to. Leave it out
   *  with `figure`: the figure gives the tier. */
  offset?: number;
  /** The drawing's figure (figure(ctx, parts)): the dimension places itself in a clear tier outside it. */
  figure?: Figure;
  /** With `figure`: the side of the figure the dimension stands on. Default "above". */
  side?: Side;
  /** The measure, as it reads ("2.11 m"). */
  text: string;
  /** The keys of a moving shape, so the dimension rides with it. */
  follow?: Follow;
  /** The nodes of nearby parts (gear, belt, callout). The label keeps clear of their geometry. */
  avoid?: Node[];
  color?: ColorRole;
  /** The label's colour. Default: the line's colour. */
  textColor?: ColorRole;
  at: number;
  until?: number;
};

export const dimension: Block<DimensionProps> = (p, ctx) => {
  const id = p.id ?? "dim";
  const { from: A, to: B } = p;
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  if (L < 1) throw new Error(`dimension ${id}: the two points are the same`);
  if (p.figure) return onFigure(p, ctx, p.figure);
  if (p.offset === undefined) throw new Error(`dimension ${id}: give offset (px from the measured line), or a figure to place it`);
  const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
  const s = Math.sign(p.offset) || 1;
  // The left of the direction from -> to, as a viewer sees it (screen y points down).
  const nx = uy * s, ny = -ux * s;
  const off = Math.abs(p.offset);
  const size = ctx.size("label");
  const gap = Math.max(3, Math.round(size * 0.25)), over = Math.round(size * 0.4), tick = Math.round(size * 0.75) / 2;
  // The line is never under PHONE_LINE: at 3/4 of a 2 px stroke (1.5 px at 1080 wide, 0.54 px on a 390 px phone) ink on
  // Spec's ground blends to 2.0:1, under the 3:1 floor for a drawing; 2 px blends to 3.1:1.
  const sw = Math.max(1, ctx.stroke * 0.75, PHONE_LINE * Math.min(ctx.width, ctx.height) / 1080);
  const pt = (x: number, y: number, k: number) => [x + nx * k, y + ny * k] as const;
  const a0 = pt(A.x, A.y, gap), a1 = pt(A.x, A.y, off + over), b0 = pt(B.x, B.y, gap), b1 = pt(B.x, B.y, off + over);
  const da = pt(A.x, A.y, off), db = pt(B.x, B.y, off);
  // A 45-degree slash through each end of the dimension line.
  const tx = (ux + nx) / Math.SQRT2 * tick, ty = (uy + ny) / Math.SQRT2 * tick;
  const P = (q: readonly [number, number]) => `${px(q[0])} ${px(q[1])}`;
  const ext = `M${P(a0)}L${P(a1)}M${P(b0)}L${P(b1)}`;
  const line = `M${P(da)}L${P(db)}M${P([da[0] - tx, da[1] - ty])}L${P([da[0] + tx, da[1] + ty])}M${P([db[0] - tx, db[1] - ty])}L${P([db[0] + tx, db[1] + ty])}`;

  // The label: horizontal, centred on the line's middle, moved out along the normal until its box clears the line.
  const opts = { keepCase: true };
  const w = ctx.measure(p.text, "label", opts), h = ctx.lineHeight("label");
  const mx = (da[0] + db[0]) / 2, my = (da[1] + db[1]) / 2;
  const clear = Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2) + gap + tick * 0.7;
  const box = clearPlace(ctx, { x: mx + nx * clear - w / 2, y: my + ny * clear - h / 2, w, h }, outlinesOf(p.avoid ?? []), p.follow, "label", `dimension ${id}: "${p.text}"`, gap);
  if (!safeAlong(ctx, box, p.follow, "label")) console.warn(`dimension ${id}: "${p.text}" leaves the text-safe area`);
  return drawn(p, ctx, { ext, line, box, da, db, sw });
};

/** The nodes of a dimension, from its geometry: the extension lines, the dimension line and ticks, the label. */
function drawn(p: DimensionProps, ctx: Parameters<Block<DimensionProps>>[1], g: { ext: string; line: string; box: { x: number; y: number; w: number; h: number }; da: readonly [number, number]; db: readonly [number, number]; sw: number; leader?: [[number, number], [number, number]] }): Node[] {
  const id = p.id ?? "dim";
  const { ext, line, box, da, db, sw, leader } = g;
  const voc = vocabulary(ctx);
  const how = ctx.instant || voc.opaque || voc.text === "cut" ? "cut" : "fade";
  const lineAt = ctx.instant ? p.at : p.at + ctx.dur.move * 0.5;
  const textAt = ctx.instant ? p.at : lineAt + ctx.dur.move;
  const draw = (at: number) => (ctx.instant ? {} : { draw: seq(go(ctx, at, 0, 1, ctx.noOvershoot("move"), 1, "move")) });
  const follow = followTracks(p.follow);
  const color = p.color ?? "ink";
  const out: Node[] = [
    { id: `${id}-ext`, kind: "path", d: ext, stroke: color, width: sw, cap: "butt", tracks: { opacity: onOff(ctx, p.at, p.until, "cut", how), ...draw(p.at), ...follow } },
    { id: `${id}-line`, kind: "path", d: line, stroke: color, width: sw, cap: "butt", tracks: { opacity: onOff(ctx, lineAt, p.until, "cut", how), ...draw(lineAt), ...follow } },
    // A value on a leader: the hairline from the value to the dimension line comes on with the value.
    ...(leader ? [{ id: `${id}-leader`, kind: "path" as const, d: `M${px(leader[0][0])} ${px(leader[0][1])}L${px(leader[1][0])} ${px(leader[1][1])}`, stroke: color, width: sw, cap: "butt" as const, tracks: { opacity: onOff(ctx, textAt, p.until, how, how), ...follow } }] : []),
    ...knocked(ctx, id, box, { opacity: onOff(ctx, textAt, p.until, how, how), ...follow }),
    { id: `${id}-text`, kind: "text", x: box.x, y: box.y, text: p.text, role: "label", color: p.textColor ?? color, keepCase: true, content: "data", tracks: { opacity: onOff(ctx, textAt, p.until, how, how), ...follow } },
    { id: `${id}-label`, kind: "anchor", ...box, at: textAt },
    ...(leader ? [{ id: `${id}-leader-line`, kind: "anchor" as const, x: Math.min(leader[0][0], leader[1][0]), y: Math.min(leader[0][1], leader[1][1]), w: Math.abs(leader[1][0] - leader[0][0]), h: Math.abs(leader[1][1] - leader[0][1]), at: textAt, data: { x1: leader[0][0], y1: leader[0][1], x2: leader[1][0], y2: leader[1][1] } }] : []),
    { id: `${id}-line-box`, kind: "anchor", x: Math.min(da[0], db[0]), y: Math.min(da[1], db[1]), w: Math.abs(db[0] - da[0]), h: Math.abs(db[1] - da[1]), at: lineAt, data: { x1: da[0], y1: da[1], x2: db[0], y2: db[1] } },
  ];
  return out;
}

/** A dimension that places itself in a tier outside a figure (see the header). With no place, it throws and names a
 *  fix that it has tried: another side, or a longer leader; else how far to raise the drawing. */
function onFigure(p: DimensionProps, ctx: Parameters<Block<DimensionProps>>[1], F: Figure): Node[] {
  const got = tierOnFigure(p, ctx, F);
  if (got) return got;
  const id = p.id ?? "dim", side = p.side ?? "above";
  // Dry runs: each fix is tried on the figure, then the figure is put back as it was.
  const n = { dims: F.dims.length, labels: F.labels.length, lines: F.lines.length, leaders: F.leaders.length };
  const undo = () => { F.dims.length = n.dims; F.labels.length = n.labels; F.lines.length = n.lines; F.leaders.length = n.leaders; };
  const across = side === "above" || side === "below";
  const others: Side[] = across ? (side === "above" ? ["below"] : ["above"]) : (side === "left" ? ["right"] : ["left"]);
  const works: string[] = [];
  for (const o of others) { if (tierOnFigure({ ...p, side: o }, ctx, F)) works.push(`side: "${o}"`); undo(); }
  if (!works.length) for (const m of [7, 9, 12]) {
    const keep = F.maxLeader; F.maxLeader = m * ctx.lineHeight("label");
    const ok = !!tierOnFigure(p, ctx, F); undo(); F.maxLeader = keep;
    if (ok) { works.push(`figure(ctx, parts, { maxLeader: ${Math.ceil(m * ctx.lineHeight("label"))} }) (a longer leader to the value)`); break; }
  }
  const low = Math.max(p.from.y, p.to.y) - ctx.safe.bottom;
  const lift = low > 0 ? ` The measured points stand ${Math.round(low)} px under the text-safe foot; raising the drawing by that much (fitDrawing room.bottom: ${Math.ceil(low)}) brings the value next to its line.` : "";
  throw new Error(`dimension ${id}: no clear place for "${p.text}" ${side} what it measures: no clear tier inside the picture-safe area, or no text-safe place for the value on its line or on a leader within ${Math.round(F.maxLeader)} px.`
    + (works.length ? ` This works: ${works.join(", or ")}.` : lift || " Shorten the text, or measure a part with more room round it."));
}

function tierOnFigure(p: DimensionProps, ctx: Parameters<Block<DimensionProps>>[1], F: Figure): Node[] | null {
  const id = p.id ?? "dim";
  const side = p.side ?? "above";
  const across = side === "above" || side === "below"; // the dimension measures x; else y
  const away = side === "above" || side === "left" ? -1 : 1;
  const size = ctx.size("label"), w = ctx.measure(p.text, "label", { keepCase: true }), h = ctx.lineHeight("label");
  const gap = Math.max(3, Math.round(size * 0.25)), over = Math.round(size * 0.4), tick = Math.round(size * 0.75) / 2;
  const sw = Math.max(1, ctx.stroke * 0.75, PHONE_LINE * Math.min(ctx.width, ctx.height) / 1080);
  // Along: the measured axis; normal: the axis out from the figure.
  const a = across ? p.from.x : p.from.y, b = across ? p.to.x : p.to.y;
  if (Math.abs(b - a) < 1) throw new Error(`dimension ${id}: the two points are the same along the ${across ? "x" : "y"} axis; a dimension on the ${side} measures ${across ? "across" : "up"}`);
  const lo = Math.min(a, b), hi = Math.max(a, b);
  // It stands off the measured point furthest toward this side. Its line must cross no part inside its span (where the
  // part passes over the whole film) and no label. A part that only straddles an end of the span is the measured
  // feature itself (a force's arrow on its line): the line may end on it.
  const pad = Math.round(size * 0.3);
  const inSpan = (q: Box) => (across ? q.x < hi - pad && q.x + q.w > lo + pad : q.y < hi - pad && q.y + q.h > lo + pad);
  const fromN = across ? [p.from.y, p.to.y] : [p.from.x, p.to.x];
  const edge = away < 0 ? Math.min(...fromN) : Math.max(...fromN);
  const inside = F.swept.filter(inSpan);
  // The first line sits one label size off that edge; each step out, one label line, the ticks and two gaps further.
  const first = Math.round(size * 0.9), pitch = Math.ceil((across ? h : w) + tick * 1.4 + gap * 3);
  const avoid = outlinesOf(p.avoid ?? []);
  const pt = (u: number, v: number): [number, number] => (across ? [u, v] : [v, u]);
  // The label's place along the line: centred first, then sliding out both ways (past an extension line at the last).
  const mid = (lo + hi) / 2, run = across ? w : h;
  const offsets = [0];
  for (let k = 1; k <= 40; k++) offsets.push(k * run / 8, -k * run / 8);
  // First every step with the label over its own line; then, where no step has room, the label past an extension line.
  // A dimension that meets another end to end first tries that one's line, to make a chain on one line; then the
  // steps out from its own edge.
  const own = Array.from({ length: 40 }, (_, k) => edge + away * (first + k * pitch / 2));
  // One more tier: the lowest line whose label (above it) still stands in the text-safe area. The grid of tiers can
  // step over it, from a tier whose label is under the text-safe foot to one whose line meets a label above.
  const lift = tick * 0.7 + gap; // the label's distance from its line (the label box below)
  if (side === "above") {
    const c0 = Math.floor(ctx.safe.bottom + lift);
    if (c0 <= edge - first) { own.push(c0); own.sort((u, v) => v - u); }
  }
  const chain = F.dims.filter((d) => d.side === side && (Math.abs(d.lo - hi) < 1 || Math.abs(d.hi - lo) < 1) && (d.c - own[0]!) * away >= -0.5).map((d) => d.c);
  const PS = pictureSafe(ctx);
  const inPicture = (sg: [[number, number], [number, number]]) => sg.every(([x, y]) => x >= PS.x - 0.5 && x <= PS.x + PS.w + 0.5 && y >= PS.y - 0.5 && y <= PS.y + PS.h + 0.5);
  for (const pass of ["on", "past", "leader"] as const) for (const c of [...chain, ...own]) {
    const past = pass !== "on";
    // The line lies on no other dimension's line, and its lines cross no label.
    const onLine = (l: number, r: number) => F.dims.some((d) => d.side === side && Math.abs(d.c - c) < pitch * 0.8 && l < d.hi - 1 && d.lo + 1 < r);
    if (onLine(lo, hi)) continue;
    const extA: [[number, number], [number, number]] = [pt(a, fromN[0]! + away * gap), pt(a, c + away * over)];
    const extB: [[number, number], [number, number]] = [pt(b, fromN[1]! + away * gap), pt(b, c + away * over)];
    const run0: [[number, number], [number, number]] = [pt(lo, c), pt(hi, c)];
    if (inside.some((q) => segHitsBox(run0, q, gap))) continue;
    if (F.labels.some((q) => segHitsBox(extA, q, 2) || segHitsBox(extB, q, 2) || segHitsBox(run0, q, gap))) continue;
    // The lines are picture: they stay inside the picture-safe area.
    if (![extA, extB, run0].every(inPicture)) continue;
    if (pass === "leader") {
      // The leader may cross the short run of an extension line past the dimension line, never the rest of it.
      const found = onLeader(c, [[extA[0], pt(a, c)], [extB[0], pt(b, c)]]);
      if (!found) continue;
      const { box, leader } = found;
      const da = pt(lo, c), db = pt(hi, c);
      const t1 = [tick / Math.SQRT2, -tick / Math.SQRT2];
      const P = (q: readonly [number, number]) => `${px(q[0])} ${px(q[1])}`;
      const line = `M${P(da)}L${P(db)}M${P([da[0] - t1[0]!, da[1] - t1[1]!])}L${P([da[0] + t1[0]!, da[1] + t1[1]!])}M${P([db[0] - t1[0]!, db[1] - t1[1]!])}L${P([db[0] + t1[0]!, db[1] + t1[1]!])}`;
      const ext = `M${P(extA[0])}L${P(extA[1])}M${P(extB[0])}L${P(extB[1])}`;
      F.dims.push({ side, c, lo, hi });
      F.labels.push(box);
      F.lines.push(extA, extB, run0);
      F.leaders.push(leader);
      return drawn(p, ctx, { ext, line, box, da, db, sw, leader });
    }
    for (const o of offsets) {
      const cu = mid + o;
      const l0 = cu - run / 2, l1 = cu + run / 2;
      if (l1 < lo - run * 1.5 || l0 > hi + run * 1.5) continue;
      if (!past && (l0 < lo - 0.5 || l1 > hi + 0.5) && o !== 0) continue;
      // The label on the far side of the line, clear of the ticks.
      const off = tick * 0.7 + gap;
      const box = across ? { x: l0, y: away < 0 ? c - off - h : c + off, w, h } : { x: away < 0 ? c - off - w : c + off, y: l0, w, h };
      const spanLo = Math.min(lo, l0), spanHi = Math.max(hi, l1);
      if (onLine(spanLo, spanHi)) continue;
      // The whole line box in the text-safe area, as the HyperFrames check judges it (not only the ink).
      if (!textSafe(ctx, box, "label") || !safeAlong(ctx, box, p.follow)) continue;
      if (!F.clear(box, pad, p.follow)) continue;
      if (crosses(box, avoid, pad / 2)) continue;
      // Found: the line from a to b, run on under the label when the label sits past an extension line.
      const da = pt(lo, c), db = pt(hi, c);
      const t1 = [tick / Math.SQRT2, -tick / Math.SQRT2];
      const P = (q: readonly [number, number]) => `${px(q[0])} ${px(q[1])}`;
      let line = `M${P(da)}L${P(db)}M${P([da[0] - t1[0]!, da[1] - t1[1]!])}L${P([da[0] + t1[0]!, da[1] + t1[1]!])}M${P([db[0] - t1[0]!, db[1] - t1[1]!])}L${P([db[0] + t1[0]!, db[1] + t1[1]!])}`;
      if (l0 < lo) line += `M${P(pt(l0, c))}L${P(da)}`;
      if (l1 > hi) line += `M${P(db)}L${P(pt(l1, c))}`;
      const ext = `M${P(extA[0])}L${P(extA[1])}M${P(extB[0])}L${P(extB[1])}`;
      F.dims.push({ side, c, lo: spanLo, hi: spanHi });
      F.labels.push(box);
      F.lines.push(extA, extB, [pt(Math.min(lo, l0), c), pt(Math.max(hi, l1), c)]);
      return drawn(p, ctx, { ext, line, box, da, db, sw });
    }
  }
  return null;

  /** The value on a leader from the dimension line at tier c: the nearest clear text-safe place round the line's
   *  middle, the leader from the value's edge to the nearest point of the line (between its ticks). */
  function onLeader(c: number, ownExt: [[number, number], [number, number]][]): { box: Box; leader: [[number, number], [number, number]] } | null {
    const [mx, my] = pt(mid, c);
    // Every place on a grid round the line's middle, nearest first (by the gap from the value's box to that middle).
    const cands: { b: Box; cost: number }[] = [];
    const R = F.maxLeader + gap;
    for (let y = my - R - h; y <= my + R; y += Math.max(3, gap / 2)) for (let x = mx - R - w; x <= mx + R; x += Math.max(3, gap / 2)) {
      const dx = Math.max(x - mx, 0, mx - x - w), dy = Math.max(y - my, 0, my - y - h), d = Math.hypot(dx, dy);
      if (d > gap * 2 && d <= R) cands.push({ b: { x, y, w, h }, cost: d });
    }
    cands.sort((a, b) => a.cost - b.cost);
    const strokeSegs = F.timed.filter((q) => q.t < 0).map((q) => q.s);
    for (const { b } of cands) {
      if (!textSafe(ctx, b, "label") || !safeAlong(ctx, b, p.follow)) continue;
      if (!F.clear(b, pad, p.follow) || crosses(b, avoid, pad / 2)) continue;
      // The leader: from the value's edge, on the way from its centre to the line's middle, a gap off, to that middle.
      const end = pt(mid, c);
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, vx = end[0] - cx, vy = end[1] - cy;
      const tEdge = Math.min(vx ? (b.w / 2) / Math.abs(vx) : Infinity, vy ? (b.h / 2) / Math.abs(vy) : Infinity);
      if (!(tEdge < 1)) continue;
      const bx = cx + vx * tEdge, by = cy + vy * tEdge, L0 = Math.hypot(end[0] - bx, end[1] - by);
      if (L0 < gap * 2) continue;
      const start: [number, number] = [bx + ((end[0] - bx) / L0) * gap, by + ((end[1] - by) / L0) * gap];
      const leader: [[number, number], [number, number]] = [start, end];
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) > F.maxLeader) continue;
      if ([...F.leaders, ...F.lines, ...ownExt].some((l) => segsCross(l, leader))) continue;
      if (ownExt.some((l) => segHitsBox(l, b, pad / 2))) continue;
      if (strokeSegs.some((sg) => segsCross(sg, leader))) continue;
      if (F.labels.some((q) => segHitsBox(leader, q, 1))) continue;
      return { box: b, leader };
    }
    return null;
  }
}
