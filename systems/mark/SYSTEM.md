# Mark

Construction. The mark assembles from simple modules, then holds.

- **Mode:** light
- **Reference:** Pentagram and Collins identity launch films: a mark built from modules on a visible grid.
- **Palette:** White, black and the brand colour, which the user supplies. The green here is only a placeholder.
- **Use it for:** logo-sting, launch, title-sequence
- **Needs from you:** The brand mark as SVG and the brand colour.

## How this system builds a frame

- Show the grid while the mark builds, then hide it.
- Build from no more than five modules.
- End on the mark, held for two seconds.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the subject in a picture by 0.5 s: the picture on at least 15 % of the frame. The unit module of the mark, centred on frame 0, on a visible grid in ink: a path of `drawnMark` given a time at or before 0 is drawn and filled on frame 0. The paths of one mark count together as the picture.
- **One line and one subject:** centred. The pair stacks, line above, on the optical centre (lineAndSubject at the hook's area), inside the frame grid: when the module would pass the grid's foot, move the pair up so the module ends on it. Never strand them in the top third with the lower half empty.
- **Ends:** on a lockup (the subject or mark with the name on one axis), held 2 s, the last change on a bar, with the system's one impact. The finished mark and the name as one lockup on one axis, centred, with the one impact, held 2 s. At 9:16 the name and its line go over the mark, so the mark keeps the size it was built at and the text stays in the text-safe area. The block that does it: `drawnMark`, `lockup: { name, line, at }` with `at` on the bar (the mark moves into place and the closing hold is marked), the one impact from `hit`.
- **Stillness:** nothing holds still for more than 2 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -16 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Clean percussion. Every module lands on a beat.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.55 s (the middle of the music's 100-120 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** No pictures: the mark is the only subject.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a mark made of initials in a circle. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Mark. Use at least two of them.

- The mark builds from at most five modules that snap to the grid on beats. *Measurable* (`sound/cut-on-beat`): Each module lands within 2 frames of a beat.
- Each module draws on by its outline, then its fill lands on a beat; the grid stays until the lockup. *Judged by eye.*
- The wordmark locks up on the same grid: cap height and baseline on grid rows. *Judged by eye.*

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `frameGrid` | `marks`: true | The visible grid while the mark builds. |
| `drawnMark` | `mark`: the brand mark: the name an SVG file was added under (untell media add <file>.svg --as <name>), or inline paths; `accent`: the one path in the brand colour (default: the first path, the unit module); `line`: the one line over the mark while it builds; the block takes it off before the lockup; `times`: each module's draw on a beat; the unit module at or before 0; `fills`: each fill on a beat; `lockup`: the name and its line, `at` on the bar | The mark, drawn on by its strokes, filled module by module, then locked up with the name. |
| `shape` | `kind`: "circle"; `stroke`: "rule"; `enter`: "draw" | Construction lines (the circle an arc of the mark comes from) while the mark builds. |
| `text` | `role`: "headline" | The wordmark, on the grid. |
| `hold` | defaults | The 2 s hold on the finished mark. |
| `hit` | defaults | A pop as each module lands, one impact when the mark resolves. |
| `lockup` | `axis`: "row"; `mark`: a flat shape, when the brief gives no SVG mark | The name with a flat mark on one axis, centred, when there is no brand mark to draw. |

Do not use: `photo` (An identity film shows the mark, not a picture); `kineticWords` (The mark is the subject, not words).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#FAFAFA` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#FDFDFD` | 1.0:1 | Panels and cards that sit on the ground. |
| `rule` | `#CCCCCC` | 1.5:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#161616` | 17.3:1 | All primary text and primary marks. |
| `inkMuted` | `#5D5D5D` | 6.3:1 | Secondary text: captions, labels, sources. |
| `accent` | `#007835` | 5.4:1 | Placeholder. For the brand colour, copy the system: `untell system new <brand> --from mark`, set roles.accent (with accentText and onAccent) in its system.ts, then run `untell system check <brand>`: it checks the contrast of text on it. |
| `accentText` | `#007835` | 5.4:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#FAFAFA` | 5.4:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#007835` | 5.4:1 | Chart series 1 (the series that matters). |
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
| display | Archivo | 12% | 130 px | 800 | -0.035em | 0.98 | as written |
| headline | Archivo | 7.5% | 81 px | 700 | -0.02em | 1.02 | as written |
| body | Archivo | 4.5% | 49 px | 500 | 0em | 1.3 | as written |
| label | Archivo | 3.6% | 39 px | 600 | 0em | 1.2 | as written |
| caption | Archivo | 4.2% | 45 px | 500 | 0em | 1.3 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 8% of the short side (86 px at 1080).
- Grid: 8 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 3 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1833 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; square ends; at most 1.2 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 2 strokes, context lines 1; the scale labels only, no gridlines; a square on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Modular: each part draws on by its outline, then fills and snaps to the grid with a small overshoot.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.3, 1.25, 0.4, 1)` | 14 |
| Move on screen | `cubic-bezier(0.65, 0, 0.35, 1)` | 20 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 10 |
| Stagger between items | | 3 |

Transitions: The mark builds part by part on the grid; the grid stays until the lockup.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

None.

This system allows no effects: no blur, no shadow, no grain.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system mark`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Not graded: screenshots and screen recordings are evidence, shown as they are. Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (none):** none. No pictures: the mark is the subject. Motion: still.
- **Footage (none):** No footage.
- **Music:** minimal, confident, clean percussion, 100-120 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** pop, impact, at most 4 in 10 s. A small pop as each module lands; one impact when the mark resolves. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 5 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.4 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "mark"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Archivo (500, 600, 700, 800); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.
