// Item 17: a film built with the sound blocks' defaults lands within 1 LU of the system's mix target before it is
// mastered, and no effect is louder than the music's peak. The test mixes the nodes with ffmpeg as the renderers
// play them (trim, volume, fades, delay, a plain sum) and measures the integrated loudness (ITU-R BS.1770).
// It uses two real tracks of the repository (assets/media). It is skipped where ffmpeg or the tracks are missing.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mixTarget } from "../../direction";
import { SOUNDS } from "../../media.gen";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import type { AudioNode, Node } from "../types";
import { BLOCKS } from ".";
import { bedLevel, PEAK_ROOM, soloVolume } from "./sound";

const MEDIA = resolve(import.meta.dir, "../../../../assets/media");
const ffmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const ctxOf = (id: string) => { const s = SYSTEMS.find((x) => x.id === id)!; return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5); };
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };

/** The integrated loudness of the nodes mixed as the renderers play them, for a film of `seconds`. */
function mixLufs(nodes: AudioNode[], seconds: number): number {
  const args = ["-hide_banner", "-nostats"];
  const chains: string[] = [];
  nodes.forEach((n, i) => {
    const len = (n.until ?? seconds) - n.at;
    args.push("-ss", String(n.from ?? 0), "-t", String(len), "-i", join(MEDIA, n.src));
    const f = [`volume=${n.volume ?? 1}`];
    if (n.fadeIn) f.push(`afade=t=in:d=${n.fadeIn}`);
    if (n.fadeOut) f.push(`afade=t=out:st=${Math.max(0, len - n.fadeOut)}:d=${n.fadeOut}`);
    f.push(`adelay=${Math.round(n.at * 1000)}:all=1`, "aresample=48000", "aformat=channel_layouts=stereo");
    chains.push(`[${i}:a]${f.join(",")}[a${i}]`);
  });
  const mix = `${chains.join(";")};${nodes.map((_, i) => `[a${i}]`).join("")}amix=inputs=${nodes.length}:normalize=0:duration=longest,atrim=0:${seconds},ebur128`;
  const r = spawnSync("ffmpeg", [...args, "-filter_complex", mix, "-f", "null", "-"], { encoding: "utf8" });
  const m = [...(r.stderr ?? "").matchAll(/I:\s+(-?\d+(?:\.\d+)?) LUFS/g)].pop();
  if (!m) throw new Error(`ffmpeg gave no loudness: ${(r.stderr ?? "").slice(-400)}`);
  return Number(m[1]);
}

const CASES = [
  { system: "manual", track: "manual-music-6", tick: "manual-tick" },
  { system: "riso", track: "riso-music-2", tick: "manual-tick" },
];
const have = (c: (typeof CASES)[number]) => existsSync(join(MEDIA, c.track)) && SOUNDS[c.track] && SOUNDS[c.tick];

describe("item 17: the defaults land on the system's mix target before the master", () => {
  for (const c of CASES) {
    test.skipIf(!ffmpeg || !have(c))(`${c.system} on ${c.track}: within 1 LU, and no tick over the music's peak`, () => {
      const ctx = ctxOf(c.system);
      const seconds = 14;
      const bed = BLOCKS.music({ media: c.track, peakAt: 9, until: seconds }, ctx);
      // Typed text from 2 s: one key every 3 frames for 1.5 s, then ticks under it with the defaults.
      const keys: Node[] = Array.from({ length: 16 }, (_, i) => ({ id: `cmd-c${i}`, kind: "text", x: 0, y: 0, text: "x", role: "body", color: "ink",
        tracks: { opacity: [{ t: 0, v: 0 }, { t: 2 + i * 0.1, v: 0 }, { t: 2 + i * 0.1 + 0.01, v: 1, curve: "step" }] } }) as Node);
      const ticks = quiet(() => BLOCKS.typing({ id: "ticks", media: c.tick, nodes: keys, of: "cmd", bed }, ctx));
      const hits = quiet(() => BLOCKS.hit({ id: "land", media: c.tick, at: 9, bed }, ctx));
      const nodes = [...bed, ...ticks, ...hits] as AudioNode[];
      const lufs = mixLufs(nodes, seconds);
      if (process.env.SHOW) console.log(c.system, c.track, "mix", lufs, "target", mixTarget(c.system).lufs, "bed volume", (bed[0] as AudioNode).volume);
      expect(Math.abs(lufs - mixTarget(c.system).lufs)).toBeLessThanOrEqual(1);
      // Each effect's peak stays PEAK_ROOM dB under the music's loudest peak in the film.
      const info = SOUNDS[c.tick]!;
      // The effects only: a duck adds clips of the bed to typing's and hit's nodes.
      for (const n of ([...ticks, ...hits] as AudioNode[]).filter((x) => x.src.startsWith(`${c.tick}/`))) {
        const b = bedLevel(bed, n.at + info.peak)!;
        expect((info.peakDb ?? info.lufs! + 14) + 20 * Math.log10(n.volume!)).toBeLessThanOrEqual(b.peak - PEAK_ROOM + 0.01);
      }
    }, 30000);
  }
  test("typing keeps the system's effects limit when no `every` is given, with no warning for its own choice", () => {
    const ctx = ctxOf("manual");
    const keys: Node[] = Array.from({ length: 25 }, (_, i) => ({ id: `c-c${i}`, kind: "text", x: 0, y: 0, text: "x", role: "body", color: "ink",
      tracks: { opacity: [{ t: 0, v: 0 }, { t: 1 + i * 0.08, v: 0 }, { t: 1 + i * 0.08 + 0.01, v: 1, curve: "step" }] } }) as Node);
    const said: string[] = [];
    const w = console.warn; console.warn = (m: string) => said.push(m);
    const ticks = BLOCKS.typing({ id: "t", media: "manual-tick", nodes: keys, of: "c" }, ctx);
    console.warn = w;
    expect(ticks.length).toBeLessThanOrEqual(6); // Manual: at most 6 effects in 10 s
    expect(ticks.length).toBeGreaterThan(0);
    // Its own valid choice is not a warning (before, the scene had to write the same `every` to silence it).
    expect(said.filter((m) => /every \d+th key|Give every/.test(m))).toEqual([]);
  });
});

describe("an effect never clips, whatever the bed's level", () => {
  // A bed at full level (Mark's reel sets 0.95): the music's peak is near 0 dBFS, so "under the music's peak" alone
  // let a hit peak at +0.3 dBFS. The ceiling keeps every effect's planned peak at EFFECT_CEILING dBFS or under.
  test("a hit on a loud bed peaks at the ceiling or under", async () => {
    const { EFFECT_CEILING, effectVolume } = await import("./sound");
    const s = SYSTEMS.find((x) => x.id === "mark")!;
    const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
    const bed = BLOCKS.music({ media: "mark-music-4", from: 30, at: 0, until: 8, volume: 0.95 }, ctx);
    for (const fx of ["mark-pop", "mark-impact"]) {
      const info = SOUNDS[fx];
      if (!info?.lufs) continue;
      const v = effectVolume(fx, bed, 2, 8);
      expect(v).not.toBeNull();
      const peak = (info.peakDb ?? info.lufs + 14) + 20 * Math.log10(v!);
      expect(peak).toBeLessThanOrEqual(EFFECT_CEILING + 0.05);
      // Never a boost over the file's own level.
      expect(v!).toBeLessThanOrEqual(1);
    }
  });
});

// An agent's case (Spec): a quiet tick clipped at 0 dB because the music peaked near the limit, and
// listen mix said "raise it, over 1 is fine" while the check failed that. One rule (sound.ts header): effect peak +
// bed peak <= -1 dBTP, volume <= 1, and a duck when the effect cannot be heard within that.
describe("the effect rule: bed and effect together stay under -1 dBTP", () => {
  const lin = (d: number) => 10 ** (d / 20);
  test("the proof's numbers: a click (table peak -0.9 dB, too short to measure) on a bed peaking at -1.25 dBTP", async () => {
    const { MUSIC } = await import("../../music.gen");
    const { effectLevel, MIX_PEAK, PEAK_MARGIN, bedLevel } = await import("./sound");
    SOUNDS["proof-click"] = { kind: "sfx", file: "x.ogg", duration: 0.038, peak: 0.005, lufs: -70, peakDb: -0.9 };
    SOUNDS["proof-bed"] = { kind: "music", file: "x.mp3", duration: 60, peak: 30, lufs: -15, peakDb: 2.9 };
    MUSIC["proof-bed"] = { duration: 60, bpm: 120, confidence: "high", grid: "fixed", halfTime: false, beats: [], downbeats: [], bars: Array.from({ length: 30 }, (_, i) => i * 2),
      barLufs: Array(30).fill(-14.5), barPeak: Array(30).fill(-1.3), sections: [], drops: [], onsets: [], loudest: [0], lufs: -15, truePeak: -1.3, loopShare: null, master: "master.wav", gridTrust: "high", gridIssues: [] };
    const ctx = makeCtx(SYSTEMS.find((x) => x.id === "spec")!, 1080, 1920, () => 10);
    const bed = BLOCKS.music({ media: "proof-bed", from: 10, until: 14, volume: 1 }, ctx);
    const lv = effectLevel("proof-click", bed, 5.5, 8)!;
    const b = bedLevel(bed, 5.5)!;
    // Without a duck: the sum stays under the limit, the volume at most 1, and the block says it cannot be heard.
    expect(lin(-0.9 + PEAK_MARGIN) * lv.volume + lin(b.near)).toBeLessThanOrEqual(lin(MIX_PEAK) + 1e-3);
    expect(lv.volume).toBeLessThanOrEqual(1);
    expect(lv.heard).toBe(false);
    expect(lv.duckDb).toBeGreaterThan(0);
    // With duck: true the hit adds two bed clips (the dip and the rest), and the rule holds over the ducked bed.
    const said: string[] = [];
    const w = console.warn; console.warn = (m: string) => said.push(m);
    const nodes = BLOCKS.hit({ id: "tick", media: "proof-click", at: 5.5, bed, duck: true }, ctx) as AudioNode[];
    const plain = BLOCKS.hit({ id: "tick2", media: "proof-click", at: 9, bed, duck: false }, ctx) as AudioNode[];
    // With no duck prop the hit ducks by default.
    const auto = BLOCKS.hit({ id: "tick3", media: "proof-click", at: 11, bed }, ctx) as AudioNode[];
    console.warn = w;
    expect(nodes.length).toBe(3);
    const dip = nodes.find((n) => /duck/.test(n.id))!;
    expect(dip.volume!).toBeLessThan((bed[0] as AudioNode).volume!);
    const after = bedLevel(bed, frameAt(5.5))!;
    expect(lin(-0.9 + PEAK_MARGIN) * nodes[0]!.volume! + lin(after.near)).toBeLessThanOrEqual(lin(MIX_PEAK) + 1e-3);
    expect(nodes[0]!.volume!).toBeGreaterThan(lv.volume);
    // Without duck it warns with the rule and the prop to give, and never asks for a volume over 1.
    expect(said.some((m) => /tick2: the bed at .* too loud .*Leave duck at its default/.test(m))).toBe(true);
    expect(auto.length).toBe(3);
    expect(auto[0]!.volume!).toBeGreaterThan(plain[0]!.volume!);
    expect(plain[0]!.volume!).toBeLessThanOrEqual(1);
    // The bed's clips join with no gap and no overlap past their crossfade: 2 frames down into the dip, the dip's
    // release back up. Each crossfade's two ramps are one length.
    const segs = [bed[0] as AudioNode, ...nodes.slice(1)].sort((a, b) => a.at - b.at);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.at).toBeCloseTo(segs[i - 1]!.until! - segs[i - 1]!.fadeOut!, 5);
      expect(segs[i]!.fadeIn!).toBeCloseTo(segs[i - 1]!.fadeOut!, 5);
    }
  });

  test("a low thump on a bed loud in its band: the dip follows the band, past the loudness default", async () => {
    const { MUSIC } = await import("../../music.gen");
    const { bandsAt } = await import("../beats");
    const { AUTO_DUCK, BAND_DUCK_MAX, effectLevel } = await import("./sound");
    // 60 s of a bed loud at 60-250 Hz (50 and 48 dB in every 0.025 s frame), 30 dB at 250-500 Hz, 20 dB above.
    const frame = [50, 48, 30, 20, 20, 20, 20, 20].map((v) => String.fromCharCode(33 + v + 30)).join("");
    MUSIC["band-bed"] = { duration: 60, bpm: 120, confidence: "high", grid: "fixed", halfTime: false, beats: [], downbeats: [], bars: Array.from({ length: 30 }, (_, i) => i * 2),
      barLufs: Array(30).fill(-14), barPeak: Array(30).fill(-6), sections: [], drops: [], onsets: [], loudest: [0], lufs: -14, truePeak: -6, loopShare: null, master: null,
      gridTrust: "high", gridIssues: [], bands: frame.repeat(60 / 0.025 + 1) };
    SOUNDS["band-bed"] = { kind: "music", file: "x.mp3", duration: 60, peak: 30, lufs: -14 };
    // A thump with its energy at 60-250 Hz, and a hiss with its energy at 4-16 kHz.
    SOUNDS["band-thump"] = { kind: "sfx", file: "x.mp3", duration: 0.5, peak: 0.1, lufs: -15, peakDb: -1, bands: [50, 46, 30, 20, 10, 5, 0, -5] };
    SOUNDS["band-hiss"] = { kind: "sfx", file: "x.mp3", duration: 0.5, peak: 0.1, lufs: -15, peakDb: -1, bands: [-5, 0, 5, 10, 20, 30, 46, 44] };
    expect(bandsAt("band-bed", 12.34)).toEqual([50, 48, 30, 20, 20, 20, 20, 20]);
    const ctx = makeCtx(SYSTEMS.find((x) => x.id === "cutout")!, 1080, 1920, () => 10);
    const bed = BLOCKS.music({ media: "band-bed", from: 10, until: 14, volume: 1 }, ctx);
    const thump = quiet(() => BLOCKS.hit({ id: "thump", media: "band-thump", at: 5.5, bed }, ctx)) as AudioNode[];
    const dip = thump.find((n) => /duck/.test(n.id))!;
    const depth = -20 * Math.log10(dip.volume!);
    expect(depth).toBeGreaterThan(AUTO_DUCK + 0.5);
    expect(depth).toBeLessThanOrEqual(BAND_DUCK_MAX + 0.1);
    // Over the ducked bed the plan meets the band: no further dip is needed there.
    expect(effectLevel("band-thump", bed, frameAt(5.5), 8)!.bandDuckDb).toBe(0);
    // A second thump 0.2 s later meets the first dip: the one dip widens to cover both, and nothing is dropped.
    const said: string[] = [], w = console.warn;
    console.warn = (m: string) => said.push(m);
    let second: AudioNode[];
    try { second = BLOCKS.hit({ id: "thump2", media: "band-thump", at: 5.7, bed }, ctx) as AudioNode[]; } finally { console.warn = w; }
    expect(said.filter((m) => /not applied/.test(m))).toEqual([]);
    expect(second.filter((n) => /duck/.test(n.id))).toEqual([]);
    expect([dip.at < 5.5, dip.until! > frameAt(5.7) + 0.15]).toEqual([true, true]);
    // The hiss stands clear in its own band on the same bed: no dip by band.
    const bed2 = BLOCKS.music({ media: "band-bed", from: 10, until: 14, volume: 1 }, ctx);
    expect(effectLevel("band-hiss", bed2, frameAt(5.5), 8)!.bandDuckDb).toBe(0);
  });

  // A fresh agent's Ma film: the track opened with 1.55 s of digital silence, and the bed entered on it.
  test("a track that opens with digital silence: the bed enters where the sound starts, unless the scene keeps the entry", async () => {
    const { MUSIC } = await import("../../music.gen");
    MUSIC["quiet-open"] = { duration: 60, bpm: 120, confidence: "high", grid: "fixed", halfTime: false, beats: [], downbeats: [], bars: Array.from({ length: 30 }, (_, i) => i * 2),
      barLufs: Array(30).fill(-14), barPeak: Array(30).fill(-6), sections: [], drops: [], onsets: [], loudest: [0], lufs: -14, truePeak: -6, loopShare: null, master: null,
      gridTrust: "high", gridIssues: [], lead: 1.55 };
    SOUNDS["quiet-open"] = { kind: "music", file: "x.mp3", duration: 60, peak: 30, lufs: -14 };
    const ctx = makeCtx(SYSTEMS.find((x) => x.id === "ma")!, 1080, 1920, () => 10);
    const said: string[] = [], w = console.warn;
    console.warn = (m: string) => said.push(m);
    let skipped: AudioNode, kept: AudioNode, aligned: AudioNode;
    try {
      skipped = BLOCKS.music({ media: "quiet-open", from: 0, until: 10, volume: 1 }, ctx)[0] as AudioNode;
      kept = BLOCKS.music({ media: "quiet-open", from: 0, until: 10, volume: 1, skipSilence: false }, ctx)[0] as AudioNode;
      aligned = BLOCKS.music({ media: "quiet-open", align: { track: 20, film: 0 }, until: 10, volume: 1 }, ctx)[0] as AudioNode;
    } finally { console.warn = w; }
    expect([skipped.from, kept.from ?? 0, aligned.from]).toEqual([1.55, 0, 20]);
    expect(said.some((m) => /1\.55 s of digital silence/.test(m))).toBe(true);
  });

  const ffmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
  const have = ["spec-music-1168", "spec-tick", "mark-music-4", "mark-pop"].every((m) => existsSync(join(MEDIA, m)));
  test.skipIf(!ffmpeg || !have)("a real mix of the defaults peaks at or under -1 dBTP, and each hit is heard", async () => {
    const { effectLevel, OVER_BED } = await import("./sound");
    for (const [system, track, fx] of [["spec", "spec-music-1168", "spec-tick"], ["mark", "mark-music-4", "mark-pop"]] as const) {
      const ctx = ctxOf(system);
      const bed = quiet(() => BLOCKS.music({ media: track, peakAt: 6, until: 12 }, ctx));
      // The defaults: a hit ducks the bed when it must, and then stands OVER_BED dB over it.
      const hits = quiet(() => [2.5, 6, 9.5].flatMap((t, i) => BLOCKS.hit({ id: `h${i}`, media: fx, at: t, bed }, ctx)));
      // Each hit plays louder over the ducked bed than it could over the whole bed, and the bed dips under each.
      // (OVER_BED is a loudness target; a short click with a 20 dB crest may still read under it after the 12 dB cap.)
      const plainBed = quiet(() => BLOCKS.music({ media: track, peakAt: 6, until: 12 }, ctx));
      for (const [i, t] of [2.5, 6, 9.5].entries()) {
        const h = hits.find((n) => n.id === `h${i}`) as AudioNode;
        expect(h.volume!, `${track} ${fx} at ${t}`).toBeGreaterThanOrEqual(effectLevel(fx, plainBed, frameAt(t), OVER_BED.hit)!.volume);
      }
      expect(hits.filter((n) => /-duck/.test(n.id)).length).toBeGreaterThan(0);
      const nodes = [...bed, ...hits] as AudioNode[];
      const args = ["-hide_banner", "-nostats"];
      const chains: string[] = [];
      nodes.forEach((n, i) => {
        const len = (n.until ?? 12) - n.at;
        args.push("-ss", String(n.from ?? 0), "-t", String(len), "-i", join(MEDIA, n.src));
        const f = [`volume=${n.volume ?? 1}`];
        if (n.fadeIn) f.push(`afade=t=in:d=${n.fadeIn}`);
        if (n.fadeOut) f.push(`afade=t=out:st=${Math.max(0, len - n.fadeOut)}:d=${n.fadeOut}`);
        f.push(`adelay=${Math.round(n.at * 1000)}:all=1`, "aresample=48000", "aformat=channel_layouts=stereo");
        chains.push(`[${i}:a]${f.join(",")}[a${i}]`);
      });
      const mix = `${chains.join(";")};${nodes.map((_, i) => `[a${i}]`).join("")}amix=inputs=${nodes.length}:normalize=0:duration=longest,atrim=0:12,ebur128=peak=true`;
      const r = spawnSync("ffmpeg", [...args, "-filter_complex", mix, "-f", "null", "-"], { encoding: "utf8" });
      const m = [...(r.stderr ?? "").matchAll(/Peak:\s+(-?\d+(?:\.\d+)?) dBFS/g)].pop();
      expect(m).toBeTruthy();
      // 0.5 dB for the decoder and the estimate of the bars' peaks.
      expect(Number(m![1])).toBeLessThanOrEqual(-1 + 0.5);
    }
  }, 60000);
});
/** The frame time of the hit's peak (frameOf: the first frame after t). */
const frameAt = (t: number) => (Math.floor(t * 30 + 1e-6) + 1) / 30;

describe("a hit with no bed: the system's level, and the master on any sound", () => {
  test("with no bed, a hit's volume brings its loudness to the system's target, at volume 1 at most", () => {
    const raw = ctxOf("raw");
    // raw-click (-26.1 LUFS, Raw's target -26): under the target at volume 1, so it plays at 1 and the master does the rest.
    const [click] = BLOCKS.hit({ id: "c", media: "raw-click", at: 2 }, raw) as AudioNode[];
    expect(click!.volume).toBe(1);
    expect(soloVolume("raw-click", "raw")).toBe(1);
    // A loud stamp (-14.8 LUFS) comes down to the target: 11.2 dB under volume 1.
    const [stamp] = BLOCKS.hit({ id: "s", media: "cutout-stamp", at: 2 }, raw) as AudioNode[];
    expect(stamp!.volume).toBeCloseTo(10 ** ((-26 - -14.8) / 20), 2);
  });
  const clickFile = join(MEDIA, "raw-click", SOUNDS["raw-click"]?.file ?? "-");
  test.skipIf(!ffmpeg || !existsSync(clickFile))("a Raw film with six clicks and no music gets its master, to Raw's range", () => {
    const raw = ctxOf("raw");
    const nodes = [1, 3, 5, 7, 9, 11].flatMap((t, i) => BLOCKS.hit({ id: `c${i}`, media: "raw-click", at: t }, raw)) as AudioNode[];
    const dir = mkdtempSync(join(tmpdir(), "untell-raw-"));
    const film = join(dir, "film.mp4");
    const args = ["-y", "-hide_banner", "-loglevel", "error"];
    const chains: string[] = [];
    nodes.forEach((n, i) => {
      args.push("-ss", String(n.from ?? 0), "-t", String((n.until ?? 12) - n.at), "-i", join(MEDIA, n.src));
      chains.push(`[${i}:a]volume=${n.volume ?? 1},adelay=${Math.round(n.at * 1000)}:all=1,aresample=48000,aformat=channel_layouts=stereo[a${i}]`);
    });
    const mix = `${chains.join(";")};${nodes.map((_, i) => `[a${i}]`).join("")}amix=inputs=${nodes.length}:normalize=0:duration=longest,apad=whole_dur=12[out]`;
    expect(spawnSync("ffmpeg", [...args, "-filter_complex", mix, "-map", "[out]", "-c:a", "aac", "-b:a", "256k", film]).status).toBe(0);
    const r = spawnSync("python3", [resolve(import.meta.dir, "../../../../scripts/master.py"), film, "raw", "--json"], { encoding: "utf8" });
    const res = JSON.parse(r.stdout.trim().split("\n").pop()!) as { before: { lufs: number }; after: { lufs: number; truePeak: number }; ok: boolean };
    // Before: under Raw's range (-26 within 4); after: on the target, the true peak under -1 dBTP.
    expect(res.before.lufs).toBeLessThan(-26);
    expect(Math.abs(res.after.lufs - mixTarget("raw").lufs)).toBeLessThanOrEqual(mixTarget("raw").range);
    expect(res.after.truePeak).toBeLessThanOrEqual(-1 + 0.05);
    expect(res.ok).toBe(true);
  }, 60000);
});

describe("typing on a terminal", () => {
  // An agent's Manual film: typing({ of }) on a terminal took the waiting prompt and put a tick at -0.03 s.
  test("of a terminal ticks its typed commands only, never before 0; a wrong of lists the ids that type", () => {
    const ctx = ctxOf("manual"), S = ctx.safe;
    const term = quiet(() => BLOCKS.terminal({ id: "proof", x: S.left, y: S.top, w: S.right - S.left, session: [{ command: "git reset --soft HEAD~1", output: ["done"] }], at: 0 }, ctx));
    const ticks = quiet(() => BLOCKS.typing({ id: "k", media: "manual-tick", nodes: term, of: "proof", every: 1 }, ctx)) as AudioNode[];
    const keys = term.filter((n) => /^proof-r0-cmd-c\d+$/.test(n.id)).length;
    expect(ticks.filter((n) => n.src.startsWith("manual-tick/")).length).toBeGreaterThan(0);
    expect(ticks.filter((n) => n.src.startsWith("manual-tick/")).length).toBeLessThanOrEqual(keys);
    expect(ticks.every((n) => n.at >= 0)).toBe(true);
    expect(() => quiet(() => BLOCKS.typing({ id: "k", media: "manual-tick", nodes: term, of: "proff" }, ctx))).toThrow(/Give the id of what types: .*proof-r0-cmd/);
  });
});
