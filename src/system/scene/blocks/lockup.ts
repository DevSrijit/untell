// Lockup: a mark and words on one axis, as one unit. Use it for a name with its mark (a product, a studio,
// a film title) and for the end card. The mark is a flat shape (circle, square, triangle) or none.
//
// Rules this block enforces:
// - "row": the mark sits left of the name, as tall as the name's cap height times 1.1, centred on the
//   name's line; the gap is half the mark. The optional line sits under the name, on the name's left edge.
// - "column": the mark sits above the name, centred; the name and the line are centred under it.
// - The whole lockup is centred in its box (`w`, and `h` when given) and measured before it is placed.
//   Every text line must pass the text-safe area; the name steps down a role (display, headline, body)
//   until the lockup fits the box width.
// - It comes on and goes off as one unit, by the system's vocabulary for text (a cut in an opaque or a
//   one-frame system, else a fade). With `at` at 0 or before, it shows from frame 0.
// - It names its parts: anchors `<id>-mark-box`, `<id>-name-box` and `<id>-line-box`, so a scene can point at them.
// - The mark is a drawn shape, a prepared picture or cut-out (`{ media }`: the photo block, its subject filling the
//   mark's box), or a product model (`{ objects }`: the product block, framed by its silhouette in the mark's box, still).
//   A picture or a model takes `markSize` px of height (endCard sets it from the system's end look); a shape keeps the
//   size of the name's cap height. A "row" lockup with a large mark that cannot sit beside its name turns to a column.
//   A model in a system with a floor reflection (Matte) stands under its name, so its mirror falls in the lower frame.
// - A column whose text lands in the low band (9:16) steps the name down a role when it is wider than the band, so it
//   never passes the band's right edge. The warning for a stepped-down name offers only the fixes the lockup does not
//   use yet (a column only to a row; two lines only to one).
// - `lines: 2` (or a "\n" in the name) sets the name on two lines, broken at the most even word gap. `slab` draws a flat
//   rectangle behind the whole unit, cut on and off with it.
import { inkBox, px, textSafe } from "../context";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Node } from "../types";
import { vocabulary } from "../vocabulary";
import { onOff } from "./shape";
import { MEDIA } from "../../media.gen";
import type { Object3D } from "../../three/spec";
import { photo } from "./photo";
import { product } from "./product";

/**
 * A lockup's mark: a drawn shape, none, a prepared picture or cut-out, a product model, or a drawing of the scene's own
 * (`draw`: a function that draws the mark, a character or a group of shapes, into the box it is given, from `at`, with
 * `aspect` its width over its height).
 */
export type Mark = "circle" | "square" | "triangle" | "none" | { media: string } | { objects: Object3D[] }
  | { draw: (box: { x: number; y: number; w: number; h: number }, at: number, until?: number) => Node[]; aspect?: number };

export type LockupProps = {
  id?: string;
  name: string;
  /** One line under the name: what it is, or the offer. */
  line?: string;
  mark?: Mark;
  /** The height of the mark, px. Default: a shape from the name's cap height; a picture or a model 1.6 cap heights. */
  markSize?: number;
  axis?: "row" | "column";
  x: number; y: number; w: number; h?: number;
  /** The name's role to try first. Default: headline. */
  role?: TypeRole;
  /** The line's role. Default: body. */
  lineRole?: TypeRole;
  color?: ColorRole;
  markColor?: ColorRole;
  lineColor?: ColorRole;
  at: number;
  until?: number;
  /** How it comes on and goes: "fade" or "cut". Default: the system's vocabulary (a cut in a one-frame or opaque system). */
  enter?: "fade" | "cut";
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: "fade" | "cut";
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /**
   * The name on two lines: 2 breaks it at the word gap that gives the most even lines (a "\n" in the name sets the
   * break). Use it for a title of three words or more that does not fit one line at the role it asks for. Default 1.
   */
  lines?: 1 | 2;
  /**
   * A slab behind the whole lockup: a flat rectangle in this colour role, `pad` px round the unit (default: half the
   * name's line height), cut on and off with it (Cutout's end: the title as one cut in one slab). Default: none.
   */
  slab?: ColorRole | { fill: ColorRole; pad?: number };
};

const STEPS: TypeRole[] = ["display", "headline", "body"];

/** The lockup's geometry: where the mark, the name and the line sit. */
/** The width of a picture or model mark for its height: the picture's subject box aspect; a model's, near square. */
function markAspect(mark: Mark): number {
  if (typeof mark !== "object") return 1;
  if ("draw" in mark) return Math.max(0.3, Math.min(3, mark.aspect ?? 1));
  if ("media" in mark) {
    const info = MEDIA[mark.media];
    if (!info) throw new Error(`lockup: no prepared picture "${mark.media}"; add it first (untell media add)`);
    const [x0, y0, x1, y1] = info.subject;
    return Math.max(0.4, Math.min(2.5, ((x1 - x0) * info.width) / Math.max(1, (y1 - y0) * info.height)));
  }
  return 1.1;
}

export function lockupLayout(ctx: Ctx, p: Omit<LockupProps, "at" | "until">): ReturnType<typeof layoutOnce> {
  const L = layoutOnce(ctx, p);
  // A line that lands in the low band (9:16) and passes its right edge steps down to body, which fits there.
  const S = ctx.safe;
  if (L.line && L.lineRole !== "body" && L.line.y + L.line.h > S.lowBandTop && L.line.x + L.line.w > S.lowBandRight + 0.5) return layoutOnce(ctx, { ...p, lineRole: "body" });
  return L;
}

function layoutOnce(ctx: Ctx, p: Omit<LockupProps, "at" | "until">) {
  const markKind = p.mark ?? "circle";
  const rich = typeof markKind === "object";
  // A mark sized by the scene (markSize) lays out as a large mark, whatever it is.
  const sized = rich || (p.markSize !== undefined && markKind !== "none");
  const first = p.role ?? "headline";
  const lineRole = p.lineRole ?? "body";
  const roles = STEPS.filter((r) => ctx.size(r) <= ctx.size(first));
  for (const role of roles.length ? roles : [first]) {
    const rows = nameRows(ctx, p, role);
    const nameW = Math.max(...rows.map((r) => ctx.measure(r, role))), nameH = ctx.lineHeight(role) * rows.length;
    const lineW = p.line ? ctx.measure(p.line, lineRole) : 0, lineH = p.line ? ctx.lineHeight(lineRole) : 0;
    const cap = ctx.size(role) * 0.72;
    // A large mark that cannot sit beside the name (a tall frame) stacks above it.
    let axis = p.axis ?? "row";
    const ask = sized ? Math.round(p.markSize ?? cap * 1.6) : 0;
    if (sized && axis === "row" && ask * markAspect(markKind) + ask * 0.25 + Math.max(nameW, lineW) > p.w) axis = "column";
    // The mark: a shape from the cap height; a picture or a model at markSize, no wider than the box.
    let mh = markKind === "none" ? 0 : sized ? ask : Math.round(cap * (axis === "row" ? 1.1 : 1.6));
    let mw = Math.round(mh * markAspect(markKind));
    if (mw > p.w) { mh = Math.round((mh * p.w) / mw); mw = Math.round(p.w); }
    const m = mh;
    // A model in a system with a floor reflection (Matte) shows its mirror under its foot, as tall as itself: in a column
    // the name goes above the model, and the model and its mirror take the frame under it (Matte's "top" composition).
    const mirror = rich && "objects" in markKind && ctx.system.allows.includes("reflection") && (ctx.system.texture.reflection ?? 0) > 0;
    const gap = Math.round(sized ? Math.min(m * 0.25, ctx.lineHeight(role) * 0.6) : m * 0.5);
    const lineGap = Math.round(ctx.lineHeight(lineRole) * 0.3);
    const width = axis === "row" ? mw + (m ? gap : 0) + Math.max(nameW, lineW) : Math.max(mw, nameW, lineW);
    const textH = nameH + (p.line ? lineGap + lineH : 0);
    const height = axis === "row" ? Math.max(textH, sized ? m : 0) : m + (m ? gap : 0) + textH;
    if (width > p.w && role !== roles[roles.length - 1]) continue;
    const ox = p.x + (p.w - width) / 2, oy = p.y + (p.h !== undefined ? (p.h - height) / 2 : 0);
    if (axis === "row") {
      const tx = ox + mw + (m ? gap : 0);
      // A large mark: the text centres on it. A shape: it centres on the name's line.
      const ty = sized ? oy + (height - textH) / 2 : oy;
      return { role, axis, width, height, lineRole,
        mark: m ? { x: ox, y: sized ? oy + (height - m) / 2 : oy + (nameH - m) / 2, s: m, w: mw } : null,
        name: { x: tx, y: ty, w: nameW, h: nameH },
        line: p.line ? { x: tx, y: ty + nameH + lineGap, w: lineW, h: lineH } : null };
    }
    // A text row in the low band (9:16) must end by its right edge: the column then centres on the narrower span, the
    // mark with it, so the unit keeps one axis.
    const ny0 = mirror ? oy : oy + m + (m ? gap : 0);
    const S = ctx.safe, right = Math.min(p.x + p.w, S.lowBandRight);
    const span = Math.max(nameW, lineW);
    const lowRow = ny0 + textH > S.lowBandTop && p.x + p.w / 2 + span / 2 > S.lowBandRight;
    // A text row in the low band that is wider than the band from the box's left edge cannot centre there: a smaller
    // role, before it passes the band's right edge. Before: a large markSize pushed a column's name into the low band
    // 51 px past its edge, with no warning from the block.
    if (lowRow && right - p.x < span && role !== roles[roles.length - 1]) continue;
    const inBand = lowRow && right - p.x >= span;
    const cx = inBand ? (p.x + right) / 2 : p.x + p.w / 2;
    const ny = ny0;
    return { role, axis, width, height, lineRole,
      mark: m ? { x: cx - mw / 2, y: mirror ? oy + textH + gap : oy, s: m, w: mw } : null,
      name: { x: cx - nameW / 2, y: ny, w: nameW, h: nameH },
      line: p.line ? { x: cx - lineW / 2, y: ny + nameH + lineGap, w: lineW, h: lineH } : null };
  }
  throw new Error("lockup: no role");
}

/** The name's rows: one, or two (`lines: 2`, or a "\n" in the name) broken at the most even word gap for the role. */
export function nameRows(ctx: Ctx, p: Pick<LockupProps, "name" | "lines">, role: TypeRole): string[] {
  if (p.name.includes("\n")) return p.name.split("\n").map((r) => r.trim()).filter(Boolean).slice(0, 2);
  const words = p.name.split(/\s+/).filter(Boolean);
  if (p.lines !== 2 || words.length < 2) return [p.name];
  let best: string[] = [p.name], worst = Infinity;
  for (let k = 1; k < words.length; k++) {
    const r = [words.slice(0, k).join(" "), words.slice(k).join(" ")];
    const wide = Math.max(...r.map((x) => ctx.measure(x, role)));
    if (wide < worst) { worst = wide; best = r; }
  }
  return best;
}

export const lockup: Block<LockupProps> = (p, ctx) => {
  const id = p.id ?? "lockup";
  const L0 = lockupLayout(ctx, p);
  // The lockup's ink starts at its box: where the name's or the line's ink reaches over its line box (a tall cap in a
  // tight leading: Cutout's, Courtside's), the whole lockup moves down by that much, so the name at the text-safe top
  // stays inside it (an agent's Mark film crossed the edge at the default layout).
  const over = Math.max(0, ...[[L0.name, L0.role] as const, ...(L0.line ? [[L0.line, L0.lineRole] as const] : [])]
    .filter(([, r]) => !ctx.system.bleed?.includes(r)).map(([b, r]) => p.y - inkBox(ctx, r, b).y));
  const down = <T extends { y: number } | null>(b: T): T => (b && over > 0 ? { ...b, y: b.y + over } : b);
  const L = over > 0 ? { ...L0, name: down(L0.name), line: down(L0.line), mark: down(L0.mark) } : L0;
  const voc = vocabulary(ctx);
  const how = ctx.instant || voc.opaque || voc.text === "cut" ? "cut" : p.reveal ?? "fade";
  const opacity = onOff(ctx, p.at, p.until, how, how);
  const out: Node[] = [];
  const check = (b: { x: number; y: number; w: number; h: number }, role: TypeRole, what: string) => {
    if (!ctx.system.bleed?.includes(role) && !textSafe(ctx, b, role))
      console.warn(`lockup ${id}: the ${what} is outside the text-safe area`);
  };
  if (L.mark && typeof p.mark === "object") {
    const b = { x: L.mark.x, y: L.mark.y, w: L.mark.w, h: L.mark.s };
    if ("draw" in p.mark) out.push(...p.mark.draw(b, p.at, p.until));
    else if ("media" in p.mark) out.push(...photo({ id: `${id}-mark`, media: p.mark.media, box: b, motion: "still", enter: how === "cut" ? "cut" : "dissolve", at: p.at, until: p.until }, ctx));
    else out.push(...product({ id: `${id}-mark`, objects: p.mark.objects, room: b, shot: "still", sweep: false, at: p.at, until: p.until }, ctx));
    out.push({ id: `${id}-mark-box`, kind: "anchor", ...b, at: p.at });
  } else if (L.mark) {
    const { x, y, s } = L.mark;
    const d = p.mark === "square" ? `M${px(x)} ${px(y)}H${px(x + s)}V${px(y + s)}H${px(x)}Z`
      : p.mark === "triangle" ? `M${px(x + s / 2)} ${px(y + s * 0.067)}L${px(x + s)} ${px(y + s * 0.933)}L${px(x)} ${px(y + s * 0.933)}Z`
      : `M${px(x + s / 2)} ${px(y)}A${s / 2} ${s / 2} 0 1 1 ${px(x + s / 2)} ${px(y + s)}A${s / 2} ${s / 2} 0 1 1 ${px(x + s / 2)} ${px(y)}Z`;
    out.push({ id: `${id}-mark`, kind: "path", d, fill: p.markColor ?? "accent", box: { x, y, w: s, h: s }, tracks: { opacity } });
    out.push({ id: `${id}-mark-box`, kind: "anchor", x, y, w: s, h: s, at: p.at });
  }
  // Every block that sets type smaller than asked says so (fit.ts): the name stepped down to fit the box's width.
  // The fixes it offers are the ones this lockup does not use yet (a column is offered only to a row).
  if (L.role !== (p.role ?? "headline")) {
    const two = nameRows(ctx, p, L.role).length === 2;
    const fixes = ["shorten it", "give the lockup more width", ...(L.axis === "row" ? ["use a column (axis: \"column\")"] : []), ...(!two && p.name.trim().includes(" ") ? ["set it on two lines (lines: 2)"] : [])];
    const where = L.axis === "column" && L.name.y + L.name.h > ctx.safe.lowBandTop ? `; it sits in the low band, where text ends by x ${Math.round(ctx.safe.lowBandRight)}` : "";
    console.warn(`lockup ${id}: the name "${p.name.replace("\n", " ")}" does not fit ${Math.round(p.w)} px in the ${p.role ?? "headline"} role${where}, so it is set in ${L.role}. ${fixes.join(", ").replace(/^./, (c) => c.toUpperCase())}${p.markSize !== undefined && L.axis === "column" ? ", or give a smaller markSize so the name ends above the low band" : ""}.`);
  }
  // One row per line of the name, as one block: the box anchor covers both.
  const rows = nameRows(ctx, p, L.role), lh = ctx.lineHeight(L.role);
  rows.forEach((r, i) => check({ x: L.name.x + (L.name.w - ctx.measure(r, L.role)) / 2 * (L.axis === "column" ? 1 : 0), y: L.name.y + i * lh, w: ctx.measure(r, L.role), h: lh }, L.role, rows.length > 1 ? `name's line ${i + 1}` : "name"));
  // A slab behind the whole unit, cut on and off with it.
  if (p.slab) {
    const sl = typeof p.slab === "string" ? { fill: p.slab } : p.slab;
    const pad = Math.round(sl.pad ?? lh / 2);
    const boxes = [L.name, ...(L.line ? [L.line] : []), ...(L.mark ? [{ x: L.mark.x, y: L.mark.y, w: L.mark.w, h: L.mark.s }] : [])];
    const x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad;
    const x1 = Math.max(...boxes.map((b) => b.x + b.w)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.h)) + pad;
    out.unshift({ id: `${id}-slab`, kind: "path", d: `M${px(x0)} ${px(y0)}H${px(x1)}V${px(y1)}H${px(x0)}Z`, fill: sl.fill, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      tracks: { opacity: onOff(ctx, p.at, p.until, "cut", "cut") } });
  }
  // The name and the line are two rows of one unit, each centred on its own: left edges that land near each other by
  // chance are apart by design (the alignment model reads group, row and column).
  rows.forEach((r, i) => {
    const w = ctx.measure(r, L.role), x = L.axis === "column" ? L.name.x + (L.name.w - w) / 2 : L.name.x;
    out.push({ id: i ? `${id}-name-l${i + 1}` : `${id}-name`, kind: "text", x, y: L.name.y + i * lh, text: r, role: L.role, color: p.color ?? "ink", group: id, row: i ? `${id}-name-l${i + 1}` : `${id}-name`, col: `${id}-name`, tracks: { opacity } });
  });
  out.push({ id: `${id}-name-box`, kind: "anchor", ...L.name, at: p.at });
  if (L.line && p.line) {
    check(L.line, L.lineRole, "line");
    out.push({ id: `${id}-line`, kind: "text", x: L.line.x, y: L.line.y, text: p.line, role: L.lineRole, color: p.lineColor ?? "inkMuted", group: id, row: `${id}-line`, col: `${id}-line`, tracks: { opacity } });
    out.push({ id: `${id}-line-box`, kind: "anchor", ...L.line, at: p.at });
  }
  return out;
};
