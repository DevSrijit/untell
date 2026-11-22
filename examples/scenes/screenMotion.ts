// Renderer motion: a camera pans across three panels on a slight tilt, while a pinned caption stays in screen
// space. Each panel's bar rises and its text enters, so the frame step (Cutout, Riso: 12 fps) and the opaque
// rule (no fades) show on every move. The facts: water boils at 100 °C at sea level and near 90 °C at 3,000 m.
import type { BLOCKS } from "../../src/system/scene/blocks";
import { withView } from "../../src/system/scene/context";
import { pin, tilt } from "../../src/system/scene/screen";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 8;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = ctx.width;
  const panels = [
    { head: "Sea level", value: "100 °C", share: 1 },
    { head: "1,500 m", value: "95 °C", share: 0.95 },
    { head: "3,000 m", value: "90 °C", share: 0.9 },
  ];
  const out: Node[] = [];
  const pad = Math.round(ctx.lineHeight("body"));
  const barTop = S.top + ctx.lineHeight("headline") + ctx.lineHeight("display") + pad * 3;
  // The bars are graphics, so they may use the lower band; they stop above the caption line.
  const barBottom = S.bottom - ctx.lineHeight("body") - pad * 2;
  panels.forEach((p, i) => {
    const ox = i * W, at = i === 0 ? 0 : 1.2 + i * 2.4;
    // Each panel is read where the camera rests on it, so its blocks check that view's safe area.
    const v = withView(ctx, { x: ox });
    out.push(...B.text({ id: `head${i}`, x: ox + S.left, y: S.top, text: p.head, role: "headline", w: S.right - S.left, at }, v));
    out.push(...B.text({ id: `value${i}`, x: ox + S.left, y: S.top + ctx.lineHeight("headline") + pad, text: p.value, role: "display", keepCase: true,
      w: S.right - S.left, at: at + 0.2 }, v));
    // The bar is a graphic: it rises from the floor of the panel to its share of the full height.
    const full = barBottom - barTop, h = Math.round(full * p.share);
    out.push(...B.shape({ id: `bar${i}`, kind: "rect", x: ox + S.left, y: barBottom - h, w: Math.round((S.right - S.left) * 0.4), h, fill: "accent",
      exact: true, enter: "grow", at: at + 0.3 }, v));
    out.push(...B.shape({ id: `dot${i}`, kind: "circle", x: ox + S.right - 120, y: barBottom - 120, w: 120, h: 120, fill: "ink",
      moves: [{ at: at + 0.6, dx: 0, dy: -Math.round(h * 0.6) }], at: at + 0.3 }, v));
  });
  // The view travels to panel 2, then 3, and tilts 5 degrees on each pan, back to flat at rest.
  const cam = B.camera({ moves: [{ at: 3.2, x: W }, { at: 5.6, x: 2 * W }] }, ctx);
  const m = ctx.dur.move * 0.8;
  out.push(...tilt(cam, ctx, [{ at: 3.2, y: -5, scale: 0.8 }, { at: 3.2 + m, y: 0, scale: 0.8 }, { at: 5.6, y: -5, scale: 0.8 }, { at: 5.6 + m, y: 0, scale: 0.8 }]));
  // The caption rides through both pans in screen space.
  out.push(...pin(B.text({ id: "caption", x: S.left, y: S.bottom - ctx.lineHeight("body"), text: "Boiling point by altitude", role: "body", color: "inkMuted", at: 0 }, ctx)));
  return out;
};
