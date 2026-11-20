# Primary

Geometry that explains. Circles, squares and triangles move in 90-degree steps.

- **Mode:** light
- **Reference:** Bauhaus posters (Herbert Bayer, Joost Schmidt): geometry, diagonals, three primaries on paper.
- **Palette:** Cream paper, black, and flat red, yellow and blue as blocks.
- **Use it for:** explainer, ad, title-sequence, presentation

## How this system builds a frame

- Build with circle, square and triangle only.
- Type sits on a 45- or 90-degree axis.
- Each colour has one meaning in the film.
- No shadows, no gradients.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show a picture and the main line by 1 s: the line in the headline role, the picture on at least 30 % of the frame. A large primary shape, off centre, with the question set on a 45-degree axis along its edge, on frame 0. The hook check counts one shape, or the parts of one block, that cover 30 % of the frame: two blocks side by side (a square and a band) do not add up.
- **One line and one subject:** centred. Off centre, as the hook asks: take both boxes from `lineAndSubject(ctx, { lineH })`, then move the shape to one side until its edge passes the frame's edge (a shape is a graphic: it may leave the frame); the line keeps the text-safe side, clear of the shape. Never strand them in the top third with the lower half empty.
- **Ends:** on a last event on screen that holds, held 1.5 s, the last change on a bar. The proof completes in one flat colour on the last beat, with the result set inside the shape. The block that does it: `shape`, the last shape lands on the last beat with the result set inside it (`text` over it).
- **Stillness:** nothing holds still for more than 1.6 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -16 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Precise and playful. Every turn and landing sits on its beats.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.55 s (the middle of the music's 96-124 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 1 distinct shot: a new angle or new content, never a new crop of one picture. If a photo comes, its subject turns into the shapes in place, in the system's flat colours.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; the area of a circle by wedges, unless the film shows the wedges straighten. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Primary. Use at least two of them.

- Shapes turn in 90-degree steps, with a click on each step. *Measurable* (`sound/cut-on-beat`): Each turn lands on a beat, and a click sits within 2 frames of it.
- Type sits on a 45- or 90-degree axis. *Judged by eye.*
- A shape sweeps across and becomes the next frame. *Judged by eye.*
- Shapes enter opaque: they slide or grow, never fade. *Measurable* (`signature`): No shape is at partial opacity for more than 2 frames.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `shape` | `kind`: "circle", "square" or "triangle"; `enter`: "slide" or "grow"; `turns`: 90-degree steps on beats | The whole film is built from the three shapes. |
| `carry` | `then`: the next place on the next beat | A label that rides a shape to its next place. |
| `highlight` | `style`: "underline" | One word marked by its colour's meaning. |
| `hit` | defaults | A click on each turn, a pop when a shape lands. |
| `formula` | `text`: the measure or the rule; `follow`: the shape's x and y keys | A label that stays on a shape's edge while it moves; dimension for a measured edge. |
| `title` | `angle`: -45 (rises to the right) or 90; `w`: the room along the axis | Type on a 45-degree axis: the title turns as one unit, and its safe-area check turns with it. |

Do not use: `lineChart` (Bauhaus shows with geometry, not with plotted data); `kineticWords` (Type sits on an axis and turns in steps; it does not roll or pop).

Not in the catalog yet. Until a block exists, build the nearest thing from the blocks above, and say in a comment what is missing:

- **morph**: One shape that becomes the next (a circle cut into wedges that become a rectangle).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#F0EBDC` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#F7F2E3` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#C3BDB0` | 1.6:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#13110F` | 15.8:1 | All primary text and primary marks. |
| `inkMuted` | `#4F4D47` | 7.1:1 | Secondary text: captions, labels, sources. |
| `accent` | `#CC2827` | 4.5:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accent2` | `#F4CE23` | 1.3:1 | The second ink or primary. Each colour keeps one meaning for the whole film. |
| `accent3` | `#194CB1` | 6.5:1 | The third ink or primary. Each colour keeps one meaning for the whole film. |
| `accentText` | `#BB0916` | 5.6:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#F8F5EE` | 4.9:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#CC2827` | 4.5:1 | Chart series 1 (the series that matters). |
| `series2` | `#194CB1` | 6.5:1 | Chart series 2. |
| `series3` | `#F4CE23` | 1.3:1 | Chart series 3. |
| `series4` | `#13110F` | 15.8:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#A7A49E` | 2.1:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#107537` | 4.9:1 | A good change or a pass. Use only for status. |
| `negative` | `#BC2D2A` | 5.0:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Jost | 13% | 140 px | 700 | -0.01em | 0.98 | upper |
| headline | Jost | 8% | 86 px | 700 | 0em | 1 | upper |
| body | Jost | 4.6% | 50 px | 500 | 0em | 1.3 | as written |
| label | Jost | 3.6% | 39 px | 600 | 0.04em | 1.2 | upper |
| caption | Jost | 4.2% | 45 px | 500 | 0em | 1.3 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 7% of the short side (76 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 6 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1844 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; square ends; at most 1.4 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 1.5 strokes, context lines 1; the scale labels only, no gridlines; a square on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Snappy and geometric: shapes slide on axes and turn in 90-degree steps; no bounce.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.2, 0.9, 0.3, 1)` | 10 |
| Move on screen | `cubic-bezier(0.7, 0, 0.3, 1)` | 16 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 8 |
| Stagger between items | | 3 |

Transitions: A shape sweeps across and becomes the next frame.

**Opaque.** Shapes and text never fade: every opacity change is a cut. Both renderers apply it (`opaque` in tokens.json); do not tween opacity.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

A slight print grain. Grain strength: 0.04. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **grain**: Film or paper grain over the whole frame.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system primary`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Luminance through the inks: `ink` (#13110F) → `ground` (#F0EBDC) (dark to light). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (support):** cropped to a circle, square or triangle. Black and white photomontage cut into a circle, a square or a triangle, set at an angle. Motion: still.
- **Footage (rare):** A shape-cropped clip at most. Speed: real.
- **Music:** playful modern minimal, pizzicato and marimba, precise, 96-124 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** click, pop, at most 4 in 10 s. A click on each 90-degree turn; a pop when a shape lands. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 6 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.3 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "primary"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Jost (500, 600, 700); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame, except where the system's inks each carry their own meaning.

This system breaks the default rule "cream-with-warm-accent" on purpose: Bauhaus posters are printed on cream stock with primary red; yellow and blue sit beside it, so it is not the cream-and-terracotta default.
