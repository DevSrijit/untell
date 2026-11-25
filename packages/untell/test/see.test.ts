// untell see (src/see.ts) and the measures it reads (src/measures.ts): the pure parts, then runs on small clips that
// ffmpeg makes in the test (two hard cuts, no sound, a freeze, 16:9 and 1:1, a rotated clip, three minutes).
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { detectorPython, runs } from "../src/env";
import { aspectOf, cutsOnSound, DROP_STEPS, energyCurve, estimateTokens, fitBudget, judgeStalls, measureVideo, pageLayout, perPage, probeVideo, SEE_VERSION, seeDocument, sheetStep, thinEvenly, type FindingsMeasures, type SeeDoc, type VideoMeasures } from "../src/measures";
import { parseBudget, seeDir, seeSummary } from "../src/see";
import { COMMAND_TABLE, helpFor } from "../src/help";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "untell-see-")); dirs.push(d); return d; };
afterAll(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("the pure parts", () => {
  test("the aspect is a ratio of small numbers when one is close", () => {
    expect(aspectOf(1920, 1080)).toBe("16:9");
    expect(aspectOf(1080, 1920)).toBe("9:16");
    expect(aspectOf(1080, 1080)).toBe("1:1");
    expect(aspectOf(1080, 1350)).toBe("4:5");
    expect(aspectOf(1440, 1280)).toBe("9:8");
    expect(aspectOf(1000, 370)).toBe("2.7:1");
  });
  test("the sheet step keeps a film to 72 frames or fewer, and a page to 8-12 frames", () => {
    expect(sheetStep(15)).toBe(0.5);
    expect(sheetStep(40)).toBe(1);
    expect(Math.ceil(180 / sheetStep(180))).toBeLessThanOrEqual(72);
    expect(Math.ceil(3600 / sheetStep(3600))).toBeLessThanOrEqual(72);
    expect(sheetStep(2)).toBe(0.25);
    for (const n of [13, 20, 30, 41, 60, 72]) { const p = perPage(n); expect(p).toBeGreaterThanOrEqual(8); expect(p).toBeLessThanOrEqual(12); }
    expect(perPage(5)).toBe(5);
  });
  test("a page is about 1500 px on its long side, in any frame shape", () => {
    for (const [w, h] of [[1920, 1080], [1080, 1920], [1080, 1080], [3840, 1600]] as const) {
      const { cols, tw } = pageLayout(w, h, 12);
      const rows = Math.ceil(12 / cols), th = tw * h / w;
      const width = 72 + 32 + cols * tw, height = 16 * 2 + 90 + rows * (th + 72 + 16 + 24);
      expect(Math.max(width, height)).toBeGreaterThan(1200);
      expect(Math.max(width, height)).toBeLessThanOrEqual(1560);
    }
  });
  test("the level curve and the cuts on the sound", () => {
    expect(energyCurve([0.1, 0.1, 0.1, 0.1], 0.02)).toEqual([-20, -20]);
    expect(cutsOnSound([1, 2, 3], [1.01, 2.5], null, 0.067)).toEqual({ cuts: 3, onOnset: 1, onBeat: null, within: 0.067 });
    expect(cutsOnSound([], [1], null, 0.067)).toBeNull();
  });
  test("onsets over the limit are kept evenly over the whole film, not the first part", () => {
    const xs = Array.from({ length: 150 }, (_, i) => i / 10);
    const t = thinEvenly(xs, 64);
    expect(t.every).toBe(3);
    expect(t.kept.length).toBeLessThanOrEqual(64);
    expect(t.kept.at(-1)!).toBeGreaterThan(14);
    expect(thinEvenly([1, 2, 3], 64)).toEqual({ kept: [1, 2, 3], every: 1 });
  });
  test("each stall says what the stall rule makes of it", () => {
    const fi = { system: null, limits: { stall: 1.8, lufs: -16, lufsRange: 2 }, findings: [{ check: "stall", severity: "error", from: 3.4, to: 5.6, measured: null, limit: null }] } as unknown as FindingsMeasures;
    const rows = judgeStalls([[1.4, 2.8], [3.5, 5.67], [8.5, 11]], 11, 30, fi);
    expect(rows.map((r) => r.rule)).toEqual(["under the limit", "fault", "end hold"]);
    expect(rows[0]!.why).toContain("1.8 s");
    expect(rows[2]!.why).toContain("--system");
    expect(judgeStalls([[1, 3]], 10, 30, null)[0]!.rule).toBe("not judged");
  });
  test("--budget takes a whole number of 1000 or more", () => {
    expect(parseBudget(undefined)).toBe(6000);
    expect(parseBudget("2000")).toBe(2000);
    expect(() => parseBudget("abc")).toThrow(/whole number/);
    expect(() => parseBudget("100")).toThrow(/1000 or more/);
  });
  test("the command is in the help and the command table", () => {
    expect(helpFor("see")).toContain("Give a model a video");
    expect(COMMAND_TABLE.see!.flags).toEqual(expect.arrayContaining(["--json", "--out", "--budget", "--theme"]));
    expect(seeDir("/p", "/x/My Clip.MP4")).toBe("/p/.untell/see/my-clip");
    expect(seeDir("/p", "/x/a.mp4", "out/a")).toBe("/p/out/a");
  });
});

// A document with many shots, made by hand: the budget drops detail in the stated order and records each step.
function bigDoc(shots: number): SeeDoc {
  const s = Array.from({ length: shots }, (_, i) => ({ from: i * 2, to: i * 2 + 2, motion: "low", brightness: 0.5, palette: [["#101010", 0.6], ["#F0F0F0", 0.3], ["#FF0000", 0.1]],
    ink: ["0123", "4567", "8900", "1111"], text: { zones: ["#...", "....", "....", "...."], words: "a line of words that the shot shows on screen for a while, long enough" } }));
  return {
    version: 1, file: { seconds: shots * 2 }, timeline: { cuts: s.slice(1).map((x) => [x.from, 0.9]), shots: s },
    sound: { energy: { step: 1, db: Array.from({ length: shots * 2 }, () => -20) }, onsets: { count: 200, times: Array.from({ length: 64 }, (_, i) => i / 3) } },
    findings: { causes: [{ check: "stall", fix: "x" }], findings: Array.from({ length: 20 }, () => ({ check: "stall", measured: { still: 2 }, limit: { max: 1.8 } })), ran: ["stall"] },
    notes: { dropped: [], notMeasured: [] },
  } as SeeDoc;
}

describe("the budget", () => {
  test("a document over the budget drops detail in the stated order until it fits, and says what it dropped", () => {
    const full = bigDoc(120);
    const fit = fitBudget(full, 6000);
    expect(fit.fits).toBe(true);
    expect(fit.tokens).toBeLessThanOrEqual(6000);
    expect(estimateTokens(fit.text)).toBe(fit.tokens);
    expect(fit.dropped.length).toBeGreaterThan(0);
    expect(fit.dropped[0]).toMatch(/onset times/);
    const doc = JSON.parse(fit.text) as { budget: { used: number; tokens: number; estimate: string }; notes: { dropped: string[] } };
    expect(doc.budget.used).toBe(fit.tokens);
    expect(doc.budget.estimate).toMatch(/divided by 3/);
    expect(doc.notes.dropped).toEqual(fit.dropped);
    // The full document is untouched, and a large budget drops nothing.
    expect((full.notes as { dropped: string[] }).dropped).toEqual([]);
    expect(fitBudget(full, 200000).dropped).toEqual([]);
  });
  test("a budget too small for the smallest form says so and keeps that form", () => {
    const fit = fitBudget(bigDoc(120), 100);
    expect(fit.fits).toBe(false);
    expect(JSON.parse(fit.text).notes.budget).toMatch(/too small/);
    expect(DROP_STEPS.length).toBeGreaterThan(10);
  });
});

// measureVideo needs the detector's Python (numpy, Pillow, scipy); without it, it would set one up in the test folder.
const canRun = runs("ffmpeg") && !!detectorPython(process.cwd());
// -display_rotation is an input option of ffmpeg 6 and later.
const canTurn = canRun && /display_rotation/.test(spawnSync("ffmpeg", ["-hide_banner", "-h", "full"], { encoding: "utf8", maxBuffer: 64 << 20 }).stdout ?? "");
const ff = (args: string[]) => { const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...args], { encoding: "utf8" }); if (r.status !== 0) throw new Error(r.stderr); };
const quiet = () => {};

describe.skipIf(!canRun)("runs on clips that ffmpeg makes", () => {
  const d = tmp();
  const measure = (file: string, name: string, findings = false) => measureVideo(d, join(d, file), { outDir: join(d, "out", name), findings, ocr: false, log: quiet });

  test("two hard cuts give two cuts at their times, and a silent clip has sound null with a why", async () => {
    ff(["-f", "lavfi", "-i", "color=c=0x202020:s=320x180:r=30:d=2", "-f", "lavfi", "-i", "color=c=0xE0E0E0:s=320x180:r=30:d=2", "-f", "lavfi", "-i", "color=c=0x2050C0:s=320x180:r=30:d=2",
      "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(d, "cuts.mp4")]);
    const m = await measure("cuts.mp4", "cuts");
    expect(m.picture.cuts.map((c) => c.t)).toEqual([2, 4]);
    expect(m.picture.cuts.every((c) => c.strength > 0.5)).toBe(true);
    expect(m.picture.shots.length).toBe(3);
    expect(m.sound).toBeNull();
    const doc = seeDocument(m, "test");
    expect(doc.sound).toBeNull();
    expect((doc.why as Record<string, string>).sound).toMatch(/no audio stream/);
    expect(m.pages.length).toBe(1);
    expect(m.pages[0]!.frames).toBe(12);
  }, 120000);

  test("a cross-fade between two slides ends a shot with no hard cut; a wipe too", async () => {
    ff(["-f", "lavfi", "-i", "color=c=0xF0F0F0:s=640x360:r=30:d=3", "-f", "lavfi", "-i", "color=c=0xF0F0F0:s=640x360:r=30:d=3",
      "-filter_complex", "[0:v]drawbox=x=60:y=80:w=300:h=60:color=0x101010:t=fill,drawbox=x=60:y=170:w=200:h=40:color=0x101010:t=fill[a];[1:v]drawbox=x=300:y=200:w=280:h=80:color=0x2040C0:t=fill,drawbox=x=300:y=100:w=200:h=40:color=0x101010:t=fill[b];[a][b]xfade=transition=fade:duration=0.6:offset=2.4,format=yuv420p[v]",
      "-map", "[v]", "-c:v", "libx264", join(d, "xfade.mp4")]);
    const m = await measure("xfade.mp4", "xfade");
    expect(m.picture.cuts.length).toBe(0);
    expect(m.picture.shots.map((s) => s.by)).toEqual(["start", "fade"]);
    expect(m.picture.shots[1]!.from).toBeGreaterThan(2.4);
    expect(m.picture.shots[1]!.from).toBeLessThan(3.0);
    const doc = seeDocument(m, "test") as { timeline: { changes: unknown[][] } };
    expect(doc.timeline.changes[0]![1]).toBe("fade");
    ff(["-f", "lavfi", "-i", "color=c=0xF0F0F0:s=640x360:r=30:d=3", "-f", "lavfi", "-i", "color=c=0x202020:s=640x360:r=30:d=3",
      "-filter_complex", "[0:v][1:v]xfade=transition=wipeleft:duration=0.5:offset=2.5,format=yuv420p[v]", "-map", "[v]", "-c:v", "libx264", join(d, "wipe.mp4")]);
    const w = await measure("wipe.mp4", "wipe");
    expect(w.picture.shots.map((s) => s.by)).toEqual(["start", "wipe"]);
  }, 120000);

  test("a 3 s freeze is a stall, and the rules find it with the ids of untell check <video>", async () => {
    ff(["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=0.04", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1",
      "-f", "lavfi", "-i", "sine=f=440:d=5:sample_rate=48000",
      "-filter_complex", "[1:v]loop=loop=89:size=1:start=0,setpts=N/30/TB[still];[0:v][still][2:v]concat=n=3:v=1:a=0[v]",
      "-map", "[v]", "-map", "3:a", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(d, "freeze.mp4")]);
    const m = await measure("freeze.mp4", "freeze", true);
    const long = m.picture.stalls.filter(([a, b]) => b - a >= 2.5);
    expect(long.length).toBe(1);
    expect(long[0]![0]).toBeGreaterThan(0.9);
    expect(long[0]![1]).toBeLessThan(4.2);
    expect(m.sound).not.toBeNull();
    expect(m.sound!.lufsIntegrated).toBeLessThan(0);
    expect(m.findings!.findings.some((f) => f.check === "stall")).toBe(true);
    expect(m.findings!.ran).toContain("stall");
    expect(m.findings!.limits.stall).toBeGreaterThan(0);
    const rows = (seeDocument(m, "test").pace as { stalls: { from: number; to: number; rule: string }[] }).stalls;
    expect(rows.find((r) => r.to - r.from >= 2.5)!.rule).toBe("fault");
  }, 180000);

  test("a 16:9 clip and a 1:1 clip: the aspect, pages of 8 to 12 frames, the summary names the pictures and the JSON", async () => {
    for (const [s, aspect] of [["640x360", "16:9"], ["480x480", "1:1"]] as const) {
      const name = `clip-${aspect.replace(":", "x")}`;
      ff(["-f", "lavfi", "-i", `testsrc2=s=${s}:r=25:d=9`, "-f", "lavfi", "-i", "sine=f=220:d=9", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(d, `${name}.mp4`)]);
      const m = await measure(`${name}.mp4`, name);
      expect(m.file.aspect).toBe(aspect);
      expect(m.pages.length).toBeGreaterThan(0);
      for (const p of m.pages.slice(0, -1)) { expect(p.frames).toBeGreaterThanOrEqual(8); expect(p.frames).toBeLessThanOrEqual(12); }
      const fit = fitBudget(seeDocument(m, "test"), 6000);
      const text = seeSummary(m, fit, 6000, join(d, "see.json"), d);
      expect(text.split("\n")[0]).toContain("untell see");
      expect(text).toContain(`(${aspect})`);
      expect(text.indexOf("timeline")).toBeLessThan(text.indexOf("pictures"));
      expect(text.indexOf("pictures")).toBeLessThan(text.indexOf("json "));
    }
  }, 180000);

  test.skipIf(!canTurn)("a rotated clip shows its turned size", () => {
    ff(["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", join(d, "flat.mp4")]);
    ff(["-display_rotation", "90", "-i", join(d, "flat.mp4"), "-c", "copy", join(d, "turned.mp4")]);
    const f = probeVideo(join(d, "turned.mp4"));
    expect([f.width, f.height]).toEqual([180, 320]);
    expect(f.aspect).toBe("9:16");
  }, 60000);

  test("a 3 minute clip with a cut every 2 s stays under the budget", async () => {
    ff(["-f", "lavfi", "-i", "testsrc2=s=192x108:r=10:d=180", "-f", "lavfi", "-i", "sine=f=330:d=180",
      "-vf", "negate=enable='lt(mod(t\\,4)\\,2)'", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(d, "long.mp4")]);
    const m: VideoMeasures = await measure("long.mp4", "long", true);
    expect(m.picture.cuts.length).toBeGreaterThan(80);
    const fit = fitBudget(seeDocument(m, "test"), 6000);
    expect(fit.fits).toBe(true);
    expect(fit.tokens).toBeLessThanOrEqual(6000);
    const doc = JSON.parse(fit.text) as { version: number; notes: { dropped: string[] } };
    expect(doc.version).toBe(SEE_VERSION);
    expect(SEE_VERSION).toBe(2);
    expect(doc.notes.dropped.length).toBeGreaterThan(0);
    expect(readFileSync(m.pages[0]!.file).length).toBeGreaterThan(1000);
    expect(m.pages.reduce((s, p) => s + p.frames, 0)).toBeLessThanOrEqual(72);
  }, 300000);
});
