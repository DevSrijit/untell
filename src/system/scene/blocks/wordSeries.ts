// WordSeries: words that replace each other in one place, at one cap height, one baseline and one left edge
// (or one centre). Use it for a beat-by-beat run of single words or short phrases (Kinetic, Courtside, Title):
// "Faster." "Lighter." "Quieter." Hand-built runs drift by a few px or change size from beat to beat; this
// block cannot.
//
// Rules this block enforces:
// - Every word is set in one role and one factor: the factor that fits the widest word in `w` (as fitText),
//   so a long word never shrinks alone and the type size never jumps between beats.
// - Each word shows from its own `at` until the next word's `at` (the last one until `until`), with a cut in
//   one frame: words replace each other, they never overlap. In a fading system (vocabulary text "fade") the
//   first word fades in and the last fades out; the changes between words stay cuts.
// - The text-safe rules of fitText apply to the widest word.
import type { ColorRole } from "../roles";
import type { TypeRole } from "../../systems";
import type { Block, Node } from "../types";
import { vocabulary } from "../vocabulary";
import { fitLayout } from "./fitText";
import { onOff } from "./shape";

export type WordSeriesProps = {
  id?: string;
  /** The words, each with the time it comes on, in time order. */
  words: { text: string; at: number; color?: ColorRole }[];
  /** The band the words share. `h` caps the size; default: the role's own size (factor 1 at most). */
  x: number; y: number; w: number; h?: number;
  role?: TypeRole;
  color?: ColorRole;
  align?: "left" | "center";
  keepCase?: boolean;
  /** When the last word leaves. */
  until?: number;
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};

export const wordSeries: Block<WordSeriesProps> = (p, ctx) => {
  const id = p.id ?? "wordSeries";
  if (!p.words.length) return [];
  const words = [...p.words].sort((a, b) => a.at - b.at);
  const role = p.role ?? "display";
  const widest = words.reduce((a, b) => (ctx.measure(b.text, role, { keepCase: p.keepCase }) > ctx.measure(a.text, role, { keepCase: p.keepCase }) ? b : a));
  const h = p.h ?? ctx.lineHeight(role) * 1.6;
  const fit = fitLayout(ctx, { id, text: widest.text, x: p.x, y: p.y, w: p.w, h, role, keepCase: p.keepCase, max: p.h === undefined ? 1 : undefined });
  const k = fit.k, y = fit.lines[0]!.y;
  const fade = !ctx.instant && vocabulary(ctx).text === "fade";
  return words.map((wd, i): Node => {
    const next = i + 1 < words.length ? words[i + 1]!.at : p.until;
    const lw = ctx.measure(wd.text, role, { keepCase: p.keepCase }) * k;
    const x = p.align === "center" ? p.x + (p.w - lw) / 2 : p.x;
    const opacity = onOff(ctx, wd.at, next, fade && i === 0 ? "fade" : "cut", fade && i === words.length - 1 ? "fade" : "cut");
    return { id: `${id}-${i}`, kind: "text", x, y, text: wd.text, role, color: wd.color ?? p.color ?? "ink", ...(p.keepCase ? { keepCase: true } : {}),
      origin: [0, 0], tracks: { opacity, ...(k !== 1 ? { scale: [{ t: 0, v: k }] } : {}) } };
  });
};
