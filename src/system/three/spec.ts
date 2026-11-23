// The 3D scene spec. A 3D scene is data, like every other part of a film: objects made from simple
// geometry or real models (glTF), materials named by colour role and finish, a light rig chosen by the system, and keyframe
// tracks for the camera and the objects. One renderer (render.ts) draws a spec at any time t, so Remotion
// and HyperFrames draw the same frame from the same data.
import type { ColorRole } from "../scene/roles";
import type { Key } from "../scene/types";

export type Vec3 = [number, number, number];

/** A vector track: one key list per axis. Missing axes hold the object's base value. */
export type Track3 = { x?: Key[]; y?: Key[]; z?: Key[] };

/** How a surface takes light. Colour always comes from a role, never a value. */
export type Finish = "matte" | "satin" | "metal" | "gloss";
export type Material = { role: ColorRole; finish?: Finish };

export type Geometry =
  /** A box with rounded edges. Sizes in scene units. */
  | { kind: "box"; size: Vec3; radius?: number }
  | { kind: "sphere"; r: number }
  /** A cylinder whose top and bottom edges round over by `radius`. */
  | { kind: "cylinder"; r: number; h: number; radius?: number }
  | { kind: "torus"; r: number; tube: number }
  /** A solid of revolution: a profile of [radius, height] points turned about the y axis. */
  | { kind: "lathe"; profile: [number, number][] }
  /** A flat SVG path (in a 1 x 1 box, y down) extruded to a depth, with an optional rounded bevel. */
  | { kind: "extrude"; path: string; size: number; depth: number; bevel?: number }
  /**
   * A real model from a glTF file (.glb, or .gltf with its files), in assets/media/<name>/. The renderer
   * scales it to `size` (scene units) and centres it on the origin, like the other geometries. Build it
   * with model() in src/system/three/models.ts, which reads the size from the media table.
   * material: "own" (default) keeps the artist's PBR materials and textures; "system" maps every
   * material to a finish and a colour role of the system (see render.ts), and keeps its surface detail.
   */
  | { kind: "model"; src: string; size: Vec3; material?: "own" | "system" };

export type Object3D = {
  id: string;
  geometry?: Geometry;
  material?: Material;
  position?: Vec3;
  /** Degrees about x, y, z. */
  rotation?: Vec3;
  scale?: number;
  children?: Object3D[];
  tracks?: { position?: Track3; rotation?: Track3; scale?: Key[] };
};

export type Scene3D = {
  id: string;
  /** Where the 3D view sits in the frame, px. Usually the whole frame. */
  box: { x: number; y: number; w: number; h: number };
  camera: { fov?: number; position: Vec3; target?: Vec3; tracks?: { position?: Track3; target?: Track3 } };
  objects: Object3D[];
  /** A floor under the objects, in a colour role, with a soft contact shadow. Default: the ground role. */
  floor?: { role?: ColorRole; y?: number } | false;
  /** A band of light that crosses the objects once (systems that allow "light-sweep"). */
  sweep?: { at: number; duration?: number; from?: Vec3; to?: Vec3 }[];
  at: number;
  until?: number;
};
