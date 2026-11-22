// The kiln queue frame as a review saw it on 2026-11-20 (the ui kit sample, Studio, 1920 x 1080), frozen: the nodes
// that examples/scenes/ui.ts built with the ui kit of that hour. The kit centred text by its line box, so two faults
// show at rest: "CONE 10" sits above the centre of its pill, and the "Start firing" button ends 18 px under the
// rule of the tab bar beside it. The ui kit now centres text by its ink, so the live scene no longer shows them.
// This frozen copy keeps the real bad case for the align/* checks and for scripts/snap (see ALIGN.md).
// The nodes hold only roles and px, so any system with these roles draws them; the fixture is for Studio at 16:9.
import type { Ctx, Node } from "../../../src/system/scene/types";
import NODES from "./kiln-queue.nodes.json";

export const seconds = 9;
export const system = "studio";

export const scene = (_ctx: Ctx, _B: unknown): Node[] => structuredClone(NODES) as Node[];
