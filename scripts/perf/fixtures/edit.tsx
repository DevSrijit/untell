// The bench fixture for incremental work: the text scene ("edit-a"), and the same scene after a one-line edit
// ("edit-b": the words of the line that enters at 4.6 s change). Recording edit-a and then edit-b shows how
// much of a second check the frame cache saves.
import { scene } from "../../../examples/scenes/text";
import { sceneEntry, type Entry, type Scene } from "../../../src/films/blocks/film";

const edited: Scene = (ctx, B) => scene(ctx, B).map((n) => (n.kind === "text" && n.id.startsWith("body2") ? { ...n, text: "The same trip, in a blink." } : n));

export const FILMS: Record<string, Entry> = {
  "edit-a": sceneEntry(scene, "spec", 7),
  "edit-b": sceneEntry(edited, "spec", 7),
};
