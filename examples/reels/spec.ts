// The Spec reel: 994 mm, the length of a pendulum that swings once a second, and how near it came to being the metre.
// Facts: a pendulum swings one way in t = π √(L / g), so L = g t² / π². For t = 1 s and standard gravity
// g = 9.80665 m/s², L = 0.99362 m: 994 mm, 6 mm short of 1000 mm. In 1790 Talleyrand put this "seconds pendulum" to
// the French Assembly as the base of the metre; in 1791 the Academy of Sciences chose the meridian instead.
//
// Five beats on the bars of the track (104 BPM, one bar is 2.3 s):
// 1. 0 to 1.47 s. The hook: the number on the sheet with its dimension line under it, and FIG. 1 under both: a
//    wall clock in a figure window.
// 2. 1.5 to 4.07 s. The number gives way to its question over the clock.
// 3. 4.07 s. A match cut on the bar: the drawing of the clock's pendulum on the same pixels. It lets go on the next
//    beat and swings one second each way, on the sine of a real pendulum. Its length is dimensioned: 994 mm.
// 4. The reveal, on the track's loudest bar: the metre, 1000 mm, drawn beside it with its own dimension.
// 5. On the next bar the line gives the history: proposed as the metre in 1790. The swing dies down (a damped
//    pendulum keeps its period) and rests beside the metre, and the sheet holds.
import type { Ctx, Key, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { musicFrom } from "../../src/system/scene/blocks";
import { beats, revealedAt } from "../../src/system/scene/beats";

export const system = "spec";
export const seconds = 14;

const TRACK = "spec-music-1168";
/** The reveal: the metre lands on the track's loudest bar (music peakAt). */
const REVEAL = 8.1;
const G = 9.80665;
const L_MM = Math.round((G / Math.PI ** 2) * 1000); // 994
/** The clock photo (spec-clock, 853 x 1280): its pendulum's pivot and bob centre, and the bob's radius, as fractions
 *  of the picture (measured on the prepared plate: the rod's top at 425, 530 px; the bob's centre at 423, 917 px;
 *  its radius 71 px). */
const PHOTO = { w: 853, h: 1280, pivot: [0.4982, 0.4141], bob: [0.4959, 0.7164], r: 0.0832 } as const;
const AMP = 8; // degrees each side of the vertical
const F = 1 / 30;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, w = S.right - S.left;
  const from = musicFrom({ media: TRACK, peakAt: REVEAL, until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  const BAR = (g.bars[1] ?? 2.03) - (g.bars[0] ?? 0);
  const CUT2 = g.onBar(4), DIM = g.onBar(6), MEET = g.onBar(REVEAL);
  const RELEASE = g.onBeat(CUT2 + 0.5);
  const REST = g.onBar(MEET + 2 * BAR), DATE = g.onBar(MEET + BAR);
  // The last strong onset before the drop (the snare that leads into it): the line about the swing cuts out on it.
  const lead = g.onsets.filter((o) => o.t > MEET - 0.6 && o.t < MEET - 0.1 && o.strength >= 0.9);
  const LIFT = lead[lead.length - 1]?.t ?? MEET - 0.3;
  const out: Node[] = [];
  /** Builds a labelled part so its label lands on the nearest beat (Spec: a label snaps on its beat, with a tick). */
  const onBeatLand = (build: (at: number) => Node[], id: string, at: number) => {
    const land = revealedAt(ctx.system, build(at), id);
    return build(at + g.onBeat(land) - land);
  };

  // The sheet: register marks at every crossing, from frame 0.
  out.push(...B.sheet({ id: "sheet", grid: "marks", at: -1 }, ctx));

  // 1. The hook: the number on frame 0 in the top band with its dimension line under it, and FIG. 1 under both: a
  // wall clock in a figure window, whose label types on in the first second.
  const numBox = { x: S.left, y: S.top, w, h: Math.round(ctx.lineHeight("display") * 1.25) };
  const numP = { id: "num", text: `${L_MM} mm`, ...numBox, role: "display" as const, keepCase: true };
  // The number holds for its reading time and leaves on a beat, so its question can be read before the cut.
  const ASK = g.onBeat(1.5);
  const num = B.fitText({ ...numP, at: 0, until: ASK }, ctx);
  const numInk = B.measure("fitText", { ...numP, at: 0 }, ctx);
  out.push(...num);
  const hookDim = B.dimension({ id: "hookdim", from: { x: numInk.x, y: numInk.y + numInk.h }, to: { x: numInk.x + numInk.w, y: numInk.y + numInk.h },
    offset: -Math.round(ctx.lineHeight("label") * 0.6), text: "ONE SWING = 1 s", at: -1, until: ASK }, ctx);
  out.push(...hookDim);
  const dimBox = B.measure("dimension", { id: "hookdim", from: { x: numInk.x, y: numInk.y + numInk.h }, to: { x: numInk.x + numInk.w, y: numInk.y + numInk.h },
    offset: -Math.round(ctx.lineHeight("label") * 0.6), text: "ONE SWING = 1 s", at: 0 }, ctx);

  // The window: under the hook's dimension (and under the two-line headlines that follow), to 88 % of the frame
  // height, so the drawing's labels (at the middle of the pendulum) stay inside the text-safe area. The photo keeps
  // its own scale or less.
  const headBottom = Math.max(dimBox.y + dimBox.h, S.top + ctx.lineHeight("headline") * 2);
  const win = { x: Math.round(S.left - 24), y: Math.round(headBottom + 24), w: Math.round(w + 48), h: 0 };
  win.h = Math.round(ctx.height * 0.88 - win.y);
  const scale = Math.max(win.w / PHOTO.w, win.h / PHOTO.h);
  // Where the photo's pendulum lands in the window: the cover fit, centred (focus [0.5, 0.5]).
  const ox = win.x + (win.w - PHOTO.w * scale) / 2, oy = win.y + (win.h - PHOTO.h * scale) / 2;
  const pv = { x: Math.round(ox + PHOTO.pivot[0] * PHOTO.w * scale), y: Math.round(oy + PHOTO.pivot[1] * PHOTO.h * scale) };
  const bob = { x: pv.x, y: Math.round(oy + PHOTO.bob[1] * PHOTO.h * scale), r: Math.round(PHOTO.r * PHOTO.w * scale) };
  const L = bob.y - pv.y;
  const clock = B.photo({ id: "clock", media: "spec-clock", box: win, focus: [0.5, 0.5], plate: false, over: true, motion: "still", enter: "cut", exit: "cut", at: -1, until: CUT2 }, ctx);
  out.push(...clock);
  out.push(...B.box({ id: "window", ...win, stroke: "ink", at: -1 }, ctx));
  const labelY = win.y + Math.round(ctx.lineHeight("label") * 0.5);
  const lx = win.x + 24;
  const fig1 = onBeatLand((at) => B.typeOn({ id: "fig1", text: "FIG. 1  CLOCK", x: lx, y: labelY, color: "ink", pace: "write", at, until: CUT2 - ctx.dur.exit }, ctx), "fig1", 1.1);
  out.push(...fig1);
  // On the next bar the drawing starts on the photo: the axis through the clock's pendulum and its pivot, in the
  // overlay layer over the cut-out, so the match cut has a line to land on.
  out.push(...B.title({ id: "ask", text: "What measures 994 mm?", role: "headline", maxLines: 2, x: S.left, y: S.top, w, exit: "cut", replaces: "num", at: ASK + ctx.dur.exit, until: CUT2 }, ctx));

  // 3. FIG. 2 on the same pixels: the mount, the rod and the bob, and the arc the bob travels.
  const fig2 = onBeatLand((at) => B.typeOn({ id: "fig2", text: "FIG. 2  SECONDS PENDULUM", x: lx, y: labelY, color: "ink", pace: "write", at }, ctx), "fig2", CUT2);
  out.push(...fig2);
  const half = Math.round(bob.r * 0.9);
  out.push(...B.rule({ id: "axis", x1: pv.x, y1: pv.y, x2: pv.x, y2: bob.y + bob.r + 40, dash: true, at: CUT2 }, ctx));
  out.push(...B.rule({ id: "mount", x1: pv.x - half, y1: pv.y, x2: pv.x + half, y2: pv.y, color: "ink", weight: 2, pace: "enter", at: CUT2 - F }, ctx));
  out.push(...B.cross({ id: "pivot", x: pv.x, y: pv.y, at: CUT2 }, ctx));
  out.push(...B.title({ id: "swing", text: "One swing takes one second.", role: "headline", maxLines: 2, x: S.left, y: S.top, w, exit: "cut", at: CUT2, until: LIFT }, ctx));

  // The swing: θ(t) = A(t) cos(π (t - release)), one second each way, sampled every frame with linear keys, so the
  // bob moves as a real pendulum does (a sine), not on an ease. After the reveal the amplitude dies down to rest.
  // No block turns a part about an off-centre pivot on keys (shape turns about its own centre, in steps), so the
  // rod and the bob are drawn as raw nodes here; the need is in the report.
  const ampAt = (t: number) => (t < MEET ? AMP : t >= REST ? 0 : AMP * 0.5 * (1 + Math.cos((Math.PI * (t - MEET)) / (REST - MEET))));
  const swing: Key[] = [{ t: 0, v: AMP }, { t: RELEASE, v: AMP }];
  for (let t = RELEASE + F; t < REST + F; t += F) swing.push({ t, v: +(ampAt(t) * Math.cos(Math.PI * (t - RELEASE))).toFixed(3) });
  swing.push({ t: seconds, v: 0 });
  const show = (at: number): Key[] => [{ t: 0, v: 0 }, { t: at, v: 0 }, { t: at + F, v: 1, curve: "step" }];
  out.push({ id: "rod", kind: "path", d: `M${pv.x} ${pv.y}L${pv.x} ${bob.y}`, stroke: "ink", width: ctx.stroke * 2, cap: "butt",
    box: { x: pv.x, y: pv.y, w: 0, h: L }, origin: [0.5, 0], tracks: { opacity: show(CUT2 - F), rotate: swing } });
  out.push({ id: "bob", kind: "circle", cx: pv.x, cy: bob.y, r: bob.r, fill: "ink", origin: [0.5, 0.5 + (pv.y - bob.y) / (2 * bob.r)],
    tracks: { opacity: show(CUT2 - F), rotate: swing } });

  // The length, dimensioned left of the swing, on the bar after the cut.
  const reach = Math.ceil(L * Math.sin((AMP * Math.PI) / 180) + bob.r);
  const len = onBeatLand((at) => B.dimension({ id: "len", from: { x: pv.x - reach, y: pv.y }, to: { x: pv.x - reach, y: bob.y }, offset: -60, text: `${L_MM} mm`, at }, ctx), "len-text", DIM);
  out.push(...len);

  // The law that gives the length, typed in the window's calm upper part.
  const lawY = labelY + Math.round(ctx.lineHeight("label") * 3);
  out.push(...B.typeOn({ id: "law", text: "L = g t² / π²", x: lx, y: lawY, color: "ink", pace: "write", keepCase: true, at: g.onBeat(DIM + 0.5) }, ctx));
  out.push(...B.typeOn({ id: "given", text: "t = 1 s   g = 9.80665 m/s²", x: lx, y: lawY + Math.round(ctx.lineHeight("label") * 1.2), keepCase: true, pace: "write", at: g.onBeat(DIM + 1) }, ctx));

  // 4. The reveal: the metre beside it, to the same scale, with its own dimension.
  // The metre stands right of the swing; its dimension and label sit between the two, so the label ends inside the
  // low band's text-safe edge.
  const mL = Math.round((L * 1000) / L_MM);
  const mx = Math.round(S.lowBandRight + 50);
  out.push(...B.rule({ id: "metre", x1: mx, y1: pv.y, x2: mx, y2: pv.y + mL, color: "ink", weight: 2, ticks: true, at: MEET - ctx.dur.enter }, ctx));
  const mdim = onBeatLand((at) => B.dimension({ id: "mdim", from: { x: mx, y: pv.y }, to: { x: mx, y: pv.y + mL }, offset: -40, text: "1000 mm", at }, ctx), "mdim-text", MEET);
  out.push(...mdim);
  out.push(...B.title({ id: "short", text: "6 mm short of the metre.", role: "headline", maxLines: 2, x: S.left, y: S.top, w, enter: "cut", exit: "cut", at: MEET, until: DATE }, ctx));
  out.push(...B.reveal({ at: MEET }, ctx));

  // 5. The history, on the next bar; the sheet holds.
  out.push(...B.title({ id: "date", text: "Proposed as the metre in 1790.", role: "headline", maxLines: 2, x: S.left, y: S.top, w, at: DATE }, ctx));
  out.push(...B.hold({ at: REST, until: seconds }, ctx));

  // Sound: the bed's loudest bar on the reveal; a tick as each label lands (Spec: a tick when a label snaps): FIG. 1,
  // FIG. 2, the length, the metre. Four in 14 s, under the system's six in 10 s.
  const bed = B.music({ media: TRACK, peakAt: REVEAL, until: seconds }, ctx);
  out.push(...bed);
  ([[fig1, "fig1"], [fig2, "fig2"], [len, "len-text"], [mdim, "mdim-text"]] as const).forEach(([nodes, id], i) =>
    out.push(...B.hit({ id: `tick${i}`, media: "spec-tick", on: { nodes, id }, bed }, ctx)));
  return out;
};
