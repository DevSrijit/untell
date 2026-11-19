# Kinetic

Type is the motion. Words fill the frame and cut on the beat.

- **Mode:** dark
- **Reference:** DIA Studio's kinetic typography: words fill the frame, scaled, cropped and stacked to the beat.
- **Palette:** Black, white and one cobalt blue used on a single word.
- **Use it for:** kinetic-type, music-lyric, ad, title-sequence

## How this system builds a frame

- Words fill the frame edge to edge; cropping is allowed.
- Every cut lands on a beat.
- The accent colours one word per phrase.

## Direction

How a film in this system opens, moves, sounds and ends. Read it before you plan the scene.

- **Hook (first 2 s at 9:16):** show the main line in type on frame 0: the line in the display role. The first word fills the frame edge to edge on frame 0, cropped by the frame, on the beat.
- **One line and one subject:** fill. The words are the subject: kineticWords fills the text-safe box; no other subject shares the frame. Never strand them in the top third with the lower half empty.
- **Ends:** on a hard cut to the ground on a bar, the last change on a bar. The last line lands on the track's loudest bar, then a hard cut to the ground on the bar. No static restatement. The drop on the reveal wins over this: when no loudest bar falls after the reveal in the film's window, the last line lands on the next strong bar after the reveal (a bar of `beats().bars`, or a cut point of `beats().cuts`), and the cut to the ground comes on the bar after it. The block that does it: `ground`, `color: "ground"`, `enter: "cut"`, `at` on the bar after the last line: the hard cut to the ground, no hold.
- **Stillness:** nothing holds still for more than 1.05 s (or 2 beats of the track, when that is longer), except a hold you mark with `B.hold` and the closing hold. A held line counts as still: keep something moving (a push, a drift, a cursor) while a long line is read.
- **Mix:** the system's mix target is -14 LUFS for the whole mix (within 2 LU), true peak at most -1 dBTP. `untell master` brings a render to it. Music: the clock: cuts and entrances land on its beats. Enter the track (`drop`): put the track's drop on the reveal: `music({ peakAt: <reveal time> })`, then take every cut time from `beats()`. Driving, four on the floor. No effects: the cuts land on the kick, and the music carries them.
- **With no sound:** the moves above assume the music's beats. With none, keep a steady beat of your own: a constant `BEAT` of about 0.5 s (the middle of the music's 118-128 BPM), and time the moves on its multiples. Each rule above that names a beat or a bar (a cut, an entrance, the lockup, the end) lands on that grid; four beats make a bar. Where an effect would land (an impact, a pop), let the picture carry the accent: a cut or a fill on the beat. State it in the scene: `export const silent = "<the reason>";` (untell lint and untell check list it with the declarations), and leave out `music` and `hit`. The checks of the sound do not run.
- **Shots:** a film of 10 s or more with pictures has at least 3 distinct shots: a new angle or new content, never a new crop of one picture. Flash pictures share one grade, through the inks.
- **Subjects to avoid:** Fibonacci numbers or the golden spiral; hello world; a to-do app; FizzBuzz or a sort of ten numbers; a weather app; the digits of pi; light's trip to the Moon; the speed of light; a motivational quote. Every model reaches for these first. Pick a subject the brief would not expect.

### Signature moves

These moves make a film read as Kinetic. Use at least two of them.

- Display type bleeds edge to edge, cropped by the frame on purpose. *Measurable* (`signature`): Ink covers at least 60 % of the frame width on most beats.
- The accent word grows until it fills the frame and becomes the next ground. *Measurable* (`signature`): The accent covers more than 90 % of a frame at a scene change.
- Every cut lands on a beat. *Measurable* (`sound/cut-on-beat`): Cuts sit within 1 frame of a beat.
- Motion blur along the direction of travel on the fastest moves. (effect: motion-blur) *Judged by eye.*

### Block map

The blocks that carry this system, with the props to use. Look here and in `systems/BLOCKS.md` before you build anything by hand.

| Block | Props | For |
| --- | --- | --- |
| `kineticWords` | `role`: "display"; `phrases`: one per beat, accent on one word; the reveal phrase `reveal: true` (the hero size: the largest type of the film); `exit: "toGround"` on the accent phrase before a ground change | Words that fill the frame and bleed; the accent word that grows until it fills the frame and becomes the next ground. |
| `carry` | `then`: the stack's next place on each beat | A word that stays and moves while the next one enters. |
| `ground` | `color`: "accent"; `enter`: "cut" | A ground change on the beat, behind the words (a colour that stays is a ground; a wipe crosses the frame and leaves). |
| `counter` | `role`: "display" | A number that counts in on the beat at display size. |
| `ground` | `color`: "accent" for a ground change; "ground" for the end; `enter`: "cut" | A ground change on the beat; and the end: a hard cut to the ground on the bar after the last line. |
| `camera` | `whips`: a 5-frame whip on the transition, blurred along its travel | The whip between scenes, with motion blur. |
| `wordSeries` | `words`: one per beat; `role`: "display" | Words that replace each other at one cap height, baseline and left edge. |

Do not use: `hold` (Kinetic never holds still); `lineChart` (Kinetic speaks in words, not charts).

## Colour roles

Use roles, never colour values. The file `tokens.css` defines each role as `--color-<role>`.

| Role | Value | Contrast | Use |
| --- | --- | --- | --- |
| `ground` | `#060606` | 1.0:1 | The background of every frame. Flat: no gradient, no glow, no vignette. |
| `surface` | `#0F0F0F` | 1.1:1 | Panels and cards that sit on the ground. |
| `rule` | `#292929` | 1.4:1 | Hairlines, borders, axes and dividers. |
| `ink` | `#F5F5F5` | 18.6:1 | All primary text and primary marks. |
| `inkMuted` | `#9E9E9E` | 7.6:1 | Secondary text: captions, labels, sources. |
| `accent` | `#1F5ED9` | 3.5:1 | Fill for the one block or mark that matters. For text in this colour, use accentText. |
| `accentText` | `#528DFF` | 6.4:1 | Text set in the accent colour on the ground. |
| `onAccent` | `#F5F5F5` | 5.3:1 on accent | Text placed on an accent-coloured block. |
| `series1` | `#1F5ED9` | 3.5:1 | Chart series 1 (the series that matters). |
| `series2` | `#F1EDEE` | 17.5:1 | Chart series 2. |
| `series3` | `#B0ADAE` | 9.1:1 | Chart series 3. |
| `series4` | `#6B6869` | 3.7:1 | Chart series 4: context data, kept quiet. |
| `series5` | `#3F3C3D` | 1.9:1 | Chart series 5: context data, kept quiet. |
| `positive` | `#65C67D` | 9.6:1 | A good change or a pass. Use only for status. |
| `negative` | `#EF675C` | 6.5:1 | A bad change or a fail. Use only for status. |

## Type

Sizes are fractions of the frame's short side. The px column is for a short side of 1080 px (1080x1920, 1920x1080 or 1080x1080).
Use only these five roles. Do not set a size, weight or font yourself.

| Role | Font | Size | At 1080 | Weight | Tracking | Leading | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| display | Archivo Black | 24% | 259 px | 400 | -0.04em | 0.86 | upper |
| headline | Archivo Black | 14% | 151 px | 400 | -0.03em | 0.9 | upper |
| body | Archivo | 5% | 54 px | 600 | 0em | 1.2 | as written |
| label | Archivo | 4% | 43 px | 700 | 0.02em | 1.1 | upper |
| caption | Archivo | 5% | 54 px | 600 | 0em | 1.2 | as written |

Fonts are Google Fonts under the SIL Open Font License. Load them; never fall back to a system font.
Load the symbol fallback (Noto Sans Math) after the main family, in weight 400. It draws only the glyphs the main family lacks, such as π ≈ → ←.
A role set in capitals also sets maths in capitals. Give a text node `keepCase` (or the text, title and kineticWords blocks `keepCase: true`) for maths and units such as "π r²".
Italic: the body face has a true italic, and `quote` sets its `emphasis` word in it. The display and headline faces have none: there the word takes the accent text colour (`accentText`). Never slant a face that has no italic file.

## Layout

- Margin: 4% of the short side (43 px at 1080).
- Grid: 4 columns, gutter 2.2 % of the short side. At 9:16 the columns fill the safe area below, not the margins.
- Corner radius: 0 px at 1080. Stroke: 4 px at 1080.
- At 9:16, TikTok, Reels and Shorts cover parts of the frame with their own UI. Keep text inside the area all three leave clear:
  from 15 % to 65 % of the height, and from 11 % to 82 % of the width. Below 44 % of the height, end text by 72 % of the width.
  At 1080x1920 that is x 120-888 px and y 288-1248 px, with text ending by x 780 px below y 840 px.
  Graphics may extend past this area; text may not. At 9:16 the text-safe area ends at 65 % of the height. A picture,
  a pane, a chart or a shape is picture: it may run down to the picture-safe foot (the frame inside the margin:
  y 1876 px at 1080x1920). A film must not leave the lower 35 % empty: fill it with picture. Only text must stay
  in the safe area.
- This system lets display text run past the safe area, edge to edge: display type is picture here, and it may run into the lower band (kineticWords stacks it down to 85 % of the height). The word must still read when the platform's UI covers part of it.

## Charts

The chart blocks draw in this system's own hand (src/system/scene/blocks/hand.ts):
- Bars: flat fills; square ends; rows that fill their box; no baseline (the bars share one edge).
- Values in caption, the key value in headline, inside its bar when it fits. A value axis only when not every value prints.
- Lines: the key line 2 strokes, context lines 1; the scale labels only, no gridlines; a square on the last point.
- Areas: a flat tint of the key colour over an opaque context fill. Lines step: level, then a vertical jump.
- At 9:16, `barChart` with `from: "top"` hangs its bars from a rail under the labels, and `lineChart` and `areaChart` given a box down to the picture-safe foot let the plot climb the frame with every label inside it: the bars and the lines run down into the lower band.
- Refuses line and area charts: Kinetic speaks in words, not charts: give the one number to counter (role: display), or compare with barChart (from: "top").
- Horizontal rows too thin for every value print only the key value, large and inside its block, and the other blocks read against a three-tick scale: one accent word per phrase, as the grammar asks. Hanging bars (`from: "top"`) print every value.

## Motion

Fast and percussive: 4-8 frames per word, scale pops, masked rolls, wraps around the frame.

| Use | Curve | Frames at 30 fps |
| --- | --- | --- |
| Enter | `cubic-bezier(0.16, 1, 0.3, 1)` | 5 |
| Move on screen | `cubic-bezier(0.83, 0, 0.17, 1)` | 9 |
| Exit | `cubic-bezier(0.7, 0, 0.84, 0)` | 4 |
| Stagger between items | | 2 |

Transitions: Cut on the beat; a word grows to fill the frame and becomes the next ground.

Use each curve as a cubic-bezier easing in your framework. Do not use a named easing such as "ease-in-out".

## Texture

None.

This system allows only these effects:

- **motion-blur**: Blur along the direction of travel during a fast move, only while it moves.

## Media

Pictures and sound make a film read as made by people, not by code (blind tests: photo, footage and sound beat code alone).
Use pictures, footage and sound that the brief's owner may use. When the brief gives no files and lets you fetch them, find them yourself, and record each file's source and licence when you add it (`untell media add <file> --source <text> --licence <text>`). When the brief gives no files and forbids downloads, or asks for type and shapes only, add no media: make the picture with type and the shape blocks of the block map and of `systems/BLOCKS.md` (`shape`, `drawnMark`, `lockup`, the chart blocks), and read the "With no sound" line of the Direction section. untell records that text and does not check it. `untell media formats` says which formats and sizes work. Prefer subjects with no identifiable face (a back, hands, a silhouette, a crowd at a distance); never use a picture of an identifiable child. Prepare each picture with `untell media prepare <name> --system kinetic`: it grades it for this system.
A screenshot or screen recording is evidence: never grade it, in any system (`prepare <name> --as-is`).

- **Grade:** Black and white, contrast 7: black on `ground` (#060606), white on `ink` (#F5F5F5). Behind type (`photo({ dim: true })`), the picture keeps the range over which the ink reads at 4.5:1, and its levels fill that range. `untell media prepare` warns when a prepared picture shows too little detail for a phone.
- **Pictures (rare):** a one-beat flash, full frame, between words. A picture flashes for one beat between words, full frame; the type is the motion. Motion: still.
- **Footage (rare):** A one-beat flash of footage at most. Speed: real.
- **Music:** driving electronic, four on the floor, punchy, 118-128 BPM. Where to enter the track and the mix target: the Mix line in the Direction section. The `music` block sets the bed's level for the system's mix target; give `volume` only to set a level by hand.
- **Effects:** none. No effects: the cuts land on the music's beats, and the music carries them. Use the `hit` block: it lands each effect's peak one frame after its picture. Give `hit` and `typing` the music block's nodes as `bed`: the level then follows the bed, over it and never louder than the music's peak. `typing` keeps its ticks to the limit above.

## Density

- At most 4 words of prose on screen at once: sentences in any role (display, headline, body, caption). Code, terminal commands and output, chart and diagram labels, data and numbers are not prose and do not count, also when they are set in the caption role.
- Hold each text for at least 0.25 s plus 0.12 s per word.

## Build with it

Follow the untell skill in your project (`.claude/skills/untell/SKILL.md` or `.agents/skills/untell/SKILL.md`, written by `untell init`). A film is a scene module that names this system: `export const system = "kinetic"`. The kit sets the ground, the fonts, every colour, size and curve, and the frame step.

- Remotion: register the scene with `sceneComposition` from the kit's `film.tsx`, as the example film does.
- HyperFrames: `untell build <scene>` writes the page, the bundle, the fonts and the grain.
- Do not set a colour, font, size, weight or easing yourself. Run `untell lint <scene>` after each edit, and `untell check` before you say the film is done.
- Fonts: Archivo Black (400); Archivo (600, 700); Noto Sans Math (400). The kit loads them; never fall back to a system font.

## Never

- A gradient, glow or soft coloured cloud behind content. It is the most common sign of an AI-made video.
- An effect that the Texture section does not list.
- A colour, font, size or easing that this file does not name.
- Pure black (#000000) or pure white (#FFFFFF).
- More than one accent element in a frame.
