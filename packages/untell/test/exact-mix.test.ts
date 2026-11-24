// The sound of a render lands on its exact times: exactMix places each clip to the sample, as HyperFrames plays it.
// Remotion starts a clip on a whole frame; untell render puts this mix in place of Remotion's, so both frameworks agree.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { exactMix } from "../src/detector";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A WAV file of one click: silence, then one sample at 0.9 at `peak` s. */
function click(path: string, peak: number, seconds = 0.2) {
  const sr = 48000, n = Math.round(seconds * sr), data = Buffer.alloc(n * 2);
  data.writeInt16LE(Math.round(0.9 * 32767), Math.round(peak * sr) * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

describe("exactMix", () => {
  test.skipIf(!hasFfmpeg)("a click lands on its time to the sample, between frames too", () => {
    const dir = mkdtempSync(join(tmpdir(), "untell-mix-")); dirs.push(dir);
    mkdirSync(join(dir, "tick"));
    click(join(dir, "tick", "a.wav"), 0.02);
    // A start between two frames (1.0123 s is frame 30.37): Remotion would start it on frame 30, 12 ms early.
    const wav = exactMix([{ id: "t", kind: "audio", src: "tick/a.wav", at: 1.0123 }], 2, dir, join(dir, "mix.wav"));
    const r = spawnSync("ffmpeg", ["-v", "error", "-i", wav, "-ac", "1", "-f", "f32le", "-"], { maxBuffer: 64 << 20 });
    const x = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
    let at = 0;
    for (let i = 1; i < x.length; i++) if (Math.abs(x[i]!) > Math.abs(x[at]!)) at = i;
    expect(Math.abs(at - Math.round((1.0123 + 0.02) * 48000))).toBeLessThanOrEqual(1);
  });
});
