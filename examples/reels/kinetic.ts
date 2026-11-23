// The Kinetic reel: one day, counted down to what is left of it. Every number is arithmetic:
// one day = 24 hours = 24 x 60 = 1,440 minutes = 1,440 x 60 = 86,400 seconds. Eight hours of sleep take
// 8 x 3,600 = 28,800 of them, and 86,400 - 28,800 = 57,600 are left: 57,600 / 3,600 = 16 hours awake.
//
// The words are the subject: display type cut on the beats of a four-on-the-floor house track, edge to edge.
// 1. Frame 0: ONE DAY. fills the frame. 24 HOURS. 1,440 MINUTES. IN SECONDS? One phrase a beat pair.
// 2. The reveal on the track's peak: the accent word SECONDS? grows until it becomes the ground, 86,400 lands on it,
//    and SECONDS. follows on the accent.
// 3. Back on the dark ground: SLEEP TAKES 28,800 OF THEM. THAT LEAVES 57,600 SECONDS. 16 HOURS AWAKE. EVERY DAY.
//    Then the film cuts to the ground on the bar.
// No pictures and no effects: Kinetic's cuts land on the kick, and the music carries them.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { musicFrom } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";

export const system = "kinetic";
export const seconds = 11.4;

const TRACK = "kinetic-music-3";
// The structure: the reveal's place in the film. Every other time is a beat of the track from there.
const REVEAL_PLAN = 3.47;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const out: Node[] = [];
  const from = musicFrom({ media: TRACK, peakAt: REVEAL_PLAN, until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  // The beats of the track in film time. A phrase changes on every second beat (a beat pair), so nothing holds
  // longer than Kinetic allows.
  const k0 = g.beats.findIndex((t) => t >= REVEAL_PLAN - 0.02);
  const b = (k: number) => g.beats[k0 + k]!;
  const REVEAL = b(0);
  out.push(...B.reveal({ at: REVEAL }, ctx));
  const box = { x: S.left, y: S.top, w: S.right - S.left, h: S.bottom - S.top };
  const pop = (text: string, at: number, accent: string | null = null) => ({ text, at, accent, motion: "pop" as const });

  // 1. The count up to the day, on the dark ground. The first phrase is at rest on frame 0.
  out.push(...B.kineticWords({ id: "day", ...box, until: REVEAL, phrases: [
    pop("One\nday.", 0, "day."), pop("24\nhours.", b(-6)), pop("1,440\nminutes.", b(-4)), { text: "In\nseconds?", at: b(-2), accent: "seconds?", motion: "pop", exit: "toGround", groundUntil: b(4) },
  ] }, ctx));

  // 2. The reveal on the track's peak: SECONDS? grows into the accent ground (exit "toGround"), 86,400 lands on it,
  //    and SECONDS. follows on the accent.
  const BACK = b(4);
  out.push(...B.kineticWords({ id: "secs", ...box, onAccent: true, until: BACK, phrases: [{ text: "86,400", at: REVEAL, accent: null, motion: "pop", reveal: true, size: "fit" }, pop("Seconds.", b(2))] }, ctx));

  // 3. Back on the dark ground: what sleep takes, and what is left. The film cuts to the ground on the bar.
  const END = b(16);
  out.push(...B.kineticWords({ id: "rest", ...box, until: END, phrases: [
    pop("Sleep\ntakes", BACK), pop("28,800\nof them.", b(6), "28,800"), pop("That\nleaves", b(8)), pop("57,600\nseconds.", b(10), "57,600"),
    pop("16 hours\nawake.", b(12), "awake."), pop("Every\nday.", b(14), "day."),
  ] }, ctx));

  // Sound: the track's peak on the reveal. No effects.
  out.push(...B.music({ media: TRACK, peakAt: REVEAL_PLAN, at: 0, until: seconds }, ctx));
  return out;
};
