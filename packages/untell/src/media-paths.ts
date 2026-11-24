// Where the media tools read and write in a project. Pure functions: the unit tests call them directly.
//
//   the media folder   public/media/<name>/ (Remotion serves public/ through staticFile)
//                      assets/media/<name>/ (HyperFrames serves the project root)
//   the manifest       untell-media.json at the project root: each asset's kind, file and the user's notes
//   the media table    <kit>/media.gen.ts, which the photo, music and hit blocks import
//   the lock           .untell/media.lock (a folder; mkdir is atomic)
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { detectFramework, type Framework } from "./detect";
import { KIT_DIR } from "./kit";

export type MediaKind = "photo" | "video" | "music" | "sfx" | "model" | "mark";
export const KINDS: MediaKind[] = ["photo", "video", "music", "sfx", "model", "mark"];

/** The media folder of each framework, relative to the project root. */
export const MEDIA_DIR: Record<Framework, string> = { remotion: "public/media", hyperframes: "assets/media" };
export const MANIFEST = "untell-media.json";

export type MediaPaths = { framework: Framework; kit: string; mediaRel: string; media: string; manifest: string; table: string; lock: string; work: string };

/**
 * The paths for the project. The kit folder decides the framework (src/untell is Remotion, untell is
 * HyperFrames), because a project can have both markers. Without a kit, the project's markers decide.
 */
export function mediaPaths(project: string, framework?: Framework): MediaPaths {
  const fw = framework
    ?? (existsSync(join(project, KIT_DIR.remotion)) ? "remotion" : existsSync(join(project, KIT_DIR.hyperframes)) ? "hyperframes" : null)
    ?? (() => { const d = detectFramework(project); return d === "both" || d === null ? null : d; })();
  if (!fw) throw new Error("No untell kit here (src/untell/ or untell/). Run untell init first.");
  const kit = KIT_DIR[fw];
  return {
    framework: fw,
    kit,
    mediaRel: MEDIA_DIR[fw],
    media: join(project, MEDIA_DIR[fw]),
    manifest: join(project, MANIFEST),
    table: join(project, kit, "media.gen.ts"),
    lock: join(project, ".untell", "media.lock"),
    work: join(project, ".untell"),
  };
}

/** The media paths, or null in a folder with no untell kit and no Remotion or HyperFrames project. */
export function mediaPathsOrNull(project: string): MediaPaths | null {
  try { return mediaPaths(project); } catch { return null; }
}

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** An asset name is a folder name: lower-case letters, digits and hyphens, at most 64. It never holds a path. */
export function checkName(name: string | undefined): string {
  if (!name || !NAME.test(name)) throw new Error(`"${name ?? ""}" is not an asset name. Use lower-case letters, digits and hyphens (such as athlete-back).`);
  return name;
}

const EXT: Record<string, MediaKind | "audio"> = {
  ".jpg": "photo", ".jpeg": "photo", ".png": "photo", ".webp": "photo",
  ".mp4": "video", ".mov": "video", ".webm": "video", ".m4v": "video",
  ".mp3": "audio", ".wav": "audio", ".m4a": "audio", ".aac": "audio", ".ogg": "audio", ".flac": "audio", ".opus": "audio",
  ".glb": "model", ".gltf": "model",
  ".svg": "mark",
};
/** The kind a file extension gives, "audio" for a sound (music or effect), or null for a format untell does not take. */
export const kindOfExt = (ext: string): MediaKind | "audio" | null => EXT[ext.toLowerCase()] ?? null;
/** The extension untell stores a file under: ".jpeg" becomes ".jpg"; the others stay. */
export const storedExt = (ext: string) => (ext.toLowerCase() === ".jpeg" ? ".jpg" : ext.toLowerCase());

const MIME: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm",
  "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/mp4": ".m4a", "audio/aac": ".aac",
  "audio/ogg": ".ogg", "audio/flac": ".flac", "model/gltf-binary": ".glb", "model/gltf+json": ".gltf", "image/svg+xml": ".svg",
};
/** The extension of a URL's file: from its path, else from the response's content type. */
export function extOfUrl(url: string, contentType: string | null): string | null {
  const fromPath = extname(new URL(url).pathname);
  if (fromPath && kindOfExt(fromPath)) return fromPath;
  const mime = (contentType ?? "").split(";")[0]!.trim().toLowerCase();
  return MIME[mime] ?? null;
}

/** A sound longer than this is music when the user does not give --kind. */
export const MUSIC_MIN_SECONDS = 20;
