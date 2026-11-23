// A 3D view shows on exactly the frames its opacity window shows, so two shots that cut at t leave no frame without
// an object (the fault: the lamp was gone for one frame at each cut in an agent's Matte film).
import { describe, expect, test } from "bun:test";
import { FPS, windows } from "../scene/context";
import { valueAt } from "../scene/time";
import { SYSTEMS } from "../systems";
import { shownOn } from "./shown";

const system = SYSTEMS.find((s) => s.id === "matte")!;
const opacityOn = (keys: ReturnType<typeof windows>, frame: number) => valueAt(system, keys, "opacity", frame / FPS);

describe("a 3D view's frames", () => {
  // Times on the grid, off the grid and the reel's old workaround (a shot one frame before its cut).
  const times = [0, 1, 1.5, 2, 3.0, 3.47, 6, 8.0333, 11.97, 1 - 1 / 30];
  test("the view shows where its opacity window shows", () => {
    for (const at of [-1, ...times]) for (const until of [undefined, ...times.filter((u) => u > at)]) {
      const keys = windows([[at, until]]);
      for (let f = 0; f < 400; f++) expect([at, until, f, shownOn({ at, until }, f)]).toEqual([at, until, f, opacityOn(keys, f) > 0.5]);
    }
  });
  test("two shots that cut at t: every frame shows exactly one", () => {
    for (const t of times.filter((x) => x > 0)) {
      for (let f = 0; f < 400; f++) {
        const n = Number(shownOn({ at: 0, until: t }, f)) + Number(shownOn({ at: t }, f));
        expect([t, f, n]).toEqual([t, f, 1]);
      }
    }
  });
});
