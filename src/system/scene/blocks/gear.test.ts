// Tangency tests for gear and belt geometry. They read the path that the belt block emits, arcs included, and
// solve each SVG arc for its centre the way a browser does (SVG 1.1, appendix F.6.5). So a wrong sign or a
// wrong arc flag, which picks the mirror circle, fails here, not in a film.
import { describe, expect, test } from "bun:test";
import { makeCtx } from "../context";
import { SYSTEMS } from "../../systems";
import { belt, beltGeometry, outerTangents, type Circle } from "./belt";
import { gear, pitchRadius, ratioTurns, turnKeys, type Pt } from "./gear";

/** The centre of an SVG arc from p to q (F.6.5). */
function arcCentre(p: Pt, q: Pt, r: number, large: number, sweep: number): Pt {
  const x1p = (p[0] - q[0]) / 2, y1p = (p[1] - q[1]) / 2;
  const lam = (x1p * x1p + y1p * y1p) / (r * r);
  const R = lam > 1 ? r * Math.sqrt(lam) : r;
  const num = R * R * R * R - R * R * y1p * y1p - R * R * x1p * x1p;
  const den = R * R * y1p * y1p + R * R * x1p * x1p;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cxp = (k * R * y1p) / R, cyp = (-k * R * x1p) / R;
  return [cxp + (p[0] + q[0]) / 2, cyp + (p[1] + q[1]) / 2];
}

type Seg = { kind: "L"; from: Pt; to: Pt } | { kind: "A"; from: Pt; to: Pt; r: number; large: number; sweep: number };
/** Parses the M, L, A and Z commands the belt emits. */
function parse(d: string): Seg[] {
  const tok = d.match(/[MLAZ]|-?\d*\.?\d+(?:e-?\d+)?/g)!;
  const segs: Seg[] = [];
  let i = 0, cur: Pt = [0, 0], start: Pt = [0, 0];
  const n = () => Number(tok[i++]);
  while (i < tok.length) {
    const c = tok[i++]!;
    if (c === "M") { cur = [n(), n()]; start = cur; }
    else if (c === "L") { const to: Pt = [n(), n()]; segs.push({ kind: "L", from: cur, to }); cur = to; }
    else if (c === "A") { const r = n(); n(); n(); const large = n(), sweep = n(); const to: Pt = [n(), n()]; segs.push({ kind: "A", from: cur, to, r, large, sweep }); cur = to; }
    else if (c === "Z") { if (Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1) segs.push({ kind: "L", from: cur, to: start }); cur = start; }
  }
  return segs;
}

/** Points along the parsed path, every few px, arcs sampled about their solved centres. */
function sample(segs: Seg[]): Pt[] {
  const out: Pt[] = [];
  for (const s of segs) {
    if (s.kind === "L") {
      const len = Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]), k = Math.max(2, Math.ceil(len / 3));
      for (let j = 0; j <= k; j++) out.push([s.from[0] + ((s.to[0] - s.from[0]) * j) / k, s.from[1] + ((s.to[1] - s.from[1]) * j) / k]);
    } else {
      const c = arcCentre(s.from, s.to, s.r, s.large, s.sweep);
      const a0 = Math.atan2(s.from[1] - c[1], s.from[0] - c[0]), a1 = Math.atan2(s.to[1] - c[1], s.to[0] - c[0]);
      const TAU = 2 * Math.PI, norm = (x: number) => ((x % TAU) + TAU) % TAU;
      const span = s.sweep ? norm(a1 - a0) : -norm(a0 - a1);
      const k = Math.max(8, Math.ceil((Math.abs(span) * s.r) / 3));
      for (let j = 0; j <= k; j++) { const a = a0 + (span * j) / k; out.push([c[0] + s.r * Math.cos(a), c[1] + s.r * Math.sin(a)]); }
    }
  }
  return out;
}

const dist = (p: Pt, c: Circle) => Math.hypot(p[0] - c.x, p[1] - c.y);
/** The distance from a point to the infinite line through p and q. */
const lineDist = (c: Circle, p: Pt, q: Pt) => Math.abs((q[0] - p[0]) * (p[1] - c.y) - (p[0] - c.x) * (q[1] - p[1])) / Math.hypot(q[0] - p[0], q[1] - p[1]);

const CASES: [string, Circle, Circle][] = [
  ["small circle left (the Schematic reel's cog and ring)", { x: 190, y: 1050, r: 80 }, { x: 830, y: 1050, r: 320 }],
  ["small circle right", { x: 200, y: 900, r: 300 }, { x: 860, y: 960, r: 75 }],
  ["equal radii", { x: 200, y: 700, r: 120 }, { x: 800, y: 760, r: 120 }],
  ["one above the other", { x: 540, y: 400, r: 60 }, { x: 560, y: 1300, r: 240 }],
  ["small circle right and above", { x: 300, y: 1200, r: 260 }, { x: 820, y: 500, r: 70 }],
];

describe.each(CASES)("belt: %s", (_, a, b) => {
  const g = beltGeometry(a, b);
  const segs = parse(g.d);

  test("each run touches each circle at one point, at right angles to the radius", () => {
    for (const [pa, pb] of [g.left, g.right]) {
      expect(dist(pa, a)).toBeCloseTo(a.r, 6);
      expect(dist(pb, b)).toBeCloseTo(b.r, 6);
      // The centre's distance to the run's line is the radius: the line is a tangent, not a chord.
      expect(lineDist(a, pa, pb)).toBeCloseTo(a.r, 6);
      expect(lineDist(b, pa, pb)).toBeCloseTo(b.r, 6);
      const dir = [pb[0] - pa[0], pb[1] - pa[1]];
      expect((pa[0] - a.x) * dir[0]! + (pa[1] - a.y) * dir[1]!).toBeCloseTo(0, 3);
      expect((pb[0] - b.x) * dir[0]! + (pb[1] - b.y) * dir[1]!).toBeCloseTo(0, 3);
    }
  });

  test("the runs are outer tangents: both circles on the same side of each run", () => {
    for (const [pa, pb] of [g.left, g.right]) {
      const side = (c: Circle) => Math.sign((pb[0] - pa[0]) * (c.y - pa[1]) - (pb[1] - pa[1]) * (c.x - pa[0]));
      expect(side(a)).toBe(side(b));
    }
  });

  test("every arc of the emitted path is centred on its own circle, round the far side", () => {
    const arcs = segs.filter((s): s is Extract<Seg, { kind: "A" }> => s.kind === "A");
    expect(arcs.length).toBe(2);
    const [wb, wa] = arcs as [typeof arcs[0], typeof arcs[0]];
    // The SVG path rounds to half pixels, so allow 1 px.
    const cb = arcCentre(wb.from, wb.to, wb.r, wb.large, wb.sweep), ca = arcCentre(wa.from, wa.to, wa.r, wa.large, wa.sweep);
    expect(Math.hypot(cb[0] - b.x, cb[1] - b.y)).toBeLessThan(1);
    expect(Math.hypot(ca[0] - a.x, ca[1] - a.y)).toBeLessThan(1);
  });

  test("no point of the emitted path lies inside either circle, and the path closes", () => {
    const pts = sample(segs);
    for (const p of pts) {
      expect(dist(p, a)).toBeGreaterThan(a.r - 1.2);
      expect(dist(p, b)).toBeGreaterThan(b.r - 1.2);
    }
    // The wrap round each circle reaches its far point.
    const d = Math.hypot(b.x - a.x, b.y - a.y), u = [(b.x - a.x) / d, (b.y - a.y) / d] as const;
    const farA: Pt = [a.x - a.r * u[0], a.y - a.r * u[1]], farB: Pt = [b.x + b.r * u[0], b.y + b.r * u[1]];
    expect(Math.min(...pts.map((p) => Math.hypot(p[0] - farA[0], p[1] - farA[1])))).toBeLessThan(2.5);
    expect(Math.min(...pts.map((p) => Math.hypot(p[0] - farB[0], p[1] - farB[1])))).toBeLessThan(2.5);
  });

  test("the length is the two runs and the two wraps", () => {
    const run = Math.hypot(g.left[1][0] - g.left[0][0], g.left[1][1] - g.left[0][1]);
    expect(g.length).toBeCloseTo(2 * run + g.wraps.a.span * a.r + g.wraps.b.span * b.r, 6);
    // The wrap on the larger circle is the longer one.
    if (a.r !== b.r) expect(a.r > b.r ? g.wraps.a.span : g.wraps.b.span).toBeGreaterThan(Math.PI);
  });
});

describe("belt and gear", () => {
  test("circles that overlap fully have no belt", () => {
    expect(() => outerTangents({ x: 0, y: 0, r: 100 }, { x: 10, y: 0, r: 20 })).toThrow(/inside/);
  });
  test("a 48 T ring and a 12 T cog on one chain pitch: the cog turns four times per ring turn", () => {
    const pitch = 12.7 * 2;
    expect(pitchRadius(48, pitch) / pitchRadius(12, pitch)).toBeCloseTo(4, 9);
    expect(ratioTurns(48, 12, 1)).toBe(4);
  });
  test("turn keys are linear and hold between spans", () => {
    const k = turnKeys([{ at: 1, until: 2, turns: 1 }, { at: 3, until: 4, turns: -0.5 }])!;
    expect(k.map((x) => x.v)).toEqual([0, 0, 360, 360, 180]);
    expect(k.filter((x) => x.curve).every((x) => x.curve === "linear")).toBe(true);
  });
  test("the blocks emit nodes that turn about the gear's centre", () => {
    const s = SYSTEMS.find((x) => x.id === "schematic")!;
    const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 600);
    const g = gear({ id: "g", cx: 500, cy: 900, r: 200, teeth: 48, turns: [{ at: 1, until: 3, turns: 1 }], at: 0 }, ctx);
    const teeth = g.find((n) => n.id === "g-teeth")!;
    expect(teeth.kind === "path" && teeth.box && teeth.box.x + teeth.box.w / 2).toBeCloseTo(500, 6);
    expect(teeth.kind === "path" && teeth.box && teeth.box.y + teeth.box.h / 2).toBeCloseTo(900, 6);
    const bl = belt({ id: "b", a: { x: 200, y: 900, r: 50 }, b: { x: 500, y: 900, r: 200 }, at: 0 }, ctx);
    expect(bl.filter((n) => n.kind === "anchor").map((n) => n.id)).toEqual(["b-top", "b-bottom"]);
  });
});
