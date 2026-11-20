// Tests for the build-time cover plan (cover.ts): where a cut-out's mask lands in the frame, and how
// placeBehind picks a layout. The recorded check (scripts/inspect/cover.py) judges real frames.
import { describe, expect, test } from "bun:test";
import { MEDIA } from "../media.gen";
import { SYSTEMS } from "../systems";
import { makeCtx } from "./context";
import { hiddenBy, placeBehind } from "./cover";
import type { Node } from "./types";

// A fake photo, 100 x 100 px, whose mask is solid in its right half and clear in its left half.
const cols = 8, rows = 8;
MEDIA["test-half"] = { kind: "photo",
  width: 100, height: 100, subject: [0.5, 0, 1, 1], centre: [0.5, 0.5], grade: "courtside",
  mask: { cols, rows, data: Array.from({ length: rows }, () => "0000ffff").join("") },
};
const system = SYSTEMS.find((s) => s.id === "courtside")!;
const ctx = makeCtx(system, 1000, 1000, (text) => text.length * 50);
const cut = (extra: Partial<Extract<Node, { kind: "image" }>> = {}) =>
  ({ id: "c", kind: "image", src: "test-half/subject.png", x: 0, y: 0, w: 1000, h: 1000, cutout: true, layer: 1, ...extra }) as Extract<Node, { kind: "image" }>;

describe("hiddenBy", () => {
  test("a rect over the solid half is hidden, over the clear half is not", () => {
    expect(hiddenBy(ctx, cut(), MEDIA["test-half"]!, [600, 100, 900, 400], 0)).toBeCloseTo(1, 5);
    expect(hiddenBy(ctx, cut(), MEDIA["test-half"]!, [100, 100, 400, 400], 0)).toBe(0);
    expect(hiddenBy(ctx, cut(), MEDIA["test-half"]!, [250, 100, 750, 400], 0)).toBeCloseTo(0.5, 5);
  });
  test("outside the crop box nothing is hidden", () => {
    expect(hiddenBy(ctx, cut({ x: 0, y: 0, w: 500, h: 500 }), MEDIA["test-half"]!, [600, 600, 900, 900], 0)).toBe(0);
  });
  test("an inner scale about the focus moves the edge", () => {
    // Scaled 2x about the centre, the solid half starts at x 500 still (the centre), and covers the whole right.
    const c = cut({ inner: { scale: [{ t: 0, v: 2 }] } });
    expect(hiddenBy(ctx, c, MEDIA["test-half"]!, [520, 0, 1000, 1000], 0)).toBeCloseTo(1, 5);
    // A rect left of centre stays clear.
    expect(hiddenBy(ctx, c, MEDIA["test-half"]!, [0, 0, 480, 1000], 0)).toBe(0);
  });
  test("a hidden image hides nothing", () => {
    expect(hiddenBy(ctx, cut({ tracks: { opacity: [{ t: 0, v: 0 }] } }), MEDIA["test-half"]!, [600, 100, 900, 400], 0)).toBe(0);
  });
});

describe("placeBehind", () => {
  const word = (x: number): Node[] => [{ id: "w", kind: "text", x, y: 400, text: "WORD", role: "headline", color: "ink" }];
  test("it keeps the layout whose letters stay clear of the subject", () => {
    const r = placeBehind(ctx, [cut()], [700, 520, 100], word, { from: 0, to: 0 });
    expect(r.ok).toBe(true);
    // Only x 100 keeps every letter under the limit; 520 puts letters on the solid half.
    expect(r.pick).toBe(100);
  });
  test("with no layout inside the limits it says so", () => {
    const r = placeBehind(ctx, [cut()], [600, 700], word, { from: 0, to: 0, quiet: true });
    expect(r.ok).toBe(false);
  });
  test("type above the cut-out's layer is not counted as hidden", () => {
    const r = placeBehind(ctx, [cut({ layer: -1 })], [700], word, { from: 0, to: 0, quiet: true });
    // No cut-out draws above the text, so nothing is measured and nothing passes as type behind a subject.
    expect(r.ok).toBe(false);
  });
});

describe("item 28: placeBehind looks where the recorded check looks", () => {
  test("it counts the cut-out's own move (its x track), and samples every frame up to and with `to`", () => {
    // The subject slides left over the word in the last 0.1 s only (from 0.9 s to 1.0 s).
    const sliding = cut({ tracks: { x: [{ t: 0, v: 0 }, { t: 0.9, v: 0 }, { t: 1.0, v: -380, curve: "linear" }] } });
    const word = (x: number): Node[] => [{ id: "w", kind: "text", x, y: 400, text: "WORD", role: "headline", color: "ink" }];
    const r = placeBehind(ctx, [sliding], [100], word, { from: 0, to: 1, quiet: true });
    expect(r.ok).toBe(false);
    expect(r.letter).toBeGreaterThan(0.22);
  });
  test("a move that covers the word only between two quarter-second samples is still caught", () => {
    const pass = cut({ tracks: { x: [{ t: 0, v: 0 }, { t: 0.3, v: 0 }, { t: 0.36, v: -380, curve: "linear" }, { t: 0.42, v: 0, curve: "linear" }] } });
    const word = (x: number): Node[] => [{ id: "w", kind: "text", x, y: 400, text: "WORD", role: "headline", color: "ink" }];
    expect(placeBehind(ctx, [pass], [100], word, { from: 0, to: 1, quiet: true }).ok).toBe(false);
    expect(placeBehind(ctx, [pass], [100], word, { from: 0, to: 1, step: 0.25, quiet: true }).ok).toBe(true);
  });
});
