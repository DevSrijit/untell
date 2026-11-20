// The scene model. A block is a pure function: props + context -> nodes. A node is something drawn
// (text, a rectangle, a path, a circle) with static properties and keyframe tracks over time.
// Renderers turn nodes into pixels: Remotion evaluates the tracks at each frame (renderers/remotion.tsx);
// HyperFrames compiles them into GSAP tweens on a paused timeline (renderers/hyperframes.ts).
// Nothing here knows about React, the DOM or GSAP.
import type { ColorRole } from "./roles";
import type { System, TypeRole } from "../systems";

/** How a segment of a track moves. The first three come from the system; "linear" is for constant
 *  motion (a sweep, a scroll); "step" jumps at the segment's end, for typing and one-frame systems. */
export type Curve = "enter" | "move" | "exit" | "linear" | "step";

/** A keyframe: at time t (seconds) the property has value v. The segment that ends here uses `curve`. */
export type Key = { t: number; v: number; curve?: Curve };

/**
 * Animatable properties. All are transforms, opacity or a stroke reveal, so both renderers stay cheap
 * and the HyperFrames motion check reads them as ordinary tweens.
 * - opacity: 0 hides the node completely (visibility hidden too).
 * - x, y: offsets in px from the node's position.
 * - scale, scaleX, scaleY, rotate (degrees): about the node's origin.
 * - draw: 0-1, how much of a path's stroke shows, from its start.
 * - reveal: a masked line's offset in % of its height (100 below the mask, 0 shown, -100 gone above).
 * - tiltX, tiltY (degrees): a turn about the node's horizontal or vertical axis, seen with a fixed perspective
 *   (layout.perspectiveOf). A positive tiltY turns the right edge away. Only boxes, text, pictures and the camera
 *   tilt; lines and circles ignore it. Keep it slight (Graphite: 4-6 degrees) and ease it back to 0 at rest.
 * - blurX, blurY (camera only, px): directional motion blur of the whole view, for a whip (motion-blur). Both
 *   renderers apply one SVG Gaussian blur with these two deviations. Make it with screen.whip, which keeps it to
 *   the frames of a fast move, in a system that allows "motion-blur".
 */
export type Prop = "opacity" | "x" | "y" | "scale" | "scaleX" | "scaleY" | "rotate" | "draw" | "reveal" | "tiltX" | "tiltY" | "blurX" | "blurY";
export type Tracks = Partial<Record<Prop, Key[]>>;

/** Where scale and rotation pivot, as fractions of the node's box. */
export type Origin = [number, number];

type Base = {
  id: string; tracks?: Tracks; origin?: Origin;
  /**
   * Alignment tags (optional): the group, row and column a block lays this node out in. The alignment model
   * (scene/align.ts) reads them before it guesses from geometry: two nodes of one row (y), one column (x) or one
   * group make a near miss an error; two rows (or two columns) of one group are apart by design. Ids are free
   * strings, unique in the block call: `${id}-r2`, `${id}-c1`. A group also names the parts that enter as one
   * designed gesture (a chart's bars, a counter's digits, a table's rows): the motion checks count it as one mover.
   */
  group?: string; row?: string; col?: string;
  /** The panel of a pane, a terminal, a code block or a window: picture for the space checks (dead-space counts the
   *  frame it covers as filled), even in a tone close to the ground. Set by the blocks that draw a panel. */
  pane?: boolean;
  /**
   * Layer: -1 is a backdrop (a panel behind content), 0 is content (the default), 1 is an overlay
   * (an annotation arrow, a wipe). A higher layer draws above everything in a lower one. Inside a
   * layer, lines and circles draw first, then boxes, then text.
   */
  layer?: number;
  /** z order inside a layer and kind; higher draws on top. */
  z?: number;
  /** The block that drew the node (the guard sets it). The checks read it to know a system's signature move (Direction
   *  move `allows`). */
  block?: string;
  /**
   * The UI state the node shows while it is visible: "selected" (a selected row's plate, bar and its text in the
   * selected colour), "active" (an active tab's label and underline), "disabled". Both renderers write it as
   * `data-state`, so a check can see two selected rows at once.
   */
  state?: "selected" | "active" | "disabled";
  /**
   * The node turns about a point away from its own centre on purpose (a wedge about a circle's centre, a
   * gear on a panning sheet). HyperFrames' check then accepts its moving centre (data-layout-allow-orbit).
   */
  orbit?: boolean;
  /**
   * How the node mixes with what is under it. "multiply" darkens like ink printed over ink (Riso
   * overprint). Both renderers apply it with CSS mix-blend-mode, also on a picture. A line or circle with a blend gets
   * its own SVG, so it mixes with everything below it, not only with the shapes in its SVG.
   */
  blend?: "multiply";
  /**
   * Screen space: the node does not move with the camera. Both renderers draw pinned nodes in a layer above the
   * camera's world, in their own draw order. Use it for a caption or a status line that rides through a pan or
   * a zoom, so text never has to leave for a move (hard rule 11).
   */
  pinned?: boolean;
};

export type TextNode = Base & {
  kind: "text";
  x: number; // left edge of the text box, px
  y: number; // top edge, px
  text: string;
  role: TypeRole;
  color: ColorRole;
  /** Clip the text to its own line box, so "reveal" slides it in and out of view. */
  mask?: boolean;
  /** Set when the box must have a fixed width (wrapping is never used: lines are explicit). */
  width?: number;
  align?: "left" | "right" | "center"; // within `width`
  /** Keep the case as written, also in a role that the system sets in capitals. Use it for maths and units ("π r²"). */
  keepCase?: boolean;
  /**
   * A font weight other than the role's (a bold command over regular output). It must be a weight the system
   * loads for the role's family (layout.loadedWeights); any other weight throws. Measure the text with the
   * same weight: ctx.measure(text, role, { weight }).
   */
  weight?: number;
  /**
   * The true italic face of the role's family at the text's weight. Only a face that has one may set it
   * (layout.hasItalic, from italics.gen.ts); any other throws, because the browser would slant the upright face.
   * Measure the text the same way: ctx.measure(text, role, { italic: true }).
   */
  italic?: boolean;
  /**
   * What the text is, for the density rule: "prose" (the default) counts against the system's word limit; "code"
   * (code, terminal commands and output) and "data" (chart and diagram labels, numbers) do not. codeBlock and
   * terminal set "code".
   */
  content?: "prose" | "code" | "data";
};
/**
 * A picture: a photo, a cutout with transparency, a texture. `src` names a prepared asset under
 * assets/media/ (see scripts/media.ts). The picture fills its box (cover by default), centred on
 * `focus` (fractions of the picture), and is clipped to the box. `inner` tracks move the picture
 * inside its crop (x, y in px, scale): a slow push or drift, while the box itself stays put.
 */
export type ImageNode = Base & {
  kind: "image"; src: string; x: number; y: number; w: number; h: number;
  fit?: "cover" | "contain"; focus?: [number, number]; radius?: number; inner?: Tracks;
  /** A cut-out subject drawn over text on purpose (type behind the subject). HyperFrames then accepts the cover (data-layout-allow-occlusion). */
  cutout?: boolean;
  /**
   * Footage instead of a still: `src` is a video file (no sound; sound is its own node). It plays from film
   * time `at` to `until` (default: its end), starting `from` seconds into the file. Crop, focus, inner
   * moves and layers work as for a still. HyperFrames' runtime plays it as a timed <video> clip.
   */
  video?: { at: number; until?: number; from?: number;
    /** Playback speed: 0.5 is slow motion, 2 is double speed. The clip window stays in film time; the file runs at `rate`. */
    rate?: number };
  /**
   * A crop shape: a polygon in fractions of the box ([0, 0] top left, [1, 1] bottom right). A triangle is
   * [[0.5, 0], [1, 1], [0, 1]]. Both renderers cut it with CSS clip-path, so its edge is hard.
   */
  clip?: [number, number][];
  /**
   * A sticker edge round the picture's alpha (a cut-out's silhouette): rings from the inside out, each `width` px
   * in `color` (Pop: a ground band, then an ink line). Both renderers draw it with one SVG filter on the picture
   * (dilate, flood, merge). It is hard-edged: no blur, no shadow. Keep the subject that far inside its box.
   */
  outline?: { color: ColorRole; width: number }[];
  /** Light on the picture, masked by its alpha (see Light). Only for a system whose `allows` lists the effect. */
  lights?: Light[];
};

/**
 * Light that falls on a picture, cut to the picture's own alpha, so it lights the subject and not the ground.
 * It moves with the picture's inner tracks.
 * - "sweep" (light-sweep): a narrow band of `width` px at `angle` degrees (0 is vertical) that crosses the
 *   picture. Its x track is the band's offset from the box centre, across the band, in px.
 * - "rim" (rim-light): a line of `width` px on the silhouette's edge that faces `angle` degrees (0 right, 90 down).
 * The light mixes with the picture as screen (it only brightens). The opacity track sets its strength and timing.
 */
export type Light = { id: string; kind: "sweep" | "rim"; color: ColorRole; width: number; angle: number; tracks?: Tracks };
export type RectNode = Base & { kind: "rect"; x: number; y: number; w: number; h: number; fill: ColorRole; radius?: number; stroke?: ColorRole; strokeWidth?: number;
  /** A knock-out under a label (blocks/sheet.ts): a patch in the tone of what is behind it, which hides the grid. It is not an edge of the layout. */
  knock?: boolean };
export type PathNode = Base & {
  kind: "path";
  d: string;
  stroke?: ColorRole;
  fill?: ColorRole;
  /** Stroke width in px. Blocks use the system stroke (ctx.stroke) or a multiple of it. */
  width?: number;
  dash?: [number, number];
  cap?: "butt" | "round" | "square";
  join?: "miter" | "round" | "bevel";
  /** The SVG fill rule for a fill whose subpaths overlap (a ring: "evenodd" leaves the hole open). Default: "nonzero". */
  fillRule?: "nonzero" | "evenodd";
  /** The path's box, for the scale/rotate origin. */
  box?: { x: number; y: number; w: number; h: number };
};
export type CircleNode = Base & { kind: "circle"; cx: number; cy: number; r: number; fill?: ColorRole; stroke?: ColorRole; width?: number };

/**
 * The camera for the whole scene (at most one). Its tracks move the view, not a node: x and y pan the
 * view right and down in px (the content moves the other way), and scale zooms about the frame centre.
 * Text must still be inside the safe area where the camera comes to rest.
 */
export type CameraNode = Base & { kind: "camera" };

/**
 * An anchor draws nothing. It names a part of a block (a node, a line of code, a lane, an arrival) so a
 * scene can point at it: its box in px, when it appears (`at`), and any extra numbers in `data`.
 * Find one with anchor(nodes, id) from context.ts.
 */
export type AnchorNode = Base & { kind: "anchor"; x: number; y: number; w: number; h: number; at?: number; data?: Record<string, number | string> };

/**
 * A hold draws nothing. While it shows (its opacity track), it tells the HyperFrames check that the frame
 * holds still on purpose, so the time does not count as a dead stretch. Both renderers put an empty,
 * full-frame element with `data-hold` behind everything. Make one with the `hold` block.
 */
export type HoldNode = Base & { kind: "hold" };

/**
 * A 3D scene (see src/system/three/spec.ts). Both renderers draw it on a canvas in its box from the
 * time alone, below the 2D content of its layer by default. Its tracks may fade it in and out (opacity).
 */
export type Scene3DNode = Base & { kind: "scene3d"; spec: import("../three/spec").Scene3D;
  /** The shot runs past the frame on purpose (a detail of a part). Both renderers mark it for the overflow check. */
  bleed?: boolean };

/**
 * Sound: a music bed or an effect. It draws nothing. It plays `src` (a file in assets/media) from film time
 * `at` to `until` (default: the file's end), starting `from` seconds into the file, at `volume` (1 = as
 * the file is), with linear fades in and out (seconds). The renderers play it as a timed <audio> clip
 * (HyperFrames) or an <Audio> in a Sequence (Remotion). The frame recorder hears nothing: check sound in
 * a real render (remotion render, hyperframes render).
 */
export type AudioNode = { id: string; kind: "audio"; src: string; at: number; until?: number; from?: number; volume?: number; fadeIn?: number; fadeOut?: number;
  layer?: number; z?: number; tracks?: Tracks; origin?: Origin };

export type Node = TextNode | RectNode | PathNode | CircleNode | CameraNode | AnchorNode | HoldNode | Scene3DNode | ImageNode | AudioNode;

/** What a block may know about the frame and the system. */
export type Ctx = {
  system: System;
  width: number;
  height: number;
  /** Width in px of `text` set in a type role, measured with the real font. With keepCase, the text keeps its
   *  case also in a role that the system sets in capitals (see TextNode.keepCase). With weight, it is set in
   *  that weight (see TextNode.weight). */
  measure: (text: string, role: TypeRole, opts?: { keepCase?: boolean; weight?: number; italic?: boolean }) => number;
  /** Size in px of a type role at this frame size, and its line height in px. */
  size: (role: TypeRole) => number;
  lineHeight: (role: TypeRole) => number;
  /** The system stroke width in px. */
  stroke: number;
  radius: number;
  /** Durations in seconds, from the system's frame counts. */
  dur: { enter: number; move: number; exit: number; stagger: number };
  /** The curve to use for a value that must never pass its target (a bar, a line, a count):
   *  the requested curve when it does not overshoot, else the system's move curve, else linear. */
  noOvershoot: (curve: "enter" | "move" | "exit") => Curve;
  /** The text-safe area in px. Below lowBandTop, text must end by lowBandRight. */
  safe: { left: number; right: number; top: number; bottom: number; lowBandTop: number; lowBandRight: number };
  /** True when the system moves in single frames (no tweened motion): Raw, Console, Title. */
  instant: boolean;
};

export type Block<P> = (props: P, ctx: Ctx) => Node[];
