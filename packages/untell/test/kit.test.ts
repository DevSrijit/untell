// Unit tests for the files that init copies and writes: the kit list, the doc paths, AGENTS.md, the page rule.
import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { kitFilesFor, registryDir, rewriteDoc, walk } from "../src/kit";
import { copyKit } from "../src/init";
import { makeDeterministic, writePage } from "../src/build";
import { PAGE_MARKER, withAgentsSection } from "../src/templates";
import { listSystems } from "../src/systems";

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "untell-kit-")); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const ALL = ["remotion.tsx", "film.tsx", "scene/remotion.tsx", "three/remotion.tsx", "scene/hyperframes.ts", "scene/hf-entry.ts", "systems.ts", "scene/cover.test.ts", "scene/blocks/bar.ts"];

describe("kitFilesFor", () => {
  test("Remotion gets every file but tests", () => expect(kitFilesFor(ALL, "remotion")).toEqual(ALL.filter((f) => !f.endsWith(".test.ts"))));
  test("HyperFrames gets no Remotion renderer, no film helper and no tests", () =>
    expect(kitFilesFor(ALL, "hyperframes")).toEqual(["scene/hyperframes.ts", "scene/hf-entry.ts", "systems.ts", "scene/blocks/bar.ts"]));
});

describe("rewriteDoc", () => {
  test("repository paths become project paths", () => {
    const doc = "Read `src/system/scene/types.ts` and `systems/README.md`.\nimport type { Ctx } from \"../../src/system/scene/types\";\nsee systems/spec/SYSTEM.md";
    expect(rewriteDoc(doc, "src/untell")).toBe("Read `src/untell/scene/types.ts` and `src/untell/docs/systems/README.md`.\nimport type { Ctx } from \"../untell/scene/types\";\nsee src/untell/docs/systems/spec/SYSTEM.md");
    expect(rewriteDoc("`systems/{spec,pop}/SYSTEM.md`", "untell")).toBe("`untell/docs/systems/{spec,pop}/SYSTEM.md`");
  });
  test("a demo of the catalog links to the repository on the web, not to a file the project lacks", () => {
    const t = rewriteDoc("- Demo: [`examples/scenes/drawnMark.ts`](../examples/scenes/drawnMark.ts), 7 s", "untell");
    expect(t).toBe("- Demo: [`examples/scenes/drawnMark.ts` in the untell repository](https://github.com/devsrijit/untell/blob/main/examples/scenes/drawnMark.ts) (not installed in this project), 7 s");
  });
  test("a file named systems.ts is not a docs path", () => expect(rewriteDoc("`src/system/systems.ts`", "untell")).toBe("`untell/systems.ts`"));
});

describe("the registry and copyKit", () => {
  const reg = registryDir();
  test("the registry holds the kit, 20 systems, the fonts and no tests or repository media", () => {
    const kit = walk(join(reg, "kit"));
    expect(kit.some((f) => f.endsWith(".test.ts"))).toBe(false);
    expect(kit).toContain("scene/hf-entry.ts");
    expect(kit).toContain("film.tsx");
    expect(kit.filter((f) => f.startsWith("grain/") && f.endsWith(".png")).length).toBe(8);
    expect(readFileSync(join(reg, "kit/media.gen.ts"), "utf8")).toContain("export const MEDIA: Record<string, MediaInfo> = {};");
    expect(listSystems(join(reg, "docs/systems")).length).toBe(20);
    expect(walk(join(reg, "fonts")).filter((f) => f.endsWith(".woff2")).length).toBeGreaterThan(20);
  });
  test("Remotion: the kit goes to src/untell with docs, and its fonts (fonts.gen.ts imports them)", () => {
    const d = tmp();
    const files = copyKit(d, "remotion");
    expect(files).toContain("src/untell/remotion.tsx");
    expect(files).toContain("src/untell/film.tsx");
    expect(files).toContain("src/untell/docs/systems/riso/SYSTEM.md");
    expect(files.some((f) => f.startsWith("src/untell/fonts/"))).toBe(true);
    // Every font file that the kit's loaders import is in the kit's fonts folder: no network request for a font.
    for (const m of readFileSync(join(d, "src/untell/fonts.gen.ts"), "utf8").matchAll(/from "\.\/fonts\/([\w-]+\.woff2)"/g)) expect(files).toContain(`src/untell/fonts/${m[1]}`);
    const blocks = readFileSync(join(d, "src/untell/scene/BLOCKS.md"), "utf8");
    expect(blocks).toContain("`src/untell/scene/types.ts`");
    expect(blocks).not.toContain("src/system/");
    expect(blocks).toContain("## Hard rules");
    expect(blocks).not.toContain("## Boundaries");
  });
  test("HyperFrames: the kit goes to untell with fonts and without Remotion files", () => {
    const d = tmp();
    const files = copyKit(d, "hyperframes");
    expect(files).toContain("untell/scene/hf-entry.ts");
    expect(files).not.toContain("untell/remotion.tsx");
    expect(files).not.toContain("untell/film.tsx");
    expect(existsSync(join(d, "untell/fonts/geist-latin-400-normal.woff2"))).toBe(true);
    expect(readFileSync(join(d, "untell/docs/systems/README.md"), "utf8").startsWith("> Copied by untell")).toBe(true);
  });
});

describe("AGENTS.md", () => {
  test("a new file gets a heading and the section", () => expect(withAgentsSection(null, "remotion")).toMatch(/^# Agent instructions\n\n<!-- untell:start -->/));
  test("the section is added once, then replaced", () => {
    const once = withAgentsSection("# Mine\n\nKeep this.\n", "hyperframes");
    expect(once.startsWith("# Mine\n\nKeep this.\n\n<!-- untell:start -->")).toBe(true);
    expect(withAgentsSection(once, "hyperframes")).toBe(once);
    expect(withAgentsSection(once, "remotion").match(/untell:start/g)!.length).toBe(1);
  });
});

describe("writePage", () => {
  test("writes a missing page, rewrites an untell page, backs up another page once", () => {
    const d = tmp();
    expect(writePage(d, `${PAGE_MARKER} one`)).toBe("wrote index.html");
    expect(writePage(d, `${PAGE_MARKER} two`)).toMatch(/rewrote/);
    writeFileSync(join(d, "index.html"), "<html>mine</html>");
    expect(writePage(d, `${PAGE_MARKER} three`)).toMatch(/index.html.before-untell/);
    expect(readFileSync(join(d, "index.html.before-untell"), "utf8")).toBe("<html>mine</html>");
    expect(readFileSync(join(d, "index.html"), "utf8")).toBe(`${PAGE_MARKER} three`);
  });
});

test("makeDeterministic swaps Math.random and requestAnimationFrame", () => {
  const out = makeDeterministic("a=Math.random();requestAnimationFrame(f)");
  expect(out).not.toContain("Math.random()");
  expect(out).toContain("__vsRandom();__vsFrame(f)");
});
