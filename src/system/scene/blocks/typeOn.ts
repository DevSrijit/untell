// Type on: text that appears one character at a time, as if written or typed.
//
// Rules this block enforces:
// - Typing is content, not easing. So it types in every system, also in a one-frame system, where
//   each character still appears in its own frame.
// - Two paces. "write": a label writes itself at 40 characters a second (Spec's typed labels).
//   "human": a person types, at about 14 characters a second, with a small fixed variation per key
//   and longer pauses after spaces and punctuation. The variation comes from the text itself, not
//   from chance, so every render is the same. Default: "human" in a one-frame system, else "write".
// - Every key time sits on a frame (1/30 s), so both renderers show the same character on a frame.
// - Each character is its own node and stays once typed, so no text changes under the reader. It
//   sits where it sits in the finished line (the kerning with the character before it is kept).
//   A swap to one whole-line node after typing was tried and dropped: contextual forms (Nunito
//   raises "*" between digits) made the line jump for one frame.
// - The text is measured. A line that is wider than its box wraps at word boundaries, and typing
//   runs on into the next line. The box (with the cursor) stays inside the text-safe area.
// - An optional block cursor follows the last character, blinks when typing ends, and leaves at
//   `cursorUntil` (or `until`).
// - At `until`, the text and the cursor leave: a fade, or one frame with `exit: "cut"`. The default is the system's
//   text vocabulary: one frame in a one-frame system and in a system whose text cuts (Kinetic, Raw, Console, Title).
//   An `until` on the frame of the last typed key, or before it, is honoured (a key after `until` never shows).
// - `replaces: "<id>"`: the text that this label takes the place of leaves on the frame this one starts
//   (blocks/handover.ts), so two labels in one slot never show at once, not even while one fades.
// - `content: "data"`: the text is a diagram or chart label, not prose. The density rule and the reading-time rule
//   skip it (TextNode.content).
import { leaveAt, onGrid, steps as stepKeys, windows } from "../context";
import { vocabulary } from "../vocabulary";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node } from "../types";
import type { TypeRole } from "../../systems";
import { caseCtx, layoutLines, lineSafe } from "./text";

export type TypeOnProps = {
  id?: string;
  x: number; y: number;
  /** The width of the box. A longer line wraps. Default: all the room to the safe edge. */
  w?: number;
  text: string;
  /** Default: label. */
  role?: TypeRole;
  /** Default: inkMuted. */
  color?: ColorRole;
  pace?: "write" | "human";
  cursor?: boolean;
  /** When the cursor leaves (as when the next prompt takes it). Default: `until`. */
  cursorUntil?: number;
  /** Keep the case as written, also in a role the system sets in capitals (units: "994 mm", "1 s"). */
  keepCase?: boolean;
  at: number;
  until?: number;
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /** How it leaves at `until`: "fade" or "cut" (one frame). Default: the system's text vocabulary (cut in a one-frame system). */
  exit?: "fade" | "cut";
  /** The id of a block that holds this place before: it leaves on the frame this one starts. */
  replaces?: string;
  /** "data": a diagram or chart label (density and reading time skip it). Default "prose". */
  content?: "prose" | "data";
};

const F = 1 / 30;
/** Each key time on the frame grid, so it shows on frameOf of the time it stands for (context.ts). */
const snap = onGrid;

/** The time each character appears, from the first (at `at`) to the last. */
export function keyTimes(ctx: Ctx, text: string, at: number, pace?: "write" | "human"): number[] {
  const human = (pace ?? (ctx.instant ? "human" : "write")) === "human";
  const out: number[] = [];
  let t = at;
  for (let i = 0; i < text.length; i++) {
    out.push(snap(t));
    if (!human) { t += 0.025; continue; }
    // A fixed variation from the character and its place: between 0.7 and 1.3 times the base interval.
    const c = text.charCodeAt(i);
    const v = Math.abs(Math.sin(c * 12.9898 + i * 78.233)) * 43758.5453;
    const jitter = 0.7 + 0.6 * (v - Math.floor(v));
    let gap = jitter / 14;
    if (text[i] === " ") gap += 0.05;
    if (/[.,;:!?]/.test(text[i]!)) gap += 0.15;
    t += gap;
  }
  // At the "write" pace, two or more characters can land on one frame; they then appear together.
  return out;
}

/** When the last character of a typeOn appears. Scenes use it to time what follows. */
export function typeOnEnd(p: Pick<TypeOnProps, "text" | "at" | "pace">, ctx: Ctx): number {
  const ts = keyTimes(ctx, p.text, p.at, p.pace);
  return ts[ts.length - 1] ?? p.at;
}

/** Shown from `a` until `b` (b undefined: until the end), with a fade at `until` if it is still shown. */
function window(ctx: Ctx, a: number, b: number | undefined, until?: number, cut = false): Key[] {
  if (b !== undefined && (until === undefined || b < until)) return windows([[a, b]]);
  // A character that would come after the block leaves never shows; the exit is the shared one (leaveAt), or a cut.
  if (until !== undefined && a >= until) return [{ t: 0, v: 0 }];
  if (cut) return windows([[a, until]]);
  return leaveAt(ctx, windows([[a, undefined]]), until, 0);
}

export const typeOn: Block<TypeOnProps> = (p, ctx0) => {
  const ctx = caseCtx(ctx0, p.keepCase);
  const id = p.id ?? "type";
  const role = p.role ?? "label";
  const color = p.color ?? "inkMuted";
  const cutOut = ctx.instant || (p.exit ?? (vocabulary(ctx).text === "cut" ? "cut" : "fade")) === "cut";
  const lh = ctx.lineHeight(role), size = ctx.size(role);
  const cur = { w: Math.round(size * 0.55), h: Math.round(size * 0.9), gap: Math.max(2, Math.round(size * 0.08)) };
  // With a cursor, every line leaves room for it, so the cursor never passes the box or the safe edge.
  const first = layoutLines(ctx, p.text, role, p.x, p.y, p.w);
  const lines = p.cursor ? layoutLines(ctx, p.text, role, p.x, p.y, first.width - cur.gap - cur.w).lines : first.lines;
  // Type the lines as one stream: line breaks replace spaces.
  const stream = lines.join(" ");
  const times = keyTimes(ctx, stream, p.at, p.pace);
  const end = times[times.length - 1] ?? p.at;
  const out: Node[] = [];
  // One node per visible character. It appears at its key time and stays until the block leaves, so
  // no text ever changes under the reader. Its x is the width of the text up to and including it,
  // less its own width: that keeps the kerning between it and the character before it.
  const steps: { line: number; text: string; t: number }[] = [];
  let k = 0;
  lines.forEach((line, li) => {
    const ly = p.y + li * lh;
    const full = ctx.measure(line, role);
    if (!lineSafe(ctx, role, { x: p.x, y: ly, w: full + (p.cursor ? cur.gap + cur.w : 0), h: lh })) {
      console.warn(`typeOn ${id}: line "${line}" is outside the text-safe area`);
    }
    for (let c = 0; c < line.length; c++) {
      const t = times[k + c]!;
      steps.push({ line: li, text: line.slice(0, c + 1), t });
      if (line[c] === " ") continue;
      const x = p.x + ctx.measure(line.slice(0, c + 1), role) - ctx.measure(line[c]!, role);
      out.push({ id: `${id}-${li}-${c}`, kind: "text", x, y: ly, text: line[c]!, role, color, ...(p.keepCase ? { keepCase: true } : {}),
        ...(p.content === "data" ? { content: "data" as const } : {}), tracks: { opacity: window(ctx, t, undefined, p.until, cutOut) } });
    }
    k += line.length + 1;
  });

  if (p.cursor && steps.length) {
    // The cursor sits one gap after the typed text and moves with each step, in one frame.
    const pos = (s: { line: number; text: string }) => ({ x: ctx.measure(s.text, role) + cur.gap, y: s.line * lh });
    const xc: [number, number][] = [], yc: [number, number][] = [];
    for (const [i, s] of steps.entries()) {
      const at = pos(s);
      // Steps on one frame: the cursor goes straight to the last of them.
      if (steps[i + 1] && steps[i + 1]!.t === s.t) continue;
      xc.push([s.t, at.x]); yc.push([s.t, at.y]);
    }
    // Shown while typing, then blinks once a second until it leaves.
    const leave = p.cursorUntil ?? p.until;
    const blink: [number, number][] = [[p.at, 1]];
    const stop = leave ?? end + 4;
    let on = false;
    for (let t = end + 0.5; t + 0.5 <= stop; t += 0.5, on = !on) blink.push([t, on ? 1 : 0]);
    // It ends shown, or leaves at `leave` (a cut one frame after its last blink at the latest).
    if (leave !== undefined) blink.push([Math.max(leave, blink[blink.length - 1]![0] + F), 0]);
    else if (blink.length > 1 && blink[blink.length - 1]![1] === 0) blink.push([blink[blink.length - 1]![0] + 0.5, 1]);
    out.push({ id: `${id}-cursor`, kind: "rect", x: p.x, y: p.y + (lh - cur.h) / 2, w: cur.w, h: cur.h, fill: color,
      tracks: { x: stepKeys(0, xc), y: stepKeys(0, yc), opacity: stepKeys(0, blink) } });
  }
  return out;
};
