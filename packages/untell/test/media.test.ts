// Unit tests for the media tools' logic: the paths, the names, the kinds, the manifest, the lock and the table.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkName, extOfUrl, kindOfExt, mediaPaths, storedExt } from "../src/media-paths";
import { LOCK_STALE_MS, locked, readManifest, tableSource, TABLE_TYPES, updateManifest, writeTable } from "../src/media-store";
import { warnings } from "../src/media";
import { registryDir } from "../src/kit";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "untell-media-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A project with an empty kit folder of the framework. */
function project(fw: "remotion" | "hyperframes") {
  const d = tmp();
  mkdirSync(join(d, fw === "remotion" ? "src/untell" : "untell"), { recursive: true });
  return d;
}

describe("mediaPaths", () => {
  test("Remotion: public/media, the kit in src/untell", () => {
    const d = project("remotion");
    const p = mediaPaths(d);
    expect(p.framework).toBe("remotion");
    expect(p.media).toBe(join(d, "public/media"));
    expect(p.table).toBe(join(d, "src/untell/media.gen.ts"));
    expect(p.manifest).toBe(join(d, "untell-media.json"));
    expect(p.lock).toBe(join(d, ".untell/media.lock"));
  });
  test("HyperFrames: assets/media, the kit in untell", () => {
    const d = project("hyperframes");
    const p = mediaPaths(d);
    expect(p.media).toBe(join(d, "assets/media"));
    expect(p.table).toBe(join(d, "untell/media.gen.ts"));
  });
  test("the kit decides when the project has both markers", () => {
    const d = project("hyperframes");
    writeFileSync(join(d, "hyperframes.json"), "{}");
    writeFileSync(join(d, "package.json"), JSON.stringify({ dependencies: { remotion: "4.0.0" } }));
    expect(mediaPaths(d).framework).toBe("hyperframes");
  });
  test("no kit and no markers is an error", () => expect(() => mediaPaths(tmp())).toThrow(/untell init/));
});

describe("checkName", () => {
  test("takes a folder name", () => expect(checkName("athlete-back-2")).toBe("athlete-back-2"));
  for (const bad of ["", "..", "../x", "a/b", "Big", "-x", "a b", ".hidden", "x".repeat(65)]) {
    test(`refuses ${JSON.stringify(bad)}`, () => expect(() => checkName(bad)).toThrow(/not an asset name/));
  }
  test("refuses no name", () => expect(() => checkName(undefined)).toThrow());
});

describe("kinds", () => {
  test("from the extension", () => {
    expect(kindOfExt(".JPG")).toBe("photo");
    expect(kindOfExt(".webp")).toBe("photo");
    expect(kindOfExt(".mov")).toBe("video");
    expect(kindOfExt(".wav")).toBe("audio");
    expect(kindOfExt(".glb")).toBe("model");
    expect(kindOfExt(".pdf")).toBeNull();
  });
  test("stored extension", () => { expect(storedExt(".JPEG")).toBe(".jpg"); expect(storedExt(".MP4")).toBe(".mp4"); });
  test("a URL: the path first, then the content type", () => {
    expect(extOfUrl("https://x.test/a/b.mp3?x=1", "text/html")).toBe(".mp3");
    expect(extOfUrl("https://x.test/download/123", "image/jpeg; charset=binary")).toBe(".jpg");
    expect(extOfUrl("https://x.test/page", "text/html")).toBeNull();
  });
});

describe("warnings", () => {
  test("a small photo and slow footage get a note, never a refusal", () => {
    expect(warnings("photo", { width: 640, height: 480 })[0]).toMatch(/window or a small box/);
    expect(warnings("photo", { width: 853, height: 1280 })[0]).toMatch(/a little soft/);
    expect(warnings("photo", { width: 3000, height: 2000 })).toEqual([]);
    expect(warnings("video", { width: 1920, height: 1080, fps: 15 }).join()).toMatch(/15.00 fps/);
    expect(warnings("sfx", { duration: 12, sampleRate: 22050 }).length).toBe(2);
    expect(warnings("music", null)).toEqual([]);
  });
});

describe("the manifest", () => {
  test("updateManifest adds and removes entries, sorted", () => {
    const p = mediaPaths(project("remotion"));
    expect(readManifest(p)).toEqual({});
    updateManifest(p, (m) => { m["b"] = { kind: "sfx", file: "source.wav" }; });
    updateManifest(p, (m) => { m["a"] = { kind: "photo", file: "source.jpg", source: "free text", licence: "free text" }; });
    expect(Object.keys(JSON.parse(readFileSync(p.manifest, "utf8")))).toEqual(["a", "b"]);
    updateManifest(p, (m) => { delete m["b"]; });
    expect(readManifest(p)).toEqual({ a: { kind: "photo", file: "source.jpg", source: "free text", licence: "free text" } });
    expect(existsSync(p.lock)).toBe(false);
  });
});

describe("the lock", () => {
  test("it is released after a throw, and a nested call runs inside", () => {
    const p = mediaPaths(project("remotion"));
    expect(() => locked(p, () => { throw new Error("boom"); })).toThrow("boom");
    expect(existsSync(p.lock)).toBe(false);
    expect(locked(p, () => locked(p, () => existsSync(p.lock)))).toBe(true);
    expect(existsSync(p.lock)).toBe(false);
  });
  test("a held lock makes the caller wait, then fail", () => {
    const p = mediaPaths(project("remotion"));
    mkdirSync(p.lock, { recursive: true });
    const t0 = Date.now();
    expect(() => locked(p, () => 1, 200)).toThrow(/held by another run/);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(150);
  });
  test("a stale lock is taken over", () => {
    const p = mediaPaths(project("remotion"));
    mkdirSync(p.lock, { recursive: true });
    const old = (Date.now() - LOCK_STALE_MS - 5000) / 1000;
    utimesSync(p.lock, old, old);
    expect(locked(p, () => 7, 200)).toBe(7);
  });
  test("parallel writers lose no entries", async () => {
    const d = project("hyperframes");
    const script = join(d, "w.ts");
    writeFileSync(script, `import { mediaPaths } from ${JSON.stringify(join(import.meta.dir, "../src/media-paths"))};
import { updateManifest } from ${JSON.stringify(join(import.meta.dir, "../src/media-store"))};
const p = mediaPaths(${JSON.stringify(d)});
for (let i = 0; i < 10; i++) updateManifest(p, (m) => { m[process.argv[2] + "-" + i] = { kind: "sfx", file: "source.mp3" }; });
`);
    const runs = ["a", "b", "c", "d"].map((k) => Bun.spawn(["bun", script, k]));
    await Promise.all(runs.map((r) => r.exited));
    expect(Object.keys(readManifest(mediaPaths(d))).length).toBe(40);
  });
});

describe("the media table", () => {
  test("its types are the kit's types", () => {
    const kit = readFileSync(join(registryDir(), "kit", "media.gen.ts"), "utf8");
    expect([...(kit.match(/^export type .*$/gm) ?? [])]).toEqual(TABLE_TYPES);
  });
  test("sounds go to SOUNDS, pictures to MEDIA, models to MODELS", () => {
    const src = tableSource({
      "m-bed": { kind: "music", file: "source.mp3", duration: 120.5, peak: 31.2 },
      shot: { kind: "photo", width: 2000, height: 3000, subject: [0.1, 0.2, 0.9, 1], centre: [0.5, 0.6], grade: "courtside", mask: { cols: 64, rows: 96, data: "0f" } },
      clip: { kind: "video", width: 1080, height: 1920, subject: [0, 0, 1, 1], centre: [0.5, 0.5], grade: "none", duration: 6.5, mask: null },
    }, "public/media");
    expect(src).toContain('"m-bed": { kind: "music", file: "source.mp3", duration: 120.5, peak: 31.2 },');
    expect(src).toContain('"clip": { kind: "video", width: 1080, height: 1920, subject: [0,0,1,1], centre: [0.5,0.5], grade: "none", duration: 6.5,');
    expect(src).toContain("public/media/<name>/");
    const sounds = src.slice(src.indexOf("SOUNDS"), src.indexOf("export const MEDIA"));
    expect(sounds).not.toContain("shot");
    expect(src.slice(src.indexOf("export const MEDIA"))).toContain('"shot"');
  });
  test("the table compiles to the right values", async () => {
    const d = tmp();
    const f = join(d, "t.ts");
    writeFileSync(f, tableSource({ hit: { kind: "sfx", file: "source.wav", duration: 0.5, peak: 0.07 } }, "assets/media"));
    const m = await import(f);
    expect(m.SOUNDS.hit).toEqual({ kind: "sfx", file: "source.wav", duration: 0.5, peak: 0.07 });
    expect(m.MEDIA).toEqual({});
  });
  test("writeTable lists only assets in the manifest that have a meta.json", () => {
    const p = mediaPaths(project("hyperframes"));
    updateManifest(p, (m) => { m["a"] = { kind: "sfx", file: "source.mp3" }; m["b"] = { kind: "photo", file: "source.jpg" }; });
    mkdirSync(join(p.media, "a"), { recursive: true });
    writeFileSync(join(p.media, "a", "meta.json"), JSON.stringify({ kind: "sfx", file: "source.mp3", duration: 1, peak: 0.1 }));
    mkdirSync(join(p.media, "stray"), { recursive: true });
    writeFileSync(join(p.media, "stray", "meta.json"), JSON.stringify({ kind: "sfx", file: "x.mp3", duration: 1, peak: 0 }));
    writeTable(p);
    const t = readFileSync(p.table, "utf8");
    expect(t).toContain('"a": { kind: "sfx"');
    expect(t).not.toContain('"b"');
    expect(t).not.toContain("stray");
  });
});

describe("bandsAt: an effect's octave bands at its peak, the detector's band measure", () => {
  test("a 90 Hz tone puts its energy in 60-120 Hz, a 5 kHz tone in 4-8 kHz", () => {
    const { bandsAt } = require("../src/media") as typeof import("../src/media");
    const rate = 44100;
    for (const [hz, band] of [[90, 0], [5000, 6]] as const) {
      const x = new Float32Array(rate * 0.5).map((_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate));
      const b = bandsAt(x, rate, 0.25);
      expect(b.length).toBe(8);
      expect(b.indexOf(Math.max(...b))).toBe(band);
    }
  });
  test("the table writes an effect's bands, and its type holds them", () => {
    const src = tableSource({ thump: { kind: "sfx", file: "a.wav", duration: 0.5, peak: 0.1, lufs: -15, peakDb: -1, bands: [50, 46, 30, 20, 10, 5, 0, -5] } }, "public/media");
    expect(src).toContain("bands: [50,46,30,20,10,5,0,-5]");
    expect(TABLE_TYPES.join("\n")).toContain("bands?: number[]");
  });
});
