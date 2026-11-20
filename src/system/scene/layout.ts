// What both renderers agree on: the static style of each node and how its masks are cut.
// Keeping this in one place is what makes a Remotion frame and a HyperFrames frame match.
import { hex } from "../color";
import type { System, TypeRole } from "../systems";
import type { ColorRole } from "./roles";
import { INK, type InkMetrics } from "./ink.gen";
import { INK_ITALIC } from "./ink-italic.gen";
import { ITALIC } from "../italics.gen";
import type { Ctx, ImageNode, Light, Node, TextNode, Tracks } from "./types";

export type { InkMetrics };

export const colorOf = (s: System, role: ColorRole): string => {
  const v = (s.roles as Record<string, { l: number; c: number; h: number } | undefined>)[role];
  if (!v) throw new Error(`System ${s.id} has no "${role}" role`);
  return hex(v as never);
};

/** CSS font-family values for the three slots, and `fallback`: the system's symbol fonts as one CSS list. */
export type Families = Record<"display" | "text" | "mono", string> & { fallback?: string };

/**
 * The font weights a system loads for the family of a role: the weights of every role whose font slot names the
 * same family. Both renderers load exactly these (remotion.tsx loadFamily, export_systems.ts fontList). A weight
 * outside this set would make the browser draw a fake bold, so it is not valid.
 */
export function loadedWeights(s: System, role: TypeRole): number[] {
  const family = s.fonts[s.type[role].font] ?? s.fonts.text;
  const roles = Object.values(s.type).filter((t) => (s.fonts[t.font] ?? s.fonts.text) === family);
  return [...new Set(roles.map((t) => t.weight))].sort((a, b) => a - b);
}

/**
 * Whether the face of a role (its family, at the text's weight) has a true italic in the kit (italics.gen.ts). Only
 * then may a text set `italic`: a face with no italic file would be slanted by the browser, which is not a design.
 */
export function hasItalic(s: System, role: TypeRole, weight?: number): boolean {
  const family = s.fonts[s.type[role].font] ?? s.fonts.text;
  return !!ITALIC[family]?.includes(weight ?? s.type[role].weight);
}

/** The weight of a text: its own weight when it sets one, else its role's. A weight the system does not load throws. */
export function weightOf(s: System, role: TypeRole, weight?: number): number {
  if (weight === undefined) return s.type[role].weight;
  const ok = loadedWeights(s, role);
  if (!ok.includes(weight)) throw new Error(`System ${s.id} loads ${s.fonts[s.type[role].font] ?? s.fonts.text} in weights ${ok.join(", ")} only; the ${role} role cannot take weight ${weight}`);
  return weight;
}

/**
 * The CSS of a text role at a frame's short side. With keepCase, a role set in capitals keeps the case as written.
 * `weight` sets a weight other than the role's (TextNode.weight); it must be one the system loads (weightOf).
 */
export function textStyle(s: System, families: Families, role: TypeRole, short: number, keepCase = false, weight?: number, italic = false): Record<string, string | number> {
  const t = s.type[role];
  if (italic && !hasItalic(s, role, weight)) throw new Error(`System ${s.id} has no italic face for its ${role} role (${s.fonts[t.font] ?? s.fonts.text} ${weightOf(s, role, weight)}): a text sets italic only where hasItalic says so`);
  return {
    // The symbol fallback comes after the main family, so it draws only the glyphs the main family lacks.
    fontFamily: [families[t.font] || families.text, families.fallback].filter(Boolean).join(", "),
    fontSize: `${Math.round(t.size * short)}px`,
    fontWeight: weightOf(s, role, weight),
    letterSpacing: `${t.tracking}em`,
    lineHeight: String(t.leading),
    textTransform: t.uppercase && !keepCase ? "uppercase" : "none",
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "pre",
    // The true italic face, and never a slant that the browser makes from the upright face.
    ...(italic ? { fontStyle: "italic", fontSynthesisStyle: "none" } : {}),
  };
}

/** A letter outside ASCII that carries a mark above it (À, É, Å, ...): the mask reaches the font's accentTop for it. */
const ACCENTED = /[\u00C0-\u024F]/;

/**
 * A masked line's clip box: how far it reaches past the line box on each side, in px. It is sized to the font's ink
 * (inkMetrics: the highest and deepest glyph, and how far a glyph reaches past its own advance), with room, so a
 * reveal mask never cuts a glyph at rest: an accent, a quote mark, a descender, an "f" or a "j", and the last glyph
 * of a line with negative tracking (CSS letter-spacing takes the tracking off after the last glyph too, so its ink
 * runs past the box). `text` (and `weight`) size it to the text it masks: only a text with an accented letter takes
 * the accent's height. Top and bottom never drop under 0.14 and 0.3 of the size (the reveal's travel keeps its
 * feel). Both renderers draw the mask with these pads outside the text's own box, so the text does not move.
 */
export function maskPad(s: System, role: TypeRole, short: number, opts: { weight?: number; text?: string; italic?: boolean } = {}) {
  const t = s.type[role], size = t.size * short;
  const m = inkMetrics(s, role, opts.weight, opts.italic);
  // An accented letter stands higher than any plain glyph; only a text that holds one needs the room.
  const inkTop = opts.text !== undefined && ACCENTED.test(opts.text) ? m.accentTop : m.inkTop;
  // The baseline below the line box's top, as inkBand lays it out (Chrome rounds the ascent and descent).
  const A = Math.round(m.ascent * size), D = Math.round(m.descent * size);
  const baseline = Math.floor((t.leading * size - (A + D)) / 2) + A;
  const room = Math.max(2, Math.round(size * 0.04));
  const top = Math.max(Math.round(size * 0.14), Math.ceil(inkTop * size - baseline) + room);
  const bottom = Math.max(Math.round(size * 0.3), Math.ceil(baseline + m.inkBottom * size - t.leading * size) + room);
  const left = Math.ceil(m.overL * size) + room;
  const right = Math.ceil((m.overR + Math.max(0, -t.tracking)) * size) + room;
  return { top, bottom, left, right };
}

/** How far a masked line moves for reveal = 100: its line box plus both pads, so it is fully hidden. */
export function maskTravel(s: System, role: TypeRole, short: number, opts: { weight?: number; text?: string; italic?: boolean } = {}) {
  const size = s.type[role].size * short;
  const pad = maskPad(s, role, short, opts);
  return Math.round(size * s.type[role].leading) + pad.top + pad.bottom;
}

/**
 * The style of a masked line's clip box, inside the text's own box: it clips, its padding is the mask's pad, and a
 * negative margin of the same size takes the pad back out of the layout. So the clip box grows past the text box on
 * every side while the text box (its place, its width, its origin for scale and rotation) stays as the block set it.
 * Both renderers use this one style.
 */
export function maskBox(pad: { top: number; right: number; bottom: number; left: number }): Record<string, string> {
  const px = (v: number) => `${v}px`;
  return { display: "block", overflow: "hidden",
    padding: [pad.top, pad.right, pad.bottom, pad.left].map(px).join(" "),
    margin: [pad.top, pad.right, pad.bottom, pad.left].map((v) => px(-v)).join(" ") };
}

/** A box with z at or above TOP draws in the overlay layer (layer 1) unless it sets a layer: a wipe panel. */
export const TOP = 1000;

export const layerOf = (n: Node) => n.layer ?? (n.kind === "rect" && (n.z ?? 0) >= TOP ? 1 : 0);
const kindRank = (n: Node) => (n.kind === "scene3d" ? -1 : n.kind === "path" || n.kind === "circle" ? 0 : n.kind === "rect" || n.kind === "image" ? 1 : 2);

/** The scene's camera node, if it has one. */
export const cameraOf = (nodes: Node[]) => nodes.find((n) => n.kind === "camera");

export type Run = { kind: "shapes"; nodes: Node[]; blend?: "multiply" } | { kind: "rect"; node: Node } | { kind: "text"; node: TextNode }
  | { kind: "scene3d"; node: Extract<Node, { kind: "scene3d" }> } | { kind: "image"; node: Extract<Node, { kind: "image" }> };

/**
 * Where a picture's file is. A plain name means a prepared asset in assets/media/; the page sets
 * globalThis.__vsAssets to that folder's URL (the Remotion capture page and HyperFrames projects differ).
 */
export function assetUrl(src: string): string {
  if (/^(https?:|data:|file:|\/)/.test(src)) return src;
  const base = (globalThis as unknown as { __vsAssets?: string }).__vsAssets ?? "assets/media/";
  return base + src;
}

/**
 * The draw order of a scene, as runs. Nodes sort by layer, then kind (lines and circles, boxes, text),
 * then z, then the order the block gave them. Lines and circles next to each other share one SVG.
 * `space`: "world" gives the nodes that move with the camera, "screen" the pinned nodes.
 * A line or circle with a blend gets an SVG of its own, and the blend goes on that SVG, so it mixes
 * with everything drawn below it. Cameras, anchors and holds draw nothing here.
 */
export function runs(nodes: Node[], space: "world" | "screen" = "world"): Run[] {
  // Pinned nodes draw in screen space, in a layer of their own above the camera's world (see Base.pinned).
  nodes = nodes.filter((n) => !!(n as { pinned?: boolean }).pinned === (space === "screen"));
  const sorted = nodes.map((n, i) => ({ n, i })).sort((a, b) =>
    layerOf(a.n) - layerOf(b.n) || kindRank(a.n) - kindRank(b.n) || (a.n.z ?? 0) - (b.n.z ?? 0) || a.i - b.i).map((x) => x.n);
  const out: Run[] = [];
  for (const n of sorted) {
    if (n.kind === "camera" || n.kind === "anchor" || n.kind === "hold" || n.kind === "audio") continue;
    if (n.kind === "path" || n.kind === "circle") {
      const last = out[out.length - 1];
      if (last?.kind === "shapes" && !last.blend && !n.blend) last.nodes.push(n);
      else out.push({ kind: "shapes", nodes: [n], ...(n.blend ? { blend: n.blend } : {}) });
    } else if (n.kind === "scene3d") out.push({ kind: "scene3d", node: n });
    else if (n.kind === "image") out.push({ kind: "image", node: n });
    else if (n.kind === "rect") out.push({ kind: "rect", node: n });
    else if (n.kind === "text") out.push({ kind: "text", node: n });
  }
  return out;
}

/**
 * Where a node pivots for scale and rotation. "view": px in frame coordinates (SVG transform-box view-box,
 * GSAP svgOrigin). "self": a % of the node's own box (CSS transform-origin; SVG fill-box; GSAP transformOrigin).
 */
export function originOf(n: Node): { mode: "view" | "self"; value: string } {
  const [ox, oy] = n.origin ?? (n.kind === "text" ? [0, 0.5] : [0.5, 0.5]);
  if (n.kind === "circle") return { mode: "view", value: `${n.cx + (ox - 0.5) * 2 * n.r} ${n.cy + (oy - 0.5) * 2 * n.r}` };
  if (n.kind === "path" && n.box) return { mode: "view", value: `${n.box.x + n.box.w * ox} ${n.box.y + n.box.h * oy}` };
  return { mode: "self", value: `${ox * 100}% ${oy * 100}%` };
}

/** The CSS for an origin, for the Remotion renderer. */
export function originCss(n: Node): { transformOrigin: string; transformBox?: "view-box" | "fill-box" } {
  const o = originOf(n);
  const svg = n.kind === "path" || n.kind === "circle";
  if (o.mode === "view") return { transformOrigin: o.value.split(" ").map((v) => `${v}px`).join(" "), transformBox: "view-box" };
  return { transformOrigin: o.value, ...(svg ? { transformBox: "fill-box" as const } : {}) };
}

/** The scene's holds (see HoldNode). Both renderers draw them first, behind everything, outside the camera. */
export const holdsOf = (nodes: Node[]) => nodes.filter((n) => n.kind === "hold");

/** The scene's sounds (see AudioNode). They draw nothing; both renderers add them outside the camera. */
export const soundsOf = (nodes: Node[]) => nodes.filter((n): n is Extract<Node, { kind: "audio" }> => n.kind === "audio");

/** The attributes both renderers put on a text element: bleed text may pass the HyperFrames safe-zone and canvas checks. */
export function textAttrs(s: System, n: TextNode): Record<string, string> {
  // A role in system.bleed (Kinetic, Courtside: display) runs past the safe area and past the frame's edge on purpose:
  // the frame crops it (the system's signature move). These are HyperFrames' own opt-outs for its outside_safe_zone
  // and canvas_overflow checks.
  const out: Record<string, string> = s.bleed?.includes(n.role) ? { "data-layout-allow-safe-zone": "", "data-layout-allow-overflow": "" } : {};
  // Turned text (title `angle`): HyperFrames measures an element by its upright bounding box, which for a turned line
  // overlaps the lines beside it and the shape it runs along. The title block checks the turned glyph boxes itself
  // against the text-safe area, so its lines carry HyperFrames' opt-outs for overlap and the safe zone.
  if (n.tracks?.rotate?.some((k) => k.v !== 0)) Object.assign(out, { "data-layout-allow-overlap": "", "data-layout-allow-safe-zone": "" });
  // A masked line rises into its line box and sinks out of it: while it moves, its span sits outside the box, where the
  // mask hides it. HyperFrames measures the span, not what shows, so a title that leaves from the text-safe top read as
  // text outside the safe zone on the frames it happened to sample (Noir). untell's off-safe check measures the ink
  // that shows, at rest, for every text.
  if (n.mask && (n.tracks?.reveal?.length ?? 0) > 1) out["data-layout-allow-safe-zone"] = "";
  return out;
}

// ---------------------------------------------------------------- grain

/** The number of grain tiles. They step one per frame in a fixed order: tile f % GRAIN_TILES at frame f. */
export const GRAIN_TILES = 8;
/** The grain strength of a system: the overlay's opacity, or 0 for none. Only a system that allows grain has it. */
export const grainOf = (s: System) => (s.allows.includes("grain") ? s.texture.grain : 0);
/**
 * The style of the grain layer: above everything, outside the camera, and never hit by a pointer, so it
 * cannot count as covering text. It is marked data-el="texture" (the recorder skips it as a film texture)
 * and data-layout-ignore (the HyperFrames checks do not read it, so it neither counts as motion nor as an
 * element). Each tile repeats across the frame at 1 px per noise pixel.
 */
export const GRAIN_STYLE = { position: "absolute", inset: "0", pointerEvents: "none", backgroundRepeat: "repeat" } as const;

// ---------------------------------------------------------------- ink

/**
 * The ink metrics of a role's font at its weight (or `weight`), as fractions of the font size: cap height, x-height,
 * figure height, ascent and descent. They come from one table (ink.gen.ts, written by scripts/export_ink.ts),
 * measured once in Chrome per font and weight from the files the renderers load. So both renderers, and a test
 * with no browser, place text by the same numbers. A font that the table does not hold throws.
 */
export function inkMetrics(s: System, role: TypeRole, weight?: number, italic = false): InkMetrics {
  const family = s.fonts[s.type[role].font] ?? s.fonts.text;
  const w = weightOf(s, role, weight);
  // An italic text reads its italic face's metrics (scripts/export_ink_italic.ts): an italic reaches further right.
  const m = italic ? INK_ITALIC[family]?.[w] : INK[family]?.[w];
  if (!m) throw new Error(`No ink metrics for ${family} ${w}: the ink table holds the fonts and weights the systems load. Use a system's role and a weight it loads (in the untell lab, a new font needs bun scripts/export_ink.ts)`);
  return m;
}

/**
 * What a block centres in a text, as a designer does and as the alignment checks measure it (scene/align.ts,
 * bandOf): "cap", the band from the baseline to the cap line, when any letter, in the case the text shows, stands
 * taller than the x height (a capital, a figure or an ascender); else "x", the band from the baseline to the x line.
 * Descenders never count. So "cone 10" centres the band up to its cap line, and "cone" the band up to its x line.
 */
export function inkKind(s: System, role: TypeRole, text: string, keepCase = false): "cap" | "x" {
  const shown = s.type[role].uppercase && !keepCase ? text.toUpperCase() : text;
  return /[\p{Lu}\p{N}bdfhklt]/u.test(shown) ? "cap" : "x";
}

/**
 * The ink band of a plain text node, in px from the node's top (its y): the baseline, and the top and bottom of the
 * band a block centres (see inkKind). It follows CSS as Chrome lays it out: the line box is leading x size tall, and the
 * content area (the ascent and the descent, each rounded to whole px) sits in its middle, so the baseline is half the
 * leading gap (rounded down to a whole px) plus the ascent below the top.
 */
export function inkBand(ctx: Pick<Ctx, "system" | "size">, text: string, role: TypeRole, opts: { keepCase?: boolean; weight?: number } = {}) {
  const s = ctx.system, size = ctx.size(role), t = s.type[role];
  const m = inkMetrics(s, role, opts.weight);
  // Chrome lays a line out with the font's ascent and descent rounded to whole px, and the half leading above the
  // content area rounded down to a whole px (measured: Geist 56 px at 1.3 puts the baseline 55 px below the top).
  const A = Math.round(m.ascent * size), D = Math.round(m.descent * size);
  const baseline = Math.floor((t.leading * size - (A + D)) / 2) + A;
  const kind = inkKind(s, role, text, opts.keepCase);
  const h = kind === "x" ? m.x : m.cap;
  return { baseline, top: baseline - h * size, bottom: baseline, kind };
}

/** The y (top) at which a plain text node puts the centre of its ink band (inkBand) on the centre of `box`. */
export function centreInk(ctx: Pick<Ctx, "system" | "size">, text: string, role: TypeRole, box: { y: number; h: number }, opts: { keepCase?: boolean; weight?: number } = {}): number {
  const b = inkBand(ctx, text, role, opts);
  return snapBaseline(box.y + box.h / 2 - (b.top + b.bottom) / 2, b.baseline);
}

/** Chrome draws a text's baseline on a whole px: move y the least so that y + baseline is a whole number. */
const snapBaseline = (y: number, baseline: number) => Math.round(y + baseline) - baseline;

/**
 * The y (top of the first line) at which lines set `pitch` px apart centre their ink in `box`: from the top of the
 * first line's ink band to the baseline of the last line. One line is centreInk.
 */
export function centreInkLines(ctx: Pick<Ctx, "system" | "size">, lines: string[], role: TypeRole, box: { y: number; h: number }, pitch: number, opts: { keepCase?: boolean; weight?: number } = {}): number {
  if (lines.length <= 1) return centreInk(ctx, lines[0] ?? "", role, box, opts);
  const first = inkBand(ctx, lines[0]!, role, opts), last = inkBand(ctx, lines[lines.length - 1]!, role, opts);
  const top = first.top, bottom = (lines.length - 1) * pitch + last.bottom;
  return snapBaseline(box.y + box.h / 2 - (top + bottom) / 2, first.baseline);
}

/** The y (top) at which a plain text node puts its baseline on `baseline`: for texts that share one line. */
export function onBaseline(ctx: Pick<Ctx, "system" | "size">, role: TypeRole, baseline: number, opts: { weight?: number } = {}): number {
  return Math.round(baseline) - inkBand(ctx, "x", role, opts).baseline;
}

// ---------------------------------------------------------------- scanlines

/** The scanline strength of a system: the layer's opacity, or 0 for none. Only a system that allows scanlines has them. */
export const scanlinesOf = (s: System) => (s.allows.includes("scanlines") ? s.texture.scanlines ?? 0 : 0);
/** The scanline pitch in px at a frame's short side: one dark line every 3 px at 1080, never under 2 px. */
export const scanlinePitch = (short: number) => Math.max(2, Math.round((3 * short) / 1080));
/**
 * The scanline layer: hard horizontal lines in black, one px tall, one every scanlinePitch px, from one small
 * SVG tile that repeats. It is not a gradient and not a blur: each line is a hard edge, as on a screen. Like the
 * grain, it sits above everything, outside the camera, takes no pointer events, and is marked data-el="texture"
 * and data-layout-ignore, so no check counts it as motion, as an element or as a cover over text. Both
 * renderers draw it with this style and the system's strength as its opacity.
 */
export function scanlineStyle(short: number): Record<string, string> {
  const p = scanlinePitch(short);
  const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="${p}"><rect width="4" height="1" fill="#000"/></svg>`;
  return { position: "absolute", inset: "0", pointerEvents: "none", backgroundRepeat: "repeat", backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(tile)}")` };
}

// ---------------------------------------------------------------- tilt

/** The perspective distance for tilt, in px: twice the frame's long side, so a slight tilt reads as a slight turn. */
export const perspectiveOf = (width: number, height: number) => Math.round(2 * Math.max(width, height));
/** True when a track set turns a node about x or y (tiltX, tiltY). Such a node gets the perspective. */
export const hasTilt = (tracks: Tracks | undefined) => !!(tracks?.tiltX?.length || tracks?.tiltY?.length);

// ---------------------------------------------------------------- pictures: clip, outline, light

/** The CSS clip-path of a picture's crop polygon (ImageNode.clip). */
export const clipCss = (clip: [number, number][]) => `polygon(${clip.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(", ")})`;

/** The id of a picture's outline filter (ImageNode.outline). */
export const outlineId = (n: ImageNode) => `outline-${n.id}`;

/**
 * The outline filter as plain data, so both renderers build the same SVG. Ring k grows the alpha by the widths of
 * rings 0..k (feMorphology dilate) and takes its colour; the outer rings draw first, the picture last.
 */
export function outlineFilter(s: System, n: ImageNode) {
  let r = 0;
  const rings = (n.outline ?? []).map((o, k) => ({ key: `r${k}`, radius: (r += o.width), color: colorOf(s, o.color) }));
  return { id: outlineId(n), rings: rings.reverse() };
}

/** Where a light layer takes its mask: the picture's alpha, sized and placed as the picture is (cover or contain, at the focus). */
export function lightMask(n: ImageNode, l: Light): Record<string, string> {
  const url = `url("${assetUrl(n.src)}")`;
  const [fx, fy] = n.focus ?? [0.5, 0.5];
  const size = n.fit === "contain" ? "contain" : "cover";
  const pos = `${fx * 100}% ${fy * 100}%`;
  if (l.kind === "sweep") return { maskImage: url, maskSize: size, maskPosition: pos, maskRepeat: "no-repeat", maskMode: "alpha" };
  // A rim: the alpha minus the same alpha moved `width` px away from the lit edge. What is left is a line on that edge.
  const a = (l.angle * Math.PI) / 180;
  const dx = Math.round(-Math.cos(a) * l.width * 100) / 100, dy = Math.round(-Math.sin(a) * l.width * 100) / 100;
  return { maskImage: `${url}, ${url}`, maskSize: `${size}, ${size}`, maskPosition: `${pos}, calc(${fx * 100}% + ${dx}px) calc(${fy * 100}% + ${dy}px)`,
    maskRepeat: "no-repeat, no-repeat", maskMode: "alpha, alpha", maskComposite: "subtract, add" };
}

/**
 * A sweep's band, in the picture's box: a square of side `side` (the box diagonal, so the band always spans the
 * picture), turned by the light's angle about the box centre, with the band of `width` px at its middle.
 */
export function sweepBox(n: ImageNode, l: Light) {
  const side = Math.ceil(Math.hypot(n.w, n.h));
  return { side, left: (n.w - side) / 2, top: (n.h - side) / 2, band: (side - l.width) / 2 };
}

/** The id of the camera's motion-blur filter (camera blurX, blurY). */
export const BLUR_ID = "vs-whip-blur";

/**
 * The filter region of a whip's blur, in the world's own px (the filter's user space): every part of the world that
 * the camera shows at any key, plus room for the blur's spread. A region of one frame (x 0, y 0, 100 %) cut away
 * all that a whip pans in from beyond the first frame, and it drew black (an agent's film). Both renderers use this.
 * A camera at pan (x, y) and zoom s shows the world from x + W/2 - W/(2s) to x + W/2 + W/(2s), and the same in y.
 */
export function blurRegion(cam: { tracks?: Tracks }, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const xs = (cam.tracks?.x ?? []).map((k) => k.v), ys = (cam.tracks?.y ?? []).map((k) => k.v);
  const ss = (cam.tracks?.scale ?? []).map((k) => k.v).filter((v) => v > 0);
  const s = Math.min(1, ...ss); // the widest view
  const spread = 3 * Math.max(0, ...[...(cam.tracks?.blurX ?? []), ...(cam.tracks?.blurY ?? [])].map((k) => k.v));
  const halfW = width / (2 * s), halfH = height / (2 * s);
  const x0 = Math.min(0, ...xs) + width / 2 - halfW, x1 = Math.max(0, ...xs) + width / 2 + halfW;
  const y0 = Math.min(0, ...ys) + height / 2 - halfH, y1 = Math.max(0, ...ys) + height / 2 + halfH;
  // An overshooting curve may pass a key by a little: a margin of a tenth of the frame on each side.
  const mx = width * 0.1 + spread, my = height * 0.1 + spread;
  return { x: Math.floor(x0 - mx), y: Math.floor(y0 - my), w: Math.ceil(x1 - x0 + 2 * mx), h: Math.ceil(y1 - y0 + 2 * my) };
}

/** How a light mixes with the picture: screen, so it only brightens. */
export const LIGHT_BLEND = "screen";

/** A phone's width in px, and the least cap height the main line needs on it (main-line: scripts/inspect/checks/scale.py). */
export const PHONE_W = 390;
export const LINE_CAP = 12;
/** The cap height of a role on a 390 px wide phone, px, for a frame whose short side is `short` and width `width`. */
export function phoneCap(s: System, role: TypeRole, width = 1080, short = 1080): number {
  return s.type[role].size * short * inkMetrics(s, role).cap * (PHONE_W / width);
}
/**
 * The cap height the main line of a moment needs on a 390 px wide phone, px: LINE_CAP, or 75 % of the cap height of
 * the system's headline role when that is larger (the main-line check, checks/scale.py).
 */
export const lineNeed = (s: System, width = 1080, short = 1080) => Math.max(LINE_CAP, 0.75 * phoneCap(s, "headline", width, short));
/** The least cap height of a small line (a lockup's line, a credit) on a 390 px wide phone, px: reading-size's body floor. */
export const SMALL_CAP = 8;
/**
 * The role a small line takes so it reads on a phone: `role`, or the next larger role (body, headline, display) whose cap
 * height on a 390 px wide phone is SMALL_CAP or more. A wide frame shows its type smaller on a phone than a tall one.
 */
export function smallLineRole(s: System, role: TypeRole, width = 1080, short = 1080): TypeRole {
  const up: TypeRole[] = ["caption", "label", "body", "headline", "display"];
  const i = Math.max(0, up.indexOf(role));
  return up.slice(i).find((r) => phoneCap(s, r, width, short) >= SMALL_CAP) ?? "display";
}
/** True when a role's letters are large enough for the line of a beat on a phone (lineNeed). */
export const readsOnPhone = (s: System, role: TypeRole, width = 1080, short = 1080) => phoneCap(s, role, width, short) >= lineNeed(s, width, short) - 0.05;
