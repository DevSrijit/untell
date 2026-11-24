<!-- The template of README.md. build.ts replaces each {{key}} with its value from `untell --version --json`, then
writes README.md and the npm page. Edit this file, not README.md. -->
<h1 align="center">untell</h1>

<p align="center"><strong>The video framework for coding agents.</strong></p>

<p align="center">Design systems, blocks, and eyes that check every frame and every beat.<br>Runs on Remotion and HyperFrames.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/untell"><img alt="npm" src="https://img.shields.io/npm/v/untell?color=111&label=npm"></a>
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/badge/licence-MIT-111"></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/sheet-reel-dark.jpg">
  <img alt="An 11 second film on one review sheet: frames every half second, the motion line, the sound and a mark on each cut" src="docs/assets/sheet-reel-light.jpg" width="880">
</picture>

untell records every frame of a film and reads it as one image: motion, sound, cuts, and each fault at its time.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/reels-dark.png">
  <img alt="One frame from each of eight example films, each in its own design system" src="docs/assets/reels-light.png" width="880">
</picture>

## Install

In a Remotion or HyperFrames project:

```bash
npm i -D untell
npx untell init --agent claude
npx untell check
```

In an empty folder, run `init --new` first. It writes the project and its `package.json` in this folder:

```bash
npx untell init --new remotion --agent claude
npm i -D untell
npx untell check
```

Do not run `npm i` in a folder with no `package.json`: npm then installs into the first parent folder that has one.
Use `--new hyperframes` for a HyperFrames project. For Codex, use `--agent codex`; for both, `--agent both`.
`init` copies the kit and writes the agent skill. `check` checks the example film. Then ask the agent for a film:
the skill tells it to lint after each edit, check, render, and read the review sheet before it says done.

## It names each fault

<img alt="The terminal output of untell check on a draft film: a failed verdict, then the causes in order, each with its time and its fix" src="docs/assets/check.png" width="880">

`untell check` groups the findings by cause, with the time, the node, the measured value, the limit and the fix.

## It measures alignment in pixels

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/align-dark.png">
  <img alt="A product card before, the overlay of its grid with two misses in px, the card after, and a 4x crop before and after" src="docs/assets/align-light.png" width="880">
</picture>

`untell snap` finds each near miss against the scene's guides. Preview the moves, then apply the ones you accept.

## It hears the music

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/sound-dark.png">
  <img alt="Five frames of a short type film; its track drawn by untell listen with sections and drops; the film's motion and sound with a cut on the drop" src="docs/assets/sound-light.png" width="880">
</picture>

`untell listen` finds the tempo, the sections and the drops. `music({ peakAt })` puts a drop on a cut.

## {{systems}} design systems

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/systems-dark.png">
  <img alt="One scene drawn in each of the design systems, ten light and ten dark" src="docs/assets/systems-light.png" width="880">
</picture>

One scene in each system. A system sets every colour, font, size, curve and duration.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/charts-dark.png">
  <img alt="One bar chart in six systems, each drawn in its own hand" src="docs/assets/charts-light.png" width="880">
</picture>

One chart block in six systems. Each system draws it in its own hand.

## Use it your way

Take as much of untell as you need. Each level works without the next.

1. **Eyes only.** Check any film, made with any tool: `npx untell check film.mp4 --sheet`. It runs each rule that
   reads only the file (stalls, flashes, stray frames, empty space, the level, true peak and silence of the sound),
   lists the rules that need a scene, and draws the review sheet. `untell sheet`, `untell listen` and
   `untell master` also take any video file.
2. **Your own block.** Write a block in your project with the kit's contract: a pure function that returns nodes
   in roles, not values. `untell check` holds it to the same rules as a kit block. [Blocks](docs/guide/blocks.md)
3. **Your own system.** `npx untell system new harbour --from riso` copies a system into your project to edit.
   `npx untell system check harbour` checks its values, its contrast, its fonts and a film in it.
4. **Our systems.** Pick one of the {{systems}} and build with the blocks. The checks then know every limit of the system.


## What you get

- **The kit**, copied into your project: the scene core, {{blocks}} blocks (charts, diagrams, code, terminals,
  kinetic type, photos, 3D products) and the [{{systems}} systems](systems/README.md). You own the code.
- **The checks**: `untell lint` with {{lintRules}} rules on source, `untell check` with {{detectorRules}} rules on
  every frame and the sound, `untell snap` for alignment, and the review sheet. [The checks](docs/guide/check.md)
- **Sound**: `untell listen`, and `untell render` and `untell master` for the final mix. [Sound](docs/guide/sound.md)
- **Media you bring**: photos, cut-outs, footage, tracks, effects and 3D models. [Media](docs/guide/media.md)
- **Agent files** for Claude Code and Codex, and a lint hook after each edit. [Agents](docs/guide/agents.md)

## Commands

| Command | What it does |
| --- | --- |
| `untell init` | Copy the kit, the example film and the agent skill into this project |
| `untell lint` | Find the tells in film source code, before any render |
| `untell check` | Record the film and run every check; `--sheet` adds the review sheet; a video alone gets the rules that read the file |
| `untell render` | Render the final file in either framework and master it |
| `untell snap` | Show each alignment miss as a hunk, preview it, apply the hunks you accept |
| `untell sheet` | A whole film in one image |
| `untell listen` | What a track or a mix sounds like, as data |
| `untell master` | Bring the mix to the system's loudness target |
| `untell media` | Bring in photos, footage, music, effects and 3D models |
| `untell build` | HyperFrames: bundle a scene into the film page |
| `untell system` | Copy a system into your project to edit (`new`), and check it (`check`) |
| `untell systems`, `doctor`, `hooks`, `cache` | List the systems, check the setup, turn the hook on, manage the cache |

All options, exit codes and JSON outputs: [Commands](docs/guide/commands.md).

## Requirements

Node 20 or later, Google Chrome and ffmpeg. The checks need Python 3.10 or later; `untell listen` and `untell media` need
[uv](https://docs.astral.sh/uv/). Nothing heavy installs with `init`: `untell check` adds numpy, Pillow and scipy when
your Python lacks them, `untell listen setup` adds its tools, and `untell media setup` adds the cut-out tools.
`untell doctor` shows what is missing. [Install](docs/guide/install.md)

## Known limits in 0.1.0

- untell checks only what it can measure. A film that passes can still be dull: read the review sheet.
- The checks do not compare a product from shot to shot. They do not judge whether a picture suits the film.
- At 9:16, some systems (Console, Graphite, Manual) can leave the lower part of the frame quiet. Fill it with a
  picture, not with a plain block.
- The sound checks measure level, beats and drops. No person or model hears the music: listen to the final file.
- The example reels are source to read. Their media files do not ship, so they do not render as they are.
- Photo cut-outs and the character tags of music need optional local tools. `untell doctor` names them.
- untell is tested on macOS with Chrome, with Remotion 4 and HyperFrames. Other platforms are not tested yet.

## Licence

MIT. untell ships no media. Each file you bring keeps its own licence. The fonts in the kit are under the SIL Open
Font License; their licence files ship with them.

The two frameworks have their own licences, and untell ships neither of them. Remotion is free for individuals and
for companies of up to 3 people; a larger company needs a Remotion company licence. HyperFrames is under
Apache-2.0. Read the terms of the framework that you use.

Every picture on this page is output of untell's own tools, run on real films. `bun packages/untell/scripts/readme/build.ts` makes them again.
