import { describe, expect, test } from "bun:test";
import { hex, hexToRgb, resolve, srgbToOklch } from "./color";

describe("OKLCH conversion", () => {
  test("matches the reference values for the sRGB primaries", () => {
    // Reference OKLCH values for #FF0000, #008000 and #0000FF (Ottosson's matrices, as in CSS Color 4).
    expect(hex({ l: 0.627955, c: 0.257683, h: 29.2339 })).toBe("#FF0000");
    expect(hex({ l: 0.519752, c: 0.176858, h: 142.495 })).toBe("#008000");
    expect(hex({ l: 0.452014, c: 0.313214, h: 264.052 })).toBe("#0000FF");
    expect(hex({ l: 1, c: 0, h: 0 })).toBe("#FFFFFF");
  });

  test("round-trips through sRGB", () => {
    for (const h of ["#3A6EA5", "#D6431F", "#F5F1E8", "#1B1917"]) {
      expect(hex(srgbToOklch(hexToRgb(h)))).toBe(h);
    }
  });

  test("keeps lightness and hue when it reduces chroma to fit the gamut", () => {
    const wild = { l: 0.7, c: 0.4, h: 150 };
    const { chroma } = resolve(wild);
    expect(chroma).toBeLessThan(0.4);
    const back = srgbToOklch(resolve(wild).rgb);
    expect(back.l).toBeCloseTo(0.7, 2);
    expect(Math.abs(back.h - 150)).toBeLessThan(1.5);
  });
});

