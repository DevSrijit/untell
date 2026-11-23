// The cut test on real frames: examples/scenes/productCut.ts (three product shots that cut at 1 s and 2 s, no overlap)
// as the recorder drew it in Remotion and in HyperFrames, and as each framework rendered it. For each set of frames
// that exists:
// - no frame is blank (the object is gone for one frame: the fault this guards);
// - the first frame of each new shot is the new shot (not the old one, one frame stale);
// - every frame differs from the frame before (a moving shot draws a new image on every frame).
// The frames come from:
//   bun scripts/record.ts --force --films src/films/blocks/three.tsx three-cut-matte
//   bun scripts/hf_check.ts examples/scenes/productCut.ts matte 3 --compare src/films/blocks/three.tsx three-cut-matte
//   bun scripts/render.ts three-cut-matte --root src/films/blocks/three-root.tsx --via framework --out out/review/three/cut-rem-after.mp4
//   bun scripts/render.ts --renderer hyperframes --scene examples/scenes/productCut.ts --system matte --seconds 3 --out out/review/three/cut-hf.mp4
//   (then ffmpeg -i <mp4> -start_number 0 out/review/three/<name>/frames/f%04d.jpg)
// A set that is missing is skipped, so the unit suite stays fast; shown.test.ts holds the rule itself.
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { frameOf } from "../scene/context";
import { CUT1, CUT2, seconds } from "../../../examples/scenes/productCut";

const ROOT = resolve(import.meta.dir, "../../..");
const SETS: Record<string, string> = {
  "Remotion, recorded": "out/recordings/three-cut-matte/frames",
  "HyperFrames, recorded": "out/recordings/hf-productCut-matte/frames",
  "Remotion, rendered": "out/review/three/remotion-render-after/frames",
  "HyperFrames, rendered": "out/review/three/hf-render/frames",
};

// For each frame: the share of pixels away from the ground, and the mean difference from the frame before.
const PY = `
import sys, os, json
from PIL import Image, ImageChops, ImageStat
d, n = sys.argv[1], int(sys.argv[2])
out, prev = [], None
for i in range(n):
    a = Image.open(os.path.join(d, f"f{i:04d}.jpg")).convert("L").resize((108, 192))
    bg = a.getpixel((2, 2))
    ink = sum(1 for p in a.getdata() if abs(p - bg) > 12) / (108 * 192)
    diff = ImageStat.Stat(ImageChops.difference(a, prev)).mean[0] if prev else 0
    out.append([ink, diff]); prev = a
print(json.dumps(out))`;

describe("3D shots that cut, on real frames", () => {
  const frames = Math.round(seconds * 30);
  for (const [name, dir] of Object.entries(SETS)) {
    const path = join(ROOT, dir);
    test.skipIf(!existsSync(join(path, `f${String(frames - 1).padStart(4, "0")}.jpg`)))(name, () => {
      const r = spawnSync("python3", ["-c", PY, path, String(frames)], { encoding: "utf8" });
      expect(r.status).toBe(0);
      const m: [number, number][] = JSON.parse(r.stdout);
      for (let f = 0; f < frames; f++) expect([f, m[f]![0] > 0.01]).toEqual([f, true]);
      for (let f = 1; f < frames; f++) expect([f, m[f]![1] > 0.05]).toEqual([f, true]);
      // The first frame of a new shot is a new picture: a jump far larger than a moving frame's.
      for (const cut of [CUT1, CUT2]) {
        const first = frameOf(cut);
        expect([first, m[first]![1] > 2]).toEqual([first, true]);
        expect([first + 1, m[first + 1]![1] < 2]).toEqual([first + 1, true]);
      }
    });
  }
});

// Footage on the same grid: the Title reel cuts from clip to clip at frames 82, 185 and 311. Before the fix each clip
// ended one frame early (the Sequence and the <video> used t * fps, the node's opacity frameOf), so those frames
// showed the line on black. Each frame there must show a picture (mean level far above black) in both renderers.
//   bun scripts/record.ts --force --films src/films/reels.tsx reel-title
//   bun scripts/hf_check.ts examples/reels/title.ts title 14.6
const PY_MEAN = `
import sys, os, json
from PIL import Image, ImageStat
d = sys.argv[1]
print(json.dumps({f: ImageStat.Stat(Image.open(os.path.join(d, f"f{f:04d}.jpg")).convert("L").resize((108, 192))).mean[0] for f in map(int, sys.argv[2].split(","))}))`;
describe("footage clips that cut, on real frames", () => {
  const frames = [80, 81, 82, 83, 84, 183, 184, 185, 186, 187, 309, 310, 311, 312, 313];
  for (const [name, dir] of Object.entries({ "Remotion, recorded": "out/recordings/reel-title/frames", "HyperFrames, recorded": "out/recordings/hf-title-title/frames" })) {
    const path = join(ROOT, dir);
    test.skipIf(!existsSync(join(path, "f0313.jpg")))(name, () => {
      const r = spawnSync("python3", ["-c", PY_MEAN, path, frames.join(",")], { encoding: "utf8" });
      expect(r.status).toBe(0);
      const m: Record<string, number> = JSON.parse(r.stdout);
      for (const f of frames) expect([f, m[f]! > 15]).toEqual([f, true]);
    });
  }
});
