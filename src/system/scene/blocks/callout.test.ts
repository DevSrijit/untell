// Labels never touch a known outline: the callout keeps its label clear of gears, belt spans, dimensions and
// other labels, at every place it passes, and the drivetrain sample proves it in four systems at two sizes.
import { describe, expect, test } from "bun:test";
import { scene as drivetrain } from "../../../../examples/scenes/drivetrain";
import { SYSTEMS } from "../../systems";
import { makeCtx, textSafe } from "../context";
import type { Node, TextNode } from "../types";
import { BLOCKS } from ".";
import { belt } from "./belt";
import { callout, crosses, followPath, outlinesOf } from "./callout";
import { gear } from "./gear";

/** A context whose measure is a little wider than the real fonts, so a pass here leaves room in a render. */
const ctxOf = (id: string, w = 1080, h = 1920) => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * Math.min(w, h) * 0.62);
};

/** Every text node's box at every place its x and y tracks take it. */
function textBoxes(ctx: ReturnType<typeof ctxOf>, nodes: Node[]) {
  return nodes.filter((n): n is TextNode => n.kind === "text").flatMap((n) => {
    const w = ctx.measure(n.text, n.role, n.keepCase ? { keepCase: true } : undefined), h = ctx.lineHeight(n.role);
    const x = n.align === "center" && n.width ? n.x + (n.width - w) / 2 : n.align === "right" && n.width ? n.x + n.width - w : n.x;
    return followPath({ x: n.tracks?.x, y: n.tracks?.y }).map(([dx, dy]) => ({ id: n.id, box: { x: x + dx, y: n.y + dy, w, h } }));
  });
}

describe("callout keeps clear of known outlines", () => {
  const ctx = ctxOf("schematic");
  const parts = [...gear({ id: "g", cx: 540, cy: 900, r: 200, teeth: 48, at: 0 }, ctx), ...belt({ id: "b", a: { x: 200, y: 900, r: 50 }, b: { x: 540, y: 900, r: 200 }, at: 0 }, ctx)];
  const geo = outlinesOf(parts);

  test("reads a gear's tip circle and a belt's two spans from their anchors", () => {
    expect(geo.circles.length).toBe(1);
    expect(geo.circles[0]!.r).toBeGreaterThan(200);
    expect(geo.segments.length).toBe(2);
  });

  test("a label placed on the gear moves to a clear place", () => {
    const nodes = callout({ id: "c", label: "LINK 12.7 mm", target: { x: 540, y: 700 }, x: 480, y: 720, avoid: parts, at: 0 }, ctx);
    const label = nodes.find((n) => n.id === "c-label")!;
    expect(label.kind === "anchor" && crosses(label, geo, 0)).toBe(false);
  });

  test("a label with no clear place near throws", () => {
    // A gear that fills the safe area: no place within reach is clear of it.
    const big = gear({ id: "big", cx: 540, cy: 960, r: 900, teeth: 96, at: 0 }, ctx);
    expect(() => callout({ id: "c", label: "RING", target: { x: 540, y: 900 }, x: 500, y: 900, avoid: big, at: 0 }, ctx)).toThrow(/crosses a known outline/);
  });

  test("a label placed by the block keeps clear of the gear and the belt", () => {
    const nodes = callout({ id: "c", label: "RING 48 T", target: { x: 540 + 200 * Math.cos(-0.5), y: 900 + 200 * Math.sin(-0.5) }, avoid: parts, at: 0 }, ctx);
    const label = nodes.find((n) => n.id === "c-label")!;
    expect(label.kind === "anchor" && crosses(label, geo, 0)).toBe(false);
  });

  test("a following label is checked along its whole way, and names the box it sweeps", () => {
    const follow = { x: [{ t: 0, v: 0 }, { t: 1, v: 0 }, { t: 3, v: 300, curve: "linear" as const }] };
    const nodes = callout({ id: "c", label: "LINK", target: { x: 150, y: 700 }, x: 100, y: 560, follow, avoid: parts, at: 0 }, ctx);
    const sweep = nodes.find((n) => n.id === "c-sweep")!;
    expect(sweep.kind === "anchor" && sweep.w).toBeGreaterThan(300);
    const text = nodes.find((n) => n.kind === "text") as TextNode;
    for (const [dx, dy] of followPath(follow)) expect(crosses({ x: text.x + dx, y: text.y + dy, w: ctx.measure("LINK", "label", { keepCase: true }), h: ctx.lineHeight("label") }, geo, 0)).toBe(false);
  });
});

describe.each(["schematic", "spec", "console", "pop"].flatMap((s) => [[s, 1080, 1920], [s, 1920, 1080]] as const))("the drivetrain sample in %s at %ix%i", (sys, w, h) => {
  test("no text box crosses a gear's outline or a belt span, wherever it moves", () => {
    const ctx = ctxOf(sys, w, h);
    const nodes = drivetrain(ctx, BLOCKS);
    // The drawn outlines: the two gears' tip circles and the chain's two spans.
    const lines = { circles: outlinesOf(nodes).circles, segments: outlinesOf(nodes.filter((n) => n.id.startsWith("chain-"))).segments, boxes: [] };
    expect(lines.circles.length).toBe(2);
    expect(lines.segments.length).toBe(2);
    const hits = textBoxes(ctx, nodes).filter((t) => crosses(t.box, lines, 0));
    expect(hits.map((t) => t.id)).toEqual([]);
    // And no two texts of different blocks touch, at any place they pass.
    const boxes = textBoxes(ctx, nodes);
    const block = (id: string) => id.split("-").slice(0, id.startsWith("sheet-tb") ? 3 : 1).join("-");
    const meet = boxes.flatMap((a) => boxes.filter((b) => block(a.id) !== block(b.id) && a.box.x < b.box.x + b.box.w && b.box.x < a.box.x + a.box.w && a.box.y < b.box.y + b.box.h && b.box.y < a.box.y + a.box.h).map((b) => `${a.id} / ${b.id}`));
    expect([...new Set(meet)]).toEqual([]);
    // And no leader of a callout runs through a text of another block, wherever both are.
    const leaders = nodes.filter((n) => n.kind === "path" && n.id.endsWith("-leader")).flatMap((n) => {
      const [x1, y1, x2, y2] = (n as { d: string }).d.match(/-?\d+(\.\d+)?/g)!.map(Number) as [number, number, number, number];
      return followPath({ x: n.tracks?.x, y: n.tracks?.y }).map(([dx, dy]) => ({ id: n.id, seg: [[x1 + dx, y1 + dy], [x2 + dx, y2 + dy]] as [[number, number], [number, number]] }));
    });
    const cut = boxes.flatMap((t) => leaders.filter((l) => block(l.id) !== block(t.id) && crosses(t.box, { circles: [], segments: [l.seg], boxes: [] }, 0)).map((l) => `${l.id} / ${t.id}`));
    expect([...new Set(cut)]).toEqual([]);
  });
});

describe("short leaders outside the drawing", () => {
  const ctx = ctxOf("schematic", 1920, 1080);
  const parts = [...gear({ id: "g", cx: 1200, cy: 560, r: 200, teeth: 48, at: 0 }, ctx), ...gear({ id: "h", cx: 600, cy: 560, r: 50, teeth: 12, at: 0 }, ctx)];
  const outside = { x: 540, y: 350, w: 870, h: 420 };
  const leader = (nodes: Node[]) => { const a = nodes.find((n) => n.id.endsWith("-leader-line")); return a && a.kind === "anchor" ? Math.hypot(Number(a.data!.x2) - Number(a.data!.x1), Number(a.data!.y2) - Number(a.data!.y1)) : 0; };
  const labelBox = (nodes: Node[]) => { const a = nodes.find((n) => n.id.endsWith("-label"))!; if (a.kind !== "anchor") throw new Error("no label"); return a; };

  test("with outside, the label sits outside the drawing, on the side nearest its target, with a short leader", () => {
    const n = callout({ id: "c", label: "RING 48 T", target: { x: 1200, y: 350 + 6 }, outside, avoid: parts, at: 0 }, ctx);
    const b = labelBox(n);
    expect(b.y + b.h).toBeLessThanOrEqual(outside.y);
    expect(leader(n)).toBeLessThan(3 * ctx.lineHeight("label"));
  });

  // A given place is the scene's decision: the block never moves it for its leader (a label that moved by itself took an
  // agent two check runs to find). It throws, and names the maxLeader that keeps the place and the place it would pick.
  test("a given place with a long diagonal leader throws, and names both fixes", () => {
    expect(() => callout({ id: "c", label: "COG 12 T", target: { x: 600, y: 510 }, x: 80, y: 200, outside, avoid: parts, at: 0 }, ctx))
      .toThrow(/longer than maxLeader \d+ px\. Give maxLeader: \d+ to keep that place, or leave out x and y: the block then places the label at/);
    const n = callout({ id: "c", label: "COG 12 T", target: { x: 600, y: 510 }, outside, avoid: parts, at: 0 }, ctx);
    expect(leader(n)).toBeLessThanOrEqual(510 - outside.y + 3 * ctx.lineHeight("label") + 1);
  });

  test("a given place with a short leader stays where the scene put it", () => {
    const n = callout({ id: "c", label: "COG", target: { x: 600, y: 300 }, x: 560, y: 220, at: 0 }, ctx);
    expect(labelBox(n)).toMatchObject({ x: 560, y: 220 });
  });

  test("maxLeader caps the leader", () => {
    expect(() => callout({ id: "c", label: "COG", target: { x: 600, y: 300 }, x: 560, y: 220, maxLeader: 10, at: 0 }, ctx)).toThrow(/maxLeader/);
  });
});

// An agent's case (Spec): `hit({ on })` on a callout fired when its label arrived, before its leader
// had drawn. "Arrived" is the frame after the LAST part of the block has come to rest.
import { revealedAt } from "../beats";
import { valueAt } from "../time";
describe("revealedAt: a block with many parts has arrived when its last part has", () => {
  for (const id of ["spec", "schematic", "graphite"]) {
    test(`${id}: a callout's arrival is after its leader has drawn`, () => {
      const ctx = ctxOf(id);
      const nodes = callout({ id: "c1", number: 1, label: "MAIN CABLE", target: { x: 700, y: 1000 }, at: 1 }, ctx);
      const arrived = revealedAt(ctx.system, nodes, "c1");
      for (const n of nodes) {
        if (n.kind === "anchor" || !n.tracks) continue;
        for (const [p, keys] of Object.entries(n.tracks)) {
          if (!keys?.length) continue;
          // No track of any part still changes from the arrival frame on.
          const v0 = valueAt(ctx.system, keys, p as never, arrived);
          for (let f = 1; f <= 20; f++) expect(Math.abs(valueAt(ctx.system, keys, p as never, arrived + f / 30) - v0)).toBeLessThan(1e-3);
        }
      }
      // And the hit's peak frame is that frame.
      const draws = nodes.flatMap((n) => (n.kind !== "anchor" && n.tracks?.draw ? [n.tracks.draw] : []));
      if (draws.length) expect(arrived).toBeGreaterThanOrEqual(Math.max(...draws.map((d) => d[d.length - 1]!.t)) - 1 / 30);
    });
  }
});

describe("revealedAt on other blocks with many parts (item 8)", () => {
  // No track of any part of the block changes from the arrival frame until its exit.
  const still = (ctx: ReturnType<typeof ctxOf>, nodes: Node[], id: string) => {
    const arrived = revealedAt(ctx.system, nodes, id);
    for (const n of nodes) {
      if (n.kind === "anchor" || n.kind === "audio" || !n.tracks) continue;
      for (const [p, keys] of Object.entries(n.tracks)) {
        if (!keys?.length) continue;
        const v0 = valueAt(ctx.system, keys, p as never, arrived);
        for (let f = 1; f <= 10; f++) expect(Math.abs(valueAt(ctx.system, keys, p as never, arrived + f / 30) - v0), `${n.id}.${p}`).toBeLessThan(1e-3);
      }
    }
    return arrived;
  };
  test("dimension: its line, ticks and value", () => {
    const ctx = ctxOf("spec");
    const nodes = BLOCKS.dimension({ id: "d", from: { x: 200, y: 900 }, to: { x: 800, y: 900 }, offset: 60, text: "600 mm", at: 1 }, ctx);
    expect(still(ctx, nodes, "d")).toBeGreaterThan(1);
  });
  test("terminal: the last row of output", () => {
    const ctx = ctxOf("console");
    const q = <T,>(f: () => T) => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
    const nodes = q(() => BLOCKS.terminal({ id: "t", x: 130, y: 400, w: 820, session: [{ command: "ls", output: ["a.txt", "b.txt"] }], at: 0.5 }, ctx));
    expect(still(ctx, nodes, "t")).toBeGreaterThan(0.5);
  });
});

// A first-use test: formula with place "below" centred its text on a point near the frame's side and ran past the
// safe edge. Centred on the point's x, it now slides into the text-safe area; left and right slide along y.
describe("formula keeps inside the text-safe area along its centred axis", () => {
  for (const id of ["primary", "spec", "schematic"]) test(id, () => {
    const ctx = ctxOf(id);
    const S = ctx.safe;
    const said: string[] = [];
    const w = console.warn; console.warn = (m: string) => said.push(String(m));
    try {
      for (const [place, x, y] of [["below", S.right - 10, 600], ["above", S.left + 5, 900], ["center", S.right, 700], ["right", S.left + 10, S.top + 2], ["right", S.left, S.bottom - 4], ["left", S.right, S.top]] as const) {
        const text = y > S.lowBandTop ? "10 MM" : "1 CM = 10 MM"; // the lower band takes a shorter line
        const ns = BLOCKS.formula({ id: "f", text, role: "headline", x, y, place, at: 0 }, ctx);
        const t = ns.find((n): n is TextNode => n.kind === "text")!;
        const box = { x: t.x, y: t.y, w: ctx.measure(t.text, t.role, { keepCase: true }), h: ctx.lineHeight(t.role) };
        expect([place, y, textSafe(ctx, box, t.role)]).toEqual([place, y, true]);
      }
    } finally { console.warn = w; }
    expect(said.filter((m) => /leaves the text-safe area/.test(m))).toEqual([]);
  });
});
