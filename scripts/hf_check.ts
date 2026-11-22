// Checks a scene in HyperFrames: scaffolds a project under out/hf/<scene>-<system>, runs `hyperframes check`,
// records it with the recorder and, with --compare, measures how far it is from a Remotion film.
// Usage: bun scripts/hf_check.ts <scene file> <system> <seconds> [--compare <films module> <film id>] [--render] [--check-only]
// Prints the check's findings and, with --compare, the pixel difference every second and the largest
// difference in frames between the times each text first becomes visible in the two films.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { makeProject } from "./perf/hfproj";
import { slot } from "./perf/slots";

const ROOT = resolve(import.meta.dir, "..");
const args = process.argv.slice(2);
const valued = ["--compare", "--size", "--export"];
const [sceneFile, system = "spec", seconds = "8"] = args.filter((a, i) => !a.startsWith("--") && !valued.includes(args[i - 1]!) && !(args[i - 2] === "--compare"));
if (!sceneFile) throw new Error("usage: bun scripts/hf_check.ts <scene file> <system> <seconds> [--size 1920x1080] [--export <scene export>] [--compare <films module> <film id>] [--render]");
// --size: the frame, default 1080x1920 (9:16). --export: the scene function's export name, default "scene".
const sizeArg = args.includes("--size") ? args[args.indexOf("--size") + 1]! : "1080x1920";
const exportName = args.includes("--export") ? args[args.indexOf("--export") + 1]! : "scene";
const name = `${basename(sceneFile).replace(/\.tsx?$/, "")}${exportName === "scene" ? "" : `-${exportName}`}-${system}${sizeArg === "1080x1920" ? "" : `-${sizeArg}`}`;
const dir = join(ROOT, "out", "hf", name);
// The project (template, runtime, fonts, media): scripts/perf/hfproj.ts, shared with untell render.
try { makeProject(resolve(sceneFile), system, Number(seconds), sizeArg, exportName, dir); } catch (e) { console.error(String(e)); process.exit(1); }

// The HyperFrames CLI: UNTELL_HYPERFRAMES, else `hyperframes` on PATH, else this repository's node_modules.
let hf = process.env.UNTELL_HYPERFRAMES ?? Bun.which("hyperframes") ?? join(ROOT, "node_modules/.bin/hyperframes");
const env = { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" };
// Each HyperFrames step takes a machine slot (scripts/perf/slots.ts); the recordings below take their own in record.ts.
let release = await slot(`hf_check check ${name}`);
// CI=1: with no terminal, hyperframes check leaves a detached warm server (warmCheck.js, a headless Chrome) for minutes.
const check = spawnSync(hf, ["check"], { cwd: dir, env: { ...env, CI: "1", HYPERFRAMES_NO_UPDATE_CHECK: "1" }, encoding: "utf8", timeout: 300000 });
release();
// A finding that the system's own direction overrides (scripts/inspect/hf_overrides.json, which untell check reads
// too): "off" is not a fault in this system, "advice" never fails. Each says so in place of its ⚠ or ✗.
const overrides = (() => { try { return JSON.parse(readFileSync(join(ROOT, "scripts/inspect/hf_overrides.json"), "utf8"))[system] ?? {}; } catch { return {}; } })() as Record<string, { severity: string; why?: string }>;
const lines = (check.stdout + check.stderr).split("\n").filter((l) => !l.startsWith("[hyperframes]") && /⚠|✗|error\(s\)|Check (passed|failed)|Fix:/.test(l)).map((l) => {
  const m = l.trim().match(/^[⚠✗]\s*([a-z_]+):\s*(.*)$/);
  // A block's own console warning ("codeBlock code: ..."): untell check folds it into the detector's block-warning,
  // which judges it (a block that adapted and lost nothing is a note). The same here.
  if (m?.[1] === "console_warning" && /^[a-z]\w*( [^:\s]+)?: /.test(m[2]!)) return `block warning (the detector's block-warning judges it): ${m[2]}`;
  const ov = m ? overrides[m[1]!] : undefined;
  return ov ? `${ov.severity === "off" ? "set by the system" : "advice"} (${ov.why ?? "the system's direction"}): ${l.trim().replace(/^[⚠✗]\s*/, "")}` : l;
});
console.log(`hyperframes check (${name}):\n${lines.map((l) => "  " + l.trim().slice(0, 300)).join("\n") || "  (no output)"}`);
// The check's lines, kept beside the project (src/system/signature.test.ts reads them for the signature films).
writeFileSync(join(dir, "check.txt"), lines.map((l) => l.trim()).join("\n") + "\n");
// --check-only: the HyperFrames check alone, with no recording.
if (args.includes("--check-only")) process.exit(check.status === 0 || lines.length ? 0 : 1);

if (args.includes("--render")) {
  release = await slot(`hf_check render ${name}`);
  const r = spawnSync(hf, ["render"], { cwd: dir, env, encoding: "utf8", timeout: 600000 });
  release();
  const out = (r.stdout + r.stderr).split("\n");
  console.log(out.filter((l) => /\.mp4|Render complete|rror/.test(l)).join("\n"));
  // The last step of every render: master the mix to the system's loudness target, true peak at most -1 dBTP
  // (scripts/master.py). It writes <render>.mastered.mp4 beside the render and says what the limiter took.
  const mp4 = out.map((l) => l.match(/(\/[^\s'"]+\.mp4)/)?.[1]).find((f) => f && !f.includes(".mastered."));
  if (mp4) {
    const m = spawnSync("python3", [join(ROOT, "scripts/master.py"), mp4, system], { cwd: ROOT, encoding: "utf8" });
    console.log(`master (${system}):\n${(m.stdout + m.stderr).trim().split("\n").map((l) => "  " + l).join("\n")}`);
  } else console.log("master: no render file found in the render output; master it with: python3 scripts/master.py <render.mp4> " + system);
}

const rec = spawnSync("bun", [join(ROOT, "scripts/record.ts"), "--force", `hf:${join(dir, "index.html")}`], { cwd: ROOT, encoding: "utf8", timeout: 600000 });
if (rec.status !== 0) { console.error(rec.stdout.slice(-2000), rec.stderr.slice(-2000)); process.exit(1); }
console.log(`recorded: out/recordings/hf-${name}`);
// Type behind a cut-out: HyperFrames accepts the cover (data-layout-allow-occlusion), so our own check
// measures what it hides. It prints nothing for a film with no cut-out on screen.
const cover = spawnSync("python3", [join(ROOT, "scripts/inspect/cover.py"), join(ROOT, "out/recordings", `hf-${name}`)], { encoding: "utf8" });
if (!/in 0 text-frames/.test(cover.stdout) || cover.status !== 0) console.log(cover.stdout.trimEnd());

const ci = args.indexOf("--compare");
if (ci >= 0) {
  const [films, film] = [args[ci + 1]!, args[ci + 2]!];
  // Always record the Remotion film again, so the comparison uses the current code.
  const r2 = spawnSync("bun", [join(ROOT, "scripts/record.ts"), "--force", "--films", films, film], { cwd: ROOT, encoding: "utf8", timeout: 600000 });
  if (r2.status !== 0) { console.error(r2.stdout.slice(-2000), r2.stderr.slice(-2000)); process.exit(1); }
  const py = `
from PIL import Image
import numpy as np, sys
a, b, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
for f in range(0, n, 30):
    x = np.asarray(Image.open(f"{a}/frames/f{f:04d}.jpg").convert("L"), dtype=float)
    y = np.asarray(Image.open(f"{b}/frames/f{f:04d}.jpg").convert("L"), dtype=float)
    d = abs(x - y)
    print(f"  {f/30:5.1f} s  mean {d.mean():5.2f}  pixels off {100*(d>40).mean():5.2f} %")
`;
  const cmp = spawnSync("python3", ["-c", py, join(ROOT, "out/recordings", `hf-${name}`), join(ROOT, "out/recordings", film), String(Math.round(Number(seconds) * 30))], { encoding: "utf8" });
  console.log(`HyperFrames vs Remotion (${film}):\n${cmp.stdout}${cmp.stderr}`);

  // Timing: when each text first becomes visible, from both recordings' tracks.json. A film that runs
  // late in one renderer can pass the pixel check when its frames are mostly empty, so this compares
  // the onsets directly. A text is visible when its opacity is above 0.1 (a fully masked line has
  // opacity 0). Texts pair by content. The same text can enter more than once (a word that repeats),
  // so the n-th onset of a text in one recording pairs with its n-th onset in the other.
  const timing = `
import json, sys
def onsets(path):
    frames = json.load(open(path))["frames"]
    out, before = {}, {}
    for f, items in enumerate(frames):
        now = {}
        for it in items:
            if it.get("opacity", 0) > 0.1 and it.get("w", 0) * it.get("h", 0) > 0:
                now[it["text"]] = now.get(it["text"], 0) + 1
        for text, n in now.items():
            for _ in range(n - before.get(text, 0)):
                out.setdefault(text, []).append(f)
        before = now
    return out
a, b = onsets(sys.argv[1]), onsets(sys.argv[2])
worst, where, unpaired = 0, "", []
for text in sorted(set(a) | set(b)):
    x, y = a.get(text, []), b.get(text, [])
    if len(x) != len(y): unpaired.append(f"{text!r} {len(x)} vs {len(y)}")
    for i, (fa, fb) in enumerate(zip(x, y)):
        if abs(fa - fb) > worst: worst, where = abs(fa - fb), f"{text!r} (onset {i + 1}: HyperFrames f{fa}, Remotion f{fb})"
print(f"  texts compared: {len(set(a) & set(b))}; largest onset difference: {worst} frame(s){' at ' + where if where else ''}")
if unpaired: print("  onset counts differ: " + "; ".join(unpaired[:8]))
`;
  const tm = spawnSync("python3", ["-c", timing, join(ROOT, "out/recordings", `hf-${name}`, "tracks.json"), join(ROOT, "out/recordings", film, "tracks.json")], { encoding: "utf8" });
  console.log(`Text timing, HyperFrames vs Remotion (${film}):\n${tm.stdout}${tm.stderr}`);
}
