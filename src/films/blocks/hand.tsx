// The hand of each system: one chart demo in several systems, so a reader can see that each system draws its own
// chart and does not recolour one chart. Films `hand-<block>-<system>` (9:16) and `hand-<block>-<system>-wide`.
// out/review/charts/strip.py lays the frames side by side.
import type { Entry, Scene } from "./film";
import { sceneEntry } from "./film";
import * as barChart from "../../../examples/scenes/barChart";
import * as lineChart from "../../../examples/scenes/lineChart";
import * as areaChart from "../../../examples/scenes/areaChart";
import * as stackedBar from "../../../examples/scenes/stackedBar";
import * as waffle from "../../../examples/scenes/waffle";
import * as meter from "../../../examples/scenes/meter";
import * as ranking from "../../../examples/scenes/ranking";
import * as dumbbell from "../../../examples/scenes/dumbbell";
import type { Ctx, Node } from "../../system/scene/types";
import type { BLOCKS } from "../../system/scene/blocks";
import { chartFrame } from "../../../examples/scenes/chartFrame";

/** Horizontal bars in each hand: the ten-row doubling chart, rows in the text-safe area (the ruler, inside values, blunt rows). */
const rates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const barRows = { seconds: 7, scene: (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const F = chartFrame(ctx, B, ctx.system.density.maxWords >= 6 ? "Ten years to double at 7 %" : "Ten years at 7 %");
  return [...F.nodes, ...B.barChart({ id: "rows", ...F.box, title: "Years for money to double, by annual return", categories: rates.map((r) => `${r} %`),
    series: [{ label: "Years", values: rates.map((r) => Math.log(2) / Math.log(1 + r / 100)) }], key: 6, format: { decimals: 1 }, orientation: "horizontal", at: 0.4 }, ctx)];
} };

/** The systems of each strip. No system's Direction bans the block (Graphite bans barChart; Kinetic bans lineChart). */
export const HAND: Record<string, { mod: { scene: Scene; seconds?: number }; seconds: number; systems: string[] }> = {
  barChart: { mod: barChart, seconds: 7, systems: ["spec", "studio", "kinetic", "riso", "schematic", "console"] },
  barRows: { mod: barRows, seconds: 7, systems: ["spec", "studio", "kinetic", "riso", "schematic", "console"] },
  lineChart: { mod: lineChart, seconds: 8, systems: ["spec", "studio", "riso", "schematic", "graphite", "kinetic"] },
  areaChart: { mod: areaChart, seconds: 7, systems: ["spec", "studio", "riso", "schematic", "graphite"] },
  stackedBar: { mod: stackedBar, seconds: 7, systems: ["spec", "studio", "riso", "schematic", "console", "pop"] },
  waffle: { mod: waffle, seconds: 10, systems: ["spec", "studio", "riso", "schematic", "console", "pop"] },
  meter: { mod: meter, seconds: 6, systems: ["spec", "studio", "riso", "schematic", "console", "pop"] },
  ranking: { mod: ranking, seconds: 11, systems: ["spec", "studio", "riso", "schematic", "console", "pop"] },
  dumbbell: { mod: dumbbell, seconds: 8, systems: ["spec", "studio", "riso", "schematic", "console", "pop"] },
};

export const FILMS: Record<string, Entry> = {};
for (const [block, h] of Object.entries(HAND)) for (const sys of h.systems) {
  // The strip's own length, longer than the demo's: the slowest system (Studio) must land every label before the last frame.
  const s = h.seconds;
  FILMS[`hand-${block}-${sys}`] = sceneEntry(h.mod.scene, sys, s, 1080, 1920, { demo: true });
  FILMS[`hand-${block}-${sys}-wide`] = sceneEntry(h.mod.scene, sys, s, 1920, 1080, { demo: true });
}
