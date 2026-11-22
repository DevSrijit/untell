// The align declarations read as the detector reads every rule's: `// untell-ignore <rule> <id> @<from>-<to>: <reason>`,
// an id in square brackets, a span, the block call on the next line; and the report says what each suppresses.
import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { declarationLines, ignoresIn } from "./frame";
import { analyse, declares, type AlignFrame } from "../../src/system/scene/align";

const dir = mkdtempSync(join(tmpdir(), "untell-decl-"));
const f = join(dir, "scene.ts");
writeFileSync(f, `// untell-ignore align/near-miss [stage-ready] @5-6: a bracket id (the old docs) and a span
// untell-ignore align/centre: binds to the block call on the next line
  const b = B.badge({ id: "row1-badge", text: "cone 6" }, ctx);
// untell-ignore align/rhythm tiles: matches nothing
`);
const ig = ignoresIn([f]);

test("brackets, spans and the next line's block are read as the detector reads them", () => {
  expect(ig[0]).toMatchObject({ check: "align/near-miss", nodes: ["stage-ready"], span: [5, 6] });
  expect(ig[1]).toMatchObject({ check: "align/centre", nodes: ["row1-badge"], scope: "the block call on the next line" });
});

test("a span covers only its frames; the report says what each declaration suppresses, or the selector that would match", () => {
  const frame = (t: number): AlignFrame => ({ t, width: 1920, height: 1080, ignores: ig, els: [
    { id: "row1-badge-pill", kind: "rect", box: { x0: 100, y0: 100, x1: 300, y1: 161 } },
    { id: "row1-badge-text", kind: "text", box: { x0: 130, y0: 102, x1: 270, y1: 158 }, text: { baseline: 143, cap: 30, xh: 22, fontPx: 43, ink: { x0: 130, y0: 113, x1: 270, y1: 143 } } },
  ] });
  expect(analyse(frame(1)).issues.find((i) => i.el === "row1-badge-text")?.ignored).toBe("binds to the block call on the next line");
  expect(declares(ig[0]!, "align/near-miss", ["stage-ready-title"], 5.5)).toBe(true);
  expect(declares(ig[0]!, "align/near-miss", ["stage-ready-title"], 7)).toBe(false);
  const lines = declarationLines(ig, [{ kind: "centre", el: "row1-badge-text", target: { el: "row1-badge-pill" }, t0: 1, t1: 2, ignored: "x" },
    { kind: "rhythm", el: "card3", target: { el: "card2" }, t0: 2, t1: 3 }]);
  expect(lines[1]).toContain("suppresses 1 finding(s)");
  expect(lines[2]).toContain("declare // untell-ignore align/rhythm card3 @2.00-3.00");
});
