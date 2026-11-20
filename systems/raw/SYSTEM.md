# Raw

Unpolished on purpose, exact in its spacing. Text appears in one frame.

- **Mode:** light
- **Reference:** Brutalist web design: default fonts, visible borders, tables and links, set with precision.
- **Palette:** White, black and one link blue.
- **Use it for:** ad, trailer, changelog, presentation

## How this system builds a frame

- Borders and tables are visible structure.
- Text is left-aligned and unstyled beyond weight.
- Links are underlined blue; nothing else is coloured.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the main line in type by 0.5 s: the line in the headline role. A full page on frame 0: borders, the first line typing with its cursor, and under it what the page holds (a table, a list or a form, whichever the film has).
- **One line and one subject:** centred. A full page: the typed line and, under it, a table; the page's border round both (B.measure plus a pad), its middle on the optical centre. At 9:16 the page keeps to the low band's text-safe right edge. Never an empty page. Never strand them in the top third with the lower half empty.
- **Ends:** on a last event on screen that holds, held 1.5 s. A default form or link the viewer can act on, the button pressed in one frame, then the name as a heading. Never a broken image. The block that does it: `typeOn`, the name types as a heading (`cursor: true`) after the button press.
- **Stillness:** nothing holds still for more than 1.5 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -26 LUFS for the whole mix (within 4 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: none: this system has no music. Enter the track (`none`): no music. No music. Plain clicks only, at most six in 10 s, so the film is near silent.
- **With no sound:** this system has no music: a film with no sound is what it asks, and needs no statement. Leave out `music`; its few effects stay optional.
- **Shots:** a film of 10 s or more with pictures has at least 2 distinct shots: a new angle or new content, never a new crop of one picture. Pictures on one page share one light and one colour cast.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a personal homepage with no news. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Raw. Use at least two of them.

- Text types on with a block cursor at a human pace; the cursor is the only constant motion. *Measurable* (`signature`): Text grows one character at a time while it types, and a cursor blinks at its end.
- Hard cuts and one-frame appearances; nothing tweens. *Measurable* (`signature`): No element is at partial opacity on any frame.
- A page-down: the whole page jumps one screen in one frame. *Judged by eye.*
- Every edge sits on two verticals; the page is crude in style and exact in alignment. *Measurable* (`panel-near-miss`): No two edges sit 1-8 px apart.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `typeOn` | `cursor`: true; `pace`: "human"; `role`: "headline" for the line of the hook (the default label is for small print) | Every line that writes itself. |
| `box` | `stroke`: "ink"; `x`: round its content: B.measure of the typed lines and the table, plus a pad; never an empty page | Visible borders and table cells. |
| `text` | `color`: "accentText" for a link (the one blue), with an underline rule under it; `role`: "headline" (Raw's body is under the phone floor) | A link the viewer could follow: the only colour. |
| `camera` | `moves`: one-frame jumps (the system is instant) | The page-down. |
| `hit` | defaults | A plain click on a line end, at most six in 10 s. |
| `field` | `label`: the field's name; `value`: what is typed in it; `role`: "headline" (Raw's body is under the phone floor) | A default form as a page ends: a ruled box with its name, the value typed at a human pace. |

Do not use: `wipe` (Raw cuts; it never wipes); `kineticWords` (Raw is a page, not a poster).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#FAFAFA` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#FDFDFD` | 1.0:1 | Panels and cards that sit on the ground. |
| `rule` | `#CCCCCC` | 1.5:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#161616` | 17.3:1 | All primary text and primary marks. |
| `inkMuted` | `#5D5D5D` | 6.3:1 | Secondary text: captions, labels, sources. |
| `accent` | `#1949C5` | 7.2:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#1949C5` | 7.2:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#FAFAFA` | 7.2:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#1949C5` | 7.2:1 | Chart series 1 (the series that matters). |
| `series2` | `#181516` | 17.4:1 | Chart series 2. |
| `series3` | `#4B4647` | 8.9:1 | Chart series 3. |
| `series4` | `#A8A3A4` | 2.4:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#D5CFD1` | 1.5:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#218041` | 4.8:1 | A good change or a pass. Use only for status. |
| `negative` | `#CA3C36` | 4.8:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Tinos | 11% | 119 px | 700 | -0.01em | 1 | as written |
| headline | Tinos | 7% | 76 px | 700 | 0em | 1.05 | as written |
| body | Courier Prime | 4.4% | 48 px | 400 | 0em | 1.35 | as written |
| label | Space Mono | 3.6% | 39 px | 400 | 0em | 1.2 | as written |
| caption | Courier Prime | 4.2% | 45 px | 400 | 0em | 1.3 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 5% of the short side (54 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 3 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1866 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: hairline outlines on the ground, the key bar filled; square ends; at most 1 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in label. A measured ruler (ticks and labels) on the value axis, always.
- Lines: the key line 1 strokes, context lines 1; hairline rules across the plot; a dot on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Hard cuts and one-frame appearances; a blinking cursor is the only constant motion.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0, 0, 1, 1)` | 1 |
| Move on screen | `cubic-bezier(0, 0, 1, 1)` | 1 |
| Exit | `cubic-bezier(0, 0, 1, 1)` | 1 |
| Stagger between items | | 2 |

Transitions: Hard cuts only.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

None.

This system allows no effects: no blur, no shadow, no grain.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system raw`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Not graded: screenshots and screen recordings are evidence, shown as they are. Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (support):** in a window (a box on the grid with a margin). Pictures as they are, in a bordered box like an image on a plain web page. Motion: still.
- **Footage (rare):** Unedited, in a bordered box. Speed: real.
- **Music:** No music: this system is silent.
- **Effects:** click, at most 6 in 10 s. No music. A plain click when something appears, if anything. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 12 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1 s plus 0.25 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "raw"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Tinos (700); Courier Prime (400); Space Mono (400); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.
