// Item 20: a whip's blur region covers all the world the camera shows on its travel (layout.blurRegion), so a whip
// to a second frame never draws black. Both renderers take the region from this one function.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SYSTEMS } from "../systems";
import { BLOCKS } from "./blocks";
import { makeCtx } from "./context";
import { blurRegion } from "./layout";

const ctx = (() => { const s = SYSTEMS.find((x) => x.id === "courtside")!; return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5); })();

describe("item 20: the whip's blur region", () => {
  test("a whip to the second frame on the right: the region holds both frames and the blur's spread", () => {
    const [cam] = BLOCKS.camera({ moves: [], whips: [{ at: 8.4, dx: 1080 }] }, ctx);
    const r = blurRegion(cam!, 1080, 1920);
    expect(r.x).toBeLessThan(0);
    expect(r.x + r.w).toBeGreaterThan(2 * 1080);
    expect(r.y).toBeLessThan(0);
    expect(r.y + r.h).toBeGreaterThan(1920);
  });
  test("a whip down and a zoom out: the region grows with the travel and the widest view", () => {
    const r = blurRegion({ tracks: { y: [{ t: 0, v: 0 }, { t: 1, v: 3840 }], scale: [{ t: 0, v: 1 }, { t: 1, v: 0.5 }], blurY: [{ t: 0, v: 0 }, { t: 0.5, v: 40 }] } }, 1080, 1920);
    expect(r.y + r.h).toBeGreaterThan(3840 + 1920 + 1920 / 2);
    expect(r.x).toBeLessThan(-540);
  });
  test("both renderers size the filter with blurRegion, never as one frame", () => {
    for (const f of ["remotion.tsx", "hyperframes.ts"]) {
      const src = readFileSync(join(import.meta.dir, f), "utf8");
      expect(src).toContain("blurRegion(");
      expect(src).not.toMatch(/id[=:]\s*\{?BLUR_ID\}?,?\s*x[=:]\s*"?0"?,?\s*y[=:]\s*"?0"?/);
    }
  });
});
