# Graphite

A calm, dense product shown honestly. The UI is the hero; the camera tilts slightly.

- **Mode:** dark
- **Reference:** Linear's launch films and site: a quiet graphite interface, 1 px borders, real UI at readable size.
- **Palette:** Graphite ground, white type, a grey scale, one green for the one thing that matters.
- **Use it for:** app-demo, changelog, launch
- **Needs from you:** Real screenshots, or the real UI built with uiWindow (the product's own names, rows and states). A built window counts as real UI: a product with no screenshots needs none.

## How this system builds a frame

- Real UI, shown at a readable size, is the subject.
- A headline sits above or beside the UI, never over it.
- The accent marks one element per scene.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show a picture and the main line by 1 s: the line in the headline role, the picture on at least 30 % of the frame. Real, dense UI at a readable size on frame 0, with the headline in its slot above it.
- **One line and one subject:** top. The line at the text-safe top; the window under it is a graphic, so it may run past the text-safe sides to cover the hook's share. At 9:16 the window (uiWindow with no box) fills 59 % of the frame: the picture-safe width, from one gap under a two-line line to the picture-safe foot. It is filled with rows to the text-safe foot (never an empty panel: 5 one-line rows, or 3 two-line rows with a detail), the list runs on under the fold as row rules with no text, and the rows' text keeps to the text-safe area, the low band's right edge included. A second screen of the app replaces the first in the same box. Never strand them in the top third with the lower half empty.
- **Ends:** on a last event on screen that holds, held 1.5 s, the last change on a bar. The last action completes (a count ticks to its end state), and the window settles with the name and line above it. The block that does it: `cursor`, the last click completes the action on the last bar; the window holds with the name above it.
- **Stillness:** nothing holds still for more than 1.6 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -16 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Calm electronic; cuts on its beats. A click only on a real cursor click.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.6 s (the middle of the music's 88-110 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 2 distinct shots: a new angle or new content, never a new crop of one picture. One product: every screen from the same app, in the same theme and at the same scale.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a to-do app; a kanban board with no story. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Graphite. Use at least two of them.

- The camera glides between panels with a slight 3D tilt that eases back to 0 at rest; the UI never empties for the move. *Measurable* (`message-gap`): A sentence and the UI stay on screen through every glide.
- UI builds in 250-400 ms, and cuts land on the beat. *Measurable* (`sound/cut-on-beat`): Cuts sit within 2 frames of a beat.
- The accent marks one element per scene. *Measurable* (`signature`): The accent covers one connected region per key frame.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `photo` | `media`: a real screenshot, prepared as-is | Real UI as the subject. |
| `camera` | `moves`: glides on the move curve; `tiltX`: a slight tilt, 4-6 degrees, back to 0 at rest; `tiltY`: the same | The glide to the next panel. |
| `title` | `maxLines`: 2; `pinned`: true, so the headline rides through the glides | The headline in a fixed slot, changed by a cut on the beat. |
| `uiWindow` | `title`: the view's name; `rows`: the list it shows: the rows fill the window to its foot (never an empty panel); give no box, so the window takes the system's (windowBox: under the line, to the text-safe foot, across the picture-safe width) and a second screen keeps it; `sidebar`: its width, when the app has one; `replaces`: the window this screen follows: the frame stays, the old content leaves and the new enters, never both at once; `enter`: "cut" for a hard change of screen | The app window: 1 px borders, the system's own head (a title and a rule, a tab strip, or none), its rows. No title-bar dots. A second screen of the same window replaces the first. |
| `listRow` | `initials`: the person; `badge`: a status (tone "accent" on the one row that matters); `selected`: the row the cursor picks: one row at a time (uiWindow rows throws on two; multi: true for a list that selects many) | Dense rows that fit their names, given to uiWindow as `rows`; the selected one has the accent bar and says state "selected". |
| `cursor` | `path`: the points it moves to; `to` a part's id to click it clear of its text; `targets`: the scene's nodes; `clicks`: the click times | One continuous action that clicks; with button, tab and toast from the ui kit. |

Do not use: `barChart` (A product film shows the product working, not a chart); `kineticWords` (Graphite is calm).

Not in the catalog yet. Until a block exists, build the nearest thing from the blocks above, and say in a comment what is missing:

- **ui sidebar list**: A sidebar with sections and counts, and avatars with pictures; the ui kit has the window, rows with initials and a cursor.

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#0E0F12` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#1A1A1D` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#343538` | 1.6:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#EDEEF2` | 16.5:1 | All primary text and primary marks. |
| `inkMuted` | `#97989B` | 6.6:1 | Secondary text: captions, labels, sources. |
| `accent` | `#47C58C` | 8.8:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#61D19A` | 10.1:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#0E0F12` | 8.8:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#47C58C` | 8.8:1 | Chart series 1 (the series that matters). |
| `series2` | `#EDEEF1` | 16.5:1 | Chart series 2. |
| `series3` | `#ADAEB0` | 8.6:1 | Chart series 3. |
| `series4` | `#68696B` | 3.5:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#3C3D3F` | 1.8:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 9.1:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 6.2:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Geist | 11% | 119 px | 600 | -0.035em | 1.02 | as written |
| headline | Geist | 7% | 76 px | 600 | -0.02em | 1.08 | as written |
| body | Geist | 4.5% | 49 px | 400 | -0.005em | 1.35 | as written |
| label | Geist | 3.6% | 39 px | 500 | 0em | 1.2 | as written |
| caption | Geist | 4.2% | 45 px | 500 | 0em | 1.3 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 7% of the short side (76 px at 1080).
- Grid: 12 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 12 px at 1080. Stroke: 2 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1844 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; the system radius, at most a quarter of the bar; at most 1 value line heights thick; no baseline (the bars share one edge).
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 1.5 strokes, context lines 1; hairline rules across the plot; an open ring on the last point.
- Areas: a flat tint of the key colour over an opaque context fill. The current value sits on a pill in the key colour.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

UI builds in 250-400 ms; panels slide on a slight 3D tilt; cuts land on the beat.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.23, 1, 0.32, 1)` | 12 |
| Move on screen | `cubic-bezier(0.65, 0, 0.35, 1)` | 22 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 10 |
| Stagger between items | | 3 |

Transitions: Cut on the beat, or the camera glides to the next panel.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

A very fine grain. Borders are 1 px; never glowing. Grain strength: 0.025. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **grain**: Film or paper grain over the whole frame.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system graphite`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Not graded: screenshots and screen recordings are evidence, shown as they are. Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (hero):** in a window (a box on the grid with a margin). Real UI screenshots, ungraded, in a window with a 1 px border; or the UI itself, built with uiWindow from the product's real names and states (a built window counts as real UI). The camera tracks the cursor. Motion: drift.
- **Footage (support):** Screen recordings of the real product, ungraded. Speed: real.
- **Music:** calm ambient electronic, warm pads, restrained, 88-110 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** click, at most 4 in 10 s. A soft click only on a real cursor click on screen. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 8 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.3 s plus 0.28 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "graphite"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Geist (400, 500, 600); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.
