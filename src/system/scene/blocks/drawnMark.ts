// DrawnMark: a brand mark of the user's own, given as SVG paths, drawn on by its strokes and then filled, path by
// path. It can end as the film's lockup: the finished mark moves into place over the name and the line, and holds.
// Use it for a logo sting or the end of a launch film (Mark). For a flat circle, square or triangle use `shape`.
//
// Rules this block enforces:
// - The mark is a name in the marks table (`untell media add <file>.svg --as <name>`: the file is parsed once, and its
//   paths go into the kit's marks.gen.ts) or inline art: `{ viewBox, paths: [{ d, paint }] }`, or `{ svg }` with the
//   text of an SVG file. The accepted format is in scene/markArt.ts: a viewBox, path and basic-shape elements, flat
//   paint, no transforms.
// - Colour comes from the system's roles, never from the file: every path is in `color` (default "ink"), and at most
//   one path is in the accent (`accent`, its index; default the first path, the unit module, except in a system that
//   keeps its accent for other things (Direction `accentFor`); "none" for no accent). All the paths are one group (node
//   `group`): the checks read the mark as one picture (the hook) and as one mover, though no path alone is large.
// - Each path draws its outline from its start over `draw` s (stroke-dashoffset by path length, in both renderers),
//   on the move curve with no overshoot, then its fill lands (`fills`, default: as its outline closes). The fill comes
//   on in one frame (`fillWith: "cut"`) or by a fade over the system's enter time; an opaque or a one-frame system
//   always cuts. A path whose time is at or before 0 is drawn and filled on frame 0. A line (a path with
//   `paint: "stroke"`) keeps its outline and has no fill.
// - The opening: a mark that starts the film (`at` at or before 0) with no `times` shows its first path (the unit
//   module) drawn and filled on frame 0, and draws the others from 0, one after another. A system whose hook asks for a
//   picture then has its picture on frame 0.
// - Size and place: the mark's drawn box (its paths, not its viewBox) fits `box`, centred, its aspect kept. With no box
//   it takes the system's hero box, centred in the picture-safe area (under `line`, when given). When the mark opens a
//   film in a system whose hook asks for a picture, the box is large enough that the parts on screen at the hook's time
//   (Direction `hook.by`) cover the hook's share of the frame (`hook.area`) as the hook check measures them: each part
//   by its box. Else it is the hook's share itself.
// - `line: { text, role }`: one line over the mark while it builds (role default "headline"), placed with the mark as
//   one pair (lineAndSubject). The block owns it: with a lockup, the line leaves before the mark moves, so it never
//   meets the name.
// - `lockup: { name, line, at }`: at `at` the mark moves on the move curve into one lockup with the name and the line,
//   centred on the frame's middle (the text-safe area made symmetric about it). The roles are the system's end look
//   (Direction `ends.look`); the line steps up a role where its letters would be too small on a phone (a wide frame:
//   layout.smallLineRole). In a tall frame the text must end in the text-safe area, so the name and the line go over
//   the mark and the mark keeps the size it was built at (smaller only when the pair would pass the picture-safe foot):
//   the mark owns the frame to the end. In a wide or square frame the mark goes over the name (on the end look's axis):
//   it keeps the size it was built at where the text-safe height leaves room for the words, and never goes under the
//   end look's height (`ends.look.mark` of the frame's height). The words never fade in over the moving
//   mark: when the mark passes under them they enter as it lands, else on `at`. A hold runs from the landing to the end,
//   so the closing hold is marked as the design.
// - It names its parts: anchors `<id>-box` (the drawn box at rest) and, with a lockup, `<id>-lock-mark-box`,
//   `<id>-lock-name-box` and `<id>-lock-line-box`.
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node, Tracks } from "../types";
import type { TypeRole } from "../../systems";
import { go } from "../context";
import { smallLineRole } from "../layout";
import { vocabulary } from "../vocabulary";
import { DIRECTION } from "../../direction";
import { MARKS } from "../../marks.gen";
import { artBounds, checkArt, parseMarkSvg, parsePath, pathData, placeSegs, type MarkArt } from "../markArt";
import { heroArea, heroBox, lineAndSubject, type Box } from "./compose";
import { text } from "./text";
import { pictureSafe } from "./sheet";
import { onOff, stamped } from "./shape";
import { lockup, lockupLayout } from "./lockup";
import { hold } from "./hold";

export type DrawnMarkProps = {
  id?: string;
  /** The mark: a name in the marks table (untell media add <file>.svg), inline art, or `{ svg }`: an SVG file's text. */
  mark: string | MarkArt | { svg: string };
  /** The box the mark's drawn shape fits, centred, px. Default: the system's hero box at the mark's aspect. */
  box?: Box;
  /** The one path in the accent (the brand colour), by its index in the file's order. Default: 0, the first path (the
   *  unit module); none in a system that keeps its accent for other things (Direction `accentFor`). "none": no accent. */
  accent?: number | "none";
  /** One line over the mark while it builds. The block places it with the mark and takes it off before a lockup. */
  line?: { text: string; role?: TypeRole };
  /** The colour role of the other paths. Default: "ink". */
  color?: ColorRole;
  /** When each path starts to draw, s, one per path in the file's order. Each is at `at` or later. Default: one after another from `at`. */
  times?: number[];
  /** How long each path's outline takes to draw, s. Default: 1.5 x the system's move time. */
  draw?: number;
  /** When each path's fill lands, s, one per path. Default: as its outline closes. */
  fills?: number[];
  /** How a fill comes on: in one frame ("cut") or by a fade over the enter time. Default: the system's vocabulary. */
  fillWith?: "fade" | "cut";
  /** The outline's weight as a multiple of the system stroke. Default 2. */
  weight?: number;
  /** The end: the mark moves into a lockup with the name and the line at `at`, and holds to the end. */
  lockup?: { name: string; line?: string; at: number };
  at: number;
  until?: number;
};

/** The mark's art from a name, inline art or SVG text. Throws with the names the table has. */
export function markArtOf(mark: DrawnMarkProps["mark"]): MarkArt {
  if (typeof mark === "string") {
    const art = MARKS[mark];
    if (!art) throw new Error(`drawnMark: no mark "${mark}" in the marks table${Object.keys(MARKS).length ? ` (it has ${Object.keys(MARKS).join(", ")})` : ""}. Add the file first: untell media add <file>.svg --as ${mark}`);
    return art;
  }
  if ("svg" in mark) return parseMarkSvg(mark.svg);
  return checkArt(mark);
}

/** The aspect (width over height) of a mark's drawn shape. */
export const markAspect = (mark: DrawnMarkProps["mark"]) => { const b = artBounds(markArtOf(mark)); return b.w / b.h; };

/** The default draw time of one path, s. */
const drawTime = (ctx: Ctx) => (ctx.instant ? 0 : ctx.dur.move * 1.5);

/**
 * The share of the art's drawn box that the boxes of the paths `which` cover together, on a grid: the hook check counts
 * the parts of one group this way (each part by its box). 0 for no path.
 */
export function partsCover(art: MarkArt, which: number[]): number {
  if (!which.length) return 0;
  const b = artBounds(art), N = 96;
  const cells = new Uint8Array(N * N);
  for (const i of which) {
    const q = artBounds({ ...art, paths: [art.paths[i]!] });
    const x0 = Math.max(0, Math.floor(((q.x - b.x) / b.w) * N)), x1 = Math.min(N, Math.ceil(((q.x + q.w - b.x) / b.w) * N));
    const y0 = Math.max(0, Math.floor(((q.y - b.y) / b.h) * N)), y1 = Math.min(N, Math.ceil(((q.y + q.h - b.y) / b.h) * N));
    for (let y = y0; y < y1; y++) cells.fill(1, y * N + x0, y * N + x1);
  }
  let n = 0;
  for (const c of cells) n += c;
  return n / (N * N);
}

export const drawnMark: Block<DrawnMarkProps> = (p, ctx) => {
  const id = p.id ?? "mark";
  const art = markArtOf(p.mark);
  const n = art.paths.length;
  const b = artBounds(art);
  if (p.accent !== undefined && p.accent !== "none" && !(Number.isInteger(p.accent) && p.accent >= 0 && p.accent < n)) throw new Error(`drawnMark ${id}: accent ${p.accent} is not a path of the mark (0 to ${n - 1}), or "none"`);
  const dir = DIRECTION[ctx.system.id];
  // The accent: the given path; by default the first (the unit module), unless the system keeps its accent for other things.
  const accent = p.accent === "none" ? undefined : p.accent ?? (dir?.accentFor?.length ? undefined : 0);
  const D = p.draw ?? drawTime(ctx);
  if (!(D >= 0)) throw new Error(`drawnMark ${id}: draw must be 0 s or more`);
  // Each path's start; by default one after another, so the mark draws as one line of work. A mark that starts the film
  // at 0 shows its first path (the unit module) drawn on frame 0 and draws the others from 0.
  const step = Math.max(D * 0.6, ctx.instant ? 1 / 30 : ctx.dur.stagger);
  const times = p.times ?? art.paths.map((_, i) => (p.at === 0 ? (i === 0 ? -1 : (i - 1) * step) : p.at + i * step));
  if (times.length !== n) throw new Error(`drawnMark ${id}: times has ${times.length} entries; the mark has ${n} paths`);
  if (p.times) times.forEach((t, i) => { if (!Number.isFinite(t) || t < p.at - 1e-9) throw new Error(`drawnMark ${id}: times[${i}] (${t}) is before at (${p.at}); give each path a time at at or later`); });
  const fills = p.fills ?? times.map((t) => t + D);
  if (fills.length !== n) throw new Error(`drawnMark ${id}: fills has ${fills.length} entries; the mark has ${n} paths`);
  fills.forEach((f, i) => { if (!Number.isFinite(f) || f < times[i]! - 1e-9) throw new Error(`drawnMark ${id}: fills[${i}] (${f}) is before the path starts to draw (${times[i]}); a fill lands after its outline starts`); });

  // The box. With none: the hero box, at the size the system's hook needs when the mark opens the film (the parts on
  // screen by the hook's time cover the hook's area, each part by its box, as the hook check counts them).
  let area = heroArea(ctx);
  const hook = dir?.hook;
  if (!p.box && hook && (hook.show === "picture" || hook.show === "both") && p.at <= hook.by) {
    const shown = art.paths.map((_, i) => i).filter((i) => (art.paths[i]!.paint === "stroke" ? times[i]! + D : fills[i]!) <= Math.max(0, hook.by) + 1e-9);
    const cover = partsCover(art, shown);
    if (cover > 0) area = Math.min(0.5, Math.max(area, (hook.area ?? area) * 1.15 / cover));
  }
  const lineH = p.line ? ctx.lineHeight(p.line.role ?? "headline") * (ctx.measure(p.line.text, p.line.role ?? "headline") > ctx.safe.right - ctx.safe.left ? 2 : 1) : 0;
  const pair = p.line && !p.box ? lineAndSubject(ctx, { lineH, aspect: b.w / b.h, area }) : null;
  // The drawn shape fits the box, centred.
  const box = p.box ?? pair?.subject ?? heroBox(ctx, b.w / b.h, { area });
  const s = Math.min(box.w / b.w, box.h / b.h);
  const dw = b.w * s, dh = b.h * s;
  const ox = box.x + (box.w - dw) / 2 - b.x * s, oy = box.y + (box.h - dh) / 2 - b.y * s;
  const drawn = { x: ox + b.x * s, y: oy + b.y * s, w: dw, h: dh };

  const voc = vocabulary(ctx);
  const cut = ctx.instant || voc.opaque || (p.fillWith ?? (voc.shape === "cut" ? "cut" : "fade")) === "cut";
  const width = ctx.stroke * (p.weight ?? 2);
  const out: Node[] = [];

  // The lockup: where the mark goes, and the words.
  let move: Tracks = {};
  if (p.lockup) {
    const L = p.lockup;
    if (!(L.at > Math.max(...fills) - 1e-9)) throw new Error(`drawnMark ${id}: lockup.at (${L.at}) comes before the last fill lands (${Math.max(...fills).toFixed(3)} s); lock the mark up when it is finished`);
    const look = DIRECTION[ctx.system.id]?.ends.look;
    // The box is the text-safe area made symmetric about the frame's middle: the mark is the subject of the frame, so
    // the lockup's axis is the frame's axis (at 9:16 the text-safe area sits left of the middle, for the platform's buttons).
    const S = ctx.safe, x0 = Math.max(S.left, ctx.width - S.right), x1 = Math.min(S.right, ctx.width - S.left);
    // The line keeps the end look's role where it reads on a phone; a wide frame steps it up (smallLineRole).
    const role = look?.name ?? "headline", lineRole = smallLineRole(ctx.system, look?.line ?? "body", ctx.width, Math.min(ctx.width, ctx.height));
    const settle = ctx.instant ? 1 / 30 : ctx.dur.move;
    let mb: Box, words: Node[];
    if (ctx.height > ctx.width) {
      // A tall frame: the text ends in the text-safe area, so a mark large enough to own the frame cannot have its name
      // under it. The name and the line go over the mark, and the mark keeps its size (smaller only when the pair would
      // pass the picture-safe foot); the pair centres on the optical centre, as lineAndSubject places a line and a subject.
      const P = pictureSafe(ctx), foot = P.y + P.h, gap = Math.round(ctx.lineHeight("body"));
      const T = lockupLayout(ctx, { name: L.name, line: L.line, mark: "none", axis: "column", role, lineRole, x: x0, y: 0, w: x1 - x0 }).height;
      const k = Math.min(1, (foot - S.top - T - gap) / dh, P.w / dw);
      const pairH = T + gap + dh * k;
      const y0 = Math.round(Math.max(S.top, Math.min(foot - pairH, S.bottom - T, S.top + (foot - S.top) * 0.46 - pairH / 2)));
      mb = { x: ctx.width / 2 - (dw * k) / 2, y: y0 + T + gap, w: dw * k, h: dh * k };
      // The words come on the bar with the move when the mark never passes under them; else when it has landed.
      const clear = Math.min(drawn.y, mb.y) >= y0 + T;
      words = lockup({ id: `${id}-lock`, name: L.name, line: L.line, mark: "none", axis: "column", role, lineRole, x: x0, y: y0, w: x1 - x0,
        at: clear ? L.at : L.at + settle, until: p.until }, ctx);
      words.push({ id: `${id}-lock-mark-box`, kind: "anchor", ...mb, at: L.at });
    } else {
      // A wide or square frame: the mark over the name (or beside it, on the end look's axis), centred in the text-safe
      // area. The mark keeps the size it was built at where the text-safe height leaves room for the words, and never
      // goes under the end look's height (`ends.look.mark` of the frame's height).
      const T = lockupLayout(ctx, { name: L.name, line: L.line, mark: "none", axis: "column", role, lineRole, x: x0, y: 0, w: x1 - x0 }).height;
      const room = S.bottom - S.top - T - Math.ceil(ctx.lineHeight(role) * 0.6) - 2;
      let markH = Math.round(Math.max((look?.mark ?? 0.3) * ctx.height, Math.min(dh, room)));
      const lay = () => lockup({ id: `${id}-lock`, name: L.name, line: L.line, mark: { draw: () => [], aspect: dw / dh }, markSize: markH, axis: look?.axis ?? "column",
        role, lineRole, x: x0, y: S.top, w: x1 - x0, h: S.bottom - S.top, at: L.at + settle, until: p.until }, ctx);
      // The lockup sets its words by their ink, a little lower than this estimate: while it says a word is outside the
      // text-safe area, the mark gives up height (never under the end look's height), so the words stay inside it.
      const floor = Math.round((look?.mark ?? 0.3) * ctx.height), step = Math.max(4, Math.ceil(ctx.lineHeight(lineRole) * 0.2));
      const warn = console.warn;
      let said: string[] = [];
      console.warn = (...m: unknown[]) => said.push(m.map(String).join(" "));
      try {
        words = lay();
        for (let i = 0; i < 12; i++) {
          said = [];
          words = lay();
          if (!said.some((m) => /outside the text-safe area/.test(m)) || markH <= floor) break;
          markH = Math.max(floor, markH - step);
        }
      } finally { console.warn = warn; }
      for (const m of said) console.warn(m);
      const a = words.find((w) => w.id === `${id}-lock-mark-box`) as Extract<Node, { kind: "anchor" }> | undefined;
      if (!a) throw new Error(`drawnMark ${id}: the lockup laid out no mark`);
      mb = a;
    }
    const k = Math.min(mb.w / dw, mb.h / dh);
    const dx = mb.x + mb.w / 2 - (drawn.x + dw / 2), dy = mb.y + mb.h / 2 - (drawn.y + dh / 2);
    // At rest until the move; a move before 0 has ended by frame 0 (the guard folds it).
    const rest = (v: number): Key[] => (L.at > 0 ? [{ t: 0, v }] : []);
    move = { x: [...rest(0), ...go(ctx, L.at, 0, dx, "move")], y: [...rest(0), ...go(ctx, L.at, 0, dy, "move")], scale: [...rest(1), ...go(ctx, L.at, 1, k, ctx.noOvershoot("move"), 1, "move")] };
    out.push(...words);
    // The closing hold: from the landing to the end. The ending check holds the end to the system's own hold.
    out.push(...hold({ id: `${id}-hold`, at: L.at + settle, until: p.until }, ctx));
  }

  // Every path scales about the mark's centre, so the lockup's move keeps the mark whole.
  const origin: [number, number] = [0.5, 0.5];
  const nodeBox = { x: drawn.x, y: drawn.y, w: drawn.w, h: drawn.h };
  const moved = (): Tracks => Object.fromEntries(Object.entries(move).map(([k, v]) => [k, v!.map((q) => ({ ...q }))]));
  art.paths.forEach((path, i) => {
    const d = pathData(placeSegs(parsePath(path.d), s, ox, oy));
    const role: ColorRole = i === accent ? "accent" : p.color ?? "ink";
    // Every path of the mark is one group: the mark is one designed unit, one picture for the hook and one mover.
    const group = id;
    const t = times[i]!, f = fills[i]!;
    const on = stamped(t, p.until);
    if (path.paint === "fill") {
      const fillOn: Key[] = cut ? stamped(f, p.until) : onOff(ctx, f, p.until, "fade", "cut");
      out.push({ id: `${id}-p${i}-fill`, kind: "path", d, fill: role, ...(path.rule === "evenodd" ? { fillRule: "evenodd" as const } : {}), group, box: nodeBox, origin, tracks: { ...moved(), opacity: fillOn } });
    }
    const line = path.paint === "stroke" ? Math.max(ctx.stroke, (path.width ?? 1) * s) : width;
    const drawKeys: Key[] = D > 0 ? go(ctx, t, 0, 1, ctx.noOvershoot("move"), D / ctx.dur.move, "move") : stamped(t);
    out.push({ id: `${id}-p${i}-line`, kind: "path", d, stroke: role, width: line, join: "round", cap: "round", group, z: 1, box: nodeBox, origin, tracks: { ...moved(), opacity: on, draw: drawKeys } });
  });
  // The line over the mark while it builds. With a lockup it has left before the mark moves, so it never meets the name.
  if (p.line) {
    const S = ctx.safe, w = S.right - S.left;
    const y = pair ? pair.line.y : Math.max(S.top, drawn.y - lineH - Math.round(ctx.lineHeight("body")));
    const until = p.lockup ? p.lockup.at - (ctx.instant ? 1 / 30 : ctx.dur.exit) : p.until;
    out.push(...text({ id: `${id}-line`, text: p.line.text, role: p.line.role ?? "headline", align: "center", x: S.left, y, w, at: p.at <= 0 ? -1 : p.at, until }, ctx));
  }
  out.push({ id: `${id}-box`, kind: "anchor", ...drawn, at: p.at, data: { paths: n } });
  return out;
};
