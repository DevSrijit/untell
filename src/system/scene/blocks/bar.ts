// Bar: one solid bar that grows from its base to its value, with the value printed by it.
//
// Rules this block enforces:
// - The box is the bar at full scale: a bar for `max` fills it. The bar starts at zero, at the
//   left edge (axis "x") or the bottom edge (axis "y").
// - The bar grows on a curve that never overshoots (ctx.noOvershoot), so it never passes its value.
// - A bar too small to see keeps a minimum visible length, and its value is still printed.
// - The value label goes inside the bar, at its base, when it fits with a pad on each side and its
//   colour has 4.5:1 contrast with the fill (onAccent first, then ink, then ground). Otherwise it
//   goes past the bar's end. A label that fits neither way steps down a type size; only then is
//   it left out (with a warning). The label never overlaps the bar edge and never leaves the box
//   or the text-safe area.
// - A label inside the bar appears when the bar stops, and only fades in (no rise), so nothing
//   moves under it or within it. A label past the
//   end appears as the bar settles, so it never sits beyond a bar that is still far from its end.
// - At `until`, the bar and its label fade out. After that they stay hidden.
import { appear, go } from "../context";
import { centreInk, colorOf } from "../layout";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Node } from "../types";
import type { TypeRole } from "../../systems";
import { fmt, type Format } from "./util";
import { shown } from "./rule";
import { lineSafe } from "./text";
import { barEnd, hand } from "./hand";

export type BarProps = {
  id?: string;
  /** The bar at full scale, px. Axis "x": the bar is h thick and grows right. Axis "y": w thick, grows up. */
  x: number; y: number; w: number; h: number;
  axis?: "x" | "y";
  value: number;
  /** The value that fills the box. Bars that share a scale share a max. Default: the value. */
  max?: number;
  /** Default: "series1", the series that matters. */
  fill?: ColorRole;
  /** The printed value. Default: the value with `format`. `false` prints nothing. */
  label?: string | false;
  format?: Format;
  /** The label's type role. Default: the largest of headline, body and label that fits the bar's thickness. */
  labelRole?: TypeRole;
  at: number;
  until?: number;
};

/** The relative luminance of a colour, for contrast checks (WCAG 2). */
function luminance(hex: string): number {
  const ch = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, b] = rgb(hex);
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}
function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function contrast(ctx: Ctx, a: ColorRole, b: ColorRole): number {
  const [la, lb] = [luminance(colorOf(ctx.system, a)), luminance(colorOf(ctx.system, b))];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** The whole bar (the mark, its value or label and its leader) enters as one gesture: one group, `<id>` (hand.ts). */
export const bar: Block<BarProps> = (p, ctx) => drawBar(p, ctx).map((n) => (n.kind === "audio" || n.group ? n : { ...n, group: p.id ?? "bar" }));

const drawBar: Block<BarProps> = (p, ctx) => {
  const id = p.id ?? "bar";
  const axis = p.axis ?? "x";
  const fill = p.fill ?? "series1";
  const max = p.max ?? p.value;
  if (p.value < 0 || max <= 0) console.warn(`bar ${id}: a bar shows a positive amount; use a chart with a zero line for negative values`);
  const full = axis === "x" ? p.w : p.h;
  const thick = axis === "x" ? p.h : p.w;
  const minLen = Math.max(3, ctx.stroke * 2);
  const len = Math.min(full, Math.max(minLen, (full * Math.max(0, p.value)) / max));
  const rect = axis === "x" ? { x: p.x, y: p.y, w: len, h: p.h } : { x: p.x, y: p.y + p.h - len, w: p.w, h: len };

  // Growth: the system's move duration, a little longer, on a curve that never overshoots.
  const grow = ctx.instant ? 1 / 30 : ctx.dur.move * 1.4;
  const out: Node[] = [{
    id, kind: "rect", ...rect, fill, radius: Math.min(barEnd(ctx, hand(ctx), thick), len / 2),
    origin: axis === "x" ? [0, 0.5] : [0.5, 1],
    tracks: { [axis === "x" ? "scaleX" : "scaleY"]: go(ctx, p.at, 0, 1, ctx.noOvershoot("move"), 1.4, "move"), opacity: shown(ctx, p.at, p.until) },
  }];

  // The value label.
  if (p.label === false) return out;
  const text = p.label ?? fmt(p.value, p.format);
  const fits = (r: TypeRole) => ctx.lineHeight(r) <= thick * 0.85;
  const auto = (["headline", "body", "label"] as TypeRole[]).find(fits) ?? "label";
  const first = p.labelRole ?? auto;
  const roles = [first, ...(["headline", "body", "caption", "label"] as TypeRole[]).filter((r) => ctx.size(r) < ctx.size(first))];
  const inside = (["onAccent", "ink", "ground"] as ColorRole[]).find((c) => contrast(ctx, c, fill) >= 4.5);
  let placed: { x: number; y: number; role: TypeRole; color: ColorRole; inside: boolean } | null = null;
  for (const role of roles) {
    const lw = ctx.measure(text, role), lh = ctx.lineHeight(role), size = ctx.size(role);
    const pad = Math.round(size * 0.32);
    // The value's ink (figures: no descender) is centred on the bar, not its line box (layout.centreInk).
    const tries: { x: number; y: number; color: ColorRole; inside: boolean }[] = [];
    if (axis === "x") {
      const y = centreInk(ctx, text, role, { y: p.y, h: p.h });
      if (inside && lh <= thick && lw + pad * 2 <= len) tries.push({ x: rect.x + pad, y, color: inside, inside: true });
      if (lh <= thick && rect.x + len + pad + lw <= p.x + p.w) tries.push({ x: rect.x + len + pad, y, color: "ink", inside: false });
    } else {
      const x = p.x + (p.w - lw) / 2;
      if (inside && lw + pad * 2 <= thick && lh + pad * 2 <= len) tries.push({ x, y: rect.y + pad, color: inside, inside: true });
      if (lw <= thick && rect.y - pad - lh >= p.y) tries.push({ x, y: rect.y - pad - lh, color: "ink", inside: false });
    }
    const ok = tries.find((t) => lineSafe(ctx, role, { x: t.x, y: t.y, w: lw, h: lh }));
    if (ok) { placed = { ...ok, role }; break; }
  }
  if (!placed) {
    console.warn(`bar ${id}: the value "${text}" fits neither inside the bar nor past its end, so it is left out`);
    return out;
  }
  // A label inside the bar waits until the bar stops, so nothing moves under it. A label past the
  // end starts half an entrance before the bar stops: the bar is then within 5 % of its end.
  const at = ctx.instant ? p.at + 1 / 30 : p.at + grow - (placed.inside ? 0 : ctx.dur.enter / 2);
  out.push({ id: `${id}-value`, kind: "text", x: placed.x, y: placed.y, text, role: placed.role, color: placed.color, z: 1, tracks: appear(ctx, at, p.until, placed.inside ? 0 : 12) });
  return out;
};
