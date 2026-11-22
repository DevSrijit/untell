// A local copy of the few network files that a film page loads: web font files (the Remotion font loaders fetch
// them from the fonts service) and the GSAP scripts of a HyperFrames page (from a CDN). Every run starts a
// browser with an empty profile, so without this copy every page open fetched them again over the network.
// That cost time, and on a slow or failed fetch a font could miss its load and a frame could show a fallback face.
//
// The copy is keyed by the full URL. The bytes are the bytes the server sent, so the page draws the same thing.
// The font and CDN URLs carry a version in their path, so a URL names one file for good.
import type { BrowserContext, Page } from "playwright-core";
import { join } from "node:path";
import { CACHE } from "./cache";
import { useNetCacheAt } from "./netcore";

/** Serves the font and CDN hosts from .untell/cache/net (the code is in netcore.ts, shared with the package). */
export const useNetCache = (target: BrowserContext | Page) => useNetCacheAt(target, join(CACHE, "net"));
