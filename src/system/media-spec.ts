// How each design system uses media: how photos and footage are graded and placed, and how it sounds.
// The Courtside reel proved the layer in blind tests (photo, photo, footage and sound beat the silent
// photo reel, which beat code alone). Every system now says the same things for its own character.
//
// Grades map a picture onto the system's palette: its black becomes a dark role and its white a light
// role, so a stock photo lands on-palette without a hand grade. scripts/media_treat.py implements each
// grade kind; scripts/export_systems.ts writes this spec into tokens.json and SYSTEM.md.
import type { Role } from "./color";
import { OWN_SYSTEMS } from "./own.gen";

/** How a picture is graded. Colour stops are palette roles, from dark to light. */
export type Grade =
  /** Untouched: UI screenshots and screen recordings are evidence, never graded. */
  | { kind: "none" }
  /** Black and white with an S-curve (`contrast` 0 = linear, 9 = hard), black on `dark`, white on `light`. */
  | { kind: "mono"; contrast: number; gamma?: number; dark: Role; light: Role }
  /** Colour kept but tamed: `saturation` 0-1, `contrast` S-curve, `warmth` -1 (cool) to 1 (warm), then the
   * black and white points on `dark` and `light`. */
  | { kind: "tone"; saturation: number; contrast: number; warmth: number; dark: Role; light: Role }
  /** Luminance through two or three inks (Riso, Bauhaus photomontage). */
  | { kind: "duotone"; stops: Role[] }
  /** Flat cut paper: luminance to 2 or 3 flat tones, no gradient. */
  | { kind: "posterize"; stops: Role[] }
  /** A monochrome screen: luminance in one colour on the ground. */
  | { kind: "phosphor"; dark: Role; tint: Role };

/** How much the system leans on pictures. */
export type Use = "hero" | "support" | "rare" | "none";
/** Where a picture sits in the frame. */
export type Placement =
  | "full-bleed" // fills the frame
  | "framed-low" // fills the frame below the type; its top eases into the ground (photo fade: "top")
  | "cutout-over-type" // the subject cut out and drawn over the type (placeBehind, the cover check)
  | "window" // a box on the grid, with a margin round it
  | "small-in-field" // one small picture in a large empty field
  | "shape-crop" // cropped to a circle, square or triangle
  | "flash" // one beat, full frame, between words
  | "behind-type-dimmed"; // full frame, dimmed so type reads over it
/** A sound effect kind. */
export type Hit = "whoosh" | "impact" | "riser" | "swell" | "pop" | "click" | "tick" | "stamp";

export type MediaSpec = {
  grade: Grade;
  pictures: { use: Use; placements: Placement[]; cutout: boolean; motion: "push" | "drift" | "still"; note: string };
  footage: { use: Use; speed: "slow" | "real" | "none"; note: string };
  music: {
    /** The feel to search for: mood and texture, never the subject. Empty for a silent system. */
    feel: string;
    /** Tempo range, BPM. The film's beat follows the track. */
    bpm: [number, number];
    /** 0: this system has no music. Over 0: it has music. (The bed's level comes from the `music` block, which
     * aims the bed at the system's mix target: mixTarget in direction.ts. Where to enter the track: Mix.entry there.) */
    level: number;
  };
  hits: { allowed: Hit[]; /** At most this many in 10 s. */ perTen: number; note: string };
};

export const MEDIA_SPEC: Record<string, MediaSpec> = {
  console: {
    grade: { kind: "phosphor", dark: "ground", tint: "accent" },
    pictures: { use: "rare", placements: ["window"], cutout: false, motion: "still", note: "A picture shows as a monochrome screen capture in a pane, never full frame." },
    footage: { use: "none", speed: "none", note: "No footage: the terminal is the picture." },
    music: { feel: "minimal electronic pulse, soft synth arpeggio, focused", bpm: [100, 124], level: 0.5 },
    hits: { allowed: ["tick", "click"], perTen: 12, note: "A soft key tick under typed text; a click when a command runs. Drop the ticks over strong music." },
  },
  courtside: {
    grade: { kind: "mono", contrast: 9, dark: "ground", light: "ink" },
    pictures: { use: "hero", placements: ["cutout-over-type", "framed-low", "full-bleed"], cutout: true, motion: "push", note: "A real subject behind the type; the subject crosses the headline but every letter reads." },
    footage: { use: "support", speed: "slow", note: "Hard black and white b-roll: a net, a court, a shoe. Framed low under the end card." },
    music: { feel: "dark trap, heavy 808, determined, building to a drop", bpm: [118, 142], level: 0.9 },
    hits: { allowed: ["whoosh", "impact", "riser"], perTen: 3, note: "A whoosh on a panel or a whip; an impact on the cut to the last card. The drop lands on the biggest change." },
  },
  cutout: {
    grade: { kind: "posterize", stops: ["ink", "accent", "ground"] },
    pictures: { use: "rare", placements: ["shape-crop", "small-in-field"], cutout: true, motion: "still", note: "A subject becomes flat cut paper in three tones (ink, the orange, paper), like the shapes, never a photograph." },
    footage: { use: "none", speed: "none", note: "No footage: the shapes move, not a camera." },
    music: { feel: "big-band jazz, bongos and brass stabs, cool and tense", bpm: [110, 150], level: 0.85 },
    hits: { allowed: ["whoosh", "stamp"], perTen: 4, note: "A paper slide (soft whoosh) when a shape crosses; a stamp when the title locks." },
  },
  graphite: {
    grade: { kind: "none" },
    pictures: { use: "hero", placements: ["window"], cutout: false, motion: "drift", note: "Real UI screenshots, ungraded, in a window with a 1 px border; or the UI itself, built with uiWindow from the product's real names and states (a built window counts as real UI). The camera tracks the cursor." },
    footage: { use: "support", speed: "real", note: "Screen recordings of the real product, ungraded." },
    music: { feel: "calm ambient electronic, warm pads, restrained", bpm: [88, 110], level: 0.6 },
    hits: { allowed: ["click"], perTen: 4, note: "A soft click only on a real cursor click on screen." },
  },
  keynote: {
    grade: { kind: "tone", saturation: 0.85, contrast: 4, warmth: 0, dark: "ground", light: "ink" },
    pictures: { use: "hero", placements: ["full-bleed", "small-in-field"], cutout: true, motion: "push", note: "One product photograph emerges from black, lit; the push is slow." },
    footage: { use: "support", speed: "slow", note: "Slow product b-roll on black: a turn, a light passing." },
    music: { feel: "cinematic ambient swell, piano and strings, hopeful", bpm: [70, 100], level: 0.7 },
    hits: { allowed: ["swell", "impact"], perTen: 2, note: "A swell into the reveal; one low impact on the product's name." },
  },
  kinetic: {
    grade: { kind: "mono", contrast: 7, dark: "ground", light: "ink" },
    pictures: { use: "rare", placements: ["flash"], cutout: false, motion: "still", note: "A picture flashes for one beat between words, full frame; the type is the motion." },
    footage: { use: "rare", speed: "real", note: "A one-beat flash of footage at most." },
    music: { feel: "driving electronic, four on the floor, punchy", bpm: [118, 128], level: 0.9 },
    hits: { allowed: [], perTen: 0, note: "No effects: the cuts land on the music's beats, and the music carries them." },
  },
  ma: {
    grade: { kind: "tone", saturation: 0.25, contrast: 0, warmth: 0.4, dark: "inkMuted", light: "ground" },
    pictures: { use: "support", placements: ["full-bleed", "small-in-field"], cutout: false, motion: "still", note: "A quiet plate (a moving shadow, a wall, light on paper) fills the frame as the field, and the line sits on its calm part; an object sits small in a large empty field. Held long; muted, warm, soft." },
    footage: { use: "rare", speed: "slow", note: "A small, slow, nearly still clip: water, leaves, light on paper." },
    music: { feel: "sparse ambient piano, long silences, calm", bpm: [56, 80], level: 0.45 },
    hits: { allowed: [], perTen: 0, note: "No effects: silence is part of the design." },
  },
  manual: {
    grade: { kind: "none" },
    pictures: { use: "rare", placements: ["window"], cutout: false, motion: "still", note: "Screenshots of real output only, ungraded, in a window beside the code." },
    footage: { use: "none", speed: "none", note: "No footage: code and prose carry it." },
    music: { feel: "lo-fi, mellow keys, unhurried", bpm: [76, 94], level: 0.4 },
    hits: { allowed: ["tick"], perTen: 6, note: "A soft key tick when code types in, and only then." },
  },
  mark: {
    grade: { kind: "none" },
    pictures: { use: "none", placements: [], cutout: false, motion: "still", note: "No pictures: the mark is the subject." },
    footage: { use: "none", speed: "none", note: "No footage." },
    music: { feel: "minimal, confident, clean percussion", bpm: [100, 120], level: 0.7 },
    hits: { allowed: ["pop", "impact"], perTen: 4, note: "A small pop as each module lands; one impact when the mark resolves." },
  },
  matte: {
    grade: { kind: "tone", saturation: 0.45, contrast: 3, warmth: 0.3, dark: "ground", light: "ink" },
    pictures: { use: "rare", placements: ["full-bleed"], cutout: false, motion: "drift", note: "The object is a 3D render (the product block); a photo, if any, is warm, muted and dark." },
    footage: { use: "rare", speed: "slow", note: "Slow material close-ups, warm and dark." },
    music: { feel: "cinematic ambient texture, low drones, tactile", bpm: [70, 100], level: 0.65 },
    hits: { allowed: ["swell"], perTen: 2, note: "A soft swell as the light crosses the object." },
  },
  nocturne: {
    grade: { kind: "tone", saturation: 0.3, contrast: 2, warmth: 0.35, dark: "ground", light: "inkMuted" },
    pictures: { use: "support", placements: ["behind-type-dimmed", "small-in-field"], cutout: false, motion: "push", note: "A dark, warm photograph behind the serif statement, dimmed so the words read: a slow push toward it while the words arrive." },
    footage: { use: "support", speed: "slow", note: "Slow, dark atmosphere: a window at night, smoke, a street light." },
    music: { feel: "ambient piano and soft strings, nocturnal, reflective", bpm: [60, 84], level: 0.55 },
    hits: { allowed: [], perTen: 0, note: "No effects: the words arrive in silence over the bed." },
  },
  noir: {
    grade: { kind: "mono", contrast: 6, gamma: 1.35, dark: "ground", light: "ink" },
    pictures: { use: "hero", placements: ["full-bleed", "cutout-over-type"], cutout: true, motion: "push", note: "Hard key light, deep black; the shadow bars cross the picture as they cross the type." },
    footage: { use: "support", speed: "slow", note: "Slow black and white: rain, a stair, smoke through a blind." },
    music: { feel: "noir jazz, muted trumpet, upright bass, smoky", bpm: [64, 92], level: 0.75 },
    hits: { allowed: ["impact", "whoosh"], perTen: 2, note: "A low hit when a shadow bar snaps; a soft whoosh as a bar slides." },
  },
  pop: {
    grade: { kind: "tone", saturation: 1, contrast: 3, warmth: 0.1, dark: "ink", light: "ground" },
    pictures: { use: "rare", placements: ["shape-crop"], cutout: true, motion: "still", note: "A cut-out subject on a flat round shape, like a sticker; bright and saturated." },
    footage: { use: "none", speed: "none", note: "No footage: the shapes bounce." },
    music: { feel: "upbeat, playful, ukulele and claps, cheerful", bpm: [108, 132], level: 0.8 },
    hits: { allowed: ["pop", "click", "whoosh"], perTen: 6, note: "A pop as a shape lands; a click on a button press; a whoosh on a fast slide." },
  },
  primary: {
    grade: { kind: "duotone", stops: ["ink", "ground"] },
    pictures: { use: "support", placements: ["shape-crop"], cutout: false, motion: "still", note: "Black and white photomontage cut into a circle, a square or a triangle, set at an angle." },
    footage: { use: "rare", speed: "real", note: "A shape-cropped clip at most." },
    music: { feel: "playful modern minimal, pizzicato and marimba, precise", bpm: [96, 124], level: 0.7 },
    hits: { allowed: ["click", "pop"], perTen: 4, note: "A click on each 90-degree turn; a pop when a shape lands." },
  },
  raw: {
    grade: { kind: "none" },
    pictures: { use: "support", placements: ["window"], cutout: false, motion: "still", note: "Pictures as they are, in a bordered box like an image on a plain web page." },
    footage: { use: "rare", speed: "real", note: "Unedited, in a bordered box." },
    music: { feel: "", bpm: [0, 0], level: 0 },
    hits: { allowed: ["click"], perTen: 6, note: "No music. A plain click when something appears, if anything." },
  },
  riso: {
    grade: { kind: "duotone", stops: ["series2", "accent", "ground"] },
    pictures: { use: "hero", placements: ["full-bleed", "window"], cutout: false, motion: "still", note: "Two inks on paper: shadows in one ink, highlights in the other, off-register." },
    footage: { use: "rare", speed: "real", note: "A short clip printed in the same two inks." },
    music: { feel: "lo-fi hip-hop, dusty drums, warm, handmade", bpm: [80, 98], level: 0.75 },
    hits: { allowed: ["stamp"], perTen: 4, note: "A dull stamp as each ink layer prints." },
  },
  schematic: {
    grade: { kind: "mono", contrast: 3, dark: "ground", light: "inkMuted" },
    pictures: { use: "rare", placements: ["window"], cutout: false, motion: "still", note: "A reference photo in a measured window, quiet grey; the drawing is the hero." },
    footage: { use: "none", speed: "none", note: "No footage." },
    music: { feel: "minimal techno, steady, technical", bpm: [104, 124], level: 0.55 },
    hits: { allowed: ["tick"], perTen: 6, note: "A dry tick as a dimension or label locks." },
  },
  spec: {
    grade: { kind: "mono", contrast: 1, dark: "ink", light: "ground" },
    pictures: { use: "rare", placements: ["window"], cutout: false, motion: "still", note: "A neutral grey picture in a bordered window on the grid, labelled like a figure." },
    footage: { use: "none", speed: "none", note: "No footage." },
    music: { feel: "minimal electronic, clean, precise", bpm: [100, 120], level: 0.5 },
    hits: { allowed: ["tick", "click"], perTen: 6, note: "A tick when a label snaps to the grid." },
  },
  studio: {
    grade: { kind: "tone", saturation: 0.9, contrast: 1, warmth: 0, dark: "ink", light: "ground" },
    pictures: { use: "hero", placements: ["small-in-field", "full-bleed"], cutout: true, motion: "push", note: "One product photograph in near-white space, clean and true to colour." },
    footage: { use: "support", speed: "slow", note: "Slow, bright product b-roll on white." },
    music: { feel: "light, optimistic, soft piano and plucks", bpm: [84, 108], level: 0.6 },
    hits: { allowed: ["click", "swell"], perTen: 3, note: "A soft click on a real interaction; a swell into the reveal." },
  },
  title: {
    grade: { kind: "tone", saturation: 0.2, contrast: 2, warmth: 0.15, dark: "ground", light: "inkMuted" },
    pictures: { use: "support", placements: ["behind-type-dimmed", "full-bleed"], cutout: false, motion: "still", note: "A dark, desaturated film still; the title sits over it in silence, on its calm part, never across the subject." },
    footage: { use: "support", speed: "slow", note: "Slow trailer b-roll between title cards, dark and desaturated." },
    music: { feel: "low drone, tense, near silence", bpm: [50, 80], level: 0.5 },
    hits: { allowed: ["impact"], perTen: 1, note: "One low impact on the title card, then silence." },
  },
};

// The project's own systems (own.ts): their own media, else the media of the system each came from.
for (const o of OWN_SYSTEMS) {
  const m = o.media ?? (o.from ? MEDIA_SPEC[o.from] : undefined);
  if (m && !MEDIA_SPEC[o.system.id]) MEDIA_SPEC[o.system.id] = m;
}
