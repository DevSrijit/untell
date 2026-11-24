// Framing by silhouette (product with no fill): the table is current, glass does not count, a thin object in the hook
// gets a detail of its densest part, and every other object keeps its whole view inside the room.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BLOCKS } from "../scene/blocks";
import { makeCtx } from "../scene/context";
import { SYSTEMS } from "../systems";
import { MODELS } from "../media.gen";
import { fitModel, gltfBounds, gltfJson } from "./model";
import { standing } from "./models";
import { silhouetteOfGlb, solidTriangles, viewAt } from "./silhouette";
import { SILHOUETTES } from "./silhouettes.gen";

const ROOT = resolve(import.meta.dir, "../../..");
// The model files are media that you add (assets/media/<name>/model.glb); the tests that read them skip without them.
const VASE = join(ROOT, "assets/media/model-vase/model.glb");
const HAS_LAMP = "velora-lamp" in MODELS;
const ctxOf = (id: string, w = 1080, h = 1920) => { const s = SYSTEMS.find((x) => x.id === id)!; return makeCtx(s, w, h, (t, r) => t.length * s.type[r].size * w * 0.5); };
type Framing = { data: { by: string; share: number; asked: number; turn: number } };
const framing = (nodes: ReturnType<typeof BLOCKS.product>) => nodes.find((n) => n.id === "p-framing") as unknown as Framing;

describe("silhouette tables", () => {
  test.skipIf(!existsSync(VASE))("every model has a table, and the vase's table is what its file draws today", () => {
    for (const name of Object.keys(MODELS)) expect([name, !!SILHOUETTES[name]]).toEqual([name, true]);
    const bytes = new Uint8Array(readFileSync(VASE));
    expect(silhouetteOfGlb(bytes, gltfBounds(gltfJson(bytes)))).toEqual(SILHOUETTES["model-vase"]!);
  });
  test.skipIf(!HAS_LAMP)("a thin lamp covers far less of its square than an armchair; a turn changes what it shows", () => {
    const lamp = SILHOUETTES["velora-lamp"]!, chair = SILHOUETTES["model-armchair"]!;
    expect(viewAt(lamp, 0, 15)[0]!).toBeLessThan(viewAt(chair, 0, 15)[0]! / 3);
    const shares = Array.from({ length: 24 }, (_, k) => viewAt(lamp, k * 15, 15)[0]!);
    expect(Math.max(...shares)).toBeGreaterThan(Math.min(...shares) * 1.3);
  });
});

describe("product framing with no fill", () => {
  for (const id of ["matte", "keynote", "studio"]) for (const [w, h] of [[1080, 1920], [1920, 1080]] as const) {
    test.skipIf(!HAS_LAMP)(`${id} ${w}x${h}: the desk lamp in the hook frames a detail of its shade, and the lamp runs past the frame on purpose`, () => {
      const ctx = ctxOf(id, w, h);
      const said: string[] = [], warn = console.warn;
      console.warn = (m: string) => said.push(m);
      let nodes;
      try { nodes = BLOCKS.product({ id: "p", objects: [standing("lamp", "velora-lamp", { height: 2.8 })], shot: "turntable", at: 0 }, ctx); } finally { console.warn = warn; }
      const f = framing(nodes);
      expect(f.data.by).toBe("silhouette detail");
      expect((nodes.find((n) => n.id === "p") as { bleed?: boolean }).bleed).toBe(true);
      expect(said.some((m) => m.includes("frames a detail of its densest part"))).toBe(true);
    });
    test(`${id} ${w}x${h}: the lantern, the vase and the armchair keep their whole view; it fills the room or covers the share`, () => {
      const ctx = ctxOf(id, w, h);
      for (const [name, by] of [["model-lantern", { height: 2.6 }], ["model-vase", { height: 3 }], ["model-armchair", { height: 2 }]] as const) {
        const nodes = BLOCKS.product({ id: "p", objects: [standing("o", name, by)], shot: "turntable", at: 0 }, ctx);
        const f = framing(nodes), ext = nodes.find((n) => n.id === "p-object-extent") as unknown as { x: number; y: number; w: number; h: number };
        expect([name, f.data.by]).toEqual([name, "silhouette"]);
        // Inside the frame; at 9:16 under the top 30 % (the line's place).
        expect(ext.x).toBeGreaterThanOrEqual(0);
        expect(ext.x + ext.w).toBeLessThanOrEqual(w);
        expect(ext.y + ext.h).toBeLessThanOrEqual(h);
        if (h > w) expect(ext.y).toBeGreaterThanOrEqual(h * 0.3 - 1);
        // The share asked, or the room's height (0.56 of a 9:16 frame, 0.86 of a 16:9 frame) or width binds.
        const full = ext.h >= h * (h > w ? 0.56 : 0.86) * 0.97 || ext.w >= w * 0.86 * 0.97;
        expect([name, f.data.share >= f.data.asked * 0.97 || full]).toEqual([name, true]);
      }
    });
  }
  test.skipIf(!HAS_LAMP)("a scene's fill keeps the old framing; an angle given is kept (no turn)", () => {
    const ctx = ctxOf("matte");
    const lamp = standing("lamp", "velora-lamp", { height: 2.8 }, { rotation: [0, 30, 0] });
    expect(framing(BLOCKS.product({ id: "p", objects: [lamp], fill: 0.6, at: 0 }, ctx)).data.by).toBe("fill");
    expect(framing(BLOCKS.product({ id: "p", objects: [lamp], at: 0 }, ctx)).data.turn).toBe(0);
  });
  for (const id of ["matte", "keynote", "studio"]) test.skipIf(!HAS_LAMP)(`${id}: the lamp under a headline (the block map's room) comes in close and keeps the room's top clear`, () => {
    const ctx = ctxOf(id), room = { x: 0, y: 620, w: 1080, h: 1240 };
    const nodes = BLOCKS.product({ id: "p", objects: [standing("lamp", "velora-lamp", { height: 2.8 })], shot: "turntable", room, at: 0 }, ctx);
    const ext = nodes.find((n) => n.id === "p-object-extent") as unknown as { y: number };
    expect(framing(nodes).data.by).toBe("silhouette detail");
    expect(ext.y).toBeGreaterThanOrEqual(room.y - 0.5);
    // A later shot (after the hook) keeps the whole lamp in the room.
    const later = BLOCKS.product({ id: "p", objects: [standing("lamp", "velora-lamp", { height: 2.8 })], shot: "turntable", room, at: 4 }, ctx);
    expect(framing(later).data.by).toBe("silhouette");
  });
});

test("a detail shot given a box fills the frame: the box is its room, never a clip with hard edges", async () => {
  // Before: a Keynote detail shot given a box showed as a crop with hard edges on the black ground.
  const { BLOCKS } = await import("../scene/blocks");
  const { SYSTEMS } = await import("../systems");
  const { makeCtx } = await import("../scene/context");
  const s = SYSTEMS.find((x) => x.id === "keynote")!;
  const ctx = makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
  const box = { x: 120, y: 800, w: 700, h: 600 };
  const objects = [{ id: "cube", geometry: { kind: "box" as const, size: [1, 1, 1] as [number, number, number] }, material: "matte" as const }];
  const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
  const withBox = quiet(() => BLOCKS.product({ id: "d", objects: objects as never, frame: "detail", detail: { point: [0.5, 0.5, 1] }, box, at: 0, until: 2 }, ctx));
  const withRoom = quiet(() => BLOCKS.product({ id: "d", objects: objects as never, frame: "detail", detail: { point: [0.5, 0.5, 1] }, room: box, at: 0, until: 2 }, ctx));
  expect(JSON.stringify(withBox)).toBe(JSON.stringify(withRoom));
  const canvas = withBox.find((n) => n.kind === "scene3d") as { box?: { w: number } } | undefined;
  expect(canvas?.box === undefined || canvas.box.w === 1080).toBe(true);
});

describe("a product shot centres what the model draws", () => {
  // Before: a turned model in a shot with a fill stood with its box on the centre, and its drawn body did not.
  // Binoculars turned 20 degrees on the Keynote end card drew 36 px left of the centred name under them.
  const BINO = "keynote-binocular", file = MODELS[BINO] ? join(ROOT, "assets/media", BINO, MODELS[BINO]!.file) : "";
  type V3 = [number, number, number];
  /** The left and right edge of the model's solid triangles on screen, in perspective, as the renderer draws them. */
  const drawn = (spec: { objects: { rotation?: V3; children?: { position?: V3; rotation?: V3; geometry?: { size: V3 } }[] }[]; camera: { position: V3; target?: V3; fov: number }; box: { x: number; y: number; w: number; h: number } }) => {
    const bytes = new Uint8Array(readFileSync(file)), tris = solidTriangles(bytes);
    const group = spec.objects[0]!, o = group.children![0]!;
    const fit = fitModel(gltfBounds(gltfJson(bytes)), o.geometry!.size);
    const turnY = (p: V3, deg: number): V3 => { const a = (deg * Math.PI) / 180; return [p[0] * Math.cos(a) + p[2] * Math.sin(a), p[1], -p[0] * Math.sin(a) + p[2] * Math.cos(a)]; };
    const { position: c, target: t, fov } = spec.camera, box = spec.box;
    const f = [t![0] - c[0], t![1] - c[1], t![2] - c[2]], fl = Math.hypot(...f);
    const fw: V3 = [f[0]! / fl, f[1]! / fl, f[2]! / fl], rl = Math.hypot(fw[2], fw[0]), r: V3 = [-fw[2] / rl, 0, fw[0] / rl];
    const k = Math.tan((fov * Math.PI) / 360) * (box.w / box.h);
    let x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < tris.length; i += 3) {
      let p: V3 = [tris[i]! * fit.scale + fit.offset[0], tris[i + 1]! * fit.scale + fit.offset[1], tris[i + 2]! * fit.scale + fit.offset[2]];
      p = turnY(p, o.rotation?.[1] ?? 0);
      const at = o.position ?? [0, 0, 0];
      p = turnY([p[0] + at[0], p[1] + at[1], p[2] + at[2]], group.rotation?.[1] ?? 0);
      const v: V3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], z = v[0] * fw[0] + v[1] * fw[1] + v[2] * fw[2];
      const sx = box.x + (((v[0] * r[0] + v[2] * r[2]) / z / k + 1) / 2) * box.w;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
    }
    return { x0, x1 };
  };
  test.skipIf(!existsSync(file))("a turned model in a still shot with a fill: its drawn body on the room's centre, inside its extent", () => {
    const ctx = ctxOf("keynote");
    for (const room of [{ x: 0, y: 220, w: 1080, h: 420 }, { x: 120, y: 220, w: 700, h: 420 }]) for (const turn of [-20, 35]) {
      const nodes = BLOCKS.product({ id: "p", objects: [standing("bino", BINO, { width: 2.4 }, { rotation: [0, turn, 0] })], shot: "still", fill: 0.5, room, sweep: false, at: 0 }, ctx);
      const spec = (nodes.find((n) => n.kind === "scene3d") as unknown as { spec: Parameters<typeof drawn>[0] }).spec;
      const b = drawn(spec), mid = (b.x0 + b.x1) / 2;
      expect([room.x, turn, Math.abs(mid - (room.x + room.w / 2)) <= 2]).toEqual([room.x, turn, true]);
      // The extent (where text keeps out) holds the whole body, so a line placed by it does not touch the model.
      const ext = nodes.find((n) => n.id === "p-object-extent") as unknown as { x: number; w: number };
      expect([turn, b.x0 >= ext.x - 0.5 && b.x1 <= ext.x + ext.w + 0.5]).toEqual([turn, true]);
      // The fill keeps its size: the body is about half the frame's width.
      expect(b.x1 - b.x0).toBeGreaterThan(1080 * 0.5 * 0.75);
    }
  });
});
