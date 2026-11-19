# Ma

Silence. One small word or image in a large empty field, held long.

- **Mode:** light
- **Reference:** Kenya Hara's MUJI work and the Japanese idea of ma, meaningful emptiness.
- **Palette:** Warm paper, charcoal type, one unbleached natural tone as a block.
- **Use it for:** quote-card, launch, title-sequence, presentation

## How this system builds a frame

- At least 70 % of the frame is empty.
- One word, one line or one small image per scene.
- Type is small and widely spaced; size never shouts.
- The natural-tone block may hold the one image.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the subject in a picture by 1 s: the picture on at least 8 % of the frame. One real thing on frame 0 in a large field of paper: a moving shadow, a plate of a wall, a small object. Never a flat placeholder square.
- **One line and one subject:** field. A small picture in a large field of paper: the picture at the size its hook asks (about 40 % of the frame's width, at least 8 % of the frame; heroBox with area: 0.1), set off centre on a third (right of centre, a little above the middle), and the line small (body, the floor size) on the text-safe left, two short rows broken where the sense breaks, a wide gap of paper below the picture. Never a plate that fills the frame, never a card centred on the page. At least 70 % of the frame stays paper. Never strand them in the top third with the lower half empty.
- **Ends:** on the ground: the last text dissolves, and the paper holds, held 1 s. The title dissolves into the paper over about 2 s, and 1 s of paper holds under the last decay of the music. Not a held card. The block that does it: `text`, the last line with `until` about 2 s before the end and its exit a fade (the vocabulary); the paper holds.
- **Stillness:** nothing holds still for more than 4 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -20 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: a bed under the picture. Enter the track (`start`): enter at the track's own start, which opens on its body: `music({ clipStart: 0 })`. Sparse and quiet, with room tone from frame 0. No effects: silence is part of the design.
- **With no sound:** the moves above assume a bed under the picture. With none, keep a steady beat of your own: a constant `BEAT` of about 0.9 s (the middle of the music's 56-80 BPM), and time the moves on its multiples. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 1 distinct shot: a new angle or new content, never a new crop of one picture. One image. If a second comes, it shares the first one's light and paper tone.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a generic zen garden; a quote about mindfulness. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Ma. Use at least two of them.

- Every entrance and exit is a slow fade through the paper, 1.5-2.5 s; nothing rises out of a mask. *Measurable* (`signature`): Each text and picture reaches full opacity over 40 frames or more.
- At least 70 % of the frame is empty paper, and the one image or line sits in it. *Measurable* (`dead-space`): The empty share stays at 70 % or more on every key frame.
- One credit per musical phrase, each in its own silence of paper. *Measurable* (`message-gap`): Two texts never share the screen; a gap of 0.5-1 s of paper sits between them.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `photo` | `motion`: "still" or "drift"; `box`: small, in the field; `enter`: "dissolve"; `exit`: "dissolve" | The one image, at about 40 % of the width. |
| `text` | `role`: "body" for the one line of a beat (it must read on a phone); "caption" or "label" only for a credit; `enter`: "fade" (the system default) | The one line in the field, and small, widely spaced credits. |
| `rule` | `weight`: the system stroke | A hairline horizon. |
| `hold` | defaults | The long holds that are the design. |
| `music` | `fadeOut`: about 2 s; `roomTone`: a recording of a quiet room, under the bed from frame 0 | The sparse bed, fading with the last dissolve, over a room tone. |

Do not use: `shape` (A flat square of colour reads as a missing image. Use a real picture); `kineticWords` (Nothing hurries in Ma); `wipe` (Ma dissolves through the paper).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#F3F0EA` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#F9F6F1` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#C5C2BD` | 1.6:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#282623` | 13.3:1 | All primary text and primary marks. |
| `inkMuted` | `#66625E` | 5.3:1 | Secondary text: captions, labels, sources. |
| `accent` | `#CCC3B6` | 1.5:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#282623` | 13.3:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#282623` | 8.7:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#282623` | 13.3:1 | Chart series 1 (the series that matters). |
| `series2` | `#171613` | 15.9:1 | Chart series 2. |
| `series3` | `#494744` | 8.1:1 | Chart series 3. |
| `series4` | `#A6A4A0` | 2.2:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#D3D1CD` | 1.3:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#107537` | 5.1:1 | A good change or a pass. Use only for status. |
| `negative` | `#BC2D2A` | 5.2:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Shippori Mincho | 7.5% | 81 px | 500 | 0.04em | 1.4 | as written |
| headline | Shippori Mincho | 5.6% | 60 px | 500 | 0.04em | 1.45 | as written |
| body | Zen Kaku Gothic New | 4.5% | 49 px | 400 | 0.06em | 1.7 | as written |
| label | Zen Kaku Gothic New | 3.4% | 37 px | 400 | 0.12em | 1.4 | as written |
| caption | Zen Kaku Gothic New | 3.8% | 41 px | 400 | 0.06em | 1.6 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: no statement face (display, headline, body) has a true italic. For `quote`'s `emphasis`, the accent text is the ink, so `quote` sets the word as the rest and says so. Never slant a face that has no italic file.

## Layout

- Margin: 14% of the short side (151 px at 1080).
- Grid: 4 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 1 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1768 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

This system has no chart hand of its own; the chart blocks draw in the plain hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; the system radius, at most a quarter of the bar; at most 1.15 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 3 strokes, context lines 1.25; the scale labels only, no gridlines; a dot on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Very slow fades of 1.5-2.5 s and long holds. Nothing bounces, nothing hurries.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.33, 0, 0.2, 1)` | 54 |
| Move on screen | `cubic-bezier(0.4, 0, 0.2, 1)` | 60 |
| Exit | `cubic-bezier(0.4, 0, 0.6, 1)` | 42 |
| Stagger between items | | 12 |

Transitions: A slow dissolve through the paper.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

A faint paper fibre. Grain strength: 0.03. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **grain**: Film or paper grain over the whole frame.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system ma`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Colour, tamed: saturation 0.25, contrast 0, warmth 0.4; black on `inkMuted` (#66625E), white on `ground` (#F3F0EA). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (support):** full bleed (fills the frame); small in a large empty field. A quiet plate (a moving shadow, a wall, light on paper) fills the frame as the field, and the line sits on its calm part; an object sits small in a large empty field. Held long; muted, warm, soft. Motion: still.
- **Footage (rare):** A small, slow, nearly still clip: water, leaves, light on paper. Speed: slow.
- **Music:** sparse ambient piano, long silences, calm, 56-80 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** none. No effects: silence is part of the design. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 6 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 2.4 s plus 0.4 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "ma"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Shippori Mincho (500); Zen Kaku Gothic New (400); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.
