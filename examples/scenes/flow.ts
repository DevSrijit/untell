// The flow scene: how a CDN edge cache serves a file. Vebi asks first; the edge has no copy (a miss),
// so it fetches the file from the origin and keeps it. Tecohi asks next; the edge answers from its
// copy (a hit) and the origin does no work. Shared by Remotion and HyperFrames.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { pairOf } from "./chartFrame";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => [
  ...pairOf(ctx, B, "", (box) => B.flow({
    id: "cdn",
    ...box,
    title: "How a CDN edge cache serves a file",
    nodes: [
      { id: "vebi", label: "Vebi's browser", col: 0, row: 0 },
      { id: "tecohi", label: "Tecohi's browser", col: 0, row: 1 },
      { id: "edge", label: "Edge cache", col: 1, row: 0.5 },
      { id: "origin", label: "Origin server", col: 2, row: 0.5 },
    ],
    edges: [
      { from: "vebi", to: "edge", both: true },
      { from: "tecohi", to: "edge", both: true },
      { from: "edge", to: "origin", both: true, label: "Miss only" },
    ],
    packets: [
      { path: ["vebi", "edge", "origin", "edge", "vebi"], at: 2.2, label: "Vebi asks first: a miss. The edge fetches the file and keeps a copy." },
      { path: ["tecohi", "edge", "tecohi"], at: 9.2, label: "Tecohi asks next: a hit. The edge answers from its copy." },
    ],
    at: 0.3,
  }, ctx)),
];
