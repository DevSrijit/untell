// untell render: the one render command, for Remotion and HyperFrames. A package can ship it as `untell render <film>`.
//
// Usage:
//   bun scripts/render.ts <film id> [<system id>] [--films <module>] [--root <remotion root>] [--out <file.mp4>]
//   bun scripts/render.ts --renderer hyperframes <project dir or index.html> [--system <id>] [--out <file.mp4>]
//   bun scripts/render.ts --renderer hyperframes --scene <scene file> --system <id> --seconds <s> [--size WxH] [--export <name>]
// Flags: --system <id>  the system for the mastering step (default: the film's own, when the film names one)
//        --no-cache     render again, also when the cache holds this exact render
//        --verify       also render the framework's plain way and run the quality gate (perf/render_gate.py)
//        --via auto|recording|framework   Remotion only. auto (default): the check's recording for a scene film
//                       with no footage and no sound, else Remotion draws. recording: also with sound.
//        --concurrency <n>   pages for Remotion (default: what the machine slots allow)
//
// It prints one line for each stage with its time: probe, record, encode or bundle and render, master, done.
//
// What it adds to the framework's own render (numbers in out/perf/RESULT.md):
//  - A machine slot (perf/slots.ts): renders wait for each other instead of starving each other.
//  - The check's recording, where the gate proves it equal: for a scene film with no footage and no sound, the
//    frames the check drew are encoded (libx264 CRF 18, as Remotion encodes) instead of drawn again. On the 15 reels
//    and the bench films without footage every frame stayed inside hf_check's tolerance of Remotion's own render.
//  - A Remotion bundle cache and an output cache (perf/cache.ts): an unchanged film renders in about a second.
//  - The mastering step (scripts/master.py) on every render: one gain to the system's loudness target, a true-peak
//    limiter at -1 dBTP. It writes <out stem>.mastered.mp4 and its exit status is this command's.
// Where it gains nothing: a first render of a film with sound or footage is Remotion's render (plus a 1.5 s probe);
// a HyperFrames render is HyperFrames' render (plus slots and the cache).
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CACHE, ROOT, clone, lookup, mediaStamp, sha, store, treeHash } from "./perf/cache";
import { slot, slotCount, trySlot } from "./perf/slots";

const a = process.argv.slice(2);
const opt = (k: string) => (a.includes(k) ? a[a.indexOf(k) + 1] : undefined);
const valued = ["--films", "--renderer", "--system", "--out", "--scene", "--seconds", "--size", "--export", "--concurrency", "--root", "--via"];
const [id, systemPos] = a.filter((x, i) => !x.startsWith("--") && !valued.includes(a[i - 1]!));
const renderer = opt("--renderer") ?? "remotion";
const noCache = a.includes("--no-cache");
let system = opt("--system") ?? systemPos;
const T0 = Date.now();
// Remotion gives a page 30 s to draw its first frame. A film with a 3D scene compiles its shaders in each page at
// once (5 pages on this machine), and on a busy or lid-closed machine that took over 30 s (the Keynote and Matte
// reels). One page alone drew the same frame in 8 s. So the limit is 2 minutes: a film that hangs still fails.
const REMOTION_TIMEOUT = "120000";
/** One line for one stage: its name, its time and what it did. */
const stage = (name: string, t0: number, note = "") => console.log(`  ${name.padEnd(8)} ${((Date.now() - t0) / 1000).toFixed(1).padStart(6)} s  ${note}`);
const MARKS = process.env.UNTELL_MARKS;
const mark = (stage: string, t0: number) => { if (MARKS) appendFileSync(MARKS, JSON.stringify({ stage, t0, t1: Date.now() }) + "\n"); };
const say = (m: string) => console.error(m);
const run = (cmd: string, argv: string[], cwd = ROOT, env: Record<string, string> = {}) => {
  const r = spawnSync(cmd, argv, { cwd, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(" ")} failed (${r.status})`);
};
const version = (pkg: string) => { try { return JSON.parse(readFileSync(join(ROOT, "node_modules", pkg, "package.json"), "utf8")).version; } catch { return "?"; } };
// The HyperFrames CLI: UNTELL_HYPERFRAMES, else `hyperframes` on PATH, else this repository's node_modules.
let HF = process.env.UNTELL_HYPERFRAMES ?? Bun.which("hyperframes") ?? join(ROOT, "node_modules/.bin/hyperframes");
const HF_ENV = { HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" };

/** The source the bundles are built from: every file the film modules and the kit can import. */
const SOURCE = () => sha(treeHash([join(ROOT, "src"), join(ROOT, "examples"), join(ROOT, "systems")], (p) => /\.(ts|tsx|js|json|css|png|woff2?)$/.test(p) && !/\.test\.ts$/.test(p)),
  readFileSync(join(ROOT, "bun.lock")), readFileSync(join(ROOT, "package.json")));

/** Takes slots for a job: one (waiting for it), then more while they are free, up to `want`. */
async function slotsFor(what: string, want: number) {
  const releases = [await slot(what, say)];
  while (releases.length < want) { const r = trySlot(what); if (!r) break; releases.push(r); }
  return { n: releases.length, release: () => releases.forEach((r) => r()) };
}

function master(out: string) {
  const t = Date.now();
  if (!system) { stage("master", t, "skipped: no system known (pass --system <id>)"); stage("done", T0, out); return; }
  const m = spawnSync("python3", [join(ROOT, "scripts/master.py"), out, system], { cwd: ROOT, encoding: "utf8" });
  const said = (m.stdout + m.stderr).trim().split("\n").filter(Boolean);
  // master.py exits 1 when the target is missed or the limiter took too much: keep that status for the caller.
  if (m.status !== 0) process.exitCode = m.status ?? 1;
  stage("master", t, `${system}: ${said.at(-1) ?? ""}${m.status !== 0 ? ` (exit ${m.status})` : ""}`);
  const mastered = out.replace(/\.mp4$/, ".mastered.mp4");
  stage("done", T0, existsSync(mastered) && statSync(mastered).mtimeMs >= T0 ? mastered : out);
}


/**
 * A render from the recorder's own frames. The check already drew every frame (scripts/record.ts, the same React
 * tree in Remotion's Player); a current recording comes from the recording cache. This encodes those frames with
 * Remotion's own encode settings (libx264, CRF 18, yuv420p, AAC) and mixes the film's sound from its audio nodes
 * as both renderers play them (each clip trimmed, faded, set to its volume and placed at its time). Returns false
 * when the film has no node-level sound list (not built from scenes): the caller renders the framework's way.
 */
async function fromRecording(films: string, out: string, tmp: string, baseKey: string): Promise<boolean | "cached"> {
  const rec = join(CACHE, "recordings");
  const tR = Date.now();
  // The films: --films, or what the Remotion root registers (the showpieces root its module, the repository root the registry).
  const mod = films || (opt("--root")?.includes("showpieces") ? "src/films/showpieces.tsx" : "");
  const rr = spawnSync("bun", [join(ROOT, "scripts/record.ts"), "--force", ...(noCache ? ["--no-cache"] : []), ...(mod ? ["--films", mod] : []), id!], { cwd: ROOT, encoding: "utf8", env: { ...process.env, UNTELL_REC_OUT: rec } });
  if (rr.status !== 0) { say(rr.stderr.slice(-2000)); throw new Error("record failed"); }
  mark("record", tR);
  stage("record", tR, (rr.stdout.trim().split("\n").at(-1) ?? "").replace(/^[^(]*\(/, "(").replace(/\)$/, ")"));
  const dir = join(rec, id!);
  const audio = JSON.parse(readFileSync(join(dir, "audio.json"), "utf8")) as AudioN[] | null;
  if (audio === null) return false;
  // Footage: the Player's frame of a <video> can differ from the renderer's exact frame (on the hero, 1.2 % of
  // the pixels on one frame, past hf_check's 1 % limit). Such a film renders the framework's way.
  const info = existsSync(join(dir, "render.json")) ? JSON.parse(readFileSync(join(dir, "render.json"), "utf8")) as { footage: boolean } : { footage: true };
  if (info.footage) { say(`${id}: the film has footage: rendering with the framework`); return false; }
  // The output key: the render's own key, the recording's key (all code, scene data, media, browser, recorder) and
  // this file's code (the encode and the mix).
  const recKey = existsSync(join(dir, "key.txt")) ? readFileSync(join(dir, "key.txt"), "utf8").trim() : "";
  const key = recKey ? sha(baseKey, recKey, readFileSync(import.meta.path)) : "";
  const hit = key && !noCache ? lookup("out", key) : null;
  if (hit) { const t = Date.now(); clone(join(hit, "out.mp4"), out); stage("encode", t, `from the render cache (${key.slice(0, 12)})`); return "cached"; }
  const meta = JSON.parse(readFileSync(join(dir, "elements.json"), "utf8")) as { fps: number; durationInFrames: number };
  const seconds = meta.durationInFrames / meta.fps;
  const tE = Date.now();
  const s = await slotsFor(`render ${id} from its recording`, 1);
  try {
    const sound = audio.length ? mixAudio(audio, seconds, join(tmp, "sound.wav"), meta.fps) : null;
    run("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(meta.fps), "-i", join(dir, "frames", "f%04d.jpg"),
      ...(sound ? ["-i", sound] : []), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
      ...(sound ? ["-c:a", "aac", "-b:a", "320k", "-shortest"] : []), "-movflags", "+faststart", join(tmp, "out.mp4")]);
  } finally { s.release(); }
  mark("encode", tE);
  stage("encode", tE, `the check's ${meta.durationInFrames} frames, libx264 CRF 18${audio.length ? ", sound mixed from the audio nodes" : ""}`);
  if (key && !noCache) store("out", key, tmp);
  return true;
}

/**
 * A clip's volume as Remotion applies it: one value per film frame, from the volume function in remotion.tsx
 * (linear fades, fade-out only for a clip with an end), each value held from (k - 0.5) / fps to (k + 0.5) / fps,
 * as Remotion's ffmpeg volume expression does (renderer/dist/assets/ffmpeg-volume-expression.js).
 */
function volumeExpr(n: AudioN, len: number, fps: number) {
  const vol = n.volume ?? 1, fi = (n.fadeIn ?? 0) * fps, fo = (n.fadeOut ?? 0) * fps;
  const frames = Math.round(len * fps);
  const at = (k: number) => vol * Math.min(fi > 0 ? Math.min(1, Math.max(0, k / fi)) : 1,
    fo > 0 && n.until !== undefined ? Math.min(1, Math.max(0, (frames - k) / fo)) : 1);
  const v = Array.from({ length: frames + 1 }, (_, k) => Math.round(at(k) * 1000) / 1000);
  if (new Set(v).size === 1) return `${v[0]}`;
  // Runs of equal values; the most common value is the default at the end of the chain.
  const counts = new Map<number, number>();
  for (const x of v) counts.set(x, (counts.get(x) ?? 0) + 1);
  const common = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  const runs: [number, number, number][] = [];
  for (let k = 0; k < v.length; k++) {
    if (v[k] === common) continue;
    const last = runs.at(-1);
    if (last && last[1] === k - 1 && last[2] === v[k]) last[1] = k; else runs.push([k, k, v[k]!]);
  }
  let e = `${common}`;
  for (const [a, b, x] of runs.reverse()) e = `if(between(t,${((a - 0.5) / fps).toFixed(4)},${((b + 0.5) / fps).toFixed(4)}),${x},${e})`;
  return `'${e}':eval=frame`;
}

type AudioN = { src: string; at: number; until?: number; from?: number; volume?: number; fadeIn?: number; fadeOut?: number };
/** The film's sound as one WAV, each clip on its exact time as HyperFrames plays it (to the sample): trimmed from
 *  `from`, cut at `until`, linear fades, its volume, delayed to `at`. Both Remotion routes use it. Before, it placed
 *  each clip on a whole frame as Remotion does (its Sequence and trimBefore count frames), so a tick played up to half
 *  a frame off its picture (12 ms early, measured on the sync film with scripts/sync_probe.py) and the Remotion and the
 *  HyperFrames renders did not agree. The package's exactMix (packages/untell/src/detector.ts) is the same mix. */
function mixAudio(nodes: AudioN[], seconds: number, out: string, _fps = 30) {
  const inputs: string[] = [], chains: string[] = [];
  nodes.forEach((n, i) => {
    inputs.push("-i", join(ROOT, "assets", "media", n.src));
    const len = Math.min(n.until ?? seconds, seconds) - n.at;
    const f = [`atrim=start=${n.from ?? 0}:duration=${len.toFixed(5)}`, "asetpts=PTS-STARTPTS", "aresample=48000", "aformat=channel_layouts=stereo"];
    if (n.fadeIn) f.push(`afade=t=in:st=0:d=${n.fadeIn}`);
    if (n.fadeOut) f.push(`afade=t=out:st=${Math.max(0, len - n.fadeOut).toFixed(5)}:d=${n.fadeOut}`);
    f.push(`volume=${n.volume ?? 1}`);
    const at = Math.round(Math.max(0, n.at) * 48000);
    if (at > 0) f.push(`adelay=${at}S|${at}S`);
    chains.push(`[${i}:a]${f.join(",")}[a${i}]`);
  });
  const filter = `${chains.join(";")};${nodes.map((_, i) => `[a${i}]`).join("")}amix=inputs=${nodes.length}:normalize=0:duration=longest,apad=whole_dur=${seconds}[out]`;
  run("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex", filter, "-map", "[out]", "-t", String(seconds), "-c:a", "pcm_s16le", out]);
  return out;
}

/** Puts the film's exact mix (mixAudio) in place of a Remotion render's own sound; the picture is copied. The audio
 *  nodes come from a layout-only recording of the film (no pictures). Returns false for a film with no sound nodes. */
function exactSound(films: string, root: string, file: string, tmp: string): boolean {
  const t = Date.now();
  const rec = join(tmp, "layout");
  const mod = films || (root.includes("showpieces") ? "src/films/showpieces.tsx" : "");
  const rr = spawnSync("bun", [join(ROOT, "scripts/record.ts"), "--force", "--layout", ...(mod ? ["--films", mod] : []), id!], { cwd: ROOT, encoding: "utf8", env: { ...process.env, UNTELL_REC_OUT: rec } });
  if (rr.status !== 0) { say(rr.stderr.slice(-2000)); throw new Error("the layout recording for the sound failed"); }
  const audio = JSON.parse(readFileSync(join(rec, id!, "audio.json"), "utf8")) as AudioN[] | null;
  if (!audio?.length) return false;
  const meta = JSON.parse(readFileSync(join(rec, id!, "elements.json"), "utf8")) as { fps: number; durationInFrames: number };
  const seconds = meta.durationInFrames / meta.fps;
  const wav = mixAudio(audio, seconds, join(tmp, "exact.wav"));
  run("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-t", String(seconds), "-movflags", "+faststart", join(tmp, "synced.mp4")]);
  clone(join(tmp, "synced.mp4"), file);
  for (const f of [rec, wav, join(tmp, "synced.mp4")]) rmSync(f, { recursive: true, force: true });
  stage("sound", t, `${audio.length} clip(s) on their exact times, in place of Remotion's frame-rounded mix`);
  return true;
}

/** --verify: render the framework's plain way too and run the quality gate (scripts/perf/render_gate.py):
 *  every frame under hf_check's 1 % of pixels off, and the sound compared after the best alignment. */
function verifyAgainst(out: string, root: string) {
  const plain = join(CACHE, "tmp", `plain-${process.pid}.mp4`);
  const t = Date.now();
  run("npx", ["remotion", "render", root, id!, plain, "--public-dir", "assets", "--timeout", REMOTION_TIMEOUT, "--log", "error"]);
  const g = spawnSync("python3", [join(ROOT, "scripts/perf/render_gate.py"), out, plain], { encoding: "utf8" });
  rmSync(plain, { force: true });
  stage("verify", t, g.stdout.trim());
  if (g.status !== 0) process.exit(1);
}

async function remotion() {
  if (!id) throw new Error("usage: bun scripts/render.ts <film id> [<system id>] [--films <module>]");
  console.log(`untell render ${id} (Remotion)`);
  const films = opt("--films") ?? "";
  const root = opt("--root") ?? (films.includes("showpieces") ? "src/showpieces-root.tsx" : "src/remotion-root.tsx");
  const out = resolve(opt("--out") ?? join(ROOT, "out", "render", `${id}.mp4`));
  mkdirSync(dirname(out), { recursive: true });
  const t0 = Date.now();
  const source = SOURCE();
  const media = mediaStamp();
  const rv = version("@remotion/renderer");
  // The default (auto): encode the recorder's frames (see fromRecording) for a scene film with no footage and no
  // sound; render every other film with Remotion. On 15 reels the frames passed the gate every time, but the sound
  // mixed from the audio nodes missed it on most (out/perf/RESULT.md). --via recording forces the recorder's frames
  // (also with sound); --via framework forces Remotion.
  const viaArg = opt("--via") ?? "auto";
  const via = viaArg === "framework" ? "framework" : "recording";
  // render-2: the sound of a Remotion render is the exact mix (exactSound), so a render-1 file in the cache is stale.
  let key = sha("render-2", "remotion", rv, source, media, root, id, via);
  mark("key", t0);
  // The recording route keys its output after the recording step (see fromRecording): the recording's own key holds
  // the recorder's code and the browser, which this key does not.
  const hit = noCache || via === "recording" ? null : lookup("out", key);
  if (hit) {
    clone(join(hit, "out.mp4"), out);
    stage("render", t0, `from the render cache (${key.slice(0, 12)})`);
    master(out);
    return;
  }
  // A film with footage (or not built from scenes) cannot render from its recording: ask before recording it.
  let useRec = via === "recording";
  if (useRec) {
    const tP = Date.now();
    const mod = films || (root.includes("showpieces") ? "src/films/showpieces.tsx" : "");
    const pr = spawnSync("bun", [join(ROOT, "scripts/record.ts"), "--probe", ...(mod ? ["--films", mod] : []), id], { cwd: ROOT, encoding: "utf8" });
    const info = pr.status === 0 ? JSON.parse(pr.stdout.trim().split("\n").at(-1) ?? "{}") as { footage?: boolean; sound?: boolean; scenes?: boolean; system?: string | null } : {};
    mark("probe", tP);
    system ??= info.system ?? undefined;
    const soundStops = viaArg === "auto" && info.sound !== false;
    if (info.footage !== false || !info.scenes || soundStops) {
      useRec = false;
      stage("probe", tP, `${info.footage ? "footage" : !info.scenes ? "not a scene film" : "sound"}: Remotion draws every frame`);
    } else stage("probe", tP, `no footage${info.sound ? ", sound (--via recording: mixed from the audio nodes, can differ from Remotion's mix)" : ", no sound"}: the check's recording`);
  }
  // The framework route: its own output key (the same as --via framework), so a footage film hits its cache too.
  if (!useRec && via === "recording") {
    const fkey = sha("render-2", "remotion", rv, source, media, root, id, "framework");
    const fhit = noCache ? null : lookup("out", fkey);
    if (fhit) { const t = Date.now(); clone(join(fhit, "out.mp4"), out); stage("render", t, `from the render cache (${fkey.slice(0, 12)})`); master(out); return; }
    key = fkey;
  }
  if (useRec) {
    const tmp = join(CACHE, "tmp", `out-${process.pid}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    const done = await fromRecording(films, out, tmp, key);
    if (done === "cached") { rmSync(tmp, { recursive: true, force: true }); master(out); return; }
    if (done) {
      clone(join(tmp, "out.mp4"), out);
      rmSync(tmp, { recursive: true, force: true });
      master(out);
      if (a.includes("--verify")) verifyAgainst(out, root);
      return;
    }
    rmSync(tmp, { recursive: true, force: true });
  }
  // The bundle: one per source, kept for the next render of any film from the same root.
  const tB = Date.now();
  // The bundle holds a copy of the public folder (assets), so the media stamp is part of its key.
  const bkey = sha("bundle-1", rv, source, root, media);
  let bundle = noCache ? null : lookup("bundles", bkey);
  const bundled = !!bundle;
  if (!bundle) {
    const tmp = join(CACHE, "tmp", `bundle-${process.pid}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(dirname(tmp), { recursive: true });
    run("npx", ["remotion", "bundle", root, "--public-dir", "assets", "--out-dir", tmp, "--log", "error"]);
    // Remotion copies the whole public folder (all of assets/, 1.4 GB) into the bundle. The bundle's key holds the
    // media stamp, so a symbolic link to assets/ serves the same files and keeps the cached bundle at about 70 MB.
    if (existsSync(join(tmp, "public"))) { rmSync(join(tmp, "public"), { recursive: true, force: true }); symlinkSync(join(ROOT, "assets"), join(tmp, "public")); }
    bundle = store("bundles", bkey, tmp);
    rmSync(tmp, { recursive: true, force: true });
  }
  mark("bundle", tB);
  stage("bundle", tB, bundled ? "from the bundle cache" : "webpack bundle, kept for the next render");
  const cores = cpus().length;
  const want = Number(opt("--concurrency")) || Math.max(1, Math.floor(cores / 2));
  // A slot is worth cores/slots pages; take as many slots as the pages want, or as many as are free.
  const per = Math.max(1, Math.floor(cores / slotCount()));
  const s = await slotsFor(`render ${id}`, Math.ceil(want / per));
  const concurrency = Math.min(want, s.n * per);
  const tR = Date.now();
  try {
    const tmp = join(CACHE, "tmp", `out-${process.pid}`);
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    run("npx", ["remotion", "render", bundle, id, join(tmp, "out.mp4"), "--concurrency", String(concurrency), "--timeout", REMOTION_TIMEOUT, "--log", "error"]);
    mark("render", tR);
    stage("render", tR, `Remotion, ${concurrency} page(s) on ${s.n} machine slot(s)`);
    // The sound on its exact times (exactSound); the cache keeps the file with it.
    exactSound(films, root, join(tmp, "out.mp4"), tmp);
    if (!noCache) store("out", key, tmp);
    clone(join(tmp, "out.mp4"), out);
    rmSync(tmp, { recursive: true, force: true });
  } finally { s.release(); }
  master(out);
  if (a.includes("--verify")) verifyAgainst(out, root);

}

async function hyperframes() {
  // An existing project (a folder with index.html, as hf_check builds under out/hf/<name>): render it as it is.
  if (id && existsSync(id) && !opt("--scene")) return hyperframesProject(resolve(id.endsWith(".html") ? dirname(id) : id));
  const scene = opt("--scene"), seconds = opt("--seconds");
  if (!scene || !system || !seconds) throw new Error("usage: bun scripts/render.ts --renderer hyperframes <project dir> | --scene <file> --system <id> --seconds <s>");
  const size = opt("--size") ?? "1080x1920";
  const exp = opt("--export") ?? "scene";
  const name = `${basename(scene).replace(/\.tsx?$/, "")}${exp === "scene" ? "" : `-${exp}`}-${system}${size === "1080x1920" ? "" : `-${size}`}`;
  const out = resolve(opt("--out") ?? join(ROOT, "out", "render", `hf-${name}.mp4`));
  mkdirSync(dirname(out), { recursive: true });
  const t0 = Date.now();
  const hv = (() => { try { return JSON.parse(readFileSync(join(dirname(HF), "../hyperframes/package.json"), "utf8")).version; } catch { return "?"; } })();
  const key = sha("render-1", "hyperframes", hv, SOURCE(), mediaStamp(), scene, system, seconds, size, exp);
  mark("key", t0);
  console.log(`untell render hf-${name} (HyperFrames)`);
  const hit = noCache ? null : lookup("out", key);
  if (hit) { clone(join(hit, "out.mp4"), out); stage("render", t0, `from the render cache (${key.slice(0, 12)})`); master(out); return; }
  // The project, made as hf_check makes it (scripts/perf/hfproj.ts): only the media the scene names.
  const tP = Date.now();
  const dir = join(CACHE, "tmp", `hf-${process.pid}`, name);
  const { makeProject } = await import("./perf/hfproj");
  makeProject(resolve(scene), system, Number(seconds), size, exp, dir);
  mark("project", tP);
  stage("project", tP, "template, runtime, fonts, the media the scene names");
  const s = await slotsFor(`hyperframes render ${name}`, 2);
  const tR = Date.now();
  try {
    const tmp = join(CACHE, "tmp", `out-${process.pid}`);
    mkdirSync(tmp, { recursive: true });
    run(HF, ["render", "-o", join(tmp, "out.mp4"), "--quiet"], dir, HF_ENV);
    mark("render", tR);
    stage("render", tR, `HyperFrames, on ${s.n} machine slot(s)`);
    if (!noCache) store("out", key, tmp);
    clone(join(tmp, "out.mp4"), out);
    rmSync(tmp, { recursive: true, force: true });
  } finally { s.release(); rmSync(dirname(dir), { recursive: true, force: true }); }
  master(out);
}

/** A HyperFrames project as it is: its own files (all of them, media too) key the output cache. */
async function hyperframesProject(dir: string) {
  const name = basename(dir);
  console.log(`untell render ${name} (HyperFrames project)`);
  const out = resolve(opt("--out") ?? join(ROOT, "out", "render", `hf-${name}.mp4`));
  mkdirSync(dirname(out), { recursive: true });
  const t0 = Date.now();
  const hv = (() => { try { return JSON.parse(readFileSync(join(dirname(HF), "../hyperframes/package.json"), "utf8")).version; } catch { return "?"; } })();
  const key = sha("render-1", "hyperframes-project", hv, treeHash([dir], (p) => !p.includes("/assets/media/") && !p.includes("/renders/")), mediaStamp(join(dir, "assets", "media")));
  const hit = noCache ? null : lookup("out", key);
  if (hit) { clone(join(hit, "out.mp4"), out); stage("render", t0, `from the render cache (${key.slice(0, 12)})`); master(out); return; }
  const s = await slotsFor(`hyperframes render ${name}`, 2);
  const tR = Date.now();
  try {
    const tmp = join(CACHE, "tmp", `out-${process.pid}`);
    mkdirSync(tmp, { recursive: true });
    run(HF, ["render", "-o", join(tmp, "out.mp4"), "--quiet"], dir, HF_ENV);
    stage("render", tR, `HyperFrames, on ${s.n} machine slot(s)`);
    if (!noCache) store("out", key, tmp);
    clone(join(tmp, "out.mp4"), out);
    rmSync(tmp, { recursive: true, force: true });
  } finally { s.release(); }
  master(out);
}

// A HyperFrames project given as the film: the HyperFrames renderer, without --renderer.
const isProject = !!id && existsSync(id) && (id.endsWith(".html") || existsSync(join(id, "index.html")));
if (renderer === "remotion" && !isProject) await remotion();
else if (isProject) await hyperframes();
else if (renderer === "hyperframes") await hyperframes();
else { console.error("--renderer is remotion or hyperframes"); process.exit(2); }
