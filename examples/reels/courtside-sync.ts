// Courtside, re-timed by its music: the same tryout reel as courtside.ts, with every sync time taken from the
// track's map (src/system/music.gen.ts) through the beat helpers, and no sync number set by hand.
//
// What changed against courtside.ts, and why:
// - The drop. courtside.ts entered the track at 27.505 s by hand, so the drop landed at 4.51 s, 10 frames after
//   the volt panel covered the frame. Here the panel's full-cover frame is read from the wipe's own plan
//   (wipeTimes), and music({ peakAt }) picks the entry so the drop lands on that frame.
// - The word cuts. EVERY and INCH. keep their places (one word a beat pair) and snap to the nearest beat of the
//   grid in film time (beats().onBeat). 6 AM. and MONDAY. land on the strongest onset of their stretch of the
//   drop (beats().strongest), so the busiest picture goes on the busiest music.
// - The end card. It cuts on the strongest onset between 8 s and 10 s, on a beat, with the boom on the cut.
// - The level. music() has no volume: it gets the gain that brings the bed to the system's mix target.
// The structure numbers that stay (0, 1, 2, 4, 4.5 and 6 s, the 8-10 s window) say where a part goes, not where
// a beat is. The words, the photo plan and the end card are as in courtside.ts.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { placeBehind } from "../../src/system/scene/cover";
import { beats } from "../../src/system/scene/beats";
import { musicFrom, wipeTimes } from "../../src/system/scene/blocks";

export const system = "courtside";
export const seconds = 12;

const TRACK = "m-sparta";
const CUT = 4;

/** The sync plan: when the panel covers the frame, where the track enters, the beat grid and the cut times. */
function syncPlan(ctx: Ctx, B: typeof BLOCKS) {
  const cover = wipeTimes(ctx, { id: "volt", at: CUT, direction: "up" }).covered;
  const from = musicFrom({ media: TRACK, peakAt: cover, until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  // A word or a cut in a window goes on that window's strongest onset, snapped to its beat.
  const accent = (a: number, b: number) => g.onBeat(g.strongest(a, b)?.t ?? a);
  return { cover, from, g, accent, end: accent(8, 10), at: (t: number) => (t <= 0 ? 0 : g.onBeat(t)) };
}

function build(ctx: Ctx, B: typeof BLOCKS, media: boolean): Node[] {
  const s = ctx.safe;
  const out: Node[] = [];
  const P = syncPlan(ctx, B);
  const END = P.end;

  // The photo, framed low: the plate fills a box from `top` to the bottom of the frame, and its top eases
  // into the black ground (fade: "top"), so the photo has no edge. The space above holds the type.
  // The photo nodes are built in both versions: the code-only version sets its type where the photo
  // version does, so the two differ only by the photo.
  const photoAt = (top: number) => {
    const box = { x: 0, y: top, w: ctx.width, h: ctx.height - top };
    return [
      ...B.photo({ id: "plate", media: "athlete-back", box, fade: "top", motion: "push", amount: 0.1, seconds: END, at: 0, until: CUT + 0.5 }, ctx),
      ...B.photo({ id: "player", media: "athlete-back", box, plate: false, over: true, motion: "push", amount: 0.1, seconds: END, at: 0, until: END }, ctx),
    ];
  };

  // Parts 1 and 2: one word a beat pair, set behind the player's head so that every letter still reads.
  // placeBehind tries bands of the safe area at several heights for each word, for each framing of the
  // photo, and the scene keeps the framing whose smallest word is largest. Part 2 sits on the volt panel.
  const words = [
    { id: "earn", text: "Earn", at: 0, until: P.at(1), accent: null as string | null, volt: false },
    { id: "every", text: "Every", at: P.at(1), until: P.at(2), accent: null, volt: false },
    { id: "inch", text: "Inch.", at: P.at(2), until: CUT, accent: "Inch.", volt: false },
    { id: "sixam", text: "6 AM.", at: P.accent(CUT + 0.4, CUT + 2), until: P.accent(CUT + 2, END - 0.5), accent: null, volt: true },
    { id: "monday", text: "Monday.", at: P.accent(CUT + 2, END - 0.5), until: END, accent: null, volt: true },
  ];
  const bands: { x: number; y: number; w: number; h: number }[] = [];
  for (const h of [260, 320, 380, 440]) for (let y = s.top + 1; y + h <= s.bottom - 1; y += 20) bands.push({ x: s.left, y, w: s.right - s.left, h });
  const makeWord = (w: (typeof words)[number], box: (typeof bands)[number]) => B.kineticWords({ id: w.id, ...box, until: w.until,
    onAccent: w.volt, phrases: [{ text: w.text, at: w.at, accent: w.accent, motion: "pop" }] }, ctx);
  let plan: { top: number; picks: (typeof bands)[number][]; size: number } | null = null;
  for (const top of [300, 380, 460, 540, 620]) {
    const photo = photoAt(top);
    const picks = words.map((w) => placeBehind(ctx, photo, bands, (b) => makeWord(w, b), { from: w.at + 0.25, to: w.until - 0.05, quiet: true }));
    if (picks.some((p) => !p.ok)) continue;
    const size = Math.min(...picks.map((p) => p.inkHeight));
    if (!plan || size > plan.size) plan = { top, picks: picks.map((p) => p.pick), size };
  }
  if (!plan) throw new Error("courtside: no framing of the photo leaves every word readable");
  if (media) out.push(...photoAt(plan.top));
  words.forEach((w, i) => out.push(...makeWord(w, plan!.picks[i]!)));

  // The volt panel slides up in the backdrop layer, and the volt ground stays from its full cover until the cut to
  // the end card on the beat.
  // untell-ignore scene/duplicate-id: syncPlan builds the same wipe once more only to measure when it covers the frame
  out.push(...B.wipe({ id: "volt", at: CUT, direction: "up", layer: -1 }, ctx));
  out.push(...B.ground({ color: "accent", at: P.cover, until: END, enter: "cut", exit: "cut" }, ctx));

  // The end card: the team, then the call, on the black ground. With media, the hoop footage fills the
  // frame below the type, its top eased into the ground, so no text sits on the footage.
  const card = { x: s.left, y: s.top + 1, w: s.right - s.left, h: 380 };
  const lines = { y: card.y + card.h + 30 };
  out.push(...B.kineticWords({ id: "team", ...card, maxLines: 2, phrases: [{ text: "Vondourt Academy", at: END, accent: "Academy", motion: "roll" }] }, ctx));
  out.push(...B.text({ id: "tryouts", x: s.left, y: lines.y, w: s.right - s.left, text: ["Girls' basketball", "Tryouts Monday 6 AM, main gym"], role: "label", color: "inkMuted", stagger: true, at: END + 0.6 }, ctx));
  if (media) {
    const top = lines.y + 2 * ctx.lineHeight("label") + 40;
    out.push(...B.photo({ id: "hoop", media: "hoop-net", box: { x: 0, y: top, w: ctx.width, h: ctx.height - top }, fade: "top", clipStart: 2,
      motion: "push", amount: 0.04, at: END, until: seconds }, ctx));
  } else {
    out.push(...B.hold({ at: END + 1.2, until: seconds }, ctx));
  }

  // Sound (media version). The track enters where its drop lands on the panel's full-cover frame; its level
  // comes from the system's mix target. A whoosh on the panel's fastest frame, a boom on the cut to the end card.
  if (media) {
    // The bed: the hits set their level against it (hit `bed`), as the sound block asks.
    const bed = B.music({ media: TRACK, peakAt: P.cover, at: 0, until: seconds, fadeOut: 1 }, ctx);
    out.push(...bed);
    out.push(...B.hit({ id: "whoosh", media: "sfx-whoosh", at: CUT + 0.1, bed }, ctx));
    out.push(...B.hit({ id: "boom", media: "sfx-boom", at: END, volume: 1 }, ctx));
  }
  return out;
}

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => build(ctx, B, true);
export const sceneCodeOnly = (ctx: Ctx, B: typeof BLOCKS): Node[] => build(ctx, B, false);
