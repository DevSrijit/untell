// The HyperFrames renderer. Bundled to dist/vs-hyperframes.js as the global `VS`.
// A film builds its scene after the fonts load, then registers its timeline:
//
//   const tl = gsap.timeline({ paused: true });
//   await VS.mount(document.getElementById("root"), { system: "spec", fonts: "assets/fonts" }, (ctx, B) => [
//     ...B.lineChart({ ... }, ctx),
//   ], tl);
//   window.__timelines["main"] = tl;
//
// Every track becomes ordinary GSAP tweens on the timeline, with the system's curves as CustomEases,
// so `hyperframes check` reads the motion and `hyperframes render` seeks it like any other film.
// The page needs the fonts in assets/fonts and, for a system with grain, the tiles in assets/grain;
// scripts/hf_project.ts copies both. The draw order matches the Remotion renderer (remotion.tsx), and both apply
// the system's motion (frame step, opaque) to every track first (time.withSystemMotion).
import { fallbackFonts, SYSTEMS, type System } from "../systems";
import { ITALIC } from "../italics.gen";
import { BLOCKS } from "./blocks";
import { checkReplaces } from "./blocks/handover";
import { createScene3D } from "../three/render";
import { FPS, makeCtx, shownFrames } from "./context";
import { assetUrl, BLUR_ID, cameraOf, clipCss, colorOf, GRAIN_STYLE, GRAIN_TILES, grainOf, hasTilt, holdsOf, LIGHT_BLEND, lightMask, maskBox, maskPad, maskTravel, originOf,
  outlineFilter, perspectiveOf, runs, scanlinesOf, scanlineStyle, sweepBox, textAttrs, textStyle, type Families, blurRegion } from "./layout";
import { makeMeasure } from "./measure";
import { DEFAULTS, endOf, evaluate, withSystemMotion } from "./time";
import type { Ctx, ImageNode, Key, Node, Prop, TextNode, Tracks } from "./types";

type Gsap = {
  set: (t: unknown, v: Record<string, unknown>) => void;
  registerPlugin: (...p: unknown[]) => void;
};
type Timeline = { fromTo: (t: unknown, a: Record<string, unknown>, b: Record<string, unknown>, at: number) => void; to: (t: unknown, v: Record<string, unknown>, at: number) => void };
declare const gsap: Gsap;
declare const CustomEase: { create: (id: string, d: string) => unknown };

const SVGNS = "http://www.w3.org/2000/svg";
const slug = (f: string) => f.toLowerCase().replace(/ /g, "-");

function familiesFor(s: System) {
  const out: { family: string; weights: number[] }[] = [];
  for (const slot of ["display", "text", "mono"] as const) {
    const family = s.fonts[slot];
    if (!family) continue;
    const weights = [...new Set(Object.values(s.type).filter((t) => t.font === slot).map((t) => t.weight))];
    const have = out.find((f) => f.family === family);
    if (have) have.weights = [...new Set([...have.weights, ...weights])];
    else out.push({ family, weights });
  }
  // The symbol fallback fonts load in one weight (400), as in the Remotion adapter.
  for (const family of fallbackFonts(s)) if (!out.some((f) => f.family === family)) out.push({ family, weights: [400] });
  return out;
}

/** Declares the system's fonts from local Fontsource files and waits until they are usable. A weight with a true italic
 *  (italics.gen.ts) declares its italic face too, as the Remotion loaders do. */
async function loadFonts(s: System, base: string) {
  const italics = (family: string, weights: number[]) => weights.filter((w) => ITALIC[family]?.includes(w));
  const css = familiesFor(s).flatMap(({ family, weights }) => [
    ...weights.map((w) => `@font-face{font-family:"${family}";font-weight:${w};font-style:normal;src:url("${base}/${slug(family)}-latin-${w}-normal.woff2") format("woff2");}`),
    ...italics(family, weights).map((w) => `@font-face{font-family:"${family}";font-weight:${w};font-style:italic;src:url("${base}/${slug(family)}-latin-${w}-italic.woff2") format("woff2");}`),
  ]).join("\n");
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  await Promise.all(familiesFor(s).flatMap(({ family, weights }) => [...weights.map((w) => document.fonts.load(`${w} 32px "${family}"`)),
    ...italics(family, weights).map((w) => document.fonts.load(`italic ${w} 32px "${family}"`))]));
  for (const { family, weights } of familiesFor(s)) for (const w of weights) {
    if (!document.fonts.check(`${w} 32px "${family}"`)) throw new Error(`Font ${family} ${w} did not load from ${base}`);
  }
  // An italic face proves its load by its own FontFace (fonts.check passes on the upright face alone).
  const faces = [...document.fonts];
  for (const { family, weights } of familiesFor(s)) for (const w of italics(family, weights)) {
    if (!faces.some((f) => f.family.replace(/"/g, "") === family && f.style === "italic" && f.weight === String(w) && f.status === "loaded"))
      throw new Error(`Font ${family} ${w} italic did not load from ${base}`);
  }
}

function makeEases(s: System) {
  const c = (name: string, b: readonly number[]) => CustomEase.create(`${s.id}-${name}`, `M0,0 C${b.join(",")} 1,1`);
  return { enter: c("enter", s.motion.enter), move: c("move", s.motion.move), exit: c("exit", s.motion.exit), linear: "none",
    // A step holds until its segment ends, as in time.ts. GSAP's steps(1) jumps at the middle, so use a function.
    step: (p: number) => (p >= 1 ? 1 : 0) } as Record<string, unknown>;
}

/** Loads and decodes the grain tiles, so the first frame already has its grain. */
async function loadGrain(base: string) {
  const urls = Array.from({ length: GRAIN_TILES }, (_, k) => `${base}/grain-${k}.png`);
  await Promise.all(urls.map((u) => { const img = new Image(); img.src = u; return img.decode(); }));
  return urls;
}

export async function mount(root: HTMLElement, opts: { system: string; fonts?: string; grain?: string }, build: (ctx: Ctx, blocks: typeof BLOCKS) => Node[], tl: Timeline) {
  const s = SYSTEMS.find((x) => x.id === opts.system);
  if (!s) throw new Error(`Unknown system "${opts.system}"`);
  const width = Number(root.getAttribute("data-width")), height = Number(root.getAttribute("data-height"));
  const short = Math.min(width, height);
  root.setAttribute("data-system", s.id);
  Object.assign(root.style, { position: "relative", width: `${width}px`, height: `${height}px`, overflow: "hidden", background: colorOf(s, "ground") });
  await loadFonts(s, opts.fonts ?? "assets/fonts");
  const families: Families = { display: "", text: "", mono: "" };
  for (const slot of ["display", "text", "mono"] as const) if (s.fonts[slot]) families[slot] = `"${s.fonts[slot]}"`;
  families.fallback = fallbackFonts(s).map((f) => `"${f}"`).join(", ");
  const grain = grainOf(s);
  const tiles = grain > 0 ? await loadGrain(opts.grain ?? "assets/grain") : [];
  const ctx = makeCtx(s, width, height, makeMeasure(s, families, short));
  // The system's motion on every track, at the 30 fps the grain and the recorder use (as in Remotion).
  const built = build(ctx, BLOCKS);
  checkReplaces(ctx); // a replaces whose block the scene never built
  const nodes = withSystemMotion(s, built, 30);
  const persp = perspectiveOf(width, height);
  const eases = makeEases(s);
  const targets = new Map<string, { el: Element; draw?: Element; reveal?: Element; travel?: number; svg: boolean }>();
  const attr = (el: Element, a: Record<string, string | number | undefined>) => { for (const [k, v] of Object.entries(a)) if (v !== undefined) el.setAttribute(k, String(v)); };

  // One SVG per run of lines and circles, in the same draw order as the Remotion renderer (layout.runs).
  const newSvg = (i: number) => {
    const svg = document.createElementNS(SVGNS, "svg");
    attr(svg, { viewBox: `0 0 ${width} ${height}`, width, height, "data-el": i === 0 ? "scene-shapes" : `scene-shapes-${i}` });
    Object.assign((svg as SVGElement).style, { position: "absolute", inset: "0", overflow: "visible", pointerEvents: "none" });
    root.appendChild(svg);
    const defs = document.createElementNS(SVGNS, "defs");
    svg.appendChild(defs);
    return { svg, defs };
  };
  const addShape = (n: Node, svg: Element, defs: Element) => {
    if (n.kind === "circle") {
      const el = document.createElementNS(SVGNS, "circle");
      attr(el, { "data-el": n.id, cx: n.cx, cy: n.cy, r: n.r, fill: n.fill ? colorOf(s, n.fill) : "none", stroke: n.stroke ? colorOf(s, n.stroke) : undefined, "stroke-width": n.width });
      svg.appendChild(el);
      targets.set(n.id, { el, svg: true });
      return;
    }
    if (n.kind !== "path") return;
    const drawn = n.tracks?.draw !== undefined;
    const p = document.createElementNS(SVGNS, "path");
    attr(p, { d: n.d, stroke: n.stroke ? colorOf(s, n.stroke) : undefined, "stroke-width": n.width, fill: n.fill ? colorOf(s, n.fill) : "none",
      "stroke-linecap": n.cap, "stroke-linejoin": n.join, "fill-rule": n.fillRule });
    if (drawn && n.dash) {
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("data-el", n.id);
      const mask = document.createElementNS(SVGNS, "mask");
      // The mask reaches well past the frame: after a camera pan a drawn line can sit outside 0..width.
      attr(mask, { id: `m-${n.id}`, maskUnits: "userSpaceOnUse", x: -width, y: -height, width: width * 3, height: height * 4 });
      const mp = document.createElementNS(SVGNS, "path");
      attr(mp, { d: n.d, pathLength: 1, stroke: "#fff", "stroke-width": (n.width ?? 1) + 4, fill: "none", "stroke-dasharray": "1 1", "stroke-dashoffset": 1, "stroke-linecap": "butt" });
      mask.appendChild(mp);
      defs.appendChild(mask);
      attr(p, { "stroke-dasharray": n.dash.join(" "), mask: `url(#m-${n.id})` });
      g.appendChild(p);
      svg.appendChild(g);
      targets.set(n.id, { el: g, draw: mp, svg: true });
    } else {
      p.setAttribute("data-el", n.id);
      if (n.dash) p.setAttribute("stroke-dasharray", n.dash.join(" "));
      if (drawn) attr(p, { pathLength: 1, "stroke-dasharray": "1 1", "stroke-dashoffset": 1 });
      svg.appendChild(p);
      targets.set(n.id, { el: p, draw: drawn ? p : undefined, svg: true });
    }
  };
  const addRect = (n: Node) => {
    if (n.kind !== "rect") return;
    const el = document.createElement("div");
    el.setAttribute("data-el", n.id);
    // The UI state (Base.state), as in Remotion.
    if (n.state) el.setAttribute("data-state", n.state);
    Object.assign(el.style, { position: "absolute", left: `${n.x}px`, top: `${n.y}px`, width: `${n.w}px`, height: `${n.h}px`, background: colorOf(s, n.fill),
      borderRadius: n.radius ? `${n.radius}px` : "", boxShadow: n.stroke ? `inset 0 0 0 ${n.strokeWidth ?? 1}px ${colorOf(s, n.stroke)}` : "",
      mixBlendMode: n.blend ?? "" });
    root.appendChild(el);
    targets.set(n.id, { el, svg: false });
  };
  const addText = (n: TextNode) => {
    const el = document.createElement("div");
    el.setAttribute("data-el", n.id);
    el.setAttribute("data-role", n.role);
    if (n.state) el.setAttribute("data-state", n.state);
    // What the text is, for the density check: code and data are not prose (TextNode.content).
    if (n.content) el.setAttribute("data-content", n.content);
    // A masked line: the clip box sits round the text's own box, padded to the font's ink (layout.maskPad), so the
    // text and its origin stay where the block put them and the mask never cuts a glyph at rest.
    const pad = maskPad(s, n.role, short, { weight: n.weight, text: n.text, italic: n.italic });
    Object.assign(el.style, { position: "absolute", left: `${n.x}px`, top: `${n.y}px`, color: colorOf(s, n.color),
      ...(n.width ? { width: `${n.width}px`, textAlign: n.align ?? "left" } : {}),
      ...(n.blend ? { mixBlendMode: n.blend } : {}) });
    const span = document.createElement("span");
    Object.assign(span.style, textStyle(s, families, n.role, short, n.keepCase, n.weight, n.italic), n.mask ? { display: "block" } : {});
    // The check reads the span's own attributes, so they go on the box and on the span.
    attr(el, textAttrs(s, n));
    attr(span, textAttrs(s, n));
    span.textContent = n.text;
    if (n.mask) {
      const box = document.createElement("div");
      Object.assign(box.style, maskBox(pad));
      box.appendChild(span);
      el.appendChild(box);
    } else el.appendChild(span);
    root.appendChild(el);
    targets.set(n.id, { el, reveal: n.mask ? span : undefined, travel: maskTravel(s, n.role, short, { weight: n.weight, text: n.text, italic: n.italic }), svg: false });
  };
  // Holds: empty full-frame elements behind everything, outside the camera (see HoldNode).
  for (const n of holdsOf(nodes)) {
    const el = document.createElement("div");
    attr(el, { "data-el": n.id, "data-hold": "", "data-layout-ignore": "" });
    Object.assign(el.style, { position: "absolute", left: "0", top: "0", width: `${width}px`, height: `${height}px`, pointerEvents: "none" });
    root.appendChild(el);
    targets.set(n.id, { el, svg: false });
  }
  // The camera: everything goes into one world layer that the camera tracks move (see CameraNode).
  const cam = cameraOf(nodes);
  const world = document.createElement("div");
  world.setAttribute("data-el", cam ? "world" : "scene");
  Object.assign(world.style, { position: "absolute", inset: "0" });
  root.appendChild(world);
  const host = root;
  root = world;
  if (cam) targets.set(cam.id, { el: world, svg: false });
  // A 3D scene: a canvas in its box, drawn from the time alone on every hf-seek (HyperFrames' protocol
  // for canvas and WebGL). Its opacity track, if any, becomes tweens like any node's.
  // A scene with models loads them first: mount waits for every scene's `ready` before it returns, so
  // the film registers its timeline only then, and each seek hands the wait back through waitUntil.
  const ready3D: Promise<void>[] = [];
  const add3D = (n: Extract<Node, { kind: "scene3d" }>) => {
    const { x, y, w, h } = n.spec.box;
    const wrap = document.createElement("div");
    wrap.setAttribute("data-el", n.id);
    // A shot that runs past the frame on purpose (product `frame: "detail"`, `bleed`) says so to the overflow check.
    if (n.bleed) wrap.setAttribute("data-layout-allow-overflow", "");
    Object.assign(wrap.style, { position: "absolute", inset: "0" });
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    // pointer-events none: the canvas is transparent where the object is not, and a hit test (HyperFrames'
    // text_occluded, the recorder's cover probe) must see the text above or below it, not the canvas.
    Object.assign(canvas.style, { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, pointerEvents: "none" });
    wrap.appendChild(canvas);
    root.appendChild(wrap);
    const r3 = createScene3D(canvas, n.spec, s);
    let loaded = false;
    window.addEventListener("hf-seek", (e) => {
      const d = (e as CustomEvent<{ time: number; waitUntil?: (p: Promise<unknown>) => void }>).detail;
      if (loaded) r3.renderAt(d.time);
      else d.waitUntil?.(r3.ready.then(() => r3.renderAt(d.time)));
    });
    r3.renderAt(0);
    ready3D.push(r3.ready.then(() => { loaded = true; r3.renderAt(0); }));
    targets.set(n.id, { el: wrap, svg: false });
  };
  // A picture: a clipping box (cut to its clip polygon) with a mover inside. The mover carries the inner tracks and
  // holds the <img> or <video> and the light layers, so they move together (see ImageNode, Light).
  const pictures = new Map<string, HTMLElement>();
  const lightTargets = new Map<string, { layer: HTMLElement; band?: HTMLElement }>();
  const masks = new Set<string>();
  const addImage = (n: ImageNode) => {
    const el = document.createElement("div");
    el.setAttribute("data-el", n.id);
    // A cut-out covers type on purpose: HyperFrames' own check accepts it, and our cover check (data-cutout) measures it.
    if (n.cutout) { el.setAttribute("data-layout-allow-occlusion", ""); el.setAttribute("data-cutout", ""); }
    Object.assign(el.style, { position: "absolute", left: `${n.x}px`, top: `${n.y}px`, width: `${n.w}px`, height: `${n.h}px`, overflow: "hidden",
      borderRadius: n.radius ? `${n.radius}px` : "", clipPath: n.clip ? clipCss(n.clip) : "", mixBlendMode: n.blend ?? "" });
    const [fx, fy] = n.focus ?? [0.5, 0.5];
    const ol = n.outline?.length ? outlineFilter(s, n) : null;
    if (ol) {
      // The outline filter, as in the Remotion renderer: grow the alpha, colour it, draw the picture on top.
      const svg = document.createElementNS(SVGNS, "svg");
      attr(svg, { width: 0, height: 0 });
      (svg as SVGElement).style.position = "absolute";
      const f = document.createElementNS(SVGNS, "filter");
      attr(f, { id: ol.id, x: "-20%", y: "-20%", width: "140%", height: "140%", "color-interpolation-filters": "sRGB" });
      for (const g of ol.rings) {
        const m = document.createElementNS(SVGNS, "feMorphology");
        attr(m, { in: "SourceAlpha", operator: "dilate", radius: g.radius, result: `${g.key}grown` });
        const fl = document.createElementNS(SVGNS, "feFlood");
        attr(fl, { "flood-color": g.color, result: `${g.key}ink` });
        const cp = document.createElementNS(SVGNS, "feComposite");
        attr(cp, { in: `${g.key}ink`, in2: `${g.key}grown`, operator: "in", result: g.key });
        f.append(m, fl, cp);
      }
      const mg = document.createElementNS(SVGNS, "feMerge");
      for (const i of [...ol.rings.map((g) => g.key), "SourceGraphic"]) { const mn = document.createElementNS(SVGNS, "feMergeNode"); mn.setAttribute("in", i); mg.appendChild(mn); }
      f.append(mg);
      svg.appendChild(f);
      el.appendChild(svg);
    }
    const fill = { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: n.fit ?? "cover", objectPosition: `${fx * 100}% ${fy * 100}%`,
      filter: ol ? `url(#${ol.id})` : "" };
    // GSAP must not animate a <video> clip, so the inner moves always go on the mover around the picture.
    const mover = document.createElement("div");
    Object.assign(mover.style, { position: "absolute", inset: "0", isolation: "isolate" });
    // The mover grows past its clip on purpose (zoom, push, drift): the clip box hides the overflow. Say so to
    // HyperFrames' container_overflow check, which otherwise names the root composition.
    mover.setAttribute("data-layout-allow-overflow", "");
    if (n.video) {
      // Footage: a timed <video> clip that HyperFrames' runtime plays.
      // The clip may already be in the page: hf_project writes every clip into index.html, where HyperFrames'
      // renderer finds it. Reuse it, so the renderer's clip is the one on screen.
      const v = (document.getElementById(`${n.id}-clip`) as HTMLVideoElement | null) ?? document.createElement("video");
      v.id = `${n.id}-clip`;
      v.className = "clip";
      v.src = assetUrl(n.src);
      v.muted = true;
      v.setAttribute("muted", "");
      v.setAttribute("playsinline", "");
      v.setAttribute("preload", "auto");
      // The clip shows on the frame grid of the node's opacity (shownFrames), as in Remotion: from frame `on` to frame
      // `off`, not including it. The start sits a hair before frame `on`'s time, so a seek to it lands inside.
      const F = shownFrames(n.video.at, n.video.until), media = (n.video.from ?? 0) + (F.on / FPS - n.video.at) * (n.video.rate ?? 1);
      v.setAttribute("data-start", String(Math.max(0, F.on / FPS - 1e-4)));
      if (Number.isFinite(F.off)) v.setAttribute("data-duration", String(Math.max(1 / FPS, (F.off - F.on) / FPS)));
      if (media > 0) v.setAttribute("data-media-start", String(media));
      if (n.video.rate !== undefined && n.video.rate !== 1) v.setAttribute("data-playback-rate", String(n.video.rate));
      Object.assign(v.style, fill);
      mover.appendChild(v);
    } else {
      const img = document.createElement("img");
      img.src = assetUrl(n.src);
      Object.assign(img.style, fill);
      mover.appendChild(img);
    }
    for (const l of n.lights ?? []) {
      // A light layer: masked by the picture's alpha, mixed as screen; a sweep holds a turned square with the band.
      const layer = document.createElement("div");
      layer.setAttribute("data-el", l.id);
      layer.setAttribute("data-layout-ignore", "");
      Object.assign(layer.style, { position: "absolute", inset: "0", mixBlendMode: LIGHT_BLEND, ...lightMask(n, l) });
      masks.add(assetUrl(n.src));
      let band: HTMLElement | undefined;
      if (l.kind === "sweep") {
        const sw = sweepBox(n, l);
        const turn = document.createElement("div");
        Object.assign(turn.style, { position: "absolute", left: `${sw.left}px`, top: `${sw.top}px`, width: `${sw.side}px`, height: `${sw.side}px`, transform: `rotate(${l.angle}deg)` });
        band = document.createElement("div");
        Object.assign(band.style, { position: "absolute", left: `${sw.band}px`, top: "0", width: `${l.width}px`, height: `${sw.side}px`, background: colorOf(s, l.color) });
        turn.appendChild(band);
        layer.appendChild(turn);
      } else layer.style.background = colorOf(s, l.color);
      mover.appendChild(layer);
      lightTargets.set(l.id, { layer, band });
    }
    el.appendChild(mover);
    root.appendChild(el);
    pictures.set(n.id, mover);
    gsap.set(mover, { transformOrigin: `${fx * 100}% ${fy * 100}%` });
    targets.set(n.id, { el, svg: false });
  };
  const drawRun = (r: ReturnType<typeof runs>[number], i: number) => {
    if (r.kind === "shapes") {
      const { svg, defs } = newSvg(i);
      if (r.blend) (svg as SVGElement).style.mixBlendMode = r.blend;
      r.nodes.forEach((n) => addShape(n, svg, defs));
    }
    else if (r.kind === "rect") addRect(r.node);
    else if (r.kind === "scene3d") add3D(r.node);
    else if (r.kind === "image") addImage(r.node);
    else addText(r.node);
  };
  const worldRuns = runs(nodes);
  worldRuns.forEach(drawRun);
  // Pinned nodes: screen space, in a layer above the world (see Base.pinned). SVG ids continue the world's count.
  const screenRuns = runs(nodes, "screen");
  if (screenRuns.length) {
    const screen = document.createElement("div");
    screen.setAttribute("data-el", "screen");
    Object.assign(screen.style, { position: "absolute", inset: "0" });
    host.appendChild(screen);
    root = screen;
    screenRuns.forEach((r, i) => drawRun(r, worldRuns.length + i));
  }
  root = host;
  // Light layers use the picture as a CSS mask, which the page does not wait for. Decode each one first.
  await Promise.all([...masks].map((u) => { const img = new Image(); img.src = u; return img.decode().catch(() => undefined); }));
  await Promise.all(ready3D);
  // Nodes that turn about a far point on purpose: HyperFrames' rotation check skips them.
  for (const n of nodes) if (n.kind !== "audio" && (n as { orbit?: boolean }).orbit) targets.get(n.id)?.el.setAttribute("data-layout-allow-orbit", "");
  // The gesture a node belongs to (types.ts `group`): the detector reads data-group, as from the Remotion renderer.
  for (const n of nodes) if (n.kind !== "audio" && n.group) targets.get(n.id)?.el.setAttribute("data-group", n.group);

  // Scanlines above everything, below the grain: one still layer (see layout.ts), as in the Remotion renderer.
  const scan = scanlinesOf(s);
  if (scan > 0) {
    const layer = document.createElement("div");
    attr(layer, { "data-el": "texture", "data-layout-ignore": "" });
    Object.assign(layer.style, scanlineStyle(short), { opacity: String(scan) });
    host.appendChild(layer);
  }

  // Grain above everything: one child per tile, and tile f % GRAIN_TILES shows at frame f, as in the
  // Remotion renderer. One tween per tile spans the film; its ease picks the frame from the progress and
  // switches at half frames, so a seek to a whole frame never sits on a switch.
  if (grain > 0) {
    const layer = document.createElement("div");
    attr(layer, { "data-el": "texture", "data-layout-ignore": "" });
    Object.assign(layer.style, GRAIN_STYLE, { opacity: String(grain) });
    const seconds = Number(host.getAttribute("data-duration")) || 0;
    const frames = Math.max(1, Math.round(seconds * 30));
    tiles.forEach((url, k) => {
      const el = document.createElement("div");
      Object.assign(el.style, GRAIN_STYLE, { backgroundImage: `url("${url}")` });
      layer.appendChild(el);
      gsap.set(el, { autoAlpha: k === 0 ? 1 : 0 });
      const pick = (p: number) => (Math.round(p * frames) % GRAIN_TILES === k ? 1 : 0);
      tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: frames / 30, ease: pick, immediateRender: false }, 0);
    });
    host.appendChild(layer);
  }

  // Tracks -> tweens. Initial values are set outside the timeline (a set at 0 inside it does not render
  // on frame 0); each segment is a fromTo that does not render before its start.
  // Sounds: timed <audio> clips on the composition root, which HyperFrames' runtime plays and mixes.
  for (const n of nodes) {
    if (n.kind !== "audio") continue;
    const a = (document.getElementById(n.id) as HTMLAudioElement | null) ?? document.createElement("audio");
    a.id = n.id;
    a.className = "clip";
    a.src = assetUrl(n.src);
    a.setAttribute("preload", "auto");
    a.setAttribute("data-start", String(n.at));
    if (n.until !== undefined) a.setAttribute("data-duration", String(n.until - n.at));
    if (n.from) a.setAttribute("data-media-start", String(n.from));
    a.setAttribute("data-volume", String(n.volume ?? 1));
    if (n.fadeIn) a.setAttribute("data-fade-in", String(n.fadeIn));
    if (n.fadeOut) a.setAttribute("data-fade-out", String(n.fadeOut));
    if (!a.parentElement) host.appendChild(a);
  }
  for (const n of nodes) {
    if (n.kind === "anchor" || n.kind === "audio") continue;
    const tg = targets.get(n.id)!;
    if (n.kind === "camera") {
      gsap.set(tg.el, { transformOrigin: `${width / 2}px ${height / 2}px`, ...(hasTilt(n.tracks) ? { transformPerspective: persp } : {}) });
      // The view pans one way, the content moves the other; scale and tilt apply as they are.
      const camProps: Partial<Record<Prop, [string, number]>> = { x: ["x", -1], y: ["y", -1], scale: ["scale", 1], tiltX: ["rotationX", 1], tiltY: ["rotationY", 1] };
      // A whip's motion blur: one SVG Gaussian blur on the world. GSAP tweens a plain object, and each update
      // writes both deviations into the filter, so it matches the Remotion renderer's value at every frame.
      if (n.tracks?.blurX?.length || n.tracks?.blurY?.length) {
        const svg = document.createElementNS(SVGNS, "svg");
        attr(svg, { width: 0, height: 0 });
        (svg as SVGElement).style.position = "absolute";
        const f = document.createElementNS(SVGNS, "filter");
        // The region covers all the world the camera shows on its travel (layout.blurRegion), not one frame.
        const reg = blurRegion(n, width, height);
        attr(f, { id: BLUR_ID, x: reg.x, y: reg.y, width: reg.w, height: reg.h, filterUnits: "userSpaceOnUse", "color-interpolation-filters": "sRGB" });
        const gb = document.createElementNS(SVGNS, "feGaussianBlur");
        attr(gb, { edgeMode: "duplicate", stdDeviation: "0 0" });
        f.appendChild(gb);
        svg.appendChild(f);
        host.insertBefore(svg, tg.el);
        const blur = { x: n.tracks.blurX?.[0]?.v ?? 0, y: n.tracks.blurY?.[0]?.v ?? 0 };
        // The filter is on the world only while it blurs, so a frame at rest is drawn as without it (Remotion too).
        const write = () => {
          gb.setAttribute("stdDeviation", `${blur.x} ${blur.y}`);
          (tg.el as HTMLElement).style.filter = blur.x || blur.y ? `url(#${BLUR_ID})` : "";
        };
        write();
        for (const [prop, key] of [["blurX", "x"], ["blurY", "y"]] as const) {
          const keys = n.tracks[prop] ?? [];
          for (let i = 1; i < keys.length; i++) {
            const a = keys[i - 1]!, b = keys[i]!;
            if (b.t <= a.t) { tl.to(blur, { [key]: b.v, duration: 0, onUpdate: write }, a.t); continue; }
            tl.fromTo(blur, { [key]: a.v }, { [key]: b.v, duration: b.t - a.t, ease: eases[b.curve ?? "move"], immediateRender: false, onUpdate: write }, a.t);
          }
        }
      }
      for (const [prop, keys] of Object.entries(n.tracks ?? {}) as [Prop, Key[]][]) {
        const cp = camProps[prop];
        if (!keys?.length || !cp) continue;
        const [name, sign] = cp;
        gsap.set(tg.el, { [name]: sign * keys[0]!.v });
        for (let i = 1; i < keys.length; i++) {
          const a = keys[i - 1]!, b = keys[i]!;
          if (b.t <= a.t) { tl.to(tg.el, { [name]: sign * b.v, duration: 0 }, a.t); continue; }
          tl.fromTo(tg.el, { [name]: sign * a.v }, { [name]: sign * b.v, duration: b.t - a.t, ease: eases[b.curve ?? "move"], immediateRender: false }, a.t);
        }
      }
      continue;
    }
    // Plain tweens of one element's props: the picture's inner moves and its lights.
    const tween = (el: Element, tracks: Tracks | undefined, props: Partial<Record<Prop, string>>) => {
      for (const [prop, keys] of Object.entries(tracks ?? {}) as [Prop, Key[]][]) {
        const name = props[prop];
        if (!keys?.length || !name) continue;
        gsap.set(el, { [name]: keys[0]!.v });
        for (let i = 1; i < keys.length; i++) {
          const a = keys[i - 1]!, b = keys[i]!;
          if (b.t <= a.t) { tl.to(el, { [name]: b.v, duration: 0 }, a.t); continue; }
          tl.fromTo(el, { [name]: a.v }, { [name]: b.v, duration: b.t - a.t, ease: eases[b.curve ?? "move"], immediateRender: false }, a.t);
        }
      }
    };
    if (n.kind === "image") {
      if (n.inner) tween(pictures.get(n.id)!, n.inner, { x: "x", y: "y", scale: "scale" });
      for (const l of n.lights ?? []) {
        const lt = lightTargets.get(l.id)!;
        tween(lt.layer, l.tracks, { opacity: "autoAlpha" });
        if (lt.band) tween(lt.band, l.tracks, { x: "x" });
      }
    }
    const o = originOf(n);
    if (tg.svg) gsap.set(tg.el, o.mode === "view" ? { svgOrigin: o.value } : { transformOrigin: o.value });
    else gsap.set(tg.el, { transformOrigin: o.value, ...(hasTilt(n.tracks) ? { transformPerspective: persp } : {}) });
    for (const [prop, keys] of Object.entries(n.tracks ?? {}) as [Prop, Key[]][]) {
      if (!keys?.length) continue;
      // Lines and circles do not tilt (an SVG child has no 3D transform), as in the Remotion renderer.
      if (tg.svg && (prop === "tiltX" || prop === "tiltY")) continue;
      const [target, name, map] = route(prop, tg);
      gsap.set(target, { [name]: map(keys[0]!.v) });
      for (let i = 1; i < keys.length; i++) {
        const a = keys[i - 1]!, b = keys[i]!;
        if (b.t <= a.t) { tl.to(target, { [name]: map(b.v), duration: 0 }, a.t); continue; }
        tl.fromTo(target, { [name]: map(a.v) }, { [name]: map(b.v), duration: b.t - a.t, ease: eases[b.curve ?? "move"], immediateRender: false }, a.t);
      }
    }
  }
  const end = Math.max(0, ...nodes.map((n) => endOf(n.tracks)));
  // The camera's state on the world, as the Remotion renderer writes it (data-camera: the centre it looks at and its
  // zoom). The recorder reads it to take the camera's glide out of each part's motion; without it a camera glide read
  // as every part moving at once (motion/too-much, motion/stagger on Graphite's reel).
  if (cam) {
    const mark = (t: number) => { const v = evaluate(s, cam.tracks, t); world.setAttribute("data-camera", `${width / 2 + v.x},${height / 2 + v.y},${v.scale}`); };
    mark(0);
    const clock = { t: 0 };
    tl.fromTo(clock, { t: 0 }, { t: Math.max(end, 1 / FPS), duration: Math.max(end, 1 / FPS), ease: "none", immediateRender: false, onUpdate: () => mark(clock.t) }, 0);
  }
  return end;
}

/** Which element and GSAP property a track drives, and how its value maps. */
function route(prop: Prop, tg: { el: Element; draw?: Element; reveal?: Element; travel?: number; svg: boolean }): [Element, string, (v: number) => unknown] {
  switch (prop) {
    case "opacity": return [tg.el, "autoAlpha", (v) => v];
    case "x": return [tg.el, "x", (v) => v];
    case "y": return [tg.el, "y", (v) => v];
    case "rotate": return [tg.el, "rotation", (v) => v];
    case "scale": return [tg.el, "scale", (v) => v];
    case "scaleX": return [tg.el, "scaleX", (v) => v];
    case "scaleY": return [tg.el, "scaleY", (v) => v];
    case "draw": return [tg.draw ?? tg.el, "strokeDashoffset", (v) => 1 - v];
    case "reveal": return [tg.reveal ?? tg.el, "y", (v) => (v / 100) * (tg.travel ?? 0)];
    case "tiltX": return [tg.el, "rotationX", (v) => v];
    case "tiltY": return [tg.el, "rotationY", (v) => v];
    // Blur is a camera track; the camera's own branch draws it. On any other node it does nothing.
    case "blurX": case "blurY": return [document.createElement("i"), "x", (v) => v];
  }
  void DEFAULTS;
}
