// The bar scene: how many days each inner planet takes to go round the Sun (88, 225, 365, 687).
// At 9:16 the bars grow right; at 16:9 they grow up. Short bars print their value past the end,
// long bars inside. Mars is the key bar: series1, and its name is set in ink: the line is about it.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { chartFrame } from "./chartFrame";
import { overflow } from "../../src/system/scene/blocks/text";

const PLANETS = [["Mercury", 88], ["Venus", 225], ["Earth", 365], ["Mars", 687]] as const;

export const seconds = 6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const F = chartFrame(ctx, B, "A year on Mars is 687 days");
  const X = F.box, W = X.w;
  const lhL = ctx.lineHeight("label");
  const gap = Math.round(ctx.size("label") * 0.3);
  const max = Math.max(...PLANETS.map(([, v]) => v));
  const out: Node[] = [...F.nodes, ...B.text({ id: "title", text: "Orbital period, days", role: "label", color: "inkMuted", x: X.x, y: X.y + overflow(ctx, "label").top, at: 0.3 }, ctx)];
  const top = X.y + lhL * 2;
  if (F.tall) {
    // Rows: a name, then its bar, spread over the box. The bar block keeps each value label text-safe, in the low band too.
    const row = Math.floor((X.y + X.h - top + gap * 4) / PLANETS.length);
    const thick = Math.min(row - lhL - gap * 5, Math.round(ctx.size("headline") * 1.6));
    PLANETS.forEach(([name, v], i) => {
      const y = top + i * row, at = 0.7 + i * 0.3, key = name === "Mars";
      out.push(...B.text({ id: `name-${i}`, text: name, role: "label", color: key ? "ink" : "inkMuted", x: X.x, y, at }, ctx));
      out.push(...B.bar({ id: `bar-${i}`, x: X.x, y: y + lhL + gap, w: W, h: thick, value: v, max, fill: key ? "series1" : "series3", at: at + 0.1 }, ctx));
    });
  } else {
    // Columns: a bar over its name.
    const slot = W / PLANETS.length, bw = Math.round(Math.min(slot * 0.62, ctx.size("headline") * 3.2));
    const base = X.y + X.h - lhL - gap * 2 - overflow(ctx, "label").bottom;
    PLANETS.forEach(([name, v], i) => {
      const x = Math.round(X.x + i * slot + (slot - bw) / 2), at = 0.7 + i * 0.3, key = name === "Mars";
      out.push(...B.bar({ id: `bar-${i}`, axis: "y", x, y: top, w: bw, h: base - top, value: v, max, fill: key ? "series1" : "series3", at: at + 0.1 }, ctx));
      out.push(...B.text({ id: `name-${i}`, text: name, role: "label", color: key ? "ink" : "inkMuted", align: "center", x, y: base + gap * 2, w: bw, at }, ctx));
    });
  }
  out.push(...B.hold({ at: 3.2, until: seconds }, ctx));
  return out;
};
