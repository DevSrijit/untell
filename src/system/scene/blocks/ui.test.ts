// The ui kit makes no stock window chrome, fits its text without a cut word, and clicks clear of letters.
// The terminal sets bold commands over regular output where the system loads both weights.
import { describe, expect, test } from "bun:test";
import { scene as uiScene } from "../../../../examples/scenes/ui";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import { loadedWeights, textStyle, weightOf } from "../layout";
import type { Ctx, Node, TextNode } from "../types";
import * as INDEX from ".";
import { BLOCKS } from ".";
import { pane } from "./pane";
import { terminal, terminalWeights } from "./terminal";
import { aimAt, arrowBox, listRow, listRowLayout, listRowsStack, nodeBox, tab, uiWindow, windowHead, windowHeadHeight } from "./ui";
import { fitWords } from "./util";

/** A context whose measure is a little wider than the real fonts, so a pass here leaves room in a render. */
const ctxOf = (id: string, w = 1080, h = 1920, k = 0.58): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r, o) => t.length * s.type[r].size * Math.min(w, h) * k * (o?.weight && o.weight > s.type[r].weight ? 1.06 : 1));
};
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const texts = (nodes: Node[]) => nodes.filter((n): n is TextNode => n.kind === "text");
const meets = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("window chrome", () => {
  test.each(SYSTEMS.map((s) => [s.id]))("%s: uiWindow, pane and terminal draw no title-bar dots", (id) => {
    const ctx = ctxOf(id);
    const nodes = quiet(() => [
      ...uiWindow({ id: "w", x: 120, y: 300, w: 760, h: 600, title: "Queue", at: 0 }, ctx),
      ...pane({ id: "p", x: 120, y: 1000, w: 760, h: 300, title: "build.log", at: 0 }, ctx),
      ...terminal({ id: "t", x: 120, y: 1350, w: 760, h: 300, session: [{ command: "make", output: ["ok"] }], at: 0 }, ctx),
    ]);
    expect(nodes.some((n) => n.kind === "circle")).toBe(false);
    expect(nodes.some((n) => /dot/.test(n.id))).toBe(false);
  });

  test("each system draws its own head from its tokens", () => {
    expect(windowHead(ctxOf("graphite"))).toBe("title");
    expect(windowHead(ctxOf("spec"))).toBe("title");
    expect(windowHead(ctxOf("console"))).toBe("tabs");
    expect(windowHead(ctxOf("studio"))).toBe("none");
    expect(windowHead(ctxOf("pop"))).toBe("none");
  });

  test("a head of none draws only the panel; the content starts at the window's top", () => {
    const ctx = ctxOf("studio");
    const n = uiWindow({ id: "w", x: 100, y: 200, w: 800, h: 500, title: "Queue", at: 0 }, ctx);
    expect(texts(n).length).toBe(0);
    expect(n.find((x) => x.id === "w-content")).toMatchObject({ y: 200, h: 500 });
    expect(windowHeadHeight(ctx)).toBe(0);
  });

  test("a title head sets the title on the left inset over a full-width rule; a tab head opens the rule under the tab", () => {
    const g = uiWindow({ id: "w", x: 100, y: 200, w: 800, h: 500, title: "Queue", at: 0 }, ctxOf("graphite"));
    const t = g.find((x) => x.id === "w-title") as TextNode;
    expect(t.x).toBeLessThan(100 + 800 / 4);
    expect(g.find((x) => x.id === "w-bar-rule")).toMatchObject({ kind: "path" });
    expect((g.find((x) => x.id === "w-bar-rule") as { d: string }).d).toStartWith("M100 ");
    const c = uiWindow({ id: "w", x: 100, y: 200, w: 800, h: 500, title: "Queue", at: 0 }, ctxOf("console"));
    expect(c.find((x) => x.id === "w-tab-edge")).toBeDefined();
    expect((c.find((x) => x.id === "w-bar-rule") as { d: string }).d).not.toStartWith("M100 ");
  });
});

describe("listRow fits its text", () => {
  const props = { id: "r", x: 140, y: 400, w: 740, initials: "QN", meta: "Wed 14:30", badge: { text: "cone 10" }, at: 0 };

  test("a name with room keeps every letter, with its badge and meta", () => {
    const ctx = ctxOf("graphite");
    const n = listRow({ ...props, title: "Porcelain bowls" }, ctx);
    expect(texts(n).find((x) => x.id === "r-title")!.text).toBe("Porcelain bowls");
    expect(texts(n).find((x) => x.id === "r-meta")!.text).toBe("Wed 14:30");
    expect(texts(n).some((x) => x.text.includes("…"))).toBe(false);
  });

  test("the name gets the room left after the trailing cells, and no text overlaps", () => {
    // Widths for Graphite's small text in caption (its label is under the phone floor: ui.ts smallRole).
    for (const w of [860, 650, 540]) {
      const ctx = ctxOf("graphite");
      const n = quiet(() => listRow({ ...props, w, title: "Porcelain bowls" }, ctx));
      const boxes = texts(n).map((t) => nodeBox(ctx, t)!);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(meets(boxes[i]!, boxes[j]!)).toBe(false);
      for (const b of boxes) expect(b.x + b.w).toBeLessThanOrEqual(props.x + w + 0.5);
    }
  });

  test("before it shortens anything, a row tightens its gaps, then sets its trailing cells on a second line", () => {
    const ctx = ctxOf("graphite");
    const L = quiet(() => listRowLayout(ctx, { ...props, w: 720, title: "Porcelain bowls" }));
    expect(L.stacked).toBe(true);
    expect(L.name).toBe("Porcelain bowls");
    expect(L.meta).toBe("Wed 14:30");
    expect(L.h).toBeGreaterThan(listRowLayout(ctx, { ...props, w: 1100, title: "Mugs" }).h);
  });

  test("on one line (stack: false), the meta shortens at a word boundary before the name does", () => {
    const ctx = ctxOf("graphite");
    const L = quiet(() => listRowLayout(ctx, { ...props, w: 950, stack: false, title: "Porcelain bowls" }));
    expect(L.stacked).toBe(false);
    expect(L.meta).toBe("Wed…");
    expect(L.name).toBe("Porcelain bowls");
  });

  test("a name shortens only at a word boundary, never mid-word", () => {
    const ctx = ctxOf("graphite");
    const L = quiet(() => listRowLayout(ctx, { ...props, w: 640, title: "Porcelain bowls for the north shelf" }));
    expect(L.nameCut).toBe(true);
    const kept = L.name.replace(/…$/, "");
    expect("Porcelain bowls for the north shelf".startsWith(kept)).toBe(true);
    expect("Porcelain bowls for the north shelf"[kept.length]).toBe(" ");
  });

  test("a row that cannot hold its first word throws", () => {
    expect(() => quiet(() => listRow({ ...props, w: 380, title: "Stoneware" }, ctxOf("graphite")))).toThrow(/does not fit|widen the row/);
    expect(() => quiet(() => listRow({ ...props, w: 380, meta: undefined, badge: undefined, title: "Stoneware" }, ctxOf("graphite")))).toThrow(/does not fit/);
  });

  test("every avatar has one size, so the names of a list share one left edge", () => {
    const ctx = ctxOf("graphite");
    const xs = ["QN", "ZU", "IL"].map((ini) => (listRow({ ...props, title: "Mugs", initials: ini }, ctx).find((x) => x.id === "r-title") as TextNode).x);
    expect(new Set(xs).size).toBe(1);
    expect(() => listRow({ ...props, title: "Mugs", initials: "MWMW" }, ctx)).toThrow(/two letters/);
  });

  test("the avatar is wide enough for its initials", () => {
    const ctx = ctxOf("graphite");
    const n = listRow({ ...props, title: "Mugs", initials: "MW" }, ctx);
    const ring = n.find((x) => x.id === "r-avatar") as { r: number };
    expect(2 * ring.r).toBeGreaterThan(ctx.measure("MW", "label") + ctx.size("label") * 0.5);
  });

  test("fitWords keeps whole words or returns null", () => {
    const m = (t: string) => t.length * 10;
    expect(fitWords("one two three", 200, m)).toEqual({ text: "one two three", cut: false });
    expect(fitWords("one two three", 85, m)).toEqual({ text: "one two…", cut: true });
    expect(fitWords("onetwothree", 50, m)).toBeNull();
  });

  test("the tab bar's rule spans the width it is given, and throws when the tabs pass it", () => {
    const ctx = ctxOf("graphite");
    const n = tab({ id: "t", x: 100, y: 100, w: 700, tabs: ["Queue", "Firing"], active: [{ index: 0, at: 0 }], at: 0 }, ctx);
    expect((n.find((x) => x.id === "t-rule") as { d: string }).d).toEndWith("H800");
    expect(() => tab({ id: "t", x: 100, y: 100, w: 80, tabs: ["Queue", "Firing"], active: [{ index: 0, at: 0 }], at: 0 }, ctx)).toThrow(/tabs need/);
  });
});

test("the ui scene keeps every name whole in four systems at both sizes, with one row height", () => {
  for (const id of ["graphite", "studio", "pop", "console"]) for (const [w, h] of [[1080, 1920], [1920, 1080]] as const) {
    const ctx = ctxOf(id, w, h, 0.52);
    const nodes = quiet(() => uiScene(ctx, BLOCKS));
    expect(texts(nodes).filter((n) => /^row\d-title$/.test(n.id)).map((n) => n.text)).toEqual(["Stoneware mugs", "Porcelain bowls", "Glaze tests"]);
    expect(texts(nodes).some((n) => n.text.includes("…"))).toBe(false);
    const hs = new Set(nodes.filter((n) => /^row\d-box$/.test(n.id)).map((n) => (n as { h: number }).h));
    expect(hs.size).toBe(1);
  }
  expect(listRowsStack(ctxOf("graphite"), [{ x: 0, w: 2000, title: "Mugs" }])).toBe(false);
});

describe("cursor clicks clear of letters", () => {
  test.each([["graphite", 1080, 1920], ["graphite", 1920, 1080], ["studio", 1080, 1920], ["pop", 1080, 1920], ["console", 1920, 1080]] as const)(
    "%s %ix%i: the arrow at rest covers no text, and the tip is on the part it clicks", (id, w, h) => {
      const ctx = ctxOf(id, w, h);
      const nodes = quiet(() => uiScene(ctx, BLOCKS));
      const boxes = texts(nodes).map((t) => nodeBox(ctx, t)!);
      for (const [k, part] of [[1, "row1-box"], [2, "app-action-box"]] as const) {
        const tip = nodes.find((n) => n.id === `cursor-tip:${k}`)!;
        if (tip.kind !== "anchor") throw new Error("no tip");
        const arrow = arrowBox(ctx, tip.x, tip.y);
        for (const b of boxes) expect(meets(arrow, b)).toBe(false);
        const p = nodes.find((n) => n.id === part)!;
        if (p.kind !== "anchor") throw new Error("no part");
        expect(tip.x).toBeGreaterThan(p.x); expect(tip.x).toBeLessThan(p.x + p.w);
        expect(tip.y).toBeGreaterThan(p.y); expect(tip.y).toBeLessThan(p.y + p.h);
      }
    });

  test("it aims at the lower right of a button, right of its label", () => {
    const ctx = ctxOf("graphite");
    const b = BLOCKS.button({ id: "b", x: 200, y: 400, text: "Start firing", at: 0 }, ctx);
    const tip = aimAt(ctx, b, "b-box");
    const label = nodeBox(ctx, b.find((n) => n.id === "b-text")!)!;
    const box = b.find((n) => n.id === "b-box")!;
    if (box.kind !== "anchor") throw new Error("no box");
    expect(tip.x).toBeGreaterThan(label.x + label.w);
    expect(tip.y).toBeGreaterThan(box.y + box.h / 2);
  });

  test("an unknown target throws and names the fix", () => {
    expect(() => aimAt(ctxOf("graphite"), [], "nope")).toThrow(/targets/);
  });
});

describe("terminal weight split", () => {
  test("weights come from the fonts the system loads", () => {
    const c = SYSTEMS.find((s) => s.id === "console")!, sp = SYSTEMS.find((s) => s.id === "spec")!;
    expect(loadedWeights(c, "body")).toEqual([400, 700]);
    expect(loadedWeights(sp, "label")).toEqual([400]);
    expect(() => weightOf(sp, "label", 700)).toThrow(/weights 400 only/);
    expect(weightOf(c, "body", 700)).toBe(700);
    expect(textStyle(c, { display: "a", text: "a", mono: "a" }, "body", 1080, false, 700).fontWeight).toBe(700);
  });

  test("Console: commands bold, output regular; Manual: one weight, as before", () => {
    const run = (id: string) => terminal({ id: "t", x: 100, y: 300, w: 860, h: 600, session: [{ command: "ls -la", output: ["total 0"] }], at: 0 }, ctxOf(id));
    const c = run("console");
    const cmd = texts(c).filter((n) => n.id.includes("-cmd-"));
    expect(cmd.length).toBeGreaterThan(0);
    expect(cmd.every((n) => n.weight === 700)).toBe(true);
    expect(texts(c).filter((n) => !n.id.includes("-cmd-")).every((n) => n.weight === undefined)).toBe(true);
    // Manual sets code in IBM Plex Mono, which it loads in 400 only: no split.
    expect(texts(run("manual")).every((n) => n.weight === undefined)).toBe(true);
    expect(terminalWeights(SYSTEMS.find((s) => s.id === "console")!, "headline")).toEqual({ output: 400 });
  });
});

test("the blocks index exports musicFrom, so a reel needs no deep import", () => {
  expect(typeof (INDEX as Record<string, unknown>).musicFrom).toBe("function");
});

test("a selected row sets its meta in ink while selected: inkMuted does not keep 4.5:1 on the rule fill", async () => {
  const { contrast } = await import("../../color");
  const { colorOf } = await import("../layout");
  const ctx = ctxOf("graphite");
  const n = listRow({ id: "r", x: 100, y: 100, w: 1200, title: "Bowls", meta: "Wed", selected: [{ at: 2 }], at: 0 }, ctx);
  const on = n.find((x) => x.id === "r-meta-on") as TextNode;
  expect(on.color).toBe("ink");
  expect(contrast(colorOf(ctx.system, "ink"), colorOf(ctx.system, "rule"))).toBeGreaterThanOrEqual(4.5);
  expect(listRow({ id: "r", x: 100, y: 100, w: 1200, title: "Bowls", meta: "Wed", at: 0 }, ctx).some((x) => x.id === "r-meta-on")).toBe(false);
});

describe("terminal rows stay in ctx.safe with the default inset", () => {
  // Before: a terminal as wide as the picture-safe area set its rows 23 to 25 px left of ctx.safe at 9:16.
  const { textSafe } = require("../context") as typeof import("../context");
  const { pictureSafe } = require("./sheet") as typeof import("./sheet");
  const cases = SYSTEMS.flatMap((s) => [[s.id, 1080, 1920], [s.id, 1920, 1080]] as [string, number, number][]);
  test.each(cases)("%s at %dx%d: every row and the status line pass textSafe, at the text-safe width and the picture-safe width", (id, w, h) => {
    const ctx = ctxOf(id, w, h, 0.55);
    const P = pictureSafe(ctx);
    for (const box of [{ x: ctx.safe.left, w: ctx.safe.right - ctx.safe.left }, { x: P.x, w: P.w }]) {
      const nodes = quiet(() => terminal({ id: "t", x: box.x, y: ctx.safe.top, w: box.w, session: [{ command: "ls -la", output: ["total 0", "ok"] }], status: { left: "host", right: "12:00" }, at: 0 }, ctx));
      const out = texts(nodes).filter((n) => !textSafe(ctx, { x: n.x, y: n.y, w: ctx.measure(n.text, n.role), h: ctx.lineHeight(n.role) }, n.role));
      expect(out.map((n) => `${n.id} x=${Math.round(n.x)}`)).toEqual([]);
    }
  });
});
