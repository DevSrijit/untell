// `untell systems`: the 20 systems with mode, use and personality, read from the tokens.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { systemsDir } from "./build";

export type SystemRow = { id: string; name: string; mode: string; use: string[]; personality: string; grain: boolean; from?: string | null; own?: boolean };

export function listSystems(dir: string): SystemRow[] {
  return readdirSync(dir).filter((d) => existsSync(join(dir, d, "tokens.json"))).sort().map((d) => {
    const t = JSON.parse(readFileSync(join(dir, d, "tokens.json"), "utf8")) as { id: string; name: string; mode: string; kinds: string[]; personality: string; allows: string[]; texture: { grain: number }; own?: { from: string | null } };
    return { id: t.id, name: t.name, mode: t.mode, use: t.kinds, personality: t.personality, grain: t.allows.includes("grain") && t.texture.grain > 0, ...(t.own ? { own: true, from: t.own.from } : {}) };
  });
}

export function printSystems(project: string, log: (s: string) => void = console.log) {
  const dir = systemsDir(project);
  const rows = listSystems(dir);
  const w = Math.max(...rows.map((r) => r.id.length));
  for (const mode of ["light", "dark"]) {
    log(`${mode}:`);
    for (const r of rows.filter((x) => x.mode === mode && !x.own)) log(`  ${r.id.padEnd(w)}  ${r.use.join(", ")}\n  ${" ".repeat(w)}  ${r.personality}`);
  }
  const own = rows.filter((x) => x.own);
  if (own.length) {
    log("yours (untell system check validates them):");
    for (const r of own) log(`  ${r.id.padEnd(w)}  ${r.mode}${r.from ? `, a copy of ${r.from}` : ""}: ${r.use.join(", ")}\n  ${" ".repeat(w)}  ${r.personality}`);
  }
  log(`\n${rows.length - own.length} built-in systems${own.length ? ` and ${own.length} of yours` : ""}. How to choose: ${join(dir, "README.md")}`);
}
