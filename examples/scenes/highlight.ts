// The highlight scene: three facts, one after another in the same place, each with one kind of
// emphasis on its number: an underline, a marker, a loop.
// Facts: sound moves at 343 m/s in air at 20 °C; light reaches the Moon (384,400 km) in 1.28 s;
// water boils at 100 °C at sea level.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lines } from "../../src/system/scene/context";
import { inkOf, wordBox, type HighlightProps } from "../../src/system/scene/blocks/highlight";
import { linesAtBottom, linesAtTop, rowBoxes, settle, wrap, type Row } from "../../src/system/scene/blocks/rows";

// The loop's fact names its two lines, so the number stands alone on its line with room around it.
const FACTS: { label: string; text: string | string[]; word: string; style: HighlightProps["style"] }[] = [
  { label: "Air at 20 °C", text: "Sound moves at 343 m/s.", word: "343 m/s", style: "underline" },
  { label: "Earth to Moon", text: "Light reaches the Moon in 1.28 s.", word: "1.28 s", style: "marker" },
  { label: "Sea level", text: ["Water boils at", "100 °C"], word: "100 °C", style: "circle" },
];
// Each fact holds long enough for its words in every demo system (Pop: 1.2 s + 0.3 s a word).
export const BEAT = 4.0;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const [r0, r1] = rowBoxes(ctx, 2, { weights: [1, 2] }) as [Row, Row];
  return FACTS.flatMap((f, i) => {
    // The mark leaves just before its words, so it never trails behind them.
    // The last fact stays to the end of the film.
    const at = 0.3 + i * BEAT, until = i === FACTS.length - 1 ? undefined : at + BEAT - 0.5;
    // Leave room on the right for the loop, which reaches past the words.
    const ls = typeof f.text === "string" ? wrap(ctx, f.text, "headline", r1.w, [f.word]) : f.text;
    // A loop needs air above and below its line; an underline or a marker needs none.
    const gap = f.style === "circle" ? Math.round(ctx.size("headline") * 0.45) : 0;
    const lh = ctx.lineHeight("headline") + gap;
    const y = linesAtBottom(ctx, r1, "headline", 1) - lh * (ls.length - 1);
    const target = wordBox(ctx, ls.map((l) => l), r1.x, y, "headline", f.word);
    if (!target) return [];
    const row = Math.round((target.y - y) / ctx.lineHeight("headline"));
    target.y = y + row * lh;
    // The other lines, as ink boxes, for the loop to keep clear of.
    const avoid = ls.flatMap((l, j) => {
      if (j === row) return [];
      const ink = inkOf(ctx, "headline", y + j * lh, l);
      return [{ x: r1.x, y: ink.top, w: ctx.measure(l, "headline"), h: ink.bottom - ink.top }];
    });
    return [
      ...lines(ctx, { id: `f${i}-lab`, x: r0.x, y: linesAtTop(ctx, r0, "label"), lines: [f.label], role: "label", color: "inkMuted", at, until }),
      ...settle(ctx, { id: `f${i}-t`, x: r1.x, y, lines: ls, role: "headline", at: at + 0.15, until, gap }),
      ...B.highlight({ id: `f${i}-hl`, target, role: "headline", text: f.word, style: f.style, avoid, at: at + 1.0, until: until === undefined ? undefined : until - ctx.dur.exit }, ctx),
      // The last mark is the film's answer: reveal names its time for the checks (the busiest picture on the music).
      ...(i === FACTS.length - 1 ? B.reveal({ at: at + 1.0 }, ctx) : []),
    ];
  });
};
