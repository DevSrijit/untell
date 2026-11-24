// The files that `init` and `build` write: the example film, the Remotion wrapper, the HyperFrames page,
// the agent skill and the AGENTS.md section. Each is a function of the project's paths.
import type { Framework } from "./detect";
import { FILMS_DIR, KIT_DIR } from "./kit";
import { SKILL_PATH } from "./agents";
import { posix } from "node:path";

export const EXAMPLE = { id: "untell-example", scene: "untell-example.ts", remotion: "UntellExample.tsx" };

/**
 * The example film: one scene module for both frameworks, and the first film a user sees. Riso, because its type,
 * its pink ink and its grain show in any frame. It opens on its line and its ink on frame 0, stamps one ink a beat,
 * draws its answer (the key bar and the sum), declares its reveal, and holds its last print. Every number is
 * computed: years = ln 2 / ln(1 + r). Its answer is in display type, as large as its title, so a first check passes with
 * no advice. It has no deep import and no patched block output, so untell lint finds nothing.
 */
export const exampleScene = () => `// An example film made with untell: how long money takes to double at each annual return.
// Every number is computed: years = ln 2 / ln(1 + r), compounded once a year. The rule of 72 says 72 / r.
// A film is a scene module. It names one design system and its length, and returns nodes from blocks.
// The system decides every colour, font, size, curve and duration. Change the system id to restyle it.
// The film is silent and complete without sound. To add music, add a track (untell media add) and a music block.
import type { Ctx, Node } from "../untell/scene/types";
import type { BLOCKS } from "../untell/scene/blocks";

export const system = "riso";
// Riso stamps one ink on each beat. The beat here is 0.6 s: the chart prints from 0.6 s, the answer stamps at 2.4 s
// (the reveal), and the finished print holds for 2.4 s: over Riso's closing hold of 1.5 s, and the chart's last value
// (at about 2.7 s) stays the 2 s that a closing line needs.
export const seconds = 4.8;
const BEAT = 0.6;
const REVEAL = 4 * BEAT;

const rates = [2, 4, 6, 8, 10, 12];
const years = rates.map((r) => Math.log(2) / Math.log(1 + r / 100));
const KEY = 3; // 8 %: 72 / 8 = 9 years, and the exact value is 9.0

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, x = S.left, w = S.right - S.left, h = S.bottom - S.top;
  // The hook: Riso shows its line in display type and one ink on frame 0 (at before the film: at rest on frame 0).
  const titleProps = { id: "claim", text: "Rule of 72.", x, y: S.top, w, h: h * 0.22, maxLines: 1, at: -1 };
  const title = B.title(titleProps, ctx);
  // The ink on frame 0: a pink sun, large and cropped by the sheet's edge, behind the content.
  const r = ctx.width * 0.46;
  const sun = B.shape({ id: "sun", kind: "circle", x: ctx.width - r * 1.2, y: ctx.height - r * 1.15, w: 2 * r, h: 2 * r, fill: "accent", enter: "cut", layer: -1, at: -1 }, ctx);
  // The answer, drawn: the sum that the key bar proves, and its result in display type, as large as the title, so the
  // reveal is the largest moment. Both stamp on the reveal beat at the foot of the safe area, and the film holds them.
  // Their boxes come from B.measure, so the chart stops above them.
  const sumProps = { id: "sum", text: \`72 / \${rates[KEY]} =\`, role: "headline" as const, x, w, at: REVEAL };
  const answerProps = { id: "answer", text: \`\${Math.round(years[KEY]!)} years.\`, role: "display" as const, x, w, at: REVEAL };
  // A display line's glyphs reach below its line box (the glyph box is about 1.4 times the type size): keep them safe.
  const foot = S.bottom - (ctx.size("display") * 1.4 - ctx.lineHeight("display")) / 2;
  const answerY = foot - B.measure("text", { ...answerProps, y: S.top }, ctx).h;
  const sumY = answerY - B.measure("text", { ...sumProps, y: S.top }, ctx).h;
  // The chart prints on the next beat: years to double at each return, the key bar in the accent.
  const gap = ctx.lineHeight("label");
  const chartY = S.top + B.measure("title", titleProps, ctx).h + 2 * gap;
  const chart = B.barChart({
    id: "double", x, y: chartY, w, h: sumY - gap - chartY,
    title: "Years to double, by annual return",
    categories: rates.map((r) => \`\${r} %\`),
    series: [{ label: "Years", values: years }],
    key: KEY,
    format: { decimals: 1 },
    at: BEAT,
  }, ctx);
  const sum = B.text({ ...sumProps, y: sumY }, ctx);
  const answer = B.text({ ...answerProps, y: answerY }, ctx);
  return [...sun, ...title, ...chart, ...sum, ...answer, ...B.reveal({ at: REVEAL, of: "answer" }, ctx)];
};
`;

/** The Remotion wrapper: the example as <Composition> props. */
export const exampleRemotion = () => `// The example film as a Remotion composition. Register it in your Root:
//   import { UntellExample } from "./films/UntellExample";
//   <Composition {...UntellExample} />
import { sceneComposition } from "../untell/film";
import * as film from "./untell-example";

export const UntellExample = sceneComposition("${EXAMPLE.id}", film);
`;

/** The marker on a page that untell writes. `build` rewrites a page that carries it. */
export const PAGE_MARKER = "<!-- untell:page -->";

/** Where a page loads GSAP when the project has no gsap package: the CDN path of the version that HyperFrames names. */
export const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist";

/**
 * The HyperFrames page for a scene: GSAP, the bundle, and VS.mount with the scene's system. `gsap` is the folder of
 * GSAP's two files beside the page (untell build copies them from the project's gsap package); with none, the CDN.
 */
export function hfPage(o: { system: string; seconds: number; width: number; height: number; scene: string }, mediaBase?: string, gsap: string = GSAP_CDN): string {
  const res = o.width === o.height ? "square" : o.width > o.height ? "landscape" : "portrait";
  return `<!doctype html>
${PAGE_MARKER}
<!-- Generated by untell build from ${o.scene}. untell build rewrites this file: edit the scene, not this page. -->
<html lang="en" data-resolution="${res}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${o.width}, height=${o.height}" />
    <script src="${gsap}/gsap.min.js"></script>
    <script src="${gsap}/CustomEase.min.js"></script>
${mediaBase ? `    <script>window.__vsAssets = ${JSON.stringify(mediaBase)};</script>\n` : ""}    <!-- The untell renderer, the blocks and this film's scene, bundled by untell build. -->
    <script src="assets/vs-hyperframes.js"></script>
    <style>* { margin: 0; padding: 0; box-sizing: border-box; } html, body { width: ${o.width}px; height: ${o.height}px; overflow: hidden; }</style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${o.seconds}" data-width="${o.width}" data-height="${o.height}"></div>
    <script>
      gsap.registerPlugin(CustomEase);
      const tl = gsap.timeline({ paused: true });
      VS.mount(document.getElementById("root"), { system: "${o.system}", fonts: "assets/fonts" }, VS.scene, tl).then(() => {
        tl.to({}, { duration: 0.01 }, ${Math.round((o.seconds - 0.01) * 100) / 100});
        window.__timelines = window.__timelines || {};
        window.__timelines["main"] = tl;
      });
    </script>
  </body>
</html>
`;
}

const AGENTS_START = "<!-- untell:start -->";
const AGENTS_END = "<!-- untell:end -->";
const fence = (...lines: string[]) => ["```bash", ...lines, "```"].join("\n");

/**
 * The AGENTS.md section. It stands alone: an agent that reads only AGENTS.md (Codex, or any harness without
 * the skill) still gets the loop: lint after each edit, a clean picture check, untell render, the check on the render.
 */
export function agentsSection(fw: Framework, skills: string[] = [SKILL_PATH.claude, SKILL_PATH.codex]): string {
  const films = FILMS_DIR[fw];
  return `${AGENTS_START}
## Video films: untell

Films in this project use the untell kit in \`${KIT_DIR[fw]}/\`. A film is a scene module in \`${films}/\` that names one design system. The system sets every colour, font, size and curve.

Before you make or change a film, a scene or a block, read the untell skill and follow its steps: ${skills.map((p) => `\`${p}\``).join(" or ")}.

Follow these rules for every film:

1. After each edit to a film file, run untell lint on that file. Fix every error before the next edit.

${fence(`npx untell lint ${films}/<name>.ts`)}

2. Run the picture check until it passes. Fix one cause at a time: the first line is the verdict, and the causes come under it.

${fence(`npx untell check ${films}/<name>.ts`)}

3. Render with untell, never with the framework's own render command. untell render renders, masters the sound and prints the final file:

${fence(`npx untell render ${films}/<name>.ts`)}

4. Check the final file with the review sheet:

${fence(`npx untell check ${films}/<name>.ts --render <final file> --sheet`)}

   \`npx untell check --sheet <final file>\` does the same for the film of the last check. Open the sheet image that the check prints (\`review sheet: <path>\`) and read it. Each row is a strip of time with the frames, the motion line, the sound, the cuts and the findings. Fix what it shows: a stall, an empty frame, a cut off the beat, a finding. A draft (the skill's default level) looks at the sheet once. A finish also opens the phone sheet it prints (\`phone sheet: <path>\`) at 100 %: can a phone viewer read every text? \`npx untell check --explain <id>\` explains a finding.

   When a finding is \`align/...\` and names a snap id, preview it, look at the image, then apply only the hunks that are right (ids go with commas or spaces):

${fence(`npx untell snap ${films}/<name>.ts --at <s> --preview <ids>`, `npx untell snap ${films}/<name>.ts --at <s> --apply <ids>`)}

5. The film is done only when \`untell check\` exits with 0 on the final file, the sheet shows no problem, and (for a film with sound) \`untell listen mix <final file>\` shows no masked effect and no effect louder than the music's peak.
${AGENTS_END}
`;
}

/** AGENTS.md with the untell section added, or replaced when it is already there. Idempotent. */
export function withAgentsSection(current: string | null, fw: Framework, skills?: string[]): string {
  const section = agentsSection(fw, skills);
  if (!current) return `# Agent instructions\n\n${section}`;
  const a = current.indexOf(AGENTS_START), b = current.indexOf(AGENTS_END);
  if (a >= 0 && b > a) return current.slice(0, a) + section.trimEnd() + current.slice(b + AGENTS_END.length);
  return current.replace(/\n*$/, "\n\n") + section;
}

/**
 * The agent skill: one text for every harness (Claude Code reads .claude/skills, Codex reads .agents/skills).
 * Each step is a command with the result to expect, so any model can follow it and know when a step is done.
 */
export function skill(fw: Framework): string {
  const kit = KIT_DIR[fw], films = FILMS_DIR[fw];
  // The import path of the kit from a film, as a film writes it.
  const fromFilm = (rel: string) => posix.relative(films, `${kit}/${rel}`);
  const media = fw === "remotion" ? "public/media" : "assets/media";
  const scene = `${films}/<name>.ts`;
  const rem = fw === "remotion";
  return `---
name: untell
description: Makes or changes a video film with the untell kit (design systems, blocks, scenes, checks) in this project. Use it for any film, scene, block or design-system work, and for every render.
---

# untell

A film is a **scene module**: \`${scene}\` exports \`system\` (a design system id), \`seconds\` and \`scene\`, a pure function \`(ctx, B) => Node[]\` that calls blocks. The **system** decides every colour, font, size, weight, curve and duration. The scene decides only content, boxes (px) and times (s).

## Two levels: draft and finish

Choose the level from what the user asked. **Draft is the default.** Do a finish only when the user asks for a final film, a film to publish, or says "finish it".

**Draft: a first film, fast.**

1. Plan in the chat in five lines: the one idea, the system and why, and the beats with their times. Write no \`FILM.md\`.
2. Read the system's \`SYSTEM.md\` and the block map (step 3). Read \`${kit}/docs/playbooks/craft-floor.md\` once.
3. Write the scene and lint it (steps 4 and 5). Check it (step 6) until the verdict has no errors. Fix a warning only when its fix is one small change.
4. Render once (step 7). Check the final file with the sheet (step 8) and look at the sheet once. Fix only what is plainly broken: an empty frame, text that is cut, an end that just stops. Then render one more time at most.
5. Report the final file, the sheet, the warnings that stay, and what a finish would change. Say that the film is a draft, and that the user can say "finish it".

Do not do the critique or the polish in a draft. Do not loop.

**Finish: a film to publish.** Do the four playbooks in \`${kit}/docs/playbooks/\` in this order. Each one ends with a gate. Do not start the next one before its gate is true. A finish can start from a draft: then write \`FILM.md\` from the draft first.

1. \`shape.md\`: plan the film in \`FILM.md\` before any code.
2. \`craft.md\`: make the film. Read \`craft-floor.md\` once before you start.
3. \`critique.md\`: score the final file as a director does.
4. \`polish.md\`: at most three moves from the critique, one at a time, with the picture check (step 6) after each. Render once, after the last move.

The steps below are the commands of that work. Each step says what to run and what you see when it is done.

## How untell finds its tools

- \`npx untell ...\` runs the untell in this project's \`node_modules\`.
- Google Chrome draws every frame of a check and a snap. untell starts it by itself.
- ffmpeg measures and encodes. When it is missing, the command that needs it says how to install it.
- Python: the first \`untell check\` makes \`.venv-media\` with numpy, Pillow and scipy (about 30 MB). Its output says so, under the verdict.
${rem
    ? "- Remotion: untell uses the project's own `remotion`, `@remotion/player` and `@remotion/cli`. `untell render` writes its own Remotion entry, so a film needs no entry in your Root."
    : "- HyperFrames: untell runs the project's own CLI, `node_modules/.bin/hyperframes`. To use another one, set `UNTELL_HYPERFRAMES` to the path of a `hyperframes` program, or give `--hyperframes <path>`. Do not run a bare `npx hyperframes`: it can download another version. `npx untell doctor` shows which CLI untell found."}
- \`npx untell doctor\` lists what is installed and what is missing, with the command that fixes each.

## Use it your way

- **A film that is not an untell scene** (a video from another tool or another composition): \`npx untell check <video> --sheet\`. It runs each rule that reads only the file and lists the rules it did not run, with the reason. \`--system <id>\` takes a system's limits. In a project with scene modules, add \`--no-scene\`. \`npx untell sheet\`, \`listen mix\` and \`master\` also take any video file.
- **A block of your own:** follow \`${kit}/docs/playbooks/BLOCK.md\` (a pure function, nodes, roles not values, a size function, warnings, \`guarded\`). Lint it with \`npx untell lint --scope scene <file>\`.
- **A brand colour** (a system whose accent is a placeholder, such as Mark): \`npx untell system new <brand> --from mark\`, set \`roles.accent\` (with \`accentText\` and \`onAccent\`) in its \`system.ts\`, then \`npx untell system check <brand>\`.
- **A system of your own:** \`npx untell system new <name> --from <id>\`, edit \`${posix.join(posix.dirname(films), "systems")}/<name>/system.ts\`, then \`npx untell system check <name>\` until it passes. A film names it as it names a built-in system.
- **The 20 systems:** the steps below.

## Steps

Before step 1, the project: \`npx untell init --agent <claude|codex|both>\` in a Remotion or HyperFrames project. An empty folder has no framework yet: run \`npx untell init --new remotion --agent <agent>\` (or \`--new hyperframes\`) first. It writes the framework's project and its \`package.json\` in this folder. Do not run \`npm install\` before it: with no \`package.json\` in the folder, npm installs into the first parent folder that has one.

1. **Shape the film** (a finish; a draft plans in five lines in the chat). Read \`${kit}/docs/playbooks/shape.md\` and do its pass. It gives \`FILM.md\`: the one idea, the story contract (hook, question, answer, reveal, end), the system, the beat sheet, the media list and the track. Done when every line of its gate is true.
2. **Choose the system.** Read \`${kit}/docs/systems/README.md\`. Answer its three questions (purpose, feeling, light or dark). Write the choice and the reason in one sentence: in \`FILM.md\` for a finish, in the five-line plan for a draft. Done when you have one system id. \`npx untell systems\` lists all 20.
3. **Read the system and the contract.** Read \`${kit}/docs/systems/<id>/SYSTEM.md\` in full, then \`${kit}/scene/BLOCKS.md\` (the model and its hard rules). Find each block you need in \`${kit}/docs/systems/BLOCKS.md\`. Done when you can say the system's colour roles, type roles, motion, Media section and Never list.
4. **Write the scene module** \`${scene}\`. Start from a copy of \`${films}/untell-example.ts\`. Read \`${kit}/docs/playbooks/craft-floor.md\` once before the first edit. Place text from \`ctx.safe\`, and pictures, panes and charts from \`pictureSafe(ctx)\` (see the lower band in Rules). Import \`pictureSafe\` and the other layout and drawing helpers (\`lineAndSubject\`, \`heroBox\`, \`fitDrawing\`, \`figure\`, \`pointOf\`) from \`${kit}/scene/blocks\`, not from \`${kit}/scene/context\`. Measure every string with \`ctx.measure\` before you place it. To stack a thing under a block, take the block's box from \`B.measure("<block>", props, ctx)\`, never a guess. A block with \`at\` before the film (\`at: -1\`) is at rest on frame 0. A change at time t shows on the first frame after t in every block, so two blocks given one time change on one frame. Done when the scene exports \`system\`, \`seconds\` and \`scene\` and step 5 is clean.${rem ? " Give each film one scene file, and no other file whose name differs from it only by the case of a letter (a disk that ignores case makes them one file)." : ""}
5. **Lint after every edit.**

${fence(`npx untell lint ${scene}`)}

   Done when it prints \`No tells\` or \`0 error(s)\`. Fix the warnings too, or silence one line with \`// untell-ignore <rule>: <reason>\` and a real reason. \`npx untell lint --explain <rule>\` shows a rule in full.${rem ? `

${fence("npx tsc --noEmit")}

   Done when it prints nothing.` : ""}
6. **Check the picture.** No render is needed for this check.

${fence(`npx untell check ${scene}`)}

   The first line is the verdict, in one of three states:
   - \`failed: <n> errors\`: exit 1. Fix the errors.
   - \`passed with <n> warnings: fix or declare each before delivery\`: exit 0, but the film is not done. Fix each warning, or declare it (below).
   - \`passed\`: no error and no warning. \`passed (<n> advice)\` is the same state: advice is a note, never a fault, and it needs no fix.

   Done when the verdict is \`passed\` (a draft: when it has no errors; the warnings that stay go in your report). Its last lines say what to do next, as a command. It records the film${rem ? " in Remotion's own Player" : " (after `hyperframes check` on the page)"}, runs the detector on every frame and, when the scene has sound, the sound checks on a mix of it. \`(a demo: frame rules only)\` after the verdict means the film is 3.5 s or shorter, or exports \`demo = true\`: then the time rules did not run, and a real film must not be a demo.
   Read the screen: under the verdict it numbers the **causes**, errors first, each with the number of findings that one fix clears. The steps of the check (lint, record, detect) come after the findings, then the checks that did not run. \`npx untell check --not-measured\` lists what a check could not measure, with the reason. Make one fix per cause: fix the first cause, then run the check again. One change, then one check. Do not fix each finding of a cause on its own.
   - A finding gives the time, the node, what it measured, the limit and the fix. \`npx untell check --explain <id>\` says what a check measures and why.
   - A \`block/<name>\` finding is a block's own warning while it drew (a title that shrank, a line that wraps): give the block a larger box or fewer words.
   - A finding that the film means (a whip's blur in a system that whips) is declared, not hidden. Put \`// untell-ignore <rule> [node]: <reason>\` on the line before the block call that owns the node. The rule is the finding's own id, \`hyperframes/<code>\` for one of HyperFrames' findings. The check lists each declaration with its effect: the findings it matched, or "matched nothing" with the reason. Remove a declaration that matched nothing, or fix its rule or node. A false alarm is a bug in untell: declare it the same way and report it.
   - **Alignment** (\`align/...\`): the fix names snap ids and prints the command. Preview first, then look at the pages it prints: \`.untell/snap/<name>/preview-1.png\` (before and after), \`preview-2.png\` (each miss and its hunk id) and the zoomed crops after them. Apply only the hunks that are right, at the same time. Ids go with commas or spaces. untell refuses a hunk that you did not preview.

${fence(`npx untell snap ${scene} --at <s> --preview <ids>`, `npx untell snap ${scene} --at <s> --apply <ids>`)}

     When snap says that many hunks share one cause, fix the cause in the scene instead. \`--unapply all\` removes applied hunks.
7. **Render.** Only after step 6 passes. Never use the framework's own render command: \`untell render\` runs it for you${rem ? "" : " (it also builds the page)"}, masters the sound to the system's target, keeps the file at a size a phone feed takes, and prints the final file.

${fence(`npx untell render ${scene}`)}

   Done when it ends with \`final: out/<name>.mastered.mp4: <size>, <n> LUFS, true peak <n> dBTP\` (a film with no sound: \`final: out/<name>.mp4\`) and exits with 0. Exit 1 with a master line means the mix is off: fix the mix in the scene and render again.
8. **Check the final file with the review sheet.**

${fence(`npx untell check ${scene} --render <final file> --sheet`)}

   Done when the verdict is \`passed\`. It adds the sound checks on the real file. Open the sheet image it prints (\`review sheet: <path>\`) and look at it. Each row is a strip of time: frames with their times, the motion line (flat means a stall), the sound with its beats, red cut marks and the findings. Find and fix what no check names: a frame with nothing on it, an opening that is empty in the first second, an end that just stops, the same shot twice. The check also prints \`phone sheet: <path>\`: a frame from each shot at the size a phone shows it. Open it at 100 % for the phone pass of the critique. **To look at one frame at full size**, run \`npx untell snap ${scene} --at <s>\`: it writes that frame as a PNG (\`.untell/snap/<name>/before.png\`) and prints its path. Then go back to step 6.
9. **Check the mix** (a film with sound):

${fence("npx untell listen mix <final file>")}

   Done when it shows no masked effect and no effect louder than the music's peak. The check's exit code does not cover these two facts.
10. **Critique, then polish** (a finish only). Do \`critique.md\` on the final file and the sheet, then \`polish.md\`: at most three moves, one at a time, with step 6 after each move. Do not render between moves. After the last move, do steps 7 to 9 once.
11. **Done.** A draft: when its report is given (level, final file, sheet path, the warnings that stay, what a finish would change). A finish: when steps 6, 8 and 9 are clean on the last final file, \`FILM.md\` has the scores, and you report the final file, the sheet path and what you did not check.

## Helpers for a layout

Import these from \`${kit}/scene/blocks\` (the same import as the blocks' types), never from a file inside it:

- \`lineAndSubject(ctx, { lineH, aspect, area })\`: the box of the main line and the box of the subject under it, as one pair on the frame's optical centre. Give the subject box to \`product\` as \`room\` and to \`photo\` as its box.
- \`lineAbove(ctx, subject, lineH)\`: a line's box above a subject's box. With \`product\`, take the subject from \`anchor(shot, "hero-object-extent")\` (\`anchor\` is in \`${kit}/scene/context\`).
- \`lineOverPicture(ctx, photoNode, lineH)\`: a line's box on the part of a picture that its subject leaves clear. \`lineInBand\` places a line in a band of the frame.
- \`heroBox(ctx, aspect, { area, room })\`: the subject's box at the share of the frame that the system's hook asks for.
- \`terminal({ end: "result" })\` ends a terminal on its result line, which a beat can hold. \`codeBlock\` and \`terminal\` wrap a long line with a hanging indent and never cut it.
- \`landOn(ctx, t, (at, c) => B.<block>({ ..., at }, c))\`: builds a block so that its entrance arrives on time \`t\` (a beat). Give \`c\` to the block.
- An effect (\`hit\`, \`typing\`) peaks at -3 dBFS at most, and under the music's peak when you give it the music as \`bed\`.

## Rules

- Colour is a role (\`ink\`, \`accent\`, \`series1\`). Type is a role (\`display\`, \`headline\`, \`body\`, \`label\`, \`caption\`). Motion is tracks from \`go\`, \`appear\`, \`lines\`, \`seq\` in \`${kit}/scene/context.ts\`. Values come only from the system.
- End the film the way the system's Direction says (its **Ends** line): an end card and a hold only when the system asks for them. Some systems end on a hard cut with no hold.
- Data grows on \`ctx.noOvershoot\`: a bar or a count never passes its value.
- Surfaces are flat: no gradient, glow, blur or shadow, unless the system allows it. Grain comes from the renderer for systems that allow it.
- Text stays inside \`ctx.safe\` and never overlaps text, a line or a mark.${rem ? "" : " untell checks a line's ink. HyperFrames' own check reads its font box, from the font's ascent to its descent, which in a display role reaches above the ink. So a display line at the text-safe top (288 px at 9:16) can pass untell and still give `hyperframes/outside_safe_zone`: start its box one body line lower."}
- **The lower band at 9:16.** The text-safe area (\`ctx.safe\`) ends at 65 % of the height: the platforms' buttons cover the 35 % under it, so text stays out of it. A picture, a pane, a chart or a shape is picture: it may run down to the picture-safe foot (\`pictureSafe(ctx)\`, the frame inside the system's margin). In a system whose \`SYSTEM.md\` lets display text run past the safe area (Kinetic, Courtside), display type is picture too: it may run past the text-safe area into the lower band (\`kineticWords\` stacks it down to 85 % of the height). So a film must not leave the lower 35 % empty: fill it with picture. The \`dead-space\` check finds an empty span of 40 % of the height or more, so an empty lower band alone (35 %) does not set it off: find that band on the sheet yourself.
- Content is verifiable facts (computed values, physics, maths) or fictional names drawn at random for each film. Never invent or borrow a real brand or person. A brand that the user's own brief names is the film's subject: use it as the brief gives it (when \`scene/real-name\` flags it, declare that with the reason: \`// untell-ignore scene/real-name: the user's own brand, from the brief\`).
- The kit is the project's own code. Edit a block to add a feature. Keep the tokens and \`systems.ts\` as they are: the systems are rigid. To change a system, make your own copy with \`npx untell system new\`.
- Media: follow the system's Media section. Never edit \`${kit}/media.gen.ts\` or \`untell-media.json\` by hand: the media commands write them under a lock, so several agents can work at once.

## Media

Use only pictures, footage, sound and models that the brief's owner may use.

- When the user gives you files, use them.
- When the brief gives no files and lets you fetch them, find them yourself. Choose files whose licence lets the brief's owner use them in this film. Keep the page that states the licence. untell names no source and does not check a licence: reading the licence is your job.
- When the brief gives no files and forbids downloads, or asks for type and shapes only: add no media. Make every picture with type and shape blocks (\`shape\`, \`drawnMark\`, \`lockup\`, \`frameGrid\`, the chart blocks; \`${kit}/docs/systems/BLOCKS.md\` lists them). A Direction that names a photo or footage then means the same place in the frame, filled by a shape.
- A film with no sound (no track in the brief, or no downloads): state it in the scene, \`export const silent = "<the reason>";\`. untell lint and untell check list it with the declarations. Then read the **With no sound** line of the system's Direction: a system that cuts on the music (Mark, Noir) keeps a steady beat of its own, a constant \`BEAT\` in its tempo range, and lands each module, cut and lockup on its multiples. Leave out \`music\`, \`hit\` and the Music steps below. The music map tools (\`untell listen setup\`) are only for a film with a track.
- Keep every download and every candidate in \`.untell/media-src/\` until you add it. git ignores that folder${rem ? "" : ", and HyperFrames' check reads every other file in the project folder: a candidate there slows the check and can fail it"}. \`untell media add\` copies the file you choose into \`${media}/<name>/\`.
- Never use a picture or footage of a child whose face a viewer can identify. Prefer pictures with no identifiable face: a back, hands, a silhouette, a crowd at a distance.
- Do not use a generated picture, footage or sound where the brief asks for real ones.

${fence("npx untell media formats")}

Done when you know which formats and sizes each kind of file needs.

1. **Add** each file, with its source and its licence. It goes into \`${media}/<name>/\`. A sound is measured at once with ffmpeg (length, loudest moment, level), so \`music\`, \`hit\` and \`typing\` can use it.

${fence("npx untell media add <file or URL> --as <name> --source <where it came from> --licence <the licence and its page>")}

   Done when it prints \`added <name> (<kind>)\`. \`--kind photo|video|music|sfx\` chooses the kind (a sound of 20 s or more is music by default).
2. **Prepare** a picture: a cut-out of the subject and the system's grade (\`plate\`, \`plate-top\`, \`plate-dim\`, \`subject.png\`). Footage gets the grade only. \`--as-is\` keeps a screenshot ungraded. \`--no-cutout\` skips the cut-out; the plates and Riso's ink separations are still made. The first cut-out downloads the cut-out model (about 300 MB, once) into your home folder, outside the project: \`npx untell doctor\` shows where. When a cut-out shows a patch of its old backdrop inside the subject, prepare it again with \`--keep-holes\`.

${fence("npx untell media prepare <name> --system <id>")}

3. **Music.** You cannot hear, so listen with untell. Set up the listen tools once. Analyse each candidate and read its \`listen.md\`: the sections, the drop, the energy bar by bar. Rank the candidates against the brief in words.

${fence("npx untell listen setup", "npx untell listen analyse <name>", 'npx untell listen compare "<brief in words>"')}

   Enter the track the way the system's Mix line says (the Direction section of its \`SYSTEM.md\`): a clock system puts the drop on the reveal with \`music({ media: "<name>", peakAt: <s> })\`; a bed system opens on a section start with \`align\`. A track with no drop (its \`listen.md\` says so): \`peakAt\` then lands the track's loudest bar on that time, which is not the entry that \`listen.md\` ranks first. To enter there instead, give \`align: { track: <the entry's time>, film: <the film time> }\` in place of \`peakAt\`. Take every cut time from \`beats("<name>", ...)\`: cut on its \`cuts\` (or \`onCut(t)\`), never on a number written by hand. When \`beats()\` warns at build that the grid is low trust (\`gridTrust\` is "low"), cut on \`cuts\` all the same: there they are the track's strong onsets, measured in the sound. A beat on a low-trust grid is a guess, so this rule wins over a system that cuts on beats. When a render shows the drop at another time than \`peakAt\` put it, pin it once: \`npx untell listen analyse <name> --drop <seconds>\` (track time). With no \`volume\`, \`music\` sets the bed for the system's mix target.
   Import \`beats\` from the kit: \`import { beats } from "${fromFilm("scene/beats")}"\`, and \`musicFrom\` from \`"${fromFilm("scene/blocks")}"\`: \`musicFrom({ media, peakAt, until })\` gives the \`from\` that \`beats(name, { from, until })\` needs, the same entry that \`music({ peakAt })\` plays. Every block takes \`ctx\` as its second argument, the sound blocks too: \`B.music({ ... }, ctx)\`, \`B.hit({ ... }, ctx)\`, \`B.typing({ ... }, ctx)\`.
4. **Effects.** Put a hit on its picture with \`hit({ on })\`. Give \`hit\` and \`typing\` the music block's nodes as \`bed\`, so each effect sits over the bed and under the music's peak. To land an entrance (and its hit) on a beat, build the block with \`landOn\` from \`${fromFilm("scene/blocks")}\`: \`landOn(ctx, G.onBeat(2), (at, c) => B.shape({ ..., enter: "slide", at }, c))\`. Do not start it at the beat minus \`ctx.dur.enter\`: it then arrives off the beat (a slide 3 to 6 frames late, a grow or a fade up to 2 frames early).
5. **3D models.** Add a glTF binary (\`.glb\`, textures inside) or a \`.gltf\` with its files beside it. untell writes its bounds, so \`model("<name>", { height })\` can size and frame it, and the page loads it from the file with no Chrome flag.

${fence("npx untell media add <file.glb> --as <name> --source <text> --licence <text>")}

6. **Type behind a subject:** plan it with \`placeBehind\` (\`${kit}/scene/cover.ts\`), as \`${kit}/docs/systems/BLOCKS.md\` shows for \`photo\`.
7. \`npx untell media list\` shows every asset. \`npx untell media remove <name>\` deletes one you do not use.

## When a command fails

Every untell error says what to do next. Do that, then run the command again. \`untell check\`, \`untell snap\`, \`untell build\` and \`untell render\` start Google Chrome. When your harness runs commands in a sandbox that does not let Chrome start, the error says so: ask the user to let that command run outside the sandbox.

## The repository commands in the docs

The docs come from the untell lab and name some of its commands. In this project, use these:

| The docs say | Here |
| --- | --- |
| \`bun scripts/lint/cli.ts\`, \`python3 scripts/lint_source.py\` | \`npx untell lint\` |
| \`scripts/review_sheet.py\` | \`npx untell sheet <video>\` |
| \`bun scripts/record.ts\`, \`bun scripts/inspect.ts\`, \`bun scripts/detect.ts\`, \`scripts/inspect/*\` | \`npx untell check ${scene}\` |
| \`bun scripts/detect.ts --rules\`, \`--explain <id>\` | \`npx untell check --rules\`, \`npx untell check --explain <id>\` |
| \`bun scripts/render.ts\`, a framework's own render command | \`npx untell render ${scene}\` |
| \`python3 scripts/master.py\` | \`npx untell master <render> --system <id>\` (untell render runs it) |
| \`scripts/listen/untell-listen analyse\`, \`fx\`, \`mix\`, \`compare\` | \`npx untell listen analyse\`, \`fx\`, \`mix\`, \`compare\` |
| \`python3 scripts/music_map.py\` | \`npx untell listen analyse <name>\` |
| \`bun scripts/media.ts ...\`, \`scripts/media_*.py\` | \`npx untell media ...\` |
| \`bun scripts/snap/cli.ts <film id> --films <module>\` | \`npx untell snap ${scene}\` |
| \`bun scripts/perf/cache.ts\`, \`bun scripts/perf/slots.ts\` | \`npx untell cache status\`, \`npx untell cache clear\` (UNTELL_SLOTS sets the machine slots) |
| \`bun scripts/hf_check.ts\`, \`bun scripts/hf_project.ts\` | ${fw === "hyperframes" ? "`npx untell build`, `npx untell check`" : "not used in a Remotion project"} |
| \`src/films/...\`, \`examples/...\` | \`${films}/untell-example.ts\` |
`;
}
