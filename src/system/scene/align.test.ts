// Tests for the alignment model (align.ts): features, near misses, the solver's rules, and the snap table.
// The frames are small and drawn by hand; scripts/snap runs the same model on real captures.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../systems";
import { analyse, applyMoves, bandOf, guideHelpers, hunkId, LEVELS, resolveGuides, translateD, withGuides, withSnap, type AlignEl, type AlignFrame, type Box } from "./align";
import { makeCtx } from "./context";
import type { Node } from "./types";

const B = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });
/** A text whose cap band is [baseline - 30, baseline]: one tall letter per 20 px. */
const text = (id: string, x0: number, x1: number, baseline: number, extra: Partial<AlignEl> = {}): AlignEl => ({
  id, kind: "text", box: B(x0, baseline - 43, x1, baseline + 13),
  text: { baseline, cap: 30, xh: 22, fontPx: 43, ink: B(x0, baseline - 30, x1, baseline), letters: [B(x0, baseline - 30, x0 + 18, baseline)] }, ...extra,
});
const rect = (id: string, b: Box, extra: Partial<AlignEl> = {}): AlignEl => ({ id, kind: "rect", box: b, ...extra });
const rule = (id: string, x0: number, x1: number, y: number): AlignEl => ({ id, kind: "path", box: B(x0, y, x1, y), stroke: 2 });
const frame = (els: AlignEl[], extra: Partial<AlignFrame> = {}): AlignFrame => ({ width: 1920, height: 1080, safe: { left: 99, right: 1821, top: 99, bottom: 981 }, els, ...extra });

describe("geometry helpers", () => {
  test("translateD moves absolute coordinates and keeps relative ones", () => {
    expect(translateD("M10 20H110", 5, -2)).toBe("M15 18H115");
    expect(translateD("M0 0L10 10l5 5V40Z", 1, 1)).toBe("M1 1L11 11l5 5V41Z");
    expect(translateD("m3 4l1 1", 10, 10)).toBe("m13 14l1 1");
  });
  test("applyMoves moves a group by its prefix and leaves the rest", () => {
    const nodes = [
      { id: "start-face", kind: "rect", x: 10, y: 10, w: 5, h: 5 },
      { id: "start-text", kind: "text", x: 12, y: 11 },
      { id: "starter", kind: "rect", x: 0, y: 0, w: 1, h: 1 },
      { id: "ring", kind: "circle", cx: 4, cy: 4, r: 2 },
    ] as unknown as Node[];
    const out = applyMoves(nodes, [{ nodes: ["start-*", "ring"], dx: 0, dy: 3 }]) as any[];
    expect(out.map((n) => n.y ?? n.cy)).toEqual([13, 14, 0, 7]);
  });
  test("applyMoves moves a label's knock-out and anchor with its text, once, also when the table names them", () => {
    const nodes = [
      { id: "dim-rise-knock", kind: "rect", x: 98, y: 48, w: 24, h: 14 },
      { id: "dim-rise-text", kind: "text", x: 100, y: 50 },
      { id: "dim-rise-label", kind: "anchor", x: 100, y: 50, w: 20, h: 10 },
      { id: "dim-rise-line", kind: "rect", x: 0, y: 0, w: 1, h: 1 },
    ] as unknown as Node[];
    const xs = (o: any[]) => o.map((n) => n.x);
    expect(xs(applyMoves(nodes, [{ nodes: ["dim-rise-text"], dx: 6, dy: 0 }]) as any[])).toEqual([104, 106, 106, 0]);
    expect(xs(applyMoves(nodes, [{ nodes: ["dim-rise-text", "dim-rise-knock"], dx: 6, dy: 0 }]) as any[])).toEqual([104, 106, 106, 0]);
  });
  test("hunk ids are stable and short", () => {
    expect(hunkId("c", "a|b")).toBe(hunkId("c", "a|b"));
    expect(hunkId("c", "a|b")).not.toBe(hunkId("c", "a|c"));
    expect(hunkId("e", "x")).toMatch(/^e-[0-9a-z]{5}$/);
  });
  test("a text with a tall letter centres its cap band; one without centres its x band", () => {
    const tall = text("t", 0, 100, 100);
    expect(bandOf(tall.text!)).toMatchObject({ top: 70, bottom: 100, tall: true });
    const low = { ...tall.text!, letters: [B(0, 78, 18, 100)], ink: B(0, 78, 100, 100) };
    expect(bandOf(low)).toMatchObject({ top: 78, tall: false });
  });
});

describe("near misses and proposals", () => {
  // The "cone 10" case: the cap band sits 6 px above the pill's centre (pill 497-558, centre 527.5).
  const pill = rect("row1-badge-pill", B(1128, 497, 1344, 558));
  const cone = text("row1-badge-text", 1155, 1317, 537);
  // The "Start firing" case: the button ends at 297, the tab bar's rule at 279, side by side in one panel.
  const panel = rect("app-panel", B(271, 158, 1649, 758));
  const face = rect("start-face", B(1219, 192, 1615, 297));
  const label = text("start-text", 1282, 1552, 259.5);
  const tabRule = rule("tabs-rule", 305, 1185, 279);
  const underline = rect("tabs-underline", B(514, 274, 628, 279));
  const tabLabel = text("tabs-t0-on", 514, 628, 262);

  test("the off-centre label is an error, and its proposal moves only the label by whole px", () => {
    const a = analyse(frame([panel, pill, cone]));
    const c = a.issues.find((i) => i.kind === "centre" && i.el === "row1-badge-text")!;
    expect(c.level).toBe("error");
    expect(c.off).toBeCloseTo(-5.5, 1);
    const p = a.proposals.find((x) => x.id === c.fix)!;
    expect(p.nodes).toEqual(["row1-badge-text"]);
    expect(p.delta).toBe(6);
    expect(p.rel).toMatchObject({ of: "row1-badge-text", feature: "bandCy", to: "row1-badge-pill.cy" });
  });

  test("the button's bottom and the tab rule: an edge near miss; the tab block moves as one", () => {
    const a = analyse(frame([panel, face, label, tabRule, underline, tabLabel]));
    const e = a.issues.find((i) => i.kind === "edge" && [i.el, i.target.el].sort().join() === "start-face,tabs-rule")!;
    expect(e).toBeTruthy();
    expect(Math.abs(e.off)).toBe(18);
    const p = a.proposals.find((x) => x.id === e.fix)!;
    // The button's top inset equals its side inset (34 px): moving it would break that, so the tab block moves.
    expect(p.group).toBe("tabs-*");
    expect(p.nodes.sort()).toEqual(["tabs-rule", "tabs-t0-on", "tabs-underline"]);
    expect(p.delta).toBe(18);
  });

  test("the same frame gives the same proposals", () => {
    const f = frame([panel, pill, cone, face, label, tabRule, underline, tabLabel]);
    expect(JSON.stringify(analyse(f).proposals)).toBe(JSON.stringify(analyse(f).proposals));
  });

  test("edges that share a line, and edges far apart, are not near misses", () => {
    const a = analyse(frame([rect("a", B(100, 100, 300, 200)), rect("b", B(100, 400, 300, 500)), rect("c", B(900, 100, 1100, 160))]));
    expect(a.issues.filter((i) => i.kind === "edge")).toEqual([]);
  });

  test("a data mark never moves; its partner moves instead", () => {
    // Side by side in one panel (siblings): the near miss is an error and gets a proposal.
    const panel = rect("card", B(300, 200, 900, 800));
    const bar = rect("chart-bar1", B(400, 300, 440, 600), { data: true });
    const box = rect("note", B(460, 303, 700, 400));
    const a = analyse(frame([panel, bar, box]));
    const p = a.proposals[0]!;
    expect(p.nodes).not.toContain("chart-bar1");
    expect(p.el).toBe("note");
    expect(p.delta).toBe(-3);
  });

  test("a move that would create an overlap is refused", () => {
    // The label is 4 px above its pill's centre, but a mark sits 2 px under the label: no safe move.
    const p2 = rect("p2", B(100, 100, 400, 160));
    const t = text("p2-text", 120, 380, 141);
    const mark = rect("mark", B(150, 143, 160, 158));
    const a = analyse(frame([p2, t, mark]));
    expect(a.proposals.find((p) => p.el === "p2-text")).toBeUndefined();
  });

  test("a declared exception is reported as ignored and gets no proposal", () => {
    const a = analyse(frame([panel, pill, cone], { ignores: [{ check: "align/centre", nodes: ["row1-badge"], reason: "optical overhang" }] }));
    const c = a.issues.find((i) => i.kind === "centre" && i.el === "row1-badge-text")!;
    expect(c.ignored).toBe("optical overhang");
    expect(c.fix).toBeUndefined();
  });

  test("a 2 px hairline on a whole px is crisp; a 1 px hairline there is soft", () => {
    const crisp = analyse(frame([{ ...rule("r", 100, 900, 300), stroke: 2 }])).issues.filter((i) => i.kind === "half-px");
    const soft = analyse(frame([{ ...rule("r", 100, 900, 300), stroke: 1 }])).issues.filter((i) => i.kind === "half-px");
    expect(crisp).toEqual([]);
    expect(soft[0]).toMatchObject({ el: "r", level: "error", to: 300.5 });
  });

  test("a run of three with one odd gap: the rhythm issue moves the one after it", () => {
    const a = analyse(frame([rect("c0", B(100, 100, 200, 160)), rect("c1", B(230, 100, 330, 160)), rect("c2", B(363, 100, 463, 160)), rect("c3", B(493, 100, 593, 160))]));
    const r = a.issues.find((i) => i.kind === "rhythm")!;
    expect(r).toMatchObject({ el: "c2", off: 3 });
  });
});

describe("withSnap", () => {
  const studio = SYSTEMS.find((s) => s.id === "studio")!;
  const ctx = makeCtx(studio, 1920, 1080, (t) => t.length * 20);
  const scene = () => [
    { id: "pill", kind: "rect", x: 100, y: 100, w: 200, h: 61, fill: "accent" },
    { id: "pill-text", kind: "text", x: 120, y: 97, text: "cone 10", role: "label", color: "onAccent" },
    { id: "rule", kind: "path", d: "M400 150H900", stroke: "rule", width: 2 },
  ] as Node[];
  test("a relation resolves at build time and moves its nodes", () => {
    const snapped = withSnap(scene, [{ id: "c-1", move: ["pill-text"], axis: "y", of: "pill-text", feature: "bandCy", to: "pill.cy", kind: "centre" }]);
    const t = snapped(ctx, null).find((n) => n.id === "pill-text") as Extract<Node, { kind: "text" }>;
    expect(t.y).not.toBe(97);
    // Applied twice it stays: the relation already holds.
    const again = withSnap(() => snapped(ctx, null), [{ id: "c-1", move: ["pill-text"], axis: "y", of: "pill-text", feature: "bandCy", to: "pill.cy", kind: "centre" }]);
    expect((again(ctx, null).find((n) => n.id === "pill-text") as any).y).toBe(t.y);
  });
  test("a relation to a node that is gone, or that grew too far, does nothing", () => {
    const gone = withSnap(scene, [{ id: "e-1", move: ["rule"], axis: "y", of: "rule", feature: "line", to: "missing.bottom" }]);
    expect((gone(ctx, null).find((n) => n.id === "rule") as any).d).toBe("M400 150H900");
    const far = withSnap(scene, [{ id: "e-2", move: ["rule"], axis: "y", of: "rule", feature: "line", to: "px:400" }]);
    expect((far(ctx, null).find((n) => n.id === "rule") as any).d).toBe("M400 150H900");
    const near = withSnap(scene, [{ id: "e-3", move: ["rule"], axis: "y", of: "rule", feature: "line", to: "px:161" }]);
    expect((near(ctx, null).find((n) => n.id === "rule") as any).d).toBe("M400 161H900");
  });
  // An agent's film: snap previewed a rhythm fix to "px:1768.5" (a move of 1.5 px), and the table rounded the move to
  // 2 px, so the check found the gap off again. The table moves as the preview did: to the half-pixel grid.
  test("a rhythm fix to a half-pixel line lands on it, as its preview did", () => {
    const half = withSnap(scene, [{ id: "g-1", move: ["rule"], axis: "y", of: "rule", feature: "line", to: "px:151.5", kind: "rhythm" }]);
    expect((half(ctx, null).find((n) => n.id === "rule") as any).d).toBe("M400 151.5H900");
  });
});

// The judged survey's classes of false alarm (out/snap/survey/JUDGED.md), each as a small frame: the model must stay
// quiet on the designed case and still find the real one beside it.
describe("relations a designer uses", () => {
  test("a text set left is not near the centre of anything (an agent's headline)", () => {
    const head = text("head-0", 99, 735, 140), num = text("code-n1", 99, 130, 260), pane = rect("code-panel", B(80, 200, 1000, 900));
    const a = analyse(frame([head, num, pane]));
    expect(a.issues.filter((i) => i.el === "head-0" || i.target.el === "head-0").filter((i) => i.feature === "bandCx" || i.target.feature === "bandCx")).toEqual([]);
  });
  test("words of a caption and their highlight follow the line, not a grid", () => {
    const w = (id: string, x0: number, x1: number, base: number) => text(id, x0, x1, base, { text: { baseline: base, cap: 30, xh: 22, fontPx: 43, ink: B(x0, base - 22, x1, base), letters: [B(x0, base - 22, x0 + 18, base)] } });
    const els = [w("cc-p0-w0", 200, 320, 500), w("cc-p0-w1", 340, 470, 500), w("cc-p0-w2", 205, 300, 560), w("cc-p0-w3", 318, 460, 560),
      rect("cc-p0-w1-bar", B(330, 450, 480, 512))];
    const a = analyse(frame(els));
    expect(a.issues.filter((i) => i.level !== "advice")).toEqual([]);
  });
  test("an inset: a value inside its bar under a name on the bar's edge is designed", () => {
    const bar = rect("bar-0", B(121, 442, 400, 533)), name = text("name-0", 121, 300, 420), value = text("bar-0-value", 137, 230, 500);
    const a = analyse(frame([bar, name, value]));
    expect(a.issues.filter((i) => i.kind === "edge" && [i.el, i.target.el].includes("name-0"))).toEqual([]);
  });
  test("a box the painter rounds has no half-px edge; one under a transform at rest has", () => {
    const crisp = analyse(frame([rect("r", B(100.5, 100.5, 300.5, 200.5), { snapped: true })])).issues.filter((i) => i.kind === "half-px");
    const soft = analyse(frame([rect("r", B(100.5, 100.5, 300.5, 200.5))])).issues.filter((i) => i.kind === "half-px");
    expect(crisp).toEqual([]);
    expect(soft.length).toBe(2);
  });
  test("tags: one row makes a near miss an error; two rows of one group are apart by design", () => {
    const a1 = rect("left", B(100, 100, 300, 200), { tags: { row: "r1" } }), b1 = rect("right", B(700, 104, 900, 204), { tags: { row: "r1" } });
    const row = analyse(frame([a1, b1])).issues.find((i) => i.kind === "edge" && i.axis === "y")!;
    expect(row).toMatchObject({ cls: "tag", level: "error" });
    const apart = analyse(frame([{ ...a1, tags: { row: "r1" } }, { ...b1, tags: { row: "r2" } }])).issues.filter((i) => i.kind === "edge" && i.axis === "y");
    expect(apart).toEqual([]);
  });
  test("nearness alone is advice; the classes' levels come from the judged precision", () => {
    const a = analyse(frame([rect("a", B(100, 100, 300, 200)), rect("b", B(330, 104, 520, 200))]));
    for (const i of a.issues.filter((x) => x.kind === "edge")) expect(i.level).not.toBe("error");
    expect(LEVELS["edge near"]).toBe("advice");
    expect(LEVELS["centre contain"]).toBe("error");
  });
});

describe("guides a scene names", () => {
  const f = { width: 1920, height: 1080, safe: { left: 120, right: 1800, top: 100, bottom: 980 } };
  const spec = { cols: { count: 6, gutter: 24 }, baseline: { unit: 8 }, lines: { fold: { y: 600 } } };
  test("columns fill the safe area; helpers place on them", () => {
    const g = resolveGuides(spec, f);
    expect(g.x[0]).toEqual({ name: "col1.left", v: 120 });
    expect(g.x.at(-1)).toEqual({ name: "col6.right", v: 1800 });
    const h = guideHelpers(g);
    expect(h.span(1, 2).x).toBe(120);
    expect(h.line("fold")).toBe(600);
    expect(h.baseline(103)).toBe(108);
  });
  test("an edge near a guide and not on it is reported against the guide, which never moves", () => {
    const g = resolveGuides(spec, f);
    const card = rect("card", B(g.x[2]!.v + 5, 300, g.x[2]!.v + 405, 500));
    const a = analyse(frame([card], { guides: g }));
    const i = a.issues.find((x) => x.el === "card" && x.target.el.startsWith("guide:scene."))!;
    expect(i).toMatchObject({ cls: "guide", level: "error", off: 5 });
    const p = a.proposals.find((x) => x.id === i.fix)!;
    expect(p.nodes).toEqual(["card"]);
    expect(p.delta).toBe(-5);
  });
  test("a baseline off the scene's baseline grid", () => {
    const g = resolveGuides(spec, f);
    const a = analyse(frame([text("t", 200, 500, 403)], { guides: g }));
    // The grid: 100, 108, ... 404 (the safe top and every 8 px); 403 is 1 px above 404.
    expect(a.issues.find((i) => i.el === "t" && i.target.el === "guide:scene.baseline")).toMatchObject({ off: -1, to: 404 });
  });
  test("withSnap keeps a scene's guides and resolves a relation to a guide", () => {
    const studio = SYSTEMS.find((s) => s.id === "studio")!;
    const ctx = makeCtx(studio, 1920, 1080, (t) => t.length * 20);
    const scene = withGuides(() => [{ id: "card", kind: "rect", x: 125, y: 300, w: 200, h: 100, fill: "accent" }] as Node[], spec);
    const snapped = withSnap(scene, [{ id: "e-g", move: ["card"], axis: "x", of: "card", feature: "left", to: "guide:scene.col1.left.line", kind: "edge" }]);
    expect((snapped as unknown as { guides: unknown }).guides).toBe(spec);
    expect((snapped(ctx, null).find((n) => n.id === "card") as any).x).toBe(ctx.safe.left);
  });
});

describe("the reels' optical icons and a drawing traced on a photo", () => {
  test("a row title 1.4 px off a small icon's centre is optical alignment; 5 px off is a miss", () => {
    const panel = rect("row1", B(100, 100, 900, 220));
    const title = text("row1-title", 200, 600, 175);
    const bars = (dy: number) => rect("row1-pri", B(800, 145 + dy, 824, 175 + dy - 2));
    const ofBars = (dy: number) => analyse(frame([panel, title, bars(dy)])).issues.filter((i) => i.axis === "y" && i.level !== "advice" && [i.el, i.target.el].includes("row1-pri"));
    expect(ofBars(0.4).filter((i) => i.kind === "edge")).toEqual([]);
    // 5 px off: a miss (here the icon is also off its row's centre, and that names it).
    expect(ofBars(5).length).toBeGreaterThan(0);
  });
  test("a line traced on a photo is never a near miss and never moves", () => {
    const photo: AlignEl = { id: "photo", kind: "image", box: B(100, 100, 900, 700) };
    const tower: AlignEl = { id: "tower", kind: "path", box: B(400, 200, 404, 600), stroke: 4, onPicture: true };
    const label = rect("label", B(398, 650, 520, 690));
    const a = analyse(frame([photo, tower, label]));
    expect(a.issues.filter((i) => i.el === "tower" || i.target.el === "tower")).toEqual([]);
    expect(a.proposals.filter((p) => p.nodes.includes("tower"))).toEqual([]);
  });
});

describe("a proposal is shown only when it leaves fewer issues", () => {
  test("a 1 px move that fixes a pair and breaks a row is not shown (an agent's Graphite film's first hunks)", () => {
    const panel = rect("list", B(80, 80, 1840, 400));
    const a = text("list-a", 120, 400, 200), b = text("list-b", 600, 900, 200), c = text("list-c", 1100, 1400, 200);
    // A chart's dot beside b, its centre 3 px under b's ink centre: only b can move, and b on its own leaves the row.
    const dot = rect("chart-dot0", B(930, 173, 970, 193), { data: true });
    const A = analyse(frame([panel, a, b, c, dot]));
    for (const p of A.proposals) expect(p.issuesAfter!).toBeLessThan(p.issuesBefore!);
    expect(A.proposals.filter((p) => p.nodes.includes("list-b"))).toEqual([]);
  });
  test("every proposal on the kiln-like frame states fewer issues after", () => {
    const pill = rect("row1-badge-pill", B(1128, 497, 1344, 558)), cone = text("row1-badge-text", 1155, 1317, 537);
    const A = analyse(frame([rect("app-panel", B(271, 158, 1649, 758)), pill, cone]));
    expect(A.proposals.length).toBeGreaterThan(0);
    for (const p of A.proposals) expect(p.issuesAfter!).toBeLessThan(p.issuesBefore!);
  });
});
