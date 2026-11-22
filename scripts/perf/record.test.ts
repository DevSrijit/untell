// The recorder writes every picture at the film's size: frames, key frames, the purity frame and the video.
// A wide film once came out at 1920 x 993 (the window's size, not the film's); this test keeps that from coming back.
import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { imageSize } from "./imagesize";

const ROOT = resolve(import.meta.dir, "../..");
const SIZES = [[1080, 1920], [1920, 1080], [1080, 1080]] as const;
const WHIPS = [["whip-1080x1920", 1080, 1920], ["whip-1920x1080", 1920, 1080], ["wipe-exit-1920x1080", 1920, 1080]] as const;

test("every recorded picture has the film's size (9:16, 16:9, 1:1 and camera whips, in one run)", () => {
  const out = mkdtempSync(join(tmpdir(), "untell-sizes-"));
  try {
    const ids = [...SIZES.map(([w, h]) => `size-${w}x${h}`), ...WHIPS.map(([id]) => id)];
    const r = spawnSync("bun", [join(ROOT, "scripts/record.ts"), "--force", "--no-cache", "--video", "--films", join(ROOT, "scripts/perf/fixtures/sizes.tsx"), ...ids],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, UNTELL_REC_OUT: out } });
    expect(r.status, r.stderr).toBe(0);
    for (const [name, w, h] of [...SIZES.map(([w, h]) => [`size-${w}x${h}`, w, h] as const), ...WHIPS]) {
      const dir = join(out, name);
      const pics = [...readdirSync(join(dir, "frames")).map((f) => join(dir, "frames", f)), ...readdirSync(join(dir, "frames-png")).map((f) => join(dir, "frames-png", f)), join(dir, "purity.jpg")];
      expect(pics.length).toBeGreaterThan(60);
      expect(readdirSync(join(dir, "frames")).length).toBe(JSON.parse(readFileSync(join(dir, "elements.json"), "utf8")).durationInFrames);
      for (const p of pics) expect({ p, ...imageSize(readFileSync(p)) }).toEqual({ p, width: w, height: h });
      const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(dir, "video.mp4")], { encoding: "utf8" });
      expect(probe.stdout.trim().replace(/,$/, "")).toBe(`${w},${h}`);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
}, 300000);

// The whip film draws a blur filter on the frames of a fast pan. It must record, and byte for byte as the old
// recorder records it (record.ts --verify starts both at once and compares every frame and every element). The old
// recorder is a frozen copy (scripts/perf/baseline/) that the public repository does not hold: then the test skips.
const BASELINE = existsSync(join(ROOT, "scripts/perf/baseline/record.ts"));
test.skipIf(!BASELINE)("a camera whip records the same as the old recorder", () => {
  const out = mkdtempSync(join(tmpdir(), "untell-whip-"));
  try {
    const r = spawnSync("bun", [join(ROOT, "scripts/record.ts"), "--verify", "--force", "--no-cache", "--films", join(ROOT, "src/films/blocks/renderer.tsx"), "block-whip-courtside"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, UNTELL_REC_OUT: out } });
    expect(r.status, r.stdout.slice(-1500) + r.stderr.slice(-1500)).toBe(0);
    expect(r.stdout).toContain("SAME");
  } finally { rmSync(out, { recursive: true, force: true }); }
}, 300000);

// A film that throws while it draws: the run fails within seconds and names the film's error.
test("a film that throws fails at once with its error, not after a long wait", () => {
  const out = mkdtempSync(join(tmpdir(), "untell-throws-"));
  try {
    const t0 = Date.now();
    const r = spawnSync("bun", [join(ROOT, "scripts/record.ts"), "--force", "--no-cache", "--films", join(ROOT, "scripts/perf/fixtures/throws.tsx"), "throws-on-1"],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, UNTELL_REC_OUT: out } });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("planted error on frame 1");
    expect(Date.now() - t0).toBeLessThan(60000);
  } finally { rmSync(out, { recursive: true, force: true }); }
}, 120000);
