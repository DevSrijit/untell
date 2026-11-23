import { describe, expect, test } from "bun:test";
import { fitModel, gltfBounds, gltfJson, packGlb, sizeOf } from "./model";

// A cube from -1 to 1 under a node chain: the parent moves it up 10 and scales it by 0.001 (a file in
// millimetres); the child turns it 90 degrees about z.
const cube = {
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { translation: [0, 10, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number], children: [1] },
    { rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] as [number, number, number, number], mesh: 0 },
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
  accessors: [{ min: [-1, -2, -3], max: [1, 2, 3] }],
  buffers: [{ uri: "a.bin", byteLength: 6 }],
  bufferViews: [{ buffer: 0, byteOffset: 2, byteLength: 4 }],
  images: [{ uri: "t%20x.png" }],
};
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));

describe("gltfBounds", () => {
  test("applies node transforms down the tree", () => {
    const b = gltfBounds(cube);
    // The turn about z swaps x and y extents; then the scale and the move.
    close(b.min, [-0.002, 10 - 0.001, -0.003]);
    close(b.max, [0.002, 10 + 0.001, 0.003]);
  });
  test("a matrix wins over TRS", () => {
    const g = { ...cube, nodes: [{ matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 0, 0, 1], mesh: 0 }] };
    const b = gltfBounds(g);
    close(b.min, [-1, -4, -6]);
    close(b.max, [3, 4, 6]);
  });
  test("throws when nothing has bounds", () => {
    expect(() => gltfBounds({ scenes: [{ nodes: [] }] })).toThrow();
  });
});

describe("packGlb", () => {
  test("puts buffers and images in one binary chunk and reads back the same JSON bounds", () => {
    const files: Record<string, Uint8Array> = { "a.bin": new Uint8Array([1, 2, 3, 4, 5, 6]), "t x.png": new Uint8Array([9, 9, 9]) };
    const glb = packGlb(cube, (u) => files[u]!);
    const dv = new DataView(glb.buffer);
    expect(dv.getUint32(0, true)).toBe(0x46546c67);
    expect(dv.getUint32(8, true)).toBe(glb.byteLength);
    const json = gltfJson(glb) as typeof cube & { images: { bufferView: number; mimeType: string; uri?: string }[]; bufferViews: { byteOffset: number; byteLength: number }[] };
    expect(json.buffers as unknown).toEqual([{ byteLength: 12 }]); // 6 bytes, padded to 8, then 3 bytes padded to 4
    expect(json.bufferViews[0]!.byteOffset).toBe(2);
    const img = json.images[0]!;
    expect(img.uri).toBeUndefined();
    expect(img.mimeType).toBe("image/png");
    expect(json.bufferViews[img.bufferView]).toEqual({ buffer: 0, byteOffset: 8, byteLength: 3 });
    // The binary chunk holds the image bytes at the view's offset.
    const jsonLen = dv.getUint32(12, true);
    const bin = 20 + jsonLen + 8;
    expect([...glb.subarray(bin + 8, bin + 11)]).toEqual([9, 9, 9]);
    expect(gltfBounds(json)).toEqual(gltfBounds(cube));
  });
});

describe("fitModel and sizeOf", () => {
  const mm = { min: [-60, 0, -50] as [number, number, number], max: [60, 300, 50] as [number, number, number] };
  test("sizeOf scales by the named dimension", () => {
    close(sizeOf(mm, { height: 3 }), [1.2, 3, 1]);
    close(sizeOf(mm, { width: 1.2 }), [1.2, 3, 1]);
    close(sizeOf(mm, { longest: 6 }), [2.4, 6, 2]);
  });
  test("the same model in metres or millimetres fits to the same size, centred", () => {
    const m = { min: mm.min.map((v) => v / 1000) as [number, number, number], max: mm.max.map((v) => v / 1000) as [number, number, number] };
    const size = sizeOf(mm, { height: 3 });
    for (const b of [mm, m]) {
      const f = fitModel(b, size);
      close(f.size, size);
      expect(f.error).toBeCloseTo(0, 9);
      // Centre of the fitted model: (min + max) / 2 * scale + offset = 0.
      for (let i = 0; i < 3; i++) expect(((b.min[i]! + b.max[i]!) / 2) * f.scale + f.offset[i]!).toBeCloseTo(0, 9);
    }
  });
  test("reports how far a file is from the table", () => {
    const f = fitModel(mm, [1.2, 3, 2]); // depth says 2, the file gives 1
    expect(f.error).toBeCloseTo(0.5, 9);
  });
});
