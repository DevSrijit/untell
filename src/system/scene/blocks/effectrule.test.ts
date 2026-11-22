// Before: hit aimed at 8 dB over the bed while sound/effect-too-loud warned at 6 dB over it. One rule (the header
// of sound.ts): a hit with default props must pass the check.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SOUNDS } from "../../media.gen";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import type { Ctx, Node } from "../types";
import { BLOCKS as B } from ".";

const ROOT = join(import.meta.dir, "../../../..");
const ctx: Ctx = (() => { const s = SYSTEMS.find((x) => x.id === "keynote")!; return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.55); })();
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
// The sound files do not ship with the repository: with none on disk, the test does not run.
const onDisk = (m: string) => existsSync(join(ROOT, "assets/media", m));
const sfx = Object.entries(SOUNDS).filter(([, v]) => v.kind === "sfx").map(([k]) => k).filter(onDisk).slice(0, 6);
const beds = ["keynote-music-2", "studio-music-4", "console-music-4"].filter((m) => SOUNDS[m] && onDisk(m));

describe("the effect rule: a hit with default props passes sound/effect-too-loud", () => {
  test.skipIf(!sfx.length || !beds.length)("every pair of a bed and an effect", () => {
    const d = mkdtempSync(join(tmpdir(), "untell-fx-"));
    const films: Node[][] = [];
    for (const bed of beds) for (const fx of sfx) {
      const music = quiet(() => B.music({ id: "bed", media: bed, from: 20, until: 6 }, ctx));
      films.push([...music, ...quiet(() => B.hit({ id: "hit", media: fx, at: 3, bed: music }, ctx))]);
    }
    writeFileSync(join(d, "films.json"), JSON.stringify(films.map((ns) => ns.filter((n) => n.kind === "audio"))));
    const r = spawnSync("python3", ["-c", `import sys, json; sys.path[:0] = ["${join(ROOT, "scripts/inspect")}", "${join(ROOT, "scripts/inspect/checks")}"]
import sound_checks
for nodes in json.load(open("${join(d, "films.json")}")):
    out, rows = sound_checks.check_effect_level(nodes, 6.0)
    assert rows and any(r["peakDb"] > -100 for r in rows), ("no effect measured", nodes)
    print(json.dumps([(f["check"], f["severity"], f["measured"]) for f in out]), file=sys.stdout)
    print("ROW", [(r["id"], round(r["peakDb"] - (r["bedPeakNearDb"] or -99), 1), len(nodes)) for r in rows], file=sys.stderr)`], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
    expect(r.stderr.split("\n").filter((l) => /Error|Traceback/.test(l))).toEqual([]);
    const bad = r.stdout.trim().split("\n").map((l) => JSON.parse(l)).flat();
    expect(bad).toEqual([]);
  }, 300000);
});

// The Cutout reel's last stamp stood 4.8 dB over the bed in its band (120-250 Hz) after a 12 dB dip: hit set its dip by
// the loudness, not by the band where the bed covers the hit. Now a hit with default props is heard by the check
// sound/hit-over-bed (the band measure), or the build says that no dip can clear it.
describe("the band: a hit with default props is heard where the bed covers it", () => {
  const all = Object.entries(SOUNDS).filter(([, v]) => v.kind === "sfx" && v.bands).map(([k]) => k).filter(onDisk);
  const bands = ["cutout-music-1", "graphite-music-8", "schematic-music-2", "keynote-music-2"].filter((m) => SOUNDS[m] && onDisk(m));
  test.skipIf(!all.length || !bands.length)("every pair of a bed and an effect, at two times", () => {
    const d = mkdtempSync(join(tmpdir(), "untell-band-"));
    const films: { nodes: Node[]; said: boolean }[] = [];
    for (const bed of bands) for (const fx of all) for (const t of [2.2, 3.7]) {
      const music = quiet(() => B.music({ id: "bed", media: bed, from: 30, until: 6 }, ctx));
      const said: string[] = [], w = console.warn;
      console.warn = (...m: unknown[]) => said.push(m.map(String).join(" "));
      let nodes: Node[];
      try { nodes = B.hit({ id: "hit", media: fx, at: t, bed: music }, ctx); } finally { console.warn = w; }
      films.push({ nodes: [...music, ...nodes].filter((n) => n.kind === "audio"), said: said.some((m) => /no dip|more than a dip/.test(m)) });
    }
    writeFileSync(join(d, "films.json"), JSON.stringify(films.map((f) => f.nodes)));
    const r = spawnSync("python3", ["-c", `import sys, json; sys.path[:0] = ["${join(ROOT, "scripts/inspect")}", "${join(ROOT, "scripts/inspect/checks")}"]
import sound_checks
for nodes in json.load(open("${join(d, "films.json")}")):
    out, _ = sound_checks.check_hits(nodes, 6.0)
    print(json.dumps([f["measured"].get("overBedInBandDb") for f in out if f["check"] == "hit-over-bed"]))`], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
    expect(r.stderr.split("\n").filter((l) => /Error|Traceback/.test(l))).toEqual([]);
    const masked = r.stdout.trim().split("\n").map((l, i) => ({ i, m: JSON.parse(l) as number[] })).filter((x) => x.m.length);
    // Each masked hit is one the build said it cannot clear.
    expect(masked.filter((x) => !films[x.i]!.said)).toEqual([]);
    // And those are few: the plan holds for nearly every pair.
    expect(masked.length).toBeLessThanOrEqual(Math.ceil(films.length * 0.02));
  }, 300000);
});

test("the block and the check state one ceiling over the bed", async () => {
  const { NEAR_PEAK_MAX } = await import("./sound");
  const r = spawnSync("python3", ["-c", `import sys, json; sys.path[:0] = ["${join(ROOT, "scripts/inspect")}"]
import sound_checks; print(json.dumps(sound_checks.NEAR_PEAK_MAX))`], { cwd: ROOT, encoding: "utf8" });
  expect(JSON.parse(r.stdout)).toEqual(NEAR_PEAK_MAX);
});
