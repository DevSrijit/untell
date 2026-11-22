import { describe, expect, test } from "bun:test";
import { contrast } from "../../color";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import { colorOf } from "../layout";
import type { ColorRole } from "../roles";
import type { Node } from "../types";
import { codeBlock } from "./codeBlock";
import { MIN_BAND, MIN_TEXT, over, PLAIN, signature, SIGNATURE, tintAlpha } from "./signature";

const ctxOf = (id: string) => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.4);
};
const CODE = ["function gcd(a, b) {", "  while (b > 0) {", "    [a, b] = [b, a % b]; // swap", "  }", "  return a;", "}", "gcd(1071, 462);"];
const code = (id: string) => codeBlock({ id: "c", x: 60, y: 300, w: 900, h: 700, lines: CODE, at: 0.4, enter: "rise", highlight: [{ line: 2, at: 2 }, { line: 3, at: 3 }, { line: 5, at: 4 }] }, ctxOf(id));
const byId = (nodes: Node[], id: string) => nodes.find((n) => n.id === id)!;

describe("signature", () => {
  test("composites like a browser: half white over black is mid grey", () => {
    expect(over("#FFFFFF", "#000000", 0.5)).toBe("#808080");
    expect(over("#336699", "#FFFFFF", 1)).toBe("#336699");
  });

  test.each(SYSTEMS.filter((s) => !(s.id in SIGNATURE)).map((s) => [s.id]))("%s keeps the plain signature", (id) => {
    expect(signature(ctxOf(id))).toEqual(PLAIN);
    const band = byId(code(id), "c-band");
    expect(band.kind === "rect" && band.fill).toBe("rule");
    expect(code(id).some((n) => n.id === "c-bar")).toBe(false);
  });

  test("Manual's band is the teal accent at a tint, and every text on it passes 4.5:1", () => {
    const s = SYSTEMS.find((x) => x.id === "manual")!;
    const sig = signature(ctxOf("manual")).codeBlock;
    const texts = [...new Set<ColorRole>(["ink", "inkMuted", sig.number, ...Object.values(sig.syntax)])];
    const a = tintAlpha(s, texts);
    expect(a).not.toBeNull();
    const band = over(colorOf(s, "accent"), colorOf(s, "surface"), a!);
    for (const t of texts) expect(contrast(colorOf(s, t), band), `${t} on ${band}`).toBeGreaterThanOrEqual(MIN_TEXT);
    expect(contrast(band, colorOf(s, "surface"))).toBeGreaterThanOrEqual(MIN_BAND);
    // The block draws it: an accent band at that opacity, a solid gutter bar, and the lit number in the accent.
    const nodes = code("manual");
    const b = byId(nodes, "c-band");
    expect(b.kind === "rect" && b.fill).toBe("accent");
    expect(Math.max(...b.tracks!.opacity!.map((k) => k.v))).toBeCloseTo(a!, 6);
    const bar = byId(nodes, "c-bar");
    expect(bar.kind === "rect" && bar.fill).toBe("accent");
    expect(Math.max(...bar.tracks!.opacity!.map((k) => k.v))).toBe(1);
    const lit = byId(nodes, "c-n1-lit");
    expect(lit.kind === "text" && lit.color).toBe("accentText");
    // Literals are teal, comments muted, keywords ink.
    const colours = new Map(nodes.filter((n) => n.kind === "text").map((n) => [(n as { text: string }).text.trim(), (n as { color: string }).color]));
    expect(colours.get("1071")).toBe("accentText");
    expect(colours.get("// swap")).toBe("inkMuted");
  });

  test("Manual cuts a jump of more than one line, and sweeps a jump of one", () => {
    const ys = byId(code("manual"), "c-band").tracks!.y!;
    // Line 2 to 3 sweeps on the move curve; line 3 to 5 cuts in one frame.
    expect(ys.some((k) => k.curve === "move")).toBe(true);
    const step = ys.find((k) => k.curve === "step")!;
    expect(step.t).toBeCloseTo(4 + 1 / 30, 1);
    // The plain systems sweep every jump.
    expect(byId(code("spec"), "c-band").tracks!.y!.some((k) => k.curve === "step")).toBe(false);
  });

  test("a scene prop wins over the signature", () => {
    const nodes = codeBlock({ id: "c", x: 60, y: 300, w: 900, h: 700, lines: CODE, at: 0.4, enter: "rise", band: "rule", highlight: [{ line: 2, at: 2 }] }, ctxOf("manual"));
    const b = byId(nodes, "c-band");
    expect(b.kind === "rect" && b.fill).toBe("rule");
  });

  test("a system with no passing tint keeps the rule band", () => {
    // Title's muted ink fails 4.5:1 on any tint of its accent: the block must not draw an unreadable band.
    const s = SYSTEMS.find((x) => x.id === "title")!;
    expect(tintAlpha(s, ["ink", "inkMuted"])).toBeNull();
  });
});
