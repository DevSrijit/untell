// Shared helpers for blocks: number formats and axis scales.

export type Format = { prefix?: string; suffix?: string; decimals?: number; /** 1,200 -> 1.2k */ compact?: boolean };

export function fmt(v: number, f: Format = {}): string {
  let s: string;
  if (f.compact && Math.abs(v) >= 1000) {
    const units: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "k"]];
    const [d, u] = units.find(([d]) => Math.abs(v) >= d)!;
    const n = v / d;
    s = `${n.toFixed(Number.isInteger(n) ? 0 : (f.decimals ?? 1))}${u}`;
  } else {
    s = v.toLocaleString("en-US", { minimumFractionDigits: f.decimals ?? 0, maximumFractionDigits: f.decimals ?? 0 });
  }
  // A true minus sign, not a hyphen.
  if (s.startsWith("-")) s = "−" + s.slice(1);
  return `${f.prefix ?? ""}${s}${f.suffix ?? ""}`;
}

/** A readable axis: round tick steps (1, 2, 2.5, 5 x 10^n) covering [min, max] with about `count` ticks. */
export function niceScale(min: number, max: number, count = 4) {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v / step) * step);
  return { min: lo, max: hi, step, ticks };
}

export type Box = { x: number; y: number; w: number; h: number };
const hits = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Points along a polyline, every `step` px, for collision checks against lines. */
export function samplePolyline(pts: readonly (readonly [number, number])[], step = 6): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k <= n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

export type Placed = { box: Box; variant: number; far: boolean; lead: [number, number] };

/** The point on a box's edge nearest to (x, y). */
export function nearestOnBox(b: Box, x: number, y: number): [number, number] {
  return [Math.max(b.x, Math.min(x, b.x + b.w)), Math.max(b.y, Math.min(y, b.y + b.h))];
}

/** Splits a label into two lines at the space nearest its middle, for a narrower box. */
export function twoLines(text: string): [string, string] | null {
  const spaces = [...text.matchAll(/ /g)].map((m) => m.index!);
  if (!spaces.length) return null;
  const mid = text.length / 2;
  const at = spaces.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  return [text.slice(0, at), text.slice(at + 1)];
}

/**
 * Places labels without collisions, one after another. Each label offers size variants (one line, two
 * lines). For each variant in turn, it searches rings around the anchor point, nearest first, in 16
 * directions (upper right and right first at each distance). A spot is free when the label stays inside
 * `bounds` and passes `ok` (the text-safe check), overlaps no obstacle or placed label, has no line point inside it, and its leader from the
 * anchor crosses no other label and no line (points within 2 x pad of the anchor do not count: that is
 * the anchor's own line). `far` is true when the label needs a visible leader line.
 * A label that finds no spot gets null; the block then makes room and lays out again.
 */
export function placeLabels(wants: { variants: { w: number; h: number }[]; anchor: [number, number]; gap: number; /** always drawn with a leader */ lead?: boolean;
  /** Try first a box whose right edge is on the anchor, above it and then below it: an end label over the end of its line. */ flush?: boolean }[], bounds: Box, obstacles: Box[], points: [number, number][], pad: number, ok: (b: Box) => boolean = () => true): (Placed | null)[] {
  const taken: Box[] = [...obstacles];
  const order = [2, 0, 4, 6, 1, 3, 5, 7, 14, 8, 15, 9, 13, 10, 12, 11];
  const dirs = order.map((k) => [Math.cos((k / 16) * Math.PI * 2), -Math.sin((k / 16) * Math.PI * 2)] as const);
  const inside = (b: Box) => b.x >= bounds.x && b.y >= bounds.y && b.x + b.w <= bounds.x + bounds.w && b.y + b.h <= bounds.y + bounds.h;
  return wants.map(({ variants, anchor: [ax, ay], gap, lead, flush }) => {
    for (let vi = 0; vi < variants.length; vi++) {
      const { w, h } = variants[vi]!;
      if (flush) for (const b of [{ x: ax - w, y: ay - gap - h, w, h }, { x: ax - w, y: ay + gap, w, h }]) {
        if (!inside(b) || !ok(b)) continue;
        const g = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
        if (taken.some((o) => hits(g, o))) continue;
        if (points.some(([x, y]) => x > g.x && x < g.x + g.w && y > g.y && y < g.y + g.h && Math.hypot(x - ax, y - ay) > pad * 2)) continue;
        taken.push(b);
        return { box: b, variant: vi, far: false, lead: nearestOnBox(b, ax, ay) };
      }
      for (const ring of [1, 1.6, 2.4, 3.4, 4.6, 6]) {
        const r = gap * ring;
        for (const [dx, dy] of dirs) {
          const cx = ax + dx * (r + (Math.abs(dx) * w) / 2), cy = ay + dy * (r + (Math.abs(dy) * h) / 2);
          const b = { x: cx - w / 2, y: cy - h / 2, w, h };
          if (!inside(b) || !ok(b)) continue;
          const g = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
          if (taken.some((o) => hits(g, o))) continue;
          if (points.some(([x, y]) => x > g.x && x < g.x + g.w && y > g.y && y < g.y + g.h)) continue;
          const [lx, ly] = nearestOnBox(b, ax, ay);
          const far = ring > 1.6;
          if (far || lead) {
            const len = Math.hypot(lx - ax, ly - ay);
            const steps = Math.max(2, Math.ceil(len / 4));
            let blocked = false;
            for (let k = 1; k < steps && !blocked; k++) {
              const x = ax + ((lx - ax) * k) / steps, y = ay + ((ly - ay) * k) / steps;
              if (Math.hypot(x - ax, y - ay) < pad * 2) continue;
              blocked = taken.some((o) => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h)
                || points.some(([px, py]) => Math.abs(px - x) < pad * 0.6 && Math.abs(py - y) < pad * 0.6);
            }
            if (blocked) continue;
          }
          taken.push(b);
          return { box: b, variant: vi, far, lead: [lx, ly] as [number, number] };
        }
      }
    }
    return null;
  });
}

/**
 * Fits a string to `max` px at word boundaries: the whole string when it fits, else the most leading words that
 * fit with an ellipsis after them. A word is never cut. Null when not even the first word and the ellipsis fit:
 * the caller must make room or throw. `measure` measures in the caller's role, case and weight.
 */
export function fitWords(text: string, max: number, measure: (t: string) => number): { text: string; cut: boolean } | null {
  if (measure(text) <= max + 0.5) return { text, cut: false };
  const words = text.split(/\s+/).filter(Boolean);
  for (let n = words.length - 1; n >= 1; n--) {
    const t = words.slice(0, n).join(" ").replace(/[,;:.\-–]+$/, "") + "…";
    if (measure(t) <= max + 0.5) return { text: t, cut: true };
  }
  return null;
}

/**
 * A label over its point in a tall chart (9:16, a plot that runs into the lower band): right-aligned to the point,
 * at the lowest height that is free and text-safe (`ok`); below `lowBandTop` its right edge moves left to
 * `lowBandRight`. The label takes a leader from its nearest corner to the point, and no line may cross the leader.
 * Returns null when no height is free.
 */
export function placeOver(o: { variants: { w: number; h: number }[]; anchor: [number, number]; gap: number; top: number; left: number; right: number;
  lowBandTop: number; lowBandRight: number; bottom: number }, taken: Box[], points: [number, number][], pad: number, ok: (b: Box) => boolean): Placed | null {
  const [ax, ay] = o.anchor;
  for (let vi = 0; vi < o.variants.length; vi++) {
    const { w: bw, h: bh } = o.variants[vi]!;
    for (let y = Math.min(ay - o.gap - bh, o.bottom - bh); y >= o.top; y -= 4) {
      const R = Math.min(ax, o.right, y + bh > o.lowBandTop ? o.lowBandRight : o.right);
      const x = Math.max(o.left, R - bw);
      const b = { x, y, w: bw, h: bh }, g = { x: x - pad, y: y - pad, w: bw + 2 * pad, h: bh + 2 * pad };
      if (!ok(b) || taken.some((t) => hits(g, t))) continue;
      if (points.some(([qx, qy]) => qx > g.x && qx < g.x + g.w && qy > g.y && qy < g.y + g.h)) continue;
      const lx = Math.min(Math.max(ax, x), x + bw), ly = y + bh;
      const len = Math.hypot(ax - lx, ay - ly), steps = Math.max(2, Math.ceil(len / 4));
      let crossed = false;
      for (let k = 1; k < steps && !crossed; k++) {
        const qx0 = lx + ((ax - lx) * k) / steps, qy0 = ly + ((ay - ly) * k) / steps;
        if (Math.hypot(qx0 - ax, qy0 - ay) < pad * 2) continue;
        crossed = points.some(([qx, qy]) => Math.abs(qx - qx0) < pad * 0.6 && Math.abs(qy - qy0) < pad * 0.6);
      }
      if (!crossed) return { box: b, variant: vi, far: true, lead: [lx, ly] };
    }
  }
  return null;
}
