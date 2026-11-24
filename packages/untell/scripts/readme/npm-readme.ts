#!/usr/bin/env bun
// Writes packages/untell/README.md (the npm page) from the repository's README.md. npm shows the README away from the
// repository, so every picture and every link becomes absolute: pictures from raw.githubusercontent.com, links to
// github.com. The text is the same, so the two pages never drift.
//
// Usage: bun packages/untell/scripts/readme/npm-readme.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../../..");
const REPO = "devsrijit/untell";
const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
const BLOB = `https://github.com/${REPO}/blob/main/`;

let md = readFileSync(join(ROOT, "README.md"), "utf8");
// Pictures: src="docs/assets/..." and srcset="docs/assets/...".
md = md.replace(/(src|srcset)="(?!https?:)([^"]+)"/g, (_m, a, p) => `${a}="${RAW}${p}"`);
// Links: Markdown links and href attributes that are relative.
md = md.replace(/\]\((?!https?:|#)([^)]+)\)/g, (_m, p) => `](${BLOB}${p})`);
md = md.replace(/href="(?!https?:|#)([^"]+)"/g, (_m, p) => `href="${BLOB}${p}"`);
md = md.replace(/^(<h1[^>]*>untell<\/h1>)/m, `<!-- Written by packages/untell/scripts/readme/npm-readme.ts from the repository's README.md. Edit that file. -->\n$1`);
writeFileSync(join(ROOT, "packages/untell/README.md"), md);
const left = [...md.matchAll(/(?:src|srcset|href)="(?!https?:)[^"]+"|\]\((?!https?:|#)[^)]+\)/g)].map((m) => m[0]);
if (left.length) throw new Error(`relative links left: ${left.join(", ")}`);
console.log("wrote packages/untell/README.md");
