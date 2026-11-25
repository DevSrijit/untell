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
| `untell see <video> [--json] [--budget <tokens>]` | Gives a model any video file: one JSON document sized for a context window, and contact sheets in pages. |
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

## untell see

Give a model a video. A model cannot watch a film. `untell see` reads any video file and writes what a model can
read: one JSON document that fits a context window, and contact sheets that show the film page by page. It needs no
project, no scene and no system. It assumes no frame shape, no length and no sound.

```bash
npx untell see clip.mp4                 # .untell/see/clip/see.json and sheet-1.jpg, sheet-2.jpg, ...
npx untell see clip.mp4 --json          # see.json alone on stdout
npx untell see clip.mp4 --budget 3000   # a smaller see.json: detail goes first, in a fixed order
```

The first lines a model reads, from a 40 s film at 1920 × 1080:

```text
untell see  film.mp4
file      40.6 s · 1920 × 1080 (16:9) · 30 fps · h264 · 1.3 Mbit/s
sound     aac · -16 LUFS · true peak -1.1 dBTP · range 4 LU · 90 onsets · tempo not measured
pace      34 shots (1 after a soft change) · mean 1.2 s · shortest 0.43 s · still 15 % of the time (3 stalls over 1 s)
opens     with ink on 35 % of the frame · first change at 0.033 s · low motion in the first second · text-size detail
colour    #0E0E0F 43 %, #F8F8F8 25 %, #E6E5D7 14 %, #252455 14 % · brightness 0.43 · mixed: light on dark 64 % of the time
text      text-size detail 99 % of the time, in 34 shots · words read by tesseract

timeline
     0.0-2.7          still  dark  #1E1A59  "AY Sur"
     2.7-5.5    fade  low    dark  #211D5D  "Key Features Al ed Fully Secure text that fades in Built wor..."
     5.5-6.0          still  dark  #070707  "SAME AGENT."
     6.0-6.5          still  light #F5F5F7  "Same agent."
     6.5-6.9          low    dark  #0E0E0E  "Same agent."
     6.9-7.4          low    light #EAE9E5  "same agent."
     7.4-7.8          high   dark  #0D0D0D  "05/20 COURTSIDE SAME SCRIPT."
  ...

findings  1 error, 2 warnings from 9 rules that need only the file: stall 20.3-22.1 s; dead-space 20.3-22.1 s; dead-space 31.4-35.1 s
          untell check film.mp4 prints each fix
pictures  4 pages, each frame with its time; open them as images, in order:
          .untell/see/film/sheet-1.jpg  0.0-11.0 s, 11 frames
          .untell/see/film/sheet-2.jpg  11.0-22.0 s, 11 frames
          .untell/see/film/sheet-3.jpg  22.0-33.0 s, 11 frames
          .untell/see/film/sheet-4.jpg  33.0-40.6 s, 8 frames
json      .untell/see/film/see.json  about 5639 tokens of 6000 (fits)
```

`see.json` (`"version": 2`) holds:

| Key | What it holds |
| --- | --- |
| `file` | Length, frame size and aspect (after rotation), frame rate, codecs, bitrate, and whether it has sound. |
| `timeline` | Each hard cut with its time and strength. Each soft change (a fade, a wipe, or a move with no hard cut) with its kind and strength. Each shot with how it starts (`by`), its motion, palette, brightness, ink grid, and the zones and words of its text. |
| `pace` | The number of shots, the mean, shortest and longest shot, cuts a minute, the stalls, and the first second. Each stall says what the stall rule makes of it: a fault, under the limit, or the end hold. |
| `colour` | The film's palette with shares, brightness, contrast, light on dark or dark on light, and the ink grid. |
| `text` | Where detail of text size shows, and what is and is not measured. With tesseract on the PATH, the words of each shot. |
| `sound` | Integrated loudness, true peak, loudness range, a level curve, onsets, silent spans, the tempo with its trust, and how the cuts sit on the onsets. `null` for a file with no sound. |
| `findings` | The findings of the rules that need only the file, with the ids of `untell check <video>`, and the limits they used. |
| `pictures` | Each page of the contact sheet and the time it covers. |
| `notes` | What was dropped to fit the budget, and what was not measured. |
| `why` | The reason for each measure that is `null`. |

A shot ends at a hard cut, or at a soft change that replaces the picture: a cross-fade from one slide to the next is
two shots. A word that fades in over the same picture is not a new shot. The words come from OCR on one frame of each
shot, so they are noisy; a shot where OCR read nothing has `"words": null` and a `why`.

Version 2 changed the meaning of three fields of version 1: `timeline.shots` and the shot counts and lengths of
`pace` (a shot also ends at a soft change), `pace.stalls` (each stall is an object with the stall rule's verdict), and
`sound.onsets.times` (when there are more than 64 onsets, one in every n, spread over the whole film; before, the
first 64).

The `key` in the file says how to read the grids and the levels. A model reads the summary, then `see.json`, then
opens the pages as images in order. Each page holds 8 to 12 frames, each with its time, and it is about 1500 px on
its long side. Under each row are the motion, the sound and the findings.

The budget: untell estimates the tokens of `see.json` as its characters divided by 3, rounded up. It is an estimate:
a tokenizer counts hex colours and digit grids its own way. When the document is over the budget (6000 by default,
1000 at least), untell drops detail in this order until it fits:

1. the onset times (the count stays)
2. the text zones of each shot
3. the palette of each shot after its first colour
4. the ink grid of each shot
5. a coarser level curve (two times at most)
6. the measured values and limits of each finding
7. the palette of each shot
8. the words of each shot after 60 characters
9. the shots as objects: each shot becomes a row
10. the strength of each cut
11. the words of each shot
12. the shots, merged into 40 windows of equal time
13. the time of each cut (the count stays)
14. each finding (the causes stay)
15. the count of the rules that did not run
16. the fix of each cause
17. the time of each stall (the count stays)
18. the words on how the text is measured
19. the windows, merged into 12
20. the notes on what is not measured

`notes.dropped` lists each step that it took. When the smallest form is still over the budget, the list takes its
short form and `notes.budget` gives the size of the smallest form.

The tempo needs the listen tools (`untell listen setup`). Without them it is `null`, and `why` says so. untell see
does not install them.


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
- `untell see --json`: `see.json`: `{ version: 2, made, about, key, file, timeline, pace, colour, text, sound,
  findings, pictures, notes, why?, budget }`. It writes the same file to `.untell/see/<file name>/see.json`.
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
