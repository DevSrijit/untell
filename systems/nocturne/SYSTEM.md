# Nocturne

A considered statement. Words fade in one by one in a large serif.

- **Mode:** dark
- **Reference:** Editorial studio work in dark mode (Instrument, Koto): large serif statements, a small sans caption, a thin rule.
- **Palette:** Warm black ground, warm white serif type, one stone grey.
- **Use it for:** quote-card, presentation, captioned-clip, launch

## How this system builds a frame

- A large serif statement is the image.
- A small sans caption names the speaker or source, under a thin rule.
- No decoration.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the main line in type by 1 s: the line in the display role. The film's statement on frame 0, fitted to the safe width, its first word on a strong onset.
- **One line and one subject:** fill. The statement is the image: the quote in the large serif fills the text-safe width (quote fits each statement to it), the speaker under a thin rule. On the dark ground, or on one picture: `quote({ picture })` sets the picture under the statement as the field that fills the frame, dimmed behind type, the statement on it at the same width. Never a picture stacked under the statement or across its edge, and no plate behind the words (no decoration). Never strand them in the top third with the lower half empty.
- **Ends:** on a held card, held 2 s. The last statement as a quote card, with the rule, name and role arriving with it and staying to the end. The block that does it: `quote`, the last statement as the card, with the rule, name and role, held to the end.
- **Stillness:** nothing holds still for more than 3 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -20 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: a bed under the picture. Enter the track (`section`): open on the start of a section with energy, not a quiet intro: `music({ align: { track: <section start>, film: 0 } })` (sections from `listen.md` or `beats().sections`); the reveal need not sit on a drop. Ambient piano. No effects: the words arrive in silence over the bed.
- **With no sound:** the moves above assume a bed under the picture. With none, keep a steady beat of your own: a constant `BEAT` of about 0.85 s (the middle of the music's 60-84 BPM), and time the moves on its multiples. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 2 distinct shots: a new angle or new content, never a new crop of one picture. One place: outside and inside share one axis and one light.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a quote from a famous person. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Nocturne. Use at least two of them.

- The key word in the italic of the serif, at full ink: never a colour darker than the ink. *Judged by eye.*
- A statement fitted to the width: display size set so the line spans the safe width. *Measurable* (`signature`): The statement's ink spans at least 85 % of the safe width.
- Words fade in one after another, 80 ms apart. *Judged by eye.*
- A slow fade through the ground between statements. *Judged by eye.*

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `quote` | `enter`: "word"; `role`: "display"; `statements`: one per scene; `picture`: the picture under the statements (each statement may change it); `emphasis`: the key word, set in the italic of the serif | The statements, word by word, fitted to the width; on a picture that fills the frame. |
| `rule` | defaults | The thin rule above the caption. |
| `photo` | `dim`: true; `motion`: "push"; `enter`: "dissolve" | A picture on its own, between statements. Under a statement, use quote's `picture`. |
| `music` | defaults | The bed, with the first word of each statement on a strong onset. |
| `fitText` | `role`: "display"; `enter`: "fade" | Display type sized to fill the safe width. |

Do not use: `kineticWords` (Nocturne arrives word by word, slowly); `barChart` (The statement is the image).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#0F0D0C` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#1A1816` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#343231` | 1.5:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#EBE7DF` | 15.7:1 | All primary text and primary marks. |
| `inkMuted` | `#8F8C85` | 5.8:1 | Secondary text: captions, labels, sources. |
| `accent` | `#CFBAA3` | 10.3:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#CFBAA3` | 10.3:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#0F0D0C` | 10.3:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#CFBAA3` | 10.3:1 | Chart series 1 (the series that matters). |
| `series2` | `#F0EEEC` | 16.8:1 | Chart series 2. |
| `series3` | `#B0ADAB` | 8.7:1 | Chart series 3. |
| `series4` | `#6B6867` | 3.5:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#3F3D3B` | 1.8:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 9.2:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 6.2:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Instrument Serif | 12% | 130 px | 400 | -0.02em | 1.02 | as written |
| headline | Instrument Serif | 8% | 86 px | 400 | -0.015em | 1.06 | as written |
| body | Instrument Sans | 4.4% | 48 px | 400 | 0em | 1.4 | as written |
| label | Instrument Sans | 3.4% | 37 px | 500 | 0.08em | 1.2 | upper |
| caption | Instrument Sans | 4.2% | 45 px | 400 | 0em | 1.35 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans, Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 10% of the short side (108 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 1 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1812 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

This system has no chart hand of its own; the chart blocks draw in the plain hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; the system radius, at most a quarter of the bar; at most 1.15 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 3 strokes, context lines 1.25; the scale labels only, no gridlines; a dot on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Word-by-word fades 80 ms apart, 500 ms ease-out; the camera barely moves.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.25, 0.1, 0.25, 1)` | 16 |
| Move on screen | `cubic-bezier(0.65, 0, 0.35, 1)` | 30 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 12 |
| Stagger between items | | 3 |

Transitions: A slow fade through the ground.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

A slight grain. Grain strength: 0.03. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **grain**: Film or paper grain over the whole frame.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system nocturne`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Colour, tamed: saturation 0.3, contrast 2, warmth 0.35; black on `ground` (#0F0D0C), white on `inkMuted` (#8F8C85). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (support):** full frame behind the type, dimmed so the type reads; small in a large empty field. A dark, warm photograph behind the serif statement, dimmed so the words read: a slow push toward it while the words arrive. Motion: push.
- **Footage (support):** Slow, dark atmosphere: a window at night, smoke, a street light. Speed: slow.
- **Music:** ambient piano and soft strings, nocturnal, reflective, 60-84 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** none. No effects: the words arrive in silence over the bed. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 12 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.8 s plus 0.32 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "nocturne"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Instrument Serif (400); Instrument Sans (400, 500); Noto Sans (400); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.
