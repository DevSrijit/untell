// The UI kit with default props: a window with no box takes the system's window box, its rows fill it, small text
// keeps the phone floor, a selection is one row at a time, and every state is data (data-state in both renderers).
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx, textSafe } from "../context";
import { phoneCap } from "../layout";
import type { Ctx, Node } from "../types";
import { BLOCKS } from ".";
import { heroArea } from "./compose";
import { oneSelected, smallRole, UI_CAP, windowBox } from "./ui";

const ctxOf = (id: string, w = 1080, h = 1920): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * 0.5);
};
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const rows = ["Cone 6 stoneware", "Start", "Peak", "Soak", "Finish"].map((title, i) => ({ id: `r${i}`, title, meta: `${10 + i}:20` }));
const byId = (ns: Node[], id: string) => ns.find((n) => n.id === id) as Node & { x: number; y: number; w: number; h: number };

describe("windowBox and a window with no box", () => {
  for (const id of ["graphite", "studio", "keynote", "spec", "console"]) test(`${id}: the window covers the hook's share, under the line (two headline rows at 9:16, one at 16:9), inside the frame`, () => {
    for (const [W, H] of [[1080, 1920], [1920, 1080]] as const) {
      const ctx = ctxOf(id, W, H), b = windowBox(ctx), S = ctx.safe;
      expect(b.w * b.h).toBeGreaterThanOrEqual(W * H * Math.min(heroArea(ctx), 0.3) * 0.97);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w).toBeLessThanOrEqual(W);
      expect(b.y).toBeGreaterThanOrEqual(S.top + (H > W ? 2 : 1) * ctx.lineHeight("headline"));
      expect(b.y + b.h).toBeLessThanOrEqual(H);
      if (W > H) expect(b.w / b.h).toBeGreaterThan(1.3);
    }
  });
  test("graphite at 9:16: the window runs from under the line to the picture-safe foot, across the picture-safe width", () => {
    const ctx = ctxOf("graphite"), b = windowBox(ctx);
    const m = Math.ceil(ctx.system.margin * ctx.width);
    expect(b.y + b.h).toBe(ctx.height - m);
    expect(b.w).toBeGreaterThan(ctx.safe.right - ctx.safe.left);
  });
  test("two windows with no box take one box (a screen that swaps keeps its place)", () => {
    const ctx = ctxOf("graphite");
    const a = byId(BLOCKS.uiWindow({ id: "a", title: "One", at: 0, until: 2 }, ctx), "a-panel");
    const b = byId(BLOCKS.uiWindow({ id: "b", title: "Two", rows, at: 2 }, ctx), "b-panel");
    expect([a.x, a.y, a.w, a.h]).toEqual([b.x, b.y, b.w, b.h]);
    const p = byId(BLOCKS.pane({ id: "p", at: 0 }, ctx), "p-panel");
    expect([p.x, p.y, p.w, p.h]).toEqual([a.x, a.y, a.w, a.h]);
  });
  test("half a box throws", () => {
    expect(() => BLOCKS.uiWindow({ id: "a", x: 10, y: 10, at: 0 }, ctxOf("graphite"))).toThrow(/x, y, w and h, or none/);
  });
});

describe("rows fill the window", () => {
  for (const id of ["graphite", "studio", "keynote"]) for (const [W, H] of [[1080, 1920], [1920, 1080]] as const) test(`${id} ${W}x${H}: five rows reach the window's foot (at 9:16 the text-safe foot), and their text is text-safe`, () => {
    const ctx = ctxOf(id, W, H);
    const ns = quiet(() => BLOCKS.uiWindow({ id: "w", title: "Firapace · Kiln 753", toolbar: { tabs: [], action: { text: "View schedule" } }, rows, at: 0 }, ctx));
    const panel = byId(ns, "w-panel"), last = byId(ns, "r4-box");
    expect(Math.min(panel.y + panel.h, ctx.safe.bottom) - (last.y + last.h)).toBeLessThan(rows.length + 1);
    for (const n of ns) if (n.kind === "text") {
      const w = ctx.measure(n.text, n.role);
      expect([n.id, textSafe(ctx, { x: n.x, y: n.y, w, h: ctx.lineHeight(n.role) }, n.role)]).toEqual([n.id, true]);
    }
  });
});

describe("the phone floor", () => {
  test("the kit's small text keeps UI_CAP px of cap height on a 390 px phone in every system", () => {
    for (const s of SYSTEMS) {
      const ctx = ctxOf(s.id), r = smallRole(ctx);
      expect([s.id, r, phoneCap(s, r) >= UI_CAP || r === "body"]).toEqual([s.id, r, true]);
    }
    expect(smallRole(ctxOf("graphite"))).toBe("caption");
  });
});

describe("states", () => {
  test("a selected row's plate, bar and selected text say so; an active tab's label and underline say so", () => {
    const ctx = ctxOf("graphite");
    const row = BLOCKS.listRow({ id: "r", x: 140, y: 400, w: 760, title: "Ramp", meta: "22:30", selected: [{ at: 1, until: 2 }], at: 0 }, ctx);
    expect(row.filter((n) => (n as { state?: string }).state === "selected").map((n) => n.id).sort()).toEqual(["r-meta-on", "r-sel0", "r-sel0-bar"]);
    const tabs = BLOCKS.tab({ id: "t", x: 140, y: 400, tabs: ["Queue", "Done"], active: [{ index: 0, at: 0 }], at: 0 }, ctx);
    expect(tabs.filter((n) => (n as { state?: string }).state === "active").map((n) => n.id).sort()).toEqual(["t-t0-on", "t-underline"]);
  });
  test("a list has one selection: two rows selected on one frame throw, one after the other pass, multi allows many", () => {
    const sel = (a: number, b?: number) => [{ at: a, until: b }];
    expect(() => oneSelected("list", [{ id: "a", selected: sel(1, 2) }, { id: "b", selected: sel(1.5, 3) }])).toThrow(/both selected/);
    expect(() => oneSelected("list", [{ id: "a", selected: sel(1, 2) }, { id: "b", selected: sel(2) }])).not.toThrow();
    expect(() => oneSelected("list", [{ id: "a", selected: sel(1, 2) }, { id: "b", selected: sel(1.5, 3) }], true)).not.toThrow();
    const ctx = ctxOf("graphite");
    expect(() => BLOCKS.uiWindow({ id: "w", rows: [{ ...rows[0]!, selected: sel(0) }, { ...rows[1]!, selected: sel(1) }], at: 0 }, ctx)).toThrow(/both selected/);
  });
  test("separate listRow calls in one column: two selected at once throw; another column, or multi, does not", () => {
    const ctx = ctxOf("graphite");
    const row = (id: string, y: number, x = 140, more = {}) => BLOCKS.listRow({ id, x, y, w: 760, title: id, selected: [{ at: 1, until: 3 }], at: 0, ...more }, ctx);
    row("a", 400);
    expect(() => row("b", 520)).toThrow(/both selected/);
    expect(() => row("c", 640, 150)).not.toThrow();
    expect(() => row("d", 760, 140, { multi: true })).not.toThrow();
  });
});

// An agent's Graphite film: two screens of one window had to crossfade, and their texts and avatars crossed for
// 0.27 s (five declarations). A window that `replaces` another hands over with no frame that shows both.
describe("a window replaces another: the next screen of one app window", () => {
  const { valueAt } = require("../time") as typeof import("../time");
  const shownAt = (ctx: Ctx, n: Node, f: number) => (n.tracks?.opacity?.length ? valueAt(ctx.system, n.tracks.opacity, "opacity", f / 30) : 1);
  const content = (ns: Node[]) => ns.filter((n) => n.kind !== "anchor" && !/-(panel|bar-rule|tab-edge|side-rule)$/.test(n.id));
  for (const enter of [undefined, "cut"] as const) test(`${enter ?? "the designed swap"}: no frame shows the content of both screens, and the frame cuts on one frame`, () => {
    const ctx = ctxOf("graphite");
    const a = quiet(() => BLOCKS.uiWindow({ id: "a", title: "Orders", rows: [{ id: "a0", title: "Galen", initials: "GR" }, { id: "a1", title: "Iven", initials: "IN" }], at: 0 }, ctx));
    const b = quiet(() => BLOCKS.uiWindow({ id: "b", title: "Tomorrow", rows: [{ id: "b0", title: "Aven", initials: "AN" }, { id: "b1", title: "Knoll", initials: "GK" }], replaces: "a", ...(enter ? { enter } : {}), at: 4 }, ctx));
    for (let f = 90; f <= 150; f++) {
      const oldOn = content(a).some((n) => shownAt(ctx, n, f) > 0.01), newOn = content(b).some((n) => shownAt(ctx, n, f) > 0.01);
      expect([f, oldOn && newOn]).toEqual([f, false]);
      // The frame: exactly one panel shows on every frame.
      expect([f, [byId(a, "a-panel"), byId(b, "b-panel")].filter((n) => shownAt(ctx, n, f) > 0.99).length]).toEqual([f, 1]);
    }
    // With a cut, the new screen is whole on the frame that shows `at`.
    if (enter === "cut") expect(content(b).every((n) => shownAt(ctx, n, 121) > 0.99 || n.id.includes("-sel"))).toBe(true);
  });
  test("a window that names no window built before it throws, with the fix", () => {
    expect(() => quiet(() => BLOCKS.uiWindow({ id: "c", title: "X", replaces: "nope", at: 1 }, ctxOf("graphite")))).toThrow(/Build the window it replaces first/);
  });
});

describe("listRow: four fields, and the window's rows at 9:16", () => {
  test("a row with a detail takes two lines: the name, then the detail, the badge and the meta", () => {
    const ctx = ctxOf("graphite");
    const ns = quiet(() => BLOCKS.listRow({ id: "o", x: 121, y: 600, w: 657, title: "Iven Nash", detail: "Rye loaves", badge: { text: "×12" }, meta: "07:30", initials: "IN", at: 0 }, ctx));
    const name = byId(ns, "o-title"), detail = byId(ns, "o-detail");
    expect(detail.y).toBeGreaterThan(name.y);
    expect(detail.x).toBe(name.x);
  });
  test("under the text-safe foot the list runs on as row rules with no text, to the window's foot", () => {
    const ctx = ctxOf("graphite");
    const ns = quiet(() => BLOCKS.uiWindow({ id: "w", title: "Queue", rows: rows.slice(0, 3), at: 0 }, ctx));
    const panel = byId(ns, "w-panel"), more = ns.filter((n) => /^w-more\d+$/.test(n.id));
    expect(more.length).toBeGreaterThan(0);
    expect(ns.filter((n) => n.kind === "text").every((n) => (n as { y: number }).y < ctx.safe.bottom)).toBe(true);
    expect(ns.filter((n) => /^w-more\d+-/.test(n.id))).toEqual([]);
    void panel;
  });
});

describe("cursor ring and a button's done state", () => {
  test("ring sets the click ring's length; 0 draws none", () => {
    const ctx = ctxOf("graphite");
    const ring = (r?: number) => quiet(() => BLOCKS.cursor({ id: "c", path: [{ x: 500, y: 900, at: 0 }], clicks: [1], ...(r !== undefined ? { ring: r } : {}), at: 0 }, ctx)).filter((n) => n.id.startsWith("c-click"));
    expect(ring(0)).toEqual([]);
    const end = (ns: Node[]) => Math.max(...ns[0]!.tracks!.opacity!.map((k) => k.t));
    expect(end(ring(0.1))).toBeLessThan(end(ring()));
  });
  test("done: the call to action cuts to its done label after the click, never before it", () => {
    const ctx = ctxOf("graphite");
    const { valueAt } = require("../time") as typeof import("../time");
    const ns = quiet(() => BLOCKS.button({ id: "go", x: 300, y: 900, text: "Mark ready", press: [2], done: { at: 2.2, text: "Ready" }, at: 0 }, ctx));
    const on = (id: string, t: number) => valueAt(ctx.system, byId(ns, id).tracks!.opacity!, "opacity", t);
    expect([on("go-text", 2.1), on("go-done-text", 2.1), on("go-text", 2.4), on("go-done-text", 2.4)]).toEqual([1, 0, 0, 1]);
    expect(() => quiet(() => BLOCKS.button({ id: "x", x: 0, y: 0, text: "Send", press: [3], done: { at: 2, text: "Sent" }, at: 0 }, ctx))).toThrow(/before its press/);
  });
});
