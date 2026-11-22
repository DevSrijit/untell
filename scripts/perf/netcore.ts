// A local copy of the few network files that a film page loads: web font files (the Remotion font loaders fetch
// them from the fonts service) and the GSAP scripts of a HyperFrames page (from a CDN). Every run starts a
// browser with an empty profile, so without this copy every page open fetched them again over the network.
// That cost time, and on a slow or failed fetch a font could miss its load and a frame could show a fallback face.
//
// The copy is keyed by the full URL. The bytes are the bytes the server sent, so the page draws the same thing.
// The font and CDN URLs carry a version in their path, so a URL names one file for good.
// Node-safe (the folder is an argument): the repository binds it to its cache in netcache.ts, and the package to a project's.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { BrowserContext, Page } from "playwright-core";

// Only hosts whose URLs name a fixed file: font files carry a version in their path, CDN scripts a package
// version. The fonts service's CSS URLs are not versioned, so they are not kept.
const HOSTS = /^https:\/\/(fonts\.gstatic\.com|cdn\.jsdelivr\.net|unpkg\.com)\//;

/** Serves the hosts above from .untell/cache/net. A file not in the copy is fetched once and kept. */
export async function useNetCacheAt(target: BrowserContext | Page, dir: string) {
  mkdirSync(dir, { recursive: true });
  await target.route(HOSTS, async (route) => {
    const url = route.request().url();
    const key = createHash("sha256").update(url).digest("hex");
    const body = join(dir, key), meta = join(dir, `${key}.json`);
    if (!existsSync(body) || !existsSync(meta)) {
      const r = await route.fetch().catch(() => null);
      if (!r || r.status() !== 200) return r ? route.fulfill({ response: r }) : route.abort();
      // Write to a temporary name first: another process may read the same file now.
      const tmp = `${body}.${process.pid}`;
      writeFileSync(tmp, await r.body());
      writeFileSync(`${meta}.${process.pid}`, JSON.stringify({ url, headers: { "content-type": r.headers()["content-type"] ?? "application/octet-stream", "access-control-allow-origin": "*" } }));
      renameSync(tmp, body);
      renameSync(`${meta}.${process.pid}`, meta);
    }
    const { headers } = JSON.parse(readFileSync(meta, "utf8"));
    await route.fulfill({ status: 200, headers, body: readFileSync(body) });
  });
}
