// The default end of a film in each system: endCard with a name, a line and a real mark, and no other props, so the
// system's end look (Direction `ends.look`) decides the name's role, the mark's size and the unit's place. The mark is
// the system's subject: a product model in the product systems (Studio, Keynote, Matte), a prepared cut-out in the
// picture systems, a drawn shape in the rest. "Ovenri" is a fictional name.
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Mark } from "../../src/system/scene/blocks/lockup";
import { standing } from "../../src/system/three/models";
import type { Ctx, Node } from "../../src/system/scene/types";

export const seconds = 3;

/** The mark each system ends on. */
export function endMark(system: string): Mark {
  if (["studio", "keynote", "matte"].includes(system)) return { objects: [standing("lamp", "model-lantern", { height: 2.6 })] };
  const picture: Record<string, string> = { noir: "noir-bridge", courtside: "athlete-back", riso: "riso-brayer-hands", ma: "ma-palm", nocturne: "nocturne-rain", title: "title-beam" };
  if (picture[system]) return { media: picture[system]! };
  return system === "pop" || system === "primary" ? "circle" : "square";
}

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] =>
  B.endCard({ id: "card", name: "Ovenri", line: "Light you carry.", mark: endMark(ctx.system.id), at: 0.5, until: seconds }, ctx);
