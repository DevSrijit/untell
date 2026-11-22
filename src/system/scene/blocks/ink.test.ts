// Text is centred by its ink, not by its line box. For each block that centres text in a container, in three
// systems, the centre of the text's ink band (layout.inkBand, from the measured font metrics) lies within 0.5 px of
// the container's centre. Capitals and figures centre their cap band; mixed case centres its x-height band.
import { describe, expect, test } from "bun:test";
import { INK } from "../ink.gen";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import { centreInk, centreInkLines, inkBand, inkKind, inkMetrics, loadedWeights } from "../layout";
import type { Ctx, Node, TextNode } from "../types";
import { BLOCKS } from ".";
import { nodeBox } from "./flow";
import { counterNodes } from "./counter";
import { windowHeadHeight } from "./ui";

const SYS = ["graphite", "spec", "pop"] as const;
const ctxOf = (id: string): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, 1920, 1080, (t, r) => t.length * s.type[r].size * 1080 * 0.55);
};
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const txt = (nodes: Node[], id: string) => { const n = nodes.find((x) => x.id === id); if (!n || n.kind !== "text") throw new Error(`no text ${id}`); return n; };
const box = (nodes: Node[], id: string) => { const n = nodes.find((x) => x.id === id)!; if (n.kind !== "anchor" && n.kind !== "rect") throw new Error(`no box ${id}`); return n; };
/** The y of a text's ink centre: the middle of its ink band. */
const inkMid = (ctx: Ctx, n: TextNode) => { const b = inkBand(ctx, n.text, n.role, { keepCase: n.keepCase, weight: n.weight }); return n.y + (b.top + b.bottom) / 2; };
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThanOrEqual(0.5);

describe("ink metrics", () => {
  test("every font and weight a system loads is in the table, with sane values", () => {
    for (const s of SYSTEMS) for (const r of Object.keys(s.type) as (keyof typeof s.type)[]) for (const w of loadedWeights(s, r)) {
      const m = inkMetrics(s, r, w);
      expect(m.x).toBeLessThanOrEqual(m.cap);
      expect(m.cap).toBeLessThan(m.ascent);
      expect(m.descent).toBeGreaterThan(0);
    }
    expect(Object.keys(INK).length).toBeGreaterThan(20);
  });
  test("a text with a tall letter (capital, figure, ascender) centres its cap band; one without centres its x band", () => {
    const g = SYSTEMS.find((s) => s.id === "graphite")!, sp = SYSTEMS.find((s) => s.id === "spec")!;
    expect(inkKind(g, "label", "CONE 10")).toBe("cap");
    expect(inkKind(g, "label", "cone 10")).toBe("cap");
    expect(inkKind(g, "label", "mean")).toBe("x");
    expect(inkKind(g, "label", "queue")).toBe("x");
    expect(inkKind(g, "label", "done")).toBe("cap");
    expect(inkKind(sp, "label", "mean")).toBe("cap");
    expect(inkKind(sp, "label", "mean", true)).toBe("x");
    const ctx = ctxOf("graphite");
    const y = centreInk(ctx, "CONE 10", "label", { y: 100, h: 60 }), b = inkBand(ctx, "CONE 10", "label");
    near(y + (b.top + b.bottom) / 2, 130);
    // A caps text sits lower than its line box would put it: its ink has no descender.
    expect(y).toBeGreaterThan(100 + (60 - ctx.size("label") * ctx.system.type.label.leading) / 2);
    const y2 = centreInkLines(ctx, ["One", "two"], "label", { y: 0, h: 200 }, 40);
    const b1 = inkBand(ctx, "One", "label"), b2 = inkBand(ctx, "two", "label");
    near((y2 + b1.top + y2 + 40 + b2.bottom) / 2, 100);
  });
});

describe.each(SYS.map((s) => [s]))("%s: every container centres its text's ink", (sys) => {
  const ctx = ctxOf(sys);

  test("badge, button, toast", () => {
    for (const t of ["CONE 10", "cone 10"]) {
      const b = BLOCKS.badge({ id: "b", x: 100, y: 100, text: t, at: 0 }, ctx);
      const pill = box(b, "b-box");
      near(inkMid(ctx, txt(b, "b-text")), pill.y + pill.h / 2);
    }
    const bt = BLOCKS.button({ id: "s", x: 100, y: 300, text: "Start firing", at: 0 }, ctx);
    near(inkMid(ctx, txt(bt, "s-text")), box(bt, "s-box").y + box(bt, "s-box").h / 2);
    const to = BLOCKS.toast({ id: "t", text: "Firing to 1222 °C", x: 100, y: 500, w: 900, at: 0 }, ctx);
    near(inkMid(ctx, txt(to, "t-text")), box(to, "t-box").y + box(to, "t-box").h / 2);
  });

  test("list row cells: initials in the avatar, name and meta in the row, the badge text in its pill", () => {
    for (const stack of [false, true]) {
      const r = quiet(() => BLOCKS.listRow({ id: "r", x: 100, y: 100, w: 1200, title: "Porcelain bowls", initials: "GS", meta: "Wed 14:30", badge: { text: "cone 10" }, stack, at: 0 }, ctx));
      const av = r.find((n) => n.id === "r-avatar")!;
      if (av.kind !== "circle") throw new Error("no avatar");
      near(inkMid(ctx, txt(r, "r-initials")), av.cy);
      const pill = box(r, "r-badge-box");
      near(inkMid(ctx, txt(r, "r-badge-text")), pill.y + pill.h / 2);
      if (!stack) {
        const row = box(r, "r-box");
        near(inkMid(ctx, txt(r, "r-title")), row.y + row.h / 2);
        near(inkMid(ctx, txt(r, "r-meta")), row.y + row.h / 2);
      } else near(inkMid(ctx, txt(r, "r-meta")), pill.y + pill.h / 2);
    }
  });

  test("window head, tab bar, and a toolbar on one baseline and one bottom line", () => {
    const w = BLOCKS.uiWindow({ id: "w", x: 100, y: 100, w: 1400, h: 700, title: "Kiln queue", head: "title", at: 0,
      toolbar: { tabs: ["Queue", "Firing", "Done"], action: { text: "Start firing" } } }, ctx);
    const content = box(w, "w-content");
    const bar = content.y - 100;
    const title = txt(w, "w-title");
    // The head's height, not the rule's drawn y: crisp() puts a 1 px rule on a half px.
    near(inkMid(ctx, title), 100 + windowHeadHeight(ctx, "title") / 2);
    expect(bar).toBeGreaterThan(0);
    // The toolbar: the tab rule is the button's bottom edge, and the tab labels sit on the button label's baseline.
    const btn = box(w, "w-action-box");
    const rule = (w.find((n) => n.id === "w-tabs-rule") as { d: string }).d.match(/^M[\d.]+ ([\d.]+)/)![1]!;
    expect(Math.abs(Number(rule) - (btn.y + btn.h))).toBeLessThanOrEqual(0.5);
    const base = (n: TextNode) => n.y + inkBand(ctx, n.text, n.role).baseline;
    near(base(txt(w, "w-tabs-t0-on")), base(txt(w, "w-action-text")));
    near(inkMid(ctx, txt(w, "w-action-text")), btn.y + btn.h / 2);
    // A tab bar on its own centres its labels' ink above the underline.
    const t = BLOCKS.tab({ id: "t", x: 0, y: 0, tabs: ["Queue", "Firing"], active: [{ index: 0, at: 0 }], at: 0 }, ctx);
    const u = box(t, "t-underline");
    near(inkMid(ctx, txt(t, "t-t0-on")), u.y / 2);
  });

  test("terminal status line, counter, flow node, bar value, table row", () => {
    const term = BLOCKS.terminal({ id: "k", x: 100, y: 100, w: 1500, h: 700, session: [{ command: "ls" }], status: { left: "host", right: "idle" }, at: 0 }, ctx);
    const rule = (term.find((n) => n.id === "k-status-rule") as { d: string }).d.match(/^M[\d.]+ ([\d.]+)/)![1]!;
    near(inkMid(ctx, txt(term, "k-status-l")), (Number(rule) + 800) / 2);

    const c = counterNodes({ id: "n", x: 100, y: 100, w: 800, h: 300, value: 42, at: 0 }, ctx, {});
    const digit = c.find((n): n is TextNode => n.kind === "text" && /^[0-9]$/.test(n.text))!;
    const b = inkBand(ctx, "0", digit.role);
    near(digit.y + (b.top + b.bottom) / 2, 250);

    const fb = nodeBox(ctx, { id: "f", x: 100, y: 100, w: 400, h: 120, lines: ["Kiln"], role: "body", at: 0, lit: [] });
    near(inkMid(ctx, txt(fb, "f-t0-a")), 160);

    const bar = quiet(() => BLOCKS.bar({ id: "v", x: 100, y: 100, w: 1200, h: 120, value: 80, max: 100, at: 0 }, ctx));
    const val = bar.find((n): n is TextNode => n.kind === "text");
    expect(val).toBeDefined();
    near(inkMid(ctx, val!), 160);

    const m = quiet(() => BLOCKS.matrix({ id: "m", x: 100, y: 100, w: 1500, h: 600, columns: ["Glaze", "Clay"], rows: [{ label: "Mugs", cells: ["matte", "red"] }, { label: "Bowls", cells: ["gloss", "12"] }], at: 0 }, ctx));
    // A row's one-line texts share one baseline; a figure cell in a mixed-case row takes the row's x band.
    const lab = txt(m, "m-label-0-0"), cell = txt(m, "m-cell-0-0-0"), fig = txt(m, "m-cell-1-1-0");
    near(lab.y, cell.y);
    const r1 = txt(m, "m-label-1-0");
    near(r1.y, fig.y);
  });
});
