# Riso

Printed by hand. Off-register layers stamp in one after another.

- **Mode:** light
- **Reference:** Risograph printing: two flat inks on uncoated paper that overprint into a third colour.
- **Palette:** Uncoated white paper, fluorescent pink and teal inks that overprint, riso black for type.
- **Use it for:** music-lyric, ad, title-sequence, loop

## How this system builds a frame

- Two inks only, multiplied where they overlap.
- Shapes are flat; tone comes from halftone, not gradients.
- Type is ink, not a screen colour.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the main line in type by 0.5 s: the line in the display role. The main line (the name, when the film has one) in one ink on frame 0, large and cropped by the sheet edge. The other inks print the rest on the beats.
- **One line and one subject:** picture. The print fills the frame under a band of paper at the top (lineInBand: the photo takes the picture box): the line in display, large, on the paper, where the print's inks are knocked out, as a two-colour print sets type. Ink over ink takes the line's contrast, so never set the line on the print. Never strand them in the top third with the lower half empty.
- **Ends:** on a last event on screen that holds, held 1.5 s, the last change on a bar. The finished print: the last ink stamps on the bar, and the full sheet holds. Never blank paper. The block that does it: `shape`, the last ink layer stamps (`enter: "cut"`) on the bar; the full sheet holds.
- **Stillness:** nothing holds still for more than 1.5 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -16 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Dusty and warm. Each stamp lands on a beat; stamp again on each strong onset through a hold.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.65 s (the middle of the music's 80-98 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 2 distinct shots: a new angle or new content, never a new crop of one picture. Each picture in the same two inks and halftone screen.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a print fair poster with no date or place. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Riso. Use at least two of them.

- One ink a beat: each layer stamps in one frame on a beat, never fades. *Measurable* (`sound/cut-on-beat`): Each new layer appears in one frame, within 2 frames of a beat.
- Inks multiply where they overlap, 1-3 px off register. *Measurable* (`signature`): The overprint colour (both inks multiplied) shows in at least one key frame.
- Tone comes from halftone dots, never a smooth gradient. (effect: halftone) *Judged by eye.*
- Motion steps at 12 fps. *Measurable* (`signature`): Moving things change on every second or third frame only.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `photo` | `motion`: "still"; `passes`: { beat: one bar }: one halftone layer per ink, overprinted | The hero picture, printed ink by ink. |
| `shape` | `enter`: "cut"; `layer`: per ink | Flat ink shapes that stamp. |
| `wipe` | `style`: "cut"; `fill`: one ink | A new ink layer that stamps over the old one. |
| `text` | `role`: "display" | Type as ink. |
| `hit` | defaults | A dull stamp as each ink prints. |

Do not use: `kineticWords` (Its rolls and pops tween every frame; print steps).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#F3F2ED` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#FAF8F4` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#C5C4C0` | 1.6:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#1F1C1D` | 15.1:1 | All primary text and primary marks. |
| `inkMuted` | `#585455` | 6.7:1 | Secondary text: captions, labels, sources. |
| `accent` | `#EA5098` | 3.1:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accent2` | `#008B91` | 3.7:1 | The second ink or primary. Each colour keeps one meaning for the whole film. |
| `accentText` | `#BD2073` | 5.2:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#1A1718` | 5.2:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#EA5098` | 3.1:1 | Chart series 1 (the series that matters). |
| `series2` | `#008B91` | 3.7:1 | Chart series 2. |
| `series3` | `#1F1C1D` | 15.1:1 | Chart series 3. |
| `series4` | `#BFBEB9` | 1.7:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#46496D` | 7.7:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#107537` | 5.2:1 | A good change or a pass. Use only for status. |
| `negative` | `#BC2D2A` | 5.3:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Bricolage Grotesque | 13% | 140 px | 800 | -0.03em | 0.96 | as written |
| headline | Bricolage Grotesque | 8% | 86 px | 700 | -0.02em | 1.02 | as written |
| body | Space Grotesk | 4.5% | 49 px | 500 | 0em | 1.3 | as written |
| label | Space Grotesk | 3.6% | 39 px | 600 | 0em | 1.2 | upper |
| caption | Space Grotesk | 4.2% | 45 px | 500 | 0em | 1.3 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: no statement face (display, headline, body) has a true italic. For `quote`'s `emphasis`, the word takes the accent text colour (`accentText`). Never slant a face that has no italic file.

## Layout

- Margin: 7% of the short side (76 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 4 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1844 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: flat inks multiplied where they overlap, the context in the second ink; square ends; at most 1.5 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 2 strokes, context lines 2; the scale labels only, no gridlines; a square on the last point.
- Areas: each area in its own ink, multiplied, so the inks overprint where the areas cross.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Stamped: stepped motion at 12 fps, layers snapping in one by one, 1-3 px misregistration.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.3, 1.2, 0.5, 1)` | 6 |
| Move on screen | `cubic-bezier(0.6, 0, 0.4, 1)` | 12 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 6 |
| Stagger between items | | 4 |

Transitions: A new ink layer stamps over the old one.

**Frame step: 12 fps.** Every tween holds on a 12 fps grid, like paper shot on twos. Both renderers apply it (`step` in tokens.json); do not write your own stepper. The frame redraws only on its ticks (every 2 or 3 frames): a change at a beat, a cut or `onCut(t)` shows on the first tick at or after the frame it asks for, up to 2 frames (0.07 s) later. `beats()` and `onCut` give frame times, not tick times; the checks read the frames as drawn, so a cut on a beat that lands between ticks is read on its tick.

**Opaque.** Shapes and text never fade: every opacity change is a cut. Both renderers apply it (`opaque` in tokens.json); do not tween opacity.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

Grain, halftone dots and slight misregistration between inks. Grain strength: 0.07. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **halftone**: Halftone dots for tone, as in print.
- **grain**: Film or paper grain over the whole frame.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system riso`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Luminance through the inks: `series2` (#008B91) → `accent` (#EA5098) → `ground` (#F3F2ED) (dark to light). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (hero):** full bleed (fills the frame); in a window (a box on the grid with a margin). Two inks on paper: shadows in one ink, highlights in the other, off-register. Motion: still.
- **Footage (rare):** A short clip printed in the same two inks. Speed: real.
- **Music:** lo-fi hip-hop, dusty drums, warm, handmade, 80-98 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** stamp, at most 4 in 10 s. A dull stamp as each ink layer prints. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 6 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.2 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "riso"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Bricolage Grotesque (700, 800); Space Grotesk (500, 600); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame, except where the system's inks each carry their own meaning.
