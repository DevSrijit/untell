// UI kit: the parts of an app for product films (Graphite, Studio, Keynote): a window, a list row, a button, a
// cursor that clicks, a badge, a tab bar and a toast. Use them so no scene hand-builds an app from rects.
//
// Rules this kit enforces:
// - Every part is built from the system's tokens: the surface, 1 px rule borders, the system radius, the label
//   and body roles. Nothing glows and nothing casts a shadow.
// - No stock window chrome. A window never draws the three title-bar dots of a mocked desktop window (lint rule
//   tell/window-chrome). Its head comes from the system's tokens (windowHead): "title", a title and a hairline
//   rule; "tabs", the title as the one open tab of a tab strip (a one-frame system: Console, Raw, Title);
//   "none", no head at all (a system with a large radius: Studio, Keynote, Pop draw a quiet card).
// - The accent marks the one thing that matters in the frame: the primary button, the active tab's underline,
//   the selected row's bar, an accent badge, the toast's bar. Each such mark is also a shape (a bar, a fill, an
//   underline), so it never rides on colour alone.
// - Text on a filled part uses the role made for that fill (onAccent on the accent). Every text is measured and
//   checked against the text-safe area. A part fits its text: a word is never cut. A list row gives its name
//   the room left after its trailing cells (badge, meta). When the name needs more, the row tightens its gaps,
//   then sets the trailing cells on a second line under the name, then shortens the meta, and only then shortens
//   the name, at a word boundary. A part that cannot hold its text at its role's size throws.
// - An avatar holds two wide letters: the letters never touch its ring, and every avatar of a system has one
//   size, so the names of a list share one left edge.
// - Parts come on and go off by the system's vocabulary (a cut in a one-frame or opaque system, else a fade),
//   and show from frame 0 when `at` is 0 or before.
// - The cursor moves between points on the system's move curve and never jumps in a tweened system. A click is
//   a press of the cursor (it scales to 0.85 and back in 4 frames) and a ring that opens from the tip and
//   fades. A button pressed at the same time dips with it (`press`).
// - The cursor never covers the letters it clicks: a point given as `to` (a node id) aims at the lower right of
//   that part where the whole arrow keeps clear of every text in `targets`, and the cursor rests there.
// - The tab underline moves to the active tab on the move curve; the active label is ink, the others inkMuted,
//   and a label changes colour in one frame. With `w`, the tab bar's rule spans the content's width.
// - Parts name their boxes: `<id>-content` (window), `<id>-box` (row, button, badge, toast), `<id>-tab:<n>`.
// - Small text (a meta, a badge, a tab, a window's title) is set in the smallest of label, caption and body whose
//   letters keep the phone floor (UI_CAP px cap height on a 390 px wide phone): `smallRole`. Graphite's label is
//   under it, so its small text is caption.
// - A window with no box takes the system's composition of one line and one subject (`windowBox`): at 9:16 a tall
//   window from one gap under a headline to the text-safe foot, across the picture-safe width (the hook's share);
//   at 16:9 a wide one. Two windows with no box (a screen that swaps) take the same box, so the eye stays.
// - `rows` fill a window to the text-safe foot (never an empty list: Graphite): the rows share that height, and the
//   rows' text keeps the text-safe area, the low band's right edge included. At 9:16 the window's body runs on to the
//   picture-safe foot as a graphic: the list runs on under the fold as row rules at the same pitch, with no text, so
//   the lower third of the frame is a calm list, not an empty panel (grey bars in those rows read as loading).
// - How much a window fills at 9:16 (the default box, Graphite): the picture-safe width (86 % of the frame's width),
//   from one gap under a two-line headline to the picture-safe foot (69 % of its height): 59 % of the frame. Its rows
//   have the content from under the head to the text-safe foot, about 640 px: 5 one-line rows (6 dense ones, one pad
//   less each), or 3 two-line rows; a toolbar takes about one row. The window throws with the numbers when they do
//   not fit: give fewer rows, or a shorter headline.
// - What a `listRow` holds: on one line, an avatar (two initials), the name (body), a badge and a meta on the right
//   (small text); when the name does not fit beside them, the badge and the meta move to a second line. For four
//   fields (a name, a product, a quantity, a time) give `detail`: the row takes two lines, the name on the first and
//   the detail, the badge and the meta on the second.
// - States are data: a selected row's plate, bar and selected text carry `state: "selected"`, an active tab's label
//   and underline `state: "active"`; both renderers write `data-state`. A list allows one selected row at a time
//   unless `multi: true`; two at once throw.
import { appear, crisp, go, px, seq, textSafe, cut, switchAt, frameOf, steps, onGrid } from "../context";
import { centreInk, inkBand, inkKind, onBaseline } from "../layout";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node, Tracks } from "../types";
import { phoneCap } from "../layout";
import { DIRECTION } from "../../direction";
import { vocabulary } from "../vocabulary";
import { typed, typeTimes, windows } from "./codeBlock";
import { onOff } from "./shape";
import { fitWords, type Box } from "./util";
import { lineAndSubject } from "./compose";
import { builtBlock, leave, MEASURING } from "./handover";
import { valueAt } from "../time";

const F = 1 / 30;

/** On and off by the system's vocabulary. */
const how = (ctx: Ctx) => { const v = vocabulary(ctx); return ctx.instant || v.opaque || v.text === "cut" ? "cut" as const : "fade" as const; };
const showFor = (ctx: Ctx, at: number, until?: number): Tracks => ({ opacity: onOff(ctx, at, until, how(ctx), how(ctx)) });
const hair = (ctx: Ctx) => Math.max(1, Math.round(ctx.stroke * 0.5));
const pad = (ctx: Ctx) => Math.round(ctx.size("label") * 0.6);
/** The least cap height, px on a 390 px wide phone, of any text in the UI kit (the phone floor). */
export const UI_CAP = 11;
/** The role for the kit's small text: the smallest of label, caption and body that keeps the phone floor. */
export const smallRole = (ctx: Ctx): "label" | "caption" | "body" =>
  (["label", "caption"] as const).find((r) => phoneCap(ctx.system, r) >= UI_CAP) ?? "body";
type R = "label" | "caption" | "body";
const rowH = (ctx: Ctx, role: R | "headline" | "display") => Math.ceil(ctx.size(role) * Math.max(ctx.system.type[role].leading, 1.4));
/** The width of a text in a role. */
const wOf = (ctx: Ctx, text: string, role: R | "headline" | "display") => ctx.measure(text, role);

/** Where a part's text sits: its ink centred in a box (the part, a cell, a row), or its baseline on a line shared with other text. */
type Place = { centre: { y: number; h: number } } | { baseline: number };

/**
 * A text node that fits `max` px: the whole text, or its leading words with an ellipsis (it warns). A word is never
 * cut: when not even the first word fits, it throws. It warns when the text is outside the text-safe area.
 */
function label(ctx: Ctx, id: string, x: number, at: Place, text: string, role: R | "headline" | "display", color: ColorRole, max: number, tracks: Tracks, owner: string, align: "left" | "right" | "center" = "left", state?: "selected" | "active" | "disabled"): Node {
  const f = fitWords(text, max, (t) => wOf(ctx, t, role));
  if (!f) throw new Error(`${owner}: "${text}" does not fit ${Math.round(max)} px in the ${role} role (it needs ${Math.round(wOf(ctx, text, role))} px); give the part more room or fewer words`);
  if (f.cut) console.warn(`${owner}: "${text}" was shortened to "${f.text}" to fit ${Math.round(max)} px`);
  const y = "centre" in at ? centreInk(ctx, f.text, role, at.centre) : onBaseline(ctx, role, at.baseline);
  const w = wOf(ctx, f.text, role);
  const tx = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  if (!textSafe(ctx, { x: tx, y, w, h: rowH(ctx, role) }, role)) console.warn(`${owner}: "${f.text}" is outside the text-safe area`);
  return { id, kind: "text", x: tx, y, text: f.text, role, color, tracks, ...(state ? { state } : {}) };
}

// ---------------------------------------------------------------- window

/** The head of a window: "title" (a title and a rule), "tabs" (the title as the open tab of a strip) or "none". */
export type WindowHead = "title" | "tabs" | "none";

/**
 * The window head a system draws, from its tokens. A one-frame system (Console, Raw, Title) draws a tab strip, as a
 * terminal does. A system with a large radius (24 px or more at 1080: Studio, Keynote, Pop) draws a quiet card
 * with no head. Every other system draws a title and a rule.
 */
export function windowHead(ctx: Ctx): WindowHead {
  if (ctx.instant) return "tabs";
  if (ctx.system.radius >= 24) return "none";
  return "title";
}

/** The height of a window's head, px: 0 for "none" or for a window without a title. */
export const windowHeadHeight = (ctx: Ctx, head: WindowHead = windowHead(ctx), title = true) => (head === "none" || !title ? 0 : rowH(ctx, smallRole(ctx)) + pad(ctx));

export type UiWindowProps = {
  id?: string;
  /** The window's box, px. Default: windowBox(ctx) (the system's line and subject: a tall window at 9:16). */
  x?: number; y?: number; w?: number; h?: number;
  /** With no box: the height of the line above the window, px. Default: two rows of headline at 9:16, one at 16:9. */
  lineH?: number;
  /**
   * List rows that fill the content to the window's foot (never an empty panel). Each row shares the content's
   * height; the rows' text keeps the text-safe area (the low band's right edge included). A row shows from the
   * window's `at` unless it gives its own.
   */
  rows?: (Omit<ListRowProps, "x" | "y" | "w" | "stack" | "h" | "span" | "at" | "until"> & { at?: number })[];
  /** More than one row may be selected at a time. Default false: two selected rows at once throw. */
  multi?: boolean;
  /** The view's name, in the head. A window without a title draws no head. */
  title?: string;
  /** The head: "title", "tabs" or "none". Default: the system's (windowHead). */
  head?: WindowHead;
  /** A sidebar of this width, px, on the left of the content. */
  sidebar?: number;
  /**
   * A toolbar under the head: tabs on the left and one action button on the right, in one row that shares one
   * baseline and one bottom line. The `-content` anchor starts under it. The button names `<id>-action-box`.
   */
  toolbar?: { tabs: string[]; active?: { index: number; at: number }[]; action?: { text: string; kind?: "primary" | "secondary"; press?: number[]; done?: { at: number; text: string } } };
  /** The content's inset from the window's edges, px (the toolbar's left and right edge). Default: the kit's pad. */
  inset?: number;
  /** How the window comes on at `at`: "cut" (in one frame, every part) or "fade" (the system's entrance). Default: the system's. */
  enter?: "cut" | "fade";
  /** How it goes at `until`: "cut" or "fade". Default: the system's. */
  exit?: "cut" | "fade";
  /**
   * The id of a window built before this one that this window takes the place of: the next screen of one app window.
   * The swap never shows two screens at once: on `at` the frame (panel, head rules) cuts from the old window to this
   * one (the same box shows no change), the old window's content (its title, toolbar and rows) has left by then, by
   * the system's exit, and this window's content enters from `at` by `enter`. With `enter: "cut"` the old content cuts
   * out on the same frame instead: one clean cut of the whole screen.
   */
  replaces?: string;
  at: number;
  until?: number;
};

/**
 * The toolbar row of a window whose content box starts at `top`: a pad, then one row as tall as the button (or the
 * tab bar, when that is taller). The button's bottom edge and the tab bar's rule are the row's bottom line; the tab
 * labels take the button label's baseline.
 */
export function toolbarLayout(ctx: Ctx, x: number, top: number, w: number, inset: number, action?: string, insetY = inset) {
  const b = action ? buttonSize(ctx, action) : null;
  const h = Math.max(b?.h ?? 0, tabHeight(ctx));
  const y = top + insetY;
  const button = b ? { x: x + w - inset - b.w, y: y + h - b.h, w: b.w, h: b.h } : null;
  const baseline = button ? centreInk(ctx, action!, "body", button) + inkBand(ctx, action!, "body").baseline : undefined;
  return { x: x + inset, y, h, tabW: (button ? button.x - inset : x + w - inset) - (x + inset), button, baseline, bottom: y + h };
}

/** The height a toolbar adds under a window's head: its top inset and its row. */
export const toolbarHeight = (ctx: Ctx, inset: number, action?: string) => inset + Math.max(action ? buttonSize(ctx, action).h : 0, tabHeight(ctx));

/**
 * The box of a window that is the film's subject, with one line above it, by the system's composition (Direction
 * `compose`). "top" (Graphite, Studio, Keynote, Matte): at 9:16 the window runs from one gap under the line at the
 * text-safe top to the picture-safe foot, across the picture-safe width (its rows stop at the text-safe foot); at 16:9 a wide
 * window (16:10) as tall as the room under the line, centred. Any other composition: the
 * subject's box of lineAndSubject. `lineH`: the line's height (default two rows of headline at 9:16, one at 16:9).
 */
export function windowBox(ctx: Ctx, o: { lineH?: number; gap?: number } = {}): Box {
  const S = ctx.safe, gap = o.gap ?? Math.round(ctx.lineHeight("body"));
  // The line: two rows of headline at 9:16, one at 16:9 (a wide frame sets a short line on one row).
  const lineH = o.lineH ?? (ctx.height > ctx.width ? 2 : 1) * ctx.lineHeight("headline");
  const m = Math.ceil(ctx.system.margin * Math.min(ctx.width, ctx.height));
  const P = { x: m, y: m, w: ctx.width - 2 * m, h: ctx.height - 2 * m };
  const kind = DIRECTION[ctx.system.id]?.compose?.kind ?? "centred";
  const tall = ctx.height > ctx.width;
  const top = Math.round(S.top + lineH + gap);
  if (kind === "top" || kind === "picture" || kind === "behind" || kind === "fill") {
    // At 9:16 the window is a picture: its body runs to the picture-safe foot, as a chart's bars hang into the low
    // band; its rows (the text a viewer reads) keep to the text-safe foot (uiWindow rows).
    if (tall) return { x: P.x, y: top, w: P.w, h: P.y + P.h - top };
    // A wide window: the room's full height, 16:10, centred (wider than the hook's share: the rows need the height).
    const h = S.bottom - top, w = Math.min(P.w, Math.round(h * 1.6));
    return { x: Math.round(P.x + (P.w - w) / 2), y: top, w, h };
  }
  return lineAndSubject(ctx, { lineH, gap, aspect: tall ? 0.8 : 1.6 }).subject;
}

/** Throws when two of the rows are selected on one frame (a list has one selection), unless `multi`. */
export function oneSelected(owner: string, rows: { id?: string; selected?: { at: number; until?: number }[] }[], multi = false): void {
  if (multi) return;
  const spans = rows.flatMap((r, i) => (r.selected ?? []).map((q) => ({ row: r.id ?? `row ${i}`, on: frameOf(q.at), off: q.until === undefined ? Infinity : Math.max(frameOf(q.until), frameOf(q.at) + 1) })));
  for (let i = 0; i < spans.length; i++) for (let j = i + 1; j < spans.length; j++) {
    const a = spans[i]!, b = spans[j]!;
    if (a.row !== b.row && a.on < b.off && b.on < a.off)
      throw new Error(`${owner}: rows "${a.row}" and "${b.row}" are both selected on frame ${Math.max(a.on, b.on)}; a list has one selection. End one span where the next starts, or give multi: true for a list that selects many.`);
  }
}

/** The parts of a window that are its frame, not its content: they cut at a swap, so the same box shows no change. */
const FRAME_PARTS = /-(panel|bar-rule|tab-edge|side-rule)$/;

/**
 * A node shown from `at` by a cut: its opacity is 0 before `at` and, from `at`, the value its entrance reaches; any
 * other track that moves during the entrance (a rise) holds its end value. Later keys (a selection, a press) stay.
 */
function cutIn(ctx: Ctx, n: Node, at: number): Node {
  const end = at + ctx.dur.enter + 2 / 30, tr = n.tracks;
  if (!tr?.opacity?.length) return { ...n, tracks: { ...(tr ?? {}), opacity: cut(at, 0, 1) } } as Node;
  const out: Tracks = {};
  for (const [k, keys] of Object.entries(tr) as [keyof Tracks, Key[]][]) {
    if (!keys?.length) continue;
    const v = valueAt(ctx.system, keys, k as never, end), later = keys.filter((q) => q.t > end + 1e-9);
    out[k] = k === "opacity" ? [...(v > 0.01 ? cut(at, 0, v) : [{ t: 0, v: 0 }]), ...later] : [{ t: 0, v }, ...later];
  }
  return { ...n, tracks: out } as Node;
}

/** A node hidden from `until` by a cut: its keys before `until` stay, and it is 0 from the frame that shows `until`. */
function cutOut(ctx: Ctx, n: Node, until: number): Node {
  const keys = n.tracks?.opacity?.length ? n.tracks.opacity : [{ t: 0, v: 1 }];
  const v = valueAt(ctx.system, keys, "opacity", until);
  return { ...n, tracks: { ...(n.tracks ?? {}), opacity: [...keys.filter((q) => q.t < until - 1e-9), ...(v > 0.01 ? cut(until, v, 0) : [{ t: until, v: 0 }])] } } as Node;
}

export const uiWindow: Block<UiWindowProps> = (p0, ctx) => {
  const id = p0.id ?? "window";
  const built = windowParts(p0, ctx);
  const enterCut = p0.enter === "cut", exitCut = p0.exit === "cut" && p0.until !== undefined;
  // The swap: the old window's frame cuts on `at`, its content has left by then (a cut with enter "cut").
  const old = p0.replaces !== undefined ? builtBlock(ctx, p0.replaces) : null;
  if (p0.replaces !== undefined && !old && !MEASURING.has(ctx))
    throw new Error(`uiWindow ${id}: replaces "${p0.replaces}", but no window with that id was built before it with this context. Build the window it replaces first, with the same ctx.`);
  if (old) {
    const f = frameOf(p0.at);
    for (const n of old) {
      if (n.kind === "audio" || n.kind === "anchor") continue;
      if (enterCut || FRAME_PARTS.test(n.id)) n.tracks = cutOut(ctx, n, p0.at).tracks;
      else leave(ctx, [n], f);
    }
  }
  return built.map((n) => {
    if (n.kind === "anchor") return n;
    let m: Node = n;
    if (enterCut || (old && FRAME_PARTS.test(n.id))) m = cutIn(ctx, m, p0.at);
    if (exitCut) m = cutOut(ctx, m, p0.until!);
    return m;
  });
};

function windowParts(p0: UiWindowProps, ctx: Ctx): Node[] {
  const id = p0.id ?? "window";
  const given = [p0.x, p0.y, p0.w, p0.h].filter((v) => v !== undefined).length;
  if (given > 0 && given < 4) throw new Error(`uiWindow ${id}: give all of x, y, w and h, or none (the system's window box)`);
  const p = { ...p0, ...(given ? {} : windowBox(ctx, { lineH: p0.lineH })) } as UiWindowProps & Box;
  // A window that runs past the text-safe sides (a graphic) keeps its text inside them: the inset grows to reach them.
  const inset = p.inset ?? Math.max(pad(ctx), Math.ceil(ctx.safe.left - p.x), Math.ceil(p.x + p.w - ctx.safe.right));
  const show = showFor(ctx, p.at, p.until);
  const head = p.head ?? windowHead(ctx);
  const bar = windowHeadHeight(ctx, head, !!p.title);
  const P = pad(ctx), hw = hair(ctx);
  const out: Node[] = [
    { id: `${id}-panel`, kind: "rect", x: p.x, y: p.y, w: p.w, h: p.h, fill: "surface", stroke: "rule", strokeWidth: hw, radius: ctx.radius, layer: -1, pane: true, tracks: show },
  ];
  if (bar && p.title) {
    const inHead = { centre: { y: p.y, h: bar } };
    // The title sits on the content's left inset, past the corner's curve.
    const tx = p.x + Math.max(P, Math.round(ctx.radius * 0.6), inset);
    if (head === "title") {
      out.push(label(ctx, `${id}-title`, tx, inHead, p.title, smallRole(ctx), "inkMuted", p.w - 2 * (tx - p.x), show, `uiWindow ${id}`));
      out.push({ id: `${id}-bar-rule`, kind: "path", d: `M${px(p.x)} ${crisp(p.y + bar, hw)}H${px(p.x + p.w)}`, stroke: "rule", width: hw, tracks: show });
    } else {
      // A tab strip: the title is the open tab. Its right edge is a hairline, and the strip's rule runs from
      // there to the window's right edge, so the tab opens into the content.
      const t = label(ctx, `${id}-title`, tx, inHead, p.title, smallRole(ctx), "ink", p.w - 2 * (tx - p.x) - P, show, `uiWindow ${id}`);
      const tabR = Math.min(p.x + p.w - P, (t.kind === "text" ? t.x : tx) + wOf(ctx, t.kind === "text" ? t.text : p.title, smallRole(ctx)) + (tx - p.x));
      out.push(t);
      out.push({ id: `${id}-tab-edge`, kind: "path", d: `M${px(tabR)} ${px(p.y)}V${px(p.y + bar)}`, stroke: "rule", width: hw, tracks: show });
      out.push({ id: `${id}-bar-rule`, kind: "path", d: `M${px(tabR)} ${crisp(p.y + bar, hw)}H${px(p.x + p.w)}`, stroke: "rule", width: hw, tracks: show });
    }
  }
  let top = p.y + bar;
  // The toolbar: tabs on the left, the action on the right, in one row. The tab bar's rule and the button's bottom
  // edge are one line, and the tab labels sit on the button label's baseline.
  if (p.toolbar) {
    // The sides take the inset (the text-safe edges); the top keeps the given inset or the kit's pad.
    // The button's box takes the wider of its label and its done label (the button keeps one width).
    const act = p.toolbar.action, wide = act?.done && ctx.measure(act.done.text, "body") > ctx.measure(act.text, "body") ? act.done.text : act?.text;
    const T = toolbarLayout(ctx, p.x + (p.sidebar ?? 0), top, p.w - (p.sidebar ?? 0), inset, wide, p.inset ?? P);
    if (p.toolbar.action) out.push(...button({ id: `${id}-action`, x: T.button!.x, y: T.button!.y, text: p.toolbar.action.text, kind: p.toolbar.action.kind, press: p.toolbar.action.press, ...(p.toolbar.action.done ? { done: p.toolbar.action.done } : {}), at: p.at, until: p.until }, ctx));
    if (p.toolbar.tabs.length) out.push(...tab({ id: `${id}-tabs`, x: T.x, y: T.y, w: T.tabW, h: T.h, baseline: T.baseline, tabs: p.toolbar.tabs, active: p.toolbar.active ?? [{ index: 0, at: p.at }], at: p.at, until: p.until }, ctx));
    top = T.y + T.h;
  }
  if (p.sidebar) out.push({ id: `${id}-side-rule`, kind: "path", d: `M${crisp(p.x + p.sidebar, hw)} ${px(top)}V${px(p.y + p.h)}`, stroke: "rule", width: hw, tracks: show });
  out.push({ id: `${id}-content`, kind: "anchor", x: p.x + (p.sidebar ?? 0), y: top, w: p.w - (p.sidebar ?? 0), h: p.y + p.h - top, at: p.at });
  if (p.sidebar) out.push({ id: `${id}-sidebar`, kind: "anchor", x: p.x, y: p.y + bar, w: p.sidebar, h: p.h - bar, at: p.at });
  if (p.rows?.length) {
    oneSelected(`uiWindow ${id}`, p.rows, p.multi);
    // The rows fill the content down to the text-safe foot; a window that runs past it (9:16: into the low band, a
    // graphic) keeps an empty body there, so no text a viewer must read leaves the text-safe area.
    const S = ctx.safe, cx = p.x + (p.sidebar ?? 0), cr = p.x + p.w, foot = Math.min(p.y + p.h, S.bottom);
    // The rows' text starts at the text-safe left and ends by the text-safe right (the low band's, when the rows reach it).
    const rx = Math.max(cx, S.left - P, cx + inset - P);
    const right = Math.min(cr, (foot > S.lowBandTop ? S.lowBandRight : S.right) + P);
    const fits = p.rows.map((r) => ({ ...r, x: rx, w: right - rx }));
    const stack = listRowsStack(ctx, fits);
    // A row may give up one pad of its height (a dense list) before the window throws.
    const least = listRowHeight(ctx, stack) - P, n = p.rows.length;
    if (n * least > foot - top + 0.5) throw new Error(`uiWindow ${id}: ${n} rows need ${n * least} px and the window's content has ${Math.round(foot - top)} px; give fewer rows or a taller window`);
    // The rows share the content's height to the text-safe foot, so the text a viewer reads fills it.
    const rh = Math.floor((foot - top) / n);
    // The plates and rules span the content (less the pad), whatever the text column's width.
    const span = cr - P - rx;
    p.rows.forEach((r, i) => out.push(...listRow({ ...r, x: rx, y: top + i * rh, w: right - rx, span, h: rh, stack, multi: p.multi, at: r.at ?? p.at, until: p.until }, ctx)));
    // A window that runs past the text-safe foot (9:16): its list runs on under the fold, row rules at the same pitch
    // with no text (the rows a viewer would scroll to), so the window's body is a list, not an empty panel. Only the
    // rules: grey bars in the empty rows (tried) read as a loading state, not as a calm list.
    const wfoot = p.y + p.h - P;
    for (let y = top + n * rh + rh, k = 0; y <= wfoot; y += rh, k++)
      out.push({ id: `${id}-more${k}`, kind: "path", d: `M${px(rx)} ${crisp(y, hair(ctx))}H${px(rx + span)}`, stroke: "rule", width: hair(ctx), group: `${id}-more`, tracks: showFor(ctx, p.at, p.until) });
  }
  return out;
}

// ---------------------------------------------------------------- badge

export type BadgeProps = {
  id?: string;
  x: number; y: number;
  text: string;
  /** "accent": a filled accent pill. "muted": a rule-coloured outline. "positive" / "negative": an outline in the status colour. */
  tone?: "accent" | "muted" | "positive" | "negative";
  /** Right-align the badge on x instead of starting it there. */
  align?: "left" | "right";
  at: number;
  until?: number;
};

/** The size of a badge for a text. */
export function badgeSize(ctx: Ctx, text: string) {
  const h = rowH(ctx, smallRole(ctx)), w = ctx.measure(text, smallRole(ctx)) + h * 0.9;
  return { w: Math.round(w), h };
}

export const badge: Block<BadgeProps> = (p, ctx) => {
  const id = p.id ?? "badge";
  const { w, h } = badgeSize(ctx, p.text);
  const x = p.align === "right" ? p.x - w : p.x;
  const tone = p.tone ?? "muted";
  const show = showFor(ctx, p.at, p.until);
  const fill: ColorRole = tone === "accent" ? "accent" : "surface";
  const line: ColorRole = tone === "accent" ? "accent" : tone === "muted" ? "rule" : tone;
  const text: ColorRole = tone === "accent" ? "onAccent" : tone === "muted" ? "inkMuted" : tone;
  return [
    { id: `${id}-pill`, kind: "rect", x, y: p.y, w, h, fill, stroke: line, strokeWidth: hair(ctx), radius: h / 2, tracks: show },
    label(ctx, `${id}-text`, x + w / 2, { centre: { y: p.y, h } }, p.text, smallRole(ctx), text, w, show, `badge ${id}`, "center"),
    { id: `${id}-box`, kind: "anchor", x, y: p.y, w, h, at: p.at },
  ];
};

// ---------------------------------------------------------------- list row

export type ListRowProps = {
  id?: string;
  x: number; y: number; w: number;
  title: string;
  /** Short text on the right (a time, a count). */
  meta?: string;
  /**
   * A second fact under the name (a product, a place), muted: the row's compact layout for four fields. A row with a
   * detail always takes two lines: the name (with its avatar) on the first; the detail, the badge and the meta on the
   * second. Example: name "Iven Nash", detail "Rye loaves", badge "×12", meta "07:30".
   */
  detail?: string;
  /** Initials in a round avatar on the left. */
  initials?: string;
  badge?: { text: string; tone?: BadgeProps["tone"] };
  /**
   * Spans in which the row is selected: a rule-coloured fill and an accent bar on its left edge (state "selected").
   * The rows of one list (one column: the same x and w, built with one ctx) have one selection at a time: a row
   * selected while another is throws, unless `multi`.
   */
  selected?: { at: number; until?: number }[];
  /** This row's list selects many rows at a time. */
  multi?: boolean;
  /**
   * The width of the row's plate and rule, px, when it is wider than its text column `w` (rows in a window wider than
   * the text-safe area: the text keeps to the safe edge, the row still spans the window). Default `w`.
   */
  span?: number;
  /**
   * The row's height, px: taller than its text needs (rows that fill a window), or down to one pad less (a dense
   * list that must fit its window). The text centres in it.
   */
  h?: number;
  /**
   * Set the trailing cells (badge, meta) on a second line under the name. Default: only when the name does not
   * fit beside them. Give the same value to every row of a list (listRowsStack), so the rows share one height.
   */
  stack?: boolean;
  at: number;
  until?: number;
};

/** The height of a list row: one line, or two when its trailing cells sit under the name (`stack`). */
export const listRowHeight = (ctx: Ctx, stack = false) => rowH(ctx, "body") + 2 * pad(ctx) + (stack ? rowH(ctx, smallRole(ctx)) + Math.round(pad(ctx) * 0.4) : 0);

/**
 * The radius of every avatar in a system: half the body row, or more when two wide letters ("MW") need it. It
 * does not depend on the row's own initials, so the names of a list share one left edge.
 */
export const avatarRadius = (ctx: Ctx) => Math.max(Math.round(rowH(ctx, "body") * 0.5), Math.ceil((wOf(ctx, "MW", smallRole(ctx)) + ctx.size(smallRole(ctx)) * 0.6) / 2));

type RowFit = Pick<ListRowProps, "x" | "w" | "title" | "meta" | "initials" | "badge" | "id" | "stack" | "detail">;

/**
 * How a list row shares its width: the avatar, the name, then the trailing cells (badge, meta) on the right.
 * The name gets the room left after the trailing cells. When the name does not fit, the row makes room in this
 * order: it tightens the gaps between its cells to half the pad; it moves the trailing cells to a second line
 * under the name (`stacked`); it shortens the meta at a word boundary; and only then it shortens the name at a
 * word boundary. A word is never cut. It throws when the row cannot hold its avatar, its badge, the first word
 * of its meta and the first word of its name at the roles' sizes.
 */
export function listRowLayout(ctx: Ctx, p: RowFit) {
  const id = p.id ?? "row", P = pad(ctx);
  const r = p.initials ? avatarRadius(ctx) : 0;
  if (p.initials && wOf(ctx, p.initials, smallRole(ctx)) > 2 * r - ctx.size(smallRole(ctx)) * 0.4) throw new Error(`listRow ${id}: the initials "${p.initials}" do not fit an avatar ${2 * r} px wide; use two letters`);
  if (2 * r > listRowHeight(ctx) - 2 * hair(ctx)) throw new Error(`listRow ${id}: an avatar ${2 * r} px wide does not fit a row ${listRowHeight(ctx)} px tall`);
  const nameX = p.x + P + (r ? 2 * r + P : 0);
  const end = p.x + p.w - P;
  const badgeW = p.badge ? badgeSize(ctx, p.badge.text).w : 0;
  const nameW = wOf(ctx, p.title, "body");
  const detailW = p.detail ? wOf(ctx, p.detail, smallRole(ctx)) : 0;
  // The room the name has, and the room the trailing cells have, in one layout. A detail sits on the second line
  // before the badge and the meta.
  const layout = (gap: number, stacked: boolean, meta: string | undefined) => {
    const metaW = meta ? wOf(ctx, meta, smallRole(ctx)) : 0;
    const cells = [detailW, badgeW, metaW].filter((w) => w > 0);
    const trail = cells.reduce((a, w) => a + w, 0) + Math.max(0, cells.length - 1) * gap;
    const room = stacked ? end - nameX : end - nameX - trail - (trail ? gap : 0);
    return { gap, stacked, meta, room, trail, trailRoom: stacked ? end - nameX : trail };
  };
  if (p.detail && p.stack === false) throw new Error(`listRow ${id}: a row with a detail takes two lines; drop stack: false`);
  let L = layout(P, !!p.stack || !!p.detail, p.meta);
  if (nameW > L.room && !p.stack) L = layout(Math.round(P / 2), false, p.meta);
  if (nameW > L.room && p.stack !== false) L = layout(Math.round(P / 2), true, p.meta);
  // The meta shortens when the name still needs room, or when a stacked line cannot hold it.
  if (p.meta && ((!L.stacked && nameW > L.room) || L.trail > L.trailRoom)) {
    const over = L.stacked ? L.trail - L.trailRoom : Math.max(nameW - L.room, L.trail - L.trailRoom);
    const m = fitWords(p.meta, wOf(ctx, p.meta, smallRole(ctx)) - over, (t) => wOf(ctx, t, smallRole(ctx)));
    const words = p.meta.split(/\s+/);
    L = layout(L.gap, L.stacked, m ? m.text : words.length > 1 ? `${words[0]}…` : p.meta);
  }
  if (L.trail > L.trailRoom + 0.5) throw new Error(`listRow ${id}: the ${p.detail ? "detail, the " : ""}badge and the meta need ${Math.round(L.trail)} px, and the row has ${Math.round(L.trailRoom)} px; widen the row${p.detail ? " or shorten the detail" : ""}`);
  const name = fitWords(p.title, L.room, (t) => wOf(ctx, t, "body"));
  if (!name) throw new Error(`listRow ${id}: "${p.title}" does not fit: the row is ${Math.round(p.w)} px wide and leaves the name ${Math.round(L.room)} px; widen the row or shorten the name`);
  return { h: listRowHeight(ctx, L.stacked), room: L.room, r, nameX, name: name.text, nameCut: name.cut, meta: L.meta, metaCut: L.meta !== p.meta, gap: L.gap, end, badgeW, stacked: L.stacked };
}

/** True when any row of a list needs a second line: give the result to every row as `stack`, so they share one height. */
export const listRowsStack = (ctx: Ctx, rows: RowFit[]) => rows.some((r) => !!r.detail || listRowLayout(ctx, { ...r, stack: undefined }).stacked);

/** The selections of the lists built with one ctx, by column (x and w): one selection per list. */
const selections = new WeakMap<Ctx, Map<string, { id?: string; selected?: { at: number; until?: number }[] }[]>>();

export const listRow: Block<ListRowProps> = (p, ctx) => {
  const id = p.id ?? "row";
  if (p.selected?.length && !p.multi) {
    const lists = selections.get(ctx) ?? new Map();
    selections.set(ctx, lists);
    const key = `${Math.round(p.x)}|${Math.round(p.w)}`;
    // A row built again (the same id: a scene built twice with one ctx) replaces its earlier entry.
    const rows = (lists.get(key) ?? []).filter((r: { id?: string }) => r.id !== id);
    rows.push({ id, selected: p.selected.map((q) => ({ at: q.at, until: q.until ?? p.until })) });
    lists.set(key, rows);
    oneSelected(`listRow ${id}`, rows);
  }
  const L = listRowLayout(ctx, p);
  // A taller row (rows that fill a window), or a denser one (one pad less at most): its lines centre in it.
  const P = pad(ctx), h = p.h === undefined ? L.h : Math.max(L.h - P, Math.round(p.h)), dy = Math.round((h - L.h) / 2);
  const show = showFor(ctx, p.at, p.until);
  const out: Node[] = [];
  for (const [k, s] of (p.selected ?? []).entries()) {
    const sel = { opacity: windows([[s.at, s.until ?? p.until]]) };
    out.push({ id: `${id}-sel${k}`, kind: "rect", state: "selected", x: p.x, y: p.y, w: Math.max(p.w, p.span ?? 0), h, fill: "rule", radius: Math.min(ctx.radius, 6), layer: -1, z: 1, tracks: sel });
    out.push({ id: `${id}-sel${k}-bar`, kind: "rect", state: "selected", x: p.x, y: p.y + P * 0.5, w: Math.max(3, Math.round(ctx.stroke * 1.5)), h: h - P, fill: "accent", tracks: sel });
  }
  if (p.initials) {
    const cx = p.x + P + L.r;
    // The avatar sits on the name's line, so a stacked row reads as name first.
    const cy = L.stacked ? p.y + dy + P + rowH(ctx, "body") / 2 : p.y + h / 2;
    out.push({ id: `${id}-avatar`, kind: "circle", cx, cy, r: L.r, fill: "surface", stroke: "rule", width: hair(ctx), tracks: show });
    out.push(label(ctx, `${id}-initials`, cx, { centre: { y: cy - L.r, h: 2 * L.r } }, p.initials, smallRole(ctx), "ink", 2 * L.r, show, `listRow ${id}`, "center"));
  }
  if (L.metaCut) console.warn(`listRow ${id}: the meta "${p.meta}" was shortened to "${L.meta}" to give the name room`);
  // The meta is inkMuted, which does not keep 4.5:1 on the selected row's rule fill: while the row is selected, the
  // meta changes to ink in one frame (two copies, one shown at a time, so no text sits on another).
  const meta = (x: number, at: Place, align: "left" | "right"): Node[] => {
    const spans = (p.selected ?? []).map((q) => [q.at, q.until ?? p.until] as [number, number | undefined]).sort((a, b) => a[0] - b[0]);
    const muted = label(ctx, `${id}-meta`, x, at, L.meta!, smallRole(ctx), "inkMuted", wOf(ctx, L.meta!, smallRole(ctx)), show, `listRow ${id}`, align);
    if (!spans.length) return [muted];
    // The muted copy keeps its own entrance and exit, and steps to 0 over each selected span.
    const base = show.opacity ?? [];
    const first = spans[0]![0], ends = spans.map(([, b]) => b);
    const lastEnd = ends.includes(undefined) ? Infinity : Math.max(...(ends as number[]));
    const keys: Key[] = [...base.filter((k) => k.t < first)];
    for (const [a, b] of spans) {
      keys.push(...switchAt(Math.max(1, frameOf(a)), 1, 0, Math.max(a, keys[keys.length - 1]?.t ?? 0)));
      if (b !== undefined) keys.push(...switchAt(Math.max(frameOf(b), frameOf(a) + 1), 0, 1, Math.max(b, keys[keys.length - 1]!.t)));
    }
    keys.push(...base.filter((k) => k.t > lastEnd + F));
    // The two copies are one meta in two states: one group, so the checks read the change as a state, not an entrance.
    const on = label(ctx, `${id}-meta-on`, x, at, L.meta!, smallRole(ctx), "ink", wOf(ctx, L.meta!, smallRole(ctx)), { opacity: windows(spans) }, `listRow ${id}`, align, "selected");
    return [{ ...muted, group: `${id}-meta`, tracks: { ...muted.tracks, opacity: keys } } as Node, { ...on, group: `${id}-meta` } as Node];
  };


  if (L.stacked) {
    // The second line: the detail, the badge, then the meta, on the name's left edge.
    const ly = p.y + dy + P + rowH(ctx, "body") + Math.round(P * 0.4);
    let x = L.nameX;
    if (p.detail) {
      out.push(label(ctx, `${id}-detail`, x, { centre: { y: ly, h: badgeSize(ctx, p.badge?.text ?? p.detail).h } }, p.detail, smallRole(ctx), "inkMuted", wOf(ctx, p.detail, smallRole(ctx)), show, `listRow ${id}`));
      x += wOf(ctx, p.detail, smallRole(ctx)) + L.gap;
    }
    if (p.badge) {
      const b = badgeSize(ctx, p.badge.text);
      out.push(...badge({ id: `${id}-badge`, x, y: ly, text: p.badge.text, tone: p.badge.tone, at: p.at, until: p.until }, ctx));
      x += b.w + L.gap;
    }
    // The meta's ink centres on the badge's line, as the badge's text does.
    if (L.meta) out.push(...meta(x, { centre: { y: ly, h: badgeSize(ctx, p.badge?.text ?? L.meta).h } }, "left"));
  } else {
    let right = L.end;
    if (L.meta) {
      out.push(...meta(right, { centre: { y: p.y, h } }, "right"));
      right -= wOf(ctx, L.meta, smallRole(ctx)) + L.gap;
    }
    if (p.badge) {
      const b = badgeSize(ctx, p.badge.text);
      out.push(...badge({ id: `${id}-badge`, x: right, y: p.y + (h - b.h) / 2, text: p.badge.text, tone: p.badge.tone, align: "right", at: p.at, until: p.until }, ctx));
    }
  }
  if (L.nameCut) console.warn(`listRow ${id}: "${p.title}" was shortened to "${L.name}"; the row has no more room`);
  out.push(label(ctx, `${id}-title`, L.nameX, { centre: L.stacked ? { y: p.y + dy + P, h: rowH(ctx, "body") } : { y: p.y, h } }, L.name, "body", "ink", L.room + 0.5, show, `listRow ${id}`));
  const sw = Math.max(p.w, p.span ?? 0);
  out.push({ id: `${id}-rule`, kind: "path", d: `M${px(p.x)} ${crisp(p.y + h, hair(ctx))}H${px(p.x + sw)}`, stroke: "rule", width: hair(ctx), tracks: show });
  out.push({ id: `${id}-box`, kind: "anchor", x: p.x, y: p.y, w: sw, h, at: p.at });
  return out;
};

// ---------------------------------------------------------------- button

export type ButtonProps = {
  id?: string;
  x: number; y: number;
  text: string;
  /** "primary": the accent fill (the one action). "secondary": an outline. */
  kind?: "primary" | "secondary";
  /**
   * A bottom edge this many px deep, in ink, that the face sinks onto when pressed (Pop's chunky button). A press
   * must read as a press, not as jitter: the depth is at least 12 % of the label's size (about 6 px at body).
   */
  depth?: number;
  /** The label's role, and with it the button's size: "body" (the default), "headline" or "display" (a big call). */
  role?: "body" | "headline" | "display";
  /** Times the button is pressed (with the cursor's click). */
  press?: number[];
  /**
   * The action is done: from `at` (the frame after its click, say) the button shows `text` ("Ready", "Sent") as a
   * plain outline, not the call to action, by a cut. The state a click causes shows after the click, never before.
   */
  done?: { at: number; text: string };
  at: number;
  until?: number;
};

/** The size of a button for a text. */
export function buttonSize(ctx: Ctx, text: string, role: "body" | "headline" | "display" = "body") {
  const k = ctx.size(role) / ctx.size("body");
  const h = Math.ceil(ctx.size(role) * Math.max(ctx.system.type[role].leading, 1.4)) + Math.round(pad(ctx) * k), w = ctx.measure(text, role) + 2 * h * 0.6;
  return { w: Math.round(w), h };
}

export const button: Block<ButtonProps> = (p, ctx) => {
  const id = p.id ?? "button";
  const role = p.role ?? "body";
  if (p.done && p.press?.length && Math.min(...p.press) > p.done.at) throw new Error(`button ${id}: done at ${p.done.at} s comes before its press at ${Math.min(...p.press)} s; the done state shows after the click that causes it`);
  // A button that changes to its done label keeps one width: the wider of its two labels.
  const sz = buttonSize(ctx, p.text, role), szDone = p.done ? buttonSize(ctx, p.done.text, role) : sz;
  const w = Math.max(sz.w, szDone.w), h = sz.h;
  const primary = (p.kind ?? "primary") === "primary";
  const show = showFor(ctx, p.at, p.until);
  // A dip of 1-2 px reads as jitter (the tiny-move check): a given depth is at least 12 % of the label's size.
  const depth = p.depth ? Math.max(p.depth, Math.ceil(ctx.size(role) * 0.12)) : 0;
  // A press: the face sinks (down by the depth, or to 0.96) over 3 frames on the system's enter curve, holds 2 frames
  // and springs back on it (with its overshoot, where the system has one). A one-frame jump read as jitter. In a
  // one-frame system the press is the one-frame dip it always was.
  const dip = (rest: number, on: number): Key[] => ctx.instant
    ? steps(rest, (p.press ?? []).flatMap((t) => [[t, on], [t + 4 * F, rest]] as [number, number][]))
    : [{ t: 0, v: rest }, ...(p.press ?? []).slice().sort((a, b) => a - b).flatMap((t): Key[] => [{ t, v: rest }, { t: t + 3 * F, v: on, curve: ctx.noOvershoot("enter") },
      { t: t + 5 * F, v: on }, { t: t + 5 * F + Math.max(6 * F, ctx.dur.enter), v: rest, curve: "enter" }])];
  const face: Tracks = { ...show, ...(p.press?.length ? (depth ? { y: dip(0, depth) } : { scale: dip(1, 0.96) }) : {}) };
  const out: Node[] = [];
  // The edge sits one depth under the face on purpose: one group, two rows, so the alignment model reads them as apart
  // by design, not as a near miss.
  if (depth) out.push({ id: `${id}-edge`, kind: "rect", x: p.x, y: p.y + depth, w, h, fill: "ink", radius: ctx.radius, group: id, row: `${id}-edge`, tracks: show });
  out.push({ id: `${id}-face`, kind: "rect", x: p.x, y: p.y, w, h, fill: primary ? "accent" : "surface", stroke: primary ? "accent" : "rule", strokeWidth: hair(ctx), radius: ctx.radius, z: 1, origin: [0.5, 0.5], group: id, row: `${id}-face`, tracks: face });
  const t = label(ctx, `${id}-text`, p.x + w / 2, { centre: { y: p.y, h } }, p.text, role, primary ? "onAccent" : "ink", w, face, `button ${id}`, "center");
  // The label scales with the face about the face's centre.
  if (t.kind === "text" && face.scale) { t.width = w; t.x = p.x; t.align = "center"; t.origin = [0.5, 0.5]; }
  out.push(t);
  out.push({ id: `${id}-box`, kind: "anchor", x: p.x, y: p.y, w, h, at: p.at });
  if (!p.done) return out;
  // Done: the call-to-action face and label cut out, and an outlined face with the done label cuts in.
  const doneFace: Node = { id: `${id}-done-face`, kind: "rect", x: p.x, y: p.y, w, h, fill: "surface", stroke: "rule", strokeWidth: hair(ctx), radius: ctx.radius, z: 1, group: id, row: `${id}-face`, tracks: show };
  const doneText = label(ctx, `${id}-done-text`, p.x + w / 2, { centre: { y: p.y, h } }, p.done.text, role, "ink", w, show, `button ${id}`, "center");
  return [...out.map((n) => (n.kind === "anchor" || n.id === `${id}-edge` ? n : cutOut(ctx, n, p.done!.at))), cutIn(ctx, doneFace, p.done.at), cutIn(ctx, doneText, p.done.at)];
};

// ---------------------------------------------------------------- field

export type FieldProps = {
  id?: string;
  /** The field's top-left corner (its name's top) and its width, px. */
  x: number; y: number; w: number;
  /** The field's name, over the box ("Your file", "Email"). */
  label: string;
  /** What is typed into the box. Left out: an empty box, ready for input. */
  value?: string;
  /** When the value starts to type. Default: the field's `at` plus its entrance. */
  typeAt?: number;
  /** Typing rate in characters a second. Default 13 (a person at a keyboard). */
  cps?: number;
  /** The value's role: "body" (the default) or "headline" for a system whose body is under the phone floor (Raw). */
  role?: "body" | "headline";
  at: number;
  until?: number;
};

/** The height of a field: its name, a gap, and the ruled box around one row of its role. */
export function fieldHeight(ctx: Ctx, role: "body" | "headline" = "body") {
  return rowH(ctx, smallRole(ctx)) + Math.round(pad(ctx) * 0.5) + rowH(ctx, role) + 2 * pad(ctx);
}

/**
 * Field: a form field as a page draws it. The name over a ruled box in the ink, and the value typed into the box at a
 * person's pace, one key a frame at most. The name is in the kit's small role (it keeps the phone floor); the box has
 * the system's corner and a hairline edge. A value wider than the box throws: shorten it or widen the field. It names
 * its box (anchor `<id>-box`), so a cursor can click it and a button can sit under it.
 */
export const field: Block<FieldProps> = (p, ctx) => {
  const id = p.id ?? "field";
  const role = p.role ?? "body", small = smallRole(ctx);
  const show = showFor(ctx, p.at, p.until);
  const top = p.y + rowH(ctx, small) + Math.round(pad(ctx) * 0.5), h = rowH(ctx, role) + 2 * pad(ctx);
  const out: Node[] = [label(ctx, `${id}-label`, p.x, { centre: { y: p.y, h: rowH(ctx, small) } }, p.label, small, "inkMuted", p.w, show, `field ${id}`)];
  out.push({ id: `${id}-edge`, kind: "rect", x: p.x, y: top, w: p.w, h, fill: "ground", stroke: "ink", strokeWidth: hair(ctx), radius: ctx.radius, group: id, tracks: show });
  if (p.value) {
    if (ctx.measure(p.value, role) > p.w - 2 * pad(ctx)) throw new Error(`field ${id}: "${p.value}" is wider than the box (${Math.round(p.w - 2 * pad(ctx))} px inside); shorten the value or widen the field`);
    const start = p.typeAt ?? p.at + (ctx.instant ? 0 : ctx.dur.enter);
    const ty = top + Math.round((h - rowH(ctx, role)) / 2);
    const times = typeTimes(p.value, start, p.cps ?? 13);
    out.push(...typed(ctx, { id: `${id}-value`, x: p.x + pad(ctx), y: ty, role, segments: [{ text: p.value, color: "ink" }], times, until: p.until, z: 2 }).nodes);
  }
  out.push({ id: `${id}-box`, kind: "anchor", x: p.x, y: top, w: p.w, h, at: p.at });
  return out;
};

// ---------------------------------------------------------------- cursor

/** A point of the cursor's path: a place in px, or `to`, the id of a node or anchor in `targets` to click. */
export type CursorPoint = { x: number; y: number; at: number } | { to: string; at: number };

export type CursorProps = {
  id?: string;
  /**
   * The tip's path: where it is, and when it arrives there. The first point is where it starts. A point with `to`
   * aims at that part (a node id, such as a button's `<id>-box`): the tip lands on its lower right, where the
   * whole arrow keeps clear of every text in `targets`.
   */
  path: CursorPoint[];
  /** The scene's nodes: the parts `to` names, and the texts the arrow must not cover. */
  targets?: Node[];
  /** Times of clicks. */
  clicks?: number[];
  /**
   * How long each click's ring takes to fade, s. Default: 1.6 times the system's exit. A short ring (or 0: no ring)
   * keeps a hold that starts on the last click: the checks read a fading ring as a change.
   */
  ring?: number;
  at: number;
  until?: number;
};

/** The size of the cursor's arrow, px: its height is 1.12 x this, its width 0.74 x this. */
export const cursorSize = (ctx: Ctx) => Math.round(ctx.size("body") * 1.1);

/** The box a node covers at rest, px. A text box is its measured line box (with its align and width). */
export function nodeBox(ctx: Ctx, n: Node): Box | null {
  if (n.kind === "anchor" || n.kind === "rect" || n.kind === "image") return { x: n.x, y: n.y, w: n.w, h: n.h };
  if (n.kind === "circle") return { x: n.cx - n.r, y: n.cy - n.r, w: 2 * n.r, h: 2 * n.r };
  if (n.kind === "path" && n.box) return n.box;
  if (n.kind !== "text") return null;
  const w = ctx.measure(n.text, n.role, { ...(n.keepCase ? { keepCase: true } : {}), ...(n.weight !== undefined ? { weight: n.weight } : {}) });
  const x = n.width && n.align === "center" ? n.x + (n.width - w) / 2 : n.width && n.align === "right" ? n.x + n.width - w : n.x;
  // The glyph box: about 1.4 x the size tall, centred on the line box (as textSafe measures it).
  const lh = ctx.lineHeight(n.role);
  const o = Math.max(0, (ctx.size(n.role) * 1.4 - lh) / 2);
  return { x, y: n.y - o, w, h: lh + 2 * o };
}

/** The box the cursor's arrow covers with its tip at (x, y), its outline included. */
export function arrowBox(ctx: Ctx, x: number, y: number): Box {
  const s = cursorSize(ctx), o = Math.max(1.5, ctx.stroke);
  return { x: x - o, y: y - o, w: s * 0.74 + 2 * o, h: s * 1.12 + 2 * o };
}

const meets = (a: Box, b: Box, g = 0) => a.x - g < b.x + b.w && b.x < a.x + a.w + g && a.y - g < b.y + b.h && b.y < a.y + a.h + g;

/**
 * Where the cursor's tip clicks the part `to` names: a point inside the part, as near its lower right (82 % across,
 * 72 % down) as it can be, where the whole arrow keeps a gap clear of every text in `targets`. It throws when the part is not
 * in `targets`, or when no point of it leaves the letters clear.
 */
export function aimAt(ctx: Ctx, targets: Node[], to: string): { x: number; y: number } {
  const n = targets.find((t) => t.id === to);
  if (!n) throw new Error(`cursor: no node "${to}" in targets; pass the scene's nodes as targets`);
  const b = nodeBox(ctx, n);
  if (!b) throw new Error(`cursor: the node "${to}" has no box to aim at`);
  const texts = targets.filter((t) => t.kind === "text").map((t) => nodeBox(ctx, t)!).filter(Boolean);
  const gap = Math.max(2, Math.round(ctx.size("label") * 0.15));
  // The candidates: a grid over the part, kept a little inside its edges, best first (lower right).
  const cands: { x: number; y: number; score: number }[] = [];
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 8; j++) {
    const fx = 0.94 - (i * 0.88) / 12, fy = 0.86 - (j * 0.72) / 8;
    // The best point sits at about 82 % across and 72 % down: well inside the part, to the lower right.
    cands.push({ x: b.x + b.w * fx, y: b.y + b.h * fy, score: Math.hypot(fx - 0.82, 1.3 * (fy - 0.72)) });
  }
  cands.sort((a, c) => a.score - c.score);
  const hit = cands.find((c) => texts.every((t) => !meets(arrowBox(ctx, c.x, c.y), t, gap)));
  if (!hit) throw new Error(`cursor: every point of "${to}" puts the arrow over a letter; give the part more room beside its text`);
  return { x: Math.round(hit.x), y: Math.round(hit.y) };
}

export const cursor: Block<CursorProps> = (p, ctx) => {
  const id = p.id ?? "cursor";
  const s = cursorSize(ctx);
  const path = p.path.map((q) => ("to" in q ? { ...aimAt(ctx, p.targets ?? [], q.to), at: q.at } : q));
  const [x0, y0] = [path[0]!.x, path[0]!.y];
  // Moves: each leg ends at its point's time, on the move curve; in a one-frame system it jumps there.
  // The first key at 0, or before the first leg when the path starts before the film, so the keys stay in order.
  const k0 = Math.min(0, ...path.slice(1).map((q) => q.at - ctx.dur.move * 1.4 - F));
  const xs: Key[] = [{ t: k0, v: 0 }], ys: Key[] = [{ t: k0, v: 0 }];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!;
    const d = ctx.instant ? F : Math.min(ctx.dur.move * 1.4, Math.max(F, b.at - a.at));
    const leg = (from: number, to: number) => (ctx.instant ? go(ctx, b.at - F, from, to, "step") : seq([{ t: b.at - d, v: from }, { t: b.at, v: to, curve: "move" }]));
    xs.push(...leg(a.x - x0, b.x - x0)); ys.push(...leg(a.y - y0, b.y - y0));
  }
  const show = { opacity: onOff(ctx, p.at, p.until, how(ctx), how(ctx)) };
  // The arrow: tip at (x0, y0), in ink with a ground outline, so it reads on any part.
  const d = `M${px(x0)} ${px(y0)}L${px(x0)} ${px(y0 + s)}L${px(x0 + s * 0.28)} ${px(y0 + s * 0.74)}L${px(x0 + s * 0.48)} ${px(y0 + s * 1.12)}L${px(x0 + s * 0.62)} ${px(y0 + s * 1.05)}L${px(x0 + s * 0.43)} ${px(y0 + s * 0.68)}L${px(x0 + s * 0.74)} ${px(y0 + s * 0.68)}Z`;
  const press: Key[] = [{ t: 0, v: 1 }, ...(p.clicks ?? []).flatMap((t) => [{ t, v: 1 }, { t: t + 2 * F, v: 0.85, curve: "linear" as const }, { t: t + 4 * F, v: 1, curve: "linear" as const }])];
  const out: Node[] = [{ id: `${id}-arrow`, kind: "path", d, fill: "ink", stroke: "ground", width: Math.max(1.5, ctx.stroke), join: "round", layer: 1, z: 2,
    box: { x: x0, y: y0, w: s * 0.74, h: s * 1.12 }, origin: [0, 0], tracks: { ...show, x: xs, y: ys, ...(p.clicks?.length ? { scale: press } : {}) } }];
  // A ring for each click, from the tip's place at that time.
  if (p.ring !== undefined && !(p.ring >= 0)) throw new Error(`cursor ${id}: ring is a time in seconds (0 or more), not ${p.ring}`);
  (p.clicks ?? []).forEach((t, k) => {
    if (p.ring === 0) return;
    const at = [...path].reverse().find((q) => q.at <= t + 1e-6) ?? path[0]!;
    const r = s * 0.6;
    const ring: Tracks = ctx.instant ? { opacity: windows([[t, t + 6 * F]]) }
      : { opacity: seq([{ t: 0, v: 0 }], cut(t, 0, 1), go(ctx, onGrid(t) + F, 1, 0, "exit", p.ring !== undefined ? Math.max(F, p.ring) / ctx.dur.exit : 1.6)), scale: seq([{ t: 0, v: 0.4 }, { t, v: 0.4 }], go(ctx, t, 0.4, 1, ctx.noOvershoot("enter"))) };
    out.push({ id: `${id}-click${k}`, kind: "circle", cx: at.x, cy: at.y, r, stroke: "accent", width: Math.max(2, ctx.stroke), layer: 1, z: 1, origin: [0.5, 0.5], tracks: ring });
  });
  // Where the tip rests after each point, for a scene or a test.
  path.forEach((q, k) => out.push({ id: `${id}-tip:${k}`, kind: "anchor", x: q.x, y: q.y, w: 0, h: 0, at: q.at }));
  return out;
};

// ---------------------------------------------------------------- tab bar

export type TabProps = {
  id?: string;
  x: number; y: number;
  tabs: string[];
  /** The active tab (0-based) from each time on. */
  active: { index: number; at: number }[];
  /** The width of the bar's rule, px: the content's width, so the rule ends on the same edge as the rows. Default: the tabs' width. The tabs must fit it. */
  w?: number;
  /** The bar's height, px: its rule sits at y + h. Default: a label row and a pad. A toolbar gives the button's height, so both share one bottom line. */
  h?: number;
  /** The labels' baseline, px. Default: the labels' ink centred above the underline. A toolbar gives the button label's baseline. */
  baseline?: number;
  at: number;
  until?: number;
};

/** The height of a tab bar. */
export const tabHeight = (ctx: Ctx) => rowH(ctx, smallRole(ctx)) + pad(ctx);

export const tab: Block<TabProps> = (p, ctx) => {
  const id = p.id ?? "tab";
  const P = pad(ctx), h = p.h ?? tabHeight(ctx);
  const uh0 = Math.max(2, Math.round(ctx.stroke * 1.5));
  // One baseline for every label: the ink of the row (x-height when any label has lower case) centred above the underline.
  const rowText = p.tabs.some((t) => inkKind(ctx.system, smallRole(ctx), t) === "x") ? "x" : p.tabs.join("");
  const base = p.baseline ?? centreInk(ctx, rowText, smallRole(ctx), { y: p.y, h: h - uh0 }) + inkBand(ctx, rowText, smallRole(ctx)).baseline;
  const show = showFor(ctx, p.at, p.until);
  const ws = p.tabs.map((t) => ctx.measure(t, smallRole(ctx)));
  const xs: number[] = [];
  let x = p.x;
  for (const w of ws) { xs.push(x); x += w + 2 * P; }
  const out: Node[] = [];
  const steps = [...p.active].sort((a, b) => a.at - b.at);
  p.tabs.forEach((t, i) => {
    const on: [number, number | undefined][] = [], off: [number, number | undefined][] = [];
    let from = p.at;
    let cur = -1;
    for (const st of steps) { if (st.at > from) (cur === i ? on : off).push([from, st.at]); from = Math.max(from, st.at); cur = st.index; }
    (cur === i ? on : off).push([from, p.until]);
    // Each label shows in its spans and changes colour in one frame; a span from 0 shows from frame 0.
    const keys = (spans: [number, number | undefined][]) => {
      const k = windows(spans);
      return { opacity: spans[0]![0] <= 0 ? [{ t: 0, v: 1 }, ...k.slice(3)] : k };
    };
    if (on.length) out.push(label(ctx, `${id}-t${i}-on`, xs[i]! + P, { baseline: base }, t, smallRole(ctx), "ink", ws[i]!, keys(on), `tab ${id}`, "left", "active"));
    if (off.length) out.push(label(ctx, `${id}-t${i}-off`, xs[i]! + P, { baseline: base }, t, smallRole(ctx), "inkMuted", ws[i]!, keys(off), `tab ${id}`));
    out.push({ id: `${id}-tab:${i}`, kind: "anchor", x: xs[i]!, y: p.y, w: ws[i]! + 2 * P, h, at: p.at });
  });
  // The underline: the first active tab's width, then x and scaleX move it to each next tab.
  const first = steps[0]?.index ?? 0;
  const uw = ws[first]!, uh = uh0;
  const ux: Key[] = [{ t: 0, v: 0 }], us: Key[] = [{ t: 0, v: 1 }];
  for (let k = 1; k < steps.length; k++) {
    const a = steps[k - 1]!.index, b = steps[k]!.index;
    ux.push(...go(ctx, steps[k]!.at, xs[a]! - xs[first]!, xs[b]! - xs[first]!, "move"));
    us.push(...go(ctx, steps[k]!.at, ws[a]! / uw, ws[b]! / uw, "move"));
  }
  out.push({ id: `${id}-underline`, kind: "rect", state: "active", x: xs[first]! + P, y: p.y + h - uh, w: uw, h: uh, fill: "accent", origin: [0, 0.5],
    tracks: { ...show, ...(ux.length > 1 ? { x: ux, scaleX: us } : {}) } });
  if (p.w !== undefined && x > p.x + p.w + 0.5) throw new Error(`tab ${id}: the tabs need ${Math.round(x - p.x)} px and the bar is ${Math.round(p.w)} px; use fewer or shorter tabs`);
  out.push({ id: `${id}-rule`, kind: "path", d: `M${px(p.x)} ${crisp(p.y + h, hair(ctx))}H${px(p.w !== undefined ? p.x + p.w : x)}`, stroke: "rule", width: hair(ctx), tracks: show });
  return out;
};

// ---------------------------------------------------------------- toast

export type ToastProps = {
  id?: string;
  text: string;
  /** The toast's box. Default: centred at the foot of the text-safe area, 80 % of its width. */
  x?: number; y?: number; w?: number;
  at: number;
  until?: number;
};

export const toast: Block<ToastProps> = (p, ctx) => {
  const id = p.id ?? "toast";
  const S = ctx.safe, P = pad(ctx);
  const h = rowH(ctx, "body") + 2 * P;
  const y = p.y ?? S.bottom - h;
  // In the 9:16 low band, text ends by lowBandRight: the default toast stays inside it.
  const right = y + h > S.lowBandTop ? S.lowBandRight : S.right;
  const w = p.w ?? Math.round((right - S.left) * 0.8);
  const x = p.x ?? Math.round(S.left + (right - S.left - w) / 2);
  const v = vocabulary(ctx);
  // It rises a little into place where the system tweens, and cuts where it does not.
  const tr: Tracks = ctx.instant || v.opaque || v.text === "cut" ? showFor(ctx, p.at, p.until) : appear(ctx, p.at, p.until, Math.round(h * 0.25));
  const barW = Math.max(3, Math.round(ctx.stroke * 1.5));
  return [
    { id: `${id}-panel`, kind: "rect", x, y, w, h, fill: "surface", stroke: "rule", strokeWidth: hair(ctx), radius: ctx.radius, tracks: tr },
    { id: `${id}-bar`, kind: "rect", x: x + P, y: y + P, w: barW, h: h - 2 * P, fill: "accent", z: 1, tracks: tr },
    label(ctx, `${id}-text`, x + 2 * P + barW, { centre: { y, h } }, p.text, "body", "ink", w - 3 * P - barW, tr, `toast ${id}`),
    { id: `${id}-box`, kind: "anchor", x, y, w, h, at: p.at },
  ];
};
