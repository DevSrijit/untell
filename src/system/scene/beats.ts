// Beats: the music map of a track in film time, and the helpers that put picture events on it.
//
// What it is for: an agent cannot hear, so it places cuts by numbers. These helpers give it the numbers that
// the ear uses: the beat grid, the bars, the drops, the strongest onsets and the loudest bars of the part of
// the track that the film plays. The map comes from scripts/music_map.py (src/system/music.gen.ts).
//
// Rules these helpers enforce:
// - Every time they return sits on a frame (1/30 s), so both renderers show the change on the same frame.
// - Film time = the music node's `at` + (track time - the node's `from`). A scene that changes `from` gets
//   new beat times: take every cut time from `beats()`, never from a number written by hand.
// - A picture event lands on a cut point (`cuts`): the beats, or on a low-trust grid the strong onsets (measured in
//   the sound). `beats()` warns at build when the grid is low trust. Its sound peak lands on the first frame that
//   shows it (`hit` does that).
// - `revealedAt` reads the tracks of the nodes, so a hit lands when a text has fully arrived, not before.
import { MUSIC, type MusicMap, type MusicSection } from "../music.gen";
import type { System } from "../systems";
import { valueAt } from "./time";
import type { Node, Prop } from "./types";

export const FPS = 30;
/** Snaps a time to the nearest frame. */
export const frame = (t: number) => Math.round(t * FPS) / FPS;

/** The map of a prepared track. A wrong name throws and lists the names that have a map. */
export function mapOf(media: string | MusicMap): MusicMap {
  if (typeof media !== "string") return media;
  const m = MUSIC[media];
  if (!m) throw new Error(`no music map for "${media}": prepare the track's music map first (in a project: \`untell listen analyse ${media}\`; in this repository: \`scripts/listen/untell-listen analyse ${media}\`, then \`python3 scripts/music_map.py ${media}\`). Maps: ${Object.keys(MUSIC).join(", ") || "none"}`);
  return m;
}

/** The nearest time in a sorted list (or t itself for an empty list). */
export function nearest(list: readonly number[], t: number): number {
  let best = t, d = Infinity;
  for (const v of list) { const e = Math.abs(v - t); if (e < d) { d = e; best = v; } }
  return best;
}

/** Snaps t to the nearest beat of `grid`, then to a frame. */
export function onBeat(t: number, grid: readonly number[]): number {
  return frame(nearest(grid, t));
}

export type Onset = { t: number; strength: number };
export type Beats = {
  bpm: number;
  confidence: MusicMap["confidence"];
  /** How far the beat grid can be trusted, and why (the music map's gridTrust). With "low", the grid may count
   *  another pulse (half, double, 3:4): place cuts on onsets and bars by ear-checked numbers, not on beats alone. */
  gridTrust: MusicMap["gridTrust"];
  gridIssues: string[];
  /** Beats, downbeats (bar starts) and strong onsets inside the film window, in film time, each on a frame. */
  beats: number[];
  bars: number[];
  onsets: Onset[];
  /** Drops in the window, in film time, with their rise in dB. */
  drops: { t: number; rise: number }[];
  /** Bars in the loudest quarter of the track that fall in the window: start, end, loudness (LUFS). */
  loudest: { t: number; end: number; lufs: number }[];
  /** Sections clipped to the window, in film time. */
  sections: (MusicSection & { start: number; end: number })[];
  /** Film time of a track time, and back. */
  film: (trackT: number) => number;
  track: (filmT: number) => number;
  /** t snapped to the nearest beat (or bar) in the window, on a frame. */
  onBeat: (t: number) => number;
  onBar: (t: number) => number;
  /** The strongest onset between two film times, or null. */
  strongest: (from: number, to: number) => Onset | null;
  /**
   * Where to cut: the beats, or, on a low-trust grid, the strong onsets (strength 0.5 or more), which are measured in
   * the sound, not inferred from a grid that may count another pulse. One rule for every system and playbook: cut on
   * `cuts` (onCut), and a low-trust grid says so at build.
   */
  cuts: number[];
  /** t snapped to the nearest cut point (cuts), on a frame. */
  onCut: (t: number) => number;
};

/** The strength from which an onset is a cut point on a low-trust grid. */
export const STRONG_ONSET = 0.5;
const warnedGrid = new Set<string>();

/**
 * The map of `media` in film time, for a music node that starts at film time `at` (default 0) and plays the
 * track from `from` seconds. Only events from `at` to `until` (default: the end of the track) are kept.
 */
export function beats(media: string | MusicMap, o: { from: number; at?: number; until?: number }): Beats {
  const m = mapOf(media);
  const at = o.at ?? 0;
  const until = o.until ?? at + (m.duration - o.from);
  const film = (x: number) => at + x - o.from;
  const track = (t: number) => t - at + o.from;
  const inside = (t: number) => t >= at - 1e-6 && t <= until + 1e-6;
  const times = (xs: readonly number[]) => xs.map(film).filter(inside).map(frame);
  const bs = times(m.beats), bars = times(m.downbeats);
  const onsets = m.onsets.map(([t, s]) => ({ t: frame(film(t)), strength: s })).filter((x) => inside(x.t));
  const sections = m.sections
    .map((s) => ({ ...s, start: Math.max(at, film(s.start)), end: Math.min(until, film(s.end)) }))
    .filter((s) => s.end > s.start);
  const low = (m.gridTrust ?? "medium") === "low";
  const strong = onsets.filter((x) => x.strength >= STRONG_ONSET).map((x) => x.t);
  const cuts = low && strong.length ? strong : bs;
  if (low && typeof media === "string" && !warnedGrid.has(media)) {
    warnedGrid.add(media);
    console.warn(`beats ${media}: the beat grid is low trust (${(m.gridIssues ?? []).join("; ")}). Cut on \`cuts\` (or onCut): here they are the track's ${strong.length} strong onsets, measured in the sound, not the beats of a grid that may count another pulse.`);
  }
  // On a low-trust grid the cut points are the strong onsets, and there can be few of them: several onCut calls for
  // times far apart then land on one point. Before: every onCut of a Graphite film fell on 10.77 s and the build
  // stopped further on. The build says it once, with the times asked and the points there are.
  const asked = new Map<number, number[]>();
  const onCut = (t: number) => {
    const c = onBeat(t, cuts.length ? cuts : [t]);
    if (low && cuts === strong) {
      const same = asked.get(c) ?? [];
      if (!same.some((x) => Math.abs(x - t) < 1e-6)) same.push(t);
      asked.set(c, same);
      const far = same.filter((x) => Math.abs(x - same[0]!) > 0.25);
      const key = `${typeof media === "string" ? media : "map"}@${c}`;
      if (far.length && !warnedGrid.has(key)) {
        warnedGrid.add(key);
        console.warn(`beats ${typeof media === "string" ? media : "(map)"}: on this low-trust grid there are ${cuts.length} cut point${cuts.length === 1 ? "" : "s"} from ${at.toFixed(2)} to ${until.toFixed(2)} s (${cuts.map((x) => x.toFixed(2)).join(", ")}), fewer than the scene asks for: onCut(${same[0]!.toFixed(2)}) and onCut(${far[0]!.toFixed(2)}) both land on ${c.toFixed(2)} s. Take fewer cuts, place them on these points, or cut on the picture (a hold) between them.`);
      }
    }
    return c;
  };
  return {
    cuts, onCut,
    bpm: m.bpm, confidence: m.confidence, gridTrust: m.gridTrust ?? "medium", gridIssues: m.gridIssues ?? [], beats: bs, bars, onsets,
    drops: m.drops.map((d) => ({ t: frame(film(d.t)), rise: d.rise })).filter((d) => inside(d.t)),
    loudest: m.loudest.map((i) => ({ t: frame(film(m.bars[i]!)), end: frame(film(m.bars[i + 1] ?? m.duration)), lufs: m.barLufs[i]! }))
      .filter((b) => inside(b.t)).sort((a, b) => a.t - b.t),
    sections, film, track,
    onBeat: (t) => onBeat(t, bs.length ? bs : [t]),
    onBar: (t) => onBeat(t, bars.length ? bars : [t]),
    strongest: (a, b) => onsets.filter((x) => x.t >= a && x.t <= b).reduce<Onset | null>((best, x) => (!best || x.strength > best.strength ? x : best), null),
  };
}

/** How loud the 4 s after a track time are (LUFS, from the bars). */
function after(m: MusicMap, t: number): number {
  return windowLevel(m, t, 4).lufs;
}

/**
 * The track time to place on a film moment: the strongest drop (its rise plus how loud it lands, against the
 * track's loudness: a drop into the loudest part beats a larger rise out of a break), or the start of the loudest bar
 * when the track has no drop or with `peak: "loudest"`. `fits` filters candidates (the music block passes a test
 * that the track covers the whole film window). Returns null when no candidate fits.
 */
export function peakOf(media: string | MusicMap, peak: "drop" | "loudest" = "drop", fits: (trackT: number) => boolean = () => true): { t: number; kind: "drop" | "loudest"; bar: number; measured: boolean } | null {
  const m = mapOf(media);
  const score = (d: { t: number; rise: number }) => d.rise + after(m, d.t) - m.lufs;
  // A drop lands on its measured rise (`at`, from the sound: scripts/music_map.py measured_rise), not on its bar line,
  // which a guessed bar start puts a beat late. A map with no `at` keeps the bar line.
  if (peak === "drop") for (const d of [...m.drops].sort((a, b) => score(b) - score(a))) {
    const t = d.at ?? d.t;
    if (fits(t)) return { t, kind: "drop", bar: d.t, measured: d.at !== undefined };
  }
  for (const i of m.loudest) if (fits(m.bars[i]!)) return { t: m.bars[i]!, kind: "loudest", bar: m.bars[i]!, measured: false };
  return null;
}

/**
 * Where a music node enters its track so that its drop (or loudest bar) lands on film time `peakAt`: `from` in
 * track seconds, and a note that says what was placed (the measured rise, or the bar line, and why). Pure: it reads
 * only the map, so a test can give it any map.
 */
export function placePeak(map: MusicMap, o: { peakAt: number; at?: number; until?: number; peak?: "drop" | "loudest"; name?: string }): { from: number; t: number; note: string | null } | null {
  const at = o.at ?? 0, lead = o.peakAt - at, len = o.until !== undefined ? o.until - at : 0;
  const fits = (t: number) => t - lead >= 0 && t - lead + len <= map.duration + 1e-6;
  const pk = peakOf(map, o.peak ?? "drop", fits);
  if (!pk) return null;
  const name = o.name ?? "the track";
  const beat = 60 / map.bpm, off = pk.t - pk.bar;
  const guess = (map.gridIssues ?? []).find((g) => /bar start/.test(g));
  let note: string | null = null;
  if (pk.kind === "drop" && pk.measured && Math.abs(off) > 1 / FPS)
    note = `music ${name}: the drop's bar line is at ${pk.bar} s, and its measured rise in the sound is at ${pk.t} s (${Math.abs(off / beat).toFixed(1)} beat ${off < 0 ? "earlier" : "later"}${guess ? `; ${guess}` : ""}). peakAt places the measured rise on ${o.peakAt} s.`;
  else if (pk.kind === "drop" && !pk.measured && guess)
    note = `music ${name}: the drop at ${pk.t} s sits on a bar line that is a guess (${guess}), and this map has no measured rise. Make the map again (untell listen analyse ${name} --force) so peakAt lands the rise itself.`;
  return { from: Math.round((pk.t - lead) * 1000) / 1000, t: pk.t, note };
}

/** The step of a music map's `bands` (sound_checks.BAND_HOP), seconds, and the dB of its lowest character (BAND_LOW). */
export const BAND_HOP = 0.025;
const BAND_LOW = -30;

/**
 * A track's octave bands (60 Hz to 16 kHz, dB at volume 1) over the 0.1 s around `at` seconds into the file: in each
 * band, the louder of the two frames of the map's `bands` on either side of it. The detector reads the 0.1 s at the
 * hit's peak; a frame 0.01 s off can read 3 dB under it where a drum hit starts, so the louder one is the plan.
 * Null when the map has no bands or `at` is outside the track.
 */
export function bandsAt(media: string | MusicMap, at: number): number[] | null {
  const b = mapOf(media).bands;
  if (!b || at < 0) return null;
  const frame = (k: number) => (k * 8 + 8 <= b.length ? Array.from({ length: 8 }, (_, i) => b.charCodeAt(k * 8 + i) - 33 + BAND_LOW) : null);
  const lo = frame(Math.floor(at / BAND_HOP + 1e-9)), hi = frame(Math.ceil(at / BAND_HOP - 1e-9));
  if (!lo || !hi) return null;
  return lo.map((v, i) => Math.max(v, hi[i]!));
}

/**
 * The loudness (LUFS) of the part of a track from `from` for `seconds`, from its bars (energy mean), and the
 * highest true peak (dBTP) of those bars.
 */
export function windowLevel(media: string | MusicMap, from: number, seconds: number): { lufs: number; truePeak: number } {
  const m = mapOf(media);
  let e = 0, w = 0, tp = -120;
  m.bars.forEach((a, i) => {
    const b = m.bars[i + 1] ?? m.duration;
    const ov = Math.min(b, from + seconds) - Math.max(a, from);
    if (ov <= 0) return;
    const l = m.barLufs[i]!;
    if (l > -70) { e += ov * 10 ** (l / 10); w += ov; }
    tp = Math.max(tp, m.barPeak[i]!);
  });
  return { lufs: w ? 10 * Math.log10(e / w) : m.lufs, truePeak: tp };
}

/**
 * The volume (linear gain) that brings a window of a track to `lufs`, capped so the window's true peak stays at
 * or under `truePeak` (dBTP). The mix's hits add little to the integrated loudness of a short film.
 */
export function gainFor(media: string | MusicMap, from: number, seconds: number, target: { lufs: number; truePeak?: number }): number {
  const lv = windowLevel(media, from, seconds);
  const db = Math.min(target.lufs - lv.lufs, (target.truePeak ?? -1) - lv.truePeak);
  return Math.round(10 ** (db / 20) * 1000) / 1000;
}

const REST: Prop[] = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "rotate", "draw", "reveal"];

function drawn(n: Node): boolean {
  return n.kind !== "audio" && n.kind !== "anchor" && n.kind !== "camera" && n.kind !== "hold";
}

/** The nodes that a name points at: the node with that id, or every node whose id starts with `id-`. */
export function nodesOf(nodes: readonly Node[], id: string): Node[] {
  const hit = nodes.filter((n) => drawn(n) && (n.id === id || n.id.startsWith(`${id}-`)));
  if (!hit.length) throw new Error(`no drawn node "${id}" (nor "${id}-..."). Ids: ${nodes.filter(drawn).map((n) => n.id).slice(0, 40).join(", ")}`);
  return hit;
}

/**
 * The frame on which every node of `id` has fully arrived: the LAST part of a block with many parts (a callout's
 * leader, label and dot; a dimension's line and value; a chart's labels; terminal rows). For each node: the frame after
 * its entrance's motion ends (the first frame of rest), while it shows at its highest opacity. A label that lands before
 * its leader has drawn is not "arrived" (an agent's Spec film's tick fired early). A later move or turn of the same
 * node is not its arrival. Sampled per frame from the tracks, so it holds for any curve, overshoot included.
 * `after`: look only from this film time on: for a block that enters twice, or to land on a later move (give the
 * move's time).
 */
export function revealedAt(system: System, nodes: readonly Node[], id: string, after = 0): number {
  let latest = 0;
  for (const n of nodesOf(nodes, id)) {
    const tr = n.tracks ?? {};
    const props = REST.filter((p) => tr[p]?.length);
    let end = 0;
    for (const p of props) for (const k of tr[p]!) end = Math.max(end, k.t);
    const at = (p: Prop, t: number) => valueAt(system, tr[p], p, t);
    const f0 = Math.round(after * FPS), f1 = Math.round(end * FPS) + 3;
    // Opacity as the renderers show it: clamped to 0..1. An overshooting curve (Pop) passes 1 for a few frames; read
    // raw, its apex looked like the peak and the settle back to 1 like an exit, so the label counted as arrived early.
    const op = (f: number) => (tr.opacity ? Math.min(1, Math.max(0, at("opacity", f / FPS))) : 1);
    let peak = 0;
    for (let f = f0; f <= f1; f++) peak = Math.max(peak, op(f));
    // The node's shown run: from the first frame at its highest opacity to the last frame before it drops (its exit).
    let a = f0;
    while (a < f1 && op(a) < peak - 1e-3) a++;
    let b = a;
    while (b < f1 && op(b + 1) >= peak - 1e-3) b++;
    // Arrived = the frame after the last change of its entrance while it shows, so a part that is still drawing (a
    // leader, a line) counts. The entrance is what brings it on (opacity, draw, reveal, scale) and a slide that starts
    // as it comes on (x, y, rotate moving within two frames of its first full frame). A later change of place, turn or
    // squash (a shape's `moves`, `turns`, `squash`) is not its arrival: before, a hit `on` a shape with moves landed on
    // the last move, 2.2 s late. To land on a later move, give `after` at that move's time.
    // A node that never comes to rest inside the run (a drift) keeps the first frame of two still frames.
    const LATER: Prop[] = ["x", "y", "rotate", "scaleX", "scaleY"];
    const changed = (ps: Prop[], f: number) => ps.some((p) => Math.abs(at(p, f / FPS) - at(p, (f + 1) / FPS)) >= 1e-3);
    const entry = props.filter((p) => !LATER.includes(p)), later = props.filter((p) => LATER.includes(p));
    const moved = (f: number) => changed(props, f);
    let last = -1;
    for (let f = a; f < b; f++) if (changed(entry, f)) last = f;
    // A slide or a turn that starts as the node comes on is part of its entrance: up to its first rest.
    const slide = [a - 1, a, a + 1, a + 2].find((f) => f >= f0 && f < b && changed(later, f));
    if (slide !== undefined) { let f = Math.max(a, slide); while (f < b && changed(later, f)) f++; last = Math.max(last, f - 1); }
    let found = last < 0 ? a : last + 1;
    if (last >= b - 1 && b < f1) {
      found = a;
      for (let f = a; f <= b; f++) if (!moved(f) && !moved(f + 1)) { found = f; break; }
    }
    latest = Math.max(latest, found / FPS);
  }
  return frame(latest);
}

/**
 * The frame on which a labelled block's label first shows, for a block that names a label (callout, dimension,
 * formula: a text node `<id>-text` and an anchor `<id>-label` or `<id>-box`), else null. A label shows on the first
 * frame its opacity is at 0.5 or more after a frame under 0.5: the rule of the hit check (loudness.py appears()), which
 * counts a label that shows as a picture cause at any size. The rest of such a block (a 2.5 px dot, the end of a fade)
 * changes too little for the check to see.
 */
export function labelShownAt(system: System, nodes: readonly Node[], id: string, after = 0): number | null {
  const text = nodes.find((n) => n.kind === "text" && n.id === `${id}-text`);
  if (!text || !nodes.some((n) => n.kind === "anchor" && (n.id === `${id}-label` || n.id === `${id}-box`))) return null;
  const keys = text.tracks?.opacity;
  const op = (f: number) => (keys?.length ? valueAt(system, keys, "opacity", f / FPS) : 1);
  const f0 = Math.max(1, Math.round(after * FPS));
  const end = keys?.length ? Math.round(Math.max(...keys.map((k) => k.t)) * FPS) + 2 : f0;
  if (op(f0 - 1) >= 0.5 && f0 <= 1) return 0;
  for (let f = f0; f <= end; f++) if (op(f) >= 0.5 && op(f - 1) < 0.5) return f / FPS;
  return null;
}

/**
 * The times at which each node of `id` first shows (opacity over 0.5), one a frame, in order: for a typeOn,
 * one time a key. Keys on the same frame merge into one.
 */
export function appearTimes(system: System, nodes: readonly Node[], id: string): number[] {
  const out = new Set<number>();
  for (const n of nodesOf(nodes, id)) {
    const keys = n.tracks?.opacity;
    if (!keys?.length) { out.add(0); continue; }
    const end = Math.max(...keys.map((k) => k.t));
    for (let f = 0; f <= Math.round(end * FPS) + 1; f++) {
      if (valueAt(system, keys, "opacity", f / FPS) > 0.5) { out.add(frame(f / FPS)); break; }
    }
  }
  return [...out].sort((a, b) => a - b);
}
