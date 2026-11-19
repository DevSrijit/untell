# Console

Something is running. Commands type at a human rate and the output answers.

- **Mode:** dark
- **Reference:** Terminals and command-line tools: a prompt, output line by line, a status bar, a phosphor colour.
- **Palette:** Black ground, off-white text, one phosphor amber.
- **Use it for:** tutorial, app-demo, changelog, ad

## How this system builds a frame

- Everything is a prompt, a command or output.
- Output must be realistic, with real timing.
- The accent marks the prompt and the one result that matters.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the main line in type by 0.5 s: the line in the headline role. A full terminal on frame 0 at the text-safe width, with a status bar and earlier history in muted text; the command types at the prompt in headline, so it reads on a phone (keep commands short enough for one row).
- **One line and one subject:** centred. The pair stacks, line above, on the optical centre: take both boxes from `lineAndSubject(ctx, { lineH })`; the subject covers the hook's share of the frame (`heroBox`). Never strand them in the top third with the lower half empty.
- **Ends:** on a last event on screen that holds, held 1.5 s, the last change on a bar. A second command that turns the result into a scale; its reply prints on the last bar, and the cursor blinks. The block that does it: `terminal`, the last reply prints on the last bar; the cursor blinks to the end.
- **Stillness:** nothing holds still for more than 2 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -16 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: a bed under the picture. Enter the track (`section`): open on the start of a section with energy, not a quiet intro: `music({ align: { track: <section start>, film: 0 } })` (sections from `listen.md` or `beats().sections`); the reveal need not sit on a drop. A focused pulse. Drop the key ticks over strong music.
- **With no sound:** the moves above assume a bed under the picture. With none, keep a steady beat of your own: a constant `BEAT` of about 0.55 s (the middle of the music's 100-124 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 1 distinct shot: a new angle or new content, never a new crop of one picture. One session in one terminal.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; hello world; ls in a home folder; a ping with no meaning. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Console. Use at least two of them.

- Characters type at a variable human rate; output prints line by line with real timing. *Measurable* (`signature`): Text grows one character at a time while a command types.
- The result that matters prints in the accent; the rest steps back to muted ink. *Measurable* (`signature`): The accent covers the result line when it prints.
- Faint scanlines at low opacity. (effect: scanlines) *Judged by eye.*
- A cut on Enter; the screen scrolls. *Judged by eye.*

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `terminal` | `h`: leave it out: the panel holds its rows, never an empty box; `session`: commands with real output and timing; `prompt`: a fitting prompt; `role`: a large role for a phone (headline); `result`: true on the one line that matters; `status`: the host and a live clock; `inset`: the text column inside a wide panel | The whole film is a session. |
| `typeOn` | `pace`: "human"; `cursor`: true | Text typed outside the terminal block. |
| `counter` | `value`: the real figure | A status-bar figure that counts in real time. |
| `hit` | defaults | A key tick under typed text; a click when a command runs. |
| `pane` | `title`: what the window shows; `fill`: "none" over a picture | Shared panels whose edges align (paneStack). |

Do not use: `photo` (A smooth photo breaks the screen; draw a figure in characters instead); `kineticWords` (Console prints; it does not pop words).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#0A0908` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#141412` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#2E2E2C` | 1.5:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#E6E5DD` | 15.7:1 | All primary text and primary marks. |
| `inkMuted` | `#8D8C87` | 5.9:1 | Secondary text: captions, labels, sources. |
| `accent` | `#F5AE39` | 10.4:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#F5AE39` | 10.4:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#0A0908` | 10.4:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#F5AE39` | 10.4:1 | Chart series 1 (the series that matters). |
| `series2` | `#EFEEEB` | 17.1:1 | Chart series 2. |
| `series3` | `#AFAEAB` | 9.0:1 | Chart series 3. |
| `series4` | `#6A6966` | 3.6:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#3E3D3B` | 1.8:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 9.4:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 6.4:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | JetBrains Mono | 9% | 97 px | 700 | -0.02em | 1.1 | as written |
| headline | JetBrains Mono | 6% | 65 px | 700 | -0.01em | 1.15 | as written |
| body | JetBrains Mono | 4.2% | 45 px | 400 | 0em | 1.45 | as written |
| label | JetBrains Mono | 3.6% | 39 px | 400 | 0em | 1.3 | as written |
| caption | JetBrains Mono | 4% | 43 px | 400 | 0em | 1.4 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 6% of the short side (65 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 8 px at 1080. Stroke: 2 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1855 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: rows of square cells, as text-mode output draws a bar; square ends; at most 1 value line heights thick; no baseline (the bars share one edge).
- Values in label, the key value in label. A value axis only when not every value prints.
- Lines: the key line 1 strokes, context lines 1; the scale labels only, no gridlines; a square on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Characters type at a variable human rate; output appears line by line; the cursor blinks.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0, 0, 1, 1)` | 1 |
| Move on screen | `cubic-bezier(0.5, 0, 0.5, 1)` | 12 |
| Exit | `cubic-bezier(0, 0, 1, 1)` | 1 |
| Stagger between items | | 2 |

Transitions: A cut on Enter; the screen scrolls.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

Faint scanlines at low opacity. No bloom, no glow.

This system allows only these effects:

- **scanlines**: Faint horizontal scanlines at low opacity.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system console`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** A monochrome screen: luminance in one colour on the ground: `accent` (#F5AE39) on `ground` (#0A0908). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (rare):** in a window (a box on the grid with a margin). A picture shows as a monochrome screen capture in a pane, never full frame. Motion: still.
- **Footage (none):** No footage: the terminal is the picture.
- **Music:** minimal electronic pulse, soft synth arpeggio, focused, 100-124 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** tick, click, at most 12 in 10 s. A soft key tick under typed text; a click when a command runs. Drop the ticks over strong music. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 14 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.4 s plus 0.25 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "console"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: JetBrains Mono (400, 700); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.

This system breaks the default rule "near-black-with-one-vivid-accent" on purpose: Phosphor amber on black is the terminal's own medium, shown as text, not a decorative accent on a dark UI.
