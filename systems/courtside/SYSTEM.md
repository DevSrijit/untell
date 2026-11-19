# Courtside

Momentum. A condensed headline slams over a subject; cuts whip on the beat.

- **Mode:** dark
- **Reference:** Nike campaign posters: a huge condensed headline over a subject, one hot colour, high contrast.
- **Palette:** Black, white and one volt yellow-green.
- **Use it for:** ad, wrapped, trailer
- **Needs from you:** A photo or silhouette of the subject.

## How this system builds a frame

- One condensed headline per scene, as large as it fits.
- The volt marks the one word or number that wins.
- A real subject (photo or silhouette) sits behind the type.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show a picture and the main line by 0.5 s: the line in the display role, the picture on at least 40 % of the frame. The subject and the first condensed word on frame 0, with the bed audible under it (a kick, when the track has one there).
- **One line and one subject:** behind. The photo fills the frame with `over: true`; the words go behind the cut-out subject through placeBehind (cover.ts), so no word loses a letter. When the athlete fills the text-safe area and no place keeps every letter, the words take a band of the ground at the top and the athlete fills the frame under it; the picture starts under the words (lineInBand with overlap), so the head may rise in front of the words' foot only where placeBehind keeps every letter whole (a letter's foot carries its name). At 16:9 the band is a column beside the athlete. Keep the figure: never set the words across the body. Never strand them in the top third with the lower half empty.
- **Ends:** on the offer at full size, held 1.5 s, the last change on a bar, with the system's one impact. The offer at full width in the volt, its when and where under it, with the one impact on the cut. The block that does it: `endCard`, the offer as `name` at full width in the volt, `line` the when and where, the one impact from `hit` on the cut.
- **Stillness:** nothing holds still for more than 1.05 s (or 2 beats of the track, when that is longer), except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -14 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Dark trap. Enter so the drop lands on the biggest change.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.45 s (the middle of the music's 118-142 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 3 distinct shots: a new angle or new content, never a new crop of one picture. One athlete, one light; wide, mid and tight on the beats.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; a generic sports slogan. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Courtside. Use at least two of them.

- A huge condensed headline over the subject; the subject breaks a word that still reads. *Measurable* (`contrast-over-picture`): No letter more than 30 % covered; the word covers at least 60 % of the width.
- A whip pan with motion blur in the direction of travel. (effect: motion-blur) *Judged by eye.*
- The volt marks the one word or number that wins. *Measurable* (`signature`): The accent covers one word per key frame.
- The drop lands on the biggest change. *Measurable* (`sound/cut-on-beat`): The largest picture change sits within 2 frames of the drop.

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `photo` | `over`: true, with the words placed by placeBehind (cover.ts) so no word loses a letter behind the subject; when placeBehind finds no place (ok false), set the words in front: over false; `fade`: "top" when framed low | The subject behind and over the type. |
| `kineticWords` | `role`: "display" | The condensed words, one cap height, cut on the kick. |
| `ground` | `color`: "accent"; `enter`: "cut" | The volt ground on the drop, behind the words (a colour that stays is a ground; a wipe crosses the frame and leaves). |
| `camera` | `moves`: 6-frame pushes of 6-8 % on each word cut; pin the words (kineticWords `pinned: true`) so the push moves the picture, never the edge-to-edge type; `whips`: the whip to the end card, blurred along its travel | Real motion on the subject. |
| `hit` | defaults | A whoosh on the whip, one impact on the cut to the end card. |
| `endCard` | `name`: the offer; `line`: when and where; `at`: the drop's last bar | The offer in display at full width, its when and where under it. |

Do not use: `lowerThird` (The offer is the loudest frame, not a small label); `lineChart` (A poster states, it does not plot).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#070707` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#121212` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#2B2B2B` | 1.4:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#F5F5F5` | 18.5:1 | All primary text and primary marks. |
| `inkMuted` | `#9E9E9E` | 7.5:1 | Secondary text: captions, labels, sources. |
| `accent` | `#D3EE2B` | 15.4:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#D3EE2B` | 15.4:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#070707` | 15.4:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#D3EE2B` | 15.4:1 | Chart series 1 (the series that matters). |
| `series2` | `#F1EDEE` | 17.4:1 | Chart series 2. |
| `series3` | `#B0ADAE` | 9.1:1 | Chart series 3. |
| `series4` | `#6B6869` | 3.7:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#3F3C3D` | 1.8:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 9.5:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 6.5:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Anton | 20% | 216 px | 400 | -0.01em | 0.88 | upper |
| headline | Anton | 12% | 130 px | 400 | 0em | 0.92 | upper |
| body | Barlow Condensed | 5% | 54 px | 600 | 0.01em | 1.15 | upper |
| label | Barlow Condensed | 4% | 43 px | 700 | 0.06em | 1.1 | upper |
| caption | Barlow Condensed | 4.8% | 52 px | 600 | 0.02em | 1.15 | upper |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the body face has a true italic, and `quote` sets its `emphasis` word in it. The display and headline faces have none: there the word takes the accent text colour (`accentText`). Never slant a face that has no italic file.

## Layout

- Margin: 5% of the short side (54 px at 1080).
- Grid: 6 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 6 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1866 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.
- This system lets display text run past the safe area, edge to edge: display type is picture here, and it may run into the lower band (kineticWords stacks it down to 85 % of the height). The word must still read when the platform's UI covers part of it.

## Charts

This system has no chart hand of its own; the chart blocks draw in the plain hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; the system radius, at most a quarter of the bar; at most 1.15 value line heights thick; a baseline of 1 stroke.
- Values in label, the key value in caption. A value axis only when not every value prints.
- Lines: the key line 3 strokes, context lines 1.25; the scale labels only, no gridlines; a dot on the last point.
- Areas: a flat tint of the key colour over an opaque context fill.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.

## Motion

Fast pushes, whip transitions, hard cuts on the beat.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.16, 1, 0.3, 1)` | 6 |
| Move on screen | `cubic-bezier(0.83, 0, 0.17, 1)` | 10 |
| Exit | `cubic-bezier(0.7, 0, 0.84, 0)` | 5 |
| Stagger between items | | 2 |

Transitions: A whip pan with motion blur in the direction of travel, or a hard cut.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

Grain and a contrast boost. Grain strength: 0.05. The scene renderers draw the grain over every frame (src/system/grain: 8 fixed noise tiles, one a frame); do not add your own.

This system allows only these effects:

- **motion-blur**: Blur along the direction of travel during a fast move, only while it moves.
- **grain**: Film or paper grain over the whole frame.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system courtside`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Black and white, contrast 9: black on `ground` (#070707), white on `ink` (#F5F5F5). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (hero):** the subject cut out over the type (plan with `placeBehind`; the cover check keeps every letter readable); framed low (fills the frame below the type; its top eases into the ground, photo `fade: "top"`); full bleed (fills the frame). A real subject behind the type; the subject crosses the headline but every letter reads. Cut-outs allowed. Motion: push.
- **Footage (support):** Hard black and white b-roll: a net, a court, a shoe. Framed low under the end card. Speed: slow.
- **Music:** dark trap, heavy 808, determined, building to a drop, 118-142 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** whoosh, impact, riser, at most 3 in 10 s. A whoosh on a panel or a whip; an impact on the cut to the last card. The drop lands on the biggest change. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 5 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 0.6 s plus 0.15 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "courtside"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Anton (400); Barlow Condensed (600, 700); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.

This system breaks the default rule "near-black-with-one-vivid-accent" on purpose: Volt on black is the sports-campaign reference itself, used on one word or number, never as a UI accent or a glow.
