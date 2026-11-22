// One short film per system that holds the system's hook, its signature moves and its end, each built with the block
// its block map names and default props (systems/<id>/SYSTEM.md, Direction). The test in src/system/signature.test.ts
// reads each film's detector result: a system may never ask for a move that its own checks refuse.
// Facts are computed (a sorted list of 1 000 000 numbers halves 20 times to 1); names are drawn at random.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lineAbove, lineAndSubject, musicFrom, overflow } from "../../src/system/scene/blocks";
import { beats, placePeak, windowLevel } from "../../src/system/scene/beats";
import { DIRECTION } from "../../src/system/direction";
import { MUSIC } from "../../src/system/music.gen";
import { anchor } from "../../src/system/scene/context";
import { standing } from "../../src/system/three/models";
import type { Ctx, Node } from "../../src/system/scene/types";
import type { Object3D } from "../../src/system/three/spec";

export const seconds = 8;
/** Films longer than `seconds`: Kinetic's end is a last line after the reveal, then a cut to the ground on a bar, with no
 *  hold; Title's cards each hold their reading time, with black holds and flashes between them. */
export const SECONDS: Record<string, number> = { kinetic: 9, title: 9.5, graphite: 8.8, noir: 8.9 };
type B = typeof BLOCKS;
const LINE = "Half the list goes each time.";

/** The text-safe box and a few shared measures. */
const frame = (ctx: Ctx) => {
  const S = ctx.safe, w = S.right - S.left, m = Math.ceil(ctx.system.margin * Math.min(ctx.width, ctx.height));
  return { S, x: S.left, w, m, P: { x: m, y: m, w: ctx.width - 2 * m, h: ctx.height - 2 * m }, gap: Math.round(ctx.lineHeight("body")) };
};
const lineH = (ctx: Ctx, B: B, text: string | string[], role: "display" | "headline" | "body", w: number) =>
  Math.ceil(B.measure("title", { id: "m", x: ctx.safe.left, y: ctx.safe.top, w, text, role, maxLines: 3, at: -10 }, ctx).h);

/** A system whose music is its clock: the bed, with its drop on `peakAt`, and times snapped to the bed's beats. */
const clock = (ctx: Ctx, B: B, media: string, peakAt: number) => {
  const until = SECONDS[ctx.system.id] ?? seconds;
  // The drop's measured rise on peakAt (placePeak, as music({ peakAt }) places it), given as align: the same entry,
  // without the build's note on where a guessed bar line sits.
  const from = placePeak(MUSIC[media]!, { peakAt, until, name: media })?.from ?? musicFrom({ media, peakAt, until });
  const g = beats(media, { from, until });
  return { on: (t: number) => g.onBeat(t), beats: g.beats, bars: g.bars, onsets: g.onsets, bed: B.music({ media, align: { track: from, film: 0 }, until }, ctx) };
};

/** The bed of a bed system, as its direction's mix asks (entry: swell, section or start; Title: a hard stop on the impact
 *  with its one impact, then silence), with default props. A clock system cuts on its track's beats: its scene takes its
 *  times from clock() instead. */
const BED: Record<string, string> = { studio: "studio-music-4", manual: "manual-music-6", ma: "ma-music-3", keynote: "keynote-music-2", console: "console-music-4",
  title: "title-music-3", matte: "matte-music-3", schematic: "schematic-music-2", nocturne: "nocturne-music-1" };
// One attack: title-impact has four within 0.34 s (a flam), which reads as two hits.
const IMPACT: Record<string, string> = { title: "mark-impact" };
/** A section start with energy (not the intro or the outro) that puts the loudest bar it can on the reveal, with the
 *  track covering the film. */
const loudAt = (media: string, reveal: number, until: number): number => {
  const m = MUSIC[media]!;
  const ok = m.sections.filter((x) => x.role !== "intro" && x.role !== "outro" && x.start + until <= m.duration);
  return ok.reduce((best, x) => (windowLevel(media, x.start + reveal - 0.5, 1).lufs > windowLevel(media, best.start + reveal - 0.5, 1).lufs ? x : best), ok[0]!).start;
};
const sound = (ctx: Ctx, B: B, reveal: number): Node[] => {
  const media = BED[ctx.system.id];
  const mix = DIRECTION[ctx.system.id]!.mix;
  if (!media || mix.music !== "bed") return [];
  const until = SECONDS[ctx.system.id] ?? seconds;
  const stop = mix.stop === "hard" ? reveal : until;
  const placed = mix.entry === "swell" ? { peakAt: reveal, peak: "loudest" as const }
    : mix.entry === "start" ? { clipStart: MUSIC[media]?.lead ?? 0 } // the start of the sound, past any silence the file opens with
    : { align: { track: loudAt(media, reveal, until), film: 0 } };
  const bed = B.music({ media, ...placed, until: stop, ...(mix.stop === "hard" ? { fadeOut: 0 } : {}) }, ctx);
  const impact = IMPACT[ctx.system.id];
  return [...bed, ...(impact ? B.hit({ id: "impact", media: impact, at: reveal, bed }, ctx) : [])];
};

/** Product systems: the object frames itself under its line; a second angle; the end card on the object. */
const SHORT = "Light you can carry.";
const product = (objects: () => Object3D[], shot2: "push" | "orbit") => (ctx: Ctx, B: B): Node[] => {
  const { S, x, w, gap } = frame(ctx);
  const h = lineH(ctx, B, SHORT, "headline", w);
  const room = { x: 0, y: Math.round(S.top + h + gap), w: ctx.width, h: Math.round(ctx.height * 0.95) - Math.round(S.top + h + gap) };
  const s1 = B.product({ id: "s1", objects: objects(), shot: "turntable", room, at: 0, until: 3.5 }, ctx);
  const s2 = B.product({ id: "s2", objects: objects(), shot: shot2, room, at: 3.5, until: 5.6 }, ctx);
  return [...s1, ...s2,
    ...B.title({ id: "line", text: SHORT, role: "headline", maxLines: 3, ...lineAbove(ctx, anchor(s1, "s1-object-extent"), h), w, x, at: 0.2, until: 4 }, ctx),
    ...B.endCard({ id: "end", name: "Ovenri", line: "Light you carry.", mark: { objects: objects() }, at: 6, until: seconds }, ctx)];
};
const lantern = () => [standing("lamp", "model-lantern", { height: 2.6 })];
const chair = () => [standing("chair", "model-armchair", { height: 2 })];

const DRAWN: Record<string, (ctx: Ctx, B: B) => Node[]> = {
  studio: product(lantern, "push"),
  keynote: product(lantern, "push"),
  matte: product(chair, "orbit"),

  // Spec: the grid first, the key number in display with its dimension, a figure window with its FIG. label, a note
  // that types on, and a last dimension that names the answer.
  spec: (ctx, B) => {
    const { S, x, w } = frame(ctx);
    const numH = Math.round(ctx.lineHeight("display") * 1.1), dimY = S.top + numH + 50;
    const fig = { x, y: dimY + 190, w, h: w };
    // The bed is the clock: its drop on the last dimension; each label on a beat.
    const c = clock(ctx, B, "spec-music-1168", 5.0), END = c.on(5.0);
    return [...c.bed, ...B.sheet({ id: "sheet", grid: "lines", at: 0 }, ctx),
      ...B.title({ id: "num", text: "20 looks", role: "display", maxLines: 1, x, y: S.top, w, at: 0 }, ctx),
      // The first dimension and the second note leave one exit before the last dimension comes, so they are gone when it
      // lands, and their exit falls on the track's accent at 4.7 s.
      ...B.dimension({ id: "dim", from: { x, y: dimY }, to: { x: x + w, y: dimY }, offset: 0, text: "1 000 000 numbers", at: 0.2, until: END - ctx.dur.exit }, ctx),
      ...B.typeOn({ id: "note", text: "Each look halves it.", role: "body", x, y: dimY + 70, w, at: c.on(0.4), until: c.on(2.4) }, ctx),
      ...B.typeOn({ id: "note2", text: "Twenty halvings to one.", role: "body", x, y: dimY + 70, w, at: c.on(2.8), until: END - ctx.dur.exit }, ctx),
      ...B.photo({ id: "fig", media: "noir-bridge", box: fig, frame: "figure", label: "FIG. 1  THE SEARCH, 1:20", labelAt: "top", motion: "push", amount: 0.06, at: c.on(1.0) }, ctx),
      ...B.dimension({ id: "end", from: { x, y: dimY }, to: { x: x + w / 2, y: dimY }, offset: 0, text: "half", at: END }, ctx),
      ...B.reveal({ at: END }, ctx)];
  },

  // Manual: the question, code that types with one lit line, the run that proves it.
  manual: (ctx, B) => {
    const { S, x, w, gap, m } = frame(ctx);
    const qH = lineH(ctx, B, LINE, "headline", w);
    const code = ["def find(xs, t):", "  lo, hi = 0, len(xs)", "  m = (lo+hi) // 2"];
    const C = { id: "code", x, y: S.top + qH + gap, w, title: "find.py", lines: code, enter: "type" as const, cps: 18, highlight: [{ line: 3, at: 4 }], at: 0.3 };
    const cH = B.measure("codeBlock", C, ctx).h;
    return [...B.title({ id: "q", text: LINE, role: "headline", maxLines: 3, x, y: S.top, w, at: 0 }, ctx), ...B.codeBlock(C, ctx),
      ...B.terminal({ id: "run", x, y: S.top + qH + gap + cH + gap, w, session: [{ command: "python3 find.py", pause: 4.4, output: [{ text: "20 looks", result: true }] }], resultRole: "headline", end: "result", foot: ctx.height - m, at: -1 }, ctx)];
  },

  // Ma: a small picture in a field of paper, one line at a time, each in its own silence, read slowly.
  ma: (ctx, B) => {
    const { x } = frame(ctx);
    const side = Math.round(ctx.width * 0.42);
    const pic = { x: Math.round(ctx.width * 0.4), y: Math.round(ctx.height * 0.24), w: side, h: side };
    return [...B.photo({ id: "palm", media: "ma-palm", box: pic, motion: "drift", at: 0, until: 4.6 }, ctx),
      ...B.text({ id: "l1", text: "Half goes each time.", role: "body", x, y: Math.round(ctx.height * 0.57), w: ctx.safe.lowBandRight - x, at: 0, until: 4.6 }, ctx),
      ...B.hold({ id: "rest", at: 6.6, until: seconds }, ctx)];
  },

  // Primary: the shape owns the frame off centre and turns in 90-degree steps; a triangle slides in opaque; the
  // proof completes in one flat colour.
  primary: (ctx, B) => {
    const { x, w } = frame(ctx);
    const L = lineAndSubject(ctx, { lineH: lineH(ctx, B, LINE, "headline", w), area: 0.4 });
    // The bed is the clock: each turn lands on a beat with a click; the triangle slides in on the drop.
    const c = clock(ctx, B, "primary-music-506", 4.6), TRI = c.on(4.6);
    const lands = [1.2, 2.4, 3.6].map((t) => c.on(t));
    return [...c.bed, ...B.title({ id: "line", text: LINE, role: "headline", maxLines: 3, ...L.line, at: 0 }, ctx),
      ...B.shape({ id: "sq", kind: "square", ...L.subject, fill: "accent", turns: lands.map((t) => ({ at: t - ctx.dur.move, by: 90 })), at: 0 }, ctx),
      ...lands.flatMap((t, i) => B.hit({ id: `turn${i}`, media: "primary-click", at: t, bed: c.bed }, ctx)),
      ...B.shape({ id: "tri", kind: "triangle", x: L.subject.x, y: L.subject.y + L.subject.h * 0.4, w: L.subject.w * 0.6, h: L.subject.h * 0.6, fill: "accent2", enter: "slide", from: "left", at: TRI }, ctx),
      ...B.reveal({ at: TRI }, ctx), ...B.hold({ id: "rest", at: c.on(5.8), until: seconds }, ctx)];
  },

  // Riso: the line on the paper band, the print under it, one ink that stamps on each beat.
  riso: (ctx, B) => {
    const { S, x, w } = frame(ctx);
    const h = lineH(ctx, B, LINE, "display", w), top = S.top + h + 40, ph = Math.round(ctx.width * 0.66);
    // The bed is the clock: one ink a beat, the last on the drop.
    const c = clock(ctx, B, "riso-music-2", 5.2), BEAT = (c.beats[1] ?? 0.7) - (c.beats[0] ?? 0);
    // Six inks, each a third of the frame's width, overprinted on the print (each ink is a picture change a viewer sees
    // on its beat); the drop is the fifth, and the last stamps on the beat after it.
    // Riso moves at 12 frames a second: a change shows on the next step, up to 2.5 frames late. Each ink is set a frame
    // before its beat, so its step lands on the beat's accent.
    const inks = [1.0, 1.7, 3.1, 4.5, 5.2].map((t) => c.on(t) - 1 / 30), lastInk = (c.beats.find((b) => b > inks[4]! + 0.3) ?? inks[4]! + 0.7) - 1 / 30;
    inks.push(lastInk);
    return [...c.bed, ...B.title({ id: "line", text: LINE, role: "display", maxLines: 3, x, y: S.top, w, at: 0 }, ctx),
      // The picture prints ink by ink (its block map): the inks multiply where they overlap, a few px off register.
      ...B.photo({ id: "print", media: "riso-brayer-hands", box: { x: 0, y: top, w: ctx.width, h: ph }, motion: "still", passes: { beat: BEAT }, at: c.beats[0] ?? 0 }, ctx),
      ...inks.map((t, i) => {
        // Over the print, overprinted (the inks multiply with it), spread so each new ink lands on fresh paper.
        const d = Math.round(ctx.width * 0.34), at = [[0.04, 0.08], [0.6, 0.14], [0.08, 0.58], [0.62, 0.62], [0.33, 0.33], [0.36, 0.02]][i]!;
        return B.shape({ id: `ink${i}`, kind: "circle", x: Math.round(at[0]! * (ctx.width - d) / 0.66), y: Math.round(top + at[1]! * (ph - d) / 0.62), w: d, h: d, fill: i % 2 ? "accent2" : "accent", enter: "cut", at: t }, ctx);
      }).flat(),
      ...B.reveal({ at: inks[4]! }, ctx), ...B.hold({ id: "rest", at: lastInk, until: seconds }, ctx)];
  },

  // Cutout: a hot slab slides in with the word fitted into it; a black panel wipes across and becomes the next frame;
  // the end locks up on one axis.
  cutout: (ctx, B) => {
    const { x, w, P } = frame(ctx);
    const slab = { x: P.x, y: Math.round(ctx.height * 0.34), w: P.w, h: Math.round(P.w * 0.6) };
    const fit = (id: string, text: string, color: "onAccent" | "ground", at: number, until?: number) =>
      B.fitText({ id, text, x: Math.max(slab.x, x), y: slab.y, w: Math.min(slab.w, w), h: slab.h, role: "display", color, at, until }, ctx);
    const t = Math.round(P.w * 0.3);
    // The bed is the clock: the panel crosses on a beat, the word lands on the drop, the end locks up on a beat.
    const c = clock(ctx, B, "cutout-music-1", 2.5);
    // The panel crosses on a beat; the first slab leaves under it, the second slides in behind it, and its word lands
    // on the first beat after (the reveal).
    const CROSS = c.on(1.8), OUT = CROSS + 0.2, IN2 = CROSS + 0.35, WORD = c.beats.find((b) => b >= CROSS + 0.7) ?? CROSS + 0.7, END = c.on(4.8);
    return [...c.bed, ...B.shape({ id: "slab", kind: "rect", ...slab, fill: "accent", enter: "slide", from: "left", at: 0, until: OUT }, ctx),
      ...fit("word", "HALF", "onAccent", 0.2, OUT),
      ...B.shape({ id: "chip", kind: "triangle", x: P.x + P.w - t, y: slab.y - t - 20, w: t, h: t, fill: "ink", enter: "slide", from: "right", at: c.on(1.1), until: OUT }, ctx),
      ...B.wipe({ id: "cross", at: CROSS, style: "panel" }, ctx),
      ...B.shape({ id: "slab2", kind: "rect", ...slab, fill: "ink", enter: "slide", from: "right", at: IN2, until: END }, ctx),
      ...fit("word2", "20", "ground", WORD, END),
      ...B.shape({ id: "chip2", kind: "triangle", x: P.x, y: slab.y + slab.h + 20, w: t, h: t, fill: "accent", enter: "slide", from: "left", at: c.on(3.6), until: END }, ctx),
      ...B.reveal({ at: WORD }, ctx),
      ...B.lockup({ id: "end", name: "Halfway", line: "Twenty looks.", mark: "square", markSize: Math.round(ctx.height * 0.12), axis: "column", x, y: Math.round(ctx.height * 0.3), w, at: END }, ctx)];
  },

  // Mark: an original mark, given inline as SVG paths (a bar, a quarter fan beside it, a dot in the accent), on its grid.
  // The fan, the unit module, stands on frame 0 at the hook's share; each other part draws on by its outline on a beat and
  // fills on the next, with a pop; on the drop the grid goes and the name locks up over the mark, with the one impact.
  // The drawnMark block does each step.
  mark: (ctx, B) => {
    const art = { viewBox: [0, 0, 312, 300] as [number, number, number, number], paths: [
      { d: "M0 0H60V300H0Z", paint: "fill" as const },
      { d: "M72 60A240 240 0 0 1 312 300H72Z", paint: "fill" as const },
      { d: "M224 48A40 40 0 1 0 304 48A40 40 0 1 0 224 48Z", paint: "fill" as const },
    ] };
    const S = ctx.safe, lx = Math.max(S.left, ctx.width - S.right), lw = Math.min(S.right, ctx.width - S.left) - lx;
    const L = lineAndSubject(ctx, { lineH: ctx.lineHeight("headline"), aspect: 312 / 300, area: 0.4 });
    // The bed is the clock: the drop lands on the lockup.
    const c = clock(ctx, B, "mark-music-4", 5.0);
    const BAR = c.on(0.43), BAR_FILL = c.on(1.6), DOT = c.on(2.13), DOT_FILL = c.on(3.3), LOCK = c.on(5.0);
    const k = L.subject.w / 312, x0 = L.subject.x, y0 = L.subject.y + (L.subject.h - 300 * k) / 2;
    const mark = B.drawnMark({ id: "mark", mark: art, box: L.subject, accent: 2, times: [BAR, -1, DOT], fills: [BAR_FILL, -1, DOT_FILL], fillWith: "cut",
      lockup: { name: "Halfway", line: "Twenty looks.", at: LOCK }, at: -1 }, ctx);
    return [...c.bed, ...B.frameGrid({ id: "grid", marks: true, at: -1, until: LOCK }, ctx),
      // The construction circle the dot comes from, in the rule colour, while the mark builds.
      ...B.shape({ id: "guide", kind: "circle", x: Math.round(x0 + 212 * k), y: Math.round(y0 - 4 * k), w: Math.round(104 * k), h: Math.round(104 * k), stroke: "rule", enter: "draw", layer: -1, at: c.on(1.9), until: LOCK }, ctx),
      ...mark,
      // The line leaves as the name comes: it is gone by the lockup, so the two never cross.
      ...B.text({ id: "line", text: "Three parts.", role: "headline", align: "center", x: lx, y: L.line.y, w: lw, at: -1, until: LOCK - ctx.dur.exit }, ctx),
      ...B.reveal({ at: LOCK, of: "mark" }, ctx),
      ...B.hit({ id: "pop-bar", media: "mark-pop", at: BAR_FILL, bed: c.bed }, ctx),
      ...B.hit({ id: "pop-dot", media: "mark-pop", at: DOT_FILL, bed: c.bed }, ctx),
      ...B.hit({ id: "impact", media: "mark-impact", at: LOCK, bed: c.bed, duck: true }, ctx)];
  },

  // Raw: a page with borders; the line types with a block cursor; a link in the one blue; the last line types last.
  raw: (ctx, B) => {
    const { S, x } = frame(ctx);
    const pw = S.lowBandRight - x, lh = ctx.lineHeight("headline");
    return [...B.box({ id: "page", x, y: S.top + 60, w: pw, h: 820, at: 0 }, ctx),
      ...B.typeOn({ id: "line", text: LINE, role: "headline", x: x + 30, y: S.top + 90, w: pw - 60, cursor: true, cursorUntil: 2.5, pace: "human", at: 0 }, ctx),
      ...B.text({ id: "link", text: "Why it halves", role: "headline", color: "accentText", x: x + 30, y: S.top + 90 + 3 * lh, at: 2.6 }, ctx),
      ...B.rule({ id: "link-rule", x1: x + 30, y1: S.top + 90 + 3.92 * lh, x2: x + 30 + ctx.measure("Why it halves", "headline"), y2: S.top + 90 + 3.92 * lh, color: "accent", enter: "cut", at: 2.6 }, ctx),
      ...B.typeOn({ id: "end", text: "Twenty looks.", role: "headline", x: x + 30, y: S.top + 90 + 5 * lh, w: pw - 60, cursor: true, pace: "human", at: 4 }, ctx)];
  },

  // Pop: the character leads and lands with a squash; a big round iris becomes the next scene; a chunky button sinks
  // when pressed; the end locks up.
  pop: (ctx, B) => {
    const { x, w } = frame(ctx);
    const c = clock(ctx, B, "pop-music-823", 3);
    const L = lineAndSubject(ctx, { lineH: lineH(ctx, B, LINE, "headline", w), area: 0.4 });
    const btn = B.measure("button", { id: "m", text: "Play", depth: 8, role: "headline", x, y: ctx.safe.top, at: 0 }, ctx);
    // The lockup lands on the strongest accent after the press (a lockup is not a cut: it may sit off the beat).
    const IRIS = c.on(3), PRESS = c.on(4.6), END = c.onsets.filter((o) => o.t > PRESS + 0.8 && o.t < 6.3).reduce<{ t: number; strength: number } | null>((b, o) => (!b || o.strength > b.strength ? o : b), null)?.t ?? c.on(5.8);
    return [...c.bed,
      ...B.title({ id: "line", text: LINE, role: "headline", maxLines: 3, ...L.line, at: 0, until: IRIS + 0.2 }, ctx),
      // The character leads until the iris takes the frame; the iris is the next scene.
      ...B.shape({ id: "hero", kind: "circle", ...L.subject, fill: "accent", squash: [c.on(0.6), c.on(1.6), c.on(2.4)], at: 0, until: IRIS + 0.4 }, ctx),
      ...B.wipe({ id: "iris", at: IRIS, style: "iris", fill: "accent2" }, ctx),
      ...B.title({ id: "line2", text: "Twenty looks.", role: "headline", maxLines: 2, ...L.line, color: "ink", at: c.on(3.6), until: END - 0.2 }, ctx),
      ...B.button({ id: "play", text: "Play", role: "headline", depth: 8, x: Math.round(ctx.width / 2 - btn.w / 2), y: Math.round(L.subject.y + L.subject.h / 2 - btn.h / 2), press: [PRESS], at: c.on(3.8), until: END - 0.2 }, ctx),
      ...B.hit({ id: "press", media: "pop-cork", at: PRESS, bed: c.bed }, ctx),
      ...B.reveal({ at: c.on(3.6) }, ctx),
      ...B.lockup({ id: "end", name: "Halfway", line: "Twenty looks.", lineColor: "ink", mark: "circle", markSize: Math.round(ctx.height * 0.18), axis: "column", x, y: L.line.y, w, at: END }, ctx)];
  },

  // Graphite: the line over a window full of rows; the selection moves on the beat; the cursor clicks.
  graphite: (ctx, B) => {
    const { S, x, w } = frame(ctx);
    const h = lineH(ctx, B, LINE, "headline", w);
    // The bed is the clock: each click on a beat, with a click sound; the next screen on the drop.
    const c = clock(ctx, B, "graphite-music-8", 5.6);
    const SEL = c.on(0.6), C1 = c.on(2.4), C2 = c.on(4.6), SWAP = c.on(5.6);
    const win = B.uiWindow({ id: "app", title: "Queue", lineH: h, rows: ["Kiln 2", "Glaze 14", "Shelf 3", "Order 2207"].map((t, i) => ({ id: `r${i}`, title: t, meta: `${21 + i}:00`,
      ...(i === 0 ? { selected: [{ at: SEL, until: C1 }], badge: { text: "Firing", tone: "accent" as const } } : i === 1 ? { selected: [{ at: C1, until: C2 }] } : i === 2 ? { selected: [{ at: C2, until: SWAP }] } : {}) })), at: 0 }, ctx);
    const C3 = c.on(SWAP + 1.25);
    // The next screen of the same window: half the list is gone. The frame stays; the content hands over (replaces).
    // Its first row is picked two beats after the swap, on the accent there.
    const app2 = B.uiWindow({ id: "app2", title: "Queue", lineH: h, rows: ["Shelf 3", "Order 2207"].map((t, i) => ({ id: `q${i}`, title: t, meta: `${23 + i}:00`, ...(i === 0 ? { selected: [{ at: C3 }] } : {}) })), replaces: "app", at: SWAP }, ctx);
    return [...c.bed, ...B.title({ id: "line", text: LINE, role: "headline", maxLines: 3, x, y: S.top, w, at: 0, until: SWAP }, ctx), ...win,
      ...B.cursor({ id: "cursor", path: [{ x: S.right - 60, y: S.bottom - 40, at: 0 }, { to: "r1-box", at: C1 - 0.1 }, { to: "r2-box", at: C2 - 0.1 }, { to: "q0-box", at: C3 - 0.1 }],
        targets: [...win, ...app2], clicks: [C1, C2, C3], ring: 0.2, at: 0 }, ctx),
      ...[C1, C2, C3].flatMap((t, i) => B.hit({ id: `click${i}`, media: "graphite-click", at: t, bed: c.bed }, ctx)),
      ...app2,
      // The line in its slot changes with the screen, by a cut.
      ...B.title({ id: "line2", text: "Two left.", role: "headline", maxLines: 3, x, y: S.top, w, enter: "cut", replaces: "line", at: SWAP }, ctx),
      ...B.reveal({ at: SWAP }, ctx),
      ...B.hold({ id: "rest", at: C3, until: SECONDS.graphite }, ctx)];
  },

  // Console: a full terminal; the session types at a human rate and the result that matters prints in the accent.
  console: (ctx, B) => {
    const { S, x, w, m } = frame(ctx);
    const session = [{ command: "wc -l nums.txt", output: [{ text: "1000000 nums.txt", tone: "muted" as const }] }, { command: "python3 find.py", output: [{ text: "looks: 20", result: true }] }];
    return [...B.terminal({ id: "term", x, y: S.top, w, session, role: "headline", status: { left: "search", right: "py 3.12" }, foot: ctx.height - m, end: "result", at: 0.2 }, ctx)];
  },

  // Noir: the figure on a lit plate, hard slats of shadow that slide, the title in a lit band, the name last.
  noir: (ctx, B) => {
    const { S, x, w } = frame(ctx);
    const h = lineH(ctx, B, "Half goes each time.", "headline", w);
    const top = S.top + h + ctx.lineHeight("headline");
    // The bed is the clock: the name is lit on the drop, and the shadow sweeps the frame dark the beat before it.
    const c = clock(ctx, B, "noir-music-4", 6.5), NAME = c.on(6.5), SWEEP = [...c.beats].reverse().find((b) => b < NAME - 0.3) ?? NAME - 0.75;
    const title = B.title({ id: "line", text: "Half goes each time.", role: "headline", maxLines: 3, x, y: S.top, w, at: 0, until: SWEEP + 0.2 }, ctx);
    return [...c.bed, ...B.photo({ id: "plate", media: "noir-bridge", box: { x: 60, y: top, w: ctx.width - 120, h: Math.min(ctx.height - top, 1360) }, fade: "top", motion: "push", amount: 0.04, at: 0, until: SWEEP + 0.4 }, ctx), ...title,
      // Near-level slats: a lit band holds the whole title, and the bars stay slats (the period at most 4 times its base).
      ...B.shadowBars({ id: "slats", angle: -12, keepLit: title, at: c.on(0.6) }, ctx),
      // A shadow sweeps the frame dark, then the name is lit.
      ...B.wipe({ id: "sweep", at: SWEEP, style: "sweep", fill: "ground" }, ctx),
      ...B.reveal({ at: NAME }, ctx),
      ...B.title({ id: "end", text: "Halfway", role: "headline", maxLines: 1, x, y: S.top, w, at: NAME, until: SECONDS.noir }, ctx)];
  },

  // Title: a small line cuts in and holds; black between cards; flash cuts that accelerate; the release line last.
  title: (ctx, B) => {
    const { x, w } = frame(ctx);
    // The plate fills the frame (photo with no box); the card is one small headline on its calm top band. The flash stills
    // before the title are too small to fill a tall frame, so each sits in a letterbox band across the full width; a black
    // hold follows them. The title lands on the impact, where the bed stops; the release line holds to the end.
    const plate = B.photo({ id: "plate", media: "title-observatory", dim: true, motion: "push", amount: 0.03, at: 0, until: 3 }, ctx);
    const flashes: [string, number, number][] = [["title-beam", 3, 12], ["title-jetty", 3.6, 8]];
    const black = 3.6 + 8 / 30, title = 4.3, release = 6.8;
    return [...plate,
      ...B.text({ id: "card", text: "Halfway", role: "headline", align: "center", x, y: ctx.safe.top, w, at: 0.3, until: 3 }, ctx),
      ...flashes.map(([media, at, n], i) => B.photo({ id: `f${i}`, media, frame: "letterbox", motion: "still", enter: "cut", exit: "cut", at, until: at + n / 30 }, ctx)).flat(),
      ...B.hold({ id: "black", at: black, until: title }, ctx),
      ...B.text({ id: "name", text: "Halfway", role: "display", align: "center", x, y: Math.round(ctx.height * 0.4), w, at: title, until: release }, ctx),
      ...B.reveal({ at: title }, ctx),
      ...B.text({ id: "end", text: "In cinemas in May", role: "body", align: "center", x, y: Math.round(ctx.height * 0.45), w, at: release, until: SECONDS.title! }, ctx)];
  },

  // Kinetic: display words fill the frame and cut on the beat; the accent word grows into the next ground. The end: a
  // last line on the accent ground, on the bar of the reveal's ground, then a hard cut to the ground on the next bar.
  kinetic: (ctx, B) => {
    const { S, x, w } = frame(ctx);
    const c = clock(ctx, B, "kinetic-music-3", 4.8);
    // The reveal is the last word and the largest: "ONE" (one number left).
    const words = ["HALF\nEACH\nTIME", "ONE\nMILLION", "HALF\nTHEN\nHALF", "AGAIN\nAGAIN", "TWENTY\nLOOKS", "FINALLY\nFOUND", "ONE"];
    // A phrase every two beats (a word held two beats is Kinetic's rhythm).
    const at: number[] = [];
    // The first beat at least 0.85 s after the phrase before (about two beats), else 0.94 s on.
    words.forEach((_, i) => { if (i === 0) return void at.push(0); const b = c.beats.find((t) => t >= at[i - 1]! + 0.85); at.push(b !== undefined && b - at[i - 1]! <= 1.0 ? b : at[i - 1]! + 0.9); });
    // The reveal word grows into the accent ground on its own beat (exit "toGround"): the end is the cut to the ground.
    const ground = c.on(at[6]! + 0.94);
    const last = c.bars.find((t) => t > ground + 1)!;
    const second = c.beats.find((t) => t >= ground + 0.85)!;
    return [...c.bed,
      ...B.kineticWords({ id: "words", x, y: S.top, w, h: S.bottom - S.top, phrases: words.map((text, i) => ({ text, at: at[i]!, ...(i === words.length - 1 ? { exit: "toGround" as const, groundUntil: last } : {}) })), until: ground }, ctx),
      ...B.reveal({ at: at[6]! }, ctx),
      ...B.kineticWords({ id: "last", x, y: S.top, w, h: S.bottom - S.top, onAccent: true, phrases: [{ text: "TWENTY\nSTEPS", at: ground }, { text: "NO\nMORE", at: second }], until: last }, ctx),
      ...B.ground({ id: "end", color: "ground", enter: "cut", at: last }, ctx)];
  },

  // Courtside: the condensed words over the subject, the volt word that wins, the offer at the end.
  courtside: (ctx, B) => {
    const { S, x, w } = frame(ctx);
    const c = clock(ctx, B, "m-sparta", 2.6);
    // The picture starts under the end card's line, so no text runs across its edge.
    const top = Math.round(S.top + (S.bottom - S.top) * 0.42);
    // A phrase on each beat at least 0.8 s after the one before (a two-word phrase holds 0.9 s); the drop on "GO".
    const words = ["TWO", "LENGTHS", "ONE TEAM", "GO", "MONDAY", "6 AM"];
    const at: number[] = [];
    words.forEach((t, i) => { if (i === 0) return void at.push(0); const gap = words[i - 1]!.includes(" ") ? 0.95 : 0.8; const b = c.beats.find((q) => q >= at[i - 1]! + gap); at.push(b !== undefined && b - at[i - 1]! <= 1.05 ? b : at[i - 1]! + gap); });
    return [...c.bed,
      ...B.photo({ id: "shoes", media: "courtside-shoes", box: { x: 0, y: top, w: ctx.width, h: 900 }, motion: "push", amount: 0.02, at: 0 }, ctx),
      ...B.kineticWords({ id: "words", x, y: S.top, w, h: (S.bottom - S.top) * 0.34, phrases: words.map((text, i) => ({ text, at: at[i]! })), until: at[5]! + 0.9 }, ctx),
      ...B.reveal({ at: at[3]! }, ctx),
      ...B.endCard({ id: "end", name: "Tryouts", line: "Mon 6 AM, court 2", color: "accent", at: Math.max(5.6, at[5]! + 1.1), until: seconds }, ctx)];
  },

  // Schematic: the hairline grid, two gears and the chain between them, the active path in blue, a callout that
  // follows, and the answer drawn as a dimension.
  schematic: (ctx, B) => {
    const { S, x, w } = frame(ctx);
    // Two gears one above the other, the chain between them: the drawing owns the frame under the status line.
    const r1 = Math.round(w * 0.34), r2 = Math.round(w * 0.22);
    const a = { cx: Math.round(ctx.width / 2), cy: Math.round(ctx.height * 0.36), r: r1 }, b = { cx: Math.round(ctx.width / 2), cy: Math.round(ctx.height * 0.74), r: r2 };
    const gears = [...B.gear({ id: "ga", ...a, teeth: 24, color: "accent", at: 0 }, ctx), ...B.gear({ id: "gb", ...b, teeth: 14, at: 0.3 }, ctx)];
    return [...B.sheet({ id: "sheet", grid: "lines", at: 0 }, ctx),
      ...B.text({ id: "status", text: "24 to 14 teeth", role: "headline", x, y: S.top + overflow(ctx, "headline").top, w, pinned: true, at: 0 }, ctx),
      ...gears,
      ...B.belt({ id: "chain", a: { x: a.cx, y: a.cy, r: a.r }, b: { x: b.cx, y: b.cy, r: b.r }, links: 40, at: 0.8 }, ctx),
      ...B.callout({ id: "c1", label: "drive", number: 1, target: { x: Math.round(a.cx - r1 * 0.72), y: Math.round(a.cy - r1 * 0.72) }, x, y: Math.round(a.cy - r1 - ctx.lineHeight("label") * 1.4), avoid: gears, at: 2.2 }, ctx),
      ...B.reveal({ at: 3.6 }, ctx),
      ...B.dimension({ id: "end", from: { x: a.cx - r1, y: a.cy + r1 + 150 }, to: { x: a.cx + r1, y: a.cy + r1 + 150 }, offset: 0, text: "24 teeth", at: 3.6 }, ctx),
      ...B.hold({ id: "rest", at: 5.8, until: seconds }, ctx)];
  },

  // Nocturne: a statement in the large serif, its words fading in one after another; a slow fade through the ground;
  // the last statement as the card.
  nocturne: (ctx, B) => {
    const { S, x, w } = frame(ctx);
    // The statement is the image: fitted to the safe width, word by word, on a picture that fills the frame under it
    // (dimmed behind type).
    return [...B.quote({ id: "q", x, y: S.top, w, h: S.bottom - S.top, enter: "word", name: "Ilse Varo", job: "Archivist", picture: "nocturne-observatory-night",
      statements: [{ text: LINE, at: 0, until: 4.2 }, { text: "Twenty looks find it.", at: 4.2 }], at: 0 }, ctx),
      ...B.reveal({ at: 4.2 }, ctx)];
  },

};

/** Each signature film with its sound: the bed its direction asks for, placed on the film's declared reveal. */
export const SCENES: Record<string, (ctx: Ctx, B: B) => Node[]> = Object.fromEntries(Object.entries(DRAWN).map(([id, draw]) => [id, (ctx: Ctx, B: B) => {
  const nodes = draw(ctx, B);
  const reveal = nodes.find((n) => n.kind === "anchor" && n.id === "reveal") as { at?: number } | undefined;
  return [...sound(ctx, B, reveal?.at ?? (SECONDS[id] ?? seconds) * 0.6), ...nodes];
}]));

/** The system's signature film as one scene (the system comes from ctx), for the HyperFrames check:
 *  bun scripts/hf_check.ts examples/scenes/signature.ts <system> <seconds> --check-only */
export const scene = (ctx: Ctx, B: B): Node[] => SCENES[ctx.system.id]!(ctx, B);
