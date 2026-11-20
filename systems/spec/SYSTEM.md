# Spec

A technical drawing of a product. Every element sits on the grid, labelled.

- **Mode:** light
- **Reference:** Vercel's Geist and Ship visuals, Rauno Freiberg and Evil Rabbit: a visible grid, hairlines, crosshairs, mono labels.
- **Palette:** White, black and a grey scale of hairlines; colour only for status.
- **Use it for:** changelog, launch, data-story, tutorial

## How this system builds a frame

- Draw the grid: hairline rules and + marks where lines cross.
- Mono labels in the margins name what is shown.
- Numbers are tabular and large.
- Colour appears only as a status (positive, negative).

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the main line in type by 0.5 s: the line in the display role. The subject, measured, on frame 0: a figure of it with one dimension line and its value (`photo` with `frame: "figure"` and a `dimension`), or the key number in tabular display figures with a dimension line under it, when the film has an honest key number at the start. Never a number the film does not yet have. The line of the question in display by 0.5 s.
- **One line and one subject:** centred. The pair stacks, line above, on the optical centre: take both boxes from `lineAndSubject(ctx, { lineH })`; the subject covers the hook's share of the frame (`heroBox`). Never strand them in the top third with the lower half empty.
- **Ends:** on a last event on screen that holds, held 1.5 s, the last change on a bar. A last comparison drawn on the sheet (the answer beside its reference, with its dimension), then a final tick and a hold. The block that does it: `dimension`, the answer's dimension drawn last, a final tick from `hit({ on })`, then `hold` to the end.
- **Stillness:** nothing holds still for more than 1.8 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -16 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Minimal and clean. Labels snap on its beats; the ticks are the only effects.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.55 s (the middle of the music's 100-120 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 1 distinct shot: a new angle or new content, never a new crop of one picture. One subject, drawn and photographed at one scale, so the match cut lands on the same pixels.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; the golden ratio; a generic dashboard. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Spec. Use at least two of them.

- The grid draws first: hairline rules and + marks where they cross; every element snaps to it. *Measurable* (`signature`): Hairlines at the column positions show in at least one key frame.
- Labels type on in mono at 40 characters a second, a tick as each one snaps. *Measurable* (`sound/cut-on-beat`): Each tick sits within 2 frames of its label's last character.
- A bordered figure window with a FIG. label holds the one picture. *Judged by eye.*
- A match cut: the picture cuts to the drawing on the same pixels, on a beat. *Judged by eye.*

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `sheet` | `grid`: "marks"; `titleBlock`: FIG., SCALE (fitDrawing's scale) and SHEET; `figures`: a number for each figure | The visible grid, its crosshairs and the title block, complete; fitDrawing fills the frame with the drawing. |
| `dimension` | `offset`: clear of the part; `text`: the value with its unit; `follow`: the part's keys when it moves | Dimension lines with their values. |
| `typeOn` | `pace`: "write" | Mono labels that write themselves. |
| `bigStat` | `format`: tabular, with the unit | The large number the film is about. |
| `callout` | `number`: the part's number; `label`: the part; `target`: a point on the part; `outside`: the drawing's box from fitDrawing | A label outside the drawing with a short leader to the part it names. |
| `photo` | `frame`: "figure"; `motion`: "still" | A reference picture in a bordered, labelled figure window. |
| `rope` | `run`: the stops: the fixed end, each wheel (a `pulley`: r from fitDrawing, `turns` from rollDegrees) with its turn, the free end; `light`: the part of the rope the film explains | An open rope over pulleys (wheels with no teeth that turn by key marks): a hoist, a crane, a winch. |

Do not use: `kineticWords` (Spec labels and draws; it does not shout words); `quote` (A technical drawing has no pull quote).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#FAFAFA` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#FDFDFD` | 1.0:1 | Panels and cards that sit on the ground. |
| `rule` | `#CCCCCC` | 1.5:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#161616` | 17.3:1 | All primary text and primary marks. |
| `inkMuted` | `#5D5D5D` | 6.3:1 | Secondary text: captions, labels, sources. |
| `accent` | `#161616` | 17.3:1 | Equals the ink: this system has no accent colour. Emphasise with size, weight or position. |
| `accentText` | `#161616` | 17.3:1 | Equals the ink: this system has no accent colour. Emphasise with size, weight or position. |
| `onAccent` | `#FAFAFA` | 17.3:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#161616` | 17.3:1 | Chart series 1 (the series that matters). |
| `series2` | `#555555` | 7.1:1 | Chart series 2. |
| `series3` | `#868686` | 3.5:1 | Chart series 3. |
| `series4` | `#B7B7B7` | 1.9:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#DEDEDE` | 1.3:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#218041` | 4.8:1 | A good change or a pass. Use only for status. |
| `negative` | `#CA3C36` | 4.8:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Geist | 12% | 130 px | 600 | -0.04em | 1 | as written |
| headline | Geist | 7% | 76 px | 600 | -0.025em | 1.08 | as written |
| body | Geist | 4.6% | 50 px | 400 | -0.005em | 1.35 | as written |
| label | Geist Mono | 3.4% | 37 px | 400 | 0em | 1.2 | upper |
| caption | Geist | 4.2% | 45 px | 500 | 0em | 1.3 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 7% of the short side (76 px at 1080).
- Grid: 12 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 6 px at 1080. Stroke: 2 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1844 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; square ends; at most 0.62 value line heights thick; a baseline of 0.5 strokes.
- Values in label, the key value in headline. A measured ruler (ticks and labels) on the value axis, always.
- Lines: the key line 2 strokes, context lines 0.75; short ticks at the axis; an open ring on the last point.
- Areas: a flat tint of the key colour over an opaque context fill. A dimension measures the gap between the key line and the next.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Crisp. Lines draw, labels type on, rows reveal 40 ms apart; nothing overshoots.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.23, 1, 0.32, 1)` | 14 |
| Move on screen | `cubic-bezier(0.65, 0, 0.35, 1)` | 22 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 10 |
| Stagger between items | | 2 |

Transitions: Hard cuts on the grid; a hairline wipe at most.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

None. 1 px hairlines and small + crosshairs at grid corners.

This system allows no effects: no blur, no shadow, no grain.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system spec`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Black and white, contrast 1: black on `ink` (#161616), white on `ground` (#FAFAFA). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (rare):** in a window (a box on the grid with a margin). A neutral grey picture in a bordered window on the grid, labelled like a figure. Motion: still.
- **Footage (none):** No footage.
- **Music:** minimal electronic, clean, precise, 100-120 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** tick, click, at most 6 in 10 s. A tick when a label snaps to the grid. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 9 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.2 s plus 0.28 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "spec"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Geist (400, 500, 600); Geist Mono (400); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- Colour as emphasis. This system has no accent colour.
