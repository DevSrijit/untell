// The check and snap agree: every snap id a check finding names exists in `snap --at <the finding's time>`.
// For each film it reads out/detector/<id>/align.json (the check's align pass) and runs the snap CLI at each time that
// a finding at warning or error names a fix. Prints each missing id; exits 1 when any is missing.
// Usage: bun scripts/snap/parity.ts --films <module> <film id> [film id ...]
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dir, "..", "..");
const args = process.argv.slice(2);
const films = args[args.indexOf("--films") + 1]!;
const ids = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--films");
let missing = 0, checked = 0, stale = 0;
for (const id of ids) {
  const issues: { fix?: string; at: number; level: string; preview?: string }[] = JSON.parse(readFileSync(join(ROOT, "out/detector", id, "align.json"), "utf8")).issues;
  const by = new Map<string, Set<string>>();
  for (const i of issues) if (i.fix && i.level !== "advice") { const t = i.at.toFixed(2); if (!by.has(t)) by.set(t, new Set()); by.get(t)!.add(i.fix); }
  for (const [t, fixes] of by) {
    const r = spawnSync("bun", [join(ROOT, "scripts/snap/cli.ts"), id, "--films", films, "--at", t, "--json", "--out", join(ROOT, "out/snap/parity", id)], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
    const j = JSON.parse(r.stdout);
    const have = new Set(j.proposals.map((p: { id: string }) => p.id));
    // The check's capture no longer matches what the renderer draws (a block changed after the check ran): snap says
    // so and reads its own capture. That is a stale check, not a wrong id: run the check again.
    if (String(j.source).includes("older")) { stale += fixes.size; console.log(`${id} at ${t} s: the check's capture is older than the renderer; run the check again (${[...fixes].join(" ")})`); continue; }
    for (const f of fixes) { checked++; if (!have.has(f)) { missing++; console.log(`${id} at ${t} s: the check names ${f}; snap has ${[...have].join(" ") || "no proposal"}`); } }
  }
}
console.log(`${checked} id(s) named by findings; ${missing} missing in snap${stale ? `; ${stale} from a stale check capture` : ""}`);
process.exit(missing ? 1 : stale ? 3 : 0);
