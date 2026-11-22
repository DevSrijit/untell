// Hand-over: two text blocks that use one place in turn. An agent writes the most natural thing:
//   B.title({ id: "line", text: "Sit back.", ...box, at: 0.2, until: 5 }); B.title({ id: "name", text: "Orlenne.", ...box, at: 5 })
// and the old title would sink out of its mask over the new one rising in: text on text (hard rule 1). So the blocks
// hand over by default: the old block is gone on the frame the new one first shows (frameOf(at)).
//
// The guard (blocks/guard.ts) calls `settle` after every block. It records each block's nodes per context object (one
// scene build), so it sees the blocks built before. Blocks stay pure: the record is outside them.
//
// Rules:
// - Automatic: when a text block (TEXT_BLOCKS) shows text in a box where a text block built before it, with the same
//   context, still shows text at its start (or leaves over it), the earlier one hands over. The same rule holds the
//   other way round, when the block built first starts later. The build says so once, and names the `replaces` prop.
// - `replaces: "<id>"` says it on purpose, for any block, also where the boxes do not touch (a slot that moves). The
//   order of the code does not matter: the replaced block may be built before or after (also in one return list).
//   A replaces whose id the scene never builds with that ctx fails when the renderer has built the scene.
// - How the old block leaves, by the system's vocabulary: in a one-frame system, a cut on the new block's first frame.
//   In the others, its exit runs earlier, so it ends on the frame before the new block shows: an opacity fade over the
//   system's exit duration (a masked line also stops at that frame). Its keys before that stay.
// - An old block that has left already is not changed. A block of the same id (B.measure builds a block again) is
//   never handed over to itself.
// - wordSeries and carry model the same hand-over inside one block (a cut between words); this is the same rule
//   between two blocks.
import { DIRECTION } from "../../direction";
import { cut, frameOf, go } from "../context";
import { valueAt } from "../time";
import type { Ctx, Key, Node, TextNode } from "../types";

/** The context copies that B.measure builds a block on (measureBlock.ts): a replace there has nothing to replace. */
export const MEASURING = new WeakSet<object>();

/** The blocks whose text a later text block may take the place of. */
export const TEXT_BLOCKS = new Set(["title", "text", "typeOn", "fitText", "kineticWords", "wordSeries", "quote", "bigStat", "counter", "lockup", "endCard", "formula"]);

type Built = { id: string; name: string; nodes: Node[]; replaces?: string[] };
/** The replaces that name a block not built yet with this context: applied when that block is built (any order). */
type Pending = { id: string; f: number; by: string; met: boolean };
const PENDING = new WeakMap<object, Pending[]>();
/** The key of one scene build: the `dur` object that makeCtx makes once, which every spread copy of the context shares
 *  (withView, caseCtx), so a replace made on a view copy is seen at the end of the build of the root context. */
const buildKey = (ctx: object): object => (ctx as { dur?: object }).dur ?? ctx;
/** The wipes planned with one context (wipeTimes): the frame on which each one covers a box. */
const WIPES = new WeakMap<object, ((b: { x: number; y: number; w: number; h: number }) => number)[]>();
/** Records a wipe's hide time for this context: a text that a wipe hides before a later text starts needs no hand-over note. */
export function noteWipe(ctx: object, hide: (b: { x: number; y: number; w: number; h: number }) => number): void {
  const l = WIPES.get(ctx) ?? [];
  l.push(hide);
  WIPES.set(ctx, l);
}
/** True when a wipe of this context covers every text node of `nodes` before frame f (wipeOut then hides them there). */
function wipedBefore(ctx: Ctx, nodes: Node[], f: number): boolean {
  const ws = WIPES.get(ctx);
  if (!ws?.length) return false;
  const texts = nodes.filter((n): n is TextNode => n.kind === "text");
  return texts.length > 0 && texts.every((n) => { const [x0, y0, x1, y1] = boxOf(ctx, n); return ws.some((hide) => Math.round(hide({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }) * F) <= f); });
}
/** The blocks built with one context, in build order. */
const BUILT = new WeakMap<object, Built[]>();
const said = new Set<string>();

const F = 30;
const opacityAt = (ctx: Pick<Ctx, "system">, n: Node, f: number) => (n.tracks?.opacity?.length ? valueAt(ctx.system, n.tracks.opacity, "opacity", f / F) : 1);

/** The first frame on which any text node of a block shows (opacity over 0.01), or Infinity. */
function firstShown(ctx: Pick<Ctx, "system">, nodes: Node[]): number {
  let best = Infinity;
  for (const n of nodes) {
    if (n.kind !== "text") continue;
    const ks = n.tracks?.opacity;
    if (!ks?.length) return 0;
    const end = Math.round(Math.max(...ks.map((k) => k.t)) * F) + 1;
    for (let f = 0; f <= end && f < best; f++) if (opacityAt(ctx, n, f) > 0.01) { best = f; break; }
  }
  return best;
}

/** A text node's box at rest, px: its measured line, scaled about its origin when it has a scale track. */
function boxOf(ctx: Ctx, n: TextNode): [number, number, number, number] {
  const w0 = n.width ?? ctx.measure(n.text, n.role, n.keepCase ? { keepCase: true } : undefined);
  const h0 = ctx.lineHeight(n.role);
  const sk = n.tracks?.scale;
  const s = sk?.length ? sk[sk.length - 1]!.v : 1;
  const [ox, oy] = n.origin ?? [0.5, 0.5];
  const x = n.x + ox * w0 * (1 - s), y = n.y + oy * h0 * (1 - s);
  return [x, y, x + w0 * s, y + h0 * s];
}

const meets = (a: [number, number, number, number], b: [number, number, number, number]) =>
  Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 2 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 2;

/** Do two blocks' text boxes share any place? Pinned (screen) and world text never compare. */
function share(ctx: Ctx, a: Node[], b: Node[]): boolean {
  const ta = a.filter((n): n is TextNode => n.kind === "text"), tb = b.filter((n): n is TextNode => n.kind === "text");
  for (const x of ta) for (const y of tb) if (!!x.pinned === !!y.pinned && meets(boxOf(ctx, x), boxOf(ctx, y))) return true;
  return false;
}

/** Does a block show any text from frame f to f + the system's enter? */
function showsAround(ctx: Ctx, nodes: Node[], f: number): boolean {
  const span = Math.max(1, Math.round(ctx.dur.enter * F));
  return nodes.some((n) => n.kind === "text" && Array.from({ length: span + 1 }, (_, k) => f + k).some((g) => opacityAt(ctx, n, g) > 0.01));
}

/** The opacity keys of a node that has left by frame f: a cut on f (one-frame system), else an exit that ends on f. */
export function leaveBy(ctx: Ctx, keys: Key[] | undefined, f: number): Key[] {
  const ks = keys?.length ? keys : [{ t: 0, v: 1 }];
  const at = Math.max(0, (f - 1) / F);
  if (ctx.instant) {
    const v = valueAt(ctx.system, ks, "opacity", at);
    const before = ks.filter((k) => k.t < at + 1e-9);
    return [...(before.length ? before : [{ t: 0, v: ks[0]!.v }]), ...cut(at, v, 0)];
  }
  // The exit ends half a frame before f (shown 0 on f, still a little on f - 1); it starts the exit's duration before.
  const end = (f - 0.5) / F, start = Math.max(0, end - ctx.dur.exit);
  const v = valueAt(ctx.system, ks, "opacity", start);
  const before = ks.filter((k) => k.t < start - 1e-9);
  if (end - start < 1 / F) return [...(before.length ? before : [{ t: 0, v: ks[0]!.v }]), ...cut(Math.max(0, end - 1 / F + 1e-6), v, 0)];
  return [...(before.length ? before : [{ t: 0, v: ks[0]!.v }]), ...go({ ...ctx, dur: { ...ctx.dur, exit: end - start } }, start, v, 0, "exit")];
}

/** The nodes of the block with this id built before with this context (the last one built), or null. */
export function builtBlock(ctx: object, id: string): Node[] | null {
  const list = BUILT.get(ctx) ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (list[i]!.id === id) return list[i]!.nodes;
  return null;
}

/** Makes a block's nodes leave by frame f (in place). Nodes already gone by then stay as they are. */
export function leave(ctx: Ctx, nodes: Node[], f: number): void {
  for (const n of nodes) {
    if (n.kind === "audio" || n.kind === "anchor" || n.kind === "hold" || n.kind === "camera") continue;
    const keys = n.tracks?.opacity;
    const shownLater = keys?.length ? Array.from({ length: 1 + Math.max(0, Math.round(Math.max(...keys.map((k) => k.t)) * F) - f + 2) }, (_, k) => f - 1 + k).some((g) => opacityAt(ctx, n, g) > 0.01) : true;
    if (!shownLater) continue;
    n.tracks = { ...(n.tracks ?? {}), opacity: leaveBy(ctx, keys, f) };
  }
}

/** Every node of every block built with this context so far (the reveal rule reads them). */
export function builtNodes(ctx: object): Node[] {
  return (BUILT.get(ctx) ?? []).flatMap((b) => b.nodes);
}

/**
 * After a block is built: hand over with the blocks built before it (see the header), then record it.
 * `replaces` is the block's own prop; `at` its start.
 */
export function settle(ctx: Ctx, name: string, where: string, id: unknown, nodes: Node[], replaces?: string | string[], at?: number): void {
  const list = BUILT.get(ctx) ?? [];
  if (!BUILT.has(ctx)) BUILT.set(ctx, list);
  const own = typeof id === "string" ? id : undefined;
  if (replaces !== undefined) {
    for (const r of Array.isArray(replaces) ? replaces : [replaces]) {
      const olds = list.filter((b) => b.id === r);
      // B.measure builds the block on a copy of the context, where nothing else is built: there is nothing to replace.
      if (!olds.length && MEASURING.has(ctx)) continue;
      const f = typeof at === "number" ? frameOf(at) : firstShown(ctx, nodes);
      // The order of the code does not matter: a block built later (also later in one return list) leaves when it is
      // built. A replaces that names no block of the scene fails at the end of the build (unbuiltReplaces).
      if (!olds.length) {
        const l = PENDING.get(buildKey(ctx)) ?? [];
        l.push({ id: r, f, by: where, met: false });
        PENDING.set(buildKey(ctx), l);
        continue;
      }
      for (const b of olds) leave(ctx, b.nodes, f);
    }
  }
  // A block that an earlier block replaces: it leaves by that block's start frame. Every build of the id counts (a
  // scene may build one block several times, as placeBehind does).
  if (own !== undefined && !MEASURING.has(ctx)) for (const p of PENDING.get(buildKey(ctx)) ?? []) if (p.id === own) { p.met = true; leave(ctx, nodes, p.f); }
  if (TEXT_BLOCKS.has(name)) {
    const mine = firstShown(ctx, nodes);
    for (const b of list) {
      if (!TEXT_BLOCKS.has(b.name) || (own !== undefined && b.id === own) || (replaces !== undefined && [replaces].flat().includes(b.id))) continue;
      if (own !== undefined && b.replaces?.includes(own)) continue; // b replaces this block: handled above
      const theirs = firstShown(ctx, b.nodes);
      if (mine === Infinity || theirs === Infinity || mine === theirs || !share(ctx, nodes, b.nodes)) continue;
      // The one that starts first leaves for the one that starts later, when it still shows then.
      const [early, late, lateName, earlyName, f] = theirs < mine ? [b.nodes, nodes, own ?? name, b.id, mine] : [nodes, b.nodes, b.id, own ?? name, theirs];
      if (!showsAround(ctx, early, f)) continue;
      leave(ctx, early, f);
      void late;
      // A wipe covers the earlier text before the later one starts (wipeOut hides it there): a hand-over by design.
      if (wipedBefore(ctx, early, f)) continue;
      const msg = `${lateName}: it shows text in the place where ${earlyName} still shows text at ${(f / F).toFixed(2)} s, so ${earlyName} leaves by that frame (no text over text). Give ${lateName} replaces: "${earlyName}" to say so.`;
      if (!said.has(msg)) { said.add(msg); console.warn(msg); }
    }
  }
  if (own !== undefined) {
    for (const b of list) {
      const [text, pic] = TEXT_BLOCKS.has(name) && PICTURE_BLOCKS.has(b.name) ? [{ id: own, name, nodes }, b] : PICTURE_BLOCKS.has(name) && TEXT_BLOCKS.has(b.name) ? [b, { id: own, name, nodes }] : [null, null];
      // Courtside sets its type behind and over its subject (compose "behind"): type across the picture is its design.
      if (!text || !pic || DIRECTION[ctx.system.id]?.compose?.kind === "behind") continue;
      const edge = acrossEdge(ctx, text.nodes, pic.nodes);
      if (edge === null) continue;
      const hint = text.name === "quote" ? ` quote({ picture: "<media>" }) sets the picture under the statement as the full-bleed field, dimmed behind type.` : "";
      const msg = `${text.id}: its text runs across the edge of the picture ${pic.id} at y ${Math.round(edge)}: part of it on the picture, part on the ground. Set the text wholly on the picture or wholly off it.${hint}`;
      if (!said.has(msg)) { said.add(msg); console.warn(msg); }
    }
    list.push({ id: own, name, nodes, ...(replaces !== undefined ? { replaces: [replaces].flat() } : {}) });
  }
}

/**
 * The replaces of a scene build that named no block of that build (a typo, or a block built with another ctx). The
 * renderers call it after the scene is built and throw with the list.
 */
export function unbuiltReplaces(ctx: object): string[] {
  return (PENDING.get(buildKey(ctx)) ?? []).filter((p) => !p.met).map((p) => `${p.by}: replaces "${p.id}", but the scene builds no block with the id "${p.id}" with this ctx. Give replaces the id of a block that the scene builds, and build both with the same ctx (not a withView copy).`);
}

/** Throws when a scene build left a replaces with no block to replace (see unbuiltReplaces). */
export function checkReplaces(ctx: object): void {
  const bad = unbuiltReplaces(ctx);
  if (bad.length) throw new Error(bad.join("\n"));
}

/** The blocks that draw a picture with edges inside the frame. */
const PICTURE_BLOCKS = new Set(["photo", "footage", "video"]);

/**
 * Where a text block's text crosses the top or bottom edge of a picture that shows with it: the edge's y, or null. The
 * text is the union of its lines at rest that show together (a statement and its attribution): it crosses an edge when
 * the edge lies inside it by more than a quarter of a line on each side, and the two overlap across. A picture that
 * fills the frame has no edge inside it.
 */
function acrossEdge(ctx: Ctx, text: Node[], pic: Node[]): number | null {
  const lines = text.filter((n): n is TextNode => n.kind === "text");
  if (!lines.length) return null;
  const f = firstShown(ctx, lines);
  if (f === Infinity) return null;
  const span = Math.max(1, Math.round(ctx.dur.enter * F)) + 1;
  const shownAt = (n: Node, g: number) => opacityAt(ctx, n, g) > 0.01;
  for (const im of pic) {
    if (im.kind !== "image") continue;
    if (im.x <= 0 && im.y <= 0 && im.x + im.w >= ctx.width && im.y + im.h >= ctx.height) continue;
    for (let g = f; g <= f + span * 4; g += span) {
      if (!shownAt(im, g)) continue;
      const on = lines.filter((n) => shownAt(n, g + span));
      if (!on.length) continue;
      const bs = on.map((n) => boxOf(ctx, n));
      const box: [number, number, number, number] = [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
      if (Math.min(box[2], im.x + im.w) - Math.max(box[0], im.x) <= 0) continue;
      const q = Math.min(...on.map((n) => ctx.lineHeight(n.role))) / 4;
      for (const e of [im.y, im.y + im.h]) if (e > box[1] + q && e < box[3] - q) return e;
    }
  }
  return null;
}
