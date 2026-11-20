// A system that names an effect in `allows` must have a block or a prop that draws it. Otherwise the effect is
// prose: SYSTEM.md promises it, and no film can show it (the critics found this in Keynote, Noir and Courtside).
// DRAWN_BY names, for each effect, the file and the code that draws it. The test reads that file and fails when
// the code is not there. An effect with no drawing code yet goes in PENDING with the reason; the test fails when
// a pending effect gets its code (move it to DRAWN_BY then), so the list stays true.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EFFECT_NOTE, SYSTEMS, type Effect } from "../systems";

const SRC = join(import.meta.dir, "..");

/** Where each effect is drawn: a file under src/system and a string that only the drawing code contains. */
const DRAWN_BY: Partial<Record<Effect, { file: string; code: string; what: string }[]>> = {
  "light-sweep": [
    { file: "scene/blocks/photo.ts", code: `kind: "sweep"`, what: "photo `sweep`, masked by the cut-out" },
    { file: "three/render.ts", code: "sweepLight", what: "a 3D sweep light (product `sweep`)" },
  ],
  "rim-light": [{ file: "scene/blocks/photo.ts", code: `kind: "rim"`, what: "photo `rim`, from the cut-out's alpha" }],
  "contact-shadow": [{ file: "three/render.ts", code: "ShadowMaterial", what: "the 3D floor's contact shadow" }],
  halftone: [{ file: "scene/blocks/photo.ts", code: "ink-${role}.png", what: "photo `passes`, one halftone layer per ink" }],
  "shadow-bars": [{ file: "scene/blocks/shadowBars.ts", code: "export const shadowBars", what: "the shadowBars block" }],
  "motion-blur": [{ file: "scene/screen.ts", code: "export function whip", what: "screen.whip: camera blurX, blurY while the view whips" }],
  grain: [{ file: "scene/layout.ts", code: "export const grainOf", what: "the renderers' grain layer" }],
  scanlines: [
    { file: "scene/layout.ts", code: "export function scanlineStyle", what: "the scanline layer's style" },
    { file: "scene/remotion.tsx", code: "scanlineStyle(", what: "the Remotion scanline layer" },
    { file: "scene/hyperframes.ts", code: "scanlineStyle(", what: "the HyperFrames scanline layer" },
  ],
  reflection: [{ file: "three/render.ts", code: "mirrorFloor", what: "the 3D floor reflection" }],
};

/** Effects that a system allows but nothing draws yet, with the reason. Keep this list short and true. */
const PENDING: Partial<Record<Effect, string>> = {};

describe("every effect a system allows has a block or prop that draws it", () => {
  for (const s of SYSTEMS) {
    for (const effect of s.allows) {
      test(`${s.id}: ${effect}`, () => {
        const drawn = DRAWN_BY[effect];
        if (!drawn) {
          expect(PENDING[effect], `${s.id} allows "${effect}" (${EFFECT_NOTE[effect]}), but no block draws it and it is not in PENDING`).toBeDefined();
          return;
        }
        for (const d of drawn) expect(readFileSync(join(SRC, d.file), "utf8").includes(d.code), `${d.what}: "${d.code}" is not in ${d.file}`).toBe(true);
      });
    }
  }
  test("a pending effect has no drawing code in DRAWN_BY", () => {
    for (const e of Object.keys(PENDING) as Effect[]) expect(DRAWN_BY[e], `"${e}" is drawn now: remove it from PENDING`).toBeUndefined();
  });
});
