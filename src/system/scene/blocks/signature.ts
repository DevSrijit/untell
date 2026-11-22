// Signature: the system tokens that blocks read for a system's signature look, when SYSTEM.md names one that
// the plain block does not draw. It is the block-side table until systems.ts carries these tokens itself.
//
// Rules:
// - A prop that the scene gives wins over this table.
// - A system that this table does not name gets PLAIN: the blocks draw exactly what they drew before the
//   table existed. signature.test.ts checks this.
// - A tint is the accent at a constant opacity over the surface (only colour roles exist, never values).
//   `tintAlpha` picks the strongest tint at which every text colour that can sit on it still passes 4.5:1,
//   and the band still differs from the surface. With no such tint, the block falls back to the rule band.
// - A paper system that stamps opaque (vocabulary `opaque`) never gets a tint: it has no half-seen ink.
import { contrast, hexToRgb } from "../../color";
import type { System } from "../../systems";
import { colorOf } from "../layout";
import type { ColorRole } from "../roles";
import type { Ctx } from "../types";
import { baseOf } from "../../own";
import { vocabulary } from "../vocabulary";

/** Syntax colour: a colour role per token kind. A kind left out is set in ink. */
export type Syntax = { keyword?: ColorRole; literal?: ColorRole; comment?: ColorRole };

export type Signature = {
  codeBlock: {
    /** "rule": a band in the rule colour. "tint": a band of the accent at a tint, with a gutter bar in the accent. */
    band: "rule" | "tint";
    /** The colour of the lit line's number. */
    number: ColorRole;
    /** "sweep": the band moves to the next line on the move curve. "cut": a jump of more than one line cuts. */
    jump: "sweep" | "cut";
    syntax: Syntax;
  };
};

/** What the blocks did before this table: the default for a system that the table does not name. */
export const PLAIN: Signature = { codeBlock: { band: "rule", number: "ink", jump: "sweep", syntax: { comment: "inkMuted" } } };

/**
 * The systems with a signature of their own, from their SYSTEM.md:
 * - Manual: "one muted teal for the highlighted line". The band is the teal accent at a tint, a solid teal bar
 *   marks the gutter (a shape, so the mark does not ride on colour alone), and the line number turns teal.
 *   Literal values are teal; comments are muted ("four hues or fewer"). The highlight cuts on a jump of more
 *   than one line, so it never shows a wrong line on its way.
 */
export const SIGNATURE: Record<string, { codeBlock?: Partial<Signature["codeBlock"]> }> = {
  manual: { codeBlock: { band: "tint", number: "accentText", jump: "cut", syntax: { literal: "accentText", comment: "inkMuted" } } },
};

/** The signature of the context's system: its own entries over PLAIN. */
export function signature(ctx: Pick<Ctx, "system">): Signature {
  const v = SIGNATURE[baseOf(ctx.system.id)] ?? {};
  return { codeBlock: { ...PLAIN.codeBlock, ...v.codeBlock } };
}

/** `fg` at opacity `a` over `bg`, as a browser composites it (in sRGB). Hex in, hex out. */
export function over(fg: string, bg: string, a: number): string {
  const f = hexToRgb(fg), b = hexToRgb(bg);
  return "#" + f.map((c, i) => Math.round((c * a + b[i]! * (1 - a)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** The least contrast between the band and the surface, so a tint reads as a band at all. */
export const MIN_BAND = 1.15;
/** The least contrast for text on the band (WCAG AA for body text). */
export const MIN_TEXT = 4.5;

/**
 * The strongest tint of the accent over the surface (opacity 0.10 to 0.40, in steps of 0.01) at which every
 * colour in `texts` passes MIN_TEXT on the band. Null when no tint passes, or when the passing tints do not
 * reach MIN_BAND against the surface.
 */
export function tintAlpha(system: System, texts: ColorRole[]): number | null {
  const surface = colorOf(system, "surface"), accent = colorOf(system, "accent");
  for (let k = 40; k >= 10; k--) {
    const a = k / 100;
    const band = over(accent, surface, a);
    if (texts.every((t) => contrast(colorOf(system, t), band) >= MIN_TEXT)) return contrast(band, surface) >= MIN_BAND ? a : null;
  }
  return null;
}

/** The tint the code block uses in this context, or null for the rule band. */
export function codeTint(ctx: Pick<Ctx, "system">, texts: ColorRole[]): number | null {
  if (vocabulary(ctx).opaque || ctx.system.opaque) return null;
  return tintAlpha(ctx.system, texts);
}
