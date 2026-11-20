// Sheet: the drawing sheet of Spec and Schematic as one block. A hairline grid over the whole sheet, a title
// block (title, FIG., SCALE, SHEET), figure numbers, and the column positions that every part of the film
// lines up to.
//
// Rules this block enforces:
// - The grid is complete: one hairline every `pitch` px over the whole sheet box, at layer -1 (a backdrop), in
//   the rule colour. Content sits over it; the block never drops a line or a mark near content. The Schematic
//   reel's grid had holes where its scene culled marks, and a grid with holes reads as a fault.
// - Lines fall on the text-safe area's left and top edges, so the grid and the text column agree. The pitch is
//   half a column pitch of the system (column plus gutter), unless the scene gives one.
// - `grid: "marks"` draws a + at each crossing instead of lines (Spec's register marks), also complete.
// - The title block sits at the foot of the text-safe area, on the text column, and passes the text-safe
//   check (it ends by lowBandRight in the 9:16 low band). In a tall frame of a system that states a figure place
//   (Schematic), the status line holds the top and the figure fills the frame under it, so no default place is free:
//   the title block is off there unless the scene gives its place as a box, and the block says so. Its cells are TITLE, FIG., SCALE and SHEET; a cell
//   without a value is left out. Cells fill rows in order, and a cell that does not fit starts a new row. A drawing at another scale says so here (SCALE 1:6).
// - Figure numbers ("FIG. 2  COG") are label-role lines in inkMuted at the places the scene gives.
// - `plate` lays a panel in the surface tone under the drawing (true: figureBox), under the grid lines.
// - Labels knock out the grid, as on a real drawing: in a system that draws on a sheet, a callout's and a dimension's
//   label sit on a small patch of the ground (or of the plate, where the label is on it) over the grid lines, so no
//   grid line runs through a letter and the label keeps its contrast (accentText over a grid line measured 4.03:1).
// - The grid shows from frame 0 when `at` is 0 or before: it is the ground of the film. The title block and the
//   figure numbers come on by the system's vocabulary.
// - `sheetLayout` gives the columns ({ x, w } for each), the pitch and the title block's box, so a scene places
//   parts on the same columns.
// - A drawing is not text. `fitDrawing` scales a drawing's geometry to fill a given area, which may reach the
//   picture-safe area (`pictureSafe`: the frame inside the system margin) and so the full frame width at 9:16.
//   Only the drawing's labels must stay in the text-safe area. The fit keeps room, in px, for the parts that do
//   not scale (label rows, a dimension's offset and its label) on each side of the geometry, and reports the
//   scale (px per unit, and the SCALE text for the title block). Outline weights follow the system's rule: the
//   system stroke for a drawing up to half the frame's short side wide, up to twice it for a drawing that fills
//   the frame, in half steps. Tooth sizes come from the true pitch times the scale, so they grow with the fit.
// - Where a figure sits is the system's (its direction's compose `figure`). In a tall frame, `figureBox` is that place:
//   the picture-safe width, from under a two-line status line down to the compose's foot (Schematic: 86 % of the
//   frame's height). fitDrawing with no `area` fills that box and stands the geometry on its foot, with room above it
//   for the labels and dimensions (which must stay in the text-safe area, above 65 % of the height). So the drawing
//   reaches into the lower band, where only picture may go, and its annotation fills the text-safe area above it.
//   The geometry keeps to the text column across (the text-safe left and right edges), so a label beside any part
//   has room; the box itself spans the picture-safe width, for a plate under the drawing.
//   In a frame that is not tall, or in a system that states no figure place, the box is the picture-safe area and the
//   geometry is centred in it.
import { frameFor } from "../../frame";
import { present, px, textSafe } from "../context";
import type { Block, Ctx, Node } from "../types";
import { vocabulary } from "../vocabulary";
import { onOff } from "./shape";
import { DIRECTION } from "../../direction";
import { builtNodes } from "./handover";
import { statusBand } from "./figure";
import type { Tracks } from "../types";
import type { Box } from "./util";

/** Title block and figure texts keep their case as written: a unit stays "mm" in a system that sets labels in capitals. */
const K = { keepCase: true };

export type SheetProps = {
  id?: string;
  /** The sheet's box in px. Default: the frame. A film with a camera gives the whole sheet it pans over. */
  x?: number; y?: number; w?: number; h?: number;
  /** "lines" (default), "marks" (+ at each crossing) or "none". */
  grid?: "lines" | "marks" | "none";
  /** The grid pitch in px. Default: half a column pitch. */
  pitch?: number;
  /** The title block. Leave it out for a sheet without one. */
  titleBlock?: { title?: string; fig?: string | number; scale?: string; sheet?: string;
    /**
     * Where the title block sits. "foot" (default): at the foot of the text-safe area. "top": at the text-safe top, so a
     * drawing that uses the lower band does not meet it. A box: used as given (its width fills the rows). In a tall
     * frame of a system with a figure place (Schematic), "top" lies on the status line and "foot" on the plate's figure:
     * there the title block is off and the block warns; give a box.
     */
    place?: "foot" | "top" | Box };
  /**
   * A plate under the drawing: a panel in the surface tone with a hairline edge, under the grid, so the grid still runs
   * under the drawing. true: the system's figure box (figureBox); or a box in px. The hook counts the plate with its
   * drawing as one picture (an open drawing, such as a lever, covers little of the frame by its parts alone); the
   * empty-frame check counts only the drawing on it, never the empty plate.
   */
  plate?: boolean | Box;
  /** Figure numbers and names at given places (top-left of the text), px. */
  figures?: { fig: string | number; name?: string; x: number; y: number; at?: number; until?: number }[];
  at: number;
  until?: number;
};

/** The columns, the grid pitch and the title block's place for this frame and system. */
export function sheetLayout(ctx: Ctx, p: Pick<SheetProps, "pitch" | "titleBlock" | "plate"> = {}) {
  const g = frameFor(ctx.system, ctx.width, ctx.height);
  const S = ctx.safe;
  const columns = Array.from({ length: g.columns }, (_, i) => ({ x: g.left + i * (g.colW + g.gutter), w: g.colW }));
  const pitch = p.pitch ?? (g.colW + g.gutter) / 2;
  const cells = titleCells(p.titleBlock);
  const lh = ctx.lineHeight("label"), pad = Math.round(ctx.size("label") * 0.5);
  // In the 9:16 low band, text ends by lowBandRight. The foot of the safe area is in the low band at 9:16.
  const place = p.titleBlock?.place ?? "foot";
  const right = place === "top" ? (S.top > S.lowBandTop ? S.lowBandRight : S.right) : S.bottom > S.lowBandTop ? S.lowBandRight : S.right;
  const W = typeof place === "object" ? place.w : right - S.left;
  // The cells fill rows in order; a row that would pass the text column's width starts a new row.
  const rows: string[][] = [];
  for (const c of cells) {
    const row = rows[rows.length - 1];
    const w = (r: string[]) => r.reduce((a, x) => a + ctx.measure(x, "label", K) + 2 * pad, 0);
    if (row && w([...row, c]) <= W) row.push(c); else rows.push([c]);
  }
  const rowH = lh + 2 * pad;
  const h = rows.length * rowH;
  // A tall frame in a system with a figure place: "top" lies on the status line, and "foot" on the figure when the
  // sheet lays its plate (the figure box). Then there is no free default place (see the header).
  const plateBox = p.plate === true ? figureBox(ctx) : typeof p.plate === "object" ? p.plate : null;
  const footBox = { x: S.left, y: S.bottom - rows.length * (lh + 2 * pad), w: W, h: rows.length * (lh + 2 * pad) };
  const onPlate = !!plateBox && footBox.y < plateBox.y + plateBox.h && plateBox.y < footBox.y + footBox.h;
  const noPlace = !!statusBand(ctx) && (place === "top" || (place === "foot" && onPlate));
  const titleBlock: Box | null = !cells.length || noPlace ? null
    : typeof place === "object" ? { ...place }
    : place === "top" ? { x: S.left, y: S.top, w: W, h } : { x: S.left, y: S.bottom - h, w: W, h };
  return { columns, pitch, gutter: g.gutter, titleBlock, cells, rows, rowH, pad, titleOff: noPlace && cells.length > 0 };
}

function titleCells(t: SheetProps["titleBlock"]): string[] {
  if (!t) return [];
  return [t.title, t.fig !== undefined ? `FIG. ${t.fig}` : undefined, t.scale ? `SCALE ${t.scale}` : undefined, t.sheet ? `SHEET ${t.sheet}` : undefined]
    .filter((c): c is string => !!c);
}

export const sheet: Block<SheetProps> = (p, ctx) => {
  const id = p.id ?? "sheet";
  const S = ctx.safe;
  const box = { x: p.x ?? 0, y: p.y ?? 0, w: p.w ?? ctx.width, h: p.h ?? ctx.height };
  const L = sheetLayout(ctx, p);
  const out: Node[] = [];
  const hair = Math.max(1, ctx.stroke * 0.5);
  const ground = present(p.at, p.until);

  // The grid: every line from the safe area's left and top edges, outwards both ways, over the whole box.
  const steps = (from: number, lo: number, hi: number) => {
    const out: number[] = [];
    for (let v = from - Math.floor((from - lo) / L.pitch) * L.pitch; v <= hi + 1e-6; v += L.pitch) out.push(v);
    return out;
  };
  const xs = steps(S.left, box.x, box.x + box.w), ys = steps(S.top, box.y, box.y + box.h);
  if (p.plate) {
    const B = p.plate === true ? figureBox(ctx) : p.plate;
    out.push({ id: `${id}-plate`, kind: "rect", x: B.x, y: B.y, w: B.w, h: B.h, fill: "surface", stroke: "rule", strokeWidth: hair, layer: -2, tracks: ground });
  }
  // A hairline sits on a half pixel, so 1 px lines stay crisp.
  const hx = (v: number) => Math.round(v) + 0.5;
  if ((p.grid ?? "lines") === "lines") {
    out.push({ id: `${id}-grid-v`, kind: "path", d: xs.map((x) => `M${hx(x)} ${px(box.y)}V${px(box.y + box.h)}`).join(""), stroke: "rule", width: hair, layer: -1, tracks: ground });
    out.push({ id: `${id}-grid-h`, kind: "path", d: ys.map((y) => `M${px(box.x)} ${hx(y)}H${px(box.x + box.w)}`).join(""), stroke: "rule", width: hair, layer: -1, tracks: ground });
  } else if (p.grid === "marks") {
    const m = Math.round(ctx.size("label") * 0.35);
    out.push({ id: `${id}-grid-marks`, kind: "path", d: xs.flatMap((x) => ys.map((y) => `M${hx(x) - m} ${hx(y)}H${hx(x) + m}M${hx(x)} ${hx(y) - m}V${hx(y) + m}`)).join(""),
      stroke: "rule", width: hair, layer: -1, tracks: ground });
  }

  const voc = vocabulary(ctx);
  const how = ctx.instant || voc.opaque || voc.text === "cut" ? "cut" : "fade";
  // The title block: a hairline box with one cell per value, the cells' widths in proportion to their text.
  if (L.titleOff) console.warn(`sheet ${id}: the title block is off: in this tall frame the status line holds the text-safe top and the figure fills the frame under it, so "foot" and "top" are taken. Give titleBlock.place a box clear of both, or put the scale in the status line.`);
  if (L.titleBlock) {
    const T = L.titleBlock;
    const show = onOff(ctx, p.at, p.until, how, how);
    let d = `M${px(T.x)} ${px(T.y)}H${px(T.x + T.w)}V${px(T.y + T.h)}H${px(T.x)}Z`;
    let k = 0;
    L.rows.forEach((row, ri) => {
      const ry = T.y + ri * L.rowH;
      if (ri) d += `M${px(T.x)} ${px(ry)}H${px(T.x + T.w)}`;
      const ws = row.map((c) => ctx.measure(c, "label", K) + 2 * L.pad);
      const total = ws.reduce((a, b) => a + b, 0);
      if (total > T.w + 0.5) console.warn(`sheet ${id}: "${row.join(" ")}" does not fit the text column; shorten it`);
      const extra = Math.max(0, T.w - total) / row.length;
      let x = T.x;
      row.forEach((c, i) => {
        const tb = { x: x + L.pad, y: ry + L.pad, w: ctx.measure(c, "label", K), h: ctx.lineHeight("label") };
        if (!textSafe(ctx, tb, "label")) console.warn(`sheet ${id}: "${c}" is outside the text-safe area`);
        // The title (the first cell when given) is in ink; the keyed values in inkMuted.
        out.push({ id: `${id}-tb-${k}`, kind: "text", x: tb.x, y: tb.y, text: c, role: "label", keepCase: true, color: k === 0 && p.titleBlock?.title ? "ink" : "inkMuted", tracks: { opacity: show } });
        k++;
        x += ws[i]! + extra;
        if (i < row.length - 1) d += `M${px(x)} ${px(ry)}V${px(ry + L.rowH)}`;
      });
    });
    out.push({ id: `${id}-tb-box`, kind: "path", d, stroke: "rule", width: hair, tracks: { opacity: show } });
    out.push({ id: `${id}-title-block`, kind: "anchor", ...T, at: p.at });
  }

  // Knock-outs built before the sheet that sit on its plate take the plate's tone.
  if (p.plate) {
    const B = p.plate === true ? figureBox(ctx) : p.plate;
    for (const n of builtNodes(ctx)) if (n.kind === "rect" && n.id.endsWith("-knock") && n.x >= B.x && n.y >= B.y && n.x + n.w <= B.x + B.w && n.y + n.h <= B.y + B.h) n.fill = "surface";
  }
  (p.figures ?? []).forEach((f, i) => {
    const text = f.name ? `FIG. ${f.fig}  ${f.name}` : `FIG. ${f.fig}`;
    const b = { x: f.x, y: f.y, w: ctx.measure(text, "label", K), h: ctx.lineHeight("label") };
    if (!textSafe(ctx, b, "label")) console.warn(`sheet ${id}: "${text}" is outside the text-safe area`);
    out.push({ id: `${id}-fig-${i}`, kind: "text", x: f.x, y: f.y, text, role: "label", keepCase: true, color: "inkMuted", tracks: { opacity: onOff(ctx, f.at ?? p.at, f.until ?? p.until, how, how) } });
  });
  return out;
};

/**
 * The picture-safe area, px: the frame inside the system margin on every side. A drawing, a chart mark or a picture
 * may fill it; text must stay in the text-safe area (ctx.safe), which is smaller at 9:16.
 */
export function pictureSafe(ctx: Ctx): Box {
  const m = Math.ceil(ctx.system.margin * Math.min(ctx.width, ctx.height));
  return { x: m, y: m, w: ctx.width - 2 * m, h: ctx.height - 2 * m };
}

/** The outline weight of a drawing that is `w` px wide, as a multiple of the system stroke (see the header). */
export const drawingWeight = (ctx: Ctx, w: number) => Math.min(2, Math.max(1, Math.round((w / (0.5 * Math.min(ctx.width, ctx.height))) * 2) / 2));

export type DrawingFit = {
  /** px per drawing unit. */
  k: number;
  /** A point in drawing units, in px. */
  at: (x: number, y: number) => { x: number; y: number };
  /** The scaled geometry's box, px. Give it to callouts as `outside`. */
  box: Box;
  /** The outline weight, as a multiple of the system stroke (gear `weight`, belt `weight`). */
  weight: number;
  /** The scale for the title block: units per px, as "0.58 mm/px". */
  scale: string;
};

/** Where a drawing's figure sits in this frame and system (see the header), and whether the geometry stands on its foot. */
function figurePlace(ctx: Ctx, top?: number): { box: Box; foot: boolean } {
  const P = pictureSafe(ctx);
  const place = DIRECTION[ctx.system.id]?.compose?.figure;
  if (!place || ctx.height / ctx.width < 1.5) return { box: P, foot: false };
  const y = top ?? Math.round(ctx.safe.top + 2 * ctx.lineHeight("headline") + ctx.lineHeight("label"));
  return { box: { x: P.x, y, w: P.w, h: Math.round(ctx.height * place.foot) - y }, foot: true };
}

/** Where a drawing's figure sits in this frame and system (see the header). `top`: the top of the box, px. */
export function figureBox(ctx: Ctx, o: { top?: number } = {}): Box {
  return figurePlace(ctx, o.top).box;
}

/**
 * Fits a drawing to an area: the largest scale at which the geometry's `bounds` (drawing units, such as mm) and the
 * px `room` kept on each side for the parts that do not scale (label rows, a dimension and its label) fit inside
 * `area`. The geometry is centred in the area that is left. Default area: the system's figure box (figureBox), where
 * the geometry stands on the box's foot, keeps to the text column across, with room for four label rows above it;
 * else the picture-safe area.
 */
export function fitDrawing(ctx: Ctx, o: { bounds: Box; area?: Box; room?: { top?: number; right?: number; bottom?: number; left?: number }; unit?: string; maxK?: number }): DrawingFit {
  const fb = o.area ? null : figurePlace(ctx);
  const A = o.area ?? fb!.box;
  const onFoot = !!fb?.foot;
  // On a figure box, the geometry keeps to the text column (labels name its parts) and leaves four label rows above it.
  const r = onFoot ? { top: Math.round(4 * ctx.lineHeight("label")), right: Math.max(0, A.x + A.w - ctx.safe.right), bottom: 0, left: Math.max(0, ctx.safe.left - A.x), ...o.room }
    : { top: 0, right: 0, bottom: 0, left: 0, ...o.room };
  const W = A.w - r.left - r.right, H = A.h - r.top - r.bottom;
  if (W <= 0 || H <= 0 || o.bounds.w <= 0 || o.bounds.h <= 0) throw new Error(`fitDrawing: the area ${Math.round(A.w)} x ${Math.round(A.h)} px leaves no room for the drawing after its label room`);
  const k = Math.min(W / o.bounds.w, H / o.bounds.h, o.maxK ?? Infinity);
  const gw = o.bounds.w * k, gh = o.bounds.h * k;
  const x0 = A.x + r.left + (W - gw) / 2, y0 = onFoot ? A.y + A.h - r.bottom - gh : A.y + r.top + (H - gh) / 2;
  const at = (x: number, y: number) => ({ x: x0 + (x - o.bounds.x) * k, y: y0 + (y - o.bounds.y) * k });
  return { k, at, box: { x: x0, y: y0, w: gw, h: gh }, weight: drawingWeight(ctx, gw), scale: `${(1 / k).toFixed(2)} ${o.unit ?? "mm"}/px` };
}

/** Does this system draw on a sheet (its block map names `sheet`)? Its labels knock out the grid. */
export const onSheet = (ctx: Ctx) => !!DIRECTION[ctx.system.id]?.blocks.some((b) => b.block === "sheet");

/**
 * The knock-out of a label (see the header): a patch of the ground, or of a plate built before it, over the grid and
 * under the label, with the label's tracks. Null in a system that draws on no sheet.
 */
export function knockOut(ctx: Ctx, id: string, b: Box, tracks: Tracks): Node | null {
  if (!onSheet(ctx)) return null;
  const m = Math.round(ctx.size("label") * 0.15);
  const box = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
  const plate = builtNodes(ctx).some((n) => n.kind === "rect" && n.id.endsWith("-plate") && box.x >= n.x && box.y >= n.y && box.x + box.w <= n.x + n.w && box.y + box.h <= n.y + n.h);
  return { id: `${id}-knock`, kind: "rect", ...box, fill: plate ? "surface" : "ground", layer: -1, knock: true, tracks };
}
