// Primary reel: why a circle's area is π r².
// The classic proof. Cut the circle into 32 equal wedges. Unroll each half into a comb: its arcs
// straighten into an edge of half the circumference, π r. Zip the two combs together. The wedges
// make a shape close to a rectangle, π r wide and r tall, so the area is π r × r = π r².
//
// Colour roles keep one meaning for the whole film: accent (red) is the top half of the circle,
// accent3 (blue) is the bottom half, accent2 (yellow) is the radius r. Ink is text and measurement.
//
// Raw nodes: the wedges and the two half discs are path nodes with tracks, because no block draws a
// circle sector. Everything else is a block. Jost has no Greek glyphs, so the π is built from three
// carried ink bars (carry boxes) at the size of the text beside it.
//
// Media. The system allows pictures in a support role, cut into a circle, a square or a triangle.
// The film opens on one picture: an orange slice (primary-orange; its source and licence are in assets/media.json),
// graded through ink to ground, cut into a large circle off centre. As the red half slides in from the left and the
// blue half from the right, it cuts away on the frame they land, and the proof starts. No text sits on the photo.
// Sound. primary-music-506 (mallets and strings) enters at 12.495 s, 20 ms before a downbeat. Every time of the
// film is a beat of the bed, from beats() on the track's map (90 BPM, a beat every 20 frames): the halves land on a
// beat, the knives cut on the beat where the bass comes in, each turn and each lock lands on a beat, and the formula
// lands on the loudest accent of the phrase. The proof completes on a bar line.
// Effects: a pop when the halves land, a click when the wedges finish their quarter turn, a pop when
// the two combs lock together.
import type { Ctx, Key, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { TypeRole } from "../../src/system/systems";
import { go, seq } from "../../src/system/scene/context";
import { baselineOf, textPlace } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";

export const system = "primary";
export const seconds = 14.5;

/** Snaps a time to the 30 fps frame grid, so both renderers act on the same frame. */
const fr = (t: number) => Math.round(t * 30) / 30;
const TRACK = "primary-music-506";
const TRACK_FROM = 12.495; // 20 ms before the downbeat at 12.515 s: the bar where the strings join the mallets.
const PHOTO = "primary-orange";

type Box = { x: number; y: number; w: number; h: number };
type Piece = { kind: "pi"; bars: [Box, Box, Box] } | { kind: "text"; text: string; box: Box };

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const { left, right, top } = ctx.safe;
  const out: Node[] = [];
  const f = 1 / 30;

  // ---- Formula type: body-role text scaled to a larger role, with a π built from three bars. ----
  // Jost at weight 500: x-height 0.47 em, stem 0.11 em (measured on a render).
  const setLine = (tokens: string[], x: number, baseline: number, as: TypeRole): Piece[] => {
    const S = ctx.size(as);
    const k = S / ctx.size("body");
    const space = ctx.measure(" ", "body") * k;
    const pieces: Piece[] = [];
    let cx = x;
    for (const t of tokens) {
      if (t === "π") {
        const xh = 0.47 * S, st = 0.11 * S, bw = 0.6 * S;
        const yTop = baseline - xh;
        pieces.push({ kind: "pi", bars: [
          { x: cx, y: yTop, w: bw, h: st },
          { x: cx + 0.1 * S, y: yTop, w: st, h: xh },
          { x: cx + 0.39 * S, y: yTop, w: st, h: xh },
        ] });
        cx += bw + 0.14 * S; // π sits close to the r it multiplies
      } else {
        const box = textPlace(ctx, t, "body", cx, baseline, as);
        pieces.push({ kind: "text", text: t, box });
        cx += box.w + space;
      }
    }
    return pieces;
  };
  const widthOf = (ps: Piece[]) => {
    const last = ps[ps.length - 1]!;
    const end = last.kind === "pi" ? last.bars[0].x + last.bars[0].w : last.box.x + last.box.w;
    const start = ps[0]!.kind === "pi" ? ps[0]!.bars[0].x : (ps[0] as { box: Box }).box.x;
    return end - start;
  };
  // Show a set line (static), or carry it from one set line to another.
  const carryPieces = (id: string, from: Piece[], to: Piece[], o: { show: number; at?: number; until?: number }) => {
    from.forEach((p, i) => {
      const q = to[i]!;
      const at = (o.at ?? o.show) + (o.at ? i * ctx.dur.stagger : 0);
      if (p.kind === "pi" && q.kind === "pi") {
        p.bars.forEach((b, j) => out.push(...B.carry({ id: `${id}-${i}-pi${j}`, color: "ink", from: b, to: q.bars[j]!, at, show: o.show, until: o.until }, ctx)));
      } else if (p.kind === "text" && q.kind === "text") {
        out.push(...B.carry({ id: `${id}-${i}`, text: p.text, role: "body", color: "ink", from: p.box, to: q.box, at, show: o.show, until: o.until }, ctx));
      }
    });
  };
  const show = (id: string, ps: Piece[], at: number, until?: number, stagger = true) =>
    ps.forEach((p, i) => carryPieces(`${id}${i}`, [p], [p], { show: at + (stagger ? i * ctx.dur.stagger : 0), until }));

  // ---- Geometry ----
  const N = 32, m = N / 2, D = 360 / N; // wedges, wedges per half, wedge angle (deg)
  const R = 220;
  const rad = (a: number) => (a * Math.PI) / 180;
  const w = 2 * R * Math.sin(rad(D / 2)); // chord of one wedge
  const h = R * Math.cos(rad(D / 2)); // apex to chord
  const cx = ctx.width / 2;
  // The top edge (chord line) of the finished shape, low in the frame, so the proof fills the lower half and the
  // formula the upper.
  const T = Math.round(ctx.height * 0.547);
  const split = 70; // each half moves this far from the centre
  const Cy = T + h + split; // circle centre
  const X0 = cx - ((m + 0.5) * w) / 2; // left end of the finished shape
  const P = (a: number, y = Cy) => [cx + R * Math.cos(rad(a)), y + R * Math.sin(rad(a))] as const;
  const n2 = (v: number) => Math.round(v * 100) / 100;
  const wedgeD = (a0: number, a1: number) => {
    const [x0, y0] = P(a0), [x1, y1] = P(a1);
    return `M${n2(cx)} ${n2(Cy)}L${n2(x0)} ${n2(y0)}A${R} ${R} 0 0 1 ${n2(x1)} ${n2(y1)}Z`;
  };
  const circleBox = { x: cx - R, y: Cy - R, w: 2 * R, h: 2 * R };

  // ---- Times ----
  // The bed's beats in film time (beats() of the track from where it enters). Each motion lands on a beat: a start is
  // the landing beat less the motion's length.
  const g = beats(TRACK, { from: TRACK_FROM, until: seconds });
  const beat = (t: number) => g.onBeat(t);
  const BEAT = (g.beats[1] ?? 0.67) - (g.beats[0] ?? 0);
  const { enter, move } = ctx.dur;
  const tLand = beat(1.5); // the half discs land over the photo
  const tIn = fr(tLand - enter);
  const tKnife = beat(3.5); // the bass comes in
  const tSwap = 4.6, tSplit = fr(beat(5.5) - move);
  const tUnrolled = beat(tSplit + move + 1.2); // the middle wedges finish their turn on the second beat after the split
  const tUnroll = fr(tUnrolled - 1.5 * move);
  const tDim = beat(tUnrolled + BEAT); // the top edge is measured a beat later
  const tZipped = beat(tDim + 2 * BEAT); // the combs lock two beats after that
  const tZip = fr(tZipped - 1.3 * move);
  const tRect = beat(tZipped + BEAT); // "Almost a rectangle", and the height
  const tAccent = g.strongest(tRect + 1.5, tRect + 2.5)?.t ?? beat(tRect + 2); // the loudest accent of the phrase
  const tTimes = beat(tAccent);
  const tFormula = fr(tTimes - move); // π r lands on that accent
  const done = g.onBar(tTimes + BEAT / 2); // the proof completes on the next bar line

  // Beat 1, the hook: the photo, large and off centre. An orange slice cut into a circle 0.85 of the frame wide, its
  // right edge past the frame's edge (a shape may leave the frame), on frame 0. It cuts away as the two half discs
  // start to slide in: the slice becomes the circle of the proof. (The photo block has no `rotate`, so the slice is
  // not set at an angle as before.)
  const big = Math.round(ctx.width * 0.85);
  const bigBox = { x: Math.round(ctx.width - big * 0.8), y: Math.round(Cy - big / 2), w: big, h: big };
  out.push(...B.photo({ id: "orange", media: PHOTO, box: bigBox, shape: "circle", motion: "still", exit: "cut", at: -1, until: tLand }, ctx));

  // The circle as two half discs, in the content layer so they slide in over the photo (which is a backdrop plate).
  // Red slides in from the left, blue from the right, on the horizontal axis.
  const step = (on: number, off?: number): Key[] => {
    const k: Key[] = [{ t: 0, v: on <= 0 ? 1 : 0 }];
    if (on > 0) k.push({ t: on, v: 0 }, { t: on + f, v: 1, curve: "step" });
    if (off !== undefined) k.push({ t: off, v: 1 }, { t: off + f, v: 0, curve: "step" });
    return k;
  };
  out.push(
    { id: "half-top", kind: "path", d: `M${cx - R} ${Cy}A${R} ${R} 0 0 1 ${cx + R} ${Cy}Z`, fill: "accent", layer: 0, box: circleBox,
      tracks: { opacity: step(tIn, tSwap), x: seq([{ t: 0, v: -(cx + R) }], go(ctx, tIn, -(cx + R), 0, "enter")) } },
    { id: "half-bot", kind: "path", d: `M${cx + R} ${Cy}A${R} ${R} 0 0 1 ${cx - R} ${Cy}Z`, fill: "accent3", layer: 0, box: circleBox,
      tracks: { opacity: step(tIn, tSwap), x: seq([{ t: 0, v: cx + R }], go(ctx, tIn, cx + R, 0, "enter")) } },
  );

  // The hook: "Why is the area of a circle π r²?"
  // The baseline of the hook's "π r²?" and of the formula's first line: under two headline lines at the top.
  const yHook = Math.round(top + 2 * ctx.lineHeight("headline") + ctx.size("display"));
  const tHook = 3.2;
  out.push(...B.text({ id: "ask", x: left, y: top + 8, text: "Why is a circle's area", role: "label", color: "inkMuted", at: 0.15, until: tHook }, ctx));
  show("hero", setLine(["π", "r²?"], left, yHook, "display"), 0.45, tHook);
  // The radius, in yellow, from the centre to the top of the circle. It draws when the halves land.
  out.push(...B.rule({ id: "radius", x1: cx, y1: Cy, x2: cx, y2: Cy - R, color: "accent2", weight: 2, at: tLand, until: tHook }, ctx));
  out.push(...B.text({ id: "r-on-circle", x: cx - 44, y: Cy - R * 0.8 - ctx.lineHeight("body") / 2, text: "r", role: "body", color: "onAccent", at: tLand + BEAT / 2, until: tHook }, ctx));

  // Beat 2: cut. Knife lines in the ground colour cross the circle, then the halves part.
  out.push(...B.title({ id: "t-cut", x: left, y: top, w: right - left, text: `Cut ${N} wedges`, role: "headline", maxLines: 2, at: tKnife, until: fr(tUnroll - 0.3) }, ctx));
  for (let i = 0; i < m; i++) {
    const a = 180 + i * D;
    const [x1, y1] = P(a), [x2, y2] = P(a - 180);
    out.push(...B.rule({ id: `knife${i}`, x1, y1, x2, y2, color: "ground", weight: 0.5, pace: "enter", at: tKnife + i * f * 1.5, until: tSwap }, ctx));
  }

  // The wedges: on at the swap, with a ground outline that keeps the cuts.
  const order = (i: number) => Math.abs(i - (m - 1) / 2); // unroll from the middle out
  for (let half = 0; half < 2; half++) {
    for (let i = 0; i < m; i++) {
      // Slot i counts from the left. Top half: angles 180..360. Bottom half: 180..0.
      const a0 = half === 0 ? 180 + i * D : 180 - (i + 1) * D;
      const phi = a0 + D / 2;
      const target = half === 0 ? 270 : 90; // arc up (teeth point down) / arc down (teeth point up)
      const apexX = half === 0 ? X0 + (i + 0.5) * w : X0 + (i + 1) * w;
      const tu = tUnroll + (half === 1 ? 0.2 : 0) + Math.floor(order(i)) * f;
      const y: Key[] = half === 0
        ? seq([{ t: 0, v: 0 }], go(ctx, tSplit, 0, -split, "move"))
        : seq([{ t: 0, v: 0 }], go(ctx, tSplit, 0, split, "move"), go(ctx, tZip, split, T - Cy, "move", 1.3));
      out.push({
        id: `wedge-${half}-${i}`, kind: "path", d: wedgeD(a0, a0 + D), fill: half === 0 ? "accent" : "accent3",
        stroke: "ground", width: ctx.stroke * 0.5, join: "round", layer: -1, box: circleBox, origin: [0.5, 0.5],
        // Each wedge turns about the circle's centre, not its own: the orbit is the point.
        orbit: true,
        tracks: {
          opacity: step(tSwap),
          y,
          x: seq([{ t: 0, v: 0 }], go(ctx, tu, 0, apexX - cx, "move", 1.5)),
          rotate: seq([{ t: 0, v: 0 }], go(ctx, tu, 0, target - phi, "move", 1.5)),
        },
      });
    }
  }

  // Beat 3: unroll. The top edge is the top half's rim: half of 2πr.
  out.push(...B.title({ id: "t-unroll", x: left, y: top, w: right - left, text: "Unroll each half", role: "headline", maxLines: 2, exit: "cut", at: beat(tUnroll), until: tRect }, ctx));
  const dimY = T - 42;
  const xa = X0, xb = X0 + m * w; // the top comb's chords: m·w ≈ π r
  out.push(...B.rule({ id: "dim-pr", x1: xa, y1: dimY, x2: xb, y2: dimY, color: "ink", ticks: true, at: tDim }, ctx));
  const prBase = dimY - 26;
  const prProbe = setLine(["π", "r"], 0, prBase, "body");
  const prLabel = setLine(["π", "r"], (xa + xb) / 2 - widthOf(prProbe) / 2, prBase, "body");
  // The dimension's own label ("π r") names the edge: half the circumference, π r.

  // Beat 4: zip the combs together. Height: one radius.
  out.push(...B.title({ id: "t-rect", x: left, y: top, w: right - left, text: "Almost a rectangle", role: "headline", maxLines: 2, at: tRect, until: fr(done - ctx.dur.exit) }, ctx));
  const midY = T + h / 2;
  const barX = X0 - 26;
  out.push(...B.rule({ id: "dim-r", x1: barX, y1: midY - R / 2, x2: barX, y2: midY + R / 2, color: "accent2", weight: 2, at: tRect }, ctx));
  const rBase = baselineOf(ctx, "body", midY - ctx.lineHeight("body") / 2);
  const rLabel = setLine(["r"], left + 2, rBase, "body");

  // Beat 5: the labels carry up into the formula. π r × r = π r².
  const y1 = yHook, y2 = yHook + ctx.lineHeight("display");
  const line1 = setLine(["π", "r", "×", "r"], left, y1, "display");
  const line2 = setLine(["=", "π", "r²"], left, y2, "display");
  carryPieces("pr", prLabel, line1.slice(0, 2), { show: tDim + 0.35, at: tFormula });
  carryPieces("rr", rLabel, line1.slice(3, 4), { show: tRect + 0.25, at: tFormula + 0.15 });
  show("times", line1.slice(2, 3), tTimes);
  show("result", line2, done);
  // The proof completes in one flat colour on the last bar: the zipped wedges become one rectangle, π r by r, with
  // the result set inside it. It holds to the end.
  const rectW = (m + 0.5) * w;
  out.push(...B.shape({ id: "area", kind: "rect", x: X0, y: T, w: rectW, h, fill: "accent", enter: "cut", at: done }, ctx));
  out.push(...B.text({ id: "result-label", text: "π r²", role: "headline", color: "onAccent", keepCase: true, align: "center", x: X0, y: T + (h - ctx.lineHeight("headline")) / 2, w: rectW, at: done }, ctx));
  out.push(...B.reveal({ at: done, of: "area" }, ctx));
  out.push(...B.hold({ at: done, until: seconds }, ctx));

  // Sound. The music is the clock; the bed fades under the last second, at the level the block sets for the mix
  // target. The track has no drop, so it enters on the downbeat measured above (align), where the strings join.
  // Each effect has a cause on screen, and the hit block puts its peak one frame after it; the hits set their level
  // against the bed.
  const bed = B.music({ media: TRACK, align: { track: TRACK_FROM, film: 0 }, until: seconds, fadeOut: 1 }, ctx);
  out.push(...bed);
  out.push(...B.hit({ id: "pop-halves", media: "primary-pop", at: tLand, bed }, ctx));
  out.push(...B.hit({ id: "click-turn", media: "primary-click", at: tUnrolled, bed }, ctx));
  out.push(...B.hit({ id: "pop-zip", media: "primary-pop", at: tZipped, bed }, ctx));

  return out;
};
