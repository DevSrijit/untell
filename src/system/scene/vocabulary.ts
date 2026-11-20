// The motion vocabulary of each system: how a photo, a shape, a title and a text line come on and go off when
// the scene does not say. Blocks read their defaults here, so a scene gets the system's motion without
// rewriting tracks with `.map` (the patch that caused most one-frame accidents in the reels).
//
// Rules:
// - A prop that the scene gives wins over this table. `ctx.instant` (Raw, Console, Title) wins over both:
//   in a one-frame system everything cuts.
// - A system that this table does not name keeps the behaviour the blocks had before the table existed
//   (TODAY). vocabulary.test.ts checks this.
// - `opaque`: the system stamps things on and off at full opacity (paper and print: Cutout, Riso, Primary).
//   No opacity tween on a shape or a text line: a shape that slides or grows is opaque from its first frame.
//   The flag comes from `System.opaque` only. This table keeps no list of its own, so the blocks and the
//   renderers (time.ts, opaqueOf) always agree on which systems are opaque.
import type { Ctx } from "./types";
import { baseOf } from "../own";

/** How a photo comes on or goes off. "cut": in one frame. "dissolve": an opacity fade over the enter (or exit)
 *  duration. "rise": the picture moves up into place (or out) and fades, or stamps in an opaque system. "pop" (an
 *  entrance): the picture grows from 0.9 to its size on the system's enter curve, past it and back where the curve
 *  overshoots (Pop), as it fades in. */
export type PhotoMove = "cut" | "dissolve" | "rise" | "pop";
/** How a shape enters. See blocks/shape.ts. "fade": opacity only, no scale and no move. */
export type ShapeEnter = "grow" | "draw" | "slide" | "cut" | "fade";
/** How a title shows. "line": each line rises out of its mask. "word": the words fade in one by one.
 *  "fade": the whole title fades in as one unit. "cut": the whole title shows in one frame. */
export type TitleReveal = "line" | "word" | "fade" | "cut";
/** How a text block shows. "rise": fade and a 12 px rise. "fade": opacity only. "cut": in one frame. */
export type TextReveal = "rise" | "fade" | "cut";
/** How a code block's rows come on after frame 0 (blocks/codeBlock.ts). "rise": out of their masks, a stagger apart.
 *  "rest": in one frame. "type": typed at a human rate. */
export type CodeEnter = "rise" | "rest" | "type";
/** What a block does when its text does not fit in its role (blocks/fit.ts): step down a role and warn, keep the role
 *  and wrap, or throw. */
export type FitPolicy = "shrink" | "wrap" | "throw";

export type Vocabulary = {
  photo: { enter: PhotoMove; exit: PhotoMove };
  shape: ShapeEnter;
  title: TitleReveal;
  text: TextReveal;
  code: CodeEnter;
  fit: FitPolicy;
  /** Stamp opaque: no opacity tween on shapes and text in this system. */
  opaque: boolean;
};

/** What the blocks did before this table: the default for a system that the table does not name. */
export const TODAY: Vocabulary = { photo: { enter: "cut", exit: "cut" }, shape: "grow", title: "line", text: "rise", code: "rise", fit: "shrink", opaque: false };

const fade: Partial<Vocabulary> = { photo: { enter: "dissolve", exit: "dissolve" }, shape: "fade", title: "fade", text: "fade" };
const cut: Partial<Vocabulary> = { photo: { enter: "cut", exit: "cut" } };
const stamp: Partial<Omit<Vocabulary, "opaque">> = { photo: { enter: "cut", exit: "cut" }, shape: "cut", text: "cut" };

/**
 * The systems with a vocabulary of their own, from their SYSTEM.md motion and transitions:
 * - Ma and Nocturne fade: slow dissolves through the paper or the dark, type that fades, never rises.
 * - Studio masks its type (the title rises out of its mask), and cuts its pictures on a held frame.
 * - Raw, Console, Title and Kinetic cut their pictures.
 * - Cutout, Riso and Primary stamp opaque: shapes and text are on or off, never half seen.
 * - Code rises in every system after frame 0 (`code`). Manual's block map asks for `enter: "type"` by name: a typed
 *   block's highlights must wait for their rows, so a default that types would break a scene's highlight times.
 */
export const VOCABULARY: Record<string, Partial<Omit<Vocabulary, "opaque">>> = {
  ma: fade,
  nocturne: fade,
  studio: { title: "line", photo: { enter: "cut", exit: "cut" } },
  raw: cut,
  console: cut,
  title: cut,
  kinetic: cut,
  cutout: stamp,
  riso: stamp,
  primary: stamp,
};

/** The vocabulary of the context's system: the system's own entries over TODAY. `opaque` is System.opaque. */
export function vocabulary(ctx: Pick<Ctx, "system">): Vocabulary {
  const v = VOCABULARY[baseOf(ctx.system.id)] ?? {};
  return { ...TODAY, ...v, photo: { ...TODAY.photo, ...v.photo }, opaque: ctx.system.opaque ?? false };
}
