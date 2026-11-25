// The help texts: `untell` with no command, and `untell <command> --help`.
import { LISTEN_HELP as LISTEN_HELP_TEXT } from "./listen";
// The commands are in the order a person uses them: set up, write, check, look, then the tools.

export const EXIT_CODES = `Exit codes:
  0  done; nothing to fix
  1  the command ran and found a problem (lint errors, a failed check, doctor found a missing tool), or it failed
  2  wrong use (a missing argument, a bad flag value), or a tool it needs is not installed
  untell lint --hook only: 2 means findings for the agent (Claude Code and Codex show stderr to it)`;

export const HELP = `untell: design systems, blocks and checks for AI-made video (Remotion and HyperFrames)

Usage: untell <command> [options]

  init        Copy the kit, the example film and the agent skill into this project
  lint        Find the tells in film source code, before any render
  build       HyperFrames: bundle a scene into the film page
  check       Lint, record the film and run the detector on every frame; --sheet adds the review sheet
  render      Render the final file (both frameworks), master it, and print its size, loudness and true peak
  snap        Show each alignment near miss as a hunk, preview the fix, apply the hunks you accept
  sheet       A whole film in one image, for a model to read
  see         Give a model any video file: its measures as one JSON sized for a context window, and contact sheets
  media       Bring in photos, footage, music, effects and 3D models; cut out, grade, read beats
  listen      What a track or a mix sounds like, as data: beats, sections, the drop, loudness
  master      Bring a render's mix to its system's loudness target and limit its true peak
  systems     List the 20 design systems, and yours
  system      Make a design system of your own from a built-in one, and check it
  doctor      Show what is installed and what is missing, with the fix for each
  hooks       Turn on or off the lint-after-edit hook for Claude Code and Codex
  cache       Show the size of the cache, or clear it
  hf          Run the project's HyperFrames CLI with its usage reports off (untell hf check: what npm run check runs)

Options for every command: --cwd <dir> (run in another project folder), --help.
untell <command> --help shows the options of one command. untell --version shows the version.

Start here, in a Remotion or HyperFrames project (in an empty folder: untell init --new remotion|hyperframes):
  npx untell init                                 copy the kit and write the example film
  npx untell check                                record the example film and run every check on it
  npx untell render <films folder>/untell-example.ts   render the final file and master it

${EXIT_CODES}`;

export const SNAP_HELP = `untell snap [film] [--at <s>] [--preview <ids|all>] [--apply <ids|all>] [--unapply <ids|all>] [--scene <file>] [--all] [--json]
<ids> is one id or several, with commas or spaces between them: --preview c-2hite,h-697pn or --preview c-2hite h-697pn

Alignment as a diff. snap reads the film at one moment of rest, finds the lines a designer sees (edges, centres,
baselines) and lists each near miss that a move can fix as a hunk: the node, the feature, from and to in px, the
line it joins, why, and the confidence. Nothing moves until you apply a hunk.

  film               the scene module (default: the film of the last untell check, else the one you changed last)
  --at <s>           the time to read (default: the frame where the most elements show and rest)
  --preview <ids>    draw the frame before and after the moves: .untell/snap/<film>/preview-1.png (before | after),
                     preview-2.png (the overlay, each hunk id in the margin) and preview-3.png on (zoomed crops).
                     Open the images and look at them before you apply.
  --apply <ids>      write the hunks into the scene module as a snap table (SNAPS and withSnap from the kit's
                     scene/align). Each entry is a relation to another node, so it holds when the content changes.
  --unapply <ids>    remove hunks from the table (all removes the table)
  --scene <file>     the file to write the table in, when it is not the film's own module
  --all              also list the issues that have no proposal (advice, ignored)
  --json             { version: 1, film, scene, at, frame, source, tol, proposals, issues } (with --preview: the files too)

To look at one frame at full size: untell snap <film> --at <s>. It writes the frame as a PNG
(.untell/snap/<film>/before.png) and prints its path, with any hunks at that time. --preview all with no hunk
prints the same path and exits 0.

snap reads the frame from the last untell check when the scene did not change after it (the ids that the check's
findings name are then the ids that snap lists), else from its own capture. It prints which one it read.

The loop: untell check reports an align/* finding with a snap id. Preview that id, open the image, and apply the
hunks that are right. Never apply a hunk that you did not preview. Then run untell check again.

Example: untell snap films/untell-example.ts --at 2.50 --preview c-2hite,h-697pn
Exit: 0 no proposal (or the preview or apply is done), 1 proposals to look at, 2 wrong use.`;

const H: Record<string, string> = {
  system: `untell system new <name> --from <id> [--force]
untell system check [<name>] [--no-film] [--json]

A design system of your own. It lives in one file that you edit, beside the films folder:
systems/<name>/system.ts (Remotion: src/systems/<name>/system.ts). It holds the system's values (colours in
OKLCH, fonts, the five type roles, margin and grid, motion curves and frames, texture, density), its direction
(the hook, empty space, the longest still, the end, the mix, the moves) and its media (grade, pictures, sound).
A film uses it with export const system = "<name>"; every command takes the id, as it takes a built-in one.

  new <name> --from <id>   copy a built-in system (or one of yours) under a new name. It writes the source file,
                           the kit's list of your systems (<kit>/own.gen.ts) and the system's docs, which the tools
                           read (<kit>/docs/systems/<name>/: tokens.json, tokens.css, fonts.json, SYSTEM.md).
                           A name is 2 to 32 lower-case letters, digits and hyphens, and not a built-in id.
  --force                  copy over a system of that name that is already here
  check [<name>]           check one of your systems (default: each of them). It writes its docs again, then checks:
                             values     every field the kit reads, with its type and range
                             direction  the fields the checks read (hook, space, maxStill, ends, mix, moves)
                             contrast   ink, inkMuted, accentText, positive and negative on the ground and a
                                        surface, and onAccent on the accent: 4.5:1 or more (more with grain)
                             fonts      each family and weight: a file <family>-latin-<weight>-normal.woff2
                                        (WOFF2) in <kit>/fonts; Remotion also needs the family's loader, with that
                                        weight, in <kit>/fonts.gen.ts
                             film       the example film in your system: untell check with the frame rules only
                                        (the rules that read a system's values: type size, contrast, the safe areas,
                                        collisions, cut text); an error fails it. When the film also has errors in
                                        the system it came from, only an error that system does not have fails it
                           Each problem names the field in the source file and the fix.
  --no-film                skip the film (the fastest pass)
  --json                   { version: 1, ok, systems: [{ name, from, problems: [{ severity, field, problem, fix }], film }] }

After an edit of the source file, any command that reads a system (check, render, build, master, listen, media)
writes the docs again first. untell init --force keeps your systems: they live outside the kit folder.

Examples:
  untell system new harbour --from riso
  untell system check harbour

Exit: 0 passed, 1 a problem, 2 wrong use.`,
  init: `untell init [--new remotion|hyperframes] [--framework remotion|hyperframes] [--agent claude|codex|both] [--force] [--no-install] [--no-build]

Copies the kit into this project, adds the packages it needs, writes the example film, the agent skill and
the untell section of AGENTS.md (and of CLAUDE.md when the project has one). It says the size of what it
installed. It does not install the media tools: each command that needs one says so first.

  --new         in an empty folder (or one with only untell's package files): make a minimal Remotion or
                HyperFrames project here first, with the framework's packages at a fixed version, then init it.
                It runs npm install (a few hundred MB for Remotion, less for HyperFrames).
  --framework   remotion or hyperframes, when the project has both
  --agent       which agent harness gets the skill: claude (.claude/skills/untell/SKILL.md),
                codex (.agents/skills/untell/SKILL.md) or both. Default: the harness this project or this
                machine has; both when it is not clear. With the kit already here, --agent adds only the agent files.
  --force       copy the kit and the agent files again (overwrites your edits to them)
  --no-install  print the package command instead of running it
  --no-build    HyperFrames: do not build the example film into index.html
  --no-media    accepted for older scripts; init no longer sets up the media tools (untell media setup does)

Examples:
  npx untell init --agent both
  npx untell init --new hyperframes --agent codex`,

  lint: `untell lint [paths...] [--json] [--rules] [--explain <rule>] [--scope auto|any|scene] [--max-warnings <n>] [--docs]

Reads film source code (.ts .tsx .js .jsx .html .css) and finds the tells: what makes a video read as
AI-made, and what breaks the untell scene contract. It renders nothing, so it takes milliseconds.
With no path, it lints the films folder (src/films or films).

  --json            one JSON document on stdout:
                    { files, errors, warnings, results: [{ file, findings: [{ rule, severity, line, col, text, message, fix }] }] }
  --rules           list every rule
  --explain <rule>  one rule in full: why it is a tell and the fix
  --scope           auto (default: scene rules for files that export scene and system), any, or scene
  --max-warnings n  exit 1 when there are more than n warnings (an error always exits 1)
  --docs            print the rule catalog as Markdown (docs/TELLS.md in the package)
  --hook            the agent hook: reads the hook input on stdin, lints the edited film file (see untell hooks)

Silence one line: // untell-ignore <rule>: <reason>
Example: untell lint films/untell-example.ts
Exit: 0 no errors (and warnings within --max-warnings), 1 errors or too many warnings, 2 wrong use.`,

  build: `untell build <scene.ts>

HyperFrames: bundles the scene module and the kit into assets/vs-hyperframes.js, copies the system's fonts
and grain into assets/, and writes the film page index.html. A page that untell did not write is kept as
index.html.before-untell first. It prints the warnings of the blocks (a title that does not fit, a placeBehind
with no clean layout). untell render builds the page by itself; untell build is for a check without a render.

Example: untell build films/untell-example.ts`,

  check: `untell check [film] [--render <render>] [--sheet [render]] [--json] [--no-cache] [--hyperframes <path>] [--no-record] [--no-detect] [--demo]
untell check <video> [--system <id>] [--sheet] [--json] [--no-scene]
untell check --rules
untell check --explain <id>
untell check --not-measured

1. untell lint on the films folder.
2. HyperFrames: hyperframes check on the built page (index.html).
3. The recorder records every frame of the film (.untell/recordings/<film>/). In the same pass it captures the
   ink of every letter, every SVG shape and the scene's nodes. Remotion: the scene plays in Remotion's own Player
   (the film: the scene module you give, else the scene you changed last). HyperFrames: the built page.
4. The detector runs its checks on the recording: the opening, stalls, empty bands, collisions, text crossed
   by a line, edges, the size of the main line and of the subject, density and reading time, contrast over
   pictures, softness, repeats, accidents, spoilers, the end, motion craft, accessibility and the cover check.
   When the scene has sound, it mixes it from the audio nodes (ffmpeg) and runs the sound checks on the mix:
   beat sync, each effect over the bed and under the music's peak, the drop on the reveal. The level of an
   unmastered mix is advice (untell master sets it). A render (--render <render>) adds the checks on the real
   file: the cut on the beat, the drop on a change, the loudness target, the true peak, silence, the phone speaker.
5. With --sheet: the review sheet of the film with the findings on it: the render you give, else the recording.

The first line is the verdict: failed, passed with warnings, or passed. Under it come the causes (findings of one
rule that one change clears), every finding, the findings the scene declares intended, the steps of the check,
each check that did not run with the reason, and the count of what a check could not measure.
Declare a finding that you mean, with a reason, on the line before the block call that owns the node:
  // untell-ignore <rule> [node]: <reason>
It leaves the findings and never fails the check; the report lists it with its reason and its line.

It writes the report to .untell/check/report.json:
  { version: 1, project, framework, ok, errors, warnings, advice, steps: [{ name, ok, note? }],
    groups: [{ check, severity, cause, count, likelyGoneAfterFix, from, to, nodes, fix }],
    findings: [{ check, severity, message, fix?, file?, line?, from?, to?, node?, measured?, limit? }],
    declared: [{ check, from, to, node?, declared: { reason, where, scope } }], notes: [...],
    film: { id, scene, system, render, capture }, skipped: { <check>: <reason> }, sheet: { image, json, phone } | null }
  check is lint/<rule>, hyperframes, block/<block> (a block's warning while it drew), or a detector rule.

  film                the scene module to check (the same as --film <scene.ts>)
  --render <render>   the final render: the sound checks on the real file (untell render prints its path)
  --sheet [render]    write the review sheet; it prints "review sheet: <path>"
  --rules             list every detector rule
  --explain <id>      one rule in full: what it measures, where its limit comes from, the fix (lint/<rule> too)
  --not-measured      what the last check could not measure, each with its check and its reason
  --json              print the report on stdout (the progress goes to stderr)
  --theme dark|light  the review sheet's theme (default dark; UNTELL_THEME sets it too)
  --no-cache          record every frame again (the cache is in .untell/cache; untell cache clear clears it)
  --no-reuse          draw every frame, also one that the scene says is the same as the one before (for a proof)
  --hyperframes <p>   the hyperframes program (default: UNTELL_HYPERFRAMES, then node_modules/.bin/hyperframes,
                      then npx at the version the project's scripts name)
  --no-record         skip the recorder and the detector
  --no-detect         record, but run only the cover check (the fastest pass)
  --demo              a block demo or a read-through: the frame rules only (a scene that exports demo = true does the same)
  --full              accepted for older scripts: the sound checks now run whenever the scene has sound

The recorder takes a machine slot first (UNTELL_SLOTS sets how many recorders and renderers run at once on
this machine; the default is half the cores). An unchanged film comes from the recording cache in a second.

A video with no scene (any film, from any tool): untell check <video> reads the file alone when there is no
Remotion or HyperFrames project here, when the project has no scene module of untell, or with --no-scene. It reads
the frames and the file's own sound, and runs each rule that needs only the file: stalls, flashes, stray frames,
empty space, and the level, true peak, silence and phone loss of the sound. It lists each rule it did not run and
why: most need the scene (its nodes and the ink of each text); some need the scene's sound clips or a system.
  <video>             a video file: mp4, mov, webm, m4v or mkv. It is read at its own frame rate, at most 30 fps.
  --system <id>       take the limits of a system (the stall limit, the loudness target, the end) and run the
                      rules that need one. Without it, the defaults of the checks.
  --no-scene          read the video alone in a project that has scene modules
  It writes .untell/eyes/<file name>/report.json (the same shape, with film.scene null).

Examples:
  untell check films/untell-example.ts
  untell check films/untell-example.ts --render out/untell-example.mastered.mp4 --sheet
  untell check out/any-film.mp4 --sheet
  untell check --explain stall

Exit: 0 passed, 1 a finding or a failed step, 2 wrong use or only a missing tool.`,

  render: `untell render <film> [--out <file.mp4>] [--no-master] [--system <id>] [--keep-bitrate] [--via auto|framework] [--no-cache] [--hyperframes <path>] [--json]

The final file, in one command. It prints one line for each stage with its time, then the final file's size,
loudness and true peak.

  Remotion      A film with no footage and no sound: the check's own recording (the frames Remotion's Player
                drew for untell check), encoded as Remotion encodes (libx264, CRF 18). Any other film: what it
                runs is remotion render, from an entry that untell writes in .untell/render/<film>/ (the film
                needs no entry in your Root).
  HyperFrames   untell build when the page is not built from the film, then what it runs is hyperframes render.
  Then          a picture over 12 Mbit/s is encoded again as H.264 (CRF 20, at most 12 Mbit/s; the sound
                is copied), and untell master brings the sound to the system's target (<out>.mastered.mp4).

  film              the scene module (HyperFrames: default the scene the page was built from)
  --out <file>      the render (default out/<film>.mp4; the master goes beside it)
  --no-master       stop after the render
  --system <id>     the system for the master (default: the scene's own)
  --keep-bitrate    keep the render's picture as it is, at any bitrate
  --via framework   Remotion: let Remotion draw every frame, also for a film the recording could serve
  --no-cache        render again, also when the output cache holds this exact render
  --json            { version: 1, film, framework, route, render, final, stages, bytes, seconds, mbitPerSecond, lufs, truePeak, master, ok }

Next: untell check <film> --render <final file>.

Example: untell render films/untell-example.ts
Exit: 0 rendered (and on target), 1 the render failed or the master is off target, 2 wrong use or a missing tool.`,

  listen: LISTEN_HELP_TEXT,

  master: `untell master <render> [--system <id>] [--lufs <n>] [--peak <dBTP>] [--out <file>] [--json]

The last step of the mix. It measures the render (EBU R128), applies one gain to reach the system's loudness
target, and limits the true peak at 4x oversampling. It measures again and corrects the gain. The picture is
copied, not encoded again. It writes <render>.mastered.mp4 beside the render.
A system with no music by design, or a render with no sound, is left as it is.

  --system <id>   the system whose target to use (its tokens: direction.mix). Default: the system of the
                  last untell check; with none, -16 LUFS (any video file, with no project, takes this default).
  --lufs <n>      a loudness target instead of the system's, such as -14
  --peak <dBTP>   the true-peak limit (default -1)
  --out <file>    where to write the master
  --json          { version: 1, render, system, out, ok, done, note?, before, after, gain, limited }

When the limiter takes more than 4 dB, the mix is crushed: lower the bed or the hits in the scene, render
again, then master again.

Example: untell master out/heron-loop.mp4 --system riso
Exit: 0 on target, 1 off target or crushed, 2 wrong use or ffmpeg is missing.`,

  see: `untell see <video> [--json] [--out <dir>] [--budget <tokens>] [--theme dark|light] [--system <id>]

Give a model a video. A model cannot watch a film: untell see measures any video file and writes what a model
can read. It needs no project, no scene and no system, and it assumes no frame shape, no length and no sound.

It writes into --out (default .untell/see/<file name>/):
  see.json        one versioned document (version 2), sized for a context window: the file (length, frame size and
                  aspect, frame rate, codecs, bitrate, sound), the timeline (each cut with its strength; each soft
                  change: a fade, a wipe or a move with no hard cut; each shot with how it starts, its motion,
                  palette, brightness and ink grid), the pace (shots, stalls with the stall rule's verdict, the first
                  second),
                  the colour, the text (where detail of text size shows; the words when tesseract is on PATH), the
                  sound (loudness, true peak, range, a level curve, onsets, silent spans, the tempo with its trust,
                  how the cuts sit on the onsets), the findings of the rules that need only the file (the ids of
                  untell check <video>), the pictures, and notes: what was dropped to fit, what was not measured.
                  A measure that cannot be made is null, and why.<key> says why.
  sheet-<n>.jpg   contact sheets in pages: 8 to 12 frames each, about 1500 px on the long side, each frame with
                  its time, with the motion, the sound and the findings under each row.
stdout: what the file is, the timeline, then where the pictures and the JSON are.

  --json            print see.json alone on stdout (the progress goes to stderr)
  --out <dir>       the folder for see.json and the pages
  --budget <n>      the size of see.json in tokens: 1000 or more (default 6000). The estimate is the characters of
                    see.json divided by 3, rounded up. To fit, untell see drops detail in a fixed order: the onset
                    times, the text zones, palettes and ink grids of each shot, a coarser level curve, the measured
                    values of each finding, the words of each shot, then the form of the shots and the cuts, and
                    last the detail of the findings and the notes (docs/guide/commands.md lists all 20 steps).
                    notes.dropped lists what it dropped. The cuts, the shots and the causes stay longest.
  --theme dark|light  the pages' theme (default dark; UNTELL_THEME sets it too)
  --system <id>     the rules take their limits from a system, as untell check <video> --system <id> does

It needs ffmpeg and Python 3.10 or later with numpy, Pillow and scipy (untell sets them up in .venv-media once).
The tempo needs the listen tools (untell listen setup); without them it is null, with the reason.
The words need tesseract on PATH (optional; untell ships no OCR). UNTELL_NO_OCR=1 leaves them out.

Example: untell see clip.mp4
Exit: 0 written, 1 it failed, 2 wrong use or a missing tool.`,

  sheet: `untell sheet <video> [--out <file.jpg>] [--step <s>] [--cols <n>] [--beats <file or track>] [--findings <file.json>] [--align <align.json>] [--capture <capture.json>] [--theme dark|light] [--json]

Makes the review sheet: a whole film in one image. Each row is a strip of time: frames every --step seconds
with their times, the motion line (flat means a stall), the waveform with beats or onsets, red cut marks and
the findings. A cut is a change done in one frame. It also writes <sheet>.json: { video, seconds, fps, size,
cuts, stalls, loudnessPerSecondDb, beats, onsets, sheet, phone }, and the phone sheet <sheet stem>.phone.jpg: a
frame from each shot at 390 px wide, the size a phone shows it. It needs ffmpeg and a Python with numpy and Pillow (.venv-media, else python3).

  --out       the image (default: <video>.sheet.jpg beside the video)
  --step      seconds between frames (default 0.5)
  --cols      frames in a row (default 8)
  --beats     a beats JSON file, or a track name that untell media beats measured
  --findings  a JSON of findings with check, severity, from and to (untell check writes one)
  --theme     dark (the default) or light; UNTELL_THEME sets it too
  --align     the detector's align.json (.untell/lab/out/detector/<film>/align.json): the scene's guides and each
              alignment miss on its frames, with zoomed crops. untell check --sheet passes it by itself.
  --capture   the capture.json that untell check writes (.untell/lab/out/detector/<film>/capture.json): a label that
              types or a line that draws counts as motion. untell check --sheet passes it by itself; for a file that
              untell render wrote, untell sheet finds it from the facts beside the video (<video>.untell.json).
  --json      print { version: 1, sheet, json } on stdout

Example: untell sheet out/untell-example.mp4
Exit: 0 written, 1 it failed, 2 wrong use or a missing tool (the message names the fix: untell media setup).`,

  media: `untell media <setup|formats|add|prepare|beats|measure|remove|list|table>

Tools for media you bring: copy it in, cut out and grade it for a system, read a track's beats.
untell media help lists each subcommand with its options. untell media formats lists the formats and sizes.

Example: untell media add ~/Pictures/heron.jpg --as heron`,

  systems: `untell systems

Lists the 20 design systems with their mode, use and personality.

Example: untell systems`,

  doctor: `untell doctor [--json]

Shows what is installed and what is missing, with the one command that fixes each: Node, the framework, the
kit, ffmpeg, the Python env, the media model, the HyperFrames CLI and Chrome (HyperFrames), and each agent
harness (Claude Code, Codex) with its skill and its hook. It installs and downloads nothing.

  --json   { version: 1, ok, items: [{ name, status: ok|missing|optional|info, detail, fix? }] }

Example: untell doctor
Exit: 0 nothing required is missing, 1 something required is missing.`,

  hooks: `untell hooks on|off|status [--agent claude|codex|both]

The lint-after-edit loop. With the hook on, the agent harness runs untell lint after each edit to a film
file, and the agent sees the findings at once.

  Claude Code   a PostToolUse hook on Edit and Write in .claude/settings.json
  Codex         a PostToolUse hook on apply_patch in .codex/hooks.json. Codex runs a project hook only
                after you trust it: type /hooks in Codex.

on and off change only untell's own entry; every other setting stays as it is. The hook runs
npx --no-install untell, so untell must be in the project's node_modules (npm install --save-dev untell).
Without a hook, the skill and AGENTS.md still tell the agent to run untell lint after each edit.

  --agent   the harness to change (default for on: the one this project has, both when it is not clear;
            default for off: both)

Example: untell hooks on --agent codex`,

  snap: SNAP_HELP,

  cache: `untell cache status|clear [--json]

The cache: untell check keeps each recording in .untell/cache, keyed by everything that draws it (the page, the
kit, the media, Chrome and the recorder), and each Remotion frame by what draws it; untell render keeps each
render. A check of a film that did not change takes its recording from the cache. A repeated picture is a hard
link, so it takes no space. UNTELL_CACHE_GB (default 8) and UNTELL_CACHE_DAYS (default 7) limit it. A recording
older than UNTELL_RECORDINGS_DAYS (default 3) keeps its data and loses its pictures. untell check --no-cache
records every frame again.

  status   the size of the cache and the number of recordings in it (--json: { version: 1, dir, bytes, entries, kinds, slots })
  clear    delete the cache. The next check records every frame again.

The machine slots: a recorder takes one slot first, so several agents on one machine do not start a Chrome each
at once. UNTELL_SLOTS sets the number of slots (default: half the CPU cores, at least 2; 0 turns the pool off).

Example: untell cache status`,
};

/** The help of one command, or null for an unknown command. */
export const helpFor = (cmd: string): string | null => H[cmd] ?? null;
export const COMMANDS = Object.keys(H);

/**
 * Every command, its subcommands and its flags. The pack script and a unit test check that each untell
 * command a shipped playbook names is here. Keep it in step with cli.ts and the help texts above.
 */
const COMMON = ["--cwd", "--help", "-h"];
export const COMMAND_TABLE: Record<string, { subs?: Record<string, string[]>; flags: string[] }> = {
  init: { flags: [...COMMON, "--new", "--framework", "--agent", "--force", "--no-install", "--no-build", "--no-media"] },
  lint: { flags: [...COMMON, "--json", "--rules", "--explain", "--scope", "--max-warnings", "--docs", "--hook"] },
  build: { flags: COMMON },
  render: { flags: [...COMMON, "--out", "--no-master", "--system", "--keep-bitrate", "--via", "--no-cache", "--hyperframes", "--json"] },
  check: { flags: [...COMMON, "--sheet", "--json", "--hyperframes", "--no-record", "--full", "--rules", "--explain", "--film", "--render", "--no-detect", "--demo", "--no-cache", "--no-reuse", "--theme", "--system", "--no-scene", "--not-measured"] },
  sheet: { flags: [...COMMON, "--out", "--step", "--cols", "--beats", "--findings", "--align", "--capture", "--theme", "--json"] },
  see: { flags: [...COMMON, "--json", "--out", "--budget", "--theme", "--system"] },
  listen: {
    flags: [...COMMON, "--json", "--theme"],
    subs: {
      setup: ["--extras"], analyse: ["--force", "--no-stems", "--no-clap", "--drop"], analyze: ["--force", "--no-stems", "--no-clap", "--drop"],
      fx: ["--no-clap"], mix: ["--system", "--nodes"], compare: [],
    },
  },
  master: { flags: [...COMMON, "--system", "--lufs", "--peak", "--out", "--json"] },
  media: {
    flags: [...COMMON, "--hyperframes"],
    subs: {
      setup: [], formats: [], help: [], add: ["--as", "--kind", "--source", "--licence", "--license", "--role", "--force"],
      prepare: ["--system", "--as-is", "--no-cutout", "--height", "--keep-holes"], beats: [], measure: [], remove: [], list: [], table: [],
    },
  },
  systems: { flags: COMMON },
  system: { flags: [...COMMON, "--json"], subs: { new: ["--from", "--force"], check: ["--no-film"] } },
  doctor: { flags: [...COMMON, "--json"] },
  hooks: { flags: [...COMMON, "--agent"], subs: { on: [], off: [], status: [] } },
  snap: { flags: [...COMMON, "--at", "--preview", "--apply", "--unapply", "--scene", "--all", "--json", "--film"] },
  cache: { flags: [...COMMON, "--json"], subs: { status: [], clear: [] } },
};
