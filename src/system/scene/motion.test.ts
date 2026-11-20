// The system motion pass (time.withSystemMotion): the frame step and the opaque rule.
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../systems";
import { opaqueOf, stepOf, valueAt, withSystemMotion } from "./time";
import type { Node } from "./types";

const sys = (id: string) => SYSTEMS.find((s) => s.id === id)!;
const box = (tracks: Node["tracks"]): Node => ({ id: "b", kind: "rect", x: 0, y: 0, w: 10, h: 10, fill: "ink", tracks });

describe("system motion", () => {
  test("Cutout and Riso step at 12 fps; Cutout, Riso and Primary are opaque; Spec is neither", () => {
    expect(stepOf(sys("cutout"))).toBe(12);
    expect(stepOf(sys("riso"))).toBe(12);
    expect(stepOf(sys("spec"))).toBe(0);
    expect(["cutout", "riso", "primary"].every((id) => opaqueOf(sys(id)))).toBe(true);
    expect(opaqueOf(sys("spec"))).toBe(false);
  });

  test("a stepped move changes only on its 12 fps ticks, and ends on its target", () => {
    const s = sys("cutout");
    const [n] = withSystemMotion(s, [box({ x: [{ t: 0.5, v: 0 }, { t: 1.5, v: 100, curve: "move" }] })]);
    const x = n!.tracks!.x!;
    const at = (f: number) => valueAt(s, x, "x", f / 30);
    const changes: number[] = [];
    for (let f = 1; f <= 60; f++) if (at(f) !== at(f - 1)) changes.push(f);
    // Every change lands on a whole frame of the 12 fps grid (frame = round(k * 2.5)).
    const grid = new Set(Array.from({ length: 30 }, (_, k) => Math.round(k * 2.5)));
    expect(changes.every((f) => grid.has(f))).toBe(true);
    expect(changes.length).toBeGreaterThan(5);
    expect(at(60)).toBe(100);
  });

  test("an opaque system cuts a fade in at its start and a fade out at its end", () => {
    const s = sys("primary");
    const [n] = withSystemMotion(s, [box({ opacity: [{ t: 0, v: 0 }, { t: 1, v: 0 }, { t: 1.4, v: 1, curve: "enter" }, { t: 2, v: 1 }, { t: 2.4, v: 0, curve: "exit" }] })]);
    const o = n!.tracks!.opacity!;
    const vals = [0.9, 1.05, 1.3, 2.1, 2.39, 2.45].map((t) => valueAt(s, o, "opacity", t));
    expect(vals).toEqual([0, 1, 1, 1, 1, 0]);
    // No value between 0 and 1 anywhere.
    for (let f = 0; f < 90; f++) expect([0, 1]).toContain(valueAt(s, o, "opacity", f / 30));
  });

  test("a system without step or opaque keeps its nodes as they are", () => {
    const nodes = [box({ x: [{ t: 0, v: 0 }, { t: 1, v: 10 }] })];
    expect(withSystemMotion(sys("spec"), nodes)).toBe(nodes);
  });
});
