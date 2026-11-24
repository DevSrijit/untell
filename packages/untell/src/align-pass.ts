// The align/* checks' geometry pass, as the repository's scripts/snap/detect_align.ts runs it: the alignment model (the
// kit's scene/align.ts) on a recorded film's rest frames. It writes <detector>/align.json, which the checks
// align_*.py read. It reads the capture (nodes, letter ink, shapes) and the recording's elements.json. Frames: every
// 0.5 s and the last frame; an element counts at a frame when it did not move from the frame before. The same issue
// on several frames is one entry, with its first and last time and its strongest record. Each entry carries the id
// of the snap proposal that fixes it and the untell command that previews it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { analyse, paintBox, type Issue, type ResolvedGuides } from "../registry/kit/scene/align";
// The repository's frame builder (Node-safe: it reads files and imports types only).
import { declarationEffects, declarationLines, frameFromDetector, ignoresIn, type DeclarationEffect } from "../../../scripts/snap/frame";

type Entry = Issue & { t0: number; t1: number; frames: number; at: number; preview?: string; kinds?: string[] };

/** Runs the pass. `sources` are the film's source files (for the scene's declared exceptions). Returns the issue count
 *  and what each align declaration did (the detector reads every other rule's). */
/** `guides`: the scene's guides (withGuides), resolved in the film's frame, as snap reads them (the same ids in both). */
export function alignPass(o: { detector: string; recording: string; sources: string[]; guides?: ResolvedGuides | null; previewCmd: (at: number, fix: string) => string }): { issues: number; declarations: DeclarationEffect[] } {
  const det = JSON.parse(readFileSync(join(o.detector, "capture.json"), "utf8"));
  const elements = JSON.parse(readFileSync(join(o.recording, "elements.json"), "utf8"));
  const ignores = ignoresIn(o.sources.filter(existsSync));
  const fps = elements.fps, n = elements.durationInFrames;
  const step = Math.max(1, Math.round(fps / 2));
  const frames = [...new Set([...Array.from({ length: Math.ceil(n / step) }, (_, i) => i * step), n - 1])].filter((f) => f >= 1);
  const by = new Map<string, Entry>();
  for (const f of frames) {
    const fr = frameFromDetector(det, elements, f, ignores, o.guides ?? null);
    if (fr.els.length < 2) continue;
    const a = analyse(fr);
    // A symptom that another issue's proposal fixes too is not a finding of its own.
    for (const i of a.issues.filter((x) => !x.via)) {
      const key = `${i.kind}|${i.el}|${i.feature}|${i.target.el}|${i.target.feature}|${i.axis}`;
      const t = f / fps;
      const kindOf = (x: string) => fr.els.find((e) => e.id === x)?.kind ?? "guide";
      const boxOf = (x: string) => { const e = fr.els.find((y) => y.id === x); return e ? paintBox(e) : null; };
      Object.assign(i, { kinds: [kindOf(i.el), kindOf(i.target.el)], elBox: boxOf(i.el), targetBox: boxOf(i.target.el) });
      const prev = by.get(key);
      if (!prev) { by.set(key, { ...i, t0: t, t1: t, frames: 1, at: t }); continue; }
      prev.t1 = t; prev.frames++;
      // The preview reads the latest frame where this fix holds: the frame is most settled there.
      if (i.fix && i.fix === prev.fix) prev.at = t;
      if (i.confidence > prev.confidence) by.set(key, { ...i, t0: prev.t0, t1: t, frames: prev.frames, at: t });
    }
  }
  const issues = [...by.values()].sort((a, b) => b.confidence - a.confidence || a.t0 - b.t0);
  for (const i of issues) if (i.fix) i.preview = o.previewCmd(i.at, i.fix);
  const declarations = declarationEffects(ignores, issues);
  // align.json keeps the repository's form (one line per declaration): the align checks (align_common.py) read it.
  writeFileSync(join(o.detector, "align.json"), JSON.stringify({ film: det.id, frames: frames.length, guides: o.guides ?? null, declarations: declarationLines(ignores, issues), issues }, null, 1));
  writeFileSync(join(o.detector, "sources.json"), JSON.stringify(o.sources));
  return { issues: issues.length, declarations };
}

export const relTo = (project: string, p: string) => relative(project, p) || p;
