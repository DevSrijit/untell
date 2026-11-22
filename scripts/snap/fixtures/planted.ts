// Planted fixtures for the align/* checks, in the style of examples/detector/planted.ts. One "bad" film plants one flaw
// for each check; the "good" film is the same scene with each flaw fixed by a snap relation (withSnap) or by the value
// a designer would use. They record as align-planted-bad and align-planted-good (src/films/align.tsx), Spec at 16:9.
// The names are random draws for this fixture.
//
// The flaws, top to bottom:
//   centre    a name in a pill, 5 px above where its ink is centred (the good film centres it with a snap relation),
//   near-miss a card whose bottom edge ends 10 px under the rule of the strip beside it, in one panel,
//   baseline  two labels side by side in one row, the second 4 px low,
//   rhythm    four tiles in a row whose last gap is 4 px wider,
//   half-px   a 1 px rule centred on a whole px, so it covers two rows of px at half strength.
import type { Ctx, Node } from "../../../src/system/scene/types";
import { withSnap, type SnapRel } from "../../../src/system/scene/align";

export const seconds = 2;
export const system = "spec";

const build = (bad: boolean) => (ctx: Ctx, _B: unknown): Node[] => {
  const S = ctx.safe;
  const lh = (r: "label" | "body") => ctx.lineHeight(r);
  const out: Node[] = [];
  const at = [{ t: 0, v: 1 }];
  const show = { opacity: at };
  // centre: a pill and a name.
  const name = "Wren Okafor";
  const pw = Math.round(ctx.measure(name, "label") + 80), ph = Math.round(lh("label") * 1.25);
  out.push({ id: "pill", kind: "rect", x: S.left, y: S.top, w: pw, h: ph, fill: "accent", radius: ph / 2, tracks: show });
  out.push({ id: "pill-text", kind: "text", x: S.left + 40, y: S.top + Math.round((ph - lh("label")) / 2) - (bad ? 5 : 0), text: name, role: "label", color: "onAccent", tracks: show });
  // near-miss: a strip with a rule, and a card beside it.
  const y1 = S.top + 200;
  out.push({ id: "bench", kind: "rect", x: S.left - 24, y: y1 - 24, w: 1188, h: 200, fill: "surface", stroke: "rule", strokeWidth: 1, radius: 12, layer: -1, tracks: show });
  out.push({ id: "strip-label", kind: "text", x: S.left, y: y1 + 60, text: "Tide tables", role: "body", color: "ink", tracks: show });
  out.push({ id: "strip-rule", kind: "path", d: `M${S.left} ${y1 + 120}H${S.left + 700}`, stroke: "rule", width: 2, tracks: show });
  out.push({ id: "card", kind: "rect", x: S.left + 780, y: y1 - 14, w: 360, h: bad ? 144 : 134, fill: "accent", radius: 8, tracks: show });
  // baseline: two labels in one row.
  const y2 = S.top + 420;
  out.push({ id: "row-a", kind: "text", x: S.left, y: y2, text: "Halvard Pike", role: "label", color: "ink", tracks: show });
  out.push({ id: "row-b", kind: "text", x: S.left + 640, y: y2 + (bad ? 4 : 0), text: "Juno Varga", role: "label", color: "inkMuted", tracks: show });
  // rhythm: four tiles.
  const y3 = S.top + 560;
  [0, 1, 2, 3].forEach((i) => out.push({ id: `tile${i}`, kind: "rect", x: S.left + i * 200 + (bad && i === 3 ? 4 : 0), y: y3, w: 160, h: 100, fill: "rule", tracks: show }));
  // half-px: a 1 px rule.
  const y4 = S.top + 760;
  out.push({ id: "hair", kind: "path", d: `M${S.left} ${y4 + (bad ? 0 : 0.5)}H${S.left + 1100}`, stroke: "ink", width: 1, tracks: show });
  out.push({ id: "hold", kind: "hold", tracks: show });
  return out;
};

const FIX: SnapRel[] = [{ id: "c-fix", move: ["pill-text"], axis: "y", of: "pill-text", feature: "bandCy", to: "pill.cy", kind: "centre" }];

export const bad = { system, seconds, scene: build(true) };
export const good = { system, seconds, scene: withSnap(build(false), FIX) };
