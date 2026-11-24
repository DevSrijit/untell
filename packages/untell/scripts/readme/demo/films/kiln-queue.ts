// A kiln queue screen in Studio at 16:9: one frozen frame of a UI with tabs, a button, three rows and a status bar.
// Its text is placed by the line box, not by the ink, so each label rides a few px high in its pill, its circle or
// its row. untell snap finds each miss. Names are fictional.
import type { Ctx, Node } from "../untell/scene/types";
import NODES from "./kiln-queue.nodes.json";

export const seconds = 9;
export const system = "studio";
export const width = 1920;
export const height = 1080;

export const scene = (_ctx: Ctx, _B: unknown): Node[] => structuredClone(NODES) as Node[];
