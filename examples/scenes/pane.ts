// The pane scene: a code window, a terminal and a picture window in one column, with shared edges.
// The code is real Python and its output is true: 2027 has no divisor from 2 to 45 (45 x 45 = 2025), so it
// is prime and the script prints "2027 True"; 2025 = 3 x 675 is not, so it prints "2025 False".
// The loop avoids <= because the mono font draws it as a ligature.
// The terminal sets the result in the accent and keeps a status line with a clock at its foot.
import type { Ctx, Node } from "../../src/system/scene/types";
import { codeRole, paneStack, paneTitleHeight, rowPitch, terminalHeight, type BLOCKS } from "../../src/system/scene/blocks";

export const seconds = 11;

const CODE = [
  "import sys",
  "n = int(sys.argv[1])",
  "d = 2",
  "while n%d and d*d<n:",
  "    d += 1",
  "print(n, d*d > n)",
];

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe;
  const tall = ctx.height > ctx.width;
  const role = codeRole(ctx);
  const lh = rowPitch(ctx, role);
  const pad = Math.round(ctx.size(role) * 0.6);
  // The code pane's height from its rows (B.measure), at the column's width.
  const colW0 = tall ? S.lowBandRight - S.left : Math.round((S.right - S.left) * 0.56);
  const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
  const codeM = quiet(() => B.measure("codeBlock", { id: "code", x: S.left, y: S.top, w: colW0, lines: CODE, at: 0 }, ctx));
  const codeH = Math.ceil(codeM.h);
  const labelRow = Math.ceil(ctx.size("label") * Math.max(ctx.system.type.label.leading, 1.4)) + pad;
  // Three rows, so the status line stays in the text-safe area; the first command scrolls off, the result stays.
  const termH = 3 * lh + 2 * pad + labelRow;
  const gap = Math.round(ctx.size("label") * 0.8);
  // At 9:16 the panes stack in one column; at 16:9 the code and the terminal stack on the left, the picture right.
  // At 9:16 the column ends by lowBandRight, so the terminal's status line keeps clear of the platform UI.
  // The column is as wide as the code needs (a code block widens to reach the text-safe edge), so the panes keep
  // one pair of edges and the code's panel never runs past its pane.
  const colW = Math.max(colW0, Math.round(codeM.w));
  // 9:16: one column, code over the shell over the picture. 16:9: the code on the left; the shell and the picture
  // stack on the right, so the column of code never pushes the shell under the frame's foot.
  const rightX = S.left + colW + gap, rightW = S.right - rightX;
  const stack = tall
    ? paneStack(ctx, { x: S.left, w: colW, top: S.top, gap, panes: [{ h: codeH, title: true }, { h: termH, title: true }] })
    : [...paneStack(ctx, { x: S.left, w: colW, top: S.top, gap, panes: [{ h: codeH, title: true }] }),
      ...paneStack(ctx, { x: rightX, w: rightW, top: S.top, gap, panes: [{ h: termH, title: true }] })];
  const code = stack[0]!, term0 = stack[1]!;
  // At 9:16 the terminal ends where its status line still reads in the text-safe area (the label's glyph box reaches
  // past its line box), so the code's own height never pushes the status line under the platform's controls.
  const over = Math.ceil(Math.max(0, (ctx.size("label") * 1.4 - ctx.lineHeight("label")) / 2)) + 1;
  const term = { ...term0, h: Math.min(term0.h, Math.floor(S.bottom - term0.y - 2 * over)) };
  // The last command and its result must both show at the end. When the panel cannot hold those two rows and the
  // status line (a large code role, Manual), the status line goes: the proof matters more than the clock.
  const status = term.h >= terminalHeight(ctx, { rows: 2, status: true });
  // The picture is a graphic: at 9:16 it fills the column down to the picture-safe foot (the lower band); at 16:9 it
  // fills the right column under the shell, down to the code pane's foot.
  const foot = ctx.height - Math.ceil(ctx.system.margin * Math.min(ctx.width, ctx.height));
  const picTop = term.y + term.h + gap + paneTitleHeight(ctx);
  const pic = tall
    ? { x: S.left, y: picTop, w: colW, h: Math.max(200, Math.min(colW * 1.05, foot - picTop)) }
    : { x: rightX, y: picTop, w: rightW, h: Math.max(200, Math.max(code.y + code.h, foot - S.left) - picTop) };
  const out: Node[] = [];
  out.push(...B.pane({ id: "code-pane", ...code, title: "prime.py", at: 0 }, ctx));
  out.push(...B.codeBlock({ id: "code", ...code, lines: CODE, at: 0, highlight: [{ line: 4, at: 1.4 }, { line: 6, at: 3.0 }], until: seconds }, ctx));
  out.push(...B.pane({ id: "term-pane", ...term, title: "shell", at: 0 }, ctx));
  // The run ends on its result (end "result"): no last prompt row pushes the result out of a short panel.
  out.push(...B.terminal({ id: "term", ...term, at: 0.6, end: "result",
    session: [
      { command: "python3 prime.py 2025", run: 0.3, output: ["2025 False"] },
      { command: "python3 prime.py 2027", pause: 0.9, run: 0.3, output: [{ text: "2027 True", result: true }] },
    ],
    ...(status ? { status: { left: "~/primes", right: [{ text: "00:00", at: 0.6 }, { text: "00:01", at: 1.6 }, { text: "00:02", at: 2.6 }, { text: "00:03", at: 3.6 }, { text: "00:04", at: 4.6 }, { text: "00:05", at: 5.6 }, { text: "00:06", at: 6.6 }] } } : {}),
  }, ctx));
  out.push(...B.photo({ id: "pic", media: "schematic-chainring", box: pic, motion: "still", at: 0 }, ctx));
  // The picture's title only where it can be read: inside the text-safe area.
  const picTitle = pic.y - paneTitleHeight(ctx) + ctx.lineHeight("label") <= S.bottom;
  out.push(...B.pane({ id: "pic-pane", ...pic, ...(picTitle ? { title: "fig. 1" } : {}), fill: "none", at: 0 }, ctx));
  out.push(...B.hold({ at: 7, until: seconds }, ctx));
  return out;
};
