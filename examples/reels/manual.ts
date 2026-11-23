// The Manual reel: when to try again? Exponential backoff, taught as one documentation page.
// The code is real. `python3 -i waits.py` prints "1 2 4 8 16" and stays in Python; there `print(*waits(1, 7))`
// prints "1 2 4 8 16 32 64".
//
// Two views of one page, on the bars of a lo-fi keys track (84 BPM, one bar is 2.93 s):
// 1. View 1. The question at the top, waits.py under it (its first line at rest on frame 0, the rest typed at a human
//    rate, a soft tick on some keys), then the run in a terminal with the same edges: the result in headline.
//    The lit line rests on `yield w` while the command runs, and moves to `w *= 2` as the result prints.
// 2. The view scrolls down to the next block (Manual scrolls; it never zooms).
// 3. View 2. The printed waits drawn as bars, one a try: each bar twice the one before. Then a last run with a larger
//    input prints, and the page holds on it.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { musicFrom, terminalTimes } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";
import { anchor, withView } from "../../src/system/scene/context";

export const system = "manual";
export const seconds = 10.4;

const TRACK = "manual-music-6";

// The file on screen, line for line. Python runs it as it is.
const CODE = [
  "def waits(w, n):",
  "    for _ in range(n):",
  "        yield w",
  "        w *= 2",
  "print(*waits(1, 5))",
];
/** The waits the code yields, computed as Python does: the first run's output and the bars. */
const waits = (n: number) => Array.from({ length: n }, (_, k) => 2 ** k);
const LINE_YIELD = 3, LINE_DOUBLE = 4;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, w = S.right - S.left;
  const gap = Math.round(ctx.lineHeight("body") * 0.6);
  const out: Node[] = [];

  // ---------------------------------------------------------------- view 1: the question, the code, the run
  const Q = "When to try again?";
  const qP = { id: "ask", x: S.left, y: S.top, w, text: Q, role: "headline" as const, maxLines: 2 };
  const qH = Math.ceil(B.measure("title", { ...qP, at: -10 }, ctx).h);
  out.push(...B.title({ ...qP, at: 0 }, ctx));

  // The code types from frame 0 (its first row at rest); the panel sizes to its rows, as wide as its code needs.
  const codeY = S.top + qH + gap;
  // The typing starts before frame 0, so the first three rows are on the page at once and the result prints early.
  const typed = { id: "code", x: S.left, y: codeY, w, lines: CODE, enter: "type" as const, cps: 70, at: -1.5 };
  const draft = B.codeBlock(typed, ctx);
  const typedAt = (line: number) => anchor(draft, `code-line:${line}`).data?.typedAt ?? 0;
  // The command types as soon as the code is typed (so the run's row fills the page's foot early); the lit line rests
  // on `yield w` while it runs, and moves to `w *= 2` when the result prints: the line that doubles each wait.
  const typeAt = typedAt(CODE.length) + 0.1;
  const RUN = { id: "run", x: S.left, w, resultRole: "headline" as const, end: "result" as const, cps: 50,
    session: [{ command: "python3 -i waits.py", pause: typeAt, output: [{ text: waits(5).join(" "), result: true }] }], at: -0.5 };
  const resultAt = terminalTimes(ctx, RUN).result ?? typeAt + 2;
  // The result, in headline, is the first large thing in the page's lower half: it prints within 2 s of the start.
  const lit = [{ line: LINE_YIELD, at: typeAt }, { line: LINE_DOUBLE, at: resultAt }];
  const codeP = { ...typed, highlight: lit, jump: "cut" as const };
  const codeBox = B.measure("codeBlock", codeP, ctx);
  const code = B.codeBlock({ ...codeP, w: Math.round(codeBox.w) }, ctx);
  out.push(...code);

  // The run, under the code, with the same edges: its panel and prompt from frame 0. The panel ends on the text-safe
  // foot, so its rows (the command, then the result) are as low on the page as the text may go. Python stays open (-i)
  // for the last run.
  // The terminal keeps whole code rows for the headline result, which leaves an empty strip under it. The panel goes
  // that much past the text-safe foot, so the result's row ends on the foot (the panel is not text).
  // A draft at the text-safe top (a draft outside it would say its rows are outside): its result row and its inset.
  const draft1 = B.terminal({ ...RUN, y: S.top, w: Math.round(codeBox.w) }, ctx);
  const res0 = anchor(draft1, "run-result"), inset0 = (draft1.find((n) => n.id === "run-r0-ps")?.y ?? S.top) - S.top;
  const runH = Math.ceil(res0.y - S.top + res0.h + inset0);
  const runY = Math.round(Math.max(codeBox.y + codeBox.h + gap, S.bottom - runH));
  const run1 = B.terminal({ ...RUN, y: runY, w: Math.round(codeBox.w) }, ctx);
  out.push(...run1);
  const result1 = anchor(run1, "run-result").at ?? typeAt + 2;

  // ---------------------------------------------------------------- the scroll to view 2
  // The track's drop lands on the reveal (the chart): the scroll and the line come first, so the reveal is a fixed
  // time after the result. The bed enters so that its drop is there; every later time comes from its beats.
  const REVEAL = Math.round((result1 + 1.4 + ctx.dur.move + 0.9) * 30) / 30;
  const music = { media: TRACK, peakAt: REVEAL, until: seconds };
  const g = beats(TRACK, { from: musicFrom(music), until: seconds });
  const PAGE = ctx.height;
  const SCROLL = g.onBeat(result1 + 1.4);
  out.push(...B.camera({ id: "cam", moves: [{ at: SCROLL, y: PAGE }] }, ctx));
  const v2 = withView(ctx, { y: PAGE });
  const S2 = v2.safe;
  const rest = SCROLL + ctx.dur.move;

  // ---------------------------------------------------------------- view 2: the waits drawn, then a larger run
  const LINE2 = "Each wait is twice the one before.";
  const l2P = { id: "twice", x: S2.left, y: S2.top, w, text: LINE2, role: "headline" as const, maxLines: 2 };
  const l2H = Math.ceil(B.measure("title", { ...l2P, at: -10 }, v2).h);
  out.push(...B.title({ ...l2P, at: g.onBeat(rest) }, v2));

  // Under the line: the Python prompt that -i left open (from the scroll on), then the chart to the text-safe foot,
  // ending by the low band's edge. The chart grows on the bar; the last run types after it.
  const run2At = g.onBeat(REVEAL + 1.5);
  const run2Y = S2.top + l2H + gap;
  const R2 = { id: "run2", x: S2.left, y: run2Y, w: Math.round(codeBox.w), prompt: ">>>",
    session: [{ command: "print(*waits(1, 7))", pause: run2At - SCROLL, output: [waits(7).join(" ")] }], end: "result" as const, at: SCROLL };
  const run2H = Math.ceil(B.measure("terminal", R2, v2).h);
  const chartY = run2Y + run2H + gap;
  const chartH = Math.round(S2.bottom - chartY);
  out.push(...B.barChart({ id: "bars", x: S2.left, y: chartY, w: S2.lowBandRight - S2.left, h: chartH, title: "Wait before each try, s", orientation: "horizontal",
    categories: waits(5).map((_, k) => `try ${k + 2}`), series: [{ label: "wait", values: waits(5) }], key: 4, at: REVEAL }, v2));
  out.push(...B.reveal({ at: REVEAL, of: "bars" }, ctx));

  // The last run: a larger input, in the Python that -i left open. The output prints, and the page holds on it.
  const run2 = B.terminal(R2, v2);
  out.push(...run2);

  // ---------------------------------------------------------------- sound: the bed with its drop on the reveal, a soft tick
  // on the typed keys (typing keeps the system's effects limit).
  const bed = B.music(music, ctx);
  out.push(...bed);
  // A tick on every 8th typed key: six in 10 s at most. The first row rests on frame 0 and the second starts typing on
  // frame 0, where a tick would sound before any picture changes, so the ticks start on the third row. manual-tick has
  // three transients (a flam), so the film takes a single tick.
  const shownAt = (n: Node) => (n.tracks?.opacity ?? []).find((k) => k.v > 0)?.t ?? 0;
  const typedRows = code.filter((n) => /^code-l\d+-c\d+$/.test(n.id) && shownAt(n) > 0.3);
  out.push(...B.typing({ id: "keys", media: "console-tick", nodes: typedRows, of: "code", every: 8, bed }, ctx));
  return out;
};
