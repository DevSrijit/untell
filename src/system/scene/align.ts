// The alignment model: the lines a designer sees in a frame, the near misses on them, and the moves that fix them.
//
// It is pure. Its input is a frame at rest (`AlignFrame`): every visible element with its painted box, and for text
// its ink (baseline, cap height, x height, ink box). The snap capture (scripts/snap/capture.ts) and the detector's
// capture (scripts/detect.ts) both make one. Its output:
//   - features: the edges, centres and text lines of each element (left, right, cx, top, bottom, cy, line, baseline,
//     band top, band centre),
//   - lines: the features that share one value (within 0.5 px), with the elements on each,
//   - issues: what a designer would call a mistake, ranked by confidence:
//       centre    a child's optical centre is 1 px to the tolerance off its container's centre (the "cone 10" case),
//       edge      two related edges are 0.5 px to the tolerance apart (the "Start firing" case),
//       baseline  texts in one row whose baselines differ,
//       rhythm    a run of like siblings whose gaps differ by a few px,
//       half-px   an edge, a hairline or a baseline on a fraction of a px (it blurs),
//   - proposals: one move for each issue that can be fixed, solved together (see `solve`). Each has a stable id.
// It never moves anything by itself. `applyMoves` moves nodes for a preview. `withSnap` applies accepted moves as
// relations (a snap table in the scene source), so they stay right when content changes.
//
// The rules of a move: a named guide never moves; a data mark never moves; the element with more relations on the
// line stays; text moves by whole px; nothing leaves the frame, and no text leaves the safe area; no move creates an
// overlap, breaks a containment or leaves a new near miss behind.
import { inkMetrics } from "./layout";
import type { Ctx, Node } from "./types";

// ---------------------------------------------------------------- types

export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Axis = "x" | "y";
export type ElKind = "text" | "rect" | "circle" | "path" | "image" | "guide";

/** A text's ink: the baseline, the cap and x heights of its font at its size, its ink box and its letters' boxes. */
export type Ink = { baseline: number; cap: number; xh: number; ink: Box; fontPx: number; letters?: Box[]; tall?: boolean };

export type AlignEl = {
  id: string;
  kind: ElKind;
  /** The painted box. A path's box has no stroke; a hairline's box is its centre line. */
  box: Box;
  stroke?: number;
  text?: Ink;
  /** The node's layer: an overlay (1) such as a cursor never takes part. */
  layer?: number;
  /** A data mark (a bar, a plotted point, an axis): its place encodes a value, so it never moves. */
  data?: boolean;
  /** A mark whose own place shows a value (a tick, a dot): not centred in what holds it. A label in a bar is data, not a mark. */
  mark?: boolean;
  /** Text: how the scene sets it in its width (a node with `width` and `align`). Without it, the model infers it. */
  set?: TextSet;
  /**
   * The painter puts this box on whole px: a box placed by its layout (left, top), with no transform at rest. Chrome
   * rounds such a box's edges, so a fractional position does not blur (measured on the survey: 289 of 296 box edges
   * at .5 were crisp; the 7 soft ones had a scale or a fractional translate at rest).
   */
  snapped?: boolean;
  /** Tags a block gives its nodes: the group, row and column it lays them out in (see systems/playbooks/ALIGN.md). */
  tags?: AlignTags;
  /** Turned at rest (a rotation or a tilt): its box is not its shape, so it has no lines and no half-px edges. */
  rotated?: boolean;
  /**
   * Placed by a picture: a line or a drawing traced on what the picture shows (a tower drawn over the photo's tower).
   * Its place is the picture's content, so it is never a near miss and never moves.
   */
  onPicture?: boolean;
};

export type TextSet = "start" | "centre" | "end";
export type AlignTags = { group?: string; row?: string; col?: string };

export type AlignFrame = {
  width: number; height: number;
  safe?: { left: number; right: number; top: number; bottom: number } | null;
  els: AlignEl[];
  /** Ids of anchors and other undrawn nodes: they join groups (a block call) but have no features. */
  ghosts?: { id: string; box: Box }[];
  /**
   * Text nodes of the scene that do not show at this moment (a tab's "on" label while it is off), with their y and
   * role: a line set that moves one state of a label moves its other states too.
   */
  hidden?: { id: string; y: number; role: string }[];
  /** A camera moves or zooms the view: rest positions land on fractions of a px by its transform, so half-px is not checked. */
  camera?: boolean;
  /** Each shown text node's y and role in the scene model (for `hidden`). */
  textY?: Record<string, { y: number; role: string }>;
  /** Declared exceptions: `// untell-ignore <check> [node ...]: <reason>` in the scene source. */
  ignores?: Ignore[];
  /** The scene's guides (columns, a baseline unit, named lines), resolved to px: see `resolveGuides`. */
  guides?: ResolvedGuides | null;
  /** The frame's time in seconds (a declared span covers the frames in it). */
  t?: number;
  /** Elements that show but are not at rest (an icon that draws on): no features, but they count as siblings. */
  others?: { id: string; box: Box }[];
};

/**
 * A declared exception, as the detector reads it: `// untell-ignore <rule> <node or block id> @<from>-<to>: <reason>`.
 * The ids and the span are optional; an id in square brackets is the id. `where` is the file and line, `scope` says
 * what it covers (the named nodes, the block call on the next line, a span, or the whole film).
 */
export type Ignore = { check: string; nodes: string[]; reason: string; span?: [number, number] | null; where?: string; scope?: string };

export type FeatureName = "left" | "right" | "cx" | "top" | "bottom" | "cy" | "line" | "baseline" | "bandTop" | "bandCy" | "bandCx";
export type Feature = { el: string; name: FeatureName; axis: Axis; v: number };

export type Line = { axis: Axis; v: number; members: Feature[] };

export type IssueKind = "centre" | "edge" | "baseline" | "rhythm" | "half-px";
export type Level = "error" | "warning" | "advice";

export type Issue = {
  kind: IssueKind;
  /** The element that is off, its feature, and the value it has. */
  el: string; feature: FeatureName; axis: Axis; v: number;
  /** Where it belongs: a value, and what makes that value (a container's centre, a line and its members). */
  to: number;
  target: { el: string; feature: FeatureName | "gap" | "px" };
  /** Others on the target line. */
  on: string[];
  off: number;
  tol: number;
  confidence: number;
  level: Level;
  why: string;
  /** The id of the proposal that fixes it, when one does. */
  fix?: string;
  ignored?: string;
  /** True when another issue's proposal fixes this one too (a symptom of the same fault). */
  via?: boolean;
  /** Rhythm: the run's gap, px. */
  gap?: number;
  /**
   * The relation that supports the issue, or the reason it is weak. Its level comes from the judged precision of
   * its class (see LEVELS): an error only where a designer agreed with 95 % of the survey's findings.
   */
  cls: string;
};

export type Move = { id?: string; nodes: string[]; dx: number; dy: number };

export type Proposal = {
  id: string;
  kind: IssueKind;
  /** The nodes that move together, and the group they form (a block call or a part of one). */
  nodes: string[];
  group: string;
  axis: Axis;
  /** The moving element and feature, from and to (px). */
  el: string; feature: FeatureName; from: number; to: number;
  delta: number;
  joins: { el: string; feature: string; on: string[] };
  why: string;
  confidence: number;
  level: Level;
  /** Another way to fix the same issue, and why it lost. */
  alt?: { nodes: string[]; group: string; delta: number; why: string };
  /** Undrawn nodes that sit in the moved box (a cursor's aim): they do not follow a snap. */
  dependants?: string[];
  /** Relation for the snap table (withSnap). */
  rel: SnapRel;
  /** Proposals this one builds on: apply and preview them with it (the CLI adds them). */
  needs?: string[];
  /** Issues at warning or error in the frame before, and after this proposal with the ones it needs (fewer, always). */
  issuesBefore?: number; issuesAfter?: number;
};

export type Analysis = { tol: number; features: Feature[]; lines: Line[]; issues: Issue[]; proposals: Proposal[]; groups: Record<string, string[]>; parents: Record<string, string>;
  /** How each text is set (start, centre, end, or free) and which texts are words of running text. */
  sets: Record<string, string>; words: string[] };

// ---------------------------------------------------------------- small helpers

const W = (b: Box) => b.x1 - b.x0;
const H = (b: Box) => b.y1 - b.y0;
const lo = (b: Box, a: Axis) => (a === "x" ? b.x0 : b.y0);
const hi = (b: Box, a: Axis) => (a === "x" ? b.x1 : b.y1);
const other = (a: Axis): Axis => (a === "x" ? "y" : "x");
const r1 = (v: number) => Math.round(v * 10) / 10;
const inside = (a: Box, b: Box, slack = 0.5) => a.x0 >= b.x0 - slack && a.y0 >= b.y0 - slack && a.x1 <= b.x1 + slack && a.y1 <= b.y1 + slack;
const meets = (a: Box, b: Box, g = 0) => a.x0 < b.x1 - g && b.x0 < a.x1 - g && a.y0 < b.y1 - g && b.y0 < a.y1 - g;
const shift = (b: Box, a: Axis, d: number): Box => (a === "x" ? { ...b, x0: b.x0 + d, x1: b.x1 + d } : { ...b, y0: b.y0 + d, y1: b.y1 + d });
/** The overlap of two ranges on an axis, as a share of the shorter one. */
const overlapShare = (a: Box, b: Box, ax: Axis) => {
  const o = Math.min(hi(a, ax), hi(b, ax)) - Math.max(lo(a, ax), lo(b, ax));
  const s = Math.min(hi(a, ax) - lo(a, ax), hi(b, ax) - lo(b, ax));
  return s <= 0 ? (o >= 0 ? 1 : 0) : Math.max(0, o) / s;
};
/** The empty distance between two boxes (0 when they meet). */
const gapBetween = (a: Box, b: Box) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));

/** A short stable id: a prefix and five base-36 digits of a hash of the key (FNV-1a). */
export function hunkId(prefix: string, key: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${prefix}-${(h % 60466176).toString(36).padStart(5, "0")}`;
}

/** The tolerance of the frame: about 2 % of its short side. Two edges closer than this and further than 0.5 px are a near miss. */
export const frameTol = (f: { width: number; height: number }) => 0.02 * Math.min(f.width, f.height);

/** A hairline: a path whose box is a line (a rule, a divider), or a box 3 px thick or less (a rule drawn as a box). */
const hairAxis = (e: AlignEl): Axis | null => {
  if (e.kind !== "path" && e.kind !== "rect") return null;
  const t = e.kind === "rect" ? 3 : Math.max(2, (e.stroke ?? 1) * 1.5);
  if (H(e.box) <= t && W(e.box) > 4 * t) return "y";
  if (W(e.box) <= t && H(e.box) > 4 * t) return "x";
  return null;
};

/** The painted box of an element, its stroke included: what can overlap. */
export const paintBox = (e: AlignEl): Box => {
  if (e.text) return e.text.ink;
  const s = e.kind === "path" ? (e.stroke ?? 0) / 2 : 0;
  return { x0: e.box.x0 - s, y0: e.box.y0 - s, x1: e.box.x1 + s, y1: e.box.y1 + s };
};

// ---------------------------------------------------------------- text bands

/**
 * The band a designer centres in a text: from the baseline up to the cap line when any letter stands taller than the
 * x height (a capital, a figure or an ascender), else up to the x line. Descenders do not count. So "cone 10" centres
 * the band from its baseline to the top of its figures, and "cone" the band from its baseline to its x line.
 */
export function bandOf(t: Ink): { top: number; bottom: number; tall: boolean } {
  let tall = t.tall;
  if (tall === undefined) {
    const mid = t.baseline - (t.xh + t.cap) / 2;
    // A letter counts as tall when its top is above the middle of the x and cap lines and it is a real letter (not a quote mark).
    tall = (t.letters ?? []).some((l) => l.y0 < mid && H(l) > 0.6 * t.cap);
    if (!t.letters?.length) tall = t.ink.y0 < mid;
  }
  return { top: t.baseline - (tall ? t.cap : t.xh), bottom: t.baseline, tall };
}

// ---------------------------------------------------------------- features

/** The alignment features of one element. */
export function featuresOf(e: AlignEl): Feature[] {
  const f = (name: FeatureName, axis: Axis, v: number): Feature => ({ el: e.id, name, axis, v });
  const b = e.box;
  if (e.kind === "guide") return W(b) === 0 ? [f("line", "x", b.x0)] : [f("line", "y", b.y0)];
  if (e.text) {
    const band = bandOf(e.text);
    // Across, a text centres by its layout box (as a block centres it by its measured width): its ink sits a side
    // bearing inside the box on each side, and the two bearings differ by a px or two.
    return [f("left", "x", b.x0), f("right", "x", b.x1), f("bandCx", "x", (b.x0 + b.x1) / 2),
      f("baseline", "y", e.text.baseline), f("bandTop", "y", band.top), f("bandCy", "y", (band.top + band.bottom) / 2)];
  }
  const ha = hairAxis(e);
  if (ha === "y") return [f("left", "x", b.x0), f("right", "x", b.x1), f("line", "y", (b.y0 + b.y1) / 2)];
  if (ha === "x") return [f("line", "x", (b.x0 + b.x1) / 2), f("top", "y", b.y0), f("bottom", "y", b.y1)];
  return [f("left", "x", b.x0), f("right", "x", b.x1), f("cx", "x", (b.x0 + b.x1) / 2), f("top", "y", b.y0), f("bottom", "y", b.y1), f("cy", "y", (b.y0 + b.y1) / 2)];
}

/** Features of one class compare with each other: edges with edges, centres with centres, baselines with baselines. */
const CLASS: Record<FeatureName, "edge" | "centre" | "base" | "none"> = {
  left: "edge", right: "edge", top: "edge", bottom: "edge", line: "edge", cx: "centre", cy: "centre", bandCx: "centre", bandCy: "centre",
  baseline: "base", bandTop: "none",
};
/** Opposite edges (top and bottom) only align when the two elements stand side by side. */

// ---------------------------------------------------------------- groups and containers

/**
 * Groups from ids: a block prefixes every node it draws with its id, so "row1-badge-text" belongs to "row1-badge"
 * and to "row1". A prefix is a group when two nodes or more share it. Returns prefix -> member ids.
 */
export function groupsOf(ids: string[]): Record<string, string[]> {
  const count = new Map<string, string[]>();
  for (const id of ids) {
    const parts = id.split("-");
    for (let k = 1; k < parts.length; k++) {
      const p = parts.slice(0, k).join("-");
      if (!count.has(p)) count.set(p, []);
      count.get(p)!.push(id);
    }
  }
  const out: Record<string, string[]> = {};
  for (const [p, m] of count) if (m.length >= 2) out[p] = m;
  return out;
}

/** The groups an id belongs to, from the smallest to the largest. */
const chainOf = (id: string, groups: Record<string, string[]>) => {
  const parts = id.split("-");
  const out: string[] = [];
  for (let k = parts.length - 1; k >= 1; k--) { const p = parts.slice(0, k).join("-"); if (groups[p]) out.push(p); }
  return out;
};

/** Each element's container: the smallest visible box (a rect, a picture, a circle) that holds it. Text counts by its ink. */
export function parentsOf(els: AlignEl[]): Record<string, string> {
  const boxes = els.filter((e) => e.kind === "rect" || e.kind === "image" || e.kind === "circle");
  const out: Record<string, string> = {};
  for (const e of els) {
    if (e.kind === "guide") continue;
    const pb = paintBox(e);
    let best: AlignEl | null = null;
    for (const c of boxes) {
      if (c.id === e.id || W(c.box) * H(c.box) <= W(pb) * H(pb) + 1) continue;
      // A text's ink may pass its highlight by a px or two (a descender, an overshoot): it still sits in it.
      if (!inside(pb, c.box, e.text ? Math.max(0.5, 0.05 * e.text.fontPx) : 0.5)) continue;
      // On a tie (a face and its pressed edge, one size) the later one, drawn on top, holds it.
      if (!best || W(c.box) * H(c.box) <= W(best.box) * H(best.box)) best = c;
    }
    if (best) out[e.id] = best.id;
  }
  return out;
}

const ancestors = (id: string, parents: Record<string, string>) => {
  const out: string[] = [];
  for (let p = parents[id]; p && out.length < 50; p = parents[p]) out.push(p);
  return out;
};

// ---------------------------------------------------------------- lines

/** Features that share a value (within 0.5 px), per axis. A line holds the features of two elements or more. */
export function linesOf(features: Feature[]): Line[] {
  const out: Line[] = [];
  for (const axis of ["x", "y"] as const) {
    const fs = features.filter((f) => f.axis === axis && CLASS[f.name] !== "none").sort((a, b) => a.v - b.v);
    let run: Feature[] = [];
    const flush = () => {
      if (new Set(run.map((f) => f.el)).size >= 2) out.push({ axis, v: run.reduce((s, f) => s + f.v, 0) / run.length, members: run });
      run = [];
    };
    for (const f of fs) {
      if (run.length && f.v - run[0]!.v > 0.5) flush();
      run.push(f);
    }
    flush();
  }
  return out;
}

// ---------------------------------------------------------------- analysis

type Ctx2 = {
  frame: AlignFrame; els: Map<string, AlignEl>; feats: Feature[]; parents: Record<string, string>; groups: Record<string, string[]>;
  short: number; tol: number; allIds: string[];
  /** Words of running text (a caption, a line split into word nodes): their x edges and centres follow the words. */
  words?: Set<string>;
  /** Boxes that hold one word of running text (a highlight): they follow the line, not a grid. */
  wordBoxes?: Set<string>;
  /** How each text is set: by the scene, or inferred from the lines it shares ("free" when nothing tells). */
  sets?: Map<string, TextSet | "free">;
};

const LEVEL = (c: number): Level => (c >= 0.6 ? "error" : c >= 0.35 ? "warning" : "advice");

const sceneGuide = (e: AlignEl) => e.id.startsWith("guide:scene.");

/** Tolerance for a pair: the frame's, smaller for small elements (a 30 px icon gets about a third). */
function pairTol(k: Ctx2, a: AlignEl, b: AlignEl) {
  const size = (e: AlignEl) => (e.kind === "guide" ? Infinity : Math.max(W(e.box), H(e.box)));
  const s = Math.min(size(a), size(b));
  return k.tol * Math.min(1, Math.max(0.3, s / (0.08 * k.short)));
}

/**
 * How related two elements are, 0 to 1: one holds the other, or they share a container or a block (1); they are
 * neighbours on the other axis with nothing between them (0.85); else it falls with the distance between them.
 */
function relatedness(k: Ctx2, a: AlignEl, b: AlignEl, axis: Axis): number {
  // A guide the scene names is placed on by intent; the frame's centre line only pulls what is near it.
  if (a.kind === "guide" || b.kind === "guide") return sceneGuide(a) || sceneGuide(b) ? 1 : 0.7;
  const pa = k.parents[a.id], pb = k.parents[b.id];
  if (pa === b.id || pb === a.id) return 1;
  // One block call: its parts belong together when nothing stands between them.
  const ga = chainOf(a.id, k.groups), gb = new Set(chainOf(b.id, k.groups));
  const sameBlock = ga.some((g) => gb.has(g));
  // Children of two different containers (a toast and a window) are laid out apart: their lines matter less.
  // (Not when one container holds the other: a button's label and the tabs beside the button share a toolbar.)
  const apart = pa && pb && pa !== pb && !ancestors(pa, k.parents).includes(pb) && !ancestors(pb, k.parents).includes(pa) ? 0.6 : 1;
  const A = paintBox(a), B = paintBox(b);
  const g = gapBetween(A, B);
  // Neighbours: side by side across the axis (they share a row for a y feature, a column for an x feature).
  const across = other(axis);
  const side = overlapShare(A, B, axis) > 0 || overlapShare(A, B, across) > 0;
  if (side && g < 0.5 * k.short) {
    const skip = new Set([a.id, b.id, ...ancestors(a.id, k.parents), ...ancestors(b.id, k.parents)]);
    const between = [...k.els.values()].some((e) => !skip.has(e.id) && e.kind !== "guide" && !e.layer
      && meets(paintBox(e), { x0: Math.min(A.x1, B.x1), y0: Math.min(A.y1, B.y1), x1: Math.max(A.x0, B.x0), y1: Math.max(A.y0, B.y0) }));
    // Siblings in one container with nothing between them belong together.
    if (!between) return (pa && pa === pb) || sameBlock ? 1 : 0.85 * apart;
  }
  return 0.8 * apart * Math.exp(-g / (0.12 * k.short));
}

/** Confidence from the offset: a 1-3 px miss is surely a mistake; near the tolerance it may be a different line on purpose. */
const offConf = (d: number, tol: number) => Math.max(0.2, Math.min(1, 1 - 0.6 * (Math.max(0, d - 3) / Math.max(1, tol - 3)) ** 2));

/** True when a declaration covers an issue: its rule (or align/*), its ids (a block id covers its nodes), its span. */
export const declares = (i: Ignore, check: string, ids: string[], t?: number) =>
  (i.check === check || i.check === "align/*" || i.check === "align")
  && (!i.span || t === undefined || (t >= i.span[0] - 0.04 && t <= i.span[1] + 0.04))
  && (!i.nodes.length || ids.some((id) => i.nodes.some((n) => (n.endsWith("*") ? id.startsWith(n.slice(0, -1)) : id === n || id.startsWith(n + "-") || n.startsWith(id + "-")))));
const ignoredBy = (k: Ctx2, check: string, ids: string[]) => {
  const ig = (k.frame.ignores ?? []).find((i) => declares(i, check, ids, k.frame.t));
  return ig ? ig.reason : undefined;
};

/**
 * Words of running text and the boxes that hold one word each. A word is a text with a neighbour of its own block on
 * its baseline, closer than 0.8 of its font size (kinetic words, a caption, a line split into word nodes); every text
 * of that block at that size is a word too (the other lines of the paragraph). A word box is a box whose children are
 * all words (a caption's highlight). On the survey, their x edges and centres never made a line a designer would fix:
 * 49 near misses between words of two lines, 63 between a highlight and the words beside it.
 */
function wordsOf(k: Ctx2): { words: Set<string>; wordBoxes: Set<string> } {
  const words = new Set<string>();
  const texts = [...k.els.values()].filter((e) => e.text && !e.layer);
  const runs = new Map<string, number>();
  for (const a of texts) for (const b of texts) {
    if (a.id === b.id || Math.abs(a.text!.baseline - b.text!.baseline) > 0.5 || gapBetween(a.box, b.box) > 0.8 * a.text!.fontPx) continue;
    const ga = new Set(chainOf(a.id, k.groups));
    const g = chainOf(b.id, k.groups).find((x) => ga.has(x));
    if (g === undefined) continue;
    words.add(a.id);
    runs.set(g, a.text!.fontPx);
  }
  for (const t of texts) for (const [g, px] of runs) {
    if (Math.abs(t.text!.fontPx - px) <= 0.5 && chainOf(t.id, k.groups).includes(g)) words.add(t.id);
  }
  const kids = new Map<string, string[]>();
  for (const [c, p] of Object.entries(k.parents)) { if (!kids.has(p)) kids.set(p, []); kids.get(p)!.push(c); }
  const wordBoxes = new Set<string>();
  for (const [p, cs] of kids) if (cs.length && cs.every((c) => words.has(c)) && k.els.get(p)?.kind === "rect") wordBoxes.add(p);
  return { words, wordBoxes };
}

/**
 * How each text is set. The scene says it for a text with a width and an align. Else: a text whose ink centre sits on
 * its container's centre or on another element's centre (the frame's centre line too) is centred, unless its left
 * edge also shares a line; a text whose left edge shares a line is set left; one whose right edge shares a line is
 * set right; any other text is free (its left edge and its centre may each be a line, its right edge is not). Only
 * the edge a text is set on is a line: the other edge is ragged, and the centre of a text set left is where its width ends (the survey's 27 "centre" near misses of texts set left, and the
 * headline of an agent's film, were all false).
 */
function setsOf(k: Ctx2, lines: Line[]): Map<string, TextSet | "free"> {
  const out = new Map<string, TextSet | "free">();
  const on = (e: AlignEl, name: FeatureName, tol: number, names: FeatureName[]) => {
    const v = featuresOf(e).find((f) => f.name === name)!.v;
    // Copies of one part (bar-0-value, bar-1-value) share their edges by construction: they do not tell how it is set.
    const role = (id: string) => id.replace(/\d+/g, "#");
    return k.feats.some((f) => f.el !== e.id && f.axis === "x" && names.includes(f.name) && Math.abs(f.v - v) <= tol
      && !k.words?.has(f.el) && k.parents[e.id] !== f.el && k.parents[f.el] !== e.id && role(f.el) !== role(e.id));
  };
  for (const e of k.els.values()) {
    if (!e.text) continue;
    if (e.set) { out.set(e.id, e.set); continue; }
    const p = k.parents[e.id] ? k.els.get(k.parents[e.id]!) : null;
    const left = on(e, "left", 1.5, ["left", "line"]);
    const right = on(e, "right", 1.5, ["right", "line"]);
    const inP = p ? Math.abs((e.box.x0 - p.box.x0) - (p.box.x1 - e.box.x1)) <= 2 : false;
    const centre = inP || on(e, "bandCx", 1, ["cx", "bandCx"]) || Math.abs((e.box.x0 + e.box.x1) / 2 - k.frame.width / 2) <= 1;
    out.set(e.id, centre && !left ? "centre" : left ? "start" : right ? "end" : "free");
  }
  void lines;
  return out;
}

/**
 * The highest level a class of issue may have: its precision on the judged survey (out/snap/survey/JUDGED.md) sets
 * it. Error needs 95 % or more, warning 80 % or more; any other class is advice at most. A class not in the table is
 * a warning at most.
 */
export const LEVELS: Record<string, Level> = {
  // Judged on the survey of 2026-11-21 (304 films: the 20 reels, the block films at 9:16 and 16:9, the align films).
  "centre contain": "error", //       a child centred in what holds it: 38 of 39 real; held out 3 of 3 (2 of 6 before four rules); current tree 33 of 34
  "edge block": "error", //           parts of one block call: 7 of 7 real (6 on the frozen kiln frame: few scenes); 6 of 6 on the current tree
  "edge sibling": "error", //         siblings side by side in one container: 12 of 12 real
  "edge tag": "error", //             the scene says they are one row, column or group: no finding yet; the scene's own word
  "edge guide": "error", //           a guide the scene names: no finding yet; the scene's own word
  "edge frame-centre": "warning", //  the frame's centre line only: nothing says it is meant
  "edge repeat": "advice", //         a line of three or more: 6 of 8 real (75 %)
  "edge near": "advice", //           nearness only: 0 of 2 real
  "edge hairline-end": "advice", //   the end of a rule or an arrow's line: 4 of 13 real
  "baseline row": "error", //         one block or one container: 2 of 2 real, no false one on 304 films
  "baseline row-apart": "advice", //  two blocks side by side: 0 of 1 real
  "rhythm run": "error", //           like siblings: 1 of 1 real, no false one on 304 films (the matrix false alarm is gone)
  "half-px hairline": "error", //     a rule on a fraction: 105 of 105 real
  "half-px box": "advice", //         a box under a transform at rest: 6 of 13 real on the current tree (pop cells end crisp)
  "half-px text": "advice", //        Chrome sets glyphs on whole px rows
};
const RANK: Record<Level, number> = { advice: 0, warning: 1, error: 2 };
/** The level of an issue: from its confidence, capped by its class. */
const levelFor = (kind: IssueKind, cls: string, conf: number): Level => {
  const cap = LEVELS[`${kind} ${cls}`] ?? "warning";
  const l = LEVEL(conf);
  return RANK[l] <= RANK[cap] ? l : cap;
};

function centreIssues(k: Ctx2): Issue[] {
  const out: Issue[] = [];
  for (const [cid, pid] of Object.entries(k.parents)) {
    const c = k.els.get(cid)!, p = k.els.get(pid)!;
    // A data mark sits at its value (a tick under a dot), not in the middle of what holds it.
    if (c.layer || p.layer || hairAxis(c) || c.mark || c.rotated || p.rotated || c.onPicture) continue;
    // A text over a picture is set by the layout (a lower third, the safe area), not centred on the picture.
    if (c.text && p.kind === "image") continue;
    // A word in its highlight follows the line, not the box (the survey: a word of x-height letters sits low in a
    // highlight sized for the line, as every word of the line does).
    if (k.wordBoxes?.has(pid)) continue;
    // A letter typed as its own node (a typed note, letter by letter): one glyph's band is not its line's band.
    if (k.words?.has(cid) && (c.text?.letters?.length ?? 3) <= 2) continue;
    const pb = p.box;
    for (const axis of ["x", "y"] as const) {
      const band = c.text ? bandOf(c.text) : null;
      const [a0, a1] = axis === "y" ? (band ? [band.top, band.bottom] : [c.box.y0, c.box.y1]) : [c.box.x0, c.box.x1];
      const insetLo = a0 - lo(pb, axis), insetHi = hi(pb, axis) - a1;
      if (insetLo <= 0 || insetHi <= 0) continue;
      const off = (a0 + a1) / 2 - (lo(pb, axis) + hi(pb, axis)) / 2;
      const d = Math.abs(off);
      // Meant to be centred: the two insets are close (their difference under half their sum), and the child is not
      // tiny in its container (over 12 % of it on this axis).
      if (Math.abs(insetLo - insetHi) / (insetLo + insetHi) >= 0.5) continue;
      // Across, a text set left or right in its container is not centred in it; nor is a text the scene sets left.
      if (axis === "x" && c.text && (k.sets?.get(cid) === "start" || k.sets?.get(cid) === "end")) continue;
      // A child with a sibling beside it in the same container (on the other axis) is one of a row or a column of
      // items, not a single centred child (an icon and a label in a button centre as a group).
      const cb = paintBox(c);
      if (siblingsOf(k, cid, pid).some((sb) => overlapShare(sb, cb, other(axis)) > 0.3 && overlapShare(sb, cb, axis) === 0)) continue;
      if ((a1 - a0) / (hi(pb, axis) - lo(pb, axis)) < 0.12) continue;
      // A child laid out with two siblings or more (a panel of content) is centred only when one of them is centred
      // in the container on this axis too; else the layout sets them on edges (a git graph in a window, a short bar
      // of a list icon set left with the others).
      const sibs = siblingsOf(k, cid, pid);
      const mid = (b: Box & { band?: [number, number] }) => (axis === "y" && b.band ? (b.band[0] + b.band[1]) / 2 : (lo(b, axis) + hi(b, axis)) / 2);
      if (sibs.length >= 2 && !sibs.some((b) => Math.abs(mid(b) - (lo(pb, axis) + hi(pb, axis)) / 2) <= 3)) continue;
      // A child that shares its start or end edge with a sibling is set on that edge with it, not centred.
      // (Boxes only: texts in a row share a baseline by design.)
      if (!c.text && sibs.some((b) => !b.band && (Math.abs(lo(b, axis) - a0) <= 0.5) !== (Math.abs(hi(b, axis) - a1) <= 0.5))) continue;
      // A text's band is measured to a tenth of a px and placed by whole px: 1.25 px is the least that is off for sure.
      const min = axis === "y" ? (c.text ? 1.25 : 1) : Math.max(1.5, 0.04 * (c.text?.fontPx ?? 0));
      // A text placed by its line box rides high by about a tenth of its size; a text 0.17 of its size or more off
      // the centre is set there on purpose (a label at the top of a plate). Judged: every real miss was 0.13 or less,
      // the two false ones 0.19 (held-out films).
      const tolC = Math.min(k.tol, 0.25 * (hi(pb, axis) - lo(pb, axis)));
      if (d <= min || d >= tolC || (axis === "y" && c.text && d >= 0.17 * c.text.fontPx)) continue;
      const name: FeatureName = c.text ? (axis === "y" ? "bandCy" : "bandCx") : axis === "y" ? "cy" : "cx";
      const conf = Math.min(1, offConf(d, tolC) * (c.text ? 1 : 0.9));
      const ig = ignoredBy(k, "align/centre", [cid]);
      out.push({ kind: "centre", el: cid, feature: name, axis, v: r1((a0 + a1) / 2), to: r1((a0 + a1) / 2 - off), target: { el: pid, feature: axis === "y" ? "cy" : "cx" }, on: [pid],
        off: r1(off), tol: r1(tolC), confidence: r1(conf * 100) / 100, level: levelFor("centre", "contain", conf), cls: "contain",
        why: `${c.text ? "The ink of" : "The box of"} ${cid} is ${r1(d)} px ${axis === "y" ? (off < 0 ? "above" : "below") : off < 0 ? "left of" : "right of"} the centre of ${pid}, which holds it with near-equal insets.`,
        ...(ig ? { ignored: ig } : {}) });
    }
  }
  return out;
}

/** The boxes of a child's siblings in its container: elements at rest, and elements that show but move. */
function siblingsOf(k: Ctx2, cid: string, pid: string): (Box & { band?: [number, number] })[] {
  const p = k.els.get(pid)!;
  const rest = Object.entries(k.parents).filter(([sid, sp]) => sp === pid && sid !== cid).map(([sid]) => {
    const e = k.els.get(sid)!;
    const b = e.text ? bandOf(e.text) : null;
    return { ...paintBox(e), ...(b ? { band: [b.top, b.bottom] as [number, number] } : {}) };
  });
  const moving = (k.frame.others ?? []).filter((o) => o.id !== cid && o.id !== pid && inside(o.box, p.box, 0.5) && W(o.box) * H(o.box) < W(p.box) * H(p.box)).map((o) => o.box);
  return [...rest, ...moving];
}

/** The tags two elements share on an axis: a row tag for y, a column tag for x, or a group tag for both. */
const sharedTag = (a: AlignEl, b: AlignEl, axis: Axis) => {
  const ta = a.tags, tb = b.tags;
  if (!ta || !tb) return null;
  if (axis === "y" && ta.row && ta.row === tb.row) return `row ${ta.row}`;
  if (axis === "x" && ta.col && ta.col === tb.col) return `col ${ta.col}`;
  if (ta.group && ta.group === tb.group) return `group ${ta.group}`;
  return null;
};
/** Two elements the scene tags apart on an axis: two rows of one group (for y), two columns (for x). */
const taggedApart = (a: AlignEl, b: AlignEl, axis: Axis) => {
  const ta = a.tags, tb = b.tags;
  if (!ta || !tb) return false;
  if (axis === "y" && ta.row && tb.row && ta.row !== tb.row) return true;
  if (axis === "x" && ta.col && tb.col && ta.col !== tb.col) return true;
  return false;
};

function edgeIssues(k: Ctx2, lines: Line[]): Issue[] {
  const byEl = new Map<string, Feature[]>();
  // Only the edge a text is set on is a line (see setsOf); a word of running text has no x lines at all.
  for (const f of k.feats) {
    const e = k.els.get(f.el);
    if (e?.text && f.axis === "x") {
      if (k.words?.has(f.el)) continue;
      const set = k.sets?.get(f.el) ?? "free";
      // A free text (nothing tells how it is set) keeps its left edge: most text is set left. Its centre is a line
      // only when something shows it is centred (on the survey, every centre near miss of a free text was false).
      if ((f.name === "left" && set !== "start" && set !== "free") || (f.name === "right" && set !== "end") || (f.name === "bandCx" && set !== "centre")) continue;
    }
    if (!byEl.has(f.el)) byEl.set(f.el, []);
    byEl.get(f.el)!.push(f);
  }
  const lineOf = (f: Feature) => lines.find((l) => l.axis === f.axis && l.members.some((m) => m.el === f.el && m.name === f.name));
  const membersOf = (f: Feature) => [...new Set((lineOf(f)?.members ?? [f]).map((m) => m.el))];
  // A tiny mark (under 2 % of the short side both ways: a signal bar, a dot of an icon) has no lines of its own.
  const tiny = (e: AlignEl) => e.kind !== "guide" && W(paintBox(e)) < 0.02 * k.short && H(paintBox(e)) < 0.02 * k.short;
  // A text of one or two letters is a cell of a grid (a terminal's column, initials): it follows its grid or its
  // container, and has no edge lines of its own.
  const cell = (e: AlignEl) => !!e.text && (e.text.letters?.length ?? 3) <= 2;
  // A curve, an arc or an outline drawn as a path: its box is not a line a designer aligns (a rule is).
  const curve = (e: AlignEl) => e.kind === "path" && !hairAxis(e);
  // A pattern: twelve or more like marks of one block (halftone dots, hatching, a grid of cells) is a texture.
  const like = new Map<string, number>();
  const sig = (e: AlignEl) => `${e.id.replace(/\d+/g, "#")}|${e.kind}`;
  for (const e of k.els.values()) like.set(sig(e), (like.get(sig(e)) ?? 0) + 1);
  const pattern = (e: AlignEl) => (like.get(sig(e)) ?? 0) >= 12;
  const els = [...k.els.values()].filter((e) => !e.layer && !e.rotated && !e.onPicture && !tiny(e) && !cell(e) && !curve(e) && !pattern(e) && !k.wordBoxes?.has(e.id));
  // Parts of a drawing: shapes of one block that overlap each other (the bars of a drawn pi, a dimension tick across
  // its extension line). Their own edges are not lines for anything outside the drawing.
  const own = (e: AlignEl) => chainOf(e.id, k.groups)[0];
  const part = new Set<string>();
  for (const a of els) for (const b of els) {
    if (a.id >= b.id || a.text || b.text || a.kind === "guide" || b.kind === "guide" || !own(a) || own(a) !== own(b)) continue;
    const A = paintBox(a), B = paintBox(b);
    if (inside(A, B, 0) || inside(B, A, 0)) continue;
    const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
    if (ox > 2 && oy > 2) { part.add(a.id); part.add(b.id); }
  }
  const best = new Map<string, Issue>();
  for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
    const a = els[i]!, b = els[j]!;
    if (a.kind === "guide" && b.kind === "guide") continue;
    // Two parts of a chart: the chart's own rules place its marks and labels by the data.
    if (a.data && b.data) continue;
    if ((part.has(a.id) && own(a) !== own(b)) || (part.has(b.id) && own(b) !== own(a))) continue;
    // A container and its child: their edges are an inset, not a line (the centre check covers centring).
    if (ancestors(a.id, k.parents).includes(b.id) || ancestors(b.id, k.parents).includes(a.id)) continue;
    const A = a.kind === "guide" ? a.box : paintBox(a), B = b.kind === "guide" ? b.box : paintBox(b);
    // One inside the other (a picture in its frame outline, a band in its panel): an inset, not a near miss.
    if (a.kind !== "guide" && b.kind !== "guide" && (inside(A, B, 0.5) || inside(B, A, 0.5))) continue;
    for (const axis of ["x", "y"] as const) {
      if (taggedApart(a, b, axis)) continue;
      const fa = (byEl.get(a.id) ?? []).filter((f) => f.axis === axis && CLASS[f.name] !== "none" && !centredOn(k, a, axis, f));
      const fb = (byEl.get(b.id) ?? []).filter((f) => f.axis === axis && CLASS[f.name] !== "none" && !centredOn(k, b, axis, f));
      // Two elements that already share a line on this axis: only a like edge (left and left) of two elements of
      // nearly one size can still be a near miss (two panels with one shared right edge and lefts 6 px apart). Two
      // marks of two sizes on one centre line (a large and a small dot) differ at their edges by design.
      const sharedF = fa.find((x) => fb.some((y) => Math.abs(x.v - y.v) <= 0.5));
      const shared = !!sharedF;
      const sizeA = hi(A, axis) - lo(A, axis), sizeB = hi(B, axis) - lo(B, axis);
      const likeSize = Math.max(sizeA, sizeB) <= 1.15 * Math.min(sizeA, sizeB) + 1;
      const across = other(axis);
      const sideBySide = overlapShare(A, B, across) === 0 && overlapShare(A, B, axis) > 0;
      const stacked = overlapShare(A, B, axis) === 0 || overlapShare(A, B, across) > 0;
      let pick: { x: Feature; y: Feature; d: number; tol: number } | null = null;
      for (const x of fa) for (const y of fb) {
        const cls = CLASS[x.name];
        if (cls !== CLASS[y.name]) continue;
        if (shared && !(cls === "edge" && x.name === y.name && x.name !== "line" && likeSize)) continue;
        const guide = a.kind === "guide" || b.kind === "guide";
        const sg = sceneGuide(a) || sceneGuide(b);
        if (guide && cls !== "centre" && !sg) continue;
        if (cls === "edge" && x.name !== y.name && !sg && !(sideBySide && overlapShare(A, B, axis) >= 0.5)) continue;
        if (cls === "edge" && (x.name === "line" || y.name === "line") && !sideBySide && !guide) continue;
        if (cls === "base" && (!a.text || !b.text || !sideBySide)) continue;
        if (cls === "centre" && !guide && !(sideBySide || (stacked && k.parents[a.id] === k.parents[b.id]))) continue;
        // Optical alignment: a text beside a small mark (priority bars, a status ring, under 1.2 times its cap height)
        // is set by eye, and 1.5 px (or 6 % of its size) between the text's band and the mark's box is within it. The
        // A review judged all nine such Graphite errors false on the reels.
        if (cls === "centre" && !guide && !!a.text !== !!b.text) {
          const t = (a.text ? a : b), m = (a.text ? b : a);
          const ms = hi(paintBox(m), axis) - lo(paintBox(m), axis);
          if (ms <= 1.2 * t.text!.cap && Math.abs(x.v - y.v) <= Math.max(1.5, 0.06 * t.text!.fontPx)) continue;
        }
        // An accent that spans a group (a rank mark beside a label and the track under it) centres on the group, not
        // on the label: its centre is not the label's line.
        if (cls === "centre" && !guide && !!a.text !== !!b.text) {
          const t = (a.text ? a : b), m = (a.text ? b : a), T = paintBox(t), M = paintBox(m);
          const covers = (X: Box) => lo(M, axis) <= lo(X, axis) + 0.5 && hi(M, axis) >= hi(X, axis) - 0.5;
          const g = chainOf(t.id, k.groups)[0];
          if (g && covers(T) && [...k.els.values()].some((o) => o.id !== t.id && o.id !== m.id && chainOf(o.id, k.groups)[0] === g
            && overlapShare(paintBox(o), T, axis) === 0 && covers(paintBox(o)))) continue;
        }
        // Centres of two elements in different containers are not one line (a label in one panel, the panel above).
        if (cls === "centre" && !guide && (k.parents[a.id] || k.parents[b.id]) && k.parents[a.id] !== k.parents[b.id] && k.parents[a.id] !== b.id && k.parents[b.id] !== a.id) continue;
        if (cls === "centre" && !guide && (constrainedBy(k, a, b, axis, lines) || constrainedBy(k, b, a, axis, lines))) continue;
        // An inset: one element sits on its container's edge line, the other is inset from that container by its
        // padding (a value inside its bar under a name on the bar's edge, a caption in its frame, rows inside a list's
        // padding under a full-width rule). The survey judged all ten of these designed.
        if (cls === "edge" && x.name === y.name && x.name !== "line" && (insetOf(k, a, x, y.v) || insetOf(k, b, y, x.v))) continue;
        // A hanging padding: a box whose own text lines up with the partner (a tag outdented so its words start
        // on the line above's edge). The box edge is outdented on purpose.
        if (cls === "edge" && x.name === y.name && (hangs(k, a, x, y.v) || hangs(k, b, y, x.v))) continue;
        // The far ends of two boxes that start apart (nodes of a tree at two depths, items of two columns): their
        // widths follow their content, so their right or bottom edges are not a line unless their starts are one.
        if (cls === "edge" && x.name === y.name && (x.name === "right" || x.name === "bottom") && !a.text && !b.text
          && Math.abs(lo(A, axis) - lo(B, axis)) >= pairTol(k, a, b)) continue;
        const d = Math.abs(x.v - y.v);
        let tol = pairTol(k, a, b);
        if (cls === "base") {
          tol = Math.min(tol, 0.35 * Math.min(a.text!.fontPx, b.text!.fontPx));
          // Texts of two sizes whose bands share a centre are centre-aligned cells: their baselines differ by design.
          const ca = fa.find((f) => f.name === "bandCy")!, cb = fb.find((f) => f.name === "bandCy")!;
          if (Math.abs(a.text!.fontPx - b.text!.fontPx) > 1 && ca && cb && Math.abs(ca.v - cb.v) < d) continue;
        }
        // Centres of text bands are measured values and text moves by whole px: within 1 px they share the line. A
        // text's left or right edge is its layout box, and its ink sits a side bearing inside it: within 1.5 px of a
        // box edge it reads as aligned.
        const textEdge = cls === "edge" && (!!a.text !== !!b.text);
        const textPair = cls === "edge" && !!a.text && !!b.text && x.name !== "line";
        if (d <= (cls === "centre" ? 1 : textEdge ? 1.5 : textPair ? 1 : 0.5) || d >= tol) continue;
        if (!pick || d < pick.d) pick = { x, y, d, tol };
      }
      if (!pick) continue;
      // The off side is the one with fewer elements on its line; a guide is never off.
      let off = pick.x, on = pick.y;
      if (a.kind === "guide" || (b.kind !== "guide" && membersOf(pick.x).length > membersOf(pick.y).length)) { off = pick.y; on = pick.x; }
      const eo = k.els.get(off.el)!, et = k.els.get(on.el)!;
      const cls = CLASS[off.name];
      const kind: IssueKind = cls === "base" ? "baseline" : "edge";
      const rel = relatedness(k, eo, et, axis) * (sideBySide && overlapShare(A, B, axis) >= 0.5 ? 1 : 0.9);
      const partners = membersOf(on).filter((e) => e !== off.el);
      const salience = (cls === "centre" ? 0.85 : 1) * (et.kind === "guide" && !sceneGuide(et) ? 0.8 : 1);
      const support = Math.min(1.15, 1 + 0.05 * (partners.length - 1));
      let conf = Math.min(1, rel * offConf(pick.d, pick.tol) * salience * support);
      // Parallel parts of two copies of one block (row0-badge-pill and row1-badge-pill), or two items of one pattern
      // (wedge-0-3 and wedge-1-4, the words of one line), differ by their content or by the block's own rule: advice at most.
      if (copiesOf(off.el, on.el) || copiesOf(twinOf(k, off.el), twinOf(k, on.el))) conf = Math.min(conf, 0.34);
      if (conf < 0.2) continue;
      const support2 = supportOf(k, eo, et, axis, off, on, partners);
      const ig = ignoredBy(k, kind === "baseline" ? "align/baseline" : "align/near-miss", [off.el, on.el]);
      // Baselines of one row: of one block or one container ("row"), or of two blocks side by side ("row-apart": two
      // stat blocks whose label and delta rows do not line up by design).
      const oneUnit = strongPair(k, eo, et, axis) || !!sharedTag(eo, et, axis);
      const ecls = kind === "baseline" ? (oneUnit ? "row" : "row-apart") : support2;
      const issue: Issue = { kind, el: off.el, feature: off.name, axis, v: r1(off.v), to: r1(on.v), target: { el: on.el, feature: on.name }, on: partners,
        off: r1(off.v - on.v), tol: r1(pick.tol), confidence: r1(conf * 100) / 100, level: levelFor(kind, ecls, conf), cls: ecls,
        why: kind === "baseline"
          ? `The baseline of ${off.el} is ${r1(pick.d)} px ${off.v < on.v ? "above" : "below"} the baseline of ${on.el}, beside it in one row.`
          : `The ${NAME[off.name]} of ${off.el} is ${r1(pick.d)} px ${axis === "y" ? (off.v < on.v ? "above" : "below") : off.v < on.v ? "left of" : "right of"} the ${NAME[on.name]} of ${on.el}${partners.length > 1 ? ` (a line ${partners.length} elements share)` : ""}; ${SUPPORT_WHY[support2] ?? "edges this close read as a mistake"}.`,
        ...(ig ? { ignored: ig } : {}) };
      // One issue per element, feature class and axis: the strongest target.
      const key = `${off.el}|${axis}|${cls}`;
      const prev = best.get(key);
      // On a tie the target with more partners, then the first id: the same frame gives the same choice whatever
      // order its elements come in.
      // A guide the scene names wins over any element: snap joins guides first.
      const g1 = issue.target.el.startsWith("guide:scene."), g0 = !!prev?.target.el.startsWith("guide:scene.");
      if (!prev || (g1 && !g0) || (g1 === g0 && (issue.confidence > prev.confidence || (issue.confidence === prev.confidence && (issue.on.length > prev.on.length
        || (issue.on.length === prev.on.length && issue.target.el < prev.target.el)))))) best.set(key, issue);
    }
  }
  return [...best.values()];
}

/** The element an element exactly covers (a lit state drawn on its box), or the element itself. */
function twinOf(k: Ctx2, id: string): string {
  const e = k.els.get(id);
  if (!e || e.kind === "guide") return id;
  for (const o of k.els.values()) {
    if (o.id !== id && o.kind === e.kind && o.id < id && Math.abs(o.box.x0 - e.box.x0) <= 0.5 && Math.abs(o.box.x1 - e.box.x1) <= 0.5
      && Math.abs(o.box.y0 - e.box.y0) <= 0.5 && Math.abs(o.box.y1 - e.box.y1) <= 0.5) return o.id;
  }
  return id;
}

/**
 * Parts of two copies of one part of a block: the same role (row0-badge-pill and row1-badge-pill), or parts of two
 * numbered copies of one sub-block (dns-n1-lit and dns-n4-box: two nodes of a tree). Their places follow their
 * content or the block's own rule, not a line.
 */
function copiesOf(a: string, b: string): boolean {
  if (a === b) return false;
  const role = (id: string) => id.replace(/\d+/g, "#");
  if (role(a) === role(b)) return true;
  const pa = a.split("-"), pb = b.split("-");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    void pb;
    return false;
  }
  return false;
}

/**
 * True when element a's place on this axis is already set by a line it shares with b's block (a button whose bottom
 * sits on the rule of the tab bar beside it): then a's centre is not a line for b's parts, as a review asked for
 * the button's bottom on the rule, and with two heights the centres cannot also meet.
 */
function constrainedBy(k: Ctx2, a: AlignEl, b: AlignEl, axis: Axis, lines: Line[]): boolean {
  const gb = new Set([b.id, ...chainOf(b.id, k.groups)]);
  return lines.some((l) => l.axis === axis && l.members.some((m) => m.el === a.id && CLASS[m.name] === "edge")
    && l.members.some((m) => m.el !== a.id && m.el !== b.id && (gb.has(m.el) || chainOf(m.el, k.groups).some((g) => gb.has(g)))));
}

/** True when box e holds a text whose like edge is on v (within 1.5 px): e hangs its padding outside that line. */
function hangs(k: Ctx2, e: AlignEl, f: Feature, v: number): boolean {
  if (e.text || !["left", "right", "top", "bottom"].includes(f.name)) return false;
  return Object.entries(k.parents).some(([cid, pid]) => {
    if (pid !== e.id) return false;
    const c = k.els.get(cid)!;
    const g = featuresOf(c).find((x) => x.name === f.name && x.axis === f.axis);
    return !!c.text && !!g && Math.abs(g.v - v) <= 1.5;
  });
}

/** True when element e's feature f is inset from its container's like edge, and `v` (the partner's value) is on that edge. */
function insetOf(k: Ctx2, e: AlignEl, f: Feature, v: number): boolean {
  if (!["left", "right", "top", "bottom"].includes(f.name)) return false;
  const p = k.parents[e.id] ? k.els.get(k.parents[e.id]!) : null;
  if (!p) return false;
  const edge = featuresOf(p).find((g) => g.name === f.name && g.axis === f.axis)?.v;
  // A padding is clearly apart from the edge (over 2.5 px); an accent bar 2 px in from its panel's edge is a miss.
  return edge !== undefined && Math.abs(edge - v) <= 1 && Math.abs(edge - f.v) > 2.5;
}

/**
 * The relation that supports a near miss, strongest first:
 *   tag      the scene tags both in one row (y), one column (x) or one group,
 *   guide    a scene guide or the frame's centre line,
 *   block    both are parts of one block call with nothing between them,
 *   sibling  two children of one container side by side that share most of their range (a button beside a tab bar),
 *   repeat   the line the element misses holds two others or more (three of a kind align, a fourth nearly does),
 *   near     only nearness: a warning at most,
 * and, apart from those, hairline-end: the end of a rule or an arrow's line (it ends where its lanes end).
 */
function supportOf(k: Ctx2, a: AlignEl, b: AlignEl, axis: Axis, offF: Feature, onF: Feature, partners: string[]): string {
  if (sharedTag(a, b, axis)) return "tag";
  if (a.kind === "guide" || b.kind === "guide") return sceneGuide(a) || sceneGuide(b) ? "guide" : "frame-centre";
  // The end of a hairline: a left or right end of a horizontal rule, a top or bottom end of a vertical one.
  const end = (e: AlignEl, f: Feature) => { const h = hairAxis(e); return !!h && h !== axis && f.name !== "line"; };
  if (end(a, offF) || end(b, onF)) return "hairline-end";
  if (strongPair(k, a, b, axis)) {
    const ga = new Set(chainOf(a.id, k.groups));
    return chainOf(b.id, k.groups).some((g) => ga.has(g)) ? "block" : "sibling";
  }
  if (partners.length >= 2) return "repeat";
  return "near";
}

const SUPPORT_WHY: Record<string, string> = {
  tag: "the scene tags them as one row, column or group",
  guide: "the scene names that guide",
  "frame-centre": "it is near the frame's centre line",
  block: "they are parts of one block",
  sibling: "they stand side by side in one container",
  repeat: "the others on that line already share it",
  near: "they are near each other (no other relation: a warning at most)",
  "hairline-end": "the end of a line ends where its lanes end (a warning at most)",
};

/**
 * A pair a designer reads as one unit, so a near miss between them is an error: one block call, or two siblings in
 * one container that stand side by side and share most of their range (a button beside a tab bar), with nothing
 * between them.
 */
function strongPair(k: Ctx2, a: AlignEl, b: AlignEl, axis: Axis): boolean {
  if (a.kind === "guide" || b.kind === "guide") return true;
  if (relatedness(k, a, b, axis) < 1) return false;
  const ga = new Set(chainOf(a.id, k.groups));
  if (chainOf(b.id, k.groups).some((g) => ga.has(g))) return true;
  if (k.parents[a.id] === b.id || k.parents[b.id] === a.id) return true;
  const A = paintBox(a), B = paintBox(b);
  return k.parents[a.id] === k.parents[b.id] && overlapShare(A, B, other(axis)) === 0 && overlapShare(A, B, axis) >= 0.5;
}

/** Plain names of features, for messages. */
const NAME: Record<FeatureName, string> = { left: "left edge", right: "right edge", cx: "centre", top: "top edge", bottom: "bottom edge", cy: "centre", line: "line",
  baseline: "baseline", bandTop: "ink top", bandCy: "ink centre", bandCx: "ink centre" };

/** True when an element is centred in its container on an axis: then its edges on that axis are not lines of their own. */
function centredOn(k: Ctx2, e: AlignEl, axis: Axis, f: Feature): boolean {
  if (CLASS[f.name] !== "edge") return false;
  const p = k.parents[e.id] ? k.els.get(k.parents[e.id]!) : null;
  if (!p) return false;
  const b = paintBox(e);
  const l = lo(b, axis) - lo(p.box, axis), h = hi(p.box, axis) - hi(b, axis);
  return l > 0 && h > 0 && Math.abs(l - h) / (l + h) < 0.5 && Math.abs(l - h) < 2 * k.tol;
}

/** Runs of three or more like siblings along an axis, whose gaps differ by 1 px to a few px. */
function rhythmIssues(k: Ctx2): Issue[] {
  const out: Issue[] = [];
  const els = [...k.els.values()].filter((e) => e.kind !== "guide" && !e.layer && !e.data);
  // Like siblings: one kind, one container, one size of type, and one role (the id with its numbers as #: tile0 to
  // tile3). Texts of two roles stacked in one panel (a label, a note) follow their content, not a rhythm.
  const sig = (e: AlignEl) => `${e.kind}|${k.parents[e.id] ?? ""}|${e.text ? Math.round(e.text.fontPx) : ""}|${e.id.replace(/\d+/g, "#")}`;
  const buckets = new Map<string, AlignEl[]>();
  for (const e of els) { const s = sig(e); if (!buckets.has(s)) buckets.set(s, []); buckets.get(s)!.push(e); }
  for (const list of buckets.values()) {
    if (list.length < 3) continue;
    for (const axis of ["x", "y"] as const) {
      const across = other(axis);
      // A run shares a line across the axis (a left edge, a top, a centre) and has like sizes along it.
      const key = (e: AlignEl) => Math.round(lo(paintBox(e), across));
      const sets = new Map<number, AlignEl[]>();
      for (const e of list) { const kk = key(e); const s = [...sets.keys()].find((v) => Math.abs(v - kk) <= 1) ?? kk; if (!sets.has(s)) sets.set(s, []); sets.get(s)!.push(e); }
      for (const run0 of sets.values()) {
        const run = run0.sort((a, b) => lo(paintBox(a), axis) - lo(paintBox(b), axis));
        if (run.length < 3) continue;
        // Text counts by its layout box here: its ink varies with the letters' side bearings.
        const bx = (e: AlignEl) => (e.text ? e.box : paintBox(e));
        const sizes = run.map((e) => hi(bx(e), axis) - lo(bx(e), axis));
        // Like sizes: boxes within 1.6 times; texts within 1.15 times (texts of a table row sit in columns sized by
        // their content, so their gaps follow the columns, not a rhythm).
        if (Math.max(...sizes) > (run[0]!.text ? 1.15 : 1.6) * Math.min(...sizes)) continue;
        const gaps = run.slice(1).map((e, i) => lo(bx(e), axis) - hi(bx(run[i]!), axis));
        if (gaps.some((g) => g < 0)) continue;
        const sorted = [...gaps].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)]!;
        gaps.forEach((g, i) => {
          const d = g - med;
          const limit = Math.max(4, 0.15 * med);
          if (Math.abs(d) <= 1 || Math.abs(d) > limit) return;
          // The element after the odd gap moves (the last one, so the run keeps its start).
          const e = run[i + 1]!;
          const conf = Math.min(1, 0.85 * offConf(Math.abs(d), limit + 3));
          const ig = ignoredBy(k, "align/rhythm", [e.id]);
          const feat: FeatureName = axis === "x" ? "left" : e.text ? "baseline" : "top";
          const v0 = axis === "x" ? lo(bx(e), axis) : e.text ? e.text.baseline : lo(bx(e), axis);
          out.push({ kind: "rhythm", el: e.id, feature: feat, axis, v: r1(v0), to: r1(v0 - d),
            target: { el: run[i]!.id, feature: "gap" }, gap: med, on: run.map((x) => x.id).filter((x) => x !== e.id), off: r1(d), tol: r1(limit), confidence: r1(conf * 100) / 100,
            level: levelFor("rhythm", "run", conf), cls: "run",
            why: `The gap before ${e.id} is ${r1(g)} px; the other gaps of the run of ${run.length} are ${r1(med)} px.`, ...(ig ? { ignored: ig } : {}) });
        });
      }
    }
  }
  return out;
}

/** Rest positions on a fraction of a px: a hairline that straddles two px rows, a box edge or a baseline between px. */
function halfPxIssues(k: Ctx2): Issue[] {
  const out: Issue[] = [];
  if (k.frame.camera) return out;
  const frac = (v: number) => Math.abs(v - Math.round(v));
  // A pattern (twelve or more like marks: waffle cells, halftone dots) is one texture: its marks are not each a finding.
  const like = new Map<string, number>();
  const sig = (e: AlignEl) => `${e.id.replace(/\d+/g, "#")}|${e.kind}`;
  for (const e of k.els.values()) like.set(sig(e), (like.get(sig(e)) ?? 0) + 1);
  for (const e of k.els.values()) {
    if (e.layer || e.data || e.kind === "guide" || (like.get(sig(e)) ?? 0) >= 12) continue;
    // A box the painter puts on whole px does not blur, whatever its layout position (see AlignEl.snapped).
    if ((e.snapped && (e.kind === "rect" || e.kind === "image")) || e.rotated) continue;
    // An edge under another shape (the legs of a drawn pi under its top bar) does not show.
    const hidden = (axis: Axis, v: number) => [...k.els.values()].some((o) => o.id !== e.id && !o.text && o.kind !== "guide" && !ancestors(e.id, k.parents).includes(o.id)
      && lo(o.box, axis) < v - 0.25 && hi(o.box, axis) > v + 0.25 && lo(o.box, other(axis)) <= lo(e.box, other(axis)) + 0.5 && hi(o.box, other(axis)) >= hi(e.box, other(axis)) - 0.5
      && W(o.box) * H(o.box) < W(e.box) * H(e.box) * 50);
    const ha = hairAxis(e);
    const push = (feature: FeatureName, axis: Axis, v: number, to: number, conf: number, why: string, cls: string) => {
      const ig = ignoredBy(k, "align/half-px", [e.id]);
      out.push({ kind: "half-px", el: e.id, feature, axis, v: r1(v), to: r1(to), target: { el: e.id, feature: "px" }, on: [], off: r1(v - to), tol: 0.5,
        confidence: conf, level: levelFor("half-px", cls, conf), cls, why, ...(ig ? { ignored: ig } : {}) });
    };
    if (ha) {
      // A hairline of odd width is crisp with its centre on .5; of even width, on a whole px. A box drawn as a rule
      // is as thick as its box.
      const w = Math.max(1, Math.round(e.kind === "rect" ? (ha === "y" ? H(e.box) : W(e.box)) : e.stroke ?? 1));
      const c = ha === "y" ? (e.box.y0 + e.box.y1) / 2 : (e.box.x0 + e.box.x1) / 2;
      const want = w % 2 ? Math.floor(c) + 0.5 : Math.round(c);
      if (Math.abs(c - want) >= 0.25) push("line", ha, c, want, w <= 2 ? 0.7 : 0.4, `The ${w} px line ${e.id} sits at ${r1(c)}: it covers two rows of px at part strength and looks soft.`, "hairline");
      continue;
    }
    if (e.text) {
      // Chrome sets glyphs on whole px rows, so a fractional text top does not blur; it can shift the text by half a px.
      if (frac(e.text.baseline) >= 0.25) push("baseline", "y", e.text.baseline, Math.round(e.text.baseline), 0.3, `The baseline of ${e.id} sits at ${r1(e.text.baseline)}, between two rows of px.`, "text");
      continue;
    }
    if (e.kind === "rect" || e.kind === "image") {
      for (const [name, axis, v] of [["left", "x", e.box.x0], ["top", "y", e.box.y0]] as const) {
        if (frac(v) >= 0.25 && !hidden(axis, v)) push(name, axis, v, Math.round(v), frac(v) >= 0.4 ? 0.7 : 0.4, `The ${name} edge of ${e.id} sits at ${r1(v)} under a transform: a soft edge, half a px wide.`, "box");
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the solver

type Cand = { nodes: string[]; group: string; delta: number };

/**
 * Proposals for the issues, solved together. Issues go in order of confidence. For each, the solver tries every
 * group that can move (the element alone, then each larger block group that does not hold the other element, and
 * the set of its siblings that share its line) and keeps the cheapest move that passes every rule:
 *   cost = relations it breaks (shared lines, equal insets) + the moved area's share of the frame + |delta| / tol.
 * A move may not move a guide or a data mark, take a group out of the frame or text out of the safe area, create an
 * overlap, break a containment, break a relation an earlier proposal made, or leave a new near miss behind.
 */
export function solve(frame: AlignFrame, issues: Issue[], k: Ctx2): Proposal[] {
  const out: Proposal[] = [];
  const els = new Map([...k.els].map(([id, e]) => [id, { ...e, box: { ...e.box }, text: e.text ? { ...e.text, ink: { ...e.text.ink } } : undefined }]));
  // Relations an accepted proposal made: a later move may not move one side of one without the other.
  const locks: { a: string; b: string; axis: Axis }[] = [];
  const ghostIds = (frame.ghosts ?? []).map((g) => g.id);
  const allIds = [...new Set([...k.allIds, ...ghostIds])];
  const groupMembers = (g: string) => (k.groups[g] ?? [g]).filter((id) => allIds.includes(id));
  const safe = frame.safe;

  /** The value of a feature in the current geometry. */
  const valueOf = (id: string, name: FeatureName | "gap" | "px", axis: Axis) => {
    const e = els.get(id);
    if (!e) return NaN;
    return featuresOf(e).find((f) => f.name === name && f.axis === axis)?.v ?? NaN;
  };
  /** Exact relations of an element on an axis with elements outside a set: shared lines and equal insets. */
  const relationsOf = (id: string, axis: Axis, outside: Set<string>) => {
    const e = els.get(id);
    if (!e) return 0;
    let n = 0;
    const mine = featuresOf(e).filter((f) => f.axis === axis && CLASS[f.name] !== "none");
    const myGroups = new Set(chainOf(id, k.groups));
    for (const o of els.values()) {
      if (outside.has(o.id) || o.layer) continue;
      // A relation inside one block call is part of its construction: breaking it costs double.
      const w = chainOf(o.id, k.groups).some((g) => myGroups.has(g)) ? 2 : 1;
      for (const f of featuresOf(o)) if (f.axis === axis && CLASS[f.name] !== "none" && mine.some((m) => CLASS[m.name] === CLASS[f.name] && Math.abs(m.v - f.v) <= 0.5)) { n += w; break; }
    }
    // Equal insets: an inset of this element in its container that equals another inset in that container.
    const p = k.parents[id] ? els.get(k.parents[id]!) : null;
    if (p && !outside.has(p.id)) {
      const ins = (x: AlignEl) => { const b = paintBox(x); return [lo(b, "x") - p.box.x0, p.box.x1 - hi(b, "x"), lo(b, "y") - p.box.y0, p.box.y1 - hi(b, "y")]; };
      const mineIns = ins(e), idx = axis === "x" ? [0, 1] : [2, 3];
      const others = [...els.values()].filter((o) => k.parents[o.id] === p.id && !outside.has(o.id)).flatMap(ins).concat(axis === "y" ? [mineIns[0]!, mineIns[1]!] : [mineIns[2]!, mineIns[3]!]);
      for (const i of idx) if (mineIns[i]! > 0.5 && mineIns[i]! < 0.25 * k.short && others.some((v) => Math.abs(v - mineIns[i]!) <= 0.5)) n++;
    }
    return n;
  };

  const tryMove = (cand: Cand, axis: Axis, issue: Issue, made: { a: string; b: string }): { ok: true; cost: number } | { ok: false; why: string } => {
    const set = new Set(cand.nodes);
    const drawn = cand.nodes.filter((id) => els.has(id));
    if (!drawn.length) return { ok: false, why: "nothing drawn" };
    const broke = locks.find((l) => l.axis === axis && set.has(l.a) !== set.has(l.b));
    if (broke) return { ok: false, why: `it would undo the line of ${broke.a} and ${broke.b} that an earlier proposal made` };
    for (const id of drawn) {
      const e = els.get(id)!;
      if (e.kind === "guide") return { ok: false, why: `${id} is a guide` };
      if (e.data) return { ok: false, why: `${id} is a data mark` };
      if (e.onPicture) return { ok: false, why: `${id} is traced on a picture: the picture places it` };
      if (e.layer) return { ok: false, why: `${id} is an overlay` };
    }
    // An element outside the set that holds an element inside it would lose its child: the container must move too.
    for (const id of drawn) {
      const p = k.parents[id];
      if (p && !set.has(p) && els.has(p)) {
        const after = shift(paintBox(els.get(id)!), axis, cand.delta);
        if (!inside(after, els.get(p)!.box, 0.5)) return { ok: false, why: `${id} would leave its container ${p}` };
      }
    }
    for (const id of drawn) {
      const e = els.get(id)!;
      const after = shift(paintBox(e), axis, cand.delta);
      if (after.x0 < -0.5 || after.y0 < -0.5 || after.x1 > frame.width + 0.5 || after.y1 > frame.height + 0.5) return { ok: false, why: `${id} would leave the frame` };
      if (e.text && safe) {
        const was = paintBox(e);
        const inSafe = (b: Box) => b.x0 >= safe.left - 0.5 && b.x1 <= safe.right + 0.5 && b.y0 >= safe.top - 0.5 && b.y1 <= safe.bottom + 0.5;
        if (inSafe(was) && !inSafe(after)) return { ok: false, why: `${id} would leave the safe area` };
      }
      // Overlap: it must not meet an element it did not meet before (its own container and children aside).
      for (const o of els.values()) {
        if (set.has(o.id) || o.kind === "guide" || o.layer) continue;
        if (k.parents[id] === o.id || k.parents[o.id] === id || ancestors(id, k.parents).includes(o.id) || ancestors(o.id, k.parents).includes(id)) continue;
        const ob = paintBox(o);
        if (!meets(paintBox(e), ob, 0.5) && meets(after, ob, 0.5)) return { ok: false, why: `${id} would overlap ${o.id}` };
      }
    }
    // Cost: the exact relations the group breaks, its size, and the distance.
    let broken = 0;
    for (const id of drawn) broken += relationsOf(id, axis, set);
    const area = drawn.reduce((s, id) => s + W(paintBox(els.get(id)!)) * H(paintBox(els.get(id)!)), 0) / (frame.width * frame.height);
    // Splitting a block call (moving some of its drawn parts and not the others) costs one relation, unless the
    // part moves alone inside its own container (a label centred in its pill).
    const own = chainOf(made.a, k.groups)[0];
    const parts = own ? groupMembers(own).filter((id) => els.has(id)) : [];
    const split = parts.some((id) => set.has(id)) && parts.some((id) => !set.has(id) && !ancestors(id, k.parents).some((a) => set.has(a)))
      && !(drawn.length === 1 && k.parents[drawn[0]!] && parts.includes(k.parents[drawn[0]!]!));
    // A container that moves without its content changes every child's inset: a box carries what it holds.
    const leftBehind = drawn.reduce((n, id) => n + Object.entries(k.parents).filter(([c, p]) => p === id && !set.has(c)).length, 0);
    const cost = broken + (split && drawn.length > 1 ? 2 : 0) + Math.min(1, area * 2) + Math.abs(cand.delta) / k.tol * 0.5 + 0.5 * leftBehind;
    void issue;
    return { ok: true, cost };
  };

  const apply = (nodes: string[], axis: Axis, d: number) => {
    for (const id of nodes) {
      const e = els.get(id);
      if (!e) continue;
      e.box = shift(e.box, axis, d);
      if (e.text) {
        e.text.ink = shift(e.text.ink, axis, d);
        if (axis === "y") e.text.baseline += d;
        if (e.text.letters) e.text.letters = e.text.letters.map((l) => shift(l, axis, d));
      }
    }
  };
  const unapply = (nodes: string[], axis: Axis, d: number) => {
    apply(nodes, axis, -d);
  };

  /** The near misses between a set of elements and the rest, in the current geometry (for the "no new near miss" rule). */
  const missKey = (i: Issue) => `${[i.el, i.target.el].sort().join("|")}|${i.axis}|${i.kind}`;
  const missesOf = (ids: Set<string>) => {
    const kk: Ctx2 = { ...k, els, feats: [...els.values()].flatMap(featuresOf) };
    const lines = linesOf(kk.feats);
    // Every kind a move can make: a near miss, a centring, a baseline, a rhythm (a row title moved 1 px leaves the
    // gaps of its column uneven). Advice does not count.
    return [...edgeIssues(kk, lines), ...centreIssues(kk), ...rhythmIssues(kk)]
      .filter((i) => (ids.has(i.el) || ids.has(i.target.el) || i.on.some((o) => ids.has(o))) && i.level !== "advice" && !i.ignored);
  };

  // Guides first (snap joins a scene's guides before it joins elements), then by confidence.
  const toGuide = (i: Issue) => Number(i.target.el.startsWith("guide:scene."));
  const order = [...issues].filter((i) => !i.ignored && i.level !== "advice").sort((a, b) => toGuide(b) - toGuide(a) || b.confidence - a.confidence || a.el.localeCompare(b.el));
  const prefixOf = { centre: "c", edge: "e", baseline: "b", rhythm: "g", "half-px": "h" } as const;
  const queue = [...order];
  const lastMove = new Map<string, string>();
  /** A near miss a move made, and the proposal that made it: a fix for it needs that proposal first. */
  const derived = new Map<Issue, string>();
  const accepted: { p: Proposal; created: string[] }[] = [];
  const done = new Set<string>();
  for (let guard = 0; queue.length && guard < 400; guard++) {
    const issue = queue.shift()!;
    const axis = issue.axis;
    // The sides that may move: the element that is off, and for an edge or a baseline also its partner (the element
    // with more relations on its line stays, by cost).
    type Side = { el: string; feature: FeatureName; other: string; otherFeature: FeatureName | "gap" | "px" };
    const sides: Side[] = [{ el: issue.el, feature: issue.feature, other: issue.target.el, otherFeature: issue.target.feature }];
    if ((issue.kind === "edge" || issue.kind === "baseline") && !issue.target.el.startsWith("guide:"))
      sides.push({ el: issue.target.el, feature: issue.target.feature as FeatureName, other: issue.el, otherFeature: issue.feature });
    const tried: { c: Cand; cost: number; side: Side; from: number; created: Issue[] }[] = [];
    let aligned = false;
    const refused: string[] = [];
    for (const side of sides) {
      const target = side.other;
      let to = issue.kind === "centre" ? (() => { const p = els.get(target)!; return (lo(p.box, axis) + hi(p.box, axis)) / 2; })()
        // The baseline grid has no element: its line is the issue's own target value.
        : target === "guide:scene.baseline" ? issue.to
        : issue.kind === "edge" || issue.kind === "baseline" ? valueOf(target, side.otherFeature, axis) : issue.to;
      const from = valueOf(side.el, side.feature, axis);
      if (issue.kind === "rhythm") {
        // The gap after the element before it, as the geometry stands now.
        const prev = els.get(target), me = els.get(side.el);
        if (!prev || !me) continue;
        const bx = (e: AlignEl) => (e.text ? e.box : paintBox(e));
        to = from + (hi(bx(prev), axis) + (issue.gap ?? 0) - lo(bx(me), axis));
      }
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      if (Math.abs(to - from) <= (CLASS[side.feature] === "centre" ? 1 : 0.5) && issue.kind !== "half-px") { aligned = true; continue; }
      // Candidates: the element, the element with the children it holds, each block group that does not hold the
      // partner, and inside each group the members that share the element's line (tab labels on one baseline).
      // A half-px fix moves the element and what it holds, no more.
      const chain = issue.kind === "half-px" ? [] : chainOf(side.el, k.groups).filter((g) => !groupMembers(g).includes(target));
      const base: { nodes: string[]; group: string }[] = [{ nodes: [side.el], group: side.el }];
      const kids = [...els.keys()].filter((id) => ancestors(id, k.parents).includes(side.el));
      if (kids.length) base.push({ nodes: [side.el, ...kids], group: `${side.el}+children` });
      for (const g of chain) {
        base.push({ nodes: groupMembers(g), group: `${g}-*` });
        const mates = groupMembers(g).filter((id) => els.has(id) && featuresOf(els.get(id)!).some((f) => f.axis === axis && CLASS[f.name] === CLASS[side.feature] && Math.abs(f.v - from) <= 0.5));
        // A label's other states (hidden now) share its line in the scene model: same y and role.
        const ty = frame.textY ?? {};
        const states = (frame.hidden ?? []).filter((h) => groupMembers(g).includes(h.id) && mates.some((m) => ty[m] && ty[m]!.y === h.y && ty[m]!.role === h.role)).map((h) => h.id);
        if (mates.length > 1 && mates.length < groupMembers(g).length) base.push({ nodes: [...mates, ...states], group: `${g}: ${mates.length} on one line` });
      }
      // Text and boxes move by whole px; a half-px fix moves by the fraction.
      const raw = to - from;
      const delta = issue.kind === "half-px" ? Math.round(raw * 10) / 10 : Math.round(raw) || Math.sign(raw);
      for (const b of base) {
        const c: Cand = { ...b, delta };
        if (c.nodes.includes(target) && issue.kind !== "half-px") continue;
        const t = tryMove(c, axis, issue, { a: side.el, b: target });
        if (!t.ok) { refused.push(`${b.group}: ${t.why}`); continue; }
        const before = new Set(missesOf(new Set(c.nodes)).map(missKey));
        apply(c.nodes, axis, delta);
        const pairKey = [issue.el, issue.target.el].sort().join("|");
        const after = missesOf(new Set(c.nodes));
        const created = after.filter((m) => !before.has(missKey(m)) && !missKey(m).startsWith(pairKey));
        // The pair still misses on this axis after the move (two panes whose widths differ: aligning the lefts
        // leaves the rights apart): a move does not fix it, a resize would. Refuse the move.
        const still = issue.kind === "edge" && after.some((m) => m.kind === issue.kind && m.axis === axis && [m.el, m.target.el].sort().join("|") === pairKey);
        unapply(c.nodes, axis, delta);
        if (still) { refused.push(`${b.group}: the pair would still miss on ${axis} (their sizes differ: resize, do not move)`); continue; }
        // A new near miss is allowed only when a later proposal fixes it (see the end); each one costs.
        // Moving the partner instead of the element that is off costs a little more: the report names the off side.
        tried.push({ c, cost: t.cost + 0.6 * created.length + (side.el === issue.el ? 0 : 0.05), side, from, created });
      }
    }
    if (!tried.length) {
      // An earlier proposal already put it on its line.
      const by = lastMove.get(issue.el) ?? lastMove.get(issue.target.el);
      if (aligned && by) { issue.fix = by; issue.via = true; issue.why += ` ${by} fixes it too.`; continue; }
      issue.why += ` No safe move: ${refused.slice(0, 2).join("; ") || "nothing can move"}.`;
      continue;
    }
    tried.sort((a, b) => a.cost - b.cost || a.c.nodes.length - b.c.nodes.length);
    const best = tried[0]!;
    const altC = tried.find((t) => t.side.el !== best.side.el) ?? tried[1];
    const { side, c } = best;
    const id = hunkId(prefixOf[issue.kind], `${issue.kind}|${issue.el}|${issue.feature}|${issue.target.el}|${issue.target.feature}|${axis}`);
    // The proposals this one builds on: the one whose move made this near miss, and the one that moved its target.
    const needs = [...new Set([derived.get(issue), lastMove.get(side.other)].filter((x): x is string => !!x))];
    apply(c.nodes, axis, c.delta);
    // New near misses this move makes go to the queue: a later proposal must fix them, or this one is withdrawn.
    // They wait behind the issues found at the start, which often fix them on the way.
    for (const m of best.created) if (!done.has(missKey(m))) { m.why = `${m.why} (made by a move above)`; derived.set(m, id); queue.push(m); }
    queue.sort((a, b) => Number(derived.has(a)) - Number(derived.has(b)) || b.confidence - a.confidence || a.el.localeCompare(b.el));
    locks.push({ a: issue.el, b: issue.target.el, axis });
    issue.fix = id;
    const mb = c.nodes.map((n) => els.get(n)).filter(Boolean).map((e) => paintBox(e!));
    const deps = (frame.ghosts ?? []).filter((g) => !c.nodes.includes(g.id) && W(g.box) * H(g.box) === 0 && mb.some((b) => inside(g.box, b, 0))).map((g) => g.id);
    let why = side.el === issue.el ? issue.why : `${issue.why} ${side.el} moves: ${issue.el} has more relations on its line.`;
    if (needs.length && Math.abs(Math.abs(c.delta) - Math.abs(issue.off)) > 1) why += ` After ${needs.join(" and ")}, the move is ${c.delta > 0 ? "+" : ""}${c.delta} px.`;
    done.add(missKey(issue));
    const prop: Proposal = {
      id, kind: issue.kind, nodes: c.nodes, group: c.group, axis, el: side.el, feature: side.feature, from: r1(best.from), to: r1(best.from + c.delta), delta: c.delta,
      joins: { el: side.other, feature: side.otherFeature, on: side.el === issue.el ? issue.on : [] }, why, confidence: issue.confidence, level: issue.level,
      ...(altC && altC !== best ? { alt: { nodes: altC.c.nodes, group: altC.c.group, delta: altC.c.delta, why: `it costs ${r1(altC.cost)} against ${r1(best.cost)}: the relations it breaks, its size and its distance` } } : {}),
      ...(deps.length ? { dependants: deps } : {}),
      ...(needs.length ? { needs } : {}),
      rel: { id, move: c.group.endsWith("-*") ? [c.group] : c.nodes, axis, of: side.el, feature: side.feature,
        // A half-px fix is a move by the fraction ("d:<px>"): the fraction comes from the drawn frame (a transform at
        // rest), which the scene's own numbers do not show.
        to: issue.kind === "half-px" ? `d:${c.delta}` : issue.kind === "rhythm" ? `px:${r1(best.from + c.delta)}` : `${side.other}.${side.otherFeature}`, kind: issue.kind },
    };
    out.push(prop);
    for (const n of c.nodes) lastMove.set(n, id);
    accepted.push({ p: prop, created: best.created.map(missKey) });
  }
  // Withdraw any proposal whose new near miss is still there at the end (and repeat: a withdrawal moves things back).
  for (let changed = true, n = 0; changed && n < 20; n++) {
    changed = false;
    const now = new Set(missesOf(new Set(els.keys())).map(missKey));
    for (let i = accepted.length - 1; i >= 0; i--) {
      const a = accepted[i]!;
      if (!a.created.some((m) => now.has(m))) continue;
      unapply(a.p.nodes, a.p.axis, a.p.delta);
      out.splice(out.indexOf(a.p), 1);
      accepted.splice(i, 1);
      for (const is of issues) if (is.fix === a.p.id) { delete is.fix; is.why += " Its move would leave a new near miss, so no proposal fixes it alone."; }
      // A proposal that built on it goes too.
      for (const b of [...accepted]) if (b.p.needs?.includes(a.p.id)) { unapply(b.p.nodes, b.p.axis, b.p.delta); out.splice(out.indexOf(b.p), 1); accepted.splice(accepted.indexOf(b), 1); }
      changed = true;
      break;
    }
  }
  return out;
}

/** The whole analysis of one frame at rest: features, lines, ranked issues and solved proposals. */
/** The issues of a frame, without the solver: the model's first half. */
function findIssues(frame: AlignFrame) {
  const short = Math.min(frame.width, frame.height);
  // The frame's own guides: its centre lines. They never move, and a centred element joins them.
  const guides: AlignEl[] = [
    { id: "guide:frame.cx", kind: "guide", box: { x0: frame.width / 2, x1: frame.width / 2, y0: 0, y1: frame.height } },
    { id: "guide:frame.cy", kind: "guide", box: { x0: 0, x1: frame.width, y0: frame.height / 2, y1: frame.height / 2 } },
  ];
  const all = [...frame.els, ...guides, ...guideEls(frame)];
  const map = new Map(all.map((e) => [e.id, e]));
  const allIds = [...all.map((e) => e.id), ...(frame.ghosts ?? []).map((g) => g.id), ...(frame.hidden ?? []).map((h) => h.id)];
  const groups = groupsOf(allIds.filter((id) => !id.startsWith("guide:")));
  const parents = parentsOf(all.filter((e) => !e.layer));
  const feats = all.filter((e) => !e.layer).flatMap(featuresOf);
  const k: Ctx2 = { frame, els: map, feats, parents, groups, short, tol: frameTol(frame), allIds };
  const lines = linesOf(feats);
  Object.assign(k, wordsOf(k));
  k.sets = setsOf(k, lines);
  const centres = centreIssues(k);
  // An element centred in its container: its centre line issues are the same fault; the container one explains it.
  const edges = edgeIssues(k, lines).filter((i) => !(CLASS[i.feature] === "centre" && centres.some((c) => c.el === i.el && c.axis === i.axis)));
  // A baseline on the scene's grid wins over a baseline near another text: the grid is the guide.
  const grid = baselineGridIssues(k);
  const issues = [...centres, ...edges.filter((i) => !(i.feature === "baseline" && grid.some((g) => g.el === i.el))), ...grid, ...rhythmIssues(k), ...halfPxIssues(k)];
  issues.sort((a, b) => b.confidence - a.confidence || a.el.localeCompare(b.el));
  return { k, feats, lines, issues, groups, parents };
}

/** The issues that count (warning or error, not declared): what a proposal must reduce. */
export const countIssues = (issues: Issue[]) => issues.filter((i) => i.level !== "advice" && !i.ignored).length;

/** A frame with some elements moved (for checking a proposal on the model). */
function shifted(frame: AlignFrame, moves: Move[]): AlignFrame {
  const by = new Map<string, { dx: number; dy: number }>();
  const ids = frame.els.map((e) => e.id);
  for (const m of moves) for (const id of expandIds(m.nodes, ids)) { const o = by.get(id) ?? { dx: 0, dy: 0 }; by.set(id, { dx: o.dx + m.dx, dy: o.dy + m.dy }); }
  const mv = (b: Box, d: { dx: number; dy: number }): Box => ({ x0: b.x0 + d.dx, x1: b.x1 + d.dx, y0: b.y0 + d.dy, y1: b.y1 + d.dy });
  return { ...frame, els: frame.els.map((e) => {
    const d = by.get(e.id);
    if (!d) return e;
    return { ...e, box: mv(e.box, d), ...(e.text ? { text: { ...e.text, baseline: e.text.baseline + d.dy, ink: mv(e.text.ink, d), letters: e.text.letters?.map((l) => mv(l, d)) } } : {}) };
  }) };
}

/** The whole analysis of one frame at rest: features, lines, ranked issues and solved proposals. */
export function analyse(frame: AlignFrame): Analysis {
  const { k, feats, lines, issues, groups, parents } = findIssues(frame);
  const solved = solve(frame, issues, k);
  // A proposal is shown only when the frame has strictly fewer issues after it (with the proposals it needs), by the
  // same model. A 1 px move that fixes one pair and breaks a row is not shown (an agent's Graphite film: its first
  // two hunks each made four new errors). Each proposal carries the counts, so a preview can say them.
  const before = countIssues(issues);
  const byId = new Map(solved.map((p) => [p.id, p]));
  const proposals: Proposal[] = [];
  const closure = (ids: string[]) => {
    const set = new Set(ids);
    for (let grew = true; grew;) { grew = false; for (const id of [...set]) for (const n of byId.get(id)?.needs ?? []) if (!set.has(n)) { set.add(n); grew = true; } }
    return set;
  };
  const countAfter = (set: Set<string>) => countIssues(findIssues(shifted(frame, movesOf(solved.filter((q) => set.has(q.id))))).issues);
  const held: { p: Proposal; after: number }[] = [];
  for (const p of solved) {
    const after = countAfter(closure([p.id]));
    if (after < before) proposals.push({ ...p, issuesBefore: before, issuesAfter: after });
    else held.push({ p, after });
  }
  // Moves of one cause (text that rides high in a row and in the pill beside it) can each trade one issue for another
  // and still fix the frame together. Such a group is shown when, all applied, the frame has fewer issues; each of its
  // hunks then needs the others, so a preview or an apply takes the whole group.
  const causeOf = (p: Proposal) => `${p.kind === "half-px" ? "h" : "m"}|${p.axis}|${Math.sign(p.delta)}|${p.feature.startsWith("band") || p.feature === "baseline" ? "text" : p.feature}`;
  const groupsBy = new Map<string, Proposal[]>();
  for (const { p } of held) { const c = causeOf(p); if (!groupsBy.has(c)) groupsBy.set(c, []); groupsBy.get(c)!.push(p); }
  for (const g of groupsBy.values()) {
    if (g.length < 2) continue;
    const set = closure(g.map((p) => p.id));
    const after = countAfter(set);
    if (after >= before) continue;
    for (const p of g) proposals.push({ ...p, needs: [...new Set([...(p.needs ?? []), ...[...set].filter((x) => x !== p.id)])], issuesBefore: before, issuesAfter: after });
  }
  const shown = new Set(proposals.map((p) => p.id));
  for (const { p, after } of held) if (!shown.has(p.id)) for (const i of issues) if (i.fix === p.id) { delete i.fix; i.why += ` Its move would leave ${after} issue(s) against ${before}, so no proposal is shown.`; }
  proposals.sort((a, b) => solved.findIndex((q) => q.id === a.id) - solved.findIndex((q) => q.id === b.id));
  // A proposal whose needed proposal was withdrawn goes too.
  const kept = new Set(proposals.map((p) => p.id));
  const final = proposals.filter((p) => (p.needs ?? []).every((n) => kept.has(n)));
  return { tol: r1(k.tol), features: feats, lines, issues, proposals: final, groups, parents, sets: Object.fromEntries(k.sets ?? []), words: [...(k.words ?? [])] };
}

// ---------------------------------------------------------------- guides a scene names

/**
 * Guides a scene declares: columns with gutters, rows, a baseline unit, and named lines. Every value is px in the
 * frame. Columns and rows fill the safe area unless `left`/`right` (`top`/`bottom`) say otherwise. A function of the
 * frame lets one spec serve 9:16 and 16:9.
 *
 *   export const scene = withGuides((ctx, B) => [...], (f) => ({
 *     cols: { count: 6, gutter: 24 },
 *     baseline: { unit: 8 },
 *     lines: { fold: { y: Math.round(f.height * 0.62) } },
 *   }));
 *
 * The scene places on them with `guidesOf(scene, ctx)` (col(2).x0, span(1, 3), line("fold")); snap reads the same
 * spec, pulls edges to the guides first, and reports an edge that sits near a guide and not on it.
 */
export type GuideSpec = {
  cols?: { count: number; gutter: number; left?: number; right?: number };
  rows?: { count: number; gutter: number; top?: number; bottom?: number };
  baseline?: { unit: number; top?: number };
  lines?: Record<string, { x?: number; y?: number }>;
};
export type GuideFrame = { width: number; height: number; safe?: { left: number; right: number; top: number; bottom: number } | null };
export type GuideSource = GuideSpec | ((f: GuideFrame) => GuideSpec);
/** Guides resolved to px: every line by name, the baseline grid, and helpers a scene places with. */
export type ResolvedGuides = {
  x: { name: string; v: number }[];
  y: { name: string; v: number }[];
  baseline: { unit: number; top: number } | null;
};

/** The guides of a spec in a frame, as px lines: col<i>.left, col<i>.right, row<j>.top, row<j>.bottom, and each named line. */
export function resolveGuides(src: GuideSource, f: GuideFrame): ResolvedGuides {
  const spec = typeof src === "function" ? src(f) : src;
  const safe = f.safe ?? { left: 0, right: f.width, top: 0, bottom: f.height };
  const x: { name: string; v: number }[] = [], y: { name: string; v: number }[] = [];
  const track = (count: number, gutter: number, a: number, b: number) => {
    const w = (b - a - gutter * (count - 1)) / count;
    return Array.from({ length: count }, (_, i) => [Math.round(a + i * (w + gutter)), Math.round(a + i * (w + gutter) + w)] as const);
  };
  if (spec.cols) track(spec.cols.count, spec.cols.gutter, spec.cols.left ?? safe.left, spec.cols.right ?? safe.right)
    .forEach(([a, b], i) => x.push({ name: `col${i + 1}.left`, v: a }, { name: `col${i + 1}.right`, v: b }));
  if (spec.rows) track(spec.rows.count, spec.rows.gutter, spec.rows.top ?? safe.top, spec.rows.bottom ?? safe.bottom)
    .forEach(([a, b], i) => y.push({ name: `row${i + 1}.top`, v: a }, { name: `row${i + 1}.bottom`, v: b }));
  for (const [name, l] of Object.entries(spec.lines ?? {})) {
    if (l.x !== undefined) x.push({ name, v: Math.round(l.x) });
    if (l.y !== undefined) y.push({ name, v: Math.round(l.y) });
  }
  // Two names on one px are one line (a column's right edge and a named line): keep the first name.
  const uniq = (ls: { name: string; v: number }[]) => ls.filter((l, i) => ls.findIndex((m) => m.v === l.v) === i);
  return { x: uniq(x), y: uniq(y), baseline: spec.baseline ? { unit: spec.baseline.unit, top: Math.round(spec.baseline.top ?? safe.top) } : null };
}

/** Helpers a scene places with: a column's or a span's x and width, a row's y and height, a named line, a baseline. */
export function guideHelpers(g: ResolvedGuides) {
  const xv = (n: string) => g.x.find((l) => l.name === n)?.v;
  const yv = (n: string) => g.y.find((l) => l.name === n)?.v;
  return {
    /** Column i (1-based): its left x, right x and width. */
    col: (i: number) => { const x0 = xv(`col${i}.left`)!, x1 = xv(`col${i}.right`)!; return { x0, x1, w: x1 - x0 }; },
    /** Columns i to i + n - 1 as one span. */
    span: (i: number, n: number) => { const x0 = xv(`col${i}.left`)!, x1 = xv(`col${i + n - 1}.right`)!; return { x: x0, w: x1 - x0 }; },
    row: (j: number) => { const y0 = yv(`row${j}.top`)!, y1 = yv(`row${j}.bottom`)!; return { y0, y1, h: y1 - y0 }; },
    /** A named line's value (x or y). */
    line: (name: string) => xv(name) ?? yv(name),
    /** The baseline grid line at or after y. */
    baseline: (y: number) => (g.baseline ? g.baseline.top + Math.ceil((y - g.baseline.top) / g.baseline.unit) * g.baseline.unit : y),
  };
}

/** A scene with guides attached (snap reads them from the scene function; withSnap keeps them). */
export function withGuides<S extends (...a: any[]) => any>(scene: S, guides: GuideSource): S & { guides: GuideSource } {
  const out = ((...a: Parameters<S>) => scene(...a)) as S & { guides: GuideSource };
  out.guides = guides;
  return out;
}

/** The resolved guides of a scene in a frame (ctx), or null when it names none. */
export function guidesOf(scene: unknown, f: GuideFrame): ResolvedGuides | null {
  const src = (scene as { guides?: GuideSource } | null)?.guides;
  return src ? resolveGuides(src, f) : null;
}

/** The scene's guide lines as model elements: they never move, and edges join them first. */
function guideEls(frame: AlignFrame): AlignEl[] {
  const g = frame.guides;
  if (!g) return [];
  return [
    ...g.x.map((l) => ({ id: `guide:scene.${l.name}`, kind: "guide" as const, box: { x0: l.v, x1: l.v, y0: 0, y1: frame.height } })),
    ...g.y.map((l) => ({ id: `guide:scene.${l.name}`, kind: "guide" as const, box: { x0: 0, x1: frame.width, y0: l.v, y1: l.v } })),
  ];
}

/**
 * Baselines off the scene's baseline grid: a text whose baseline is more than 0.5 px and less than half a unit
 * from the nearest grid line. Its target is the grid line (a guide: it never moves).
 */
function baselineGridIssues(k: Ctx2): Issue[] {
  const g = k.frame.guides?.baseline;
  if (!g) return [];
  const out: Issue[] = [];
  for (const e of k.els.values()) {
    if (!e.text || e.layer || k.words?.has(e.id)) continue;
    const b = e.text.baseline;
    const to = g.top + Math.round((b - g.top) / g.unit) * g.unit;
    const d = b - to;
    if (Math.abs(d) <= 0.5 || Math.abs(d) >= g.unit / 2) continue;
    const ig = ignoredBy(k, "align/near-miss", [e.id]);
    out.push({ kind: "edge", el: e.id, feature: "baseline", axis: "y", v: r1(b), to: r1(to), target: { el: "guide:scene.baseline", feature: "line" }, on: [],
      off: r1(d), tol: r1(g.unit / 2), confidence: 0.9, level: levelFor("edge", "guide", 0.9), cls: "guide",
      why: `The baseline of ${e.id} is ${r1(Math.abs(d))} px ${d < 0 ? "above" : "below"} the scene's baseline grid (every ${g.unit} px from ${g.top}).`, ...(ig ? { ignored: ig } : {}) });
  }
  return out;
}

// ---------------------------------------------------------------- applying moves

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/** A path's `d` moved by (dx, dy): every absolute coordinate shifts; relative ones stay. */
export function translateD(d: string, dx: number, dy: number): string {
  const r = (v: number) => String(Math.round(v * 1000) / 1000);
  let first = true;
  return d.replace(/([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g, (_all, cmd: string, rest: string) => {
    const nums = (rest.match(NUM) ?? []).map(Number);
    const abs = cmd === cmd.toUpperCase();
    const lead = first && cmd === "m";
    first = false;
    if (cmd === "Z" || cmd === "z") return cmd;
    if (!abs && !lead) return cmd + rest;
    const out = nums.map((v, i) => {
      if (lead && i > 1) return v;
      const c = cmd.toUpperCase();
      if (c === "H") return v + dx;
      if (c === "V") return v + dy;
      if (c === "A") { const q = i % 7; return q === 5 ? v + dx : q === 6 ? v + dy : v; }
      return i % 2 === 0 ? v + dx : v + dy;
    });
    return cmd + out.map(r).join(" ");
  });
}

/** Expands "start-*" to the ids of every node of the group "start". */
export const expandIds = (ids: string[], all: string[]) => ids.flatMap((x) => (x.endsWith("-*") ? all.filter((id) => id === x.slice(0, -2) || id.startsWith(x.slice(0, -1))) : [x]));

/** The nodes with each move applied: the listed nodes (or "group-*") shift by (dx, dy) at rest; their tracks stay relative. */
export function applyMoves<N extends { id: string; kind: string }>(nodes: N[], moves: Move[]): N[] {
  if (!moves.length) return nodes;
  const all = nodes.map((n) => n.id);
  const by = new Map<string, { dx: number; dy: number }>();
  const have = new Set(all);
  for (const m of moves) {
    // A label moves with what belongs to it: its knock-out patch (the ground under it, over the grid) and its anchor.
    // A snap that moved only the text left the patch behind (an agent's dimension value sat off its patch).
    const ids = new Set(expandIds(m.nodes, all));
    for (const id of [...ids]) if (id.endsWith("-text")) for (const k of ["-knock", "-label"]) { const c = id.slice(0, -5) + k; if (have.has(c)) ids.add(c); }
    for (const id of ids) {
      const o = by.get(id) ?? { dx: 0, dy: 0 };
      by.set(id, { dx: o.dx + m.dx, dy: o.dy + m.dy });
    }
  }
  return nodes.map((n) => {
    const o = by.get(n.id);
    if (!o || (!o.dx && !o.dy)) return n;
    const a = n as any;
    const c: any = { ...a };
    if ("cx" in a) { c.cx = a.cx + o.dx; c.cy = a.cy + o.dy; }
    else if (a.kind === "path") { c.d = translateD(a.d, o.dx, o.dy); if (a.box) c.box = { ...a.box, x: a.box.x + o.dx, y: a.box.y + o.dy }; }
    else if ("x" in a && "y" in a) { c.x = a.x + o.dx; c.y = a.y + o.dy; }
    return c as N;
  });
}

/** The moves a list of proposals makes. */
export const movesOf = (ps: Proposal[]): Move[] => ps.map((p) => ({ id: p.id, nodes: p.nodes, dx: p.axis === "x" ? p.delta : 0, dy: p.axis === "y" ? p.delta : 0 }));

// ---------------------------------------------------------------- the snap table (accepted moves as relations)

/**
 * One accepted snap, as a relation: move the nodes `move` (ids, or "group-*" for every node of a block call) on `axis`
 * so that the feature `feature` of node `of` lands on `to`: another node's feature ("tabs-rule.line"), a px value
 * ("px:250") for a rhythm fix, a guide ("guide:scene.col2.left.line"), or a move by a fraction ("d:0.5") for a half-px fix. withSnap resolves it each time the scene builds, so the fix stays a relation
 * when the content changes. A relation whose move grows past `max` px (default 3 % of the short side) does not apply:
 * the scene changed too much, and snap must run again.
 */
export type SnapRel = { id: string; move: string[]; axis: Axis; of: string; feature: FeatureName; to: string; kind?: IssueKind; max?: number; why?: string };

/** Bounds of the absolute coordinates of a path's `d`. */
function pathBounds(d: string): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); cx = x; cy = y; };
  for (const m of d.matchAll(/([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g)) {
    const c = m[1]!, n = (m[2]!.match(NUM) ?? []).map(Number);
    const C = c.toUpperCase(), rel = c !== C;
    if (C === "Z") continue;
    if (C === "H") { for (const v of n) add(rel ? cx + v : v, cy); continue; }
    if (C === "V") { for (const v of n) add(cx, rel ? cy + v : v); continue; }
    const step = C === "A" ? 7 : C === "C" ? 6 : C === "S" || C === "Q" ? 4 : 2;
    for (let i = 0; i + step <= n.length; i += step) {
      const px = n[i + step - 2]!, py = n[i + step - 1]!;
      add(rel ? cx + px : px, rel ? cy + py : py);
    }
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
}

/** The band of a text node from the font's ink table, without a browser: baseline, band top, and its letters' extent. */
export function nodeInk(ctx: Pick<Ctx, "system" | "size" | "measure" | "lineHeight">, n: Extract<Node, { kind: "text" }>): Ink {
  const s = ctx.system, size = ctx.size(n.role), t = s.type[n.role];
  const m = inkMetrics(s, n.role, n.weight);
  // As Chrome lays out a line: the ascent and descent round to whole px, and the half leading rounds down.
  const asc = Math.round(m.ascent * size), desc = Math.round(m.descent * size);
  const baseline = n.y + Math.floor((t.leading * size - (asc + desc)) / 2) + asc;
  const shown = t.uppercase && !n.keepCase ? n.text.toUpperCase() : n.text;
  const tall = /[\p{Lu}\p{N}bdfhklt]/u.test(shown);
  const w = ctx.measure(n.text, n.role, { ...(n.keepCase ? { keepCase: true } : {}), ...(n.weight !== undefined ? { weight: n.weight } : {}) });
  const x = n.width && n.align === "center" ? n.x + (n.width - w) / 2 : n.width && n.align === "right" ? n.x + n.width - w : n.x;
  // The cap line of the font (as the capture measures it from "H"): the band a tall text centres.
  const cap = m.cap * size;
  return { baseline, cap, xh: m.x * size, fontPx: size, ink: { x0: x, x1: x + w, y0: baseline - cap, y1: baseline }, tall };
}

/** An element for the model from a node at rest (no tracks): what withSnap measures. Anchors and sound give null. */
export function elOfNode(ctx: Pick<Ctx, "system" | "size" | "measure" | "lineHeight">, n: Node): AlignEl | null {
  if (n.kind === "rect" || n.kind === "image") return { id: n.id, kind: n.kind, box: { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h }, layer: n.layer };
  if (n.kind === "circle") return { id: n.id, kind: "circle", box: { x0: n.cx - n.r, y0: n.cy - n.r, x1: n.cx + n.r, y1: n.cy + n.r }, layer: n.layer };
  if (n.kind === "path") { const b = pathBounds(n.d); return b ? { id: n.id, kind: "path", box: b, stroke: n.width, layer: n.layer } : null; }
  if (n.kind === "text") {
    const ink = nodeInk(ctx, n);
    return { id: n.id, kind: "text", box: { x0: ink.ink.x0, x1: ink.ink.x1, y0: n.y, y1: n.y + ctx.lineHeight(n.role) }, text: ink, layer: n.layer };
  }
  if (n.kind === "anchor") return { id: n.id, kind: "rect", box: { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h } };
  return null;
}

/** The value of `of.feature`, or of a target ("node.feature" or "px:<v>"), among built nodes. */
function snapValue(ctx: Pick<Ctx, "system" | "size" | "measure" | "lineHeight">, nodes: Node[], ref: string, axis: Axis, guides: ResolvedGuides | null = null): number | null {
  if (ref.startsWith("px:")) return Number(ref.slice(3));
  const dot = ref.lastIndexOf(".");
  const id = ref.slice(0, dot), name = ref.slice(dot + 1) as FeatureName;
  if (id === "guide:frame") return null;
  if (id.startsWith("guide:scene.")) {
    const gname = id.slice("guide:scene.".length);
    if (gname === "baseline") return null;
    return (axis === "x" ? guides?.x : guides?.y)?.find((l) => l.name === gname)?.v ?? null;
  }
  const n = nodes.find((x) => x.id === id);
  if (!n) return null;
  const e = elOfNode(ctx, n);
  if (!e) return null;
  return featuresOf(e).find((f) => f.name === name && f.axis === axis)?.v ?? null;
}

/**
 * The scene with accepted snaps applied after it builds. Both renderers call the scene, so both draw the snapped
 * nodes. Each relation moves its nodes by the whole px that put its feature on its target (a sub-px amount for a
 * half-px fix). A relation that cannot resolve (a node is gone) or that would move further than its `max` warns and
 * does nothing.
 */
export function withSnap<C extends Pick<Ctx, "system" | "size" | "measure" | "lineHeight" | "width" | "height">, B>(scene: (ctx: C, B: B) => Node[], table: SnapRel[]) {
  const out = (ctx: C, B: B): Node[] => {
    let nodes = scene(ctx, B);
    const guides = guidesOf(scene, ctx as unknown as GuideFrame);
    for (const r of table) {
      if (r.to.startsWith("d:")) {
        const d = Number(r.to.slice(2));
        if (Number.isFinite(d) && d) nodes = applyMoves(nodes, [{ id: r.id, nodes: r.move, dx: r.axis === "x" ? d : 0, dy: r.axis === "y" ? d : 0 }]);
        continue;
      }
      const from = snapValue(ctx, nodes, `${r.of}.${r.feature}`, r.axis, guides);
      let to = snapValue(ctx, nodes, r.to, r.axis, guides);
      // A baseline grid target: the grid line nearest the feature.
      if (r.to === "guide:scene.baseline.line" && from !== null && guides?.baseline) to = guides.baseline.top + Math.round((from - guides.baseline.top) / guides.baseline.unit) * guides.baseline.unit;
      if (from === null || to === null) { console.warn(`snap ${r.id}: ${from === null ? r.of : r.to} is not in the scene; the snap does nothing`); continue; }
      const raw = to - from;
      // The move snap previewed: a half-px fix to 0.1 px, every other fix to the renderers' half-pixel grid. Rounding to a
      // whole px put a rhythm fix to "px:1768.5" 0.5 px past its line, so the check found it again after the apply.
      const d = r.kind === "half-px" ? Math.round(raw * 10) / 10 : Math.round(raw * 2) / 2;
      const max = r.max ?? 0.03 * Math.min(ctx.width, ctx.height);
      if (Math.abs(d) > max) { console.warn(`snap ${r.id}: the move is ${d} px, over ${Math.round(max)} px; the scene changed, so run snap again`); continue; }
      if (!d) continue;
      nodes = applyMoves(nodes, [{ id: r.id, nodes: r.move, dx: r.axis === "x" ? d : 0, dy: r.axis === "y" ? d : 0 }]);
    }
    return nodes;
  };
  // The scene's guides stay on the snapped scene, so snap and the renderers read the same lines.
  const g = (scene as { guides?: GuideSource }).guides;
  return g ? Object.assign(out, { guides: g }) : out;
}
