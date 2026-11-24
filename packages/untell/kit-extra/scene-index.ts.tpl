// Template: written to <kit>/scene/index.ts by the pack script (only when the repository has no scene/index.ts).
// The scene API in one import: the node and context types, the blocks, and the snap table of untell snap.
//   import { withSnap, type SnapRel, type Ctx, type Node, type BLOCKS } from "../untell/scene";
export * from "./types";
export { BLOCKS } from "./blocks";
export { withSnap, applyMoves, type SnapRel, type Move } from "./align";
