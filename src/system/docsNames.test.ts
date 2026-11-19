// An agent's case: the installed docs showed `reveal` for title and endCard where the block wants
// `enter`. Every doc an agent reads (systems/BLOCKS.md, each SYSTEM.md block map, the playbooks) and every example scene
// uses only the current prop names: no old name from the guard's OLD_NAMES in a call or a block map row of its block.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { OLD_NAMES } from "./scene/blocks/guard";

const ROOT = resolve(import.meta.dir, "../..");
const files = (dir: string, ext: RegExp): string[] => readdirSync(join(ROOT, dir)).flatMap((f) => {
  const p = join(dir, f);
  return statSync(join(ROOT, p)).isDirectory() ? files(p, ext) : ext.test(f) ? [p] : [];
});

test("docs and examples use only current prop names", () => {
  const off: string[] = [];
  const docs = [...files("systems", /\.md$/), ...files("examples/scenes", /\.ts$/)];
  for (const f of docs) {
    const text = readFileSync(join(ROOT, f), "utf8");
    for (const [block, pairs] of Object.entries(OLD_NAMES)) {
      for (const [old, now] of pairs) {
        // quote's old `role` is the speaker's job, and `role` is a type role in quote today: not checkable by name.
        if (block === "quote" && old === "role") continue;
        // A call: block({ ... old: ... }) on one line.
        const call = new RegExp(`\\b${block}\\(\\{[^\\n]*?\\b${old}\\??\\s*:`, "g");
        // A block map row: | \`block\` | ... \`old\`: ... |
        const row = new RegExp(`^\\|\\s*\`${block}\`\\s*\\|[^\\n]*\`${old}\`:`, "gm");
        for (const m of [...text.matchAll(call), ...text.matchAll(row)]) off.push(`${f}: ${block} uses "${old}" (now "${now}"): ${m[0].slice(0, 80)}`);
      }
    }
  }
  expect(off).toEqual([]);
});
