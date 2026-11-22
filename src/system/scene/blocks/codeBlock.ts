// Code block: real code at a readable size, with line numbers and one highlighted line at a time.
//
// Rules this block enforces:
// - Code uses the system's mono role when it has one (never an uppercase role). Else it uses the
//   smallest role that keeps the case as written. Every token sits at x0 + measure(prefix), so a
//   proportional font lines up as well as a mono one.
// - Syntax colour comes from roles, at most four: ink for code, inkMuted for comments and line numbers, and
//   the roles in `syntax` for keywords and literal values (strings and numbers). The default keeps keywords
//   and literals in ink, so the accent stays free for the one thing a frame is about. `literals: "accent"`
//   sets literals in accentText. A system's signature (blocks/signature.ts) may set its own syntax roles.
// - Code is never cut. A line that does not fit: the panel widens to the text-safe edge, then the code steps down a
//   role (never under codeFloor: body size, what reads on a phone), then the line wraps at a token with a hanging
//   indent, and a token wider than the column throws. Below lowBandTop at 9:16, the column ends by lowBandRight.
//   Lines that do not fit the box height are left out, and the block reports it.
// - One line is highlighted at a time: a band behind it, and its line number turns from inkMuted to ink.
//   The band is a shape, so the mark never rides on colour alone. It moves from line to line on the
//   system's move curve; with `jump: "cut"`, a jump of more than one line cuts, so the band never shows
//   a line the film is not about.
// - The band reads the system's signature: the rule colour by default; in Manual, the teal accent at a
//   tint, a solid accent bar in the gutter, and the line number in the accent. The tint is the strongest
//   at which every text colour on the band (ink, the muted comments, the syntax roles, the line number)
//   still passes 4.5:1 (signature.ts, tintAlpha). A system with no tint that passes keeps the rule band.
// - Rows come on by `enter`: they rise out of their masks one after another ("rise"), show at rest ("rest"), or
//   type on at a human rate in their syntax colours ("type"). A block at 0 or before shows at rest on frame 0, as
//   every text block does; with "type", its first row is at rest and the rest type on from there. The default
//   outside frame 0 comes from the system's vocabulary. A line number turns to ink when the band arrives on its
//   line, and back to inkMuted when the band leaves.
import { crisp, go, onGrid, present, px, seq, textSafe, windows } from "../context";
import type { TypeRole } from "../../systems";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Key, Node } from "../types";
import { codeTint, signature, type Syntax } from "./signature";
import { vocabulary } from "../vocabulary";

export type CodeBlockProps = {
  id?: string;
  /** The block's box in px. The panel fills it. `h` left out: the height its rows need, wrapped rows too, so the
   *  panel is never an empty box and no line is left out. */
  x: number; y: number; w: number; h?: number;
  /**
   * The y the panel's body runs down to, px (9:16: the picture-safe foot, so the pane hangs into the low band as a
   * picture). The code keeps its rows where they are; the body under them is empty. Ignored when `h` is given.
   */
  foot?: number;
  /** The code, one line per array item. Keep lines short: the block cuts long ones. */
  lines: string[];
  /** A file name, set in the label role above the code. */
  title?: string;
  /** The line to highlight (1-based) and when, in time order. */
  highlight?: { line: number; at: number }[];
  /** Number of the first line (default 1). */
  firstLine?: number;
  /** Colour literal values in the accent ("accent"), or keep them in ink ("ink", the default). */
  literals?: "accent" | "ink";
  /** Syntax colour roles per token kind. Default: the system's signature (comments muted, the rest ink). */
  syntax?: Syntax;
  /** The highlight band: "rule", or "tint" (the accent at a tint, with a gutter bar). Default: the system's signature. */
  band?: "rule" | "tint";
  /** How the band changes line: "sweep" (move curve), or "cut" for a jump of more than one line. Default: the signature. */
  jump?: "sweep" | "cut";
  /**
   * How the rows come on. "rise": each row rises out of its mask, a stagger after the one above. "rest": every row
   * shows at rest from `at` (in one frame; from frame 0 when `at` is 0 or before). "type": the rows type on one
   * after another at `cps`, each with its syntax colours; with `at` at 0 or before, the first `restRows` rows are at
   * rest on frame 0 and the rest type on from 0 (Manual's hook: the first line readable on frame 0, then it types).
   * Default: "rest" when `at` is 0 or before (the frame-0 rule of every text block), else the system's vocabulary
   * (scene/vocabulary.ts: "rise"). A highlight on a typed row must come after the row is typed, or the block throws.
   */
  enter?: "rise" | "rest" | "type";
  /** For `enter: "type"`: characters a second. Default 13, as the terminal types. */
  cps?: number;
  /** For `enter: "type"` with `at` at 0 or before: the rows at rest on frame 0 before the typing starts. Default 1. */
  restRows?: number;
  at: number;
  until?: number;
};

// ---------------------------------------------------------------- shared helpers (terminal uses them)

/**
 * The time on the frame grid whose change shows on the same frame as a change at t (frameOf, context.ts): the
 * start of the frame before it. Times from it add up in whole frames. A time at 0 or before stays as it is.
 * The switch of each cut sits off the frame grid (switchAt), so no sampled frame falls on a step.
 */
export const snap = onGrid;
const F = 1 / 30;

/**
 * The smallest size code may take: the system's body size. Code must read on a phone as body text does (the
 * reading-size check asks code for the body size in its own face). No code role steps below it.
 */
export const codeFloor = (ctx: Ctx) => ctx.size("body");

/**
 * The role for code: a mono role that keeps the case as written and reads on a phone (at least codeFloor), else the
 * smallest role that keeps the case and reads, else body.
 */
export function codeRole(ctx: Ctx): TypeRole {
  const ok = (["caption", "body", "label"] as const).filter((r) => !ctx.system.type[r].uppercase && ctx.size(r) >= codeFloor(ctx) - 0.5);
  const mono = ok.find((r) => ctx.system.type[r].font === "mono");
  if (mono) return mono;
  return [...ok].sort((a, b) => ctx.size(a) - ctx.size(b))[0] ?? "body";
}

/**
 * Breaks one line of code into rows no wider than `room` px, each row after the first with a hanging indent (the
 * line's own indent and `hang`). It takes the fewest rows, then the best breaks, then the most even rows:
 * - Best: after a comma at the outermost bracket level ("lo, hi = 0," | "len(xs) - 1"); then before a binary
 *   operator or after an assignment at that level ("mid = (lo + hi)" | "// 2", "mid =" | "(lo + hi) // 2"); then just
 *   inside an opening bracket ("print(" | "search(xs, 28))"); then a space deeper in brackets; last, between the
 *   tokens of a word too long for a row.
 * - No row is a lone short token ("2", "28))", "lo,"): such a row costs more than any other break. A row that starts
 *   with an operator ("// 2") is the continuation a reader expects, so it may be short.
 * Returns the rows (the first one as written, the others without their leading spaces) and the indent of the
 * continuation rows, px. Throws when one token alone is wider than a row, with the line and the width it needs.
 */
export function wrapCode(measure: (t: string) => number, line: string, room: number, where: string, hang = "    ", o: { widow?: boolean } = {}): { rows: string[]; indent: number; widow?: string } {
  if (measure(line) <= room) return { rows: [line], indent: 0 };
  const lead = /^\s*/.exec(line)![0];
  const indent = measure(lead + hang);
  const text = line.slice(lead.length);
  const OPS = /^(\/\/|\*\*|==|!=|<=|>=|and\b|or\b|\+|-|\*|\/|%|<|>|\||&)/;
  // Break points: `at` is where the next row starts (spaces between are dropped); `cost` ranks the break.
  const breaks = (fine: boolean) => {
    const out = new Map<number, number>();
    const put = (at: number, cost: number) => { if (at > 0 && at < text.length) out.set(at, Math.min(out.get(at) ?? Infinity, cost)); };
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if ("([{".includes(c)) {
        depth++;
        // Just inside an opening bracket, when the bracket holds something.
        if (text[i + 1] && !")]}".includes(text[i + 1]!)) put(i + 1, 3 + 2 * (depth - 1));
        continue;
      }
      if (")]}".includes(c)) { depth = Math.max(0, depth - 1); continue; }
      if (c !== " ") continue;
      let j = i; while (text[j] === " ") j++;
      const before = text.slice(0, i).trimEnd(), after = text.slice(j);
      if (depth === 0 && /,$/.test(before)) put(j, 0);
      else if (depth === 0 && OPS.test(after)) put(j, 1);
      else if (depth === 0 && /(=|:)$/.test(before)) put(j, 1);
      else put(j, 4 + 2 * depth);
    }
    // A word too long for a row: between its tokens.
    if (fine) for (const m of text.matchAll(/\w+|[^\w\s]/g)) put(m.index!, 50);
    return out;
  };
  const rowText = (a: number, b: number) => text.slice(a, b).trim();
  const fitsRow = (a: number, b: number) => measure(rowText(a, b)) <= (a === 0 ? room - measure(lead) : room - indent) + 0.5;
  // A lone short token: one run of characters with no space, of 4 or fewer, that does not start with an operator.
  const lone = (r: string) => !/\s/.test(r) && r.length <= 4 && !OPS.test(r);
  type Best = { rows: number; cost: number; widest: number; prev: number };
  const solve = (fine: boolean): number[] | null => {
    const B = breaks(fine);
    const points = [0, ...[...B.keys()].sort((a, b) => a - b), text.length];
    const best = new Map<number, Best>([[0, { rows: 0, cost: 0, widest: 0, prev: -1 }]]);
    const better = (a: Best, b: Best) => a.rows !== b.rows ? a.rows < b.rows : a.cost !== b.cost ? a.cost < b.cost : a.widest < b.widest;
    for (const b of points.slice(1)) {
      for (const a of points) {
        if (a >= b) break;
        const from = best.get(a);
        if (!from || !fitsRow(a, b)) continue;
        const r = rowText(a, b);
        // A command's last row that holds one word alone (a widow: "$ nelra -4" over "sovra") reads as a broken line.
        const widow = o.widow && b === text.length && a > 0 && !/\s/.test(r) ? 100 : 0;
        const cost = from.cost + (b < text.length ? B.get(b)! : 0) + (lone(r) ? 100 : 0) + widow;
        const cand = { rows: from.rows + 1, cost, widest: Math.max(from.widest, measure(r)), prev: a };
        const cur = best.get(b);
        if (!cur || better(cand, cur)) best.set(b, cand);
      }
    }
    const end = best.get(text.length);
    if (!end) return null;
    const cuts: number[] = [];
    for (let k = text.length; k > 0; k = best.get(k)!.prev) cuts.unshift(k);
    return cuts;
  };
  const cuts = solve(false) ?? solve(true);
  if (!cuts) {
    const tok = (text.match(/\S+/g) ?? [text]).reduce((a, b) => (measure(b) > measure(a) ? b : a));
    throw new Error(`${where}: "${tok}" alone is ${Math.ceil(measure(tok) - (room - indent))} px wider than the code column (${Math.round(room)} px), even wrapped. Break that line in the code, or give the block a wider box.`);
  }
  const rows: string[] = [];
  let from = 0;
  for (const c of cuts) { rows.push(rowText(from, c)); from = c; }
  const last = rows[rows.length - 1]!;
  return { rows: rows.map((r, k) => (k ? r : lead + r)), indent, ...(o.widow && rows.length > 1 && !/\s/.test(last) ? { widow: last } : {}) };
}

/**
 * The pitch of rows of plain (unmasked) text: the line height, but never less than the font's content
 * area (about 1.4 em for the fonts here). A plain text box is as tall as its content area, so rows set
 * closer than that have boxes that overlap by a few px.
 */
export const rowPitch = (ctx: Ctx, role: TypeRole) => Math.ceil(ctx.size(role) * Math.max(ctx.system.type[role].leading, 1.4));

/** Cuts a string until it fits `max` px with an ellipsis. */
export function fitText(ctx: Ctx, text: string, role: TypeRole, max: number): { text: string; cut: boolean } {
  if (ctx.measure(text, role) <= max) return { text, cut: false };
  let n = text.length;
  while (n > 1 && ctx.measure(text.slice(0, n).trimEnd() + "…", role) > max) n--;
  return { text: text.slice(0, n).trimEnd() + "…", cut: true };
}

/** Opacity keys that show a node during each [from, to) window and hide it between them (context.ts). */
export { windows };

/** A deterministic value in [0, 1) for an index: no randomness, the same on every render. */
const hash = (i: number, seed: number) => { const v = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453; return v - Math.floor(v); };

/**
 * Times at which each character of `text` appears when a person types it from `at`: a variable rate
 * around `cps`, a little slower after a space or a symbol. Each time is on its own frame.
 */
export function typeTimes(text: string, at: number, cps: number, seed = 1): number[] {
  const out: number[] = [];
  let t = at;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!, prev = text[i - 1];
    let d = (1 / cps) * (0.55 + 0.9 * hash(i, seed));
    if (prev === " ") d *= 1.5;
    if (/[^A-Za-z0-9 ]/.test(c)) d *= 1.25;
    t = i === 0 ? at : t + d;
    // Each key on its own frame: a key that would share the frame before it moves one frame on.
    const s = snap(t);
    out.push(out.length && s <= out[out.length - 1]! + 1e-9 ? out[out.length - 1]! + F : s);
  }
  return out;
}

export type Segment = { text: string; color: ColorRole };

/**
 * Typed text: one node per character, placed at x0 + measure(prefix), shown from its key time until
 * `until`. Characters stay once typed, so no text appears for one frame and goes again. Returns the
 * nodes and the x of the caret after each character.
 */
export function typed(ctx: Ctx, o: { id: string; x: number; y: number; role: TypeRole; segments: Segment[]; times: number[]; until?: number; y_?: Key[]; z?: number;
  /** A weight other than the role's (TextNode.weight). Every character is measured and set in it. */ weight?: number }) {
  const nodes: Node[] = [];
  const caret: number[] = [];
  const full = o.segments.map((s) => s.text).join("");
  const m = (t: string) => (o.weight !== undefined ? ctx.measure(t, o.role, { weight: o.weight }) : ctx.measure(t, o.role));
  let k = 0;
  o.segments.forEach((seg) => {
    for (const ch of seg.text) {
      const x = o.x + (k ? m(full.slice(0, k)) : 0);
      caret.push(o.x + m(full.slice(0, k + 1)));
      if (ch !== " ") nodes.push({ id: `${o.id}-c${k}`, kind: "text", x, y: o.y, text: ch, role: o.role, color: seg.color, z: o.z, content: "code", ...(o.weight !== undefined ? { weight: o.weight } : {}),
        tracks: { opacity: windows([[o.times[k]!, o.until]]), ...(o.y_ ? { y: o.y_ } : {}) } });
      k++;
    }
  });
  return { nodes, caret };
}

// ---------------------------------------------------------------- syntax

/** Words that read as keywords in the languages a film shows most (JavaScript, TypeScript, Python, shell). */
const KEYWORDS = new Set(["function", "return", "while", "for", "if", "else", "elif", "const", "let", "var", "def", "class", "import", "from",
  "export", "yield", "in", "of", "new", "await", "async", "true", "false", "null", "undefined", "None", "True", "False", "and", "or", "not",
  "lambda", "with", "as", "try", "catch", "except", "finally", "throw", "raise", "break", "continue", "pass", "type", "interface", "do", "then", "fi", "done"]);

/** Splits a line into coloured segments: comments muted, literal values in `literal`, the rest ink. */
export function highlightSyntax(line: string, literal: ColorRole = "ink"): Segment[] {
  return syntaxSegments(line, { literal, comment: "inkMuted" });
}

/** Splits a line into coloured segments by token kind: comment, literal, keyword; the rest ink. */
export function syntaxSegments(line: string, syn: Syntax): Segment[] {
  const out: Segment[] = [];
  const re = /(\/\/.*$|^\s*#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+|[^\w\s"'`]+)/g;
  let m: RegExpExecArray | null;
  const push = (text: string, color: ColorRole) => {
    const last = out[out.length - 1];
    if (last && last.color === color) last.text += text; else out.push({ text, color });
  };
  while ((m = re.exec(line))) {
    if (m[1]) push(m[1], syn.comment ?? "ink");
    else if (m[2] || m[3]) push(m[0], syn.literal ?? "ink");
    else if (m[4] && KEYWORDS.has(m[4])) push(m[0], syn.keyword ?? "ink");
    else push(m[0], "ink");
  }
  return out;
}

// ---------------------------------------------------------------- the block

export const codeBlock: Block<CodeBlockProps> = (p0, ctx) => {
  const id = p0.id ?? "code";
  const s0 = ctx.safe;
  // Code is never cut. When the longest line does not fit the column: first the panel widens so its text column
  // reaches the text-safe edge; then the code steps down a role, never under codeFloor; then each long line wraps at
  // a token with a hanging indent (wrapCode); and a token wider than the column throws.
  const role0 = codeRole(ctx);
  // The height before the rows are known: the one given, or the lines at the code role's pitch (set exactly below).
  const h0 = p0.h ?? Math.ceil(ctx.size(role0) * ctx.system.type[role0].leading) * (p0.lines.length + (p0.title ? 2 : 0)) + ctx.size(role0) * 1.2;
  const colOf = (w: number, r: TypeRole) => {
    const sz = ctx.size(r), pd = Math.round(sz * 0.6);
    const nW = ctx.measure(String((p0.firstLine ?? 1) + p0.lines.length - 1), r);
    const codeX0 = p0.x + pd + nW + Math.round(sz * 0.9);
    const edge = p0.y + h0 > s0.lowBandTop ? s0.lowBandRight : s0.right;
    return Math.min(p0.x + w - pd, edge) - codeX0;
  };
  const longest = (r: TypeRole) => Math.max(0, ...p0.lines.map((l) => ctx.measure(l, r)));
  let pw = p0.w;
  if (longest(role0) > colOf(pw, role0)) {
    const wide = Math.max(pw, s0.right + Math.round(ctx.size(role0) * 0.6) - p0.x);
    if (wide > pw) { pw = wide; console.warn(`codeBlock ${id}: the panel widens to ${Math.round(pw)} px so its code reaches the text-safe edge`); }
  }
  let role = role0;
  if (longest(role) > colOf(pw, role)) {
    const fam = (r: TypeRole) => ctx.system.fonts[ctx.system.type[r].font];
    const down = (["body", "caption", "label"] as TypeRole[]).filter((r) => r !== role0 && !ctx.system.type[r].uppercase && fam(r) === fam(role0)
      && ctx.size(r) < ctx.size(role0) && ctx.size(r) >= codeFloor(ctx) - 0.5).sort((a, b) => ctx.size(b) - ctx.size(a));
    const fits = down.find((r) => longest(r) <= colOf(pw, r));
    const pick = fits ?? down[down.length - 1];
    if (pick) { role = pick; console.warn(`codeBlock ${id}: the code steps down from ${role0} to ${pick} to fit its lines`); }
  }
  const p = { ...p0, w: pw };
  const size = ctx.size(role);
  const lh = Math.ceil(size * ctx.system.type[role].leading);
  const pad = Math.round(size * 0.6);
  const at = snap(p.at);
  const until = p.until !== undefined ? snap(p.until) : undefined;
  const s = ctx.safe;
  const out: Node[] = [];
  const show = (from: number) => present(from, until);
  // The system's signature, under the scene's props.
  const sig = signature(ctx).codeBlock;
  const syn: Syntax = { ...sig.syntax, ...(p.literals === "accent" ? { literal: "accentText" as const } : p.literals === "ink" ? { literal: "ink" as const } : {}), ...p.syntax };
  const numberLit: ColorRole = p.band === "rule" ? "ink" : sig.number;
  const tint = (p.band ?? sig.band) === "tint"
    ? codeTint(ctx, [...new Set<ColorRole>(["ink", "inkMuted", numberLit, ...Object.values(syn)])]) : null;
  const jump = p.jump ?? sig.jump;

  // Panel.
  let H = h0;
  const panel: Extract<Node, { kind: "rect" }> = { id: `${id}-panel`, kind: "rect", x: p.x, y: p.y, w: p.w, h: H, fill: "surface", stroke: "rule", strokeWidth: Math.max(1, ctx.stroke * 0.5),
    radius: ctx.radius, layer: -1, tracks: present(at, until) }; // a backdrop: lines and notes may draw over it
  out.push(panel);

  // Title row and its hairline.
  let top = p.y + pad;
  if (p.title) {
    const lhL = Math.ceil(ctx.size("label") * ctx.system.type.label.leading);
    const t = fitText(ctx, p.title, "label", p.w - 2 * pad);
    out.push({ id: `${id}-title`, kind: "text", x: p.x + pad, y: top, text: t.text, role: "label", color: "inkMuted", tracks: show(at) });
    top += lhL + Math.round(pad * 0.6);
    out.push({ id: `${id}-title-rule`, kind: "path", d: `M${px(p.x)} ${crisp(top, Math.max(1, Math.round(ctx.stroke * 0.5)))}H${px(p.x + p.w)}`, stroke: "rule", width: Math.max(1, Math.round(ctx.stroke * 0.5)),
      tracks: { draw: go(ctx, at, 0, 1, ctx.noOvershoot("move"), 1, "move"), ...show(at) } });
    top += Math.round(pad * 0.7);
  }

  // The gutter and the code column; each line wrapped to the column (wrapCode), as rows.
  const first = p.firstLine ?? 1;
  const numW = ctx.measure(String(first + p.lines.length - 1), role);
  const gutterGap = Math.round(size * 0.9);
  const codeX = p.x + pad + numW + gutterGap;
  // The room of each row: the panel's inner edge, and at 9:16 the low band's edge for a row that reaches below
  // lowBandTop. A line wraps to the narrowest room of the rows it takes, so rows above the low band keep the full width.
  const roomAt = (r: number) => Math.min(p.x + p.w - pad, top + (r + 1) * lh > s.lowBandTop ? s.lowBandRight : s.right) - codeX;
  // At 9:16 an indent shows at half its width, as a narrow editor sets it: the code keeps its shape, and a deep line
  // keeps more of its words on one row. A line's indent is a shift of its rows, not typed text.
  const indentK = ctx.height > ctx.width ? 0.5 : 1;
  const m = (t: string) => ctx.measure(t, role);
  const leadX = p.lines.map((l) => m(/^\s*/.exec(l)![0]) * indentK);
  let r0 = 0;
  const wraps = p.lines.map((l, i) => {
    const where = `codeBlock ${id}: line ${first + i}`, rest = l.trimStart();
    const wrapIn = (room: number) => { const w = wrapCode(m, rest, room - leadX[i]!, where); return { rows: w.rows, indent: w.indent * indentK }; };
    let w = wrapIn(roomAt(r0));
    for (let k = 0; k < 3; k++) {
      const room = Math.min(...w.rows.map((_, j) => roomAt(r0 + j)));
      const again = wrapIn(room);
      if (again.rows.length === w.rows.length && room >= roomAt(r0) - 0.5) break;
      w = again;
    }
    r0 += w.rows.length;
    return w;
  });
  if (wraps.some((w) => w.rows.length > 1)) console.warn(`codeBlock ${id}: ${wraps.filter((w) => w.rows.length > 1).length} line(s) wrap with a hanging indent; shorter lines read better`);
  // Lines that fit the box height, counted in rows.
  if (p0.h === undefined) H = Math.ceil(top - p.y + wraps.reduce((n, w) => n + w.rows.length, 0) * lh + pad);
  panel.h = p0.h === undefined && p0.foot !== undefined ? Math.max(H, p0.foot - p.y) : H;
  const capacity = Math.max(0, Math.floor((p.y + H - pad - top) / lh));
  const rowOf: number[] = [];
  let used = 0;
  for (const w of wraps) { if (used + w.rows.length > capacity) break; rowOf.push(used); used += w.rows.length; }
  const shown = p.lines.slice(0, rowOf.length);
  if (shown.length < p.lines.length) console.warn(`codeBlock ${id}: ${p.lines.length - shown.length} lines do not fit the box and were left out`);
  const rowY = (i: number) => top + rowOf[i]! * lh;
  const nRows = (i: number) => wraps[i]!.rows.length;

  // Highlight steps, kept to lines that show.
  const steps = (p.highlight ?? []).filter((h) => h.line - first >= 0 && h.line - first < shown.length).map((h) => ({ i: h.line - first, at: snap(h.at) }));

  // How the rows come on, and when each row starts: a stagger apart (rise), all at `at` (rest), or one after
  // another as they type (type). A typed row's characters have their own times (typedAt).
  const enter = p.enter ?? (p.at <= 0 ? "rest" : vocabulary(ctx).code);
  const t0 = at + (ctx.instant ? 0 : ctx.dur.enter);
  const typedAt: (number[] | null)[] = shown.map(() => null);
  let rowAt: number[];
  if (enter === "rise") rowAt = shown.map((_, i) => t0 + i * ctx.dur.stagger);
  else if (enter === "rest") rowAt = shown.map(() => at);
  else {
    const restRows = p.at <= 0 ? Math.min(shown.length, p.restRows ?? 1) : 0;
    // After rows at rest, the typing waits a beat (as the terminal's prompt does), so the reader sees the first row.
    // A block at a time before the film types before it too (so it is at rest on frame 0 when it started early enough).
    let t = restRows ? at + 0.3 : at;
    rowAt = shown.map((_raw, i) => {
      if (i < restRows) return at;
      const start = t;
      const text = wraps[i]!.rows.join("");
      // Leading spaces are not typed: the row starts at its first character, as an editor's indent does.
      const times = typeTimes(text.trimStart(), start, p.cps ?? 13, i + 7);
      typedAt[i] = [...Array(text.length - text.trimStart().length).fill(start), ...times];
      t = (times[times.length - 1] ?? start) + 0.25; // a short pause at the end of each row, as at Enter
      return start;
    });
  }

  // A typed row cannot be lit before it is typed: that would light a line the reader cannot read yet.
  for (const st of steps) {
    const done = typedAt[st.i]?.[typedAt[st.i]!.length - 1];
    if (done !== undefined && st.at < done - 1e-6 && (until === undefined || st.at < until))
      throw new Error(`codeBlock ${id}: the highlight of line ${first + st.i} at ${st.at.toFixed(2)} s comes before the line is typed (${done.toFixed(2)} s). Give the highlight ${done.toFixed(2)} s or later, a higher cps, or enter: "rise".`);
  }

  // When the band arrives on each step's line: it wipes in on the first step and moves on the others.
  // With jump "cut", a jump of more than one line cuts on the step's time.
  const cuts = (k: number) => jump === "cut" && k > 0 && Math.abs(steps[k]!.i - steps[k - 1]!.i) > 1;
  const moveD = (k: number) => (k ? Math.min(ctx.dur.move, Math.max(F, steps[k]!.at - steps[k - 1]!.at - F)) : 0);
  const arrive = steps.map((st, k) => (ctx.instant || cuts(k) ? st.at : st.at + moveD(k)));

  shown.forEach((_raw, i) => {
    const y = rowY(i);
    // The right edge for text on this row: the panel's inner edge, and lowBandRight inside the low band.
    const right = Math.min(p.x + p.w - pad, y + lh > s.lowBandTop ? s.lowBandRight : s.right);
    // An anchor per line, `<id>-line:<line number>`: the code area of the row, `at` = when it shows.
    // With `enter: "type"`, data.typedAt is when its last character shows (for `typing` and for what follows).
    const lastKey = typedAt[i]?.[typedAt[i]!.length - 1];
    const parts = wraps[i]!.rows, indent = wraps[i]!.indent, lx = leadX[i]!;
    const lastRow = parts[parts.length - 1]!;
    out.push({ id: `${id}-line:${first + i}`, kind: "anchor", x: codeX, y, w: right - codeX, h: lh * parts.length, at: rowAt[i]!,
      data: { textRight: codeX + lx + (parts.length > 1 ? indent : 0) + ctx.measure(lastRow, role), rows: parts.length, ...(lastKey !== undefined ? { typedAt: lastKey } : {}) } });
    const num = String(first + i);
    const nx = p.x + pad + numW - ctx.measure(num, role);
    parts.forEach((part, k) => {
      if (!textSafe(ctx, { x: codeX + lx + (k ? indent : 0), y: y + k * lh, w: ctx.measure(part, role), h: lh })) console.warn(`codeBlock ${id}: line ${first + i} is outside the text-safe area`);
    });

    // The line number: muted, and ink while its line is highlighted.
    const lit: [number, number | undefined][] = [];
    // A highlight that would arrive after the block leaves never lights; one that holds past it ends at `until`.
    steps.forEach((st, k) => {
      if (st.i !== i || (until !== undefined && arrive[k]! >= until)) return;
      const end = steps[k + 1]?.at ?? until;
      lit.push([arrive[k]!, until !== undefined && (end === undefined || end > until) ? until : end]);
    });
    const dark: [number, number | undefined][] = [];
    let from = rowAt[i]!;
    // Every span ends at `until` at the latest: nothing of the block shows after it leaves.
    const cap = (t: number) => (until !== undefined ? Math.min(t, until) : t);
    for (const [a, b] of lit) { if (a > from) dark.push([from, cap(a)]); from = b ?? Infinity; }
    if (from !== Infinity && (until === undefined || from < until)) dark.push([from, until]);
    // Every node of the row rises out of its mask together (rise only; rest and type have no mask motion).
    const rise: { reveal?: Key[] } = ctx.instant || enter !== "rise" ? {} : { reveal: go(ctx, rowAt[i]!, 100, 0, ctx.noOvershoot("enter"), 1, "enter") };
    const numTracks = (spans: [number, number | undefined][]) => ({ opacity: windows(spans), ...rise });
    if (dark.length) out.push({ id: `${id}-n${i}`, kind: "text", x: nx, y, text: num, role, color: "inkMuted", mask: true, content: "code", tracks: numTracks(dark) });
    if (lit.length) out.push({ id: `${id}-n${i}-lit`, kind: "text", x: nx, y, text: num, role, color: tint !== null ? numberLit : "ink", mask: true, content: "code", tracks: numTracks(lit) });

    // Each row of the line: the first at the code column, the others at the hanging indent.
    let done = 0;
    parts.forEach((part, r) => {
      const segs = syntaxSegments(part, syn);
      const rx = codeX + lx + (r ? indent : 0), ry = y + r * lh;
      const rid = r ? `${id}-l${i}r${r}` : `${id}-l${i}`;
      // Typed: one node per character, in its syntax colour, shown from its key until the block leaves.
      if (typedAt[i]) {
        out.push(...typed(ctx, { id: rid, x: rx, y: ry, role, segments: segs, times: typedAt[i]!.slice(done, done + part.length), until }).nodes);
        done += part.length;
        return;
      }
      // The code: each coloured segment at x0 + measure(prefix).
      let before = "";
      segs.forEach((seg, k) => {
        const x = rx + (before ? ctx.measure(before, role) : 0);
        before += seg.text;
        if (!seg.text.trim()) return;
        // No fixed width: the code role has no negative tracking, so the mask never clips a glyph, and
        // segments that touch never overlap by a pixel.
        out.push({ id: `${rid}-${k}`, kind: "text", x, y: ry, text: seg.text, role, color: seg.color, mask: true, content: "code",
          tracks: { ...rise, ...present(rowAt[i]!, until) } });
      });
    });
  });

  // The highlight band: it wipes in on the first step and moves line to line.
  if (steps.length) {
    const bx = p.x + Math.max(ctx.stroke, 1), bw = p.w - 2 * Math.max(ctx.stroke, 1);
    const y0 = rowY(steps[0]!.i);
    const ys: Key[] = [{ t: Math.min(0, steps[0]!.at), v: 0 }];
    for (let k = 1; k < steps.length; k++) {
      const a = steps[k - 1]!, b = steps[k]!;
      ys.push(...(cuts(k) ? go(ctx, b.at, rowY(a.i) - y0, rowY(b.i) - y0, "step") : go(ctx, b.at, rowY(a.i) - y0, rowY(b.i) - y0, "move", moveD(k) / ctx.dur.move)));
    }
    // A lit line that wraps is taller: the band grows to its rows (scaleY from its top), on the same keys as its move.
    const tall = steps.some((st) => nRows(st.i) > 1);
    const hs: Key[] = [{ t: Math.min(0, steps[0]!.at), v: nRows(steps[0]!.i) }];
    for (let k = 1; k < steps.length; k++) {
      const a = steps[k - 1]!, b = steps[k]!;
      hs.push(...(cuts(k) ? go(ctx, b.at, nRows(a.i), nRows(b.i), "step") : go(ctx, b.at, nRows(a.i), nRows(b.i), "move", moveD(k) / ctx.dur.move)));
    }
    const grow = tall ? { scaleY: hs } : {};
    const org: [number, number] = tall ? [0, 0] : [0, 0.5];
    if (tint === null) {
      out.push({ id: `${id}-band`, kind: "rect", x: bx, y: y0, w: bw, h: lh, fill: "rule", origin: org,
        tracks: { y: ys, ...grow, scaleX: seq(go(ctx, steps[0]!.at, 0, 1, ctx.noOvershoot("enter"), 1, "enter")), ...present(steps[0]!.at, until) } });
    } else {
      // The tint: the accent at a constant opacity, so ink on it still passes 4.5:1. The bar in the gutter
      // is the accent at full strength, the width of two system strokes, on the panel's left edge.
      const shown = present(steps[0]!.at, until).opacity!;
      out.push({ id: `${id}-band`, kind: "rect", x: bx, y: y0, w: bw, h: lh, fill: "accent", origin: org,
        tracks: { y: ys, ...grow, scaleX: seq(go(ctx, steps[0]!.at, 0, 1, ctx.noOvershoot("enter"), 1, "enter")), opacity: shown.map((k) => ({ ...k, v: k.v * tint })) } });
      const barW = Math.max(3, Math.round(ctx.stroke * 2));
      out.push({ id: `${id}-bar`, kind: "rect", x: bx, y: y0, w: barW, h: lh, fill: "accent", z: 1, ...(tall ? { origin: [0, 0] as [number, number] } : {}),
        tracks: { y: ys, ...grow, opacity: present(steps[0]!.at, until).opacity! } });
    }
  }
  return out;
};
