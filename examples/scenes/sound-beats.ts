// The sound helpers in one scene. A command types with one key tick a character (typing), its answer lands on
// the track's drop (music peakAt), and a hit lands on the frame the answer is fully revealed (hit on).
// Fact: 2^10 = 1,024. The cut times come from the beat grid of the part of the track that plays.
// The ten doublings are drawn: eleven columns, 2^0 to 2^10, one on each beat from the first beat after 1 s, the last
// (1,024) on the drop with the hit. At 9:16 they stand in the lower band, where marks may go; at 16:9 at the right.
// (barChart was tried: it labels every bar, and eleven labels would bury the one number this film is about; these
// are unlabelled marks that the note "Ten doublings of one" names.)
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";
import { musicFrom, typing } from "../../src/system/scene/blocks/sound";
import { overflow } from "../../src/system/scene/blocks/text";
import { pictureSafe } from "../../src/system/scene/blocks/sheet";
import { go } from "../../src/system/scene/context";

// 8.5 s: the hit's tail (about 4.15 s from the answer at about 4 s) ends inside the film.
export const seconds = 8.5;
const TRACK = "spec-music-7";

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, w = S.right - S.left;
  // The answer lands on the drop (or the loudest bar) at about 4 s; everything else snaps to its grid.
  const g = beats(TRACK, { from: musicFrom({ media: TRACK, peakAt: 4, until: seconds }), until: seconds });
  const answer = g.drops[0]?.t ?? g.onBar(4);
  const typed = B.typeOn({ id: "cmd", text: "$ echo $((2**10))", pace: "human", role: "body", color: "ink", cursor: true,
    cursorUntil: answer, x, y: S.top + overflow(ctx, "body").top, at: 0 }, ctx);
  const title = B.title({ id: "answer", text: "1,024", x, y: S.top + ctx.lineHeight("body") * 2, w, maxLines: 1, at: answer }, ctx);
  // The columns: on the beats before the answer, the last on the answer itself.
  const P = pictureSafe(ctx), tall = ctx.height > ctx.width;
  const area = tall ? { x: P.x, y: S.bottom + Math.round(ctx.size("label")), w: P.w, h: P.y + P.h - S.bottom - Math.round(ctx.size("label")) }
    : { x: S.left + (S.right - S.left) * 0.5, y: S.top, w: (S.right - S.left) * 0.5, h: S.bottom - S.top };
  const grid = g.beats.filter((t) => t >= 1 && t < answer - 0.05);
  const times = [...grid.slice(Math.max(0, grid.length - 10)), answer];
  while (times.length < 11) times.unshift(Math.max(0.4, times[0]! - 0.25));
  const slot = area.w / 11, bw = Math.round(slot * 0.72), foot = area.y + area.h;
  const cols: Node[] = times.map((t, k) => {
    const h = Math.max(3, Math.round((2 ** k / 1024) * area.h)), x = Math.round(area.x + slot * k + (slot - bw) / 2);
    return { id: `dbl-${k}`, kind: "rect" as const, x, y: foot - h, w: bw, h, fill: k === 10 ? "series1" as const : "series3" as const, group: "dbl",
      origin: [0.5, 1] as [number, number], tracks: { opacity: [{ t: 0, v: 0 }, ...go(ctx, t, 0, 1, "step")], scaleY: go(ctx, t, 0, 1, ctx.noOvershoot("enter")) } };
  });
  return [
    ...cols,
    ...typed,
    ...title,
    ...B.text({ id: "note", text: "Ten doublings of one", role: "label", color: "inkMuted", x, y: S.top + ctx.lineHeight("body") * 2 + ctx.lineHeight("display") * 1.2, at: g.onBeat(answer + 1) }, ctx),
    ...B.hold({ at: answer + 1.5, until: seconds }, ctx),
    ...B.music({ media: TRACK, peakAt: 4, until: seconds, fadeOut: 1 }, ctx),
    // A tick on every 5th key: three ticks for fifteen keys, inside Studio's budget of 3 effects in 10 s.
    ...typing({ id: "key", media: "spec-tick", nodes: typed, of: "cmd", volume: 0.4, every: 5 }, ctx),
    ...B.hit({ id: "land", media: "sfx-boom", on: { nodes: title, id: "answer" }, volume: 0.6 }, ctx),
  ];
};
