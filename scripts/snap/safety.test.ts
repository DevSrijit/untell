// The solver never makes a frame worse: over a fixed set of films, every proposal applied at once ("apply all"),
// drawn by the real renderer, leaves no new issue at warning or error, no new overlap, nothing outside the frame or the
// safe area, and no data mark moved (scripts/snap/safety.ts). The films: the kiln frame, the planted frame, the guides
// scene, a moving reel, the ui kit in Graphite and a sequence diagram.
// Run: bun test scripts/snap/safety.test.ts   (a few minutes: it captures each film twice)
import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { closeBrowser } from "./capture";
import { safetyOf } from "./safety";

afterAll(() => closeBrowser());
const SET: [string, string[]][] = [
  ["src/films/align.tsx", ["align-kiln", "align-planted-bad", "align-guides"]],
  ["src/films/reels.tsx", ["reel-graphite", "reel-primary"]],
  ["src/films/blocks/primitives2.tsx", ["block-ui-graphite"]],
  ["src/films/blocks/diagrams.tsx", ["block-sequence-spec"]],
];
// Films that draw media you add (assets/media/<name>/): each one skips when its media is not there.
const ROOT = resolve(import.meta.dir, "../..");
const NEEDS: Record<string, string> = { "reel-primary": "primary-orange" };
const missing = (id: string) => !!NEEDS[id] && !existsSync(join(ROOT, "assets/media", NEEDS[id]!));
for (const [mod, ids] of SET) for (const id of ids) {
  test.skipIf(missing(id))(`apply all never makes ${id} worse`, async () => {
    const rs = await safetyOf(mod, id, 2);
    for (const r of rs) expect({ t: r.t, made: r.made, overlaps: r.overlaps, outside: r.outside, dataMoved: r.dataMoved }).toEqual({ t: r.t, made: [], overlaps: [], outside: [], dataMoved: [] });
  }, 600000);
}
