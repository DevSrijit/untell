// Evaluating tracks at a time. Used by the Remotion renderer and by tests; the HyperFrames renderer
// hands the same curves to GSAP's CustomEase instead, so both follow one definition.
import type { System } from "../systems";
import type { Curve, Key, Prop, Tracks } from "./types";

/** The value of a cubic-bezier easing (x1, y1, x2, y2) at progress x, solved for t by Newton then bisection. */
export function bezier([x1, y1, x2, y2]: readonly [number, number, number, number], x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bx = (t: number) => ((1 - 3 * x2 + 3 * x1) * t + (3 * x2 - 6 * x1)) * t * t + 3 * x1 * t;
  const by = (t: number) => ((1 - 3 * y2 + 3 * y1) * t + (3 * y2 - 6 * y1)) * t * t + 3 * y1 * t;
  const dx = (t: number) => 3 * (1 - 3 * x2 + 3 * x1) * t * t + 2 * (3 * x2 - 6 * x1) * t + 3 * x1;
  let t = x;
  for (let i = 0; i < 8; i++) {
    const e = bx(t) - x;
    if (Math.abs(e) < 1e-6) return by(t);
    const d = dx(t);
    if (Math.abs(d) < 1e-6) break;
    t -= e / d;
  }
  let lo = 0, hi = 1;
  t = x;
  for (let i = 0; i < 30; i++) {
    const e = bx(t) - x;
    if (Math.abs(e) < 1e-6) break;
    if (e > 0) hi = t; else lo = t;
    t = (lo + hi) / 2;
  }
  return by(t);
}

export function ease(system: System, curve: Curve | undefined, p: number): number {
  if (curve === "linear") return p;
  if (curve === "step") return p >= 1 ? 1 : 0;
  return bezier(system.motion[curve ?? "move"], p);
}

/** Does a curve go past 1 (or under 0) on the way? */
export function overshoots(b: readonly [number, number, number, number]) {
  for (let i = 0; i <= 100; i++) {
    const v = bezier(b, i / 100);
    if (v > 1.0005 || v < -0.0005) return true;
  }
  return false;
}

export const DEFAULTS: Record<Prop, number> = { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0, draw: 1, reveal: 0, tiltX: 0, tiltY: 0, blurX: 0, blurY: 0 };

/** A track's value at time t. Before the first key, the first value; after the last, the last. */
export function valueAt(system: System, keys: Key[] | undefined, prop: Prop, t: number): number {
  if (!keys || keys.length === 0) return DEFAULTS[prop];
  if (t <= keys[0]!.t) return keys[0]!.v;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    if (t < b.t) {
      const span = b.t - a.t;
      const p = span <= 0 ? 1 : (t - a.t) / span;
      return a.v + (b.v - a.v) * ease(system, b.curve, p);
    }
  }
  return keys[keys.length - 1]!.v;
}

export function evaluate(system: System, tracks: Tracks | undefined, t: number): Record<Prop, number> {
  const out = { ...DEFAULTS };
  if (!tracks) return out;
  for (const p of Object.keys(tracks) as Prop[]) out[p] = valueAt(system, tracks[p], p, t);
  return out;
}

// ---------------------------------------------------------------- system motion: frame step and opaque

/** The frame step of a system in frames per second (System.step: Cutout and Riso 12), or 0 when it moves on every frame. */
export const stepOf = (s: System): number => s.step ?? 0;
/** True when a system never tweens opacity (System.opaque: Cutout, Riso and Primary). */
export const opaqueOf = (s: System): boolean => s.opaque ?? false;

/** How far before a frame a stepped key sits, so a renderer that seeks to that exact frame is past it. */
const EPS = 1e-4;

/**
 * Opacity without fades: a rise in opacity cuts on at the start of its segment, a fall cuts off at its end.
 * So a thing is fully there for the whole of its move, and never half there.
 */
function cutOpacity(keys: Key[]): Key[] {
  const out: Key[] = [keys[0]!];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    if (b.curve === "step" || b.t <= a.t || a.v === b.v) { out.push(b); continue; }
    if (b.v > a.v) out.push({ t: a.t + EPS, v: b.v, curve: "step" }, { t: b.t, v: b.v, curve: "step" });
    else out.push({ t: b.t, v: b.v, curve: "step" });
  }
  return out;
}

/**
 * A track resampled on a frame grid of `step` per second, as step keys. The grid starts at film time 0 and its
 * ticks fall on whole film frames (at 12 on 30 fps, a tick every 2 or 3 frames). Each tick takes the value
 * that the source track has at that frame, and holds it until the next tick.
 */
function stepKeys(system: System, keys: Key[], prop: Prop, step: number, fps: number): Key[] {
  if (keys.length < 2) return keys;
  const t0 = keys[0]!.t, tn = keys[keys.length - 1]!.t;
  const out: Key[] = [{ t: t0, v: keys[0]!.v }];
  let last = keys[0]!.v;
  for (let k = Math.max(0, Math.floor(t0 * step)); ; k++) {
    const frame = Math.round((k * fps) / step);
    const at = frame / fps;
    if (at <= t0 + EPS) continue;
    const v = valueAt(system, keys, prop, at);
    if (v !== last) { out.push({ t: at - EPS, v, curve: "step" }); last = v; }
    if (at >= tn) break;
  }
  return out;
}

/** One track set through the system's motion: opacity cuts for an opaque system, then the frame step. */
export function systemTracks(system: System, tracks: Tracks | undefined, fps: number): Tracks | undefined {
  if (!tracks) return tracks;
  const step = stepOf(system), opaque = opaqueOf(system);
  if (!step && !opaque) return tracks;
  const out: Tracks = {};
  for (const [prop, raw] of Object.entries(tracks) as [Prop, Key[] | undefined][]) {
    if (!raw?.length) { out[prop] = raw; continue; }
    let keys = opaque && prop === "opacity" ? cutOpacity(raw) : raw;
    if (step) keys = stepKeys(system, keys, prop, step, fps);
    out[prop] = keys;
  }
  return out;
}

/**
 * The scene's nodes with the system's motion applied to every track: the node's own tracks, a picture's inner
 * tracks and its lights, and the camera. Both renderers call this first, so they draw the same steps.
 * Holds keep their tracks: they draw nothing, and their opacity is a time window for the check.
 */
export function withSystemMotion<N extends { kind: string; tracks?: Tracks }>(system: System, nodes: N[], fps = 30): N[] {
  if (!stepOf(system) && !opaqueOf(system)) return nodes;
  return nodes.map((n) => {
    if (n.kind === "hold" || n.kind === "audio" || n.kind === "anchor") return n;
    const m = { ...n, tracks: systemTracks(system, n.tracks, fps) } as N & { inner?: Tracks; lights?: { tracks?: Tracks }[] };
    if (m.inner) m.inner = systemTracks(system, m.inner, fps);
    if (m.lights) m.lights = m.lights.map((l) => ({ ...l, tracks: systemTracks(system, l.tracks, fps) }));
    return m;
  });
}

/** The time at which a node's last key ends: the length a scene needs. */
export function endOf(tracks: Tracks | undefined): number {
  let end = 0;
  for (const keys of Object.values(tracks ?? {})) for (const k of keys ?? []) end = Math.max(end, k.t);
  return end;
}
