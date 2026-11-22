// Faults fresh agents met: a lone word at the end of a wrapped command (Console), no form field (Raw), no room tone
// (Ma, Title), pictures whose plates differ (Studio), and a grid line through a drawing's label (Schematic).
import { describe, expect, test } from "bun:test";
import { SYSTEMS } from "../../systems";
import { makeCtx } from "../context";
import type { Ctx, Node } from "../types";
import { BLOCKS } from ".";
import { wrapCode } from "./codeBlock";
import { plateDistance, PLATE_DE } from "./photo";
import { ROOM_TONE_LU } from "./sound";
import { SOUNDS } from "../../media.gen";
import { mixTarget } from "../../direction";

const ctxOf = (id: string): Ctx => {
  const s = SYSTEMS.find((x) => x.id === id)!;
  return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5);
};

describe("terminal: a wrapped command never ends on one word alone where another break fits", () => {
  const m = (t: string) => t.length * 30;
  test("the break goes before the last two words, not before the last one", () => {
    const r = wrapCode(m, "nelra -4 sovra", 300, "x", "  ", { widow: true });
    expect(r.rows.at(-1)!.includes(" ")).toBe(true);
    expect(r.widow).toBeUndefined();
  });
  test("where no other break fits, it says which word is alone", () => {
    expect(wrapCode(m, "nelra sovra", 260, "x", "  ", { widow: true }).widow).toBe("sovra");
  });
});

describe("field: a form field for Raw", () => {
  const ctx = ctxOf("raw");
  test("a ruled box with its name, the value typed one key at a time, and its box named", () => {
    const n = BLOCKS.field({ id: "f", x: 150, y: 700, w: 600, label: "Your file", value: "notes.txt", role: "headline", at: 0 }, ctx);
    expect(n.some((x) => x.id === "f-edge" && x.kind === "rect")).toBe(true);
    expect(n.filter((x) => x.id.startsWith("f-value-c")).length).toBe("notes.txt".length);
    expect(n.some((x) => x.id === "f-box" && x.kind === "anchor")).toBe(true);
  });
  test("a value wider than the box throws", () => {
    expect(() => BLOCKS.field({ id: "f", x: 150, y: 700, w: 120, label: "Name", value: "a value far too long", at: 0 }, ctx)).toThrow(/wider than the box/);
  });
});

describe("music: a room tone under the bed", () => {
  const ctx = ctxOf("ma");
  const bed = Object.keys(SOUNDS).find((k) => SOUNDS[k]!.kind === "music" && k.startsWith("ma-"))!;
  const tone = Object.keys(SOUNDS).find((k) => SOUNDS[k]!.kind === "music" && SOUNDS[k]!.duration > 20 && k !== bed)!;
  test.skipIf(!bed || !tone)("plays from the bed's start to its end at ROOM_TONE_LU under the target", () => {
    const n = BLOCKS.music({ media: bed, clipStart: 0, until: 12, roomTone: tone }, ctx) as (Node & { kind: "audio"; volume: number; until: number })[];
    const room = n.filter((x) => /-room\d+$/.test(x.id));
    expect(room.length).toBeGreaterThan(0);
    expect(room.at(-1)!.until).toBeCloseTo(12, 6);
    const lufs = SOUNDS[tone]!.lufs! + 20 * Math.log10(room[0]!.volume);
    expect(Math.abs(lufs - (mixTarget("ma").lufs - ROOM_TONE_LU))).toBeLessThan(0.1);
  });
});

describe("photo: the plates of one film", () => {
  test("a blue plate beside a warm one is past the limit; two warm plates are not", () => {
    expect(plateDistance([236, 232, 224], [214, 226, 240])).toBeGreaterThan(PLATE_DE);
    expect(plateDistance([236, 232, 224], [234, 231, 222])).toBeLessThan(PLATE_DE);
  });
});

describe("a drawing's labels knock out the grid", () => {
  test("Schematic: a callout's label sits on a patch of the ground over the grid; on a plate, of the plate", () => {
    const ctx = ctxOf("schematic");
    const sheet = BLOCKS.sheet({ id: "s", grid: "lines", plate: true, at: 0 }, ctx);
    const n = BLOCKS.callout({ id: "c", label: "100 N", target: { x: 540, y: 1200 }, x: 400, y: 1100, at: 0 }, ctx);
    const k = n.find((x) => x.id === "c-knock")!;
    expect(k).toMatchObject({ kind: "rect", layer: -1, fill: "surface" });
    expect(sheet.length).toBeGreaterThan(0);
  });
  test("a system that draws on no sheet gets no knock-out", () => {
    const n = BLOCKS.callout({ id: "c", label: "100 N", target: { x: 540, y: 1200 }, x: 400, y: 1100, at: 0 }, ctxOf("pop"));
    expect(n.some((x) => x.id === "c-knock")).toBe(false);
  });
});
