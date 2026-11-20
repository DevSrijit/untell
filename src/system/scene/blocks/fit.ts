// Fit: what a block does when its text does not fit its box in the role it was given. One policy for every block
// that can change the size of its type (title, quote, lockup, bigStat, bar's value, terminal's result).
//
// Rules:
// - "shrink": the block sets the text in the next smaller role that fits, and it says so (a console warning that
//   names both roles). `untell check` prints a block's warnings with the film's other messages.
// - "wrap": the block keeps the role and uses more lines, where its text can take more lines (title, quote).
//   A block whose text is one line (bar's value, bigStat's number, terminal's result, lockup's name) cannot wrap:
//   for it, "wrap" is "throw".
// - "throw": the block stops with an error that names the text, the role and what to change.
// - The default is the system's (scene/vocabulary.ts `fit`): "shrink" in every system today.
// - A block never changes the size of type in silence.
import type { TypeRole } from "../../systems";
import type { Ctx } from "../types";
import { vocabulary, type FitPolicy } from "../vocabulary";

export type { FitPolicy };

/** The fit policy of a block: the scene's, else the system's. */
export const fitOf = (ctx: Pick<Ctx, "system">, fit?: FitPolicy): FitPolicy => fit ?? vocabulary(ctx).fit;

/**
 * Reports a role change: a warning with "shrink", an error with "throw" (and with "wrap" when the block cannot
 * wrap). Does nothing when `used` is `asked`.
 */
export function steppedDown(where: string, text: string, asked: TypeRole, used: TypeRole, fit: FitPolicy, canWrap = false): void {
  if (asked === used) return;
  const said = text.length > 48 ? `${text.slice(0, 45)}...` : text;
  if (fit === "throw" || (fit === "wrap" && !canWrap))
    throw new Error(`${where}: "${said}" does not fit in the ${asked} role. Shorten the text, give the block more room, or set fit: "shrink" to let it step down a role.`);
  console.warn(`${where}: "${said}" does not fit in the ${asked} role, so it is set in ${used}. Shorten the text or give the block more room; fit: "throw" stops here instead.`);
}
