// A design system as files that any framework and any tool can read: tokens.json (the data, every colour resolved
// to hex), tokens.css (CSS custom properties), fonts.json (each family and weight) and SYSTEM.md (what an agent reads
// before it makes a film). The repository's scripts/export_systems.ts writes the built-in systems with it, and
// untell system writes a project's own systems with it, so both read the same way.
import { MEDIA_SPEC } from "./media-spec";
import { DIRECTION, ENTRY_HOW, mixTarget, SUBJECTS_TO_AVOID } from "./direction";
import { SIGNATURE } from "./scene/blocks/signature";
import { HANDS, hand } from "./scene/blocks/hand";
import { contrast, hex } from "./color";
import { baseOf } from "./own";
import { EFFECT_NOTE, fallbackFonts, type Effect, type System, type TypeRole } from "./systems";
import { ITALIC } from "./italics.gen";

const ROLE_USE: Record<string, string> = {
  ground: "The background of every frame. Flat: no gradient, no glow, no vignette.",
  surface: "Panels and cards that sit on the ground.",
  rule: "Hairlines, borders, axes and dividers.",
  ink: "All primary text and primary marks.",
  inkMuted: "Secondary text: captions, labels, sources.",
  accent: "Fill for the one block or mark that matters. For text in this colour, use accentText.",
  accent2: "The second ink or primary. Each colour keeps one meaning for the whole film.",
  accent3: "The third ink or primary. Each colour keeps one meaning for the whole film.",
  accentText: "Text set in the accent colour on the ground.",
  onAccent: "Text placed on an accent-coloured block.",
  series1: "Chart series 1 (the series that matters).", series2: "Chart series 2.", series3: "Chart series 3.",
  series4: "Chart series 4: context data, kept quiet.", series5: "Chart series 5: context data, kept quiet.",
  positive: "A good change or a pass. Use only for status.", negative: "A bad change or a fail. Use only for status.",
};
export const ROLE_ORDER = ["ground", "surface", "rule", "ink", "inkMuted", "accent", "accent2", "accent3", "accentText", "onAccent",
  "series1", "series2", "series3", "series4", "series5", "positive", "negative"];
/** Each family the system uses, the weights its type roles need, and the Fontsource package with the files.
 *  The symbol fallback fonts come last, in weight 400; `fallback: true` marks them. */
/** The system's chart hand (blocks/hand.ts) in words: how barChart, lineChart and areaChart draw in this system. */
function chartsOf(s: System): string {
  const h = hand({ system: s });
  const bar = { fill: "flat fills", outline: "hairline outlines on the ground, the key bar filled", overprint: "flat inks multiplied where they overlap, the context in the second ink", cells: "rows of square cells, as text-mode output draws a bar" }[h.bar];
  const end = { system: "the system radius, at most a quarter of the bar", square: "square ends", full: "half-round ends" }[h.end];
  const grid = { rules: "hairline rules across the plot", ticks: "short ticks at the axis", none: "the scale labels only, no gridlines" }[h.grid];
  const dot = { solid: "a dot", ring: "an open ring", square: "a square" }[h.dot];
  return `## Charts

${HANDS[baseOf(s.id)] ? "The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):" : "This system has no chart hand of its own; the chart blocks draw in the plain hand (src/system/scene/blocks/hand.ts):"}
- Bars: ${bar}; ${end}; ${h.thick ? `at most ${h.thick} value line heights thick` : "rows that fill their box"}; ${h.base ? `a baseline of ${h.base} stroke${h.base === 1 ? "" : "s"}` : "no baseline (the bars share one edge)"}${h.ends ? "; extension marks at each bar end" : ""}.
- Values in ${h.value}, the key value in ${h.key}${h.inside ? ", inside its bar when it fits" : ""}. ${h.axis === "ruler" ? "A measured ruler (ticks and labels) on the value axis, always." : "A value axis only when not every value prints."}
- Lines: the key line ${h.line} strokes, context lines ${h.thin}; ${grid}; ${dot} on the last point.
- Areas: ${h.fill === "overprint" ? "each area in its own ink, multiplied, so the inks overprint where the areas cross" : "a flat tint of the key colour over an opaque context fill"}.${h.endLabel === "pill" ? " The current value sits on a pill in the key colour." : ""}${h.leaders ? " Every end label takes a short leader." : ""}${h.measure ? " A dimension measures the gap between the key line and the next." : ""}${h.step ? " Lines step: level, then a vertical jump." : ""}
- At 9:16, \`barChart\` with \`from: "top"\` hangs its bars from a rail under the labels, and \`lineChart\` and \`areaChart\` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.${h.refuse ? `\n- Refuses line and area charts: ${h.refuse}.` : ""}${h.note ? `\n- ${h.note}` : ""}`;
}

/** The Type section's line on italic: which statement roles have a true italic face, and what quote's emphasis does. */
function italicLine(s: System, c: Record<string, string>): string {
  const all = ["display", "headline", "body"] as const;
  const roles = all.filter((r) => ITALIC[s.fonts[s.type[r].font] ?? s.fonts.text]?.includes(s.type[r].weight));
  const rest = all.filter((r) => !roles.includes(r));
  const list = (rs: readonly string[]) => (rs.length > 1 ? `${rs.slice(0, -1).join(", ")} and ${rs[rs.length - 1]}` : rs[0]!);
  const colour = !!c.accentText && c.accentText !== c.ink;
  const never = "Never slant a face that has no italic file.";
  if (!rest.length) return `Italic: the display, headline and body faces have a true italic. \`quote\` sets its \`emphasis\` word in it. ${never}`;
  const none = colour ? "the word takes the accent text colour (`accentText`)" : "the accent text is the ink, so `quote` sets the word as the rest and says so";
  if (roles.length) return `Italic: the ${list(roles)} ${roles.length > 1 ? "faces have" : "face has"} a true italic, and \`quote\` sets its \`emphasis\` word in it. The ${list(rest)} ${rest.length > 1 ? "faces have" : "face has"} none: there ${none}. ${never}`;
  return `Italic: no statement face (display, headline, body) has a true italic. For \`quote\`'s \`emphasis\`, ${none}. ${never}`;
}

export function fontList(s: System) {
  const out: { family: string; weights: number[]; pkg: string; italic?: number[]; fallback?: true }[] = [];
  for (const slot of ["display", "text", "mono"] as const) {
    const family = s.fonts[slot];
    if (!family) continue;
    const weights = [...new Set(Object.values(s.type).filter((t) => t.font === slot).map((t) => t.weight))];
    const have = out.find((f) => f.family === family);
    if (have) have.weights = [...new Set([...have.weights, ...weights])].sort((a, b) => a - b);
    else out.push({ family, weights: weights.sort((a, b) => a - b), pkg: `@fontsource/${family.toLowerCase().replace(/ /g, "-")}` });
  }
  // The weights with a true italic face (italics.gen.ts): a file <family>-latin-<weight>-italic.woff2 beside the others.
  for (const f of out) { const it = f.weights.filter((w) => ITALIC[f.family]?.includes(w)); if (it.length) f.italic = it; }
  for (const family of fallbackFonts(s)) {
    if (!out.some((f) => f.family === family)) out.push({ family, weights: [400], pkg: `@fontsource/${family.toLowerCase().replace(/ /g, "-")}`, fallback: true });
  }
  return out;
}
const kebab = (k: string) => k.replace(/[A-Z0-9]+/g, (m) => "-" + m.toLowerCase());
const bez = (b: number[]) => `cubic-bezier(${b.join(", ")})`;
const pct = (x: number) => `${+(x * 100).toFixed(2)}%`;

export function colours(s: System) {
  return Object.fromEntries(ROLE_ORDER.filter((k) => k in s.roles).map((k) => [k, hex((s.roles as never)[k])])) as Record<string, string>;
}

export function css(s: System, c: Record<string, string>) {
  const L = [`/* ${s.name}: generated by scripts/export_systems.ts. Do not edit. */`, `:root {`,
    `  /* Set --short to the frame's short side, for example 1080px for 1080x1920. */`, `  --short: 1080px;`];
  for (const [k, v] of Object.entries(c)) L.push(`  --color-${kebab(k)}: ${v};`);
  L.push(`  --font-display: "${s.fonts.display}";`, `  --font-text: "${s.fonts.text}";`);
  if (s.fonts.mono) L.push(`  --font-mono: "${s.fonts.mono}";`);
  for (const [r, t] of Object.entries(s.type)) {
    L.push(`  --type-${r}-font: var(--font-${t.font});`, `  --type-${r}-size: calc(var(--short) * ${t.size});`,
      `  --type-${r}-weight: ${t.weight};`, `  --type-${r}-tracking: ${t.tracking}em;`, `  --type-${r}-leading: ${t.leading};`);
  }
  L.push(`  --margin: calc(var(--short) * ${s.margin});`, `  --gutter: calc(var(--short) * 0.022);`, `  --columns: ${s.columns};`,
    `  --radius: calc(var(--short) * ${+(s.radius / 1080).toFixed(4)});`, `  --stroke: calc(var(--short) * ${+(s.stroke / 1080).toFixed(4)});`,
    `  --ease-enter: ${bez(s.motion.enter)};`, `  --ease-move: ${bez(s.motion.move)};`, `  --ease-exit: ${bez(s.motion.exit)};`,
    `  --frames-enter: ${s.motion.frames.enter};`, `  --frames-move: ${s.motion.frames.move};`, `  --frames-exit: ${s.motion.frames.exit};`,
    `  --frames-stagger: ${s.motion.frames.stagger};`, `}`);
  for (const r of Object.keys(s.type) as TypeRole[]) {
    const t = s.type[r];
    L.push(`.type-${r} { font-family: var(--type-${r}-font); font-size: var(--type-${r}-size); font-weight: var(--type-${r}-weight); ` +
      `letter-spacing: var(--type-${r}-tracking); line-height: var(--type-${r}-leading);${t.uppercase ? " text-transform: uppercase;" : ""}` +
      `${r === "label" || r === "caption" ? " font-variant-numeric: tabular-nums;" : ""} }`);
  }
  return L.join("\n") + "\n";
}

const GRADE_WORDS: Record<string, string> = {
  none: "Not graded: screenshots and screen recordings are evidence, shown as they are.",
  mono: "Black and white",
  tone: "Colour, tamed",
  duotone: "Luminance through the inks",
  posterize: "Flat cut paper: two or three flat tones, no gradient",
  phosphor: "A monochrome screen: luminance in one colour on the ground",
};
const PLACEMENT_WORDS: Record<string, string> = {
  "full-bleed": "full bleed (fills the frame)",
  "framed-low": "framed low (fills the frame below the type; its top eases into the ground, photo `fade: \"top\"`)",
  "cutout-over-type": "the subject cut out over the type (plan with `placeBehind`; the cover check keeps every letter readable)",
  "window": "in a window (a box on the grid with a margin)",
  "small-in-field": "small in a large empty field",
  "shape-crop": "cropped to a circle, square or triangle",
  "flash": "a one-beat flash, full frame, between words",
  "behind-type-dimmed": "full frame behind the type, dimmed so the type reads",
};
/** The Media section: grade, pictures, footage and sound (src/system/media-spec.ts). */
function mediaDoc(s: System, c: Record<string, string>) {
  const m = MEDIA_SPEC[s.id];
  if (!m) return "";
  const g = m.grade;
  const role = (r: string) => `\`${r}\` (${c[r] ?? "?"})`;
  const grade = g.kind === "none" ? GRADE_WORDS.none
    : g.kind === "mono" ? `${GRADE_WORDS.mono}, contrast ${g.contrast}${g.gamma ? `, gamma ${g.gamma}` : ""}: black on ${role(g.dark)}, white on ${role(g.light)}.`
    : g.kind === "tone" ? `${GRADE_WORDS.tone}: saturation ${g.saturation}, contrast ${g.contrast}, warmth ${g.warmth}; black on ${role(g.dark)}, white on ${role(g.light)}.`
    : g.kind === "phosphor" ? `${GRADE_WORDS.phosphor}: ${role(g.tint)} on ${role(g.dark)}.`
    : `${GRADE_WORDS[g.kind]}: ${g.stops.map(role).join(" → ")} (dark to light).`;
  const music = m.music.level > 0
    ? `${m.music.feel}, ${m.music.bpm[0]}-${m.music.bpm[1]} BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The \`music\` block sets the bed's level for the system's mix target; give \`volume\` only to set a level by hand.`
    : "No music: this system is silent.";
  return `## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (\`untell media add <file> --source <text> --licence <text>\`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of \`systems/BLOCKS.md\` (\`shape\`, \`drawnMark\`, \`lockup\`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. \`untell media formats\` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with \`untell media prepare <name> --system ${s.id}\`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (\`prepare <name> --as-is\`).

- **Grade:** ${grade} Behind type (\`photo({ dim: true })\`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. \`untell media prepare\` warns when a prepared picture shows too little detail for a phone.
- **Pictures (${m.pictures.use}):** ${m.pictures.placements.length ? m.pictures.placements.map((p) => PLACEMENT_WORDS[p]).join("; ") + "." : "none."} ${m.pictures.note}${m.pictures.cutout ? " Cut-outs allowed." : ""} Motion: ${m.pictures.motion}.
- **Footage (${m.footage.use}):** ${m.footage.note}${m.footage.speed !== "none" ? ` Speed: ${m.footage.speed}.` : ""}
- **Music:** ${music}
- **Effects:** ${m.hits.allowed.length ? `${m.hits.allowed.join(", ")}, at most ${m.hits.perTen} in 10 s.` : "none."} ${m.hits.note} Use the \`hit\` block: it lands each effect's peak one frame after its picture. Give \`hit\` and \`typing\` the music block's nodes as \`bed\`: the level then follows the bed, over it and never louder than the music's peak. \`typing\` keeps its ticks to the limit above.`;
}

const HOOK_SHOW: Record<string, string> = { picture: "the subject in a picture", line: "the main line in type", both: "a picture and the main line" };
export const END_KIND: Record<string, string> = {
  card: "a held card", lockup: "a lockup (the subject or mark with the name on one axis)", offer: "the offer at full size",
  paper: "the ground: the last text dissolves, and the paper holds", event: "a last event on screen that holds", cut: "a hard cut to the ground on a bar",
};
const MUSIC_ROLE: Record<string, string> = {
  bed: "a bed under the picture", clock: "the clock: cuts and entrances land on its beats", none: "none: this system has no music",
};
/**
 * The Direction's line for a film with no sound (the brief gives none, or forbids downloads): what the system's music
 * did for the film, and what takes its place. A system that cuts on the music keeps a steady beat of its own, in the
 * music's tempo range (MEDIA_SPEC music.bpm).
 */
function noSound(s: System, d: NonNullable<(typeof DIRECTION)[string]>): string {
  const state = "State it in the scene: `export const silent = \"<the reason>\";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.";
  if (d.mix.music === "none") return "this system has no music: a film with no sound is what it asks, and needs no statement. Leave out `music`; its few effects stay optional.";
  const bpm = MEDIA_SPEC[s.id]?.music.bpm;
  const beat = bpm ? Math.round((60 / ((bpm[0] + bpm[1]) / 2)) * 20) / 20 : 0.5;
  const rule = d.ends.onBar || d.mix.music === "clock" ? " Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar." : "";
  return `the moves above assume ${d.mix.music === "clock" ? "the music's beats" : "a bed under the picture"}. With none, keep a steady beat of your own: a constant \`BEAT\` of about ${beat} s (${bpm ? `the middle of the music's ${bpm[0]}-${bpm[1]} BPM` : "a calm tempo"}), and time the moves on its multiples.${rule} Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. ${state}`;
}

/** The Direction section: how a film in this system opens, moves, sounds, and ends (src/system/direction.ts). */
function directionDoc(s: System) {
  const d = DIRECTION[s.id];
  if (!d) return "";
  const h = d.hook;
  const size = [h.role ? `the line in the ${h.role} role` : "", h.area ? `the picture on at least ${Math.round(h.area * 100)} % of the frame` : ""].filter(Boolean).join(", ");
  const moves = d.moves.map((m) => `- ${m.move}${m.effect ? ` (effect: ${m.effect})` : ""} ${m.measurable ? `*Measurable* (\`${m.measurable.check}\`): ${m.measurable.how}` : "*Judged by eye.*"}`);
  const props = (p: Record<string, string>) => Object.entries(p).map(([k, v]) => `\`${k}\`: ${v}`).join("; ");
  const blocks = d.blocks.map((b) => `| \`${b.block}\` | ${props(b.props) || "defaults"} | ${b.for} |`);
  const e = d.ends;
  return `## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show ${HOOK_SHOW[h.show]} ${h.by ? `by ${h.by} s` : "on frame 0"}${size ? `: ${size}` : ""}. ${h.how}
- **One line and one subject:** ${d.compose ? `${d.compose.kind}. ${d.compose.how}` : "centred. The pair stacks, line above, on the optical centre: take both boxes from \`lineAndSubject(ctx, { lineH })\`; the subject covers the hook's share of the frame (\`heroBox\`)."} Never strand them in the top third with the lower half empty.
- **Ends:** on ${END_KIND[e.kind]}${e.hold ? `, held ${e.hold} s` : ""}${e.onBar ? ", the last change on a bar" : ""}${e.impact ? ", with the system's one impact" : ""}. ${e.how} The block that does it: \`${e.block}\`, ${e.with}.
- **Stillness:** nothing holds still for more than ${d.maxStill} s${d.maxStillBeats ? ` (or ${d.maxStillBeats} beats of the track, when that is longer)` : ""}, except a hold you mark with \`B.hold\` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is ${mixTarget(s.id).lufs} LUFS for the whole mix (within ${d.mix.range} LU), true peak at most ${mixTarget(s.id).truePeak} dBTP. \`untell master\` brings a render to it. Music: ${MUSIC_ROLE[d.mix.music]}. Enter the track (\`${d.mix.entry}\`): ${ENTRY_HOW[d.mix.entry]}. ${d.mix.note}
- **With no sound:** ${noSound(s, d)}
- **Shots:** ${d.shots.min ? `a film of 10 s or more with pictures has at least ${d.shots.min} distinct shot${d.shots.min > 1 ? "s" : ""}: a new angle or new content, never a new crop of one picture. ` : ""}${d.shots.match}
- **Subjects to avoid:** ${[...SUBJECTS_TO_AVOID, ...d.subjectsToAvoid].join("; ")}. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as ${s.name}. Use at least two of them.

${moves.join("\n")}

### Block map

The blocks that carry this system, with the props to use. Look here and in \`systems/BLOCKS.md\` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
${blocks.join("\n")}

Do not use: ${d.avoid.map((a) => `\`${a.block}\` (${a.why.replace(/\.$/, "")})`).join("; ")}.
${d.wanted.length ? `\nNot in the catalog yet. Until a block exists, build the nearest thing from the blocks above, and say in a comment what is missing:\n\n${d.wanted.map((w) => `- **${w.name}**: ${w.for}${w.effect ? ` (effect: ${w.effect})` : ""}`).join("\n")}\n` : ""}`;
}

export function doc(s: System, c: Record<string, string>) {
  const roles = Object.entries(c).map(([k, v]) => {
    const vs = k === "onAccent" ? contrast(v, c.accent!) : contrast(v, c.ground!);
    let use = ROLE_USE[k] ?? "";
    if (s.accentMode === "ink" && k.startsWith("accent")) use = "Equals the ink: this system has no accent colour. Emphasise with size, weight or position.";
    if (s.accentMode === "brand" && k === "accent") use = `Placeholder. For the brand colour, copy the system: \`untell system new <brand> --from ${s.id}\`, set roles.accent (with accentText and onAccent) in its system.ts, then run \`untell system check <brand>\`: it checks the contrast of text on it.`;
    return `| \`${k}\` | \`${v}\` | ${vs.toFixed(1)}:1${k === "onAccent" ? " on accent" : ""} | ${use} |`;
  });
  const allowed = s.allows.map((e: Effect) => `- **${e}**: ${EFFECT_NOTE[e]}`);
  const type = (Object.keys(s.type) as TypeRole[]).map((r) => {
    const t = s.type[r];
    return `| ${r} | ${s.fonts[t.font] ?? t.font} | ${pct(t.size)} | ${Math.round(t.size * 1080)} px | ${t.weight} | ${t.tracking}em | ${t.leading} | ${t.uppercase ? "upper" : "as written"} |`;
  });
  const m = s.motion;
  return `# ${s.name}

${s.personality}

- **Mode:** ${s.mode}
- **Reference:** ${s.reference}
- **Palette:** ${s.pattern}
- **Use it for:** ${s.kinds.join(", ")}${s.needs ? `\n- **Needs from you:** ${s.needs}` : ""}

## How this system builds a frame

${s.grammar.map((g) => `- ${g}`).join("\n")}

${directionDoc(s)}
## Colour roles

Use roles, never colour values. The file \`tokens.css\` defines each role as \`--color-<role>\`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
${roles.join("\n")}

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
${type.join("\n")}

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (${fallbackFonts(s).join(", ")}) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node \`keepCase\` (or the text, title and kineticWords blocks \`keepCase: true\`) for maths and units such as "π r²".
${italicLine(s, c)}

## Layout

- Margin: ${pct(s.margin)} of the short side (${Math.round(s.margin * 1080)} px at 1080).
- Grid: ${s.columns} columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: ${s.radius} px at 1080. Stroke: ${s.stroke} px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y ${1920 - Math.ceil(s.margin * 1080)} px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.${s.bleed?.length ? `\n- This system lets ${s.bleed.join(" and ")} text run past the safe area, edge to edge: ${s.bleed.join(" and ")} type is picture here, and it may run into the lower band (kineticWords stacks it down to 85 % of the height). The word must still read when the platform's UI covers part of it.` : ""}

${chartsOf(s)}

## Motion

${m.character}

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | \`${bez(m.enter)}\` | ${m.frames.enter} |
| Move on screen | \`${bez(m.move)}\` | ${m.frames.move} |
| Exit | \`${bez(m.exit)}\` | ${m.frames.exit} |
| Stagger between items | | ${m.frames.stagger} |

Transitions: ${m.transitions}
${s.step ? `\n**Frame step: ${s.step} fps.** Every tween holds on a ${s.step} fps grid, like paper shot on twos. Both renderers apply it (\`step\` in tokens.json); do not write your own stepper. The frame redraws only on its ticks (every ${Math.floor(30 / s.step)} or ${Math.ceil(30 / s.step)} frames): a change at a beat, a cut or \`onCut(t)\` shows on the first tick at or after the frame it asks for, up to ${Math.ceil(30 / s.step) - 1} frames (${((Math.ceil(30 / s.step) - 1) / 30).toFixed(2)} s) later. \`beats()\` and \`onCut\` give frame times, not tick times; the checks read the frames as drawn, so a cut on a beat that lands between ticks is read on its tick.\n` : ""}${s.opaque ? `\n**Opaque.** Shapes and text never fade: every opacity change is a cut. Both renderers apply it (\`opaque\` in tokens.json); do not tween opacity.\n` : ""}
Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

${s.texture.note}${s.texture.grain ? ` Grain strength: ${s.texture.grain}. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.` : ""}

${allowed.length ? `This system allows only these effects:\n\n${allowed.join("\n")}` : "This system allows no effects: no blur, no shadow, no grain."}

${mediaDoc(s, c)}

## Density

- At most ${s.density.maxWords} words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least ${s.density.minHoldBase} s plus ${s.density.minHoldPerWord} s per word.

## Build with it

Follow the untell skill in your project (\`.claude/skills/untell/SKILL.md\` or \`.agents/skills/untell/SKILL.md\`, written by \`untell init\`). A film is a scene module that names this system: \`export const system = "${s.id}"\`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with \`sceneComposition\` from the kit's \`film.tsx\`, as the example film does.
- HyperFrames: \`untell build <scene>\` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run \`untell lint <scene>\` after each edit, and \`untell check\` before you say the film is done.
- Fonts: ${fontList(s).map((f) => `${f.family} (${f.weights.join(", ")})`).join("; ")}. The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
${s.accentMode === "ink" ? "- Colour as emphasis. This system has no accent colour." : `- More than ${s.accentElements ? `${s.accentElements.max} accent elements` : "one accent element"} in a frame${s.roles.accent2 ? ", except where the system's inks each carry their own meaning" : ""}.${s.accentElements ? ` ${s.accentElements.note}` : SIGNATURE[baseOf(s.id)]?.codeBlock ? " A code block counts as one element: its lit line and its coloured literal values are this system's signature." : ""}`}${(s.exceptions ?? []).map((e) => `\n\nThis system breaks the default rule "${e.rule}" on purpose: ${e.reason}`).join("")}
`;
}

/** The tokens of a system: its values, the colours as hex, its media and its direction (with the subjects to avoid). */
export function tokensOf(s: System, c: Record<string, string> = colours(s)) {
  return { ...s, colors: c, media: MEDIA_SPEC[s.id], direction: { ...DIRECTION[s.id], subjectsToAvoid: [...SUBJECTS_TO_AVOID, ...(DIRECTION[s.id]?.subjectsToAvoid ?? [])] } };
}

/** The four files of a system, as text: tokens.json, tokens.css, fonts.json and SYSTEM.md. */
export function systemFiles(s: System): { "tokens.json": string; "tokens.css": string; "fonts.json": string; "SYSTEM.md": string } {
  const c = colours(s);
  return {
    "tokens.json": JSON.stringify(tokensOf(s, c), null, 1) + "\n",
    "tokens.css": css(s, c),
    "fonts.json": JSON.stringify(fontList(s), null, 1) + "\n",
    "SYSTEM.md": doc(s, c),
  };
}
