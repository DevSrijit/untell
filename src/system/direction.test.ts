import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCKS } from "./scene/blocks";
import { DIRECTION, EFFECT_DRAWN_BY, mixTarget, SUBJECTS_TO_AVOID, type BlockName } from "./direction";
import { MEDIA_SPEC } from "./media-spec";
import { SYSTEMS } from "./systems";

/** The source file of a block. music and hit live in sound.ts; the ui kit's blocks live in ui.ts. */
const FILE_OF: Record<string, string> = { music: "sound", hit: "sound", uiWindow: "ui", listRow: "ui", button: "ui", field: "ui", cursor: "ui", badge: "ui", tab: "ui", toast: "ui" };
const blockFile = (b: string) => join(import.meta.dir, "scene/blocks", `${FILE_OF[b] ?? b}.ts`);
const src = (b: string) => readFileSync(blockFile(b), "utf8");
const isBlock = (b: string): b is BlockName => b in BLOCKS;

describe("the direction table", () => {
  test("covers every system and nothing else", () => {
    expect(Object.keys(DIRECTION).sort()).toEqual(SYSTEMS.map((s) => s.id).sort());
  });
  test("every effect has an entry in the drawer map", () => {
    for (const [e, d] of Object.entries(EFFECT_DRAWN_BY)) for (const u of d.blocks) expect(isBlock(u.block), `${e}: ${u.block}`).toBe(true);
  });
  test("the shared subjects list is not empty", () => {
    expect(SUBJECTS_TO_AVOID.length).toBeGreaterThan(3);
  });
  test("mixTarget falls back to -16 LUFS", () => {
    expect(mixTarget("nope").lufs).toBe(-16);
    expect(mixTarget("ma").lufs).toBe(DIRECTION.ma!.mix.lufs);
  });
});

describe.each(SYSTEMS.map((s) => [s.id, s] as const))("%s", (id, s) => {
  const d = DIRECTION[id]!;
  const media = MEDIA_SPEC[id]!;

  test("has every field", () => {
    expect(["picture", "line", "both"]).toContain(d.hook.show);
    expect(d.hook.how.length).toBeGreaterThan(20);
    expect(d.moves.length).toBeGreaterThanOrEqual(2);
    expect(d.moves.length).toBeLessThanOrEqual(4);
    expect(d.blocks.length).toBeGreaterThanOrEqual(3);
    expect(d.blocks.length).toBeLessThanOrEqual(7);
    expect(d.avoid.length).toBeGreaterThan(0);
    expect(d.ends.how.length).toBeGreaterThan(20);
    expect(d.maxStill).toBeGreaterThan(0);
    expect(d.mix.note.length).toBeGreaterThan(10);
    expect(d.shots.match.length).toBeGreaterThan(10);
    expect(Array.isArray(d.subjectsToAvoid)).toBe(true);
  });

  test("the hook lands in the first 2 s and says what it shows", () => {
    expect(d.hook.by).toBeGreaterThanOrEqual(0);
    expect(d.hook.by).toBeLessThanOrEqual(2);
    if (d.hook.show !== "picture") expect(d.hook.role, "a line needs its role").toBeDefined();
    if (d.hook.show !== "line") expect(d.hook.area, "a picture needs its area").toBeGreaterThan(0);
  });

  test("every move is marked measurable or not, and a measurable one says how", () => {
    for (const m of d.moves) {
      expect(m.move.length).toBeGreaterThan(15);
      if (m.measurable) { expect(m.measurable.check.length).toBeGreaterThan(2); expect(m.measurable.how.length).toBeGreaterThan(15); }
    }
  });

  test("a move that draws an effect uses one the system allows", () => {
    for (const m of d.moves) if (m.effect) expect(s.allows, m.move).toContain(m.effect);
    for (const w of d.wanted) if (w.effect) expect(s.allows, w.name).toContain(w.effect);
  });

  test("every block exists in the catalog, and every prop in the block's props", () => {
    for (const u of [...d.blocks.map((b) => b.block), ...d.avoid.map((a) => a.block)]) {
      expect(isBlock(u), `${u} is not a block`).toBe(true);
      expect(existsSync(blockFile(u)), `${u} has no source file`).toBe(true);
    }
    for (const u of d.blocks) {
      const text = src(u.block);
      for (const p of Object.keys(u.props)) expect(new RegExp(`\\b${p}\\??:`).test(text), `${u.block} has no prop ${p}`).toBe(true);
    }
  });

  test("a block is not both used and avoided", () => {
    const used = new Set(d.blocks.map((b) => b.block));
    for (const a of d.avoid) expect(used.has(a.block), a.block).toBe(false);
  });

  test("every effect the system allows has a block that draws it, or a wanted entry", () => {
    const used = new Set(d.blocks.map((b) => b.block));
    for (const e of s.allows) {
      const by = EFFECT_DRAWN_BY[e];
      const drawn = !!by.renderer || by.blocks.some((b) => used.has(b.block));
      const wanted = d.wanted.some((w) => w.effect === e);
      expect(drawn || wanted, `${id} allows ${e}, but no block in its map draws it and no wanted entry names it`).toBe(true);
    }
  });

  test("the music role agrees with the Media spec", () => {
    expect(d.mix.music === "none").toBe(media.music.level === 0);
    expect(d.mix.lufs).toBeGreaterThanOrEqual(-28);
    expect(d.mix.lufs).toBeLessThanOrEqual(-12);
    expect(d.mix.range).toBeGreaterThan(0);
  });

  test("the shot count agrees with the Media spec", () => {
    if (media.pictures.use === "none") expect(d.shots.min).toBe(0);
    else expect(d.shots.min).toBeGreaterThanOrEqual(1);
    if (media.pictures.use === "hero" || media.pictures.use === "support") expect(d.avoid.map((a) => a.block)).not.toContain("photo");
  });

  test("the end holds for a time that fits its kind", () => {
    if (d.ends.kind === "cut") expect(d.ends.hold).toBe(0);
    else { expect(d.ends.hold).toBeGreaterThanOrEqual(1); expect(d.ends.hold).toBeLessThanOrEqual(2.5); }
    if (d.ends.impact) expect(media.hits.allowed.some((h) => h === "impact"), "an impact the system has no effect for").toBe(true);
  });

  test("the block map names the block that makes the system's own ending", () => {
    expect(d.blocks.map((b) => b.block), `${id}: its end block ${d.ends.block}`).toContain(d.ends.block);
    expect(d.ends.with.length).toBeGreaterThan(10);
  });

  test("names no asset source", () => {
    const all = JSON.stringify(d).toLowerCase();
    // A source is a site: the direction holds no link and no domain name.
    expect(all).not.toMatch(/https?:\/\/|www\.|\.(com|org|net|io|co)\b/);
    expect(all).not.toContain("stock");
  });
});

test("a clock system's stillness limit follows the tempo: two beats of the track are not a stall", async () => {
  const { DIRECTION, maxStillFor } = await import("./direction");
  for (const [id, d] of Object.entries(DIRECTION)) {
    if (!d.maxStillBeats) continue;
    expect(d.mix.music, id).toBe("clock");
    // maxStill covers the beats at 115 BPM, so a check with no tempo passes a word held for two beats of a common track.
    expect(d.maxStill, id).toBeGreaterThanOrEqual((d.maxStillBeats * 60) / 115 - 1e-9);
    expect(maxStillFor(d, 124), id).toBeGreaterThanOrEqual(0.967);
    // Two beats at the track's tempo, with four frames of slack for the frame grid (a cut on the beat shows a frame late).
    expect(maxStillFor(d, 90), id).toBeCloseTo((d.maxStillBeats * 60) / 90 + 4 / 30);
  }
  expect(DIRECTION.kinetic!.maxStillBeats).toBe(2);
});

// A name a direction gives in its prose (a block, a prop, a prop's value, a helper: `quote({ picture })`, toGround,
// lineOverPicture) exists in the kit. Title's direction once named flashCuts, a block that was never built.
test("every name the directions write exists: a block, a prop or its value, a helper, a colour role or a direction field", async () => {
  const { readdirSync } = await import("node:fs");
  const scene = join(import.meta.dir, "scene");
  const files = [...readdirSync(join(scene, "blocks")).map((f) => join(scene, "blocks", f)), ...readdirSync(scene).filter((f) => f.endsWith(".ts")).map((f) => join(scene, f)),
    join(import.meta.dir, "direction.ts"), join(import.meta.dir, "systems.ts")].filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  const src = files.map((f) => readFileSync(f, "utf8")).join("\n");
  const defined = (n: string) => n in BLOCKS || new RegExp(`\\b${n}\\??:|export (function|const|type) ${n}\\b|"${n}"`).test(src);
  const bad: string[] = [];
  for (const [id, d] of Object.entries(DIRECTION)) {
    const texts = [d.compose?.how, d.hook.how, ...d.moves.flatMap((m) => [m.move, typeof m.measurable === "object" ? m.measurable.how : ""]), ...d.blocks.flatMap((b) => [b.for, ...Object.values(b.props)]),
      d.ends.how, d.ends.with, d.mix.note, ...d.wanted.map((w) => w.for)].filter((t): t is string => !!t);
    const names = new Set(texts.flatMap((t) => [...t.matchAll(/`([A-Za-z][A-Za-z0-9]*)/g), ...t.matchAll(/\b([a-z]+[A-Z][A-Za-z0-9]*)\b/g)].map((m) => m[1]!)));
    for (const n of names) if (!defined(n)) bad.push(`${id}: ${n}`);
  }
  expect(bad).toEqual([]);
});
