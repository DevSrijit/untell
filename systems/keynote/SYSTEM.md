# Keynote

Theatre. A single subject emerges from black and is lit, slowly.

- **Mode:** dark
- **Reference:** Apple keynote and product films in black: one product, one line, a light sweep across the surface.
- **Palette:** Near-black ground, white type, grey secondary type, one system blue kept for a link or a selected state. The product supplies all other colour.
- **Use it for:** launch, ad, trailer
- **Needs from you:** A product render or photograph for the subject.

## How this system builds a frame

- One subject per scene, centred.
- The ground stays flat black: no gradient, no glow.
- One line of type per scene.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the subject in a picture by 1 s: the picture on at least 15 % of the frame. The subject lit on black on frame 0, a slow push running, with the bed audible. Never 2 s of near-black.
- **One line and one subject:** top. The line first, at the text-safe top (its height from lineH); then the product under it, framed with `room`: the frame under the line, a body line height below it. The product's drawn bounds at their largest over the shot then stay clear of the line by construction: never on the handle or the rim. The anchor `<product id>-object-extent` holds those bounds, to check the gap. Never strand them in the top third with the lower half empty.
- **Ends:** on a lockup (the subject or mark with the name on one axis), held 1.5 s, the last change on a bar, with the system's one impact. The subject small and centred, the full name in headline under it, with the one low impact on the card. The block that does it: `endCard`, `name`, `line`, `at` on the last strong beat, with the one low impact.
- **Stillness:** nothing holds still for more than 2 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -18 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: a bed under the picture. Enter the track (`swell`): put the track's loudest bar on the reveal, so the bed rises into it: `music({ peakAt: <reveal time>, peak: "loudest" })`. A cinematic swell; the bed is audible from frame 0 and rises into the reveal.
- **With no sound:** the moves above assume a bed under the picture. With none, keep a steady beat of your own: a constant `BEAT` of about 0.7 s (the middle of the music's 70-100 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 3 distinct shots: a new angle or new content, never a new crop of one picture. One subject in one light, from different angles: front, side, detail. Never one picture turned.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a phone with a generic glowing screen. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Keynote. Use at least two of them.

- A light sweep: a narrow band of light crosses the subject's surface once, at its brightest on an accent. (effect: light-sweep) *Measurable* (`signature`): A bright band moves across the subject's mask over 30-50 frames.
- A thin rim light draws the subject's dark edge. (effect: rim-light) *Judged by eye.*
- Slow push-ins of 15-20 % on long holds; a shot never stops. *Measurable* (`stall`): No stretch longer than maxStill without change.
- One line of type per scene, revealed through a mask. *Judged by eye.*

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `product` | `sweep`: the accent time; `shot`: "push" or "orbit" | A 3D subject with its sweep and rim. |
| `photo` | `motion`: "push"; `amount`: 0.15-0.2; `sweep`: a light band on the accent time, masked by the cut-out; `rim`: a rim line from the cut-out | A photographed subject, with its sweep and rim. |
| `title` | `enter`: "line"; `maxLines`: 2 (with 1, a sentence steps down to body size and warns) | One sentence per scene, in display or headline. |
| `hit` | defaults | A swell into the reveal, one low impact on the name. |
| `endCard` | `name`: the full name; `line`: one line; `at`: the last strong beat | The held finish: the name and one line, landing on a beat. |

Do not use: `kineticWords` (Keynote is slow; one line per scene); `barChart` (A keynote states one number, not a chart).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#070708` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#111112` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#2B2B2C` | 1.4:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#EEEEF0` | 17.4:1 | All primary text and primary marks. |
| `inkMuted` | `#989899` | 7.0:1 | Secondary text: captions, labels, sources. |
| `accent` | `#4693F1` | 6.4:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#59A0F9` | 7.5:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#070708` | 6.4:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#4693F1` | 6.4:1 | Chart series 1 (the series that matters). |
| `series2` | `#EEEEF1` | 17.4:1 | Chart series 2. |
| `series3` | `#ADADB0` | 9.0:1 | Chart series 3. |
| `series4` | `#69696B` | 3.7:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#3D3D3F` | 1.9:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 9.5:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 6.5:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Geist | 13% | 140 px | 600 | -0.03em | 1.02 | as written |
| headline | Geist | 8.5% | 92 px | 600 | -0.02em | 1.06 | as written |
| body | Geist | 5% | 54 px | 400 | -0.005em | 1.3 | as written |
| label | Geist | 4% | 43 px | 500 | 0em | 1.2 | as written |
| caption | Geist | 4.4% | 48 px | 500 | 0em | 1.25 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 9% of the short side (97 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 28 px at 1080. Stroke: 3 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1822 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

This system has no chart hand of its own; the chart blocks draw in the plain hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; the system radius, at most a quarter of the bar; at most 1.15 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 3 strokes, context lines 1.25; the scale labels only, no gridlines; a dot on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Slow push-ins, a light sweep across the subject, masked type reveals.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 34 |
| Move on screen | `cubic-bezier(0.45, 0, 0.15, 1)` | 44 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 20 |
| Stagger between items | | 6 |

Transitions: Fade through black, or a cut on the beat.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

A thin rim light on the subject's edge. Never a glow or a coloured cloud behind it.

This system allows only these effects:

- **light-sweep**: A narrow band of light that crosses a subject's surface once.
- **rim-light**: A thin light line on a subject's edge.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system keynote`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Colour, tamed: saturation 0.85, contrast 4, warmth 0; black on `ground` (#070708), white on `ink` (#EEEEF0). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (hero):** full bleed (fills the frame); small in a large empty field. One product photograph emerges from black, lit; the push is slow. Cut-outs allowed. Motion: push.
- **Footage (support):** Slow product b-roll on black: a turn, a light passing. Speed: slow.
- **Music:** cinematic ambient swell, piano and strings, hopeful, 70-100 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** swell, impact, at most 2 in 10 s. A swell into the reveal; one low impact on the product's name. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 6 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.6 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "keynote"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

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
