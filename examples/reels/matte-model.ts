// The Matte reel with a real model: a launch film for the Cador storm lantern (a fictional product; the name
// is a random draw). The object is a lantern model (glTF) that you add as model-lantern, with its own worn
// brass. It takes the place of the code-drawn pepper mill in matte.ts; the shots, the timing and
// the sound are the same. One 3D scene, four shots, cut on the bars of the music. A light passes across
// the object in each shot.
//
// Four shots on a half-time pulse of about 70 BPM (one beat is 0.857 s, one bar is 3.43 s):
// 1. 0 to 3.37 s. Macro on the cap and its ring. The camera pushes in. The light crosses the cap. One small line.
// 2. 3.37 to 6.8 s. Macro on the base and the glass. The camera cranes up the body. The light crosses the glass and is
//    brightest on the last frame. A reversed cymbal swells into the cut.
// 3. 6.8 to 10.23 s. The cut lands on the lift of the music: the whole lantern, large and low, on an orbit.
//    The light that started in shot 2 ends its pass here, so the sweep becomes the next scene.
// 4. 10.23 s to the end. The lantern sits lower and turns slowly. The name and the kind of object take the
//    top left corner.
//
// The product block frames shots 3 and 4. The scene keeps one canvas: it adds the macro shots to the
// block's camera and object tracks as keys that cut in one frame ("step").
import type { Ctx, Key, Node } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { Object3D, Scene3D, Vec3 } from "../../src/system/three/spec";
import { anchor } from "../../src/system/scene/context";
import { overflow } from "../../src/system/scene/blocks";
import { standing } from "../../src/system/three/models";

export const system = "matte";
export const seconds = 14.5;

// The music is the clock. The track enters at 197.2 s, under a swell. The track breathes
// from 202.9 s and lifts at 204.0 s: the lift falls on film time 6.8 s (frame 204). The bass pulse is
// 0.857 s (70 BPM, half of the 140.7 BPM that the beat detector reads from the hi-hats).
const FROM = 197.2;
const BEAT = 0.857;
const frame = (t: number) => Math.round(t * 30) / 30;
const LIFT = 6.8;
const CUT1 = frame(LIFT - 4 * BEAT); // 3.37 s
const CUT2 = LIFT;
const CUT3 = frame(LIFT + 4 * BEAT); // 10.23 s
const F = 1 / 30;

// The lantern: a real model (glTF) with its own brass and painted-metal materials. It stands on y 0 and is 3 units tall, about as tall as the mill was.
const H = 3;
const lantern: Object3D[] = [standing("lantern", "model-lantern", { height: H }, { rotation: [0, -20, 0] })];

/** A camera framing: where it stands and what it looks at. */
type View = { pos: Vec3; target: Vec3 };
/** A shot: from `at` to `until`, the camera moves from `from` to `to` and the lantern turns from `turn[0]` to `turn[1]` degrees. */
type Shot = { at: number; until: number; from: View; to: View; turn: [number, number] };

/** Keys for one value over all the shots. The first key of each later shot cuts in one frame. */
function keysOf(shots: Shot[], pick: (s: Shot, end: boolean) => number): Key[] {
  const out: Key[] = [];
  shots.forEach((s, i) => {
    out.push(i === 0 ? { t: s.at, v: pick(s, false) } : { t: s.at, v: pick(s, false), curve: "step" });
    out.push({ t: s.until - F, v: pick(s, true), curve: "move" });
  });
  return out;
}

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const out: Node[] = [];
  const s = ctx.safe;

  // Shots 3 and 4: the product block frames them. Its camera and turn give the start and the end of each.
  const s3 = B.product({ id: "hero", objects: lantern, shot: "orbit", fill: 0.64, centreY: 0.55, sweep: false, at: 0, seconds: CUT3 - CUT2 }, ctx);
  const s4 = B.product({ id: "end", objects: lantern, shot: "turntable", fill: 0.5, centreY: 0.62, sweep: false, at: 0, seconds: seconds - CUT3 }, ctx);
  const spec3 = (s3.find((n) => n.kind === "scene3d") as Extract<Node, { kind: "scene3d" }>).spec;
  const spec4 = (s4.find((n) => n.kind === "scene3d") as Extract<Node, { kind: "scene3d" }>).spec;
  const ends = (sp: Scene3D, len: number) => {
    const c = sp.camera, tr = c.tracks?.position;
    const at = (k: Key[] | undefined, base: number, end: boolean) => (k?.length ? k[end ? k.length - 1 : 0]!.v : base);
    const view = (end: boolean): View => ({ pos: [at(tr?.x, c.position[0], end), at(tr?.y, c.position[1], end), at(tr?.z, c.position[2], end)], target: c.target! });
    const rot = sp.objects[0]!.tracks?.rotation?.y;
    return { from: view(false), to: view(true), turn: [rot?.[0]?.v ?? 0, rot?.[rot.length - 1]?.v ?? 0] as [number, number], len };
  };
  const hero = ends(spec3, CUT3 - CUT2), last = ends(spec4, seconds - CUT3);

  const shots: Shot[] = [
    // 1. The cap and its ring, from a little above. The camera pushes in. Heights are fractions of the lantern.
    { at: 0, until: CUT1, from: { pos: [0.3, H * 1.1, 3.3], target: [0, H * 0.84, 0] }, to: { pos: [0.22, H * 1.04, 2.7], target: [0, H * 0.84, 0] }, turn: [-20, 12] },
    // 2. The base and the glass, from low and to the side, so the right edge of the frame shows against the ground.
    { at: CUT1, until: CUT2, from: { pos: [1.6, H * 0.15, 3.4], target: [0.45, H * 0.2, 0] }, to: { pos: [1.6, H * 0.55, 3.2], target: [0.45, H * 0.55, 0] }, turn: [10, -14] },
    { at: CUT2, until: CUT3, from: hero.from, to: hero.to, turn: hero.turn },
    { at: CUT3, until: seconds, from: last.from, to: last.to, turn: last.turn },
  ];

  // The light: one pass in each shot. The pass in shot 2 is brightest on the frame before the cut.
  const swellPeak = LIFT - F;
  const sweep: Scene3D["sweep"] = [
    { at: 0.5, duration: 2.2, from: [-5, 5, 3], to: [5, 5, 3] },
    { at: swellPeak - 0.8, duration: 1.6, from: [-5, 1.5, 4], to: [5, 2.5, 4] },
    { at: CUT3 + 0.6, duration: 2.4 },
  ];
  const spec: Scene3D = {
    ...spec3,
    id: "lantern",
    at: 0,
    until: undefined,
    camera: {
      ...spec3.camera,
      position: shots[0]!.from.pos,
      target: shots[0]!.from.target,
      tracks: {
        position: { x: keysOf(shots, (sh, e) => (e ? sh.to : sh.from).pos[0]), y: keysOf(shots, (sh, e) => (e ? sh.to : sh.from).pos[1]), z: keysOf(shots, (sh, e) => (e ? sh.to : sh.from).pos[2]) },
        target: { x: keysOf(shots, (sh, e) => (e ? sh.to : sh.from).target[0]), y: keysOf(shots, (sh, e) => (e ? sh.to : sh.from).target[1]), z: keysOf(shots, (sh, e) => (e ? sh.to : sh.from).target[2]) },
      },
    },
    objects: [{ ...spec3.objects[0]!, tracks: { rotation: { y: keysOf(shots, (sh, e) => sh.turn[e ? 1 : 0]) } } }],
    sweep,
  };
  out.push({ id: "lantern", kind: "scene3d", spec, tracks: { opacity: [{ t: 0, v: 1 }] } });

  // Text: small, in the top left corner of the safe area, over the ground. A line box starts low enough
  // that its glyphs stay inside the safe area.
  const topOf = (role: "label" | "caption" | "headline") => Math.ceil(s.top + overflow(ctx, role, false).top) + 1;
  const lhH = ctx.lineHeight("headline");
  out.push(...B.text({ id: "turn", text: "Made for the dark.", role: "caption", color: "ink", x: s.left, y: topOf("caption"), at: 0, until: CUT1 - 0.75 }, ctx));
  const obj = anchor(s4, "end-object");
  // The end in Matte's look (its Ends line): the name in headline, the kind of object in body under it, as one unit
  // (the name is the reveal: the largest thing that enters). A caption
  // was the largest line on screen there and too small to carry the end on a phone (main-line).
  const nameY = topOf("headline");
  if (nameY + lhH + ctx.lineHeight("body") * 1.2 > obj.y) throw new Error(`matte-model: the name block reaches the lantern (${obj.y})`);
  out.push(...B.text({ id: "name", text: "Cador", role: "headline", color: "ink", x: s.left, y: nameY, at: CUT3 + 0.4 }, ctx));
  out.push(...B.text({ id: "kind", text: "Storm lantern.", role: "body", color: "inkMuted", x: s.left, y: nameY + lhH, at: CUT3 + 0.4 }, ctx));

  // Sound. The bed enters under the swell. The reversed cymbal peaks on the lift, one frame after the
  // brightest frame of the light in shot 2.
  out.push(...B.music({ media: "matte-music-3", clipStart: FROM, at: 0, until: seconds, fadeIn: 0.3, fadeOut: 1 }, ctx));
  out.push(...B.hit({ id: "swell", media: "matte-swell", at: swellPeak, volume: 0.5 }, ctx));
  return out;
};
