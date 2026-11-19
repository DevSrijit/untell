// Each system's own blocks keep that system's own stated limits. A limit
// that a system's signature or block map breaks by design was a doc that an agent could not obey.
// - Accent (Never list): the blocks of a system's block map that use the accent, built together in one frame, stay
//   within System.accentElements (default one). Manual's code and its run are two, and its data says so.
// - Density: prose words in a frame of a title and a code block stay within the limit; code does not count.
// - Effects: `typing` with its defaults keeps a system's effects limit (effectsPerTen).
// - Signature moves together: a camera push from a system's block map leaves the system's hook text inside the frame
//   margins (bleed roles) or the text-safe area (every other role).
import { describe, expect, test } from "bun:test";
import { DIRECTION, effectsPerTen } from "./direction";
import { MEDIA_SPEC } from "./media-spec";
import { BLOCKS } from "./scene/blocks";
import { makeCtx } from "./scene/context";
import { evaluate } from "./scene/time";
import { phoneCap, readsOnPhone } from "./scene/layout";
import type { Ctx, Node } from "./scene/types";
import { SYSTEMS } from "./systems";

const ctxOf = (id: string): Ctx => { const s = SYSTEMS.find((x) => x.id === id)!; return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * 0.5); };
const quiet = <T,>(f: () => T): T => { const w = console.warn; console.warn = () => {}; try { return f(); } finally { console.warn = w; } };
const shownAt = (ctx: Ctx, n: Node, t: number) => evaluate(ctx.system, n.tracks, t).opacity > 0.01;
const ACCENT = new Set(["accent", "accentText"]);
const usesAccent = (n: Node) => ("color" in n && ACCENT.has(n.color as string)) || ("fill" in n && ACCENT.has(n.fill as string)) || ("stroke" in n && ACCENT.has(n.stroke as string));

describe("item 7: a system's own blocks keep its accent limit", () => {
  for (const s of SYSTEMS) {
    const d = DIRECTION[s.id]!;
    const map = new Set(d.blocks.map((b) => b.block));
    if (s.accentMode === "ink" || s.roles.accent2 || !(map.has("codeBlock") || map.has("terminal"))) continue;
    test(`${s.id}: code and its run in one frame use at most ${s.accentElements?.max ?? 1} accent element(s)`, () => {
      const ctx = ctxOf(s.id), S = ctx.safe, w = S.right - S.left;
      const nodes: Node[] = [];
      if (map.has("codeBlock")) nodes.push(...quiet(() => BLOCKS.codeBlock({ id: "code", x: S.left, y: S.top, w, h: 420, lines: ["n = 1000000", "print(looks(n))"], highlight: [{ line: 2, at: 0.5 }], at: 0 }, ctx)));
      if (map.has("terminal")) nodes.push(...quiet(() => BLOCKS.terminal({ id: "term", x: S.left, y: S.top + 460, w, h: 360, session: [{ command: "python3 s.py", output: [{ text: "looks: 20", result: true }] }], at: 0 }, ctx)));
      const t = 6;
      // One element per block: a block's accent parts (a lit band, its gutter bar, teal literals) are one element.
      const elements = new Set(nodes.filter((n) => usesAccent(n) && shownAt(ctx, n, t)).map((n) => n.id.split("-")[0]));
      expect(elements.size).toBeLessThanOrEqual(s.accentElements?.max ?? 1);
    });
  }
});

describe("item 6: code is not prose", () => {
  for (const s of SYSTEMS) {
    test(`${s.id}: a headline over twelve lines of code stays within ${s.density.maxWords} words of prose`, () => {
      const ctx = ctxOf(s.id), S = ctx.safe, w = S.right - S.left;
      const code = Array.from({ length: 12 }, (_, i) => `    total = total + values[${i}]  # add the next one`);
      const nodes = quiet(() => [
        ...BLOCKS.title({ id: "head", x: S.left, y: S.top, w, h: 300, text: "Add the list.", role: "headline", at: 0 }, ctx),
        ...BLOCKS.codeBlock({ id: "code", x: S.left, y: S.top + 320, w, h: 900, lines: code, at: 0 }, ctx),
      ]);
      const prose = nodes.filter((n) => n.kind === "text" && n.content !== "code" && n.content !== "data" && shownAt(ctx, n, 3));
      const words = prose.reduce((k, n) => k + (n as { text: string }).text.split(/\s+/).filter(Boolean).length, 0);
      expect(words).toBeLessThanOrEqual(s.density.maxWords);
      expect(nodes.some((n) => n.kind === "text" && n.content === "code")).toBe(true);
    });
  }
});

describe("item 16: typing keeps every system's effects limit by default", () => {
  for (const s of SYSTEMS) {
    const ticks = MEDIA_SPEC[s.id]?.hits.allowed.some((h) => h === "tick" || h === "click");
    if (!ticks) continue;
    test(`${s.id}: a 40-key command gives at most ${effectsPerTen(s.id)} ticks in 10 s`, () => {
      const ctx = ctxOf(s.id), S = ctx.safe;
      const term = quiet(() => BLOCKS.terminal({ id: "t", x: S.left, y: S.top, w: S.right - S.left, h: 300, session: [{ command: "python3 search.py 1000000 --target 999999" }], at: 0.5 }, ctx));
      const out = quiet(() => BLOCKS.typing({ id: "k", media: "manual-tick", nodes: term, of: "t-r0-cmd" }, ctx));
      expect(out.length).toBeLessThanOrEqual(effectsPerTen(s.id));
    });
  }
});

describe("item 26: a system's camera push keeps its own type in the frame", () => {
  for (const s of SYSTEMS) {
    const d = DIRECTION[s.id]!;
    const cam = d.blocks.find((b) => b.block === "camera");
    const push = /pushes? of (\d+)(?:-(\d+))? %/.exec(cam?.props.moves ?? "");
    if (!push) continue;
    test(`${s.id}: the hook's words at full width, under a ${push[2] ?? push[1]} % push, stay where they may`, () => {
      const ctx = ctxOf(s.id), S = ctx.safe;
      const zoom = 1 + Number(push[2] ?? push[1]) / 100;
      const kinetic = d.blocks.some((b) => b.block === "kineticWords");
      const pinned = /pinned/.test(cam!.props.moves ?? "");
      const words = quiet(() => kinetic
        ? BLOCKS.kineticWords({ id: "kw", x: S.left, y: S.top, w: S.right - S.left, h: (S.bottom - S.top) * 0.5, phrases: [{ text: "SWIMMING", at: 0 }], pinned }, ctx)
        : BLOCKS.title({ id: "t", x: S.left, y: S.top, w: S.right - S.left, text: "Two lengths.", at: 0 }, ctx));
      const role = (words.find((n) => n.kind === "text") as { role: string }).role;
      const bleeds = !!s.bleed?.includes(role as never);
      for (const n of words) {
        if (n.kind !== "text") continue;
        // The node at rest, with its own scale about its origin.
        const v = evaluate(ctx.system, n.tracks, 10), sc = v.scale * v.scaleX, ox = n.origin?.[0] ?? 0.5;
        const w0 = n.width ?? ctx.measure(n.text, n.role);
        const nx0 = n.x + v.x + ox * w0 * (1 - sc), nx1 = nx0 + w0 * sc;
        // A node in the world scales about the frame centre with the push; a pinned node does not.
        const k = n.pinned ? 1 : zoom;
        const x0 = ctx.width / 2 + (nx0 - ctx.width / 2) * k, x1 = ctx.width / 2 + (nx1 - ctx.width / 2) * k;
        // A bleed role runs to the system's margin on purpose, and no further.
        const m = Math.round(s.margin * Math.min(ctx.width, ctx.height));
        if (bleeds) { expect(x0).toBeGreaterThanOrEqual(m - 1); expect(x1).toBeLessThanOrEqual(ctx.width - m + 1); }
        else { expect(x0).toBeGreaterThanOrEqual(S.left - 1); expect(x1).toBeLessThanOrEqual(S.right + 1); }
      }
    });
  }
});

describe("item 36: a system's defaults make its best film", () => {
  const LINE_BLOCKS = new Set(["text", "title", "typeOn", "fitText", "kineticWords", "quote", "wordSeries"]);
  for (const s of SYSTEMS) {
    test(`${s.id}: the line of the hook and of each beat is in a role that reads on a phone`, () => {
      const d = DIRECTION[s.id]!;
      // The floor: letters of the line of a beat at least lineNeed high on a 390 px wide phone (main-line, scale.py).
      const reads = (r: keyof typeof s.type) => readsOnPhone(s, r);
      if (d.hook.role) expect(reads(d.hook.role), `${s.id} hook role ${d.hook.role}: cap ${phoneCap(s, d.hook.role).toFixed(1)} px on a phone`).toBe(true);
      for (const b of d.blocks.filter((x) => LINE_BLOCKS.has(x.block))) {
        // The first role the block map names is the one an agent takes for the line.
        const first = /"(display|headline|body|caption|label)"/.exec(b.props.role ?? b.props.size ?? "")?.[1] as keyof typeof s.type | undefined;
        if (first) expect(reads(first), `${s.id} ${b.block} role ${first}: cap ${phoneCap(s, first).toFixed(1)} px on a phone`).toBe(true);
        // A title held to one line steps a sentence down to small type.
        expect(b.props.maxLines ?? "", `${s.id} ${b.block} maxLines`).not.toBe("1");
      }
    });
  }
  for (const id of ["matte", "studio", "keynote"]) test(`product in ${id}: a default shot at 9:16 covers the hook's share of the frame, under the top third`, () => {
    const ctx = ctxOf(id);
    const { standing } = require("./three/models");
    const nodes = BLOCKS.product({ id: "p", objects: [standing("lamp", "model-lantern", { height: 2.6 })], at: 0 }, ctx);
    const obj = nodes.find((n) => n.id === "p-object") as { x: number; y: number; h: number; w: number };
    // The hook's share of the frame by the object's silhouette (p-framing), or as near as the frame's room allows: the
    // lantern is tall, so the room's height binds first and the object fills it (the default room at 9:16: under the
    // top 30 %, centred at 0.58 of the height, so 0.56 of the height).
    const framing = nodes.find((n) => n.id === "p-framing") as unknown as { data: { share: number } };
    const ext = nodes.find((n) => n.id === "p-object-extent") as unknown as { h: number };
    expect(framing.data.share >= DIRECTION[id]!.hook.area! * 0.97 || ext.h >= ctx.height * 0.56 * 0.97).toBe(true);
    expect(obj.y).toBeGreaterThan(ctx.height * 0.28);
    expect(obj.y + obj.h).toBeLessThanOrEqual(ctx.height);
    expect(obj.x).toBeGreaterThanOrEqual(0);
  });
});

describe("lineOverPicture on a figure that fills the text-safe area", () => {
  // The bridge figure (Noir) and the athlete (Courtside) cover the 9:16 text-safe area: no calm band, no calm column.
  // The helper says so (dim: true, and a warning) instead of returning a place across the figure as calm.
  const { lineOverPicture } = require("./scene/blocks");
  for (const [id, media] of [["noir", "noir-bridge"], ["courtside", "athlete-back"]] as const) test(`${media}: no calm place, so dim and a warning`, () => {
    const ctx = ctxOf(id);
    const img = quiet(() => BLOCKS.photo({ id: "hero", media, box: { x: 0, y: 0, w: ctx.width, h: ctx.height }, at: 0 }, ctx)).find((n) => n.kind === "image")!;
    const warns: string[] = [];
    const w = console.warn; console.warn = (m: string) => warns.push(String(m));
    let r: { dim: boolean; clear: number };
    try { r = lineOverPicture(ctx, img, ctx.lineHeight("headline") * 2, { prefer: "top" }); } finally { console.warn = w; }
    expect(r!.dim).toBe(true);
    expect(r!.clear).toBeLessThan(0.98);
    expect(warns.some((m) => m.includes("leaves no calm part"))).toBe(true);
  });
  test("riso-brayer-hands: a calm band at the top (the hands sit low)", () => {
    const ctx = ctxOf("riso");
    const img = quiet(() => BLOCKS.photo({ id: "hero", media: "riso-brayer-hands", box: { x: 0, y: 0, w: ctx.width, h: ctx.height }, at: 0 }, ctx)).find((n) => n.kind === "image")!;
    const r = lineOverPicture(ctx, img, ctx.lineHeight("display") * 3, { prefer: "top" });
    expect(r.dim).toBe(false);
    expect(r.clear).toBeGreaterThan(0.98);
  });
});

describe("a designer's read of each system's default frame (examples/scenes/defaults.ts)", () => {
  // What a designer checks on the default film of each system, from its own SYSTEM.md (Direction): the plate of a
  // picture system covers the frame; the line of the beat is at or above the reading floor and in the role the hook
  // names; no letter of the line lies on the subject (its mask, a product's drawn bounds over the shot, a shape's box);
  // the subject covers the hook's share of the frame.
  const { scene } = require("../../examples/scenes/defaults");
  const { MEDIA } = require("./media.gen");
  const { hiddenBy } = require("./scene/cover");
  const { lineNeed } = require("./scene/layout");
  type Box = { x: number; y: number; w: number; h: number };
  const meet = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  // The subject of the shape and panel systems: the node ids that draw it.
  const SHAPE: Record<string, string> = { primary: "hero", pop: "hero", mark: "module", schematic: "gear", graphite: "app", manual: "code", spec: "look" };
  // Where the words are the subject or sit inside it by design: Cutout's word is the slab's; Raw's line is the page's.
  const INSIDE = new Set(["cutout", "raw"]);
  const T = [0, 1, 2, 3];
  // Letters about as wide as the systems' faces set them: 0.6 em in a mono face, 0.46 em in the others.
  const ctxFor = (id: string): Ctx => {
    const s = SYSTEMS.find((x) => x.id === id)!;
    return makeCtx(s, 1080, 1920, (t, r) => t.length * s.type[r].size * 1080 * (/mono/i.test(s.fonts[s.type[r].font] ?? "") ? 0.6 : 0.46));
  };
  for (const s of SYSTEMS) test(`${s.id}: plate, line and subject`, () => {
    const ctx = ctxFor(s.id), d = DIRECTION[s.id]!, W = ctx.width, H = ctx.height;
    const nodes: Node[] = quiet(() => scene(ctx, BLOCKS));
    const at = 3;
    // The line: the prose of the beat (text nodes of the line, the quote, the words, the stat, the session).
    const line = nodes.filter((n): n is Extract<Node, { kind: "text" }> => n.kind === "text" && /^(line|words|q|stat|term)/.test(n.id ?? "") && n.role !== "label");
    expect(line.length, "the frame has a line").toBeGreaterThan(0);
    const boxOf = (n: Extract<Node, { kind: "text" }>, t = at): Box => {
      const v = evaluate(ctx.system, n.tracks, t), k = v.scale ?? 1;
      return { x: n.x + v.x, y: n.y + v.y, w: ctx.measure(n.text, n.role) * k, h: ctx.size(n.role) * k };
    };
    // 1. The floor and the role: the largest line on screen is in the hook's role, and its letters read on a phone.
    const main = line.reduce((a, b) => (boxOf(b).h > boxOf(a).h ? b : a));
    const k = evaluate(ctx.system, main.tracks, at).scale ?? 1;
    expect(phoneCap(s, main.role) * k, `${s.id} main line cap on a phone`).toBeGreaterThanOrEqual(lineNeed(s) - 0.05);
    if (d.hook.role) expect(main.role, `${s.id}: the line is in the role the hook names`).toBe(d.hook.role);
    // 2. A picture system's plate covers the frame, or the frame under the line's band (lineInBand: the poster form
    // for a figure that fills the frame): full bleed at the sides and the foot, its top no lower than the band's foot.
    const img = nodes.find((n): n is Extract<Node, { kind: "image" }> => n.kind === "image");
    if (["picture", "behind"].includes(d.compose?.kind ?? "") && img) {
      const lineFoot = Math.max(...line.map((n) => n.y + ctx.lineHeight(n.role)));
      const top = img.y <= 0 || img.y <= lineFoot + 1.6 * ctx.lineHeight(line[0]!.role);
      expect(img.x <= 0 && top && img.x + img.w >= W && img.y + img.h >= H, `${s.id}: the plate covers the frame (or the frame under the line's band)`).toBe(true);
      // The band holds only the line: the picture still takes most of the frame.
      expect(img.h / H, `${s.id}: the picture's share of the frame's height`).toBeGreaterThanOrEqual(0.55);
    }
    // 3. No letter on the subject.
    const info = img ? MEDIA[img.src.split("/")[0]!] : undefined;
    for (const n of line) for (const t of T) {
      if (!shownAt(ctx, n, t)) continue;
      const b = boxOf(n, t), r: [number, number, number, number] = [b.x, b.y, b.x + b.w, b.y + b.h];
      if (img && info?.mask) {
        // Behind a cut-out the subject may cover a letter up to the cover limit (placeBehind's letterMax).
        const limit = nodes.some((m) => m.kind === "image" && m.cutout) ? 0.22 : 0.02;
        expect(hiddenBy(ctx, img, info, r, t), `${s.id} "${n.text}" on the subject at ${t} s`).toBeLessThanOrEqual(limit);
      } else if (img && info) {
        const [sx0, sy0, sx1, sy1] = info.subject;
        if ((sx1 - sx0) * (sy1 - sy0) < 0.9) {
          const sc = Math.max(img.w / info.width, img.h / info.height), dw = info.width * sc, dh = info.height * sc;
          const [fx, fy] = img.focus ?? [0.5, 0.5];
          const ox = img.x + (img.w - dw) * fx, oy = img.y + (img.h - dh) * fy;
          const sb = { x: ox + sx0 * dw, y: oy + sy0 * dh, w: (sx1 - sx0) * dw, h: (sy1 - sy0) * dh };
          expect(meet(b, sb) / (b.w * b.h), `${s.id} "${n.text}" on the subject box at ${t} s`).toBeLessThan(0.02);
        }
      }
    }
    const ext = nodes.find((n) => n.id === "hero-object-extent") as Box | undefined;
    if (ext) for (const n of line) expect(meet(boxOf(n), ext), `${s.id} "${n.text}" on the product's drawn bounds`).toBe(0);
    const shape = SHAPE[s.id];
    let subject: Box | undefined;
    if (shape) {
      const parts = nodes.filter((n) => (n.id ?? "").startsWith(shape) && n.kind !== "anchor" && !(n.kind === "text"));
      const bs = parts.map((n) => (n.kind === "circle" ? { x: n.cx - n.r, y: n.cy - n.r, w: 2 * n.r, h: 2 * n.r } : n.kind === "path" && n.box ? n.box : "w" in n ? (n as unknown as Box) : undefined)).filter((b): b is Box => !!b && b.w > 0);
      expect(bs.length, `${s.id} draws its subject`).toBeGreaterThan(0);
      const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
      subject = { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 };
      // A turned line (title `angle`) along a circle's edge: its turned box must stay outside the circle itself, not
      // outside the circle's bounding square (Primary's 45-degree question).
      // The disc: a circle node, or the shape block's circle (a path whose box is a square).
      const p0 = parts.length === 1 ? parts[0]! : undefined;
      const disc = p0?.kind === "circle" ? { cx: p0.cx, cy: p0.cy, r: p0.r }
        : p0?.kind === "path" && p0.box && Math.abs(p0.box.w - p0.box.h) < 1 && /circle|a\s?[\d.]+[ ,][\d.]+/i.test(String((p0 as { d?: string }).d ?? "")) ? { cx: p0.box.x + p0.box.w / 2, cy: p0.box.y + p0.box.h / 2, r: p0.box.w / 2 } : undefined;
      const turnedClear = (n: Extract<Node, { kind: "text" }>) => {
        const deg = evaluate(ctx.system, n.tracks, at).rotate ?? 0, a = (deg * Math.PI) / 180;
        const w = ctx.measure(n.text, n.role), h = ctx.lineHeight(n.role), ox = n.x, oy = n.y + h / 2;
        for (let u = 0; u <= 1; u += 0.05) for (const v of [0, 1]) {
          const px = n.x + u * w - ox, py = n.y + v * h - oy;
          const X = ox + px * Math.cos(a) - py * Math.sin(a), Y = oy + px * Math.sin(a) + py * Math.cos(a);
          if (Math.hypot(X - disc!.cx, Y - disc!.cy) < disc!.r) return false;
        }
        return true;
      };
      if (!INSIDE.has(s.id)) for (const n of line) if (!n.id?.startsWith(shape)) {
        if (disc && (evaluate(ctx.system, n.tracks, at).rotate ?? 0) !== 0) expect(turnedClear(n), `${s.id} "${n.text}" on the subject`).toBe(true);
        else expect(meet(boxOf(n), subject), `${s.id} "${n.text}" on the subject`).toBe(0);
      }
    }
    // 4. The subject covers the hook's share of the frame: the picture by what it draws, the product by its drawn
    // bounds at rest, a shape by its box.
    if (d.hook.area) {
      const rest = nodes.find((n) => n.id === "hero-object") as Box | undefined;
      const area = img ? meet(img, { x: 0, y: 0, w: W, h: H }) : rest ? rest.w * rest.h : subject ? subject.w * subject.h : 0;
      expect(area / (W * H), `${s.id}: the subject's share of the frame`).toBeGreaterThanOrEqual(d.hook.area);
    }
  });
});
