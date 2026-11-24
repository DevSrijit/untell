// untell check on a video alone (src/eyes.ts): the plan of the rules, when it applies, and a run on planted faults.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { detectorRules } from "../src/detector";
import { eyes, eyesPlan, FILE_RULES, NEED, readFps, SYSTEM_RULES, wantsEyes, wrapIds } from "../src/eyes";
import { analysisPython, runs } from "../src/env";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "untell-eyes-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => { const l = console.log, e = console.error; console.log = () => {}; console.error = () => {}; try { return await fn(); } finally { console.log = l; console.error = e; } };

describe("the plan for a file", () => {
  const rules = detectorRules();
  test("every rule of the catalog either runs or has its reason, never both", () => {
    for (const sys of [false, true]) {
      const p = eyesPlan(rules, sys);
      for (const r of rules) expect(p.runs.includes(r.id) !== (r.id in p.skipped)).toBe(true);
      expect(p.runs.length + Object.keys(p.skipped).length).toBe(rules.length);
    }
  });
  test("each rule the plan runs is in the catalog", () => {
    const ids = new Set(rules.map((r) => r.id));
    for (const id of [...Object.values(FILE_RULES), ...Object.values(SYSTEM_RULES)].flat()) expect(ids.has(id)).toBe(true);
  });
  test("a system adds the rules that take their limits from it", () => {
    const without = eyesPlan(rules, false), withSys = eyesPlan(rules, true);
    expect(without.skipped.ending).toBe(NEED.system);
    expect(withSys.runs).toContain("ending");
    expect(withSys.modules).toContain("ending");
    expect(without.skipped["reading-size"]).toBe(NEED.scene);
    expect(without.skipped["sound/hit-over-bed"]).toBe(NEED.sound);
  });
  test("the frame rate and the id list", () => {
    expect(readFps(29.97)).toBe(30);
    expect(readFps(60)).toBe(30);
    expect(readFps(24)).toBe(24);
    expect(wrapIds(["a", "b", "c"], "  ", 4)).toBe("a,\n  b,\n  c");
  });
});

describe("when untell check reads the file alone", () => {
  test("no project, a project with no scene module, or --no-scene; never a film or no video", () => {
    const bare = tmp();
    expect(wantsEyes(bare, { video: "a.mp4" })).toBe(true);
    expect(wantsEyes(bare, {})).toBe(false);
    expect(wantsEyes(bare, { video: "a.mp4", film: "films/x.ts" })).toBe(false);
    const rem = tmp();
    writeFileSync(join(rem, "package.json"), JSON.stringify({ dependencies: { remotion: "4.0.0" } }));
    expect(wantsEyes(rem, { video: "a.mp4" })).toBe(true);
    mkdirSync(join(rem, "src", "films"), { recursive: true });
    writeFileSync(join(rem, "src", "films", "a.ts"), 'export const system = "riso";\nexport const scene = () => [];\n');
    expect(wantsEyes(rem, { video: "a.mp4" })).toBe(false);
    expect(wantsEyes(rem, { video: "a.mp4", noScene: true })).toBe(true);
  });
});

// A planted film: 2 s of motion, 5 s of one still frame, 1.5 s of motion; a sound with 1 s of digital silence.
const canRun = runs("ffmpeg") && !!analysisPython(process.cwd());
describe.skipIf(!canRun)("a run on planted faults", () => {
  test("stall and the silence are found in an encoded file, and the report lists what did not run", async () => {
    const d = tmp();
    const r = spawnSync("ffmpeg", ["-v", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=s=360x640:r=30:d=2", "-f", "lavfi", "-i", "testsrc2=s=360x640:r=30:d=0.04", "-f", "lavfi", "-i", "testsrc2=s=360x640:r=30:d=1.5",
      "-f", "lavfi", "-i", "sine=f=440:d=2:sample_rate=48000", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-f", "lavfi", "-i", "sine=f=660:d=6.5:sample_rate=48000",
      "-filter_complex", "[1:v]loop=loop=149:size=1:start=0,setpts=N/30/TB[still];[0:v][still][2:v]concat=n=3:v=1:a=0[v];[4:a]atrim=duration=1[gap];[3:a][gap][5:a]concat=n=3:v=0:a=1[a]",
      "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(d, "planted.mp4")]);
    expect(r.status).toBe(0);
    const code = await quiet(() => eyes(d, "planted.mp4"));
    expect(code).toBe(1);
    const rep = JSON.parse(readFileSync(join(d, ".untell", "eyes", "planted", "report.json"), "utf8"));
    expect(rep.film.scene).toBeNull();
    expect(rep.findings.some((f: { check: string }) => f.check === "stall")).toBe(true);
    expect(rep.findings.some((f: { check: string }) => f.check === "sound/digital-silence")).toBe(true);
    expect(rep.skipped["reading-size"]).toBe(NEED.scene);
    expect(Object.values(rep.skipped).some((w) => String(w).startsWith("crashed"))).toBe(false);
  }, 120000);
  // The close: silence that runs to the end after the sound fades is the end of the sound (the ending rule asks for the
  // fade), up to the end hold and half a second more; a longer tail says that the sound stops before the picture.
  test("silence at the very end: a short close passes, a long one is named as the sound stopping early", async () => {
    const tail = async (name: string, sound: number, total: number) => {
      const d = tmp();
      const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=360x640:r=30:d=${total}`, "-f", "lavfi", "-i", `sine=f=440:d=${sound}:sample_rate=48000`,
        "-filter_complex", `[1:a]apad=whole_dur=${total}[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", String(total), join(d, `${name}.mp4`)]);
      expect(r.status).toBe(0);
      await quiet(() => eyes(d, `${name}.mp4`));
      return JSON.parse(readFileSync(join(d, ".untell", "eyes", name, "report.json"), "utf8")).findings.filter((f: { check: string }) => f.check === "sound/digital-silence");
    };
    expect(await tail("close", 5, 6.2)).toEqual([]);
    const long = await tail("early", 3, 7);
    expect(long.length).toBe(1);
    expect(long[0].measured.atEnd).toBe(true);
  }, 180000);
});
