// The Graphite reel: a launch film for Rofamo, a fictional issue tracker (the name and the people's initials are a
// random draw). The product UI is the hero, built only from the ui kit and the codeBlock: a window of dense rows, a
// cursor that clicks, a diff, a merge button, a toast. The headline keeps one slot at the top through every glide.
// 1. Frame 0: the inbox, five open issues in dense rows, and the list running on to the window's foot. "Triage
//    without the meeting." The cursor picks one issue on the bar.
// 2. The view glides right to the issue: its diff, the bad line and the fix. "Every bug, linked to its line."
// 3. The reveal on the track's drop: the cursor clicks "Merge fix" in the toolbar; a toast confirms.
// 4. The view glides back: the issue leaves the inbox, the rows under it close the gap, and the closed count ticks
//    from 12 to 13. "Closed before standup."
// 5. The end: on the strongest accent after the count, the name and its line take the headline slot over the inbox,
//    which holds.
// The accent marks one thing at a time: the selected row, then the merge button, then the name's mark.
import type { Ctx, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import { listRowsStack, musicFrom } from "../../src/system/scene/blocks";
import { beats } from "../../src/system/scene/beats";
import { anchor, withView } from "../../src/system/scene/context";

export const system = "graphite";
export const seconds = 15.6;

const TRACK = "graphite-music-8";
// The structure: the reveal's place (the merge), on the track's drop. Every other time is a bar of the track from there.
const REVEAL_PLAN = 7.5;

const ISSUES = [
  { title: "Upload stalls", who: "KD", meta: "2d", badge: "P2" },
  { title: "Locale cache", who: "TS", meta: "1d", badge: "P1" },
  { title: "Dark mode", who: "VB", meta: "3d", badge: "P3" },
  { title: "Export row", who: "GM", meta: "5h", badge: "P2" },
  { title: "Search lag", who: "RZ", meta: "4d", badge: "P3" },
];
const PICK = 1;
/** The issues closed this week before the merge. */
const CLOSED = 12;

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const S = ctx.safe, W = ctx.width;
  const out: Node[] = [];
  const from = musicFrom({ media: TRACK, peakAt: REVEAL_PLAN, until: seconds });
  const g = beats(TRACK, { from, until: seconds });
  // The bars counted from the drop: the music map marks its own bar start as a guess on this track, so the steps
  // are whole bars before and after the drop, each snapped to a beat.
  const barLen = (4 * 60) / g.bpm;
  const bar = (k: number) => g.onBeat(REVEAL_PLAN + k * barLen);
  // The bars: the click, the glide out, the merge (the drop), the glide back, the end.
  const CLICK = bar(-2), OUT = bar(-1), REVEAL = bar(0), BACK = bar(1);
  // The name lands on the strongest accent of the last bars, which leaves the end's hold (Graphite holds 1.5 s) and
  // puts a change on that accent.
  const END = g.strongest(bar(2) + 0.6, seconds - 1.6)?.t ?? bar(2);
  // The inbox changes after the glide back has settled, on a beat, so the change is its own event.
  const SWAP = g.onBeat(BACK + 1.2);
  out.push(...B.reveal({ at: REVEAL }, ctx));

  // The headline slot at the text-safe top, pinned, so it rides through the glides. One line a part, cut on the bar.
  const lh = Math.round(ctx.lineHeight("headline"));
  const slot = { x: S.left, y: S.top, w: S.right - S.left, h: 2 * lh + 40 };
  const head = (id: string, text: string | string[], at: number, until?: number) =>
    B.title({ id, text, role: "headline", maxLines: 2, ...slot, pinned: true, enter: "cut", exit: "cut", at, until }, ctx);
  out.push(...head("h1", "Triage without the meeting.", 0, OUT));
  out.push(...head("h2", "Every bug, linked to its line.", OUT, BACK));
  out.push(...head("h3", ["Closed before", "standup."], BACK, END));

  // 1. The inbox: the system's window box (no box given). Its issues are dense rows of one line each, from the
  //    window's content down to the text-safe foot, and the list's rules run on at the same pitch to the window's foot,
  //    as an app's list does. The rows are built here, not by the window's `rows`, because the merged issue leaves and
  //    the rows under it move up while the window stays. Their text keeps one pad inside the low band's right edge,
  //    so the slow push keeps it there.
  const lineH = 2 * lh + 20;
  const inbox = B.uiWindow({ id: "inbox", lineH, title: "Inbox", toolbar: { tabs: ["Open", "Closed"], active: [{ index: 0, at: 0 }] }, at: 0 }, ctx);
  out.push(...inbox);
  // The closed count beside its tab: 12, and 13 from the beat the merged issue leaves the inbox (the last action); its
  // digits roll for about 2 s and settle before the name lands.
  const closedTab = inbox.find((n) => n.id === "inbox-tabs-t1-off") as { x: number };
  const closedBox = anchor(inbox, "inbox-tabs-tab:1");
  const countX = Math.round(closedTab.x + ctx.measure("Closed", "caption") + ctx.size("caption") * 0.5);
  out.push(...B.counter({ id: "closed", x: countX, y: closedBox.y, w: Math.round(ctx.measure("00", "caption") * 1.4), h: closedBox.h, value: CLOSED + 1, from: CLOSED,
    role: "caption", color: "inkMuted", align: "left", rollAt: SWAP, at: 0 }, ctx));
  const panel = inbox.find((n) => n.id === "inbox-panel") as { x: number; y: number; w: number; h: number };
  const content = anchor(inbox, "inbox-content");
  const P = Math.round(ctx.size("label") * 0.6);
  // The rows' plates and rules sit centred in the panel: the same inset on the right as the text-safe edge leaves on
  // the left. Before, the right inset was the pad (23 px) and the left one 45 px: the selected plate stood 11 px right
  // of the panel's centre, and align/centre found it whenever its frame read as at rest.
  const rx = S.left, rw = S.lowBandRight - P - rx, span = panel.x + panel.w - (rx - panel.x) - rx;
  const rowsAt = (list: typeof ISSUES) => list.map((r, i) => ({ id: `row${i}`, x: rx, w: rw, title: r.title, meta: `${r.who} ${r.meta}`, badge: { text: r.badge, tone: "muted" as const } }));
  const stack = listRowsStack(ctx, rowsAt(ISSUES));
  const rh = Math.floor((S.bottom - content.y) / ISSUES.length);
  const rowY = (i: number) => content.y + i * rh;
  const rows1 = rowsAt(ISSUES).map((r, i) => B.listRow({ ...r, y: rowY(i), h: rh, span, stack, selected: i === PICK ? [{ at: CLICK }] : undefined,
    at: 0, until: i < PICK ? undefined : SWAP }, ctx));
  rows1.forEach((r) => out.push(...r));
  // The list runs on under the fold: rules at the rows' pitch, with no text, to the window's foot.
  for (let y = rowY(ISSUES.length), k = 0; y <= panel.y + panel.h - P; y += rh, k++)
    out.push(...B.rule({ id: `more${k}`, x1: rx, y1: y, x2: rx + span, y2: y, color: "rule", weight: 1, at: 0 }, ctx));
  // The cursor enters, picks the issue on the bar, then rests on it.
  out.push(...B.cursor({ id: "cursor1", path: [{ x: panel.x + panel.w * 0.82, y: panel.y + panel.h * 0.62, at: 0.3 }, { to: `row${PICK}-box`, at: CLICK - 0.1 }],
    targets: rows1.flat(), clicks: [CLICK], at: 0.3, until: OUT }, ctx));

  // 2. The issue, one frame to the right in the world, in a window of the same box: the camera glides to it and back.
  //    Its toolbar holds the "Merge fix" action; the diff fills the content: the bad line, the fix, and its test.
  const vctx = withView(ctx, { x: W });
  const issue = B.uiWindow({ id: "issue", x: panel.x + W, y: panel.y, w: panel.w, h: panel.h, title: "RFM-41 Locale cache",
    toolbar: { tabs: [], action: { text: "Merge fix", press: [REVEAL] } }, at: 0 }, vctx);
  out.push(...issue);
  const below = anchor(issue, "issue-content");
  const code = ["function key(r) {", "-  return r.url;", "+  return r.url", "+    + r.lang;", "}"];
  const codeNodes = B.codeBlock({ id: "diff", x: S.left + W, y: below.y + P, w: S.lowBandRight - S.left, foot: panel.y + panel.h - P, lines: code, enter: "rest", at: 0 }, vctx);
  out.push(...codeNodes);
  // 3. The reveal: the click on "Merge fix", then a toast at the foot of the text-safe area.
  out.push(...B.toast({ id: "merged", text: "Merged into main", x: S.left + W, w: S.lowBandRight - S.left, at: REVEAL, until: BACK }, vctx));
  out.push(...B.cursor({ id: "cursor2", path: [{ x: W + panel.x + panel.w * 0.3, y: panel.y + panel.h * 0.72, at: OUT + 0.8 }, { to: "issue-action-box", at: REVEAL - 0.1 }],
    targets: [...codeNodes, ...issue], clicks: [REVEAL], at: OUT + 0.8, until: BACK }, ctx));

  // The camera: a slow push while each view is read, a glide right on the bar, and back on the bar.
  // Each slow push ends half a second before the next move starts, so no two moves of the camera overlap.
  const slow = (a: number, b: number) => (b - a - 0.5) / ctx.dur.move;
  out.push(...B.camera({ moves: [{ at: 0, zoom: 1.04, scale: slow(0, OUT) }, { at: OUT, x: W, zoom: 1 }, { at: OUT + 1.5, zoom: 1.03, scale: slow(OUT + 1.5, BACK) },
    { at: BACK, x: 0, zoom: 1 }] }, ctx));

  // 4. Back in the inbox, on the beat after the glide settles: the merged issue leaves, and the rows under it close
  //    the gap: they fade out, and on the next step they are back one row higher, so no row crosses another. The
  //    closed count beside its tab ticks from the same beat (above).
  const after = ISSUES.filter((_, i) => i !== PICK);
  const CLOSE = SWAP + ctx.dur.exit;
  rowsAt(after).slice(PICK).forEach((r, i) => out.push(...B.listRow({ ...r, id: `rest${i}`, y: rowY(PICK + i), h: rh, span, stack, at: CLOSE }, ctx)));

  // 5. The end: the name and its line take the headline slot over the inbox, on the accent, held.
  out.push(...B.endCard({ id: "card", name: "Rofamo", line: "Now in beta.", mark: "square", axis: "row", box: slot, place: "middle", enter: "cut", at: END, until: seconds }, ctx));

  // Sound: the track's drop on the merge carries the click on Merge fix. A click on the first cursor click.
  const bed = B.music({ media: TRACK, peakAt: REVEAL_PLAN, at: 0, until: seconds }, ctx);
  out.push(...bed);
  out.push(...B.hit({ id: "click1", media: "graphite-click", at: CLICK, bed }, ctx));
  return out;
};
