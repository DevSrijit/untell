// Sound: a music bed, hits (sound effects) placed on what the picture does, and key ticks under typing.
//
// Rules these blocks enforce (from HyperFrames' sound guide and the untell critics):
// - Music is the clock. `music` enters the track at a point the scene chooses by meaning, not by a number:
//   `peakAt` puts the track's drop (or its loudest bar) on a film time, `align` puts a track time on a film
//   time, and `from` stays for a scene that has measured its own entry. The track's map (src/system/music.gen.ts,
//   from scripts/music_map.py) gives the drop and the bars. Take every cut time from `beats()` (scene/beats.ts).
// - `peakAt` places a drop's measured rise (the step in level in the sound, music_map.py measured_rise), not its bar
//   line: a guessed bar start put the drop a beat late in three agents' films. The build says what it placed when
//   the two differ. A map made before the rise was measured keeps the bar line and says how to make the map again.
// - Level without hand tuning. With no `volume` (or `volume: "auto"`), the bed gets the gain that brings the part
//   it plays to the system's whole-mix target (mixTarget in src/system/direction.ts), capped so its true peak
//   stays at or under -1 dBTP. An explicit number is used as it is.
// - A track that peaks over -1 dBTP has a prepared master (master.wav, true-peak limited to -1 dBTP by
//   scripts/music_map.py); `music` plays it, so a bed at full level never clips.
// - An opening rise. With no `fadeIn`, the bed rises over OPEN_RISE (0.15 s) when it enters above the track's mean
//   level (the first 1 s from `from` is louder than the track's integrated loudness) and the system does not move in
//   single frames (ctx.instant: Raw, Console, Title cut hard). `fadeIn: 0` asks for a hard start on purpose.
//   The detector's sound/hard-start check holds the same rule: a bed that starts above the track's mean level with
//   no fade, in a system that is not one-frame, is a finding unless the scene set fadeIn: 0.
// - It ends on the film's end or `until`, with a short fade under the last card.
// - A hit's peak is placed on the first frame that shows the picture's change (frameOf(at), context.ts: a change at t
//   shows on the first frame after t). For a change at 1.0 s that is frame 31, at 1.033 s. Never before the picture
//   (a sound early feels wrong sooner than one late). The block places it on that frame exactly; the detector's hit
//   timing check accepts a peak 0 to 2 frames after the change, because a change can first be visible a frame late
//   (an eased entrance shows little on its first frame). `hit` takes the picture's time, or `on`: the frame on which
//   the picture changes for a block: the frame a callout's, a dimension's or a formula's label shows (labelShownAt,
//   beats.ts: the hit check's own rule), else the frame on which the block has fully arrived, its last part included
//   (revealedAt). It starts the file early by its measured peak. To put an entrance and its hit on a beat, build the
//   block with landOn(ctx, <beat>, (at, c) => B.<block>({ ..., at }, c)) (measureBlock.ts): an entrance started at
//   <beat> - ctx.dur.enter arrives off the beat (a slide 3 to 6 frames late, a grow or a fade up to 2 frames early).
// - Few hits, each with a cause on screen. Level without hand tuning: give `bed` (the music block's nodes).
// - THE EFFECT RULE. This is the one statement of it: `hit`, `typing`, `untell listen mix` (scripts/listen/mix.py) and
//   the check sound/effect-too-loud all say the same.
//   1. An effect's true peak plus the bed's true peak around it stay at or under -1 dBTP (MIX_PEAK): the two can peak
//      on the same sample, so their amplitudes add. The bed's peak is its master's (a track over -1 dBTP plays its
//      master), at the bed's volume there.
//   2. An effect plays at volume 1 at most. The master does not save an effect that is too loud: it limits the whole
//      mix, so the bed drops with it, and a gain over 1 can clip the clip itself.
//   3. Its peak stays PEAK_ROOM dB under the music's loudest peak in the film: an effect is never louder than the music.
//   4. Within 1 to 3 it stands OVER_BED dB over the bed's loudness at its time (hits 8 dB, typing ticks 6 dB), and its
//      peak stands at most NEAR_PEAK_MAX dB over the bed's peak within 1 s of it, as the bed plays (hits 12 dB, ticks
//      10 dB). With band tables (media.gen.ts SOUNDS bands, music.gen.ts bands) it also stands IN_BAND + BAND_ROOM dB
//      over the bed in the band where it stands clearest, among the bands that carry it: the check
//      sound/hit-over-bed hears a hit there (sound_checks.masking). The check sound/effect-too-loud warns past the same
//      numbers, so the block's own level passes it.
//   5. When 1 to 3 leave it under 4 (the bed is loud there), the answer is to duck the bed, never to raise the effect:
//      `hit({ bed })` dips the bed under that hit by default. By loudness the dip is AUTO_DUCK (6 dB) at most
//      (`duck: true` allows 12 dB); by band it is as deep as the band needs, BAND_DUCK_MAX (18 dB) at most: a low
//      stamp on a bed that is loud in the same band. `duck: false` refuses both. `typing` dips it once under
//      the whole run of ticks; `music({ duck: [{ at, depth, length }] })` writes a dip by hand. A duck splits the bed into clips of the same file joined by 2-frame crossfades (both renderers and the
//      detector play plain clips).
//   Without a bed (a film with no music), a hit takes the level that brings its measured loudness to the system's mix
//   target, within rules 1 and 2 (soloVolume); the master then brings the whole mix to the target. With no measured
//   level the fixed volume 0.7 stays; typing ticks with no bed keep 0.5. The block says so in a system with music.
// - `typing` places one tick a key from a typeOn's (or a typed codeBlock's or terminal's) node times; keys on one
//   frame merge into one tick, and each tick ends where the next starts. With no `every`, it keeps the system's
//   effects limit (effectsPerTen in direction.ts): it ticks every n-th key, and says which n it chose.
// - Sound draws nothing. The frame recorder hears nothing: check sound in a real render.
import { DIRECTION, effectsPerTen, mixTarget } from "../../direction";
import { frameOf } from "../context";
import { SOUNDS } from "../../media.gen";
import { MUSIC } from "../../music.gen";
import { appearTimes, bandsAt, gainFor, labelShownAt, peakOf, placePeak, revealedAt, windowLevel } from "../beats";
import type { AudioNode, Block, Node } from "../types";

export type MusicProps = {
  id?: string;
  /** A prepared track: a name that `untell media list` shows (kind "music"). */
  media: string;
  /** Film time the bed starts. Default 0. */
  at?: number;
  /** Film time it ends. Default: the end of the track. Give the film's end. */
  until?: number;
  /** Where in the track to enter, seconds. Use `peakAt` or `align` instead unless you measured the track. */
  clipStart?: number;
  /** @deprecated The old name of `clipStart`; it still works, with a warning. */
  from?: number;
  /** The film time on which the track's drop (or, with `peak: "loudest"`, its loudest bar) lands. The block picks `from`. */
  peakAt?: number;
  /** What `peakAt` places. Default "drop"; a track with no drop that fits falls back to its loudest bar. */
  peak?: "drop" | "loudest";
  /** Put track time `track` on film time `film`. */
  align?: { track: number; film: number };
  /**
   * A track that opens with digital silence (the music map's `lead`): with `from` or `align` inside it, the bed enters
   * where the sound starts. Default true; false keeps the entry as given. With `peakAt` the drop's place wins, and the
   * build says how long the film is silent.
   */
  skipSilence?: boolean;
  /** A linear gain, or "auto" (the default): the gain that brings the bed to the system's mix target. */
  volume?: number | "auto";
  /** Seconds of rise at the start. Default: OPEN_RISE when the bed enters above the track's mean level (not in a one-frame system); 0: a hard start. */
  fadeIn?: number;
  /** The fade under the last card, seconds. Default 1. */
  fadeOut?: number;
  /**
   * Dips in the bed, each `depth` dB down for `length` s from `at` (film time), with 2-frame ramps. Use it where an
   * effect must be heard over a loud bar (the effect rule in the header): the bed makes room, the effect never clips.
   * `hit({ duck: true })` writes such a dip itself.
   */
  duck?: Duck[];
  /**
   * A room tone under the bed, for a system whose direction asks for it (Ma, Title): a prepared sound (`media add
   * --kind music`, a recording of a quiet room) that plays from the bed's start to its end at a fixed low level,
   * ROOM_TONE_LU under the system's mix target, looped when it is shorter than the bed. It fills the gaps of a sparse
   * bed, so the film never falls to digital silence. Its level is not a choice: a room tone is heard only as air.
   * `{ media, until }` lets it run past a bed that stops hard (Title: the room under the held title).
   */
  roomTone?: string | { media: string; until: number };
};

/** How far under the system's whole-mix target a room tone plays, LU. */
export const ROOM_TONE_LU = 24;

/** Where `music` enters the track, from `from`, `align` or `peakAt`. Exported so a scene can build its beat grid first. */
export function musicFrom(p: Pick<MusicProps, "media" | "at" | "until" | "from" | "peakAt" | "peak" | "align" | "skipSilence">): number {
  const info = SOUNDS[p.media];
  if (!info || info.kind !== "music") throw new Error(`music: no prepared track "${p.media}"`);
  const at = p.at ?? 0;
  const ways = [p.from !== undefined, p.peakAt !== undefined, p.align !== undefined].filter(Boolean).length;
  if (ways !== 1) throw new Error(`music ${p.media}: give exactly one of from, peakAt or align`);
  // Digital silence at the track's start: an entry inside it skips to the sound (once said), unless the scene keeps it.
  const lead = MUSIC[p.media]?.lead ?? 0;
  const skip = (from: number) => {
    if (lead < 0.05 || from >= lead - 1e-3 || p.skipSilence === false) return from;
    once(`music ${p.media}: the track opens with ${lead.toFixed(2)} s of digital silence, so the bed enters at ${lead.toFixed(2)} s into the track, where the sound starts. Give skipSilence: false to keep the entry at ${from.toFixed(2)} s.`);
    return lead;
  };
  if (p.from !== undefined) return skip(p.from);
  if (p.align) return skip(p.align.track - (p.align.film - at));
  const map = MUSIC[p.media];
  if (!map) {
    // No music map: the drop cannot be found; peakOf throws with how to make the map.
    peakOf(p.media);
  }
  const placed = placePeak(map!, { peakAt: p.peakAt!, at, until: p.until, peak: p.peak, name: p.media });
  if (!placed) throw new Error(`music ${p.media}: no ${p.peak ?? "drop"} can land at ${p.peakAt} s with the track covering the film; choose another track or moment`);
  // The drop lands on its measured rise, not on a bar line that may be a beat late; the note says which was placed.
  if (placed.note) once(placed.note);
  if (lead >= 0.05 && placed.from < lead - 1e-3) once(`music ${p.media}: the bed enters ${placed.from.toFixed(2)} s into the track, inside its ${lead.toFixed(2)} s of digital silence at the start, so the film is silent for ${(lead - placed.from).toFixed(2)} s from ${at} s. Place the drop later, or start the bed later (at).`);
  return placed.from;
}

const said = new Set<string>();
/** Warns once a run: a scene's music block is built for every size and every check. */
const once = (m: string) => { if (said.has(m)) return; said.add(m); console.warn(m); };

/** The default opening rise, seconds, for a bed that enters above its track's mean level. */
export const OPEN_RISE = 0.15;

export const music: Block<MusicProps> = (p, ctx) => {
  const info = SOUNDS[p.media];
  if (!info || info.kind !== "music") throw new Error(`music: no prepared track "${p.media}"`);
  const at = p.at ?? 0;
  const from = musicFrom(p);
  if (from < 0) throw new Error(`music ${p.media}: the entry is ${from.toFixed(2)} s, before the track starts`);
  const left = info.duration - from;
  const until = p.until ?? at + left;
  if (until - at > left + 1e-6) throw new Error(`music ${p.media}: the track ends ${(until - at - left).toFixed(2)} s before the bed should`);
  let volume: number;
  if (typeof p.volume === "number") volume = p.volume;
  else if (MUSIC[p.media]) volume = gainFor(p.media, from, until - at, mixTarget(ctx.system.id));
  else volume = 0.9; // no map yet: the old starting level
  const map = MUSIC[p.media];
  let fadeIn = p.fadeIn;
  if (fadeIn === undefined && map && !ctx.instant && windowLevel(p.media, from, 1).lufs > map.lufs) fadeIn = OPEN_RISE;
  const node: AudioNode = { id: p.id ?? "music", kind: "audio", src: `${p.media}/${map?.master ?? info.file}`, at, until, from, volume,
    ...(fadeIn !== undefined ? { fadeIn } : {}), fadeOut: p.fadeOut ?? 1 };
  const out: AudioNode[] = [node];
  for (const d of [...(p.duck ?? [])].sort((a, b) => a.at - b.at)) out.push(...duckBed(out, d));
  if (p.roomTone) {
    const rt = typeof p.roomTone === "string" ? { media: p.roomTone, until } : p.roomTone;
    out.push(...roomTone(rt.media, node.id, at, rt.until, mixTarget(ctx.system.id).lufs));
  }
  return out;
};

/** The room tone's nodes: the file from its start, looped back to back from `at` to `until`, at ROOM_TONE_LU under the target. */
export function roomTone(media: string, bedId: string, at: number, until: number, target: number): AudioNode[] {
  const info = SOUNDS[media];
  if (!info || (info.kind !== "music" && info.kind !== "sfx")) throw new Error(`music ${bedId}: no prepared sound "${media}" for the room tone. Add a recording of a quiet room: untell media add <file> --as ${media} --kind music`);
  if (info.lufs === undefined || info.lufs === null) throw new Error(`music ${bedId}: the room tone "${media}" has no measured loudness; measure it: untell media measure ${media}`);
  if (info.duration < 1) throw new Error(`music ${bedId}: the room tone "${media}" is ${info.duration.toFixed(2)} s long; give a recording of 1 s or more`);
  const volume = Math.round(Math.min(1, 10 ** ((target - ROOM_TONE_LU - info.lufs) / 20)) * 1e5) / 1e5;
  const out: AudioNode[] = [];
  const fade = Math.min(0.25, info.duration / 4);
  for (let t = at, k = 0; t < until - 1e-6; t += info.duration - fade, k++) {
    const end = Math.min(until, t + info.duration);
    out.push({ id: `${bedId}-room${k}`, kind: "audio", src: `${media}/${info.file}`, at: t, until: end, from: 0, volume, fadeIn: k ? fade : 0, fadeOut: end < until ? fade : Math.min(1, end - t) });
  }
  return out;
}

/** How far over the bed's loudness at its time an effect sits, dB. */
export const OVER_BED = { hit: 8, tick: 6 };
/**
 * The most an effect's peak stands over the bed's peak near it (within 1 s, the bed as it plays there, ducked or not),
 * dB: OVER_BED plus 4 dB for the crest of a sharp effect. The check sound/effect-too-loud
 * (scripts/inspect/sound_checks.py NEAR_PEAK_MAX) warns past the same numbers; the effect's level never passes them.
 */
export const NEAR_PEAK_MAX = { hit: 12, tick: 10 };
/** How far under the music's loudest peak in the film an effect's peak stays, dB. */
export const PEAK_ROOM = 1;
/** The true-peak limit of the whole mix, dBTP (mixTarget). The effect rule keeps bed + effect under it. */
export const MIX_PEAK = -1;
/**
 * dB added to an effect's table peak before the rule: the table's sample peak can read under the file's true peak
 * (an inter-sample peak, a channel that peaks higher than the mono sum: tick-hi read -0.9 dB, its channels peak at
 * -0.3 dBFS).
 */
export const PEAK_MARGIN = 1;
/** @deprecated The old fixed ceiling; the effect rule (header) replaces it. Kept for scenes that import it. */
export const EFFECT_CEILING = -3;

const db = (g: number) => 20 * Math.log10(Math.max(g, 1e-6));
const lin = (d: number) => 10 ** (d / 20);

/**
 * The segments a bed node plays as, after ducks (music `duck`, hit `duck: true`): the node itself, cut short, and the
 * nodes the ducks added. Keyed by the bed's first node, so every later hit sees the ducked bed.
 */
const SEGMENTS = new WeakMap<object, AudioNode[]>();
const segmentsOf = (n: AudioNode): AudioNode[] => SEGMENTS.get(n) ?? [n];

/**
 * The bed under film time t: its loudness there (LUFS, the bar at that time, with the bed's volume), the music's
 * loudest true peak over all the time the bed plays (dBTP, with its volume), its true peak around t (`near`, the bars
 * within 0.25 s, with the volume there, a duck included), its true peak within 1 s of t as it plays (`near1`: every
 * clip of the bed in that second, each at its own volume; rule 4 reads it, as the check does), and its bands at t
 * (`bands`: bandsAt, with the volume there; absent when the map has none). The bar
 * peaks are the master's (a track that peaks over -1 dBTP plays its master, music_map.py caps the bar peaks at the
 * master's). Null when no bed with a map plays at t.
 */
export function bedLevel(bed: readonly Node[] | undefined, t: number): { lufs: number; peak: number; near: number; near1: number; bands?: number[] } | null {
  for (const n0 of bed ?? []) {
    if (n0.kind !== "audio") continue;
    for (const n of segmentsOf(n0)) {
      const media = n.src.split("/")[0]!;
      const map = MUSIC[media];
      if (!map || t < n.at || (n.until !== undefined && t > n.until)) continue;
      // Inside a duck's ramps two segments overlap: take the one that plays louder there.
      const here = segmentsOf(n0).filter((m) => t >= m.at && (m.until === undefined || t <= m.until));
      const loud = here.reduce((a, m) => ((m.volume ?? 1) > (a.volume ?? 1) ? m : a), n);
      const from = loud.from ?? 0, g = db(typeof loud.volume === "number" ? loud.volume : 1);
      const local = windowLevel(media, from + (t - loud.at) - 0.25, 0.5);
      const all = windowLevel(media, (n0.from ?? 0), Math.max(0.5, (segmentsOf(n0).reduce((u, m) => Math.max(u, m.until ?? m.at + map.duration), 0)) - n0.at));
      // Each clip of the bed within 1 s of t, at its own volume: a hit's short dip leaves the bed whole around it.
      let near1 = -Infinity;
      for (const m of segmentsOf(n0)) {
        const a = Math.max(t - 1, m.at), b = Math.min(t + 1, m.until ?? m.at + map.duration);
        if (b > a) near1 = Math.max(near1, windowLevel(media, (m.from ?? 0) + (a - m.at), b - a).truePeak + db(typeof m.volume === "number" ? m.volume : 1));
      }
      const row = bandsAt(media, from + (t - loud.at));
      return { lufs: local.lufs + g, peak: all.truePeak + db(typeof n0.volume === "number" ? n0.volume : 1), near: local.truePeak + g, near1: Math.max(near1, local.truePeak + g),
        ...(row ? { bands: row.map((v) => v + g) } : {}) };
    }
  }
  // The bed is silent at t (it stopped, as Title's does on its impact, or has not entered): the music's level over the part
  // it plays is still the film's reference, so an effect there stays under the music's loudest peak. Nothing plays near
  // it (`near` -Infinity).
  for (const n0 of bed ?? []) {
    if (n0.kind !== "audio") continue;
    const media = n0.src.split("/")[0]!, map = MUSIC[media];
    if (!map) continue;
    const segs = segmentsOf(n0), end = segs.reduce((u, m) => Math.max(u, m.until ?? m.at + map.duration), 0);
    const g = db(typeof n0.volume === "number" ? n0.volume : 1);
    const all = windowLevel(media, n0.from ?? 0, Math.max(0.5, end - n0.at));
    return { lufs: all.lufs + g, peak: all.truePeak + g, near: -Infinity, near1: -Infinity };
  }
  return null;
}

/** How far a hit stands over the bed in a band that carries it, for the check to hear it (sound_checks OVER_DB), dB. */
export const IN_BAND = 6;
/**
 * The room the block keeps over IN_BAND, dB: the table holds whole dB, a frame each 0.025 s, so the frame it reads sits
 * up to 0.0125 s from the hit's peak, and the block plans on the louder of the two frames on either side. Over 6 beds
 * and 26 effects at two times, 2 dB left two hits of 312 under the check's 6 dB, both where no dip up to
 * BAND_DUCK_MAX can clear the bed (a quiet click, a tick on a hi-hat), and the build says so for both.
 */
export const BAND_ROOM = 2;
/** A band carries the hit when it holds the hit's energy within this many dB of its strongest band (sound_checks CARRY_DB). */
const CARRY_DB = 10;
/**
 * The deepest duck a hit's band may ask for, dB. A low hit (a stamp, a thump) on a bed that is loud in the same band
 * is heard only when the bed dips under it there; its level cannot rise (rule 3), so the dip goes deeper, while the hit sounds loudest (DIP_HOLD, DIP_RELEASE).
 */
export const BAND_DUCK_MAX = 18;

/**
 * The effect level of one effect at time t: the rule in the header. Returns the volume, whether it stands `over` dB
 * over the bed within the rule (`heard`), the duck (dB) the bed needs there for that (0 when none), and, when the
 * effect and the bed's map have band tables, the duck the band needs (`bandDuckDb`, see the header, rule 5).
 */
/**
 * A hit's volume with no bed: the gain that brings the effect's measured loudness (its loudest 400 ms) to the system's
 * mix target, at volume 1 at most (rule 2) and with its true peak under MIX_PEAK (rule 1). A click under the target at
 * volume 1 plays at 1, and the master brings the mix the rest of the way. Null when the effect has no measured level.
 */
export function soloVolume(media: string, system: string): number | null {
  const info = SOUNDS[media];
  if (!info || (info.lufs === undefined && info.peakDb === undefined)) return null;
  const peak = (info.peakDb ?? (info.lufs ?? -30) + 14) + PEAK_MARGIN;
  const lufs = info.lufs === undefined || info.lufs <= -60 ? peak - PEAK_MARGIN - 14 : info.lufs;
  const gain = Math.min(mixTarget(system).lufs - lufs, MIX_PEAK - peak, 0);
  return Math.round(10 ** (gain / 20) * 1000) / 1000;
}

export function effectLevel(media: string, bed: readonly Node[] | undefined, t: number, over: number): { volume: number; heard: boolean; duckDb: number; bandDuckDb?: number } | null {
  const info = SOUNDS[media], b = bedLevel(bed, t);
  if (!info || !b) return null;
  // A click too short to measure (lufs -70) has no loudness: a click peaks about 14 dB over its loudness.
  const peak = (info.peakDb ?? (info.lufs ?? -30) + 14) + PEAK_MARGIN;
  const lufs = info.lufs === undefined || info.lufs <= -60 ? peak - PEAK_MARGIN - 14 : info.lufs;
  // The band where the effect stands clearest over the bed, among the bands that carry it, at volume 1 and a duck of d:
  // the check's masking measure (sound_checks.masking).
  const hb = info.bands, bb = b.bands;
  const carry = hb && bb ? hb.map((v, k) => (v >= Math.max(...hb) - CARRY_DB ? k : -1)).filter((k) => k >= 0) : [];
  const inBand = (d: number) => Math.max(...carry.map((k) => hb![k]! - (bb![k]! - d)));
  /** The gain for a bed ducked by d dB: under the sum rule, the music's loudest peak and 1; and the gain it wants. */
  const at = (d: number) => {
    const room = lin(MIX_PEAK) - lin(b.near - d); // what is left under the mix's peak limit, as an amplitude
    const sum = room > 1e-6 ? db(room) - peak : -120;
    const cap = Math.min(sum, b.peak - PEAK_ROOM - peak, 0);
    // The loudness target (OVER_BED), and, with band tables, at least IN_BAND + BAND_ROOM over the bed in its band.
    const loud = b.lufs - d + over - lufs, band = carry.length ? IN_BAND + BAND_ROOM - inBand(d) : -Infinity;
    return { gain: Math.min(loud, cap), loud, band, both: Math.min(Math.max(loud, band), cap) };
  };
  // Rule 4's ceiling: the peak stays at most NEAR_PEAK_MAX over the bed's peak within 1 s, as it plays (the check
  // measures the same second; a hit's short dip leaves most of it whole).
  const ceiling = b.near1 === -Infinity ? Infinity : b.near1 + (over <= OVER_BED.tick ? NEAR_PEAK_MAX.tick : NEAR_PEAK_MAX.hit) - peak;
  const g0 = at(0);
  let duckDb = 0;
  if (g0.gain < g0.loud - 0.5 && b.near !== -Infinity) {
    duckDb = 12;
    for (let d = 1; d <= 12; d++) { const x = at(d); if (x.gain >= x.loud - 0.5) { duckDb = d; break; } }
  }
  // The band: the smallest dip that lets the effect stand IN_BAND + BAND_ROOM over the bed in its band, within every cap.
  let bandDuckDb: number | undefined;
  const bandOk = (d: number) => { const x = at(d); return Math.min(x.both, ceiling) >= x.band - 0.1; }; // 0.1 dB: a dip's volume is rounded to 3 decimals
  // A need that no dip up to BAND_DUCK_MAX meets is left to the loudness duck: a dip that cannot reach it gains nothing.
  if (carry.length && b.near !== -Infinity)
    for (let d = 0; d <= BAND_DUCK_MAX; d++) if (bandOk(d)) { bandDuckDb = d; break; }
  const heard = g0.gain >= g0.loud - 0.5 && (bandDuckDb === undefined || bandDuckDb === 0);
  return { volume: Math.round(lin(Math.min(g0.both, ceiling)) * 1000) / 1000, heard, duckDb, ...(bandDuckDb !== undefined ? { bandDuckDb } : {}) };
}

/** The volume of an effect against the bed at time t, by the rule in the header. Null when the bed's level is not known. */
export function effectVolume(media: string, bed: readonly Node[] | undefined, t: number, over: number): number | null {
  return effectLevel(media, bed, t, over)?.volume ?? null;
}

/**
 * A dip in the bed: from `at` for `length` seconds, `depth` dB down, with RAMP ramps inside it. `release`: the ramp
 * back up, seconds (default RAMP); it starts where the ramp out of a dip of the same length would start.
 */
export type Duck = { at: number; depth: number; length: number; release?: number };
/** The deepest dip a hit writes by default, dB (`duck: true` asks for up to 12). */
export const AUTO_DUCK = 6;
/** The ramp into and out of a duck, seconds (two frames). */
export const RAMP = 2 / 30;
/**
 * A hit's dip: full depth from DIP_HOLD before its peak to DIP_HOLD after it (the check reads the 0.1 s at the peak),
 * in over RAMP and back up over DIP_RELEASE. The bed is down only while the hit sounds loudest, and it comes back
 * slowly, so a deep dip reads as the hit's weight, not as the bed cutting out (pumping).
 */
export const DIP_HOLD = 2 / 30;
export const DIP_RELEASE = 0.2;
const onFrame = (t: number) => Math.round(t * 30) / 30;

/**
 * Splits the bed segment that covers a duck into three clips of the same file (before, the dip, after), joined by
 * RAMP crossfades of the same samples, so the gain ramps down and back with no click. Both renderers play plain clips,
 * and the detector mixes them as it mixes any clip. Changes `seg` in place (it ends at the dip) and returns the two
 * clips it adds. A duck that does not fit in the segment (with its ramps and the segment's fades) returns null.
 */
function split(seg: AudioNode, d: Duck, k: number): AudioNode[] | null {
  const s = onFrame(d.at), e = onFrame(d.at + d.length), rel = Math.max(RAMP, d.release ?? RAMP);
  const u = seg.until;
  if (s - seg.at < RAMP + (seg.fadeIn ?? 0) || (u !== undefined && u - (e - RAMP) < rel + RAMP + (seg.fadeOut ?? 0)) || e - s < 2 * RAMP) return null;
  const from = seg.from ?? 0, vol = seg.volume ?? 1;
  const dip: AudioNode = { id: `${seg.id}-duck${k}`, kind: "audio", src: seg.src, at: s - RAMP, until: e - RAMP + rel, from: from + (s - RAMP - seg.at), volume: Math.round(vol * lin(-d.depth) * 1000) / 1000, fadeIn: RAMP, fadeOut: rel };
  const rest: AudioNode = { id: `${seg.id}-after${k}`, kind: "audio", src: seg.src, at: e - RAMP, ...(u !== undefined ? { until: u } : {}), from: from + (e - RAMP - seg.at), volume: vol, fadeIn: rel,
    ...(seg.fadeOut !== undefined ? { fadeOut: seg.fadeOut } : {}) };
  seg.until = s;
  seg.fadeOut = RAMP;
  return [dip, rest];
}

/**
 * Widens the dip of the bed that a new duck meets, so it covers both (from the earlier start to the later end, at the
 * deeper depth), when the clips before and after it keep their ramps. Returns false when no dip meets it or it does
 * not fit. The bed's clips keep one map of film time to track time, so each moved edge keeps its place in the track.
 */
function widenDip(n0: Node, segs: AudioNode[], d: Duck): boolean {
  const base = n0.kind === "audio" ? n0.volume ?? 1 : 1;
  // The new duck's full depth runs from s2 to f2 (its ramp out starts at f2).
  const s2 = onFrame(d.at), f2 = onFrame(d.at + d.length) - RAMP;
  // A dip meets the new duck when the two would overlap with their ramps: the new one could not ramp back up and down.
  const rel2 = Math.max(RAMP, d.release ?? RAMP);
  const dip = segs.find((m) => (m.volume ?? 1) < base - 1e-9 && m.at <= f2 + rel2 + RAMP && (m.until ?? Infinity) >= s2 - 2 * RAMP);
  if (!dip || dip.until === undefined) return false;
  const rel = dip.fadeOut ?? RAMP;
  const before = segs.find((m) => m !== dip && m.until !== undefined && Math.abs(m.until - (dip.at + RAMP)) < 1e-6);
  const after = segs.find((m) => m !== dip && Math.abs(m.at - (dip.until! - rel)) < 1e-6);
  if (!before || !after) return false;
  const s = Math.min(dip.at + RAMP, s2), f = Math.max(after.at, f2);
  if (s - before.at < RAMP + (before.fadeIn ?? 0) || (after.until !== undefined && after.until - f < rel + RAMP + (after.fadeOut ?? 0))) return false;
  const track = (t: number) => (before.from ?? 0) + (t - before.at);
  const depth = Math.max(-db((dip.volume ?? 1) / base), d.depth);
  before.until = s;
  Object.assign(dip, { at: s - RAMP, until: f + rel, from: track(s - RAMP), volume: Math.round(base * lin(-depth) * 1000) / 1000 });
  Object.assign(after, { at: f, from: track(f) });
  return true;
}

/**
 * A shallower duck that ends where a deeper dip begins (or inside its ramp): a clip at the duck's depth from the duck's
 * start to the dip, between the clip before and the dip, each join a 2-frame crossfade of the same samples. Null when
 * it does not apply or does not fit.
 */
function stepInto(n0: Node, segs: AudioNode[], d: Duck): AudioNode | null {
  const base = n0.kind === "audio" ? n0.volume ?? 1 : 1;
  const s2 = onFrame(d.at), f2 = onFrame(d.at + d.length) - RAMP;
  const vol = Math.round(base * lin(-d.depth) * 1000) / 1000;
  const dip = segs.find((m) => (m.volume ?? 1) < vol - 1e-9 && m.at + RAMP > s2 && m.at <= f2 + Math.max(RAMP, d.release ?? RAMP) + RAMP);
  if (!dip) return null;
  const before = segs.find((m) => m !== dip && m.until !== undefined && Math.abs(m.until - (dip.at + RAMP)) < 1e-6);
  if (!before || s2 - before.at < RAMP + (before.fadeIn ?? 0) || dip.at < s2) return null;
  const track = (t: number) => (before.from ?? 0) + (t - before.at);
  before.until = s2;
  return { id: `${before.id}-step${segs.length}`, kind: "audio", src: before.src, at: s2 - RAMP, until: dip.at + RAMP, from: track(s2 - RAMP), volume: vol, fadeIn: RAMP, fadeOut: RAMP };
}

/** Ducks a bed (the music block's nodes) at `d`: the segment that plays then splits. Returns the clips it adds. */
export function duckBed(bed: readonly Node[], d: Duck, by?: string): AudioNode[] {
  for (const n0 of bed) {
    if (n0.kind !== "audio") continue;
    const segs = segmentsOf(n0);
    const seg = segs.find((m) => m.volume === n0.volume && d.at >= m.at && (m.until === undefined || d.at + d.length <= m.until));
    const added = seg ? split(seg, d, segs.length) : null;
    if (added) {
      SEGMENTS.set(n0, [...segs, ...added].sort((a, b) => a.at - b.at));
      return added;
    }
    // A duck that meets a dip already there (two hits closer than a dip and its ramps). A shallower duck just before
    // a deeper dip becomes a step down into it (a clip at its own depth, joined by a 2-frame crossfade), so the deep
    // part stays as short as before. Otherwise the one dip grows to cover both, as deep as the deeper of the two; the
    // clips it changes are already in the scene, so it adds none.
    const stepped = stepInto(n0, segs, d);
    if (stepped) {
      SEGMENTS.set(n0, [...segs, stepped].sort((a, b) => a.at - b.at));
      return [stepped];
    }
    if (widenDip(n0, segs, d)) return [];
    // Named by the bed, as every block warning is, so the checks find the block that said it.
    console.warn(`music ${n0.id}: the duck at ${d.at.toFixed(2)} s${by ? ` for ${by}` : ""} does not fit in the bed (it meets another dip, a fade or the bed's end); it is not applied${by ? `. Move ${by} away from the dip or fade it meets, or give it duck: false` : ""}`);
    return [];
  }
  console.warn(`music: the duck at ${d.at.toFixed(2)} s${by ? ` for ${by}` : ""} finds no bed clip; it is not applied`);
  return [];
}

export type HitProps = {
  id: string;
  /** A prepared sound effect (kind "sfx"). */
  media: string;
  /** The picture's moment: the cut, the landing, the panel's fastest frame. The peak plays on frameOf(at), the first frame that shows it. */
  at?: number;
  /**
   * Instead of `at`: land on the frame where the picture changes for block `id`. For a block with a label (callout,
   * dimension, formula) that is the frame its label shows (opacity 0.5, as the hit check counts it), not the end of
   * its fade or its 2.5 px dot. For any other block, the frame where node `id` (or every `id-...` node) has fully
   * arrived: the end of its entrance. A later move or turn of the node is not its arrival; to land on one, give
   * `after` at that move's time.
   */
  on?: { nodes: readonly Node[]; id: string; after?: number };
  /** The music block's nodes. With them, the level follows the bed at the hit's time (see the header). */
  bed?: readonly Node[];
  /** A linear gain. Default: set against `bed`; with no bed, the gain that brings the effect to the system's mix target (soloVolume, 1 at most). */
  volume?: number;
  /**
   * A part of the file, [from, until] in seconds into the file (not film time), so a file with a second transient or a
   * long tail needs no cut by hand. Default: the whole file, or its first attack when the file has several (SOUNDS
   * attacks, measured by media add). The part's own peak lands on the frame the picture shows:
   * the file's peak when it is in the part, else the part's start.
   */
  part?: [number, number];
  /**
   * Duck the bed under this hit when the bed is too loud for the hit to be heard within the effect rule (header): a
   * dip of the depth it needs from DIP_HOLD before the hit's peak to DIP_HOLD after it, in over 2 frames and back up
   * over DIP_RELEASE (by loudness 6 dB at most, 12 with
   * `duck: true`; by the band where the bed covers the hit, BAND_DUCK_MAX at most). The hit's nodes then
   * hold the bed's added clips too: put them in the scene. Default: true when `bed` is given (a hit that cannot be
   * heard is no hit); false keeps the bed whole, and the build says the hit is masked.
   */
  duck?: boolean;
};

export const hit: Block<HitProps> = (p, ctx) => {
  const info = SOUNDS[p.media];
  if (!info || info.kind !== "sfx") throw new Error(`hit: no prepared sound effect "${p.media}"`);
  if ((p.at === undefined) === (p.on === undefined)) throw new Error(`hit ${p.id}: give exactly one of at or on`);
  // The picture shows on frameOf(at) (context.ts); with `on`, revealedAt gives that frame itself. The peak plays on
  // that frame.
  const shownOn = p.at !== undefined ? frameOf(p.at)
    : Math.round((labelShownAt(ctx.system, p.on!.nodes, p.on!.id, p.on!.after) ?? revealedAt(ctx.system, p.on!.nodes, p.on!.id, p.on!.after)) * 30);
  // An effect with several attacks (a flam, a door that slams twice) reads as more than one hit: by default the hit
  // plays its first attack, up to 20 ms before the second (media add measures them: SOUNDS attacks).
  const firstOnly = !p.part && info.attacks && info.attacks.length > 1 ? Math.max(info.attacks[0]! + 0.05, info.attacks[1]! - 0.02) : undefined;
  const f0 = p.part?.[0] ?? 0, f1 = Math.min(info.duration, p.part?.[1] ?? firstOnly ?? info.duration);
  if (!(f1 > f0)) throw new Error(`hit ${p.id}: the part ${f0}-${f1} s of "${p.media}" is empty. Give part: [from, until] inside the file (0-${info.duration} s)`);
  const peakIn = info.peak >= f0 && info.peak < f1 ? info.peak - f0 : 0; // the part's peak, from the part's start
  const start = shownOn / 30 - peakIn;
  const peakT = shownOn / 30;
  let volume = p.volume;
  const ducks: Node[] = [];
  if (p.duck && !p.bed) throw new Error(`hit ${p.id}: duck needs bed (the music block's nodes)`);
  const duck = p.duck ?? (!!p.bed && p.volume === undefined);
  if (volume === undefined || p.duck) {
    let lv = effectLevel(p.media, p.bed, peakT, OVER_BED.hit);
    // Both tables have bands and no dip up to BAND_DUCK_MAX lets the hit stand clear in its band: say so.
    if (duck && lv && lv.bandDuckDb === undefined && SOUNDS[p.media]?.bands && bedLevel(p.bed, peakT)?.bands)
      once(`hit ${p.id}: the bed at ${peakT.toFixed(2)} s covers "${p.media}" in every band that carries it by more than a dip of ${BAND_DUCK_MAX} dB can clear, within the effect rule. Use an effect with energy where the bed is weak (higher, or louder in its file), or place the hit where the bed is quieter.`);
    // The duck by loudness: at most AUTO_DUCK dB by default (a click is heard in its own band long before it passes
    // the bed's loudness), 12 with `duck: true`. The duck by band, when the tables have bands: as deep as the band
    // where the hit stands clearest needs, up to BAND_DUCK_MAX (a low stamp on a bed loud in the same band).
    const depth = lv && !lv.heard ? Math.max(lv.duckDb > 0 ? (p.duck ? lv.duckDb : Math.min(AUTO_DUCK, lv.duckDb)) : 0, lv.bandDuckDb ?? 0) : 0;
    if (lv && duck && depth > 0) {
      // The bed makes room: a dip round the peak, then the level again over the ducked bed.
      ducks.push(...duckBed(p.bed!, { at: peakT - DIP_HOLD, depth, length: 2 * DIP_HOLD + RAMP, release: DIP_RELEASE }, `hit ${p.id}`));
      lv = effectLevel(p.media, p.bed, peakT, OVER_BED.hit);
    } else if (lv && !lv.heard && !duck) {
      once(`hit ${p.id}: the bed at ${peakT.toFixed(2)} s is too loud for this hit to stand ${OVER_BED.hit} dB over it within the effect rule (the hit's peak plus the bed's peak stay at or under ${MIX_PEAK} dBTP, volume at most 1). Leave duck at its default (true), so the bed dips ${lv.duckDb} dB under it; do not raise the volume.`);
    }
    if (volume === undefined) volume = lv?.volume ?? (p.bed ? undefined : soloVolume(p.media, ctx.system.id)) ?? 0.7;
    // A system with no music (Raw: plain clicks, near silence) has no bed to give: the system's level is the design.
    if (!p.bed && DIRECTION[ctx.system.id]?.mix.music !== "none") console.warn(`hit ${p.id}: no bed given, so its volume (${volume.toFixed(2)}) is set to the system's level, not to the music. Give bed: the music block's nodes, so the level follows the music`);
  }
  // A part whose peak comes before the film starts loses its lead-in: trim the file instead.
  const from = f0 + Math.max(0, -start);
  // Nothing of the part is left after frame 0 (its peak sits at its very end): no clip, and the block says so.
  if (f1 - from < MIN_CLIP) {
    once(`hit ${p.id}: the part of "${p.media}" ends at its peak, and its peak lands on frame 0, so nothing of it plays. Give at a time after 0 s, or a part with sound after its peak.`);
    return ducks;
  }
  const out: Node[] = [{ id: p.id, kind: "audio", src: `${p.media}/${info.file}`, at: Math.max(0, start), until: Math.max(0, start) + f1 - from,
    ...(from ? { from } : {}), volume }, ...ducks];
  return out;
};

export type TypingProps = {
  id: string;
  /** A short tick or click (kind "sfx"). */
  media: string;
  /**
   * The scene's nodes and the id of what types: a typeOn, a typed codeBlock (or one of its lines), or a terminal (its
   * commands, not its prompt or output). One tick each time a typed character appears; a wrong id throws with the ids
   * that type.
   */
  nodes: readonly Node[];
  of: string;
  /** Tick every n-th key only. Default: the smallest n that keeps the system's effects limit (effectsPerTen). */
  every?: number;
  /** The music block's nodes. With them, each tick's level follows the bed (see the header). */
  bed?: readonly Node[];
  /** A linear gain. Default: set against `bed`; with no bed, 0.5. */
  volume?: number;
  /**
   * When the bed is too loud for the ticks to be heard within the effect rule: one dip of the bed under the whole run
   * of ticks (at most 6 dB), not one a key. Default true with a bed; false keeps the bed whole and says so.
   */
  duck?: boolean;
};

/** The most effects in any 10 s window of a list of times. */
const most = (ts: number[]) => ts.reduce((m, t, i) => Math.max(m, ts.slice(i).filter((u) => u < t + 10 - 1e-9).length), 0);

const quietly = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };

/** One tick a key under a typeOn. Each tick's peak lands on the frame its character shows (as `hit`). */
/**
 * The nodes a `typing` block ticks under. For a terminal (`of` is its id) that is its typed commands
 * (`<id>-r<n>-cmd-c<k>`), never its prompt or its output: before, `of` on a terminal took the waiting prompt and put a
 * tick at -0.03 s. Otherwise the nodes of `of`, as before. An `of` that names no typed character throws with the ids
 * that type (each typed run, one character a node).
 */
export function typedKeys(nodes: readonly Node[], of: string, who: string): readonly Node[] {
  const mine = nodes.filter((n) => n.id === of || n.id.startsWith(`${of}-`));
  const cmd = mine.filter((n) => n.kind === "text" && /-r\d+-cmd-c\d+$/.test(n.id));
  if (cmd.length) return cmd;
  // A typed character: a one-character text node; its run is its id without the last part.
  const one = (n: Node) => n.kind === "text" && [...(n as { text: string }).text].length === 1;
  if (mine.some(one)) return mine;
  const runs = [...new Set(nodes.filter(one).map((n) => n.id.replace(/-c?\d+$/, "")))];
  throw new Error(`${who}: of "${of}" ${mine.length ? "has no typed characters (a prompt, an output line or a label does not type)" : "names no node"}. `
    + (runs.length ? `Give the id of what types: ${runs.slice(0, 16).join(", ")}${runs.length > 16 ? ", ..." : ""} (a terminal's id types its commands).` : "No node in these nodes types: give typing the nodes of a typeOn, a typed codeBlock or a terminal."));
}

export const typing: Block<TypingProps> = (p, ctx) => {
  const keys = appearTimes(ctx.system, typedKeys(p.nodes, p.of, `typing ${p.id}`), p.of);
  const limit = effectsPerTen(ctx.system.id);
  const pick = (n: number) => keys.filter((_, i) => i % n === 0);
  let every = p.every;
  if (every === undefined) {
    every = 1;
    while (every < keys.length && most(pick(every)) > limit) every++;
    if (limit === 0) return (console.warn(`typing ${p.id}: ${ctx.system.name} allows no effects, so there are no ticks`), []);
    // Its own choice inside the system's limit is valid, so it says nothing: a warning here became a finding that the
    // scene could only silence by writing the same `every` by hand (an agent's Manual film).
  } else if (most(pick(every)) > limit) console.warn(`typing ${p.id}: every ${every} gives ${most(pick(every))} ticks in 10 s; ${ctx.system.name} allows ${limit}`);
  const times = pick(every);
  if (!p.bed && p.volume === undefined) console.warn(`typing ${p.id}: no bed given, so each tick's volume is a fixed 0.5. Give bed: the music block's nodes`);
  // `appearTimes` gives the frame each key shows on: the tick's picture time is the frame before it (frameOf).
  // The ticks are one texture: when the bed hides them, one dip under the whole run (the effect rule, header).
  const added: AudioNode[] = [];
  if (p.bed && p.volume === undefined && times.length && p.duck !== false) {
    const need = Math.max(0, ...times.map((t) => effectLevel(p.media, p.bed, t, OVER_BED.tick)?.duckDb ?? 0));
    if (need > 0) added.push(...duckBed(p.bed, { at: times[0]! - 0.1, depth: Math.min(6, need), length: times[times.length - 1]! - times[0]! + 0.3 }, `typing ${p.id}`));
  } else if (p.bed && p.volume === undefined && p.duck === false && times.some((t) => !(effectLevel(p.media, p.bed, t, OVER_BED.tick)?.heard ?? true)))
    once(`typing ${p.id}: the bed hides these ticks within the effect rule; leave duck at its default (true) so the bed dips under the run`);
  const ticks = quietly(() => times.flatMap((t, i) => hit({ id: `${p.id}-${i}`, media: p.media, at: t - 1 / 30 + 1e-6, bed: p.bed, duck: false,
    volume: p.volume ?? (p.bed ? effectVolume(p.media, p.bed, t, OVER_BED.tick) ?? 0.5 : 0.5) }, ctx))) as AudioNode[];
  // Each tick stops where the next one starts: one key sound at a time, as on a real keyboard, and the
  // players never stack many clips (the Remotion player mounts at most five at once).
  // Two keys whose ticks start on one time (keys at 0 s and on the next frame: each tick's lead-in before frame 0 is
  // cut, so both start at 0) would leave the first a clip of no length: it is dropped, and the later key plays.
  // Before: a key at 0 s made a clip of zero duration and stopped the build.
  const cut = ticks.map((n, i) => (ticks[i + 1] && n.until! > ticks[i + 1]!.at ? { ...n, until: ticks[i + 1]!.at } : n));
  return [...cut.filter((n) => n.until! - n.at >= MIN_CLIP), ...added];
};

/** The shortest sound clip a block writes, s: half a frame. A shorter one is no sound, and both renderers skip it. */
export const MIN_CLIP = 1 / 60;
