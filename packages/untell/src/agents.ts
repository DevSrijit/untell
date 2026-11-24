// The agent harnesses that untell serves: Claude Code and Codex. Where each one reads the skill, where its
// hooks live, and the pure JSON edits behind `untell hooks on|off|status`.
//
// Claude Code: skill in .claude/skills/untell/SKILL.md, hooks in .claude/settings.json.
// Codex: skill in .agents/skills/untell/SKILL.md, hooks in .codex/hooks.json (a project hook runs only after
// the user trusts it with /hooks in Codex). Both read the AGENTS.md section. Both hook files use one shape:
//   { "hooks": { "PostToolUse": [ { "matcher": "...", "hooks": [ { "type": "command", "command": "..." } ] } ] } }
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { UsageError } from "./errors";

export type Harness = "claude" | "codex";
export const HARNESSES: Harness[] = ["claude", "codex"];
export const HARNESS_NAME: Record<Harness, string> = { claude: "Claude Code", codex: "Codex" };

/** Where each harness finds the untell skill, relative to the project. */
export const SKILL_PATH: Record<Harness, string> = { claude: ".claude/skills/untell/SKILL.md", codex: ".agents/skills/untell/SKILL.md" };
/** Where each harness reads project hooks, relative to the project. */
export const HOOKS_PATH: Record<Harness, string> = { claude: ".claude/settings.json", codex: ".codex/hooks.json" };
/** The tools that edit a file, as each harness names them in a matcher. */
export const EDIT_MATCHER: Record<Harness, string> = { claude: "Edit|Write|MultiEdit", codex: "apply_patch|Edit|Write" };

/** The hook command. npx --no-install never downloads: it runs the untell that the project has installed. */
export const HOOK_COMMAND = "npx --no-install untell lint --hook";
/** A hook is untell's when its command runs `untell lint --hook`. */
const isOurs = (command: unknown) => typeof command === "string" && /\buntell(\.js)?\s+lint\s+--hook\b/.test(command);

/** Parses `--agent claude|codex|both` into a list. */
export function parseAgents(value: string | undefined, command: string): Harness[] | undefined {
  if (value === undefined) return undefined;
  if (value === "both") return [...HARNESSES];
  if (value === "claude" || value === "codex") return [value];
  throw new UsageError(`--agent is claude, codex or both, not "${value}".`, command);
}

/**
 * The harnesses to set up when the user names none. The project's own marks count first (.claude/ or
 * CLAUDE.md; .codex/ or .agents/), then the machine's (~/.claude, ~/.codex): the harnesses that show.
 * When neither shows anything, both.
 */
export function detectAgents(project: string, home = homedir()): Harness[] {
  const proj = { claude: [".claude", "CLAUDE.md"].some((p) => existsSync(join(project, p))), codex: [".codex", ".agents"].some((p) => existsSync(join(project, p))) };
  const pick = (m: Record<Harness, boolean>) => (m.claude || m.codex ? HARNESSES.filter((h) => m[h]) : null);
  const machine = pick({ claude: existsSync(join(home, ".claude")), codex: existsSync(join(home, ".codex")) });
  return pick(proj) ?? machine ?? [...HARNESSES];
}

type HookEntry = { type?: string; command?: string; [k: string]: unknown };
type Group = { matcher?: string; hooks?: HookEntry[]; [k: string]: unknown };
type Settings = { hooks?: Record<string, Group[] | unknown>; [k: string]: unknown };

/** Parses a hooks file. An empty or missing file is {}. A file that is not a JSON object is refused, never overwritten. */
export function parseSettings(text: string | null, file: string): Settings {
  if (text === null || !text.trim()) return {};
  let v: unknown;
  try { v = JSON.parse(text); } catch (e) { throw new Error(`${file} is not valid JSON (${(e as Error).message}). Fix the file, then run the command again. untell did not change it.`); }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${file} is not a JSON object. Fix the file, then run the command again. untell did not change it.`);
  return v as Settings;
}

/** The indent of a JSON text (2 when it has none), so an edit keeps the user's style. */
const indentOf = (text: string | null) => /\n([ \t]+)"/.exec(text ?? "")?.[1] ?? "  ";
const dump = (s: Settings, before: string | null) => JSON.stringify(s, null, indentOf(before)) + "\n";

/** True when the settings hold untell's PostToolUse hook. */
export function hasHook(s: Settings): boolean {
  const groups = s.hooks?.PostToolUse;
  return Array.isArray(groups) && groups.some((g: Group) => Array.isArray(g?.hooks) && g.hooks.some((h) => isOurs(h?.command)));
}

/** The settings without untell's hook. Groups, events and `hooks` that become empty go too. Nothing else changes. */
function removeHook(s: Settings): Settings {
  if (!s.hooks || typeof s.hooks !== "object") return s;
  const hooks = { ...s.hooks } as Record<string, unknown>;
  const groups = hooks.PostToolUse;
  if (!Array.isArray(groups)) return s;
  const kept = (groups as Group[]).flatMap((g) => {
    if (!Array.isArray(g?.hooks) || !g.hooks.some((h) => isOurs(h?.command))) return [g];
    const left = g.hooks.filter((h) => !isOurs(h?.command));
    return left.length ? [{ ...g, hooks: left }] : [];
  });
  if (kept.length) hooks.PostToolUse = kept; else delete hooks.PostToolUse;
  const out: Settings = { ...s, hooks };
  if (!Object.keys(hooks).length) delete out.hooks;
  return out;
}

/** The hooks file text with untell's hook added. When the hook is already there, the text is returned unchanged. */
export function withHook(text: string | null, harness: Harness, file = HOOKS_PATH[harness], command = HOOK_COMMAND): string {
  const s = parseSettings(text, file);
  if (hasHook(s)) return text!;
  const hooks = { ...(s.hooks as Record<string, unknown> | undefined) };
  const groups = Array.isArray(hooks.PostToolUse) ? [...(hooks.PostToolUse as Group[])] : [];
  groups.push({ matcher: EDIT_MATCHER[harness], hooks: [{ type: "command", command, timeout: 60, ...(harness === "codex" ? { statusMessage: "untell lint" } : {}) }] });
  hooks.PostToolUse = groups;
  return dump({ ...s, hooks }, text);
}

/** The hooks file text without untell's hook. The text is returned unchanged when the hook is not there. */
export function withoutHook(text: string | null, file: string): string | null {
  const s = parseSettings(text, file);
  if (!hasHook(s)) return text;
  return dump(removeHook(s), text);
}

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : null);

export type HookState = { harness: Harness; file: string; on: boolean };

/** The hook state of each harness in the project. */
export function hookStates(project: string): HookState[] {
  return HARNESSES.map((h) => ({ harness: h, file: HOOKS_PATH[h], on: hasHook(parseSettings(read(join(project, HOOKS_PATH[h])), HOOKS_PATH[h])) }));
}

/** True when the project can run `npx --no-install untell`: untell is in its node_modules. */
export const untellInstalled = (project: string) => existsSync(join(project, "node_modules", ".bin", "untell"));

/** `untell hooks on|off|status [--agent claude|codex|both]`. */
export function hooksCommand(project: string, sub: string | undefined, agents: Harness[] | undefined, log = console.log): number {
  if (sub === "status" || sub === undefined) {
    for (const s of hookStates(project)) {
      const skill = existsSync(join(project, SKILL_PATH[s.harness]));
      log(`${HARNESS_NAME[s.harness].padEnd(12)} ${s.on ? "automatic hook: on" : "automatic hook: off"} (${s.file})`);
      log(`${"".padEnd(12)} ${s.on ? "after each edit to a film file, untell lint runs and the agent sees its findings." : "the written rule only: the skill and AGENTS.md tell the agent to run untell lint after each film edit."}`);
      if (s.on && s.harness === "codex") log(`${"".padEnd(12)} Codex runs a project hook only after you trust it: type /hooks in Codex.`);
      if (!skill) log(`${"".padEnd(12)} no skill at ${SKILL_PATH[s.harness]}. Run: untell init --agent ${s.harness}`);
    }
    if (hookStates(project).some((s) => s.on) && !untellInstalled(project)) log("\nThe hook runs `npx --no-install untell`, and untell is not in node_modules. Run: npm install --save-dev untell");
    return 0;
  }
  if (sub !== "on" && sub !== "off") throw new UsageError(`untell hooks takes on, off or status, not "${sub}".`, "hooks");
  const targets = agents ?? (sub === "off" ? [...HARNESSES] : detectAgents(project));
  for (const h of targets) {
    const rel = HOOKS_PATH[h], p = join(project, rel);
    const before = read(p);
    if (sub === "on") {
      const after = withHook(before, h, rel);
      if (after === before) { log(`${HARNESS_NAME[h]}: the hook is already on (${rel}).`); continue; }
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, after);
      log(`${HARNESS_NAME[h]}: hook on. ${rel} runs untell lint after each ${h === "claude" ? "Edit or Write" : "apply_patch"} on a film file.`);
      if (h === "codex") log("  Codex runs a project hook only after you trust it: type /hooks in Codex and trust the untell hook.");
    } else {
      const after = withoutHook(before, rel);
      if (after === before) { log(`${HARNESS_NAME[h]}: the hook is already off.`); continue; }
      writeFileSync(p, after!);
      log(`${HARNESS_NAME[h]}: hook off. untell removed only its own entry from ${rel}.`);
    }
  }
  if (sub === "on" && !untellInstalled(project)) log("\nThe hook runs `npx --no-install untell`, so untell must be in this project's node_modules. Run: npm install --save-dev untell");
  return 0;
}
