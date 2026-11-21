// Lower third: the name and the role of a speaker, beside a short vertical rule.
//
// Rules this block enforces:
// - The block measures both lines before it places them. The rule is as tall as the two lines.
// - The name uses the headline role when it fits the box, else the body role.
// - The role line breaks onto two lines when it does not fit on one, after a comma when it can.
// - A line that still does not fit ends with an ellipsis, and the block reports it.
// - The block sits at the foot of its box, so the caller gives the box and the block keeps inside it.
// - Every text box passes textSafe. The block reports a box that does not.
// - Enter: the rule draws down, then the name and the role rise out of their masks.
//   Leave: the lines rise out of the top of their masks, then the rule draws back up. Nothing stays after it leaves.
// - The rule draws on a curve that never overshoots, so it never passes its length.
// - `plate`: over footage, a flat panel in the ground colour sits behind the rule and the lines (a pad of half the
//   label size round them), so the type keeps its contrast on any picture. It comes on with the rule and goes with it.
//   The rule then draws in the overlay layer, above the panel.
import { go, leaveAt, present, px, textSafe, onGrid } from "../context";
import { maskTravel } from "../layout";
import type { TypeRole } from "../../systems";
import type { ColorRole } from "../roles";
import type { Block, Ctx, Node, TextNode } from "../types";

export type LowerThirdProps = {
  id?: string;
  /** The block's box in px. The rule and both lines sit at the foot of the box. */
  x: number; y: number; w: number; h: number;
  /** The speaker's name: the first line. */
  name: string;
  /** What the speaker does, or where: the second line, set in the label role. */
  job?: string;
  /** @deprecated The old name of `job`; it still works, with a warning. */
  role?: string;
  /** Screen space: it stays where it is on screen while the camera pans or zooms. */
  pinned?: boolean;
  /** The time the block starts to enter, in seconds. */
  at: number;
  /** The time the block starts to leave, in seconds. */
  until?: number;
  /** A flat panel in the ground colour behind the rule and the lines, for type over footage. Default: false. */
  plate?: boolean;
};

/** Moves a time to three quarters of a frame. A step segment then never has a sampled frame at its start or its midpoint, where the two renderers flip a step differently. */
/** A time on the frame grid that shows on the same frame as t (context.ts onGrid: the frame rule every block keeps). */
const snap = onGrid;

/** Extra width for a masked line, so negative tracking never clips the last glyph. */
const slack = (ctx: Ctx, role: TypeRole) => Math.ceil(Math.max(0, -ctx.system.type[role].tracking) * ctx.size(role) + ctx.size(role) * 0.05);

/** Cuts a string until it fits `max` px with an ellipsis. Returns the string unchanged when it fits. */
function fit(ctx: Ctx, text: string, role: TypeRole, max: number): { text: string; cut: boolean } {
  if (ctx.measure(text, role) <= max) return { text, cut: false };
  let n = text.length;
  while (n > 1 && ctx.measure(text.slice(0, n).trimEnd() + "…", role) > max) n--;
  return { text: text.slice(0, n).trimEnd() + "…", cut: true };
}

/** Breaks a line in two where both halves fit: after a comma first, else at the space nearest the middle. */
function split(ctx: Ctx, text: string, role: TypeRole, max: number): string[] {
  if (ctx.measure(text, role) <= max) return [text];
  const spaces = [...text.matchAll(/ /g)].map((m) => m.index!);
  const fits = (i: number) => ctx.measure(text.slice(0, i), role) <= max && ctx.measure(text.slice(i + 1), role) <= max;
  const comma = spaces.find((i) => text[i - 1] === "," && fits(i));
  if (comma !== undefined) return [text.slice(0, comma), text.slice(comma + 1)];
  const ok = spaces.filter(fits).sort((a, b) => Math.abs(a - text.length / 2) - Math.abs(b - text.length / 2));
  if (ok.length) return [text.slice(0, ok[0]!), text.slice(ok[0]! + 1)];
  // No break makes both halves fit: break at the last space that keeps the first half whole.
  const first = [...spaces].reverse().find((i) => ctx.measure(text.slice(0, i), role) <= max);
  return first !== undefined ? [text.slice(0, first), text.slice(first + 1)] : [text];
}

/** One masked line that rises in at `at` and sinks out at `until`, hidden before and after. */
function maskedLine(ctx: Ctx, o: { id: string; x: number; y: number; text: string; role: TypeRole; color: ColorRole; at: number; until?: number }): TextNode {
  // The rise never passes its rest, so a line never shows above its own line box on the way in.
  // The exit is the shared one (leaveAt): an `until` inside the entrance starts the exit from where the rise got to.
  const reveal = ctx.instant ? [{ t: 0, v: 0 }] : leaveAt(ctx, go(ctx, o.at, 100, 0, ctx.noOvershoot("enter"), 1, "enter"), o.until, -100, "reveal");
  const end = o.until !== undefined ? o.until + (ctx.instant ? 0 : ctx.dur.exit) : undefined;
  return { id: o.id, kind: "text", x: o.x, y: o.y, text: o.text, role: o.role, color: o.color, mask: true,
    width: Math.ceil(ctx.measure(o.text, o.role)) + slack(ctx, o.role), tracks: { reveal, ...present(o.at, end) } };
}

export const lowerThird: Block<LowerThirdProps> = (p, ctx) => {
  const id = p.id ?? "lower";
  const at = snap(p.at);
  const until = p.until !== undefined ? snap(p.until) : undefined;
  const sL = ctx.size("label");
  const ruleW = Math.max(ctx.stroke * 1.5, 2);
  const gap = Math.round(sL * 0.55);
  const textX = p.x + ruleW + gap;
  const maxW = p.x + p.w - textX;

  // The name takes the headline role when it fits, else the body role.
  const nameRole: TypeRole = ctx.measure(p.name, "headline") <= maxW ? "headline" : "body";
  const name = fit(ctx, p.name, nameRole, maxW - slack(ctx, nameRole));
  // The job (`job`; the guard gives it to the code as `role`, its old name).
  const job = p.job ?? p.role;
  if (job === undefined) throw new Error(`lowerThird ${id}: give \`job\`, what the speaker does (the second line)`);
  const roleLines = split(ctx, job, "label", maxW - slack(ctx, "label")).map((l) => fit(ctx, l, "label", maxW - slack(ctx, "label")));
  if (name.cut || roleLines.some((l) => l.cut)) console.warn(`lowerThird ${id}: a line was cut to fit ${Math.round(maxW)} px`);

  // Geometry, bottom up: the role lines end at the foot of the box; the name sits above them.
  // Line pitch is the CSS line box rounded up, so stacked line boxes never overlap by a fraction of a px.
  const lhOf = (r: TypeRole) => Math.ceil(ctx.size(r) * ctx.system.type[r].leading);
  const lhN = lhOf(nameRole), lhR = lhOf("label");
  const between = Math.round(sL * 0.2);
  // A line rises into its mask from one full travel below. Its text box moves with it, even where the
  // mask hides it, so the block keeps that travel free inside the box under the last line.
  const below = maskTravel(ctx.system, "label", Math.min(ctx.width, ctx.height));
  const roleY = p.y + p.h - lhR * roleLines.length - below;
  const nameY = roleY - between - lhN;
  if (nameY < p.y) console.warn(`lowerThird ${id}: the lines need ${Math.round(p.y + p.h - nameY)} px; the box is ${p.h} px tall`);
  const placed: [string, TypeRole, number][] = [[name.text, nameRole, nameY], ...roleLines.map((l, i) => [l.text, "label", roleY + i * lhR] as [string, TypeRole, number])];
  for (const [t, r, y] of placed) {
    const box = { x: textX, y, w: ctx.measure(t, r) + slack(ctx, r), h: ctx.lineHeight(r) };
    if (!textSafe(ctx, box)) console.warn(`lowerThird ${id}: "${t}" is outside the text-safe area`);
  }

  // The rule spans the two line boxes, trimmed to the type's visible height.
  const top = px(nameY + lhN * 0.14), bottom = px(roleY + lhR * (roleLines.length - 0.14));
  const rx = px(p.x + ruleW / 2);
  const curve = ctx.noOvershoot("enter");
  const out: Node[] = [];
  const s = ctx.dur.stagger;
  const textAt = at + (ctx.instant ? 0 : ctx.dur.enter * 0.5);
  const textUntil = until;
  const ruleUntil = until !== undefined ? until + (ctx.instant ? 0 : ctx.dur.exit * 0.6 + s) : undefined;
  const ruleEnd = ruleUntil !== undefined ? ruleUntil + (ctx.instant ? 0 : ctx.dur.exit) : undefined;
  if (p.plate) {
    // The panel: round the rule and the widest line, a pad on every side, never past the box's left edge.
    const pad = Math.round(sL * 0.5);
    const right = Math.max(...placed.map(([t, r]) => textX + ctx.measure(t, r) + slack(ctx, r)));
    const x0 = Math.max(0, p.x - pad), y0 = nameY - pad;
    out.push({ id: `${id}-plate`, kind: "rect", x: px(x0), y: px(y0), w: px(right + pad - x0), h: px(roleY + lhR * roleLines.length + pad - y0), fill: "ground", radius: 0,
      tracks: present(at, ruleEnd) });
  }
  out.push({ id: `${id}-rule`, kind: "path", d: `M${rx} ${top}V${bottom}`, stroke: "accent", width: ruleW, cap: "butt", ...(p.plate ? { layer: 1 } : {}),
    tracks: { draw: ctx.instant ? go(ctx, at, 0, 1, curve, 1, "enter") : leaveAt(ctx, go(ctx, at, 0, 1, curve, 1, "enter"), ruleUntil, 0, "draw"), ...present(at, ruleEnd) } });
  out.push(maskedLine(ctx, { id: `${id}-name`, x: textX, y: nameY, text: name.text, role: nameRole, color: "ink", at: textAt, until: textUntil }));
  roleLines.forEach((l, i) => out.push(maskedLine(ctx, { id: `${id}-role-${i}`, x: textX, y: roleY + i * lhR, text: l.text, role: "label", color: "inkMuted",
    at: textAt + s * (2 + i), until: textUntil !== undefined ? textUntil + (ctx.instant ? 0 : s * (1 + i)) : undefined })));
  return out;
};
