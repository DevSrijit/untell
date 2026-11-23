// The Cutout reel: the opening titles of "The Modofe Affair", a film by Noripa Gute, from Mezadu
// Pictures (all names fictional, drawn at random for this reel). It is a Saul Bass title sequence:
// black cut paper on off-white stock, one orange-red shape at a time, type set at an angle on the shapes.
//
// Four cards on the beat of the track (130 BPM, a beat is 0.461 s, a bar is 4 beats):
// 1. Bar 0. The studio card: a black slab on frame 0 with the studio's name fitted into it, reversed out in
//    display. Black bars slide in from the frame edges, one a beat.
// 2. Bar 1. A black panel slides across the frame and becomes a tilted slab. The director credit sits on it.
//    Three thinner bars slide in under it, one a beat.
// 3. Bar 3. The slab leaves. A black disc slides in with a hand cut from paper in it: the star credit.
// 4. Bar 5. A second panel crosses and becomes the slab for the title. The title locks with a stamp.
//    A black base at the same angle slides in from the right, closes the frame and carries the date.
//
// Raw nodes: the panels that turn into slabs, and the text on them, are rect and text nodes with tracks,
// because no block turns a wipe into a shape. Every duration and curve comes from go().
import type { Ctx, Key, Node, Prop, TextNode, Tracks } from "../../src/system/scene/types";
import type { BLOCKS } from "../../src/system/scene/blocks";
import type { TypeRole } from "../../src/system/systems";
import type { ColorRole } from "../../src/system/scene/roles";
import { go, seq } from "../../src/system/scene/context";
import { valueAt } from "../../src/system/scene/time";
import { stamped } from "../../src/system/scene/blocks";

export const system = "cutout";
export const seconds = 14.8;

// The track: cutout-music-1. Its loud section starts on a crash at 14.885 s. The film enters
// there, so frame 0 is a downbeat. One beat is 0.46135 s (measured over 37 beats).
const ENTRY = 14.88;
const BEAT = 0.46135;
/** The frame time of beat k after the entry. */
const beat = (k: number) => Math.round(k * BEAT * 30) / 30;
const F = 1 / 30;
const TILT = -8; // degrees: the angle of every slab and of the type on it

type Box = { x: number; y: number; w: number; h: number };

/** Turns a point (dx, dy) from a centre by `deg` degrees (clockwise on screen). */
function turn(dx: number, dy: number, deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
}

/** The first frame time at which `test` is true for the track value, searched from `from` to `to`. */
function firstFrame(ctx: Ctx, keys: Key[], from: number, to: number, test: (v: number) => boolean): number {
  for (let f = Math.ceil(from * 30); f <= Math.ceil(to * 30); f++) if (test(valueAt(ctx.system, keys, "x", f / 30))) return f / 30;
  return to;
}

/**
 * Hides nodes in one frame at time t: the frame where a panel covers them. Each switch ends half a frame
 * before its frame, as the shape block's "cut" does, so both renderers hide them on the same frame.
 */
function cutAt(ctx: Ctx, nodes: Node[], t: number): Node[] {
  const tc = (Math.ceil(t * 30 - 1e-6) - 0.5) / 30, q = 0.25 / 30;
  return nodes.map((n) => {
    if (n.kind === "audio" || n.kind === "anchor") return n;
    const keys = n.tracks?.opacity ?? [{ t: 0, v: 1 }];
    const v = valueAt(ctx.system, keys, "opacity", tc - q);
    return { ...n, tracks: { ...n.tracks, opacity: [...keys.filter((k) => k.t < tc - q), { t: tc - q, v }, { t: tc, v: 0, curve: "step" }] } } as Node;
  });
}

/**
 * The system's stepped 12 fps feel. Each tween in a node's opacity and transform tracks becomes a run of
 * steps: the value follows the same curve, but it changes only on frames 0, 3, 5, 8, 10 ... of the move
 * (12 changes a second at 30 fps), as cut paper shot on twos and threes. Each step ends half a frame
 * before its frame, so both renderers show the same value on every frame.
 */
const STEPPED: Prop[] = ["opacity", "x", "y", "scale", "scaleX", "scaleY", "rotate"];
function stepTrack(ctx: Ctx, keys: Key[], prop: Prop): Key[] {
  if (keys.every((k, i) => i === 0 || k.curve === "step")) return keys;
  const out: Key[] = [{ t: 0, v: keys[0]!.v }];
  const q = 0.25 / 30;
  let last = keys[0]!.v;
  const jump = (f: number, v: number) => {
    if (Math.abs(v - last) < 1e-6) return;
    const T = (f - 0.5) / 30;
    if (T - q > out[out.length - 1]!.t) out.push({ t: T - q, v: last });
    out.push({ t: Math.max(T, out[out.length - 1]!.t), v, curve: "step" });
    last = v;
  };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!, b = keys[i]!;
    const f0 = Math.max(1, Math.ceil(a.t * 30 - 1e-6)), f1 = Math.ceil(b.t * 30 - 1e-6);
    if (b.curve === "step" || f1 <= f0) { jump(Math.max(1, f1), b.v); continue; }
    for (let f = f0; f <= f1; f++) {
      const o = f - f0;
      if (f === f1 || o % 5 === 0 || o % 5 === 3) jump(f, f === f1 ? b.v : valueAt(ctx.system, keys, prop, f / 30));
    }
  }
  return out;
}
function stepped(ctx: Ctx, nodes: Node[]): Node[] {
  return nodes.map((n) => {
    if (n.kind === "audio" || n.kind === "anchor" || n.kind === "hold" || !n.tracks) return n;
    const tracks: Tracks = { ...n.tracks };
    for (const p of STEPPED) if (tracks[p]) tracks[p] = stepTrack(ctx, tracks[p]!, p);
    return { ...n, tracks } as Node;
  });
}

export const scene = (ctx: Ctx, B: typeof BLOCKS): Node[] => {
  const out: Node[] = [];
  const W = ctx.width, H = ctx.height, cx = W / 2;
  const S = ctx.safe;

  /** Fails the build when a turned text's glyph box leaves the text-safe area. */
  const checkSafe = (id: string, c: [number, number], w: number, role: TypeRole, deg: number, sc = 1) => {
    const gh = ctx.size(role) * 1.4;
    const a = Math.abs((deg * Math.PI) / 180);
    const bw = (w * Math.cos(a) + gh * Math.sin(a)) * sc, bh = (w * Math.sin(a) + gh * Math.cos(a)) * sc;
    const b = { x: c[0] - bw / 2, y: c[1] - bh / 2, w: bw, h: bh };
    const right = b.y + b.h > S.lowBandTop ? S.lowBandRight : S.right;
    if (b.x < S.left || b.x + b.w > right || b.y < S.top || b.y + b.h > S.bottom) throw new Error(`cutout: ${id} leaves the safe area: ${JSON.stringify(b)}`);
  };

  /** A text node centred on `c`, turned by `deg`, with the given tracks. */
  const word = (id: string, text: string, role: TypeRole, color: ColorRole, c: [number, number], deg: number, tracks: Tracks, sc = 1): TextNode => {
    const w = Math.ceil(ctx.measure(text, role)) + 4, lh = ctx.lineHeight(role);
    checkSafe(id, c, w, role, deg, sc);
    const rot: Key[] = [{ t: 0, v: deg }];
    return { id, kind: "text", text, role, color, x: c[0] - w / 2, y: c[1] - lh / 2, width: w, align: "center", origin: [0.5, 0.5], layer: 1,
      tracks: { rotate: rot, ...(sc !== 1 ? { scale: [{ t: 0, v: sc }] } : {}), ...tracks } };
  };

  /**
   * A full-frame black panel that slides across and settles into a tilted slab. At rest the rect gives way
   * to the same slab drawn as a path cut at the frame edges, so nothing at rest reaches past the canvas.
   */
  const panel = (id: string, o: { at: number; from: "left" | "right"; slab: { cy: number; h: number }; leave?: number }) => {
    const box: Box = { x: -40, y: -40, w: W + 80, h: H + 80 };
    // The panel starts to become the slab before it has covered the frame, so no frame is all black for long.
    const settle = o.at + ctx.dur.enter * 0.6;
    const rest = settle + ctx.dur.enter;
    const pcx = box.x + box.w / 2;
    const rect: Node = {
      id, kind: "rect", ...box, fill: "ink", layer: 1, origin: [0.5, 0.5],
      tracks: {
        opacity: stamped(o.at, rest),
        x: go(ctx, o.at, o.from === "left" ? -(W + 120) : W + 120, 0, "enter"),
        // The panel starts to become the slab on the frame it covers the frame, fast at first (the enter
        // curve), so the frame is all black for two frames at most.
        y: go(ctx, settle, 0, o.slab.cy - (box.y + box.h / 2), "enter"),
        scaleY: go(ctx, settle, 1, o.slab.h / box.h, "enter"),
        scaleX: go(ctx, settle, 1, 1.25, "enter"),
        rotate: go(ctx, settle, 0, TILT, "enter"),
      },
    };
    // The slab at rest: the band between two parallel edges, cut at x = 0 and x = W.
    const tan = Math.tan((TILT * Math.PI) / 180), half = o.slab.h / 2 / Math.cos((TILT * Math.PI) / 180);
    const edge = (x: number, side: number) => o.slab.cy + (x - pcx) * tan + side * half;
    const d = `M0 ${edge(0, -1).toFixed(1)}L${W} ${edge(W, -1).toFixed(1)}L${W} ${edge(W, 1).toFixed(1)}L0 ${edge(0, 1).toFixed(1)}Z`;
    const x = o.leave !== undefined ? go(ctx, o.leave, 0, -(W + 600), "exit") : undefined;
    const slab: Node = { id: `${id}-slab`, kind: "path", d, fill: "ink", layer: 1, box: { x: 0, y: edge(W, -1), w: W, h: edge(0, 1) - edge(W, -1) },
      tracks: { opacity: stamped(rest, o.leave !== undefined ? o.leave + ctx.dur.exit : undefined), ...(x ? { x } : {}) } };
    return { nodes: [rect, slab], x: rect.tracks!.x!, covered: settle, rest };
  };

  /** Text that rides a slab: it slides in along the slab at `at`, and leaves with the slab at `leave`. */
  const onSlab = (id: string, text: string, role: TypeRole, color: ColorRole, c: [number, number], at: number, leave?: number, sc = 1) => {
    const [dx, dy] = turn(-120, 0, TILT);
    // On the way out the text goes in one frame as its left edge reaches the safe edge.
    const exit = leave !== undefined ? go(ctx, leave, 0, -(W + 600), "exit") : undefined;
    const left = c[0] - ((Math.ceil(ctx.measure(text, role)) + 4) * Math.cos((TILT * Math.PI) / 180) + ctx.size(role) * 1.4 * Math.abs(Math.sin((TILT * Math.PI) / 180))) * sc / 2;
    const gone = exit ? firstFrame(ctx, exit, leave!, leave! + ctx.dur.exit, (v) => left + v < S.left + 2) : undefined;
    return word(id, text, role, color, c, TILT, {
      opacity: stamped(at, gone),
      x: seq(go(ctx, at, dx, 0, "enter"), exit),
      y: go(ctx, at, dy, 0, "enter"),
    }, sc);
  };

  /**
   * A black band at the slabs' angle. `cy` is the y of its centre line at the frame centre. "left" and
   * "right" give a bar of length `len` that starts at that frame edge and ends square to the band. "base"
   * gives a band whose top edge is at `cy` and whose bottom is the foot of the frame. The band slides in
   * from its own edge at `at` and leaves to the left at `leave`.
   */
  const band = (id: string, o: { cy: number; h: number; from: "left" | "right" | "base"; len?: number; at: number; leave?: number }): Node => {
    const a = (TILT * Math.PI) / 180, tan = Math.tan(a), hv = o.h / 2 / Math.cos(a);
    const yc = (x: number) => o.cy + (x - cx) * tan;
    const d1: [number, number] = [Math.cos(a), Math.sin(a)], n1: [number, number] = [-Math.sin(a), Math.cos(a)];
    let pts: [number, number][];
    if (o.from === "base") pts = [[0, yc(0)], [W, yc(W)], [W, H], [0, H]];
    else {
      const sx = o.from === "left" ? 0 : W, sgn = o.from === "left" ? 1 : -1, len = o.len ?? W;
      const c: [number, number] = [sx + sgn * d1[0] * len, yc(sx) + sgn * d1[1] * len];
      const top: [number, number] = [c[0] - (n1[0] * o.h) / 2, c[1] - (n1[1] * o.h) / 2];
      const bot: [number, number] = [c[0] + (n1[0] * o.h) / 2, c[1] + (n1[1] * o.h) / 2];
      pts = [[sx, yc(sx) - hv], top, bot, [sx, yc(sx) + hv]];
    }
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const bx = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("") + "Z";
    const off = o.from === "left" ? -(bx.x + bx.w + 40) : W - bx.x + 40;
    const x = seq(go(ctx, o.at, off, 0, "enter"), o.leave !== undefined ? go(ctx, o.leave, 0, -(W + 600), "exit") : undefined);
    return { id, kind: "path", d, fill: "ink", layer: 1, box: bx,
      tracks: { opacity: stamped(o.at, o.leave !== undefined ? o.leave + ctx.dur.exit : undefined), x } };
  };

  // ---------- 1. The studio card (bar 0). ----------
  const lhH = ctx.lineHeight("headline");
  const SLAB1 = { cy: Math.round(H / 3), h: Math.round(H * 0.17) };
  // The panel covers the frame on beat 5: it starts its slide that much before (panel: it covers at 0.6 of an enter).
  const p1 = panel("panel1", { at: beat(5) - ctx.dur.enter * 0.6, from: "right", slab: SLAB1, leave: beat(12) });
  // A black slab across the frame on frame 0, the studio's name fitted into it in display, reversed out; "presents"
  // on the paper under it. Both go on the frame the panel covers them.
  const slab1 = { x: 0, y: SLAB1.cy - SLAB1.h / 2, w: W, h: SLAB1.h };
  // The type goes on the frame the panel's left edge passes the text-safe right edge, before the panel reaches it.
  const goneA = firstFrame(ctx, p1.x, beat(4), p1.covered, (v) => -40 + v <= S.right);
  out.push(...cutAt(ctx, B.shape({ id: "studio-slab", kind: "rect", ...slab1, fill: "ink", enter: "cut", at: -1 }, ctx), p1.covered));
  out.push(...cutAt(ctx, [
    ...B.fitText({ id: "studio", text: "MEZADU", x: S.left, y: slab1.y, w: S.right - S.left, h: slab1.h, role: "display", color: "ground", align: "center", at: 0 }, ctx),
    ...B.text({ id: "presents", text: "Pictures presents", role: "label", align: "center", x: S.left, y: slab1.y + slab1.h + Math.round(lhH * 0.4), w: S.right - S.left, at: 0 }, ctx),
  ], goneA));
  // The bars: one at rest on frame 0, then one a beat from alternate edges. One bar is the orange.
  const bars: { b: Box; fill: ColorRole; k: number }[] = [
    { b: { x: 0, y: Math.round(H * 0.19), w: Math.round(W * 0.59), h: 56 }, fill: "ink", k: 0 },
    { b: { x: Math.round(W * 0.305), y: Math.round(H * 0.484), w: Math.round(W * 0.695), h: 56 }, fill: "ink", k: 1 },
    { b: { x: 0, y: Math.round(H * 0.677), w: Math.round(W * 0.74), h: 150 }, fill: "ink", k: 1.5 },
    { b: { x: Math.round(W * 0.407), y: Math.round(H * 0.781), w: Math.round(W * 0.593), h: 96 }, fill: "accent", k: 2 },
    { b: { x: 0, y: Math.round(H * 0.859), w: Math.round(W * 0.556), h: Math.round(H * 0.141) }, fill: "ink", k: 3 },
  ];
  bars.forEach(({ b, fill, k }, i) => out.push(...cutAt(ctx, B.shape({ id: `bar${i}`, kind: "rect", ...b, fill, enter: k === 0 ? "cut" : "slide", at: beat(k) }, ctx), p1.covered)));

  // ---------- 2. The director credit on the slab (bars 1 to 3). ----------
  out.push(...p1.nodes);
  const [lx, ly] = turn(0, -88, TILT), [hx, hy] = turn(0, 52, TILT);
  out.push(onSlab("filmby", "A film by", "label", "ground", [cx + lx, SLAB1.cy + ly], beat(6), beat(12)));
  out.push(onSlab("director", "Noripa Gute", "headline", "ground", [cx + hx, SLAB1.cy + hy], beat(7), beat(12)));
  // Three bars under the slab, one a beat from alternate edges, each thinner than the last. The card
  // keeps moving on the beat until the slab leaves, and the bars leave with it.
  // They sit in the lower half, so the card uses the frame under the slab.
  out.push(band("dir0", { cy: Math.round(H * 0.62), h: 160, from: "left", len: 760, at: beat(8), leave: beat(12) }));
  // It starts two frames early: it enters from off the frame, so it shows on the strong onset of beat 9.
  out.push(band("dir1", { cy: Math.round(H * 0.73), h: 70, from: "right", len: 600, at: beat(9) - 2 / 30, leave: beat(12) }));
  out.push(band("dir2", { cy: Math.round(H * 0.8), h: 28, from: "left", len: 420, at: beat(10), leave: beat(12) }));

  // ---------- 3. The star credit with the hand (bars 3 to 5). ----------
  // The hand: the graded plate (black, orange, paper), still, cut to a disc and small in the field.
  // The crop sits high on the photo, so the fingertips stay in the disc and the arm leaves at its foot.
  const D = 560;
  const disc: Box = { x: cx - D / 2, y: Math.round(H * 0.536), w: D, h: D };
  const p2at = beat(20);
  const p2 = panel("panel2", { at: p2at, from: "left", slab: { cy: 575, h: 400 } });
  const handIn = beat(12);
  // The hand enters by a hard cut on the beat (a cut paper shape, not a slide), cropped to the disc.
  const hand = B.photo({ id: "hand", media: "cutout-hand", box: disc, shape: "circle", focus: [0.5, 0.12], motion: "still", enter: "cut", exit: "cut", at: handIn, until: p2.covered }, ctx);
  out.push(...hand);
  // The credit, at the slab's angle, on the paper above the disc.
  const [sx, sy] = turn(0, -90, TILT), [nx, ny] = turn(0, 48, TILT);
  const goneC = firstFrame(ctx, p2.x, p2at, p2.covered, (v) => -40 + W + 80 + v >= cx + 330);
  const credit = (id: string, text: string, role: TypeRole, c: [number, number], at: number) => word(id, text, role, "ink", c, TILT, {
    opacity: stamped(at, goneC),
    x: go(ctx, at, -80, 0, "enter"),
  });
  out.push(credit("starring", "Starring", "label", [cx + sx, 610 + sy], beat(13)));
  out.push(credit("star", "Kenene Nuro", "headline", [cx + nx, 610 + ny], beat(13) + ctx.dur.stagger));
  // Two black strips slide in under the disc, so the frame keeps moving. The first takes the track's off-beat accent
  // (beat 15.5: a strong onset at 7.14 s on the exact sound), the second the beat after.
  out.push(...cutAt(ctx, [
    ...B.shape({ id: "strip0", kind: "rect", x: 0, y: Math.round(H * 0.875), w: 380, h: 40, fill: "ink", enter: "slide", at: beat(15.5) }, ctx),
    ...B.shape({ id: "strip1", kind: "rect", x: W - 380, y: Math.round(H * 0.875), w: 380, h: 40, fill: "ink", enter: "slide", at: beat(17) }, ctx),
  ], p2.covered));

  // ---------- 4. The title (bars 5 to 8). ----------
  out.push(...p2.nodes);
  // The name of the film, reversed out of the slab, as large as the safe area allows at the slab's angle.
  const name = "Modofe", slabC: [number, number] = [(S.left + S.right) / 2, 575];
  const nw = ctx.measure(name, "display") + 4, gh = ctx.size("display") * 1.4, a = Math.abs((TILT * Math.PI) / 180);
  const room = 2 * Math.min(slabC[1] - S.top, S.lowBandTop - slabC[1]) - 4;
  const sc = Math.min((S.right - S.left - 8) / (nw * Math.cos(a) + gh * Math.sin(a)), room / (nw * Math.sin(a) + gh * Math.cos(a)));
  out.push(onSlab("title", name, "display", "ground", slabC, beat(22), undefined, sc));
  // "The" sits small on the paper above the slab.
  const [tx, ty] = turn(0, -255, TILT);
  out.push(word("the", "The", "label", "ink", [cx + tx, slabC[1] + ty], TILT, { opacity: stamped(beat(23)) }));
  // The one orange shape: a tag that stamps in with the last word, and locks the title.
  const lockAt = beat(24);
  const tagW = ctx.measure("Affair", "headline") + 90, tagH = lhH + 40;
  const tagC: [number, number] = [cx + 40, 930];
  out.push({ id: "tag", kind: "rect", x: tagC[0] - tagW / 2, y: tagC[1] - tagH / 2, w: tagW, h: tagH, fill: "accent", layer: 1, origin: [0.5, 0.5],
    tracks: { opacity: stamped(lockAt), rotate: [{ t: 0, v: TILT }] } });
  out.push(word("affair", "Affair", "headline", "onAccent", tagC, TILT, { opacity: stamped(lockAt) }));
  // The close: a black base at the slab's angle slides in from the right under the tag. The title slab
  // and the base frame the tag between two parallel edges. The date rides the base, as the credits rode
  // the slab.
  const BASE = 1090;
  // The base comes in with "The", a beat before the lock, so the lower half is not left as bare paper.
  out.push(band("base", { cy: BASE, h: 0, from: "base", at: beat(23) }));
  // The date rides the base in label, inside the text-safe area (a headline at the slab's angle passes its foot).
  out.push(onSlab("opens", "Opens Friday", "label", "ground", [cx, BASE + 92], beat(26)));

  // ---------- Sound. ----------
  // The bed enters on the crash, so the film's beats are the track's beats. A paper slide on each panel
  // on the disc and on the base, at the frame where the shape moves fastest. A stamp when the title locks.
  // The bed: the hits set their level against it (hit `bed`), as the sound block asks.
  const bed = B.music({ media: "cutout-music-1", align: { track: ENTRY, film: 0 }, until: seconds, fadeOut: 1.2 }, ctx);
  out.push(...bed);
  out.push(...B.hit({ id: "whoosh1", media: "cutout-whoosh", at: beat(4) + ctx.dur.enter / 2, bed }, ctx));
  // Cutout moves at 12 frames a second: the cut shows on the next 12 fps step, so the stamp waits for it.
  // The stamp is a low thump and the bed is loud in its band: hit dips the bed under it as deep as that band needs.
  out.push(...B.hit({ id: "stamp-hand", media: "cutout-stamp", at: Math.ceil(handIn * 12 + 1e-6) / 12, bed }, ctx));
  out.push(...B.hit({ id: "whoosh3", media: "cutout-whoosh", at: p2at + ctx.dur.enter / 2, bed }, ctx));
  // The bed is at its loudest on the lock: the dip under this stamp is the deepest of the film.
  out.push(...B.hit({ id: "stamp", media: "cutout-stamp", at: Math.ceil(lockAt * 12 + 1e-6) / 12, bed }, ctx));
  out.push(...B.reveal({ at: beat(22) }, ctx));
  out.push(...B.hit({ id: "whoosh4", media: "cutout-whoosh", at: beat(23) + ctx.dur.enter / 2, bed }, ctx));
  return stepped(ctx, out);
};
