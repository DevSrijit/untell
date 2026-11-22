// Compares two recordings of one film, frame by frame and element by element.
// Usage: bun scripts/perf/compare.ts <recording A> <recording B> [--tolerance hf] [--json]
//
// Pictures: a frame passes when its file is the same byte for byte, or when its decoded pixels are the same.
// With --tolerance hf, a frame also passes inside hf_check's tolerance (under 1 % of pixels more than 40 grey
// levels apart), which is the tolerance for two different renderers, not for a cache or a copy.
// Data: tracks.json and elements.json must be equal, frame by frame (after a JSON round trip).
// It exits 1 when anything differs, and prints the first differences.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const [a, b, ...rest] = process.argv.slice(2);
if (!a || !b) { console.error("usage: bun scripts/perf/compare.ts <recording A> <recording B> [--tolerance hf] [--json]"); process.exit(2); }
const hfTol = rest.includes("--tolerance") && rest[rest.indexOf("--tolerance") + 1] === "hf";

type Report = { frames: number; sameBytes: number; samePixels: number; withinTol: number; differ: string[]; worst: { frame: string; maxDiff: number; offPct: number } | null;
  pngs: number; pngDiffer: string[]; data: Record<string, string>; ok: boolean };

function pictures(sub: string, ext: string) {
  const da = join(a!, sub), db = join(b!, sub);
  const fa = existsSync(da) ? readdirSync(da).filter((f) => f.endsWith(ext)).sort() : [];
  const fb = existsSync(db) ? readdirSync(db).filter((f) => f.endsWith(ext)).sort() : [];
  const names = [...new Set([...fa, ...fb])].sort();
  const missing = names.filter((n) => !fa.includes(n) || !fb.includes(n));
  const both = names.filter((n) => fa.includes(n) && fb.includes(n));
  const byteDiff = both.filter((n) => !Buffer.from(readFileSync(join(da, n))).equals(readFileSync(join(db, n))));
  return { da, db, names, missing, byteDiff, both };
}

/** Decodes the frames that differ in bytes and measures how far apart their pixels are. */
function pixelDiff(da: string, db: string, names: string[]) {
  if (!names.length) return [];
  const py = `
import sys, json
import numpy as np
from PIL import Image
da, db = sys.argv[1], sys.argv[2]
out = []
for n in sys.stdin.read().split():
    x = np.asarray(Image.open(f"{da}/{n}").convert("RGB"), dtype=np.int16)
    y = np.asarray(Image.open(f"{db}/{n}").convert("RGB"), dtype=np.int16)
    if x.shape != y.shape:
        out.append([n, 255, 100.0, 255.0]); continue
    d = np.abs(x - y)
    g = np.abs(x.mean(axis=2) - y.mean(axis=2))
    out.append([n, int(d.max()), float(100 * (g > 40).mean()), float(d.mean())])
print(json.dumps(out))
`;
  const r = spawnSync("python3", ["-c", py, da, db], { input: names.join("\n"), encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(r.stderr);
  return JSON.parse(r.stdout) as [string, number, number, number][];
}

function data(name: string) {
  const pa = join(a!, name), pb = join(b!, name);
  if (!existsSync(pa) || !existsSync(pb)) return existsSync(pa) === existsSync(pb) ? "" : "missing on one side";
  const x = JSON.parse(readFileSync(pa, "utf8")), y = JSON.parse(readFileSync(pb, "utf8"));
  const fx = x.frames ?? [], fy = y.frames ?? [];
  if (fx.length !== fy.length) return `frame count ${fx.length} vs ${fy.length}`;
  const head = (o: Record<string, unknown>) => JSON.stringify({ ...o, frames: undefined });
  if (head(x) !== head(y)) return `header differs: ${head(x).slice(0, 200)} vs ${head(y).slice(0, 200)}`;
  const bad: number[] = [];
  for (let i = 0; i < fx.length; i++) if (JSON.stringify(fx[i]) !== JSON.stringify(fy[i])) bad.push(i);
  if (!bad.length) return "";
  const i = bad[0]!;
  const ex = fx[i] as unknown[], ey = fy[i] as unknown[];
  let detail = `${ex?.length} vs ${ey?.length} items`;
  for (let k = 0; k < Math.max(ex?.length ?? 0, ey?.length ?? 0); k++) {
    if (JSON.stringify(ex?.[k]) !== JSON.stringify(ey?.[k])) { detail = `item ${k}: ${String(JSON.stringify(ex?.[k])).slice(0, 300)} vs ${String(JSON.stringify(ey?.[k])).slice(0, 300)}`; break; }
  }
  return `${bad.length} frame(s) differ, first f${i}: ${detail}`;
}

const jp = pictures("frames", ".jpg");
const px = pixelDiff(jp.da, jp.db, jp.byteDiff);
const samePixels = px.filter((p) => p[1] === 0).length;
const within = px.filter((p) => p[1] !== 0 && hfTol && p[2] < 1).length;
const differ = [...jp.missing.map((n) => `${n} missing`), ...px.filter((p) => p[1] !== 0 && !(hfTol && p[2] < 1)).map((p) => `${p[0]} max ${p[1]} off ${p[2].toFixed(2)} % mean ${p[3].toFixed(3)}`)];
const worst = px.length ? px.reduce((m, p) => (p[2] > m[2] || (p[2] === m[2] && p[1] > m[1]) ? p : m)) : null;
const pn = pictures("frames-png", ".png");
const ppx = pixelDiff(pn.da, pn.db, pn.byteDiff);
const pngDiffer = [...pn.missing.map((n) => `${n} missing`), ...ppx.filter((p) => p[1] !== 0 && !(hfTol && p[2] < 1)).map((p) => `${p[0]} max ${p[1]} off ${p[2].toFixed(2)} %`)];
const dataRes: Record<string, string> = {};
for (const n of ["tracks.json", "elements.json"]) { const d = data(n); if (d) dataRes[n] = d; }
const rep: Report = {
  frames: jp.names.length, sameBytes: jp.both.length - jp.byteDiff.length, samePixels, withinTol: within, differ,
  worst: worst ? { frame: worst[0], maxDiff: worst[1], offPct: worst[2] } : null, pngs: pn.names.length, pngDiffer, data: dataRes,
  ok: !differ.length && !pngDiffer.length && !Object.keys(dataRes).length,
};
if (rest.includes("--json")) console.log(JSON.stringify(rep));
else {
  console.log(`${a} vs ${b}`);
  console.log(`  frames ${rep.frames}: ${rep.sameBytes} same bytes, ${rep.samePixels} same pixels${hfTol ? `, ${rep.withinTol} inside the hf tolerance` : ""}, ${differ.length} differ${rep.worst ? ` (worst ${rep.worst.frame}: max ${rep.worst.maxDiff}, ${rep.worst.offPct.toFixed(2)} % off)` : ""}`);
  for (const d of differ.slice(0, 8)) console.log(`    ${d}`);
  // The differing frames as ranges, so a run of frames (one shot, one clip) shows at a glance.
  const nums = differ.map((d) => Number(d.match(/^f(\d+)/)?.[1])).filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  const ranges: string[] = [];
  for (let i = 0; i < nums.length;) { let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j]! + 1) j++; ranges.push(i === j ? `${nums[i]}` : `${nums[i]}-${nums[j]}`); i = j + 1; }
  if (ranges.length) console.log(`    differing frames: ${ranges.join(", ")}`);
  console.log(`  key frames ${rep.pngs}: ${pngDiffer.length} differ`);
  for (const d of pngDiffer.slice(0, 4)) console.log(`    ${d}`);
  for (const [k, v] of Object.entries(dataRes)) console.log(`  ${k}: ${v}`);
  if (!Object.keys(dataRes).length) console.log("  tracks.json and elements.json: equal");
  console.log(rep.ok ? "  SAME" : "  DIFFERENT");
}
process.exit(rep.ok ? 0 : 1);
