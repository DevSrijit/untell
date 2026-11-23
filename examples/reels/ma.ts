// The Ma reel: the opening titles of "Quiet Hours", a short film by Kihari Rupa, presented by Nunavo (all
// fictional; the names are random draws). One real thing holds the whole sequence: the shadow of a palm frond that
// moves slowly on a pale wall (footage, ma-palm), in a large field of paper. The credits come one at a time, each in
// its own phrase of the piano, each fading in and out through the paper over the wall. The title comes on the
// piano's entrance, the director last; then the credit and the wall dissolve into the paper, and the paper holds
// under the last decay of the music.
//
// The footage is 2560 x 1440. A full 9:16 frame would draw it at 1.33x (soft), so the wall is a square plate in the
// middle of the paper at 0.45x: the paper is the field, the wall is the one image in it, and the lines sit on the
// paper over it.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { musicFrom } from "../../src/system/scene/blocks";
import { beats, frame, mapOf } from "../../src/system/scene/beats";

export const system = "ma";
export const seconds = 16.4;

const TRACK = "ma-music-3";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, w = S.right - S.left;
  // Ma enters the track at its start. The file opens on 0.4 s of silence before the first note, so the bed starts on
  // that note (the track's own start of sound), and the first frame is not silent.
  const first = beats(TRACK, { from: 0 }).onsets[0]?.t ?? 0;
  const from = musicFrom({ media: TRACK, align: { track: first, film: 0 }, until: seconds });
  const g = beats(TRACK, { from, until: seconds });

  // The wall: a square plate in the middle of the paper (the footage at 0.45x, sharp), the frond's shadow moving
  // across it from frame 0. Ma's field is the paper round it: about three quarters of the frame stays empty.
  const side = Math.round(ctx.width * 0.6);
  // The lines take a band over the wall (two body rows, or the title in display); the wall sits under it, so
  // every line stays above the low band, where centred text would pass the low band's text-safe edge.
  const band = Math.round(Math.max(ctx.lineHeight("body") * 2, ctx.lineHeight("display")) + ctx.lineHeight("body") * 1.2);
  // The pair (the line's band and the wall) centres on the optical centre of the frame (46 % down).
  const top = Math.round(Math.max(S.top, ctx.height * 0.46 - (band + side) / 2));
  const box = { x: Math.round((ctx.width - side) / 2), y: top + band, w: side, h: side };
  // Every entrance and exit in Ma is a slow fade through the paper; the end fades the wall out with the title.
  const END = seconds - 1;
  const wall = B.photo({ id: "wall", media: "ma-palm", box, motion: "still", rate: 0.6, exit: "dissolve", at: -1, until: END - ctx.dur.exit }, ctx);

  // One line at a time, on the paper over the wall, in two short rows broken where the sense breaks, centred.
  const lineY = top;
  const credit = (id: string, text: string[], at: number, until: number) =>
    B.title({ id, text, role: "body", align: "center", maxLines: 2, x: S.left, y: lineY, w, at, until }, ctx);

  // One line per phrase of the piano, each in its own silence of paper: the studio, the title on the piano's entrance
  // (the track's drop, at its measured rise in the sound: the map keeps it pinned where a render showed it), then the
  // director.
  const rise = mapOf(TRACK).drops.map((d) => (d.at ?? d.t) - from).find((t) => t > 2 && t < seconds - 6);
  const c1 = g.beats[0] ?? 0.05, c2 = frame(rise ?? g.drops[0]?.t ?? 5.5), t = g.onBeat(c2 + 5.0);
  const out: Node[] = [
    ...wall,
    ...credit("studio", ["Nunavo", "presents"], c1, c2 - ctx.dur.exit - 0.3),
    // The title, larger, in the same place, on the piano's entrance (the track's drop): the reveal.
    ...B.title({ id: "title", text: "Quiet Hours", role: "display", align: "center", maxLines: 1, x: S.left, y: lineY, w, at: c2, until: t - ctx.dur.exit - 0.3 }, ctx),
    ...B.reveal({ at: c2 }, ctx),
    // The director's credit last; it dissolves into the paper with the wall.
    ...credit("director", ["Film by", "Kihari Rupa"], t, END - ctx.dur.exit),
    // The paper holds at the end: a hold the system asks for.
    ...B.hold({ at: END, until: seconds }, ctx),
    // The bed: from its first note, fading with the last dissolve.
    ...B.music({ media: TRACK, align: { track: first, film: 0 }, until: seconds, fadeOut: 2 }, ctx),
  ];
  return out;
};
