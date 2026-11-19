// The design systems: 10 light and 10 dark. Each is a rigid, named design language anchored to a
// real reference. Agents pick a system; they never invent a palette, a font, a size or an easing.
//
// Framework-neutral: everything here is plain data. Adapters turn it into Remotion components or
// into CSS custom properties for HyperFrames (scripts/export_systems.ts).
//
// Sizes are fractions of the frame's SHORT side, so one system works at 9:16, 16:9, 1:1 and 4:5.
import { build, type Oklch, type Role } from "./color";
import { OWN_SYSTEMS } from "./own.gen";

export type Mode = "light" | "dark";
export type Kind =
  | "launch" | "app-demo" | "changelog" | "kinetic-type" | "explainer" | "data-story" | "ad" | "quote-card"
  | "captioned-clip" | "music-lyric" | "tutorial" | "trailer" | "title-sequence" | "logo-sting" | "wrapped"
  | "presentation" | "news" | "loop";

/** Extra accent roles, for systems built on two or three inks or primaries. */
export type ExtraRole = "accent2" | "accent3";

/** A rule from the ban list that a system breaks on purpose, with the reason it is not an AI default. */
export type Exception = { rule: "cream-with-warm-accent" | "near-black-with-one-vivid-accent"; reason: string };

export type TypeRole = "display" | "headline" | "body" | "label" | "caption";

/**
 * How the accent works. "fixed": the accent is a colour of its own. "ink": the system has no accent colour,
 * so emphasis comes from size, weight or position, and the accent role equals the ink. "brand": the accent is
 * a placeholder that the user's brand colour replaces.
 */
export type AccentMode = "fixed" | "ink" | "brand";

/**
 * Effects a system may use. Each is directional or physical, tied to an object or to motion. None of them is
 * a soft coloured cloud behind content, which no system allows.
 */
export type Effect = "motion-blur" | "light-sweep" | "contact-shadow" | "rim-light" | "halftone" | "scanlines" | "shadow-bars" | "grain" | "reflection";
export const EFFECT_NOTE: Record<Effect, string> = {
  "motion-blur": "Blur along the direction of travel during a fast move, only while it moves.",
  "light-sweep": "A narrow band of light that crosses a subject's surface once.",
  "contact-shadow": "A tight shadow where an object touches the floor.",
  "rim-light": "A thin light line on a subject's edge.",
  halftone: "Halftone dots for tone, as in print.",
  scanlines: "Faint horizontal scanlines at low opacity.",
  "shadow-bars": "Hard-edged diagonal shadow bars, as from a venetian blind.",
  grain: "Film or paper grain over the whole frame.",
  reflection: "A faint, matte mirror of the object in the floor under it.",
};

export type System = {
  id: string; // a character name, not a brand
  name: string;
  mode: Mode;
  reference: string;
  pattern: string; // the palette in one line, checked against the ban list
  personality: string;
  roles: Record<Role, Oklch> & Partial<Record<ExtraRole, Oklch>>;
  /**
   * Google Fonts families (SIL OFL). `fallback`: symbol fonts that both renderers load after the main
   * family, in this order, so a glyph the main family lacks (π, ≈, →, ²) never comes from a system font.
   * Default: SYMBOL_FALLBACK. See fallbackFonts().
   */
  fonts: { display: string; text: string; mono?: string; fallback?: string[] };
  type: Record<TypeRole, { font: "display" | "text" | "mono"; size: number; weight: number; tracking: number; leading: number; uppercase?: boolean }>;
  margin: number; // fraction of the short side
  columns: number;
  radius: number; // px at 1080 short side
  stroke: number;
  motion: { enter: [number, number, number, number]; move: [number, number, number, number]; exit: [number, number, number, number];
    frames: { enter: number; move: number; exit: number; stagger: number }; character: string; transitions: string };
  /**
   * The textures over the frame, each a strength from 0 (none): `grain` (the grain tiles' opacity), `scanlines`
   * (the opacity of the dark scanline layer, for a system that allows "scanlines") and `reflection` (how much of
   * the 3D object shows in the floor, for a system that allows "reflection").
   */
  texture: { grain: number; scanlines?: number; reflection?: number; note: string };
  density: { maxWords: number; minHoldBase: number; minHoldPerWord: number };
  grammar: string[]; // how this system composes a frame, one rule per line
  kinds: Kind[];
  needs?: string; // what must come from the user (footage, screenshots, product renders)
  exceptions?: Exception[];
  /**
   * The most accent elements in one frame (the Never list, and its test in limits.test.ts). Default 1. A system whose
   * own block map puts two accent elements in one frame says so here, with the reason.
   */
  accentElements?: { max: number; note: string };
  accentMode: AccentMode;
  allows: Effect[];
  /** Text roles that may run past the 9:16 safe area, for systems whose words fill the frame. */
  bleed?: TypeRole[];
  /**
   * The frame step in frames per second: the system moves on this coarser grid, like paper cut-outs shot on
   * twos (12). Both renderers hold each tween on the grid. Leave it out to move on every frame.
   */
  step?: number;
  /** Shapes and text never fade: paper and ink are there or not there. Both renderers turn every opacity change into a cut. */
  opaque?: boolean;
};

/**
 * The symbol fallback for every system that does not name its own. The Latin files of the system fonts
 * lack π, ≈, → and ← (src/system/systems.test.ts checks this). Noto Sans Math has them.
 */
export const SYMBOL_FALLBACK = ["Noto Sans Math"];
/** The Google Fonts subsets each fallback family needs. Noto Sans Math keeps π and the arrows in "math". */
export const FALLBACK_SUBSETS: Record<string, string[]> = { "Noto Sans Math": ["latin", "math"], "Noto Sans": ["latin"] };
/** A system's symbol fallback fonts, in the order the renderers load them after the main family. */
export const fallbackFonts = (s: System): string[] => s.fonts.fallback ?? SYMBOL_FALLBACK;

const o = (l: number, c: number, h: number): Oklch => ({ l, c, h });
const T = (font: "display" | "text" | "mono", size: number, weight: number, tracking = 0, leading = 1.15, uppercase = false) =>
  ({ font, size, weight, tracking, leading, ...(uppercase ? { uppercase } : {}) });
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];
const EXIT: [number, number, number, number] = [0.55, 0, 1, 0.45];

// Neutral role helpers: a ground, its surface and rule, ink and muted ink, all on one hue.
const neutrals = (mode: Mode, g: number, hue: number, chroma = 0.004) => mode === "light"
  ? { ground: o(g, chroma, hue), surface: o(Math.min(0.995, g + 0.02), chroma, hue), rule: o(g - 0.14, chroma, hue),
      ink: o(0.2, chroma * 1.5, hue), inkMuted: o(0.48, chroma * 1.5, hue) }
  : { ground: o(g, chroma, hue), surface: o(g + 0.05, chroma, hue), rule: o(g + 0.16, chroma, hue),
      ink: o(0.95, chroma, hue), inkMuted: o(0.68, chroma, hue) };

// Data series derived from a system's roles: the accent first, then greys spread in lightness.
const series = (mode: Mode, accent: Oklch, hue: number) => mode === "light"
  ? { series1: accent, series2: o(0.2, 0.006, hue), series3: o(0.4, 0.006, hue), series4: o(0.72, 0.006, hue), series5: o(0.86, 0.006, hue) }
  : { series1: accent, series2: o(0.95, 0.004, hue), series3: o(0.75, 0.004, hue), series4: o(0.52, 0.004, hue), series5: o(0.36, 0.004, hue) };

// Status roles are text roles too (a badge, a terminal line): each passes 4.5:1 on its system's ground and surface.
// Paper systems with grain need a little more, since grain lowers the contrast a viewer sees (statusPaper).
const status = { positive: o(0.53, 0.13, 150), negative: o(0.565, 0.18, 27) };
const statusPaper = { positive: o(0.495, 0.13, 150), negative: o(0.525, 0.18, 27) };
const statusDark = { positive: o(0.75, 0.14, 150), negative: o(0.68, 0.17, 27) };

export const SYSTEMS: System[] = [
  // ---------------------------------------------------------------- light
  {
    id: "studio", name: "Studio", mode: "light",
    accentMode: "fixed", allows: ["contact-shadow"],
    reference: "Apple product films and keynote slides: one subject, near-white space, one sentence per scene.",
    pattern: "Near-white grey ground, near-black type, one system blue kept for a link or a selected state. The product supplies all other colour.",
    personality: "Quiet and exact. One subject, a lot of space, one sentence at a time.",
    roles: { ...neutrals("light", 0.972, 286, 0.003), accent: o(0.55, 0.19, 255), accentText: o(0.55, 0.19, 255), onAccent: o(0.985, 0.002, 286),
      ...series("light", o(0.55, 0.19, 255), 286), ...status },
    fonts: { display: "Geist", text: "Geist" },
    type: { display: T("display", 0.13, 600, -0.03, 1.02), headline: T("display", 0.085, 600, -0.02, 1.06), body: T("text", 0.052, 400, -0.005, 1.3),
      label: T("text", 0.04, 500, 0, 1.2), caption: T("text", 0.044, 500, 0, 1.25) },
    margin: 0.09, columns: 6, radius: 28, stroke: 3,
    motion: { enter: [0.2, 0.8, 0.2, 1], move: [0.45, 0, 0.15, 1], exit: EXIT, frames: { enter: 30, move: 40, exit: 18, stagger: 6 },
      character: "Slow and certain: long ease-outs, a gentle push of 1-4 %, masks instead of fades for type.", transitions: "Cross-dissolve or a cut on a held frame; never a wipe." },
    texture: { grain: 0, note: "None. A tight contact shadow under a product is the only depth." },
    density: { maxWords: 7, minHoldBase: 1.6, minHoldPerWord: 0.3 },
    grammar: ["One subject per scene, centred or on a strong third.", "At most two type sizes on screen.", "Headlines wrap to two lines at most.", "Space is the design: at least 40 % of the frame is empty, on purpose."],
    kinds: ["launch", "app-demo", "ad", "presentation"], needs: "A product render or a real screenshot for the subject.",
  },
  {
    id: "spec", name: "Spec", mode: "light",
    accentMode: "ink", allows: [],
    reference: "Vercel's Geist and Ship visuals, Rauno Freiberg and Evil Rabbit: a visible grid, hairlines, crosshairs, mono labels.",
    pattern: "White, black and a grey scale of hairlines; colour only for status.",
    personality: "A technical drawing of a product. Every element sits on the grid, labelled.",
    roles: { ...neutrals("light", 0.985, 0, 0), accent: o(0.2, 0, 0), accentText: o(0.2, 0, 0), onAccent: o(0.985, 0, 0),
      ...series("light", o(0.2, 0, 0), 0), series1: o(0.2, 0, 0), series2: o(0.45, 0, 0), series3: o(0.62, 0, 0), series4: o(0.78, 0, 0), series5: o(0.9, 0, 0),
      ...status },
    fonts: { display: "Geist", text: "Geist", mono: "Geist Mono" },
    type: { display: T("display", 0.12, 600, -0.04, 1.0), headline: T("display", 0.07, 600, -0.025, 1.08), body: T("text", 0.046, 400, -0.005, 1.35),
      label: T("mono", 0.034, 400, 0, 1.2, true), caption: T("text", 0.042, 500, 0, 1.3) },
    margin: 0.07, columns: 12, radius: 6, stroke: 2,
    motion: { enter: EASE_OUT, move: IN_OUT, exit: EXIT, frames: { enter: 14, move: 22, exit: 10, stagger: 2 },
      character: "Crisp. Lines draw, labels type on, rows reveal 40 ms apart; nothing overshoots.", transitions: "Hard cuts on the grid; a hairline wipe at most." },
    texture: { grain: 0, note: "None. 1 px hairlines and small + crosshairs at grid corners." },
    density: { maxWords: 9, minHoldBase: 1.2, minHoldPerWord: 0.28 },
    grammar: ["Draw the grid: hairline rules and + marks where lines cross.", "Mono labels in the margins name what is shown.", "Numbers are tabular and large.", "Colour appears only as a status (positive, negative)."],
    kinds: ["changelog", "launch", "data-story", "tutorial"],
  },
  {
    id: "manual", name: "Manual", mode: "light",
    accentElements: { max: 2, note: "A frame may hold code and its run (the block map's pane stack). A code block is one accent element: its lit line and its teal literal values are its signature (codeBlock), and they stay teal. A terminal's result line is the second." },
    accentMode: "fixed", allows: [],
    reference: "Stripe's documentation and IBM Plex editorial pages: prose beside code, line numbers, one highlight colour.",
    pattern: "Warm white page, near-black text, one muted teal for the highlighted line.",
    personality: "A patient teacher. Code on one side, the explanation on the other, one line lit at a time.",
    roles: { ...neutrals("light", 0.975, 85, 0.006), accent: o(0.52, 0.09, 200), accentText: o(0.48, 0.09, 200), onAccent: o(0.985, 0.004, 85),
      ...series("light", o(0.52, 0.09, 200), 85), ...status },
    fonts: { display: "IBM Plex Serif", text: "IBM Plex Sans", mono: "IBM Plex Mono" },
    type: { display: T("display", 0.1, 500, -0.015, 1.06), headline: T("display", 0.066, 500, -0.01, 1.12), body: T("text", 0.045, 400, 0, 1.4),
      label: T("text", 0.036, 500, 0, 1.2), caption: T("mono", 0.045, 400, 0, 1.45) }, // caption: the code role; at body size, so code reads on a phone
    margin: 0.08, columns: 6, radius: 10, stroke: 2,
    motion: { enter: EASE_OUT, move: IN_OUT, exit: EXIT, frames: { enter: 12, move: 18, exit: 10, stagger: 3 },
      character: "Calm and readable: code types at a human rate, the highlight sweeps 300 ms, the view scrolls, never zooms.", transitions: "A scroll to the next block, or a cut." },
    texture: { grain: 0, note: "Thin rules only." },
    density: { maxWords: 12, minHoldBase: 1.8, minHoldPerWord: 0.3 },
    grammar: ["Code is real and shown at a readable size, with line numbers.", "One highlighted line at a time.", "Prose sits beside or under the code, never over it.", "Syntax colour uses four hues or fewer."],
    kinds: ["tutorial", "explainer", "app-demo"], needs: "Real code or a real API to show.",
  },
  {
    id: "ma", name: "Ma", mode: "light",
    accentMode: "fixed", allows: ["grain"],
    reference: "Kenya Hara's MUJI work and the Japanese idea of ma, meaningful emptiness.",
    pattern: "Warm paper, charcoal type, one unbleached natural tone as a block.",
    personality: "Silence. One small word or image in a large empty field, held long.",
    roles: { ...neutrals("light", 0.955, 85, 0.008), ink: o(0.27, 0.006, 70), inkMuted: o(0.5, 0.008, 70),
      accent: o(0.82, 0.02, 75), accentText: o(0.27, 0.006, 70), onAccent: o(0.27, 0.006, 70),
      ...series("light", o(0.27, 0.006, 70), 85), ...statusPaper },
    fonts: { display: "Shippori Mincho", text: "Zen Kaku Gothic New" },
    type: { display: T("display", 0.075, 500, 0.04, 1.4), headline: T("display", 0.056, 500, 0.04, 1.45), body: T("text", 0.045, 400, 0.06, 1.7), // body: the one line of a beat; raised from 0.04 to read on a phone (cap 12 px at 390 px wide)
      label: T("text", 0.034, 400, 0.12, 1.4), caption: T("text", 0.038, 400, 0.06, 1.6) },
    margin: 0.14, columns: 4, radius: 0, stroke: 1,
    motion: { enter: [0.33, 0, 0.2, 1], move: [0.4, 0, 0.2, 1], exit: [0.4, 0, 0.6, 1], frames: { enter: 54, move: 60, exit: 42, stagger: 12 },
      character: "Very slow fades of 1.5-2.5 s and long holds. Nothing bounces, nothing hurries.", transitions: "A slow dissolve through the paper." },
    texture: { grain: 0.03, note: "A faint paper fibre." },
    density: { maxWords: 6, minHoldBase: 2.4, minHoldPerWord: 0.4 },
    grammar: ["At least 70 % of the frame is empty.", "One word, one line or one small image per scene.", "Type is small and widely spaced; size never shouts.", "The natural-tone block may hold the one image."],
    kinds: ["quote-card", "launch", "title-sequence", "presentation"],
  },
  {
    id: "primary", name: "Primary", mode: "light", opaque: true,
    accentMode: "fixed", allows: ["grain"],
    reference: "Bauhaus posters (Herbert Bayer, Joost Schmidt): geometry, diagonals, three primaries on paper.",
    pattern: "Cream paper, black, and flat red, yellow and blue as blocks.",
    personality: "Geometry that explains. Circles, squares and triangles move in 90-degree steps.",
    roles: { ...neutrals("light", 0.94, 90, 0.02), ink: o(0.18, 0.006, 90), inkMuted: o(0.42, 0.01, 90),
      accent: o(0.55, 0.2, 27), accentText: o(0.5, 0.2, 27), onAccent: o(0.97, 0.01, 90),
      accent2: o(0.86, 0.17, 95), accent3: o(0.45, 0.17, 262),
      series1: o(0.55, 0.2, 27), series2: o(0.45, 0.17, 262), series3: o(0.86, 0.17, 95), series4: o(0.18, 0.006, 90), series5: o(0.72, 0.01, 90), ...statusPaper },
    fonts: { display: "Jost", text: "Jost" },
    type: { display: T("display", 0.13, 700, -0.01, 0.98, true), headline: T("display", 0.08, 700, 0, 1.0, true), body: T("text", 0.046, 500, 0, 1.3),
      label: T("text", 0.036, 600, 0.04, 1.2, true), caption: T("text", 0.042, 500, 0, 1.3) },
    margin: 0.07, columns: 6, radius: 0, stroke: 6,
    motion: { enter: [0.2, 0.9, 0.3, 1], move: [0.7, 0, 0.3, 1], exit: EXIT, frames: { enter: 10, move: 16, exit: 8, stagger: 3 },
      character: "Snappy and geometric: shapes slide on axes and turn in 90-degree steps; no bounce.", transitions: "A shape sweeps across and becomes the next frame." },
    texture: { grain: 0.04, note: "A slight print grain." },
    density: { maxWords: 6, minHoldBase: 1.3, minHoldPerWord: 0.3 },
    grammar: ["Build with circle, square and triangle only.", "Type sits on a 45- or 90-degree axis.", "Each colour has one meaning in the film.", "No shadows, no gradients."],
    kinds: ["explainer", "ad", "title-sequence", "presentation"],
    exceptions: [{ rule: "cream-with-warm-accent", reason: "Bauhaus posters are printed on cream stock with primary red; yellow and blue sit beside it, so it is not the cream-and-terracotta default." }],
  },
  {
    id: "riso", name: "Riso", mode: "light", step: 12, opaque: true,
    accentMode: "fixed", allows: ["halftone", "grain"],
    reference: "Risograph printing: two flat inks on uncoated paper that overprint into a third colour.",
    pattern: "Uncoated white paper, fluorescent pink and teal inks that overprint, riso black for type.",
    personality: "Printed by hand. Off-register layers stamp in one after another.",
    roles: { ...neutrals("light", 0.96, 95, 0.006), ink: o(0.23, 0.005, 0), inkMuted: o(0.45, 0.006, 0),
      accent: o(0.66, 0.2, 355), accentText: o(0.535, 0.2, 355), onAccent: o(0.21, 0.005, 0),
      accent2: o(0.58, 0.1, 200),
      series1: o(0.66, 0.2, 355), series2: o(0.58, 0.1, 200), series3: o(0.23, 0.005, 0), series4: o(0.8, 0.006, 95), series5: o(0.42, 0.06, 280), ...statusPaper },
    fonts: { display: "Bricolage Grotesque", text: "Space Grotesk" },
    type: { display: T("display", 0.13, 800, -0.03, 0.96), headline: T("display", 0.08, 700, -0.02, 1.02), body: T("text", 0.045, 500, 0, 1.3),
      label: T("text", 0.036, 600, 0, 1.2, true), caption: T("text", 0.042, 500, 0, 1.3) },
    margin: 0.07, columns: 6, radius: 0, stroke: 4,
    motion: { enter: [0.3, 1.2, 0.5, 1], move: [0.6, 0, 0.4, 1], exit: EXIT, frames: { enter: 6, move: 12, exit: 6, stagger: 4 },
      character: "Stamped: stepped motion at 12 fps, layers snapping in one by one, 1-3 px misregistration.", transitions: "A new ink layer stamps over the old one." },
    texture: { grain: 0.07, note: "Grain, halftone dots and slight misregistration between inks." },
    density: { maxWords: 6, minHoldBase: 1.2, minHoldPerWord: 0.3 },
    grammar: ["Two inks only, multiplied where they overlap.", "Shapes are flat; tone comes from halftone, not gradients.", "Type is ink, not a screen colour."],
    kinds: ["music-lyric", "ad", "title-sequence", "loop"],
  },
  {
    id: "cutout", name: "Cutout", mode: "light", step: 12, opaque: true,
    accentMode: "fixed", allows: ["grain"],
    reference: "Saul Bass title sequences (Anatomy of a Murder, North by Northwest): cut paper, one hot colour.",
    pattern: "Off-white paper, black cut shapes, one hot orange-red.",
    personality: "One idea per shape. Flat cut paper slides, rotates and builds the title.",
    roles: { ...neutrals("light", 0.95, 85, 0.012), ink: o(0.17, 0.004, 60), inkMuted: o(0.42, 0.01, 60),
      accent: o(0.62, 0.2, 40), accentText: o(0.53, 0.2, 38), onAccent: o(0.16, 0.004, 60),
      ...series("light", o(0.62, 0.2, 40), 85), ...statusPaper },
    fonts: { display: "Bebas Neue", text: "Archivo" },
    type: { display: T("display", 0.17, 400, 0.01, 0.92, true), headline: T("display", 0.1, 400, 0.02, 0.95, true), body: T("text", 0.045, 500, 0, 1.3),
      label: T("text", 0.036, 600, 0.06, 1.2, true), caption: T("text", 0.042, 500, 0, 1.3) },
    margin: 0.07, columns: 6, radius: 0, stroke: 8,
    motion: { enter: [0.7, 0, 0.3, 1], move: [0.7, 0, 0.3, 1], exit: [0.7, 0, 0.3, 1], frames: { enter: 12, move: 18, exit: 10, stagger: 4 },
      character: "Sharp moves, a stepped 12 fps feel, shapes sliding in from the frame edge.", transitions: "A black shape wipes across and becomes the next shape." },
    texture: { grain: 0.04, note: "Slight paper edge irregularity." },
    density: { maxWords: 5, minHoldBase: 1.2, minHoldPerWord: 0.3 },
    grammar: ["Silhouettes, not illustrations.", "Type is angled and fitted into shapes.", "One hot colour, used once per frame."],
    kinds: ["title-sequence", "trailer", "logo-sting", "quote-card"],
    exceptions: [{ rule: "cream-with-warm-accent", reason: "Saul Bass's palette is the reference itself: off-white stock, black and one orange-red, used as hard-edged cut paper, never as a soft UI accent." }],
  },
  {
    id: "mark", name: "Mark", mode: "light",
    accentMode: "brand", allows: [],
    reference: "Pentagram and Collins identity launch films: a mark built from modules on a visible grid.",
    pattern: "White, black and the brand colour, which the user supplies. The green here is only a placeholder.",
    personality: "Construction. The mark assembles from simple modules, then holds.",
    roles: { ...neutrals("light", 0.985, 0, 0), accent: o(0.5, 0.15, 150), accentText: o(0.5, 0.15, 150), onAccent: o(0.985, 0, 0),
      ...series("light", o(0.5, 0.15, 150), 0), ...status },
    fonts: { display: "Archivo", text: "Archivo" },
    type: { display: T("display", 0.12, 800, -0.035, 0.98), headline: T("display", 0.075, 700, -0.02, 1.02), body: T("text", 0.045, 500, 0, 1.3),
      label: T("text", 0.036, 600, 0, 1.2), caption: T("text", 0.042, 500, 0, 1.3) },
    margin: 0.08, columns: 8, radius: 0, stroke: 3,
    motion: { enter: [0.3, 1.25, 0.4, 1], move: IN_OUT, exit: EXIT, frames: { enter: 14, move: 20, exit: 10, stagger: 3 },
      character: "Modular: each part draws on by its outline, then fills and snaps to the grid with a small overshoot.", transitions: "The mark builds part by part on the grid; the grid stays until the lockup." },
    texture: { grain: 0, note: "None." },
    density: { maxWords: 5, minHoldBase: 1.4, minHoldPerWord: 0.3 },
    grammar: ["Show the grid while the mark builds, then hide it.", "Build from no more than five modules.", "End on the mark, held for two seconds."],
    kinds: ["logo-sting", "launch", "title-sequence"], needs: "The brand mark as SVG and the brand colour.",
  },
  {
    id: "raw", name: "Raw", mode: "light",
    accentMode: "fixed", allows: [],
    reference: "Brutalist web design: default fonts, visible borders, tables and links, set with precision.",
    pattern: "White, black and one link blue.",
    personality: "Unpolished on purpose, exact in its spacing. Text appears in one frame.",
    roles: { ...neutrals("light", 0.985, 0, 0), accent: o(0.46, 0.2, 264), accentText: o(0.46, 0.2, 264), onAccent: o(0.985, 0, 0),
      ...series("light", o(0.46, 0.2, 264), 0), ...status },
    fonts: { display: "Tinos", text: "Courier Prime", mono: "Space Mono" },
    type: { display: T("display", 0.11, 700, -0.01, 1.0), headline: T("display", 0.07, 700, 0, 1.05), body: T("text", 0.044, 400, 0, 1.35),
      label: T("mono", 0.036, 400, 0, 1.2), caption: T("text", 0.042, 400, 0, 1.3) },
    margin: 0.05, columns: 6, radius: 0, stroke: 3,
    motion: { enter: [0, 0, 1, 1], move: [0, 0, 1, 1], exit: [0, 0, 1, 1], frames: { enter: 1, move: 1, exit: 1, stagger: 2 },
      character: "Hard cuts and one-frame appearances; a blinking cursor is the only constant motion.", transitions: "Hard cuts only." },
    texture: { grain: 0, note: "None." },
    density: { maxWords: 12, minHoldBase: 1.0, minHoldPerWord: 0.25 },
    grammar: ["Borders and tables are visible structure.", "Text is left-aligned and unstyled beyond weight.", "Links are underlined blue; nothing else is coloured."],
    kinds: ["ad", "trailer", "changelog", "presentation"],
  },
  {
    id: "pop", name: "Pop", mode: "light",
    accentMode: "fixed", allows: [],
    reference: "Duolingo's brand motion: flat saturated colour, chunky buttons, squash and stretch.",
    pattern: "White ground, a saturated green, blue and orange for characters and buttons.",
    personality: "Friendly and bouncy. Big rounded shapes land with squash and stretch.",
    roles: { ...neutrals("light", 0.985, 250, 0.003), ink: o(0.3, 0.01, 250), inkMuted: o(0.5, 0.01, 250),
      accent: o(0.74, 0.2, 135), accentText: o(0.5, 0.15, 140), onAccent: o(0.25, 0.04, 140),
      accent2: o(0.7, 0.15, 235), accent3: o(0.77, 0.17, 62),
      series1: o(0.74, 0.2, 135), series2: o(0.7, 0.15, 235), series3: o(0.77, 0.17, 62), series4: o(0.3, 0.01, 250), series5: o(0.88, 0.01, 250), ...status },
    fonts: { display: "Nunito", text: "Nunito" },
    type: { display: T("display", 0.12, 900, -0.01, 1.0), headline: T("display", 0.08, 800, 0, 1.05), body: T("text", 0.048, 700, 0, 1.3),
      label: T("text", 0.038, 800, 0, 1.2), caption: T("text", 0.044, 700, 0, 1.3) },
    margin: 0.07, columns: 6, radius: 36, stroke: 6,
    motion: { enter: [0.34, 1.56, 0.64, 1], move: [0.5, 1.4, 0.4, 1], exit: EXIT, frames: { enter: 12, move: 16, exit: 8, stagger: 4 },
      character: "Springy: squash and stretch, overshoot on arrival, a little bounce.", transitions: "A big rounded shape scales up and becomes the next scene." },
    texture: { grain: 0, note: "Flat colour; buttons have a thick darker bottom edge." },
    density: { maxWords: 7, minHoldBase: 1.2, minHoldPerWord: 0.3 },
    grammar: ["Every interactive thing is a chunky rounded button with a bottom edge.", "One character or mascot leads.", "At most five colours on screen."],
    kinds: ["ad", "app-demo", "explainer", "wrapped"],
  },
  // ---------------------------------------------------------------- dark
  {
    id: "keynote", name: "Keynote", mode: "dark",
    accentMode: "fixed", allows: ["light-sweep", "rim-light"],
    reference: "Apple keynote and product films in black: one product, one line, a light sweep across the surface.",
    pattern: "Near-black ground, white type, grey secondary type, one system blue kept for a link or a selected state. The product supplies all other colour.",
    personality: "Theatre. A single subject emerges from black and is lit, slowly.",
    roles: { ...neutrals("dark", 0.13, 286, 0.002), accent: o(0.66, 0.16, 255), accentText: o(0.7, 0.15, 255), onAccent: o(0.13, 0.002, 286),
      ...series("dark", o(0.66, 0.16, 255), 286), ...statusDark },
    fonts: { display: "Geist", text: "Geist" },
    type: { display: T("display", 0.13, 600, -0.03, 1.02), headline: T("display", 0.085, 600, -0.02, 1.06), body: T("text", 0.05, 400, -0.005, 1.3),
      label: T("text", 0.04, 500, 0, 1.2), caption: T("text", 0.044, 500, 0, 1.25) },
    margin: 0.09, columns: 6, radius: 28, stroke: 3,
    motion: { enter: [0.2, 0.8, 0.2, 1], move: [0.45, 0, 0.15, 1], exit: EXIT, frames: { enter: 34, move: 44, exit: 20, stagger: 6 },
      character: "Slow push-ins, a light sweep across the subject, masked type reveals.", transitions: "Fade through black, or a cut on the beat." },
    texture: { grain: 0, note: "A thin rim light on the subject's edge. Never a glow or a coloured cloud behind it." },
    density: { maxWords: 6, minHoldBase: 1.6, minHoldPerWord: 0.3 },
    grammar: ["One subject per scene, centred.", "The ground stays flat black: no gradient, no glow.", "One line of type per scene."],
    kinds: ["launch", "ad", "trailer"], needs: "A product render or photograph for the subject.",
  },
  {
    id: "graphite", name: "Graphite", mode: "dark",
    accentMode: "fixed", allows: ["grain"],
    reference: "Linear's launch films and site: a quiet graphite interface, 1 px borders, real UI at readable size.",
    pattern: "Graphite ground, white type, a grey scale, one green for the one thing that matters.",
    personality: "A calm, dense product shown honestly. The UI is the hero; the camera tilts slightly.",
    roles: { ...neutrals("dark", 0.17, 270, 0.005), accent: o(0.74, 0.14, 160), accentText: o(0.78, 0.13, 160), onAccent: o(0.17, 0.005, 270),
      ...series("dark", o(0.74, 0.14, 160), 270), ...statusDark },
    fonts: { display: "Geist", text: "Geist" },
    type: { display: T("display", 0.11, 600, -0.035, 1.02), headline: T("display", 0.07, 600, -0.02, 1.08), body: T("text", 0.045, 400, -0.005, 1.35),
      label: T("text", 0.036, 500, 0, 1.2), caption: T("text", 0.042, 500, 0, 1.3) },
    margin: 0.07, columns: 12, radius: 12, stroke: 2,
    motion: { enter: EASE_OUT, move: IN_OUT, exit: EXIT, frames: { enter: 12, move: 22, exit: 10, stagger: 3 },
      character: "UI builds in 250-400 ms; panels slide on a slight 3D tilt; cuts land on the beat.", transitions: "Cut on the beat, or the camera glides to the next panel." },
    texture: { grain: 0.025, note: "A very fine grain. Borders are 1 px; never glowing." },
    density: { maxWords: 8, minHoldBase: 1.3, minHoldPerWord: 0.28 },
    grammar: ["Real UI, shown at a readable size, is the subject.", "A headline sits above or beside the UI, never over it.", "The accent marks one element per scene."],
    kinds: ["app-demo", "changelog", "launch"], needs: "Real screenshots, or the real UI built with uiWindow (the product's own names, rows and states). A built window counts as real UI: a product with no screenshots needs none.",
  },
  {
    id: "console", name: "Console", mode: "dark",
    accentMode: "fixed", allows: ["scanlines"],
    reference: "Terminals and command-line tools: a prompt, output line by line, a status bar, a phosphor colour.",
    pattern: "Black ground, off-white text, one phosphor amber.",
    personality: "Something is running. Commands type at a human rate and the output answers.",
    roles: { ...neutrals("dark", 0.14, 90, 0.003), ink: o(0.92, 0.01, 95), inkMuted: o(0.64, 0.008, 95),
      accent: o(0.8, 0.15, 75), accentText: o(0.8, 0.15, 75), onAccent: o(0.14, 0.003, 90),
      ...series("dark", o(0.8, 0.15, 75), 90), ...statusDark },
    fonts: { display: "JetBrains Mono", text: "JetBrains Mono" },
    type: { display: T("display", 0.09, 700, -0.02, 1.1), headline: T("display", 0.06, 700, -0.01, 1.15), body: T("text", 0.042, 400, 0, 1.45),
      label: T("text", 0.036, 400, 0, 1.3), caption: T("text", 0.04, 400, 0, 1.4) },
    margin: 0.06, columns: 6, radius: 8, stroke: 2,
    motion: { enter: [0, 0, 1, 1], move: [0.5, 0, 0.5, 1], exit: [0, 0, 1, 1], frames: { enter: 1, move: 12, exit: 1, stagger: 2 },
      character: "Characters type at a variable human rate; output appears line by line; the cursor blinks.", transitions: "A cut on Enter; the screen scrolls." },
    texture: { grain: 0, scanlines: 0.16, note: "Faint scanlines at low opacity. No bloom, no glow." },
    density: { maxWords: 14, minHoldBase: 1.4, minHoldPerWord: 0.25 },
    grammar: ["Everything is a prompt, a command or output.", "Output must be realistic, with real timing.", "The accent marks the prompt and the one result that matters."],
    kinds: ["tutorial", "app-demo", "changelog", "ad"],
    exceptions: [{ rule: "near-black-with-one-vivid-accent", reason: "Phosphor amber on black is the terminal's own medium, shown as text, not a decorative accent on a dark UI." }],
  },
  {
    id: "noir", name: "Noir", mode: "dark",
    accentMode: "ink", allows: ["shadow-bars", "grain"],
    reference: "Classic film noir: hard key light, venetian-blind shadow bars, black and white only.",
    pattern: "Black, white and a few greys; no colour at all.",
    personality: "Mystery. Hard light cuts across the type; shadows slide.",
    roles: { ...neutrals("dark", 0.1, 0, 0), ink: o(0.95, 0, 0), inkMuted: o(0.66, 0, 0),
      accent: o(0.95, 0, 0), accentText: o(0.95, 0, 0), onAccent: o(0.1, 0, 0),
      series1: o(0.99, 0, 0), series2: o(0.8, 0, 0), series3: o(0.62, 0, 0), series4: o(0.45, 0, 0), series5: o(0.3, 0, 0), ...statusDark },
    fonts: { display: "Playfair Display", text: "Bebas Neue" },
    type: { display: T("display", 0.12, 700, -0.01, 1.0), headline: T("display", 0.08, 700, 0, 1.05), body: T("text", 0.05, 400, 0.04, 1.2, true),
      label: T("text", 0.04, 400, 0.12, 1.2, true), caption: T("text", 0.046, 400, 0.06, 1.25, true) },
    margin: 0.08, columns: 6, radius: 0, stroke: 3,
    motion: { enter: [0.4, 0, 0.2, 1], move: [0.45, 0, 0.55, 1], exit: [0.6, 0, 0.8, 0.4], frames: { enter: 24, move: 40, exit: 16, stagger: 6 },
      character: "Slow lateral pushes; shadow bars slide across the frame; cuts land on the beat.", transitions: "A shadow sweeps the frame dark, then the next scene is lit." },
    texture: { grain: 0.08, note: "Film grain and a slight gate weave." },
    density: { maxWords: 6, minHoldBase: 1.6, minHoldPerWord: 0.3 },
    grammar: ["One hard light direction for the whole film.", "Shadow bars fall across type at a diagonal.", "Framing is asymmetric."],
    kinds: ["trailer", "quote-card", "title-sequence"],
  },
  {
    id: "title", name: "Title", mode: "dark",
    accentMode: "ink", allows: ["grain"],
    reference: "A24 trailer title cards: a small serif line in a lot of black, long silences, flash cuts.",
    pattern: "Black ground, white serif type, nothing else.",
    personality: "Restraint. A small line appears without animation and holds in silence.",
    roles: { ...neutrals("dark", 0.11, 90, 0.002), ink: o(0.93, 0.005, 90), inkMuted: o(0.6, 0.005, 90),
      accent: o(0.93, 0.005, 90), accentText: o(0.93, 0.005, 90), onAccent: o(0.11, 0.002, 90),
      series1: o(0.93, 0.005, 90), series2: o(0.75, 0.004, 90), series3: o(0.55, 0.004, 90), series4: o(0.4, 0.004, 90), series5: o(0.28, 0.004, 90), ...statusDark },
    fonts: { display: "Cormorant Garamond", text: "Cormorant Garamond" },
    type: { display: T("display", 0.075, 500, 0.02, 1.2), headline: T("display", 0.058, 500, 0.02, 1.25), body: T("text", 0.05, 500, 0.02, 1.4), // body: the tagline; raised from 0.044 to read on a phone (cap 12 px at 390 px wide)
      label: T("text", 0.034, 600, 0.2, 1.3, true), caption: T("text", 0.042, 500, 0.02, 1.35) },
    margin: 0.12, columns: 4, radius: 0, stroke: 1,
    motion: { enter: [0, 0, 1, 1], move: [0.45, 0, 0.55, 1], exit: [0, 0, 1, 1], frames: { enter: 1, move: 30, exit: 1, stagger: 8 },
      character: "No animation on type: it cuts in and holds. Silence and pacing do the work; flash cuts at the climax.", transitions: "Hard cuts, sometimes to black for a beat." },
    texture: { grain: 0.04, note: "A subtle grain." },
    density: { maxWords: 7, minHoldBase: 2.0, minHoldPerWord: 0.35 },
    grammar: ["One small centred line per card.", "Black holds between cards are part of the rhythm.", "The release line comes last, held."],
    kinds: ["trailer", "title-sequence", "quote-card"],
  },
  {
    id: "matte", name: "Matte", mode: "dark",
    accentMode: "fixed", allows: ["light-sweep", "contact-shadow", "rim-light", "grain", "reflection"],
    reference: "Studio product renders (ManvsMachine, Buck): a matte object on a dark floor, one metal tone, a camera orbit.",
    pattern: "Very dark grey, matte dark objects, one champagne metal tone.",
    personality: "Material. The object turns under a passing light; type is small and quiet.",
    roles: { ...neutrals("dark", 0.17, 60, 0.003), ink: o(0.94, 0.006, 80), inkMuted: o(0.66, 0.006, 80),
      accent: o(0.78, 0.04, 80), accentText: o(0.8, 0.04, 80), onAccent: o(0.17, 0.003, 60),
      ...series("dark", o(0.78, 0.04, 80), 60), ...statusDark },
    fonts: { display: "Geist", text: "Geist" },
    type: { display: T("display", 0.09, 500, -0.02, 1.05), headline: T("display", 0.06, 500, -0.01, 1.1), body: T("text", 0.042, 400, 0, 1.35),
      label: T("text", 0.034, 500, 0.06, 1.2, true), caption: T("text", 0.04, 400, 0, 1.3) },
    margin: 0.09, columns: 6, radius: 0, stroke: 2,
    motion: { enter: [0.3, 0, 0.2, 1], move: [0.45, 0, 0.55, 1], exit: EXIT, frames: { enter: 30, move: 60, exit: 20, stagger: 6 },
      character: "A slow orbit and a light that passes across the surface; macro moves.", transitions: "A cut on the beat, or the light sweep becomes the next scene." },
    texture: { grain: 0.02, reflection: 0.2, note: "Matte surfaces and a specular edge, and a soft reflection in the floor. No gradient environment." },
    density: { maxWords: 5, minHoldBase: 1.6, minHoldPerWord: 0.3 },
    grammar: ["The product is the subject, on a floor with a soft reflection.", "Type is small, in a corner."],
    kinds: ["launch", "ad"], needs: "A 3D model or a product render. Deferred: needs real materials.",
  },
  {
    id: "kinetic", name: "Kinetic", mode: "dark",
    accentMode: "fixed", allows: ["motion-blur"], bleed: ["display"],
    reference: "DIA Studio's kinetic typography: words fill the frame, scaled, cropped and stacked to the beat.",
    pattern: "Black, white and one cobalt blue used on a single word.",
    personality: "Type is the motion. Words fill the frame and cut on the beat.",
    roles: { ...neutrals("dark", 0.12, 0, 0), ink: o(0.97, 0, 0), inkMuted: o(0.7, 0, 0),
      accent: o(0.52, 0.2, 262), accentText: o(0.66, 0.18, 262), onAccent: o(0.97, 0, 0),
      ...series("dark", o(0.52, 0.2, 262), 0), ...statusDark },
    fonts: { display: "Archivo Black", text: "Archivo" },
    type: { display: T("display", 0.24, 400, -0.04, 0.86, true), headline: T("display", 0.14, 400, -0.03, 0.9, true), body: T("text", 0.05, 600, 0, 1.2),
      label: T("text", 0.04, 700, 0.02, 1.1, true), caption: T("text", 0.05, 600, 0, 1.2) },
    margin: 0.04, columns: 4, radius: 0, stroke: 4,
    motion: { enter: [0.16, 1, 0.3, 1], move: [0.83, 0, 0.17, 1], exit: [0.7, 0, 0.84, 0], frames: { enter: 5, move: 9, exit: 4, stagger: 2 },
      character: "Fast and percussive: 4-8 frames per word, scale pops, masked rolls, wraps around the frame.", transitions: "Cut on the beat; a word grows to fill the frame and becomes the next ground." },
    texture: { grain: 0, note: "None." },
    density: { maxWords: 4, minHoldBase: 0.25, minHoldPerWord: 0.12 },
    grammar: ["Words fill the frame edge to edge; cropping is allowed.", "Every cut lands on a beat.", "The accent colours one word per phrase."],
    kinds: ["kinetic-type", "music-lyric", "ad", "title-sequence"],
  },
  {
    id: "courtside", name: "Courtside", mode: "dark",
    accentMode: "fixed", allows: ["motion-blur", "grain"], bleed: ["display"],
    reference: "Nike campaign posters: a huge condensed headline over a subject, one hot colour, high contrast.",
    pattern: "Black, white and one volt yellow-green.",
    personality: "Momentum. A condensed headline slams over a subject; cuts whip on the beat.",
    roles: { ...neutrals("dark", 0.13, 0, 0), ink: o(0.97, 0, 0), inkMuted: o(0.7, 0, 0),
      accent: o(0.9, 0.2, 118), accentText: o(0.9, 0.2, 118), onAccent: o(0.13, 0, 0),
      ...series("dark", o(0.9, 0.2, 118), 0), ...statusDark },
    fonts: { display: "Anton", text: "Barlow Condensed" },
    type: { display: T("display", 0.2, 400, -0.01, 0.88, true), headline: T("display", 0.12, 400, 0, 0.92, true), body: T("text", 0.05, 600, 0.01, 1.15, true),
      label: T("text", 0.04, 700, 0.06, 1.1, true), caption: T("text", 0.048, 600, 0.02, 1.15, true) },
    margin: 0.05, columns: 6, radius: 0, stroke: 6,
    motion: { enter: [0.16, 1, 0.3, 1], move: [0.83, 0, 0.17, 1], exit: [0.7, 0, 0.84, 0], frames: { enter: 6, move: 10, exit: 5, stagger: 2 },
      character: "Fast pushes, whip transitions, hard cuts on the beat.", transitions: "A whip pan with motion blur in the direction of travel, or a hard cut." },
    texture: { grain: 0.05, note: "Grain and a contrast boost." },
    density: { maxWords: 5, minHoldBase: 0.6, minHoldPerWord: 0.15 },
    grammar: ["One condensed headline per scene, as large as it fits.", "The volt marks the one word or number that wins.", "A real subject (photo or silhouette) sits behind the type."],
    kinds: ["ad", "wrapped", "trailer"], needs: "A photo or silhouette of the subject.",
    exceptions: [{ rule: "near-black-with-one-vivid-accent", reason: "Volt on black is the sports-campaign reference itself, used on one word or number, never as a UI accent or a glow." }],
  },
  {
    id: "schematic", name: "Schematic", mode: "dark",
    accentMode: "fixed", allows: [],
    reference: "IBM's Carbon design system in its darkest theme: grey 100, IBM Plex, hairline diagrams with labels.",
    pattern: "Grey-black ground, white and grey type, one IBM blue for the active path.",
    personality: "Engineering. Systems drawn in white hairlines, labelled and measured.",
    roles: { ...neutrals("dark", 0.2, 0, 0), accent: o(0.52, 0.19, 263), accentText: o(0.7, 0.15, 263), onAccent: o(0.97, 0, 0),
      ...series("dark", o(0.52, 0.19, 263), 0), ...statusDark },
    fonts: { display: "IBM Plex Sans", text: "IBM Plex Sans", mono: "IBM Plex Mono" },
    type: { display: T("display", 0.1, 600, -0.02, 1.05), headline: T("display", 0.066, 600, -0.01, 1.1), body: T("text", 0.044, 400, 0, 1.4),
      label: T("mono", 0.034, 400, 0, 1.25), caption: T("text", 0.042, 400, 0, 1.35) },
    accentElements: { max: 1, note: "One accent element in a frame: the active path (its lines and the labels that sit on it read as one part). The rest of the drawing is in ink." },
    margin: 0.07, columns: 8, radius: 0, stroke: 2,
    motion: { enter: [0.2, 0, 0.38, 0.9], move: [0.4, 0.14, 0.3, 1], exit: [0.2, 0, 1, 0.9], frames: { enter: 12, move: 24, exit: 10, stagger: 3 },
      character: "Productive: lines draw, labels follow, the active path lights in blue.", transitions: "The camera pans along the diagram to the next part." },
    texture: { grain: 0, note: "A hairline grid. Never a blue blueprint tint." },
    density: { maxWords: 10, minHoldBase: 1.5, minHoldPerWord: 0.3 },
    grammar: ["Diagrams in white hairlines with mono labels.", "The blue marks only the active path or the part being explained.", "Dimension lines and callout numbers, as in a schematic."],
    kinds: ["explainer", "data-story", "tutorial", "presentation"],
  },
  {
    id: "nocturne", name: "Nocturne", mode: "dark",
    accentMode: "fixed", allows: ["grain"],
    reference: "Editorial studio work in dark mode (Instrument, Koto): large serif statements, a small sans caption, a thin rule.",
    pattern: "Warm black ground, warm white serif type, one stone grey.",
    personality: "A considered statement. Words fade in one by one in a large serif.",
    roles: { ...neutrals("dark", 0.16, 60, 0.004), ink: o(0.93, 0.012, 85), inkMuted: o(0.64, 0.01, 85),
      accent: o(0.8, 0.04, 70), accentText: o(0.8, 0.04, 70), onAccent: o(0.16, 0.004, 60),
      ...series("dark", o(0.8, 0.04, 70), 60), ...statusDark },
    // Instrument lacks ± ² ³ as well: Noto Sans has them, Noto Sans Math has the rest.
    fonts: { display: "Instrument Serif", text: "Instrument Sans", fallback: ["Noto Sans", "Noto Sans Math"] },
    type: { display: T("display", 0.12, 400, -0.02, 1.02), headline: T("display", 0.08, 400, -0.015, 1.06), body: T("text", 0.044, 400, 0, 1.4),
      label: T("text", 0.034, 500, 0.08, 1.2, true), caption: T("text", 0.042, 400, 0, 1.35) },
    margin: 0.1, columns: 6, radius: 0, stroke: 1,
    motion: { enter: [0.25, 0.1, 0.25, 1], move: IN_OUT, exit: EXIT, frames: { enter: 16, move: 30, exit: 12, stagger: 3 },
      character: "Word-by-word fades 80 ms apart, 500 ms ease-out; the camera barely moves.", transitions: "A slow fade through the ground." },
    texture: { grain: 0.03, note: "A slight grain." },
    density: { maxWords: 12, minHoldBase: 1.8, minHoldPerWord: 0.32 },
    grammar: ["A large serif statement is the image.", "A small sans caption names the speaker or source, under a thin rule.", "No decoration."],
    kinds: ["quote-card", "presentation", "captioned-clip", "launch"],
  },
];

/** Resolved palettes (hex), keyed by system id. */
// The project's own systems (own.ts) join the table after the built-ins.
for (const o of OWN_SYSTEMS) if (!SYSTEMS.some((s) => s.id === o.system.id)) SYSTEMS.push(o.system);

export const SYSTEM_PALETTES = Object.fromEntries(SYSTEMS.map((s) => [s.id, build({ name: s.name, pattern: s.pattern, reference: s.reference, roles: s.roles as never })]));
