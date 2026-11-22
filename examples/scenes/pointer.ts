// A pointer, told with box, arrow and camera: a stack slot holds an address, the arrow follows it
// down to the heap, and the camera travels with it. The heap sits below the first view on purpose.
import { withView } from "../../src/system/scene/context";
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 8;
export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const { left, right, top } = ctx.safe;
  const w = right - left;
  const tall = ctx.height > ctx.width;
  const drop = tall ? 760 : 520; // how far below the first view the heap sits, and how far the camera pans
  const lh = ctx.lineHeight("headline");
  const below = withView(ctx, { y: drop }); // the view after the camera pans down: the heap is read there
  const pad = ctx.size("label") * 0.9;
  const addr = "0x7ffe 3a10";
  // Boxes are sized from what they hold: the label row, then the value.
  const inner = (role: "headline" | "display", t: string) => ({ w: ctx.measure(t, role) + pad * 2, h: ctx.lineHeight("label") + ctx.lineHeight(role) + pad * 1.6 });
  const s1 = inner("headline", addr);
  const slot = { x: left, y: top + lh * 2.6, w: Math.max(s1.w, ctx.measure("stack · p", "label") + pad * 2), h: s1.h };
  const s2 = inner("display", "42");
  // The heap's label names its address in body, so it reads on a phone; the box is as wide as the label needs.
  const heapLabel = "heap · " + addr;
  const heapW = Math.max(s2.w, ctx.measure(heapLabel, "body") + pad * 2);
  // After the pan, the heap sits on the view's optical centre (46 % down the area from the text-safe top to the
  // picture-safe foot), kept inside the text-safe area, so the value owns the frame the film ends on.
  const foot = ctx.height - Math.ceil(ctx.system.margin * Math.min(ctx.width, ctx.height));
  const heapY = Math.round(Math.max(slot.y, Math.min(ctx.safe.bottom - s2.h - pad, top + (foot - top) * 0.46 - s2.h / 2))) + drop;
  // In the low band (9:16) text ends by lowBandRight, so the box's right edge keeps to it there.
  const lowBand = tall && heapY - drop + s2.h > ctx.safe.lowBandTop;
  const heap = { x: (lowBand ? ctx.safe.lowBandRight : right) - heapW, y: heapY, w: heapW, h: s2.h + ctx.lineHeight("body") - ctx.lineHeight("label") };
  return [
    ...B.title({ id: "h1", x: left, y: top, w, h: lh * 2.4, text: ["A pointer is", "an address."], role: "headline", at: 0.2, until: 3.6 }, ctx),
    // The stack slot leaves as the camera leaves it, so nothing sits under the platform's top bar.
    ...B.box({ id: "slot", ...slot, label: "stack · p", at: 0.9, until: 3.9 }, ctx),
    ...B.text({ id: "addr", text: addr, role: "headline", x: slot.x + pad, y: slot.y + slot.h - lh - pad * 0.6, at: 1.6, until: 3.9 }, ctx),
    // The heap comes on as the camera leaves the slot, so its label is never under the platform's controls.
    ...B.box({ id: "heap", ...heap, dash: true, label: heapLabel, labelRole: "body", at: 3.7 }, below),
    ...B.text({ id: "val", text: "42", role: "display", x: heap.x + pad, y: heap.y + heap.h - ctx.lineHeight("display") - pad * 0.6, at: 5.2 }, below),
    // The pointer leaves the slot's right edge and lands on the heap's top, right of the second headline.
    ...B.arrow({ id: "ptr", from: [slot.x + slot.w, slot.y + slot.h / 2], to: [heap.x + heap.w * 0.75, heap.y], bend: -0.12, key: true, color: "accent", at: 3.6 }, ctx),
    ...B.camera({ moves: [{ at: 3.6, y: drop }] }, ctx),
    ...B.title({ id: "h2", x: left, y: top + drop, w, h: lh * 2.4, text: ["Follow it to", "the value."], role: "headline", at: 4.6 }, below),
  ];
};
