import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { hsl, lint, RULES } from "./rules";

const ids = (src: string, scope: "auto" | "any" | "scene" = "any") => lint(src, { scope }).map((f) => f.rule);
const SCENE = `export const system = "spec";\nexport const seconds = 8;\nexport const scene = (ctx, B) => [\n`;

describe("the rules", () => {
  test("every rule has a unique id, a why and a fix", () => {
    expect(new Set(RULES.map((r) => r.id)).size).toBe(RULES.length);
    for (const r of RULES) { expect(r.why.length, r.id).toBeGreaterThan(20); expect(r.fix.length, r.id).toBeGreaterThan(10); expect(!!r.pattern || !!r.file, r.id).toBe(true); }
  });
  test("hsl reads hue and lightness", () => {
    expect(Math.round(hsl("#0b1437")!.h)).toBe(228);
    expect(hsl("#fff")!.l).toBe(1);
  });
});

describe("tells in any video code", () => {
  const cases: [string, string, string][] = [
    ["tell/navy-ground", `<div style={{ background: "#0b1437" }} />`, `<div style={{ background: "#0d0d0d" }} />`],
    ["tell/navy-ground", `background: linear-gradient(135deg, #060b24 0%, #101a4a 100%);`, `background: #f5f5f0;`],
    ["tell/purple", `const accent = "#8b5cf6";`, `const accent = "#d3ee2b";`],
    ["tell/gradient", `background: "radial-gradient(circle, red, blue)"`, `background: "ground"`],
    ["tell/gradient-text", `WebkitBackgroundClip: "text"`, `color: "ink"`],
    ["tell/glow", `filter: "blur(40px)"`, `transform: "scale(1.1)"`],
    ["tell/glow", `boxShadow: "0 0 60px #60a5fa"`, `boxShadow: "0 1px 2px #0002"`],
    ["tell/default-font", `fontFamily: "Inter, sans-serif"`, `fontFamily: "Anton"`],
    ["tell/eyebrow", `<p>INTRODUCING</p>`, `<p>Introducing the 994 mm pendulum</p>`],
    ["tell/emoji", `title: "Ship faster 🚀"`, `title: "Ship faster"`],
    ["tell/cliche-copy", `<h1>Supercharge Your Workflow</h1>`, `<h1>One turn of the pedals</h1>`],
    ["tell/cliche-copy", `text: "The all-in-one platform"`, `text: "8.44 m"`],
    ["tell/placeholder", `name: "Example Corp"`, `name: "Vonitel"`],
    ["tell/feature-cards", `<h2>Key Features</h2>`, `<h2>Water boils at 100 °C</h2>`],
    ["tell/default-ease", `ease: "power2.inOut"`, `ease: "enter"`],
    ["tell/default-ease", `transition: "all 300ms ease-in-out"`.replace('"all 300ms ease-in-out"', '"ease-in-out"'), `curve: "linear"`],
    ["tell/random", `const x = Math.random() * 100;`, `const x = seeded(frame) * 100;`],
    ["tell/scale-from-zero", `gsap.from(el, { scale: 0, duration: 0.5 })`, `gsap.from(el, { scale: 0.94, opacity: 0 })`],
    ["tell/scale-from-zero", `transform: "scale(0)"`, `transform: "scale(0.5)"`],
    ["tell/bounce", `spring({ frame, fps, config: { damping: 5, mass: 1 } })`, `spring({ frame, fps, config: { damping: 200 } })`],
    ["tell/bounce", `transition: { type: "spring", bounce: 0.6 }`, `transition: { type: "spring", bounce: 0.15 }`],
    ["tell/slow-open", `const opacity = interpolate(frame, [0, 45], [0, 1]);`, `const opacity = interpolate(frame, [0, 6], [0, 1]);`],
    ["tell/particles", `const particles = useMemo(() => make(80), []);`, `const parts = useMemo(() => make(80), []);`],
    ["tell/particles", `<Confetti count={200} />`, `<Counter count={200} />`],
    ["tell/window-chrome", `<span style={{ background: "#ff5f56" }} />`, `<span style={{ background: "#e8e4dc" }} />`],
    ["tell/icon-library", `import { Rocket } from "lucide-react";`, `import { rocket } from "./shapes";`],
    ["tell/text-shadow", `textShadow: "0 2px 4px #000"`, `textShadow: "none"`],
  ];
  for (const [rule, bad, good] of cases) test(`${rule}: ${bad.slice(0, 40)}`, () => {
    expect(ids(bad)).toContain(rule);
    expect(ids(good)).not.toContain(rule);
  });
  test("fade-everything needs many fades and few moves", () => {
    const fades = Array.from({ length: 6 }, (_, i) => `const o${i} = { opacity: interpolate(frame, [0, 20], [0, 1]) };`).join("\n");
    expect(ids(fades)).toContain("tell/fade-everything");
    expect(ids(fades + "\n" + "const m = { translateY: 4, scale: 1, rotate: 2, x: 1 };")).not.toContain("tell/fade-everything");
  });
  test("uniform-stagger: one value four times", () => {
    expect(ids("stagger: 0.1,\nstagger: 0.1,\nstagger: 0.1,\nstagger: 0.1,")).toContain("tell/uniform-stagger");
    expect(ids("stagger: 0.1,\nstagger: 0.06,\nstagger: 0.1,\nstagger: 0.2,")).not.toContain("tell/uniform-stagger");
  });
  test("silent: a long film with no sound", () => {
    expect(ids("export const seconds = 14;\nconst a = 1;")).toContain("tell/silent");
    expect(ids("export const seconds = 14;\nout.push(...B.music({ media: 'm' }, ctx));")).not.toContain("tell/silent");
    expect(ids("export const seconds = 6;")).not.toContain("tell/silent");
  });
  test("silent: a film that states it is silent, with a reason, passes; with no reason or beside sound, it is an error", () => {
    expect(ids('export const silent = "the brief forbids sound";\nexport const seconds = 14;\nconst a = 1;')).not.toContain("tell/silent");
    expect(ids('export const silent = "";\nexport const seconds = 14;\nconst a = 1;')).toContain("tell/silent");
    const scene = (body: string) => `export const system = "mark";\nexport const scene = () => [];\n${body}`;
    expect(ids(scene('export const silent = "";\nexport const seconds = 6;'), "scene")).toContain("scene/silent");
    expect(ids(scene('export const silent = "no sound in the brief";\nexport const seconds = 6;\nout.push(...B.music({ media: "m" }, ctx));'), "scene")).toContain("scene/silent");
    expect(ids(scene('export const silent = "no sound in the brief";\nexport const seconds = 6;'), "scene")).not.toContain("scene/silent");
  });
  test("silent: a system with no music may be silent, with no declaration", () => {
    // Raw's mix is "none": silence is its sound. A system with music still needs a sound.
    expect(ids('export const system = "raw";\nexport const seconds = 12;\nconst a = 1;')).not.toContain("tell/silent");
    expect(ids('<div data-system="raw" data-duration="12"></div>')).not.toContain("tell/silent");
    expect(ids('export const system = "kinetic";\nexport const seconds = 12;\nconst a = 1;')).toContain("tell/silent");
  });
  test("uniform-scenes: four scenes of one length", () => {
    expect(ids(Array.from({ length: 5 }, () => `<Sequence durationInFrames={90}>`).join("\n"))).toContain("tell/uniform-scenes");
    expect(ids([60, 90, 45, 120, 90].map((n) => `<Sequence durationInFrames={${n}}>`).join("\n"))).not.toContain("tell/uniform-scenes");
  });
  test("centred-stack: every text centred", () => {
    expect(ids(Array.from({ length: 5 }, () => `textAlign: "center",`).join("\n"))).toContain("tell/centred-stack");
    expect(ids(Array.from({ length: 5 }, () => `textAlign: "center",`).join("\n") + `\ntextAlign: "left",`)).not.toContain("tell/centred-stack");
  });
  test("a comment is not code", () => {
    expect(ids(`// never use "linear-gradient(...)" here\nconst a = 1; /* Math.random() */`)).toEqual([]);
  });
  test("untell-ignore silences one rule on its line or the next", () => {
    expect(ids(`// untell-ignore tell/random: a seed for a test\nconst x = Math.random();`)).toEqual([]);
    expect(ids(`const x = Math.random(); // untell-ignore tell/*`)).toEqual([]);
    expect(ids(`// untell-ignore tell/gradient\nconst x = Math.random();`)).toContain("tell/random");
  });
});

describe("the untell scene contract", () => {
  const bad: [string, string][] = [
    ["scene/raw-colour", `{ id: "a", kind: "rect", fill: "#ff0000" },`],
    ["scene/raw-type", `{ fontSize: 40 },`],
    ["scene/raw-motion", `{ curve: [0.2, 0, 0, 1] },`],
    ["scene/effect", `{ boxShadow: "0 0 4px black" },`],
    ["scene/magic-position", `...B.text({ id: "t", x: 120, y: 640, text: "a", role: "body", at: 0 }, ctx),`],
    ["scene/unsafe-text", `...B.text({ id: "t", x: 0, y: ctx.safe.top, text: "a", role: "body", at: 0 }, ctx),`],
    ["scene/real-name", `...B.text({ id: "t", x: s.left, y: s.top, text: "Contoso Clinic", role: "body", at: 0 }, ctx),`],
  ];
  for (const [rule, line] of bad) test(rule, () => {
    expect(ids(SCENE + line + "\n];", "auto")).toContain(rule);
    expect(ids(line), `${rule} is for scenes only`).not.toContain(rule);
  });
  test("duplicate-id", () => {
    expect(ids(SCENE + `...B.text({ id: "t", at: 0 }, ctx),\n...B.rule({ id: "t", at: 0 }, ctx),\n];`, "auto")).toContain("scene/duplicate-id");
  });
  test("no-hook: nothing starts in the first half second", () => {
    expect(ids(SCENE + `...B.text({ id: "t", at: 1.2 }, ctx),\n];`, "auto")).toContain("scene/no-hook");
    expect(ids(SCENE + `...B.text({ id: "t", at: 0 }, ctx),\n...B.text({ id: "u", at: 2 }, ctx),\n];`, "auto")).not.toContain("scene/no-hook");
 
    // A first-use test: a B.measure call is not a block, and a block at rest on frame 0 (at: -1) starts the film.
    expect(ids(SCENE + `...B.shape({ id: "s", at: -1 }, ctx),\n...B.text({ id: "u", at: B.measure("title", { id: "m", at: 6 }, ctx).h }, ctx),\n];`, "auto")).not.toContain("scene/no-hook");
    expect(ids(SCENE + `...B.text({ id: "u", at: beat(2), w: B.measure("title", { id: "m", at: 6 }, ctx).w }, ctx),\n];`, "auto")).not.toContain("scene/no-hook");
    expect(ids(SCENE + `...B.text({ id: "u", at: 2, w: B.measure("title", { id: "m", at: 0 }, ctx).w }, ctx),\n];`, "auto")).toContain("scene/no-hook");
  });
});

describe("sound in a scene", () => {
  const scene = (body: string) => SCENE + body + "\n];";
  test("music-entry: a typed from, but not peakAt or align", () => {
    expect(ids(scene(`...B.music({ media: "m", from: 12.4, until: 12 }, ctx),`), "auto")).toContain("scene/music-entry");
    expect(ids(scene(`...B.music({ media: "m", peakAt: 6, until: 12 }, ctx),`), "auto")).not.toContain("scene/music-entry");
  });
  test("fixed-volume", () => {
    expect(ids(scene(`...B.music({ media: "m", peakAt: 6, volume: 0.8 }, ctx),`), "auto")).toContain("scene/fixed-volume");
    expect(ids(scene(`...B.music({ media: "m", peakAt: 6 }, ctx),`), "auto")).not.toContain("scene/fixed-volume");
  });
  test("typed-times: typed times beside music with no beat grid", () => {
    const rows = [1.2, 2.5, 3.1, 4.4].map((t, i) => `...B.text({ id: "t${i}", at: ${t} }, ctx),`).join("\n");
    expect(ids(scene(`...B.music({ media: "m", peakAt: 6 }, ctx),\n` + rows), "auto")).toContain("scene/typed-times");
    expect(ids(scene(`const g = beats("m", from);\n...B.music({ media: "m", peakAt: 6 }, ctx),\n` + rows), "auto")).not.toContain("scene/typed-times");
    expect(ids(scene(rows), "auto"), "no music, no grid to miss").not.toContain("scene/typed-times");
  });
  test("typed-hit: a typed time, but not on or a computed time", () => {
    expect(ids(scene(`...B.hit({ id: "h", media: "click", at: 3.2 }, ctx),`), "auto")).toContain("scene/typed-hit");
    expect(ids(scene(`...B.hit({ id: "h", media: "click", on: { nodes, id: "t" } }, ctx),`), "auto")).not.toContain("scene/typed-hit");
    expect(ids(scene(`...B.hit({ id: "h", media: "click", at: g[4] }, ctx),`), "auto")).not.toContain("scene/typed-hit");
  });
});

describe("patched blocks and hand-built scenes", () => {
  const scene = (body: string) => SCENE + body + "\n];";
  test("patched-block: a .map chained on a block call, on the same line or the next", () => {
    expect(ids(scene(`...B.wipe({ id: "w", at: 1 }, ctx).map((n) => ({ ...n, layer: -1 })),`), "auto")).toContain("scene/patched-block");
    expect(ids(scene(`...B.photo({ id: "p", media: "m", box: go(ctx, 1, 0, 1), at: 0 }, ctx)\n  .map((n) => n),`), "auto")).toContain("scene/patched-block");
  });
  test("patched-block: a .map on a const that holds a block's output", () => {
    expect(ids(scene(`const held = B.photo({ id: "p", media: "m", at: 0 }, ctx);\nout.push(...held.map((n) => n));`), "auto")).toContain("scene/patched-block");
  });
  test("patched-block: a string with a parenthesis does not end the call", () => {
    expect(ids(scene(`...B.text({ id: "t", text: "a (b", role: "body", at: 0 }, ctx).map((n) => n),`), "auto")).toContain("scene/patched-block");
  });
  test("patched-block: a deep import, but not a type import or the index", () => {
    const deep = `import { overflow } from "../../src/system/scene/blocks/text";\n`;
    expect(ids(deep + scene(""), "auto")).toContain("scene/patched-block");
    expect(ids(`import type { BLOCKS } from "../../src/system/scene/blocks";\nimport type { TextProps } from "../../src/system/scene/blocks/text";\n` + scene(""), "auto")).not.toContain("scene/patched-block");
  });
  test("patched-block: a .map over plain data or a block's props is fine", () => {
    expect(ids(scene(`const widths = lines.map((l) => ctx.measure(l, "display"));\n...B.text({ id: "t", text: words.map((w) => w).join(" "), role: "body", at: 0 }, ctx),`), "auto")).not.toContain("scene/patched-block");
  });
  test("hand-built: six raw rect, path or text nodes", () => {
    const node = (k: string, i: number) => `{ id: "n${i}", kind: "${k}", x: 0, y: 0 },`;
    const five = ["rect", "rect", "path", "text", "path"].map(node).join("\n");
    expect(ids(scene(five), "auto")).not.toContain("scene/hand-built");
    expect(ids(scene(five + "\n" + node("rect", 9)), "auto")).toContain("scene/hand-built");
    expect(ids(scene(five + "\n" + node("image", 9)), "auto")).not.toContain("scene/hand-built");
    const shapes = Array.from({ length: 7 }, (_, i) => `...B.shape({ id: "s${i}", kind: "rect", x: 0, y: 0, w: 9, h: 9, at: 0 }, ctx),`).join("\n");
    expect(ids(scene(shapes), "auto"), "a block's kind prop is not a raw node").not.toContain("scene/hand-built");
  });
  test("raw-node-why: a raw node asks for the comment of hard rule 14; a comment that names the block tried answers it", () => {
    const raw = `{ id: "strand", kind: "path", d: "M0 0L0 9" },`;
    expect(ids(scene(raw), "auto")).toContain("scene/raw-node-why");
    expect(ids(scene(`// Tried rope and belt: belt has no open end.\n` + raw), "auto")).not.toContain("scene/raw-node-why");
    expect(ids(scene(`// A strand of the rope.\n` + raw), "auto"), "a comment that names no block tried").toContain("scene/raw-node-why");
    expect(ids(scene(`...B.shape({ id: "s", kind: "rect", x: 0, y: 0, w: 9, h: 9, at: 0 }, ctx),`), "auto"), "a block's kind prop is not a raw node").not.toContain("scene/raw-node-why");
  });
  test("both rules are for scenes only", () => {
    expect(ids(`const a = B.wipe({ at: 1 }, ctx).map((n) => n);`)).not.toContain("scene/patched-block");
  });
});

describe("the library's own reels", () => {
  const dir = join(import.meta.dir, "../../examples/reels");
  test("no reel patches a block's output: each one asks the block for a prop", () => {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      const found = lint(readFileSync(join(dir, f), "utf8")).filter((x) => x.rule === "scene/patched-block");
      expect(found.map((x) => `${f}:${x.line}`), f).toEqual([]);
    }
  });
  test("have no errors", () => {
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
      const errors = lint(readFileSync(join(dir, f), "utf8")).filter((x) => x.severity === "error");
      expect(errors.map((e) => `${f}:${e.line} ${e.rule}`), f).toEqual([]);
    }
  });
});

describe("scene/case-collision", () => {
  test("two files in one folder that differ only by case collide; other pairs do not", () => {
    const { caseCollisions } = require("./rules");
    expect(caseCollisions(["src/films/halving.ts", "src/films/Halving.tsx"])).toEqual([["src/films/halving.ts", "src/films/Halving.tsx"]]);
    expect(caseCollisions(["src/films/halving.ts", "src/films/halving.film.tsx", "src/films/UntellExample.tsx", "src/films/untell-example.ts"])).toEqual([]);
    expect(caseCollisions(["a/halving.ts", "b/Halving.tsx"])).toEqual([]);
  });
});
