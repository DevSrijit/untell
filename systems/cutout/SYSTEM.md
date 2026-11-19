# Cutout

One idea per shape. Flat cut paper slides, rotates and builds the title.

- **Mode:** light
- **Reference:** Saul Bass title sequences (Anatomy of a Murder, North by Northwest): cut paper, one hot colour.
- **Palette:** Off-white paper, black cut shapes, one hot orange-red.
- **Use it for:** title-sequence, trailer, logo-sting, quote-card

## How this system builds a frame

- Silhouettes, not illustrations.
- Type is angled and fitted into shapes.
- One hot colour, used once per frame.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the main line in type by 1 s: the line in the display role. A black slab enters on frame 0 with the first word of the main line already fitted into it, cropped by the slab's edges.
- **One line and one subject:** centred. The slab is the subject: a cut shape at the hook's share (heroBox, a graphic), and the line is fitted into it (fitText: ground on the ink slab, onAccent on the hot slab), as large as the slab allows, angled with it. Never a line stacked above a shape. The hot colour once in the frame: the slab that carries the word. Never strand them in the top third with the lower half empty.
- **Ends:** on a lockup (the subject or mark with the name on one axis), held 1.5 s, the last change on a bar. The title locks as one lockup on the bar, with a stamp, and holds. The block that does it: `lockup`, `axis: "row"`, `at` on the bar, with a stamp from `hit`.
- **Stillness:** nothing holds still for more than 1.5 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -16 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Big-band and tense. The busiest picture goes on the busiest bars.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.45 s (the middle of the music's 110-150 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 1 distinct shot: a new angle or new content, never a new crop of one picture. One silhouette per subject, in two tones, cut as paper.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a generic movie title with no story. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Cutout. Use at least two of them.

- Type is fitted into the shapes, as large as the slab allows, angled with it. *Judged by eye.*
- A black shape wipes across and becomes the next shape: the panel holds full cover for 2 frames at most. *Measurable* (`accident`): No run of more than 2 frames in one flat colour.
- Shapes slide in from the frame edge on a stepped 12 fps feel, fully opaque. *Measurable* (`signature`): No sliding shape is at partial opacity.
- One hot colour, used once per frame, as the action. *Measurable* (`signature`): The accent covers one connected region per key frame.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `shape` | `enter`: "slide"; `kind`: "rect" or "triangle"; `fill`: "accent" for the one hot slab (the action, once a frame), "ink" for the rest | The cut paper slabs. |
| `wipe` | `style`: "panel"; `direction`: the travel of the next shape | The black shape that becomes the next frame. |
| `kineticWords` | `onAccent`: true on a hot slab | Names that fill their slab. |
| `hit` | defaults | A paper slide on each crossing, a stamp when the title locks. |
| `fitText` | `role`: "display"; `enter`: "cut"; `color`: "ground" on the ink slab, "onAccent" on an accent slab (ink on ink does not show); `x`: the slab's box (x, y, w, h) | The largest type inside a slab. |
| `lockup` | `axis`: "row"; `mark`: the slab's shape; `slab`: "ink" (the title cut in one slab); `lines`: 2 for a title of three words or more | The title as one cut: words at one size in one slab. |
| `photo` | `paper`: true (the subject as a two-tone paper cut; needs the cut-out from prepare); `shape`: "circle", "square" or "triangle"; `motion`: "still"; `enter`: "cut" | A picture (rare): a cut-out as flat cut paper, cropped to a shape, small in a large empty field. Never a graded photograph at full size. |

Do not use: `lineChart` (Cut paper does not plot data).

Not in the catalog yet. Until a block exists, build the nearest thing from the blocks above, and say in a comment what is missing:

- **fitText in a tilted band**: The largest type inside a tilted band or a polygon; fitText fills an upright box only.

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#F2EEE6` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#F9F5EC` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#C4C0B8` | 1.6:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#110F0E` | 16.5:1 | All primary text and primary marks. |
| `inkMuted` | `#514C48` | 7.3:1 | Secondary text: captions, labels, sources. |
| `accent` | `#E14E00` | 3.4:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#BA3900` | 4.9:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#0F0D0C` | 4.9:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#E14E00` | 3.4:1 | Chart series 1 (the series that matters). |
| `series2` | `#171613` | 15.6:1 | Chart series 2. |
| `series3` | `#494744` | 8.0:1 | Chart series 3. |
| `series4` | `#A6A4A0` | 2.2:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#D3D1CD` | 1.3:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#107537` | 5.0:1 | A good change or a pass. Use only for status. |
| `negative` | `#BC2D2A` | 5.1:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Bebas Neue | 17% | 184 px | 400 | 0.01em | 0.92 | upper |
| headline | Bebas Neue | 10% | 108 px | 400 | 0.02em | 0.95 | upper |
| body | Archivo | 4.5% | 49 px | 500 | 0em | 1.3 | as written |
| label | Archivo | 3.6% | 39 px | 600 | 0.06em | 1.2 | upper |
| caption | Archivo | 4.2% | 45 px | 500 | 0em | 1.3 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the body face has a true italic, and `quote` sets its `emphasis` word in it. The display and headline faces have none: there the word takes the accent text colour (`accentText`). Never slant a face that has no italic file.

## Layout

- Margin: 7% of the short side (76 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 8 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1844 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

This system has no chart hand of its own; the chart blocks draw in the plain hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; the system radius, at most a quarter of the bar; at most 1.15 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 3 strokes, context lines 1.25; the scale labels only, no gridlines; a dot on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Sharp moves, a stepped 12 fps feel, shapes sliding in from the frame edge.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.7, 0, 0.3, 1)` | 12 |
| Move on screen | `cubic-bezier(0.7, 0, 0.3, 1)` | 18 |
| Exit | `cubic-bezier(0.7, 0, 0.3, 1)` | 10 |
| Stagger between items | | 4 |

Transitions: A black shape wipes across and becomes the next shape.

**Frame step: 12 fps.** Every tween holds on a 12 fps grid, like paper shot on twos. Both renderers apply it (`step` in tokens.json); do not write your own stepper. The frame redraws only on its ticks (every 2 or 3 frames): a change at a beat, a cut or `onCut(t)` shows on the first tick at or after the frame it asks for, up to 2 frames (0.07 s) later. `beats()` and `onCut` give frame times, not tick times; the checks read the frames as drawn, so a cut on a beat that lands between ticks is read on its tick.

**Opaque.** Shapes and text never fade: every opacity change is a cut. Both renderers apply it (`opaque` in tokens.json); do not tween opacity.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

Slight paper edge irregularity. Grain strength: 0.04. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **grain**: Film or paper grain over the whole frame.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system cutout`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Flat cut paper: two or three flat tones, no gradient: `ink` (#110F0E) → `accent` (#E14E00) → `ground` (#F2EEE6) (dark to light). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (rare):** cropped to a circle, square or triangle; small in a large empty field. A subject becomes flat cut paper in three tones (ink, the orange, paper), like the shapes, never a photograph. Cut-outs allowed. Motion: still.
- **Footage (none):** No footage: the shapes move, not a camera.
- **Music:** big-band jazz, bongos and brass stabs, cool and tense, 110-150 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** whoosh, stamp, at most 4 in 10 s. A paper slide (soft whoosh) when a shape crosses; a stamp when the title locks. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 5 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.2 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "cutout"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Bebas Neue (400); Archivo (500, 600); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.

This system breaks the default rule "cream-with-warm-accent" on purpose: Saul Bass's palette is the reference itself: off-white stock, black and one orange-red, used as hard-edged cut paper, never as a soft UI accent.
