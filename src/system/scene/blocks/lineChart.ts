// Line chart: one key series and up to four context series over a shared x axis.
//
// Chart rules this block enforces:
// - A title is required. It names the measure and the unit.
// - The y axis starts at zero unless `zero: false`; then the axis shows a break mark at its foot.
// - The key series is the thickest line, drawn last, with a direct label. Context series are thin;
//   series 4 and 5 are dashed, because their colour alone does not separate them from the ground.
// - No legend: every series carries its own label at its end, so no reader matches colours.
// - Labels place themselves: each tries several positions and takes the first that touches no line,
//   no other label and no edge of the chart.
// - Lines grow on a curve that never overshoots, so a line never passes its data on the way.
// - The system draws the chart in its own hand (blocks/hand.ts): the weight of the key and context lines, the value
//   scale (hairline rules, short ticks at the axis, or the labels alone: no gridlines unless the system's charts have
//   them) and the mark on the last point (a dot, an open ring, a square). End labels try first to sit over the end of
//   their line, right-aligned to it, so the plot keeps its width.
// - The lines draw as one gesture: the series carry the group `<id>-lines`, the scale `<id>-scale`.
import { appear, crisp, go, lines, px, textSafe, cut } from "../context";
import { SERIES, type ColorRole } from "../roles";
import { centreInk } from "../layout";
import type { Block, Ctx, Node } from "../types";
import { hand, tagParts } from "./hand";
import { fmt, niceScale, placeLabels, placeOver, samplePolyline, twoLines, type Box, type Format } from "./util";

export type LineChartProps = {
  id?: string;
  /** The chart's box in px: title, axes, labels and plot all fit inside it. */
  x: number; y: number; w: number; h: number;
  title: string;
  /** X-axis labels; one per data point. */
  xLabels: string[];
  /** Print every nth x label (the last one always prints). Default: as many as fit. */
  xEvery?: number;
  series: { label: string; values: number[] }[];
  /** Which series matters (default 0). It gets series1 and the heavy stroke. */
  key?: number;
  zero?: boolean;
  ticks?: number;
  format?: Format;
  /** A point on the key series to call out: its index and a short label. */
  callout?: { index: number; label: string };
  /** Reference values: a hairline across the plot in the rule colour, labelled with its value. Off by default. */
  guides?: number[];
  at: number;
  until?: number;
};

/**
 * A tall box (9:16, reaching below the text-safe foot, such as lineAndBlock's graphic room): the plot climbs the
 * frame down to the box's foot. Every label then sits inside the plot where the text-safe area allows it (at a line's
 * end, at the callout, at the gap the chart is about); the axes are only what the system's hand asks for (a measured
 * ruler at the top in Spec and Schematic, scale labels only where they are text-safe), and no x labels sit at the foot.
 */
export const tallBox = (ctx: Ctx, p: { y: number; h: number }) => ctx.height > ctx.width && p.y + p.h > ctx.safe.bottom + ctx.lineHeight("label") * 2;

/** A polyline as a path: straight segments, or steps (level, then a vertical jump) in a blunt hand. */
export const linePath = (pts: readonly (readonly [number, number])[], step: boolean) =>
  pts.map(([x, y], i) => (i === 0 ? `M${px(x)} ${px(y)}` : step ? `H${px(x)}V${px(y)}` : `L${px(x)} ${px(y)}`)).join("");

/** Lays out the chart with `gutter` px kept free right of the plot for end labels. */
function compose(p: LineChartProps, ctx: Ctx, gutter: number): { out: Node[]; need: number } {
  const id = p.id ?? "line";
  const keyIdx = p.key ?? 0;
  const f = p.format ?? {};
  const out: Node[] = [];
  const all = p.series.flatMap((s) => s.values);
  const zero = p.zero ?? true;
  const scale = niceScale(zero ? Math.min(0, ...all) : Math.min(...all), Math.max(...all), p.ticks ?? 4);
  const lhL = ctx.lineHeight("label"), sL = ctx.size("label");
  const H = hand(ctx);

  // Layout, top to bottom: title, plot, x labels. Y labels sit left of the plot.
  // A tall box: the text keeps the text-safe columns; the x scale is a ruler at the top or none; the plot runs to the foot.
  const tall = tallBox(ctx, p);
  const TX = tall ? Math.max(p.x, ctx.safe.left) : p.x, textR = tall ? Math.min(p.x + p.w, ctx.safe.right) : p.x + p.w;
  const titleLines = ctx.measure(p.title, "label") <= textR - TX ? [p.title] : (twoLines(p.title) ?? [p.title]);
  const titleH = lhL * (titleLines.length + 1.1);
  const yLabels = !tall || H.grid !== "none";
  const yLabelW = yLabels ? Math.max(...scale.ticks.map((v) => ctx.measure(fmt(v, f), "label"))) + sL * 0.6 : 0;
  const xAxis: "bottom" | "top" | "none" = !tall ? "bottom" : H.axis === "ruler" ? "top" : "none";
  const xLabelH = xAxis === "bottom" ? lhL + sL * 0.5 : 0;
  const rulerH = xAxis === "top" ? lhL + sL * 0.9 : 0;
  // A measured gap (Spec) keeps room right of the plot for its dimension line.
  const dimW = H.measure && p.series.length > 1 ? sL * 1.6 : 0;
  const plotX = (tall ? Math.max(p.x, TX) : p.x) + yLabelW;
  const plot = { x: plotX, y: p.y + titleH + rulerH, w: textR - plotX - sL * 0.4 - gutter - dimW, h: p.h - titleH - xLabelH - rulerH - (tall ? ctx.stroke * 4 : 0) };
  const n = p.xLabels.length;
  const X = (i: number) => plot.x + (n === 1 ? plot.w / 2 : (i / (n - 1)) * plot.w);
  const Y = (v: number) => plot.y + plot.h - ((v - scale.min) / (scale.max - scale.min)) * plot.h;

  const t0 = p.at;
  const exit = p.until;
  const fade = (at: number) => appear(ctx, at, exit, 0);
  const obstacles: Box[] = [];

  // Title: one line, or two when one does not fit the box.
  out.push(...lines(ctx, { id: `${id}-title`, x: TX, y: p.y, lines: titleLines, role: "label", color: "inkMuted", at: t0, until: exit }));
  obstacles.push({ x: TX, y: p.y, w: Math.max(...titleLines.map((l) => ctx.measure(l, "label"))), h: lhL * titleLines.length });

  // Gridlines and y labels, drawn from the baseline up.
  scale.ticks.forEach((v, i) => {
    const gy = px(Y(v));
    const at = t0 + ctx.dur.stagger * (i + 1);
    const base = i === 0;
    // The baseline is a full line in ink. Above it, the hand decides: a hairline rule, a short tick at the axis, or nothing.
    const d = base || H.grid === "rules" ? `M${plot.x} ${gy}H${plot.x + plot.w}` : H.grid === "ticks" ? `M${plot.x} ${gy}H${px(plot.x + sL * 0.45)}` : "";
    if (d) out.push({ id: `${id}-grid-${i}`, kind: "path", d, stroke: base ? "ink" : H.grid === "ticks" ? "inkMuted" : "rule",
      width: ctx.stroke * (base ? 1 : 0.5), tracks: { draw: go(ctx, at, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...fade(at) } });
    if (!yLabels) return;
    const label = fmt(v, f);
    const lw = ctx.measure(label, "label");
    // The label's ink (figures) is centred on its gridline, not its line box.
    const box = { x: Math.ceil(plot.x - sL * 0.6 - lw), y: centreInk(ctx, label, "label", { y: gy, h: 0 }), w: lw, h: lhL };
    // In a tall box a scale label below the text-safe foot is left out; its tick or rule stays.
    if (tall && !textSafe(ctx, box, "label")) return;
    obstacles.push(box);
    out.push({ id: `${id}-ylab-${i}`, kind: "text", x: box.x, y: box.y, text: label, role: "label", color: "inkMuted", tracks: fade(at + ctx.dur.stagger) });
  });
  // Guides: reference values the reader needs, in the rule colour, labelled at the plot's right end when text-safe.
  (p.guides ?? []).forEach((v, i) => {
    const gy = px(Y(v)), at = t0 + ctx.dur.stagger * (scale.ticks.length + 1);
    out.push({ id: `${id}-guide-${i}`, kind: "path", d: `M${plot.x} ${gy}H${plot.x + plot.w}`, stroke: "rule", width: Math.max(1, ctx.stroke * 0.5), dash: [ctx.stroke * 3, ctx.stroke * 2],
      tracks: { draw: go(ctx, at, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...fade(at) } });
    obstacles.push({ x: plot.x, y: gy - 1, w: plot.w, h: 2 });
    const label = fmt(v, f), lw = ctx.measure(label, "label");
    const box = { x: plot.x + plot.w - lw, y: gy - lhL - sL * 0.15, w: lw, h: lhL };
    if (!textSafe(ctx, box, "label")) return;
    obstacles.push(box);
    out.push({ id: `${id}-guidelab-${i}`, kind: "text", x: box.x, y: box.y, text: label, role: "label", color: "inkMuted", tracks: fade(at + ctx.dur.stagger) });
  });
  if (!zero) {
    const by = plot.y + plot.h, s = sL * 0.35;
    out.push({ id: `${id}-break`, kind: "path", d: `M${plot.x - s} ${by + s * 0.6}L${plot.x + s} ${by - s * 0.6}M${plot.x - s} ${by + s * 1.4}L${plot.x + s} ${by + s * 0.2}`,
      stroke: "ink", width: ctx.stroke, tracks: fade(t0 + ctx.dur.enter) });
  }

  // X labels: every nth, as many as fit, always the last.
  const widest = Math.max(...p.xLabels.map((l) => ctx.measure(l, "label")));
  const every = p.xEvery ?? Math.max(1, Math.ceil((widest * 1.6) / (n > 1 ? plot.w / (n - 1) : plot.w)));
  // At the foot of the plot; in a tall box a measured ruler at its top (ticks down to the plot), or none.
  if (xAxis !== "none") p.xLabels.forEach((l, i) => {
    if (!l || (i % every !== 0 && i !== n - 1)) return;
    if (i !== n - 1 && n - 1 - i < every) return; // keep the last label clear of its neighbour
    const lw = ctx.measure(l, "label");
    const lx = Math.min(Math.max(X(i) - lw / 2, plot.x - lw / 2), plot.x + plot.w - lw / 2, (tall ? textR : Infinity) - lw);
    const ly = xAxis === "top" ? plot.y - rulerH : plot.y + plot.h + sL * 0.5;
    out.push({ id: `${id}-xlab-${i}`, kind: "text", x: lx, y: ly, text: l, role: "label", color: "inkMuted", tracks: fade(t0 + ctx.dur.stagger * 2) });
    if (xAxis === "top") {
      obstacles.push({ x: lx, y: ly, w: lw, h: lhL });
      out.push({ id: `${id}-xtk-${i}`, kind: "path", d: `M${crisp(X(i), 1)} ${px(plot.y - sL * 0.35)}V${px(plot.y)}`, stroke: "inkMuted", width: 1, tracks: fade(t0 + ctx.dur.stagger * 2) });
    }
  });
  if (xAxis === "top") out.push({ id: `${id}-xrule`, kind: "path", d: `M${px(plot.x)} ${crisp(plot.y - sL * 0.35, 1)}H${px(plot.x + plot.w)}`, stroke: "rule", width: 1, tracks: fade(t0 + ctx.dur.stagger) });

  // Series: context first, the key series last so it draws on top.
  const drawAt = t0 + ctx.dur.enter + ctx.dur.stagger * (scale.ticks.length + 1);
  const order = p.series.map((_, i) => i).filter((i) => i !== keyIdx).concat([keyIdx]);
  const roleOf = (i: number): ColorRole => (i === keyIdx ? "series1" : SERIES[Math.min(4, 1 + order.indexOf(i))]!);
  const grow = ctx.instant ? 1 / 30 : ctx.dur.move * 2.2; // a line is read as it draws: give it time
  const doneAt = (si: number) => drawAt + order.indexOf(si) * ctx.dur.stagger * 2 + grow;
  const pts = p.series.map((s) => s.values.map((v, i) => [X(i), Y(v)] as const));
  const points = pts.flatMap((ps) => samplePolyline(ps));
  order.forEach((si, k) => {
    const isKey = si === keyIdx;
    const role = roleOf(si);
    const at = drawAt + k * ctx.dur.stagger * 2;
    const d = linePath(pts[si]!, H.step);
    const draw = ctx.instant ? cut(at, 0, 1) : [{ t: at, v: 0 }, { t: at + grow, v: 1, curve: ctx.noOvershoot("move") }];
    out.push({ id: `${id}-s${si}`, kind: "path", d, stroke: role, width: ctx.stroke * (isKey ? H.line : H.thin), cap: H.dot === "square" ? "square" : "round", join: H.dot === "square" ? "miter" : "round", z: isKey ? 2 : 1,
      dash: role === "series4" || role === "series5" ? [ctx.stroke * 4, ctx.stroke * 3] : undefined, tracks: { draw, ...fade(at) } });
  });
  const [kx, ky] = pts[keyIdx]![pts[keyIdx]!.length - 1]!;
  out.push(endDot(ctx, H.dot, `${id}-end`, kx, ky, Math.max(ctx.stroke * 3.2, ctx.stroke * H.line * 1.1), { ...fade(doneAt(keyIdx)), scale: go(ctx, doneAt(keyIdx), 0.6, 1, ctx.noOvershoot("enter"), 1, "enter") }));
  obstacles.push({ x: kx - ctx.stroke * 4, y: ky - ctx.stroke * 4, w: ctx.stroke * 8, h: ctx.stroke * 8 });

  // Labels: the key series first, then the callout, then the context series. Each finds a free spot
  // near its point; a callout, or a label pushed far out, gets a leader line back to its point.
  const gap = sL * 0.5;
  const bounds = { x: plot.x, y: plot.y - lhL * 0.5, w: (tall ? textR : p.x + p.w) - plot.x, h: plot.h + lhL * 0.5 };
  type Want = { text: string; role: "caption" | "label"; color: ColorRole; at: number; anchor: [number, number]; callout?: boolean; pill?: boolean; dim?: boolean };
  const wants: Want[] = [{ text: p.series[keyIdx]!.label, role: "caption", color: "ink", at: doneAt(keyIdx), anchor: [kx, ky] }];
  if (p.callout) {
    const s = p.series[keyIdx]!;
    const ci = Math.max(0, Math.min(s.values.length - 1, p.callout.index));
    wants.push({ text: p.callout.label, role: "label", color: "ink", at: doneAt(keyIdx) + ctx.dur.enter, anchor: [X(ci), Y(s.values[ci]!)], callout: true });
  }
  for (const si of order) if (si !== keyIdx) {
    const ps = pts[si]!;
    const [ax, ay] = ps[ps.length - 1]!;
    wants.push({ text: p.series[si]!.label, role: "label", color: "inkMuted", at: doneAt(si), anchor: [ax, ay] });
  }
  // The current value on a pill (Graphite): the callout's value, or the key line's last value.
  if (H.endLabel === "pill") {
    const c = wants.find((w) => w.callout);
    if (c) { c.pill = true; c.callout = false; c.anchor = [kx, ky]; }
    else wants[0] = { ...wants[0]!, text: `${p.series[keyIdx]!.label} ${fmt(p.series[keyIdx]!.values[p.series[keyIdx]!.values.length - 1]!, f)}`, pill: true };
  }
  // The gap the chart is about, measured (Spec): a dimension line between the key line's end and the next line's end.
  const other = order.find((si) => si !== keyIdx);
  if (dimW && other !== undefined) {
    const ps = pts[other]!, [, oy] = ps[ps.length - 1]!;
    const xd = px(kx + sL * 0.8), e = sL * 0.25, hw = Math.max(1, Math.round(ctx.stroke * 0.5));
    const dAt = doneAt(keyIdx) + ctx.dur.enter;
    const d = `M${px(kx + sL * 0.2)} ${crisp(ky, hw)}H${px(xd + e)}M${px(kx + sL * 0.2)} ${crisp(oy, hw)}H${px(xd + e)}M${crisp(xd, hw)} ${px(ky)}V${px(oy)}`
      + `M${px(xd - e)} ${px(ky + e)}L${px(xd + e)} ${px(ky - e)}M${px(xd - e)} ${px(oy + e)}L${px(xd + e)} ${px(oy - e)}`;
    out.push({ id: `${id}-dim`, kind: "path", d, stroke: "ink", width: hw, z: 4, tracks: { draw: go(ctx, dAt, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...fade(dAt) } });
    obstacles.push({ x: xd - e, y: Math.min(ky, oy), w: 2 * e, h: Math.abs(oy - ky) });
    const lastOf = (si: number) => p.series[si]!.values[p.series[si]!.values.length - 1]!;
    wants.push({ text: fmt(lastOf(keyIdx) - lastOf(other), { ...f, decimals: 0 }), role: "label", color: "ink", at: dAt + ctx.dur.move, anchor: [xd, (ky + oy) / 2], dim: true });
  }
  // Each label may break onto two lines. The thickest line's half width plus a margin keeps labels off every stroke.
  const variantsOf = (w: Want) => {
    const one = [w.text];
    const two = twoLines(w.text);
    return two ? [one, [...two]] : [one];
  };
  // A pill takes padding round its text.
  const padX = sL * 0.4, padY = sL * 0.12;
  const placed = placeLabels(
    wants.map((w) => ({
      variants: variantsOf(w).map((ls) => ({ w: Math.max(...ls.map((l) => ctx.measure(l, w.role))) + (w.pill ? 2 * padX : 0), h: ctx.lineHeight(w.role) * ls.length + (w.pill ? 2 * padY : 0) })),
      anchor: w.anchor, gap: w.callout ? gap * 2.4 : gap, lead: w.callout || (H.leaders && !w.dim), flush: !w.callout && !(H.leaders && !w.dim),
    })),
    bounds, obstacles, points, ctx.stroke * 1.5 + 4, (b) => textSafe(ctx, b),
  );
  // In a tall box an end can sit below the text-safe foot, out of reach of the rings round it. Then the label goes
  // over its point, right-aligned to it, at the lowest text-safe height that is free, with a leader down to the point.
  if (tall) wants.forEach((w, i) => {
    if (placed[i]) return;
    const taken = [...obstacles, ...placed.flatMap((q) => (q ? [q.box] : []))];
    const variants = variantsOf(w).map((ls) => ({ w: Math.max(...ls.map((l) => ctx.measure(l, w.role))) + (w.pill ? 2 * padX : 0), h: ctx.lineHeight(w.role) * ls.length + (w.pill ? 2 * padY : 0) }));
    placed[i] = placeOver({ variants, anchor: w.dim ? [w.anchor[0] - gap, w.anchor[1]] : w.anchor, gap, top: plot.y - lhL * 0.5, left: plot.x, right: textR,
      lowBandTop: ctx.safe.lowBandTop, lowBandRight: ctx.safe.lowBandRight, bottom: ctx.safe.bottom }, taken, points, ctx.stroke * 1.5 + 4, (b) => textSafe(ctx, b));
  });
  // Last resort in a tall box: a series whose end finds no text-safe spot is named in a key row at the plot's top
  // left, beside a short stroke in its line's own style, so no line goes unnamed. The row must clear every line.
  const keyed = new Set<number>();
  if (tall) {
    let kxr = plot.x, kyr = plot.y + lhL * 1.2;
    const pad = ctx.stroke * 1.5 + 4, sw = sL * 1.4;
    const taken = [...obstacles, ...placed.flatMap((q) => (q ? [q.box] : []))];
    wants.forEach((w, i) => {
      if (placed[i] || w.callout || w.dim || w.pill) return;
      const si = w === wants[0] ? keyIdx : order.filter((x) => x !== keyIdx)[wants.slice(1).filter((v) => !v.callout && !v.dim && !v.pill).indexOf(w)];
      if (si === undefined) return;
      const lw = ctx.measure(w.text, "label"), bw = sw + gap + lw;
      if (kxr + bw > textR) { kxr = plot.x; kyr += lhL * 1.3; }
      // The row moves down a line at a time until it clears every label and line.
      const clear = (y: number) => {
        const b = { x: kxr, y, w: bw, h: lhL }, g = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
        return textSafe(ctx, b) && !taken.some((o) => o.x < g.x + g.w && g.x < o.x + o.w && o.y < g.y + g.h && g.y < o.y + o.h)
          && !points.some(([qx, qy]) => qx > g.x && qx < g.x + g.w && qy > g.y && qy < g.y + g.h);
      };
      let tries = 0;
      while (!clear(kyr) && kyr + lhL < ctx.safe.bottom && tries++ < 24) kyr += lhL * 0.5;
      if (!clear(kyr)) return;
      const b = { x: kxr, y: kyr, w: bw, h: lhL };
      const role = roleOf(si), ky0 = px(centreInk(ctx, w.text, "label", { y: kyr, h: lhL }) + lhL / 2);
      out.push({ id: `${id}-key-${i}`, kind: "path", d: `M${px(kxr)} ${ky0}H${px(kxr + sw)}`, stroke: role, width: ctx.stroke * (si === keyIdx ? H.line : H.thin), cap: "butt",
        dash: role === "series4" || role === "series5" ? [ctx.stroke * 4, ctx.stroke * 3] : undefined, tracks: fade(w.at) });
      out.push({ id: `${id}-keylab-${i}`, kind: "text", x: kxr + sw + gap, y: kyr, text: w.text, role: "label", color: w.color, tracks: fade(w.at) });
      taken.push(b); keyed.add(i);
      kxr += bw + sL * 1.2;
    });
  }
  let need = 0;
  wants.forEach((w, i) => {
    if (keyed.has(i)) return;
    const pl = placed[i];
    const vs = variantsOf(w);
    if (!pl) {
      // No free spot: ask for a gutter wide enough to set the narrowest variant right of the plot.
      // A tall box has no gutter to give: the label is left out, and the block says so.
      if (!tall) need = Math.max(need, Math.min(...vs.map((ls) => Math.max(...ls.map((l) => ctx.measure(l, w.role))))) + gap * 2.5);
      else console.warn(`lineChart ${id}: the label "${w.text}" finds no text-safe spot over its point and is left out`);
      return;
    }
    const b0 = pl.box;
    const at = w.at + (w.callout ? ctx.dur.stagger * 2 : 0);
    if (w.pill) out.push({ id: `${id}-pill-${i}`, kind: "rect", x: b0.x, y: b0.y, w: b0.w, h: b0.h, fill: "accent", radius: Math.min(ctx.radius, b0.h / 2), z: 4, tracks: appear(ctx, at, exit, 0) });
    const b = w.pill ? { x: b0.x + padX, y: b0.y + padY, w: b0.w - 2 * padX, h: b0.h - 2 * padY } : b0;
    // On a pill the text's ink (not its line box) is centred in the pill.
    const inkY = (line: string, k: number) => (w.pill && vs[pl.variant]!.length === 1 ? centreInk(ctx, line, w.role, b0) : b.y + k * ctx.lineHeight(w.role));
    vs[pl.variant]!.forEach((line, k) => out.push({ id: `${id}-lab-${i}-${k}`, kind: "text", x: b.x, y: inkY(line, k), text: line, role: w.role, color: w.pill ? "onAccent" : w.color,
      tracks: appear(ctx, at + k * ctx.dur.stagger, exit, 0) }));
    if (w.callout || pl.far || (H.leaders && !w.dim)) {
      const [ax, ay] = w.anchor;
      const [tx, ty] = pl.lead;
      const r = ctx.stroke * 2.4;
      const dx = tx - ax, dy = ty - ay, len = Math.hypot(dx, dy) || 1;
      const stop = 4; // the leader stops just short of the text
      if (w.callout) out.push({ id: `${id}-co-dot-${i}`, kind: "circle", cx: ax, cy: ay, r, fill: "ground", stroke: "series1", width: ctx.stroke * 1.5, z: 4, tracks: fade(w.at) });
      const start = w.callout ? r + 2 : ctx.stroke * 2 + 2;
      if (len > start + stop + 4) out.push({ id: `${id}-lead-${i}`, kind: "path", z: 4,
        d: `M${px(ax + (dx / len) * start)} ${px(ay + (dy / len) * start)}L${px(tx - (dx / len) * stop)} ${px(ty - (dy / len) * stop)}`,
        stroke: w.callout ? "ink" : "inkMuted", width: ctx.stroke * (w.callout ? 1 : 0.75), tracks: { draw: go(ctx, w.at, 0, 1, ctx.noOvershoot("enter"), 1, "enter"), ...fade(w.at) } });
    }
  });
  return { out, need };
}

/**
 * Lays the chart out at full width first. When a label finds no free spot, it lays out again with a
 * gutter right of the plot just wide enough for that label, so end labels sit beside their lines.
 */
export const lineChart: Block<LineChartProps> = (p, ctx) => {
  const id = p.id ?? "line";
  const refuse = hand(ctx).refuse;
  if (refuse) console.warn(`lineChart ${id}: ${refuse}. It draws a blunt stepped line meanwhile.`);
  const tag = (ns: Node[]) => tagParts(ns, id, [["s", "lines"], ["key", "key"], ["grid-", "scale"], ["ylab-", "scale"], ["xlab-", "axis"], ["xtk-", "axis"], ["xrule", "axis"], ["guide", "guides"], ["dim", "measure"]]);
  const first = compose(p, ctx, 0);
  if (!first.need) return tag(first.out);
  const second = compose(p, ctx, first.need);
  if (second.need) console.warn(`lineChart ${id}: some labels found no free spot and were left out`);
  return tag(second.out);
};

/** The mark on a line's last point, in the hand's shape: a dot, an open ring (a measured point) or a square (a cell). */
export function endDot(ctx: Ctx, kind: "solid" | "ring" | "square", nid: string, cx: number, cy: number, r: number, tracks: Node["tracks"]): Node {
  if (kind === "ring") return { id: nid, kind: "circle", cx, cy, r, fill: "ground", stroke: "series1", width: Math.max(1, ctx.stroke * 1.5), z: 3, origin: [0.5, 0.5], tracks };
  if (kind === "square") return { id: nid, kind: "path", d: `M${px(cx - r)} ${px(cy - r)}H${px(cx + r)}V${px(cy + r)}H${px(cx - r)}Z`, fill: "series1", z: 3, box: { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r }, origin: [0.5, 0.5], tracks };
  return { id: nid, kind: "circle", cx, cy, r, fill: "series1", z: 3, origin: [0.5, 0.5], tracks };
}
