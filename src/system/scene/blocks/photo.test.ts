// The photo block refuses, when the scene builds, a prepared file that is not there. A renderer would wait for the
// file until it times out (30 s), with no word of what to do.
import { describe, expect, test } from "bun:test";
import { PLATES } from "../../media-plates.gen";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import type { Ctx } from "../types";
import { needFile, photo } from "./photo";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ctxOf = (id: string): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.55);
};

describe("photo: prepared files", () => {
  test("dim on footage with no plate-dim.mp4 throws with the command that writes it", () => {
    // The table must say that this clip has no dimmed plate; else the test proves nothing.
    expect(PLATES["ma-palm"]).toBeDefined();
    expect(PLATES["ma-palm"]).not.toContain("plate-dim.mp4");
    const build = () => photo({ id: "hero", media: "ma-palm", dim: true, at: 0 }, ctxOf("ma"));
    expect(build).toThrow(/ma-palm\/plate-dim\.mp4/);
    expect(build).toThrow(/media_video\.py assets\/media\/ma-palm ma/);
  });

  test("dim on a still with no plate-dim.jpg throws with prepare", () => {
    const name = Object.keys(PLATES).find((k) => PLATES[k]!.includes("plate.jpg") && !PLATES[k]!.includes("plate-dim.jpg"));
    if (!name) return; // every still has a dimmed plate here
    expect(() => photo({ id: "p", media: name, dim: true, at: 0 }, ctxOf("noir"))).toThrow(/prepare/);
  });

  test("dim builds where prepare wrote the dimmed plate", () => {
    expect(PLATES["noir-lane"]).toContain("plate-dim.mp4");
    const nodes = photo({ id: "lane", media: "noir-lane", dim: true, at: 0 }, ctxOf("noir"));
    expect(nodes.some((n) => n.kind === "image" && n.src === "noir-lane/plate-dim.mp4")).toBe(true);
  });

  test("a name the table does not hold is not checked", () => {
    expect(PLATES["no-such-picture"]).toBeUndefined();
    // It still throws, but for the missing media entry, not for the file.
    expect(() => photo({ id: "p", media: "no-such-picture", dim: true, at: 0 }, ctxOf("noir"))).toThrow(/no prepared media/);
  });
});

describe("needFile, with a table the test gives", () => {
  const table = { "clip-a": ["plate.mp4"], "still-b": ["plate.jpg", "plate-dim.jpg", "subject.png"] };
  const ctx = ctxOf("noir");
  test("a missing dimmed clip throws and names the clip command", () => {
    expect(() => needFile("p", "clip-a", "plate-dim.mp4", ctx, true, "`dim`", table)).toThrow(/media_video\.py assets\/media\/clip-a noir/);
  });
  test("a file prepare wrote passes", () => {
    expect(() => needFile("p", "still-b", "plate-dim.jpg", ctx, false, "`dim`", table)).not.toThrow();
  });
  test("a missing cut-out throws with prepare", () => {
    expect(() => needFile("p", "clip-a", "subject.png", ctx, false, "`over`", table)).toThrow(/media\.ts prepare clip-a --system noir/);
  });
  test("a name the table does not hold passes", () => {
    expect(() => needFile("p", "other", "plate-dim.jpg", ctx, false, "`dim`", table)).not.toThrow();
  });
});

describe("photo: a dissolve of a given length", () => {
  // Studio asks for a dissolve of 8 to 15 frames between shots: `dissolve` sets it, in frames.
  const opacityOf = (nodes: ReturnType<typeof photo>) => (nodes.find((n) => n.kind === "image")?.tracks?.opacity ?? []) as { t: number; v: number }[];
  test("the fade in and the fade out each take the frames given; out of range throws", () => {
    const ctx = ctxOf("studio");
    const keys = opacityOf(photo({ id: "p", media: "ma-palm", at: 1, until: 3, enter: "dissolve", exit: "dissolve", dissolve: 12 }, ctx));
    const span = (from: number, to: number) => { const ks = keys.filter((k) => k.t >= from - 1e-6 && k.t <= to + 1e-6); return ks[ks.length - 1]!.t - ks[0]!.t; };
    expect(span(0.9, 1.9)).toBeCloseTo(12 / 30, 2);
    expect(span(2.9, 3.9)).toBeCloseTo(12 / 30, 2);
    expect(() => photo({ id: "p", media: "ma-palm", at: 1, dissolve: 90 }, ctx)).toThrow(/2 to 45/);
  });
});

// A prepared picture must show detail on a phone (scripts/media_treat.py detail_fault: the 95th percentile of luma at
// 72 or more and a 5th-95th spread of 48 or more). The systems that darken pictures (Nocturne, Noir, Title, Matte,
// Keynote) grade every picture of the repository that they prepare, the plate and the plate behind type, and each
// passes; a picture that is dark in itself (a beam of light in the dark) is the picture's fault, and prepare says so.
describe("prepared pictures in the dark systems show detail on a phone", () => {
  const ROOT = resolve(import.meta.dir, "../../../..");
  const SAMPLES: [string, string][] = [["nocturne", "nocturne-stacks"], ["noir", "noir-bridge"], ["title", "title-boat"], ["title", "title-jetty"],
    ["matte", "nocturne-stacks"], ["keynote", "keynote-lens"], ["nocturne", "title-jetty"]];
  const run = (pairs: [string, string][]) => spawnSync("python3", ["-c", `import sys, json; sys.path.insert(0, "${join(ROOT, "scripts")}")
import numpy as np, media_treat as mt
from PIL import Image
out = []
for system, name in json.loads(sys.argv[1]):
    a = np.asarray(Image.open("${join(ROOT, "assets/media")}/" + name + "/source.jpg").convert("RGB"), dtype=np.float32) / 255
    lv = mt.key_levels([a], system)
    out.append([system, name, mt.detail_fault(mt.grade_array(a, system, lv)), mt.detail_fault(mt.grade_array(a, system, lv, dim=True))])
print(json.dumps(out))`, JSON.stringify(pairs)], { encoding: "utf8" });
  const have = (name: string) => existsSync(join(ROOT, "assets/media", name, "source.jpg"));
  test.skipIf(!SAMPLES.every(([, n]) => have(n)))("the plate and the plate behind type of each pass", () => {
    const r = run(SAMPLES);
    expect(r.stderr).toBe("");
    expect(JSON.parse(r.stdout)).toEqual(SAMPLES.map(([s, n]) => [s, n, null, null]));
  });
  test.skipIf(!have("title-beam"))("a picture dark in itself: the plate stretches until it shows; behind type it cannot, and says why", () => {
    const [[, , plate, dim]] = JSON.parse(run([["title", "title-beam"]]).stdout);
    expect(plate).toBeNull();
    expect(dim).toMatch(/too little visible detail: luma mean \d+, 5th-95th percentile \d+-\d+ of 255/);
  });
});
