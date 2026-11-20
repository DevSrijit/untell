// Tests for the motion vocabulary (vocabulary.ts) and the blocks that read it: photo, shape, title, text,
// ground. Also present() from frame 0 and the photo upscale check.
import { describe, expect, test } from "bun:test";
import { MEDIA } from "../media.gen";
import { SYSTEMS } from "../systems";
import { BLOCKS } from "./blocks";
import { photoUpscale, UPSCALE } from "./blocks/photo";
import { makeCtx, present } from "./context";
import { valueAt } from "./time";
import type { Node } from "./types";
import { TODAY, VOCABULARY, vocabulary } from "./vocabulary";

const ctxOf = (id: string) => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
};
const opacityAt = (id: string, n: Node, t: number) => valueAt(SYSTEMS.find((x) => x.id === id)!, n.tracks?.opacity, "opacity", t);
MEDIA["test-photo"] = { kind: "photo", width: 2000, height: 3000, subject: [0.3, 0.3, 0.7, 0.7], centre: [0.5, 0.5], grade: "spec", mask: null };
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };

describe("vocabulary", () => {
  test("a system the table does not name keeps today's behaviour", () => {
    const named = new Set(Object.keys(VOCABULARY));
    for (const s of SYSTEMS.filter((x) => !named.has(x.id))) expect(vocabulary(ctxOf(s.id))).toEqual(TODAY);
  });
  test("every named system exists", () => {
    for (const id of Object.keys(VOCABULARY)) expect(SYSTEMS.some((s) => s.id === id)).toBe(true);
  });
  test("Ma fades, Riso stamps opaque, Kinetic cuts its pictures", () => {
    expect(vocabulary(ctxOf("ma")).photo.enter).toBe("dissolve");
    expect(vocabulary(ctxOf("ma")).title).toBe("fade");
    expect(vocabulary(ctxOf("riso")).opaque).toBe(true);
    expect(vocabulary(ctxOf("kinetic")).photo.enter).toBe("cut");
  });
  test("opaque comes from System.opaque only: the table keeps no list of its own", () => {
    for (const s of SYSTEMS) expect(vocabulary(ctxOf(s.id)).opaque).toBe(s.opaque ?? false);
    for (const v of Object.values(VOCABULARY)) expect("opaque" in v).toBe(false);
  });
});

describe("present", () => {
  test("at 0 shows from frame 0", () => {
    expect(valueAt(SYSTEMS[0]!, present(0).opacity, "opacity", 0)).toBe(1);
    expect(valueAt(SYSTEMS[0]!, present(0, 2).opacity, "opacity", 2.1)).toBe(0);
  });
  test("at > 0 keeps its timing", () => {
    const k = present(1).opacity;
    expect(valueAt(SYSTEMS[0]!, k, "opacity", 1)).toBe(0);
    expect(valueAt(SYSTEMS[0]!, k, "opacity", 1 + 1 / 30)).toBe(1);
  });
});

describe("photo", () => {
  const base = { media: "test-photo", box: { x: 0, y: 0, w: 1000, h: 1500 }, motion: "still" as const };
  test("a cut shows on the first frame after `at` and leaves on the first frame after `until` (frameOf)", () => {
    const [n] = BLOCKS.photo({ ...base, at: 1, until: 2 }, ctxOf("spec"));
    expect(opacityAt("spec", n!, 31 / 30)).toBe(1);
    expect(opacityAt("spec", n!, 30 / 30)).toBe(0);
    expect(opacityAt("spec", n!, 60 / 30)).toBe(1);
    expect(opacityAt("spec", n!, 61 / 30)).toBe(0);
  });
  test("Ma dissolves by default; a stated enter wins", () => {
    const [n] = BLOCKS.photo({ ...base, at: 1 }, ctxOf("ma"));
    const mid = opacityAt("ma", n!, 1 + ctxOf("ma").dur.enter / 2);
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(0.99);
    const [c] = BLOCKS.photo({ ...base, at: 1, enter: "cut" }, ctxOf("ma"));
    expect(opacityAt("ma", c!, 1 + 1 / 30)).toBe(1);
  });
  test("a one-frame system always cuts, one frame after `at` as its text does", () => {
    const [n] = BLOCKS.photo({ ...base, at: 1, enter: "dissolve" }, ctxOf("raw"));
    const [t] = BLOCKS.text({ x: 100, y: 300, text: "Caption", role: "label", at: 1 }, ctxOf("raw"));
    for (const f of [29, 30, 31, 32]) expect(opacityAt("raw", n!, f / 30)).toBe(opacityAt("raw", t!, f / 30));
    expect(opacityAt("raw", n!, 31 / 30)).toBe(1);
  });
  test("at 0 shows from frame 0 in every system", () => {
    for (const s of SYSTEMS) expect(opacityAt(s.id, BLOCKS.photo({ ...base, at: 0 }, ctxOf(s.id))[0]!, 0)).toBe(1);
  });
  test("the upscale is cover x zoom x push", () => {
    expect(photoUpscale({ width: 1000, height: 1000 }, { w: 1100, h: 500 }, { motion: "push", amount: 0.1, zoom: 1 })).toBeCloseTo(1.21, 5);
    expect(photoUpscale({ width: 1000, height: 1000 }, { w: 1000, h: 1000 }, { motion: "drift", amount: 0.05 })).toBeCloseTo(1.1, 5);
  });
  test("over the limit it throws when UPSCALE.throws is set, and names the size it needs", () => {
    UPSCALE.throws = true;
    try {
      expect(() => BLOCKS.photo({ ...base, box: { x: 0, y: 0, w: 2600, h: 3900 }, at: 0 }, ctxOf("spec"))).toThrow(/2600 x 3900 px/);
      expect(() => quiet(() => BLOCKS.photo({ ...base, at: 0 }, ctxOf("spec")))).not.toThrow();
    } finally { UPSCALE.throws = false; }
  });
  test("a circle crop is a centred square with a full radius", () => {
    const [n] = BLOCKS.photo({ ...base, shape: "circle", at: 0 }, ctxOf("pop"));
    expect(n).toMatchObject({ kind: "image", x: 0, y: 250, w: 1000, h: 1000, radius: 500 });
  });
  test("a figure keeps its window, rule and label inside the box", () => {
    const ctx = ctxOf("spec");
    const box = { x: 100, y: 300, w: 800, h: 700 };
    const nodes = quiet(() => BLOCKS.photo({ ...base, box, frame: "figure", label: "FIG. 1", at: 0 }, ctx));
    const img = nodes.find((n) => n.kind === "image")!;
    const label = nodes.find((n) => n.kind === "text") as Extract<Node, { kind: "text" }>;
    expect(img).toMatchObject({ x: 100, y: 300, w: 800 });
    expect(label.y + ctx.lineHeight("label")).toBeLessThanOrEqual(box.y + box.h);
    expect(label.y).toBeGreaterThanOrEqual((img as { y: number; h: number }).y + (img as { h: number }).h);
  });
});

describe("shape, title, text, ground", () => {
  test("a shape fades in Ma and stamps in Riso", () => {
    const sq = { kind: "square" as const, x: 0, y: 0, w: 100, h: 100, at: 1 };
    const ma = BLOCKS.shape(sq, ctxOf("ma"))[0]!;
    expect(ma.tracks?.scale).toBeUndefined();
    expect(opacityAt("ma", ma, 1 + ctxOf("ma").dur.enter / 2)).toBeLessThan(0.99);
    const riso = BLOCKS.shape({ ...sq, enter: "slide" }, ctxOf("riso"))[0]!;
    expect(opacityAt("riso", riso, 1 + 1 / 30)).toBe(1);
  });
  test("title lines leave together", () => {
    const nodes = quiet(() => BLOCKS.title({ x: 100, y: 300, w: 800, text: ["One line", "Two line", "Three"], role: "headline", at: 1, until: 3 }, ctxOf("spec")));
    const ends = nodes.map((n) => n.tracks!.opacity!.at(-1)!.t);
    expect(new Set(ends).size).toBe(1);
  });
  test("Ma's title fades as one unit; a cut title shows in one frame", () => {
    const fade = quiet(() => BLOCKS.title({ x: 100, y: 300, w: 800, text: "A quiet line", at: 1 }, ctxOf("ma")));
    expect(fade.every((n) => n.kind === "text" && !n.mask)).toBe(true);
    const cut = quiet(() => BLOCKS.title({ x: 100, y: 300, w: 800, text: "A loud line", reveal: "cut", at: 1 }, ctxOf("spec")));
    expect(opacityAt("spec", cut[0]!, 1 + 1 / 30)).toBe(1);
  });
  test("text cuts in an opaque system", () => {
    const [n] = BLOCKS.text({ x: 100, y: 300, text: "Ink", role: "body", at: 1 }, ctxOf("cutout"));
    expect(opacityAt("cutout", n!, 1 + 1 / 30)).toBe(1);
    expect(opacityAt("cutout", n!, 1)).toBe(0);
  });
  test("ground is a full-frame fill under the plates", () => {
    const [g] = BLOCKS.ground({ color: "accent", at: 2, until: 4 }, ctxOf("kinetic"));
    expect(g).toMatchObject({ kind: "rect", x: 0, y: 0, w: 1080, h: 1920, layer: -2 });
    expect(opacityAt("kinetic", g!, 2 + 1 / 30)).toBe(1);
    expect(opacityAt("kinetic", g!, 4 + 1 / 30)).toBe(0);
  });
});

describe("fitText, wordSeries, lockup, endCard", () => {
  test("fitText fills the width with one factor and stays safe", () => {
    const ctx = ctxOf("spec");
    const S = ctx.safe;
    const nodes = BLOCKS.fitText({ text: ["Big", "Bigger"], x: S.left, y: S.top + 100, w: S.right - S.left, h: 1000, at: 0 }, ctx);
    const ks = nodes.map((n) => n.tracks!.scale![0]!.v);
    expect(new Set(ks).size).toBe(1);
    expect(ks[0]!).toBeGreaterThan(1);
  });
  test("wordSeries keeps one left edge, one baseline and one scale, and never overlaps", () => {
    const ctx = ctxOf("kinetic");
    const nodes = BLOCKS.wordSeries({ words: [{ text: "Fast", at: 1 }, { text: "Faster", at: 1.5 }, { text: "Fastest", at: 2 }], x: 100, y: 600, w: 800, h: 400, until: 3 }, ctx) as Extract<Node, { kind: "text" }>[];
    expect(new Set(nodes.map((n) => n.x)).size).toBe(1);
    expect(new Set(nodes.map((n) => n.y)).size).toBe(1);
    for (const t of [1.2, 1.7, 2.5]) expect(nodes.filter((n) => opacityAt("kinetic", n, t) > 0).length).toBe(1);
  });
  test("lockup centres one unit on its axis", () => {
    const ctx = ctxOf("spec");
    const nodes = BLOCKS.lockup({ name: "Vorlinde", line: "A fictional studio", mark: "square", axis: "row", x: 100, y: 500, w: 880, at: 0 }, ctx);
    const mark = nodes.find((n) => n.id === "lockup-mark-box") as Extract<Node, { kind: "anchor" }>;
    const name = nodes.find((n) => n.id === "lockup-name-box") as Extract<Node, { kind: "anchor" }>;
    expect(mark.x + mark.w).toBeLessThan(name.x);
    expect(Math.abs(mark.y + mark.h / 2 - (name.y + name.h / 2))).toBeLessThan(1);
  });
  test("endCard is fully on at its landing time and warns on a short hold", () => {
    for (const id of ["spec", "ma", "kinetic", "riso", "console"]) {
      const ctx = ctxOf(id);
      const nodes = quiet(() => BLOCKS.endCard({ name: "Vorlinde", line: "Out now", at: 5, until: 8 }, ctx));
      // Fully readable on the landing frame: within 0.5 % of full. The eased tail of the fade now ends on that frame
      // (the card comes to rest there, as the ending check sees it), so the last 0.1 % may still be settling.
      for (const n of nodes.filter((n) => n.kind === "text")) expect(opacityAt(id, n, 5 + 1 / 30)).toBeGreaterThan(0.995);
    }
    let warned = "";
    const w = console.warn; console.warn = (m: string) => { warned += m; };
    try { BLOCKS.endCard({ name: "Vorlinde", at: 5, until: 5.5 }, ctxOf("spec")); } finally { console.warn = w; }
    expect(warned).toMatch(/at least 1.5 s/);
  });
});

describe("keys stay in time order", () => {
  test("every track of every new or changed block, in every system, short slots included", () => {
    const S = (id: string) => ctxOf(id);
    for (const sys of SYSTEMS) {
      const ctx = S(sys.id);
      const nodes: Node[] = quiet(() => [
        ...BLOCKS.photo({ media: "test-photo", box: { x: 0, y: 0, w: 800, h: 800 }, at: 1, until: 1.2 }, ctx),
        ...BLOCKS.photo({ media: "test-photo", box: { x: 0, y: 0, w: 800, h: 800 }, enter: "rise", exit: "rise", at: 1, until: 5 }, ctx),
        ...BLOCKS.shape({ kind: "circle", x: 0, y: 0, w: 100, h: 100, at: 1, until: 1.1 }, ctx),
        ...BLOCKS.title({ x: 100, y: 300, w: 800, text: "Two short words", at: 1, until: 1.1, exit: "fade" }, ctx),
        ...BLOCKS.title({ x: 100, y: 300, w: 800, text: "Two short words", reveal: "word", at: 1, until: 1.1 }, ctx),
        ...BLOCKS.text({ x: 100, y: 300, text: "Short", role: "body", at: 1, until: 3 }, ctx),
        ...BLOCKS.ground({ color: "accent", at: 1, until: 1.1 }, ctx),
        ...BLOCKS.fitText({ text: "Fit", x: 100, y: 300, w: 800, h: 400, at: 1, until: 1.1 }, ctx),
        ...BLOCKS.wordSeries({ words: [{ text: "a", at: 1 }, { text: "b", at: 1.1 }], x: 100, y: 300, w: 800, until: 1.2 }, ctx),
        ...BLOCKS.lockup({ name: "Vorlinde", mark: "triangle", x: 100, y: 300, w: 800, at: 1, until: 1.1 }, ctx),
        ...BLOCKS.endCard({ name: "Vorlinde", line: "Out now", at: 0.5, until: 3 }, ctx),
      ]);
      for (const n of nodes) for (const [prop, keys] of Object.entries(n.tracks ?? {})) {
        for (let i = 1; i < (keys ?? []).length; i++) {
          if (keys![i]!.t < keys![i - 1]!.t - 1e-9) throw new Error(`${sys.id} ${n.id} ${prop}: key ${i} at ${keys![i]!.t} before ${keys![i - 1]!.t}`);
        }
      }
    }
  });
});
