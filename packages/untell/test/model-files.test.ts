// A model keeps its files inside it (item 33), and a page opened from a file reads it through model.glb.js (item 32).
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelScript, prepareModel } from "../src/media";

/** A GLB with only a JSON chunk. */
function glb(json: object): Uint8Array {
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(12 + 8 + body.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true); v.setUint32(4, 2, true); v.setUint32(8, out.length, true);
  v.setUint32(12, body.length, true); v.setUint32(16, 0x4e4f534a, true);
  out.set(body, 20);
  return out;
}

test("a .glb that names a texture outside it is refused when it is added, not at render", () => {
  const dir = mkdtempSync(join(tmpdir(), "untell-model-"));
  const f = join(dir, "lamp.glb");
  writeFileSync(f, glb({ asset: { version: "2.0" }, images: [{ uri: "textures/brass.png" }] }));
  expect(() => prepareModel(f, dir, "lamp")).toThrow(/names files outside it \(textures\/brass\.png\)/);
});

test("model.glb.js holds the model's bytes, keyed by its own src without .js", () => {
  const bytes = new Uint8Array([1, 2, 3, 250]);
  const js = modelScript(bytes);
  const g: Record<string, unknown> = {};
  new Function("globalThis", "document", js)(g, { currentScript: { getAttribute: () => "assets/media/lamp/model.glb.js" } });
  const stored = (g.__vsModelBytes as Record<string, string>)["assets/media/lamp/model.glb"]!;
  expect([...Buffer.from(stored, "base64")]).toEqual([1, 2, 3, 250]);
  void readFileSync;
});

test("media list shows a model's size, not a picture's fields (item 37)", () => {
  const { mediaState } = require("../src/media");
  expect(mediaState("model", { kind: "model", file: "model.glb", min: [-0.06, 0, -0.05], max: [0.06, 0.29, 0.05] })).toBe("model.glb, size 0.120 x 0.290 x 0.100 (file units)");
  expect(mediaState("model", undefined)).toBe("not measured");
  expect(mediaState("photo", { grade: "matte", width: 2000, height: 3000 })).toBe("prepared (matte), 2000x3000");
});

// A project's own model frames by its silhouette: untell media add measures it and writes the kit's
// silhouettes table, the same table the repository makes for its own models.
const VASE = join(import.meta.dir, "..", "..", "..", "assets", "media", "model-vase", "model.glb");
test.skipIf(!require("node:fs").existsSync(VASE))("media add of a .glb stores its silhouette, and the table the kit reads holds it", async () => {
  const { mkdirSync, copyFileSync } = require("node:fs") as typeof import("node:fs");
  const { writeTable } = require("../src/media-store") as typeof import("../src/media-store");
  const root = mkdtempSync(join(tmpdir(), "untell-sil-"));
  const media = join(root, "assets", "media"), kit = join(root, "untell");
  mkdirSync(join(media, "vase"), { recursive: true });
  mkdirSync(join(kit, "three"), { recursive: true });
  copyFileSync(VASE, join(media, "vase", "source.glb"));
  prepareModel(join(media, "vase", "source.glb"), null, "vase");
  const meta = JSON.parse(readFileSync(join(media, "vase", "meta.json"), "utf8"));
  // The same measure as the repository's table for this model.
  const { SILHOUETTES } = await import("../../../src/system/three/silhouettes.gen");
  expect(meta.silhouette).toEqual(JSON.parse(JSON.stringify(SILHOUETTES["model-vase"])));
  const manifest = join(root, "untell-media.json");
  writeFileSync(manifest, JSON.stringify({ vase: { kind: "model", file: "source.glb" } }));
  writeFileSync(join(kit, "three", "silhouettes.gen.ts"), "export const SILHOUETTES = {};\n");
  writeTable({ framework: "hyperframes", kit, mediaRel: "assets/media", media, manifest, table: join(kit, "media.gen.ts"), lock: join(root, ".lock"), work: join(root, ".untell") });
  const t = await import(join(kit, "three", "silhouettes.gen.ts"));
  expect(Object.keys(t.SILHOUETTES)).toEqual(["vase"]);
  expect(t.SILHOUETTES.vase).toEqual(meta.silhouette);
});
