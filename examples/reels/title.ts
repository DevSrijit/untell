// The Title reel: a teaser for "Neap", a fictional film from Telusi Pictures (both names are random draws). The
// grammar of an art-house trailer: the title over a dark plate first, a studio card over the surf, slow water, a flash
// montage on the swell, then the title again with one low impact and near silence, and the release line last.
//
// Every picture is drawn at or under its file's size. The two shore clips are vertical and fill the frame at 1:1.
// The stills are smaller than the frame, so the montage shows them as film frames in the black, never blown up.
// Pictures (their sources and licences are in assets/media.json): title-shore, title-surf, title-water, title-jetty,
// title-beam, title-observatory. Each is shown once.
//
// The track is a swell (Title's entry rule): its loudest bar lands on the title card, so the bed rises into it, and
// the bed stops on the card's impact. Every cut sits on a beat of the track; the flash cuts come faster each time.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lineOverPicture, musicFrom } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";

export const system = "title";
export const seconds = 14.6;

const TRACK = "title-music-3";
const F = 1 / 30;
// The structure: where each part goes. The track's beat grid moves each cut onto a beat.
const PLAN = { studio: 2.6, water: 5.8, title: 12, release: 12.3 };

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = ctx.width, H = ctx.height;
  const out: Node[] = [];
  const TITLE = PLAN.title;
  const from = musicFrom({ media: TRACK, peakAt: TITLE, peak: "loudest", until: TITLE + F });
  const g = beats(TRACK, { from, until: TITLE });
  const STUDIO = g.onBeat(PLAN.studio), WATER = g.beats.find((t) => t >= Math.max(PLAN.water, STUDIO + 3.1)) ?? PLAN.water, RELEASE = PLAN.release;
  out.push(...B.reveal({ at: TITLE }, ctx));
  // A box centred on the frame, as wide as the safe area allows about the centre: the cards centre on the frame.
  const half = Math.min(W / 2 - S.left, S.right - W / 2);
  const centred = (y: number, h: number) => ({ x: Math.round(W / 2 - half), w: Math.round(2 * half), y: Math.round(y), h: Math.round(h) });
  const lh = (r: "display" | "body" | "caption") => Math.round(ctx.lineHeight(r));
  // The cards on black sit on the optical centre, a little above the middle, and above the low band.
  const mid = Math.min(Math.round(H * 0.42), Math.floor(S.lowBandTop - lh("display") / 2 - lh("body") * 1.6));

  // 1. The hook: the dark shore fills the frame, and the title sits on frame 0 in the calm sky above the horizon.
  // Not dimmed: the title sits on the dark sky, and the water below must read, so the lower frame is not empty.
  const shore = B.photo({ id: "shore", media: "title-shore", motion: "still", at: 0, until: STUDIO }, ctx);
  out.push(...shore);
  const hookLine = lineOverPicture(ctx, shore.find((n) => n.kind === "image")!, lh("display"), { prefer: "top", times: [0, 1, 2] });
  out.push(...B.text({ id: "hook", ...centred(Math.max(hookLine.line.y, S.top + 16), lh("display")), text: "Neap", role: "display", align: "center", enter: "cut", at: 0, until: STUDIO }, ctx));

  // 2. Surf on the shore at dusk, at its own slow speed, and the studio card in the calm sky.
  const surf = B.photo({ id: "surf", media: "title-surf", dim: true, motion: "still", clipStart: 3, at: STUDIO, until: WATER }, ctx);
  out.push(...surf);
  const card = lineOverPicture(ctx, surf.find((n) => n.kind === "image")!, lh("body"), { prefer: "top", times: [STUDIO, STUDIO + 1.5, WATER - 0.2] });
  out.push(...B.text({ id: "studio", ...centred(card.line.y, lh("body")), text: "Telusi Pictures presents", role: "body", color: "ink", align: "center", enter: "cut", at: STUDIO, until: WATER }, ctx));

  // 3. Dark water as a wide film frame in the black (the clip is 2560 px wide; full height would blow it up), and the
  //    tagline in the black above it.
  const flashAt0 = g.onBeat(TITLE - 1.5);
  const wide = (w: number, aspect: number) => ({ x: Math.round((W - w) / 2), y: Math.round(H * 0.46 - w / aspect / 2), w, h: Math.round(w / aspect) });
  const waterBox = wide(W, 16 / 9);
  out.push(...B.photo({ id: "water", media: "title-water", motion: "still", clipStart: 2, box: waterBox, at: WATER, until: flashAt0 }, ctx));
  out.push(...B.text({ id: "tagline", ...centred(waterBox.y - lh("body") * 2, lh("body")), text: "The tide keeps count.", role: "body", align: "center", enter: "cut", at: WATER, until: flashAt0 }, ctx));

  // 4. The flash montage on the swell: each still once, shown for a few frames, with black between, faster each
  //    time, each on a beat. The last flash ends on the title's frame, so no black run sits between the montage and
  //    the title. (A block for accelerating flash cuts is not in the catalog yet.)
  const flashAt = [flashAt0, g.onBeat(TITLE - 0.75), TITLE - 3 * F];
  // Each still is too small to fill a tall frame: it sits in a letterbox band across the full width (Title's compose).
  const stills: { media: string; frames: number }[] = [{ media: "title-jetty", frames: 5 }, { media: "title-beam", frames: 4 }, { media: "title-observatory", frames: 3 }];
  stills.forEach((s, i) => {
    const at = flashAt[i]!;
    out.push(...B.photo({ id: `flash-${i}`, media: s.media, motion: "still", frame: "letterbox", enter: "cut", exit: "cut", at, until: at + s.frames * F }, ctx));
  });

  // 5. The title with one low impact, then near silence. The release line comes last and holds.
  out.push(...B.text({ id: "title", ...centred(mid - lh("display") / 2, lh("display")), text: "Neap", role: "display", align: "center", enter: "cut", at: TITLE }, ctx));
  out.push(...B.text({ id: "release", ...centred(mid + lh("display") / 2 + lh("body") * 0.4, lh("body")), text: "In cinemas this winter", role: "body", color: "inkMuted", align: "center", enter: "cut", at: RELEASE }, ctx));
  out.push(...B.hold({ id: "hold-title", at: TITLE, until: seconds }, ctx));

  // Sound. The bed rises into the title and stops on it with a short fade; the impact rings into the silence.
  const bed = B.music({ media: TRACK, peakAt: TITLE, peak: "loudest", at: 0, until: TITLE, fadeOut: 0.1 }, ctx);
  out.push(...bed);
  out.push(...B.hit({ id: "impact", media: "mark-impact", at: TITLE, bed }, ctx));
  return out;
};
