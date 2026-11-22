// The fast capture page. It mounts one composition in Remotion's Player at full size, as src/player.tsx does,
// with the same Player settings, so the DOM and the pixels are the same. It adds three things:
//
// 1. A commit mark. A wrapper round the composition reads the current frame and sets it in a layout effect.
//    React runs the layout effects of a commit after it has written the whole tree to the DOM, children first.
//    So when the mark equals frame f, the DOM shows frame f, and the 3D canvases (which draw in their own layout
//    effects) have drawn it. The seek waits for this mark, not for two vsyncs. Headless Chrome runs
//    requestAnimationFrame at 60 Hz, so the old seek spent 100 ms of idle time on every frame.
// 2. A frame key. Each scene in the film reports its nodes when it builds. window.__frameKey(f) then computes,
//    from the nodes and their tracks, every value that the renderer reads at frame f. Two frames with the same
//    key draw the same DOM, so the recorder can copy the frame instead of drawing it again. Anything that the
//    key cannot see makes the key null (never equal): footage while it plays, a 3D scene while it shows,
//    a film that is not built from scenes.
// 3. The old seek, as window.__seekSlow, for --slow runs and for --verify.
import { createRoot } from "react-dom/client";
import { Player, type PlayerRef } from "@remotion/player";
import { createRef, useLayoutEffect, type ComponentType } from "react";
import { useCurrentFrame } from "remotion";
import { evaluate, withSystemMotion } from "../../src/system/scene/time";
import { GRAIN_TILES, grainOf, runs } from "../../src/system/scene/layout";
import type { Node, Tracks } from "../../src/system/scene/types";
import type { System } from "../../src/system/systems";

declare global {
  interface Window {
    __meta: { width: number; height: number; fps: number; durationInFrames: number } | null;
    __seek: (frame: number) => Promise<void>;
    __seekSlow: (frame: number) => Promise<void>;
    __frameKey: (frame: number) => string | null;
    __pixelKey: (frame: number) => Promise<string | null>;
    __moves: (frame: number) => boolean;
    __audio: () => unknown[] | null;
    __footage: () => boolean;
    __sound: () => boolean;
    __keyable: boolean;
  }
}

type Entry = { component: ComponentType<any>; props: Record<string, unknown>; width: number; height: number; fps: number; durationInFrames: number };
type Registry = Record<string, Entry>;
type SceneFn = (ctx: { system: System }, B: unknown) => Node[];

/** The nodes of each scene in the film, as the renderer draws them (the system's motion applied), by source. */
const built = new Map<string, { nodes: Node[]; system: System }>();

/** A copy of the scene function that reports its nodes. It returns the same nodes. */
const report = (token: string, scene: SceneFn, fps: number): SceneFn => (ctx, B) => {
  const nodes = scene(ctx, B);
  built.set(token, { nodes: withSystemMotion(ctx.system, nodes, fps), system: ctx.system });
  return nodes;
};

/** The values of a track set at time t, as the renderer evaluates them, in a fixed order, each with its name:
 *  which tracks a node has changes its DOM too (a draw track adds a dash array, a tilt adds a perspective). */
const vals = (system: System, tracks: Tracks | undefined, t: number, out: (number | string)[]) => {
  if (!tracks) return;
  const v = evaluate(system, tracks, t);
  for (const p of Object.keys(tracks).sort()) out.push(`${p}=${v[p as keyof typeof v]}`);
};

/** The key of one scene at its own frame `sf`, or null when its pixels at sf cannot be known from the nodes. */
function sceneKey(token: string, sf: number, fps: number): string | null {
  const b = built.get(token);
  if (!b) return null;
  if (sf < 0) return "before";
  const t = sf / fps;
  const out: (number | string)[] = [];
  // Grain steps one tile per frame (Scene: frame % GRAIN_TILES).
  if (grainOf(b.system) > 0) out.push(sf % GRAIN_TILES);
  for (const n of b.nodes) {
    if (n.kind === "audio") continue;
    if (n.kind === "image" && n.video) {
      // Footage plays inside its Sequence window: every frame there is new.
      const a = Math.round(n.video.at * fps);
      const len = n.video.until !== undefined ? Math.round((n.video.until - n.video.at) * fps) : Infinity;
      if (sf >= a && sf < a + len) return null;
    }
    if (n.kind === "scene3d") {
      // A 3D scene draws a new picture for every time while it shows.
      const s = n.spec as { at: number; until?: number };
      if (t >= s.at && (s.until === undefined || t < s.until)) return null;
    }
    vals(b.system, n.tracks, t, out);
    if (n.kind === "image") {
      vals(b.system, n.inner, t, out);
      for (const l of n.lights ?? []) vals(b.system, l.tracks, t, out);
    }
  }
  return out.join(",");
}

/**
 * The pixel key of a scene film at frame f: a SHA-256 of what draws the frame, without what does not. That is
 * the system, the grain tile, the camera, and every node that shows (opacity above 0) in draw order, with its
 * static properties and its values at f. A node that does not show draws nothing (the renderers hide it), so
 * an edit to a node changes only the frames where it shows. The caller adds the kit code, the frame size and
 * the browser to the key. Null when the frame cannot be keyed (see sceneKey).
 */
const statics = new WeakMap<object, string>();
const staticOf = (n: Node) => {
  let s = statics.get(n);
  if (s === undefined) {
    const { tracks: _t, ...rest } = n as Node & { inner?: unknown; lights?: { tracks?: unknown }[] };
    const r = rest as Record<string, unknown>;
    if (r.inner) delete r.inner;
    if (Array.isArray(r.lights)) r.lights = (r.lights as { tracks?: unknown }[]).map(({ tracks: _lt, ...l }) => l);
    s = JSON.stringify(rest);
    statics.set(n, s);
  }
  return s;
};
async function pixelKey(token: string, sf: number, fps: number): Promise<string | null> {
  const b = built.get(token);
  if (!b || sceneKey(token, sf, fps) === null) return null;
  const t = sf / fps;
  const parts: string[] = [b.system.id, JSON.stringify(b.system), String(grainOf(b.system) > 0 ? sf % GRAIN_TILES : -1)];
  const cam = b.nodes.find((n) => n.kind === "camera");
  if (cam) { const v: (number | string)[] = []; vals(b.system, cam.tracks, t, v); parts.push(`cam:${staticOf(cam)}:${v.join(",")}`); }
  const item = (n: Node, run: number) => {
    const v = evaluate(b.system, n.tracks, t);
    if (!(v.opacity > 0)) return;
    const out: (number | string)[] = [];
    vals(b.system, n.tracks, t, out);
    if (n.kind === "image") { vals(b.system, n.inner, t, out); for (const l of n.lights ?? []) vals(b.system, l.tracks, t, out); }
    parts.push(`${run}|${staticOf(n)}|${out.join(",")}`);
  };
  // Draw order as the renderer builds it: the world's runs, then the pinned (screen) runs. Holds and audio draw nothing.
  let run = 0;
  for (const space of ["world", "screen"] as const) {
    parts.push(space);
    for (const r of runs(b.nodes, space)) {
      const before = parts.length;
      if ("nodes" in r) for (const n of r.nodes) item(n, run); else item(r.node, run);
      if (parts.length > before) run++;
    }
  }
  if (!crypto?.subtle) return null;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parts.join("\n")));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Scale, rotation and tilt: Chrome rasters a layer whose scale changes from frame to frame at a fixed scale, and
 *  redraws it sharp only after it has been still for some frames. */
const RASTER_PROPS = ["scale", "scaleX", "scaleY", "rotate", "tiltX", "tiltY"] as const;
/** True when a scale, rotation or tilt of any node changes between scene frames sf-1 and sf (or the scene is not built). */
function rasterMoves(token: string, sf: number, fps: number): boolean {
  const b = built.get(token);
  if (!b) return true;
  if (sf <= 0) return false;
  const differ = (tr: Tracks | undefined) => {
    if (!tr || !RASTER_PROPS.some((p) => tr[p]?.length)) return false;
    const a = evaluate(b.system, tr, (sf - 1) / fps), c = evaluate(b.system, tr, sf / fps);
    return RASTER_PROPS.some((p) => a[p] !== c[p]);
  };
  for (const n of b.nodes) {
    if (differ(n.tracks)) return true;
    if (n.kind === "image" && differ(n.inner)) return true;
  }
  return false;
}

/** The film's sound nodes in film time, from every built scene (a scene that starts later is shifted by its
 *  start). Null when the film is not built from scenes, so a render cannot know its sound from the nodes. */
function audioOf(sources: { token: string; t0: number }[]): unknown[] | null {
  const out: unknown[] = [];
  for (const { token, t0 } of sources) {
    const b = built.get(token);
    if (!b) return null;
    for (const n of b.nodes) if (n.kind === "audio") out.push({ ...n, at: n.at + t0, ...(n.until !== undefined ? { until: n.until + t0 } : {}) });
  }
  return out;
}

/** How to key one film: a scene film, a showpiece (segments), or nothing (every frame is new). */
function keyerFor(entry: Entry): { props: Record<string, unknown>; key: (f: number) => string | null; pixel?: (f: number) => Promise<string | null>; moves: (f: number) => boolean; audio: () => unknown[] | null; tokens: string[] } {
  const fps = entry.fps;
  const p = entry.props as { scene?: SceneFn; system?: string; film?: { segments: any[]; sound?: SceneFn } };
  if (p.scene && typeof p.system === "string" && Object.keys(p).length === 2) {
    return { props: { ...p, scene: report("main", p.scene, fps) }, key: (f) => sceneKey("main", f, fps), pixel: (f) => pixelKey("main", f, fps),
      moves: (f) => rasterMoves("main", f, fps), audio: () => audioOf([{ token: "main", t0: 0 }]), tokens: ["main"] };
  }
  if (p.film?.segments && Object.keys(p).length === 1) {
    const film = p.film;
    const segments = film.segments.map((s, i) => ("system" in s ? { ...s, scene: report(`seg${i}`, s.scene, fps) } : s));
    const sound = film.sound ? report("sound", film.sound, fps) : undefined;
    const win = (s: { from: number; to: number }) => [Math.round(s.from * fps), Math.round(s.to * fps)] as const;
    return {
      props: { film: { ...film, segments, ...(sound ? { sound } : {}) } },
      key: (f) => {
        const parts: (string | number)[] = [];
        if (sound) { const k = sceneKey("sound", f, fps); if (k === null) return null; parts.push(k); }
        for (let i = 0; i < segments.length; i++) {
          const s = segments[i]!;
          const [a, b] = win(s);
          const t0 = Math.round((s.t0 ?? 0) * fps);
          if ("system" in s) {
            if (f < a || f >= b) { parts.push("-"); continue; }
            const k = sceneKey(`seg${i}`, f - t0, fps);
            if (k === null) return null;
            parts.push(`${i}:${k}`);
          } else {
            // A plain React segment draws render(t) for its clamped frame, all film long (showpieces.tsx, Local).
            parts.push(`${i}@${Math.min(Math.max(f, a), b - 1) - t0}`);
          }
        }
        return parts.join("|");
      },
      tokens: [...segments.flatMap((sg, i) => ("system" in sg ? [`seg${i}`] : [])), ...(sound ? ["sound"] : [])],
      // The sound is its own scene from film time 0; a segment's scene has no sound (showpieces.tsx).
      audio: () => (sound ? audioOf([{ token: "sound", t0: 0 }]) : []),
      // A cut (the live segments change) counts as a move: new layers raster for the first time.
      moves: (f) => {
        for (let i = 0; i < segments.length; i++) {
          const s = segments[i]!;
          const [a, b] = win(s);
          const live = f >= a && f < b, was = f - 1 >= a && f - 1 < b;
          if (live !== was) return true;
          if (live && "system" in s && rasterMoves(`seg${i}`, f - Math.round((s.t0 ?? 0) * fps), fps)) return true;
        }
        return false;
      },
    };
  }
  return { props: entry.props, key: () => null, moves: () => true, audio: () => null, tokens: [] };
}

const raf2 = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
/** One task later: React flushes the passive effects of a commit (media seeks) in a task of its own. */
const nextTask = () => new Promise<void>((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

/**
 * Waits until the page is quiet: no delayRender handle is open (Remotion keeps them in
 * window.remotion_delayRenderHandles, also in the Player, and its own renderer waits for the same list), and
 * the DOM did not change for two tasks in a row. A handle that closes usually comes with a state change (a
 * system film shows its content when its fonts are in), and React draws that change in a task of its own;
 * the quiet tasks let that draw land. It returns false when the page is not quiet after `limitMs`.
 */
async function quiet(limitMs: number) {
  const root = document.getElementById("root")!;
  let dirty = false;
  const mo = new MutationObserver(() => { dirty = true; });
  mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  const start = performance.now();
  try {
    for (let calm = 0; calm < 2;) {
      dirty = false;
      await nextTask();
      const open = ((window as unknown as { remotion_delayRenderHandles?: unknown[] }).remotion_delayRenderHandles ?? []).length;
      calm = !dirty && open === 0 ? calm + 1 : 0;
      if (calm < 2 && performance.now() - start > limitMs) return false;
      if (open) await new Promise((r) => setTimeout(r, 2));
    }
    return true;
  } finally { mo.disconnect(); }
}

/** Waits for what a frame reads from outside the DOM: fonts, 3D models, decoded pictures, seeked footage. */
async function settle(videoLimitMs: number) {
  await document.fonts.ready;
  await Promise.all([...((globalThis as unknown as { __vs3dPending?: Set<Promise<unknown>> }).__vs3dPending ?? [])].map((p) => p.catch(() => {})));
  await Promise.all(Array.from(document.images).map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => {}))));
  const videos = Array.from(document.querySelectorAll("video"));
  await Promise.all(videos.map((v) => new Promise<void>((resolve, reject) => {
    const ready = () => !v.seeking && v.readyState >= 2;
    if (ready()) return resolve();
    const start = performance.now();
    const tick = () => {
      if (ready()) return resolve();
      // The old seek gave up after 3 s and recorded whatever the footage showed: on a busy machine that is a
      // wrong frame. This seek fails the frame instead, so the recorder can retry it.
      if (performance.now() - start > videoLimitMs) return reject(new Error(`footage not ready after ${videoLimitMs} ms: ${v.currentSrc}`));
      setTimeout(tick, 5);
    };
    tick();
  })));
  return videos.length;
}

/** Mounts one composition from `registry` (chosen by ?comp=) and exposes __meta, __seek, __seekSlow and __frameKey. */
export function mountPlayer(registry: Registry) {
  const id = new URLSearchParams(location.search).get("comp") ?? "";
  const entry = registry[id];
  const playerRef = createRef<PlayerRef>();
  if (!entry) {
    document.body.textContent = `Unknown composition: ${id}`;
    window.__meta = null;
    return;
  }
  const { component: Inner, width, height, fps, durationInFrames } = entry;
  const keyer = keyerFor(entry);
  window.__keyable = keyer.props !== entry.props;
  window.__meta = { width, height, fps, durationInFrames };
  window.__frameKey = keyer.key;
  window.__pixelKey = keyer.pixel ?? (async () => null);
  window.__moves = keyer.moves;
  window.__audio = keyer.audio;
  // Footage anywhere in the film's built scenes (or a film the scene model cannot see into).
  // A scene that has not been built yet (a segment that shows later) may hold footage: then the answer is yes.
  window.__sound = () => !window.__keyable || keyer.tokens.some((t) => !built.has(t)) || [...built.values()].some((b) => b.nodes.some((n) => n.kind === "audio"));
  window.__footage = () => !window.__keyable || keyer.tokens.some((t) => !built.has(t)) || [...built.values()].some((b) => b.nodes.some((n) => n.kind === "image" && !!n.video));

  let committed = -1;
  const waiters = new Map<number, () => void>();
  // The wrapper adds no element: the DOM is the composition's own.
  const Marked = (props: Record<string, unknown>) => {
    const frame = useCurrentFrame();
    useLayoutEffect(() => {
      committed = frame;
      const w = waiters.get(frame);
      if (w) { waiters.delete(frame); w(); }
    });
    return <Inner {...props} />;
  };

  // Errors the film throws while it draws: the Player catches them and shows its own error screen, so React never
  // commits the frame. The seek reports such an error by its text instead of waiting.
  let filmError: string | null = null;
  let hooked = false;
  window.addEventListener("error", (e) => { filmError = String(e.error?.message ?? e.message); });
  window.addEventListener("unhandledrejection", (e) => { filmError = String((e.reason as Error)?.message ?? e.reason); });
  const waitCommit = (frame: number, ms: number) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return new Promise<boolean>((r) => { waiters.set(frame, () => r(true)); timer = setTimeout(() => r(false), ms); })
      .finally(() => { clearTimeout(timer); waiters.delete(frame); });
  };
  let warned = false;
  window.__seek = async (frame: number) => {
    if (!hooked && playerRef.current) {
      playerRef.current.addEventListener("error", (e) => { filmError = String((e as unknown as { detail: { error: Error } }).detail?.error?.message ?? "the film threw"); });
      hooked = true;
    }
    if (committed !== frame) {
      const done = waitCommit(frame, 5000);
      playerRef.current?.seekTo(frame);
      let ok = await done;
      if (!ok) {
        // No commit in 5 s. Either the film threw (say so), or the Player is already on this frame and React has
        // nothing new to commit (then the DOM shows the frame: record it after the old seek's waits), or the seek
        // did not reach the Player (seek once more, then fail).
        if (filmError) throw new Error(`frame ${frame}: the film threw while drawing it: ${filmError}`);
        if (playerRef.current?.getCurrentFrame() === frame) {
          if (!warned) { console.warn(`frame ${frame}: no React commit came for this frame; it is recorded after the old seek's animation-frame waits`); warned = true; }
          await raf2(); await raf2(); await raf2();
          committed = frame;
          ok = true;
        } else {
          const again = waitCommit(frame, 10000);
          playerRef.current?.seekTo(frame);
          ok = await again;
          if (!ok) throw new Error(`frame ${frame}: the Player did not reach it (it shows frame ${playerRef.current?.getCurrentFrame()})${filmError ? `; the film threw: ${filmError}` : ""}`);
        }
      }
    }
    if (!(await quiet(30000))) throw new Error(`frame ${frame}: the page did not settle in 30 s (an open delayRender, or a DOM that keeps changing)`);
    const videos = await settle(30000);
    // Footage: the decoded frame reaches the compositor on the next frame; wait for it as the old seek did.
    // __settleFrames (set by the recorder): extra animation-frame pairs on every frame, for the bench.
    // A frame where a scale, rotation or tilt changes (or that the scene cannot describe) also waits two animation
    // frames, so Chrome redraws scaled layers sharp, as it did under the old seek's waits. On the hero this took
    // the difference to the old recorder from 362 frames (up to 247 levels) to its own noise (out/perf/RESULT.md).
    // __settleFrames (set by the recorder for the bench): extra pairs on every frame.
    const extra = (window as unknown as { __settleFrames?: number }).__settleFrames ?? 0;
    const pairs = Math.max(videos || keyer.moves(frame) ? 1 : 0, extra);
    for (let i = 0; i < pairs; i++) await raf2();
  };

  // The seek of src/player.tsx, unchanged (for --slow and --verify).
  window.__seekSlow = async (frame: number) => {
    playerRef.current?.seekTo(frame);
    await raf2();
    await document.fonts.ready;
    await Promise.all([...((globalThis as unknown as { __vs3dPending?: Set<Promise<unknown>> }).__vs3dPending ?? [])].map((p) => p.catch(() => {})));
    await raf2();
    await Promise.all(Array.from(document.images).map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => {}))));
    await Promise.all(Array.from(document.querySelectorAll("video")).map((v) => new Promise<void>((r) => {
      const ready = () => !v.seeking && v.readyState >= 2;
      if (ready()) return r();
      const tick = () => (ready() ? r() : setTimeout(tick, 10));
      setTimeout(() => r(), 3000);
      tick();
    })));
    await raf2();
  };

  createRoot(document.getElementById("root")!).render(
    <Player
      ref={playerRef}
      component={Marked}
      inputProps={keyer.props}
      durationInFrames={durationInFrames}
      fps={fps}
      compositionWidth={width}
      compositionHeight={height}
      style={{ width, height }}
      controls={false}
      clickToPlay={false}
      acknowledgeRemotionLicense
    />,
  );
}
