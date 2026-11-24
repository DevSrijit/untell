# Changelog

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
