// Guard: every block call goes through it (blocks/index.ts wraps each block in BLOCKS). It checks the times that a
// scene gives a block and the tracks that the block gives back, so no block accepts a time it cannot honour.
//
// Rules it enforces:
// - Every `at` and `until` (also inside lists and nested props) is a finite number of seconds. `until` comes
//   after its `at`. A duration (`seconds`, `duration`, `pause`, `run`, `after`, `fadeIn`, `fadeOut`, `hold`,
//   `stagger`) is a finite number, 0 or more. A wrong value throws and says what to give instead.
// - A list of timed items (`highlight`, `moves`, `turns`, `status.right`: objects with an `at`) is in time order.
//   A list out of order throws: the scene sorts it, so the scene says what it means.
// - Every key of every track that a block returns is a finite number, and the keys are in time order. Keys out of
//   order were the cause of a film that the two renderers showed differently: Remotion reads a track's keys as a
//   list from the first, while GSAP places each segment at its own time. Such a track throws (a bug in the block).
// - Keys that share the first key's time keep only the last of them: Remotion showed the first one on that frame
//   and GSAP the last one.
// - Keys before 0 (a block with `at` before the film) fold into keys from 0 with the same value on every frame,
//   so `at: -1` shows the block at rest on frame 0 in both renderers. A segment that runs across 0 is sampled
//   on each frame from 0 to its end, so the frames do not change.
// - One name, one meaning (the consistency table in systems/BLOCKS.md). A prop has the same name in every block:
//   `enter` is how a block comes on, `clipStart` is where a clip or a track starts playing, `role` is a type role,
//   `job` is what a person does. A block that took an older name still takes it: the guard maps the old name to the
//   new one and warns once for each block and name (OLD_NAMES).
// - `pinned` works on every block that declares it: the guard pins the nodes of a block that does not pin itself.
// - Hand-over (blocks/handover.ts): a text block that shows text where an earlier text block still shows makes that
//   block leave by its first frame, so two texts never share one place; `replaces: "<id>"` says it on purpose.
import type { System } from "../../systems";
import { pin } from "../screen";
import { valueAt } from "../time";
import { builtNodes, settle } from "./handover";
import { reconcileReveals } from "./kineticWords";
import type { Ctx, Key, Node, Prop, Tracks } from "../types";

const DURATIONS = new Set(["seconds", "duration", "pause", "run", "after", "fadeIn", "fadeOut", "hold", "stagger", "clipStart"]);
/**
 * Blocks whose `at` is not when they appear. carry's `at` is when its move starts; it shows from `show` (default:
 * frame 0). Its `until` must come after `show`, not after `at`.
 */
const SHOWN_FROM: Record<string, string> = { carry: "show" };
/** Props that hold nodes, data or keys, not times that the scene gives. */
const SKIP = new Set(["nodes", "spec", "data", "follow", "keys", "tracks"]);

const isNode = (v: unknown) => !!v && typeof v === "object" && "kind" in (v as object) && "id" in (v as object);

/** Throws when a time in a block's props cannot be honoured. `where` names the block and its id. */
export function checkTimes(where: string, props: unknown, path = "", start = "at"): void {
  if (!props || typeof props !== "object" || isNode(props)) return;
  if (Array.isArray(props)) {
    let last: { at: number; i: number } | null = null;
    props.forEach((item, i) => {
      checkTimes(where, item, `${path}[${i}]`);
      const at = item && typeof item === "object" && !isNode(item) ? (item as { at?: unknown }).at : undefined;
      if (typeof at !== "number") return;
      if (last && at < last.at - 1e-9) throw new Error(`${where}: ${path}[${i}].at (${at}) comes before ${path}[${last.i}].at (${last.at}). Give ${path || "the list"} in time order.`);
      last = { at, i };
    });
    return;
  }
  const o = props as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    const name = path ? `${path}.${k}` : k;
    if (SKIP.has(k)) continue;
    if (k === "at" || k === "until") {
      if (v === undefined) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${where}: ${name} is ${String(v)}. Give ${k} in seconds, as a finite number.`);
      continue;
    }
    if (DURATIONS.has(k) && typeof v === "number") {
      if (!Number.isFinite(v) || v < 0) throw new Error(`${where}: ${name} is ${String(v)}. Give ${k} in seconds, 0 or more.`);
      continue;
    }
    if (v && typeof v === "object") checkTimes(where, v, name);
  }
  const from = path ? "at" : start;
  if (typeof o[from] === "number" && typeof o.until === "number" && !(o.until > (o[from] as number))) {
    const base = path ? `${path}.` : "";
    throw new Error(`${where}: ${base}until (${o.until}) is not after ${base}${from} (${o[from]}). Give an until later than ${from}, or leave it out.`);
  }
}

const SAMPLE = 1 / 30;

/** One track checked and folded so it has no key before 0 (see the header). */
export function foldTrack(system: System, where: string, prop: Prop, keys: Key[]): Key[] {
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    if (!Number.isFinite(k.t) || !Number.isFinite(k.v)) throw new Error(`${where}: track ${prop} has a key that is not a finite number (t ${k.t}, v ${k.v}). This is a bug in the block: report it.`);
    if (i && k.t < keys[i - 1]!.t - 1e-9) throw new Error(`${where}: track ${prop} has keys out of time order (${keys[i - 1]!.t.toFixed(3)} s, then ${k.t.toFixed(3)} s). The two renderers would show different frames. This is a bug in the block: report it.`);
  }
  // Keys that share the first key's time: Remotion shows the first of them there, GSAP the last (it sets the first
  // value, then applies each zero-length step). Keep only the last, which both renderers show from that time on.
  let lead = 0;
  while (lead + 1 < keys.length && Math.abs(keys[lead + 1]!.t - keys[0]!.t) < 1e-9) lead++;
  if (lead) keys = [{ t: keys[lead]!.t, v: keys[lead]!.v }, ...keys.slice(lead + 1)];
  if (!keys.length || keys[0]!.t >= 0) return keys;
  const later = keys.filter((k) => k.t > 0);
  const out: Key[] = [{ t: 0, v: valueAt(system, keys, prop, 0) }];
  // A segment that runs across 0: sample it on each frame up to its end key, linear between the samples.
  const next = later[0];
  if (next) {
    const prev = keys[keys.indexOf(next) - 1]!;
    // A segment that holds one value (a rest between two steps) needs no samples: the value is the same on every frame.
    if (prev.t < 0 && next.curve !== "linear" && next.curve !== "step" && prev.v !== next.v) {
      for (let t = SAMPLE; t < next.t - 1e-9; t += SAMPLE) out.push({ t, v: valueAt(system, keys, prop, t), curve: "linear" });
      out.push({ ...next, v: next.v, curve: "linear" });
      return [...out, ...later.slice(1)];
    }
  }
  return [...out, ...later];
}

function foldTracks(system: System, where: string, tracks: Tracks | undefined): Tracks | undefined {
  if (!tracks) return tracks;
  const out: Tracks = {};
  for (const [p, keys] of Object.entries(tracks) as [Prop, Key[] | undefined][]) out[p] = keys ? foldTrack(system, where, p, keys) : keys;
  return out;
}

/** Checks a block's nodes, and folds keys before 0 (see the header). */
export function checkNodes(ctx: Pick<Ctx, "system">, block: string, nodes: Node[]): Node[] {
  return nodes.map((n) => {
    const where = `${block}: node ${n.id}`;
    if (n.kind === "audio") {
      if (!Number.isFinite(n.at) || (n.until !== undefined && !(n.until > n.at))) throw new Error(`${where}: the sound plays from ${n.at} s to ${n.until} s. This is a bug in the block: report it.`);
      return n;
    }
    // The block's name goes on every node it draws (an inner block's name stays: it drew the node).
    const drew = block.split(" ")[0]!;
    const m = { ...n, block: (n as { block?: string }).block ?? drew, tracks: foldTracks(ctx.system, where, n.tracks) } as Node & { inner?: Tracks; lights?: { tracks?: Tracks }[] };
    if (m.inner) m.inner = foldTracks(ctx.system, `${where} (inner)`, m.inner);
    if (m.lights) m.lights = m.lights.map((l) => ({ ...l, tracks: foldTracks(ctx.system, `${where} (light)`, l.tracks) }));
    return m;
  });
}

const TYPE_ROLES = new Set(["display", "headline", "body", "caption", "label"]);

/**
 * Old prop names that still work, for each block: [old name, the name to use]. Inside, a block reads the name on the
 * right of INTERNAL (its code predates the rename); the guard gives it that name, so old and new calls agree.
 */
export const OLD_NAMES: Record<string, [old: string, now: string][]> = {
  text: [["reveal", "enter"]],
  title: [["reveal", "enter"]],
  fitText: [["reveal", "enter"]],
  lockup: [["reveal", "enter"]],
  endCard: [["reveal", "enter"]],
  quote: [["reveal", "enter"], ["size", "role"]],
  lowerThird: [["role", "job"]],
  photo: [["from", "clipStart"]],
  music: [["from", "clipStart"]],
};
/** The name each block's code reads, for a prop whose public name changed: block -> public name -> internal name. */
const INTERNAL: Record<string, Record<string, string>> = {
  text: { enter: "reveal" }, title: { enter: "reveal" }, fitText: { enter: "reveal" }, lockup: { enter: "reveal" },
  endCard: { enter: "reveal" }, quote: { enter: "reveal", role: "size", job: "role" }, lowerThird: { job: "role" },
  photo: { clipStart: "from" }, music: { clipStart: "from" },
};
/** Blocks that pin their own nodes (`pinned`); the guard pins the others. */
const PINS_ITSELF = new Set(["text", "title", "captions", "kineticWords"]);
const warned = new Set<string>();

/**
 * The props as the block's code reads them. An old name warns once, then counts as the new one; the new name wins
 * when both are given. quote's old `role` was the speaker's job: a `role` that is not a type role is read so.
 */
export function canonical(name: string, p: unknown): unknown {
  const olds = OLD_NAMES[name], inner = INTERNAL[name];
  if (!olds || !p || typeof p !== "object") return p;
  const q = { ...(p as Record<string, unknown>) };
  // quote: `role` holding a job ("Head of Nursing") is the old form; move it to `job` before the renames.
  if (name === "quote" && typeof q.role === "string" && !TYPE_ROLES.has(q.role)) {
    if (q.job === undefined) q.job = q.role;
    delete q.role;
    note(name, "role (the speaker's job)", "job");
  }
  for (const [old, now] of olds) {
    if (!(old in q) || (name === "quote" && old === "size" && q.size === undefined)) continue;
    if (name === "quote" && old === "role") continue;
    if (!(now in q) || q[now] === undefined) q[now] = q[old];
    delete q[old];
    note(name, old, now);
  }
  // The public names to the names the block's code reads.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) out[inner?.[k] ?? k] = v;
  return out;
}

function note(block: string, old: string, now: string) {
  const k = `${block}.${old}`;
  if (warned.has(k)) return;
  warned.add(k);
  console.warn(`${block}: the prop "${old}" is now "${now}" (one name, one meaning in every block); "${old}" still works.`);
}

/** A block with the guard round it: the props' times are checked before it runs, and its tracks after. */
export function guarded<P, R extends Node[]>(name: string, block: (p: P, ctx: Ctx) => R): (p: P, ctx: Ctx) => R {
  return (p0: P, ctx: Ctx) => {
    const p = canonical(name, p0) as P;
    const id = (p as { id?: unknown })?.id;
    const where = `${name}${typeof id === "string" ? ` ${id}` : ""}`;
    checkTimes(where, p, "", SHOWN_FROM[name] ?? "at");
    const nodes = checkNodes(ctx, where, block(p, ctx)) as R;
    const out = ((p as { pinned?: boolean })?.pinned && !PINS_ITSELF.has(name) ? pin(nodes) : nodes) as R;
    // Two text blocks in one place hand over (blocks/handover.ts): the one that shows first leaves by the frame the
    // other first shows. `replaces` says it on purpose.
    const q = p as { replaces?: string | string[]; at?: number };
    // A window hands over itself (ui.ts uiWindow `replaces`: its frame cuts, its content leaves, then the new enters).
    settle(ctx, name, where, id, out, name === "uiWindow" ? undefined : q?.replaces, typeof q?.at === "number" ? q.at : undefined);
    // The reveal is the largest type of the film (kineticWords.reconcileReveals): it needs every phrase built so far.
    if (name === "kineticWords" || name === "reveal") reconcileReveals(ctx, [...builtNodes(ctx), ...out]);
    return out;
  };
}
