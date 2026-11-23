#!/usr/bin/env node
// The untell command. It only reads the arguments and calls the command modules.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hooksCommand, parseAgents } from "./agents";
import type { Framework } from "./detect";
import { doctor } from "./doctor";
import { MissingToolError, UsageError } from "./errors";
import { HELP, helpFor } from "./help";
import { registryDir } from "./kit";
import { HF_ENV } from "./env";
import { explainRule, formatRules, lintCommand, lintHook, tellsDoc } from "./lint";

// Privacy: every program untell starts (the HyperFrames CLI, a package install, the recorder) inherits these, so no
// run sends usage reports. Each run of the HyperFrames CLI also sets them itself (runHyperframes in env.ts).
Object.assign(process.env, HF_ENV);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => { const i = args.indexOf(name); const v = i >= 0 ? args[i + 1] : undefined; return v !== undefined && !v.startsWith("--") ? v : undefined; };
// Flags that take a value. Their values are not paths or command names.
const valued = new Set(["--framework", "--agent", "--hyperframes", "--cwd", "--as", "--kind", "--source", "--licence", "--license", "--role", "--system", "--height",
  "--explain", "--scope", "--max-warnings", "--out", "--step", "--beats", "--findings", "--cols", "--film", "--render", "--lufs", "--peak", "--nodes",
  "--at", "--scene", "--via", "--new", "--align", "--theme", "--drop", "--capture", "--from"]);
// --preview, --apply and --unapply take hunk ids separated by commas or spaces (or both); --preview alone means all.
const ID_FLAGS = ["--preview", "--apply", "--unapply"];
const idsAfter = (k: string) => {
  const i = args.indexOf(k); if (i < 0) return undefined;
  const vals: string[] = [];
  for (let j = i + 1; j < args.length && !args[j]!.startsWith("--") && !/\.(tsx?|jsx?)$/.test(args[j]!); j++) vals.push(args[j]!);
  return vals.join(",").split(/[,\s]+/).filter(Boolean).join(",");
};
const previewArg = args.includes("--preview") ? idsAfter("--preview") || "all" : undefined;
/** True when args[i] is an id after --preview, --apply or --unapply. */
const isIdWord = (i: number) => ID_FLAGS.some((k) => { const p = args.indexOf(k); return p >= 0 && i > p && args.slice(p + 1, i + 1).every((x) => !x.startsWith("--") && !/\.(tsx?|jsx?)$/.test(x)); });
// `check --sheet` takes a video only when one follows it.
const sheetArg = (() => { const i = args.indexOf("--sheet"); const v = i >= 0 ? args[i + 1] : undefined; return v && !v.startsWith("--") && /\.(mp4|mov|webm|m4v|mkv)$/i.test(v) ? v : undefined; })();
// `listen setup --extras` takes a list when a word follows it (stems, tags or all; parseExtras checks it). Alone it means all.
const extrasArg = (() => { const i = args.indexOf("--extras"); if (i < 0) return undefined; const v = args[i + 1]; return v && !v.startsWith("--") ? v : true; })();
const positional = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1] ?? "") && !(a === sheetArg && args[i - 1] === "--sheet")
  && !(typeof extrasArg === "string" && a === extrasArg && args[i - 1] === "--extras")
  && !isIdWord(i));
const [cmd, ...rest] = positional;
const cwd = resolve(opt("--cwd") ?? process.cwd());
const need = (name: string, command: string) => { if (args.includes(name) && opt(name) === undefined) throw new UsageError(`${name} needs a value.`, command); };

function versionJson() {
  const pkg = JSON.parse(readFileSync(join(registryDir(), "..", "package.json"), "utf8")) as { version: string };
  let stamp: Record<string, unknown> = {};
  try { stamp = JSON.parse(readFileSync(join(registryDir(), "stamp.json"), "utf8")) as Record<string, unknown>; } catch { /* no stamp */ }
  const { fallbacks: _f, ...counts } = stamp;
  const { version: _v, ...rest } = counts;
  return { version: 1, untell: pkg.version, ...rest };
}

function version(): string {
  const pkg = JSON.parse(readFileSync(join(registryDir(), "..", "package.json"), "utf8")) as { version: string };
  let packed = "";
  try { packed = ` (kit packed ${(JSON.parse(readFileSync(join(registryDir(), "stamp.json"), "utf8")) as { packedAt: string }).packedAt})`; } catch { /* no stamp */ }
  return `untell ${pkg.version}${packed}`;
}

/** The edit distance of two words, for "Did you mean". */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]!;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<number> {
  if (flag("--version") || cmd === "version") { console.log(flag("--json") ? JSON.stringify(versionJson(), null, 1) : version()); return 0; }
  // A kit from another pack: one line at the first command that uses it, with the fix. untell check prints it with its
  // steps, under the verdict, so that the verdict stays the first line.
  if (["render", "snap", "build"].includes(cmd ?? "")) {
    const { detectFramework } = await import("./detect");
    const { kitMismatch } = await import("./kit");
    const fw = detectFramework(cwd);
    const m = fw && fw !== "both" ? kitMismatch(cwd, fw) : null;
    if (m) console.error(m);
  }
  // `untell hf <args>`: the project's HyperFrames CLI with <args> as they are, through runHyperframes, so a run from an
  // npm script (the scripts untell init writes) has its usage reports off too, on every platform (no inline variables).
  if (args[0] === "hf") {
    const { hyperframesCommand } = await import("./check");
    const { runHyperframes } = await import("./env");
    const r = runHyperframes(hyperframesCommand(process.cwd(), process.env.UNTELL_HYPERFRAMES).cmd, args.slice(1), { stdio: "inherit", cwd: process.cwd(), shell: process.platform === "win32" });
    if (r.error) { console.error(`untell hf: ${r.error.message}`); return 1; }
    return r.status ?? 1;
  }
  if (!cmd) { console.log(HELP); return flag("--help") || flag("-h") || !args.length ? 0 : 2; }
  if (cmd === "help") { console.log(rest[0] ? helpFor(rest[0]) ?? HELP : HELP); return 0; }
  if (flag("--help") || flag("-h")) { const h = helpFor(cmd); if (h) { console.log(h); return 0; } }
  for (const v of valued) need(v, cmd);
  // --theme dark|light (or UNTELL_THEME): the review sheet and listen.png. The tools read UNTELL_THEME.
  if (opt("--theme")) {
    if (!["dark", "light"].includes(opt("--theme")!)) throw new UsageError(`--theme is dark or light, not "${opt("--theme")}".`, cmd);
    process.env.UNTELL_THEME = opt("--theme");
  }

  // The project's own systems: after an edit of systems/<name>/system.ts (or init --force), the kit's list and the
  // system's docs are written again before a command reads them.
  if (["check", "render", "build", "master", "listen", "media", "snap", "systems", "lint"].includes(cmd)) {
    const { syncOwnSystems } = await import("./own-system");
    try { await syncOwnSystems(cwd, (s) => console.error(s)); }
    catch (e) { console.error(`untell: your systems do not build: ${(e as Error).message.split("\n")[0]}. Run untell system check for the fix.`); }
  }

  switch (cmd) {
    case "system": {
      const { systemCommand } = await import("./own-system");
      return systemCommand(cwd, rest[0], rest.slice(1), { from: opt("--from"), force: flag("--force"), json: flag("--json"), noFilm: flag("--no-film") });
    }
    case "init": {
      const fw = opt("--framework");
      if (fw && fw !== "remotion" && fw !== "hyperframes") throw new UsageError(`--framework is remotion or hyperframes, not "${fw}".`, "init");
      const { init, scaffold } = await import("./init");
      const nw = opt("--new");
      if (args.includes("--new") && nw !== "remotion" && nw !== "hyperframes") throw new UsageError(`--new takes remotion or hyperframes${nw ? `, not "${nw}"` : ""}.`, "init");
      if (nw) await scaffold(cwd, nw as Framework, { install: !flag("--no-install") });
      await init(cwd, { framework: fw as Framework | undefined, agents: parseAgents(opt("--agent"), "init"), force: flag("--force"), install: !flag("--no-install"), build: !flag("--no-build"), media: !flag("--no-media") });
      return 0;
    }
    case "lint": {
      if (flag("--hook")) { const r = lintHook(await readStdin(), cwd); if (r.stderr) console.error(r.stderr); return r.code; }
      if (flag("--rules")) { console.log(formatRules()); return 0; }
      if (flag("--docs")) { console.log(tellsDoc()); return 0; }
      if (opt("--explain")) { console.log(explainRule(opt("--explain")!)); return 0; }
      return lintCommand(cwd, { paths: rest, json: flag("--json"), scope: opt("--scope"), maxWarnings: opt("--max-warnings") });
    }
    case "build": {
      if (!rest[0]) throw new UsageError("untell build needs a scene module: untell build films/<name>.ts", "build");
      const { buildHf } = await import("./build");
      await buildHf(cwd, resolve(cwd, rest[0]));
      return 0;
    }
    case "check": {
      if (flag("--rules")) { const { formatDetectorRules } = await import("./detector"); console.log(formatDetectorRules()); return 0; }
      if (flag("--not-measured")) { const { printNotMeasured } = await import("./check"); return printNotMeasured(cwd); }
      if (opt("--explain")) {
        const id = opt("--explain")!;
        if (id.startsWith("lint/")) { console.log(explainRule(id.slice(5))); return 0; }
        const { explainDetectorRule } = await import("./detector");
        console.log(explainDetectorRule(id));
        return 0;
      }
      // `untell check films/x.ts` is the same as --film; a video after the film is the render.
      const films = rest.filter((r) => /\.(tsx?|jsx?)$/.test(r)), videos = rest.filter((r) => /\.(mp4|mov|webm|m4v|mkv)$/i.test(r));
      const odd = rest.filter((r) => !films.includes(r) && !videos.includes(r));
      if (odd.length || films.length > 1 || videos.length > 1 || (films.length && opt("--film"))) throw new UsageError(`untell check takes one scene module and at most one render, not ${rest.map((r) => `"${r}"`).join(" ")}: untell check films/<name>.ts --render out/<name>.mastered.mp4`, "check");
      if (videos.length && opt("--render")) throw new UsageError("give the render once: untell check <film> --render <render>.", "check");
      // A video with no scene (no project here, no scene module, or --no-scene): the checks that need only the file.
      const video = videos[0] ?? opt("--render") ?? (typeof sheetArg === "string" ? sheetArg : undefined);
      const { wantsEyes, eyes } = await import("./eyes");
      if (wantsEyes(cwd, { video, film: films[0] ?? opt("--film"), noScene: flag("--no-scene") })) return eyes(cwd, video!, { system: opt("--system"), sheet: flag("--sheet"), json: flag("--json") });
      if (flag("--no-scene")) throw new UsageError("--no-scene reads a video file alone: untell check <video.mp4> --no-scene.", "check");
      const { check } = await import("./check");
      return check(cwd, { hyperframes: opt("--hyperframes"), skipRecord: flag("--no-record"), sheet: sheetArg ?? flag("--sheet"), json: flag("--json"),
        full: flag("--full"), film: films[0] ?? opt("--film"), render: videos[0] ?? opt("--render"), noDetect: flag("--no-detect"), demo: flag("--demo"), noCache: flag("--no-cache"), noReuse: flag("--no-reuse") });
    }
    case "render": {
      if (rest.length > 1) throw new UsageError(`untell render takes one film, not ${rest.length}: untell render <scene.ts>.`, "render");
      const { render } = await import("./render");
      return render(cwd, rest[0] ?? opt("--film"), { out: opt("--out"), noMaster: flag("--no-master"), json: flag("--json"), system: opt("--system"), noCache: flag("--no-cache"),
        via: opt("--via"), hyperframes: opt("--hyperframes"), keepBitrate: flag("--keep-bitrate") });
    }
    case "listen": {
      const { listen } = await import("./listen");
      return listen(cwd, rest[0], { positional: rest.slice(1), opt, flag, extras: extrasArg });
    }
    case "master": {
      if (rest.length > 1) throw new UsageError(`untell master takes one render, not ${rest.length} files. Give the system with --system <id>.`, "master");
      const { master } = await import("./master");
      return master(cwd, rest[0], { system: opt("--system"), lufs: opt("--lufs"), peak: opt("--peak"), out: opt("--out"), json: flag("--json") });
    }
    case "sheet": {
      const { sheet } = await import("./sheet");
      const r = sheet(cwd, rest[0], { out: opt("--out"), step: opt("--step"), beats: opt("--beats"), findings: opt("--findings"), cols: opt("--cols"), align: opt("--align"), theme: opt("--theme"), capture: opt("--capture"), quiet: flag("--json") });
      if (flag("--json")) console.log(JSON.stringify({ version: 1, sheet: r.sheet, json: r.json, phone: r.phone }, null, 1));
      else console.log(`numbers: ${r.json}\nOpen the sheet as an image and read it.`);
      return r.code;
    }
    case "systems": { const { printSystems } = await import("./systems"); printSystems(cwd); return 0; }
    case "media": {
      const { media } = await import("./media");
      return media(cwd, rest[0], { positional: rest.slice(1), opt: (n) => opt(n) ?? (n === "--licence" ? opt("--license") : undefined), flag });
    }
    case "snap": {
      if (rest.length > 1) throw new UsageError(`untell snap takes one film, not ${rest.length}: untell snap <scene.ts>.`, "snap");
      const { snap } = await import("./snap");
      return snap(cwd, rest[0] ?? opt("--film"), { at: opt("--at"), preview: previewArg, apply: idsAfter("--apply"), unapply: idsAfter("--unapply"), scene: opt("--scene"), all: flag("--all"), json: flag("--json") });
    }
    case "cache": {
      const { cacheCommand } = await import("./cache-cmd");
      return cacheCommand(cwd, rest[0], flag("--json"));
    }
    case "doctor": return doctor(cwd, flag("--json"));
    case "hooks": return hooksCommand(cwd, rest[0], parseAgents(opt("--agent"), "hooks"));
    default: {
      const { COMMANDS } = await import("./help");
      const near = COMMANDS.filter((c) => editDistance(c, cmd) <= 2);
      throw new UsageError(`there is no command "${cmd}".${near.length ? ` Did you mean: untell ${near.join(", untell ")}?` : ""}`);
    }
  }
}

/**
 * Ends the process with `code` after stdout and stderr have written everything. On macOS a pipe is asynchronous: a
 * bare process.exit drops what is still queued, so `untell check | cat` lost its verdict after the first 64 KB.
 */
function exitAfterFlush(code: number): void {
  process.exitCode = code;
  let left = 2;
  const done = () => { if (--left === 0) process.exit(code); };
  for (const s of [process.stdout, process.stderr]) {
    if (s.writableLength === 0 && !s.writableNeedDrain) { done(); continue; }
    s.write("", done);
  }
}

main().then((code) => exitAfterFlush(code), (e: Error) => {
  if (e instanceof UsageError) {
    console.error(`untell: ${e.message}`);
    console.error(e.command ? `Run untell ${e.command} --help for the usage.` : "Run untell to list the commands.");
    exitAfterFlush(2);
    return;
  }
  console.error(`untell: ${e.message}`);
  exitAfterFlush(e instanceof MissingToolError ? 2 : 1);
});
