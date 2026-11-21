// Callout: a label, a leader and an anchor dot that names one part of a drawing. Use it in Spec and Schematic
// (and any drawn film) instead of a free `rule` and a free `text`.
//
// Rules this block enforces:
// - Its text is a diagram label (`content: "data"`), not prose: the density rule does not count its words.
// - The anchor never dangles: the leader ends on a dot at the target point, and it starts at the label's
//   measured edge (the side that faces the target), a small gap away. Nothing of the leader shows before its
//   target exists: it draws from the label to the dot after `targetAt` (default `at`) and after the label lands.
// - The label never touches a line or a mark that the block knows. `avoid` takes the nodes of the parts nearby
//   (gear, belt, dimension, formula, other callouts): the block reads their geometry from their anchors (a
//   gear's tooth-tip circle, a belt's two spans, the labels' boxes) and keeps the label's measured box a gap
//   clear of all of it, at every place the label passes when it follows a moving part.
// - Without x and y, the label finds its own place near the target (placeLabels): inside the text-safe area,
//   clear of `obstacles`, the line `points` and the `avoid` geometry, with a leader that crosses none of them.
// - With x and y, a label that would cross that geometry shifts to the nearest clear place (up, down, left,
//   right, in growing steps) and warns. With no clear place in reach, the block throws.
// - The label is a label-role line in ink that keeps its case as written (units: "12.7 mm"), with an optional number before it ("1  CHAINRING"). It comes on by
//   the system's vocabulary (a cut in a one-frame or opaque system, else a fade) and goes off with the rest.
// - `follow`: x and y keys (the same keys as the shape's own tracks). Every node of the callout rides with
//   them, so the callout stays on a part that moves. The text-safe check runs at every key, not only at rest.
// - The leader crosses no known label either; a label at a given place moves until both are clear. The leader is
//   named as a segment (anchor `<id>-leader-line`), so later labels keep clear of it.
// - It names the label's box: anchor `<id>-label`, and with `follow` the box the label sweeps on its way:
//   anchor `<id>-sweep`. Another callout with this one in `avoid` keeps clear of both.
// - A short leader near its target. `outside` (the drawing's bounds, px) puts the label outside the drawing, on
//   the side nearest the target, as square to that side as it can be, so the leader leaves the drawing by the
//   shortest way and never runs across it. A leader is never longer than `maxLeader` (default: the target's
//   distance to the nearest side of `outside` plus three label lines, or four label lines without `outside`).
//   A label at a given x and y whose leader is longer throws, and names both fixes: the maxLeader that keeps the
//   given place, and the place the block finds by itself. The block never moves a given label for its leader.
// - `figure` (blocks/figure.ts): the label goes next to its target where there is room: the nearest place round it
//   (beside it, over it, under it, then on the diagonals, a step further out each ring), clear of every stroke of the
//   drawing at every place the parts pass, of the status line's band and of every label, line and leader that the
//   figure's blocks placed before it. Its leader crosses no other leader, no label and no stroke away from its target.
//   Else the label goes outside the figure (its box), on the side nearest the target. The leader is never longer than
//   the figure's maxLeader (5 label lines by default): with no place inside it, the block throws and names a fix that
//   works. The block adds its label and its leader to the figure, so later blocks keep clear of them. A label it places
//   keeps its whole line box in the text-safe area, not only its ink, as the HyperFrames check judges the box.
// - One edge: a label the block places a few px off the text column's left or right edge moves onto that edge.
import { go, px, seq, textSafe } from "../context";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node, Tracks } from "../types";
import { vocabulary } from "../vocabulary";
import { onOff } from "./shape";
import { knockOut } from "./sheet";
import { nearestOnBox, placeLabels, type Box } from "./util";
import { figureOutline, segsCross, type Figure } from "./figure";

/** The x and y keys of a moving shape. Every node of a follower gets them. */
export type Follow = { x?: Key[]; y?: Key[] };

export type CalloutProps = {
  id?: string;
  /** The words: the part's name. */
  label: string;
  /** A number before the label, as on a drawing ("1"). */
  number?: string | number;
  /** The point the leader ends on, px. */
  target: { x: number; y: number };
  /** The label's top-left corner, px. Without it, the block places the label near the target. */
  x?: number; y?: number;
  /** Boxes the label and its leader must keep clear of, when the block places the label. */
  obstacles?: Box[];
  /** Points on lines (a chain, an outline) that the label and its leader must keep clear of. */
  points?: [number, number][];
  /** The nodes of nearby parts (gear, belt, dimension, formula, callout). The label keeps clear of their geometry. */
  avoid?: Node[];
  /** When the target exists on screen. The leader draws after it. Default: at. */
  targetAt?: number;
  /** The keys of a moving shape, so the callout rides with it. */
  follow?: Follow;
  /** The drawing's bounds, px: the label goes outside them, on the side nearest the target. */
  outside?: Box;
  /** The longest leader allowed, px. Default: see the header. */
  maxLeader?: number;
  /** The drawing's figure (figure(ctx, parts)): the label goes outside it, clear of all its annotation. */
  figure?: Figure;
  color?: ColorRole;
  at: number;
  until?: number;
};

/** The offsets a follower takes at each of its key times (and at rest, 0 0). */
export function followOffsets(f: Follow | undefined): [number, number][] {
  if (!f) return [[0, 0]];
  const val = (keys: Key[] | undefined, t: number) => {
    if (!keys?.length) return 0;
    let v = keys[0]!.v;
    for (const k of keys) if (k.t <= t + 1e-9) v = k.v;
    return v;
  };
  const times = [...new Set([0, ...(f.x ?? []).map((k) => k.t), ...(f.y ?? []).map((k) => k.t)])];
  return times.map((t) => [val(f.x, t), val(f.y, t)]);
}

/** Is a text box safe at every offset a follower takes? */
export function safeAlong(ctx: Ctx, b: Box, f: Follow | undefined, role?: Parameters<typeof textSafe>[2]): boolean {
  return followOffsets(f).every(([dx, dy]) => textSafe(ctx, { ...b, x: b.x + dx, y: b.y + dy }, role));
}

/** The offsets a follower takes, sampled along its keys (8 samples a segment), so a check sees the whole way. */
export function followPath(f: Follow | undefined): [number, number][] {
  if (!f) return [[0, 0]];
  const val = (keys: Key[] | undefined, t: number) => {
    if (!keys?.length) return 0;
    if (t <= keys[0]!.t) return keys[0]!.v;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1]!, b = keys[i]!;
      if (t <= b.t) return b.curve === "step" ? a.v : a.v + ((b.v - a.v) * (t - a.t)) / Math.max(1e-9, b.t - a.t);
    }
    return keys[keys.length - 1]!.v;
  };
  const times = [...new Set([0, ...(f.x ?? []).map((k) => k.t), ...(f.y ?? []).map((k) => k.t)])].sort((a, b) => a - b);
  const out: [number, number][] = [];
  times.forEach((t, i) => {
    const next = times[i + 1];
    for (let k = 0; k < (next === undefined ? 1 : 8); k++) { const u = next === undefined ? t : t + ((next - t) * k) / 8; out.push([val(f.x, u), val(f.y, u)]); }
  });
  return out;
}

/** The geometry a label must keep clear of, read from the anchors of other blocks' nodes. */
export type Outline = { circles: { x: number; y: number; r: number }[]; segments: [[number, number], [number, number]][]; boxes: Box[] };

/**
 * The outlines of nodes: a gear's tooth-tip circle (anchor `-pitch`, data cx cy tip), a belt's spans (anchors
 * `-top` and `-bottom`, data x1 y1 x2 y2), a dimension's line (`-line-box`), and the boxes of labels
 * (`-label`, `-sweep`, `-box`) and of a sheet's title block (`-title-block`).
 */
export function outlinesOf(nodes: Node[]): Outline {
  const o: Outline = { circles: [], segments: [], boxes: [] };
  for (const n of nodes) {
    if (n.kind !== "anchor") continue;
    const d = n.data ?? {};
    if (n.id.endsWith("-pitch") && typeof d.tip === "number") o.circles.push({ x: Number(d.cx), y: Number(d.cy), r: d.tip });
    else if (typeof d.x1 === "number") o.segments.push([[d.x1, Number(d.y1)], [Number(d.x2), Number(d.y2)]]);
    else if (/-(label|sweep|box|title-block)$/.test(n.id)) o.boxes.push({ x: n.x, y: n.y, w: n.w, h: n.h });
  }
  return o;
}

/** Does a box, grown by `gap`, touch any outline? A circle counts as its whole disc: text never sits on a gear. */
export function crosses(b: Box, o: Outline, gap: number): boolean {
  const g = { x: b.x - gap, y: b.y - gap, w: b.w + 2 * gap, h: b.h + 2 * gap };
  const inside = (x: number, y: number) => x > g.x && x < g.x + g.w && y > g.y && y < g.y + g.h;
  for (const c of o.circles) {
    const nx = Math.max(g.x, Math.min(c.x, g.x + g.w)), ny = Math.max(g.y, Math.min(c.y, g.y + g.h));
    if (Math.hypot(nx - c.x, ny - c.y) < c.r) return true;
  }
  for (const [[x1, y1], [x2, y2]] of o.segments) {
    const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2));
    for (let k = 0; k <= n; k++) if (inside(x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n)) return true;
  }
  return o.boxes.some((q) => g.x < q.x + q.w && q.x < g.x + g.w && g.y < q.y + q.h && q.y < g.y + g.h);
}

/**
 * A text box clear of the outlines at every place a follower takes it: the box itself when it is clear, else the
 * nearest clear place (up, down, left, right, in steps of half its height, up to 8 lines away) that stays in the
 * text-safe area. It warns when it moves the box, and throws when no clear place is near.
 */
export function clearPlace(ctx: Ctx, box: Box, geo: Outline, follow: Follow | undefined, role: Parameters<typeof textSafe>[2], what: string, gap: number, extra: (b: Box) => boolean = () => true): Box {
  const path = followPath(follow);
  const ok = (b: Box) => extra(b) && path.every(([dx, dy]) => !crosses({ ...b, x: b.x + dx, y: b.y + dy }, geo, gap));
  if (ok(box)) return box;
  for (let k = 1; k <= 16; k++) {
    const d = (k * box.h) / 2;
    for (const [dx, dy] of [[0, -d], [0, d], [-d, 0], [d, 0]] as const) {
      const b = { ...box, x: box.x + dx, y: box.y + dy };
      if (ok(b) && safeAlong(ctx, b, follow, role)) {
        console.warn(`${what} crossed a known outline; moved it by (${Math.round(dx)}, ${Math.round(dy)})`);
        return b;
      }
    }
  }
  throw new Error(`${what} at (${Math.round(box.x)}, ${Math.round(box.y)}) crosses a known outline, and no clear place is near; move it`);
}

/** Points along the outlines, for the leader check of placeLabels. */
function outlinePoints(o: Outline): [number, number][] {
  const pts: [number, number][] = [];
  for (const c of o.circles) { const n = Math.ceil((2 * Math.PI * c.r) / 6); for (let k = 0; k < n; k++) pts.push([c.x + c.r * Math.cos((2 * Math.PI * k) / n), c.y + c.r * Math.sin((2 * Math.PI * k) / n)]); }
  for (const [[x1, y1], [x2, y2]] of o.segments) { const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 6)); for (let k = 0; k <= n; k++) pts.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]); }
  return pts;
}

/** The follow keys as node tracks. */
export const followTracks = (f: Follow | undefined): Tracks => ({ ...(f?.x ? { x: f.x } : {}), ...(f?.y ? { y: f.y } : {}) });

export const callout: Block<CalloutProps> = (p, ctx) => {
  const id = p.id ?? "callout";
  const text = p.number !== undefined ? `${p.number}  ${p.label}` : p.label;
  const w = ctx.measure(text, "label", { keepCase: true }), h = ctx.lineHeight("label");
  const gap = Math.round(ctx.size("label") * 0.5);
  const dotR = Math.max(2.5, ctx.stroke * 1.6);
  const [tx, ty] = [p.target.x, p.target.y];
  const S = ctx.safe;
  const own = outlinesOf(p.avoid ?? []);
  const F = p.figure, fo = F ? figureOutline(F) : null;
  const geo: Outline = fo ? { circles: own.circles, segments: [...own.segments, ...fo.segments], boxes: [...own.boxes, ...fo.boxes] } : own;
  // The leader starts on the label's edge that faces the target (at the label's middle height when the target
  // is to the side), a gap away, and ends on the dot's edge.
  const leadStart = (b: Box): [number, number] => {
    // A target further below or above the label than to its side takes the leader from the label's bottom or top
    // edge, so the leader stays short and does not run back under the label.
    const dxOut = tx < b.x ? b.x - tx : tx > b.x + b.w ? tx - b.x - b.w : 0;
    const dyOut = ty < b.y ? b.y - ty : ty > b.y + h ? ty - b.y - h : 0;
    const side = dyOut > dxOut ? "y" : tx > b.x + b.w ? "right" : tx < b.x ? "left" : "y";
    if (side === "right") return [b.x + b.w + gap, b.y + h / 2];
    if (side === "left") return [b.x - gap, b.y + h / 2];
    const [nx, ny] = nearestOnBox(b, tx, ty);
    return [nx, ny + (ty > ny ? gap : -gap)];
  };
  // The leader crosses no known label (a box), at any place a follower takes it.
  const leaderClear = (b: Box) => {
    const seg = { circles: [], segments: [[leadStart(b), [tx, ty]]] as Outline["segments"], boxes: [] };
    // A leader crosses no other leader of the figure, and no stroke of the drawing away from its target (it may meet
    // the stroke it lands on).
    if (F && F.leaders.some((l) => segsCross(l, seg.segments[0]!))) return false;
    if (F && strokeCross(seg.segments[0]!)) return false;
    return followPath(p.follow).every(([dx, dy]) => [...geo.boxes, ...(p.obstacles ?? [])].every((q) => !crosses({ ...q, x: q.x - dx, y: q.y - dy }, seg, 2)));
  };
  // The part of a leader that may meet strokes: none of it, except the last gap before the target.
  function strokeCross(l: [[number, number], [number, number]]): boolean {
    const [[x1, y1], [x2, y2]] = l, L = Math.hypot(x2 - x1, y2 - y1);
    if (L <= gap) return false;
    const k = (L - gap) / L;
    const cut: [[number, number], [number, number]] = [[x1, y1], [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k]];
    return F!.timed.some((q) => q.t < 0 && segsCross(q.s, cut));
  }
  // A label at a given place also keeps clear of the obstacles; a placed one gets them through placeLabels.
  const geoFixed = { ...geo, boxes: [...geo.boxes, ...(p.obstacles ?? [])] };
  const path = followPath(p.follow);
  // Clear of the known geometry at every place the label passes.
  const clearOfGeo = (b: Box) => path.every(([dx, dy]) => !crosses({ ...b, x: b.x + dx, y: b.y + dy }, geo, gap * 0.5));
  // The leader's length from a label box, at rest.
  const leaderLen = (b: Box) => { const st = leadStart(b); return Math.hypot(tx - st[0], ty - st[1]); };
  const O = p.outside ?? F?.box;
  const edgeDist = O ? Math.max(0, Math.min(tx - O.x, O.x + O.w - tx, ty - O.y, O.y + O.h - ty)) : 0;
  const maxLeader = p.maxLeader ?? (F ? F.maxLeader : O ? edgeDist + 3 * h : 4 * h);
  const okBox = (b: Box) => clearOfGeo(b) && leaderClear(b) && safeAlong(ctx, b, p.follow, "label")
    && path.every(([dx, dy]) => (p.obstacles ?? []).every((q) => !crosses({ ...b, x: b.x + dx, y: b.y + dy }, { circles: [], segments: [], boxes: [q] }, gap * 0.5)));
  /**
   * The label outside the drawing's bounds: for each side, a box a gap past that side, slid along it so the leader
   * is as short and as square to the side as it can be. The best clear one wins: the shortest leader, with a cost
   * for each degree it leans off square.
   */
  const placeOutside = (): Box | null => {
    if (!O) return null;
    const g2 = gap * 2;
    const cands: { b: Box; cost: number }[] = [];
    const slide = (k: number) => [0, -0.5, 0.5, -1, 1, -1.5, 1.5, -2, 2, -2.5, 2.5, -3, 3, -4, 4, -5, 5, -6, 6].map((f) => f * k);
    // Above and below: the label's centre slides along x from the target's x.
    // Rows further out (j > 0) take a label that a nearer label already holds the place of.
    for (const side of ["top", "bottom"] as const) for (let j = 0; j < (F ? 6 : 3); j++) {
      const y = side === "top" ? O.y - g2 - h - j * (h + gap) : O.y + O.h + g2 + j * (h + gap);
      for (const dx of slide(w / 2)) cands.push({ b: { x: tx - w / 2 + dx, y, w, h }, cost: 0 });
      for (const b of [{ x: tx - w - gap, y, w, h }, { x: tx + gap, y, w, h }]) cands.push({ b, cost: 0 });
    }
    // Left and right: the label's middle slides along y from the target's y.
    for (const side of ["left", "right"] as const) for (let j = 0; j < 2; j++) {
      const x = side === "left" ? O.x - g2 - w - j * gap * 4 : O.x + O.w + g2 + j * gap * 4;
      for (const dy of slide(h)) cands.push({ b: { x, y: ty - h / 2 + dy, w, h }, cost: 0 });
    }
    for (const c of cands) {
      const st = leadStart(c.b), len = Math.hypot(tx - st[0], ty - st[1]);
      const lean = Math.atan2(Math.min(Math.abs(tx - st[0]), Math.abs(ty - st[1])), Math.max(Math.abs(tx - st[0]), Math.abs(ty - st[1]), 1e-6));
      c.cost = len + lean * h * 2;
    }
    cands.sort((a, b) => a.cost - b.cost);
    if (F) return cands.find((c) => leaderLen(c.b) <= maxLeader + 0.5 && okBox(c.b) && safeAlong(ctx, c.b, p.follow) && F.clear(c.b, gap * 0.5, p.follow))?.b ?? null;
    return cands.find((c) => leaderLen(c.b) <= maxLeader && okBox(c.b))?.b ?? cands.find((c) => okBox(c.b))?.b ?? null;
  };
  /**
   * With a figure: the label next to its target, where there is room: beside it (right, then left), then over it and
   * under it, a gap off, clear of every part and of all annotation, at every place a follower takes it.
   */
  const placeNear = (): Box | null => {
    if (!F) return null;
    // Every place on a grid round the target, nearest first: the cost is the leader's length, plus a little for a
    // leader that leans off square. The nearest places sit a gap off the target and need no leader.
    const cands: { b: Box; cost: number }[] = [];
    const R = maxLeader + gap * 1.5, st = Math.max(3, gap / 2);
    for (let y = ty - R - h; y <= ty + R; y += st) for (let x = tx - R - w; x <= tx + R; x += st) {
      const b = { x, y, w, h };
      const dx = Math.max(x - tx, 0, tx - x - w), dy = Math.max(y - ty, 0, ty - y - h);
      if (Math.hypot(dx, dy) < gap * 1.5 || Math.hypot(dx, dy) > R) continue;
      const lean = Math.min(dx, dy) / Math.max(dx, dy, 1e-6);
      cands.push({ b, cost: Math.hypot(dx, dy) + lean * gap });
    }
    cands.sort((a, b) => a.cost - b.cost);
    return cands.find((c) => leaderLen(c.b) <= maxLeader + 0.5 && okBox(c.b) && safeAlong(ctx, c.b, p.follow) && F.clear(c.b, gap * 0.5, p.follow))?.b ?? null;
  };
  let box: Box;
  const given = p.x !== undefined && p.y !== undefined ? { x: p.x, y: p.y, w, h } : null;
  if (given && leaderLen(given) > maxLeader + 0.5) {
    // A long leader runs across the drawing. The block never moves a given label for it: it says how to fix it.
    let found: Box | null = null;
    try { found = placeOutside() ?? autoPlace(); } catch { found = null; }
    throw new Error(`callout ${id}: the leader of "${text}" from (${Math.round(given.x)}, ${Math.round(given.y)}) is ${Math.round(leaderLen(given))} px, longer than maxLeader ${Math.round(maxLeader)} px. `
      + `Give maxLeader: ${Math.ceil(leaderLen(given))} to keep that place, or leave out x and y${found ? `: the block then places the label at (${Math.round(found.x)}, ${Math.round(found.y)})` : ""}${O ? "" : ", or give outside (the drawing's box) or figure"}`);
  } else if (given) {
    box = clearPlace(ctx, given, geoFixed, p.follow, "label", `callout ${id}: "${text}"`, gap * 0.5, leaderClear);
  } else {
    box = placeNear() ?? placeOutside() ?? (F ? noPlace() : autoPlace());
    // One edge: a placed label a few px off the text column's left or right edge moves onto it, when that place is clear.
    const snapTo = [S.left, S.right - w].find((x) => Math.abs(box.x - x) > 0.01 && Math.abs(box.x - x) < ctx.size("label") / 3);
    if (snapTo !== undefined && okBox({ ...box, x: snapTo }) && (!F || (F.clear({ ...box, x: snapTo }, gap * 0.5, p.follow) && leaderLen({ ...box, x: snapTo }) <= maxLeader + 0.5))) box = { ...box, x: snapTo };
  }
  /** With a figure and no place: the error names fixes that work (a longer leader that finds a place, or a target nearer the text). */
  function noPlace(): never {
    let longer: number | null = null;
    for (const m of [6, 8, 10, 14]) {
      const L = m * h;
      const tryAt = (b: Box) => leaderLen(b) <= L && okBox(b) && F!.clear(b, gap * 0.5, p.follow);
      const ring: Box[] = [];
      for (let k = 0; k < 40; k++) { const g2 = gap * 1.5 + k * gap; ring.push({ x: tx + g2, y: ty - h / 2, w, h }, { x: tx - g2 - w, y: ty - h / 2, w, h }, { x: tx - w / 2, y: ty - g2 - h, w, h }, { x: tx - g2 * 0.7 - w, y: ty - g2 * 0.7 - h, w, h }, { x: tx + g2 * 0.7, y: ty - g2 * 0.7 - h, w, h }); }
      if (ring.some(tryAt)) { longer = Math.ceil(L); break; }
    }
    const S2 = ctx.safe;
    const below = ty > S2.bottom ? ` The target is ${Math.round(ty - S2.bottom)} px under the text-safe foot (y ${Math.round(S2.bottom)}): name a point of the part nearer the text, or raise the drawing (fitDrawing room.bottom).` : "";
    throw new Error(`callout ${id}: no clear place for "${text}" within ${Math.round(maxLeader)} px of its target (${Math.round(tx)}, ${Math.round(ty)}), clear of the drawing's strokes, its labels and the status line.`
      + (longer ? ` Give figure(ctx, parts, { maxLeader: ${longer} }) to allow a longer leader; a place exists within it.` : "") + below + " Or shorten the label.");
  }
  function autoPlace(): Box {
    // The part that holds the target is not an obstacle for the leader (the leader must reach into it), only
    // for the label's box.
    const within = (o: Box) => tx >= o.x && tx <= o.x + o.w && ty >= o.y && ty <= o.y + o.h;
    const all = [...(p.obstacles ?? []), ...geo.boxes];
    const own = all.filter(within), others = all.filter((o) => !within(o));
    const clear = (b: Box) => own.every((o) => b.x + b.w + gap <= o.x || o.x + o.w + gap <= b.x || b.y + b.h + gap <= o.y || o.y + o.h + gap <= b.y);
    const place = (points: [number, number][]) => placeLabels([{ variants: [{ w, h }], anchor: [tx, ty], gap: gap * 4, lead: true }],
      { x: S.left, y: S.top, w: S.right - S.left, h: S.bottom - S.top }, others, points, gap, (b) => clear(b) && clearOfGeo(b) && safeAlong(ctx, b, p.follow, "label"))[0];
    // With no free place, the leader may cross a line (never a box or a text): a drawing's leaders cross lines.
    const linePts = [...(p.points ?? []), ...outlinePoints(geo)];
    let placed = place(linePts);
    if (!placed && linePts.length) { placed = place([]); if (placed) console.warn(`callout ${id}: the leader of "${text}" crosses a line; give x and y for a cleaner place`); }
    if (!placed) throw new Error(`callout ${id}: no place for "${text}" near (${tx}, ${ty}); give x and y, or fewer obstacles`);
    return placed.box;
  }
  if (!safeAlong(ctx, box, p.follow, "label")) console.warn(`callout ${id}: "${text}" leaves the text-safe area on its way`);

  const start = leadStart(box);
  const len = Math.hypot(tx - start[0], ty - start[1]);
  const end: [number, number] = len > dotR ? [tx - ((tx - start[0]) / len) * dotR, ty - ((ty - start[1]) / len) * dotR] : [tx, ty];

  const voc = vocabulary(ctx);
  const how = ctx.instant || voc.opaque || voc.text === "cut" ? "cut" : "fade";
  const lineAt = Math.max(p.at + (how === "cut" ? 0 : ctx.dur.enter), p.targetAt ?? p.at);
  const dotAt = ctx.instant ? lineAt : lineAt + ctx.dur.move;
  const follow = followTracks(p.follow);
  const color = p.color ?? "ink";
  const out: Node[] = [];
  const textTracks = { opacity: onOff(ctx, p.at, p.until, how, how), ...follow };
  const knock = knockOut(ctx, id, { x: box.x, y: box.y, w, h }, textTracks);
  if (knock) out.push(knock);
  out.push({ id: `${id}-text`, kind: "text", x: box.x, y: box.y, text, role: "label", color, keepCase: true, content: "data", tracks: textTracks });
  if (len > dotR + gap) {
    out.push({ id: `${id}-leader`, kind: "path", d: `M${px(start[0])} ${px(start[1])}L${px(end[0])} ${px(end[1])}`, stroke: color, width: Math.max(1, ctx.stroke * 0.75), cap: "butt",
      tracks: { opacity: onOff(ctx, lineAt, p.until, "cut", how), ...(ctx.instant ? {} : { draw: seq(go(ctx, lineAt, 0, 1, ctx.noOvershoot("move"), 1, "move")) }), ...follow } });
  }
  out.push({ id: `${id}-dot`, kind: "circle", cx: tx, cy: ty, r: dotR, fill: color, tracks: { opacity: onOff(ctx, dotAt, p.until, "cut", how), ...follow } });
  out.push({ id: `${id}-label`, kind: "anchor", ...box, at: p.at });
  // The leader as a segment, so a later label keeps clear of it (outlinesOf reads x1 y1 x2 y2).
  if (len > dotR + gap) out.push({ id: `${id}-leader-line`, kind: "anchor", x: Math.min(start[0], tx), y: Math.min(start[1], ty), w: Math.abs(tx - start[0]), h: Math.abs(ty - start[1]), at: p.at,
    data: { x1: start[0], y1: start[1], x2: end[0], y2: end[1] } });
  if (p.follow) {
    const xs = path.map(([dx]) => box.x + dx), ys = path.map(([, dy]) => box.y + dy);
    out.push({ id: `${id}-sweep`, kind: "anchor", x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + w, h: Math.max(...ys) - Math.min(...ys) + h, at: p.at });
  }
  // The figure keeps what this callout drew: its label (where it passes) and its leader.
  if (F) {
    const xs = path.map(([dx]) => box.x + dx), ys = path.map(([, dy]) => box.y + dy);
    F.labels.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs) + w, h: Math.max(...ys) - Math.min(...ys) + h });
    if (len > dotR + gap) F.leaders.push([[start[0], start[1]], [end[0], end[1]]]);
  }
  return out;
};
