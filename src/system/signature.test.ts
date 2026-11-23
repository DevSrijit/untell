// A system may never ask for a move that its own checks refuse. For each of the 20 systems, the signature film
// (examples/scenes/signature.ts: its hook, its signature moves and its end, with the block map's blocks and default
// props) builds with no block warning, its detector result holds no finding and needs no declaration, and the
// HyperFrames check finds nothing in it.
// The detector result comes from: bun scripts/detect.ts sig-<system> --films src/films/signature.tsx, and the
// HyperFrames check's from: bun scripts/hf_check.ts examples/scenes/signature.ts <system> <seconds> --check-only
// (a film whose result is not on disk is skipped here; the build part always runs).
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { SYSTEMS } from "./systems";
import { DIRECTION } from "./direction";
import { MEDIA_SPEC } from "./media-spec";
import { makeCtx } from "./scene/context";
import { BLOCKS } from "./scene/blocks";
import { SCENES } from "../../examples/scenes/signature";

const ROOT = resolve(import.meta.dir, "../..");

describe("signature films", () => {
  test("every system has one, and every move that a check may not refuse names a block of its block map", () => {
    for (const s of SYSTEMS) {
      expect([s.id, typeof SCENES[s.id]]).toEqual([s.id, "function"]);
      for (const m of DIRECTION[s.id]!.moves) if (m.allows) expect([s.id, DIRECTION[s.id]!.blocks.some((b) => b.block === m.allows!.block)]).toEqual([s.id, true]);
    }
  });
  // The picture case: a system whose direction sets its main text with a picture (compose "picture" or "behind", or a
  // picture placed behind type) has a picture in its signature film; where the picture goes behind type (Nocturne,
  // Title), the text sits on it. The build test below holds the rest: no text runs across a picture's edge (handover.ts),
  // and a picture of the film shows detail on a phone (photo.test.ts).
  const pairs = SYSTEMS.filter((s) => MEDIA_SPEC[s.id]!.pictures.placements.includes("behind-type-dimmed") || ["picture", "behind"].includes(DIRECTION[s.id]!.compose?.kind ?? ""));
  test("the systems that set text with a picture: their signature films hold the picture, under the text where it goes behind type", () => {
    expect(pairs.map((s) => s.id).sort()).toEqual(["courtside", "nocturne", "noir", "riso", "title"]);
    for (const s of pairs) {
      const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.4);
      const warn = console.warn; console.warn = () => {};
      let ns: ReturnType<(typeof SCENES)[string]>;
      try { ns = SCENES[s.id]!(ctx, BLOCKS); } finally { console.warn = warn; }
      const pics = ns.filter((n) => n.kind === "image");
      const behind = MEDIA_SPEC[s.id]!.pictures.placements.includes("behind-type-dimmed");
      const over = ns.some((n) => n.kind === "text" && pics.some((p) => n.x >= p.x && n.x < p.x + p.w && n.y >= p.y && n.y < p.y + p.h));
      expect([s.id, pics.length > 0, behind ? over : true]).toEqual([s.id, true, true]);
    }
  });
  test("the scenes, with their sound, have no lint finding", () => {
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const r = spawnSync("bun", [join(ROOT, "scripts/lint/cli.ts"), join(ROOT, "examples/scenes/signature.ts"), "--json"], { encoding: "utf8" });
    const j = JSON.parse(r.stdout) as { errors: number; warnings: number; results: unknown[] };
    expect([j.errors, j.warnings, j.results]).toEqual([0, 0, []]);
  });
  for (const s of SYSTEMS) {
    test(`${s.id}: builds with no block warning`, () => {
      const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.4);
      const said: string[] = [], warn = console.warn;
      console.warn = (...m: unknown[]) => said.push(m.map(String).join(" "));
      try { SCENES[s.id]!(ctx, BLOCKS); } finally { console.warn = warn; }
      expect([s.id, said]).toEqual([s.id, []]);
    });
    const file = join(ROOT, "out/detector", `sig-${s.id}`, "findings.json");
    test.skipIf(!existsSync(file))(`${s.id}: the detector finds nothing, and nothing is declared`, () => {
      const r = JSON.parse(readFileSync(file, "utf8"));
      const res = Array.isArray(r) ? r[0] : r;
      expect([s.id, (res.findings ?? []).map((f: { check: string }) => f.check).sort()]).toEqual([s.id, []]);
      expect([s.id, (res.declared ?? []).length]).toEqual([s.id, 0]);
      // A result older than the scene file says nothing about the scene: record and check again.
      expect(statSync(file).mtimeMs).toBeGreaterThan(statSync(join(ROOT, "examples/scenes/signature.ts")).mtimeMs - 1);
    });
    // The HyperFrames check of the same film: no finding, so a move the system asks for (Kinetic's display type that
    // the frame crops) never gives the HyperFrames check's advice either.
    const hf = join(ROOT, "out/hf", `signature-${s.id}`, "check.txt");
    test.skipIf(!existsSync(hf))(`${s.id}: the HyperFrames check finds nothing`, () => {
      const lines = readFileSync(hf, "utf8").split("\n").filter((l) => /^[⚠✗]/.test(l.trim()));
      expect([s.id, lines]).toEqual([s.id, []]);
      expect(statSync(hf).mtimeMs).toBeGreaterThan(statSync(join(ROOT, "examples/scenes/signature.ts")).mtimeMs - 1);
    });
  }
});
