// Tree: a hierarchy from one root down to its leaves, built level by level (row by row as an outline). Use it for a namespace
// (DNS), a file system, an org chart, a module tree, a taxonomy. Nodes marked `key` form a path from
// the root; after the build, that path lights one level at a time, with an optional caption.
//
// Rules this block enforces:
// - Top-down first: leaves share the width, each parent sits centred over its children, and
//   connectors drop from the parent, run along a bus and drop to each child.
// - When the leaves do not fit across the box (9:16), the tree becomes an indented outline: one node
//   per row, each child indented under its parent, with a stem and a tick to each child. Nothing shrinks
//   below its measured label; a label may wrap to two lines first.
// - Every node takes its size from its measured label. Labels never touch a line.
// - The key path lights in the accent with heavier connectors, so it reads where accent equals ink.
// - Every text box passes textSafe. When one does not, the block narrows and lays out again.
import { appear, go, lines as maskLines, cut } from "../context";
import type { Block, Ctx, Key, Node } from "../types";
import { audit, fadeKeys, nodeBox, roundPath, titleOf, weights, widest, wrap, type Pt } from "./flow";
import type { Box } from "./util";
import { GESTURES, tagParts, textSafeBox } from "./hand";

export type TreeItem = { label: string; /** On the path that lights after the build. */ key?: boolean; children?: TreeItem[] };

export type TreeProps = {
  id?: string;
  /** The block's box in px: title, caption, nodes and lines stay inside it. */
  x: number; y: number; w: number; h: number;
  title?: string;
  root: TreeItem;
  /** One sentence shown when the key path lights. */
  caption?: string;
  /** "auto" (default): top-down when the leaves fit across the box, else an indented outline. */
  layout?: "auto" | "top" | "outline";
  at: number;
  /** When the key path starts to light. Default: just after the build ends. */
  keyAt?: number;
  until?: number;
};

type Flat = { item: TreeItem; depth: number; parent: number; kids: number[] };

function flatten(root: TreeItem): Flat[] {
  const out: Flat[] = [];
  const walk = (item: TreeItem, depth: number, parent: number) => {
    const i = out.length;
    out.push({ item, depth, parent, kids: [] });
    if (parent >= 0) out[parent]!.kids.push(i);
    for (const c of item.children ?? []) walk(c, depth + 1, i);
  };
  walk(root, 0, -1);
  return out;
}

type Laid = { out: Node[]; problems: string[] };

function compose(p: TreeProps, ctx: Ctx, inset: number, mode: "top" | "outline"): Laid {
  const id = p.id ?? "tree";
  const sL = ctx.size("label"), lhL = ctx.lineHeight("label"), lhC = ctx.lineHeight("caption");
  const W = p.w - inset;
  const out: Node[] = [];
  const problems: string[] = [];
  const exit = p.until;
  const wt = weights(ctx);
  const F = flatten(p.root);
  const D = Math.max(...F.map((f) => f.depth));

  const title = titleOf(ctx, id, p.title, p.x, p.y, W, p.at, exit);
  out.push(...title.nodes);
  const capLines = p.caption ? wrap(ctx, p.caption, "caption", W, 3) ?? (problems.push("the caption does not fit"), [p.caption]) : [];
  const capTop = p.y + title.h;
  const capH = capLines.length ? capLines.length * lhC + sL * 0.9 : 0;
  const area = { x: p.x, y: capTop + capH, w: W, h: p.y + p.h - capTop - capH };

  const padX = sL * 0.7, padY = sL * 0.45;
  let labels = F.map((f) => [f.item.label]);
  const boxes: Box[] = [];
  // Connector polylines from each parent to each child, by child index.
  const links = new Map<number, Pt[]>();

  if (mode === "top") {
    // Leaves share the width; a parent sits over the middle of its children.
    const leaves = F.filter((f) => !f.kids.length).length;
    const gapX = sL * 1.2, gapY = sL * 2.2;
    const fitW = (W - (leaves - 1) * gapX) / leaves;
    if (widest(ctx, F.map((f) => f.item.label), "label") + 2 * padX > fitW) {
      labels = F.map((f) => wrap(ctx, f.item.label, "label", fitW - 2 * padX, 2) ?? (problems.push(`"${f.item.label}" does not fit across`), [f.item.label]));
    }
    const nodeW = Math.max(...labels.map((l) => widest(ctx, l, "label"))) + 2 * padX;
    const nodeH = Math.max(...labels.map((l) => l.length)) * lhL + 2 * padY;
    const pitchX = Math.min(leaves > 1 ? (W - nodeW) / (leaves - 1) : 0, nodeW + gapX * 2.5);
    const pitchY = D > 0 ? Math.min((area.h - nodeH) / D, nodeH + gapY * 1.8) : 0;
    if (D > 0 && pitchY < nodeH + gapY) problems.push("the levels need more height");
    const ox = area.x + (W - ((leaves - 1) * pitchX + nodeW)) / 2;
    const oy = area.y + (area.h - (D * pitchY + nodeH)) / 2;
    let slot = 0;
    const cx: number[] = F.map(() => 0);
    const place = (i: number) => {
      const f = F[i]!;
      f.kids.forEach(place);
      cx[i] = f.kids.length ? (cx[f.kids[0]!]! + cx[f.kids[f.kids.length - 1]!]!) / 2 : ox + nodeW / 2 + pitchX * slot++;
    };
    place(0);
    F.forEach((f, i) => boxes.push({ x: cx[i]! - nodeW / 2, y: oy + f.depth * pitchY, w: nodeW, h: nodeH }));
    F.forEach((f, i) => {
      if (f.parent < 0) return;
      const a = boxes[f.parent]!, b = boxes[i]!;
      const bus = a.y + a.h + (b.y - a.y - a.h) / 2;
      links.set(i, [[a.x + a.w / 2, a.y + a.h], [a.x + a.w / 2, bus], [b.x + b.w / 2, bus], [b.x + b.w / 2, b.y]]);
    });
  } else {
    // Outline: one row per node, in depth-first order; a child sits one indent right of its parent.
    const indent = sL * 1.5;
    labels = F.map((f) => {
      const room = W - f.depth * indent - 2 * padX;
      return ctx.measure(f.item.label, "label") <= room ? [f.item.label] : wrap(ctx, f.item.label, "label", room, 2) ?? (problems.push(`"${f.item.label}" does not fit`), [f.item.label]);
    });
    const rowH = Math.max(...labels.map((l) => l.length)) * lhL + 2 * padY;
    const gap = Math.max(sL * 0.35, Math.min(sL * 0.8, (area.h - F.length * rowH) / Math.max(1, F.length - 1)));
    if ((area.h - F.length * rowH) / Math.max(1, F.length - 1) < sL * 0.35) problems.push("the rows need more height");
    const total = F.length * rowH + (F.length - 1) * gap;
    const oy = area.y + Math.max(0, (area.h - total) / 2);
    F.forEach((f, i) => {
      const w = widest(ctx, labels[i]!, "label") + 2 * padX;
      boxes.push({ x: area.x + f.depth * indent, y: oy + i * (rowH + gap), w, h: rowH });
    });
    F.forEach((f, i) => {
      if (f.parent < 0) return;
      const a = boxes[f.parent]!, b = boxes[i]!;
      const sx = a.x + indent / 2;
      links.set(i, [[sx, a.y + a.h], [sx, b.y + b.h / 2], [b.x, b.y + b.h / 2]]);
    });
  }

  // Timing. Top-down builds one level after another; the outline builds one row after another, as a
  // file tree prints. A node's connector draws first; the node lands as it arrives.
  const t0 = p.at;
  const rank = (i: number) => (mode === "top" ? F[i]!.depth : i);
  const step = mode === "top" ? ctx.dur.move + ctx.dur.enter : ctx.dur.move * 0.6 + ctx.dur.stagger;
  const connAt = (i: number) => t0 + ctx.dur.enter + (rank(i) - 1) * step;
  const nodeAt = (i: number) => (rank(i) === 0 ? t0 : connAt(i) + ctx.dur.move * 0.8);
  const built = Math.max(...F.map((_, i) => nodeAt(i))) + ctx.dur.enter;
  const keyStart = p.keyAt ?? built + ctx.dur.move;
  const drawn = ctx.noOvershoot("move");

  // The key path: each key node lights in depth order; its connector lights just before it.
  const keyIdx = F.map((f, i) => (f.item.key ? i : -1)).filter((i) => i >= 0).sort((a, b) => F[a]!.depth - F[b]!.depth);
  keyIdx.forEach((i, k) => {
    const par = F[i]!.parent;
    if (k > 0 && par !== keyIdx[k - 1]) problems.push(`key node "${F[i]!.item.label}" does not continue the path`);
  });
  const keyStep = ctx.dur.move + ctx.dur.stagger * 2;
  const litAt = (k: number) => keyStart + k * keyStep + (k > 0 ? ctx.dur.move * 0.8 : 0);

  const r = Math.min(ctx.radius, sL * 0.5);
  const lineSets: Pt[][] = [];
  links.forEach((pts, i) => {
    const rp = roundPath(pts, r);
    out.push({ id: `${id}-c${i}`, kind: "path", d: rp.d, stroke: "inkMuted", width: wt.base, cap: "butt", join: "round",
      tracks: { draw: go(ctx, connAt(i), 0, 1, drawn, 1, "move"), ...appear(ctx, connAt(i), exit, 0) } });
    lineSets.push(pts);
    const k = keyIdx.indexOf(i);
    if (k > 0) {
      const at = keyStart + k * keyStep;
      const draw: Key[] = ctx.instant ? cut(at, 0, 1) : go(ctx, at, 0, 1, drawn, 1, "move");
      out.push({ id: `${id}-k${i}`, kind: "path", d: rp.d, stroke: "accent", width: wt.lit, cap: "butt", join: "round", z: 2,
        tracks: { draw, opacity: fadeKeys(ctx, [[at, exit]], at, exit) } });
    }
  });
  F.forEach((_, i) => {
    const b = boxes[i]!;
    const k = keyIdx.indexOf(i);
    out.push(...nodeBox(ctx, { id: `${id}-n${i}`, x: b.x, y: b.y, w: b.w, h: b.h, lines: labels[i]!, role: "label",
      at: nodeAt(i), until: exit, lit: k >= 0 ? [[litAt(k), exit]] : [] }));
  });
  if (capLines.length) out.push(...maskLines(ctx, { id: `${id}-cap`, x: p.x, y: capTop, lines: capLines, role: "caption", color: "ink", at: keyStart, until: exit }));

  // Boxes must not touch each other.
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i]!, b = boxes[j]!;
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) problems.push(`boxes ${i} and ${j} overlap`);
  }
  if (boxes.some((b) => b.x < p.x - 0.5 || b.x + b.w > p.x + W + 0.5)) problems.push("a node is wider than the box");
  problems.push(...audit(ctx, out, lineSets));
  return { out, problems };
}

/**
 * Tries the top-down layout, then the outline. Each layout narrows when a text box leaves the
 * text-safe area. The first layout with no problem wins.
 */
export const tree: Block<TreeProps> = (p, ctx) => tagParts(drawTree(textSafeBox(ctx, p, `tree ${p.id ?? "tree"}`, "use a cycle or a flow in the text-safe area, or let a picture take the lower band"), ctx), p.id ?? "tree", GESTURES.tree!);

/** The block before its parts are tagged as gestures (hand.ts, GESTURES). */
const drawTree: Block<TreeProps> = (p, ctx) => {
  const modes: ("top" | "outline")[] = p.layout === "top" ? ["top"] : p.layout === "outline" ? ["outline"] : ["top", "outline"];
  let best: Laid | null = null;
  for (const mode of modes) for (const f of [0, 0.05, 0.1, 0.15]) {
    const r = compose(p, ctx, p.w * f, mode);
    if (!r.problems.length) return r.out;
    if (!best || r.problems.length < best.problems.length) best = r;
  }
  console.warn(`tree ${p.id ?? "tree"}: ${best!.problems.join("; ")}`);
  return best!.out;
};
