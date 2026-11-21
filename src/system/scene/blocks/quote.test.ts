// quote's emphasis: one word set apart in the true italic of the statement's face, else in the accent text colour,
// never in a slanted upright face. A statement with no emphasis gives the same nodes as before.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import { hasItalic, textStyle } from "../layout";
import type { TextNode } from "../types";
import { BLOCKS } from ".";

/** A context whose italic measure is narrower than its upright one, as many italics are. */
const ctxOf = (id: string, w = 1080, h = 1920) => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, w, h, (t, r, o) => t.length * s.type[r].size * Math.min(w, h) * (o?.italic ? 0.5 : 0.55));
};
const TEXT = "We stopped asking patients to repeat their history. Each nurse got an hour back.";
const build = (id: string, extra: Record<string, unknown> = {}) => {
  const ctx = ctxOf(id), S = ctx.safe;
  const said: string[] = [], warn = console.warn;
  console.warn = (...m: unknown[]) => { said.push(m.map(String).join(" ")); };
  try {
    const nodes = BLOCKS.quote({ id: "q", x: S.left, y: S.top, w: S.right - S.left, h: S.bottom - S.top, text: TEXT, name: "Sart Gre", job: "Head of Nursing", at: 0.4, ...extra } as never, ctx);
    return { ctx, nodes: nodes.filter((n): n is TextNode => n.kind === "text"), said };
  } finally { console.warn = warn; }
};
const line = (nodes: TextNode[], k: number) => nodes.filter((n) => n.id === `q-line-${k}` || n.id.startsWith(`q-line-${k}-`));

describe("quote emphasis", () => {
  test("no emphasis: no italic, no accent text and no runs", () => {
    for (const id of ["nocturne", "riso", "ma"]) {
      const { nodes } = build(id);
      expect(nodes.some((n) => n.italic || n.color === "accentText" || /-(em|after)$/.test(n.id))).toBe(false);
    }
  });
  test("a face with a true italic: the word is set in it, and the runs of its line join to the line", () => {
    expect(hasItalic(SYSTEMS.find((s) => s.id === "nocturne")!, "display")).toBe(true);
    const { ctx, nodes, said } = build("nocturne", { emphasis: "history." });
    expect(said).toEqual([]);
    const em = nodes.filter((n) => n.id.endsWith("-em"));
    expect(em.map((n) => [n.text, n.italic, n.color])).toEqual([["history.", true, "ink"]]);
    const k = Number(em[0]!.id.match(/q-line-(\d+)-em/)![1]);
    const runs = line(nodes, k);
    const plain = build("nocturne").nodes.find((n) => n.id === `q-line-${k}`)!;
    expect(runs.map((n) => n.text).join("")).toBe(plain.text);
    // Each run starts where the runs before it end, the emphasised one measured in its italic face.
    const sc = runs[0]!.tracks?.scale?.[0]?.v ?? 1;
    for (let i = 1; i < runs.length; i++) {
      const prev = runs[i - 1]!;
      expect(runs[i]!.x).toBeCloseTo(prev.x + ctx.measure(prev.text, prev.role, prev.italic ? { italic: true } : undefined) * sc, 6);
      expect([runs[i]!.y, runs[i]!.tracks]).toEqual([prev.y, prev.tracks]);
    }
  });
  test("a face with no italic: the word takes the accent text colour, never a slant", () => {
    const s = SYSTEMS.find((x) => x.id === "riso")!;
    expect(hasItalic(s, "display") || hasItalic(s, "headline")).toBe(false);
    const { nodes, said } = build("riso", { emphasis: "history." });
    expect(said).toEqual([]);
    expect(nodes.filter((n) => n.id.endsWith("-em")).map((n) => [n.text, n.italic, n.color])).toEqual([["history.", undefined, "accentText"]]);
  });
  test("no italic and an accent text that is the ink: the block says so and sets the word as the rest", () => {
    const { nodes, said } = build("ma", { emphasis: "history." });
    expect(said.some((m) => /has no italic for its \w+ face and its accent text is its ink colour/.test(m))).toBe(true);
    expect(nodes.some((n) => n.italic || /-(em|after)$/.test(n.id))).toBe(false);
  });
  test("an emphasis that is not in the statement is said", () => {
    const { said } = build("nocturne", { emphasis: "tomorrow" });
    expect(said.some((m) => m.includes('the emphasis "tomorrow" is not a word of the statement'))).toBe(true);
  });
  test("the word reveal: the emphasised words' nodes are italic, and the words after them move by the italic width", () => {
    const { nodes } = build("nocturne", { emphasis: "an hour", enter: "word" });
    const it = nodes.filter((n) => n.italic).map((n) => n.text);
    expect(it).toEqual(["an", "hour"]);
  });
  test("an italic on a face that has none throws", () => {
    const s = SYSTEMS.find((x) => x.id === "riso")!;
    expect(() => textStyle(s, { display: "a", text: "b", mono: "c" }, "display", 1080, false, undefined, true)).toThrow(/has no italic face/);
    const n = SYSTEMS.find((x) => x.id === "nocturne")!;
    expect(textStyle(n, { display: "a", text: "b", mono: "c" }, "display", 1080, false, undefined, true)).toMatchObject({ fontStyle: "italic", fontSynthesisStyle: "none" });
  });
});

