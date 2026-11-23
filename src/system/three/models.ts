// Real models by name. A model is a prepared asset in assets/media/<name>/ with its native bounds in the
// media table (`untell media add` writes both; in the repository, scripts/media.ts prepare-model), so a scene can size and frame it before the
// file loads.
//
//   { id: "lamp", geometry: model("lantern", { height: 2.4 }), position: [0, 1.2, 0] }
//
// The model is centred on the origin like every other geometry: put its centre at half its height to
// stand it on the floor (standing() does this).
import { MODELS } from "../media.gen";
import { sizeOf } from "./model";
import type { Geometry, Object3D, Vec3 } from "./spec";

type By = { height: number } | { width: number } | { longest: number };

/** A model geometry for a prepared model, scaled so one dimension has the given length in scene units. */
export function model(name: string, by: By, material: "own" | "system" = "own"): Extract<Geometry, { kind: "model" }> {
  const m = MODELS[name];
  if (!m) throw new Error(`model "${name}" is not prepared: add the .glb or .gltf file first (in a project: \`untell media add <file> --as ${name}\`; in the untell lab: \`bun scripts/media.ts prepare-model ${name}\`). Models: ${Object.keys(MODELS).join(", ") || "none"}`);
  return { kind: "model", src: `${name}/${m.file}`, size: sizeOf(m, by), material };
}

/** One object: the model standing on the floor (y 0), centred on the y axis. */
export function standing(id: string, name: string, by: By, extra: Partial<Object3D> & { material?: Object3D["material"]; materials?: "own" | "system" } = {}): Object3D {
  const { materials, ...rest } = extra;
  const geometry = model(name, by, materials);
  const p: Vec3 = rest.position ?? [0, 0, 0];
  return { id, geometry, ...rest, position: [p[0], p[1] + geometry.size[1] / 2, p[2]] };
}
