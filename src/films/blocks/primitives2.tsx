// Films for the primitives and the system signatures. The pane scene (terminal, code and a
// picture window with shared edges), the code block's signature highlight (Manual's teal tint), the drawn
// primitives on a sheet (gear, belt, callout, dimension, formula), the ui kit, and two effects (floor reflection,
// scanlines).
import * as drivetrain from "../../../examples/scenes/drivetrain";
import * as pane from "../../../examples/scenes/pane";
import * as ui from "../../../examples/scenes/ui";
import { scene as codeBlock } from "../../../examples/scenes/codeBlock";
import * as floorReflection from "../../../examples/scenes/floorReflection";
import * as scanlines from "../../../examples/scenes/scanlines";
import * as rule72 from "../../../examples/scenes/rule72";
import { filmsFor, sceneEntry } from "./film";

export const FILMS = {
  ...filmsFor("block-drivetrain", drivetrain.scene, drivetrain.seconds, { wide: true, systems: ["schematic", "spec", "console", "pop"] }),
  ...filmsFor("block-pane", pane.scene, pane.seconds, { wide: true, systems: ["console", "manual", "graphite", "spec"] }),
  ...filmsFor("block-ui", ui.scene, ui.seconds, { wide: true, systems: ["graphite", "studio", "pop", "console"] }),
  // A case from a review: Studio at 16:9 (the toolbar, the pills and the ink-centred labels).
  "block-ui-studio-wide": sceneEntry(ui.scene, "studio", ui.seconds, 1920, 1080, { demo: true }),
  // The package's example film, in Riso as it ships: the case for the contrast and edge findings.
  "block-rule72-riso": sceneEntry(rule72.scene, "riso", rule72.seconds, 1080, 1920, { demo: true }),
  ...filmsFor("block-codeBlock-sig", codeBlock, 10.5, { systems: ["manual", "spec"] }),
  // The effects: Matte's floor reflection (Studio, which does not allow it, draws none), Console's scanlines.
  ...filmsFor("block-floorReflection", floorReflection.scene, floorReflection.seconds, { systems: ["matte", "studio"] }),
  ...filmsFor("block-scanlines", scanlines.scene, scanlines.seconds, { systems: ["console", "spec"] }),
};
