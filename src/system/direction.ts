// How a film in each design system is directed: how it opens, which moves make it read as the system,
// which blocks carry it, how it ends, how long it may hold still, how it sounds as a whole, and how its
// pictures match. systems.ts says how a frame looks. This file says how a film moves from its first
// frame to its last.
//
// Four reviews of the 20 demo reels found the same gaps in every group:
// - Openings and ends had no rule. Films opened on 2-8 s of near-empty frames and ended on a still hold.
// - The signature move of a system was not on screen, because no file named it.
// - Agents built by hand, or patched block nodes with `.map`, where a block or a prop already existed.
// - One loudness target served every system, so calm systems were too loud and Raw was silent.
//
// Plain data. scripts/export_systems.ts writes it into each SYSTEM.md (the "Direction" section) and into
// tokens.json (`direction`), where the detector checks can read it (stall can read `maxStill`, ending
// `ends`, loudness `mix`). direction.test.ts checks that every system has every field, that every
// block and prop exists, and that every effect in a system's `allows` has a block that draws it, or a
// wanted entry that says which block is missing.
//
// No asset source is named here. Pictures and sound are described by content, format and parameters only.
import type { Effect, TypeRole } from "./systems";
import { MEDIA_SPEC } from "./media-spec";
import { OWN_SYSTEMS } from "./own.gen";
import type { BLOCKS } from "./scene/blocks";

/** A block name from the catalog (src/system/scene/blocks/index.ts, systems/BLOCKS.md). */
export type BlockName = Exclude<keyof typeof BLOCKS, "measure">;

/** What the first 2 s must show at 9:16. */
export type Hook = {
  /** "picture": the subject in a picture. "line": the main line in type. "both": a picture and the line. */
  show: "picture" | "line" | "both";
  /** By this time, in seconds, the thing shows at full size. 0 means on frame 0. */
  by: number;
  /** The type role of the line, when the hook shows a line. */
  role?: TypeRole;
  /** The smallest share of the frame area the picture covers, when the hook shows a picture. */
  area?: number;
  /** The hook in this system's own way. */
  how: string;
};

/** One move that makes a film read as this system. */
export type Move = {
  move: string;
  /**
   * The checks this move trips by design, on the nodes of the block that draws it: the detector does not count those
   * findings as faults in this system (it lists them as the system's move). Pop's iris grows from a point and covers
   * the frame; that is a scale from zero, a fast full-frame zoom and flat frames, on purpose. Name only what the move
   * is; never a check that a well-made film of the system would pass.
   */
  allows?: { block: BlockName; checks: string[]; why: string };
  /** The effect the move draws. It must be in the system's `allows`. */
  effect?: Effect;
  /** How a check on the render could verify the move, or false when only an eye can judge it. */
  measurable: false | { check: string; how: string };
};

/** A block that carries the system, with the props to use. */
export type BlockUse = {
  block: BlockName;
  /** Prop name to the value or the way to set it. Each prop exists in the block's props type. */
  props: Record<string, string>;
  for: string;
};

/** A block or prop the system needs that the catalog does not have yet. */
export type Wanted = { name: string; for: string; effect?: Effect };

/**
 * How an end card or an end lockup looks in this system (endCard's and lockup's defaults, from the system's "Ends"
 * line): the name's role, the line's role, the mark's height as a share of the frame's height (a picture or a product
 * model; a drawn shape keeps the lockup's size), the axis (a "row" lockup turns to a column in a tall frame, where the
 * name cannot sit beside a large mark), and where the unit sits in the text-safe area.
 */
export type EndLook = { name: TypeRole; line: TypeRole; mark: number; axis: "row" | "column"; place: "upper" | "middle" | "lower" };

/** How a film in this system ends. */
export type Ends = {
  /**
   * "card": the name on a held card. "lockup": a mark or subject with the name on one axis. "offer": the offer
   * (what, when, where) at full size. "paper": the last text dissolves into the ground, and the ground holds.
   * "event": a last change on screen (a result, a run, a final stamp) that holds. "cut": a hard cut to the ground
   * on a bar, with no hold.
   */
  kind: "card" | "lockup" | "offer" | "paper" | "event" | "cut";
  /** How long the last frame holds still, in seconds. 0 for a cut. */
  hold: number;
  /** The last change lands on a bar of the music. */
  onBar: boolean;
  /** The system's one impact lands on the last change. */
  impact: boolean;
  how: string;
  /** The block that makes this ending. It is in the system's block map (direction.test.ts checks it). */
  block: BlockName;
  /** How that block makes it: the props, in words. */
  with: string;
  /** How endCard and lockup set the end in this system. */
  look: EndLook;
};

/** The whole mix: the loudness target and the music's role. */
export type Mix = {
  /** Integrated loudness of the final mix, LUFS. */
  lufs: number;
  /** The allowed distance from the target, in LU. */
  range: number;
  /** "bed": the music sits under the picture. "clock": cuts and entrances land on its beats. "none": no music. */
  music: "bed" | "clock" | "none";
  /**
   * Where the film enters the track. The one place this rule lives: SYSTEM.md (Direction, Mix) and the playbooks
   * read it from here (ENTRY_HOW says how, with the `music` prop).
   * - "drop": the track's drop lands on the film's reveal: `music({ peakAt: <reveal> })`. A clock system.
   * - "swell": the track's loudest bar lands on the reveal, so the bed rises into it: `music({ peakAt, peak: "loudest" })`.
   * - "section": the film opens on the start of a section with energy (not a quiet intro): `music({ align })` with a
   *   section start from `listen.md` or `beats().sections`. The reveal need not sit on a drop. A bed system.
   * - "start": the track's own start, when it opens on its body (room tone, a sparse piano): `music({ clipStart: 0 })`.
   * - "none": no music.
   */
  entry: "drop" | "swell" | "section" | "start" | "none";
  /**
   * "hard": the bed stops dead on the film's one impact, and silence holds after it (Title). The checks read it: the
   * silence after the stop is the design, not a dropout, and a cut there has no beat to miss.
   */
  stop?: "hard";
  note: string;
};

/** For a film of 10 s or more with pictures. */
export type Shots = {
  /** The fewest distinct shots (a new angle or new content, never a new crop of one picture). 0: no pictures. */
  min: number;
  /** What must match between the shots. */
  match: string;
};

/**
 * Where one line and one subject go when the scene does not tune them (blocks/compose.ts). "centred": the pair stacks,
 * line above, on the optical centre (lineAndSubject). "picture": the picture fills its box behind, and the line sits at
 * the optical centre over it. "behind": the picture fills the frame and the line goes behind its cut-out subject
 * through placeBehind. "fill": the words are the subject and fill the text-safe box. "top": the line at the text-safe
 * top and the subject straight under it (code: above the low band, where its column has the full text-safe width).
 * "field": a small picture in a large empty field of the ground, off centre, and the line small with wide space round it
 * (Ma).
 */
export type Compose = {
  kind: "centred" | "top" | "picture" | "behind" | "fill" | "field"; how: string;
  /**
   * Where a drawing's figure sits in a tall frame (Schematic): its geometry spans the picture-safe width and stands on
   * `foot`, a share of the frame's height, and its labels and dimensions fill the text-safe area above it. figureBox
   * gives that box, and fitDrawing with no area fits a drawing into it.
   */
  figure?: { foot: number };
  /** The system never shows an empty panel: a window or a pane is filled with rows to its foot (Graphite). */
  fullPanes?: boolean;
};

/**
 * How much empty frame a film in this system may show (the dead_space check reads it). An empty span is a run of rows
 * (at 16:9 also columns) across the whole frame that holds no content.
 * - `emptyShare`: the largest share of the film's frames (outside a designed end and declared holds) that may show such
 *   a span. 0.15 for a system that fills the frame, 0.35 by default, 0.75 for a system that may breathe.
 * - `emptyRun`: the longest one stretch with such a span may last, seconds (2 s; 6 s where the system may breathe).
 */
export type Space = { emptyShare: number; emptyRun: number };

export type Direction = {
  hook: Hook;
  /** The default composition of one line and one subject. Default: "centred". */
  compose?: Compose;
  /** How much empty frame the film may show over time. */
  space: Space;
  /**
   * What the accent is reserved for, when the system keeps it for states a film may not have (Keynote: links and
   * selected states). A system that names this need not show its accent in a film without those states, so the
   * signature check does not ask for it. A system without it carries its accent in every film (where its block map
   * puts it: the key word, the mark, the result line).
   */
  accentFor?: string[];
  /** Two to four moves. */
  moves: Move[];
  /** Three to seven blocks that carry the system (a drawn system needs its parts: sheet, gear, belt, callout...). */
  blocks: BlockUse[];
  /** Blocks that work against the system. */
  avoid: { block: BlockName; why: string }[];
  /** Blocks or props the system needs that the catalog lacks. */
  wanted: Wanted[];
  ends: Ends;
  /** The longest still stretch, in seconds, outside a declared hold and the closing hold. The stall check reads it. */
  maxStill: number;
  /**
   * For a system whose music is the clock: the longest still stretch in beats of the film's track. A word held for
   * two beats is the system's rhythm, not a stall. maxStillFor(d, bpm) gives the limit for a track: the larger of
   * maxStill and these beats at that tempo. maxStill itself covers these beats at 115 BPM, for a check that does
   * not know the tempo.
   */
  maxStillBeats?: number;
  mix: Mix;
  shots: Shots;
  /** Subjects to avoid in this system, added to SUBJECTS_TO_AVOID. Content advice, not a ban on a source. */
  subjectsToAvoid: string[];
};

/**
 * Subjects every model reaches for first. A viewer has seen each one many times, so a film about one of them
 * reads as made by default. Pick a subject the brief would not expect, with one fact the viewer can use.
 */
export const SUBJECTS_TO_AVOID = [
  "Fibonacci numbers or the golden spiral",
  "hello world",
  "a to-do app",
  "FizzBuzz or a sort of ten numbers",
  "a weather app",
  "the digits of pi",
  "light's trip to the Moon",
];

/**
 * Which effects a block can draw today. "renderer": both renderers draw it over the frame (grain).
 * An effect with no block here needs a wanted entry in each system that allows it.
 */
export const EFFECT_DRAWN_BY: Record<Effect, { renderer?: true; blocks: { block: BlockName; prop?: string }[] }> = {
  grain: { renderer: true, blocks: [] },
  "light-sweep": { blocks: [{ block: "product", prop: "sweep" }, { block: "photo", prop: "sweep" }] },
  // The 3D rig puts a tight contact shadow under the object and a cool rim light on dark systems.
  "contact-shadow": { blocks: [{ block: "product" }] },
  "rim-light": { blocks: [{ block: "product" }, { block: "photo", prop: "rim" }] },
  halftone: { blocks: [{ block: "photo", prop: "passes" }] },
  // Both renderers draw scanlines over the frame (layout.scanlineStyle) at the system's texture.scanlines.
  scanlines: { renderer: true, blocks: [] },
  // The 3D renderer mirrors the scene in the floor at the system's texture.reflection (three/render.ts).
  reflection: { blocks: [{ block: "product" }] },
  "shadow-bars": { blocks: [{ block: "shadowBars" }] },
  "motion-blur": { blocks: [{ block: "camera", prop: "whips" }] },
};

export const DIRECTION: Record<string, Direction> = {
  // ---------------------------------------------------------------- light
  studio: {
    accentFor: ["links", "selected states"],
    hook: { show: "picture", by: 1, area: 0.2, how: "The product on frame 0, small in the near-white field, with a gentle push already running. The one sentence lands by 1.5 s." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    compose: { kind: "top", how: "The line first, at the text-safe top (its height from lineH); then the product under it, framed with `room`: the frame under the line, a body line height below it. The product's drawn bounds at their largest over the shot then stay clear of the line by construction: never on the handle or the rim. The anchor `<product id>-object-extent` holds those bounds, to check the gap." },
    moves: [
      { move: "A contact shadow under the product: it stands on the ground, it does not float. `product` draws it; a photograph keeps the shadow it was shot with (`photo` adds none).", effect: "contact-shadow", measurable: false },
      { move: "A cross-dissolve on a held frame between shots, never a wipe or a scale jump.", measurable: { check: "signature", how: "Each scene change is a blend of two frames over 8-15 frames, with no frame that matches neither shot." } },
      { move: "A slow push of 1-4 % on every shot, so a hold still breathes.", measurable: { check: "stall", how: "No stretch longer than maxStill with under 0.15 % of the frame changed." } },
      { move: "Type rises out of a mask, one line at a time; at least 40 % of the frame stays empty.", measurable: { check: "dead-space", how: "The empty share stays at 40 % or more, and no band is empty past its limit." } },
    ],
    blocks: [
      { block: "photo", props: { motion: '"push"', amount: "0.01-0.04", enter: '"dissolve" between shots', exit: '"dissolve"' }, for: "The product shot, in a small field or full bleed." },
      { block: "product", props: { shot: '"turntable" or "push"' }, for: "A 3D product: it draws the contact shadow." },
      { block: "title", props: { enter: '"line" (the default mask)', maxLines: "2" }, for: "The one sentence of each scene." },
      { block: "bigStat", props: { count: "true", label: "the unit and what it measures" }, for: "One number with its meaning, label first." },
      { block: "hit", props: {}, for: "A soft click on the one real interaction, a swell into the reveal." },
      { block: "endCard", props: { name: "the subject's name", line: "what it is, or a date or a price", at: "the last strong beat" }, for: "The held finish: the name and what it is, or a date or a price, landing on a beat." },
    ],
    avoid: [
      { block: "wipe", why: "Studio never wipes; it dissolves or cuts on a held frame." },
      { block: "kineticWords", why: "Fast word cuts break the calm, one-sentence pace." },
    ],
    wanted: [
    ],
    ends: { kind: "card", hold: 1.5, onBar: true, impact: false, how: "The product on its contact shadow, the name in display and one line in headline, centred as one unit. No \"Learn more\": a film has no link.", block: "endCard", with: "`name`, `line`, `at` on the last strong beat", look: { name: "display", line: "headline", mark: 0.3, axis: "column", place: "middle" } },
    maxStill: 2.5,
    mix: { lufs: -17, range: 2, music: "bed", entry: "swell", note: "A light bed under the picture. One click on a real interaction; the swell rises into the reveal." },
    shots: { min: 3, match: "The same product and the same light; change the angle or the action at each cut, never only the scale." },
    subjectsToAvoid: ["a gadget with no stated job", "a spec sheet read aloud"],
  },
  spec: {
    hook: { show: "line", by: 0.5, role: "display", how: "The subject, measured, on frame 0: a figure of it with one dimension line and its value (`photo` with `frame: \"figure\"` and a `dimension`), or the key number in tabular display figures with a dimension line under it, when the film has an honest key number at the start. Never a number the film does not yet have. The line of the question in display by 0.5 s." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    moves: [
      { move: "The grid draws first: hairline rules and + marks where they cross; every element snaps to it.", measurable: { check: "signature", how: "Hairlines at the column positions show in at least one key frame." } },
      { move: "Labels type on in mono at 40 characters a second, a tick as each one snaps.", measurable: { check: "sound/cut-on-beat", how: "Each tick sits within 2 frames of its label's last character." } },
      { move: "A bordered figure window with a FIG. label holds the one picture.", measurable: false },
      { move: "A match cut: the picture cuts to the drawing on the same pixels, on a beat.", measurable: false },
    ],
    blocks: [
      { block: "sheet", props: { grid: '"marks"', titleBlock: "FIG., SCALE (fitDrawing's scale) and SHEET", figures: "a number for each figure" }, for: "The visible grid, its crosshairs and the title block, complete; fitDrawing fills the frame with the drawing." },
      { block: "dimension", props: { offset: "clear of the part", text: "the value with its unit", follow: "the part's keys when it moves" }, for: "Dimension lines with their values." },
      { block: "typeOn", props: { pace: '"write"' }, for: "Mono labels that write themselves." },
      { block: "bigStat", props: { format: "tabular, with the unit" }, for: "The large number the film is about." },
      { block: "callout", props: { number: "the part's number", label: "the part", target: "a point on the part", outside: "the drawing's box from fitDrawing" }, for: "A label outside the drawing with a short leader to the part it names." },
      { block: "photo", props: { frame: '"figure"', motion: '"still"' }, for: "A reference picture in a bordered, labelled figure window." },
      { block: "rope", props: { run: "the stops: the fixed end, each wheel (a `pulley`: r from fitDrawing, `turns` from rollDegrees) with its turn, the free end", light: "the part of the rope the film explains" }, for: "An open rope over pulleys (wheels with no teeth that turn by key marks): a hoist, a crane, a winch." },
    ],
    avoid: [
      { block: "kineticWords", why: "Spec labels and draws; it does not shout words." },
      { block: "quote", why: "A technical drawing has no pull quote." },
    ],
    wanted: [
    ],
    ends: { kind: "event", hold: 1.5, onBar: true, impact: false, how: "A last comparison drawn on the sheet (the answer beside its reference, with its dimension), then a final tick and a hold.", block: "dimension", with: "the answer's dimension drawn last, a final tick from `hit({ on })`, then `hold` to the end", look: { name: "headline", line: "body", mark: 0.2, axis: "column", place: "upper" } },
    maxStill: 1.8,
    mix: { lufs: -16, range: 2, music: "clock", entry: "drop", note: "Minimal and clean. Labels snap on its beats; the ticks are the only effects." },
    shots: { min: 1, match: "One subject, drawn and photographed at one scale, so the match cut lands on the same pixels." },
    subjectsToAvoid: ["the golden ratio", "a generic dashboard"],
  },
  manual: {
    compose: { kind: "top", how: "The page is code and its run. The question at the text-safe top, the code straight under it, and the run under the code in a pane with the same edges (terminal, `resultRole: \"headline\"`, `end: \"result\"`), so the panes fill the page to the text-safe foot. Size each from its rows (B.measure). Under the low band's top at 9:16 the code column is narrower: keep lines short enough that none wraps. A longer run, or a drawing of the result, goes in the next view." },
    hook: { show: "line", by: 1, role: "headline", how: "The question in prose and the first line of real code, both readable on frame 0. The code types on from there." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    moves: [
      { move: "One lit line: the highlight band in the accent, with the line number in the accent too. It moves in one stride, never sweeps through other lines.", measurable: { check: "signature", how: "The accent covers a band one row high in the code column while a line is lit." } },
      { move: "Code types at a human rate (codeBlock `enter: \"type\"`), with soft key ticks from `typing`, which keeps the ticks to the effects limit.", measurable: { check: "sound/hit-over-bed", how: "The ticks stand 6 dB or more over the bed." } },
      { move: "The view scrolls to the next block; it never zooms.", measurable: false },
      { move: "The output proves the idea: the run prints, and the picture shows what it printed.", measurable: false },
    ],
    blocks: [
      { block: "codeBlock", props: { highlight: "one line at a time, on the beat", firstLine: "the real line number", band: '"tint" (the default here: the teal band, gutter bar and number)', jump: '"cut" (the default here)', enter: '"type" (the first row rests on frame 0 when at is 0, then the rest types on); each highlight after its row is typed (the line anchor\'s data.typedAt)' }, for: "Real code at a readable size with line numbers." },
      { block: "terminal", props: { session: "the command and its real output", result: "true on the one line the run proves", resultRole: '"headline" when the result is the reveal' }, for: "The run that proves the code. terminalHeight() gives the panel height for its rows." },
      { block: "text", props: { role: '"headline" for the question of the hook (the hook\'s role); "body" for prose beside the code' }, for: "Prose beside or above the code, never over it." },
      { block: "camera", props: { moves: "vertical scrolls only, no zoom" }, for: "The scroll to the next block." },
      { block: "pane", props: { title: "the file or the shell", inset: "the default, shared by every pane" }, for: "One window for code and output, so their edges align (paneStack)." },
    ],
    avoid: [
      { block: "kineticWords", why: "Manual reads at a human pace." },
      { block: "photo", why: "Pictures are rare here; the code and its output are the subject." },
    ],
    wanted: [
    ],
    ends: { kind: "event", hold: 1.5, onBar: true, impact: false, how: "A last run with a larger input: the output prints, and the cursor blinks on the last line.", block: "terminal", with: "the last command prints its result (`result: true`) on the last bar; the cursor blinks to the end", look: { name: "headline", line: "body", mark: 0.18, axis: "column", place: "upper" } },
    maxStill: 2.4,
    mix: { lufs: -18, range: 2, music: "bed", entry: "section", note: "Mellow and unhurried. A key tick under typed code, and only then." },
    shots: { min: 1, match: "One program: the code, the run and the output are about the same function." },
    subjectsToAvoid: ["Fibonacci", "a sort of ten numbers"],
  },
  ma: {
    compose: { kind: "field", how: "A small picture in a large field of paper: the picture at the size its hook asks (about 40 % of the frame's width, at least 8 % of the frame; heroBox with area: 0.1), set off centre on a third (right of centre, a little above the middle), and the line small (body, the floor size) on the text-safe left, two short rows broken where the sense breaks, a wide gap of paper below the picture. Never a plate that fills the frame, never a card centred on the page. At least 70 % of the frame stays paper." },
    hook: { show: "picture", by: 1, area: 0.08, how: "One real thing on frame 0 in a large field of paper: a moving shadow, a plate of a wall, a small object. Never a flat placeholder square." },
    // Empty frame over time: may breathe.
    space: { emptyShare: 0.75, emptyRun: 6 },
    moves: [
      { move: "Every entrance and exit is a slow fade through the paper, 1.5-2.5 s; nothing rises out of a mask.", measurable: { check: "signature", how: "Each text and picture reaches full opacity over 40 frames or more." } },
      { move: "At least 70 % of the frame is empty paper, and the one image or line sits in it.", measurable: { check: "dead-space", how: "The empty share stays at 70 % or more on every key frame." } },
      { move: "One credit per musical phrase, each in its own silence of paper.", measurable: { check: "message-gap", how: "Two texts never share the screen; a gap of 0.5-1 s of paper sits between them." } },
    ],
    blocks: [
      { block: "photo", props: { motion: '"still" or "drift"', box: "small, in the field", enter: '"dissolve"', exit: '"dissolve"' }, for: "The one image, at about 40 % of the width." },
      { block: "text", props: { role: '"body" for the one line of a beat (it must read on a phone); "caption" or "label" only for a credit', enter: '"fade" (the system default)' }, for: "The one line in the field, and small, widely spaced credits." },
      { block: "rule", props: { weight: "the system stroke" }, for: "A hairline horizon." },
      { block: "hold", props: {}, for: "The long holds that are the design." },
      { block: "music", props: { fadeOut: "about 2 s", roomTone: "a recording of a quiet room, under the bed from frame 0" }, for: "The sparse bed, fading with the last dissolve, over a room tone." },
    ],
    avoid: [
      { block: "shape", why: "A flat square of colour reads as a missing image. Use a real picture." },
      { block: "kineticWords", why: "Nothing hurries in Ma." },
      { block: "wipe", why: "Ma dissolves through the paper." },
    ],
    wanted: [
    ],
    ends: { kind: "paper", hold: 1, onBar: false, impact: false, how: "The title dissolves into the paper over about 2 s, and 1 s of paper holds under the last decay of the music. Not a held card.", block: "text", with: "the last line with `until` about 2 s before the end and its exit a fade (the vocabulary); the paper holds", look: { name: "body", line: "caption", mark: 0.12, axis: "column", place: "middle" } },
    maxStill: 4,
    mix: { lufs: -20, range: 2, music: "bed", entry: "start", note: "Sparse and quiet, with room tone from frame 0. No effects: silence is part of the design." },
    shots: { min: 1, match: "One image. If a second comes, it shares the first one's light and paper tone." },
    subjectsToAvoid: ["a generic zen garden", "a quote about mindfulness"],
  },
  primary: {
    compose: { kind: "centred", how: "Off centre, as the hook asks: take both boxes from `lineAndSubject(ctx, { lineH })`, then move the shape to one side until its edge passes the frame's edge (a shape is a graphic: it may leave the frame); the line keeps the text-safe side, clear of the shape." },
    hook: { show: "both", by: 1, role: "headline", area: 0.3, how: "A large primary shape, off centre, with the question set on a 45-degree axis along its edge, on frame 0. The hook check counts one shape, or the parts of one block, that cover 30 % of the frame: two blocks side by side (a square and a band) do not add up." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    moves: [
      { move: "Shapes turn in 90-degree steps, with a click on each step.", measurable: { check: "sound/cut-on-beat", how: "Each turn lands on a beat, and a click sits within 2 frames of it." } },
      { move: "Type sits on a 45- or 90-degree axis.", measurable: false },
      { move: "A shape sweeps across and becomes the next frame.", measurable: false },
      { move: "Shapes enter opaque: they slide or grow, never fade.", measurable: { check: "signature", how: "No shape is at partial opacity for more than 2 frames." } },
    ],
    blocks: [
      { block: "shape", props: { kind: '"circle", "square" or "triangle"', enter: '"slide" or "grow"', turns: "90-degree steps on beats" }, for: "The whole film is built from the three shapes." },
      { block: "carry", props: { then: "the next place on the next beat" }, for: "A label that rides a shape to its next place." },
      { block: "highlight", props: { style: '"underline"' }, for: "One word marked by its colour's meaning." },
      { block: "hit", props: {}, for: "A click on each turn, a pop when a shape lands." },
      { block: "formula", props: { text: "the measure or the rule", follow: "the shape's x and y keys" }, for: "A label that stays on a shape's edge while it moves; dimension for a measured edge." },
      { block: "title", props: { angle: "-45 (rises to the right) or 90", w: "the room along the axis" }, for: "Type on a 45-degree axis: the title turns as one unit, and its safe-area check turns with it." },
    ],
    avoid: [
      { block: "lineChart", why: "Bauhaus shows with geometry, not with plotted data." },
      { block: "kineticWords", why: "Type sits on an axis and turns in steps; it does not roll or pop." },
    ],
    wanted: [
      { name: "morph", for: "One shape that becomes the next (a circle cut into wedges that become a rectangle)." },
    ],
    ends: { kind: "event", hold: 1.5, onBar: true, impact: false, how: "The proof completes in one flat colour on the last beat, with the result set inside the shape.", block: "shape", with: "the last shape lands on the last beat with the result set inside it (`text` over it)", look: { name: "headline", line: "body", mark: 0.26, axis: "column", place: "upper" } },
    maxStill: 1.6,
    mix: { lufs: -16, range: 2, music: "clock", entry: "drop", note: "Precise and playful. Every turn and landing sits on its beats." },
    shots: { min: 1, match: "If a photo comes, its subject turns into the shapes in place, in the system's flat colours." },
    subjectsToAvoid: ["the area of a circle by wedges, unless the film shows the wedges straighten"],
  },
  riso: {
    compose: { kind: "picture", how: "The print fills the frame under a band of paper at the top (lineInBand: the photo takes the picture box): the line in display, large, on the paper, where the print's inks are knocked out, as a two-colour print sets type. Ink over ink takes the line's contrast, so never set the line on the print." },
    hook: { show: "line", by: 0.5, role: "display", how: "The main line (the name, when the film has one) in one ink on frame 0, large and cropped by the sheet edge. The other inks print the rest on the beats." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    moves: [
      { move: "One ink a beat: each layer stamps in one frame on a beat, never fades.", measurable: { check: "sound/cut-on-beat", how: "Each new layer appears in one frame, within 2 frames of a beat." } },
      { move: "Inks multiply where they overlap, 1-3 px off register.", measurable: { check: "signature", how: "The overprint colour (both inks multiplied) shows in at least one key frame." } },
      { move: "Tone comes from halftone dots, never a smooth gradient.", effect: "halftone", measurable: false },
      { move: "Motion steps at 12 fps.", measurable: { check: "signature", how: "Moving things change on every second or third frame only." } },
    ],
    blocks: [
      { block: "photo", props: { motion: '"still"', passes: "{ beat: one bar }: one halftone layer per ink, overprinted" }, for: "The hero picture, printed ink by ink." },
      { block: "shape", props: { enter: '"cut"', layer: "per ink" }, for: "Flat ink shapes that stamp." },
      { block: "wipe", props: { style: '"cut"', fill: "one ink" }, for: "A new ink layer that stamps over the old one." },
      { block: "text", props: { role: '"display"' }, for: "Type as ink." },
      { block: "hit", props: {}, for: "A dull stamp as each ink prints." },
    ],
    avoid: [
      { block: "kineticWords", why: "Its rolls and pops tween every frame; print steps." },
    ],
    wanted: [
    ],
    ends: { kind: "event", hold: 1.5, onBar: true, impact: false, how: "The finished print: the last ink stamps on the bar, and the full sheet holds. Never blank paper.", block: "shape", with: "the last ink layer stamps (`enter: \"cut\"`) on the bar; the full sheet holds", look: { name: "display", line: "body", mark: 0.26, axis: "column", place: "upper" } },
    maxStill: 1.5,
    mix: { lufs: -16, range: 2, music: "clock", entry: "drop", note: "Dusty and warm. Each stamp lands on a beat; stamp again on each strong onset through a hold." },
    shots: { min: 2, match: "Each picture in the same two inks and halftone screen." },
    subjectsToAvoid: ["a print fair poster with no date or place"],
  },
  cutout: {
    hook: { show: "line", by: 1, role: "display", how: "A black slab enters on frame 0 with the first word of the main line already fitted into it, cropped by the slab's edges." },
    compose: { kind: "centred", how: "The slab is the subject: a cut shape at the hook's share (heroBox, a graphic), and the line is fitted into it (fitText: ground on the ink slab, onAccent on the hot slab), as large as the slab allows, angled with it. Never a line stacked above a shape. The hot colour once in the frame: the slab that carries the word." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    moves: [
      { move: "Type is fitted into the shapes, as large as the slab allows, angled with it.", measurable: false },
      { move: "A black shape wipes across and becomes the next shape: the panel holds full cover for 2 frames at most.", measurable: { check: "accident", how: "No run of more than 2 frames in one flat colour." } },
      { move: "Shapes slide in from the frame edge on a stepped 12 fps feel, fully opaque.", measurable: { check: "signature", how: "No sliding shape is at partial opacity." } },
      { move: "One hot colour, used once per frame, as the action.", measurable: { check: "signature", how: "The accent covers one connected region per key frame." } },
    ],
    blocks: [
      { block: "shape", props: { enter: '"slide"', kind: '"rect" or "triangle"', fill: '"accent" for the one hot slab (the action, once a frame), "ink" for the rest' }, for: "The cut paper slabs." },
      { block: "wipe", props: { style: '"panel"', direction: "the travel of the next shape" }, for: "The black shape that becomes the next frame." },
      { block: "kineticWords", props: { onAccent: "true on a hot slab" }, for: "Names that fill their slab." },
      { block: "hit", props: {}, for: "A paper slide on each crossing, a stamp when the title locks." },
      { block: "fitText", props: { role: '"display"', enter: '"cut"', color: '"ground" on the ink slab, "onAccent" on an accent slab (ink on ink does not show)', x: "the slab's box (x, y, w, h)" }, for: "The largest type inside a slab." },
      { block: "lockup", props: { axis: '"row"', mark: "the slab's shape", slab: '"ink" (the title cut in one slab)', lines: "2 for a title of three words or more" }, for: "The title as one cut: words at one size in one slab." },
      { block: "photo", props: { paper: "true (the subject as a two-tone paper cut; needs the cut-out from prepare)", shape: '"circle", "square" or "triangle"', motion: '"still"', enter: '"cut"' }, for: "A picture (rare): a cut-out as flat cut paper, cropped to a shape, small in a large empty field. Never a graded photograph at full size." },
    ],
    avoid: [
      { block: "lineChart", why: "Cut paper does not plot data." },
    ],
    wanted: [
      { name: "fitText in a tilted band", for: "The largest type inside a tilted band or a polygon; fitText fills an upright box only." },
    ],
    ends: { kind: "lockup", hold: 1.5, onBar: true, impact: false, how: "The title locks as one lockup on the bar, with a stamp, and holds.", block: "lockup", with: "`axis: \"row\"`, `at` on the bar, with a stamp from `hit`", look: { name: "display", line: "body", mark: 0.2, axis: "row", place: "middle" } },
    maxStill: 1.5,
    mix: { lufs: -16, range: 2, music: "clock", entry: "drop", note: "Big-band and tense. The busiest picture goes on the busiest bars." },
    shots: { min: 1, match: "One silhouette per subject, in two tones, cut as paper." },
    subjectsToAvoid: ["a generic movie title with no story"],
  },
  mark: {
    hook: { show: "picture", by: 0.5, area: 0.15, how: "The unit module of the mark, centred on frame 0, on a visible grid in ink: a path of `drawnMark` given a time at or before 0 is drawn and filled on frame 0. The paths of one mark count together as the picture." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    compose: { kind: "centred", how: "The pair stacks, line above, on the optical centre (lineAndSubject at the hook's area), inside the frame grid: when the module would pass the grid's foot, move the pair up so the module ends on it." },
    moves: [
      { move: "The mark builds from at most five modules that snap to the grid on beats.", measurable: { check: "sound/cut-on-beat", how: "Each module lands within 2 frames of a beat." } },
      { move: "Each module draws on by its outline, then its fill lands on a beat; the grid stays until the lockup.", measurable: false },
      { move: "The wordmark locks up on the same grid: cap height and baseline on grid rows.", measurable: false },
    ],
    blocks: [
      { block: "frameGrid", props: { marks: "true" }, for: "The visible grid while the mark builds." },
      { block: "drawnMark", props: { mark: "the brand mark: the name an SVG file was added under (untell media add <file>.svg --as <name>), or inline paths", accent: "the one path in the brand colour (default: the first path, the unit module)", line: "the one line over the mark while it builds; the block takes it off before the lockup", times: "each module's draw on a beat; the unit module at or before 0", fills: "each fill on a beat", lockup: "the name and its line, `at` on the bar" }, for: "The mark, drawn on by its strokes, filled module by module, then locked up with the name." },
      { block: "shape", props: { kind: '"circle"', stroke: '"rule"', enter: '"draw"' }, for: "Construction lines (the circle an arc of the mark comes from) while the mark builds." },
      { block: "text", props: { role: '"headline"' }, for: "The wordmark, on the grid." },
      { block: "hold", props: {}, for: "The 2 s hold on the finished mark." },
      { block: "hit", props: {}, for: "A pop as each module lands, one impact when the mark resolves." },
      { block: "lockup", props: { axis: '"row"', mark: "a flat shape, when the brief gives no SVG mark" }, for: "The name with a flat mark on one axis, centred, when there is no brand mark to draw." },
    ],
    avoid: [
      { block: "photo", why: "An identity film shows the mark, not a picture." },
      { block: "kineticWords", why: "The mark is the subject, not words." },
    ],
    wanted: [],
    ends: { kind: "lockup", hold: 2, onBar: true, impact: true, how: "The finished mark and the name as one lockup on one axis, centred, with the one impact, held 2 s. At 9:16 the name and its line go over the mark, so the mark keeps the size it was built at and the text stays in the text-safe area.", block: "drawnMark", with: "`lockup: { name, line, at }` with `at` on the bar (the mark moves into place and the closing hold is marked), the one impact from `hit`", look: { name: "headline", line: "body", mark: 0.3, axis: "column", place: "middle" } },
    maxStill: 2,
    mix: { lufs: -16, range: 2, music: "clock", entry: "drop", note: "Clean percussion. Every module lands on a beat." },
    shots: { min: 0, match: "No pictures: the mark is the only subject." },
    subjectsToAvoid: ["a mark made of initials in a circle"],
  },
  raw: {
    hook: { show: "line", by: 0.5, role: "headline", how: "A full page on frame 0: borders, the first line typing with its cursor, and under it what the page holds (a table, a list or a form, whichever the film has)." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    compose: { kind: "centred", how: "A full page: the typed line and, under it, a table; the page's border round both (B.measure plus a pad), its middle on the optical centre. At 9:16 the page keeps to the low band's text-safe right edge. Never an empty page." },
    moves: [
      { move: "Text types on with a block cursor at a human pace; the cursor is the only constant motion.", measurable: { check: "signature", how: "Text grows one character at a time while it types, and a cursor blinks at its end." } },
      { move: "Hard cuts and one-frame appearances; nothing tweens.", measurable: { check: "signature", how: "No element is at partial opacity on any frame." } },
      { move: "A page-down: the whole page jumps one screen in one frame.", measurable: false },
      { move: "Every edge sits on two verticals; the page is crude in style and exact in alignment.", measurable: { check: "panel-near-miss", how: "No two edges sit 1-8 px apart." } },
    ],
    blocks: [
      { block: "typeOn", props: { cursor: "true", pace: '"human"', role: '"headline" for the line of the hook (the default label is for small print)' }, for: "Every line that writes itself." },
      { block: "box", props: { stroke: '"ink"', x: "round its content: B.measure of the typed lines and the table, plus a pad; never an empty page" }, for: "Visible borders and table cells." },
      { block: "text", props: { color: '"accentText" for a link (the one blue), with an underline rule under it', role: '"headline" (Raw\'s body is under the phone floor)' }, for: "A link the viewer could follow: the only colour." },
      { block: "camera", props: { moves: "one-frame jumps (the system is instant)" }, for: "The page-down." },
      { block: "hit", props: {}, for: "A plain click on a line end, at most six in 10 s." },
      { block: "field", props: { label: "the field's name", value: "what is typed in it", role: '"headline" (Raw\'s body is under the phone floor)' }, for: "A default form as a page ends: a ruled box with its name, the value typed at a human pace." },
    ],
    avoid: [
      { block: "wipe", why: "Raw cuts; it never wipes." },
      { block: "kineticWords", why: "Raw is a page, not a poster." },
    ],
    wanted: [
    ],
    ends: { kind: "event", hold: 1.5, onBar: false, impact: false, how: "A default form or link the viewer can act on, the button pressed in one frame, then the name as a heading. Never a broken image.", block: "typeOn", with: "the name types as a heading (`cursor: true`) after the button press", look: { name: "headline", line: "body", mark: 0.16, axis: "column", place: "upper" } },
    maxStill: 1.5,
    mix: { lufs: -26, range: 4, music: "none", entry: "none", note: "No music. Plain clicks only, at most six in 10 s, so the film is near silent." },
    shots: { min: 2, match: "Pictures on one page share one light and one colour cast." },
    subjectsToAvoid: ["a personal homepage with no news"],
  },
  pop: {
    compose: { kind: "centred", how: "The pair stacks, line above, on the optical centre: take both boxes from `lineAndSubject(ctx, { lineH, area: 0.3 })`, so the character owns the middle of the frame; the hook's share (0.2) is its floor." },
    hook: { show: "both", by: 0.5, role: "headline", area: 0.2, how: "The character and the question on frame 0, the character already moving. The character is large: it owns the middle of the frame (lineAndSubject with area 0.3), never a small mark under the line." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    moves: [
      { move: "Squash and stretch, with overshoot on arrival.", measurable: false },
      { move: "One character leads from the first frame to the last.", measurable: false },
      { move: "A big rounded shape scales up and becomes the next scene.", measurable: false,
        allows: { block: "wipe", checks: ["motion/scale-from-zero", "a11y/motion", "accident"], why: "Pop's iris grows from a point until it covers the frame, holds full cover for a beat and becomes the next scene: a scale from zero, a fast full-frame growth and flat frames, by design." } },
      { move: "Buttons are chunky, with a darker bottom edge, and sink when pressed.", measurable: false },
    ],
    blocks: [
      { block: "shape", props: { kind: '"circle" or "rect"', fill: '"accent" for the character (the one green that leads)', enter: '"grow"' }, for: "The character's parts and the chunky buttons." },
      { block: "wipe", props: { style: '"iris"' }, for: "The rounded shape that grows into the next scene." },
      { block: "meter", props: { shape: "a rounded bar" }, for: "A quantity that fills, such as heat." },
      { block: "hit", props: {}, for: "A pop as a shape lands, a click on a press, a whoosh on a fast slide." },
      { block: "button", props: { depth: "a chunky bottom edge", press: "the click times" }, for: "A rounded button whose face sinks onto its edge on a press." },
      { block: "photo", props: { shape: '"circle"', sticker: "true" }, for: "A cut-out object as a flat sticker on a round shape; never in place of the character." },
      { block: "lockup", props: { axis: '"row"', mark: "the character or the app icon" }, for: "The end: the character, the icon and the name as one lockup." },
    ],
    avoid: [
      { block: "counter", why: "Rolling digits fade under 0.5 opacity; show the quantity as a meter." },
    ],
    wanted: [
      { name: "character", for: "Face states, squash and stretch, held through the film." },
    ],
    ends: { kind: "lockup", hold: 1.5, onBar: true, impact: false, how: "The character, the app icon and the name as one lockup, the button pressed, with a small idle bounce.", block: "lockup", with: "the character, the icon and the name, `at` on the bar", look: { name: "headline", line: "body", mark: 0.3, axis: "column", place: "middle" } },
    maxStill: 1.2,
    mix: { lufs: -15, range: 2, music: "clock", entry: "drop", note: "Upbeat. The burst lands on the track's strongest onset." },
    shots: { min: 1, match: "One drawn character all through." },
    subjectsToAvoid: ["a generic quiz with no reaction"],
  },
  // ---------------------------------------------------------------- dark
  keynote: {
    accentFor: ["links", "selected states"],
    hook: { show: "picture", by: 1, area: 0.15, how: "The subject lit on black on frame 0, a slow push running, with the bed audible. Never 2 s of near-black." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    compose: { kind: "top", how: "The line first, at the text-safe top (its height from lineH); then the product under it, framed with `room`: the frame under the line, a body line height below it. The product's drawn bounds at their largest over the shot then stay clear of the line by construction: never on the handle or the rim. The anchor `<product id>-object-extent` holds those bounds, to check the gap." },
    moves: [
      { move: "A light sweep: a narrow band of light crosses the subject's surface once, at its brightest on an accent.", effect: "light-sweep", measurable: { check: "signature", how: "A bright band moves across the subject's mask over 30-50 frames." } },
      { move: "A thin rim light draws the subject's dark edge.", effect: "rim-light", measurable: false },
      { move: "Slow push-ins of 15-20 % on long holds; a shot never stops.", measurable: { check: "stall", how: "No stretch longer than maxStill without change." } },
      { move: "One line of type per scene, revealed through a mask.", measurable: false },
    ],
    blocks: [
      { block: "product", props: { sweep: "the accent time", shot: '"push" or "orbit"' }, for: "A 3D subject with its sweep and rim." },
      { block: "photo", props: { motion: '"push"', amount: "0.15-0.2", sweep: "a light band on the accent time, masked by the cut-out", rim: "a rim line from the cut-out" }, for: "A photographed subject, with its sweep and rim." },
      { block: "title", props: { enter: '"line"', maxLines: "2 (with 1, a sentence steps down to body size and warns)" }, for: "One sentence per scene, in display or headline." },
      { block: "hit", props: {}, for: "A swell into the reveal, one low impact on the name." },
      { block: "endCard", props: { name: "the full name", line: "one line", at: "the last strong beat" }, for: "The held finish: the name and one line, landing on a beat." },
    ],
    avoid: [
      { block: "kineticWords", why: "Keynote is slow; one line per scene." },
      { block: "barChart", why: "A keynote states one number, not a chart." },
    ],
    wanted: [
    ],
    ends: { kind: "lockup", hold: 1.5, onBar: true, impact: true, how: "The subject small and centred, the full name in headline under it, with the one low impact on the card.", block: "endCard", with: "`name`, `line`, `at` on the last strong beat, with the one low impact", look: { name: "headline", line: "body", mark: 0.24, axis: "column", place: "middle" } },
    maxStill: 2,
    mix: { lufs: -18, range: 2, music: "bed", entry: "swell", note: "A cinematic swell; the bed is audible from frame 0 and rises into the reveal." },
    shots: { min: 3, match: "One subject in one light, from different angles: front, side, detail. Never one picture turned." },
    subjectsToAvoid: ["a phone with a generic glowing screen"],
  },
  graphite: {
    hook: { show: "both", by: 1, role: "headline", area: 0.3, how: "Real, dense UI at a readable size on frame 0, with the headline in its slot above it." },
    // Empty frame over time: fills the frame.
    space: { emptyShare: 0.15, emptyRun: 2 },
    compose: { kind: "top", fullPanes: true, how: "The line at the text-safe top; the window under it is a graphic, so it may run past the text-safe sides to cover the hook's share. At 9:16 the window (uiWindow with no box) fills 59 % of the frame: the picture-safe width, from one gap under a two-line line to the picture-safe foot. It is filled with rows to the text-safe foot (never an empty panel: 5 one-line rows, or 3 two-line rows with a detail), the list runs on under the fold as row rules with no text, and the rows' text keeps to the text-safe area, the low band's right edge included. A second screen of the app replaces the first in the same box." },
    moves: [
      { move: "The camera glides between panels with a slight 3D tilt that eases back to 0 at rest; the UI never empties for the move.", measurable: { check: "message-gap", how: "A sentence and the UI stay on screen through every glide." } },
      { move: "UI builds in 250-400 ms, and cuts land on the beat.", measurable: { check: "sound/cut-on-beat", how: "Cuts sit within 2 frames of a beat." } },
      { move: "The accent marks one element per scene.", measurable: { check: "signature", how: "The accent covers one connected region per key frame." } },
    ],
    blocks: [
      { block: "photo", props: { media: "a real screenshot, prepared as-is" }, for: "Real UI as the subject." },
      { block: "camera", props: { moves: "glides on the move curve", tiltX: "a slight tilt, 4-6 degrees, back to 0 at rest", tiltY: "the same" }, for: "The glide to the next panel." },
      { block: "title", props: { maxLines: "2", pinned: "true, so the headline rides through the glides" }, for: "The headline in a fixed slot, changed by a cut on the beat." },
      { block: "uiWindow", props: { title: "the view's name", rows: "the list it shows: the rows fill the window to its foot (never an empty panel); give no box, so the window takes the system's (windowBox: under the line, to the text-safe foot, across the picture-safe width) and a second screen keeps it", sidebar: "its width, when the app has one", replaces: "the window this screen follows: the frame stays, the old content leaves and the new enters, never both at once", enter: '"cut" for a hard change of screen' }, for: "The app window: 1 px borders, the system's own head (a title and a rule, a tab strip, or none), its rows. No title-bar dots. A second screen of the same window replaces the first." },
      { block: "listRow", props: { initials: "the person", badge: "a status (tone \"accent\" on the one row that matters)", selected: "the row the cursor picks: one row at a time (uiWindow rows throws on two; multi: true for a list that selects many)" }, for: "Dense rows that fit their names, given to uiWindow as `rows`; the selected one has the accent bar and says state \"selected\"." },
      { block: "cursor", props: { path: "the points it moves to; `to` a part's id to click it clear of its text", targets: "the scene's nodes", clicks: "the click times" }, for: "One continuous action that clicks; with button, tab and toast from the ui kit." },
    ],
    avoid: [
      { block: "barChart", why: "A product film shows the product working, not a chart." },
      { block: "kineticWords", why: "Graphite is calm." },
    ],
    wanted: [
      { name: "ui sidebar list", for: "A sidebar with sections and counts, and avatars with pictures; the ui kit has the window, rows with initials and a cursor." },
    ],
    ends: { kind: "event", hold: 1.5, onBar: true, impact: false, how: "The last action completes (a count ticks to its end state), and the window settles with the name and line above it.", block: "cursor", with: "the last click completes the action on the last bar; the window holds with the name above it", look: { name: "headline", line: "body", mark: 0.2, axis: "column", place: "upper" } },
    maxStill: 1.6,
    mix: { lufs: -16, range: 2, music: "clock", entry: "drop", note: "Calm electronic; cuts on its beats. A click only on a real cursor click." },
    shots: { min: 2, match: "One product: every screen from the same app, in the same theme and at the same scale." },
    subjectsToAvoid: ["a to-do app", "a kanban board with no story"],
  },
  console: {
    hook: { show: "line", by: 0.5, role: "headline", how: "A full terminal on frame 0 at the text-safe width, with a status bar and earlier history in muted text; the command types at the prompt in headline, so it reads on a phone (keep commands short enough for one row)." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    moves: [
      { move: "Characters type at a variable human rate; output prints line by line with real timing.", measurable: { check: "signature", how: "Text grows one character at a time while a command types." } },
      { move: "The result that matters prints in the accent; the rest steps back to muted ink.", measurable: { check: "signature", how: "The accent covers the result line when it prints." } },
      { move: "Faint scanlines at low opacity.", effect: "scanlines", measurable: false },
      { move: "A cut on Enter; the screen scrolls.", measurable: false },
    ],
    blocks: [
      { block: "terminal", props: { h: "leave it out: the panel holds its rows, never an empty box", session: "commands with real output and timing", prompt: "a fitting prompt", role: "a large role for a phone (headline)", result: "true on the one line that matters", status: "the host and a live clock", inset: "the text column inside a wide panel" }, for: "The whole film is a session." },
      { block: "typeOn", props: { pace: '"human"', cursor: "true" }, for: "Text typed outside the terminal block." },
      { block: "counter", props: { value: "the real figure" }, for: "A status-bar figure that counts in real time." },
      { block: "hit", props: {}, for: "A key tick under typed text; a click when a command runs." },
      { block: "pane", props: { title: "what the window shows", fill: '"none" over a picture' }, for: "Shared panels whose edges align (paneStack)." },
    ],
    avoid: [
      { block: "photo", why: "A smooth photo breaks the screen; draw a figure in characters instead." },
      { block: "kineticWords", why: "Console prints; it does not pop words." },
    ],
    wanted: [],
    ends: { kind: "event", hold: 1.5, onBar: true, impact: false, how: "A second command that turns the result into a scale; its reply prints on the last bar, and the cursor blinks.", block: "terminal", with: "the last reply prints on the last bar; the cursor blinks to the end", look: { name: "headline", line: "body", mark: 0.16, axis: "column", place: "upper" } },
    maxStill: 2,
    mix: { lufs: -16, range: 2, music: "bed", entry: "section", note: "A focused pulse. Drop the key ticks over strong music." },
    shots: { min: 1, match: "One session in one terminal." },
    subjectsToAvoid: ["hello world", "ls in a home folder", "a ping with no meaning"],
  },
  noir: {
    compose: { kind: "picture", how: "The lit plate fills the frame with the figure whole. Where the plate has a calm part clear of the figure, the line sits on it (lineOverPicture: never across the face or the body). Where the figure fills the text-safe area (lineOverPicture says dim), the line takes a band of the dark ground at the top and the plate fills the frame under it, its top eased into the ground (lineInBand, then photo with box: the picture box and fade: \"top\"). Keep the figure: a plate with no figure is the last choice." },
    hook: { show: "both", by: 1, role: "headline", area: 0.4, how: "A lit plate with hard slats on frame 0, the first line already set in a lit band." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    moves: [
      { move: "Hard lit slats: the plate is dark, and only hard-edged bands carry the normal grade; type sits in the lit bands.", effect: "shadow-bars", measurable: { check: "signature", how: "Hard edges at one diagonal angle cross the plate, and no letter sits in a dark band." } },
      { move: "One hard light direction for the whole film.", measurable: false },
      { move: "A shadow sweeps the frame dark, then the next scene is lit.", measurable: false,
        allows: { block: "wipe", checks: ["accident"], why: "Noir's shadow covers the frame dark for a moment before the next scene is lit: a few frames of flat dark are the move." } },
      { move: "A dark figure in front of lit words: the subject breaks the line and the line still reads.", measurable: { check: "contrast-over-picture", how: "Every letter keeps its contrast; no letter more than 30 % covered." } },
    ],
    blocks: [
      { block: "photo", props: { over: "true", motion: '"push"' }, for: "The subject cut out over the type." },
      { block: "title", props: { role: '"display"' }, for: "The title at full measure over two lines." },
      { block: "wipe", props: { style: '"sweep"', fill: '"ground"' }, for: "The shadow that sweeps the frame dark." },
      { block: "hit", props: {}, for: "A low hit when a slat snaps; a soft whoosh as a slat slides." },
      { block: "shadowBars", props: { angle: "the slats' fall; near-level (-6 to -15) when keepLit holds text of more than one line, so one lit band holds it", keepLit: "the title's nodes, so every letter stays lit", exit: '"fade" on the end card, with `until` on the last beat' }, for: "Hard slats of shadow across the frame." },
    ],
    avoid: [
      { block: "barChart", why: "A noir title has no chart." },
      { block: "kineticWords", why: "Noir pushes slowly." },
    ],
    wanted: [
    ],
    ends: { kind: "card", hold: 1.5, onBar: true, impact: true, how: "The title in the light, the street in the bottom third; the slat light fades on the last beat instead of a cut to empty black.", block: "title", with: "the title in the light on the last beat, held; `shadowBars` with `exit: \"fade\"` and `until` on the last beat fades the slats", look: { name: "display", line: "body", mark: 0.3, axis: "column", place: "middle" } },
    maxStill: 2.2,
    mix: { lufs: -17, range: 2, music: "clock", entry: "drop", note: "Smoky jazz. Cuts on the beat; the impact lands when the title is fully set, not before." },
    shots: { min: 3, match: "One hard light direction and one grade in every shot." },
    subjectsToAvoid: ["a detective in a trench coat with no story"],
  },
  title: {
    compose: { kind: "picture", how: "The dark plate fills the frame (photo with no box); a still too small or too wide to fill a tall frame goes in a letterbox band across the full width (photo `frame: \"letterbox\"`), never in an inset box with bars round it. The tagline is one small centred line (headline, never display), in the calm band above the subject (the upper third), never across the subject, with wide space round it. It cuts in and holds." },
    hook: { show: "both", by: 1, role: "headline", area: 0.6, how: "A dark plate with the title on frame 0: one small centred line in headline on the plate's calm part. The studio card comes after it, never before." },
    // Empty frame over time: may breathe.
    space: { emptyShare: 0.75, emptyRun: 6 },
    moves: [
      { move: "Type cuts in and holds; nothing on the type animates.", measurable: { check: "signature", how: "Text reaches full opacity in one frame." } },
      { move: "Black holds between cards are part of the rhythm.", measurable: false,
        allows: { block: "text", checks: ["accident"], why: "Title holds black between its cards: flat black frames between two cards are the rhythm, not an accident." } },
      { move: "Flash cuts at the climax, accelerating (19, 12, 8, 5, 4 frames of black).", measurable: { check: "sound/cut-on-beat", how: "Each flash sits on an onset; the black gaps shrink." } },
      { move: "One low impact on the title card, then near silence.", measurable: { check: "sound/hit-over-bed", how: "The impact stands 6 dB or more over the bed, and the bed stops on it." } },
    ],
    blocks: [
      { block: "text", props: { role: '"headline" for the opening card (the hook\'s role); "display" for the film\'s title on the reveal card; "body" for the release line; "caption" only for the credits of the studio card', align: '"center"', y: "on the plate's calm part (lineOverPicture)" }, for: "One centred title per card." },
      { block: "photo", props: { dim: "true", frame: '"letterbox" for a still that cannot fill the frame', enter: '"cut"', exit: '"cut"' }, for: "A dark plate behind the type, filling the frame; the flash stills at the climax, a few frames each on the onsets." },
      { block: "hold", props: {}, for: "The black holds that are the rhythm." },
      { block: "hit", props: {}, for: "The one impact." },
    ],
    avoid: [
      { block: "wipe", why: "Title changes cards by hard cuts, sometimes to black." },
      { block: "kineticWords", why: "Title cards hold." },
    ],
    wanted: [],
    ends: { kind: "card", hold: 2, onBar: false, impact: false, how: "The release line comes last in body size, held, over room tone or one low note.", block: "text", with: "the release line in body, centred, held over room tone", look: { name: "body", line: "caption", mark: 0.16, axis: "column", place: "middle" } },
    maxStill: 3,
    mix: { lufs: -20, range: 3, music: "bed", entry: "swell", stop: "hard", note: "A low drone and long silences. The bed stops hard on the impact (`music({ until: <the impact> })`); silence holds under the title, or a room tone does (`roomTone: { media, until: <the film's end> }`)." },
    shots: { min: 6, match: "One grade for the whole montage: one black point, one white point, one saturation. Each still is shown once." },
    subjectsToAvoid: ["a horror trailer with a jump scare"],
  },
  matte: {
    hook: { show: "picture", by: 1, area: 0.3, how: "The object on its floor on frame 0, lit, with a slow orbit running. An object with mass (a chair, a vessel, a body), not a thin one: its silhouette covers the share (product frames by it), so the middle and lower frame are the object and its reflection." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    compose: { kind: "top", how: "The line small, in a corner: the smallest role that keeps the phone floor (headline), left on the text-safe top (Matte's type is small and quiet); the product under it, framed with `room`: the frame under the line, a body line height below it, so the object, its shadow and its reflection own the middle and lower frame. Set the line first, left-aligned; the room under it keeps the object clear of it by construction: never on the handle or the rim. The anchor `<product id>-object-extent` holds the object's drawn bounds over the shot, to check the gap." },
    moves: [
      { move: "A light passes across the matte surface once per shot.", effect: "light-sweep", measurable: { check: "signature", how: "A bright band moves across the object over 30-60 frames." } },
      { move: "A tight contact shadow where the object meets the floor, and a soft, matte reflection of it in the floor (reflection).", effect: "contact-shadow", measurable: false },
      { move: "A rim line draws the silhouette on the dark ground.", effect: "rim-light", measurable: false },
      { move: "Macro shots frame a detail that explains the object, 40-60 % of the frame.", measurable: false },
    ],
    blocks: [
      { block: "product", props: { shot: '"orbit", "push" or "turntable"', sweep: "on a strong onset", fill: "leave it out: the default fills the hook's share of the frame", frame: '"detail" with detail: { point, span } for a macro of one part (the 3D camera moves in; the bleed is declared)', material: 'a real model keeps its own ("own", the default); roles ("system") only for a form drawn from simple geometry' }, for: "The object, its light, its shadow and its rim." },
      { block: "text", props: { role: '"headline" for the one line of each beat (it must read on a phone); "label" only for a spec or a credit beside the object' }, for: "The line of each beat, and small type in a corner." },
      { block: "music", props: {}, for: "A bed entered at a section with an audible pulse." },
      { block: "hit", props: {}, for: "A soft swell as the light crosses." },
      { block: "endCard", props: { name: "the name", axis: '"row"', at: "the last strong onset" }, for: "The name beside the object, held." },
    ],
    avoid: [
      { block: "photo", why: "Matte is a render; a photo breaks the material." },
      { block: "kineticWords", why: "Type is small, in a corner." },
    ],
    wanted: [
      { name: "endCard beside an object", for: "The name aligned to the object's top or centre line; endCard centres its lockup in a box the scene gives." },
    ],
    ends: { kind: "lockup", hold: 1.5, onBar: true, impact: false, how: "A clean front view on a strong accent, the name beside the object, held. In a wide or square frame the name sits beside the object (a row); at 9:16 a large object cannot sit beside a name, so endCard sets the name over it (a column). The end card shows the model at its own turn: give its mark `{ objects }` with `rotation: [0, 0, 0]` on the object (its front), or the turn that shows its front.", block: "endCard", with: "`name`, `axis: \"row\"` (a column at 9:16), `at` on the last strong onset", look: { name: "headline", line: "body", mark: 0.42, axis: "row", place: "middle" } },
    maxStill: 2,
    mix: { lufs: -18, range: 2, music: "bed", entry: "section", note: "Low drones; enter where the pulse is audible, so the first cut lands on a sound." },
    shots: { min: 3, match: "One object, one floor and one light rig; the camera changes, not the material." },
    subjectsToAvoid: ["a floating sphere with no product"],
  },
  kinetic: {
    compose: { kind: "fill", how: "The words are the subject: kineticWords fills the text-safe box; no other subject shares the frame." },
    hook: { show: "line", by: 0, role: "display", how: "The first word fills the frame edge to edge on frame 0, cropped by the frame, on the beat." },
    // Empty frame over time: fills the frame.
    space: { emptyShare: 0.15, emptyRun: 2 },
    moves: [
      { move: "Display type bleeds edge to edge, cropped by the frame on purpose.", measurable: { check: "signature", how: "Ink covers at least 60 % of the frame width on most beats." } },
      { move: "The accent word grows until it fills the frame and becomes the next ground.", measurable: { check: "signature", how: "The accent covers more than 90 % of a frame at a scene change." } },
      { move: "Every cut lands on a beat.", measurable: { check: "sound/cut-on-beat", how: "Cuts sit within 1 frame of a beat." } },
      { move: "Motion blur along the direction of travel on the fastest moves.", effect: "motion-blur", measurable: false },
    ],
    blocks: [
      { block: "kineticWords", props: { role: '"display"', phrases: "one per beat, accent on one word; the reveal phrase `reveal: true` (the hero size: the largest type of the film); `exit: \"toGround\"` on the accent phrase before a ground change" }, for: "Words that fill the frame and bleed; the accent word that grows until it fills the frame and becomes the next ground." },
      { block: "carry", props: { then: "the stack's next place on each beat" }, for: "A word that stays and moves while the next one enters." },
      { block: "ground", props: { color: '"accent"', enter: '"cut"' }, for: "A ground change on the beat, behind the words (a colour that stays is a ground; a wipe crosses the frame and leaves)." },
      { block: "counter", props: { role: '"display"' }, for: "A number that counts in on the beat at display size." },
      { block: "ground", props: { color: '"accent" for a ground change; "ground" for the end', enter: '"cut"' }, for: "A ground change on the beat; and the end: a hard cut to the ground on the bar after the last line." },
      { block: "camera", props: { whips: "a 5-frame whip on the transition, blurred along its travel" }, for: "The whip between scenes, with motion blur." },
      { block: "wordSeries", props: { words: "one per beat", role: '"display"' }, for: "Words that replace each other at one cap height, baseline and left edge." },
    ],
    avoid: [
      { block: "hold", why: "Kinetic never holds still." },
      { block: "lineChart", why: "Kinetic speaks in words, not charts." },
    ],
    wanted: [],
    ends: { kind: "cut", hold: 0, onBar: true, impact: false, how: "The last line lands on the track's loudest bar, then a hard cut to the ground on the bar. No static restatement. The drop on the reveal wins over this: when no loudest bar falls after the reveal in the film's window, the last line lands on the next strong bar after the reveal (a bar of `beats().bars`, or a cut point of `beats().cuts`), and the cut to the ground comes on the bar after it.", block: "ground", with: "`color: \"ground\"`, `enter: \"cut\"`, `at` on the bar after the last line: the hard cut to the ground, no hold", look: { name: "display", line: "body", mark: 0.2, axis: "column", place: "upper" } },
    maxStill: 1.05,
    maxStillBeats: 2,
    mix: { lufs: -14, range: 2, music: "clock", entry: "drop", note: "Driving, four on the floor. No effects: the cuts land on the kick, and the music carries them." },
    shots: { min: 3, match: "Flash pictures share one grade, through the inks." },
    subjectsToAvoid: ["the speed of light", "a motivational quote"],
  },
  courtside: {
    compose: { kind: "behind", how: "The photo fills the frame with `over: true`; the words go behind the cut-out subject through placeBehind (cover.ts), so no word loses a letter. When the athlete fills the text-safe area and no place keeps every letter, the words take a band of the ground at the top and the athlete fills the frame under it; the picture starts under the words (lineInBand with overlap), so the head may rise in front of the words' foot only where placeBehind keeps every letter whole (a letter's foot carries its name). At 16:9 the band is a column beside the athlete. Keep the figure: never set the words across the body." },
    hook: { show: "both", by: 0.5, role: "display", area: 0.4, how: "The subject and the first condensed word on frame 0, with the bed audible under it (a kick, when the track has one there)." },
    // Empty frame over time: fills the frame.
    space: { emptyShare: 0.15, emptyRun: 2 },
    moves: [
      { move: "A huge condensed headline over the subject; the subject breaks a word that still reads.", measurable: { check: "contrast-over-picture", how: "No letter more than 30 % covered; the word covers at least 60 % of the width." } },
      { move: "A whip pan with motion blur in the direction of travel.", effect: "motion-blur", measurable: false },
      { move: "The volt marks the one word or number that wins.", measurable: { check: "signature", how: "The accent covers one word per key frame." } },
      { move: "The drop lands on the biggest change.", measurable: { check: "sound/cut-on-beat", how: "The largest picture change sits within 2 frames of the drop." } },
    ],
    blocks: [
      { block: "photo", props: { over: "true, with the words placed by placeBehind (cover.ts) so no word loses a letter behind the subject; when placeBehind finds no place (ok false), set the words in front: over false", fade: '"top" when framed low' }, for: "The subject behind and over the type." },
      { block: "kineticWords", props: { role: '"display"' }, for: "The condensed words, one cap height, cut on the kick." },
      { block: "ground", props: { color: '"accent"', enter: '"cut"' }, for: "The volt ground on the drop, behind the words (a colour that stays is a ground; a wipe crosses the frame and leaves)." },
      { block: "camera", props: { moves: "6-frame pushes of 6-8 % on each word cut; pin the words (kineticWords `pinned: true`) so the push moves the picture, never the edge-to-edge type", whips: "the whip to the end card, blurred along its travel" }, for: "Real motion on the subject." },
      { block: "hit", props: {}, for: "A whoosh on the whip, one impact on the cut to the end card." },
      { block: "endCard", props: { name: "the offer", line: "when and where", at: "the drop's last bar" }, for: "The offer in display at full width, its when and where under it." },
    ],
    avoid: [
      { block: "lowerThird", why: "The offer is the loudest frame, not a small label." },
      { block: "lineChart", why: "A poster states, it does not plot." },
    ],
    wanted: [
    ],
    ends: { kind: "offer", hold: 1.5, onBar: true, impact: true, how: "The offer at full width in the volt, its when and where under it, with the one impact on the cut.", block: "endCard", with: "the offer as `name` at full width in the volt, `line` the when and where, the one impact from `hit` on the cut", look: { name: "display", line: "body", mark: 0.24, axis: "column", place: "upper" } },
    maxStill: 1.05,
    maxStillBeats: 2,
    mix: { lufs: -14, range: 2, music: "clock", entry: "drop", note: "Dark trap. Enter so the drop lands on the biggest change." },
    shots: { min: 3, match: "One athlete, one light; wide, mid and tight on the beats." },
    subjectsToAvoid: ["a generic sports slogan"],
  },
  schematic: {
    compose: { kind: "top", figure: { foot: 0.86 }, how: "The question in a status line at the text-safe top. The figure box under it spans the picture-safe width down to 86 % of the frame's height (`figureBox`); fitDrawing with no area stands the drawing on that foot, across the text column, so the drawing fills the lower band with picture (only picture may go there; the last 14 % stays clear). Its labels and dimensions take the text-safe area: make one `figure` of the drawing's parts (with `pulley` and `rope` for wheels and ropes) and give it to each `dimension` and `callout`, and they place themselves clear of every stroke, of the status line and of each other (a force's name at its arrow's tail, dimensions just clear of what they span, a chain on one line). A dimension of a part in the lower band keeps its lines there and puts its value on a short leader in the text-safe area. Name a part by a point near the text-safe area (the top of a load in the lower band, not its foot). Lay a plate under it with the sheet's `plate`: the plate is the figure box, and the figure with its labels fills it from its foot up. Stand the parts with `boxAt` and `pointOf` (a fulcrum's apex under a beam), and rest one part on another with shape `on`, never with hand-computed moves. An equation or a note goes in the status line, or in a box from the figure's `place`. The hook counts the plate with its drawing as one picture; the empty-frame check counts only the drawing's lines, labels and dimensions as content, never the grid or the empty part of a plate." },
    hook: { show: "both", by: 1, role: "headline", area: 0.3, how: "The full diagram in hairlines on frame 0, with the question in a status line above it." },
    // Empty frame over time: the default.
    space: { emptyShare: 0.35, emptyRun: 2 },
    moves: [
      { move: "Lines draw, labels follow, and the active path lights in blue.", measurable: { check: "signature", how: "The accent covers one connected region per key frame: the active path." } },
      { move: "The camera pans along the diagram; a status line stays on screen through every pan.", measurable: { check: "message-gap", how: "A sentence stays on screen through every pan." } },
      { move: "The answer is drawn: dimension lines and callout numbers, not only typed.", measurable: false },
      { move: "A hairline grid under the diagram.", measurable: { check: "signature", how: "Hairlines at a fixed pitch in every key frame." } },
    ],
    blocks: [
      { block: "shape", props: { kind: '"rect" for a beam or a load, "triangle" for a fulcrum (its points from pointOf: "apex", "base")', on: "the part it rests on and the point: { part: fulcrum, at: \"apex\" }; it rides and turns with that part", pivot: "the point it turns about (default: the point it rests on)" }, for: "The parts of a mechanism that rest on each other and turn, with no hand-computed move." },
      { block: "dimension", props: { text: "the measure", figure: "the drawing's figure: the dimension takes the nearest clear tier, and its value goes on its line or on a short leader in the text-safe area", side: '"above" (default), "left" or "right" for a height; the error names a side that works', follow: "the part's keys when it moves" }, for: "Dimension lines in tiers outside the drawing, measured square to the side they stand on." },
      { block: "callout", props: { label: "the part's name or its force, short (a label beside a 9:16 drawing has about 4 words of room)", number: "the callout number, where the label is short enough", target: "a point on the part, near the text-safe area", figure: "the drawing's figure: the label goes next to its target, clear of every stroke, label and leader" }, for: "Callouts whose short leaders end on the part." },
      { block: "rope", props: { run: "the stops: the fixed end, each wheel (a `pulley`: r from fitDrawing, `moves` for a wheel that rises, `turns` from rollDegrees) with its turn, the free end (with `follow` when it moves)", light: "the active path, in the accent" }, for: "An open rope over pulleys (wheels with no teeth that turn by key marks) whose strands change length as a wheel moves." },
      { block: "text", props: { pinned: "true", role: '"headline" for the question (the hook\'s role); "label" for the status line\'s small print' }, for: "The question and the status line, pinned, so they ride through the `camera` pans along the diagram (camera `moves`)." },
      { block: "sheet", props: { grid: '"lines"', plate: "true: the plate under the drawing, the figure box", titleBlock: "with fitDrawing's scale" }, for: "The complete hairline grid, the plate and the title block; fitDrawing stands the drawing in figureBox." },
      { block: "gear", props: { teeth: "the real count", turns: "from ratioTurns", r: "from fitDrawing, or heroBox: the drawing covers the hook's share of the frame", color: '"accent" on the driving gear (the active part), the rest in ink' }, for: "Sprockets on one tooth pitch, turning at the true ratio; `belt` draws the chain on their outer tangents, the active path in blue." },
    ],
    avoid: [
      { block: "photo", why: "Pictures are rare; the drawing explains." },
      { block: "kineticWords", why: "Schematic is productive, not loud." },
    ],
    wanted: [
    ],
    ends: { kind: "event", hold: 1.5, onBar: true, impact: false, how: "A full elevation at a scale where everything fits, with the answer's dimension drawn last (its lines in the lower band where the part stands there, its value in the text-safe area) on one of the loudest bars (`beats().loudest`).", block: "dimension", with: "the answer's dimension drawn last on one of the loudest bars, its tick from `hit({ on })`, then `hold` to the end (the closing hold is exempt from the stillness rule)", look: { name: "headline", line: "body", mark: 0.2, axis: "column", place: "upper" } },
    maxStill: 2,
    mix: { lufs: -16, range: 2, music: "bed", entry: "section", note: "Steady techno. Enter on a section whose bars are among the track's loudest (`beats().loudest` for the film's window is not empty), so the answer can land on one. A dry tick as each dimension locks, 6 dB over the bed." },
    shots: { min: 1, match: "One drawing at one scale, or the scale break labelled." },
    subjectsToAvoid: ["a generic network diagram"],
  },
  nocturne: {
    compose: { kind: "fill", how: "The statement is the image: the quote in the large serif fills the text-safe width (quote fits each statement to it), the speaker under a thin rule. On the dark ground, or on one picture: `quote({ picture })` sets the picture under the statement as the field that fills the frame, dimmed behind type, the statement on it at the same width. Never a picture stacked under the statement or across its edge, and no plate behind the words (no decoration)." },
    hook: { show: "line", by: 1, role: "display", how: "The film's statement on frame 0, fitted to the safe width, its first word on a strong onset." },
    // Empty frame over time: may breathe.
    space: { emptyShare: 0.75, emptyRun: 6 },
    moves: [
      { move: "The key word in the italic of the serif, at full ink: never a colour darker than the ink.", measurable: false },
      { move: "A statement fitted to the width: display size set so the line spans the safe width.", measurable: { check: "signature", how: "The statement's ink spans at least 85 % of the safe width." } },
      { move: "Words fade in one after another, 80 ms apart.", measurable: false },
      { move: "A slow fade through the ground between statements.", measurable: false,
        allows: { block: "quote", checks: ["accident"], why: "Nocturne fades through the ground between statements: a few frames of plain ground between two statements are the move." } },
    ],
    blocks: [
      { block: "quote", props: { enter: '"word"', role: '"display"', statements: "one per scene", picture: "the picture under the statements (each statement may change it)", emphasis: "the key word, set in the italic of the serif" }, for: "The statements, word by word, fitted to the width; on a picture that fills the frame." },
      { block: "rule", props: {}, for: "The thin rule above the caption." },
      { block: "photo", props: { dim: "true", motion: '"push"', enter: '"dissolve"' }, for: "A picture on its own, between statements. Under a statement, use quote's `picture`." },
      { block: "music", props: {}, for: "The bed, with the first word of each statement on a strong onset." },
      { block: "fitText", props: { role: '"display"', enter: '"fade"' }, for: "Display type sized to fill the safe width." },
    ],
    avoid: [
      { block: "kineticWords", why: "Nocturne arrives word by word, slowly." },
      { block: "barChart", why: "The statement is the image." },
    ],
    wanted: [
    ],
    ends: { kind: "card", hold: 2, onBar: false, impact: false, how: "The last statement as a quote card, with the rule, name and role arriving with it and staying to the end.", block: "quote", with: "the last statement as the card, with the rule, name and role, held to the end", look: { name: "display", line: "body", mark: 0.12, axis: "column", place: "middle" } },
    maxStill: 3,
    mix: { lufs: -20, range: 2, music: "bed", entry: "section", note: "Ambient piano. No effects: the words arrive in silence over the bed." },
    shots: { min: 2, match: "One place: outside and inside share one axis and one light." },
    subjectsToAvoid: ["a quote from a famous person"],
  },
};

// The project's own systems (own.ts) join the table after the built-ins.
for (const o of OWN_SYSTEMS) if (!DIRECTION[o.system.id]) DIRECTION[o.system.id] = o.direction;

/** The direction of one system. Throws for an unknown id. */
export function directionOf(id: string): Direction {
  const d = DIRECTION[id];
  if (!d) throw new Error(`no direction for system "${id}"`);
  return d;
}

/** How to enter a track for each `Mix.entry`, in words with the `music` prop. Docs and playbooks read this. */
export const ENTRY_HOW: Record<Mix["entry"], string> = {
  drop: "put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`",
  swell: "put the track's loudest bar on the reveal, so the bed rises into it: `music({ peakAt: <reveal time>, peak: \"loudest\" })`",
  section: "open on the start of a section with energy, not a quiet intro: `music({ align: { track: <section start>, film: 0 } })` (sections from `listen.md` or `beats().sections`); the reveal need not sit on a drop",
  start: "enter at the track's own start, which opens on its body: `music({ clipStart: 0 })`",
  none: "no music",
};

/** The most effects (hits and ticks) a system allows in 10 s: its Media section (src/system/media-spec.ts), the one source. */
export function effectsPerTen(id: string): number {
  return MEDIA_SPEC[id]?.hits.perTen ?? 6;
}

/** The whole-mix loudness target of a system, for the music block, the loudness check and every doc. The default
 *  for an id with no direction is DEFAULT_MIX. */
export const DEFAULT_MIX = { lufs: -16, range: 2, truePeak: -1 };
export function mixTarget(id: string): { lufs: number; range: number; truePeak: number } {
  const d = DIRECTION[id];
  return { lufs: d?.mix.lufs ?? DEFAULT_MIX.lufs, range: d?.mix.range ?? DEFAULT_MIX.range, truePeak: DEFAULT_MIX.truePeak };
}

/** The longest still stretch for a film in this direction on a track at `bpm`: maxStill, or maxStillBeats of the track when that is longer. */
export function maxStillFor(d: Pick<Direction, "maxStill" | "maxStillBeats">, bpm?: number): number {
  // Four frames of slack on the beats: a word held that many beats and cut on the beat measures a few frames longer
  // on the frame grid (the stall check, film.py max_still_for, keeps the same slack).
  return d.maxStillBeats && bpm ? Math.max(d.maxStill, (d.maxStillBeats * 60) / bpm + 4 / 30) : d.maxStill;
}
