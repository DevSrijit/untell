// Films that prove the design fixes of the defaults round: a code line in the narrow lower band (codeRest), and the
// block examples in the systems the round looked at. Record them with --films src/films/fixes.tsx.
import * as codeRest from "../../examples/scenes/codeRest";
import { filmsFor, type Entry } from "./blocks/film";

export const FILMS: Record<string, Entry> = {
  ...filmsFor("fix-codeRest", codeRest.scene, codeRest.seconds, { systems: ["manual", "console", "spec"] }),
};
