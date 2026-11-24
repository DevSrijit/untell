// `untell check`: the checks a user can run in their own project.
// Both frameworks: untell lint on the films folder. HyperFrames: `hyperframes check` (lint, runtime, layout,
// motion, contrast) on the built page. Then the recorder (record.ts, the repository's recorder) and the detector
// (detector.ts): the repository's checks of the recorded film. A Remotion film plays in Remotion's own Player; a HyperFrames
// film is the project's page with HyperFrames' runtime. When the scene has sound, the detector mixes it as the
// renderers play it and runs the sound checks on the mix; a render (--render <file>, or the file after the film)
// adds the sound checks on the real render. With --sheet: the review sheet of the render or of the recording.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { detectFramework, hyperframesVersion } from "./detect";
import { registryDir } from "./kit";
import { playerPage, recordFilm, type FilmPage, type RecordResult } from "./record";
import { mediaPaths } from "./media-paths";
import { analysisPython, ensureDetectorPython, runHyperframes } from "./env";
import { alignPass } from "./align-pass";
import { MissingToolError, UsageError } from "./errors";
import { filmsFolders, lintFiles, lintPaths, RULES as LINT_RULES, silentStatement } from "./lint";
const lintRuleIds = () => LINT_RULES.map((r) => r.id);
import { sheet } from "./sheet";
import { buildHf, loadSceneMeta } from "./build";
import { KIT_DIR, kitMismatch } from "./kit";
import { blockFindings, detectorRules, messageOf, mixSound, runDetect, sourceMtime, type DeclaredFinding, type DetectorGroup } from "./detector";
import { findHyperframes, workEnv, workTree } from "./worktree";
import { sha } from "./cache";
import { guidesOf } from "../registry/kit/scene/align";

/** How to give untell the HyperFrames CLI. */
export const HF_FIX = "untell runs the project's own HyperFrames CLI (node_modules/.bin/hyperframes). Install it in this project (npm install --save-dev hyperframes), set UNTELL_HYPERFRAMES to the path of a hyperframes program, or give --hyperframes <path>.";

export { HF_ENV } from "./env";

/** The hyperframes command: --hyperframes, else the CLI untell finds (UNTELL_HYPERFRAMES, the project's bin, PATH, npx's copy), else npx at the project's version. */
export function hyperframesCommand(project: string, flag?: string): { cmd: string[]; bin: string | null } {
  const bin = flag ?? findHyperframes(project);
  if (bin) return { cmd: [bin], bin };
  return { cmd: ["npx", "--yes", `hyperframes@${hyperframesVersion(project) ?? "latest"}`], bin: null };
}

/**
 * The HyperFrames package that npx installed for a version (npm's cache, _npx/<hash>/node_modules/hyperframes), or
 * null. A project that runs HyperFrames through npx (the scripts that hyperframes init writes) has no local copy.
 */
export function npxHyperframes(version: string | null): string | null {
  const cache = process.env.npm_config_cache || spawnSync("npm", ["config", "get", "cache"], { encoding: "utf8", timeout: 15000 }).stdout?.trim();
  if (!cache || !existsSync(join(cache, "_npx"))) return null;
  for (const d of readdirSync(join(cache, "_npx"))) {
    const pkg = join(cache, "_npx", d, "node_modules", "hyperframes");
    try {
      const v = (JSON.parse(readFileSync(join(pkg, "package.json"), "utf8")) as { version: string }).version;
      if (!version || version === "latest" || v === version) return pkg;
    } catch { /* not this one */ }
  }
  return null;
}

/** HyperFrames' page runtime, beside its CLI: <package>/dist/hyperframe.runtime.iife.js. Without a CLI path, npx's copy. */
export function hyperframesRuntime(bin: string | null, project?: string): string | null {
  if (process.env.UNTELL_HF_RUNTIME) return process.env.UNTELL_HF_RUNTIME;
  if (!bin) {
    const pkg = project ? npxHyperframes(hyperframesVersion(project)) : null;
    const rt = pkg ? join(pkg, "dist", "hyperframe.runtime.iife.js") : null;
    return rt && existsSync(rt) ? rt : null;
  }
  let d = dirname(realpathSync(bin));
  for (let i = 0; i < 5; i++, d = dirname(d)) {
    const p = join(d, "dist", "hyperframe.runtime.iife.js");
    if (existsSync(p)) return p;
  }
  return null;
}

/** Zero credits: no HyperFrames command in this project can spend HeyGen credits. */
export function zeroCredits(project: string) {
  const p = join(project, ".hyperframes", "credit-limit.json");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ credits: 0 }) + "\n");
}

/** One finding of `untell check`. The shape is stable: agents of both harnesses parse it. */
export type CheckFinding = {
  /** "lint/<rule id>", "hyperframes", or a detector rule id ("stall", "cover", "a11y/flash", "sound/cut-on-beat"). */
  check: string;
  /** "advice" marks a detector rule without a planted fixture yet. Only an error fails the check. */
  severity: "error" | "warning" | "advice";
  message: string;
  fix?: string;
  /** For a lint finding: the file (relative to the project) and the line. */
  file?: string;
  line?: number;
  /** For a finding at a time in the film: from and to, in seconds. */
  from?: number;
  to?: number;
  /** For a detector finding: the scene node (its data-el label), what the check measured and its limit. */
  node?: string;
  /** For a HyperFrames finding: the element's selector as HyperFrames gave it. */
  selector?: string;
  measured?: unknown;
  limit?: unknown;
};
/** The report that `untell check` writes to .untell/check/report.json and prints with --json. Version 1. */
export type CheckReport = {
  version: 1; project: string; framework: string; ok: boolean;
  /** Errors fail the check. Warnings do not. Advice (a check whose findings need an ear, or a mix before the master) never counts. */
  errors: number; warnings: number; advice: number;
  /** The film that the detector checked: its id, its scene module, its system and the render it heard. */
  film?: { id: string; scene: string | null; system: string | null; render: string | null; capture: string | null } | null;
  /** The detector's checks that did not run, with the reason. */
  skipped?: Record<string, string>;
  steps: { name: string; ok: boolean; note?: string }[];
  /** The first screen: the detector's findings grouped by cause, errors first, in time order. */
  groups?: DetectorGroup[];
  findings: CheckFinding[];
  /** Detector findings the scene declares intended (// untell-ignore <rule> [node]: <reason>): listed, never counted. */
  declared?: DeclaredFinding[];
  /** The detector's own verdict line (failed / passed with warnings / passed; a demo runs frame rules only). */
  verdict?: { state: string; errors: number; warnings: number; advice: number; unusedDeclarations?: number; renderStale: boolean; line: string } | null;
  /** Each untell-ignore comment and its effect: how many findings it matched (0: it matched nothing). */
  declarations?: { rule: string; nodes: string[]; reason: string; where: string; scope: string; matched: number; why?: string; lint?: boolean; statement?: boolean }[];
  /** What a check could not measure, and declarations that matched nothing. */
  notes?: unknown[];
  sheet?: { image: string; json: string; phone?: string } | null;
};
export type CheckOptions = { demo?: boolean; hyperframes?: string; skipRecord?: boolean; sheet?: boolean | string; json?: boolean; full?: boolean; film?: string; render?: string; noDetect?: boolean; noCache?: boolean; noReuse?: boolean };

/** One line about a recording: where it came from and how long it took. */
export const recordedLine = (m: RecordResult, what: string) =>
  m.from === "cache"
    ? `nothing changed since the last recording: used ${what} (${m.system ?? "no system"}, ${m.durationInFrames} frames) from the recording cache in ${m.seconds.toFixed(1)} s`
    : `recorded ${m.durationInFrames} frames of ${what} (${m.system ?? "no system"}) in ${m.seconds.toFixed(1)} s (${m.drawn} drawn, ${m.reused} copied from the frame before${m.fromCache ? `, ${m.fromCache} from the frame cache` : ""}${m.retried ? `, ${m.retried} tried again` : ""})`;

/**
 * The page a film plays in. Remotion: the scene in Remotion's Player (record.ts writes the page into
 * .untell/<what>/page/<id>). HyperFrames: the project's index.html with HyperFrames' runtime.
 */
export async function pageForFilm(project: string, fw: "remotion" | "hyperframes", scene: string | null, what: string, o: { hyperframes?: string; moves?: boolean } = {}): Promise<FilmPage> {
  if (fw === "hyperframes") {
    const hf = hyperframesCommand(project, o.hyperframes);
    return { kind: "hf", html: join(project, "index.html"), runtime: hyperframesRuntime(hf.bin, project) };
  }
  if (!scene) throw new UsageError("no scene module to record. Give one: untell check src/films/<name>.ts", "check");
  const id = basename(scene).replace(/\.[^.]+$/, "");
  const meta = await loadSceneMeta(project, scene);
  const dir = join(project, ".untell", what, "page", id);
  const p = mediaPaths(project, "remotion");
  return playerPage(project, scene, join(project, KIT_DIR.remotion), dir, { moves: o.moves, mediaBase: relative(dir, p.media).split("\\").join("/") + "/", seconds: meta.seconds, width: meta.width, height: meta.height });
}

/** The command that checks a render, for the lines that say what the check did not cover. */
const renderHint = (sceneRel: string | null) => `untell render ${sceneRel ?? "<film>"} (it renders and masters the final file), then untell check ${sceneRel ?? "<film>"} --render <final file>`;

/**
 * `untell check`: lint, then (HyperFrames) hyperframes check, then the recorder and the detector, then (with
 * --sheet) the review sheet with the findings on it. Returns the exit code: 0 clean, 1 findings, 2 a missing tool.
 */
/** The terminal style of the check screen (out/readme/check-screen.md): a character mark on every line, colour only on a
 *  terminal and never with NO_COLOR, so a pipe (an agent) gets plain text. The same marks as the review sheet. */
export function screenStyle(tty: boolean) {
  const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
  const red = paint("31"), yellow = paint("33"), green = paint("32"), dim = paint("2"), bold = paint("1");
  const mark = (sev: string) => (sev === "error" ? red("x") : sev === "warning" ? yellow("!") : sev === "declared" ? "=" : dim("i"));
  const span = (a: number, b: number) => (a === b ? `${a.toFixed(2)} s` : `${a.toFixed(2)}\u2013${b.toFixed(2)} s`);
  return { red, yellow, green, dim, bold, mark, span };
}
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * The step lines of a check wait in a buffer, so that the verdict is the first line on the screen. On a terminal, each
 * step shows meanwhile on one status line of stderr, which the screen clears. `flush` prints what waits (a check that
 * throws prints its steps before the error); `take` gives the lines to the screen.
 */
export function stepBuffer(out: (s: string) => void, status: boolean) {
  const lines: string[] = [];
  let shown = false;
  const clear = () => { if (shown) process.stderr.write("\r\x1b[K"); shown = false; };
  return {
    log: (s: string) => {
      lines.push(s);
      if (!status) return;
      const l = s.split("\n").find((x) => x.trim())?.trim() ?? "";
      process.stderr.write(`\r\x1b[K${l.slice(0, Math.max(20, (process.stderr.columns ?? 100) - 1))}`);
      shown = true;
    },
    take: () => { clear(); return lines.splice(0); },
    flush: () => { clear(); for (const l of lines.splice(0)) out(l); },
  };
}

export async function check(projectArg: string, opts: CheckOptions = {}): Promise<number> {
  const project = resolve(projectArg);
  const fw = detectFramework(project);
  if (fw === "both") throw new UsageError("this project has hyperframes.json and a remotion dependency. untell check cannot tell which film to check yet: give --cwd <folder> for one of them.", "check");
  if (!fw) throw new UsageError("no Remotion or HyperFrames project here: no remotion dependency in package.json and no hyperframes.json. Run untell check in the project folder, or give --cwd <folder>. To check a video file alone, give it: untell check <video.mp4>.", "check");
  const out = opts.json ? (s: string) => console.error(s) : (s: string) => console.log(s);
  const S = screenStyle(!!(opts.json ? process.stderr.isTTY : process.stdout.isTTY) && !process.env.NO_COLOR);
  // The verdict is the first line: the step lines wait until the screen (a terminal sees each on a status line).
  const steps = stepBuffer(out, !!process.stderr.isTTY && !process.env.NO_COLOR);
  // What the film says while untell loads or builds it (a block's console.warn, such as a low-trust beat grid) waits
  // too: it prints after the verdict, one time, as a finding or else as a step line. Before, it printed on stderr
  // above the verdict, again as a build line, and again as a finding.
  const filmSaid: string[] = [];
  const warn = console.warn;
  console.warn = (...m: unknown[]) => { const t = m.map(String).join(" "); if (!filmSaid.includes(t)) filmSaid.push(t); };
  let screen = false;
  try { const code = await checkSteps(project, fw, opts, steps, out, S, filmSaid); screen = true; return code; }
  finally {
    console.warn = warn;
    // A check that throws prints its steps before the error, and what the film said with them.
    if (!screen) for (const m of filmSaid) steps.log(`  film     ${m.slice(0, 300)}`);
    steps.flush();
  }
}

/** A film's warning that a finding already carries: the same text after its block prefix ("beats track: "), in the
 *  finding's message or in what it measured (the detector's block-warning keeps the block's text there). */
export function warningCovered(message: string, findings: readonly { message?: string; measured?: unknown }[]): boolean {
  const body = message.slice(message.indexOf(":") + 1).trim().slice(0, 40);
  const said = (f: { measured?: unknown }) => { const m = f.measured as { message?: unknown } | undefined; return typeof m?.message === "string" ? m.message : ""; };
  return !!body && findings.some((f) => (f.message ?? "").includes(body) || said(f).includes(body));
}

async function checkSteps(project: string, fw: "remotion" | "hyperframes", opts: CheckOptions, steps: ReturnType<typeof stepBuffer>, out: (s: string) => void, S: ReturnType<typeof screenStyle>, filmSaid: string[]): Promise<number> {
  const log = steps.log;
  const report: CheckReport = { version: 1, project, framework: fw, ok: true, errors: 0, warnings: 0, advice: 0, steps: [], findings: [], sheet: null };
  const step = (name: string, ok: boolean, note?: string) => report.steps.push({ name, ok, ...(note ? { note } : {}) });
  let missingTool = false;
  let hfSeen: HfIgnore[] = [];
  let alignDecls: { rule: string; nodes: string[]; reason: string; where: string; scope: string; matched: number; why?: string }[] = [];
  let hfDeclared: DeclaredFinding[] = [], hfUnused: { unused: string; why: string; check: string }[] = [];
  let hfFolded: string[] = [];

  // The head: the film, its system, its length and its size.
  const film = filmToCheck(project, fw, opts.film, log);
  const sceneRel = film.scene ? relative(project, film.scene) : null;
  const head = film.scene ? await loadSceneMeta(project, film.scene).catch(() => null) : null;
  log(`untell check  ${film.id}${head ? ` \u00b7 ${head.system} \u00b7 ${head.seconds} s \u00b7 ${head.width} \u00d7 ${head.height}` : ""}`);
  const kitNote = kitMismatch(project, fw);
  if (kitNote) log(`  ${kitNote}`);

  // 1. Lint: the tells in the source, before anything renders.
  const dirs = filmsFolders(project);
  if (dirs.length) {
    const lr = lintPaths(lintFiles(dirs.map((d) => join(project, d))), project);
    for (const r of lr.results) for (const f of r.findings) report.findings.push({ check: `lint/${f.rule}`, severity: f.severity, message: f.message, fix: f.fix, file: r.file, line: f.line });
    log(`  lint     ${plural(lr.errors, "error")} \u00b7 ${plural(lr.warnings, "warning")} in ${plural(lr.files, "file")}`);
    step("lint", lr.errors === 0);
  } else { log("  lint     no films folder here, so nothing to lint"); step("lint", true, "no films folder"); }

  // The sheet shows the render: the one after --sheet, else the one after --render, else the recording.
  let video: string | null = typeof opts.sheet === "string" ? resolve(project, opts.sheet) : opts.sheet && opts.render ? resolve(project, opts.render) : null;
  const renderArg = opts.render ? resolve(project, opts.render) : video;
  if (renderArg && !existsSync(renderArg)) throw new UsageError(`${relative(project, renderArg)} does not exist. Render the film first (untell render <film>), then give the path of the video file.`, "check");
  const detect = !opts.noDetect && !opts.skipRecord;
  let recording: string | null = null;
  const capture = join(project, ".untell", "lab", "out", "detector", film.id);
  let warnings: string[] = [];
  if (fw === "hyperframes") {
    zeroCredits(project);
    // The page must be built from the film, and from its last edit: untell check builds it when it is not.
    const page = join(project, "index.html");
    const newest = film.scene ? Math.max(statSync(film.scene).mtimeMs, newestIn(join(project, KIT_DIR.hyperframes))) : 0;
    if (film.scene && (builtScene(project) !== film.scene || !existsSync(page) || newest > statSync(page).mtimeMs)) {
      log(`  build    untell build ${relative(project, film.scene)} (the page was not built from this film, or the film or the kit changed)`);
      await buildHf(project, film.scene, (s) => {
        const m = s.match(/^warning from the film: ([\s\S]*)$/);
        if (m) { if (!filmSaid.includes(m[1]!)) filmSaid.push(m[1]!); } else if (/^warning/.test(s)) log(`  ${s}`);
      });
    }
    // 2. HyperFrames' own check, as JSON: every finding it counts, each declarable like any other.
    const hf = hyperframesCommand(project, opts.hyperframes);
    // CI=1: with no terminal, hyperframes check starts a detached "warm" server (warmCheck.js, with a headless Chrome)
    // that waits minutes for the next check. untell runs one check and exits, so that server outlived every check. CI
    // is the CLI's one switch that turns it off (warmCheckEligible); the check's findings and its JSON are the same.
    const r = runHyperframes(hf.cmd, ["check", "--json"], { cwd: project, encoding: "utf8", timeout: 600000, maxBuffer: 64 << 20, env: { ...process.env, CI: "1" } });
    let hfJson: HfCheckJson | null = null;
    try { hfJson = JSON.parse((r.stdout ?? "").slice((r.stdout ?? "").indexOf("{"))) as HfCheckJson; } catch { /* not JSON: an old CLI, or a crash */ }
    const sys = film.scene ? readFileSync(film.scene, "utf8").match(/export\s+const\s+system\s*=\s*["']([\w-]+)["']/)?.[1] ?? null : null;
    hfSeen = hfJson && film.scene ? hfIgnores(readFileSync(film.scene, "utf8"), relative(project, film.scene)) : [];
    // A system of the project's own takes the HyperFrames table of the built-in it came from (tokens.json own.from).
    const { fromOf } = await import("./own-system");
    const ov = hfOverrides();
    if (sys && !ov[sys]) { const base = fromOf(project, sys); if (base && ov[base]) ov[sys] = ov[base]; }
    const hfRes = hfJson ? hyperframesFindings(hfJson, { system: sys, overrides: ov, ignores: hfSeen }) : null;
    if (hfRes) {
      const en = hfRes.findings.filter((f) => f.severity === "error").length;
      log(`  hyperframes  ${en ? "failed" : "passed"} \u00b7 ${plural(en, "error")} \u00b7 ${plural(hfRes.findings.length - en, "warning")}${hfRes.folded ? ` \u00b7 ${hfRes.folded} block warning(s), listed as block-warning` : ""}${hfRes.declared.length ? ` \u00b7 ${hfRes.declared.length} declared` : ""}${hfRes.system.length ? ` \u00b7 ${hfRes.system.length} set by the system` : ""} (${hf.cmd.map((c) => (c.startsWith(project) ? relative(project, c) : c)).join(" ")} check)`);
      for (const f of hfRes.findings) report.findings.push(f);
      hfDeclared = hfRes.declared;
      hfFolded = hfRes.foldedText;
      hfUnused = hfRes.unused;
      for (const x of hfRes.system) log(`    ${x}`);
    } else {
      log(`  hyperframes  ${r.status === 0 ? "passed" : "failed"} (${hf.cmd.join(" ")} check gave no JSON)`);
      if (r.status !== 0) log(`${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").slice(-15).map((l) => "    " + l).join("\n"));
    }
    if (r.error) log(`  could not run ${hf.cmd.join(" ")}: ${r.error.message}. ${HF_FIX}`);
    step("hyperframes check", hfRes ? !hfRes.findings.some((f) => f.severity === "error") : r.status === 0);
  }
  if (!opts.skipRecord) {
    if (fw === "remotion" && !film.scene) log("untell check: no scene module in the films folder, so there is no film to record. Give one: untell check src/films/<name>.ts");
    else {
      // 3. The recorder, with the detector's capture in the same pass.
      const fp = await pageForFilm(project, fw, film.scene, "check", { hyperframes: opts.hyperframes });
      recording = join(project, ".untell", "recordings", film.id);
      const meta = await recordFilm(fp, recording, { project, log, capture: detect ? capture : undefined, media: mediaPaths(project, fw).media,
        cache: !opts.noCache, reuse: !opts.noReuse, video: !!opts.sheet && !video });
      log(meta.from === "cache" ? `  record   from the cache in ${meta.seconds.toFixed(1)} s \u00b7 nothing changed`
        : `  record   ${meta.durationInFrames} frames in ${meta.seconds.toFixed(1)} s \u00b7 ${meta.drawn} drawn \u00b7 ${meta.reused} copied${meta.fromCache ? ` \u00b7 ${meta.fromCache} from the frame cache` : ""}${meta.retried ? ` \u00b7 ${meta.retried} tried again` : ""}${fw === "remotion" ? " \u00b7 in Remotion's Player" : ""}`);
      warnings = meta.warnings;
      if (opts.sheet && !video) video = meta.video ? join(recording, "video.mp4") : null;
      if (!detect && fw === "hyperframes") coverStep(project, recording, report, step, log, () => { missingTool = true; });
    }
  } else if (opts.sheet && !video) log("  --no-record: no recording, so the sheet needs a video: untell check --sheet <video.mp4>");

  // 4. The detector on the recording and the capture.
  const declared = film.scene ? readFileSync(film.scene, "utf8").match(/export\s+const\s+system\s*=\s*["']([\w-]+)["']/)?.[1] ?? null : null;
  report.film = { id: film.id, scene: sceneRel, system: declared, render: renderArg ? relative(project, renderArg) : null, capture: null };
  let detected: import("./detector").DetectorResult | null = null;
  if (detect && recording) {
    const py = ensureDetectorPython(project, log);
    if (!py) {
      step("detector", false, "no numpy and Pillow");
      missingTool = true;
    } else {
      const p = mediaPaths(project, fw);
      const root = workTree(project, p, { id: film.id, recording, render: renderArg });
      report.film.capture = relative(project, join(capture, "capture.json"));
      // The align/* checks read the alignment pass's align.json (the kit's alignment model on the rest frames).
      const guides = film.scene ? await sceneGuides(project, film.scene, capture) : null;
      alignDecls = alignPass({ detector: capture, recording, sources: film.scene ? [film.scene] : [], guides,
        previewCmd: (at, fix) => `untell snap${sceneRel ? ` ${sceneRel}` : ""} --at ${at.toFixed(2)} --preview ${fix}` }).declarations;
      const t0 = Date.now();
      // The sound: mixed from the scene's audio nodes as the renderers play them, whenever the scene has sound (an
      // ffmpeg mix of the clips: about a second). A render adds the checks on the real file.
      let soundNote = "";
      // Is the render the scene's render? untell render writes the hash of the nodes it drew beside the file; the
      // capture holds the nodes of the scene now. Equal: the render is current, whatever the file times say (a comment
      // edit changes no node). Different: the render is stale and its sound is not checked. No facts: file times.
      const stale = renderArg ? renderStale(renderArg, join(capture, "capture.json")) : null;
      if (stale === true) report.findings.push({ check: "render/stale", severity: "error", message: "the render does not match the scene: it was drawn from another version of the film, so its sound was not checked",
        fix: `Render it again: untell render ${sceneRel ?? "<film>"}, then run untell check with the new file.` });
      try { soundNote = mixSound(capture, p, stale === false ? 0 : stale === true ? Date.now() : sourceMtime([film.scene ?? ""])); }
      catch (e) { soundNote = (e as Error).message; step("sound mix", false, soundNote); }
      // A demo (--demo, or a scene that exports demo = true): a block demo or a read-through runs the frame rules only.
      const demo = !!opts.demo || (!!film.scene && /export\s+const\s+demo\s*=\s*true/.test(readFileSync(film.scene, "utf8")));
      const res = runDetect(root, film.id, py.py, undefined, demo);
      report.verdict = res.verdict ?? null;
      report.declarations = (res.declarations ?? []).map((d) => ({ ...d }));
      const rules = detectorRules();
      report.film.system = res.system ?? declared;
      for (const f of res.findings) report.findings.push({ check: f.check, severity: f.severity, message: messageOf(f, rules), fix: f.fix, from: f.from, to: f.to, ...(f.node ? { node: f.node } : {}), measured: f.measured, limit: f.limit });
      report.skipped = { ...res.skipped };
      report.groups = res.groups ?? [];
      report.declared = res.declared ?? [];
      report.notes = res.notes ?? [];
      const crashed = Object.entries(res.skipped).filter(([, why]) => why.startsWith("crashed"));
      const e = res.findings.filter((f) => f.severity === "error").length, adv = res.findings.filter((f) => f.severity === "advice").length;
      const skippedWhy = Object.values(res.skipped).filter((why) => !/on a render|no render|crashed/.test(why));
      const whyShort = [...new Set(skippedWhy.map((why) => why.replace(/^the film (has|draws) no /, "no ").replace(/ \(.*\)$/, "")))].slice(0, 4);
      log(`  detect   ${plural(rules.length, "rule")} in ${((Date.now() - t0) / 1000).toFixed(1)} s \u00b7 sound: ${soundNote}${skippedWhy.length ? ` \u00b7 ${skippedWhy.length} did not apply: ${whyShort.join(", ")}` : ""}`);
      detected = res;
      // A crashed check fails the step: a check that did not run must not read as a pass.
      step("detector", crashed.length === 0 && e === 0, crashed.length ? `${crashed.length} check(s) crashed: ${crashed.map(([c]) => c).join(", ")}` : e ? `${e} error(s)` : undefined);
    }
  }

  // A declaration of a rule that no check has (a typo, a rule that HyperFrames or the detector does not report): listed,
  // so it does not read as a declared finding.
  if (film.scene) {
    const known = new Set([...detectorRules().map((r) => r.id), ...lintRuleIds()]);
    readFileSync(film.scene, "utf8").split("\n").forEach((l, i) => {
      const m = l.match(/\/\/\s*untell-ignore\s+([\w/*.-]+)/);
      if (!m) return;
      const rule = m[1]!.replace(/^lint\//, "");
      const ok = known.has(rule) || rule.startsWith("align") || rule.startsWith("hyperframes/") || (rule.endsWith("/*") && [...known].some((k) => k.startsWith(rule.slice(0, -1))));
      if (!ok) hfUnused.push({ check: "untell-ignore", unused: `${film.scene!.split("/").pop()}:${i + 1}: ${m[1]}`, why: "no check has this rule: untell check --rules and untell lint --rules list them" });
    });
  }
  // HyperFrames' declared findings and declarations that matched nothing, beside the detector's.
  if (hfDeclared.length) report.declared = [...(report.declared ?? []), ...hfDeclared];
  // Each declaration and its effect. HyperFrames' are matched here (the detector does not see HyperFrames' findings);
  // a lint rule's is untell lint's (it applies to its own line or the next); one that no check has matched nothing.
  {
    // The align/* declarations: the alignment pass's (the detector leaves align rules to it), in the scene's line order.
    const decls: NonNullable<CheckReport["declarations"]> = [...(report.declarations ?? []), ...alignDecls].sort((a, b) => (Number(a.where.split(":").pop()) || 0) - (Number(b.where.split(":").pop()) || 0));
    for (const h of hfSeen) {
      const d = decls.find((x) => x.where === h.where && x.rule === `hyperframes/${h.code}`);
      if (d) { d.matched = h.matched; if (h.matched) delete d.why; else d.why = "it matches no HyperFrames finding: remove it"; }
      else decls.push({ rule: `hyperframes/${h.code}`, nodes: h.nodes, reason: h.reason, where: h.where, scope: h.nodes.length ? "named nodes" : "the whole film", matched: h.matched, ...(h.matched ? {} : { why: "it matches no HyperFrames finding: remove it" }) });
    }
    const lint = new Set(lintRuleIds());
    for (const d of decls) if (lint.has(d.rule.replace(/^lint\//, ""))) { d.lint = true; delete d.why; }
    for (const u of hfUnused.filter((x) => /no check has this rule/.test(x.why))) {
      const where = u.unused.match(/^(.+?:\d+)/)?.[1];
      const d = decls.find((x) => x.where === where);
      if (d) d.why = u.why;
    }
    // A declaration that matched in the other pass (the picture check, or the check of the render) is not unused: a
    // rule that fires in one pass is quiet in the other. The last count of each pass is kept per film.
    // One count per declaration: the detector's effect line said "suppresses 0" for a HyperFrames rule that untell
    // matched here (before: report.json said both "matched 2" and "suppresses 0").
    for (const d of decls) oneCount(d);
    // A film that states it is silent (export const silent = "<reason>"): listed with the declarations. untell lint
    // checks it (scene/silent: a reason, and no sound block beside it); tell/silent takes it as planned silence.
    const said = film.scene ? silentStatement(readFileSync(film.scene, "utf8")) : null;
    if (said) decls.unshift({ rule: "silent", nodes: [], reason: said.reason, where: `${basename(film.scene!)}:${said.line}`, scope: "the whole film", matched: 0, statement: true });
    if (decls.length) {
      const pass = renderArg ? "render" : "picture", other = renderArg ? "picture" : "render";
      const rec = join(project, ".untell", "check", `declared-${film.id}.json`);
      let last: Record<string, Record<string, number>> = {};
      try { last = JSON.parse(readFileSync(rec, "utf8")); } catch { /* no record yet */ }
      last = passEffects(decls, last, pass);
      try { mkdirSync(dirname(rec), { recursive: true }); writeFileSync(rec, JSON.stringify(last) + "\n"); } catch { /* a record is a help, not a step */ }
      void other;
      report.declarations = decls;
    }
  }
  if (hfUnused.length) report.notes = [...(report.notes ?? []), ...hfUnused];

  // A render with no facts beside it that the sound check found older than the scene: the verdict must say so.
  if (renderArg && !report.findings.some((f) => f.check === "render/stale") && Object.values(report.skipped ?? {}).some((w) => /older than the film's source/.test(w)))
    report.findings.push({ check: "render/stale", severity: "error", message: "the render is older than the scene, so its sound was not checked",
      fix: `Render it again: untell render ${sceneRel ?? "<film>"}, then run untell check with the new file.` });

  // The page's warnings: a block that shrank a title, a wrap, a label left out. The detector's block-warning check
  // reports them on their nodes and times; without it (the detector did not run, or its check was skipped), each is a
  // warning here.
  const detectorBlocks = report.skipped && !("block-warning" in report.skipped) && detectorRules().some((r) => r.id === "block-warning");
  const blocks = detectorBlocks ? [] : blockFindings(warnings);
  for (const f of blocks) report.findings.push(f);
  // A block's warning that HyperFrames' check printed and untell folded: when no block-warning finding carries it (the
  // detector did not see it, or reports it under another text), it is listed as advice, so a counted warning is never
  // hidden. Before, the hyperframes line said "1 block warning(s) reported as block-warning" and no finding listed it.
  for (const m of hfFolded) {
    const head = m.slice(0, 60);
    if (!report.findings.some((f) => (f.check === "block-warning" || f.check.startsWith("block/")) && (f.message ?? "").includes(head.slice(head.indexOf(":") + 1).trim().slice(0, 40))))
      report.findings.push({ check: "block-warning", severity: "advice", message: m, fix: "Read the block's warning: give the block the box, the words or the prop it names." });
  }
  const other = warnings.filter((w) => !blockFindings([w]).length);
  for (const w of other) log(`  page     ${w.slice(0, 300)}`);
  // The film's own warnings at load and build: one line each, when no finding carries the same text.
  for (const m of filmSaid) if (!warningCovered(m, report.findings)) log(`  film     ${m.slice(0, 300)}`);

  report.errors = report.findings.filter((f) => f.severity === "error").length;
  report.advice = report.findings.filter((f) => f.severity === "advice").length;
  report.warnings = report.findings.length - report.errors - report.advice;
  const outDir = join(project, ".untell", "check");
  mkdirSync(outDir, { recursive: true });
  const reportPath = join(outDir, "report.json");
  const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 1) + "\n");
  report.ok = report.ok && report.steps.every((s) => s.ok);
  save();

  // 5. The review sheet, with the findings on it.
  if (opts.sheet && video) {
    try {
      // With align findings, the sheet draws the scene's guides and each miss on its frames.
      const alignJson = join(capture, "align.json");
      const withAlign = existsSync(alignJson) && (report.findings.some((f) => f.check.startsWith("align/")) || !!(JSON.parse(readFileSync(alignJson, "utf8")) as { guides?: unknown }).guides);
      const capJson = join(capture, "capture.json");
      const sh = sheet(project, video, { findings: reportPath, quiet: true, ...(withAlign ? { align: alignJson } : {}), ...(existsSync(capJson) ? { capture: capJson } : {}) });
      report.sheet = { image: sh.sheet, json: sh.json, phone: sh.phone };
      step("sheet", true);

    } catch (e) {
      if (!(e instanceof MissingToolError)) throw e;
      log(e.message);
      step("sheet", false, "a tool is missing");
      missingTool = true;
    }
  } else if (opts.sheet && !video) { log("  no video for the sheet. Give the render: untell check --sheet <render.mp4>"); step("sheet", false, "no video"); }
  report.ok = report.ok && report.steps.every((s) => s.ok);
  save();
  printScreen(report, detected, { log: out, steps: steps.take(), S, sceneRel, renderArg: renderArg ? relative(project, renderArg) : null, sheet: report.sheet ? relative(project, report.sheet.image) : null, phone: report.sheet?.phone ? relative(project, report.sheet.phone) : null, reportPath: relative(project, reportPath) });
  if (opts.json) console.log(JSON.stringify(report, null, 1));
  if (report.ok) return 0;
  // Exit 2 when the only failures are tools that are not installed: the film itself may be fine.
  return missingTool && report.findings.every((f) => f.severity !== "error") && report.steps.filter((s) => !s.ok).every((s) => MISSING.has(s.note ?? "")) ? 2 : 1;
}

/** The scene's guides (withGuides) in the recorded frame, as the alignment model reads them, or null. */
async function sceneGuides(project: string, scene: string, capture: string) {
  try {
    const cap = JSON.parse(readFileSync(join(capture, "capture.json"), "utf8")) as { width: number; height: number; ctx?: { safe?: { left: number; right: number; top: number; bottom: number } } };
    const { sceneExports } = await import("./build");
    const m = await sceneExports(project, scene);
    return guidesOf(m.scene, { width: cap.width, height: cap.height, safe: cap.ctx?.safe ?? null });
  } catch { return null; }
}

const MISSING = new Set(["a tool is missing", "no numpy and Pillow"]);

/** True for a scene module: a file that exports scene and system. */
export const isSceneModule = (text: string) => /export\s+(const|function|async function)\s+scene\b/.test(text) && /export\s+const\s+system\b/.test(text);

/** The scene module that the HyperFrames page was built from (untell build writes it in a comment), or null. */
export function builtScene(project: string): string | null {
  const page = join(project, "index.html");
  if (!existsSync(page)) return null;
  const m = readFileSync(page, "utf8").match(/Generated by untell build from (.+?)\. untell build/);
  return m ? join(project, m[1]!) : null;
}

/**
 * The film to check. HyperFrames: the scene that index.html was built from. Remotion: --film, else the one
 * scene module in the films folder, else the newest one (the log says which, and how to choose).
 */
export function filmToCheck(project: string, fw: "remotion" | "hyperframes", filmArg: string | undefined, log: (s: string) => void): { id: string; scene: string | null } {
  if (filmArg) {
    const f = resolve(project, filmArg);
    if (!existsSync(f)) throw new UsageError(`--film ${filmArg} does not exist. Give the scene module of the film, such as ${fw === "remotion" ? "src/films" : "films"}/<name>.ts.`, "check");
    if (!isSceneModule(readFileSync(f, "utf8"))) throw new UsageError(`--film ${filmArg} is not a scene module: it must export scene and system.`, "check");
    return { id: basename(f).replace(/\.[^.]+$/, ""), scene: f };
  }
  if (fw === "hyperframes") {
    const s = builtScene(project);
    return { id: s ? basename(s).replace(/\.[^.]+$/, "") : basename(project), scene: s };
  }
  const scenes = filmsFolders(project).flatMap((d) => lintFiles([join(project, d)])).filter((f) => /\.tsx?$/.test(f) && isSceneModule(readFileSync(f, "utf8")));
  if (!scenes.length) return { id: basename(project), scene: null };
  const newest = scenes.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]!;
  if (scenes.length > 1) log(`untell check records ${relative(project, newest)}, the scene module you changed last. Give --film <scene.ts> to choose another.`);
  return { id: basename(newest).replace(/\.[^.]+$/, ""), scene: newest };
}

/** The newest video in out/ (where Remotion renders by default), or null. */
export function newestRender(project: string): string | null {
  const dir = join(project, "out");
  if (!existsSync(dir)) return null;
  const vids = readdirSync(dir).filter((n) => /\.(mp4|mov|webm)$/i.test(n) && !/\.sheet\./.test(n)).map((n) => join(dir, n));
  return vids.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

/** What `hyperframes check --json` prints: sections (lint, runtime, layout, motion, contrast, craft, audio) with findings. */
export type HfCheckJson = Record<string, unknown>;
type HfFinding = { code?: string; severity?: string; message?: string; time?: number; selector?: string; dataAttributes?: Record<string, string> };
/** A declaration's effect line says the count it matched (the detector wrote 0 for a rule untell matched later). */
export function oneCount(d: { matched: number; effect?: string }) {
  if (d.effect) d.effect = d.effect.replace(/suppresses \d+ findings?/, `suppresses ${d.matched} finding${d.matched === 1 ? "" : "s"}`);
  return d;
}

/** The node a HyperFrames selector names: `[data-el="x"]` or `#x` (the first one), else undefined. Pure. */
export function nodeOfSelector(sel: string | undefined): string | undefined {
  if (!sel) return undefined;
  return sel.match(/\[data-el=["']?([\w-]+)["']?\]/)?.[1] ?? sel.match(/#([\w-]+)/)?.[1];
}

/** A declared id covers a HyperFrames finding: its node is the id or a part of it (id-...), an id ending in * covers
 *  the ids that start with it, and an id the finding's selector names (#id, [data-el="id"], .id) covers it. Pure. */
export function hfNodeMatch(n: string, node: string | undefined, selector?: string): boolean {
  if (n.endsWith("*")) return !!node && node.startsWith(n.slice(0, -1));
  if (node && (node === n || node.startsWith(`${n}-`))) return true;
  return !!selector && new RegExp(`(^|[^\\w-])${n.replace(/[-]/g, "\\-")}($|[^\\w-])`).test(selector);
}

/** A declaration of a HyperFrames finding in the scene: `// untell-ignore hyperframes/<code> [node]: <reason>`. */
export type HfIgnore = { code: string; nodes: string[]; reason: string; where: string; matched: number };

/** The scene's declarations of HyperFrames findings. Pure. */
export function hfIgnores(src: string, file: string): HfIgnore[] {
  const out: HfIgnore[] = [];
  src.split("\n").forEach((l, i) => {
    const m = l.match(/\/\/\s*untell-ignore\s+hyperframes\/([\w*-]+)\s*([^:\n]*):\s*(.+)$/);
    if (m) out.push({ code: m[1]!, nodes: m[2]!.trim().split(/[\s,]+/).filter(Boolean), reason: m[3]!.trim(), where: `${file.split("/").pop()}:${i + 1}`, matched: 0 });
  });
  return out;
}

/** The per-system table of HyperFrames findings that a system's own direction overrides (the checks' table):
 *  { "<system>": { "<code>": { "severity": "off" | "advice", "why": "..." } } }. Empty when the pack ships none. */
export function hfOverrides(): Record<string, Record<string, { severity: string; why?: string }>> {
  try { return JSON.parse(readFileSync(join(registryDir(), "tools", "inspect", "hf_overrides.json"), "utf8")); } catch { return {}; }
}

/**
 * HyperFrames' findings as untell findings: every error and warning of every section, as hyperframes/<code>. A console
 * warning that a block printed is folded (untell reports it as block-warning); a finding the system's direction
 * overrides is set to advice or left out, with one line that says so; a declared finding leaves the findings with its
 * reason. Pure.
 */
export function hyperframesFindings(j: HfCheckJson, o: { system: string | null; overrides: Record<string, Record<string, { severity: string; why?: string }>>; ignores: HfIgnore[] }) {
  const findings: CheckFinding[] = [], declared: DeclaredFinding[] = [], system: string[] = [];
  let folded = 0;
  const foldedText: string[] = [];
  const table = (o.system && o.overrides[o.system]) || {};
  for (const [section, v] of Object.entries(j)) {
    const fs = (v as { findings?: HfFinding[] } | null)?.findings;
    if (!Array.isArray(fs)) continue;
    for (const f of fs) {
      if (f.severity !== "error" && f.severity !== "warning") continue;
      const code = f.code ?? section;
      if (code === "console_warning" && /^[a-z]\w*( [^:\s]+)?: /.test(f.message ?? "")) { folded++; foldedText.push((f.message ?? "").slice(0, 300)); continue; }
      let severity = f.severity as "error" | "warning" | "advice";
      const ov = table[code];
      if (ov?.severity === "off") { system.push(`${code}: not a fault in ${o.system} (${ov.why ?? "the system's direction asks for it"})`); continue; }
      if (ov?.severity === "advice") { severity = "advice"; system.push(`${code}: advice in ${o.system} (${ov.why ?? "the system's direction"})`); }
      // The element: its data-el label, else the one its selector names ([data-el="x"], #x); the selector stays in the
      // finding, so the report says which element HyperFrames meant (before: the selector was dropped).
      const node = f.dataAttributes?.["data-el"] ?? nodeOfSelector(f.selector);
      const t = typeof f.time === "number" ? f.time : undefined;
      const finding: CheckFinding = { check: `hyperframes/${code}`, severity, message: (f.message ?? code).slice(0, 300), ...(node ? { node } : {}), ...(f.selector ? { selector: f.selector } : {}), ...(t !== undefined ? { from: t, to: t } : {}),
        fix: `${f.message ?? code} (HyperFrames' own ${section} check)` };
      const d = o.ignores.find((x) => (x.code === code || x.code === "*") && (!x.nodes.length || x.nodes.some((n) => hfNodeMatch(n, node, f.selector))));
      if (d) { d.matched++; declared.push({ check: finding.check, severity: severity as "error", from: t ?? 0, to: t ?? 0, node, measured: null, limit: null, fix: finding.fix!, declared: { reason: d.reason, where: d.where, scope: d.nodes.length ? "named nodes" : "the whole film" } }); continue; }
      findings.push(finding);
    }
  }
  const unused = o.ignores.filter((x) => !x.matched).map((x) => ({ check: "untell-ignore", unused: `${x.where}: hyperframes/${x.code} ${x.nodes.join(" ")}`.trim(), why: "it matches no HyperFrames finding: remove it" }));
  return { findings, declared, unused, system, folded, foldedText };
}

/**
 * Whether a render was drawn from another version of the scene: true (stale), false (current), or null when the render
 * has no facts beside it (<file>.untell.json, which untell render writes) or there is no capture to compare with.
 */
export function renderStale(render: string, captureFile: string): boolean | null {
  const facts = `${render}.untell.json`;
  if (!existsSync(facts) || !existsSync(captureFile)) return null;
  try {
    const want = (JSON.parse(readFileSync(facts, "utf8")) as { nodes?: string }).nodes;
    const cap = JSON.parse(readFileSync(captureFile, "utf8")) as { nodes?: unknown };
    if (!want || !cap.nodes) return null;
    return sha(JSON.stringify(cap.nodes)) !== want;
  } catch { return null; }
}

/** The newest change to a source file under `dir` (the kit), in ms, or 0. */
export function newestIn(dir: string): number {
  let t = 0;
  const walk = (d: string) => { if (!existsSync(d)) return; for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { if (e.name !== "docs" && e.name !== "fonts") walk(p); } else if (/\.(ts|tsx|json)$/.test(e.name)) t = Math.max(t, statSync(p).mtimeMs); } };
  walk(dir);
  return t;
}

/** The newest change to a film file, in ms, or 0. */
function newestFilmEdit(project: string): number {
  let t = 0;
  for (const d of filmsFolders(project)) for (const f of lintFiles([join(project, d)])) t = Math.max(t, statSync(f).mtimeMs);
  return t;
}

/**
 * The first screen (out/readme/check-screen.md): the verdict, the numbered causes (errors first, in time order), every
 * finding on one line with what it measured, the declared findings, the checks that did not run, the next command
 * and the report's path.
 */
export function printScreen(report: CheckReport, res: import("./detector").DetectorResult | null, o: { log: (s: string) => void; steps?: string[]; S: ReturnType<typeof screenStyle>; sceneRel: string | null; renderArg: string | null; sheet: string | null; phone?: string | null; reportPath: string }) {
  const { log, S } = o;
  const film = o.sceneRel ?? "";
  const cmd = (c: string) => `untell ${c}${film ? ` ${film}` : ""}`;
  // The causes: the source's own (lint, HyperFrames, a block's warning without the detector) first, then the detector's.
  type Cause = { severity: string; title: string; from?: number; to?: number; count: number; nodes: string[]; fix: string; check: string };
  const causes: Cause[] = [];
  const bySev = { error: 0, warning: 1, advice: 2 } as Record<string, number>;
  for (const f of report.findings.filter((x) => x.from === undefined || x.check.startsWith("hyperframes"))) {
    const k = causes.find((c) => c.check === f.check && c.fix === (f.fix ?? ""));
    if (k) { k.count++; if (f.file && !k.nodes.includes(`${f.file}:${f.line}`)) k.nodes.push(`${f.file}:${f.line}`); continue; }
    const hf = f.check.startsWith("hyperframes");
    // A block's warning shows its text one time, under every finding: the cause names the block that said it.
    const block = f.check === "block-warning" ? f.message.match(/^([a-z]\w*(?: [^:\s]+)?): /)?.[1] : undefined;
    causes.push({ severity: f.severity, title: f.check.startsWith("lint/") ? `a tell in the source (${f.check})` : hf ? `HyperFrames' own check: ${f.check.replace(/^hyperframes\/?/, "") || "a finding"}` : f.check === "block-warning" ? "what a block said while it built" : f.message.slice(0, 70),
      count: 1, nodes: f.file ? [`${f.file}:${f.line}`] : f.node ? [f.node] : hf ? [f.message.slice(0, 160)] : block ? [block] : [], fix: f.fix ?? "", check: f.check });
  }
  for (const g of res?.groups ?? []) causes.push({ severity: g.severity, title: g.cause.replace(/^\d+ findings share one cause: /, "").replace(/ \([\d.]+-[\d.]+ s\)$/, ""), from: g.from, to: g.to,
    count: g.count, nodes: g.nodes, fix: g.fix, check: g.check });
  causes.sort((a, b) => (bySev[a.severity] ?? 3) - (bySev[b.severity] ?? 3) || (a.from ?? -1) - (b.from ?? -1));
  const e = report.errors, w = report.warnings;
  log(S.bold(verdictLine(report, res?.verdict ?? report.verdict ?? null, S)) + (causes.length ? S.dim(` \u00b7 ${plural(causes.length, "cause")}, one fix each`) : ""));
  if (causes.length) log("");
  causes.forEach((c, k) => {
    log(`  ${String(k + 1).padStart(2)}  ${S.mark(c.severity)} ${S.bold(c.title.padEnd(38))} ${(c.from !== undefined ? S.span(c.from, c.to!) : "").padEnd(13)}${c.count > 1 ? ` ${c.count} findings, one fix` : ""}`.trimEnd());
    if (c.nodes.length) log(`       ${S.dim(c.nodes.slice(0, 6).join(" \u00b7 "))}`);
    if (c.fix) log(`       ${S.dim("fix")}  ${c.fix}`);
  });
  if (report.findings.length) log(`\n  ${S.dim("every finding")}`);
  for (const f of report.findings) {
    const at = f.from !== undefined ? S.span(f.from, f.to ?? f.from) : f.file ? `${f.file}:${f.line}` : "";
    log(`  ${S.mark(f.severity)} ${f.check.padEnd(22)} ${at.padEnd(13)} ${f.node ?? f.selector ?? ""}${f.node && f.selector ? ` (${f.selector})` : ""}`.trimEnd());
    log(`      ${S.dim(f.measured !== undefined ? `measured ${JSON.stringify(f.measured)} \u00b7 limit ${JSON.stringify(f.limit)}` : f.message)}`);
  }
  for (const f of report.declared ?? []) log(`  = ${f.check.padEnd(22)} ${S.span(f.from, f.to).padEnd(13)} ${f.node ?? ""}  ${S.dim(`declared at ${f.declared.where} (${f.declared.scope}): ${f.declared.reason}`)}`);
  const notes = (report.notes ?? []) as Record<string, unknown>[];
  // Each declaration and its effect: what it matched, or that it matched nothing (then remove it or fix its rule).
  const decls = report.declarations ?? [];
  if (decls.length) log(`\n  ${S.dim(decls.some((d) => d.statement) ? "declarations (// untell-ignore, export const silent)" : "declarations (// untell-ignore)")}`);
  for (const d of decls) {
    const what = `${d.rule}${d.nodes.length ? ` ${d.nodes.join(",")}` : ""}`;
    const effect = d.statement ? (d.reason ? `the film is silent on purpose: ${d.reason}` : S.yellow("the film states it is silent, with no reason: give one (untell lint, scene/silent)"))
      : d.lint ? "a lint rule: untell lint applies it to its own line or the next" : d.matched ? `matched ${plural(d.matched, "finding")}` : S.yellow(d.why?.startsWith("matched nothing") ? d.why : `matched nothing: ${d.why ?? "remove it, or fix its rule or node"}`);
    log(`  ${d.matched || d.lint || (d.statement && d.reason) ? "=" : "-"} ${what.padEnd(30)} ${effect}  ${S.dim(d.where)}`);
  }
  const said = new Set(decls.map((d) => d.where));
  for (const n of notes.filter((x) => x.unused && !said.has(String(x.unused).match(/^(.+?:\d+)/)?.[1] ?? ""))) log(`  - untell-ignore ${n.unused}: ${n.why ?? "it matches no finding"}`);
  // The steps of the check (the film, lint, record, detect), under the findings: the verdict and the causes come first.
  if (o.steps?.length) { log(""); for (const l of o.steps) log(l); }
  // Not run: one line, grouped by reason. A check that needs the render names the command.
  const byWhy = new Map<string, string[]>();
  for (const [c, why] of Object.entries(report.skipped ?? {})) byWhy.set(why, [...(byWhy.get(why) ?? []), c]);
  const parts = [...byWhy].map(([why, cs]) => `${cs.join(", ")} (${/no render at |on a render/.test(why) ? `on the render: ${cmd("render")}` : why.replace(/^the film (has|draws) no /, "no ").replace(/ \((.+)\)$/, ", $1")})`);
  // A clean film keeps these to the count on the detect line; a film with findings lists them.
  const clean = report.ok && !report.findings.length;
  const needRender = [...byWhy].filter(([why]) => /no render at |on a render/.test(why)).length > 0;
  if (parts.length && (!clean || needRender)) log(`\n  ${S.dim(`- not run: ${parts.join(" \u00b7 ")}`)}`);
  // Not measured: what a check could not measure on this film. A clean film shows the count; a film with findings the checks.
  const measured = notes.filter((x) => x.notMeasured);
  if (measured.length) log(`  ${S.dim(`- not measured: ${clean ? plural(measured.length, "thing") : [...new Set(measured.map((x) => String(x.check)))].join(", ")} (untell check --not-measured lists each with its reason)`)}`);
  if (o.sheet) log(`\nreview sheet: ${o.sheet}\n        open it and read it: each row is a strip of time with the frames, motion, sound, cuts and findings`);
  if (o.phone) log(`phone sheet: ${o.phone}\n        open it at 100 %: a frame from each shot at the size a phone shows it`);
  // The last lines: what to do now, as a command.
  const first = causes[0];
  if (!report.ok && first) log(`\nnext    fix cause 1, then run: ${cmd("check")}\n        untell check --explain ${first.check}  shows what it measures and why`);
  else if (!report.ok) log(`\nnext    a step failed: read its line above, fix it, then run: ${cmd("check")}`);
  else if ((report.verdict?.unusedDeclarations ?? 0) > 0) log(`\nnext    remove each untell-ignore above that matches no finding (it is stale, or names the wrong rule or node), then run: ${cmd("check")}`);
  else if (w && !o.renderArg) log(`\nnext    the film passes. Fix a warning if it is real, or declare it in the scene: // untell-ignore <rule> [node]: <why>\n        When the picture is right: ${cmd("render")}, then ${cmd("check")} --render <final file> --sheet`);
  else if (!o.renderArg) log(`\nnext    ${cmd("render")} (it renders and masters the final file), then ${cmd("check")} --render <final file> --sheet`);
  else log(`\nnext    ${o.sheet ? "open the sheet and read it. " : ""}For a film with sound, run: untell listen mix ${o.renderArg}`);
  log(`report  ${o.reportPath}`);
}

/**
 * A declaration's effect across the two passes of a film (the picture check, and the check of a render): it records
 * this pass's counts in `last` and says, for one that matched nothing here, whether the other pass matched it. Only a
 * declaration that matched in neither pass is told to go. Changes `decls`; returns the new record.
 */
export function passEffects(decls: NonNullable<CheckReport["declarations"]>, last: Record<string, Record<string, number>>, pass: "picture" | "render") {
  const other = pass === "render" ? "picture" : "render";
  const key = (d: { where: string; rule: string }) => `${d.where} ${d.rule}`;
  const out = { ...last, [pass]: Object.fromEntries(decls.map((d) => [key(d), d.matched])) };
  for (const d of decls) {
    if (d.matched || d.lint || d.statement) continue;
    const there = last[other]?.[key(d)];
    if (there) d.why = `matched nothing in this pass; it matched ${there} in the ${other} check, so keep it`;
    else if (there === undefined && d.why) d.why = d.why.replace(/remove it\b/, `remove it if the ${other} check does not match it either`);
  }
  return out;
}

/**
 * The verdict line. The detector's own line (failed / passed with N warnings / passed, with "(a demo: frame rules
 * only)" for a demo) when the detector ran and the source found nothing more; else the same three states over every
 * finding (lint, HyperFrames, the detector), with the detector's notes on the render and on a demo kept.
 */
export function verdictLine(report: CheckReport, v: { state: string; errors: number; warnings: number; advice: number; unusedDeclarations?: number; renderStale: boolean; line: string } | null, S: ReturnType<typeof screenStyle>): string {
  const e = report.errors, w = report.warnings, a = report.advice ?? 0;
  // An untell-ignore that matches no finding: the film is not done, so the verdict is at least "passed with warnings".
  const u = v?.unusedDeclarations ?? 0;
  let line: string;
  if (v && v.errors === e && v.warnings === w && (v.advice ?? 0) === a) line = v.line;
  else {
    const unused = u ? `${u} untell-ignore${u > 1 ? "s" : ""} that match${u === 1 ? "es" : ""} no finding` : "";
    line = e ? `failed: ${plural(e, "error")}${w ? `, ${plural(w, "warning")}` : ""}${u ? `, ${unused}` : ""}`
      : w || u ? `passed with ${[w ? plural(w, "warning") : "", unused].filter(Boolean).join(" and ")}: ${w ? "fix or declare each warning" : ""}${w && u ? " and " : ""}${u ? "remove each untell-ignore that matches no finding" : ""} before delivery`
      : report.ok ? "passed" : "failed: a step did not finish";
    if (a) line += ` (${a} advice)`;
    if (v?.renderStale) line += ". The render does not match the scene: sound not checked";
    if (v && / \(a demo: frame rules only\)$/.test(v.line)) line += " (a demo: frame rules only)";
  }
  return e || !report.ok ? S.red(`x ${line}`) : w || u ? S.yellow(`! ${line}`) : S.green(line);
}

/** The cover check alone (untell check --no-detect): type behind a cut-out must still read. */
function coverStep(project: string, dir: string, report: CheckReport, step: (n: string, ok: boolean, note?: string) => void, log: (s: string) => void, onMissing: () => void) {
  const data = JSON.parse(readFileSync(join(dir, "elements.json"), "utf8")) as { frames: { kind?: string; cutout?: boolean }[][] };
  const withCutout = data.frames.filter((els) => els.some((e) => e.kind === "image" && e.cutout)).length;
  if (!withCutout) {
    log(`cover check: no cut-out on screen in ${data.frames.length} frames, so no type is behind a subject. 0 error(s).`);
    step("cover check", true, "no cut-out");
  } else {
    const py = analysisPython(project);
    if (!py) {
      log(`cover check: ${withCutout} frame(s) show a cut-out, but no Python here has numpy and Pillow. Run: untell media setup`);
      step("cover check", false, "no numpy and Pillow");
      onMissing();
    } else {
      // The detector's cover check, run in the work tree: it reads the media through the tree's links.
      const root = workTree(project, mediaPaths(project));
      const c = spawnSync(py.py, [join(registryDir(), "tools", "inspect", "cover.py"), dir], { cwd: root, encoding: "utf8", env: workEnv(root) });
      log((c.stdout + c.stderr).trimEnd());
      try {
        const cov = JSON.parse(readFileSync(join(dir, "cover.json"), "utf8")) as { errors: { id: string; text: string; rule: string; from: number; to: number; detail: string }[] };
        for (const e of cov.errors) report.findings.push({ check: "cover", severity: "error", message: `${e.id} "${e.text}": ${e.rule} ${e.detail}`, fix: "Move the text off the subject, or plan it with placeBehind.", from: e.from, to: e.to });
      } catch { /* cover.py printed its own error */ }
      step("cover check", c.status === 0);
    }
  }
}

/** `untell check --not-measured`: what the last check could not measure, each with its check and its reason. */
export function printNotMeasured(projectArg: string): number {
  const p = join(resolve(projectArg), ".untell", "check", "report.json");
  if (!existsSync(p)) { console.log("No check has run here yet. Run: untell check <film>"); return 0; }
  const r = JSON.parse(readFileSync(p, "utf8")) as CheckReport;
  const notes = ((r.notes ?? []) as Record<string, unknown>[]).filter((x) => x.notMeasured);
  console.log(`untell check --not-measured  ${r.film?.scene ?? r.film?.id ?? ""} (the last check)`);
  if (!notes.length) { console.log("Every check measured what it reads."); return 0; }
  for (const n of notes) console.log(`  - ${String(n.check).padEnd(22)} ${String(n.notMeasured)}: ${String(n.why ?? "no reason given")}`);
  return 0;
}
