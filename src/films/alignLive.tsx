// The kiln queue scene as the ui kit draws it now (Studio, 16:9), for untell snap. It is apart from align.tsx so that a
// change in the kit never breaks the align fixtures.
import * as ui from "../../examples/scenes/ui";
import { sceneEntry, type Entry } from "./blocks/film";

export const FILMS: Record<string, Entry> = {
  "align-kiln-live": sceneEntry(ui.scene, "studio", ui.seconds, 1920, 1080),
};
