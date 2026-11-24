// Pack-time guards. The pack script runs them on everything it ships, and the unit tests run them on samples.
// This file is not part of dist/cli.js: the names it looks for must never ship in the package.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { walk } from "../src/kit";

/**
 * Media sources that untell must never name, suggest or ban. untell states formats and parameters only.
 * The list is in pieces, so a search of the package for a name finds no hit in this file's own text.
 */
let SOURCES: string[] = [];
/** True when the list is in this copy (the public repository keeps no names, so its pack skips this guard). */
export const HAS_SOURCE_NAMES = SOURCES.length > 0;
const SOURCE_RE = HAS_SOURCE_NAMES ? new RegExp(`\\b(${SOURCES.join("|")})\\b`, "i") : /(?!)/;

/** Files that are text, so the guards read them. Fonts, images and models are binary. */
const TEXT = /\.(ts|tsx|js|mjs|cjs|py|md|json|css|html|txt|sh)$/i;

export type Hit = { file: string; line: number; text: string };

/** Every line of `text` that names a media source. */
export function sourceHits(text: string, file = ""): Hit[] {
  return text.split("\n").flatMap((l, i) => (SOURCE_RE.test(l) ? [{ file, line: i + 1, text: l.trim().slice(0, 160) }] : []));
}

/** Every line of `text` that loads essentia (AGPL): a Python import or a JavaScript import or require. */
export function essentiaHits(text: string, file = ""): Hit[] {
  const re = /^\s*(import\s+essentia\b|from\s+essentia\b)|\b(require\s*\(\s*["']essentia[^"']*["']\s*\)|from\s+["']essentia[^"']*["']|import\s*\(\s*["']essentia)|__import__\(\s*["']essentia/;
  return text.split("\n").flatMap((l, i) => (re.test(l) ? [{ file, line: i + 1, text: l.trim().slice(0, 160) }] : []));
}

/**
 * Every line that names this machine or the repository: a home folder path, the repository's folder names, the author's machine user
 * name. A shipped file must find its files at run time and name no one's machine.
 */
const MACHINE = ["/Users/", "/home/[a-z]"];
export function machineHits(text: string, file = ""): Hit[] {
  const re = new RegExp(MACHINE.join("|"), "i");
  return text.split("\n").flatMap((l, i) => (re.test(l) ? [{ file, line: i + 1, text: l.trim().slice(0, 160) }] : []));
}

/** Runs a guard over every text file under each root. Fonts and other binary files are skipped. */
export function scanTree(roots: string[], guard: (text: string, file: string) => Hit[]): Hit[] {
  return roots.flatMap((root) => walk(root).filter((f) => TEXT.test(f)).flatMap((f) => guard(readFileSync(join(root, f), "utf8"), join(root, f))));
}

/** One `untell ...` command that a document names: the words and flags after `untell`. */
export type Named = { file: string; line: number; words: string[]; flags: string[]; text: string };

/**
 * The untell commands that a Markdown document names. It reads only code: inline code spans, fenced blocks
 * and Mermaid node labels. Prose such as "untell does not find media" is not a command.
 */
export function namedCommands(md: string, file = ""): Named[] {
  const out: Named[] = [];
  const lines = md.split("\n");
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) { fence = !fence; return; }
    const pieces = fence ? [l] : [...l.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    for (const piece of pieces) {
      for (const m of piece.matchAll(/(?:^|[\s{(|>"])(?:npx\s+)?untell\s+([a-z][\w-]*(?:[ \t]+(?:--[\w-]+|<[^>]+>|"[^"]*"|\[[^\]]*\]|[\w.~\/*-][^\s`{}|]*))*)/g)) {
        const toks = m[1]!.split(/\s+/);
        const words: string[] = [], flags: string[] = [];
        for (const t of toks) {
          if (t.startsWith("--")) flags.push(t);
          else if (/^[a-z][\w-]*$/.test(t) && !flags.length && words.length < 2) words.push(t);
        }
        out.push({ file, line: i + 1, words, flags, text: m[0].trim() });
      }
    }
  });
  return out;
}

/** The command table that the check uses: each command, its subcommands and its flags. */
export type CommandTable = Record<string, { subs?: Record<string, string[]>; flags: string[] }>;

/** The named commands that the CLI does not have: an unknown command, subcommand or flag. */
export function unknownCommands(named: Named[], table: CommandTable): (Named & { why: string })[] {
  const bad: (Named & { why: string })[] = [];
  for (const n of named) {
    const [cmd, sub] = n.words;
    const c = cmd ? table[cmd] : undefined;
    if (!c) { bad.push({ ...n, why: `no command "${cmd ?? ""}"` }); continue; }
    let flags = c.flags;
    if (c.subs && sub && c.subs[sub]) flags = [...flags, ...c.subs[sub]!];
    else if (c.subs && sub && !/^[a-z]+$/.test(sub)) { /* a value, such as a file name */ }
    else if (c.subs && sub && !c.subs[sub] && Object.keys(c.subs).length) {
      // A word after a command with subcommands must be one of them, unless the command takes a free value.
      if (!c.subs["*"]) { bad.push({ ...n, why: `no subcommand "${cmd} ${sub}"` }); continue; }
    }
    for (const f of n.flags) if (!flags.includes(f)) bad.push({ ...n, why: `no flag ${f} for "${cmd}${c.subs && sub && c.subs[sub] ? ` ${sub}` : ""}"` });
  }
  return bad;
}
