// The Mark reel: the identity sting for Nozith, a maker of survey instruments (fictional; the name is a random draw).
// The mark is original geometry, kept as a file in the project's media (assets/media/nozith-mark/mark.svg, added as
// a mark) and drawn by the drawnMark block from the marks table:
// - the unit module: a quarter disc in ink, the square's lower-left part;
// - the base: a slab in ink, one gutter under the square;
// - the cut: the square's upper-right corner in the accent, one gutter outside the quarter circle.
// "One square, cut once": a square cut by one arc, the two parts a gutter apart, on a base.
//
// The film runs on the music: the grid and each draw start on beats of beats(); the corner's fill and the lockup land
// on strong onsets (the track's beat grid is low trust, and its first strong onset comes at 4.5 s), the base's fill on
// a beat before them; the mark locks up with its name on the drop.
// 1. Frame 0: the quarter disc, large and centred, on the frame grid and its own cell lines, with the line over it.
// 2. The base draws on by its outline, then fills with a pop.
// 3. The construction arc draws in the rule colour; the corner draws on in the accent along it, then fills with a pop.
// 4. The drop: the mark moves into one lockup with the name and what it is, with the system's one impact. The grid
//    and the construction go. The lockup holds to the end.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lineAndSubject, markAspect, musicFrom } from "../../src/system/scene/blocks";
import { MARKS } from "../../src/system/marks.gen";
import { beats } from "../../src/system/scene/beats";

const TRACK = "mark-music-117";
const MARK = "nozith-mark";
/** The mark locks up on the track's drop. */
const DROP = 6.2;
export const system = "mark";
export const seconds = 9.4;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = ctx.width;
  const from = musicFrom({ media: TRACK, peakAt: DROP, until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  const at = (k: number) => g.beats.find((b) => b >= k) ?? k;
  const onCutAfter = (k: number) => g.cuts.find((b) => b >= k) ?? at(k);
  const LOCK = g.onCut(DROP);
  const out: Node[] = [];

  // The line over the mark and the mark, as one pair on the optical centre. The mark owns the frame: a third of it.
  const LINE = "One square, cut once.";
  // The line's box is the text-safe area made symmetric about the frame's middle, so the line, the mark and the name
  // share one axis (drawnMark centres its lockup the same way).
  const lx = Math.max(S.left, W - S.right), lw = Math.min(S.right, W - S.left) - lx;
  const lineH = B.measure("title", { id: "m", text: LINE, role: "headline", maxLines: 2, x: lx, y: S.top, w: lw, at: -10 }, ctx).h;
  const L = lineAndSubject(ctx, { lineH, aspect: markAspect(MARK), area: 0.33 });
  // The mark's own grid, in px: the file's units (300 x 372) scaled into the subject box.
  const [, , vw, vh] = MARKS[MARK]!.viewBox;
  const k = Math.min(L.subject.w / vw, L.subject.h / vh);
  const x0 = L.subject.x + (L.subject.w - vw * k) / 2, y0 = L.subject.y + (L.subject.h - vh * k) / 2;
  const X = (u: number) => Math.round(x0 + u * k), Y = (u: number) => Math.round(y0 + u * k);

  // Times: each draw starts on a beat; each fill lands on a strong onset.
  // The track's strong onsets start at the drop's build (4.5 s): before it, the fills land on beats.
  const BASE = at(0.8), BASE_FILL = at(BASE + 1.1);
  const ARC = at(BASE_FILL + 0.3), CORNER = at(ARC + 0.5), CORNER_FILL = onCutAfter(CORNER + 1.1);

  // 1. The frame grid and the mark's cell lines (thirds of the square, the base's line), drawn on the first beats.
  out.push(...B.frameGrid({ id: "frame", marks: true, at: -1, until: LOCK }, ctx));
  const pad = Math.round(0.022 * Math.min(W, ctx.height)) * 2;
  [0, 100, 200, 300].forEach((u, i) => out.push(...B.rule({ id: `col-${i}`, x1: X(u), y1: Y(0) - pad, x2: X(u), y2: Y(vh) + pad, layer: -1, at: at(0.1 + i * 0.2), until: LOCK }, ctx)));
  [0, 100, 200, 300, 312, 372].forEach((u, i) => out.push(...B.rule({ id: `row-${i}`, x1: X(0) - pad, y1: Y(u), x2: X(vw) + pad, y2: Y(u), layer: -1, at: at(0.2 + i * 0.2), until: LOCK }, ctx)));
  // The construction arc the corner's edge comes from: radius 312 about the square's lower-left corner, a little past
  // the square at each end.
  const arc: [number, number][] = Array.from({ length: 49 }, (_, i) => { const t = ((100 - (110 * i) / 48) * Math.PI) / 180; return [X(312 * Math.cos(t)), Y(300 - 312 * Math.sin(t))]; });
  out.push(...B.curve({ id: "arc", points: arc, color: "rule", layer: -1, at: ARC, until: LOCK }, ctx));

  // 2-4. The mark: the quarter disc at rest on frame 0, the base, then the corner in the accent; then the lockup.
  const mark = B.drawnMark({ id: "mark", mark: MARK, box: L.subject, accent: 2, times: [-1, BASE, CORNER], fills: [-1, BASE_FILL, CORNER_FILL], fillWith: "cut",
    lockup: { name: "Nozith", line: "Survey instruments", at: LOCK }, at: -1, until: undefined }, ctx);
  out.push(...mark);
  out.push(...B.reveal({ at: LOCK, of: "mark" }, ctx));
  // The line over the mark while it builds; the lockup's name takes its place.
  out.push(...B.title({ id: "ask", text: LINE, role: "headline", align: "center", maxLines: 2, x: lx, y: L.line.y, w: lw, exit: "cut", at: -1, until: LOCK }, ctx));

  // Sound: the drop on the lockup; a pop as each module's fill lands; the system's one impact on the lockup.
  const bed = B.music({ media: TRACK, peakAt: DROP, until: seconds }, ctx);
  out.push(...bed);
  out.push(...B.hit({ id: "pop-base", media: "mark-pop", at: BASE_FILL, bed }, ctx));
  out.push(...B.hit({ id: "pop-corner", media: "mark-pop", at: CORNER_FILL, bed }, ctx));
  out.push(...B.hit({ id: "impact", media: "mark-impact", at: LOCK, bed, duck: true }, ctx));
  return out;
};
