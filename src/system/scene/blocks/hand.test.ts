// The hand of each system (hand.ts), the hanging bars of barChart (`from: "top"`), the counter's roll and `until`,
// and the gesture tags of the data and diagram blocks.
import { expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx, textSafe } from "../context";
import type { Node, TextNode } from "../types";
import { barChart } from "./barChart";
import { counter } from "./counter";
import { HANDS, PLAIN, hand, tagParts, GESTURES } from "./hand";
import { pictureSafe } from "./sheet";

const ctxOf = (id: string, w = 1080, h = 1920, k = 0.55) => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * k);
};
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const rates = [1, 2, 3, 5, 7, 10];
const props = (ctx: ReturnType<typeof ctxOf>, from: "top" | "bottom" = "bottom") => {
  const S = ctx.safe, P = pictureSafe(ctx), y = S.top + 200;
  return { id: "d", x: S.left, y, w: S.right - S.left, h: from === "top" ? P.y + P.h - y : S.bottom - y, title: "Years for money to double, by annual return",
    categories: rates.map((r) => `${r} %`), series: [{ label: "Years", values: rates.map((r) => Math.log(2) / Math.log(1 + r / 100)) }], key: 4, format: { decimals: 1 }, from, at: 1 };
};

test("every hand names a system, and every hand value is a token or a multiple of one", () => {
  for (const id of Object.keys(HANDS)) expect(SYSTEMS.some((s) => s.id === id)).toBe(true);
  for (const s of SYSTEMS) {
    const h = hand({ system: s });
    expect(["fill", "outline", "overprint", "cells"]).toContain(h.bar);
    expect(Object.keys(s.type)).toContain(h.value);
    expect(Object.keys(s.type)).toContain(h.key);
    expect(h.line).toBeGreaterThan(0);
  }
});

test("a system without a hand draws the plain hand (the Manual reel's bars do not change)", () => {
  expect(HANDS.manual).toBeUndefined();
  expect(hand(ctxOf("manual"))).toEqual(PLAIN);
});

test("four systems draw the same bar chart in four hands: no two are the same chart recoloured", () => {
  const shape = (id: string) => quiet(() => barChart(props(ctxOf(id)), ctxOf(id)))
    .filter((n) => n.id.startsWith("d-bar-") || n.id === "d-base")
    .map((n) => (n.kind === "path" ? `${n.d}|${n.width ?? ""}|${n.stroke ?? ""}|${n.blend ?? ""}` : n.kind)).join(";");
  const shapes = ["spec", "studio", "kinetic", "riso", "schematic", "console"].map(shape);
  expect(new Set(shapes).size).toBe(shapes.length);
});

test.each(["spec", "studio", "kinetic", "riso", "schematic", "console", "pop", "graphite"])("%s: hanging bars keep every label in the text-safe area and reach the lower band", (id) => {
  const ctx = ctxOf(id);
  const nodes = quiet(() => barChart(props(ctx, "top"), ctx));
  const texts = nodes.filter((n): n is TextNode => n.kind === "text");
  expect(texts.length).toBeGreaterThan(12);
  for (const t of texts) expect(textSafe(ctx, { x: t.x, y: t.y, w: ctx.measure(t.text, t.role), h: ctx.lineHeight(t.role) })).toBe(true);
  // The longest bar runs below the text-safe foot: the lower band holds marks.
  const bars = nodes.filter((n) => n.id.startsWith("d-bar-") && n.kind === "path" && "box" in n && n.box) as (Node & { box: { y: number; h: number } })[];
  expect(Math.max(...bars.map((b) => b.box.y + b.box.h))).toBeGreaterThan(ctx.safe.bottom);
  // Every bar starts on the rail, under its labels.
  expect(new Set(bars.map((b) => Math.round(b.box.y))).size).toBe(1);
});

test("a bar's value never overshoots in a system whose curves overshoot (Pop)", () => {
  const ctx = ctxOf("pop");
  const nodes = quiet(() => barChart(props(ctx, "top"), ctx));
  for (const n of nodes.filter((x) => x.id.startsWith("d-bar-"))) {
    const keys = n.tracks?.scaleY ?? [];
    for (const k of keys) expect(k.curve === undefined || k.curve !== "enter" || ctx.noOvershoot("enter") === "enter").toBe(true);
    expect(Math.max(...keys.map((k) => k.v))).toBeLessThanOrEqual(1);
  }
});

test("counter: the roll starts on the entrance frame, not after a still 0", () => {
  const ctx = ctxOf("spec");
  const nodes = quiet(() => counter({ id: "c", x: 100, y: 400, w: 800, h: 300, value: 84, at: 1 }, ctx));
  const starts = nodes.flatMap((n) => (n.tracks?.reveal ?? []).map((k) => k.t)).filter((t) => t > 0);
  // The first reveal key of a rolling digit is on the entrance frame (frame 31), not 0.5 s later.
  expect(Math.min(...starts)).toBeLessThan(1 + 2 / 30);
});

test("counter: `until` is honoured; a roll that would end after it is shortened, and a roll with no room throws", () => {
  const ctx = ctxOf("spec");
  const nodes = quiet(() => counter({ id: "c", x: 100, y: 400, w: 800, h: 300, value: 84, at: 1, until: 1.8 }, ctx));
  // Nothing of the counter is visible a whole exit after until.
  const after = 1.8 + ctx.dur.exit + 0.1;
  for (const n of nodes) {
    const op = n.tracks?.opacity ?? [];
    const last = [...op].reverse().find((k) => k.t <= after);
    if (last) expect(last.v).toBe(0);
  }
  expect(() => counter({ id: "c", x: 100, y: 400, w: 800, h: 300, value: 84, at: 1, until: 1.05 }, ctx)).toThrow(/until/);
});

test("the parts of a chart that enter as one gesture share one group", () => {
  const ctx = ctxOf("spec");
  const nodes = quiet(() => barChart(props(ctx), ctx));
  const bars = nodes.filter((n) => n.id.startsWith("d-bar-") && !n.id.endsWith("-end"));
  expect(bars.length).toBe(rates.length);
  expect(new Set(bars.map((n) => (n as { group?: string }).group))).toEqual(new Set(["d-bars"]));
  const g = tagParts<{ id: string; kind: string; group?: string }>([{ id: "w-h3-head", kind: "path" }], "w", GESTURES.flow!)[0]!;
  expect(g.group).toBe("w-hop3");
});

test.each(["spec", "studio", "riso", "schematic", "graphite"])("%s: a tall line chart climbs into the lower band and keeps every label text-safe", async (id) => {
  const { lineChart } = await import("./lineChart");
  const ctx = ctxOf(id);
  const S = ctx.safe, P = pictureSafe(ctx), y = S.top + 200;
  const ages = Array.from({ length: 41 }, (_, i) => 25 + i);
  const bal = (n: number) => (n <= 0 ? 0 : (200 * ((1 + 0.07 / 12) ** (n * 12) - 1)) / (0.07 / 12));
  const nodes = quiet(() => lineChart({ id: "g", x: S.left, y, w: S.right - S.left, h: P.y + P.h - y, title: "Balance by age", xLabels: ages.map(String), xEvery: 10,
    series: [{ label: "Starts at 25", values: ages.map((a) => bal(a - 25)) }, { label: "Starts at 35", values: ages.map((a) => bal(a - 35)) }], format: { prefix: "$", compact: true }, guides: [100000], at: 0 }, ctx));
  for (const t of nodes.filter((n): n is TextNode => n.kind === "text")) expect(textSafe(ctx, { x: t.x, y: t.y, w: ctx.measure(t.text, t.role), h: ctx.lineHeight(t.role) })).toBe(true);
  // The plot's baseline lies in the lower band.
  const base = nodes.find((n) => n.id === "g-grid-0");
  expect(base && base.kind === "path" && Number(base.d.split(" ")[1]!.replace(/H.*/, "")) > S.bottom).toBe(true);
  // Both series are named: at their ends, or in the key row.
  const named = nodes.filter((n): n is TextNode => n.kind === "text").map((t) => t.text).join("|");
  expect(named).toContain("Starts at 25");
  expect(named).toContain("Starts at 35");
  expect(nodes.some((n) => n.id === "g-guide-0")).toBe(true);
});

test("sheet: the title block sits at the foot, at the top or in a given box", async () => {
  const { sheetLayout } = await import("./sheet");
  const ctx = ctxOf("spec");
  const tb = { title: "Gear train", fig: 2 };
  const foot = sheetLayout(ctx, { titleBlock: tb }).titleBlock!, top = sheetLayout(ctx, { titleBlock: { ...tb, place: "top" } }).titleBlock!;
  expect(foot.y + foot.h).toBeCloseTo(ctx.safe.bottom, 0);
  expect(top.y).toBe(ctx.safe.top);
  const box = { x: 200, y: 400, w: 500, h: 60 };
  expect(sheetLayout(ctx, { titleBlock: { ...tb, place: box } }).titleBlock).toEqual(box);
});

test("a block whose labels sit on its marks keeps to the text-safe area at 9:16 and says so", async () => {
  const { slopeChart } = await import("./slopeChart");
  const ctx = ctxOf("spec");
  const warns: string[] = []; const w = console.warn; console.warn = (m: string) => warns.push(m);
  try {
    const S = ctx.safe, P = pictureSafe(ctx);
    const nodes = slopeChart({ id: "s", x: S.left, y: S.top, w: S.right - S.left, h: P.y + P.h - S.top, title: "Daylight", fromLabel: "June", toLabel: "December",
      items: [{ label: "0°", from: 12, to: 12 }, { label: "60° N", from: 18.5, to: 5.5 }], at: 0 }, ctx);
    for (const n of nodes) if (n.kind === "text") expect(n.y).toBeLessThan(S.bottom);
  } finally { console.warn = w; }
  expect(warns.some((m) => /text-safe area/.test(m) && /barChart/.test(m))).toBe(true);
});
