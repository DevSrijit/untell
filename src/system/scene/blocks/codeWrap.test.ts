// A code line that must wrap takes the fewest rows, breaks where a reader expects, and never leaves a lone short
// token on a row of its own ("mid =" | "(lo + hi)" | "// 2" in the narrow lower band at 9:16 was the fault).
import { describe, expect, test } from "bun:test";
import { wrapCode } from "./codeBlock";

/** A mono face: every character 29 px wide (body size in Manual at 9:16). */
const m = (t: string) => t.length * 29;
const rows = (line: string, room: number) => wrapCode(m, line, room, "test", "  ").rows;
const lone = (r: string) => !/\s/.test(r.trim()) && r.trim().length <= 4 && !/^(\/\/|[-+*/%<>=])/.test(r.trim());

describe("wrapCode", () => {
  test("a line that fits stays one row", () => {
    expect(rows("mid = (lo + hi) // 2", 700)).toEqual(["mid = (lo + hi) // 2"]);
  });
  test("the narrow lower band: two rows, the operator leads the second, no third row", () => {
    // The column the codeRest scene gives line 4 at 9:16 under lowBandTop.
    expect(rows("mid = (lo + hi) // 2", 437)).toEqual(["mid = (lo + hi)", "// 2"]);
  });
  test("with room for the right side: one break after the assignment", () => {
    expect(rows("mid = (lo + hi) // 2", 480)).toEqual(["mid =", "(lo + hi) // 2"]);
  });
  test("a call breaks just inside its outer bracket, not before a lone argument", () => {
    const r = rows("print(search(xs, 28))", 553);
    expect(r).toEqual(["print(", "search(xs, 28))"]);
  });
  test("an outer comma is the first choice, with even rows", () => {
    expect(rows("lo, hi = 0, len(xs) - 1", 553)).toEqual(["lo, hi = 0,", "len(xs) - 1"]);
  });
  test.each([
    ["while lo <= hi and xs[mid] != t:", 553], ["result = compute(alpha, beta, gamma) + 1", 600], ["x = a + b + c + d + e + f + g + h", 300],
    ["return fetch(url, timeout=30, retries=3)", 500], ["total += price * qty", 330],
  ] as const)("%s in %i px: rows fit, and no row is a lone short token", (line, room) => {
    const r = rows(line, room);
    r.forEach((row, k) => expect(m(row.trim())).toBeLessThanOrEqual(k ? room - m("  ") : room));
    expect(r.filter(lone)).toEqual([]);
    expect(r.join(" ").replace(/\s+/g, " ")).toBe(line.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/\(\s/g, "("));
  });
  test("a token wider than the column throws with the token", () => {
    expect(() => rows("averyveryverylongidentifiername_without_breaks", 400)).toThrow(/wider than the code column/);
  });
});
