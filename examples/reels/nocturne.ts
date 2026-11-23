// The Nocturne reel: a considered statement, like the first seconds of a launch. The Tuhu Library (fictional) opens
// all night, and its night librarian, Kasubu (fictional), says why. The names are a random draw.
// 1. Frame 0: rain on a dark window at night fills the frame, on a slow push through the whole film. The news sits on
//    its calm part, fitted to the safe width: "The library stays open all night."
// 2. On the track's rise the news leaves, and the quote arrives word by word on the same window, fitted to the safe
//    width (Nocturne's statement on its picture: the picture is the field under it), with the rule, the name and the
//    role, and holds to the end.
// Pictures (their sources and licences are in assets/media.json): nocturne-window (a 3840 px clip, drawn under its
// size, the whole film).
// The track opens on the start of a section with a pulse (Nocturne's entry rule); no effects: the words arrive in
// silence over the bed.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { lineOverPicture } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";

export const system = "nocturne";
export const seconds = 12.4;

const TRACK = "nocturne-music-1";
// The section with a pulse (listen.md: bars 16-19, from 24.9 s): the film opens on its first bar.
const SECTION = 24.9;
// The structure: where the second scene goes. The grid moves it onto a bar.
const PLAN = { inside: 6.3 };

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = ctx.width, H = ctx.height;
  const out: Node[] = [];
  const g = beats(TRACK, { from: SECTION, until: seconds });
  // The reading room comes in on the track's rise (the map's drop in the window), else on a bar.
  // The quote needs its words, its attribution and Nocturne's 2 s end hold after it: about 4.5 s.
  const INSIDE = g.drops.find((d) => d.t > 4 && d.t < seconds - 4.5)?.t ?? g.onBar(PLAN.inside);
  // The reveal is the quote: it starts one enter duration after the room comes in.
  out.push(...B.reveal({ at: INSIDE + ctx.dur.enter }, ctx));

  // 1. Outside: the rain on the window, dimmed. The news on its calm part.
  // A slow push on the glass; it dissolves out as the reading room dissolves in.
  const window = B.photo({ id: "window", media: "nocturne-window", dim: true, motion: "push", amount: 0.06, at: 0, seconds }, ctx);
  out.push(...window);
  const newsH = Math.round(ctx.lineHeight("display") * 2.3);
  const news = lineOverPicture(ctx, window.find((n) => n.kind === "image")!, newsH, { prefer: "centre", times: [0, 2, 4] });
  // The news on frame 0, fitted to the safe width on two long lines, so its type stays the size of the statement after it.
  out.push(...B.fitText({ id: "news", text: ["The library stays", "open all night."], role: "display", ...news.line, x: S.left, w: S.right - S.left, h: newsH, enter: "fade", at: 0.3, until: INSIDE }, ctx));

  // 2. The quote card on the window: word by word, fitted to the width, with the rule, the name and the role arriving
  // with it and staying to the end.
  out.push(...B.quote({ id: "quote", x: S.left, y: S.top, w: S.right - S.left, h: S.bottom - S.top, text: "Good work keeps late hours.", name: "Kasubu", job: "Night librarian, Tuhu Library", enter: "word",
    at: INSIDE + ctx.dur.enter }, ctx));

  // Sound: the bed opens on the section's first bar. No effects.
  out.push(...B.music({ media: TRACK, align: { track: SECTION, film: 0 }, at: 0, until: seconds }, ctx));
  return out;
};
