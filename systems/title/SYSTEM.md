# Title

Restraint. A small line appears without animation and holds in silence.

- **Mode:** dark
- **Reference:** A24 trailer title cards: a small serif line in a lot of black, long silences, flash cuts.
- **Palette:** Black ground, white serif type, nothing else.
- **Use it for:** trailer, title-sequence, quote-card

## How this system builds a frame

- One small centred line per card.
- Black holds between cards are part of the rhythm.
- The release line comes last, held.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show a picture and the main line by 1 s: the line in the headline role, the picture on at least 60 % of the frame. A dark plate with the title on frame 0: one small centred line in headline on the plate's calm part. The studio card comes after it, never before.
- **One line and one subject:** picture. The dark plate fills the frame (photo with no box); a still too small or too wide to fill a tall frame goes in a letterbox band across the full width (photo `frame: "letterbox"`), never in an inset box with bars round it. The tagline is one small centred line (headline, never display), in the calm band above the subject (the upper third), never across the subject, with wide space round it. It cuts in and holds. Never strand them in the top third with the lower half empty.
- **Ends:** on a held card, held 2 s. The release line comes last in body size, held, over room tone or one low note. The block that does it: `text`, the release line in body, centred, held over room tone.
- **Stillness:** nothing holds still for more than 3 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -20 LUFS for the whole mix (within 3 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: a bed under the picture. Enter the track (`swell`): put the track's loudest bar on the reveal, so the bed rises into it: `music({ peakAt: <reveal time>, peak: "loudest" })`. A low drone and long silences. The bed stops hard on the impact (`music({ until: <the impact> })`); silence holds under the title, or a room tone does (`roomTone: { media, until: <the film's end> }`).
- **With no sound:** the moves above assume a bed under the picture. With none, keep a steady beat of your own: a constant `BEAT` of about 0.9 s (the middle of the music's 50-80 BPM), and time the moves on its multiples. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 6 distinct shots: a new angle or new content, never a new crop of one picture. One grade for the whole montage: one black point, one white point, one saturation. Each still is shown once.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a horror trailer with a jump scare. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Title. Use at least two of them.

- Type cuts in and holds; nothing on the type animates. *Measurable* (`signature`): Text reaches full opacity in one frame.
- Black holds between cards are part of the rhythm. *Judged by eye.*
- Flash cuts at the climax, accelerating (19, 12, 8, 5, 4 frames of black). *Measurable* (`sound/cut-on-beat`): Each flash sits on an onset; the black gaps shrink.
- One low impact on the title card, then near silence. *Measurable* (`sound/hit-over-bed`): The impact stands 6 dB or more over the bed, and the bed stops on it.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `text` | `role`: "headline" for the opening card (the hook's role); "display" for the film's title on the reveal card; "body" for the release line; "caption" only for the credits of the studio card; `align`: "center"; `y`: on the plate's calm part (lineOverPicture) | One centred title per card. |
| `photo` | `dim`: true; `frame`: "letterbox" for a still that cannot fill the frame; `enter`: "cut"; `exit`: "cut" | A dark plate behind the type, filling the frame; the flash stills at the climax, a few frames each on the onsets. |
| `hold` | defaults | The black holds that are the rhythm. |
| `hit` | defaults | The one impact. |

Do not use: `wipe` (Title changes cards by hard cuts, sometimes to black); `kineticWords` (Title cards hold).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#050404` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#0E0D0C` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#272625` | 1.4:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#E9E8E4` | 16.7:1 | All primary text and primary marks. |
| `inkMuted` | `#81807D` | 5.2:1 | Secondary text: captions, labels, sources. |
| `accent` | `#E9E8E4` | 16.7:1 | Equals the ink: this system has no accent colour. Emphasise with size, weight or position. |
| `accentText` | `#E9E8E4` | 16.7:1 | Equals the ink: this system has no accent colour. Emphasise with size, weight or position. |
| `onAccent` | `#050404` | 16.7:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#E9E8E4` | 16.7:1 | Chart series 1 (the series that matters). |
| `series2` | `#AFAEAB` | 9.2:1 | Chart series 2. |
| `series3` | `#72716F` | 4.2:1 | Chart series 3. |
| `series4` | `#484845` | 2.2:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#2A2927` | 1.4:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 9.7:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 6.6:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Cormorant Garamond | 7.5% | 81 px | 500 | 0.02em | 1.2 | as written |
| headline | Cormorant Garamond | 5.8% | 63 px | 500 | 0.02em | 1.25 | as written |
| body | Cormorant Garamond | 5% | 54 px | 500 | 0.02em | 1.4 | as written |
| label | Cormorant Garamond | 3.4% | 37 px | 600 | 0.2em | 1.3 | upper |
| caption | Cormorant Garamond | 4.2% | 45 px | 500 | 0.02em | 1.35 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 12% of the short side (130 px at 1080).
- Grid: 4 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 1 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1790 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

This system has no chart hand of its own; the chart blocks draw in the plain hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; the system radius, at most a quarter of the bar; at most 1.15 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 3 strokes, context lines 1.25; the scale labels only, no gridlines; a dot on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

No animation on type: it cuts in and holds. Silence and pacing do the work; flash cuts at the climax.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0, 0, 1, 1)` | 1 |
| Move on screen | `cubic-bezier(0.45, 0, 0.55, 1)` | 30 |
| Exit | `cubic-bezier(0, 0, 1, 1)` | 1 |
| Stagger between items | | 8 |

Transitions: Hard cuts, sometimes to black for a beat.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

A subtle grain. Grain strength: 0.04. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **grain**: Film or paper grain over the whole frame.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system title`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Colour, tamed: saturation 0.2, contrast 2, warmth 0.15; black on `ground` (#050404), white on `inkMuted` (#81807D). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (support):** full frame behind the type, dimmed so the type reads; full bleed (fills the frame). A dark, desaturated film still; the title sits over it in silence, on its calm part, never across the subject. Motion: still.
- **Footage (support):** Slow trailer b-roll between title cards, dark and desaturated. Speed: slow.
- **Music:** low drone, tense, near silence, 50-80 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** impact, at most 1 in 10 s. One low impact on the title card, then silence. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 7 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 2 s plus 0.35 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "title"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Cormorant Garamond (500, 600); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- Colour as emphasis. This system has no accent colour.
