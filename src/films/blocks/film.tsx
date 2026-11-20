// Helpers for block demo films. A block group's module exports FILMS: one composition per block and
// system, so each block shows in a light, a dark and an awkward system (and 16:9 where it matters).
import type { ComponentType } from "react";
import { BLOCKS } from "../../system/scene/blocks";
import type { Ctx, Node } from "../../system/scene/types";
import { Blocks, SystemFilm } from "../../system/remotion";

/**
 * A film entry. `demo`: a block demo or a read-through (a few seconds of one block or one frame): the detector runs its
 * frame rules only (scripts/detect.ts reads it). filmsFor sets it; sceneEntry sets it when asked.
 */
export type Entry = { component: ComponentType<any>; props: Record<string, unknown>; width: number; height: number; fps: number; durationInFrames: number; demo?: boolean };
export type Scene = (ctx: Ctx, B: typeof BLOCKS) => Node[];

/** The systems every block is shown in: light (Spec), dark (Graphite), awkward (Pop: overshooting curves, thick strokes). */
export const DEMO_SYSTEMS = ["spec", "graphite", "pop"] as const;

const cache = new Map<Scene, (ctx: Ctx) => Node[]>();
function SceneFilm({ system, scene }: { system: string; scene: Scene }) {
  if (!cache.has(scene)) cache.set(scene, (ctx: Ctx) => scene(ctx, BLOCKS));
  return (
    <SystemFilm system={system}>
      <Blocks build={cache.get(scene)!} />
    </SystemFilm>
  );
}

/** Films for one scene: `<name>-<system>` at 9:16 for each demo system, plus extra systems or a 16:9 cut. */
export function filmsFor(name: string, scene: Scene, seconds: number, opts: { systems?: readonly string[]; wide?: boolean } = {}): Record<string, Entry> {
  const out: Record<string, Entry> = {};
  for (const system of opts.systems ?? DEMO_SYSTEMS) {
    out[`${name}-${system}`] = { component: SceneFilm, props: { system, scene }, width: 1080, height: 1920, fps: 30, durationInFrames: Math.round(seconds * 30), demo: true };
  }
  if (opts.wide) out[`${name}-wide`] = { component: SceneFilm, props: { system: "spec", scene }, width: 1920, height: 1080, fps: 30, durationInFrames: Math.round(seconds * 30), demo: true };
  return out;
}

/** One film entry for a scene in one system, at any size. `demo`: a block demo or a read-through (see Entry). */
export function sceneEntry(scene: Scene, system: string, seconds: number, width = 1080, height = 1920, o: { demo?: boolean } = {}): Entry {
  return { component: SceneFilm, props: { system, scene }, width, height, fps: 30, durationInFrames: Math.round(seconds * 30), ...(o.demo ? { demo: true } : {}) };
}

/** The same films, each marked a demo (frame rules only). */
export const asDemos = (films: Record<string, Entry>): Record<string, Entry> => Object.fromEntries(Object.entries(films).map(([k, e]) => [k, { ...e, demo: true }]));
