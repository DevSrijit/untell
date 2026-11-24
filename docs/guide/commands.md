# Commands

Run `untell` for a short list. Run `untell <command> --help` for the options of one command. Every command takes
`--cwd <dir>` to run in another project folder.

| Command | What it does |
| --- | --- |
| `untell init [--new remotion\|hyperframes]` | Copies the kit, adds the packages, writes the example film, the agent skill and the `AGENTS.md` section. `--new` makes a minimal project in an empty folder first. |
| `untell lint [paths]` | Finds the tells in film source code. No path: the films folder. `--rules`, `--explain <rule>`. |
| `untell build <scene.ts>` | HyperFrames: bundles a scene, copies fonts and grain, writes `index.html`. |
| `untell check [--sheet [render]] [--full]` | Lint, (HyperFrames) `hyperframes check`, the recorder and the detector. A render adds the sound checks. `--sheet` adds the review sheet. `--rules`, `--explain <id>`. |
| `untell check <video> [--system <id>] [--sheet]` | A video alone (any film, from any tool): the rules that read only the file, and the list of the rules it did not run, with the reason. It applies with no project, with no scene module, or with `--no-scene`. |
| `untell render <film>` | Renders the final file in either framework, masters it, and prints its size, loudness and true peak. |
| `untell snap [scene] [--preview <ids>] [--apply <ids>]` | Alignment near misses as hunks; a preview before and after; the accepted hunks written into the scene. |
| `untell snap <scene> --at <s>` | One frame at full size: it writes the frame as a PNG (`.untell/snap/<film>/before.png`) and prints its path, with any alignment hunks at that time. |
| `untell sheet <video>` | The review sheet: a whole film in one image, and its numbers in JSON. |
| `untell media setup` | Sets up the cut-out tools: uv, rembg and its model (about 300 MB). |
| `untell media add <file> --as <name>` | Copies a photo, a clip, a track, an effect or a 3D model into the project. It measures a sound at once and maps a track. |
| `untell media prepare <name> --system <id>` | Cuts out and cleans the subject of a photo and grades photos and footage for the system. `--keep-holes` keeps enclosed gaps. |
| `untell media beats <name>` | Prints a track's tempo, the energy of each bar and entry points. |
| `untell media measure`, `remove`, `list`, `table`, `formats` | Measures a sound again, deletes an asset, lists the assets, writes the media table again, prints the formats. |
| `untell listen setup\|analyse\|fx\|mix\|compare` | What a track, an effect or a final mix sounds like, as data. `analyse` writes the music map. |
| `untell master <render> [--system <id>]` | Brings the mix to the system's loudness target and limits the true peak. With no system and no `--lufs`: -16 LUFS. |
| `untell systems` | Lists the 20 systems with mode, use and personality, and the systems of your own. |
| `untell system new <name> --from <id>` | Copies a system into your project (`systems/<name>/system.ts`) to edit. Every command then takes the id. |
| `untell system check [<name>]` | Checks a system of your own: its values, direction, contrast, fonts, and the example film in it, which must pass the frame rules (type size, contrast, the safe areas, collisions, cut text) on its own. Each problem names the field and the fix. |
| `untell doctor` | Shows what is installed and what is missing, with the fix for each. |
| `untell hooks on\|off\|status` | Turns the lint-after-edit hook on or off for Claude Code and Codex. |
| `untell cache status\|clear` | The size of the recording cache, or empty it. |

## untell render

`render` makes the final file in one command and prints one line for each stage with its time.

- Remotion, a film with no footage and no sound: the frames of the check's own recording, encoded as Remotion
  encodes them (libx264, CRF 18). Any other film: `remotion render`, from an entry that untell writes in
  `.untell/render/<film>/`, so the film needs no entry in your Root.
- HyperFrames: `untell build` when the page is not built from the film, then `hyperframes render`.
- Then a picture over 12 Mbit/s is encoded again as H.264, and `untell master` brings the sound to the system's
  target (`<out>.mastered.mp4`). `--no-master` stops after the render.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done. Nothing to fix. |
| 1 | The command ran and found a problem (lint errors, a failed check, a missing tool in `doctor`), or it failed. |
| 2 | Wrong use (a missing argument, a bad flag value), or a tool that the command needs is not installed. |

`untell lint --hook` is the one exception: there, 2 means findings for the agent.

## Output for agents

These outputs are stable. Agents of both harnesses parse them. A change to a shape gets a new `version`.

- `untell lint --json`: `{ files, errors, warnings, results: [{ file, findings: [{ rule, severity, line, col, text, message, fix }] }] }`.
- `untell check` writes `.untell/check/report.json`, and `--json` prints it: `{ version: 1, project, framework, ok,
  errors, warnings, steps, findings: [{ check, severity, message, fix?, file?, line?, from?, to?, node?, measured?,
  limit? }], film, skipped, sheet }`. `from` and `to` are seconds in the film. `severity` is `error`, `warning` or
  `advice`. Only an error fails the check.
- `untell check <video> --json` (a video alone) prints the same shape, with `framework: "none"`, `film.scene: null`,
  and a reason for each rule in `skipped`. It writes `.untell/eyes/<file name>/report.json`.
- `untell system check --json`: `{ version: 1, ok, systems: [{ name, from, problems: [{ severity, field, problem,
  fix }], film: { mine, theirs, added } | null }] }`.
- `untell render --json`: `{ version: 1, film, framework, route, render, final, stages, bytes, seconds, mbitPerSecond, lufs, truePeak, master, ok }`.
- `untell listen analyse --json`: `{ version: 1, items: [{ name, asset, listen, md, png, music, bpm, confidence, sections, drops, lufs, truePeak, duration }] }`.
- `untell master --json`: `{ version: 1, render, system, out, ok, done, note?, before, after, gain, limited }`.
- `untell sheet --json`: `{ version: 1, sheet, json }`. The sheet's JSON: `{ video, seconds, fps, size, cuts, stalls,
  loudnessPerSecondDb, beats, onsets, sheet, findingsOnTimeline, findingsListed }`.
- `untell snap --json`: `{ version: 1, film, scene, at, frame, tol, proposals, issues }`; with `--preview` also the files.
- `untell cache status --json`: `{ version: 1, dir, bytes, entries, kinds, slots }`.
- `untell doctor --json`: `{ version: 1, ok, items: [{ name, status, detail, fix? }] }`.

## Limits of this version

- The recorder does not play sound. The sound checks need a render (`--sheet <render>` or `--render <render>`), or
  `--full` for the checks on a mix of the scene's sound.
- A Remotion film is recorded from a private page built from its scene module, not from Remotion itself. A component
  that is not a scene module (plain React) gets the lint and the sheet of its render only.
- The lint reads source text. It cannot see what only shows in a render: use the review sheet for that.
- The cover check needs Python 3 with numpy and Pillow, but only when a cut-out shows in the film.
