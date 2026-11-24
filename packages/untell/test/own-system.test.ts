// A design system of your own (src/own-system.ts): untell system new and untell system check in a project made from
// the packed kit, and the pure parts (the source text, the kit's list, the problems with their fields).
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyKit } from "../src/init";
import { UsageError } from "../src/errors";
import { fromOf, NAME_RE, ownFile, ownGenSource, systemCheck, systemNew, tsLiteral } from "../src/own-system";
import { listSystems } from "../src/systems";
import { systemsDir } from "../src/build";

const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const quiet = async <T>(fn: () => Promise<T>): Promise<{ value: T; out: string }> => {
  const l = console.log, e = console.error, said: string[] = [];
  console.log = (s: string) => said.push(String(s)); console.error = (s: string) => said.push(String(s));
  try { return { value: await fn(), out: said.join("\n") }; } finally { console.log = l; console.error = e; }
};

describe("the pure parts", () => {
  test("a name: lower case, digits and hyphens, from a letter", () => {
    for (const ok of ["harbour", "ledger-2", "ab"]) expect(NAME_RE.test(ok)).toBe(true);
    for (const bad of ["Harbour", "2fast", "a", "has space", "x".repeat(40)]) expect(NAME_RE.test(bad)).toBe(false);
  });
  test("the kit's list imports each system's file", () => {
    expect(ownGenSource([])).toContain("export const OWN_SYSTEMS: OwnSystem[] = [];");
    const t = ownGenSource(["harbour", "ledger"]);
    expect(t).toContain('import own0 from "../systems/harbour/system";');
    expect(t).toContain("export const OWN_SYSTEMS: OwnSystem[] = [own0, own1];");
  });
  test("the source is TypeScript that gives back the same data", () => {
    const v = { a: { l: 0.5, c: 0.1, h: 30 }, "x-y": [1, [2, 3]], s: 'a "quote" { brace }', many: Array.from({ length: 20 }, (_, i) => ({ i })) };
    expect(eval(`(${tsLiteral(v)})`)).toEqual(v);
  });
});

describe("untell system new and check in a project", () => {
  const d = mkdtempSync(join(tmpdir(), "untell-own-"));
  dirs.push(d);
  writeFileSync(join(d, "hyperframes.json"), "{}\n");
  copyKit(d, "hyperframes");

  test("new copies a built-in under the new name; every tool then reads it", async () => {
    const r = await quiet(() => systemNew(d, "harbour", "riso"));
    expect(r.value).toBe(0);
    expect(r.out).toContain("done: harbour is a copy of riso");
    expect(r.out).toContain("next    edit systems/harbour/system.ts, then run: untell system check harbour");
    const src = readFileSync(ownFile(d, "hyperframes", "harbour"), "utf8");
    expect(src).toContain('id: "harbour"');
    expect(src).toContain('from: "riso"');
    expect(readFileSync(join(d, "untell", "own.gen.ts"), "utf8")).toContain('import own0 from "../systems/harbour/system";');
    const tokens = JSON.parse(readFileSync(join(systemsDir(d), "harbour", "tokens.json"), "utf8"));
    expect(tokens.id).toBe("harbour");
    expect(tokens.direction.mix.lufs).toBe(JSON.parse(readFileSync(join(systemsDir(d), "riso", "tokens.json"), "utf8")).direction.mix.lufs);
    expect(fromOf(d, "harbour")).toBe("riso");
    expect(existsSync(join(systemsDir(d), "harbour", "SYSTEM.md"))).toBe(true);
    expect(listSystems(systemsDir(d)).find((s) => s.id === "harbour")).toMatchObject({ own: true, from: "riso" });
  }, 120000);

  test("wrong use: a built-in id, a reserved word, a source that does not exist, a copy over a system", async () => {
    await expect(systemNew(d, "riso", "spec")).rejects.toThrow(/built-in/);
    await expect(systemNew(d, "none", "riso")).rejects.toThrow(UsageError);
    await expect(systemNew(d, "tide", "no-such")).rejects.toThrow(/no system "no-such"/);
    await expect(systemNew(d, "harbour", "riso")).rejects.toThrow(/--force/);
  }, 120000);

  test("check passes a fresh copy, and names the field and the fix of each problem", async () => {
    const ok = await quiet(() => systemCheck(d, "harbour", { film: false }));
    expect(ok.value).toBe(0);
    expect(ok.out).toMatch(/\npassed\n/);
    const file = ownFile(d, "hyperframes", "harbour");
    const before = readFileSync(file, "utf8");
    writeFileSync(file, before.replace(/inkMuted: \{ l: [\d.]+/, "inkMuted: { l: 0.8").replace(/kind: "event"/, 'kind: "fade"').replace('display: "Bricolage Grotesque"', 'display: "Nowhere Sans"'));
    const bad = await quiet(() => systemCheck(d, "harbour", { film: false, json: true }));
    expect(bad.value).toBe(1);
    expect(bad.out).toContain("x failed");
    expect(bad.out).toMatch(/system\.roles\.inkMuted inkMuted on ground reads [\d.]+:1/);
    expect(bad.out).toContain("direction.ends.kind");
    expect(bad.out).toMatch(/no font file for Nowhere Sans .*\n.*nowhere-sans-latin-\d+-normal\.woff2/);
    writeFileSync(file, before);
  }, 120000);

  test("a brand colour: a copy of Mark with its own accent passes while the text on it keeps its contrast", async () => {
    await quiet(() => systemNew(d, "orvane", "mark"));
    const file = ownFile(d, "hyperframes", "orvane");
    const src = readFileSync(file, "utf8");
    const brass = "{ l: 0.47, c: 0.1, h: 75 }";
    writeFileSync(file, src.replace(/\n(\s+)accent: \{[^}]+\}/, `\n$1accent: ${brass}`).replace(/accentText: \{[^}]+\}/, `accentText: ${brass}`));
    const ok = await quiet(() => systemCheck(d, "orvane", { film: false }));
    expect(ok.out).toMatch(/\npassed/);
    expect(JSON.parse(readFileSync(join(systemsDir(d), "orvane", "tokens.json"), "utf8")).roles.accent).toEqual({ l: 0.47, c: 0.1, h: 75 });
    // An accent too light for the text on it fails, with the field and the fix.
    writeFileSync(file, src.replace(/\n(\s+)accent: \{[^}]+\}/, "\n$1accent: { l: 0.8, c: 0.1, h: 75 }"));
    const bad = await quiet(() => systemCheck(d, "orvane", { film: false }));
    expect(bad.value).toBe(1);
    expect(bad.out).toMatch(/system\.roles\.onAccent onAccent on accent reads/);
  }, 120000);
});

// The film step judges the example film in the new system on its own, with the frame rules: an unedited copy of Riso
// passes, and a label role too small to read on a phone fails it with reading-size. It records with Chrome:
// UNTELL_SKIP_E2E=1 skips it, and it skips itself when Chrome is missing.
const chrome = process.env.UNTELL_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LAB = join(import.meta.dir, "..", "..", "..");
const e2e = process.env.UNTELL_SKIP_E2E !== "1" && existsSync(chrome) && existsSync(join(LAB, "node_modules", "@remotion", "player"));
test.skipIf(!e2e)("the film step: a clean copy passes on its own; a value that makes the film unreadable fails it", async () => {
  const { spawnSync } = await import("node:child_process");
  const { symlinkSync } = await import("node:fs");
  const CLI = join(import.meta.dir, "..", "dist", "cli.js");
  const d = mkdtempSync(join(tmpdir(), "untell-own-film-"));
  dirs.push(d);
  const rv = (JSON.parse(readFileSync(join(LAB, "node_modules", "remotion", "package.json"), "utf8")) as { version: string }).version;
  writeFileSync(join(d, "package.json"), JSON.stringify({ name: "own-film", dependencies: { remotion: rv, "@remotion/player": rv } }));
  symlinkSync(join(LAB, "node_modules"), join(d, "node_modules"));
  const node = (args: string[]) => spawnSync("node", [CLI, ...args], { cwd: d, encoding: "utf8", timeout: 600000, maxBuffer: 1 << 26 });
  expect(node(["init", "--no-install", "--agent", "codex"]).status).toBe(0);
  expect(node(["system", "new", "tide", "--from", "riso"]).status).toBe(0);
  const clean = node(["system", "check", "tide", "--json"]);
  const c = JSON.parse(clean.stdout) as { ok: boolean; systems: { film: { mine: { errors: number }; theirs: unknown; added: unknown[] } }[] };
  expect([clean.status, c.ok, c.systems[0]!.film.mine.errors, c.systems[0]!.film.theirs, c.systems[0]!.film.added], clean.stderr.slice(-1500)).toEqual([0, true, 0, null, []]);
  const file = join(d, "src", "systems", "tide", "system.ts");
  writeFileSync(file, readFileSync(file, "utf8").replace(/label: \{ font: "text", size: 0\.036,/, 'label: { font: "text", size: 0.022,'));
  const bad = node(["system", "check", "tide", "--json"]);
  const b = JSON.parse(bad.stdout) as { ok: boolean; systems: { film: { added: { check: string }[] } }[] };
  expect([bad.status, b.ok]).toEqual([1, false]);
  expect(b.systems[0]!.film.added.length).toBeGreaterThan(0);
  expect(b.systems[0]!.film.added.every((f) => f.check === "reading-size")).toBe(true);
  expect(bad.stderr).toContain("the film is clean in riso, so each error is your system's");
}, 600000);
