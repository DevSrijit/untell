// The project's own design systems. `untell system new <name> --from <id>` copies a built-in system into the
// project (systems/<name>/system.ts, beside the films folder) and lists it in own.gen.ts. Each one joins the kit's
// tables here: SYSTEMS, DIRECTION and MEDIA_SPEC read OWN_SYSTEMS, so every block, renderer and check accepts its id.
// The tables of a block's own hand (hand.ts, vocabulary.ts, signature.ts, wipe.ts) are keyed by the built-in id: an
// own system draws in the hand of the system it came from (`from`), through baseOf. Leave `from` out to draw in the
// plain hand.
import type { Direction } from "./direction";
import type { MediaSpec } from "./media-spec";
import type { System } from "./systems";
import { OWN_SYSTEMS } from "./own.gen";

/** One system of the project: the system's values, its direction, its media, and the built-in it came from. */
export type OwnSystem = {
  /** The built-in system it was copied from. Its block hands (charts, words, wipes, code) follow that system. */
  from?: string;
  system: System;
  direction: Direction;
  /** The grade, pictures, footage and sound. Default: the media of `from`. */
  media?: MediaSpec;
};

/** The project's own systems, as own.gen.ts lists them. */
export const ownSystems = (): OwnSystem[] => OWN_SYSTEMS;

/** The id whose block hands a system uses: the built-in it came from, or its own id. */
export const baseOf = (id: string): string => OWN_SYSTEMS.find((o) => o.system.id === id)?.from ?? id;
