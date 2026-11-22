// Records compositions frame by frame. Uses the installed Chrome.
//
// Per frame:  frames/fNNNN.jpg (q88), and the state of every text element (tracks.json, as before).
// Also:       elements.json — every painted element per frame: text, boxes, bars, SVG and images,
//             with id, kind, box, z-order, effective opacity, fill, stroke, radius, scale and rotation.
//             frames-png/fNNNN.png — lossless key frames for colour and edge work (every PNG_EVERY frames).
//             key.txt (the recording's cache key), audio.json (the sound nodes), render.json (footage or not),
//             purity.jpg, and video.mp4 only with --video.
// Storage: a frame that repeats the one before is a hard link to it, and the cache shares the files by hard links,
// so a repeated picture takes no space. A recording older than UNTELL_RECORDINGS_DAYS (default 3) keeps its JSON
// and loses its pictures (perf/cache.ts, pruneRecordings); the detector records it again when it needs them.
//
// Usage: bun scripts/record.ts [--force] [compositionId ...]       (no ids: every composition)
//        bun scripts/record.ts --at 75,150,225 compositionId        (only these frames: PNG + elements, no video)
//        bun scripts/record.ts hf:examples/hyperframes/spec-compound/index.html  (a HyperFrames film, saved as hf-spec-compound)
//        bun scripts/record.ts --films src/films/blocks/charts.tsx block-bar-spec   (only that module's FILMS)
// Flags:  --no-cache   record every frame again: no recording cache, no frame cache
//         --pages N    record a film on up to N pages at once, by time range (each extra page takes a free slot)
//         --probe      only open each film and print {id, footage, sound, system, scenes} as JSON lines (for untell render)
//         --no-reuse   draw every frame, also a frame that the scene says is the same as the one before
//         --layout     tracks.json and elements.json only: no pictures, no video (for checks that read geometry)
//         --video      also write video.mp4 (a preview for people; off by default, no check reads it)
//         --slow       the recorder from before the speed work (scripts/perf/baseline/record.ts)
//         --verify     record fast, record slow, and compare every frame and every element (scripts/perf/compare.ts)
//
// What makes it fast (each step is measured in out/perf/RESULT.md, and --verify proves the output is the same):
//  - The capture page (scripts/perf/player.tsx) knows when React has committed a frame, so a seek takes a few
//    ms. The old seek waited for six 60 Hz animation frames: 100 ms of idle time on every frame.
//  - The scene says which frames cannot differ from the frame before (no track moves, no footage, no 3D, no
//    grain step). Such a frame is a copy of the one before: no seek, no screenshot.
//  - A whole recording is cached under .untell/cache/rec, keyed by the bundle (all code and scene data), the
//    film, the media files, the Chrome version and this recorder. An unchanged film records in a moment.
//  - Each frame of a scene film is cached under .untell/cache/frames, keyed by what draws it. After an edit,
//    only the frames that the edit changed take a screenshot.
//  - Fonts and CDN scripts load from a local copy (scripts/perf/netcache.ts), not the network.
//  - A machine-wide slot pool (scripts/perf/slots.ts) limits how many browsers run at once, and a lock per
//    film stops two runs writing one folder. A run writes into a new folder and moves it into place at the end.
import { chromium, type Browser, type Page } from "playwright-core";
import { appendFileSync, mkdirSync, writeFileSync, existsSync, readFileSync, renameSync, rmSync, unlinkSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { link, linkTree, lookup, mediaStamp, pruneRecordings, pruneSoon, sha, store, treeHash, CACHE } from "./perf/cache";
import { useNetCache } from "./perf/netcache";
import { lock, slot, trySlot } from "./perf/slots";
// The frame loop, the size guard and the HyperFrames page setup: one copy, shared with the package (perf/recorder.ts).
import { JPEG_Q, PNG_EVERY, cachedOk, installParts, openHf, pad, recordRange, shot, type RangeRun } from "./perf/recorder";

const ROOT = resolve(import.meta.dir, "..");
// HyperFrames' page runtime (the CLI ships it). HF_RUNTIME overrides the path.
let HF_RUNTIME = process.env.HF_RUNTIME ?? join(ROOT, "node_modules/hyperframes/dist/hyperframe.runtime.iife.js");
const OUT = process.env.UNTELL_REC_OUT ?? join(ROOT, "out", "recordings");
// Change this when the recorder writes something different: it is part of every cache key.
const RECORDER = "record-4";

const args = process.argv.slice(2);
const force = args.includes("--force");
const noCache = args.includes("--no-cache") || process.env.UNTELL_NO_CACHE === "1";
const noReuse = args.includes("--no-reuse");
const layoutOnly = args.includes("--layout");
// --video (or UNTELL_VIDEO=1): also write video.mp4, a preview for people. No check reads it, so it is off by default.
const makeVideo = args.includes("--video") || process.env.UNTELL_VIDEO === "1";
// --pages N: record one film on up to N pages at once, split by time range (see record()).
const pagesArg = args.includes("--pages") ? args[args.indexOf("--pages") + 1] : process.env.UNTELL_PAGES;
const atIdx = args.indexOf("--at");
const atFrames = atIdx >= 0 ? args[atIdx + 1]!.split(",").map(Number) : null;
const ids0 = args.filter((a, i) => !a.startsWith("--") && !(atIdx >= 0 && i === atIdx + 1) && !(args[i - 1] === "--films") && !(args[i - 1] === "--pages"));

// --slow: the recorder as it was. --verify: both, then the comparison.
if (args.includes("--slow") || args.includes("--verify")) {
  const rest = args.filter((a) => a !== "--slow" && a !== "--verify");
  if (args.includes("--slow")) {
    // The old recorder writes no key.txt: remove the one there, so no tool keys a cache by a recording it no longer names.
    for (const a of rest.filter((x, i) => !x.startsWith("--") && rest[i - 1] !== "--films")) rmSync(join(OUT, a.startsWith("hf:") ? `hf-${basename(dirname(resolve(a.slice(3))))}` : a, "key.txt"), { force: true });
    const r = spawnSync("bun", [join(ROOT, "scripts/perf/baseline/record.ts"), ...rest], { cwd: ROOT, stdio: "inherit" });
    process.exit(r.status ?? 1);
  }
  // Both at the same moment: each builds its bundle at its start, so both draw the same code even while other
  // agents edit the kit. (Runs one after the other were not comparable here: the kit changed between them.)
  const slowOut = join(ROOT, "out", "perf", "verify", `slow-${process.pid}`);
  mkdirSync(slowOut, { recursive: true });
  const both = await Promise.all([
    Bun.spawn(["bun", join(ROOT, "scripts/record.ts"), ...rest], { cwd: ROOT, stdout: "inherit", stderr: "inherit" }).exited,
    // The old recorder knows no --pages: leave it and its value out.
    Bun.spawn(["bun", join(ROOT, "scripts/perf/baseline/record.ts"), ...rest.filter((a, i) => a !== "--pages" && rest[i - 1] !== "--pages")], { cwd: ROOT, stdout: "inherit", stderr: "inherit", env: { ...process.env, UNTELL_REC_OUT: slowOut } }).exited,
  ]);
  if (both.some((c) => c !== 0)) process.exit(1);
  let bad = 0;
  for (const name of rest.filter((a, i) => !a.startsWith("--") && rest[i - 1] !== "--films" && rest[i - 1] !== "--pages").map((id) => (id.startsWith("hf:") ? `hf-${basename(dirname(resolve(id.slice(3))))}` : id))) {
    const c = spawnSync("bun", [join(ROOT, "scripts/perf/compare.ts"), join(OUT, name), join(slowOut, name)], { cwd: ROOT, stdio: "inherit" });
    if (c.status !== 0) bad++;
  }
  // Keep the slow recording when something differs, so the difference can be looked at.
  if (bad) console.error(`the slow recording stays in ${slowOut}`); else rmSync(slowOut, { recursive: true, force: true });
  process.exit(bad ? 1 : 0);
}

// Stage marks for scripts/perf/bench.ts (UNTELL_MARKS): JSON lines {stage, t0, t1}.
const MARKS = process.env.UNTELL_MARKS;
const mark = (stage: string, t0: number, extra: Record<string, number> = {}) => { if (MARKS) appendFileSync(MARKS, JSON.stringify({ stage, t0, t1: Date.now(), ...extra }) + "\n"); };

// Each run builds its own bundle and page, so several runs can record at once. With --films <module>,
// the bundle holds only that module's FILMS, so a broken film elsewhere cannot stop this run.
const filmsIdx = args.indexOf("--films");
const filmsModule = filmsIdx >= 0 ? resolve(args[filmsIdx + 1]!) : null;
const RUN = `run-${process.pid}`;
const entry = join(ROOT, "web", `${RUN}.tsx`);
const tBuild = Date.now();
writeFileSync(entry, filmsModule
  ? `import { mountPlayer } from "../scripts/perf/player";\nimport { FILMS } from "${filmsModule}";\nmountPlayer(FILMS);\n`
  : `import { mountPlayer } from "../scripts/perf/player";\nimport { COMPOSITIONS } from "../src/registry";\nmountPlayer(COMPOSITIONS);\n`);
writeFileSync(join(ROOT, "web", `${RUN}.html`), readFileSync(join(ROOT, "web", "index.html"), "utf8").replace("./player.js", `./${RUN}.js`));
const build = spawnSync(
  "bun",
  // The kit's font files (src/system/fonts.gen.ts imports them) go to web/fonts under their own names: no network request.
  ["build", entry, "--outdir", "web", "--entry-naming", "[name].js", "--asset-naming", "fonts/[name].[ext]", "--format", "iife", "--target", "browser", "--minify",
    "--define", 'process.env.NODE_ENV="production"'],
  { cwd: ROOT, stdio: ["ignore", "ignore", "inherit"] },
);
const cleanup = () => { for (const f of [entry, join(ROOT, "web", `${RUN}.js`), join(ROOT, "web", `${RUN}.html`)]) try { unlinkSync(f); } catch {} };
process.on("exit", cleanup);
if (build.status !== 0) process.exit(1);
// The bundle holds every line of code and every scene of the module: its hash is the code part of the cache key.
const BUNDLE = sha(readFileSync(join(ROOT, "web", `${RUN}.js`)), readFileSync(join(ROOT, "web", "index.html")));
// The kit: the code that turns a scene's nodes into a frame. A frame of a scene film depends on it and on the
// nodes, not on the rest of the films module, so the frame cache keys use this hash and not BUNDLE.
const KIT = treeHash([join(ROOT, "src/system"), join(ROOT, "src/films/blocks/film.tsx"), join(ROOT, "scripts/perf/player.tsx"), join(ROOT, "web/index.html"), join(ROOT, "bun.lock")],
  (p) => /\.(ts|tsx|json|html|lock|png|woff2)$/.test(p) && !/\.test\.ts$/.test(p));
mark("bundle", tBuild);

const tImport = Date.now();
const { COMPOSITIONS } = filmsModule ? { COMPOSITIONS: (await import(filmsModule)).FILMS } : await import("../src/registry");
mark("import", tImport);
const ids = ids0.length ? ids0 : Object.keys(COMPOSITIONS);
// The media stamp, once per run: any change to a media file changes it.
const MEDIA = mediaStamp();
// This file's own code: the samplers below decide what elements.json holds.
// The frame loop and the page setup are in perf/recorder.ts: its code is part of the key too.
const SELF = sha(readFileSync(import.meta.path), readFileSync(join(ROOT, "scripts", "perf", "recorder.ts")));

// Runs in the page: every element with its own text, measured as the viewer sees it.
const sample = () => {
  const root = document.getElementById("root")!;
  // The part of an element that can show: its box cut by every ancestor that clips (overflow hidden),
  // such as the mask of a line that rises into view. Fully masked text is not on screen.
  const visibleRect = (el: Element) => {
    const r = el.getBoundingClientRect();
    let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let e = el.parentElement; e && e !== root; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const clipsX = cs.overflowX === "hidden" || cs.overflowX === "clip", clipsY = cs.overflowY === "hidden" || cs.overflowY === "clip";
      if (!clipsX && !clipsY) continue;
      const a = e.getBoundingClientRect();
      // The frame itself clips too; text past the frame edge is a separate fact (out of frame), so skip it.
      if (a.left <= 0.5 && a.top <= 0.5 && a.right >= innerWidth - 0.5 && a.bottom >= innerHeight - 0.5) continue;
      if (clipsX) { x0 = Math.max(x0, a.left); x1 = Math.min(x1, a.right); }
      if (clipsY) { y0 = Math.max(y0, a.top); y1 = Math.min(y1, a.bottom); }
    }
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    return { x: x0, y: y0, width: w, height: h, left: x0, top: y0, right: x0 + w, bottom: y0 + h, masked: w * h < r.width * r.height - 1 };
  };
  // The nearest data-el label, skipping the film's ground and texture layers (they hold everything).
  const labelEl = (el: Element): Element | null => {
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      const v = e.getAttribute("data-el");
      if (v && ((v !== "ground" && v !== "texture" && v !== "world") || e === el)) return e;
    }
    return null;
  };
  // Without a data-el label, an element is named by its path of child positions from the root.
  const pathOf = (el: Element) => {
    const parts: string[] = [];
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      parts.unshift(`${e.tagName.toLowerCase()}${e.parentElement ? Array.from(e.parentElement.children).indexOf(e) : 0}`);
    }
    return parts.join("/");
  };
  const out: unknown[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
    if (!text) continue;
    const r = visibleRect(el);
    let opacity = 1;
    for (let e: HTMLElement | null = el; e && e !== root; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") opacity = 0;
      opacity *= Number(cs.opacity);
    }
    if (r.width * r.height < 1) opacity = 0; // fully masked
    let bg: string | null = null;
    for (let e: HTMLElement | null = el; e; e = e.parentElement) {
      const b = getComputedStyle(e).backgroundColor;
      if (b && b !== "rgba(0, 0, 0, 0)" && b !== "transparent") { bg = b; break; }
    }
    const cs = getComputedStyle(el);
    const scale = el.offsetHeight ? el.getBoundingClientRect().height / el.offsetHeight : 1; // unmasked size
    // Covered: probe 5 points of the text box; a point is covered when the top element there
    // belongs to a different data-el block (another card, another label).
    const block = labelEl(el);
    let covered = 0;
    const probes: [number, number][] = [[0.5, 0.5], [0.15, 0.3], [0.85, 0.3], [0.15, 0.75], [0.85, 0.75]];
    for (const [px, py] of probes) {
      // The first visible element at the point, skipping invisible ones (opacity near 0 still hit-tests).
      const stack = document.elementsFromPoint(r.x + r.width * px, r.y + r.height * py);
      const top = stack.find((e) => {
        let o = 1;
        for (let a: Element | null = e; a && a !== root; a = a.parentElement) o *= Number(getComputedStyle(a).opacity);
        return o > 0.1;
      });
      if (top && block && root.contains(top) && top !== root && !block.contains(top) && !top.contains(block)) {
        const topBlock = labelEl(top);
        if (topBlock && topBlock !== block && !topBlock.contains(block)) covered++;
      }
    }
    out.push({
      id: labelEl(el)?.getAttribute("data-el") ?? pathOf(el),
      text,
      x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10,
      w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      opacity: Math.round(opacity * 1000) / 1000,
      color: cs.color, bg,
      fontPx: Math.round(parseFloat(cs.fontSize) * scale * 10) / 10,
      covered: covered / probes.length,
      // The type role, when a design-system renderer marked it (display, headline, body, label, caption).
      role: el.closest("[data-role]")?.getAttribute("data-role") ?? null,
    });
  }
  return out;
};

// Runs in the page: every element that paints something, with what it paints and where.
const sampleElements = () => {
  const root = document.getElementById("root")!;
  // The part of an element that can show: its box cut by every ancestor that clips (overflow hidden),
  // such as the mask of a line that rises into view. Fully masked text is not on screen.
  const visibleRect = (el: Element) => {
    const r = el.getBoundingClientRect();
    let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let e = el.parentElement; e && e !== root; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const clipsX = cs.overflowX === "hidden" || cs.overflowX === "clip", clipsY = cs.overflowY === "hidden" || cs.overflowY === "clip";
      if (!clipsX && !clipsY) continue;
      const a = e.getBoundingClientRect();
      // The frame itself clips too; text past the frame edge is a separate fact (out of frame), so skip it.
      if (a.left <= 0.5 && a.top <= 0.5 && a.right >= innerWidth - 0.5 && a.bottom >= innerHeight - 0.5) continue;
      if (clipsX) { x0 = Math.max(x0, a.left); x1 = Math.min(x1, a.right); }
      if (clipsY) { y0 = Math.max(y0, a.top); y1 = Math.min(y1, a.bottom); }
    }
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    return { x: x0, y: y0, width: w, height: h, left: x0, top: y0, right: x0 + w, bottom: y0 + h, masked: w * h < r.width * r.height - 1 };
  };
  // The nearest data-el label, skipping the film's ground and texture layers (they hold everything).
  const labelEl = (el: Element): Element | null => {
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      const v = e.getAttribute("data-el");
      if (v && ((v !== "ground" && v !== "texture" && v !== "world") || e === el)) return e;
    }
    return null;
  };
  const W = window.innerWidth, H = window.innerHeight;
  const pathOf = (el: Element) => {
    const parts: string[] = [];
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      parts.unshift(`${e.tagName.toLowerCase()}${e.parentElement ? Array.from(e.parentElement.children).indexOf(e) : 0}`);
    }
    return parts.join("/");
  };
  const clear = (c: string) => !c || c === "transparent" || c === "rgba(0, 0, 0, 0)";
  const out: unknown[] = [];
  // The camera, when the film uses the kit's World: its exact centre and zoom in world pixels.
  const world = root.querySelector("[data-el='world']");
  if (world) {
    const [cx, cy, zoom] = (world.getAttribute("data-camera") ?? "0,0,1").split(",").map(Number);
    out.push({ id: "camera", layer: "camera", kind: "camera", x: cx, y: cy, w: 0, h: 0, opacity: 1, fill: null, stroke: null, radius: 0, scale: zoom, rotation: 0, z: -1 });
  }
  // Type behind a cut-out: when one shows, each letter of each text gets its ink box, from the font's own
  // glyph metrics, so the cover check can measure how much of the letter the cut-out hides.
  const cutoutOn = Array.from(root.querySelectorAll("[data-cutout]")).some((e) => getComputedStyle(e).visibility !== "hidden" && Number(getComputedStyle(e).opacity) > 0.02);
  const pen = document.createElement("canvas").getContext("2d")!;
  const glyphsOf = (el: Element, cs: CSSStyleDeclaration, clip: { left: number; top: number; right: number; bottom: number }) => {
    const boxes: number[][] = [];
    pen.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const up = cs.textTransform === "uppercase", low = cs.textTransform === "lowercase";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType !== 3) continue;
      const str = node.textContent ?? "";
      for (let i = 0; i < str.length; i++) {
        let ch = str[i]!;
        if (!ch.trim()) continue;
        if (up) ch = ch.toUpperCase(); else if (low) ch = ch.toLowerCase();
        const range = document.createRange();
        range.setStart(node, i); range.setEnd(node, i + 1);
        const rc = range.getBoundingClientRect();
        const m = pen.measureText(ch);
        const k = rc.height / (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent || 1);
        const base = rc.top + m.fontBoundingBoxAscent * k;
        const b = [rc.left - m.actualBoundingBoxLeft * k, base - m.actualBoundingBoxAscent * k, rc.left + m.actualBoundingBoxRight * k, base + m.actualBoundingBoxDescent * k];
        const c = [Math.max(b[0]!, clip.left), Math.max(b[1]!, clip.top), Math.min(b[2]!, clip.right), Math.min(b[3]!, clip.bottom)];
        if (c[2]! - c[0]! < 0.5 || c[3]! - c[1]! < 0.5) continue; // masked away
        boxes.push([ch.codePointAt(0)!, ...c.map((v) => Math.round(v * 10) / 10)]);
      }
    }
    return boxes;
  };
  const all = Array.from(root.querySelectorAll<Element>("*"));
  all.forEach((el, order) => {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return; // an SVG is one element
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const r = visibleRect(el);
    if (r.width * r.height < 1 || r.right < 0 || r.bottom < 0 || r.left > W || r.top > H) return;
    let opacity = 1, zSum = 0;
    for (let e: Element | null = el; e && e !== root; e = e.parentElement) {
      const s = getComputedStyle(e);
      opacity *= Number(s.opacity);
      if (s.position !== "static" && s.zIndex !== "auto") zSum += Number(s.zIndex) || 0;
    }
    if (opacity < 0.02) return;
    const tag = el.tagName.toLowerCase();
    const ownText = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? "").join("").trim();
    const fill = clear(cs.backgroundColor) ? null : cs.backgroundColor;
    const image = cs.backgroundImage && cs.backgroundImage !== "none" ? cs.backgroundImage.slice(0, 60) : null;
    const bw = parseFloat(cs.borderTopWidth) || 0;
    const stroke = bw > 0 && !clear(cs.borderTopColor) ? { color: cs.borderTopColor, width: bw } : null;
    const outline = parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== "none" ? { color: cs.outlineColor, width: parseFloat(cs.outlineWidth) } : null;
    const kind = ownText ? "text" : tag === "svg" ? "svg" : tag === "img" || tag === "video" || tag === "canvas" ? "image" : fill || image || stroke || outline ? "box" : null;
    if (!kind) return;
    const offW = (el as HTMLElement).offsetWidth;
    const scale = offW ? el.getBoundingClientRect().width / offW : 1; // unmasked size
    const m = cs.transform.match(/^matrix\(([^)]+)\)/);
    const rotation = m ? Math.round((Math.atan2(Number(m[1]!.split(",")[1]), Number(m[1]!.split(",")[0])) * 180) / Math.PI * 10) / 10 : 0;
    const label = labelEl(el)?.getAttribute("data-el");
    out.push({
      id: label && label !== "ground" && label !== "texture" ? `${label}:${pathOf(el)}` : label ?? pathOf(el),
      // A tile of the texture layer (HyperFrames draws the grain as one child per tile, shown in turn) is texture, not
      // content: else the grain reads as a change on every frame (an end that never holds).
      layer: label === "ground" || label === "texture" ? label : !label && el.closest('[data-el="texture"]') ? "texture" : "content",
      kind, z: zSum * 100000 + order,
      x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10,
      opacity: Math.round(opacity * 1000) / 1000,
      fill: fill ?? image, stroke: stroke ?? outline,
      radius: parseFloat(cs.borderTopLeftRadius) || 0,
      scale: Math.round(scale * 1000) / 1000, rotation,
      ...(kind === "text" ? { text: ownText.slice(0, 80), color: cs.color, fontPx: Math.round(parseFloat(cs.fontSize) * scale * 10) / 10,
        fontWeight: cs.fontWeight, fontFamily: cs.fontFamily.split(",")[0]!.replace(/["']/g, "").trim(),
        ...(cutoutOn ? { glyphs: glyphsOf(el, cs, r) } : {}) } : {}),
      // A picture: its file, its whole drawn box (before the crop) and how it fills it, for the cover check.
      ...(tag === "img" ? (() => {
        const im = el as HTMLImageElement, b = im.getBoundingClientRect();
        return { src: decodeURI(new URL(im.currentSrc || im.src, location.href).pathname), natural: [im.naturalWidth, im.naturalHeight],
          fit: cs.objectFit, position: cs.objectPosition, box: [b.left, b.top, b.width, b.height].map((v) => Math.round(v * 10) / 10),
          cutout: !!el.closest("[data-cutout]") };
      })() : {}),
    });
  });
  return out;
};

// The samplers go into the page once per open; a frame then needs one call for its seek and both samples.
const SAMPLERS = `window.__sample = ${sample.toString()}; window.__sampleElements = ${sampleElements.toString()};`;

/**
 * Opens a film. A Remotion composition id loads the player; "hf:<path to index.html>" loads a HyperFrames
 * composition and seeks its paused GSAP timeline (window.__timelines.main), the same way HyperFrames renders.
 */
/** A scene that threw while it built: the run ends with its message first, then how to fix it. */
class SceneError extends Error {
  constructor(id: string, message: string) {
    super(`${id}: the scene threw while it built: ${message.replace(/^(Uncaught )?Error: /, "")}\n  fix: correct the scene at that error (its block and props are named in the message), then record again.`);
  }
}

// Every exit path closes the browser and ends the run non-zero: an error that leaves the browser open keeps this
// process alive at 0 % CPU for ever (two agents waited 15 minutes for a scene that threw at build).
const fail = async (e: unknown) => {
  console.error(e instanceof SceneError ? e.message : `record: ${String((e as Error)?.stack ?? e).split("\n").slice(0, 3).join("\n")}`);
  try { await (browser as Browser | null)?.close(); } catch { /* the browser is already gone */ }
  process.exit(1);
};
process.on("unhandledRejection", (e) => { void fail(e); });
process.on("uncaughtException", (e) => { void fail(e); });

async function open(page: Page, id: string) {
  // Blocks report layout problems (a dropped label, no route) as console warnings: print them.
  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  // A scene that throws while it builds (a block that refuses its props): the page logs the error and draws nothing.
  // The first such error ends the film at once with the scene's own message, never a wait for frames that do not come.
  let thrown: string | null = null;
  const note = (text: string) => { if (!thrown && /^(Uncaught )?\w*Error\b/.test(text)) thrown = text.split("\n")[0]!; };
  page.on("console", (m) => {
    if (m.type() === "error") note(m.text());
    if (thrown) return; // the scene's error is said once, first, by the run's own exit
    if (m.type() === "warning" || m.type() === "error") console.error(`${id}: ${m.text()}`);
  });
  page.on("pageerror", (e) => { note(String(e)); if (!thrown) console.error(`${id}: ${e}`); });
  const check = () => { if (thrown) throw new SceneError(id, thrown); };
  if (id.startsWith("hf:")) {
    // The HyperFrames runtime, as its renderer injects it (at the start of <head>, before the page's own
    // scripts). It seeks the timelines and plays media: a <video> or <audio> shows only through it.
    if (!existsSync(HF_RUNTIME)) console.error(`${id}: no HyperFrames runtime at ${HF_RUNTIME}; media will not play`);
    await openHf(page, resolve(id.slice(3)), existsSync(HF_RUNTIME) ? HF_RUNTIME : null);
    if (!(await page.evaluate(() => (window as unknown as { __viaRuntime?: boolean }).__viaRuntime)))
      console.error(`${id}: seeking the GSAP timeline alone (no HyperFrames runtime): <video> and <audio> will not play`);
  } else {
    await page.goto(`file://${join(ROOT, "web", `${RUN}.html`)}?comp=${encodeURIComponent(id)}`);
  }
  check();
  const meta = await page.evaluate(() => window.__meta);
  check();
  if (!meta) throw new Error(`no composition ${id}`);
  await page.setViewportSize({ width: meta.width, height: meta.height });
  // A system film draws nothing until its fonts load; it marks itself data-ready then. Wait for it,
  // so frame 0 is the real frame 0 and not an empty ground.
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-system]");
    return !el || el.hasAttribute("data-ready") || !!(window as unknown as { __timelines?: Record<string, unknown> }).__timelines?.main;
  }, null, { timeout: 15000, polling: 100 });
  // React reports a render error a moment after the load: give it one more check after the fonts.
  await page.waitForTimeout(150);
  check();
  await page.evaluate(SAMPLERS);
  if (process.env.UNTELL_SETTLE_FRAMES) await page.evaluate((n) => { (window as unknown as { __settleFrames: number }).__settleFrames = n; }, Number(process.env.UNTELL_SETTLE_FRAMES));
  return meta;
}

/** The folder name for a film: a HyperFrames project is named hf-<project folder>. */
const outName = (id: string) => (id.startsWith("hf:") ? `hf-${basename(dirname(resolve(id.slice(3))))}` : id);


/** The cache key of a whole recording: everything that its files depend on. */
function recordingKey(id: string, meta: unknown) {
  const base = [RECORDER, SELF, CHROME, CHROME_FLAGS.join(" "), JSON.stringify(meta), String(PNG_EVERY), String(JPEG_Q), layoutOnly ? "layout" : "full"];
  if (!id.startsWith("hf:")) return sha(...base, BUNDLE, id, MEDIA);
  // A HyperFrames project: its page, its built runtime and fonts (by content), its media (by stamp), the HF runtime.
  const proj = dirname(resolve(id.slice(3)));
  return sha(...base, "hf", readFileSync(resolve(id.slice(3))), treeHash([join(proj, "assets")], (p) => !p.includes("/assets/media/")),
    mediaStamp(join(proj, "assets", "media")), existsSync(HF_RUNTIME) ? readFileSync(HF_RUNTIME) : "");
}

/** The files a recording writes; install() moves them into the film's folder. */
const PARTS = ["frames", "frames-png", "tracks.json", "elements.json", "purity.jpg", "video.mp4", "key.txt", "audio.json", "render.json"];

/** Moves a finished recording from `work` into `dir`, part by part. Other files in `dir` (inspect output) stay. */
const install = (work: string, dir: string) => installParts(work, dir, PARTS);

type Stats = { drawn: number; reused: number; fromCache: number; retried: number };

async function record(page: Page, id: string): Promise<string> {
  const dir = join(OUT, outName(id));
  mkdirSync(OUT, { recursive: true });
  // One run at a time per film folder: a second run waits, and then usually finds the recording in the cache.
  const unlock = await lock(join(OUT, `.${outName(id)}.lock`), `record ${outName(id)}`);
  let work = "";
  try {
    const tOpen = Date.now();
    const meta = await open(page, id);
    mark("open", tOpen);
    const key = recordingKey(id, meta);
    if (!noCache) {
      const hit = lookup("rec", key);
      if (hit && !cachedOk(join(hit, "frames", "f0000.jpg"), meta.width, meta.height)) console.error(`${id}: a cached recording has the wrong frame size; recording again`);
      else if (hit) {
        const tHit = Date.now();
        const work = join(OUT, `.${outName(id)}.part-${process.pid}`);
        rmSync(work, { recursive: true, force: true });
        // Hard links to the cached files: no copy, no space. key.txt is replaced, never written in place.
        linkTree(hit, work);
        rmSync(join(work, ".done"), { force: true });
        rmSync(join(work, "key.txt"), { force: true });
        writeFileSync(join(work, "key.txt"), key);
        install(work, dir);
        mark("cache-hit", tHit);
        return "from the recording cache";
      }
    }
    work = join(OUT, `.${outName(id)}.part-${process.pid}`);
    rmSync(work, { recursive: true, force: true });
    const frames = join(work, "frames");
    const pngs = join(work, "frames-png");
    mkdirSync(frames, { recursive: true });
    mkdirSync(pngs, { recursive: true });
    const tracks: unknown[] = [];
    const elements: unknown[] = [];
    const st: Stats = { drawn: 0, reused: 0, fromCache: 0, retried: 0 };
    const writes: Promise<unknown>[] = [];
    const frameDir = join(CACHE, "frames");
    mkdirSync(frameDir, { recursive: true });
    // Everything a frame of a scene film depends on besides its nodes: the kit, the media files, the browser and
    // its flags, the size, the picture format and this recorder.
    const frameKey = (pk: string, kind: string) => join(frameDir, `${sha(pk, KIT, MEDIA, RECORDER, SELF, CHROME, CHROME_FLAGS.join(" "), String(meta.width), String(meta.height), String(JPEG_Q), kind)}.${kind === "png" ? "png" : "jpg"}`);
    let exact = true;
    // The frame loop is perf/recorder.ts (shared with the package): the seek, both samplers, the screenshot with the
    // size guard, the copy of a repeated frame and the frame cache.
    const run: RangeRun = { id, meta, frames, pngs, tracks, elements, st, writes, noReuse, noCache, layoutOnly, exact: () => exact,
      frameKey: (pk, kind) => frameKey(pk, kind), log: (m) => console.error(m) };
    const runRange = (pg: Page, a: number, b: number) => recordRange(pg, a, b, run);
    const tFrames = Date.now();
    // Several pages per film (--pages N, or UNTELL_PAGES): the film splits into N time ranges, one page each. Each
    // extra page takes a machine slot if one is free now; without a free slot the film records on fewer pages.
    const want = Math.max(1, Math.min(8, Number(pagesArg) || 1, Math.floor(meta.durationInFrames / 60) || 1));
    const extra: { page: Page; release: () => void }[] = [];
    for (let i = 1; i < want; i++) {
      const release = trySlot(`record ${outName(id)} page ${i + 1}`);
      if (!release) break;
      const pg = await newPage();
      await open(pg, id);
      extra.push({ page: pg, release });
    }
    const pagesUsed = [page, ...extra.map((x) => x.page)];
    // Several pages are inside tolerance but not byte-identical to one page (out/perf/RESULT.md), so such a
    // recording is not stored in the exact caches (the frame cache and the recording cache).
    exact = pagesUsed.length === 1;
    const cut = (i: number) => Math.round((meta.durationInFrames * i) / pagesUsed.length);
    try {
      await Promise.all(pagesUsed.map((pg, i) => runRange(pg, cut(i), cut(i + 1))));
    } finally {
      for (const x of extra) { await x.page.close().catch(() => {}); x.release(); }
    }
    await Promise.all(writes.splice(0));
    mark("frames", tFrames, { n: meta.durationInFrames });
    const tTail = Date.now();
    // The design system, when the film declares one with data-system. The inspect tools load its tokens by this id.
    const system = await page.evaluate(() => document.querySelector("[data-system]")?.getAttribute("data-system") ?? null);
    // Purity: the middle frame again, reached from far away, must look the same.
    if (!layoutOnly) {
      const mid = Math.floor(meta.durationInFrames / 2);
      await page.evaluate(() => window.__seek(3));
      await page.evaluate((n) => window.__seek(n), mid);
      writeFileSync(join(work, "purity.jpg"), await shot(page, "jpeg"));
    }
    mark("purity", tTail);
    const tJson = Date.now();
    writeFileSync(join(work, "tracks.json"), JSON.stringify({ id: outName(id), ...meta, system, frames: tracks }));
    writeFileSync(join(work, "elements.json"), JSON.stringify({ id: outName(id), ...meta, system, frames: elements }));
    // The film's sound nodes in film time (null when the film is not built from scenes): untell render mixes them
    // when it encodes a render from this recording's frames.
    writeFileSync(join(work, "audio.json"), JSON.stringify(await page.evaluate(() => (window as unknown as { __audio?: () => unknown }).__audio?.() ?? null)));
    // What a render from these frames must know: footage shows a frame the Player found by seeking a <video>, which
    // can differ from the exact frame the renderers extract, so untell render does not encode such a film from here.
    writeFileSync(join(work, "render.json"), JSON.stringify({ footage: await page.evaluate(() => (window as unknown as { __footage?: () => boolean }).__footage?.() ?? true) }));
    // The recording's cache key: a tool that reads this recording (the detector's capture) keys its own cache by it.
    if (!layoutOnly) writeFileSync(join(work, "key.txt"), key);
    mark("json", tJson);
    if (!layoutOnly && makeVideo) {
      const tEnc = Date.now();
      // video.mp4 is the preview for people (gallery, contact sheets); no check reads it. The checks read the
      // frames. On macOS it uses the hardware encoder at q75: on the bench films its SSIM against the frames is
      // above that of the old libx264 CRF 20 encode, for 2-5 % of the CPU (out/perf/RESULT.md). Where the
      // hardware encoder is missing, or with UNTELL_ENCODE=x264, it uses the old encode.
      const enc = (codec: string[]) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(meta.fps), "-i", join(frames, "f%04d.jpg"),
        ...codec, join(work, "video.mp4")]);
      const X264 = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20"];
      let mp4 = process.platform === "darwin" && process.env.UNTELL_ENCODE !== "x264" ? enc(["-c:v", "h264_videotoolbox", "-q:v", "75", "-pix_fmt", "yuv420p"]) : null;
      if (!mp4 || mp4.status !== 0) mp4 = enc(X264);
      if (mp4.status !== 0) throw new Error(`ffmpeg failed for ${id}`);
      mark("encode", tEnc);
    }
    if (!noCache && !layoutOnly && exact) { const tStore = Date.now(); store("rec", key, work); mark("store", tStore); }
    install(work, dir);
    work = "";
    return `${st.drawn} drawn, ${st.reused} copied from the frame before, ${st.fromCache} from the frame cache${st.retried ? `, ${st.retried} retried` : ""}`;
  } finally {
    // A run that failed leaves no half-written folder behind.
    if (work) rmSync(work, { recursive: true, force: true });
    unlock();
  }
}

/** Only some frames: lossless PNGs and element data, merged into elements.json. */
async function recordAt(page: Page, id: string, at: number[]) {
  const dir = join(OUT, outName(id));
  const pngs = join(dir, "frames-png");
  mkdirSync(pngs, { recursive: true });
  const meta = await open(page, id);
  const path = join(dir, "elements.json");
  const doc = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { id: outName(id), ...meta, frames: Array(meta.durationInFrames).fill(null) };
  doc.system = await page.evaluate(() => document.querySelector("[data-system]")?.getAttribute("data-system") ?? null);
  for (const f of at) {
    doc.frames[f] = await page.evaluate(async (n) => { await window.__seek(n); return (window as unknown as { __sampleElements: () => unknown }).__sampleElements(); }, f);
    // A recording's files are hard links into the recording cache. Remove the file first, so the write makes a
    // new file and the cache entry under the old key keeps its old frame.
    const png = join(pngs, `f${pad(f)}.png`);
    rmSync(png, { force: true });
    writeFileSync(png, await shot(page, "png"));
  }
  rmSync(path, { force: true });
  writeFileSync(path, JSON.stringify(doc));
}

// Pages open from file://. 3D models load with fetch, which Chrome refuses on file:// without this flag.
// UNTELL_CHROME_FLAGS adds flags (for the bench).
// --run-all-compositor-stages-before-draw: Chrome finishes every raster stage before it draws a frame, so a
// screenshot taken right after a seek has no tile in its first, rough raster. On the hero film it cut the frames
// that differ from the slow recorder from 395 to 265 (the slow recorder itself differs from itself in 119).
const CHROME_FLAGS = ["--allow-file-access-from-files", "--run-all-compositor-stages-before-draw", ...(process.env.UNTELL_CHROME_FLAGS ?? "").split(" ").filter(Boolean)];
let CHROME = "";
const tLaunch = Date.now();
let browser: Browser | null = null;
/** One browser per run, started when the first film needs it (a run that only reads the cache starts none). */
const getBrowser = async () => {
  if (!browser) {
    browser = await chromium.launch({ channel: "chrome", headless: true, args: CHROME_FLAGS });
    CHROME = browser.version();
    mark("launch", tLaunch);
  }
  return browser;
};
await getBrowser();
const newPage = async () => {
  const page = await (await getBrowser()).newPage({ viewport: { width: 1080, height: 1920 } });
  if (!noCache) await useNetCache(page);
  return page;
};
if (args.includes("--probe")) {
  // --probe: open each film and print what a render needs to know before it records: {id, footage, scenes}.
  const page = await newPage();
  for (const id of ids) {
    await open(page, id);
    console.log(JSON.stringify(await page.evaluate((i) => ({ id: i, footage: (window as unknown as { __footage?: () => boolean }).__footage?.() ?? true,
      sound: (window as unknown as { __sound?: () => boolean }).__sound?.() ?? true,
      system: document.querySelector("[data-system]")?.getAttribute("data-system") ?? null,
      scenes: !!(window as unknown as { __keyable?: boolean }).__keyable }), id)));
  }
} else if (atFrames) {
  const release = await slot(`record --at ${ids.join(" ")}`);
  const page = await newPage();
  for (const id of ids) {
    await recordAt(page, id, atFrames);
    console.log(`${id}: frames ${atFrames.join(", ")}`);
  }
  release();
} else {
  const queue = ids.filter((id) => force || !existsSync(join(OUT, outName(id), "elements.json")) || !existsSync(join(OUT, outName(id), "frames")));
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    const page = await newPage();
    for (let id = queue.shift(); id; id = queue.shift()) {
      // A machine slot for each film, so this run's pages and other runs' pages share the cores.
      const release = await slot(`record ${outName(id)}`);
      try {
        const t0 = performance.now();
        const how = await record(page, id);
        console.log(`${id}: ${((performance.now() - t0) / 1000).toFixed(1)} s (${how})`);
      } finally { release(); }
    }
  });
  await Promise.all(workers);
}
const tClose = Date.now();
await (browser as Browser | null)?.close();
mark("close", tClose);
// The cache prunes itself on write (size and age, cache.ts). Recordings past UNTELL_RECORDINGS_DAYS lose their
// pictures here, at most once an hour (a stamp file in the recordings folder).
{
  const stamp = join(OUT, ".pruned");
  try {
    if (!existsSync(stamp) || Date.now() - statSync(stamp).mtimeMs > 3600000) { writeFileSync(stamp, ""); pruneRecordings(OUT); }
  } catch (e) { console.error(`recordings prune: ${String(e).split("\n")[0]}`); }
  if (!noCache) pruneSoon();
}
