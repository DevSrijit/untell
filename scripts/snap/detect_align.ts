// The align/* checks' geometry pass for the detector: it runs the alignment model (src/system/scene/align.ts) on a
// recorded film's rest frames and writes out/detector/<id>/align.json for scripts/inspect/checks/align_*.py.
//
// Usage: bun scripts/snap/detect_align.ts <film id> [--films <module>]
// It reads out/detector/<id>/capture.json (nodes, letter ink, shapes) and out/recordings/<id>/elements.json (boxes).
// Frames: every 0.5 s and the last frame; an element counts at a frame when it did not move from the frame before.
// The same issue on several frames is one entry, with its first and last time and its strongest record. Each entry
// carries the id of the snap proposal that fixes it and the command that previews it. No screenshots are needed.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { analyse, paintBox, type Issue } from "../../src/system/scene/align";
import { valueAt } from "../../src/system/scene/time";
import { SYSTEMS } from "../../src/system/systems";
import type { Key, Prop } from "../../src/system/scene/types";
import { declarationLines, filmGuides, frameFromDetector, ignoresIn } from "./frame";
import { guidesOf } from "../../src/system/scene/align";

const ROOT = resolve(import.meta.dir, "..", "..");
const args = process.argv.slice(2);
const id = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--films");
if (!id) { console.error("usage: bun scripts/snap/detect_align.ts <film id> [--films <module>]"); process.exit(2); }
// UNTELL_DET_OUT and UNTELL_REC_OUT move the folders (the speed bench runs the detector in folders of its own).
const dir = join(process.env.UNTELL_DET_OUT ?? join(ROOT, "out", "detector"), id);
const det = JSON.parse(readFileSync(join(dir, "capture.json"), "utf8"));
const elements = JSON.parse(readFileSync(join(process.env.UNTELL_REC_OUT ?? join(ROOT, "out", "recordings"), id, "elements.json"), "utf8"));
const srcFile = join(dir, "sources.json");
const sources: string[] = existsSync(srcFile) ? JSON.parse(readFileSync(srcFile, "utf8")) : [];
const films = args.includes("--films") ? resolve(args[args.indexOf("--films") + 1]!) : sources[0];
const ignores = ignoresIn(sources);

// The scene's guides (withGuides), as snap reads them: the same frame gives the same ids in both.
const frameOf = { width: elements.width, height: elements.height, safe: det.ctx?.safe ?? null };
// A HyperFrames page built from a scene (untell-scene.json beside it): the guides come from that scene, as in Remotion.
const hfScene = (() => {
  const page = sources.find((p) => p.endsWith("index.html"));
  const meta = page ? join(dirname(page), "untell-scene.json") : "";
  return meta && existsSync(meta) ? (JSON.parse(readFileSync(meta, "utf8")) as { scene: string; export: string }) : null;
})();
const guides = hfScene ? guidesOf((await import(hfScene.scene))[hfScene.export], frameOf)
  : films && !films.endsWith(".html") ? await filmGuides(films, id, frameOf) : null;
const fps = elements.fps, n = elements.durationInFrames;
const step = Math.max(1, Math.round(fps / 2));
const frames = [...new Set([...Array.from({ length: Math.ceil(n / step) }, (_, i) => i * step), n - 1])].filter((f) => f >= 1);
type Entry = Issue & { t0: number; t1: number; frames: number; at: number; preview?: string; camera?: boolean };
// The camera's transform on each frame (scale, rotate, tilt): a miss that shows only while the camera is scaled,
// turned or tilted moves with the camera, and a move in the scene does not fix it. Before: a Graphite film's six
// alignment findings all came from a camera tilt, and snap fixed one frame of one of them.
const system = SYSTEMS.find((x) => x.id === elements.system) ?? SYSTEMS[0]!;
const cam = (det.nodes as { kind: string; tracks?: Partial<Record<Prop, Key[]>> }[]).find((x) => x.kind === "camera");
const camAt = (f: number) => {
  if (!cam?.tracks) return null;
  const v = (p: Prop, rest: number) => (cam.tracks![p]?.length ? valueAt(system, cam.tracks![p], p, f / fps) : rest);
  const t = { scale: v("scale", 1), rotate: v("rotate", 0), tiltX: v("tiltX" as Prop, 0), tiltY: v("tiltY" as Prop, 0) };
  return Math.abs(t.scale - 1) > 1e-3 || Math.abs(t.rotate) > 1e-2 || Math.abs(t.tiltX) > 1e-2 || Math.abs(t.tiltY) > 1e-2 ? t : null;
};
const camSeen: Record<string, { scale: number; rotate: number; tiltX: number; tiltY: number }> = {};
const by = new Map<string, Entry>();
for (const f of frames) {
  const fr = frameFromDetector(det, elements, f, ignores, guides);
  if (fr.els.length < 2) continue;
  const a = analyse(fr);
  // A symptom that another issue's proposal fixes too is not a finding of its own.
  for (const i of a.issues.filter((x) => !x.via)) {
    const key = `${i.kind}|${i.el}|${i.feature}|${i.target.el}|${i.target.feature}|${i.axis}`;
    const t = f / fps;
    const kindOf = (x: string) => fr.els.find((e) => e.id === x)?.kind ?? "guide";
    const boxOf = (x: string) => { const e = fr.els.find((y) => y.id === x); return e ? paintBox(e) : null; };
    Object.assign(i, { kinds: [kindOf(i.el), kindOf(i.target.el)], elBox: boxOf(i.el), targetBox: boxOf(i.target.el) });
    const c = camAt(f);
    if (c) camSeen[t.toFixed(2)] = c;
    const prev = by.get(key);
    if (!prev) { by.set(key, { ...i, t0: t, t1: t, frames: 1, at: t, camera: !!c }); continue; }
    prev.t1 = t; prev.frames++;
    prev.camera = prev.camera !== false && !!c;
    // The preview reads the latest frame where this fix holds: the frame is most settled there.
    if (i.fix && i.fix === prev.fix) prev.at = t;
    if (i.confidence > prev.confidence) by.set(key, { ...i, t0: prev.t0, t1: t, frames: prev.frames, at: t, camera: prev.camera });
  }
}
const issues = [...by.values()].sort((a, b) => b.confidence - a.confidence || a.t0 - b.t0);
for (const i of issues) if (i.fix && films) i.preview = `bun scripts/snap/cli.ts ${id} --films ${relative(ROOT, films)} --at ${i.at.toFixed(2)} --preview ${i.fix}`;
// The scene's align declarations, as the detector reports every other rule's: what each suppresses, and the selector
// that would match for one that matches nothing.
const declarations = declarationLines(ignores, issues);
// Every finding at warning or error moves with the camera: the camera is their shared cause.
const judged = issues.filter((i) => i.level === "error" || i.level === "warning");
const camera = judged.length && judged.every((i) => i.camera) ? { shared: true, transform: camSeen } : undefined;
writeFileSync(join(dir, "align.json"), JSON.stringify({ film: id, frames: frames.length, guides, declarations, issues, ...(camera ? { camera } : {}) }, null, 1));
console.log(`${id}: ${issues.length} align issue(s) on ${frames.length} frames -> ${relative(ROOT, join(dir, "align.json"))}`);
for (const l of declarations) console.log(`  ${l}`);
