# Noir

Mystery. Hard light cuts across the type; shadows slide.

- **Mode:** dark
- **Reference:** Classic film noir: hard key light, venetian-blind shadow bars, black and white only.
- **Palette:** Black, white and a few greys; no colour at all.
- **Use it for:** trailer, quote-card, title-sequence

## How this system builds a frame

- One hard light direction for the whole film.
- Shadow bars fall across type at a diagonal.
- Framing is asymmetric.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show a picture and the main line by 1 s: the line in the headline role, the picture on at least 40 % of the frame. A lit plate with hard slats on frame 0, the first line already set in a lit band.
- **One line and one subject:** picture. The lit plate fills the frame with the figure whole. Where the plate has a calm part clear of the figure, the line sits on it (lineOverPicture: never across the face or the body). Where the figure fills the text-safe area (lineOverPicture says dim), the line takes a band of the dark ground at the top and the plate fills the frame under it, its top eased into the ground (lineInBand, then photo with box: the picture box and fade: "top"). Keep the figure: a plate with no figure is the last choice. Never strand them in the top third with the lower half empty.
- **Ends:** on a held card, held 1.5 s, the last change on a bar, with the system's one impact. The title in the light, the street in the bottom third; the slat light fades on the last beat instead of a cut to empty black. The block that does it: `title`, the title in the light on the last beat, held; `shadowBars` with `exit: "fade"` and `until` on the last beat fades the slats.
- **Stillness:** nothing holds still for more than 2.2 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -17 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Smoky jazz. Cuts on the beat; the impact lands when the title is fully set, not before.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.75 s (the middle of the music's 64-92 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 3 distinct shots: a new angle or new content, never a new crop of one picture. One hard light direction and one grade in every shot.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a detective in a trench coat with no story. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Noir. Use at least two of them.

- Hard lit slats: the plate is dark, and only hard-edged bands carry the normal grade; type sits in the lit bands. (effect: shadow-bars) *Measurable* (`signature`): Hard edges at one diagonal angle cross the plate, and no letter sits in a dark band.
- One hard light direction for the whole film. *Judged by eye.*
- A shadow sweeps the frame dark, then the next scene is lit. *Judged by eye.*
- A dark figure in front of lit words: the subject breaks the line and the line still reads. *Measurable* (`contrast-over-picture`): Every letter keeps its contrast; no letter more than 30 % covered.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `photo` | `over`: true; `motion`: "push" | The subject cut out over the type. |
| `title` | `role`: "display" | The title at full measure over two lines. |
| `wipe` | `style`: "sweep"; `fill`: "ground" | The shadow that sweeps the frame dark. |
| `hit` | defaults | A low hit when a slat snaps; a soft whoosh as a slat slides. |
| `shadowBars` | `angle`: the slats' fall; near-level (-6 to -15) when keepLit holds text of more than one line, so one lit band holds it; `keepLit`: the title's nodes, so every letter stays lit; `exit`: "fade" on the end card, with `until` on the last beat | Hard slats of shadow across the frame. |

Do not use: `barChart` (A noir title has no chart); `kineticWords` (Noir pushes slowly).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#030303` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#0B0B0B` | 1.0:1 | Panels and cards that sit on the ground. |
| `rule` | `#242424` | 1.3:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#EEEEEE` | 17.8:1 | All primary text and primary marks. |
| `inkMuted` | `#929292` | 6.6:1 | Secondary text: captions, labels, sources. |
| `accent` | `#EEEEEE` | 17.8:1 | Equals the ink: this system has no accent colour. Emphasise with size, weight or position. |
| `accentText` | `#EEEEEE` | 17.8:1 | Equals the ink: this system has no accent colour. Emphasise with size, weight or position. |
| `onAccent` | `#030303` | 17.8:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#FCFCFC` | 20.1:1 | Chart series 1 (the series that matters). |
| `series2` | `#BEBEBE` | 11.1:1 | Chart series 2. |
| `series3` | `#868686` | 5.7:1 | Chart series 3. |
| `series4` | `#555555` | 2.8:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#2E2E2E` | 1.5:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 9.7:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 6.6:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Playfair Display | 12% | 130 px | 700 | -0.01em | 1 | as written |
| headline | Playfair Display | 8% | 86 px | 700 | 0em | 1.05 | as written |
| body | Bebas Neue | 5% | 54 px | 400 | 0.04em | 1.2 | upper |
| label | Bebas Neue | 4% | 43 px | 400 | 0.12em | 1.2 | upper |
| caption | Bebas Neue | 4.6% | 50 px | 400 | 0.06em | 1.25 | upper |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display and headline faces have a true italic, and `quote` sets its `emphasis` word in it. The body face has none: there the accent text is the ink, so `quote` sets the word as the rest and says so. Never slant a face that has no italic file.

## Layout

- Margin: 8% of the short side (86 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 3 px at 1080.
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

Slow lateral pushes; shadow bars slide across the frame; cuts land on the beat.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.4, 0, 0.2, 1)` | 24 |
| Move on screen | `cubic-bezier(0.45, 0, 0.55, 1)` | 40 |
| Exit | `cubic-bezier(0.6, 0, 0.8, 0.4)` | 16 |
| Stagger between items | | 6 |

Transitions: A shadow sweeps the frame dark, then the next scene is lit.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

Film grain and a slight gate weave. Grain strength: 0.08. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **shadow-bars**: Hard-edged diagonal shadow bars, as from a venetian blind.
- **grain**: Film or paper grain over the whole frame.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system noir`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Black and white, contrast 6, gamma 1.35: black on `ground` (#030303), white on `ink` (#EEEEEE). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (hero):** full bleed (fills the frame); the subject cut out over the type (plan with `placeBehind`; the cover check keeps every letter readable). Hard key light, deep black; the shadow bars cross the picture as they cross the type. Cut-outs allowed. Motion: push.
- **Footage (support):** Slow black and white: rain, a stair, smoke through a blind. Speed: slow.
- **Music:** noir jazz, muted trumpet, upright bass, smoky, 64-92 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** impact, whoosh, at most 2 in 10 s. A low hit when a shadow bar snaps; a soft whoosh as a bar slides. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 6 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.6 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "noir"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Playfair Display (700); Bebas Neue (400); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- Colour as emphasis. This system has no accent colour.
