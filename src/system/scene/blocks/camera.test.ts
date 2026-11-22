import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import { camera } from "./camera";

const ctxOf = (id: string) => { const s = SYSTEMS.find((x) => x.id === id)!; return makeCtx(s, 1080, 1920, (t) => t.length * 20); };

describe("camera", () => {
  test("without tilt or whips it has only x, y and scale tracks", () => {
    const [c] = camera({ moves: [{ at: 1, x: 300 }] }, ctxOf("graphite"));
    expect(Object.keys(c!.tracks!).sort()).toEqual(["scale", "x", "y"]);
  });
  test("a tilt eases on the move curve and returns to 0", () => {
    const [c] = camera({ moves: [{ at: 1, x: 300, tiltY: 5 }, { at: 3, tiltY: 0 }] }, ctxOf("graphite"));
    const k = c!.tracks!.tiltY!;
    expect(k.map((x) => x.v)).toEqual([0, 0, 5, 5, 0]);
  });
  test("a whip blurs only while the view moves, and only where motion-blur is allowed", () => {
    const [c] = camera({ moves: [], whips: [{ at: 2, dx: 900 }] }, ctxOf("kinetic"));
    const b = c!.tracks!.blurX!;
    expect(b[0]!.v).toBe(0);
    expect(b[b.length - 1]!.v).toBe(0);
    expect(Math.max(...b.map((x) => x.v))).toBeGreaterThan(0);
    expect(() => camera({ moves: [], whips: [{ at: 2, dx: 900 }] }, ctxOf("spec"))).toThrow(/motion-blur/);
  });
  // A first-use test: the docs did not say that a whip's pan stays. A move after a whip starts from where the
  // whip left the view; before, a move with x jumped back to the place before the whip.
  test("a whip's pan stays, and a later move starts from there", () => {
    const at = (keys: { t: number; v: number }[], t: number) => [...keys].filter((k) => k.t <= t + 1e-9).pop()!.v;
    const [c] = camera({ moves: [{ at: 4, x: 1080 + 200 }], whips: [{ at: 2, dx: 1080 }] }, ctxOf("courtside"));
    const x = c!.tracks!.x!;
    expect(at(x, 3)).toBe(1080);
    expect(at(x, 4)).toBe(1080);
    expect(x[x.length - 1]!.v).toBe(1280);
    const [z] = camera({ moves: [{ at: 4, zoom: 1.1 }], whips: [{ at: 2, dx: 1080 }] }, ctxOf("courtside"));
    expect(z!.tracks!.x![z!.tracks!.x!.length - 1]!.v).toBe(1080);
  });
});
