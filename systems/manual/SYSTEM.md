# Manual

A patient teacher. Code on one side, the explanation on the other, one line lit at a time.

- **Mode:** light
- **Reference:** Stripe's documentation and IBM Plex editorial pages: prose beside code, line numbers, one highlight colour.
- **Palette:** Warm white page, near-black text, one muted teal for the highlighted line.
- **Use it for:** tutorial, explainer, app-demo
- **Needs from you:** Real code or a real API to show.

## How this system builds a frame

- Code is real and shown at a readable size, with line numbers.
- One highlighted line at a time.
- Prose sits beside or under the code, never over it.
- Syntax colour uses four hues or fewer.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the main line in type by 1 s: the line in the headline role. The question in prose and the first line of real code, both readable on frame 0. The code types on from there.
- **One line and one subject:** top. The page is code and its run. The question at the text-safe top, the code straight under it, and the run under the code in a pane with the same edges (terminal, `resultRole: "headline"`, `end: "result"`), so the panes fill the page to the text-safe foot. Size each from its rows (B.measure). Under the low band's top at 9:16 the code column is narrower: keep lines short enough that none wraps. A longer run, or a drawing of the result, goes in the next view. Never strand them in the top third with the lower half empty.
- **Ends:** on a last event on screen that holds, held 1.5 s, the last change on a bar. A last run with a larger input: the output prints, and the cursor blinks on the last line. The block that does it: `terminal`, the last command prints its result (`result: true`) on the last bar; the cursor blinks to the end.
- **Stillness:** nothing holds still for more than 2.4 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -18 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: a bed under the picture. Enter the track (`section`): open on the start of a section with energy, not a quiet intro: `music({ align: { track: <section start>, film: 0 } })` (sections from `listen.md` or `beats().sections`); the reveal need not sit on a drop. Mellow and unhurried. A key tick under typed code, and only then.
- **With no sound:** the moves above assume a bed under the picture. With none, keep a steady beat of your own: a constant `BEAT` of about 0.7 s (the middle of the music's 76-94 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 1 distinct shot: a new angle or new content, never a new crop of one picture. One program: the code, the run and the output are about the same function.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; Fibonacci; a sort of ten numbers. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Manual. Use at least two of them.

- One lit line: the highlight band in the accent, with the line number in the accent too. It moves in one stride, never sweeps through other lines. *Measurable* (`signature`): The accent covers a band one row high in the code column while a line is lit.
- Code types at a human rate (codeBlock `enter: "type"`), with soft key ticks from `typing`, which keeps the ticks to the effects limit. *Measurable* (`sound/hit-over-bed`): The ticks stand 6 dB or more over the bed.
- The view scrolls to the next block; it never zooms. *Judged by eye.*
- The output proves the idea: the run prints, and the picture shows what it printed. *Judged by eye.*

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `codeBlock` | `highlight`: one line at a time, on the beat; `firstLine`: the real line number; `band`: "tint" (the default here: the teal band, gutter bar and number); `jump`: "cut" (the default here); `enter`: "type" (the first row rests on frame 0 when at is 0, then the rest types on); each highlight after its row is typed (the line anchor's data.typedAt) | Real code at a readable size with line numbers. |
| `terminal` | `session`: the command and its real output; `result`: true on the one line the run proves; `resultRole`: "headline" when the result is the reveal | The run that proves the code. terminalHeight() gives the panel height for its rows. |
| `text` | `role`: "headline" for the question of the hook (the hook's role); "body" for prose beside the code | Prose beside or above the code, never over it. |
| `camera` | `moves`: vertical scrolls only, no zoom | The scroll to the next block. |
| `pane` | `title`: the file or the shell; `inset`: the default, shared by every pane | One window for code and output, so their edges align (paneStack). |

Do not use: `kineticWords` (Manual reads at a human pace); `photo` (Pictures are rare here; the code and its output are the subject).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#F9F6F2` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#FFFDFA` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#CBC9C5` | 1.5:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#181611` | 16.8:1 | All primary text and primary marks. |
| `inkMuted` | `#605D58` | 6.1:1 | Secondary text: captions, labels, sources. |
| `accent` | `#00787D` | 4.9:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#006B70` | 5.8:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#FBFAF7` | 5.1:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#00787D` | 4.9:1 | Chart series 1 (the series that matters). |
| `series2` | `#171613` | 16.8:1 | Chart series 2. |
| `series3` | `#494744` | 8.6:1 | Chart series 3. |
| `series4` | `#A6A4A0` | 2.3:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#D3D1CD` | 1.4:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#218041` | 4.6:1 | A good change or a pass. Use only for status. |
| `negative` | `#CA3C36` | 4.6:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | IBM Plex Serif | 10% | 108 px | 500 | -0.015em | 1.06 | as written |
| headline | IBM Plex Serif | 6.6% | 71 px | 500 | -0.01em | 1.12 | as written |
| body | IBM Plex Sans | 4.5% | 49 px | 400 | 0em | 1.4 | as written |
| label | IBM Plex Sans | 3.6% | 39 px | 500 | 0em | 1.2 | as written |
| caption | IBM Plex Mono | 4.5% | 49 px | 400 | 0em | 1.45 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 8% of the short side (86 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 10 px at 1080. Stroke: 2 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1833 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

This system has no chart hand of its own; the chart blocks draw in the plain hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; the system radius, at most a quarter of the bar; at most 1.15 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 3 strokes, context lines 1.25; the scale labels only, no gridlines; a dot on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Calm and readable: code types at a human rate, the highlight sweeps 300 ms, the view scrolls, never zooms.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.23, 1, 0.32, 1)` | 12 |
| Move on screen | `cubic-bezier(0.65, 0, 0.35, 1)` | 18 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 10 |
| Stagger between items | | 3 |

Transitions: A scroll to the next block, or a cut.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

Thin rules only.

This system allows no effects: no blur, no shadow, no grain.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system manual`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Not graded: screenshots and screen recordings are evidence, shown as they are. Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (rare):** in a window (a box on the grid with a margin). Screenshots of real output only, ungraded, in a window beside the code. Motion: still.
- **Footage (none):** No footage: code and prose carry it.
- **Music:** lo-fi, mellow keys, unhurried, 76-94 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** tick, at most 6 in 10 s. A soft key tick when code types in, and only then. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 12 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.8 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "manual"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: IBM Plex Serif (500); IBM Plex Sans (400, 500); IBM Plex Mono (400); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than 2 accent elements in a frame. A frame may hold code and its run (the block map's pane stack). A code block is one accent element: its lit line and its teal literal values are its signature (codeBlock), and they stay teal. A terminal's result line is the second.
