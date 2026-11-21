// Area chart: a cumulative quantity over time, drawn as a flat filled area under its top line.
// An optional second area gives context for comparison.
//
// Chart rules this block enforces:
// - A title is required. It names the measure and the unit.
// - The y axis always starts at zero. An area shows a total, so a cut axis would lie about it.
// - The fill is flat: one colour at one opacity. Never a gradient.
// - The key area has a thick top line, an end dot and an end label with its final value.
//   The context area is quieter: an opaque series5 fill behind the key area and a thin muted line.
//   The context line draws above the key fill, so the reader can always see it.
// - No legend: each area carries its own end label, with its value and its name.
// - End labels place themselves. They touch no line, no gridline, no fill, no other label and
//   no edge.
//   When no free spot exists, the block keeps a gutter right of the plot and lays out again.
// - At 9:16 every text box passes textSafe, including the x labels in the low band.
// - The area reveals from left to right. The fill is cut into thin vertical strips, one strip for
//   each frame of the reveal. Each strip steps on in one frame, so the fill front moves like a wipe.
//   The top line draws with the fill front on a linear draw track, so line and fill always agree.
// - The front moves on ctx.noOvershoot("move"), so the reveal never passes the data and comes back.
// - In a one-frame system (ctx.instant), the whole area appears in one frame.
// - The system draws the chart in its own hand (blocks/hand.ts): line weights, the value scale (rules, ticks at the
//   axis, or labels alone) and the end mark. An end label may sit on the area it names (it labels that area), never
//   on a line: so the plot keeps its full width and gives up no gutter while a spot over the end or inside the area
//   is free. End labels try first to sit over the end of their line, right-aligned to it.
import { centreInk, colorOf } from "../layout";
import { contrast, hexToRgb } from "../../color";
import { crisp, go, lines, present, px, textSafe, cut, switchAt, fadeOn } from "../context";
import { ease } from "../time";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node, Tracks } from "../types";
import { hand, tagParts } from "./hand";
import { endDot, tallBox } from "./lineChart";
import { fmt, niceScale, placeLabels, placeOver, samplePolyline, twoLines, type Box, type Format } from "./util";

export type AreaChartProps = {
  id?: string;
  /** The chart's box in px. The title, the axes, the labels and the plot all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit. */
  title: string;
  /** X-axis labels, one for each data point. */
  xLabels: string[];
  /** Print every nth x label. The last label always prints. Default: as many as fit. */
  xEvery?: number;
  /** One area, or two areas for a comparison. Values must not be negative. */
  series: { label: string; values: number[] }[];
  /** Which series matters (default 0). It gets series1, the thick line and the end dot. */
  key?: number;
  ticks?: number;
  /** The format of the y labels. */
  format?: Format;
  /** The format of the end values. Default: `format`. */
  endFormat?: Format;
  /** Reference values: a hairline across the plot in the rule colour, labelled with its value. Off by default. */
  guides?: number[];
  at: number;
  until?: number;
};

const FPS = 30;

/** Breaks text into lines no wider than `w`, at spaces. A single word wider than `w` keeps its own line. */
function wrap(ctx: Ctx, text: string, role: "label" | "caption", w: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measure(next, role) > w) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** The fill opacity that gives a flat tint of `fill` about `target`:1 contrast against the ground. */
function tintOpacity(ctx: Ctx, fill: ColorRole, target: number): number {
  const g = colorOf(ctx.system, "ground"), f = colorOf(ctx.system, fill);
  const [G, F] = [hexToRgb(g), hexToRgb(f)];
  const hexOf = (t: number) => "#" + G.map((c, i) => Math.round((c + (F[i]! - c) * t) * 255).toString(16).padStart(2, "0")).join("");
  for (let t = 0.1; t <= 0.6; t += 0.01) if (contrast(hexOf(t), g) >= target) return Math.round(t * 100) / 100;
  return 0.6;
}

/** The y of a polyline at x, by linear interpolation. The x values must rise. */
function yAt(pts: readonly (readonly [number, number])[], x: number): number {
  if (x <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1]![1];
}

/** The length of a polyline from its start to x, as a fraction of its whole length. */
function lengthTo(pts: readonly (readonly [number, number])[], x: number): number {
  let total = 0, upto = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    const seg = Math.hypot(x1 - x0, y1 - y0);
    if (x >= x1) upto += seg;
    else if (x > x0) {
      const f = (x - x0) / (x1 - x0);
      upto += seg * f;
    }
    total += seg;
  }
  return total ? Math.min(1, upto / total) : 1;
}

/** Lays out the chart with `gutter` px kept free right of the plot for end labels. */
function compose(p: AreaChartProps, ctx: Ctx, gutter: number, lastPass: boolean): { out: Node[]; need: number } {
  const id = p.id ?? "area";
  const keyIdx = Math.max(0, Math.min(p.series.length - 1, p.key ?? 0));
  const f = p.format ?? {};
  const ef = p.endFormat ?? f;
  const out: Node[] = [];
  const all = p.series.flatMap((s) => s.values);
  if (all.some((v) => v < 0)) console.warn(`areaChart ${id}: negative values are drawn at zero`);
  const scale = niceScale(0, Math.max(0, ...all), p.ticks ?? 4);
  const lhL = ctx.lineHeight("label"), sL = ctx.size("label");
  const H = hand(ctx);
  const t0 = p.at;
  const exit = p.until;
  const fadeKeys = (at: number, to = 1): Key[] => fadeOn(ctx, at, exit, to);
  const fade = (at: number): Tracks => ({ opacity: fadeKeys(at) });
  const obstacles: Box[] = [];

  // Layout, top to bottom: title, plot, x labels. The y labels sit left of the plot.
  // The title: one line, else two balanced lines, else as many lines as it needs.
  // A tall box (lineChart's tallBox): the areas climb the frame to the foot; the text keeps the text-safe columns;
  // the x scale is a ruler at the top (a measuring hand) or none, and a scale label below the text-safe foot is left out.
  const tall = tallBox(ctx, p);
  const TX = tall ? Math.max(p.x, ctx.safe.left) : p.x, textR = tall ? Math.min(p.x + p.w, ctx.safe.right) : p.x + p.w, TW = textR - TX;
  const two = twoLines(p.title);
  const titleLines = ctx.measure(p.title, "label") <= TW ? [p.title]
    : two && two.every((l) => ctx.measure(l, "label") <= TW) ? [...two] : wrap(ctx, p.title, "label", TW);
  const titleH = lhL * (titleLines.length + 1.1);
  const yLabels = !tall || H.grid !== "none";
  const yLabelW = yLabels ? Math.max(...scale.ticks.map((v) => ctx.measure(fmt(v, f), "label"))) + sL * 0.6 : 0;
  const xAxis: "bottom" | "top" | "none" = !tall ? "bottom" : H.axis === "ruler" ? "top" : "none";
  const xLabelH = xAxis === "bottom" ? lhL + sL * 0.5 : 0, rulerH = xAxis === "top" ? lhL + sL * 0.9 : 0;
  const n = p.xLabels.length;
  const plot = { x: TX + yLabelW, y: p.y + titleH + rulerH, w: textR - TX - yLabelW - sL * 0.4 - gutter, h: p.h - titleH - xLabelH - rulerH - (tall ? ctx.stroke * 4 : 0) };
  // At 9:16 the x labels can fall in the low band, where text must end further left.
  // Then the plot ends early enough that the last x label, centred on its point, stays safe.
  const xLabY = xAxis === "top" ? plot.y - rulerH : plot.y + plot.h + sL * 0.5;
  const lastW = ctx.measure(p.xLabels[n - 1] ?? "", "label");
  if (xAxis === "bottom" && !textSafe(ctx, { x: plot.x + plot.w - lastW / 2, y: xLabY, w: lastW, h: lhL })) {
    const limit = (xLabY + lhL > ctx.safe.lowBandTop ? ctx.safe.lowBandRight : ctx.safe.right) - lastW / 2;
    plot.w = Math.min(plot.w, limit - plot.x);
  }
  const X = (i: number) => plot.x + (n === 1 ? plot.w / 2 : (i / (n - 1)) * plot.w);
  const Y = (v: number) => plot.y + plot.h - ((Math.max(0, v) - scale.min) / (scale.max - scale.min)) * plot.h;
  const base = Y(0);

  // Title: one line, or two when one line does not fit the box.
  out.push(...lines(ctx, { id: `${id}-title`, x: TX, y: p.y, lines: titleLines, role: "label", color: "inkMuted", at: t0, until: exit }));
  obstacles.push({ x: TX, y: p.y, w: Math.max(...titleLines.map((l) => ctx.measure(l, "label"))), h: lhL * titleLines.length });

  // Gridlines and y labels, from the baseline up. The baseline is ink: it is the zero of the area.
  scale.ticks.forEach((v, i) => {
    const gy = px(Y(v));
    const at = t0 + ctx.dur.stagger * (i + 1);
    const isBase = v === 0;
    // The baseline is a full line in ink. Above it, the hand decides: a hairline rule, a short tick at the axis, or nothing.
    const tickW = sL * 0.45;
    const d = isBase || H.grid === "rules" ? `M${plot.x} ${gy}H${plot.x + plot.w}` : H.grid === "ticks" ? `M${plot.x} ${gy}H${px(plot.x + tickW)}` : "";
    if (d) out.push({ id: `${id}-grid-${i}`, kind: "path", d, stroke: isBase ? "ink" : H.grid === "ticks" ? "inkMuted" : "rule", z: isBase ? 5 : 0,
      width: ctx.stroke * (isBase ? 1 : 0.5), tracks: { draw: go(ctx, at, 0, 1, "move"), ...fade(at) } });
    // A gridline or a tick is an obstacle for end labels: no text may sit on a line.
    if (!isBase && d) obstacles.push({ x: plot.x, y: gy - 1, w: H.grid === "ticks" ? tickW : plot.w, h: 2 });
    if (!yLabels) return;
    const label = fmt(v, f);
    const lw = ctx.measure(label, "label");
    // The label's ink (figures) is centred on its gridline, not its line box.
    const box = { x: Math.ceil(plot.x - sL * 0.6 - lw), y: centreInk(ctx, label, "label", { y: gy, h: 0 }), w: lw, h: lhL };
    if (tall && !textSafe(ctx, box, "label")) return;
    obstacles.push(box);
    out.push({ id: `${id}-ylab-${i}`, kind: "text", x: box.x, y: box.y, text: label, role: "label", color: "inkMuted", tracks: fade(at + ctx.dur.stagger) });
  });

  // X labels: every nth, as many as fit, and always the last.
  const widest = Math.max(...p.xLabels.map((l) => ctx.measure(l, "label")));
  const every = p.xEvery ?? Math.max(1, Math.ceil((widest * 1.6) / (n > 1 ? plot.w / (n - 1) : plot.w)));
  // A label prints only when it keeps one label size of space from the last label and its neighbours.
  const xBox = (i: number) => { const lw = ctx.measure(p.xLabels[i]!, "label"); return { i, x: Math.min(X(i) - lw / 2, (tall ? textR : Infinity) - lw), w: lw }; };
  const lastBox = xBox(n - 1);
  const kept: ReturnType<typeof xBox>[] = [];
  p.xLabels.forEach((l, i) => {
    if (!l || i === n - 1 || i % every !== 0) return;
    const b = xBox(i), prev = kept[kept.length - 1];
    if (prev && b.x < prev.x + prev.w + sL) return;
    if (b.x + b.w + sL > lastBox.x) return;
    kept.push(b);
  });
  if (p.xLabels[n - 1]) kept.push(lastBox);
  if (xAxis !== "none") for (const b of kept) {
    out.push({ id: `${id}-xlab-${b.i}`, kind: "text", x: b.x, y: xLabY, text: p.xLabels[b.i]!, role: "label", color: "inkMuted", tracks: fade(t0 + ctx.dur.stagger * 2) });
    if (xAxis === "top") {
      obstacles.push({ x: b.x, y: xLabY, w: b.w, h: lhL });
      out.push({ id: `${id}-xtk-${b.i}`, kind: "path", d: `M${crisp(X(b.i), 1)} ${px(plot.y - sL * 0.35)}V${px(plot.y)}`, stroke: "inkMuted", width: 1, tracks: fade(t0 + ctx.dur.stagger * 2) });
    }
  }
  if (xAxis === "top") out.push({ id: `${id}-xrule`, kind: "path", d: `M${px(plot.x)} ${crisp(plot.y - sL * 0.35, 1)}H${px(plot.x + plot.w)}`, stroke: "rule", width: 1, tracks: fade(t0 + ctx.dur.stagger) });
  // Guides: reference values in the rule colour, labelled at the plot's right end when text-safe.
  (p.guides ?? []).forEach((v, i) => {
    const gy = px(Y(v)), at = t0 + ctx.dur.stagger * (scale.ticks.length + 1);
    out.push({ id: `${id}-guide-${i}`, kind: "path", d: `M${plot.x} ${gy}H${plot.x + plot.w}`, stroke: "rule", width: Math.max(1, ctx.stroke * 0.5), dash: [ctx.stroke * 3, ctx.stroke * 2], z: 5,
      tracks: { draw: go(ctx, at, 0, 1, "move"), ...fade(at) } });
    obstacles.push({ x: plot.x, y: gy - 1, w: plot.w, h: 2 });
    const label = fmt(v, f), lw = ctx.measure(label, "label"), box = { x: plot.x + plot.w - lw, y: gy - lhL - sL * 0.15, w: lw, h: lhL };
    if (!textSafe(ctx, box, "label")) return;
    obstacles.push(box);
    out.push({ id: `${id}-guidelab-${i}`, kind: "text", x: box.x, y: box.y, text: label, role: "label", color: "inkMuted", tracks: fade(at) });
  });

  // The reveal: the front moves from the plot's left edge to its right edge, one step for each frame.
  // Frame times are whole frames; each strip steps on half a frame before its frame, so both
  // renderers show it on the same frame.
  const T0 = Math.round((t0 + ctx.dur.enter + ctx.dur.stagger * (scale.ticks.length + 1)) * FPS) / FPS;
  const curve = ctx.noOvershoot("move");
  const frames = ctx.instant ? 1 : Math.max(2, Math.round(ctx.dur.move * 2.2 * FPS));
  const edges = Array.from({ length: frames + 1 }, (_, j) => Math.round(plot.x + ease(ctx.system, curve, j / frames) * plot.w));
  const T1 = T0 + frames / FPS;

  // Areas: the context area first (behind), then the key area. Lines go above both fills.
  const order = p.series.map((_, i) => i).filter((i) => i !== keyIdx).concat([keyIdx]);
  const pts = p.series.map((s) => s.values.map((v, i) => [X(i), Y(v)] as const));
  const keyTint = tintOpacity(ctx, "series1", 1.6);
  for (const si of order) {
    const isKey = si === keyIdx;
    const ps = pts[si]!;
    // Overprint (Riso): each area is its own ink, solid and multiplied, so the inks overprint where the areas cross.
    const over = H.fill === "overprint";
    const fill: ColorRole = isKey ? "series1" : over ? "series2" : "series5";
    const opacity = over ? 0.85 : isKey ? keyTint : 1;
    for (let j = 1; j <= frames; j++) {
      const xa = edges[j - 1]!, xb = edges[j]!;
      if (xb <= xa) continue;
      const inner = ps.filter(([x]) => x > xa && x < xb).map(([x, y]) => `L${px(x)} ${px(y)}`).join("");
      const ya = yAt(ps, xa), yb = yAt(ps, xb);
      const d = `M${xa} ${px(base)}L${xa} ${px(ya)}${inner}L${xb} ${px(yb)}L${xb} ${px(base)}Z`;
      // The strip shows from the j-th frame after T0 (T0 is on the grid: its own frame shows the start).
      const on = Math.round(T0 * FPS) + j;
      const shownOn = (v: number): Key[] => (on <= 0 ? [{ t: 0, v }] : [{ t: 0, v: 0 }, ...switchAt(on, 0, v, (on - 1) / FPS)]);
      const keys: Key[] = shownOn(opacity);
      if (exit !== undefined) keys.push(...go(ctx, exit, opacity, 0, "exit"));
      out.push({ id: `${id}-a${si}-${j}`, kind: "path", d, fill, z: isKey ? 2 : 1, blend: over ? "multiply" : undefined, tracks: { opacity: keys } });
      // With a context area, the key area is opaque: a ground strip under its tint hides the context
      // fill below the key line. The context fill then shows only where the context is above the key.
      if (isKey && p.series.length > 1 && !over) {
        const solid: Key[] = shownOn(1);
        if (exit !== undefined) solid.push(...go(ctx, exit, 1, 0, "exit"));
        out.push({ id: `${id}-k${si}-${j}`, kind: "path", d, fill: "ground", z: 1.5, tracks: { opacity: solid } });
      }
    }
    // The top line draws with the front: at frame j its drawn length ends exactly at the strip edge.
    const d = ps.map(([x, y], i) => `${i ? "L" : "M"}${px(x)} ${px(y)}`).join("");
    const draw: Key[] = ctx.instant
      ? cut(T0, 0, 1)
      : [{ t: T0, v: 0 }, ...edges.slice(1).map((x, j) => ({ t: T0 + (j + 1) / FPS, v: j + 1 === frames ? 1 : lengthTo(ps, x), curve: "linear" as const }))];
    const lineOn = present(T0, undefined).opacity!;
    if (exit !== undefined) lineOn.push(...go(ctx, exit, 1, 0, "exit"));
    out.push({ id: `${id}-line-${si}`, kind: "path", d, stroke: isKey ? "series1" : "inkMuted", width: ctx.stroke * (isKey ? H.line : H.thin),
      cap: H.dot === "square" ? "square" : "round", join: H.dot === "square" ? "miter" : "round", z: isKey ? 4 : 3, tracks: { draw, opacity: lineOn } });
  }
  const [kx, ky] = pts[keyIdx]![pts[keyIdx]!.length - 1]!;
  out.push({ ...endDot(ctx, H.dot, `${id}-end`, kx, ky, Math.max(ctx.stroke * 3.2, ctx.stroke * H.line * 1.1), { ...fade(T1), scale: go(ctx, T1, 0.6, 1, ctx.noOvershoot("enter"), 1, "enter") }), z: 6 });
  obstacles.push({ x: kx - ctx.stroke * 4, y: ky - ctx.stroke * 4, w: ctx.stroke * 8, h: ctx.stroke * 8 });

  // End labels: the final value over the series name. The key value is set larger and in ink. A label pushed far out gets a leader line.
  // A long name may wrap: each label offers its name on one line, then wrapped to narrower widths.
  type Line = { text: string; role: "caption" | "label"; color: ColorRole };
  type Want = { variants: Line[][]; at: number; anchor: [number, number]; /** the series' points: a context label may sit inside its own area, under its line */ under?: readonly (readonly [number, number])[] };
  const last = (si: number) => p.series[si]!.values[p.series[si]!.values.length - 1]!;
  const cap = Math.round(p.w * 0.36); // the widest gutter the plot gives up
  const variantsFor = (value: Line, name: string): Line[][] => {
    if (!name) return [[value]];
    const vw = ctx.measure(value.text, value.role);
    const widths = [Infinity, cap, Math.max(vw, cap * 0.7)];
    const seen = new Set<string>();
    // The last resort is the value alone: the end value must show even when no name fits.
    // A value never shows without its name: a label is never orphaned from the area it names.
    return [...widths.map((w) => [value, ...wrap(ctx, name, "label", w).map((t) => ({ text: t, role: "label" as const, color: "inkMuted" as const }))])]
      .filter((ls) => { const k = ls.map((l) => l.text).join("|"); if (seen.has(k)) return false; seen.add(k); return true; });
  };
  const wants: Want[] = [{ at: T1, anchor: [kx, ky], variants: variantsFor({ text: fmt(last(keyIdx), ef), role: "caption", color: "ink" }, p.series[keyIdx]!.label) }];
  for (const si of order) if (si !== keyIdx) {
    const ps = pts[si]!;
    wants.push({ at: T1 + ctx.dur.stagger * 2, anchor: [ps[ps.length - 1]![0], ps[ps.length - 1]![1]], under: ps,
      variants: variantsFor({ text: fmt(last(si), ef), role: "label", color: "inkMuted" }, p.series[si]!.label) });
  }
  // Place from the highest end point down, so labels stack in the gutter in the order of their lines.
  wants.sort((a, b) => a.anchor[1] - b.anchor[1]);
  const sizeOf = (ls: Line[]) => ({ w: Math.max(...ls.map((l) => ctx.measure(l.text, l.role))), h: ls.reduce((s, l) => s + ctx.lineHeight(l.role), 0) });
  const gap = sL * 0.5;
  const bounds = { x: plot.x, y: plot.y - lhL * 0.5, w: (tall ? textR : p.x + p.w) - plot.x, h: plot.h + lhL * 0.5 };
  const points = pts.flatMap((ps) => samplePolyline(ps));
  // A context label first tries the inside of its own area: right-aligned to the end of its line, under the line
  // (clear of it by a pad) and over the baseline. It names the area it sits on.
  const pad = ctx.stroke * 1.5 + 4;
  const inside = wants.map((w) => {
    if (!w.under) return null;
    const [ax] = w.anchor;
    // The value and the name on one line fit the low, narrow inside of a rising area best; then the stacked variants.
    const one: Line[] = [{ text: w.variants[0]!.map((l) => l.text).join("  "), role: "label", color: "inkMuted" }];
    const tries = [one, ...w.variants];
    for (let vi = 0; vi < tries.length; vi++) {
      const { w: bw, h: bh } = sizeOf(tries[vi]!);
      const x = ax - gap - bw;
      const lineLow = Math.max(...samplePolyline(w.under.filter(([px]) => px >= x - pad * 4)).filter(([px]) => px >= x - pad && px <= ax).map(([, py]) => py));
      const y = lineLow + pad + gap * 0.5;
      const b = { x, y, w: bw, h: bh };
      if (x < plot.x || y + bh > base - pad || !textSafe(ctx, b)) continue;
      if (points.some(([qx, qy]) => qx > b.x - pad && qx < b.x + b.w + pad && qy > b.y - pad && qy < b.y + b.h + pad)) continue;
      if (vi === 0) w.variants.unshift(one);
      return { box: b, variant: vi === 0 ? 0 : vi - 1, far: false, lead: [ax, b.y] as [number, number] };
    }
    return null;
  });
  // In a tall box a context label is named only inside its own area or in the key row: a spot over its point would
  // sit on the key area, which it does not name.
  const free = wants.map((w, i) => ({ w, i })).filter(({ w, i }) => !inside[i] && !(tall && w.under));
  const placedFree = placeLabels(free.map(({ w }) => ({ variants: w.variants.map(sizeOf), anchor: w.anchor, gap, flush: true })),
    bounds, [...obstacles, ...inside.flatMap((b) => (b ? [b.box] : []))], points, pad, (b) => textSafe(ctx, b));
  const placed = wants.map((_, i) => inside[i] ?? placedFree[free.findIndex((f) => f.i === i)] ?? null);
  // The last layout (or a tall box, which has no gutter to give): an area whose end label finds no spot is named in a
  // key row at the plot's top left: a square of its fill, its value and its name, clear of every line.
  // A tall box: a label whose end sits low goes over its point, right-aligned, at the lowest free text-safe height.
  if (tall) wants.forEach((w, i) => {
    if (placed[i] || w.under) return;
    placed[i] = placeOver({ variants: w.variants.map(sizeOf), anchor: w.anchor, gap, top: plot.y - lhL * 0.5, left: plot.x, right: textR,
      lowBandTop: ctx.safe.lowBandTop, lowBandRight: ctx.safe.lowBandRight, bottom: ctx.safe.bottom }, [...obstacles, ...placed.flatMap((q) => (q ? [q.box] : []))], points, pad, (b) => textSafe(ctx, b));
  });
  const keyed = new Set<number>();
  if (tall || lastPass) {
    let kxr = plot.x + sL * 0.4, kyr = plot.y + lhL * 1.2;
    const sq = Math.round(sL * 0.7);
    const taken = [...obstacles, ...placed.flatMap((q) => (q ? [q.box] : []))];
    wants.forEach((w, i) => {
      if (placed[i]) return;
      const text = w.variants[0]!.map((l) => l.text).join("  "), lw = ctx.measure(text, "label"), bw = sq + gap + lw;
      if (kxr + bw > textR) { kxr = plot.x + sL * 0.4; kyr += lhL * 1.3; }
      const b = { x: kxr, y: kyr, w: bw, h: lhL }, g = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
      if (!textSafe(ctx, b) || taken.some((o) => o.x < g.x + g.w && g.x < o.x + o.w && o.y < g.y + g.h && g.y < o.y + o.h)
        || points.some(([qx, qy]) => qx > g.x && qx < g.x + g.w && qy > g.y && qy < g.y + g.h)) return;
      const isKey = i === wants.findIndex((q) => !q.under);
      const sy = Math.round(centreInk(ctx, text, "label", { y: kyr, h: lhL }) + lhL / 2 - sq / 2);
      out.push({ id: `${id}-key-${i}`, kind: "rect", x: kxr, y: sy, w: sq, h: sq, fill: isKey ? "series1" : H.fill === "overprint" ? "series2" : "series5", stroke: isKey ? undefined : "inkMuted", strokeWidth: 1, tracks: fade(w.at) });
      out.push({ id: `${id}-keylab-${i}`, kind: "text", x: kxr + sq + gap, y: kyr, text, role: "label", color: isKey ? "ink" : "inkMuted", tracks: fade(w.at) });
      taken.push(b); keyed.add(i);
      kxr += bw + sL * 1.2;
    });
  }
  let need = 0;
  wants.forEach((w, i) => {
    if (keyed.has(i)) return;
    const pl = placed[i];
    // No free spot: ask for a gutter wide enough for the narrowest variant, but never more than `cap`; in a tall box
    // or on the last layout the label is left out, and the block says so.
    if (!pl) {
      if (!tall && !lastPass) need = Math.max(need, Math.min(cap, Math.min(...w.variants.map((v) => sizeOf(v).w)) + gap * 2.5));
      else console.warn(`areaChart ${id}: the label "${w.variants[0]!.map((l) => l.text).join(" ")}" finds no spot and is left out`);
      return;
    }
    let y = pl.box.y;
    // On overprinted ink (Riso) a label inside its area is knocked out to the paper, as print sets type in ink.
    const knock = H.fill === "overprint" && !!inside[i];
    w.variants[pl.variant]!.forEach((l, k) => {
      out.push({ id: `${id}-lab-${i}-${k}`, kind: "text", x: pl.box.x, y, text: l.text, role: l.role, color: knock ? "ground" : l.color, tracks: fade(w.at + k * ctx.dur.stagger) });
      y += ctx.lineHeight(l.role);
    });
    if (pl.far) {
      const [ax, ay] = w.anchor, [tx, ty] = pl.lead;
      const dx = tx - ax, dy = ty - ay, len = Math.hypot(dx, dy) || 1, start = ctx.stroke * 3.2 + 2, stop = 4;
      if (len > start + stop + 4) out.push({ id: `${id}-lead-${i}`, kind: "path", z: 6,
        d: `M${px(ax + (dx / len) * start)} ${px(ay + (dy / len) * start)}L${px(tx - (dx / len) * stop)} ${px(ty - (dy / len) * stop)}`,
        stroke: "inkMuted", width: ctx.stroke * 0.75, tracks: { draw: go(ctx, w.at, 0, 1, "enter"), ...fade(w.at) } });
    }
  });
  return { out, need };
}

/**
 * Lays the chart out at full width first. When an end label finds no free spot, it lays out again
 * with a gutter right of the plot just wide enough for that label.
 */
export const areaChart: Block<AreaChartProps> = (p, ctx) => {
  const id = p.id ?? "area";
  const refuse = hand(ctx).refuse;
  if (refuse) console.warn(`areaChart ${id}: ${refuse}.`);
  const tag = (ns: Node[]) => tagParts(ns, id, [["a", "fill"], ["keylab", "key"], ["key", "key"], ["k", "fill"], ["line-", "lines"], ["grid-", "scale"], ["ylab-", "scale"], ["xlab-", "axis"], ["xtk", "axis"], ["xrule", "axis"], ["guide", "guides"]]);
  const first = compose(p, ctx, 0, false);
  if (!first.need) return tag(first.out);
  const second = compose(p, ctx, first.need, true);
  if (second.need) console.warn(`areaChart ${id}: some end labels found no free spot and were left out`);
  return tag(second.out);
};
