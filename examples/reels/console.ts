// The Console reel: next year is a prime number. One session in one terminal, and every number on screen is true:
// - 2021 = 43 x 47, 2022 = 2 x 3 x 337, 2023 = 7 x 17 x 17, 2026 = 2 x 1013.
// - 2027 has no factor but itself: it is prime. No prime up to 45 (the square root of 2027 is 45.02) divides it,
//   and the scan prints each remainder.
// - 2029 is prime too, so 2027 and 2029 are twin primes (two primes 2 apart).
// The tool "kezu" is fictional (a random draw for this reel). `factor` is the standard command.
//
// 1. Frame 0: a full terminal with its status bar, and the factors of earlier years in muted ink.
//    `factor 2026` types at the prompt in the headline role, and its factors print.
// 2. `kezu scan 2027` types. It divides 2027 by every prime up to 45, one remainder after another, in real time.
//    No remainder is 0.
// 3. The reveal: "2027: prime" prints in the accent at display size, and the status bar says so.
// 4. The end: `factor 2029` turns the result into a pair: 2029 is prime too. The status bar names the pair, and the
//    cursor blinks.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { terminalTimes } from "../../src/system/scene/blocks";
import { FPS, frameOf } from "../../src/system/scene/context";

export const system = "console";
export const seconds = 13;

const TRACK = "console-music-4";
// The section where the bass comes in (listen.md: bars 19-48, from 36.6 s): the film opens on its first bar.
const SECTION = 36.6;

/** Trial division of n by the primes up to its square root, one a row: "2027 ÷ 2  r 1". */
function scanRows(n: number): string[] {
  const primes: number[] = [];
  for (let p = 2; p * p <= n; p++) if (primes.every((q) => p % q !== 0)) primes.push(p);
  const cells = primes.map((p) => `${n} ÷ ${p}  r ${n % p}`);
  return cells;
}

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const out: Node[] = [];

  // One terminal fills the text-safe area, in the headline role. The years before ran before frame 0, so the film opens
  // on a full terminal with their factors in its history. When the rows pass the panel, the session scrolls.
  // It is built twice: once to read its times, once with the status bar that changes on them.
  const x = S.left, w = S.right - S.left, h = S.bottom - S.top;
  const muted = (text: string) => ({ text, tone: "muted" as const });
  const session = [
    { command: "factor 2021", output: [muted("2021: 43 47")], pause: 0.1 },
    { command: "factor 2022", output: [muted("2022: 2 3 337")], pause: 0.1 },
    { command: "factor 2023", output: [muted("2023: 7 17 17")], pause: 0.1 },
    { command: "factor 2026", output: ["2026: 2 1013"], pause: 0.5 },
    { command: "kezu scan 2027", output: [...scanRows(2027).map((r) => ({ ...muted(r), after: 0.18 })), { text: "2027: prime", result: true }], pause: 1.2 },
    { command: "factor 2029", output: ["2029: 2029"], pause: 1.4 },
  ];
  const term = (right: { text: string; at: number }[]) => B.terminal({ id: "term", x, y: S.top, w, h, role: "headline", resultRole: "display", cps: 11, at: -4.5, session, status: { left: "lumo", right } }, ctx);
  // The reveal: the frame on which the result line shows; the twin: the last command's output (terminalTimes, the
  // block's own timing).
  // The reel keys its reveal and its status changes to the frame each line shows (frameOf), one frame after the event.
  const T = terminalTimes(ctx, { session, cps: 11, at: -4.5 });
  const shows = (t: number) => frameOf(t) / FPS;
  const REVEAL = T.result === null ? 8 : shows(T.result);
  const TWIN = Math.max(REVEAL + 1, shows(T.commands[T.commands.length - 1]!.lines[0] ?? REVEAL + 3));
  const main = term([{ text: "2027?", at: 0 }, { text: "prime", at: REVEAL }, { text: "twin primes", at: TWIN }]);
  out.push(...main);
  out.push(...B.reveal({ at: REVEAL }, ctx));

  // Sound: the bed opens on the section's first bar.
  const bed = B.music({ media: TRACK, align: { track: SECTION, film: 0 }, at: 0, until: seconds }, ctx);
  out.push(...bed);
  // One click when the result prints: the scan ends and "2027: prime" lands. Console drops the key ticks over
  // strong music, so the keys type in silence.
  out.push(...B.hit({ id: "result", media: "console-click", at: REVEAL, bed }, ctx));
  return out;
};
