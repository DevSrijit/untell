// FitText: the largest type that fits a band or a slab. The lines are set in one role, then scaled together
// by one factor until the widest line fills the box width or the lines fill its height, whichever comes first.
// Use it where the system asks type to fill the frame: Kinetic and Courtside headlines, Nocturne's statement
// fitted to the width, a word that becomes the ground.
//
// Rules this block enforces:
// - One factor for all lines, so they keep one cap height and one left edge (or one centre).
// - The scaled box never passes the box, and never passes the text-safe area, except in a system whose
//   `bleed` lists the role (Kinetic, Courtside: display). There the box may run to the frame edge on purpose.
//   When the box passes the safe area in another system, the factor shrinks until it does not.
// - `max` caps the factor (default 4), so a short word does not grow past the frame's scale.
// - `valign` places the lines in the box's height ("top", "middle", "bottom") when they fill its width first, as
//   `align` places them in its width ("left", "center", "right").
// - `angle` tilts the band: the box turns by that many degrees about its top left corner (x, y), as title's angle
//   does. The lines fit the band along its axis; each line turns about its own top left corner, and the text-safe
//   check turns with them (every corner of each line's glyph box). The rise entrance stays along the screen's y.
// - It enters and leaves as one unit, by the system's vocabulary for text ("rise", "fade" or "cut"), or by
//   `reveal`. With `at` at 0 or before, it shows from frame 0.
// - The scale is a still track (one key), set on each line about its top left corner. Both renderers
//   draw the glyphs at the scaled size.
import { go, textSafe } from "../context";
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Ctx, Node } from "../types";
import { vocabulary, type TextReveal } from "../vocabulary";
import { onOff } from "./shape";
import { caseCtx, overflow } from "./text";

export type FitTextProps = {
  id?: string;
  /** One line, or explicit lines. The block does not wrap: give the breaks. */
  text: string | string[];
  /** The band or slab, px. */
  x: number; y: number; w: number; h: number;
  /** The role the lines are set in before scaling. Default: display. */
  role?: TypeRole;
  color?: ColorRole;
  align?: "left" | "center" | "right";
  /** Where the lines sit in the box's height when they fill its width first: "top" (default), "middle" or "bottom". */
  valign?: "top" | "middle" | "bottom";
  /** A tilted band: the box turns by `angle` degrees about its top left corner (x, y), as title's angle does (-45
   *  rises to the right). The lines fit the band along its axis (w) and across it (h); the text-safe check turns with
   *  them. */
  angle?: number;
  /** The largest factor. Default 4. */
  max?: number;
  /** How it comes on: "rise", "fade" or "cut". Default: the system's vocabulary for text. */
  enter?: TextReveal;
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: TextReveal;
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  keepCase?: boolean;
  at: number;
  until?: number;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};

/** The factor and the placed lines of a fitted text, for a scene that must know the size before it builds. */
export function fitLayout(ctx0: Ctx, p: Omit<FitTextProps, "at" | "until" | "reveal" | "color">) {
  const ctx = caseCtx(ctx0, p.keepCase);
  const role = p.role ?? "display";
  const lines = Array.isArray(p.text) ? p.text : [p.text];
  const lh = ctx.lineHeight(role);
  const o = overflow(ctx, role);
  const widths = lines.map((l) => ctx.measure(l, role));
  const wide = Math.max(1, ...widths);
  const bleed = !!ctx.system.bleed?.includes(role);
  // The glyph box of n lines at factor k: from y - k * o.top to y + k * (n * lh + o.bottom).
  let k = Math.min(p.max ?? 4, p.w / wide, p.h / (lines.length * lh + o.top + o.bottom));
  const deg = p.angle ?? 0;
  // Each line in the band's own frame (x along the band, y across it), then turned about the box's top left corner.
  const place = (k: number) => {
    const tall = k * (lines.length * lh + o.top + o.bottom);
    const dy = p.valign === "middle" ? (p.h - tall) / 2 : p.valign === "bottom" ? p.h - tall : 0;
    return lines.map((text, i) => {
      const lw = widths[i]! * k;
      const x = p.align === "center" ? p.x + (p.w - lw) / 2 : p.align === "right" ? p.x + p.w - lw : p.x;
      return { text, x, y: p.y + dy + k * (o.top + i * lh), w: lw, h: lh * k };
    });
  };
  // A turned band: every corner of each line's glyph box, turned, must be in the text-safe area.
  const corners = (l: { x: number; y: number; w: number; h: number }, k: number) => {
    const y0 = l.y - k * o.top, y1 = l.y + l.h + k * o.bottom;
    return [[l.x, y0], [l.x + l.w, y0], [l.x, y1], [l.x + l.w, y1]].map(([a, b]) => turnAbout(a!, b!, p.x, p.y, deg));
  };
  const safe = (k: number) => bleed || place(k).every((l) => deg
    ? corners(l, k).every(([a, b]) => textSafe(ctx, { x: a, y: b, w: 0, h: 0 }))
    : textSafe(ctx, { x: l.x, y: l.y - k * o.top, w: l.w, h: l.h + k * (o.top + o.bottom) }));
  for (let i = 0; i < 40 && !safe(k); i++) k *= 0.97;
  if (!safe(k)) console.warn(`fitText ${p.id ?? "fitText"}: the box is outside the text-safe area at any size`);
  // The nodes' places: a line's top left corner, turned with the band (the node turns about that corner).
  const placed = place(k).map((l) => { const [x, y] = turnAbout(l.x, l.y, p.x, p.y, deg); return { ...l, x, y }; });
  return { k, role, lines: placed, lineHeight: lh * k, angle: deg };
}

/** A point turned by `deg` degrees about a pivot (screen coordinates: y down, so a negative angle turns it up). */
function turnAbout(px: number, py: number, cx: number, cy: number, deg: number): [number, number] {
  if (!deg) return [px, py];
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c];
}

export const fitText: Block<FitTextProps> = (p, ctx) => {
  const id = p.id ?? "fitText";
  const { k, role, lines, angle } = fitLayout(ctx, p);
  const reveal: TextReveal = ctx.instant ? "cut" : p.reveal ?? vocabulary(ctx).text;
  const opacity = reveal === "cut" ? onOff(ctx, p.at, p.until, "cut", "cut") : onOff(ctx, p.at, p.until, "fade", "fade");
  const rise = reveal === "rise" && p.at > 0 ? { y: go(ctx, p.at, 12 * Math.min(k, 2), 0) } : {};
  return lines.map((l, i): Node => ({ id: `${id}-${i}`, kind: "text", x: l.x, y: l.y, text: l.text, role, color: p.color ?? "ink",
    ...(p.keepCase ? { keepCase: true } : {}), origin: [0, 0], tracks: { opacity, scale: [{ t: 0, v: k }], ...(angle ? { rotate: [{ t: 0, v: angle }] } : {}), ...rise } }));
};
