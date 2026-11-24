// The pack's anchors: how it finds the few places where a repository file differs from what a project needs.
// Each function prefers the native form (the repository file reads the value from the environment) or a marker comment
// ("untell:pack <name>"), and falls back to an older anchor only when neither is there. A fallback returns a note,
// so the pack can list every patch that remains. Pure functions: the unit tests run them on samples.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type Anchored = { text: string; fallback: string | null };

/** A marker line: "# untell:pack <name>", "// untell:pack <name>" or "<!-- untell:pack <name> -->". */
export const markerRe = (name: string) => new RegExp(`^.*untell:pack ${name}\\b.*$`, "m");

/**
 * The kit's copy of scene/BLOCKS.md stops before the repository's tasks for repository agents. Marker: a line with
 * "untell:pack end" (the copy stops before it). Fallback: the heading "## What you deliver".
 */
export function blocksDocCut(doc: string, file: string): Anchored {
  const m = markerRe("end").exec(doc);
  if (m) return { text: doc.slice(0, m.index).replace(/\n+$/, "\n"), fallback: null };
  const cut = doc.indexOf("\n## What you deliver");
  if (cut >= 0) return { text: doc.slice(0, cut + 1), fallback: `${file}: cut at the heading "## What you deliver" (marker: <!-- untell:pack end -->)` };
  throw new Error(`${file}: no line with "untell:pack end" and no heading "## What you deliver". Add <!-- untell:pack end --> above the part for repository agents.`);
}

/**
 * A repository doc that names the repository's owner ("as <name> asked"). A shipped file names no one: the name becomes "the author".
 * Native: the doc names no one. Fallback: each name is set, with a note, until the repository's line changes.
 */
export const OWNER = new RegExp(`\\b${["Sri", "jit"].join("")}\\b`, "g");
export function ownerName(text: string, file: string): Anchored {
  const n = (text.match(OWNER) ?? []).length;
  if (!n) return { text, fallback: null };
  return { text: text.replace(OWNER, "the author"), fallback: `${file}: ${n} name(s) of the repository's owner set to "the author" (native: the doc names no one)` };
}

/** The ROOT lines that the repository's scripts used before they read UNTELL_ROOT. */
export const ROOT_LINE = /^ROOT = (Path\(__file__\)\.resolve\(\)\.(parents\[\d\]|parent\.parent)|HERE\.parents\[\d\])$/m;
export const NEW_ROOT = 'ROOT = Path(__import__("os").environ.get("UNTELL_ROOT") or ".")  # untell: the work tree in the project (.untell/lab)';
/** True for a ROOT line that already reads UNTELL_ROOT. */
export const nativeRoot = (line: string) => /^ROOT\s*=/.test(line) && line.includes("UNTELL_ROOT");

/**
 * A repository script's root. Native: its ROOT line reads UNTELL_ROOT, so it is copied unchanged. Fallback: the old
 * ROOT line becomes NEW_ROOT. A script without a ROOT line is copied unchanged.
 */
export function rootLine(text: string, file: string): Anchored {
  const line = text.split("\n").find((l) => /^ROOT\s*=/.test(l));
  if (!line || nativeRoot(line)) return { text, fallback: null };
  if (!ROOT_LINE.test(text)) throw new Error(`${file}: its ROOT line is "${line.trim()}". Make it read UNTELL_ROOT, for example: ROOT = Path(os.environ.get("UNTELL_ROOT") or Path(__file__).resolve().parents[2])`);
  return { text: text.replace(ROOT_LINE, NEW_ROOT), fallback: `${file}: ROOT line set to UNTELL_ROOT (native: ROOT = Path(os.environ.get("UNTELL_ROOT") or ...))` };
}

/** The repository's hint for adding the listen packages, and untell's command for it. */
export const SETUP = /uv pip install --python \.venv-audio\/bin\/python (?:[^"\\\n]|\\"|"[^"\n]*")*/g;
export const SETUP_UNTELL = "untell listen setup --extras";

/**
 * The listen script's setup hint. Native: it reads the hint from UNTELL_LISTEN_SETUP. Fallback: each lab hint
 * ("uv pip install --python .venv-audio/bin/python ...") becomes untell's command.
 */
export function setupHint(text: string, file: string): Anchored {
  if (text.includes("UNTELL_LISTEN_SETUP")) return { text, fallback: null };
  const n = (text.match(SETUP) ?? []).length;
  if (!n) return { text, fallback: null };
  return { text: text.replace(SETUP, SETUP_UNTELL), fallback: `${file}: ${n} setup hint(s) set to "${SETUP_UNTELL}" (native: read UNTELL_LISTEN_SETUP)` };
}

/**
 * One top-level declaration from a repository file, as source text: from "const <name> = " at the start of a line to the
 * first line "};" after it. The samplers are written this way in the repository; a different shape stops the pack.
 */
export function extractDecl(text: string, name: string, file: string): string {
  const m = new RegExp(`^const ${name} = `, "m").exec(text);
  const b = m ? text.indexOf("\n};\n", m.index) : -1;
  if (!m || b < 0) throw new Error(`${file}: no top-level "const ${name} = ... };". The package's recorder runs this sampler; keep it a top-level const that ends with a line "};".`);
  return text.slice(m.index, b + 3);
}

/** The local modules that a Python file imports ("import x", "from x import y", "import x as y"). */
export function pyImports(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))/gm)) {
    for (const n of (m[1] ?? m[2] ?? "").split(",")) out.add(n.trim().split(/\s+/)[0]!.split(".")[0]!);
  }
  return [...out];
}

/**
 * The helper modules in `dir` that `entry` and `files` import, and what those import, as file names. Modules in
 * `skipDirs` (the checks) are shipped on their own, so they are not followed into the result.
 */
export function importClosure(entry: string, skipDirs: string[], dir: string, files: string[] = []): string[] {
  const found = new Set<string>();
  const todo = [entry, ...files];
  const seen = new Set<string>();
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const mod of pyImports(readFileSync(f, "utf8"))) {
      const p = join(dir, `${mod}.py`);
      if (existsSync(p) && !skipDirs.some((d) => p.startsWith(d))) { found.add(`${mod}.py`); todo.push(p); }
    }
  }
  return [...found].filter((f) => f !== "detect.py" && f !== "cover.py").sort();
}

/** Repository commands in shipped text, and the untell command for each. Applied to generated text (the rule catalog). */
export const LAB_COMMANDS: [RegExp, string][] = [
  [/bun scripts\/snap\/cli\.ts (\S+) --films \S+/g, "untell snap $1"],
  [/bun scripts\/snap\/cli\.ts/g, "untell snap"],
  [/bun scripts\/detect\.ts --explain/g, "untell check --explain"],
  [/bun scripts\/detect\.ts --rules/g, "untell check --rules"],
  [/bun scripts\/detect\.ts/g, "untell check"],
  [/python3 scripts\/music_map\.py/g, "untell listen analyse <name>"],
  [/python3 scripts\/master\.py/g, "untell master"],
  [/python3 scripts\/review_sheet\.py/g, "untell sheet"],
  [/bun scripts\/media\.ts prepare-model/g, "untell media add <file.glb> --as <name>"],
];

/** Maps every repository command in `text` to untell's. Returns the text and how many it changed. */
export function mapLabCommands(text: string): { text: string; count: number } {
  let count = 0;
  for (const [re, to] of LAB_COMMANDS) text = text.replace(re, (...m) => { count++; return to.replace("$1", String(m[1] ?? "")); });
  return { text, count };
}

/** The repository commands that are left in `text`: "bun scripts/..." or "python3 scripts/...". */
export const labCommandsIn = (text: string) => [...new Set([...text.matchAll(/\b(?:bun|python3) scripts\/[\w/.-]+/g)].map((m) => m[0]))];
