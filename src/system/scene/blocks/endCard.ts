// EndCard: how a film ends. The name, one line, and a held finish that lands on a beat. Use it as the last
// block of every film, so no film just stops.
//
// Rules this block enforces:
// - It lands at `at`: the name is fully readable on that frame (put `at` on a beat or on the track's last
//   strong onset). The entrance starts one enter duration before, so it is complete when the beat hits.
// - The finish holds from `at` to `until` (the film's end), at least 1.5 s; a shorter hold warns. A hold
//   of more than 3 s is marked deliberate for the HyperFrames check (a `hold` node).
// - Its form follows the system:
//   - a system whose `bleed` lists display (Kinetic, Courtside): the name fills the safe width (fitText),
//     with the line under it;
//   - every other system: a lockup (mark, name, line), centred, on one axis ("column" by default).
//   The entrance comes from `enter` (or its old name `reveal`), else the system's vocabulary: a fade in Ma and Nocturne, a cut in the one-frame
//   and opaque systems, a fade elsewhere. It never leaves: the film ends on it.
// - `place` puts the name in the upper third of its box by default, so the default card leaves no empty upper frame.
// - Every text line passes the text-safe area. The scene clears the card's place before it starts to enter,
//   `endCardLead(ctx)` seconds before `at`, so no text cross-fades over it.
// - It names the landing: anchor `<id>-land` (its box, `at` = the landing time), for a hit on the beat.
// - The system's end look (Direction `ends.look`) sets the name's role, the line's role, where the unit sits, and the
//   size of a real mark: a prepared picture or cut-out (`mark: { media }`) or a product model (`mark: { objects }`)
//   takes `look.mark` of the frame's height, so the end fills the frame the way the system's last frame should (Studio:
//   the product large on its shadow, the name in display; Keynote: the subject small and centred, the name in headline).
//   No second product block is needed to end on the product.
// - With a music bed, give `on: beats(...)`: `at` moves to the nearest bar, and the block says so when it moves.
import { FPS, frameOf, windows } from "../context";
import { revealedAt } from "../beats";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Node } from "../types";
import { vocabulary } from "../vocabulary";
import { fitLayout, fitText } from "./fitText";
import { lockup, lockupLayout, type Mark } from "./lockup";
import { DIRECTION, type EndLook } from "../../direction";
import type { TypeRole } from "../../systems";

/** The end look of a system that states none: the card as it was (headline name, a small shape, the upper third). */
const PLAIN: EndLook = { name: "headline", line: "body", mark: 0.2, axis: "column", place: "upper" };
import { text } from "./text";

export type EndCardProps = {
  id?: string;
  /** The name of the subject: the product, the film, the studio. */
  name: string;
  /** One line: what it is, or the offer. */
  line?: string;
  /** A shape, none, a prepared picture or cut-out (`{ media }`), or a product model (`{ objects }`). Default: a circle. */
  mark?: Mark;
  /** The name's role. Default: the system's end look (Direction `ends.look.name`). */
  role?: TypeRole;
  /** The name on two lines: 2 breaks it at the most even word gap (the lockup's `lines`). Default: one line. */
  lines?: 1 | 2;
  /** The height of the mark's box in px (the lockup's `markSize`), not of the object in it: a picture or a model fits
   *  inside the box at its own aspect, so a wide object fills the box's width first and draws lower than the box (a
   *  chair at 0.6 of the frame's height can draw at about 0.42). Default: the system's end look for a real mark; else small. */
  markSize?: number;
  /** Default: the system's end look; a row turns to a column where a large mark cannot sit beside the name. */
  axis?: "row" | "column";
  /** The box. Default: the text-safe area. */
  box?: { x: number; y: number; w: number; h: number };
  color?: ColorRole;
  /** The time the card lands (fully readable), seconds. Put it on a beat, or give `on`. */
  at: number;
  /** The film's beat grid (`beats(...)`): `at` moves to the nearest bar (a build note says so when it moves). */
  on?: { onBar: (t: number) => number };
  /** The id of a text block that holds this place before: it leaves on the frame the card starts (handover.ts). */
  replaces?: string;
  /** The film's end. Default: at + 2 s. */
  until?: number;
  /** How it comes on: "fade", "cut" or "rise" (a fade and a small rise). Default: the system's vocabulary (a cut in a one-frame or opaque system). */
  enter?: "fade" | "cut" | "rise";
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: "fade" | "cut" | "rise";
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /**
   * Where the name sits in the box: "upper" (its top third, so the upper frame is not left empty), "middle" or "lower"
   * (over a picture's calm low band, for example). Default: the system's end look.
   */
  place?: "upper" | "middle" | "lower";
};

/**
 * How long before `at` the end card starts to enter: its enter duration, or 0 where it cuts. Clear its place by then.
 * Give the card's own `enter` when the scene sets one: a card that cuts on (`enter: "cut"`) has no lead, so the scene
 * keeps its words to `at` (before, the scene cleared them one enter duration early and the drop showed no text).
 */
export function endCardLead(ctx: Ctx, enter?: EndCardProps["enter"]): number {
  if (enter === "cut") return 0;
  if (enter) return ctx.instant ? 0 : ctx.dur.enter;
  const voc = vocabulary(ctx);
  return ctx.instant || voc.opaque || voc.text === "cut" ? 0 : ctx.dur.enter;
}

export const endCard: Block<EndCardProps> = (p0, ctx) => {
  const id = p0.id ?? "endCard";
  // On the beat grid: the landing moves to the nearest bar.
  let p = p0;
  if (p0.on) {
    const bar = p0.on.onBar(p0.at);
    if (Math.abs(bar - p0.at) > 1 / 60) console.warn(`endCard ${id}: at ${p0.at.toFixed(2)} s moved to the bar at ${bar.toFixed(2)} s (on).`);
    p = { ...p0, at: bar, ...(p0.until !== undefined ? { until: Math.max(p0.until, bar + 1.5) } : {}) };
  }
  const look = DIRECTION[ctx.system.id]?.ends.look ?? PLAIN;
  const S = ctx.safe;
  const box = p.box ?? { x: S.left, y: S.top, w: S.right - S.left, h: S.bottom - S.top };
  const until = p.until ?? p.at + 2;
  if (until - p.at < 1.5 - 1e-6) console.warn(`endCard ${id}: the finish holds ${(until - p.at).toFixed(2)} s; hold it at least 1.5 s`);
  // `enter` is the public name; `reveal` is its old name (the guard gives the old name, a direct call can give either).
  const enter = p.enter ?? p.reveal;
  const lead = endCardLead(ctx, enter);
  const cut = lead === 0;
  const how = cut ? "cut" : enter === "rise" ? "rise" : "fade";
  const place = p.place ?? look.place;
  // The card lands at `at`: its last visible change is on frameOf(at), as the docs say. An eased entrance of `lead` s
  // comes to rest a few frames before its end (the last frames change too little to see): before, a Keynote card was
  // at rest 3 frames before `at`, and the ending check judged a hold the scene did not plan. The entrance moves later
  // by that much, so the frame of rest is the landing frame.
  const target = frameOf(p.at) / FPS;
  const first = build(Math.max(0, p.at - lead));
  const rest = revealedAt(ctx.system, first.out, id);
  const { out, land } = rest < target - 1e-6 && p.at - lead > 0 ? build(Math.max(0, p.at - lead) + (target - rest)) : first;
  out.push({ id: `${id}-land`, kind: "anchor", ...land, at: p.at });
  if (until - p.at > 3) out.push({ id: `${id}-hold`, kind: "hold", tracks: { opacity: windows([[p.at, undefined]]) } });
  return out;

  function build(start: number) {
  const out: Node[] = [];
  let land: { x: number; y: number; w: number; h: number };
  if (ctx.system.bleed?.includes("display")) {
    // The name fills the safe width; the line sits under it. The slab is tall enough that a short name (one word of
    // seven letters in a condensed display face) reaches the full width: before, at 40 % of the box, its height
    // stopped the name at about 60 % of the width.
    const lineH = p.line ? ctx.lineHeight("body") * 1.6 : 0;
    const top = { upper: 0.06, middle: 0.22, lower: 0.4 }[place];
    const slab = { x: box.x, y: box.y + box.h * top, w: box.w, h: box.h * 0.55 - lineH };
    const fit = fitLayout(ctx, { id, text: p.name, ...slab, role: "display" });
    const nameBottom = fit.lines[0]!.y + fit.lineHeight;
    out.push(...fitText({ id: `${id}-name`, text: p.name, ...slab, role: "display", color: p.color, reveal: how === "rise" ? "fade" : how, at: start }, ctx));
    if (p.line) out.push(...text({ id: `${id}-line`, text: p.line, role: "body", color: "inkMuted", x: box.x, y: nameBottom + ctx.lineHeight("body") * 0.4, w: box.w, reveal: how, at: start }, ctx));
    land = { x: fit.lines[0]!.x, y: fit.lines[0]!.y, w: fit.lines[0]!.w, h: fit.lineHeight };
  } else {
    // A picture or a model takes the look's size. A shape given by the scene takes it too in a system that ends on a
    // lockup (Mark, Pop, Cutout, Keynote, Matte: the mark is the end's subject); elsewhere a shape stays small. A card
    // with no mark given keeps the small circle and the column, as before.
    const kind = DIRECTION[ctx.system.id]?.ends.kind;
    const big = typeof p.mark === "object" || (typeof p.mark === "string" && p.mark !== "none" && kind === "lockup");
    const rich = big || (p.markSize !== undefined && p.mark !== "none");
    const base = { id, name: p.name, line: p.line, mark: p.mark, lines: p.lines, axis: p.axis ?? (p.mark === undefined ? "column" : look.axis), x: box.x, w: box.w, role: p.role ?? look.name, lineRole: look.line, color: p.color,
      ...(p.markSize !== undefined ? { markSize: p.markSize } : big ? { markSize: Math.round(look.mark * ctx.height * (typeof p.mark === "string" ? 0.6 : 1)) } : {}) };
    // The unit's place: a plain card in a band of the box (as before); a card with a real mark is centred on the
    // box's optical centre ("middle"), or held to its top or foot.
    const plain = { upper: 0.06, middle: 0.25, lower: 0.45 }[place];
    const unit = lockupLayout(ctx, { ...base, y: box.y });
    const lp = rich
      // The unit's foot stays a third of a body line inside the box, so the glyphs past the last line box keep text-safe.
      ? { ...base, y: Math.round(Math.max(box.y, Math.min(box.y + box.h - unit.height - ctx.lineHeight("body") * 0.34,
          place === "upper" ? box.y : place === "lower" ? box.y + box.h : box.y + (box.h - unit.height) * 0.46))) }
      : { ...base, y: box.y + box.h * plain, h: box.h * 0.5 };
    const L = lockupLayout(ctx, lp);
    out.push(...lockup({ ...lp, at: start, ...(enter ? { reveal: how === "cut" ? "cut" : "fade" } : {}) }, ctx));
    land = L.name;
  }
  return { out, land };
  }
};
