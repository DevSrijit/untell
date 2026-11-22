// Terminal: a shell session. A prompt, a command typed at a human rate, then its output line by line.
//
// Rules this block enforces:
// - A terminal at 0 s (or before) shows its panel and first prompt from frame 0, as text blocks do.
// - Commands type at a variable human rate, a little slower after spaces and symbols. Each key lands
//   on its own frame. Rates come from the character index, not from randomness.
// - After Enter, the output answers: the first line after the command's run time, the next lines a
//   few frames apart, as a real program prints them.
// - The cursor is a block after the last typed character. It is solid while the person types and
//   blinks (opacity steps, 0.5 s on, 0.5 s off) while the prompt waits. It hides while a command runs.
// - When the rows exceed the box, the session scrolls one row at a time, in whole-row steps as a real
//   terminal does: the top row disappears on the same frame. No text ever leaves the box.
// - Text uses the code role (mono when the system has one), or the `role` the scene gives, so the type can
//   be large (Console sets its session in headline). Each character sits at x0 + measure(prefix).
// - The panel and the text column have separate edges: `inset` moves the text column inside the panel, so
//   a panel can span the margins while the text stays in the text-safe area. The panel is a pane
//   (blocks/pane.ts), so a terminal, a code block and a picture window share one border and one inset.
// - Commands and output are never cut: the panel widens to the text-safe edge, then the session steps down a role
//   (never under codeFloor, and only to a role at 85 % of the size or more), then a long line wraps with a hanging indent (a command keeps typing on the
//   rows under it), and a token wider than the column throws. Below lowBandTop at 9:16, a row ends by lowBandRight.
// - A wrapped command never ends on one word alone (a widow) where another break fits; where none does, it warns.
//   Every row passes textSafe: with the default inset the text column starts at the text-safe left edge or inside it,
//   so a panel as wide as the picture-safe area keeps its rows in ctx.safe.
// - `resultRole` sets the result line in a larger role (it takes the rows its height needs); `fit` says what
//   happens when it is too wide (blocks/fit.ts). terminalHeight() and terminalRows() give the panel height a
//   session needs, so a scene can stack things under it. terminalTimes() gives the time of each prompt, key, Enter,
//   output line and the result, so a scene places hits and reveals on them.
// - The prompt is muted. The accent is for the one result: an output line with `result: true` is set in
//   accentText, and it names its place (anchor `<id>-result`). A result must stay on screen: the block
//   warns when a later row scrolls it out.
// - `status`: a status line at the panel's foot, under a hairline, in the label role and inkMuted. Its right
//   text may change at given times (a clock, a counter), each change in one frame. Its texts share one baseline,
//   and their ink (not their line box) is centred between the hairline and the panel's foot.
// - Weight split: commands are bold and output is regular, where the system loads both weights for the
//   session's font (layout.loadedWeights): the heaviest weight of 600 or more for commands, 400 for output and
//   the prompt. A system that loads one weight sets the whole session in it. Each string is measured in its own
//   weight, so the typed characters and the cursor stay on their glyphs.
// - The panel draws no window chrome: no title-bar dots. A window head comes from uiWindow, by the system.
import { crisp, present, px, steps as stepKeys, textSafe } from "../context";
import { centreInk, inkKind, loadedWeights } from "../layout";
import type { TypeRole } from "../../systems";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node } from "../types";
import { fitOf, steppedDown, type FitPolicy } from "./fit";
import { codeFloor, codeRole, fitText, rowPitch, snap, typed, typeTimes, windows, wrapCode } from "./codeBlock";
import { paneInset, panelNode } from "./pane";

export type TerminalLine = string | {
  text: string;
  /** "muted", "accent", "positive" or "negative". */
  tone?: "muted" | "accent" | "positive" | "negative";
  /** The one line the film is about. It is set in the accent, and it must stay on screen. */
  result?: boolean;
  /** Seconds after the previous line. */
  after?: number;
};

export type TerminalProps = {
  id?: string;
  /** The panel's box in px. `h` left out: the height its rows need (terminalHeight), so the panel is never an empty box. */
  x: number; y: number; w: number; h?: number;
  /** The commands, each with the lines it prints. */
  session: { command: string; output?: TerminalLine[]; /** Seconds the command runs before its first line. Default 0.2. */ run?: number; /** Seconds the prompt waits before typing. Default 0.7. */ pause?: number }[];
  /** The prompt (default "$"). */
  prompt?: string;
  /** Typing rate in characters a second (default 13). */
  cps?: number;
  /** The type role of the session. Default: the code role. A large role (headline) reads at a glance on a phone. */
  role?: TypeRole;
  /**
   * The type role of the result line (`result: true`). Default: the session's role. A larger role (headline,
   * display) makes the proof read at a glance; the line then takes as many rows as its height needs.
   */
  resultRole?: TypeRole;
  /** When the result line does not fit the panel's width in `resultRole`: "shrink" steps down a role and warns, "throw" (and "wrap", since a result is one line) stops. Default: the system's (blocks/fit.ts). */
  fit?: FitPolicy;
  /** The distance from the panel's edges to the text column, px. Default: the pane inset on both axes. */
  inset?: { x: number; y: number };
  /**
   * A status line at the panel's foot: left text, and right text that may change at given times. With `foot` past the
   * text-safe foot it sits at the panel's top instead (as a terminal multiplexer can set it), so its text stays safe.
   */
  status?: { left?: string; right?: string | { text: string; at: number }[] };
  /**
   * The y the panel's body runs down to, px (9:16: the picture-safe foot, so the pane hangs into the low band as a
   * picture). The session keeps its rows where they are; the space under the prompt is the terminal's own empty
   * screen. With `h`, the rows scroll inside `h` (keep it inside the text-safe area) and the body runs on to `foot`.
   */
  foot?: number;
  /**
   * How the session ends: "prompt" (the default) shows a last prompt that waits for the next command; "result" ends
   * on the last output line, so a run that proves the code ends on its proof and the panel takes no empty row.
   */
  end?: "prompt" | "result";
  at: number;
  until?: number;
};

const F = 1 / 30;
const TONE: Record<string, ColorRole> = { muted: "inkMuted", accent: "accentText", positive: "positive", negative: "negative" };

type Row = { at: number; kind: "prompt" | "out" | "cont"; text: string; color: ColorRole; result?: boolean; typeAt?: number; times?: number[]; enter?: number; role?: TypeRole;
  /** A wrapped row: its hanging indent, px. A "cont" row continues the command typed on the prompt row above it. */
  indent?: number; contFrom?: number };

/**
 * The panel height that holds `rows` rows of a terminal session (and its status line), so a scene can stack things
 * under a terminal without guessing. A result line in a larger `resultRole` counts as the rows its height needs:
 * give `resultRows` (terminalRows tells you how many).
 */
export function terminalHeight(ctx: Ctx, o: { rows: number; role?: TypeRole; status?: boolean; inset?: { y: number } }): number {
  const role = o.role ?? codeRole(ctx);
  const iy = o.inset?.y ?? paneInset(ctx);
  const statusH = o.status ? Math.ceil(ctx.size("label") * Math.max(ctx.system.type.label.leading, 1.4)) + iy : 0;
  return 2 * iy + o.rows * rowPitch(ctx, role) + statusH;
}

/** The rows a session takes in a terminal: each command, each output line (a result in a larger role counts as more), and the last prompt (none with end "result"). */
export function terminalRows(ctx: Ctx, p: Pick<TerminalProps, "session" | "role" | "resultRole" | "end">): number {
  const role = p.role ?? codeRole(ctx);
  const resultRows = p.resultRole ? Math.ceil(rowPitch(ctx, p.resultRole) / rowPitch(ctx, role) - 1e-6) : 1;
  return p.session.reduce((n, c) => n + 1 + (c.output ?? []).reduce((m, o) => m + (typeof o !== "string" && o.result ? resultRows : 1), 0), 0) + (p.end === "result" ? 0 : 1);
}

/**
 * When each part of a terminal session comes, s (terminalTimes): the block's own event times. Give one to another
 * block's `at` (a hit, a highlight, B.reveal) and it changes on the same frame; frameOf(t) / FPS is that frame.
 */
export type TerminalTimes = {
  /** Per command: its prompt, the first key, every key, the last key (the command typed), Enter, and each output line. */
  commands: { prompt: number; typeAt: number; keys: number[]; typed: number; enter: number; lines: number[] }[];
  /** The result line (`result: true`), or null when the session has none. */
  result: number | null;
  /** The last, waiting prompt (end "prompt"), or the last output line (end "result"). */
  lastPrompt: number;
};

/**
 * The times a terminal session shows each part: the block's own timing, so a scene places a hit, a reveal or the next
 * block on them and never computes them by hand (from `at`, the entrance, `pause`, the key times, `cps` and `run`).
 * A terminal at 0 s or before shows its first prompt on frame 0 (the entrance is not waited for), as the header says.
 * Before: the first prompt waited the entrance (0.43 s of an empty pane at 0 s), and the scene had no way to know
 * when the result showed.
 */
export function terminalTimes(ctx: Ctx, p: Pick<TerminalProps, "session" | "cps" | "at" | "end">): TerminalTimes {
  return schedule(ctx, p);
}

/** The session's schedule, the times the block keys its rows on (terminalTimes gives the frames that show them). */
function schedule(ctx: Ctx, p: Pick<TerminalProps, "session" | "cps" | "at" | "end">): TerminalTimes {
  const at = snap(p.at), cps = p.cps ?? 13;
  // The session's clock starts after the panel's entrance. A terminal at 0 s or before shows its first prompt from
  // frame 0 (it waits there until it types), so the pane is never empty at the start; every later time is the same.
  let t = at + (ctx.instant ? 0 : ctx.dur.enter);
  let result: number | null = null;
  const commands = p.session.map((c, ci) => {
    const clock = snap(t);
    const prompt = ci === 0 && at <= 0 ? Math.min(clock, 0) : clock;
    const typeAt = snap(clock + (c.pause ?? 0.7));
    const keys = typeTimes(c.command, typeAt, cps, ci + 3);
    const enter = snap(keys[keys.length - 1]! + 0.3);
    t = enter + (c.run ?? 0.2);
    const lines = (c.output ?? []).map((o, k) => {
      const line = typeof o === "string" ? { text: o } as Exclude<TerminalLine, string> : o;
      if (k) t += line.after ?? (2 + ((k * 7) % 3)) * F; // a few frames apart, unevenly
      if (line.result && result === null) result = snap(t);
      return snap(t);
    });
    t += 0.15;
    return { prompt, typeAt, keys, typed: keys[keys.length - 1] ?? typeAt, enter, lines };
  });
  return { commands, result, lastPrompt: snap(t) };
}

export const terminal: Block<TerminalProps> = (p0, ctx) => {
  const id = p0.id ?? "term";
  // Commands and output are never cut. When the longest does not fit the text column: the panel widens to the
  // text-safe edge; then the session steps down a role, never under codeFloor (what reads on a phone); then each
  // long line wraps at a token with a hanging indent (wrapCode), a command onto rows that keep typing; and a token
  // wider than the column throws.
  const asked = p0.role ?? codeRole(ctx);
  const prompt0 = (p0.prompt ?? "$") + " ";
  const ix0 = p0.inset?.x ?? paneInset(ctx);
  // The height before the rows are known: the one given, or an estimate from the session (set exactly below).
  const h0 = p0.h ?? terminalHeight(ctx, { rows: terminalRows(ctx, p0), role: asked, status: !!p0.status, inset: p0.inset });
  const edge0 = p0.y + h0 > ctx.safe.lowBandTop ? ctx.safe.lowBandRight : ctx.safe.right;
  const widest = (r: TypeRole) => {
    const kc = ctx.system.type[r].uppercase ? { keepCase: true } : {};
    const w = terminalWeights(ctx.system, r);
    return Math.max(0, ...p0.session.flatMap((c) => [ctx.measure(prompt0, r, { ...kc, ...(w.output !== undefined ? { weight: w.output } : {}) }) + ctx.measure(c.command, r, { ...kc, ...(w.command !== undefined ? { weight: w.command } : {}) }),
      ...(c.output ?? []).filter((o) => typeof o === "string" || !o.result).map((o) => ctx.measure(typeof o === "string" ? o : o.text, r, { ...kc, ...(w.output !== undefined ? { weight: w.output } : {}) }))]));
  };
  // The text column's left edge: the inset from the panel, and by default never left of the text-safe edge (a panel
  // as wide as the picture-safe area keeps its rows in ctx.safe: the round-three proof found them 25 px outside).
  const left0 = p0.inset?.x !== undefined ? p0.x + ix0 : Math.max(p0.x + ix0, ctx.safe.left);
  const roomOf = (w: number) => Math.min(p0.x + w - ix0, edge0) - left0;
  let pw = p0.w;
  if (widest(asked) > roomOf(pw)) {
    const wide = Math.max(pw, edge0 + ix0 - p0.x);
    if (wide > pw) { pw = wide; console.warn(`terminal ${id}: the panel widens to ${Math.round(pw)} px so its lines reach the text-safe edge`); }
  }
  let role = asked;
  if (widest(role) > roomOf(pw)) {
    const down = (["headline", "body", "caption", "label"] as TypeRole[]).filter((r) => ctx.size(r) < ctx.size(asked) && ctx.size(r) >= codeFloor(ctx) - 0.5
      && ctx.system.fonts[ctx.system.type[r].font] === ctx.system.fonts[ctx.system.type[asked].font]).sort((a, b) => ctx.size(b) - ctx.size(a));
    // One step down only when it keeps most of the size (85 %): a large drop costs more than a wrap at a space, so
    // a session in headline keeps it and wraps its long command instead (Console: "$ python3" over "search.py").
    const pick = down.find((r) => widest(r) <= roomOf(pw) && ctx.size(r) >= ctx.size(asked) * 0.85);
    if (pick) { role = pick; console.warn(`terminal ${id}: the session steps down from ${asked} to ${pick} to fit its lines`); }
  }
  const p = { ...p0, w: pw };
  // A role that the system sets in capitals keeps the case as written: commands are case-sensitive.
  const keepCase = ctx.system.type[role].uppercase ? true : undefined;
  // The weight split: bold commands over regular output, when the system loads both for this role's family.
  const wts = terminalWeights(ctx.system, role);
  const wOpt = (w: number | undefined) => (w !== undefined ? { weight: w } : {});
  const measure = (t: string, w?: number) => ctx.measure(t, role, keepCase || w !== undefined ? { ...(keepCase ? { keepCase } : {}), ...wOpt(w) } : undefined);
  const mctx = keepCase ? { ...ctx, measure: (t: string, r: TypeRole, o?: { weight?: number }) => ctx.measure(t, r, { ...o, keepCase: true }) } : ctx;
  const size = ctx.size(role);
  const lh = rowPitch(ctx, role);
  const ix = p.inset?.x ?? paneInset(ctx), iy = p.inset?.y ?? paneInset(ctx);
  const at = snap(p.at);
  const until = p.until !== undefined ? snap(p.until) : undefined;
  const prompt = (p.prompt ?? "$") + " ";
  const s = ctx.safe;
  // The status line takes the foot of the panel: a hairline, then one label row. A panel that runs past the text-safe
  // foot (foot) sets it at its top, under the top inset, with the hairline under it.
  const labelH = Math.ceil(ctx.size("label") * Math.max(ctx.system.type.label.leading, 1.4));
  const statusH = p.status ? labelH + iy : 0;
  const statusTop = !!p.status && p0.foot !== undefined && p0.foot > s.bottom;
  const left = left0, top = p.y + iy + (statusTop ? statusH : 0);
  let ph = h0;
  const x0 = left + measure(prompt, wts.output);

  // The session as rows in time.
  const rows: Row[] = [];
  const T = schedule(ctx, p);
  // The room of a row, for wrapping: the narrower of the column and, at 9:16, the low band's edge.
  const roomEnd = Math.min(p.x + p.w - ix, p.y + ph > s.lowBandTop ? s.lowBandRight : s.right);
  const mCmdW = (t: string) => measure(t, wts.command), mOutW = (t: string) => measure(t, wts.output);
  // The hanging indent of a wrapped row: two spaces at 9:16 (a narrow column), four elsewhere.
  const hang = ctx.height > ctx.width ? "  " : "    ";
  p.session.forEach((c, ci) => {
    const ct = T.commands[ci]!;
    const row: Row = { at: ct.prompt, kind: "prompt", text: c.command, color: "ink" };
    row.typeAt = ct.typeAt;
    row.times = ct.keys;
    row.enter = ct.enter;
    const wc = wrapCode(mCmdW, c.command, roomEnd - x0, `terminal ${id}: the command "${c.command}"`, hang, { widow: true });
    if (wc.widow) console.warn(`terminal ${id}: the command "${c.command}" wraps and leaves "${wc.widow}" alone on its last row; shorten the command, use a smaller role, or give the panel more width`);
    row.text = wc.rows[0]!;
    rows.push(row);
    // A wrapped command keeps typing on the rows under it, at the hanging indent.
    let done = row.text.length;
    const at0 = rows.length - 1;
    wc.rows.slice(1).forEach((part) => {
      const skip = c.command.slice(done).length - c.command.slice(done).trimStart().length; // the space at the break
      const times = row.times!.slice(done + skip, done + skip + part.length);
      rows.push({ at: times[0]!, kind: "cont", text: part, color: "ink", times, enter: row.enter, indent: wc.indent, contFrom: at0 });
      done += skip + part.length;
    });
    (c.output ?? []).forEach((o, k) => {
      const line = typeof o === "string" ? { text: o } as Exclude<TerminalLine, string> : o;
      const t = ct.lines[k]!;
      const color: ColorRole = line.result ? "accentText" : line.tone ? TONE[line.tone]! : "ink";
      // An output line wraps at its tokens with a hanging indent (a result in its own role keeps its one line).
      const parts = line.result && p.resultRole ? { rows: [line.text], indent: 0 } : wrapCode(mOutW, line.text, roomEnd - left, `terminal ${id}: the output "${line.text}"`, hang);
      rows.push({ at: snap(t), kind: "out", text: parts.rows[0]!, color, ...(line.result ? { result: true, role: p.resultRole ?? role } : {}) });
      for (const part of parts.rows.slice(1)) rows.push({ at: snap(t), kind: "out", text: part, color, indent: parts.indent });
      // A result in a larger role takes the rows its height needs: empty rows follow it.
      if (line.result && p.resultRole) for (let k = 1; k < Math.ceil(rowPitch(ctx, p.resultRole) / lh - 1e-6); k++) rows.push({ at: snap(t), kind: "out", text: "", color });
    });
  });
  // The last prompt waits for the next command, with a blinking cursor (end "result": the session ends on its proof).
  if (p.end !== "result") rows.push({ at: T.lastPrompt, kind: "prompt", text: "", color: "ink" });
  // With no height given, the panel holds every row: it never scrolls and never shows an empty band.
  if (p0.h === undefined) ph = 2 * iy + rows.length * lh + statusH;
  // The body runs on to `foot`: the rows stay where they are, so the rows that fit (and scroll) are counted in the
  // height before it: the session's own height, or `h` (a session that scrolls inside the text-safe part).
  const fitH = ph;
  if (p0.foot !== undefined) ph = Math.max(ph, p0.foot - p.y);
  const N = Math.max(1, Math.floor((fitH - 2 * iy - statusH) / lh)); // rows that fit (above the body's foot)

  // Scrolling: when row r (r >= N) appears, every row moves up so that it is the last row.
  const scrollAt = rows.map((r, i) => (i >= N ? r.at : undefined));
  const offsetAt = (time: number) => rows.reduce((o, r, i) => (i >= N && r.at <= time + 1e-6 ? i - N + 1 : o), 0);
  // Steps on one frame merge (steps): two rows that come in on one frame scroll once, by both.
  const yTrack = (from: number, to: number | undefined): Key[] | undefined => {
    const changes: [number, number][] = [];
    scrollAt.forEach((st, i) => {
      if (st === undefined || st <= from + 1e-6 || (to !== undefined && st >= to)) return;
      changes.push([st, -(i - N + 1) * lh]);
    });
    const keys = stepKeys(-offsetAt(from) * lh, changes);
    return keys.length > 1 || keys[0]!.v !== 0 ? keys : undefined;
  };
  // A row hides on the frame it scrolls out of the top.
  const goneAt = (i: number) => (i + N < rows.length ? rows[i + N]!.at : until);

  const out: Node[] = [];
  out.push(panelNode(ctx, `${id}-panel`, { x: p.x, y: p.y, w: p.w, h: ph }, "surface", present(at, until)));


  rows.forEach((r, i) => {
    const y = top + i * lh;
    const life = goneAt(i);
    const yk = yTrack(r.at, life);
    // The right edge on the row where it rests longest: the bottom row once the session scrolls.
    const restY = top + Math.min(i, N - 1) * lh;
    const right = Math.min(p.x + p.w - ix, restY + lh > s.lowBandTop ? s.lowBandRight : s.right);
    const box = (w: number, x: number) => ({ x, y: restY, w, h: lh });
    const kc = keepCase ? { keepCase } : {};
    if (r.kind === "out") {
      if (!r.text) return;
      // A result in its own role: it steps down a role (shrink) or throws when it does not fit the width.
      let rr = r.role ?? role;
      if (rr !== role) {
        const ladder = (["display", "headline", "body", "caption", "label"] as TypeRole[]).filter((x) => ctx.size(x) <= ctx.size(rr) && ctx.size(x) >= ctx.size(role));
        const asked = rr;
        rr = ladder.find((x) => ctx.measure(r.text, x, keepCase ? { keepCase } : undefined) <= right - left) ?? role;
        steppedDown(`terminal ${id}`, r.text, asked, rr, fitOf(ctx, p.fit));
      }
      const m = (t: string) => (rr === role ? measure(t, wts.output) : ctx.measure(t, rr, keepCase ? { keepCase } : undefined));
      const f = { text: r.text };
      const ox = left + (r.indent ?? 0);
      if (!textSafe(ctx, box(m(f.text), ox))) console.warn(`terminal ${id}: "${r.text}" is outside the text-safe area`);
      out.push({ id: `${id}-r${i}`, kind: "text", content: "code", x: ox, y, text: f.text, role: rr, color: r.color, ...kc, ...(rr === role ? wOpt(wts.output) : {}), tracks: { opacity: windows([[r.at, life]]), ...(yk ? { y: yk } : {}) } });
      if (r.result) {
        out.push({ id: `${id}-result`, kind: "anchor", x: left, y: restY, w: m(f.text), h: rr === role ? lh : rowPitch(ctx, rr), at: r.at });
        if (life !== undefined && (until === undefined || life < until)) console.warn(`terminal ${id}: the result "${r.text}" scrolls out at ${life.toFixed(2)} s; give the panel more rows or end the session on it`);
      }
      return;
    }
    // A command's wrapped row: its part typed at the hanging indent, with the cursor while it types.
    if (r.kind === "cont") {
      const cx = x0 + (r.indent ?? 0);
      const tp = typed(mctx, { id: `${id}-r${i}-cmd`, x: cx, y, role, segments: [{ text: r.text, color: "ink" }], times: r.times!, until: life, y_: yk, ...wOpt(wts.command) });
      if (keepCase) for (const n of tp.nodes) if (n.kind === "text") n.keepCase = true;
      out.push(...tp.nodes);
      const cw = Math.round(measure("0", wts.command) * 0.92), ch = Math.round(size * 1.12);
      const xs = stepKeys(0, r.times!.map((tk, k) => [tk, tp.caret[k]! - cx] as [number, number]));
      out.push({ id: `${id}-r${i}-cursor`, kind: "rect", x: cx, y: y + Math.round((lh - ch) / 2), w: cw, h: ch, fill: "ink",
        tracks: { opacity: windows([[r.times![0]!, life !== undefined ? Math.min(life, r.enter!) : r.enter!]]), x: xs, ...(yk ? { y: yk } : {}) } });
      return;
    }
    // The prompt.
    out.push({ id: `${id}-r${i}-ps`, kind: "text", content: "code", x: left, y, text: prompt.trimEnd(), role, color: "inkMuted", ...kc, ...wOpt(wts.output), tracks: { opacity: windows([[r.at, life]]), ...(yk ? { y: yk } : {}) } });
    // The command, typed.
    let caret: number[] = [];
    if (r.text) {
      const f = { text: r.text };
      if (!textSafe(ctx, box(x0 - left + measure(f.text, wts.command), left))) console.warn(`terminal ${id}: "${r.text}" is outside the text-safe area`);
      const times = r.times!.slice(0, f.text.length);
      while (times.length < f.text.length) times.push(times[times.length - 1]! + F);
      const tp = typed(mctx, { id: `${id}-r${i}-cmd`, x: x0, y, role, segments: [{ text: f.text, color: "ink" }], times, until: life, y_: yk, ...wOpt(wts.command) });
      if (keepCase) for (const n of tp.nodes) if (n.kind === "text") n.keepCase = true;
      out.push(...tp.nodes);
      caret = tp.caret;
    }
    // The cursor: blinks while the prompt waits, solid while typing, hidden while the command runs.
    const cw = Math.round(measure("0", wts.command) * 0.92), ch = Math.round(size * 1.12);
    const spans: [number, number | undefined][] = [];
    const blink = (a: number, b: number | undefined) => {
      const stop = b ?? a + 30;
      for (let u = a; u < stop - 1e-6; u += 1) spans.push([u, Math.min(u + 0.5, b ?? u + 0.5)]);
    };
    const typeAt = r.typeAt ?? until ?? r.at + 30;
    blink(r.at, r.text ? typeAt : until);
    // Solid while it types; a command that wraps hands the cursor to its next row when that row starts.
    const next = rows.find((q) => q.kind === "cont" && q.contFrom === i);
    if (r.text) spans.push([typeAt, next ? next.times![0]! : r.enter!]);
    const xs: Key[] = r.text ? stepKeys(0, r.times!.slice(0, caret.length).map((tk, k) => [tk, caret[k]! - x0] as [number, number])) : [{ t: 0, v: 0 }];
    out.push({ id: `${id}-r${i}-cursor`, kind: "rect", x: x0, y: y + Math.round((lh - ch) / 2), w: cw, h: ch, fill: "ink",
      tracks: { opacity: windows(spans.filter(([a]) => life === undefined || a < life).map(([a, b]) => [a, life !== undefined && (b === undefined || b > life) ? life : b])),
        ...(xs.length > 1 || xs[0]!.v !== 0 ? { x: xs } : {}), ...(yk ? { y: yk } : {}) } });
  });

  // The status line: a hairline across the panel, then the left and right texts on one label row.
  if (p.status) {
    const ruleY = px(statusTop ? p.y + statusH : p.y + ph - statusH);
    // The status texts share one baseline: their ink (x-height when any has lower case) centred under the rule.
    const sTexts = [p.status.left ?? "", ...(typeof p.status.right === "string" ? [p.status.right] : (p.status.right ?? []).map((r) => r.text))].filter(Boolean);
    const sKind = sTexts.some((t) => inkKind(ctx.system, "label", t) === "x") ? "x" : sTexts.join("") || "x";
    const sy = statusTop ? centreInk(ctx, sKind, "label", { y: p.y + iy * 0.5, h: labelH }) : centreInk(ctx, sKind, "label", { y: ruleY, h: p.y + ph - ruleY });
    const show = present(at, until);
    const rw = Math.max(1, Math.round(ctx.stroke * 0.5));
    out.push({ id: `${id}-status-rule`, kind: "path", d: `M${px(p.x)} ${crisp(ruleY, rw)}H${px(p.x + p.w)}`, stroke: "rule", width: rw, tracks: show });
    const sRight = Math.min(p.x + p.w - ix, sy + labelH > s.lowBandTop ? s.lowBandRight : s.right);
    let leftEnd = left;
    if (p.status.left) {
      const f = fitText(ctx, p.status.left, "label", (sRight - left) / 2);
      leftEnd = left + ctx.measure(f.text, "label");
      if (!textSafe(ctx, { x: left, y: sy, w: leftEnd - left, h: labelH }, "label")) console.warn(`terminal ${id}: the status line is outside the text-safe area`);
      out.push({ id: `${id}-status-l`, kind: "text", x: left, y: sy, text: f.text, role: "label", color: "inkMuted", tracks: present(at, until) });
    }
    const states = typeof p.status.right === "string" ? [{ text: p.status.right, at }] : (p.status.right ?? []).map((r) => ({ text: r.text, at: snap(r.at) }));
    states.forEach((st, k) => {
      const end = states[k + 1]?.at ?? until;
      const w = ctx.measure(st.text, "label");
      const x = sRight - w;
      if (x < leftEnd + ix) console.warn(`terminal ${id}: the status texts touch; shorten them`);
      if (!textSafe(ctx, { x, y: sy, w, h: labelH }, "label")) console.warn(`terminal ${id}: the status line is outside the text-safe area`);
      // A text that changes stays the same width only in a mono role; the right edge stays fixed either way.
      out.push({ id: `${id}-status-r${k}`, kind: "text", x, y: sy, text: st.text, role: "label", color: "inkMuted", tracks: present(st.at, end) });
    });
  }

  // A terminal that starts at 0 (or before) shows its panel and its first prompt from frame 0, so a film can open
  // on it: windows() and present() show a window that starts at 0 or before from frame 0.
  return out;
};

/**
 * The weights of a terminal session in a role: `command` (bold) and `output` (regular, also the prompt). Each is
 * undefined when it equals the role's own weight, so the node keeps the role's weight. When the system loads
 * no bold (600 or more) and no regular (400 or less) for the role's family, both are undefined.
 */
export function terminalWeights(system: import("../../systems").System, role: TypeRole): { command?: number; output?: number } {
  const ws = loadedWeights(system, role);
  const bold = ws.filter((w) => w >= 600).pop(), regular = ws.filter((w) => w <= 400).pop();
  if (bold === undefined || regular === undefined) return {};
  const own = system.type[role].weight;
  return { ...(bold !== own ? { command: bold } : {}), ...(regular !== own ? { output: regular } : {}) };
}
