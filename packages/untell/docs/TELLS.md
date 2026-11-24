# The tells

Generated from the rules by the untell pack script. Do not edit: `untell lint --docs` prints the same text.

`untell lint` reads source code and finds what makes a video read as AI-made, before any frame is rendered.
It has 43 rules: 26 for any video code and 17 for an untell scene module.
An error makes `untell lint` exit with 1. A warning does not, unless you give `--max-warnings <n>`.

To silence one finding, write a comment on its line or on the line above it:

```ts
// untell-ignore <rule id>: <reason>
```

`tell/*` silences every rule in that set. Always give the reason.

## In any video code (Remotion, HyperFrames, HTML, CSS, GSAP)

| Rule | Level | Why it is a tell | Fix |
| --- | --- | --- | --- |
| `tell/navy-ground` | error | A dark blue or ink-blue background is the purple gradient of video: the default every model reaches for. | Use a system's ground. For your own palette, take a neutral near-black or a light ground. |
| `tell/purple` | warning | Purple and violet accents, alone or in a blue-to-pink sweep, mark a video as AI-made at a glance. | Use one accent from a system. No system uses purple or violet. |
| `tell/gradient` | error | A gradient behind content, most of all a radial glow or a soft blob, is the most common tell. | Use a flat ground. Depth comes from layout, pictures and motion, not from a glow. |
| `tell/gradient-text` | error | Gradient-filled headline text (background-clip: text) is a landing-page cliché that reads as generated. | Set type in one ink. Mark one word with the accent if one word matters. |
| `tell/glow` | error | Coloured glows, blurred blobs and frosted panels are decoration with no cause on screen. | Remove it. A system allows only the effects its Texture section lists. |
| `tell/default-font` | warning | Inter, Roboto, Arial, Helvetica and system-ui are what code reaches for with no art direction. | Use a system's fonts. Each system names its families and loads them. |
| `tell/eyebrow` | warning | A tiny, wide-tracked capital line over a headline ("INTRODUCING") is the template opener. | Open on the idea itself. If a label is needed, use the system's label role. |
| `tell/emoji` | warning | Emoji as icons or bullets (a rocket, sparkles) read as chat output pasted into a video. | Draw a shape or use type. A system has no emoji. |
| `tell/cliche-copy` | warning | Stock marketing phrases say nothing, and a viewer has seen each one a thousand times. | Say the specific thing: a number, a fact, what it does. Short and concrete. |
| `tell/placeholder` | error | Placeholder names and filler text show that nobody decided what the video says. | Write the real content. For a fictional name, draw one at random for this film. |
| `tell/feature-cards` | warning | "Key Features" over three icon cards is a slide, not a film: the slideshow tell. | Show one thing at a time, working. One idea per scene. |
| `tell/default-ease` | warning | ease-in-out, linear and library defaults (power2.inOut, a bare spring) make every move feel the same and slow to start. | Use the system's three curves: enter, move, exit. They are cubic-beziers tuned per system. |
| `tell/fade-everything` | warning | When every element only fades in, the video is a slideshow with dissolves. | Give entrances a direction and a cause: a masked rise, a draw, a cut on the beat. |
| `tell/uniform-stagger` | warning | One stagger value on every list (0.1 s, forever) is the rhythm of a template. | Take the stagger from the system, and land groups on the music's beats. |
| `tell/random` | error | Math.random() and Date in a frame make every render different: flicker, and frames nobody can check. | Derive every value from the frame number or a seeded function. |
| `tell/silent` | warning | A film over about 10 s with no sound reads as unfinished; a viewer notices silence before any frame. | Add a music bed and a few effects with a cause on screen. Or, when the brief gives no sound or forbids it, state that the film is silent in the scene: export const silent = "<the reason>"; |
| `tell/scale-from-zero` | warning | A thing that grows from scale 0 comes from nowhere. Nothing in the world appears from a point. | Enter from a mask or an edge, or from near full size (0.9 or more) with a fade. |
| `tell/bounce` | warning | A loose spring (low damping, high bounce) on every entrance is the default of a motion library, and it reads as a toy. | Use the system's enter curve. Keep bounce for a system that allows it, and for one thing in a film. |
| `tell/slow-open` | warning | A film that fades up from nothing for most of a second makes the viewer wait on frame 0, where they decide to stay. | Show the subject at full strength on frame 0. Let something move, not fade in. |
| `tell/uniform-scenes` | warning | Four or more scenes of the same length are a slideshow: the film has a metronome, not a rhythm. | Give each beat the time its content needs, and take cut times from the music's bars. |
| `tell/particles` | warning | Confetti, sparkles, a star field or floating orbs behind content are filler: motion with no cause. | Remove it. Let the subject move. A system allows only the textures its Texture section lists. |
| `tell/window-chrome` | warning | Three traffic-light dots on a rounded dark card is the stock mock of a code window, seen in every generated video. | Show the code or the terminal in the system's own panel (the terminal, codeBlock or pane block). |
| `tell/icon-library` | warning | Icons from a UI icon set (Lucide, Heroicons, Font Awesome) make a film read as an app template. | Draw the one mark the film needs with the shape blocks, or use a picture. |
| `tell/text-shadow` | warning | A shadow under text is a patch for text that the layout put on a busy picture. | Put the text on a calm area or a plate, or dim the picture. The check type-over-media measures the result. |
| `tell/centred-stack` | warning | When every text is centred in the middle of the frame, each scene is a title slide. | Set type on the system's grid: an edge, a column, a size that fills the frame. Centre one thing a film, if any. |
| `scene/case-collision` | error | Two film files whose names differ only by case are one file on a disk that ignores case (macOS by default): TypeScript fails with TS1261 or imports the wrong one. | Rename one: name the composition after the scene with .film.tsx (halving.ts and halving.film.tsx). |

## In an untell scene

A file is a scene when it exports `scene` and `system`. Give `--scope scene` or `--scope any` to choose for every file.

| Rule | Level | Why it is a tell | Fix |
| --- | --- | --- | --- |
| `scene/raw-colour` | error | A scene names colour roles. A colour value breaks the system's palette and its contrast checks. | Use a role: ground, surface, rule, ink, inkMuted, accent, accent2, accent3, accentText, onAccent, series1-5, positive, negative. |
| `scene/raw-type` | error | A scene names type roles. A font, size or weight breaks the system's scale. | Use a role: display, headline, body, label or caption. |
| `scene/raw-motion` | error | A scene takes durations and curves from the system. A literal curve or library easing breaks its motion. | Use go(), appear(), lines() and ctx.dur; pass a curve name (enter, move, exit). |
| `scene/effect` | error | The renderers support no gradient, glow, blur or shadow, on purpose. | Remove it. Use layout, a picture or motion. |
| `scene/magic-position` | warning | A literal x or y works at one frame size and one system only, and often lands outside the safe area. | Place from ctx.safe, ctx.width and ctx.height, and measure text with ctx.measure. |
| `scene/unsafe-text` | warning | Text placed from the frame edge (x: 0, y: 0) sits under the platform's own UI at 9:16. | Start text at ctx.safe.left and ctx.safe.top. |
| `scene/duplicate-id` | error | Two blocks with one id overwrite each other's nodes in both renderers. | Give every block call its own id. |
| `scene/no-hook` | warning | A film whose first block starts after 0.5 s opens on an empty frame, and a viewer leaves in the first second. | Start the first block at 0, so it shows from frame 0, and put the subject in the first second. |
| `scene/patched-block` | warning | A scene that patches a block's nodes (a .map over its output, a block's internals imported) breaks the block's rules: most one-frame accidents in the reels came from these patches. | Use the block's props. If a prop is missing, name the block and the prop in a comment and ask for it; read the system's block map in SYSTEM.md first. |
| `scene/hand-built` | warning | A scene with 6 or more raw rect, path or text nodes rebuilds what blocks draw, and hand-built geometry is where the errors are (a chain through its ring, panes 6 px apart). | Use the blocks in the system's block map. If none fits, name the block you tried and the prop it lacks in a comment. |
| `scene/raw-node-why` | warning | A raw rect, path, text or circle node is geometry the kit does not check. Hard rule 14 asks for a comment that names the block tried and the prop it lacks, so the gap in the blocks is known and can be closed. | Use a block from the system's block map. If none fits, write a comment above the node (within 15 lines): `// Tried <block>: it has no <prop> for <what>.` |
| `scene/music-entry` | warning | A music bed entered at a typed number (from: 12.4) was placed by guess: the drop and the bars land where they land. | Use peakAt (the film time of the reveal) or align, and read the track with untell listen first. |
| `scene/fixed-volume` | warning | A typed music volume skips the level the block computes from the track and the system's mix target, so the mix drifts from film to film. | Leave volume out. The block sets it; untell master brings the final mix to the target. |
| `scene/typed-times` | warning | A film with music whose times are typed numbers is cut by guess: cuts and entrances miss the beat by a few frames, and that reads as an error. | Build the times from beats() (scene/beats) after you place the music, and land each cut and entrance on a beat or a bar. |
| `scene/typed-hit` | warning | An effect placed at a typed time drifts from its picture when the scene's times change, and a sound off its cause reads as a mistake. | Use hit({ on: { nodes, id } }) so the sound lands when that node has arrived, or pass the time of the event from the beat grid. |
| `scene/silent` | error | `export const silent` states that the film has no sound on purpose. A statement with no reason, or one beside a sound block, says two things at once. | Give the reason in the string (export const silent = "the brief forbids sound";), or remove the statement when the film plays sound. |
| `scene/real-name` | warning | A real brand or a stock cast name that the film invents or borrows is a liability and a tell. | Use a fictional name drawn at random for this film. When the user's own brief names this brand (their product), it is the subject: declare it with that reason. |
