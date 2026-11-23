// The Spec system's compound-interest film, built from scene blocks. It keeps the design and the
// timing of the hand-written HyperFrames film in examples/hyperframes/spec-compound.
//
// Geometry, 9:16: the grid outline is the text-safe area, x 120-888 px and y 288-1248 px. Text
// starts 1 px inside it (ctx.safe). Below y 840 px, text ends by x 780 px.
import { BLOCKS as B } from "../system/scene/blocks";
import type { Ctx, Node } from "../system/scene/types";
import { Blocks, SystemFilm } from "../system/remotion";

// $200 a month at 7 % a year, compounded monthly, deposits at each month's end.
const saved = (years: number) => { const r = 0.07 / 12, m = years * 12; return (200 * ((1 + r) ** m - 1)) / r; };
const early = Math.round(saved(40)); // starts at 25: $524,963
const late = Math.round(saved(30)); // starts at 35: $243,994

export function build(ctx: Ctx): Node[] {
  const st = ctx.dur.stagger;
  const L = 120; // the grid line; text sits at ctx.safe.left, 1 px inside it
  const x = ctx.safe.left;
  const W = 768;
  const lateEnd = L + (W * late) / early; // 477 px
  return [
    ...B.frameGrid({ id: "grid", columns: "none", at: 0 }, ctx),
    ...B.typeOn({ id: "label", text: "01 / Compound interest", x, y: 304, at: 0.2 }, ctx),

    // Scene 1, 0 to 4 s: the claim.
    ...B.title({ id: "s1-head", text: ["Time beats", "money."], role: "display", x, y: 400, w: W, at: 0.5, until: 4.0 }, ctx),
    ...B.title({ id: "s1-body", text: ["$200 a month at 7 %.", "One saver starts ten years later."], role: "body", color: "inkMuted", x, y: 700, w: W, at: 1.3, until: 4.0 }, ctx),

    // Scene 2, 4 to 8 s: the evidence, as two rows.
    ...B.title({ id: "s2-head", text: "Saved by age 65", role: "headline", x, y: 380, w: W, at: 4.25, until: 8.0 }, ctx),
    ...B.text({ id: "cap-early", text: "Starts at 25", role: "label", x, y: 500, at: 4.5 }, ctx),
    ...B.bar({ id: "bar-early", x: L, y: 552, w: W, h: 100, value: early, max: early, format: { prefix: "$" }, fill: "series1", at: 4.6 }, ctx),
    ...B.text({ id: "cap-late", text: "Starts at 35", role: "label", color: "inkMuted", x, y: 676, at: 4.5 + st * 3 }, ctx),
    ...B.bar({ id: "bar-late", x: L, y: 728, w: W, h: 100, value: late, max: early, format: { prefix: "$" }, fill: "series3", at: 4.6 + st * 3 }, ctx),
    // The dimension line under the late bar: the money that starting late gives up.
    ...B.rule({ id: "dim", x1: Math.round(lateEnd), y1: 872, x2: L + W, y2: 872, color: "ink", ticks: true, at: 6.1 }, ctx),
    ...B.text({ id: "dim-label", text: "−$280,969", role: "label", color: "inkMuted", x: Math.round(lateEnd) + 24, y: 892, at: 6.5 }, ctx),

    // Scene 3, 8 to 11.5 s: the gap becomes the answer.
    ...B.title({ id: "s3-head", text: "2.15×", role: "display", x, y: 980, w: W, at: 8.1 }, ctx),
    ...B.text({ id: "s3-cap", text: "Ten years sooner, 2.15 times the money.", role: "caption", color: "inkMuted", x, y: 1120, w: 660, at: 8.5 }, ctx),
  ];
}

export const SpecCompound = () => (
  <SystemFilm system="spec">
    <Blocks build={build} />
  </SystemFilm>
);
