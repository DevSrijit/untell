// The detector in `untell check`: the repository's checks (registry/tools/inspect, from scripts/inspect) on the
// project's own film. It finds, without a person, the flaws a director sees: a stall, an empty opening, a
// line through text, type that a phone cannot read, a cut off the beat, a mix off its target.
//
// The recorder records the film and, in the same pass, captures the ink of every text, every SVG shape and
// the scene's nodes (record.ts). This module mixes the film's sound when the pass needs it (sound.json), runs
// detect.py in the work tree (worktree.ts) and turns its findings into `untell check` findings.
//
// Every pass mixes the sound from the scene's audio nodes (when it has any) and runs the sound checks on the mix.
// A render (untell check --render <file>, or untell render) adds the sound checks on the real render.
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { UsageError } from "./errors";
import { registryDir } from "./kit";
import type { MediaPaths } from "./media-paths";
import { readManifest } from "./media-store";
import { workEnv } from "./worktree";
import { mapLabCommands } from "../scripts/anchors";

/** One rule of the detector's catalog (the repository's scripts/inspect/checks/rules.py). */
export type DetectorRule = { id: string; family: string; severity: string; line: string; measures: string; limit: string; fix: string; module: string };

export function detectorRules(): DetectorRule[] {
  return JSON.parse(readFileSync(join(registryDir(), "tools", "inspect", "rules.json"), "utf8")) as DetectorRule[];
}

/**
 * The page's warnings that blocks print while the film draws ("title claim: ... does not fit", "codeBlock code: 2
 * line(s) wrap ..."), as findings: a warning on the block that the text names.
 */
export function blockFindings(warnings: string[]): { check: string; severity: "warning"; message: string; fix: string; node?: string }[] {
  const out: { check: string; severity: "warning"; message: string; fix: string; node?: string }[] = [];
  for (const w of warnings) {
    // A block's warning starts with the block's name (a lower-case word) and often its id: "title claim: ...".
    const m = w.match(/^page warning: (([a-z]\w*)(?: ([^:\s]+))?: .*)$/);
    if (!m) continue;
    const text = m[1]!, block = m[2]!, id = m[3];
    if (out.some((f) => f.message === text)) continue;
    out.push({ check: `block/${block}`, severity: "warning", message: text, ...(id ? { node: id } : {}),
      fix: "The block changed what you asked for (a smaller type, a wrap, a part left out). Give it a larger box, fewer words or another prop, so it draws as planned." });
  }
  return out;
}

/** `untell check --rules`: every detector rule, one line each. */
export function formatDetectorRules(): string {
  const rules = detectorRules();
  const w = Math.max(...rules.map((r) => r.id.length)) + 2;
  const lines = rules.map((r) => `  ${r.id.padEnd(w)} ${r.severity.padEnd(8)} ${r.line}`);
  return `The checks of untell check (the detector). Each finding names the time, the node, what it measured, the limit and the fix.
Errors fail the check. Warnings and advice do not.

${lines.join("\n")}

${rules.length} rules. untell check --explain <id> shows what a rule measures and where its limit comes from.
The sound rules run on a mix of the scene's sound; sound/* rules run on a render (untell check --render <file>, or untell render).
Block warnings (block/<name>) come from the blocks while the film draws.
untell lint --rules lists the source rules (lint/*).`;
}

/** What untell knows of HyperFrames' own rules that it passes through (their names say the fault; HyperFrames' own
 *  message names the element and the measure). */
const HF_RULES: Record<string, string> = {
  canvas_overflow: "an element reaches past the edge of the frame",
  outside_safe_zone: "text sits outside the platform-safe area",
  line_unread: "a line leaves before a viewer can read it",
  dead_stretch: "the frame holds still too long",
  film_silent: "the film has no sound",
  text_occluded: "text is covered by another element",
  text_box_overflow: "text runs past its own box",
  console_warning: "the page printed a warning while it ran (a block's own warning is reported as block-warning instead)",
};

/** `untell check --explain hyperframes/<code>`: a HyperFrames rule that untell passes through. */
export function explainHyperframesRule(id: string): string {
  const code = id.replace(/^hyperframes\/?/, "");
  if (!code) return `hyperframes/<code>: HyperFrames' own checks. untell runs \`hyperframes check --json\` on the built page and reports each error and warning as hyperframes/<code>. Known codes: ${Object.keys(HF_RULES).join(", ")}.`;
  let ov: Record<string, Record<string, { severity: string; why?: string }>> = {};
  try { ov = JSON.parse(readFileSync(join(registryDir(), "tools", "inspect", "hf_overrides.json"), "utf8")); } catch { /* none shipped */ }
  const systems = Object.entries(ov).filter(([, t]) => t[code]).map(([sys, t]) => `  ${sys}: ${t[code]!.severity === "off" ? "not reported" : "advice"} (${t[code]!.why ?? "the system's direction"})`);
  return `hyperframes/${code}  (HyperFrames' own check, passed through by untell)

${HF_RULES[code] ? `${HF_RULES[code]![0]!.toUpperCase()}${HF_RULES[code]!.slice(1)}.` : "A rule of HyperFrames' own check. Its message in the finding names the element and what it measured."}

Measures: HyperFrames' rule ${code}, on the page untell built (index.html), with \`hyperframes check --json\`. The finding
          keeps the element's selector and its data-el node. Run \`npx hyperframes check\` for HyperFrames' own text.
Severity: as HyperFrames gives it (an error fails the check)${systems.length ? `, except where a system's direction says otherwise:\n${systems.join("\n")}` : "."}
Declare:  // untell-ignore hyperframes/${code} <node>: <reason>   (on the line before the block call that owns the node)`;
}

/** `untell check --explain <id>`: one rule in full. A lint rule id (lint/<rule>) goes to the lint catalog. */
export function explainDetectorRule(id: string): string {
  if (id.startsWith("hyperframes")) return explainHyperframesRule(id);
  const rules = detectorRules();
  const x = rules.find((r) => r.id === id) ?? rules.find((r) => r.id === id.replace(/^detect\//, ""));
  if (!x) {
    const near = rules.filter((r) => r.id.includes(id) || id.includes(r.id)).map((r) => r.id);
    throw new UsageError(`no check "${id}".${near.length ? ` Did you mean: ${near.join(", ")}?` : ""} untell check --rules lists them. A lint rule: untell lint --explain <rule>.`, "check");
  }
  return `${x.id}  (${x.severity}, ${x.family})

${x.line}

Measures: ${x.measures}
Limit:    ${x.limit || "-"}
Fix:      ${x.fix || "-"}`;
}

type AudioNode = { id: string; kind: "audio"; src: string; at: number; until?: number; from?: number; volume?: number; fadeIn?: number; fadeOut?: number };
type Capture = { durationInFrames: number; fps: number; nodes: { kind: string }[] | null };

/** Integrated loudness and true peak by ffmpeg's EBU R128 meter, in the keys the checks read. */
export function loudnessOf(file: string): { lufsIntegrated: number | null; truePeakDb: number | null } {
  const r = spawnSync("ffmpeg", ["-nostats", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 << 20 });
  const tail = (r.stderr ?? "").slice((r.stderr ?? "").lastIndexOf("Summary:"));
  const get = (k: string) => { const m = tail.match(new RegExp(`${k}:\\s+(-?[\\d.]+|-inf)`)); return m && m[1] !== "-inf" ? Number(m[1]) : null; };
  return { lufsIntegrated: get("I"), truePeakDb: get("Peak") };
}

/**
 * The film's sound as one WAV (48 kHz, stereo, 16 bit), each clip on its exact time as HyperFrames plays it: trimmed
 * from `from`, cut at `until`, faded in and out (linear), set to its volume and delayed to `at` to the sample. untell
 * render puts this mix into a Remotion render: Remotion starts each clip on a whole frame (its Sequence and trimBefore
 * count frames), which moved a tick by up to half a frame (a tick 12 ms early), so the two frameworks did not agree.
 */
export function exactMix(nodes: AudioNode[], seconds: number, media: string, wav: string): string {
  const inputs: string[] = [], chains: string[] = [];
  nodes.forEach((n, i) => {
    inputs.push("-i", join(media, n.src));
    const len = Math.min(n.until ?? seconds, seconds) - n.at;
    const f = [`atrim=start=${n.from ?? 0}:duration=${len.toFixed(5)}`, "asetpts=PTS-STARTPTS", "aresample=48000", "aformat=channel_layouts=stereo"];
    if (n.fadeIn) f.push(`afade=t=in:st=0:d=${n.fadeIn}`);
    if (n.fadeOut) f.push(`afade=t=out:st=${Math.max(0, len - n.fadeOut).toFixed(5)}:d=${n.fadeOut}`);
    f.push(`volume=${n.volume ?? 1}`);
    // The delay in samples, not in whole ms: a clip lands on its time to the sample.
    const at = Math.round(Math.max(0, n.at) * 48000);
    if (at > 0) f.push(`adelay=${at}S|${at}S`);
    chains.push(`[${i}:a]${f.join(",")}[a${i}]`);
  });
  const filter = `${chains.join(";")};${nodes.map((_, i) => `[a${i}]`).join("")}amix=inputs=${nodes.length}:normalize=0:duration=longest,apad=whole_dur=${seconds}[out]`;
  const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...inputs, "-filter_complex", filter, "-map", "[out]", "-t", String(seconds), "-c:a", "pcm_s16le", wav], { encoding: "utf8", timeout: 180000 });
  if (r.status !== 0) throw new Error(`ffmpeg could not mix the film's sound: ${(r.stderr ?? "").trim().split("\n").slice(-2).join(" ")}. Check each sound with untell media list.`);
  return wav;
}

/**
 * The film's sound, mixed as the renderers play it (each clip trimmed, faded, set to its volume, placed at its
 * time), measured, with the facts of each clip and the beat grid of each music file. Adapted from the repository's
 * scripts/detect.ts (sound and mix). The beat grid comes from the track's music map (untell listen analyse),
 * else from its beats (untell media beats). Writes <det>/sound.json and returns a note for the report.
 */
export function mixSound(det: string, p: MediaPaths, sourceMtime: number): string {
  const cap = JSON.parse(readFileSync(join(det, "capture.json"), "utf8")) as Capture;
  const nodes = (cap.nodes ?? []).filter((n): n is AudioNode => n.kind === "audio");
  const file = join(det, "sound.json");
  if (!cap.nodes) { writeFileSync(file, JSON.stringify({ hasSound: false })); return "the page holds no scene nodes (build it again with untell build), so the sound is not mixed"; }
  if (!nodes.length) { writeFileSync(file, JSON.stringify({ hasSound: false })); return "the film has no sound"; }
  const seconds = cap.durationInFrames / cap.fps;
  const wav = join(det, "sound.wav");
  exactMix(nodes, seconds, p.media, wav);
  const manifest = readManifest(p);
  const fact = (src: string) => {
    const name = src.split("/")[0]!;
    const e = manifest[name];
    const metaFile = join(p.media, name, "meta.json");
    const meta = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) as { peak?: number } : {};
    return { fileKind: e?.kind === "music" || e?.kind === "sfx" ? e.kind : null, peak: meta.peak ?? null };
  };
  const clips = nodes.map((n) => ({ ...n, ...fact(n.src) }));
  const beats: Record<string, unknown> = {};
  for (const c of clips) {
    if (c.fileKind !== "music" || beats[c.src]) continue;
    const dir = join(p.media, c.src.split("/")[0]!);
    if (existsSync(join(dir, "music.json"))) {
      const m = JSON.parse(readFileSync(join(dir, "music.json"), "utf8")) as { beats: number[]; bpm: number; downbeats: number[]; sections: { start: number; end: number; role: string }[] };
      beats[c.src] = { beats: m.beats, bpm: m.bpm, downbeats: m.downbeats, sections: m.sections };
    } else if (existsSync(join(dir, "beats.json"))) {
      const b = JSON.parse(readFileSync(join(dir, "beats.json"), "utf8")) as { beats: number[]; bpm: number; bars?: { at: number }[] };
      beats[c.src] = { beats: b.beats, bpm: b.bpm, downbeats: (b.bars ?? []).map((x) => x.at), sections: [] };
    } else beats[c.src] = { beats: [], bpm: null, downbeats: [], sections: [] };
  }
  writeFileSync(file, JSON.stringify({ hasSound: true, wav, loudness: loudnessOf(wav), clips, beats, sourceMtime: sourceMtime / 1000 }));
  const noGrid = clips.filter((c) => c.fileKind === "music" && !(beats[c.src] as { beats: number[] }).beats.length).map((c) => c.src.split("/")[0]!);
  return `mixed ${nodes.length} sound clip(s)${noGrid.length ? `; no beat grid for ${[...new Set(noGrid)].join(", ")} (run untell listen analyse <name>)` : ""}`;
}

/** What detect.py prints for one film. */
export type DetectorFinding = { check: string; severity: "error" | "warning" | "advice"; from: number; to: number; node?: string; measured: unknown; limit: unknown; fix: string };
/** One cause on the first screen of untell check: findings of one rule that one change clears. */
export type DetectorGroup = { check: string; severity: "error" | "warning" | "advice"; cause: string; count: number; likelyGoneAfterFix: number; from: number; to: number; nodes: string[]; fix: string };
/** A finding the scene declares intended (// untell-ignore <rule> [node]: <reason>): listed, never counted as an error. */
export type DeclaredFinding = DetectorFinding & { declared: { reason: string; where: string; scope: string } };
export type DetectorResult = { film: string; system: string | null; seconds: number; findings: DetectorFinding[]; skipped: Record<string, string>; notes: unknown[];
  groups?: DetectorGroup[]; declared?: DeclaredFinding[];
  /** The detector's verdict: failed, passed with warnings, or passed (with "a demo: frame rules only" for a demo). */
  verdict?: { state: "failed" | "warnings" | "passed"; errors: number; warnings: number; advice: number; renderStale: boolean; line: string };
  /** Each untell-ignore comment the detector read, with how many findings it matched. */
  declarations?: { rule: string; nodes: string[]; reason: string; where: string; scope: string; matched: number }[] };

/** Runs detect.py on one film in the work tree. `only` limits the checks (detect.py --only). */
export function runDetect(root: string, id: string, py: string, only?: string[], demo = false): DetectorResult {
  const args = [join(registryDir(), "tools", "inspect", "detect.py"), id, ...(only?.length ? ["--only", only.join(",")] : []), ...(demo ? ["--demo"] : [])];
  const r = spawnSync(py, args, { cwd: root, env: workEnv(root), encoding: "utf8", maxBuffer: 256 << 20, timeout: 1800000 });
  if (r.status !== 0) {
    const tail = (r.stderr ?? "").trim().split("\n").slice(-4).join("\n");
    if (/ModuleNotFoundError: No module named '(\w+)'/.test(tail)) {
      const mod = tail.match(/No module named '(\w+)'/)![1];
      throw new Error(`the detector needs the Python module ${mod}, and ${py} does not have it. Run: untell media setup`);
    }
    throw new Error(`the detector failed (${py}):\n${tail}`);
  }
  // The detector's text names a repository command in a few reasons (a declaration of an unknown rule): in a project it is untell's.
  return JSON.parse(mapLabCommands(r.stdout).text) as DetectorResult;
}

/** The detector's rule line for a finding, for its message: the catalog's "line", else the check id. */
export function messageOf(f: DetectorFinding, rules: DetectorRule[]): string {
  const r = rules.find((x) => x.id === f.check) ?? rules.find((x) => f.check.startsWith(`${x.id}/`));
  const m = (v: unknown) => (v === undefined || v === null ? "-" : JSON.stringify(v));
  return `${r ? r.line.replace(/\.$/, "") : f.check}: measured ${m(f.measured)}, limit ${m(f.limit)}`;
}

/** The newest edit of the film's source files, in ms (the scene module and the kit). */
export function sourceMtime(files: string[]): number {
  return Math.max(0, ...files.filter(existsSync).map((f) => statSync(f).mtimeMs));
}

export const rel = (project: string, p: string) => relative(project, p) || p;
