// Template: scripts/pack.ts copies this file to registry/kit/film.tsx, beside the kit it imports.
// Turns a scene module into a Remotion composition. Added to the kit by untell; the repository has no such file.
// A scene module exports `system`, `seconds` and `scene` (see the example film). One module serves both
// frameworks: Remotion through this file, HyperFrames through `untell build`.
//
//   import { sceneComposition } from "../untell/film";
//   import * as film from "./my-film";
//   export const MyFilm = sceneComposition("my-film", film);
//   // in your Root: <Composition {...MyFilm} />
//
// Remotion sends props to the page as JSON, which drops functions. A scene is a function, so the
// component closes over it and takes no props.
import { staticFile } from "remotion";
import { BLOCKS } from "./scene/blocks";
import type { Ctx, Node } from "./scene/types";
import { Blocks, SystemFilm } from "./remotion";

export type Scene = (ctx: Ctx, B: typeof BLOCKS) => Node[];
export type SceneModule = { system: string; seconds: number; scene: Scene; width?: number; height?: number; fps?: number };

// Pictures and sound: a plain asset name means public/media/<name>/ (Remotion serves files from public/).
const g = globalThis as unknown as { __vsAssets?: string };
g.__vsAssets ??= staticFile("media") + "/";

/** The props for <Composition>: id, component, size, frame rate and length. 9:16 at 30 fps by default. */
export function sceneComposition(id: string, m: SceneModule) {
  const build = (ctx: Ctx) => m.scene(ctx, BLOCKS);
  const component = () => (
    <SystemFilm system={m.system}>
      <Blocks build={build} />
    </SystemFilm>
  );
  const fps = m.fps ?? 30;
  return { id, component, width: m.width ?? 1080, height: m.height ?? 1920, fps, durationInFrames: Math.round(m.seconds * fps) };
}
