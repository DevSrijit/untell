// The example reels (examples/reels/) are the public showpieces and the source of the README pictures: each passes its
// own tool. For each of the 20 reels, the last detector result holds no finding and needs no declaration (a system's
// own `allows` is not a declaration), except the open faults named in OPEN with why, so the state stays honest.
// The detector result comes from: bun scripts/detect.ts reel-<system> --films src/films/reels.tsx
// (a reel whose result is not on disk is skipped here). Where the reel's mastered render is on disk and current, the
// result holds the rendered pass too (the sound checks on the render), and it must be clean as well.
// A reel passes in both frameworks: its HyperFrames form holds the same standard, except the faults in HF_OPEN, with
// why. That result comes from:
//   bun scripts/hf_check.ts examples/reels/<file>.ts <system> <seconds> --check-only
//   bun scripts/render.ts --renderer hyperframes out/hf/<file>-<system> --out out/render/hf-<file>-<system>.mp4
//   bun scripts/detect.ts hf:out/hf/<file>-<system>/index.html
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { SYSTEMS } from "./systems";

const ROOT = resolve(import.meta.dir, "../..");

/** Open faults: the checks a reel still fails, with why. Remove an entry when it is fixed. */
const OPEN: Record<string, { checks: string[]; declared?: number; why: string }> = {};

/** Open faults of the HyperFrames forms, by project name (<file>-<system>), with why. */
const HF_OPEN: Record<string, { checks: string[]; why: string }> = {
};

/** The reels with a HyperFrames form: each system's reel, and the Matte reel with a real model. */
const HF_REELS: [string, string][] = [...SYSTEMS.map((s) => [s.id, s.id] as [string, string]), ["matte-model", "matte"]];

describe("example reels", () => {
  for (const s of SYSTEMS) {
    const file = join(ROOT, "out/detector", `reel-${s.id}`, "findings.json");
    test.skipIf(!existsSync(file))(`${s.id}: the detector finds nothing, and nothing is declared`, () => {
      const r = JSON.parse(readFileSync(file, "utf8"));
      const res = Array.isArray(r) ? r[0] : r;
      const got = [...new Set((res.findings ?? []).map((f: { check: string }) => f.check))].sort();
      expect([s.id, got]).toEqual([s.id, [...(OPEN[s.id]?.checks ?? [])].sort()]);
      expect([s.id, (res.declared ?? []).length]).toEqual([s.id, OPEN[s.id]?.declared ?? 0]);
      // A result older than the reel says nothing about it: record and check again.
      expect(statSync(file).mtimeMs).toBeGreaterThan(statSync(join(ROOT, "examples/reels", `${s.id}.ts`)).mtimeMs - 1);
    });
    // The rendered pass: where the reel's render is on disk and as new as the reel, the result is of that render (the
    // sound check measured it, with no finding above). Render with: bun scripts/render.ts reel-<system> --films src/films/reels.tsx
    // The mastered render, or the render itself for a system with no master (Raw: no music, its quiet mix is the design).
    const mastered = join(ROOT, "out/render", `reel-${s.id}.mastered.mp4`);
    const render = existsSync(mastered) ? mastered : join(ROOT, "out/render", `reel-${s.id}.mp4`);
    const current = existsSync(file) && existsSync(render) && statSync(render).mtimeMs >= statSync(join(ROOT, "examples/reels", `${s.id}.ts`)).mtimeMs;
    test.skipIf(!current)(`${s.id}: the rendered pass finds nothing`, () => {
      const r = JSON.parse(readFileSync(file, "utf8"));
      const res = Array.isArray(r) ? r[0] : r;
      const heard = (res.notes ?? []).find((n: { check?: string; render?: string }) => n.check === "sound" && n.render);
      expect([s.id, heard?.render]).toEqual([s.id, render.slice(ROOT.length + 1)]);
      expect([s.id, (res.findings ?? []).length, OPEN[s.id] ? "open" : "closed"]).toEqual([s.id, 0, "closed"]);
    });
  }
  for (const [file, sys] of HF_REELS) {
    const name = `${file}-${sys}`;
    const hf = join(ROOT, "out/detector", `hf-${name}`, "findings.json");
    test.skipIf(!existsSync(hf))(`${name}: the HyperFrames form finds nothing, and nothing is declared`, () => {
      const r = JSON.parse(readFileSync(hf, "utf8"));
      const res = Array.isArray(r) ? r[0] : r;
      const got = [...new Set((res.findings ?? []).map((f: { check: string }) => f.check))].sort();
      expect([name, got]).toEqual([name, [...(HF_OPEN[name]?.checks ?? [])].sort()]);
      expect([name, (res.declared ?? []).length]).toEqual([name, 0]);
      expect(statSync(hf).mtimeMs).toBeGreaterThan(statSync(join(ROOT, "examples/reels", `${file}.ts`)).mtimeMs - 1);
    });
  }
});