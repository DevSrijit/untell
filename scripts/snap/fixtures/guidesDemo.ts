// A scene that names its guides (withGuides): a 6-column grid with 24 px gutters in the safe area, a baseline unit
// of 8 px, and a named line "fold". It places on them with guideHelpers, and plants two faults for snap to find:
//   - the third stat card starts 6 px right of its column's left edge (a hand-typed x),
//   - the caption's baseline sits 3 px off the baseline grid.
// Snap reports both against the guides (a guide never moves) and draws the guides in cyan in its overlay.
// It records as align-guides (src/films/align.tsx), Spec at 16:9. The names are random draws for this fixture.
import type { Ctx, Node } from "../../../src/system/scene/types";
import { guideHelpers, resolveGuides, withGuides, type GuideFrame, type GuideSpec } from "../../../src/system/scene/align";
import { onBaseline } from "../../../src/system/scene/layout";

export const seconds = 3;
export const system = "spec";

const GUIDES = (f: GuideFrame): GuideSpec => ({
  cols: { count: 6, gutter: 24 },
  baseline: { unit: 8 },
  lines: { fold: { y: Math.round(f.height * 0.56) } },
});

const build = (ctx: Ctx, _B: unknown): Node[] => {
  const g = guideHelpers(resolveGuides(GUIDES, ctx));
  const show = { opacity: [{ t: 0, v: 1 }] };
  const out: Node[] = [];
  const top = ctx.safe.top;
  // Every text sits on the baseline grid: onBaseline puts its baseline on the grid line at or after a y.
  const on = (role: "headline" | "body" | "label", y: number) => onBaseline(ctx, role, g.baseline(y));
  out.push({ id: "title", kind: "text", x: g.col(1).x0, y: on("headline", top + 60), text: "Velmora field kettle", role: "headline", color: "ink", tracks: show });
  out.push({ id: "lede", kind: "text", x: g.col(1).x0, y: on("body", top + 150), text: "Boils a litre in four minutes on one burner.", role: "body", color: "inkMuted", tracks: show });
  const fold = g.line("fold")!;
  const stats = [["4 min", "to boil"], ["1.2 l", "to fill"], ["640 g", "to carry"]] as const;
  stats.forEach(([v, l], i) => {
    const s = g.span(1 + 2 * i, 2);
    const x = s.x + (i === 2 ? 6 : 0); // planted: 6 px off its column
    out.push({ id: `stat${i}-card`, kind: "rect", x, y: fold, w: s.w, h: 220, fill: "surface", stroke: "rule", strokeWidth: 1, radius: 12, tracks: show });
    out.push({ id: `stat${i}-value`, kind: "text", x: x + 32, y: on("headline", fold + 90), text: v, role: "headline", color: "ink", tracks: show });
    out.push({ id: `stat${i}-label`, kind: "text", x: x + 32, y: on("label", fold + 170), text: l, role: "label", color: "inkMuted", tracks: show });
  });
  // The caption: placed by hand, 3 px off the baseline grid.
  out.push({ id: "caption", kind: "text", x: g.col(1).x0, y: on("label", fold + 280) + 3, text: "Measured at sea level, 20 °C water.", role: "label", color: "inkMuted", tracks: show });
  out.push({ id: "hold", kind: "hold", tracks: show });
  return out;
};

export const scene = withGuides(build, GUIDES);
