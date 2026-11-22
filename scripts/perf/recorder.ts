// The recorder's frame loop and page setup, shared by the repository's scripts/record.ts and the package's recorder
// (packages/untell/src/record.ts). One copy of the code: what the repository measured and proved is
// what a project runs. Node-safe: no import.meta, no Bun API, no work at import time.
//
//   openHf(page, html, ...)     opens a HyperFrames page and sets up __meta and __seek, as HyperFrames renders it.
//   recordRange(page, a, b, r)  records frames a..b-1 on one page: the seek, both samplers, the screenshot, the
//                               copy of a frame that the scene keys as the same as the one before, the frame cache.
//   shot(page, type)            a screenshot that must have the film's size (the size guard).
//   installParts(work, dir)     moves a finished recording from its work folder into place.
// The page side of a Remotion film is scripts/perf/player.tsx (the commit seek, the frame keys, the throw detection).
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright-core";
import { imageSize, sizeIs } from "./imagesize";
import { link } from "./cachecore";

/** A lossless key frame (frames-png/) every this many frames: 2 per second at 30 fps. */
export const PNG_EVERY = 15;
export const JPEG_Q = 88;

export const pad = (f: number) => String(f).padStart(4, "0");

/** A screenshot of the viewport. caret "initial" gives the same bytes here (no film has a text cursor) and skips the
 *  style that Playwright adds and removes on every call to hide the cursor. A raw DevTools call was 1 ms faster and
 *  drew a wide film wrongly (out/perf/RESULT.md), so it is not used. */
export async function shot(page: Page, type: "jpeg" | "png") {
  const size = page.viewportSize()!;
  for (let attempt = 0; ; attempt++) {
    const buf = await page.screenshot(type === "jpeg" ? { type: "jpeg", quality: JPEG_Q, caret: "initial" } : { type: "png", caret: "initial" });
    // Every picture must have the film's size. A wrong size (a wide film taken at the window's 1920 x 993 was one
    // such fault) is a wrong frame: set the size again and take it again, then fail rather than write it.
    const got = imageSize(buf);
    if (got && got.width === size.width && got.height === size.height) return buf;
    if (attempt >= 1) throw new Error(`screenshot is ${got?.width}x${got?.height}, the film is ${size.width}x${size.height}`);
    await page.setViewportSize(size);
  }
}
/** A cached picture is used only when it has the film's size. */
export const cachedOk = (path: string, w: number, h: number) => existsSync(path) && sizeIs(readFileSync(path), w, h);

/** Moves the files `parts` of a finished recording from `work` into `dir`. Other files in `dir` stay. `to` can send a
 *  part elsewhere (null: leave it out). */
export function installParts(work: string, dir: string, parts: string[], to: (part: string) => string | null = (p) => join(dir, p)) {
  mkdirSync(dir, { recursive: true });
  for (const p of parts) {
    const dst = to(p);
    if (!dst) continue;
    mkdirSync(dirname(dst), { recursive: true });
    rmSync(dst, { recursive: true, force: true });
    if (existsSync(join(work, p))) renameSync(join(work, p), dst);
  }
  rmSync(work, { recursive: true, force: true });
}

type HfWin = Window & { __meta: unknown; __seek: (f: number) => Promise<void>; __timelines: Record<string, { seek: (t: number, s: boolean) => void }>;
  __frameKey: (f: number) => string | null; __pixelKey: (f: number) => Promise<string | null>; __untellFrameKey?: (f: number) => string | null; __viaRuntime: boolean };

const withRuntime = new WeakSet<Page>();
/**
 * Opens a HyperFrames page and seeks its paused GSAP timeline (window.__timelines.main), the same way HyperFrames
 * renders. With `runtime` (HyperFrames' page runtime, as its renderer injects it at the start of <head>), the seek goes
 * through renderSeek, which also moves every <video> and <audio> clip. `keys`: frames are keyed by the scene's own
 * __untellFrameKey (a page that untell build wrote); without it every frame is drawn. `hash` goes after the URL.
 * Returns true when the seek runs through the runtime.
 */
export async function openHf(page: Page, html: string, runtime: string | null, o: { keys?: boolean; hash?: string; timeout?: number } = {}): Promise<boolean> {
  // An init script stays on the page for every later load, so add it once per page.
  if (runtime && !withRuntime.has(page)) { await page.addInitScript({ path: runtime }); withRuntime.add(page); }
  await page.goto(pathToFileURL(html).href + (o.hash ?? ""));
  // A film may build after its fonts load; it registers its timeline when the build is done. With the
  // runtime, also wait until it is ready to render (it binds the timeline and its media then).
  await page.waitForFunction((rt) => !!(window as unknown as { __timelines?: Record<string, unknown> }).__timelines?.main &&
    (!rt || (window as unknown as { __renderReady?: boolean }).__renderReady === true), !!runtime, { timeout: o.timeout ?? 20000, polling: 100 });
  return page.evaluate(async (keys) => {
    await document.fonts.ready;
    const root = document.querySelector("[data-composition-id]")!;
    const fps = 30;
    const n = (k: string) => Number(root.getAttribute(k));
    const w = window as unknown as HfWin;
    w.__meta = { fps, width: n("data-width"), height: n("data-height"), durationInFrames: Math.round(n("data-duration") * fps) };
    const hf = window as unknown as { __player?: { renderSeek?: (t: number) => void; enableRenderMode?: () => void }; __hfWaitForSeekCompletion?: () => Promise<void> };
    // Through the runtime (as HyperFrames renders): render mode, then renderSeek moves the timelines and
    // every <video> and <audio> clip to the time; the wait covers the media seeks.
    const viaRuntime = typeof hf.__player?.renderSeek === "function";
    if (viaRuntime) hf.__player!.enableRenderMode?.();
    w.__viaRuntime = viaRuntime;
    w.__seek = async (f: number) => {
      if (viaRuntime) { hf.__player!.renderSeek!(f / fps); await hf.__hfWaitForSeekCompletion?.(); }
      // The paused GSAP timeline too: after renderSeek alone, the DOM that a sampler reads in the same task still
      // held frame 0's transforms (a turned beam read as at rest), though the screenshot showed the frame.
      w.__timelines.main!.seek(f / fps, false);
      // HyperFrames' seek protocol for canvas and 3D: an hf-seek event with the time; work that the
      // page must finish first (a GPU submit) is handed back through waitUntil.
      const waits: Promise<unknown>[] = [];
      window.dispatchEvent(new CustomEvent("hf-seek", { detail: { time: f / fps, waitUntil: (p: Promise<unknown>) => waits.push(p) } }));
      await Promise.all(waits);
      // Two animation frames, as before. (They cost 33 ms of idle time per frame. Dropping them where the page
      // has no canvas or video is not proved equal yet: on the Remotion side, scale tweens needed them.)
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    };
    // A HyperFrames page has no scene keys, unless untell build wrote it (__untellFrameKey): then a frame that the
    // scene keys as the frame before is copied. The frame cache needs a pixel key, which this page does not have.
    w.__frameKey = keys && typeof w.__untellFrameKey === "function" ? (f: number) => w.__untellFrameKey!(f) : () => null;
    w.__pixelKey = async () => null;
    return viaRuntime;
  }, !!o.keys);
}

type Stats = { drawn: number; reused: number; fromCache: number; retried: number };

/** What recordRange writes into and reads from. One per recording, shared by its pages. */
export type RangeRun = {
  id: string;
  meta: { width: number; height: number; fps: number; durationInFrames: number };
  /** The folders of the recording in progress: frames/ (JPEG) and frames-png/ (key frames). */
  frames: string; pngs: string;
  tracks: unknown[]; elements: unknown[];
  st: Stats;
  /** Pending writes; recordRange waits for them before a copy reads a file. */
  writes: Promise<unknown>[];
  noReuse: boolean; noCache: boolean; layoutOnly: boolean;
  /** False when the frame cache must not be used (several pages draw one film). */
  exact: () => boolean;
  /** The frame cache path of a pixel key, or null for no frame cache. */
  frameKey: ((pk: string, kind: "jpeg" | "png") => string) | null;
  /** A frame must hold its key for more than this many frames before it is copied (0: copy at once). */
  settle?: number;
  /** Runs after each frame, drawn or copied, on the page that shows it (the detector's capture samplers). */
  after?: (page: Page, f: number) => Promise<void>;
  log: (s: string) => void;
};

/** Writes a picture to the recording and, for a keyed frame, to the frame cache. */
const put = (r: RangeRun, path: string, buf: Buffer, cached: string | null) => {
  r.writes.push(writeFile(path, buf).then(() => { if (cached && !existsSync(cached)) { const tmp = `${cached}.${process.pid}`; link(path, tmp); renameSync(tmp, cached); } }));
};

/** Records frames a..b-1 on one page into r.tracks and r.elements (indexed by frame). */
export async function recordRange(page: Page, a: number, b: number, r: RangeRun) {
  let lastKey: string | null = null, lastF = -1, lastT: unknown = null, lastE: unknown = null, held = 0;
  const w = r.meta.width, h = r.meta.height;
  // A range that starts inside the film first plays the three frames before its start, without taking them,
  // so Chrome has the same recent history (raster scale) as a page that played the film from frame 0.
  for (let k = Math.max(0, a - 3); k < a; k++) await page.evaluate((n) => (window as unknown as HfWin).__seek(n), k);
  for (let f = a; f < b; f++) {
    const key = r.noReuse ? null : await page.evaluate((n) => (window as unknown as HfWin).__frameKey(n), f);
    const jpg = join(r.frames, `f${pad(f)}.jpg`), png = join(r.pngs, `f${pad(f)}.png`);
    held = key !== null && key === lastKey ? held + 1 : 0;
    // The same frame as the one before: copy it. The page still shows frame lastF, which draws the same.
    if (key !== null && key === lastKey && held > (r.settle ?? 0)) {
      r.tracks[f] = lastT;
      r.elements[f] = lastE;
      await Promise.all(r.writes.splice(0));
      if (!r.layoutOnly) {
        // A hard link: the same picture under the frame's name, counted once on disk.
        link(join(r.frames, `f${pad(lastF)}.jpg`), jpg);
        if (f % PNG_EVERY === 0) put(r, png, await shot(page, "png"), null);
      }
      r.st.reused++;
      if (r.after) await r.after(page, f);
      continue;
    }
    // Seek and sample in one call. A seek that fails (footage not ready, no commit) is tried again from
    // another frame, up to three times; then the run fails rather than record a wrong frame. A film that throws
    // fails at once: the seek names the film's error (player.tsx), and trying again draws the same error.
    let te: [unknown, unknown] | null = null;
    for (let attempt = 0; ; attempt++) {
      try {
        te = await page.evaluate(async (n) => { const x = window as unknown as HfWin & { __sample: () => unknown; __sampleElements: () => unknown }; await x.__seek(n); return [x.__sample(), x.__sampleElements()] as [unknown, unknown]; }, f);
        break;
      } catch (e) {
        const why = String(e).split("\n")[0]!.replace(/^(Error: )?page\.evaluate: (Error: )?/, "");
        if (/the film threw/.test(why)) throw new Error(`${r.id}: ${why}. Fix the scene at that error, then run the command again.`);
        if (attempt >= 2) throw new Error(`${r.id}: frame ${f} failed three times: ${why}`);
        r.log(`${r.id}: frame ${f}: ${String(e).split("\n")[0]}; trying again`);
        r.st.retried++;
        await page.evaluate((n) => (window as unknown as HfWin).__seek(n).catch(() => {}), Math.max(0, f - 1));
      }
    }
    r.tracks[f] = te![0];
    r.elements[f] = te![1];
    if (!r.layoutOnly) {
      // The frame cache: not for a frame where a scale, rotation or tilt changes. Its pixels depend on the
      // frames before it (Chrome's raster scale), so the same nodes need not draw the same pixels.
      const pk = r.noCache || !r.exact() || !r.frameKey ? null
        : await page.evaluate(async (n) => { const x = window as unknown as HfWin & { __moves?: (f: number) => boolean }; return x.__moves?.(n) ? null : x.__pixelKey(n); }, f);
      const cj = pk ? r.frameKey!(pk, "jpeg") : null;
      if (cj && cachedOk(cj, w, h)) { link(cj, jpg); r.st.fromCache++; }
      else { put(r, jpg, await shot(page, "jpeg"), cj); r.st.drawn++; }
      if (f % PNG_EVERY === 0) {
        const cp = pk ? r.frameKey!(pk, "png") : null;
        if (cp && cachedOk(cp, w, h)) link(cp, png); else put(r, png, await shot(page, "png"), cp);
      }
    } else r.st.drawn++;
    lastKey = key; lastF = f; lastT = te![0]; lastE = te![1];
    if (r.after) await r.after(page, f);
  }
}
