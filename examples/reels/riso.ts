// The Riso reel: the poster for the Zedebe Academy Print Fair prints itself, ink by ink (the name is a random draw;
// the fair is fictional). 14 March 2026 is a Saturday.
//
// The name is on the paper on frame 0, in the pink ink, large. Two pictures print under it, each in two passes, one ink
// on each beat (photo `passes`: the halftone separations that prepare writes, overprinted, a few px off register):
// 1. 0 to 5.6 s. A press feeds a printed sheet (riso-press). The teal pass, then the pink pass, then a pink sun stamps
//    on the bar. The facts type on.
// 2. 5.6 s, the track's drop: the sheet sets again as a poster: the name in headline at the top, "Bring your own
//    paper." in display, the facts, and the hands that ink a brayer (riso-brayer-hands) at the foot, printing in two
//    passes on the beats.
// 3. On the strongest onset after the facts: a pink bar stamps under "Free entry", the last ink, and the finished
//    sheet holds.
// Both pictures are drawn at 1.1x or less: the press in a tall window, the hands in a wide one.
// Sound: the bed's drop on the cut to the hands; a dull stamp as each ink layer prints (four in the film, the
// system's limit); the registration marks stamp on a strong onset of the track itself, with no sound of their own.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { musicFrom, overflow } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";

export const system = "riso";
export const seconds = 11;

const TRACK = "riso-music-2";
/** The reveal: the cut to the second print lands on the track's drop. */
const DROP = 5.6;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, w = S.right - S.left;
  const from = musicFrom({ media: TRACK, peakAt: DROP, until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  const BEAT = (g.beats[1] ?? 0.7) - (g.beats[0] ?? 0);
  const CUT = g.onBar(DROP), SUN = g.onBar(CUT - 2.8);
  /** The last ink stamps on the strongest onset after the facts have printed; the sheet holds from there. */
  const LAST = g.strongest(CUT + 2.6, seconds - 1.6)?.t ?? g.onBar(CUT + 2.8);
  /** The first pass prints on the first beat after 0.3 s, so the sheet moves in the first second. */
  const FIRST = g.beats.find((b) => b >= 0.3) ?? 0.5;
  /** The academy's name stamps a beat after the sun, so the press shot never holds still. */
  const KICK = g.onBeat(SUN + 0.7);
  /** The registration marks stamp on the strongest onset between the academy's name and the cut. */
  const REG = g.strongest(KICK + 0.5, CUT - 0.3)?.t ?? g.onBeat(KICK + 1.4);
  const out: Node[] = [];

  // The name, in the pink ink, on the paper band at the top, at rest on frame 0.
  const nameP = { id: "name", text: ["Print", "Fair"], x: S.left, y: S.top + overflow(ctx, "display").top, w, role: "display" as const, color: "accentText" as const, maxLines: 2 };
  const nameBox = B.measure("title", { ...nameP, at: -1 }, ctx);
  out.push(...B.title({ ...nameP, exit: "cut", at: -1, until: CUT }, ctx));
  const gap = Math.round(ctx.lineHeight("body") * 0.6);

  // 1. The press, in a tall window under the band (853 x 1280 drawn at 1.1x), printing in two passes from the first beat.
  const pw = Math.round(853 * 1.1), px = Math.round((ctx.width - pw) / 2);
  const pressBox = { x: px, y: Math.round(nameBox.y + nameBox.h + gap), w: pw, h: 0 };
  pressBox.h = Math.round(Math.min(1280 * 1.1, ctx.height - px - pressBox.y));
  const press = B.photo({ id: "press", media: "riso-press", box: pressBox, motion: "still", passes: { beat: BEAT }, at: FIRST, until: CUT }, ctx);
  out.push(...press);
  // A pink sun stamps on the bar over the window's top right, as a second pink pass.
  const r = Math.round(ctx.width * 0.2);
  const sun = B.shape({ id: "sun", kind: "circle", x: ctx.width - Math.round(r * 1.4), y: pressBox.y - Math.round(r * 0.5), w: 2 * r, h: 2 * r, fill: "accent", enter: "cut", at: SUN, until: CUT }, ctx);
  out.push(...sun);
  // The academy, in the ink, beside the short second line of the name. It is set a frame before its beat, so it prints on
  // the 12 fps step of the beat itself (a change at the beat shows on the next step, 2 to 3 frames late, past the
  // beat's accent).
  const kick = B.text({ id: "kick", text: "Zedebe Academy", role: "label", color: "ink", x: S.left + Math.round(w * 0.45), y: Math.round(nameBox.y + ctx.lineHeight("display") * 1.35), w: Math.round(w * 0.55), exit: "cut", at: KICK - 1 / 30, until: CUT }, ctx);
  out.push(...kick);

  // 2. The cut on the drop: the hands at the foot of the sheet (1280 x 853 drawn at 0.73x), the line over them.
  const hw = pw, hh = Math.round((hw * 853) / 1280);
  const handsBox = { x: px, y: Math.round(ctx.height - px - hh), w: hw, h: hh };
  const hands = B.photo({ id: "hands", media: "riso-brayer-hands", box: handsBox, motion: "still", passes: { beat: BEAT }, at: CUT }, ctx);
  out.push(...hands);
  // On the cut the sheet sets again as a poster: the fair's name in the pink ink in headline at the top, and the
  // drop's message in display, the largest type of the sheet.
  const name2P = { id: "name2", text: "Print Fair", x: S.left, y: S.top + overflow(ctx, "headline").top, w, role: "headline" as const, color: "accentText" as const, maxLines: 1, replaces: "name" };
  const name2Box = B.measure("title", { ...name2P, at: CUT }, ctx);
  out.push(...B.title({ ...name2P, enter: "cut", at: CUT }, ctx));
  const lineY = Math.round(name2Box.y + name2Box.h + gap);
  const lineP = { id: "line", text: ["Bring", "your own", "paper."], x: S.left, y: lineY, w, role: "display" as const, maxLines: 3, replaces: "name" };
  const lineBox = B.measure("title", { ...lineP, at: CUT }, ctx);
  out.push(...B.title({ ...lineP, enter: "cut", at: CUT }, ctx));

  // The facts, in the ink, one row each under the line; they end by the low band's text-safe edge.
  const factsY = Math.round(lineBox.y + lineBox.h + gap);
  const factW = S.lowBandRight - S.left, lhL = ctx.lineHeight("label");
  const facts = ["Saturday 14 March, 10:00-16:00", "Zedebe Academy, Art hall", "Free entry"];
  facts.forEach((text, k) => out.push(...B.text({ id: `fact${k}`, text, x: S.left, y: factsY + k * lhL, w: factW, role: "label", color: "ink", at: g.onBeat(CUT + BEAT * (2 + k)) }, ctx)));

  // 3. The last ink: a pink bar stamps under "Free entry" on the bar, and the sheet holds.
  const freeW = Math.round(ctx.measure("FREE ENTRY", "label"));
  const mark = B.shape({ id: "mark", kind: "rect", x: S.left, y: Math.round(factsY + 3 * lhL), w: freeW, h: Math.max(6, Math.round(lhL * 0.15)), fill: "accent", enter: "cut", at: LAST }, ctx);
  out.push(...mark);
  // Registration marks stamp at the sheet's four corners on a strong onset, in the pink ink, and stay.
  const m = Math.round(px / 2);
  [[m, m], [ctx.width - m, m], [m, ctx.height - m], [ctx.width - m, ctx.height - m]].forEach(([x, y], i) =>
    out.push(...B.cross({ id: `reg${i}`, x: x!, y: y!, color: "accent", at: REG }, ctx)));
  out.push(...B.reveal({ at: CUT }, ctx));
  out.push(...B.hold({ at: LAST, until: seconds }, ctx));

  // Sound: the drop on the cut; a stamp as each ink layer prints: the press's first pass, the sun, the hands' first
  // pass on the drop, the last ink.
  const bed = B.music({ media: TRACK, peakAt: DROP, until: seconds }, ctx);
  out.push(...bed);
  // Riso moves at 12 frames a second, so a print shows on the next 12 fps step after its time; each stamp waits for
  // that step. (hit `on` reads the node's own track, which does not know the stepping.)
  const step12 = (t: number) => Math.ceil(t * 12 + 1e-6) / 12;
  const stamps = [FIRST, SUN, CUT, LAST];
  // Riso stamps again on each strong onset through a hold (its mix): the strong onsets that no stamp sits on yet.
  for (const o of g.onsets) if (o.strength >= 0.9 && o.t > 0.3 && o.t < seconds - 0.5 && stamps.every((t) => Math.abs(step12(t) - o.t) > 0.3)) stamps.push(o.t);
  stamps.forEach((t, i) => out.push(...B.hit({ id: `stamp${i}`, media: "riso-stamp", at: step12(t), bed }, ctx)));
  return out;
};
