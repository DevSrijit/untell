// Mark art: a brand mark given as SVG path data, for the drawnMark block. Pure functions, no DOM, so they run in
// Bun (untell media add parses the file once) and in the browser bundle (the block places the paths).
//
// The accepted format, and nothing else:
// - An SVG document with a `viewBox` (or a `width` and a `height` in px, read as a viewBox from 0 0).
// - Shapes: `path`, `rect`, `circle`, `ellipse`, `polygon`, `polyline` and `line`. untell turns each one into one path,
//   in document order. Groups (`g`) are read through. At most MAX_PATHS shapes.
// - Paint: the `fill`, `stroke`, `stroke-width` and `fill-rule` attributes, or the same properties in a `style`
//   attribute. A shape with `fill="none"` and a stroke is a line; every other shape is filled. A `<style>` sheet and
//   class names are not read. The colours themselves are not kept: the film paints with the system's roles.
// - Not accepted (each one throws with what to do): a `transform` on any element, `use`, `text`, `image`, a fill or a
//   stroke from a gradient or a pattern (`url(...)`), `clipPath` or `mask` on a shape.
// Path data may use every command of SVG 1.1 (absolute and relative). untell keeps it as absolute M, L, C, Q, A and Z.

export type MarkPath = {
  /** Absolute path data in the viewBox's units: M, L, C, Q, A and Z only. */
  d: string;
  /** "fill": a filled shape; "stroke": a line, `width` wide in viewBox units. */
  paint: "fill" | "stroke";
  width?: number;
  /** The SVG fill rule. Default: "nonzero". */
  rule?: "nonzero" | "evenodd";
};
/** A mark: its viewBox [x, y, w, h] and its paths, in document order. */
export type MarkArt = { viewBox: [number, number, number, number]; paths: MarkPath[] };

/** The most paths one mark may have: untell draws each path as its own node. */
export const MAX_PATHS = 64;

/** One absolute segment. M, L, Q, C: their points; A: rx ry rotation large sweep x y; Z: none. */
export type Seg = { c: "M" | "L" | "C" | "Q" | "A" | "Z"; v: number[] };

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Parses SVG path data into absolute segments (H and V become L, S becomes C, T becomes Q). Throws on bad data. */
export function parsePath(d: string): Seg[] {
  const out: Seg[] = [];
  let i = 0;
  const n = d.length;
  const ws = () => { while (i < n && /[\s,]/.test(d[i]!)) i++; };
  const num = (): number => {
    ws();
    const m = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(d.slice(i));
    if (!m) throw new Error(`path data: a number was expected at character ${i} ("${d.slice(i, i + 12)}")`);
    i += m[0].length;
    return Number(m[0]);
  };
  const flag = (): number => {
    ws();
    const ch = d[i];
    if (ch !== "0" && ch !== "1") throw new Error(`path data: an arc flag (0 or 1) was expected at character ${i}`);
    i++;
    return Number(ch);
  };
  let cx = 0, cy = 0, sx = 0, sy = 0;
  // The last control point, for S and T.
  let lastC: [number, number] | null = null, lastQ: [number, number] | null = null;
  let cmd = "";
  ws();
  if (i < n && !/[Mm]/.test(d[i]!)) throw new Error("path data: it must start with M");
  while (true) {
    ws();
    if (i >= n) break;
    if (/[A-Za-z]/.test(d[i]!)) {
      cmd = d[i]!;
      if (!(cmd.toUpperCase() in ARGS)) throw new Error(`path data: unknown command "${cmd}" at character ${i}`);
      i++;
    } else if (!cmd || cmd.toUpperCase() === "Z") throw new Error(`path data: a command was expected at character ${i}`);
    const C = cmd.toUpperCase(), rel = cmd !== C;
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === "Z") {
      out.push({ c: "Z", v: [] });
      cx = sx; cy = sy; lastC = lastQ = null;
      continue;
    }
    if (C === "M") {
      const x = num() + ox, y = num() + oy;
      out.push({ c: "M", v: [x, y] });
      cx = sx = x; cy = sy = y; lastC = lastQ = null;
      // Pairs after a move are lines.
      cmd = rel ? "l" : "L";
      continue;
    }
    if (C === "L" || C === "H" || C === "V") {
      const x = C === "V" ? cx : num() + (C === "H" ? (rel ? cx : 0) : ox);
      const y = C === "H" ? cy : num() + (C === "V" ? (rel ? cy : 0) : oy);
      out.push({ c: "L", v: [x, y] });
      cx = x; cy = y; lastC = lastQ = null;
      continue;
    }
    if (C === "C" || C === "S") {
      let x1: number, y1: number;
      if (C === "C") { x1 = num() + ox; y1 = num() + oy; } else { [x1, y1] = lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy]; }
      const x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy;
      out.push({ c: "C", v: [x1, y1, x2, y2, x, y] });
      lastC = [x2, y2]; lastQ = null; cx = x; cy = y;
      continue;
    }
    if (C === "Q" || C === "T") {
      let x1: number, y1: number;
      if (C === "Q") { x1 = num() + ox; y1 = num() + oy; } else { [x1, y1] = lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy]; }
      const x = num() + ox, y = num() + oy;
      out.push({ c: "Q", v: [x1, y1, x, y] });
      lastQ = [x1, y1]; lastC = null; cx = x; cy = y;
      continue;
    }
    // A
    const rx = Math.abs(num()), ry = Math.abs(num()), rot = num(), large = flag(), sweep = flag();
    const x = num() + ox, y = num() + oy;
    out.push({ c: "A", v: [rx, ry, rot, large, sweep, x, y] });
    cx = x; cy = y; lastC = lastQ = null;
  }
  if (!out.length) throw new Error("path data: it is empty");
  return out;
}

const f2 = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};
/** Absolute segments as path data, to 0.01. */
export function pathData(segs: Seg[]): string {
  return segs.map((s) => s.c + s.v.map((v, k) => (s.c === "A" && (k === 3 || k === 4) ? String(v) : f2(v))).join(" ")).join("");
}

/** The segments scaled by `s` about the origin, then moved by (tx, ty). One scale on both axes, so arcs stay arcs. */
export function placeSegs(segs: Seg[], s: number, tx: number, ty: number): Seg[] {
  return segs.map((g) => {
    if (g.c === "A") { const [rx, ry, rot, la, sw, x, y] = g.v as [number, number, number, number, number, number, number]; return { c: "A", v: [rx * s, ry * s, rot, la, sw, x * s + tx, y * s + ty] }; }
    return { c: g.c, v: g.v.map((v, k) => (k % 2 === 0 ? v * s + tx : v * s + ty)) };
  });
}

/** Points along an arc from (x0, y0), by the SVG spec's centre form (F.6.5), `steps` of them, the end included. */
function arcPoints(x0: number, y0: number, v: number[], steps = 32): [number, number][] {
  let [rx, ry] = v as [number, number];
  const [, , rotDeg, la, sw, x, y] = v as [number, number, number, number, number, number, number];
  if (!rx || !ry) return [[x, y]];
  const phi = (rotDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
  const dx = (x0 - x) / 2, dy = (y0 - y) / 2;
  const x1 = cos * dx + sin * dy, y1 = -sin * dx + cos * dy;
  const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
  const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
  const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
  const k = (la === sw ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
  const cx1 = (k * rx * y1) / ry, cy1 = (-k * ry * x1) / rx;
  const cx = cos * cx1 - sin * cy1 + (x0 + x) / 2, cy = sin * cx1 + cos * cy1 + (y0 + y) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1 - cx1) / rx, (y1 - cy1) / ry);
  let dt = ang((x1 - cx1) / rx, (y1 - cy1) / ry, (-x1 - cx1) / rx, (-y1 - cy1) / ry);
  if (!sw && dt > 0) dt -= 2 * Math.PI;
  if (sw && dt < 0) dt += 2 * Math.PI;
  const pts: [number, number][] = [];
  for (let i = 1; i <= steps; i++) {
    const t = t1 + (dt * i) / steps;
    pts.push([cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx, sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy]);
  }
  return pts;
}

/** Points along the segments (curves sampled), for a tight box. */
export function segPoints(segs: Seg[]): [number, number][] {
  const pts: [number, number][] = [];
  let cx = 0, cy = 0, sx = 0, sy = 0;
  for (const g of segs) {
    const v = g.v;
    if (g.c === "M") { cx = sx = v[0]!; cy = sy = v[1]!; pts.push([cx, cy]); }
    else if (g.c === "L") { cx = v[0]!; cy = v[1]!; pts.push([cx, cy]); }
    else if (g.c === "Z") { cx = sx; cy = sy; }
    else if (g.c === "C" || g.c === "Q") {
      for (let i = 1; i <= 24; i++) {
        const t = i / 24, u = 1 - t;
        if (g.c === "C") pts.push([u * u * u * cx + 3 * u * u * t * v[0]! + 3 * u * t * t * v[2]! + t * t * t * v[4]!, u * u * u * cy + 3 * u * u * t * v[1]! + 3 * u * t * t * v[3]! + t * t * t * v[5]!]);
        else pts.push([u * u * cx + 2 * u * t * v[0]! + t * t * v[2]!, u * u * cy + 2 * u * t * v[1]! + t * t * v[3]!]);
      }
      cx = v[v.length - 2]!; cy = v[v.length - 1]!;
    } else if (g.c === "A") { pts.push(...arcPoints(cx, cy, v)); cx = v[5]!; cy = v[6]!; }
  }
  return pts;
}

/** The drawn box of a mark in its own units: every path's points, a line's half width round it. */
export function artBounds(art: MarkArt): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of art.paths) {
    const pad = p.paint === "stroke" ? (p.width ?? 1) / 2 : 0;
    for (const [x, y] of segPoints(parsePath(p.d))) {
      x0 = Math.min(x0, x - pad); y0 = Math.min(y0, y - pad); x1 = Math.max(x1, x + pad); y1 = Math.max(y1, y + pad);
    }
  }
  if (!Number.isFinite(x0) || x1 - x0 <= 0 || y1 - y0 <= 0) throw new Error("mark: its paths draw nothing (an empty box)");
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------- the SVG file

const attrsOf = (tag: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]!.toLowerCase()] = m[3] ?? m[4] ?? "";
  // The style attribute's properties count as attributes (the attribute itself wins where both are given, as in CSS
  // the style attribute would win; untell reads the style last so it wins too).
  if (out.style) for (const d of out.style.split(";")) { const [k, v] = d.split(":"); if (k && v) out[k.trim().toLowerCase()] = v.trim(); }
  return out;
};
const numAttr = (a: Record<string, string>, k: string, d = 0) => {
  const v = a[k];
  if (v === undefined || v === "") return d;
  const n = parseFloat(v);
  if (!Number.isFinite(n) || /%/.test(v)) throw new Error(`mark: ${k}="${v}" is not a number in px (percent and units other than px are not read)`);
  return n;
};
const ellipseD = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx} ${cy - ry}A${rx} ${ry} 0 1 1 ${cx} ${cy + ry}A${rx} ${ry} 0 1 1 ${cx} ${cy - ry}Z`;

/** The path data of one SVG shape element, or null for an element that is not a shape. */
function shapeD(name: string, a: Record<string, string>): string | null {
  switch (name) {
    case "path": return a.d ?? null;
    case "rect": {
      const x = numAttr(a, "x"), y = numAttr(a, "y"), w = numAttr(a, "width"), h = numAttr(a, "height");
      if (w <= 0 || h <= 0) return null;
      let rx = a.rx !== undefined ? numAttr(a, "rx") : a.ry !== undefined ? numAttr(a, "ry") : 0;
      let ry = a.ry !== undefined ? numAttr(a, "ry") : rx;
      rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
      if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case "circle": { const r = numAttr(a, "r"); return r > 0 ? ellipseD(numAttr(a, "cx"), numAttr(a, "cy"), r, r) : null; }
    case "ellipse": { const rx = numAttr(a, "rx"), ry = numAttr(a, "ry"); return rx > 0 && ry > 0 ? ellipseD(numAttr(a, "cx"), numAttr(a, "cy"), rx, ry) : null; }
    case "line": return `M${numAttr(a, "x1")} ${numAttr(a, "y1")}L${numAttr(a, "x2")} ${numAttr(a, "y2")}`;
    case "polygon": case "polyline": {
      const v = (a.points ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (v.length < 4 || v.length % 2 || v.some((x) => !Number.isFinite(x))) throw new Error(`mark: a ${name} needs an even list of numbers in points`);
      let d = `M${v[0]} ${v[1]}`;
      for (let k = 2; k < v.length; k += 2) d += `L${v[k]} ${v[k + 1]}`;
      return name === "polygon" ? d + "Z" : d;
    }
  }
  return null;
}

const SKIP = new Set(["defs", "title", "desc", "metadata", "style", "lineargradient", "radialgradient", "pattern", "symbol", "clippath", "mask", "filter"]);
const REFUSE: Record<string, string> = {
  use: "a use element (expand it into its shapes in your editor)",
  text: "text (convert the text to outlines in your editor)",
  image: "an embedded picture (a mark is paths; give a picture to the photo block instead)",
  foreignobject: "foreign content",
};

/**
 * Parses an SVG mark into its viewBox and paths (the accepted format is in this file's header). Throws with the
 * reason and the fix when the file has something untell does not read.
 */
export function parseMarkSvg(svg: string): MarkArt {
  const text = svg.replace(/<!--[\s\S]*?-->/g, "").replace(/<\?[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>]*>/gi, "");
  const root = /<svg\b[^>]*>/i.exec(text);
  if (!root) throw new Error("mark: no <svg> element. Give an SVG file.");
  const ra = attrsOf(root[0]);
  let viewBox: [number, number, number, number];
  if (ra.viewbox) {
    const v = ra.viewbox.trim().split(/[\s,]+/).map(Number);
    if (v.length !== 4 || v.some((x) => !Number.isFinite(x)) || v[2]! <= 0 || v[3]! <= 0) throw new Error(`mark: viewBox "${ra.viewbox}" is not four numbers with a width and a height over 0`);
    viewBox = v as [number, number, number, number];
  } else if (ra.width && ra.height) viewBox = [0, 0, numAttr(ra, "width"), numAttr(ra, "height")];
  else throw new Error("mark: the <svg> has no viewBox and no width and height. Give it a viewBox.");
  const paths: MarkPath[] = [];
  const skip: string[] = [];
  for (const m of text.slice(root.index + root[0].length).matchAll(/<(\/?)([A-Za-z][\w:-]*)\b([^>]*?)(\/?)>/g)) {
    const close = m[1] === "/", name = m[2]!.toLowerCase(), self = m[4] === "/";
    if (name === "svg") { if (close) break; throw new Error("mark: an <svg> inside the <svg>. Give one flat SVG."); }
    if (SKIP.has(name)) { if (close) { if (skip[skip.length - 1] === name) skip.pop(); } else if (!self) skip.push(name); continue; }
    if (close || skip.length) continue;
    if (REFUSE[name]) throw new Error(`mark: the file has ${REFUSE[name]}. untell reads paths and basic shapes only.`);
    const a = attrsOf(m[0]);
    if (a.transform) throw new Error(`mark: a ${name} has a transform ("${a.transform}"). Apply the transforms in your editor (flatten or "apply transforms"), then add the file again.`);
    if (a["clip-path"] || a.mask) throw new Error(`mark: a ${name} has a clip-path or a mask. Apply it in your editor, so the file holds the clipped paths.`);
    const d = shapeD(name, a);
    if (d === null) continue;
    for (const k of ["fill", "stroke"]) if (/url\(/i.test(a[k] ?? "")) throw new Error(`mark: a ${name} takes its ${k} from a gradient or a pattern. A mark is flat: give each shape one colour.`);
    const stroked = !!a.stroke && a.stroke !== "none" && numAttr(a, "stroke-width", 1) > 0;
    const filled = (a.fill ?? "black") !== "none";
    if (!filled && !stroked) continue; // paints nothing
    let segs: Seg[];
    try { segs = parsePath(d); } catch (e) { throw new Error(`mark: shape ${paths.length + 1} (${name}): ${(e as Error).message}`); }
    paths.push({ d: pathData(segs), paint: filled ? "fill" : "stroke", ...(filled ? {} : { width: numAttr(a, "stroke-width", 1) }),
      ...(a["fill-rule"] === "evenodd" ? { rule: "evenodd" as const } : {}) });
    if (paths.length > MAX_PATHS) throw new Error(`mark: more than ${MAX_PATHS} shapes. untell draws each shape as its own stroke; join the shapes of one part into one path in your editor.`);
  }
  if (!paths.length) throw new Error("mark: the SVG paints no shape (no path, rect, circle, ellipse, polygon, polyline or line with a fill or a stroke)");
  const art = { viewBox, paths };
  artBounds(art);
  return art;
}

/** Checks inline art (a scene's own paths): each path parses, and the art draws something. Returns it normalised. */
export function checkArt(art: MarkArt): MarkArt {
  if (!Array.isArray(art.viewBox) || art.viewBox.length !== 4 || !(art.viewBox[2] > 0 && art.viewBox[3] > 0)) throw new Error("mark: viewBox must be [x, y, w, h] with w and h over 0");
  if (!art.paths?.length) throw new Error("mark: give at least one path");
  if (art.paths.length > MAX_PATHS) throw new Error(`mark: more than ${MAX_PATHS} paths`);
  const paths = art.paths.map((p, i) => {
    try { return { ...p, d: pathData(parsePath(p.d)) }; } catch (e) { throw new Error(`mark: path ${i}: ${(e as Error).message}`); }
  });
  const out = { viewBox: art.viewBox, paths };
  artBounds(out);
  return out;
}

/** The source of marks.gen.ts: each mark's art by name (untell media add writes it for an SVG). Pure. */
export function marksSource(t: Record<string, MarkArt>, by = "untell media add"): string {
  return [
    `// Generated by ${by}. Do not edit. Each mark (an SVG added as media): its viewBox and its paths as absolute`,
    "// path data, in the file's order. The drawnMark block reads it; a block cannot read the disk.",
    'import type { MarkArt } from "./scene/markArt";',
    "export const MARKS: Record<string, MarkArt> = {",
    ...Object.keys(t).sort().map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(t[k])},`),
    "};",
    "",
  ].join("\n");
}
