// A block of your own (docs/guide/blocks.md): the worked example of the guide, built with the kit of each framework
// and held to the block contract. With UNTELL_PROJECTS=<folder> (installed `remotion` and `hyperframes` projects in
// it), the film of the guide is also checked with untell check in both.
import { afterAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { copyKit } from "../src/init";
import { FILMS_DIR, KIT_DIR } from "../src/kit";
import type { Framework } from "../src/detect";

const PKG = resolve(import.meta.dir, "..");
const GUIDE = resolve(PKG, "../../docs/guide/blocks.md");
const ROLES = new Set(["ground", "surface", "rule", "ink", "inkMuted", "accent", "accent2", "accent3", "accentText", "onAccent", "series1", "series2", "series3", "series4", "series5", "positive", "negative"]);

/** The files of the guide's worked example: each ts fence whose first line names its path in the films folder. */
export function guideFiles(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of md.matchAll(/```ts\n\/\/ films\/([^\n]+)\n([\s\S]*?)```/g)) out[m[1]!.trim()] = m[2]!;
  return out;
}

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** A project folder with the kit of one framework and the guide's files in its films folder. */
function project(fw: Framework): string {
  const d = mkdtempSync(join(PKG, ".own-block-"));
  dirs.push(d);
  copyKit(d, fw);
  for (const [rel, text] of Object.entries(guideFiles(readFileSync(GUIDE, "utf8")))) {
    const p = join(d, FILMS_DIR[fw], rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
  }
  return d;
}

/** Builds the guide's block and scene with a project's kit, for Node, and returns what the test needs from them. */
async function load(d: string, fw: Framework) {
  const { build } = await import("esbuild");
  const kit = join(d, KIT_DIR[fw]).split("\\").join("/"), films = join(d, FILMS_DIR[fw]).split("\\").join("/");
  const entry = join(d, "entry.ts"), out = join(d, "entry.mjs");
  writeFileSync(entry, [
    `export { tally, tallySize } from "${films}/blocks/tally";`,
    `export { scene, system, seconds } from "${films}/tally-film";`,
    `export { BLOCKS, boxOf } from "${kit}/scene/blocks";`,
    `export { makeCtx } from "${kit}/scene/context";`,
    `export { SYSTEMS } from "${kit}/systems";`,
  ].join("\n") + "\n");
  await build({ entryPoints: [entry], bundle: true, platform: "node", format: "esm", outfile: out, external: ["three"], logLevel: "silent" });
  return await import(pathToFileURL(out).href) as Record<string, any>;
}

const ctxOf = (m: Record<string, any>, id: string, w = 1080, h = 1920) => {
  const s = m.SYSTEMS.find((x: { id: string }) => x.id === id);
  return m.makeCtx(s, w, h, (t: string, r: string) => t.length * s.type[r].size * Math.min(w, h) * 0.5);
};
const quiet = <T>(f: () => T): { value: T; warned: string[] } => { const w = console.warn, said: string[] = []; console.warn = (s: string) => said.push(String(s)); try { return { value: f(), warned: said }; } finally { console.warn = w; } };

describe("the guide's worked example", () => {
  test("the guide has the block and the scene", () => {
    const files = guideFiles(readFileSync(GUIDE, "utf8"));
    expect(Object.keys(files).sort()).toEqual(["blocks/tally.ts", "tally-film.ts"]);
  });

  for (const fw of ["hyperframes", "remotion"] as const) {
    test(`${fw}: it builds with the kit, and it keeps the contract in a light and a dark system`, async () => {
      const m = await load(project(fw), fw);
      for (const sys of ["riso", "noir"]) {
        const ctx = ctxOf(m, sys);
        const props = { id: "tea", x: ctx.safe.left, y: ctx.safe.top + 200, w: ctx.safe.right - ctx.safe.left, h: 600, label: "Days with tea", count: 5, of: 7, at: 0.6 };
        // A pure function: the same props give the same nodes.
        const a = quiet(() => m.tally(props, ctx)), b = quiet(() => m.tally(props, ctx));
        expect(JSON.stringify(a.value)).toBe(JSON.stringify(b.value));
        expect(a.warned).toEqual([]);
        // Nodes with the block's id, colours and type as roles.
        for (const n of a.value) {
          expect(n.id.startsWith("tea-")).toBe(true);
          for (const k of ["color", "fill", "stroke"]) if (n[k] !== undefined) expect(ROLES.has(n[k])).toBe(true);
          if (n.kind === "text") expect(["display", "headline", "body", "label", "caption"]).toContain(n.role);
        }
        // Measure: the size function gives the box the nodes take.
        const box = m.boxOf(ctx, a.value), size = m.tallySize(props, ctx);
        expect(Math.abs(box.h - size.h)).toBeLessThan(1.5);
        expect(box.w).toBeLessThanOrEqual(props.w + 0.5);
        // The guard: a time it cannot honour throws; at before 0 shows at rest on frame 0.
        expect(() => quiet(() => m.tally({ ...props, at: 2, until: 1 }, ctx))).toThrow();
        const rest = quiet(() => m.tally({ ...props, at: -1 }, ctx)).value;
        for (const n of rest) for (const k of n.tracks?.opacity ?? []) expect(k.t).toBeGreaterThanOrEqual(0);
        // A warning, in the form the checks read, when the row does not fit.
        const tight = quiet(() => m.tally({ ...props, w: 120, of: 30 }, ctx));
        expect(tight.warned.some((s) => s.startsWith("tally tea: "))).toBe(true);
        // The scene builds with the block, in the frame of a phone and of a landscape screen.
        for (const [w, h] of [[1080, 1920], [1920, 1080]]) {
          const c = ctxOf(m, sys, w, h);
          const nodes = quiet(() => m.scene(c, m.BLOCKS)).value;
          expect(nodes.some((n: { id: string }) => n.id === "tea-mark-6")).toBe(true);
        }
      }
    }, 120000);
  }
});

// The film of the guide in installed projects: untell check in Remotion and in HyperFrames, with no error.
const projects = process.env.UNTELL_PROJECTS;
describe.skipIf(!projects)("the guide's film in installed projects", () => {
  for (const fw of ["remotion", "hyperframes"] as const) {
    test(`${fw}: untell check passes with no error`, () => {
      const d = join(projects!, fw);
      expect(existsSync(join(d, "node_modules", ".bin", "untell"))).toBe(true);
      for (const [rel, text] of Object.entries(guideFiles(readFileSync(GUIDE, "utf8")))) {
        mkdirSync(join(d, FILMS_DIR[fw], rel, ".."), { recursive: true });
        writeFileSync(join(d, FILMS_DIR[fw], rel), text);
      }
      const film = `${FILMS_DIR[fw]}/tally-film.ts`;
      const lint = spawnSync(join(d, "node_modules", ".bin", "untell"), ["lint", "--scope", "scene", `${FILMS_DIR[fw]}/blocks/tally.ts`], { cwd: d, encoding: "utf8" });
      expect(lint.status).toBe(0);
      expect(lint.stdout).not.toMatch(/warning|error  /);
      const r = spawnSync(join(d, "node_modules", ".bin", "untell"), ["check", film], { cwd: d, encoding: "utf8", timeout: 600000 });
      const rep = JSON.parse(readFileSync(join(d, ".untell", "check", "report.json"), "utf8"));
      expect(rep.film.scene).toBe(film);
      expect({ status: r.status, errors: rep.findings.filter((f: { severity: string }) => f.severity === "error").map((f: { check: string }) => f.check) }).toEqual({ status: 0, errors: [] });
      expect(rep.findings.some((f: { check: string; node?: string }) => f.check === "block-warning" && f.node?.startsWith("tea"))).toBe(false);
      cpSync(join(d, ".untell", "check", "report.json"), join(d, ".untell", "check", "own-block-report.json"));
    }, 600000);
  }
});
