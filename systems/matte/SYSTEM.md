# Matte

Material. The object turns under a passing light; type is small and quiet.

- **Mode:** dark
- **Reference:** Studio product renders (ManvsMachine, Buck): a matte object on a dark floor, one metal tone, a camera orbit.
- **Palette:** Very dark grey, matte dark objects, one champagne metal tone.
- **Use it for:** launch, ad
- **Needs from you:** A 3D model or a product render. Deferred: needs real materials.

## How this system builds a frame

- The product is the subject, on a floor with a soft reflection.
- Type is small, in a corner.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the subject in a picture by 1 s: the picture on at least 30 % of the frame. The object on its floor on frame 0, lit, with a slow orbit running. An object with mass (a chair, a vessel, a body), not a thin one: its silhouette covers the share (product frames by it), so the middle and lower frame are the object and its reflection.
- **One line and one subject:** top. The line small, in a corner: the smallest role that keeps the phone floor (headline), left on the text-safe top (Matte's type is small and quiet); the product under it, framed with `room`: the frame under the line, a body line height below it, so the object, its shadow and its reflection own the middle and lower frame. Set the line first, left-aligned; the room under it keeps the object clear of it by construction: never on the handle or the rim. The anchor `<product id>-object-extent` holds the object's drawn bounds over the shot, to check the gap. Never strand them in the top third with the lower half empty.
- **Ends:** on a lockup (the subject or mark with the name on one axis), held 1.5 s, the last change on a bar. A clean front view on a strong accent, the name beside the object, held. In a wide or square frame the name sits beside the object (a row); at 9:16 a large object cannot sit beside a name, so endCard sets the name over it (a column). The end card shows the model at its own turn: give its mark `{ objects }` with `rotation: [0, 0, 0]` on the object (its front), or the turn that shows its front. The block that does it: `endCard`, `name`, `axis: "row"` (a column at 9:16), `at` on the last strong onset.
- **Stillness:** nothing holds still for more than 2 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -18 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: a bed under the picture. Enter the track (`section`): open on the start of a section with energy, not a quiet intro: `music({ align: { track: <section start>, film: 0 } })` (sections from `listen.md` or `beats().sections`); the reveal need not sit on a drop. Low drones; enter where the pulse is audible, so the first cut lands on a sound.
- **With no sound:** the moves above assume a bed under the picture. With none, keep a steady beat of your own: a constant `BEAT` of about 0.7 s (the middle of the music's 70-100 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 3 distinct shots: a new angle or new content, never a new crop of one picture. One object, one floor and one light rig; the camera changes, not the material.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a floating sphere with no product. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Matte. Use at least two of them.

- A light passes across the matte surface once per shot. (effect: light-sweep) *Measurable* (`signature`): A bright band moves across the object over 30-60 frames.
- A tight contact shadow where the object meets the floor, and a soft, matte reflection of it in the floor (reflection). (effect: contact-shadow) *Judged by eye.*
- A rim line draws the silhouette on the dark ground. (effect: rim-light) *Judged by eye.*
- Macro shots frame a detail that explains the object, 40-60 % of the frame. *Judged by eye.*

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `product` | `shot`: "orbit", "push" or "turntable"; `sweep`: on a strong onset; `fill`: leave it out: the default fills the hook's share of the frame; `frame`: "detail" with detail: { point, span } for a macro of one part (the 3D camera moves in; the bleed is declared); `material`: a real model keeps its own ("own", the default); roles ("system") only for a form drawn from simple geometry | The object, its light, its shadow and its rim. |
| `text` | `role`: "headline" for the one line of each beat (it must read on a phone); "label" only for a spec or a credit beside the object | The line of each beat, and small type in a corner. |
| `music` | defaults | A bed entered at a section with an audible pulse. |
| `hit` | defaults | A soft swell as the light crosses. |
| `endCard` | `name`: the name; `axis`: "row"; `at`: the last strong onset | The name beside the object, held. |

Do not use: `photo` (Matte is a render; a photo breaks the material); `kineticWords` (Type is small, in a corner).

Not in the catalog yet. Until a block exists, build the nearest thing from the blocks above, and say in a comment what is missing:

- **endCard beside an object**: The name aligned to the object's top or centre line; endCard centres its lockup in a box the scene gives.

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#100F0E` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#1C1A19` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#373534` | 1.6:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#EDEBE7` | 16.1:1 | All primary text and primary marks. |
| `inkMuted` | `#94928E` | 6.2:1 | Secondary text: captions, labels, sources. |
| `accent` | `#C5B59B` | 9.5:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#CBBBA1` | 10.2:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#100F0E` | 9.5:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#C5B59B` | 9.5:1 | Chart series 1 (the series that matters). |
| `series2` | `#F0EEEC` | 16.5:1 | Chart series 2. |
| `series3` | `#B0ADAB` | 8.6:1 | Chart series 3. |
| `series4` | `#6B6867` | 3.5:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#3F3D3B` | 1.8:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 9.1:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 6.2:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Geist | 9% | 97 px | 500 | -0.02em | 1.05 | as written |
| headline | Geist | 6% | 65 px | 500 | -0.01em | 1.1 | as written |
| body | Geist | 4.2% | 45 px | 400 | 0em | 1.35 | as written |
| label | Geist | 3.4% | 37 px | 500 | 0.06em | 1.2 | upper |
| caption | Geist | 4% | 43 px | 400 | 0em | 1.3 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 9% of the short side (97 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 2 px at 1080.
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

A slow orbit and a light that passes across the surface; macro moves.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.3, 0, 0.2, 1)` | 30 |
| Move on screen | `cubic-bezier(0.45, 0, 0.55, 1)` | 60 |
| Exit | `cubic-bezier(0.55, 0, 1, 0.45)` | 20 |
| Stagger between items | | 6 |

Transitions: A cut on the beat, or the light sweep becomes the next scene.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

Matte surfaces and a specular edge, and a soft reflection in the floor. No gradient environment. Grain strength: 0.02. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **light-sweep**: A narrow band of light that crosses a subject's surface once.
- **contact-shadow**: A tight shadow where an object touches the floor.
- **rim-light**: A thin light line on a subject's edge.
- **grain**: Film or paper grain over the whole frame.
- **reflection**: A faint, matte mirror of the object in the floor under it.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system matte`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Colour, tamed: saturation 0.45, contrast 3, warmth 0.3; black on `ground` (#100F0E), white on `ink` (#EDEBE7). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (rare):** full bleed (fills the frame). The object is a 3D render (the product block); a photo, if any, is warm, muted and dark. Motion: drift.
- **Footage (rare):** Slow material close-ups, warm and dark. Speed: slow.
- **Music:** cinematic ambient texture, low drones, tactile, 70-100 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** swell, at most 2 in 10 s. A soft swell as the light crosses the object. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 5 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.6 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "matte"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Geist (400, 500); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.
