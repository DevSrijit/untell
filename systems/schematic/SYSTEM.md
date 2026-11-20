# Schematic

Engineering. Systems drawn in white hairlines, labelled and measured.

- **Mode:** dark
- **Reference:** IBM's Carbon design system in its darkest theme: grey 100, IBM Plex, hairline diagrams with labels.
- **Palette:** Grey-black ground, white and grey type, one IBM blue for the active path.
- **Use it for:** explainer, data-story, tutorial, presentation

## How this system builds a frame

- Diagrams in white hairlines with mono labels.
- The blue marks only the active path or the part being explained.
- Dimension lines and callout numbers, as in a schematic.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show a picture and the main line by 1 s: the line in the headline role, the picture on at least 30 % of the frame. The full diagram in hairlines on frame 0, with the question in a status line above it.
- **One line and one subject:** top. The question in a status line at the text-safe top. The figure box under it spans the picture-safe width down to 86 % of the frame's height (`figureBox`); fitDrawing with no area stands the drawing on that foot, across the text column, so the drawing fills the lower band with picture (only picture may go there; the last 14 % stays clear). Its labels and dimensions take the text-safe area: make one `figure` of the drawing's parts (with `pulley` and `rope` for wheels and ropes) and give it to each `dimension` and `callout`, and they place themselves clear of every stroke, of the status line and of each other (a force's name at its arrow's tail, dimensions just clear of what they span, a chain on one line). A dimension of a part in the lower band keeps its lines there and puts its value on a short leader in the text-safe area. Name a part by a point near the text-safe area (the top of a load in the lower band, not its foot). Lay a plate under it with the sheet's `plate`: the plate is the figure box, and the figure with its labels fills it from its foot up. Stand the parts with `boxAt` and `pointOf` (a fulcrum's apex under a beam), and rest one part on another with shape `on`, never with hand-computed moves. An equation or a note goes in the status line, or in a box from the figure's `place`. The hook counts the plate with its drawing as one picture; the empty-frame check counts only the drawing's lines, labels and dimensions as content, never the grid or the empty part of a plate. Never strand them in the top third with the lower half empty.
- **Ends:** on a last event on screen that holds, held 1.5 s, the last change on a bar. A full elevation at a scale where everything fits, with the answer's dimension drawn last (its lines in the lower band where the part stands there, its value in the text-safe area) on one of the loudest bars (`beats().loudest`). The block that does it: `dimension`, the answer's dimension drawn last on one of the loudest bars, its tick from `hit({ on })`, then `hold` to the end (the closing hold is exempt from the stillness rule).
- **Stillness:** nothing holds still for more than 2 s, except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -16 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: a bed under the picture. Enter the track (`section`): open on the start of a section with energy, not a quiet intro: `music({ align: { track: <section start>, film: 0 } })` (sections from `listen.md` or `beats().sections`); the reveal need not sit on a drop. Steady techno. Enter on a section whose bars are among the track's loudest (`beats().loudest` for the film's window is not empty), so the answer can land on one. A dry tick as each dimension locks, 6 dB over the bed.
- **With no sound:** the moves above assume a bed under the picture. With none, keep a steady beat of your own: a constant `BEAT` of about 0.55 s (the middle of the music's 104-124 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 1 distinct shot: a new angle or new content, never a new crop of one picture. One drawing at one scale, or the scale break labelled.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a generic network diagram. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Schematic. Use at least two of them.

- Lines draw, labels follow, and the active path lights in blue. *Measurable* (`signature`): The accent covers one connected region per key frame: the active path.
- The camera pans along the diagram; a status line stays on screen through every pan. *Measurable* (`message-gap`): A sentence stays on screen through every pan.
- The answer is drawn: dimension lines and callout numbers, not only typed. *Judged by eye.*
- A hairline grid under the diagram. *Measurable* (`signature`): Hairlines at a fixed pitch in every key frame.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `shape` | `kind`: "rect" for a beam or a load, "triangle" for a fulcrum (its points from pointOf: "apex", "base"); `on`: the part it rests on and the point: { part: fulcrum, at: "apex" }; it rides and turns with that part; `pivot`: the point it turns about (default: the point it rests on) | The parts of a mechanism that rest on each other and turn, with no hand-computed move. |
| `dimension` | `text`: the measure; `figure`: the drawing's figure: the dimension takes the nearest clear tier, and its value goes on its line or on a short leader in the text-safe area; `side`: "above" (default), "left" or "right" for a height; the error names a side that works; `follow`: the part's keys when it moves | Dimension lines in tiers outside the drawing, measured square to the side they stand on. |
| `callout` | `label`: the part's name or its force, short (a label beside a 9:16 drawing has about 4 words of room); `number`: the callout number, where the label is short enough; `target`: a point on the part, near the text-safe area; `figure`: the drawing's figure: the label goes next to its target, clear of every stroke, label and leader | Callouts whose short leaders end on the part. |
| `rope` | `run`: the stops: the fixed end, each wheel (a `pulley`: r from fitDrawing, `moves` for a wheel that rises, `turns` from rollDegrees) with its turn, the free end (with `follow` when it moves); `light`: the active path, in the accent | An open rope over pulleys (wheels with no teeth that turn by key marks) whose strands change length as a wheel moves. |
| `text` | `pinned`: true; `role`: "headline" for the question (the hook's role); "label" for the status line's small print | The question and the status line, pinned, so they ride through the `camera` pans along the diagram (camera `moves`). |
| `sheet` | `grid`: "lines"; `plate`: true: the plate under the drawing, the figure box; `titleBlock`: with fitDrawing's scale | The complete hairline grid, the plate and the title block; fitDrawing stands the drawing in figureBox. |
| `gear` | `teeth`: the real count; `turns`: from ratioTurns; `r`: from fitDrawing, or heroBox: the drawing covers the hook's share of the frame; `color`: "accent" on the driving gear (the active part), the rest in ink | Sprockets on one tooth pitch, turning at the true ratio; `belt` draws the chain on their outer tangents, the active path in blue. |

Do not use: `photo` (Pictures are rare; the drawing explains); `kineticWords` (Schematic is productive, not loud).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#161616` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#222222` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#3D3D3D` | 1.7:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#EEEEEE` | 15.6:1 | All primary text and primary marks. |
| `inkMuted` | `#989898` | 6.3:1 | Secondary text: captions, labels, sources. |
| `accent` | `#295FD4` | 3.2:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#6C9CFB` | 6.7:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#F5F5F5` | 5.2:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#295FD4` | 3.2:1 | Chart series 1 (the series that matters). |
| `series2` | `#F1EDEE` | 15.6:1 | Chart series 2. |
| `series3` | `#B0ADAE` | 8.1:1 | Chart series 3. |
| `series4` | `#6B6869` | 3.3:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#3F3C3D` | 1.7:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 8.6:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 5.8:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | IBM Plex Sans | 10% | 108 px | 600 | -0.02em | 1.05 | as written |
| headline | IBM Plex Sans | 6.6% | 71 px | 600 | -0.01em | 1.1 | as written |
| body | IBM Plex Sans | 4.4% | 48 px | 400 | 0em | 1.4 | as written |
| label | IBM Plex Mono | 3.4% | 37 px | 400 | 0em | 1.25 | as written |
| caption | IBM Plex Sans | 4.2% | 45 px | 400 | 0em | 1.35 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the display, headline and body faces have a true italic. `quote` sets its `emphasis` word in it. Never slant a face that has no italic file.

## Layout

- Margin: 7% of the short side (76 px at 1080).
- Grid: 8 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 2 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1844 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: hairline outlines on the ground, the key bar filled; square ends; at most 1 value line heights thick; a baseline of 0.5 strokes; extension marks at each bar end.
- Values in label, the key value in caption. A measured ruler (ticks and labels) on the value axis, always.
- Lines: the key line 1.5 strokes, context lines 0.75; short ticks at the axis; an open ring on the last point.
- Areas: a flat tint of the key colour over an opaque context fill. Every end label takes a short leader.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Productive: lines draw, labels follow, the active path lights in blue.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.2, 0, 0.38, 0.9)` | 12 |
| Move on screen | `cubic-bezier(0.4, 0.14, 0.3, 1)` | 24 |
| Exit | `cubic-bezier(0.2, 0, 1, 0.9)` | 10 |
| Stagger between items | | 3 |

Transitions: The camera pans along the diagram to the next part.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

A hairline grid. Never a blue blueprint tint.

This system allows no effects: no blur, no shadow, no grain.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system schematic`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Black and white, contrast 3: black on `ground` (#161616), white on `inkMuted` (#989898). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (rare):** in a window (a box on the grid with a margin). A reference photo in a measured window, quiet grey; the drawing is the hero. Motion: still.
- **Footage (none):** No footage.
- **Music:** minimal techno, steady, technical, 104-124 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** tick, at most 6 in 10 s. A dry tick as a dimension or label locks. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 10 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 1.5 s plus 0.3 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "schematic"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: IBM Plex Sans (400, 600); IBM Plex Mono (400); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than 1 accent elements in a frame. One accent element in a frame: the active path (its lines and the labels that sit on it read as one part). The rest of the drawing is in ink.
