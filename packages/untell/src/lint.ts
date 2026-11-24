// `untell lint`: finds the tells in video source code before any frame is rendered.
// The rules are this repository's own (scripts/lint/rules.ts). This import makes them one source: the pack script
// bundles them into dist/cli.js and writes docs/TELLS.md from them. Do not copy the rules into the package.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { caseCollisions, isScene, lint, RULES, silentStatement, type Finding, type Rule } from "../../../scripts/lint/rules";
export { silentStatement };
import { detectFramework } from "./detect";
import { FILMS_DIR } from "./kit";
import { UsageError } from "./errors";

export { RULES, type Finding, type Rule };

export type LintScope = "auto" | "any" | "scene";
export type FileResult = { file: string; findings: Finding[] };
export type LintReport = { files: number; errors: number; warnings: number; results: FileResult[] };

/** The file types that lint reads. */
export const LINT_EXT = /\.(tsx?|jsx?|html?|css)$/;
const SKIP_DIR = /^(node_modules|dist|out|\.git|\.untell|\.venv-media|untell)$/;

/** True for a file that lint reads: a source file that is not a test, a type file or a generated table. */
export const lintable = (path: string) => LINT_EXT.test(path) && !/\.(test|d)\.tsx?$/.test(path) && !/\.gen\.ts$/.test(path);

/**
 * Every file to lint under the targets. A folder is walked, without dependencies, build output, untell's
 * work files and the kit folder (the kit is untell's own code, not a film). A file given by name is always read.
 */
export function lintFiles(targets: string[]): string[] {
  const walk = (p: string): string[] => statSync(p).isDirectory()
    ? readdirSync(p).filter((n) => !SKIP_DIR.test(n)).sort().flatMap((n) => walk(join(p, n)))
    : lintable(p) ? [p] : [];
  return targets.flatMap((t) => {
    if (!existsSync(t)) throw new UsageError(`${t} does not exist. Give a film file or a folder, or no path to lint the films folder.`, "lint");
    return statSync(t).isDirectory() ? walk(t) : [t];
  });
}

/** The project's films folders: src/films (Remotion), films (HyperFrames), whichever exist. */
export function filmsFolders(project: string): string[] {
  const fw = detectFramework(project);
  const dirs = fw === "remotion" || fw === "hyperframes" ? [FILMS_DIR[fw]] : [FILMS_DIR.remotion, FILMS_DIR.hyperframes];
  return dirs.filter((d) => existsSync(join(project, d)));
}

/** Lints files and adds up the findings. `cwd` makes the file names relative. */
export function lintPaths(files: string[], cwd: string, scope: LintScope = "auto"): LintReport {
  const all = files.map((f) => ({ file: relative(cwd, f) || f, findings: lint(readFileSync(f, "utf8"), { scope }) }));
  // scene/case-collision: a folder rule, over the files read and the code files beside them.
  const rule = RULES.find((r) => r.id === "scene/case-collision")!;
  const near = [...new Set(files.map((f) => dirname(f)))].flatMap((d) => { try { return readdirSync(d).filter((n) => /\.(tsx?|jsx?)$/.test(n)).map((n) => join(d, n)); } catch { return []; } });
  for (const [f, other] of caseCollisions([...files, ...near])) {
    let r = all.find((x) => x.file === (relative(cwd, f) || f));
    if (!r) { r = { file: relative(cwd, f) || f, findings: [] }; all.push(r); }
    r.findings.push({ rule: rule.id, severity: rule.severity, line: 1, col: 1, text: basename(f), message: `${basename(f)} and ${basename(other)} differ only by case`, fix: rule.fix });
  }
  const results = all.filter((r) => r.findings.length);
  const errors = results.reduce((n, r) => n + r.findings.filter((f) => f.severity === "error").length, 0);
  const warnings = results.reduce((n, r) => n + r.findings.length, 0) - errors;
  return { files: files.length, errors, warnings, results };
}

const tty = () => !!process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (on: boolean) => (code: number, s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s);

/** The report for a person: findings by file, each with its line, its rule and its fix. */
export function formatReport(r: LintReport, color = tty()): string {
  const c = paint(color);
  const out: string[] = [];
  for (const f of r.results) {
    out.push(c(4, f.file));
    for (const x of f.findings) {
      out.push(`  ${String(x.line).padStart(4)}:${String(x.col).padEnd(3)} ${x.severity === "error" ? c(31, "error  ") : c(33, "warning")} ${x.message}  ${c(2, x.rule)}`);
      out.push(`           ${c(2, x.text)}`);
      out.push(`           ${c(36, "fix:")} ${x.fix}`);
    }
    out.push("");
  }
  out.push(r.errors + r.warnings === 0
    ? c(32, `No tells in ${r.files} file(s).`)
    : `${r.errors} error(s), ${r.warnings} warning(s) in ${r.results.length} of ${r.files} file(s). untell lint --explain <rule> shows a rule in full.`);
  return out.join("\n");
}

/** The rule catalog as Markdown: docs/TELLS.md. The pack script writes it; `untell lint --docs` prints it. */
export function tellsDoc(rules: Rule[] = RULES): string {
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  const table = (scope: "any" | "scene") => ["| Rule | Level | Why it is a tell | Fix |", "| --- | --- | --- | --- |",
    ...rules.filter((r) => r.scope === scope).map((r) => `| \`${r.id}\` | ${r.severity} | ${cell(r.why)} | ${cell(r.fix)} |`)].join("\n");
  const n = (scope: "any" | "scene") => rules.filter((r) => r.scope === scope).length;
  return `# The tells

Generated from the rules by the untell pack script. Do not edit: \`untell lint --docs\` prints the same text.

\`untell lint\` reads source code and finds what makes a video read as AI-made, before any frame is rendered.
It has ${rules.length} rules: ${n("any")} for any video code and ${n("scene")} for an untell scene module.
An error makes \`untell lint\` exit with 1. A warning does not, unless you give \`--max-warnings <n>\`.

To silence one finding, write a comment on its line or on the line above it:

\`\`\`ts
// untell-ignore <rule id>: <reason>
\`\`\`

\`tell/*\` silences every rule in that set. Always give the reason.

## In any video code (Remotion, HyperFrames, HTML, CSS, GSAP)

${table("any")}

## In an untell scene

A file is a scene when it exports \`scene\` and \`system\`. Give \`--scope scene\` or \`--scope any\` to choose for every file.

${table("scene")}
`;
}

/** The rule list for `--rules`. */
export function formatRules(color = tty()): string {
  const c = paint(color);
  const w = Math.max(...RULES.map((r) => r.id.length)) + 2;
  return [...RULES.map((r) => `${c(1, r.id.padEnd(w))} ${r.severity.padEnd(8)} ${r.why}`),
    "", `${RULES.length} rules. untell lint --explain <rule> shows why and the fix.`].join("\n");
}

/** One rule in full, for `--explain`. */
export function explainRule(id: string, color = tty()): string {
  const r = RULES.find((x) => x.id === id) ?? RULES.find((x) => x.id.endsWith(`/${id}`));
  if (!r) throw new UsageError(`there is no rule "${id}". Run untell lint --rules to list the rules.`, "lint");
  const c = paint(color);
  return `${c(1, r.id)}  (${r.severity}, ${r.scope === "scene" ? "untell scene modules" : "any video code"})\n\nWhy: ${r.why}\nFix: ${r.fix}\n\nSilence one line: // untell-ignore ${r.id}: <reason>`;
}

export type LintOptions = { paths: string[]; json?: boolean; scope?: string; maxWarnings?: string };

/** `untell lint [paths...]`. Returns the exit code: 0 clean, 1 an error or too many warnings. */
export function lintCommand(project: string, o: LintOptions): number {
  const scope = (o.scope ?? "auto") as LintScope;
  if (!["auto", "any", "scene"].includes(scope)) throw new UsageError(`--scope is auto, any or scene, not "${o.scope}".`, "lint");
  const max = o.maxWarnings === undefined ? Infinity : Number(o.maxWarnings);
  if (Number.isNaN(max) || max < 0) throw new UsageError(`--max-warnings takes a number of 0 or more, not "${o.maxWarnings}".`, "lint");
  let targets = o.paths.map((p) => resolve(project, p));
  if (!targets.length) {
    const dirs = filmsFolders(project);
    if (!dirs.length) throw new UsageError(`there is no films folder here (${FILMS_DIR.remotion}/ or ${FILMS_DIR.hyperframes}/). Give the files or folders to lint: untell lint <path>...`, "lint");
    targets = dirs.map((d) => join(project, d));
  }
  const report = lintPaths(lintFiles(targets), project, scope);
  if (o.json) console.log(JSON.stringify(report, null, 1));
  else console.log(formatReport(report));
  return report.errors > 0 || report.warnings > max ? 1 : 0;
}

// ----- The Claude Code hook -----

/**
 * What a PostToolUse hook gets on stdin. Only these fields are read.
 * Claude Code (Edit, Write): tool_input.file_path. Codex (apply_patch): tool_input.command holds the patch.
 */
export type HookInput = { cwd?: string; tool_name?: string; tool_input?: { file_path?: string; path?: string; command?: string | string[]; patch?: string; input?: string } };

/** The files that an apply_patch patch adds, updates or moves to. Deleted files are not read. */
export function patchFiles(patch: string): string[] {
  const out = new Set<string>();
  for (const m of patch.matchAll(/^\*\*\* (?:Add File|Update File|Move to): (.+)$/gm)) out.add(m[1]!.trim());
  return [...out];
}

/** The paths that a hook input names: the edited file (Claude Code) or every file in the patch (Codex). */
export function hookPaths(input: HookInput): string[] {
  const t = input.tool_input ?? {};
  const one = t.file_path ?? t.path;
  if (one) return [one];
  const cmd = Array.isArray(t.command) ? t.command.join("\n") : t.command ?? t.patch ?? t.input ?? "";
  return patchFiles(cmd);
}

/**
 * The film files that a hook input names. A film file is a lintable file in a films folder, or any lintable
 * file that is a scene module. Files outside the project are not linted.
 */
export function hookTargets(input: HookInput, fallbackCwd: string): { project: string; files: string[] } {
  const project = resolve(input.cwd ?? fallbackCwd);
  const files = hookPaths(input).map((raw) => (isAbsolute(raw) ? raw : resolve(project, raw))).filter((file) => {
    const rel = relative(project, file);
    if (rel.startsWith("..") || isAbsolute(rel) || !lintable(file) || !existsSync(file)) return false;
    const parts = rel.split(sep).join("/");
    if ([FILMS_DIR.remotion, FILMS_DIR.hyperframes].some((d) => parts.startsWith(`${d}/`))) return true;
    return isScene(readFileSync(file, "utf8"));
  });
  return { project, files };
}

/** The hook's message to the agent: at most `max` findings, then a count of the rest. */
export function hookMessage(r: LintReport, max = 12): string {
  const all = r.results.flatMap((f) => f.findings.map((x) => `${f.file}:${x.line}:${x.col} ${x.severity} ${x.rule}: ${x.message.replace(/\.$/, "")}. Fix: ${x.fix}`));
  const shown = all.slice(0, max);
  return [`untell lint: ${r.errors} error(s), ${r.warnings} warning(s) in the film file(s) you changed.`, ...shown,
    ...(all.length > shown.length ? [`... and ${all.length - shown.length} more. Run: untell lint ${r.results[0]?.file ?? ""}`] : []),
    "Fix them now, or silence a line with // untell-ignore <rule>: <reason>."].join("\n");
}

/**
 * `untell lint --hook`: the PostToolUse hook for Claude Code and Codex. It reads the hook input on stdin.
 * For a film file with findings, it writes them to stderr and exits with 2: both harnesses then show them to
 * the agent. Else it exits with 0 and prints nothing.
 */
export function lintHook(stdin: string, cwd: string): { code: number; stderr: string } {
  let input: HookInput;
  try { input = JSON.parse(stdin || "{}") as HookInput; } catch { return { code: 0, stderr: "" }; }
  const t = hookTargets(input, cwd);
  if (!t.files.length) return { code: 0, stderr: "" };
  const report = lintPaths(t.files, t.project);
  if (!report.results.length) return { code: 0, stderr: "" };
  return { code: 2, stderr: hookMessage(report) };
}
