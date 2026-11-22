// untell snap: alignment proposals as a diff, previews, and accepted moves written into the scene.
//
// Usage:
//   bun scripts/snap/cli.ts <film id> --films <module> [--at <seconds>] [--json] [--all]
//   bun scripts/snap/cli.ts <film id> --films <module> --preview [ids|all]
//   bun scripts/snap/cli.ts <film id> --films <module> --apply <ids|all> [--scene <file>]
//   bun scripts/snap/cli.ts <film id> --films <module> --unapply <ids|all> [--scene <file>]
//
// It reads the film at one moment of rest (the --at time, or the frame where the most elements show and rest),
// finds the lines a designer sees, and prints each near miss that a move can fix as a hunk: the node and block
// call that move, the feature, from and to in px, the line it joins and who is on it, why, and the confidence.
// It never moves anything by default.
//   --preview  draws the frame before and after the chosen moves (the real renderer draws the moved nodes), an
//              overlay with the guide lines, each miss in red with its offset and each move as an arrow, zoomed crops
//              of the misses, and a strip with one before | after crop for each hunk. Files: out/snap/<film>/.
//   --apply    writes the chosen hunks into the scene source as a snap table (`SNAPS`, applied by withSnap from
//              src/system/scene/align.ts). Each entry is a relation to another node, not a number, so it stays
//              right when the content changes. The change shows in the scene's diff; --unapply removes it.
//   --all      also lists the issues without a proposal (advice, ignored, or no safe move).
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { analyse, movesOf, type Analysis, type Proposal, type SnapRel } from "../../src/system/scene/align";
import { capture, closeBrowser, type Capture } from "./capture";
import { declarationLines, filmGuides, frameFromCapture, frameFromDetector, ignoresIn, sourcesOf } from "./frame";

const ROOT = resolve(import.meta.dir, "..", "..");
const args = process.argv.slice(2);
const opt = (k: string) => (args.indexOf(k) >= 0 ? args[args.indexOf(k) + 1] : undefined);
const flag = (k: string) => args.includes(k);
const VALUED = ["--films", "--at", "--scene", "--out"];
// --preview, --apply and --unapply take hunk ids: separated by commas, by spaces, or both ("all" for every hunk).
const LISTS = ["--preview", "--apply", "--unapply"];
const listOf = (k: string): string | undefined => {
  const i = args.indexOf(k);
  if (i < 0) return undefined;
  const vals: string[] = [];
  for (let j = i + 1; j < args.length && !args[j]!.startsWith("--"); j++) vals.push(args[j]!);
  return vals.join(",").split(/[,\s]+/).filter(Boolean).join(",");
};
const inList = (i: number) => { for (let j = i - 1; j >= 0; j--) { if (LISTS.includes(args[j]!)) return true; if (args[j]!.startsWith("--")) return false; } return false; };
if (flag("--help") || flag("-h")) {
  console.log(`untell snap: alignment proposals as a diff. Nothing moves until you apply.

  bun scripts/snap/cli.ts <film id> --films <module> [--at <seconds>] [--json] [--all]
  bun scripts/snap/cli.ts <film id> --films <module> [--at <seconds>] --preview [ids|all]
  bun scripts/snap/cli.ts <film id> --films <module> [--at <seconds>] --apply <ids|all> [--scene <file>]
  bun scripts/snap/cli.ts <film id> --films <module> --unapply <ids|all> [--scene <file>]

Ids: one or more hunk ids, separated by commas or spaces (--preview e-omogd,c-2hite or --preview e-omogd c-2hite),
or "all". A hunk that needs another one brings it along. An unknown id prints the ids that exist at that time.
--at: the time in seconds (a check finding gives it). Without it, snap reads the frame where the most elements rest.`);
  process.exit(0);
}
const id = args.find((a, i) => !a.startsWith("--") && !VALUED.includes(args[i - 1]!) && !LISTS.includes(args[i - 1]!) && !inList(i));
const films = opt("--films");
if (!id || !films) {
  console.error("usage: bun scripts/snap/cli.ts <film id> --films <module> [--at <seconds>] [--json] [--all] [--preview [ids|all]] [--apply <ids|all>] [--unapply <ids|all>]");
  process.exit(2);
}
const mod = resolve(films);
const out = resolve(opt("--out") ?? join(ROOT, "out", "snap", id));
mkdirSync(out, { recursive: true });
const json = flag("--json");
const log = (...m: unknown[]) => (json ? console.error(...m) : console.log(...m));
const previewArg = flag("--preview") ? listOf("--preview") || "all" : null;
const applyArg = listOf("--apply"), unapplyArg = listOf("--unapply");

// ---------- 1. The moment of rest ----------

const meta = await capture(mod, id, [0]);
const fps = meta.fps, n = meta.durationInFrames;
let frame: number;
if (opt("--at") !== undefined) frame = Math.min(n - 1, Math.max(2, Math.round(Number(opt("--at")) * fps)));
else {
  // The frame where the most elements are fully visible and still (each against the frame before, as the check reads
  // them), the later on a tie.
  const step = Math.max(1, Math.round(fps / 2));
  const cands = Array.from({ length: Math.floor((n - 1) / step) }, (_, i) => (i + 1) * step).concat([n - 1]).filter((f) => f >= 2);
  const sample = await capture(mod, id, cands.flatMap((f) => [f - 1, f]));
  let best = cands[0]!, score = -1;
  for (const f of cands) {
    const s = frameFromCapture(sample, f, f - 1).els.length;
    if (s >= score) { score = s; best = f; }
  }
  frame = best;
}
const files = sourcesOf(mod, id);
const ignores = ignoresIn(files);
const before = join(out, "before.png");
const cap: Capture = await capture(mod, id, [frame - 1, frame], { shots: { [frame]: before } });
writeFileSync(join(out, "capture.json"), JSON.stringify(cap));
const guides = await filmGuides(mod, id, cap);
// The frame the model reads. A check finding names snap ids: snap must read the same frame from the same capture, so
// when the detector's capture of this film is fresh (newer than every source file), snap reads it, as the check's
// align pass does (scripts/snap/detect_align.ts: the recording's elements, rest against the frame before). Else it
// reads its own capture with the same rest rule. Ids are a hash of the issue (kind, node, feature, target, axis), so
// the same frame gives the same ids in both.
const detDir = join(process.env.UNTELL_DET_OUT ?? join(ROOT, "out", "detector"), id), recDir = join(process.env.UNTELL_REC_OUT ?? join(ROOT, "out", "recordings"), id);
const fresh = (() => {
  const c = join(detDir, "capture.json"), e = join(recDir, "elements.json");
  if (!existsSync(c) || !existsSync(e)) return false;
  const t = Math.min(statSync(c).mtimeMs, statSync(e).mtimeMs);
  return files.every((f) => !existsSync(f) || statSync(f).mtimeMs <= t);
})();
const frSnap = frameFromCapture(cap, frame, frame - 1, ignores, guides);
const frCheck = fresh ? frameFromDetector(JSON.parse(readFileSync(join(detDir, "capture.json"), "utf8")), JSON.parse(readFileSync(join(recDir, "elements.json"), "utf8")), frame, ignores, guides) : null;
// The check's capture must still show what the renderer draws now: a block or a kit change does not touch the scene's
// files. When a box the two captures share differs by over 0.5 px, the check's capture is old: snap reads its own.
const agrees = ((): boolean | null => {
  if (!frCheck) return null;
  const mine = new Map(frSnap.els.map((e) => [e.id, e.box]));
  let shared = 0;
  for (const e of frCheck.els) {
    const b = mine.get(e.id);
    if (!b || (e.kind !== "rect" && e.kind !== "image")) continue;
    shared++;
    if (Math.abs(b.x0 - e.box.x0) > 0.5 || Math.abs(b.y0 - e.box.y0) > 0.5 || Math.abs(b.x1 - e.box.x1) > 0.5 || Math.abs(b.y1 - e.box.y1) > 0.5) return false;
  }
  return shared > 0 ? true : null;
})();
const source = agrees === false ? "snap's own capture (the check's capture is older than what the renderer draws now: run the check again so its ids match)"
  : frCheck ? "the check's capture" : "snap's own capture";
// Read the check's frame unless a box the two share disagrees: snap's own page can miss what loads late (a 3D canvas,
// a picture), and then it holds fewer elements than the check saw (an agent's Matte film at 11.5 s).
const fr = agrees === false ? frSnap : frCheck ?? frSnap;
const A: Analysis = analyse(fr);
writeFileSync(join(out, "analysis.json"), JSON.stringify({ film: id, module: relative(ROOT, mod), frame, t: frame / fps, width: cap.width, height: cap.height, system: cap.system, frameEls: fr.els, guides, source, ...A }, null, 1));

// ---------- 2. The diff ----------

const T = (frame / fps).toFixed(2);
// The scene file: --scene, or the imported module whose name best matches the film id.
const GENERIC = new Set(["align", "block", "blocks", "reel", "det", "wide", "live", "frozen", "spec", "graphite", "pop", "console", "studio", "bad", "good", "show"]);
const tokens = id.toLowerCase().split(/[-_]/).filter((t) => t.length > 1 && !GENERIC.has(t));
const scored = files.filter((f) => f !== mod).map((f) => ({ f, s: tokens.filter((t) => f.toLowerCase().split("/").pop()!.replace(/\.tsx?$/, "").includes(t)).length }))
  // On a tie, the shorter name (kilnQueue over kilnQueueSnapped for align-kiln).
  .sort((a, b) => b.s - a.s || a.f.length - b.f.length);
const sceneFile = opt("--scene") ? resolve(opt("--scene")!) : scored.length === 1 ? scored[0]!.f : scored[0] && scored[0].s > 0 && (scored[0].s > (scored[1]?.s ?? 0) || scored[0].f.length < scored[1]!.f.length) ? scored[0].f : null;
const cmd = (more: string) => `bun scripts/snap/cli.ts ${id} --films ${relative(ROOT, mod)}${opt("--at") ? ` --at ${opt("--at")}` : ""} ${more}`;
const nodesLabel = (p: Proposal) => (p.group.endsWith("-*") ? `block ${p.group.slice(0, -2)} (${p.nodes.length} nodes)` : p.nodes.length === 1 ? p.nodes[0] : `${p.group} (${p.nodes.length} nodes)`);
const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const hunk = (p: Proposal) => {
  const axisWord = p.axis === "y" ? "y" : "x";
  const on = p.joins.on.filter((e) => e !== p.joins.el);
  return [
    `@@ ${p.id}  ${p.kind}  ${p.level} ${p.confidence.toFixed(2)}  move ${nodesLabel(p)} ${axisWord} ${sign(p.delta)} px @@`,
    `- ${p.el}  ${p.feature}  ${axisWord} ${p.from}`,
    `+ ${p.el}  ${p.feature}  ${axisWord} ${p.to}   joins ${p.joins.el} ${p.joins.feature}${on.length ? ` (also on it: ${on.slice(0, 4).join(", ")}${on.length > 4 ? ", ..." : ""})` : ""}`,
    `  why: ${p.why}`,
    ...(p.issuesBefore !== undefined ? [`  issues before ${p.issuesBefore}, after ${p.issuesAfter} (this hunk with what it needs; a hunk that leaves no fewer issues is not shown)`] : []),
    ...(p.alt ? [`  alt: move ${p.alt.group} ${axisWord} ${sign(p.alt.delta)} px instead; ${p.alt.why}.`] : []),
    ...(p.needs?.length ? [`  needs: ${p.needs.join(", ")} (applied with it)`] : []),
    ...(p.dependants?.length ? [`  note: ${p.dependants.join(", ")} sit in the moved box and do not follow a snap; check them after.`] : []),
  ].join("\n");
};

/**
 * Hunks that share one cause, for the summary at the top. Two causes:
 *   - one kind of move on many texts the same way (text placed by its line box): fix where text is placed;
 *   - one block call whose parts need like moves (its numbered copies: row0-badge, row1-badge, row2-badge): fix the
 *     block's prop or its code once, not one snap per copy.
 * Each line says what to do and lists the hunk ids.
 */
function patterns(ps: Proposal[]) {
  const out: string[] = [];
  const used = new Set<string>();
  const sideWord = (p: Proposal) => (p.axis === "y" ? (p.delta > 0 ? "rides high" : "sits low") : p.delta > 0 ? "sits left" : "sits right");
  const range = (g: Proposal[]) => { const d = g.map((p) => Math.abs(p.delta)); return Math.min(...d) === Math.max(...d) ? `${d[0]} px` : `${Math.min(...d)}-${Math.max(...d)} px`; };
  // 1. Text placed by its line box: many texts ride high (or sit low) by a few px, in any block. One cause.
  const text = ps.filter((p) => (p.feature.startsWith("band") || p.feature === "baseline") && p.axis === "y");
  for (const sgn of [1, -1]) {
    const g = text.filter((p) => Math.sign(p.delta) === sgn);
    if (g.length < 3) continue;
    const blocks = [...new Set(g.map((p) => p.el.split("-")[0]!.replace(/\d+$/, "")))];
    out.push(`${g.length} hunks share one cause: text ${sideWord(g[0]!)} by ${range(g)} (text placed by its line box, not its ink), in ${blocks.join(", ")}.`
      + ` Fix where the text is placed, in the block that draws it: centre its cap band (baseline to cap line) in its box with layout.centreInk.`
      + ` Then run snap again. Do not accept ${g.length} snaps for one fault.\n  ${g.map((p) => p.id).join(" ")}`);
    for (const p of g) used.add(p.id);
  }
  // 2. A block's copies: the same role (the id with its numbers as #) and the same move.
  const byRole = new Map<string, Proposal[]>();
  for (const p of ps) {
    if (used.has(p.id)) continue;
    const k = `${p.el.replace(/\d+/g, "#")}|${p.kind}|${p.feature}|${p.axis}|${Math.sign(p.delta)}`;
    if (!byRole.has(k)) byRole.set(k, []);
    byRole.get(k)!.push(p);
  }
  for (const g of byRole.values()) {
    if (g.length < 2) continue;
    const block = g[0]!.el.split("-")[0]!.replace(/\d+$/, "");
    const role = g[0]!.el.replace(/\d+/g, "#");
    out.push(`${g.length} hunks share one cause in the block that draws ${role}: its ${g[0]!.feature} ${sideWord(g[0]!)} by ${range(g)} in each copy.`
      + ` Fix the block once (the prop or the code that places ${role.split("-").slice(1).join("-") || role} in ${block}), then run snap again. Do not accept ${g.length} snaps for one fault.`
      + `\n  ${g.map((p) => p.id).join(" ")}`);
  }
  return out;
}

if (json && !previewArg && !applyArg && !unapplyArg) {
  console.log(JSON.stringify({ film: id, frame, t: Number(T), source, tol: A.tol, proposals: A.proposals, issues: A.issues }, null, 1));
} else if (!applyArg && !unapplyArg) {
  const e = A.proposals.filter((p) => p.level === "error").length;
  log(`untell snap ${id} (${cap.system ?? "no system"}, ${cap.width}x${cap.height}) at ${T} s: ${A.proposals.length} proposal(s), ${e} error(s); tolerance ${A.tol} px; ${fr.els.length} elements at rest`);
  log(`scene: ${sceneFile ? relative(ROOT, sceneFile) : "not known (pass --scene <file> to apply)"}; frame ${frame} read from ${source}\n`);
  // The declarations, as the check pass prints them (scripts/snap/detect_align.ts), for this one frame.
  const decl = declarationLines(ignores, A.issues.map((i) => ({ ...i, t0: frame / fps, t1: frame / fps })));
  if (decl.length) log(`${decl.join("\n")}\n`);
  // The summary comes first: when many hunks share one cause, the fix is in the block, not in the hunks.
  const pats = patterns(A.proposals);
  if (pats.length) log(`Summary (read this first):\n${pats.map((x) => `- ${x}`).join("\n")}\n`);
  for (const p of A.proposals) log(hunk(p) + "\n");
  const rest = A.issues.filter((i) => !i.fix && (flag("--all") ? true : i.level !== "advice"));
  if (rest.length) {
    log(`${rest.length} issue(s) without a proposal${flag("--all") ? "" : " (--all lists the advice too)"}:`);
    for (const i of rest) log(`  ${i.level.padEnd(7)} ${i.kind.padEnd(8)} ${i.el} ${i.feature} ${i.axis} ${i.v} -> ${i.target.el} ${i.target.feature} ${i.to} (${sign(i.off)} px)${i.ignored ? `  ignored: ${i.ignored}` : ""}\n          ${i.why}`);
    log("");
  }
  if (A.proposals.length) log(`preview: ${cmd("--preview all")}\napply:   ${cmd("--apply <ids|all>")}   (nothing moves until you apply)`);
}

// ---------- 3. Preview ----------

/** The chosen proposals, with every proposal they build on (needs), in the solver's order. */
const pick = (sel: string) => {
  if (sel === "all") return A.proposals;
  const want = new Set(sel.split(/[,\s]+/).filter(Boolean));
  for (let grew = true; grew;) {
    grew = false;
    for (const p of A.proposals) if (want.has(p.id)) for (const n of p.needs ?? []) if (!want.has(n)) { want.add(n); grew = true; if (!json) console.log(`snap: ${p.id} needs ${n}; it is added`); }
  }
  const unknown = [...want].filter((x) => !A.proposals.some((p) => p.id === x));
  if (unknown.length) {
    console.error(`snap: no proposal ${unknown.join(", ")} at ${T} s. ${A.proposals.length ? `The proposals at ${T} s: ${A.proposals.map((p) => p.id).join(" ")}.` : `There is no proposal at ${T} s.`}`
      + ` (frame ${frame}, read from ${source}; give the --at of the finding.)`);
    process.exit(2);
  }
  return A.proposals.filter((p) => want.has(p.id));
};

if (previewArg) {
  const chosen = pick(previewArg);
  if (!chosen.length) { console.error(`snap: no proposal ${previewArg}`); process.exit(2); }
  const after = join(out, "after.png");
  const capAfter = await capture(mod, id, [frame - 1, frame], { moves: movesOf(chosen), shots: { [frame]: after } });
  // The model on the after frame: what is left, and what is new. Both frames come from snap's own capture, with one
  // rest rule, so a difference is the moves' and not the source's.
  const frAfter = frameFromCapture(capAfter, frame, frame - 1, ignores, guides);
  const B = analyse(frAfter);
  const Abefore = fr === frSnap ? A : analyse(frSnap);
  writeFileSync(join(out, "after.json"), JSON.stringify({ frameEls: frAfter.els, ...B }, null, 1));
  const r = spawnSync("python3", [join(ROOT, "scripts/snap/preview.py"), "--dir", out, "--ids", chosen.map((p) => p.id).join(",")], { encoding: "utf8" });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  log(r.stdout.trim());
  const leftover = B.issues.filter((i) => i.level !== "advice" && !i.ignored);
  // New: at warning or error after the moves, and not at warning or error before (the same kind, node, feature,
  // target and axis), on the same capture.
  const keyOf = (i: { kind: string; el: string; feature: string; target: { el: string; feature: string }; axis: string }) => `${i.kind}|${i.el}|${i.feature}|${i.target.el}|${i.target.feature}|${i.axis}`;
  const had = new Set(Abefore.issues.filter((i) => i.level !== "advice" && !i.ignored).map(keyOf));
  const made = leftover.filter((i) => !had.has(keyOf(i)));
  writeFileSync(join(out, "after-report.json"), JSON.stringify({ ids: chosen.map((p) => p.id), left: leftover.length, made }, null, 1));
  log(`issues before ${Abefore.issues.filter((i) => i.level !== "advice" && !i.ignored).length}, after ${leftover.length} (drawn by the renderer, the same model)`);
  log(`after ${chosen.length} move(s): ${leftover.length} issue(s) left at warning or error, ${made.length} new${made.length ? ": " + made.map((i) => `${i.kind} ${i.el} ${i.feature} ${sign(i.off)} px (${i.level})`).join("; ") : ""}`);
}

// ---------- 4. Apply and unapply ----------

const BEGIN = "// untell snap: accepted alignment moves";
const END = "// end untell snap";

function relImport(file: string) {
  let p = relative(dirname(file), join(ROOT, "src/system/scene/align")).replace(/\\/g, "/");
  if (!p.startsWith(".")) p = `./${p}`;
  return p;
}

/** The snap table in a scene source, or null. */
function readTable(src: string): SnapRel[] | null {
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a < 0 || b < 0) return null;
  const body = src.slice(a, b);
  const m = body.match(/export const SNAPS: SnapRel\[\] = (\[[\s\S]*?\n\]);/);
  return m ? JSON.parse(m[1]!.replace(/,\s*\]$/, "]")) : [];
}

function writeTable(file: string, table: SnapRel[]) {
  let src = readFileSync(file, "utf8");
  const has = readTable(src) !== null;
  if (has) src = src.slice(0, src.indexOf(BEGIN)).replace(/\n+$/, "\n") + src.slice(src.indexOf(END) + END.length).replace(/^\n/, "");
  if (!table.length) {
    // Undo every trace: the import and the renamed scene.
    src = src.replace(/\nimport \{ withSnap, type SnapRel \} from "[^"]+";/, "");
    src = src.replace(/(^|\n)const sceneBeforeSnap = /, "$1export const scene = ").replace(/(^|\n)function sceneBeforeSnap\(/, "$1export function scene(");
    writeFileSync(file, src);
    return;
  }
  if (!src.includes("sceneBeforeSnap")) {
    if (/(^|\n)export const scene = /.test(src)) src = src.replace(/(^|\n)export const scene = /, "$1const sceneBeforeSnap = ");
    else if (/(^|\n)export function scene\(/.test(src)) src = src.replace(/(^|\n)export function scene\(/, "$1function sceneBeforeSnap(");
    else throw new Error(`snap: ${relative(ROOT, file)} has no "export const scene =" or "export function scene(" to wrap; add the table by hand (see systems/playbooks/ALIGN.md)`);
    const imports = [...src.matchAll(/^import [^;]+;$/gm)];
    const at = imports.length ? imports.at(-1)!.index! + imports.at(-1)![0].length : 0;
    src = src.slice(0, at) + `\nimport { withSnap, type SnapRel } from "${relImport(file)}";` + src.slice(at);
  }
  const lines = table.map((r) => `  ${JSON.stringify(r)},`).join("\n");
  src = src.replace(/\n*$/, "\n") + `
${BEGIN} (bun scripts/snap/cli.ts --apply). Each entry moves its nodes so that
// one feature joins another node's feature: a relation, so it holds when the content changes. Remove an entry (or run
// --unapply <id>) to undo it.
export const SNAPS: SnapRel[] = [
${lines}
];
export const scene = withSnap(sceneBeforeSnap, SNAPS);
${END}
`;
  writeFileSync(file, src);
}

if (applyArg || unapplyArg) {
  if (!sceneFile || !existsSync(sceneFile)) { console.error(`snap: the scene file is not known; pass --scene <file> (one of: ${files.filter((f) => f !== mod).map((f) => relative(ROOT, f)).join(", ")})`); process.exit(2); }
  const src = readFileSync(sceneFile, "utf8");
  const table = readTable(src) ?? [];
  if (applyArg) {
    const chosen = pick(applyArg!);
    if (!chosen.length) { console.error(`snap: no proposal ${applyArg} (they come from the current frame; run snap without --apply to list them)`); process.exit(2); }
    const next = [...table.filter((r) => !chosen.some((p) => p.id === r.id)), ...chosen.map((p) => ({ ...p.rel, why: p.why.split(". ")[0]!.slice(0, 160) }))];
    writeTable(sceneFile, next);
    log(`applied ${chosen.length} hunk(s) to ${relative(ROOT, sceneFile)}: ${chosen.map((p) => p.id).join(" ")}\nthe table now holds ${next.length}; run snap again to see what is left, or --unapply <ids|all> to undo.`);
  } else {
    const sel = unapplyArg!;
    const next = sel === "all" ? [] : table.filter((r) => !sel.split(/[,\s]+/).includes(r.id));
    writeTable(sceneFile, next);
    log(`removed ${table.length - next.length} snap(s) from ${relative(ROOT, sceneFile)}; ${next.length} left.`);
  }
}

await closeBrowser();
