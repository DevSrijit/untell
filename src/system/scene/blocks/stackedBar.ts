// Stacked bar: a 100 % bar that splits a whole into its parts. Several bars, one per row, compare
// the same parts across groups. It is the part-to-whole device of the system: no pie, no donut.
//
// Chart rules this block enforces:
// - A title is required. It names the whole and the unit (a share, in %).
// - Each row is exactly 100 % wide. The printed percentages use largest-remainder rounding, so
//   they add up to 100 in every row. A share that rounds to zero prints as "<1 %".
// - A segment too thin to see gets a minimum visible width. The width comes from the larger
//   segments, so the bar stays 100 % wide, and the segment still prints its value.
// - A hairline track shows the full 100 % before the segments fill it, so a quiet end segment
//   never makes the bar look short.
// - The key part is marked by more than colour: its segment is taller than the bar, its leader
//   is ink, and its name is in ink when its label sits outside. All percentages share one size, so
//   rows compare at a glance.
// - Context parts use one or two quiet neutral roles. Gaps of ground colour separate neighbours,
//   and every segment carries a direct label, so no reader has to match colours to a legend.
// - A label sits inside its segment when it fits. Otherwise it sits below (or above) the bar with
//   a leader line to its segment: straight when it can be, an elbow when it must step aside.
//   Labels touch no other label, and a leader crosses no label and no other leader. Every label
//   passes textSafe, including the 9:16 low band.
// - When the rows do not fit the box, the block makes room first (tighter padding, then thinner
//   bars). It leaves a label out only as the last step, and it warns when it does.
// - In a comparison, the first row names each part; later rows print only the percentages.
// - Segments grow from left to right, one after another, on ctx.noOvershoot("enter"). A segment
//   never grows past its share and comes back. Each segment takes time in proportion to its share,
//   so the whole bar fills in about the same time, whatever the number of parts.
import { colorOf } from "../layout";
import { contrast } from "../../color";
import { go, lines, px, textSafe, appear } from "../context";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Key, Node, Tracks } from "../types";
import { twoLines, type Box } from "./util";
import { GESTURES, hand, tagParts } from "./hand";

export type StackedBarProps = {
  id?: string;
  /** The block's box in px. The title, the bars and every label fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the whole and the unit, for example "Energy use by source, % of total". */
  title: string;
  /** The names of the parts, in order from left to right. */
  parts: string[];
  /** One bar per row. Each row gives one value per part, in any unit; the block turns them into shares. */
  rows: { label?: string; values: number[] }[];
  /** The part that matters (an index into `parts`). Default: none. */
  key?: number;
  /** Decimal places of the printed percentages (default 0). */
  decimals?: number;
  /** The height of each bar in px. Default: room for a percentage and a name inside. */
  barHeight?: number;
  at: number;
  until?: number;
};

type Line = { text: string; role: TypeRole; color: ColorRole };
type Label = { lines: Line[]; w: number; h: number };
type Seg = { part: number; x: number; w: number; share: number; pct: string; fill: ColorRole; at: number; done: number };
type Seg4 = [number, number, number, number];
type Placed = { box: Box; side: 1 | -1; lead: Seg4[]; label: Label; align: "left" | "right" | "center" };

const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Do two line segments cross? Segments that only touch at an end do not count. */
function cross(a: Seg4, b: Seg4): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  const d1 = o(a[0], a[1], a[2], a[3], b[0], b[1]), d2 = o(a[0], a[1], a[2], a[3], b[2], b[3]);
  const d3 = o(b[0], b[1], b[2], b[3], a[0], a[1]), d4 = o(b[0], b[1], b[2], b[3], a[2], a[3]);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Percentages that add up to exactly 100 at `decimals` places (largest remainder). */
function percents(values: number[], decimals: number): { share: number; text: string }[] {
  const total = values.reduce((s, v) => s + Math.max(0, v), 0) || 1;
  const unit = 10 ** decimals;
  const raw = values.map((v) => (Math.max(0, v) / total) * 100 * unit);
  const down = raw.map(Math.floor);
  let left = 100 * unit - down.reduce((s, v) => s + v, 0);
  raw.map((r, i) => [r - down[i]!, i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { down[i]!++; left--; } });
  return raw.map((r, i) => {
    const v = down[i]! / unit;
    const text = v === 0 && r > 0 ? `<${(1 / unit).toFixed(decimals)} %` : `${v.toFixed(decimals)} %`;
    return { share: r / (100 * unit), text };
  });
}

/** The text role that reads best on a fill: ink or ground, whichever has more contrast. */
function textOn(ctx: Ctx, fill: ColorRole): ColorRole {
  const f = colorOf(ctx.system, fill);
  return contrast(f, colorOf(ctx.system, "ink")) >= contrast(f, colorOf(ctx.system, "ground")) ? "ink" : "ground";
}

/** One or two quiet, neutral fills for the context parts, from the system's series roles. */
function contextFills(ctx: Ctx, keyFill: ColorRole): ColorRole[] {
  const g = colorOf(ctx.system, "ground"), k = colorOf(ctx.system, keyFill);
  const roles = ctx.system.roles as Record<string, { c: number } | undefined>;
  const quiet = (["series2", "series3", "series4", "series5"] as ColorRole[])
    .map((r) => ({ r, c: contrast(colorOf(ctx.system, r), g) }))
    .filter(({ r, c }) => c >= 1.25 && c <= 4.5 && (roles[r]?.c ?? 0) < 0.05 && colorOf(ctx.system, r) !== k)
    .sort((a, b) => b.c - a.c);
  if (!quiet.length) return ["rule"];
  if (quiet.length === 1 || quiet[0]!.c - quiet[1]!.c < 0.4) return [quiet[0]!.r];
  return [quiet[0]!.r, quiet[1]!.r];
}

export const stackedBar: Block<StackedBarProps> = (p, ctx) => tagParts(drawStackedBar(p, ctx), p.id ?? "stack", GESTURES.stackedBar!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawStackedBar: Block<StackedBarProps> = (p, ctx) => {
  const id = p.id ?? "stack";
  const out: Node[] = [];
  const keyIdx = p.key;
  const exit = p.until;
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label"), lhC = ctx.lineHeight("caption");
  // A part that would enter after the block leaves never shows; one that the exit cuts short cuts on (appear).
  const fadeKeys = (at: number): Key[] => appear(ctx, at, exit, 0).opacity!;
  const fade = (at: number): Tracks => ({ opacity: fadeKeys(at) });

  // Sizes. Padding inside a segment, the gap between segments, the key bump and the leader length.
  const padX = Math.round(sL * 0.35), padY = Math.round(sL * 0.3);
  const gap = Math.max(2, Math.round(ctx.stroke));
  const minVis = Math.max(3, Math.round(ctx.stroke * 1.5));
  const lead = Math.round(sL * 0.6);
  const pad = 4 + ctx.stroke;
  // Labels side by side in one lane keep at least this much space between them.
  const sepX = Math.max(pad, Math.round(sL * 0.6));

  // Colours: the key part in series1, the others in one or two quiet neutrals.
  const quiet = contextFills(ctx, "series1");
  let k = 0;
  const fills = p.parts.map((_, i) => (i === keyIdx ? "series1" : quiet[k++ % quiet.length]!)) as ColorRole[];

  // Title.
  // The title: one line, else two balanced lines, else as many lines as it needs.
  const two = twoLines(p.title);
  let titleLines: string[] = [];
  if (ctx.measure(p.title, "label") <= p.w) titleLines = [p.title];
  else if (two && two.every((l) => ctx.measure(l, "label") <= p.w)) titleLines = [...two];
  else for (const word of p.title.split(" ")) {
    const lastLine = titleLines[titleLines.length - 1];
    if (lastLine !== undefined && ctx.measure(`${lastLine} ${word}`, "label") <= p.w) titleLines[titleLines.length - 1] = `${lastLine} ${word}`;
    else titleLines.push(word);
  }
  out.push(...lines(ctx, { id: `${id}-title`, x: p.x, y: p.y, lines: titleLines, role: "label", color: "inkMuted", at: p.at, until: exit }));
  const top = p.y + lhL * (titleLines.length + 0.9);

  // Timing. The whole bar fills in about two move durations; each segment takes its share of that.
  const fillTime = ctx.dur.move * 2;
  const curve = ctx.noOvershoot("enter");
  const minStep = 2 / 30;
  const rowStart = (r: number) => p.at + ctx.dur.enter + ctx.dur.stagger * 2 + r * ctx.dur.enter * 1.5;

  // The rows, laid out for one bar height and inside padding. Returns the nodes, the height they
  // use, and how many labels found no room.
  const compose = (barH: number, padY: number) => {
    const out: Node[] = [];
    const bump = keyIdx === undefined ? 0 : Math.max(4, Math.round(barH * 0.08));
    const step = Math.round(lhL / 2);
    let cursor = top, dropped = 0;
    p.rows.forEach((row, r) => {
      const pcts = percents(row.values, p.decimals ?? 0);

      // Segment widths: shares of the bar, with a minimum visible width taken from the larger segments.
      const W = p.w;
      let widths = pcts.map((q) => q.share * W);
      const small = widths.map((w) => w > 0 && w < minVis + gap);
      const need = small.reduce((s, sm, i) => s + (sm ? minVis + gap - widths[i]! : 0), 0);
      const spare = widths.reduce((s, w, i) => s + (small[i] ? 0 : w), 0);
      widths = widths.map((w, i) => (small[i] ? minVis + gap : w > 0 ? w - (need * w) / spare : 0));
      let t = rowStart(r), xx = p.x;
      const segs: Seg[] = [];
      widths.forEach((w, i) => {
        if (w <= 0) return;
        const d = ctx.instant ? 1 / 30 : Math.max(minStep, fillTime * pcts[i]!.share);
        segs.push({ part: i, x: xx, w, share: pcts[i]!.share, pct: pcts[i]!.text, fill: fills[i]!, at: t, done: t + d });
        t += d;
        xx += w;
      });
      // The visible box of each segment: gaps between neighbours, flush with the track at both ends.
      const vis = (s: Seg) => {
        const l = s.x + (s.x > p.x + 0.5 ? gap / 2 : 0), rr = s.x + s.w - (s.x + s.w < p.x + W - 0.5 ? gap / 2 : 0);
        return { x: Math.round(l), w: Math.max(1, Math.round(rr) - Math.round(l)) };
      };

      // Label content. Row 0 names each part; later rows print the percentage only.
      const labelFor = (s: Seg, inside: boolean, wrap: boolean): Label => {
        const isKey = s.part === keyIdx;
        const tc: ColorRole = inside ? textOn(ctx, s.fill) : "ink";
        const ls: Line[] = [{ text: s.pct, role: "caption", color: tc }];
        if (r === 0) {
          const name = p.parts[s.part]!;
          const nc: ColorRole = inside ? tc : isKey ? "ink" : "inkMuted";
          const two = wrap ? twoLines(name) : null;
          for (const n of two ?? [name]) ls.push({ text: n, role: "label", color: nc });
        }
        return { lines: ls, w: Math.max(...ls.map((l) => ctx.measure(l.text, l.role))), h: ls.reduce((a, l) => a + ctx.lineHeight(l.role), 0) };
      };
      const rowLabelH = row.label ? lhL + Math.round(sL * 0.35) : 0;

      // One layout of the row. `skip` counts, for each part, the inside variants that failed textSafe
      // at the bar's final position (at 9:16 the low band ends text further left).
      const layout = (skip: Map<number, number>, reserve: number) => {
        const barTop = cursor + rowLabelH + reserve + bump;
        const barBot = barTop + barH;
        // Inside or outside: a label goes inside when its box and padding fit the segment.
        const inside = new Map<number, Label>();
        for (const s of segs) {
          const v = vis(s);
          const hAvail = barH + (s.part === keyIdx ? 2 * bump : 0) - 2 * padY;
          const tries = [labelFor(s, true, false)].slice(skip.get(s.part) ?? 0);
          const fit = tries.find((L) => L.w + 2 * padX <= v.w && L.h <= hAvail);
          if (fit) inside.set(s.part, fit);
        }
        // Outside labels. Each one searches slots below and above the bar. It prefers a vertical leader
        // (the label centres on it, or hangs from it like a flag). When no such slot is free, it takes a
        // slot further along the lane with an elbow leader: down from the segment, then across.
        const fixed: Box[] = [{ x: p.x, y: barTop - bump, w: W, h: barH + 2 * bump }];
        if (row.label) fixed.push({ x: p.x, y: cursor, w: ctx.measure(row.label, "label"), h: lhL });
        const crossesBox = (sg: Seg4, o: Box, m = Math.round(sepX / 2)) => {
          const n = Math.max(2, Math.ceil(Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) / 4));
          for (let q = 0; q <= n; q++) {
            const x = sg[0] + ((sg[2] - sg[0]) * q) / n, y = sg[1] + ((sg[3] - sg[1]) * q) / n;
            if (x > o.x - m && x < o.x + o.w + m && y > o.y - 2 && y < o.y + o.h + 2) return true;
          }
          return false;
        };
        const place = (order: Seg[]) => {
          const taken: Box[] = [...fixed];
          const leads: Seg4[] = [];
          const placed = new Map<number, Placed>();
          let dropped = 0;
          for (const s of order) {
            const v = vis(s);
            const isKey = s.part === keyIdx;
            // The leader leaves the segment at its centre, or at a quarter from either end when the
            // segment is wide enough. That lets a leader pass between two labels already placed.
            const anchors = v.w > sL * 3 ? [[v.x + v.w / 2, 0], [v.x + v.w * 0.25, 1], [v.x + v.w * 0.75, 1]] : [[v.x + v.w / 2, 0]];
            const variants = [labelFor(s, false, false), ...(r === 0 && twoLines(p.parts[s.part]!) ? [labelFor(s, false, true)] : [])];
            let best: (Placed & { cost: number }) | null = null;
            for (const [ax, anchorCost] of anchors as [number, number][]) variants.forEach((L, vi) => {
              for (const side of [1, -1] as const) {
                for (let kk = 0; kk < 16; kk++) {
                  const y = side === 1 ? barBot + bump + lead + kk * step : barTop - bump - lead - kk * step - L.h;
                  if (side === -1 && y < cursor + rowLabelH - 0.5) break;
                  const right = Math.min(p.x + p.w, y + L.h > ctx.safe.lowBandTop ? ctx.safe.lowBandRight : ctx.safe.right);
                  const left = Math.max(p.x, ctx.safe.left);
                  const y0 = side === 1 ? barBot + (isKey ? bump : 0) + 2 : barTop - (isKey ? bump : 0) - 2;
                  const firstH = ctx.lineHeight(L.lines[0]!.role), lastH = ctx.lineHeight(L.lines[L.lines.length - 1]!.role);
                  const ym = side === 1 ? y + firstH / 2 : y + L.h - lastH / 2;
                  const hg = Math.round(sL * 0.3);
                  const cands: [Placed["align"], number, number][] = [["center", ax - L.w / 2, 0], ["left", ax - 1, 0.3], ["right", ax - L.w + 1, 0.4],
                    ["left", ax + hg, 6], ["right", ax - hg - L.w, 6], ["left", right - L.w, 7], ["left", left, 7]];
                  for (const [align, bx, ac] of cands) {
                    const cost = kk * 2 + (side === -1 ? 3 : 0) + ac + vi * 1.5 + anchorCost + (ac >= 6 ? Math.abs(bx + L.w / 2 - ax) / W : 0);
                    if (best && cost >= best.cost) continue;
                    const box = { x: bx, y, w: L.w, h: L.h };
                    if (box.x < left - 0.5 || box.x + box.w > right + 0.5 || y + L.h > p.y + p.h + 0.5 || !textSafe(ctx, box)) continue;
                    const g = { x: box.x - sepX, y: box.y - pad, w: box.w + 2 * sepX, h: box.h + 2 * pad };
                    if (taken.some((o) => hits(g, o))) continue;
                    // The leader: straight down (or up) when the label spans the anchor, else an elbow.
                    const spans = ax >= box.x - 1 && ax <= box.x + box.w + 1;
                    if (ac >= 6 && spans) continue;
                    const hx = box.x > ax ? box.x - 4 : box.x + box.w + 4;
                    const segsL: Seg4[] = spans ? [[ax, y0, ax, side === 1 ? box.y - 4 : box.y + box.h + 4]] : [[ax, y0, ax, ym], [ax, ym, hx, ym]];
                    if (segsL.some((sg) => taken.slice(1).some((o) => crossesBox(sg, o)))) continue;
                    if (leads.some((o) => crossesBox(o, g, 0) || segsL.some((sg) => cross(o, sg)))) continue;
                    best = { cost, box, side, align, lead: segsL, label: L };
                  }
                }
              }
            });
            if (!best) { dropped++; continue; }
            const b: Placed & { cost: number } = best;
            taken.push(b.box);
            leads.push(...b.lead);
            placed.set(s.part, b);
          }
          const below = Math.max(0, ...[...placed.values()].filter((q) => q.side === 1).map((q) => q.box.y + q.box.h - barBot));
          const above = Math.max(0, ...[...placed.values()].filter((q) => q.side === -1).map((q) => barTop - q.box.y));
          return { placed, dropped, size: below + above };
        };
        // Greedy placement depends on the order. Try a few orders and keep the one that drops the
        // fewest labels, then the one that uses the least height.
        const out0 = segs.filter((s) => !inside.has(s.part));
        const keyFirst = (a: Seg, b: Seg) => (a.part === keyIdx ? -1 : b.part === keyIdx ? 1 : 0);
        const orders = [
          [...out0].sort((a, b) => keyFirst(a, b) || a.w - b.w),
          [...out0].sort((a, b) => keyFirst(a, b) || a.x - b.x),
          [...out0].sort((a, b) => keyFirst(a, b) || b.x - a.x),
          [...out0].sort((a, b) => a.x - b.x),
          [...out0].sort((a, b) => b.x - a.x),
        ];
        let pick = place(orders[0]!);
        for (const o of orders.slice(1)) {
          if (!pick.dropped && !pick.size) break;
          const c = place(o);
          if (c.dropped < pick.dropped || (c.dropped === pick.dropped && c.size < pick.size - 0.5)) pick = c;
        }
        const placed = pick.placed;
        // The room the labels above the bar use.
        const aboveUsed = Math.max(0, ...[...placed.values()].filter((q) => q.side === -1).map((q) => barTop - bump - q.box.y));
        return { inside, placed, barTop, aboveUsed, dropped: pick.dropped };
      };
      // Lay the row out, then again with exactly the room above that the labels used, until it holds.
      let skip = new Map<number, number>();
      // The first layout keeps room for two rows of labels above the bar; later layouts keep only what was used.
      let reserve = segs.length ? 2 * (lhC + 2 * lhL) + lead : 0;
      let L0 = layout(skip, reserve);
      for (let round = 0; round < 4; round++) {
        // Keep exactly the room above that the labels use, until it holds.
        for (let pass = 0; pass < 6 && Math.abs(L0.aboveUsed - reserve) >= 0.5; pass++) {
          reserve = L0.aboveUsed;
          L0 = layout(skip, reserve);
        }
        // Then move an inside label to its next variant (or outside) when it fails textSafe there.
        const bad = [...L0.inside].filter(([part, Lb]) => {
          const v = vis(segs.find((s) => s.part === part)!);
          return !textSafe(ctx, { x: v.x + padX, y: L0.barTop + (barH - Lb.h) / 2, w: Lb.w, h: Lb.h });
        }).map(([part]) => part);
        if (!bad.length) break;
        for (const part of bad) skip.set(part, (skip.get(part) ?? 0) + 1);
        L0 = layout(skip, reserve);
      }
      const { inside, placed, barTop } = L0;
      dropped += L0.dropped;
      const barBot = barTop + barH;

      // Nodes: the row label, the track, the segments, then the labels and leaders.
      const r0 = rowStart(r);
      if (row.label) out.push({ id: `${id}-r${r}-name`, kind: "text", x: p.x, y: cursor, text: row.label, role: "label", color: "inkMuted", tracks: fade(r0 - ctx.dur.enter) });
      // The bar in the system's hand (hand.ts): its ends, an outlined track (a drawing) and overprinted inks (Riso).
      const HS = hand(ctx), endR = HS.end === "full" ? barH / 2 : HS.end === "square" ? 0 : Math.min(ctx.radius, barH * 0.25);
      out.push({ id: `${id}-r${r}-track`, kind: "rect", x: p.x, y: barTop, w: W, h: barH, radius: endR, fill: "ground", stroke: HS.bar === "outline" ? "inkMuted" : "rule", strokeWidth: Math.max(1, ctx.stroke * 0.5), z: 0,
        tracks: fade(r0 - ctx.dur.enter) });
      for (const s of segs) {
        const v = vis(s);
        const isKey = s.part === keyIdx;
        const tr: Tracks = { scaleX: ctx.instant ? go(ctx, s.at, 0, 1) : go(ctx, s.at, 0, 1, curve, (s.done - s.at) / ctx.dur.move, "move"), ...fade(s.at) };
        out.push({ id: `${id}-r${r}-s${s.part}`, kind: "rect", x: v.x, y: barTop - (isKey ? bump : 0), w: v.w, h: barH + (isKey ? 2 * bump : 0),
          fill: s.fill, blend: HS.bar === "overprint" ? "multiply" : undefined, z: isKey ? 2 : 1, origin: [0, 0.5], tracks: tr });
        const lat = s.done + ctx.dur.stagger;
        const L = inside.get(s.part);
        if (L) {
          let ly = barTop + (barH - L.h) / 2;
          L.lines.forEach((l, j) => {
            out.push({ id: `${id}-r${r}-l${s.part}-${j}`, kind: "text", x: v.x + padX, y: px(ly), text: l.text, role: l.role, color: l.color, tracks: fade(lat + j * ctx.dur.stagger) });
            ly += ctx.lineHeight(l.role);
          });
          continue;
        }
        const pl = placed.get(s.part);
        if (!pl) continue;
        let ly = pl.box.y;
        pl.label.lines.forEach((l, j) => {
          const lw = ctx.measure(l.text, l.role);
          const lx = pl.align === "left" ? pl.box.x : pl.align === "right" ? pl.box.x + pl.box.w - lw : pl.box.x + (pl.box.w - lw) / 2;
          out.push({ id: `${id}-r${r}-l${s.part}-${j}`, kind: "text", x: px(lx), y: px(ly), text: l.text, role: l.role, color: l.color,
            tracks: fade(lat + ctx.dur.stagger * 2 + j * ctx.dur.stagger) });
          ly += ctx.lineHeight(l.role);
        });
        const d = pl.lead.map(([x0, y0, x1, y1], j) => `${j ? "" : `M${px(x0)} ${px(y0)}`}L${px(x1)} ${px(y1)}`).join("");
        out.push({ id: `${id}-r${r}-lead${s.part}`, kind: "path", d, stroke: isKey ? "ink" : "inkMuted",
          width: Math.max(1, ctx.stroke * 0.75), tracks: { draw: go(ctx, lat, 0, 1, "enter"), ...fade(lat) } });
      }

      // Next row: below this bar and its lowest label.
      const lowest = Math.max(barBot + bump, ...[...placed.values()].filter((q) => q.side === 1).map((q) => q.box.y + q.box.h));
      cursor = lowest + lhL * 1.2;
    });
    return { out, used: cursor - lhL * 1.2 - p.y, dropped };
  };

  // Make room before anything is dropped. The first layout keeps room for a percentage and a name
  // inside each bar. When labels find no room, the inside padding gets tighter, then the bars get
  // thinner. The first layout that places every label wins; if none does, the one that drops fewest.
  const options: [number, number][] = p.barHeight ? [[p.barHeight, padY]]
    : [[lhC + lhL + 2 * padY, padY], [lhC + lhL + 4, 2], [lhC + 2 * padY, padY]];
  let best: ReturnType<typeof compose> | null = null;
  for (const [h, py] of options) {
    const c = compose(h, py);
    if (!best || c.dropped < best.dropped || (c.dropped === best.dropped && c.used < best.used && best.used > p.h)) best = c;
    if (!c.dropped && c.used <= p.h + 0.5) { best = c; break; }
  }
  if (best!.dropped) console.warn(`stackedBar ${id}: ${best!.dropped} labels found no room and were left out`);
  out.push(...best!.out);
  return out;
};
