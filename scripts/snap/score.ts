// Scores the alignment model against a person's verdicts (out/snap/survey/judged.json).
//
// A verdict is one of: real (a designer would fix it), designed (an offset the system or the block intends),
// false (the model read a relation that is not there), measure (the px value is wrong). Only "real" is a true finding.
// Precision of a set of rows = real / judged rows in it. Rows without a verdict are counted apart ("unjudged").
// Recall: each real verdict must still be reported at warning or error; a real miss that falls to advice or that the
// model no longer reports is listed.
// Counts are raw (one row per film) and unique (one per scene, ids and class: a scene in four systems is one decision).
import { readFileSync } from "node:fs";
import type { Row } from "./judge";

export type Verdict = "real" | "designed" | "false" | "measure";
export type Label = { key: string; film: string; verdict: Verdict; why: string; px?: number; level0?: string; cls0?: string; t?: number; unsure?: boolean };

const SYSTEMS = "studio spec manual ma primary riso cutout mark raw pop keynote graphite console noir title matte kinetic courtside schematic nocturne".split(" ");
/** The scene of a film: its id without the system and the "-wide" cut. */
export const sceneOf = (film: string) => {
  if (film.startsWith("reel-")) return film;
  const parts = film.split("-").filter((p) => p !== "wide");
  if (SYSTEMS.includes(parts.at(-1)!)) parts.pop();
  return parts.join("-");
};
export const keyOf = (r: Pick<Row, "film" | "kind" | "el" | "feature" | "target" | "axis">) => `${r.film}|${r.kind}|${r.el}|${r.feature}|${r.target.el}|${r.target.feature}|${r.axis}`;
const pairOf = (k: string) => { const p = k.split("|"); return { film: p[0]!, kind: p[1]!, el: p[2]!, feature: p[3]!, tel: p[4]!, tfeature: p[5]!, axis: p[6]! }; };

/** The label for a row: the exact key, or the same film, axis and pair of elements (either order). */
export function labelFor(r: Row, labels: Map<string, Label>, byPair: Map<string, Label>): Label | undefined {
  return labels.get(keyOf(r)) ?? byPair.get(`${r.film}|${r.axis}|${[r.el, r.target.el].sort().join("~")}|${r.kind === "half-px" ? "h" : r.kind === "rhythm" ? "r" : "a"}`);
}

export const checkOf = (r: { kind: string }) => ({ centre: "align/centre", edge: "align/near-miss", baseline: "align/baseline", rhythm: "align/rhythm", "half-px": "align/half-px" } as Record<string, string>)[r.kind] ?? r.kind;

export function loadLabels(file: string) {
  const list: Label[] = JSON.parse(readFileSync(file, "utf8"));
  const labels = new Map(list.map((l) => [l.key, l]));
  const byPair = new Map<string, Label>();
  for (const l of list) {
    const p = pairOf(l.key);
    byPair.set(`${p.film}|${p.axis}|${[p.el, p.tel].sort().join("~")}|${p.kind === "half-px" ? "h" : p.kind === "rhythm" ? "r" : "a"}`, l);
  }
  return { list, labels, byPair };
}

type Tally = { real: number; designed: number; false: number; measure: number; unjudged: number; unsure: number };
const empty = (): Tally => ({ real: 0, designed: 0, false: 0, measure: 0, unjudged: 0, unsure: 0 });
const prec = (t: Tally) => { const j = t.real + t.designed + t.false + t.measure; return j ? t.real / j : NaN; };
const fmt = (t: Tally) => { const j = t.real + t.designed + t.false + t.measure; return `${j ? `${(100 * prec(t)).toFixed(0)}%`.padStart(4) : "  - "} ${String(t.real).padStart(3)}/${String(j).padEnd(3)}${t.unsure ? ` (+${t.unsure} unsure)` : ""}${t.unjudged ? ` (+${t.unjudged} unjudged)` : ""}`; };

export function tallies(rows: Row[], file: string) {
  const { list, labels, byPair } = loadLabels(file);
  const live = rows.filter((r) => !r.ignored);
  const out = { byCheck: {} as Record<string, Record<string, Tally>>, byClass: {} as Record<string, Record<string, Tally>>, uniq: {} as Record<string, Record<string, Tally>>, missed: [] as { label: Label; now: string }[], unjudged: [] as Row[] };
  const add = (m: Record<string, Record<string, Tally>>, k: string, level: string, v: Verdict | undefined) => {
    m[k] ??= {}; m[k]![level] ??= empty();
    m[k]![level]![v ?? "unjudged"]++;
  };
  const seenU = new Set<string>();
  for (const r of live) {
    if (r.level === "advice") continue;
    const l = labelFor(r, labels, byPair);
    const cls = (r as Row & { cls?: string }).cls ?? "-";
    add(out.byCheck, checkOf(r), r.level, l?.verdict);
    add(out.byCheck, "all", r.level, l?.verdict);
    add(out.byClass, `${checkOf(r)} ${cls}`, r.level, l?.verdict);
    const u = `${sceneOf(r.film)}|${r.kind}|${[r.el, r.target.el].sort().join("~")}|${r.axis}|${cls}`;
    if (!seenU.has(u)) { seenU.add(u); add(out.uniq, checkOf(r), r.level, l?.verdict); add(out.uniq, "all", r.level, l?.verdict); }
    if (!l) out.unjudged.push(r);
  }
  // Recall: every real verdict.
  const found = new Map<Label, Row>();
  for (const r of live) { const l = labelFor(r, labels, byPair); if (l && (!found.has(l) || rank(r.level) > rank(found.get(l)!.level))) found.set(l, r); }
  // A real miss the model reported at warning or error before tuning must still be reported at warning or error.
  for (const l of list.filter((x) => x.verdict === "real" && x.level0 !== "advice")) {
    const r = found.get(l);
    if (!r || r.level === "advice") out.missed.push({ label: l, now: r ? `advice ${r.confidence}` : "not reported" });
  }
  return out;
}
const rank = (l: string) => (l === "error" ? 2 : l === "warning" ? 1 : 0);

export function score(issuesFile: string, labelsFile: string, json = false) {
  const rows: Row[] = JSON.parse(readFileSync(issuesFile, "utf8"));
  const t = tallies(rows, labelsFile);
  if (json) { console.log(JSON.stringify(t, null, 1)); return t; }
  const table = (title: string, m: Record<string, Record<string, Tally>>) => {
    console.log(`\n${title}\n${"".padEnd(34)} error              warning`);
    for (const k of Object.keys(m).sort()) console.log(`${k.padEnd(34)} ${fmt(m[k]!.error ?? empty()).padEnd(18)} ${fmt(m[k]!.warning ?? empty())}`);
  };
  table("precision by check (raw rows)", t.byCheck);
  table("precision by check (unique: scene, ids, class)", t.uniq);
  table("precision by class (raw rows)", t.byClass);
  console.log(`\nreal misses no longer at warning or error: ${t.missed.length}`);
  for (const m of t.missed) console.log(`  ${m.label.key}  (${m.now})  ${m.label.why}`);
  console.log(`unjudged rows at warning or error: ${t.unjudged.length}`);
  return t;
}
