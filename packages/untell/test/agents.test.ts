// Unit tests for the agent harness files: the hook JSON edits, harness detection and the agent files of init.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectAgents, hasHook, HOOK_COMMAND, hookStates, hooksCommand, parseAgents, parseSettings, SKILL_PATH, withHook, withoutHook } from "../src/agents";
import { writeAgentFiles } from "../src/init";
import { agentsSection, skill } from "../src/templates";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "untell-agents-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("withHook and withoutHook", () => {
  test("make a hooks file when there is none", () => {
    const j = JSON.parse(withHook(null, "claude"));
    expect(j).toEqual({ hooks: { PostToolUse: [{ matcher: "Edit|Write|MultiEdit", hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 60 }] }] } });
  });
  test("Codex matches apply_patch", () => {
    expect(JSON.parse(withHook(null, "codex")).hooks.PostToolUse[0].matcher).toBe("apply_patch|Edit|Write");
  });
  test("keep every other setting and hook", () => {
    const before = JSON.stringify({ model: "x", permissions: { allow: ["Bash(ls)"] }, hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre" }] }], PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "prettier" }] }] } }, null, 2) + "\n";
    const on = JSON.parse(withHook(before, "claude"));
    expect(on.model).toBe("x");
    expect(on.permissions).toEqual({ allow: ["Bash(ls)"] });
    expect(on.hooks.PreToolUse).toHaveLength(1);
    expect(on.hooks.PostToolUse).toHaveLength(2);
    expect(on.hooks.PostToolUse[0].hooks[0].command).toBe("prettier");
    // off gives back exactly the file the user had.
    expect(withoutHook(withHook(before, "claude"), "f")).toBe(before);
  });
  test("on twice gives one hook, and the text does not change", () => {
    const once = withHook("{}", "claude");
    expect(withHook(once, "claude")).toBe(once);
  });
  test("off removes only untell's entry from a shared group", () => {
    const shared = JSON.stringify({ hooks: { PostToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command: "prettier" }, { type: "command", command: HOOK_COMMAND }] }] } });
    expect(JSON.parse(withoutHook(shared, "f")!)).toEqual({ hooks: { PostToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command: "prettier" }] }] } });
  });
  test("off prunes empty groups, events and the hooks key", () => {
    expect(JSON.parse(withoutHook(withHook('{"theme":"dark"}', "claude"), "f")!)).toEqual({ theme: "dark" });
  });
  test("off on a file without the hook changes nothing", () => {
    expect(withoutHook('{ "a": 1 }', "f")).toBe('{ "a": 1 }');
    expect(withoutHook(null, "f")).toBe(null);
  });
  test("keep the indent of the file", () => {
    expect(withHook('{\n    "a": 1\n}\n', "claude")).toContain('\n    "a": 1');
    expect(withHook('{\n\t"a": 1\n}\n', "claude")).toContain('\n\t"a": 1');
  });
  test("refuse a file that is not a JSON object, and do not change it", () => {
    expect(() => withHook("{ not json", "claude", "s.json")).toThrow(/not valid JSON.*did not change/);
    expect(() => withHook("[1]", "claude", "s.json")).toThrow(/not a JSON object/);
  });
  test("hasHook and parseSettings", () => {
    expect(hasHook(parseSettings(withHook(null, "codex"), "f"))).toBe(true);
    expect(hasHook(parseSettings("", "f"))).toBe(false);
  });
});

describe("hooksCommand", () => {
  test("on, status and off write and remove both files", () => {
    const d = tmp();
    const lines: string[] = [];
    hooksCommand(d, "on", ["claude", "codex"], (s) => lines.push(s));
    expect(hookStates(d).map((s) => s.on)).toEqual([true, true]);
    expect(existsSync(join(d, ".codex/hooks.json"))).toBe(true);
    expect(lines.join("\n")).toMatch(/trust/);
    hooksCommand(d, "off", undefined, () => {});
    expect(hookStates(d).map((s) => s.on)).toEqual([false, false]);
    expect(JSON.parse(readFileSync(join(d, ".claude/settings.json"), "utf8"))).toEqual({});
  });
  test("status names the automatic hook and the written rule", () => {
    const d = tmp();
    hooksCommand(d, "on", ["claude"], () => {});
    const out: string[] = [];
    hooksCommand(d, "status", undefined, (s) => out.push(s));
    expect(out.join("\n")).toMatch(/Claude Code\s+automatic hook: on/);
    expect(out.join("\n")).toMatch(/Codex\s+automatic hook: off[\s\S]*the written rule/);
  });
  test("a bad subcommand is a usage error", () => expect(() => hooksCommand(tmp(), "maybe", undefined, () => {})).toThrow(/on, off or status/));
});

describe("harnesses", () => {
  test("parseAgents", () => {
    expect(parseAgents("both", "init")).toEqual(["claude", "codex"]);
    expect(parseAgents("codex", "init")).toEqual(["codex"]);
    expect(parseAgents(undefined, "init")).toBeUndefined();
    expect(() => parseAgents("cursor", "init")).toThrow(/claude, codex or both/);
  });
  test("detectAgents: the project first, then the machine, else both", () => {
    const home = tmp(), p = tmp();
    expect(detectAgents(p, home)).toEqual(["claude", "codex"]);
    mkdirSync(join(home, ".codex"));
    expect(detectAgents(p, home)).toEqual(["codex"]);
    mkdirSync(join(p, ".claude"));
    expect(detectAgents(p, home)).toEqual(["claude"]);
    mkdirSync(join(p, ".agents"));
    expect(detectAgents(p, home)).toEqual(["claude", "codex"]);
  });
});

describe("agent files", () => {
  test("--agent codex writes the Codex skill and AGENTS.md, and nothing under .claude", () => {
    const d = tmp();
    writeAgentFiles(d, "hyperframes", ["codex"], false, () => {});
    expect(readFileSync(join(d, SKILL_PATH.codex), "utf8")).toBe(skill("hyperframes"));
    expect(existsSync(join(d, ".claude"))).toBe(false);
    const agents = readFileSync(join(d, "AGENTS.md"), "utf8");
    expect(agents).toContain(SKILL_PATH.codex);
    expect(agents).not.toContain(".claude");
  });
  test("the skill and AGENTS.md are model-neutral and carry the loop", () => {
    for (const fw of ["remotion", "hyperframes"] as const) {
      const text = skill(fw) + agentsSection(fw);
      expect(text).not.toMatch(/\bClaude\b/);
      expect(text).toContain("npx untell lint");
      expect(text).toContain("npx untell check");
      expect(text).toContain("npx untell render");
      expect(text).not.toMatch(/npx (remotion|hyperframes) render/);
      expect(text).toContain("```bash");
    }
  });
  test("AGENTS.md stands alone: the lint rule, the check rule and the sheet", () => {
    const s = agentsSection("remotion", [SKILL_PATH.codex]);
    expect(s).toMatch(/After each edit to a film file, run untell lint/);
    expect(s).toMatch(/npx untell render src\/films\/<name>\.ts/);
    expect(s).toMatch(/npx untell check src\/films\/<name>\.ts --render <final file> --sheet/);
    expect(s).toMatch(/review sheet: <path>/);
  });
});

describe("an existing CLAUDE.md", () => {
  test("init writes the untell section into it too, once, with the same markers; it makes no CLAUDE.md of its own", () => {
    const { mkdtempSync, writeFileSync, readFileSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const { tmpdir } = require("node:os");
    const d = mkdtempSync(join(tmpdir(), "untell-claude-"));
    writeAgentFiles(d, "hyperframes", ["claude"], false, () => {});
    expect(existsSync(join(d, "CLAUDE.md"))).toBe(false);
    writeFileSync(join(d, "CLAUDE.md"), "# My project\n");
    writeAgentFiles(d, "hyperframes", ["claude"], false, () => {});
    writeAgentFiles(d, "hyperframes", ["claude"], false, () => {});
    const text = readFileSync(join(d, "CLAUDE.md"), "utf8");
    expect(text.startsWith("# My project")).toBe(true);
    expect(text.split("<!-- untell:start -->").length).toBe(2);
    expect(text).toContain("<!-- untell:end -->");
  });
});
