// The kiln queue frame with every snap proposal accepted: the good fixture of the align/* checks. It starts as a copy of
// kilnQueue.ts; `bun scripts/snap/cli.ts align-kiln-snapped --films src/films/align.tsx --at 7 --apply all` wrote its SNAPS table.
// The nodes are the frozen ones (kiln-queue.nodes.json); only the snap table differs. Remove the table to get the bad case.
import type { Ctx, Node } from "../../../src/system/scene/types";
import NODES from "./kiln-queue.nodes.json";
import { withSnap, type SnapRel } from "../../../src/system/scene/align";

export const seconds = 9;
export const system = "studio";

const sceneBeforeSnap = (_ctx: Ctx, _B: unknown): Node[] => structuredClone(NODES) as Node[];

// untell snap: accepted alignment moves (bun scripts/snap/cli.ts --apply). Each entry moves its nodes so that
// one feature joins another node's feature: a relation, so it holds when the content changes. Remove an entry (or run
// --unapply <id>) to undo it.
export const SNAPS: SnapRel[] = [
  {"id":"c-6fuzz","move":["done-text"],"axis":"y","of":"done-text","feature":"bandCy","to":"done-panel.cy","kind":"centre","why":"The ink of done-text is 4.4 px above the centre of done-panel, which holds it with near-equal insets."},
  {"id":"c-b1152","move":["row1-title"],"axis":"y","of":"row1-title","feature":"bandCy","to":"row1-sel0.cy","kind":"centre","why":"The ink of row1-title is 4.4 px above the centre of row1-sel0, which holds it with near-equal insets."},
  {"id":"c-6pv38","move":["start-text"],"axis":"y","of":"start-text","feature":"bandCy","to":"start-face.cy","kind":"centre","why":"The ink of start-text is 4.4 px above the centre of start-face, which holds it with near-equal insets."},
  {"id":"c-j6qdc","move":["row0-initials"],"axis":"y","of":"row0-initials","feature":"bandCy","to":"row0-avatar.cy","kind":"centre","why":"The ink of row0-initials is 5.8 px above the centre of row0-avatar, which holds it with near-equal insets."},
  {"id":"c-k80mi","move":["row1-initials"],"axis":"y","of":"row1-initials","feature":"bandCy","to":"row1-avatar.cy","kind":"centre","why":"The ink of row1-initials is 5.8 px above the centre of row1-avatar, which holds it with near-equal insets."},
  {"id":"c-tp1f5","move":["row1-meta"],"axis":"y","of":"row1-meta","feature":"bandCy","to":"row1-sel0.cy","kind":"centre","why":"The ink of row1-meta is 5.8 px above the centre of row1-sel0, which holds it with near-equal insets."},
  {"id":"c-hg3f8","move":["row2-initials"],"axis":"y","of":"row2-initials","feature":"bandCy","to":"row2-avatar.cy","kind":"centre","why":"The ink of row2-initials is 5.8 px above the centre of row2-avatar, which holds it with near-equal insets."},
  {"id":"c-y3dmc","move":["row0-badge-text"],"axis":"y","of":"row0-badge-text","feature":"bandCy","to":"row0-badge-pill.cy","kind":"centre","why":"The ink of row0-badge-text is 5.8 px above the centre of row0-badge-pill, which holds it with near-equal insets."},
  {"id":"c-2hite","move":["row1-badge-text"],"axis":"y","of":"row1-badge-text","feature":"bandCy","to":"row1-badge-pill.cy","kind":"centre","why":"The ink of row1-badge-text is 5.8 px above the centre of row1-badge-pill, which holds it with near-equal insets."},
  {"id":"c-9asxs","move":["row2-badge-text"],"axis":"y","of":"row2-badge-text","feature":"bandCy","to":"row2-badge-pill.cy","kind":"centre","why":"The ink of row2-badge-text is 5.8 px above the centre of row2-badge-pill, which holds it with near-equal insets."},
  {"id":"e-z9v8g","move":["row0-meta"],"axis":"y","of":"row0-meta","feature":"bandCy","to":"row0-badge-pill.cy","kind":"edge","why":"The centre of row0-badge-pill is 5.8 px below the ink centre of row0-meta (a line 3 elements share); they are parts of one block"},
  {"id":"e-mnhhk","move":["row2-meta"],"axis":"y","of":"row2-meta","feature":"bandCy","to":"row2-badge-pill.cy","kind":"edge","why":"The centre of row2-badge-pill is 5.8 px below the ink centre of row2-meta (a line 3 elements share); they are parts of one block"},
  {"id":"e-15fa7","move":["row0-title"],"axis":"y","of":"row0-title","feature":"bandCy","to":"row0-avatar.cy","kind":"edge","why":"The ink centre of row0-title is 4.4 px above the centre of row0-avatar (a line 2 elements share); they are parts of one block."},
  {"id":"e-mm8kr","move":["row2-title"],"axis":"y","of":"row2-title","feature":"bandCy","to":"row2-avatar.cy","kind":"edge","why":"The ink centre of row2-title is 4.4 px above the centre of row2-avatar (a line 2 elements share); they are parts of one block."},
  {"id":"e-omogd","move":["tabs-*"],"axis":"y","of":"tabs-rule","feature":"line","to":"start-face.bottom","kind":"edge","why":"The bottom edge of start-face is 18 px below the line of tabs-rule (a line 2 elements share); they stand side by side in one container"},
  {"id":"h-7rpva","move":["tabs-underline"],"axis":"x","of":"tabs-underline","feature":"left","to":"d:0.3","kind":"half-px","why":"The left edge of tabs-underline sits at 513.7 under a transform: a soft edge, half a px wide."},
];
export const scene = withSnap(sceneBeforeSnap, SNAPS);
// end untell snap
