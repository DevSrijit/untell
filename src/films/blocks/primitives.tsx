// The primitives group: text, title, rule, bar, typeOn, cross and frameGrid, each in the demo
// systems (Spec, Graphite, Pop) and at 16:9. Title, typeOn and frameGrid also run in Console, a
// one-frame system.
import { scene as bar } from "../../../examples/scenes/bar";
import { scene as cross } from "../../../examples/scenes/cross";
import { scene as frameGrid } from "../../../examples/scenes/frameGrid";
import { scene as rule } from "../../../examples/scenes/rule";
import { scene as text } from "../../../examples/scenes/text";
import { scene as title } from "../../../examples/scenes/title";
import { scene as typeOn } from "../../../examples/scenes/typeOn";
import { DEMO_SYSTEMS, filmsFor, type Entry } from "./film";

const withConsole = [...DEMO_SYSTEMS, "console"];

export const FILMS: Record<string, Entry> = {
  ...filmsFor("block-text", text, 7, { wide: true }),
  ...filmsFor("block-title", title, 8, { wide: true, systems: withConsole }),
  ...filmsFor("block-rule", rule, 6.5, { wide: true }),
  ...filmsFor("block-bar", bar, 6, { wide: true }),
  ...filmsFor("block-typeOn", typeOn, 8, { wide: true, systems: withConsole }),
  ...filmsFor("block-cross", cross, 6.5, { wide: true }),
  ...filmsFor("block-frameGrid", frameGrid, 6, { wide: true, systems: withConsole }),
};
