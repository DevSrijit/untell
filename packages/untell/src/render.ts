// `untell render <film>`: the one command for a final file, in both frameworks. The repository's scripts/render.ts, for a
// project. It prints one line for each stage with its time, then the final file's size, loudness and true peak.
//
//   Remotion     A film with no footage and no sound is encoded from the check's own recording: the same frames
//                Remotion's Player drew for the check (from the recording cache after a check), with Remotion's
//                encode settings (libx264, CRF 18). On the repository's 17 films without footage every frame of this route
//                stayed inside the tolerance of Remotion's own render (out/perf/RESULT.md). Every other film renders
//                with Remotion (`remotion render`), from an entry that untell writes, so the film needs no Root entry.
//   HyperFrames  `hyperframes render` of the project's page; with a scene module, untell build first when the page
//                is not built from it.
// Then: a bitrate cap (a render over 12 Mbit/s gets its picture encoded again as H.264 at a phone feed's size; the
// sound is copied), the master (untell master: the system's loudness target, a true-peak limit), and the facts of the
// final file. A machine slot for each heavy stage; an unchanged film comes from the output cache.
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync, type SpawnSyncReturns, type StdioOptions } from "node:child_process";
import { createRequire } from "node:module";
import { buildHf, launchChrome, loadSceneMeta } from "./build";
import { runHyperframes } from "./env";
import { builtScene, filmToCheck, HF_FIX, hyperframesCommand, newestIn, pageForFilm, zeroCredits } from "./check";
import { cacheDir, clone, lookup, mediaStamp, sha, store, treeHash, formatBytes } from "./cache";
import { detectFramework, hasRemotionCli, remotionCliFix } from "./detect";
import { exactMix, loudnessOf } from "./detector";
import { MissingToolError, UsageError } from "./errors";
import { KIT_DIR } from "./kit";
import { runMaster, type MasterResult } from "./master";
import { mediaPaths } from "./media-paths";
import { CHROME_FLAGS, filmTab, openFilm, recordFilm, slotWait, type FilmPage } from "./record";
import { SceneError } from "./errors";
import { slot, slotCount, trySlot } from "../../../scripts/perf/slots";

export type RenderOptions = { out?: string; noMaster?: boolean; json?: boolean; system?: string; noCache?: boolean; via?: string; hyperframes?: string; keepBitrate?: boolean };
type Stage = { name: string; seconds: number; note: string };
export type RenderReport = {
  version: 1; film: string; framework: "remotion" | "hyperframes"; route: "recording" | "framework" | "cache";
  render: string; final: string; stages: Stage[]; bytes: number; seconds: number; mbitPerSecond: number;
  lufs: number | null; truePeak: number | null; master: MasterResult | null; ok: boolean;
};

/** The video bitrate above which the picture is encoded again for delivery (a phone feed takes about this much). */
export const DELIVERY_MBIT = 12;
/** The delivery encode: H.264 at CRF 20 with a 12 Mbit/s peak rate (a 1 s buffer), yuv420p, fast start; the sound is copied.
 *  The file's mean rate can sit a little over the peak rate: the container and the sound add to it. */
export const DELIVERY_ARGS = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-maxrate", `${DELIVERY_MBIT}M`, "-bufsize", `${DELIVERY_MBIT}M`, "-pix_fmt", "yuv420p"];

/** Increments this when a render route writes something different: it is part of every output key. */
const RENDER = "untell-render-1";

const ff = (args: string[], what: string) => {
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (r.error) throw new MissingToolError("untell render needs ffmpeg. Install it: https://ffmpeg.org (on macOS: brew install ffmpeg).");
  if (r.status !== 0) throw new Error(`${what} failed: ${(r.stderr ?? "").trim().split("\n").slice(-2).join(" ")}`);
};

/** The duration and the video bitrate of a file, from ffprobe. */
export function probe(file: string): { seconds: number; videoBits: number; audio: boolean } {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,bit_rate", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(r.stdout || "{}") as { format?: { duration?: string }; streams?: { codec_type: string; bit_rate?: string }[] };
  const seconds = Number(j.format?.duration ?? 0);
  const v = j.streams?.find((s) => s.codec_type === "video");
  const videoBits = Number(v?.bit_rate ?? 0) || (seconds ? (statSync(file).size * 8) / seconds : 0);
  return { seconds, videoBits, audio: !!j.streams?.some((s) => s.codec_type === "audio") };
}

/** Takes slots for a job: one (waiting for it), then more while they are free, up to `want`. */
async function slotsFor(what: string, want: number, say: (s: string) => void) {
  const releases = [await slot(what, (m) => say(`  ${slotWait(m)}`))];
  while (releases.length < want) { const r = trySlot(what); if (!r) break; releases.push(r); }
  return { n: releases.length, release: () => releases.forEach((r) => r()) };
}

const versionIn = (project: string, pkg: string) => { try { return (JSON.parse(readFileSync(createRequire(join(project, "package.json")).resolve(`${pkg}/package.json`), "utf8")) as { version: string }).version; } catch { return null; } };

/** The Remotion entry that registers one scene module as the composition "film". The film needs no Root entry. */
export function remotionEntry(kitFilm: string, scene: string): string {
  return [
    "// Written by untell render: one scene module as the composition \"film\". Edit the scene, not this file.",
    `import { Composition, registerRoot } from "remotion";`,
    `import { sceneComposition } from ${JSON.stringify(kitFilm)};`,
    `import * as film from ${JSON.stringify(scene)};`,
    `const Film = sceneComposition("film", film);`,
    `registerRoot(() => <Composition {...Film} />);`,
    "",
  ].join("\n");
}

export async function render(projectArg: string, filmArg: string | undefined, o: RenderOptions = {}): Promise<number> {
  const project = resolve(projectArg);
  const fw = detectFramework(project);
  if (fw === "both") throw new UsageError("this project has hyperframes.json and a remotion dependency. Give --cwd <folder> for one of them.", "render");
  if (!fw) throw new UsageError("no Remotion or HyperFrames project here. Run untell render in the project folder, or give --cwd <folder>.", "render");
  if (o.via && !["auto", "framework"].includes(o.via)) throw new UsageError(`--via is auto or framework, not "${o.via}".`, "render");
  const log = o.json ? (s: string) => console.error(s) : (s: string) => console.log(s);
  const T0 = Date.now();
  const stages: Stage[] = [];
  const stage = (name: string, t0: number, note = "") => { const s = { name, seconds: (Date.now() - t0) / 1000, note }; stages.push(s); log(`  ${name.padEnd(8)} ${s.seconds.toFixed(1).padStart(6)} s  ${note}`); };
  const film = filmToCheck(project, fw, filmArg, () => {});
  if (!film.scene && fw === "remotion") throw new UsageError("untell render needs the scene module of the film: untell render src/films/<name>.ts", "render");
  const scene = film.scene;
  const meta = scene ? await loadSceneMeta(project, scene) : null;
  const system = o.system ?? meta?.system;
  const out = resolve(project, o.out ?? join("out", `${film.id}.mp4`));
  mkdirSync(dirname(out), { recursive: true });
  const cache = cacheDir(project), useCache = !o.noCache;
  const tmp = join(project, ".untell", "render", `tmp-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const p = mediaPaths(project, fw);
  let route: RenderReport["route"] = "framework";
  // The hash of the scene's nodes as this render draws them: untell check compares it with the scene it checks.
  let nodesHash: string | null = null;
  log(`untell render ${scene ? relative(project, scene) : "index.html"} (${fw === "remotion" ? "Remotion" : "HyperFrames"})`);
  try {
    if (fw === "remotion") {
      // 1. The probe: footage and sound, from the film's own page (as the check records it).
      const tP = Date.now();
      const fp = await pageForFilm(project, fw, scene, "check");
      const facts = await probeFilm(project, fp);
      nodesHash = facts.nodes ? sha(facts.nodes) : null;
      const via = o.via === "framework" ? "framework" : facts.footage || facts.sound ? "framework" : "recording";
      stage("probe", tP, via === "recording" ? "no footage, no sound: the check's recording" : `${facts.footage ? "footage" : facts.sound ? "sound" : "--via framework"}: Remotion draws every frame`);
      if (via === "recording") {
        const tR = Date.now();
        const recording = join(project, ".untell", "recordings", film.id);
        const rec = await recordFilm(fp, recording, { project, log, capture: join(project, ".untell", "lab", "out", "detector", film.id), media: p.media, cache: useCache });
        stage("record", tR, rec.from === "cache" ? "the check's recording, from the recording cache" : `${rec.drawn} drawn, ${rec.reused} copied from the frame before, ${rec.fromCache} from the frame cache`);
        const key = sha(RENDER, "recording", rec.key);
        const hit = useCache ? lookup(cache, "out", key, ["out.mp4"]) : null;
        const tE = Date.now();
        if (hit) { clone(join(hit, "out.mp4"), out); route = "cache"; stage("encode", tE, "from the render cache"); }
        else {
          const s = await slotsFor(`untell render ${film.id}`, 1, log);
          try { ff(["-framerate", String(rec.fps), "-i", join(recording, "frames", "f%04d.jpg"), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", join(tmp, "out.mp4")], "the encode"); }
          finally { s.release(); }
          if (useCache) store(cache, "out", key, tmp);
          clone(join(tmp, "out.mp4"), out);
          route = "recording";
          stage("encode", tE, `the check's ${rec.durationInFrames} frames, libx264 CRF 18 (Remotion's settings)`);
        }
      } else {
        // Remotion's CLI renders this film: without it, say the one command now, not after the build.
        if (!hasRemotionCli(project)) throw new MissingToolError(`untell render needs Remotion's CLI (@remotion/cli), and this project does not have it. Run: ${remotionCliFix(project)}`);
        const rv = versionIn(project, "remotion") ?? "?";
        const entryDir = join(project, ".untell", "render", film.id);
        mkdirSync(entryDir, { recursive: true });
        const kitFilm = relative(entryDir, join(project, KIT_DIR.remotion, "film")).split("\\").join("/");
        const sceneRel = relative(entryDir, scene!).split("\\").join("/").replace(/\.tsx?$/, "");
        const entry = join(entryDir, "entry.tsx");
        writeFileSync(entry, remotionEntry(kitFilm.startsWith(".") ? kitFilm : `./${kitFilm}`, sceneRel.startsWith(".") ? sceneRel : `./${sceneRel}`));
        const config = ["remotion.config.ts", "remotion.config.js"].map((f) => join(project, f)).find(existsSync);
        // The film's page bundle holds the scene and the kit; the media stamp, Remotion's version and the config do the rest.
        const key = sha(RENDER, "remotion", rv, readFileSync((fp as { bundle: string }).bundle), mediaStamp(p.media), config ? readFileSync(config) : "",
          treeHash([join(project, "src")], project, (f) => /\.(ts|tsx|js|jsx|css|json)$/.test(f)));
        const hit = useCache ? lookup(cache, "out", key, ["out.mp4"]) : null;
        const tR = Date.now();
        if (hit) { clone(join(hit, "out.mp4"), out); route = "cache"; stage("render", tR, "from the render cache"); }
        else {
          const cores = cpus().length, want = Math.max(1, Math.floor(cores / 2)), per = Math.max(1, Math.floor(cores / slotCount()));
          const s = await slotsFor(`untell render ${film.id}`, Math.ceil(want / per), log);
          const concurrency = Math.min(want, s.n * per);
          const bin = join(project, "node_modules", ".bin", process.platform === "win32" ? "remotion.cmd" : "remotion");
          const cmd = existsSync(bin) ? [bin] : ["npx", "--no-install", "remotion"];
          try {
            const r = withProgress(project, "render", log, (stdio) => spawnSync(cmd[0]!, [...cmd.slice(1), "render", entry, "film", join(tmp, "out.mp4"), "--concurrency", String(concurrency), "--timeout", "120000"], { cwd: project, stdio }));
            if (r.error || r.status !== 0) throw new Error(`remotion render failed (${r.error?.message ?? `exit ${r.status}`}):\n${r.tail}\nWhat it ran: ${cmd.join(" ")} render ${relative(project, entry)} film out/${film.id}.mp4`);
          } finally { s.release(); }
          if (useCache) store(cache, "out", key, tmp);
          clone(join(tmp, "out.mp4"), out);
          stage("render", tR, `Remotion ${rv}, ${concurrency} page(s) on ${s.n} machine slot(s): remotion render ${relative(project, entry)} film`);
        }
        // The sound on its exact times. Remotion starts each clip on a whole frame (its Sequence and trimBefore count
        // frames), so a clip played up to half a frame early or late, and a Remotion render and a HyperFrames render of
        // one film did not agree. The film's sound is mixed again with each clip on its own time to the sample (as
        // HyperFrames plays it) and put in place of Remotion's; the picture is copied.
        const audio = facts.nodes ? (JSON.parse(facts.nodes) as { kind: string }[]).filter((n): n is Parameters<typeof exactMix>[0][number] => n.kind === "audio") : [];
        if (audio.length && meta) {
          const tS = Date.now();
          const wav = exactMix(audio, meta.seconds, p.media, join(tmp, "exact.wav"));
          const synced = join(tmp, "synced.mp4");
          ff(["-i", out, "-i", wav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-t", String(meta.seconds), "-movflags", "+faststart", synced], "the sound's mix");
          clone(synced, out);
          stage("sound", tS, `${audio.length} clip(s) on their exact times, in place of Remotion's frame-rounded mix`);
        }
      }
    } else {
      zeroCredits(project);
      // A scene module given: the page must be built from it.
      const page = join(project, "index.html");
      if (scene && (builtScene(project) !== scene || !existsSync(page) || Math.max(statSync(scene).mtimeMs, newestIn(join(project, KIT_DIR.hyperframes))) > statSync(page).mtimeMs)) {
        const tB = Date.now();
        await buildHf(project, scene, () => {});
        stage("build", tB, `untell build ${relative(project, scene)}`);
      }
      // The probe also finds a scene that throws at build: then the render ends now with its error, not after HyperFrames' wait.
      if (scene) { const pr = await probeFilm(project, { kind: "hf", html: join(project, "index.html"), runtime: null }).catch((e) => { if (e instanceof SceneError) throw e; return null; }); nodesHash = pr?.nodes ? sha(pr.nodes) : null; }
      if (!existsSync(join(project, "index.html"))) throw new UsageError("no index.html here. Build the film first: untell render films/<name>.ts builds and renders it.", "render");
      const hf = hyperframesCommand(project, o.hyperframes);
      const hv = hf.bin ? (() => { let d = dirname(hf.bin!); for (let i = 0; i < 5; i++, d = dirname(d)) { const f = join(d, "hyperframes", "package.json"); if (existsSync(f)) return (JSON.parse(readFileSync(f, "utf8")) as { version: string }).version; } return "?"; })() : hf.cmd.join(" ");
      const key = sha(RENDER, "hyperframes", hv, treeHash([project], project, (f) => !/[\\/](assets[\\/]media|out|renders|node_modules|\.untell)[\\/]/.test(f) && /\.(html|js|css|json|woff2|png)$/.test(f)), mediaStamp(p.media));
      const hit = useCache ? lookup(cache, "out", key, ["out.mp4"]) : null;
      const tR = Date.now();
      if (hit) { clone(join(hit, "out.mp4"), out); route = "cache"; stage("render", tR, "from the render cache"); }
      else {
        const s = await slotsFor(`untell render ${film.id}`, 2, log);
        try {
          const r = withProgress(project, "render", log, (stdio) => runHyperframes(hf.cmd, ["render", "-o", join(tmp, "out.mp4")], { cwd: project, stdio }));
          if (r.error) throw new MissingToolError(`could not run ${hf.cmd.join(" ")}: ${r.error.message}. ${HF_FIX}`);
          if (r.status !== 0) throw new Error(`hyperframes render failed (exit ${r.status}):\n${r.tail}`);
        } finally { s.release(); }
        if (useCache) store(cache, "out", key, tmp);
        clone(join(tmp, "out.mp4"), out);
        stage("render", tR, `HyperFrames ${hv}: ${hf.cmd.map((c) => (c.includes("/") ? basename(c) : c)).join(" ")} render`);
      }
    }

    // 2. The bitrate cap: a feed recompresses a file over its limit, so untell does it once, well.
    let rendered = out;
    const pr = probe(out);
    if (!o.keepBitrate && pr.videoBits > DELIVERY_MBIT * 1e6) {
      const tD = Date.now();
      const capped = join(tmp, "capped.mp4");
      ff(["-i", out, ...DELIVERY_ARGS, "-c:a", "copy", "-movflags", "+faststart", capped], "the delivery encode");
      clone(capped, out);
      stage("deliver", tD, `${(pr.videoBits / 1e6).toFixed(1)} Mbit/s is over ${DELIVERY_MBIT}: the picture encoded again (H.264, CRF 20, a peak rate of ${DELIVERY_MBIT} Mbit/s); the sound copied. --keep-bitrate keeps the render as it is`);
    }

    // 3. The master: the system's loudness target and a true-peak limit (the picture is copied).
    let m: MasterResult | null = null;
    if (!o.noMaster) {
      const tM = Date.now();
      if (!system) stage("master", tM, "skipped: no system known (give --system <id>)");
      else {
        const { res, text } = runMaster(project, out, { system });
        m = res;
        if (res.done) rendered = resolve(project, res.out!);
        const said = text.filter((l) => /^(after|gain|warning|error)/.test(l));
        stage("master", tM, res.done ? `${system}: ${said.join("; ")}` : `${system}: ${res.note ?? "nothing to do"}`);
      }
    }
    const fin = probe(rendered);
    const loud = fin.audio ? loudnessOf(rendered) : { lufsIntegrated: null, truePeakDb: null };
    const bytes = statSync(rendered).size;
    // The render's facts beside it (<file>.untell.json): the scene and the hash of its nodes, for untell check.
    if (nodesHash) for (const f of new Set([out, rendered])) writeFileSync(`${f}.untell.json`, JSON.stringify({ version: 1, scene: scene ? relative(project, scene) : null, nodes: nodesHash }) + "\n");
    const rep: RenderReport = { version: 1, film: film.id, framework: fw, route, render: relative(project, out), final: relative(project, rendered), stages, bytes,
      seconds: fin.seconds, mbitPerSecond: fin.seconds ? (bytes * 8) / fin.seconds / 1e6 : 0, lufs: loud.lufsIntegrated, truePeak: loud.truePeakDb, master: m, ok: !m || m.ok };
    stage("done", T0, relative(project, rendered));
    log(`\nfinal: ${rep.final}: ${formatBytes(bytes)} (${rep.mbitPerSecond.toFixed(1)} Mbit/s over ${fin.seconds.toFixed(1)} s)${fin.audio ? `, ${loud.lufsIntegrated?.toFixed(1) ?? "?"} LUFS, true peak ${loud.truePeakDb?.toFixed(1) ?? "?"} dBTP` : ", no sound"}`);
    if (m && !m.ok) log("The master is not good enough: read the master line above, fix the mix in the scene, then render again.");
    else log(`Next: untell check ${scene ? relative(project, scene) : ""}${scene ? " " : ""}--render ${rep.final} --sheet`);
    if (o.json) console.log(JSON.stringify(rep, null, 1));
    return rep.ok ? 0 : 1;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

/** Whether the film shows footage and plays sound, from its own page (Remotion's Player reports both). */
async function probeFilm(project: string, fp: FilmPage): Promise<{ footage: boolean; sound: boolean; nodes: string }> {
  const browser = await launchChrome(CHROME_FLAGS);
  try {
    const page = await filmTab(browser, project, () => {});
    await openFilm(page, fp);
    return await page.evaluate(() => {
      const w = window as unknown as { __footage?: () => boolean; __sound?: () => boolean };
      const n = (window as unknown as { __untellNodes?: unknown }).__untellNodes;
      return { footage: w.__footage ? w.__footage() : true, sound: w.__sound ? w.__sound() : true, nodes: n ? JSON.stringify(n) : "" };
    });
  } finally { await browser.close(); }
}

/**
 * Runs a long step with its output in a progress file, and says where before it starts: a caller that waits for a
 * result line can follow the step (an agent's window once ended on a render that had printed nothing). Returns the
 * child's result and the last 12 lines of its output, for an error message.
 */
export function withProgress(project: string, step: string, log: (s: string) => void, run: (stdio: StdioOptions) => SpawnSyncReturns<unknown>): SpawnSyncReturns<unknown> & { tail: string } {
  const dir = join(project, ".untell", "progress");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${step}.log`);
  log(`  ${step}: this step can take minutes; its progress goes to ${relative(project, file)} (follow it with: tail -f ${relative(project, file)})`);
  const fd = openSync(file, "w");
  let r: SpawnSyncReturns<unknown>;
  try { r = run(["ignore", fd, fd]); } finally { closeSync(fd); }
  const tail = readFileSync(file, "utf8").replace(/\r/g, "\n").trim().split("\n").filter(Boolean).slice(-12).join("\n");
  return Object.assign(r, { tail });
}
