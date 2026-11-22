// The solver never makes a frame worse. For each film it takes the frames where the model proposes moves, applies
// every proposal ("apply all"), has the real renderer draw the moved nodes, and runs the model on the after frame.
// A frame passes when, after the moves:
//   - no issue is at warning or error that was not at warning or error before (same kind, node, feature, target, axis),
//   - no moved element meets an element it did not meet before (its own container and children aside),
//   - no moved element leaves the frame, and no moved text leaves the safe area,
//   - no data mark moved.
// Usage: bun scripts/snap/safety.ts --films <module> <film id> [...] [--frames <n>]   (n frames per film, default 2)
// Exported: safetyOf(module, film, frames) for scripts/snap/safety.test.ts.
import { resolve } from "node:path";
import { analyse, expandIds, movesOf, paintBox, type AlignEl, type AlignFrame, type Box, type Issue } from "../../src/system/scene/align";
import { capture, closeBrowser } from "./capture";
import { filmGuides, frameFromCapture } from "./frame";
import { restPairs } from "./judge";

export type FrameResult = { film: string; frame: number; t: number; proposals: number; made: string[]; overlaps: string[]; outside: string[]; dataMoved: string[]; ok: boolean };

const keyOf = (i: Issue) => `${i.kind}|${i.el}|${i.feature}|${i.target.el}|${i.target.feature}|${i.axis}`;
const meets = (a: Box, b: Box) => a.x0 < b.x1 - 0.5 && b.x0 < a.x1 - 0.5 && a.y0 < b.y1 - 0.5 && b.y0 < a.y1 - 0.5;

/** Checks one frame: before (fr) and after (frA), with the moved node ids. */
export function judgeAfter(fr: AlignFrame, frA: AlignFrame, moved: Set<string>, before: Issue[], after: Issue[], parents: Record<string, string>): Omit<FrameResult, "film" | "frame" | "t" | "proposals" | "ok"> {
  const had = new Set(before.filter((i) => i.level !== "advice" && !i.ignored).map(keyOf));
  const made = after.filter((i) => i.level !== "advice" && !i.ignored && !had.has(keyOf(i))).map((i) => `${i.kind} ${i.el}.${i.feature} -> ${i.target.el} ${i.off} px (${i.level})`);
  const b = new Map(fr.els.map((e) => [e.id, e])), a = new Map(frA.els.map((e) => [e.id, e]));
  const anc = (id: string) => { const out: string[] = []; for (let p = parents[id]; p && out.length < 50; p = parents[p]) out.push(p); return out; };
  const overlaps: string[] = [], outside: string[] = [], dataMoved: string[] = [];
  for (const id of moved) {
    const e0 = b.get(id), e1 = a.get(id);
    if (!e0 || !e1) continue;
    if (e0.data) dataMoved.push(id);
    const p1 = paintBox(e1), p0 = paintBox(e0);
    for (const o of a.values()) {
      if (o.id === id || moved.has(o.id) || o.layer || anc(id).includes(o.id) || anc(o.id).includes(id)) continue;
      const o0 = b.get(o.id);
      if (!o0) continue;
      if (meets(p1, paintBox(o)) && !meets(p0, paintBox(o0))) overlaps.push(`${id} x ${o.id}`);
    }
    if (p1.x0 < -0.5 || p1.y0 < -0.5 || p1.x1 > frA.width + 0.5 || p1.y1 > frA.height + 0.5) outside.push(`${id} leaves the frame`);
    const s = fr.safe;
    if (e1.text && s) {
      const inS = (x: Box) => x.x0 >= s.left - 0.5 && x.x1 <= s.right + 0.5 && x.y0 >= s.top - 0.5 && x.y1 <= s.bottom + 0.5;
      if (inS(p0) && !inS(p1)) outside.push(`${id} leaves the safe area`);
    }
  }
  return { made, overlaps, outside, dataMoved };
}

/** Runs the safety test on a film: up to `n` frames, the ones with the most proposals. */
export async function safetyOf(mod: string, film: string, n = 2): Promise<FrameResult[]> {
  const { FILMS } = await import(resolve(mod));
  const e = FILMS[film];
  const pairs = restPairs(e.durationInFrames, e.fps);
  const cap = await capture(mod, film, pairs.flat());
  const guides = await filmGuides(mod, film, cap);
  const scored = pairs.map(([f, p]) => { const fr = frameFromCapture(cap, f, p, [], guides); return { f, p, fr, A: analyse(fr) }; })
    .filter((x) => x.A.proposals.length).sort((x, y) => y.A.proposals.length - x.A.proposals.length || x.f - y.f).slice(0, n);
  const out: FrameResult[] = [];
  for (const { f, p, fr, A } of scored) {
    const moves = movesOf(A.proposals);
    const capA = await capture(mod, film, [p, f], { moves });
    const frA = frameFromCapture(capA, f, p, [], guides);
    // A moved node rests in the after frame only when its move holds still: compare the after frame with itself at rest.
    const B = analyse(frA);
    const moved = new Set(moves.flatMap((m) => expandIds(m.nodes, cap.nodes.map((x: { id: string }) => x.id))));
    const r = judgeAfter(fr, frA, moved, A.issues, B.issues, A.parents);
    out.push({ film, frame: f, t: f / cap.fps, proposals: A.proposals.length, ...r, ok: !r.made.length && !r.overlaps.length && !r.outside.length && !r.dataMoved.length });
  }
  return out;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const mod = args[args.indexOf("--films") + 1]!;
  const n = args.includes("--frames") ? Number(args[args.indexOf("--frames") + 1]) : 2;
  const ids = args.filter((a, i) => !a.startsWith("--") && !["--films", "--frames"].includes(args[i - 1]!));
  let bad = 0, frames = 0, props = 0;
  for (const id of ids) {
    for (const r of await safetyOf(mod, id, n)) {
      frames++; props += r.proposals;
      if (!r.ok) bad++;
      console.log(`${r.ok ? "ok  " : "FAIL"} ${id} at ${r.t.toFixed(2)} s: ${r.proposals} proposal(s) applied${r.ok ? "" : `; new: ${r.made.join("; ") || "-"}; overlaps: ${r.overlaps.join(", ") || "-"}; outside: ${r.outside.join(", ") || "-"}; data moved: ${r.dataMoved.join(", ") || "-"}`}`);
    }
  }
  await closeBrowser();
  console.log(`${frames} frame(s), ${props} proposal(s) applied, ${bad} frame(s) made worse`);
  process.exit(bad ? 1 : 0);
}
void ({} as AlignEl);
