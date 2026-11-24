// `untell snap`: alignment proposals as a diff, previews, and accepted moves written into the scene.
// The repository's scripts/snap/cli.ts, on the page that untell check records (Remotion: the scene in Remotion's Player;
// HyperFrames: the kit's page), with a move list in its URL hash, so the "after" image of a preview is the real
// renderer's picture of the moved nodes. Nothing is painted over. When the check's capture of the film is current,
// snap reads the frame from it, so a finding's snap ids are the ids snap lists.
//
// It reads the film at one moment of rest, finds the lines a designer sees, and prints each near miss that a move can
// fix as a hunk. Nothing moves until you apply. --apply writes a snap table at the end of the scene module (SNAPS and
// withSnap from the kit's scene/align): each entry is a relation to another node, so it holds when the content changes.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { analyse, guidesOf, movesOf, type Analysis, type Move, type Proposal, type ResolvedGuides, type SnapRel } from "../registry/kit/scene/align";
import { frameFromCapture, frameFromDetector, ignoresIn } from "../../../scripts/snap/frame";
import type { Capture, CapEl, CapFrame } from "../../../scripts/snap/capture";
import { buildHf, launchChrome, loadSceneMeta, sceneExports } from "./build";
import { filmToCheck, isSceneModule, pageForFilm } from "./check";
import { detectFramework } from "./detect";
import { analysisPython } from "./env";
import { MissingToolError, UsageError } from "./errors";
import { KIT_DIR, registryDir } from "./kit";
import { mediaPaths } from "./media-paths";
import { CHROME_FLAGS, filmTab, openFilm, slotWait, type FilmPage } from "./record";
import { snapSample } from "./capture-samplers.gen";
import { slot } from "../../../scripts/perf/slots";

export type SnapOptions = { at?: string; preview?: string; apply?: string; unapply?: string; scene?: string; all?: boolean; json?: boolean };

/**
 * The hunks whose issue is still there after the move: for each hunk, the issues it fixes before (fix === its id) that
 * the analysis of the changed scene still finds (the same kind, element, feature and axis, at warning or error).
 */
export function unresolved(before: Analysis, after: Analysis, chosen: Proposal[]): { id: string; issue: Analysis["issues"][number]; left: Analysis["issues"][number] | undefined }[] {
  const out: { id: string; issue: Analysis["issues"][number]; left: Analysis["issues"][number] | undefined }[] = [];
  for (const x of chosen) {
    const fixed = before.issues.filter((i) => i.fix === x.id);
    for (const i of fixed.length ? fixed : [{ kind: x.kind, el: x.el, feature: x.feature, axis: x.axis, off: x.from - x.to } as Analysis["issues"][number]]) {
      const left = after.issues.find((j) => j.level !== "advice" && !j.ignored && j.kind === i.kind && j.el === i.el && j.feature === i.feature && j.axis === i.axis);
      if (left) out.push({ id: x.id, issue: i, left });
    }
  }
  return out;
}

/**
 * unresolved() on each of the sampled frames: every issue a chosen hunk fixes that the rule still finds on any of
 * them, once, with the first frame where it stays. `at` gives a frame's analysis, or null for a frame with too few
 * elements at rest to judge.
 */
export function unresolvedOn(before: Analysis, chosen: Proposal[], frames: number[], at: (f: number) => Analysis | null) {
  const failed: (ReturnType<typeof unresolved>[number] & { f: number })[] = [];
  for (const f of frames) {
    const a = at(f);
    if (!a) continue;
    for (const u of unresolved(before, a, chosen)) if (!failed.some((x) => x.id === u.id && x.issue.el === u.issue.el && x.issue.axis === u.issue.axis)) failed.push({ ...u, f });
  }
  return failed;
}

const BEGIN = "// untell snap: accepted alignment moves";
const END = "// end untell snap";

/** The film to snap: the argument, else the film of the last untell check, else the scene you changed last. */
function filmOf(project: string, fw: "remotion" | "hyperframes", arg: string | undefined, log: (s: string) => void): string {
  if (arg) {
    const f = resolve(project, arg);
    if (!existsSync(f)) throw new UsageError(`${arg} does not exist. Give the scene module of the film, such as ${fw === "remotion" ? "src/films" : "films"}/<name>.ts.`, "snap");
    if (!isSceneModule(readFileSync(f, "utf8"))) throw new UsageError(`${arg} is not a scene module: it must export scene and system.`, "snap");
    return f;
  }
  const report = join(project, ".untell", "check", "report.json");
  if (existsSync(report)) {
    const s = (JSON.parse(readFileSync(report, "utf8")) as { film?: { scene?: string | null } }).film?.scene;
    if (s && existsSync(join(project, s))) return join(project, s);
  }
  const f = filmToCheck(project, fw, undefined, log).scene;
  if (!f) throw new UsageError(`no scene module to snap. Give one: untell snap ${fw === "remotion" ? "src/films" : "films"}/<name>.ts`, "snap");
  return f;
}

/** The snap table in a scene source, or null when it has none. Pure. */
export function readTable(src: string): SnapRel[] | null {
  const a = src.indexOf(BEGIN), b = src.indexOf(END);
  if (a < 0 || b < 0) return null;
  const m = src.slice(a, b).match(/export const SNAPS: SnapRel\[\] = (\[[\s\S]*?\n\]);/);
  return m ? JSON.parse(m[1]!.replace(/,\s*\]$/, "]")) as SnapRel[] : [];
}

/**
 * The scene source with the snap table set to `table`. An empty table removes every trace (the import and the
 * renamed scene). `alignImport` is the import path of the kit's scene/align from the scene file. Pure.
 */
export function withTable(src: string, table: SnapRel[], alignImport: string, file = "the scene"): string {
  if (readTable(src) !== null) src = src.slice(0, src.indexOf(BEGIN)).replace(/\n+$/, "\n") + src.slice(src.indexOf(END) + END.length).replace(/^\n/, "");
  if (!table.length) {
    src = src.replace(/\nimport \{ withSnap, type SnapRel \} from "[^"]+";/, "");
    return src.replace(/(^|\n)const sceneBeforeSnap = /, "$1export const scene = ").replace(/(^|\n)function sceneBeforeSnap\(/, "$1export function scene(");
  }
  if (!src.includes("sceneBeforeSnap")) {
    if (/(^|\n)export const scene = /.test(src)) src = src.replace(/(^|\n)export const scene = /, "$1const sceneBeforeSnap = ");
    else if (/(^|\n)export function scene\(/.test(src)) src = src.replace(/(^|\n)export function scene\(/, "$1function sceneBeforeSnap(");
    else throw new UsageError(`${file} has no "export const scene =" or "export function scene(" to wrap. Add the table by hand (see the kit's docs/playbooks/ALIGN.md).`, "snap");
    const imports = [...src.matchAll(/^import [^;]+;$/gm)];
    const at = imports.length ? imports.at(-1)!.index! + imports.at(-1)![0].length : 0;
    src = src.slice(0, at) + `\nimport { withSnap, type SnapRel } from "${alignImport}";` + src.slice(at);
  }
  const lines = table.map((r) => `  ${JSON.stringify(r)},`).join("\n");
  return src.replace(/\n*$/, "\n") + `
${BEGIN} (untell snap --apply). Each entry moves its nodes so that
// one feature joins another node's feature: a relation, so it holds when the content changes. Remove an entry (or run
// untell snap --unapply <id>) to undo it.
export const SNAPS: SnapRel[] = [
${lines}
];
export const scene = withSnap(sceneBeforeSnap, SNAPS);
${END}
`;
}

const sign = (v: number) => (v > 0 ? `+${v}` : `${v}`);
const nodesLabel = (p: Proposal) => (p.group.endsWith("-*") ? `block ${p.group.slice(0, -2)} (${p.nodes.length} nodes)` : p.nodes.length === 1 ? p.nodes[0] : `${p.group} (${p.nodes.length} nodes)`);
/**
 * What snap prints when it finds no proposal. The full-size frame it read stays on disk, so the polish step can review
 * the whole frame: `frame` is its path from the project, or null when the capture did not write it.
 */
export function noProposal(project: string, file: string): { frame: string | null; text: string } {
  const frame = existsSync(file) ? relative(project, file) : null;
  const look = frame ? `\nThe frame it read, at full size: ${frame}\nOpen it and review the whole frame: snap finds only near misses that a move can fix.` : "";
  return { frame, text: `Nothing to snap: no near miss that a move can fix at this time.${look}` };
}

/** One proposal as a hunk of a diff (the repository's format). */
export function hunk(p: Proposal): string {
  const ax = p.axis === "y" ? "y" : "x";
  const on = p.joins.on.filter((e) => e !== p.joins.el);
  return [
    `@@ ${p.id}  ${p.kind}  ${p.level} ${p.confidence.toFixed(2)}  move ${nodesLabel(p)} ${ax} ${sign(p.delta)} px @@`,
    `- ${p.el}  ${p.feature}  ${ax} ${p.from}`,
    `+ ${p.el}  ${p.feature}  ${ax} ${p.to}   joins ${p.joins.el} ${p.joins.feature}${on.length ? ` (also on it: ${on.slice(0, 4).join(", ")}${on.length > 4 ? ", ..." : ""})` : ""}`,
    `  why: ${p.why}`,
    ...(p.alt ? [`  alt: move ${p.alt.group} ${ax} ${sign(p.alt.delta)} px instead; ${p.alt.why}.`] : []),
    ...(p.needs?.length ? [`  needs: ${p.needs.join(", ")} (applied with it)`] : []),
    ...(p.dependants?.length ? [`  note: ${p.dependants.join(", ")} sit in the moved box and do not follow a snap; check them after.`] : []),
  ].join("\n");
}

/** Hunks that share one cause: the same kind and a like move on the same feature (text centred by its line box). */
export function patterns(ps: Proposal[]): string[] {
  const by = new Map<string, Proposal[]>();
  for (const p of ps) {
    const k = `${p.feature.startsWith("band") || p.feature === "baseline" ? "text" : p.kind + p.feature}|${p.axis}|${Math.sign(p.delta)}`;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(p);
  }
  return [...by.values()].filter((g) => g.length >= 3).map((g) => {
    const d = g.map((p) => Math.abs(p.delta));
    const text = g[0]!.feature.startsWith("band") || g[0]!.feature === "baseline";
    return `${g.length} hunks share one cause: ${text ? "text" : g[0]!.feature} ${g[0]!.axis === "y" ? (g[0]!.delta > 0 ? "rides high" : "sits low") : g[0]!.delta > 0 ? "sits left" : "sits right"} by ${Math.min(...d)}-${Math.max(...d)} px`
      + (text && g[0]!.axis === "y" ? " (text placed by its line box or by its x band). Fix the cause where the text is placed: centre its cap band (baseline to cap line) in its box, then run snap again." : ".")
      + `\n  ${g.map((p) => p.id).join(" ")}`;
  });
}

/** The chosen proposals, with every proposal they build on (needs), in the solver's order. */
export function pick(proposals: Proposal[], sel: string, say: (s: string) => void = () => {}, at = ""): Proposal[] {
  if (sel === "all") return proposals;
  const want = new Set(sel.split(/[,\s]+/).filter(Boolean));
  for (let grew = true; grew;) {
    grew = false;
    for (const p of proposals) if (want.has(p.id)) for (const n of p.needs ?? []) if (!want.has(n)) { want.add(n); grew = true; say(`snap: ${p.id} needs ${n}; it is added`); }
  }
  const unknown = [...want].filter((x) => !proposals.some((p) => p.id === x));
  if (unknown.length) throw new UsageError(`no proposal ${unknown.join(", ")} at ${at ? `${at} s` : "this time"}. ${proposals.length ? `The proposals there: ${proposals.map((p) => p.id).join(" ")}.` : "There is no proposal there."} Give the --at of the finding (its fix prints the command).`, "snap");
  return proposals.filter((p) => want.has(p.id));
}

type PageCap = { meta: { width: number; height: number; fps: number; durationInFrames: number }; system: string | null; nodes: any[]; ctx: any; frames: CapFrame[] };

/** Captures the page at the given frames with `moves` applied; `shots` writes a PNG of a frame. */
async function capturePage(fp: FilmPage, project: string, frames: number[] | "all", moves: Move[], shots: Record<number, string> = {}): Promise<PageCap> {
  const browser = await launchChrome(CHROME_FLAGS);
  try {
    const page = await filmTab(browser, project, () => {});
    const meta = await openFilm(page, fp, `#${encodeURIComponent(JSON.stringify(moves))}`);
    const nodes: any[] = await page.evaluate(() => (window as any).__untellNodes ?? []);
    const ctx: any = await page.evaluate(() => (window as any).__untellCtx ?? null);
    const ids = nodes.map((n) => n.id);
    const system = await page.evaluate(() => document.querySelector("[data-system]")?.getAttribute("data-system") ?? null);
    const list = frames === "all" ? Array.from({ length: meta.durationInFrames }, (_, i) => i) : [...new Set(frames)].sort((a, b) => a - b);
    const out: CapFrame[] = [];
    for (const f of list) {
      await page.evaluate((n) => (window as any).__seek(n), Math.min(Math.max(0, f), meta.durationInFrames - 1));
      out.push({ frame: f, t: f / meta.fps, els: (await page.evaluate(snapSample, ids)) as CapEl[] });
      const shot = shots[f];
      if (shot) { mkdirSync(dirname(shot), { recursive: true }); await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: meta.width, height: meta.height } }); }
    }
    return { meta, system: system ?? ctx?.system ?? null, nodes, ctx, frames: out };
  } finally { await browser.close(); }
}

/**
 * The frame the check's align pass read: the detector's capture and the recording's elements, when both are newer
 * than the scene, and when every box they share with snap's own frame agrees within 0.5 px. Else null.
 */
export function checkFrame(project: string, id: string, scene: string, frame: number, own: ReturnType<typeof frameFromCapture>, ignores: ReturnType<typeof ignoresIn>, guides: ResolvedGuides | null) {
  const c = join(project, ".untell", "lab", "out", "detector", id, "capture.json"), e = join(project, ".untell", "recordings", id, "elements.json");
  if (!existsSync(c) || !existsSync(e)) return { fr: null, why: "no check of this film yet" };
  // The recording's time: its key.txt (written on every install, also from the cache), else its files' times.
  const k = join(project, ".untell", "recordings", id, "key.txt");
  const recorded = existsSync(k) ? statSync(k).mtimeMs : Math.min(statSync(c).mtimeMs, statSync(e).mtimeMs);
  if (statSync(scene).mtimeMs > recorded) return { fr: null, why: "the scene changed after the last check" };
  const fr = frameFromDetector(JSON.parse(readFileSync(c, "utf8")), JSON.parse(readFileSync(e, "utf8")), frame, ignores, guides);
  const mine = new Map(own.els.map((x) => [x.id, x.box]));
  for (const x of fr.els) {
    const b = mine.get(x.id);
    if (!b || (x.kind !== "rect" && x.kind !== "image")) continue;
    if (Math.abs(b.x0 - x.box.x0) > 0.5 || Math.abs(b.y0 - x.box.y0) > 0.5 || Math.abs(b.x1 - x.box.x1) > 0.5 || Math.abs(b.y1 - x.box.y1) > 0.5)
      return { fr: null, why: "the check's capture is older than what the renderer draws now (run untell check again)" };
  }
  return { fr, why: null };
}

const asCapture = (c: PageCap, film: string, module: string): Capture => ({ film, module, ...c.meta, safe: c.ctx?.safe ?? null, system: c.system, nodes: c.nodes, frames: c.frames });

export async function snap(projectArg: string, filmArg: string | undefined, o: SnapOptions = {}): Promise<number> {
  const project = resolve(projectArg);
  const fw = detectFramework(project);
  if (fw === "both") throw new UsageError("this project has hyperframes.json and a remotion dependency. Give --cwd <folder> for one of them.", "snap");
  if (!fw) throw new UsageError("no Remotion or HyperFrames project here. Run untell snap in the project folder, or give --cwd <folder>.", "snap");
  for (const [k, v] of [["--apply", o.apply], ["--unapply", o.unapply]] as const) if (v !== undefined && !v.trim()) throw new UsageError(`${k} needs ids or all.`, "snap");
  if (o.apply && o.unapply) throw new UsageError("give --apply or --unapply, not both.", "snap");
  if (o.at !== undefined && !(Number(o.at) >= 0)) throw new UsageError(`--at takes a time in seconds, not "${o.at}".`, "snap");
  const log = o.json ? (s: string) => console.error(s) : (s: string) => console.log(s);
  const scene = filmOf(project, fw, filmArg, log);
  const id = basename(scene).replace(/\.[^.]+$/, "");
  const out = join(project, ".untell", "snap", id);
  const pageDir = join(out, "page");
  mkdirSync(pageDir, { recursive: true });
  const p = mediaPaths(project, fw);
  const release = await slot(`untell snap ${id}`, (m) => log(`  ${slotWait(m)}`));
  try {
    // The page the check records, with moves: Remotion's Player for a Remotion film, the kit's page for HyperFrames.
    let fp: FilmPage;
    if (fw === "remotion") fp = await pageForFilm(project, fw, scene, "snap", { moves: true });
    else {
      await buildHf(project, scene, () => {}, { page: pageDir, framework: fw, mediaBase: relative(pageDir, p.media).split("\\").join("/") + "/", moves: true });
      fp = { kind: "hf", html: join(pageDir, "index.html"), runtime: null };
    }
    const meta0 = await loadSceneMeta(project, scene);
    const sceneMod = await sceneExports(project, scene);
    // 1. The moment of rest: --at, else the frame where the most elements are fully visible and still.
    const first = await capturePage(fp, project, [0], []);
    const fps = first.meta.fps, n = first.meta.durationInFrames;
    let frame: number;
    // --at 0 reads frame 0 (before: it read frame 2, 0.07 s). Frame 0 has no frame before it, so everything on it
    // counts as at rest there.
    if (o.at !== undefined) frame = Math.min(n - 1, Math.max(0, Math.round(Number(o.at) * fps)));
    else {
      const step = Math.max(1, Math.round(fps / 2));
      const cands = Array.from({ length: Math.floor((n - 1) / step) }, (_, i) => (i + 1) * step).concat([n - 1]).filter((f) => f >= 2);
      const sample = asCapture(await capturePage(fp, project, cands.flatMap((f) => [f - 1, f]), []), id, scene);
      let best = cands[0]!, score = -1;
      for (const f of cands) { const s = frameFromCapture(sample, f, f - 1).els.length; if (s >= score) { score = s; best = f; } }
      frame = best;
    }
    const ignores = ignoresIn([scene]);
    const before = join(out, "before.png");
    const prevOf = (f: number) => (f > 0 ? f - 1 : undefined);
    const cap = asCapture(await capturePage(fp, project, frame > 0 ? [frame - 1, frame] : [frame], [], { [frame]: before }), id, scene);
    const guides = guidesOf(sceneMod.scene, { width: meta0.width, height: meta0.height, safe: cap.safe ?? null });
    const own = frameFromCapture(cap, frame, prevOf(frame), ignores, guides);
    // The check's frame, when it is current: a check finding names snap ids, and the same frame gives the same ids.
    const chk = checkFrame(project, id, scene, frame, own, ignores, guides);
    const fr = chk.fr ?? own;
    const source = chk.fr ? "the check's capture" : `snap's own capture (${chk.why})`;
    const A: Analysis = analyse(fr);
    writeFileSync(join(out, "analysis.json"), JSON.stringify({ film: id, module: relative(project, scene), frame, t: frame / fps, width: cap.width, height: cap.height, system: cap.system, frameEls: fr.els, guides, source, ...A }, null, 1));
    const T = (frame / fps).toFixed(2);
    const rel = relative(project, scene);
    const cmd = (more: string) => `untell snap ${rel} --at ${T} ${more}`;
    const sceneFile = o.scene ? resolve(project, o.scene) : scene;
    const result: Record<string, unknown> = { version: 1, film: id, scene: relative(project, sceneFile), at: Number(T), frame, frameFile: noProposal(project, before).frame, source, tol: A.tol, proposals: A.proposals, issues: A.issues };

    // 2. The diff.
    if (!o.preview && !o.apply && !o.unapply) {
      if (o.json) { console.log(JSON.stringify(result, null, 1)); return A.proposals.length ? 1 : 0; }
      const e = A.proposals.filter((x) => x.level === "error").length;
      log(`untell snap ${rel} (${cap.system ?? "no system"}, ${cap.width}x${cap.height}) at ${T} s: ${A.proposals.length} proposal(s), ${e} error(s); tolerance ${A.tol} px; ${fr.els.length} elements at rest; read from ${source}\n`);
      for (const x of A.proposals) log(hunk(x) + "\n");
      const pats = patterns(A.proposals);
      if (pats.length) log(pats.join("\n") + "\n");
      const rest = A.issues.filter((i) => !i.fix && (o.all ? true : i.level !== "advice"));
      if (rest.length) {
        log(`${rest.length} issue(s) without a proposal${o.all ? "" : " (--all lists the advice too)"}:`);
        for (const i of rest) log(`  ${i.level.padEnd(7)} ${i.kind.padEnd(8)} ${i.el} ${i.feature} ${i.axis} ${i.v} -> ${i.target.el} ${i.target.feature} ${i.to} (${sign(i.off)} px)${i.ignored ? `  ignored: ${i.ignored}` : ""}\n          ${i.why}`);
        log("");
      }
      if (A.proposals.length) {
        log(`Next: preview the hunks and look at the image before you apply any:\n  ${cmd("--preview all")}\nThen apply the right ones: ${cmd("--apply <ids>")}   (nothing moves until you apply)`);
        const fr0 = noProposal(project, before).frame;
        if (fr0) log(`The frame it read, at full size: ${fr0}`);
      } else log(noProposal(project, before).text);
      return A.proposals.length ? 1 : 0;
    }

    // 3. Preview: the real renderer draws the moved nodes.
    if (o.preview) {
      // --preview all with no proposal: nothing to move, so the frame itself is the preview (exit 0). Before, it
      // failed, and an agent that only wanted to look at one frame had no command (a first-use test).
      if (!A.proposals.length && o.preview.trim() === "all") {
        if (o.json) { console.log(JSON.stringify({ ...result, previewed: [] }, null, 1)); return 0; }
        log(noProposal(project, before).text);
        return 0;
      }
      const chosen = pick(A.proposals, o.preview, log, T);
      if (!chosen.length) throw new UsageError(`no proposal at ${T} s, so there is nothing to preview. Run untell snap ${rel} to list them.`, "snap");
      const py = analysisPython(project);
      if (!py) throw new MissingToolError("untell snap --preview needs a Python with numpy and Pillow. Run: untell media setup");
      const after = join(out, "after.png");
      const capA = asCapture(await capturePage(fp, project, [frame], movesOf(chosen), { [frame]: after }), id, scene);
      const frA = frameFromCapture(capA, frame, undefined, ignores, guides);
      const B = analyse(frA);
      writeFileSync(join(out, "after.json"), JSON.stringify({ frameEls: frA.els, ...B }, null, 1));
      // The hunks that were previewed: --apply takes only these.
      const seen = existsSync(join(out, "previewed.json")) ? (JSON.parse(readFileSync(join(out, "previewed.json"), "utf8")) as { ids: string[] }).ids : [];
      writeFileSync(join(out, "previewed.json"), JSON.stringify({ ids: [...new Set([...seen, ...chosen.map((x) => x.id)])] }));
      const r = spawnSync(py.py, [join(registryDir(), "tools", "snap", "preview.py"), "--dir", out, "--ids", chosen.map((x) => x.id).join(",")], { encoding: "utf8" });
      if (r.status !== 0) throw new Error(`the snap preview failed (${py.py}): ${(r.stderr ?? "").trim().split("\n").slice(-3).join(" ")}`);
      const left = B.issues.filter((i) => i.level !== "advice" && !i.ignored);
      const fresh = left.filter((i) => !A.issues.some((x) => x.el === i.el && x.axis === i.axis && x.kind === i.kind));
      // preview.py writes preview-1.png (before | after), preview-2.png (the overlay: each miss, its move and its hunk
      // id in the margin) and preview-3.png on (each hunk's before and after crop at 4x or more).
      const pages = readdirSync(out).filter((f) => /^preview-\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0])).map((f) => relative(project, join(out, f)));
      const files = { preview: relative(project, join(out, "preview.png")), pages, before: relative(project, before), after: relative(project, after) };
      if (o.json) { console.log(JSON.stringify({ ...result, previewed: chosen.map((x) => x.id), files, left: left.length, fresh: fresh.length }, null, 1)); return 0; }
      log(`preview of ${chosen.map((x) => x.id).join(" ")}:\n  ${pages[0] ?? files.preview}  before | after\n  ${pages[1] ?? ""}  the overlay: each miss in red, its move, the line it joins in blue, its hunk id in the margin${pages.length > 2 ? `\n  ${pages.slice(2).join(", ")}  each hunk's before and after crop, zoomed` : ""}`);
      log(`after ${chosen.length} move(s): ${left.length} issue(s) left at warning or error, ${fresh.length} new${fresh.length ? ": " + fresh.map((i) => `${i.kind} ${i.el} ${i.feature} ${sign(i.off)} px (${i.level})`).join("; ") : ""}`);
      log(`Open these pages and look at them. Apply only the hunks that are right: ${cmd(`--apply ${chosen.map((x) => x.id).join(",")}`)}`);
      return 0;
    }

    // 4. Apply and unapply: the table in the scene module.
    if (!existsSync(sceneFile)) throw new UsageError(`--scene ${o.scene} does not exist.`, "snap");
    const src = readFileSync(sceneFile, "utf8");
    const table = readTable(src) ?? [];
    let imp = relative(dirname(sceneFile), join(project, KIT_DIR[fw], "scene", "align")).split("\\").join("/");
    if (!imp.startsWith(".")) imp = `./${imp}`;
    if (o.apply) {
      const chosen = pick(A.proposals, o.apply, log, T);
      if (!chosen.length) throw new UsageError(`no proposal ${o.apply} at ${T} s. Run untell snap ${rel} to list them.`, "snap");
      // Never apply a hunk that nobody looked at: a hunk can be wrong.
      const seen = existsSync(join(out, "previewed.json")) ? (JSON.parse(readFileSync(join(out, "previewed.json"), "utf8")) as { ids: string[] }).ids : [];
      const unseen = chosen.filter((x) => !seen.includes(x.id)).map((x) => x.id);
      if (unseen.length) throw new UsageError(`no preview of ${unseen.join(", ")}. Preview it first and look at the image: ${cmd(`--preview ${unseen.join(",")}`)}`, "snap");
      const next = [...table.filter((r) => !chosen.some((x) => x.id === r.id)), ...chosen.map((x) => ({ ...x.rel, why: x.why.split(". ")[0]!.slice(0, 160) }))];
      writeFileSync(sceneFile, withTable(src, next, imp, relative(project, sceneFile)));
      // The rule each hunk fixes, run again on the changed scene: the page is built again from the file as written, and
      // the same frame is read and judged. A hunk counts as applied only when the issue it fixes is gone; a hunk that
      // leaves it, or makes it worse, is taken back with the whole apply, and the scene is as it was.
      const fp2 = fw === "remotion" ? await pageForFilm(project, fw, scene, "snap", { moves: true })
        : (await buildHf(project, scene, () => {}, { page: pageDir, framework: fw, mediaBase: relative(pageDir, p.media).split("\\").join("/") + "/", moves: true }), { kind: "hf" as const, html: join(pageDir, "index.html"), runtime: null });
      // The rule runs on the frames the check samples (every half second and the last, as the alignment pass does) and
      // on this one: a cause that moves (a camera tilt) can be fixed on one frame and stay on the others. Before, the
      // confirm read one frame and said the rule found nothing; the next check found the same cause at other frames.
      const half = Math.max(1, Math.round(fps / 2));
      const sampled = [...new Set([frame, ...Array.from({ length: Math.ceil(n / half) }, (_, i) => i * half), n - 1])].filter((f) => (f >= 1 || f === frame) && f < n).sort((a, b) => a - b);
      const capB = asCapture(await capturePage(fp2, project, [...new Set(sampled.flatMap((f) => (f > 0 ? [f - 1, f] : [f])))].sort((a, b) => a - b), []), id, scene);
      const failed = unresolvedOn(A, chosen, sampled, (f) => { const fr = frameFromCapture(capB, f, prevOf(f), ignores, guides); return fr.els.length < 2 ? null : analyse(fr); });
      if (failed.length) {
        writeFileSync(sceneFile, src);
        const what = failed.map((f) => `${f.id}: ${f.issue.kind} ${f.issue.el} ${f.issue.feature} ${sign(f.issue.off)} px before, ${f.left ? `${sign(f.left.off)} px after` : "gone"}${f.left && Math.abs(f.left.off) > Math.abs(f.issue.off) ? " (worse)" : ""} at ${(f.f / fps).toFixed(2)} s`);
        if (o.json) { console.log(JSON.stringify({ ...result, applied: [], restored: true, unresolved: failed.map((f) => ({ id: f.id, before: f.issue.off, after: f.left?.off ?? null, at: Number((f.f / fps).toFixed(2)) })) }, null, 1)); return 1; }
        log(`not applied: after the move the rule still finds what ${failed.length === 1 ? "this hunk fixes" : "these hunks fix"} on the changed scene, so ${relative(project, sceneFile)} is restored as it was.\n  ${what.join("\n  ")}`);
        log(`Fix it in the scene by hand (the hunk's line and offset are above), or preview another hunk: ${cmd("--preview <ids>")}`);
        return 1;
      }
      if (o.json) { console.log(JSON.stringify({ ...result, applied: chosen.map((x) => x.id), table: next.length, verified: true, framesChecked: sampled.length }, null, 1)); return 0; }
      log(`applied ${chosen.length} hunk(s) to ${relative(project, sceneFile)}: ${chosen.map((x) => x.id).join(" ")}. The table now holds ${next.length}. The rule they fix finds nothing there now (checked on the changed scene, on ${sampled.length} frames: every half second and the last, as untell check samples them).`);
      log(`Next: run untell snap ${rel} again to see what is left, then untell check. To undo: ${cmd("--unapply <ids|all>")}`);
    } else {
      const sel = o.unapply!;
      const next = sel === "all" ? [] : table.filter((r) => !sel.split(/[,\s]+/).includes(r.id));
      writeFileSync(sceneFile, withTable(src, next, imp, relative(project, sceneFile)));
      if (o.json) { console.log(JSON.stringify({ ...result, removed: table.length - next.length, table: next.length }, null, 1)); return 0; }
      log(`removed ${table.length - next.length} snap(s) from ${relative(project, sceneFile)}; ${next.length} left.`);
    }
    return 0;
  } finally { release(); }
}
