# Changelog

## 0.1.1

### Commands

- `untell see <video>` gives a model any video file. It writes `see.json`: one versioned document, sized for a
  context window (6000 tokens by default, `--budget` sets it). It holds the file's facts, every cut with its
  strength, each shot with its motion, palette, brightness and ink grid, the pace, the colour, where text shows
  (and its words when tesseract is on the PATH), the sound, and the findings of the rules that need only the file.
  It also writes contact sheets in pages of 8 to 12 frames, each frame with its time. A measure that cannot be made
  is `null`, with the reason. To fit the budget, it drops detail in a fixed order and lists what it dropped.
- The measures are one module (`src/measures.ts`), which takes a file path and returns typed data.
- `see.json` is at version 2. A shot also ends at a soft change that replaces the picture (a fade, a wipe or a large
  move with no hard cut), and each shot says how it starts. Each stall says what the stall rule makes of it, and the
  findings give the limits they used. When there are more than 64 onsets, the onset times are spread over the whole
  film. A shot where OCR read nothing has `"words": null` with the reason. The key says that the words are OCR and
  noisy, and the level curve says what it measures.

### Fixes

- `untell check <video>` and `untell sheet` read a rotated phone clip at the size it shows at. Before, they read the
  coded size, so the frames were squashed.
- `untell check <video>` prints a file outside the folder by its full path, not as `../../..`.
- The flash check reads the sRGB curve of each 8-bit level from a table. On a 3-minute file at 1080p, the file rules
  take about 50 s, not about 88 s. The findings are the same.
- `untell check <video>` reads a file larger than 1920 px on its long side at a 1920 px copy. The file rules measure
  shares of the frame. A 4K minute took about 210 s and 6 GB of memory, and now takes about 26 s and 3 GB. On 4K
  footage at the edge of stillness, a stall can start or end a few frames apart from before.
- A product shot that holds its pose stands with the drawn model on the centre of its room. Before, the block centred
  the model's box, so a turned model stood off the centre (36 px in the Keynote example).
- The end cards of the Keynote, Matte and Studio examples stand on the centre of the frame.
- `barChart` keeps a key value out of a bar that is thinner than the value's line. Before, a large value in a thin bar
  went past the bar's edges.
- The README states the licences of Remotion and HyperFrames.

## 0.1.0

The first release.

### Commands

- `untell init` copies the kit, an example film and the agent skill into a Remotion or HyperFrames project. It writes the untell section of `AGENTS.md`, and of `CLAUDE.md` when the project has one. `untell init --new remotion|hyperframes` makes a minimal project in an empty folder first. The example film passes its first `untell check` with no finding.
- `untell lint` finds the tells of AI-made video in film source code, before any render.
- `untell check` records the film and runs the detector on every frame: the opening, stalls, empty bands, collisions, type size, density, reading time, contrast, alignment, the end, motion, accessibility and, when the film has sound, the mix. The verdict is the first line, and the causes come under it. A warning that the film prints while it loads, such as a low-trust beat grid, shows one time, under the verdict. A scene can declare a finding that it means with `// untell-ignore <rule> [node]: <reason>`.
- `untell render` renders the final file in both frameworks, masters its sound to the system's target, keeps its bitrate at a size a phone feed takes, and prints its size, loudness and true peak.
- `untell snap` shows each alignment near miss as a hunk, previews the fix and applies the hunks that you accept.
- `untell sheet`, `untell master`, `untell listen`, `untell media`, `untell systems`, `untell doctor`, `untell hooks` and `untell cache`.
- `untell check <video>` reads any video file with no scene: it runs each rule that needs only the file and lists the rules that need a scene or a system. `untell sheet`, `untell listen` and `untell master` also work on any file, with no project.
- `untell system new <name> --from <id>` copies a design system into the project to edit, and every command takes its id. `untell system check` checks its values, direction, contrast, fonts and the example film in it. The film must pass the frame rules (type size, contrast, the safe areas, collisions, cut text) on its own.

### The kit

- 20 design systems, each with its tokens, its fonts, its direction and its block map.
- The scene model and its blocks, with one renderer for Remotion and one for HyperFrames that draw a scene the same way.
- The playbooks: shape, craft, the craft floor, critique, polish, the checks, alignment and listening.
- `BLOCK.md`: the contract of a block of your own, with a worked example.
- The agent skill has two levels. A draft is the default: a first film with one render and no polish. A finish is
  for a film to publish: the four playbooks, with at most three polish moves.
- A mark of your own: `untell media add <file>.svg` takes an SVG mark, and the `drawnMark` block draws it by stroke.
- `quote` sets one word apart with `emphasis`. Where the statement's face has a true italic, the word is set in it:
  the kit ships 24 italic faces, as local files. Where the face has none, the word takes the system's accent text
  colour. No face is slanted by the browser. Each system's `SYSTEM.md` says which of its faces have an italic.
- A scene states that it has no sound with `export const silent = "<reason>"`.
- `landOn` lands the entrance of a block on a beat.
- The kit's fonts are files in the project. A check needs no network: `UNTELL_OFFLINE=1` blocks every request to
  another host, and the check still passes. A render needs no network either, once the framework's own browser is
  installed (`npx remotion browser ensure` or `npx hyperframes browser ensure`).

### Requirements

- Node 20 or later, Google Chrome and ffmpeg.
- Python 3.10 or later for the detector. `untell check` stops with a clear message on an older one. The first `untell check` installs numpy, Pillow and scipy into `.venv-media`.
