// The signature films: one per system, its hook, its signature moves and its end, built with its block map and default
// props (examples/scenes/signature.ts). Films, not demos: every detector rule applies.
// Record and check: bun scripts/detect.ts sig-<system> --films src/films/signature.tsx
import { SCENES, SECONDS, seconds } from "../../examples/scenes/signature";
import { sceneEntry, type Entry } from "./blocks/film";

export const FILMS: Record<string, Entry> = Object.fromEntries(Object.entries(SCENES).map(([id, scene]) => [`sig-${id}`, sceneEntry(scene, id, SECONDS[id] ?? seconds)]));
