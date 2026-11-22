// Makes a HyperFrames project for a scene, as hf_check always made it: the line-chart template sized to the
// frame and the length, then scripts/hf_project.ts (the runtime bundle, the fonts, the media, the baked clips).
// hf_check.ts and render.ts both use it, so a check and a render draw from the same project.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "../..");

export function makeProject(sceneFile: string, system: string, seconds: number, size: string, exportName: string, dir: string) {
  const [W, H] = size.split("x").map(Number) as [number, number];
  if (!W || !H) throw new Error(`--size wants <width>x<height>, got ${size}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, "examples/hyperframes/line-chart/hyperframes.json"), join(dir, "hyperframes.json"));
  const name = dir.split("/").at(-1)!;
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ id: name, name }, null, 1));
  // The scene this page is built from: the detector reads its declarations and its guides (withGuides) from it, as it
  // does for the same film in Remotion.
  writeFileSync(join(dir, "untell-scene.json"), JSON.stringify({ scene: resolve(sceneFile), export: exportName }, null, 1));
  const tpl = readFileSync(join(ROOT, "examples/hyperframes/line-chart/index.html"), "utf8")
    .replace('data-duration="8"', `data-duration="${seconds}"`)
    .replaceAll("width=1080, height=1920", `width=${W}, height=${H}`).replaceAll("width: 1080px; height: 1920px", `width: ${W}px; height: ${H}px`)
    .replace('data-width="1080" data-height="1920"', `data-width="${W}" data-height="${H}"`)
    .replace("tl.to({}, { duration: 0.01 }, 7.99);", `tl.to({}, { duration: 0.01 }, ${seconds - 0.01});`)
    .replace('get("system") || "spec"', `get("system") || "${system}"`);
  writeFileSync(join(dir, "index.html"), tpl);
  const prep = spawnSync("bun", [join(ROOT, "scripts/hf_project.ts"), dir, system, resolve(sceneFile)], { cwd: ROOT, encoding: "utf8", env: { ...process.env, HF_SCENE_EXPORT: exportName } });
  if (prep.status !== 0) throw new Error(`hf_project failed: ${prep.stdout}\n${prep.stderr}`);
}
