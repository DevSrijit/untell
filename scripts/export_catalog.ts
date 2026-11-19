// Writes systems/BLOCKS.md: the catalog of building blocks for anyone who makes a film.
// It is generated from the block files themselves (their header comments and props types), the demo table
// (examples/scenes/demos.ts) and each system's block map (src/system/direction.ts), so it cannot drift from the code.
// Usage: bun scripts/export_catalog.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readdirSync } from "node:fs";
import { DEMOS } from "../examples/scenes/demos";
import { DIRECTION } from "../src/system/direction";
import { OLD_NAMES } from "../src/system/scene/blocks/guard";

const ROOT = resolve(import.meta.dir, "..");
const DIR = join(ROOT, "src/system/scene/blocks");

// The order an agent reaches for blocks: the words first, then pictures, the page, data, drawings, code, 3D, sound, time.
const GROUPS: [string, string[]][] = [
  ["Text and title", ["title", "text", "fitText", "wordSeries", "kineticWords", "typeOn", "quote", "captions", "lowerThird", "lockup", "endCard"]],
  ["Pictures", ["photo", "shape", "drawnMark", "shadowBars"]],
  ["Layout and grounds", ["ground", "frameGrid", "rows", "rule", "curve", "cross", "box", "steps", "split", "matrix"]],
  ["Data", ["lineChart", "barChart", "bar", "slopeChart", "dumbbell", "areaChart", "stackedBar", "waffle", "counter", "bigStat", "meter", "ranking", "numberLine", "timeline", "waveform"]],
  ["Diagrams", ["flow", "sequence", "tree", "cycle", "sheet", "gear", "belt", "pulley", "rope", "callout", "dimension", "formula", "arrow", "annotate", "highlight"]],
  ["Code and UI", ["codeBlock", "terminal", "pane", "ui"]],
  ["3D", ["product"]],
  ["Sound", ["sound"]],
  ["Camera and time", ["camera", "carry", "wipe", "hold", "reveal"]],
];

/** One line each: what the block is for, in words a stranger understands. */
const PURPOSE: Record<string, string> = {
  title: "The headline of a beat: it takes the largest type that fits its box and breaks into even lines.",
  text: "One placed line, or a few lines, in one type role: a kicker, a fact, a working, a credit.",
  fitText: "One short line scaled to fill a band or a slab: a number or a word as the subject.",
  wordSeries: "Single words that replace each other in one place, one per beat, at one size.",
  kineticWords: "Phrases cut on the beat in large type, with one accent word each.",
  typeOn: "Text that writes itself, a key at a time: a command, a label, a figure caption.",
  quote: "One statement in large type, with the speaker's name and job under a thin rule.",
  captions: "Subtitles from word timings, with the spoken word marked.",
  lowerThird: "A speaker's name and job beside a short rule, at the foot of the frame.",
  lockup: "A mark and a name on one axis, as one unit: a product, a studio, a film title.",
  endCard: "The last card of a film: the name and one line, landing on a beat and holding.",
  photo: "A prepared picture or clip that fills a box, graded for the system and framed on its subject.",
  shape: "A flat circle, square, triangle, rectangle or sector that enters, turns and moves.",
  drawnMark: "A brand mark from SVG paths, drawn on by its strokes, filled, and locked up with the name.",
  shadowBars: "Hard bars of shadow from a blind, across the frame (Noir only).",
  ground: "The ground of the frame changes colour on a beat.",
  frameGrid: "The system's grid drawn on the frame: the text-safe outline, the columns, the corner marks.",
  rows: "Rows that divide the text-safe area, with their guides drawn.",
  rule: "A straight line: a hairline, a divider, a dimension line with ticks, an edge of a figure.",
  curve: "A plain curve from a function or from points: a parabola, a trajectory, a cable traced on a photo.",
  cross: "A + mark that registers a point: a corner, a centre, a target.",
  box: "A bordered box with a label: a memory cell, a table cell, a slot.",
  steps: "A numbered list of 3 to 6 steps, one current at a time, with its progress.",
  split: "Two things side by side (or one over the other), point by point, with a verdict.",
  matrix: "A small table of values or checks, with one key column.",
  lineChart: "One or more series over a continuous axis, with direct labels at their ends.",
  barChart: "One value per category (or a small group), every bar labelled with its value.",
  bar: "One bar for one value, with its label: a quantity on its own.",
  slopeChart: "How each item changed between two states, as lines from left to right.",
  dumbbell: "A range or a change for each row: two dots on one line.",
  areaChart: "A total that grows over time, as a filled area, with an optional second area.",
  stackedBar: "How a whole splits into parts, for one or a few rows.",
  waffle: "A share of a whole as a grid of squares: 51 in 100.",
  counter: "A number that counts up to its value, digit by digit, with tabular figures.",
  bigStat: "One large figure with its label and its change: the number the film is about.",
  meter: "A quantity against its target, as a bar or a ring.",
  ranking: "Items ranked by a value, and how the order changes between two states.",
  numberLine: "Values placed on one axis (linear or log), each with a marker and a label.",
  timeline: "Dated events on one axis, one of them the key event.",
  waveform: "Signals as lanes of waves, and their sum: sound, noise, light.",
  flow: "Boxes joined by arrows, with packets that travel along a path: how a system works.",
  sequence: "Messages between actors over time, in order: a protocol, a conversation.",
  tree: "A hierarchy from a root, with one key path lit.",
  cycle: "Steps around a loop, lit one after another.",
  sheet: "A drawing sheet: its grid, crosshairs and title block, and the drawing fitted to it.",
  gear: "A gear or sprocket that turns at a true ratio.",
  belt: "A belt or chain around two wheels, on their outer tangents.",
  pulley: "A wheel with no teeth that turns and may move: the wheel of a hoist or a crane.",
  rope: "An open rope over pulleys, whose strands change length as a wheel moves.",
  callout: "A numbered label outside a drawing, with a short leader to the part it names.",
  dimension: "A dimension line with its value: how long a part is.",
  formula: "A short line of maths placed on a shape's edge, which stays there when the shape moves.",
  arrow: "A curved or straight arrow from one point to another, that draws itself.",
  annotate: "A label with a leader that names one part of a thing: a symbol, a figure, a word.",
  highlight: "One word marked: an underline, a marker band or a loop.",
  codeBlock: "Code at a readable size with line numbers, one line lit at a time.",
  terminal: "A shell session: commands typed at a human rate and their real output.",
  pane: "A panel that code, a shell and a picture share, so their edges align.",
  ui: "A small product interface kit: a window, list rows, a button, tabs, a toast and a cursor.",
  product: "A 3D object on a shot (turntable, push, orbit), lit and shadowed by the system.",
  sound: "Music, hits and key ticks placed by the film's own times and the track's beats.",
  camera: "Pans, zooms and whips of the whole scene, with text that stays put where it must.",
  carry: "One thing that keeps its identity and moves from one layout to the next.",
  wipe: "A wipe from one beat to the next, in the system's own manner.",
  hold: "A still stretch on purpose: it draws nothing and tells the checks the stillness is meant.",
  reveal: "The film's main reveal time: it draws nothing and tells the checks where the answer lands.",
};

/** The "which block for what" table: a task, the block, and the systems whose block map names the block. */
const TASKS: [string, string][] = [
  ["Say the one line of a beat", "title"],
  ["Set a kicker, a fact or a credit", "text"],
  ["Make one number or word the subject", "fitText"],
  ["Cut single words on the beat", "wordSeries"],
  ["Shout phrases on the beat", "kineticWords"],
  ["Type a command or a label", "typeOn"],
  ["Show what a person said", "quote"],
  ["Subtitle speech", "captions"],
  ["Name a speaker on footage", "lowerThird"],
  ["Show a name with its mark", "lockup"],
  ["End the film on the name", "endCard"],
  ["Show a picture or a clip", "photo"],
  ["Build with flat shapes", "shape"],
  ["Change the ground on a beat", "ground"],
  ["Compare values across categories", "barChart"],
  ["Show a trend over time", "lineChart"],
  ["Show a total that grows", "areaChart"],
  ["Show what changed between two states", "slopeChart"],
  ["Show a range or a gap per row", "dumbbell"],
  ["Split a whole into parts", "stackedBar"],
  ["Show a share as a count", "waffle"],
  ["Make one figure the subject", "bigStat"],
  ["Count up to a number", "counter"],
  ["Show progress to a target", "meter"],
  ["Rank items", "ranking"],
  ["Place values on a scale", "numberLine"],
  ["Put events in order", "timeline"],
  ["Show how a system works", "flow"],
  ["Show messages in order", "sequence"],
  ["Show a hierarchy", "tree"],
  ["Show a loop", "cycle"],
  ["Explain steps one at a time", "steps"],
  ["Compare two things point by point", "split"],
  ["Lay out a small table", "matrix"],
  ["Draw a part with its measures", "sheet"],
  ["Measure an edge", "dimension"],
  ["Name the parts of a drawing", "callout"],
  ["Point from one thing to another", "arrow"],
  ["Name one part of a thing", "annotate"],
  ["Mark one word", "highlight"],
  ["Show code", "codeBlock"],
  ["Run a command", "terminal"],
  ["Show a product interface", "ui"],
  ["Show a 3D object", "product"],
  ["Score the film", "sound"],
  ["Move the view", "camera"],
  ["Move one thing to its next place", "carry"],
  ["Pass to the next beat", "wipe"],
];

/** The consistency table: one name, one meaning, in every block. */
const NAMES: [string, string][] = [
  ["`at`", "When the block starts to enter, in seconds. A block given `at` changes on the first frame after it."],
  ["`until`", "When the block starts to leave, in seconds. Its exit always completes: an `until` inside the entrance starts the exit from where the entrance got to."],
  ["`enter`", "How the block comes on: a value of the system's vocabulary (\"rise\", \"fade\", \"cut\", \"line\", \"word\", \"grow\", \"slide\", \"draw\", \"dissolve\", \"type\", \"rest\"). Default: the system's vocabulary."],
  ["`exit`", "How the block leaves at `until` (title, photo, ground). Default: the way it came, or the system's vocabulary."],
  ["`from`, `to`", "Where a thing starts and ends: a point, a box, an edge, a value or a year. Never a time."],
  ["`clipStart`", "Where in a clip or a track playing starts, in seconds (photo footage, music)."],
  ["`role`", "A type role of the system (display, headline, body, caption, label). Never a person's job: that is `job`."],
  ["`job`", "What a person does, or where (lowerThird, quote)."],
  ["`box`", "The area a full-frame block fills when it is not the whole frame (photo, product, endCard). A block that always needs an area takes `x`, `y`, `w`, `h`."],
  ["`fit`", "What a text block does when its text does not fit its role: \"shrink\", \"wrap\" or \"throw\" (blocks/fit.ts)."],
  ["`pinned`", "The block stays in screen space while the camera pans or zooms. Every text block takes it."],
  ["`layer`", "The draw layer: -1 backdrop, 0 content (default), 1 overlay."],
];

/** The leading // comment of a file, as plain lines. */
function header(src: string) {
  const out: string[] = [];
  for (const line of src.split("\n")) {
    if (!line.startsWith("//")) break;
    out.push(line.replace(/^\/\/ ?/, ""));
  }
  return out.join("\n").trim();
}

/** The text of `export type <Name>Props = { ... };`, braces balanced. */
function propsType(src: string, name: string) {
  const start = src.search(new RegExp(`export type ${name[0]!.toUpperCase()}${name.slice(1)}Props\\b`));
  if (start < 0) return null;
  let depth = 0, i = src.indexOf("=", start);
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    if (ch === "}" || ch === ")" || ch === "]") depth--;
    if (ch === ";" && depth === 0) break;
  }
  return src.slice(start, i + 1);
}

/** The first sentence of a demo file's header comment. */
function demoLine(file: string) {
  const h = header(readFileSync(join(ROOT, "examples/scenes", `${file}.ts`), "utf8")).replace(/\s+/g, " ");
  // The first sentence; "The x scene:" before it names the file, so it goes.
  const m = h.match(/^(.*?\.)(\s|$)/);
  return (m ? m[1]! : h).replace(/^(The [\w-]+ scene|The [\w-]+ block|[A-Z][\w ]+ \([A-Z]\w+\)): /, "").replace(/^\w/, (c) => c.toUpperCase());
}

// Helper modules that are not blocks: shared geometry and the signature table that blocks read.
const HELPERS = new Set(["index.ts", "util.ts", "signature.ts", "guard.ts", "fit.ts", "measureBlock.ts", "compose.ts", "hand.ts", "handover.ts", "parts.ts", "figure.ts"]);
const files = new Set(readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !HELPERS.has(f)).map((f) => f.replace(/\.ts$/, "")));
const listed = new Set(GROUPS.flatMap(([, b]) => b));
for (const f of files) if (!listed.has(f)) throw new Error(`block ${f} is in no catalog group`);
for (const b of listed) if (!PURPOSE[b]) throw new Error(`block ${b} has no purpose line`);
for (const b of listed) if (!DEMOS.some((d) => d.block === b)) throw new Error(`block ${b} has no demo in examples/scenes/demos.ts`);

// Which systems name each block in their block map (use) or their "Do not use" list (avoid). The ui kit and the
// sounds are one entry each.
const KIT: Record<string, string> = { uiWindow: "ui", listRow: "ui", button: "ui", field: "ui", cursor: "ui", badge: "ui", tab: "ui", toast: "ui", music: "sound", hit: "sound", typing: "sound" };
const use: Record<string, Set<string>> = {}, avoid: Record<string, Map<string, string>> = {};
for (const [sys, d] of Object.entries(DIRECTION)) {
  for (const b of d.blocks) (use[KIT[b.block] ?? b.block] ??= new Set()).add(sys);
  for (const a of d.avoid) (avoid[KIT[a.block] ?? a.block] ??= new Map()).set(sys, a.why.replace(/\.$/, ""));
}
const name = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const sysList = (xs: Iterable<string>) => [...xs].map(name).join(", ");

const L: string[] = [];
L.push(`# Building blocks

Generated from the block code by \`scripts/export_catalog.ts\`. Do not edit.

A film is a **scene**: a function that takes the scene context and the blocks, and returns nodes.
Every block takes its place in px, a start time \`at\` in seconds, and an optional \`until\` when it leaves.
The design system decides every colour, font, size, curve and duration. Blocks never overlap their own text,
keep text inside the platform-safe area, and never let data overshoot. Each block below has a demo: a scene in
\`examples/scenes\` that shows it as a designer would use it, at 9:16 and 16:9, in the two systems that suit it best
(films \`cat-<block>-<system>\` and \`cat-<block>-<system>-wide\` in \`src/films/blocks/catalog.tsx\`).

\`\`\`ts
import type { Ctx, Node } from "../../src/system/scene/types";
import { lineAndBlock, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 8;
export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, line = "Years for money to double, by annual return";
  const lineH = B.measure("title", { id: "m", x: S.left, y: S.top, w: S.right - S.left, text: line, role: "headline", at: -10 }, ctx).h;
  const L = lineAndBlock(ctx, { lineH }); // the line at the top, the block's box under it
  return [
    ...B.title({ id: "line", text: line, role: "headline", ...L.line, at: 0 }, ctx),
    ...B.barChart({ id: "chart", ...L.block, title: "Years", categories: ["1 %", "7 %"], series: [{ label: "Years", values: [69.7, 10.2] }], key: 1, at: 0.6 }, ctx),
  ];
};
\`\`\`

- \`ctx.safe\` is the text-safe area. At 9:16 it ends at 65 % of the frame's height, and text below \`ctx.safe.lowBandTop\`
  must end by \`ctx.safe.lowBandRight\`. Graphics (shapes, chart marks, panels, pictures) may and should use the band
  under it: do not leave the lower part of a 9:16 frame empty by habit.
- Composition helpers (from \`src/system/scene/blocks\`): \`lineAndSubject\` (one line over one subject, on the optical
  centre), \`lineAndBlock\` (a line, then a block with text under it, and the room its graphics may take), \`lineInBand\`
  (the line in a band of its own beside a picture), \`lineOverPicture\` (the line on a picture's calm part), \`heroBox\`.
- Drawing helpers (from \`src/system/scene/blocks\`), for a mechanism drawn with \`shape\`: \`fitDrawing\` (scales a drawing
  to the system's \`figureBox\`, where a figure stands), \`boxAt\` (the box that puts a named point of a shape, such as a
  triangle's \`"apex"\`, on a given place), \`pointOf\` and \`pointAt\` (a point of a part at rest, and after its moves and
  turns), \`followPoint\` (the keys that keep a callout, a dimension or an arrow on a point of a moving part), and
  \`figure\` (the annotation plan of a drawing: give it to \`dimension\` and \`callout\` as \`figure\`, and they place
  themselves clear of the parts and of each other, in the text-safe area). A shape rests on another with \`on\`; it
  turns about \`pivot\` (default: the point it rests on).
- \`ctx.measure(text, role)\` and \`ctx.lineHeight(role)\` measure text; \`B.measure("<block>", props, ctx)\` returns the box a
  block draws, so a scene can stack a thing under it. \`ctx.dur\` holds the system's durations.
- \`landOn(ctx, t, (at, c) => B.<block>({ ..., at }, c))\` (from \`src/system/scene/blocks\`) builds a block so that its
  entrance arrives on time \`t\`, a beat: a hit \`on\` the block then plays on the beat. \`at: t - ctx.dur.enter\` arrives off the
  beat: a slide runs 1.4 x the enter duration and arrives 3 to 6 frames late; a grow or a fade arrives up to 2 frames early.
- **Anchors.** Some blocks name their parts so a scene can point at them: \`anchor(nodes, id)\` from context.ts returns a
  part's box, when it appears (\`at\`) and extra numbers (\`data\`). flow: \`<id>-node:<node id>\`, \`<id>-hop:<n>\`; codeBlock:
  \`<id>-line:<n>\`; waveform: \`<id>-lane:<n>\`; lockup: \`<id>-mark-box\`, \`<id>-name-box\`; photo: \`<id>-subject-box\`.
- **Layers** set the draw order: -1 backdrop, 0 content (default), 1 overlay. Inside a layer, lines and circles draw
  first, then boxes, then text.
- **Times.** A change at time t shows on the first frame after t, in every block. A block given \`until\` is gone (or
  starts to leave) on the frame that a block given that time as \`at\` shows, and its exit always completes. A time a
  block cannot honour throws with what to give. Any block with \`at\` before 0 by its entrance is at rest on frame 0.
- **Fit.** A block that sets its text in a smaller role than asked warns and names both roles. \`fit: "throw"\` stops;
  \`fit: "wrap"\` keeps the role on more lines where the block can.
- **Holds.** When a frame holds still for more than 3 s on purpose, add \`B.hold({ at, until })\`.
- **Overprint, grain, maths.** A node may set \`blend: "multiply"\` (Riso). The renderers draw a system's grain. In a
  system whose roles are set in capitals, give text blocks \`keepCase: true\` for "π r²".

## Which block for what

| Task | Block | Systems whose block map names it |
| --- | --- | --- |`);
for (const [task, b] of TASKS) L.push(`| ${task} | [\`${b}\`](#${b.toLowerCase()}) | ${use[b] ? sysList(use[b]!) : "any (no map names it yet)"} |`);
L.push(`
## One name, one meaning

The same prop has the same name and the same meaning in every block. An older name still works and warns once
(blocks/guard.ts, \`OLD_NAMES\`); \`contract.test.ts\` checks that it draws the same nodes as the new one.

| Prop | Meaning |
| --- | --- |`);
for (const [p, m] of NAMES) L.push(`| ${p} | ${m} |`);
L.push("", "Old names that still work:", "");
L.push("| Block | Old name | New name |", "| --- | --- | --- |");
for (const [b, pairs] of Object.entries(OLD_NAMES)) for (const [o, n] of pairs) L.push(`| ${b} | \`${o}\` | \`${n}\` |`);
L.push("", "## Index", "");
for (const [g, blocks] of GROUPS) L.push(`- **${g}:** ${blocks.map((b) => `[${b}](#${b.toLowerCase()})`).join(", ")}`);
L.push("");

for (const [g, blocks] of GROUPS) {
  L.push(`## ${g}\n`);
  for (const b of blocks) {
    const src = readFileSync(join(DIR, `${b}.ts`), "utf8");
    const d = DEMOS.find((x) => x.block === b)!;
    L.push(`### ${b}\n`);
    L.push(`**${PURPOSE[b]}**\n`);
    const suits = new Set([...(use[b] ?? []), d.light, d.dark]);
    const against = avoid[b] ? [...avoid[b]!].map(([s, why]) => `${name(s)} (${why})`).join("; ") : "none named";
    L.push(`- Suits: ${sysList(suits)}.`);
    L.push(`- Works against: ${against}.`);
    const systems = d.light === d.dark ? name(d.light) : `${name(d.light)} and ${name(d.dark)}`;
    const shared = DEMOS.filter((x) => x.file === d.file).length > 1 ? ` (shared with ${DEMOS.filter((x) => x.file === d.file && x.block !== b).map((x) => x.block).join(", ")})` : "";
    L.push(`- Demo: [\`examples/scenes/${d.file}.ts\`](../examples/scenes/${d.file}.ts)${shared}, ${d.seconds} s, in ${systems}: ${demoLine(d.file)}`);
    L.push("");
    L.push(header(src) || "(no description)");
    // A file with one block has <Name>Props; a file with several (sound, ui) lists each exported props type.
    const t = propsType(src, b);
    const types = t ? [t] : [...src.matchAll(/export type (\w+)Props\b/g)].map((m) => propsType(src, m[1]!)).filter((x): x is string => !!x);
    if (types.length) L.push("\n```ts\n" + types.join("\n\n") + "\n```");
    L.push("");
  }
}
writeFileSync(join(ROOT, "systems/BLOCKS.md"), L.join("\n") + "\n");
console.log(`wrote systems/BLOCKS.md (${listed.size} blocks)`);
