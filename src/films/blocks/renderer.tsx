// Renderer-level features: the system frame step and opaque rule, pinned nodes and tilt,
// light on pictures, ink passes, footage rate, clip shapes, sticker outlines and shadow bars.
import * as inks from "../../../examples/scenes/photoInks";
import * as light from "../../../examples/scenes/photoLight";
import * as shapes from "../../../examples/scenes/photoShapes";
import * as screen from "../../../examples/scenes/screenMotion";
import * as bars from "../../../examples/scenes/shadowBars";
import * as whip from "../../../examples/scenes/whip";
import { filmsFor } from "./film";

export const FILMS = {
  ...filmsFor("block-photoLight", light.scene, light.seconds, { systems: ["keynote"] }),
  ...filmsFor("block-photoInks", inks.scene, inks.seconds, { systems: ["riso", "cutout"] }),
  ...filmsFor("block-photoShapes", shapes.scene, shapes.seconds, { systems: ["pop"] }),
  ...filmsFor("block-shadowBars", bars.scene, bars.seconds, { systems: ["noir"] }),
  ...filmsFor("block-screenMotion", screen.scene, screen.seconds, { systems: ["graphite", "cutout", "riso", "console"] }),
  ...filmsFor("block-whip", whip.scene, whip.seconds, { systems: ["courtside"] }),
};
