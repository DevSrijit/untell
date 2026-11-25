// Bar chart labels share an edge or keep clear of one: a category label and its value label never sit a few px
// apart (the detector's panel-near-miss). The case is the package's example film, "The rule of 72", in Riso.
import { expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import type { TextNode } from "../types";
import { barChart } from "./barChart";

test.each([["riso", 0.5], ["riso", 0.56], ["spec", 0.52], ["graphite", 0.55]] as const)("%s (text %f em a letter): no near-miss left edges in columns", (id, k) => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * k);
  const S = ctx.safe, x = S.left, w = S.right - S.left, h = S.bottom - S.top;
  const y = S.top + h * 0.45 + ctx.lineHeight("label") * 2;
  const rates = [2, 4, 6, 8, 10, 12];
  const nodes = barChart({ id: "d", x, y, w, h: S.bottom - y, title: "Years for money to double, by annual return", categories: rates.map((r) => `${r} %`),
    series: [{ label: "Years", values: rates.map((r) => Math.log(2) / Math.log(1 + r / 100)) }], key: 3, format: { decimals: 1 }, at: 1 }, ctx);
  const t = (pre: string) => nodes.filter((n): n is TextNode => n.kind === "text" && n.id.startsWith(pre));
  const cats = t("d-cat-"), vals = t("d-val-");
  expect(cats.length).toBe(6);
  for (let c = 0; c < 6; c++) {
    const a = cats.find((n) => n.id.startsWith(`d-cat-${c}-`))!, b = vals.find((n) => n.id.startsWith(`d-val-${c}-`));
    if (!b) continue;
    const d = Math.abs(a.x - b.x);
    expect(d < 0.01 || d >= ctx.size("label") * 0.35).toBe(true);
  }
});

test("matrix: in a column, the header and the cells share one centre line", async () => {
  const { matrix } = await import("./matrix");
  for (const id of ["spec", "graphite", "pop"]) {
    const s = SYSTEMS.find((x) => x.id === id)!;
    const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.52);
    const S = ctx.safe;
    const nodes = matrix({ id: "m", x: S.left, y: S.top, w: S.right - S.left, h: 700, columns: ["Base 2", "Base 10", "Base 16"],
      rows: [{ label: "255 is", cells: ["1111 1111", "255", "FF"] }, { label: "Digits", cells: ["8", "3", "2"] }], at: 0 }, ctx);
    for (let c = 0; c < 3; c++) {
      const cs = nodes.filter((n): n is TextNode => n.kind === "text" && (n.id.startsWith(`m-head-${c}-`) || new RegExp(`^m-cell-\\d+-${c}-`).test(n.id)))
        .map((n) => n.x + ctx.measure(n.text, n.role) / 2);
      for (const a of cs) expect(Math.abs(a - cs[0]!)).toBeLessThanOrEqual(0.5);
    }
  }
});

// A horizontal chart of five shares in a short box: each bar is thinner than the key value's line. The key value
// must then sit outside its bar, in the ink of the ground, not inside it in the ink of the bar.
test("a key value does not go inside a bar that is thinner than its line", () => {
  const s = SYSTEMS.find((x) => x.id === "spec")!;
  const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.55);
  const S = ctx.safe, x = S.left, w = S.right - S.left;
  const warn = console.warn; console.warn = () => {};
  const nodes = barChart({ id: "u", x, y: S.top + 300, w, h: 520, title: "Home electricity by use, %", categories: ["Heating", "Appliances", "Hot water", "Lighting", "Cooking"],
    series: [{ label: "Share", values: [42, 27, 18, 8, 5] }], key: 0, orientation: "horizontal", format: { suffix: " %" }, at: 1 }, ctx);
  console.warn = warn;
  const val = nodes.find((n): n is TextNode => n.kind === "text" && n.id.startsWith("u-val-0-"))!;
  const bar = nodes.find((n) => n.id.startsWith("u-bar-0-"))! as unknown as { box: { h: number } };
  expect(ctx.lineHeight(val.role)).toBeGreaterThan(bar.box.h);
  expect(val.color).not.toBe("onAccent");
});
