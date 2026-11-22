// Photo: a prepared photo or clip (scripts/media.ts) that fills a box, graded for the system, framed on its subject,
// with a slow push or drift, and optionally its cut-out subject drawn in front of the text: the
// "type behind the subject" device of sports and editorial campaigns.
//
// Rules this block enforces:
// - The photo fills the box (cover) and is centred on its subject, so the crop never cuts the subject out.
//   `focus` states another point (fractions of the picture) when the scene wants a different centre.
// - The plate draws in the backdrop layer. With `over`, the cut-out subject draws in the overlay layer, so
//   text in the content layer passes behind the subject and in front of the background. The cut-out
//   marks the cover as deliberate for HyperFrames; the scene still keeps each word readable (plan with
//   placeBehind in scene/cover.ts; scripts/inspect/cover.py checks the recorded frames).
// - Motion stays inside the crop and never reveals an edge: "push" eases in toward the subject by `amount`
//   (default 8 %), "drift" moves sideways, "still" holds. It uses the move curve and never overshoots.
// - Enter and exit: "cut" (one frame, on the frame of `at` and off on the frame of `until`), "dissolve" (an
//   opacity fade over the system's enter or exit duration) or "rise" (the picture moves up into place).
//   The defaults come from the system's vocabulary (scene/vocabulary.ts): Ma and Nocturne dissolve, all
//   others cut. A one-frame system always cuts, one frame after `at` (as present() and the text blocks do
//   there). With `at` at 0 or before, the photo shows from frame 0.
// - Sharpness: the block computes the final upscale of the source (cover x zoom x push or drift). Over
//   1.15 it warns. Over 1.25 it warns that the picture is soft and names the pixel size it needs; with
//   UPSCALE.throws set, it throws instead. The camera's zoom multiplies the upscale too: the block does not see the
//   camera, but the softness check measures the picture's size on screen, with the same two limits.
// - `shape`: "circle" or "square" crops the picture to the largest centred square of the box (a circle
//   rounds it). `sticker` (Pop) puts a flat ground band and an ink outline around a shape crop.
// - `frame: "figure"` (Spec, Schematic): a bordered window with a label strip at its foot (or at its top, `labelAt`),
//   all inside the box.
// - `traceOn(nodes, id)` maps the photo's source pixels to the screen, through the cover fit, the focus, the zoom and
//   the motion at a time: a drawing traced on the photo's pixels stays on them through a zoom and a crop.
//   The label is measured and checked against the text-safe area.
// - Light (only where the system's `allows` lists the effect, else it throws): `sweep` (light-sweep: Keynote, Matte)
//   runs a narrow band of light across the subject once; `rim` (rim-light) draws a thin light line on one edge of
//   the silhouette. Both are cut to the cut-out's alpha, so light falls on the subject and never on the ground.
// - `shape: "triangle"` and `clip` (any polygon in fractions of the box) crop the picture with a hard edge. A sticker
//   edge follows the polygon. `sticker` without `shape` outlines the cut-out subject itself (an outline from its alpha).
// - Footage `rate`: slow motion (0.5) or speed (2). The clip ends where the file ends at that rate.
// - `passes` (Riso): the picture prints ink by ink instead of as one plate. Each ink is a halftone separation that
//   `prepare --system riso` writes (ink-<role>.png); one ink stamps on per beat, mixed with multiply, each a few px
//   off register. `paper` (Cutout): the subject draws as a two-tone paper cut (paper.png) instead of a graded photo.
// - It names the subject on screen: anchor `<id>-subject-box` (where the subject is at the end of the move), so
//   a scene can set type across it on purpose or keep text clear of it.
import { MEDIA } from "../../media.gen";
import { PLATES } from "../../media-plates.gen";
import { MEDIA_SPEC } from "../../media-spec";
import { go, present, px } from "../context";
import { vocabulary, type PhotoMove } from "../vocabulary";
import { valueAt } from "../time";
import type { Block, Ctx, ImageNode, Key, Light, Node, Tracks } from "../types";
import { onOff } from "./shape";
import { lineSafe } from "./text";
import { builtNodes } from "./handover";

export type PhotoProps = {
  id?: string;
  /** A prepared asset: a name that `untell media list` shows. */
  media: string;
  box?: { x: number; y: number; w: number; h: number };
  /** Draw the cut-out subject in front of the content layer. */
  over?: boolean;
  /** Draw the whole photo behind everything. false: only the cut-out subject (with `over`), on whatever is below. */
  plate?: boolean;
  /** "top": the plate's top eases into the ground (dark systems; plate-top.jpg), for a photo framed low, so the
   * photo has no top edge. The cut-out subject does not fade. */
  fade?: "top";
  /** Behind type: the plate dimmed by the system's Media `dim` level, or 55 % where the system names none (plate-dim, which prepare writes for every graded picture). */
  dim?: boolean;
  /** The point of the picture that stays put in the crop, as fractions [x, y]. Default: the subject's centre. */
  focus?: [number, number];
  /** A tighter crop: the scale over the cover fit, about the focus. Default 1. It counts in the upscale check. */
  zoom?: number;
  motion?: "push" | "drift" | "still";
  /** How far the motion goes: a scale gain for push (0.08 = 8 %), a share of the width for drift. */
  amount?: number;
  /** Footage only: where in the clip to start, seconds. The clip plays from `at` to `until` (or its end). */
  clipStart?: number;
  /** @deprecated The old name of `clipStart`; it still works, with a warning. */
  from?: number;
  /** How long the motion runs, seconds. Default: until `until`, or 8 s. */
  seconds?: number;
  /** How the photo comes on. Default: the system's vocabulary. */
  enter?: PhotoMove;
  /** How the photo goes off at `until`. Default: the system's vocabulary. */
  exit?: PhotoMove;
  /** The length of a "dissolve" enter or exit, in frames (30 fps), for a system that names one (Studio: 8 to 15
   *  frames between shots). Default: the system's enter and exit durations. 2 to 45 frames. */
  dissolve?: number;
  /** Crop the picture to a shape: the largest centred square of the box, rounded for a circle, cut for a triangle. */
  shape?: "circle" | "square" | "triangle";
  /** Crop the picture to any polygon, in fractions of the box ([0, 0] top left). It wins over `shape`'s crop. */
  clip?: [number, number][];
  /** A flat sticker edge, a ground band with an ink line outside it (Pop). With `shape` or `clip` it follows the
   *  crop; without, it follows the cut-out subject's own outline. */
  sticker?: boolean;
  /** Footage only: the playback speed. 0.5 is slow motion, 2 is double speed. Default 1. */
  rate?: number;
  /**
   * A light sweep (light-sweep): a narrow band of light that crosses the subject once, from `from` (default left),
   * starting at `at` and taking `seconds` (default twice the move duration). `angle`: the band's lean in degrees
   * (default 20). `width`: the band in px (default 6 % of the box). `strength`: 0-1 (default 0.55).
   */
  sweep?: { at: number; seconds?: number; from?: "left" | "right"; angle?: number; width?: number; strength?: number };
  /** A rim light (rim-light): a thin light line on the silhouette's edge that faces `angle` degrees (0 right, 90 down,
   *  180 left). It comes on at `at` over the enter duration. `width` px (default 2 strokes), `strength` 0-1 (default 0.7). */
  rim?: { at?: number; angle?: number; width?: number; strength?: number };
  /** Print the picture ink by ink (Riso): one halftone layer per ink of the system's duotone grade, darkest first,
   *  one every `beat` seconds from `at`, overprinted with multiply, each `offset` px off register (default 0.4 %
   *  of the frame width). Needs the ink layers from prepare. */
  passes?: { beat: number; offset?: number };
  /** The subject as a two-tone paper cut (paper.png from prepare, Cutout), with `over`, `sticker` or light. */
  paper?: boolean;
  /** "figure": a bordered window with a label strip at its foot (Spec, Schematic). "letterbox": a band across the frame's
   *  full width at the picture's own aspect, no taller than 2:1 nor flatter than 2.39:1, centred on the frame's height
   *  (`box` is not used): a film still that is too small, or too wide, to fill a tall frame. */
  frame?: "figure" | "letterbox";
  /** The figure's label, one line ("FIG. 2  CHAINRING, 1:4"). */
  label?: string;
  /** Where the figure's label strip sits: "foot" (the default) or "top" (when the lower band holds a drawing). */
  labelAt?: "top" | "foot";
  at: number;
  until?: number;
};

/** The upscale limits. Over `warn` the block warns; over `fail` it warns that the picture is soft, or throws
 *  when `throws` is true. A scene or a check may set `throws` for a strict build. */
export const UPSCALE = { warn: 1.15, fail: 1.25, throws: false };

/**
 * The largest factor by which the source pixels are enlarged on screen: the cover fit of the box, times the
 * zoom, times the end of the push (1 + amount) or the drift's margin (1 + 2 amount). 1 means one source pixel
 * per frame pixel.
 */
export function photoUpscale(src: { width: number; height: number }, box: { w: number; h: number }, o: { zoom?: number; motion?: "push" | "drift" | "still"; amount?: number } = {}): number {
  const motion = o.motion ?? "push";
  const amount = o.amount ?? (motion === "drift" ? 0.03 : 0.08);
  const gain = motion === "push" ? 1 + amount : motion === "drift" ? 1 + amount * 2 : 1;
  return Math.max(box.w / src.width, box.h / src.height) * (o.zoom ?? 1) * gain;
}

/** The message for a photo whose upscale is over the limit, with the source size it needs to be sharp. */
export function upscaleMessage(id: string, media: string, src: { width: number; height: number }, up: number): string {
  const need = `${Math.ceil(src.width * up)} x ${Math.ceil(src.height * up)} px`;
  return `photo ${id}: "${media}" is enlarged ${up.toFixed(2)}x (cover x zoom x motion) from ${src.width} x ${src.height} px. ` +
    `Prepare a source of at least ${need}, or use a smaller box, a smaller zoom or less push.`;
}

/** Opacity and y keys for a photo's entrance and exit, and the time it is fully gone. */
function moves(ctx: Ctx, at: number, until: number | undefined, enter: PhotoMove, exit: PhotoMove, rise: number): { tracks: Tracks; end?: number } {
  // A one-frame system keeps the timing of present(), one frame after `at`, the same as text and rules there,
  // so a photo and its caption change on the same frame.
  const t: Tracks = { opacity: ctx.instant ? present(at, until).opacity! : onOff(ctx, at, until, enter === "cut" ? "cut" : "fade", exit === "cut" ? "cut" : "fade") };
  const ys: Key[] = [];
  if (enter === "rise" && at > 0) ys.push(...go(ctx, at, rise, 0, ctx.noOvershoot("enter"), 1, "enter"));
  if (exit === "rise" && until !== undefined) ys.push(...(ys.length ? [] : [{ t: 0, v: 0 }]), ...go(ctx, until, 0, -rise, "exit"));
  if (ys.length) t.y = ys;
  // "pop": a small grow into place on the enter curve (with its overshoot), not from nothing.
  if (enter === "pop" && at > 0) t.scale = go(ctx, at, 0.9, 1, "enter", 1, "enter");
  return { tracks: t, end: until === undefined ? undefined : exit === "cut" ? until : until + ctx.dur.exit };
}

/**
 * Throws when prepare did not write `file` for `media`: a renderer would wait for the file until it times out. The
 * message names the command that writes it. A media name that the table (media-plates.gen.ts) does not hold is not
 * checked, so a project with no table still builds.
 */
export function needFile(id: string, media: string, file: string, ctx: Pick<Ctx, "system">, isVideo: boolean, why: string, table: Record<string, string[]> = PLATES) {
  const files = table[media];
  if (!files || files.includes(file)) return;
  const sys = ctx.system.id;
  const how = isVideo
    ? `grade the clip for this system: untell media prepare ${media} --system ${sys} (in the untell lab: python3 scripts/media_video.py assets/media/${media} ${sys}, then bun scripts/export_plates.ts)`
    : `prepare the picture for this system: untell media prepare ${media} --system ${sys} (in the untell lab: bun scripts/media.ts prepare ${media} --system ${sys}, then bun scripts/export_plates.ts)`;
  throw new Error(`photo ${id}: ${why} needs ${media}/${file}, and prepare did not write it (it wrote ${files.join(", ")}). To use it, ${how}. Else leave out ${why}.`);
}

/** The systems whose pictures only fill the frame (Media placements full-bleed and behind-type-dimmed only). */
const FULL_ONLY = new Set(Object.entries(MEDIA_SPEC).filter(([, m]) => m.pictures.placements.length > 0 && m.pictures.placements.every((x) => x === "full-bleed" || x === "behind-type-dimmed")).map(([id]) => id));

/** The plates of one film's pictures differ when their mean colours are further apart than this (CIE76 in CIELAB), as
 *  `media prepare` measures them (media_treat.py PLATE_DE): about the step a viewer sees between two plates one cut apart. */
export const PLATE_DE = 6;

function cielab([r, g, b]: [number, number, number]): [number, number, number] {
  const lin = (c: number) => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.9505, y = 0.2126 * R + 0.7152 * G + 0.0722 * B, z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.089;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** The distance (CIE76) between two plates' mean colours. */
export const plateDistance = (a: [number, number, number], b: [number, number, number]) => { const p = cielab(a), q = cielab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

/** Warns when this picture's plate differs from the plate of a picture the film placed before (one film, one light). */
function plateMatch(ctx: Ctx, id: string, media: string) {
  const mine = MEDIA[media]?.plate;
  if (!mine) return;
  const seen = new Set<string>();
  for (const n of builtNodes(ctx)) {
    if (n.kind !== "image") continue;
    const other = n.src.split("/")[0]!;
    if (other === media || seen.has(other)) continue;
    seen.add(other);
    const theirs = MEDIA[other]?.plate;
    if (!theirs) continue;
    const de = plateDistance(mine, theirs);
    if (de > PLATE_DE) console.warn(`photo ${id}: the plate of "${media}" differs from the plate of "${other}" by ${de.toFixed(1)} (CIE76, limit ${PLATE_DE}): in one film the shots look like two shoots. Choose pictures shot on one backdrop and in one light.`);
  }
}

export const photo: Block<PhotoProps> = (p, ctx) => {
  const id = p.id ?? "photo";
  const info = MEDIA[p.media];
  if (!info) throw new Error(`photo ${id}: no prepared media "${p.media}". Prepare the file for this system first: untell media prepare ${p.media} --system ${ctx.system.id} (in the untell lab: bun scripts/media.ts prepare ${p.media} --system ${ctx.system.id})`);
  plateMatch(ctx, id, p.media);
  let given = p.box ?? { x: 0, y: 0, w: ctx.width, h: ctx.height };
  if (p.frame === "letterbox") {
    const aspect = Math.min(2.39, Math.max(2, info.width / info.height)), h = Math.round(ctx.width / aspect);
    given = { x: 0, y: Math.round((ctx.height - h) / 2), w: ctx.width, h };
  } else if (p.box && FULL_ONLY.has(ctx.system.id) && p.box.w < ctx.width - 1) {
    // A system whose pictures fill the frame (Title, Matte: their Media section places pictures full-bleed or behind
    // type) never sets one in an inset box: a small picture with black bars reads as a mistake on a phone.
    console.warn(`photo ${id}: in ${ctx.system.name} a picture fills the frame (leave box out) or a band across its full width (frame: "letterbox"); this box is ${Math.round(p.box.w)} of ${ctx.width} px wide`);
  }
  const voc = vocabulary(ctx);

  // The window: a figure keeps a label strip at its foot; a shape crop uses the largest centred square.
  const lh = ctx.lineHeight("label");
  const pad = Math.round(lh * 0.45);
  const strip = p.frame === "figure" ? lh + pad * 2 : 0;
  const stripTop = p.frame === "figure" && p.labelAt === "top";
  let box = { x: given.x, y: given.y + (stripTop ? strip : 0), w: given.w, h: given.h - strip };
  if (p.shape) {
    const side = Math.min(box.w, box.h);
    box = { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, w: side, h: side };
  }
  const radius = p.shape === "circle" ? box.w / 2 : undefined;
  const clip: [number, number][] | undefined = p.clip ?? (p.shape === "triangle" ? [[0.5, 0], [1, 1], [0, 1]] : undefined);

  const focus: [number, number] = p.focus ?? info.centre;
  const dur = p.seconds ?? (p.until !== undefined ? p.until - p.at : 8);
  const motion = ctx.instant ? "still" : p.motion ?? "push";
  const curve = ctx.noOvershoot("move");
  const keys = (a: number, b: number): Key[] => [{ t: p.at, v: a }, { t: p.at + dur, v: b, curve }];

  // Cover: the scale that fills the box, and where the photo sits so its focus point stays put.
  const s = Math.max(box.w / info.width, box.h / info.height);
  const dw = info.width * s, dh = info.height * s;
  const ox = (box.w - dw) * focus[0], oy = (box.h - dh) * focus[1];
  const amount = p.amount ?? (motion === "drift" ? 0.03 : 0.08);
  // A drift needs room: scale the picture up a little so moving it never shows an edge.
  const z = p.zoom ?? 1;
  const inner = motion === "push" ? { scale: keys(z, z * (1 + amount)) }
    : motion === "drift" ? { scale: [{ t: 0, v: z * (1 + amount * 2) }], x: keys(-box.w * amount / 2, box.w * amount / 2) }
    : z !== 1 ? { scale: [{ t: 0, v: z }] } : undefined;

  // Sharpness: the final upscale of the source pixels.
  const up = photoUpscale(info, box, { zoom: z, motion, amount });
  if (up > UPSCALE.fail + 1e-6) {
    const msg = upscaleMessage(id, p.media, info, up);
    if (UPSCALE.throws) throw new Error(msg);
    console.warn(`${msg} Over ${UPSCALE.fail}x the picture reads soft.`);
  } else if (up > UPSCALE.warn + 1e-6) console.warn(upscaleMessage(id, p.media, info, up));

  // Entrance and exit. A one-frame system always cuts.
  const enter = ctx.instant ? "cut" : p.enter ?? voc.photo.enter;
  const exit = ctx.instant ? "cut" : p.exit ?? voc.photo.exit;
  const rise = Math.round(Math.min(48, box.h * 0.05));
  if (p.dissolve !== undefined && !(p.dissolve >= 2 && p.dissolve <= 45)) throw new Error(`photo ${id}: dissolve is a length in frames from 2 to 45, not ${p.dissolve}`);
  const dctx = p.dissolve !== undefined ? { ...ctx, dur: { ...ctx.dur, enter: p.dissolve / 30, exit: p.dissolve / 30 } } : ctx;
  const { tracks, end: off } = moves(dctx, p.at, p.until, enter, exit, rise);

  const isVideo = info.kind === "video";
  if (isVideo && p.over) throw new Error(`photo ${id}: footage has no cut-out yet; drop \`over\``);
  if (p.rate !== undefined && (!isVideo || !(p.rate > 0))) throw new Error(`photo ${id}: \`rate\` is for footage, and must be over 0`);
  const rate = p.rate ?? 1;
  // At `rate` the file's remaining seconds last (duration - from) / rate of film time.
  const end = isVideo ? Math.min(off ?? Infinity, p.at + ((info.duration ?? Infinity) - (p.from ?? 0)) / rate) : undefined;
  const video = isVideo ? { at: p.at, ...(Number.isFinite(end) ? { until: end } : {}), ...(p.from ? { from: p.from } : {}), ...(rate !== 1 ? { rate } : {}) } : undefined;
  const common = { x: box.x, y: box.y, w: box.w, h: box.h, focus, inner, tracks, ...(radius ? { radius } : {}), ...(clip ? { clip } : {}), ...(video ? { video } : {}) };
  const ext = isVideo ? "mp4" : "jpg";
  const plateFile = `${p.dim ? "plate-dim" : p.fade === "top" ? "plate-top" : "plate"}.${ext}`;
  // A file that prepare did not write makes the renderer wait for it until it times out. Refuse it here, with the
  // command that writes it (media-plates.gen.ts lists what prepare wrote; a name it does not hold is not checked).
  if (p.plate !== false && !p.passes) needFile(id, p.media, plateFile, ctx, isVideo, p.dim ? "`dim`" : p.fade === "top" ? "`fade: \"top\"`" : "the plate");
  const out: Node[] = p.plate === false || p.passes ? [] : [{ id, kind: "image", src: `${p.media}/${plateFile}`, layer: -1, ...common }];
  if (p.passes && p.plate !== false) {
    // The inks print one a beat, darkest first. Each pass is on from its beat until the photo leaves, at full
    // strength (ink does not fade in), and sits a few px off register in its own direction.
    const grade = MEDIA_SPEC[ctx.system.id]?.grade;
    const inks = grade?.kind === "duotone" ? grade.stops.filter((r) => r !== "ground") : [];
    if (!inks.length || isVideo) throw new Error(`photo ${id}: \`passes\` needs a still prepared for a system with a duotone grade of inks (${ctx.system.name} has none)`);
    const o = p.passes.offset ?? Math.max(2, Math.round(ctx.width * 0.004));
    const shifts: [number, number][] = [[0, 0], [o, -Math.round(o * 0.6)], [-Math.round(o * 0.6), o]];
    for (const role of inks) needFile(id, p.media, `ink-${role}.png`, ctx, false, "`passes`");
    inks.forEach((role, k) => {
      const at = p.at + k * p.passes!.beat;
      const [dx, dy] = shifts[k % shifts.length]!;
      const tk: Tracks = { ...tracks, opacity: k === 0 ? tracks.opacity! : present(at, p.until).opacity! };
      out.push({ id: `${id}-ink-${role}`, kind: "image", src: `${p.media}/ink-${role}.png`, layer: -1, z: k, blend: "multiply", ...common,
        x: box.x + dx, y: box.y + dy, tracks: tk });
    });
  }
  // Light on the subject, cut to its alpha. Each effect must be in the system's `allows`.
  const lights: Light[] = [];
  const allow = (effect: "light-sweep" | "rim-light", prop: string) => {
    if (!ctx.system.allows.includes(effect)) throw new Error(`photo ${id}: \`${prop}\` draws ${effect}, which ${ctx.system.name} does not allow (allows: ${ctx.system.allows.join(", ") || "none"})`);
  };
  if (p.sweep) {
    allow("light-sweep", "sweep");
    const w = p.sweep.width ?? Math.round(Math.min(box.w, box.h) * 0.06);
    const reach = Math.ceil(Math.hypot(box.w, box.h) / 2 + w);
    const dir = p.sweep.from === "right" ? -1 : 1;
    const t0 = p.sweep.at, t1 = t0 + (p.sweep.seconds ?? ctx.dur.move * 2);
    lights.push({ id: `${id}-sweep`, kind: "sweep", color: "ink", width: w, angle: p.sweep.angle ?? 20,
      tracks: { opacity: [{ t: 0, v: p.sweep.strength ?? 0.55 }], x: [{ t: t0, v: -dir * reach }, { t: t1, v: dir * reach, curve: ctx.noOvershoot("move") }] } });
  }
  if (p.rim) {
    allow("rim-light", "rim");
    const strength = p.rim.strength ?? 0.7, at = p.rim.at ?? p.at;
    lights.push({ id: `${id}-rim`, kind: "rim", color: "ink", width: p.rim.width ?? Math.max(2, ctx.stroke * 2), angle: p.rim.angle ?? 0,
      tracks: { opacity: at <= 0 ? [{ t: 0, v: strength }] : go(ctx, at, 0, strength, "enter") } });
  }
  // A sticker without a crop shape outlines the cut-out subject: a ground band, then an ink line, from its alpha.
  const band = Math.max(4, ctx.stroke * 4), line = ctx.stroke;
  const outline = p.sticker && !p.shape && !p.clip ? [{ color: "ground" as const, width: band }, { color: "ink" as const, width: line }] : undefined;
  const subjectExtra: Partial<ImageNode> = { ...(lights.length ? { lights } : {}), ...(outline ? { outline } : {}) };
  const subjectSrc = `${p.media}/${p.paper ? "paper" : "subject"}.png`;
  if (!isVideo && (p.over || lights.length || outline)) needFile(id, p.media, `${p.paper ? "paper" : "subject"}.png`, ctx, false, p.paper ? "`paper`" : p.over ? "`over`" : "the light or the outline");
  if (p.over) out.push({ id: `${id}-subject`, kind: "image", src: subjectSrc, layer: 1, cutout: true, ...common, ...subjectExtra });
  else if (lights.length || outline) {
    // No cut-out in front: the subject draws once more in the plate's layer, just above it, to carry the light or the edge.
    if (isVideo) throw new Error(`photo ${id}: light and a sticker outline need a cut-out; footage has none`);
    out.push({ id: `${id}-subject`, kind: "image", src: subjectSrc, layer: -1, z: 1, ...common, ...subjectExtra });
  }

  // Decorations move with the picture: its opacity and its rise.
  const deco: Tracks = { opacity: tracks.opacity!, ...(tracks.y ? { y: tracks.y } : {}) };

  // A sticker edge around a shape crop: a ground band, then an ink outline outside it. Flat, no shadow.
  if (p.sticker && clip) {
    // A polygon edge: two strokes centred on the crop's edge, under the picture, so only their outer halves show.
    const d = clip.map(([u, v], k) => `${k ? "L" : "M"}${px(box.x + u * box.w)} ${px(box.y + v * box.h)}`).join("") + "Z";
    out.push({ id: `${id}-sticker-line`, kind: "path", d, stroke: "ink", width: (band + line) * 2, join: "round", layer: -1, z: -2, tracks: deco });
    out.push({ id: `${id}-sticker`, kind: "path", d, stroke: "ground", width: band * 2, join: "round", layer: -1, z: -1, tracks: deco });
  } else if (p.sticker && p.shape) {
    const ring = (r: number) => radius
      ? `M${px(box.x + box.w / 2)} ${px(box.y + box.h / 2 - r)}A${r} ${r} 0 1 1 ${px(box.x + box.w / 2)} ${px(box.y + box.h / 2 + r)}A${r} ${r} 0 1 1 ${px(box.x + box.w / 2)} ${px(box.y + box.h / 2 - r)}Z`
      : `M${px(box.x + box.w / 2 - r)} ${px(box.y + box.h / 2 - r)}H${px(box.x + box.w / 2 + r)}V${px(box.y + box.h / 2 + r)}H${px(box.x + box.w / 2 - r)}Z`;
    const r0 = box.w / 2 + band / 2;
    out.push({ id: `${id}-sticker`, kind: "path", d: ring(r0), stroke: "ground", width: band, join: "round", tracks: deco });
    out.push({ id: `${id}-sticker-line`, kind: "path", d: ring(r0 + band / 2 + line / 2), stroke: "ink", width: line, join: "round", z: 1, tracks: deco });
  }

  // The figure window: a border round the whole box, a hairline over the label strip, and the label.
  if (p.frame === "figure") {
    const g = given, line = ctx.stroke;
    const d = `M${px(g.x)} ${px(g.y)}H${px(g.x + g.w)}V${px(g.y + g.h)}H${px(g.x)}Z`;
    // The hairline between the picture and the strip: over a strip at the foot, under one at the top.
    const sy = stripTop ? g.y + strip : g.y + g.h - strip;
    out.push({ id: `${id}-figure`, kind: "path", d, stroke: "ink", width: line, join: "miter", tracks: deco });
    out.push({ id: `${id}-figure-rule`, kind: "path", d: `M${px(g.x)} ${px(sy)}H${px(g.x + g.w)}`, stroke: "ink", width: line, tracks: deco });
    if (p.label) {
      const lw = ctx.measure(p.label, "label");
      const lbox = { x: g.x + pad, y: (stripTop ? g.y : sy) + pad, w: lw, h: lh };
      if (lw > g.w - pad * 2) console.warn(`photo ${id}: the figure label "${p.label}" is wider than the window`);
      if (!lineSafe(ctx, "label", lbox)) console.warn(`photo ${id}: the figure label is outside the text-safe area`);
      out.push({ id: `${id}-figure-label`, kind: "text", x: lbox.x, y: lbox.y, text: p.label, role: "label", color: "ink", tracks: deco });
    }
  }

  // The subject on screen at the end of the motion: its box in the photo, through the cover fit and the move.
  const endScale = z * (motion === "push" ? 1 + amount : motion === "drift" ? 1 + amount * 2 : 1);
  const endX = motion === "drift" ? box.w * amount / 2 : 0;
  const fxp = box.x + box.w * focus[0], fyp = box.y + box.h * focus[1];
  const map = (u: number, v: number): [number, number] => {
    const x = box.x + ox + u * dw, y = box.y + oy + v * dh;
    return [fxp + (x - fxp) * endScale + endX, fyp + (y - fyp) * endScale];
  };
  const [x0, y0] = map(info.subject[0], info.subject[1]), [x1, y1] = map(info.subject[2], info.subject[3]);
  out.push({ id: `${id}-subject-box`, kind: "anchor", x: Math.max(box.x, x0), y: Math.max(box.y, y0), w: Math.min(box.x + box.w, x1) - Math.max(box.x, x0), h: Math.min(box.y + box.h, y1) - Math.max(box.y, y0), at: p.at + dur });
  return out;
};

/**
 * The transform of a photo on screen: a function from the source picture's pixels (sx, sy) to frame px, at film time
 * `t` (default: the photo's first frame), through the cover fit, the focus, the zoom and the push or drift. Give the
 * photo block's nodes and its id. Use it to trace a drawing on the photo (Spec's match cut): the drawing lands on the
 * photo's own pixels at any zoom or crop.
 */
export function traceOn(nodes: readonly Node[], id: string, o: { t?: number; system?: Ctx["system"] } = {}): (sx: number, sy: number) => { x: number; y: number } {
  const n = nodes.find((m): m is ImageNode => m.kind === "image" && m.id === id);
  if (!n) throw new Error(`traceOn: no photo image node "${id}"`);
  const info = MEDIA[n.src.split("/")[0]!];
  if (!info) throw new Error(`traceOn: no prepared media for "${n.src}"`);
  const focus = n.focus ?? [0.5, 0.5];
  const s = Math.max(n.w / info.width, n.h / info.height);
  const ox = n.x + (n.w - info.width * s) * focus[0], oy = n.y + (n.h - info.height * s) * focus[1];
  const fx = n.x + n.w * focus[0], fy = n.y + n.h * focus[1];
  const at = (keys: Key[] | undefined, d: number) => {
    if (!keys?.length) return d;
    if (o.t === undefined || !o.system) return keys[0]!.v;
    return valueAt(o.system, keys, "scale", o.t);
  };
  const k = at(n.inner?.scale, 1), dx = at(n.inner?.x, 0), dy = at(n.inner?.y, 0);
  return (sx, sy) => ({ x: fx + (ox + sx * s - fx) * k + dx, y: fy + (oy + sy * s - fy) * k + dy });
}
