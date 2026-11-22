// Builds the alignment model's input (AlignFrame) from a capture: from the snap capture (scripts/snap/capture.ts)
// or from the detector's capture (out/detector/<id>/capture.json with out/recordings/<id>/elements.json).
// It keeps the elements that are fully visible and at rest, and marks the ones that take no part:
//   - an overlay (layer 1: a cursor, an annotation arrow) and a backdrop that fills the frame,
//   - a data mark: a node whose place encodes a value (a bar, a plotted point, a tick, an axis). It is found by its
//     id ("bar", "pt", "dot", "tick", "axis", "series", ...) or by a growing scale track.
// It also reads the scene's declared exceptions: `// untell-ignore align/<check> [node ...]: <reason>`.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { declares, guidesOf, type AlignEl, type AlignFrame, type Box, type Ignore, type ResolvedGuides } from "../../src/system/scene/align";
import type { Capture, CapEl } from "./capture";

const DATA_ID = /(^|-)(axis|ax[LR]|ticks?|tk|grid|gridlines?|dots?|ln|series|bars?\d+|pts?\d+|points?|wedges?|slices?|plot)\d*([-:]|$)/;

export function isData(node: any): boolean {
  if (!node) return false;
  if (DATA_ID.test(node.id)) return true;
  // A mark that grows from nothing (a bar's scale from 0) shows a value.
  const t = node.tracks ?? {};
  return [t.scaleX, t.scaleY, t.scale].some((k: { v: number }[] | undefined) => !!k?.length && k[0]!.v <= 0.05);
}

/** The ids of every node in a chart: a block call (the first part of the id) with one data mark makes all its nodes data. */
export function dataIds(nodes: any[]): Set<string> {
  const top = (id: string) => id.split("-")[0]!;
  const charts = new Set(nodes.filter(isData).map((n) => top(n.id)));
  return new Set(nodes.filter((n) => charts.has(top(n.id))).map((n) => n.id));
}

const box = (b: [number, number, number, number]): Box => ({ x0: b[0], y0: b[1], x1: b[2], y1: b[3] });

/** A track's value at time t (s): the last key at or before t, else the first key. Rest frames sit on a key. */
const trackAt = (keys: { t: number; v: number }[] | undefined, t: number, dflt: number) => {
  if (!keys?.length) return dflt;
  let v = keys[0]!.v;
  // A key in the next 0.1 s: the move is ending, and the frame already reads as its end (the rest test passes).
  for (const k of keys) if (k.t <= t + 0.1) v = k.v;
  return v;
};

/**
 * True when the painter puts a box node on whole px at time t: a layout box (left, top) with no transform at rest
 * (translate by whole px, scale 1, no rotation). Chrome rounds such a box's edges, so a fractional layout position
 * does not blur. A transform at rest leaves its edges where the transform puts them.
 */
export function paintSnapped(node: any, t: number): boolean {
  if (!node || (node.kind !== "rect" && node.kind !== "image")) return false;
  const tr = node.tracks ?? {};
  const whole = (v: number) => Math.abs(v - Math.round(v)) < 0.01;
  if (!whole(trackAt(tr.x, t, 0)) || !whole(trackAt(tr.y, t, 0))) return false;
  for (const k of ["scale", "scaleX", "scaleY"]) if (Math.abs(trackAt(tr[k], t, 1) - 1) > 1e-4) return false;
  if (rotatedAt(node, t)) return false;
  return true;
}

/** True when a node is turned at rest (a rotation or a tilt): its box edges are not lines, and they do not snap. */
export function rotatedAt(node: any, t: number): boolean {
  const tr = node?.tracks ?? {};
  return ["rotate", "rotation", "tiltX", "tiltY"].some((k) => Math.abs(trackAt(tr[k], t, 0)) > 1e-4) || Math.abs(node?.rotate ?? 0) > 1e-4;
}

/** How a text node is set in its width (a node with `width` and `align`), or undefined. */
const setOf = (node: any): AlignEl["set"] => (node?.kind === "text" && node.width && node.align ? (node.align === "center" ? "centre" : node.align === "right" ? "end" : "start") : undefined);
/** The group, row and column tags a block gives a node (see ALIGN.md), or undefined. */
const tagsOf = (node: any): AlignEl["tags"] => {
  const t = { ...(typeof node?.group === "string" ? { group: node.group } : {}), ...(typeof node?.row === "string" ? { row: node.row } : {}), ...(typeof node?.col === "string" ? { col: node.col } : {}) };
  return Object.keys(t).length ? t : undefined;
};

/** One captured element as a model element, or null when it takes no part. `t` (s) is the frame's time, for rest transforms. */
export function toEl(c: CapEl, node: any, width: number, height: number, data = false, t = Infinity): AlignEl | null {
  if (c.opacity < 0.95) return null;
  const b = box(c.box);
  // An element mostly out of the frame (a panel the view has panned away from) is not seen: it has no alignment.
  const vis = (Math.max(0, Math.min(b.x1, width) - Math.max(b.x0, 0)) * Math.max(0, Math.min(b.y1, height) - Math.max(b.y0, 0))) / Math.max(1e-6, (b.x1 - b.x0) * (b.y1 - b.y0));
  if (vis < 0.5 && (b.x1 - b.x0) * (b.y1 - b.y0) > 0) return null;
  // A box or a picture that fills the frame is a backdrop. A text never is: kinetic words fill the frame on purpose
  // (an agent's Kinetic film had no element left to check, because every phrase filled the frame).
  if (c.kind !== "text" && (b.x1 - b.x0) * (b.y1 - b.y0) > 0.9 * width * height) return null;
  if (node?.kind === "hold" || node?.kind === "camera" || node?.kind === "anchor") return null;
  // A label's knock-out (sheet.ts) is in the tone of what is behind it: no edge a viewer sees, so not part of the layout.
  if (node?.kind === "rect" && node.knock) return null;
  // A text cursor or caret blinks and follows the typing: it is an overlay, not part of the layout.
  const layer = node?.layer ?? (/(^|-)(caret|cursor)(\d|[a-z]?\b|-)/i.test(c.id) ? 1 : 0);
  const el: AlignEl = { id: c.id, kind: c.kind === "other" ? "rect" : (c.kind as AlignEl["kind"]), box: b, ...(c.stroke ? { stroke: c.stroke } : {}), ...(layer > 0 ? { layer } : {}) };
  if (data) el.data = true;
  // A mark whose own place shows a value (a tick, a dot, a bar that grows from 0), not only a part of a chart's block.
  if (data && isData(node)) el.mark = true;
  if (paintSnapped(node, t)) el.snapped = true;
  if (rotatedAt(node, t)) el.rotated = true;
  const set = setOf(node);
  if (set) el.set = set;
  const tags = tagsOf(node);
  if (tags) el.tags = tags;
  if (c.kind === "text" && c.ink && c.baseline !== undefined) {
    el.text = { baseline: c.baseline, cap: c.cap ?? 0, xh: c.xh ?? 0, ink: box(c.ink), fontPx: c.fontPx ?? 0,
      letters: (c.letters ?? []).map((l) => ({ x0: l[1], y0: l[2], x1: l[3], y1: l[4] })) };
  }
  return el;
}

/** The anchors and other undrawn nodes, for groups and for the "dependants" of a move. */
export function ghostsOf(nodes: any[]): { id: string; box: Box }[] {
  return nodes.filter((n) => n.kind === "anchor").map((n) => ({ id: n.id, box: { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h } }));
}

/** The scene model's y and role of every text node, and the text nodes that do not show now (see AlignFrame.hidden). */
export function textStates(nodes: any[], els: AlignEl[]) {
  const shown = new Set(els.map((e) => e.id));
  const texts = nodes.filter((n) => n.kind === "text");
  // A camera with any move or zoom (see AlignFrame.camera).
  const cam = nodes.find((n) => n.kind === "camera");
  const camera = !!cam && Object.entries(cam.tracks ?? {}).some(([k, keys]: [string, any]) => ["x", "y", "scale"].includes(k) && keys.some((q: { v: number }) => q.v !== (k === "scale" ? 1 : 0)));
  return {
    camera,
    textY: Object.fromEntries(texts.filter((n) => shown.has(n.id)).map((n) => [n.id, { y: n.y, role: n.role }])),
    hidden: texts.filter((n) => !shown.has(n.id)).map((n) => ({ id: n.id, y: n.y, role: n.role })),
  };
}

/**
 * At rest for alignment: an element that moved at most REST px from the frame before (each edge), at a steady
 * opacity. A held phrase under a slow push, or a line of text held while a product turns slowly, moves a fraction of a
 * px a frame: its alignment is what the viewer reads, and every element is measured at the same instant, so it counts.
 * (A Kinetic and a Keynote film of agents had no element at rest at all under 0.05 px.) A move in progress
 * (an entrance, a cut-in) moves more than that.
 */
export const REST = 0.5;
const same = (a: CapEl, b: CapEl) => a.box.every((v, i) => Math.abs(v - b.box[i]!) <= REST) && Math.abs(a.opacity - b.opacity) < 0.01;

/** The model's frame from a snap capture: frame `f` of the capture, with `prev` (an earlier frame) to test rest. */
export function frameFromCapture(cap: Capture, f: number, prevF?: number, ignores: Ignore[] = [], guides: ResolvedGuides | null = null): AlignFrame {
  const fr = cap.frames.find((x) => x.frame === f);
  if (!fr) throw new Error(`snap: frame ${f} is not in the capture`);
  const prev = prevF !== undefined ? cap.frames.find((x) => x.frame === prevF) : undefined;
  const pm = new Map((prev?.els ?? []).map((e) => [e.id, e]));
  const nodes = new Map(cap.nodes.map((n: any) => [n.id, n]));
  const data = dataIds(cap.nodes);
  const els: AlignEl[] = [];
  const others: { id: string; box: Box }[] = [];
  for (const c of fr.els) {
    if (prev && (!pm.has(c.id) || !same(pm.get(c.id)!, c))) { if (c.opacity >= 0.5) others.push({ id: c.id, box: box(c.box) }); continue; }
    const e = toEl(c, nodes.get(c.id), cap.width, cap.height, data.has(c.id), fr.t);
    if (e) els.push(e);
  }
  markOnPicture(els, nodes, fr.t, others);
  return { t: fr.t, width: cap.width, height: cap.height, safe: cap.safe, els, others, ghosts: ghostsOf(cap.nodes), ignores, guides, ...textStates(cap.nodes, els) };
}

/**
 * The model's frame from the detector's capture at frame f: elements.json gives each box and text element's painted
 * box; the capture's shapes give each line and circle (with its stroke); the capture's ink gives each text's letters.
 * Only nodes that did not move from frame f-1 count.
 */
export function frameFromDetector(det: any, elements: any, f: number, ignores: Ignore[] = [], guides: ResolvedGuides | null = null): AlignFrame {
  const W = elements.width, H = elements.height;
  const nodes = new Map<string, any>((det.nodes ?? []).map((n: any) => [n.id, n]));
  const data = dataIds(det.nodes ?? []);
  const els: AlignEl[] = [];
  const seen = new Set<string>();
  const add = (c: CapEl) => {
    const el = toEl(c, nodes.get(c.id), W, H, data.has(c.id), f / (elements.fps ?? 30));
    if (el) { els.push(el); seen.add(c.id); }
  };
  // Boxes, pictures and text: from the recorder's elements.
  const cur = elements.frames[f] ?? [], prv = new Map<string, any>((elements.frames[f - 1] ?? []).map((e: any) => [e.id, e]));
  const others: { id: string; box: Box }[] = [];
  const ink = new Map<string, any>((det.ink?.[f] ?? []).map((t: any) => [t.node ?? t.id, t]));
  for (const e of cur) {
    const label = String(e.id).split(":")[0]!;
    const node = nodes.get(label);
    if (!node || seen.has(label) || e.layer !== "content" || !["text", "rect", "image"].includes(node.kind)) continue;
    const p = prv.get(e.id);
    if (!p || Math.max(Math.abs(p.x - e.x), Math.abs(p.y - e.y), Math.abs(p.x + p.w - e.x - e.w), Math.abs(p.y + p.h - e.y - e.h)) > REST || Math.abs((p.opacity ?? 1) - (e.opacity ?? 1)) >= 0.01) {
      if ((e.opacity ?? 1) >= 0.5) others.push({ id: label, box: { x0: e.x, y0: e.y, x1: e.x + e.w, y1: e.y + e.h } });
      continue;
    }
    const c: CapEl = { id: label, kind: node.kind, box: [e.x, e.y, e.x + e.w, e.y + e.h], opacity: e.opacity };
    if (node.kind === "text") {
      // The letters: the capture sends them on its sampled frames (every 0.5 s) and whenever the text's ink moved, so
      // between those frames the last letters sent are still the text's letters. Read them from the nearest earlier
      // frame, while the text stays on screen. (Once, snap --at between sampled frames saw no text at rest.)
      const t0 = ink.get(label);
      let letters = t0?.letters;
      for (let g = f - 1; t0 && !letters?.length && g >= 0; g--) {
        const prev = (det.ink?.[g] ?? []).find((x: any) => (x.node ?? x.id) === label);
        if (!prev) break;
        letters = prev.letters;
      }
      const t = t0 && letters?.length ? { ...t0, letters } : null;
      if (!t?.letters?.length) continue;
      // The baseline: from the capture (version 3), else the highest bottom among letters without a descender.
      const flat = t.letters.filter((l: number[]) => !/[gjpqyQ,;()\[\]{}|/]/.test(String.fromCodePoint(l[0]!)));
      const baseline = typeof t.base === "number" ? t.base : Math.min(...(flat.length ? flat : t.letters).map((l: number[]) => l[4]!));
      Object.assign(c, { ink: t.ink, baseline, cap: t.cap, xh: t.xh, fontPx: t.fontPx, letters: t.letters, text: t.text });
    }
    add(c);
  }
  // Lines and circles: from the capture's shapes. Their box is the geometry's, without the stroke.
  const shapes = (det.shapes?.frames ?? [])[f] ?? [], before = new Map<string, any>(((det.shapes?.frames ?? [])[f - 1] ?? []).map((x: any) => [x.id, x]));
  for (const sh of shapes) {
    const node = nodes.get(sh.id);
    if (!node || seen.has(sh.id) || !["path", "circle"].includes(node.kind)) continue;
    const p = before.get(sh.id);
    if (!p || p.box.some((v: number, i: number) => Math.abs(v - sh.box[i]) > REST)) {
      if ((sh.opacity ?? 1) >= 0.5) others.push({ id: sh.id, box: box(sh.box) });
      continue;
    }
    const b = sh.box as [number, number, number, number];
    add({ id: sh.id, kind: node.kind, box: b, opacity: sh.opacity ?? 1, ...(sh.width ? { stroke: sh.width } : {}) });
  }
  markOnPicture(els, nodes, f / (elements.fps ?? 30), others);
  return { t: f / (elements.fps ?? 30), width: W, height: H, safe: det.ctx?.safe ?? null, els, others, ghosts: ghostsOf(det.nodes ?? []), ignores, guides, ...textStates(det.nodes ?? [], els) };
}

/** The source files of a film: the films module and the scene modules it imports (as detect.ts finds them). */
export function sourcesOf(filmsModule: string, id: string): string[] {
  const text = readFileSync(filmsModule, "utf8");
  const file = (spec: string) => [".ts", ".tsx", ""].map((ext) => resolve(dirname(filmsModule), spec + ext)).find((p) => existsSync(p) && !p.endsWith("/"));
  const specs = [...text.matchAll(/from\s+"(\.[^"]+)"/g)].map((m) => m[1]!).filter((s) => !s.includes("/blocks/") && !s.endsWith("/film"));
  const own = specs.filter((s) => id.endsWith(`-${basename(s)}`) || id === basename(s) || id.includes(`-${basename(s)}-`));
  return [filmsModule, ...(own.length ? own : specs).map(file).filter((p): p is string => !!p)];
}

/**
 * The exceptions a scene declares for the align/* rules, read as the detector reads every other rule
 * (scripts/inspect/detect.py declarations): `// untell-ignore <rule> <node or block id> @<from>-<to>: <reason>`. The ids
 * and the span are optional; square brackets round an id (the old docs' [node]) are read as the id. With no id and no
 * span, the comment binds to the block call on the next code line (its `id: "..."`); with neither and no block call, it
 * covers the whole film. A reason is required.
 */
export function ignoresIn(files: string[]): Ignore[] {
  const out: Ignore[] = [];
  const IGNORE = /\/\/\s*untell-ignore\s+(align(?:\/[\w*-]+)?)\s*([^:\n]*?)\s*:\s*(.+)$/;
  const SPAN = /@\s*(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?\s*s?$/;
  const NODE_ID = /\bid:\s*["'`]([\w-]+)/;
  for (const f of files) {
    if (!existsSync(f)) continue;
    const lines = readFileSync(f, "utf8").split("\n");
    lines.forEach((line, i) => {
      const m = line.match(IGNORE);
      if (!m) return;
      let rest = m[2]!.trim();
      let span: [number, number] | null = null;
      const sm = rest.match(SPAN);
      if (sm) { const a = Number(sm[1]); span = [a, sm[2] ? Number(sm[2]) : a]; rest = rest.slice(0, sm.index).trim(); }
      let nodes = rest.split(/[\s,]+/).map((n) => n.replace(/^\[|\]$/g, "")).filter(Boolean);
      let bound: string | null = null;
      if (!nodes.length && !span) {
        for (const nxt of lines.slice(i + 1, i + 4)) {
          if (nxt.trim().startsWith("//")) continue;
          const k = nxt.match(NODE_ID);
          // A template id (`tick-${i}`) cannot be read: the comment covers every id that starts with it.
          const tpl = k ? nxt.slice(k.index! + k[0].length, k.index! + k[0].length + 2) === "${" : false;
          if (k) { nodes = [tpl ? `${k[1]!}*` : k[1]!]; bound = `the block call on the next line${tpl ? " (a template id: every id that starts with it)" : ""}`; }
          break;
        }
      }
      let scope = bound ?? (nodes.length ? "named nodes" : "");
      if (span) scope = `${scope ? scope + " " : ""}@${span[0]}-${span[1]} s`;
      out.push({ check: m[1]!, nodes, reason: m[3]!.trim(), span, where: `${basename(f)}:${i + 1}`, scope: scope || "the whole film" });
    });
  }
  return out;
}

/**
 * The guides a film's scene names (withGuides), resolved in the film's frame. The films module is imported in Bun:
 * the spec needs only the frame's size and safe area, so no browser is needed.
 */
export async function filmGuides(filmsModule: string, id: string, f: { width: number; height: number; safe?: { left: number; right: number; top: number; bottom: number } | null }): Promise<ResolvedGuides | null> {
  try {
    const { FILMS } = await import(resolve(filmsModule));
    return guidesOf(FILMS?.[id]?.props?.scene, f);
  } catch { return null; }
}

/** The time a node first shows: its first opacity key above 0, or 0. */
const showsFrom = (node: any) => {
  const o: { t: number; v: number }[] | undefined = node?.tracks?.opacity;
  if (!o?.length) return 0;
  return o.find((k) => k.v > 0.05)?.t ?? Infinity;
};

/**
 * Marks the lines and drawings placed by a picture (AlignEl.onPicture): a path or a circle whose box lies inside a
 * picture's box (a tower traced over the photo's tower). A node
 * the scene tags as traced (`traceOn`, `on`) counts too.
 */
export function markOnPicture(els: AlignEl[], nodes: Map<string, any>, t: number, others: { id: string; box: Box }[] = []) {
  // Every picture that shows now, at rest or moving (a photo under a slow push still carries its drawing).
  const pics = [...els.filter((e) => e.kind === "image"), ...others.filter((o) => nodes.get(o.id)?.kind === "image")];
  for (const e of els) {
    const n = nodes.get(e.id);
    if (n && (n.traceOn || n.tracedOn)) { e.onPicture = true; continue; }
    if (e.kind !== "path" && e.kind !== "circle") continue;
    for (const p of pics) {
      const b = e.box, q = p.box;
      // Inside a picture's box: drawn on what the picture shows. (The time it entered does not decide it: a photo can be
      // swapped for its copy under the drawing, as in an agent's Spec film, where the tower stays on the second copy.)
      if (b.x0 >= q.x0 - 0.5 && b.x1 <= q.x1 + 0.5 && b.y0 >= q.y0 - 0.5 && b.y1 <= q.y1 + 0.5 && showsFrom(n) <= t) { e.onPicture = true; break; }
    }
  }
}

const CHECK_OF: Record<string, string> = { centre: "align/centre", edge: "align/near-miss", baseline: "align/baseline", rhythm: "align/rhythm", "half-px": "align/half-px" };

/** What one align declaration did: how many findings it suppresses, and, when none, why and the selector that would match. */
export type DeclarationEffect = { rule: string; nodes: string[]; reason: string; where: string; scope: string; matched: number; why?: string };

/**
 * What each declaration did, as data: the findings it suppresses, and for one that matched nothing, why and the
 * selector that would match (the nearest finding of its rule). `issues` are merged over time (t0, t1), each with
 * `ignored` when a declaration covers it.
 */
export function declarationEffects(ignores: Ignore[], issues: { kind: string; el: string; target: { el: string }; t0: number; t1: number; ignored?: string }[]): DeclarationEffect[] {
  return ignores.map((d) => {
    const covered = (i: (typeof issues)[number]) => {
      const check = CHECK_OF[i.kind] ?? i.kind;
      const inSpan = !d.span || !(i.t1 < d.span[0] - 0.04 || i.t0 > d.span[1] + 0.04);
      return inSpan && declares({ ...d, span: null }, check, [i.el, i.target.el]);
    };
    const e: DeclarationEffect = { rule: d.check, nodes: d.nodes, reason: d.reason, where: d.where ?? "", scope: d.scope ?? "the whole film", matched: issues.filter((i) => i.ignored && covered(i)).length };
    if (e.matched) return e;
    const same = issues.filter((i) => d.check === "align" || d.check === "align/*" || CHECK_OF[i.kind] === d.check);
    if (!same.length) return { ...e, why: `no finding of ${d.check} in this film: remove it` };
    const f = same[0]!;
    const sel = `${f.el.split("-")[0]} @${f.t0.toFixed(2)}-${f.t1.toFixed(2)}`;
    return { ...e, why: `the nearest ${CHECK_OF[f.kind]} finding is on ${f.el} x ${f.target.el} at ${f.t0.toFixed(2)}-${f.t1.toFixed(2)} s: declare // untell-ignore ${CHECK_OF[f.kind]} ${sel}: <reason>` };
  });
}

/**
 * What each declaration did, in the detector's words: "declared <rule> <scope> (<file:line>): suppresses N finding(s)",
 * and for one that matched nothing, why and the selector that would match (the nearest finding of its rule).
 */
export function declarationLines(ignores: Ignore[], issues: { kind: string; el: string; target: { el: string }; t0: number; t1: number; ignored?: string }[]) {
  return declarationEffects(ignores, issues).map((e) => {
    const head = `declared ${e.rule}${e.nodes.length ? " " + e.nodes.join(" ") : ""} (${e.scope}, ${e.where}): ${e.reason}`;
    return e.matched ? `${head}: suppresses ${e.matched} finding(s)` : `${head}: matches nothing; ${e.why}`;
  });
}
