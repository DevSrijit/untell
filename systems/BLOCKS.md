# Building blocks

Generated from the block code by `scripts/export_catalog.ts`. Do not edit.

A film is a **scene**: a function that takes the scene context and the blocks, and returns nodes.
Every block takes its place in px, a start time `at` in seconds, and an optional `until` when it leaves.
The design system decides every colour, font, size, curve and duration. Blocks never overlap their own text,
keep text inside the platform-safe area, and never let data overshoot. Each block below has a demo: a scene in
`examples/scenes` that shows it as a designer would use it, at 9:16 and 16:9, in the two systems that suit it best
(films `cat-<block>-<system>` and `cat-<block>-<system>-wide` in `src/films/blocks/catalog.tsx`).

```ts
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
```

- `ctx.safe` is the text-safe area. At 9:16 it ends at 65 % of the frame's height, and text below `ctx.safe.lowBandTop`
  must end by `ctx.safe.lowBandRight`. Graphics (shapes, chart marks, panels, pictures) may and should use the band
  under it: do not leave the lower part of a 9:16 frame empty by habit.
- Composition helpers (from `src/system/scene/blocks`): `lineAndSubject` (one line over one subject, on the optical
  centre), `lineAndBlock` (a line, then a block with text under it, and the room its graphics may take), `lineInBand`
  (the line in a band of its own beside a picture), `lineOverPicture` (the line on a picture's calm part), `heroBox`.
- Drawing helpers (from `src/system/scene/blocks`), for a mechanism drawn with `shape`: `fitDrawing` (scales a drawing
  to the system's `figureBox`, where a figure stands), `boxAt` (the box that puts a named point of a shape, such as a
  triangle's `"apex"`, on a given place), `pointOf` and `pointAt` (a point of a part at rest, and after its moves and
  turns), `followPoint` (the keys that keep a callout, a dimension or an arrow on a point of a moving part), and
  `figure` (the annotation plan of a drawing: give it to `dimension` and `callout` as `figure`, and they place
  themselves clear of the parts and of each other, in the text-safe area). A shape rests on another with `on`; it
  turns about `pivot` (default: the point it rests on).
- `ctx.measure(text, role)` and `ctx.lineHeight(role)` measure text; `B.measure("<block>", props, ctx)` returns the box a
  block draws, so a scene can stack a thing under it. `ctx.dur` holds the system's durations.
- `landOn(ctx, t, (at, c) => B.<block>({ ..., at }, c))` (from `src/system/scene/blocks`) builds a block so that its
  entrance arrives on time `t`, a beat: a hit `on` the block then plays on the beat. `at: t - ctx.dur.enter` arrives off the
  beat: a slide runs 1.4 x the enter duration and arrives 3 to 6 frames late; a grow or a fade arrives up to 2 frames early.
- **Anchors.** Some blocks name their parts so a scene can point at them: `anchor(nodes, id)` from context.ts returns a
  part's box, when it appears (`at`) and extra numbers (`data`). flow: `<id>-node:<node id>`, `<id>-hop:<n>`; codeBlock:
  `<id>-line:<n>`; waveform: `<id>-lane:<n>`; lockup: `<id>-mark-box`, `<id>-name-box`; photo: `<id>-subject-box`.
- **Layers** set the draw order: -1 backdrop, 0 content (default), 1 overlay. Inside a layer, lines and circles draw
  first, then boxes, then text.
- **Times.** A change at time t shows on the first frame after t, in every block. A block given `until` is gone (or
  starts to leave) on the frame that a block given that time as `at` shows, and its exit always completes. A time a
  block cannot honour throws with what to give. Any block with `at` before 0 by its entrance is at rest on frame 0.
- **Fit.** A block that sets its text in a smaller role than asked warns and names both roles. `fit: "throw"` stops;
  `fit: "wrap"` keeps the role on more lines where the block can.
- **Holds.** When a frame holds still for more than 3 s on purpose, add `B.hold({ at, until })`.
- **Overprint, grain, maths.** A node may set `blend: "multiply"` (Riso). The renderers draw a system's grain. In a
  system whose roles are set in capitals, give text blocks `keepCase: true` for "π r²".

## Which block for what

| Task | Block | Systems whose block map names it |
| --- | --- | --- |
| Say the one line of a beat | [`title`](#title) | Studio, Primary, Keynote, Graphite, Noir |
| Set a kicker, a fact or a credit | [`text`](#text) | Manual, Ma, Riso, Mark, Raw, Title, Matte, Schematic |
| Make one number or word the subject | [`fitText`](#fittext) | Cutout, Nocturne |
| Cut single words on the beat | [`wordSeries`](#wordseries) | Kinetic |
| Shout phrases on the beat | [`kineticWords`](#kineticwords) | Cutout, Kinetic, Courtside |
| Type a command or a label | [`typeOn`](#typeon) | Spec, Raw, Console |
| Show what a person said | [`quote`](#quote) | Nocturne |
| Subtitle speech | [`captions`](#captions) | any (no map names it yet) |
| Name a speaker on footage | [`lowerThird`](#lowerthird) | any (no map names it yet) |
| Show a name with its mark | [`lockup`](#lockup) | Cutout, Mark, Pop |
| End the film on the name | [`endCard`](#endcard) | Studio, Keynote, Matte, Courtside |
| Show a picture or a clip | [`photo`](#photo) | Studio, Spec, Ma, Riso, Cutout, Pop, Keynote, Graphite, Noir, Title, Courtside, Nocturne |
| Build with flat shapes | [`shape`](#shape) | Primary, Riso, Cutout, Mark, Pop, Schematic |
| Change the ground on a beat | [`ground`](#ground) | Kinetic, Courtside |
| Compare values across categories | [`barChart`](#barchart) | any (no map names it yet) |
| Show a trend over time | [`lineChart`](#linechart) | any (no map names it yet) |
| Show a total that grows | [`areaChart`](#areachart) | any (no map names it yet) |
| Show what changed between two states | [`slopeChart`](#slopechart) | any (no map names it yet) |
| Show a range or a gap per row | [`dumbbell`](#dumbbell) | any (no map names it yet) |
| Split a whole into parts | [`stackedBar`](#stackedbar) | any (no map names it yet) |
| Show a share as a count | [`waffle`](#waffle) | any (no map names it yet) |
| Make one figure the subject | [`bigStat`](#bigstat) | Studio, Spec |
| Count up to a number | [`counter`](#counter) | Console, Kinetic |
| Show progress to a target | [`meter`](#meter) | Pop |
| Rank items | [`ranking`](#ranking) | any (no map names it yet) |
| Place values on a scale | [`numberLine`](#numberline) | any (no map names it yet) |
| Put events in order | [`timeline`](#timeline) | any (no map names it yet) |
| Show how a system works | [`flow`](#flow) | any (no map names it yet) |
| Show messages in order | [`sequence`](#sequence) | any (no map names it yet) |
| Show a hierarchy | [`tree`](#tree) | any (no map names it yet) |
| Show a loop | [`cycle`](#cycle) | any (no map names it yet) |
| Explain steps one at a time | [`steps`](#steps) | any (no map names it yet) |
| Compare two things point by point | [`split`](#split) | any (no map names it yet) |
| Lay out a small table | [`matrix`](#matrix) | any (no map names it yet) |
| Draw a part with its measures | [`sheet`](#sheet) | Spec, Schematic |
| Measure an edge | [`dimension`](#dimension) | Spec, Schematic |
| Name the parts of a drawing | [`callout`](#callout) | Spec, Schematic |
| Point from one thing to another | [`arrow`](#arrow) | any (no map names it yet) |
| Name one part of a thing | [`annotate`](#annotate) | any (no map names it yet) |
| Mark one word | [`highlight`](#highlight) | Primary |
| Show code | [`codeBlock`](#codeblock) | Manual |
| Run a command | [`terminal`](#terminal) | Manual, Console |
| Show a product interface | [`ui`](#ui) | Raw, Pop, Graphite |
| Show a 3D object | [`product`](#product) | Studio, Keynote, Matte |
| Score the film | [`sound`](#sound) | Studio, Ma, Primary, Riso, Cutout, Mark, Raw, Pop, Keynote, Console, Noir, Title, Matte, Courtside, Nocturne |
| Move the view | [`camera`](#camera) | Manual, Raw, Graphite, Kinetic, Courtside |
| Move one thing to its next place | [`carry`](#carry) | Primary, Kinetic |
| Pass to the next beat | [`wipe`](#wipe) | Riso, Cutout, Pop, Noir |

## One name, one meaning

The same prop has the same name and the same meaning in every block. An older name still works and warns once
(blocks/guard.ts, `OLD_NAMES`); `contract.test.ts` checks that it draws the same nodes as the new one.

| Prop | Meaning |
| --- | --- |
| `at` | When the block starts to enter, in seconds. A block given `at` changes on the first frame after it. |
| `until` | When the block starts to leave, in seconds. Its exit always completes: an `until` inside the entrance starts the exit from where the entrance got to. |
| `enter` | How the block comes on: a value of the system's vocabulary ("rise", "fade", "cut", "line", "word", "grow", "slide", "draw", "dissolve", "type", "rest"). Default: the system's vocabulary. |
| `exit` | How the block leaves at `until` (title, photo, ground). Default: the way it came, or the system's vocabulary. |
| `from`, `to` | Where a thing starts and ends: a point, a box, an edge, a value or a year. Never a time. |
| `clipStart` | Where in a clip or a track playing starts, in seconds (photo footage, music). |
| `role` | A type role of the system (display, headline, body, caption, label). Never a person's job: that is `job`. |
| `job` | What a person does, or where (lowerThird, quote). |
| `box` | The area a full-frame block fills when it is not the whole frame (photo, product, endCard). A block that always needs an area takes `x`, `y`, `w`, `h`. |
| `fit` | What a text block does when its text does not fit its role: "shrink", "wrap" or "throw" (blocks/fit.ts). |
| `pinned` | The block stays in screen space while the camera pans or zooms. Every text block takes it. |
| `layer` | The draw layer: -1 backdrop, 0 content (default), 1 overlay. |

Old names that still work:

| Block | Old name | New name |
| --- | --- | --- |
| text | `reveal` | `enter` |
| title | `reveal` | `enter` |
| fitText | `reveal` | `enter` |
| lockup | `reveal` | `enter` |
| endCard | `reveal` | `enter` |
| quote | `reveal` | `enter` |
| quote | `size` | `role` |
| lowerThird | `role` | `job` |
| photo | `from` | `clipStart` |
| music | `from` | `clipStart` |

## Index

- **Text and title:** [title](#title), [text](#text), [fitText](#fittext), [wordSeries](#wordseries), [kineticWords](#kineticwords), [typeOn](#typeon), [quote](#quote), [captions](#captions), [lowerThird](#lowerthird), [lockup](#lockup), [endCard](#endcard)
- **Pictures:** [photo](#photo), [shape](#shape), [drawnMark](#drawnmark), [shadowBars](#shadowbars)
- **Layout and grounds:** [ground](#ground), [frameGrid](#framegrid), [rows](#rows), [rule](#rule), [curve](#curve), [cross](#cross), [box](#box), [steps](#steps), [split](#split), [matrix](#matrix)
- **Data:** [lineChart](#linechart), [barChart](#barchart), [bar](#bar), [slopeChart](#slopechart), [dumbbell](#dumbbell), [areaChart](#areachart), [stackedBar](#stackedbar), [waffle](#waffle), [counter](#counter), [bigStat](#bigstat), [meter](#meter), [ranking](#ranking), [numberLine](#numberline), [timeline](#timeline), [waveform](#waveform)
- **Diagrams:** [flow](#flow), [sequence](#sequence), [tree](#tree), [cycle](#cycle), [sheet](#sheet), [gear](#gear), [belt](#belt), [pulley](#pulley), [rope](#rope), [callout](#callout), [dimension](#dimension), [formula](#formula), [arrow](#arrow), [annotate](#annotate), [highlight](#highlight)
- **Code and UI:** [codeBlock](#codeblock), [terminal](#terminal), [pane](#pane), [ui](#ui)
- **3D:** [product](#product)
- **Sound:** [sound](#sound)
- **Camera and time:** [camera](#camera), [carry](#carry), [wipe](#wipe), [hold](#hold), [reveal](#reveal)

## Text and title

### title

**The headline of a beat: it takes the largest type that fits its box and breaks into even lines.**

- Suits: Studio, Primary, Keynote, Graphite, Noir.
- Works against: none named.
- Demo: [`examples/scenes/title.ts`](../examples/scenes/title.ts), 8 s, in Studio and Graphite: Folding paper.

Title: a headline that fits its box. The lines rise out of their own masks, one after another.

Rules this block enforces:
- The title is never wider than its box, and never passes the text-safe area (the low band too).
- It breaks at word boundaries only, into the fewest lines that fit. Among the breaks with that
  number of lines, it takes the most even one (the smallest sum of squared slack), like a
  balanced headline.
- Phrasing: a line should not end on a short word (a, the, and, it) or split a number from the
  word after it (42 / times), and a line above the last should not hold one word alone. Each costs a little, so it
  changes a break only between near-equals.
- Orphan rule: the last line must not hold one word alone while the line above it holds two or
  more words ("goes each / time."). A break that has such an orphan is used only when no other break
  with the same number of lines fits. When none fits, the title takes one more line if the measure
  allows it (within `maxLines` and the box), that break has no orphan, and it adds no one-word line.
- When the title needs more than `maxLines` lines, or more height than the box has, it follows `fit`
  (blocks/fit.ts): "shrink" steps down to the next smaller type role (display, headline, body, caption), breaks
  again and warns with both roles; "wrap" keeps the role on more lines; "throw" stops. Never in silence.
- Explicit lines (an array) keep the author's breaks while they fit. A line that does not fit is
  broken again with the rules above.
- Lines leave at `until` the same way they came: they sink into their masks together, as one unit, then hide.
- With `at` at 0 or before, the lines (line reveal) are shown at rest from frame 0, so a film can open on them.
- `reveal: "word"`: the words fade in and rise a little, one after another, a stagger apart, in the
  same layout and with the same safety checks as the lines. At `until` all words fade out together.
- `reveal: "fade"`: the whole title fades in as one unit, with no rise and no mask (Ma, Nocturne).
  `reveal: "cut"`: the whole title shows in one frame. Both leave as one unit at `until`.
- The default reveal comes from the system's vocabulary (scene/vocabulary.ts): "fade" in Ma and
  Nocturne, "line" elsewhere. A one-frame system (ctx.instant) always cuts.
- `keepCase` keeps the case as written in a role that the system sets in capitals, and measures it so.

- `angle`: the title turns as one rigid unit about the top left corner of its box (x, y), by `angle` degrees
  (-45 rises to the right, Primary's axis). `w` is the room along the axis. The safety check turns with it: each
  line's glyph box is turned, and its bounding box must pass the text-safe area. A turned title shows and leaves
  as one unit ("cut" or "fade"); a line or word reveal falls back to the system's text cut or fade.
This file also exports `wordNodes`, the word-by-word reveal that the quote block shares.
- `pinned`: the text stays in screen space through camera moves (a caption bar that rides a pan).

```ts
export type TitleProps = {
  id?: string;
  /** The box, px. The title stays inside it. Default height: down to the bottom of the text-safe area. */
  x: number; y: number; w: number; h?: number;
  /** One string, or explicit lines. */
  text: string | string[];
  /** The type role to try first. Default: display. */
  role?: TypeRole;
  color?: ColorRole;
  align?: "left" | "center" | "right";
  /** The most lines before the title steps down a type size. Default: 3. */
  maxLines?: number;
  /** "line": each line rises out of its mask. "word": the words fade in one after another. "fade": the whole
   *  title fades in as one unit. "cut": it shows in one frame. Default: the system's vocabulary. */
  enter?: TitleReveal;
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: TitleReveal;
  /** Keep the case as written, also in a role the system sets in capitals (maths, units: "π r²"). */
  keepCase?: boolean;
  /**
   * When the title does not fit in `role` within `maxLines`: "shrink" steps down a role and warns; "wrap" keeps the
   * role and uses more lines while the box height allows, then throws; "throw" throws. Default: the system's (blocks/fit.ts).
   */
  fit?: FitPolicy;
  /** How the title leaves at `until`, always as one unit. "same" (default): the way it came. "fade": an opacity
   *  fade, with no move (a title at the top of the safe area then never passes its edge). "cut": one frame. */
  exit?: "same" | "fade" | "cut";
  /** Screen space: the text stays where it is on screen while the camera pans or zooms (a caption that rides
   *  through a move, so no sentence has to leave for it). */
  pinned?: boolean;
  /** Turn the title by this many degrees about the top left corner of its box (-45: it rises to the right). Default 0. */
  angle?: number;
  at: number;
  until?: number;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};
```

### text

**One placed line, or a few lines, in one type role: a kicker, a fact, a working, a credit.**

- Suits: Manual, Ma, Riso, Mark, Raw, Title, Matte, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/text.ts`](../examples/scenes/text.ts), 7 s, in Riso and Schematic: How long sunlight takes to reach Earth.

Text: one placed line, or a few lines, in one type role. The lines fade in and rise together
(`reveal: "fade"`: they only fade; `reveal: "cut"`: they show in one frame, at full opacity).

Rules this block enforces:
- Every line is measured before it is placed.
- The text box never passes the text-safe area, measured with the line's rendered glyph box. Below the low band top, the box ends at the low
  band edge. A system with `bleed` lets display text pass the safe area.
- A line that is wider than its box wraps at word boundaries. Lines never wrap inside a word.
- No orphan: a lone last word under a line of three or more words takes a word from that line. Under a line of
  two words, the lines wrap to a narrower measure that keeps their number and leaves no lone word, when one exists.
- Align (left, center, right) works within the box width, so the text lines up with the box edges.
- At `until`, the lines leave together, as one unit (a fade, or one frame for "cut"). After that they stay hidden.
- The default reveal comes from the system's vocabulary (scene/vocabulary.ts): "fade" in Ma and Nocturne,
  "cut" in the opaque print systems (Cutout, Riso, Primary), "rise" elsewhere.
- With `at` at 0 or before, the lines are shown at rest from frame 0, so a film can open on them.
- `keepCase` keeps the case as written in a role that the system sets in capitals, and measures it so.
The helpers `room`, `wrap` and `caseCtx` are shared with the title, typeOn and kineticWords blocks.
- `pinned`: the text stays in screen space through camera moves (a caption bar that rides a pan).

```ts
export type TextProps = {
  id?: string;
  /** The top left corner of the text box, px. */
  x: number; y: number;
  /** The width of the box. Lines align within it, and a longer line wraps. Default: all the room to the safe edge. */
  w?: number;
  /** One string, or explicit lines. */
  text: string | string[];
  role: TypeRole;
  color?: ColorRole;
  align?: "left" | "center" | "right";
  /** Lines enter one after another, a stagger apart. Default: all lines enter together. */
  stagger?: boolean;
  /** "rise": fade and a 12 px rise. "fade": opacity only. "cut": one frame, full opacity. Default: the system's vocabulary. */
  enter?: TextReveal;
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: TextReveal;
  /** Old form of `enter`: false is "fade". `enter` wins when both are given. */
  rise?: boolean;
  /** Keep the case as written, also in a role the system sets in capitals (maths, units: "π r²"). */
  keepCase?: boolean;
  /** Screen space: the text stays where it is on screen while the camera pans or zooms (a caption that rides
   *  through a move, so no sentence has to leave for it). */
  pinned?: boolean;
  at: number;
  until?: number;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};
```

### fitText

**One short line scaled to fill a band or a slab: a number or a word as the subject.**

- Suits: Cutout, Nocturne.
- Works against: none named.
- Demo: [`examples/scenes/fitText.ts`](../examples/scenes/fitText.ts), 6 s, in Cutout and Nocturne: The largest type that fits a band.

FitText: the largest type that fits a band or a slab. The lines are set in one role, then scaled together
by one factor until the widest line fills the box width or the lines fill its height, whichever comes first.
Use it where the system asks type to fill the frame: Kinetic and Courtside headlines, Nocturne's statement
fitted to the width, a word that becomes the ground.

Rules this block enforces:
- One factor for all lines, so they keep one cap height and one left edge (or one centre).
- The scaled box never passes the box, and never passes the text-safe area, except in a system whose
  `bleed` lists the role (Kinetic, Courtside: display). There the box may run to the frame edge on purpose.
  When the box passes the safe area in another system, the factor shrinks until it does not.
- `max` caps the factor (default 4), so a short word does not grow past the frame's scale.
- `valign` places the lines in the box's height ("top", "middle", "bottom") when they fill its width first, as
  `align` places them in its width ("left", "center", "right").
- `angle` tilts the band: the box turns by that many degrees about its top left corner (x, y), as title's angle
  does. The lines fit the band along its axis; each line turns about its own top left corner, and the text-safe
  check turns with them (every corner of each line's glyph box). The rise entrance stays along the screen's y.
- It enters and leaves as one unit, by the system's vocabulary for text ("rise", "fade" or "cut"), or by
  `reveal`. With `at` at 0 or before, it shows from frame 0.
- The scale is a still track (one key), set on each line about its top left corner. Both renderers
  draw the glyphs at the scaled size.

```ts
export type FitTextProps = {
  id?: string;
  /** One line, or explicit lines. The block does not wrap: give the breaks. */
  text: string | string[];
  /** The band or slab, px. */
  x: number; y: number; w: number; h: number;
  /** The role the lines are set in before scaling. Default: display. */
  role?: TypeRole;
  color?: ColorRole;
  align?: "left" | "center" | "right";
  /** Where the lines sit in the box's height when they fill its width first: "top" (default), "middle" or "bottom". */
  valign?: "top" | "middle" | "bottom";
  /** A tilted band: the box turns by `angle` degrees about its top left corner (x, y), as title's angle does (-45
   *  rises to the right). The lines fit the band along its axis (w) and across it (h); the text-safe check turns with
   *  them. */
  angle?: number;
  /** The largest factor. Default 4. */
  max?: number;
  /** How it comes on: "rise", "fade" or "cut". Default: the system's vocabulary for text. */
  enter?: TextReveal;
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: TextReveal;
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  keepCase?: boolean;
  at: number;
  until?: number;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};
```

### wordSeries

**Single words that replace each other in one place, one per beat, at one size.**

- Suits: Kinetic, Cutout.
- Works against: none named.
- Demo: [`examples/scenes/wordSeries.ts`](../examples/scenes/wordSeries.ts), 6 s, in Cutout and Kinetic: One word a beat, in one place and one size.

WordSeries: words that replace each other in one place, at one cap height, one baseline and one left edge
(or one centre). Use it for a beat-by-beat run of single words or short phrases (Kinetic, Courtside, Title):
"Faster." "Lighter." "Quieter." Hand-built runs drift by a few px or change size from beat to beat; this
block cannot.

Rules this block enforces:
- Every word is set in one role and one factor: the factor that fits the widest word in `w` (as fitText),
  so a long word never shrinks alone and the type size never jumps between beats.
- Each word shows from its own `at` until the next word's `at` (the last one until `until`), with a cut in
  one frame: words replace each other, they never overlap. In a fading system (vocabulary text "fade") the
  first word fades in and the last fades out; the changes between words stay cuts.
- The text-safe rules of fitText apply to the widest word.

```ts
export type WordSeriesProps = {
  id?: string;
  /** The words, each with the time it comes on, in time order. */
  words: { text: string; at: number; color?: ColorRole }[];
  /** The band the words share. `h` caps the size; default: the role's own size (factor 1 at most). */
  x: number; y: number; w: number; h?: number;
  role?: TypeRole;
  color?: ColorRole;
  align?: "left" | "center";
  keepCase?: boolean;
  /** When the last word leaves. */
  until?: number;
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};
```

### kineticWords

**Phrases cut on the beat in large type, with one accent word each.**

- Suits: Cutout, Kinetic, Courtside.
- Works against: Studio (Fast word cuts break the calm, one-sentence pace); Spec (Spec labels and draws; it does not shout words); Manual (Manual reads at a human pace); Ma (Nothing hurries in Ma); Primary (Type sits on an axis and turns in steps; it does not roll or pop); Riso (Its rolls and pops tween every frame; print steps); Mark (The mark is the subject, not words); Raw (Raw is a page, not a poster); Keynote (Keynote is slow; one line per scene); Graphite (Graphite is calm); Console (Console prints; it does not pop words); Noir (Noir pushes slowly); Title (Title cards hold); Matte (Type is small, in a corner); Schematic (Schematic is productive, not loud); Nocturne (Nocturne arrives word by word, slowly).
- Demo: [`examples/scenes/kineticWords.ts`](../examples/scenes/kineticWords.ts), 12.5 s, in Cutout and Kinetic: One fact about light, cut on a 120 BPM beat.

Kinetic words: short phrases that fill a box one after another, each cut on its beat.

Rules this block enforces:
- Each phrase fills the box. The type role keeps its system size; a static `scale` track fits it.
  The block tries every way to break the phrase into lines and keeps the one that sets the type largest.
- In a system with bleed for the role (Kinetic, Courtside), the box widens to the frame margins and
  each line scales to the full width, so the words run edge to edge. Elsewhere one scale sets the
  whole phrase, and every word passes textSafe.
- Phrases change on their beats: the old phrase cuts out on the beat, and the new one enters on it.
  Two phrases never show at the same time.
- Entrances follow the system's motion: a masked roll, word after word and line after line, or a
  scale pop of the whole phrase about its centre. A line rolls only when the line above it has
  cleared its mask, so two lines never show in the same place. Inside the safe area a line rolls only
  as far as the box allows, so no text box ever leaves the box on the way in. With an overshooting enter curve, the fit leaves room for the overshoot,
  so the phrase never passes its box.
- The accent marks one word a phrase. Where the accent equals the ink (Spec, Noir, Title), the word
  sits reversed out of a solid block, so the mark never rides on colour alone.
- The block reports a phrase with more words than the system's density limit, or a phrase held
  shorter than the system's minimum hold.
- A phrase at 0 s (or before) shows whole and at rest from frame 0, with no entrance, so a film can
  open on its first words instead of an empty frame.
- Bleed words carry HyperFrames' safe-zone opt-out (the renderers add it for a role in system.bleed).
- `keepCase` keeps the case as written in a role that the system sets in capitals, and measures it so.

```ts
export type KineticWordsProps = {
  id?: string;
  /** The box the phrases fill, in px. */
  x: number; y: number; w: number; h: number;
  phrases: KineticPhrase[];
  /** When the last phrase leaves. Each other phrase leaves on the next phrase's beat. */
  until?: number;
  /** The type role (default display). */
  role?: TypeRole;
  /** The most lines a phrase may break into (default 3). */
  maxLines?: number;
  /** Keep the case as written, also in a role the system sets in capitals (maths, units: "π r²"). */
  keepCase?: boolean;
  /** The phrases sit on an accent-coloured ground (a panel wipe under them): every word is set in onAccent, and no word gets a mark. */
  onAccent?: boolean;
  /**
   * Screen space: the words stay where they are on screen while the camera pans or pushes, so a push on the picture
   * never scales edge-to-edge words off the frame (Courtside's pushes on each word cut).
   */
  pinned?: boolean;
  /** The id of a block that holds this place before: it leaves on the frame this one starts (blocks/handover.ts). */
  replaces?: string;
};
```

### typeOn

**Text that writes itself, a key at a time: a command, a label, a figure caption.**

- Suits: Spec, Raw, Console.
- Works against: none named.
- Demo: [`examples/scenes/typeOn.ts`](../examples/scenes/typeOn.ts), 8 s, in Spec and Console: Two shell commands typed at a human rate, and their output, set large enough to read on a phone.

Type on: text that appears one character at a time, as if written or typed.

Rules this block enforces:
- Typing is content, not easing. So it types in every system, also in a one-frame system, where
  each character still appears in its own frame.
- Two paces. "write": a label writes itself at 40 characters a second (Spec's typed labels).
  "human": a person types, at about 14 characters a second, with a small fixed variation per key
  and longer pauses after spaces and punctuation. The variation comes from the text itself, not
  from chance, so every render is the same. Default: "human" in a one-frame system, else "write".
- Every key time sits on a frame (1/30 s), so both renderers show the same character on a frame.
- Each character is its own node and stays once typed, so no text changes under the reader. It
  sits where it sits in the finished line (the kerning with the character before it is kept).
  A swap to one whole-line node after typing was tried and dropped: contextual forms (Nunito
  raises "*" between digits) made the line jump for one frame.
- The text is measured. A line that is wider than its box wraps at word boundaries, and typing
  runs on into the next line. The box (with the cursor) stays inside the text-safe area.
- An optional block cursor follows the last character, blinks when typing ends, and leaves at
  `cursorUntil` (or `until`).
- At `until`, the text and the cursor leave: a fade, or one frame with `exit: "cut"`. The default is the system's
  text vocabulary: one frame in a one-frame system and in a system whose text cuts (Kinetic, Raw, Console, Title).
  An `until` on the frame of the last typed key, or before it, is honoured (a key after `until` never shows).
- `replaces: "<id>"`: the text that this label takes the place of leaves on the frame this one starts
  (blocks/handover.ts), so two labels in one slot never show at once, not even while one fades.
- `content: "data"`: the text is a diagram or chart label, not prose. The density rule and the reading-time rule
  skip it (TextNode.content).

```ts
export type TypeOnProps = {
  id?: string;
  x: number; y: number;
  /** The width of the box. A longer line wraps. Default: all the room to the safe edge. */
  w?: number;
  text: string;
  /** Default: label. */
  role?: TypeRole;
  /** Default: inkMuted. */
  color?: ColorRole;
  pace?: "write" | "human";
  cursor?: boolean;
  /** When the cursor leaves (as when the next prompt takes it). Default: `until`. */
  cursorUntil?: number;
  /** Keep the case as written, also in a role the system sets in capitals (units: "994 mm", "1 s"). */
  keepCase?: boolean;
  at: number;
  until?: number;
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /** How it leaves at `until`: "fade" or "cut" (one frame). Default: the system's text vocabulary (cut in a one-frame system). */
  exit?: "fade" | "cut";
  /** The id of a block that holds this place before: it leaves on the frame this one starts. */
  replaces?: string;
  /** "data": a diagram or chart label (density and reading time skip it). Default "prose". */
  content?: "prose" | "data";
};
```

### quote

**One statement in large type, with the speaker's name and job under a thin rule.**

- Suits: Nocturne, Ma.
- Works against: Spec (A technical drawing has no pull quote).
- Demo: [`examples/scenes/quote.ts`](../examples/scenes/quote.ts), 10 s, in Ma and Nocturne: One statement from the fictional cast, sized from the safe area so it works at 9:16 and 16:9.

Quote: one statement in a large type role, with the speaker below a thin rule.

Rules this block enforces:
- The statement uses the largest role that fits the box: display, then headline, then body.
  Each role has a line limit, so a long quote steps down in size before it becomes a wall of text.
- Lines are balanced: every line has about the same width, and the last line never holds one word alone.
- The line length stops near 30 characters, so a wide frame does not give long, hard-to-read lines.
- The opening quote mark hangs to the left, so the letters of every line share one left edge.
- At 9:16, text below the low band ends before the platform buttons. The block wraps narrower to do this.
- Lines rise out of their own masks one after another. Then the rule draws and the attribution appears.
- If the quote cannot fit in any role, the block uses the smallest role and logs a warning.
- Lines draw on a curve that never overshoots, so a stroke never runs past its end and back.
- `reveal: "word"`: the words of the statement fade in one after another, a stagger apart, in the same
  layout and with the same safety checks (Nocturne). Default "line": each line rises out of its mask.
- `statements`: one speaker, several statements in the same place. The rule, the name and the role
  enter after the first statement and stay while the statements change. The block picks one type
  role and one slot that fit every statement, so the attribution never moves. A statement leaves at
  its `until`, or in time for the next one to start, and two statements never show at once.
- `emphasis`: one word of the statement (or a few words in a row) set apart. Where the statement's face has a true
  italic (italics.gen.ts), the word is set in it. Where it has none, the word takes the system's accent text colour
  (accentText). The block never slants an upright face. A system whose accent text is its ink colour and whose face
  has no italic cannot set the word apart: the block says so and sets it as the rest. The emphasised word is
  measured in its own face, so a line with it keeps its width. With no emphasis, each line is one node.

This file also exports `wrapBalanced`, the line breaker that the other narrative blocks use.

```ts
export type QuoteProps = {
  id?: string;
  /** The block's box in px. The quote and the attribution fit inside it, centred on its height. */
  x: number; y: number; w: number; h: number;
  /** The statement, without quote marks. The block adds curly marks. Not used with `statements`. */
  text?: string;
  /**
   * Several statements by the same speaker, each in the same place, one after another. Each starts at its
   * own `at` and leaves at its `until` (default: in time for the next statement; the last one: the block's
   * `until`). The rule, the name and the role stay on screen while the statements change.
   * With statements, set the block's `at` to the first statement's `at`.
   */
  statements?: { text: string; at: number; until?: number; picture?: string; emphasis?: string }[];
  /**
   * One word of the statement, or a few words in a row, as the text writes them ("never"): set in the true italic of
   * the statement's face when the kit has one, else in the system's accent text colour. Never a slanted upright face.
   * A statement in `statements` gives its own `emphasis`.
   */
  emphasis?: string;
  /**
   * A picture under the statement: a prepared photo (media name) that fills the frame, dimmed behind type
   * (plate-dim: its light keeps the ink at 4.5:1), moving by the system's picture motion. The statement sits on it at
   * the width the block sets. A statement's own `picture` changes it: the next picture dissolves in under the next
   * statement. A picture beside the statement (stacked, or across its edge) is not this block's layout.
   */
  picture?: string;
  /**
   * "width": each statement is set in its role and then scaled so its widest line spans the box (FILL of the text
   * width), on the number of lines that sets it largest. "role" (the default, except in a system whose compose is
   * "fill", Nocturne): the role's size, about 30 characters a line.
   */
  fit?: "width" | "role";
  /** Who said it. */
  name: string;
  /** The speaker's job or relation, for example "Head of Nursing, Telofyngri Clinic". */
  job?: string;
  /** Force one type role for the statement. Default: the largest that fits. Before, this was `size`, and `role`
   *  held the job: both old forms still work, with a warning (a `role` that is not a type role is read as the job). */
  role?: "display" | "headline" | "body" | (string & {});
  /** @deprecated The old name of `role` (the statement's type role). */
  size?: "display" | "headline" | "body";
  /** "line" (default): each line rises out of its mask. "word": the words fade in one after another. */
  enter?: "line" | "word";
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: "line" | "word";
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  at: number;
  /** When the quote starts to leave (the attribution too). */
  until?: number;
};
```

### captions

**Subtitles from word timings, with the spoken word marked.**

- Suits: Pop, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/captions.ts`](../examples/scenes/captions.ts), 10 s, in Pop and Graphite: A spoken sentence pair with word timings, captioned at the foot of the text-safe area, over the picture it talks about (the Moon).

Captions: subtitles from word timings, with the spoken word marked.

Rules this block enforces:
- The block groups the words into pages of one or two lines. A page ends at the end of a sentence,
  at a pause in the speech, or when the next word does not fit. A page never holds more words than
  the system's density limit.
- A page of two lines breaks where the two lines are most equal in width, after a comma when it can.
- The spoken word sits on a bar in the accent colour, set in onAccent. The bar marks the word, so the
  mark never rides on colour alone, also in systems where the accent equals the ink.
  Words that are still to come are muted; spoken words are ink.
- Words keep a gap wider than the bar's padding, so a bar never touches the next word.
- The lines sit at the foot of the caller's box (the caption zone) and every word passes textSafe.
- Pages and bars cut on the frame of the word: subtitles follow speech, so nothing tweens late.
- `pinned`: the text stays in screen space through camera moves (a caption bar that rides a pan).

```ts
export type CaptionsProps = {
  id?: string;
  /** The caption zone in px. The lines sit at its foot. */
  x: number; y: number; w: number; h: number;
  /** The words in speech order, with their times. */
  words: CaptionWord[];
  /** One or two lines a page (default 2). */
  maxLines?: 1 | 2;
  /** At most this many words a page (default: the system's density limit). */
  maxWords?: number;
  /** Line alignment in the box (default centre). */
  align?: "center" | "left";
  /** Screen space: the text stays where it is on screen while the camera pans or zooms (a caption that rides
   *  through a move, so no sentence has to leave for it). */
  pinned?: boolean;
  /** When the last page leaves (default: 0.8 s after the last word ends). */
  until?: number;
};
```

### lowerThird

**A speaker's name and job beside a short rule, at the foot of the frame.**

- Suits: Studio, Noir.
- Works against: Courtside (The offer is the loudest frame, not a small label).
- Demo: [`examples/scenes/lowerThird.ts`](../examples/scenes/lowerThird.ts), 5.5 s, in Studio and Noir: A speaker's name and role over the footage they speak on, at the foot of the text-safe area.

Lower third: the name and the role of a speaker, beside a short vertical rule.

Rules this block enforces:
- The block measures both lines before it places them. The rule is as tall as the two lines.
- The name uses the headline role when it fits the box, else the body role.
- The role line breaks onto two lines when it does not fit on one, after a comma when it can.
- A line that still does not fit ends with an ellipsis, and the block reports it.
- The block sits at the foot of its box, so the caller gives the box and the block keeps inside it.
- Every text box passes textSafe. The block reports a box that does not.
- Enter: the rule draws down, then the name and the role rise out of their masks.
  Leave: the lines rise out of the top of their masks, then the rule draws back up. Nothing stays after it leaves.
- The rule draws on a curve that never overshoots, so it never passes its length.
- `plate`: over footage, a flat panel in the ground colour sits behind the rule and the lines (a pad of half the
  label size round them), so the type keeps its contrast on any picture. It comes on with the rule and goes with it.
  The rule then draws in the overlay layer, above the panel.

```ts
export type LowerThirdProps = {
  id?: string;
  /** The block's box in px. The rule and both lines sit at the foot of the box. */
  x: number; y: number; w: number; h: number;
  /** The speaker's name: the first line. */
  name: string;
  /** What the speaker does, or where: the second line, set in the label role. */
  job?: string;
  /** @deprecated The old name of `job`; it still works, with a warning. */
  role?: string;
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /** The time the block starts to enter, in seconds. */
  at: number;
  /** The time the block starts to leave, in seconds. */
  until?: number;
  /** A flat panel in the ground colour behind the rule and the lines, for type over footage. Default: false. */
  plate?: boolean;
};
```

### lockup

**A mark and a name on one axis, as one unit: a product, a studio, a film title.**

- Suits: Cutout, Mark, Pop, Keynote.
- Works against: none named.
- Demo: [`examples/scenes/lockup.ts`](../examples/scenes/lockup.ts), 6 s, in Mark and Keynote: A mark and a name on one axis, as one unit, at the size of a title card.

Lockup: a mark and words on one axis, as one unit. Use it for a name with its mark (a product, a studio,
a film title) and for the end card. The mark is a flat shape (circle, square, triangle) or none.

Rules this block enforces:
- "row": the mark sits left of the name, as tall as the name's cap height times 1.1, centred on the
  name's line; the gap is half the mark. The optional line sits under the name, on the name's left edge.
- "column": the mark sits above the name, centred; the name and the line are centred under it.
- The whole lockup is centred in its box (`w`, and `h` when given) and measured before it is placed.
  Every text line must pass the text-safe area; the name steps down a role (display, headline, body)
  until the lockup fits the box width.
- It comes on and goes off as one unit, by the system's vocabulary for text (a cut in an opaque or a
  one-frame system, else a fade). With `at` at 0 or before, it shows from frame 0.
- It names its parts: anchors `<id>-mark-box`, `<id>-name-box` and `<id>-line-box`, so a scene can point at them.
- The mark is a drawn shape, a prepared picture or cut-out (`{ media }`: the photo block, its subject filling the
  mark's box), or a product model (`{ objects }`: the product block, framed by its silhouette in the mark's box, still).
  A picture or a model takes `markSize` px of height (endCard sets it from the system's end look); a shape keeps the
  size of the name's cap height. A "row" lockup with a large mark that cannot sit beside its name turns to a column.
  A model in a system with a floor reflection (Matte) stands under its name, so its mirror falls in the lower frame.
- A column whose text lands in the low band (9:16) steps the name down a role when it is wider than the band, so it
  never passes the band's right edge. The warning for a stepped-down name offers only the fixes the lockup does not
  use yet (a column only to a row; two lines only to one).
- `lines: 2` (or a "\n" in the name) sets the name on two lines, broken at the most even word gap. `slab` draws a flat
  rectangle behind the whole unit, cut on and off with it.

```ts
export type LockupProps = {
  id?: string;
  name: string;
  /** One line under the name: what it is, or the offer. */
  line?: string;
  mark?: Mark;
  /** The height of the mark, px. Default: a shape from the name's cap height; a picture or a model 1.6 cap heights. */
  markSize?: number;
  axis?: "row" | "column";
  x: number; y: number; w: number; h?: number;
  /** The name's role to try first. Default: headline. */
  role?: TypeRole;
  /** The line's role. Default: body. */
  lineRole?: TypeRole;
  color?: ColorRole;
  markColor?: ColorRole;
  lineColor?: ColorRole;
  at: number;
  until?: number;
  /** How it comes on and goes: "fade" or "cut". Default: the system's vocabulary (a cut in a one-frame or opaque system). */
  enter?: "fade" | "cut";
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: "fade" | "cut";
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /**
   * The name on two lines: 2 breaks it at the word gap that gives the most even lines (a "\n" in the name sets the
   * break). Use it for a title of three words or more that does not fit one line at the role it asks for. Default 1.
   */
  lines?: 1 | 2;
  /**
   * A slab behind the whole lockup: a flat rectangle in this colour role, `pad` px round the unit (default: half the
   * name's line height), cut on and off with it (Cutout's end: the title as one cut in one slab). Default: none.
   */
  slab?: ColorRole | { fill: ColorRole; pad?: number };
};
```

### endCard

**The last card of a film: the name and one line, landing on a beat and holding.**

- Suits: Studio, Keynote, Matte, Courtside.
- Works against: none named.
- Demo: [`examples/scenes/endCard.ts`](../examples/scenes/endCard.ts) (shared with hold), 9.5 s, in Studio and Matte: The end of a film: a word series on the beat, then the end card that lands on the last beat and holds.

EndCard: how a film ends. The name, one line, and a held finish that lands on a beat. Use it as the last
block of every film, so no film just stops.

Rules this block enforces:
- It lands at `at`: the name is fully readable on that frame (put `at` on a beat or on the track's last
  strong onset). The entrance starts one enter duration before, so it is complete when the beat hits.
- The finish holds from `at` to `until` (the film's end), at least 1.5 s; a shorter hold warns. A hold
  of more than 3 s is marked deliberate for the HyperFrames check (a `hold` node).
- Its form follows the system:
  - a system whose `bleed` lists display (Kinetic, Courtside): the name fills the safe width (fitText),
    with the line under it;
  - every other system: a lockup (mark, name, line), centred, on one axis ("column" by default).
  The entrance comes from `enter` (or its old name `reveal`), else the system's vocabulary: a fade in Ma and Nocturne, a cut in the one-frame
  and opaque systems, a fade elsewhere. It never leaves: the film ends on it.
- `place` puts the name in the upper third of its box by default, so the default card leaves no empty upper frame.
- Every text line passes the text-safe area. The scene clears the card's place before it starts to enter,
  `endCardLead(ctx)` seconds before `at`, so no text cross-fades over it.
- It names the landing: anchor `<id>-land` (its box, `at` = the landing time), for a hit on the beat.
- The system's end look (Direction `ends.look`) sets the name's role, the line's role, where the unit sits, and the
  size of a real mark: a prepared picture or cut-out (`mark: { media }`) or a product model (`mark: { objects }`)
  takes `look.mark` of the frame's height, so the end fills the frame the way the system's last frame should (Studio:
  the product large on its shadow, the name in display; Keynote: the subject small and centred, the name in headline).
  No second product block is needed to end on the product.
- With a music bed, give `on: beats(...)`: `at` moves to the nearest bar, and the block says so when it moves.

```ts
export type EndCardProps = {
  id?: string;
  /** The name of the subject: the product, the film, the studio. */
  name: string;
  /** One line: what it is, or the offer. */
  line?: string;
  /** A shape, none, a prepared picture or cut-out (`{ media }`), or a product model (`{ objects }`). Default: a circle. */
  mark?: Mark;
  /** The name's role. Default: the system's end look (Direction `ends.look.name`). */
  role?: TypeRole;
  /** The name on two lines: 2 breaks it at the most even word gap (the lockup's `lines`). Default: one line. */
  lines?: 1 | 2;
  /** The height of the mark's box in px (the lockup's `markSize`), not of the object in it: a picture or a model fits
   *  inside the box at its own aspect, so a wide object fills the box's width first and draws lower than the box (a
   *  chair at 0.6 of the frame's height can draw at about 0.42). Default: the system's end look for a real mark; else small. */
  markSize?: number;
  /** Default: the system's end look; a row turns to a column where a large mark cannot sit beside the name. */
  axis?: "row" | "column";
  /** The box. Default: the text-safe area. */
  box?: { x: number; y: number; w: number; h: number };
  color?: ColorRole;
  /** The time the card lands (fully readable), seconds. Put it on a beat, or give `on`. */
  at: number;
  /** The film's beat grid (`beats(...)`): `at` moves to the nearest bar (a build note says so when it moves). */
  on?: { onBar: (t: number) => number };
  /** The id of a text block that holds this place before: it leaves on the frame the card starts (handover.ts). */
  replaces?: string;
  /** The film's end. Default: at + 2 s. */
  until?: number;
  /** How it comes on: "fade", "cut" or "rise" (a fade and a small rise). Default: the system's vocabulary (a cut in a one-frame or opaque system). */
  enter?: "fade" | "cut" | "rise";
  /** @deprecated The old name of `enter`; it still works, with a warning. */
  reveal?: "fade" | "cut" | "rise";
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /**
   * Where the name sits in the box: "upper" (its top third, so the upper frame is not left empty), "middle" or "lower"
   * (over a picture's calm low band, for example). Default: the system's end look.
   */
  place?: "upper" | "middle" | "lower";
};
```

## Pictures

### photo

**A prepared picture or clip that fills a box, graded for the system and framed on its subject.**

- Suits: Studio, Spec, Ma, Riso, Cutout, Pop, Keynote, Graphite, Noir, Title, Courtside, Nocturne.
- Works against: Manual (Pictures are rare here; the code and its output are the subject); Mark (An identity film shows the mark, not a picture); Console (A smooth photo breaks the screen; draw a figure in characters instead); Matte (Matte is a render; a photo breaks the material); Schematic (Pictures are rare; the drawing explains).
- Demo: [`examples/scenes/photo.ts`](../examples/scenes/photo.ts), 6 s, in Ma and Noir: A picture graded for the system, framed on its subject, with a slow push.

Photo: a prepared photo or clip (scripts/media.ts) that fills a box, graded for the system, framed on its subject,
with a slow push or drift, and optionally its cut-out subject drawn in front of the text: the
"type behind the subject" device of sports and editorial campaigns.

Rules this block enforces:
- The photo fills the box (cover) and is centred on its subject, so the crop never cuts the subject out.
  `focus` states another point (fractions of the picture) when the scene wants a different centre.
- The plate draws in the backdrop layer. With `over`, the cut-out subject draws in the overlay layer, so
  text in the content layer passes behind the subject and in front of the background. The cut-out
  marks the cover as deliberate for HyperFrames; the scene still keeps each word readable (plan with
  placeBehind in scene/cover.ts; scripts/inspect/cover.py checks the recorded frames).
- Motion stays inside the crop and never reveals an edge: "push" eases in toward the subject by `amount`
  (default 8 %), "drift" moves sideways, "still" holds. It uses the move curve and never overshoots.
- Enter and exit: "cut" (one frame, on the frame of `at` and off on the frame of `until`), "dissolve" (an
  opacity fade over the system's enter or exit duration) or "rise" (the picture moves up into place).
  The defaults come from the system's vocabulary (scene/vocabulary.ts): Ma and Nocturne dissolve, all
  others cut. A one-frame system always cuts, one frame after `at` (as present() and the text blocks do
  there). With `at` at 0 or before, the photo shows from frame 0.
- Sharpness: the block computes the final upscale of the source (cover x zoom x push or drift). Over
  1.15 it warns. Over 1.25 it warns that the picture is soft and names the pixel size it needs; with
  UPSCALE.throws set, it throws instead. The camera's zoom multiplies the upscale too: the block does not see the
  camera, but the softness check measures the picture's size on screen, with the same two limits.
- `shape`: "circle" or "square" crops the picture to the largest centred square of the box (a circle
  rounds it). `sticker` (Pop) puts a flat ground band and an ink outline around a shape crop.
- `frame: "figure"` (Spec, Schematic): a bordered window with a label strip at its foot (or at its top, `labelAt`),
  all inside the box.
- `traceOn(nodes, id)` maps the photo's source pixels to the screen, through the cover fit, the focus, the zoom and
  the motion at a time: a drawing traced on the photo's pixels stays on them through a zoom and a crop.
  The label is measured and checked against the text-safe area.
- Light (only where the system's `allows` lists the effect, else it throws): `sweep` (light-sweep: Keynote, Matte)
  runs a narrow band of light across the subject once; `rim` (rim-light) draws a thin light line on one edge of
  the silhouette. Both are cut to the cut-out's alpha, so light falls on the subject and never on the ground.
- `shape: "triangle"` and `clip` (any polygon in fractions of the box) crop the picture with a hard edge. A sticker
  edge follows the polygon. `sticker` without `shape` outlines the cut-out subject itself (an outline from its alpha).
- Footage `rate`: slow motion (0.5) or speed (2). The clip ends where the file ends at that rate.
- `passes` (Riso): the picture prints ink by ink instead of as one plate. Each ink is a halftone separation that
  `prepare --system riso` writes (ink-<role>.png); one ink stamps on per beat, mixed with multiply, each a few px
  off register. `paper` (Cutout): the subject draws as a two-tone paper cut (paper.png) instead of a graded photo.
- It names the subject on screen: anchor `<id>-subject-box` (where the subject is at the end of the move), so
  a scene can set type across it on purpose or keep text clear of it.

```ts
export type PhotoProps = {
  id?: string;
  /** A prepared asset: a name that `untell media list` shows. */
  media: string;
  box?: { x: number; y: number; w: number; h: number };
  /** Draw the cut-out subject in front of the content layer. */
  over?: boolean;
  /** Draw the whole photo behind everything. false: only the cut-out subject (with `over`), on whatever is below. */
  plate?: boolean;
  /** "top": the plate's top eases into the ground (dark systems; plate-top.jpg), for a photo framed low, so the
   * photo has no top edge. The cut-out subject does not fade. */
  fade?: "top";
  /** Behind type: the plate dimmed by the system's Media `dim` level, or 55 % where the system names none (plate-dim, which prepare writes for every graded picture). */
  dim?: boolean;
  /** The point of the picture that stays put in the crop, as fractions [x, y]. Default: the subject's centre. */
  focus?: [number, number];
  /** A tighter crop: the scale over the cover fit, about the focus. Default 1. It counts in the upscale check. */
  zoom?: number;
  motion?: "push" | "drift" | "still";
  /** How far the motion goes: a scale gain for push (0.08 = 8 %), a share of the width for drift. */
  amount?: number;
  /** Footage only: where in the clip to start, seconds. The clip plays from `at` to `until` (or its end). */
  clipStart?: number;
  /** @deprecated The old name of `clipStart`; it still works, with a warning. */
  from?: number;
  /** How long the motion runs, seconds. Default: until `until`, or 8 s. */
  seconds?: number;
  /** How the photo comes on. Default: the system's vocabulary. */
  enter?: PhotoMove;
  /** How the photo goes off at `until`. Default: the system's vocabulary. */
  exit?: PhotoMove;
  /** The length of a "dissolve" enter or exit, in frames (30 fps), for a system that names one (Studio: 8 to 15
   *  frames between shots). Default: the system's enter and exit durations. 2 to 45 frames. */
  dissolve?: number;
  /** Crop the picture to a shape: the largest centred square of the box, rounded for a circle, cut for a triangle. */
  shape?: "circle" | "square" | "triangle";
  /** Crop the picture to any polygon, in fractions of the box ([0, 0] top left). It wins over `shape`'s crop. */
  clip?: [number, number][];
  /** A flat sticker edge, a ground band with an ink line outside it (Pop). With `shape` or `clip` it follows the
   *  crop; without, it follows the cut-out subject's own outline. */
  sticker?: boolean;
  /** Footage only: the playback speed. 0.5 is slow motion, 2 is double speed. Default 1. */
  rate?: number;
  /**
   * A light sweep (light-sweep): a narrow band of light that crosses the subject once, from `from` (default left),
   * starting at `at` and taking `seconds` (default twice the move duration). `angle`: the band's lean in degrees
   * (default 20). `width`: the band in px (default 6 % of the box). `strength`: 0-1 (default 0.55).
   */
  sweep?: { at: number; seconds?: number; from?: "left" | "right"; angle?: number; width?: number; strength?: number };
  /** A rim light (rim-light): a thin light line on the silhouette's edge that faces `angle` degrees (0 right, 90 down,
   *  180 left). It comes on at `at` over the enter duration. `width` px (default 2 strokes), `strength` 0-1 (default 0.7). */
  rim?: { at?: number; angle?: number; width?: number; strength?: number };
  /** Print the picture ink by ink (Riso): one halftone layer per ink of the system's duotone grade, darkest first,
   *  one every `beat` seconds from `at`, overprinted with multiply, each `offset` px off register (default 0.4 %
   *  of the frame width). Needs the ink layers from prepare. */
  passes?: { beat: number; offset?: number };
  /** The subject as a two-tone paper cut (paper.png from prepare, Cutout), with `over`, `sticker` or light. */
  paper?: boolean;
  /** "figure": a bordered window with a label strip at its foot (Spec, Schematic). "letterbox": a band across the frame's
   *  full width at the picture's own aspect, no taller than 2:1 nor flatter than 2.39:1, centred on the frame's height
   *  (`box` is not used): a film still that is too small, or too wide, to fill a tall frame. */
  frame?: "figure" | "letterbox";
  /** The figure's label, one line ("FIG. 2  CHAINRING, 1:4"). */
  label?: string;
  /** Where the figure's label strip sits: "foot" (the default) or "top" (when the lower band holds a drawing). */
  labelAt?: "top" | "foot";
  at: number;
  until?: number;
};
```

### shape

**A flat circle, square, triangle, rectangle or sector that enters, turns and moves.**

- Suits: Primary, Riso, Cutout, Mark, Pop, Schematic, Graphite.
- Works against: Ma (A flat square of colour reads as a missing image. Use a real picture).
- Demo: [`examples/scenes/shape.ts`](../examples/scenes/shape.ts), 7 s, in Primary and Graphite: A square draws, a circle grows inside it, and a triangle slides in and turns in 90-degree steps.

Shape: a circle, a square, a rectangle, a triangle or a sector (a wedge of a disc), filled or
outlined, that enters by growing, drawing its outline, sliding in from an edge, a fade or a cut, and can
turn in steps or move to a new place.
Use it for geometric explanation (Primary, Cutout), pictograms, and simple marks.

Rules this block enforces:
- Shapes are flat: a fill role or an outline in the system stroke. No gradient, no shadow.
- "grow" scales from the shape's centre on a curve that never overshoots when the shape stands for a
  quantity (`exact`); otherwise it uses the system's enter curve, so Pop's shapes may overshoot.
- "draw" draws the outline from its first corner; a fill, if any, fades in as the outline closes.
- "slide" enters from the frame edge that `from` names ("left", "right", "top", "bottom"); with no `from`, from
  the nearer side edge. It enters on the enter curve.
- "cut" stamps the shape whole in one frame, with no fade and no motion, as a print or a cut does.
  With `until` it also leaves in one frame. The switch falls half a frame before a frame, so both
  renderers show it on the same frame.
- "sector": a wedge of the disc that fits the box, from `angles[0]` to `angles[1]` in degrees,
  clockwise from 12 o'clock. A half disc is a sector of 180 degrees: [-90, 90] is the top half.
  "draw" outlines it from the centre.
- `turns` rotate the shape in steps (90 degrees for Primary's grammar) at given times, from `angle` (the start
  angle, default 0), about `pivot`: a named point of the outline ("apex", "base", "bottom-left"...), fractions of
  the box, or a point in px. Default: the centre, or the point the shape rests on (`on`). A beam turns about the
  fulcrum's apex with `on: { part: fulcrum, at: "apex" }` and no hand-computed move. Each step (a turn or a move)
  takes the move time: steps closer than that throw with the two steps and the gap. A step before 0 has ended by
  frame 0, as every block's keys fold.
- `on: { part, at }`: the shape rests on a point of another shape (the nodes that shape returned) and rides with
  it when the part moves or turns: flush on it, turning with it about the same point (a load on a beam's end), or,
  with `upright: true`, upright on the point (a weight that hangs from a pin). The block warns when the point is not
  on both outlines at rest (a gap or an overlap), and names the joint (anchor `<id>-on`) so the detector's `joint`
  check can measure, on every frame of the render, that the shape stays on the part. `on` and `moves` do not mix.
- The outline of a triangle is equilateral: √3/2 of its side tall, centred in its square box, so a gap of about
  6.7 % of the side stays above the apex and under the base. Take its points from pointOf(nodes, "apex") or
  "base" (blocks/parts.ts), not from the box.
- It names its geometry (anchor `<id>-shape`: the kind and the drawn box), so pointOf, pointAt, followPoint and
  `figure` can read it.
- `moves` carry it to new places at given times, on the move curve. `to` is an offset from the drawn box;
  `by` is a step from the place before. Both are px. The two names say which one a scene means.
- "fade": opacity only, no scale and no move (Ma, Nocturne: a quiet arrival).
- The default entrance comes from the system's vocabulary (scene/vocabulary.ts): "fade" in Ma and
  Nocturne, "cut" in Cutout, Riso and Primary, "grow" elsewhere.
- In an opaque system (Cutout, Riso, Primary) a shape is never half seen: "grow" and "slide" are at full
  opacity from their first frame, a drawn shape's fill stamps on as the outline closes, and the shape
  leaves in one frame at `until`.
- In a one-frame system, every change happens in one frame.

```ts
export type ShapeProps = {
  id?: string;
  kind: "circle" | "square" | "rect" | "triangle" | "sector";
  /** For a sector: the start and end angle in degrees, clockwise from 12 o'clock. Default [0, 180] (the right half). */
  angles?: [number, number];
  /** The shape's box in px. A circle and a square use the smaller side. */
  x: number; y: number; w: number; h: number;
  fill?: ColorRole;
  stroke?: ColorRole;
  /** Outline width as a multiple of the system stroke. Default 1. */
  weight?: number;
  /** Default: the system's vocabulary. */
  enter?: ShapeEnter;
  /** For `enter: "slide"`: the frame edge it enters from. Default: the side edge nearer the shape's centre. */
  from?: "left" | "right" | "top" | "bottom";
  /** The shape stands for a quantity: never overshoot. */
  exact?: boolean;
  /**
   * Rotations about `pivot`, in degrees, each at a time, in time order. Each turn takes the system's move time
   * (one frame in a one-frame system), so two turns need at least that gap: closer ones throw with the two turns and
   * the gap. A turn before 0 has ended by frame 0, so the shape is at rest there, turned.
   */
  turns?: { at: number; by: number }[];
  /** The angle in degrees, clockwise, that the shape rests at from frame 0, before any turn. Default 0. */
  angle?: number;
  /**
   * The point the shape turns about: a named point of its outline ("centre", "apex", "base", "top-left"...), fractions
   * of its box ([0, 0] top-left, [1, 1] bottom-right), or a point in px. Default: the point it rests on (`on`), else
   * the centre.
   */
  pivot?: ShapePoint;
  /**
   * The shape rests on a point of another shape and rides with it: `part` is the nodes that shape returned, `at` a
   * point of that part (a name, fractions of its box, or px). Place the shape so the point is on its own edge too (a
   * load's base on the beam's top): pointOf(part, at) gives the point. When the part turns, the shape turns with it,
   * flush on it, about the same point; with `upright: true` it stays upright and only rides on the point (a weight that
   * hangs from a pin).
   */
  on?: { part: Node[]; at: ShapePoint; upright?: boolean };
  /**
   * Squash and stretch (Pop): at each time the shape squashes onto its base (wider and lower), then springs back on the
   * system's enter curve, past its size and back (an overshoot where the system has one). The shape scales about its
   * base, so it lands rather than pulses.
   */
  squash?: number[];
  /** Rounded corners for a rect or a square, px. */
  radius?: number;
  /**
   * Moves to new places, each at a time, in time order, on the move curve. Give each move one of two forms:
   * - `to: [dx, dy]`: the place as an offset in px from where the shape is drawn (its box). A list of places
   *   is what a scene knows, so this is the form to use.
   * - `by: [dx, dy]`: a step in px from the place before.
   * `dx` and `dy` alone are the old form: a step from the place before, as `by`. The block warns on them.
   */
  moves?: { at: number; to?: [number, number]; by?: [number, number]; dx?: number; dy?: number }[];
  layer?: number;
  z?: number;
  at: number;
  until?: number;
};
```

### drawnMark

**A brand mark from SVG paths, drawn on by its strokes, filled, and locked up with the name.**

- Suits: Mark, Keynote.
- Works against: none named.
- Demo: [`examples/scenes/drawnMark.ts`](../examples/scenes/drawnMark.ts), 7 s, in Mark and Keynote: A brand mark given as SVG paths, drawn on by its strokes, filled part by part, then locked up with its name.

DrawnMark: a brand mark of the user's own, given as SVG paths, drawn on by its strokes and then filled, path by
path. It can end as the film's lockup: the finished mark moves into place over the name and the line, and holds.
Use it for a logo sting or the end of a launch film (Mark). For a flat circle, square or triangle use `shape`.

Rules this block enforces:
- The mark is a name in the marks table (`untell media add <file>.svg --as <name>`: the file is parsed once, and its
  paths go into the kit's marks.gen.ts) or inline art: `{ viewBox, paths: [{ d, paint }] }`, or `{ svg }` with the
  text of an SVG file. The accepted format is in scene/markArt.ts: a viewBox, path and basic-shape elements, flat
  paint, no transforms.
- Colour comes from the system's roles, never from the file: every path is in `color` (default "ink"), and at most
  one path is in the accent (`accent`, its index; default the first path, the unit module, except in a system that
  keeps its accent for other things (Direction `accentFor`); "none" for no accent). All the paths are one group (node
  `group`): the checks read the mark as one picture (the hook) and as one mover, though no path alone is large.
- Each path draws its outline from its start over `draw` s (stroke-dashoffset by path length, in both renderers),
  on the move curve with no overshoot, then its fill lands (`fills`, default: as its outline closes). The fill comes
  on in one frame (`fillWith: "cut"`) or by a fade over the system's enter time; an opaque or a one-frame system
  always cuts. A path whose time is at or before 0 is drawn and filled on frame 0. A line (a path with
  `paint: "stroke"`) keeps its outline and has no fill.
- The opening: a mark that starts the film (`at` at or before 0) with no `times` shows its first path (the unit
  module) drawn and filled on frame 0, and draws the others from 0, one after another. A system whose hook asks for a
  picture then has its picture on frame 0.
- Size and place: the mark's drawn box (its paths, not its viewBox) fits `box`, centred, its aspect kept. With no box
  it takes the system's hero box, centred in the picture-safe area (under `line`, when given). When the mark opens a
  film in a system whose hook asks for a picture, the box is large enough that the parts on screen at the hook's time
  (Direction `hook.by`) cover the hook's share of the frame (`hook.area`) as the hook check measures them: each part
  by its box. Else it is the hook's share itself.
- `line: { text, role }`: one line over the mark while it builds (role default "headline"), placed with the mark as
  one pair (lineAndSubject). The block owns it: with a lockup, the line leaves before the mark moves, so it never
  meets the name.
- `lockup: { name, line, at }`: at `at` the mark moves on the move curve into one lockup with the name and the line,
  centred on the frame's middle (the text-safe area made symmetric about it). The roles are the system's end look
  (Direction `ends.look`); the line steps up a role where its letters would be too small on a phone (a wide frame:
  layout.smallLineRole). In a tall frame the text must end in the text-safe area, so the name and the line go over
  the mark and the mark keeps the size it was built at (smaller only when the pair would pass the picture-safe foot):
  the mark owns the frame to the end. In a wide or square frame the mark goes over the name (on the end look's axis):
  it keeps the size it was built at where the text-safe height leaves room for the words, and never goes under the
  end look's height (`ends.look.mark` of the frame's height). The words never fade in over the moving
  mark: when the mark passes under them they enter as it lands, else on `at`. A hold runs from the landing to the end,
  so the closing hold is marked as the design.
- It names its parts: anchors `<id>-box` (the drawn box at rest) and, with a lockup, `<id>-lock-mark-box`,
  `<id>-lock-name-box` and `<id>-lock-line-box`.

```ts
export type DrawnMarkProps = {
  id?: string;
  /** The mark: a name in the marks table (untell media add <file>.svg), inline art, or `{ svg }`: an SVG file's text. */
  mark: string | MarkArt | { svg: string };
  /** The box the mark's drawn shape fits, centred, px. Default: the system's hero box at the mark's aspect. */
  box?: Box;
  /** The one path in the accent (the brand colour), by its index in the file's order. Default: 0, the first path (the
   *  unit module); none in a system that keeps its accent for other things (Direction `accentFor`). "none": no accent. */
  accent?: number | "none";
  /** One line over the mark while it builds. The block places it with the mark and takes it off before a lockup. */
  line?: { text: string; role?: TypeRole };
  /** The colour role of the other paths. Default: "ink". */
  color?: ColorRole;
  /** When each path starts to draw, s, one per path in the file's order. Each is at `at` or later. Default: one after another from `at`. */
  times?: number[];
  /** How long each path's outline takes to draw, s. Default: 1.5 x the system's move time. */
  draw?: number;
  /** When each path's fill lands, s, one per path. Default: as its outline closes. */
  fills?: number[];
  /** How a fill comes on: in one frame ("cut") or by a fade over the enter time. Default: the system's vocabulary. */
  fillWith?: "fade" | "cut";
  /** The outline's weight as a multiple of the system stroke. Default 2. */
  weight?: number;
  /** The end: the mark moves into a lockup with the name and the line at `at`, and holds to the end. */
  lockup?: { name: string; line?: string; at: number };
  at: number;
  until?: number;
};
```

### shadowBars

**Hard bars of shadow from a blind, across the frame (Noir only).**

- Suits: Noir.
- Works against: none named.
- Demo: [`examples/scenes/shadowBars.ts`](../examples/scenes/shadowBars.ts), 5 s, in Noir: A hard key light through a blind falls on the street picture, and the bars' phase is solved so every letter of the title stays in the light.

Shadow bars: the shadow of a venetian blind, cast by a hard key light on one near plane (Noir's shadow-bars).
The bars fall on a plane (the picture, a wall), never on the whole frame, and they keep the type in the light.

Rules this block enforces:
- Only a system whose `allows` lists "shadow-bars" may use it (Noir). Any other system throws.
- Every edge is hard: the bars are flat polygons in the ground colour at `depth`, cut to the plane box. No
  gradient, no blur.
- keepLit: the bars' phase is solved so that no listed text sits in a dark bar. The block tries every phase on
  a 1 px step and keeps the one with the widest lit margin round the text. When no phase keeps all of it lit, it
  widens the period in 5 % steps, up to `stretch` times (default 1.6), with the same duty. When even that fails,
  it keeps the phase with the least text in shadow and warns with the share in shadow. A lit gap must hold a
  whole line across the bars, so near-level bars (angle -6 to -15) suit a title of more than one line.
- The bars are light, not an object: they cut on at `at` (one frame) and off at `until`, or, with `exit: "fade"`,
  fade out over the system's exit time from `until` (the slat light dies on the last beat). They draw in the
  content layer under the text by default, so a bar never draws over a letter.
- keepLit keeps each text in a lit gap of its own: texts far apart on the frame sit in different gaps. The period
  grows as far as the kept text needs, and never past 4 times the base (unless `stretch` asks), so the bars stay slats.
- It names the result: anchor `<id>-phase` (data: phase, period, dark, shadowed share of the kept text).

```ts
export type ShadowBarsProps = {
  id?: string;
  /** The plane the bars fall on, px. Default: the whole frame. */
  plane?: { x: number; y: number; w: number; h: number };
  /** The bars' direction in degrees from horizontal (default -35: rising to the right). */
  angle?: number;
  /** The distance from one bar to the next, px (default 9 % of the frame height). */
  period?: number;
  /** The share of each period in shadow, 0-1 (default 0.5). Over 0.5 the frame reads as lit slats on dark. */
  duty?: number;
  /** How dark the shadow is, 0-1 (default 0.82). */
  depth?: number;
  /** Text nodes (from any block) that must stay in the light. */
  keepLit?: Node[];
  /** How far keepLit may widen the period to find a phase that keeps all the text lit (default 1.6, 1 = never). */
  stretch?: number;
  /** The layer the bars draw in (default 0, under the text of that layer). */
  layer?: number;
  /** How the bars leave at `until`: "cut" (default, one frame) or "fade" (over the system's exit time). */
  exit?: "cut" | "fade";
  at: number;
  until?: number;
};
```

## Layout and grounds

### ground

**The ground of the frame changes colour on a beat.**

- Suits: Kinetic, Courtside, Spec.
- Works against: none named.
- Demo: [`examples/scenes/vocabulary.ts`](../examples/scenes/vocabulary.ts), 9 s, in Spec and Kinetic: One scene, many systems, and each system's own motion with no `.map` patch.

Ground: the colour of the whole frame changes on a beat. A full-frame fill in a colour role, under every
picture and every block, from `at` until `until`. Use it for a cut to an accent ground (Kinetic: a word
becomes the next ground), a dark beat in a light film, or a slow change of paper (Ma).

Rules this block enforces:
- The fill is flat: one colour role, no gradient. It draws in layer -2, below the photo plates (layer -1),
  so pictures and blocks stay on top of it.
- It changes by the system's vocabulary (scene/vocabulary.ts): a cut in one frame, or a dissolve in Ma and
  Nocturne. `enter` and `exit` change it. A one-frame system always cuts. With `at` at 0 or before, the
  ground is there from frame 0.
- The fill reaches past the frame by `bleed` px on each side (default 0), so a camera move does not show
  its edge.
- Text that sits on the new ground must read on it: on an accent ground, set it in `onAccent`. The block
  does not change the colour of other blocks.

```ts
export type GroundProps = {
  id?: string;
  /** The colour of the new ground, as a role ("accent", "ink", "surface"...). */
  color: ColorRole;
  /** "cut": one frame. "dissolve": a fade over the enter (or exit) duration. Default: the system's vocabulary. */
  enter?: "cut" | "dissolve";
  exit?: "cut" | "dissolve";
  /** px past each frame edge, for a scene with a camera. Default 0. */
  bleed?: number;
  at: number;
  until?: number;
};
```

### frameGrid

**The system's grid drawn on the frame: the text-safe outline, the columns, the corner marks.**

- Suits: Mark, Console.
- Works against: none named.
- Demo: [`examples/scenes/frameGrid.ts`](../examples/scenes/frameGrid.ts), 6 s, in Mark and Console: The grid of the system in this frame.

Frame grid: the visible grid of a system for this frame, drawn as hairlines in the style of a
spec sheet. It shows the text-safe area as an outline, the system's columns, and a + mark at
each corner of the outline.

Rules this block enforces:
- The outline is the text-safe area: the area that text may use in this frame and system.
- The columns are the system's own: its column count and a gutter of 2.2 % of the short side.
  At 9:16 they fill the text-safe area, not the margins.
- Column lines cross the area that text uses. So they never stay under text: `columns: "ticks"`
  marks each gutter with short ticks outside the outline only, and `columnsUntil` fades the
  column lines out (the ticks stay) before text arrives.
- Every line draws on a curve that never overshoots. The outline draws first, then the columns
  from left to right, then the + marks appear one after another.
- At `until`, everything fades out. After that it stays hidden.

```ts
export type FrameGridProps = {
  id?: string;
  /** "lines": column lines across the area, with ticks outside it. "ticks": ticks only. "none". Default: "lines". */
  columns?: "lines" | "ticks" | "none";
  /** When the column lines fade out, to leave the area clear for text. The ticks stay. */
  columnsUntil?: number;
  /** The outline runs to the edges of the frame (default), or stops at the corners. */
  bleed?: boolean;
  /** + marks at the four corners of the outline. Default: true. */
  marks?: boolean;
  /** Default: "rule". */
  color?: ColorRole;
  at: number;
  until?: number;
};
```

### rows

**Rows that divide the text-safe area, with their guides drawn.**

- Suits: Spec, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/rows.ts`](../examples/scenes/rows.ts), 5 s, in Spec and Graphite: The three states of water on three rows that fill the text-safe area, with the row guides drawn.

Rows: a row grid for one frame. It divides the text-safe area into N rows from top to bottom, so a
scene uses the full height of the frame and not only its upper half.

Use rowBoxes() to lay out a scene; the `rows` block only draws the rows as faint guides, for debugging.

Rules this helper enforces:
- Every row is inside the text-safe area. At 9:16 a row that reaches below lowBandTop ends at
  lowBandRight, so text set in it passes textSafe.
- Each row has a bottom anchor: text set on it (atBottom) ends on the row's bottom edge, so the rows'
  contents line up on shared baselines from frame to frame.
- The guides are hairlines in the rule colour, with no text, so they never collide with the scene.

```ts
export type RowsProps = RowOptions & {
  id?: string;
  /** How many rows. */
  n: number;
  at: number;
  until?: number;
};
```

### rule

**A straight line: a hairline, a divider, a dimension line with ticks, an edge of a figure.**

- Suits: Ma, Nocturne.
- Works against: none named.
- Demo: [`examples/scenes/rule.ts`](../examples/scenes/rule.ts), 6.5 s, in Ma and Nocturne: A 3-4-5 right triangle.

Rule: a hairline from A to B that draws itself, at any angle. With `ticks`, it is a dimension
line: a short tick crosses each end.

Rules this block enforces:
- The width is the system stroke (or a multiple of it). The colour is a role: "rule" by default.
- A level or an upright line sits on the pixel grid for its width (context.crisp), so a hairline is sharp.
- The line draws from A to B on a curve that never overshoots. An overshoot would push the dash
  offset past its end and cut a gap into the start of the line.
- A hairline ends square; a line 4 px or wider ends round, so lines that meet at a corner join cleanly.
- Ticks are perpendicular to the line, centred on its ends, and draw at the faster entrance pace.
- In a one-frame system the line appears whole in one frame. `enter: "cut"` does that in any system (a match cut:
  the line is there on the cut's frame); `exit: "cut"` leaves in one frame.
- At `until`, the line fades out. After that it stays hidden.
- `layer` puts the line behind content (-1), in it (0, the default) or above it (1). See Base.layer.

```ts
export type RuleProps = {
  id?: string;
  x1: number; y1: number; x2: number; y2: number;
  /** Default: "rule" (a hairline). Use "ink" for a line that carries meaning. */
  color?: ColorRole;
  /** A multiple of the system stroke. Default: 1. */
  weight?: number;
  /** Dashes, for a construction line or a line that context alone explains. */
  dash?: boolean;
  /** Ticks across both ends: a dimension line. */
  ticks?: boolean;
  /** How long the line takes to draw: "move" (default) or the faster "enter". */
  pace?: "move" | "enter";
  /** How the line comes on: "draw" (default: it draws from A to B) or "cut" (whole, in one frame: a match cut). */
  enter?: "draw" | "cut";
  /** How it leaves at `until`: "fade" (default) or "cut" (one frame). */
  exit?: "fade" | "cut";
  /** The draw layer: -1 backdrop, 0 content (default), 1 overlay. */
  layer?: number;
  at: number;
  until?: number;
};
```

### curve

**A plain curve from a function or from points: a parabola, a trajectory, a cable traced on a photo.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/curve.ts`](../examples/scenes/curve.ts), 5 s, in Spec and Schematic: A cable's parabola, y = x², drawn over a measured span, with a callout on the curve and its sag as a dimension-free label.

Curve: a plain drawn curve, from a function or from points: a parabola, a trajectory, a cable, a profile. An agent's Spec
film built its parabola from raw path nodes because no block drew a plain curve (lineChart brings axes and a title,
arrow ends in a head).

Rules this block enforces:
- The line is the system's stroke (times `weight`), in a colour role ("ink" by default), with round ends. It draws from
  its first point to its last on a curve that never overshoots (`draw`), or shows whole in one frame (`enter: "cut"`,
  and always in a one-frame system).
- A function is sampled at 96 points over `domain` and mapped into `box` with y up: `range` is the value at the box's
  foot and at its top (default: the function's own least and greatest value over the domain). Points are frame px.
- The path is smooth: a Catmull-Rom spline through the samples, written as cubic Beziers.
- `curvePoints` gives the same points, for a callout's `points` (what its label keeps clear of) and its `target`.
- At `until` the line fades out (or cuts, `exit: "cut"`).

```ts
export type CurveProps = {
  id?: string;
  /** y = fn(x), sampled over `domain` and mapped into `box`. Give `fn` or `points`. */
  fn?: (x: number) => number;
  /** The x values of fn at the box's left and right edges. Default [0, 1]. */
  domain?: [number, number];
  /** The y values at the box's foot and top. Default: the least and greatest value of fn over the domain. */
  range?: [number, number];
  /** The box fn is drawn in, px. */
  box?: { x: number; y: number; w: number; h: number };
  /** Instead of fn: the points of the curve in frame px, in drawing order (a trace on a photo: photo's traceOn). */
  points?: [number, number][];
  /** Default "ink". */
  color?: ColorRole;
  /** A multiple of the system stroke. Default 1. */
  weight?: number;
  dash?: boolean;
  /** "draw" (default) or "cut": the whole curve in one frame. */
  enter?: "draw" | "cut";
  exit?: "fade" | "cut";
  /** How long it takes to draw: "move" (default) or the faster "enter". */
  pace?: "move" | "enter";
  layer?: number;
  at: number;
  until?: number;
};
```

### cross

**A + mark that registers a point: a corner, a centre, a target.**

- Suits: Mark, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/cross.ts`](../examples/scenes/cross.ts), 6.5 s, in Mark and Schematic: The centroid of a triangle.

Cross: a + registration mark, as printed where two grid lines meet.

Rules this block enforces:
- The mark is two strokes of the system stroke width, centred on (x, y). Its size is 24 px at a
  1080 px short side unless the caller sets it.
- A registration mark is printed, not animated: it appears whole in one frame, in every system.
- At `until`, it fades out. After that it stays hidden.
- `offset` moves the mark by [dx, dy] px: the misregistration of one ink against another (Riso).
  Draw one cross per ink, each with its own offset.

```ts
export type CrossProps = {
  id?: string;
  /** The centre of the mark, px. */
  x: number; y: number;
  /** The length of each arm, end to end, px. Default: 24 px at a 1080 px short side. */
  size?: number;
  /** Default: "ink". */
  color?: ColorRole;
  /** A multiple of the system stroke. Default: 1. */
  weight?: number;
  /** Misregistration in px, as [dx, dy]: the mark prints this far from (x, y). Default [0, 0]. */
  offset?: [number, number];
  at: number;
  until?: number;
};
```

### box

**A bordered box with a label: a memory cell, a table cell, a slot.**

- Suits: Raw, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/pointer.ts`](../examples/scenes/pointer.ts) (shared with arrow, camera), 8 s, in Raw and Schematic: A pointer, told with box, arrow and camera: a stack slot holds an address, the arrow follows it down to the heap, and the camera travels with it.

Box: an outlined rectangle that draws its own outline, with an optional fill and a label.
Use it for a region (a memory area, a zone, a group of things), a frame around a part, or a node.

Rules this block enforces:
- The outline is one path with the system stroke and corner radius. It draws from the top-left
  corner, clockwise, on a curve that never overshoots. `dash` makes it a dashed region.
- A fill, when given, fades in under the outline as the outline closes.
- A label sits inside the top-left corner, or above the box with `labelOutside`, and must fit:
  a label wider than the box is cut with an ellipsis and the block warns.
- The label passes the text-safe check; when it does not, the block warns.

```ts
export type BoxProps = {
  id?: string;
  x: number; y: number; w: number; h: number;
  stroke?: ColorRole;
  fill?: ColorRole;
  dash?: boolean;
  /** A heavier outline, for the key box. */
  key?: boolean;
  label?: string;
  labelRole?: TypeRole;
  labelColor?: ColorRole;
  labelOutside?: boolean;
  layer?: number;
  at: number;
  until?: number;
};
```

### steps

**A numbered list of 3 to 6 steps, one current at a time, with its progress.**

- Suits: Manual, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/steps.ts`](../examples/scenes/steps.ts), 13 s, in Manual and Graphite: Euclid's algorithm for the greatest common divisor of 252 and 105.

Steps: a numbered sequence of 3 to 6 steps. One step at a time is the current step.

Rules this block enforces:
- Each step has a number, a short title and an optional one-line detail.
- The current step is the key one. It shows at full strength and moves a short distance toward
  the reader's eye (right in a column, up in a row). The other steps stay quiet at lower opacity.
  So the key step does not rely on colour alone: position and contrast mark it too.
- A progress bar runs beside each step. Finished steps are full. The bar of the current step fills
  while that step holds, so the viewer sees how long the step lasts and how far the sequence has come.
- Steps advance on a schedule: the first becomes current after the list appears, then one every `hold` seconds.
- At 9:16 (a tall box) the steps form a column; at 16:9 (a wide box) they form a row.
- The block picks the largest pair of type roles that fits the box. Titles and details may wrap
  to two balanced lines. When nothing fits, the block drops the details and logs a warning.
- At 9:16, text below the low band ends before the platform buttons.
- Lines draw on a curve that never overshoots, so a stroke never runs past its end and back.

```ts
export type StepsProps = {
  id?: string;
  /** The block's box in px. The list fits inside it, centred on the cross axis. */
  x: number; y: number; w: number; h: number;
  /** 3 to 6 steps. */
  steps: { title: string; detail?: string }[];
  /** "column" (one step under another) or "row" (side by side). Default: row when the box is wider than tall. */
  layout?: "column" | "row";
  /** Seconds each step stays current. Default: a reading time from the system's density rules. */
  hold?: number;
  at: number;
  /** When the list starts to leave. */
  until?: number;
};
```

### split

**Two things side by side (or one over the other), point by point, with a verdict.**

- Suits: Pop, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/split.ts`](../examples/scenes/split.ts), 8 s, in Pop and Graphite: Sound against light.

Split: two options compared side by side (a wide box) or top and bottom (a tall box), with a divider.

Rules this block enforces:
- Each side has a heading and 2 to 4 points. The points are matched: point 1 of one side answers
  point 1 of the other side. Matched points appear together, as a pair, so the eye compares row by row.
- Side by side, a pair shares one row height, so matched points start on one line.
- The winning side is marked by more than colour: a tag with a word on it (for example "Faster"),
  a heavier rule under its heading, and the other side steps back to lower opacity.
- Text never runs over the divider: each side keeps a gutter on each side of it.
- The block picks the largest pair of type roles that fits. Points may wrap to two balanced lines.
  When nothing fits, the block uses the smallest roles and logs a warning.
- At 9:16, text below the low band ends before the platform buttons.
- Lines draw on a curve that never overshoots, so a stroke never runs past its end and back.

```ts
export type SplitProps = {
  id?: string;
  /** The block's box in px. Both sides fit inside it. */
  x: number; y: number; w: number; h: number;
  /** The first option: left side by side, top when stacked. */
  a: SplitSide;
  /** The second option: right side by side, bottom when stacked. */
  b: SplitSide;
  /** The side that wins. It gets the verdict tag and a heavy rule; the other side steps back. */
  winner?: "a" | "b";
  /** The word on the winner's tag, for example "Faster". Default: "Better". */
  verdict?: string;
  /** "columns" (side by side) or "stack" (top and bottom). Default: columns when the box is wider than tall. */
  layout?: "columns" | "stack";
  at: number;
  /** When the comparison starts to leave. */
  until?: number;
};
```

### matrix

**A small table of values or checks, with one key column.**

- Suits: Raw, Console.
- Works against: none named.
- Demo: [`examples/scenes/matrix.ts`](../examples/scenes/matrix.ts), 8 s, in Raw and Console: One byte (8 bits) written in three bases.

Matrix: a comparison table. Rows are the things compared on; columns are the options.

Rules this block enforces:
- A header row names the columns. A cell holds a check (true), a cross (false), a short value
  (a string) or nothing (null, drawn as a dash).
- Checks and crosses are different shapes, not only different colours.
- The key column is marked by more than colour: an outline encloses it, and its header is set in ink
  while the other headers are muted.
- Text fits its cell or wraps to two balanced lines. When text does not fit, the whole table steps
  down a type role. A word that does not fit in the smallest role is a content error: the block logs a warning.
- Columns get the width their content needs, up to about twice that; the row-label column takes
  one line when it can, at most 40 % of the box. A wide box does not stretch the table.
- Cells reveal by row (each row left to right) or by column (each column top to bottom).
- At 9:16, text below the low band ends before the platform buttons: the table narrows to that edge.
- Lines draw on a curve that never overshoots, so a stroke never runs past its end and back.
- A row's ink is centred in the row, not its line boxes (layout.centreInk): one-line texts of a row share one
  baseline, at the x-height band when any has lower case, else at the cap band.
- In a column, the header and every cell share one centre line exactly (the column's centre).

```ts
export type MatrixProps = {
  id?: string;
  /** The block's box in px. The title and the table fit inside it. */
  x: number; y: number; w: number; h: number;
  /** A short title that says what the table compares. */
  title?: string;
  /** Column headers, one per option. */
  columns: string[];
  /** One row per thing compared: a label and one cell per column. */
  rows: { label: string; cells: MatrixCell[] }[];
  /** The column that matters (an index into `columns`). */
  key?: number;
  /** Reveal order. Default: "row". */
  by?: "row" | "column";
  at: number;
  /** When the table starts to leave. */
  until?: number;
};
```

## Data

### lineChart

**One or more series over a continuous axis, with direct labels at their ends.**

- Suits: Spec, Graphite.
- Works against: Primary (Bauhaus shows with geometry, not with plotted data); Cutout (Cut paper does not plot data); Kinetic (Kinetic speaks in words, not charts); Courtside (A poster states, it does not plot).
- Demo: [`examples/scenes/lineChart.ts`](../examples/scenes/lineChart.ts), 6.5 s, in Spec and Graphite: $200 a month at 7 % a year, compounded monthly, deposits at each month's end.

Line chart: one key series and up to four context series over a shared x axis.

Chart rules this block enforces:
- A title is required. It names the measure and the unit.
- The y axis starts at zero unless `zero: false`; then the axis shows a break mark at its foot.
- The key series is the thickest line, drawn last, with a direct label. Context series are thin;
  series 4 and 5 are dashed, because their colour alone does not separate them from the ground.
- No legend: every series carries its own label at its end, so no reader matches colours.
- Labels place themselves: each tries several positions and takes the first that touches no line,
  no other label and no edge of the chart.
- Lines grow on a curve that never overshoots, so a line never passes its data on the way.
- The system draws the chart in its own hand (blocks/hand.ts): the weight of the key and context lines, the value
  scale (hairline rules, short ticks at the axis, or the labels alone: no gridlines unless the system's charts have
  them) and the mark on the last point (a dot, an open ring, a square). End labels try first to sit over the end of
  their line, right-aligned to it, so the plot keeps its width.
- The lines draw as one gesture: the series carry the group `<id>-lines`, the scale `<id>-scale`.

```ts
export type LineChartProps = {
  id?: string;
  /** The chart's box in px: title, axes, labels and plot all fit inside it. */
  x: number; y: number; w: number; h: number;
  title: string;
  /** X-axis labels; one per data point. */
  xLabels: string[];
  /** Print every nth x label (the last one always prints). Default: as many as fit. */
  xEvery?: number;
  series: { label: string; values: number[] }[];
  /** Which series matters (default 0). It gets series1 and the heavy stroke. */
  key?: number;
  zero?: boolean;
  ticks?: number;
  format?: Format;
  /** A point on the key series to call out: its index and a short label. */
  callout?: { index: number; label: string };
  /** Reference values: a hairline across the plot in the rule colour, labelled with its value. Off by default. */
  guides?: number[];
  at: number;
  until?: number;
};
```

### barChart

**One value per category (or a small group), every bar labelled with its value.**

- Suits: Spec, Console.
- Works against: Keynote (A keynote states one number, not a chart); Graphite (A product film shows the product working, not a chart); Noir (A noir title has no chart); Nocturne (The statement is the image).
- Demo: [`examples/scenes/barChart.ts`](../examples/scenes/barChart.ts), 5 s, in Spec and Console: How long money takes to double at each annual return, compounded once a year.

Bar chart: one value per category, or a small group of values per category (grouped bars).

Chart rules this block enforces:
- A title is required. It names the measure and the unit.
- Bars start at zero. With `base`, the axis starts at that value instead, and the baseline and every
  bar show a break mark, so the reader sees that the bars are cut.
- Every bar carries its value as a direct label, at the bar end. A key bar can carry its label inside
  its fill (in `onAccent`) when that gives the bars more room. When the labels cannot fit, the block
  labels only the key series and shows a value axis with ticks instead.
- A bar too small to see gets a minimum visible length, and it always prints its value.
- One edge: in columns, a category label and its value label whose left edges would sit a few px apart share
  one left edge. Values on a bar are centred on it by their ink (layout.centreInk), not their line box.
- The key is marked by more than colour. One series: the key bar is the only accent fill, its value is
  set larger and in ink, and its category label is in ink. Grouped: the key series bars are full width
  and the context series bars are narrower; the key's values are in ink, the third series is an outline.
- Category labels never rotate. They take one line or two. When they cannot fit under vertical bars,
  the chart turns horizontal, also when the caller asked for vertical bars.
- Bars grow one after another on a curve that never overshoots, so no bar passes its value.
- The block tries its layouts in order of preference. It keeps the first one in which no text
  overlaps other text or a mark, and every text box passes `textSafe`.
- The system draws the bars in its own hand (blocks/hand.ts): fill, outline, overprinted inks or cells; its bar
  ends, its baseline weight, its value roles and a measured ruler where the system measures.
- `from: "top"` (vertical bars, for a 9:16 frame): the bars hang from a rail at the top, under a row of category
  labels and a row of values, and grow down to the foot of the box. Every label stays in the text-safe area at
  the top, so the bars may run down into the lower band, where the platform allows marks but no text. The values
  then sit in one row and read as a table; each bar starts under its own label.

```ts
export type BarChartProps = {
  id?: string;
  /** The chart's box in px: title, labels and bars all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit, for example "Surface gravity, m/s²". */
  title: string;
  categories: string[];
  /** One series for a plain bar chart. Two or three series for grouped bars. Values line up with `categories`. */
  series: { label: string; values: number[] }[];
  /** One series: the index of the key category (default: none, so no bar is the key). Grouped: the index of the key series (default 0). */
  key?: number;
  /** "auto" (default) prefers vertical bars and turns horizontal when the labels do not fit. */
  orientation?: "auto" | "vertical" | "horizontal";
  /** The value where the axis starts, when it is not zero. Every value must be above it. The axis shows a break. */
  base?: number;
  format?: Format;
  /**
   * The edge vertical bars grow from. "bottom" (default): from a baseline at the foot. "top": they hang from a rail
   * under the labels and grow down to the box's foot, which may be in the 9:16 lower band (marks only). Give a box
   * that reaches the picture-safe foot (lineAndBlock's `graphic`).
   */
  from?: "bottom" | "top";
  at: number;
  until?: number;
};
```

### bar

**One bar for one value, with its label: a quantity on its own.**

- Suits: Spec, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/bar.ts`](../examples/scenes/bar.ts), 6 s, in Spec and Graphite: How many days each inner planet takes to go round the Sun (88, 225, 365, 687).

Bar: one solid bar that grows from its base to its value, with the value printed by it.

Rules this block enforces:
- The box is the bar at full scale: a bar for `max` fills it. The bar starts at zero, at the
  left edge (axis "x") or the bottom edge (axis "y").
- The bar grows on a curve that never overshoots (ctx.noOvershoot), so it never passes its value.
- A bar too small to see keeps a minimum visible length, and its value is still printed.
- The value label goes inside the bar, at its base, when it fits with a pad on each side and its
  colour has 4.5:1 contrast with the fill (onAccent first, then ink, then ground). Otherwise it
  goes past the bar's end. A label that fits neither way steps down a type size; only then is
  it left out (with a warning). The label never overlaps the bar edge and never leaves the box
  or the text-safe area.
- A label inside the bar appears when the bar stops, and only fades in (no rise), so nothing
  moves under it or within it. A label past the
  end appears as the bar settles, so it never sits beyond a bar that is still far from its end.
- At `until`, the bar and its label fade out. After that they stay hidden.

```ts
export type BarProps = {
  id?: string;
  /** The bar at full scale, px. Axis "x": the bar is h thick and grows right. Axis "y": w thick, grows up. */
  x: number; y: number; w: number; h: number;
  axis?: "x" | "y";
  value: number;
  /** The value that fills the box. Bars that share a scale share a max. Default: the value. */
  max?: number;
  /** Default: "series1", the series that matters. */
  fill?: ColorRole;
  /** The printed value. Default: the value with `format`. `false` prints nothing. */
  label?: string | false;
  format?: Format;
  /** The label's type role. Default: the largest of headline, body and label that fits the bar's thickness. */
  labelRole?: TypeRole;
  at: number;
  until?: number;
};
```

### slopeChart

**How each item changed between two states, as lines from left to right.**

- Suits: Manual, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/slopeChart.ts`](../examples/scenes/slopeChart.ts), 8 s, in Manual and Graphite: Hours of daylight on the June and the December solstice, by latitude.

Slope chart: a before and an after value for several items, on two vertical axes, joined by lines.
Use it when the change for each item, and how the items swap order, is the story.

Rules this block enforces:
- A title is required. It names the measure and the unit. A header over each axis names the two moments.
- Both axes share one scale, so the slope of each line is the size of its change.
- Every end carries a direct label with its value. When the width is short, the name prints on the
  right side only, and the left side prints the value only.
- Labels never collide. On each side they sort by height and stack apart by one line height; a stack
  stays centred on its anchors and inside the plot. A label that moves away from its point gets a
  leader line in the gutter between the axis and the labels, so a leader never crosses a slope.
- The key item is heavy: a thick line in the key colour, larger dots, and its labels in ink. The other
  lines are thin and quiet. So the key reads without colour.
- Lines draw from left to right on a curve that never overshoots.
- The block checks its own layout: no text overlaps text or a mark, and every text box passes textSafe.

```ts
export type SlopeChartProps = {
  id?: string;
  /** The block's box in px: title, headers, labels and lines all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit, for example "Hours of daylight, by latitude". */
  title: string;
  /** The headers over the left and the right axis, for example "2015" and "2025". */
  fromLabel: string;
  toLabel: string;
  items: { label: string; from: number; to: number }[];
  /** The index of the key item. */
  key?: number;
  format?: Format;
  at: number;
  until?: number;
};
```

### dumbbell

**A range or a change for each row: two dots on one line.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/dumbbell.ts`](../examples/scenes/dumbbell.ts), 8 s, in Spec and Schematic: The temperatures at which common substances melt and boil at sea-level pressure.

Dumbbell: two values per row, a start and an end, shown as two dots joined by a line on one shared axis.
Use it for a before/after change per row, or for a range (low to high) per row.

Rules this block enforces:
- A title is required. It names the measure and the unit.
- Position, not length, carries each value, so the axis need not start at zero. The shared axis at
  the foot of the rows shows round ticks.
- The direction of change reads without colour: the start is a hollow ring and the end is a filled dot,
  the line draws from the start to the end, and a key under the title names both ends.
- Rows are sorted (by the end value, high to low, unless the caller asks otherwise).
- Every dot prints its value on its outer side, away from the other dot, so the two labels never meet.
  When the two values are equal, the row shows one dot and one label.
- The key row is marked by more than colour: a heavier line, larger dots, and its label and values in ink.
- The scale makes room for the widest value labels at both ends of every row; at 9:16 it keeps the
  right labels inside the narrow low band. Long row labels wrap to two lines or move above the row.
- The block checks its own layout: no text overlaps text or a mark, and every text box passes textSafe.

```ts
export type DumbbellProps = {
  id?: string;
  /** The block's box in px: title, key, rows and axis all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit, for example "Liquid range at sea-level pressure, °C". */
  title: string;
  rows: { label: string; from: number; to: number }[];
  /** What the start and the end mean, for the key: "Melts" and "Boils", or "2015" and "2025". */
  fromLabel: string;
  toLabel: string;
  /** Row order. "to" (default) and "from" sort by that value, high to low; "change" by to - from; "none" keeps the given order. */
  sort?: "to" | "from" | "change" | "none";
  /** The index of the key row in `rows` as given (before sorting). */
  key?: number;
  format?: Format;
  at: number;
  until?: number;
};
```

### areaChart

**A total that grows over time, as a filled area, with an optional second area.**

- Suits: Riso, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/areaChart.ts`](../examples/scenes/areaChart.ts), 5.5 s, in Riso and Graphite: What a 30-year home loan costs, year by year.

Area chart: a cumulative quantity over time, drawn as a flat filled area under its top line.
An optional second area gives context for comparison.

Chart rules this block enforces:
- A title is required. It names the measure and the unit.
- The y axis always starts at zero. An area shows a total, so a cut axis would lie about it.
- The fill is flat: one colour at one opacity. Never a gradient.
- The key area has a thick top line, an end dot and an end label with its final value.
  The context area is quieter: an opaque series5 fill behind the key area and a thin muted line.
  The context line draws above the key fill, so the reader can always see it.
- No legend: each area carries its own end label, with its value and its name.
- End labels place themselves. They touch no line, no gridline, no fill, no other label and
  no edge.
  When no free spot exists, the block keeps a gutter right of the plot and lays out again.
- At 9:16 every text box passes textSafe, including the x labels in the low band.
- The area reveals from left to right. The fill is cut into thin vertical strips, one strip for
  each frame of the reveal. Each strip steps on in one frame, so the fill front moves like a wipe.
  The top line draws with the fill front on a linear draw track, so line and fill always agree.
- The front moves on ctx.noOvershoot("move"), so the reveal never passes the data and comes back.
- In a one-frame system (ctx.instant), the whole area appears in one frame.
- The system draws the chart in its own hand (blocks/hand.ts): line weights, the value scale (rules, ticks at the
  axis, or labels alone) and the end mark. An end label may sit on the area it names (it labels that area), never
  on a line: so the plot keeps its full width and gives up no gutter while a spot over the end or inside the area
  is free. End labels try first to sit over the end of their line, right-aligned to it.

```ts
export type AreaChartProps = {
  id?: string;
  /** The chart's box in px. The title, the axes, the labels and the plot all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit. */
  title: string;
  /** X-axis labels, one for each data point. */
  xLabels: string[];
  /** Print every nth x label. The last label always prints. Default: as many as fit. */
  xEvery?: number;
  /** One area, or two areas for a comparison. Values must not be negative. */
  series: { label: string; values: number[] }[];
  /** Which series matters (default 0). It gets series1, the thick line and the end dot. */
  key?: number;
  ticks?: number;
  /** The format of the y labels. */
  format?: Format;
  /** The format of the end values. Default: `format`. */
  endFormat?: Format;
  /** Reference values: a hairline across the plot in the rule colour, labelled with its value. Off by default. */
  guides?: number[];
  at: number;
  until?: number;
};
```

### stackedBar

**How a whole splits into parts, for one or a few rows.**

- Suits: Pop, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/stackedBar.ts`](../examples/scenes/stackedBar.ts), 7 s, in Pop and Graphite: What a $300,000 home really costs, on a 30-year and a 15-year loan.

Stacked bar: a 100 % bar that splits a whole into its parts. Several bars, one per row, compare
the same parts across groups. It is the part-to-whole device of the system: no pie, no donut.

Chart rules this block enforces:
- A title is required. It names the whole and the unit (a share, in %).
- Each row is exactly 100 % wide. The printed percentages use largest-remainder rounding, so
  they add up to 100 in every row. A share that rounds to zero prints as "<1 %".
- A segment too thin to see gets a minimum visible width. The width comes from the larger
  segments, so the bar stays 100 % wide, and the segment still prints its value.
- A hairline track shows the full 100 % before the segments fill it, so a quiet end segment
  never makes the bar look short.
- The key part is marked by more than colour: its segment is taller than the bar, its leader
  is ink, and its name is in ink when its label sits outside. All percentages share one size, so
  rows compare at a glance.
- Context parts use one or two quiet neutral roles. Gaps of ground colour separate neighbours,
  and every segment carries a direct label, so no reader has to match colours to a legend.
- A label sits inside its segment when it fits. Otherwise it sits below (or above) the bar with
  a leader line to its segment: straight when it can be, an elbow when it must step aside.
  Labels touch no other label, and a leader crosses no label and no other leader. Every label
  passes textSafe, including the 9:16 low band.
- When the rows do not fit the box, the block makes room first (tighter padding, then thinner
  bars). It leaves a label out only as the last step, and it warns when it does.
- In a comparison, the first row names each part; later rows print only the percentages.
- Segments grow from left to right, one after another, on ctx.noOvershoot("enter"). A segment
  never grows past its share and comes back. Each segment takes time in proportion to its share,
  so the whole bar fills in about the same time, whatever the number of parts.

```ts
export type StackedBarProps = {
  id?: string;
  /** The block's box in px. The title, the bars and every label fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the whole and the unit, for example "Energy use by source, % of total". */
  title: string;
  /** The names of the parts, in order from left to right. */
  parts: string[];
  /** One bar per row. Each row gives one value per part, in any unit; the block turns them into shares. */
  rows: { label?: string; values: number[] }[];
  /** The part that matters (an index into `parts`). Default: none. */
  key?: number;
  /** Decimal places of the printed percentages (default 0). */
  decimals?: number;
  /** The height of each bar in px. Default: room for a percentage and a name inside. */
  barHeight?: number;
  at: number;
  until?: number;
};
```

### waffle

**A share of a whole as a grid of squares: 51 in 100.**

- Suits: Pop, Console.
- Works against: none named.
- Demo: [`examples/scenes/waffle.ts`](../examples/scenes/waffle.ts), 7 s, in Pop and Console: The birthday problem.

Waffle: a unit chart. A grid of equal squares, where each square is one thing (a person, a room,
a roll of the dice). The squares of the key group fill in reading order to show a share or a count.
A large number and a short sentence say what the filled squares mean. It suits "1 in N" stories.

Rules this block enforces:
- A title is required. It names what one grid counts.
- The grid shape comes from the total: up to 12 units sit in one row, a square number makes a
  square grid, and other totals get the nearest square grid with a short last row.
- The key group is marked by more than colour: its squares are solid series1, and the other
  squares are hollow outlines. The large number is set in accentText.
- Every square is the same size, with the same gap, so the count reads true.
- Squares fill one after another on ctx.noOvershoot("enter"): a square never grows past its size
  and comes back. The whole fill takes at most two move durations, however many squares fill.
- The large number and its sentence land after the fill ends.
- Every text box passes textSafe. At 9:16 the number, the sentence and the unit note sit above
  the grid, so the grid can reach into the low band, where only graphics may go. In a wide box
  they sit beside it. A line that still fails textSafe is reported with console.warn.
- In a one-frame system (ctx.instant), each square appears in one frame.

```ts
export type WaffleProps = {
  id?: string;
  /** The block's box in px. The title, the grid and all text fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names what the grid counts, for example "100 rooms of 23 people". */
  title: string;
  /** How many units the grid holds. */
  total: number;
  /** How many units are in the key group. A fraction is rounded to the nearest unit. */
  filled: number;
  /** Units in one row. Default: from the total. */
  cols?: number;
  /** The large number. Default: the filled count and the total, as "72 in 100". */
  stat?: string;
  /** One short sentence that says what the filled units mean. */
  label: string;
  /** What one unit is, for example "Each square is one room". Optional. */
  unit?: string;
  at: number;
  until?: number;
};
```

### counter

**A number that counts up to its value, digit by digit, with tabular figures.**

- Suits: Console, Kinetic, Raw.
- Works against: Pop (Rolling digits fade under 0.5 opacity; show the quantity as a meter).
- Demo: [`examples/scenes/counter.ts`](../examples/scenes/counter.ts), 6 s, in Raw and Console: The seconds in one year, 365 x 86,400 = 31,536,000, counted up from zero.

Counter: a number that rolls up to its value, like an odometer.

The node model has no text that changes per frame. So each digit place is a column of masked text
nodes, one per digit, and the block moves them with `reveal` tracks. A digit enters from below its
mask and leaves above it, so every column turns upward.

Rules this block enforces:
- It counts up only. A target below the start does not roll: the block warns and shows the target.
  A negative value does not roll either; the block shows it still (rule 7: count only what grows).
- It never overshoots. Every column turns one way and lands on its target digit on the last key.
  The roll uses ctx.noOvershoot("move"); in a system whose curves overshoot, that is linear.
- Places that change slowly turn like a true odometer: a place turns over while the place to its
  right turns from 9 to 0. Places that would change more than 15 times in the roll spin instead:
  each spins at least 1.3 times as fast as the place to its left, so no two places show the same
  digit in step. They land one after another from the right, each before the place to its left
  turns to its last digit. The slow places always read true, so the leading digits
  never read above the target.
- A place that moves more than half a digit in one frame shows whole digits only (no half digit
  frozen in a frame). It rolls smoothly again as it slows down to land.
- Fixed width: every digit place has the width of the widest digit, and each digit is centred in it.
  Nothing reflows. Separators, the prefix and the suffix never move.
- The box holds the whole mask (the line box plus the mask pads above and below), so a rolling digit
  never shows over a neighbour of the block.
- Leading zeros: by default they show in muted ink, as on an odometer (`lead: "zeros"`). With
  `lead: "blank"` they do not show, and the number grows to the left inside its fixed width.
- Size: the largest of display, headline and body that fits the box and the text-safe area. When
  body does not fit, the last resort is the compact form (1.28M) with two decimals, rounded down.
  When that also does not fit, the block warns and draws at body size.
- One-frame systems (ctx.instant): the final value appears in one frame. Nothing rolls.
- The figures' ink (from the baseline to the figure height, layout.inkBand) is centred in the box, not their
  line box: figures have no descender, so a line box puts them high.
- Text hidden by its mask also has opacity 0, so no hidden digit counts as text on screen.
- Only the start value and the landed value read as text. A digit in flight shows dimmed (DIM): it
  is motion, not something to read. Each place brightens as it lands, so the result reads at once.
- The roll starts on the counter's entrance frame (`rollAt`, default `at`): a counter never sits on "0" before it
  rolls, because a still "0" reads as a fault. Give `rollAt` to hold the start value on purpose.
- `until` is honoured: the counter starts to leave at `until`, never later. A roll that would end after `until`
  is shortened to end on it; when that leaves under 0.2 s of roll, the block throws and names the earliest `until`.
- The digit columns enter as one gesture: every node carries the group `<id>-digits`, so the motion checks count
  the counter as one mover.

```ts
export type CounterProps = {
  id?: string;
  /** The box in px. The number sits inside it, centred vertically. */
  x: number; y: number; w: number; h: number;
  /** The target. The roll ends exactly here. */
  value: number;
  /** Where the roll starts (default 0). It must not be above `value`. */
  from?: number;
  format?: CounterFormat;
  /** A fixed type role. Default: the largest of display, headline and body that fits. */
  role?: TypeRole;
  color?: ColorRole;
  align?: "left" | "center" | "right";
  lead?: "zeros" | "blank";
  /** When the roll starts, in seconds. Default: the entrance frame (frameOf(at)). A later time holds the start value until then. */
  rollAt?: number;
  at: number;
  until?: number;
};
```

### bigStat

**One large figure with its label and its change: the number the film is about.**

- Suits: Studio, Spec, Keynote.
- Works against: none named.
- Demo: [`examples/scenes/bigStat.ts`](../examples/scenes/bigStat.ts), 6 s, in Spec and Keynote: Two figures from the fictional cast.

Big stat: one large number, the label that says what it counts, and an optional change.

Rules this block enforces:
- The number takes the largest role (display, headline, body) that fits the box beside its label
  and its change line. It never scales: it steps down a role, and last of all the counter's
  compact form (1.28M) takes over.
- The label wraps to two lines when it is wider than the box.
- A change shows its direction three ways: a sign (+ or −), a word (up, down, no change) and a
  drawn triangle. The triangle's colour (positive or negative) is extra, never the only signal.
  `good` says which direction is good, so a fall in waiting time can show as positive.
- Counting is opt-in (`count`) and only for quantities that grow (rule 7). The roll is the counter
  block: it only counts up, never overshoots, and lands exactly on the value. The change line
  appears when the number lands, because it describes the final value.
- Every text box passes textSafe. Nothing in the block overlaps.

```ts
export type BigStatProps = {
  id?: string;
  x: number; y: number; w: number; h: number;
  value: number;
  format?: CounterFormat;
  /** What the number counts, with its unit when the number has none. */
  label: string;
  /** The change against an earlier value. `context` follows the word: "on 2025". */
  delta?: { value: number; format?: Format; context?: string; good?: "up" | "down" };
  /** Roll the number up as a counter, from `from` (default 0). Only for quantities that grow. */
  count?: boolean | { from?: number };
  align?: "left" | "center";
  /** A fixed role for the number. Default: the largest that fits. Stats set side by side should share
   *  one role: take the smallest `bigStatRole` of the group. */
  role?: TypeRole;
  at: number;
  until?: number;
};
```

### meter

**A quantity against its target, as a bar or a ring.**

- Suits: Pop, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/meter.ts`](../examples/scenes/meter.ts), 6 s, in Pop and Graphite: The meter scene, from the fictional cast.

Meter: progress toward a target, as a bar or as a ring.

Rules this block enforces:
- A title is required. It names the measure and the unit.
- The fill is a stroked path with butt caps that ends exactly at the value. A round cap would
  draw half a stroke past the value. It grows on ctx.noOvershoot("move"), so it never passes the
  value on the way, also in systems whose curves overshoot.
- The target is a drawn tick across the track, with its own label ("Target 10,000"). The current
  value is printed above the bar (or inside the ring). The two labels sit on opposite sides of the
  track, so they cannot collide however close the value is to the target.
- The scale runs from zero to `max` (default: the larger of the target and the value). A value
  above the target extends the scale, so the fill passes the tick and the tick stays in view.
- A value too small to see gets a minimum visible fill; its value is printed in full anyway.
- With `count`, the printed value rolls up as a counter on the same start, length and curve as the
  fill, so the number and the fill always agree. Use it only for quantities that grow (rule 7).
- The ring sizes itself so the ring, its target label and the title fit the box, and the value fits
  inside the ring. The share of the target ("72 % of goal") goes under the value only when it fits.
  Every text box passes textSafe.

```ts
export type MeterProps = {
  id?: string;
  x: number; y: number; w: number; h: number;
  title: string;
  value: number;
  target: number;
  /** The end of the scale. Default: the larger of the target and the value. */
  max?: number;
  format?: CounterFormat;
  /** The word before the target value (default "Target"). */
  targetLabel?: string;
  shape?: "bar" | "ring";
  /** Fill in the accent (default true). Set false for every meter but one when a frame holds several,
   *  since systems such as Graphite allow one accent element per frame. Then the fill is ink. */
  accent?: boolean;
  count?: boolean;
  at: number;
  until?: number;
};
```

### ranking

**Items ranked by a value, and how the order changes between two states.**

- Suits: Mark, Courtside.
- Works against: none named.
- Demo: [`examples/scenes/ranking.ts`](../examples/scenes/ranking.ts), 8 s, in Mark and Courtside: What $1,000 grows to under five plans, after 1 year and after 30 years.

Ranking: a ranked list (rank, label, value bar, value) that re-orders from one state to a second.

Rules this block enforces:
- A title is required. It names the measure and the unit. The two states have names, shown under
  the title; the name rolls over when the rows move.
- Rank numbers belong to the slots and never move. Rows move between slots with `y` tracks.
- No overlap during the move. The rows that keep their order relative to each other (the longest
  such set that holds the key row) travel together on one start, one length and one curve that
  never overshoots. Rows on that curve keep at least one row height apart, so they never touch.
  Every other row fades out before the move, travels while hidden, and fades in at its new slot
  after the move ends. In one-frame systems all rows jump in one frame.
- Bars start at zero on one scale shared by both states, so a bar never shrinks while its value
  grows. A bar too small to see gets a minimum length; its value is printed anyway.
- Bars grow and change on ctx.noOvershoot("move"). Values swap by rolling: up when they grow,
  down when they fall.
- The key row is marked three ways: a drawn ink marker at its left edge, ink text (other rows are
  muted) and the accent bar (other bars are muted ink). The marker is ink, not accent, so the row
  holds one accent element, as Graphite asks.
- Rows fit the box: label, bar and value on one line when the bar keeps at least 30 % of the width;
  otherwise the bar goes on a second line under the label and the value, and a label too wide for
  its column wraps, word by word, onto as many as three lines.

```ts
export type RankingProps = {
  id?: string;
  x: number; y: number; w: number; h: number;
  title: string;
  /** The names of the two states, for example ["After 1 year", "After 30 years"]. */
  states: [string, string];
  rows: { label: string; before: number; after: number }[];
  /** The index (in `rows`) of the row that matters. */
  key?: number;
  format?: Format;
  at: number;
  /** When the rows move to the second state. Default: 1.6 s after the list has built. */
  moveAt?: number;
  until?: number;
};
```

### numberLine

**Values placed on one axis (linear or log), each with a marker and a label.**

- Suits: Spec, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/numberLine.ts`](../examples/scenes/numberLine.ts), 9 s, in Spec and Graphite: How long a signal takes to cross a distance, one way, on a log scale.

Number line: a scale with ticks, markers that slide to their values, and ranges as spans.
Use it to compare magnitudes: 0.5 ms against 130 ms against 1,300 ms on a log scale.

Rules this block enforces:
- A title is required. It names the measure and the unit.
- The scale is linear or logarithmic. A log scale shows its decades as major ticks and the values
  2 to 9 of each decade as short minor ticks, so the uneven spacing tells the reader it is a log scale.
  A log scale rejects values at or below zero.
- Markers slide to their values on a curve that never overshoots, so a marker never passes its value.
  A marker's label appears only after the marker lands, so no text moves across other text.
- Labels place themselves. In a wide box, they stack in tiers above and below the axis and take the
  nearest free spot. In a tall box, the axis is vertical and labels form rows to its right, pushed
  apart where values are close. A label that has no room first wraps to two lines; only then is it
  dropped, with a warning.
- Values print as text. They never count up.
- The key marker is larger, filled and labelled in ink. The others are hollow, with muted names.
  Size, fill and weight mark the key marker, so colour never carries the meaning alone.

This file also holds the axis engine that the timeline block uses: label sizes, tier placement,
row placement and the overlap check.

```ts
export type NumberLineProps = {
  id?: string;
  /** The block's box in px: title, axis and labels all fit inside it. */
  x: number; y: number; w: number; h: number;
  /** Names the measure and the unit, for example "Light travel time, milliseconds (log scale)". */
  title: string;
  min: number; max: number;
  scale?: "linear" | "log";
  /** Major ticks. Default: each power of ten (log), or about five round steps (linear). */
  ticks?: number[];
  /** Format of the tick labels. Default: plain numbers with as many decimals as the tick needs. */
  tickFormat?: Format;
  /** Format of marker values, when a marker has no `valueLabel`. */
  format?: Format;
  /** Default "auto": horizontal in a wide box, vertical in a tall one. */
  orientation?: "auto" | "horizontal" | "vertical";
  /** Points on the scale. Each slides from `from` (default: the scale's minimum) to `value`. */
  markers: { value: number; label: string; valueLabel?: string; key?: boolean; at: number; from?: number }[];
  /** Spans on the scale, drawn as a thick band over the axis. */
  ranges?: { from: number; to: number; label: string; valueLabel?: string; at: number }[];
  at: number;
  until?: number;
};
```

### timeline

**Dated events on one axis, one of them the key event.**

- Suits: Mark, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/timeline.ts`](../examples/scenes/timeline.ts), 9 s, in Mark and Graphite: Milestones of the telephone, 1876 to 1991.

Timeline: dated events along an axis, eras as spans, and a "now" marker that sweeps through time.
Horizontal in a wide box (16:9), vertical in a tall one (9:16).

Rules this block enforces:
- A title is required. It names what the events are and the unit of the axis (years).
- Each part has its own lane, so nothing moves over text. Events sit in tiers above and below a
  horizontal axis, or in rows right of a vertical one. Era spans sit on the axis, and their labels
  have a lane of their own: under a horizontal axis, left of a vertical one. The now marker crosses
  only the axis and the event dots.
- Labels place themselves with the number-line engine. Close events alternate sides, then take the
  next free tier, or push their rows apart. A label wraps to two lines before it is left out; an
  event without room is left out whole, with a warning.
- Below the low band at 9:16, rows end by the band's right edge (textSafe at each row's own height).
- Events appear when the now marker reaches them. The marker moves at constant speed, as time does.
  In a one-frame system, it jumps from event to event.
- The key event has a larger, filled dot and an ink label. The others are hollow, with muted text.
  Size, fill and weight mark it, so colour never carries the meaning alone.

```ts
export type TimelineProps = {
  id?: string;
  /** The block's box in px: title, axis and labels all fit inside it. */
  x: number; y: number; w: number; h: number;
  title: string;
  /** The axis range, in years (fractions allowed). */
  from: number; to: number;
  /** `when` is the event's year. `date` is the printed date (default: the year). `at` overrides when it appears. */
  events: { when: number; date?: string; label: string; key?: boolean; at?: number }[];
  /** Spans of years, each with a short label. */
  eras?: { from: number; to: number; label: string }[];
  /**
   * The now marker sweeps from `from` to `to` (default: the axis range), starting at `at`, over `seconds`.
   * It leaves when the sweep ends, unless `stay` is true.
   */
  now?: { at: number; seconds: number; from?: number; to?: number; stay?: boolean };
  /** Default "auto": horizontal in a wide box, vertical in a tall one. */
  orientation?: "auto" | "horizontal" | "vertical";
  at: number;
  until?: number;
};
```

### waveform

**Signals as lanes of waves, and their sum: sound, noise, light.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/waveform.ts`](../examples/scenes/waveform.ts), 9 s, in Spec and Schematic: How noise cancelling works.

Waveform: waves drawn as lines in stacked lanes, for sound, signals and superposition.

A lane is a sum of sines, the inverse of another lane, or the sum of other lanes. The block computes
every lane point by point, so a sum lane is always the true sum of its parts. This shows
interference and noise cancellation: a wave, its inverse, and their sum that flattens to a line.

How waves move. The node model has transforms only, and a path has no clip. A translated path
leaves the box, and a scaled path thins its stroke (a flat line at scaleY 0 has no height).
So the block draws a flip book: it computes the exact path for every frame at 30 fps and keeps one
path node per distinct shape. Each node is visible only on its own frames (opacity steps at half
frames, so exactly one shape shows at any sample time). A travelling wave repeats, so its frames
share nodes. The stroke weight never changes and nothing leaves the box.

Rules this block enforces:
- A title is required. It names what the lanes show.
- All lanes share one amplitude scale, so a sum that doubles looks twice as tall. The scale comes
  from the largest value in any frame, so no wave leaves its lane.
- The key lane has the heaviest stroke and an ink label. Other lanes are thinner, with muted labels.
  Weight and a direct label mark the key lane, so colour never carries the meaning alone.
- Each lane label sits in its own row above the wave area. No wave can reach a label.
- A change of amplitude (gain) uses a curve that never overshoots: an amplitude is a value.
- In a one-frame system, waves do not travel and gains change in one frame.

```ts
export type WaveformProps = {
  id?: string;
  /** The block's box in px: title, lanes and labels all fit inside it. */
  x: number; y: number; w: number; h: number;
  title: string;
  lanes: WaveLane[];
  /**
   * Waves travel to the right. `speed` is in wavelengths of the longest part per second. With every
   * `k` a multiple of the smallest `k`, the shape repeats after one such wavelength. `until` is when
   * the travel starts to stop (a constant deceleration over the system's move duration).
   */
  travel?: { speed: number; until: number };
  /** A short label under the last lane, at the right, for the horizontal axis. */
  xLabel?: string;
  at: number;
  until?: number;
};
```

## Diagrams

### flow

**Boxes joined by arrows, with packets that travel along a path: how a system works.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/flow.ts`](../examples/scenes/flow.ts), 14 s, in Spec and Schematic: How a CDN edge cache serves a file.

Flow: boxes joined by arrows, and packets that travel along the arrows to show data moving.
Use it for a system: a browser, a cache and a server; a pipeline; who sends what to whom.

Rules this block enforces:
- Every node has the same size, set from its measured label. A long label wraps to two lines. The label's ink
  (not its line box) is centred in the node (layout.centreInkLines).
- Edges run straight or at right angles in the channels between nodes. A route that passes
  through another node is rejected. Two edges never share a line: they get separate ports.
- The layout is a grid of columns and rows. When the box is taller than it is wide, the grid
  turns: columns become rows, so the diagram stacks vertically at 9:16.
- A packet is a dot with x and y tracks. The edge it travels lights in the accent at a heavier
  weight, in step with the dot. The node it reaches lights: an accent fill and onAccent text.
  Weight and fill mark the key path, so it reads where the accent equals the ink (Spec).
- Edge labels place themselves clear of every node, line and other label.
- Every text box passes textSafe. When one does not, the block narrows its layout and tries again.
- In a one-frame system there is no dot: the edge and the node light in the frame the packet arrives.

This file also holds the helpers that the other diagram blocks (sequence, tree, cycle) share:
balanced word wrap, arrowheads, rounded right-angle paths, opacity keys, the node box and a
final geometry audit.

```ts
export type FlowProps = {
  id?: string;
  /** The block's box in px: title, caption, nodes, lines and labels stay inside it. */
  x: number; y: number; w: number; h: number;
  title?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  packets?: FlowPacket[];
  /** "auto" (default): turn the grid when the box is taller than wide, so columns stack; if that
   *  cannot fit, keep it. "always" and "never" force one. */
  turn?: "auto" | "never" | "always";
  at: number;
  until?: number;
};
```

### sequence

**Messages between actors over time, in order: a protocol, a conversation.**

- Suits: Manual, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/sequence.ts`](../examples/scenes/sequence.ts), 13.5 s, in Manual and Graphite: The TLS 1.3 full handshake, as RFC 8446 (section 2, figure 1) draws it.

Sequence: who sends what to whom, in time order. Actors stand across the top; a lifeline runs down
from each; every message is an arrow from one lifeline to another, numbered, with its label above.
Use it for a handshake (TLS), a request and its reply, an API call chain. A note can span lifelines
to say what is true at that point ("keys agreed").

Rules this block enforces:
- Time runs down. Messages appear one after another, each `every` seconds (or at their own `at`).
- The current message is the key one: its arrow is accent and heavy, its number is accent text and
  its label is ink. When the next step starts, the arrow drops to a thin muted line and the label
  turns muted. Weight carries the meaning where the accent equals the ink.
- A label sits in the gap next to the sender, between two lifelines, so it never crosses a line.
  A long label wraps to up to three lines; the gap widens first when the box has room.
- Actor boxes take their size from their measured labels. Lifelines are dashed and drawn in.
- Rows share the height: when they do not fit, the gaps between rows shrink before anything else.
- Every text box passes textSafe. When one does not, the block narrows and lays out again.

```ts
export type SequenceProps = {
  id?: string;
  /** The block's box in px: title, actors, lifelines and every label stay inside it. */
  x: number; y: number; w: number; h: number;
  title?: string;
  /** Two to four actors, left to right. `id` is how steps name them. */
  actors: { id: string; label: string }[];
  steps: SequenceStep[];
  at: number;
  /** Seconds between steps. Default: three move durations. */
  every?: number;
  until?: number;
};
```

### tree

**A hierarchy from a root, with one key path lit.**

- Suits: Spec, Console.
- Works against: none named.
- Demo: [`examples/scenes/tree.ts`](../examples/scenes/tree.ts), 10.5 s, in Spec and Console: The DNS namespace.

Tree: a hierarchy from one root down to its leaves, built level by level (row by row as an outline). Use it for a namespace
(DNS), a file system, an org chart, a module tree, a taxonomy. Nodes marked `key` form a path from
the root; after the build, that path lights one level at a time, with an optional caption.

Rules this block enforces:
- Top-down first: leaves share the width, each parent sits centred over its children, and
  connectors drop from the parent, run along a bus and drop to each child.
- When the leaves do not fit across the box (9:16), the tree becomes an indented outline: one node
  per row, each child indented under its parent, with a stem and a tick to each child. Nothing shrinks
  below its measured label; a label may wrap to two lines first.
- Every node takes its size from its measured label. Labels never touch a line.
- The key path lights in the accent with heavier connectors, so it reads where accent equals ink.
- Every text box passes textSafe. When one does not, the block narrows and lays out again.

```ts
export type TreeProps = {
  id?: string;
  /** The block's box in px: title, caption, nodes and lines stay inside it. */
  x: number; y: number; w: number; h: number;
  title?: string;
  root: TreeItem;
  /** One sentence shown when the key path lights. */
  caption?: string;
  /** "auto" (default): top-down when the leaves fit across the box, else an indented outline. */
  layout?: "auto" | "top" | "outline";
  at: number;
  /** When the key path starts to light. Default: just after the build ends. */
  keyAt?: number;
  until?: number;
};
```

### cycle

**Steps around a loop, lit one after another.**

- Suits: Primary, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/cycle.ts`](../examples/scenes/cycle.ts), 13.5 s, in Primary and Schematic: The water cycle.

Cycle: steps around a loop, joined by curved arrows, with the active step lit in turn. Use it for a
process that returns to its start: the water cycle, a feedback loop, a build-test-learn loop.
Each step may carry a note, shown beside or below the loop while that step is active.

Rules this block enforces:
- Steps sit on a circle, clockwise from the top. When the box is tall (9:16), the circle stretches to
  an upright ellipse, so the arrows between steps stay long enough to read.
- Arrows follow the loop and end with an arrowhead along it. They start and stop a small gap
  outside each box, so no line touches a label.
- The active step is lit: an accent fill and onAccent text, and the arrow into it lit at a heavier
  weight. One step is lit at a time, so weight and fill carry the meaning where accent equals ink.
- The first lap builds the loop: each arrow draws into the next step as it becomes active. After the
  last step, the loop closes and the first step lights again.
- Notes sit beside the loop in a wide box and below it in a tall one. Each note leaves before the
  next enters.
- Every text box passes textSafe. When one does not, the block narrows and lays out again.

```ts
export type CycleProps = {
  id?: string;
  /** The block's box in px: title, loop and notes stay inside it. */
  x: number; y: number; w: number; h: number;
  title?: string;
  /** Three to six steps, in order around the loop. */
  steps: { label: string; note?: string }[];
  at: number;
  /** Seconds each step stays active. Default: four move durations. */
  every?: number;
  /** How many times the light goes around (default 1). It always ends back on the first step. */
  laps?: number;
  until?: number;
};
```

### sheet

**A drawing sheet: its grid, crosshairs and title block, and the drawing fitted to it.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/drivetrain.ts`](../examples/scenes/drivetrain.ts) (shared with gear, belt, callout, dimension, formula), 10 s, in Spec and Schematic: A bicycle chain drive drawn on a sheet, with the gear and belt geometry checked.

Sheet: the drawing sheet of Spec and Schematic as one block. A hairline grid over the whole sheet, a title
block (title, FIG., SCALE, SHEET), figure numbers, and the column positions that every part of the film
lines up to.

Rules this block enforces:
- The grid is complete: one hairline every `pitch` px over the whole sheet box, at layer -1 (a backdrop), in
  the rule colour. Content sits over it; the block never drops a line or a mark near content. The Schematic
  reel's grid had holes where its scene culled marks, and a grid with holes reads as a fault.
- Lines fall on the text-safe area's left and top edges, so the grid and the text column agree. The pitch is
  half a column pitch of the system (column plus gutter), unless the scene gives one.
- `grid: "marks"` draws a + at each crossing instead of lines (Spec's register marks), also complete.
- The title block sits at the foot of the text-safe area, on the text column, and passes the text-safe
  check (it ends by lowBandRight in the 9:16 low band). In a tall frame of a system that states a figure place
  (Schematic), the status line holds the top and the figure fills the frame under it, so no default place is free:
  the title block is off there unless the scene gives its place as a box, and the block says so. Its cells are TITLE, FIG., SCALE and SHEET; a cell
  without a value is left out. Cells fill rows in order, and a cell that does not fit starts a new row. A drawing at another scale says so here (SCALE 1:6).
- Figure numbers ("FIG. 2  COG") are label-role lines in inkMuted at the places the scene gives.
- `plate` lays a panel in the surface tone under the drawing (true: figureBox), under the grid lines.
- Labels knock out the grid, as on a real drawing: in a system that draws on a sheet, a callout's and a dimension's
  label sit on a small patch of the ground (or of the plate, where the label is on it) over the grid lines, so no
  grid line runs through a letter and the label keeps its contrast (accentText over a grid line measured 4.03:1).
- The grid shows from frame 0 when `at` is 0 or before: it is the ground of the film. The title block and the
  figure numbers come on by the system's vocabulary.
- `sheetLayout` gives the columns ({ x, w } for each), the pitch and the title block's box, so a scene places
  parts on the same columns.
- A drawing is not text. `fitDrawing` scales a drawing's geometry to fill a given area, which may reach the
  picture-safe area (`pictureSafe`: the frame inside the system margin) and so the full frame width at 9:16.
  Only the drawing's labels must stay in the text-safe area. The fit keeps room, in px, for the parts that do
  not scale (label rows, a dimension's offset and its label) on each side of the geometry, and reports the
  scale (px per unit, and the SCALE text for the title block). Outline weights follow the system's rule: the
  system stroke for a drawing up to half the frame's short side wide, up to twice it for a drawing that fills
  the frame, in half steps. Tooth sizes come from the true pitch times the scale, so they grow with the fit.
- Where a figure sits is the system's (its direction's compose `figure`). In a tall frame, `figureBox` is that place:
  the picture-safe width, from under a two-line status line down to the compose's foot (Schematic: 86 % of the
  frame's height). fitDrawing with no `area` fills that box and stands the geometry on its foot, with room above it
  for the labels and dimensions (which must stay in the text-safe area, above 65 % of the height). So the drawing
  reaches into the lower band, where only picture may go, and its annotation fills the text-safe area above it.
  The geometry keeps to the text column across (the text-safe left and right edges), so a label beside any part
  has room; the box itself spans the picture-safe width, for a plate under the drawing.
  In a frame that is not tall, or in a system that states no figure place, the box is the picture-safe area and the
  geometry is centred in it.

```ts
export type SheetProps = {
  id?: string;
  /** The sheet's box in px. Default: the frame. A film with a camera gives the whole sheet it pans over. */
  x?: number; y?: number; w?: number; h?: number;
  /** "lines" (default), "marks" (+ at each crossing) or "none". */
  grid?: "lines" | "marks" | "none";
  /** The grid pitch in px. Default: half a column pitch. */
  pitch?: number;
  /** The title block. Leave it out for a sheet without one. */
  titleBlock?: { title?: string; fig?: string | number; scale?: string; sheet?: string;
    /**
     * Where the title block sits. "foot" (default): at the foot of the text-safe area. "top": at the text-safe top, so a
     * drawing that uses the lower band does not meet it. A box: used as given (its width fills the rows). In a tall
     * frame of a system with a figure place (Schematic), "top" lies on the status line and "foot" on the plate's figure:
     * there the title block is off and the block warns; give a box.
     */
    place?: "foot" | "top" | Box };
  /**
   * A plate under the drawing: a panel in the surface tone with a hairline edge, under the grid, so the grid still runs
   * under the drawing. true: the system's figure box (figureBox); or a box in px. The hook counts the plate with its
   * drawing as one picture (an open drawing, such as a lever, covers little of the frame by its parts alone); the
   * empty-frame check counts only the drawing on it, never the empty plate.
   */
  plate?: boolean | Box;
  /** Figure numbers and names at given places (top-left of the text), px. */
  figures?: { fig: string | number; name?: string; x: number; y: number; at?: number; until?: number }[];
  at: number;
  until?: number;
};
```

### gear

**A gear or sprocket that turns at a true ratio.**

- Suits: Schematic, Spec.
- Works against: none named.
- Demo: [`examples/scenes/drivetrain.ts`](../examples/scenes/drivetrain.ts) (shared with sheet, belt, callout, dimension, formula), 10 s, in Spec and Schematic: A bicycle chain drive drawn on a sheet, with the gear and belt geometry checked.

Gear: a sprocket or a spur gear on its pitch circle, which turns about its own centre. Use it with `belt`
for a chain or belt drive, and for any mechanism a film explains.

Rules this block enforces:
- The gear is drawn on its pitch radius `r`: the teeth reach 0.26 x the tooth pitch outside it and the roots
  0.2 inside. Gears that share a chain or mesh must share a tooth pitch: `pitchRadius(teeth, pitch)` gives
  the radius, so the ratio on screen is the true ratio.
- It turns about its centre only, on a linear curve (a machine has no ease), for the number of turns the
  scene gives. `ratioTurns` gives the driven gear's turns from the driver's, so the drawing does not lie.
- Key marks on the hub (two short radial lines on one diameter) turn with the teeth, so the turn reads at a
  glance. They are symmetric, so the hub's box stays centred and it spins about its own centre.
- It draws on with the system's shape entrance: the outline draws (stroke reveal), or cuts in a one-frame
  system. Strokes are the system stroke times `weight` (fitDrawing gives a heavier weight to a drawing that
  fills the frame); the colour is ink unless the scene marks this gear as the subject.
- It names its centre and pitch circle: anchor `<id>-pitch` (the pitch circle's box, data cx, cy, r), so a
  belt, a callout or a dimension can attach to the true geometry.

```ts
export type GearProps = {
  id?: string;
  /** The centre, px. */
  cx: number; cy: number;
  /** The pitch radius, px. */
  r: number;
  /** The number of teeth. */
  teeth: number;
  /** Turns, in time order: from `at` to `until` the gear turns `turns` times (negative: anticlockwise). */
  turns?: { at: number; until: number; turns: number }[];
  /** The start angle in degrees (0: a tooth points straight up). */
  angle?: number;
  color?: ColorRole;
  /** The outline weight as a multiple of the system stroke. Default 1. A drawing fitted large takes fitDrawing's weight. */
  weight?: number;
  /** Hub size as a share of the pitch radius. Default 0.22. 0: no hub. */
  hub?: number;
  at: number;
  until?: number;
};
```

### belt

**A belt or chain around two wheels, on their outer tangents.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/drivetrain.ts`](../examples/scenes/drivetrain.ts) (shared with sheet, gear, callout, dimension, formula), 10 s, in Spec and Schematic: A bicycle chain drive drawn on a sheet, with the gear and belt geometry checked.

Belt: a chain or a belt round two pulleys or sprockets, on their pitch circles. Use it with `gear`.

Rules this block enforces:
- The runs are the two outer tangents of the pitch circles. Each touches its circle at one point, at right
  angles to the radius there, and never cuts through a circle. `outerTangents` computes them for any sizes
  and any order (the small circle left, right, above, or equal radii); gear.test.ts proves it.
- The wraps are arcs about each circle's own centre, round the far side of that circle (away from the other
  one). The arc flags come from the true angles, so an arc never takes the mirror circle. The Schematic
  reel's chain cut through its ring because of a tangent sign and these flags.
- Two circles that overlap, or one inside the other, have no belt: the block throws and says so.
- It draws on from the top run's start along the path (stroke reveal), or cuts in a one-frame system. A
  chain shows its links as a dash at the link pitch (`links`, px). It is the subject's colour (accent) by
  default: on a drive, the chain is what carries the motion.
- It names its runs: anchors `<id>-top` and `<id>-bottom` (the run's box, data x1 y1 x2 y2), for labels.

```ts
export type BeltProps = {
  id?: string;
  /** The two pitch circles (centre and radius, px). */
  a: Circle; b: Circle;
  color?: ColorRole;
  /** Stroke width as a multiple of the system stroke. Default 1.5. */
  weight?: number;
  /** The link pitch in px: the chain shows as dashes of this pitch. Default: a plain belt. */
  links?: number;
  at: number;
  until?: number;
};
```

### pulley

**A wheel with no teeth that turns and may move: the wheel of a hoist or a crane.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/hoist.ts`](../examples/scenes/hoist.ts) (shared with rope), 12 s, in Spec and Schematic: A Schematic film of a hoist with two wheels (how a 100 N pull lifts 200 N), made with the kit's drawing blocks and their default props: no label, dimension or rope is placed or drawn by hand.

Pulley: a wheel with a groove and no teeth, for a rope or a belt that runs on it. It turns about its own centre and
may move (a moving wheel of a hoist). Use it with `rope`; use `gear` for a wheel with teeth.

Rules this block enforces:
- The rope runs on the groove radius `r`. The rim is drawn a little outside it (`rim`, default 8 % of r), so the
  rope sits in the groove and never cuts the rim.
- Key marks (four short radial ticks inside the rim, a quarter turn apart, and the axle) turn with the wheel, so a
  turn reads at a glance on a wheel with no teeth. The marks are symmetric about the centre, so their drawn box stays
  centred at every angle and they turn about the wheel's centre (three ticks gave a box whose centre drifted 34 px
  as it turned, and the HyperFrames check said the pivot drifted).
- `turns` and `moves` take the system's move curve, as `shape` does, so a wheel that rolls up its rope turns in step
  with its rise: give the same times to both, and the turn from rollDegrees (the rope's run over the wheel). Only the
  key marks turn: a round rim looks the same at any angle, so a part that hangs from the rim (a strap, with shape
  `on`) rides with the wheel and stays upright.
- A wheel that turns while it moves reads in the HyperFrames check as a pivot that drifts (it measures the marks'
  centre, and the move carries it). The block warns: turn a moving wheel before or after its move.
- It is a `shape` (a circle on the rim), so pointOf, pointAt, followPoint and `figure` read it. It names its groove:
  anchor `<id>-groove` (data cx, cy, r), which `rope` reads.

```ts
export type PulleyProps = {
  id?: string;
  /** The centre, px. */
  cx: number; cy: number;
  /** The groove radius, px: where the rope runs. */
  r: number;
  /** The rim's radius, px. Default: 1.08 x r. */
  rim?: number;
  /** Moves of the wheel, as shape `moves` (offsets in px from where it is drawn, on the move curve). */
  moves?: ShapeProps["moves"];
  /** Turns in degrees, clockwise, each at a time, on the move curve (rollDegrees gives a rolling turn). */
  turns?: { at: number; by: number }[];
  color?: ColorRole;
  /** The outline weight as a multiple of the system stroke. Default 1. */
  weight?: number;
  enter?: ShapeProps["enter"];
  at: number;
  until?: number;
};
```

### rope

**An open rope over pulleys, whose strands change length as a wheel moves.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/hoist.ts`](../examples/scenes/hoist.ts) (shared with pulley), 12 s, in Spec and Schematic: A Schematic film of a hoist with two wheels (how a 100 N pull lifts 200 N), made with the kit's drawing blocks and their default props: no label, dimension or rope is placed or drawn by hand.

Rope: an open rope from a fixed end, over and under pulleys, to a free end (a hoist, a crane, a block and tackle).
Its strands change length as the wheels and the free end move. `belt` is the closed loop; this is the open run.

Rules this block enforces:
- The run is a list of stops: a point (the anchor, the free end; `follow` keys when it moves) or a wheel (the nodes
  of a `pulley`, or of a circle `shape`) with the way the rope turns round it ("cw" or "ccw", clockwise as a viewer
  sees it). The first and the last stop are points.
- Each strand is the common tangent from one stop to the next, so it meets each wheel at right angles to the radius,
  on the side the turn gives. Each wrap is an arc of the wheel's groove between the strand that comes in and the one
  that goes out.
- As the wheels and the ends move, each strand keeps its direction (parallel strands, as in a hoist): its end slides
  along its own line and the strand grows or shrinks; each wrap rides with its wheel. A strand that would turn
  throws and names it. The keys are on each frame of the motion, so the rope stays on its wheels in both renderers.
- `light` lights a part of the run in the accent (the active path): the strands from stop `from` to stop `to` and
  the wraps between them, at twice the rope's weight (a hairline in the accent is lost on a phone), as one accent
  element (its nodes share one group).
- It names each strand: anchor `<id>-s<i>-line` (data x1 y1 x2 y2, at rest), so labels keep clear of it.

```ts
export type RopeProps = {
  id?: string;
  /** The stops from the fixed end to the free end (see the header). */
  run: RopeStop[];
  color?: ColorRole;
  /** The stroke as a multiple of the system stroke. Default 1. */
  weight?: number;
  /** The active path: stops `from` to `to` light in `color` (default "accent") at `at`. */
  light?: { from: number; to: number; at: number; color?: ColorRole };
  at: number;
  until?: number;
};
```

### callout

**A numbered label outside a drawing, with a short leader to the part it names.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/drivetrain.ts`](../examples/scenes/drivetrain.ts) (shared with sheet, gear, belt, dimension, formula), 10 s, in Spec and Schematic: A bicycle chain drive drawn on a sheet, with the gear and belt geometry checked.

Callout: a label, a leader and an anchor dot that names one part of a drawing. Use it in Spec and Schematic
(and any drawn film) instead of a free `rule` and a free `text`.

Rules this block enforces:
- Its text is a diagram label (`content: "data"`), not prose: the density rule does not count its words.
- The anchor never dangles: the leader ends on a dot at the target point, and it starts at the label's
  measured edge (the side that faces the target), a small gap away. Nothing of the leader shows before its
  target exists: it draws from the label to the dot after `targetAt` (default `at`) and after the label lands.
- The label never touches a line or a mark that the block knows. `avoid` takes the nodes of the parts nearby
  (gear, belt, dimension, formula, other callouts): the block reads their geometry from their anchors (a
  gear's tooth-tip circle, a belt's two spans, the labels' boxes) and keeps the label's measured box a gap
  clear of all of it, at every place the label passes when it follows a moving part.
- Without x and y, the label finds its own place near the target (placeLabels): inside the text-safe area,
  clear of `obstacles`, the line `points` and the `avoid` geometry, with a leader that crosses none of them.
- With x and y, a label that would cross that geometry shifts to the nearest clear place (up, down, left,
  right, in growing steps) and warns. With no clear place in reach, the block throws.
- The label is a label-role line in ink that keeps its case as written (units: "12.7 mm"), with an optional number before it ("1  CHAINRING"). It comes on by
  the system's vocabulary (a cut in a one-frame or opaque system, else a fade) and goes off with the rest.
- `follow`: x and y keys (the same keys as the shape's own tracks). Every node of the callout rides with
  them, so the callout stays on a part that moves. The text-safe check runs at every key, not only at rest.
- The leader crosses no known label either; a label at a given place moves until both are clear. The leader is
  named as a segment (anchor `<id>-leader-line`), so later labels keep clear of it.
- It names the label's box: anchor `<id>-label`, and with `follow` the box the label sweeps on its way:
  anchor `<id>-sweep`. Another callout with this one in `avoid` keeps clear of both.
- A short leader near its target. `outside` (the drawing's bounds, px) puts the label outside the drawing, on
  the side nearest the target, as square to that side as it can be, so the leader leaves the drawing by the
  shortest way and never runs across it. A leader is never longer than `maxLeader` (default: the target's
  distance to the nearest side of `outside` plus three label lines, or four label lines without `outside`).
  A label at a given x and y whose leader is longer throws, and names both fixes: the maxLeader that keeps the
  given place, and the place the block finds by itself. The block never moves a given label for its leader.
- `figure` (blocks/figure.ts): the label goes next to its target where there is room: the nearest place round it
  (beside it, over it, under it, then on the diagonals, a step further out each ring), clear of every stroke of the
  drawing at every place the parts pass, of the status line's band and of every label, line and leader that the
  figure's blocks placed before it. Its leader crosses no other leader, no label and no stroke away from its target.
  Else the label goes outside the figure (its box), on the side nearest the target. The leader is never longer than
  the figure's maxLeader (5 label lines by default): with no place inside it, the block throws and names a fix that
  works. The block adds its label and its leader to the figure, so later blocks keep clear of them. A label it places
  keeps its whole line box in the text-safe area, not only its ink, as the HyperFrames check judges the box.
- One edge: a label the block places a few px off the text column's left or right edge moves onto that edge.

```ts
export type CalloutProps = {
  id?: string;
  /** The words: the part's name. */
  label: string;
  /** A number before the label, as on a drawing ("1"). */
  number?: string | number;
  /** The point the leader ends on, px. */
  target: { x: number; y: number };
  /** The label's top-left corner, px. Without it, the block places the label near the target. */
  x?: number; y?: number;
  /** Boxes the label and its leader must keep clear of, when the block places the label. */
  obstacles?: Box[];
  /** Points on lines (a chain, an outline) that the label and its leader must keep clear of. */
  points?: [number, number][];
  /** The nodes of nearby parts (gear, belt, dimension, formula, callout). The label keeps clear of their geometry. */
  avoid?: Node[];
  /** When the target exists on screen. The leader draws after it. Default: at. */
  targetAt?: number;
  /** The keys of a moving shape, so the callout rides with it. */
  follow?: Follow;
  /** The drawing's bounds, px: the label goes outside them, on the side nearest the target. */
  outside?: Box;
  /** The longest leader allowed, px. Default: see the header. */
  maxLeader?: number;
  /** The drawing's figure (figure(ctx, parts)): the label goes outside it, clear of all its annotation. */
  figure?: Figure;
  color?: ColorRole;
  at: number;
  until?: number;
};
```

### dimension

**A dimension line with its value: how long a part is.**

- Suits: Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/drivetrain.ts`](../examples/scenes/drivetrain.ts) (shared with sheet, gear, belt, callout, formula), 10 s, in Spec and Schematic: A bicycle chain drive drawn on a sheet, with the gear and belt geometry checked.

Dimension: a measure drawn as a drawing does. Two extension lines, a dimension line with a tick at each
end, and the measure as a label. Use it to draw the answer, not only to type it (hard rule 12).

Rules this block enforces:
- Its text is a diagram label (`content: "data"`), not prose: the density rule does not count its words.
- The extension lines start a small gap off the measured points and run past the dimension line, so the
  line never touches the part. The dimension line sits `offset` px off the line from `from` to `to`, on the
  side the sign of `offset` gives (positive: the left of from -> to, as a viewer sees it; up for a measure
  drawn left to right).
- Ticks are 45-degree slashes, the drawing convention for Spec and Schematic. Their length is 3 x the label
  size / 4, and they are drawn with the dimension line.
- The label is horizontal at any angle, centred on the dimension line's middle and moved out past it, so no
  letter touches a line (hard rule 1). It keeps its case as written ("2.11 m", "π d").
- Its lines are 3/4 of the system stroke, and never under PHONE_LINE (2 px at 1080 wide): a thinner line on a 390 px
  phone blends under 3:1 against the ground (ink on Spec's ground: 1.5 px gives 2.0:1, 2 px gives 3.1:1).
- It draws on in order: the extension lines, then the dimension line and ticks (stroke reveal on the move
  curve), then the label lands. In a one-frame system each part cuts in.
- `avoid`: the nodes of nearby parts; the label keeps clear of their outlines, or moves to the nearest clear place.
- `follow` (x and y keys of the shape) moves every part with the shape, so the dimension stays on a part that
  moves. The text-safe check runs at every key.
- It names the label: anchor `<id>-label`, and the dimension line: anchor `<id>-line-box` (data x1 y1 x2 y2).
- `figure` (blocks/figure.ts) places the dimension itself, as a drawing does, with no `offset`: on the `side` of
  what it measures ("above" by default; "below", "left", "right"), just clear of every part and label in its span
  (where they pass over the whole film), one step further out where its line or label would meet another.
  It measures along that side (the x distance above or below, the y distance at the left or the right), so its
  extension lines run square from each measured point to the tier, whatever their heights. Its label is centred on
  the line, on the far side from the figure, and slides along the line (past an extension line where it must, with
  the line run on under it) to stay in the text-safe area and clear of every label and line already placed.
- The tiers step out from the edge; one more tier is the lowest place where the label still stands in the text-safe
  area (on the side "above"). Under a drawing that reaches into the lower band, that tier keeps the value on its line
  where the grid of tiers had none (the lever film: "6 m" went on a leader, so "2 m" could not continue its line).
- Where the measured parts stand under the text-safe foot (a drawing on Schematic's figure foot reaches into the
  lower band), the lines are picture and stay where they belong: in the nearest clear tier, inside the picture-safe
  area. Only the value must be text. When no place on or along the line is text-safe, the value goes on a short
  leader (as a drawing puts a value that does not fit on its line): the nearest clear place in the text-safe area,
  with a hairline from the value to the dimension line, never longer than the figure's maxLeader. So the answer's
  dimension can stand in the lower band. With no place at all, the block throws and names a fix it has tried and
  that works: another side, a longer leader, or how far to raise the drawing.

```ts
export type DimensionProps = {
  id?: string;
  /** The two measured points, px. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** The distance from the measured line to the dimension line, px. Positive: the left side of from -> to. Leave it out
   *  with `figure`: the figure gives the tier. */
  offset?: number;
  /** The drawing's figure (figure(ctx, parts)): the dimension places itself in a clear tier outside it. */
  figure?: Figure;
  /** With `figure`: the side of the figure the dimension stands on. Default "above". */
  side?: Side;
  /** The measure, as it reads ("2.11 m"). */
  text: string;
  /** The keys of a moving shape, so the dimension rides with it. */
  follow?: Follow;
  /** The nodes of nearby parts (gear, belt, callout). The label keeps clear of their geometry. */
  avoid?: Node[];
  color?: ColorRole;
  /** The label's colour. Default: the line's colour. */
  textColor?: ColorRole;
  at: number;
  until?: number;
};
```

### formula

**A short line of maths placed on a shape's edge, which stays there when the shape moves.**

- Suits: Primary, Spec, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/drivetrain.ts`](../examples/scenes/drivetrain.ts) (shared with sheet, gear, belt, callout, dimension), 10 s, in Spec and Schematic: A bicycle chain drive drawn on a sheet, with the gear and belt geometry checked.

Formula: a short piece of maths or a value set on a shape ("π d", "r = 0.32 m", "48 T"), which rides with the
shape as it moves. Use it for the label that belongs to a part, not to the frame.

Rules this block enforces:
- Its text is a diagram label (`content: "data"`), not prose: the density rule does not count its words.
- The text keeps its case as written (maths and units), in the label role by default.
- It sits on one side of a point on the shape (`place`: above, below, left, right or centred on it), a gap away,
  so no letter touches the shape's outline. Above, below and centred, the text is centred on the point's x; left
  and right, on the point's y. Along that axis it slides into the text-safe area when the point is near an edge,
  so it may sit off the point's centre there. It warns when it cannot fit.
- `follow` (the shape's x and y keys) moves it with the shape. The text-safe check runs at every key, so the
  label is readable wherever the shape stops.
- It comes on and goes off by the system's vocabulary (a cut in a one-frame or opaque system, else a fade).
- `avoid`: the nodes of nearby parts. The text keeps clear of their outlines (a gear's teeth, a belt's spans,
  other labels) at every place it passes; it moves to the nearest clear place, or the block throws.
- It names its box: anchor `<id>-box`.

```ts
export type FormulaProps = {
  id?: string;
  text: string;
  /** The point on the shape, px. */
  x: number; y: number;
  /** Where the text sits from the point. Default "above". Above, below and center centre the text on the point's x
   *  (left and right on its y), and slide it along that axis into the text-safe area near an edge. */
  place?: "above" | "below" | "left" | "right" | "center";
  /** The gap from the point, px. Default: half the role's size. */
  gap?: number;
  role?: TypeRole;
  color?: ColorRole;
  /** The keys of a moving shape, so the label rides with it. */
  follow?: Follow;
  /** The nodes of nearby parts (gear, belt, dimension, callout). The text keeps clear of their geometry. */
  avoid?: Node[];
  at: number;
  until?: number;
};
```

### arrow

**A curved or straight arrow from one point to another, that draws itself.**

- Suits: Raw, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/pointer.ts`](../examples/scenes/pointer.ts) (shared with box, camera), 8 s, in Raw and Schematic: A pointer, told with box, arrow and camera: a stack slot holds an address, the arrow follows it down to the heap, and the camera travels with it.

Arrow: a line from one point to another that draws itself and ends in an arrowhead.
Use it to point at a thing, to show that one thing leads to another, or as a pointer in a diagram.

Rules this block enforces:
- The line is straight, or a gentle curve with `bend` (a fraction of its length, positive bends left).
- It stops `gap` px short of both ends, so it never touches the things it joins.
- It draws from its start on a curve that never overshoots; the head appears as the line arrives.
- Its width is the system stroke (or a multiple of it); a key arrow is heavier, not only coloured.
- It draws in the overlay layer by default, so a panel or a box never hides it.
- `follow` (x and y keys, as from followPoint) carries the whole arrow with a moving point: a force arrow stays on
  the end of a beam that turns.
- It names its shaft as a segment (anchor `<id>-shaft`, data x1 y1 x2 y2), so a label that avoids it keeps clear.

```ts
export type ArrowProps = {
  id?: string;
  from: [number, number];
  to: [number, number];
  /** Curvature as a fraction of the length; 0 is straight. Positive bends to the left of the direction. */
  bend?: number;
  /** Space left free at each end, px. Default: half the arrowhead length. */
  gap?: number;
  color?: ColorRole;
  /** Marks the key arrow: a heavier line. */
  key?: boolean;
  /** Draw a head at the start too. */
  both?: boolean;
  /** The keys of a moving point (followPoint), so the arrow rides with it. */
  follow?: Follow;
  layer?: number;
  at: number;
  until?: number;
};
```

### annotate

**A label with a leader that names one part of a thing: a symbol, a figure, a word.**

- Suits: Spec, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/annotate.ts`](../examples/scenes/annotate.ts), 7 s, in Spec and Graphite: Newton's second law, with each symbol named by an arrow and a label.

Annotate: a label with an arrow that points at a target box (a word, a number, a mark).

Rules this block enforces:
- The label places itself. It tries spots on each side of the target (the preferred side first),
  nearest first, as one line and then as two. A spot is free when the label is inside the search
  area, passes textSafe, keeps clear of the target, of every obstacle box and of every point the
  scene gives (other leaders), and the leader from it touches none of them and no label text. If no spot is free, the block draws
  nothing and warns: it never draws text over text.
- The leader is a straight or gently curved line with an open arrowhead. It stops short of the
  label and of the target, so it never touches their ink.
- The leader draws on a curve that does not overshoot, after the label is in.
- Meaning does not ride on colour: the arrow and the words carry it.

```ts
export type AnnotateProps = {
  id?: string;
  /** What the arrow points at, in px. A point is a box of zero size. */
  target: Box;
  label: string;
  /** Default "label". */
  role?: "label" | "caption";
  /** Label colour. Default ink. */
  color?: ColorRole;
  /** Leader and arrowhead colour. Default ink. */
  stroke?: ColorRole;
  /** The side to try first. Default "above". */
  prefer?: "above" | "below" | "left" | "right";
  /** Boxes the label and leader must keep clear of: other text, marks, other labels. */
  obstacles?: Box[];
  /** Points to keep clear of: other leaders (see AnnotateLayout.points), lines of a chart. */
  points?: [number, number][];
  /** Where the label may go. Default: the text-safe area. */
  within?: Box;
  /** How much the leader curves, as a fraction of its length. 0 is straight. Default 0.18. */
  bend?: number;
  at: number;
  until?: number;
};
```

### highlight

**One word marked: an underline, a marker band or a loop.**

- Suits: Primary, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/highlight.ts`](../examples/scenes/highlight.ts) (shared with reveal), 12.3 s, in Primary and Graphite: Three facts, one after another in the same place, each with one kind of emphasis on its number: an underline, a marker, a loop.

Highlight: emphasis on text that is already on screen. An underline that draws, a marker box behind
the words, or a loop drawn around them. The scene gives the text's box (from ctx.measure) and role.

Rules this block enforces:
- It never covers the text's ink. The underline sits below the lowest ink of the words (below the
  descenders when the words have any). The loop passes outside the ink box at every point, and keeps
  clear of the `avoid` boxes (the lines around the words): it flattens, and if it still cannot fit,
  the block draws an underline or a marker instead. The marker
  is a box, and both renderers draw every box below every text.
- The marker colour keeps the text readable: it takes the first of accent, accent2, accent3 and rule
  on which the text colour keeps 4.5:1. In Spec the accent equals the ink, so the marker is the rule grey.
- A stroke never passes its end: draw tracks use a curve that does not overshoot.
- Meaning does not ride on colour: the mark itself (a line, a box, a loop) carries the emphasis.

This file also holds the text geometry that the grammar blocks share: where the baseline and the ink
of a text box are, from the font metrics measured in Chrome (layout.inkMetrics).

```ts
export type HighlightProps = {
  id?: string;
  /** The words' text box: x and y of the text node, w from ctx.measure, h the role's line height. */
  target: Box;
  /** The role the words are set in. It places the mark against the real ink. */
  role: TypeRole;
  /** The words themselves, so the block knows if they have descenders. Without it, it assumes they do. */
  text?: string;
  style: "underline" | "marker" | "circle";
  /** The stroke or marker colour. Default: accent for strokes; for the marker, see markerFill. */
  color?: ColorRole;
  /** Text and marks near the words (the other lines, the words beside them). The loop flattens to keep
   *  clear of them; when it cannot, the block draws an underline, or a marker, instead. */
  avoid?: Box[];
  /** The colour of the words, for the marker's contrast check. Default ink. */
  textColor?: ColorRole;
  at: number;
  until?: number;
};
```

## Code and UI

### codeBlock

**Code at a readable size with line numbers, one line lit at a time.**

- Suits: Manual, Console.
- Works against: none named.
- Demo: [`examples/scenes/codeBlock.ts`](../examples/scenes/codeBlock.ts), 10.5 s, in Manual and Console: Euclid's algorithm in JavaScript, one line lit at a time.

Code block: real code at a readable size, with line numbers and one highlighted line at a time.

Rules this block enforces:
- Code uses the system's mono role when it has one (never an uppercase role). Else it uses the
  smallest role that keeps the case as written. Every token sits at x0 + measure(prefix), so a
  proportional font lines up as well as a mono one.
- Syntax colour comes from roles, at most four: ink for code, inkMuted for comments and line numbers, and
  the roles in `syntax` for keywords and literal values (strings and numbers). The default keeps keywords
  and literals in ink, so the accent stays free for the one thing a frame is about. `literals: "accent"`
  sets literals in accentText. A system's signature (blocks/signature.ts) may set its own syntax roles.
- Code is never cut. A line that does not fit: the panel widens to the text-safe edge, then the code steps down a
  role (never under codeFloor: body size, what reads on a phone), then the line wraps at a token with a hanging
  indent, and a token wider than the column throws. Below lowBandTop at 9:16, the column ends by lowBandRight.
  Lines that do not fit the box height are left out, and the block reports it.
- One line is highlighted at a time: a band behind it, and its line number turns from inkMuted to ink.
  The band is a shape, so the mark never rides on colour alone. It moves from line to line on the
  system's move curve; with `jump: "cut"`, a jump of more than one line cuts, so the band never shows
  a line the film is not about.
- The band reads the system's signature: the rule colour by default; in Manual, the teal accent at a
  tint, a solid accent bar in the gutter, and the line number in the accent. The tint is the strongest
  at which every text colour on the band (ink, the muted comments, the syntax roles, the line number)
  still passes 4.5:1 (signature.ts, tintAlpha). A system with no tint that passes keeps the rule band.
- Rows come on by `enter`: they rise out of their masks one after another ("rise"), show at rest ("rest"), or
  type on at a human rate in their syntax colours ("type"). A block at 0 or before shows at rest on frame 0, as
  every text block does; with "type", its first row is at rest and the rest type on from there. The default
  outside frame 0 comes from the system's vocabulary. A line number turns to ink when the band arrives on its
  line, and back to inkMuted when the band leaves.

```ts
export type CodeBlockProps = {
  id?: string;
  /** The block's box in px. The panel fills it. `h` left out: the height its rows need, wrapped rows too, so the
   *  panel is never an empty box and no line is left out. */
  x: number; y: number; w: number; h?: number;
  /**
   * The y the panel's body runs down to, px (9:16: the picture-safe foot, so the pane hangs into the low band as a
   * picture). The code keeps its rows where they are; the body under them is empty. Ignored when `h` is given.
   */
  foot?: number;
  /** The code, one line per array item. Keep lines short: the block cuts long ones. */
  lines: string[];
  /** A file name, set in the label role above the code. */
  title?: string;
  /** The line to highlight (1-based) and when, in time order. */
  highlight?: { line: number; at: number }[];
  /** Number of the first line (default 1). */
  firstLine?: number;
  /** Colour literal values in the accent ("accent"), or keep them in ink ("ink", the default). */
  literals?: "accent" | "ink";
  /** Syntax colour roles per token kind. Default: the system's signature (comments muted, the rest ink). */
  syntax?: Syntax;
  /** The highlight band: "rule", or "tint" (the accent at a tint, with a gutter bar). Default: the system's signature. */
  band?: "rule" | "tint";
  /** How the band changes line: "sweep" (move curve), or "cut" for a jump of more than one line. Default: the signature. */
  jump?: "sweep" | "cut";
  /**
   * How the rows come on. "rise": each row rises out of its mask, a stagger after the one above. "rest": every row
   * shows at rest from `at` (in one frame; from frame 0 when `at` is 0 or before). "type": the rows type on one
   * after another at `cps`, each with its syntax colours; with `at` at 0 or before, the first `restRows` rows are at
   * rest on frame 0 and the rest type on from 0 (Manual's hook: the first line readable on frame 0, then it types).
   * Default: "rest" when `at` is 0 or before (the frame-0 rule of every text block), else the system's vocabulary
   * (scene/vocabulary.ts: "rise"). A highlight on a typed row must come after the row is typed, or the block throws.
   */
  enter?: "rise" | "rest" | "type";
  /** For `enter: "type"`: characters a second. Default 13, as the terminal types. */
  cps?: number;
  /** For `enter: "type"` with `at` at 0 or before: the rows at rest on frame 0 before the typing starts. Default 1. */
  restRows?: number;
  at: number;
  until?: number;
};
```

### terminal

**A shell session: commands typed at a human rate and their real output.**

- Suits: Manual, Console.
- Works against: none named.
- Demo: [`examples/scenes/terminal.ts`](../examples/scenes/terminal.ts), 14.5 s, in Manual and Console: Three shell commands and their real output (GNU coreutils factor, bash, bc).

Terminal: a shell session. A prompt, a command typed at a human rate, then its output line by line.

Rules this block enforces:
- A terminal at 0 s (or before) shows its panel and first prompt from frame 0, as text blocks do.
- Commands type at a variable human rate, a little slower after spaces and symbols. Each key lands
  on its own frame. Rates come from the character index, not from randomness.
- After Enter, the output answers: the first line after the command's run time, the next lines a
  few frames apart, as a real program prints them.
- The cursor is a block after the last typed character. It is solid while the person types and
  blinks (opacity steps, 0.5 s on, 0.5 s off) while the prompt waits. It hides while a command runs.
- When the rows exceed the box, the session scrolls one row at a time, in whole-row steps as a real
  terminal does: the top row disappears on the same frame. No text ever leaves the box.
- Text uses the code role (mono when the system has one), or the `role` the scene gives, so the type can
  be large (Console sets its session in headline). Each character sits at x0 + measure(prefix).
- The panel and the text column have separate edges: `inset` moves the text column inside the panel, so
  a panel can span the margins while the text stays in the text-safe area. The panel is a pane
  (blocks/pane.ts), so a terminal, a code block and a picture window share one border and one inset.
- Commands and output are never cut: the panel widens to the text-safe edge, then the session steps down a role
  (never under codeFloor, and only to a role at 85 % of the size or more), then a long line wraps with a hanging indent (a command keeps typing on the
  rows under it), and a token wider than the column throws. Below lowBandTop at 9:16, a row ends by lowBandRight.
- A wrapped command never ends on one word alone (a widow) where another break fits; where none does, it warns.
  Every row passes textSafe: with the default inset the text column starts at the text-safe left edge or inside it,
  so a panel as wide as the picture-safe area keeps its rows in ctx.safe.
- `resultRole` sets the result line in a larger role (it takes the rows its height needs); `fit` says what
  happens when it is too wide (blocks/fit.ts). terminalHeight() and terminalRows() give the panel height a
  session needs, so a scene can stack things under it. terminalTimes() gives the time of each prompt, key, Enter,
  output line and the result, so a scene places hits and reveals on them.
- The prompt is muted. The accent is for the one result: an output line with `result: true` is set in
  accentText, and it names its place (anchor `<id>-result`). A result must stay on screen: the block
  warns when a later row scrolls it out.
- `status`: a status line at the panel's foot, under a hairline, in the label role and inkMuted. Its right
  text may change at given times (a clock, a counter), each change in one frame. Its texts share one baseline,
  and their ink (not their line box) is centred between the hairline and the panel's foot.
- Weight split: commands are bold and output is regular, where the system loads both weights for the
  session's font (layout.loadedWeights): the heaviest weight of 600 or more for commands, 400 for output and
  the prompt. A system that loads one weight sets the whole session in it. Each string is measured in its own
  weight, so the typed characters and the cursor stay on their glyphs.
- The panel draws no window chrome: no title-bar dots. A window head comes from uiWindow, by the system.

```ts
export type TerminalProps = {
  id?: string;
  /** The panel's box in px. `h` left out: the height its rows need (terminalHeight), so the panel is never an empty box. */
  x: number; y: number; w: number; h?: number;
  /** The commands, each with the lines it prints. */
  session: { command: string; output?: TerminalLine[]; /** Seconds the command runs before its first line. Default 0.2. */ run?: number; /** Seconds the prompt waits before typing. Default 0.7. */ pause?: number }[];
  /** The prompt (default "$"). */
  prompt?: string;
  /** Typing rate in characters a second (default 13). */
  cps?: number;
  /** The type role of the session. Default: the code role. A large role (headline) reads at a glance on a phone. */
  role?: TypeRole;
  /**
   * The type role of the result line (`result: true`). Default: the session's role. A larger role (headline,
   * display) makes the proof read at a glance; the line then takes as many rows as its height needs.
   */
  resultRole?: TypeRole;
  /** When the result line does not fit the panel's width in `resultRole`: "shrink" steps down a role and warns, "throw" (and "wrap", since a result is one line) stops. Default: the system's (blocks/fit.ts). */
  fit?: FitPolicy;
  /** The distance from the panel's edges to the text column, px. Default: the pane inset on both axes. */
  inset?: { x: number; y: number };
  /**
   * A status line at the panel's foot: left text, and right text that may change at given times. With `foot` past the
   * text-safe foot it sits at the panel's top instead (as a terminal multiplexer can set it), so its text stays safe.
   */
  status?: { left?: string; right?: string | { text: string; at: number }[] };
  /**
   * The y the panel's body runs down to, px (9:16: the picture-safe foot, so the pane hangs into the low band as a
   * picture). The session keeps its rows where they are; the space under the prompt is the terminal's own empty
   * screen. With `h`, the rows scroll inside `h` (keep it inside the text-safe area) and the body runs on to `foot`.
   */
  foot?: number;
  /**
   * How the session ends: "prompt" (the default) shows a last prompt that waits for the next command; "result" ends
   * on the last output line, so a run that proves the code ends on its proof and the panel takes no empty row.
   */
  end?: "prompt" | "result";
  at: number;
  until?: number;
};
```

### pane

**A panel that code, a shell and a picture share, so their edges align.**

- Suits: Manual, Console.
- Works against: none named.
- Demo: [`examples/scenes/pane.ts`](../examples/scenes/pane.ts), 11 s, in Manual and Console: A code window, a terminal and a picture window in one column, with shared edges.

Pane: one window for a terminal, a code block or a picture. Use it so every window in a film has the same
panel, the same border, the same inset and the same title place, and so their edges align.

Rules this block enforces:
- The panel is the system's surface with a hairline border in the rule colour and the system radius. A
  picture pane has no fill ("none"): the picture fills the inner box and the border sits on top.
- The inset is the same for every pane in a system: 0.6 x the code role's size, unless the scene gives one.
  `paneLayout` returns the inner box; terminal and codeBlock place their text in it.
- The title is small text in inkMuted (ui.ts smallRole: the label role, or caption where label is under the phone
  floor), above the panel, on the inner box's left edge. So the title, the text
  column and the next pane's title share one left edge.
- `paneStack` stacks panes in one column: every pane gets the same left and right edge, and one gap.
  The Console reel had panes 6 px apart because each one took its own margin.
- A pane shows from frame 0 when `at` is 0 or before, and cuts on and off with its content.
- It names its inner box: anchor `<id>-inner`, so a scene can put content in it.
- It draws no window chrome: no title-bar dots (lint rule tell/window-chrome). The title is a label above it.
- With no box, a pane takes the system's window box (ui.ts windowBox): the hook's share, a tall pane at 9:16 under
  one line, a wide one at 16:9. Two panes with no box take the same box.

```ts
export type PaneProps = {
  id?: string;
  /** The panel's box in px. Default: windowBox(ctx), under its title when it has one. */
  x?: number; y?: number; w?: number; h?: number;
  /** With no box: the height of the line above the pane, px. Default: two rows of headline at 9:16, one at 16:9. */
  lineH?: number;
  /** A label above the panel, on the text column's left edge. */
  title?: string;
  /** "surface" for text (default), "none" for a picture under the border. */
  fill?: "surface" | "none";
  /** The distance from the panel's edge to its content, px. Default: paneInset(ctx). */
  inset?: { x: number; y: number };
  /** Draw order. Default: content (no layer), or 1 for a pane with `fill: "none"`, so its border draws above the picture. */
  layer?: number;
  at: number;
  until?: number;
};
```

### ui

**A small product interface kit: a window, list rows, a button, tabs, a toast and a cursor.**

- Suits: Raw, Pop, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/ui.ts`](../examples/scenes/ui.ts), 9 s, in Pop and Graphite: A fictional kiln-booking app built only from the ui kit.

UI kit: the parts of an app for product films (Graphite, Studio, Keynote): a window, a list row, a button, a
cursor that clicks, a badge, a tab bar and a toast. Use them so no scene hand-builds an app from rects.

Rules this kit enforces:
- Every part is built from the system's tokens: the surface, 1 px rule borders, the system radius, the label
  and body roles. Nothing glows and nothing casts a shadow.
- No stock window chrome. A window never draws the three title-bar dots of a mocked desktop window (lint rule
  tell/window-chrome). Its head comes from the system's tokens (windowHead): "title", a title and a hairline
  rule; "tabs", the title as the one open tab of a tab strip (a one-frame system: Console, Raw, Title);
  "none", no head at all (a system with a large radius: Studio, Keynote, Pop draw a quiet card).
- The accent marks the one thing that matters in the frame: the primary button, the active tab's underline,
  the selected row's bar, an accent badge, the toast's bar. Each such mark is also a shape (a bar, a fill, an
  underline), so it never rides on colour alone.
- Text on a filled part uses the role made for that fill (onAccent on the accent). Every text is measured and
  checked against the text-safe area. A part fits its text: a word is never cut. A list row gives its name
  the room left after its trailing cells (badge, meta). When the name needs more, the row tightens its gaps,
  then sets the trailing cells on a second line under the name, then shortens the meta, and only then shortens
  the name, at a word boundary. A part that cannot hold its text at its role's size throws.
- An avatar holds two wide letters: the letters never touch its ring, and every avatar of a system has one
  size, so the names of a list share one left edge.
- Parts come on and go off by the system's vocabulary (a cut in a one-frame or opaque system, else a fade),
  and show from frame 0 when `at` is 0 or before.
- The cursor moves between points on the system's move curve and never jumps in a tweened system. A click is
  a press of the cursor (it scales to 0.85 and back in 4 frames) and a ring that opens from the tip and
  fades. A button pressed at the same time dips with it (`press`).
- The cursor never covers the letters it clicks: a point given as `to` (a node id) aims at the lower right of
  that part where the whole arrow keeps clear of every text in `targets`, and the cursor rests there.
- The tab underline moves to the active tab on the move curve; the active label is ink, the others inkMuted,
  and a label changes colour in one frame. With `w`, the tab bar's rule spans the content's width.
- Parts name their boxes: `<id>-content` (window), `<id>-box` (row, button, badge, toast), `<id>-tab:<n>`.
- Small text (a meta, a badge, a tab, a window's title) is set in the smallest of label, caption and body whose
  letters keep the phone floor (UI_CAP px cap height on a 390 px wide phone): `smallRole`. Graphite's label is
  under it, so its small text is caption.
- A window with no box takes the system's composition of one line and one subject (`windowBox`): at 9:16 a tall
  window from one gap under a headline to the text-safe foot, across the picture-safe width (the hook's share);
  at 16:9 a wide one. Two windows with no box (a screen that swaps) take the same box, so the eye stays.
- `rows` fill a window to the text-safe foot (never an empty list: Graphite): the rows share that height, and the
  rows' text keeps the text-safe area, the low band's right edge included. At 9:16 the window's body runs on to the
  picture-safe foot as a graphic: the list runs on under the fold as row rules at the same pitch, with no text, so
  the lower third of the frame is a calm list, not an empty panel (grey bars in those rows read as loading).
- How much a window fills at 9:16 (the default box, Graphite): the picture-safe width (86 % of the frame's width),
  from one gap under a two-line headline to the picture-safe foot (69 % of its height): 59 % of the frame. Its rows
  have the content from under the head to the text-safe foot, about 640 px: 5 one-line rows (6 dense ones, one pad
  less each), or 3 two-line rows; a toolbar takes about one row. The window throws with the numbers when they do
  not fit: give fewer rows, or a shorter headline.
- What a `listRow` holds: on one line, an avatar (two initials), the name (body), a badge and a meta on the right
  (small text); when the name does not fit beside them, the badge and the meta move to a second line. For four
  fields (a name, a product, a quantity, a time) give `detail`: the row takes two lines, the name on the first and
  the detail, the badge and the meta on the second.
- States are data: a selected row's plate, bar and selected text carry `state: "selected"`, an active tab's label
  and underline `state: "active"`; both renderers write `data-state`. A list allows one selected row at a time
  unless `multi: true`; two at once throw.

```ts
export type UiWindowProps = {
  id?: string;
  /** The window's box, px. Default: windowBox(ctx) (the system's line and subject: a tall window at 9:16). */
  x?: number; y?: number; w?: number; h?: number;
  /** With no box: the height of the line above the window, px. Default: two rows of headline at 9:16, one at 16:9. */
  lineH?: number;
  /**
   * List rows that fill the content to the window's foot (never an empty panel). Each row shares the content's
   * height; the rows' text keeps the text-safe area (the low band's right edge included). A row shows from the
   * window's `at` unless it gives its own.
   */
  rows?: (Omit<ListRowProps, "x" | "y" | "w" | "stack" | "h" | "span" | "at" | "until"> & { at?: number })[];
  /** More than one row may be selected at a time. Default false: two selected rows at once throw. */
  multi?: boolean;
  /** The view's name, in the head. A window without a title draws no head. */
  title?: string;
  /** The head: "title", "tabs" or "none". Default: the system's (windowHead). */
  head?: WindowHead;
  /** A sidebar of this width, px, on the left of the content. */
  sidebar?: number;
  /**
   * A toolbar under the head: tabs on the left and one action button on the right, in one row that shares one
   * baseline and one bottom line. The `-content` anchor starts under it. The button names `<id>-action-box`.
   */
  toolbar?: { tabs: string[]; active?: { index: number; at: number }[]; action?: { text: string; kind?: "primary" | "secondary"; press?: number[]; done?: { at: number; text: string } } };
  /** The content's inset from the window's edges, px (the toolbar's left and right edge). Default: the kit's pad. */
  inset?: number;
  /** How the window comes on at `at`: "cut" (in one frame, every part) or "fade" (the system's entrance). Default: the system's. */
  enter?: "cut" | "fade";
  /** How it goes at `until`: "cut" or "fade". Default: the system's. */
  exit?: "cut" | "fade";
  /**
   * The id of a window built before this one that this window takes the place of: the next screen of one app window.
   * The swap never shows two screens at once: on `at` the frame (panel, head rules) cuts from the old window to this
   * one (the same box shows no change), the old window's content (its title, toolbar and rows) has left by then, by
   * the system's exit, and this window's content enters from `at` by `enter`. With `enter: "cut"` the old content cuts
   * out on the same frame instead: one clean cut of the whole screen.
   */
  replaces?: string;
  at: number;
  until?: number;
};

export type BadgeProps = {
  id?: string;
  x: number; y: number;
  text: string;
  /** "accent": a filled accent pill. "muted": a rule-coloured outline. "positive" / "negative": an outline in the status colour. */
  tone?: "accent" | "muted" | "positive" | "negative";
  /** Right-align the badge on x instead of starting it there. */
  align?: "left" | "right";
  at: number;
  until?: number;
};

export type ListRowProps = {
  id?: string;
  x: number; y: number; w: number;
  title: string;
  /** Short text on the right (a time, a count). */
  meta?: string;
  /**
   * A second fact under the name (a product, a place), muted: the row's compact layout for four fields. A row with a
   * detail always takes two lines: the name (with its avatar) on the first; the detail, the badge and the meta on the
   * second. Example: name "Iven Nash", detail "Rye loaves", badge "×12", meta "07:30".
   */
  detail?: string;
  /** Initials in a round avatar on the left. */
  initials?: string;
  badge?: { text: string; tone?: BadgeProps["tone"] };
  /**
   * Spans in which the row is selected: a rule-coloured fill and an accent bar on its left edge (state "selected").
   * The rows of one list (one column: the same x and w, built with one ctx) have one selection at a time: a row
   * selected while another is throws, unless `multi`.
   */
  selected?: { at: number; until?: number }[];
  /** This row's list selects many rows at a time. */
  multi?: boolean;
  /**
   * The width of the row's plate and rule, px, when it is wider than its text column `w` (rows in a window wider than
   * the text-safe area: the text keeps to the safe edge, the row still spans the window). Default `w`.
   */
  span?: number;
  /**
   * The row's height, px: taller than its text needs (rows that fill a window), or down to one pad less (a dense
   * list that must fit its window). The text centres in it.
   */
  h?: number;
  /**
   * Set the trailing cells (badge, meta) on a second line under the name. Default: only when the name does not
   * fit beside them. Give the same value to every row of a list (listRowsStack), so the rows share one height.
   */
  stack?: boolean;
  at: number;
  until?: number;
};

export type ButtonProps = {
  id?: string;
  x: number; y: number;
  text: string;
  /** "primary": the accent fill (the one action). "secondary": an outline. */
  kind?: "primary" | "secondary";
  /**
   * A bottom edge this many px deep, in ink, that the face sinks onto when pressed (Pop's chunky button). A press
   * must read as a press, not as jitter: the depth is at least 12 % of the label's size (about 6 px at body).
   */
  depth?: number;
  /** The label's role, and with it the button's size: "body" (the default), "headline" or "display" (a big call). */
  role?: "body" | "headline" | "display";
  /** Times the button is pressed (with the cursor's click). */
  press?: number[];
  /**
   * The action is done: from `at` (the frame after its click, say) the button shows `text` ("Ready", "Sent") as a
   * plain outline, not the call to action, by a cut. The state a click causes shows after the click, never before.
   */
  done?: { at: number; text: string };
  at: number;
  until?: number;
};

export type FieldProps = {
  id?: string;
  /** The field's top-left corner (its name's top) and its width, px. */
  x: number; y: number; w: number;
  /** The field's name, over the box ("Your file", "Email"). */
  label: string;
  /** What is typed into the box. Left out: an empty box, ready for input. */
  value?: string;
  /** When the value starts to type. Default: the field's `at` plus its entrance. */
  typeAt?: number;
  /** Typing rate in characters a second. Default 13 (a person at a keyboard). */
  cps?: number;
  /** The value's role: "body" (the default) or "headline" for a system whose body is under the phone floor (Raw). */
  role?: "body" | "headline";
  at: number;
  until?: number;
};

export type CursorProps = {
  id?: string;
  /**
   * The tip's path: where it is, and when it arrives there. The first point is where it starts. A point with `to`
   * aims at that part (a node id, such as a button's `<id>-box`): the tip lands on its lower right, where the
   * whole arrow keeps clear of every text in `targets`.
   */
  path: CursorPoint[];
  /** The scene's nodes: the parts `to` names, and the texts the arrow must not cover. */
  targets?: Node[];
  /** Times of clicks. */
  clicks?: number[];
  /**
   * How long each click's ring takes to fade, s. Default: 1.6 times the system's exit. A short ring (or 0: no ring)
   * keeps a hold that starts on the last click: the checks read a fading ring as a change.
   */
  ring?: number;
  at: number;
  until?: number;
};

export type TabProps = {
  id?: string;
  x: number; y: number;
  tabs: string[];
  /** The active tab (0-based) from each time on. */
  active: { index: number; at: number }[];
  /** The width of the bar's rule, px: the content's width, so the rule ends on the same edge as the rows. Default: the tabs' width. The tabs must fit it. */
  w?: number;
  /** The bar's height, px: its rule sits at y + h. Default: a label row and a pad. A toolbar gives the button's height, so both share one bottom line. */
  h?: number;
  /** The labels' baseline, px. Default: the labels' ink centred above the underline. A toolbar gives the button label's baseline. */
  baseline?: number;
  at: number;
  until?: number;
};

export type ToastProps = {
  id?: string;
  text: string;
  /** The toast's box. Default: centred at the foot of the text-safe area, 80 % of its width. */
  x?: number; y?: number; w?: number;
  at: number;
  until?: number;
};
```

## 3D

### product

**A 3D object on a shot (turntable, push, orbit), lit and shadowed by the system.**

- Suits: Studio, Keynote, Matte.
- Works against: none named.
- Demo: [`examples/scenes/product.ts`](../examples/scenes/product.ts), 9 s, in Studio and Matte: A product film made in code: a small speaker with a matte body and a metal ring, shot on a turntable under a passing light.

Product: a 3D object shot like a studio product film. The block frames the object from its bounds and
the frame's shape, moves the camera or the object in one of a few classic shots, and lets a light sweep
cross it in systems that allow one. The object is built from simple geometry or is a real model (a glTF
file, see src/system/three/spec.ts and models.ts). A model frames from its size in the media table, so
the block needs no file and frames it the same way before and after it loads.

Rules this block enforces:
- One hero object, centred, filling about `fill` of the frame's width at 9:16 (of its height at 16:9),
  standing on a soft contact shadow. Colours come from roles; finishes from a fixed set.
- Materials: a real model keeps its own materials by default (`material: "own"`): its maker's finish is what a
  real object looks like, and Matte asks for real materials. `material: "system"` maps a model to the system's
  roles; use it only to make a model match a drawn film. Forms built from simple geometry (box, sphere, lathe)
  always take the system's roles: they have no materials of their own.
- Shots: "turntable" (the object turns about 55 degrees), "push" (the camera moves in), "orbit" (a wider
  turn with the camera dropping a little), "rise" (the object rises into place), "still". Every move uses
  the system's move curve over `seconds`; nothing overshoots.
- It names where the object sits on screen with anchors, so text can avoid it:
  `<id>-object` (where the object rests at the end of the shot), `<id>-object-start` (at `at`) and
  `<id>-object-extent` (the box its drawn bounds cover at their largest over the whole shot: keep text out of it).
- A light sweep (systems that allow "light-sweep") rises and falls on a half sine: `sweep` is its start, its peak is
  half its length later. The anchor `<id>-sweep-peak` holds the peak as `at` (data: start, peak, end), for a hit.
- The view is the whole frame by default; 3D draws below the 2D content of its layer.
- Framing by silhouette. With no `fill` (and no detail), a real model with a silhouette table (three/silhouette.ts)
  frames by what the frame shows, not by its box: the share of the frame its silhouette covers at its smallest moment
  of the shot reaches the system's hook share (Direction: hook.area), its silhouette's bounds stay in the room, and,
  when the scene gives the object no angle, the object turns (up to BROADEST degrees) to its broadest view. A thin
  object (a desk lamp) comes closer than its box allows. When the full view cannot reach the share, the block says so
  and names a detail point (a build note). The anchors then follow the silhouette. `<id>-framing` holds the choice.

```ts
export type ProductProps = {
  id?: string;
  objects: Object3D[];
  shot?: "turntable" | "push" | "orbit" | "rise" | "still";
  /** How long the shot moves, seconds. Default: until `until`, or 8 s. */
  seconds?: number;
  /**
   * The share of the frame the object fills (width at 9:16, height at 16:9). Default 0.55, then larger until the
   * object's box covers the share of the frame that the system's hook asks for (Direction: hook.area), inside the frame
   * and, at 9:16, under the top third.
   */
  fill?: number;
  /** Where the object's centre sits, as a fraction of the frame height from the top. Default 0.58 at 9:16 (the object
   *  owns the middle and lower frame, under the line of the beat), 0.5 at 16:9 and 1:1. */
  centreY?: number;
  /**
   * The part of the frame the object keeps inside at its largest moment (the start and the end of the shot), px of the
   * frame. Give it to keep room for a line: the object centres in it and grows only as far as it lets. It overrides
   * `centreY`.
   */
  room?: { x: number; y: number; w: number; h: number };
  /**
   * "full" (the default): the whole object, framed by `fill`. "detail": the 3D camera moves in on one part, so the
   * part fills the frame and the rest of the object runs past it. A detail always draws on the whole frame: a `box`
   * given with it is taken as its `room` (where the part sits), so the shot never shows as a crop with hard edges.
   */
  frame?: "full" | "detail";
  /**
   * For `frame: "detail"`: the part, as a point in the object's bounds in fractions [x, y, z] from its lowest corner
   * ([0.5, 0.85, 0.5]: high on the centre line, the shade of a lamp), and `span`, the share of the object's height
   * that fills the frame's height. Default span 0.3.
   */
  detail?: { point: [number, number, number]; span?: number };
  /** The object runs past the frame on purpose, and the overflow check is told so. Default: true with `frame: "detail"`. */
  bleed?: boolean;
  /**
   * A turn about the vertical axis, degrees, added to the object's own (and to the shot's turn). Default: with no
   * `fill`, no detail and no object angle given, the turn (within BROADEST degrees) that shows the broadest silhouette;
   * else 0.
   */
  turn?: number;
  /** When the light sweep starts to cross, s (systems that allow one). It peaks half its length later and ends after its
   *  length (0.35 of the shot, at most 2.4 s). Default: a third into the shot. false: none. The anchor <id>-sweep-peak
   *  holds the peak as its `at`: hit({ at: anchor(nodes, "<id>-sweep-peak").at }) plays on the peak. */
  sweep?: number | false;
  box?: { x: number; y: number; w: number; h: number };
  at: number;
  until?: number;
};
```

## Sound

### sound

**Music, hits and key ticks placed by the film's own times and the track's beats.**

- Suits: Studio, Ma, Primary, Riso, Cutout, Mark, Raw, Pop, Keynote, Console, Noir, Title, Matte, Courtside, Nocturne.
- Works against: none named.
- Demo: [`examples/scenes/sound-beats.ts`](../examples/scenes/sound-beats.ts), 8 s, in Studio and Console: The sound helpers in one scene.

Sound: a music bed, hits (sound effects) placed on what the picture does, and key ticks under typing.

Rules these blocks enforce (from HyperFrames' sound guide and the untell critics):
- Music is the clock. `music` enters the track at a point the scene chooses by meaning, not by a number:
  `peakAt` puts the track's drop (or its loudest bar) on a film time, `align` puts a track time on a film
  time, and `from` stays for a scene that has measured its own entry. The track's map (src/system/music.gen.ts,
  from scripts/music_map.py) gives the drop and the bars. Take every cut time from `beats()` (scene/beats.ts).
- `peakAt` places a drop's measured rise (the step in level in the sound, music_map.py measured_rise), not its bar
  line: a guessed bar start put the drop a beat late in three agents' films. The build says what it placed when
  the two differ. A map made before the rise was measured keeps the bar line and says how to make the map again.
- Level without hand tuning. With no `volume` (or `volume: "auto"`), the bed gets the gain that brings the part
  it plays to the system's whole-mix target (mixTarget in src/system/direction.ts), capped so its true peak
  stays at or under -1 dBTP. An explicit number is used as it is.
- A track that peaks over -1 dBTP has a prepared master (master.wav, true-peak limited to -1 dBTP by
  scripts/music_map.py); `music` plays it, so a bed at full level never clips.
- An opening rise. With no `fadeIn`, the bed rises over OPEN_RISE (0.15 s) when it enters above the track's mean
  level (the first 1 s from `from` is louder than the track's integrated loudness) and the system does not move in
  single frames (ctx.instant: Raw, Console, Title cut hard). `fadeIn: 0` asks for a hard start on purpose.
  The detector's sound/hard-start check holds the same rule: a bed that starts above the track's mean level with
  no fade, in a system that is not one-frame, is a finding unless the scene set fadeIn: 0.
- It ends on the film's end or `until`, with a short fade under the last card.
- A hit's peak is placed on the first frame that shows the picture's change (frameOf(at), context.ts: a change at t
  shows on the first frame after t). For a change at 1.0 s that is frame 31, at 1.033 s. Never before the picture
  (a sound early feels wrong sooner than one late). The block places it on that frame exactly; the detector's hit
  timing check accepts a peak 0 to 2 frames after the change, because a change can first be visible a frame late
  (an eased entrance shows little on its first frame). `hit` takes the picture's time, or `on`: the frame on which
  the picture changes for a block: the frame a callout's, a dimension's or a formula's label shows (labelShownAt,
  beats.ts: the hit check's own rule), else the frame on which the block has fully arrived, its last part included
  (revealedAt). It starts the file early by its measured peak. To put an entrance and its hit on a beat, build the
  block with landOn(ctx, <beat>, (at, c) => B.<block>({ ..., at }, c)) (measureBlock.ts): an entrance started at
  <beat> - ctx.dur.enter arrives off the beat (a slide 3 to 6 frames late, a grow or a fade up to 2 frames early).
- Few hits, each with a cause on screen. Level without hand tuning: give `bed` (the music block's nodes).
- THE EFFECT RULE. This is the one statement of it: `hit`, `typing`, `untell listen mix` (scripts/listen/mix.py) and
  the check sound/effect-too-loud all say the same.
  1. An effect's true peak plus the bed's true peak around it stay at or under -1 dBTP (MIX_PEAK): the two can peak
     on the same sample, so their amplitudes add. The bed's peak is its master's (a track over -1 dBTP plays its
     master), at the bed's volume there.
  2. An effect plays at volume 1 at most. The master does not save an effect that is too loud: it limits the whole
     mix, so the bed drops with it, and a gain over 1 can clip the clip itself.
  3. Its peak stays PEAK_ROOM dB under the music's loudest peak in the film: an effect is never louder than the music.
  4. Within 1 to 3 it stands OVER_BED dB over the bed's loudness at its time (hits 8 dB, typing ticks 6 dB), and its
     peak stands at most NEAR_PEAK_MAX dB over the bed's peak within 1 s of it, as the bed plays (hits 12 dB, ticks
     10 dB). With band tables (media.gen.ts SOUNDS bands, music.gen.ts bands) it also stands IN_BAND + BAND_ROOM dB
     over the bed in the band where it stands clearest, among the bands that carry it: the check
     sound/hit-over-bed hears a hit there (sound_checks.masking). The check sound/effect-too-loud warns past the same
     numbers, so the block's own level passes it.
  5. When 1 to 3 leave it under 4 (the bed is loud there), the answer is to duck the bed, never to raise the effect:
     `hit({ bed })` dips the bed under that hit by default. By loudness the dip is AUTO_DUCK (6 dB) at most
     (`duck: true` allows 12 dB); by band it is as deep as the band needs, BAND_DUCK_MAX (18 dB) at most: a low
     stamp on a bed that is loud in the same band. `duck: false` refuses both. `typing` dips it once under
     the whole run of ticks; `music({ duck: [{ at, depth, length }] })` writes a dip by hand. A duck splits the bed into clips of the same file joined by 2-frame crossfades (both renderers and the
     detector play plain clips).
  Without a bed (a film with no music), a hit takes the level that brings its measured loudness to the system's mix
  target, within rules 1 and 2 (soloVolume); the master then brings the whole mix to the target. With no measured
  level the fixed volume 0.7 stays; typing ticks with no bed keep 0.5. The block says so in a system with music.
- `typing` places one tick a key from a typeOn's (or a typed codeBlock's or terminal's) node times; keys on one
  frame merge into one tick, and each tick ends where the next starts. With no `every`, it keeps the system's
  effects limit (effectsPerTen in direction.ts): it ticks every n-th key, and says which n it chose.
- Sound draws nothing. The frame recorder hears nothing: check sound in a real render.

```ts
export type MusicProps = {
  id?: string;
  /** A prepared track: a name that `untell media list` shows (kind "music"). */
  media: string;
  /** Film time the bed starts. Default 0. */
  at?: number;
  /** Film time it ends. Default: the end of the track. Give the film's end. */
  until?: number;
  /** Where in the track to enter, seconds. Use `peakAt` or `align` instead unless you measured the track. */
  clipStart?: number;
  /** @deprecated The old name of `clipStart`; it still works, with a warning. */
  from?: number;
  /** The film time on which the track's drop (or, with `peak: "loudest"`, its loudest bar) lands. The block picks `from`. */
  peakAt?: number;
  /** What `peakAt` places. Default "drop"; a track with no drop that fits falls back to its loudest bar. */
  peak?: "drop" | "loudest";
  /** Put track time `track` on film time `film`. */
  align?: { track: number; film: number };
  /**
   * A track that opens with digital silence (the music map's `lead`): with `from` or `align` inside it, the bed enters
   * where the sound starts. Default true; false keeps the entry as given. With `peakAt` the drop's place wins, and the
   * build says how long the film is silent.
   */
  skipSilence?: boolean;
  /** A linear gain, or "auto" (the default): the gain that brings the bed to the system's mix target. */
  volume?: number | "auto";
  /** Seconds of rise at the start. Default: OPEN_RISE when the bed enters above the track's mean level (not in a one-frame system); 0: a hard start. */
  fadeIn?: number;
  /** The fade under the last card, seconds. Default 1. */
  fadeOut?: number;
  /**
   * Dips in the bed, each `depth` dB down for `length` s from `at` (film time), with 2-frame ramps. Use it where an
   * effect must be heard over a loud bar (the effect rule in the header): the bed makes room, the effect never clips.
   * `hit({ duck: true })` writes such a dip itself.
   */
  duck?: Duck[];
  /**
   * A room tone under the bed, for a system whose direction asks for it (Ma, Title): a prepared sound (`media add
   * --kind music`, a recording of a quiet room) that plays from the bed's start to its end at a fixed low level,
   * ROOM_TONE_LU under the system's mix target, looped when it is shorter than the bed. It fills the gaps of a sparse
   * bed, so the film never falls to digital silence. Its level is not a choice: a room tone is heard only as air.
   * `{ media, until }` lets it run past a bed that stops hard (Title: the room under the held title).
   */
  roomTone?: string | { media: string; until: number };
};

export type HitProps = {
  id: string;
  /** A prepared sound effect (kind "sfx"). */
  media: string;
  /** The picture's moment: the cut, the landing, the panel's fastest frame. The peak plays on frameOf(at), the first frame that shows it. */
  at?: number;
  /**
   * Instead of `at`: land on the frame where the picture changes for block `id`. For a block with a label (callout,
   * dimension, formula) that is the frame its label shows (opacity 0.5, as the hit check counts it), not the end of
   * its fade or its 2.5 px dot. For any other block, the frame where node `id` (or every `id-...` node) has fully
   * arrived: the end of its entrance. A later move or turn of the node is not its arrival; to land on one, give
   * `after` at that move's time.
   */
  on?: { nodes: readonly Node[]; id: string; after?: number };
  /** The music block's nodes. With them, the level follows the bed at the hit's time (see the header). */
  bed?: readonly Node[];
  /** A linear gain. Default: set against `bed`; with no bed, the gain that brings the effect to the system's mix target (soloVolume, 1 at most). */
  volume?: number;
  /**
   * A part of the file, [from, until] in seconds into the file (not film time), so a file with a second transient or a
   * long tail needs no cut by hand. Default: the whole file, or its first attack when the file has several (SOUNDS
   * attacks, measured by media add). The part's own peak lands on the frame the picture shows:
   * the file's peak when it is in the part, else the part's start.
   */
  part?: [number, number];
  /**
   * Duck the bed under this hit when the bed is too loud for the hit to be heard within the effect rule (header): a
   * dip of the depth it needs from DIP_HOLD before the hit's peak to DIP_HOLD after it, in over 2 frames and back up
   * over DIP_RELEASE (by loudness 6 dB at most, 12 with
   * `duck: true`; by the band where the bed covers the hit, BAND_DUCK_MAX at most). The hit's nodes then
   * hold the bed's added clips too: put them in the scene. Default: true when `bed` is given (a hit that cannot be
   * heard is no hit); false keeps the bed whole, and the build says the hit is masked.
   */
  duck?: boolean;
};

export type TypingProps = {
  id: string;
  /** A short tick or click (kind "sfx"). */
  media: string;
  /**
   * The scene's nodes and the id of what types: a typeOn, a typed codeBlock (or one of its lines), or a terminal (its
   * commands, not its prompt or output). One tick each time a typed character appears; a wrong id throws with the ids
   * that type.
   */
  nodes: readonly Node[];
  of: string;
  /** Tick every n-th key only. Default: the smallest n that keeps the system's effects limit (effectsPerTen). */
  every?: number;
  /** The music block's nodes. With them, each tick's level follows the bed (see the header). */
  bed?: readonly Node[];
  /** A linear gain. Default: set against `bed`; with no bed, 0.5. */
  volume?: number;
  /**
   * When the bed is too loud for the ticks to be heard within the effect rule: one dip of the bed under the whole run
   * of ticks (at most 6 dB), not one a key. Default true with a bed; false keeps the bed whole and says so.
   */
  duck?: boolean;
};
```

## Camera and time

### camera

**Pans, zooms and whips of the whole scene, with text that stays put where it must.**

- Suits: Manual, Raw, Graphite, Kinetic, Courtside, Schematic.
- Works against: none named.
- Demo: [`examples/scenes/pointer.ts`](../examples/scenes/pointer.ts) (shared with box, arrow), 8 s, in Manual and Schematic: A pointer, told with box, arrow and camera: a stack slot holds an address, the arrow follows it down to the heap, and the camera travels with it.

Camera: pans and zooms the whole scene, so the view travels along a diagram or pushes in on a detail.
Schematic, Graphite and others name a camera move as their transition; this block is that move.

Rules this block enforces:
- One camera per scene. Moves run one after another; each holds until the next starts.
- x and y pan the view right and down in px (the content moves the other way); `zoom` scales about
  the frame centre. A move takes the system's move duration (times `scale`) on the move curve;
  a zoom never overshoots. In a one-frame system the view cuts.
- `tiltX` and `tiltY` (degrees) turn the whole view about its horizontal or vertical axis on the same move,
  with a fixed perspective (Graphite's slight 3D tilt: 4-6 degrees). Keep a tilt slight, and end it at 0 at rest.
- `whips`: fast pans of a few frames with motion blur along the travel only while the view moves (screen.whip).
  Only a system whose `allows` lists "motion-blur" (Courtside, Kinetic) may whip; elsewhere the block throws.
  The pan stays: after a whip of dx the view rests dx further on, and does not come back. So place each later shot
  at its own x in the world (with dx = the frame width: 0, 1080, 2160 at 9:16), and give a later move's x as a
  place in the world too. A move after a whip starts from where the whip left the view.
- The camera moves the view, not the layout: place every block where it sits in the world. Build the
  blocks that are read after a pan with withView(ctx, { x, y }) from context.ts, so they check the
  safe area of the view where the camera comes to rest. A caption that rides through moves is `pinned`.

```ts
export type CameraProps = {
  id?: string;
  /** Each stop: when the move starts, where the view goes, its tilt, and how long it takes (a multiple of the move duration). */
  moves: { at: number; x?: number; y?: number; zoom?: number; tiltX?: number; tiltY?: number; scale?: number }[];
  /** Whip pans: at `at`, the view travels dx, dy px in `frames` frames (default 5), blurred along the travel. The
   *  view stays there: place the next shot at its own x in the world. */
  whips?: Whip[];
};
```

### carry

**One thing that keeps its identity and moves from one layout to the next.**

- Suits: Primary, Kinetic.
- Works against: none named.
- Demo: [`examples/scenes/carry.ts`](../examples/scenes/carry.ts), 8 s, in Primary and Kinetic: A number and a bar carried from a statement into a calculation.

Carry: a match cut. One object (a box, a number, a word) moves and resizes from its place in one
layout to its place in the next, so a section change keeps continuity: the eye follows the object
across the cut instead of starting again.

The motion is in carryTracks() / carryMotion(), so any block's node can be carried. The `carry`
block draws one object (a text or a filled box) and carries it.

Rules this block enforces:
- The object keeps one identity: one node, moved only by x, y and scale tracks. A box uses scaleX and
  scaleY; a text uses scale only, so its letters never stretch.
- The node's own geometry is its last place, so at rest it sits exactly at the end box, at scale 1
  for a box. Every move pivots on the top-left corner (origin [0, 0]), so x and y are plain offsets.
- Moves come from the system: the "move" curve and duration. In a one-frame system the object jumps.
  An object that shows a quantity (exact) moves on a curve that never overshoots (rule 3).
- Text is never masked while it travels, and it keeps its role from end to end. To set a word at the
  size of another role, textPlace() scales it and keeps its baseline where that role's baseline is.

```ts
export type CarryProps = {
  id?: string;
  /** A text to carry. Set `role` too. Without a text, the block carries a filled box. */
  text?: string;
  role?: TypeRole;
  /** Text colour, or box fill. Default: ink for text, accent for a box. */
  color?: ColorRole;
  /** Corner radius of a box in px. It scales with the box while it moves. Default 0. */
  radius?: number;
  /** Where the object is first. For a text, use textPlace() so the width matches the words. */
  from: Box;
  /** Where it ends. */
  to: Box;
  /** When it starts to move from `from` to `to`. */
  at: number;
  /** More moves after `to`, in order. */
  then?: { to: Box; at: number }[];
  /** The object shows a quantity (a bar's length): it moves on a curve that never passes its place. */
  exact?: boolean;
  /** When it appears at `from`. Default: at the start of the film, with no entrance. */
  show?: number;
  until?: number;
  z?: number;
};
```

### wipe

**A wipe from one beat to the next, in the system's own manner.**

- Suits: Riso, Cutout, Pop, Noir.
- Works against: Studio (Studio never wipes; it dissolves or cuts on a held frame); Ma (Ma dissolves through the paper); Raw (Raw cuts; it never wipes); Title (Title changes cards by hard cuts, sometimes to black).
- Demo: [`examples/scenes/wipe.ts`](../examples/scenes/wipe.ts), 7 s, in Riso and Noir: Two units of distance, one after the other, with the system's own wipe between them.

Wipe: a transition. A flat shape sweeps across the frame, covers the old scene, and uncovers the next.
Each system wipes in its own way (its SYSTEM.md "Transitions" line):
- sweep (Spec, Graphite and the other quiet systems): a ground-coloured panel with a hairline edge.
  It erases the old scene and draws the new one in, like a scan.
- panel (Cutout, Kinetic, Courtside, Riso): a hard panel in ink or accent slides across. A wipe crosses the
  frame and leaves. A coloured panel that stays behind content (Courtside's volt ground) is not a wipe: use
  `ground({ color: "accent", at, until })`, with `enter`/`exit` "cut" or "dissolve".
- turn (Primary): a square in the accent slides on its axis and turns 90 degrees as it crosses.
- iris (Pop): a big round shape scales up from a point, covers the frame, then shrinks away.
- cut (Studio, Ma, Title, Console and the others that never wipe): nothing is drawn; the scenes cut.

Rules this block enforces:
- No blur, no gradient, no soft edge: one flat shape, and a hairline for the sweep.
- The shape never opens a gap: every leg uses a curve that does not overshoot, except the iris
  growing, where an overshoot only makes the cover larger.
- The shape is hidden while it waits off frame, so it adds nothing to the checks.
- Both renderers draw every text above every box, so a box cannot hide text. wipeTimes() says when
  the shape reaches each part of the frame, and wipeOut() hides old text as the shape passes it.
  The next scene starts each text with wipeTimes().show(box). See the report for the core change
  that would let a box cover text.
- In a one-frame system (ctx.instant) every move is a single frame.
- The shape draws in the overlay layer (1) by default, above all content. `layer` moves it: with
  layer -1 the panel slides in behind the content, and the content stays above it. Then check that the
  text still reads on the panel's colour (in Spec, Noir and Title the accent equals the ink).

```ts
export type WipeProps = {
  id?: string;
  /** When the shape starts to enter. */
  at: number;
  /** The frame edge the shape enters from (the name every block uses: shape, photo's sweep). Default "left". The iris ignores it. */
  from?: "left" | "right" | "top" | "bottom";
  /** The old form: the way the shape travels ("right" enters at the left edge). `from` wins when both are given. */
  direction?: "left" | "right" | "up" | "down";
  /** Default: the system's own way. */
  style?: WipeStyle;
  /** The shape's colour. Default: the system's own (ground for a sweep). */
  fill?: ColorRole;
  /** Seconds the frame stays covered. Default 2 frames. */
  hold?: number;
  /** For the iris: the point it grows from and shrinks to. Default: low on the right, away from where
   *  text starts, so text goes under it last and comes out first. */
  origin?: [number, number];
  /** Multiplies the leg durations. Default 1. */
  speed?: number;
  /** The draw layer of the shape: -1 backdrop, 0 content, 1 overlay (default). */
  layer?: number;
};
```

### hold

**A still stretch on purpose: it draws nothing and tells the checks the stillness is meant.**

- Suits: Ma, Mark, Title.
- Works against: Kinetic (Kinetic never holds still).
- Demo: [`examples/scenes/endCard.ts`](../examples/scenes/endCard.ts) (shared with endCard), 9.5 s, in Ma and Title: The end of a film: a word series on the beat, then the end card that lands on the last beat and holds.

Hold: marks a still stretch as deliberate. It draws nothing.

The HyperFrames check warns when nothing on screen changes for more than 3 s (dead_stretch). A calm
system (Ma, Nocturne, Title) often holds a frame still on purpose. A hold tells the check so: from `at`
to `until`, the still time does not count.

Rules this block enforces:
- It draws nothing in either renderer: one empty full-frame element with `data-hold`, behind
  everything and outside the camera. The element takes no pointer events, so it covers no text.
- It shows exactly from `at` to `until` (in one frame each way), so it excuses only that stretch.
  Without `until` it lasts to the end of the film.
- Use it only where the stillness is the design. A hold does not fix a scene that forgot to move.

```ts
export type HoldProps = {
  id?: string;
  /** When the deliberate stillness starts, in seconds. */
  at: number;
  /** When it ends. Default: the end of the film. */
  until?: number;
};
```

### reveal

**The film's main reveal time: it draws nothing and tells the checks where the answer lands.**

- Suits: Spec, Graphite.
- Works against: none named.
- Demo: [`examples/scenes/highlight.ts`](../examples/scenes/highlight.ts) (shared with highlight), 12.3 s, in Spec and Graphite: Three facts, one after another in the same place, each with one kind of emphasis on its number: an underline, a marker, a loop.

Reveal: declares the film's reveal time, so the checks read it. It draws nothing.

The checks look at the film's hero moments: the hook, the reveal and the last frame (subject-size, the music
drop on the reveal). Without a declared reveal they guess it from the largest entrance in the last third. A
scene states it with `B.reveal({ at })`.

Rules this block enforces:
- It draws nothing in either renderer: one anchor node with the id "reveal" and no size.
- `at` is the reveal time in seconds, the time of the picture's change (the music `peakAt` takes the same time).
- Declare one reveal per film. `of` names the block that is the reveal, when several things enter at its time.
- A kineticWords phrase shown at the reveal time must be the largest type of the film: the build warns when it is not
  (blocks/kineticWords.ts, size "hero").

```ts
export type RevealProps = {
  /** The time of the reveal, in seconds. */
  at: number;
  /** The block (its id) that is the reveal, when more than one thing enters then: the checks judge that one (a result
   *  line, not the chart labels that enter with it). A block that draws no text (a chart, a picture) is judged by the
   *  picture checks, not by the size of its type. */
  of?: string;
};
```

