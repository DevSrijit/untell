# Pop

Friendly and bouncy. Big rounded shapes land with squash and stretch.

- **Mode:** light
- **Reference:** Duolingo's brand motion: flat saturated colour, chunky buttons, squash and stretch.
- **Palette:** White ground, a saturated green, blue and orange for characters and buttons.
- **Use it for:** ad, app-demo, explainer, wrapped

## How this system builds a frame

- Every interactive thing is a chunky rounded button with a bottom edge.
- One character or mascot leads.
- At most five colours on screen.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show a picture and the main line by 0.5 s: the line in the headline role, the picture on at least 20 % of the frame. The character and the question on frame 0, the character already moving. The character is large: it owns the middle of the frame (lineAndSubject with area 0.3), never a small mark under the line.
- **One line and one subject:** centred. The pair stacks, line above, on the optical centre: take both boxes from `lineAndSubject(ctx, { lineH, area: 0.3 })`, so the character owns the middle of the frame; the hook's share (0.2) is its floor. Never strand them in the top third with the lower half empty.
- **Ends:** on a lockup (the subject or mark with the name on one axis), held 1.5 s, the last change on a bar. The character, the app icon and the name as one lockup, the button pressed, with a small idle bounce. The block that does it: `lockup`, the character, the icon and the name, `at` on the bar.
- **Stillness:** nothing holds still for more than 1.2 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -15 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Upbeat. The burst lands on the track's strongest onset.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.5 s (the middle of the music's 108-132 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 1 distinct shot: a new angle or new content, never a new crop of one picture. One drawn character all through.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a generic quiz with no reaction. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Pop. Use at least two of them.

- Squash and stretch, with overshoot on arrival. *Judged by eye.*
- One character leads from the first frame to the last. *Judged by eye.*
- A big rounded shape scales up and becomes the next scene. *Judged by eye.*
- Buttons are chunky, with a darker bottom edge, and sink when pressed. *Judged by eye.*

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `shape` | `kind`: "circle" or "rect"; `fill`: "accent" for the character (the one green that leads); `enter`: "grow" | The character's parts and the chunky buttons. |
| `wipe` | `style`: "iris" | The rounded shape that grows into the next scene. |
| `meter` | `shape`: a rounded bar | A quantity that fills, such as heat. |
| `hit` | defaults | A pop as a shape lands, a click on a press, a whoosh on a fast slide. |
| `button` | `depth`: a chunky bottom edge; `press`: the click times | A rounded button whose face sinks onto its edge on a press. |
| `photo` | `shape`: "circle"; `sticker`: true | A cut-out object as a flat sticker on a round shape; never in place of the character. |
| `lockup` | `axis`: "row"; `mark`: the character or the app icon | The end: the character, the icon and the name as one lockup. |

Do not use: `counter` (Rolling digits fade under 0.5 opacity; show the quantity as a meter).

Not in the catalog yet. Until a block exists, build the nearest thing from the blocks above, and say in a comment what is missing:

- **character**: Face states, squash and stretch, held through the film.

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#F9FAFC` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#FCFEFF` | 1.0:1 | Panels and cards that sit on the ground. |
| `rule` | `#CBCCCE` | 1.5:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#2A2E33` | 13.1:1 | All primary text and primary marks. |
| `inkMuted` | `#5F6469` | 5.7:1 | Secondary text: captions, labels, sources. |
| `accent` | `#6EC52A` | 2.1:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accent2` | `#00ABED` | 2.5:1 | The second ink or primary. Each colour keeps one meaning for the whole film. |
| `accent3` | `#FF971F` | 2.1:1 | The third ink or primary. Each colour keeps one meaning for the whole film. |
| `accentText` | `#297613` | 5.4:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#172614` | 7.3:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#6EC52A` | 2.1:1 | Chart series 1 (the series that matters). |
| `series2` | `#00ABED` | 2.5:1 | Chart series 2. |
| `series3` | `#FF971F` | 2.1:1 | Chart series 3. |
| `series4` | `#2A2E33` | 13.1:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#D3D8DE` | 1.4:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#218041` | 4.8:1 | A good change or a pass. Use only for status. |
| `negative` | `#CA3C36` | 4.8:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Nunito | 12% | 130 px | 900 | -0.01em | 1 | as written |
| headline | Nunito | 8% | 86 px | 800 | 0em | 1.05 | as written |
| body | Nunito | 4.8% | 52 px | 700 | 0em | 1.3 | as written |
| label | Nunito | 3.8% | 41 px | 800 | 0em | 1.2 | as written |
| caption | Nunito | 4.4% | 48 px | 700 | 0em | 1.3 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 7% of the short side (76 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 36 px at 1080. Stroke: 6 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1844 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; half-round ends; at most 1.6 value line heights thick; no baseline (the bars share one edge).
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 2 strokes, context lines 1; the scale labels only, no gridlines; a dot on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Springy: squash and stretch, overshoot on arrival, a little bounce.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 12 |
| Move on screen | `cubic-bezier(0.5, 1.4, 0.4, 1)` | 16 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 8 |
| Stagger between items | | 4 |

Transitions: A big rounded shape scales up and becomes the next scene.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

Flat colour; buttons have a thick darker bottom edge.

This system allows no effects: no blur, no shadow, no grain.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system pop`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Colour, tamed: saturation 1, contrast 3, warmth 0.1; black on `ink` (#2A2E33), white on `ground` (#F9FAFC). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (rare):** cropped to a circle, square or triangle. A cut-out subject on a flat round shape, like a sticker; bright and saturated. Cut-outs allowed. Motion: still.
- **Footage (none):** No footage: the shapes bounce.
- **Music:** upbeat, playful, ukulele and claps, cheerful, 108-132 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** pop, click, whoosh, at most 6 in 10 s. A pop as a shape lands; a click on a button press; a whoosh on a fast slide. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 7 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.2 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "pop"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Nunito (700, 800, 900); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame, except where the system's inks each carry their own meaning.
